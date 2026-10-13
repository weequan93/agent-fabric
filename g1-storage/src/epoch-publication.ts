import { createHash,randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { object,uuid,timestamp } from './decoder.js';
import { demand,FoundationError } from './errors.js';
import { assertVerifiedScope,revalidateScope,lockSpaceBarrier,type AsyncUnitOfWork,type SqlTransaction,type VerifiedScope } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { StorageAuthorityRepository,EpochAnchorSchema,controlDigest } from './authority.js';
import { EpochWitnessJournal,type PendingEpoch } from './epoch-journal.js';
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export interface EpochPublicationHooks {afterReserve?():Promise<void>;afterPublication?(tx:SqlTransaction):Promise<void>;beforeWitnessAck?():Promise<void>}
/** Control-only maintenance publication. No content work/caller epoch/policy or
 * anchor fields. New control mutations require their own installed owner path.
 * Pending independent witness blocks all serving; only original-key lookup can
 * resolve it from fresh serialized PG authority, including UNKNOWN_COMMIT. */
export class EpochPublicationRepository {
 readonly authority:StorageAuthorityRepository;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,
  readonly native:StorageAuthorityRepository['native'],readonly hooks:EpochPublicationHooks={}){
  this.authority=new StorageAuthorityRepository(journal,native);
 }
 protected async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  assertVerifiedScope(scope);await revalidateScope(scope);demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',scope.tenantId,scope.spaceId,scope.actorId,key])]);
  // A snapshot taken before contention must never establish absence. Execute
  // and reconcile share this original lock (the payload digest is not a lock).
  demand((await tx.query('SHOW transaction_isolation')).rows[0]?.['transaction_isolation']==='read committed','REQUIRED_CAPABILITY_UNSUPPORTED');
  await revalidateScope(scope);
  await currentScope(tx,scope);demand(scope.grants.includes('storage:maintenance')&&scope.grants.includes('task:write'),'UNAUTHORIZED');
 }
 protected async original(tx:SqlTransaction,scope:VerifiedScope,key:string){return (await tx.query(`SELECT p.*,e.policy_revision,e.control_digest FROM fabric.storage_epoch_publications p
 JOIN fabric.storage_authority_epoch e USING(tenant_id,space_id,epoch,anchor_id)
 WHERE p.tenant_id=$1 AND p.space_id=$2 AND p.actor_id=$3 AND p.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,key])).rows[0];}
 protected async inspectOriginal(_tx:SqlTransaction,_scope:VerifiedScope,_row:Record<string,unknown>):Promise<void>{}
 /** Recovery/status is a current authorized read even after witness ACK. The
  * original deadline does not expire a durable receipt, but its installed native
  * binding, full audience and fences must still be valid. */
 protected async controlNative(tx:SqlTransaction,scope:VerifiedScope,sessionId:string){
  const native=await this.native.load(tx,scope,sessionId);await this.native.fresh(tx,scope,native);
  demand(native.binding.purpose==='maintenance'&&native.binding.intent==='Ask'
   &&native.admission.executionClass==='service'&&native.admission.resourceId===null
   &&native.admission.computerCapability===null&&!native.admission.targetEffect
   &&!native.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  await this.authority.currentAudience(tx,scope,native.binding.taskId);return native;
 }
 async refresh(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw),binding=hash(command);
  await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);
   demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'maintenance',command.expiresAt);
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID()});
   const pending:PendingEpoch={actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_epoch($1,$2,$3,$4,$5,$6,$7,$8)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,next.controlDigest,command.expiresAt]);
   await this.hooks.afterPublication?.(tx);
   // Check native/session/time and unchanged current controls after every write.
   const native=await this.native.load(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   await this.authority.currentAudience(tx,scope,native.binding.taskId);
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  });
  // An acknowledged DB COMMIT alone cannot ACK the independent witness.
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 async lookup(scope:VerifiedScope,raw:unknown):Promise<{status:'committed';anchor:ReturnType<typeof EpochAnchorSchema.parse>}|{status:'absent-safe'}|{status:'unknown';replayAllowed:false}>{
  const command=CommandSchema.parse(raw);return this.reconcile(scope,command,hash(command));
 }
 protected async reconcile(scope:VerifiedScope,command:ReturnType<typeof CommandSchema.parse>,binding:string):Promise<{status:'committed';anchor:ReturnType<typeof EpochAnchorSchema.parse>}|{status:'absent-safe'}|{status:'unknown';replayAllowed:false}>{
  try{return await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);
   const state=await this.journal.state(scope.tenantId,scope.spaceId);demand(state,'AUTHORITY_UNAVAILABLE');
   const pending=state.pending;
   if(pending)demand(pending.actorId===scope.actorId&&pending.key===command.key&&pending.binding===binding
    &&pending.sessionId===command.sessionId&&pending.expiresAt===command.expiresAt,'IDEMPOTENCY_CONFLICT');
   const row=await this.original(tx,scope,command.key);
   if(row)demand(row['binding_digest']===binding&&row['session_id']===command.sessionId,'IDEMPOTENCY_CONFLICT');
   const native=await this.controlNative(tx,scope,command.sessionId);
   if(row)await this.inspectOriginal(tx,scope,row);
   if(!pending){
    await this.authority.check(tx,scope,'maintenance');
    await this.native.fresh(tx,scope,native);
    return row?{status:'committed' as const,anchor:EpochAnchorSchema.parse({epoch:Number(row['epoch']),anchorId:row['anchor_id'],policyRevision:Number(row['policy_revision']),controlDigest:row['control_digest']})}:{status:'absent-safe' as const};
   }
   // Journal is blocked: use live installed scope/native/audience plus exact
   // previous/next candidate, never bootstrap a replacement anchor from PG.
   const epoch=(await tx.query('SELECT epoch,anchor_id,policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2 ORDER BY epoch DESC LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0];
   demand(epoch,'AUTHORITY_UNAVAILABLE');const observed=EpochAnchorSchema.parse({epoch:Number(epoch['epoch']),anchorId:epoch['anchor_id'],policyRevision:Number(epoch['policy_revision']),controlDigest:epoch['control_digest']});
   demand(same(observed,row?pending.next:pending.previous),'AUTHORITY_UNAVAILABLE');
   if(row)demand(Number(row['previous_epoch'])===pending.previous.epoch&&Number(row['epoch'])===pending.next.epoch&&row['anchor_id']===pending.next.anchorId,'AUTHORITY_UNAVAILABLE');
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,observed.policyRevision)===observed.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);await this.native.fresh(tx,scope,native);
   await this.journal.resolve(scope.tenantId,scope.spaceId,pending,!!row);
   return row?{status:'committed' as const,anchor:pending.next}:{status:'absent-safe' as const};
  });}catch(e){
   const code=(e as {code?:unknown}).code;
   if((e instanceof FoundationError&&code==='UNKNOWN_COMMIT')||(e instanceof DatabaseError&&(code==='55P03'||code==='57014')))return {status:'unknown',replayAllowed:false};
   throw e;
  }
 }
}
