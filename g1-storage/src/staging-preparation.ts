import { object,uuid,timestamp,digest } from './decoder.js';
import { createHash } from 'node:crypto';
import { EpochWitnessJournal,type OwnedAnchorRoot } from './epoch-journal.js';
import type { CryptoStore } from './crypto-store.js';
import type { HeadPublicationPrerequisite } from './head-publication.js';
import { BindingSchema } from './schema.js';
import { demand,StorageError,FoundationError } from './errors.js';
import { ModelError } from '../../g1-model/src/errors.js';
import { IdentityError } from '../../g1-identity/src/contracts.js';
import type { AsyncUnitOfWork,VerifiedScope,SqlTransaction } from './owners.js';
import { StorageAuthorityRepository } from './authority.js';
import type { CipherBinding } from './contracts.js';
import { StagingWitnessJournal,type StagingWitness } from './staging-witness.js';
import { OwnedCipherFiles,FileConfirmationSchema,type FileConfirmation,type StagingControl,type LockedStagingLease,type StagingLease } from './owned-cipher-files.js';

export const stagedHeadWitness=(c:FileConfirmation)=>'sha256:'+createHash('sha256').update(JSON.stringify(FileConfirmationSchema.parse(c))).digest('hex');

export const StagingMaterialSchema=object({binding:BindingSchema,rootId:uuid,commandKey:uuid,
 sessionId:uuid,sourceTaskId:uuid,expiresAt:timestamp});
export type StagingMaterial=ReturnType<typeof StagingMaterialSchema.parse>;
/** Installed owner capability, never an input body or backup. Each lookup must
 * resolve CURRENT generation/root and original command binding under tx locks. */
