import { constants } from 'node:fs';
import { open,lstat,realpath,readdir,mkdir,rename } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { RestoreCommandSchema,RestoreResultSchema,BindingSchema,CipherEnvelopeSchema,FileManifestSchema,parseCommand } from './schema.js';
import { object,literal,uuid,digest,revision,list,nullable } from './decoder.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError } from './errors.js';
import { BorrowedUnitOfWork } from './resource-composition.js';
import { BackupConfirmationRepository } from './backup-confirmation.js';
import { validateRestoreInventory,validateRestorePayload,restoreHash,restoreSame,RestoreCipherManifestSchema,type RestoreItem } from './restore-validation.js';
import type { OwnedAnchorRoot } from './epoch-journal.js';
import type { VerifiedScope,SqlTransaction } from './owners.js';
import type { CryptoStore } from './crypto-store.js';

export const RestoreStageItemSchema=object({schemaVersion:literal(1),original:CipherEnvelopeSchema,originalManifest:nullable(CipherEnvelopeSchema),
 target:CipherEnvelopeSchema,targetManifest:nullable(CipherEnvelopeSchema)});
export const RestoreStageProgressSchema=object({schemaVersion:literal(1),kind:literal('blocked-import-v1'),tenantId:uuid,spaceId:uuid,actorId:uuid,operationId:uuid,backupId:uuid,
 originalKey:uuid,commandFingerprint:digest,archiveDigest:digest,rootId:uuid,generation:uuid,keyId:uuid,serving:literal(false),
 completed:list(object({index:revision,digest,bytes:revision}),LIMITS.files),expectedItems:revision,decodedBytes:revision});
export function restoreOperationDirectoryName(s:Pick<VerifiedScope,'tenantId'|'spaceId'|'actorId'>,operationId:string){
 return 'r-'+createHash('sha256').update(JSON.stringify(['storage-restore-operation-v1',uuid.parse(s.tenantId),uuid.parse(s.spaceId),uuid.parse(s.actorId),uuid.parse(operationId)])).digest('hex');
}
export type RestoreStageProgress=ReturnType<typeof RestoreStageProgressSchema.parse>;
export interface RestoreImportHooks {
 locked?(tx:SqlTransaction):Promise<void>;
 phase?(phase:'staging-created'|'item-fsynced'|'item-recorded'|'import-validated',index:number):Promise<void>;
}
/** Content-only restore owner. The ONLY candidate source is the installed backup
 * confirmation owner, borrowed on this same authenticated Space transaction.
 * FS progress is encrypted and durable but NEVER publication authority. No SQL
 * mutations, activation, ports, native execution or head/epoch updates exist.
 * Failed partial work stays blocked for a later original-operation recovery. */
