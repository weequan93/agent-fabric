import { constants } from 'node:fs';
import { open,lstat,realpath,readdir,mkdir,rename } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { BindingSchema,CipherEnvelopeSchema,BackupCommandSchema,parseCommand } from './schema.js';
import { object,literal,uuid,positive,revision,digest,timestamp,nullable,list,enumeration,refined } from './decoder.js';
import { LIMITS,safeAdd } from './arithmetic.js';
import { demand,StorageError } from './errors.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope } from './owners.js';
import type { CryptoStore } from './crypto-store.js';
import type { OwnedAnchorRoot } from './epoch-journal.js';
import type { DependencyGraphRepository } from './dependency-graph.js';
import type { ArtifactPublicationRepository } from './artifact-publication.js';
import type { VolumeDraftRepository } from './volume-drafts.js';

const cipherSize=(e:ReturnType<typeof CipherEnvelopeSchema.parse>)=>Buffer.from(e.ciphertext,'base64').length;
const source=object({id:uuid,revision:positive,witness:digest});
const logical=object({kind:enumeration('live-file','draft','checkpoint'),id:uuid,revision:positive,indexWitness:digest});
const member=object({id:uuid,revision:positive,artifactId:uuid,witness:digest});
export const CapturedItemSchema=object({binding:BindingSchema,envelope:CipherEnvelopeSchema,
 manifest:nullable(CipherEnvelopeSchema),witness:digest,sourceTaskId:uuid,acceptedAt:timestamp,expiresAt:timestamp,
 source:nullable(source),logical:nullable(logical),members:list(member,LIMITS.files)});
/** Capture is descriptive provenance only. There are no SQL, commands, grants,
 * identity/control tables, current heads, credentials or key bytes in this type.
 * Original envelope bindings are retained; archive generation is NOT substituted
 * for the original generation. The old v1 BackupInventorySchema stays unchanged. */
export const CapturedInventorySchema=refined(object({schemaVersion:literal(1),kind:literal('content-capture-v1'),
 tenantId:uuid,spaceId:uuid,actorId:uuid,originalKey:uuid,commandFingerprint:digest,binding:BindingSchema,
 capturedEpoch:positive,capturedAt:timestamp,expiresAt:timestamp,lastSuccessfulCheckpoint:nullable(timestamp),
 items:list(CapturedItemSchema,LIMITS.files),decodedBytes:revision}),v=>v.binding.class==='backup'
 &&v.binding.tenantId===v.tenantId&&v.binding.spaceId===v.spaceId&&v.expiresAt>v.capturedAt
 &&v.decodedBytes===v.items.reduce((n,i)=>safeAdd(n,safeAdd(cipherSize(i.envelope),i.manifest?cipherSize(i.manifest):0)),0)
 &&v.decodedBytes<=LIMITS.backupBytes&&v.items.every(i=>i.binding.tenantId===v.tenantId&&i.binding.spaceId===v.spaceId
 &&JSON.stringify(i.binding)===JSON.stringify({schemaVersion:i.envelope.schemaVersion,tenantId:i.envelope.tenantId,spaceId:i.envelope.spaceId,class:i.envelope.class,id:i.envelope.id,revision:i.envelope.revision,generation:i.envelope.generation,keyId:i.envelope.keyId}))
 &&new Set(v.items.map(i=>JSON.stringify([i.binding.class,i.binding.id,i.binding.revision]))).size===v.items.length);