export interface StagingMaterialResolver {
 resolve(tx:SqlTransaction,scope:VerifiedScope,materialId:string):Promise<StagingMaterial|undefined>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Authenticated durable preparation. This is deliberately not canonical
 * publication or a serving API. An unconsumed reservation remains pending and
 * GC-protected even after expiry/COMMIT uncertainty. No absence permits replay.
 * An explicit authenticated abandonment is an immutable preparation-only
 * terminal outcome independently enrolled/intended/settled outside PG.
 * The installed head prerequisite holds these same locks and rejects terminal
 * uploads; consumed staging is an exact head-control outcome, never a canonical
 * save receipt. Canonical save/event/outbox remain with the content owner.
 * Explicit recovery uses CURRENT maintenance authority without resuming
 * the original command or native run. */
export class AuthenticatedStagingPreparation implements StagingControl {
 readonly #materialId:string;
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:StorageAuthorityRepository,
  readonly scope:VerifiedScope,readonly materials:StagingMaterialResolver,materialId:string,readonly witness:StagingWitnessJournal,
  readonly hooks:{afterAbandonment?(tx:SqlTransaction):Promise<void>;beforeWitnessAck?():Promise<void>;
   /** Installed canonical content owner binding; never a caller-supplied digest.
    * Default preserves control-only predecessor command binding exactly. */
   publicationBinding?(tx:SqlTransaction,scope:VerifiedScope,command:{key:string;sessionId:string;expiresAt:string;materialId:string;expected:Parameters<HeadPublicationPrerequisite['prepare']>[2]['expected']}):Promise<string>}={}){
 this.#materialId=uuid.parse(materialId);
 }
 async #withScope<T>(work:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  try{return await this.uow.withScope(this.scope,work);}catch(e){
   if(e instanceof StorageError)throw e;
   if(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')throw e;
   if(e instanceof IdentityError)throw new StorageError('UNAUTHORIZED');
   if(e instanceof FoundationError&&['UNAUTHORIZED','UNVERIFIED_SCOPE'].includes(e.code))throw new StorageError('UNAUTHORIZED');
   if(e instanceof FoundationError&&e.code==='STALE_AUTHORITY')throw new StorageError('AUTHORITY_UNAVAILABLE');
   if(e instanceof ModelError&&['UNAUTHORIZED','SCOPE_MISMATCH','STALE_FENCE','EXPIRED_COMMAND','CHECK_BINDING_MISMATCH','REQUIRED_CAPABILITY_UNSUPPORTED'].includes(e.code))
    throw new StorageError(e.code as 'UNAUTHORIZED'|'SCOPE_MISMATCH'|'STALE_FENCE'|'EXPIRED_COMMAND'|'CHECK_BINDING_MISMATCH'|'REQUIRED_CAPABILITY_UNSUPPORTED');
   throw new StorageError('CONTENT_UNAVAILABLE');
  }
 }
 async #resolvedMaterial(tx:SqlTransaction){
  let m:StagingMaterial;
  try {const raw=await this.materials.resolve(tx,this.scope,this.#materialId);demand(raw,'CONTENT_UNAVAILABLE');m=StagingMaterialSchema.parse(raw);}
  catch(e){if(e instanceof StorageError)throw e;throw new StorageError('CONTENT_UNAVAILABLE');}
  return m;
 }
 async #material(tx:SqlTransaction,recovery=false){
  const m=await this.#resolvedMaterial(tx);
  demand(m.binding.tenantId===this.scope.tenantId&&m.binding.spaceId===this.scope.spaceId,'SCOPE_MISMATCH');
  if(recovery)await this.authority.check(tx,this.scope,'maintenance');
  else {
   await this.authority.assertCurrent(tx,this.scope,{purpose:'maintenance',sessionId:m.sessionId,expiresAt:m.expiresAt});
   await this.authority.check(tx,this.scope,'write',m.expiresAt);
  }
  const native=await this.authority.native.load(tx,this.scope,m.sessionId);
  demand(native.binding.taskId===m.sourceTaskId,'SCOPE_MISMATCH');
  if(recovery){
   demand(native.binding.actorId===this.scope.actorId,'UNAUTHORIZED');
   demand(native.binding.intent==='Ask'&&native.binding.purpose==='maintenance'
    &&native.admission.executionClass==='service'&&native.admission.resourceId===null
    &&native.admission.computerCapability===null&&!native.admission.targetEffect
    &&!native.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  }
  await this.authority.currentAudience(tx,this.scope,m.sourceTaskId);
  if(recovery)await this.authority.check(tx,this.scope,'maintenance');
  return m;
 }
 async #locks(tx:SqlTransaction,recovery=false){
  const m=await this.#material(tx,recovery); // Space barrier always precedes upload lock.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
   [JSON.stringify(['storage-staging-original',this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey])]);
  const fresh=await this.#material(tx,recovery);demand(same(m,fresh),'IDEMPOTENCY_CONFLICT');return fresh;
 }
 #witness(m:StagingMaterial,id:string):StagingWitness{return {schemaVersion:1,actorId:this.scope.actorId,commandKey:m.commandKey,materialId:this.#materialId,
  uploadId:id,rootId:m.rootId,binding:m.binding,sessionId:m.sessionId,sourceTaskId:m.sourceTaskId,expiresAt:m.expiresAt};}
 async reserve(uploadId:string,rootId:string,rawBinding:CipherBinding){
  const id=uuid.parse(uploadId),root=uuid.parse(rootId),binding=BindingSchema.parse(rawBinding);
  await this.#withScope(async tx=>{
   const m=await this.#locks(tx);
   demand(root===m.rootId&&same(binding,m.binding),'SCOPE_MISMATCH');
   const existing=(await tx.query('SELECT upload_id FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',
    [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey])).rows[0];
   demand(!existing,'IDEMPOTENCY_CONFLICT');
   await this.witness.enroll(this.#witness(m,id));
   const b=m.binding;
   await tx.query(`INSERT INTO fabric.storage_staging_reservations(tenant_id,space_id,actor_id,command_key,material_id,upload_id,root_id,class,id,revision,generation,key_id,session_id,source_task_id,expires_at,lease_until)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,least($15::timestamptz,clock_timestamp()+interval '30 seconds'))`,
    [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey,this.#materialId,id,root,b.class,b.id,b.revision,b.generation,b.keyId,m.sessionId,m.sourceTaskId,m.expiresAt]);
   demand(same(m,await this.#material(tx)),'IDEMPOTENCY_CONFLICT');
  });
 }
 async #consumed(tx:SqlTransaction,m:StagingMaterial,confirmation:FileConfirmation|null,published:boolean){
  const anchors=this.authority.anchors;
  const witness=anchors instanceof EpochWitnessJournal
   ?await anchors.headPublication(this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey):undefined;
  const row=(await tx.query(`SELECT p.*,e.binding_digest AS original_binding,e.session_id AS original_session,
   e.expires_at AS original_expires,e.previous_epoch,e.epoch AS original_epoch,e.anchor_id,
   x.source_task_id AS installed_task,
   ROW(p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at)
    IS NOT DISTINCT FROM ROW(h.witness,h.key_id,h.generation,h.epoch,h.accepted_at,h.expires_at) AS exact_head,
   to_char(p.accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_at,
   to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_expires,
   to_char(e.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_original_expires
   FROM fabric.storage_epoch_publications e FULL JOIN fabric.storage_head_publications p USING(tenant_id,space_id,actor_id,command_key)
   LEFT JOIN fabric.storage_current_heads h ON h.tenant_id=p.tenant_id AND h.space_id=p.space_id AND h.class=p.class AND h.id=p.id AND h.revision=p.revision
   LEFT JOIN fabric.storage_entities x ON x.tenant_id=p.tenant_id AND x.space_id=p.space_id AND x.class=p.class AND x.id=p.id AND x.revision=p.revision
   WHERE coalesce(e.tenant_id,p.tenant_id)=$1 AND coalesce(e.space_id,p.space_id)=$2
    AND coalesce(e.actor_id,p.actor_id)=$3 AND coalesce(e.command_key,p.command_key)=$4`,
   [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey])).rows[0];
  if(!row&&(!witness||witness.status==='rolled-back'))return false;
  demand(row&&witness&&(witness.status==='committed'||(published&&witness.status==='pending')),'AUTHORITY_UNAVAILABLE');
  const p=witness.pending,head=p.material,b=m.binding;
  demand(confirmation&&p.materialId===this.#materialId&&p.sessionId===m.sessionId&&p.expiresAt===m.expiresAt
   &&head.tenantId===b.tenantId&&head.spaceId===b.spaceId&&head.class===b.class&&head.id===b.id
   &&head.revision===b.revision&&head.generation===b.generation&&head.keyId===b.keyId
   &&head.sourceTaskId===m.sourceTaskId&&head.witness===stagedHeadWitness(confirmation),'AUTHORITY_UNAVAILABLE');
  const original={key:p.key,sessionId:p.sessionId,expiresAt:p.expiresAt,materialId:p.materialId,expected:p.expected};
  const binding=this.hooks.publicationBinding?digest.parse(await this.hooks.publicationBinding(tx,this.scope,original))
   :'sha256:'+createHash('sha256').update(JSON.stringify(original)).digest('hex');
  demand(row['tenant_id']===b.tenantId&&row['space_id']===b.spaceId&&row['actor_id']===this.scope.actorId&&row['command_key']===m.commandKey
   &&row['material_id']===p.materialId&&row['class']===b.class&&row['id']===b.id&&Number(row['revision'])===b.revision
   &&row['source_task_id']===m.sourceTaskId&&row['installed_task']===m.sourceTaskId&&row['witness']===head.witness
   &&row['key_id']===b.keyId&&row['generation']===b.generation&&row['exact_head']===true
   &&row['exact_at']===p.at.replace('Z','000Z')&&row['exact_expires']===head.expiresAt.replace('Z','000Z')
   &&row['exact_original_expires']===m.expiresAt.replace('Z','000Z')&&row['original_session']===m.sessionId
   &&row['original_binding']===binding&&p.binding===binding&&row['anchor_id']===p.next.anchorId
   &&Number(row['previous_epoch'])===p.previous.epoch&&Number(row['epoch'])===p.next.epoch&&Number(row['original_epoch'])===p.next.epoch
   &&(p.expected?Number(row['expected_revision'])===p.expected.revision&&row['expected_witness']===p.expected.witness
    :row['expected_revision']===null&&row['expected_witness']===null),'AUTHORITY_UNAVAILABLE');
  return true;
 }
 async #current(tx:SqlTransaction,id:string,m:StagingMaterial,recovery=false,published=false):Promise<StagingLease>{
  // After a head effect its independent epoch is deliberately pending until
  // COMMIT reconciliation. The containing head owner validates next controls,
  // native freshness and current full audience; do not authorize via old epoch.
  const live=published?await this.#resolvedMaterial(tx):await this.#material(tx,recovery);
  demand(same(m,live),'IDEMPOTENCY_CONFLICT');
  const row=(await tx.query(`SELECT r.*,c.object_digest,c.manifest_digest,c.object_size,c.manifest_size,a.at AS abandoned_at,
   to_char(a.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS abandoned_witness_at,
   floor(extract(epoch from clock_timestamp())*1000)::text AS observed_at,
   floor(extract(epoch from r.lease_until)*1000)::text AS lease_ms
   FROM fabric.storage_staging_reservations r LEFT JOIN fabric.storage_staging_confirmations c USING(tenant_id,space_id,upload_id)
   LEFT JOIN fabric.storage_staging_abandonments a USING(tenant_id,space_id,actor_id,command_key,upload_id)
   WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.upload_id=$3`,[this.scope.tenantId,this.scope.spaceId,id])).rows[0];
  demand(row,'AUTHORITY_UNAVAILABLE');
  const b=BindingSchema.parse({schemaVersion:1,tenantId:row['tenant_id'],spaceId:row['space_id'],class:row['class'],id:row['id'],revision:Number(row['revision']),generation:row['generation'],keyId:row['key_id']});
  demand(row['actor_id']===this.scope.actorId&&row['command_key']===m.commandKey&&row['material_id']===this.#materialId
   &&row['root_id']===m.rootId&&row['session_id']===m.sessionId&&row['source_task_id']===m.sourceTaskId
   &&row['expires_at'] instanceof Date&&row['expires_at'].toISOString()===m.expiresAt&&same(b,m.binding),'SCOPE_MISMATCH');
  const confirmation=row['object_digest']===null?null:FileConfirmationSchema.parse({schemaVersion:1,
   objectDigest:row['object_digest'],manifestDigest:row['manifest_digest'],objectSize:Number(row['object_size']),manifestSize:Number(row['manifest_size'])});
  const consumed=await this.#consumed(tx,m,confirmation,published);
  const abandoned=row['abandoned_at'];demand(abandoned===null||abandoned instanceof Date,'AUTHORITY_UNAVAILABLE');
  const w=await this.witness.state(this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey);
  demand(same(w.original,this.#witness(m,id)),'AUTHORITY_UNAVAILABLE');
  demand(!w.terminal||(abandoned instanceof Date&&w.terminal.at===row['abandoned_witness_at']),'AUTHORITY_UNAVAILABLE');
  demand(abandoned===null||w.intent,'AUTHORITY_UNAVAILABLE');
  const reachable=(await tx.query(`SELECT
   EXISTS(SELECT 1 FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5 AND generation=$6 AND key_id=$7)
   OR EXISTS(SELECT 1 FROM fabric.storage_commands WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$8 AND command_key=$9)
   OR EXISTS(SELECT 1 FROM fabric.storage_outbox WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$8 AND command_key=$9) AS reachable`,
   [this.scope.tenantId,this.scope.spaceId,b.class,b.id,b.revision,b.generation,b.keyId,this.scope.actorId,m.commandKey])).rows[0]?.['reachable'];
  demand(typeof reachable==='boolean','AUTHORITY_UNAVAILABLE');
  demand(!w.intent||!reachable,'AUTHORITY_UNAVAILABLE');
  demand(!consumed||(reachable&&abandoned===null),'AUTHORITY_UNAVAILABLE');
  return {uploadId:id,rootId:m.rootId,binding:b,observedAt:Number(row['observed_at']),
   leaseUntil:abandoned instanceof Date?Math.min(Number(row['lease_ms']),abandoned.getTime()):Number(row['lease_ms']),
   pending:abandoned===null&&!consumed,unknown:!!w.intent&&!w.terminal,reachable,confirmation};
 }
 async lock<T>(uploadId:string,work:(lease:LockedStagingLease)=>Promise<T>):Promise<T>{
  const id=uuid.parse(uploadId);
  return this.#withScope(async tx=>{
   const m=await this.#locks(tx);
   const current=()=>this.#current(tx,id,m);
   await current();
   const result=await work({current,confirm:async raw=>{
    const c=FileConfirmationSchema.parse(raw),s=await current();
    demand(s.pending&&!s.unknown&&!s.reachable&&s.leaseUntil>s.observedAt&&!s.confirmation,'ARTIFACT_NOT_COMMITTED');
    await tx.query(`INSERT INTO fabric.storage_staging_confirmations(tenant_id,space_id,upload_id,object_digest,manifest_digest,object_size,manifest_size)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[this.scope.tenantId,this.scope.spaceId,id,c.objectDigest,c.manifestDigest,c.objectSize,c.manifestSize]);
    demand(same(c,(await current()).confirmation),'INTEGRITY_FAILED');
   },publish:async()=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');}});
   await current();return result;
  });
 }
 /** Installed ciphertext prerequisite for the head owner. Never nest a second
  * UoW or independently commit a pointer from the filesystem callback. This
  * leaves content save receipts/events/outbox to the canonical save owner. */
 headPrerequisite(root:OwnedAnchorRoot,crypto:CryptoStore):HeadPublicationPrerequisite{
  root=Object.freeze({...root});
  const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
  const prerequisite:HeadPublicationPrerequisite={prepare:async(tx,scope,command,head)=>{
   demand(scope===this.scope,'UNAUTHORIZED');
   const m=await this.#locks(tx),b=m.binding;
   demand(command.materialId===this.#materialId&&command.key===m.commandKey&&command.sessionId===m.sessionId
    &&command.expiresAt===m.expiresAt&&head.sourceTaskId===m.sourceTaskId,'SCOPE_MISMATCH');
   demand(same({tenantId:head.tenantId,spaceId:head.spaceId,class:head.class,id:head.id,revision:head.revision,generation:head.generation,keyId:head.keyId},
    {tenantId:b.tenantId,spaceId:b.spaceId,class:b.class,id:b.id,revision:b.revision,generation:b.generation,keyId:b.keyId})&&root.rootId===m.rootId,'SCOPE_MISMATCH');
   const row=(await tx.query('SELECT upload_id FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',
    [scope.tenantId,scope.spaceId,scope.actorId,m.commandKey])).rows[0];
   demand(row,'ARTIFACT_NOT_COMMITTED');const id=uuid.parse(row['upload_id']);
   const before=await this.#current(tx,id,m);
   demand(before.pending&&!before.unknown&&!before.reachable&&before.confirmation&&before.leaseUntil>before.observedAt,'ARTIFACT_NOT_COMMITTED');
   let published=false;
   const control:StagingControl={reserve:unsupported,lock:async<T>(_id:string,work:(lease:LockedStagingLease)=>Promise<T>):Promise<T>=>{
    demand(_id===id,'SCOPE_MISMATCH');
    const current=()=>this.#current(tx,id,m,false,published);
    const result=await work({current,confirm:unsupported,publish:unsupported});await current();return result;
   }};
   const files=new OwnedCipherFiles(root,crypto,control),confirmation=await files.verifyConfirmation(id,b);
   demand(head.witness===stagedHeadWitness(confirmation),'INTEGRITY_FAILED');
   return async()=>{
    published=true;
    const after=await this.#current(tx,id,m,false,true);
    demand(after.reachable&&!after.pending&&!after.unknown&&after.leaseUntil>after.observedAt,'ARTIFACT_NOT_COMMITTED');
    demand(same(after.confirmation,confirmation),'INTEGRITY_FAILED');
    demand(same(await files.verifyConfirmation(id,b),confirmation),'INTEGRITY_FAILED');
    const final=await this.#current(tx,id,m,false,true);
    demand(final.reachable&&!final.pending&&!final.unknown&&final.leaseUntil>final.observedAt,'ARTIFACT_NOT_COMMITTED');
    demand(same(final.confirmation,confirmation),'INTEGRITY_FAILED');
   };
  }};return Object.freeze(prerequisite);
 }
 /** Reconcile the original committed terminal outcome; no absence or pending
  * state permits replay or physical deletion. No descriptive data is returned. */
 async outcome():Promise<{uploadId:string|null;status:'absent'|'pending'|'abandoned'|'consumed';replayAllowed:false}>{
  return this.#outcome(false);
 }
 async #outcome(recovery:boolean):Promise<{uploadId:string|null;status:'absent'|'pending'|'abandoned'|'consumed';replayAllowed:false}>{
  return this.#withScope(async tx=>{
   const m=await this.#locks(tx,recovery),row=(await tx.query('SELECT upload_id FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',
    [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey])).rows[0];
   if(!row){
    const w=await this.witness.state(this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey);
    demand(!w.intent&&!w.terminal,'AUTHORITY_UNAVAILABLE');
    return {uploadId:null,status:'absent',replayAllowed:false};
   }
   const id=uuid.parse(row['upload_id']),s=await this.#current(tx,id,m,recovery);
   if(!s.pending&&s.unknown){
    const marker=(await tx.query(`SELECT to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at FROM fabric.storage_staging_abandonments WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4 AND upload_id=$5`,
     [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey,id])).rows[0]?.['at'];
    demand(typeof marker==='string','AUTHORITY_UNAVAILABLE');
    await this.hooks.beforeWitnessAck?.();await this.#current(tx,id,m,recovery);
    await this.witness.settle(this.#witness(m,id),marker);
    await this.#current(tx,id,m,recovery);
   }
   const final=await this.#current(tx,id,m,recovery);
   return {uploadId:id,status:final.pending?'pending':final.reachable?'consumed':'abandoned',replayAllowed:false};
  });
 }
 /** Only preparation-only, unpublished bytes may be abandoned. The original
  * command and Space locks serialize stage/confirm/abandon/GC. A failed or lost
  * COMMIT acknowledgement never changes the caller's replay authority. */
 async abandon(uploadId:string):Promise<void>{return this.#abandon(uploadId,false);}
 async #abandon(uploadId:string,recovery:boolean):Promise<void>{
  const id=uuid.parse(uploadId);
  await this.#withScope(async tx=>{
   const m=await this.#locks(tx,recovery),s=await this.#current(tx,id,m,recovery);
   demand(!s.reachable,'ARTIFACT_NOT_COMMITTED');
   if(s.pending){
    await this.witness.intend(this.#witness(m,id));
    await tx.query(`INSERT INTO fabric.storage_staging_abandonments(tenant_id,space_id,actor_id,command_key,upload_id) VALUES($1,$2,$3,$4,$5)`,
     [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey,id]);
    await this.hooks.afterAbandonment?.(tx);
   }
   const final=await this.#current(tx,id,m,recovery);
   demand(!final.pending&&!final.reachable&&final.leaseUntil<=final.observedAt,'AUTHORITY_UNAVAILABLE');
  });
  await this.#outcome(recovery);
 }
 /** Installed, preparation-only recovery capability. Never exposed as a caller
  * mode or as automatic fallback from a live-command refusal. A current scope,
  * maintenance policy/anchor, exact original actor/material/native lineage and
  * full current audience remain mandatory before and after waits/effects.
  * Native load is historical binding inspection, never fresh()/run admission.
  * Only an already reserved, unreachable original may be abandoned. Pending
  * remains protected until that terminal COMMIT. This capability cannot stage,
  * confirm, publish, serve bytes or grant replay even after expiry/Stop.
  */
 recovery():{readonly control:StagingControl;
  outcome:()=>ReturnType<AuthenticatedStagingPreparation['outcome']>;
  abandon:(uploadId:string)=>Promise<void>}{
  const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
  const control:StagingControl=Object.freeze({reserve:unsupported,
   lock:async<T>(uploadId:string,work:(lease:LockedStagingLease)=>Promise<T>):Promise<T>=>{
    const id=uuid.parse(uploadId);
    return this.#withScope(async tx=>{
     const m=await this.#locks(tx,true),current=async()=>{
      const value=await this.#current(tx,id,m,true);
      // This capability must never make administrative inspect eligible, even
      // when a canonical owner has made the exact ciphertext reachable. Refuse
      // the whole recovery operation and leave those bytes with that owner.
      demand(!value.reachable,'ARTIFACT_NOT_COMMITTED');return value;
     };
     await current();const result=await work({current,confirm:unsupported,publish:unsupported});
     await current();return result;
    });
   }});
  return Object.freeze({control,outcome:()=>this.#outcome(true),abandon:(id:string)=>this.#abandon(id,true)});
 }
 /** Serialized original-key inspection only; absence is not replay permission. */
 async original():Promise<{uploadId:string|null;replayAllowed:false}>{
  return this.#withScope(async tx=>{
   const m=await this.#locks(tx),row=(await tx.query('SELECT upload_id FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',
    [this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey])).rows[0];
   if(row)await this.#current(tx,uuid.parse(row['upload_id']),m);
   else {const w=await this.witness.state(this.scope.tenantId,this.scope.spaceId,this.scope.actorId,m.commandKey);demand(!w.intent&&!w.terminal,'AUTHORITY_UNAVAILABLE');}
   return {uploadId:row?uuid.parse(row['upload_id']):null,replayAllowed:false};
  });
 }
}
