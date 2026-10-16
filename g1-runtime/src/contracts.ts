/** Executable F06 boundary contracts. These functions authorize no host/SQL I/O. */
import { assertBinding, assertGeneration, assertVerifiedScope, bindingDigest, effectBindingSchema, generationSchema, effectKey, assertEffectTransition, revalidateScope, receiptMatches, downstreamReceiptSchema, TaskCallBindingSchema, type Generation, type VerifiedScope, type TaskCallBinding, type AsyncUnitOfWork, type SqlTransaction, type ArtifactOwnerSeam, type EffectOwnerSeam, type NativeStopSeam, type FenceOwnerSeam } from './owners.js';
import * as S from './schemas.js';
import type { Value } from './schemas.js';
export type Path = Value<typeof S.PathSchema>;
export type Assurance = Value<typeof S.AssuranceSchema>;
export type Binding = Value<typeof S.BindingSchema>;
export type DeploymentPin = Value<typeof S.DeploymentPinSchema>;
export type CapabilityRow = Value<typeof S.CapabilityRowSchema>;
export type SupportedRow = CapabilityRow & {readonly status:'tested-support';readonly supported:true};
export type Qualification = Value<typeof S.QualificationSchema>;
export type RuntimeLease = Value<typeof S.RuntimeLeaseSchema>;
export type QueueRequest = Value<typeof S.QueueRequestSchema>;
export type QueueResult = Value<typeof S.QueueResultSchema>;
export type DispatchRequest = Value<typeof S.DispatchRequestSchema>;
export type DispatchResult = Value<typeof S.DispatchResultSchema>;
export type OriginalSnapshot = Value<typeof S.OriginalSnapshotSchema>;
export type Observation = Value<typeof S.ObservationSchema>;
declare const reconciliationAuthority: unique symbol;
export interface FreshReconciliationAuthority extends Value<typeof S.ReconciliationDataSchema> {
 readonly [reconciliationAuthority]: true;
}
export class RuntimeContractError extends Error {
 constructor(readonly code:'INVALID_CONTRACT'|'UNISSUED_AUTHORITY'|'STALE_AUTHORITY'|'BINDING_CONFLICT'|'UNSUPPORTED'|'RECONCILIATION_REQUIRED'|'COMPOSITION_REFUSED') { super(code); }
}
function requireContract(ok:unknown,code:RuntimeContractError['code']='INVALID_CONTRACT'):asserts ok {
 if(!ok)throw new RuntimeContractError(code);
}
function live(expiresAt:string,now:number):void {
 requireContract(Number.isFinite(now)&&Date.parse(S.timestamp.parse(expiresAt))>now,'STALE_AUTHORITY');
}
export interface RegistryEntry {
 readonly rowId:string; readonly path:CapabilityRow['path']; readonly effectOrControl:string;
 readonly backend:string; readonly backendVersion:string;
}
export function validateMatrix(raw:unknown,registry:readonly RegistryEntry[]):readonly CapabilityRow[] {
 const rows=S.list(S.CapabilityRowSchema,256,1).parse(raw);
 requireContract(registry.length>0&&new Set(registry.map(r=>r.rowId)).size===registry.length);
 requireContract(rows.length===registry.length&&new Set(rows.map(r=>r.rowId)).size===rows.length);
 for(const entry of registry) {
  const row=rows.find(r=>r.rowId===entry.rowId);
  requireContract(row && row.path===entry.path && row.effectOrControl===entry.effectOrControl && row.backend===entry.backend && row.backendVersion===entry.backendVersion);
 }
 return rows;
}
/** The installed verifier, queue and approval owners must validate ORIGINAL
 * references. A decoded/cast copy is deliberately not supplied to these ports. */
