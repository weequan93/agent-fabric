/** Real SQL assertion drafts for08a. No in-memory/SQLite fallback and no test
 * registration: original-owner/process fixture composition is still required. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {migrateRuntime,verifyRuntimeInstallation,runtimeOriginalOwnerSnapshot,runtimeSchemaSnapshot,type RuntimeMigrationOptions} from '../../src/migration.js';
import {ORIGINAL_RUNTIME_PREREQUISITES} from '../../src/migration-prerequisites.js';
import {PostgresResourceRepository,PostgresQueueError,type PostgresQueueTicket} from '../../src/postgres-resource-repository.js';
import {QueueRequestSchema} from '../../src/schemas.js';
import {bindingDigest,type VerifiedScope} from '../../src/owners.js';
import type {QueueRequest} from '../../src/contracts.js';
import {observeQueue,assertCompleteQueue,type QueueDatabaseSnapshot} from './postgres-queue-observer.js';

export interface QueuePgActor {readonly scope:VerifiedScope;readonly repository:PostgresResourceRepository}
function actual(actor:QueuePgActor):void {assert.ok(actor.repository instanceof PostgresResourceRepository);}
function rowsFor(snapshot:QueueDatabaseSnapshot,key:string){return snapshot.tickets.filter(t=>t.original_key===key);}
export async function assertPgEqualAndConflictingKeys(actor:QueuePgActor,other:QueuePgActor,wrongSpace:QueuePgActor,observer:Pool,raw:QueueRequest){
 actual(actor);actual(other);actual(wrongSpace);
 const request=QueueRequestSchema.parse(raw),before=await observeQueue(observer,actor.scope);
 assert.equal(rowsFor(before,request.idempotencyKey).length,0);
 const [a,b]=await Promise.all([actor.repository.admit(actor.scope,request),actor.repository.admit(actor.scope,request)]);
 assert.equal(a.ticketId,b.ticketId);assert.deepEqual(a.receipt,b.receipt);
 assert.equal(a.receipt.requestDigest,bindingDigest(request));
 const changed=QueueRequestSchema.parse({...request,commandId:randomUUID()});
 await assert.rejects(actor.repository.admit(actor.scope,changed),(e:unknown)=>e instanceof PostgresQueueError&&e.code==='binding-conflict');
 const replay=await actor.repository.lookup(actor.scope,request.idempotencyKey);assert.deepEqual(replay.receipt,a.receipt);
 for(const denied of [other,wrongSpace]){
  assert.ok(denied.scope.actorId!==actor.scope.actorId||denied.scope.spaceId!==actor.scope.spaceId);
  await assert.rejects(denied.repository.lookup(denied.scope,request.idempotencyKey),(e:unknown)=>e instanceof PostgresQueueError&&e.code==='not-found');
 }
 const after=await observeQueue(observer,actor.scope);assertCompleteQueue(after);
 assert.equal(rowsFor(after,request.idempotencyKey).length,1);assert.equal(after.tickets.length,before.tickets.length+1);
 assert.deepEqual(after.slots,before.slots);return {receipt:a.receipt,beforePid:before.pid,afterPid:after.pid};
}
/** Independent-process clients and lock-order witnesses must be supplied by the
 * eventual fixture wrapper around this base real-session race. It alone is not
 * all of P02/queue-atomic. */
export async function assertPgCompleteSetRace(actor:QueuePgActor,observer:Pool,rawA:QueueRequest,rawB:QueueRequest){
 actual(actor);const a=QueueRequestSchema.parse(rawA),b=QueueRequestSchema.parse(rawB);
 assert.notEqual(a.idempotencyKey,b.idempotencyKey);assert.equal(a.binding.spaceId,b.binding.spaceId);
 assert.deepEqual(a.resources.map(r=>r.resourceId),b.resources.map(r=>r.resourceId));
 const before=await observeQueue(observer,actor.scope);assert.equal(before.tickets.length,0);
 const outcomes=await Promise.all([actor.repository.admit(actor.scope,a),actor.repository.admit(actor.scope,b)]);
 const owned=outcomes.filter(t=>t.state==='owned'),waiting=outcomes.filter(t=>t.state==='waiting');
 assert.equal(owned.length,1);assert.equal(waiting.length,1);
 assert.equal(waiting[0]!.ownerTaskId,owned[0]!.request.binding.taskId);assert.equal(waiting[0]!.reason,'resource-set-conflict');
 assert.equal(waiting[0]!.charges,'unknown');assert.ok(waiting[0]!.resolver.length>0);
 const after=await observeQueue(observer,actor.scope);assertCompleteQueue(after);assert.equal(after.tickets.length,2);
 assert.equal(after.owners.length,owned[0]!.resources.length);assert.deepEqual(after.slots,before.slots);
 return {outcomes,observerPid:after.pid,observedAt:after.observedAt};
}
/** The harness must observe a real wait before calling this with the controlled
 * future. Unexpected deadlocks/lock/statement timeouts never count as denial. */
