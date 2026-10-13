import { object,uuid,timestamp,positive,refined,nullable,enumeration } from './decoder.js';
import { demand } from './errors.js';
import { StorageAuthorityRepository } from './authority.js';
import { EpochWitnessJournal } from './epoch-journal.js';
import { GraphRefSchema } from './dependency-graph.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,NativeRepository } from './owners.js';

export const PropagationCommandSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp});
export const PropagationBatchSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp,limit:refined(positive,n=>n<=16)});
export const PropagationLeaseSchema=object({jobId:uuid,leaseId:uuid,sessionId:uuid,expiresAt:timestamp});
const OutcomeSchema=enumeration('invalidated','already-invalidated','obsolete');
type Command=ReturnType<typeof PropagationCommandSchema.parse>;
export interface PropagationHooks {
 /** Installed fault/observation hooks; never public request fields. */
 afterClaim?(tx:SqlTransaction):Promise<void>;
 afterMutation?(tx:SqlTransaction):Promise<void>;
 afterCommitted?(jobId:string):Promise<void>;
}
/** Bounded control-only invalidation worker. It cannot decrypt, rebuild content,
 * advance canonical heads, create budgets, start computers or erase ciphertext.
 * Every claim and every exact descendant mutation commits independently. */
export class PropagationRetryRepository {
 readonly authority:StorageAuthorityRepository;readonly workerId:string;readonly leaseMs:number;
 constructor(readonly uow:AsyncUnitOfWork,journal:EpochWitnessJournal,readonly native:NativeRepository,
  owner:{workerId:string;leaseMs:number},readonly hooks:PropagationHooks={}){
  this.authority=new StorageAuthorityRepository(journal,native);this.workerId=uuid.parse(owner.workerId);
  this.leaseMs=refined(positive,n=>n>=100&&n<=30000).parse(owner.leaseMs);
 }
 private async current(tx:SqlTransaction,s:VerifiedScope,c:{sessionId:string;expiresAt:string}){
  demand(s.grants.includes('task:write'),'UNAUTHORIZED');
  await this.authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:c.sessionId,expiresAt:c.expiresAt});
  demand((await tx.query('SHOW transaction_isolation')).rows[0]?.['transaction_isolation']==='read committed','REQUIRED_CAPABILITY_UNSUPPORTED');
 }
 private async event(tx:SqlTransaction,s:VerifiedScope,c:Command){
  const e=(await tx.query('SELECT * FROM fabric.storage_graph_events WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[s.tenantId,s.spaceId,s.actorId,c.key])).rows[0];
  demand(e,'CONTENT_UNAVAILABLE');await this.authority.controlAudience(tx,s,{class:e['class'],id:e['id'],revision:Number(e['revision'])});return e;
 }
 private async jobAudience(tx:SqlTransaction,s:VerifiedScope,jobId:string){
  const rows=(await tx.query(`SELECT DISTINCT n.source_task_id FROM fabric.storage_graph_jobs j
   CROSS JOIN LATERAL jsonb_to_recordset(fabric.storage_graph_closure(j.class,j.id,j.revision,j.witness)) AS r(class text,id uuid,revision numeric,witness text)
   JOIN fabric.storage_graph_nodes n ON (n.tenant_id,n.space_id,n.class,n.id,n.revision,n.witness)=(j.tenant_id,j.space_id,r.class,r.id,r.revision,r.witness)
   WHERE j.tenant_id=$1 AND j.space_id=$2 AND j.actor_id=$3 AND j.job_id=$4 ORDER BY n.source_task_id LIMIT 513`,[s.tenantId,s.spaceId,s.actorId,jobId])).rows;
  demand(rows.length>0&&rows.length<=512,'INTEGRITY_FAILED');
  for(const row of rows)await this.authority.currentAudience(tx,s,uuid.parse(row['source_task_id']));
 }
 async claim(s:VerifiedScope,raw:unknown){
  const c=PropagationCommandSchema.parse(raw);
  return this.uow.withScope(s,async tx=>{
   await this.current(tx,s,c);await this.event(tx,s,c);
   const id=nullable(uuid).parse((await tx.query('SELECT fabric.storage_propagation_claim($1,$2,$3,$4) AS id',[c.key,this.workerId,c.sessionId,this.leaseMs])).rows[0]?.['id']);
   await this.hooks.afterClaim?.(tx);await this.current(tx,s,c);await this.event(tx,s,c);
   if(id===null)return null;
   const l=(await tx.query('SELECT *,clock_timestamp()<expires_at AS live FROM fabric.storage_propagation_leases WHERE tenant_id=$1 AND space_id=$2 AND lease_id=$3',[s.tenantId,s.spaceId,id])).rows[0];
   demand(l&&l['live']===true&&l['expires_at'] instanceof Date,'STALE_FENCE');
   await this.jobAudience(tx,s,uuid.parse(l['job_id']));await this.current(tx,s,c);
   demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[l['expires_at']])).rows[0]?.['live']===true,'STALE_FENCE');
   return {jobId:uuid.parse(l['job_id']),leaseId:id,sessionId:c.sessionId,leaseExpiresAt:l['expires_at'].toISOString(),attempt:positive.parse(l['attempt'])};
  });
 }
 async complete(s:VerifiedScope,raw:unknown){
  const c=PropagationLeaseSchema.parse(raw);
  const result=await this.uow.withScope(s,async tx=>{
   await this.current(tx,s,c);
   const j=(await tx.query('SELECT j.*,n.source_task_id FROM fabric.storage_graph_jobs j JOIN fabric.storage_graph_nodes n USING(tenant_id,space_id,class,id,revision,witness) WHERE j.tenant_id=$1 AND j.space_id=$2 AND j.actor_id=$3 AND j.job_id=$4',[s.tenantId,s.spaceId,s.actorId,c.jobId])).rows[0];
   demand(j,'CONTENT_UNAVAILABLE');const original={key:uuid.parse(j['command_key']),sessionId:c.sessionId,expiresAt:c.expiresAt};await this.event(tx,s,original);
   await this.jobAudience(tx,s,c.jobId);
   const before=(await tx.query('SELECT lease_id FROM fabric.storage_propagation_results WHERE tenant_id=$1 AND space_id=$2 AND job_id=$3',[s.tenantId,s.spaceId,c.jobId])).rows[0];
   const outcome=OutcomeSchema.parse((await tx.query('SELECT fabric.storage_propagation_complete($1,$2,$3,$4) AS outcome',[c.jobId,c.leaseId,this.workerId,c.sessionId])).rows[0]?.['outcome']);
   await this.hooks.afterMutation?.(tx);await this.current(tx,s,c);await this.event(tx,s,original);await this.jobAudience(tx,s,c.jobId);
   if(!before)demand((await tx.query('SELECT clock_timestamp()<expires_at AS live FROM fabric.storage_propagation_leases WHERE tenant_id=$1 AND space_id=$2 AND job_id=$3 AND lease_id=$4',[s.tenantId,s.spaceId,c.jobId,c.leaseId])).rows[0]?.['live']===true,'STALE_FENCE');
   return {jobId:c.jobId,leaseId:c.leaseId,outcome,replayAllowed:false as const};
  });
  await this.hooks.afterCommitted?.(c.jobId);return result;
 }
 /** Actual current progress over the immutable original job set. 'Converged'
  * means local invalidation processing only, never physical erasure or restore. */
 async progress(s:VerifiedScope,raw:unknown){
  const c=PropagationCommandSchema.parse(raw);
  return this.uow.withScope(s,async tx=>{
   await this.current(tx,s,c);const e=await this.event(tx,s,c);
   const rows=(await tx.query(`SELECT j.job_id,j.class,j.id,j.revision,j.witness,r.outcome,r.lease_id,
    EXISTS(SELECT 1 FROM fabric.storage_propagation_leases l WHERE (l.tenant_id,l.space_id,l.job_id)=(j.tenant_id,j.space_id,j.job_id) AND l.expires_at>clock_timestamp()) AS leased
    FROM fabric.storage_graph_jobs j LEFT JOIN fabric.storage_propagation_results r USING(tenant_id,space_id,job_id)
    WHERE j.tenant_id=$1 AND j.space_id=$2 AND j.actor_id=$3 AND j.command_key=$4 ORDER BY j.class,j.id,j.revision LIMIT 513`,[s.tenantId,s.spaceId,s.actorId,c.key])).rows;
   demand(rows.length<=512,'INTEGRITY_FAILED');await this.current(tx,s,c);
   const jobs=rows.map(r=>({jobId:uuid.parse(r['job_id']),ref:GraphRefSchema.parse({class:r['class'],id:r['id'],revision:Number(r['revision']),witness:r['witness']}),status:r['outcome']===null?(r['leased']===true?'leased' as const:'pending' as const):OutcomeSchema.parse(r['outcome'])}));
   const completed=jobs.filter(j=>j.status!=='pending'&&j.status!=='leased').length;
   return {status:completed===jobs.length?'converged' as const:completed?'partial-retry' as const:'pending' as const,
    coverage:'enrolled-local-graph' as const,reason:e['reason'],originalKey:c.key,total:jobs.length,completed,remaining:jobs.length-completed,
    jobs,cleanup:'ciphertext-retained' as const,backupCopies:null,externalCopies:null,alreadyDeliveredRecalled:false as const,replayAllowed:false as const};
  });
 }
 async run(s:VerifiedScope,raw:unknown){
  const c=PropagationBatchSchema.parse(raw),command={key:c.key,sessionId:c.sessionId,expiresAt:c.expiresAt};
  for(let i=0;i<c.limit;i++){const l=await this.claim(s,command);if(l===null)break;await this.complete(s,{jobId:l.jobId,leaseId:l.leaseId,sessionId:c.sessionId,expiresAt:c.expiresAt});}
  return this.progress(s,command);
 }
}
