import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NativeSession } from '../../src/native-session.js';
import { composeNative } from '../../src/native-runtime.js';
import { ModelService,type InstalledAdapter } from '../../src/model-service.js';
import { createNativeFixture } from './native-fixture.js';
import { LocalPayloadSchema } from '../../src/test-adapter.js';
import { CapsuleFactsSchema,AuthorizedContextCompiler,capsuleFactsOf,TaskContextSourceStore,type ContextSourcePort } from '../../src/context.js';
import { ProfileRegistry,ApprovalRulesSchema,AUTO_CHOICE,type ProfileChoice } from '../../src/profile.js';
import { TaskCapsuleSchema } from '../../src/schema.js';
import { hash } from '../../src/model-repository.js';
import { demand } from '../../src/errors.js';
import type { EncodedRequest,TaskCapsule,OperatingProfile,OriginalCall } from '../../src/contracts.js';
import type { LocalAdapterClient,Schedule } from '../../src/test-adapter.js';

export type ProfileJourneyFixture=Awaited<ReturnType<typeof createNativeFixture>>;
export const expires=()=>new Date(Date.now()+60_000).toISOString();
export const facts=(input:string)=>CapsuleFactsSchema.parse({requirements:[input],evidence:[],hypotheses:['Unresolved H1'],uncertainty:['Uncertain U1'],failedPlans:['Failed F1'],pendingOperations:[],artifacts:[{artifactId:randomUUID(),revision:1,digest:hash('artifact')}],checks:[{checkId:randomUUID(),artifactDigest:hash('artifact'),status:'unknown'}],nextSafeAction:'Verify exact local obligation'});
export function captured(request:EncodedRequest){const payload=LocalPayloadSchema.parse(JSON.parse(request.payload));const value=JSON.parse(payload.text) as {profile:OperatingProfile;capsule:TaskCapsule};return {payload,profile:value.profile,capsule:TaskCapsuleSchema.parse(value.capsule)};}
/** Installed planning and owner fault ports only. Every ordinary call still enters
 * NativeSession -> atomic model prepare/claim -> the real restricted process.
 * No direct accept is used here except inside the installed dispatch port. */
