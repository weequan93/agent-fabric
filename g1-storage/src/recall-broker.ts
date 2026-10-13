import { object,uuid,timestamp,revision,list,refined } from './decoder.js';
import { SelectorSchema,BindingSchema,QueryControlsSchema } from './schema.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError } from './errors.js';
import { KnowledgeReadRefSchema,KnowledgeSaveRepository,type LocalSaveAdmission,type SaveKeyOwner } from './knowledge-save.js';
import { StorageAuthorityRepository,type EpochAnchor } from './authority.js';
import type { CryptoStore } from './crypto-store.js';
import type { Knowledge } from './contracts.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,NativeSnapshot } from './owners.js';

export const RecallRequestSchema=object({sessionId:uuid,expiresAt:timestamp,selector:SelectorSchema,
 attachmentIds:refined(list(uuid,LIMITS.selected),v=>new Set(v).size===v.length)});
type Request=ReturnType<typeof RecallRequestSchema.parse>;
type Ref=ReturnType<typeof KnowledgeReadRefSchema.parse>;
export interface RecallControlsOwner {
 read(tx:SqlTransaction,scope:VerifiedScope,sessionId:string):Promise<{revision:number;taskId:string;runId:string;controls:ReturnType<typeof QueryControlsSchema.parse>}>;
}
/** Explicit installed Task attachment grants, independent of query toggles.
 * IDs in a request are not grants. No default attachment resolver exists. */
export interface RecallAttachmentOwner {
 assert(tx:SqlTransaction,scope:VerifiedScope,session:NativeSnapshot,ids:readonly string[]):Promise<void>;
}
/** Optional metadata hint only. No payload, requester authority or ranking is
 * accepted from the index. Canonical discovery does not depend on this port. */
export interface RecallIndexOwner {
 inspect(tx:SqlTransaction,scope:VerifiedScope):Promise<unknown>;
}
const IndexSchema=object({epoch:revision,watermark:revision,refs:list(KnowledgeReadRefSchema,LIMITS.nodes)});
type Limitation='index-unavailable'|'index-lag'|'canonical-scan-bound'|'current-evidence-gap'|'older-recall-disabled'|'attachments-disabled'|'disputed-evidence';
type Candidate={row:Record<string,unknown>;ref:Ref;audience:Awaited<ReturnType<StorageAuthorityRepository['currentAudience']>>};
export interface RecallSelection {
 readonly status:'eligible'|'evidence-gap'|'disputed';
 readonly records:readonly Knowledge[];
 readonly selected:readonly {ref:Ref;audience:Candidate['audience'];reason:'exact-id'|'exact-subject'|'authorized-tail'}[];
 readonly limitations:readonly Limitation[];
 readonly controlsRevision:number;
 readonly indexWatermark:number;
 readonly anchor:EpochAnchor;
}

/** Canonical source broker. It accepts no alternate Space, audience, generation,
 * policy, check proof, cached body or historical witness from the caller.
 * All metadata is reloaded under the enrolled Space barrier before selecting,
 * ranking or opening bytes. Only direct canonical knowledge -> source lineage
 * is supported here; derived/cache/summary bodies cannot become evidence. */