export interface ContractOwners {
 requireQualification(original:unknown):Promise<void>;
 requireLease(original:unknown):Promise<void>;
 requireApproval(original:unknown,scope:VerifiedScope,effect:import('./owners.js').EffectBinding):Promise<void>;
 requireReconciliation(original:unknown,scope:VerifiedScope):Promise<void>;
 requireObservation(original:unknown):Promise<void>;
}
export class ContractKernel {
 constructor(private readonly owners:ContractOwners, private readonly now:()=>number) {}
 async qualification(original:unknown,pin:DeploymentPin,registry:readonly RegistryEntry[],required:readonly string[],assurance:Assurance):Promise<Qualification> {
  await this.owners.requireQualification(original);
  const q=S.QualificationSchema.parse(original); S.DeploymentPinSchema.parse(pin);
  assertBinding(pin,q.pin); validateMatrix(q.rows,registry); live(q.expiresAt,this.now());
  requireContract(Date.parse(q.verifiedAt)<=this.now()&&q.blockingFindingIds.length===0,'STALE_AUTHORITY');
  requireContract(q.assurance===assurance,'UNSUPPORTED');
  requireContract(required.length>0&&new Set(required).size===required.length);
  for(const id of required)requireContract(q.rows.some(r=>r.rowId===id&&r.supported),'UNSUPPORTED');
  return q;
 }
 async lease(original:unknown,binding:Binding,generation:Generation,qualification:Qualification):Promise<RuntimeLease> {
  await this.owners.requireQualification(qualification);
  qualification=S.QualificationSchema.parse(qualification);live(qualification.expiresAt,this.now());
  requireContract(qualification.blockingFindingIds.length===0,'STALE_AUTHORITY');
  await this.owners.requireLease(original);
  const lease=S.RuntimeLeaseSchema.parse(original); assertBinding(lease.binding,S.BindingSchema.parse(binding));
  assertGeneration(lease.generation,generation); live(lease.expiresAt,this.now());
  requireContract(lease.qualificationId===qualification.qualificationId && lease.runtimeGeneration===qualification.pin.runtimeGeneration && lease.policyGeneration===qualification.pin.policyGeneration,'STALE_AUTHORITY');
  return lease;
 }
 async effect(scope:VerifiedScope,raw:unknown,args:unknown,artifact:string,approval:unknown,lease:unknown,qualification:Qualification,binding:Binding,generation:Generation):Promise<import('./owners.js').EffectBinding> {
  assertVerifiedScope(scope); await revalidateScope(scope);
  const effect=effectBindingSchema.parse(raw);
  const currentLease=await this.lease(lease,binding,generation,qualification);
  requireContract(effect.run.task.tenantId===scope.tenantId && effect.run.task.spaceId===scope.spaceId && effect.actorId===scope.actorId && effect.run.task.taskId===binding.taskId && effect.run.runId===binding.runId,'BINDING_CONFLICT');
  assertGeneration(effect.generation,generation); live(effect.expiresAt,this.now());
  requireContract(effect.executionLeaseId===currentLease.leaseId,'BINDING_CONFLICT');
  // Canonicalize BEFORE examining arguments, rejecting getters and non-JSON.
  const normalized=bindingDigest(args);
  requireContract(normalized===effect.argsDigest&&bindingDigest(artifact)===effect.artifactDigest,'BINDING_CONFLICT');
  requireContract(args!==null&&typeof args==='object'&&!Array.isArray(args) &&
   Object.getOwnPropertyDescriptor(args,'artifactDigest')?.value===effect.artifactDigest);
  requireContract(effect.effectClass!=='external-write'||effect.approvalId!==null,'UNISSUED_AUTHORITY');
  await this.owners.requireApproval(approval,scope,effect);
  await revalidateScope(scope); return effect;
 }
 async settlement(scope:VerifiedScope,authority:unknown,snapshotRaw:unknown,observation:unknown,receiptRaw:unknown,expected:{
  readonly effect:import('./owners.js').EffectBinding;readonly connectorDigest:string;readonly trustDigest:string;
  readonly lookupPolicyDigest:string;readonly bootId:string;readonly currentSnapshot:OriginalSnapshot;
 },action:'settle-metadata'='settle-metadata'):Promise<{readonly operationId:string;readonly dispatch:false;readonly snapshotDigest:string;readonly receiptDigest:string}> {
  assertVerifiedScope(scope); await revalidateScope(scope);
  requireContract(action==='settle-metadata','UNSUPPORTED');
  await this.owners.requireReconciliation(authority,scope); await this.owners.requireObservation(observation);
  const a=S.ReconciliationDataSchema.parse(authority), s=S.OriginalSnapshotSchema.parse(snapshotRaw), o=S.ObservationSchema.parse(observation), receipt=downstreamReceiptSchema.parse(receiptRaw);
  const effect=effectBindingSchema.parse(expected.effect);
  assertBinding(s,S.OriginalSnapshotSchema.parse(expected.currentSnapshot));
  live(a.expiresAt,this.now()); live(a.sessionExpiresAt,this.now());
  requireContract(Date.parse(a.issuedAt)<=this.now()&&a.actorId===scope.actorId&&a.authorityRevision===scope.authorityRevision,'STALE_AUTHORITY');
  requireContract(a.operationId===s.operationId&&a.originalBindingDigest===s.originalBindingDigest&&a.stoppedOrExpiredSnapshotDigest===bindingDigest(s)&&s.actorId===scope.actorId,'BINDING_CONFLICT');
  requireContract(s.operationId===effect.operationId&&s.originalBindingDigest===bindingDigest(effect)&&effect.actorId===scope.actorId&&effect.run.task.tenantId===scope.tenantId&&effect.run.task.spaceId===scope.spaceId,'BINDING_CONFLICT');
  requireContract(o.operationId===s.operationId&&o.originalBindingDigest===s.originalBindingDigest&&o.target===effect.target&&o.connectorDigest===S.digest.parse(expected.connectorDigest)&&o.trustDigest===S.digest.parse(expected.trustDigest)&&o.lookupPolicyDigest===a.lookupPolicyDigest&&o.lookupPolicyDigest===S.digest.parse(expected.lookupPolicyDigest)&&o.bootId===S.uuid.parse(expected.bootId),'BINDING_CONFLICT');
  assertGeneration(o.generation,s.generation);
  requireContract(Date.parse(o.observedAt)>=Date.parse(a.issuedAt)&&Date.parse(o.observedAt)<=this.now(),'STALE_AUTHORITY');
  requireContract(receiptMatches(effect,receipt)&&o.writeNumber===receipt.writeNumber&&o.targetReceiptDigest===bindingDigest(receipt),'BINDING_CONFLICT');
  // The actual owner will recheck after IO/precommit. This contract returns only
  // a read-only proposal; it cannot restore execution, renew a lease or write SQL.
  await revalidateScope(scope); await this.owners.requireReconciliation(authority,scope);
  live(a.expiresAt,this.now());
  return Object.freeze({operationId:s.operationId,dispatch:false,snapshotDigest:bindingDigest(s),receiptDigest:bindingDigest(receipt)});
 }
}
export function validateQueueRequest(raw:unknown,now:number,original?:QueueRequest):QueueRequest {
 const request=S.QueueRequestSchema.parse(raw); live(request.expiresAt,now);
 if(original) { requireContract(request.idempotencyKey===original.idempotencyKey,'BINDING_CONFLICT'); assertBinding(request,original); }
 return request;
}
export function validateQueueTransition(prior:QueueResult,next:QueueResult):void {
 const p=S.QueueResultSchema.parse(prior),n=S.QueueResultSchema.parse(next);
 requireContract(p.ticketId===n.ticketId);
 requireContract(p.state!=='cancelled'||n.state==='cancelled');
 requireContract(p.state!=='acquired'||n.state!=='waiting');
 if(p.state==='acquired'&&n.state==='acquired')assertBinding(p,n);
}
export function requireAcquired(raw:unknown):RuntimeLease {
 const result=S.QueueResultSchema.parse(raw);requireContract(result.state==='acquired','UNISSUED_AUTHORITY');return result.lease;
}
export function recoveryRoute(raw:unknown):'lookup-original-operation'|'complete'|'refused' {
 const r=S.DispatchResultSchema.parse(raw);
 return r.state==='unknown'?'lookup-original-operation':r.state==='confirmed'?'complete':'refused';
}
export interface PlanArtifactRef { readonly class:'artifact';readonly id:string;readonly revision:1;readonly witness:string }
export interface PlanSaveBinding {
 readonly schemaVersion:1;readonly saveKey:string;readonly documentId:string;readonly expectedVersion:number;readonly logicalVersion:number;
 readonly originalPlan:TaskCallBinding;readonly originalEnvelopeDigest:string;readonly originalControlRevision:number;
 readonly child:TaskCallBinding;readonly parentBudgetRunId:string;readonly commandFingerprint:string;
 readonly artifact:PlanArtifactRef;readonly previous:PlanArtifactRef|null;
 readonly originalExecutionClass:'service';readonly childExecutionClass:'service';
 readonly lineage:Value<typeof PlanLineageSchema>;
}
const ArtifactRefSchema=S.object({class:S.literal('artifact'),id:S.uuid,revision:S.literal(1),witness:S.digest});
export const PlanLineageSchema=S.refined(S.object({schemaVersion:S.literal(12),parentTaskId:S.uuid,parentRunId:S.uuid,
 parentDepartmentId:S.uuid,childDepartmentId:S.uuid,parentAllowances:S.list(S.uuid,64,1),childFamilyAllowances:S.list(S.uuid,64,1)}),
 l=>l.parentDepartmentId===l.childDepartmentId&&new Set(l.parentAllowances).size===l.parentAllowances.length&&new Set(l.childFamilyAllowances).size===l.childFamilyAllowances.length&&l.parentAllowances.every(id=>l.childFamilyAllowances.includes(id)));
