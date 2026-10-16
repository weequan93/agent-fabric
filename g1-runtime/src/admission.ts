import {randomUUID} from 'node:crypto';
import type {DomainEvent} from '../../engine/contracts/src/events.js';
import type {IdentityScopeVerifier} from '../../g1-identity/src/contracts.js';
import {bindingDigest as canonicalDigest,parseTaskEnvelope,revalidateScope,assertVerifiedScope,approvalDigest,type ExactApprovalBinding,type TaskEnvelope,type VerifiedScope} from './owners.js';
import * as S from './schemas.js';
import {AdmissionError,demand,immutable,requireIntent,type AdmissionEffect,type AuthorityIntersection} from './intent.js';
import {nativeSession,serviceLaunchDescriptor} from './native-runtime.js';
export const DraftSchema=S.object({key:S.uuid,text:S.text,intent:S.enumeration('ask','plan','act'),targetId:S.nullable(S.uuid)});
export const AcceptSchema=S.object({preflightDigest:S.digest});
export const ExecuteSchema=S.object({key:S.uuid,preflightDigest:S.digest,profile:S.enumeration('auto','quality'),route:S.enumeration('answer','source-read','bounded-write')});
export type Draft=S.Value<typeof DraftSchema>;
export interface Preflight {
 readonly schemaVersion:1;readonly actorId:string;readonly runId:string;readonly operationId:string;
 readonly envelope:TaskEnvelope;readonly result:string;readonly audience:readonly string[];
 readonly modelProfiles:readonly string[];readonly toolDigest:string;readonly runtimePolicyDigest:string;
 readonly authorityRevision:number;readonly membershipRevision:number;
 readonly sourceDigest:string;readonly expiresAt:string;readonly computer:'not-required'|'unsupported';
 readonly cost:{readonly status:'unknown';readonly maxUnits:number;readonly ongoingCompute:'none'};
 readonly laterGates:readonly string[];readonly assurance:'owned-local-fixture';
}
export interface AdmissionRecord {
 readonly taskId:string;readonly commandKey:string;readonly commandDigest:string;readonly text:string;
 readonly preflight:Preflight;readonly preflightDigest:string;
}
export interface Invocation {
 readonly key:string;readonly digest:string;readonly state:'pending'|'completed'|'unknown';
 readonly answer:string|null;readonly events:readonly DomainEvent[];
}
/** Implementations serialize the entire callback per original actor/Space namespace.
 * The fixture owner persists immutable input and command rows before any target I/O.
 * Production PG composition is a later, separately checked adapter. */
export interface AdmissionStore {
 exclusive<T>(namespace:string,work:()=>Promise<T>):Promise<T>;
 findCommand(namespace:string,key:string):Promise<AdmissionRecord|null>;
 get(namespace:string,taskId:string):Promise<AdmissionRecord|null>;
 insert(namespace:string,record:AdmissionRecord):Promise<void>;
 invocation(namespace:string,taskId:string):Promise<Invocation|null>;
 recordInvocation(namespace:string,taskId:string,value:Invocation):Promise<void>;
}
/** The adapter must validate original approval provenance/current parties, not a
 * decoded client record. Local tests supply a labelled synthetic acceptance owner.
 * No local adapter claims the original PG approval transaction/human judgment. */
export interface AdmissionApprovalPort {
 accept(scope:VerifiedScope,binding:ExactApprovalBinding,preflightDigest:string):Promise<void>;
 require(scope:VerifiedScope,binding:ExactApprovalBinding,preflightDigest:string):Promise<void>;
}
export interface AdmissionPorts {
 readonly identity:IdentityScopeVerifier;readonly store:AdmissionStore;readonly approvals:AdmissionApprovalPort;
 readonly now:()=>number;
 readonly current:(scope:VerifiedScope,preflight:Preflight|null)=>Promise<AuthorityIntersection>;
 readonly source:{manifest(scope:VerifiedScope):Promise<{sourceId:string;digest:string;audience:readonly string[]}>;read(scope:VerifiedScope,sourceId:string):Promise<string>};
 readonly model:{answer(scope:VerifiedScope,input:string,profile:'auto'|'quality'):Promise<string>};
 /** Only this exact enrolled target and bounded payload; no filesystem/shell handle. */
 readonly target:{id:string;write(scope:VerifiedScope,binding:ExactApprovalBinding,payload:string):Promise<void>};
}
export interface RequestIdentity {tenantId:string;spaceId:string;sessionCredential:string}
export function admissionNamespace(scope:VerifiedScope):string {assertVerifiedScope(scope);return [scope.tenantId,scope.spaceId,scope.actorId].join('/');}
const PreflightSchema=S.object({schemaVersion:S.version,actorId:S.uuid,runId:S.uuid,operationId:S.uuid,
 envelope:{parse:(v:unknown)=>immutable(parseTaskEnvelope(v))},result:S.text,audience:S.list(S.uuid,32,1),modelProfiles:S.list(S.enumeration('auto','quality'),2,2),
 toolDigest:S.digest,runtimePolicyDigest:S.digest,authorityRevision:S.revision,membershipRevision:S.revision,sourceDigest:S.digest,expiresAt:S.timestamp,
 computer:S.enumeration('not-required','unsupported'),cost:S.object({status:S.literal('unknown'),maxUnits:S.revision,ongoingCompute:S.literal('none')}),
 laterGates:S.list(S.enumeration('explicit-preflight','exact-approval'),2),assurance:S.literal('owned-local-fixture')});
