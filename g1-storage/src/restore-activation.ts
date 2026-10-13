import { constants } from 'node:fs';
import { open,lstat,realpath,readdir } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { RestoreCommandSchema,RestoreResultSchema,BindingSchema,CipherEnvelopeSchema,KnowledgeSchema,SourcePayloadSchema,parseCommand } from './schema.js';
import { object,literal,uuid,revision,positive,digest,enumeration,list } from './decoder.js';
import { LIMITS } from './arithmetic.js';
import { IdentityError } from '../../g1-identity/src/contracts.js';
import { demand,StorageError,FoundationError } from './errors.js';
import { RestoreImportRepository,RestoreStageProgressSchema,RestoreStageItemSchema,restoreOperationDirectoryName,type RestoreStageProgress } from './restore-import.js';
import { validateRestoreInventory,validateRestorePayload,restoreHash,restoreSame,type RestoreItem } from './restore-validation.js';
import { BackupConfirmationRepository } from './backup-confirmation.js';
import { BorrowedUnitOfWork } from './resource-composition.js';
import { GraphRefSchema } from './dependency-graph.js';
import { StoragePolicySchema } from './authority.js';
import { KnowledgeReadRefSchema,type LocalSaveAdmission } from './knowledge-save.js';
import type { SqlTransaction,VerifiedScope } from './owners.js';
import type { OwnedAnchorRoot } from './epoch-journal.js';
import type { Knowledge } from './contracts.js';
import { assertRestoreNotRolledBack } from './restore-cancellation.js';

const restoreFailure=(error:unknown):never=>{if(error instanceof StorageError||(error instanceof FoundationError&&error.code==='UNKNOWN_COMMIT'))throw error;throw new StorageError('RESTORE_BLOCKED');};
const States=enumeration('eligible','restricted','blocked-freshness');
// An activation record is metadata, not an archived source of serving authority.
const EntrySchema=object({index:revision,state:States});
const EntriesSchema=list(EntrySchema,LIMITS.files);
export interface RestoreActivationHooks {locked?(tx:SqlTransaction):Promise<void>;beforeCommit?(tx:SqlTransaction):Promise<void>;metadataImported?(tx:SqlTransaction):Promise<void>;beforeActivationCommit?(tx:SqlTransaction):Promise<void>}
export const RestoredReadSchema=object({schemaVersion:literal(1),operationId:uuid,ref:GraphRefSchema});
const MetadataSchema=object({schemaVersion:literal(1),inventory:validateInventoryDecoder(),states:EntriesSchema});
function validateInventoryDecoder(){return {parse:validateRestoreInventory};}

/** Fixed owned root. No request-supplied path, key, generation or authority.
 * Read stable regular files with no-follow, single-link and finite byte bounds.
 * Import's encrypted progress stays serving:false forever; ONLY a committed
 * current-policy activation row admits a read of the target envelopes. */