export const PlanSaveBindingSchema=S.refined(S.object({schemaVersion:S.version,saveKey:S.uuid,documentId:S.uuid,
 expectedVersion:S.revision,logicalVersion:S.positive,originalPlan:TaskCallBindingSchema,originalEnvelopeDigest:S.digest,
 originalControlRevision:S.revision,child:TaskCallBindingSchema,parentBudgetRunId:S.uuid,commandFingerprint:S.digest,
 artifact:ArtifactRefSchema,previous:S.nullable(ArtifactRefSchema),originalExecutionClass:S.literal('service'),childExecutionClass:S.literal('service'),lineage:PlanLineageSchema}), b=>{
 const p=b.originalPlan,c=b.child;
 return b.logicalVersion===b.expectedVersion+1 && (b.expectedVersion===0)===(b.previous===null) &&
  (b.previous===null||b.previous.id!==b.artifact.id) && p.intent==='Plan'&&p.purpose==='planning'&&p.category==='service' &&
  c.intent==='Ask'&&c.purpose==='maintenance'&&c.category==='service' && p.runId!==c.runId&&p.taskId!==c.taskId &&c.parentTaskId===p.taskId&&
  p.tenantId===c.tenantId&&p.spaceId===c.spaceId&&p.payerId===c.payerId&&p.actorId===c.actorId&&
  p.costCenter===c.costCenter&&bindingDigest(p.versions)===bindingDigest(c.versions) && b.parentBudgetRunId===p.runId&&
  b.lineage.parentRunId===p.runId&&b.lineage.parentTaskId===p.taskId;
});
export interface PlanMaintenanceAdmission {
 admit(tx:SqlTransaction,scope:VerifiedScope,saveKey:string):Promise<PlanSaveBinding>;
 require(tx:SqlTransaction,scope:VerifiedScope,binding:PlanSaveBinding):Promise<void>;
}
export interface InstalledDispatchComposition {
 readonly uow:AsyncUnitOfWork;readonly effect:EffectOwnerSeam;
 dispatch(scope:VerifiedScope,request:DispatchRequest):Promise<DispatchResult>;
}
export interface InstalledFenceComposition { readonly fences:FenceOwnerSeam;readonly native:NativeStopSeam }
export type {ArtifactOwnerSeam};
export interface RuntimeOwners {
 currentEnvelope(tx:SqlTransaction,scope:VerifiedScope,runId:string):Promise<import('./owners.js').TaskEnvelope>;
 acquire(scope:VerifiedScope,request:QueueRequest):Promise<QueueResult>;
 dispatch(scope:VerifiedScope,request:DispatchRequest):Promise<DispatchResult>;
 lookupOriginal(scope:VerifiedScope,operationId:string):Promise<DispatchResult>;
}
export type OriginalSettlementResult =
 | {readonly state:'settled';readonly operationId:string;readonly targetReceipt:import('./owners.js').DownstreamReceipt;readonly ownerReceipt:import('./owners.js').RecoveryReceipt}
 | {readonly state:'held';readonly operationId:string;readonly reason:string;readonly replayAllowed:false};
