import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { OriginalCallSchema } from './schema.js';
import type { OriginalCall } from './contracts.js';
import { createIdentityScopeVerifier } from '../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup,AuthenticatedUnitOfWork } from '../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../g1-foundations/src/postgres-uow.js';
import { QualificationRegistry,localQualificationPins } from './qualification.js';
import { ProfileRegistry,ProfileChoiceSchema,ApprovalRulesSchema,type ModelSelection } from './profile.js';
import { VersionPinsSchema,OperatingProfileSchema } from './schema.js';
import { composeNative } from './native-runtime.js';
import { LocalAdapterClient } from './test-adapter.js';
import { AdmissionSchema } from './native-repository.js';
import { operatorInspect,operatorPreflight } from './operator-view.js';
import { ResourceRepository } from './resource-repository.js';
import { object,uuid,nullable,body,boolean } from './decoder.js';
import { demand,safeFailure } from './errors.js';
import type { SourceDescriptor } from './context.js';
const key='FABRIC_MODEL_NATIVE_SERVICE',config=JSON.parse(process.env[key]??'null') as {marker:string;root:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string;url:string;transportToken:string;ownerId:string;profile:unknown;pins:unknown;additionalProfiles?:{profile:unknown;url:string;ownerId:string;available?:boolean}[];approvedEquivalentRetries?:readonly (readonly [string,string])[];resourceOwnerId?:string;approvalOwnerInstalled?:boolean;descriptors:readonly [string,readonly SourceDescriptor[]][]};
demand(config&&process.argv[2]===config.marker);delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const profile=OperatingProfileSchema.parse(config.profile),pins=VersionPinsSchema.parse(config.pins),controller=new pg.Pool({connectionString:config.controllerDsn,max:8,application_name:'model-native-'+config.marker}),authorityPool=new pg.Pool({connectionString:config.authorityDsn,max:8});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authorityPool)});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:scopes.bindingFor.bind(scopes)}),adapter=new LocalAdapterClient(config.url,config.transportToken,config.ownerId);
const channels=Object.freeze([{profile,adapter,available:true},...(config.additionalProfiles??[]).map(e=>Object.freeze({profile:OperatingProfileSchema.parse(e.profile),adapter:new LocalAdapterClient(e.url,config.transportToken,e.ownerId),available:boolean.parse(e.available??false)}))]);
const approvedRetries=Object.freeze((config.approvedEquivalentRetries??[]).map(pair=>{demand(pair.length===2);const from=uuid.parse(pair[0]),to=uuid.parse(pair[1]);demand(from!==to&&channels.some(c=>c.profile.profileId===from)&&channels.some(c=>c.profile.profileId===to));return Object.freeze([from,to] as const);}));
let registry:ProfileRegistry|undefined;
const profiles={select:(input:Parameters<ProfileRegistry['select']>[0]):ModelSelection=>registry?registry.select(input):{status:'waiting',reason:'model-unavailable',refusal:'QUALIFICATION_MISMATCH',choiceLabel:'Auto - organization approved',allowedNextActions:['switch-profile','contact-administrator'],dispatchAllowed:false},selectEquivalent:(input:Parameters<ProfileRegistry['selectEquivalent']>[0]):ModelSelection=>{demand(registry,'QUALIFICATION_MISMATCH');return registry.selectEquivalent(input);}};
const runtime=composeNative({uow,bindingFor:scopes.bindingFor.bind(scopes),pins,profile,profiles,adapter,additionalAdapters:channels.slice(1),descriptors:new Map(config.descriptors),...(config.approvalOwnerInstalled?{admission:async(_tx:unknown,_scope:unknown,s:{admission:{approvalRequired:boolean;targetEffect:boolean};binding:{sessionId:string}})=>s.admission.approvalRequired&&(await fixtureControl('approval',null,undefined,s.binding.sessionId))!==true?'approval' as const:s.admission.targetEffect?'approval' as const:null}:{})});
// Explicit test-lifecycle qualification uses the independent fixture owner,
// never an operator-posted observation or an imported qualification record.
const controls=new Map<string,{resolve:(value:unknown)=>void;reject:()=>void}>();
async function fixtureControl(action:string,original:OriginalCall|null,durationMs?:number,controlId?:string,profileId?:string):Promise<unknown>{
 const requestId=randomUUID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{controls.delete(requestId);reject(new Error('Fixture control unavailable'));},5000);
  controls.set(requestId,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:()=>{clearTimeout(timer);reject(new Error('Fixture control failed'));}});
  process.send?.({kind:'probe-control',requestId,action,original,durationMs,controlId,profileId});
 });
}
const resources=config.resourceOwnerId?new ResourceRepository(uow,{ownerId:config.resourceOwnerId,receipt:id=>fixtureControl('resourceReceipt',null,undefined,id),suspension:id=>fixtureControl('resourceSuspension',null,undefined,id)}):null;
let active=0;
process.on('message',(raw:unknown)=>{
 const m=raw as {kind:string;requestId:string;input:unknown;result:unknown;failed:boolean};if(!m||typeof m.requestId!=='string')return;
 if(m.kind==='probe-response'){const pending=controls.get(m.requestId);controls.delete(m.requestId);if(pending)m.failed?pending.reject():pending.resolve(m.result);return;}
 process.send?.({kind:'control-ack',requestId:m.requestId});
 if(active>=8){process.send?.({kind:'result',requestId:m.requestId,error:'AUTHORITY_UNAVAILABLE'});return;}active++;
 void (async()=>{
  // Issue a fresh F02 scope on EACH operator command. Parent IPC is the trusted
  // local carrier; there is no HTTP endpoint and no client identity metadata.
  const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
  if(m.kind==='qualify'){
   object({}).parse(m.input);
   const q=new QualificationRegistry(()=>localQualificationPins(config.root));
   // Launch/replay/inspect never probe. A fresh process must explicitly execute
   // qualification before new admission; accounting recovery needs no probe.
   const inventory=[];
   for(const entry of channels){
   const p=entry.profile,probeAdapter=entry.adapter;
   const qualification=await q.probe(p,{client:probeAdapter,ready:{adapterVersion:'deterministic-adapter-v1',assurance:'deterministic-local-only'},
    original:()=>OriginalCallSchema.parse({tenantId:config.tenantId,spaceId:config.spaceId,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID(),requestDigest:'sha256:'+'0'.repeat(64)}),
    holdUsage:async o=>{await fixtureControl('holdUsage',o,undefined,undefined,p.profileId);},completeUsage:async o=>{await fixtureControl('completeUsage',o,undefined,undefined,p.profileId);},delay:async(o,ms)=>{await fixtureControl('delay',o,ms,undefined,p.profileId);},
    capture:async o=>await fixtureControl('capture',o,undefined,undefined,p.profileId) as {request:unknown;receipt:unknown;status:string}|undefined,postgresVersion:async()=>String(await fixtureControl('postgresVersion',null,undefined,undefined,p.profileId))},300_000);inventory.push({profile:p,qualification,organizationApproved:true,available:boolean.parse(entry.available??false)});}
   registry=new ProfileRegistry(q,()=>ApprovalRulesSchema.parse({schemaVersion:1,providers:[profile.provider],routes:[profile.route],regions:[profile.region],dataPolicies:[profile.dataPolicy],runtimeProfiles:[profile.runtimeRequirements.profileId]}),inventory,{Fast:[profile.profileId],Balanced:[profile.profileId],Thorough:[profile.profileId]},[...inventory.slice(1).map(e=>[e.profile.profileId,profile.profileId] as const),...approvedRetries],(from,to)=>approvedRetries.some(pair=>pair[0]===from.profileId&&pair[1]===to.profileId));return {qualified:true};
  }
  if(m.kind==='operatorPreflight')return operatorPreflight(runtime.session,scope,object({sessionId:uuid,input:body,choice:nullable(ProfileChoiceSchema)}).parse(m.input));
  if(m.kind==='operatorInspect')return operatorInspect(runtime.session,scope,object({sessionId:uuid}).parse(m.input).sessionId);
  if(m.kind==='resourceInspect'){demand(resources,'REQUIRED_CAPABILITY_UNSUPPORTED');const c=object({resourceId:uuid,sessionId:nullable(uuid)}).parse(m.input);return resources.inspect(scope,c.resourceId,c.sessionId);}
  if(m.kind==='resourceLifecycle'){demand(resources,'REQUIRED_CAPABILITY_UNSUPPORTED');return resources.lifecycle(scope,m.input as Parameters<ResourceRepository['lifecycle']>[1]);}
  if(m.kind==='resourceRecord'){demand(resources,'REQUIRED_CAPABILITY_UNSUPPORTED');return resources.record(scope,object({receiptId:uuid}).parse(m.input).receiptId);}
  if(m.kind==='resourceConfirmSuspended'){demand(resources,'REQUIRED_CAPABILITY_UNSUPPORTED');return resources.confirmSuspended(scope,object({proofId:uuid}).parse(m.input).proofId);}
  if(m.kind==='open'){const input=m.input as {runId:string;admission:unknown};return runtime.repository.open(scope,input.runId,AdmissionSchema.parse(input.admission));}
  if(m.kind==='inspect'){const {object,uuid}=await import('./decoder.js');return runtime.session.inspect(scope,object({sessionId:uuid}).parse(m.input).sessionId);}
  if(m.kind==='replay'){const {object,uuid}=await import('./decoder.js'),s=await runtime.repository.snapshot(scope,object({sessionId:uuid}).parse(m.input).sessionId);const restored=runtime.session.restore(s,scope);return {sequence:restored.inspect().sequence,nextAction:restored.nextAction(),pendingModel:restored.inspect().pendingModel,modelResultCount:restored.inspect().modelResponses.length};}
  if(m.kind==='requestTurn')return runtime.session.requestTurn(scope,m.input as Parameters<typeof runtime.session.requestTurn>[1]);
  if(m.kind==='retryTurn')return runtime.session.retryTurn(scope,m.input as Parameters<typeof runtime.session.retryTurn>[1]);
  if(m.kind==='dispatchPrepared')return runtime.session.dispatchPrepared(scope,m.input as Parameters<typeof runtime.session.dispatchPrepared>[1]);
  if(m.kind==='reconcile')return runtime.session.reconcile(scope,m.input as Parameters<typeof runtime.session.reconcile>[1]);
  if(m.kind==='topUp')return runtime.session.topUp(scope,m.input as Parameters<typeof runtime.session.topUp>[1]);
  if(m.kind==='resume')return runtime.session.resume(scope,m.input as Parameters<typeof runtime.session.resume>[1]);
  if(m.kind==='switchProfile')return runtime.session.switchProfile(scope,m.input as Parameters<typeof runtime.session.switchProfile>[1]);
  if(m.kind==='stop')return runtime.session.stop(scope,m.input as Parameters<typeof runtime.session.stop>[1]);
  throw new Error('Unsupported operator command');
 })().then(result=>process.send?.({kind:'result',requestId:m.requestId,result}),e=>process.send?.({kind:'result',requestId:m.requestId,...safeFailure(e)})).finally(()=>active--);
});
console.log(JSON.stringify({marker:config.marker,pid:process.pid,carrier:'trusted-parent-service-port',paidCallsAllowed:false,qualification:'not-installed; restored accounting/control only'}));
process.on('SIGTERM',()=>{void Promise.all([controller.end(),authorityPool.end()]).then(()=>process.exit(0));});
