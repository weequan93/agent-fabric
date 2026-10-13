import { constants } from 'node:fs';
import { open,lstat,readdir,rename,unlink,rmdir,realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RestoreCommandSchema,RestoreResultSchema,BindingSchema,CipherEnvelopeSchema,FileManifestSchema,parseCommand } from './schema.js';
import { object,literal,uuid,revision,enumeration,timestamp,boolean,nullable } from './decoder.js';
import { RestoreActivationRepository } from './restore-activation.js';
import { RestoreImportRepository,RestoreStageProgressSchema,RestoreStageItemSchema,type RestoreStageProgress } from './restore-import.js';
import { BackupConfirmationRepository } from './backup-confirmation.js';
import { BorrowedUnitOfWork } from './resource-composition.js';
import { validateRestoreInventory,validateRestorePayload,RestoreCipherManifestSchema,restoreHash,restoreSame,type RestoreItem } from './restore-validation.js';
import { assertRestoreNotRolledBack } from './restore-cancellation.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError,FoundationError } from './errors.js';
import type { SqlTransaction,VerifiedScope } from './owners.js';
type Command=ReturnType<typeof RestoreCommandSchema.parse>;
export const RestoreProgressStatusSchema=object({schemaVersion:literal(1),operationId:uuid,backupId:uuid,generation:uuid,
 state:enumeration('staging','staged','ready','rolled-back'),phase:enumeration('items','staged','activated','rolled-back'),
 completedItems:revision,expectedItems:revision,lastSuccessfulCheckpoint:nullable(timestamp),serving:boolean,admissionEnabled:boolean,jobsEnabled:literal(false),
 nextAction:enumeration('resume-original-operation','read-eligible-content','cleanup-owned-staging','inspect-current-authority')});
