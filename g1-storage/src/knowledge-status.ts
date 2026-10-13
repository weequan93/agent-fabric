import { randomUUID } from 'node:crypto';
import { object,uuid,text,body,positive,digest,timestamp,literal } from './decoder.js';
import { BindingSchema,KnowledgeSchema } from './schema.js';
import { demand } from './errors.js';
import { LocalSaveAdmission,knowledgeClaim,sourceNarrativeDigest } from './knowledge-save.js';
import { SourceContentRepository } from './source-content.js';
import { StorageAuthorityRepository } from './authority.js';
import type { CryptoStore } from './crypto-store.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope } from './owners.js';
import type { Knowledge } from './contracts.js';
export const SOURCE_CHECK_PROFILE='local-source-exact-v1';
export const SOURCE_CHECK_DEFINITION='sha256:e3a4ee5c8e02d19f057c105e215ad993514958dd1218f5634df8a7f10b7c446f';
const ClaimSchema=object({subject:text,value:body});
const CheckCommandSchema=object({sessionId:uuid,expiresAt:timestamp,source:object({class:literal('source'),id:uuid,revision:positive,witness:digest}),claim:ClaimSchema});
/** Independent installed verifier with its own authenticated database capability.
 * Profile proves an exact assertion in a closed synthetic JSON source; it does
 * not establish real-world truth or evaluate arbitrary documents/models. */
export class RegisteredSourceChecker {
 readonly source:SourceContentRepository;
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:StorageAuthorityRepository,readonly crypto:CryptoStore){this.source=new SourceContentRepository(uow,authority,crypto);}
 async run(scope:VerifiedScope,raw:unknown){
  const c=CheckCommandSchema.parse(raw),payload=await this.source.read(scope,c.source);
  let supported;try{supported=ClaimSchema.parse(JSON.parse(payload.narrative));}catch{demand(false,'CHECK_BINDING_MISMATCH');}
  demand(sourceNarrativeDigest(payload.narrative)===payload.contentDigest,'INTEGRITY_FAILED');
  demand(supported.subject===c.claim.subject&&supported.value===c.claim.value,'CHECK_BINDING_MISMATCH');
  return this.uow.withScope(scope,async tx=>{
   await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
   const head=await this.authority.entity(tx,scope,c.source);
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'source',id:c.source.id,revision:c.source.revision,keyId:head['key_id'],generation:head['generation']});
   const claim=await knowledgeClaim(this.crypto,binding,c.claim.subject,c.claim.value),checkId=randomUUID();
   const checked=(await tx.query('SELECT fabric.storage_register_source_check($1,$2,$3,$4,$5,$6) AS at',[checkId,c.source.id,c.source.revision,c.source.witness,payload.contentDigest,claim])).rows[0]?.['at'];
   demand(checked instanceof Date,'AUTHORITY_UNAVAILABLE');
   await this.authority.entity(tx,scope,c.source);await this.authority.assertCurrent(tx,scope,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
   return {checkId,checker:SOURCE_CHECK_PROFILE,definitionDigest:SOURCE_CHECK_DEFINITION,checkedAt:checked.toISOString(),source:c.source,sourceDigest:payload.contentDigest,claimDigest:claim};
  });
 }
}
/** Installed typed admission. Every status revision goes through the unchanged
 * head/epoch UoW: new AAD, CAS head, command, receipt, event and outbox at one
 * COMMIT. The source verifier is never reachable from a save request. */
