/** Real-PG queue source draft. No allocator/worker/lease/effect/transfer port.
 * Original identity+foundation UoWs own the real transaction and COMMIT outcome. */
import {randomUUID} from 'node:crypto';
import {AuthenticatedUnitOfWork} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {lockSpaceBarrier,assertRunUnfenced} from '../../g1-recovery/src/fence-guard.js';
import {assertVerifiedScope,revalidateScope,bindingDigest,type SqlTransaction,type VerifiedScope} from './owners.js';
import {QueueRequestSchema,uuid} from './schemas.js';
import type {QueueRequest} from './contracts.js';
import {RUNTIME_MIGRATIONS,RuntimeSchemaError} from './migration.js';
export type PostgresQueueState='waiting'|'owned'|'cancelled'|'expired'|'released'|'reconciling';
export interface QueueAdmissionReceipt {
 readonly schemaVersion:1;readonly ticketId:string;readonly commandId:string;readonly originalKey:string;
 readonly requestDigest:string;readonly initialState:'waiting'|'owned';
}
export interface PostgresQueueTicket {
 readonly ticketId:string;readonly sequence:number;readonly state:PostgresQueueState;
 readonly request:QueueRequest;readonly receipt:QueueAdmissionReceipt;
 readonly resources:readonly {readonly resourceId:string;readonly mode:'read'|'write'}[];
 readonly ownerTaskId:string|null;readonly reason:string;readonly resolver:string;
 readonly charges:'unknown'|'none';readonly cancelRequested:boolean;
}
/** Installed composition owns this bounded read-only validation. It must compare
 * the admitted native envelope/digest and current policy/budget/qualification.
 * No worker/request supplies this port or a transaction callback. */
export interface CurrentQueueAdmission {
 require(tx:SqlTransaction,scope:VerifiedScope,request:QueueRequest):Promise<void>;
}
export class PostgresQueueError extends Error {
 constructor(readonly code:'forbidden'|'not-found'|'binding-conflict'|'expired'|'unsupported-assignment'){super(code);}
}
type Row=Record<string,unknown>;
const ids=(s:VerifiedScope)=>[s.tenantId,s.spaceId];
const deny=(condition:unknown,code:PostgresQueueError['code']):void=>{if(!condition)throw new PostgresQueueError(code);};
export function runtimeCommandLock(scope:VerifiedScope,key:string):string {
 return JSON.stringify(['runtime-command',scope.tenantId,scope.spaceId,scope.actorId,key]);
}
/** No generic ResourceStore adapter: authoritative SQL needs async original owners
 * and fresh DB time, rather than the local fixture's synchronous ticket snapshot. */
