import { canonicalDigest } from './native-imports.js';
import { demand } from './errors.js';
import { safeAdd } from './arithmetic.js';
import { ModelOperationSchema } from './schema.js';
import type { SqlTransaction,VerifiedScope,ModelOperation } from './contracts.js';
/** Durable retry count owner, borrowed transaction. Only original-owner proofs
 * qualified by the usage layer may call admission; this layer cannot replay. */
export class TransactionRetryRepository{
 constructor(readonly tx:SqlTransaction){}
 async current(scope:VerifiedScope,operationId:string):Promise<ModelOperation>{
  const row=(await this.tx.query('SELECT record FROM fabric.model_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 FOR UPDATE',[scope.tenantId,scope.spaceId,operationId])).rows[0];demand(row,'UNAUTHORIZED');return ModelOperationSchema.parse(row['record']);
 }
 async increment(scope:VerifiedScope,operation:ModelOperation):Promise<number>{
  const installed=await this.current(scope,operation.operationId);
  demand(canonicalDigest(ModelOperationSchema.parse(operation))===canonicalDigest(installed),'STALE_REVISION');
  demand(operation.attemptsTaken<operation.retryCeiling&&operation.status==='safely-failed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
  const count=safeAdd(operation.attemptsTaken,1);
  await this.tx.query('UPDATE fabric.model_operations SET record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[scope.tenantId,scope.spaceId,operation.operationId,JSON.stringify({...operation,attemptsTaken:count,status:'prepared'})]);return count;
 }
}

import { randomUUID } from 'node:crypto';
import { EncodedRequestSchema,OriginalCallSchema,ModelAttemptSchema,TaskCallBindingSchema } from './schema.js';
import { object,enumeration,text,timestamp } from './decoder.js';
import { UsageRepository,type InstalledReceiptOwner } from './usage-repository.js';
import { ModelRepository,assertNotRefused,hash,lockOriginal,commandReceipt,commandLive,recordCommand,appendModelEvent,eventBase,type RepositoryHooks } from './model-repository.js';
import { TransactionBudgetRepository,decodeCategories,type ReservationCategories } from './budget-repository.js';
import { requestDigestOf } from './test-adapter.js';
import { validateEvent,type DomainEvent } from '../../engine/contracts/src/events.js';
import { replaySession,type RunRecord } from './native-imports.js';
import { reserveEstimate } from './arithmetic.js';
import type { OriginalCall,EncodedRequest,PreparedAttempt } from './contracts.js';
const RetrySchema=object({previous:OriginalCallSchema,request:EncodedRequestSchema,requester:enumeration('engine','adapter'),key:text,expiresAt:timestamp,route:text,categories:{parse:decodeCategories}});
export interface RetryInput{previous:OriginalCall;request:EncodedRequest;requester:'engine'|'adapter';key:string;expiresAt:string;route:string;categories:ReservationCategories}
export interface NativeRetryPrefix{origin:RunRecord;events:readonly DomainEvent[]}
/** One durable counter for both labels. The caller cannot supply a new ceiling. */
export class RetryRepository{
 constructor(readonly model:ModelRepository,readonly usage:UsageRepository,readonly hooks:RepositoryHooks={}){}
 async take(scope:VerifiedScope,raw:RetryInput,owner:InstalledReceiptOwner,native?:NativeRetryPrefix):Promise<PreparedAttempt>{
  const input=RetrySchema.parse(raw),categories=input.categories,r=input.request,o=r.original;
  demand(o.requestDigest===requestDigestOf(r)&&o.operationId===input.previous.operationId&&o.tenantId===input.previous.tenantId&&o.spaceId===input.previous.spaceId&&o.attemptId!==input.previous.attemptId&&o.reservationId!==input.previous.reservationId,'CHECK_BINDING_MISMATCH');
  demand(safeAdd(...Object.values(categories))>=reserveEstimate(r.payload,r.outputCap)&&owner.route===input.route&&owner.profileDigest===r.profileDigest,'CHECK_BINDING_MISMATCH');
  const prefix=native?.events.map(validateEvent);
  if(native&&prefix){const state=replaySession(native.origin,prefix);demand(state.run.state==='running'&&state.pendingOperations.length===0&&state.pendingModel?.operationId===o.operationId&&state.pendingModel.reservationId===o.reservationId&&prefix.at(-1)?.kind==='model-pending','CHECK_BINDING_MISMATCH');}
  const digest=hash({input,categories,owner:{ownerId:owner.ownerId,route:owner.route,profileDigest:owner.profileDigest},...(native?{native:{origin:native.origin,events:prefix}}:{})});
  const result=await this.model.uow.withScope(scope,async tx=>{
   const state=await this.usage.load(tx,scope,input.previous);await this.model.fresh(tx,scope,state.binding,r);await lockOriginal(tx,scope,input.key);
   const prior=await commandReceipt(tx,scope,input.key,digest);if(prior){await this.model.fresh(tx,scope,state.binding,r);const p=prior as PreparedAttempt;return {operation:ModelOperationSchema.parse(p.operation),attempt:ModelAttemptSchema.parse(p.attempt),acknowledgedCommit:false};}
   await assertNotRefused(tx,scope,o);await commandLive(tx,input.expiresAt);
   demand(state.operation.status==='safely-failed'&&state.attempt.ordinal===state.operation.attemptsTaken&&state.operation.attemptsTaken<state.operation.retryCeiling,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const proof=(await tx.query('SELECT record FROM fabric.model_resolutions WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[scope.tenantId,scope.spaceId,input.previous.attemptId])).rows[0]?.['record'] as {status?:string;receipt?:{outcome?:string}}|undefined;
   demand(proof&&(proof.status==='sealed-not-accepted'||(proof.status==='settled'&&proof.receipt?.outcome!=='answer')),'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const ordinal=await new TransactionRetryRepository(tx).increment(scope,state.operation);
   if(native&&prefix){
    const session=(await tx.query('SELECT origin FROM fabric.model_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,state.binding.sessionId])).rows[0];demand(session&&hash(session['origin'])===hash(native.origin),'CHECK_BINDING_MISMATCH');
    const persisted=(await tx.query('SELECT event FROM fabric.model_native_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[scope.tenantId,scope.spaceId,state.binding.sessionId])).rows;
    demand(persisted.length<prefix.length&&persisted.every((row,i)=>hash(row['event'])===hash(prefix[i])),'STALE_REVISION');
    for(const e of prefix.slice(persisted.length))await tx.query('INSERT INTO fabric.model_native_events VALUES($1,$2,$3,$4,$5::jsonb)',[scope.tenantId,scope.spaceId,state.binding.sessionId,e.sequence,JSON.stringify(e)]);
   }
   await new TransactionBudgetRepository(tx).reserve(state.binding.runId,o,categories);await this.hooks.afterStage?.('reserved',tx);
   const attempt=ModelAttemptSchema.parse({schemaVersion:1,original:o,ordinal,profileDigest:r.profileDigest,contextDigest:r.contextDigest,route:input.route,retryRequester:input.requester,dispatchEpoch:r.dispatchEpoch,claimId:null,status:'prepared'});
   await tx.query('INSERT INTO fabric.model_attempts VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[o.tenantId,o.spaceId,o.attemptId,o.operationId,o.reservationId,ordinal,JSON.stringify(r),JSON.stringify(attempt)]);
   await tx.query('INSERT INTO fabric.model_receipt_owners VALUES($1,$2,$3,$4,$5,$6)',[o.tenantId,o.spaceId,o.attemptId,owner.ownerId,owner.route,owner.profileDigest]);await this.hooks.afterStage?.('attempt',tx);
   const operation=ModelOperationSchema.parse({...state.operation,attemptsTaken:ordinal,status:'prepared',knownReceiptId:null}),receipt={operation,attempt,acknowledgedCommit:false};
   await appendModelEvent(tx,state.binding,{...eventBase(state.binding,o.operationId,o.attemptId),kind:'model-prepared',payload:{original:o,bindingDigest:hash(TaskCallBindingSchema.parse(state.binding)),profileDigest:r.profileDigest,reservedUnits:safeAdd(...Object.values(categories))}});
   await recordCommand(tx,scope,input.key,digest,'retry-prepared',receipt,this.hooks);await this.model.fresh(tx,scope,state.binding,r);await commandLive(tx,input.expiresAt);return receipt;
  });
  return {...result,acknowledgedCommit:true};
 }
}
