import { createHash } from 'node:crypto';
import { CurrentAudienceVerifier,NativeRepository,assertVerifiedScope,revalidateScope,lockSpaceBarrier,
 type SqlTransaction,type VerifiedScope } from './owners.js';
import { currentScope } from '../../g1-model/src/model-repository.js';
import { audienceDigest,type AudienceRow } from '../../g1-identity/src/audience.js';
import { demand,StorageError } from './errors.js';
import { object,positive,uuid,digest,list,enumeration } from './decoder.js';
import { ContentClassSchema } from './schema.js';
import type { CurrentStorageAuthority } from './contracts.js';

const period=positive;
export const StoragePolicySchema=object({periods:object({source:period,knowledge:period,artifact:period,draft:period,
 'live-file':period,checkpoint:period,summary:period,index:period,cache:period,ask:period,backup:period}),
 operations:list(enumeration('read','write','forget','backup','restore','maintenance','share'),7,1)});
export const EpochAnchorSchema=object({epoch:positive,anchorId:uuid,policyRevision:positive,controlDigest:digest});
export type EpochAnchor=ReturnType<typeof EpochAnchorSchema.parse>;
/** Installed capability, independently held from content and PostgreSQL snapshots.
 * No public request or archive can install or supply this capability. */
export interface EpochAnchorResolver {current(tenantId:string,spaceId:string):Promise<EpochAnchor|undefined>}
export type StorageOperation=ReturnType<typeof StoragePolicySchema.parse>['operations'][number];
export const SharedSourceSchema=object({relationId:uuid,source:object({id:uuid,revision:positive,witness:digest})});
const SharedSourcesSchema=list(SharedSourceSchema,16,1);
const hash=(raw:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(raw)).digest('hex');
/** Bounded local control integrity scan. Explicit fields, deterministic row order,
 * no descriptive content. Whole-cluster recovery/capacity is not qualified here. */
