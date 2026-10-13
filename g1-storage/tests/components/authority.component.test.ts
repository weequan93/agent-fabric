import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { createStorageFixture } from '../helpers/pg-fixture.js';
import { enrollAuthority,transaction } from '../helpers/authority-fixture.js';
import { migrateStorage,migrateStorageAuthority,migrateStorageSharing,migrateStorageEpochPublication,migrateStoragePolicyPublication,migrateStorageSourceRevocation,migrateStorageTombstonePublication,migrateStorageForgetWork,migrateStorageHeadPublication,migrateStorageSharePublication,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import type { VerifiedScope } from '../../src/owners.js';
import { emitObservations } from '../helpers/observations.js';
import { registerAccountingTests } from '../helpers/register-accounting-tests.js';
import { registerControlReadTests } from '../helpers/register-control-read-tests.js';
import { registerSharePublicationTests } from '../helpers/register-share-publication-tests.js';
import { registerHeadTests } from '../helpers/register-head-tests.js';
import { registerEntityReadTests } from '../helpers/register-entity-read-tests.js';
import { registerForgetWorkTests } from '../helpers/register-forget-work-tests.js';
import { registerTombstoneTests } from '../helpers/register-tombstone-tests.js';
import { registerSourceTests } from '../helpers/register-source-tests.js';
import { registerPolicyTests } from '../helpers/register-policy-tests.js';
import { registerEpochTests } from '../helpers/register-epoch-tests.js';

test('AUTHORITY/behavior / real authenticated current control ledger',async t=>{
 const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
 let reads=0,denials=0,leaks=0,mutations=0,restrictedReads=0,charges=0;
 const deny=async(work:()=>Promise<unknown>,codes:readonly string[])=>{
  let caught=false;try{await work();leaks++;}catch(e){assert.ok(codes.includes(String((e as {code?:unknown}).code)),`Expected ${codes.join('/')} refusal, got ${String((e as {code?:unknown}).code)}`);caught=true;}
  assert.equal(caught,true,'Unauthorized work succeeded');denials++;
 };
 try{
  await migrateStorage(f.admin,options);const ownerBefore=await installedOwnerSnapshot(f.admin),v1=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations')).rows;
  await t.test('AUTHORITY/migration',async()=>{
   await assert.rejects(migrateStorageAuthority(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected authority migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_authority_epoch') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations')).rows,v1);
   await migrateStorageAuthority(f.admin,options);const after=await storageSchemaSnapshot(f.admin);
   await migrateStorageAuthority(f.admin,options);await migrateStorage(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),after);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version=1')).rows,v1);
   const ledgers=(await f.admin.query('SELECT version FROM public.fabric_storage_migrations ORDER BY version')).rows;assert.deepEqual(ledgers,[{version:1},{version:2}]);
   const v2=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations')).rows;
   await assert.rejects(migrateStorageSharing(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected sharing migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_shares') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations')).rows,v2);
   await migrateStorageSharing(f.admin,options);const v3=await storageSchemaSnapshot(f.admin);
   await migrateStorageSharing(f.admin,options);await migrateStorageAuthority(f.admin,options);await migrateStorage(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v3);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<3')).rows,v2);
   await deny(()=>migrateStorageSharing(f.admin,{...options,instance:randomUUID()}),['CLEANUP_UNPROVEN']);
   const old=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageEpochPublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected epoch publication migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_epoch_publications') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,old);
   await migrateStorageEpochPublication(f.admin,options);const v4=await storageSchemaSnapshot(f.admin);
   await migrateStorageEpochPublication(f.admin,options);await migrateStorageSharing(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v4);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<4 ORDER BY version')).rows,old);
   const prior=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStoragePolicyPublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected policy publication migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_policy_changes') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,prior);
   await migrateStoragePolicyPublication(f.admin,options);const v5=await storageSchemaSnapshot(f.admin);
   await migrateStoragePolicyPublication(f.admin,options);await migrateStorageEpochPublication(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v5);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<5 ORDER BY version')).rows,prior);
   const historical=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageSourceRevocation(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected source revocation migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_source_revocations') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,historical);
   await migrateStorageSourceRevocation(f.admin,options);const v6=await storageSchemaSnapshot(f.admin);
   await migrateStorageSourceRevocation(f.admin,options);await migrateStoragePolicyPublication(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v6);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<6 ORDER BY version')).rows,historical);
   const oldSix=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageTombstonePublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected tombstone publication migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_tombstone_publications') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldSix);
   await migrateStorageTombstonePublication(f.admin,options);const v7=await storageSchemaSnapshot(f.admin);
   await migrateStorageTombstonePublication(f.admin,options);await migrateStorageSourceRevocation(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v7);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<7 ORDER BY version')).rows,oldSix);
   const oldSeven=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageForgetWork(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected forget work migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_forget_work') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldSeven);
   await migrateStorageForgetWork(f.admin,options);const v8=await storageSchemaSnapshot(f.admin);
   await migrateStorageForgetWork(f.admin,options);await migrateStorageTombstonePublication(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v8);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<8 ORDER BY version')).rows,oldSeven);
   const oldEight=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageHeadPublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected head publication migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_head_publications') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldEight);
   await migrateStorageHeadPublication(f.admin,options);const v9=await storageSchemaSnapshot(f.admin);
   await migrateStorageHeadPublication(f.admin,options);await migrateStorageForgetWork(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v9);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<9 ORDER BY version')).rows,oldEight);
   const oldNine=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await assert.rejects(migrateStorageSharePublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected share publication migration rollback'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_share_publications') AS relation")).rows[0].relation,null);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldNine);
   await migrateStorageSharePublication(f.admin,options);const v10=await storageSchemaSnapshot(f.admin);
   await migrateStorageSharePublication(f.admin,options);await migrateStorageHeadPublication(f.admin,options);
   assert.equal(await storageSchemaSnapshot(f.admin),v10);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<10 ORDER BY version')).rows,oldNine);

  });
  const a=await enrollAuthority(f),task=await f.task(),id=randomUUID(),commandKey=randomUUID(),receipt=randomUUID(),job=randomUUID(),witness='sha256:'+createHash('sha256').update(randomUUID()).digest('hex');
  const ref={class:'source' as const,id,revision:1,witness},p=[f.tenant,f.spaces.group];
  const read=(s:VerifiedScope=f.scope,r:unknown=ref)=>f.uow.withScope(s,tx=>a.authority.entity(tx,s,r));
  await a.publish(f.scope,async(c,epoch)=>{
   await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[...p,id,task.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,'source',$3,1,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '60s')",[...p,id,witness,randomUUID(),randomUUID(),epoch]);
   await c.query('INSERT INTO fabric.storage_commands VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())',[...p,f.scope.actorId,commandKey,witness,receipt,epoch]);
   await c.query("INSERT INTO fabric.storage_outbox VALUES($1,$2,$3,$4,$5,'source',$6,1,$7,clock_timestamp())",[...p,job,f.scope.actorId,commandKey,id,epoch]);
   const restricted=randomUUID();await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[...p,restricted,task.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_tombstones VALUES($1,$2,'source',$3,1,$4,$5,clock_timestamp())",[...p,restricted,epoch,commandKey]);
   await c.query("INSERT INTO fabric.storage_restrictions VALUES($1,$2,'source',$3,1,$4,'deleted',clock_timestamp())",[...p,restricted,epoch]);
  });
  await t.test('AUTHORITY/live-owners',async()=>{
   const head=await read();assert.equal(head['id'],id);assert.equal(head['witness'],witness);assert.equal(head['source_task_id'],task.binding.taskId);reads++;
   const second=new StorageAuthorityRepository({current:async(t,s)=>a.anchors.get(t+'/'+s)},f.native);
   assert.equal((await f.uow.withScope(f.scope,tx=>second.entity(tx,f.scope,ref)))['id'],id);reads++;
   const intent={purpose:'ask' as const,sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()};
   await f.uow.withScope(f.scope,tx=>a.authority.assertCurrent(tx,f.scope,intent));reads++;
   const maintenance=await f.task('maintenance');await f.uow.withScope(f.scope,tx=>a.authority.assertCurrent(tx,f.scope,{...intent,purpose:'maintenance',sessionId:maintenance.binding.sessionId}));reads++;
   await deny(()=>f.uow.withScope(f.scope,tx=>a.authority.assertCurrent(tx,f.scope,{...intent,purpose:'maintenance'})),['REQUIRED_CAPABILITY_UNSUPPORTED']);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE receipt_id=$1',[receipt])).rows[0].n,1);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_outbox WHERE job_id=$1',[job])).rows[0].n,1);
  });
  await t.test('AUTHORITY/scope-negative',async()=>{
   await deny(()=>read({...f.scope} as VerifiedScope),['UNAUTHORIZED']);
   await deny(()=>f.verifier.verify({tenantId:f.tenant,spaceId:f.spaces.group,sessionCredential:f.tokens.get(f.actors[0])!+'forged'}),['INVALID_TOKEN']);
   await deny(()=>read(f.scope,{...ref,witness:'sha256:'+'0'.repeat(64)}),['STALE_REVISION']);
   await deny(()=>read(f.scope,{...ref,revision:2}),['STALE_REVISION']);
   await deny(()=>read(f.scope,{...ref,class:'knowledge'}),['STALE_REVISION']);
   for(const s of [await f.scopeFor(f.actors[0],f.spaces.personal),await f.scopeFor(f.actors[0],f.spaces.share),await f.scopeFor(f.foreignActor,f.spaces.foreign)]){
    await deny(()=>read(s),['STALE_REVISION']);
    assert.equal(await f.uow.withScope(s,async tx=>(await tx.query('SELECT * FROM fabric.storage_current_heads')).rows.length),0);
   }
  });
  await t.test('AUTHORITY/database-roles',async()=>{
   const tables=['storage_rooms','storage_policy','storage_entities','storage_current_heads','storage_tombstones','storage_restrictions','storage_commands','storage_outbox','storage_authority_epoch'];
   const catalog=(await f.admin.query('SELECT relname,relrowsecurity,relforcerowsecurity,has_table_privilege(\'public\',oid,\'SELECT\') AS public_read FROM pg_class WHERE relnamespace=\'fabric\'::regnamespace AND relname=ANY($1)',[tables])).rows;
   assert.equal(catalog.length,tables.length);for(const r of catalog){assert.equal(r.relrowsecurity,true);assert.equal(r.relforcerowsecurity,true);assert.equal(r.public_read,false);}
   const role=(await f.controller.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];assert.deepEqual(Object.values(role),[false,false,false,false]);
   for(const role of [f.worker,f.idpPool,f.client])for(const table of tables)await deny(()=>role.query('SELECT * FROM fabric.'+table),['42501']);
   assert.equal((await f.controller.query('SELECT * FROM fabric.storage_current_heads')).rows.length,0);
   for(const table of tables){const before=(await f.admin.query('SELECT * FROM fabric.'+table)).rows;
    await deny(()=>f.uow.withScope(f.scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);
    await deny(()=>f.admin.query('DELETE FROM fabric.'+table),['P0001']);
    if(JSON.stringify((await f.admin.query('SELECT * FROM fabric.'+table)).rows)!==JSON.stringify(before))mutations++;
   }
   await deny(()=>new (f.foundation.constructor as typeof import('../../../g1-foundations/src/postgres-uow.js').PostgresUnitOfWork)(f.admin).withScope(f.scope,async()=>null),['UNAUTHORIZED']);
   await deny(()=>f.admin.query('INSERT INTO fabric.storage_authority_epoch VALUES($1,$2,99,$3,1,$4,clock_timestamp())',[...p,randomUUID(),witness]),['23514']);
   await deny(()=>f.admin.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[f.foreignTenant,f.spaces.foreign,randomUUID(),task.binding.taskId]),['23503']);
  });
  await t.test('AUTHORITY/grants-policy',async()=>{
   const reader=await f.scopeFor(f.actors[2]);assert.equal((await read(reader))['id'],id);reads++;
   for(const op of ['write','forget','restore','backup','maintenance','share'] as const)await deny(()=>f.uow.withScope(reader,tx=>a.authority.check(tx,reader,op)),['UNAUTHORIZED']);
   const anchor=a.anchors.get(a.key(f.scope))!;
   await a.publish(f.scope,async c=>{await c.query('INSERT INTO fabric.storage_policy VALUES($1,$2,2,$3::jsonb,$4::jsonb)',[...p,JSON.stringify({...a.policy.periods,source:86401}),JSON.stringify(a.policy.operations)]);},2);
   await deny(()=>read(),['RETENTION_RESTRICTED']);
   await a.publish(f.scope,undefined,1);assert.equal((await read())['id'],id);reads++;
   assert.ok(a.anchors.get(a.key(f.scope))!.epoch>anchor.epoch);
  });
  await t.test('AUTHORITY/anchor-recovery',async()=>{
   const key=a.key(f.scope),anchor=a.anchors.get(key)!;a.anchors.delete(key);
   await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);a.anchors.set(key,anchor);
   const offline=new StorageAuthorityRepository({current:async()=>{throw new Error('offline fixture');}},f.native);
   await deny(()=>f.uow.withScope(f.scope,tx=>offline.entity(tx,f.scope,ref)),['AUTHORITY_UNAVAILABLE']);
   a.anchors.set(key,{...anchor,epoch:anchor.epoch-1});await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);a.anchors.set(key,anchor);
   // Actual owned PG corruption/loss probes. Only reproducible synthetic rows;
   // restore exact originals and re-enable immutable guards in every failure path.
   async function removeAndRestore(table:'storage_authority_epoch'|'storage_current_heads'|'storage_outbox',where:string,values:unknown[]){
    const c=await f.admin.connect();let rows:Record<string,unknown>[]=[],removed=false;
    try{
     rows=(await c.query('SELECT * FROM fabric.'+table+' WHERE '+where,values)).rows;assert.equal(rows.length,1);
     await c.query('BEGIN');await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ALTER TABLE fabric.'+table+' DISABLE TRIGGER USER');await c.query('DELETE FROM fabric.'+table+' WHERE '+where,values);await c.query('ALTER TABLE fabric.'+table+' ENABLE TRIGGER USER');await c.query('COMMIT');removed=true;
     await deny(()=>read(),['AUTHORITY_UNAVAILABLE']);
    }finally{
     try{
      await c.query('ROLLBACK');
      if(removed){await c.query('BEGIN');await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ALTER TABLE fabric.'+table+' DISABLE TRIGGER USER');await c.query('INSERT INTO fabric.'+table+' SELECT * FROM jsonb_populate_record(NULL::fabric.'+table+',$1::jsonb)',[JSON.stringify(rows[0])]);await c.query('ALTER TABLE fabric.'+table+' ENABLE TRIGGER USER');await c.query('COMMIT');}
     }finally{try{await c.query('ROLLBACK');}finally{c.release();}}
    }
    assert.equal((await read())['id'],id);reads++;
   }
   // Later epochs have no referring entity, so rollback can be observed without
   // disabling a composite FK or weakening the installed owner schema.
   await removeAndRestore('storage_authority_epoch','tenant_id=$1 AND space_id=$2 AND epoch=$3',[...p,anchor.epoch]);
   await removeAndRestore('storage_current_heads','tenant_id=$1 AND space_id=$2 AND id=$3',[...p,id]);
   await removeAndRestore('storage_outbox','tenant_id=$1 AND space_id=$2 AND job_id=$3',[...p,job]);
  });
  await t.test('AUTHORITY/expiry-after-wait',async()=>{
   const blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
   try{
    await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',...p])]);
    pending=f.uow.withScope(f.scope,tx=>a.authority.check(tx,f.scope,'read',new Date(Date.now()+400).toISOString()));
    // Attach rejection immediately; assertion still inspects the real result.
    const refusal=deny(()=>pending!,['EXPIRED_COMMAND']);
    const deadline=Date.now()+1500;let blocked=false;
    while(Date.now()<deadline){blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0 AND wait_event=\'advisory\') AS blocked',[f.roles.controller])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.5)');await blocker.query('COMMIT');await refusal;
    assert.equal((await read())['id'],id);reads++;
   }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
  });
  // A distinct non-member destination payer exercises both authority sides.
  const destinationPayer=f.sharePayer;
  const destination=await f.scopeFor(f.actors[0],f.spaces.share),destinationTask=await f.task('ask',destination),otherId=randomUUID(),otherWitness='sha256:'+createHash('sha256').update(randomUUID()).digest('hex');
  await a.publish(destination,async(c,epoch)=>{
   await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[f.tenant,destination.spaceId,otherId,destinationTask.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,'source',$3,1,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '60s')",[f.tenant,destination.spaceId,otherId,otherWitness,randomUUID(),randomUUID(),epoch]);
  });
  const sourceRef={id,revision:1,sourceTaskId:task.binding.taskId},otherRef={id:otherId,revision:1,sourceTaskId:destinationTask.binding.taskId};
  const forward=await a.share(f.scope,destination,sourceRef),reverse=await a.share(destination,f.scope,otherRef);
  const forwardInput={relationId:forward,source:{id,revision:1,witness}},reverseInput={relationId:reverse,source:{id:otherId,revision:1,witness:otherWitness}};
  const shared=(s:VerifiedScope=destination,input:unknown=forwardInput,repository=a.authority)=>f.uow.withScope(s,tx=>repository.sharedEntity(tx,s,input));
  await t.test('AUTHORITY/shared-live',async()=>{
   const head=await shared();assert.equal(head.id,id);assert.equal(head.space_id,f.spaces.group);assert.equal(head.source_task_id,task.binding.taskId);reads++;
   assert.equal((await shared(f.scope,reverseInput)).id,otherId);reads++;
   const reader=await f.scopeFor(f.actors[2],f.spaces.share);assert.equal((await shared(reader)).id,id);reads++;
   const recreated=new StorageAuthorityRepository({current:async(t,s)=>a.anchors.get(t+'/'+s)},f.native);assert.equal((await shared(destination,forwardInput,recreated)).id,id);reads++;
   assert.equal(await f.uow.withScope(destination,async tx=>(await tx.query('SELECT * FROM fabric.storage_current_heads WHERE space_id=$1',[f.spaces.group])).rows.length),0);
   const scope=await f.uow.withScope(destination,async tx=>{await a.authority.sharedEntity(tx,destination,forwardInput);return (await tx.query('SELECT fabric.current_space() AS space')).rows[0]?.['space'];});assert.equal(scope,destination.spaceId);reads++;
  });
  const foreignScope=await f.scopeFor(f.foreignActor,f.spaces.foreign);
  await t.test('AUTHORITY/shared-negative',async()=>{
   await deny(()=>shared(destination,{...forwardInput,relationId:randomUUID()}),['UNAUTHORIZED']);
   for(const source of [{...forwardInput.source,id:randomUUID()},{...forwardInput.source,revision:2},{...forwardInput.source,witness:'sha256:'+'0'.repeat(64)}])await deny(()=>shared(destination,{...forwardInput,source}),['UNAUTHORIZED','STALE_REVISION']);
   await deny(()=>shared(destination,{...forwardInput,tenantId:f.foreignTenant}),['INVALID_SCHEMA']);
   for(const s of [f.scope,await f.scopeFor(f.actors[0],f.spaces.personal),await f.scopeFor(f.foreignActor,f.spaces.foreign)]){
    await deny(()=>shared(s),['UNAUTHORIZED']);assert.equal(await f.uow.withScope(s,async tx=>(await tx.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0]?.['control']),null);
   }
   const personal=await f.scopeFor(f.actors[0],f.spaces.personal),privateTask=await f.task('ask',personal),privateId=randomUUID();
   await a.publish(personal,async c=>{await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[f.tenant,personal.spaceId,privateId,privateTask.binding.taskId]);});
   await deny(()=>a.share(personal,destination,{id:privateId,revision:1,sourceTaskId:privateTask.binding.taskId}),['23514']);
   await deny(()=>a.share(f.scope,foreignScope,sourceRef),['23514','23503']);
   await deny(()=>a.share(f.scope,destination,{...sourceRef,sourceTaskId:destinationTask.binding.taskId}),['23503']);
  });
  await t.test('AUTHORITY/shared-roles',async()=>{
   const row=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('public',oid,'SELECT') AS public_read FROM pg_class WHERE oid='fabric.storage_shares'::regclass")).rows[0];assert.deepEqual(row,{relrowsecurity:true,relforcerowsecurity:true,public_read:false});
   for(const role of [f.worker,f.idpPool,f.client]){
    await deny(()=>role.query('SELECT * FROM fabric.storage_shares'),['42501']);
    await deny(()=>role.query('SELECT fabric.storage_shared_controls($1)',[forward]),['42501']);
   }
   assert.equal((await f.controller.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0].control,null);
   assert.equal((await f.admin.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0].control,null);
   await deny(()=>f.uow.withScope(destination,tx=>tx.query('DELETE FROM fabric.storage_shares')),['42501']);
   await deny(()=>f.admin.query('DELETE FROM fabric.storage_shares'),['P0001']);
   const functions=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public_execute FROM pg_proc WHERE oid IN('fabric.storage_shared_controls(uuid)'::regprocedure,'fabric.storage_share_append_guard()'::regprocedure)")).rows;
   assert.equal(functions.length,2);for(const r of functions){assert.equal(r.prosecdef,true);assert.deepEqual(r.proconfig,['search_path=pg_catalog, fabric']);assert.equal(r.public_execute,false);}
   assert.equal((await shared()).id,id);reads++;
  });
  await t.test('AUTHORITY/shared-current',async()=>{
   const key=a.key(f.scope),anchor=a.anchors.get(key)!;
   a.anchors.delete(key);await deny(()=>shared(),['AUTHORITY_UNAVAILABLE']);a.anchors.set(key,anchor);
   const unavailable=new StorageAuthorityRepository({current:async(t,s)=>{if(s===f.spaces.group)throw new Error('source witness offline');return a.anchors.get(t+'/'+s);}},f.native);
   await deny(()=>shared(destination,forwardInput,unavailable),['AUTHORITY_UNAVAILABLE']);
   a.anchors.set(key,{...anchor,epoch:anchor.epoch-1});await deny(()=>shared(),['AUTHORITY_UNAVAILABLE']);a.anchors.set(key,anchor);
   await a.publish(f.scope,async c=>{await c.query('INSERT INTO fabric.storage_policy VALUES($1,$2,3,$3::jsonb,$4::jsonb)',[...p,JSON.stringify(a.policy.periods),JSON.stringify(a.policy.operations.filter(o=>o!=='share'))]);},3);
   await deny(()=>shared(),['UNAUTHORIZED']);await a.publish(f.scope,undefined,1);assert.equal((await shared()).id,id);reads++;
   for(const [actor,space] of [[f.actors[3],f.spaces.group],[destinationPayer,f.spaces.share]] as const){
    await f.admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,actor]);
    await deny(()=>shared(),['UNAUTHORIZED','STALE_AUTHORITY','AUDIENCE_DENIED']);
    await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,actor]);
    assert.equal((await shared()).id,id);reads++;assert.ok([f.spaces.group,f.spaces.share].includes(space));
   }
   const originalGrants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.spaces.group,f.actors[1]])).rows[0].grants as unknown;
   for(const grants of [['storage:read'],'task:read']){
    await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.spaces.group,f.actors[1],JSON.stringify(grants)]);
    await deny(()=>shared(),['UNAUTHORIZED','AUDIENCE_DENIED']);
    assert.equal(await f.uow.withScope(destination,async tx=>(await tx.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0]?.['control']),null);
   }
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.spaces.group,f.actors[1],JSON.stringify(originalGrants)]);
   await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.spaces.group,f.actors[1]]);
   await deny(()=>shared(),['UNAUTHORIZED','AUDIENCE_DENIED']);
   assert.equal(await f.uow.withScope(destination,async tx=>(await tx.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0]?.['control']),null);
   await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.spaces.share,f.actors[1]]);
   assert.equal((await shared()).id,id);reads++;
   for(const space of [f.spaces.group,f.spaces.share])await f.admin.query('UPDATE fabric.memberships SET revoked_at=NULL,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,space,f.actors[1]]);
   assert.equal((await shared()).id,id);reads++;
  });
  await t.test('AUTHORITY/shared-lock-order',async()=>{
   // Use two independently authenticated actors for both sharing directions.
   const reverseReader=await f.scopeFor(f.actors[1]);
   for(const order of ['forward-first','reverse-first']){
    const blocker=await f.admin.connect();const pending:Promise<unknown>[]=[];
    try{
     await blocker.query('BEGIN');const first=[f.spaces.group,f.spaces.share].sort()[0]!;
     await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',f.tenant,first])]);
     const start=order==='forward-first'?[()=>shared(),()=>shared(reverseReader,reverseInput)]:[()=>shared(reverseReader,reverseInput),()=>shared()];
     for(let n=0;n<2;n++){
      const promise=start[n]!();promise.catch(()=>{});pending.push(promise);
      const deadline=Date.now()+1200;let waits:Record<string,unknown>[]=[];
      while(Date.now()<deadline){
       // PG statistics snapshots are cached within this blocking transaction.
       // Refresh the observer before checking the second live reader.
       await blocker.query('SELECT pg_stat_clear_snapshot()');
       waits=(await blocker.query("SELECT a.pid,(SELECT count(*)::int FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.granted) AS held FROM pg_stat_activity a WHERE a.usename=$1 AND cardinality(pg_blocking_pids(a.pid))>0 AND a.wait_event='advisory'",[f.roles.controller])).rows;
       if(waits.length===n+1)break;await new Promise(r=>setTimeout(r,10));
      }
      assert.equal(waits.length,n+1,order+' real PG wait');for(const w of waits)assert.equal(w['held'],0,'No second Space barrier held before first');
     }
     await blocker.query('COMMIT');const heads=await Promise.all(pending) as {id:string}[];assert.deepEqual(new Set(heads.map(h=>h.id)),new Set([id,otherId]));reads+=heads.length;
    }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(pending);}
   }
  });
  const accounting=await registerAccountingTests(t,f,a,destination,forwardInput,reverseInput,deny);charges+=accounting.charges;leaks+=accounting.disclosures;
  const publication=await registerEpochTests(t,f,a,deny);reads+=publication.reads;
  const reduction=await registerPolicyTests(t,f,a,deny);reads+=reduction.reads;
  const revocation=await registerSourceTests(t,f,a,deny);reads+=revocation.reads;
  const tombstones=await registerTombstoneTests(t,f,a,deny);reads+=tombstones.reads;
  const forgetWork=await registerForgetWorkTests(t,f,a,deny);reads+=forgetWork.reads;
  const controlReads=await registerControlReadTests(t,f,a,deny);reads+=controlReads.reads;
  const entityReads=await registerEntityReadTests(t,f,a,deny);reads+=entityReads.reads;
  await t.test('AUTHORITY/shared-revocation',async()=>{
   await a.share(f.scope,destination,sourceRef,forward,'revoked');await deny(()=>shared(),['UNAUTHORIZED']);
   await deny(()=>a.share(f.scope,destination,sourceRef,forward,'active'),['23514']);
   assert.equal(await f.uow.withScope(destination,async tx=>(await tx.query('SELECT fabric.storage_shared_controls($1) AS control',[forward])).rows[0]?.['control']),null);
   await a.publish(destination,async(c,epoch)=>{await c.query("INSERT INTO fabric.storage_restrictions VALUES($1,$2,'source',$3,1,$4,'revoked',clock_timestamp())",[f.tenant,destination.spaceId,otherId,epoch]);});
   await deny(()=>shared(f.scope,reverseInput),['RETENTION_RESTRICTED']);
  });
  await t.test('AUTHORITY/remaining-audience',async()=>{
   const removed=await f.scopeFor(f.actors[1]);await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...p,f.actors[1]]);
   await deny(()=>read(removed),['UNAUTHORIZED','STALE_AUTHORITY']);
   assert.equal((await read())['id'],id);reads++;
   const audience=await f.uow.withScope(f.scope,tx=>a.authority.currentAudience(tx,f.scope,task.binding.taskId));assert.equal(audience.recipientActorIds.length,2);assert.ok(!audience.recipientActorIds.includes(f.actors[1]));
   const reader=await f.scopeFor(f.actors[2]);assert.equal((await read(reader))['id'],id);reads++;
  });
  await t.test('AUTHORITY/restriction-session',async()=>{
   await a.publish(f.scope,async(c,epoch)=>{await c.query("INSERT INTO fabric.storage_restrictions VALUES($1,$2,'source',$3,1,$4,'revoked',clock_timestamp())",[...p,id,epoch]);});
   let refused=false;try{await read();restrictedReads++;}catch(e){assert.equal((e as {code:string}).code,'RETENTION_RESTRICTED');refused=true;denials++;}assert.equal(refused,true);
   const binding=f.verifier.bindingFor(f.scope);await f.idpPool.query('SELECT fabric.identity_revoke_session($1,$2,$3)',[binding.issuer,binding.subject,binding.sessionId]);
   await deny(()=>read(),['UNAUTHORIZED','STALE_IDENTITY']);
  });
  const headPublications=await registerHeadTests(t,f,a,deny);reads+=headPublications.reads;
  const sharePublications=await registerSharePublicationTests(t,f,a,deny);reads+=sharePublications.reads;
  assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
  const commands=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE receipt_id=$1',[receipt])).rows[0].n as number;
  const jobs=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_outbox WHERE job_id=$1',[job])).rows[0].n as number;
  const computers=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n as number;
  const settlements=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements')).rows[0].n as number;assert.equal(settlements,charges);assert.equal(charges,6);
  assert.ok(reads>=10);assert.ok(denials>=50);assert.equal(commands,1);assert.equal(jobs,1);assert.equal(computers,0);
  emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'authority',positives:{read:reads,deny:denials,save:0,ask:0,forget:0,restore:0,write:0,conflict:0,propagate:0,backup:0,owner:charges,harness:0},
   violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:Math.abs(commands-1)+Math.abs(jobs-1)+Math.abs(settlements-charges),duplicateCanonicalEffect:Math.max(0,commands-1)+Math.max(0,jobs-1)+Math.max(0,settlements-charges),restrictedResurrection:restrictedReads,askComputerStart:computers}});
 }finally{await f.close();}
});