export interface OriginalEffectSettlement {
 reconcile(scope:VerifiedScope,request:{readonly operationId:string;readonly originalBindingDigest:string}):Promise<OriginalSettlementResult>;
}
export interface RuntimeFenceTransfer {
 finalize(tx:SqlTransaction,scope:VerifiedScope,request:{readonly commandKey:string;readonly resourceId:string;
 readonly previous:Generation;readonly successorRunId:string;readonly quiescenceEvidenceId:string;readonly reconciliationEvidenceIds:readonly string[]}):Promise<{readonly generation:Generation;readonly originalFenceReceiptId:string}>;
}
/** Verification specimen for the proposed ORIGINAL-owner metadata delta.
 * No table writes or alternate operation ledger are implemented here. */
export const SettlementMetadataSchema=S.object({operationId:S.uuid,originalBindingDigest:S.digest,
 effectState:S.enumeration('dispatched','unknown','reconciling','confirmed'),runState:S.text,runRevision:S.revision,
 generation:generationSchema,sessionGeneration:generationSchema,leaseExpiresAt:S.timestamp,effectExpiresAt:S.timestamp,
 leaseRevoked:S.boolean,taskCancelled:S.boolean,taskBlocked:S.boolean,liabilityDigest:S.digest,receiptDigest:S.nullable(S.digest)});
