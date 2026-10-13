import { randomUUID } from 'node:crypto';
import { createRun } from '../../engine/scheduler/src/run-state.js';
import { validateEvent,type DomainEvent } from '../../engine/contracts/src/events.js';
import { FenceRepository } from '../../g1-recovery/src/fence-repository.js';
import { RecoveryRepository } from '../../g1-recovery/src/repository.js';
import type { ScopeBindingLookup } from '../../g1-identity/src/contracts.js';
import { SessionLoop,replaySession,lockSpaceBarrier,assertRunUnfenced,canonicalDigest,type RunRecord } from './native-imports.js';
import { assertParentUnfenced,assertOtherRunsResolved } from './native-guard.js';
import { object,text,body,uuid,literal,refined,revision,positive,timestamp,nullable,boolean,enumeration,list } from './decoder.js';
import { WaitSchema,TaskCallBindingSchema,OriginalCallSchema } from './schema.js';
import { ProfileChoiceSchema,AUTO_CHOICE,ProfileNeedSchema } from './profile.js';
import { lockOriginal,currentScope,commandLive,recordCommand,commandReceipt,hash,appendModelEvent,eventBase,type RepositoryHooks } from './model-repository.js';
import { safeAdd } from './arithmetic.js';
import { demand,ModelError } from './errors.js';
import type { VerifiedScope,SqlTransaction,AsyncUnitOfWork,TaskCallBinding,OriginalCall,WaitRecord } from './contracts.js';
export const AdmissionSchema=refined(object({executionClass:enumeration('service','computer','target'),computerCapability:nullable(literal('simulated-computer')),maxInputBytes:positive,need:ProfileNeedSchema,targetEffect:boolean,approvalRequired:boolean,resourceId:nullable(uuid),ongoingCharges:list(enumeration('reserved-compute','retained-storage','network'),3)}),s=>s.executionClass==='computer'?(s.computerCapability!==null):(s.computerCapability===null&&s.resourceId===null));
export type NativeAdmission=ReturnType<typeof AdmissionSchema.parse>;
const ControlSchema=object({choice:ProfileChoiceSchema,wait:nullable(WaitSchema),inputLimitBytes:positive});
export const NativeCommandSchema=object({sessionId:uuid,key:uuid,expectedRevision:revision,expiresAt:timestamp});
export const TurnCommandSchema=object({sessionId:uuid,key:uuid,expectedRevision:revision,expiresAt:timestamp,input:body,choice:nullable(ProfileChoiceSchema)});
export const RetryTurnCommandSchema=object({sessionId:uuid,key:uuid,expectedRevision:revision,expiresAt:timestamp,input:body,choice:nullable(ProfileChoiceSchema),operationId:uuid});
export const ResumeCommandSchema=object({sessionId:uuid,key:uuid,expectedRevision:revision,expiresAt:timestamp,inputLimitBytes:positive});
export const SwitchCommandSchema=object({sessionId:uuid,key:uuid,expectedRevision:revision,expiresAt:timestamp,choice:ProfileChoiceSchema});
export const TopUpSchema=object({sessionId:uuid,key:uuid,expiresAt:timestamp,allowanceId:uuid,expectedAllowanceRevision:positive,addedUnits:positive});
export const StopSchema=object({sessionId:uuid,key:uuid,expiresAt:timestamp,observedRevision:revision});
export interface NativeSnapshot {binding:TaskCallBinding;origin:RunRecord;admission:NativeAdmission;control:ReturnType<typeof ControlSchema.parse>;revision:number;events:DomainEvent[];stopped:boolean;cancellationGeneration:number}
const ids=(s:VerifiedScope,id:string)=>[s.tenantId,s.spaceId,id];
const same=(a:unknown,b:unknown)=>canonicalDigest(a)===canonicalDigest(b);
export class NativeRepository{
 constructor(readonly uow:AsyncUnitOfWork,readonly bindingFor:ScopeBindingLookup,readonly hooks:RepositoryHooks={}){}
 /** Trusted admission only. There is no operator endpoint accepting identities or grants. */
 async open(scope:VerifiedScope,runId:string,raw:NativeAdmission):Promise<string>{
  uuid.parse(runId);const admission=AdmissionSchema.parse(raw);demand(admission.maxInputBytes<=1_048_576);
  return this.uow.withScope(scope,async tx=>{
   demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
   const row=(await tx.query('SELECT fabric.model_current($1,NULL,false) AS binding',[runId])).rows[0]?.['binding'] as {record:unknown}|undefined;demand(row,'UNAUTHORIZED');const b=TaskCallBindingSchema.parse(row.record);
   await assertRunUnfenced(tx,scope,runId);await assertParentUnfenced(tx,scope,b);await assertOtherRunsResolved(tx,scope,b);
   const origin=createRun({scope:{tenantId:b.tenantId,spaceId:b.spaceId},taskId:b.taskId,runId:b.runId,attempt:Number((await tx.query('SELECT attempt FROM fabric.runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',ids(scope,runId))).rows[0]?.['attempt']),requirementsRevision:b.requirementsRevision,versions:{engine:b.versions.engineDigest,behavior:b.versions.behaviorDigest,schema:b.versions.schemaDigest,environment:b.versions.environmentDigest},generation:b.workerGeneration});
   const old=(await tx.query('SELECT admission FROM fabric.model_native_controls WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',ids(scope,b.sessionId))).rows[0];
   if(old){demand(same(old['admission'],admission),'IDEMPOTENCY_CONFLICT');await currentScope(tx,scope);return b.sessionId;}
   const existing=(await tx.query('SELECT binding,origin FROM fabric.model_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',ids(scope,b.sessionId))).rows[0];
   if(existing)demand(same(existing['binding'],b)&&same(existing['origin'],origin),'CHECK_BINDING_MISMATCH');
   else await tx.query('INSERT INTO fabric.model_sessions VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[...ids(scope,b.sessionId),b.taskId,b.runId,JSON.stringify(b),JSON.stringify(origin)]);
   await tx.query('INSERT INTO fabric.model_native_controls VALUES($1,$2,$3,0,$4::jsonb,$5::jsonb)',[...ids(scope,b.sessionId),JSON.stringify(admission),JSON.stringify({choice:AUTO_CHOICE,wait:null,inputLimitBytes:admission.maxInputBytes})]);
   await currentScope(tx,scope);return b.sessionId;
  });
 }
 async load(tx:SqlTransaction,scope:VerifiedScope,sessionId:string):Promise<NativeSnapshot>{
  uuid.parse(sessionId);demand(scope.grants.includes('task:read'),'UNAUTHORIZED');demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  const row=(await tx.query('SELECT s.binding,s.origin,c.admission,c.record,c.revision,t.cancellation_generation,coalesce(f.blocked,false) AS stopped FROM fabric.model_sessions s JOIN fabric.model_native_controls c USING(tenant_id,space_id,session_id) JOIN fabric.tasks t USING(tenant_id,space_id,task_id) LEFT JOIN fabric.recovery_task_controls f USING(tenant_id,space_id,task_id) WHERE s.tenant_id=$1 AND s.space_id=$2 AND s.session_id=$3',ids(scope,sessionId))).rows[0];demand(row,'UNAUTHORIZED');
  const b=TaskCallBindingSchema.parse(row['binding']);demand(b.payerId===scope.payerId,'SCOPE_MISMATCH');
  const events=(await tx.query('SELECT event FROM fabric.model_native_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',ids(scope,sessionId))).rows.map(r=>validateEvent(r['event'] as DomainEvent));
  const origin=row['origin'] as RunRecord;replaySession(origin,events);await currentScope(tx,scope);
  return {binding:b,origin,admission:AdmissionSchema.parse(row['admission']),control:ControlSchema.parse(row['record']),revision:revision.parse(Number(row['revision'])),events,stopped:row['stopped']===true,cancellationGeneration:revision.parse(Number(row['cancellation_generation']))};
 }
 async snapshot(scope:VerifiedScope,sessionId:string):Promise<NativeSnapshot>{return this.uow.withScope(scope,tx=>this.load(tx,scope,sessionId));}
 async fresh(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot):Promise<void>{
  demand(scope.grants.includes('task:write')&&scope.actorId===s.binding.actorId,'UNAUTHORIZED');demand(!s.stopped,'STALE_FENCE');
  // Admission can call fresh directly, without load in this transaction.
  // Acquire the same barrier before observing any continuation/model fence.
  demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  await assertRunUnfenced(tx,scope,s.binding.runId);await assertParentUnfenced(tx,scope,s.binding);await assertOtherRunsResolved(tx,scope,s.binding);
  const row=(await tx.query('SELECT fabric.model_current($1,NULL,false) AS binding',[s.binding.runId])).rows[0]?.['binding'] as {record:unknown}|undefined;demand(row&&same(row.record,s.binding),'CHECK_BINDING_MISMATCH');await currentScope(tx,scope);
 }
 async append(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot,raw:readonly DomainEvent[]):Promise<void>{
  const events=raw.map(validateEvent);replaySession(s.origin,events);
  const old=(await tx.query('SELECT event FROM fabric.model_native_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',ids(scope,s.binding.sessionId))).rows;
  demand(old.length<=events.length&&old.every((r,i)=>same(r['event'],events[i])),'STALE_REVISION');
  for(const e of events.slice(old.length))await tx.query('INSERT INTO fabric.model_native_events VALUES($1,$2,$3,$4,$5::jsonb)',[...ids(scope,s.binding.sessionId),e.sequence,JSON.stringify(e)]);
 }
 async save(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot,events:readonly DomainEvent[],control:NativeSnapshot['control']):Promise<void>{
  await this.append(tx,scope,s,events);const decoded=ControlSchema.parse(control);
  demand((await tx.query('UPDATE fabric.model_native_controls SET revision=revision+1,record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 AND revision=$5',[...ids(scope,s.binding.sessionId),JSON.stringify(decoded),s.revision])).rowCount===1,'STALE_REVISION');
 }
 async persist(scope:VerifiedScope,s:NativeSnapshot,events:readonly DomainEvent[],wait:WaitRecord|null,key:string,requireFresh=true):Promise<void>{
  await this.uow.withScope(scope,async tx=>{
   const current=await this.load(tx,scope,s.binding.sessionId);demand(current.revision===s.revision,'STALE_REVISION');
   if(requireFresh)await this.fresh(tx,scope,current);else demand(scope.actorId===current.binding.actorId&&scope.grants.includes('task:write'),'UNAUTHORIZED');
   await this.save(tx,scope,current,events,{...s.control,wait});await recordCommand(tx,scope,key,hash({events,wait}),'native-checkpoint',{sessionId:s.binding.sessionId},this.hooks);
   if(requireFresh)await this.fresh(tx,scope,current);await currentScope(tx,scope);
  });
 }
 async denied(scope:VerifiedScope,s:NativeSnapshot,events:readonly DomainEvent[],original:OriginalCall,reason:'budget'|'overrun'):Promise<void>{
  const o=OriginalCallSchema.parse(original);await this.uow.withScope(scope,async tx=>{
   const current=await this.load(tx,scope,s.binding.sessionId);await this.fresh(tx,scope,current);demand(current.revision===s.revision,'STALE_REVISION');
   demand(!(await tx.query('SELECT 1 FROM fabric.model_attempts WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',ids(scope,o.attemptId))).rowCount,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   await this.append(tx,scope,current,events);await tx.query('INSERT INTO fabric.model_no_dispatch VALUES($1,$2,$3,$4,$5::jsonb,$6)',[...ids(scope,s.binding.sessionId),o.operationId,JSON.stringify(o),reason]);await this.fresh(tx,scope,current);
  });
 }
 /** An exception alone cannot prove non-dispatch. Acquire the preparation's
  * original-key lock through COMMIT and read again after any contender finishes.
  * A committed attempt stays unknown; safe absence becomes a permanent refusal
  * receipt which prevents subsequent preparation of this original/key. */
 async refusePreparation(scope:VerifiedScope,s:NativeSnapshot,events:readonly DomainEvent[],raw:OriginalCall,key:string,reason:'model-unavailable'|'permission'|'connection'):Promise<boolean>{
  const o=OriginalCallSchema.parse(raw),prefix=events.map(validateEvent),pending=replaySession(s.origin,prefix).pendingModel;
  demand(o.tenantId===scope.tenantId&&o.spaceId===scope.spaceId&&pending?.operationId===o.operationId&&pending.reservationId===o.reservationId&&prefix.at(-1)?.kind==='model-pending','CHECK_BINDING_MISMATCH');
  return this.uow.withScope(scope,async tx=>{
   const now=await this.load(tx,scope,s.binding.sessionId);await this.fresh(tx,scope,now);await lockOriginal(tx,scope,key);
   demand(now.revision===s.revision,'STALE_REVISION');
   const committed=(await tx.query('SELECT a.record,o.session_id FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.attempt_id=$3',ids(scope,o.attemptId))).rows[0];
   if(committed){demand(committed['session_id']===s.binding.sessionId&&same((committed['record'] as {original:unknown}).original,o),'CHECK_BINDING_MISMATCH');return false;}
   const old=(await tx.query('SELECT receipt FROM fabric.model_command_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,key])).rows[0]?.['receipt'] as {noDispatchOriginal?:unknown;sessionId?:string;reason?:string}|undefined;
   if(old){demand(old.sessionId===s.binding.sessionId&&old.reason===reason&&same(old.noDispatchOriginal,o),'IDEMPOTENCY_CONFLICT');return true;}
   // An unrelated reservation/attempt is never converted into safe absence.
   demand((await tx.query('SELECT fabric.model_preparation_unreserved($1,$2) AS absent',[o.reservationId,o.attemptId])).rows[0]?.['absent']===true,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   await this.append(tx,scope,now,prefix);
   await tx.query('INSERT INTO fabric.model_preparation_refusals VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)',[...ids(scope,s.binding.sessionId),scope.actorId,key,o.attemptId,o.reservationId,o.operationId,JSON.stringify(o),reason]);
   await recordCommand(tx,scope,key,hash({noDispatchOriginal:o,sessionId:s.binding.sessionId,reason}),'native-preparation-refused',{noDispatchOriginal:o,sessionId:s.binding.sessionId,reason},this.hooks);
   await this.fresh(tx,scope,now);return true;
  });
 }
 async original(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot,operationId:string,reservationId?:string):Promise<{original:OriginalCall;noDispatch:boolean;reason?:'model-unavailable'|'permission'|'connection'}|null>{
  uuid.parse(operationId);
  if(reservationId){
   uuid.parse(reservationId);const refused=(await tx.query('SELECT original,reason FROM fabric.model_preparation_refusals WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 AND session_id=$4 AND reservation_id=$5 AND actor_id=$6',[...ids(scope,operationId),s.binding.sessionId,reservationId,scope.actorId])).rows[0];
   if(refused)return {original:OriginalCallSchema.parse(refused['original']),noDispatch:true,reason:refused['reason'] as 'model-unavailable'|'permission'|'connection'};
  }
  const denied=(await tx.query('SELECT original FROM fabric.model_no_dispatch WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 AND session_id=$4',[...ids(scope,operationId),s.binding.sessionId])).rows[0];if(denied)return {original:OriginalCallSchema.parse(denied['original']),noDispatch:true};
  const row=(await tx.query('SELECT a.record FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.operation_id=$3 AND o.session_id=$4 ORDER BY a.ordinal DESC LIMIT 1',[...ids(scope,operationId),s.binding.sessionId])).rows[0];
  if(!row)return null;return {original:OriginalCallSchema.parse((row['record'] as {original:unknown}).original),noDispatch:false};
 }
 async makeWait(tx:SqlTransaction,s:NativeSnapshot,reason:WaitRecord['reason'],expiresAt:string|null):Promise<WaitRecord>{
  const at=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'] as Date;
  const actions:Record<WaitRecord['reason'],WaitRecord['allowedNextActions']>={budget:['top-up','smaller-scope','resume','stop'],'model-unavailable':['switch-profile','contact-administrator','stop'],approval:['resume','stop'],resource:['resume','stop'],permission:['contact-administrator','resume','stop'],connection:['retry-setup','resume','stop'],'unknown-usage':['reconcile','stop']};
  return WaitSchema.parse({schemaVersion:1,taskId:s.binding.taskId,runId:s.binding.runId,resourceId:s.admission.resourceId,reason,resolver:reason==='approval'?'native-approval-owner':reason==='budget'?'native-budget-owner':reason==='unknown-usage'?'original-model-receipt-owner':'native-controller',since:s.control.wait?.reason===reason?s.control.wait.since:at.toISOString(),updatedAt:at.toISOString(),expiresAt,preservedWorkDigest:hash(s.events),allowedNextActions:actions[reason],ongoingChargeCategories:s.admission.ongoingCharges,replayAllowed:false});
 }
 async topUp(scope:VerifiedScope,raw:ReturnType<typeof TopUpSchema.parse>):Promise<{revision:number;autoResumed:false}>{
  const c=TopUpSchema.parse(raw),digest=hash({kind:'native-top-up',...c});demand(scope.grants.includes('budget:control'),'UNAUTHORIZED');
  return this.uow.withScope(scope,async tx=>{
   await this.load(tx,scope,c.sessionId);await lockOriginal(tx,scope,c.key);const old=await commandReceipt(tx,scope,c.key,digest);if(old){await currentScope(tx,scope);return old as {revision:number;autoResumed:false};}
   await commandLive(tx,c.expiresAt);let next:number;
   try{next=positive.parse(Number((await tx.query('SELECT fabric.model_native_top_up($1,$2,$3) AS revision',[c.allowanceId,c.addedUnits,c.expectedAllowanceRevision])).rows[0]?.['revision']));}
   catch(e){if((e as {code?:string}).code==='P0004')throw new ModelError('STALE_REVISION');throw e;}
   const receipt={revision:next,autoResumed:false as const};
   await recordCommand(tx,scope,c.key,digest,'allowance-changed',receipt,this.hooks);await currentScope(tx,scope);await commandLive(tx,c.expiresAt);return receipt;
  });
 }
 async stop(scope:VerifiedScope,raw:ReturnType<typeof StopSchema.parse>):Promise<{dispatch:'fenced';termination:'unknown';cancellationGeneration:number;unsettled:boolean}>{
  const c=StopSchema.parse(raw),digest=hash({kind:'native-stop',...c});
  return this.uow.withScope(scope,async tx=>{
   const s=await this.load(tx,scope,c.sessionId);demand(scope.grants.includes('task:write'),'UNAUTHORIZED');await lockOriginal(tx,scope,c.key);const old=await commandReceipt(tx,scope,c.key,digest);if(old){await currentScope(tx,scope);return old as {dispatch:'fenced';termination:'unknown';cancellationGeneration:number;unsettled:boolean};}
   await commandLive(tx,c.expiresAt);
   // Compose the accepted owner in THIS authenticated transaction. Its Stop
   // advances the existing Task generation/barrier and ignores progress revision.
   const nested:AsyncUnitOfWork={withScope:async(target,work)=>{demand(target===scope,'UNAUTHORIZED');return work(tx);}};
   await new FenceRepository(new RecoveryRepository(nested,this.bindingFor)).execute(scope,{task:{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:s.binding.taskId},runId:null,commandId:c.key,idempotencyKey:c.key,expiresAt:c.expiresAt,kind:'stop-task',resourceId:null,expectedResourceGeneration:null,observationId:null,baseDigest:null,leaseExpiresAt:null});
   const current=await this.load(tx,scope,c.sessionId),loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},model:async()=>{throw new Error('Stop has no model port');},execute:async()=>{throw new Error('Stop has no effect port');}});loop.restore(s.events);
   if(!['cancelling','cancelled','succeeded','partial','failed'].includes(loop.inspect().run.state))loop.transition('cancelling',{currentAuthorized:true});
   const unsettled=!!loop.inspect().pendingModel||loop.inspect().pendingOperations.length>0;
   await this.save(tx,scope,s,loop.events(),{...s.control,wait:null});
   const receipt={dispatch:'fenced' as const,termination:'unknown' as const,cancellationGeneration:current.cancellationGeneration,unsettled};
   await appendModelEvent(tx,{...s.binding,cancellationGeneration:current.cancellationGeneration},{...eventBase({...s.binding,cancellationGeneration:current.cancellationGeneration},null,null),kind:'native-stop',payload:{cancellationGeneration:current.cancellationGeneration,unsettled}});
   await recordCommand(tx,scope,c.key,digest,'native-stop',receipt,this.hooks);await currentScope(tx,scope);await commandLive(tx,c.expiresAt);return receipt;
  });
 }
}
