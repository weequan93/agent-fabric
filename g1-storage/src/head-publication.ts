import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,timestamp,nullable } from './decoder.js';
import { demand,StorageError } from './errors.js';
import { revalidateScope,type VerifiedScope,type SqlTransaction } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { EpochAnchorSchema,StoragePolicySchema,controlDigest } from './authority.js';
import { EpochPublicationRepository,type EpochPublicationHooks } from './epoch-publication.js';
import { EntityRefSchema,EpochWitnessJournal,type PendingEpoch } from './epoch-journal.js';
import { HeadMaterialSchema,type HeadMaterial,type HeadMaterialResolver } from './head-material.js';
import type { AsyncUnitOfWork,NativeRepository } from './owners.js';
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,materialId:uuid,expected:nullable(EntityRefSchema)});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export type HeadWorkOverride=NonNullable<Parameters<typeof controlDigest>[7]>;
/** Installed prerequisite only; runs inside the publisher's authenticated UoW.
 * Returned validation runs after the head effect, before that SAME COMMIT. */
export interface HeadPublicationPrerequisite {
 prepare(tx:SqlTransaction,scope:VerifiedScope,command:ReturnType<typeof CommandSchema.parse>,material:HeadMaterial):Promise<()=>Promise<void>>;
 /** Installed canonical owner forecasts the exact receipt/outbox before reserve.
  * It must write those same rows in prepare's returned pre-COMMIT effect. */
 forecastWork?(tx:SqlTransaction,scope:VerifiedScope,command:ReturnType<typeof CommandSchema.parse>,material:HeadMaterial,epoch:number,at:string):Promise<HeadWorkOverride>;
}
/** Current head controls only. An opaque material is supplied by an installed
 * owner, not request JSON. No payload/save/outbox/restore completion is claimed. */
