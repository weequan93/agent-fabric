import { DatabaseError } from 'pg';
import { createHash } from 'node:crypto';
import { object,uuid,positive,digest,list,refined,timestamp,nullable,enumeration,version,body } from './decoder.js';
import { BindingSchema,CipherEnvelopeSchema } from './schema.js';
import { HeadMaterialSchema,type HeadMaterial } from './head-material.js';
import { HeadPublicationRepository,type HeadPublicationPrerequisite } from './head-publication.js';
import { EpochAnchorSchema,StorageAuthorityRepository } from './authority.js';
import { EpochWitnessJournal } from './epoch-journal.js';
import { CryptoStore } from './crypto-store.js';
import { sourceContentWitness } from './source-content.js';
import type { SaveKeyOwner } from './knowledge-save.js';
import { demand,StorageError } from './errors.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,NativeRepository } from './owners.js';

export const GraphRefSchema=object({class:enumeration('source','knowledge','artifact','draft','summary','index','cache','ask'),id:uuid,revision:positive,witness:digest});
export type GraphRef=ReturnType<typeof GraphRefSchema.parse>;
const identity=(r:GraphRef)=>JSON.stringify([r.class,r.id,r.revision]);
export const GraphDependenciesSchema=refined(list(GraphRefSchema,64),refs=>new Set(refs.map(identity)).size===refs.length);
const CommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,materialId:uuid,expected:nullable(GraphRefSchema)});
const binary=refined(body,value=>{const decoded=Buffer.from(value,'base64');try{return decoded.length<=524288&&decoded.toString('base64')===value;}finally{decoded.fill(0);}});
export const GraphDerivedPayloadSchema=object({schemaVersion:version,bytes:binary,dependencies:GraphDependenciesSchema});
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sort=(refs:readonly GraphRef[])=>[...refs].sort((a,b)=>a.class.localeCompare(b.class)||a.id.localeCompare(b.id)||a.revision-b.revision);
export interface DerivedMaterialOwner {
 /** Installed admission extension; never supplied by public command JSON. */
 validate?(tx:SqlTransaction,scope:VerifiedScope,materialId:string,authority:StorageAuthorityRepository):Promise<void>;
 record?(tx:SqlTransaction,scope:VerifiedScope,commandKey:string,head:HeadMaterial):Promise<void>;
 inspectOriginal?(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>):Promise<void>;
 /** Installed opaque preparation, never caller JSON, model output authority or
  * a worker admission/retry. The parent bytes must already be eligible. */
 resolve(tx:SqlTransaction,scope:VerifiedScope,materialId:string):Promise<{
  class:'summary'|'index'|'cache';id:string;revision:number;sourceTaskId:string;expiresAt:string;
  bytes:Buffer;dependencies:readonly GraphRef[];
 }|undefined>;
}
export interface AskGraphCacheOwner {
 /** Supplemental sensitive dependencies from an installed cache/index owner.
  * Mandatory native knowledge/source edges remain independently canonical. */
 resolve(tx:SqlTransaction,scope:VerifiedScope,receiptId:string):Promise<readonly GraphRef[]>;
}

/** Exact scoped dependency owner. Graph serving never falls back to a missing
 * inventory, stale cache, historical head or an absent independent anchor.
 * Closure SQL visits vertices once, bounds512, then topologically checks cycles
 * and longest path16. Payloads are not queried until this guard succeeds. */
