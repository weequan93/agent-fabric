import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createScopeVerifier,FoundationError,type CurrentAuthority,type ScopeRef,type TaskCreateInput,type VerifiedScope} from '../src/contracts.js';
import {PostgresUnitOfWork} from '../src/postgres-uow.js';
import {PostgresTaskRepository,commandDigest} from '../src/task-repository.js';
import {readOutbox,completeOutbox} from '../src/outbox.js';
import {migrateFoundation} from '../src/migration.js';
const url=process.env.FOUNDATION_DATABASE_URL;if(!url)throw new Error('Actual owned PostgreSQL URL required; no mock/skip');
const admin=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:2000});
const tenant=randomUUID(),space=randomUUID(),space2=randomUUID(),tenant2=randomUUID(),space3=randomUUID(),actor=randomUUID(),payer=randomUUID(),otherActor=randomUUID();
const password=randomUUID();let controller:pg.Pool,worker:pg.Pool,uow:PostgresUnitOfWork,repo:PostgresTaskRepository,scope:VerifiedScope;
function target(user:string){const u=new URL(url!);u.username=user;u.password=password;return u.href;}
async function authority(ref:ScopeRef):Promise<CurrentAuthority|null>{
 const a=await admin.query(`SELECT s.*,m.revision AS membership_revision,m.grants,m.revoked_at AS membership_revoked,a.revoked_at AS actor_revoked,p.revoked_at AS payer_revoked FROM fabric.spaces s JOIN fabric.memberships m ON m.tenant_id=s.tenant_id AND m.space_id=s.space_id AND m.actor_id=$3 JOIN fabric.actors a ON a.tenant_id=s.tenant_id AND a.actor_id=$3 JOIN fabric.actors p ON p.tenant_id=s.tenant_id AND p.actor_id=s.payer_actor_id WHERE s.tenant_id=$1 AND s.space_id=$2`,[ref.tenantId,ref.spaceId,actor]);
 const x=a.rows[0];return x?{...ref,actorId:actor,payerId:x.payer_actor_id,authorityRevision:Number(x.authority_revision),membershipRevision:Number(x.membership_revision),grants:x.grants,actorRevoked:x.actor_revoked!==null,payerRevoked:x.payer_revoked!==null,membershipRevoked:x.membership_revoked!==null,lifecycle:x.lifecycle}:null;
}
const verifier=createScopeVerifier(async request=>request.sessionCredential==='synthetic-server-session'?authority(request):null);
function input(overrides:Partial<TaskCreateInput>={}):TaskCreateInput{const x={taskId:randomUUID(),runId:randomUUID(),commandId:randomUUID(),mutationId:randomUUID(),jobId:randomUUID(),eventId:randomUUID(),idempotencyKey:randomUUID(),expectedRevision:0,requirements:{purpose:'synthetic-test'},...overrides};return {...x,payloadDigest:commandDigest(x)};}
const code=(c:string)=>(e:unknown)=>e instanceof FoundationError&&e.code===c;
before(async()=>{
 // Real failing migration leaves core phase tracked; authorized next call forward-completes roles.
 await assert.rejects(migrateFoundation(admin,{ownedSyntheticDatabase:true,injectBeforeRoles:true}),/deliberate_missing/);
 assert.deepEqual((await admin.query('SELECT version FROM public.fabric_foundation_migrations')).rows.map(x=>x.version),[1]);
 await migrateFoundation(admin,{ownedSyntheticDatabase:true});
 await admin.query(`ALTER ROLE fabric_controller LOGIN PASSWORD '${password}'; ALTER ROLE fabric_worker LOGIN PASSWORD '${password}';`);
 for(const t of [tenant,tenant2])await admin.query('INSERT INTO fabric.tenants(tenant_id) VALUES($1)',[t]);
 for(const [t,a] of [[tenant,actor],[tenant,payer],[tenant2,otherActor]])await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2,$3)',[t,a,a]);
 for(const [t,s,a,p] of [[tenant,space,actor,payer],[tenant,space2,actor,payer],[tenant2,space3,otherActor,otherActor]]){
  await admin.query("INSERT INTO fabric.spaces(tenant_id,space_id,owner_actor_id,payer_actor_id,data_namespace_id,compute_namespace_id,authority_revision,lifecycle) VALUES($1,$2,$3,$4,$5,$6,1,'active')",[t,s,a,p,randomUUID(),randomUUID()]);
  await admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4)',[t,s,a,JSON.stringify(['task:read','task:write'])]);
 }
 controller=new pg.Pool({connectionString:target('fabric_controller'),max:4,connectionTimeoutMillis:2000});worker=new pg.Pool({connectionString:target('fabric_worker'),max:1,connectionTimeoutMillis:2000});
 uow=new PostgresUnitOfWork(controller);repo=new PostgresTaskRepository(uow);scope=await verifier.verify({tenantId:tenant,spaceId:space,sessionCredential:'synthetic-server-session'});
});
after(async()=>{await controller?.end();await worker?.end();await admin.end();});
test('PG/nonprivileged-role',async()=>{
 const r=await controller.query("SELECT current_user,version(),rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");assert.equal(r.rows[0].current_user,'fabric_controller');for(const k of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole'])assert.equal(r.rows[0][k],false);assert.match(r.rows[0].version,/PostgreSQL 16\./);
 const owner=await controller.query("SELECT nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owns FROM pg_namespace WHERE nspname='fabric'");assert.equal(owner.rows[0].owns,false);
 await assert.rejects(new PostgresUnitOfWork(admin).withScope(scope,async()=>1),code('UNAUTHORIZED'));
 console.log('actual-postgres-role-and-version: nonowner/nonsuperuser/nonBYPASSRLS measured');
});
test('PG/worker-no-grants',async()=>{
 await worker.query("SELECT set_config('app.tenant_id',$1,false),set_config('app.space_id',$2,false),set_config('app.actor_id',$3,false),set_config('app.identity_verified','true',false)",[tenant,space,actor]);
 for(const sql of ['SELECT * FROM fabric.tasks','SELECT fabric.controller_authority()','INSERT INTO fabric.tasks DEFAULT VALUES'])await assert.rejects(worker.query(sql),/permission denied/);
});
test('PG/missing-scope',async()=>{assert.equal((await controller.query('SELECT * FROM fabric.tasks')).rowCount,0);await assert.rejects(controller.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned','{}')",[tenant,space,randomUUID(),actor]),/row-level security/);await assert.rejects(repo.get({...scope} as VerifiedScope,randomUUID()),code('UNVERIFIED_SCOPE'));});
test('PG/cross-tenant-space',async()=>{
 const receipt=await repo.create(scope,input());const other=await verifier.verify({tenantId:tenant,spaceId:space2,sessionCredential:'synthetic-server-session'});assert.equal(await repo.get(other,receipt.taskId),null);
 await assert.rejects(verifier.verify({tenantId:tenant2,spaceId:space3,sessionCredential:'synthetic-server-session'}),code('UNAUTHORIZED'));
 await assert.rejects(uow.withScope(scope,tx=>tx.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned','{}')",[tenant,space2,randomUUID(),actor])),/row-level security/);
 await assert.rejects(uow.withScope(scope,tx=>tx.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned','{}')",[tenant2,space3,randomUUID(),otherActor])),/row-level security/);
});
test('PG/current-membership-payer',async()=>{
 const task=await repo.create(scope,input());
 await admin.query('UPDATE fabric.memberships SET revoked_at=now() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);await assert.rejects(repo.get(scope,task.taskId),code('UNAUTHORIZED'));await admin.query('UPDATE fabric.memberships SET revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);
 await admin.query('UPDATE fabric.actors SET revoked_at=now() WHERE tenant_id=$1 AND actor_id=$2',[tenant,payer]);await assert.rejects(repo.get(scope,task.taskId),code('UNAUTHORIZED'));await admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[tenant,payer]);
 await admin.query('UPDATE fabric.memberships SET revision=2 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);await assert.rejects(repo.get(scope,task.taskId),code('STALE_AUTHORITY'));await admin.query('UPDATE fabric.memberships SET revision=1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);
 await admin.query("UPDATE fabric.spaces SET lifecycle='suspended' WHERE tenant_id=$1 AND space_id=$2",[tenant,space]);await assert.rejects(repo.get(scope,task.taskId),code('UNAUTHORIZED'));await admin.query("UPDATE fabric.spaces SET lifecycle='active' WHERE tenant_id=$1 AND space_id=$2",[tenant,space]);
});
test('PG/current-session-expiry-revocation',async()=>{
 // Membership and payer stay active throughout: only original authentication
 // denies this previously issued scope, reproducing SEC-G1-001 on real PG.
 let sessionState:'active'|'expired'|'revoked'='active';let authenticationChecks=0;
 const authenticatedAuthority=await authority({tenantId:tenant,spaceId:space});assert.ok(authenticatedAuthority);
 const sessionVerifier=createScopeVerifier(async request=>{
  authenticationChecks++;
  return sessionState==='active'&&request.sessionCredential==='revocable-synthetic-session'?authenticatedAuthority:null;
 });
 const sessionScope=await sessionVerifier.verify({tenantId:tenant,spaceId:space,sessionCredential:'revocable-synthetic-session'});
 const committed=input();const receipt=await repo.create(sessionScope,committed);
 const counts=async()=>{
  const result:Record<string,number>={};
  for(const table of ['tasks','task_revisions','runs','run_events','commands','outbox','authority_mutations'])result[table]=(await admin.query(`SELECT count(*)::int AS count FROM fabric.${table} WHERE tenant_id=$1 AND space_id=$2`,[tenant,space])).rows[0].count;
  return result;
 };
 const beforeCounts=await counts();const beforeChecks=authenticationChecks;
 for(const deniedState of ['expired','revoked'] as const){
  sessionState=deniedState;const rejected=input();let workInvoked=false;
  await assert.rejects(repo.get(sessionScope,receipt.taskId),code('UNAUTHORIZED'));
  await assert.rejects(repo.create(sessionScope,rejected),code('UNAUTHORIZED'));
  await assert.rejects(repo.revise(sessionScope,receipt.taskId,1,{unauthorized:true}),code('UNAUTHORIZED'));
  await assert.rejects(repo.lookupCommand(sessionScope,committed.idempotencyKey,committed.payloadDigest),code('UNAUTHORIZED'));
  await assert.rejects(uow.withScope(sessionScope,async tx=>{workInvoked=true;return tx.query('SELECT * FROM fabric.tasks');}),code('UNAUTHORIZED'));
  assert.equal(workInvoked,false);assert.deepEqual(await counts(),beforeCounts);
  assert.equal(Number((await admin.query('SELECT revision FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3',[tenant,space,receipt.taskId])).rows[0].revision),1);
 }
 assert.equal(authenticationChecks-beforeChecks,10);
 // Restoring the same session can reuse its scope only if current DB authority
 // still matches; no blocked write or receipt lookup is replayed automatically.
 sessionState='active';assert.equal((await repo.get(sessionScope,receipt.taskId))?.revision,1);
 const lookup=await repo.lookupCommand(sessionScope,committed.idempotencyKey,committed.payloadDigest);
 assert.equal(lookup.status,'committed');if(lookup.status==='committed')assert.deepEqual(lookup.receipt,receipt);
 assert.deepEqual(await counts(),beforeCounts);
 // Original authentication is active and its authority snapshot still matches;
 // the additional transaction-locked DB check must independently deny revocation.
 await admin.query('UPDATE fabric.memberships SET revoked_at=now() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);
 try{await assert.rejects(repo.get(sessionScope,receipt.taskId),code('UNAUTHORIZED'));}
 finally{await admin.query('UPDATE fabric.memberships SET revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[tenant,space,actor]);}
 const reset=await controller.query("SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant,nullif(current_setting('app.actor_id',true),'') AS actor");assert.deepEqual(reset.rows,[{tenant:null,actor:null}]);
});
test('PG/reused-pool-reset',async()=>{
 await uow.withScope(scope,async tx=>assert.equal((await tx.query("SELECT current_setting('app.tenant_id') AS tenant")).rows[0]?.tenant,tenant));
 await assert.rejects(uow.withScope(scope,async()=>{throw new Error('forced rollback');}),/forced rollback/);
 const r=await controller.query("SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant,nullif(current_setting('app.actor_id',true),'') AS actor");assert.deepEqual(r.rows,[{tenant:null,actor:null}]);assert.equal((await controller.query('SELECT * FROM fabric.tasks')).rowCount,0);
});
test('PG/atomic-outbox',async()=>{
 const cmd=input();const receipt=await repo.create(scope,cmd);assert.equal(receipt.jobId,cmd.jobId);
 for(const [table,col,id] of [['tasks','task_id',cmd.taskId],['runs','run_id',cmd.runId],['run_events','event_id',cmd.eventId],['commands','command_id',cmd.commandId],['outbox','job_id',cmd.jobId],['authority_mutations','mutation_id',cmd.mutationId]])assert.equal((await admin.query(`SELECT count(*)::int AS count FROM fabric.${table} WHERE ${col}=$1`,[id])).rows[0].count,1);
 await uow.withScope(scope,async tx=>{assert.ok((await readOutbox(tx,scope)).some(x=>x.jobId===cmd.jobId));await completeOutbox(tx,scope,cmd.jobId);await completeOutbox(tx,scope,cmd.jobId);});
 assert.notEqual((await admin.query('SELECT completed_at FROM fabric.outbox WHERE job_id=$1',[cmd.jobId])).rows[0].completed_at,null);
});
test('PG/idempotency-conflict',async()=>{
 const cmd=input();const result=await Promise.all([repo.create(scope,cmd),repo.create(scope,cmd)]);assert.deepEqual(result[0],result[1]);
 const conflict=input({...cmd,requirements:{different:true}});await assert.rejects(repo.create(scope,conflict),code('IDEMPOTENCY_CONFLICT'));
 assert.equal((await admin.query('SELECT count(*)::int AS count FROM fabric.commands WHERE idempotency_key=$1',[cmd.idempotencyKey])).rows[0].count,1);
 await assert.rejects(repo.create(scope,{...input(),payloadDigest:'sha256:fake'}),code('INVALID_INPUT'));
});
test('PG/revision-concurrency',async()=>{
 const cmd=input();await repo.create(scope,cmd);const results=await Promise.allSettled([repo.revise(scope,cmd.taskId,1,{a:1}),repo.revise(scope,cmd.taskId,1,{a:2})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const failure=results.find(x=>x.status==='rejected') as PromiseRejectedResult;assert.ok(code('REVISION_CONFLICT')(failure.reason));assert.equal((await repo.get(scope,cmd.taskId))?.revision,2);assert.equal((await admin.query('SELECT count(*)::int AS count FROM fabric.task_revisions WHERE task_id=$1',[cmd.taskId])).rows[0].count,2);
});
test('PG/rollback-reopen',async()=>{
 const old=input();await repo.create(scope,old);const broken=input({eventId:old.eventId});await assert.rejects(repo.create(scope,broken),/unique constraint/);
 for(const [table,col,id] of [['tasks','task_id',broken.taskId],['runs','run_id',broken.runId],['outbox','job_id',broken.jobId],['commands','command_id',broken.commandId]])assert.equal((await admin.query(`SELECT count(*)::int AS count FROM fabric.${table} WHERE ${col}=$1`,[id])).rows[0].count,0);
 const reopened=new pg.Pool({connectionString:target('fabric_controller'),max:1});try{assert.equal((await new PostgresTaskRepository(new PostgresUnitOfWork(reopened)).get(scope,old.taskId))?.taskId,old.taskId);}finally{await reopened.end();}
});
test('PG/unknown-commit-lookup',async()=>{
 const cmd=input();let sends=0;const lost=new PostgresTaskRepository(new PostgresUnitOfWork(controller,()=>{sends++;throw new Error('synthetic lost COMMIT ack after real durable commit');}));await assert.rejects(lost.create(scope,cmd),code('UNKNOWN_COMMIT'));
 const result=await repo.lookupCommand(scope,cmd.idempotencyKey,cmd.payloadDigest);assert.equal(result.status,'committed');if(result.status==='committed')assert.equal(result.receipt.commandId,cmd.commandId);assert.equal(sends,1);
 assert.equal((await admin.query('SELECT count(*)::int AS count FROM fabric.commands WHERE command_id=$1',[cmd.commandId])).rows[0].count,1);assert.equal((await admin.query('SELECT count(*)::int AS count FROM fabric.outbox WHERE job_id=$1',[cmd.jobId])).rows[0].count,1);
 assert.deepEqual(await repo.lookupCommand(scope,randomUUID(),cmd.payloadDigest),{status:'absent-safe'});
});
test('PG/migration-recovery',async()=>{
 await migrateFoundation(admin,{ownedSyntheticDatabase:true});assert.deepEqual((await admin.query('SELECT version FROM public.fabric_foundation_migrations ORDER BY version')).rows.map(x=>x.version),[1,2]);
 await assert.rejects(migrateFoundation(admin,{ownedSyntheticDatabase:true,expectedVersion:'future' as 'g0-v1'}),/version not authorized/);
 const original=(await admin.query('SELECT digest FROM public.fabric_foundation_migrations WHERE version=2')).rows[0].digest;await admin.query("UPDATE public.fabric_foundation_migrations SET digest='incompatible' WHERE version=2");try{await assert.rejects(migrateFoundation(admin,{ownedSyntheticDatabase:true}),/digest incompatible/);}finally{await admin.query('UPDATE public.fabric_foundation_migrations SET digest=$1 WHERE version=2',[original]);}
 await migrateFoundation(admin,{ownedSyntheticDatabase:true});console.log('migration-compatibility and failure-forward-recovery measured on actual PostgreSQL');
});
