import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash,randomUUID } from 'node:crypto';
import pg, { type PoolClient } from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot,type PendingEpoch } from '../../src/epoch-journal.js';
import { HeadPublicationRepository } from '../../src/head-publication.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { HeadMaterialSchema,type HeadMaterial,type HeadMaterialResolver } from '../../src/head-material.js';
import { TombstonePublicationRepository } from '../../src/tombstone-publication.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { EpochPublicationRepository } from '../../src/epoch-publication.js';
import { AuthenticatedUnitOfWork, type AsyncUnitOfWork } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
const classes=['source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup'] as const;
const digest=()=> 'sha256:'+createHash('sha256').update(randomUUID()).digest('hex');
export async function registerHeadTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!,journal=new EpochWitnessJournal(root);
 let scope=await f.scopeFor(f.actors[1],f.spaces.share),task=await f.task('maintenance',scope),reads=0;
 const materialRows=new Map<string,unknown>(),materials:HeadMaterialResolver={resolve:async(_tx,_scope,id)=>materialRows.get(id) as HeadMaterial|undefined};
 const state=()=>journal.state(scope.tenantId,scope.spaceId),repo=(hooks={},uow:AsyncUnitOfWork=f.uow,resolver=materials)=>new HeadPublicationRepository(uow,new EpochWitnessJournal(root),f.native,resolver,hooks);
 const ref=(m:HeadMaterial)=>({class:m.class,id:m.id,revision:m.revision,witness:m.witness});
 const register=(m:unknown)=>{const materialId=randomUUID();materialRows.set(materialId,m);return materialId;};
 const newMaterial=(extra:Partial<HeadMaterial>={})=>HeadMaterialSchema.parse({tenantId:scope.tenantId,spaceId:scope.spaceId,class:'knowledge',id:randomUUID(),revision:1,witness:digest(),keyId:randomUUID(),generation:randomUUID(),sourceTaskId:task.binding.taskId,expiresAt:new Date(Date.now()+50_000).toISOString(),...extra});
 const command=(m=newMaterial(),expected:ReturnType<typeof ref>|null=null)=>({key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),materialId:register(m),expected});
 const read=(m:HeadMaterial,s=scope)=>f.uow.withScope(s,tx=>repo().authority.entity(tx,s,ref(m)));
 const snapshot=async()=>{const rows=[];for(const table of ['storage_entities','storage_current_heads','storage_head_publications','storage_authority_epoch','storage_epoch_publications','storage_commands','storage_outbox','storage_tombstones','storage_restrictions'])rows.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return rows;};
 await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
 const accepted:HeadMaterial[]=[],originals:ReturnType<typeof command>[]=[];
 await t.test('AUTHORITY/head-publication',async()=>{
  const id=randomUUID();for(const cl of classes){const origin=await f.task('ask',scope),m=newMaterial({class:cl,id,sourceTaskId:origin.binding.taskId}),input=command(m),before=(await state())!.anchor;
   const result=await repo().publish(scope,input);assert.equal(result.status,'committed');assert.deepEqual(await repo().lookup(scope,input),result);const anchor=(await state())!.anchor;
   assert.equal(anchor.epoch,before.epoch+1);assert.equal(anchor.policyRevision,before.policyRevision);assert.notEqual(anchor.controlDigest,before.controlDigest);assert.equal((await state())!.pending,null);
   const head=await read(m);assert.equal(head.source_task_id,m.sourceTaskId);assert.equal(head.key_id,m.keyId);assert.equal(head.generation,m.generation);assert.equal(head.witness,m.witness);assert.equal(head.class,m.class);reads+=2;accepted.push(m);originals.push(input);
  }
  const db=await snapshot(),witness=await state();await deny(()=>repo().publish(scope,originals[0]),['IDEMPOTENCY_CONFLICT']);await deny(()=>repo().publish(scope,command(accepted[0])),['STALE_REVISION']);
  await deny(()=>repo().lookup(scope,{...originals[0],materialId:originals[1]!.materialId}),['IDEMPOTENCY_CONFLICT']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications')).rows[0].n,11);
 });
 await t.test('AUTHORITY/head-correction',async()=>{
  for(const index of [0,1]){const old=accepted[index]!,m=newMaterial({...old,revision:2,witness:digest(),keyId:randomUUID(),generation:randomUUID()}),input=command(m,ref(old));assert.equal((await repo().publish(scope,input)).status,'committed');
   await deny(()=>read(old),['STALE_REVISION']);assert.equal((await read(m)).revision,'2');assert.equal((await repo().lookup(scope,originals[index])).status,'committed');reads+=2;accepted[index]=m;
   const db=await snapshot(),witness=await state();await deny(()=>repo().publish(scope,command(newMaterial({...m,revision:3}),ref(old))),['STALE_REVISION']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }
  for(const m of accepted.slice(2)){assert.equal((await read(m)).revision,'1');reads++;}
 });
 await t.test('AUTHORITY/head-negative',async()=>{
  const input=command(),db=await snapshot(),witness=await state();
  for(const bad of [{...input,epoch:99},{...input,keyId:randomUUID()},{...input,sourceTaskId:task.binding.taskId},{...input,expected:{...ref(accepted[0]!),class:'method'}}])await deny(()=>repo().publish(scope,bad),['INVALID_SCHEMA']);
  await deny(()=>repo().publish({...scope} as typeof scope,input),['UNAUTHORIZED']);await deny(()=>repo().publish(scope,{...input,materialId:randomUUID()}),['CONTENT_UNAVAILABLE']);
  await deny(()=>repo({},f.uow,{resolve:async()=>{throw new Error('material owner offline');}}).publish(scope,input),['CONTENT_UNAVAILABLE']);
  for(const bad of [{...newMaterial(),tenantId:f.foreignTenant},{...newMaterial(),spaceId:f.spaces.group},{...newMaterial(),sourceTaskId:randomUUID()},{...newMaterial(),sourceTaskId:(await f.task('ask',await f.scopeFor(f.actors[1],f.spaces.secondary))).binding.taskId},{...newMaterial(),expiresAt:new Date(Date.now()+61_000).toISOString()},{...newMaterial(),expiresAt:new Date(Date.now()-1).toISOString()},{...newMaterial(),class:'method'},{...newMaterial(),sourceTaskId:null},{...newMaterial(),revision:2}]){
   await deny(()=>repo().publish(scope,{...input,key:randomUUID(),materialId:register(bad)}),['UNAUTHORIZED','INVALID_SCHEMA','RETENTION_RESTRICTED','STALE_REVISION']);
  }
  const reader=await f.scopeFor(f.actors[2],scope.spaceId);await deny(()=>repo().publish(reader,input),['UNAUTHORIZED']);
  const ask=await f.task('ask',scope);await deny(()=>repo().publish(scope,{...input,sessionId:ask.binding.sessionId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  await deny(()=>repo().publish(scope,{...input,expiresAt:new Date(Date.now()-1).toISOString()}),['EXPIRED_COMMAND']);
  await deny(()=>repo().refresh(scope,{key:input.key,sessionId:input.sessionId,expiresAt:input.expiresAt}),['REQUIRED_CAPABILITY_UNSUPPORTED']);
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/head-rollback',async()=>{
  for(const phase of ['reserve','publication']){const input=command(),db=await snapshot(),witness=(await state())!.anchor;
   const broken=repo(phase==='reserve'?{afterReserve:async()=>{throw new Error('head reservation interruption');}}:{afterPublication:async(tx:Parameters<HeadMaterialResolver['resolve']>[0])=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}});
   await assert.rejects(broken.publish(scope,input));assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
   await deny(()=>read(accepted[2]!),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,witness);assert.ok(await read(accepted[2]!));reads++;
  }
 });
 await t.test('AUTHORITY/head-partial-write',async()=>{
  const input=command(),m=materialRows.get(input.materialId) as HeadMaterial,db=await snapshot(),witness=(await state())!.anchor;
  // Owned reproducible fixture fault after entity insertion, before head insert.
  await f.admin.query(`CREATE FUNCTION fabric.storage_head_test_fault() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.id='${m.id}'::uuid THEN RAISE EXCEPTION 'synthetic head insertion interruption';END IF;RETURN NEW;END $$`);
  await f.admin.query('CREATE TRIGGER storage_head_test_fault BEFORE INSERT ON fabric.storage_current_heads FOR EACH ROW EXECUTE FUNCTION fabric.storage_head_test_fault()');
  try{await deny(()=>repo().publish(scope,input),['P0001']);assert.deepEqual(await snapshot(),db);}finally{await f.admin.query('DROP TRIGGER storage_head_test_fault ON fabric.storage_current_heads');await f.admin.query('DROP FUNCTION fabric.storage_head_test_fault()');}
  assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,witness);reads++;
 });
 await t.test('AUTHORITY/head-ack-gap',async()=>{
  const m=newMaterial(),input=command(m);await assert.rejects(repo({beforeWitnessAck:async()=>{throw new Error('head ACK interruption');}}).publish(scope,input),{message:'head ACK interruption'});
  const witness=await state(),db=await snapshot();assert.ok(witness?.pending);await deny(()=>read(m),['AUTHORITY_UNAVAILABLE']);
  const blocker=await f.admin.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
   const pending=repo().lookup(scope,input);pending.catch(()=>{});await observeWait(blocker,1);assert.deepEqual(await pending,{status:'unknown',replayAllowed:false});assert.deepEqual(await state(),witness);assert.deepEqual(await snapshot(),db);
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const c=await f.admin.connect(),replace=async(id:string)=>{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_head_publications DISABLE TRIGGER USER');await c.query('UPDATE fabric.storage_head_publications SET material_id=$2 WHERE command_key=$1',[input.key,id]);await c.query('ALTER TABLE fabric.storage_head_publications ENABLE TRIGGER USER');await c.query('COMMIT');};
  try{await replace(randomUUID());await deny(()=>repo().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await state(),witness);}finally{await c.query('ROLLBACK');await replace(input.materialId);c.release();}
  // Lookup uses durable controls; it never consults the unavailable staged owner.
  materialRows.delete(input.materialId);assert.equal((await repo().lookup(scope,input)).status,'committed');assert.ok(await read(m));await deny(()=>new EpochPublicationRepository(f.uow,journal,f.native).lookup(scope,{key:input.key,sessionId:input.sessionId,expiresAt:input.expiresAt}),['IDEMPOTENCY_CONFLICT']);reads+=2;
 });
 await t.test('AUTHORITY/head-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000}),transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),m=newMaterial(),input=command(m),db=await snapshot(),before=(await state())!.anchor;
    await deny(()=>repo({},uow).publish(scope,input),['UNKNOWN_COMMIT']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>read(m),['AUTHORITY_UNAVAILABLE']);
    assert.equal((await repo().lookup(scope,input)).status,mode==='commit'?'committed':'absent-safe');
    if(mode==='commit'){assert.equal(proxy.dropped(),1);assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.ok(await read(m));}
    else{assert.equal(proxy.requestsDropped(),1);assert.equal(proxy.dropped(),0);assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);await deny(()=>read(m),['STALE_REVISION']);}reads++;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('AUTHORITY/head-concurrency',async()=>{
  const old=accepted[2]!,m=newMaterial({...old,revision:2,witness:digest()}),other=newMaterial({...m,witness:digest()}),input=command(m,ref(old)),competingInput=command(other,ref(old)),before=(await state())!.anchor;
  let hit!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
  const publishing=repo({afterPublication:async()=>{hit();await gate;},beforeWitnessAck:async()=>{throw new Error('head concurrent ACK gap');}}).publish(scope,input);
  const publicationGap=assert.rejects(publishing,{message:'head concurrent ACK gap'});publicationGap.catch(()=>{});await Promise.race([reached,publishing.then(()=>{throw new Error('Head passed gate');})]);
  const lookup=repo().lookup(scope,input);lookup.catch(()=>{});let competing:Promise<void>|undefined;
  const c=await f.admin.connect();try{
   // Observe recovery enqueued first, then the conflicting writer. The explicit
   // ACK gap prevents a third coordinator from racing these two actual waiters.
   await observeWait(c,1);competing=deny(()=>repo().publish(scope,competingInput),['STALE_REVISION']);competing.catch(()=>{});await observeWait(c,2);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
  }finally{c.release();release();}
  await publicationGap;assert.equal((await lookup).status,'committed');await competing;assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_current_heads WHERE space_id=$1 AND class=$2 AND id=$3 AND revision=2',[scope.spaceId,m.class,m.id])).rows[0].n,1);
  assert.deepEqual(await repo().lookup(scope,competingInput),{status:'absent-safe'});assert.equal((await read(m)).witness,m.witness);await deny(()=>read(other),['STALE_REVISION']);accepted[2]=m;reads++;
 });
 await t.test('AUTHORITY/head-expiry',async()=>{
  for(const kind of ['command','material']){const m=newMaterial(kind==='material'?{expiresAt:new Date(Date.now()+350).toISOString()}:{}),input=command(m);if(kind==='command')input.expiresAt=new Date(Date.now()+350).toISOString();
   const db=await snapshot(),before=(await state())!.anchor;await deny(()=>repo({afterPublication:async(tx:Parameters<HeadMaterialResolver['resolve']>[0])=>{await tx.query('SELECT pg_sleep(0.4)');}}).publish(scope,input),[kind==='command'?'EXPIRED_COMMAND':'RETENTION_RESTRICTED']);assert.deepEqual(await snapshot(),db);
   assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);reads++;
  }
  const m=newMaterial({expiresAt:new Date(Date.now()+350).toISOString()}),input=command(m),db=await snapshot(),witness=await state(),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);pending=deny(()=>repo().publish(scope,input),['RETENTION_RESTRICTED']);pending.catch(()=>{});await observeWait(blocker,1);await blocker.query('SELECT pg_sleep(0.4)');await blocker.query('COMMIT');await pending;}finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
  assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/head-roles',async()=>{
  const input=command(),m=materialRows.get(input.materialId),before=(await state())!.anchor,db=await snapshot(),witness=await state();
  const sql='SELECT fabric.storage_publish_head($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)',args=[input.key,digest(),input.sessionId,before.epoch,before.anchorId,randomUUID(),before.controlDigest,digest(),input.materialId,JSON.stringify(m),'null',new Date().toISOString(),input.expiresAt];
  for(const role of [f.worker,f.idpPool,f.client]){await deny(()=>role.query('SELECT * FROM fabric.storage_head_publications'),['42501']);await deny(()=>role.query(sql,args),['42501']);}
  await deny(()=>f.controller.query(sql,args),['42501']);await deny(()=>f.admin.query(sql,args),['42501']);const forged=[...args];forged[9]=JSON.stringify({...m as HeadMaterial,sourceTaskId:randomUUID()});await deny(()=>f.uow.withScope(scope,tx=>tx.query(sql,forged)),['42501']);
  await deny(()=>f.uow.withScope(scope,tx=>tx.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,1,$5)',[scope.tenantId,scope.spaceId,'knowledge',randomUUID(),task.binding.taskId])),['42501']);
  for(const table of ['storage_head_publications','storage_entities','storage_current_heads'])for(const sql of ['UPDATE fabric.'+table+' SET space_id=space_id','DELETE FROM fabric.'+table])await deny(()=>f.admin.query(sql),['P0001']);
  const table=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'SELECT') AS read,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_head_publications'::regclass")).rows[0];assert.deepEqual(Object.values(table),[true,true,true,false]);
  const fn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_publish_head'")).rows[0];assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);
  for(const role of [f.worker,f.idpPool,f.client])await deny(()=>role.query('SELECT fabric.storage_shared_controls_v2($1)',[randomUUID()]),['42501']);
  assert.equal((await f.controller.query('SELECT fabric.storage_shared_controls_v2($1) AS control',[randomUUID()])).rows[0].control,null);assert.equal((await f.admin.query('SELECT fabric.storage_shared_controls_v2($1) AS control',[randomUUID()])).rows[0].control,null);
  const bridgeFn=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname='storage_shared_controls_v2'")).rows[0];assert.equal(bridgeFn.prosecdef,true);assert.deepEqual(bridgeFn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(bridgeFn.public,false);
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='fabric.storage_head_publications'::regclass AND contype='f'")).rows[0].n,4);
  const c=await f.admin.connect();try{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_head_publications DISABLE TRIGGER USER');await deny(()=>c.query('UPDATE fabric.storage_head_publications SET source_task_id=$1 WHERE command_key=$2',[task.binding.taskId,originals[0]!.key]),['23503']);}finally{await c.query('ROLLBACK');c.release();}
  assert.equal((await f.controller.query('SELECT * FROM fabric.storage_head_publications')).rows.length,0);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/head-audience-wait',async()=>{
  const m=newMaterial(),input=command(m),params=[scope.tenantId,scope.spaceId,f.actors[2]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[],db=await snapshot(),witness=await state(),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;pending=deny(()=>repo().publish(scope,input),['AUDIENCE_DENIED']);pending.catch(()=>{});await observeWait(blocker,1,pid);await blocker.query('COMMIT');await pending;
   await deny(()=>repo().lookup(scope,originals[0]),['AUDIENCE_DENIED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
  assert.equal((await repo().publish(scope,input)).status,'committed');assert.ok(await read(m));reads++;
 });
 await t.test('AUTHORITY/head-restricted-reuse',async()=>{
  for(const cl of ['source','knowledge'] as const){const m=newMaterial({class:cl}),input=command(m);assert.equal((await repo().publish(scope,input)).status,'committed');
   const restriction={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()};
   if(cl==='source')assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,{...restriction,source:{id:m.id,revision:m.revision,witness:m.witness}})).status,'committed');
   else assert.equal((await new TombstonePublicationRepository(f.uow,journal,f.native).forget(scope,{...restriction,entity:ref(m)})).status,'committed');
   const db=await snapshot(),witness=await state();await deny(()=>repo().publish(scope,command(newMaterial({...m,revision:2}),ref(m))),['RETENTION_RESTRICTED']);await deny(()=>repo().publish(scope,command(m)),['STALE_REVISION']);
   assert.equal((await repo().lookup(scope,input)).status,'committed');assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);reads++;
  }
 });
 await t.test('AUTHORITY/head-shared-controls',async()=>{
  const destination=await f.scopeFor(f.actors[2]),route=(await f.admin.query('SELECT * FROM fabric.storage_shares WHERE tenant_id=$1 AND source_space_id=$2 AND destination_space_id=$3 AND status=\'active\' ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId,destination.spaceId])).rows[0];assert.ok(route);
  const head=(await f.admin.query("SELECT * FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class='source' AND id=$3 AND revision=$4",[scope.tenantId,scope.spaceId,route.source_id,route.source_revision])).rows[0];assert.ok(head);
  const repository=new StorageAuthorityRepository({current:async(t,s)=>s===scope.spaceId?journal.current(t,s):a.anchors.get(t+'/'+s)},f.native);
  const bridge=await f.uow.withScope(destination,async tx=>(await tx.query('SELECT fabric.storage_shared_controls_v2($1) AS control',[route.relation_id])).rows[0]?.['control']) as {controls:Record<string,unknown>[][];epoch:Record<string,unknown>};
  assert.ok(bridge);assert.equal(bridge.epoch['control_digest'],(await state())!.anchor.controlDigest,'Bridge returns latest source epoch');
  const legacy=await f.uow.withScope(destination,async tx=>(await tx.query('SELECT fabric.storage_shared_controls($1) AS control',[route.relation_id])).rows[0]?.['control']) as typeof bridge;
  assert.ok(legacy);assert.ok((await state())!.anchor.epoch>=10);assert.equal(Number(legacy.epoch['epoch']),9,'Original installed v1 text ordering is preserved as the failed reproduction');assert.notEqual(legacy.epoch['control_digest'],bridge.epoch['control_digest']);
  const direct:Record<string,unknown>[][]=[];
  await f.uow.withScope(scope,async tx=>{
   const anchor=await repo().authority.check(tx,scope,'read');assert.deepEqual(anchor,(await state())!.anchor);
   for(const sql of [
    'SELECT kind FROM fabric.storage_rooms WHERE tenant_id=$1 AND space_id=$2',
    'SELECT revision,periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',
    'SELECT class,id,revision,witness,key_id,generation,epoch,accepted_at,expires_at FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,revision',
    'SELECT class,id,revision,epoch,command_key,at FROM fabric.storage_tombstones WHERE tenant_id=$1 AND space_id=$2 ORDER BY class,id,revision',
    'SELECT source_id,source_revision,epoch,kind,at FROM fabric.storage_restrictions WHERE tenant_id=$1 AND space_id=$2 ORDER BY source_id,source_revision,kind',
    'SELECT actor_id,command_key,binding_digest,receipt_id,epoch,at FROM fabric.storage_commands WHERE tenant_id=$1 AND space_id=$2 ORDER BY actor_id,command_key',
    'SELECT job_id,actor_id,command_key,class,target_id,target_revision,epoch,at FROM fabric.storage_outbox WHERE tenant_id=$1 AND space_id=$2 ORDER BY job_id',
    'SELECT relation_id,revision,source_space_id,source_id,source_revision,source_task_id,status,source_epoch,destination_epoch FROM fabric.storage_shares WHERE tenant_id=$1 AND destination_space_id=$2 ORDER BY relation_id,revision'
   ])direct.push((await tx.query(sql+' LIMIT 513',sql.includes('$3')?[scope.tenantId,scope.spaceId,anchor.policyRevision]:[scope.tenantId,scope.spaceId])).rows);
  });
  const normalized=bridge.controls.map(rows=>rows.map(row=>{const copy={...row};for(const field of ['at','accepted_at','expires_at'])if(field in copy)copy[field]=new Date(copy[field] as string);return copy;}));
  for(let n=0;n<direct.length;n++){assert.deepEqual(normalized[n],direct[n],'Installed sharing JSON projection '+n+' equals current scoped PG controls');assert.equal(JSON.stringify(normalized[n]),JSON.stringify(direct[n]),'Projection preserves exact historical field order and bytes');}
  // The earlier unchanged lifecycle child restricted this source. New all-class
  // head controls must still hash exactly through the installed SQL JSON bridge.
  await deny(()=>f.uow.withScope(destination,tx=>repository.sharedEntity(tx,destination,{relationId:route.relation_id,source:{id:head.id,revision:Number(head.revision),witness:head.witness}})),['RETENTION_RESTRICTED']);
  assert.equal((await repo().lookup(scope,originals[0])).status,'committed');reads++;
 });
 await t.test('AUTHORITY/head-grant-wait',async()=>{
  const input=command(),params=[scope.tenantId,scope.spaceId,scope.actorId],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[],db=await snapshot(),witness=await state(),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='storage:write'))]);const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;pending=deny(()=>repo().publish(scope,input),['STALE_AUTHORITY','UNAUTHORIZED']);pending.catch(()=>{});await observeWait(blocker,1,pid);await blocker.query('COMMIT');await pending;
   const fresh=await f.scopeFor(f.actors[1],scope.spaceId);await deny(()=>repo().publish(fresh,input),['UNAUTHORIZED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);scope=await f.scopeFor(f.actors[1],scope.spaceId);}
  await deny(()=>repo().publish(scope,input),['42501']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);task=await f.task('maintenance',scope);assert.equal((await repo().publish(scope,command())).status,'committed');reads++;
 });
 await t.test('AUTHORITY/head-journal-branches',async()=>{
  const previous=(await state())!.anchor,m=newMaterial(),input=command(m),base={schemaVersion:6,kind:'head-publication',actorId:scope.actorId,key:input.key,binding:digest(),sessionId:input.sessionId,expiresAt:input.expiresAt,previous,next:{...previous,epoch:previous.epoch+1,anchorId:randomUUID(),controlDigest:digest()},materialId:input.materialId,material:m,expected:null,at:new Date().toISOString()},witness=await state();
  for(const bad of [{...base,next:{...base.next,policyRevision:previous.policyRevision+1}},{...base,next:{...base.next,controlDigest:previous.controlDigest}},{...base,material:{...m,revision:2}},{...base,material:{...m,tenantId:f.foreignTenant}},{...base,expected:ref(accepted[0]!)},{...base,kind:'restore'}])await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,bad as PendingEpoch),['INVALID_SCHEMA']);assert.deepEqual(await state(),witness);
  const status=await f.native.snapshot(scope,task.binding.sessionId);await f.native.stop(scope,{sessionId:task.binding.sessionId,key:randomUUID(),observedRevision:status.revision,expiresAt:new Date(Date.now()+30_000).toISOString()});
  const db=await snapshot();await deny(()=>repo().lookup(scope,input),['STALE_FENCE']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);return {reads};
 async function observeWait(c:PoolClient,expected:number,pid?:number){
  let waits=0,direct=false;const deadline=Date.now()+1500;while(Date.now()<deadline){await c.query('SELECT pg_stat_clear_snapshot()');const row=(await c.query('SELECT count(*)::int AS n,bool_or($2::int=ANY(pg_blocking_pids(pid))) AS direct FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',[f.roles.controller,pid??-1])).rows[0];waits=row.n;direct=row.direct===true;if(waits===expected&&(!pid||direct))break;await new Promise(r=>setTimeout(r,10));}assert.equal(waits,expected,'Real PG wait count');if(pid)assert.equal(direct,true,'Exact fixture blocker');
 }
}
