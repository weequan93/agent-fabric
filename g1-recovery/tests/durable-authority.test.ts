import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {createRecoveryFixture} from './pg-fixture.js';
import {sha} from './fixtures.js';
import {migrateRecovery} from '../src/migration.js';
import {RecoveryRepository, recoveryLockKey, type Mutation} from '../src/repository.js';
import {effectSchema, runSchema, sessionSchema, bindingDigest} from '../src/contracts.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {AuthenticatedUnitOfWork} from '../../g1-identity/src/authenticated-uow.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import {audienceDigest, type AudienceRow} from '../../g1-identity/src/audience.js';
import type {AsyncUnitOfWork, VerifiedScope} from '../../g1-foundations/src/contracts.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
let f: Awaited<ReturnType<typeof createRecoveryFixture>>;
const sqlPath=resolve('migrations/0004_recovery.sql');
before(async()=>{f=await createRecoveryFixture();});after(async()=>{await f?.close();});
const code = (expected:string) => (e:unknown) => (e as {code?:string}).code===expected;
async function receipts(m:Mutation) {
 const count=(table:string,clause:string,values:unknown[])=>f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE ${clause}`,values).then(r=>r.rows[0].n as number);
 return {receipts:await count('recovery_receipts','command_key=$1',[m.key]),outbox:await count('recovery_outbox','command_key=$1',[m.key])};
}
async function start() {
 const seed=await f.seedRun();await f.repo.initialize(f.issued[1],seed.init,seed.value);
 const run=runSchema.parse({...seed.value.run,state:'running',revision:2}),session=seed.value.session;
 const value={run,session,result:null};await f.repo.checkpoint(f.issued[1],f.mutation(seed.runId,1,value),value);
 return {...seed,run,session};
}
async function approved(seed:Awaited<ReturnType<typeof start>>, expiry=new Date(Date.now()+60000).toISOString(), fixture=f) {
 const rows=await fixture.uow.withScope(fixture.issued[0],async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[fixture.source,fixture.space,fixture.sourceTask])).rows[0]?.audience as AudienceRow[]);
 const target='synthetic://'+randomUUID(),argsDigest=sha(40);
 await fixture.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,1,$4)',[fixture.tenant,fixture.space,target,argsDigest]);
 const b:ExactApprovalBinding={tenantId:fixture.tenant,spaceId:fixture.space,taskId:seed.taskId,runId:seed.runId,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:{sourceSpaceId:fixture.source,sourceTaskId:fixture.sourceTask,destinationSpaceId:fixture.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)},limits:{maxOperations:1,maxCostMicrounits:30},expiresAt:expiry};
 const repo=new ExactApprovalRepository({uow:fixture.uow,bindingFor:fixture.bindingFor});
 const a=await repo.create(fixture.issued[0],{approvalId:randomUUID(),executorId:fixture.issued[1].actorId,binding:b});await repo.approve(fixture.issued[2],a.approvalId,a.bindingDigest);
 const effect=effectSchema.parse({binding:{run:seed.run.binding,sessionId:seed.session.sessionId,operationId:b.operationId,target,resourceId:randomUUID(),action:b.action,argsDigest,artifactId:randomUUID(),artifactVersion:1,artifactDigest:sha(41),actorId:fixture.issued[1].actorId,policyRevision:1,audienceDigest:b.sourceAudience.revisionDigest,approvalId:a.approvalId,budgetReservationId:seed.reservationId,executionLeaseId:seed.value.lease.leaseId,generation:seed.run.generation,expiresAt:b.expiresAt,effectClass:'external-write',mutationPath:'api',downstream:'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const cost=20,payload={effect,approval:b,cost};return {b,a,effect,cost,m:fixture.mutation(seed.runId,2,payload)};
}
async function noApprovalWrites(a:string) {
 assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[a])).rows[0].state,'approved');
 for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[a])).rows[0].n,0);
 assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.recovery_operations WHERE binding->>'approvalId'=$1",[a])).rows[0].n,0);
}
async function waitForLock(blocker:number,pattern='%') {
 const deadline=Date.now()+1500;
 while(Date.now()<deadline) {
  const rows=(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2",[blocker,pattern])).rows;
  if(rows.length)return;await new Promise(res=>setTimeout(res,10));
 }
 throw new Error('Expected actual PostgreSQL lock wait');
}
test('POSTGRES/separate migration rollback, digest refusal and unchanged F01/F02 ledgers',async()=>{
 const original=await f.admin.query('SELECT version,digest,applied_at FROM public.fabric_foundation_migrations ORDER BY version');const identity=await f.admin.query('SELECT * FROM public.fabric_identity_migrations');
 await assert.rejects(migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath,injectBeforeCommit:true}),/Injected/);
 assert.equal((await f.admin.query("SELECT to_regclass('fabric.recovery_runs') AS table_name")).rows[0].table_name,null);
 assert.equal((await f.admin.query("SELECT to_regclass('public.fabric_recovery_migrations') AS table_name")).rows[0].table_name,null);
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath});await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath});
 assert.deepEqual((await f.admin.query('SELECT version,digest,applied_at FROM public.fabric_foundation_migrations ORDER BY version')).rows,original.rows);
 assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_identity_migrations')).rows,identity.rows);
 const tmp=await mkdtemp(resolve(tmpdir(),'af-f03-migration-'));try{const changed=resolve(tmp,'changed.sql');await writeFile(changed,(await readFile(sqlPath,'utf8'))+'\n-- changed\n');await assert.rejects(migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:changed}),/incompatible/);}finally{await rm(tmp,{recursive:true,force:true});}
 assert.deepEqual((await f.admin.query('SELECT version FROM public.fabric_recovery_migrations')).rows.map(r=>r.version),[4]);
});
test('POSTGRES/actual OIDC-bound scopes persist session/lease and reconstruct from distinct backend',async()=>{
 const seed=await f.seedRun();const receipt=await f.repo.initialize(f.issued[1],seed.init,seed.value);
 assert.deepEqual(await receipts(seed.init),{receipts:1,outbox:1});
 const first=Number((await f.controller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
 const fresh=new pg.Pool({connectionString:f.dsn,max:1});try{
  const second=Number((await fresh.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);assert.notEqual(first,second);
  const repo=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(fresh),bindingFor:f.bindingFor}),f.bindingFor);
  const snapshot=await repo.get(f.issued[1],seed.runId);assert.deepEqual(snapshot,{run:seed.value.run,sessions:[seed.value.session],leases:[seed.value.lease],effects:[],result:null});
  assert.deepEqual(await repo.lookupCommand(f.issued[1],seed.init.key,seed.init.payloadDigest),{status:'committed',receipt});
 }finally{await fresh.end();}
});
test('POSTGRES/concurrent duplicate original key commits one checkpoint/receipt/outbox',async()=>{
 const seed=await f.seedRun();const values=await Promise.all(Array.from({length:4},()=>f.repo.initialize(f.issued[1],seed.init,seed.value)));
 for(const v of values)assert.deepEqual(v,values[0]);assert.deepEqual(await receipts(seed.init),{receipts:1,outbox:1});
 const row=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_sessions WHERE run_id=$1',[seed.runId])).rows[0];assert.equal(row.n,1);
});
test('POSTGRES/idempotency rejects changed payload or binding; unchanged key returns original command',async()=>{
 const seed=await f.seedRun();const receipt=await f.repo.initialize(f.issued[1],seed.init,seed.value);
 const changed={...seed.value,session:sessionSchema.parse({...seed.value.session,contextDigest:sha(99)})};
 await assert.rejects(f.repo.initialize(f.issued[1],{...seed.init,payloadDigest:bindingDigest(changed)},changed),code('IDEMPOTENCY_CONFLICT'));
 await assert.rejects(f.repo.initialize(f.issued[1],{...seed.init,payloadDigest:sha(1)},seed.value),code('INVALID_INPUT'));
 assert.deepEqual(await f.repo.initialize(f.issued[1],{...seed.init,commandId:randomUUID()},seed.value),receipt);
 await assert.rejects(f.repo.lookupCommand(f.issued[1],seed.init.key,sha(2)),code('IDEMPOTENCY_CONFLICT'));
});
test('POSTGRES/SQL failure after actual checkpoint+receipt writes rolls entire transaction back',async()=>{
 const seed=await f.seedRun();
 await f.admin.query(`CREATE FUNCTION fabric.recovery_injected_failure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.command_key='${seed.init.key}' THEN IF NOT EXISTS(SELECT 1 FROM fabric.recovery_receipts WHERE command_key=NEW.command_key) OR NOT EXISTS(SELECT 1 FROM fabric.recovery_sessions WHERE run_id=NEW.run_id) THEN RAISE EXCEPTION 'expected prior writes absent';END IF;RAISE EXCEPTION 'actual PG failure after checkpoint and receipt';END IF;RETURN NEW;END $$;CREATE TRIGGER recovery_injected BEFORE INSERT ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_injected_failure()`);
 try{await assert.rejects(f.repo.initialize(f.issued[1],seed.init,seed.value),/actual PG failure/);assert.deepEqual(await receipts(seed.init),{receipts:0,outbox:0});assert.equal(await f.repo.get(f.issued[1],seed.runId),null);assert.deepEqual(await f.repo.lookupCommand(f.issued[1],seed.init.key,seed.init.payloadDigest),{status:'absent-safe'});}finally{await f.admin.query('DROP TRIGGER recovery_injected ON fabric.recovery_outbox;DROP FUNCTION fabric.recovery_injected_failure()');}
 await f.repo.initialize(f.issued[1],seed.init,seed.value);
});
test('POSTGRES/lost COMMIT ACK reconciles original key on fresh connection with no mutator replay',async()=>{
 const seed=await f.seedRun();let commits=0;
 const lost=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{commits++;throw new Error('lost real committed ACK');}),bindingFor:f.bindingFor}),f.bindingFor);
 await assert.rejects(lost.initialize(f.issued[1],seed.init,seed.value),code('UNKNOWN_COMMIT'));
 const fresh=new pg.Pool({connectionString:f.dsn,max:1});try{
  const reader=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(fresh),bindingFor:f.bindingFor}),f.bindingFor);
  const result=await reader.lookupCommand(f.issued[1],seed.init.key,seed.init.payloadDigest);assert.equal(result.status,'committed');if(result.status==='committed')assert.equal(result.receipt.commandId,seed.init.commandId);
  assert.equal(commits,1);assert.deepEqual(await receipts(seed.init),{receipts:1,outbox:1});assert.equal((await reader.get(f.issued[1],seed.runId))?.run.revision,1);
 }finally{await fresh.end();}
});
for(const outcome of ['commit','rollback','timeout'] as const)test('POSTGRES/original-key lookup waits through real uncommitted '+outcome,async()=>{
 const seed=await f.seedRun();let release!:()=>void,entered!:(pid:number)=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<number>(r=>entered=r);
 const held:AsyncUnitOfWork={withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{const result=await work(tx);entered(Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid));await gate;if(outcome==='rollback')throw new Error('deliberate rollback');return result;})};
 const writer=new RecoveryRepository(held,f.bindingFor);const writing=writer.initialize(f.issued[1],seed.init,seed.value);const writerResult=writing.then(receipt=>({receipt}),error=>({error}));
 const pid=await ready;
 try{
  let resolved=false;const read=f.repo.lookupCommand(f.issued[1],seed.init.key,seed.init.payloadDigest).then(v=>{resolved=true;return v;});await waitForLock(pid,'SELECT pg_advisory_xact_lock%');assert.equal(resolved,false);
  if(outcome==='timeout'){assert.deepEqual(await read,{status:'unknown',nextAction:'lookup-original-key-no-replay'});assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_receipts WHERE command_key=$1',[seed.init.key])).rows[0].n,0);release();await writerResult;assert.equal((await f.repo.lookupCommand(f.issued[1],seed.init.key,seed.init.payloadDigest)).status,'committed');}
  else{release();await writerResult;assert.equal((await read).status,outcome==='commit'?'committed':'absent-safe');}
 }finally{release();await writerResult;}
});
test('POSTGRES/concurrent distinct checkpoint keys enforce revision and cursor; durable result survives pool recreation',async()=>{
 const s=await start();const session=sessionSchema.parse({...s.session,cursor:1});const run=runSchema.parse({...s.run,revision:3,state:'verifying'}),value={run,session,result:null};
 const a=f.mutation(s.runId,2,value),b=f.mutation(s.runId,2,value);const results=await Promise.allSettled([f.repo.checkpoint(f.issued[1],a,value),f.repo.checkpoint(f.issued[1],b,value)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected?.status==='rejected'&&rejected.reason.code,'REVISION_CONFLICT');
 const result={resultDigest:sha(80),summary:'Synthetic checked draft retained'};const done={run:runSchema.parse({...run,revision:4,state:'succeeded',outcomeDigest:result.resultDigest}),session:sessionSchema.parse({...session,state:'finished'}),result};
 await f.repo.checkpoint(f.issued[1],f.mutation(s.runId,3,done),done);
 const fresh=new pg.Pool({connectionString:f.dsn,max:1});try{const repo=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(fresh),bindingFor:f.bindingFor}),f.bindingFor);const snapshot=await repo.get(f.issued[1],s.runId);assert.deepEqual(snapshot?.result,result);assert.equal(snapshot?.run.state,'succeeded');assert.equal(snapshot?.sessions[0]?.cursor,1);}finally{await fresh.end();}
 await assert.rejects(f.repo.checkpoint(f.issued[1],f.mutation(s.runId,4,{...done,run:{...done.run,revision:5}}),{...done,run:{...done.run,revision:5}}),code('REVISION_CONFLICT'));
});
test('POSTGRES/forged scopes and current session/membership/actor/payer/lifecycle reject without writes',async()=>{
 const scope=f.issued[1],seed=await f.seedRun();await assert.rejects(f.repo.initialize({...scope} as VerifiedScope,seed.init,seed.value));
 const modes=[['identity_sessions','revoked_at=clock_timestamp()','revoked_at=NULL','issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[1]]],['identity_sessions',"expires_at=clock_timestamp()-interval '1 second'","expires_at=clock_timestamp()+interval '600 seconds'",'issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[1]]],['memberships','revoked_at=clock_timestamp()','revoked_at=NULL','tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1]]],['actors','revoked_at=clock_timestamp()','revoked_at=NULL','tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[1]]],['actors','revoked_at=clock_timestamp()','revoked_at=NULL','tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]],['spaces',"lifecycle='suspended'","lifecycle='active'",'tenant_id=$1 AND space_id=$2',[f.tenant,f.space]]] as const;
 for(const [table,changed,restored,where,values] of modes){await f.admin.query(`UPDATE fabric.${table} SET ${changed} WHERE ${where}`,[...values]);try{await assert.rejects(f.repo.initialize(scope,seed.init,seed.value));assert.deepEqual(await receipts(seed.init),{receipts:0,outbox:0});}finally{await f.admin.query(`UPDATE fabric.${table} SET ${restored} WHERE ${where}`,[...values]);}}
 const foreign=await f.scopeFor(1,f.source);await assert.rejects(f.repo.initialize(foreign,seed.init,seed.value));assert.equal(await f.repo.get(foreign,seed.runId),null);
});
test('POSTGRES/real non-owner worker/client sessions cannot SQL or spoof GUC authority; RLS and immutable bindings hold',async()=>{
 const role=(await f.controller.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='fabric' AND nspowner=pg_roles.oid) AS owner FROM pg_roles WHERE rolname=current_user")).rows[0];assert.deepEqual(Object.values(role),[false,false,false,false,false]);
 for(const pool of [f.worker,f.client,f.idp]){
  await pool.query("SELECT set_config('app.tenant_id',$1,false),set_config('app.space_id',$2,false),set_config('app.actor_id',$3,false),set_config('app.identity_verified','true',false)",[f.tenant,f.space,f.actors[1]]);
  for(const sql of ['SELECT * FROM fabric.recovery_runs','SELECT * FROM fabric.recovery_receipts','SELECT * FROM fabric.recovery_results','SELECT fabric.recovery_budget_current(null,null,0)','SELECT * FROM public.fabric_recovery_migrations'])await assert.rejects(pool.query(sql),/permission denied/);
 }
 const seed=await f.seedRun();await f.repo.initialize(f.issued[1],seed.init,seed.value);
 assert.equal((await f.controller.query('SELECT * FROM fabric.recovery_runs')).rowCount,0);
 await assert.rejects(f.uow.withScope(f.issued[1],tx=>tx.query("UPDATE fabric.recovery_sessions SET binding='{}' WHERE session_id=$1",[seed.value.session.sessionId])),/immutable recovery binding/);
 await assert.rejects(f.uow.withScope(f.issued[1],tx=>tx.query('DELETE FROM fabric.recovery_receipts WHERE command_key=$1',[seed.init.key])),/permission denied/);
 await assert.rejects(f.uow.withScope(f.issued[1],tx=>tx.query("UPDATE fabric.recovery_receipts SET receipt='{}' WHERE command_key=$1",[seed.init.key])),/permission denied/);
});
test('POSTGRES/exact F02 approval consumption and recovery effect/receipt/outbox commit atomically',async()=>{
 const seed=await start(),a=await approved(seed);const receipt=await f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost);
 assert.deepEqual(await receipts(a.m),{receipts:1,outbox:1});
 assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[a.a.approvalId])).rows[0].state,'consumed');
 for(const table of ['approval_audit','approval_receipts','approval_outbox'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[a.a.approvalId])).rows[0].n,1);
 const fresh=new pg.Pool({connectionString:f.dsn,max:1});try{const repo=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(fresh),bindingFor:f.bindingFor}),f.bindingFor);const snapshot=await repo.get(f.issued[1],seed.runId);assert.deepEqual(snapshot?.effects,[a.effect]);assert.equal(snapshot?.run.revision,3);assert.deepEqual(await repo.lookupCommand(f.issued[1],a.m.key,a.m.payloadDigest),{status:'committed',receipt});}finally{await fresh.end();}
 await f.repo.completeOutbox(f.issued[1],receipt.outboxId);await f.repo.completeOutbox(f.issued[1],receipt.outboxId);
 assert.notEqual((await f.repo.outbox(f.issued[1])).find(r=>r.outbox_id===receipt.outboxId)?.completed_at,null);
 await assert.rejects(f.repo.completeOutbox(f.issued[1],randomUUID()),code('STALE_AUTHORITY'));
});
test('POSTGRES/recovery SQL failure after consumed approval rolls back F02 and recovery effects together',async()=>{
 const seed=await start(),a=await approved(seed);
 await f.admin.query(`CREATE FUNCTION fabric.recovery_effect_failure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.command_key='${a.m.key}' THEN IF NOT EXISTS(SELECT 1 FROM fabric.approval_audit WHERE approval_id='${a.a.approvalId}') OR NOT EXISTS(SELECT 1 FROM fabric.recovery_operations WHERE operation_id='${a.b.operationId}') THEN RAISE EXCEPTION 'expected effect writes absent';END IF;RAISE EXCEPTION 'actual PG failure after consumed approval and operation';END IF;RETURN NEW;END $$;CREATE TRIGGER recovery_effect_failure BEFORE INSERT ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_effect_failure()`);
 try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),/actual PG failure/);await noApprovalWrites(a.a.approvalId);assert.deepEqual(await receipts(a.m),{receipts:0,outbox:0});assert.equal((await f.repo.get(f.issued[1],seed.runId))?.run.revision,2);}finally{await f.admin.query('DROP TRIGGER recovery_effect_failure ON fabric.recovery_outbox;DROP FUNCTION fabric.recovery_effect_failure()');}
});
test('POSTGRES/effect refuses wrong actor/target/approval/audience/lease/generation and budget preconditions',async()=>{
 const seed=await start(),a=await approved(seed);
 const patches=[{actorId:f.actors[0]},{target:'synthetic://wrong'},{approvalId:randomUUID()},{argsDigest:sha(99)},{audienceDigest:sha(99)},{budgetReservationId:randomUUID()},{executionLeaseId:randomUUID()},{sessionId:randomUUID()},{generation:{...a.effect.binding.generation,worker:2}},{policyRevision:2},{artifactVersion:2},{artifactDigest:null,artifactVersion:null,artifactId:null},{run:{...a.effect.binding.run,requirementsRevision:2}}];
 for(const patch of patches){const effect=effectSchema.parse({...a.effect,binding:{...a.effect.binding,...patch}});const m=f.mutation(seed.runId,2,{effect,approval:a.b,cost:a.cost});await assert.rejects(f.repo.prepareEffect(f.issued[1],m,effect,a.b,a.cost));await noApprovalWrites(a.a.approvalId);assert.deepEqual(await receipts(m),{receipts:0,outbox:0});}
 for(const cost of [31,51]){const m=f.mutation(seed.runId,2,{effect:a.effect,approval:{...a.b,limits:{...a.b.limits,maxCostMicrounits:100}},cost});await assert.rejects(f.repo.prepareEffect(f.issued[1],m,a.effect,{...a.b,limits:{...a.b.limits,maxCostMicrounits:100}},cost));await noApprovalWrites(a.a.approvalId);}
 await f.admin.query("UPDATE fabric.budget_reservations SET state='unknown' WHERE reservation_id=$1",[seed.reservationId]);try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),code('UNAUTHORIZED'));await noApprovalWrites(a.a.approvalId);}finally{await f.admin.query("UPDATE fabric.budget_reservations SET state='active' WHERE reservation_id=$1",[seed.reservationId]);}
 await f.admin.query('UPDATE fabric.budget_reservations SET settled_amount=49 WHERE reservation_id=$1',[seed.reservationId]);try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),code('UNAUTHORIZED'));await noApprovalWrites(a.a.approvalId);}finally{await f.admin.query('UPDATE fabric.budget_reservations SET settled_amount=0 WHERE reservation_id=$1',[seed.reservationId]);}
 await f.admin.query('UPDATE fabric.tasks SET requirements=$2 WHERE task_id=$1',[seed.taskId,JSON.stringify({intent:'plan'})]);try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),code('UNAUTHORIZED'));await noApprovalWrites(a.a.approvalId);}finally{await f.admin.query('UPDATE fabric.tasks SET requirements=$2 WHERE task_id=$1',[seed.taskId,JSON.stringify({intent:'act'})]);}
});
test('POSTGRES/current requester/approver/source payer revocation and stale target invalidate approved effect',async()=>{
 for(const mode of ['requester-session','approver-grant','source-payer','target-version']){
  const seed=await start(),a=await approved(seed);
  if(mode==='requester-session')await f.idp.query('SELECT fabric.identity_revoke_session($1,$2,$3)',[f.endpoints.issuer,f.actors[0],f.bindingFor(f.issued[0]).sessionId]);
  if(mode==='approver-grant')await f.admin.query("UPDATE fabric.memberships SET grants='[\"task:read\",\"task:write\"]' WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[f.tenant,f.space,f.actors[2]]);
  if(mode==='source-payer')await f.admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]);
  if(mode==='target-version')await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=2 WHERE target=$1',[a.b.target]);
  try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost));await noApprovalWrites(a.a.approvalId);assert.deepEqual(await receipts(a.m),{receipts:0,outbox:0});}finally{
   await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=NULL WHERE issuer=$1',[f.endpoints.issuer]);await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]);await f.admin.query('UPDATE fabric.memberships SET grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2],JSON.stringify(['task:read','task:write','approval:approve'])]);
  }
 }
});
test('POSTGRES/command and original session expiry after measured run lock wait reject all writes',async()=>{
 for(const mode of ['command','session']){
  const seed=await f.seedRun(),lock=await f.admin.connect();let outcome:Promise<void>|undefined;
  try{
   if(mode==='command')seed.init={...seed.init,expiresAt:new Date(Date.now()+500).toISOString()};
   else await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE issuer=$1 AND subject=$2",[f.endpoints.issuer,f.actors[1]]);
   await lock.query('BEGIN');const pid=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-run',f.tenant,f.space,seed.runId])]);
   outcome=assert.rejects(f.repo.initialize(f.issued[1],seed.init,seed.value));await waitForLock(pid,'SELECT pg_advisory_xact_lock%');
   await new Promise(res=>setTimeout(res,600));await lock.query('COMMIT');await outcome;
   assert.deepEqual(await receipts(seed.init),{receipts:0,outbox:0});assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_sessions WHERE run_id=$1',[seed.runId])).rows[0].n,0);
  }finally{await lock.query('ROLLBACK');lock.release();if(outcome)await outcome;await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '600 seconds' WHERE issuer=$1 AND subject=$2",[f.endpoints.issuer,f.actors[1]]);}
 }
});
test('POSTGRES/command expiry after actual full checkpoint/receipt/outbox writes rolls back',async()=>{
 const seed=await f.seedRun();seed.init={...seed.init,expiresAt:new Date(Date.now()+800).toISOString()};
 await f.admin.query(`CREATE FUNCTION fabric.recovery_expiry_after_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.command_key='${seed.init.key}' THEN IF NOT EXISTS(SELECT 1 FROM fabric.recovery_receipts WHERE command_key=NEW.command_key) OR NOT EXISTS(SELECT 1 FROM fabric.recovery_sessions WHERE run_id=NEW.run_id) THEN RAISE EXCEPTION 'missing partial writes';END IF;PERFORM pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM '${seed.init.expiresAt}'::timestamptz-clock_timestamp()))+0.05);END IF;RETURN NEW;END $$;CREATE TRIGGER recovery_expiry_after_writes AFTER INSERT ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_expiry_after_writes()`);
 try{await assert.rejects(f.repo.initialize(f.issued[1],seed.init,seed.value),code('STALE_AUTHORITY'));assert.deepEqual(await receipts(seed.init),{receipts:0,outbox:0});assert.equal(await f.repo.get(f.issued[1],seed.runId),null);}finally{await f.admin.query('DROP TRIGGER recovery_expiry_after_writes ON fabric.recovery_outbox;DROP FUNCTION fabric.recovery_expiry_after_writes()');}
});
for(const mode of ['approval','approver-session'] as const)test('POSTGRES/'+mode+' expiry after actual approval/effect/receipt/outbox writes rolls back',async()=>{
 const seed=await start(),a=await approved(seed,mode==='approval'?new Date(Date.now()+1000).toISOString():undefined);
 const expires=new Date(Date.now()+1000).toISOString();if(mode==='approver-session')await f.admin.query('UPDATE fabric.identity_sessions SET expires_at=$3 WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2],expires]);
 const limit=mode==='approval'?a.b.expiresAt:expires;
 await f.admin.query(`CREATE FUNCTION fabric.recovery_effect_expiry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.command_key='${a.m.key}' THEN IF NOT EXISTS(SELECT 1 FROM fabric.approval_outbox WHERE receipt->>'approvalId'='${a.a.approvalId}') OR NOT EXISTS(SELECT 1 FROM fabric.recovery_operations WHERE operation_id='${a.b.operationId}') OR NOT EXISTS(SELECT 1 FROM fabric.recovery_receipts WHERE command_key=NEW.command_key) THEN RAISE EXCEPTION 'missing prior effect writes';END IF;PERFORM pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM '${limit}'::timestamptz-clock_timestamp()))+0.05);END IF;RETURN NEW;END $$;CREATE TRIGGER recovery_effect_expiry AFTER INSERT ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_effect_expiry()`);
 try{await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost));await noApprovalWrites(a.a.approvalId);assert.deepEqual(await receipts(a.m),{receipts:0,outbox:0});}finally{await f.admin.query('DROP TRIGGER recovery_effect_expiry ON fabric.recovery_outbox;DROP FUNCTION fabric.recovery_effect_expiry()');await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '600 seconds' WHERE issuer=$1 AND subject=$2",[f.endpoints.issuer,f.actors[2]]);}
});
test('POSTGRES/current authority row locks serialize payer revocation with entire recovery transaction',async()=>{
 const seed=await f.seedRun();let release!:()=>void,entered!:(pid:number)=>void;const gate=new Promise<void>(res=>release=res),ready=new Promise<number>(res=>entered=res);
 const held:AsyncUnitOfWork={withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{const receipt=await work(tx);entered(Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid));await gate;return receipt;})};
 const write=new RecoveryRepository(held,f.bindingFor).initialize(f.issued[1],seed.init,seed.value);const pid=await ready;let revoked=false;
 const revoke=f.admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]).then(()=>{revoked=true;});
 try{await waitForLock(pid,'%UPDATE fabric.actors%');assert.equal(revoked,false);release();await write;await revoke;await assert.rejects(f.repo.get(f.issued[1],seed.runId));assert.deepEqual(await receipts(seed.init),{receipts:1,outbox:1});}finally{release();await write;await revoke;await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]);}
});
test('POSTGRES/late approval expiry during a later participant lock wait is not reusable on recovery',async()=>{
 const seed=await start(),a=await approved(seed,new Date(Date.now()+800).toISOString()),lock=await f.admin.connect();let pending:Promise<void>|undefined;
 try{
  await lock.query('BEGIN');const pid=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  await lock.query('SELECT * FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 FOR UPDATE',[f.endpoints.issuer,f.actors[2]]);
  pending=assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost));await waitForLock(pid,'%identity_parties_current%');await new Promise(res=>setTimeout(res,900));await lock.query('COMMIT');await pending;
  await noApprovalWrites(a.a.approvalId);assert.deepEqual(await receipts(a.m),{receipts:0,outbox:0});
 }finally{await lock.query('ROLLBACK');lock.release();if(pending)await pending;}
});
test('POSTGRES/policy revision and revoked read grants revalidate current scopes and fence old prepared inputs',async()=>{
 const isolated=await createRecoveryFixture();try{
  const s=await isolated.seedRun();await isolated.repo.initialize(isolated.issued[1],s.init,s.value);
  const running=runSchema.parse({...s.value.run,revision:2,state:'running'}),progress={run:running,session:s.value.session,result:null};
  await isolated.repo.checkpoint(isolated.issued[1],isolated.mutation(s.runId,1,progress),progress);
  const a=await approved({...s,run:running,session:s.value.session},undefined,isolated);
  await isolated.admin.query('UPDATE fabric.spaces SET authority_revision=2 WHERE tenant_id=$1 AND space_id=$2',[isolated.tenant,isolated.space]);
  await assert.rejects(isolated.repo.get(isolated.issued[1],s.runId));await assert.rejects(isolated.repo.completeOutbox(isolated.issued[1],randomUUID()));
  const fresh=await isolated.scopeFor(1);assert.equal((await isolated.repo.get(fresh,s.runId))?.run.revision,2);
  await assert.rejects(isolated.repo.prepareEffect(fresh,a.m,a.effect,a.b,a.cost),code('UNAUTHORIZED'));
  assert.equal((await isolated.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[a.a.approvalId])).rows[0].state,'approved');
  const changed={run:runSchema.parse({...running,revision:3}),session:s.value.session,result:null};
  // Original requirement revision advancing invalidates a stale run checkpoint.
  await isolated.admin.query('UPDATE fabric.tasks SET revision=2 WHERE task_id=$1',[s.taskId]);
  await assert.rejects(isolated.repo.checkpoint(fresh,isolated.mutation(s.runId,2,changed),changed),code('STALE_AUTHORITY'));
  await isolated.admin.query("UPDATE fabric.memberships SET grants='[]' WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[isolated.tenant,isolated.space,isolated.actors[1]]);
  const denied=await isolated.scopeFor(1);await assert.rejects(isolated.repo.get(denied,s.runId),code('UNAUTHORIZED'));
 }finally{await isolated.close();}
});
test('POSTGRES/lease expiry, revocation and persisted stale generation prevent fresh continuation',async()=>{
 for(const mode of ['expired','revoked','generation']){
  const seed=await start(),session=sessionSchema.parse({...seed.session,cursor:1}),value={run:runSchema.parse({...seed.run,revision:3}),session,result:null};
  const lease={...seed.value.lease,...(mode==='expired'?{expiresAt:new Date(Date.now()-1000).toISOString()}:mode==='revoked'?{revokedAt:new Date().toISOString()}:{generation:{...seed.value.lease.generation,worker:2}})};
  await f.admin.query('UPDATE fabric.recovery_leases SET record=$2 WHERE lease_id=$1',[lease.leaseId,JSON.stringify(lease)]);
  const m=f.mutation(seed.runId,2,value);await assert.rejects(f.repo.checkpoint(f.issued[1],m,value));assert.deepEqual(await receipts(m),{receipts:0,outbox:0});assert.equal((await f.repo.get(f.issued[1],seed.runId))?.sessions[0]?.cursor,0);
 }
});
test('POSTGRES/reservation ancestry has current payer/backing and cannot create a second effect from one reservation',async()=>{
 const seed=await start(),a=await approved(seed),parent=randomUUID();
 await f.admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,payer_actor_id,currency,ceiling,reserved,revision) VALUES($1,$2,$3,$4,'synthetic',100,0,1)",[f.tenant,f.space,parent,f.actors[3]]);
 await f.admin.query('UPDATE fabric.budget_allowances SET parent_allowance_id=$2 WHERE allowance_id=$1',[seed.allowance,parent]);
 await assert.rejects(f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),code('UNAUTHORIZED'));await noApprovalWrites(a.a.approvalId);
 await f.admin.query('UPDATE fabric.budget_allowances SET reserved=50 WHERE allowance_id=$1',[parent]);
 await f.repo.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost);
 const next=await approved(seed);const m=f.mutation(seed.runId,3,{effect:next.effect,approval:next.b,cost:next.cost});
 await assert.rejects(f.repo.prepareEffect(f.issued[1],m,next.effect,next.b,next.cost),/duplicate key/);await noApprovalWrites(next.a.approvalId);assert.deepEqual(await receipts(m),{receipts:0,outbox:0});
});
test('POSTGRES/deferred pair constraints reject a receipt without its matching immutable outbox',async()=>{
 const seed=await start(),m=f.mutation(seed.runId,2,{}),outboxId=randomUUID();
 await assert.rejects(f.uow.withScope(f.issued[1],tx=>tx.query('INSERT INTO fabric.recovery_receipts(tenant_id,space_id,actor_id,command_key,command_id,run_id,payload_digest,receipt,outbox_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[f.tenant,f.space,f.actors[1],m.key,m.commandId,seed.runId,m.payloadDigest,JSON.stringify({}),outboxId])),/foreign key/);
 assert.deepEqual(await receipts(m),{receipts:0,outbox:0});
 const out=(await f.repo.outbox(f.issued[1])).find(r=>r.run_id===seed.runId)!;
 await assert.rejects(f.uow.withScope(f.issued[1],tx=>tx.query("UPDATE fabric.recovery_outbox SET payload='{}' WHERE outbox_id=$1",[out.outbox_id])),/immutable recovery outbox/);
});
test('POSTGRES/lease expires after full initialization writes and is rechecked before COMMIT',async()=>{
 const seed=await f.seedRun();seed.value={...seed.value,lease:{...seed.value.lease,expiresAt:new Date(Date.now()+700).toISOString()}};seed.init=f.mutation(seed.runId,0,seed.value);
 await f.admin.query(`CREATE FUNCTION fabric.recovery_lease_late() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.command_key='${seed.init.key}' THEN IF NOT EXISTS(SELECT 1 FROM fabric.recovery_leases WHERE run_id=NEW.run_id) THEN RAISE EXCEPTION 'missing lease write';END IF;PERFORM pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM '${seed.value.lease.expiresAt}'::timestamptz-clock_timestamp()))+0.05);END IF;RETURN NEW;END $$;CREATE TRIGGER recovery_lease_late AFTER INSERT ON fabric.recovery_outbox FOR EACH ROW EXECUTE FUNCTION fabric.recovery_lease_late()`);
 try{await assert.rejects(f.repo.initialize(f.issued[1],seed.init,seed.value),code('STALE_AUTHORITY'));assert.deepEqual(await receipts(seed.init),{receipts:0,outbox:0});assert.equal(await f.repo.get(f.issued[1],seed.runId),null);}finally{await f.admin.query('DROP TRIGGER recovery_lease_late ON fabric.recovery_outbox;DROP FUNCTION fabric.recovery_lease_late()');}
});
test('POSTGRES/lost effect-preparation COMMIT ACK keeps one consumed approval and reconciles without a new operation',async()=>{
 const seed=await start(),a=await approved(seed);let commits=0;
 const lost=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{commits++;throw new Error('lost effect prepare COMMIT ACK');}),bindingFor:f.bindingFor}),f.bindingFor);
 await assert.rejects(lost.prepareEffect(f.issued[1],a.m,a.effect,a.b,a.cost),code('UNKNOWN_COMMIT'));
 const lookup=await f.repo.lookupCommand(f.issued[1],a.m.key,a.m.payloadDigest);assert.equal(lookup.status,'committed');assert.equal(commits,1);
 assert.deepEqual(await receipts(a.m),{receipts:1,outbox:1});assert.deepEqual((await f.repo.get(f.issued[1],seed.runId))?.effects,[a.effect]);
 assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[a.a.approvalId])).rows[0].state,'consumed');
 for(const table of ['approval_audit','approval_receipts','approval_outbox'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[a.a.approvalId])).rows[0].n,1);
});
