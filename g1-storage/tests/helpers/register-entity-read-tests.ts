import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash,randomUUID } from 'node:crypto';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { ContentClassSchema } from '../../src/schema.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
const classes=['source','knowledge','artifact','draft','live-file','checkpoint','summary','index','cache','ask','backup'] as const;
/** Head metadata is an authorized read for every supported class. These are
 * fixture-enrolled controls, not persisted content or derived dependency proofs. */
export async function registerEntityReadTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const scope=f.scope,p=[scope.tenantId,scope.spaceId],id=randomUUID();let reads=0;
 const records:{ref:{class:typeof classes[number];id:string;revision:number;witness:string};taskId:string}[]=[];
 const repository=()=>new StorageAuthorityRepository({current:async(t,s)=>a.anchors.get(t+'/'+s)},f.native);
 const read=(record:typeof records[number],s=scope,repo=repository())=>f.uow.withScope(s,tx=>repo.entity(tx,s,record.ref));
 const snapshot=async()=>{const rows=[];for(const table of ['storage_entities','storage_current_heads','storage_authority_epoch','storage_commands','storage_outbox','storage_tombstones','storage_restrictions'])rows.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return rows;};
 const member=[...p,f.actors[1]],original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',member)).rows[0].grants as string[];
 const grants=(value:string[])=>f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...member,JSON.stringify(value)]);
 const positives=async()=>{for(const r of records){const head=await read(r);assert.equal(head.id,id);assert.equal(head.class,r.ref.class);assert.equal(head.source_task_id,r.taskId);reads++;}};
 const refusals=async(codes:readonly string[])=>{const results=await Promise.allSettled(records.map(r=>deny(()=>read(r),codes)));assert.ok(results.every(r=>r.status==='fulfilled'),'Every class must refuse');};
 await t.test('AUTHORITY/entity-read-preparation',async()=>{
  for(const cl of classes){ContentClassSchema.parse(cl);const task=await f.task('ask',scope);records.push({ref:{class:cl,id,revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')},taskId:task.binding.taskId});}
  await a.publish(scope,async(c,epoch)=>{for(const r of records){
   await c.query('INSERT INTO fabric.storage_entities VALUES($1,$2,$3,$4,1,$5)',[...p,r.ref.class,id,r.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,clock_timestamp(),clock_timestamp()+interval '60s')",[...p,r.ref.class,id,r.ref.witness,randomUUID(),randomUUID(),epoch]);
  }});
  assert.equal(records.length,11);await positives();
 });
 await t.test('AUTHORITY/entity-read-audience',async()=>{
  const db=await snapshot(),anchor=a.anchors.get(a.key(scope));
  try{await grants(original.filter(g=>g!=='task:read'));await refusals(['AUDIENCE_DENIED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(a.anchors.get(a.key(scope)),anchor);}finally{await grants(original);}
  await positives();
 });
 await t.test('AUTHORITY/entity-read-audience-wait',async()=>{
  const db=await snapshot(),blocker=await f.admin.connect();let queued:Promise<unknown>[]=[];
  try{
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...member,JSON.stringify(original.filter(g=>g!=='task:read'))]);
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   queued=records.filter(r=>['source','knowledge','artifact','summary','cache','backup'].includes(r.ref.class)).map(r=>deny(()=>read(r),['AUDIENCE_DENIED']));for(const q of queued)q.catch(()=>{});
   let waits=0,direct=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');const row=(await blocker.query('SELECT count(*)::int AS n,bool_or($2=ANY(pg_blocking_pids(pid))) AS direct FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0',[f.roles.controller,pid])).rows[0];waits=row.n;direct=row.direct===true;if(waits===6&&direct)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(waits,6);assert.equal(direct,true);await blocker.query('COMMIT');await Promise.all(queued);assert.deepEqual(await snapshot(),db);
  }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(queued);await grants(original);}
  await positives();
 });
 await t.test('AUTHORITY/entity-read-lineage',async()=>{
  const db=await snapshot(),client=await f.admin.connect(),nonSource=records.filter(r=>r.ref.class!=='source');
  const replace=async(missing:boolean)=>{await client.query('BEGIN');await client.query('ALTER TABLE fabric.storage_entities DISABLE TRIGGER USER');for(const r of nonSource)await client.query('UPDATE fabric.storage_entities SET source_task_id=$5 WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=1',[...p,r.ref.class,id,missing?null:r.taskId]);await client.query('ALTER TABLE fabric.storage_entities ENABLE TRIGGER USER');await client.query('COMMIT');};
  try{await replace(true);const results=await Promise.allSettled(nonSource.map(r=>deny(()=>read(r),['AUTHORITY_UNAVAILABLE'])));assert.ok(results.every(r=>r.status==='fulfilled'));assert.equal((await read(records[0]!)).source_task_id,records[0]!.taskId);reads++;}finally{await client.query('ROLLBACK');await replace(false);client.release();}
  assert.deepEqual(await snapshot(),db);await positives();
 });
 await t.test('AUTHORITY/entity-read-scope',async()=>{
  const db=await snapshot(),foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign),personal=await f.scopeFor(f.actors[0],f.spaces.personal);
  for(const r of records){await deny(()=>read(r,foreign),['STALE_REVISION']);await deny(()=>read(r,personal),['STALE_REVISION']);await deny(()=>f.uow.withScope(scope,tx=>a.authority.entity(tx,scope,{...r.ref,sourceTaskId:r.taskId})),['INVALID_SCHEMA']);}
  assert.deepEqual(await snapshot(),db);await positives();
 });
 await t.test('AUTHORITY/entity-read-expiry-wait',async()=>{
  const r={ref:{class:'knowledge' as const,id:randomUUID(),revision:1,witness:'sha256:'+createHash('sha256').update(randomUUID()).digest('hex')},taskId:records[1]!.taskId};
  await a.publish(scope,async(c,epoch)=>{await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'knowledge',$3,1,$4)",[...p,r.ref.id,r.taskId]);await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,'knowledge',$3,1,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '500 milliseconds')",[...p,r.ref.id,r.ref.witness,randomUUID(),randomUUID(),epoch]);});
  const db=await snapshot(),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
  try{
   // identity_audience locks the memberships table in SHARE mode; an actual
   // UPDATE holds the conflicting ROW EXCLUSIVE lock. A row FOR UPDATE alone
   // is compatible with that table lock and would not test the audience wait.
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...member,JSON.stringify(original)]);const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   pending=deny(()=>read(r),['RETENTION_RESTRICTED']);pending.catch(()=>{});let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.55)');await blocker.query('COMMIT');await pending;assert.deepEqual(await snapshot(),db);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
  await positives();
 });
 await t.test('AUTHORITY/entity-read-remaining-audience',async()=>{
  const removed=await f.scopeFor(f.actors[1]),reader=await f.scopeFor(f.actors[2]),db=await snapshot();
  try{
   await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',member);
   for(const r of records){await deny(()=>read(r,removed),['UNAUTHORIZED','STALE_AUTHORITY']);assert.equal((await read(r,reader)).source_task_id,r.taskId);reads++;}
   await positives();assert.deepEqual(await snapshot(),db);
  }finally{await f.admin.query('UPDATE fabric.memberships SET revoked_at=NULL,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',member);}
  await positives();
 });
 return {reads};
}