export async function controlDigest(tx:SqlTransaction,tenantId:string,spaceId:string,policyRevision:number,policyOverride?:ReturnType<typeof StoragePolicySchema.parse>,restrictionOverride?:{sourceId:string;revision:number;epoch:number;at:string},tombstoneOverride?:{entity:{class:string;id:string;revision:number};epoch:number;key:string;at:string},workOverride?:{actorId:string;key:string;binding:string;receiptId:string;jobId:string;entity:{class:string;id:string;revision:number};epoch:number;at:string},headOverride?:{class:string;id:string;revision:number;witness:string;keyId:string;generation:string;epoch:number;at:string;expiresAt:string},shareOverride?:{relationId:string;sourceSpaceId:string;sourceId:string;sourceRevision:number;sourceTaskId:string;sourceEpoch:number;destinationEpoch:number}):Promise<string>{
 const data:unknown[]=[];
 // Ordinary reads still rescan every control at every boundary. Send the seven
 // bounded projections together, preserving pg numeric strings, field/row order
 // and Date encoding used by existing anchors. Publication overrides retain the
 // original typed UNION queries below; no control result is cached.
 if(!policyOverride&&!restrictionOverride&&!tombstoneOverride&&!workOverride&&!headOverride&&!shareOverride){
  const projections=[
   'SELECT kind FROM fabric.storage_rooms WHERE tenant_id=$1 AND space_id=$2',
   'SELECT revision::text AS revision,periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',
   'SELECT class,id,revision::text AS revision,witness,key_id,generation,epoch::text AS epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,storage_current_heads.revision',
   'SELECT class,id,revision::text AS revision,epoch::text AS epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,storage_tombstones.revision',
   'SELECT source_id,source_revision::text AS source_revision,epoch::text AS epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 ORDER BY source_id,storage_restrictions.source_revision,kind',
   'SELECT actor_id,command_key,binding_digest,receipt_id,epoch::text AS epoch,at FROM fabric.storage_commands WHERE tenant_id=$1 AND space_id=$2 ORDER BY actor_id,command_key',
   'SELECT job_id,actor_id,command_key,class,target_id,target_revision::text AS target_revision,epoch::text AS epoch,at FROM fabric.storage_outbox WHERE tenant_id=$1 AND space_id=$2 ORDER BY job_id'
  ];
  const raw=(await tx.query('SELECT json_build_array('+projections.map(sql=>"(SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM ("+sql+' LIMIT 513) q)').join(',')+') AS controls',[tenantId,spaceId,policyRevision])).rows[0]?.['controls'];
  demand(Array.isArray(raw)&&raw.length===7,'AUTHORITY_UNAVAILABLE');
  for(const rows of raw){
   demand(Array.isArray(rows)&&rows.length<=512,'AUTHORITY_UNAVAILABLE');
   for(const row of rows){
    demand(row!==null&&typeof row==='object'&&!Array.isArray(row),'AUTHORITY_UNAVAILABLE');
    for(const field of ['at','accepted_at','expires_at'])if(field in row){
     demand(typeof row[field]==='string'&&Number.isFinite(Date.parse(row[field])),'AUTHORITY_UNAVAILABLE');row[field]=new Date(row[field]);
    }
   }
   data.push(rows);
  }
 }else{
 for(const sql of [
  'SELECT kind FROM fabric.storage_rooms WHERE tenant_id=$1 AND space_id=$2',
  'SELECT revision,periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',
  'SELECT class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,revision',
  'SELECT class,id,revision,epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,revision',
  'SELECT source_id,source_revision,epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 ORDER BY source_id,source_revision,kind',
  'SELECT actor_id,command_key,binding_digest,receipt_id,epoch,at FROM fabric.storage_commands WHERE tenant_id=$1 AND space_id=$2 ORDER BY actor_id,command_key',
  'SELECT job_id,actor_id,command_key,class,target_id,target_revision,epoch,at FROM fabric.storage_outbox WHERE tenant_id=$1 AND space_id=$2 ORDER BY job_id'
 ]){
  const rows=headOverride&&sql.includes('FROM fabric.storage_current_heads')
   ?(await tx.query(`SELECT class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at FROM (SELECT class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 UNION ALL SELECT $3::text,$4::uuid,$5::numeric,$6::text,$7::uuid,$8::uuid,$9::numeric,$10::timestamptz,$11::timestamptz) h ORDER BY class,id,revision LIMIT 513`,[tenantId,spaceId,headOverride.class,headOverride.id,headOverride.revision,headOverride.witness,headOverride.keyId,headOverride.generation,headOverride.epoch,headOverride.at,headOverride.expiresAt])).rows
   :workOverride&&sql.includes('FROM fabric.storage_commands')
   ?(await tx.query(`SELECT actor_id,command_key,binding_digest,receipt_id,epoch,at FROM (SELECT actor_id,command_key,binding_digest,receipt_id,epoch,at FROM fabric.storage_commands WHERE tenant_id=$1 AND space_id=$2 UNION ALL SELECT $3::uuid,$4::uuid,$5::text,$6::uuid,$7::numeric,$8::timestamptz) c ORDER BY actor_id,command_key LIMIT 513`,[tenantId,spaceId,workOverride.actorId,workOverride.key,workOverride.binding,workOverride.receiptId,workOverride.epoch,workOverride.at])).rows
   :workOverride&&sql.includes('FROM fabric.storage_outbox')
   ?(await tx.query(`SELECT job_id,actor_id,command_key,class,target_id,target_revision,epoch,at FROM (SELECT job_id,actor_id,command_key,class,target_id,target_revision,epoch,at FROM fabric.storage_outbox WHERE tenant_id=$1 AND space_id=$2 UNION ALL SELECT $3::uuid,$4::uuid,$5::uuid,$6::text,$7::uuid,$8::numeric,$9::numeric,$10::timestamptz) j ORDER BY job_id LIMIT 513`,[tenantId,spaceId,workOverride.jobId,workOverride.actorId,workOverride.key,workOverride.entity.class,workOverride.entity.id,workOverride.entity.revision,workOverride.epoch,workOverride.at])).rows
   :tombstoneOverride&&sql.includes('FROM fabric.storage_tombstones')
   ?(await tx.query(`SELECT class,id,revision,epoch,command_key,at FROM (SELECT class,id,revision,epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 UNION ALL SELECT $3::text,$4::uuid,$5::numeric,$6::numeric,$7::uuid,$8::timestamptz) d ORDER BY class,id,revision LIMIT 513`,[tenantId,spaceId,tombstoneOverride.entity.class,tombstoneOverride.entity.id,tombstoneOverride.entity.revision,tombstoneOverride.epoch,tombstoneOverride.key,tombstoneOverride.at])).rows
   :restrictionOverride&&sql.includes('FROM fabric.storage_restrictions')
   ?(await tx.query(`SELECT source_id,source_revision,epoch,kind,at FROM (SELECT source_id,source_revision,epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 UNION ALL SELECT $3::uuid,$4::numeric,$5::numeric,'revoked'::text,$6::timestamptz) r ORDER BY source_id,source_revision,kind LIMIT 513`,[tenantId,spaceId,restrictionOverride.sourceId,restrictionOverride.revision,restrictionOverride.epoch,restrictionOverride.at])).rows
   :sql.includes('$3')&&policyOverride
   ?(await tx.query('SELECT $1::numeric AS revision,$2::jsonb AS periods,$3::jsonb AS operations',[policyRevision,JSON.stringify(policyOverride.periods),JSON.stringify(policyOverride.operations)])).rows
   :(await tx.query(sql+' LIMIT 513',sql.includes('$3')?[tenantId,spaceId,policyRevision]:[tenantId,spaceId])).rows;
  demand(rows.length<=512,'AUTHORITY_UNAVAILABLE');data.push(rows);
 }
 }
 if((await tx.query("SELECT to_regclass('fabric.storage_shares') IS NOT NULL AS installed")).rows[0]?.['installed']===true){
  const rows=shareOverride
   ?(await tx.query(`SELECT relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch FROM (SELECT relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 UNION ALL SELECT $3::uuid,1::numeric,$4::uuid,$5::uuid,$6::numeric,$7::uuid,'active'::text,$8::numeric,$9::numeric) r ORDER BY relation_id,revision LIMIT 513`,[tenantId,spaceId,shareOverride.relationId,shareOverride.sourceSpaceId,shareOverride.sourceId,shareOverride.sourceRevision,shareOverride.sourceTaskId,shareOverride.sourceEpoch,shareOverride.destinationEpoch])).rows
   :(await tx.query('SELECT relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 ORDER BY relation_id,revision LIMIT 513',[tenantId,spaceId])).rows;
  demand(rows.length<=512,'AUTHORITY_UNAVAILABLE');data.push(rows);
 }
 return hash(data);
}
/** The narrow JSON bridge preserves projection order and PG numeric strings.
 * Normalize only timestamp encoding back to the ordinary pg driver's Date type.
 * Never hash the JSONB object representation or change historical v2 digests. */
