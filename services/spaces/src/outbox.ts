import { canonicalDigest, nonEmptyString, nonNegativeInteger, requireCondition } from '../../../engine/contracts/src/identity.js';
import type { ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
export interface MutationInput {scope:ScopeRef;recordId:string;expectedRevision:number;payload:Record<string,unknown>}
export interface OutboxInput {jobId:string;kind:string;payload:Record<string,unknown>}
export interface MutationRecord {scope:ScopeRef;recordId:string;revision:number;payload:Record<string,unknown>}
export interface OutboxJob extends OutboxInput {scope:ScopeRef;recordId:string;commitRevision:number;requestDigest:string;state:'pending'|'dispatching'|'unknown'|'completed'}
export interface CommitReceipt {recordId:string;jobId:string;revision:number}
export interface OutboxSnapshot {records:MutationRecord[];jobs:OutboxJob[];tombstones:string[]}
function scoped(scope:ScopeRef,id:string):string {parseScope(scope);nonEmptyString(id);return canonicalDigest({scope,id});}
/** Synchronous deterministic transaction owner. No actual PostgreSQL durability qualification. */
export class OutboxRepository {
 private readonly records=new Map<string,MutationRecord>();
 private readonly jobs=new Map<string,OutboxJob>();
 private readonly tombstones=new Set<string>();
 constructor(private readonly authorize:(scope:ScopeRef)=>void){}
 private current(scope:ScopeRef):void {parseScope(scope);requireCondition(!this.tombstones.has(canonicalDigest(scope)),'UNAUTHORIZED','Deleted Space');this.authorize(scope);}
 commit(input:MutationInput,job:OutboxInput,fault:'none'|'before-commit'|'after-commit'='none'):CommitReceipt {
  canonicalDigest({input,job});this.current(input.scope);nonNegativeInteger(input.expectedRevision);nonEmptyString(job.kind);
  const recordKey=scoped(input.scope,input.recordId),jobKey=scoped(input.scope,job.jobId),requestDigest=canonicalDigest({input,job});
  const prior=this.jobs.get(jobKey);if(prior!==undefined){requireCondition(prior.requestDigest===requestDigest,'IDEMPOTENCY_CONFLICT','Outbox identity reused for changed mutation');return {recordId:prior.recordId,jobId:prior.jobId,revision:prior.commitRevision};}
  const previous=this.records.get(recordKey);requireCondition((previous?.revision??0)===input.expectedRevision,'STALE_REVISION','Mutation CAS conflict');
  const revision=nonNegativeInteger(input.expectedRevision+1);
  const record:MutationRecord={scope:structuredClone(input.scope),recordId:input.recordId,revision,payload:structuredClone(input.payload)};
  const pending:OutboxJob={...structuredClone(job),scope:structuredClone(input.scope),recordId:input.recordId,commitRevision:revision,requestDigest,state:'pending'};
  if(fault==='before-commit')throw new Error('Injected crash before atomic commit');
  this.records.set(recordKey,record);this.jobs.set(jobKey,pending); // One synchronous linearization point, no await.
  if(fault==='after-commit')throw new Error('Injected crash after durable-model commit, before acknowledgement');
  return {recordId:input.recordId,jobId:job.jobId,revision};
 }
 getRecord(scope:ScopeRef,id:string):MutationRecord {this.current(scope);const row=this.records.get(scoped(scope,id));requireCondition(row!==undefined,'INVALID_SCHEMA','Missing mutation');return structuredClone(row);}
 getJob(scope:ScopeRef,id:string):OutboxJob {this.current(scope);const job=this.jobs.get(scoped(scope,id));requireCondition(job!==undefined,'INVALID_SCHEMA','Missing job');return structuredClone(job);}
 deliver(scope:ScopeRef,id:string,handler:(job:OutboxJob)=>void,fault:'none'|'after-effect'='none'):OutboxJob {
  this.current(scope);const job=this.jobs.get(scoped(scope,id));requireCondition(job!==undefined,'INVALID_SCHEMA','Missing job');
  if(job.state==='completed')return structuredClone(job);
  requireCondition(job.state==='pending','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Unknown/dispatching job must reconcile before retry');
  job.state='dispatching';
  try {handler(structuredClone(job));if(fault==='after-effect')throw new Error('Injected acknowledgement loss');job.state='completed';}
  catch(error){job.state='unknown';throw error;}
  return structuredClone(job);
 }
 reconcile(scope:ScopeRef,id:string,lookup:(job:OutboxJob)=>'found'|'absent-safe'|'unknown'):OutboxJob {
  this.current(scope);const job=this.jobs.get(scoped(scope,id));requireCondition(job!==undefined,'INVALID_SCHEMA','Missing job');
  if(job.state==='completed')return structuredClone(job);
  requireCondition(job.state==='unknown'||job.state==='dispatching','INVALID_SCHEMA','Only unknown jobs reconcile');
  const result=lookup(structuredClone(job));requireCondition(['found','absent-safe','unknown'].includes(result),'INVALID_SCHEMA','Explicit safe reconciliation result required');
  job.state=result==='found'?'completed':result==='absent-safe'?'pending':'unknown';return structuredClone(job);
 }
 tombstone(scope:ScopeRef):void {parseScope(scope);this.tombstones.add(canonicalDigest(scope));}
 snapshot():OutboxSnapshot {
  const readable=(scope:ScopeRef):boolean=>{if(this.tombstones.has(canonicalDigest(scope)))return false;this.current(scope);return true;};
  const records=[...this.records.values()].filter(row=>readable(row.scope));
  const jobs=[...this.jobs.values()].filter(row=>readable(row.scope));
  return structuredClone({records,jobs,tombstones:[...this.tombstones]});
 }
 restore(snapshot:OutboxSnapshot):void {
  canonicalDigest(snapshot);for(const tombstone of snapshot.tombstones)this.tombstones.add(nonEmptyString(tombstone));
  const records=new Map(this.records),jobs=new Map(this.jobs);
  for(const row of snapshot.records){if(this.tombstones.has(canonicalDigest(row.scope)))continue;this.current(row.scope);const id=scoped(row.scope,row.recordId),old=records.get(id);nonNegativeInteger(row.revision);requireCondition(row.revision>0,'INVALID_SCHEMA','Positive mutation revision required');if(old===undefined||old.revision<row.revision)records.set(id,structuredClone(row));}
  for(const row of snapshot.jobs){if(this.tombstones.has(canonicalDigest(row.scope)))continue;this.current(row.scope);const id=scoped(row.scope,row.jobId);if(jobs.has(id))continue;requireCondition(['pending','dispatching','unknown','completed'].includes(row.state),'INVALID_SCHEMA','Invalid restored job');const mutation=records.get(scoped(row.scope,row.recordId));nonNegativeInteger(row.commitRevision);requireCondition(mutation!==undefined&&row.commitRevision>0&&row.commitRevision<=mutation.revision,'INVALID_SCHEMA','Restored job requires committed mutation');const restored=structuredClone(row);if(restored.state==='dispatching')restored.state='unknown';jobs.set(id,restored);}
  this.records.clear();for(const [id,row] of records)this.records.set(id,row);
  this.jobs.clear();for(const [id,row] of jobs)this.jobs.set(id,row);
 }
}
