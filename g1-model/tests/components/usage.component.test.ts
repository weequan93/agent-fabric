import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createUsageFixture } from '../helpers/usage-fixture.js';
import { encodeLocalRequest,LocalAdapterClient } from '../../src/test-adapter.js';
import { TransactionBudgetRepository } from '../../src/budget-repository.js';
import { reserveEstimate,measuredCost } from '../../src/arithmetic.js';
import { ModelRepository,hash } from '../../src/model-repository.js';
import { ModelService } from '../../src/model-service.js';
import { UsageRepository } from '../../src/usage-repository.js';
import { FoundationError } from '../../src/native-imports.js';
import { launchOwned,stopOwned,control,waitUntil,type OwnedProcess } from '../helpers/process-fixture.js';
import type { OriginalCall,OwnerObservation,UsageReceipt } from '../../src/contracts.js';
const code=(name:string)=>(e:unknown)=>(e as {code?:string}).code===name;
const expires=()=>new Date(Date.now()+60_000).toISOString();
test('USAGE/retry-reconcile',async t=>{
 const l=await createUsageFixture(),f=l.f,children:OwnedProcess[]=[];
 t.after(async()=>{const result=await Promise.allSettled(children.map(c=>stopOwned(c)));await l.close();for(const r of result)if(r.status==='rejected')throw r.reason;});
 const aggregate=await l.account(100_000);
 const baseScope=(await l.common()).scope;
 const count=async(table:string,o:OriginalCall)=>(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE attempt_id=$1',[o.attemptId])).rows[0].n;
 const reservation=async(o:OriginalCall)=>(await f.admin.query('SELECT amount,settled_amount,state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];
 const retryInput=(r:Parameters<typeof encodeLocalRequest>[0],previous:OriginalCall,requester:'engine'|'adapter')=>{const request=encodeLocalRequest({...r,original:{tenantId:previous.tenantId,spaceId:previous.spaceId,operationId:previous.operationId,attemptId:randomUUID(),reservationId:randomUUID()}});return {previous,request,requester,key:randomUUID(),expiresAt:expires(),route:f.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2}};};
 const caller=async()=>{const c=await launchOwned(resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/usage-caller-process.js'),'FABRIC_MODEL_USAGE_CALLER',{controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl'],url:f.adapterUrl(),transportToken:f.transportToken,ownerId:f.ownerId,route:f.profile.route,profileDigest:f.profile.profileDigest});children.push(c);return c;};
 const call=async(c:OwnedProcess,kind:string,input:Record<string,unknown>)=>{const before=c.messages.length;await control(c,{kind,...input});await waitUntil(async()=>c.messages.slice(before).some(m=>m['kind']==='result'),'usage caller result');return c.messages.slice(before).find(m=>m['kind']==='result')!;};
 await t.test('coordinated-three-attempts-seal-charged-failure-success-deny-fourth-and-duplicate-retries',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service();await svc.prepare(a.scope,input);const first=input.request.original;
  const permit=await svc.model.claim(a.scope,first.attemptId);assert.ok(permit);
  assert.equal((await svc.seal(a.scope,first)).status,'sealed-not-accepted');assert.equal((await reservation(first)).state,'released');
  assert.equal((await svc.seal(a.scope,first)).status,'sealed-not-accepted');assert.equal(await count('model_resolutions',first),1);
  await assert.rejects(f.adapterClient().accept(input.request),code('STALE_FENCE'));
  const second=retryInput(input.request,first,'adapter');const results=await Promise.all([svc.takeRetry(a.scope,second),l.service().takeRetry(a.scope,second)]);assert.ok(results.every(r=>r.attempt.ordinal===2));
  await f.schedule(second.request.original,{outcome:'known-failure',usage:'manual'});assert.equal((await svc.dispatch(a.scope,second.request.original)).status,'accepted');await f.finalize(second.request.original);
  const charged=await svc.reconcile(a.scope,second.request.original);assert.equal(charged.status,'settled');if(charged.observation.status==='settled'){assert.equal(charged.observation.receipt.outcome,'known-failure');assert.equal(charged.observation.receipt.measuredUnits,measuredCost(second.request.payload,'').total);}
  const third=retryInput(input.request,second.request.original,'engine');const prepared=await svc.takeRetry(a.scope,third);assert.equal(prepared.attempt.ordinal,3);
  await f.schedule(third.request.original,{usage:'manual'});assert.equal((await svc.dispatch(a.scope,third.request.original)).status,'accepted');await f.finalize(third.request.original);assert.equal((await svc.reconcile(a.scope,third.request.original)).status,'settled');
  const fourth=retryInput(input.request,third.request.original,'adapter');const before=await l.snapshot(),counters=await f.counters();await assert.rejects(svc.takeRetry(a.scope,fourth),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));assert.deepEqual(await l.snapshot(),before);assert.deepEqual(await f.counters(),counters);
  await assert.rejects(svc.takeRetry(a.scope,{...fourth,retryCeiling:3} as typeof fourth),code('INVALID_SCHEMA'));
  const attempts=(await f.admin.query('SELECT ordinal,record FROM fabric.model_attempts WHERE operation_id=$1 ORDER BY ordinal',[first.operationId])).rows;assert.deepEqual(attempts.map(a=>a.ordinal),[1,2,3]);assert.deepEqual(attempts.map(a=>a.record.retryRequester),['engine','adapter','engine']);assert.equal(new Set(attempts.map(a=>a.record.original.reservationId)).size,3);
 });
 await t.test('lost-accepted-ack-kill-caller-adapter-recreate-lookup-only-once-settlement',async()=>{
  const a=await l.task(),input=await a.makeInput(),o=input.request.original,c=await caller();assert.ok((await call(c,'prepare',{input}))['result']);await f.schedule(o,{usage:'manual'},true);
  const dispatched=await call(c,'dispatch',{original:o});assert.equal((dispatched['result'] as {status:string}).status,'unknown');assert.equal((await reservation(o)).state,'unknown');const counters=await f.counters();
  await stopOwned(c,'SIGKILL');await f.restart('SIGKILL');const recreated=await caller();
  assert.equal((await call(recreated,'dispatch',{original:o}))['error'],'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
  assert.equal((await call(recreated,'reconcile',{original:o}))['result']!==undefined,true);assert.equal((await reservation(o)).state,'unknown');
  await f.finalize(o);const settled=await call(recreated,'reconcile',{original:o});assert.equal((settled['result'] as {status:string}).status,'settled');
  const svc=l.service();await Promise.all([svc.reconcile(a.scope,o),l.service().reconcile(a.scope,o),svc.reconcile(a.scope,o)]);assert.equal(await count('model_resolutions',o),1);assert.equal((await f.counters())['acceptance'],counters['acceptance']);assert.equal(await count('model_claims',o),1);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE reservation_id=$1',[o.reservationId])).rows[0].n,1);
  await stopOwned(recreated);
 });
 await t.test('restored-unclaimed-prepare-lookup-keeps-reserve-explicit-current-dispatch-only',async()=>{
  const a=await l.task(),input=await a.makeInput(),o=input.request.original;await l.service().prepare(a.scope,input);const restored=l.service();
  assert.equal((await restored.reconcile(a.scope,o)).status,'unknown');assert.equal(await count('model_claims',o),0);assert.equal((await reservation(o)).state,'active');
  await f.schedule(o,{usage:'manual'});assert.equal((await restored.dispatch(a.scope,o)).status,'accepted');assert.equal(await count('model_claims',o),1);await f.finalize(o);await restored.reconcile(a.scope,o);
 });
 await t.test('empty-lookup-held-unknown-explicit-seal-releases-and-blocks-late-accept',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);const permit=await svc.model.claim(a.scope,o.attemptId);assert.ok(permit);
  const result=await svc.reconcile(a.scope,o);assert.equal(result.status,'unknown');assert.equal(result.replayAllowed,false);assert.equal((await reservation(o)).state,'unknown');assert.equal(await count('model_resolutions',o),0);
  await assert.rejects(svc.dispatch(a.scope,o),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));await assert.rejects(svc.takeRetry(a.scope,retryInput(input.request,o,'engine')),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  await f.arm('pre-accept');const late=f.adapterClient().accept(input.request).then(()=>{throw new Error('late accept permitted');},e=>assert.equal(e.code,'STALE_FENCE'));await f.reached('pre-accept',o);
  assert.equal((await svc.seal(a.scope,o)).status,'sealed-not-accepted');await f.release('pre-accept');await late;assert.equal((await reservation(o)).state,'released');assert.equal((await f.journal(o)).status,'sealed-not-accepted');
 });
 await t.test('accept-and-reconcile-serialize-with-real-native-blocker-never-release-on-absence',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await f.arm('owner-commit');
  const dispatch=svc.dispatch(a.scope,o);await f.reached('owner-commit',o);let done=false;const reconcile=l.service().seal(a.scope,o).then(r=>{done=true;return r;});
  await waitUntil(async()=>(await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[f.roles.controller])).rowCount!>0,'usage actual native serialization');assert.equal(done,false);assert.equal((await reservation(o)).state,'active');
  await f.release('owner-commit');assert.equal((await dispatch).status,'accepted');assert.equal((await reconcile).status,'accepted');assert.equal(await count('model_resolutions',o),0);assert.equal((await reservation(o)).state,'active');await f.finalize(o);await svc.reconcile(a.scope,o);
 });
 await t.test('bounded-acceptance-timeout-retains-reserve-and-inference-delay-does-not-hold-fence',async()=>{
  const a=await l.task(),input=await a.makeInput(),o=input.request.original;const svc=l.service({},[l.installed()],150);await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await f.arm('pre-accept');
  const work=svc.dispatch(a.scope,o);await f.reached('pre-accept',o);assert.equal((await work).status,'unknown');assert.equal((await reservation(o)).state,'unknown');assert.equal(await count('model_claims',o),1);
  await f.release('pre-accept');await waitUntil(async()=>!!await f.journal(o),'late timed-out acceptance');await f.finalize(o);await svc.reconcile(a.scope,o);
  const b=await l.task(),next=await b.makeInput(),normal=l.service();await normal.prepare(b.scope,next);await f.schedule(next.request.original,{usage:'manual',durationMs:700});await normal.dispatch(b.scope,next.request.original);
  // An independent current DB transaction can acquire the unchanged native Space
  // fence while inference has no usage. No inference wait is in the accept tx.
  await f.uow.withScope(b.scope,async tx=>{await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(['recovery-space-barrier',f.tenant,f.space])]);});assert.equal((await f.journal(next.request.original)).status,'accepted');await f.finalize(next.request.original);await normal.reconcile(b.scope,next.request.original);
 });
 await t.test('caller-schema-owner-binding-conflicting-receipts-and-original-attribution',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await svc.dispatch(a.scope,o);await f.finalize(o);
  const before=await l.snapshot(),counters=await f.counters();
  for(const extra of [{outcome:'answer'},{units:0},{ownerId:f.ownerId},{payerId:f.actors[3]},{receipt:{}}])await assert.rejects(svc.reconcile(a.scope,{...o,...extra}));
  await assert.rejects(svc.reconcile(a.scope,{...o,requestDigest:'sha256:'+'f'.repeat(64)}),code('CHECK_BINDING_MISMATCH'));await assert.rejects(svc.reconcile(await f.scopeFor(1,f.otherSpace),o),code('SCOPE_MISMATCH'));assert.deepEqual(await l.snapshot(),before);assert.deepEqual(await f.counters(),counters);
  const settled=await svc.reconcile(a.scope,o);assert.equal(settled.status,'settled');const snapshot=await l.snapshot();
  const observation=(await f.journal(o)).receipt as UsageReceipt;
  const badPort={...l.installed(),port:{accept:async()=>({status:'unknown',original:o} as OwnerObservation),lookup:async()=>({status:'settled',receipt:{...observation,measuredUnits:observation.measuredUnits+1,components:{...observation.components,model:observation.components.model+1}}} as OwnerObservation),cancel:f.adapterClient().cancel.bind(f.adapterClient()),sealUnaccepted:f.adapterClient().sealUnaccepted.bind(f.adapterClient())}};
  await assert.rejects(l.service({},[badPort]).reconcile(a.scope,o),code('IDEMPOTENCY_CONFLICT'));assert.deepEqual(await l.snapshot(),snapshot);
  await assert.rejects(l.usage().install(a.scope,o,{...l.installed(),ownerId:randomUUID()}),code('IDEMPOTENCY_CONFLICT'));
  const row=(await f.admin.query('SELECT b.record,u.receipt FROM fabric.usage_settlements u JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) JOIN fabric.model_billing_bindings b USING(tenant_id,space_id,run_id) WHERE u.reservation_id=$1',[o.reservationId])).rows[0];assert.deepEqual(row.record,a.binding);assert.equal(row.receipt.original.attemptId,o.attemptId);
 });
 await t.test('one-owner-usage-key-cannot-settle-a-second-Space-original',async()=>{
  const a=await l.task(),first=await a.makeInput(),svc=l.service();await svc.prepare(a.scope,first);await f.schedule(first.request.original,{usage:'manual'});await svc.dispatch(a.scope,first.request.original);await f.finalize(first.request.original);const known=await svc.reconcile(a.scope,first.request.original);assert.equal(known.observation.status,'settled');if(known.observation.status!=='settled')throw new Error('expected known receipt');
  const b=await l.task({space:f.otherSpace}),second=await b.makeInput(),o=second.request.original;await svc.prepare(b.scope,second);await f.schedule(o,{usage:'manual'});await svc.dispatch(b.scope,o);await f.finalize(o);
  const actual=(await f.journal(o)).receipt as UsageReceipt,duplicate={...actual,usageKey:known.observation.receipt.usageKey};
  const badPort={...l.installed(),port:{accept:f.adapterClient().accept.bind(f.adapterClient()),lookup:async()=>({status:'settled',receipt:duplicate} as OwnerObservation),cancel:f.adapterClient().cancel.bind(f.adapterClient()),sealUnaccepted:f.adapterClient().sealUnaccepted.bind(f.adapterClient())}};
  const before=await l.snapshot();await assert.rejects(l.service({},[badPort]).reconcile(b.scope,o),code('IDEMPOTENCY_CONFLICT'));assert.deepEqual(await l.snapshot(),before);assert.equal((await reservation(o)).state,'active');await svc.reconcile(b.scope,o);
 });
 await t.test('atomic-usage-fault-after-real-settlement-rolls-back-every-category-event-audit-and-balance',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await svc.dispatch(a.scope,o);await f.finalize(o);
  for(const stage of ['usage','audit','outbox']){
   const before=await l.snapshot();let reached=false;
   const failing=l.service({async afterUsage(tx){if(stage==='usage'){reached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}},async afterStage(s,tx){if(s===stage){reached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_'+stage+" WHERE command_key=$1",['usage:'+o.attemptId+':settled'])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}}});
   await assert.rejects(failing.reconcile(a.scope,o));assert.ok(reached);assert.deepEqual(await l.snapshot(),before);assert.equal((await reservation(o)).state,'active');
  }
  await svc.reconcile(a.scope,o);assert.equal(await count('model_resolutions',o),1);
 });
 await t.test('genuine-settlement-commit-ambiguity-recreates-and-recovers-original-once',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await svc.dispatch(a.scope,o);await f.finalize(o);
  const { PostgresUnitOfWork }=await import('../../../g1-foundations/src/postgres-uow.js');const { AuthenticatedUnitOfWork }=await import('../../../g1-identity/src/authenticated-uow.js');
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.foundation.pool,()=>{throw new Error('lost usage commit ACK');}),bindingFor:f.bindingFor}),broken=new ModelService(new ModelRepository(uow,l.authority),new UsageRepository(uow,l.authority),[l.installed()]);
  await assert.rejects(broken.reconcile(a.scope,o),(e:unknown)=>e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT');assert.equal((await reservation(o)).state,'settled');assert.equal(await count('model_resolutions',o),1);const before=await l.snapshot();await l.service().reconcile(a.scope,o);assert.deepEqual(await l.snapshot(),before);
 });
 await t.test('unknown-never-releases-on-cancel-adapter-outage-or-restart',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;const startExposure=await svc.usage.exposure(a.scope);await svc.prepare(a.scope,input);const preparedExposure=await svc.usage.exposure(a.scope);assert.equal(preparedExposure.pendingExposure,startExposure.pendingExposure);await f.schedule(o,{usage:'never'});await svc.dispatch(a.scope,o);assert.equal((await svc.cancel(a.scope,o)).status,'accepted');assert.equal((await reservation(o)).state,'active');
  const c=await f.counters();await f.restart('SIGKILL');const current=l.service();assert.equal((await current.reconcile(a.scope,o)).status,'accepted');assert.equal((await reservation(o)).state,'active');assert.equal((await f.counters())['acceptance'],c['acceptance']);await assert.rejects(current.dispatch(a.scope,o),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));await assert.rejects(current.takeRetry(a.scope,retryInput(input.request,o,'adapter')),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  const unavailable=new LocalAdapterClient('http://127.0.0.1:1',f.transportToken,f.ownerId,100);assert.equal((await l.service({},[{...l.installed(),port:unavailable}]).reconcile(a.scope,o)).status,'unknown');assert.equal((await reservation(o)).state,'unknown');assert.equal(await count('model_resolutions',o),0);
  const exposure=await current.usage.exposure(a.scope);assert.ok(exposure.reserved>=Number((await reservation(o)).amount));assert.equal(exposure.pendingExposure,startExposure.pendingExposure+5);assert.equal(exposure.maximumLocalExposure,exposure.reserved+exposure.pendingExposure);
  await f.finalize(o);await current.reconcile(a.scope,o);
 });
 await t.test('R20-M23-native-ledger-fault-receipt-deficit-cover-conservation-and-M26-conformance',async()=>{
  // Explicit ledger primitive diagnostic: validates R20/M23 arithmetic under
  // actual native billing and original-owner journal. This deliberately injected
  // tariff/usage fault is NOT a JSON-byte pricing qualification or B01 fixture.
  for(const measured of [23,26]){
   const a=await l.task({ceiling:100}),input=await a.makeInput(),o=input.request.original;
   await f.uow.withScope(a.scope,tx=>new TransactionBudgetRepository(tx).reserve(a.binding.runId,o,{model:18,service:2}));
   const operation={schemaVersion:1,tenantId:f.tenant,spaceId:f.space,operationId:o.operationId,taskId:a.binding.taskId,runId:a.binding.runId,sessionId:a.binding.sessionId,sessionTurn:3,originalKey:input.command.key,requestDigest:o.requestDigest,bindingDigest:hash(a.binding),retryCeiling:3,attemptsTaken:1,status:'prepared',knownReceiptId:null};
   const attempt={schemaVersion:1,original:o,ordinal:1,profileDigest:input.request.profileDigest,contextDigest:input.request.contextDigest,route:input.route,retryRequester:'engine',dispatchEpoch:1,claimId:null,status:'prepared'};
   await f.admin.query('INSERT INTO fabric.model_sessions VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[f.tenant,f.space,a.binding.sessionId,a.binding.taskId,a.binding.runId,JSON.stringify(a.binding),JSON.stringify(a.origin)]);
   await f.admin.query('INSERT INTO fabric.model_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)',[f.tenant,f.space,o.operationId,a.scope.actorId,a.binding.taskId,a.binding.runId,a.binding.sessionId,input.command.key,o.requestDigest,hash(a.binding),JSON.stringify(a.binding),JSON.stringify(input.request),JSON.stringify(operation)]);
   await f.admin.query('INSERT INTO fabric.model_attempts VALUES($1,$2,$3,$4,$5,1,$6::jsonb,$7::jsonb)',[f.tenant,f.space,o.attemptId,o.operationId,o.reservationId,JSON.stringify(input.request),JSON.stringify(attempt)]);
   const svc=l.service();await svc.usage.install(a.scope,o,l.installed());assert.ok(await svc.model.claim(a.scope,o.attemptId));await f.schedule(o,{usage:'manual'});await f.adapterClient().accept(input.request);await f.finalize(o);
   const receipt=(await f.journal(o)).receipt as UsageReceipt;const fault={...receipt,measuredUnits:measured,components:{...receipt.components,model:measured-2,service:2}};
   // Fault composition supplies an immutable separately persisted owner observation;
   // the real adapter's accepted immutable usage is retained without modification.
   if(measured===23){await f.admin.query('CREATE TABLE public.model_usage_fault_fixture(attempt_id uuid PRIMARY KEY,observation jsonb NOT NULL)');await f.admin.query('CREATE TRIGGER fixture_fault_immutable BEFORE UPDATE OR DELETE ON public.model_usage_fault_fixture FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()');}
   await f.admin.query('INSERT INTO public.model_usage_fault_fixture VALUES($1,$2::jsonb)',[o.attemptId,JSON.stringify({status:'settled',receipt:fault})]);
   const faultPort={...l.installed(),port:{accept:f.adapterClient().accept.bind(f.adapterClient()),lookup:async(original:OriginalCall)=>{assert.deepEqual(original,o);return (await f.admin.query('SELECT observation FROM public.model_usage_fault_fixture WHERE attempt_id=$1',[original.attemptId])).rows[0].observation as OwnerObservation;},cancel:f.adapterClient().cancel.bind(f.adapterClient()),sealUnaccepted:f.adapterClient().sealUnaccepted.bind(f.adapterClient())}};
   const faultService=l.service({},[faultPort]);
   const result=await faultService.reconcile(a.scope,o);assert.equal(result.conformance,measured<=25);assert.deepEqual(await reservation(o),{amount:'20',settled_amount:'20',state:'settled'});assert.equal((await f.admin.query('SELECT amount FROM fabric.model_deficits WHERE attempt_id=$1',[o.attemptId])).rows[0].amount,String(measured-20));
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_deficit_accounts WHERE attempt_id=$1 AND account_id=$2',[o.attemptId,aggregate])).rows[0].n,1);
   const beforeCover=await svc.usage.exposure(a.scope);assert.ok(beforeCover.economicActual>=measured);assert.ok(beforeCover.uncoveredDeficit>=measured-20);
   const other=await l.task();await assert.rejects(f.uow.withScope(other.scope,tx=>new TransactionBudgetRepository(tx).reserve(other.binding.runId,{...o,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()}, {tool:1})),code('OVERRUN_LIABILITY'));
   const foreignSpaceTask=await l.task({space:f.otherSpace});await assert.rejects(f.uow.withScope(foreignSpaceTask.scope,tx=>new TransactionBudgetRepository(tx).reserve(foreignSpaceTask.binding.runId,{...o,spaceId:f.otherSpace,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},{tool:1})),code('OVERRUN_LIABILITY'));
   const owner=await f.scopeFor(0),cover={original:o,key:randomUUID(),expiresAt:expires()};await assert.rejects(svc.usage.cover(a.scope,cover),code('UNAUTHORIZED'));
   const top={allowanceId:a.leaf,addedUnits:1,key:randomUUID(),expiresAt:expires()};await svc.model.topUp(owner,top);await assert.rejects(f.uow.withScope(other.scope,tx=>new TransactionBudgetRepository(tx).reserve(other.binding.runId,{...o,attemptId:randomUUID(),reservationId:randomUUID()}, {tool:1})),code('OVERRUN_LIABILITY'));
   const balances=(await f.admin.query('SELECT ceiling,settled,reserved FROM fabric.budget_allowances WHERE allowance_id=$1',[a.leaf])).rows[0],accountBefore=(await f.admin.query('SELECT ceiling,settled,reserved FROM fabric.model_accounts WHERE account_id=$1',[aggregate])).rows[0];const covered=await svc.usage.cover(owner,cover);assert.equal(covered.coveredUnits,measured-20);assert.equal(covered.autoResumed,false);const snap=await l.snapshot();assert.deepEqual(await svc.usage.cover(owner,cover),covered);await faultService.reconcile(a.scope,o);assert.deepEqual(await l.snapshot(),snap);
   const after=(await f.admin.query('SELECT ceiling,settled,reserved FROM fabric.budget_allowances WHERE allowance_id=$1',[a.leaf])).rows[0];assert.equal(Number(after.ceiling),Number(balances.ceiling)+measured-20);assert.equal(Number(after.settled),measured);assert.equal(after.reserved,'0');const accountAfter=(await f.admin.query('SELECT ceiling,settled,reserved FROM fabric.model_accounts WHERE account_id=$1',[aggregate])).rows[0];assert.equal(Number(accountAfter.ceiling),Number(accountBefore.ceiling)+measured-20);assert.equal(Number(accountAfter.settled),Number(accountBefore.settled)+measured-20);assert.equal(accountAfter.reserved,accountBefore.reserved);assert.equal((await svc.usage.exposure(a.scope)).economicActual,beforeCover.economicActual);assert.equal((await svc.usage.exposure(a.scope)).uncoveredDeficit,beforeCover.uncoveredDeficit-(measured-20));
   await assert.rejects(svc.usage.cover(owner,{...cover,key:randomUUID()}),code('IDEMPOTENCY_CONFLICT'));
   const categories=(await f.admin.query('SELECT sum(amount)::text AS total FROM fabric.model_usage_categories WHERE attempt_id=$1',[o.attemptId])).rows[0];assert.equal(categories.total,String(measured));await assert.rejects(f.admin.query('UPDATE public.model_usage_fault_fixture SET observation=$2::jsonb WHERE attempt_id=$1',[o.attemptId,JSON.stringify({status:'unknown',original:o})]));
   await assert.rejects(f.admin.query('UPDATE fabric.model_resolutions SET measured=0 WHERE attempt_id=$1',[o.attemptId]));await assert.rejects(f.admin.query('DELETE FROM fabric.model_deficits WHERE attempt_id=$1',[o.attemptId]));
  }
 });
 await t.test('settlement-recognizes-original-liability-after-native-stop-without-reopening-task',async()=>{
  const a=await l.task(),input=await a.makeInput(),svc=l.service(),o=input.request.original;await svc.prepare(a.scope,input);await f.schedule(o,{usage:'manual'});await svc.dispatch(a.scope,o);
  // Same native stopped fence, installed by the accepted Stop owner in f04-06.
  // This component injects its persisted fence without altering any accepted guard.
  await f.admin.query('INSERT INTO fabric.recovery_task_controls(tenant_id,space_id,task_id,blocked) VALUES($1,$2,$3,true)',[f.tenant,f.space,a.binding.taskId]);
  await svc.cancel(a.scope,o);assert.equal((await reservation(o)).state,'active');await f.finalize(o);assert.equal((await svc.reconcile(a.scope,o)).status,'settled');await assert.rejects(svc.dispatch(a.scope,o));
  assert.equal((await f.admin.query('SELECT blocked FROM fabric.recovery_task_controls WHERE task_id=$1',[a.binding.taskId])).rows[0].blocked,true);assert.equal(await count('model_claims',o),1);
 });
 await t.test('late-current-session-expiry-after-real-usage-and-audit-rolls-back-no-disclosure',async()=>{
  const x=await createUsageFixture(),g=x.f;try{
   const a=await x.task(),input=await a.makeInput(),o=input.request.original,svc=x.service();await svc.prepare(a.scope,input);await g.schedule(o,{usage:'manual'});await svc.dispatch(a.scope,o);await g.finalize(o);
   const before=await x.snapshot(),identity=g.bindingFor(a.scope);let reached=false;
   await g.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '400 milliseconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[identity.issuer,identity.subject,identity.sessionId]);
   const expired=x.service({async afterStage(stage,tx){if(stage==='audit'){reached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0]?.['n'],1);await tx.query('SELECT pg_sleep(0.5)');}}});
   await assert.rejects(expired.reconcile(a.scope,o));assert.ok(reached);assert.deepEqual(await x.snapshot(),before);assert.equal((await g.admin.query('SELECT state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].state,'active');
  }finally{await x.close();}
 });
 await t.test('usage-rls-immutable-resolution-nonowner-no-direct-ledger-access',async()=>{
  const names=['model_receipt_owners','model_resolutions','model_usage_categories','model_deficits','model_deficit_allowances','model_deficit_accounts','model_deficit_covers'];
  const rows=(await f.admin.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1::text[])', [names])).rows;assert.equal(rows.length,names.length);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  for(const pool of [f.worker,f.client,f.receiptOwner]){await assert.rejects(pool.query('SELECT * FROM fabric.model_resolutions'));await assert.rejects(pool.query('SELECT fabric.model_apply_observation($1,$2::jsonb)',[randomUUID(),JSON.stringify({status:'unknown',original:f.original()})]));}
  assert.equal((await f.admin.query('SELECT version FROM public.fabric_model_migrations ORDER BY version')).rows.map(r=>r.version).join(','),'1,2,3,4,5,12,13');
  const exposure=await l.usage().exposure(baseScope);assert.ok(exposure.economicActual>0);assert.equal(exposure.conformance,false);
 });
});
