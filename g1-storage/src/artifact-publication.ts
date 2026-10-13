import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import { ArtifactCommandSchema,BindingSchema,FileManifestSchema,FileResultSchema,SourceRefSchema,parseCommand } from './schema.js';
import { object,uuid,timestamp,literal,positive,digest } from './decoder.js';
import { demand,StorageError,FoundationError,safeFailure } from './errors.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { revalidateScope,type AsyncUnitOfWork,type SqlTransaction,type VerifiedScope,type NativeRepository } from './owners.js';
import { StorageAuthorityRepository,EpochAnchorSchema,controlDigest } from './authority.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from './epoch-journal.js';
import { StagingWitnessJournal } from './staging-witness.js';
import { AuthenticatedStagingPreparation,stagedHeadWitness,type StagingMaterial } from './staging-preparation.js';
import { OwnedCipherFiles,FileConfirmationSchema,type StagingControl,type CipherFileHooks } from './owned-cipher-files.js';
import { HeadPublicationRepository,type HeadPublicationPrerequisite,type HeadWorkOverride } from './head-publication.js';
import { HeadMaterialSchema,type HeadMaterial } from './head-material.js';
import type { EpochPublicationHooks } from './epoch-publication.js';
import { CryptoStore } from './crypto-store.js';
import { openSourcePayload,sourceContentWitness } from './source-content.js';
import { CipherEnvelopeSchema } from './schema.js';

export type ArtifactCommand=ReturnType<typeof ArtifactCommandSchema.parse>;
export const ArtifactReadRefSchema=object({class:literal('artifact'),id:uuid,revision:positive,witness:digest});
const CurrentRootSchema=object({rootId:uuid,keyId:uuid,generation:uuid});
const ControlsSchema=object({rootId:uuid,keyId:uuid,generation:uuid,retentionExpiresAt:timestamp});
/** Installed finite storage/key controls; never caller/archive authority. The
 * resolver must return the current generation and the same original expiry on
 * recreation. A changed key/root/generation/expiry refuses existing preparation. */
export interface ArtifactControlsOwner {
 current(tx:SqlTransaction,scope:VerifiedScope):Promise<ReturnType<typeof CurrentRootSchema.parse>>;
 resolve(tx:SqlTransaction,scope:VerifiedScope,command:ArtifactCommand):Promise<ReturnType<typeof ControlsSchema.parse>>;
}
/** Independent installed validator. ID in caller JSON is only a lookup request.
 * Must verify exact scoped command fingerprint/AAD/current authority and finite
 * validation expiry, before and after waits. No product CheckReceipt is minted. */