class RestoreStageReader {
 constructor(readonly imported:RestoreImportRepository){}
 get root(){return this.imported.root;}
 async rootCheck(){const r=this.root,s=await lstat(r.path);demand(s.isDirectory()&&!s.isSymbolicLink()&&s.dev===r.device&&s.ino===r.inode&&await realpath(r.path)===r.path,'CLEANUP_UNPROVEN');
  demand(restoreSame(JSON.parse((await this.readFile(resolve(r.path,'.storage-owner.json'),1024)).toString()),{owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'CLEANUP_UNPROVEN');
  const b=this.imported.backup.root;demand(r.owner===b.owner&&r.instance===b.instance&&r.rootId!==b.rootId&&relative(r.path,b.path).startsWith('../')&&relative(b.path,r.path).startsWith('../'),'CLEANUP_UNPROVEN');}
 async readFile(path:string,max:number){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{
  const s=await f.stat();demand(s.isFile()&&s.nlink===1&&s.dev===this.root.device&&s.size>0&&s.size<=max,'INTEGRITY_FAILED');
  const b=Buffer.alloc(s.size+1);let n=0;while(n<b.length){const r=await f.read(b,n,b.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
  const a=await f.stat();demand(n===s.size&&a.size===s.size&&a.ctimeMs===s.ctimeMs&&a.mtimeMs===s.mtimeMs,'INTEGRITY_FAILED');return b.subarray(0,n);
 }finally{await f.close();}}
 directory(s:VerifiedScope,id:string,actorId=s.actorId){return resolve(this.root.path,restoreOperationDirectoryName({tenantId:s.tenantId,spaceId:s.spaceId,actorId:uuid.parse(actorId)},id));}
 async progress(tx:SqlTransaction,s:VerifiedScope,id:string,actorId=s.actorId,partial=false,filesRequired=true){await this.rootCheck();const dir=this.directory(s,id,actorId),st=await lstat(dir);
  demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===this.root.device&&await realpath(dir)===dir,'INTEGRITY_FAILED');
  const bytes=await this.readFile(resolve(dir,'progress'),2*LIMITS.commandBytes),e=CipherEnvelopeSchema.parse(JSON.parse(bytes.toString())),key=await this.imported.targetKeys.resolve(tx,s);
  demand(key.rootId===this.root.rootId&&key.keyId===e.keyId,'CONTENT_UNAVAILABLE');
  const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id,revision:1,generation:e.generation,keyId:key.keyId}),plain=await this.imported.crypto.open(binding,e);let p;
  try{p=RestoreStageProgressSchema.parse(JSON.parse(plain.toString()));}finally{plain.fill(0);}
  demand(p.tenantId===s.tenantId&&p.spaceId===s.spaceId&&p.actorId===actorId&&p.operationId===id&&p.rootId===this.root.rootId&&p.keyId===key.keyId&&p.generation===e.generation,'INTEGRITY_FAILED');
  const claimName='k-'+restoreHash(JSON.stringify(['storage-restore-original-v1',s.tenantId,s.spaceId,p.actorId,p.originalKey])).slice(7),claim=CipherEnvelopeSchema.parse(JSON.parse((await this.readFile(resolve(this.root.path,claimName),2*LIMITS.commandBytes)).toString())),claimBytes=await this.imported.crypto.open(binding,claim);let original;
  try{original=RestoreStageProgressSchema.parse(JSON.parse(claimBytes.toString()));}finally{claimBytes.fill(0);}
  demand(original.completed.length===0&&restoreSame({...original,completed:p.completed},p),'INTEGRITY_FAILED');
  demand((partial?p.completed.length<=p.expectedItems:p.completed.length===p.expectedItems)&&p.completed.every((v,i)=>v.index===i)&&new Set(p.completed.map(v=>v.index)).size===p.completed.length,'RESTORE_BLOCKED');
  const files=(await readdir(dir)).sort(),expected=['progress',...p.completed.map(v=>'i-'+v.index)].sort();
  if(filesRequired){demand(expected.every(file=>files.includes(file)),'RESTORE_BLOCKED');
   demand(partial?files.every(file=>expected.includes(file)||(p.completed.length<p.expectedItems&&file==='i-'+p.completed.length)):restoreSame(files,expected),'INTEGRITY_FAILED');}return {p,bytes,digest:restoreHash(bytes)};
 }
 async bundle(s:VerifiedScope,p:RestoreStageProgress,index:number){const pin=p.completed[index];demand(pin&&pin.index===index,'INTEGRITY_FAILED');
  const bytes=await this.readFile(resolve(this.directory(s,p.operationId,p.actorId),'i-'+index),4*LIMITS.backupBytes);demand(bytes.length===pin.bytes&&restoreHash(bytes)===pin.digest,'INTEGRITY_FAILED');
  return RestoreStageItemSchema.parse(JSON.parse(bytes.toString()));
 }
}
/** Additive availability overlay. Canonical heads, original witnesses, lineage,
 * admissions, receipts, grants and the separately anchored authority stay in PG.
 * Target AES bindings use the new generation; no old head/control is imported.
 * Current N+1 missing from this archive is blocked-freshness, never archived N.
 * No rehydration, rebuild, credential, method or external-effect port exists. */
export class RestoreActivationRepository {
 readonly stage:RestoreStageReader;
 constructor(readonly imported:RestoreImportRepository,readonly admission:LocalSaveAdmission,readonly hooks:RestoreActivationHooks={}){this.stage=new RestoreStageReader(imported);}
 get backup(){return this.imported.backup;}
 async fresh(tx:SqlTransaction,s:VerifiedScope,sessionId:string,expiresAt:string){const a=this.backup.graph.authority;
  await a.check(tx,s,'restore',expiresAt);await a.check(tx,s,'read',expiresAt);await a.assertCurrent(tx,s,{purpose:'maintenance',sessionId,expiresAt});return a.check(tx,s,'restore',expiresAt);}
 ref(i:RestoreItem){return GraphRefSchema.parse(i.logical?.kind==='draft'?{class:'draft',id:i.logical.id,revision:i.logical.revision,witness:i.logical.indexWitness}:{class:i.binding.class,id:i.binding.id,revision:i.binding.revision,witness:i.witness});}
 async reconcile(tx:SqlTransaction,s:VerifiedScope,i:RestoreItem):Promise<ReturnType<typeof States.parse>>{
  const b=i.binding,a=this.backup.graph.authority,anchor=await a.check(tx,s,'read');
  if(b.class!=='ask'){
   const row=(await tx.query(`SELECT h.*,e.source_task_id FROM fabric.storage_current_heads h JOIN fabric.storage_entities e USING(tenant_id,space_id,class,id,revision)
    WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class=$3 AND h.id=$4 ORDER BY h.revision DESC LIMIT 1`,[s.tenantId,s.spaceId,b.class,b.id])).rows[0];
   demand(row,'AUTHORITY_UNAVAILABLE');if(Number(row['revision'])!==b.revision)return 'blocked-freshness';
   demand(row['witness']===i.witness&&row['key_id']===b.keyId&&row['generation']===b.generation&&row['source_task_id']===i.sourceTaskId&&(row['expires_at'] as Date).toISOString()===i.expiresAt,'INTEGRITY_FAILED');
  }
  const row=(await tx.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[s.tenantId,s.spaceId,anchor.policyRevision])).rows[0];demand(row,'AUTHORITY_UNAVAILABLE');
  const policy=StoragePolicySchema.parse(row),kind=i.logical?.kind??b.class;
  const period=policy.periods[kind as keyof typeof policy.periods];demand(period,'RETENTION_RESTRICTED');
  if((await tx.query('SELECT clock_timestamp()<$1::timestamptz AND clock_timestamp()<$2::timestamptz+($3::numeric * interval \'1 second\') AS live',[i.expiresAt,i.acceptedAt,period])).rows[0]?.['live']!==true)return 'restricted';
  if(i.logical){const l=i.logical,r=(await tx.query('SELECT artifact_id,index_witness,revision FROM fabric.storage_volume_versions WHERE tenant_id=$1 AND space_id=$2 AND kind=$3 AND id=$4 ORDER BY revision DESC LIMIT 1',[s.tenantId,s.spaceId,l.kind,l.id])).rows[0];demand(r,'AUTHORITY_UNAVAILABLE');if(Number(r['revision'])!==l.revision)return 'blocked-freshness';demand(r['artifact_id']===b.id&&r['index_witness']===l.indexWitness,'INTEGRITY_FAILED');}
  try{const refs=await this.backup.graph.assertCurrent(tx,s,this.ref(i));
   for(const ref of refs){const r=(await tx.query(`SELECT n.expires_at,coalesce(v.kind,n.class) AS kind,coalesce(h.accepted_at,ar.accepted_at) AS accepted_at
    FROM fabric.storage_graph_nodes n LEFT JOIN fabric.storage_current_heads h ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(n.tenant_id,n.space_id,n.backing_class,n.backing_id,n.backing_revision)
    LEFT JOIN fabric.storage_ask_receipts ar ON (ar.tenant_id,ar.space_id,ar.id)=(n.tenant_id,n.space_id,n.ask_id)
    LEFT JOIN fabric.storage_volume_versions v ON (v.tenant_id,v.space_id,v.artifact_id)=(n.tenant_id,n.space_id,n.backing_id)
    WHERE (n.tenant_id,n.space_id,n.class,n.id,n.revision) = ($1,$2,$3,$4,$5)`,[s.tenantId,s.spaceId,ref.class,ref.id,ref.revision])).rows[0];
    demand(r&&r['accepted_at'],'AUTHORITY_UNAVAILABLE');const p=policy.periods[String(r['kind']) as keyof typeof policy.periods];demand(p,'RETENTION_RESTRICTED');
    if((await tx.query("SELECT clock_timestamp()<$1::timestamptz AND clock_timestamp()<$2::timestamptz+($3::numeric * interval '1 second') AS live",[r['expires_at'],r['accepted_at'],p])).rows[0]?.['live']!==true)return 'restricted';
   }return 'eligible';}
  catch(e){if(e instanceof IdentityError&&e.code==='AUDIENCE_DENIED')return 'restricted';if(e instanceof StorageError&&['RETENTION_RESTRICTED','CONTENT_UNAVAILABLE','UNAUTHORIZED'].includes(e.code))return 'restricted';if(e instanceof StorageError&&e.code==='STALE_REVISION')return 'blocked-freshness';throw e;}
 }
 async #states(tx:SqlTransaction,s:VerifiedScope,items:readonly RestoreItem[]){const states:ReturnType<typeof EntrySchema.parse>[]=[];for(const [index,i] of items.entries())states.push({index,state:await this.reconcile(tx,s,i)});return states;}
 async activate(s:VerifiedScope,raw:unknown){const c=parseCommand(RestoreCommandSchema,raw);demand(c.expectedRevision===0,'STALE_REVISION');
  return this.backup.uow.withScope(s,async tx=>{
   await this.fresh(tx,s,c.sessionId,c.expiresAt);await this.hooks.locked?.(tx);await this.fresh(tx,s,c.sessionId,c.expiresAt);
   await assertRestoreNotRolledBack(tx,s,c.targetId);
   const {p,digest:stageDigest}=await this.stage.progress(tx,s,c.targetId),plain=Buffer.from(JSON.stringify(c));let fingerprint;
   try{fingerprint=await this.imported.crypto.fingerprint({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:c.targetId,revision:1,generation:p.generation,keyId:p.keyId},'command',plain);}finally{plain.fill(0);}
   demand(p.backupId===c.backupId&&p.originalKey===c.key&&p.commandFingerprint===fingerprint,'IDEMPOTENCY_CONFLICT');
   demand(!(await tx.query('SELECT 1 FROM fabric.storage_restore_activations WHERE tenant_id=$1 AND space_id=$2 AND (operation_id=$3 OR (actor_id=$4 AND original_key=$5))',[s.tenantId,s.spaceId,c.targetId,s.actorId,c.key])).rowCount,'IDEMPOTENCY_CONFLICT');
   const borrowed=new BorrowedUnitOfWork(s,tx);let inventory;
   try{const b=this.backup,owner=new BackupConfirmationRepository(borrowed,b.journal,b.native,b.graph,b.crypto,b.keys,b.root),archive=await owner.restoreCandidate(s,{schemaVersion:1,sessionId:c.sessionId,backupId:c.backupId,expiresAt:c.expiresAt});
    inventory=validateRestoreInventory(archive.inventory);demand(archive.archiveDigest===p.archiveDigest&&inventory.items.length===p.expectedItems&&inventory.decodedBytes===p.decodedBytes,'INTEGRITY_FAILED');
   }finally{borrowed.close();}
   const states=await this.#states(tx,s,inventory.items);
   for(const [index,i] of inventory.items.entries()){
    const bundle=await this.stage.bundle(s,p,index);demand(restoreSame(bundle.original,i.envelope)&&restoreSame(bundle.originalManifest,i.manifest),'INTEGRITY_FAILED');
    const binding=BindingSchema.parse({...i.binding,generation:p.generation,keyId:p.keyId});
    demand(restoreSame(BindingSchema.parse({schemaVersion:bundle.target.schemaVersion,tenantId:bundle.target.tenantId,spaceId:bundle.target.spaceId,class:bundle.target.class,id:bundle.target.id,revision:bundle.target.revision,generation:bundle.target.generation,keyId:bundle.target.keyId}),binding)&&Boolean(bundle.targetManifest)===Boolean(i.manifest),'INTEGRITY_FAILED');
    if(states[index]!.state!=='eligible')continue;
    demand(await this.reconcile(tx,s,i)==='eligible','RESTORE_BLOCKED');const old=await this.imported.crypto.open(i.binding,i.envelope),target=await this.imported.crypto.open(binding,bundle.target);let om:Buffer|null=null,tm:Buffer|null=null;
    try{om=i.manifest?await this.imported.crypto.open(i.binding,i.manifest):null;tm=bundle.targetManifest?await this.imported.crypto.open(binding,bundle.targetManifest):null;
     validateRestorePayload(inventory,i,old,om);demand(old.equals(target),'INTEGRITY_FAILED');
     if(tm){const {RestoreCipherManifestSchema}=await import('./restore-validation.js'),o=RestoreCipherManifestSchema.parse(JSON.parse(om!.toString())),m=RestoreCipherManifestSchema.parse(JSON.parse(tm.toString()));
      demand(restoreSame(m.binding,binding)&&m.objectDigest===restoreHash(JSON.stringify(bundle.target))&&m.objectSize===Buffer.byteLength(JSON.stringify(bundle.target)),'INTEGRITY_FAILED');
      const desc=JSON.parse(o.description);demand(restoreSame(JSON.parse(m.description),{...desc,generation:p.generation}),'INTEGRITY_FAILED');}
    }finally{old.fill(0);target.fill(0);om?.fill(0);tm?.fill(0);}
   }
   await this.hooks.beforeCommit?.(tx);const anchor=await this.fresh(tx,s,c.sessionId,c.expiresAt);
   demand(restoreSame(await this.#states(tx,s,inventory.items),states),'RESTORE_BLOCKED');
   demand((await this.stage.progress(tx,s,c.targetId)).digest===stageDigest,'INTEGRITY_FAILED');
   for(const index of p.completed.keys())await this.stage.bundle(s,p,index);
   const result=RestoreResultSchema.parse({schemaVersion:1,operationId:c.targetId,backupId:c.backupId,generation:p.generation,state:'ready',serving:true,restrictionEpoch:anchor.epoch,lastSuccessfulCheckpoint:inventory.lastSuccessfulCheckpoint,
    unavailableEntityIds:[...new Set(states.filter(v=>v.state!=='eligible').map(v=>inventory.items[v.index]!.binding.id))],preserved:['confirmed-content','current-authority','original-receipts'],notExecuted:['external-effects','credentials','approvals','unsent-drafts','methods'],nextAction:'read-eligible-content'});
   const metadata=MetadataSchema.parse({schemaVersion:1,inventory,states}),bytes=Buffer.from(JSON.stringify(metadata));let encrypted;
   try{encrypted=await this.imported.crypto.seal({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id:c.targetId,revision:1,generation:p.generation,keyId:p.keyId},bytes);}finally{bytes.fill(0);}
   await tx.query('SELECT fabric.storage_activate_restore($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)',[c.key,c.targetId,c.backupId,p.generation,p.keyId,p.rootId,fingerprint,stageDigest,anchor.epoch,JSON.stringify(states.filter(v=>v.state==='eligible').map(v=>({class:inventory.items[v.index]!.binding.class,id:inventory.items[v.index]!.binding.id,revision:inventory.items[v.index]!.binding.revision,witness:inventory.items[v.index]!.witness}))),JSON.stringify(encrypted),JSON.stringify(result)]);await this.hooks.metadataImported?.(tx);
   await this.fresh(tx,s,c.sessionId,c.expiresAt);demand(restoreSame(await this.#states(tx,s,inventory.items),states),'RESTORE_BLOCKED');await this.hooks.beforeActivationCommit?.(tx);return result;
  }).catch(restoreFailure);
 }
 async #active(tx:SqlTransaction,s:VerifiedScope,id:string){await this.backup.graph.authority.check(tx,s,'read');await this.stage.rootCheck();
  await assertRestoreNotRolledBack(tx,s,id);
  const r=(await tx.query('SELECT * FROM fabric.storage_restore_activations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[s.tenantId,s.spaceId,id])).rows[0];demand(r&&r['root_id']===this.stage.root.rootId,'RESTORE_BLOCKED');
  const {p,digest:pin}=await this.stage.progress(tx,s,id,uuid.parse(r['actor_id']));demand(r['generation']===p.generation&&r['key_id']===p.keyId&&r['stage_digest']===pin&&r['original_key']===p.originalKey&&r['command_fingerprint']===p.commandFingerprint,'INTEGRITY_FAILED');
  const bytes=await this.imported.crypto.open({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'backup',id,revision:1,generation:p.generation,keyId:p.keyId},r['metadata']);let m;
  try{m=MetadataSchema.parse(JSON.parse(bytes.toString()));}finally{bytes.fill(0);}
  demand(m.states.length===p.expectedItems&&m.inventory.items.length===p.expectedItems&&m.states.every((v,i)=>v.index===i),'INTEGRITY_FAILED');return {p,m,r};
 }
 /** Borrowed installed read. The normal app UoW owns scope/commit; no staged
  * reader, FS authority or direct SQL permission is exposed to the requester. */
 async readInTransaction(tx:SqlTransaction,s:VerifiedScope,id:string,raw:unknown):Promise<Buffer>{try{const ref=GraphRefSchema.parse(raw),{p,m}=await this.#active(tx,s,uuid.parse(id));
  const index=m.inventory.items.findIndex(i=>restoreSame(this.ref(i),ref));demand(index>=0,'CONTENT_UNAVAILABLE');const i=m.inventory.items[index]!;
  demand(m.states[index]!.state==='eligible','CONTENT_UNAVAILABLE');demand(await this.reconcile(tx,s,i)==='eligible','CONTENT_UNAVAILABLE');
  const bundle=await this.stage.bundle(s,p,index);demand(restoreSame(bundle.original,i.envelope)&&restoreSame(bundle.originalManifest,i.manifest),'INTEGRITY_FAILED');
  const bytes=await this.imported.crypto.open({...i.binding,generation:p.generation,keyId:p.keyId},bundle.target);
  try{demand(await this.reconcile(tx,s,i)==='eligible','CONTENT_UNAVAILABLE');demand((await this.#active(tx,s,id)).r['stage_digest']===restoreHash(await this.stage.readFile(resolve(this.stage.directory(s,id,p.actorId),'progress'),2*LIMITS.commandBytes)),'INTEGRITY_FAILED');await this.stage.bundle(s,p,index);return bytes;}catch(e){bytes.fill(0);throw e;}
 }catch(e){return restoreFailure(e);}}
 async read(s:VerifiedScope,raw:unknown){const c=RestoredReadSchema.parse(raw);return this.backup.uow.withScope(s,tx=>this.readInTransaction(tx,s,c.operationId,c.ref)).catch(restoreFailure);}
 async statuses(s:VerifiedScope,id:string){return this.backup.uow.withScope(s,async tx=>{const {m}=await this.#active(tx,s,uuid.parse(id));return this.#states(tx,s,m.inventory.items);}).catch(restoreFailure);}
 /** Native broker receives this installed per-operation reader, not an archive
  * supplied function. Canonical metadata discovery/admission/charge/disclosure
  * stays in the existing SourceRecallBroker and NativeAskRepository owners. */
 canonicalReader(operationId:string){const id=uuid.parse(operationId);return {recall:async(tx:SqlTransaction,s:VerifiedScope,raw:unknown):Promise<Knowledge>=>{
  const ref=KnowledgeReadRefSchema.parse(raw),head=await this.backup.graph.authority.entity(tx,s,ref),row=(await tx.query('SELECT * FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,ref.id,ref.revision])).rows[0];
  demand(row&&row['witness']===ref.witness&&row['key_id']===head['key_id']&&row['generation']===head['generation'],'INTEGRITY_FAILED');await this.admission.recallEligibility(tx,s,row);await this.admission.conflictEligibility(tx,s,row);
  const sourceRef={class:'source',id:row['source_id'],revision:Number(row['source_revision']),witness:row['source_witness']},source=await this.readInTransaction(tx,s,id,sourceRef);let sp;
  try{sp=SourcePayloadSchema.parse(JSON.parse(source.toString()));demand(restoreHash(sp.narrative)===sp.contentDigest,'INTEGRITY_FAILED');}finally{source.fill(0);}
  const bytes=await this.readInTransaction(tx,s,id,ref);let k;
  try{k=KnowledgeSchema.parse(JSON.parse(bytes.toString()));}finally{bytes.fill(0);}
  demand(k.tenantId===s.tenantId&&k.spaceId===s.spaceId&&k.id===ref.id&&k.revision===ref.revision&&k.assertedBy===row['actor_id']&&k.status===row['status']&&k.expiresAt===(row['expires_at'] as Date).toISOString()&&k.source.sourceId===row['source_id']&&k.source.revision===Number(row['source_revision'])&&k.source.sourceTaskId===row['source_task_id']&&k.source.digest===sp.contentDigest,'INTEGRITY_FAILED');
  await this.admission.inspect(tx,s,k,row);await this.admission.recallEligibility(tx,s,row);await this.admission.conflictEligibility(tx,s,row);await this.backup.graph.authority.entity(tx,s,ref);return k;
 }};}
}
