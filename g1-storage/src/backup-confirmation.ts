import { constants } from 'node:fs';
import { open,lstat,realpath,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseError } from 'pg';
import { BackupCommandSchema,BindingSchema,CipherEnvelopeSchema,parseCommand } from './schema.js';
import { object,uuid,timestamp,version } from './decoder.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError,FoundationError,safeFailure } from './errors.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { revalidateScope,type AsyncUnitOfWork,type SqlTransaction,type VerifiedScope,type NativeRepository } from './owners.js';
import { HeadPublicationRepository,type HeadPublicationPrerequisite,type HeadWorkOverride } from './head-publication.js';
import { HeadMaterialSchema,type HeadMaterial } from './head-material.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from './epoch-journal.js';
import type { EpochPublicationHooks } from './epoch-publication.js';
import { CapturedInventorySchema,type CapturedInventory,type BackupCaptureKeys } from './backup-capture.js';
import type { DependencyGraphRepository } from './dependency-graph.js';
import type { CryptoStore } from './crypto-store.js';

const hash=(v:Buffer|string)=>'sha256:'+createHash('sha256').update(v).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
type Command=ReturnType<typeof BackupCommandSchema.parse>;
export interface BackupConfirmationHooks extends EpochPublicationHooks {
 phase?(phase:'archive-fsynced'|'directory-fsynced'):Promise<void>;
 afterConfirmation?(tx:SqlTransaction):Promise<void>;
 beforeRelease?(tx:SqlTransaction):Promise<void>;
}
export const BackupReadCommandSchema=object({schemaVersion:version,sessionId:uuid,backupId:uuid,expiresAt:timestamp});
type Bound={binding:ReturnType<typeof BindingSchema.parse>;fingerprint:string;materialId:string};
type Archive={inventory:CapturedInventory;digest:string;bytes:number};
class BackupHead extends HeadPublicationRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:NativeRepository,
  materials:ConstructorParameters<typeof HeadPublicationRepository>[3],hooks:EpochPublicationHooks,
  prerequisite:HeadPublicationPrerequisite|undefined,readonly fingerprint:string){super(uow,journal,native,materials,hooks,prerequisite);}
 protected override commandBinding(c:Parameters<HeadPublicationPrerequisite['prepare']>[2]){return hash(JSON.stringify({command:c,contentBinding:this.fingerprint}));}
 protected override async inspectOriginal(tx:SqlTransaction,s:VerifiedScope,row:Record<string,unknown>){
  await super.inspectOriginal(tx,s,row);
  const r=(await tx.query(`SELECT b.* FROM fabric.storage_backup_confirmations b JOIN fabric.storage_backup_events e
   USING(tenant_id,space_id,actor_id,command_key,id,revision,epoch,at,event_id)
   WHERE b.tenant_id=$1 AND b.space_id=$2 AND b.actor_id=$3 AND b.command_key=$4`,[s.tenantId,s.spaceId,s.actorId,row['command_key']])).rows[0];
  demand(r&&r['binding_digest']===row['binding_digest']&&Number(r['epoch'])===Number(row['epoch'])
   &&Number(r['captured_epoch'])+1===Number(row['epoch']),'AUTHORITY_UNAVAILABLE');
 }
}
/** The existing head publisher is the ONLY confirmation/unknown/ACK protocol.
 * Filesystem durability precedes its reserve+PG transaction. File presence alone
 * never authorizes restoration; lookup is control-only and does not replay.
 * Owned local custody excludes hostile host-admin races and power-loss claims. */
