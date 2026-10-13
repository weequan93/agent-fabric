import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,timestamp,positive,literal,nullable,revision,enumeration } from './decoder.js';
import { ContentClassSchema } from './schema.js';
import { demand,StorageError } from './errors.js';
import { assertVerifiedScope,revalidateScope,lockSpaceBarrier,type VerifiedScope,type SqlTransaction,type AsyncUnitOfWork } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { EpochAnchorSchema,StoragePolicySchema,controlDigest } from './authority.js';
import { type EpochPublicationHooks } from './epoch-publication.js';
import { ForgetWorkRepository } from './forget-work.js';
import { EntityRefSchema,EpochWitnessJournal,type PendingEpoch } from './epoch-journal.js';

export const RetentionCommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,entity:EntityRefSchema});
export const RetentionSweepSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,class:ContentClassSchema});
export const RetentionImpactSchema=object({schemaVersion:literal(1),status:literal('restriction-committed'),
 reason:enumeration('forget','expiry'),receiptId:uuid,jobId:uuid,epoch:positive,entity:EntityRefSchema,
 coverage:literal('exact-target-only'),activeRestricted:literal(1),derivedAffected:nullable(revision),
 pendingInvalidationJobs:literal(1),retainedCiphertextRecords:nullable(revision),backupCopies:nullable(revision),externalCopies:nullable(revision),
 cleanup:literal('pending'),backupErasure:literal('subject-to-retention'),minimalControlRetained:literal(true),
 alreadyDeliveredRecalled:literal(false),replayAllowed:literal(false)});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Command=ReturnType<typeof RetentionCommandSchema.parse>;
type Reason='forget'|'expiry';

/** Every class uses an enrolled finite period. Expiry is a metadata validation,
 * not caller clock authority, legal hold or permission to destroy ciphertext. */
export function validateRetentionWindow(raw:unknown,periodSeconds:number){
 const v=object({class:ContentClassSchema,acceptedAt:timestamp,expiresAt:timestamp}).parse(raw);
 positive.parse(periodSeconds);demand(periodSeconds<=86400,'RETENTION_RESTRICTED');
 const accepted=Date.parse(v.acceptedAt),expires=Date.parse(v.expiresAt);
 demand(expires>accepted&&expires-accepted<=periodSeconds*1000,'RETENTION_RESTRICTED');return v;
}

/** Both modes retain the accepted version5 journal and exact restriction owner
 * protocol. Explicit forget calls the unchanged ForgetWorkRepository. Expiry
 * overrides only admission/publication and accepts no caller epoch or clock. */
