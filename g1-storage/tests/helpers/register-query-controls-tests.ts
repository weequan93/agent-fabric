import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import test from 'node:test';
import type { ComponentTest } from './canonical-component.js';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageQueryControls,installedOwnerSnapshot } from '../../src/migration.js';
import { QueryControlsRepository } from '../../src/query-controls.js';
import { StorageAuthorityRepository } from '../../src/authority.js';

/** Real persisted preferences shared by component and full recall suites. The
 * caller owns the existing fixture, authority enrollment and cleanup seam. */
export async function exerciseQueryControls(t:TestContext,f:Awaited<ReturnType<typeof createStorageFixture>>,authority:StorageAuthorityRepository){
 const scope=f.scope,task=await f.task('ask'),sessionId=task.binding.sessionId;
 const repo=()=>new QueryControlsRepository(f.uow,authority,f.native);
 const command=(expectedRevision:number,controls:{attachments:boolean;olderRecall:boolean;saveReusable:boolean})=>({schemaVersion:1,action:'query-controls',sessionId,targetId:sessionId,key:randomUUID(),expectedRevision,expiresAt:new Date(Date.now()+120_000).toISOString(),controls});
 let writes=0,reads=0,denials=0,conflicts=0;
 const deny=async(work:()=>Promise<unknown>,code?:string)=>{let refused=false;try{await work();}catch(e){if(code)assert.equal((e as {code?:string}).code,code);refused=true;}assert.equal(refused,true);denials++;};
 const count=async()=>Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_query_controls WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,sessionId])).rows[0]['n']);
 await t.test('QUERY-CONTROLS/no-default',async()=>{await deny(()=>repo().snapshot(scope,sessionId),'CONTENT_UNAVAILABLE');assert.equal(await count(),0);});
 const originals:ReturnType<typeof command>[]=[];
 for(let n=0;n<8;n++)await t.test('QUERY-CONTROLS/independent-'+n.toString(2).padStart(3,'0'),async()=>{
  const controls={attachments:!!(n&4),olderRecall:!!(n&2),saveReusable:!!(n&1)},c=command(n,controls);originals.push(c);
  const result=await repo().set(scope,c);writes++;assert.deepEqual(result,{revision:n+1,controls,taskId:task.binding.taskId,runId:task.binding.runId});
  assert.deepEqual(await repo().snapshot(scope,sessionId),result);reads++;assert.equal(await count(),n+1);
 });
 await t.test('QUERY-CONTROLS/original-key-and-CAS',async()=>{
  const first=originals[0]!;assert.deepEqual(await repo().set(scope,first),{revision:1,controls:first.controls,taskId:task.binding.taskId,runId:task.binding.runId});reads++;assert.equal(await count(),8);
  await deny(()=>repo().set(scope,{...first,controls:{...first.controls,attachments:!first.controls.attachments}}),'IDEMPOTENCY_CONFLICT');conflicts++;
  await deny(()=>repo().set(scope,command(0,{attachments:false,olderRecall:false,saveReusable:false})),'STALE_REVISION');conflicts++;assert.equal(await count(),8);
 });
 await t.test('QUERY-CONTROLS/boundary-and-foreign-binding',async()=>{
  const c=command(8,{attachments:true,olderRecall:false,saveReusable:true});
  for(const raw of [{...c,currentSpace:f.spaces.secondary},{...c,actorId:f.actors[1]},{...c,payerId:randomUUID()},{...c,targetId:randomUUID()},
   {...c,controls:{...c.controls,olderRecall:'false'}},{...c,controls:{...c.controls,grant:true}}])await deny(()=>repo().set(scope,raw),'INVALID_SCHEMA');
  const actor=await f.scopeFor(f.actors[1]);await deny(()=>repo().snapshot(actor,sessionId));await deny(()=>repo().set(actor,c));
  const secondary=await f.scopeFor(f.actors[0],f.spaces.secondary),foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);
  for(const s of [secondary,foreign]){await deny(()=>repo().snapshot(s,sessionId));await deny(()=>repo().set(s,c));}
  const maintenance=await f.task('maintenance');await deny(()=>repo().set(scope,{...c,sessionId:maintenance.binding.sessionId,targetId:maintenance.binding.sessionId}),'REQUIRED_CAPABILITY_UNSUPPORTED');
  assert.equal(await count(),8);
 });
 await t.test('QUERY-CONTROLS/concurrent-original-and-stale-contender',async()=>{
  const c=command(8,{attachments:false,olderRecall:true,saveReusable:false});
  const blocker=await f.admin.connect();let queued:Promise<unknown>[]=[];let results:Awaited<ReturnType<QueryControlsRepository['set']>>[]=[];
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
   queued=[repo().set(scope,c),repo().set(scope,c)];for(const p of queued)p.catch(()=>{});
   let blocked=0;const deadline=Date.now()+2000;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=Number((await blocker.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',[f.roles.controller])).rows[0]['n']);if(blocked===2)break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(blocked,2,'Both actual controls transactions must wait on the installed Space barrier');await blocker.query('COMMIT');
   results=await Promise.all(queued) as typeof results;
  }finally{await blocker.query('ROLLBACK');await Promise.allSettled(queued);blocker.release();}
  const [a,b]=results;assert.ok(a&&b);writes++;reads++;assert.deepEqual(a,b);assert.equal(a.revision,9);assert.equal(await count(),9);
  const c1=command(9,{attachments:true,olderRecall:true,saveReusable:false}),c2=command(9,{attachments:false,olderRecall:false,saveReusable:true});
  const outcomes=await Promise.allSettled([repo().set(scope,c1),repo().set(scope,c2)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const rejected=outcomes.find(r=>r.status==='rejected');assert.ok(rejected&&rejected.status==='rejected');assert.equal(rejected.reason.code,'STALE_REVISION');writes++;denials++;conflicts++;assert.equal(await count(),10);
 });
 await t.test('QUERY-CONTROLS/direct-write-and-immutable-denial',async()=>{
  await deny(()=>f.uow.withScope(scope,tx=>tx.query('UPDATE fabric.storage_query_controls SET controls=$1::jsonb WHERE session_id=$2',[JSON.stringify({attachments:true,olderRecall:true,saveReusable:true}),sessionId])));
  await deny(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.storage_query_controls WHERE session_id=$1',[sessionId])));
  const table=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fabric.storage_query_controls'::regclass")).rows[0];assert.equal(table['relrowsecurity'],true);assert.equal(table['relforcerowsecurity'],true);
  const roles=[f.roles.controller,f.roles.worker,f.roles.idp];
  for(const role of roles){const acl=(await f.admin.query("SELECT has_table_privilege($1,'fabric.storage_query_controls','INSERT') AS i,has_table_privilege($1,'fabric.storage_query_controls','UPDATE') AS u,has_table_privilege($1,'fabric.storage_query_controls','DELETE') AS d",[role])).rows[0];assert.deepEqual(acl,{i:false,u:false,d:false});}
  assert.equal(await count(),10);assert.equal((await repo().snapshot(scope,sessionId)).revision,10);reads++;
 });
 return {writes,reads,denials,conflicts,sessionId};
}

export function registerQueryControlsTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('QUERY-CONTROLS/behavior / persisted independent session origin preferences',async t=>{
  const f=await createStorageFixture();
  try{
   await migrateStorageQueryControls(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
   const a=await enrollAuthority(f),ownerBefore=await installedOwnerSnapshot(f.admin);
   const resourcesBefore=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;
   const observed=await exerciseQueryControls(t,f,a.authority);
   assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   const resourcesAfter=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;
   assert.deepEqual(resourcesAfter,resourcesBefore);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'query-controls',positives:{save:0,ask:0,forget:0,restore:0,read:observed.reads,write:observed.writes,deny:observed.denials,conflict:observed.conflicts,propagate:0,backup:0,owner:1,harness:0},violations:{unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:resourcesAfter.length-resourcesBefore.length}});
  }finally{await f.close();}
 });
}