export class RestoreImportRepository {
 readonly root:OwnedAnchorRoot;
 constructor(readonly backup:BackupConfirmationRepository,readonly crypto:CryptoStore,root:OwnedAnchorRoot,
  readonly targetKeys:{resolve(tx:SqlTransaction,s:VerifiedScope):Promise<{keyId:string;rootId:string}>},readonly hooks:RestoreImportHooks={}){this.root=Object.freeze({...root});}
 async #read(path:string,max:number){
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{
   const st=await f.stat();demand(st.isFile()&&st.nlink===1&&st.dev===this.root.device&&st.size>0&&st.size<=max,'INTEGRITY_FAILED');
   const b=Buffer.alloc(st.size+1);let n=0;while(n<b.length){const r=await f.read(b,n,b.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
   const after=await f.stat();demand(n===st.size&&after.size===st.size&&after.ctimeMs===st.ctimeMs&&after.mtimeMs===st.mtimeMs,'INTEGRITY_FAILED');return b.subarray(0,n);
  }finally{await f.close();}
 }
 async #root(){const r=this.root,st=await lstat(r.path);demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===r.device&&st.ino===r.inode&&await realpath(r.path)===r.path,'CLEANUP_UNPROVEN');
  demand(restoreSame(JSON.parse((await this.#read(resolve(r.path,'.storage-owner.json'),1024)).toString()),{owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'CLEANUP_UNPROVEN');
  const b=this.backup.root;demand(r.owner===b.owner&&r.instance===b.instance&&r.rootId!==b.rootId&&!(r.device===b.device&&r.inode===b.inode)&&relative(r.path,b.path).startsWith('../')&&relative(b.path,r.path).startsWith('../'),'CLEANUP_UNPROVEN');
 }
 async #sync(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await f.stat();demand(st.isDirectory()&&st.dev===this.root.device&&await realpath(path)===path,'CLEANUP_UNPROVEN');await f.sync();}finally{await f.close();}}
 async #write(dir:string,name:string,b:Buffer,replace=false){const temp=resolve(dir,'.part-'+randomUUID()),f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await f.writeFile(b);await f.sync();}finally{await f.close();}
  if(!replace){try{await lstat(resolve(dir,name));throw new StorageError('IDEMPOTENCY_CONFLICT');}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}}
  await rename(temp,resolve(dir,name));await this.#sync(dir);
 }
 async #references(tx:SqlTransaction,s:VerifiedScope,items:readonly RestoreItem[],inventoryItems=items){
  for(const i of items){const b=i.binding;
   const row=(await tx.query(`SELECT h.witness,h.key_id,h.generation,h.expires_at,e.source_task_id FROM fabric.storage_current_heads h JOIN fabric.storage_entities e USING(tenant_id,space_id,class,id,revision)
    WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class=$3 AND h.id=$4 AND h.revision=$5`,[s.tenantId,s.spaceId,b.class,b.id,b.revision])).rows[0];
   if(b.class==='ask'){
    const r=(await tx.query('SELECT a.key_id,a.generation,a.task_id,a.expires_at,n.witness FROM fabric.storage_ask_receipts a JOIN fabric.storage_graph_nodes n ON (n.tenant_id,n.space_id,n.class,n.id,n.revision)=(a.tenant_id,a.space_id,\'ask\',a.id,1) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.id=$3',[s.tenantId,s.spaceId,b.id])).rows[0];
    demand(r&&r['witness']===i.witness&&r['key_id']===b.keyId&&r['generation']===b.generation&&r['task_id']===i.sourceTaskId&&(r['expires_at'] as Date).toISOString()===i.expiresAt,'INTEGRITY_FAILED');
   }else demand(row&&row['witness']===i.witness&&row['key_id']===b.keyId&&row['generation']===b.generation&&row['source_task_id']===i.sourceTaskId&&(row['expires_at'] as Date).toISOString()===i.expiresAt,'INTEGRITY_FAILED');
   if(i.logical){const l=i.logical,r=(await tx.query('SELECT artifact_id,index_witness,task_id FROM fabric.storage_volume_versions WHERE tenant_id=$1 AND space_id=$2 AND kind=$3 AND id=$4 AND revision=$5',[s.tenantId,s.spaceId,l.kind,l.id,l.revision])).rows[0];demand(r&&r['artifact_id']===b.id&&r['index_witness']===l.indexWitness&&r['task_id']===i.sourceTaskId,'INTEGRITY_FAILED');}
   const nodeClass=i.logical?.kind==='draft'?'draft':b.class,nodeId=i.logical?.kind==='draft'?i.logical.id:b.id,nodeRevision=i.logical?.kind==='draft'?i.logical.revision:b.revision;
   const deps=(await tx.query('SELECT parent_class,parent_id,parent_revision,parent_witness FROM fabric.storage_graph_edges WHERE tenant_id=$1 AND space_id=$2 AND child_class=$3 AND child_id=$4 AND child_revision=$5',[s.tenantId,s.spaceId,nodeClass,nodeId,nodeRevision])).rows;
   for(const d of deps)demand(inventoryItems.some(p=>d['parent_class']==='draft'?p.logical?.kind==='draft'&&p.logical.id===d['parent_id']&&p.logical.revision===Number(d['parent_revision'])&&p.logical.indexWitness===d['parent_witness']:p.binding.class===d['parent_class']&&p.binding.id===d['parent_id']&&p.binding.revision===Number(d['parent_revision'])&&p.witness===d['parent_witness']),'INTEGRITY_FAILED');
   await this.backup.graph.authority.currentAudience(tx,s,i.sourceTaskId);
  }
 }
 #binding(p:RestoreStageProgress){return BindingSchema.parse({schemaVersion:1,tenantId:p.tenantId,spaceId:p.spaceId,class:'backup',id:p.operationId,revision:1,generation:p.generation,keyId:p.keyId});}
 async #progress(dir:string,p:RestoreStageProgress,replace:boolean){const b=Buffer.from(JSON.stringify(RestoreStageProgressSchema.parse(p)));try{await this.#write(dir,'progress',Buffer.from(JSON.stringify(await this.crypto.seal(this.#binding(p),b))),replace);}finally{b.fill(0);}}
 async import(s:VerifiedScope,raw:unknown){const c=parseCommand(RestoreCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');
  try{return await this.backup.uow.withScope(s,async tx=>{
   const borrowed=new BorrowedUnitOfWork(s,tx),candidateOwner=new BackupConfirmationRepository(borrowed,this.backup.journal,this.backup.native,this.backup.graph,this.backup.crypto,this.backup.keys,this.backup.root);
   const candidate=()=>candidateOwner.restoreCandidate(s,{schemaVersion:1,sessionId:c.sessionId,backupId:c.backupId,expiresAt:c.expiresAt});
   const fresh=async()=>{await this.backup.graph.authority.check(tx,s,'restore',c.expiresAt);await this.backup.graph.authority.check(tx,s,'read',c.expiresAt);await this.backup.graph.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});await this.#root();};
   try{
    await fresh();await this.hooks.locked?.(tx);await fresh();const archive=await candidate(),inventory=validateRestoreInventory(archive.inventory);
    await this.#references(tx,s,inventory.items);
    // Authenticate and validate every original before creating a target. Buffers
    // are discarded immediately; the second import pass uses original AAD again.
    for(const item of inventory.items){const b=await this.crypto.open(item.binding,item.envelope);let m:Buffer|null=null;
     try{m=item.manifest?await this.crypto.open(item.binding,item.manifest):null;validateRestorePayload(inventory,item,b,m);}finally{b.fill(0);m?.fill(0);}}
    await fresh();const targetKey=await this.targetKeys.resolve(tx,s);demand(targetKey.rootId===this.root.rootId,'CLEANUP_UNPROVEN');const keyId=uuid.parse(targetKey.keyId),generation=randomUUID();
    demand(inventory.items.every(i=>i.binding.generation!==generation)&&inventory.binding.generation!==generation,'INTEGRITY_FAILED');
    const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:c.targetId,revision:1,generation,keyId});
    const command=Buffer.from(JSON.stringify(c));let fingerprint;try{fingerprint=await this.crypto.fingerprint(binding,'command',command);}finally{command.fill(0);}
    const dir=resolve(this.root.path,restoreOperationDirectoryName(s,c.targetId));demand((await readdir(this.root.path)).length<=LIMITS.files,'RESTORE_BLOCKED');
    const keyName='k-'+createHash('sha256').update(JSON.stringify(['storage-restore-original-v1',s.tenantId,s.spaceId,s.actorId,c.key])).digest('hex');
    try{await lstat(resolve(this.root.path,keyName));throw new StorageError('IDEMPOTENCY_CONFLICT');}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}
    try{await mkdir(dir,{mode:0o700});}catch(e){if((e as {code?:string}).code==='EEXIST')throw new StorageError('IDEMPOTENCY_CONFLICT');throw e;}
    await this.#sync(this.root.path);
    let progress=RestoreStageProgressSchema.parse({schemaVersion:1,kind:'blocked-import-v1',tenantId:s.tenantId,spaceId:s.spaceId,actorId:s.actorId,operationId:c.targetId,backupId:c.backupId,originalKey:c.key,commandFingerprint:fingerprint,archiveDigest:archive.archiveDigest,rootId:this.root.rootId,generation,keyId,serving:false,completed:[],expectedItems:inventory.items.length,decodedBytes:inventory.decodedBytes});
    // Exclusive encrypted original-key claim survives failed partial staging.
    // Existing keys/targets are never silently replayed, renamed or overwritten.
    const claimPlain=Buffer.from(JSON.stringify(progress));let claim;try{claim=Buffer.from(JSON.stringify(await this.crypto.seal(this.#binding(progress),claimPlain)));}finally{claimPlain.fill(0);}
    const claimFile=await open(resolve(this.root.path,keyName),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await claimFile.writeFile(claim);await claimFile.sync();}finally{await claimFile.close();}await this.#sync(this.root.path);
    await this.#progress(dir,progress,false);await this.hooks.phase?.('staging-created',0);
    const usedNonces=new Set(inventory.items.flatMap(i=>[i.envelope.nonce,...(i.manifest?[i.manifest.nonce]:[])]));
    for(const [index,item] of inventory.items.entries()){
     await fresh();await this.#references(tx,s,[item],inventory.items);const bytes=await this.crypto.open(item.binding,item.envelope);let manifest:Buffer|null=null;
     try{
      manifest=item.manifest?await this.crypto.open(item.binding,item.manifest):null;validateRestorePayload(inventory,item,bytes,manifest);
      const targetBinding=BindingSchema.parse({...item.binding,generation,keyId}),target=await this.crypto.seal(targetBinding,bytes);let targetManifest=null;
      demand(!usedNonces.has(target.nonce),'INTEGRITY_FAILED');usedNonces.add(target.nonce);
      if(manifest){const wrapper=RestoreCipherManifestSchema.parse(JSON.parse(manifest.toString())),m=FileManifestSchema.parse(JSON.parse(wrapper.description)),targetBytes=Buffer.from(JSON.stringify(target)),plain=Buffer.from(JSON.stringify({...wrapper,binding:targetBinding,objectDigest:restoreHash(targetBytes),objectSize:targetBytes.length,description:JSON.stringify({...m,generation})}));try{targetManifest=await this.crypto.seal(targetBinding,plain);demand(!usedNonces.has(targetManifest.nonce),'INTEGRITY_FAILED');usedNonces.add(targetManifest.nonce);}finally{plain.fill(0);}}
      const bundle=Buffer.from(JSON.stringify(RestoreStageItemSchema.parse({schemaVersion:1,original:item.envelope,originalManifest:item.manifest,target,targetManifest})));
      await this.#write(dir,'i-'+index,bundle);await this.hooks.phase?.('item-fsynced',index);
      progress=RestoreStageProgressSchema.parse({...progress,completed:[...progress.completed,{index,digest:restoreHash(bundle),bytes:bundle.length}]});await this.#progress(dir,progress,true);await this.hooks.phase?.('item-recorded',index);
     }finally{bytes.fill(0);manifest?.fill(0);}
    }
    await this.hooks.phase?.('import-validated',inventory.items.length);await fresh();await this.#references(tx,s,inventory.items);
    demand(restoreSame(await candidate(),archive),'INTEGRITY_FAILED');demand(restoreSame(await this.targetKeys.resolve(tx,s),targetKey),'CONTENT_UNAVAILABLE');
    demand((await this.#read(resolve(this.root.path,keyName),2*LIMITS.commandBytes)).equals(claim),'INTEGRITY_FAILED');
    for(const p of progress.completed){const bytes=await this.#read(resolve(dir,'i-'+p.index),4*LIMITS.backupBytes);demand(bytes.length===p.bytes&&restoreHash(bytes)===p.digest,'INTEGRITY_FAILED');}
    const retained=CipherEnvelopeSchema.parse(JSON.parse((await this.#read(resolve(dir,'progress'),2*LIMITS.commandBytes)).toString())),plain=await this.crypto.open(this.#binding(progress),retained);try{demand(restoreSame(RestoreStageProgressSchema.parse(JSON.parse(plain.toString())),progress),'INTEGRITY_FAILED');}finally{plain.fill(0);}
    demand(restoreSame((await readdir(dir)).sort(),['progress',...progress.completed.map(p=>'i-'+p.index)].sort()),'INTEGRITY_FAILED');
    return RestoreResultSchema.parse({schemaVersion:1,operationId:c.targetId,backupId:c.backupId,generation,state:'staged',serving:false,restrictionEpoch:null,lastSuccessfulCheckpoint:inventory.lastSuccessfulCheckpoint,unavailableEntityIds:[],preserved:['confirmed-content','current-authority','original-receipts'],notExecuted:['external-effects','credentials','approvals','unsent-drafts','methods'],nextAction:'resume-original-operation'});
   }finally{borrowed.close();}
  });}catch(e){if(e instanceof StorageError)throw e;throw new StorageError('RESTORE_BLOCKED');}
 }
}
