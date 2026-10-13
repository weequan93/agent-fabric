import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';
import { enrollServiceAccounting,accountingSnapshot } from './accounting-fixture.js';
import { StorageServiceAccounting } from '../../src/resource-composition.js';
import type { VerifiedScope } from '../../src/owners.js';

type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
type Authority=Awaited<ReturnType<typeof enrollAuthority>>;
type Shared={relationId:string;source:{id:string;revision:number;witness:string}};
export async function registerAccountingTests(t:TestContext,f:Fixture,a:Authority,destination:VerifiedScope,
 forward:Shared,reverse:Shared,deny:(work:()=>Promise<unknown>,codes:readonly string[])=>Promise<void>){
 let charges=0,disclosures=0;
 for(const purpose of ['ask','maintenance'] as const)await t.test('AUTHORITY/accounting-'+purpose,async()=>{
  const e=await enrollServiceAccounting(f,a.authority,purpose),xids:string[]=[];
  const result=await e.service.execute(f.scope,e.command,async(tx,s)=>{
   assert.equal(s.binding.runId,e.task.binding.runId);assert.equal(s.admission.resourceId,null);
   xids.push(String((await tx.query('SELECT txid_current() AS xid')).rows[0]?.['xid']));
   const costs=(await tx.query('SELECT fabric.model_resource_costs($1) AS costs',[e.receipt.resourceId])).rows[0]?.['costs'];
   assert.deepEqual(costs,[{receipt:e.receipt,settled:false}]);return e.receipt.receiptId;
  },async(tx,value)=>{
   assert.equal(value,e.receipt.receiptId);xids.push(String((await tx.query('SELECT txid_current() AS xid')).rows[0]?.['xid']));
   assert.deepEqual((await tx.query('SELECT fabric.model_resource_costs($1) AS costs',[e.receipt.resourceId])).rows[0]?.['costs'],[{receipt:e.receipt,settled:true}]);
  });
  assert.deepEqual(result.receipt,e.receipt);assert.equal(new Set(xids).size,1);assert.equal(e.ownerCalls(),1);
  // Recreate the adapter over installed originals: accounting replay is exact.
  const second=new StorageServiceAccounting(f.uow,f.native,e.owner,a.authority),before=await accountingSnapshot(f);
  await second.execute(f.scope,e.command,async()=>true);assert.deepEqual(await accountingSnapshot(f),before);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[e.receipt.receiptId])).rows[0].n,1);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments WHERE resource_id=$1',[e.receipt.resourceId])).rows[0].n,0);charges++;
 });
 await t.test('AUTHORITY/accounting-rollback',async()=>{
  for(const purpose of ['ask','maintenance'] as const){
   for(const phase of ['work','publish','anchor'] as const){
    const e=await enrollServiceAccounting(f,a.authority,purpose),before=await accountingSnapshot(f),anchor=a.anchors.get(a.key(f.scope))!;
    try{
     await assert.rejects(e.service.execute(f.scope,e.command,async tx=>{
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE receipt_id=$1',[e.receipt.receiptId])).rows[0]?.['n'],1);
      if(phase==='work')throw new Error('Owned work interrupted');
      if(phase==='anchor')a.anchors.delete(a.key(f.scope));return true;
     },async tx=>{
      assert.deepEqual((await tx.query('SELECT fabric.model_resource_costs($1) AS costs',[e.receipt.resourceId])).rows[0]?.['costs'],[{receipt:e.receipt,settled:true}]);
      throw new Error('Owned publication interrupted');
     }),phase==='anchor'?{code:'AUTHORITY_UNAVAILABLE'}:{message:phase==='work'?'Owned work interrupted':'Owned publication interrupted'});
    }finally{a.anchors.set(a.key(f.scope),anchor);}
    assert.deepEqual(await accountingSnapshot(f),before);
   }
   const e=await enrollServiceAccounting(f,a.authority,purpose,f.scope,100000),before=await accountingSnapshot(f);
   await deny(()=>e.service.execute(f.scope,e.command,async()=>{disclosures++;return true;}),['BUDGET_EXHAUSTED']);
   assert.deepEqual(await accountingSnapshot(f),before);
  }
 });
 await t.test('AUTHORITY/accounting-negative',async()=>{
  const e=await enrollServiceAccounting(f,a.authority),before=await accountingSnapshot(f);
  for(const extra of [{purpose:'maintenance'},{assignmentGeneration:2},{ownerId:f.owner},{originRunId:e.receipt.resourceId},{accountingResourceId:e.receipt.receiptId},{receiptId:e.receipt.resourceId},{expiresAt:'2000-01-01T00:00:00.000Z'}]){
   await deny(()=>e.service.execute(f.scope,{...e.command,...extra} as typeof e.command,async()=>{disclosures++;return true;}),['CHECK_BINDING_MISMATCH','REQUIRED_CAPABILITY_UNSUPPORTED','EXPIRED_COMMAND']);
   assert.deepEqual(await accountingSnapshot(f),before);
  }
  const reader=await f.scopeFor(f.actors[2]);
  await deny(()=>e.service.execute(reader,e.command,async()=>{disclosures++;return true;}),['UNAUTHORIZED']);
  assert.deepEqual(await accountingSnapshot(f),before);
  await f.native.stop(f.scope,{sessionId:e.command.sessionId,key:e.receipt.resourceId,expiresAt:e.command.expiresAt,observedRevision:0});
  const stopped=await accountingSnapshot(f);
  await deny(()=>e.service.execute(f.scope,e.command,async()=>{disclosures++;return true;}),['STALE_FENCE']);
  assert.deepEqual(await accountingSnapshot(f),stopped);
  assert.throws(()=>a.authority.forSharedSources([forward,forward]),{code:'INVALID_SCHEMA'});
  assert.throws(()=>a.authority.forSharedSources([]),{code:'INVALID_SCHEMA'});
  assert.throws(()=>a.authority.forSharedSources(Array(17).fill(forward)),{code:'INVALID_SCHEMA'});
 });
 await t.test('AUTHORITY/accounting-expiry-wait',async()=>{
  for(const purpose of ['ask','maintenance'] as const){
   const e=await enrollServiceAccounting(f,a.authority,purpose),before=await accountingSnapshot(f),blocker=await f.admin.connect();let pending:Promise<unknown>|undefined;
   try{
    await blocker.query('BEGIN');await blocker.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',[e.task.leaf]);
    pending=deny(()=>e.service.execute(f.scope,{...e.command,expiresAt:new Date(Date.now()+500).toISOString()},async()=>{disclosures++;return true;}),['EXPIRED_COMMAND']);pending.catch(()=>{});
    const deadline=Date.now()+1500;let blocked=false;
    while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock') AS blocked",[f.roles.controller,(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(blocked,true,'Installed reservation actually waits for owned allowance');await blocker.query('SELECT pg_sleep(0.6)');await blocker.query('COMMIT');await pending;
   }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
   assert.deepEqual(await accountingSnapshot(f),before);
   // Also expire after real settlement, before outer UoW COMMIT acknowledgement.
   await deny(()=>e.service.execute(f.scope,{...e.command,expiresAt:new Date(Date.now()+500).toISOString()},async()=>true,async tx=>{
    assert.deepEqual((await tx.query('SELECT fabric.model_resource_costs($1) AS costs',[e.receipt.resourceId])).rows[0]?.['costs'],[{receipt:e.receipt,settled:true}]);await tx.query('SELECT pg_sleep(0.6)');
   }),['EXPIRED_COMMAND']);assert.deepEqual(await accountingSnapshot(f),before);
  }
 });
 await t.test('AUTHORITY/shared-accounting-order',async()=>{
  const forwardAuthority=a.authority.forSharedSources([forward]),reverseAuthority=a.authority.forSharedSources([reverse]);
  const left=await enrollServiceAccounting(f,forwardAuthority,'ask',destination),right=await enrollServiceAccounting(f,reverseAuthority,'maintenance');
  for(const order of ['forward-first','reverse-first']){
   const blocker=await f.admin.connect(),pending:Promise<unknown>[]=[];const first=[f.spaces.group,f.spaces.share].sort()[0]!;
   try{
    await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',f.tenant,first])]);
    const calls=[()=>left.service.execute(destination,left.command,async()=>true),()=>right.service.execute(f.scope,right.command,async()=>true)];if(order==='reverse-first')calls.reverse();
    const ownerCalls=left.ownerCalls()+right.ownerCalls();
    for(let n=0;n<2;n++){
     const promise=calls[n]!();promise.catch(()=>{});pending.push(promise);let waits:Record<string,unknown>[]=[];const deadline=Date.now()+1500;
     while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');waits=(await blocker.query("SELECT a.pid,(SELECT count(*)::int FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.granted) AS held FROM pg_stat_activity a WHERE a.usename=$1 AND cardinality(pg_blocking_pids(a.pid))>0 AND a.wait_event='advisory'",[f.roles.controller])).rows;if(waits.length===n+1)break;await new Promise(r=>setTimeout(r,10));}
     assert.equal(waits.length,n+1,order+' actual accounting waiter');for(const w of waits)assert.equal(w['held'],0,'Native/accounting must not acquire destination first');assert.equal(left.ownerCalls()+right.ownerCalls(),ownerCalls);
    }
    await blocker.query('COMMIT');await Promise.all(pending);
   }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(pending);}
  }
  for(const e of [left,right]){assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[e.receipt.receiptId])).rows[0].n,1);charges++;}
 });
 await t.test('AUTHORITY/shared-accounting-grant-wait',async()=>{
  const e=await enrollServiceAccounting(f,a.authority.forSharedSources([forward]),'ask',destination),before=await accountingSnapshot(f),blocker=await f.admin.connect();
  const params=[f.tenant,f.spaces.group,f.actors[1]],original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants;
  let pending:Promise<unknown>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(['storage:read'])]);
   pending=deny(()=>e.service.execute(destination,e.command,async()=>{disclosures++;return true;}),['UNAUTHORIZED','AUDIENCE_DENIED']);pending.catch(()=>{});
   let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true,'Actual source full-audience membership lock wait');await blocker.query('COMMIT');await pending;assert.equal(e.ownerCalls(),0);assert.deepEqual(await accountingSnapshot(f),before);
  }finally{
   await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});
   await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);
  }
 });
 const secondary=await f.scopeFor(f.actors[0],f.spaces.secondary);
 await t.test('AUTHORITY/shared-accounting-dependencies',async()=>{
  const sourceTask=await f.task('ask',secondary),id=randomUUID(),witness='sha256:'+createHash('sha256').update(randomUUID()).digest('hex');
  await a.publish(secondary,async(c,epoch)=>{
   await c.query("INSERT INTO fabric.storage_entities VALUES($1,$2,'source',$3,1,$4)",[f.tenant,secondary.spaceId,id,sourceTask.binding.taskId]);
   await c.query("INSERT INTO fabric.storage_current_heads VALUES($1,$2,'source',$3,1,$4,$5,$6,$7,clock_timestamp(),clock_timestamp()+interval '60s')",[f.tenant,secondary.spaceId,id,witness,randomUUID(),randomUUID(),epoch]);
  });
  const relation=await a.share(secondary,destination,{id,revision:1,sourceTaskId:sourceTask.binding.taskId}),input={relationId:relation,source:{id,revision:1,witness}};
  const e=await enrollServiceAccounting(f,a.authority.forSharedSources([forward,input]),'ask',destination),other=await enrollServiceAccounting(f,a.authority.forSharedSources([input,forward]),'maintenance',destination);
  const blocker=await f.admin.connect(),pending:Promise<unknown>[]=[];
  try{
   await blocker.query('BEGIN');const first=[f.spaces.group,f.spaces.share,f.spaces.secondary].sort()[0]!;
   await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',f.tenant,first])]);
   for(const service of [e,other]){
    const p=service.service.execute(destination,service.command,async tx=>{
     // The product lock plan has all three exact barriers, including the later
     // relation. pg_try on another fixture client would otherwise succeed.
     for(const space of [f.spaces.group,f.spaces.share,f.spaces.secondary]){
      const key=JSON.stringify(['recovery-space-barrier',f.tenant,space]);
      const observer=await f.admin.connect();try{assert.equal((await observer.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS free',[key])).rows[0].free,false);}finally{await observer.query('SELECT pg_advisory_unlock_all()');observer.release();}
     }
     assert.equal((await tx.query('SELECT fabric.current_space() AS space')).rows[0]?.['space'],destination.spaceId);return true;
    });p.catch(()=>{});pending.push(p);
    let waits:Record<string,unknown>[]=[];const deadline=Date.now()+1500;
    while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');waits=(await blocker.query("SELECT a.pid,(SELECT count(*)::int FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.granted) AS held FROM pg_stat_activity a WHERE a.usename=$1 AND cardinality(pg_blocking_pids(a.pid))>0 AND a.wait_event='advisory'",[f.roles.controller])).rows;if(waits.length===pending.length)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(waits.length,pending.length);for(const w of waits)assert.equal(w['held'],0);assert.equal(e.ownerCalls()+other.ownerCalls(),0);
   }
   await blocker.query('COMMIT');await Promise.all(pending);
  }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(pending);}
  for(const service of [e,other]){assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[service.receipt.receiptId])).rows[0].n,1);charges++;}
  const invalid=new StorageServiceAccounting(f.uow,f.native,e.owner,a.authority.forSharedSources([forward,{...input,relationId:randomUUID()}])),before=await accountingSnapshot(f);
  await deny(()=>invalid.execute(destination,e.command,async()=>{disclosures++;return true;}),['UNAUTHORIZED']);assert.deepEqual(await accountingSnapshot(f),before);
  const anchor=a.anchors.get(a.key(secondary))!;try{
   a.anchors.delete(a.key(secondary));await deny(()=>e.service.execute(destination,e.command,async()=>{disclosures++;return true;}),['AUTHORITY_UNAVAILABLE']);assert.deepEqual(await accountingSnapshot(f),before);
  }finally{a.anchors.set(a.key(secondary),anchor);}
 });
 await t.test('AUTHORITY/maintenance-grant-wait',async()=>{
  const e=await enrollServiceAccounting(f,a.authority,'maintenance',secondary),before=await accountingSnapshot(f),blocker=await f.admin.connect(),params=[f.tenant,secondary.spaceId,secondary.actorId];
  const original=(await f.admin.query('SELECT grants FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0].grants as string[];let pending:Promise<unknown>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original.filter(g=>g!=='storage:maintenance'))]);
   pending=deny(()=>e.service.execute(secondary,e.command,async()=>{disclosures++;return true;}),['STALE_AUTHORITY','UNAUTHORIZED']);pending.catch(()=>{});
   let blocked=false;const deadline=Date.now()+1500;
   while(Date.now()<deadline){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))) AS blocked',[f.roles.controller,(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}
   assert.equal(blocked,true,'Actual maintenance membership authority wait');await blocker.query('COMMIT');await pending;assert.equal(e.ownerCalls(),0);assert.deepEqual(await accountingSnapshot(f),before);
   const fresh=await f.scopeFor(f.actors[0],secondary.spaceId);await deny(()=>e.service.execute(fresh,e.command,async()=>{disclosures++;return true;}),['UNAUTHORIZED']);assert.deepEqual(await accountingSnapshot(f),before);
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(original)]);}
 });
 assert.equal(disclosures,0);
 return {charges,disclosures};
}
