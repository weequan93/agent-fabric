import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,timestamp } from './decoder.js';
import { demand,StorageError } from './errors.js';
import { revalidateScope,assertVerifiedScope,type VerifiedScope,type SqlTransaction,type AsyncUnitOfWork,type NativeRepository } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { EpochAnchorSchema,StoragePolicySchema,controlDigest,bridgedControls } from './authority.js';
import { EpochPublicationRepository,type EpochPublicationHooks } from './epoch-publication.js';
import { EpochWitnessJournal,type PendingEpoch } from './epoch-journal.js';
import { ShareMaterialSchema,type ShareMaterial,type ShareMaterialResolver } from './share-material.js';
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,materialId:uuid});
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Creation of an explicit control relation only. Source controls are unchanged;
 * incoming destination controls advance atomically. No content copy/publication
 * exception, worker authority or historical audience grant is conferred. */
export class SharePublicationRepository extends EpochPublicationRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:NativeRepository,readonly materials:ShareMaterialResolver,hooks:EpochPublicationHooks={}){super(uow,journal,native,hooks);}
 private async twoSpaces(tx:SqlTransaction,scope:VerifiedScope,m:ShareMaterial){
  assertVerifiedScope(scope);await revalidateScope(scope);
  demand(m.tenantId===scope.tenantId&&m.destinationSpaceId===scope.spaceId&&m.sourceSpaceId!==scope.spaceId,'UNAUTHORIZED');
  demand((await tx.query("SELECT to_regclass('fabric.recovery_task_controls') IS NOT NULL AS installed")).rows[0]?.['installed']===true,'AUTHORITY_UNAVAILABLE');
  for(const sp of [m.sourceSpaceId,scope.spaceId].sort())await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,sp])]);
 }
 private material(row:Record<string,unknown>):ShareMaterial{return ShareMaterialSchema.parse({tenantId:row['tenant_id'],destinationSpaceId:row['space_id'],relationId:row['relation_id'],sourceSpaceId:row['source_space_id'],source:{id:row['source_id'],revision:Number(row['source_revision']),witness:row['witness']}});}
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  // Route from immutable receipt or independently reserved material BEFORE any
  // one-Space lock. Recreated recovery does not need the staged material owner.
  const row=(await tx.query('SELECT * FROM fabric.storage_share_publications WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,key])).rows[0];
  const p=(await this.journal.state(scope.tenantId,scope.spaceId))?.pending;
  const m=row?this.material(row):p&&'schemaVersion' in p&&p.schemaVersion===7&&p.actorId===scope.actorId&&p.key===key?p.material:undefined;
  if(m)await this.twoSpaces(tx,scope,m);
  await super.locks(tx,scope,key);demand(scope.grants.includes('storage:share'),'UNAUTHORIZED');
  if(m)await this.source(tx,scope,m,false);
 }
 private async source(tx:SqlTransaction,scope:VerifiedScope,m:ShareMaterial,eligible:boolean){
  const raw=(await tx.query('SELECT fabric.storage_share_candidate($1,$2,$3) AS control',[m.sourceSpaceId,m.source.id,m.source.revision])).rows[0]?.['control'];
  demand(raw&&typeof raw==='object','UNAUTHORIZED');const c=raw as Record<string,unknown>,e=c['epoch'] as Record<string,unknown>|undefined;
  let anchor;try{anchor=await this.journal.current(scope.tenantId,m.sourceSpaceId);}catch{throw new StorageError('AUTHORITY_UNAVAILABLE');}
  demand(anchor&&e&&Number(e['epoch'])===anchor.epoch&&e['anchor_id']===anchor.anchorId&&Number(e['policy_revision'])===anchor.policyRevision&&e['control_digest']===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
  const controls=bridgedControls(c['controls']);demand(hash(controls)===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
  const sourceTaskId=uuid.parse(c['source_task_id']);await this.authority.currentAudience(tx,scope,sourceTaskId,m.sourceSpaceId);
  if(eligible){
   const policyRow=controls[1]?.[0];demand(policyRow,'AUTHORITY_UNAVAILABLE');const policy=StoragePolicySchema.parse({periods:policyRow['periods'],operations:policyRow['operations']});
   demand(new Set(policy.operations).size===policy.operations.length&&Object.values(policy.periods).every(n=>n<=86400),'RETENTION_RESTRICTED');demand(policy.operations.includes('read')&&policy.operations.includes('share'),'UNAUTHORIZED');
   const h=controls[2]?.filter(x=>x['class']==='source'&&x['id']===m.source.id).sort((a,b)=>Number(b['revision'])-Number(a['revision']))[0];
   demand(h&&Number(h['revision'])===m.source.revision&&h['witness']===m.source.witness,'STALE_REVISION');
   demand(!controls[3]?.some(x=>x['class']==='source'&&x['id']===m.source.id&&Number(x['revision'])>=m.source.revision)&&!controls[4]?.some(x=>x['source_id']===m.source.id&&Number(x['source_revision'])===m.source.revision),'RETENTION_RESTRICTED');
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[h['expires_at']])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
  }
  return {sourceTaskId,anchor};
 }
 override async refresh(_scope:VerifiedScope,_raw:unknown):Promise<never>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');}
 async publish(scope:VerifiedScope,raw:unknown){
  const command=CommandSchema.parse(raw),binding=hash(command);
  await this.uow.withScope(scope,async tx=>{
   let m;try{const resolved=await this.materials.resolve(tx,scope,command.materialId);demand(resolved,'CONTENT_UNAVAILABLE');m=ShareMaterialSchema.parse(resolved);}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('CONTENT_UNAVAILABLE');}
   await this.twoSpaces(tx,scope,m);await this.locks(tx,scope,command.key);
   demand(!await this.original(tx,scope,command.key),'IDEMPOTENCY_CONFLICT');
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const previous=await this.authority.check(tx,scope,'share',command.expiresAt);await this.authority.check(tx,scope,'read',command.expiresAt);
   const source=await this.source(tx,scope,m,true);
   demand(!(await tx.query('SELECT 1 FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 AND relation_id=$3',[scope.tenantId,scope.spaceId,m.relationId])).rows.length,'STALE_REVISION');
   const next=EpochAnchorSchema.parse({...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:await controlDigest(tx,scope.tenantId,scope.spaceId,previous.policyRevision,undefined,undefined,undefined,undefined,undefined,{relationId:m.relationId,sourceSpaceId:m.sourceSpaceId,sourceId:m.source.id,sourceRevision:m.source.revision,sourceTaskId:source.sourceTaskId,sourceEpoch:source.anchor.epoch,destinationEpoch:previous.epoch+1})});
   const pending:PendingEpoch={schemaVersion:7,kind:'share-publication',actorId:scope.actorId,key:command.key,binding,sessionId:command.sessionId,expiresAt:command.expiresAt,previous,next,materialId:command.materialId,material:m,sourceTaskId:source.sourceTaskId,sourceAnchor:source.anchor};
   await this.journal.reserve(scope.tenantId,scope.spaceId,pending);await this.hooks.afterReserve?.();
   await tx.query('SELECT fabric.storage_publish_share($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[command.key,binding,command.sessionId,previous.epoch,previous.anchorId,next.anchorId,previous.controlDigest,next.controlDigest,command.materialId,m.relationId,m.sourceSpaceId,m.source.id,m.source.revision,m.source.witness,source.anchor.epoch,command.expiresAt]);
   await this.hooks.afterPublication?.(tx);
   const native=await this.controlNative(tx,scope,command.sessionId);await this.native.fresh(tx,scope,native);
   const current=await this.source(tx,scope,m,true);demand(same(current,source),'AUTHORITY_UNAVAILABLE');
   demand(await controlDigest(tx,scope.tenantId,scope.spaceId,next.policyRevision)===next.controlDigest,'AUTHORITY_UNAVAILABLE');
   await currentScope(tx,scope);await revalidateScope(scope);demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
  });
  await this.hooks.beforeWitnessAck?.();return this.lookup(scope,command);
 }
 override async lookup(scope:VerifiedScope,raw:unknown){const command=CommandSchema.parse(raw);return this.reconcile(scope,command,hash(command));}
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const marker=(await tx.query(`SELECT p.*,s.source_space_id AS installed_space,s.source_id AS installed_id,s.source_revision AS installed_revision,s.source_task_id AS installed_task,s.status AS installed_status,s.source_epoch AS installed_source_epoch,s.destination_epoch AS installed_destination_epoch
   FROM fabric.storage_share_publications p JOIN fabric.storage_shares s ON(s.tenant_id,s.destination_space_id,s.relation_id,s.revision)=(p.tenant_id,p.space_id,p.relation_id,p.revision)
   WHERE p.tenant_id=$1 AND p.space_id=$2 AND p.actor_id=$3 AND p.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  demand(marker&&marker['source_space_id']===marker['installed_space']&&marker['source_id']===marker['installed_id']&&marker['source_revision']===marker['installed_revision']&&marker['source_task_id']===marker['installed_task']&&marker['status']===marker['installed_status']&&marker['source_epoch']===marker['installed_source_epoch']&&marker['destination_epoch']===marker['installed_destination_epoch']&&Number(marker['destination_epoch'])===Number(row['epoch']),'AUTHORITY_UNAVAILABLE');
  const m=this.material(marker);demand(row['expires_at'] instanceof Date&&hash(CommandSchema.parse({key:row['command_key'],sessionId:row['session_id'],expiresAt:row['expires_at'].toISOString(),materialId:marker['material_id']}))===row['binding_digest'],'AUTHORITY_UNAVAILABLE');
  const p=(await this.journal.state(scope.tenantId,scope.spaceId))?.pending;
  if(p)demand('schemaVersion' in p&&p.schemaVersion===7&&same(p.material,m)&&p.materialId===marker['material_id']&&p.sourceTaskId===marker['source_task_id']&&p.sourceAnchor.epoch===Number(marker['source_epoch']),'AUTHORITY_UNAVAILABLE');
  const observed=await this.source(tx,scope,m,false);demand(observed.sourceTaskId===marker['source_task_id'],'AUTHORITY_UNAVAILABLE');
 }
}