export interface ArtifactValidator {
 require(tx:SqlTransaction,scope:VerifiedScope,request:{validationId:string;commandFingerprint:string;binding:ReturnType<typeof BindingSchema.parse>}):Promise<void>;
}
export interface ArtifactHooks extends EpochPublicationHooks {
 /** Installed logical adapter only; reserves its opaque target-ID namespace. */
 logicalVolumeAdapter?:true;
 files?:CipherFileHooks;
 afterArtifactWrite?(tx:SqlTransaction):Promise<void>;
 beforeReadRelease?(tx:SqlTransaction):Promise<void>;
 /** Installed adapter validation, before the head/epoch effect in the same UoW. */
 beforeArtifactPublication?(tx:SqlTransaction,scope:VerifiedScope):Promise<void>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const hash=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const stableId=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
type BoundArtifact={controls:ReturnType<typeof ControlsSchema.parse>;binding:ReturnType<typeof BindingSchema.parse>;fingerprint:string;staging:StagingMaterial;materialId:string;manifestId:string};
type ArtifactSource={row:Record<string,unknown>;ref:ReturnType<typeof SourceRefSchema.parse>}|null;
class ArtifactHead extends HeadPublicationRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:NativeRepository,materials:ConstructorParameters<typeof HeadPublicationRepository>[3],hooks:EpochPublicationHooks,prerequisite:HeadPublicationPrerequisite,readonly fingerprint:string){super(uow,journal,native,materials,hooks,prerequisite);}
 protected override commandBinding(c:Parameters<HeadPublicationPrerequisite['prepare']>[2]){
  return hash(Buffer.from(JSON.stringify({command:c,contentBinding:this.fingerprint})));
 }
 protected override async inspectOriginal(tx:SqlTransaction,s:VerifiedScope,row:Record<string,unknown>){
  await super.inspectOriginal(tx,s,row);
  const original=(await tx.query(`SELECT r.binding_digest,r.id,r.revision,v.witness,v.object_digest,v.manifest_digest,v.object_size,v.manifest_size
   FROM fabric.storage_artifact_receipts r JOIN fabric.storage_artifact_versions v
   ON (v.tenant_id,v.space_id,v.actor_id,v.command_key,v.id,v.revision,v.epoch,v.accepted_at)=(r.tenant_id,r.space_id,r.actor_id,r.command_key,r.id,r.revision,r.epoch,r.at)
   WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4`,[s.tenantId,s.spaceId,s.actorId,row['command_key']])).rows[0];
  demand(original&&original['binding_digest']===row['binding_digest'],'AUTHORITY_UNAVAILABLE');
  demand(original['witness']===stagedHeadWitness(FileConfirmationSchema.parse({schemaVersion:1,objectDigest:original['object_digest'],manifestDigest:original['manifest_digest'],objectSize:Number(original['object_size']),manifestSize:Number(original['manifest_size'])})),'AUTHORITY_UNAVAILABLE');
 }
}
/** Byte-first immutable artifact owner. prepare() is private persistence, never
 * serving; commit() writes head+version+receipt+event+outbox in ONE authenticated
 * UoW after exact confirmed bytes/manifest and current validator/native/source
 * checks. Filesystem and PG are not a distributed transaction. Unknown/pending
 * originals protect files; recovery is explicit and never replays an operation. */
