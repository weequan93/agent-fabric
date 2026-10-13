import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import pg from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot,type PendingEpoch } from '../../src/epoch-journal.js';
import { TombstonePublicationRepository } from '../../src/tombstone-publication.js';
import { ForgetWorkRepository } from '../../src/forget-work.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
export async function registerForgetWorkTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!;
 const journal=new EpochWitnessJournal(root);let scope=await f.scopeFor(f.actors[0],f.spaces.pending),task=await f.task('maintenance',scope);
 const entities=Array.from({length:9},(_,i)=>({class:(i%2===0?'source':'knowledge') as 'source'|'knowledge',id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')}));
 const collision={id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')};
 const isolated=[{...collision,class:'source' as const},{...collision,class:'knowledge' as const,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')}];
 const noLineage={class:'artifact' as const,id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')};
 // Enrollment is a fixture-only bootstrap before the independent journal exists.
 // Once installed, every tested restriction uses the authenticated product owner.
 await a.publish(scope,async(c,epoch)=>{
  for(const entity of [...entities,...isolated,noLineage]){await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,1,$5)",[scope.tenantId,scope.spaceId,entity.class,entity.id,entity.id===noLineage.id?null:task.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,clock_timestamp(),clock_timestamp()+interval '60s')",[scope.tenantId,scope.spaceId,entity.class,entity.id,entity.witness,randomUUID(),randomUUID(),epoch]);}
 });
 await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
 const repo=new ForgetWorkRepository(f.uow,journal,f.native),recreate=()=>new ForgetWorkRepository(f.uow,new EpochWitnessJournal(root),f.native);
 const fresh=(index=1)=>({key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),entity:entities[index]!});
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const snapshot=async()=>{const data=[];for(const table of ['storage_authority_epoch','storage_epoch_publications','storage_forget_work','storage_tombstone_publications','storage_tombstones','storage_current_heads','storage_commands','storage_outbox'])data.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return data;};
 const entity=(index=8)=>f.uow.withScope(scope,tx=>recreate().authority.entity(tx,scope,entities[index]));
 let reads=0;
 await t.test('AUTHORITY/forget-work-publication',async()=>{
  assert.ok(await entity(0));const old=(await state())!.anchor,input=fresh(0),result=await repo.forget(scope,input);assert.equal(result.status,'committed');
  assert.deepEqual(await recreate().lookup(scope,input),result);assert.equal((await state())!.anchor.epoch,old.epoch+1);assert.equal((await state())!.anchor.policyRevision,old.policyRevision);assert.notEqual((await state())!.anchor.controlDigest,old.controlDigest);assert.equal((await state())!.pending,null);
  await deny(()=>entity(0),['RETENTION_RESTRICTED']);assert.ok(await entity());reads+=3;
  const pending=await recreate().pendingWork(scope,input);assert.equal(pending.status,'propagation-pending');
  assert.deepEqual(await recreate().pendingWork(scope,input),pending);
  const c=(await f.admin.query('SELECT * FROM fabric.storage_commands WHERE command_key=$1',[input.key])).rows;
  const j=(await f.admin.query('SELECT * FROM fabric.storage_outbox WHERE command_key=$1',[input.key])).rows;
  assert.equal(c.length,1);assert.equal(j.length,1);assert.equal(c[0].receipt_id,pending.receiptId);assert.equal(j[0].job_id,pending.jobId);
  assert.equal(j[0].class,input.entity.class);assert.equal(j[0].target_id,input.entity.id);assert.equal(Number(j[0].target_revision),input.entity.revision);
  assert.equal(Number(c[0].epoch),Number(j[0].epoch));assert.equal(Number(c[0].epoch),(await state())!.anchor.epoch);
  assert.equal(c[0].at.getTime(),j[0].at.getTime());
  const db=await snapshot(),witness=await state();await deny(()=>repo.forget(scope,input),['IDEMPOTENCY_CONFLICT']);await deny(()=>repo.forget(scope,fresh(0)),['RETENTION_RESTRICTED']);
  await deny(()=>recreate().lookup(scope,{...input,entity:entities[1]}),['IDEMPOTENCY_CONFLICT']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  const row=(await f.admin.query('SELECT * FROM fabric.storage_tombstone_publications WHERE command_key=$1',[input.key])).rows[0];assert.equal(row.id,input.entity.id);assert.equal(row.class,input.entity.class);assert.equal(row.witness,input.entity.witness);
 });
 await t.test('AUTHORITY/forget-work-class-lineage',async()=>{
  const read=(ref:unknown)=>f.uow.withScope(scope,tx=>recreate().authority.entity(tx,scope,ref));
  assert.ok(await read(isolated[0]));assert.ok(await read(isolated[1]));
  const command={...fresh(),entity:isolated[1]!};assert.equal((await repo.forget(scope,command)).status,'committed');
  await deny(()=>read(isolated[1]),['RETENTION_RESTRICTED']);assert.ok(await read(isolated[0]));
  const db=await snapshot(),witness=await state();
  await deny(()=>recreate().lookup(scope,{...command,entity:isolated[0]}),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>repo.forget(scope,{...fresh(),entity:{...isolated[0],class:'artifact'}}),['STALE_REVISION']);
  await deny(()=>repo.forget(scope,{...fresh(),entity:noLineage}),['AUTHORITY_UNAVAILABLE']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);reads+=3;
 });
 await t.test('AUTHORITY/forget-work-negative',async()=>{
  const input=fresh(),db=await snapshot(),witness=await state();
  for(const bad of [{...input,epoch:99},{...input,entity:{...input.entity,class:'method'}},{...input,entity:{...input.entity,spaceId:scope.spaceId}},{...input,entity:{...input.entity,revision:0}},{...input,entity:{...input.entity,kind:'active'}}])await deny(()=>repo.forget(scope,bad),['INVALID_SCHEMA']);
  for(const candidate of [{...input.entity,id:randomUUID()},{...input.entity,revision:2},{...input.entity,witness:'sha256:'+'0'.repeat(64)}])await deny(()=>repo.forget(scope,{...input,entity:candidate}),['STALE_REVISION']);
  await deny(()=>repo.forget({...scope} as typeof scope,input),['UNAUTHORIZED']);await deny(()=>repo.forget(f.scope,input),['UNAUTHORIZED']);
  const groupTask=await f.task('maintenance',f.scope);await deny(()=>repo.forget(f.scope,{...input,sessionId:groupTask.binding.sessionId}),['STALE_REVISION']);
  const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);assert.ok(await journal.current(foreign.tenantId,foreign.spaceId));
  const foreignTask=await f.task('maintenance',foreign);await deny(()=>repo.forget(foreign,{...input,sessionId:foreignTask.binding.sessionId}),['STALE_REVISION']);
  const reader=await f.scopeFor(f.actors[2]);await deny(()=>repo.forget(reader,input),['UNAUTHORIZED']);
  const ask=await f.task('ask',scope);await deny(()=>repo.forget(scope,{...input,sessionId:ask.binding.sessionId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  await deny(()=>repo.forget(scope,{...input,expiresAt:new Date(Date.now()-1).toISOString()}),['EXPIRED_COMMAND']);
  await deny(()=>repo.refresh(scope,{key:input.key,sessionId:input.sessionId,expiresAt:input.expiresAt}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/forget-work-rollback',async()=>{
  for(const phase of ['reserve','publication'] as const){const input=fresh(),db=await snapshot(),witness=(await state())!.anchor;
   const broken=new ForgetWorkRepository(f.uow,journal,f.native,phase==='reserve'?{afterReserve:async()=>{throw new Error('forget work reservation interruption');}}:{afterPublication:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_tombstone_publications WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await assert.rejects(broken.forget(scope,input));assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
   assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,witness);assert.ok(await entity(1));reads++;
  }
 });
 await t.test('AUTHORITY/forget-work-partial-write',async()=>{
  const input=fresh(),db=await snapshot(),before=(await state())!.anchor;
  await f.admin.query(`CREATE FUNCTION fabric.storage_test_outbox_interruption() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF NOT EXISTS(SELECT 1 FROM fabric.storage_commands WHERE tenant_id=NEW.tenant_id AND space_id=NEW.space_id AND actor_id=NEW.actor_id AND command_key=NEW.command_key) THEN
    RAISE EXCEPTION 'command not actually written before job'; END IF;
   RAISE EXCEPTION 'outbox publication interruption' USING ERRCODE='22012'; END $$;
   CREATE TRIGGER storage_test_outbox_interruption BEFORE INSERT ON fabric.storage_outbox FOR EACH ROW EXECUTE FUNCTION fabric.storage_test_outbox_interruption()`);
  try{await deny(()=>repo.forget(scope,input),['22012']);assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);assert.ok(await entity(1));reads++;
  }finally{await f.admin.query('DROP TRIGGER storage_test_outbox_interruption ON fabric.storage_outbox;DROP FUNCTION fabric.storage_test_outbox_interruption()');}
 });
 await t.test('AUTHORITY/forget-work-original-isolation',async()=>{
  const original=(await f.admin.query('SELECT command_key FROM fabric.storage_forget_work WHERE tenant_id=$1 AND space_id=$2 ORDER BY at LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0];
  const input={...fresh(0),key:original.command_key},db=await snapshot(),witness=await state();
  const other=await f.scopeFor(f.actors[1],scope.spaceId);
  await deny(()=>recreate().lookup(other,input),['UNAUTHORIZED']);
  const otherTask=await f.task('maintenance',other);
  assert.deepEqual(await recreate().lookup(other,{...input,sessionId:otherTask.binding.sessionId}),{status:'absent-safe'});
  await deny(()=>recreate().pendingWork(other,input),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>repo.forget(other,input),['42501','UNAUTHORIZED']);
  await deny(()=>recreate().pendingWork(scope,{...input,entity:entities[1]}),['IDEMPOTENCY_CONFLICT']);
  for(const field of ['receiptId','jobId','epoch','status'])await deny(()=>repo.forget(scope,{...fresh(),[field]:randomUUID()}),['INVALID_SCHEMA']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/forget-work-ack-gap',async()=>{
  const input=fresh(2),broken=new ForgetWorkRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('forget work ACK interruption');}});
  await assert.rejects(broken.forget(scope,input),{message:'forget work ACK interruption'});assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
  const reservation=await state();assert.ok(reservation?.pending);
  await deny(()=>new TombstonePublicationRepository(f.uow,new EpochWitnessJournal(root),f.native).lookup(scope,input),['AUTHORITY_UNAVAILABLE']);
  assert.deepEqual(await state(),reservation);
  const job=(await f.admin.query('SELECT * FROM fabric.storage_outbox WHERE command_key=$1',[input.key])).rows[0];assert.ok(job);
  const corrupt=await f.admin.connect();
  try{
   await corrupt.query('BEGIN');await corrupt.query('ALTER TABLE fabric.storage_outbox DISABLE TRIGGER ALL');
   await corrupt.query('DELETE FROM fabric.storage_outbox WHERE job_id=$1',[job.job_id]);
   await corrupt.query('ALTER TABLE fabric.storage_outbox ENABLE TRIGGER ALL');await corrupt.query('COMMIT');
   await deny(()=>recreate().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);
   assert.deepEqual(await state(),reservation);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  }finally{
   await corrupt.query('ROLLBACK');await corrupt.query('INSERT INTO fabric.storage_outbox VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[job.tenant_id,job.space_id,job.job_id,job.actor_id,job.command_key,job.class,job.target_id,job.target_revision,job.epoch,job.at]);corrupt.release();
  }
  const blocker=await f.admin.connect(),pending=await state(),db=await snapshot();
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
   const lookup=recreate().lookup(scope,input);lookup.catch(()=>{});let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true);assert.deepEqual(await lookup,{status:'unknown',replayAllowed:false});assert.deepEqual(await state(),pending);assert.deepEqual(await snapshot(),db);
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const original=(await f.admin.query("SELECT at FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 AND id=$3",[scope.tenantId,scope.spaceId,input.entity.id])).rows[0].at as Date;
  const c=await f.admin.connect();const substitute=async(at:Date)=>{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_tombstones DISABLE TRIGGER USER');await c.query("UPDATE fabric.storage_tombstones SET at=$4 WHERE tenant_id=$1 AND space_id=$2 AND id=$3",[scope.tenantId,scope.spaceId,input.entity.id,at]);await c.query('ALTER TABLE fabric.storage_tombstones ENABLE TRIGGER USER');await c.query('COMMIT');};
  try{await substitute(new Date(original.getTime()+1));await deny(()=>recreate().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}finally{await c.query('ROLLBACK');await substitute(original);c.release();}
  assert.equal((await recreate().lookup(scope,input)).status,'committed');await deny(()=>entity(2),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/forget-work-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transportError=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transportError);pool.on('connect',client=>client.on('error',transportError));
   try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),lost=new ForgetWorkRepository(uow,journal,f.native),index=mode==='commit'?3:4,input=fresh(index),db=await snapshot(),before=(await state())!.anchor;
    await deny(()=>lost.forget(scope,input),['UNKNOWN_COMMIT']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
    const result=await recreate().lookup(scope,input);assert.equal(result.status,mode==='commit'?'committed':'absent-safe');
    if(mode==='commit'){assert.equal((await recreate().pendingWork(scope,input)).status,'propagation-pending');assert.equal(proxy.dropped(),1);assert.equal((await state())!.anchor.epoch,before.epoch+1);await deny(()=>entity(index),['RETENTION_RESTRICTED']);assert.deepEqual(await recreate().lookup(scope,input),result);}
    else{assert.equal(proxy.requestsDropped(),1);assert.equal(proxy.dropped(),0);assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);assert.ok(await entity(index));}reads++;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('AUTHORITY/forget-work-concurrency',async()=>{
  const input=fresh(5),other={...input,key:randomUUID()},before=(await state())!.anchor;let hit!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
  const held=new ForgetWorkRepository(f.uow,journal,f.native,{afterPublication:async()=>{hit();await gate;}}),publishing=held.forget(scope,input);publishing.catch(()=>{});await Promise.race([reached,publishing.then(()=>{throw new Error('Tombstone publication passed gate');})]);
  const lookup=recreate().lookup(scope,input);lookup.catch(()=>{});const competing=deny(()=>recreate().forget(scope,other),['RETENTION_RESTRICTED']);competing.catch(()=>{});
  const c=await f.admin.connect();try{let waits=0;const deadline=Date.now()+1500;while(Date.now()<deadline){await c.query('SELECT pg_stat_clear_snapshot()');waits=(await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0",[f.roles.controller])).rows[0].n;if(waits===2)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waits,2);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}finally{c.release();release();}
  assert.deepEqual(await lookup,await publishing);await competing;assert.equal((await state())!.anchor.epoch,before.epoch+1);for(const table of ['storage_tombstone_publications','storage_forget_work'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE id=$1',[input.entity.id])).rows[0].n,1);for(const table of ['storage_commands','storage_outbox'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[input.key])).rows[0].n,1);assert.deepEqual(await recreate().pendingWork(scope,input),await repo.pendingWork(scope,input));assert.deepEqual(await recreate().lookup(scope,other),{status:'absent-safe'});await deny(()=>entity(5),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/forget-work-expiry',async()=>{
  const input=fresh(6);input.expiresAt=new Date(Date.now()+350).toISOString();const db=await snapshot(),before=(await state())!.anchor;
  const expired=new ForgetWorkRepository(f.uow,journal,f.native,{afterPublication:async tx=>{await tx.query('SELECT pg_sleep(0.4)');}});
  await deny(()=>expired.forget(scope,input),['EXPIRED_COMMAND']);assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);assert.ok(await entity(6));reads++;
  const blocker=await f.admin.connect(),wait=fresh(6);wait.expiresAt=new Date(Date.now()+350).toISOString();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);pending=deny(()=>repo.forget(scope,wait),['EXPIRED_COMMAND']);pending.catch(()=>{});
   let blocked=false;const deadline=Date.now()+1000;while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.4)');await blocker.query('COMMIT');await pending;
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);assert.equal((await state())!.pending,null);
 });
 await t.test('AUTHORITY/forget-work-roles',async()=>{
  const input=fresh(7),before=(await state())!.anchor,db=await snapshot(),witness=await state();
  const sql='SELECT fabric.storage_publish_forget_work($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',args=[input.key,'sha256:'+'0'.repeat(64),input.sessionId,before.epoch,before.anchorId,randomUUID(),before.controlDigest,'sha256:'+'1'.repeat(64),input.entity.class,input.entity.id,input.entity.revision,input.entity.witness,new Date().toISOString(),input.expiresAt,randomUUID(),randomUUID()];
  for(const role of [f.worker,f.idpPool,f.client]){await deny(()=>role.query('SELECT * FROM fabric.storage_forget_work'),['42501']);await deny(()=>role.query(sql,args),['42501']);}
  await deny(()=>f.controller.query(sql,args),['42501']);await deny(()=>f.admin.query(sql,args),['42501']);
  const forged=[...args];forged[11]='sha256:'+'0'.repeat(64);await deny(()=>f.uow.withScope(scope,tx=>tx.query(sql,forged)),['23514']);
  await deny(()=>f.uow.withScope(scope,tx=>tx.query("INSERT INTO fabric.storage_tombstones VALUES($1,$2,$3,$4,1,$5,$6,clock_timestamp())",[scope.tenantId,scope.spaceId,input.entity.class,input.entity.id,before.epoch,input.key])),['42501']);
  for(const table of ['storage_tombstones','storage_tombstone_publications','storage_forget_work','storage_commands','storage_outbox'])for(const op of ['UPDATE fabric.'+table+' SET at=at','DELETE FROM fabric.'+table])await deny(()=>f.admin.query(op),['P0001']);
  const table=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'SELECT') AS read,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_forget_work'::regclass")).rows[0];assert.deepEqual(Object.values(table),[true,true,true,false]);
  const fn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_publish_forget_work'")).rows[0];assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);
  const fks=(await f.admin.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='fabric.storage_forget_work'::regclass AND contype='f'")).rows;
  assert.equal(fks.length,4);assert.ok(fks.some(r=>r.definition.includes('binding_digest, receipt_id, epoch, at')));assert.ok(fks.some(r=>r.definition.includes('job_id, actor_id, command_key, class, id, revision, epoch, at')));
  assert.equal((await f.controller.query('SELECT * FROM fabric.storage_forget_work')).rows.length,0);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/forget-work-grant-wait',async()=>{
  const input=fresh(7),db=await snapshot(),witness=await state(),params=[scope.tenantId,scope.spaceId,scope.actorId],blocker=await f.admin.connect();
  const original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='storage:forget'))]);pending=deny(()=>repo.forget(scope,input),['STALE_AUTHORITY','UNAUTHORIZED']);pending.catch(()=>{});
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;let blocked=false;const deadline=Date.now()+1500;while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('COMMIT');await pending;
   const freshScope=await f.scopeFor(f.actors[0],scope.spaceId);assert.ok(!freshScope.grants.includes('storage:forget'));await deny(()=>repo.forget(freshScope,input),['UNAUTHORIZED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);scope=await f.scopeFor(f.actors[0],scope.spaceId);}
  await deny(()=>repo.forget(scope,fresh(7)),['42501']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);task=await f.task('maintenance',scope);assert.equal((await repo.forget(scope,fresh(7))).status,'committed');await deny(()=>entity(7),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/forget-work-journal-branches',async()=>{
  const previous=(await state())!.anchor,input=fresh(8),base={schemaVersion:5,kind:'forget-work',actorId:scope.actorId,key:input.key,binding:'sha256:'+'0'.repeat(64),sessionId:input.sessionId,expiresAt:input.expiresAt,previous,next:{...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:'sha256:'+'1'.repeat(64)},entity:input.entity,at:new Date().toISOString(),receiptId:randomUUID(),jobId:randomUUID()},witness=await state();
  for(const next of [{...base.next,policyRevision:previous.policyRevision+1},{...base.next,controlDigest:previous.controlDigest}])await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,{...base,next} as PendingEpoch),['INVALID_SCHEMA']);
  for(const fields of [{receiptId:'bad'},{jobId:null},{receiptId:undefined},{completed:true},{schemaVersion:4}])await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,{...base,...fields} as unknown as PendingEpoch),['INVALID_SCHEMA']);
  await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,{...base,kind:'restore'} as unknown as PendingEpoch),['INVALID_SCHEMA']);assert.deepEqual(await state(),witness);assert.ok(await entity());reads++;
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);return {reads};
}