export async function assertPgExpiredWaitResult(pending:Promise<PostgresQueueTicket>,observer:Pool,actor:QueuePgActor,request:QueueRequest,before:QueueDatabaseSnapshot){
 actual(actor);
 await assert.rejects(pending,(e:unknown)=>e instanceof PostgresQueueError&&e.code==='expired');
 const snapshot=await observeQueue(observer,actor.scope);
 assert.ok(snapshot.observedAt.getTime()>=Date.parse(request.expiresAt));
 assert.equal(rowsFor(snapshot,request.idempotencyKey).length,0);
 assertCompleteQueue(snapshot);
 // A refused admission must not leave an unrelated partial resource set or
 // silently issue an allocation intent. Capture before starting this request.
 for(const key of ['tickets','resources','owners','assignments','slots'] as const)assert.deepEqual(snapshot[key],before[key],'expired wait leaves no committed '+key);
 return {observerPid:snapshot.pid,observedAt:snapshot.observedAt,originalKey:request.idempotencyKey};
}
/** These deliberately malformed SQL writes use only the explicitly owned admin
 * fixture. Each transaction MUST fail and roll back; they never become queue
 * authority. A serving-role permission refusal cannot substitute for a tested
 * FK, unique or deferred full-set constraint here. */
export async function assertPgConstraintNegatives(admin:Pool,options:RuntimeMigrationOptions,actor:QueuePgActor,observer:Pool,ticket:PostgresQueueTicket){
 actual(actor);await verifyRuntimeInstallation(admin,options);
 const before=await observeQueue(observer,actor.scope);assertCompleteQueue(before);
 assert.ok(ticket.resources.length>=2,'Partial-set negative needs computer plus another resource');
 const stored=before.tickets.find(t=>t.ticket_id===ticket.ticketId);assert.ok(stored);
 const trials=[
  {name:'duplicate-original-key',state:'23505'},
  {name:'original-run-task-mismatch',state:'23514'},
  {name:'request-row-mismatch',state:'23514'},
  {name:'receipt-row-mismatch',state:'23514'},
  {name:'resource-foreign-key',state:'23503'},
  {name:'partial-resource-set-at-commit',state:'23514'}
 ] as const;
 for(const trial of trials){
  const c=await admin.connect();let discard=false;
  try{
   await c.query('BEGIN');
   const marker=(await c.query('SELECT owner,instance FROM public.fabric_runtime_fixture')).rows;
   assert.deepEqual(marker,[{owner:options.owner,instance:options.instance}]);
   const ticketId=randomUUID(),commandId=randomUUID(),key=trial.name==='duplicate-original-key'?ticket.request.idempotencyKey:randomUUID();
   const request=QueueRequestSchema.parse({...ticket.request,commandId,idempotencyKey:key,expiresAt:new Date(Date.now()+60_000).toISOString()});
   const receipt={schemaVersion:1,ticketId,commandId,originalKey:key,requestDigest:bindingDigest(request),initialState:'waiting'};
   const runId=trial.name==='original-run-task-mismatch'?randomUUID():request.binding.runId;
   const payload=trial.name==='request-row-mismatch'?{...request,commandId:randomUUID()}:request;
   const initial=trial.name==='receipt-row-mismatch'?{...receipt,ticketId:randomUUID()}:receipt;
   const operation=async()=>{
    await c.query(`INSERT INTO fabric.runtime_queue_tickets(tenant_id,space_id,ticket_id,actor_id,payer_id,original_key,command_id,request_digest,assignment_id,task_id,run_id,request,receipt,expires_at,state)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,'waiting')`,[actor.scope.tenantId,actor.scope.spaceId,ticketId,actor.scope.actorId,actor.scope.payerId,key,commandId,receipt.requestDigest,request.binding.assignmentId,request.binding.taskId,runId,JSON.stringify(payload),JSON.stringify(initial),request.expiresAt]);
    const resources=trial.name==='partial-resource-set-at-commit'?[ticket.resources.find(r=>r.resourceId===before.assignments[0]!.computer_resource_id)!]:ticket.resources;
    assert.ok(resources.every(Boolean));
    for(const [i,r]of resources.entries())await c.query(`INSERT INTO fabric.runtime_queue_resources(tenant_id,space_id,ticket_id,assignment_id,resource_id,mode) VALUES($1,$2,$3,$4,$5,$6)`,[actor.scope.tenantId,actor.scope.spaceId,ticketId,request.binding.assignmentId,trial.name==='resource-foreign-key'&&i===0?randomUUID():r.resourceId,r.mode]);
    await c.query('COMMIT');
   };
   await assert.rejects(operation(),(e:unknown)=>(e as {code?:unknown})?.code===trial.state,trial.name);
  }finally{
   try{await c.query('ROLLBACK');}catch{discard=true;}c.release(discard);
  }
  const after=await observeQueue(observer,actor.scope);
  for(const key of ['tickets','resources','owners','assignments','slots'] as const)assert.deepEqual(after[key],before[key],trial.name+' leaves no committed change');
 }
 return {negatives:trials.map(t=>({name:t.name,sqlState:t.state})),observerPid:before.pid};
}
/** Clean original fixture only; the caller owns the DB marker. No database,
 * role, Docker process, credentials or original record is created here. */
