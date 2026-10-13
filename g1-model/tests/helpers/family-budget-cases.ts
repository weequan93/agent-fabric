import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { createBudgetFixture,code } from './budget-fixture.js';
import { control,stopOwned } from './process-fixture.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { createNativeFixture } from './native-fixture.js';
import { journey } from './profile-context-journey.js';
import { operatorInspect } from '../../src/operator-view.js';
import { TaskCallBindingSchema } from '../../src/schema.js';

type Harness=Awaited<ReturnType<typeof createBudgetFixture>>;
/** Actual PG family ceilings, not the unrelated common-Space contention fixture. */
export async function familyBudgetCases(t:TestContext,h:Harness){
 const f=h.f;
 const balances=async(ids:readonly string[])=>(await f.admin.query('SELECT allowance_id,reserved,settled FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[ids])).rows;
 const membership=async(reservationId:string)=>(await f.admin.query('SELECT allowance_id FROM fabric.model_reservation_allowances WHERE reservation_id=$1 ORDER BY allowance_id',[reservationId])).rows.map(r=>r.allowance_id as string);
 for(const index of [4,5])for(const reverse of [false,true])await t.test('SEC-F04-001-parent-'+(index===4?'Task':'Run')+'100/own20+children40/concurrency/'+reverse,async()=>{
  const space=await h.space(),parent=await h.task({space,commonCeiling:1_000_000,ceiling:10_000}),child=await h.task({space,parentTaskId:parent.binding.taskId,ceiling:10_000}),sibling=await h.task({space,parentTaskId:parent.binding.taskId,ceiling:10_000}),grandchild=await h.task({space,parentTaskId:child.binding.taskId,ceiling:10_000});
  await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=100 WHERE allowance_id=$1',[parent.ids[index]]);
  const own=await parent.makeInput();await h.reserve(parent,own.request.original,20);await h.conserve();
  const tasks=reverse?[grandchild,sibling,child]:[child,sibling,grandchild],inputs=await Promise.all(tasks.map(x=>x.makeInput())),ps=await Promise.all(tasks.map(x=>h.caller(space)));
  try{
   const first=await h.start(ps[0]!,{kind:'reserve',runId:tasks[0]!.binding.runId,original:inputs[0]!.request.original,amount:40,hold:true}),partial=await h.message(first,'partial');
   const before=await h.snapshot();assert.equal(await h.reservation(inputs[0]!.request.original),undefined);
   const second=await h.start(ps[1]!,{kind:'reserve',runId:tasks[1]!.binding.runId,original:inputs[1]!.request.original,amount:40,hold:false});await h.blocked(second,Number(partial['pid']));
   const third=await h.start(ps[2]!,{kind:'reserve',runId:tasks[2]!.binding.runId,original:inputs[2]!.request.original,amount:40,hold:false});await h.blocked(third);assert.deepEqual(await h.snapshot(),before);
   const counters=await f.counters();await control(ps[0]!,{kind:'release'});
   const results=await Promise.all([first,second,third].map(x=>h.message(x,'result')));assert.equal(results.filter(r=>r['status']==='committed').length,2);assert.equal(results.filter(r=>r['code']==='BUDGET_EXHAUSTED').length,1);
   for(const row of await balances(parent.ids))assert.equal(row.reserved,'100','parent original limits include own and child liabilities');
   assert.deepEqual(await f.counters(),counters);await h.conserve();
   const loser=results.findIndex(r=>r['status']!=='committed');assert.equal(await h.reservation(inputs[loser]!.request.original),undefined);
   await stopOwned(ps[loser]!);const restart=await h.caller(space);try{const again=await h.start(restart,{kind:'reserve',runId:tasks[loser]!.binding.runId,original:inputs[loser]!.request.original,amount:40,hold:false});assert.equal((await h.message(again,'result'))['code'],'BUDGET_EXHAUSTED');}finally{await stopOwned(restart);}
   for(let i=0;i<tasks.length;i++)if(i!==loser){
    const task=tasks[i]!,input=inputs[i]!,expected=[...new Set([...parent.ids,...task.ids,...(task===grandchild?child.ids:[])])].sort();
    assert.deepEqual(await membership(input.request.original.reservationId),expected);
    const svc=await h.accounting(task,input,40,'tool',true);assert.equal((await svc.seal(task.scope,input.request.original)).status,'sealed-not-accepted');assert.deepEqual(await membership(input.request.original.reservationId),expected);await h.conserve();
   }
   const svc=await h.accounting(parent,own,20,'tool',true);await svc.seal(parent.scope,own.request.original);for(const row of await balances(parent.ids)){assert.equal(row.reserved,'0');assert.equal(row.settled,'0');}await h.conserve();
  }finally{await Promise.all(ps.map(p=>stopOwned(p)));}
 });
 for(const index of [4,5])await t.test('SEC-F04-001-parent-'+(index===4?'Task':'Run')+'/unknown-owner-loss-recreate-and-once-settlement',async()=>{
  const space=await h.space(),parent=await h.task({space,commonCeiling:1_000_000,ceiling:10_000}),child=await h.task({space,parentTaskId:parent.binding.taskId,ceiling:10_000}),sibling=await h.task({space,parentTaskId:parent.binding.taskId,ceiling:10_000}),input=await child.makeInput(),o=input.request.original,R=reserveEstimate(input.request.payload,input.request.outputCap),expected=[...new Set([...parent.ids,...child.ids])].sort();
  await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2 WHERE allowance_id=$1',[parent.ids[index],R]);
  const svc=h.service(),counters=await f.counters();await svc.prepare(child.scope,input);assert.deepEqual(await membership(o.reservationId),expected);
  await f.schedule(o,{usage:'manual'},true);assert.equal((await svc.dispatch(child.scope,o)).status,'unknown');assert.equal((await f.journal(o)).status,'accepted');assert.equal((await h.reservation(o)).state,'unknown');
  for(const row of await balances(parent.ids))assert.equal(row.reserved,String(R));await h.conserve();
  for(const task of [parent,sibling])await assert.rejects(h.reserve(task,{...f.original(),spaceId:space},1),code('BUDGET_EXHAUSTED'));
  // Recreate service composition, then lose/recreate the actual original owner.
  await stopOwned(f.adapter(),'SIGKILL');let restored=h.service();assert.equal((await restored.reconcile(child.scope,o)).status,'unknown');assert.deepEqual(await membership(o.reservationId),expected);
  await f.restart();restored=h.service();assert.equal((await restored.reconcile(child.scope,o)).status,'accepted');assert.equal((await h.reservation(o)).state,'unknown');
  await f.finalize(o);const measured=(await f.journal(o)).receipt.measuredUnits;assert.ok(measured<R);
  assert.equal((await restored.reconcile(child.scope,o)).status,'settled');const after=await h.snapshot();assert.equal((await h.service().reconcile(child.scope,o)).status,'settled');assert.deepEqual(await h.snapshot(),after);
  assert.deepEqual(await membership(o.reservationId),expected);for(const row of await balances(parent.ids)){assert.equal(row.reserved,'0');assert.equal(row.settled,String(measured));}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE reservation_id=$1',[o.reservationId])).rows[0].n,1);assert.equal((await f.counters())['acceptance'],(counters['acceptance']??0)+1);
  await h.reserve(sibling,{...f.original(),spaceId:space},R-measured);await assert.rejects(h.reserve(parent,{...f.original(),spaceId:space},1),code('BUDGET_EXHAUSTED'));await h.join(input);await h.conserve();
 });
 await t.test('SEC-F04-001-trusted-lineage-missing-foreign-and-immutable',async()=>{
  const space=await h.space(),parent=await h.task({space,commonCeiling:1_000_000}),child=await h.task({space,parentTaskId:parent.binding.taskId}),foreign=await h.task();
  const lineage=(await f.admin.query('SELECT parent_run_id FROM fabric.model_budget_lineage WHERE run_id=$1',[child.binding.runId])).rows[0];assert.equal(lineage.parent_run_id,parent.binding.runId);
  for(const parentTaskId of [randomUUID(),foreign.binding.taskId]){const b=await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_billing_bindings'),l=await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_budget_lineage');await assert.rejects(h.task({space,parentTaskId}),e=>(e as {code?:string}).code==='42501');assert.deepEqual((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_billing_bindings')).rows,b.rows);assert.deepEqual((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_budget_lineage')).rows,l.rows);}
  const before=await h.snapshot();
  for(const sql of ['UPDATE fabric.model_budget_lineage SET parent_run_id=NULL WHERE run_id=$1','DELETE FROM fabric.model_budget_lineage WHERE run_id=$1'])await assert.rejects(f.admin.query(sql,[child.binding.runId]));
  await assert.rejects(f.uow.withScope(child.scope,tx=>tx.query('INSERT INTO fabric.model_budget_lineage VALUES($1,$2,$3,NULL)',[f.tenant,space,randomUUID()])));
  await assert.rejects(f.uow.withScope(child.scope,tx=>tx.query('SELECT fabric.model_budget_membership($1)',[child.binding.runId])));
  await assert.rejects(f.worker.query('SELECT * FROM fabric.model_budget_lineage'));
  await f.uow.withScope(child.scope,async tx=>assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_budget_lineage WHERE space_id=$1',[foreign.binding.spaceId])).rows[0]?.['n'],0));
  assert.deepEqual(await h.snapshot(),before);
 });
 await t.test('SEC-F04-001-parent-Run-is-pinned-ambiguous-new-child-and-self-refuse',async()=>{
  const space=await h.space(),parent=await h.task({space,commonCeiling:1_000_000}),child=await h.task({space,parentTaskId:parent.binding.taskId}),runId=randomUUID(),leaf=randomUUID(),binding=TaskCallBindingSchema.parse({...parent.binding,runId,sessionId:randomUUID()});
  await f.admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,2,1,$5::jsonb,0,'pending')",[f.tenant,space,runId,parent.binding.taskId,JSON.stringify(parent.origin.versions)]);
  await f.admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,10000,1)',[f.tenant,space,leaf,parent.ids[4],parent.scope.payerId,'synthetic-utf8-byte-unit']);await f.admin.query("INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,'run',$4)",[f.tenant,space,leaf,runId]);
  const install=(b:typeof binding,l:string)=>f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[f.tenant,space,b.runId,b.taskId,b.actorId,b.payerId,h.department,b.costCenter,l,JSON.stringify(b)]);
  await assert.rejects(install({...binding,taskId:child.binding.taskId},leaf),e=>(e as {code?:string}).code==='42501');
  await assert.rejects(install({...binding,parentTaskId:parent.binding.taskId},leaf),e=>(e as {code?:string}).code==='42501');await install(binding,leaf);
  const counts=(await f.admin.query('SELECT (SELECT count(*)::int FROM fabric.model_billing_bindings) AS bindings,(SELECT count(*)::int FROM fabric.model_budget_lineage) AS lineage')).rows;
  await assert.rejects(h.task({space,parentTaskId:parent.binding.taskId}),e=>(e as {code?:string}).code==='42501');assert.deepEqual((await f.admin.query('SELECT (SELECT count(*)::int FROM fabric.model_billing_bindings) AS bindings,(SELECT count(*)::int FROM fabric.model_budget_lineage) AS lineage')).rows,counts);
  const o={...f.original(),spaceId:space};await h.reserve(child,o,1);const ids=await membership(o.reservationId);assert.ok(ids.includes(parent.leaf));assert.ok(!ids.includes(leaf));assert.equal((await f.admin.query('SELECT parent_run_id FROM fabric.model_budget_lineage WHERE run_id=$1',[child.binding.runId])).rows[0].parent_run_id,parent.binding.runId);await h.conserve();
  const before=await h.snapshot();await assert.rejects(f.admin.query("INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,'task',$4)",[f.tenant,space,randomUUID(),parent.binding.taskId]),e=>(e as {code?:string}).code==='23505');assert.deepEqual(await h.snapshot(),before);
 });
 await t.test('SEC-F04-001-native-child-Waiting-for-budget-no-adapter-I-O',async()=>{
  const n=await createNativeFixture();try{
   const parent=await n.task({noSources:true,ceiling:1}),child=await n.task({noSources:true,parentTaskId:parent.binding.taskId,ceiling:100_000}),before=await n.f.counters();
   const result=await journey(n).turn(child,'child cannot escape parent budget');assert.equal(result.status,'waiting');assert.equal(result.view.wait?.reason,'budget');assert.deepEqual(await n.f.counters(),before);
   const view=await operatorInspect(n.native.session,child.scope,child.sessionId);assert.deepEqual(view.allowances.map(a=>a.allowanceId).sort(),[...new Set([...parent.ids,...child.ids])].sort());assert.ok(view.allowances.some(a=>a.allowanceId===parent.leaf&&a.remaining===1));
   assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.budget_reservations WHERE run_id=$1',[child.binding.runId])).rows[0].n,0);
  }finally{await n.close();}
 });
}
