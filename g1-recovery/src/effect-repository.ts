import {randomUUID} from 'node:crypto';
import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {CurrentAudienceVerifier} from '../../g1-identity/src/audience.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import {RecoveryRepository,recoveryLockKey,leaseSchema,receiptSchema} from './repository.js';
import {assertBinding,assertGeneration,assertEffectTransition,assertRunTransition,bindingDigest,effectSchema,runSchema,sessionSchema,type Effect,type Run} from './contracts.js';
import {uuid,positive} from './schema.js';
import {effectKey,receiptMatches,downstreamReceiptSchema,type DownstreamReceipt} from './effect-protocol.js';
import {assertResultEffectCurrent} from './result-effect-guard.js';
import {lockSpaceBarrier,assertRunUnfenced} from './fence-guard.js';
export class EffectRepository {
 constructor(readonly repo:RecoveryRepository){}
 // A successful claim ACK grants this instance one dispatch invocation. Process
 // recreation, lost COMMIT ACK and repeat calls have no send capability.
 private readonly dispatchClaims=new Set<string>();
 private claimKey(s:VerifiedScope,id:string,g:number){return JSON.stringify([s.tenantId,s.spaceId,s.actorId,id,g]);}
 private async lockPhase(tx:SqlTransaction,scope:VerifiedScope,operationId:string,phase:string):Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[recoveryLockKey(scope,effectKey(operationId,phase))]);
 }
 private async current(tx:SqlTransaction,scope:VerifiedScope,operationId:string,generation:number,access:'dispatch'|'reconcile'|'delivery'):Promise<{effect:Effect;run:Run}> {
  const dispatch=access==='dispatch',reconciliation=access==='reconcile';
  uuid.parse(operationId);positive.parse(generation);
  if(!scope.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');
  const ids=[scope.tenantId,scope.spaceId,operationId];
  const unlocked=(await tx.query('SELECT run_id FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',ids)).rows[0];
  if(!unlocked)throw new FoundationError('STALE_AUTHORITY');
  const fences=await lockSpaceBarrier(tx,scope);
  if(fences)await assertRunUnfenced(tx,scope,String(unlocked.run_id),undefined,undefined,{operationId,reconciliation});
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-run',scope.tenantId,scope.spaceId,unlocked.run_id])]);
  const row=(await tx.query('SELECT record,binding FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 FOR UPDATE',ids)).rows[0]!;
  const effect=effectSchema.parse(row.record),b=effect.binding;assertBinding(b,row.binding);
  if(b.mutationPath!=='api')throw new FoundationError('UNAUTHORIZED','Unsupported external adapter closed');
  if(fences)await assertRunUnfenced(tx,scope,String(unlocked.run_id),b.resourceId,undefined,{operationId,reconciliation});
  const run=runSchema.parse((await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE',[scope.tenantId,scope.spaceId,b.run.runId])).rows[0]?.record);
  assertBinding(b.run,run.binding);
  // A final native answer closes executable effect access. Only synchronization
  // of an already confirmed receipt may continue through verification/completion.
  const deliveryCompletion=access==='delivery'&&effect.state==='confirmed'&&['verifying','succeeded'].includes(run.state);
  // Claim changes running -> reconciling before the bounded send. Pause may
  // commit between that ACK and I/O, so it must close the actual send boundary.
  // Paused access is confined to read-only original-operation reconciliation
  // and delivery metadata; neither grants an executable dispatch capability.
  const executable=dispatch?['running','reconciling']:['running','reconciling','paused'];
  if(b.actorId!==scope.actorId||b.policyRevision!==scope.authorityRevision||run.generation.worker!==generation||b.generation.cancellation!==run.generation.cancellation||b.generation.resource!==run.generation.resource||b.generation.worker>generation||!executable.includes(run.state)&&!deliveryCompletion)throw new FoundationError('STALE_AUTHORITY');
  if(dispatch)assertGeneration(run.generation,b.generation);
  const session=sessionSchema.parse((await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 FOR SHARE',[scope.tenantId,scope.spaceId,b.sessionId])).rows[0]?.record);
  const lease=leaseSchema.parse((await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND lease_id=$3 FOR SHARE',[scope.tenantId,scope.spaceId,b.executionLeaseId])).rows[0]?.record);
  assertBinding(run.binding,session.binding);assertBinding(run.binding,lease.binding);assertGeneration(run.generation,session.generation);assertGeneration(run.generation,lease.generation);
  if(lease.revokedAt!==null||session.budgetReservationId!==b.budgetReservationId)throw new FoundationError('STALE_AUTHORITY');
  if((await tx.query('SELECT $1::timestamptz>clock_timestamp() AND $2::timestamptz>clock_timestamp() AS live',[b.expiresAt,lease.expiresAt])).rows[0]?.live!==true)throw new FoundationError('STALE_AUTHORITY','Expired effect or execution lease');
  const a=(await tx.query('SELECT * FROM fabric.exact_approvals WHERE tenant_id=$1 AND space_id=$2 AND approval_id=$3 FOR SHARE',[scope.tenantId,scope.spaceId,b.approvalId])).rows[0];
  if(!a||a.state!=='consumed'||a.executor_id!==scope.actorId)throw new FoundationError('UNAUTHORIZED');
  const approval=a.binding as ExactApprovalBinding;
  assertBinding({operationId:b.operationId,target:b.target,action:b.action,argsDigest:b.argsDigest,artifactVersion:b.artifactVersion,expiresAt:b.expiresAt},{operationId:approval.operationId,target:approval.target,action:approval.action,argsDigest:approval.argsDigest,artifactVersion:approval.artifactVersion,expiresAt:approval.expiresAt});
  await new CurrentAudienceVerifier().verify(tx,scope,approval.sourceAudience);
  const parties=[{actorId:a.requester_id,grant:'task:write',identity:a.request_identity,human:false},{actorId:a.approver_id,grant:'approval:approve',identity:a.approver_identity,human:true},{actorId:scope.actorId,grant:'task:write',identity:this.repo.bindingFor(scope),human:false}];
  if((await tx.query('SELECT fabric.identity_parties_current($1::jsonb) AS valid',[JSON.stringify(parties)])).rows[0]?.valid!==true)throw new FoundationError('UNAUTHORIZED');
  const target=(await tx.query('SELECT fabric.identity_target_current($1,$2,$3) AS current',[b.target,b.run.task.taskId,b.run.runId])).rows[0]?.current as Record<string,unknown>|null;
  const cancel=(await tx.query('SELECT cancellation_generation FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR SHARE',[scope.tenantId,scope.spaceId,b.run.task.taskId])).rows[0];
  if(!target||Number(target.policyRevision)!==b.policyRevision||Number(target.artifactVersion)!==b.artifactVersion||target.argsDigest!==b.argsDigest||Number(target.requirementsRevision)!==b.run.requirementsRevision||Number(target.runRequirementsRevision)!==b.run.requirementsRevision||Number(cancel?.cancellation_generation)!==run.generation.cancellation)throw new FoundationError('STALE_AUTHORITY');
  if((await tx.query('SELECT fabric.recovery_budget_current($1,$2,$3) AS valid',[b.budgetReservationId,b.run.runId,approval.limits.maxCostMicrounits])).rows[0]?.valid!==true)throw new FoundationError('UNAUTHORIZED');
  await assertResultEffectCurrent(tx,scope,effect);
  return {effect,run};
 }
 private async phase(tx:SqlTransaction,scope:VerifiedScope,run:Run,effect:Effect,phase:string,detail:unknown,state:Run['state']):Promise<void> {
  const b=effect.binding,ids=[scope.tenantId,scope.spaceId],key=effectKey(b.operationId,phase),payloadDigest=bindingDigest({binding:b,phase});
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[recoveryLockKey(scope,key)]);
  if(run.state!==state)assertRunTransition(run.state,state);
  const revision=run.revision+1;
  await tx.query('UPDATE fabric.recovery_operations SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[...ids,b.operationId,JSON.stringify(effect)]);
  await tx.query('UPDATE fabric.recovery_runs SET record=$4,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...ids,b.run.runId,JSON.stringify({...run,state,revision}),revision]);
  await tx.query('INSERT INTO fabric.recovery_effect_events(tenant_id,space_id,operation_id,phase,record) VALUES($1,$2,$3,$4,$5)',[...ids,b.operationId,phase,JSON.stringify({effect,detail})]);
  const receipt=receiptSchema.parse({commandId:key,runId:b.run.runId,revision,payloadDigest,outboxId:randomUUID()});
  await tx.query('INSERT INTO fabric.recovery_receipts(tenant_id,space_id,actor_id,command_key,command_id,run_id,payload_digest,receipt,outbox_id) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8)',[...ids,scope.actorId,key,b.run.runId,payloadDigest,JSON.stringify(receipt),receipt.outboxId]);
  await tx.query("INSERT INTO fabric.recovery_outbox(tenant_id,space_id,outbox_id,actor_id,command_key,run_id,kind,payload,authority_revision) VALUES($1,$2,$3,$4,$5,$6,'effect-reconciliation',$7,$8)",[...ids,receipt.outboxId,scope.actorId,key,b.run.runId,JSON.stringify(receipt),scope.authorityRevision]);
 }
 /** Durable unknown-before-send marker. Exactly one claimant may POST. An ACK
  * loss on this local commit authorizes only original-key lookup, never POST. */
 async claim(scope:VerifiedScope,operationId:string,generation:number):Promise<boolean> {
  const claimed=await this.repo.uow.withScope(scope,async tx=>{
   await this.lockPhase(tx,scope,operationId,'dispatch');
   const {effect,run}=await this.current(tx,scope,operationId,generation,'dispatch');
   if(effect.state!=='prepared')return false;
   if(run.state!=='running')throw new FoundationError('STALE_AUTHORITY','Explicit authorized Run resume required before new effect dispatch');
   assertEffectTransition('prepared','dispatched');assertEffectTransition('dispatched','unknown');
   const next=effectSchema.parse({...effect,state:'unknown',nextAction:effect.binding.downstream==='human-reconciliation'?'human-reconcile':'lookup-original-operation'});
   await this.phase(tx,scope,run,next,'dispatch',{reason:'durable-before-send'},'reconciling');
   await this.current(tx,scope,operationId,generation,'reconcile');return true;
  });
  if(claimed)this.dispatchClaims.add(this.claimKey(scope,operationId,generation));return claimed;
 }
 /** Current authority stays locked across bounded I/O; no generic retry wrapper. */
 async guardedIO<T>(scope:VerifiedScope,operationId:string,generation:number,dispatch:boolean,io:(effect:Effect)=>Promise<T>):Promise<T> {
  if(dispatch&&!this.dispatchClaims.delete(this.claimKey(scope,operationId,generation)))throw new FoundationError('STALE_AUTHORITY','Original acknowledged claim required; unknown effects are lookup-only');
  return this.repo.uow.withScope(scope,async tx=>{
   const access=dispatch?'dispatch':'reconcile';
   const {effect}=await this.current(tx,scope,operationId,generation,access);
   if(dispatch&&effect.state!=='unknown')throw new FoundationError('STALE_AUTHORITY');
   const result=await io(effect);await this.current(tx,scope,operationId,generation,access);return result;
  });
 }
 /** Trusted delivery metadata transaction only. No dispatch claim, adapter or
  * state transition; retains all current authority and shared-resource gates. */
 async synchronizeDelivery<T>(scope:VerifiedScope,operationId:string,generation:number,sync:(effect:Effect)=>Promise<T>):Promise<T> {
  return this.repo.uow.withScope(scope,async tx=>{
   const {effect}=await this.current(tx,scope,operationId,generation,'delivery');
   const result=await sync(effect);await this.current(tx,scope,operationId,generation,'delivery');return result;
  });
 }
 async reconciling(scope:VerifiedScope,operationId:string,generation:number):Promise<Effect> {
  return this.repo.uow.withScope(scope,async tx=>{
   await this.lockPhase(tx,scope,operationId,'reconciling');
   const {effect,run}=await this.current(tx,scope,operationId,generation,'reconcile');
   if(effect.state==='unknown'){
    assertEffectTransition(effect.state,'reconciling');const next=effectSchema.parse({...effect,state:'reconciling'});
    await this.phase(tx,scope,run,next,'reconciling',{reason:'lookup-only'},run.state);await this.current(tx,scope,operationId,generation,'reconcile');return next;
   }
   return effect;
  });
 }
 async confirm(scope:VerifiedScope,operationId:string,generation:number,raw:DownstreamReceipt):Promise<void> {
  const receipt=downstreamReceiptSchema.parse(raw);
  await this.repo.uow.withScope(scope,async tx=>{
   await this.lockPhase(tx,scope,operationId,'confirmed');
   const {effect,run}=await this.current(tx,scope,operationId,generation,'reconcile');
   if(!receiptMatches(effect.binding,receipt))throw new FoundationError('STALE_AUTHORITY','Downstream receipt does not match original intent');
   if(effect.state==='confirmed'){assertBinding(effect.receiptDigest,bindingDigest(receipt));return;}
   assertEffectTransition(effect.state,'confirmed');
   await this.phase(tx,scope,run,effectSchema.parse({...effect,state:'confirmed',receiptDigest:bindingDigest(receipt),nextAction:null}),'confirmed',receipt,'paused');
   await this.current(tx,scope,operationId,generation,'reconcile');
  });
 }
 async unresolved(scope:VerifiedScope,operationId:string,generation:number,detail:{reason:string;nextAction:string}):Promise<void> {
  const phase='unresolved-'+bindingDigest(detail).slice(7);
  await this.repo.uow.withScope(scope,async tx=>{
   await this.lockPhase(tx,scope,operationId,phase);
   const {effect,run}=await this.current(tx,scope,operationId,generation,'reconcile');
   if(effect.state!=='reconciling')throw new FoundationError('STALE_AUTHORITY');
   if((await tx.query('SELECT phase FROM fabric.recovery_effect_events WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 AND phase=$4',[scope.tenantId,scope.spaceId,operationId,phase])).rowCount)return;
   await this.phase(tx,scope,run,effect,phase,detail,run.state);await this.current(tx,scope,operationId,generation,'reconcile');
  });
 }
 async resume(scope:VerifiedScope,operationId:string,generation:number):Promise<void> {
  await this.repo.uow.withScope(scope,async tx=>{
   await this.lockPhase(tx,scope,operationId,'resume');
   const {effect,run}=await this.current(tx,scope,operationId,generation,'reconcile');
   if(effect.state!=='confirmed')throw new FoundationError('STALE_AUTHORITY','Reconcile before model continuation');
   if(await lockSpaceBarrier(tx,scope))await assertRunUnfenced(tx,scope,run.binding.runId);
   if(run.state==='running')return;
   if(run.state!=='paused')throw new FoundationError('STALE_AUTHORITY');
   await this.phase(tx,scope,run,effect,'resume',{reason:'explicit-confirmed-continuation'},'running');await this.current(tx,scope,operationId,generation,'reconcile');
  });
 }
}