export class DependencyGraphRepository {
 readonly authority:StorageAuthorityRepository;
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:NativeRepository,
  readonly crypto:CryptoStore,readonly keys:SaveKeyOwner){this.authority=new StorageAuthorityRepository(journal,native);}
 async ref(scope:VerifiedScope,raw:unknown):Promise<GraphRef>{
  const r=object({class:GraphRefSchemaClass,id:uuid,revision:positive}).parse(raw);
  return this.uow.withScope(scope,async tx=>{await this.authority.check(tx,scope,'read');const node=(await tx.query('SELECT witness FROM fabric.storage_graph_nodes WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5',[scope.tenantId,scope.spaceId,r.class,r.id,r.revision])).rows[0];demand(node,'CONTENT_UNAVAILABLE');return GraphRefSchema.parse({...r,witness:node['witness']});});
 }
 async #closure(tx:SqlTransaction,s:VerifiedScope,ref:GraphRef,descendants=false):Promise<GraphRef[]>{
  try{const result=(await tx.query('SELECT fabric.storage_graph_closure($1,$2,$3,$4,$5) AS refs',[ref.class,ref.id,ref.revision,ref.witness,descendants])).rows[0]?.['refs'];
   const refs=list(GraphRefSchema,512,1).parse(result);demand(new Set(refs.map(identity)).size===refs.length,'INTEGRITY_FAILED');return sort(refs);
  }catch(e){if(e instanceof DatabaseError&&e.code==='23514')throw new StorageError('INTEGRITY_FAILED');throw e;}
 }
 async #snapshot(tx:SqlTransaction,s:VerifiedScope,refs:readonly GraphRef[]){
  const rows=(await tx.query(`WITH refs AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(class text,id uuid,revision numeric,witness text))
   SELECT n.*,h.revision AS head_revision,h.witness AS head_witness,h.key_id AS head_key,h.generation AS head_generation,
    origin.source_task_id AS head_task,h.expires_at AS head_expires,a.task_id AS ask_task,a.key_id AS ask_key,a.generation AS ask_generation,a.expires_at AS ask_expires,
    v.revision AS draft_revision,v.index_witness AS draft_witness,v.artifact_id AS draft_artifact,
    clock_timestamp()<n.expires_at AS live,
    EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(n.tenant_id,n.space_id,n.backing_class,n.backing_id) AND d.revision>=n.backing_revision)
     OR EXISTS(SELECT 1 FROM fabric.storage_restrictions d WHERE n.class='source' AND (d.tenant_id,d.space_id,d.source_id,d.source_revision)=(n.tenant_id,n.space_id,n.id,n.revision)) AS restricted,
    k.status,ad.valid_from,ad.valid_until,ad.check_id,
    CASE WHEN n.class='knowledge' THEN ad.id IS NOT NULL AND k.status IN('user-asserted','source-verified') AND ad.status=k.status
      AND ad.valid_from<=clock_timestamp() AND (ad.valid_until IS NULL OR ad.valid_until>clock_timestamp())
      AND (k.status<>'source-verified' OR EXISTS(SELECT 1 FROM fabric.storage_source_checks p WHERE (p.tenant_id,p.space_id,p.check_id)=(n.tenant_id,n.space_id,ad.check_id) AND p.expires_at>clock_timestamp()))
      AND NOT EXISTS(SELECT 1 FROM fabric.storage_knowledge_revisions other JOIN fabric.storage_knowledge_admissions oa USING(tenant_id,space_id,id,revision)
       WHERE (other.tenant_id,other.space_id,other.source_id,other.source_revision,other.subject_fingerprint)=(k.tenant_id,k.space_id,k.source_id,k.source_revision,k.subject_fingerprint)
       AND oa.claim_digest<>ad.claim_digest AND other.status IN('user-asserted','source-verified','disputed') AND other.expires_at>clock_timestamp()
       AND oa.valid_from<=clock_timestamp() AND (oa.valid_until IS NULL OR oa.valid_until>clock_timestamp())
       AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(other.tenant_id,other.space_id,'knowledge',other.id) AND newer.revision>other.revision)
       AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones deleted WHERE (deleted.tenant_id,deleted.space_id,deleted.class,deleted.id)=(other.tenant_id,other.space_id,'knowledge',other.id) AND deleted.revision>=other.revision))
     ELSE true END AS knowledge_eligible
   FROM refs r JOIN fabric.storage_graph_nodes n ON (n.class,n.id,n.revision,n.witness)=(r.class,r.id,r.revision,r.witness) AND n.tenant_id=$1 AND n.space_id=$2
   LEFT JOIN LATERAL(SELECT * FROM fabric.storage_current_heads c WHERE (c.tenant_id,c.space_id,c.class,c.id)=(n.tenant_id,n.space_id,n.backing_class,n.backing_id) ORDER BY revision DESC LIMIT 1) h ON true
   LEFT JOIN fabric.storage_entities origin ON (origin.tenant_id,origin.space_id,origin.class,origin.id,origin.revision)=(n.tenant_id,n.space_id,n.backing_class,n.backing_id,n.backing_revision)
   LEFT JOIN fabric.storage_ask_receipts a ON (a.tenant_id,a.space_id,a.id)=(n.tenant_id,n.space_id,n.ask_id)
   LEFT JOIN LATERAL(SELECT * FROM fabric.storage_volume_versions vv WHERE (vv.tenant_id,vv.space_id,vv.kind,vv.id)=(n.tenant_id,n.space_id,'draft',n.id) ORDER BY revision DESC LIMIT 1) v ON n.class='draft'
   LEFT JOIN fabric.storage_knowledge_revisions k ON n.class='knowledge' AND (k.tenant_id,k.space_id,k.id,k.revision)=(n.tenant_id,n.space_id,n.id,n.revision)
   LEFT JOIN fabric.storage_knowledge_admissions ad ON (ad.tenant_id,ad.space_id,ad.id,ad.revision)=(k.tenant_id,k.space_id,k.id,k.revision)
   ORDER BY n.class,n.id,n.revision`,[s.tenantId,s.spaceId,JSON.stringify(refs)])).rows;
  demand(rows.length===refs.length,'INTEGRITY_FAILED');
  if((await tx.query("SELECT to_regclass('fabric.storage_graph_invalidations') IS NOT NULL AS installed")).rows[0]?.['installed']===true){
   const blocked=(await tx.query('SELECT EXISTS(SELECT 1 FROM fabric.storage_graph_invalidations i JOIN jsonb_to_recordset($3::jsonb) AS r(class text,id uuid,revision numeric,witness text) USING(class,id,revision,witness) WHERE i.tenant_id=$1 AND i.space_id=$2) AS blocked',[s.tenantId,s.spaceId,JSON.stringify(refs)])).rows[0];
   demand(blocked?.['blocked']===false,'RETENTION_RESTRICTED');
  }
  const keys=await this.keys.resolve(tx,s);
  for(const n of rows){
   demand(n['live']===true&&n['restricted']===false,'RETENTION_RESTRICTED');
   demand(n['key_id']===keys.keyId&&n['generation']===keys.generation,'CONTENT_UNAVAILABLE');
   if(n['class']==='ask')demand(n['ask_task']===n['source_task_id']&&n['ask_key']===n['key_id']&&n['ask_generation']===n['generation']&&same(n['ask_expires'],n['expires_at']),'INTEGRITY_FAILED');
   else demand(Number(n['head_revision'])===Number(n['backing_revision'])&&n['head_witness']===n['backing_witness']
    &&n['head_key']===n['key_id']&&n['head_generation']===n['generation']&&n['head_task']===n['source_task_id']&&same(n['head_expires'],n['expires_at']),'STALE_REVISION');
   demand(n['knowledge_eligible']===true,'CONTENT_UNAVAILABLE');
   if(n['class']==='draft')demand(Number(n['draft_revision'])===Number(n['revision'])&&n['draft_witness']===n['witness']&&n['draft_artifact']===n['backing_id'],'STALE_REVISION');
  }
  return rows;
 }
 async assertCurrent(tx:SqlTransaction,s:VerifiedScope,raw:unknown){return this.#assert(tx,s,raw,this.authority);}
 async #assert(tx:SqlTransaction,s:VerifiedScope,raw:unknown,authority:StorageAuthorityRepository){
  const ref=GraphRefSchema.parse(raw);await authority.check(tx,s,'read');const refs=await this.#closure(tx,s,ref);
  const before=await this.#snapshot(tx,s,refs);
  for(const task of [...new Set(before.map(n=>uuid.parse(n['source_task_id'])))].sort())await authority.currentAudience(tx,s,task);
  await authority.check(tx,s,'read');demand(same(await this.#closure(tx,s,ref),refs),'INTEGRITY_FAILED');
  demand(same(await this.#snapshot(tx,s,refs),before),'INTEGRITY_FAILED');return refs;
 }
 /** Installed borrowed content/disclosure callback. The guard spans the SAME
  * UoW and repeats after all awaits. It is not a public route accepting callbacks. */
 async disclose<T>(s:VerifiedScope,raw:unknown,read:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  const ref=GraphRefSchema.parse(raw);return this.uow.withScope(s,async tx=>{await this.assertCurrent(tx,s,ref);const value=await read(tx);try{await this.assertCurrent(tx,s,ref);return value;}catch(e){if(Buffer.isBuffer(value))value.fill(0);throw e;}});
 }
 async read(s:VerifiedScope,raw:unknown):Promise<Buffer>{
  const ref=GraphRefSchema.parse(raw);demand(['summary','index','cache'].includes(ref.class),'REQUIRED_CAPABILITY_UNSUPPORTED');
  return this.disclose(s,ref,async tx=>{
   const n=(await tx.query('SELECT n.key_id,n.generation,p.envelope FROM fabric.storage_graph_nodes n JOIN fabric.storage_graph_payloads p USING(tenant_id,space_id,class,id,revision,witness) WHERE n.tenant_id=$1 AND n.space_id=$2 AND n.class=$3 AND n.id=$4 AND n.revision=$5',[s.tenantId,s.spaceId,ref.class,ref.id,ref.revision])).rows[0];demand(n&&typeof n['envelope']==='string','CONTENT_UNAVAILABLE');
   const e=CipherEnvelopeSchema.parse(JSON.parse(n['envelope']));demand(sourceContentWitness(e)===ref.witness,'INTEGRITY_FAILED');
   const b=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:ref.class,id:ref.id,revision:ref.revision,keyId:n['key_id'],generation:n['generation']});
   const bytes=await this.crypto.open(b,e);
   try{const payload=GraphDerivedPayloadSchema.parse(JSON.parse(bytes.toString('utf8')));
    const deps=(await tx.query('SELECT parent_class AS class,parent_id AS id,parent_revision AS revision,parent_witness AS witness FROM fabric.storage_graph_edges WHERE tenant_id=$1 AND space_id=$2 AND child_class=$3 AND child_id=$4 AND child_revision=$5 ORDER BY parent_class,parent_id,parent_revision',[s.tenantId,s.spaceId,ref.class,ref.id,ref.revision])).rows.map(r=>GraphRefSchema.parse({...r,revision:Number(r['revision'])}));
    demand(same(sort(payload.dependencies),sort(deps)),'INTEGRITY_FAILED');const value=Buffer.from(payload.bytes,'base64');demand(value.length<=524288&&value.toString('base64')===payload.bytes,'INTEGRITY_FAILED');return value;
   }finally{bytes.fill(0);}
  });
 }
 publisher(owner:DerivedMaterialOwner):HeadPublicationRepository{
  const prepared=new Map<string,{material:NonNullable<Awaited<ReturnType<DerivedMaterialOwner['resolve']>>>;envelope:ReturnType<typeof CipherEnvelopeSchema.parse>}>();
  const validate=async(tx:SqlTransaction,s:VerifiedScope,id:string,authority=this.authority)=>{
   const entry=prepared.get(id);demand(entry,'CONTENT_UNAVAILABLE');
   for(const p of GraphDependenciesSchema.parse(entry.material.dependencies))await this.#assert(tx,s,p,authority);
   await authority.currentAudience(tx,s,entry.material.sourceTaskId);
   await owner.validate?.(tx,s,id,authority);
  };
  const publicationAuthority=(tx:SqlTransaction,s:VerifiedScope,key:string)=>new StorageAuthorityRepository({current:async(t,sp)=>{
   demand(t===s.tenantId&&sp===s.spaceId,'UNAUTHORIZED');const p=(await this.journal.state(t,sp))?.pending;
   demand(p&&'schemaVersion' in p&&p.schemaVersion===6&&p.kind==='head-publication'&&p.actorId===s.actorId&&p.key===key,'AUTHORITY_UNAVAILABLE');
   const row=(await tx.query('SELECT epoch,xmin=(txid_current()%4294967296)::text::xid AS own FROM fabric.storage_head_publications WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[t,sp,s.actorId,key])).rows[0];
   demand(row&&row['own']===true&&Number(row['epoch'])===p.next.epoch,'AUTHORITY_UNAVAILABLE');return EpochAnchorSchema.parse(p.next);
  }},this.native);
  const prerequisite:HeadPublicationPrerequisite={prepare:async(tx,s,c,head)=>{
   await validate(tx,s,c.materialId);const entry=prepared.get(c.materialId);demand(entry,'CONTENT_UNAVAILABLE');
   return async()=>{const authority=publicationAuthority(tx,s,c.key);await validate(tx,s,c.materialId,authority);
    await tx.query('SELECT fabric.storage_graph_register_derived($1,$2,$3::jsonb)',[c.key,JSON.stringify(entry.envelope),JSON.stringify(sort(GraphDependenciesSchema.parse(entry.material.dependencies)))]);
    await this.#assert(tx,s,{class:head.class,id:head.id,revision:head.revision,witness:head.witness},authority);
    await owner.record?.(tx,s,c.key,head);await validate(tx,s,c.materialId,authority);
   };
  }};
  const Publisher=class extends HeadPublicationRepository {
   protected override async inspectOriginal(tx:SqlTransaction,s:VerifiedScope,row:Record<string,unknown>){await super.inspectOriginal(tx,s,row);await owner.inspectOriginal?.(tx,s,row);}
  };
  return new Publisher(this.uow,this.journal,this.native,{resolve:async(tx,s,id)=>{
   const material=await owner.resolve(tx,s,id);demand(material,'CONTENT_UNAVAILABLE');const deps=GraphDependenciesSchema.parse(material.dependencies);demand(deps.length>0&&material.bytes.length<=524288,'INVALID_SCHEMA');
   for(const p of deps)await this.assertCurrent(tx,s,p);await this.authority.currentAudience(tx,s,material.sourceTaskId);
   const k=await this.keys.resolve(tx,s),binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:material.class,id:material.id,revision:material.revision,...k});
   const bytes=Buffer.from(JSON.stringify(GraphDerivedPayloadSchema.parse({schemaVersion:1,bytes:material.bytes.toString('base64'),dependencies:sort(deps)})));let envelope;
   try{envelope=await this.crypto.seal(binding,bytes);}finally{bytes.fill(0);}
   prepared.set(id,{material:{...material,dependencies:sort(deps)},envelope});
   return HeadMaterialSchema.parse({tenantId:binding.tenantId,spaceId:binding.spaceId,class:binding.class,id:binding.id,revision:binding.revision,keyId:binding.keyId,generation:binding.generation,witness:sourceContentWitness(envelope),sourceTaskId:material.sourceTaskId,expiresAt:material.expiresAt});
  }},{},prerequisite);
 }
 /** Install this guard on the native receipt delivery path, in addition to
  * askUnitOfWork's same-COMMIT extra inventory binding. */
 async authorizeAskReceipt(tx:SqlTransaction,s:VerifiedScope,id:string):Promise<void>{
  const row=(await tx.query("SELECT witness FROM fabric.storage_graph_nodes WHERE tenant_id=$1 AND space_id=$2 AND class='ask' AND id=$3 AND revision=1",[s.tenantId,s.spaceId,uuid.parse(id)])).rows[0];
  demand(row,'CONTENT_UNAVAILABLE');await this.assertCurrent(tx,s,{class:'ask',id,revision:1,witness:row['witness']});
 }
 /** Installed Ask transaction adapter. Supplemental cache refs commit with the
  * real encrypted receipt; it cannot alter the native's canonical dependencies. */
 askUnitOfWork(owner:AskGraphCacheOwner):AsyncUnitOfWork{
  return {withScope:async(s,work)=>this.uow.withScope(s,async tx=>{
   const value=await work(tx);
   const receipts=(await tx.query('SELECT id FROM fabric.storage_ask_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND xmin=(txid_current()%4294967296)::text::xid',[s.tenantId,s.spaceId,s.actorId])).rows;
   for(const row of receipts){const id=uuid.parse(row['id']),refs=GraphDependenciesSchema.parse(await owner.resolve(tx,s,id));for(const ref of refs){demand(['index','cache'].includes(ref.class),'INVALID_SCHEMA');await this.assertCurrent(tx,s,ref);}await tx.query('SELECT fabric.storage_graph_bind_ask_cache($1,$2::jsonb)',[id,JSON.stringify(sort(refs))]);}
   return value;
  })};
 }
 async impact(s:VerifiedScope,raw:unknown){
  const c=object({key:uuid,sessionId:uuid,expiresAt:timestamp}).parse(raw);
  return this.uow.withScope(s,async tx=>{await this.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
   const event=(await tx.query('SELECT * FROM fabric.storage_graph_events WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows[0];demand(event,'CONTENT_UNAVAILABLE');
   await this.authority.controlAudience(tx,s,{class:event['class'],id:event['id'],revision:Number(event['revision'])});
   const jobs=(await tx.query('SELECT job_id,status,class,id,revision,witness FROM fabric.storage_graph_jobs WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4 ORDER BY class,id,revision LIMIT 513',[s.tenantId,s.spaceId,s.actorId,c.key])).rows;demand(jobs.length<=512,'INTEGRITY_FAILED');
   const root=(await tx.query('SELECT witness FROM fabric.storage_graph_nodes WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5',[s.tenantId,s.spaceId,event['class'],event['id'],event['revision']])).rows[0];
   demand(root,'CONTENT_UNAVAILABLE');const target=GraphRefSchema.parse({class:event['class'],id:event['id'],revision:Number(event['revision']),witness:root['witness']});
   const expected=(await this.#closure(tx,s,target,true)).filter(r=>identity(r)!==identity(target));
   demand(same(sort(jobs.map(j=>GraphRefSchema.parse({class:j['class'],id:j['id'],revision:Number(j['revision']),witness:j['witness']}))),expected),'INTEGRITY_FAILED');
   await this.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
   return {status:'descendant-jobs-pending' as const,coverage:'enrolled-local-graph' as const,reason:event['reason'],affectedDerived:jobs.length,jobs:jobs.map(j=>({jobId:uuid.parse(j['job_id']),status:'pending' as const,ref:GraphRefSchema.parse({class:j['class'],id:j['id'],revision:Number(j['revision']),witness:j['witness']})})),cleanup:'pending' as const,backupCopies:null,externalCopies:null,alreadyDeliveredRecalled:false as const};
  });
 }
}
const GraphRefSchemaClass=enumeration('source','knowledge','artifact','draft','summary','index','cache','ask');
export const DerivedCommandSchema=CommandSchema;
