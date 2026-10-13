import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import pg from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot,type PendingEpoch } from '../../src/epoch-journal.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
export async function registerSourceTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!;
 const journal=new EpochWitnessJournal(root);let scope=await f.scopeFor(f.actors[0],f.spaces.personal),task=await f.task('maintenance',scope);
 const sources=Array.from({length:9},()=>({id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')}));
 // Enrollment is a fixture-only bootstrap before the independent journal exists.
 // Once installed, every tested restriction uses the authenticated product owner.
 await a.publish(scope,async(c,epoch)=>{
  for(const source of sources){await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[scope.tenantId,scope.spaceId,source.id,task.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,'source',$3,1,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '60s')",[scope.tenantId,scope.spaceId,source.id,source.witness,randomUUID(),randomUUID(),epoch]);}
 });
 await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
 const repo=new SourceRevocationRepository(f.uow,journal,f.native),recreate=()=>new SourceRevocationRepository(f.uow,new EpochWitnessJournal(root),f.native);
 const fresh=(index=1)=>({key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),source:sources[index]!});
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const snapshot=async()=>{const data=[];for(const table of ['storage_authority_epoch','storage_epoch_publications','storage_source_revocations','storage_restrictions','storage_current_heads','storage_commands','storage_outbox'])data.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return data;};
 const entity=(index=8)=>f.uow.withScope(scope,tx=>recreate().authority.entity(tx,scope,{class:'source',...sources[index]}));
 let reads=0;
 await t.test('AUTHORITY/source-publication',async()=>{
  assert.ok(await entity(0));const old=(await state())!.anchor,input=fresh(0),result=await repo.revoke(scope,input);assert.equal(result.status,'committed');
  assert.deepEqual(await recreate().lookup(scope,input),result);assert.equal((await state())!.anchor.epoch,old.epoch+1);assert.equal((await state())!.anchor.policyRevision,old.policyRevision);assert.notEqual((await state())!.anchor.controlDigest,old.controlDigest);assert.equal((await state())!.pending,null);
  await deny(()=>entity(0),['RETENTION_RESTRICTED']);assert.ok(await entity());reads+=3;
  const db=await snapshot(),witness=await state();await deny(()=>repo.revoke(scope,input),['IDEMPOTENCY_CONFLICT']);await deny(()=>repo.revoke(scope,fresh(0)),['RETENTION_RESTRICTED']);
  await deny(()=>recreate().lookup(scope,{...input,source:sources[1]}),['IDEMPOTENCY_CONFLICT']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  const row=(await f.admin.query('SELECT * FROM fabric.storage_source_revocations WHERE command_key=$1',[input.key])).rows[0];assert.equal(row.source_id,input.source.id);assert.equal(row.kind,'revoked');assert.equal(row.witness,input.source.witness);
 });
 await t.test('AUTHORITY/source-negative',async()=>{
  const input=fresh(),db=await snapshot(),witness=await state();
  for(const bad of [{...input,epoch:99},{...input,source:{...input.source,spaceId:scope.spaceId}},{...input,source:{...input.source,revision:0}},{...input,source:{...input.source,kind:'active'}}])await deny(()=>repo.revoke(scope,bad),['INVALID_SCHEMA']);
  for(const source of [{...input.source,id:randomUUID()},{...input.source,revision:2},{...input.source,witness:'sha256:'+'0'.repeat(64)}])await deny(()=>repo.revoke(scope,{...input,source}),['STALE_REVISION']);
  await deny(()=>repo.revoke({...scope} as typeof scope,input),['UNAUTHORIZED']);await deny(()=>repo.revoke(f.scope,input),['UNAUTHORIZED']);
  const groupTask=await f.task('maintenance',f.scope);await deny(()=>repo.revoke(f.scope,{...input,sessionId:groupTask.binding.sessionId}),['STALE_REVISION']);
  const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);await journal.install(foreign.tenantId,foreign.spaceId,a.anchors.get(a.key(foreign))!);
  const foreignTask=await f.task('maintenance',foreign);await deny(()=>repo.revoke(foreign,{...input,sessionId:foreignTask.binding.sessionId}),['STALE_REVISION']);
  const reader=await f.scopeFor(f.actors[2]);await deny(()=>repo.revoke(reader,input),['UNAUTHORIZED']);
  const ask=await f.task('ask',scope);await deny(()=>repo.revoke(scope,{...input,sessionId:ask.binding.sessionId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  await deny(()=>repo.revoke(scope,{...input,expiresAt:new Date(Date.now()-1).toISOString()}),['EXPIRED_COMMAND']);
  await deny(()=>repo.refresh(scope,{key:input.key,sessionId:input.sessionId,expiresAt:input.expiresAt}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/source-rollback',async()=>{
  for(const phase of ['reserve','publication'] as const){const input=fresh(),db=await snapshot(),witness=(await state())!.anchor;
   const broken=new SourceRevocationRepository(f.uow,journal,f.native,phase==='reserve'?{afterReserve:async()=>{throw new Error('source reservation interruption');}}:{afterPublication:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_source_revocations WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await assert.rejects(broken.revoke(scope,input));assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
   assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,witness);assert.ok(await entity(1));reads++;
  }
 });
 await t.test('AUTHORITY/source-ack-gap',async()=>{
  const input=fresh(2),broken=new SourceRevocationRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('source ACK interruption');}});
  await assert.rejects(broken.revoke(scope,input),{message:'source ACK interruption'});assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
  const blocker=await f.admin.connect(),pending=await state(),db=await snapshot();
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
   const lookup=recreate().lookup(scope,input);lookup.catch(()=>{});let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true);assert.deepEqual(await lookup,{status:'unknown',replayAllowed:false});assert.deepEqual(await state(),pending);assert.deepEqual(await snapshot(),db);
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const original=(await f.admin.query("SELECT at FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND kind='revoked'",[scope.tenantId,scope.spaceId,input.source.id])).rows[0].at as Date;
  const c=await f.admin.connect();const substitute=async(at:Date)=>{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_restrictions DISABLE TRIGGER USER');await c.query("UPDATE fabric.storage_restrictions SET at=$4 WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND kind='revoked'",[scope.tenantId,scope.spaceId,input.source.id,at]);await c.query('ALTER TABLE fabric.storage_restrictions ENABLE TRIGGER USER');await c.query('COMMIT');};
  try{await substitute(new Date(original.getTime()+1));await deny(()=>recreate().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}finally{await c.query('ROLLBACK');await substitute(original);c.release();}
  assert.equal((await recreate().lookup(scope,input)).status,'committed');await deny(()=>entity(2),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/source-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transportError=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transportError);pool.on('connect',client=>client.on('error',transportError));
   try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),lost=new SourceRevocationRepository(uow,journal,f.native),index=mode==='commit'?3:4,input=fresh(index),db=await snapshot(),before=(await state())!.anchor;
    await deny(()=>lost.revoke(scope,input),['UNKNOWN_COMMIT']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>entity(),['AUTHORITY_UNAVAILABLE']);
    const result=await recreate().lookup(scope,input);assert.equal(result.status,mode==='commit'?'committed':'absent-safe');
    if(mode==='commit'){assert.equal(proxy.dropped(),1);assert.equal((await state())!.anchor.epoch,before.epoch+1);await deny(()=>entity(index),['RETENTION_RESTRICTED']);assert.deepEqual(await recreate().lookup(scope,input),result);}
    else{assert.equal(proxy.requestsDropped(),1);assert.equal(proxy.dropped(),0);assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);assert.ok(await entity(index));}reads++;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('AUTHORITY/source-concurrency',async()=>{
  const input=fresh(5),other={...input,key:randomUUID()},before=(await state())!.anchor;let hit!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
  const held=new SourceRevocationRepository(f.uow,journal,f.native,{afterPublication:async()=>{hit();await gate;}}),publishing=held.revoke(scope,input);publishing.catch(()=>{});await Promise.race([reached,publishing.then(()=>{throw new Error('Source publication passed gate');})]);
  const lookup=recreate().lookup(scope,input);lookup.catch(()=>{});const competing=deny(()=>recreate().revoke(scope,other),['RETENTION_RESTRICTED']);competing.catch(()=>{});
  const c=await f.admin.connect();try{let waits=0;const deadline=Date.now()+1500;while(Date.now()<deadline){await c.query('SELECT pg_stat_clear_snapshot()');waits=(await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0",[f.roles.controller])).rows[0].n;if(waits===2)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waits,2);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}finally{c.release();release();}
  assert.deepEqual(await lookup,await publishing);await competing;assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_source_revocations WHERE source_id=$1',[input.source.id])).rows[0].n,1);assert.deepEqual(await recreate().lookup(scope,other),{status:'absent-safe'});await deny(()=>entity(5),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/source-expiry',async()=>{
  const input=fresh(6);input.expiresAt=new Date(Date.now()+350).toISOString();const db=await snapshot(),before=(await state())!.anchor;
  const expired=new SourceRevocationRepository(f.uow,journal,f.native,{afterPublication:async tx=>{await tx.query('SELECT pg_sleep(0.4)');}});
  await deny(()=>expired.revoke(scope,input),['EXPIRED_COMMAND']);assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);assert.ok(await entity(6));reads++;
  const blocker=await f.admin.connect(),wait=fresh(6);wait.expiresAt=new Date(Date.now()+350).toISOString();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);pending=deny(()=>repo.revoke(scope,wait),['EXPIRED_COMMAND']);pending.catch(()=>{});
   let blocked=false;const deadline=Date.now()+1000;while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.4)');await blocker.query('COMMIT');await pending;
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);assert.equal((await state())!.pending,null);
 });
 await t.test('AUTHORITY/source-roles',async()=>{
  const input=fresh(7),before=(await state())!.anchor,db=await snapshot(),witness=await state();
  const sql='SELECT fabric.storage_revoke_source($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',args=[input.key,'sha256:'+'0'.repeat(64),input.sessionId,before.epoch,before.anchorId,randomUUID(),before.controlDigest,'sha256:'+'1'.repeat(64),input.source.id,input.source.revision,input.source.witness,new Date().toISOString(),input.expiresAt];
  for(const role of [f.worker,f.idpPool,f.client]){await deny(()=>role.query('SELECT * FROM fabric.storage_source_revocations'),['42501']);await deny(()=>role.query(sql,args),['42501']);}
  await deny(()=>f.controller.query(sql,args),['42501']);await deny(()=>f.admin.query(sql,args),['42501']);
  const forged=[...args];forged[10]='sha256:'+'0'.repeat(64);await deny(()=>f.uow.withScope(scope,tx=>tx.query(sql,forged)),['23514']);
  await deny(()=>f.uow.withScope(scope,tx=>tx.query("INSERT INTO fabric.storage_restrictions VALUES($1,$2,'source',$3,1,$4,'revoked',clock_timestamp())",[scope.tenantId,scope.spaceId,input.source.id,before.epoch])),['42501']);
  for(const table of ['storage_restrictions','storage_source_revocations'])for(const op of ['UPDATE fabric.'+table+' SET at=at','DELETE FROM fabric.'+table])await deny(()=>f.admin.query(op),['P0001']);
  const table=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'SELECT') AS read,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_source_revocations'::regclass")).rows[0];assert.deepEqual(Object.values(table),[true,true,true,false]);
  const fn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_revoke_source'")).rows[0];assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);
  assert.equal((await f.controller.query('SELECT * FROM fabric.storage_source_revocations')).rows.length,0);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/source-grant-wait',async()=>{
  const input=fresh(7),db=await snapshot(),witness=await state(),params=[scope.tenantId,scope.spaceId,scope.actorId],blocker=await f.admin.connect();
  const original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='storage:forget'))]);pending=deny(()=>repo.revoke(scope,input),['STALE_AUTHORITY','UNAUTHORIZED']);pending.catch(()=>{});
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;let blocked=false;const deadline=Date.now()+1500;while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('COMMIT');await pending;
   const freshScope=await f.scopeFor(f.actors[0],scope.spaceId);assert.ok(!freshScope.grants.includes('storage:forget'));await deny(()=>repo.revoke(freshScope,input),['UNAUTHORIZED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);scope=await f.scopeFor(f.actors[0],scope.spaceId);}
  await deny(()=>repo.revoke(scope,fresh(7)),['42501']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);task=await f.task('maintenance',scope);assert.equal((await repo.revoke(scope,fresh(7))).status,'committed');await deny(()=>entity(7),['RETENTION_RESTRICTED']);assert.ok(await entity());reads++;
 });
 await t.test('AUTHORITY/source-journal-branches',async()=>{
  const previous=(await state())!.anchor,input=fresh(8),base={schemaVersion:3,kind:'source-revocation',actorId:scope.actorId,key:input.key,binding:'sha256:'+'0'.repeat(64),sessionId:input.sessionId,expiresAt:input.expiresAt,previous,next:{...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:'sha256:'+'1'.repeat(64)},source:input.source,at:new Date().toISOString()},witness=await state();
  for(const next of [{...base.next,policyRevision:previous.policyRevision+1},{...base.next,controlDigest:previous.controlDigest}])await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,{...base,next} as PendingEpoch),['INVALID_SCHEMA']);
  await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,{...base,kind:'source-restore'} as unknown as PendingEpoch),['INVALID_SCHEMA']);assert.deepEqual(await state(),witness);assert.ok(await entity());reads++;
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);return {reads};
}