class RetentionOwner extends ForgetWorkRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:ForgetWorkRepository['native'],readonly reason:Reason,hooks:EpochPublicationHooks={}){
  super(uow,journal,native,reason==='forget'?{...hooks,afterPublication:async tx=>{
   const rows=(await tx.query(`SELECT command_key FROM fabric.storage_forget_work
    WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() AND actor_id=fabric.current_identity()
    AND xmin=(txid_current()%4294967296)::text::xid LIMIT 2`)).rows;
   demand(rows.length===1,'AUTHORITY_UNAVAILABLE');
   await tx.query("SELECT fabric.storage_record_retention_work($1,'forget')",[rows[0]?.['command_key']]);await hooks.afterPublication?.(tx);
  }}:hooks);
 }
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  if(this.reason==='forget')return super.locks(tx,scope,key);
  // Same barrier/original-key/isolation/current-scope protocol as the installed
  // epoch owner; expiry has maintenance power, never an implicit forget grant.
  assertVerifiedScope(scope);await revalidateScope(scope);demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',scope.tenantId,scope.spaceId,scope.actorId,key])]);
  demand((await tx.query('SHOW transaction_isolation')).rows[0]?.['transaction_isolation']==='read committed','REQUIRED_CAPABILITY_UNSUPPORTED');
  await revalidateScope(scope);await currentScope(tx,scope);
  demand(scope.grants.includes('storage:maintenance')&&scope.grants.includes('task:write')&&scope.grants.includes('storage:read'),'UNAUTHORIZED');
 }
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  await super.inspectOriginal(tx,scope,row);await this.event(tx,scope,String(row['command_key']));
 }
 private async event(tx:SqlTransaction,scope:VerifiedScope,key:string){
  const r=(await tx.query(`SELECT e.*,h.accepted_at AS head_accepted,h.expires_at AS head_expires
   FROM fabric.storage_retention_events e JOIN fabric.storage_current_heads h USING(tenant_id,space_id,class,id,revision)
   WHERE e.tenant_id=$1 AND e.space_id=$2 AND e.actor_id=$3 AND e.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,key])).rows[0];
  demand(r,'AUTHORITY_UNAVAILABLE');demand(r['reason']===this.reason,'IDEMPOTENCY_CONFLICT');
  demand(r['accepted_at'] instanceof Date&&r['expires_at'] instanceof Date&&r['head_accepted'] instanceof Date&&r['head_expires'] instanceof Date
   &&r['accepted_at'].getTime()===r['head_accepted'].getTime()&&r['expires_at'].getTime()===r['head_expires'].getTime(),'AUTHORITY_UNAVAILABLE');return r;
 }
 override async forget(scope:VerifiedScope,raw:unknown){
  demand(this.reason==='forget','REQUIRED_CAPABILITY_UNSUPPORTED');return super.forget(scope,raw);
 }
 async expire(scope:VerifiedScope,raw:unknown){
  demand(this.reason==='expiry','REQUIRED_CAPABILITY_UNSUPPORTED');const command=RetentionCommandSchema.parse(raw),binding=hash(command);
  await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'maintenance',command.expiresAt);
   const head=(await tx.query(`SELECT h.*,e.source_task_id FROM fabric.storage_current_heads h JOIN fabric.storage_entities e USING(tenant_id,space_id,class,id,revision)
    WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class=$3 AND h.id=$4 ORDER BY revision DESC LIMIT 1`,[scope.tenantId,scope.spaceId,command.entity.class,command.entity.id])).rows[0];
   demand(head&&Number(head['revision'])===command.entity.revision&&head['witness']===command.entity.witness,'STALE_REVISION');
   demand(head['expires_at'] instanceof Date&&head['accepted_at'] instanceof Date,'AUTHORITY_UNAVAILABLE');
   const policy=StoragePolicySchema.parse((await tx.query('SELECT p.periods,p.operations FROM fabric.storage_policy p JOIN fabric.storage_authority_epoch e ON (e.tenant_id,e.space_id,e.policy_revision)=(p.tenant_id,p.space_id,p.revision) WHERE e.tenant_id=$1 AND e.space_id=$2 AND e.epoch=$3',[scope.tenantId,scope.spaceId,head['epoch']])).rows[0]);
   // A policy reduction does not rewrite old deadlines. Old records still sweep
   // at their immutable deadline; new-window admission must obey current policy.
   validateRetentionWindow({class:command.entity.class,acceptedAt:head['accepted_at'].toISOString(),expiresAt:head['expires_at'].toISOString()},policy.periods[command.entity.class]);
   const restricted=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision>=$5) OR EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 AND $3='source' AND source_id=$4 AND source_revision=$5) AS restricted`,[scope.tenantId,scope.spaceId,command.entity.class,command.entity.id,command.entity.revision])).rows[0];
   demand(restricted?.['restricted']===false,'RETENTION_RESTRICTED');
   await this.authority.controlAudience(tx,scope,{class:command.entity.class,id:command.entity.id,revision:command.entity.revision});
   const clock=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'];demand(clock instanceof Date,'AUTHORITY_UNAVAILABLE');
   demand(clock>=head['expires_at'],'RETENTION_RESTRICTED');const at=timestamp.parse(clock.toISOString()),receiptId=randomUUID(),jobId=randomUUID();
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,previous.policyRevision,undefined,undefined,{entity:command.entity,epoch:previous.epoch+1,key:command.key,at},{actorId:scope.actorId,key:command.key,binding,receiptId,jobId,entity:command.entity,epoch:previous.epoch+1,at})});
   const pending:PendingEpoch={schemaVersion:5,kind:'forget-work',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,entity:command.entity,at,receiptId,jobId};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_expiry_work($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,command.entity.class,command.entity.id,command.entity.revision,command.entity.witness,at,command.expiresAt,receiptId,jobId]);
   await this.hooks.afterPublication?.(tx);const native=await this.controlNative(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  });
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 async impact(scope:VerifiedScope,command:Command){
  return this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);await this.authority.check(tx,scope,'maintenance');
   const original=await this.original(tx,scope,command.key);demand(original&&original['binding_digest']===hash(command),'IDEMPOTENCY_CONFLICT');
   const native=await this.controlNative(tx,scope,command.sessionId);await this.inspectOriginal(tx,scope,original);const event=await this.event(tx,scope,command.key);
   const count=(await tx.query(`SELECT count(*)::int AS n FROM (
    SELECT 1 FROM fabric.storage_sources WHERE $3='source' AND tenant_id=$1 AND space_id=$2 AND source_id=$4 AND revision=$5
    UNION ALL SELECT 1 FROM fabric.storage_knowledge_revisions WHERE $3='knowledge' AND tenant_id=$1 AND space_id=$2 AND id=$4 AND revision=$5
    UNION ALL SELECT 1 FROM fabric.storage_artifact_versions WHERE $3='artifact' AND tenant_id=$1 AND space_id=$2 AND id=$4 AND revision=$5
   ) retained`,[scope.tenantId,scope.spaceId,command.entity.class,command.entity.id,command.entity.revision])).rows[0]?.['n'];
   await this.authority.check(tx,scope,'maintenance');await this.native.fresh(tx,scope,native);
   return RetentionImpactSchema.parse({schemaVersion:1,status:'restriction-committed',reason:this.reason,receiptId:event['receipt_id'],jobId:event['job_id'],epoch:Number(event['epoch']),entity:command.entity,
    coverage:'exact-target-only',activeRestricted:1,derivedAffected:null,pendingInvalidationJobs:1,retainedCiphertextRecords:['source','knowledge','artifact'].includes(command.entity.class)?count:null,backupCopies:null,externalCopies:null,
    cleanup:'pending',backupErasure:'subject-to-retention',minimalControlRetained:true,alreadyDeliveredRecalled:false,replayAllowed:false});
  });
 }
}