export class PostgresResourceRepository {
 constructor(private readonly uow:AuthenticatedUnitOfWork,private readonly admission:CurrentQueueAdmission){
  if(!(uow instanceof AuthenticatedUnitOfWork)||!(uow.options.foundation instanceof PostgresUnitOfWork))throw new PostgresQueueError('forbidden');
 }
 private async current(tx:SqlTransaction,scope:VerifiedScope,write:boolean,expiresAt?:string):Promise<void>{
  await revalidateScope(scope);
  deny(scope.grants.includes(write?'task:write':'task:read'),'forbidden');
  // Original AuthenticatedUnitOfWork repeats identity-session validity at return.
  // clock_timestamp() is deliberately a new statement after all actual waits.
  const now=(await tx.query('SELECT clock_timestamp() AS now')).rows[0]?.now;
  if(expiresAt)deny(now instanceof Date&&Date.parse(expiresAt)>now.getTime(),'expired');
 }
 private async transaction<T>(scope:VerifiedScope,key:string,write:boolean,work:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  assertVerifiedScope(scope);await revalidateScope(scope);uuid.parse(key);
  deny(scope.grants.includes(write?'task:write':'task:read'),'forbidden');
  return this.uow.withScope(scope,async tx=>{
   const installed=(await tx.query('SELECT fabric.runtime_schema_ready($1) AS ready',[RUNTIME_MIGRATIONS[1].digest])).rows[0]?.ready;
   if(installed!==true)throw new RuntimeSchemaError();
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[runtimeCommandLock(scope,key)]);
   deny(await lockSpaceBarrier(tx,scope),'forbidden');
   await this.current(tx,scope,write);const out=await work(tx);await this.current(tx,scope,write);return out;
  });
 }
 private async ownedRequest(tx:SqlTransaction,scope:VerifiedScope,r:QueueRequest):Promise<void>{
  deny(r.binding.tenantId===scope.tenantId&&r.binding.spaceId===scope.spaceId&&r.expectedRevision===0,'binding-conflict');
  // Original run/resource rows remain authority. No F06 generation is minted.
  await assertRunUnfenced(tx,scope,r.binding.runId);
  const row=(await tx.query(`SELECT t.actor_id,t.state AS task_state,r.state AS run_state FROM fabric.tasks t JOIN fabric.runs r USING(tenant_id,space_id,task_id)
   WHERE t.tenant_id=$1 AND t.space_id=$2 AND t.task_id=$3 AND r.run_id=$4 FOR SHARE OF t,r`,[...ids(scope),r.binding.taskId,r.binding.runId])).rows[0];
  deny(row&&row.actor_id===scope.actorId&&!['cancelled','cancelling','blocked','expired','completed','succeeded','failed'].includes(String(row.task_state))&&!['cancelled','cancelling','blocked','expired','completed','succeeded','failed'].includes(String(row.run_state)),'forbidden');
  await this.admission.require(tx,scope,r);await this.current(tx,scope,true,r.expiresAt);
 }
 private async canonical(tx:SqlTransaction,scope:VerifiedScope,r:QueueRequest):Promise<readonly {resourceId:string;mode:'read'|'write'}[]>{
  const a=(await tx.query(`SELECT a.*,c.revoked_at FROM fabric.runtime_assignments a JOIN fabric.computer_assignments c USING(tenant_id,space_id,assignment_id)
   WHERE a.tenant_id=$1 AND a.space_id=$2 FOR UPDATE OF a`,ids(scope))).rows[0];
  deny(a&&a.assignment_id===r.binding.assignmentId&&a.storage_binding_id===r.binding.storageBindingId&&a.revoked_at===null,'unsupported-assignment');
  const normalized=new Map<string,'read'|'write'>([[String(a!.computer_resource_id),'write']]);
  for(const resource of r.resources){
   const rows=(await tx.query(`SELECT resource_id FROM fabric.runtime_resources WHERE tenant_id=$1 AND space_id=$2 AND assignment_id=$3 AND resource_id=$4
    UNION SELECT c.resource_id FROM fabric.runtime_resource_aliases a JOIN fabric.runtime_resources c USING(tenant_id,space_id,resource_id)
    WHERE a.tenant_id=$1 AND a.space_id=$2 AND c.assignment_id=$3 AND a.alias_id=$4`,[...ids(scope),r.binding.assignmentId,resource.resourceId])).rows;
   deny(rows.length===1,'binding-conflict');const canonical=String(rows[0]!.resource_id);
   normalized.set(canonical,resource.mode==='write'||normalized.get(canonical)==='write'?'write':'read');
  }
  const resources=[...normalized].sort(([a],[b])=>a.localeCompare(b)).map(([resourceId,mode])=>({resourceId,mode}));
  for(const resource of resources){
   const row=(await tx.query('SELECT kind FROM fabric.runtime_resources WHERE tenant_id=$1 AND space_id=$2 AND assignment_id=$3 AND resource_id=$4 FOR UPDATE',[...ids(scope),r.binding.assignmentId,resource.resourceId])).rows[0];
   deny(row,'binding-conflict');if(resource.resourceId===a!.computer_resource_id)deny(row!.kind==='computer','unsupported-assignment');
  }
  return resources;
 }
 private async projection(tx:SqlTransaction,scope:VerifiedScope,row:Row):Promise<PostgresQueueTicket>{
  const resources=(await tx.query('SELECT resource_id,mode FROM fabric.runtime_queue_resources WHERE tenant_id=$1 AND space_id=$2 AND ticket_id=$3 ORDER BY resource_id',[...ids(scope),row.ticket_id])).rows.map(r=>({resourceId:String(r.resource_id),mode:r.mode as 'read'|'write'}));
  const sequence=Number(row.sequence);deny(Number.isSafeInteger(sequence)&&sequence>0,'binding-conflict');
  const state=row.state as PostgresQueueState;
  const owner=state==='waiting'?(await tx.query(`SELECT t.task_id FROM fabric.runtime_queue_tickets t JOIN fabric.runtime_queue_resources r USING(tenant_id,space_id,ticket_id)
   WHERE t.tenant_id=$1 AND t.space_id=$2 AND t.ticket_id<>$3 AND r.resource_id=ANY($4::uuid[])
   AND (t.state IN('owned','reconciling') OR t.state='waiting' AND t.sequence<$5 AND t.expires_at>clock_timestamp()) ORDER BY t.sequence LIMIT 1`,[...ids(scope),row.ticket_id,resources.map(r=>r.resourceId),row.sequence])).rows[0]:undefined;
  return Object.freeze({ticketId:String(row.ticket_id),sequence,state,request:QueueRequestSchema.parse(row.request),receipt:Object.freeze(row.receipt as unknown as QueueAdmissionReceipt),resources:Object.freeze(resources.map(r=>Object.freeze(r))),ownerTaskId:state==='owned'?String(row.task_id):owner?String(owner.task_id):null,reason:state==='owned'?'complete-resource-set-reserved':owner?'resource-set-conflict':'resources-eligible-awaiting-poll',resolver:'Wait, cancel this request, or ask the current owner to release safely',charges:['cancelled','expired','released'].includes(state)?'none':'unknown',cancelRequested:row.cancel_requested===true});
 }
 async admit(scope:VerifiedScope,raw:unknown):Promise<PostgresQueueTicket>{
  // Provenance/authentication precedes decoding and receipt disclosure.
  assertVerifiedScope(scope);await revalidateScope(scope);const r=QueueRequestSchema.parse(raw);
  return this.transaction(scope,r.idempotencyKey,true,async tx=>{
   deny(r.binding.tenantId===scope.tenantId&&r.binding.spaceId===scope.spaceId,'binding-conflict');
   const digest=bindingDigest(r),prior=(await tx.query('SELECT * FROM fabric.runtime_queue_tickets WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND original_key=$4',[...ids(scope),scope.actorId,r.idempotencyKey])).rows[0];
   if(prior){deny(prior.payer_id===scope.payerId&&prior.request_digest===digest,'binding-conflict');return this.projection(tx,scope,prior);}
   deny(!(await tx.query('SELECT 1 FROM fabric.runtime_queue_tickets WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_id=$4',[...ids(scope),scope.actorId,r.commandId])).rowCount,'binding-conflict');
   await this.ownedRequest(tx,scope,r);const resources=await this.canonical(tx,scope,r);await this.current(tx,scope,true,r.expiresAt);
   // Whole-computer reservation intentionally serializes all initial writers.
   // The Space barrier already excludes concurrent new-ticket insertion.
   const blockers=(await tx.query(`SELECT t.task_id FROM fabric.runtime_queue_tickets t JOIN fabric.runtime_queue_resources r USING(tenant_id,space_id,ticket_id)
    WHERE t.tenant_id=$1 AND t.space_id=$2 AND r.resource_id=ANY($3::uuid[])
    AND (t.state IN('owned','reconciling') OR t.state='waiting' AND t.expires_at>clock_timestamp()) ORDER BY t.sequence LIMIT 1`,[...ids(scope),resources.map(r=>r.resourceId)])).rows;
   const state=blockers.length?'waiting':'owned',ticketId=randomUUID();
   const receipt:QueueAdmissionReceipt={schemaVersion:1,ticketId,commandId:r.commandId,originalKey:r.idempotencyKey,requestDigest:digest,initialState:state};
   const row=(await tx.query(`INSERT INTO fabric.runtime_queue_tickets(tenant_id,space_id,ticket_id,actor_id,payer_id,original_key,command_id,request_digest,assignment_id,task_id,run_id,request,receipt,expires_at,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15) RETURNING *`,[...ids(scope),ticketId,scope.actorId,scope.payerId,r.idempotencyKey,r.commandId,digest,r.binding.assignmentId,r.binding.taskId,r.binding.runId,JSON.stringify(r),JSON.stringify(receipt),r.expiresAt,state])).rows[0]!;
   for(const resource of resources){
    await tx.query('INSERT INTO fabric.runtime_queue_resources(tenant_id,space_id,ticket_id,assignment_id,resource_id,mode) VALUES($1,$2,$3,$4,$5,$6)',[...ids(scope),ticketId,r.binding.assignmentId,resource.resourceId,resource.mode]);
    if(state==='owned')await tx.query('INSERT INTO fabric.runtime_resource_owners(tenant_id,space_id,resource_id,ticket_id) VALUES($1,$2,$3,$4)',[...ids(scope),resource.resourceId,ticketId]);
   }
   const result=await this.projection(tx,scope,row);await this.admission.require(tx,scope,r);await this.current(tx,scope,true,r.expiresAt);return result;
  });
 }
 /** Serialized original-key status only; absence never authorizes external replay. */
 async lookup(scope:VerifiedScope,key:string):Promise<PostgresQueueTicket>{
  return this.transaction(scope,key,false,async tx=>{
   const row=(await tx.query('SELECT * FROM fabric.runtime_queue_tickets WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND payer_id=$4 AND original_key=$5',[...ids(scope),scope.actorId,scope.payerId,key])).rows[0];
   deny(row,'not-found');return this.projection(tx,scope,row!);
  });
 }
}