export class HeadPublicationRepository extends EpochPublicationRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:NativeRepository,readonly materials:HeadMaterialResolver,hooks:EpochPublicationHooks={},readonly prerequisite?:HeadPublicationPrerequisite){super(uow,journal,native,hooks);}
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  await super.locks(tx,scope,key);demand(scope.grants.includes('storage:write'),'UNAUTHORIZED');
 }
 override async refresh(_scope:VerifiedScope,_raw:unknown):Promise<never>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');}
 protected commandBinding(command:ReturnType<typeof CommandSchema.parse>){return hash(command);}
 async publish(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw),binding=this.commandBinding(command);
  await this.uow.withScope(scope,async tx=>{
   await this.locks(tx,scope,command.key);demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'write',command.expiresAt);
   let material;
   try{const resolved=await this.materials.resolve(tx,scope,command.materialId);demand(resolved,'CONTENT_UNAVAILABLE');material=HeadMaterialSchema.parse(resolved);}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('CONTENT_UNAVAILABLE');}
   demand(material.tenantId===scope.tenantId&&material.spaceId===scope.spaceId,'UNAUTHORIZED');
   const head=(await tx.query('SELECT revision FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId,material.class,material.id])).rows[0];
   if(command.expected){
    demand(command.expected.class===material.class&&command.expected.id===material.id&&material.revision===command.expected.revision+1,'STALE_REVISION');
    await this.authority.entity(tx,scope,command.expected);
   }else demand(!head&&material.revision===1,'STALE_REVISION');
   // Orphan historical entities and tombstones cannot be reenrolled as revision1.
   demand(!(await tx.query('SELECT 1 FROM fabric.storage_entities WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision>=$5',[scope.tenantId,scope.spaceId,material.class,material.id,material.revision])).rows.length,'STALE_REVISION');
   await this.authority.currentAudience(tx,scope,material.sourceTaskId);
   const policyRow=(await tx.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[scope.tenantId,scope.spaceId,previous.policyRevision])).rows[0];
   const policy=StoragePolicySchema.parse(policyRow),clock=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'];
   demand(clock instanceof Date,'AUTHORITY_UNAVAILABLE');const at=timestamp.parse(clock.toISOString());
   demand(material.expiresAt>at&&Date.parse(material.expiresAt)-Date.parse(at)<=policy.periods[material.class]*1000,'RETENTION_RESTRICTED');
   const validatePrepared=await this.prerequisite?.prepare(tx,scope,command,material);
   const work=await this.prerequisite?.forecastWork?.(tx,scope,command,material,previous.epoch+1,at);
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,previous.policyRevision,undefined,undefined,undefined,work,{...material,epoch:previous.epoch+1,at})});
   const pending:PendingEpoch={schemaVersion:6,kind:'head-publication',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,materialId:command.materialId,material,expected:command.expected,at};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_head($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,command.materialId,JSON.stringify(material),JSON.stringify(command.expected),at,command.expiresAt]);
   await this.hooks.afterPublication?.(tx);
   const native=await this.native.load(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   await this.authority.currentAudience(tx,scope,native.binding.taskId);await this.authority.currentAudience(tx,scope,material.sourceTaskId);
   // Repeat exact previous eligibility after publication, without entity()'s
   // latest-head check: the previous revision is now historical by design.
   if(command.expected)await this.authority.controlAudience(tx,scope,{class:command.expected.class,id:command.expected.id,revision:command.expected.revision});
   await currentScope(tx,scope);await revalidateScope(scope);
   await validatePrepared?.();
   // Canonical prerequisite writes are part of this controls check, never a
   // separate transaction after COMMIT. Repeat native/identity after its awaits.
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await this.native.fresh(tx,scope,native);await currentScope(tx,scope);await revalidateScope(scope);
   const live=(await tx.query('SELECT clock_timestamp()<$1::timestamptz AS command_live,clock_timestamp()<$2::timestamptz AS material_live',[command.expiresAt,material.expiresAt])).rows[0];
   demand(live?.['command_live']===true,'EXPIRED_COMMAND');demand(live?.['material_live']===true,'RETENTION_RESTRICTED');
  });
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 override async lookup(scope:VerifiedScope,raw:unknown){const command=CommandSchema.parse(raw);return this.reconcile(scope,command,this.commandBinding(command));}
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const marker=(await tx.query(`SELECT p.*,x.source_task_id AS installed_task_id,h.witness AS installed_witness,h.key_id AS installed_key_id,h.generation AS installed_generation,h.epoch AS installed_epoch,h.accepted_at AS installed_at,h.expires_at AS installed_expires
   FROM fabric.storage_head_publications p JOIN fabric.storage_entities x USING(tenant_id,space_id,class,id,revision)
   JOIN fabric.storage_current_heads h USING(tenant_id,space_id,class,id,revision)
   WHERE p.tenant_id=$1 AND p.space_id=$2 AND p.actor_id=$3 AND p.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  demand(marker&&marker['source_task_id']===marker['installed_task_id']&&marker['witness']===marker['installed_witness']&&marker['key_id']===marker['installed_key_id']&&marker['generation']===marker['installed_generation']
   &&Number(marker['epoch'])===Number(row['epoch'])&&Number(marker['epoch'])===Number(marker['installed_epoch'])&&marker['accepted_at'] instanceof Date&&marker['installed_at'] instanceof Date
   &&marker['expires_at'] instanceof Date&&marker['installed_expires'] instanceof Date&&marker['accepted_at'].getTime()===marker['installed_at'].getTime()&&marker['expires_at'].getTime()===marker['installed_expires'].getTime(),'AUTHORITY_UNAVAILABLE');
  const material=HeadMaterialSchema.parse({tenantId:scope.tenantId,spaceId:scope.spaceId,class:marker['class'],id:marker['id'],revision:Number(marker['revision']),witness:marker['witness'],keyId:marker['key_id'],generation:marker['generation'],sourceTaskId:marker['source_task_id'],expiresAt:marker['expires_at'].toISOString()});
  const expected=marker['expected_revision']===null?null:EntityRefSchema.parse({class:material.class,id:material.id,revision:Number(marker['expected_revision']),witness:marker['expected_witness']});
  demand(row['expires_at'] instanceof Date&&this.commandBinding(CommandSchema.parse({key:row['command_key'],sessionId:row['session_id'],expiresAt:row['expires_at'].toISOString(),materialId:marker['material_id'],expected}))===row['binding_digest'],'AUTHORITY_UNAVAILABLE');
  const p=(await this.journal.state(scope.tenantId,scope.spaceId))?.pending;
  if(p)demand('schemaVersion' in p&&p.schemaVersion===6&&p.materialId===marker['material_id']&&same(p.material,material)&&same(p.expected,expected)&&p.at===marker['accepted_at'].toISOString(),'AUTHORITY_UNAVAILABLE');
  await this.authority.currentAudience(tx,scope,material.sourceTaskId);
  if(expected)await this.authority.controlAudience(tx,scope,{class:expected.class,id:expected.id,revision:expected.revision});
 }
}