export const SettlementCommandSchema=S.object({operationId:S.uuid,originalBindingDigest:S.digest,key:S.uuid,expectedRunRevision:S.revision,targetReceiptDigest:S.digest});
export function validateSettlementMetadata(priorRaw:unknown,nextRaw:unknown,commandRaw:unknown):void {
 const p=SettlementMetadataSchema.parse(priorRaw),n=SettlementMetadataSchema.parse(nextRaw),c=SettlementCommandSchema.parse(commandRaw);
 requireContract(p.operationId===c.operationId&&p.originalBindingDigest===c.originalBindingDigest&&c.key===effectKey(p.operationId,'f06-original-settlement'),'BINDING_CONFLICT');
 requireContract(c.expectedRunRevision===p.runRevision&&n.runRevision===p.runRevision+1,'BINDING_CONFLICT');
 const {effectState:_p,runRevision:_pr,receiptDigest:_pd,...preserved}=p;
 const {effectState:_n,runRevision:_nr,receiptDigest:_nd,...after}=n;assertBinding(preserved,after);
 requireContract(n.effectState==='confirmed'&&n.receiptDigest===c.targetReceiptDigest&&p.receiptDigest===null,'BINDING_CONFLICT');
 if(p.effectState==='unknown'){assertEffectTransition('unknown','reconciling');assertEffectTransition('reconciling','confirmed');}
 else assertEffectTransition(p.effectState,'confirmed');
}

/** Entrypoint-specific specification: not a universal locking wrapper. Reentrant
 * barrier/phase acquisitions are retained, then ignored only for cycle analysis. */
export const lockPrefixes=Object.freeze({
 nativeStop:['barrier','native-original','fence-key','barrier','owner-rows'],
 installedTopFence:['barrier','fence-key','barrier','owner-rows'],
 effectClaim:['effect-phase','barrier','owner-rows','effect-phase'],
 effectReconciling:['effect-phase','barrier','owner-rows','effect-phase'],
 effectConfirm:['effect-phase','barrier','owner-rows','effect-phase'],
 effectGuardedIO:['barrier','owner-rows','f06-rows'],
 synchronizeDelivery:['barrier','owner-rows'],
 originalSettlement:['recovery-command','barrier','owner-rows','f06-rows'],
 queueTransfer:['runtime-command','barrier','owner-rows','f06-rows'],
 nativeAdmission:['barrier','owner-rows'],f05Publication:['barrier','storage-original','owner-rows']
} as const);
export function assertAcyclicPrefixes(prefixes:readonly (readonly string[])[]):void {
 const edges=new Map<string,Set<string>>();
 for(const prefix of prefixes) {const held=new Set<string>();for(const key of prefix){if(held.has(key))continue;for(const h of held){if(!edges.has(h))edges.set(h,new Set());edges.get(h)!.add(key);}held.add(key);}}
 const visiting=new Set<string>(),done=new Set<string>();
 function visit(key:string):void {requireContract(!visiting.has(key),'COMPOSITION_REFUSED');if(done.has(key))return;visiting.add(key);for(const child of edges.get(key)??[])visit(child);visiting.delete(key);done.add(key);}
 for(const key of edges.keys())visit(key);
}
export interface CompositionWitness {
 readonly entrypoint:keyof typeof lockPrefixes;readonly prefix:readonly string[];
 readonly authenticatedTransaction:object;readonly barrierTransaction:object;
 readonly routes:readonly string[];readonly rawOnlineFence:boolean;readonly handlerSqlExposed:boolean;
}
export function validateComposition(w:CompositionWitness):void {
 requireContract(Object.hasOwn(lockPrefixes,w.entrypoint),'COMPOSITION_REFUSED');
 requireContract(w.authenticatedTransaction===w.barrierTransaction&&!w.rawOnlineFence&&!w.handlerSqlExposed,'COMPOSITION_REFUSED');
 assertBinding(w.prefix,lockPrefixes[w.entrypoint]);
 requireContract(w.routes.length===2&&w.routes.includes('execute')&&w.routes.includes('lookupCommand'),'COMPOSITION_REFUSED');
 assertAcyclicPrefixes(Object.values(lockPrefixes));
}
/** Checks witnesses, not dispatch permits. Only original EffectRepository owns
 * its ACK-created one-use claim. Borrowed UoWs cannot attest a top-level ACK. */
