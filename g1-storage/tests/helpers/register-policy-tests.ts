import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { PolicyPublicationRepository } from '../../src/policy-publication.js';
import { StoragePolicySchema } from '../../src/authority.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
export async function registerPolicyTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!;
 const journal=new EpochWitnessJournal(root);let scope=await f.scopeFor(f.actors[0],f.spaces.secondary);let task=await f.task('maintenance',scope);
 const repo=new PolicyPublicationRepository(f.uow,journal,f.native),recreate=()=>new PolicyPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native);
 let reads=0;
 const policy=async()=>{const anchor=(await journal.state(scope.tenantId,scope.spaceId))!.anchor;return StoragePolicySchema.parse((await f.admin.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[scope.tenantId,scope.spaceId,anchor.policyRevision])).rows[0]);};
 const fresh=async()=>{const old=await policy();return {key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),policy:{...old,periods:{...old.periods,source:old.periods.source-1}}};};
 const snapshot=async()=>{const data=[];for(const table of ['storage_policy','storage_authority_epoch','storage_epoch_publications','storage_policy_changes'])data.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return data;};
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const read=()=>f.uow.withScope(scope,tx=>repo.authority.check(tx,scope,'read'));
 const head=(await f.admin.query("SELECT id,revision,witness FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class='source'",[scope.tenantId,scope.spaceId])).rows[0];assert.ok(head,'Previously persisted actual secondary source');
 const entity=()=>f.uow.withScope(scope,tx=>repo.authority.entity(tx,scope,{class:'source',id:head.id,revision:Number(head.revision),witness:head.witness}));
 await t.test('AUTHORITY/policy-publication',async()=>{
  const old=await policy(),input=await fresh();input.policy={...input.policy,operations:old.operations.filter(op=>op!=='write')};
  assert.ok(await entity());const before=(await state())!.anchor,result=await repo.reduce(scope,input);assert.equal(result.status,'committed');
  assert.equal((await state())!.pending,null);const next=(await state())!.anchor;assert.equal(next.epoch,before.epoch+1);assert.ok(next.policyRevision>before.policyRevision);assert.notEqual(next.controlDigest,before.controlDigest);
  assert.deepEqual(await recreate().lookup(scope,input),result);assert.ok(await entity());reads+=3;
  await deny(()=>f.uow.withScope(scope,tx=>repo.authority.check(tx,scope,'write')),['UNAUTHORIZED']);
  assert.equal((await policy()).periods.source,59);assert.equal((await f.admin.query('SELECT * FROM fabric.storage_policy_changes')).rows.length,1);
  const db=await snapshot(),witness=await state();await deny(()=>repo.reduce(scope,input),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>recreate().lookup(scope,{...input,policy:old}),['IDEMPOTENCY_CONFLICT']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/policy-negative',async()=>{
  const input=await fresh(),old=await policy(),db=await snapshot(),witness=await state();
  await deny(()=>repo.refresh(scope,{key:input.key,sessionId:input.sessionId,expiresAt:input.expiresAt}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  for(const bad of [{...input,epoch:999},{...input,policy:{...input.policy,periods:{...input.policy.periods,secret:1}}}])await deny(()=>repo.reduce(scope,bad),['INVALID_SCHEMA']);
  for(const next of [{...old,operations:[...old.operations,'write']},{...old,operations:old.operations.filter(op=>op!=='maintenance')},{...old,operations:[...old.operations,old.operations[0]!] }])await deny(()=>repo.reduce(scope,{...input,policy:next}),['UNAUTHORIZED']);
  await deny(()=>repo.reduce(scope,{...input,policy:{...old,periods:{...old.periods,source:86401}}}),['RETENTION_RESTRICTED']);
  await deny(()=>repo.reduce(scope,{...input,policy:old}),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>repo.reduce({...scope} as typeof scope,input),['UNAUTHORIZED']);
  const reader=await f.scopeFor(f.actors[2],scope.spaceId);await deny(()=>repo.reduce(reader,input),['UNAUTHORIZED']);
  const other=await f.scopeFor(f.actors[1],scope.spaceId),otherTask=await f.task('maintenance',other);assert.ok(other.grants.includes('storage:maintenance'));assert.ok(!other.grants.includes('storage:policy-admin'));await deny(()=>repo.reduce(other,{...input,sessionId:otherTask.binding.sessionId}),['UNAUTHORIZED']);
  const ask=await f.task('ask',scope);await deny(()=>repo.reduce(scope,{...input,sessionId:ask.binding.sessionId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  await deny(()=>repo.reduce(scope,{...input,expiresAt:new Date(Date.now()-10).toISOString()}),['EXPIRED_COMMAND']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);assert.ok(await read());reads++;
 });
 await t.test('AUTHORITY/policy-rollback',async()=>{
  for(const phase of ['reserve','publication'] as const){
   const input=await fresh(),db=await snapshot(),old=(await state())!.anchor;
   const broken=new PolicyPublicationRepository(f.uow,journal,f.native,phase==='reserve'?{afterReserve:async()=>{throw new Error('policy reservation interruption');}}:{afterPublication:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_policy_changes WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await assert.rejects(broken.reduce(scope,input));assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,old);reads++;
  }
 });
 await t.test('AUTHORITY/policy-ack-gap',async()=>{
  const input=await fresh(),before=(await state())!.anchor,broken=new PolicyPublicationRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('policy ACK interruption');}});
  await assert.rejects(broken.reduce(scope,input),{message:'policy ACK interruption'});assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);await deny(()=>recreate().lookup(scope,{...input,key:randomUUID()}),['IDEMPOTENCY_CONFLICT']);
  // Owned synthetic PG policy corruption cannot be ACKed as the desired state.
  const c=await f.admin.connect(),revision=(await state())!.pending!.next.policyRevision;
  try{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_policy DISABLE TRIGGER USER');await c.query("UPDATE fabric.storage_policy SET periods=jsonb_set(periods,'{source}','1') WHERE tenant_id=$1 AND space_id=$2 AND revision=$3",[scope.tenantId,scope.spaceId,revision]);await c.query('ALTER TABLE fabric.storage_policy ENABLE TRIGGER USER');await c.query('COMMIT');
   await deny(()=>recreate().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  }finally{try{await c.query('ROLLBACK');await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_policy DISABLE TRIGGER USER');await c.query('UPDATE fabric.storage_policy SET periods=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[scope.tenantId,scope.spaceId,revision,JSON.stringify(input.policy.periods)]);await c.query('ALTER TABLE fabric.storage_policy ENABLE TRIGGER USER');await c.query('COMMIT');}finally{c.release();}}
  assert.equal((await recreate().lookup(scope,input)).status,'committed');assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.ok(await read());reads++;
 });
 await t.test('AUTHORITY/policy-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){
   const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode==='commit'?'commit':'rollback'),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transportError=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transportError);pool.on('connect',client=>client.on('error',transportError));
   try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),lost=new PolicyPublicationRepository(uow,journal,f.native),input=await fresh(),db=await snapshot(),old=(await state())!.anchor;
    await deny(()=>lost.reduce(scope,input),['UNKNOWN_COMMIT']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
    await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);const result=await recreate().lookup(scope,input);assert.equal(result.status,mode==='commit'?'committed':'absent-safe');
    if(mode==='commit'){assert.equal(proxy.dropped(),1);assert.equal((await state())!.anchor.epoch,old.epoch+1);assert.deepEqual(await recreate().lookup(scope,input),result);}
    else{assert.equal(proxy.requestsDropped(),1);assert.equal(proxy.dropped(),0);assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,old);}reads++;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('AUTHORITY/policy-concurrency',async()=>{
  const input=await fresh(),before=(await state())!.anchor;let release!:()=>void,hit!:()=>void;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
  const held=new PolicyPublicationRepository(f.uow,journal,f.native,{afterPublication:async()=>{hit();await gate;}}),publishing=held.reduce(scope,input);publishing.catch(()=>{});
  await Promise.race([reached,publishing.then(()=>{throw new Error('Publication passed gate');})]);
  const lookup=recreate().lookup(scope,input);lookup.catch(()=>{});const duplicate=deny(()=>repo.reduce(scope,input),['IDEMPOTENCY_CONFLICT']);duplicate.catch(()=>{});
  const c=await f.admin.connect();try{let waiters=0;const deadline=Date.now()+1500;while(Date.now()<deadline){await c.query('SELECT pg_stat_clear_snapshot()');waiters=(await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0",[f.roles.controller])).rows[0].n;if(waiters===2)break;await new Promise(r=>setTimeout(r,10));}assert.equal(waiters,2);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}finally{c.release();release();}
  assert.deepEqual(await lookup,await publishing);await duplicate;assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_policy_changes WHERE command_key=$1',[input.key])).rows[0].n,1);reads++;
 });
 await t.test('AUTHORITY/policy-expiry',async()=>{
  const input=await fresh();input.expiresAt=new Date(Date.now()+350).toISOString();const db=await snapshot(),old=(await state())!.anchor;
  const expired=new PolicyPublicationRepository(f.uow,journal,f.native,{afterPublication:async tx=>{await tx.query('SELECT pg_sleep(0.4)');}});
  await deny(()=>expired.reduce(scope,input),['EXPIRED_COMMAND']);assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  assert.deepEqual(await recreate().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,old);reads++;
  const blocker=await f.admin.connect(),wait=await fresh();wait.expiresAt=new Date(Date.now()+350).toISOString();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);pending=repo.reduce(scope,wait);pending.catch(()=>{});const refusal=deny(()=>pending!,['EXPIRED_COMMAND']);refusal.catch(()=>{});
   let blocked=false;const deadline=Date.now()+1000;while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0) AS blocked",[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.4)');await blocker.query('COMMIT');await refusal;
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,old);assert.equal((await state())!.pending,null);
 });
 await t.test('AUTHORITY/policy-roles',async()=>{
  const db=await snapshot(),witness=await state(),input=await fresh(),old=(await state())!.anchor;
  const args=[input.key,'sha256:'+'0'.repeat(64),input.sessionId,old.epoch,old.anchorId,randomUUID(),old.controlDigest,'sha256:'+'1'.repeat(64),old.policyRevision,old.policyRevision+1,JSON.stringify(input.policy.periods),JSON.stringify(input.policy.operations),input.expiresAt];
  const sql='SELECT fabric.storage_reduce_policy($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)';
  for(const role of [f.worker,f.idpPool,f.client]){await deny(()=>role.query('SELECT * FROM fabric.storage_policy_changes'),['42501']);await deny(()=>role.query(sql,args),['42501']);}
  await deny(()=>f.controller.query(sql,args),['42501']);await deny(()=>f.admin.query(sql,args),['42501']);
  await deny(()=>f.uow.withScope(scope,tx=>tx.query('INSERT INTO fabric.storage_policy_changes VALUES($1,$2,$3,$4,1,2)',[scope.tenantId,scope.spaceId,scope.actorId,input.key])),['42501']);
  const expanded=[...args];expanded[10]=JSON.stringify({...input.policy.periods,source:86401});await deny(()=>f.uow.withScope(scope,tx=>tx.query(sql,expanded)),['42501']);
  for(const op of ['UPDATE fabric.storage_policy_changes SET policy_revision=policy_revision','DELETE FROM fabric.storage_policy_changes'])await deny(()=>f.admin.query(op),['P0001']);
  const table=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'SELECT') AS read,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_policy_changes'::regclass")).rows[0];assert.deepEqual(Object.values(table),[true,true,true,false]);
  const fn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_reduce_policy'")).rows[0];assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);
  assert.equal((await f.controller.query('SELECT * FROM fabric.storage_policy_changes')).rows.length,0);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 // Current policy refusal survives recreation; immutable historical policy is not serving authority.
 await t.test('AUTHORITY/policy-admin-grant-wait',async()=>{
  const input=await fresh(),db=await snapshot(),witness=await state(),params=[scope.tenantId,scope.spaceId,scope.actorId],blocker=await f.admin.connect();
  const original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];let pending:Promise<unknown>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='storage:policy-admin'))]);
   pending=deny(()=>repo.reduce(scope,input),['STALE_AUTHORITY','UNAUTHORIZED']);pending.catch(()=>{});
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true,'Actual dedicated policy administrator membership wait');await blocker.query('COMMIT');await pending;
   const freshScope=await f.scopeFor(f.actors[0],scope.spaceId);assert.ok(freshScope.grants.includes('storage:maintenance'));assert.ok(!freshScope.grants.includes('storage:policy-admin'));
   await deny(()=>repo.reduce(freshScope,input),['UNAUTHORIZED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);scope=await f.scopeFor(f.actors[0],scope.spaceId);}
  const stale=await fresh();await deny(()=>repo.reduce(scope,stale),['42501']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  task=await f.task('maintenance',scope);
 });
 await t.test('AUTHORITY/policy-current',async()=>{
  const input=await fresh();input.policy={...input.policy,operations:['maintenance']};await repo.reduce(scope,input);
  await deny(()=>recreate().uow.withScope(scope,tx=>recreate().authority.entity(tx,scope,{class:'source',id:head.id,revision:Number(head.revision),witness:head.witness})),['UNAUTHORIZED']);
  assert.ok((await f.admin.query('SELECT * FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=1',[scope.tenantId,scope.spaceId])).rows.length===1);
  assert.equal((await recreate().lookup(scope,input)).status,'committed');reads++;
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);return {reads};
}