export class BackupConfirmationRepository {
 readonly root:OwnedAnchorRoot;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:NativeRepository,
  readonly graph:DependencyGraphRepository,readonly crypto:CryptoStore,readonly keys:BackupCaptureKeys,
  root:OwnedAnchorRoot,readonly hooks:BackupConfirmationHooks={}){this.root=Object.freeze({...root});}
 async #root(){
  const r=this.root,st=await lstat(r.path);demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===r.device&&st.ino===r.inode&&await realpath(r.path)===r.path,'CLEANUP_UNPROVEN');
  const f=await open(resolve(r.path,'.storage-owner.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const st=await f.stat();demand(st.isFile()&&st.nlink===1&&st.size<=1024,'CLEANUP_UNPROVEN');
   demand(same(JSON.parse(await f.readFile('utf8')),{owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'CLEANUP_UNPROVEN');}finally{await f.close();}
 }
 async #directory(path:string,sync=false){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const st=await f.stat();demand(st.isDirectory()&&st.dev===this.root.device&&await realpath(path)===path,'CLEANUP_UNPROVEN');if(sync)await f.sync();
 }finally{await f.close();}}
 async #archive(binding:Bound['binding'],durable=false):Promise<Archive>{
  await this.#root();const dir=resolve(this.root.path,'c-'+binding.id);await this.#directory(dir);
  demand(same((await readdir(dir)).sort(),['archive']),'ARTIFACT_NOT_COMMITTED');
  const f=await open(resolve(dir,'archive'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let bytes:Buffer;
  try{const st=await f.stat();demand(st.isFile()&&st.nlink===1&&st.dev===this.root.device&&st.size>0&&st.size<=2*LIMITS.backupBytes,'INTEGRITY_FAILED');
   bytes=Buffer.alloc(st.size+1);let n=0;while(n<bytes.length){const r=await f.read(bytes,n,bytes.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
   const after=await f.stat();demand(n===st.size&&after.size===st.size&&after.mtimeMs===st.mtimeMs&&after.ctimeMs===st.ctimeMs,'INTEGRITY_FAILED');bytes=bytes.subarray(0,n);
   if(durable){await f.sync();await this.hooks.phase?.('archive-fsynced');}
  }finally{await f.close();}
  if(durable){await this.#directory(dir,true);await this.#directory(this.root.path,true);await this.hooks.phase?.('directory-fsynced');}
  const e=CipherEnvelopeSchema.parse(JSON.parse(bytes.toString())),plain=await this.crypto.open(binding,e);
  try{demand(plain.length<=LIMITS.backupBytes,'CONTENT_UNAVAILABLE');const inventory=CapturedInventorySchema.parse(JSON.parse(plain.toString()));
   demand(same(inventory.binding,binding),'INTEGRITY_FAILED');await this.#root();return {inventory,digest:hash(bytes),bytes:bytes.length};
  }finally{plain.fill(0);}
 }
 async #bound(tx:SqlTransaction,s:VerifiedScope,c:Command):Promise<Bound>{
  await currentScope(tx,s);await revalidateScope(s);demand(['storage:backup','storage:read','storage:write','storage:maintenance','task:write'].every(g=>s.grants.includes(g)),'UNAUTHORIZED');
  const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);
  demand(n.binding.purpose==='maintenance'&&n.binding.intent==='Ask'&&n.admission.executionClass==='service'&&n.admission.resourceId===null&&n.admission.computerCapability===null&&!n.admission.targetEffect&&!n.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  await this.graph.authority.currentAudience(tx,s,n.binding.taskId);
  const k=await this.keys.resolve(tx,s),binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:idFor(['storage-backup-capture-v1',s.tenantId,s.spaceId,s.actorId,c.key]),revision:1,...k});
  const bytes=Buffer.from(JSON.stringify(c));try{return {binding,fingerprint:await this.crypto.fingerprint(binding,'command',bytes),materialId:idFor(['storage-backup-confirmation-v1',s.tenantId,s.spaceId,s.actorId,c.key])};}finally{bytes.fill(0);}
 }
 #headCommand(c:Command,b:Bound){return {key:c.key,sessionId:c.sessionId,expiresAt:c.expiresAt,materialId:b.materialId,expected:null};}
 async #publisher(s:VerifiedScope,c:Command,onCommit:()=>void=()=>{}){
  const b=await this.uow.withScope(s,tx=>this.#bound(tx,s,c)),hc=this.#headCommand(c,b);let archive:Archive|undefined,material:HeadMaterial|undefined,work:HeadWorkOverride|undefined;
  const validate=async(tx:SqlTransaction,scope:VerifiedScope)=>{
   demand(archive&&same(await this.#bound(tx,scope,c),b),'CHECK_BINDING_MISMATCH');const i=archive.inventory;
   demand(i.actorId===scope.actorId&&i.originalKey===c.key&&i.commandFingerprint===b.fingerprint,'IDEMPOTENCY_CONFLICT');
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[i.expiresAt])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
   // Repeat exact eligible originals before reserve. After reserve the preserved
   // publisher repeats identity/native/audience/time and the complete controls.
   for(const item of i.items){if(item.binding.class==='artifact')await this.graph.authority.entity(tx,scope,{class:'artifact',id:item.binding.id,revision:item.binding.revision,witness:item.witness});
    else await this.graph.assertCurrent(tx,scope,{class:item.binding.class,id:item.binding.id,revision:item.binding.revision,witness:item.witness});
    if(item.source)await this.graph.authority.entity(tx,scope,{class:'source',...item.source});
   }
   const a=await this.graph.authority.check(tx,scope,'backup',c.expiresAt);await this.graph.authority.check(tx,scope,'read',c.expiresAt);
   demand(a.epoch===i.capturedEpoch,'STALE_REVISION');
  };
  const prerequisite:HeadPublicationPrerequisite={prepare:async(tx,scope,_c,h)=>{
   demand(archive&&same(h,material),'INTEGRITY_FAILED');await validate(tx,scope);
   const recheck=await this.#archive(b.binding);demand(recheck.digest===archive.digest&&recheck.bytes===archive.bytes&&same(recheck.inventory,archive.inventory),'INTEGRITY_FAILED');await validate(tx,scope);
   return async()=>{
    demand(archive&&work,'INTEGRITY_FAILED');const i=archive.inventory;
    await tx.query('SELECT fabric.storage_confirm_backup($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[c.key,this.root.rootId,i.capturedEpoch,i.capturedAt,archive.bytes,i.decodedBytes,i.items.length,i.lastSuccessfulCheckpoint,work.receiptId,work.jobId,idFor(['backup-event',scope.tenantId,scope.spaceId,scope.actorId,c.key])]);
    await this.hooks.afterConfirmation?.(tx);
    const current=await this.#archive(b.binding);demand(current.digest===archive.digest&&current.bytes===archive.bytes,'INTEGRITY_FAILED');
    demand(same(await this.#bound(tx,scope,c),b),'CHECK_BINDING_MISMATCH');
   };
  },forecastWork:async(_tx,scope,_c,h,epoch,at)=>{work={actorId:scope.actorId,key:c.key,binding:hash(JSON.stringify({command:hc,contentBinding:b.fingerprint})),receiptId:idFor(['backup-receipt',scope.tenantId,scope.spaceId,scope.actorId,c.key]),jobId:idFor(['backup-job',scope.tenantId,scope.spaceId,scope.actorId,c.key]),entity:{class:h.class,id:h.id,revision:h.revision},epoch,at};return work;}};
  const publisher=new BackupHead(this.uow,this.journal,this.native,{resolve:async(tx,scope,id)=>{
   demand(id===b.materialId&&same(await this.#bound(tx,scope,c),b),'CHECK_BINDING_MISMATCH');
   await this.graph.authority.check(tx,scope,'backup',c.expiresAt);await this.graph.authority.check(tx,scope,'read',c.expiresAt);
   archive=await this.#archive(b.binding,true);await validate(tx,scope);
   for(const item of archive.inventory.items)for(const e of [item.envelope,...(item.manifest?[item.manifest]:[])]){const bytes=await this.crypto.open(item.binding,e);bytes.fill(0);}
   await validate(tx,scope);const n=await this.native.load(tx,scope,c.sessionId);
   material=HeadMaterialSchema.parse({tenantId:scope.tenantId,spaceId:scope.spaceId,class:'backup',id:b.binding.id,revision:1,witness:archive.digest,keyId:b.binding.keyId,generation:b.binding.generation,sourceTaskId:n.binding.taskId,expiresAt:archive.inventory.expiresAt});return material;
  }},{...this.hooks,beforeWitnessAck:async()=>{onCommit();await this.hooks.beforeWitnessAck?.();}},prerequisite,b.fingerprint);
  return {publisher,command:hc};
 }
 #unknown(c:Command){return {schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const};}
 async #receipt(s:VerifiedScope,c:Command){return this.uow.withScope(s,async tx=>{
  await this.graph.authority.check(tx,s,'read');await this.#bound(tx,s,c);
  const r=(await tx.query('SELECT * FROM fabric.storage_backup_confirmations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows[0];demand(r,'AUTHORITY_UNAVAILABLE');
  await this.hooks.beforeRelease?.(tx);await this.graph.authority.check(tx,s,'read');await this.#bound(tx,s,c);
  return Object.freeze({schemaVersion:1 as const,status:'backup-confirmed' as const,receiptId:uuid.parse(r['receipt_id']),backupId:uuid.parse(r['id']),confirmedAt:timestamp.parse((r['at'] as Date).toISOString()),expiresAt:timestamp.parse((r['expires_at'] as Date).toISOString()),capturedEpoch:Number(r['captured_epoch']),confirmedEpoch:Number(r['epoch']),archiveDigest:String(r['witness']),archiveBytes:Number(r['archive_bytes']),decodedBytes:Number(r['decoded_bytes']),itemCount:Number(r['item_count']),lastSuccessfulCheckpoint:r['last_checkpoint']===null?null:timestamp.parse((r['last_checkpoint'] as Date).toISOString()),unsavedEditorWork:'not-covered' as const});
 });}
 async confirm(s:VerifiedScope,raw:unknown){let c:Command|undefined,committed=false;
  try{c=parseCommand(BackupCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');const p=await this.#publisher(s,c,()=>{committed=true;});
   try{const r=await p.publisher.publish(s,p.command);return r.status==='committed'?await this.#receipt(s,c):this.#unknown(c);}
   catch(e){if(e instanceof StorageError&&e.code==='IDEMPOTENCY_CONFLICT'){const r=await p.publisher.lookup(s,p.command);if(r.status==='committed')return await this.#receipt(s,c);}throw e;}
  }catch(e){if(c&&(committed||(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')||(e instanceof DatabaseError&&['55P03','57014'].includes(e.code??''))))return this.#unknown(c);return safeFailure(e);}
 }
 async lookup(s:VerifiedScope,raw:unknown){const c=parseCommand(BackupCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');
  const b=await this.uow.withScope(s,tx=>this.#bound(tx,s,c)),publisher=new BackupHead(this.uow,this.journal,this.native,{resolve:async()=>undefined},{},undefined,b.fingerprint);
  const r=await publisher.lookup(s,this.#headCommand(c,b));return r.status==='committed'?{schemaVersion:1 as const,status:'committed' as const,result:await this.#receipt(s,c),replayAllowed:false as const}:r.status==='unknown'?this.#unknown(c):{schemaVersion:1 as const,status:'absent-safe' as const,key:c.key,replayAllowed:false as const,nextAction:'inspect-current-authority' as const};
 }
 /** Eligibility/preparation only. No import, SQL execution or serving activation.
  * The durable control confirmation and live expiry are checked BEFORE archive
  * open and repeated after it. Future restore must filter current restrictions. */
 async restoreCandidate(s:VerifiedScope,raw:unknown){const c=BackupReadCommandSchema.parse(raw);
  try{return await this.uow.withScope(s,async tx=>{
   const check=async()=>{await this.graph.authority.check(tx,s,'restore',c.expiresAt);await this.graph.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
    const r=(await tx.query('SELECT * FROM fabric.storage_backup_confirmations WHERE tenant_id=$1 AND space_id=$2 AND id=$3',[s.tenantId,s.spaceId,c.backupId])).rows[0];demand(r,'RESTORE_BLOCKED');demand(r['root_id']===this.root.rootId,'CLEANUP_UNPROVEN');
    await this.graph.authority.entity(tx,s,{class:'backup',id:c.backupId,revision:1,witness:r['witness']});
    demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[r['expires_at']])).rows[0]?.['live']===true,'RESTORE_BLOCKED');return r;};
   const r=await check(),binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:c.backupId,revision:1,keyId:r['key_id'],generation:r['generation']});
   const archive=await this.#archive(binding);demand(archive.digest===r['witness']&&archive.bytes===Number(r['archive_bytes'])&&archive.inventory.capturedEpoch===Number(r['captured_epoch'])&&archive.inventory.expiresAt===(r['expires_at'] as Date).toISOString()&&archive.inventory.decodedBytes===Number(r['decoded_bytes'])&&archive.inventory.items.length===Number(r['item_count']),'INTEGRITY_FAILED');
   await this.hooks.beforeRelease?.(tx);await check();return Object.freeze({status:'restore-candidate' as const,inventory:archive.inventory,archiveDigest:archive.digest,confirmed:true as const,serving:false as const});
  });}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('RESTORE_BLOCKED');}
 }
}
