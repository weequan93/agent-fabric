/** Plan bridge control flow. Ports below are explicit fixture seams, not SQL/F05
 * implementations. The original Plan is never relabelled as maintenance. */
import {createHash} from 'node:crypto';
import {assertVerifiedScope,revalidateScope,bindingDigest,parseTaskEnvelope,TaskCallBindingSchema,type VerifiedScope,type TaskEnvelope,type TaskCallBinding} from './owners.js';
import {PlanSaveBindingSchema,type PlanSaveBinding,type PlanArtifactRef} from './contracts.js';
import {demand,immutable} from './intent.js';
import * as S from './schemas.js';
export const PLAN_CONTENT_BYTES=16384;
const Content={parse(v:unknown):string{demand(typeof v==='string'&&Buffer.byteLength(v,'utf8')<=PLAN_CONTENT_BYTES,'INVALID_REQUEST');return v;}};
export const PlanSaveSchema=S.object({schemaVersion:S.version,sessionId:S.uuid,documentId:S.uuid,key:S.uuid,expectedVersion:S.revision,expiresAt:S.timestamp,content:Content});
export type PlanSave=S.Value<typeof PlanSaveSchema>;
export interface PlanParent {
 readonly binding:TaskCallBinding;readonly envelope:TaskEnvelope;readonly executionClass:'service';
 readonly controlRevision:number;readonly departmentId:string;readonly allowances:readonly string[];
 readonly audience:readonly string[];readonly sourceIds:readonly string[];readonly expiresAt:string;
 readonly active:boolean;readonly budgetRemaining:number;
}
export const planMaintenanceService=Object.freeze({executionClass:'service',resourceId:null,computerCapability:null,targetEffect:false,approvalRequired:false,ongoingCompute:Object.freeze([]),ports:Object.freeze([])} as const);
export interface PlanIntent {readonly request:PlanSave;readonly namespace:string;readonly binding:PlanSaveBinding;readonly parent:PlanParent;readonly childService:typeof planMaintenanceService;readonly bytes:string}
export interface PlanVersion {readonly documentId:string;readonly logicalVersion:number;readonly saveKey:string;readonly binding:PlanSaveBinding;readonly bytesDigest:string}
export interface RoutineRecord {readonly key:string;readonly sessionId:string;readonly kind:'transcript'|'audit'|'memory';readonly content:string;readonly explicit:boolean}
export interface PlanTransaction {
 parent(sessionId:string):PlanParent|null;
 intent(namespace:string,key:string):PlanIntent|null;
 insertIntent(intent:PlanIntent):void;
 maintenanceChild(namespace:string,sessionId:string):PlanIntent|null;
 version(namespace:string,documentId:string,logicalVersion?:number):PlanVersion|null;
 publish(namespace:string,version:PlanVersion):void;
 routine(namespace:string,record:RoutineRecord):RoutineRecord|null;
 appendRoutine(namespace:string,record:RoutineRecord):void;
}
export interface PlanUnitOfWork {transaction<T>(scope:VerifiedScope,body:(tx:PlanTransaction)=>Promise<T>):Promise<T>}
// Private process-local issuance, checked again by the byte owner. A decoded link
// or a Plan/maintenance binding supplied directly cannot create this capability.
export interface PlanArtifactPermit {readonly artifactId:string}
const permits=new WeakMap<object,string>();
export function requirePlanArtifactPermit(permit:PlanArtifactPermit,binding:PlanSaveBinding):void {
 demand(permits.get(permit)===bindingDigest(PlanSaveBindingSchema.parse(binding)),'UNAUTHORIZED');
}
export interface PlanByteStore {
 prepare(scope:VerifiedScope,intent:PlanIntent,permit:PlanArtifactPermit):Promise<void>;
 commit(scope:VerifiedScope,intent:PlanIntent,permit:PlanArtifactPermit,validate:(tx:PlanTransaction)=>Promise<void>,publish:(tx:PlanTransaction)=>Promise<void>):Promise<void>;
 lookup(tx:PlanTransaction,scope:VerifiedScope,intent:PlanIntent,permit:PlanArtifactPermit):Promise<PlanArtifactRef|null>;
 readWithTransaction(tx:PlanTransaction,scope:VerifiedScope,intent:PlanIntent,permit:PlanArtifactPermit):Promise<string>;
}
export interface PlanPersistencePorts {
 readonly uow:PlanUnitOfWork;readonly artifacts:PlanByteStore;readonly now:()=>number;
 readonly sourceCurrent:(scope:VerifiedScope,parent:PlanParent)=>Promise<void>;
 readonly audit:(tx:PlanTransaction,scope:VerifiedScope,record:RoutineRecord)=>Promise<void>;
}
export function planNamespace(scope:VerifiedScope):string{assertVerifiedScope(scope);return [scope.tenantId,scope.spaceId,scope.actorId].join('/');}
function stableId(namespace:string,key:string,label:string):string {
 const h=createHash('sha256').update(JSON.stringify([namespace,key,label])).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
function parentShape(parent:PlanParent):PlanParent {
 const b=TaskCallBindingSchema.parse(parent.binding),e=parseTaskEnvelope(parent.envelope);
 demand(b.intent==='Plan'&&b.purpose==='planning'&&b.category==='service'&&parent.executionClass==='service','INTENT_EXCEEDED');
 demand(e.intent==='plan'&&e.executionClass==='conversation'&&e.targets.length===0&&e.taskId===b.taskId&&e.payerId===b.payerId&&e.requirementsRevision===b.requirementsRevision&&bindingDigest(e.scope)===bindingDigest({tenantId:b.tenantId,spaceId:b.spaceId}),'STALE_PREFLIGHT');
 S.uuid.parse(parent.departmentId);S.timestamp.parse(parent.expiresAt);S.revision.parse(parent.controlRevision);S.revision.parse(parent.budgetRemaining);
 demand(parent.allowances.length>0&&new Set(parent.allowances).size===parent.allowances.length&&parent.allowances.every(id=>S.uuid.parse(id)),'INVALID_REQUEST');
 demand(parent.audience.length>0&&parent.audience.every(id=>S.uuid.parse(id))&&parent.sourceIds.length===e.sources.length&&parent.sourceIds.every((id,i)=>id===e.sources[i]?.sourceId)&&e.sources.every(s=>bindingDigest(s.audience)===bindingDigest(parent.audience)),'STALE_PREFLIGHT');
 return immutable(parent);
}
/** New, constrained admission. It derives all linkage from the current parent and
 * scoped save intent. It has no general task/tool/model/computer route. */
export class PlanMaintenanceAdmission {
 constructor(private readonly ports:PlanPersistencePorts){}
 async fresh(tx:PlanTransaction,scope:VerifiedScope,sessionId:string,mode:'read'|'write'):Promise<PlanParent>{
  await revalidateScope(scope);for(const grant of ['task:read','task:write','storage:maintenance',mode==='read'?'storage:read':'storage:write'])demand(scope.grants.includes(grant),'PERMISSION_DENIED');
  const raw=tx.parent(sessionId);demand(raw,'NOT_FOUND');const p=parentShape(raw),b=p.binding;
  demand(b.tenantId===scope.tenantId&&b.spaceId===scope.spaceId&&b.actorId===scope.actorId&&b.payerId===scope.payerId,'UNAUTHORIZED');
  demand(p.active&&Date.parse(p.expiresAt)>this.ports.now()&&p.audience.includes(scope.actorId)&&b.membershipRevision===scope.membershipRevision,'STALE_PREFLIGHT');
  await this.ports.sourceCurrent(scope,p);await revalidateScope(scope);
  demand(bindingDigest(tx.parent(sessionId))===bindingDigest(p)&&Date.parse(p.expiresAt)>this.ports.now(),'STALE_PREFLIGHT');return p;
 }
 async admit(tx:PlanTransaction,scope:VerifiedScope,request:PlanSave):Promise<PlanIntent>{
  const parent=await this.fresh(tx,scope,request.sessionId,'write'),namespace=planNamespace(scope),prior=tx.intent(namespace,request.key);
  if(prior){demand(bindingDigest(prior.request)===bindingDigest(request),'IDEMPOTENCY_CONFLICT');await this.require(tx,scope,prior,'write');return immutable(prior);}
  demand(Date.parse(request.expiresAt)>this.ports.now()&&Date.parse(request.expiresAt)<=Date.parse(parent.expiresAt),'STALE_PREFLIGHT');
  demand(parent.budgetRemaining>=1,'PERMISSION_DENIED');
  const previous=tx.version(namespace,request.documentId);demand((previous?.logicalVersion??0)===request.expectedVersion,'IDEMPOTENCY_CONFLICT');
  demand(!previous||previous.binding.originalPlan.sessionId===request.sessionId,'UNAUTHORIZED');
  const child:TaskCallBinding={...parent.binding,taskId:stableId(namespace,request.key,'task'),runId:stableId(namespace,request.key,'run'),sessionId:stableId(namespace,request.key,'session'),parentTaskId:parent.binding.taskId,intent:'Ask',purpose:'maintenance',category:'service'};
  const bytes=JSON.stringify({schemaVersion:1,originalEnvelopeDigest:bindingDigest(parent.envelope),logicalVersion:request.expectedVersion+1,previous:previous?.binding.artifact??null,content:request.content});
  const binding=PlanSaveBindingSchema.parse({schemaVersion:1,saveKey:request.key,documentId:request.documentId,expectedVersion:request.expectedVersion,logicalVersion:request.expectedVersion+1,originalPlan:parent.binding,originalEnvelopeDigest:bindingDigest(parent.envelope),originalControlRevision:parent.controlRevision,child,parentBudgetRunId:parent.binding.runId,commandFingerprint:bindingDigest(request),artifact:{class:'artifact',id:stableId(namespace,request.key,'artifact'),revision:1,witness:bindingDigest(bytes)},previous:previous?.binding.artifact??null,originalExecutionClass:'service',childExecutionClass:'service',lineage:{schemaVersion:12,parentTaskId:parent.binding.taskId,parentRunId:parent.binding.runId,parentDepartmentId:parent.departmentId,childDepartmentId:parent.departmentId,parentAllowances:[...parent.allowances],childFamilyAllowances:[...parent.allowances]}});
  const intent=immutable({request,namespace,binding,parent,childService:planMaintenanceService,bytes});tx.insertIntent(intent);return intent;
 }
 async require(tx:PlanTransaction,scope:VerifiedScope,raw:PlanIntent,mode:'read'|'write'):Promise<PlanArtifactPermit>{
  const binding=PlanSaveBindingSchema.parse(raw.binding),parent=await this.fresh(tx,scope,raw.request.sessionId,mode);
  const stored=tx.intent(planNamespace(scope),binding.saveKey);
  demand(bindingDigest(raw.childService)===bindingDigest(planMaintenanceService),'INTENT_EXCEEDED');
  demand(stored&&bindingDigest(stored)===bindingDigest(raw)&&bindingDigest(parent)===bindingDigest(raw.parent),'STALE_PREFLIGHT');
  demand(Date.parse(raw.request.expiresAt)>this.ports.now(),'STALE_PREFLIGHT');
  demand(binding.commandFingerprint===bindingDigest(raw.request)&&binding.originalEnvelopeDigest===bindingDigest(parent.envelope)&&bindingDigest(binding.originalPlan)===bindingDigest(parent.binding)&&binding.artifact.witness===bindingDigest(raw.bytes),'STALE_PREFLIGHT');
  const permit=Object.freeze({artifactId:binding.artifact.id});permits.set(permit,bindingDigest(binding));return permit;
 }
 /** Installed session-route gate; the child is identified from durable admission,
  * never from a client-supplied purpose/intent label. */
 async generalSession(tx:PlanTransaction,scope:VerifiedScope,sessionId:string,rawRoute:unknown):Promise<TaskCallBinding>{
  S.uuid.parse(sessionId);const route=S.enumeration('normal-turn','model','tool','vm','promotion').parse(rawRoute);
  await revalidateScope(scope);demand(!tx.maintenanceChild(planNamespace(scope),sessionId),'INTENT_EXCEEDED');
  const parent=await this.fresh(tx,scope,sessionId,'read');demand(route==='normal-turn'||route==='model','INTENT_EXCEEDED');return parent.binding;
 }
}
export class PlanPersistenceRepository {
 readonly admission:PlanMaintenanceAdmission;
 constructor(private readonly ports:PlanPersistencePorts){this.admission=new PlanMaintenanceAdmission(ports);}
 async save(scope:VerifiedScope,raw:unknown):Promise<PlanVersion>{
  assertVerifiedScope(scope);const request=PlanSaveSchema.parse(raw);
  // Admission commits before staging; an uncertain admission must be looked up by
  // the original key, never replaced with another child.
  const intent=await this.ports.uow.transaction(scope,tx=>this.admission.admit(tx,scope,request));
  const recovered=await this.lookup(scope,request.key);if(recovered)return recovered;
  const permit=await this.ports.uow.transaction(scope,tx=>this.admission.require(tx,scope,intent,'write'));
  await this.ports.artifacts.prepare(scope,intent,permit);
  await this.ports.artifacts.commit(scope,intent,permit,async tx=>{
   await this.admission.require(tx,scope,intent,'write');
   const current=tx.version(intent.namespace,request.documentId);
   demand((current?.logicalVersion??0)===request.expectedVersion,'IDEMPOTENCY_CONFLICT');
  },async tx=>{
   await this.admission.require(tx,scope,intent,'write');
   tx.publish(intent.namespace,immutable({documentId:request.documentId,logicalVersion:intent.binding.logicalVersion,saveKey:request.key,binding:intent.binding,bytesDigest:bindingDigest(intent.bytes)}));
  });
  const saved=await this.lookup(scope,request.key);demand(saved,'UNKNOWN_OUTCOME');return saved;
 }
 async lookup(scope:VerifiedScope,key:string):Promise<PlanVersion|null>{
  S.uuid.parse(key);return this.ports.uow.transaction(scope,async tx=>{
   await revalidateScope(scope);const intent=tx.intent(planNamespace(scope),key);if(!intent)return null;
   const permit=await this.admission.require(tx,scope,intent,'read'),ref=await this.ports.artifacts.lookup(tx,scope,intent,permit);
   await this.admission.require(tx,scope,intent,'read');if(!ref)return null;
   const version=tx.version(intent.namespace,intent.request.documentId,intent.binding.logicalVersion);
   demand(version&&bindingDigest(version.binding)===bindingDigest(intent.binding)&&bindingDigest(ref)===bindingDigest(intent.binding.artifact),'UNKNOWN_OUTCOME');return immutable(version);
  });
 }
 async reopen(scope:VerifiedScope,sessionId:string,documentId:string,version?:number):Promise<{version:PlanVersion;bytes:string}>{
  S.uuid.parse(sessionId);S.uuid.parse(documentId);if(version!==undefined)S.positive.parse(version);
  return this.ports.uow.transaction(scope,async tx=>{
   await this.admission.fresh(tx,scope,sessionId,'read');const v=tx.version(planNamespace(scope),documentId,version);demand(v,'NOT_FOUND');
   const intent=tx.intent(planNamespace(scope),v.saveKey);demand(intent&&intent.request.sessionId===sessionId,'UNAUTHORIZED');
   const permit=await this.admission.require(tx,scope,intent,'read');
   const bytes=await this.ports.artifacts.readWithTransaction(tx,scope,intent,permit);
   await this.admission.require(tx,scope,intent,'read');demand(bindingDigest(bytes)===v.bytesDigest&&bytes===intent.bytes,'UNKNOWN_OUTCOME');return {version:immutable(v),bytes};
  });
 }
 async record(scope:VerifiedScope,raw:unknown):Promise<RoutineRecord>{
  const r=S.object({key:S.uuid,sessionId:S.uuid,kind:S.enumeration('transcript','audit','memory'),content:Content,explicit:S.boolean}).parse(raw);
  return this.ports.uow.transaction(scope,async tx=>{
   await revalidateScope(scope);demand(scope.grants.includes('task:write')&&scope.grants.includes('persistence:write'),'PERMISSION_DENIED');
   const p=tx.parent(r.sessionId);demand(p&&p.active&&['Ask','Plan'].includes(p.binding.intent)&&p.binding.actorId===scope.actorId&&p.binding.tenantId===scope.tenantId&&p.binding.spaceId===scope.spaceId&&p.binding.payerId===scope.payerId&&p.audience.includes(scope.actorId)&&Date.parse(p.expiresAt)>this.ports.now(),'UNAUTHORIZED');
   if(r.kind==='memory')demand(r.explicit&&scope.grants.includes('memory:write'),'PERMISSION_DENIED');
   await this.ports.sourceCurrent(scope,p);await revalidateScope(scope);
   const ns=planNamespace(scope),prior=tx.routine(ns,r);if(prior){demand(bindingDigest(prior)===bindingDigest(r),'IDEMPOTENCY_CONFLICT');return immutable(prior);}
   await this.ports.audit(tx,scope,r);await this.ports.sourceCurrent(scope,p);await revalidateScope(scope);
   demand(bindingDigest(tx.parent(r.sessionId))===bindingDigest(p),'STALE_PREFLIGHT');tx.appendRoutine(ns,r);return immutable(r);
  });
 }
}