export interface RestoreProgressHooks {phase?(phase:'staging-created'|'import-validated'|'staged'|'item-fsynced'|'item-recorded'|'reconciled',index:number):Promise<void>}
const failure=(e:unknown):never=>{if(e instanceof StorageError||(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT'))throw e;throw new StorageError('RESTORE_BLOCKED');};
/** Original-key recovery owner. PostgreSQL owns authentication, fencing and
 * commit; encrypted FS checkpoints are content progress only. No automatic
 * external work, job admission, archive authority or second generation. */
export class RestoreProgressRepository {
 constructor(readonly activation:RestoreActivationRepository,readonly hooks:RestoreProgressHooks={}){}
 get imported(){return this.activation.imported;}
 get backup(){return this.activation.backup;}
 get stage(){return this.activation.stage;}
 #command(raw:unknown){const c=parseCommand(RestoreCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');return c;}
 async #fresh(tx:SqlTransaction,s:VerifiedScope,c:Command,expire=false){const a=this.backup.graph.authority;
  await a.check(tx,s,'restore',expire?c.expiresAt:undefined);await a.check(tx,s,'read',expire?c.expiresAt:undefined);
  await a.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:expire?c.expiresAt:new Date(Date.now()+15_000).toISOString()});
 }
 async #lock(tx:SqlTransaction,s:VerifiedScope,c:Command){
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-restore-original-v1',s.tenantId,s.spaceId,s.actorId,c.key])]);
 }
 async #fingerprint(s:VerifiedScope,c:Command,generation:string,keyId:string){const bytes=Buffer.from(JSON.stringify(c));try{return await this.imported.crypto.fingerprint({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:c.targetId,revision:1,generation,keyId},'command',bytes);}finally{bytes.fill(0);}}
 async #match(s:VerifiedScope,c:Command,p:RestoreStageProgress){demand(p.actorId===s.actorId&&p.operationId===c.targetId&&p.backupId===c.backupId&&p.originalKey===c.key&&p.commandFingerprint===await this.#fingerprint(s,c,p.generation,p.keyId),'IDEMPOTENCY_CONFLICT');}
 async #original(tx:SqlTransaction,s:VerifiedScope,c:Command){await this.stage.rootCheck();
  const path=resolve(this.imported.root.path,'k-'+restoreHash(JSON.stringify(['storage-restore-original-v1',s.tenantId,s.spaceId,s.actorId,c.key])).slice(7));
  let bytes;try{bytes=await this.stage.readFile(path,2*LIMITS.commandBytes);}catch(e){if((e as {code?:string}).code==='ENOENT')return;throw e;}
  const e=CipherEnvelopeSchema.parse(JSON.parse(bytes.toString())),key=await this.imported.targetKeys.resolve(tx,s);demand(key.rootId===this.imported.root.rootId&&key.keyId===e.keyId,'CONTENT_UNAVAILABLE');
  const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:e.id,revision:1,generation:e.generation,keyId:key.keyId}),plain=await this.imported.crypto.open(binding,e);let p;
  try{p=RestoreStageProgressSchema.parse(JSON.parse(plain.toString()));}finally{plain.fill(0);}
  demand(p.tenantId===s.tenantId&&p.spaceId===s.spaceId&&p.rootId===this.imported.root.rootId&&p.generation===e.generation&&p.keyId===key.keyId&&p.completed.length===0,'INTEGRITY_FAILED');await this.#match(s,c,p);return p;
 }
 async #row(tx:SqlTransaction,s:VerifiedScope,c:Command,table:'storage_restore_activations'|'storage_restore_rollbacks'){
  const row=(await tx.query('SELECT * FROM fabric.'+table+' WHERE tenant_id=$1 AND space_id=$2 AND (operation_id=$3 OR (actor_id=$4 AND original_key=$5))',[s.tenantId,s.spaceId,c.targetId,s.actorId,c.key])).rows[0];
  if(row)demand(row['actor_id']===s.actorId&&row['operation_id']===c.targetId&&row['backup_id']===c.backupId&&row['original_key']===c.key&&row['root_id']===this.imported.root.rootId&&row['command_fingerprint']===await this.#fingerprint(s,c,String(row['generation']),String(row['key_id'])),'IDEMPOTENCY_CONFLICT');
  return row;
 }
 async #candidate(tx:SqlTransaction,s:VerifiedScope,c:Command,expired=false){const b=this.backup,u=new BorrowedUnitOfWork(s,tx);try{
  return await new BackupConfirmationRepository(u,b.journal,b.native,b.graph,b.crypto,b.keys,b.root).restoreCandidate(s,{schemaVersion:1,sessionId:c.sessionId,backupId:c.backupId,expiresAt:expired?new Date(Date.now()+15_000).toISOString():c.expiresAt});
 }finally{u.close();}}
 #status(p:RestoreStageProgress,checkpoint:string|null,state:'staging'|'staged'|'ready'|'rolled-back'){
  return RestoreProgressStatusSchema.parse({schemaVersion:1,operationId:p.operationId,backupId:p.backupId,generation:p.generation,state,
   phase:state==='ready'?'activated':state==='rolled-back'?'rolled-back':state==='staged'?'staged':'items',completedItems:p.completed.length,expectedItems:p.expectedItems,
   lastSuccessfulCheckpoint:checkpoint,serving:state==='ready',admissionEnabled:state==='ready',jobsEnabled:false,
   nextAction:state==='ready'?'read-eligible-content':state==='rolled-back'?'cleanup-owned-staging':'resume-original-operation'});
 }
 async lookup(s:VerifiedScope,raw:unknown){const c=this.#command(raw);return this.backup.uow.withScope(s,async tx=>{
  await this.#fresh(tx,s,c);await this.#lock(tx,s,c);await this.#fresh(tx,s,c);await this.#original(tx,s,c);
  await assertRestoreNotRolledBack(tx,s,c.targetId);const row=await this.#row(tx,s,c,'storage_restore_activations');
  return row?RestoreResultSchema.parse(row['result']):null;
 }).catch(failure);}
 async status(s:VerifiedScope,raw:unknown){const c=this.#command(raw);return this.backup.uow.withScope(s,async tx=>{
  await this.#fresh(tx,s,c);await this.#lock(tx,s,c);await this.#fresh(tx,s,c);await this.#original(tx,s,c);
  const rolled=await this.#row(tx,s,c,'storage_restore_rollbacks');if(rolled)return RestoreProgressStatusSchema.parse(rolled['status']);
  const {p}=await this.stage.progress(tx,s,c.targetId,s.actorId,true);await this.#match(s,c,p);
  const row=await this.#row(tx,s,c,'storage_restore_activations'),archive=await this.#candidate(tx,s,c,true);
  demand(archive.archiveDigest===p.archiveDigest,'INTEGRITY_FAILED');
  return this.#status(p,archive.inventory.lastSuccessfulCheckpoint,row?'ready':p.completed.length===p.expectedItems?'staged':'staging');
 }).catch(failure);}
 async #sync(dir:string){const file=await open(dir,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await file.stat();demand(st.isDirectory()&&st.dev===this.imported.root.device&&await realpath(dir)===dir,'CLEANUP_UNPROVEN');await file.sync();}finally{await file.close();}}
 async #write(dir:string,name:string,bytes:Buffer){const tmp=resolve(dir,'.part-'+randomUUID()),file=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await rename(tmp,resolve(dir,name));await this.#sync(dir);}
 #binding(p:RestoreStageProgress){return BindingSchema.parse({schemaVersion:1,tenantId:p.tenantId,spaceId:p.spaceId,class:'backup',id:p.operationId,revision:1,generation:p.generation,keyId:p.keyId});}
 async #validateBundle(p:RestoreStageProgress,item:RestoreItem,bytes:Buffer,inventory:ReturnType<typeof validateRestoreInventory>){
  const bundle=RestoreStageItemSchema.parse(JSON.parse(bytes.toString())),binding=BindingSchema.parse({...item.binding,generation:p.generation,keyId:p.keyId});
  demand(restoreSame(bundle.original,item.envelope)&&restoreSame(bundle.originalManifest,item.manifest)&&Boolean(bundle.targetManifest)===Boolean(item.manifest),'INTEGRITY_FAILED');
  const old=await this.imported.crypto.open(item.binding,item.envelope),target=await this.imported.crypto.open(binding,bundle.target);let om:Buffer|null=null,tm:Buffer|null=null;
  try{om=item.manifest?await this.imported.crypto.open(item.binding,item.manifest):null;tm=bundle.targetManifest?await this.imported.crypto.open(binding,bundle.targetManifest):null;
   validateRestorePayload(inventory,item,old,om);demand(old.equals(target),'INTEGRITY_FAILED');
   if(tm){const o=RestoreCipherManifestSchema.parse(JSON.parse(om!.toString())),m=RestoreCipherManifestSchema.parse(JSON.parse(tm.toString()));
    demand(restoreSame(m.binding,binding)&&m.objectDigest===restoreHash(JSON.stringify(bundle.target))&&m.objectSize===Buffer.byteLength(JSON.stringify(bundle.target))&&restoreSame(JSON.parse(m.description),{...JSON.parse(o.description),generation:p.generation}),'INTEGRITY_FAILED');}
  }finally{old.fill(0);target.fill(0);om?.fill(0);tm?.fill(0);}
  return bundle;
 }
 async resume(s:VerifiedScope,raw:unknown){const c=this.#command(raw);return this.backup.uow.withScope(s,async tx=>{
  await this.#fresh(tx,s,c,true);await this.#lock(tx,s,c);await this.#fresh(tx,s,c,true);await this.#original(tx,s,c);await assertRestoreNotRolledBack(tx,s,c.targetId);await this.stage.rootCheck();
  const row=await this.#row(tx,s,c,'storage_restore_activations');if(row)return RestoreResultSchema.parse(row['result']);
  const dir=this.stage.directory(s,c.targetId);let exists=true;try{await lstat(dir);}catch(e){if((e as {code?:string}).code==='ENOENT')exists=false;else throw e;}
  if(!exists){const b=this.backup,u=new BorrowedUnitOfWork(s,tx);try{
   const owner=new BackupConfirmationRepository(u,b.journal,b.native,b.graph,b.crypto,b.keys,b.root),imp=new RestoreImportRepository(owner,this.imported.crypto,this.imported.root,this.imported.targetKeys,{phase:async(phase,index)=>{await this.hooks.phase?.(phase,index);}});
   const result=await imp.import(s,c);await this.hooks.phase?.('staged',0);return result;
  }finally{u.close();}}
  let {p}=await this.stage.progress(tx,s,c.targetId,s.actorId,true);await this.#match(s,c,p);
  const archive=await this.#candidate(tx,s,c),inventory=validateRestoreInventory(archive.inventory);
  demand(archive.archiveDigest===p.archiveDigest&&inventory.items.length===p.expectedItems&&inventory.decodedBytes===p.decodedBytes,'INTEGRITY_FAILED');
  const nonces=new Set(inventory.items.flatMap(i=>[i.envelope.nonce,...(i.manifest?[i.manifest.nonce]:[])]));
  for(const [index,item] of inventory.items.entries()){
   await this.#fresh(tx,s,c,true);await assertRestoreNotRolledBack(tx,s,c.targetId);
   // Reconcile on every restart and every item; restricted ciphertext stays
   // blocked, and must never be rehydrated or used as serving authority.
   const state=await this.activation.reconcile(tx,s,item);demand(state==='eligible','RESTORE_BLOCKED');
   const path=resolve(dir,'i-'+index);let bytes:Buffer|undefined;try{bytes=await this.stage.readFile(path,4*LIMITS.backupBytes);}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}
   if(bytes){if(index<p.completed.length){const pin=p.completed[index]!;demand(bytes.length===pin.bytes&&restoreHash(bytes)===pin.digest,'INTEGRITY_FAILED');}else demand(index===p.completed.length,'INTEGRITY_FAILED');
    const bundle=await this.#validateBundle(p,item,bytes,inventory);for(const e of [bundle.target,...(bundle.targetManifest?[bundle.targetManifest]:[])]){demand(!nonces.has(e.nonce),'INTEGRITY_FAILED');nonces.add(e.nonce);}
   }else{
    demand(index===p.completed.length,'INTEGRITY_FAILED');const old=await this.imported.crypto.open(item.binding,item.envelope);let om:Buffer|null=null;
    try{om=item.manifest?await this.imported.crypto.open(item.binding,item.manifest):null;validateRestorePayload(inventory,item,old,om);const binding=BindingSchema.parse({...item.binding,generation:p.generation,keyId:p.keyId}),target=await this.imported.crypto.seal(binding,old);let targetManifest=null;
     demand(!nonces.has(target.nonce),'INTEGRITY_FAILED');nonces.add(target.nonce);
     if(om){const wrapper=RestoreCipherManifestSchema.parse(JSON.parse(om.toString())),m=FileManifestSchema.parse(JSON.parse(wrapper.description)),object=Buffer.from(JSON.stringify(target)),plain=Buffer.from(JSON.stringify({...wrapper,binding,objectDigest:restoreHash(object),objectSize:object.length,description:JSON.stringify({...m,generation:p.generation})}));try{targetManifest=await this.imported.crypto.seal(binding,plain);demand(!nonces.has(targetManifest.nonce),'INTEGRITY_FAILED');nonces.add(targetManifest.nonce);}finally{plain.fill(0);}}
     bytes=Buffer.from(JSON.stringify(RestoreStageItemSchema.parse({schemaVersion:1,original:item.envelope,originalManifest:item.manifest,target,targetManifest})));await this.#write(dir,'i-'+index,bytes);await this.hooks.phase?.('item-fsynced',index);
    }finally{old.fill(0);om?.fill(0);}
   }
   if(index===p.completed.length){p=RestoreStageProgressSchema.parse({...p,completed:[...p.completed,{index,digest:restoreHash(bytes!),bytes:bytes!.length}]});const plain=Buffer.from(JSON.stringify(p));try{await this.#write(dir,'progress',Buffer.from(JSON.stringify(await this.imported.crypto.seal(this.#binding(p),plain))));}finally{plain.fill(0);}await this.hooks.phase?.('item-recorded',index);}
  }
  await this.hooks.phase?.('staged',p.expectedItems);await this.#fresh(tx,s,c,true);await this.#original(tx,s,c);
  demand(restoreSame(await this.#candidate(tx,s,c),archive),'INTEGRITY_FAILED');await this.stage.progress(tx,s,c.targetId);
  for(const [index,item] of inventory.items.entries()){demand(await this.activation.reconcile(tx,s,item)==='eligible','RESTORE_BLOCKED');await this.stage.bundle(s,p,index);}
  return RestoreResultSchema.parse({schemaVersion:1,operationId:c.targetId,backupId:c.backupId,generation:p.generation,state:'staged',serving:false,restrictionEpoch:null,lastSuccessfulCheckpoint:inventory.lastSuccessfulCheckpoint,unavailableEntityIds:[],preserved:['confirmed-content','current-authority','original-receipts'],notExecuted:['external-effects','credentials','approvals','unsent-drafts','methods'],nextAction:'resume-original-operation'});
 }).catch(failure);}
 async activate(s:VerifiedScope,raw:unknown){const c=this.#command(raw);return this.backup.uow.withScope(s,async tx=>{
  await this.#fresh(tx,s,c);await this.#lock(tx,s,c);await this.#fresh(tx,s,c);await this.#original(tx,s,c);await assertRestoreNotRolledBack(tx,s,c.targetId);
  const prior=await this.#row(tx,s,c,'storage_restore_activations');if(prior)return RestoreResultSchema.parse(prior['result']);
  await this.#fresh(tx,s,c,true);const b=this.backup,u=new BorrowedUnitOfWork(s,tx);try{
   const backup=new BackupConfirmationRepository(u,b.journal,b.native,b.graph,b.crypto,b.keys,b.root),imp=new RestoreImportRepository(backup,this.imported.crypto,this.imported.root,this.imported.targetKeys),owner=new RestoreActivationRepository(imp,this.activation.admission,{...this.activation.hooks,beforeCommit:async t=>{await this.activation.hooks.beforeCommit?.(t);await this.hooks.phase?.('reconciled',0);}});
   return await owner.activate(s,c);
  }finally{u.close();}
 }).catch(failure);}
 async rollback(s:VerifiedScope,raw:unknown){const c=this.#command(raw);
  const status=await this.backup.uow.withScope(s,async tx=>{await this.#fresh(tx,s,c);await this.#lock(tx,s,c);await this.#fresh(tx,s,c);await this.#original(tx,s,c);
   const prior=await this.#row(tx,s,c,'storage_restore_rollbacks');if(prior)return RestoreProgressStatusSchema.parse(prior['status']);
   const original=await this.#original(tx,s,c);demand(original,'RESTORE_BLOCKED');let p=original;
   // Serving cancellation needs the authenticated original claim, never the
   // availability of the files being removed. Missing or corrupt progress
   // conservatively reports only the original durable checkpoint.
   try{p=(await this.stage.progress(tx,s,c.targetId,s.actorId,true,false)).p;}catch{/* Cleanup below retains and refuses unproven material. */}
   await this.#match(s,c,p);const archive=await this.#candidate(tx,s,c,true);demand(archive.archiveDigest===p.archiveDigest,'INTEGRITY_FAILED');
   const status=this.#status(p,archive.inventory.lastSuccessfulCheckpoint,'rolled-back');
   await tx.query('SELECT fabric.storage_rollback_restore($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[c.key,c.targetId,c.backupId,p.generation,p.keyId,p.rootId,p.commandFingerprint,JSON.stringify(status)]);await this.#fresh(tx,s,c);return status;
  }).catch(failure);
  // Disable serving by committed control before touching content. An uncertain
  // commit performs NO deletion: original status/rollback resolves uncertainty.
  await this.backup.uow.withScope(s,async tx=>{await this.#fresh(tx,s,c);await this.#lock(tx,s,c);await this.#fresh(tx,s,c);await this.#original(tx,s,c);demand(await this.#row(tx,s,c,'storage_restore_rollbacks'),'RESTORE_BLOCKED');await this.stage.rootCheck();
   const dir=this.stage.directory(s,c.targetId);try{await lstat(dir);}catch(e){if((e as {code?:string}).code==='ENOENT')return;throw e;}
   const {p}=await this.stage.progress(tx,s,c.targetId,s.actorId,true);await this.#match(s,c,p);const before=await lstat(dir),names=await readdir(dir),pins=new Map<string,{device:number;inode:number;digest:string}>();
   for(const name of names){const path=resolve(dir,name),st=await lstat(path);demand(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.dev===this.imported.root.device,'CLEANUP_UNPROVEN');const bytes=await this.stage.readFile(path,4*LIMITS.backupBytes);
    if(name!=='progress'){const index=Number(name.slice(2)),pin=p.completed[index];if(pin)demand(bytes.length===pin.bytes&&restoreHash(bytes)===pin.digest,'INTEGRITY_FAILED');
     else{const archive=await this.#candidate(tx,s,c,true),inventory=validateRestoreInventory(archive.inventory);demand(archive.archiveDigest===p.archiveDigest&&inventory.items[index],'INTEGRITY_FAILED');await this.#validateBundle(p,inventory.items[index]!,bytes,inventory);}
     const bundle=RestoreStageItemSchema.parse(JSON.parse(bytes.toString()));demand(bundle.target.generation===p.generation&&bundle.target.keyId===p.keyId&&bundle.target.tenantId===s.tenantId&&bundle.target.spaceId===s.spaceId,'CLEANUP_UNPROVEN');}
    pins.set(name,{device:st.dev,inode:st.ino,digest:restoreHash(bytes)});
   }
   await this.stage.rootCheck();const now=await lstat(dir);demand(now.dev===before.dev&&now.ino===before.ino&&restoreSame((await readdir(dir)).sort(),names.sort()),'CLEANUP_UNPROVEN');
   for(const name of names){const path=resolve(dir,name),st=await lstat(path),pin=pins.get(name)!;demand(st.dev===pin.device&&st.ino===pin.inode&&st.nlink===1&&!st.isSymbolicLink()&&restoreHash(await this.stage.readFile(path,4*LIMITS.backupBytes))===pin.digest,'CLEANUP_UNPROVEN');}
   for(const name of names)await unlink(resolve(dir,name));await this.#sync(dir);await rmdir(dir);await this.#sync(this.imported.root.path);
  }).catch(failure);return status;
 }
}
