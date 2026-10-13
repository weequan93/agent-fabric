import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createStorageFixture } from '../helpers/pg-fixture.js';
import { enrollAuthority } from '../helpers/authority-fixture.js';
import { startCommitWireProxy } from '../helpers/commit-wire-proxy.js';
import { emitObservations } from '../helpers/observations.js';
import { migrateStorageStagingAbandonment,migrateStorageSourceContent,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { sealSourceContent,SourceContentPrerequisite,SourceContentRepository,type SourceContentMaterial,type SourcePayload } from '../../src/source-content.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { HeadPublicationRepository } from '../../src/head-publication.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { AuthenticatedUnitOfWork,type AsyncUnitOfWork,type SqlTransaction } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { StorageError,demand } from '../../src/errors.js';

test('SOURCE-CONTENT/behavior / encrypted provenance in authenticated head transaction',async t=>{
 const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
 const key=randomBytes(32),digestKey=randomBytes(32),crypto=new CryptoStore({resolve:async()=>({dataKey:key,digestKey})});
 let reads=0,writes=0,denials=0,leaks=0,mutations=0,duplicate=0;
 const deny=async(work:()=>Promise<unknown>,codes:readonly string[])=>{let caught=false;try{await work();leaks++;}catch(e){assert.ok(codes.includes(String((e as {code?:unknown}).code)),`Expected ${codes.join('/')} got ${String((e as {code?:unknown}).code)}`);caught=true;}assert.ok(caught);denials++;};
 try{
  await migrateStorageStagingAbandonment(f.admin,options);
  const a=await enrollAuthority(f),scope=f.scope,root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
  await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
  const authority=new StorageAuthorityRepository(journal,f.native),reader=(uow:AsyncUnitOfWork=f.uow,c=crypto)=>new SourceContentRepository(uow,authority,c);
  const legacyTask=await f.task('maintenance'),legacyHead={tenantId:scope.tenantId,spaceId:scope.spaceId,class:'source' as const,id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex'),keyId:randomUUID(),generation:randomUUID(),sourceTaskId:legacyTask.binding.taskId,expiresAt:new Date(Date.now()+50_000).toISOString()};
  const legacyCommand={key:randomUUID(),sessionId:legacyTask.binding.sessionId,materialId:randomUUID(),expected:null,expiresAt:new Date(Date.now()+30_000).toISOString()};
  assert.equal((await new HeadPublicationRepository(f.uow,journal,f.native,{resolve:async()=>legacyHead}).publish(scope,legacyCommand)).status,'committed');
  const legacyRows=(await f.admin.query('SELECT * FROM fabric.storage_head_publications ORDER BY command_key')).rows;
  const beforeOwner=await installedOwnerSnapshot(f.admin),oldLedger=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
  await t.test('SOURCE-CONTENT/migration',async()=>{
   await assert.rejects(migrateStorageSourceContent(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected source content migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_sources') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldLedger);
   await migrateStorageSourceContent(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);
   await migrateStorageSourceContent(f.admin,options);await migrateStorageStagingAbandonment(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=12 ORDER BY version')).rows,oldLedger);
   assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_head_publications ORDER BY command_key')).rows,legacyRows);
   await deny(()=>reader().read(scope,{class:'source',id:legacyHead.id,revision:1,witness:legacyHead.witness}),['CONTENT_UNAVAILABLE']);
  });
  const materials=new Map<string,SourceContentMaterial>();
  const owner={resolve:async(_tx:SqlTransaction,_s:typeof scope,id:string)=>materials.get(id),admit:async(_tx:SqlTransaction,_s:typeof scope,p:SourcePayload)=>{demand(!p.narrative.includes('fixture-secret-denied'),'RETENTION_RESTRICTED');}};
  const repo=(hooks={},uow:AsyncUnitOfWork=f.uow,prerequisite=new SourceContentPrerequisite(crypto,owner))=>new HeadPublicationRepository(uow,journal,f.native,{resolve:async(tx,s,id)=>(await owner.resolve(tx,s,id))?.head},hooks,prerequisite);
  const marker='private-source-'+randomUUID();
  const ref=(m:SourceContentMaterial)=>({class:'source' as const,id:m.head.id,revision:m.head.revision,witness:m.head.witness});
  async function setup(extra:Partial<SourcePayload>={}){
   const task=await f.task('maintenance'),original={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()},id=randomUUID();
   const value={schemaVersion:1 as const,title:marker+' title',uri:'local:'+marker,narrative:marker+'\n决策🙂 e\u0301\u0000\r\n',contentDigest:'sha256:'+createHash('sha256').update(marker).digest('hex'),assertedBy:scope.actorId,recordedAt:new Date().toISOString(),...extra};
   const material=await sealSourceContent(crypto,{schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'source',id,revision:1,generation:randomUUID(),keyId:randomUUID()},value,{sourceTaskId:task.binding.taskId,expiresAt:new Date(Date.now()+50_000).toISOString(),original});
   const materialId=randomUUID();materials.set(materialId,material);return {material,value,command:{...original,materialId,expected:null}};
  }
  const snapshot=async()=>(await f.admin.query('SELECT * FROM fabric.storage_sources ORDER BY source_id')).rows;
  const accepted=await setup();
  await t.test('SOURCE-CONTENT/exact-recreated-and-retained',async()=>{
   let pid=0;
   const prerequisite=new SourceContentPrerequisite(crypto,owner,{afterInsert:async tx=>{
    pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);
    assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_sources WHERE source_id=$1',[accepted.material.head.id])).rows[0]?.['n'],1);
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_sources WHERE source_id=$1',[accepted.material.head.id])).rows[0].n,0);
   }});
   assert.equal((await repo({},f.uow,prerequisite).publish(scope,accepted.command)).status,'committed');assert.ok(pid);writes++;
   assert.deepEqual(await reader().read(scope,ref(accepted.material)),accepted.value);reads++;
   assert.deepEqual(await reader(f.uow,new CryptoStore({resolve:async()=>({dataKey:key,digestKey})})).read(scope,ref(accepted.material)),accepted.value);reads++;
   const rows=await snapshot();assert.equal(rows.length,1);assert.equal(JSON.stringify(rows).includes(marker),false);assert.equal(JSON.stringify(rows).includes(key.toString('hex')),false);
   await deny(()=>reader(f.uow,new CryptoStore({resolve:async()=>({dataKey:randomBytes(32),digestKey})})).read(scope,ref(accepted.material)),['INTEGRITY_FAILED']);
  });
  await t.test('SOURCE-CONTENT/material-admission-boundaries',async()=>{
   const cases=[{narrative:'fixture-secret-denied'},{assertedBy:f.actors[1]},{recordedAt:new Date(Date.now()+120_000).toISOString()}];
   for(const value of cases){const s=await setup(value),before=await snapshot();await deny(()=>repo().publish(scope,s.command),['RETENTION_RESTRICTED','UNAUTHORIZED','INVALID_SCHEMA']);assert.deepEqual(await snapshot(),before);assert.ok(await journal.current(scope.tenantId,scope.spaceId));}
   const s=await setup(),bad={...s.material,original:{...s.material.original,key:randomUUID()}};materials.set(s.command.materialId,bad);
   await deny(()=>repo().publish(scope,s.command),['CHECK_BINDING_MISMATCH']);
   await deny(()=>sealSourceContent(crypto,{...s.material.envelope,class:'method'},s.value,{sourceTaskId:s.material.head.sourceTaskId,expiresAt:s.material.head.expiresAt,original:s.material.original}),['INVALID_SCHEMA']);
  });
  await t.test('SOURCE-CONTENT/roles-and-integrity',async()=>{
   const r=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fabric.storage_sources'::regclass")).rows[0];assert.deepEqual(r,{relrowsecurity:true,relforcerowsecurity:true});
   assert.equal((await f.controller.query('SELECT * FROM fabric.storage_sources')).rows.length,0);
   for(const p of [f.worker,f.idpPool,f.client]){await deny(()=>p.query('SELECT * FROM fabric.storage_sources'),['42501']);await deny(()=>p.query('SELECT fabric.storage_publish_source_content($1,$2)',[accepted.command.key,JSON.stringify(accepted.material.envelope)]),['42501']);}
   await deny(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.storage_sources')),['42501']);
   await deny(()=>f.admin.query('DELETE FROM fabric.storage_sources'),['P0001']);
   await deny(()=>f.uow.withScope(scope,tx=>tx.query('SELECT fabric.storage_publish_source_content($1,$2)',[accepted.command.key,JSON.stringify({...accepted.material.envelope,id:randomUUID()})])),['23514']);
   await deny(()=>f.uow.withScope(scope,tx=>tx.query('SELECT fabric.storage_publish_source_content($1,$2)',[accepted.command.key,JSON.stringify(accepted.material.envelope)])),['23514']);
   await deny(()=>f.admin.query('INSERT INTO fabric.storage_sources SELECT * FROM fabric.storage_sources'),['23505']);
   await deny(()=>reader().read({...scope} as typeof scope,ref(accepted.material)),['UNAUTHORIZED']);
   const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);await deny(()=>reader().read(foreign,ref(accepted.material)),['AUTHORITY_UNAVAILABLE','STALE_REVISION']);
  });
  await t.test('SOURCE-CONTENT/same-transaction-envelope-refusals',async()=>{
   for(const change of [{tenantId:f.foreignTenant},{id:randomUUID()},{tag:null},{nonce:'short'},{control:'mint-authority'}]){
    const s=await setup(),before=await snapshot(),anchor=await journal.current(scope.tenantId,scope.spaceId);
    await deny(()=>repo({afterPublication:async(tx:SqlTransaction)=>{
     // This statement actually passes the xmin prerequisite and reaches the
     // envelope/scope/witness guards in the same original transaction.
     await tx.query('SELECT fabric.storage_publish_source_content($1,$2)',[s.command.key,JSON.stringify({...s.material.envelope,...change})]);
    }}).publish(scope,s.command),['23514']);
    assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookup(scope,s.command)).status,'absent-safe');
    assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),anchor);
   }
  });
  await t.test('SOURCE-CONTENT/partial-rollback-and-original',async()=>{
   const s=await setup(),before=await snapshot(),anchor=await journal.current(scope.tenantId,scope.spaceId);
   const prerequisite=new SourceContentPrerequisite(crypto,owner,{afterInsert:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_sources WHERE source_id=$1',[s.material.head.id])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await deny(()=>repo({},f.uow,prerequisite).publish(scope,s.command),['22012']);assert.deepEqual(await snapshot(),before);
   assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.equal((await repo().lookup(scope,s.command)).status,'absent-safe');assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),anchor);
   await deny(()=>reader().read(scope,ref(s.material)),['STALE_REVISION']);
  });
  await t.test('SOURCE-CONTENT/killed-partial-transaction',async()=>{
   const s=await setup(),before=await snapshot(),pool=new pg.Pool({connectionString:f.fixtureDsn('controller'),max:1,connectionTimeoutMillis:2000});
   const transport=(e:Error)=>assert.ok(e.message==='Connection terminated unexpectedly'||(e as {code?:string}).code==='57P01');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   const killedUow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)});
   const prerequisite=new SourceContentPrerequisite(crypto,owner,{afterInsert:async tx=>{
    assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_sources WHERE source_id=$1',[s.material.head.id])).rows[0]?.['n'],1);
    const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);
    const blocked=tx.query('SELECT pg_sleep(5)');blocked.catch(()=>{});
    assert.equal((await f.admin.query('SELECT pg_terminate_backend($1) AS killed',[pid])).rows[0].killed,true);
    await blocked;
   }});
   try{await deny(()=>repo({},killedUow,prerequisite).publish(scope,s.command),['57P01']);}finally{await pool.end();}
   assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookup(scope,s.command)).status,'absent-safe');
   await deny(()=>reader().read(scope,ref(s.material)),['STALE_REVISION']);
  });
  await t.test('SOURCE-CONTENT/postinsert-owner-change',async()=>{
   const s=await setup(),before=await snapshot();
   const prerequisite=new SourceContentPrerequisite(crypto,owner,{afterInsert:async()=>{materials.set(s.command.materialId,{...s.material,original:{...s.material.original,key:randomUUID()}});}});
   await deny(()=>repo({},f.uow,prerequisite).publish(scope,s.command),['CHECK_BINDING_MISMATCH']);assert.deepEqual(await snapshot(),before);
   assert.equal((await repo().lookup(scope,s.command)).status,'absent-safe');
  });
  await t.test('SOURCE-CONTENT/current-revocation',async()=>{
   const input={key:randomUUID(),sessionId:accepted.command.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),source:{id:accepted.material.head.id,revision:accepted.material.head.revision,witness:accepted.material.head.witness}};
   assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,input)).status,'committed');
   await deny(()=>reader().read(scope,ref(accepted.material)),['RETENTION_RESTRICTED']);assert.equal((await snapshot()).length,1);
  });
  await t.test('SOURCE-CONTENT/concurrent-original',async()=>{
   const s=await setup();let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
   const prerequisite=new SourceContentPrerequisite(crypto,owner,{afterInsert:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}});
   const first=repo({},f.uow,prerequisite).publish(scope,s.command);first.catch(()=>{});await Promise.race([reached,first]);
   const second=deny(()=>repo().publish(scope,s.command),['IDEMPOTENCY_CONFLICT','AUTHORITY_UNAVAILABLE']);second.catch(()=>{});
   try{let observed=false;const deadline=Date.now()+1500;while(Date.now()<deadline){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Actual duplicate caller must block on committing backend');assert.equal((await f.admin.query('SELECT 1 FROM fabric.storage_sources WHERE source_id=$1',[s.material.head.id])).rows.length,0);}finally{release();}
   assert.equal((await first).status,'committed');await second;writes++;
   const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_sources WHERE source_id=$1',[s.material.head.id])).rows[0].n;if(n!==1)duplicate++;assert.equal(n,1);
   assert.deepEqual(await reader().read(scope,ref(s.material)),s.value);reads++;
  });
  await t.test('SOURCE-CONTENT/wire-outcomes',async()=>{
   for(const mode of ['commit','rollback'] as const){const s=await setup(),before=await snapshot(),proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
    try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)});
     await deny(()=>repo({},uow).publish(scope,s.command),['UNKNOWN_COMMIT']);await deny(()=>reader().read(scope,ref(s.material)),['AUTHORITY_UNAVAILABLE']);
     assert.equal((await repo().lookup(scope,s.command)).status,mode==='commit'?'committed':'absent-safe');
     if(mode==='commit'){assert.equal(proxy.dropped(),1);assert.deepEqual(await reader().read(scope,ref(s.material)),s.value);writes++;reads++;}
     else{assert.equal(proxy.requestsDropped(),1);assert.deepEqual(await snapshot(),before);await deny(()=>reader().read(scope,ref(s.material)),['STALE_REVISION']);}
    }finally{await pool.end();await proxy.close();}
   }
  });
  assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
  emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'source-content',positives:{save:0,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicate,restrictedResurrection:0,askComputerStart:0}});
 }finally{key.fill(0);digestKey.fill(0);await f.close();}
});
