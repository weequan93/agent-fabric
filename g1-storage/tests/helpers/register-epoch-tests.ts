import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,readdir,writeFile,rename,symlink,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { EpochPublicationRepository } from '../../src/epoch-publication.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
export async function registerEpochTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!;
 const journal=new EpochWitnessJournal(root),scope=f.scope,task=await f.task('maintenance');
 const repo=new EpochPublicationRepository(f.uow,journal,f.native),fresh=()=>({key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()});
 let reads=0;
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const observe=()=>f.admin.query('SELECT * FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2 ORDER BY epoch',[scope.tenantId,scope.spaceId]);
 const original=()=>f.admin.query('SELECT * FROM fabric.storage_epoch_publications ORDER BY epoch');
 await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
 await t.test('AUTHORITY/epoch-publication',async()=>{
  const before=(await observe()).rows,input=fresh(),result=await repo.refresh(scope,input);assert.equal(result.status,'committed');
  assert.equal((await observe()).rows.length,before.length+1);assert.equal((await original()).rows.length,1);
  assert.equal(await journal.current(scope.tenantId,scope.spaceId)!==undefined,true);assert.equal((await state())!.pending,null);
  const recreated=new EpochPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native);
  assert.deepEqual(await recreated.lookup(scope,input),result);reads++;
  const epochSnapshot=(await observe()).rows,commandSnapshot=(await original()).rows;
  await deny(()=>recreated.refresh(scope,input),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>recreated.lookup(scope,{...input,sessionId:randomUUID()}),['IDEMPOTENCY_CONFLICT']);
  await deny(()=>recreated.refresh(scope,{...fresh(),epoch:999}),['INVALID_SCHEMA']);
  await deny(()=>recreated.refresh({...scope} as typeof scope,fresh()),['UNAUTHORIZED']);
  const reader=await awaitScopeReader();await deny(()=>recreated.refresh(reader,fresh()),['UNAUTHORIZED']);
  assert.deepEqual((await observe()).rows,epochSnapshot);assert.deepEqual((await original()).rows,commandSnapshot);
  async function awaitScopeReader(){return await f.scopeFor(f.actors[2]);}
 });
 await t.test('AUTHORITY/epoch-rollback',async()=>{
  for(const phase of ['reserve','publication'] as const){
   const before=(await observe()).rows,commands=(await original()).rows,old=await journal.current(scope.tenantId,scope.spaceId),input=fresh();
   const broken=new EpochPublicationRepository(f.uow,journal,f.native,phase==='reserve'?{afterReserve:async()=>{throw new Error('reserve interruption');}}:{afterPublication:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_epoch_publications WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await assert.rejects(broken.refresh(scope,input));assert.deepEqual((await observe()).rows,before);assert.deepEqual((await original()).rows,commands);
   assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   await deny(()=>f.uow.withScope(scope,tx=>repo.authority.check(tx,scope,'read')),['AUTHORITY_UNAVAILABLE']);
   await deny(()=>repo.refresh(scope,fresh()),['AUTHORITY_UNAVAILABLE']);
   assert.deepEqual(await new EpochPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native).lookup(scope,input),{status:'absent-safe'});
   assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),old);reads++;
  }
 });
 await t.test('AUTHORITY/epoch-ack-gap',async()=>{
  const before=(await observe()).rows,input=fresh();
  const broken=new EpochPublicationRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('ACK interruption');}});
  await assert.rejects(broken.refresh(scope,input),{message:'ACK interruption'});assert.equal((await observe()).rows.length,before.length+1);
  assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  await deny(()=>f.uow.withScope(scope,tx=>repo.authority.check(tx,scope,'read')),['AUTHORITY_UNAVAILABLE']);
  await deny(()=>repo.lookup(scope,{...input,expiresAt:new Date(Date.now()+40_000).toISOString()}),['IDEMPOTENCY_CONFLICT']);
  const recovered=await new EpochPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native).lookup(scope,input);assert.equal(recovered.status,'committed');reads++;
  assert.equal((await original()).rows.filter(r=>r.command_key===input.key).length,1);assert.equal((await state())!.pending,null);
 });
 await t.test('AUTHORITY/epoch-wire-unknown',async()=>{
  const proxy=await startCommitWireProxy(f.fixtureDsn('controller')),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
  let transportErrors=0;const transportError=(e:Error)=>{assert.equal(e.message,'Connection terminated unexpectedly');transportErrors++;};
  pool.on('error',transportError);pool.on('connect',client=>client.on('error',transportError));
  try{
   const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)});
   const lost=new EpochPublicationRepository(uow,journal,f.native),input=fresh(),before=(await observe()).rows;
   await deny(()=>lost.refresh(scope,input),['UNKNOWN_COMMIT']);assert.equal(proxy.dropped(),1);
   assert.equal((await observe()).rows.length,before.length+1);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   const recovered=await new EpochPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native).lookup(scope,input);assert.equal(recovered.status,'committed');reads++;
   assert.equal((await original()).rows.filter(r=>r.command_key===input.key).length,1);assert.deepEqual(await repo.lookup(scope,input),recovered);assert.ok(transportErrors<=2);
  }finally{await pool.end();await proxy.close();}
 });
 await t.test('AUTHORITY/epoch-wire-rollback',async()=>{
  const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),'rollback'),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
  const transportError=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transportError);pool.on('connect',client=>client.on('error',transportError));
  try{
   const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),lost=new EpochPublicationRepository(uow,journal,f.native),input=fresh(),before=(await observe()).rows,commands=(await original()).rows;
   await deny(()=>lost.refresh(scope,input),['UNKNOWN_COMMIT']);assert.equal(proxy.requestsDropped(),1);assert.equal(proxy.dropped(),0);
   assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   assert.deepEqual(await repo.lookup(scope,input),{status:'absent-safe'});reads++;
   assert.deepEqual((await observe()).rows,before);assert.deepEqual((await original()).rows,commands);
  }finally{await pool.end();await proxy.close();}
 });
 await t.test('AUTHORITY/epoch-journal-cas',async()=>{
  const secondary=await f.scopeFor(f.actors[0],f.spaces.secondary),native=await f.task('maintenance',secondary),previous=a.anchors.get(a.key(secondary))!;
  await journal.install(secondary.tenantId,secondary.spaceId,previous);
  const inputs=[0,1].map(()=>({key:randomUUID(),sessionId:native.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()}));
  const candidates=inputs.map(input=>({actorId:secondary.actorId,...input,binding:'sha256:'+createHash('sha256').update(JSON.stringify(input)).digest('hex'),previous,next:{...previous,epoch:previous.epoch+1,anchorId:randomUUID()}}));
  let ready=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const results=await Promise.allSettled(candidates.map(p=>new EpochWitnessJournal(root,{afterReservationRead:async()=>{if(++ready===2)release();await gate;}}).reserve(secondary.tenantId,secondary.spaceId,p)));
  assert.equal(ready,2,'Both recreated owners observed the same real prior file');
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(rejected.reason.code,'STALE_REVISION');
  const winner=results.findIndex(r=>r.status==='fulfilled');assert.equal(await journal.current(secondary.tenantId,secondary.spaceId),undefined);
  assert.deepEqual(await repo.lookup(secondary,inputs[winner]),{status:'absent-safe'});assert.deepEqual(await journal.current(secondary.tenantId,secondary.spaceId),previous);reads++;
 });
 await t.test('AUTHORITY/epoch-concurrency',async()=>{
  let release!:()=>void,hit!:()=>void;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r),input=fresh(),before=(await observe()).rows;
  const held=new EpochPublicationRepository(f.uow,journal,f.native,{afterPublication:async()=>{hit();await gate;}});
  const publishing=held.refresh(scope,input);publishing.catch(()=>{});await Promise.race([reached,publishing.then(()=>{throw new Error('Publication passed the held gate');})]);
  const lookup=repo.lookup(scope,input);lookup.catch(()=>{});
  const duplicate=deny(()=>repo.refresh(scope,input),['IDEMPOTENCY_CONFLICT']);duplicate.catch(()=>{});
  const observer=await f.admin.connect();try{
   let waiters=0;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await observer.query('SELECT pg_stat_clear_snapshot()');waiters=(await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND wait_event='advisory' AND cardinality(pg_blocking_pids(pid))>0",[f.roles.controller])).rows[0].n;if(waiters===2)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(waiters,2,'Actual lookup and competing publisher waiters');assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  }finally{observer.release();release();}
  assert.deepEqual(await lookup,await publishing);await duplicate;assert.equal((await observe()).rows.length,before.length+1);reads++;
  // A Space/original-key timeout must leave pending independent authority intact.
  const gap=fresh(),broken=new EpochPublicationRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('ACK interruption');}});
  await assert.rejects(broken.refresh(scope,gap));const blocker=await f.admin.connect();
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
   assert.deepEqual(await repo.lookup(scope,gap),{status:'unknown',replayAllowed:false});assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  assert.equal((await repo.lookup(scope,gap)).status,'committed');reads++;
 });
 await t.test('AUTHORITY/epoch-journal-integrity',async()=>{
  const path=resolve(root.path,scope.tenantId,scope.spaceId),names=(await readdir(path)).filter(n=>n.endsWith('.json')).sort(),last=resolve(path,names.at(-1)!),bytes=await readFile(last);
  // Exercise corruption in earlier and later I/O batches, including the
  // hash-chain boundary. Restoration must produce the exact useful anchor.
  assert(names.length>4);const current=await journal.current(scope.tenantId,scope.spaceId);
  for(const index of [0,3,4]){
   const file=resolve(path,names[index]!),original=await readFile(file),entry=JSON.parse(original.toString());
   for(const malformed of [{}, {...entry,sequence:entry.sequence+1}, {...entry,previousDigest:'sha256:'+'0'.repeat(64)}]){
    try{await writeFile(file,JSON.stringify(malformed));await assert.rejects(journal.current(scope.tenantId,scope.spaceId),(error:unknown)=>['INVALID_SCHEMA','AUTHORITY_UNAVAILABLE'].includes(String((error as {code?:unknown}).code)));}
    finally{await writeFile(file,original);}
    assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),current);
   }
  }
  // A later raw-read failure must not outrank the earlier malformed event;
  // all sibling handles have settled before the failure reaches the caller.
  const first=resolve(path,names[0]!),firstBytes=await readFile(first),fourth=resolve(path,names[3]!),fourthBytes=await readFile(fourth);
  try{await writeFile(first,'{}');await unlink(fourth);await symlink(resolve(root.path,'.storage-owner.json'),fourth);await deny(()=>journal.current(scope.tenantId,scope.spaceId),['INVALID_SCHEMA']);}
  finally{await writeFile(first,firstBytes);await unlink(fourth);await writeFile(fourth,fourthBytes,{flag:'wx',mode:0o600});}
  assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),current);
  await writeFile(last,'{}');await deny(()=>repo.lookup(scope,fresh()),['INVALID_SCHEMA']);await writeFile(last,bytes);
  const hidden=resolve(path,'.stage-'+randomUUID());await rename(last,hidden);
  await deny(()=>f.uow.withScope(scope,tx=>repo.authority.check(tx,scope,'read')),['AUTHORITY_UNAVAILABLE']);await rename(hidden,last);
  await unlink(last);await symlink(resolve(root.path,'.storage-owner.json'),last);
  await assert.rejects(journal.current(scope.tenantId,scope.spaceId));await unlink(last);await writeFile(last,bytes,{flag:'wx',mode:0o600});
  const missing=new EpochWitnessJournal({...root,path:roots['restore']!.path,rootId:roots['restore']!.rootId,device:roots['restore']!.device,inode:roots['restore']!.inode});
  const missingAuthority=new StorageAuthorityRepository(missing,f.native);
  await deny(()=>f.uow.withScope(scope,tx=>missingAuthority.check(tx,scope,'read')),['AUTHORITY_UNAVAILABLE']);
  const forged=new EpochWitnessJournal({...root,inode:root.inode+1});await deny(()=>forged.current(scope.tenantId,scope.spaceId),['CLEANUP_UNPROVEN']);
  assert.ok(await journal.current(scope.tenantId,scope.spaceId));reads++;
 });
 await t.test('AUTHORITY/epoch-roles',async()=>{
  const epochSnapshot=(await observe()).rows,commandSnapshot=(await original()).rows;
  const privileges=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'SELECT') AS read,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_epoch_publications'::regclass")).rows[0];assert.deepEqual(Object.values(privileges),[true,true,true,false]);
  const fn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_publish_epoch'")).rows[0];assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);
  for(const role of [f.worker,f.idpPool,f.client]){
   await deny(()=>role.query('SELECT * FROM fabric.storage_epoch_publications'),['42501']);
   await deny(()=>role.query('SELECT fabric.storage_publish_epoch($1,$2,$3,1,$4,$5,$6,$7)',[randomUUID(),'sha256:'+'0'.repeat(64),task.binding.sessionId,randomUUID(),randomUUID(),'sha256:'+'0'.repeat(64),fresh().expiresAt]),['42501']);
  }
  await deny(()=>f.controller.query('SELECT fabric.storage_publish_epoch($1,$2,$3,1,$4,$5,$6,$7)',[randomUUID(),'sha256:'+'0'.repeat(64),task.binding.sessionId,randomUUID(),randomUUID(),'sha256:'+'0'.repeat(64),fresh().expiresAt]),['42501']);
  for(const op of ['UPDATE fabric.storage_epoch_publications SET epoch=epoch','DELETE FROM fabric.storage_epoch_publications'])await deny(()=>f.admin.query(op),['P0001']);
  assert.equal((await f.controller.query('SELECT * FROM fabric.storage_epoch_publications')).rows.length,0);
  assert.deepEqual((await observe()).rows,epochSnapshot);assert.deepEqual((await original()).rows,commandSnapshot);
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);
 return {reads};
}
