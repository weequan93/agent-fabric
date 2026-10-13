import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskRepository } from '../../../engine/scheduler/src/task-state.js';
import { TaskCallBindingSchema } from '../../src/schema.js';
import { SessionLoop } from '../../src/native-imports.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { AUTO_CHOICE } from '../../src/profile.js';
import type { NativeSnapshot } from '../../src/native-repository.js';
import { createNativeFixture } from './native-fixture.js';
import { journey,requestsFor } from './profile-context-journey.js';
import { code } from './recovery-fixture.js';
import { waitUntil } from './process-fixture.js';

/** A terminal native Run may still carry an unresolved original model call.
 * Starting a linked Run must not turn that retained obligation into a grant. */
export async function terminalUnknownLinkedRun():Promise<void>{
 const n=await createNativeFixture(),f=n.f;
 try{
  const a=await n.task(),j=journey(n,{schedule:{usage:'never'}});
  assert.equal((await j.turn(a,'original unresolved liability before linked repair')).status,'waiting');
  const requests=await requestsFor(n,a.binding.runId);assert.equal(requests.length,1);
  const original=requests[0]!.original,journal=await f.journal(original);
  assert.equal(journal.status,'accepted');assert.equal(journal.receipt,null);
  const before=await n.native.repository.snapshot(a.scope,a.sessionId),loop=n.native.session.restore(before,a.scope);
  assert.equal(loop.inspect().run.state,'waiting');assert.equal(loop.inspect().run.waiting?.reason,'unknown-effect');assert.ok(loop.inspect().pendingModel);
  const pending=loop.inspect().pendingModel;
  loop.transition('failed',{currentAuthorized:true,unknownEffect:true,evidence:[original.operationId]});
  assert.equal(loop.inspect().run.state,'failed');assert.equal(loop.inspect().run.waiting?.reason,'unknown-effect');assert.deepEqual(loop.inspect().pendingModel,pending);
  await n.native.repository.persist(a.scope,before,loop.events(),before.control.wait,randomUUID());
  const terminal=await n.native.repository.snapshot(a.scope,a.sessionId),restored=n.native.session.restore(terminal,a.scope).inspect();
  assert.equal(restored.run.state,'failed');assert.equal(restored.run.waiting?.reason,'unknown-effect');assert.deepEqual(restored.pendingModel,pending);
  assert.equal(terminal.control.wait?.reason,'unknown-usage');assert.equal(terminal.control.wait?.replayAllowed,false);

  // Exercise the unchanged authoritative scheduler's real lifecycle, including
  // terminalization with retained unknown state. An ordinary waiting Run alone
  // would be rejected for being active and would not prove this boundary.
  const scheduler=new TaskRepository(scope=>assert.deepEqual(scope,a.origin.scope));
  scheduler.create({scope:a.origin.scope,taskId:a.binding.taskId,actor:{tenantId:f.tenant,actorId:a.scope.actorId},goal:'repair terminal Run without evading original liability',requirementsRevision:1});
  scheduler.startRun(a.binding.taskId,a.binding.runId,{versions:a.origin.versions});
  scheduler.transition(a.binding.runId,'preparing',{currentAuthorized:true});scheduler.transition(a.binding.runId,'running',{currentAuthorized:true});
  scheduler.transition(a.binding.runId,'waiting',{currentAuthorized:true,unknownEffect:true,waiting:{reason:'unknown-effect',resolver:'original-model-receipt-owner',nextAction:'reconcile'}});
  const failed=scheduler.transition(a.binding.runId,'failed',{currentAuthorized:true,unknownEffect:true,evidence:[original.operationId]});
  assert.equal(failed.state,'failed');assert.equal(failed.waiting?.reason,'unknown-effect');
  const runId=randomUUID(),origin=scheduler.startRun(a.binding.taskId,runId,{versions:a.origin.versions,explicitRetry:true});
  assert.equal(origin.attempt,2);assert.equal(origin.taskId,a.binding.taskId);assert.deepEqual(scheduler.getRun(a.binding.runId),failed);assert.deepEqual(scheduler.get(a.binding.taskId).runIds,[a.binding.runId,runId]);

  // Reproducible trusted fixture admission installs only the scheduler-issued
  // Run identity and its own leaf. Existing Task/project/account capacity and
  // every old reservation/history row remain unchanged.
  const taskAllowance=a.ids.at(-2)!,sessionId=randomUUID(),leaf=randomUUID(),binding=TaskCallBindingSchema.parse({...a.binding,runId,sessionId});
  const ancestors=(await f.admin.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[a.ids])).rows;
  await f.admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,2,1,$5::jsonb,0,'pending')",[f.tenant,f.space,runId,binding.taskId,JSON.stringify(a.origin.versions)]);
  await f.admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,100000,1)',[f.tenant,f.space,leaf,taskAllowance,binding.payerId,'synthetic-utf8-byte-unit']);
  await f.admin.query("INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,'run',$4)",[f.tenant,f.space,leaf,runId]);
  const prior=(await f.admin.query('SELECT department_id,cost_center FROM fabric.model_billing_bindings WHERE run_id=$1',[a.binding.runId])).rows[0];
  await f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[f.tenant,f.space,runId,binding.taskId,binding.actorId,binding.payerId,prior.department_id,prior.cost_center,leaf,JSON.stringify(binding)]);
  n.descriptors.set(sessionId,n.descriptors.get(a.sessionId)!);
  assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[a.ids])).rows,ancestors);
  const liability=(await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0];
  assert.ok(Number(liability.amount)>0);assert.equal(Number(liability.settled_amount),0);assert.ok(['active','unknown'].includes(liability.state));
  const state=await n.snapshot(),counts=await f.counters();

  // This fails on a Run-local guard: the proposed Run is new, but its Task's
  // original accepted operation is still unknown and has no settlement proof.
  await assert.rejects(n.native.repository.open(a.scope,runId,a.admission),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  // Bypass the operator admission path with a fully valid linked Run request.
  // The lower model boundary must reject before reservation/pending/audit writes.
  const proposed:NativeSnapshot={binding,origin,admission:a.admission,control:{choice:AUTO_CHOICE,wait:null,inputLimitBytes:a.admission.maxInputBytes},revision:0,events:[],stopped:false,cancellationGeneration:0};
  const request=await n.native.ports.encode(a.scope,proposed,n.profile,'linked admission bypass',{tenantId:f.tenant,spaceId:f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()});
  const bypass=new SessionLoop(origin,{clock:{now:()=>Date.now()},authorize:()=>{},model:async()=>{throw new Error('Pending prefix only');},execute:async()=>{throw new Error('No effect');},modelOperation:()=>({operationId:request.original.operationId,reservationId:request.original.reservationId})});
  bypass.transition('preparing',{currentAuthorized:true});bypass.transition('running',{currentAuthorized:true});await assert.rejects(bypass.callModel('linked admission bypass'));
  assert.equal(bypass.inspect().pendingModel?.operationId,request.original.operationId);
  await assert.rejects(n.native.models.model.prepare(a.scope,{binding,origin,request,nativePrefix:bypass.events(),route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:new Date(Date.now()+60_000).toISOString(),retryCeiling:3}}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  // This is the authenticated guard used by request/retry/control/effect
  // continuations, also rechecked after I/O. No proposed callback can run.
  let writes=0,freshPid:number|undefined,refusal:Promise<void>|undefined;
  const blocker=await f.admin.connect();
  try{
   await blocker.query('BEGIN');const blockerPid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',a.scope.tenantId,a.scope.spaceId])]);
   // Deliberately no load/lock in this caller: fresh must own its barrier.
   refusal=assert.rejects(f.uow.withScope(a.scope,async tx=>{freshPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);await n.native.repository.fresh(tx,a.scope,proposed);writes++;}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
   void refusal.catch(()=>{});
   let lock:Record<string,unknown>|undefined;
   await waitUntil(async()=>{if(!freshPid)return false;const row=(await f.admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[freshPid])).rows[0];if(row?.wait_event_type==='Lock'&&row.blockers.includes(blockerPid)){lock=row;return true;}return false;},'direct native freshness waits on original Space barrier');
   console.log(JSON.stringify({measurement:'recovery-lock-wait',...lock}));assert.equal(writes,0);
   await blocker.query('COMMIT');await refusal;
  }finally{await blocker.query('ROLLBACK');blocker.release();if(refusal)await refusal;}
  assert.equal(writes,0);
  assert.deepEqual(await n.snapshot(),state);assert.deepEqual(await n.native.repository.snapshot(a.scope,a.sessionId),terminal);
  assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0],liability);
  assert.deepEqual(await f.journal(original),journal);assert.deepEqual(n.native.session.restore(await n.native.repository.snapshot(a.scope,a.sessionId),a.scope).inspect().pendingModel,pending);
  const after=await f.counters();assert.equal(after['accept']??0,counts['accept']??0);assert.equal(after['acceptance']??0,counts['acceptance']??0);assert.deepEqual(after,counts);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE run_id=$1',[runId])).rows[0].n,0);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_sessions WHERE run_id=$1',[runId])).rows[0].n,0);

  // The guard must not block original-owner reconciliation of the terminal Run.
  // Only an actual known receipt clears the Task admission fence; history and
  // original charges remain attached to the failed Run, with no new accept.
  await f.finalize(original);
  const resolved=await n.native.session.reconcile(a.scope,{sessionId:a.sessionId,operationId:original.operationId});
  assert.equal(resolved.status,'completed');assert.equal(resolved.replayAllowed,false);
  const known=await n.native.repository.snapshot(a.scope,a.sessionId),knownState=n.native.session.restore(known,a.scope).inspect();
  assert.equal(knownState.run.state,'failed');assert.equal(knownState.pendingModel,null);assert.deepEqual(known.events.slice(0,terminal.events.length),terminal.events);
  const receipt=(await f.journal(original)).receipt;assert.ok(receipt.measuredUnits>0);assert.equal(receipt.original.attemptId,original.attemptId);
  assert.equal(Number((await f.admin.query('SELECT amount FROM fabric.usage_settlements WHERE reservation_id=$1',[original.reservationId])).rows[0].amount),receipt.measuredUnits);
  assert.equal(await n.native.repository.open(a.scope,runId,a.admission),sessionId);
  assert.deepEqual((await n.native.repository.snapshot(a.scope,sessionId)).origin,origin);
  assert.deepEqual(await n.native.repository.snapshot(a.scope,a.sessionId),known);
  for(const counter of ['accept','acceptance'])assert.equal((await f.counters())[counter]??0,counts[counter]??0);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE run_id=$1',[runId])).rows[0].n,0);
 }finally{await n.close();}
}