/** Current authorized original-key lookup recovers actual effects after client
 * recreation. UNKNOWN_COMMIT is never caught as permission to replay. */
export class RetentionWorkRepository {
 readonly forgetOwner:RetentionOwner;readonly expiryOwner:RetentionOwner;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:ForgetWorkRepository['native'],hooks:EpochPublicationHooks={}){
  this.forgetOwner=new RetentionOwner(uow,journal,native,'forget',hooks);this.expiryOwner=new RetentionOwner(uow,journal,native,'expiry',hooks);
 }
 async lookup(scope:VerifiedScope,raw:unknown,reason:Reason='forget'){
  enumeration('forget','expiry').parse(reason);const c=RetentionCommandSchema.parse(raw),owner=reason==='forget'?this.forgetOwner:this.expiryOwner,result=await owner.lookup(scope,c);
  return result.status==='committed'?owner.impact(scope,c):result;
 }
 private async commit(scope:VerifiedScope,raw:unknown,reason:Reason){
  enumeration('forget','expiry').parse(reason);const c=RetentionCommandSchema.parse(raw),owner=reason==='forget'?this.forgetOwner:this.expiryOwner;
  const original=await this.lookup(scope,c,reason);if(original.status!=='absent-safe')return original;
  try{const result=reason==='forget'?await owner.forget(scope,c):await owner.expire(scope,c);if(result.status!=='committed')return result;}
  catch(e){if(!(e instanceof StorageError&&e.code==='IDEMPOTENCY_CONFLICT'))throw e;}
  return this.lookup(scope,c,reason);
 }
 forget(scope:VerifiedScope,raw:unknown){return this.commit(scope,raw,'forget');}
 expire(scope:VerifiedScope,raw:unknown){return this.commit(scope,raw,'expiry');}
 async sweep(scope:VerifiedScope,raw:unknown){
  const command=RetentionSweepSchema.parse(raw),owner=this.expiryOwner;
  const refs=await this.uow.withScope(scope,async tx=>{
   await owner.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const rows=(await tx.query(`SELECT h.*,e.source_task_id,
    EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(h.tenant_id,h.space_id,h.class,h.id) AND d.revision>=h.revision) OR EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE h.class='source' AND (r.tenant_id,r.space_id,r.source_id,r.source_revision)=(h.tenant_id,h.space_id,h.id,h.revision)) AS restricted,
    h.expires_at<=clock_timestamp() AS expired
    FROM (SELECT DISTINCT ON(id) * FROM fabric.storage_current_heads
     WHERE tenant_id=$1 AND space_id=$2 AND class=$3 ORDER BY id,revision DESC LIMIT 513) h
    JOIN fabric.storage_entities e USING(tenant_id,space_id,class,id,revision) ORDER BY h.id`,[scope.tenantId,scope.spaceId,command.class])).rows;
   demand(rows.length<=512,'REQUIRED_CAPABILITY_UNSUPPORTED');const selected=[],tasks=new Set<string>();
   for(const row of rows){if(row['expired']!==true||row['restricted']!==false)continue;
    const ref=EntityRefSchema.parse({class:row['class'],id:row['id'],revision:Number(row['revision']),witness:row['witness']});
    demand(typeof row['source_task_id']==='string','AUTHORITY_UNAVAILABLE');tasks.add(row['source_task_id']);selected.push(ref);
   }
   for(const task of [...tasks].sort())await owner.authority.currentAudience(tx,scope,task);
   await owner.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   return selected;
  });
  // Each exact target is its own atomic restriction. A failed/unknown batch is
  // partial progress, not permission to retry uncertain commands automatically.
  const results=[];
  for(const entity of refs){const h=createHash('sha256').update(JSON.stringify([scope.tenantId,scope.spaceId,scope.actorId,command.key,entity])).digest('hex');
   const key=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
   const result=await this.expire(scope,{key,sessionId:command.sessionId,expiresAt:command.expiresAt,entity});results.push({key,result});
   if(result.status==='unknown')break;
  }
  return {coverage:'exact-target-only' as const,results};
 }
}
