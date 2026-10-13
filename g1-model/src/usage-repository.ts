import { canonicalDigest,lockSpaceBarrier } from './native-imports.js';
import { ModelAttemptSchema,ModelOperationSchema,TaskCallBindingSchema,EncodedRequestSchema,OriginalCallSchema,OwnerObservationSchema } from './schema.js';
import { object,text,timestamp,uuid } from './decoder.js';
import { demand,ModelError } from './errors.js';
import { safeAdd,PENDING_EXPOSURE,units } from './arithmetic.js';
import { lockOriginal,currentScope,hash,eventBase,appendModelEvent,recordCommand,commandReceipt,commandLive,type CurrentModelAuthority,type RepositoryHooks } from './model-repository.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,OriginalCall,OwnerObservation,EncodedRequest,TaskCallBinding,ModelAttempt,ModelOperation } from './contracts.js';
export interface InstalledReceiptOwner{readonly ownerId:string;readonly route:string;readonly profileDigest:string}
export interface OriginalState{binding:TaskCallBinding;request:EncodedRequest;attempt:ModelAttempt;operation:ModelOperation;owner:InstalledReceiptOwner}
export interface UsageResult{readonly status:OwnerObservation['status'];readonly observation:OwnerObservation;readonly conformance:boolean;readonly replayAllowed:false}
export interface UsageHooks extends RepositoryHooks{afterUsage?:(tx:SqlTransaction)=>Promise<void>}
export class UsageRepository{
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:CurrentModelAuthority,readonly hooks:UsageHooks={}){}
 async load(tx:SqlTransaction,scope:VerifiedScope,raw:OriginalCall,control=false):Promise<OriginalState>{
  const o=OriginalCallSchema.parse(raw);demand(scope.tenantId===o.tenantId&&scope.spaceId===o.spaceId,'SCOPE_MISMATCH');demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  const query=()=>tx.query('SELECT a.record AS attempt,a.request,o.binding,o.record AS operation,p.owner_id,p.route,p.profile_digest FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) LEFT JOIN fabric.model_receipt_owners p USING(tenant_id,space_id,attempt_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.attempt_id=$3',[o.tenantId,o.spaceId,o.attemptId]);
  const first=(await query()).rows[0];demand(first,'UNAUTHORIZED');const op=ModelOperationSchema.parse(first['operation']);await lockOriginal(tx,scope,op.originalKey);
  const row=(await query()).rows[0];demand(row,'UNAUTHORIZED');const attempt=ModelAttemptSchema.parse(row['attempt']);demand(canonicalDigest(attempt.original)===canonicalDigest(o),'CHECK_BINDING_MISMATCH');
  const state={binding:TaskCallBindingSchema.parse(row['binding']),request:EncodedRequestSchema.parse(row['request']),attempt,operation:ModelOperationSchema.parse(row['operation']),owner:{ownerId:uuid.parse(row['owner_id']),route:text.parse(row['route']),profileDigest:text.parse(row['profile_digest'])}};
  await this.current(tx,scope,state,control);return state;
 }
 async current(tx:SqlTransaction,scope:VerifiedScope,state:OriginalState,control=false):Promise<void>{
  const b=state.binding;
  demand(scope.tenantId===b.tenantId&&scope.spaceId===b.spaceId&&scope.payerId===b.payerId&&(control||scope.actorId===b.actorId),'SCOPE_MISMATCH');
  const record=(await tx.query('SELECT fabric.model_recovery_current($1,$2) AS binding',[b.runId,control])).rows[0]?.['binding'];demand(canonicalDigest(record)===canonicalDigest(b),'CHECK_BINDING_MISMATCH');
  if(!control)await this.authority.assertCurrent(tx,scope,b,state.request);await currentScope(tx,scope);
 }
 async install(scope:VerifiedScope,original:OriginalCall,raw:InstalledReceiptOwner):Promise<void>{
  const owner={ownerId:uuid.parse(raw.ownerId),route:text.parse(raw.route),profileDigest:text.parse(raw.profileDigest)},o=OriginalCallSchema.parse(original);
  await this.uow.withScope(scope,tx=>this.installInTransaction(tx,scope,o,owner));
 }
 /** Initial admission borrows its reservation transaction; owner cannot lag COMMIT. */
 async installInTransaction(tx:SqlTransaction,scope:VerifiedScope,original:OriginalCall,raw:InstalledReceiptOwner):Promise<void>{
   const owner={ownerId:uuid.parse(raw.ownerId),route:text.parse(raw.route),profileDigest:text.parse(raw.profileDigest)},o=OriginalCallSchema.parse(original);
   demand(scope.tenantId===o.tenantId&&scope.spaceId===o.spaceId,'SCOPE_MISMATCH');
   demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
   const row=(await tx.query('SELECT a.record AS attempt,a.request,o.binding,o.record AS operation FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.attempt_id=$3',[scope.tenantId,scope.spaceId,o.attemptId])).rows[0];demand(row,'UNAUTHORIZED');
   const attempt=ModelAttemptSchema.parse(row['attempt']),request=EncodedRequestSchema.parse(row['request']),binding=TaskCallBindingSchema.parse(row['binding']),operation=ModelOperationSchema.parse(row['operation']);await lockOriginal(tx,scope,operation.originalKey);
   demand(canonicalDigest(attempt.original)===canonicalDigest(o)&&attempt.route===owner.route&&attempt.profileDigest===owner.profileDigest,'CHECK_BINDING_MISMATCH');
   const prior=(await tx.query('SELECT owner_id,route,profile_digest FROM fabric.model_receipt_owners WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[o.tenantId,o.spaceId,o.attemptId])).rows[0];
   if(prior)demand(prior['owner_id']===owner.ownerId&&prior['route']===owner.route&&prior['profile_digest']===owner.profileDigest,'IDEMPOTENCY_CONFLICT');
   else{demand(attempt.status==='prepared','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');await tx.query('INSERT INTO fabric.model_receipt_owners VALUES($1,$2,$3,$4,$5,$6)',[o.tenantId,o.spaceId,o.attemptId,owner.ownerId,owner.route,owner.profileDigest]);}
   await this.current(tx,scope,{binding,request,attempt,operation,owner});
 }
 async observe(tx:SqlTransaction,scope:VerifiedScope,state:OriginalState,raw:OwnerObservation):Promise<UsageResult>{
  const observation=OwnerObservationSchema.parse(raw),o=state.attempt.original,observedOriginal=observation.status==='settled'?observation.receipt.original:observation.original;
  demand(canonicalDigest(o)===canonicalDigest(observedOriginal),'CHECK_BINDING_MISMATCH');
  if(observation.status==='settled'||observation.status==='sealed-not-accepted')demand((observation.status==='settled'?observation.receipt.ownerId:observation.ownerId)===state.owner.ownerId,'CHECK_BINDING_MISMATCH');
  await this.current(tx,scope,state);
  if(state.attempt.status==='prepared'&&observation.status!=='sealed-not-accepted'){
   // Absence retains liability. Only the installed original owner's permanent
   // seal can release unclaimed work, without minting a dispatch claim.
   demand(observation.status==='unknown','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');await this.current(tx,scope,state);return {status:'unknown',observation,conformance:true,replayAllowed:false};
  }
  const prior=(await tx.query('SELECT record FROM fabric.model_resolutions WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[o.tenantId,o.spaceId,o.attemptId])).rows[0];
  if(prior)demand(canonicalDigest(prior['record'])===canonicalDigest(observation),'IDEMPOTENCY_CONFLICT');
  let response:unknown;
  try{response=(await tx.query('SELECT fabric.model_apply_observation($1,$2::jsonb) AS result',[o.attemptId,JSON.stringify(observation)])).rows[0]?.['result'];}catch(e){if((e as {code?:string}).code==='23505')throw new ModelError('IDEMPOTENCY_CONFLICT');throw e;}
  const value=response as {status:OwnerObservation['status'];conformance:boolean};
  if(!prior){
   const status=observation.status==='sealed-not-accepted'?'sealed-not-accepted':observation.status;
   await tx.query('UPDATE fabric.model_attempts SET record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[o.tenantId,o.spaceId,o.attemptId,JSON.stringify(ModelAttemptSchema.parse({...state.attempt,status}))]);
   // An old resolved attempt must never change the currently admitted ordinal.
   demand(state.attempt.ordinal===state.operation.attemptsTaken,'STALE_REVISION');
   const opStatus=observation.status==='sealed-not-accepted'||(observation.status==='settled'&&observation.receipt.outcome!=='answer')?'safely-failed':observation.status==='settled'?'settled':observation.status==='accepted'?'pending':'unknown';
   await tx.query('UPDATE fabric.model_operations SET record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[o.tenantId,o.spaceId,o.operationId,JSON.stringify(ModelOperationSchema.parse({...state.operation,status:opStatus,knownReceiptId:opStatus==='settled'&&observation.status==='settled'?observation.receipt.receiptId:null}))]);
   await this.hooks.afterUsage?.(tx);
   const kind=observation.status==='settled'?'usage-settled':observation.status==='sealed-not-accepted'?'model-safely-failed':observation.status==='accepted'?'model-accepted':'usage-unknown';
   const payload=observation.status==='settled'?{receiptId:observation.receipt.receiptId,measuredUnits:observation.receipt.measuredUnits}:observation.status==='sealed-not-accepted'?{proofId:observation.proofId,dispatchEpoch:observation.dispatchEpoch}:observation.status==='accepted'?{original:o}:{original:o,replayAllowed:false as const};
   // Pending lookups use a stable idempotency key, while distinct final proofs
   // are immutable. Repeated unknowns do not generate a second audit/event.
   const key='usage:'+o.attemptId+':'+observation.status,digest=hash(observation);
   if(!(await commandReceipt(tx,scope,key,digest))){await appendModelEvent(tx,state.binding,{...eventBase(state.binding,o.operationId,o.attemptId),kind,payload} as Parameters<typeof appendModelEvent>[2]);await recordCommand(tx,scope,key,digest,kind,{observation,conformance:value.conformance},this.hooks);}
  }
  await this.current(tx,scope,state);return {status:observation.status,observation,conformance:value.conformance,replayAllowed:false};
 }
 async cover(scope:VerifiedScope,raw:{original:OriginalCall;key:string;expiresAt:string}):Promise<{attemptId:string;coveredUnits:number;autoResumed:false}>{
  const input=object({original:OriginalCallSchema,key:text,expiresAt:timestamp}).parse(raw),digest=hash({kind:'deficit-cover',...input});demand(scope.grants.includes('budget:control'),'UNAUTHORIZED');
  return this.uow.withScope(scope,async tx=>{
   const state=await this.load(tx,scope,input.original,true);await lockOriginal(tx,scope,input.key);
   const old=await commandReceipt(tx,scope,input.key,digest);if(old){await this.current(tx,scope,state,true);return old as {attemptId:string;coveredUnits:number;autoResumed:false};}
   await commandLive(tx,input.expiresAt);let receipt:unknown;
   try{receipt=(await tx.query('SELECT fabric.model_cover_deficit($1,$2) AS result',[input.original.attemptId,input.key])).rows[0]?.['result'];}catch(e){if((e as {code?:string}).code==='23505')throw new ModelError('IDEMPOTENCY_CONFLICT');throw e;}
   await recordCommand(tx,scope,input.key,digest,'deficit-covered',receipt,this.hooks);await this.current(tx,scope,state,true);await commandLive(tx,input.expiresAt);return receipt as {attemptId:string;coveredUnits:number;autoResumed:false};
  });
 }
 /** Scope-local view. Economic actual is counted once per original receipt,
  * never the sum of ancestor subtotals. Covers move deficit into base only. */
 async exposure(scope:VerifiedScope):Promise<{reserved:number;pendingExposure:number;maximumLocalExposure:number;economicActual:number;uncoveredDeficit:number;conformance:boolean}>{
  return this.uow.withScope(scope,async tx=>{
   const result=(await tx.query('SELECT fabric.model_exposure() AS view')).rows[0]?.['view'] as {reserved:number;pendingExposure:number;maximumLocalExposure:number;economicActual:number;uncoveredDeficit:number;conformance:boolean};
   units(result.reserved);units(result.pendingExposure);units(result.economicActual);units(result.uncoveredDeficit);demand(result.maximumLocalExposure===safeAdd(result.reserved,result.pendingExposure),'CHECK_BINDING_MISMATCH');await currentScope(tx,scope);return result;
  });
 }
}
