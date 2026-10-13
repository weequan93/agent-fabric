import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,timestamp } from './decoder.js';
import { demand,StorageError } from './errors.js';
import { revalidateScope,type VerifiedScope,type SqlTransaction } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { EpochAnchorSchema,controlDigest } from './authority.js';
import { EpochPublicationRepository } from './epoch-publication.js';
import { EntityRefSchema,type PendingEpoch } from './epoch-journal.js';
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,entity:EntityRefSchema});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Atomically publish exact tombstone, original control receipt and pending
 * propagation intent. No worker consumption or full forget completion yet. */
export class ForgetWorkRepository extends EpochPublicationRepository {
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  await super.locks(tx,scope,key);demand(scope.grants.includes('storage:forget'),'UNAUTHORIZED');
 }
 override async refresh(_scope:VerifiedScope,_raw:unknown):Promise<never>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');}
 async forget(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw),binding=hash(command);
  await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'forget',command.expiresAt);
   const head=await this.authority.entity(tx,scope,command.entity);
   demand(typeof head['source_task_id']==='string','AUTHORITY_UNAVAILABLE');
   await this.authority.currentAudience(tx,scope,head['source_task_id']);
   // Database clock is canonical; normalize to finite millisecond precision so
   // the independent projection and actual SQL write encode identical bytes.
   const clock=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'];
   demand(clock instanceof Date,'AUTHORITY_UNAVAILABLE');const at=timestamp.parse(clock.toISOString());
   const receiptId=randomUUID(),jobId=randomUUID();
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,previous.policyRevision,undefined,undefined,{entity:command.entity,epoch:previous.epoch+1,key:command.key,at},{actorId:scope.actorId,key:command.key,binding,receiptId,jobId,entity:command.entity,epoch:previous.epoch+1,at})});
   const pending:PendingEpoch={schemaVersion:5,kind:'forget-work',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,entity:command.entity,at,receiptId,jobId};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_forget_work($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,command.entity.class,command.entity.id,command.entity.revision,command.entity.witness,at,command.expiresAt,receiptId,jobId]);
   await this.hooks.afterPublication?.(tx);
   const native=await this.native.load(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   await this.authority.currentAudience(tx,scope,native.binding.taskId);
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  });
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 override async lookup(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw);return this.reconcile(scope,command,hash(command));
 }
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const marker=(await tx.query(`SELECT r.class,r.id,r.revision,r.witness,r.at,h.witness AS head_witness,d.epoch,d.at AS tombstone_at,d.command_key
   FROM fabric.storage_tombstone_publications r JOIN fabric.storage_current_heads h ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(r.tenant_id,r.space_id,r.class,r.id,r.revision)
   JOIN fabric.storage_tombstones d ON (d.tenant_id,d.space_id,d.class,d.id,d.revision)=(r.tenant_id,r.space_id,r.class,r.id,r.revision)
   WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  demand(marker&&marker['witness']===marker['head_witness']&&Number(marker['epoch'])===Number(row['epoch'])&&marker['command_key']===row['command_key']
   &&marker['at'] instanceof Date&&marker['tombstone_at'] instanceof Date&&marker['at'].getTime()===marker['tombstone_at'].getTime(),'AUTHORITY_UNAVAILABLE');
  demand(row['expires_at'] instanceof Date&&hash(CommandSchema.parse({key:row['command_key'],sessionId:row['session_id'],expiresAt:row['expires_at'].toISOString(),entity:{class:marker['class'],id:marker['id'],revision:Number(marker['revision']),witness:marker['witness']}}))===row['binding_digest'],'AUTHORITY_UNAVAILABLE');
  const state=await this.journal.state(scope.tenantId,scope.spaceId),p=state?.pending;
  const work=await this.inspectWork(tx,scope,row);
  if(p)demand('schemaVersion' in p&&p.schemaVersion===5&&p.entity.class===marker['class']&&p.entity.id===marker['id']
   &&p.entity.revision===Number(marker['revision'])&&p.entity.witness===marker['witness']&&p.at===(marker['at'] as Date).toISOString()&&p.receiptId===work['receipt_id']&&p.jobId===work['job_id'],'AUTHORITY_UNAVAILABLE');
  await this.authority.controlAudience(tx,scope,{class:marker['class'],id:marker['id'],revision:Number(marker['revision'])});
 }
 private async inspectWork(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const work=(await tx.query(`SELECT w.*,c.binding_digest AS command_binding,c.receipt_id AS command_receipt,c.epoch AS command_epoch,c.at AS command_at,
   j.actor_id AS job_actor,j.command_key AS job_key,j.class AS job_class,j.target_id,j.target_revision,j.epoch AS job_epoch,j.at AS job_at,
   d.class AS tombstone_class,d.id AS tombstone_id,d.revision AS tombstone_revision,d.at AS tombstone_at
   FROM fabric.storage_forget_work w
   JOIN fabric.storage_commands c ON (c.tenant_id,c.space_id,c.actor_id,c.command_key)=(w.tenant_id,w.space_id,w.actor_id,w.command_key)
   JOIN fabric.storage_outbox j ON (j.tenant_id,j.space_id,j.job_id)=(w.tenant_id,w.space_id,w.job_id)
   JOIN fabric.storage_tombstone_publications d ON (d.tenant_id,d.space_id,d.actor_id,d.command_key)=(w.tenant_id,w.space_id,w.actor_id,w.command_key)
   WHERE w.tenant_id=$1 AND w.space_id=$2 AND w.actor_id=$3 AND w.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  demand(work&&work['binding_digest']===row['binding_digest']&&work['command_binding']===row['binding_digest']
   &&work['receipt_id']===work['command_receipt']&&work['job_actor']===scope.actorId&&work['job_key']===row['command_key']
   &&work['class']===work['job_class']&&work['class']===work['tombstone_class']&&work['id']===work['target_id']&&work['id']===work['tombstone_id']
   &&Number(work['revision'])===Number(work['target_revision'])&&Number(work['revision'])===Number(work['tombstone_revision'])
   &&['epoch','command_epoch','job_epoch'].every(k=>Number(work[k])===Number(row['epoch']))
   &&work['at'] instanceof Date&&['command_at','job_at','tombstone_at'].every(k=>work[k] instanceof Date&&(work[k] as Date).getTime()===(work['at'] as Date).getTime()),'AUTHORITY_UNAVAILABLE');
  return work;
 }
 /** Scoped metadata status. Pending is an immutable propagation intent; it is
  * never a completed deletion response or a worker/replay authorization. */
 async pendingWork(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw);
  return this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);await this.authority.check(tx,scope,'maintenance');
   const row=await this.original(tx,scope,command.key);demand(row&&row['binding_digest']===hash(command),'IDEMPOTENCY_CONFLICT');
   const native=await this.controlNative(tx,scope,command.sessionId);
   await this.inspectOriginal(tx,scope,row);const work=await this.inspectWork(tx,scope,row);
   await this.authority.check(tx,scope,'maintenance');await this.native.fresh(tx,scope,native);
   return {status:'propagation-pending' as const,receiptId:uuid.parse(work['receipt_id']),jobId:uuid.parse(work['job_id'])};
  });
 }

}
