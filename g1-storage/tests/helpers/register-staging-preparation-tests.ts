import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,readdir,writeFile,unlink,rename,symlink,link } from 'node:fs/promises';
import { resolve } from 'node:path';
import { StagingWitnessJournal } from '../../src/staging-witness.js';
import { AuthenticatedStagingPreparation,type StagingMaterial } from '../../src/staging-preparation.js';
import { OwnedCipherFiles,type StagingControl } from '../../src/owned-cipher-files.js';
import type { OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { migrateStorageStagingAbandonment,migrateStorageStagingPreparation,migrateStorageSharePublication,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { FoundationError,safeFailure } from '../../src/errors.js';
import { AuthenticatedUnitOfWork,type SqlTransaction } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { killCipherProcess } from './kill-cipher-process.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import { enrollAuthority } from './authority-fixture.js';
import { registerStagedHeadTests } from './register-staged-head-tests.js';
import type { createStorageFixture } from './pg-fixture.js';

type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
export async function registerStagingPreparationTests(t:TestContext,f:Fixture,crypto:CryptoStore,
 root:()=>Promise<OwnedAnchorRoot>,value:Buffer,description:string,
 deny:(work:()=>Promise<unknown>,code:string)=>Promise<void>){
 const options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
 let reads=0,writes=0;
 await t.test('STAGING/authenticated-preparation-migration',async()=>{
  await migrateStorageSharePublication(f.admin,options);
  const before=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,owner=await installedOwnerSnapshot(f.admin);
  await assert.rejects(migrateStorageStagingPreparation(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected staging preparation migration rollback'});
  assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_staging_reservations') AS relation")).rows[0].relation,null);
  assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,before);
  await migrateStorageStagingPreparation(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);
  await migrateStorageStagingPreparation(f.admin,options);await migrateStorageSharePublication(f.admin,options);
  assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),owner);
  assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<11 ORDER BY version')).rows,before);
  assert.deepEqual((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN('fabric.storage_staging_reservations'::regclass,'fabric.storage_staging_confirmations'::regclass) ORDER BY relname")).rows,
   [{relrowsecurity:true,relforcerowsecurity:true},{relrowsecurity:true,relforcerowsecurity:true}]);writes++;
 });
 await t.test('STAGING/authenticated-abandonment-migration',async()=>{
  const before=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,owner=await installedOwnerSnapshot(f.admin);
  await assert.rejects(migrateStorageStagingAbandonment(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected staging abandonment migration rollback'});
  assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_staging_abandonments') AS relation")).rows[0].relation,null);
  assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,before);
  await migrateStorageStagingAbandonment(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);
  await migrateStorageStagingAbandonment(f.admin,options);await migrateStorageStagingPreparation(f.admin,options);
  assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),owner);
  assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<12 ORDER BY version')).rows,before);writes++;
 });
 const a=await enrollAuthority(f);
 const witnessRoot=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!;
 const witness=new StagingWitnessJournal(witnessRoot);
 async function setup(purpose:'maintenance'|'ask'='maintenance',expiresInMs=120_000){
  const r=await root(),scope=await f.scopeFor(),task=await f.task(purpose,scope),materialId=randomUUID();
  let material:StagingMaterial|undefined={binding:{schemaVersion:1,tenantId:f.tenant,spaceId:scope.spaceId,class:'artifact',id:randomUUID(),revision:1,generation:randomUUID(),keyId:randomUUID()},
   rootId:r.rootId,commandKey:randomUUID(),sessionId:task.binding.sessionId,sourceTaskId:task.binding.taskId,expiresAt:new Date(Date.now()+expiresInMs).toISOString()};
  const saved=material;let pid=0;const resolver={async resolve(tx:SqlTransaction){pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return material;}};
  const control=new AuthenticatedStagingPreparation(f.uow,a.authority,scope,resolver,materialId,witness);
  const adapter=new OwnedCipherFiles(r,crypto,control);
  return {r,scope,task,materialId,saved,resolver,control,adapter,pid:()=>pid,set(v:StagingMaterial|undefined){material=v;}};
 }
 await t.test('STAGING/authenticated-preparation-exact-and-original',async()=>{
  const s=await setup();assert.deepEqual(await s.control.original(),{uploadId:null,replayAllowed:false});reads++;
  const id=await s.adapter.stage(s.saved.binding,value,description);writes++;
  const recreated=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness);
  assert.deepEqual(await recreated.original(),{uploadId:id,replayAllowed:false});reads++;
  await recreated.lock(id,async lease=>{
   const row=await lease.current();assert.equal(row.pending,true);assert.equal(row.reachable,false);assert.ok(row.confirmation);
   assert.equal(row.rootId,s.r.rootId);assert.deepEqual(row.binding,s.saved.binding);assert.ok(row.leaseUntil>row.observedAt);
   assert.ok(row.leaseUntil<=Date.parse(s.saved.expiresAt));
  });
  const object=JSON.parse(await readFile(resolve(s.r.path,'u-'+id,'object'),'utf8')),
   manifest=JSON.parse(await readFile(resolve(s.r.path,'u-'+id,'manifest'),'utf8'));
  const bytes=await crypto.open(s.saved.binding,object),m=await crypto.open(s.saved.binding,manifest);
  try{assert.ok(bytes.equals(value));assert.equal(JSON.parse(m.toString()).description,description);reads++;}finally{bytes.fill(0);m.fill(0);}
  const actual=(await f.admin.query('SELECT * FROM fabric.storage_staging_reservations WHERE upload_id=$1',[id])).rows[0];
  assert.equal(actual.actor_id,s.scope.actorId);assert.equal(actual.session_id,s.saved.sessionId);assert.equal(actual.source_task_id,s.saved.sourceTaskId);
  const copies=Buffer.from(JSON.stringify((await f.admin.query('SELECT * FROM fabric.storage_staging_reservations r JOIN fabric.storage_staging_confirmations c USING(tenant_id,space_id,upload_id) WHERE upload_id=$1',[id])).rows));
  assert.ok(!copies.includes(Buffer.from(description))&&!copies.includes(value));
  await deny(()=>s.adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  assert.deepEqual((await readdir(s.r.path)).sort(),['.storage-owner.json','u-'+id].sort());
  await deny(()=>s.adapter.publish(id,s.saved.binding),'REQUIRED_CAPABILITY_UNSUPPORTED');
  await deny(()=>s.adapter.inspect(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  await assert.rejects(f.admin.query('UPDATE fabric.storage_staging_reservations SET root_id=$2 WHERE upload_id=$1',[id,randomUUID()]),{code:'P0001',message:'immutable authoritative history'});
 });
 await t.test('STAGING/authenticated-preparation-boundaries',async()=>{
  const s=await setup();
  await deny(()=>s.adapter.stage({...s.saved.binding,spaceId:f.spaces.personal},value,description),'SCOPE_MISMATCH');
  await deny(()=>s.control.reserve(randomUUID(),randomUUID(),s.saved.binding),'SCOPE_MISMATCH');
  await deny(()=>s.control.lock(randomUUID(),async()=>{}),'AUTHORITY_UNAVAILABLE');
  s.set({...s.saved,sourceTaskId:randomUUID()});await deny(()=>s.adapter.stage(s.saved.binding,value,description),'SCOPE_MISMATCH');
  s.set({...s.saved,expiresAt:new Date(Date.now()-1000).toISOString()});await deny(()=>s.adapter.stage(s.saved.binding,value,description),'EXPIRED_COMMAND');
  s.set(undefined);await deny(()=>s.adapter.stage(s.saved.binding,value,description),'CONTENT_UNAVAILABLE');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,0);
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
  for(const p of [f.worker,f.client,f.idpPool]){
   await assert.rejects(p.query('SELECT * FROM fabric.storage_staging_reservations'),{code:'42501'});
   await assert.rejects(p.query('SELECT * FROM fabric.storage_staging_confirmations'),{code:'42501'});
  }
  assert.equal((await f.controller.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations')).rows[0].n,0);
 });
 await t.test('STAGING/authenticated-preparation-current-generation-and-authority',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);writes++;
  for(const m of [{...s.saved,rootId:randomUUID()},{...s.saved,binding:{...s.saved.binding,generation:randomUUID()}},{...s.saved,commandKey:randomUUID()}]){
   s.set(m);await deny(()=>s.control.lock(id,async()=>{}),'SCOPE_MISMATCH');
  }
  s.set(s.saved);const key=a.key(s.scope),anchor=a.anchors.get(key)!;
  a.anchors.delete(key);await deny(()=>s.control.original(),'AUTHORITY_UNAVAILABLE');a.anchors.set(key,anchor);
  const actorParams=[f.tenant,s.scope.spaceId,s.scope.actorId],actorRow=(await f.admin.query('SELECT grants,revision FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',actorParams)).rows[0],actorGrants=actorRow.grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...actorParams,JSON.stringify(actorGrants.filter(g=>g!=='storage:write'))]);
   // Admit this candidate's native task at the same reduced-grant revision.
   // Reusing the older task would correctly fail native freshness before the
   // write boundary, and would not isolate these paired storage refusals.
   const candidate=await setup(),noWrite=candidate.control;
   a.anchors.delete(key);await deny(()=>noWrite.original(),'AUTHORITY_UNAVAILABLE');a.anchors.set(key,anchor);
   await deny(()=>noWrite.original(),'UNAUTHORIZED');
   candidate.set({...candidate.saved,sourceTaskId:randomUUID()});await deny(()=>noWrite.original(),'UNAUTHORIZED');
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...actorParams,JSON.stringify(actorGrants)]);
   const current=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),candidate.resolver,candidate.materialId,witness);
   await deny(()=>current.original(),'SCOPE_MISMATCH');
   candidate.set(candidate.saved);assert.deepEqual(await current.original(),{uploadId:null,replayAllowed:false});reads++;
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1 OR command_key=$2',[candidate.materialId,candidate.saved.commandKey])).rows[0].n,0);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE command_key=$1',[candidate.saved.commandKey])).rows[0].n,0);
   assert.deepEqual(await readdir(candidate.r.path),['.storage-owner.json']);
  }finally{
   s.set(s.saved);a.anchors.set(key,anchor);
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...actorParams,JSON.stringify(actorGrants),actorRow.revision]);
  }
  const params=[f.tenant,s.scope.spaceId,f.actors[1]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);
   await deny(()=>s.control.original(),'UNAUTHORIZED');
  }finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
  assert.deepEqual(await s.control.original(),{uploadId:id,replayAllowed:false});reads++;
 });
 await t.test('STAGING/authenticated-preparation-native-stop-and-purpose',async()=>{
  const ask=await setup('ask');await deny(()=>ask.adapter.stage(ask.saved.binding,value,description),'REQUIRED_CAPABILITY_UNSUPPORTED');
  const s=await setup();const snapshot=await f.native.snapshot(s.scope,s.task.binding.sessionId);
  await f.native.stop(s.scope,{sessionId:s.task.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),observedRevision:snapshot.revision});
  await deny(()=>s.adapter.stage(s.saved.binding,value,description),'STALE_FENCE');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,0);
 });
 await t.test('STAGING/authenticated-preparation-concurrent-original',async()=>{
  const s=await setup();let release!:()=>void,enter!:()=>void;
  const entered=new Promise<void>(r=>{enter=r;}),resume=new Promise<void>(r=>{release=r;});
  const adapter=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p){if(p==='object-fsynced'){enter();await resume;}}});
  const staging=adapter.stage(s.saved.binding,value,description);await entered;
  const conflicting=deny(()=>s.adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  let observed=false;
  try{
   for(let i=0;i<300;i++){
    if((await f.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'" )).rows[0].n>0){observed=true;break;}
    await new Promise(r=>setTimeout(r,10));
   }
  }finally{release();}
  const id=await staging;await conflicting;assert.ok(observed,'Authenticated contender really waited on PG owner lock');writes++;
  assert.deepEqual(await s.control.original(),{uploadId:id,replayAllowed:false});reads++;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,1);
 });
 await t.test('STAGING/authenticated-preparation-after-file-wait',async()=>{
  const s=await setup();let id='';
  const adapter=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p,v){id=v;if(p==='manifest-directory-fsynced')s.set({...s.saved,binding:{...s.saved.binding,generation:randomUUID()}});}});
  await deny(()=>adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  assert.ok(id);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_confirmations WHERE upload_id=$1',[id])).rows[0].n,0);
  s.set(s.saved);assert.deepEqual(await s.control.original(),{uploadId:id,replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
 });
 async function observed(pid:number){
  for(let i=0;i<250;i++){
   if((await f.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",[pid])).rows[0].n>0)return;
   await new Promise(r=>setTimeout(r,10));
  }
  assert.fail('Exact authenticated PG blocker was not observed');
 }
 await t.test('STAGING/authenticated-abandonment-recreated-gc',async()=>{
  for(const partial of [false,true]){
   const s=await setup();let id='';
   if(partial){
    const broken=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p,v){id=v;if(p==='object-fsynced')throw new Error('private synthetic interruption');}});
    await deny(()=>broken.stage(s.saved.binding,value,description),'CONTENT_UNAVAILABLE');
   }else id=await s.adapter.stage(s.saved.binding,value,description);
   assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
   assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
   await s.control.abandon(id);writes++;
   const fresh=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness);
   assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
   await fresh.abandon(id);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,1);
   await deny(()=>s.adapter.publish(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
   await deny(()=>s.adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
   assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,fresh).collect(),{removed:1,protected:0});writes++;
   assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
   assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
   assert.deepEqual(await fresh.original(),{uploadId:id,replayAllowed:false});
  }
 });
 await t.test('STAGING/authenticated-abandonment-boundaries-history',async()=>{
  const s=await setup();assert.deepEqual(await s.control.outcome(),{uploadId:null,status:'absent',replayAllowed:false});reads++;
  await deny(()=>s.control.abandon(randomUUID()),'AUTHORITY_UNAVAILABLE');
  const id=await s.adapter.stage(s.saved.binding,value,description),other=await setup(),otherId=await other.adapter.stage(other.saved.binding,value,description);
  await deny(()=>s.control.abandon(otherId),'SCOPE_MISMATCH');
  s.set({...s.saved,binding:{...s.saved.binding,generation:randomUUID()}});await deny(()=>s.control.abandon(id),'SCOPE_MISMATCH');s.set(s.saved);
  await s.control.abandon(id);writes++;
  for(const p of [f.worker,f.client,f.idpPool]){
   await assert.rejects(p.query('SELECT * FROM fabric.storage_staging_abandonments'),{code:'42501'});
   await assert.rejects(p.query('INSERT INTO fabric.storage_staging_abandonments(tenant_id,space_id,actor_id,command_key,upload_id) VALUES($1,$2,$3,$4,$5)',[f.tenant,s.scope.spaceId,s.scope.actorId,s.saved.commandKey,id]),{code:'42501'});
  }
  assert.equal((await f.controller.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments')).rows[0].n,0);
  for(const sql of ['UPDATE fabric.storage_staging_abandonments SET upload_id=upload_id WHERE upload_id=$1','DELETE FROM fabric.storage_staging_abandonments WHERE upload_id=$1'])
   await assert.rejects(f.admin.query(sql,[id]),{code:'P0001',message:'immutable authoritative history'});
  await assert.rejects(f.admin.query('INSERT INTO fabric.storage_staging_abandonments(tenant_id,space_id,actor_id,command_key,upload_id) VALUES($1,$2,$3,$4,$5)',[f.tenant,other.scope.spaceId,other.scope.actorId,randomUUID(),otherId]),{code:'23503'});
  const catalog=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_staging_abandonments'::regclass")).rows[0];
  assert.deepEqual(catalog,{relrowsecurity:true,relforcerowsecurity:true,insert:true});
 });
 await t.test('STAGING/authenticated-abandonment-rollback-wire-outcomes',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);
  const broken=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async afterAbandonment(tx){
   assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');
  }});
  await deny(()=>broken.abandon(id),'CONTENT_UNAVAILABLE');
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  for(const mode of ['commit','rollback'] as const){
   const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{
    const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)});
    const control=new AuthenticatedStagingPreparation(uow,a.authority,s.scope,s.resolver,s.materialId,witness);let failure:unknown;
    try{await control.abandon(id);assert.fail('Genuine COMMIT loss must refuse');}catch(e){failure=e;}
    assert.ok(failure instanceof FoundationError&&failure.code==='UNKNOWN_COMMIT');
    assert.deepEqual(safeFailure(failure),{schemaVersion:1,status:'unknown',error:'UNKNOWN_COMMIT',replayAllowed:false,nextAction:'original-key-lookup'});
    assert.deepEqual(await s.control.outcome(),{uploadId:id,status:mode==='commit'?'abandoned':'pending',replayAllowed:false});reads++;
    assert.deepEqual(await s.adapter.collect(),mode==='commit'?{removed:1,protected:0}:{removed:0,protected:1});
    assert.equal(proxy.dropped(),mode==='commit'?1:0);assert.equal(proxy.requestsDropped(),mode==='rollback'?1:0);
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('STAGING/authenticated-abandonment-stage-first-observed-wait',async()=>{
  const s=await setup();let release!:()=>void,enter!:()=>void,id='';
  const entered=new Promise<void>(r=>enter=r),resume=new Promise<void>(r=>release=r);
  const adapter=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p,v){id=v;if(p==='object-fsynced'){enter();await resume;}}});
  const staging=adapter.stage(s.saved.binding,value,description);staging.catch(()=>{});await Promise.race([entered,staging]);
  const blocker=s.pid(),abandonment=s.control.abandon(id);abandonment.catch(()=>{});
  try{await observed(blocker);}finally{release();}
  assert.equal(await staging,id);await abandonment;writes++;
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});
 });
 await t.test('STAGING/authenticated-abandonment-gc-first-observed-wait',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);await s.control.abandon(id);
  let release!:()=>void,enter!:()=>void;
  const entered=new Promise<void>(r=>enter=r),resume=new Promise<void>(r=>release=r);
  const adapter=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p){if(p==='quarantined'){enter();await resume;}}});
  const collecting=adapter.collect();collecting.catch(()=>{});await Promise.race([entered,collecting]);
  const blocker=s.pid(),abandonment=s.control.abandon(id);abandonment.catch(()=>{});
  try{await observed(blocker);}finally{release();}
  assert.deepEqual(await collecting,{removed:1,protected:0});await abandonment;
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,1);writes++;
 });
 await t.test('STAGING/authenticated-abandonment-quarantine-recovery-authority',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);await s.control.abandon(id);
  const interrupted=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p){if(p==='quarantined')throw new Error('private quarantine interruption');}});
  await deny(()=>interrupted.collect(),'CLEANUP_UNPROVEN');
  assert.deepEqual((await readdir(s.r.path)).sort(),['.storage-owner.json','q-'+id].sort());
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  const params=[f.tenant,s.scope.spaceId,f.actors[1]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);
   await deny(()=>s.adapter.collect(),'UNAUTHORIZED');
   assert.deepEqual((await readdir(s.r.path)).sort(),['.storage-owner.json','q-'+id].sort());
  }finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
  assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});writes++;
  const stopped=await setup(),stoppedId=await stopped.adapter.stage(stopped.saved.binding,value,description);await stopped.control.abandon(stoppedId);
  const snapshot=await f.native.snapshot(stopped.scope,stopped.task.binding.sessionId);
  await f.native.stop(stopped.scope,{sessionId:stopped.task.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),observedRevision:snapshot.revision});
  await deny(()=>stopped.adapter.collect(),'STALE_FENCE');
  assert.deepEqual((await readdir(stopped.r.path)).sort(),['.storage-owner.json','u-'+stoppedId].sort());
 });
 await t.test('STAGING/authenticated-abandonment-current-reachability',async()=>{
  for(const abandoned of [false,true]){
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),b=s.saved.binding;
  if(abandoned)await s.control.abandon(id);
  // Independently acknowledged fixture control enrollment is not payload save.
  await a.publish(s.scope,async(c,epoch)=>{
   await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,s.saved.sourceTaskId]);
   await c.query('INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval \'50 seconds\')',
    [f.tenant,s.scope.spaceId,b.class,b.id,b.revision,'sha256:'+'a'.repeat(64),b.keyId,b.generation,epoch]);
  });
  if(abandoned){
   // An independently settled terminal cannot acquire reachability later.
   // Refuse the contradictory controls before any inspection or cleanup.
   const bytes=await readFile(resolve(s.r.path,'u-'+id,'object'));
   await deny(()=>s.control.abandon(id),'AUTHORITY_UNAVAILABLE');
   await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');
   await deny(()=>s.adapter.collect(),'AUTHORITY_UNAVAILABLE');
   await deny(()=>s.adapter.inspect(id,s.saved.binding),'AUTHORITY_UNAVAILABLE');
   assert.deepEqual(await readFile(resolve(s.r.path,'u-'+id,'object')),bytes);reads++;
  }else {
   await deny(()=>s.control.abandon(id),'ARTIFACT_NOT_COMMITTED');
   assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
   assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  }
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,abandoned?1:0);
  }
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),b=s.saved.binding;
  const receiptId=randomUUID(),jobId=randomUUID(),otherKey=randomUUID(),otherGeneration=randomUUID(),otherKeyId=randomUUID();
  const snapshotSql=`SELECT json_build_array(
   (SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT * FROM fabric.storage_entities ORDER BY tenant_id,space_id,class,id,revision) q),
   (SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT * FROM fabric.storage_current_heads ORDER BY tenant_id,space_id,class,id,revision) q),
   (SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT * FROM fabric.storage_commands ORDER BY tenant_id,space_id,actor_id,command_key) q),
   (SELECT coalesce(json_agg(q),'[]'::json) FROM (SELECT * FROM fabric.storage_outbox ORDER BY tenant_id,space_id,job_id) q)) AS controls`;
  const before=(await f.admin.query(snapshotSql)).rows[0].controls,anchorDigest=a.anchors.get(a.key(s.scope))!.controlDigest;
  const retained=await Promise.all(['object','manifest'].map(name=>readFile(resolve(s.r.path,'u-'+id,name))));
  try{
   // Exact heads already execute above. Isolate the other two OR predicates:
   // an outbox FK normally implies a command, so only this owned fixture faults
   // that command after seeding it. Every live authority digest is re-enrolled.
   for(const [kind,changed,reachable] of [
    ['head','generation',false],['head','key-id',false],
    ['command','exact',true],['command','actor',false],['command','key',false],['command','scope',false],
    ['outbox','exact',true],['outbox','actor',false],['outbox','key',false],['outbox','scope',false]
   ] as const){
    const space=changed==='scope'?f.spaces.secondary:s.scope.spaceId,actor=changed==='actor'?f.actors[1]:s.scope.actorId,
     key=changed==='key'?otherKey:s.saved.commandKey;
    await a.publish(s.scope,async(c,epoch)=>{
     await c.query("SET LOCAL session_replication_role='replica'");
     await c.query('DELETE FROM fabric.storage_outbox WHERE job_id=$1',[jobId]);
     await c.query('DELETE FROM fabric.storage_commands WHERE receipt_id=$1',[receiptId]);
     await c.query('DELETE FROM fabric.storage_current_heads WHERE id=$1',[b.id]);
     await c.query('DELETE FROM fabric.storage_entities WHERE id=$1',[b.id]);
     if(kind!=='command')await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,$5,null)',[f.tenant,space,b.class,b.id,b.revision]);
     if(kind==='head')await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval '50 seconds')",
      [f.tenant,space,b.class,b.id,b.revision,'sha256:'+'b'.repeat(64),changed==='key-id'?otherKeyId:b.keyId,changed==='generation'?otherGeneration:b.generation,epoch]);
     else{
      await c.query('INSERT INTO fabric.storage_commands VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[f.tenant,space,actor,key,'sha256:'+'c'.repeat(64),receiptId,epoch]);
      if(kind==='outbox'){
       await c.query('INSERT INTO fabric.storage_outbox VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())',[f.tenant,space,jobId,actor,key,b.class,b.id,b.revision,epoch]);
       assert.equal((await c.query('DELETE FROM fabric.storage_commands WHERE receipt_id=$1',[receiptId])).rowCount,1);
      }
     }
     await c.query("SET LOCAL session_replication_role='origin'");
    });
    if(kind!=='head')assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_current_heads WHERE id=$1',[b.id])).rows[0].n,0);
    if(kind==='outbox')assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE receipt_id=$1 OR (tenant_id=$2 AND space_id=$3 AND actor_id=$4 AND command_key=$5)',
     [receiptId,f.tenant,s.scope.spaceId,s.scope.actorId,s.saved.commandKey])).rows[0].n,0,'Outbox reachability executes without a matching head or original command');
    await s.control.lock(id,async lease=>{const current=await lease.current();assert.equal(current.reachable,reachable,kind+'/'+changed);assert.equal(current.pending,true);assert.ok(current.confirmation);});reads++;
    assert.deepEqual(await Promise.all(['object','manifest'].map(name=>readFile(resolve(s.r.path,'u-'+id,name)))),retained);
   }
  }finally{
   await a.publish(s.scope,async c=>{
    await c.query("SET LOCAL session_replication_role='replica'");
    await c.query('DELETE FROM fabric.storage_outbox WHERE job_id=$1',[jobId]);
    await c.query('DELETE FROM fabric.storage_commands WHERE receipt_id=$1',[receiptId]);
    await c.query('DELETE FROM fabric.storage_current_heads WHERE id=$1',[b.id]);
    await c.query('DELETE FROM fabric.storage_entities WHERE id=$1',[b.id]);
    await c.query("SET LOCAL session_replication_role='origin'");
   });
  }
  assert.deepEqual((await f.admin.query(snapshotSql)).rows[0].controls,before);
  assert.equal(a.anchors.get(a.key(s.scope))!.controlDigest,anchorDigest);
  await s.control.lock(id,async lease=>{assert.equal((await lease.current()).reachable,false);});reads++;
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'pending',replayAllowed:false});
  assert.deepEqual(await Promise.all(['object','manifest'].map(name=>readFile(resolve(s.r.path,'u-'+id,name)))),retained);
 });
 await t.test('STAGING/authenticated-abandonment-real-cleanup-failure',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);await s.control.abandon(id);
  const extra=resolve(s.r.path,'q-'+id,'unowned');
  const broken=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p){if(p==='quarantined')await writeFile(extra,'synthetic unrelated entry',{flag:'wx',mode:0o600});}});
  await deny(()=>broken.collect(),'CLEANUP_UNPROVEN');
  assert.equal(await readFile(extra,'utf8'),'synthetic unrelated entry');
  assert.deepEqual(await readdir(resolve(s.r.path,'q-'+id)),['unowned']);
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  await deny(()=>s.adapter.collect(),'CLEANUP_UNPROVEN');
  await unlink(extra);assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});writes++;
 });
 await t.test('STAGING/authenticated-abandonment-expiry-after-write',async()=>{
  const s=await setup('maintenance',3000),id=await s.adapter.stage(s.saved.binding,value,description);
  const broken=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async afterAbandonment(tx){
   assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0]?.['n'],1);
   await tx.query('SELECT pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.05)',[s.saved.expiresAt]);
  }});
  await deny(()=>broken.abandon(id),'EXPIRED_COMMAND');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
  await deny(()=>s.control.outcome(),'EXPIRED_COMMAND');await deny(()=>s.adapter.collect(),'EXPIRED_COMMAND');
  assert.deepEqual((await readdir(s.r.path)).sort(),['.storage-owner.json','u-'+id].sort());
 });
 await t.test('STAGING/authenticated-recovery-expired-original',async()=>{
  const s=await setup('maintenance',2500),id=await s.adapter.stage(s.saved.binding,value,description);
  await f.admin.query('SELECT pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.05)',[s.saved.expiresAt]);
  await deny(()=>s.control.outcome(),'EXPIRED_COMMAND');await deny(()=>s.adapter.collect(),'EXPIRED_COMMAND');
  const fresh=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),s.resolver,s.materialId,witness),recovery=fresh.recovery(),files=new OwnedCipherFiles(s.r,crypto,recovery.control);
  assert.ok(Object.isFrozen(recovery)&&Object.isFrozen(recovery.control));
  assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
  assert.deepEqual(await files.collect(),{removed:0,protected:1});
  await deny(()=>files.stage(s.saved.binding,value,description),'REQUIRED_CAPABILITY_UNSUPPORTED');
  await deny(()=>files.publish(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>files.inspect(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await recovery.control.lock(id,async lease=>{
   const row=await lease.current();assert.ok(row.confirmation);
   await deny(()=>lease.confirm(row.confirmation!),'REQUIRED_CAPABILITY_UNSUPPORTED');
   await deny(()=>lease.publish(row.confirmation!),'REQUIRED_CAPABILITY_UNSUPPORTED');
  });
  await recovery.abandon(id);await recovery.abandon(id);writes++;
  assert.deepEqual(await files.collect(),{removed:1,protected:0});writes++;
  assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,1);
  await deny(()=>s.adapter.stage(s.saved.binding,value,description),'EXPIRED_COMMAND');
 });
 await t.test('STAGING/authenticated-recovery-stopped-native-no-resume',async()=>{
  for(const partial of [false,true]){
   const s=await setup();let id='';
   if(partial)await deny(()=>new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p,v){id=v;if(p==='object-fsynced')throw new Error('private interruption');}}).stage(s.saved.binding,value,description),'CONTENT_UNAVAILABLE');
   else id=await s.adapter.stage(s.saved.binding,value,description);
   const before=await f.native.snapshot(s.scope,s.saved.sessionId);
   await f.native.stop(s.scope,{sessionId:s.saved.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),observedRevision:before.revision});
   const stopped=await f.native.snapshot(s.scope,s.saved.sessionId);assert.equal(stopped.stopped,true);
   await deny(()=>s.control.outcome(),'STALE_FENCE');await deny(()=>s.adapter.collect(),'STALE_FENCE');
   const recovery=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),s.resolver,s.materialId,witness).recovery(),files=new OwnedCipherFiles(s.r,crypto,recovery.control);
   assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
   assert.deepEqual(await files.collect(),{removed:0,protected:1});
   await recovery.abandon(id);assert.deepEqual(await files.collect(),{removed:1,protected:0});writes+=2;
   assert.deepEqual(await f.native.snapshot(s.scope,s.saved.sessionId),stopped);
   await deny(()=>s.adapter.stage(s.saved.binding,value,description),'STALE_FENCE');
   assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  }
 });
 await t.test('STAGING/authenticated-recovery-current-authority-and-binding',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),recovery=s.control.recovery(),files=new OwnedCipherFiles(s.r,crypto,recovery.control);
  const empty=await setup();assert.deepEqual(await empty.control.recovery().outcome(),{uploadId:null,status:'absent',replayAllowed:false});reads++;
  await deny(()=>empty.control.recovery().abandon(id),'SCOPE_MISMATCH');
  await deny(()=>recovery.abandon(randomUUID()),'AUTHORITY_UNAVAILABLE');
  const other=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(f.actors[1]),s.resolver,s.materialId,witness).recovery();
  await deny(()=>other.outcome(),'UNAUTHORIZED');
  const foreign=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(f.foreignActor,f.spaces.foreign),s.resolver,s.materialId,witness).recovery();
  await deny(()=>foreign.abandon(id),'SCOPE_MISMATCH');
  for(const changed of [{...s.saved,rootId:randomUUID()},{...s.saved,binding:{...s.saved.binding,generation:randomUUID()}},{...s.saved,sessionId:randomUUID()},{...s.saved,sourceTaskId:randomUUID()}]){
   s.set(changed);await deny(()=>recovery.abandon(id),changed.sessionId!==s.saved.sessionId?'UNAUTHORIZED':'SCOPE_MISMATCH');
  }s.set(s.saved);
  const anchor=a.anchors.get(a.key(s.scope))!;a.anchors.delete(a.key(s.scope));
  await deny(()=>files.collect(),'AUTHORITY_UNAVAILABLE');a.anchors.set(a.key(s.scope),anchor);
  const params=[f.tenant,s.scope.spaceId,f.actors[1]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);
   await deny(()=>recovery.abandon(id),'UNAUTHORIZED');await deny(()=>files.collect(),'UNAUTHORIZED');
  }finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
  assert.deepEqual(await files.collect(),{removed:0,protected:1});
 });
 await t.test('STAGING/authenticated-recovery-maintenance-grant-independent-of-write',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),params=[f.tenant,s.scope.spaceId,s.scope.actorId],
   grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>!['storage:maintenance','storage:write','task:write'].includes(g)))]);
   const denied=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),s.resolver,s.materialId,witness).recovery();
   await deny(()=>denied.outcome(),'UNAUTHORIZED');await deny(()=>denied.abandon(id),'UNAUTHORIZED');
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>!['storage:write','task:write'].includes(g)))]);
   const current=await f.scopeFor(),recovery=new AuthenticatedStagingPreparation(f.uow,a.authority,current,s.resolver,s.materialId,witness).recovery();
   const snapshot=await f.native.snapshot(current,s.saved.sessionId);
   assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
   await recovery.abandon(id);assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,recovery.control).collect(),{removed:1,protected:0});writes+=2;
   assert.deepEqual(await f.native.snapshot(current,s.saved.sessionId),snapshot);
   await deny(()=>new AuthenticatedStagingPreparation(f.uow,a.authority,current,s.resolver,s.materialId,witness).reserve(randomUUID(),s.r.rootId,s.saved.binding),'UNAUTHORIZED');
  }finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
 });
 await t.test('STAGING/authenticated-recovery-after-original-lock-wait',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),block=await f.admin.connect();
  try{
   await block.query('BEGIN');const pid=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-staging-original',s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey])]);
   const waiting=deny(()=>s.control.recovery().abandon(id),'IDEMPOTENCY_CONFLICT');
   try{await observed(pid);s.set({...s.saved,binding:{...s.saved.binding,generation:randomUUID()}});}finally{await block.query('COMMIT');}
   await waiting;s.set(s.saved);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
   assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});reads++;
  }finally{await block.query('ROLLBACK');block.release();}
  const expiring=await setup('maintenance',1200),expiredId=await expiring.adapter.stage(expiring.saved.binding,value,description),expiryBlock=await f.admin.connect(),nativeBefore=await f.native.snapshot(expiring.scope,expiring.saved.sessionId);let expired:Promise<void>|undefined;
  try{
   await expiryBlock.query('BEGIN');const pid=Number((await expiryBlock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await expiryBlock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-staging-original',expiring.scope.tenantId,expiring.scope.spaceId,expiring.scope.actorId,expiring.saved.commandKey])]);
   expired=deny(()=>expiring.control.abandon(expiredId),'EXPIRED_COMMAND');expired.catch(()=>{});
   await observed(pid);
   await expiryBlock.query('SELECT pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.05)',[expiring.saved.expiresAt]);
   assert.equal((await expiryBlock.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[expiring.saved.expiresAt])).rows[0].expired,true);
   await expiryBlock.query('COMMIT');await expired;
  }finally{await expiryBlock.query('ROLLBACK');expiryBlock.release();await expired?.catch(()=>{});}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[expiredId])).rows[0].n,0);
  const recreated=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),expiring.resolver,expiring.materialId,new StagingWitnessJournal(witnessRoot)).recovery(),recoveredFiles=new OwnedCipherFiles(expiring.r,crypto,recreated.control);
  assert.deepEqual(await recreated.outcome(),{uploadId:expiredId,status:'pending',replayAllowed:false});reads++;
  await recreated.abandon(expiredId);assert.deepEqual(await recoveredFiles.collect(),{removed:1,protected:0});writes+=2;
  assert.deepEqual(await f.native.snapshot(expiring.scope,expiring.saved.sessionId),nativeBefore,'Expired original recovery never resumes or mutates its native run');
  assert.deepEqual(await recreated.outcome(),{uploadId:expiredId,status:'abandoned',replayAllowed:false});reads++;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE command_key=$1',[expiring.saved.commandKey])).rows[0].n,1);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE command_key=$1',[expiring.saved.commandKey])).rows[0].n,1);
  await deny(()=>expiring.adapter.stage(expiring.saved.binding,value,description),'EXPIRED_COMMAND');
  const revoked=await setup(),revokedId=await revoked.adapter.stage(revoked.saved.binding,value,description),revocationBlock=await f.admin.connect(),params=[f.tenant,revoked.scope.spaceId,revoked.scope.actorId],membership=(await f.admin.query('SELECT revision,revoked_at FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0];let refused:Promise<void>|undefined;
  try{
   await revocationBlock.query('BEGIN');const pid=Number((await revocationBlock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await revocationBlock.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params);
   refused=deny(()=>revoked.control.recovery().abandon(revokedId),'UNAUTHORIZED');refused.catch(()=>{});await observed(pid);
   await revocationBlock.query('COMMIT');await refused;
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[revokedId])).rows[0].n,0,'Observed wait-time revocation has no abandonment effect');
  }finally{
   await revocationBlock.query('ROLLBACK');revocationBlock.release();await refused?.catch(()=>{});
   await f.admin.query('UPDATE fabric.memberships SET revoked_at=$4,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,membership.revoked_at,membership.revision]);
  }
  assert.deepEqual(await revoked.control.recovery().outcome(),{uploadId:revokedId,status:'pending',replayAllowed:false});reads++;
 });
 await t.test('STAGING/authenticated-recovery-stage-first-observed-wait',async()=>{
  const s=await setup();let id='',release!:()=>void,enter!:()=>void;
  const entered=new Promise<void>(r=>{enter=r;}),resume=new Promise<void>(r=>{release=r;});
  const stage=new OwnedCipherFiles(s.r,crypto,s.control,{async phase(p,v){if(p==='object-fsynced'){id=v;enter();await resume;}}}).stage(s.saved.binding,value,description);
  await entered;const recovery=s.control.recovery(),waiting=recovery.abandon(id);
  try{await observed(s.pid());}finally{release();}
  assert.equal(await stage,id);await waiting;writes+=2;
  assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,recovery.control).collect(),{removed:1,protected:0});writes++;
 });
 await t.test('STAGING/authenticated-recovery-first-blocks-original-stage',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);let release!:()=>void,enter!:()=>void;
  const entered=new Promise<void>(r=>{enter=r;}),resume=new Promise<void>(r=>{release=r;});
  const recovery=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async afterAbandonment(){enter();await resume;}}).recovery();
  const abandoning=recovery.abandon(id);await entered;const blocker=s.pid();
  const stage=deny(()=>s.adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  try{
   await observed(blocker);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
  }finally{release();}
  await abandoning;await stage;writes++;
  assert.deepEqual(await recovery.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,recovery.control).collect(),{removed:1,protected:0});writes++;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,1);
 });
 await t.test('STAGING/authenticated-recovery-rollback-and-wire-outcomes',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);
  const broken=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async afterAbandonment(tx){
   assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0]?.['n'],1);
   s.set({...s.saved,rootId:randomUUID()});
  }}).recovery();
  await deny(()=>broken.abandon(id),'IDEMPOTENCY_CONFLICT');s.set(s.saved);
  assert.deepEqual(await s.control.recovery().outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  for(const mode of ['commit','rollback'] as const){
   const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),before=await f.native.snapshot(s.scope,s.saved.sessionId);
   await f.native.stop(s.scope,{sessionId:s.saved.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),observedRevision:before.revision});
   const stopped=await f.native.snapshot(s.scope,s.saved.sessionId);assert.equal(stopped.stopped,true);
   const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{
    const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),
     recovery=new AuthenticatedStagingPreparation(uow,a.authority,s.scope,s.resolver,s.materialId,witness).recovery();let failure:unknown;
    try{await recovery.abandon(id);assert.fail('Genuine COMMIT loss must refuse');}catch(e){failure=e;}
    assert.ok(failure instanceof FoundationError&&failure.code==='UNKNOWN_COMMIT');
    assert.deepEqual(safeFailure(failure),{schemaVersion:1,status:'unknown',error:'UNKNOWN_COMMIT',replayAllowed:false,nextAction:'original-key-lookup'});
    const recreated=new AuthenticatedStagingPreparation(f.uow,a.authority,await f.scopeFor(),s.resolver,s.materialId,new StagingWitnessJournal(witnessRoot)).recovery();
    assert.deepEqual(await recreated.outcome(),{uploadId:id,status:mode==='commit'?'abandoned':'pending',replayAllowed:false});reads++;
    assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,recreated.control).collect(),mode==='commit'?{removed:1,protected:0}:{removed:0,protected:1});
    assert.equal(proxy.dropped(),mode==='commit'?1:0);assert.equal(proxy.requestsDropped(),mode==='rollback'?1:0);
    if(mode==='rollback'){await recreated.abandon(id);assert.deepEqual(await new OwnedCipherFiles(s.r,crypto,recreated.control).collect(),{removed:1,protected:0});}
    assert.deepEqual(await recreated.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE command_key=$1',[s.saved.commandKey])).rows[0].n,1);
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE command_key=$1',[s.saved.commandKey])).rows[0].n,1);
    assert.deepEqual(await f.native.snapshot(s.scope,s.saved.sessionId),stopped,'Original-key uncertainty recovery never resumes its stopped native run');
    await deny(()=>s.adapter.stage(s.saved.binding,value,description),'STALE_FENCE');
    writes+=2;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('STAGING/authenticated-recovery-quarantine-authority-reachability',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),recovery=s.control.recovery();
  await a.publish(s.scope,async(c,epoch)=>{
   const b=s.saved.binding;
   await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,s.saved.sourceTaskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval '30 seconds')",[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,'sha256:'+'6'.repeat(64),b.keyId,b.generation,epoch]);
  });
  await deny(()=>recovery.abandon(id),'ARTIFACT_NOT_COMMITTED');
  const reachableFiles=new OwnedCipherFiles(s.r,crypto,recovery.control);
  await deny(()=>reachableFiles.collect(),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>reachableFiles.inspect(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  const orphan=await setup(),upload=await orphan.adapter.stage(orphan.saved.binding,value,description),cleanup=orphan.control.recovery();await cleanup.abandon(upload);
  const retained=await Promise.all(['object','manifest'].map(n=>readFile(resolve(orphan.r.path,'u-'+upload,n))));
  const broken=new OwnedCipherFiles(orphan.r,crypto,cleanup.control,{async phase(p){if(p==='quarantined')orphan.set({...orphan.saved,rootId:randomUUID()});}});
  await deny(()=>broken.collect(),'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await Promise.all(['object','manifest'].map(n=>readFile(resolve(orphan.r.path,'q-'+upload,n)))),retained);
  orphan.set(orphan.saved);assert.deepEqual(await new OwnedCipherFiles(orphan.r,crypto,cleanup.control).collect(),{removed:1,protected:0});writes+=2;
  assert.deepEqual(await cleanup.outcome(),{uploadId:upload,status:'abandoned',replayAllowed:false});reads++;
 });
 await t.test('STAGING/authenticated-inspect-postread-material-refusal',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),b=s.saved.binding;writes++;
  // Independent fixture head enrollment creates administrative reachability,
  // not a canonical save receipt or user-serving disclosure authorization.
  await a.publish(s.scope,async(c,epoch)=>{
   await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,s.saved.sourceTaskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval '50 seconds')",[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,'sha256:'+'7'.repeat(64),b.keyId,b.generation,epoch]);
  });
  const plaintext:Buffer[]=[];
  class ChangedCrypto extends CryptoStore {
   constructor(){super({async resolve(){throw new Error('Unused observed crypto key resolver');}});}
   override async open(binding:unknown,envelope:unknown){
    const bytes=await crypto.open(binding,envelope);plaintext.push(bytes);
    if(plaintext.length===2)s.set({...s.saved,rootId:randomUUID()});return bytes;
   }
  }
  const retained=await Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'u-'+id,n))));
  await deny(()=>new OwnedCipherFiles(s.r,new ChangedCrypto(),s.control).inspect(id,b),'IDEMPOTENCY_CONFLICT');
  assert.equal(plaintext.length,2);assert.equal(plaintext[1]!.length,value.length);
  assert.ok(plaintext.every(bytes=>bytes.every(byte=>byte===0)),'Authenticated postread material refusal must clear plaintext');
  s.set(s.saved);const fresh=await new OwnedCipherFiles(s.r,crypto,new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness)).inspect(id,b);
  try{assert.ok(fresh.bytes.equals(value));assert.equal(fresh.description,description);reads++;}finally{fresh.bytes.fill(0);}
  assert.deepEqual(await Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'u-'+id,n)))),retained);
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
 });
 await t.test('STAGING/authenticated-inspect-owner-final-refusal',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description),b=s.saved.binding;writes++;
  await a.publish(s.scope,async(c,epoch)=>{
   await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,s.saved.sourceTaskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),clock_timestamp()+interval '50 seconds')",[f.tenant,s.scope.spaceId,b.class,b.id,b.revision,'sha256:'+'8'.repeat(64),b.keyId,b.generation,epoch]);
  });
  let captured:{bytes:Buffer;description:string}|undefined;
  const failed:StagingControl={reserve:(...args)=>s.control.reserve(...args),lock:(v,work)=>s.control.lock(v,async lease=>{
   const result=await work(lease);captured=result as typeof captured;
   assert.ok(captured?.bytes.equals(value));s.set({...s.saved,rootId:randomUUID()});return result;
  })};
  await deny(()=>new OwnedCipherFiles(s.r,crypto,failed).inspect(id,b),'IDEMPOTENCY_CONFLICT');
  assert.ok(captured);assert.equal(captured.bytes.length,value.length);
  assert.ok(captured.bytes.every(byte=>byte===0),'The unchanged authenticated owner final check must clear the returned buffer on refusal');
  s.set(s.saved);const fresh=await s.adapter.inspect(id,b);
  try{assert.ok(fresh.bytes.equals(value));assert.equal(fresh.description,description);reads++;}finally{fresh.bytes.fill(0);}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
 });
 const witnessPath=(s:Awaited<ReturnType<typeof setup>>)=>resolve(witnessRoot.path,'w-'+createHash('sha256').update(JSON.stringify([s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey])).digest('hex'));
 await t.test('STAGING/authenticated-witness-settled-pg-rollback',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);
  const before=(await f.admin.query("SELECT coalesce(json_agg(a),'[]'::json) AS snapshot FROM fabric.storage_staging_abandonments a")).rows[0].snapshot as {upload_id:string;at:string}[];
  await s.control.abandon(id);writes++;
  const after=(await f.admin.query("SELECT coalesce(json_agg(a),'[]'::json) AS snapshot FROM fabric.storage_staging_abandonments a")).rows[0].snapshot as {upload_id:string;at:string}[];
  const original=await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey);
  assert.equal(original.terminal!.original.uploadId,id);assert.ok(original.intent);
  const restore=async(rows:unknown)=>{
   // Reproducible owned fixture snapshot restore. TRUNCATE does not alter any
   // immutable trigger, grant or installed owner; exact history is restored.
   const c=await f.admin.connect();try{await c.query('BEGIN');await c.query('TRUNCATE fabric.storage_staging_abandonments');
    await c.query('INSERT INTO fabric.storage_staging_abandonments SELECT * FROM jsonb_populate_recordset(null::fabric.storage_staging_abandonments,$1::jsonb)',[JSON.stringify(rows)]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  };
  try{
   await restore(before);
   const recreated=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,new StagingWitnessJournal(witnessRoot));
   await deny(()=>recreated.outcome(),'AUTHORITY_UNAVAILABLE');await deny(()=>recreated.original(),'AUTHORITY_UNAVAILABLE');
   await deny(()=>recreated.abandon(id),'AUTHORITY_UNAVAILABLE');
   await deny(()=>new OwnedCipherFiles(s.r,crypto,recreated).collect(),'AUTHORITY_UNAVAILABLE');
   await deny(()=>s.adapter.publish(id,s.saved.binding),'AUTHORITY_UNAVAILABLE');
   assert.ok((await readFile(resolve(s.r.path,'u-'+id,'object'))).length>0);
   await restore(after);
   const altered=(await f.admin.query(`SELECT json_agg(CASE WHEN upload_id=$1 THEN jsonb_set(to_jsonb(a),'{at}',to_jsonb(at+interval '1 microsecond')) ELSE to_jsonb(a) END) AS snapshot FROM fabric.storage_staging_abandonments a`,[id])).rows[0].snapshot;
   await restore(altered);
   await deny(()=>recreated.outcome(),'AUTHORITY_UNAVAILABLE');
   assert.deepEqual(await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey),original);
  }finally{await restore(after);}
  assert.deepEqual(await s.control.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});writes++;
 });
 await t.test('STAGING/authenticated-witness-ack-gap-and-rollback-intent',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);
  const gap=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async beforeWitnessAck(){throw new Error(description);}});
  await deny(()=>gap.abandon(id),'CONTENT_UNAVAILABLE');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,1);
  const pending=await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey);assert.ok(pending.intent);assert.equal(pending.terminal,undefined);
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  await deny(()=>s.adapter.publish(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  assert.deepEqual(await new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,new StagingWitnessJournal(witnessRoot)).recovery().outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});writes++;
  const rolled=await setup(),upload=await rolled.adapter.stage(rolled.saved.binding,value,description);
  await deny(()=>new AuthenticatedStagingPreparation(f.uow,a.authority,rolled.scope,rolled.resolver,rolled.materialId,witness,{async afterAbandonment(tx){await tx.query('SELECT 1/0');}}).abandon(upload),'CONTENT_UNAVAILABLE');
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[upload])).rows[0].n,0);
  assert.deepEqual(await rolled.control.outcome(),{uploadId:upload,status:'pending',replayAllowed:false});reads++;
  await rolled.control.lock(upload,async lease=>{const current=await lease.current();assert.equal(current.unknown,true);await deny(()=>lease.confirm(current.confirmation!),'ARTIFACT_NOT_COMMITTED');});
  await deny(()=>rolled.adapter.publish(upload,rolled.saved.binding),'ARTIFACT_NOT_COMMITTED');
  assert.deepEqual(await rolled.adapter.collect(),{removed:0,protected:1});
  await rolled.control.recovery().abandon(upload);assert.deepEqual(await rolled.adapter.collect(),{removed:1,protected:0});writes+=2;
 });
 await t.test('STAGING/authenticated-witness-enrollment-rollback-no-replay',async()=>{
  const s=await setup();
  const uow={withScope:<T>(scope:typeof s.scope,work:(tx:SqlTransaction)=>Promise<T>)=>f.uow.withScope(scope,tx=>work({async query<Row extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
   const result=await tx.query<Row>(sql,values);if(sql.startsWith('INSERT INTO fabric.storage_staging_reservations'))s.set({...s.saved,rootId:randomUUID()});return result;
  }}))};
  const control=new AuthenticatedStagingPreparation(uow,a.authority,s.scope,s.resolver,s.materialId,witness);
  await deny(()=>new OwnedCipherFiles(s.r,crypto,control).stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');s.set(s.saved);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,0);
  const w=await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey);assert.ok(w.original);assert.equal(w.intent,undefined);
  assert.deepEqual(await s.control.outcome(),{uploadId:null,status:'absent',replayAllowed:false});reads++;
  await deny(()=>s.adapter.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
 });
 await t.test('STAGING/authenticated-witness-files-scope-and-cas',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);await s.control.abandon(id);writes++;
  const path=witnessPath(s),files=(await readdir(path)).sort();assert.deepEqual(files,['enrolled.json','intent.json','settled.json']);
  for(const name of files){const file=resolve(path,name),bytes=await readFile(file);
   assert.ok(!bytes.includes(value)&&!bytes.includes(Buffer.from(description)));
   await writeFile(file,Buffer.alloc(4097));await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');await writeFile(file,bytes);
   await writeFile(file,'{}');await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');await writeFile(file,bytes);
   await rename(file,file+'.saved');await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');await rename(file+'.saved',file);
   await rename(file,file+'.saved');await symlink(file+'.saved',file);await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');await unlink(file);await rename(file+'.saved',file);
   const extra=resolve(witnessRoot.path,'w-'+createHash('sha256').update(randomUUID()).digest('hex'));await link(file,extra);
   await deny(()=>s.control.outcome(),'AUTHORITY_UNAVAILABLE');await unlink(extra);
  }
  const wrong=new StagingWitnessJournal({...witnessRoot,inode:witnessRoot.inode+1});
  await deny(()=>new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,wrong).outcome(),'AUTHORITY_UNAVAILABLE');
  const w=(await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey)).original!;
  const changed={...w,commandKey:randomUUID(),uploadId:randomUUID()};
  let ready=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
  const hooks={async afterEnrollmentRead(){if(++ready===2)release();await gate;}};
  const race=await Promise.allSettled([new StagingWitnessJournal(witnessRoot,hooks).enroll(changed),new StagingWitnessJournal(witnessRoot,hooks).enroll({...changed,uploadId:randomUUID()})]);
  assert.equal(ready,2,'Both recreated witnesses observed the same absent enrollment before exclusive publication');
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.filter(r=>r.status==='rejected').length,1);
  assert.equal((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await s.adapter.collect(),{removed:1,protected:0});writes++;
 });


 await t.test('STAGING/authenticated-witness-ack-authority-and-gc-wait',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);
  const broken=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness,{async beforeWitnessAck(){s.set({...s.saved,rootId:randomUUID()});}});
  await deny(()=>broken.abandon(id),'IDEMPOTENCY_CONFLICT');s.set(s.saved);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,1);
  assert.equal((await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey)).terminal,undefined);
  assert.deepEqual(await s.adapter.collect(),{removed:0,protected:1});
  let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>enter=r),resume=new Promise<void>(r=>release=r);
  const ack=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,new StagingWitnessJournal(witnessRoot),{async beforeWitnessAck(){enter();await resume;}});
  const resolving=ack.recovery().outcome();await entered;
  const collecting=s.adapter.collect();collecting.catch(()=>{});
  try{await observed(s.pid());assert.ok((await readFile(resolve(s.r.path,'u-'+id,'object'))).length>0);}
  finally{release();}
  assert.deepEqual(await resolving,{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.deepEqual(await collecting,{removed:1,protected:0});writes++;
  assert.ok((await witness.state(s.scope.tenantId,s.scope.spaceId,s.scope.actorId,s.saved.commandKey)).terminal);
 });

 // Actual filesystem process death. Authenticated PG owner and independent
 // witness survive in the parent. This does not qualify whole-service/PG-host
 // death, witness append interruption or power loss.
 const killedPhases=['allocated','object-written','object-fsynced','object-renamed',
  'object-directory-fsynced','manifest-fsynced','manifest-renamed','manifest-directory-fsynced','confirmed'] as const;
 for(const stopAt of killedPhases)await t.test('STAGING/authenticated-process-kill-'+stopAt,async()=>{
  const s=await setup();
  const id=await killCipherProcess(s.control,{root:s.r,binding:s.saved.binding,value,description,operation:'stage',stopAt},async(id,pid)=>{
   assert.ok(pid!==process.pid);
   const activity=(await f.admin.query('SELECT state,wait_event_type FROM pg_stat_activity WHERE pid=$1',[s.pid()])).rows[0];
   assert.equal(activity.state,'idle in transaction');
   // The reservation committed before filesystem allocation, but confirmation
   // remains invisible to this independent PG client even at confirmed phase.
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE upload_id=$1',[id])).rows[0].n,1);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_confirmations WHERE upload_id=$1',[id])).rows[0].n,0);
   const names=(await readdir(resolve(s.r.path,'u-'+id))).sort();
   if(stopAt==='allocated')assert.deepEqual(names,[]);
   else if(stopAt==='object-written'||stopAt==='object-fsynced')assert.ok(names.length===1&&/^\.part-[0-9a-f-]{36}$/.test(names[0]!));
   else if(stopAt==='object-renamed'||stopAt==='object-directory-fsynced')assert.deepEqual(names,['object']);
   else if(stopAt==='manifest-fsynced')assert.ok(names.length===2&&names.includes('object')&&/^\.part-[0-9a-f-]{36}$/.test(names[0]!));
   else assert.deepEqual(names,['manifest','object']);
   for(const name of names){const bytes=await readFile(resolve(s.r.path,'u-'+id,name));assert.ok(!bytes.includes(value)&&!bytes.includes(Buffer.from(description)));}
  });writes++;
  // Recreate both owner and filesystem adapter after verified SIGKILL/close.
  const fresh=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness),files=new OwnedCipherFiles(s.r,crypto,fresh);
  assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'pending',replayAllowed:false});reads++;
  await fresh.lock(id,async lease=>{const current=await lease.current();assert.equal(current.confirmation,null);assert.equal(current.pending,true);assert.equal(current.reachable,false);});
  await deny(()=>files.publish(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>files.inspect(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>files.stage(s.saved.binding,value,description),'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await files.collect(),{removed:0,protected:1});
  await fresh.abandon(id);assert.deepEqual(await files.collect(),{removed:1,protected:0});writes++;
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
  assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE material_id=$1',[s.materialId])).rows[0].n,1);
 });
 await t.test('STAGING/authenticated-process-kill-quarantine',async()=>{
  const s=await setup(),id=await s.adapter.stage(s.saved.binding,value,description);await s.control.abandon(id);
  const retained=await Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'u-'+id,n))));
  assert.equal(await killCipherProcess(s.control,{root:s.r,binding:s.saved.binding,value:Buffer.alloc(0),description:'',operation:'collect',stopAt:'quarantined'},async seen=>{
   assert.equal(seen,id);
   assert.equal((await f.admin.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[s.pid()])).rows[0].state,'idle in transaction');
   assert.deepEqual((await readdir(s.r.path)).sort(),['.storage-owner.json','q-'+id].sort());
   assert.deepEqual(await Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'q-'+id,n)))),retained);
  }),id);writes++;
  const fresh=new AuthenticatedStagingPreparation(f.uow,a.authority,s.scope,s.resolver,s.materialId,witness),files=new OwnedCipherFiles(s.r,crypto,fresh);
  assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
  // Current all-party authority must still govern recovery after process death.
  const params=[f.tenant,s.scope.spaceId,f.actors[1]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);
   await deny(()=>files.collect(),'UNAUTHORIZED');
   assert.deepEqual(await Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'q-'+id,n)))),retained);
  }finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
  await deny(()=>files.publish(id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  assert.deepEqual(await files.collect(),{removed:1,protected:0});writes++;
  assert.deepEqual(await readdir(s.r.path),['.storage-owner.json']);
  assert.deepEqual(await fresh.outcome(),{uploadId:id,status:'abandoned',replayAllowed:false});reads++;
 });
 const heads=await registerStagedHeadTests(t,f,a,crypto,root,value,description,deny);reads+=heads.reads;writes+=heads.writes;
 return {reads,writes};
}
