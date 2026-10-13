import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import { ArtifactPublicationRepository,type ArtifactCommand,type ArtifactHooks,type ArtifactControlsOwner,type ArtifactValidator } from './artifact-publication.js';
import { LiveWriteCommandSchema,DraftCommandSchema,CheckpointCommandSchema,ArtifactCommandSchema,FileResultSchema,CheckpointManifestSchema,PromoteCommandSchema,FileManifestSchema,SourceRefSchema,parseCommand,BindingSchema } from './schema.js';
import { runSchema } from '../../g1-recovery/src/contracts.js';
import { TaskCallBindingSchema } from '../../g1-model/src/schema.js';
import { LIMITS } from './arithmetic.js';
import { object,enumeration,uuid,positive,revision,timestamp,version,digest,list,tagged,nullable } from './decoder.js';
import { demand,StorageError,FoundationError,safeFailure } from './errors.js';
import type { AsyncUnitOfWork,VerifiedScope,SqlTransaction,NativeRepository } from './owners.js';
import type { EpochWitnessJournal,OwnedAnchorRoot } from './epoch-journal.js';
import type { StagingWitnessJournal } from './staging-witness.js';
import type { CryptoStore } from './crypto-store.js';

const VolumeCommandSchema=tagged('action',{'live-write':LiveWriteCommandSchema,draft:DraftCommandSchema,checkpoint:CheckpointCommandSchema,promote:PromoteCommandSchema});
export type VolumeCommand=ReturnType<typeof VolumeCommandSchema.parse>;
export const VolumeReadRefSchema=object({kind:enumeration('live-file','draft','checkpoint'),id:uuid,revision:positive});
export type VolumeReadRef=ReturnType<typeof VolumeReadRefSchema.parse>;
export interface VolumeDraftHooks extends ArtifactHooks {}
export interface VolumeSnapshot {
 bytes:Buffer;command:VolumeCommand;taskId:string;runId:string;workerGeneration:number;
 audience:{destinationSpaceId:string;recipientActorIds:readonly string[];revisionDigest:string};
 manifest:ReturnType<typeof FileManifestSchema.parse>;files:ReturnType<typeof publicEntry>[];checkpointManifest:ReturnType<typeof CheckpointManifestSchema.parse>|null;confirmedAt:string;receipt:ReturnType<typeof FileResultSchema.parse>;
}
const EntrySchema=object({id:uuid,revision:positive,artifactId:uuid,witness:digest,byteLength:revision,contentDigest:digest,expiresAt:timestamp});
const envelopeFields={schemaVersion:version,tenantId:uuid,spaceId:uuid,actorId:uuid,
 taskId:uuid,runId:uuid,workerGeneration:revision,files:list(EntrySchema,LIMITS.files)};
const OriginalEnvelopeSchema=object({schemaVersion:version,tenantId:uuid,spaceId:uuid,actorId:uuid,command:tagged('action',{'live-write':LiveWriteCommandSchema,draft:DraftCommandSchema,checkpoint:CheckpointCommandSchema}),taskId:uuid,runId:uuid,workerGeneration:revision,files:list(EntrySchema,LIMITS.files)});
const PromotionEnvelopeSchema=object({...envelopeFields,command:PromoteCommandSchema,promotion:object({draft:EntrySchema,base:EntrySchema,
 content:DraftCommandSchema,source:nullable(SourceRefSchema),native:TaskCallBindingSchema,runtime:nullable(object({id:uuid,generation:revision}))})});
type Envelope=ReturnType<typeof OriginalEnvelopeSchema.parse>|ReturnType<typeof PromotionEnvelopeSchema.parse>;
const EnvelopeSchema={parse(raw:unknown):Envelope{const c=(raw as {command?:{action?:unknown}})?.command;return c?.action==='promote'?PromotionEnvelopeSchema.parse(raw):OriginalEnvelopeSchema.parse(raw);}};
const promoted=(e:Envelope):e is ReturnType<typeof PromotionEnvelopeSchema.parse>=>'promotion' in e;
const kind=(c:VolumeCommand)=>c.action==='live-write'||c.action==='promote'?'live-file':c.action;
const hash=(bytes:Buffer)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const artifactId=(s:Pick<VerifiedScope,'tenantId'|'spaceId'|'actorId'>,key:string)=>idFor(['storage-volume-artifact-v1',s.tenantId,s.spaceId,s.actorId,key]);
const validationId=(s:VerifiedScope,key:string)=>idFor(['storage-volume-validation-v1',s.tenantId,s.spaceId,s.actorId,key]);
const publicEntry=(f:Envelope['files'][number])=>({id:f.id,revision:f.revision,artifactId:f.artifactId,witness:f.witness,byteLength:f.byteLength,contentDigest:f.contentDigest});