export class SourceRecallBroker {
 readonly #hints=new Map<string,readonly Ref[]>();
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:StorageAuthorityRepository,
  readonly crypto:CryptoStore,readonly keys:SaveKeyOwner,readonly admission:LocalSaveAdmission,
  readonly canonical:KnowledgeSaveRepository,readonly controls:RecallControlsOwner,
  readonly attachments?:RecallAttachmentOwner,readonly index?:RecallIndexOwner,
  readonly restoredCanonical?:{recall(tx:SqlTransaction,scope:VerifiedScope,ref:Ref):Promise<Knowledge>}){}
 async retrieve(scope:VerifiedScope,raw:unknown):Promise<RecallSelection>{
  const c=RecallRequestSchema.parse(raw);return this.uow.withScope(scope,tx=>this.retrieveInTransaction(tx,scope,c));
 }
 /** Borrow the native/accounting owner's authenticated transaction; never
  * create a nested transaction or disclose an answer from this method. */
 async retrieveInTransaction(tx:SqlTransaction,scope:VerifiedScope,raw:unknown):Promise<RecallSelection>{
  const c=RecallRequestSchema.parse(raw);
  await this.authority.assertCurrent(tx,scope,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
  const session=await this.authority.native.load(tx,scope,c.sessionId);
  const control=await this.controls.read(tx,scope,c.sessionId),flags=QueryControlsSchema.parse(control.controls);
  demand(uuid.parse(control.taskId)===session.binding.taskId&&uuid.parse(control.runId)===session.binding.runId,'CHECK_BINDING_MISMATCH');
  demand(Number.isSafeInteger(control.revision)&&control.revision>0,'AUTHORITY_UNAVAILABLE');
  const anchor=await this.authority.check(tx,scope,'read',c.expiresAt),limits=new Set<Limitation>();
  const installed=await this.keys.resolve(tx,scope),generation=uuid.parse(installed.generation),keyId=uuid.parse(installed.keyId);
  const finalCheck=async()=>{
   await this.authority.assertCurrent(tx,scope,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
   const final=await this.controls.read(tx,scope,c.sessionId);demand(JSON.stringify(final)===JSON.stringify(control),'CHECK_BINDING_MISMATCH');
   const currentKeys=await this.keys.resolve(tx,scope);demand(currentKeys.generation===generation&&currentKeys.keyId===keyId,'CONTENT_UNAVAILABLE');
   const currentAnchor=await this.authority.check(tx,scope,'read',c.expiresAt);demand(JSON.stringify(currentAnchor)===JSON.stringify(anchor),'AUTHORITY_UNAVAILABLE');
  };
  let fingerprint:string|undefined;
  if(c.selector.kind==='subject'){
   const b=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'knowledge',id:c.sessionId,revision:1,generation,keyId});
   const bytes=Buffer.from(c.selector.value);try{fingerprint=await this.crypto.fingerprint(b,'subject',bytes);}finally{bytes.fill(0);}
  }
  // Optional retained hints contain only exact opaque refs; they cannot bypass
  // any current check, grant or canonical lookup (including on cache hits).
  const hintKey=JSON.stringify([scope.tenantId,scope.spaceId,scope.actorId,c.sessionId,control.revision,
   c.selector.kind,c.selector.kind==='subject'?fingerprint:c.selector.kind==='id'?c.selector.value:c.selector.limit,c.attachmentIds]);
  const previous=this.#hints.get(hintKey);
  let watermark=0,index:ReturnType<typeof IndexSchema.parse>|undefined;
  try{if(!this.index)throw new Error();index=IndexSchema.parse(await this.index.inspect(tx,scope));watermark=index.watermark;}
  catch{limits.add('index-unavailable');}
  // Revalidate after potentially blocked/unavailable index work. An index
  // outage is recoverable; an authority outage is never recoverable by cache.
  await this.authority.assertCurrent(tx,scope,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
  const attachmentIds=flags.attachments?c.attachmentIds:[];
  if(c.attachmentIds.length&&!flags.attachments)limits.add('attachments-disabled');
  if(attachmentIds.length){demand(scope.grants.includes('task:read')&&this.attachments,'UNAUTHORIZED');await this.attachments.assert(tx,scope,session,attachmentIds);}
  if(!flags.olderRecall)limits.add('older-recall-disabled');
  // SQL reads only this immutable session's scope. Subject is an HMAC token,
  // not a title/plaintext LIKE search or global content digest. Scan beyond the
  // output cap so ineligible recent rows cannot silently hide older survivors.
  const rows=(await tx.query(`SELECT k.*,h.witness AS head_witness,h.key_id AS head_key,h.generation AS head_generation
   FROM fabric.storage_knowledge_revisions k JOIN fabric.storage_current_heads h
    ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(k.tenant_id,k.space_id,k.class,k.id,k.revision)
   WHERE k.tenant_id=$1 AND k.space_id=$2
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads n WHERE (n.tenant_id,n.space_id,n.class,n.id)=(h.tenant_id,h.space_id,h.class,h.id) AND n.revision>h.revision)
    AND ($3::uuid IS NULL OR k.id=$3) AND ($4::text IS NULL OR k.subject_fingerprint=$4)
    AND ($5::boolean OR k.source_task_id=$6 OR k.id=ANY($7::uuid[]))
   ORDER BY k.accepted_at DESC,k.id LIMIT 513`,[scope.tenantId,scope.spaceId,c.selector.kind==='id'?c.selector.value:null,
    fingerprint??null,flags.olderRecall,session.binding.taskId,attachmentIds])).rows;
  if(rows.length>LIMITS.nodes){limits.add('canonical-scan-bound');await finalCheck();return this.#result([],[],limits,control.revision,watermark,anchor);}
  const eligible:Candidate[]=[];let disputed=false;
  for(const row of rows){
   try{
    const ref=KnowledgeReadRefSchema.parse({class:'knowledge',id:row['id'],revision:Number(row['revision']),witness:row['witness']});
    demand(row['witness']===row['head_witness']&&row['key_id']===row['head_key']&&row['generation']===row['head_generation'],'INTEGRITY_FAILED');
    await this.authority.entity(tx,scope,ref);
    demand(row['generation']===generation&&row['key_id']===keyId,'CONTENT_UNAVAILABLE');
    const source=(await tx.query('SELECT * FROM fabric.storage_sources WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,row['source_id'],row['source_revision']])).rows[0];
    demand(source,'CONTENT_UNAVAILABLE');
    demand(source['witness']===row['source_witness']&&source['source_task_id']===row['source_task_id'],'INTEGRITY_FAILED');
    const sourceHead=await this.authority.entity(tx,scope,{class:'source',id:source['source_id'],revision:Number(source['revision']),witness:source['witness']});
    demand(source['generation']===sourceHead['generation']&&source['key_id']===sourceHead['key_id'],'INTEGRITY_FAILED');
    demand(source['generation']===generation,'CONTENT_UNAVAILABLE');
    // Legacy v14 payload-only validity cannot meet the broker's pre-open
    // contract. Preserve history; require independently admitted temporal and
    // provenance metadata rather than decrypting to discover its validity.
    const temporal=(await tx.query('SELECT * FROM fabric.storage_knowledge_admissions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,row['id'],row['revision']])).rows[0];
    demand(temporal,'CONTENT_UNAVAILABLE');
    demand(temporal['status']===row['status']&&temporal['source_id']===row['source_id']&&Number(temporal['source_revision'])===Number(row['source_revision'])&&temporal['source_witness']===row['source_witness'],'INTEGRITY_FAILED');
    await this.admission.recallEligibility(tx,scope,row);
    if(row['status']==='disputed'){disputed=true;continue;}
    demand(['user-asserted','source-verified'].includes(String(row['status'])),'CONTENT_UNAVAILABLE');
    try{await this.admission.conflictEligibility(tx,scope,row);}catch(e){if(e instanceof StorageError&&e.code==='CONTENT_UNAVAILABLE'){disputed=true;continue;}throw e;}
    eligible.push({row,ref,audience:await this.authority.currentAudience(tx,scope,uuid.parse(source['source_task_id']))});
   }catch(e){
    if(e instanceof StorageError&&['CONTENT_UNAVAILABLE','UNAUTHORIZED','STALE_REVISION','RETENTION_RESTRICTED'].includes(e.code)){limits.add('current-evidence-gap');continue;}throw e;
   }
  }
  // Detect missing/stale index coverage without trusting its ranked IDs. Late
  // jobs or cached old heads cannot remove an acknowledged canonical decision.
  const refs=eligible.map(e=>e.ref);
  const same=(a:Ref,b:Ref)=>a.id===b.id&&a.revision===b.revision&&a.witness===b.witness;
  if(index&&(index.epoch!==anchor.epoch||refs.some(r=>!index!.refs.some(i=>same(r,i)))))limits.add('index-lag');
  if(previous&&previous.some(p=>!refs.some(r=>same(p,r))))limits.add('current-evidence-gap');
  this.#hints.set(hintKey,Object.freeze(refs.map(r=>Object.freeze({...r}))));
  if(this.#hints.size>128)this.#hints.delete(this.#hints.keys().next().value!);
  if(disputed){limits.add('disputed-evidence');if(c.selector.kind!=='tail'){await finalCheck();return this.#result([],[],limits,control.revision,watermark,anchor,true);}}
  const max=c.selector.kind==='tail'?c.selector.limit:LIMITS.selected;
  if(eligible.length>max)limits.add('canonical-scan-bound');
  const chosen=eligible.slice(0,max),records:Knowledge[]=[];
  // Every candidate above is authorized before this first open. Canonical
  // recall repeats current source/head/validity/conflict checks around decrypt.
  const borrowed:AsyncUnitOfWork={withScope:async(s,work)=>{demand(s===scope,'UNAUTHORIZED');return work(tx);}};
  const reader=new KnowledgeSaveRepository(borrowed,this.canonical.journal,this.authority.native,this.crypto,this.keys,this.admission);
  for(const item of chosen){const record=this.restoredCanonical?await this.restoredCanonical.recall(tx,scope,item.ref):await reader.recall(scope,item.ref);
   if(c.selector.kind==='subject')demand(record.subject===c.selector.value,'INTEGRITY_FAILED');records.push(record);}
  await finalCheck();
  return this.#result(records,chosen.map(v=>({ref:v.ref,audience:v.audience,reason:c.selector.kind==='id'?'exact-id' as const:c.selector.kind==='subject'?'exact-subject' as const:'authorized-tail' as const})),limits,control.revision,watermark,anchor);
 }
 #result(records:Knowledge[],selected:RecallSelection['selected'],limitations:Set<Limitation>,controlsRevision:number,indexWatermark:number,anchor:EpochAnchor,disputed=false):RecallSelection{
  if(!records.length&&!disputed)limitations.add('current-evidence-gap');
  return {status:disputed?'disputed':records.length?'eligible':'evidence-gap',records,selected,
   limitations:[...limitations],controlsRevision,indexWatermark,anchor};
 }
 async exportToPersonal(scope:VerifiedScope,raw:unknown):Promise<never>{
  const c=object({sessionId:uuid,expiresAt:timestamp,destinationSpaceId:uuid}).parse(raw);
  return this.uow.withScope(scope,async tx=>{
   await this.authority.assertCurrent(tx,scope,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
   // No declared cross-Space/export dependency path exists in this profile.
   // Query toggles and billing membership cannot grant it or write a copy.
   throw new StorageError('REQUIRED_CAPABILITY_UNSUPPORTED');
  });
 }
}