export function bridgedControls(raw:unknown):Record<string,unknown>[][]{
 demand(Array.isArray(raw)&&raw.length===8,'AUTHORITY_UNAVAILABLE');
 return raw.map(rows=>{
  demand(Array.isArray(rows)&&rows.length<=512,'AUTHORITY_UNAVAILABLE');
  return rows.map((row:unknown)=>{
   demand(row!==null&&typeof row==='object'&&!Array.isArray(row),'AUTHORITY_UNAVAILABLE');
   const copy={...row} as Record<string,unknown>;
   for(const field of ['at','accepted_at','expires_at'])if(field in copy){
    demand(typeof copy[field]==='string'&&Number.isFinite(Date.parse(copy[field])),'AUTHORITY_UNAVAILABLE');copy[field]=new Date(copy[field]);
   }
   return copy;
  });
 });
}


export class StorageAuthorityRepository implements CurrentStorageAuthority {
 constructor(readonly anchors:EpochAnchorResolver,readonly native:NativeRepository,
  readonly audience=new CurrentAudienceVerifier()){}
 /** Installed composition capability. Resolve every opaque relation before
  * acquiring any native/accounting barrier. Callers cannot choose source scopes.
  * Frozen references are checked again at every accounting publication boundary. */
 forSharedSources(raw:unknown):CurrentStorageAuthority{
  const refs=SharedSourcesSchema.parse(raw);
  demand(new Set(refs.map(r=>r.relationId)).size===refs.length,'INVALID_SCHEMA');
  return Object.freeze({assertCurrent:async(tx:SqlTransaction,scope:VerifiedScope,intent:Parameters<CurrentStorageAuthority['assertCurrent']>[2])=>{
   await this.lockSharedSources(tx,scope,refs);
   for(const ref of refs)await this.sharedEntity(tx,scope,ref,intent.expiresAt);
   await this.assertCurrent(tx,scope,intent);
   for(const ref of refs)await this.sharedEntity(tx,scope,ref,intent.expiresAt);
  }});
 }
 private async lockSharedSources(tx:SqlTransaction,scope:VerifiedScope,refs:ReturnType<typeof SharedSourcesSchema.parse>){
  assertVerifiedScope(scope);await revalidateScope(scope);
  const spaces=new Set([scope.spaceId]);
  for(const ref of refs){
   const row=(await tx.query('SELECT source_space_id FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 AND relation_id=$3 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId,ref.relationId])).rows[0];
   demand(row&&row['source_space_id']!==scope.spaceId,'UNAUTHORIZED');spaces.add(uuid.parse(row['source_space_id']));
  }
  demand((await tx.query("SELECT to_regclass('fabric.recovery_task_controls') IS NOT NULL AS installed")).rows[0]?.['installed']===true,'AUTHORITY_UNAVAILABLE');
  for(const spaceId of [...spaces].sort())await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,spaceId])]);
 }
 async check(tx:SqlTransaction,scope:VerifiedScope,operation:StorageOperation,expiresAt?:string):Promise<EpochAnchor>{
  assertVerifiedScope(scope);await revalidateScope(scope);
  demand(await lockSpaceBarrier(tx,scope),'AUTHORITY_UNAVAILABLE');await currentScope(tx,scope);
  demand(scope.grants.includes('storage:'+operation),'UNAUTHORIZED');
  let anchor:EpochAnchor|undefined;
  try{const raw=await this.anchors.current(scope.tenantId,scope.spaceId);anchor=raw&&EpochAnchorSchema.parse(raw);}
  catch{throw new StorageError('AUTHORITY_UNAVAILABLE');}
  demand(anchor,'AUTHORITY_UNAVAILABLE');
  // These rows are immutable; the Space barrier serializes every enrolled
  // epoch publication. SELECT FOR SHARE would require an unnecessary UPDATE ACL.
  const row=(await tx.query('SELECT epoch,anchor_id,policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2 ORDER BY epoch DESC LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0];
  demand(row&&Number(row['epoch'])===anchor.epoch&&row['anchor_id']===anchor.anchorId
   &&Number(row['policy_revision'])===anchor.policyRevision&&row['control_digest']===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
  const policyRow=(await tx.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[scope.tenantId,scope.spaceId,anchor.policyRevision])).rows[0];
  demand(policyRow,'AUTHORITY_UNAVAILABLE');const policy=StoragePolicySchema.parse(policyRow);
  demand(new Set(policy.operations).size===policy.operations.length&&Object.values(policy.periods).every(n=>n<=86400),'RETENTION_RESTRICTED');
  demand(policy.operations.includes(operation),'UNAUTHORIZED');
  demand(await controlDigest(tx,scope.tenantId,scope.spaceId,anchor.policyRevision)===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
  // Repeat live identity and time after every lock/digest wait, never use start time.
  await currentScope(tx,scope);await revalidateScope(scope);
  if(expiresAt){const live=(await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[expiresAt])).rows[0];demand(live?.['live']===true,'EXPIRED_COMMAND');}
  return anchor;
 }
 async assertCurrent(tx:SqlTransaction,scope:VerifiedScope,intent:Parameters<CurrentStorageAuthority['assertCurrent']>[2]):Promise<void>{
  await this.check(tx,scope,intent.purpose==='ask'?'read':'maintenance',intent.expiresAt);
  const s=await this.native.load(tx,scope,intent.sessionId);await this.native.fresh(tx,scope,s);
  demand(s.binding.intent==='Ask'&&s.binding.purpose===(intent.purpose==='ask'?'answer':'maintenance')
   &&s.admission.executionClass==='service'&&s.admission.resourceId===null&&s.admission.computerCapability===null
   &&!s.admission.targetEffect&&!s.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  await this.currentAudience(tx,scope,s.binding.taskId);
  await this.check(tx,scope,intent.purpose==='ask'?'read':'maintenance',intent.expiresAt);
  await this.native.fresh(tx,scope,s);
 }
 /** No caller-supplied historical recipients/digest authorize reads. */
 async currentAudience(tx:SqlTransaction,scope:VerifiedScope,sourceTaskId:string,sourceSpaceId=scope.spaceId){
  uuid.parse(sourceTaskId);uuid.parse(sourceSpaceId);
  const raw=(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[sourceSpaceId,scope.spaceId,sourceTaskId])).rows[0]?.['audience'];
  demand(Array.isArray(raw)&&raw.length>0,'UNAUTHORIZED');const rows=raw as AudienceRow[];
  const binding={sourceSpaceId,destinationSpaceId:scope.spaceId,sourceTaskId,
   recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)};
  await this.audience.verify(tx,scope,binding);return binding;
 }
 /** Exact immutable lineage for control history. Deliberately does not call
  * entity(): a tombstone/revocation must not prevent authorized inspection of
  * its own control receipt. This confers no content-read or worker capability. */
 async controlAudience(tx:SqlTransaction,scope:VerifiedScope,raw:unknown){
  const ref=object({class:ContentClassSchema,id:uuid,revision:positive}).parse(raw);
  const row=(await tx.query('SELECT source_task_id FROM fabric.storage_entities WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5',[scope.tenantId,scope.spaceId,ref.class,ref.id,ref.revision])).rows[0];
  demand(row&&typeof row['source_task_id']==='string','AUTHORITY_UNAVAILABLE');
  await this.currentAudience(tx,scope,row['source_task_id']);
 }
 /** Entry point for an explicitly shared opaque source reference. Call before
  * any one-Space authority/native/storage lock; the future disclosure owner must
  * predeclare the full dependency lock set before performing content work.
  * This slice returns controls only and never decrypts or grants source SQL access. */
 async sharedEntity(tx:SqlTransaction,scope:VerifiedScope,raw:unknown,expiresAt?:string){
  const input=SharedSourceSchema.parse(raw);
  assertVerifiedScope(scope);await revalidateScope(scope);
  const route=(await tx.query('SELECT source_space_id,source_id,source_revision,source_task_id,status FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 AND relation_id=$3 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId,input.relationId])).rows[0];
  demand(route&&typeof route['source_space_id']==='string'&&route['source_space_id']!==scope.spaceId,'UNAUTHORIZED');
  const sourceSpaceId=uuid.parse(route['source_space_id']);
  // No unverified source scope object and no GUC change. Both keys use the exact
  // installed F03 barrier; immutable relation routing is reloaded after waits.
  await this.lockSharedSources(tx,scope,[input]);
  await this.check(tx,scope,'read',expiresAt);
  demand((await tx.query("SELECT to_regprocedure('fabric.storage_shared_controls_v2(uuid)') IS NOT NULL AS installed")).rows[0]?.['installed']===true,'AUTHORITY_UNAVAILABLE');
  const inspect=async()=>{
   const raw=(await tx.query('SELECT fabric.storage_shared_controls_v2($1) AS control',[input.relationId])).rows[0]?.['control'];
   demand(raw&&typeof raw==='object','UNAUTHORIZED');const c=raw as Record<string,unknown>;
   const relation=c['relation'] as Record<string,unknown>|undefined,epoch=c['epoch'] as Record<string,unknown>|undefined;
   demand(relation&&relation['tenant_id']===scope.tenantId&&relation['destination_space_id']===scope.spaceId
    &&relation['source_space_id']===sourceSpaceId&&relation['source_id']===input.source.id
    &&Number(relation['source_revision'])===input.source.revision&&relation['status']==='active','UNAUTHORIZED');
   let anchor:EpochAnchor|undefined;
   try{const raw=await this.anchors.current(scope.tenantId,sourceSpaceId);anchor=raw&&EpochAnchorSchema.parse(raw);}catch{throw new StorageError('AUTHORITY_UNAVAILABLE');}
   demand(anchor&&epoch&&Number(epoch['epoch'])===anchor.epoch&&epoch['anchor_id']===anchor.anchorId
    &&Number(epoch['policy_revision'])===anchor.policyRevision&&epoch['control_digest']===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
   const controls=bridgedControls(c['controls']);demand(hash(controls)===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');
   demand(controls[0]?.[0]?.['kind']==='group'||controls[0]?.[0]?.['kind']==='share','UNAUTHORIZED');
   const policyRow=controls[1]?.[0];demand(policyRow,'AUTHORITY_UNAVAILABLE');
   const policy=StoragePolicySchema.parse({periods:policyRow['periods'],operations:policyRow['operations']});
   demand(new Set(policy.operations).size===policy.operations.length&&Object.values(policy.periods).every(n=>n<=86400),'RETENTION_RESTRICTED');
   demand(policy.operations.includes('read')&&policy.operations.includes('share'),'UNAUTHORIZED');
   const head=controls[2]?.filter(h=>h['class']==='source'&&h['id']===input.source.id).sort((a,b)=>Number(b['revision'])-Number(a['revision']))[0];
   demand(head&&Number(head['revision'])===input.source.revision&&head['witness']===input.source.witness,'STALE_REVISION');
   demand(!controls[3]?.some(t=>t['class']==='source'&&t['id']===input.source.id&&Number(t['revision'])>=input.source.revision)
    &&!controls[4]?.some(r=>r['source_id']===input.source.id&&Number(r['source_revision'])===input.source.revision),'RETENTION_RESTRICTED');
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[head['expires_at']])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
   const sourceTaskId=uuid.parse(relation['source_task_id']);await this.currentAudience(tx,scope,sourceTaskId,sourceSpaceId);
   return {...head,id:input.source.id,tenant_id:scope.tenantId,space_id:sourceSpaceId,source_task_id:sourceTaskId,relation_id:input.relationId};
  };
  await inspect();await this.check(tx,scope,'read',expiresAt);
  // Refresh separately held anchors and clocks after every audience/native wait.
  return inspect();
 }
 async entity(tx:SqlTransaction,scope:VerifiedScope,raw:unknown){
  const ref=object({class:ContentClassSchema,id:uuid,revision:positive,witness:digest}).parse(raw);
  await this.check(tx,scope,'read');
  const head=(await tx.query(`SELECT h.*,e.source_task_id FROM fabric.storage_current_heads h JOIN fabric.storage_entities e USING(tenant_id,space_id,class,id,revision)
   WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class=$3 AND h.id=$4 ORDER BY h.revision DESC LIMIT 1`,[scope.tenantId,scope.spaceId,ref.class,ref.id])).rows[0];
  demand(head&&Number(head['revision'])===ref.revision&&head['witness']===ref.witness,'STALE_REVISION');
  const restricted=(await tx.query(`SELECT EXISTS(SELECT 1 FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision>=$5)
   OR EXISTS(SELECT 1 FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 AND $3='source' AND source_id=$4 AND source_revision=$5) AS restricted`,[scope.tenantId,scope.spaceId,ref.class,ref.id,ref.revision])).rows[0];
  demand(restricted?.['restricted']===false,'RETENTION_RESTRICTED');
  demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[head['expires_at']])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
  // Every accepted class carries installed origin Task lineage for serving.
  // Optional source payload attribution does not waive current audience checks
  // for knowledge, files, derived views, Ask records or backup metadata. Legacy
  // nullable lineage remains unreadable until its owner enrolls a valid record.
  demand(typeof head['source_task_id']==='string','AUTHORITY_UNAVAILABLE');
  await this.currentAudience(tx,scope,head['source_task_id']);
  await this.check(tx,scope,'read');
  demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[head['expires_at']])).rows[0]?.['live']===true,'RETENTION_RESTRICTED');
  return head;
 }
}
