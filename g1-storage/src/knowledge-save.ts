import { createHash,randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { BindingSchema,CipherEnvelopeSchema,KnowledgeSchema,CorrectCommandSchema,SaveCommandSchema,SaveResultSchema,SourceCommandSchema,QueryControlsSchema,parseCommand } from './schema.js';
import { object,uuid,timestamp,digest,positive,literal,enumeration,nullable,version,text,refined } from './decoder.js';
import { demand,StorageError,safeFailure } from './errors.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { revalidateScope,type AsyncUnitOfWork,type SqlTransaction,type VerifiedScope,type NativeRepository } from './owners.js';
import { CryptoStore } from './crypto-store.js';
import { StorageAuthorityRepository } from './authority.js';
import { HeadPublicationRepository,type HeadPublicationPrerequisite,type HeadWorkOverride } from './head-publication.js';
import type { EpochPublicationHooks } from './epoch-publication.js';
import { EpochWitnessJournal } from './epoch-journal.js';
import { HeadMaterialSchema,type HeadMaterial } from './head-material.js';
import { sealSourceContent,SourceContentPrerequisite,openSourcePayload,sourceContentWitness,type SourceContentMaterial,type SourcePayload } from './source-content.js';
import { LIMITS } from './arithmetic.js';
import type { CipherBinding,Knowledge,SaveCommand } from './contracts.js';

const KeyControlsSchema=object({keyId:uuid,generation:uuid});
export interface SaveKeyOwner {
 /** Installed scoped controls only. Never supplied by a command or archive. */
 resolve(tx:SqlTransaction,scope:VerifiedScope):Promise<ReturnType<typeof KeyControlsSchema.parse>>;
}
export interface KnowledgeInspection {knowledge:Knowledge;row:Record<string,unknown>}
export interface KnowledgeSaveHooks extends EpochPublicationHooks {afterCanonicalWrite?(tx:SqlTransaction):Promise<void>}
export const KnowledgeReadRefSchema=object({class:literal('knowledge'),id:uuid,revision:positive,witness:digest});
export const KnowledgeStateCommandSchema=object({schemaVersion:version,sessionId:uuid,key:uuid,expiresAt:timestamp,
 prior:KnowledgeReadRefSchema,status:enumeration('user-asserted','source-verified','disputed','superseded','expired','deleted'),checkId:nullable(uuid)});
export const KnowledgeCorrectionCommandSchema=refined(object({command:CorrectCommandSchema,prior:KnowledgeReadRefSchema}),c=>c.command.targetId===c.prior.id&&c.command.expectedRevision===c.prior.revision);
type CorrectionCommand=ReturnType<typeof KnowledgeCorrectionCommandSchema.parse>;
type StateCommand=ReturnType<typeof KnowledgeStateCommandSchema.parse>;
type BoundContentCommand={key:string;sessionId:string;expiresAt:string;targetId:string;expectedRevision:number;prior?:ReturnType<typeof KnowledgeReadRefSchema.parse>;stateCommand?:StateCommand;correctionCommand?:CorrectionCommand;rememberSessionId?:string};
type OwnedSaveCommand=SaveCommand & BoundContentCommand & {requestedStatus?:Knowledge['status']};
export const knowledgeClaim=async(crypto:CryptoStore,binding:CipherBinding,subject:string,value:string)=>{
 const bytes=Buffer.from(JSON.stringify({subject,value}));try{return await crypto.fingerprint(binding,'command',bytes);}finally{bytes.fill(0);}
};
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const sourceNarrativeDigest=(narrative:string)=>'sha256:'+createHash('sha256').update(narrative,'utf8').digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Finite synthetic admission profile, not a general secret detector or legal
 * hold engine. Mandatory transcript/audit retention is owned elsewhere. */
export class LocalSaveAdmission {
 readonly profile='local-fixture-v1' as const;
 readonly supportsStates:boolean=false;
 async outcome(_tx:SqlTransaction,_scope:VerifiedScope,c:OwnedSaveCommand,_claim:string,_source:Record<string,unknown>):Promise<Pick<Knowledge,'status'|'verification'>>{
  demand(c.assertion.intent==='assert'&&c.assertion.checkId===null&&!c.prior,'REQUIRED_CAPABILITY_UNSUPPORTED');return {status:'user-asserted',verification:null};
 }
 async inspect(tx:SqlTransaction,scope:VerifiedScope,k:Knowledge,row:Record<string,unknown>){await this.inspectMany(tx,scope,[{knowledge:k,row}]);}
 async inspectMany(_tx:SqlTransaction,_scope:VerifiedScope,records:readonly KnowledgeInspection[]){for(const {knowledge:k} of records)demand(k.revision===1&&k.status==='user-asserted'&&k.verification===null&&k.supersedes===null,'REQUIRED_CAPABILITY_UNSUPPORTED');}
 async recallEligibility(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  if((await tx.query("SELECT to_regclass('fabric.storage_knowledge_admissions') IS NOT NULL AS installed")).rows[0]?.['installed']!==true)return;
  const m=(await tx.query('SELECT valid_from,valid_until FROM fabric.storage_knowledge_admissions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,row['id'],row['revision']])).rows[0];
  if(m)demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AND ($2::timestamptz IS NULL OR clock_timestamp()<$2::timestamptz) AS live',[m['valid_from'],m['valid_until']])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
 }
 async conflictEligibility(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  if((await tx.query("SELECT to_regclass('fabric.storage_knowledge_corrections') IS NOT NULL AS installed")).rows[0]?.['installed']!==true)return;
  const conflict=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_knowledge_revisions k
   LEFT JOIN fabric.storage_knowledge_admissions m USING(tenant_id,space_id,id,revision)
   LEFT JOIN fabric.storage_knowledge_admissions base ON (base.tenant_id,base.space_id,base.id,base.revision)=($1,$2,$3,$4)
   WHERE k.tenant_id=$1 AND k.space_id=$2 AND k.source_id=$5 AND k.source_revision=$6 AND k.subject_fingerprint=$7
    AND k.id<>$3 AND k.status IN('user-asserted','source-verified','disputed') AND k.expires_at>clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(k.tenant_id,k.space_id,k.class,k.id) AND d.revision>=k.revision)
    AND (m.id IS NULL OR (m.valid_from<=clock_timestamp() AND (m.valid_until IS NULL OR m.valid_until>clock_timestamp())))
    AND (m.id IS NULL OR base.id IS NULL OR m.claim_digest<>base.claim_digest)
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads h WHERE (h.tenant_id,h.space_id,h.class,h.id)=(k.tenant_id,k.space_id,k.class,k.id) AND h.revision>k.revision)) AS conflict`,
   [scope.tenantId,scope.spaceId,row['id'],row['revision'],row['source_id'],row['source_revision'],row['subject_fingerprint']])).rows[0];
  demand(conflict?.['conflict']===false,'CONTENT_UNAVAILABLE');
 }
 async commit(tx:SqlTransaction,k:Knowledge,args:readonly unknown[],claim:string,correction=false){
  demand(!correction,'REQUIRED_CAPABILITY_UNSUPPORTED');
  // Compatibility admission keeps v14's assertion-only interface while honoring
  // v15's required typed row when the forward schema is installed.
  if((await tx.query("SELECT to_regclass('fabric.storage_knowledge_admissions') IS NOT NULL AS installed")).rows[0]?.['installed']===true){
   await tx.query('SELECT fabric.storage_commit_typed_knowledge($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[...args,k.status,null,claim,k.source.digest,k.validFrom,k.validUntil]);
  }else await tx.query('SELECT fabric.storage_commit_knowledge($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);
 }
 assertText(...values:readonly (string|null)[]){
  for(const value of values)if(value!==null)demand(!['fixture-secret-denied','-----BEGIN PRIVATE KEY-----','fixture-retention-denied'].some(marker=>value.includes(marker)),'RETENTION_RESTRICTED');
 }
 async source(_tx:SqlTransaction,_scope:VerifiedScope,p:SourcePayload){
  this.assertText(p.title,p.uri,p.narrative);demand(sourceNarrativeDigest(p.narrative)===p.contentDigest,'INTEGRITY_FAILED');
 }
 async knowledge(tx:SqlTransaction,scope:VerifiedScope,k:Knowledge){
  demand(k.status==='user-asserted'&&k.verification===null&&k.supersedes===null,'UNAUTHORIZED');await this.content(tx,scope,k);
 }
 async content(tx:SqlTransaction,scope:VerifiedScope,k:Knowledge){
  this.assertText(k.subject,k.value);demand(k.assertedBy===scope.actorId,'UNAUTHORIZED');
  const room=(await tx.query('SELECT kind FROM fabric.storage_rooms WHERE tenant_id=$1 AND space_id=$2',[scope.tenantId,scope.spaceId])).rows[0];
  demand(room&&((room['kind']==='personal'&&k.classification==='personal')||(['group','share'].includes(String(room['kind']))&&k.classification==='group')),'UNAUTHORIZED');
  demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AS valid',[k.recordedAt])).rows[0]?.['valid']===true,'INVALID_SCHEMA');
 }
}

/** Bound public command fingerprint is scoped/keyed; metadata command alone
 * cannot authenticate a save whose subject/value/source/intent differs. */
class BoundHeadRepository extends HeadPublicationRepository {
 constructor(uow:AsyncUnitOfWork,journal:EpochWitnessJournal,native:NativeRepository,materials:ConstructorParameters<typeof HeadPublicationRepository>[3],hooks:EpochPublicationHooks,prerequisite:HeadPublicationPrerequisite|undefined,readonly fingerprint:string,readonly recoverOther=false){
  super(uow,journal,native,materials,hooks,prerequisite);
 }
 protected override async locks(tx:SqlTransaction,scope:VerifiedScope,key:string){
  await super.locks(tx,scope,key);
  if(!this.recoverOther)return;
  const state=await this.journal.state(scope.tenantId,scope.spaceId),pending=state?.pending;
  if(!pending||pending.key===key)return;
  demand('schemaVersion' in pending&&pending.schemaVersion===6&&pending.actorId===scope.actorId,'AUTHORITY_UNAVAILABLE');
  // Settle another exact original under the SAME acquired Space barrier. The
  // trusted journal supplies the binding; no payload or effect is replayed.
  const command={key:pending.key,sessionId:pending.sessionId,expiresAt:pending.expiresAt,materialId:pending.materialId,expected:pending.expected};
  const nested:AsyncUnitOfWork={withScope:async(s,work)=>{demand(s===scope,'UNAUTHORIZED');return work(tx);}};
  class Recovery extends BoundHeadRepository {
   protected override commandBinding(c:Parameters<HeadPublicationPrerequisite['prepare']>[2]){demand(same(c,command),'CHECK_BINDING_MISMATCH');return pending!.binding;}
  }
  const result=await new Recovery(nested,this.journal,this.native,{resolve:async()=>undefined},{},undefined,'unused').lookup(scope,command);
  demand(result.status!=='unknown','AUTHORITY_UNAVAILABLE');
 }
 async receiptBarrier(tx:SqlTransaction,scope:VerifiedScope,key:string){await this.locks(tx,scope,key);}
 protected override commandBinding(command:Parameters<HeadPublicationPrerequisite['prepare']>[2]){return hash({command,contentBinding:this.fingerprint});}
 protected override async inspectOriginal(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  await super.inspectOriginal(tx,scope,row);
  const head=(await tx.query('SELECT class FROM fabric.storage_head_publications WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
  if(head?.['class']==='knowledge'){
   const r=(await tx.query(`SELECT r.*,k.witness,k.cipher_text,k.source_task_id FROM fabric.storage_save_receipts r
    JOIN fabric.storage_knowledge_revisions k ON (k.tenant_id,k.space_id,k.actor_id,k.command_key,k.id,k.revision,k.epoch,k.accepted_at)=(r.tenant_id,r.space_id,r.actor_id,r.command_key,r.id,r.revision,r.epoch,r.at)
    WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4`,[scope.tenantId,scope.spaceId,scope.actorId,row['command_key']])).rows[0];
   demand(r&&r['binding_digest']===row['binding_digest']&&Number(r['epoch'])===Number(row['epoch'])&&typeof r['cipher_text']==='string'
    &&sourceContentWitness(JSON.parse(r['cipher_text']))===r['witness'],'AUTHORITY_UNAVAILABLE');
   await this.authority.currentAudience(tx,scope,uuid.parse(r['source_task_id']));
  }
 }
}

/** Canonical same-Space source-backed owner. Descriptive content is sealed only
 * after current identity/native/source/audience checks. All effects are inside
 * the authenticated head transaction. Public acknowledgments follow COMMIT. */
export class KnowledgeSaveRepository {
 readonly authority:StorageAuthorityRepository;
 readonly #materialIds=new WeakMap<object,string>();
 constructor(readonly uow:AsyncUnitOfWork,readonly journal:EpochWitnessJournal,readonly native:NativeRepository,
  readonly crypto:CryptoStore,readonly keys:SaveKeyOwner,readonly admission:LocalSaveAdmission,readonly hooks:KnowledgeSaveHooks={}){
  demand(admission instanceof LocalSaveAdmission,'REQUIRED_CAPABILITY_UNSUPPORTED');this.authority=new StorageAuthorityRepository(journal,native);
 }
 async #binding(tx:SqlTransaction,scope:VerifiedScope,kind:'source'|'knowledge',id:string,revision=1):Promise<CipherBinding>{
  const keys=KeyControlsSchema.parse(await this.keys.resolve(tx,scope));
  return BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:kind,id,revision,...keys});
 }
 /** The head owner holds the Space publication barrier and current authority.
  * Do not call the serving reader while our own epoch witness is pending. */
 async #rememberAdmission(tx:SqlTransaction,scope:VerifiedScope,c:BoundContentCommand,requireSave=true){
  if(c.rememberSessionId===undefined)return;
  const n=await this.native.load(tx,scope,c.rememberSessionId);await this.native.fresh(tx,scope,n);
  demand(n.binding.tenantId===scope.tenantId&&n.binding.spaceId===scope.spaceId&&n.binding.actorId===scope.actorId
   &&n.binding.sessionId===c.rememberSessionId&&n.binding.intent==='Ask'&&n.binding.purpose==='answer'
   &&n.admission.executionClass==='service'&&n.admission.resourceId===null&&n.admission.computerCapability===null
   &&!n.admission.targetEffect&&!n.admission.approvalRequired,'UNAUTHORIZED');
  await this.authority.currentAudience(tx,scope,n.binding.taskId);
  const row=(await tx.query('SELECT * FROM fabric.storage_query_controls WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND session_id=$4 ORDER BY revision DESC LIMIT 1',
   [scope.tenantId,scope.spaceId,scope.actorId,c.rememberSessionId])).rows[0];
  demand(row&&row['task_id']===n.binding.taskId&&row['run_id']===n.binding.runId,'CONTENT_UNAVAILABLE');
  const flags=QueryControlsSchema.parse(row['controls']);if(requireSave)demand(flags.saveReusable,'RETENTION_RESTRICTED');
  await this.native.fresh(tx,scope,n);
 }
 async #bound(scope:VerifiedScope,c:BoundContentCommand,kind:'source'|'knowledge',requireSave=true){
  return this.uow.withScope(scope,async tx=>{
   await currentScope(tx,scope);await revalidateScope(scope);demand(scope.grants.includes('storage:write')&&scope.grants.includes('storage:maintenance')&&scope.grants.includes('task:write'),'UNAUTHORIZED');
   const native=await this.native.load(tx,scope,c.sessionId);await this.native.fresh(tx,scope,native);
   demand(native.binding.purpose==='maintenance'&&native.binding.intent==='Ask'&&native.admission.executionClass==='service'
    &&native.admission.resourceId===null&&native.admission.computerCapability===null&&!native.admission.targetEffect&&!native.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
   await this.authority.currentAudience(tx,scope,native.binding.taskId);await this.#rememberAdmission(tx,scope,c,requireSave);
   // Opaque material identity is in the actor's original namespace too. The
   // head owner's material UNIQUE is Space-wide; the bare command UUID would
   // accidentally collide for independent actors using the same key. Preserve
   // every existing receipt/pending binding, including pre-adapter originals.
   const old=(await tx.query('SELECT material_id FROM fabric.storage_head_publications WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.key])).rows[0];
   const pending=(await this.journal.state(scope.tenantId,scope.spaceId))?.pending;
   const prior=old?.['material_id']??(pending&&pending.actorId===scope.actorId&&pending.key===c.key&&'materialId' in pending?pending.materialId:undefined);
   const h=createHash('sha256').update(JSON.stringify(['storage-content-material-v1',scope.tenantId,scope.spaceId,scope.actorId,c.key])).digest('hex');
   this.#materialIds.set(c,prior?uuid.parse(prior):`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`);
   const binding=await this.#binding(tx,scope,kind,c.targetId,kind==='knowledge'?c.expectedRevision+1:1),bytes=Buffer.from(JSON.stringify(c.correctionCommand??c.stateCommand??c));
   try{return {binding,fingerprint:await this.crypto.fingerprint(binding,'command',bytes)};}finally{bytes.fill(0);}
  });
 }
 #original(c:{key:string;sessionId:string;expiresAt:string}){return {key:c.key,sessionId:c.sessionId,expiresAt:c.expiresAt};}
 #headCommand(c:{key:string;sessionId:string;expiresAt:string;prior?:ReturnType<typeof KnowledgeReadRefSchema.parse>}){return {...this.#original(c),materialId:this.#materialIds.get(c)??c.key,expected:c.prior??null};}
 #head(scope:VerifiedScope,c:BoundContentCommand,bound:{fingerprint:string},
  resolve:(tx:SqlTransaction,scope:VerifiedScope,id:string)=>Promise<HeadMaterial|undefined>,prerequisite?:HeadPublicationPrerequisite,onCommit:()=>void=()=>{},recoverOther=false){
  return new BoundHeadRepository(this.uow,this.journal,this.native,{resolve},{...this.hooks,beforeWitnessAck:async()=>{onCommit();await this.hooks.beforeWitnessAck?.();}},prerequisite,bound.fingerprint,recoverOther);
 }
 async #sourceControl(tx:SqlTransaction,scope:VerifiedScope,id:string,revision:number,anchor:boolean){
  const row=(await tx.query(`SELECT * FROM fabric.storage_sources WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND revision=$4`,[scope.tenantId,scope.spaceId,id,revision])).rows[0];
  demand(row,'CONTENT_UNAVAILABLE');const ref={class:'source',id,revision,witness:row['witness']};
  if(anchor)await this.authority.entity(tx,scope,ref);
  // Repeat exact current head/restriction/expiry after prerequisite waits, while
  // our journal reservation intentionally blocks the ordinary serving path.
  const live=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_current_heads h WHERE (h.tenant_id,h.space_id,h.class,h.id,h.revision,h.witness,h.key_id,h.generation) = ($1,$2,'source',$3,$4,$5,$6,$7) AND h.expires_at>clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads newer WHERE (newer.tenant_id,newer.space_id,newer.class,newer.id)=(h.tenant_id,h.space_id,h.class,h.id) AND newer.revision>h.revision))
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND source_revision=$4)
   AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND class='source' AND id=$3 AND revision>=$4) AS live`,[scope.tenantId,scope.spaceId,id,revision,row['witness'],row['key_id'],row['generation']])).rows[0];
  demand(live?.['live']===true,'RETENTION_RESTRICTED');const audience=await this.authority.currentAudience(tx,scope,uuid.parse(row['source_task_id']));
  return {row,audience};
 }
 async source(scope:VerifiedScope,raw:unknown){
  let committed=false,commandKey:string|undefined;
  try{
   const c=parseCommand(SourceCommandSchema,raw);commandKey=c.key;demand(c.saveReusable,'RETENTION_RESTRICTED');
   const bound=await this.#bound(scope,c,'source');let material:SourceContentMaterial|undefined;
   const owner={resolve:async(_tx:SqlTransaction,_s:VerifiedScope,id:string)=>id===this.#headCommand(c).materialId?material:undefined,
    admit:this.admission.source.bind(this.admission)};
   const prerequisite=new SourceContentPrerequisite(this.crypto,owner);
   const publisher=this.#head(scope,c,bound,async(tx,s,id)=>{
    demand(id===this.#headCommand(c).materialId&&same(await this.#binding(tx,s,'source',c.targetId),bound.binding),'CHECK_BINDING_MISMATCH');
    const n=await this.native.load(tx,s,c.sessionId);await this.native.fresh(tx,s,n);
    const at=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'];demand(at instanceof Date,'AUTHORITY_UNAVAILABLE');
    const value={schemaVersion:1,title:c.title,uri:c.uri,narrative:c.narrative,contentDigest:c.contentDigest,assertedBy:s.actorId,recordedAt:at.toISOString()};
    await this.admission.source(tx,s,value as SourcePayload);
    material=await sealSourceContent(this.crypto,bound.binding,value,{sourceTaskId:n.binding.taskId,expiresAt:c.retentionExpiresAt,original:this.#original(c)});return material.head;
   },prerequisite,()=>{committed=true;});
   const outcome=await publisher.publish(scope,this.#headCommand(c));
   if(outcome.status!=='committed')return {schemaVersion:1 as const,status:'unknown' as const,key:c.key,replayAllowed:false as const,nextAction:'original-key-lookup' as const};
   demand(material,'INTEGRITY_FAILED');return {schemaVersion:1 as const,status:'source-accepted' as const,source:{class:'source' as const,id:c.targetId,revision:1,witness:material.head.witness}};
  }catch(e){return committed&&commandKey?this.#unknown(commandKey):safeFailure(e);}
 }
 #unknown(key:string){return {schemaVersion:1 as const,status:'unknown' as const,key:uuid.parse(key),replayAllowed:false as const,nextAction:'original-key-lookup' as const};}
 async #savePublisher(scope:VerifiedScope,c:OwnedSaveCommand,onCommit:()=>void,recoverOther=false,lookupOnly=false){
  const bound=await this.#bound(scope,c,'knowledge',!lookupOnly);let material:HeadMaterial|undefined,k:Knowledge|undefined,envelope:ReturnType<typeof CipherEnvelopeSchema.parse>|undefined,sourceRow:Record<string,unknown>|undefined,work:HeadWorkOverride|undefined,subjectFingerprint:string|undefined,claimDigest:string|undefined;
  const validate=async(tx:SqlTransaction,s:VerifiedScope)=>{
   await this.#rememberAdmission(tx,s,c);
   demand(k&&material&&envelope&&sourceRow,'INTEGRITY_FAILED');
   demand(same(await this.#binding(tx,s,'knowledge',c.targetId,c.expectedRevision+1),bound.binding),'CHECK_BINDING_MISMATCH');
   const source=await this.#sourceControl(tx,s,c.assertion.sourceId,c.assertion.sourceRevision,false);
   demand(same(source.row,sourceRow)&&source.audience.sourceSpaceId===k.source.spaceId&&source.audience.sourceTaskId===k.source.sourceTaskId&&source.audience.destinationSpaceId===k.source.audience.destinationSpaceId&&same(source.audience.recipientActorIds,k.source.audience.recipientActorIds)&&source.audience.revisionDigest===k.source.audience.revisionDigest,'CHECK_BINDING_MISMATCH');
   demand(k.expiresAt<=timestamp.parse((source.row['expires_at'] as Date).toISOString()),'RETENTION_RESTRICTED');
   await this.admission.knowledge(tx,s,k);demand(claimDigest,'INTEGRITY_FAILED');
   const outcome=await this.admission.outcome(tx,s,c,claimDigest,source.row);demand(same(outcome,{status:k.status,verification:k.verification}),'CHECK_BINDING_MISMATCH');
   const bytes=await this.crypto.open(bound.binding,envelope);
   try{demand(same(KnowledgeSchema.parse(JSON.parse(bytes.toString('utf8'))),k),'INTEGRITY_FAILED');}finally{bytes.fill(0);}
  };
  const prerequisite:HeadPublicationPrerequisite={
   prepare:async(tx,s,_command,head)=>{
    demand(same(head,material),'CHECK_BINDING_MISMATCH');await validate(tx,s);
    return async()=>{
     await validate(tx,s);demand(envelope&&k&&work&&subjectFingerprint,'INTEGRITY_FAILED');
     demand(claimDigest,'INTEGRITY_FAILED');await this.admission.commit(tx,k,[c.key,JSON.stringify(envelope),k.source.sourceId,k.source.revision,sourceRow!['witness'],subjectFingerprint,work.receiptId,work.jobId,eventId,mutationId],claimDigest,!!c.correctionCommand);
     await this.hooks.afterCanonicalWrite?.(tx);
     const stored=(await tx.query('SELECT cipher_text,witness FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,c.targetId,k.revision])).rows[0];
     demand(stored?.['cipher_text']===JSON.stringify(envelope)&&stored['witness']===head.witness,'INTEGRITY_FAILED');await validate(tx,s);
    };
   },
   forecastWork:async(_tx,s,_command,head,epoch,at)=>{
    work={actorId:s.actorId,key:c.key,binding:hash({command:this.#headCommand(c),contentBinding:bound.fingerprint}),receiptId:randomUUID(),jobId:randomUUID(),entity:{class:head.class,id:head.id,revision:head.revision},epoch,at};return work;
   }
  };
  const eventId=randomUUID(),mutationId=randomUUID();
  return this.#head(scope,c,bound,async(tx,s,id)=>{
   demand(id===this.#headCommand(c).materialId,'CHECK_BINDING_MISMATCH');
   demand(same(await this.#binding(tx,s,'knowledge',c.targetId,c.expectedRevision+1),bound.binding),'CHECK_BINDING_MISMATCH');
   await this.#rememberAdmission(tx,s,c);
   const {row,audience}=await this.#sourceControl(tx,s,c.assertion.sourceId,c.assertion.sourceRevision,true);sourceRow=row;
   const e=CipherEnvelopeSchema.parse(JSON.parse(String(row['cipher_text'])));
   demand(e.tenantId===s.tenantId&&e.spaceId===s.spaceId&&e.class==='source'&&e.id===c.assertion.sourceId&&e.revision===c.assertion.sourceRevision&&e.keyId===row['key_id']&&e.generation===row['generation']&&sourceContentWitness(e)===row['witness'],'INTEGRITY_FAILED');
   const source=await openSourcePayload(this.crypto,e);demand(source.assertedBy===row['actor_id'],'INTEGRITY_FAILED');await this.admission.source(tx,s,source);
   const at=(await tx.query('SELECT clock_timestamp() AS at')).rows[0]?.['at'];demand(at instanceof Date,'AUTHORITY_UNAVAILABLE');
   claimDigest=await knowledgeClaim(this.crypto,BindingSchema.parse({schemaVersion:1,tenantId:e.tenantId,spaceId:e.spaceId,class:e.class,id:e.id,revision:e.revision,keyId:e.keyId,generation:e.generation}),c.assertion.subject,c.assertion.value);
   const outcome=await this.admission.outcome(tx,s,c,claimDigest,row);
   k=KnowledgeSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,id:c.targetId,revision:c.expectedRevision+1,subject:c.assertion.subject,value:c.assertion.value,
    source:{tenantId:s.tenantId,spaceId:s.spaceId,sourceId:c.assertion.sourceId,sourceTaskId:row['source_task_id'],revision:c.assertion.sourceRevision,digest:source.contentDigest,
     audience:{destinationSpaceId:audience.destinationSpaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest}},assertedBy:s.actorId,recordedAt:at.toISOString(),
    validFrom:c.assertion.validFrom,validUntil:c.assertion.validUntil,expiresAt:c.assertion.expiresAt,classification:c.assertion.classification,...outcome,supersedes:c.prior?{id:c.prior.id,revision:c.prior.revision}:null});
   await this.admission.knowledge(tx,s,k);demand(k.expiresAt<=timestamp.parse((row['expires_at'] as Date).toISOString()),'RETENTION_RESTRICTED');
   const bytes=Buffer.from(JSON.stringify(k)),subject=Buffer.from(k.subject);
   try{demand(bytes.length<=LIMITS.commandBytes);envelope=await this.crypto.seal(bound.binding,bytes);subjectFingerprint=await this.crypto.fingerprint(bound.binding,'subject',subject);}finally{bytes.fill(0);subject.fill(0);}
   material=HeadMaterialSchema.parse({tenantId:s.tenantId,spaceId:s.spaceId,class:'knowledge',id:c.targetId,revision:k.revision,witness:sourceContentWitness(envelope),keyId:bound.binding.keyId,generation:bound.binding.generation,sourceTaskId:row['source_task_id'],expiresAt:k.expiresAt});return material;
  },prerequisite,onCommit,recoverOther);
 }
 async #receipt(scope:VerifiedScope,c:Pick<SaveCommand,'key'|'targetId'|'sessionId'>,recoverOther=false){
  return this.uow.withScope(scope,async tx=>{
   if(recoverOther)await new BoundHeadRepository(this.uow,this.journal,this.native,{resolve:async()=>undefined},{},undefined,'receipt-only',true).receiptBarrier(tx,scope,c.key);
   await this.authority.check(tx,scope,'read');const native=await this.native.load(tx,scope,c.sessionId);await this.native.fresh(tx,scope,native);await this.authority.currentAudience(tx,scope,native.binding.taskId);const r=(await tx.query('SELECT receipt_id,id,revision,status FROM fabric.storage_save_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.key])).rows[0];
   demand(r&&r['id']===c.targetId,'INTEGRITY_FAILED');await this.authority.check(tx,scope,'read');await this.native.fresh(tx,scope,native);await this.authority.currentAudience(tx,scope,native.binding.taskId);
   return r['status']==='pending-review'?SaveResultSchema.parse({schemaVersion:1,status:'pending-review',receiptId:r['receipt_id'],proposalId:r['id']}):SaveResultSchema.parse({schemaVersion:1,status:'saved-here',receiptId:r['receipt_id'],id:r['id'],revision:Number(r['revision'])});
  });
 }
 async save(scope:VerifiedScope,raw:unknown){
  let committed=false,commandKey:string|undefined;
  try{
   const c=parseCommand(SaveCommandSchema,raw);commandKey=c.key;const publisher=await this.#savePublisher(scope,c,()=>{committed=true;});
   const result=await publisher.publish(scope,this.#headCommand(c));
   if(result.status!=='committed')return this.#unknown(c.key);
   return await this.#receipt(scope,c);
  }catch(e){return committed&&commandKey?this.#unknown(commandKey):safeFailure(e);}
 }
 /** Explicit append with original-key dedup. Only the exact committed original
  * is returned; changed payloads conflict. Unknown never authorizes replay. */
 async remember(scope:VerifiedScope,raw:unknown){
  try{
   const request=object({schemaVersion:version,sessionId:uuid,destination:enumeration('here','personal'),command:SaveCommandSchema}).parse(raw);
   demand(request.destination==='here','REQUIRED_CAPABILITY_UNSUPPORTED');
   return this.#append(scope,request.command,request.sessionId);
  }catch(e){return safeFailure(e);}
 }
 async lookupRemember(scope:VerifiedScope,raw:unknown){
  const request=object({schemaVersion:version,sessionId:uuid,destination:enumeration('here','personal'),command:SaveCommandSchema}).parse(raw);
  demand(request.destination==='here','REQUIRED_CAPABILITY_UNSUPPORTED');
  const c:OwnedSaveCommand={...request.command,rememberSessionId:request.sessionId};
  const publisher=await this.#savePublisher(scope,c,()=>{},true,true),result=await publisher.lookup(scope,this.#headCommand(c));
  return result.status==='committed'?this.#receipt(scope,c,true):result.status==='absent-safe'?{schemaVersion:1 as const,status:'absent-safe' as const,key:c.key,replayAllowed:false as const,nextAction:'inspect-current-authority' as const}:result;
 }
 async append(scope:VerifiedScope,raw:unknown){return this.#append(scope,raw);}
 async #append(scope:VerifiedScope,raw:unknown,rememberSessionId?:string){
  let committed=false,key:string|undefined;
  try{
   const parsed=parseCommand(SaveCommandSchema,raw),c:OwnedSaveCommand=rememberSessionId===undefined?parsed:{...parsed,rememberSessionId};key=c.key;
   const publisher=await this.#savePublisher(scope,c,()=>{committed=true;},true);
   try{const result=await publisher.publish(scope,this.#headCommand(c));return result.status==='committed'?await this.#receipt(scope,c,true):this.#unknown(c.key);}
   catch(e){if(e instanceof StorageError&&e.code==='IDEMPOTENCY_CONFLICT'){
    const result=await publisher.lookup(scope,this.#headCommand(c));
    if(result.status==='committed')return await this.#receipt(scope,c,true);
   }throw e;}
  }catch(e){return committed&&key?this.#unknown(key):safeFailure(e);}
 }
 async #correctionBinding(scope:VerifiedScope,c:CorrectionCommand){
  const command:BoundContentCommand={...c.command,prior:c.prior,correctionCommand:c};
  const bound=await this.#bound(scope,command,'knowledge');
  return {command,bound,publisher:this.#head(scope,command,bound,async()=>undefined,undefined,()=>{},true)};
 }
 async lookupCorrection(scope:VerifiedScope,raw:unknown){
  const c=parseCommand(KnowledgeCorrectionCommandSchema,raw),{command,publisher}=await this.#correctionBinding(scope,c);
  const result=await publisher.lookup(scope,this.#headCommand(command));
  return result.status==='committed'?this.#receipt(scope,command,true):result;
 }
 async correct(scope:VerifiedScope,raw:unknown){
  let committed=false,key:string|undefined;
  try{
   demand(this.admission.supportsStates,'REQUIRED_CAPABILITY_UNSUPPORTED');const c=parseCommand(KnowledgeCorrectionCommandSchema,raw);key=c.command.key;
   const original=await this.lookupCorrection(scope,c);
   if(original.status!=='absent-safe')return original;
   const prior=await this.read(scope,c.prior);
   demand(['user-asserted','source-verified','disputed'].includes(prior.status),'STALE_REVISION');
   const a=c.command.assertion;
   demand(a.subject===prior.subject&&a.sourceId===prior.source.sourceId&&a.sourceRevision===prior.source.revision
    &&a.validFrom===prior.validFrom&&a.validUntil===prior.validUntil&&a.expiresAt===prior.expiresAt&&a.classification===prior.classification,'CHECK_BINDING_MISMATCH');
   demand(a.intent!=='propose','REQUIRED_CAPABILITY_UNSUPPORTED');
   const command:OwnedSaveCommand={...c.command,action:'save',prior:c.prior,correctionCommand:c};
   const publisher=await this.#savePublisher(scope,command,()=>{committed=true;},true);
   try{const result=await publisher.publish(scope,this.#headCommand(command));return result.status==='committed'?await this.#receipt(scope,command,true):this.#unknown(key);}
   catch(e){if(e instanceof StorageError&&e.code==='IDEMPOTENCY_CONFLICT')return await this.lookupCorrection(scope,c);throw e;}
  }catch(e){return committed&&key?this.#unknown(key):safeFailure(e);}
 }
 /** Exact scope/source/subject bucket, latest identities only. No embedding or
  * cross-source merge. Competing eligible values remain visible with authors. */
 async claims(scope:VerifiedScope,raw:unknown){
  const c=object({sourceId:uuid,sourceRevision:positive,subject:text}).parse(raw);
  return this.uow.withScope(scope,async tx=>{
   await this.authority.check(tx,scope,'read');const source=await this.#sourceControl(tx,scope,c.sourceId,c.sourceRevision,true);
   const binding=await this.#binding(tx,scope,'knowledge',c.sourceId),bytes=Buffer.from(c.subject);
   let fingerprint:string;try{fingerprint=await this.crypto.fingerprint(binding,'subject',bytes);}finally{bytes.fill(0);}
   const rows=(await tx.query(`SELECT k.*,h.witness AS head_witness,h.key_id AS head_key,h.generation AS head_generation
    FROM fabric.storage_knowledge_revisions k JOIN fabric.storage_current_heads h
     ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(k.tenant_id,k.space_id,k.class,k.id,k.revision)
    LEFT JOIN fabric.storage_knowledge_admissions eligibility ON (eligibility.tenant_id,eligibility.space_id,eligibility.id,eligibility.revision)=(k.tenant_id,k.space_id,k.id,k.revision)
    WHERE k.tenant_id=$1 AND k.space_id=$2 AND k.source_id=$3 AND k.source_revision=$4 AND k.subject_fingerprint=$5
    AND k.status IN('user-asserted','source-verified','disputed') AND k.expires_at>clock_timestamp()
    AND (eligibility.id IS NULL OR (eligibility.valid_from<=clock_timestamp() AND (eligibility.valid_until IS NULL OR eligibility.valid_until>clock_timestamp())))
    AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads n WHERE (n.tenant_id,n.space_id,n.class,n.id)=(k.tenant_id,k.space_id,k.class,k.id) AND n.revision>k.revision)
    ORDER BY k.id LIMIT 513`,[scope.tenantId,scope.spaceId,c.sourceId,c.sourceRevision,fingerprint])).rows;
   demand(rows.length<=512,'CONTENT_UNAVAILABLE');const records:KnowledgeInspection[]=[];
   for(const row of rows){
    demand(row['witness']===row['head_witness']&&row['key_id']===row['head_key']&&row['generation']===row['head_generation']
     &&row['source_witness']===source.row['witness']&&row['source_task_id']===source.row['source_task_id'],'INTEGRITY_FAILED');
    const envelope=CipherEnvelopeSchema.parse(JSON.parse(String(row['cipher_text'])));demand(sourceContentWitness(envelope)===row['witness'],'INTEGRITY_FAILED');
    const b=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'knowledge',id:row['id'],revision:Number(row['revision']),keyId:row['key_id'],generation:row['generation']});
    const bytes=await this.crypto.open(b,envelope);let k:Knowledge;
    try{k=KnowledgeSchema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new StorageError('INTEGRITY_FAILED');}finally{bytes.fill(0);}
    demand(k.tenantId===scope.tenantId&&k.spaceId===scope.spaceId&&k.id===row['id']&&k.revision===Number(row['revision'])&&k.subject===c.subject
     &&k.assertedBy===row['actor_id']&&k.status===row['status']&&k.source.sourceId===c.sourceId&&k.source.revision===c.sourceRevision&&k.source.sourceTaskId===source.row['source_task_id']
     &&k.expiresAt===(row['expires_at'] as Date).toISOString(),'INTEGRITY_FAILED');records.push({knowledge:k,row});
   }
   if(records.length)await this.admission.inspectMany(tx,scope,records);
   const after=await this.#sourceControl(tx,scope,c.sourceId,c.sourceRevision,true);demand(same(source.row,after.row),'INTEGRITY_FAILED');await this.authority.check(tx,scope,'read');
   if(records.length)demand((await tx.query(`SELECT bool_and(expires_at>clock_timestamp()) AS live FROM fabric.storage_knowledge_revisions
    WHERE tenant_id=$1 AND space_id=$2 AND id=ANY($3::uuid[]) AND NOT EXISTS(SELECT 1 FROM fabric.storage_current_heads h
     WHERE (h.tenant_id,h.space_id,h.class,h.id)=(storage_knowledge_revisions.tenant_id,storage_knowledge_revisions.space_id,storage_knowledge_revisions.class,storage_knowledge_revisions.id) AND h.revision>storage_knowledge_revisions.revision)`,[scope.tenantId,scope.spaceId,records.map(r=>r.knowledge.id)])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
   const claims=records.map(r=>r.knowledge),groups:Knowledge[][]=[];
   // Dedup selection by exact scoped subject/value only, retaining every
   // identity and attributed assertion in its group. No canonical ID aliasing.
   for(const k of claims){const group=groups.find(g=>g[0]!.value===k.value);if(group)group.push(k);else groups.push([k]);}
   return {claims,groups,conflict:groups.length>1};
  });
 }
 /** Original-key metadata recovery. No mutation is replayed, including when
  * the original has definitely rolled back. Recreated services use the same
  * lock and current READ COMMITTED receipt/authority as execute. */
 async lookupSave(scope:VerifiedScope,raw:unknown){
  const c=parseCommand(SaveCommandSchema,raw);
  try{
   const publisher=await this.#savePublisher(scope,c,()=>{},true),result=await publisher.lookup(scope,this.#headCommand(c));
   return result.status==='committed'?await this.#receipt(scope,c,true):result;
  }catch(e){
   // Native binding checks can contend before reconcile's own transaction.
   // Only an actual driver timeout or the installed typed failure is uncertain.
   if(e instanceof DatabaseError&&['55P03','57014'].includes(e.code??''))return this.#unknown(c.key);
   const result=safeFailure(e);if(result.status==='unknown')return {...result,key:c.key};throw e;
  }
 }
 /** Status-only publication, separate from correct(); caller cannot replace subject/value/source. */
 async transition(scope:VerifiedScope,raw:unknown){
  let committed=false,key:string|undefined;
  try{
   demand(this.admission.supportsStates,'REQUIRED_CAPABILITY_UNSUPPORTED');const c=parseCommand(KnowledgeStateCommandSchema,raw);key=c.key;
   const prior=await this.read(scope,c.prior);
   const command:OwnedSaveCommand={schemaVersion:1,action:'save',sessionId:c.sessionId,targetId:c.prior.id,key:c.key,expectedRevision:c.prior.revision,expiresAt:c.expiresAt,
    assertion:{subject:prior.subject,value:prior.value,sourceId:prior.source.sourceId,sourceRevision:prior.source.revision,validFrom:prior.validFrom,validUntil:prior.validUntil,expiresAt:prior.expiresAt,classification:prior.classification,
     intent:c.status==='source-verified'?'registered-check':'assert',checkId:c.checkId},prior:c.prior,requestedStatus:c.status,stateCommand:c};
   const publisher=await this.#savePublisher(scope,command,()=>{committed=true;}),result=await publisher.publish(scope,this.#headCommand(command));
   return result.status==='committed'?await this.#receipt(scope,command):this.#unknown(c.key);
  }catch(e){return committed&&key?this.#unknown(key):safeFailure(e);}
 }
 /** Metadata-only original status reconciliation after definite rollback or ACK
  * uncertainty. Exact public state command + prior witness bind the key; this
  * cannot replay a transition or obtain a payload through pending authority. */
 async lookupState(scope:VerifiedScope,raw:unknown){
  demand(this.admission.supportsStates,'REQUIRED_CAPABILITY_UNSUPPORTED');const state=parseCommand(KnowledgeStateCommandSchema,raw);
  const c:BoundContentCommand={key:state.key,sessionId:state.sessionId,expiresAt:state.expiresAt,targetId:state.prior.id,expectedRevision:state.prior.revision,prior:state.prior,stateCommand:state};
  const bound=await this.#bound(scope,c,'knowledge'),publisher=this.#head(scope,c,bound,async()=>undefined),result=await publisher.lookup(scope,this.#headCommand(c));
  return result.status==='committed'?this.#receipt(scope,c):result;
 }
 async recall(scope:VerifiedScope,raw:unknown){return this.read(scope,raw,'recall');}
 /** Batch scoped history: one revision/head read and one admission/check read.
  * Source authorization is shared by exact source revision, not repeated per
  * knowledge row. The Space barrier spans decoding and final eligibility. */
 async history(scope:VerifiedScope,id:unknown){
  const target=uuid.parse(id);return this.uow.withScope(scope,async tx=>{
   await this.authority.check(tx,scope,'read');
   const rows=(await tx.query(`SELECT k.*,h.witness AS head_witness,h.key_id AS head_key,h.generation AS head_generation,
    clock_timestamp()<k.expires_at AS retained FROM fabric.storage_knowledge_revisions k
    JOIN fabric.storage_current_heads h ON (h.tenant_id,h.space_id,h.class,h.id,h.revision)=(k.tenant_id,k.space_id,k.class,k.id,k.revision)
    WHERE k.tenant_id=$1 AND k.space_id=$2 AND k.id=$3 ORDER BY k.revision LIMIT 513`,[scope.tenantId,scope.spaceId,target])).rows;
   demand(rows.length>0&&rows.length<=512,'CONTENT_UNAVAILABLE');
   const sources=new Map<string,{row:Record<string,unknown>;audience:Awaited<ReturnType<StorageAuthorityRepository['currentAudience']>>}>(),records:KnowledgeInspection[]=[];
   for(const row of rows){
    demand(row['retained']===true&&row['witness']===row['head_witness']&&row['key_id']===row['head_key']&&row['generation']===row['head_generation'],'CONTENT_UNAVAILABLE');
    const sourceId=uuid.parse(row['source_id']),sourceRev=positive.parse(Number(row['source_revision'])),sourceKey=sourceId+'/'+sourceRev;
    let source=sources.get(sourceKey);if(!source){source=await this.#sourceControl(tx,scope,sourceId,sourceRev,true);sources.set(sourceKey,source);}
    demand(source.row['witness']===row['source_witness']&&source.row['source_task_id']===row['source_task_id'],'INTEGRITY_FAILED');
    const envelope=CipherEnvelopeSchema.parse(JSON.parse(String(row['cipher_text'])));demand(sourceContentWitness(envelope)===row['witness'],'INTEGRITY_FAILED');
    const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'knowledge',id:target,revision:Number(row['revision']),keyId:row['key_id'],generation:row['generation']});
    const bytes=await this.crypto.open(binding,envelope);let k:Knowledge;
    try{k=KnowledgeSchema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new StorageError('INTEGRITY_FAILED');}finally{bytes.fill(0);}
    demand(k.tenantId===scope.tenantId&&k.spaceId===scope.spaceId&&k.id===target&&k.revision===Number(row['revision'])&&k.assertedBy===row['actor_id']&&k.status===row['status']
     &&k.expiresAt===(row['expires_at'] as Date).toISOString()&&k.source.sourceId===sourceId&&k.source.revision===sourceRev&&k.source.sourceTaskId===row['source_task_id'],'INTEGRITY_FAILED');
    records.push({knowledge:k,row});
   }
   await this.admission.inspectMany(tx,scope,records);
   for(const source of sources.values()){
    const after=await this.#sourceControl(tx,scope,uuid.parse(source.row['source_id']),positive.parse(Number(source.row['revision'])),true);demand(same(after.row,source.row),'INTEGRITY_FAILED');
   }
   await this.authority.check(tx,scope,'read');
   demand((await tx.query('SELECT bool_and(expires_at>clock_timestamp()) AS live FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3',[scope.tenantId,scope.spaceId,target])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
   return records.map(r=>r.knowledge);
  });
 }
 async read(scope:VerifiedScope,raw:unknown,mode:'inspect'|'recall'='inspect'):Promise<Knowledge>{
  const ref=KnowledgeReadRefSchema.parse(raw);return this.uow.withScope(scope,tx=>this.#read(tx,scope,ref,mode));
 }
 async #read(tx:SqlTransaction,scope:VerifiedScope,raw:unknown,mode:'inspect'|'recall'):Promise<Knowledge>{

  const ref=KnowledgeReadRefSchema.parse(raw);
  const check=()=>this.authority.entity(tx,scope,ref);
   const head=await check();
   const row=(await tx.query('SELECT * FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,ref.id,ref.revision])).rows[0];
   demand(row&&row['witness']===ref.witness&&row['key_id']===head['key_id']&&row['generation']===head['generation'],'CONTENT_UNAVAILABLE');
   const before=await this.#sourceControl(tx,scope,uuid.parse(row['source_id']),positive.parse(Number(row['source_revision'])),true);
   demand(before.row['witness']===row['source_witness'],'INTEGRITY_FAILED');
   const conflict=()=>this.admission.conflictEligibility(tx,scope,row);
   if(mode==='recall'){demand(['user-asserted','source-verified'].includes(String(row['status'])),'CONTENT_UNAVAILABLE');await this.admission.recallEligibility(tx,scope,row);await conflict();}
   const envelope=CipherEnvelopeSchema.parse(JSON.parse(String(row['cipher_text'])));demand(sourceContentWitness(envelope)===ref.witness,'INTEGRITY_FAILED');
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'knowledge',id:ref.id,revision:ref.revision,keyId:head['key_id'],generation:head['generation']});
   const bytes=await this.crypto.open(binding,envelope);let result:Knowledge;
   try{result=KnowledgeSchema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new StorageError('INTEGRITY_FAILED');}finally{bytes.fill(0);}
   demand(result.tenantId===scope.tenantId&&result.spaceId===scope.spaceId&&result.id===ref.id&&result.revision===ref.revision&&result.assertedBy===row['actor_id']&&result.status===row['status']&&result.expiresAt===(row['expires_at'] as Date).toISOString()
    &&result.source.sourceId===row['source_id']&&result.source.revision===Number(row['source_revision'])&&result.source.sourceTaskId===before.row['source_task_id'],'INTEGRITY_FAILED');
   await this.admission.inspect(tx,scope,result,row);
   if(mode==='recall')demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AND ($2::timestamptz IS NULL OR clock_timestamp()<$2::timestamptz) AND clock_timestamp()<$3::timestamptz AS live',[result.validFrom,result.validUntil,result.expiresAt])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
   await check();const after=await this.#sourceControl(tx,scope,result.source.sourceId,result.source.revision,true);demand(same(before.row,after.row),'INTEGRITY_FAILED');
   const stored=(await tx.query('SELECT cipher_text FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,ref.id,ref.revision])).rows[0];demand(stored?.['cipher_text']===row['cipher_text'],'INTEGRITY_FAILED');
   await check();if(mode==='recall')await conflict();
   if(mode==='recall')demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AND ($2::timestamptz IS NULL OR clock_timestamp()<$2::timestamptz) AND clock_timestamp()<$3::timestamptz AS live',[result.validFrom,result.validUntil,result.expiresAt])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
   return result;
 }
}
