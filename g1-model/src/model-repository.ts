import { assertParentUnfenced,assertOtherRunsResolved } from './native-guard.js';
import { randomUUID } from 'node:crypto';
import { canonicalDigest, revalidateScope, lockSpaceBarrier, assertRunUnfenced } from './native-imports.js';
import { type CurrentAuthority } from '../../g1-foundations/src/contracts.js';
import { createRun } from '../../engine/scheduler/src/run-state.js';
import { validateEvent,type DomainEvent } from '../../engine/contracts/src/events.js';
import { replaySession, type RunRecord } from './native-imports.js';
import { TaskCallBindingSchema,EncodedRequestSchema,ModelOperationSchema,ModelAttemptSchema,ModelEventSchema } from './schema.js';
import { object,text,timestamp,positive,uuid } from './decoder.js';
import { TransactionBudgetRepository,decodeCategories,type ReservationCategories } from './budget-repository.js';
import { demand,ModelError } from './errors.js';
import { safeAdd, reserveEstimate } from './arithmetic.js';
import { requestDigestOf } from './test-adapter.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,TaskCallBinding,EncodedRequest,PreparedAttempt,ModelOperation,ModelAttempt,ModelEvent,OriginalCall } from './contracts.js';

const CommandSchema=object({key:text,expiresAt:timestamp,retryCeiling:positive});
const TopUpCommandSchema=object({allowanceId:uuid,addedUnits:positive,key:text,expiresAt:timestamp});
export interface PrepareInput{
 readonly binding:TaskCallBinding;readonly request:EncodedRequest;readonly origin:RunRecord;
 readonly command:{key:string;expiresAt:string;retryCeiling:number};
 readonly categories:ReservationCategories;readonly nativePrefix:readonly DomainEvent[];
 readonly route:string;
}
/** Optional instrumentation is supplied by the trusted composition root only. */
export interface RepositoryHooks{afterStage?:(stage:'reserved'|'operation'|'attempt'|'pending'|'audit'|'outbox'|'claim',tx:SqlTransaction)=>Promise<void>}
export interface CurrentModelAuthority{assertCurrent(tx:SqlTransaction,scope:VerifiedScope,binding:TaskCallBinding,request:EncodedRequest):Promise<void>}
export function originalKeyLock(scope:VerifiedScope,key:string):string{return JSON.stringify(['model-original',scope.tenantId,scope.spaceId,scope.actorId,key]);}
export const hash=(v:unknown)=>'sha256:'+canonicalDigest(v);
export async function lockOriginal(tx:SqlTransaction,scope:VerifiedScope,key:string):Promise<void>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[originalKeyLock(scope,key)]);}
/** Refusal receipts fence the same original even if an installed caller changes
 * its key. The table exists before native controls, unlike native-only tables. */