export function validateDispatchWitness(w:{readonly claimOwner:EffectOwnerSeam;readonly sendOwner:EffectOwnerSeam;readonly commit:'acknowledged'|'unknown';readonly uow:'top-level'|'borrowed';readonly slot:object;readonly activeSlots:readonly object[];readonly dispatch:boolean}):void {
 requireContract(w.claimOwner===w.sendOwner&&w.commit==='acknowledged'&&w.uow==='top-level'&&w.dispatch,'COMPOSITION_REFUSED');
 requireContract(w.activeSlots.filter(slot=>slot===w.slot).length===1,'COMPOSITION_REFUSED');
}
export function validatePhaseInvocations(a:object,c:object,get:object,d:object,sendEntered:boolean,waiterWinner:'observed'|'assumed'):void {
 requireContract(new Set([a,c,get,d]).size===4&&sendEntered&&waiterWinner==='observed','COMPOSITION_REFUSED');
}
export interface FenceScheduleStep {
 readonly caller:'native'|'facade';readonly event:'request-barrier'|'acquire-barrier'|'native-key'|'fence-key'|'commit'|'lookup';
 readonly transaction:object;readonly key:string;readonly payloadDigest:string;
}
/** Finite trace contract only. Observed PG locks/ACKs must later supply the
 * witness; accepting synthetic traces is never an execution/lock qualification. */
export function validateFenceSchedule(steps:readonly FenceScheduleStep[]):'deduplicated'|'IDEMPOTENCY_CONFLICT' {
 requireContract(steps.length===10,'COMPOSITION_REFUSED');
 const pending=new Map<object,{caller:string;key:string;digest:string;nativeKey:boolean;fenceKey:boolean}>();
 let holder:object|null=null;const commits:{key:string;digest:string}[]=[];
 let lookups=0;
 for(const step of steps) {
  S.uuid.parse(step.key);S.digest.parse(step.payloadDigest);
  if(step.event==='request-barrier') {
   requireContract(!pending.has(step.transaction),'COMPOSITION_REFUSED');
   pending.set(step.transaction,{caller:step.caller,key:step.key,digest:step.payloadDigest,nativeKey:false,fenceKey:false});continue;
  }
  if(step.event==='lookup') {requireContract(commits.length===2&&holder===null&&commits.some(c=>c.key===step.key),'COMPOSITION_REFUSED');lookups++;continue;}
  const entry=pending.get(step.transaction);
  requireContract(entry&&entry.caller===step.caller&&entry.key===step.key&&entry.digest===step.payloadDigest,'COMPOSITION_REFUSED');
  if(step.event==='acquire-barrier'){requireContract(holder===null,'COMPOSITION_REFUSED');holder=step.transaction;continue;}
  requireContract(holder===step.transaction,'COMPOSITION_REFUSED');
  if(step.event==='native-key'){requireContract(entry.caller==='native'&&!entry.nativeKey&&!entry.fenceKey,'COMPOSITION_REFUSED');entry.nativeKey=true;}
  if(step.event==='fence-key'){requireContract(!entry.fenceKey&&(entry.caller!=='native'||entry.nativeKey),'COMPOSITION_REFUSED');entry.fenceKey=true;}
  if(step.event==='commit'){requireContract(entry.fenceKey,'COMPOSITION_REFUSED');commits.push({key:entry.key,digest:entry.digest});pending.delete(step.transaction);holder=null;}
 }
 requireContract(commits.length===2&&commits[0]!.key===commits[1]!.key&&pending.size===0&&lookups===1,'COMPOSITION_REFUSED');
 return commits[0]!.digest===commits[1]!.digest?'deduplicated':'IDEMPOTENCY_CONFLICT';
}
export function validateBackendPins(raw:unknown,observed:unknown):void {assertBinding(S.BackendPinsSchema.parse(raw),S.BackendPinsSchema.parse(observed));}
export function requireApprovedHost(raw:unknown,now:number):void {
 const m=S.ApprovedHostManifestSchema.parse(raw);live(m.expiresAt,now);
 requireContract(m.provenance==='independent-approved-host'&&Date.parse(m.startsAt)<=now,'UNSUPPORTED');
 // Schema/provenance text is never enough: actual authorization and independent
 // host-verifier issuance must be installed by task12b; no remote activation here.
 throw new RuntimeContractError('UNISSUED_AUTHORITY');
}
