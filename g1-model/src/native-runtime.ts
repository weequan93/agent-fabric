import { NativeComputer } from './native-computer.js';
import { TaskContextSourceStore,AuthorizedContextCompiler,type SourceDescriptor } from './context.js';
import { NativeContext } from './native-context.js';
import { NativeSession,type NativePorts } from './native-session.js';
import { NativeRepository } from './native-repository.js';
import { ModelRepository,type CurrentModelAuthority,hash } from './model-repository.js';
import { UsageRepository } from './usage-repository.js';
import { ModelService } from './model-service.js';
import type { ProfileRegistry } from './profile.js';
import { OperatingProfileSchema } from './schema.js';
import { LocalAdapterClient } from './test-adapter.js';
import { demand } from './errors.js';
import type { ScopeBindingLookup } from '../../g1-identity/src/contracts.js';
import type { AsyncUnitOfWork,VersionPins,OperatingProfile,SqlTransaction,VerifiedScope,TaskCallBinding } from './contracts.js';
/** Trusted local composition. No operator credential, URL, payer or source registry input. */
export function composeNative(input:{uow:AsyncUnitOfWork;bindingFor:ScopeBindingLookup;pins:VersionPins;profile:OperatingProfile;profiles:Pick<ProfileRegistry,'select'>&Partial<Pick<ProfileRegistry,'selectEquivalent'>>;adapter:LocalAdapterClient;additionalAdapters?:readonly {profile:OperatingProfile;adapter:LocalAdapterClient}[];descriptors:ReadonlyMap<string,readonly SourceDescriptor[]>;admission?:NativePorts['admission'];publishChunk?:NativePorts['publishChunk']}){
 // Snapshot trusted channels once. Qualification and dispatch use these exact
 // profile/owner bindings; commands cannot install or replace a destination.
 const channels=[{profile:input.profile,adapter:input.adapter},...input.additionalAdapters??[]].map(c=>Object.freeze({profile:OperatingProfileSchema.parse(c.profile),adapter:c.adapter}));
 demand(new Set(channels.map(c=>c.profile.profileId)).size===channels.length,'CHECK_BINDING_MISMATCH');
 const descriptorsFor=(id:string)=>{const values=input.descriptors.get(id);demand(values,'UNAUTHORIZED');return values;};
 const sourceStore=()=>{
  const unique=new Map<string,{sourceId:string;tenantId:string;spaceId:string;taskId:string}>();
  for(const d of [...input.descriptors.values()].flat()){
   const binding={sourceId:d.sourceId,tenantId:d.scope.tenantId,spaceId:d.scope.spaceId,taskId:d.sourceTaskId},old=unique.get(d.sourceId);demand(!old||hash(old)===hash(binding),'CHECK_BINDING_MISMATCH');unique.set(d.sourceId,binding);
  }
  return new TaskContextSourceStore([...unique.values()]);
 };
 // Accounting recovery binds to the recorded request, not the initial default
 // profile. Context/profile eligibility is rechecked at every disclosure/admission.
 const base:CurrentModelAuthority={async assertCurrent(_tx,scope,b,_r){demand(scope.actorId===b.actorId&&scope.payerId===b.payerId&&hash(b.versions)===hash(input.pins),'UNAUTHORIZED');}};
 const authorizeBinding=async(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding,p:OperatingProfile,admission:boolean)=>{
  demand(scope.actorId===b.actorId&&scope.payerId===b.payerId,'UNAUTHORIZED');
  demand(hash(b.versions)===hash(input.pins),'CHECK_BINDING_MISMATCH');
  const row=(await tx.query('SELECT fabric.model_current($1,$2,$3) AS binding',[b.runId,p.profileDigest,admission])).rows[0]?.['binding'] as {record:unknown}|undefined;demand(row&&hash(row.record)===hash(b),'CHECK_BINDING_MISMATCH');
 };
 const compiler=new AuthorizedContextCompiler(input.uow,{current:(...args)=>sourceStore().current(...args),retrieve:(...args)=>sourceStore().retrieve(...args)},{async authorize(tx,scope,b,p){
  await authorizeBinding(tx,scope,b,p,true);
  const selected=input.profiles.select({need:{schemaVersion:1,inputModalities:['text'],outputModalities:['text'],toolDialect:p.capabilities.toolDialect,schemaDialect:p.capabilities.schemaDialect,streamText:true,streamToolArguments:false,contextBytes:1,outputCap:32,durationCapMs:1000,usage:true,cancellation:true,privateState:false,optionalFeatures:[],executionClass:'service',runtimeCapabilities:['model-text']},pins:b.versions,now:new Date().toISOString(),choice:{schemaVersion:1,pin:p.profileId,preference:'Balanced',allowEquivalentFallback:false}});
  demand(selected.status==='selected'&&selected.profile.profileDigest===p.profileDigest,'QUALIFICATION_MISMATCH');
 },authorizePreserved:(tx,scope,b,p)=>authorizeBinding(tx,scope,b,p,false)});
 const context=new NativeContext(compiler,descriptorsFor,base,input.uow),repository=new NativeRepository(input.uow,input.bindingFor);
 const currentRequest:CurrentModelAuthority={async assertCurrent(tx,scope,b,r){
  await context.assertCurrent(tx,scope,r);const s=await repository.load(tx,scope,b.sessionId);
  const selected=input.profiles.select({need:s.admission.need,pins:s.binding.versions,now:new Date().toISOString(),choice:s.control.choice});
  demand(selected.status==='selected'&&selected.profile.profileDigest===r.profileDigest,'MODEL_UNAVAILABLE');
  // The installed current approval/resource owner must still permit the work
  // after later locks and immediately before dispatch. This is a read of its
  // authority, not a simulated computer preflight advancement.
  if(input.admission)demand(await input.admission(tx,scope,s)===null,'UNAUTHORIZED');
  else demand(!s.admission.approvalRequired&&!s.admission.targetEffect,'UNAUTHORIZED');
 }};
 const model=new ModelRepository(input.uow,currentRequest),usage=new UsageRepository(input.uow,base);
 const models=new ModelService(model,usage,channels.map(c=>({ownerId:c.adapter.ownerId,route:c.profile.route,profileDigest:c.profile.profileDigest,port:c.adapter,result:c.adapter.result.bind(c.adapter)})));
 const computer=new NativeComputer();
 const ports:NativePorts={profiles:input.profiles,encode:context.encode.bind(context),assertOutput:(tx,scope,s,r)=>currentRequest.assertCurrent(tx,scope,s.binding,r),assertControl:async(tx,scope,s,p)=>{
  if(input.admission)demand(await input.admission(tx,scope,s)!=='permission','UNAUTHORIZED');
  const estimate=await context.assertControl(tx,scope,s,p);
  if(input.admission)demand(await input.admission(tx,scope,s)!=='permission','UNAUTHORIZED');
  return estimate;
 },
  admission:async(tx,scope,s)=>{if(input.admission){const reason=await input.admission(tx,scope,s);if(reason)return reason;}else if(s.admission.approvalRequired||s.admission.targetEffect)return 'approval';return computer.admit(tx,scope,s);},
  // Conservative control admission; exact JSON/profile/capsule encoded bytes are
  // reserved again at the next explicit call. Resume cannot widen input scope.
  resumeEstimate:(s,limit)=>s.admission.need.contextBytes+limit+s.admission.need.outputCap+2,
  ...(input.publishChunk?{publishChunk:input.publishChunk}:{})};
 return {session:new NativeSession(repository,models,ports),models,repository,context,compiler,ports};
}
