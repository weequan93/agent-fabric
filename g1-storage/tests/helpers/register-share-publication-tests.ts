import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash,randomUUID } from 'node:crypto';
import { rename,rmdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg,{type PoolClient} from 'pg';
import { EpochWitnessJournal,type OwnedAnchorRoot,type PendingEpoch } from '../../src/epoch-journal.js';
import { SharePublicationRepository } from '../../src/share-publication.js';
import { ShareMaterialSchema,type ShareMaterial,type ShareMaterialResolver } from '../../src/share-material.js';
import { HeadPublicationRepository } from '../../src/head-publication.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { AuthenticatedUnitOfWork,type AsyncUnitOfWork } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
const digest=()=> 'sha256:'+createHash('sha256').update(randomUUID()).digest('hex');
export async function registerSharePublicationTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
 let scope=await f.scopeFor(f.actors[1],f.spaces.pending),native=await f.task('maintenance',scope);
 const sourceScope=await f.scopeFor(f.actors[1],f.spaces.lifecycle),sourceNative=await f.task('maintenance',sourceScope);
 const rows=new Map<string,unknown>(),materials:ShareMaterialResolver={resolve:async(_tx,_scope,id)=>rows.get(id) as ShareMaterial|undefined};let reads=0;
 const repo=(hooks={},uow:AsyncUnitOfWork=f.uow,resolver=materials)=>new SharePublicationRepository(uow,new EpochWitnessJournal(root),f.native,resolver,hooks);
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const snapshot=async()=>{const r=[];for(const table of ['storage_shares','storage_share_publications','storage_authority_epoch','storage_epoch_publications'])r.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,'+(table==='storage_shares'?'destination_space_id,relation_id,revision':'space_id'))).rows);return r;};
 const seed=async(s=sourceScope,task=sourceNative,expiresAt=new Date(Date.now()+50_000).toISOString())=>{
  const materialId=randomUUID(),m={tenantId:s.tenantId,spaceId:s.spaceId,class:'source' as const,id:randomUUID(),revision:1,witness:digest(),keyId:randomUUID(),generation:randomUUID(),sourceTaskId:task.binding.taskId,expiresAt};
  const publisher=new HeadPublicationRepository(f.uow,journal,f.native,{resolve:async()=>m});assert.equal((await publisher.publish(s,{key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),materialId,expected:null})).status,'committed');return m;
 };
 let source=await seed();
 const material=(extra:Partial<ShareMaterial>={})=>ShareMaterialSchema.parse({tenantId:scope.tenantId,destinationSpaceId:scope.spaceId,relationId:randomUUID(),sourceSpaceId:sourceScope.spaceId,source:{id:source.id,revision:1,witness:source.witness},...extra});
 const command=(m:unknown=material())=>{const materialId=randomUUID();rows.set(materialId,m);return {key:randomUUID(),sessionId:native.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),materialId};};
 const read=async(m:ShareMaterial,s=scope)=>f.uow.withScope(s,tx=>repo().authority.sharedEntity(tx,s,{relationId:m.relationId,source:m.source}));
 let original:ReturnType<typeof command>,accepted:ShareMaterial;
 await t.test('AUTHORITY/share-publication',async()=>{
  accepted=material();original=command(accepted);const before=(await state())!.anchor,sourceBefore=await journal.state(sourceScope.tenantId,sourceScope.spaceId);
  const result=await repo().publish(scope,original);assert.equal(result.status,'committed');assert.deepEqual(await repo().lookup(scope,original),result);assert.equal((await state())!.anchor.epoch,before.epoch+1);assert.notEqual((await state())!.anchor.controlDigest,before.controlDigest);assert.deepEqual(await journal.state(sourceScope.tenantId,sourceScope.spaceId),sourceBefore);
  const reader=await f.scopeFor(f.actors[2],scope.spaceId);assert.equal((await read(accepted,reader)).id,source.id);assert.equal((await read(accepted)).source_task_id,source.sourceTaskId);reads+=4;
  const marker=(await f.admin.query('SELECT * FROM fabric.storage_share_publications WHERE command_key=$1',[original.key])).rows[0];assert.equal(marker.source_id,source.id);assert.equal(marker.source_epoch,String(sourceBefore!.anchor.epoch));assert.equal(marker.destination_epoch,String(before.epoch+1));assert.equal(marker.revision,'1');
  const db=await snapshot(),witness=await state();await deny(()=>repo().publish(scope,original),['IDEMPOTENCY_CONFLICT']);await deny(()=>repo().publish(scope,command(accepted)),['STALE_REVISION']);await deny(()=>repo().lookup(scope,{...original,materialId:randomUUID()}),['IDEMPOTENCY_CONFLICT']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/share-publication-anchor-loss',async()=>{
  const path=resolve(root.path,scope.tenantId,sourceScope.spaceId),held=resolve(root.path,scope.tenantId,'.hold-'+randomUUID()),before=await journal.state(sourceScope.tenantId,sourceScope.spaceId),db=await snapshot(),witness=await state();
  await rename(path,held);try{
   assert.equal(await journal.current(scope.tenantId,sourceScope.spaceId),undefined);
   await deny(()=>repo().publish(scope,command()),['AUTHORITY_UNAVAILABLE']);await deny(()=>repo().lookup(scope,original),['AUTHORITY_UNAVAILABLE']);await deny(()=>read(accepted),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await rmdir(path);await rename(held,path);}
  assert.deepEqual(await journal.state(sourceScope.tenantId,sourceScope.spaceId),before);assert.equal((await repo().lookup(scope,original)).status,'committed');assert.equal((await read(accepted)).id,source.id);reads+=2;
 });
 await t.test('AUTHORITY/share-publication-negative',async()=>{
  const input=command(),db=await snapshot(),witness=await state();
  for(const bad of [{...input,sourceSpaceId:sourceScope.spaceId},{...input,epoch:5},{...input,relationId:accepted.relationId}])await deny(()=>repo().publish(scope,bad),['INVALID_SCHEMA']);
  await deny(()=>repo().publish({...scope} as typeof scope,input),['UNAUTHORIZED']);await deny(()=>repo().publish(scope,{...input,materialId:randomUUID()}),['CONTENT_UNAVAILABLE']);await deny(()=>repo({},f.uow,{resolve:async()=>{throw new Error('Share material offline');}}).publish(scope,input),['CONTENT_UNAVAILABLE']);
  for(const m of [{...material(),tenantId:f.foreignTenant},{...material(),destinationSpaceId:f.spaces.group},{...material(),sourceSpaceId:f.spaces.foreign},{...material(),sourceSpaceId:scope.spaceId},{...material(),sourceSpaceId:f.spaces.personal},{...material(),source:{...material().source,id:randomUUID()}},{...material(),source:{...material().source,witness:digest()}},{...material(),source:{...material().source,revision:2}},{...material(),sourceTaskId:source.sourceTaskId}])await deny(()=>repo().publish(scope,command(m)),['UNAUTHORIZED','STALE_REVISION','INVALID_SCHEMA']);
  const reader=await f.scopeFor(f.actors[2],scope.spaceId);await deny(()=>repo().publish(reader,input),['UNAUTHORIZED']);const ask=await f.task('ask',scope);await deny(()=>repo().publish(scope,{...input,sessionId:ask.binding.sessionId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);await deny(()=>repo().publish(scope,{...input,expiresAt:new Date(Date.now()-1).toISOString()}),['EXPIRED_COMMAND']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
 });
 await t.test('AUTHORITY/share-publication-rollback',async()=>{
  for(const phase of ['reserve','publication']){const input=command(),db=await snapshot(),before=(await state())!.anchor;await assert.rejects(repo(phase==='reserve'?{afterReserve:async()=>{throw new Error('share reservation gap');}}:{afterPublication:async(tx:Parameters<ShareMaterialResolver['resolve']>[0])=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_share_publications WHERE command_key=$1',[input.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}}).publish(scope,input));
   assert.deepEqual(await snapshot(),db);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);reads++;
  }
  const input=command(),db=await snapshot(),before=await state();await f.admin.query(`CREATE FUNCTION fabric.storage_test_share_interrupt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'after share before epoch' USING ERRCODE='23514'; END $$;CREATE TRIGGER storage_test_share_interrupt AFTER INSERT ON fabric.storage_shares FOR EACH ROW EXECUTE FUNCTION fabric.storage_test_share_interrupt()`);
  try{await deny(()=>repo().publish(scope,input),['23514']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before!.anchor);}finally{await f.admin.query('DROP TRIGGER storage_test_share_interrupt ON fabric.storage_shares;DROP FUNCTION fabric.storage_test_share_interrupt()');}
 });
 await t.test('AUTHORITY/share-publication-ack-gap',async()=>{
  const input=command(),m=rows.get(input.materialId) as ShareMaterial;await assert.rejects(repo({beforeWitnessAck:async()=>{throw new Error('share ACK gap');}}).publish(scope,input),{message:'share ACK gap'});const witness=await state();assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await deny(()=>read(accepted),['AUTHORITY_UNAVAILABLE']);
  const blocker=await f.admin.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,[scope.spaceId,sourceScope.spaceId].sort()[0]])]);const lookup=repo().lookup(scope,input);lookup.catch(()=>{});await wait(blocker,1);assert.deepEqual(await lookup,{status:'unknown',replayAllowed:false});assert.deepEqual(await state(),witness);}finally{await blocker.query('ROLLBACK');blocker.release();}
  const c=await f.admin.connect(),replace=async(id:string)=>{await c.query('BEGIN');await c.query('ALTER TABLE fabric.storage_share_publications DISABLE TRIGGER USER');await c.query('UPDATE fabric.storage_share_publications SET material_id=$2 WHERE command_key=$1',[input.key,id]);await c.query('ALTER TABLE fabric.storage_share_publications ENABLE TRIGGER USER');await c.query('COMMIT');};
  try{await replace(randomUUID());await deny(()=>repo().lookup(scope,input),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await state(),witness);}finally{await c.query('ROLLBACK');await replace(input.materialId);c.release();}
  rows.delete(input.materialId);assert.equal((await repo({},f.uow,{resolve:async()=>{throw new Error('owner unavailable');}}).lookup(scope,input)).status,'committed');assert.equal((await read(m)).id,m.source.id);reads+=2;
 });
 await t.test('AUTHORITY/share-publication-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000}),transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)}),input=command(),db=await snapshot(),before=(await state())!.anchor;await deny(()=>repo({},uow).publish(scope,input),['UNKNOWN_COMMIT']);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.equal((await repo().lookup(scope,input)).status,mode==='commit'?'committed':'absent-safe');if(mode==='commit'){assert.equal(proxy.dropped(),1);assert.equal((await state())!.anchor.epoch,before.epoch+1);}else{assert.equal(proxy.requestsDropped(),1);assert.deepEqual(await snapshot(),db);assert.deepEqual((await state())!.anchor,before);}reads++;
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('AUTHORITY/share-publication-lock-order',async()=>{
  const reverseSource=await seed(scope,native),reverseMaterial=ShareMaterialSchema.parse({tenantId:scope.tenantId,destinationSpaceId:sourceScope.spaceId,sourceSpaceId:scope.spaceId,relationId:randomUUID(),source:{id:reverseSource.id,revision:1,witness:reverseSource.witness}});
  const reverseCommand=()=>({...command({...reverseMaterial,relationId:randomUUID()}),sessionId:sourceNative.binding.sessionId});
  for(const order of ['forward-first','reverse-first']){const blocker=await f.admin.connect(),forward=command(),reverse=reverseCommand(),ops=order==='forward-first'?[[scope,forward],[sourceScope,reverse]] as const:[[sourceScope,reverse],[scope,forward]] as const;const promises:Promise<unknown>[]=[];
   try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,[scope.spaceId,sourceScope.spaceId].sort()[0]])]);
    for(let n=0;n<2;n++){const [s,input]=ops[n]!,p=repo().publish(s,input);p.catch(()=>{});promises.push(p);await wait(blocker,n+1);const held=(await blocker.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND granted AND pid IN(SELECT pid FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0)",[f.roles.controller])).rows[0].n;assert.equal(held,0,'Both directions wait on first sorted barrier');}await blocker.query('COMMIT');
    const results=await Promise.allSettled(promises);for(let n=0;n<results.length;n++){const result=results[n]!,[s,input]=ops[n]!;if(result.status==='rejected'){assert.equal((result.reason as {code:string}).code,'AUTHORITY_UNAVAILABLE');const lookup=await repo().lookup(s,input);if(lookup.status==='absent-safe')assert.equal((await repo().publish(s,input)).status,'committed');else assert.equal(lookup.status,'committed');}else assert.equal((result.value as {status:string}).status,'committed');reads++;}
   }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(promises);}
  }
 });
 await t.test('AUTHORITY/share-publication-expiry',async()=>{
  const input={...command(),expiresAt:new Date(Date.now()+350).toISOString()},db=await snapshot(),before=(await state())!.anchor;await deny(()=>repo({afterPublication:async(tx:Parameters<ShareMaterialResolver['resolve']>[0])=>{await tx.query('SELECT pg_sleep(0.4)');}}).publish(scope,input),['EXPIRED_COMMAND']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await repo().lookup(scope,input),{status:'absent-safe'});assert.deepEqual((await state())!.anchor,before);
  const short=await seed(sourceScope,sourceNative,new Date(Date.now()+350).toISOString()),m=material({source:{id:short.id,revision:1,witness:short.witness}}),expiring=command(m),blocker=await f.admin.connect(),witness=await state(),prior=await snapshot();let pending:Promise<unknown>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,[scope.spaceId,sourceScope.spaceId].sort()[0]])]);pending=deny(()=>repo().publish(scope,expiring),['RETENTION_RESTRICTED']);pending.catch(()=>{});await wait(blocker,1);await blocker.query('SELECT pg_sleep(0.4)');await blocker.query('COMMIT');await pending;}finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}assert.deepEqual(await snapshot(),prior);assert.deepEqual(await state(),witness);reads++;
 });
 await t.test('AUTHORITY/share-publication-roles',async()=>{
  for(const role of [f.worker,f.idpPool,f.client]){await deny(()=>role.query('SELECT * FROM fabric.storage_share_publications'),['42501']);await deny(()=>role.query('SELECT fabric.storage_share_candidate($1,$2,1)',[sourceScope.spaceId,source.id]),['42501']);await deny(()=>role.query('SELECT fabric.storage_publish_share($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,1,$13)',[randomUUID(),digest(),native.binding.sessionId,randomUUID(),randomUUID(),digest(),digest(),randomUUID(),randomUUID(),sourceScope.spaceId,source.id,source.witness,new Date(Date.now()+30000).toISOString()]),['42501']);}
  for(const role of [f.admin,f.controller])assert.equal((await role.query('SELECT fabric.storage_share_candidate($1,$2,1) AS c',[sourceScope.spaceId,source.id])).rows[0].c,null);
  for(const table of ['storage_share_publications','storage_shares'])for(const statement of ['UPDATE fabric.'+table+' SET tenant_id=tenant_id','DELETE FROM fabric.'+table])await deny(()=>f.admin.query(statement),['P0001']);
  await deny(()=>f.uow.withScope(scope,tx=>tx.query('INSERT INTO fabric.storage_share_publications SELECT * FROM fabric.storage_share_publications')),['42501']);assert.equal((await f.controller.query('SELECT * FROM fabric.storage_share_publications')).rows.length,0);
  const c=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,has_table_privilege('fabric_controller',oid,'INSERT') AS insert FROM pg_class WHERE oid='fabric.storage_share_publications'::regclass")).rows[0];assert.deepEqual(Object.values(c),[true,true,false]);
  const fns=(await f.admin.query("SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE proname IN('storage_publish_share','storage_share_candidate')")).rows;assert.equal(fns.length,2);for(const fn of fns){assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public,false);}assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='fabric.storage_share_publications'::regclass AND contype='f'")).rows[0].n,3);
 });
 await t.test('AUTHORITY/share-publication-current-audience',async()=>{
  for(const side of [sourceScope.spaceId,scope.spaceId]){const params=[scope.tenantId,side,f.actors[2]],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[],input=command(),db=await snapshot(),witness=await state(),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
   try{await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='task:read'))]);pending=deny(()=>repo().publish(scope,input),['UNAUTHORIZED','AUDIENCE_DENIED']);pending.catch(()=>{});await wait(blocker,1);await blocker.query('COMMIT');await pending;await deny(()=>repo().lookup(scope,original),['UNAUTHORIZED','AUDIENCE_DENIED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
   }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
   assert.equal((await repo().publish(scope,input)).status,'committed');reads++;
  }
  // Source publisher permission is independent of destination permission.
  const params=[scope.tenantId,sourceScope.spaceId,scope.actorId],grants=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[],db=await snapshot(),witness=await state();
  try{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants.filter(g=>g!=='storage:share'))]);await deny(()=>repo().publish(scope,command()),['UNAUTHORIZED']);await deny(()=>repo().lookup(scope,original),['UNAUTHORIZED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);}finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(grants)]);}
 });
 await t.test('AUTHORITY/share-publication-source-restriction',async()=>{
  // A fresh native binding follows the genuine source membership revision change.
  const s=await f.scopeFor(f.actors[1],sourceScope.spaceId),task=await f.task('maintenance',s),input=command();assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(s,{key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),source:{id:source.id,revision:1,witness:source.witness}})).status,'committed');
  const db=await snapshot(),witness=await state();await deny(()=>repo().publish(scope,input),['RETENTION_RESTRICTED']);await deny(()=>read(accepted),['RETENTION_RESTRICTED']);assert.equal((await repo().lookup(scope,original)).status,'committed');assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);reads++;
 });
 await t.test('AUTHORITY/share-publication-journal-branches',async()=>{
  const before=(await state())!.anchor,m=material(),input=command(m),sourceAnchor=(await journal.current(sourceScope.tenantId,sourceScope.spaceId))!,base={schemaVersion:7,kind:'share-publication',actorId:scope.actorId,key:input.key,binding:digest(),sessionId:input.sessionId,expiresAt:input.expiresAt,previous:before,next:{...before,epoch:before.epoch+1,anchorId:randomUUID(),controlDigest:digest()},materialId:input.materialId,material:m,sourceTaskId:source.sourceTaskId,sourceAnchor},witness=await state();
  for(const bad of [{...base,next:{...base.next,controlDigest:before.controlDigest}},{...base,next:{...base.next,policyRevision:before.policyRevision+1}},{...base,material:{...m,sourceSpaceId:scope.spaceId}},{...base,material:{...m,tenantId:f.foreignTenant}},{...base,kind:'restore'},{...base,sourceTaskId:null}])await deny(()=>journal.reserve(scope.tenantId,scope.spaceId,bad as PendingEpoch),['INVALID_SCHEMA']);assert.deepEqual(await state(),witness);
  // Corrupt only a reproducible isolated journal's last event. Its unchanged
  // predecessor hash cannot substitute for checking the new branch's scope.
  const isolated=randomUUID(),scoped={...base,material:{...m,destinationSpaceId:isolated}} as PendingEpoch;
  await journal.install(scope.tenantId,isolated,before);await journal.reserve(scope.tenantId,isolated,scoped);
  const entry=resolve(root.path,scope.tenantId,isolated,'00000002.json'),bytes=await readFile(entry),tampered=JSON.parse(bytes.toString());tampered.pending.material.tenantId=f.foreignTenant;
  try{await writeFile(entry,JSON.stringify(tampered));await deny(()=>new EpochWitnessJournal(root).state(scope.tenantId,isolated),['AUTHORITY_UNAVAILABLE']);}finally{await writeFile(entry,bytes);}
  assert.deepEqual((await journal.state(scope.tenantId,isolated))!.pending,scoped);await journal.resolve(scope.tenantId,isolated,scoped,false);
  const status=await f.native.snapshot(scope,native.binding.sessionId);await f.native.stop(scope,{sessionId:native.binding.sessionId,key:randomUUID(),observedRevision:status.revision,expiresAt:new Date(Date.now()+30000).toISOString()});await deny(()=>repo().lookup(scope,original),['STALE_FENCE']);
 });
 for(const s of [scope,sourceScope])a.anchors.set(a.key(s),(await journal.current(s.tenantId,s.spaceId))!);return {reads};
 async function wait(c:PoolClient,n:number){let observed=0;const deadline=Date.now()+1500;while(Date.now()<deadline){await c.query('SELECT pg_stat_clear_snapshot()');observed=(await c.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',[f.roles.controller])).rows[0].n;if(observed===n)break;await new Promise(r=>setTimeout(r,10));}assert.equal(observed,n,'Actual blocked PostgreSQL requests');}
}