export async function assertNotRefused(tx:SqlTransaction,scope:VerifiedScope,o:OriginalCall):Promise<void>{
 demand(!(await tx.query("SELECT 1 FROM fabric.model_command_receipts WHERE tenant_id=$1 AND space_id=$2 AND (receipt->'noDispatchOriginal'->>'attemptId'=$3 OR receipt->'noDispatchOriginal'->>'reservationId'=$4)",[scope.tenantId,scope.spaceId,o.attemptId,o.reservationId])).rowCount,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
}
export async function currentScope(tx:SqlTransaction,scope:VerifiedScope):Promise<void>{
 await revalidateScope(scope,async()=>((await tx.query('SELECT fabric.controller_authority() AS authority')).rows[0]?.['authority']??null) as CurrentAuthority|null);
}
export async function commandLive(tx:SqlTransaction,expiresAt:string):Promise<void>{demand((await tx.query('SELECT $1::timestamptz>clock_timestamp() AS live',[expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');}
export async function recordCommand(tx:SqlTransaction,scope:VerifiedScope,key:string,digest:string,kind:string,receipt:unknown,hooks:RepositoryHooks={}):Promise<void>{
 const auditId=randomUUID(),outboxId=randomUUID(),p=[scope.tenantId,scope.spaceId];
 // Projection has identities/costs only; no prompt, credentials or private state.
 const projection={kind,commandKey:key,payloadDigest:digest,authorityRevision:scope.authorityRevision};
 await tx.query('INSERT INTO fabric.model_audit(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest,kind,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[...p,auditId,scope.actorId,key,digest,kind,JSON.stringify(projection)]);
 await hooks.afterStage?.('audit',tx);
 await tx.query('INSERT INTO fabric.model_outbox(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[...p,outboxId,auditId,scope.actorId,key,digest,JSON.stringify(projection)]);
 await hooks.afterStage?.('outbox',tx);
 await tx.query('INSERT INTO fabric.model_command_receipts(tenant_id,space_id,actor_id,command_key,payload_digest,audit_id,outbox_id,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[...p,scope.actorId,key,digest,auditId,outboxId,JSON.stringify(receipt)]);
}
export async function commandReceipt(tx:SqlTransaction,scope:VerifiedScope,key:string,digest:string):Promise<unknown|null>{
 const r=(await tx.query('SELECT payload_digest,receipt FROM fabric.model_command_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,key])).rows[0];
 if(!r)return null;demand(r['payload_digest']===digest,'IDEMPOTENCY_CONFLICT');return r['receipt'];
}
export async function appendModelEvent(tx:SqlTransaction,b:TaskCallBinding,input:Omit<ModelEvent,'sequence'>):Promise<void>{
 const seq=Number((await tx.query('SELECT coalesce(max(sequence),0) AS seq FROM fabric.model_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[b.tenantId,b.spaceId,b.sessionId])).rows[0]?.['seq']);
 const e=ModelEventSchema.parse({...input,sequence:safeAdd(seq,1)});
 await tx.query('INSERT INTO fabric.model_events VALUES($1,$2,$3,$4,$5::jsonb)',[b.tenantId,b.spaceId,b.sessionId,e.sequence,JSON.stringify(e)]);
}
export function eventBase(b:TaskCallBinding,operationId:string|null,attemptId:string|null){return {schemaVersion:1 as const,tenantId:b.tenantId,spaceId:b.spaceId,taskId:b.taskId,runId:b.runId,sessionId:b.sessionId,operationId,attemptId,generation:b.cancellationGeneration,at:new Date().toISOString()};}

/** Permit is minted only after acknowledged durable claim; never serialized. */
export interface DispatchPermit{readonly claimId:string}
type LivePermit={scope:VerifiedScope;binding:TaskCallBinding;request:EncodedRequest};
export class ModelRepository{
 private readonly permits=new WeakMap<object,LivePermit>();
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:CurrentModelAuthority,readonly hooks:RepositoryHooks={}){}
 async locked(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding,request:EncodedRequest):Promise<void>{
  demand(scope.tenantId===b.tenantId&&scope.spaceId===b.spaceId&&scope.actorId===b.actorId&&scope.payerId===b.payerId,'SCOPE_MISMATCH');
  demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  await assertRunUnfenced(tx,scope,b.runId);await assertParentUnfenced(tx,scope,b);await assertOtherRunsResolved(tx,scope,b);
  const row=(await tx.query('SELECT fabric.model_current($1,$2,true) AS binding',[b.runId,request.profileDigest])).rows[0]?.['binding'] as {record:unknown}|undefined;
  demand(row&&canonicalDigest(row.record)===canonicalDigest(b),'CHECK_BINDING_MISMATCH');
 }
 async fresh(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding,r:EncodedRequest):Promise<void>{
  await this.locked(tx,scope,b,r);await this.authority.assertCurrent(tx,scope,b,r);await currentScope(tx,scope);
 }
 async prepare(scope:VerifiedScope,raw:PrepareInput,installOwner?:(tx:SqlTransaction)=>Promise<void>):Promise<PreparedAttempt>{
  const b=TaskCallBindingSchema.parse(raw.binding),r=EncodedRequestSchema.parse(raw.request),command=CommandSchema.parse(raw.command),categories=decodeCategories(raw.categories),route=text.parse(raw.route);
  demand(command.retryCeiling<=3&&r.original.tenantId===b.tenantId&&r.original.spaceId===b.spaceId&&r.original.requestDigest===requestDigestOf(r),'CHECK_BINDING_MISMATCH');
  demand(safeAdd(...Object.values(categories))>=reserveEstimate(r.payload,r.outputCap),'CHECK_BINDING_MISMATCH');
  demand(canonicalDigest(raw.origin.scope)===canonicalDigest({tenantId:b.tenantId,spaceId:b.spaceId})&&raw.origin.taskId===b.taskId&&raw.origin.runId===b.runId&&raw.origin.requirementsRevision===b.requirementsRevision,'CHECK_BINDING_MISMATCH');
  const expectedOrigin=createRun({scope:{tenantId:b.tenantId,spaceId:b.spaceId},taskId:b.taskId,runId:b.runId,attempt:raw.origin.attempt,requirementsRevision:b.requirementsRevision,versions:{engine:b.versions.engineDigest,behavior:b.versions.behaviorDigest,schema:b.versions.schemaDigest,environment:b.versions.environmentDigest},generation:b.workerGeneration});
  demand(canonicalDigest(raw.origin)===canonicalDigest(expectedOrigin),'CHECK_BINDING_MISMATCH');
  const prefix=raw.nativePrefix.map(validateEvent),state=replaySession(raw.origin,prefix);
  demand(state.run.state==='running'&&state.pendingOperations.length===0&&state.pendingModel?.operationId===r.original.operationId&&state.pendingModel.reservationId===r.original.reservationId&&prefix.at(-1)?.kind==='model-pending','CHECK_BINDING_MISMATCH');
  const digest=hash({b,r,command,categories,route,prefix,origin:raw.origin});
  const prepared=await this.uow.withScope(scope,async tx=>{
   await this.locked(tx,scope,b,r);await lockOriginal(tx,scope,command.key);
   const prior=await commandReceipt(tx,scope,command.key,digest);
   if(prior){await installOwner?.(tx);await this.fresh(tx,scope,b,r);return parsePrepared(prior);}
   await assertNotRefused(tx,scope,r.original);await commandLive(tx,command.expiresAt);
   demand(Number((await tx.query('SELECT attempt FROM fabric.runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[b.tenantId,b.spaceId,b.runId])).rows[0]?.['attempt'])===raw.origin.attempt,'CHECK_BINDING_MISMATCH');
   demand(!(await tx.query("SELECT 1 FROM fabric.model_operations WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 AND record->>'status' IN('prepared','pending','unknown')",[b.tenantId,b.spaceId,b.runId])).rowCount,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   await this.authority.assertCurrent(tx,scope,b,r);
   await new TransactionBudgetRepository(tx).reserve(b.runId,r.original,categories);await this.hooks.afterStage?.('reserved',tx);
   const existing=(await tx.query('SELECT binding,origin FROM fabric.model_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[b.tenantId,b.spaceId,b.sessionId])).rows[0];
   if(existing)demand(canonicalDigest(existing['binding'])===canonicalDigest(b)&&canonicalDigest(existing['origin'])===canonicalDigest(raw.origin),'CHECK_BINDING_MISMATCH');
   else await tx.query('INSERT INTO fabric.model_sessions VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[b.tenantId,b.spaceId,b.sessionId,b.taskId,b.runId,JSON.stringify(b),JSON.stringify(raw.origin)]);
   const operation=ModelOperationSchema.parse({schemaVersion:1,tenantId:b.tenantId,spaceId:b.spaceId,operationId:r.original.operationId,taskId:b.taskId,runId:b.runId,sessionId:b.sessionId,sessionTurn:prefix.at(-1)!.sequence,originalKey:command.key,requestDigest:r.original.requestDigest,bindingDigest:hash(b),retryCeiling:command.retryCeiling,attemptsTaken:1,status:'prepared',knownReceiptId:null});
   const attempt=ModelAttemptSchema.parse({schemaVersion:1,original:r.original,ordinal:1,profileDigest:r.profileDigest,contextDigest:r.contextDigest,route,retryRequester:'engine',dispatchEpoch:r.dispatchEpoch,claimId:null,status:'prepared'});
   await tx.query('INSERT INTO fabric.model_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)',[b.tenantId,b.spaceId,operation.operationId,b.actorId,b.taskId,b.runId,b.sessionId,command.key,r.original.requestDigest,hash(b),JSON.stringify(b),JSON.stringify(r),JSON.stringify(operation)]);await this.hooks.afterStage?.('operation',tx);
   await tx.query('INSERT INTO fabric.model_attempts VALUES($1,$2,$3,$4,$5,1,$6::jsonb,$7::jsonb)',[b.tenantId,b.spaceId,r.original.attemptId,operation.operationId,r.original.reservationId,JSON.stringify(r),JSON.stringify(attempt)]);
   await installOwner?.(tx);await this.hooks.afterStage?.('attempt',tx);
   const persisted=(await tx.query('SELECT event FROM fabric.model_native_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[b.tenantId,b.spaceId,b.sessionId])).rows;
   demand(persisted.length<prefix.length&&persisted.every((row,i)=>canonicalDigest(row['event'])===canonicalDigest(prefix[i])),'STALE_REVISION');
   for(const e of prefix.slice(persisted.length))await tx.query('INSERT INTO fabric.model_native_events VALUES($1,$2,$3,$4,$5::jsonb)',[b.tenantId,b.spaceId,b.sessionId,e.sequence,JSON.stringify(e)]);
   await appendModelEvent(tx,b,{...eventBase(b,operation.operationId,attempt.original.attemptId),kind:'model-prepared',payload:{original:r.original,bindingDigest:hash(b),profileDigest:r.profileDigest,reservedUnits:safeAdd(...Object.values(categories))}});
   await this.hooks.afterStage?.('pending',tx);
   const result={operation,attempt,acknowledgedCommit:false};await recordCommand(tx,scope,command.key,digest,'model-prepared',result,this.hooks);
   await this.fresh(tx,scope,b,r);await commandLive(tx,command.expiresAt);return result;
  });
  return {...prepared,acknowledgedCommit:true};
 }
 async lookup(scope:VerifiedScope,key:string,digest:string):Promise<{status:'committed';prepared:PreparedAttempt}|{status:'absent-safe'}>{
  text.parse(key);
  return this.uow.withScope(scope,async tx=>{demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');await lockOriginal(tx,scope,key);const old=await commandReceipt(tx,scope,key,digest);await currentScope(tx,scope);return old?{status:'committed',prepared:parsePrepared(old)}:{status:'absent-safe'};});
 }
 async claim(scope:VerifiedScope,attemptId:string):Promise<DispatchPermit|null>{
  const live=await this.uow.withScope(scope,async tx=>{
   demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
   const row=(await tx.query('SELECT a.record,a.request,o.binding,o.original_key FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.attempt_id=$3',[scope.tenantId,scope.spaceId,attemptId])).rows[0];demand(row,'UNAUTHORIZED');
   const b=TaskCallBindingSchema.parse(row['binding']),r=EncodedRequestSchema.parse(row['request']),attempt=ModelAttemptSchema.parse(row['record']);await this.locked(tx,scope,b,r);await lockOriginal(tx,scope,String(row['original_key']));
   if((await tx.query('SELECT 1 FROM fabric.model_claims WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[b.tenantId,b.spaceId,attemptId])).rowCount){await this.fresh(tx,scope,b,r);return null;}
   demand(attempt.status==='prepared','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');const claimId=randomUUID();
   await tx.query('INSERT INTO fabric.model_claims(tenant_id,space_id,claim_id,attempt_id,dispatch_epoch) VALUES($1,$2,$3,$4,$5)',[b.tenantId,b.spaceId,claimId,attemptId,r.dispatchEpoch]);
   await tx.query('UPDATE fabric.model_attempts SET record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[b.tenantId,b.spaceId,attemptId,JSON.stringify(ModelAttemptSchema.parse({...attempt,claimId,status:'claimed'}))]);
   await this.hooks.afterStage?.('claim',tx);
   await appendModelEvent(tx,b,{...eventBase(b,r.original.operationId,attemptId),kind:'attempt-admitted',payload:{original:r.original,ordinal:attempt.ordinal,dispatchEpoch:r.dispatchEpoch}});
   await recordCommand(tx,scope,'claim:'+attemptId,hash({original:r.original,claimId}),'attempt-admitted',{claimId},this.hooks);
   await this.fresh(tx,scope,b,r);return {claimId,binding:b,request:r};
  });
  if(!live)return null;
  const permit=Object.freeze({claimId:live.claimId});this.permits.set(permit,{scope,binding:live.binding,request:live.request});return permit;
 }
 async withDispatch<T>(scope:VerifiedScope,permit:DispatchPermit,dispatch:(tx:SqlTransaction,request:EncodedRequest)=>Promise<T>):Promise<T>{
  const live=this.permits.get(permit);demand(live&&live.scope===scope,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
  // Burn before any await. Rollback, exception, Stop or restart cannot regrant it.
  this.permits.delete(permit);
  return this.uow.withScope(scope,async tx=>{
   await this.fresh(tx,scope,live.binding,live.request);
   demand((await tx.query('SELECT 1 FROM fabric.model_claims WHERE tenant_id=$1 AND space_id=$2 AND claim_id=$3 AND attempt_id=$4',[scope.tenantId,scope.spaceId,permit.claimId,live.request.original.attemptId])).rowCount===1,'CHECK_BINDING_MISMATCH');
   const row=(await tx.query('SELECT original_key FROM fabric.model_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[scope.tenantId,scope.spaceId,live.request.original.operationId])).rows[0];demand(row,'CHECK_BINDING_MISMATCH');await lockOriginal(tx,scope,String(row['original_key']));
   const result=await dispatch(tx,live.request);await this.fresh(tx,scope,live.binding,live.request);return result;
  });
 }
 async topUp(scope:VerifiedScope,input:{allowanceId:string;addedUnits:number;key:string;expiresAt:string}):Promise<{revision:number;autoResumed:false}>{
  const parsed=TopUpCommandSchema.parse(input),added=parsed.addedUnits,key=parsed.key,expires=parsed.expiresAt;const digest=hash({kind:'top-up',...parsed});
  demand(scope.grants.includes('budget:control'),'UNAUTHORIZED');
  return this.uow.withScope(scope,async tx=>{
   demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');await lockOriginal(tx,scope,key);
   const old=await commandReceipt(tx,scope,key,digest);if(old){await currentScope(tx,scope);return old as {revision:number;autoResumed:false};}
   await commandLive(tx,expires);
   const revision=Number((await tx.query('SELECT fabric.model_top_up($1,$2) AS revision',[input.allowanceId,added])).rows[0]?.['revision']);
   const receipt={revision,autoResumed:false as const};await recordCommand(tx,scope,key,digest,'allowance-changed',receipt,this.hooks);await currentScope(tx,scope);await commandLive(tx,expires);return receipt;
  });
 }
}
export function parsePrepared(value:unknown):PreparedAttempt{
 demand(value!==null&&typeof value==='object');const v=value as {operation:unknown;attempt:unknown};
 return {operation:ModelOperationSchema.parse(v.operation),attempt:ModelAttemptSchema.parse(v.attempt),acknowledgedCommit:false};
}