export type CapturedInventory=ReturnType<typeof CapturedInventorySchema.parse>;
export interface BackupCaptureKeys {resolve(tx:SqlTransaction,s:VerifiedScope):Promise<{keyId:string;generation:string}>}
export interface BackupCaptureHooks {locked?(tx:SqlTransaction):Promise<void>;phase?(phase:'archive-fsynced'|'directory-fsynced'):Promise<void>}
const hash=(b:Buffer|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const date=(v:unknown)=>timestamp.parse(v instanceof Date?v.toISOString():v);
const bindingOf=(e:ReturnType<typeof CipherEnvelopeSchema.parse>)=>BindingSchema.parse({schemaVersion:e.schemaVersion,tenantId:e.tenantId,spaceId:e.spaceId,class:e.class,id:e.id,revision:e.revision,generation:e.generation,keyId:e.keyId});
const captureClasses=['source','knowledge','artifact','live-file','draft','checkpoint','summary','index','cache','ask'] as const;

/** Installed capture owner. All PG inventory and retained file reads occur in
 * one authenticated transaction holding the accepted Space barrier. The result
 * is a prepared archive, NEVER a backup-confirmed/restore/serving receipt.
 * Trusted local directory custody is required, as for OwnedCipherFiles; host
 * administrator races, power loss and external disaster recovery are unqualified. */
export class BackupCaptureRepository {
 readonly #content:OwnedAnchorRoot;readonly #backup:OwnedAnchorRoot;
 constructor(readonly uow:AsyncUnitOfWork,readonly graph:DependencyGraphRepository,readonly crypto:CryptoStore,
  readonly keys:BackupCaptureKeys,content:OwnedAnchorRoot,backup:OwnedAnchorRoot,readonly hooks:BackupCaptureHooks={},readonly contentOwners?:{artifacts:ArtifactPublicationRepository;volume:VolumeDraftRepository}){
  this.#content=Object.freeze({...content});this.#backup=Object.freeze({...backup});
 }
 async #read(path:string,max:number){
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const st=await f.stat();demand(st.isFile()&&st.nlink===1&&st.size<=max,'INTEGRITY_FAILED');
   const bytes=Buffer.alloc(st.size+1);let n=0;while(n<bytes.length){const r=await f.read(bytes,n,bytes.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
   const after=await f.stat();demand(n===st.size&&after.size===st.size&&after.mtimeMs===st.mtimeMs&&after.ctimeMs===st.ctimeMs,'INTEGRITY_FAILED');return bytes.subarray(0,n);
  }finally{await f.close();}
 }
 async #root(r:OwnedAnchorRoot){
  const st=await lstat(r.path);demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===r.device&&st.ino===r.inode&&await realpath(r.path)===r.path,'CLEANUP_UNPROVEN');
  const m=JSON.parse((await this.#read(resolve(r.path,'.storage-owner.json'),1024)).toString());
  demand(JSON.stringify(m)===JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'CLEANUP_UNPROVEN');
 }
 async #roots(){
  const a=this.#content,b=this.#backup;await this.#root(a);await this.#root(b);
  demand(a.owner===b.owner&&a.instance===b.instance&&a.rootId!==b.rootId&&!(a.device===b.device&&a.inode===b.inode),'CLEANUP_UNPROVEN');
  for(const [x,y] of [[a.path,b.path],[b.path,a.path]])demand(relative(x!,y!).startsWith('../'),'CLEANUP_UNPROVEN');
 }
 async #sync(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{demand((await f.stat()).isDirectory(),'CLEANUP_UNPROVEN');await f.sync();}finally{await f.close();}}
 async capture(s:VerifiedScope,raw:unknown){
  const c=parseCommand(BackupCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');
  try{return await this.uow.withScope(s,async tx=>{
   const authority=this.graph.authority;
   const fresh=async()=>{const a=await authority.check(tx,s,'backup',c.expiresAt);await authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});return a;};
   const anchor=await fresh();await this.#roots();await this.hooks.locked?.(tx);await fresh();
   const k=await this.keys.resolve(tx,s),binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:idFor(['storage-backup-capture-v1',s.tenantId,s.spaceId,s.actorId,c.key]),revision:1,...k});
   const commandBytes=Buffer.from(JSON.stringify(c));let fingerprint;try{fingerprint=await this.crypto.fingerprint(binding,'command',commandBytes);}finally{commandBytes.fill(0);}
   const clock=(await tx.query(`SELECT clock_timestamp() AS at,p.periods FROM fabric.storage_policy p WHERE tenant_id=$1 AND space_id=$2 AND revision=$3`,[s.tenantId,s.spaceId,anchor.policyRevision])).rows[0];demand(clock,'AUTHORITY_UNAVAILABLE');
   const capturedAt=date(clock['at']),seconds=(clock['periods'] as Record<string,number>)['backup'];demand(seconds&&seconds<=86400,'RETENTION_RESTRICTED');
   const expiresAt=new Date(Date.parse(capturedAt)+seconds*1000).toISOString();
   const items:CapturedInventory['items'][number][]=[];let decodedBytes=0;
   const add=async(item:CapturedInventory['items'][number])=>{
    const i=CapturedItemSchema.parse(item);demand(JSON.stringify(bindingOf(i.envelope))===JSON.stringify(i.binding),'INTEGRITY_FAILED');
    for(const e of [i.envelope,...(i.manifest?[i.manifest]:[])]){const b=await this.crypto.open(i.binding,e);decodedBytes=safeAdd(decodedBytes,b.length);b.fill(0);demand(decodedBytes<=LIMITS.backupBytes,'CONTENT_UNAVAILABLE');}
    items.push(i);demand(items.length<=LIMITS.files,'CONTENT_UNAVAILABLE');
   };
   // Fixed SELECT projections, never SQL serialized into the archive. Latest
   // canonical revisions only. Any current authority/audience failure aborts.
   for(const [table,id,cl] of [['storage_sources','source_id','source'],['storage_knowledge_revisions','id','knowledge']] as const){
    const rows=(await tx.query(`SELECT p.${id} AS id,p.key_id,p.generation,p.revision,p.source_task_id,p.witness,p.accepted_at,p.expires_at,p.cipher_text FROM fabric.${table} p
     WHERE p.tenant_id=$1 AND p.space_id=$2 AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(p.tenant_id,p.space_id,$3,p.${id}) AND newer.revision>p.revision) ORDER BY p.${id} LIMIT 1025`,[s.tenantId,s.spaceId,cl])).rows;
    demand(rows.length<=LIMITS.files,'CONTENT_UNAVAILABLE');for(const r of rows){const ref={class:cl,id:r['id'],revision:Number(r['revision']),witness:r['witness']};
     if(!await this.#eligible(tx,s,ref))continue;
     const e=CipherEnvelopeSchema.parse(JSON.parse(String(r['cipher_text'])));demand(e.id===r['id']&&e.revision===Number(r['revision'])&&e.class===cl&&e.keyId===r['key_id']&&e.generation===r['generation'],'INTEGRITY_FAILED');demand(hash(String(r['cipher_text']))===r['witness'],'INTEGRITY_FAILED');
     await add({binding:bindingOf(e),envelope:e,manifest:null,witness:digest.parse(r['witness']),sourceTaskId:uuid.parse(r['source_task_id']),acceptedAt:date(r['accepted_at']),expiresAt:date(r['expires_at']),source:null,logical:null,members:[]});
    }
   }
   if(this.contentOwners)await this.contentOwners.volume.assertCaptureInventory(tx,s);
   const checkpoint=(await tx.query("SELECT id,revision,confirmed_at,checkpoint_file_count,artifact_id FROM fabric.storage_volume_versions WHERE tenant_id=$1 AND space_id=$2 AND kind='checkpoint' ORDER BY confirmed_at DESC,id DESC LIMIT 1",[s.tenantId,s.spaceId])).rows[0];
   const members=checkpoint?(await tx.query('SELECT live_id AS id,live_revision AS revision,artifact_id AS "artifactId",witness FROM fabric.storage_checkpoint_files WHERE tenant_id=$1 AND space_id=$2 AND checkpoint_id=$3 AND checkpoint_revision=$4 ORDER BY live_id',[s.tenantId,s.spaceId,checkpoint['id'],checkpoint['revision']])).rows.map(r=>member.parse({...r,revision:Number(r['revision'])})):[];
   demand(!checkpoint||members.length===Number(checkpoint['checkpoint_file_count']),'INTEGRITY_FAILED');
   const rows=(await tx.query(`SELECT a.id,a.key_id,a.generation,a.revision,a.source_task_id,a.witness,a.accepted_at,a.expires_at,a.root_id,a.upload_id,a.object_digest,a.manifest_digest,a.object_size,a.manifest_size,a.source_id,a.source_revision,a.source_witness,v.kind,v.id AS logical_id,v.revision AS logical_revision,v.index_witness
    FROM fabric.storage_artifact_versions a LEFT JOIN fabric.storage_volume_versions v ON (v.tenant_id,v.space_id,v.artifact_id)=(a.tenant_id,a.space_id,a.id)
    WHERE a.tenant_id=$1 AND a.space_id=$2 AND (v.kind IS NULL OR v.kind='draft' AND NOT EXISTS(SELECT 1 FROM fabric.storage_volume_versions n WHERE (n.tenant_id,n.space_id,n.kind,n.id)=(v.tenant_id,v.space_id,v.kind,v.id) AND n.revision>v.revision) OR a.id=ANY($3::uuid[])) ORDER BY a.id LIMIT 1025`,[s.tenantId,s.spaceId,[...(checkpoint?[checkpoint['artifact_id']]:[]),...members.map(m=>m.artifactId)]])).rows;
   demand(rows.length<=LIMITS.files,'CONTENT_UNAVAILABLE');for(const r of rows){
    const ref={class:'artifact',id:r['id'],revision:Number(r['revision']),witness:r['witness']};
    if(!await this.#eligible(tx,s,ref)){demand(!members.some(m=>m.artifactId===r['id'])&&r['id']!==checkpoint?.['artifact_id'],'RETENTION_RESTRICTED');continue;}
    if(r['source_id'])await authority.entity(tx,s,{class:'source',id:r['source_id'],revision:Number(r['source_revision']),witness:r['source_witness']});
    demand(this.contentOwners&&this.contentOwners.artifacts.root.rootId===this.#content.rootId,'AUTHORITY_UNAVAILABLE');
    const verified=r['kind']?await this.contentOwners.volume.readWithTransaction(tx,s,{kind:r['kind'],id:r['logical_id'],revision:Number(r['logical_revision'])}):await this.contentOwners.artifacts.readWithTransaction(tx,s,ref);
    verified.bytes.fill(0);
    demand(r['root_id']===this.#content.rootId,'CLEANUP_UNPROVEN');const dir=resolve(this.#content.path,'u-'+uuid.parse(r['upload_id'])),st=await lstat(dir);
    demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===this.#content.device&&await realpath(dir)===dir,'CLEANUP_UNPROVEN');demand(JSON.stringify((await readdir(dir)).sort())===JSON.stringify(['manifest','object']),'ARTIFACT_NOT_COMMITTED');
    const objectBytes=await this.#read(resolve(dir,'object'),2*LIMITS.commandBytes),manifestBytes=await this.#read(resolve(dir,'manifest'),2*LIMITS.commandBytes);
    demand(objectBytes.length===Number(r['object_size'])&&manifestBytes.length===Number(r['manifest_size'])&&hash(objectBytes)===r['object_digest']&&hash(manifestBytes)===r['manifest_digest'],'INTEGRITY_FAILED');
    const e=CipherEnvelopeSchema.parse(JSON.parse(objectBytes.toString())),m=CipherEnvelopeSchema.parse(JSON.parse(manifestBytes.toString()));demand(e.class==='artifact'&&e.id===r['id']&&e.revision===Number(r['revision'])&&e.keyId===r['key_id']&&e.generation===r['generation'],'INTEGRITY_FAILED');
    await add({binding:bindingOf(e),envelope:e,manifest:m,witness:digest.parse(r['witness']),sourceTaskId:uuid.parse(r['source_task_id']),acceptedAt:date(r['accepted_at']),expiresAt:date(r['expires_at']),source:r['source_id']?source.parse({id:r['source_id'],revision:Number(r['source_revision']),witness:r['source_witness']}):null,logical:r['kind']?logical.parse({kind:r['kind'],id:r['logical_id'],revision:Number(r['logical_revision']),indexWitness:r['index_witness']}):null,members:r['kind']==='checkpoint'?members:[]});
   }
   if(checkpoint)demand(items.some(i=>i.binding.id===checkpoint['artifact_id'])&&members.every(m=>items.some(i=>i.binding.id===m.artifactId)),'CONTENT_UNAVAILABLE');
   const projections=(await tx.query(`SELECT n.class,n.id,n.revision,n.witness,n.source_task_id,n.expires_at,p.envelope,coalesce(a.accepted_at,h.accepted_at) AS accepted_at,a.envelope AS ask_envelope FROM fabric.storage_graph_nodes n LEFT JOIN fabric.storage_graph_payloads p USING(tenant_id,space_id,class,id,revision,witness) LEFT JOIN fabric.storage_current_heads h ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(n.tenant_id,n.space_id,n.backing_class,n.backing_id,n.backing_revision) LEFT JOIN fabric.storage_ask_receipts a ON (a.tenant_id,a.space_id,a.id)=(n.tenant_id,n.space_id,n.ask_id) WHERE n.tenant_id=$1 AND n.space_id=$2 AND n.class IN('summary','index','cache','ask') ORDER BY n.class,n.id,n.revision LIMIT 1025`,[s.tenantId,s.spaceId])).rows;
   demand(projections.length<=LIMITS.files,'CONTENT_UNAVAILABLE');for(const r of projections){if(!await this.#eligible(tx,s,{class:r['class'],id:r['id'],revision:Number(r['revision']),witness:r['witness']}))continue;
    const e=CipherEnvelopeSchema.parse(r['class']==='ask'?r['ask_envelope']:JSON.parse(String(r['envelope'])));
    await add({binding:bindingOf(e),envelope:e,manifest:null,witness:digest.parse(r['witness']),sourceTaskId:uuid.parse(r['source_task_id']),acceptedAt:r['accepted_at']?date(r['accepted_at']):capturedAt,expiresAt:date(r['expires_at']),source:null,logical:null,members:[]});
   }
   const expected=(await tx.query(`SELECT h.class,h.id,h.revision,h.witness FROM fabric.storage_current_heads h
    WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class IN('source','knowledge','artifact','summary','index','cache')
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(h.tenant_id,h.space_id,h.class,h.id) AND newer.revision>h.revision)
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_volume_versions v WHERE (v.tenant_id,v.space_id,v.artifact_id)=(h.tenant_id,h.space_id,h.id)) ORDER BY h.class,h.id LIMIT 1025`,[s.tenantId,s.spaceId])).rows;
   demand(expected.length<=LIMITS.files,'CONTENT_UNAVAILABLE');
   for(const h of expected)if(await this.#eligible(tx,s,{class:h['class'],id:h['id'],revision:Number(h['revision']),witness:h['witness']}))demand(items.some(i=>i.binding.class===h['class']&&i.binding.id===h['id']&&i.binding.revision===Number(h['revision'])),'CONTENT_UNAVAILABLE');
   for(const i of items)await this.#validate(tx,s,i);demand((await fresh()).epoch===anchor.epoch,'AUTHORITY_UNAVAILABLE');await this.#roots();
   const inventory=CapturedInventorySchema.parse({schemaVersion:1,kind:'content-capture-v1',tenantId:s.tenantId,spaceId:s.spaceId,actorId:s.actorId,originalKey:c.key,commandFingerprint:fingerprint,binding,capturedEpoch:anchor.epoch,capturedAt,expiresAt,lastSuccessfulCheckpoint:checkpoint?date(checkpoint['confirmed_at']):null,items,decodedBytes});
   const plain=Buffer.from(JSON.stringify(inventory));demand(plain.length<=LIMITS.backupBytes,'CONTENT_UNAVAILABLE');let archive;try{archive=Buffer.from(JSON.stringify(await this.crypto.seal(binding,plain)));}finally{plain.fill(0);}
   const dir=resolve(this.#backup.path,'c-'+binding.id);demand((await readdir(this.#backup.path)).length<=LIMITS.files,'CONTENT_UNAVAILABLE');
   try{await mkdir(dir,{mode:0o700});}catch(e){if((e as {code?:string}).code==='EEXIST')throw new StorageError('IDEMPOTENCY_CONFLICT');throw e;}
   await this.#sync(this.#backup.path);const temp=resolve(dir,'.part-'+randomUUID()),f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{await f.writeFile(archive);await f.sync();await this.hooks.phase?.('archive-fsynced');}finally{await f.close();}
   await rename(temp,resolve(dir,'archive'));await this.#sync(dir);await this.hooks.phase?.('directory-fsynced');
   for(const i of items)await this.#validate(tx,s,i);await fresh();demand(JSON.stringify(await this.keys.resolve(tx,s))===JSON.stringify(k),'CONTENT_UNAVAILABLE');await this.#roots();
   const counts=Object.fromEntries(captureClasses.map(cl=>[cl,items.filter(i=>(i.logical?.kind??i.binding.class)===cl).length]));
   return Object.freeze({schemaVersion:1 as const,status:'capture-prepared' as const,backupId:binding.id,binding,commandFingerprint:fingerprint,capturedEpoch:anchor.epoch,capturedAt,expiresAt,lastSuccessfulCheckpoint:inventory.lastSuccessfulCheckpoint,counts:Object.freeze(counts),decodedBytes,archiveDigest:hash(archive),archiveBytes:archive.length,backupRootId:this.#backup.rootId,confirmed:false as const});
  });}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('CONTENT_UNAVAILABLE');}
 }
 async #eligible(tx:SqlTransaction,s:VerifiedScope,ref:{class:unknown;id:unknown;revision:number;witness:unknown}){
  try{if(ref.class==='artifact')await this.graph.authority.entity(tx,s,ref);else await this.graph.assertCurrent(tx,s,ref);return true;}
  catch(e){if(e instanceof StorageError&&['STALE_REVISION','RETENTION_RESTRICTED'].includes(e.code))return false;throw e;}
 }
 async #validate(tx:SqlTransaction,s:VerifiedScope,i:CapturedInventory['items'][number]){
  if(i.binding.class==='artifact')await this.graph.authority.entity(tx,s,{class:'artifact',id:i.binding.id,revision:i.binding.revision,witness:i.witness});else await this.graph.assertCurrent(tx,s,{class:i.binding.class,id:i.binding.id,revision:i.binding.revision,witness:i.witness});
  if(i.source)await this.graph.authority.entity(tx,s,{class:'source',...i.source});
 }
}