export function validatePreflight(raw:Preflight):Preflight {
 const p=PreflightSchema.parse(raw),e=parseTaskEnvelope(p.envelope);
 demand(p.schemaVersion===1&&canonicalDigest(e)===canonicalDigest(p.envelope),'INVALID_REQUEST');
 S.uuid.parse(p.actorId);S.uuid.parse(p.runId);S.uuid.parse(p.operationId);S.digest.parse(p.sourceDigest);S.digest.parse(p.toolDigest);S.digest.parse(p.runtimePolicyDigest);S.timestamp.parse(p.expiresAt);
 demand(p.audience.length>0&&p.audience.every(a=>S.uuid.parse(a))&&p.modelProfiles.join(',')==='auto,quality','INVALID_REQUEST');
 demand(p.assurance==='owned-local-fixture'&&p.cost.status==='unknown'&&p.cost.ongoingCompute==='none'&&p.cost.maxUnits===e.ceilingUnits,'INVALID_REQUEST');
 demand(p.computer==='not-required'&&p.laterGates.join(',')===(e.intent==='act'?'explicit-preflight,exact-approval':''),'INVALID_REQUEST');
 demand(p.toolDigest===canonicalDigest(['answer','source-read','bounded-write'])&&p.runtimePolicyDigest===canonicalDigest(serviceLaunchDescriptor),'STALE_PREFLIGHT');
 demand(e.ceilingUnits===10&&e.continuation==='never'&&e.requirementsRevision===1&&e.requiredChecks.join(',')==='runtime-admission-fixture'&&!e.groupTrigger,'STALE_PREFLIGHT');
 demand(canonicalDigest(e.versions)===canonicalDigest({engine:'native-session-loop-v1',schema:'1',behavior:'bounded-local-v1',environment:'owned-local-fixture'}),'STALE_PREFLIGHT');
 demand(e.intent!=='plan'&&e.sources.length===1&&canonicalDigest(e.sources[0]!.scope)===canonicalDigest(e.scope)&&canonicalDigest(e.sources[0]!.audience)===canonicalDigest(p.audience)&&p.audience.includes(p.actorId),'STALE_PREFLIGHT');
 demand(e.effectCeiling.join(',')===(e.intent==='act'?'read,model,write':'read,model')&&e.executionClass===(e.intent==='act'?'external-effect':'conversation'),'STALE_PREFLIGHT');
 demand(e.intent==='act'?e.targets.length===1&&e.targets[0]!.kind==='owned-fixture'&&canonicalDigest(e.targets[0]!.scope)===canonicalDigest(e.scope):e.targets.length===0,'STALE_PREFLIGHT');
 return p;
}
export function exactAdmissionBinding(record:AdmissionRecord):ExactApprovalBinding {
 const p=record.preflight,e=p.envelope;
 const b:ExactApprovalBinding={...e.scope,taskId:e.taskId,runId:p.runId,operationId:p.operationId,target:e.targets[0]?.resourceId??'service-answer',action:'fixture.replace',argsDigest:canonicalDigest({text:record.text,preflightDigest:record.preflightDigest}),artifactVersion:1,policyRevision:1,requirementsRevision:e.requirementsRevision,sourceAudience:{sourceSpaceId:e.scope.spaceId,sourceTaskId:e.taskId,destinationSpaceId:e.scope.spaceId,recipientActorIds:[...p.audience],revisionDigest:p.sourceDigest},limits:{maxOperations:1,maxCostMicrounits:e.ceilingUnits},expiresAt:p.expiresAt};
 approvalDigest(b);return immutable(b);
}
export class RuntimeAdmission {
 constructor(private readonly ports:AdmissionPorts){}
 async authenticate(request:RequestIdentity):Promise<VerifiedScope> {
  const scope=await this.ports.identity.verify(request);this.ports.identity.bindingFor(scope);await revalidateScope(scope);return scope;
 }
 private async fresh(scope:VerifiedScope,p:Preflight|null,effect:AdmissionEffect):Promise<void> {
  await revalidateScope(scope);const intersection=await this.ports.current(scope,p);await revalidateScope(scope);
  if(p){
   validatePreflight(p);demand(p.actorId===scope.actorId&&p.authorityRevision===scope.authorityRevision&&p.membershipRevision===scope.membershipRevision,'STALE_PREFLIGHT');
   demand(Date.parse(p.expiresAt)>this.ports.now(),'STALE_PREFLIGHT');
   const source=await this.ports.source.manifest(scope);await revalidateScope(scope);
   demand(source.digest===p.sourceDigest&&canonicalDigest(source.audience)===canonicalDigest(p.audience)&&source.sourceId===p.envelope.sources[0]?.sourceId,'STALE_PREFLIGHT');
   requireIntent(scope,p.envelope,effect,intersection);
  }
 }
 private async record(scope:VerifiedScope,id:string):Promise<AdmissionRecord> {
  S.uuid.parse(id);await revalidateScope(scope);const row=await this.ports.store.get(admissionNamespace(scope),id);await revalidateScope(scope);
  demand(row,'NOT_FOUND');S.uuid.parse(row.commandKey);S.digest.parse(row.commandDigest);demand(row.preflightDigest===canonicalDigest(row.preflight)&&row.taskId===row.preflight.envelope.taskId&&row.text===row.preflight.result,'STALE_PREFLIGHT');return immutable(row);
 }
 async draft(scope:VerifiedScope,raw:unknown):Promise<AdmissionRecord> {
  assertVerifiedScope(scope);const input=DraftSchema.parse(raw),ns=admissionNamespace(scope);await this.fresh(scope,null,'answer');
  demand(scope.grants.includes('task:write'),'PERMISSION_DENIED');demand(input.intent!=='plan','UNSUPPORTED');
  demand(input.intent==='act'?input.targetId===this.ports.target.id:input.targetId===null,'INVALID_REQUEST');
  return this.ports.store.exclusive(ns,async()=>{
   await this.fresh(scope,null,'answer');const prior=await this.ports.store.findCommand(ns,input.key);await revalidateScope(scope);
   if(prior){demand(prior.commandDigest===canonicalDigest(input),'IDEMPOTENCY_CONFLICT');return immutable(prior);}
   const source=await this.ports.source.manifest(scope);await revalidateScope(scope);
   demand(source.audience.includes(scope.actorId),'UNAUTHORIZED');S.digest.parse(source.digest);S.uuid.parse(source.sourceId);
   const taskId=randomUUID(),runId=randomUUID();
   const envelope=parseTaskEnvelope({schemaVersion:1,scope:{tenantId:scope.tenantId,spaceId:scope.spaceId},taskId,requirementsRevision:1,intent:input.intent,executionClass:input.intent==='act'?'external-effect':'conversation',effectCeiling:input.intent==='act'?['read','model','write']:['read','model'],sources:[{sourceId:source.sourceId,scope:{tenantId:scope.tenantId,spaceId:scope.spaceId},audience:[...source.audience],trust:'trusted',observedAt:this.ports.now()}],targets:input.targetId?[{resourceId:input.targetId,scope:{tenantId:scope.tenantId,spaceId:scope.spaceId},kind:'owned-fixture'}]:[],payerId:scope.payerId,allowanceId:'fixture-bounded-allowance',ceilingUnits:10,continuation:'never',requiredChecks:['runtime-admission-fixture'],versions:{engine:'native-session-loop-v1',schema:'1',behavior:'bounded-local-v1',environment:'owned-local-fixture'},groupTrigger:false});
   const p=validatePreflight({schemaVersion:1,actorId:scope.actorId,runId,operationId:randomUUID(),envelope,result:input.text,audience:[...source.audience],modelProfiles:['auto','quality'],toolDigest:canonicalDigest(['answer','source-read','bounded-write']),runtimePolicyDigest:canonicalDigest(serviceLaunchDescriptor),authorityRevision:scope.authorityRevision,membershipRevision:scope.membershipRevision,sourceDigest:source.digest,expiresAt:new Date(this.ports.now()+60_000).toISOString(),computer:'not-required',cost:{status:'unknown',maxUnits:10,ongoingCompute:'none'},laterGates:input.intent==='act'?['explicit-preflight','exact-approval']:[],assurance:'owned-local-fixture'});
   await this.fresh(scope,p,input.intent==='act'?'bounded-write':'answer');
   const row=immutable({taskId,commandKey:input.key,commandDigest:canonicalDigest(input),text:input.text,preflight:p,preflightDigest:canonicalDigest(p)});
   await this.ports.store.insert(ns,row);await revalidateScope(scope);return row;
  });
 }
 async preflight(scope:VerifiedScope,id:string):Promise<AdmissionRecord>{const r=await this.record(scope,id);await this.fresh(scope,r.preflight,'answer');return r;}
 async status(scope:VerifiedScope,id:string):Promise<{record:AdmissionRecord;invocation:Invocation|null}>{
  const record=await this.preflight(scope,id),invocation=await this.ports.store.invocation(admissionNamespace(scope),id);await revalidateScope(scope);
  return {record,invocation:invocation?immutable(invocation):null};
 }
 async accept(scope:VerifiedScope,id:string,raw:unknown):Promise<{accepted:true;preflightDigest:string}> {
  const input=AcceptSchema.parse(raw),r=await this.record(scope,id);demand(r.preflightDigest===input.preflightDigest,'STALE_PREFLIGHT');
  demand(r.preflight.envelope.intent==='act','INTENT_EXCEEDED');await this.fresh(scope,r.preflight,'bounded-write');
  await this.ports.approvals.accept(scope,exactAdmissionBinding(r),r.preflightDigest);await this.fresh(scope,r.preflight,'bounded-write');
  return {accepted:true,preflightDigest:r.preflightDigest};
 }
 async execute(scope:VerifiedScope,id:string,raw:unknown):Promise<Invocation> {
  const input=ExecuteSchema.parse(raw),ns=admissionNamespace(scope);await revalidateScope(scope);
  return this.ports.store.exclusive(ns,async()=>{
   const r=await this.record(scope,id),p=r.preflight;demand(input.preflightDigest===r.preflightDigest,'STALE_PREFLIGHT');await this.fresh(scope,p,input.route);
   const digest=canonicalDigest(input),prior=await this.ports.store.invocation(ns,id);await revalidateScope(scope);
   if(prior){demand(prior.key===input.key&&prior.digest===digest,'IDEMPOTENCY_CONFLICT');demand(prior.state==='completed','UNKNOWN_OUTCOME');return immutable(prior);}
   if(input.route==='bounded-write'){await this.ports.approvals.require(scope,exactAdmissionBinding(r),r.preflightDigest);await this.fresh(scope,p,input.route);}
   let invoked=false;
   const loop=nativeSession(p.envelope,p.runId,{
    clock:{now:this.ports.now},authorize:()=>{assertVerifiedScope(scope);},
    model:async text=>{
     await this.fresh(scope,p,'source-read');const source=await this.ports.source.read(scope,p.envelope.sources[0]!.sourceId);await this.fresh(scope,p,'answer');
     invoked=true;const answer=await this.ports.model.answer(scope,text+'\n'+source,input.profile);await this.fresh(scope,p,input.route);return answer;
    },
    execute:async()=>{await this.fresh(scope,p,'bounded-write');const binding=exactAdmissionBinding(r);await this.ports.approvals.require(scope,binding,r.preflightDigest);await this.fresh(scope,p,'bounded-write');invoked=true;await this.ports.target.write(scope,binding,r.text);await this.fresh(scope,p,'bounded-write');return 'committed';}
   });
   const save=async(state:Invocation['state'],answer:string|null):Promise<Invocation>=>{const value=immutable({key:input.key,digest,state,answer,events:loop.events()});await this.ports.store.recordInvocation(ns,id,value);return value;};
   await save('pending',null);await this.fresh(scope,p,input.route);
   try{
    if(input.route==='bounded-write'){await loop.dispatchEffect(p.operationId);return await save('completed','Bounded fixture target updated');}
    const answer=await loop.callModel(r.text);return await save('completed',answer);
   }catch(error){await save(invoked?'unknown':'pending',null);if(invoked)throw new AdmissionError('UNKNOWN_OUTCOME');throw error;}
  });
 }
}
