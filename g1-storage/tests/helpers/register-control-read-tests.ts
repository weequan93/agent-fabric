import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { EpochPublicationRepository } from '../../src/epoch-publication.js';
import { PolicyPublicationRepository } from '../../src/policy-publication.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { TombstonePublicationRepository } from '../../src/tombstone-publication.js';
import { ForgetWorkRepository } from '../../src/forget-work.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
/** Current authorization must govern historical control reads as well as the
 * pending witness branch. No content or worker completion is exercised here. */
export async function registerControlReadTests(t:TestContext,f:Fixture,a:Authority,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,root=roots['authority']!;
 const scope=await f.scopeFor(f.actors[0],f.spaces.pending),journal=new EpochWitnessJournal(root);
 const factories=[EpochPublicationRepository,PolicyPublicationRepository,SourceRevocationRepository,TombstonePublicationRepository,ForgetWorkRepository] as const;
 const cases:{repo:EpochPublicationRepository;input:{key:string;sessionId:string;expiresAt:string};task:Awaited<ReturnType<Fixture['task']>>}[]=[];
 const state=()=>journal.state(scope.tenantId,scope.spaceId);
 const snapshot=async()=>{const rows=[];for(const table of ['storage_authority_epoch','storage_epoch_publications','storage_forget_work','storage_tombstone_publications','storage_tombstones','storage_restrictions','storage_commands','storage_outbox'])rows.push((await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY tenant_id,space_id')).rows);return rows;};
 let reads=0;
 await t.test('AUTHORITY/control-read-preparation',async()=>{
  for(const Factory of factories){
   const task=await f.task('maintenance',scope),repo=new Factory(f.uow,journal,f.native);
   const base={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()};
   let input:typeof base;
   if(repo instanceof PolicyPublicationRepository){
    const row=(await f.admin.query('SELECT periods,operations FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0];
    input={...base,policy:{...row,periods:{...row.periods,backup:row.periods.backup-1}}} as typeof base;
    assert.equal((await repo.reduce(scope,input)).status,'committed');
   }else if(repo instanceof SourceRevocationRepository||repo instanceof TombstonePublicationRepository||repo instanceof ForgetWorkRepository){
    const cl=repo instanceof TombstonePublicationRepository?'knowledge':'source';
    const row=(await f.admin.query(`SELECT h.* FROM fabric.storage_current_heads h JOIN fabric.storage_entities x USING(tenant_id,space_id,class,id,revision)
     WHERE h.tenant_id=$1 AND h.space_id=$2 AND h.class=$3 AND x.source_task_id IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM fabric.storage_tombstones d WHERE (d.tenant_id,d.space_id,d.class,d.id)=(h.tenant_id,h.space_id,h.class,h.id))
     AND NOT EXISTS(SELECT 1 FROM fabric.storage_restrictions r WHERE (r.tenant_id,r.space_id,r.source_id,r.source_revision)=(h.tenant_id,h.space_id,h.id,h.revision)) ORDER BY h.id LIMIT 1`,[scope.tenantId,scope.spaceId,cl])).rows[0];
    assert.ok(row,'A real enrolled unrestricted target is required');
    const entity={class:cl,id:row.id,revision:Number(row.revision),witness:row.witness};
    if(repo instanceof SourceRevocationRepository){input={...base,source:{id:entity.id,revision:entity.revision,witness:entity.witness}} as typeof base;assert.equal((await repo.revoke(scope,input)).status,'committed');}
    else{input={...base,entity} as typeof base;assert.equal((await repo.forget(scope,input)).status,'committed');}
   }else{input=base;assert.equal((await repo.refresh(scope,input)).status,'committed');}
   const recreated=new Factory(f.uow,new EpochWitnessJournal(root),f.native);
   cases.push({repo:recreated,input,task});assert.equal((await recreated.lookup(scope,input)).status,'committed');reads++;
  }
  assert.equal(cases.length,5);assert.equal((await state())!.pending,null);
 });
 const work=()=>{const last=cases[4]!;assert.ok(last.repo instanceof ForgetWorkRepository);return last.repo.pendingWork(scope,last.input);};
 const params=[scope.tenantId,scope.spaceId,f.actors[1]],original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];
 const restore=()=>f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);
 await t.test('AUTHORITY/control-read-audience',async()=>{
  const db=await snapshot(),witness=await state();
  try{
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='task:read'))]);
   for(const c of cases)await deny(()=>c.repo.lookup(scope,c.input),['AUDIENCE_DENIED']);
   await deny(work,['AUDIENCE_DENIED']);assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await restore();}
  for(const c of cases){assert.equal((await c.repo.lookup(scope,c.input)).status,'committed');reads++;}assert.equal((await work()).status,'propagation-pending');reads++;
 });
 await t.test('AUTHORITY/control-read-audience-wait',async()=>{
  const db=await snapshot(),witness=await state(),blocker=await f.admin.connect();let queued:Promise<unknown>[]=[];
  try{
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='task:read'))]);
   const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   queued=[...cases.map(c=>deny(()=>c.repo.lookup(scope,c.input),['AUDIENCE_DENIED'])),deny(work,['AUDIENCE_DENIED'])];for(const p of queued)p.catch(()=>{});
   // Space serialization means one audience reader waits on the real mutation;
   // the other five readers wait behind that reader's actual advisory barrier.
   let waits=0,direct=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');const row=(await blocker.query(`SELECT count(*)::int AS n,bool_or($2=ANY(pg_blocking_pids(pid))) AS direct FROM pg_stat_activity WHERE usename=$1 AND cardinality(pg_blocking_pids(pid))>0`,[f.roles.controller,pid])).rows[0];waits=row.n;direct=row.direct===true;if(waits===6&&direct)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(waits,6);assert.equal(direct,true);await blocker.query('COMMIT');await Promise.all(queued);
   assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(queued);await restore();}
  for(const c of cases){assert.equal((await c.repo.lookup(scope,c.input)).status,'committed');reads++;}assert.equal((await work()).status,'propagation-pending');reads++;
 });
 await t.test('AUTHORITY/control-read-lineage',async()=>{
  const c=cases[3]!,entity=(c.input as unknown as {entity:{class:string;id:string;revision:number}}).entity;
  const params=[scope.tenantId,scope.spaceId,entity.class,entity.id,entity.revision],old=(await f.admin.query('SELECT source_task_id FROM fabric.storage_entities WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5',params)).rows[0].source_task_id;
  const client=await f.admin.connect(),witness=await state();
  const substitute=async(taskId:string|null)=>{await client.query('BEGIN');await client.query('ALTER TABLE fabric.storage_entities DISABLE TRIGGER USER');await client.query('UPDATE fabric.storage_entities SET source_task_id=$6 WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision=$5',[...params,taskId]);await client.query('ALTER TABLE fabric.storage_entities ENABLE TRIGGER USER');await client.query('COMMIT');};
  try{await substitute(null);await deny(()=>c.repo.lookup(scope,c.input),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await state(),witness);}finally{await client.query('ROLLBACK');await substitute(old);client.release();}
  assert.equal((await c.repo.lookup(scope,c.input)).status,'committed');reads++;
 });
 await t.test('AUTHORITY/control-read-pending-audience',async()=>{
  const task=await f.task('maintenance',scope),input={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()};
  await assert.rejects(new EpochPublicationRepository(f.uow,journal,f.native,{beforeWitnessAck:async()=>{throw new Error('control read ACK gap');}}).refresh(scope,input),{message:'control read ACK gap'});
  const witness=await state(),db=await snapshot();assert.ok(witness?.pending);
  const repo=new EpochPublicationRepository(f.uow,new EpochWitnessJournal(root),f.native);
  try{await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='task:read'))]);await deny(()=>repo.lookup(scope,input),['AUDIENCE_DENIED']);assert.deepEqual(await state(),witness);assert.deepEqual(await snapshot(),db);}finally{await restore();}
  assert.equal((await repo.lookup(scope,input)).status,'committed');assert.equal((await state())!.pending,null);reads++;
 });
 await t.test('AUTHORITY/control-read-native-stop',async()=>{
  for(const c of cases){
   assert.equal((await c.repo.lookup(scope,c.input)).status,'committed');reads++;
   const before=await f.native.snapshot(scope,c.input.sessionId);
   const stopped=await f.native.stop(scope,{sessionId:c.input.sessionId,key:randomUUID(),observedRevision:before.revision,expiresAt:new Date(Date.now()+30_000).toISOString()});assert.equal(stopped.dispatch,'fenced');
   const db=await snapshot(),witness=await state();await deny(()=>c.repo.lookup(scope,c.input),['STALE_FENCE']);
   await deny(()=>c.repo.lookup(scope,{...c.input,key:randomUUID()}),['STALE_FENCE']);
   if(c.repo instanceof ForgetWorkRepository)await deny(work,['STALE_FENCE']);
   assert.deepEqual(await snapshot(),db);assert.deepEqual(await state(),witness);
  }
 });
 a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);return {reads};
}