export function journey(n:ProfileJourneyFixture,options:{profiles?:ProfileRegistry;compiler?:AuthorizedContextCompiler;response?:'text'|'tool';message?:string;privateState?:(capsule:TaskCapsule,p:OperatingProfile)=>Promise<string|null>;fullFacts?:boolean;schedule?:Partial<Schedule>;beforeAccept?:(r:EncodedRequest)=>Promise<void>;client?:LocalAdapterClient;extra?:readonly InstalledAdapter[]}={}){
 const f=n.f,client=options.client??f.adapterClient(),base=options.profiles?composeNative({uow:f.uow,bindingFor:f.bindingFor,pins:n.pins,profile:n.profile,profiles:options.profiles,adapter:client,descriptors:n.descriptors,admission:n.native.ports.admission}):n.native,requests:EncodedRequest[]=[],capsules:TaskCapsule[]=[],compiler=options.compiler??base.compiler;
 const port={accept:async(r:EncodedRequest)=>{requests.push(r);await options.beforeAccept?.(r);await f.schedule(r.original,{usage:'manual',...options.schedule});const result=await client.accept(r);if(options.schedule?.usage!=='never'){await f.finalize(r.original);return client.lookup(r.original);}return result;},lookup:client.lookup.bind(client),cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)};
 const models=new ModelService(base.models.model,base.models.usage,[{ownerId:f.ownerId,route:n.profile.route,profileDigest:n.profile.profileDigest,port,result:client.result.bind(client)},...options.extra??[]]);
 const encode:typeof n.native.ports.encode=async(scope,s,p,input,original)=>{
  if(!options.fullFacts&&!options.privateState&&!options.compiler&&options.response!=='tool')return base.ports.encode(scope,s,p,input,original);
  const refs=n.descriptors.get(s.binding.sessionId)!;
  const capsule=await compiler.compile(scope,{binding:s.binding,profile:p,descriptors:refs,facts:facts(input),crossThreadRecall:false});capsules.push(capsule);
  return compiler.encode(scope,{capsule,profile:p,descriptors:refs,original:{...original,requestDigest:hash('pending')},outputCap:s.admission.need.outputCap,durationCapMs:s.admission.need.durationCapMs,dispatchEpoch:1,response:options.response??'text',toolArguments:options.response==='tool'?{message:options.message??input}:null,privateState:await options.privateState?.(capsule,p)??null});
 };
 const session=new NativeSession(base.repository,models,{...base.ports,profiles:options.profiles??n.profiles,encode});
 const turn=async(a:Awaited<ReturnType<typeof n.task>>,input='controlled answer',choice:ProfileChoice|null=null)=>session.requestTurn(a.scope,{sessionId:a.sessionId,key:randomUUID(),expectedRevision:(await session.inspect(a.scope,a.sessionId)).revision,expiresAt:expires(),input,choice});
 return {session,models,requests,capsules,turn};
}
export function inventory(n:ProfileJourneyFixture,changes:{rules?:Partial<ReturnType<typeof ApprovalRulesSchema.parse>>;available?:boolean;approved?:boolean;profile?:OperatingProfile;qualification?:typeof n.qualification;clock?:string}={}){
 const p=changes.profile??n.profile,rules=()=>ApprovalRulesSchema.parse({schemaVersion:1,providers:[p.provider],routes:[p.route],regions:[p.region],dataPolicies:[p.dataPolicy],runtimeProfiles:[p.runtimeRequirements.profileId],...changes.rules});
 return new ProfileRegistry(n.q,rules,[{profile:p,qualification:changes.qualification??n.qualification,organizationApproved:changes.approved??true,available:changes.available??true}],{Fast:[p.profileId],Balanced:[p.profileId],Thorough:[p.profileId]});
}
export async function requestsFor(n:ProfileJourneyFixture,runId:string):Promise<EncodedRequest[]>{return (await n.f.admin.query("SELECT a.request FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.run_id=$1 ORDER BY (o.record->>'sessionTurn')::bigint,a.ordinal",[runId])).rows.map(r=>r.request as EncodedRequest);}
export async function proveReceipt(n:ProfileJourneyFixture,r:EncodedRequest){const row=await n.f.journal(r.original);assert.ok(row);assert.deepEqual(row.request,r);assert.equal(row.status,'settled');assert.equal(row.receipt.original.requestDigest,r.original.requestDigest);assert.equal(row.receipt.measuredUnits,2+Buffer.byteLength(r.payload)+Buffer.byteLength(row.output));const settled=(await n.f.admin.query('SELECT amount FROM fabric.usage_settlements WHERE reservation_id=$1',[r.original.reservationId])).rows;assert.equal(settled.length,1);assert.equal(Number(settled[0].amount),row.receipt.measuredUnits);return row;}
export async function noDispatch(n:ProfileJourneyFixture,work:()=>Promise<unknown>){const before=await n.f.counters();const result=await work();const after=await n.f.counters();assert.equal(after['accept']??0,before['accept']??0);assert.equal(after['acceptance']??0,before['acceptance']??0);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});return result;}
export function instrumentSources(n:ProfileJourneyFixture,transform?:Partial<ContextSourcePort>,catalogue?:readonly import('../../src/context.js').SourceDescriptor[]){let retrievals=0,current=0;const ds=catalogue??[...new Map([...n.descriptors.values()].flat().map(d=>[d.sourceId,d])).values()],store=new TaskContextSourceStore(ds.map(d=>({sourceId:d.sourceId,tenantId:d.scope.tenantId,spaceId:d.scope.spaceId,taskId:d.sourceTaskId})));
 const sources:ContextSourcePort={current:async(...args)=>{current++;return transform?.current?transform.current(...args):store.current(...args);},retrieve:async(...args)=>{retrievals++;return transform?.retrieve?transform.retrieve(...args):store.retrieve(...args);}};
 const compiler=new AuthorizedContextCompiler(n.f.uow,sources,{authorize:async(tx,scope,b,p)=>{const row=(await tx.query('SELECT fabric.model_current($1,$2,true) AS binding',[b.runId,p.profileDigest])).rows[0]?.['binding'] as {record:unknown}|undefined;demand(row&&hash(row.record)===hash(b),'CHECK_BINDING_MISMATCH');demand(scope.actorId===b.actorId,'UNAUTHORIZED');const selected=n.profiles.select({need:n.need,pins:b.versions,now:new Date().toISOString(),choice:{...AUTO_CHOICE,pin:p.profileId}});demand(selected.status==='selected'&&selected.profile.profileDigest===p.profileDigest,'QUALIFICATION_MISMATCH');}});
 return {compiler,store,retrievals:()=>retrievals,current:()=>current};
}
export const sameFacts=(a:TaskCapsule,b:TaskCapsule)=>assert.deepEqual(capsuleFactsOf(a),capsuleFactsOf(b));
export const original=(n:ProfileJourneyFixture,r:EncodedRequest):OriginalCall=>({...n.f.original(),operationId:r.original.operationId});