export class ArtifactPublicationRepository {
 readonly authority:StorageAuthorityRepository;
 readonly root:OwnedAnchorRoot;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:NativeRepository,
  readonly crypto:CryptoStore,root:OwnedAnchorRoot,readonly witness:StagingWitnessJournal,
  readonly controls:ArtifactControlsOwner,readonly validator:ArtifactValidator,readonly hooks:ArtifactHooks={}){
  this.root=Object.freeze({...root});this.authority=new StorageAuthorityRepository(journal,native);
 }
 #ids(s:VerifiedScope,c:ArtifactCommand){return {materialId:stableId(['storage-artifact-material-v1',s.tenantId,s.spaceId,s.actorId,c.key]),
  manifestId:stableId(['storage-artifact-manifest-v1',s.tenantId,s.spaceId,s.actorId,c.key])};}
 async #bound(tx:SqlTransaction,s:VerifiedScope,c:ArtifactCommand):Promise<BoundArtifact>{
  await currentScope(tx,s);await revalidateScope(s);
  if(c.targetId===stableId(['storage-volume-artifact-v1',s.tenantId,s.spaceId,s.actorId,c.key]))demand(this.hooks.logicalVolumeAdapter===true,'UNAUTHORIZED');
  demand(['storage:write','storage:maintenance','task:write'].every(g=>s.grants.includes(g)),'UNAUTHORIZED');
  const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);
  demand(n.binding.intent==='Ask'&&n.binding.purpose==='maintenance'&&n.admission.executionClass==='service'
   &&n.admission.resourceId===null&&n.admission.computerCapability===null&&!n.admission.targetEffect&&!n.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  await this.authority.currentAudience(tx,s,n.binding.taskId);
  const controls=ControlsSchema.parse(await this.controls.resolve(tx,s,c));demand(controls.rootId===this.root.rootId,'SCOPE_MISMATCH');
  const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:c.targetId,revision:1,generation:controls.generation,keyId:controls.keyId});
  const bytes=Buffer.from(JSON.stringify(c));let fingerprint:string;
  try{fingerprint=await this.crypto.fingerprint(binding,'command',bytes);}finally{bytes.fill(0);}
  const staging:StagingMaterial={binding,rootId:controls.rootId,commandKey:c.key,sessionId:c.sessionId,sourceTaskId:n.binding.taskId,expiresAt:c.expiresAt};
  return {controls,binding,fingerprint,staging,...this.#ids(s,c)};
 }
 async #installedStaging(tx:SqlTransaction,s:VerifiedScope,c:ArtifactCommand):Promise<StagingMaterial>{
  const controls=ControlsSchema.parse(await this.controls.resolve(tx,s,c));demand(controls.rootId===this.root.rootId,'SCOPE_MISMATCH');
  const n=await this.native.load(tx,s,c.sessionId);
  return {binding:BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:c.targetId,revision:1,generation:controls.generation,keyId:controls.keyId}),
   rootId:controls.rootId,commandKey:c.key,sessionId:c.sessionId,sourceTaskId:n.binding.taskId,expiresAt:c.expiresAt};
 }
 #staging(s:VerifiedScope,c:ArtifactCommand){
  return new AuthenticatedStagingPreparation(this.uow,this.authority,s,{resolve:(tx,scope)=>this.#installedStaging(tx,scope,c)},this.#ids(s,c).materialId,this.witness,
   {publicationBinding:async(tx,scope,command)=>{
    const m=await this.#installedStaging(tx,scope,c),bytes=Buffer.from(JSON.stringify(c));
    try{return hash(Buffer.from(JSON.stringify({command,contentBinding:await this.crypto.fingerprint(m.binding,'command',bytes)})));}finally{bytes.fill(0);}
   }});
 }
 async #source(tx:SqlTransaction,s:VerifiedScope,c:ArtifactCommand,anchored=true):Promise<ArtifactSource>{
  if(c.sourceId===null)return null;
  const row=(await tx.query(`SELECT x.* FROM fabric.storage_sources x WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3
   ORDER BY revision DESC LIMIT 1`,[s.tenantId,s.spaceId,c.sourceId])).rows[0];demand(row,'CONTENT_UNAVAILABLE');
  const ref={class:'source',id:c.sourceId,revision:Number(row['revision']),witness:row['witness']};
  if(anchored)await this.authority.entity(tx,s,ref);
  const live=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class='source' AND id=$3 AND revision=$4 AND witness=$5 AND expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND source_revision=$4)
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND class='source' AND id=$3 AND revision>=$4) AS live`,[s.tenantId,s.spaceId,c.sourceId,ref.revision,ref.witness])).rows[0];
  demand(live?.['live']===true,'RETENTION_RESTRICTED');
  const audience=await this.authority.currentAudience(tx,s,uuid.parse(row['source_task_id']));
  const e=CipherEnvelopeSchema.parse(JSON.parse(String(row['cipher_text'])));
  demand(sourceContentWitness(e)===ref.witness&&e.keyId===row['key_id']&&e.generation===row['generation'],'INTEGRITY_FAILED');
  const p=await openSourcePayload(this.crypto,e);demand(p.assertedBy===row['actor_id'],'INTEGRITY_FAILED');
  return {row,ref:{tenantId:s.tenantId,spaceId:s.spaceId,sourceId:c.sourceId,sourceTaskId:uuid.parse(row['source_task_id']),revision:ref.revision,digest:p.contentDigest,
   audience:{destinationSpaceId:s.spaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest}}};
 }
 async #manifest(tx:SqlTransaction,s:VerifiedScope,c:ArtifactCommand,b:BoundArtifact,anchored=true){
  const source=await this.#source(tx,s,c,anchored);
  demand(!source||b.controls.retentionExpiresAt<=(source.row['expires_at'] as Date).toISOString(),'RETENTION_RESTRICTED');
  await this.validator.require(tx,s,{validationId:c.validationId,commandFingerprint:b.fingerprint,binding:b.binding});
  const bytes=Buffer.from(c.bytes,'base64');
  try{return {source,manifest:FileManifestSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,id:c.targetId,revision:1,generation:b.binding.generation,
   filename:c.filename,logicalPath:c.filename,entry:{id:c.targetId,revision:1,objectId:b.materialId,byteLength:bytes.length,contentDigest:hash(bytes)},source:source?.ref??null,base:null,validationId:c.validationId})};}finally{bytes.fill(0);}
 }
 async prepare(s:VerifiedScope,raw:unknown){
  const c=parseCommand(ArtifactCommandSchema,raw);
  const prepared=await this.uow.withScope(s,async tx=>{
   await this.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
   const b=await this.#bound(tx,s,c),m=await this.#manifest(tx,s,c,b);
   return {b,m};
  });
  const bytes=Buffer.from(c.bytes,'base64');
  try{return {uploadId:await new OwnedCipherFiles(this.root,this.crypto,this.#staging(s,c),this.hooks.files).stage(prepared.b.binding,bytes,JSON.stringify(prepared.m.manifest)),replayAllowed:false as const};}
  finally{bytes.fill(0);}
 }
 async #publisher(s:VerifiedScope,c:ArtifactCommand,onCommit:()=>void=()=>{}){
  const b=await this.uow.withScope(s,tx=>this.#bound(tx,s,c)),staging=this.#staging(s,c);
  const command={key:c.key,sessionId:c.sessionId,expiresAt:c.expiresAt,materialId:b.materialId,expected:null};
  let material:HeadMaterial|undefined,description:ReturnType<typeof FileManifestSchema.parse>|undefined,uploadId:string|undefined,source:ArtifactSource|undefined,work:HeadWorkOverride|undefined;
  const event=stableId(['artifact-event',s.tenantId,s.spaceId,s.actorId,c.key]),mutation=stableId(['artifact-mutation',s.tenantId,s.spaceId,s.actorId,c.key]);
  const validate=async(tx:SqlTransaction,scope:VerifiedScope,anchored:boolean)=>{
   const fresh=await this.#bound(tx,scope,c);demand(same(fresh,b),'CHECK_BINDING_MISMATCH');
   const current=await this.#manifest(tx,scope,c,b,anchored);
   demand(same(current.manifest,description)&&same(current.source,source),'CHECK_BINDING_MISMATCH');
  };
  const prerequisite:HeadPublicationPrerequisite={prepare:async(tx,scope,hc,head)=>{
   demand(same(head,material)&&uploadId&&description,'INTEGRITY_FAILED');await validate(tx,scope,true);
   const confirm=await staging.headPrerequisite(this.root,this.crypto).prepare(tx,scope,hc,head);
   await this.hooks.beforeArtifactPublication?.(tx,scope);
   return async()=>{
    await validate(tx,scope,false);demand(uploadId&&work,'INTEGRITY_FAILED');
    await tx.query('SELECT fabric.storage_commit_artifact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[c.key,uploadId,b.materialId,b.manifestId,c.sourceId,source?.ref.revision??null,source?.row['witness']??null,work.receiptId,work.jobId,event,mutation]);
    await this.hooks.afterArtifactWrite?.(tx);await confirm();await validate(tx,scope,false);
    const row=(await tx.query('SELECT witness,upload_id FROM fabric.storage_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=1',[scope.tenantId,scope.spaceId,c.targetId])).rows[0];
    demand(row?.['witness']===head.witness&&row['upload_id']===uploadId,'INTEGRITY_FAILED');
   };
  },forecastWork:async(_tx,scope,_c,h,epoch,at)=>{
   work={actorId:scope.actorId,key:c.key,binding:hash(Buffer.from(JSON.stringify({command,contentBinding:b.fingerprint}))),receiptId:stableId(['artifact-receipt',scope.tenantId,scope.spaceId,scope.actorId,c.key]),jobId:stableId(['artifact-job',scope.tenantId,scope.spaceId,scope.actorId,c.key]),entity:{class:h.class,id:h.id,revision:h.revision},epoch,at};return work;
  }};
  const publisher=new ArtifactHead(this.uow,this.journal,this.native,{resolve:async(tx,scope,id)=>{
   demand(id===b.materialId,'CHECK_BINDING_MISMATCH');demand(same(await this.#bound(tx,scope,c),b),'CHECK_BINDING_MISMATCH');
   const m=await this.#manifest(tx,scope,c,b);source=m.source;description=m.manifest;
   // Borrow exact authenticated staging lock in THIS head transaction.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-staging-original',scope.tenantId,scope.spaceId,scope.actorId,c.key])]);
   const r=(await tx.query('SELECT r.upload_id,c.* FROM fabric.storage_staging_reservations r JOIN fabric.storage_staging_confirmations c USING(tenant_id,space_id,upload_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.key])).rows[0];demand(r,'ARTIFACT_NOT_COMMITTED');uploadId=uuid.parse(r['upload_id']);
   const confirmation=FileConfirmationSchema.parse({schemaVersion:1,objectDigest:r['object_digest'],manifestDigest:r['manifest_digest'],objectSize:Number(r['object_size']),manifestSize:Number(r['manifest_size'])});
   const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
   // Original staging prerequisite independently verifies its journal, material,
   // reservation/lease/currentness/confirmation before and after publication.
   const control:StagingControl={reserve:unsupported,lock:async(_id,work)=>{
    demand(_id===uploadId,'SCOPE_MISMATCH');
    const current=async()=>{const q=(await tx.query('SELECT floor(extract(epoch from clock_timestamp())*1000)::text AS at,floor(extract(epoch from lease_until)*1000)::text AS lease FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND upload_id=$3',[scope.tenantId,scope.spaceId,uploadId])).rows[0];demand(q,'AUTHORITY_UNAVAILABLE');return {uploadId:uploadId!,rootId:b.controls.rootId,binding:b.binding,observedAt:Number(q['at']),leaseUntil:Number(q['lease']),pending:true,unknown:false,reachable:false,confirmation};};
    return work({current,confirm:unsupported,publish:unsupported});
   }};
   const snapshot=await new OwnedCipherFiles(this.root,this.crypto,control).inspectPrepared(uploadId,b.binding),expected=Buffer.from(c.bytes,'base64');
   try{demand(snapshot.bytes.equals(expected)&&snapshot.description===JSON.stringify(description),'IDEMPOTENCY_CONFLICT');}finally{snapshot.bytes.fill(0);expected.fill(0);}
   material=HeadMaterialSchema.parse({tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:c.targetId,revision:1,witness:stagedHeadWitness(confirmation),keyId:b.binding.keyId,generation:b.binding.generation,sourceTaskId:b.staging.sourceTaskId,expiresAt:b.controls.retentionExpiresAt});return material;
  }},{...this.hooks,beforeWitnessAck:async()=>{onCommit();await this.hooks.beforeWitnessAck?.();}},prerequisite,b.fingerprint);
  return {publisher,command};
 }
 async #receipt(s:VerifiedScope,c:ArtifactCommand){return this.uow.withScope(s,async tx=>{
  await this.authority.check(tx,s,'read');const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);await this.authority.currentAudience(tx,s,n.binding.taskId);
  const r=(await tx.query('SELECT receipt_id,id,revision FROM fabric.storage_artifact_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows[0];demand(r&&r['id']===c.targetId,'INTEGRITY_FAILED');
  await this.native.fresh(tx,s,n);await this.authority.check(tx,s,'read');
  return FileResultSchema.parse({schemaVersion:1,status:'artifact-committed',receiptId:r['receipt_id'],id:r['id'],revision:Number(r['revision']),lastSuccessfulCheckpoint:null,unsavedEditorWork:'not-covered'});
 });}
 #unknown(c:ArtifactCommand){return {schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const};}
 async commit(s:VerifiedScope,raw:unknown){let committed=false,c:ArtifactCommand|undefined;
  try{c=parseCommand(ArtifactCommandSchema,raw);const p=await this.#publisher(s,c,()=>{committed=true;});
   try{const r=await p.publisher.publish(s,p.command);return r.status==='committed'?await this.#receipt(s,c):this.#unknown(c);}
   catch(e){if(e instanceof StorageError&&e.code==='IDEMPOTENCY_CONFLICT'){const r=await p.publisher.lookup(s,p.command);if(r.status==='committed'){committed=true;return await this.#receipt(s,c);}}throw e;}
  }catch(e){const failure=safeFailure(e);return c&&(committed||failure.status==='unknown')?this.#unknown(c):failure;}
 }
 async lookup(s:VerifiedScope,raw:unknown){
  const c=parseCommand(ArtifactCommandSchema,raw);
  try{const p=await this.#publisher(s,c),r=await p.publisher.lookup(s,p.command);
   return r.status==='committed'?await this.#receipt(s,c):r.status==='unknown'?this.#unknown(c):r;
  }catch(e){if((e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')||(e instanceof DatabaseError&&['55P03','57014'].includes(e.code??'')))return this.#unknown(c);throw e;}
 }
 async read(s:VerifiedScope,raw:unknown){let snapshot:Awaited<ReturnType<ArtifactPublicationRepository['readWithTransaction']>>|undefined;
  try{return await this.uow.withScope(s,async tx=>{snapshot=await this.readWithTransaction(tx,s,raw);return snapshot;});}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 /** Borrowed authenticated transaction, for an installed volume owner. */
 async readWithTransaction(tx:SqlTransaction,s:VerifiedScope,raw:unknown){
  const ref=ArtifactReadRefSchema.parse(raw);let snapshot:{bytes:Buffer;description:string}|undefined;
  try{
   const head=await this.authority.entity(tx,s,ref);
   const row=(await tx.query('SELECT * FROM fabric.storage_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,ref.id,ref.revision])).rows[0];
   demand(row&&row['root_id']===this.root.rootId&&row['witness']===ref.witness&&row['key_id']===head['key_id']&&row['generation']===head['generation'],'INTEGRITY_FAILED');
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:ref.id,revision:ref.revision,keyId:head['key_id'],generation:head['generation']});
   const confirmation=FileConfirmationSchema.parse({schemaVersion:1,objectDigest:row['object_digest'],manifestDigest:row['manifest_digest'],objectSize:Number(row['object_size']),manifestSize:Number(row['manifest_size'])});
   demand(stagedHeadWitness(confirmation)===ref.witness,'INTEGRITY_FAILED');
   const check=async()=>{await this.authority.entity(tx,s,ref);
    await this.authority.currentAudience(tx,s,uuid.parse(row['source_task_id']));
    if(row['source_id']!==null){await this.authority.entity(tx,s,{class:'source',id:row['source_id'],revision:Number(row['source_revision']),witness:row['source_witness']});}
    const fresh=(await tx.query('SELECT * FROM fabric.storage_artifact_versions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,ref.id,ref.revision])).rows[0];demand(same(fresh,row),'INTEGRITY_FAILED');};
   await check();
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-staging-original',s.tenantId,s.spaceId,row['actor_id'],row['command_key']])]);await check();
   const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
   const control:StagingControl={reserve:unsupported,lock:async(id,work)=>{demand(id===row['upload_id'],'SCOPE_MISMATCH');
    const current=async()=>{await check();return {uploadId:id,rootId:this.root.rootId,binding,observedAt:0,leaseUntil:0,pending:false,unknown:false,reachable:true,confirmation};};
    const result=await work({current,confirm:unsupported,publish:unsupported});await check();return result;
   }};
   snapshot=await new OwnedCipherFiles(this.root,this.crypto,control).inspect(uuid.parse(row['upload_id']),binding);
   let manifest:ReturnType<typeof FileManifestSchema.parse>;
   try{manifest=FileManifestSchema.parse(JSON.parse(snapshot.description));}catch{throw new StorageError('INTEGRITY_FAILED');}
   demand(manifest.tenantId===s.tenantId&&manifest.spaceId===s.spaceId&&manifest.id===ref.id&&manifest.revision===ref.revision&&manifest.generation===binding.generation
    &&manifest.entry.id===ref.id&&manifest.entry.revision===ref.revision&&manifest.entry.objectId===row['object_id']&&manifest.entry.byteLength===snapshot.bytes.length&&manifest.entry.contentDigest===hash(snapshot.bytes)
    &&row['manifest_object_id']===stableId(['storage-artifact-manifest-v1',s.tenantId,s.spaceId,row['actor_id'],row['command_key']])
    &&manifest.validationId!==null&&manifest.base===null,'INTEGRITY_FAILED');
   demand(manifest.source?manifest.source.sourceId===row['source_id']&&manifest.source.revision===Number(row['source_revision'])&&manifest.source.tenantId===s.tenantId&&manifest.source.spaceId===s.spaceId:row['source_id']===null,'INTEGRITY_FAILED');
   await this.hooks.beforeReadRelease?.(tx);await check();
   return {bytes:snapshot.bytes,manifest};
  }catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 /** Installed original resolver, private bytes only. Pending epoch authority
  * is checked against its exact independent previous/next candidate, never
  * treated as unrestricted current authority and never ACKed here. */
 async inspectOriginalForRecovery(s:VerifiedScope,raw:unknown){
  const c=parseCommand(ArtifactCommandSchema,raw);let snapshot:{bytes:Buffer;description:string}|undefined;
  try{return await this.uow.withScope(s,async tx=>{
   await currentScope(tx,s);await revalidateScope(s);
   demand(['storage:read','storage:maintenance','task:write'].every(g=>s.grants.includes(g)),'UNAUTHORIZED');
   const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);
   demand(n.binding.intent==='Ask'&&n.binding.purpose==='maintenance'&&n.admission.executionClass==='service'
    &&n.admission.resourceId===null&&n.admission.computerCapability===null&&!n.admission.targetEffect&&!n.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',s.tenantId,s.spaceId,s.actorId,c.key])]);
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-staging-original',s.tenantId,s.spaceId,s.actorId,c.key])]);
   const check=async()=>{
    await currentScope(tx,s);await revalidateScope(s);await this.native.fresh(tx,s,n);await this.authority.currentAudience(tx,s,n.binding.taskId);
    const state=await this.journal.state(s.tenantId,s.spaceId);demand(state,'AUTHORITY_UNAVAILABLE');
    if(state.pending){const p=state.pending;demand(p.actorId===s.actorId&&p.key===c.key&&p.sessionId===c.sessionId&&p.expiresAt===c.expiresAt,'IDEMPOTENCY_CONFLICT');
     const committed=(await tx.query('SELECT 1 FROM fabric.storage_epoch_publications WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows.length>0;
     const row=(await tx.query('SELECT epoch,anchor_id,policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2 ORDER BY epoch DESC LIMIT 1',[s.tenantId,s.spaceId])).rows[0];demand(row,'AUTHORITY_UNAVAILABLE');
     const observed=EpochAnchorSchema.parse({epoch:Number(row['epoch']),anchorId:row['anchor_id'],policyRevision:Number(row['policy_revision']),controlDigest:row['control_digest']});
     demand(same(observed,committed?p.next:p.previous)&&await controlDigest(tx,s.tenantId,s.spaceId,observed.policyRevision)===observed.controlDigest,'AUTHORITY_UNAVAILABLE');
    }else await this.authority.check(tx,s,'maintenance');
    if(c.sourceId!==null)await this.#source(tx,s,c,false);
   };
   await check();const b=await this.#bound(tx,s,c);
   const r=(await tx.query('SELECT r.*,x.object_digest,x.manifest_digest,x.object_size,x.manifest_size FROM fabric.storage_staging_reservations r JOIN fabric.storage_staging_confirmations x USING(tenant_id,space_id,upload_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows[0];demand(r,'ARTIFACT_NOT_COMMITTED');
   const id=uuid.parse(r['upload_id']),w=await this.witness.state(s.tenantId,s.spaceId,s.actorId,c.key);
   demand(!w.intent&&!w.terminal&&same(w.original,{schemaVersion:1,actorId:s.actorId,commandKey:c.key,materialId:b.materialId,uploadId:id,rootId:this.root.rootId,binding:b.binding,sessionId:c.sessionId,sourceTaskId:n.binding.taskId,expiresAt:c.expiresAt})
    &&r['root_id']===this.root.rootId&&r['id']===c.targetId&&r['session_id']===c.sessionId&&r['material_id']===b.materialId,'AUTHORITY_UNAVAILABLE');
   const confirmation=FileConfirmationSchema.parse({schemaVersion:1,objectDigest:r['object_digest'],manifestDigest:r['manifest_digest'],objectSize:Number(r['object_size']),manifestSize:Number(r['manifest_size'])});
   const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
   const control:StagingControl={reserve:unsupported,lock:async(upload,work)=>{demand(upload===id,'SCOPE_MISMATCH');
    const current=async()=>{await check();demand(same(await this.#bound(tx,s,c),b),'SCOPE_MISMATCH');return {uploadId:id,rootId:this.root.rootId,binding:b.binding,observedAt:0,leaseUntil:0,pending:false,unknown:true,reachable:false,confirmation};};
    const value=await work({current,confirm:unsupported,publish:unsupported});await check();return value;
   }};
   snapshot=await new OwnedCipherFiles(this.root,this.crypto,control).inspectConfirmedForRecovery(id,b.binding);
   const manifest=FileManifestSchema.parse(JSON.parse(snapshot.description));demand(manifest.id===c.targetId&&manifest.filename===c.filename&&manifest.validationId===c.validationId&&manifest.entry.contentDigest===hash(snapshot.bytes),'INTEGRITY_FAILED');
   await check();
   return snapshot;
  });}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 /** Exact original preparation recovery; read/GC metadata only, no replay. */
 recovery(s:VerifiedScope,raw:unknown){const c=parseCommand(ArtifactCommandSchema,raw);return this.#staging(s,c).recovery();}
 async collect(s:VerifiedScope){
  const unsupported=async():Promise<never>=>{throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');};
  const control:StagingControl={reserve:unsupported,lock:async(id,work)=>{
   // Find only registered owned uploads. Absence/unowned/unknown cannot delete.
   const r=await this.uow.withScope(s,async tx=>{await this.authority.check(tx,s,'maintenance');const row=(await tx.query('SELECT * FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND upload_id=$3',[s.tenantId,s.spaceId,id])).rows[0];demand(row&&row['root_id']===this.root.rootId&&row['actor_id']===s.actorId,'CLEANUP_UNPROVEN');return row;});
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:r['class'],id:r['id'],revision:Number(r['revision']),generation:r['generation'],keyId:r['key_id']});
   const material:StagingMaterial={binding,rootId:this.root.rootId,commandKey:uuid.parse(r['command_key']),sessionId:uuid.parse(r['session_id']),sourceTaskId:uuid.parse(r['source_task_id']),expiresAt:(r['expires_at'] as Date).toISOString()};
   const currentRoot=async(tx:SqlTransaction)=>{const live=CurrentRootSchema.parse(await this.controls.current(tx,s));demand(live.rootId===this.root.rootId&&live.keyId===binding.keyId&&live.generation===binding.generation,'SCOPE_MISMATCH');};
   const staging=new AuthenticatedStagingPreparation(this.uow,this.authority,s,{resolve:async(tx)=>{await currentRoot(tx);return material;}},uuid.parse(r['material_id']),this.witness,{publicationBinding:async()=>{
    const published=await this.journal.headPublication(s.tenantId,s.spaceId,s.actorId,material.commandKey);
    demand(published&&published.status!=='rolled-back','AUTHORITY_UNAVAILABLE');return published.pending.binding;
   }}).recovery();
   const outcome=await staging.outcome();
   if(outcome.status==='consumed')return this.uow.withScope(s,async tx=>{
    await this.authority.check(tx,s,'maintenance');await currentRoot(tx);
    const current=async()=>{await this.authority.check(tx,s,'maintenance');await currentRoot(tx);return {uploadId:id,rootId:this.root.rootId,binding,observedAt:0,leaseUntil:0,pending:false,unknown:false,reachable:true,confirmation:null};};
    const value=await work({current,confirm:unsupported,publish:unsupported});await this.authority.check(tx,s,'maintenance');return value;
   });
   return staging.control.lock(id,work);
  }};
  return new OwnedCipherFiles(this.root,this.crypto,control,this.hooks.files).collect();
 }
}