export async function assertPgInterruptedAndIdempotentInstall(admin:Pool,options:RuntimeMigrationOptions){
 const c=await admin.connect();let before:string;
 try{
  before=await runtimeOriginalOwnerSnapshot(c);
  assert.equal((await c.query("SELECT to_regclass('public.fabric_runtime_migrations') AS ledger")).rows[0]?.ledger,null);
 }finally{c.release();}
 await assert.rejects(verifyRuntimeInstallation(admin,options));
 await assert.rejects(migrateRuntime(admin,{...options,injectBeforeCommit:true}),/Injected runtime migration rollback/);
 const rollback=await admin.connect();try{
  assert.equal(await runtimeOriginalOwnerSnapshot(rollback),before);
  assert.equal((await rollback.query("SELECT to_regclass('fabric.runtime_queue_tickets') AS tickets,to_regclass('public.fabric_runtime_migrations') AS ledger")).rows[0]?.tickets,null);
  assert.equal((await rollback.query("SELECT to_regclass('public.fabric_runtime_migrations') AS ledger")).rows[0]?.ledger,null);
 }finally{rollback.release();}
 await migrateRuntime(admin,options);await verifyRuntimeInstallation(admin,options);
 const installed=await admin.connect();let catalog:string;
 try{catalog=await runtimeSchemaSnapshot(installed);}finally{installed.release();}
 await migrateRuntime(admin,options);await verifyRuntimeInstallation(admin,options);
 const after=await admin.connect();try{
  assert.equal(await runtimeOriginalOwnerSnapshot(after),before);assert.equal(await runtimeSchemaSnapshot(after),catalog);
  for(const [name,pins] of Object.entries(ORIGINAL_RUNTIME_PREREQUISITES))assert.deepEqual((await after.query(`SELECT version,digest FROM public.fabric_${name}_migrations ORDER BY version`)).rows,pins.map(p=>({version:p.version,digest:p.digest})));
  assert.deepEqual((await after.query('SELECT version FROM public.fabric_foundation_migrations ORDER BY version')).rows,[{version:1},{version:2}]);
  const grants=(await after.query(`SELECT c.relname,
   has_table_privilege('fabric_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS worker,
   has_any_column_privilege('fabric_worker',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS worker_column
   FROM pg_class c WHERE c.relnamespace='fabric'::regnamespace AND c.relkind IN('r','p') AND c.relname LIKE 'runtime_%'`)).rows;
  assert.equal(grants.length,7);assert.ok(grants.every(r=>r.worker===false&&r.worker_column===false));
  const sequences=(await after.query(`SELECT c.relname,has_sequence_privilege('fabric_worker',c.oid,'USAGE,SELECT,UPDATE') AS worker
   FROM pg_class c WHERE c.relnamespace='fabric'::regnamespace AND c.relkind='S' AND c.relname LIKE 'runtime_%'`)).rows;
  assert.equal(sequences.length,1);assert.ok(sequences.every(r=>r.worker===false));
  const functions=(await after.query(`SELECT p.proname,has_function_privilege('fabric_worker',p.oid,'EXECUTE') AS worker
   FROM pg_proc p WHERE p.pronamespace='fabric'::regnamespace AND p.proname LIKE 'runtime_%'`)).rows;
  assert.ok(functions.length>0&&functions.every(r=>r.worker===false));
  return {originalCatalog:before,runtimeCatalog:catalog,grants,sequences,functions};
 }finally{after.release();}
}