export class KnowledgeStatusAdmission extends LocalSaveAdmission {
 override readonly supportsStates=true;
 constructor(readonly crypto:CryptoStore){super();}
 async #proof(tx:SqlTransaction,scope:VerifiedScope,id:string,claim:string,source:Record<string,unknown>,live:boolean){
  const row=(await tx.query('SELECT * FROM fabric.storage_source_checks WHERE tenant_id=$1 AND space_id=$2 AND check_id=$3',[scope.tenantId,scope.spaceId,id])).rows[0];
  demand(row&&row['checker']===SOURCE_CHECK_PROFILE&&row['definition_digest']===SOURCE_CHECK_DEFINITION
   &&row['claim_digest']===claim&&row['source_id']===source['source_id']&&Number(row['source_revision'])===Number(source['revision'])
   &&row['source_witness']===source['witness']&&row['source_task_id']===source['source_task_id']
   &&row['checked_at'] instanceof Date&&source['accepted_at'] instanceof Date&&row['checked_at']>=source['accepted_at'],'CHECK_BINDING_MISMATCH');
  demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AND (NOT $3::boolean OR clock_timestamp()<$2::timestamptz) AS valid',[(row['checked_at'] as Date).toISOString(),(row['expires_at'] as Date).toISOString(),live])).rows[0]?.['valid']===true,'CHECK_BINDING_MISMATCH');
  return row;
 }
 override async outcome(tx:SqlTransaction,scope:VerifiedScope,c:Parameters<LocalSaveAdmission['outcome']>[2],claim:string,source:Record<string,unknown>):Promise<Pick<Knowledge,'status'|'verification'>>{
  demand((await tx.query("SELECT to_regclass('fabric.storage_knowledge_admissions') IS NOT NULL AS installed")).rows[0]?.['installed']===true,'REQUIRED_CAPABILITY_UNSUPPORTED');
  const status=c.requestedStatus??(c.assertion.intent==='propose'?'proposed':c.assertion.intent==='registered-check'?'source-verified':'user-asserted');
  if(c.prior){
   const prior=(await tx.query('SELECT status,source_id,source_revision,source_witness FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,c.prior.id,c.prior.revision])).rows[0];
   if(c.correctionCommand){
    demand(prior&&['user-asserted','source-verified','disputed'].includes(String(prior['status']))&&['user-asserted','source-verified'].includes(status)&&prior['source_id']===c.assertion.sourceId&&Number(prior['source_revision'])===c.assertion.sourceRevision&&prior['source_witness']===source['witness'],'STALE_REVISION');
   }else{
   const allowed:Record<string,readonly string[]>={proposed:['user-asserted','expired','deleted'],'user-asserted':['source-verified','disputed','superseded','expired','deleted'],'source-verified':['disputed','superseded','expired','deleted'],disputed:['user-asserted','source-verified','superseded','expired','deleted']};
   demand(prior&&allowed[String(prior['status'])]?.includes(status)&&prior['source_id']===c.assertion.sourceId&&Number(prior['source_revision'])===c.assertion.sourceRevision&&prior['source_witness']===source['witness'],'STALE_REVISION');
   if(status==='expired')demand(c.assertion.validUntil&&(await tx.query('SELECT $1::timestamptz<=clock_timestamp() AS expired',[c.assertion.validUntil])).rows[0]?.['expired']===true,'RETENTION_RESTRICTED');
   if(status==='deleted')demand(scope.grants.includes('storage:forget'),'UNAUTHORIZED');
   }
  }
  if(status!=='source-verified'){demand(c.assertion.checkId===null,'CHECK_BINDING_MISMATCH');return {status,verification:null};}
  demand(c.assertion.checkId,'CHECK_BINDING_MISMATCH');const proof=await this.#proof(tx,scope,c.assertion.checkId,claim,source,true);
  return {status,verification:{method:'registered-source-check',checkId:c.assertion.checkId,checkedAt:(proof['checked_at'] as Date).toISOString()}};
 }
 override async knowledge(tx:SqlTransaction,scope:VerifiedScope,k:Knowledge){await this.content(tx,scope,KnowledgeSchema.parse(k));}
 override async commit(tx:SqlTransaction,k:Knowledge,args:readonly unknown[],claim:string,correction=false){
  const functionName=correction?'storage_commit_corrected_knowledge':'storage_commit_typed_knowledge';
  await tx.query('SELECT fabric.'+functionName+'($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[...args,k.status,k.verification?.checkId??null,claim,k.source.digest,k.validFrom,k.validUntil]);
 }
 override async recallEligibility(tx:SqlTransaction,scope:VerifiedScope,row:Record<string,unknown>){
  const m=(await tx.query('SELECT valid_from,valid_until FROM fabric.storage_knowledge_admissions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,row['id'],row['revision']])).rows[0];
  if(m)demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AND ($2::timestamptz IS NULL OR clock_timestamp()<$2::timestamptz) AS live',[m['valid_from'],m['valid_until']])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
 }
 override async inspectMany(tx:SqlTransaction,scope:VerifiedScope,records:Parameters<LocalSaveAdmission['inspectMany']>[2]){
  demand(records.length>0&&records.length<=512,'CONTENT_UNAVAILABLE');
  const rows=(await tx.query(`WITH wanted AS (SELECT unnest($3::uuid[]) AS id,unnest($4::numeric[]) AS revision)
   SELECT m.*,s.key_id AS source_key,s.generation AS source_generation,s.source_task_id AS source_task,
    s.witness AS actual_source_witness,s.accepted_at AS source_at,c.checker,c.definition_digest,c.checked_at,
    c.source_id AS checked_source_id,c.source_revision AS checked_source_revision,c.source_witness AS checked_source_witness,
    c.source_task_id AS checked_source_task,c.source_digest AS checked_source_digest,c.claim_digest AS checked_claim,
    clock_timestamp() AS observed_at
   FROM wanted w JOIN fabric.storage_knowledge_admissions m ON (m.id,m.revision)=(w.id,w.revision)
   JOIN fabric.storage_sources s ON (s.tenant_id,s.space_id,s.source_id,s.revision)=(m.tenant_id,m.space_id,m.source_id,m.source_revision)
   LEFT JOIN fabric.storage_source_checks c ON (c.tenant_id,c.space_id,c.check_id)=(m.tenant_id,m.space_id,m.check_id)
   WHERE m.tenant_id=$1 AND m.space_id=$2 LIMIT 513`,[scope.tenantId,scope.spaceId,records.map(r=>r.knowledge.id),records.map(r=>r.knowledge.revision)])).rows;
  demand(rows.length<=records.length,'INTEGRITY_FAILED');const admissions=new Map(rows.map(m=>[m['id']+'/'+m['revision'],m]));
  for(const {knowledge:k,row} of records){
   const m=admissions.get(k.id+'/'+k.revision);
   // Existing v14 assertions are read as-is, never backfilled or rewritten.
   if(!m){demand(k.revision===1&&k.status==='user-asserted'&&k.verification===null&&k.supersedes===null,'INTEGRITY_FAILED');continue;}
   demand(m['status']===k.status&&m['check_id']===(k.verification?.checkId??null)&&m['source_digest']===k.source.digest
    &&m['source_id']===k.source.sourceId&&Number(m['source_revision'])===k.source.revision&&m['source_witness']===row['source_witness']&&m['actual_source_witness']===row['source_witness']
    &&m['source_task']===k.source.sourceTaskId&&(m['valid_from'] as Date).toISOString()===k.validFrom&&(m['valid_until']===null?null:(m['valid_until'] as Date).toISOString())===k.validUntil
    &&(m['previous_revision']===null?null:Number(m['previous_revision']))===(k.supersedes?.revision??null)&&(!k.supersedes||k.supersedes.id===k.id),'INTEGRITY_FAILED');
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'source',id:k.source.sourceId,revision:k.source.revision,keyId:m['source_key'],generation:m['source_generation']});
   demand(await knowledgeClaim(this.crypto,binding,k.subject,k.value)===m['claim_digest'],'INTEGRITY_FAILED');
   if(k.verification)demand(m['checker']===SOURCE_CHECK_PROFILE&&m['definition_digest']===SOURCE_CHECK_DEFINITION
    &&m['checked_source_id']===k.source.sourceId&&Number(m['checked_source_revision'])===k.source.revision&&m['checked_source_witness']===row['source_witness']
    &&m['checked_source_task']===k.source.sourceTaskId&&m['checked_source_digest']===k.source.digest&&m['checked_claim']===m['claim_digest']
    &&m['checked_at'] instanceof Date&&m['source_at'] instanceof Date&&m['observed_at'] instanceof Date&&m['checked_at']>=m['source_at']&&m['checked_at']<=m['observed_at']
    &&m['checked_at'].toISOString()===k.verification.checkedAt,'INTEGRITY_FAILED');
  }
 }
}
