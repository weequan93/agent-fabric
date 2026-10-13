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
/** Exact accepted record tombstone. This publishes current control only; payload
 * destruction, descendant invalidation and a full forget response are separate. */
export class TombstonePublicationRepository extends EpochPublicationRepository {
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
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,previous.policyRevision,undefined,undefined,{entity:command.entity,epoch:previous.epoch+1,key:command.key,at})});
   const pending:PendingEpoch={schemaVersion:4,kind:'tombstone',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,entity:command.entity,at};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_tombstone($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,command.entity.class,command.entity.id,command.entity.revision,command.entity.witness,at,command.expiresAt]);
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
  if(p)demand('schemaVersion' in p&&p.schemaVersion===4&&p.entity.class===marker['class']&&p.entity.id===marker['id']
   &&p.entity.revision===Number(marker['revision'])&&p.entity.witness===marker['witness']&&p.at===(marker['at'] as Date).toISOString(),'AUTHORITY_UNAVAILABLE');
  await this.authority.controlAudience(tx,scope,{class:marker['class'],id:marker['id'],revision:Number(marker['revision'])});
 }
}