/** Logical content owner over the accepted encrypted artifact durability path.
 * Adapter rows/receipts and exact checkpoint links share its SINGLE COMMIT.
 * Commands, paths, bytes and descriptive inventory are inside confirmed AES files.
 * No editor-memory receipt, automatic promotion, computer admission or backup of
 * later live versions is implied. Independent current head/command/outbox controls
 * identify every volume artifact, so a missing logical index cannot select an
 * older version or silently remove a checkpoint member. */
export class VolumeDraftRepository {
 readonly artifacts:ArtifactPublicationRepository;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:NativeRepository,
  readonly crypto:CryptoStore,readonly root:OwnedAnchorRoot,readonly witness:StagingWitnessJournal,
  readonly controls:ArtifactControlsOwner,readonly validator:ArtifactValidator,readonly hooks:VolumeDraftHooks={}){
  this.root=Object.freeze({...root});
  this.artifacts=new ArtifactPublicationRepository(uow,journal,native,crypto,this.root,witness,controls,validator,{...hooks,logicalVolumeAdapter:true});
 }
 #placeholder(s:VerifiedScope,c:VolumeCommand):ArtifactCommand{return ArtifactCommandSchema.parse({schemaVersion:1,action:'artifact',sessionId:c.sessionId,
  targetId:artifactId(s,c.key),key:c.key,expectedRevision:0,expiresAt:c.expiresAt,filename:'fabric-volume-v1',bytes:'',
  sourceId:c.action==='draft'?c.sourceId:null,validationId:c.action==='promote'?c.validationId:validationId(s,c.key)});}
 #pack(e:Envelope){const raw=e.command.action==='checkpoint'?Buffer.alloc(0):Buffer.from(promoted(e)?e.promotion.content.bytes:(e.command as Exclude<VolumeCommand,{action:'checkpoint'|'promote'}>).bytes,'base64');
  const header=Buffer.from(JSON.stringify(promoted(e)?{...e,promotion:{...e.promotion,content:{...e.promotion.content,bytes:''}}}:e.command.action==='checkpoint'?e:{...e,command:{...e.command,bytes:''}})),size=Buffer.alloc(4);size.writeUInt32BE(header.length);
  try{return Buffer.concat([size,header,raw]);}finally{header.fill(0);raw.fill(0);}}
 #command(s:VerifiedScope,e:Envelope):ArtifactCommand{const bytes=this.#pack(e);try{return ArtifactCommandSchema.parse({...this.#placeholder(s,e.command),bytes:bytes.toString('base64'),sourceId:promoted(e)?e.promotion.content.sourceId:this.#placeholder(s,e.command).sourceId});}finally{bytes.fill(0);}}
 #owner(e:Envelope,hooks:ArtifactHooks=this.hooks){
  const controls:ArtifactControlsOwner={current:(tx,s)=>this.controls.current(tx,s),resolve:async(tx,s,c)=>{
   const value=await this.controls.resolve(tx,s,c);
   return {...value,retentionExpiresAt:[...e.files,...(promoted(e)?[e.promotion.draft,e.promotion.base]:[])].reduce((at,f)=>f.expiresAt<at?f.expiresAt:at,value.retentionExpiresAt)};
  }};
  return new ArtifactPublicationRepository(this.uow,this.journal,this.native,this.crypto,this.root,this.witness,controls,this.validator,{...hooks,logicalVolumeAdapter:true});
 }
 async #index(tx:SqlTransaction,s:VerifiedScope){
  // Original command/outbox/head sets are independently witnessed. Every volume
  // artifact has a deterministic opaque ID derived from its exact actor/key.
  const rows=(await tx.query(`SELECT o.actor_id AS original_actor,o.command_key AS original_key,o.target_id,v.*,a.key_id,a.generation
   FROM fabric.storage_outbox o LEFT JOIN fabric.storage_volume_versions v
   ON (v.tenant_id,v.space_id,v.artifact_id)=(o.tenant_id,o.space_id,o.target_id)
   LEFT JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(o.tenant_id,o.space_id,o.target_id)
   WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.class='artifact' ORDER BY o.job_id LIMIT 513`,[s.tenantId,s.spaceId])).rows;
  demand(rows.length<=512,'AUTHORITY_UNAVAILABLE');
  for(const r of rows)if(r['target_id']===artifactId({...s,actorId:uuid.parse(r['original_actor'])},uuid.parse(r['original_key']))){
   demand(r['artifact_id']===r['target_id'],'AUTHORITY_UNAVAILABLE');
   await this.artifacts.authority.currentAudience(tx,s,uuid.parse(r['task_id']));
   demand(r['index_witness']===await this.#indexWitness(s,r),'AUTHORITY_UNAVAILABLE');
  }
 }
 async #indexWitness(s:VerifiedScope,r:Record<string,unknown>){
  const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:r['artifact_id'],revision:1,keyId:r['key_id'],generation:r['generation']});
  const bytes=Buffer.from(JSON.stringify(['storage-volume-index-v1',binding,r['kind'],r['id'],Number(r['revision']),r['artifact_id'],r['actor_id'],r['command_key'],r['session_id'],r['task_id'],r['run_id'],Number(r['worker_generation']),Number(r['base_revision']),Number(r['checkpoint_file_count']),Number(r['epoch']),(r['confirmed_at'] as Date).toISOString(),(r['expires_at'] as Date).toISOString()]));
  try{return await this.crypto.fingerprint(binding,'command',bytes);}finally{bytes.fill(0);}
 }
 async #row(tx:SqlTransaction,s:VerifiedScope,ref:VolumeReadRef){
  const r=(await tx.query(`SELECT v.*,a.witness,a.key_id,a.generation,a.object_id,r.receipt_id FROM fabric.storage_volume_versions v
   JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(v.tenant_id,v.space_id,v.artifact_id)
   JOIN fabric.storage_artifact_receipts r ON (r.tenant_id,r.space_id,r.actor_id,r.command_key)=(v.tenant_id,v.space_id,v.actor_id,v.command_key)
   WHERE v.tenant_id=$1 AND v.space_id=$2 AND v.kind=$3 AND v.id=$4 AND v.revision=$5`,[s.tenantId,s.spaceId,ref.kind,ref.id,ref.revision])).rows[0];
  demand(r,'STALE_REVISION');return r;
 }
 #parse(bytes:Buffer){try{demand(bytes.length>=4);const length=bytes.readUInt32BE(0);demand(length<=LIMITS.commandBytes&&length+4<=bytes.length);const e=EnvelopeSchema.parse(JSON.parse(bytes.subarray(4,4+length).toString('utf8')));if(e.command.action==='checkpoint'){demand(length+4===bytes.length);return e;}if(promoted(e)){demand(e.promotion.content.bytes==='');return PromotionEnvelopeSchema.parse({...e,promotion:{...e.promotion,content:{...e.promotion.content,bytes:bytes.subarray(4+length).toString('base64')}}});}demand(e.command.bytes==='');return EnvelopeSchema.parse({...e,command:{...e.command,bytes:bytes.subarray(4+length).toString('base64')}});}catch{throw new StorageError('INTEGRITY_FAILED');}}
 #match(s:VerifiedScope,e:Envelope,r:Record<string,unknown>){const c=e.command;
  demand(e.tenantId===s.tenantId&&e.spaceId===s.spaceId&&e.actorId===r['actor_id']&&kind(c)===r['kind']&&c.targetId===r['id']
   &&c.expectedRevision+1===Number(r['revision'])&&c.key===r['command_key']&&c.sessionId===r['session_id']
   &&e.taskId===r['task_id']&&e.runId===r['run_id']&&e.workerGeneration===Number(r['worker_generation'])
   &&(c.action==='draft'?c.baseRevision:0)===Number(r['base_revision'])&&artifactId({...s,actorId:e.actorId},c.key)===r['artifact_id']
   &&(c.action==='checkpoint'||e.files.length===0),'INTEGRITY_FAILED');
 }
 async #read(tx:SqlTransaction,s:VerifiedScope,ref:VolumeReadRef,depth=0):Promise<VolumeSnapshot>{
  demand(depth<=LIMITS.depth,'INVALID_SCHEMA');
  await this.artifacts.authority.check(tx,s,'read');await this.#index(tx,s);
  const r=await this.#row(tx,s,ref),value=await this.artifacts.readWithTransaction(tx,s,{class:'artifact',id:r['artifact_id'],revision:1,witness:r['witness']});
  try{
   demand(value.manifest.filename==='fabric-volume-v1','INTEGRITY_FAILED');const e=this.#parse(value.bytes);this.#match(s,e,r);
   const audience=await this.artifacts.authority.currentAudience(tx,s,e.taskId);
   const receipt=FileResultSchema.parse({schemaVersion:1,status:e.command.action==='promote'?'artifact-committed':ref.kind==='live-file'?'live-written':ref.kind==='draft'?'draft-saved':'checkpoint-confirmed',
    receiptId:r['receipt_id'],id:ref.id,revision:ref.revision,lastSuccessfulCheckpoint:ref.kind==='checkpoint'?(r['confirmed_at'] as Date).toISOString():null,unsavedEditorWork:'not-covered'});
   let checkpointManifest:ReturnType<typeof CheckpointManifestSchema.parse>|null=null;
   if(e.command.action==='checkpoint'){
    const rows=(await tx.query('SELECT live_id,live_revision,artifact_id,witness FROM fabric.storage_checkpoint_files WHERE tenant_id=$1 AND space_id=$2 AND checkpoint_id=$3 AND checkpoint_revision=$4 ORDER BY live_id',[s.tenantId,s.spaceId,ref.id,ref.revision])).rows;
    demand(rows.length===e.files.length&&e.files.every(f=>rows.some(r=>r['live_id']===f.id&&Number(r['live_revision'])===f.revision&&r['artifact_id']===f.artifactId&&r['witness']===f.witness)),'INTEGRITY_FAILED');
    await this.#validateFiles(tx,s,e);
    const files=[];for(const f of e.files){const item=await this.#row(tx,s,{kind:'live-file',id:f.id,revision:f.revision});files.push({id:f.id,revision:f.revision,objectId:item['object_id'],byteLength:f.byteLength,contentDigest:f.contentDigest});}
    checkpointManifest=CheckpointManifestSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,id:ref.id,revision:ref.revision,generation:r['generation'],confirmedAt:(r['confirmed_at'] as Date).toISOString(),files});
   }
   if(promoted(e)){await this.#promotionRow(tx,s,e);demand(same(e.promotion.source,value.manifest.source),'INTEGRITY_FAILED');await this.#promotionCheck(tx,s,e,false,depth+1);}
   const content=promoted(e)?e.promotion.content:e.command;
   const bytes=content.action==='checkpoint'?Buffer.from(JSON.stringify(e.files.map(publicEntry))):Buffer.from(content.bytes,'base64');
   const manifest=FileManifestSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,id:ref.id,revision:ref.revision,generation:r['generation'],
    filename:content.action==='checkpoint'?'confirmed-checkpoint':content.filename,logicalPath:content.action==='checkpoint'?'confirmed-checkpoint':content.logicalPath,
    entry:{id:ref.id,revision:ref.revision,objectId:r['object_id'],byteLength:bytes.length,contentDigest:hash(bytes)},source:promoted(e)?e.promotion.source:value.manifest.source,
    base:promoted(e)?{id:e.promotion.base.id,revision:e.promotion.base.revision}:null,validationId:promoted(e)?e.command.validationId:value.manifest.validationId});
   return {bytes,manifest,command:e.command,taskId:e.taskId,runId:e.runId,workerGeneration:e.workerGeneration,
    audience:{destinationSpaceId:s.spaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest},
    files:e.files.map(publicEntry),checkpointManifest,confirmedAt:(r['confirmed_at'] as Date).toISOString(),receipt};
  }finally{value.bytes.fill(0);}
 }
 async read(s:VerifiedScope,raw:unknown){const ref=VolumeReadRefSchema.parse(raw);let snapshot:VolumeSnapshot|undefined;
  try{return await this.uow.withScope(s,async tx=>{snapshot=await this.#read(tx,s,ref);return snapshot;});}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 async #latest(tx:SqlTransaction,s:VerifiedScope,k:VolumeReadRef['kind'],id:string){
  const r=(await tx.query('SELECT max(revision) AS revision FROM fabric.storage_volume_versions WHERE tenant_id=$1 AND space_id=$2 AND kind=$3 AND id=$4',[s.tenantId,s.spaceId,k,id])).rows[0];return Number(r?.['revision']??0);
 }
 async current(s:VerifiedScope,raw:string){const id=uuid.parse(raw);let snapshot:VolumeSnapshot|undefined;
  try{return await this.uow.withScope(s,async tx=>{
   await this.artifacts.authority.check(tx,s,'read');await this.#index(tx,s);const revision=await this.#latest(tx,s,'live-file',id);demand(revision>0,'CONTENT_UNAVAILABLE');snapshot=await this.#read(tx,s,{kind:'live-file',id,revision});return snapshot;
  });}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 /** Latest accepted canonical version, independent of later editable writes.
  * Scan authenticated versions so missing canonical links cannot select an old
  * acceptance. Finite bounds and current source/retention remain fail closed. */
 async canonical(s:VerifiedScope,raw:string){const id=uuid.parse(raw);let snapshot:VolumeSnapshot|undefined;
  try{return await this.uow.withScope(s,async tx=>{
   await this.artifacts.authority.check(tx,s,'read');await this.#index(tx,s);
   const rows=(await tx.query("SELECT revision FROM fabric.storage_volume_versions WHERE tenant_id=$1 AND space_id=$2 AND kind='live-file' AND id=$3 ORDER BY revision DESC LIMIT 513",[s.tenantId,s.spaceId,id])).rows;
   demand(rows.length<=512,'AUTHORITY_UNAVAILABLE');
   for(const r of rows){const value=await this.#read(tx,s,{kind:'live-file',id,revision:Number(r['revision'])});if(value.command.action==='promote'){snapshot=value;return value;}value.bytes.fill(0);}
   throw new StorageError('CONTENT_UNAVAILABLE');
  });}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 async #fresh(tx:SqlTransaction,s:VerifiedScope,c:VolumeCommand){
  await this.artifacts.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});await this.#index(tx,s);
  demand(await this.#latest(tx,s,kind(c),c.targetId)===c.expectedRevision,'STALE_REVISION');
 }
 async #validateFiles(tx:SqlTransaction,s:VerifiedScope,e:Envelope){
  let total=0;
  for(const f of e.files){
   const value=await this.#read(tx,s,{kind:'live-file',id:f.id,revision:f.revision});
   try{const row=await this.#row(tx,s,{kind:'live-file',id:f.id,revision:f.revision});
    demand(row['artifact_id']===f.artifactId&&row['witness']===f.witness&&value.bytes.length===f.byteLength&&hash(value.bytes)===f.contentDigest
     &&(row['expires_at'] as Date).toISOString()===f.expiresAt,'INTEGRITY_FAILED');total+=value.bytes.length;demand(total<=LIMITS.backupBytes,'INVALID_SCHEMA');
   }finally{value.bytes.fill(0);}
  }
 }
 async #runtime(tx:SqlTransaction,s:VerifiedScope,b:ReturnType<typeof TaskCallBindingSchema.parse>){
  const recovery=(await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE',[s.tenantId,s.spaceId,b.runId])).rows[0];
  demand(b.workerGeneration===0||recovery,'AUTHORITY_UNAVAILABLE');
  if(recovery){const r=runSchema.parse(recovery['record']);demand(r.binding.runId===b.runId&&r.binding.task.taskId===b.taskId&&r.binding.task.tenantId===s.tenantId&&r.binding.task.spaceId===s.spaceId&&r.binding.requirementsRevision===b.requirementsRevision
   &&r.generation.worker===b.workerGeneration&&r.generation.cancellation===b.cancellationGeneration&&r.generation.resource===b.resourceGeneration&&!['succeeded','partial','failed','cancelled','cancelling'].includes(r.state),'STALE_FENCE');}
  const rows=(await tx.query('SELECT r.resource_id,c.record FROM fabric.recovery_run_resources r JOIN fabric.recovery_resource_controls c USING(tenant_id,space_id,resource_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.run_id=$3 FOR SHARE OF c',[s.tenantId,s.spaceId,b.runId])).rows;
  demand(rows.length<=1,'STALE_FENCE');if(!rows.length){demand(b.resourceGeneration===0,'STALE_FENCE');return null;}
  const record=rows[0]!['record'] as {generation?:unknown;mode?:unknown};demand(record.mode==='agent'&&record.generation===b.resourceGeneration,'STALE_FENCE');return {id:uuid.parse(rows[0]!['resource_id']),generation:revision.parse(record.generation)};
 }
 async #promotionRow(tx:SqlTransaction,s:VerifiedScope,e:ReturnType<typeof PromotionEnvelopeSchema.parse>){
  const c=e.command,p=e.promotion,r=(await tx.query('SELECT * FROM fabric.storage_volume_promotions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,c.targetId,c.expectedRevision+1])).rows[0];
  demand(r&&r['kind']==='live-file'&&r['artifact_id']===artifactId({...s,actorId:e.actorId},c.key)&&r['actor_id']===e.actorId&&r['command_key']===c.key
   &&Number(r['base_revision'])===c.expectedRevision&&r['draft_id']===c.draftId&&Number(r['draft_revision'])===c.draftRevision
   &&r['draft_kind']==='draft'&&r['draft_artifact_id']===p.draft.artifactId&&r['validation_id']===c.validationId,'INTEGRITY_FAILED');
 }
 async #promotionCheck(tx:SqlTransaction,s:VerifiedScope,e:ReturnType<typeof PromotionEnvelopeSchema.parse>,writing:boolean,depth=0){
  const c=e.command,p=e.promotion;
  demand(p.draft.id===c.draftId&&p.draft.revision===c.draftRevision&&p.base.id===c.targetId&&p.base.revision===c.expectedRevision&&p.content.baseRevision===c.expectedRevision,'INTEGRITY_FAILED');
  if(writing){const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);demand(same(n.binding,p.native)&&same(await this.#runtime(tx,s,n.binding),p.runtime),'STALE_FENCE');}
  for(const [ref,entry] of [[{kind:'draft' as const,id:c.draftId,revision:c.draftRevision},p.draft],[{kind:'live-file' as const,id:c.targetId,revision:c.expectedRevision},p.base]] as const){
   const v=await this.#read(tx,s,ref,depth);try{const r=await this.#row(tx,s,ref);demand(r['artifact_id']===entry.artifactId&&r['witness']===entry.witness&&v.bytes.length===entry.byteLength&&hash(v.bytes)===entry.contentDigest&&(r['expires_at'] as Date).toISOString()===entry.expiresAt,'INTEGRITY_FAILED');
    if(ref.kind==='draft')demand(same(v.command,p.content)&&same(v.manifest.source,p.source),'INTEGRITY_FAILED');else demand(v.manifest.logicalPath===p.content.logicalPath,'SCOPE_MISMATCH');
   }finally{v.bytes.fill(0);}
  }
 }
 /** Prepublication reads hold the exact original-file locks until COMMIT.
  * The head owner now has an independently reserved previous/next epoch, so
  * public content reads must stay blocked. This callback only rechecks those
  * authenticated inputs inside that same publisher UoW; it grants no read and
  * never treats pending authority as current. Head verifies the exact forecast
  * control digest plus installed current identity/native after this callback. */
 async #promotionPostCheck(tx:SqlTransaction,s:VerifiedScope,e:ReturnType<typeof PromotionEnvelopeSchema.parse>){
  const n=await this.native.load(tx,s,e.command.sessionId);await this.native.fresh(tx,s,n);
  demand(same(n.binding,e.promotion.native)&&same(await this.#runtime(tx,s,n.binding),e.promotion.runtime),'STALE_FENCE');
  for(const [ref,entry] of [[{kind:'draft' as const,id:e.command.draftId,revision:e.command.draftRevision},e.promotion.draft],[{kind:'live-file' as const,id:e.command.targetId,revision:e.command.expectedRevision},e.promotion.base]] as const){
   const row=await this.#row(tx,s,ref);demand(row['artifact_id']===entry.artifactId&&row['witness']===entry.witness&&row['index_witness']===await this.#indexWitness(s,row)&&(row['expires_at'] as Date).toISOString()===entry.expiresAt,'INTEGRITY_FAILED');
   await this.artifacts.authority.currentAudience(tx,s,uuid.parse(row['task_id']));
   const live=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class='artifact' AND id=$3 AND revision=1 AND witness=$4 AND expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND class='artifact' AND id=$3 AND revision>=1) AS live`,[s.tenantId,s.spaceId,entry.artifactId,entry.witness])).rows[0];demand(live?.['live']===true,'RETENTION_RESTRICTED');
  }
 }
 async #envelope(s:VerifiedScope,c:VolumeCommand):Promise<Envelope>{return this.uow.withScope(s,async tx=>{
  await this.#fresh(tx,s,c);const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);const files:Envelope['files'][number][]=[];
  if(c.action==='checkpoint')for(const id of c.liveIds){
   const rev=await this.#latest(tx,s,'live-file',id);demand(rev>0,'CONTENT_UNAVAILABLE');const value=await this.#read(tx,s,{kind:'live-file',id,revision:rev});
   try{const row=await this.#row(tx,s,{kind:'live-file',id,revision:rev});files.push(EntrySchema.parse({id,revision:rev,artifactId:row['artifact_id'],witness:row['witness'],byteLength:value.bytes.length,contentDigest:hash(value.bytes),expiresAt:(row['expires_at'] as Date).toISOString()}));}finally{value.bytes.fill(0);}
  }
  if(c.action==='promote'){
   const draft=await this.#read(tx,s,{kind:'draft',id:c.draftId,revision:c.draftRevision});let base:VolumeSnapshot|undefined;
   try{base=await this.#read(tx,s,{kind:'live-file',id:c.targetId,revision:c.expectedRevision});demand(draft.command.action==='draft'&&draft.command.baseRevision===c.expectedRevision&&draft.manifest.logicalPath===base.manifest.logicalPath,'STALE_REVISION');
    const entry=async(ref:VolumeReadRef,v:VolumeSnapshot)=>{const r=await this.#row(tx,s,ref);return EntrySchema.parse({id:ref.id,revision:ref.revision,artifactId:r['artifact_id'],witness:r['witness'],byteLength:v.bytes.length,contentDigest:hash(v.bytes),expiresAt:(r['expires_at'] as Date).toISOString()});};
    return PromotionEnvelopeSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,actorId:s.actorId,command:c,taskId:n.binding.taskId,runId:n.binding.runId,workerGeneration:n.binding.workerGeneration,files:[],
     promotion:{content:draft.command,source:draft.manifest.source,draft:await entry({kind:'draft',id:c.draftId,revision:c.draftRevision},draft),base:await entry({kind:'live-file',id:c.targetId,revision:c.expectedRevision},base),native:n.binding,runtime:await this.#runtime(tx,s,n.binding)}});
   }finally{draft.bytes.fill(0);base?.bytes.fill(0);}
  }
  const e=EnvelopeSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,actorId:s.actorId,command:c,taskId:n.binding.taskId,runId:n.binding.runId,workerGeneration:n.binding.workerGeneration,files});
  await this.#validateFiles(tx,s,e);await this.#fresh(tx,s,c);return e;
 });}
 async #original(s:VerifiedScope,c:VolumeCommand):Promise<Envelope|undefined>{
  const pending=await this.uow.withScope(s,async tx=>{
   const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);
   return (await tx.query('SELECT 1 FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows.length>0;
  });
  if(!pending)return undefined;
  const value=await this.artifacts.inspectOriginalForRecovery(s,this.#placeholder(s,c));
  try{const e=this.#parse(value.bytes);demand(e.tenantId===s.tenantId&&e.spaceId===s.spaceId&&e.actorId===s.actorId&&same(e.command,c),'IDEMPOTENCY_CONFLICT');return e;}finally{value.bytes.fill(0);}
 }
 async prepare(s:VerifiedScope,raw:unknown){
  const c=parseCommand(VolumeCommandSchema,raw),e=await this.#original(s,c)??await this.#envelope(s,c);
  const owner=this.#owner(e,{...this.hooks});return owner.prepare(s,this.#command(s,e));
 }
 async #receipt(s:VerifiedScope,c:VolumeCommand){return this.uow.withScope(s,async tx=>{
  const value=await this.#read(tx,s,{kind:kind(c),id:c.targetId,revision:c.expectedRevision+1});try{demand(same(value.command,c),'IDEMPOTENCY_CONFLICT');return value.receipt;}finally{value.bytes.fill(0);}
 });}
 async commit(s:VerifiedScope,raw:unknown){let c:VolumeCommand|undefined,committed=false;
  try{const commitStarted=performance.now();c=parseCommand(VolumeCommandSchema,raw);const e=await this.#original(s,c);demand(e,'ARTIFACT_NOT_COMMITTED');const originalReturned=performance.now();let volumeSqlMs:number|undefined;
   const captured=c;
   const owner=this.#owner(e,{...this.hooks,beforeArtifactPublication:async(tx,scope)=>{
    await this.#fresh(tx,scope,captured);await this.#validateFiles(tx,scope,e);if(promoted(e))await this.#promotionCheck(tx,scope,e,true);
    const n=await this.native.load(tx,scope,captured.sessionId);await this.native.fresh(tx,scope,n);
    demand(n.binding.taskId===e.taskId&&n.binding.runId===e.runId&&n.binding.workerGeneration===e.workerGeneration,'STALE_FENCE');
    const control=await this.controls.resolve(tx,scope,this.#command(scope,e));
    const policy=(await tx.query('SELECT periods FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0]?.['periods'] as Record<string,number>|undefined;
    const live=(await tx.query('SELECT extract(epoch FROM ($1::timestamptz-clock_timestamp()))*1000 AS ms',[control.retentionExpiresAt])).rows[0];
    demand(policy&&Number(live?.['ms'])<=Number(policy[kind(captured)])*1000,'RETENTION_RESTRICTED');
    await this.hooks.beforeArtifactPublication?.(tx,scope);
   },afterArtifactWrite:async tx=>{
    const row=(await tx.query('SELECT * FROM fabric.storage_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,captured.key])).rows[0];demand(row,'INTEGRITY_FAILED');
    const mac=await this.#indexWitness(s,{...row,artifact_id:row['id'],kind:kind(captured),id:captured.targetId,revision:captured.expectedRevision+1,session_id:captured.sessionId,task_id:e.taskId,run_id:e.runId,worker_generation:e.workerGeneration,base_revision:captured.action==='draft'?captured.baseRevision:0,checkpoint_file_count:e.files.length,confirmed_at:row['accepted_at']});
    const volumeSqlStarted=performance.now();
    await tx.query('SELECT fabric.storage_commit_volume($1,$2,$3,$4,$5,$6::jsonb,$7)',[captured.key,kind(captured),captured.targetId,captured.expectedRevision,captured.action==='draft'?captured.baseRevision:0,JSON.stringify(e.files.map(publicEntry)),mac]);
    volumeSqlMs=performance.now()-volumeSqlStarted;
    if(promoted(e))await tx.query('SELECT fabric.storage_commit_promotion($1,$2,$3,$4,$5)',[captured.key,e.command.draftId,e.command.draftRevision,captured.expectedRevision,e.command.validationId]);
    await this.hooks.afterArtifactWrite?.(tx);if(promoted(e)){await this.#promotionRow(tx,s,e);await this.#promotionPostCheck(tx,s,e);}
   }});
   const r=await owner.commit(s,this.#command(s,e));const ownerReturned=performance.now();
   if(r.status==='artifact-committed'){committed=true;const receipt=await this.#receipt(s,c);
    // Direct cost diagnosis of the real publication and receipt paths. The SQL
    // sample is nested in ownerCommitMs; these durations must not be summed.
    console.log(JSON.stringify({measurement:'volume-commit-phase-times',clock:'child-monotonic',action:c.action,originalMs:originalReturned-commitStarted,ownerCommitMs:ownerReturned-originalReturned,receiptMs:performance.now()-ownerReturned,volumeSqlMs,nestedSqlSample:true}));
    return receipt;}
   return r;
  }catch(error){const failure=safeFailure(error);return c&&(committed||failure.status==='unknown'||(error instanceof DatabaseError&&['55P03','57014'].includes(error.code??'')))?{schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const}:failure;}
 }
 async lookup(s:VerifiedScope,raw:unknown){
  const c=parseCommand(VolumeCommandSchema,raw);
  try{const e=await this.#original(s,c);
   if(!e)return this.artifacts.lookup(s,this.#placeholder(s,c));
   const r=await this.#owner(e).lookup(s,this.#command(s,e));
   return r.status==='artifact-committed'?this.#receipt(s,c):r;
  }catch(error){if((error instanceof FoundationError&&error.code==='UNKNOWN_COMMIT')||(error instanceof DatabaseError&&['55P03','57014'].includes(error.code??'')))return {schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const};throw error;}
 }
 async #execute(s:VerifiedScope,c:VolumeCommand){
  try{
   const original=await this.#original(s,c);
   if(original){const r=await this.lookup(s,c);if(r.status!=='absent-safe')return r;
    // Explicit retry of a known, prepared original is permitted only without an
    // unresolved publication. Lookup's absence itself never prepares/replays.
    return safeFailure(new StorageError('ARTIFACT_NOT_COMMITTED'));
   }
   const prepareStarted=performance.now();await this.prepare(s,c);const prepareReturned=performance.now();const result=await this.commit(s,c);
   console.log(JSON.stringify({measurement:'volume-execute-phase-times',clock:'child-monotonic',action:c.action,prepareMs:prepareReturned-prepareStarted,commitMs:performance.now()-prepareReturned}));return result;
  }catch(error){const failure=safeFailure(error);return failure.status==='unknown'||(error instanceof DatabaseError&&['55P03','57014'].includes(error.code??''))?{schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const}:failure;}
 }
 async writeLive(s:VerifiedScope,raw:unknown){try{return await this.#execute(s,parseCommand(LiveWriteCommandSchema,raw));}catch(e){return safeFailure(e);}}
 async saveDraft(s:VerifiedScope,raw:unknown){try{return await this.#execute(s,parseCommand(DraftCommandSchema,raw));}catch(e){return safeFailure(e);}}
 async confirmCheckpoint(s:VerifiedScope,raw:unknown){try{return await this.#execute(s,parseCommand(CheckpointCommandSchema,raw));}catch(e){return safeFailure(e);}}
 async promote(s:VerifiedScope,raw:unknown){try{return await this.#execute(s,parseCommand(PromoteCommandSchema,raw));}catch(e){return safeFailure(e);}}
 async compare(s:VerifiedScope,raw:unknown){const request=object({draft:VolumeReadRefSchema,liveId:uuid}).parse(raw);demand(request.draft.kind==='draft');
  const snapshots:{draft?:VolumeSnapshot;current:VolumeSnapshot|null}={current:null};
  try{return await this.uow.withScope(s,async tx=>{
   const draft=await this.#read(tx,s,request.draft);snapshots.draft=draft;demand(draft.command.action==='draft','INTEGRITY_FAILED');
   const currentRevision=await this.#latest(tx,s,'live-file',request.liveId);let current:VolumeSnapshot|null=null;
   if(currentRevision){current=await this.#read(tx,s,{kind:'live-file',id:request.liveId,revision:currentRevision});snapshots.current=current;demand(current.manifest.logicalPath===draft.command.logicalPath,'SCOPE_MISMATCH');}
   return {stale:draft.command.baseRevision!==currentRevision,baseRevision:draft.command.baseRevision,currentRevision,sameBytes:current!==null&&draft.bytes.equals(current.bytes),draft,current};
  });}catch(e){snapshots.draft?.bytes.fill(0);snapshots.current?.bytes.fill(0);throw e;}
 }
 async retainVariant(s:VerifiedScope,raw:unknown){const request=object({command:DraftCommandSchema,prior:VolumeReadRefSchema}).parse(raw);demand(request.prior.kind==='draft');
  const prior=await this.read(s,request.prior);
  try{const c=request.command;demand(prior.command.action==='draft'&&c.targetId!==request.prior.id&&c.expectedRevision===0
   &&c.bytes===prior.command.bytes&&c.filename===prior.command.filename&&c.logicalPath===prior.command.logicalPath&&c.sourceId===prior.command.sourceId&&c.baseRevision===prior.command.baseRevision,'CHECK_BINDING_MISMATCH');return await this.saveDraft(s,c);}finally{prior.bytes.fill(0);}
 }
 /** Validate the whole independently witnessed logical index before capture
  * selection, including versions deliberately excluded after checkpoint C1. */
 async assertCaptureInventory(tx:SqlTransaction,s:VerifiedScope):Promise<void>{
  await this.artifacts.authority.check(tx,s,'read');await this.#index(tx,s);
 }
 /** Borrowed authenticated transaction for the installed backup capture owner.
  * Uses the SAME index-MAC, exact encrypted logical mapping, checkpoint member
  * and content/audience assertions as ordinary reads. No nested UoW or receipt. */
 async readWithTransaction(tx:SqlTransaction,s:VerifiedScope,raw:unknown):Promise<VolumeSnapshot>{
  return this.#read(tx,s,VolumeReadRefSchema.parse(raw));
 }
 async checkpointInventory(s:VerifiedScope,raw:unknown){const ref=VolumeReadRefSchema.parse(raw);demand(ref.kind==='checkpoint');return this.uow.withScope(s,async tx=>{
  const value=await this.#read(tx,s,ref);
  try{demand(value.checkpointManifest,'INTEGRITY_FAILED');return {manifest:value.checkpointManifest,confirmedAt:value.confirmedAt,files:value.files,unsavedEditorWork:'not-covered' as const};
  }finally{value.bytes.fill(0);}
 });}
}
