import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResourceFixture } from '../helpers/resource-fixture.js';
import { ResourceRepository } from '../../src/resource-repository.js';
import { ResourceReceiptSchema,resourceUnits } from '../../src/resource-contract.js';
import { NativeSession } from '../../src/native-session.js';
import { ModelService } from '../../src/model-service.js';
import { ModelError } from '../../src/errors.js';
import { waitUntil,stopOwned } from '../helpers/process-fixture.js';
const code=(c:string)=>(e:unknown)=>e instanceof ModelError&&e.code===c;
const expires=()=>new Date(Date.now()+60_000).toISOString();
test('RESOURCE/interval-lifecycle',async t=>{
 const r=await createResourceFixture(),{f,n,a,b,repo,resourceId}=r;t.after(r.close);let scope=a.scope;const owner=await f.scopeFor(0);
 const unitsAt=async(id:string)=>Number((await f.admin.query('SELECT settled FROM fabric.budget_allowances WHERE allowance_id=$1',[id])).rows[0].settled);
 const rejectUnchanged=async(work:()=>Promise<unknown>,expected='IDEMPOTENCY_CONFLICT')=>{const before=await r.snapshot();await assert.rejects(work(),code(expected));assert.deepEqual(await r.snapshot(),before);};
 const lifecycle=(action:'archive'|'stop'|'request-suspend'|'declare-delete-retention',at:number)=>repo.lifecycle(owner,{resourceId,key:randomUUID(),expiresAt:expires(),at,action});
 await t.test('strict-receipt-boundary-half-open-overflow-no-model-category',()=>{
  const valid=r.receipt(0,10);assert.equal(resourceUnits(valid),10);
  for(const change of [{end:0},{start:-1},{rateUnits:0},{category:'model'},{assurance:'real-meter'},{rateUnits:1.5},{assignmentGeneration:-1},{originRunId:'foreign'},{extra:true}])assert.throws(()=>ResourceReceiptSchema.parse({...valid,...change}));
  assert.throws(()=>resourceUnits(ResourceReceiptSchema.parse({...valid,end:Number.MAX_SAFE_INTEGER,rateUnits:2})),code('NUMERIC_OVERFLOW'));
 });
 let sharedId:string;
 await t.test('observed-independent-PG-duplicate-race-one-Space-ledger-charge',{timeout:15_000},async()=>{
  const receipt=r.receipt(0,10);sharedId=receipt.receiptId;const p=await r.process(true),q=await r.process();
  const first=r.call(p,'record',{id:sharedId});await waitUntil(async()=>p.messages.some(m=>m['kind']==='audit-held'),'actual audit write held');
  const second=r.call(q,'record',{id:sharedId});await waitUntil(async()=>Number((await f.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND cardinality(pg_blocking_pids(pid))>0",['model-resource-'+q.marker])).rows[0].n)>0,'independent resource duplicate blocked on transaction lock');
  p.child.send({kind:'release'});const responses=await Promise.all([first,second]);for(const response of responses){assert.equal(response['error'],undefined,JSON.stringify(response));assert.deepEqual(response['result'],receipt);}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[sharedId])).rows[0].n,1);
  assert.equal(await unitsAt(r.common.leaf),10);assert.equal(await unitsAt(a.leaf),0);assert.equal(await unitsAt(b.leaf),0);
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_command_receipts WHERE command_key IN($1,$2)",['resource-prepare/'+sharedId,'resource-settle/'+sharedId])).rows[0].n,2);await stopOwned(p);await stopOwned(q);
 });
 await t.test('two-task-views-reference-one-unallocated-shared-charge',async()=>{
  const av=await repo.inspect(scope,resourceId,a.sessionId),bv=await repo.inspect(scope,resourceId,b.sessionId),sv=await repo.inspect(scope,resourceId);
  assert.deepEqual(av.charges,bv.charges);assert.equal(av.charges[0]?.chargeId,sharedId);assert.equal(av.charges[0]?.allocation,'unallocated-shared-cost');assert.equal(av.costs.allocatedTaskActual,0);assert.equal(bv.costs.allocatedTaskActual,0);assert.equal(sv.costs.spaceActual,10);assert.equal(sv.costs.sharedActual,10);
  assert.equal(av.costs.allocatedTaskActual+bv.costs.allocatedTaskActual+sv.costs.sharedActual,sv.costs.spaceActual);assert.equal(sv.actualMeters.includes('unsupported'),true);assert.equal(sv.settlement.productionReserveGuarantee,'unsupported');assert.equal(sv.settlement.modelPendingExposurePerClaimedAttempt,5);
 });
 await t.test('SIGKILL-restart-original-receipt-and-reserve-only-recovery',{timeout:15_000},async()=>{
  const original=await r.process();const before=await r.snapshot();assert.equal((await r.call(original,'record',{id:sharedId}))['error'],undefined);assert.deepEqual(await r.snapshot(),before);await stopOwned(original,'SIGKILL');
  const restarted=await r.process();assert.equal((await r.call(restarted,'record',{id:sharedId}))['error'],undefined);assert.deepEqual(await r.snapshot(),before);
  const receipt=r.receipt(0,2,'network'),pending=await r.process();assert.equal((await r.call(pending,'prepare',{id:receipt.receiptId}))['error'],undefined);await stopOwned(pending,'SIGKILL');
  const reserved=await repo.inspect(scope,resourceId);assert.equal(reserved.costs.reserved,2);const recovery=await r.process();assert.equal((await r.call(recovery,'settle',{id:receipt.receiptId}))['error'],undefined);assert.equal((await repo.inspect(scope,resourceId)).costs.reserved,0);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[receipt.receiptId])).rows[0].n,1);await stopOwned(restarted);await stopOwned(recovery);
 });
 await t.test('overlap-alternate-receipt-active-reserved-and-conflicting-owner-rate-generation',async()=>{
  for(const receipt of [r.receipt(5,15),r.receipt(0,10),r.receipt(0,10,'active-compute'),r.receipt(10,15,'reserved-compute',{rateUnits:2}),r.receipt(10,15,'reserved-compute',{rateVersion:2})])await rejectUnchanged(()=>repo.record(scope,receipt.receiptId));
  const foreignOwner=r.receipt(10,15,'reserved-compute',{ownerId:randomUUID()});await rejectUnchanged(()=>repo.record(scope,foreignOwner.receiptId),'CHECK_BINDING_MISMATCH');
  const generation=r.receipt(10,15,'reserved-compute',{assignmentGeneration:1});await rejectUnchanged(()=>repo.record(scope,generation.receiptId),'UNAUTHORIZED');
  const changed={...r.receipts.get(sharedId)!,rateUnits:2};r.receipts.set(sharedId,changed);await rejectUnchanged(()=>repo.record(scope,sharedId));r.receipts.set(sharedId,{...changed,rateUnits:1});
 });
 await t.test('adjacency-and-explicit-policy-split-spanning-receipt-refused',async()=>{
  const adjacent=r.receipt(10,20,'active-compute');await repo.record(scope,adjacent.receiptId);assert.equal((await repo.inspect(scope,resourceId)).costs.categories['active-compute'],10);
  const spanning=r.receipt(18,22,'network');await rejectUnchanged(()=>repo.record(scope,spanning.receiptId));
  const left=r.receipt(2,20,'network'),right=r.receipt(20,25,'network');await repo.record(scope,left.receiptId);await repo.record(scope,right.receiptId);
  const charges=(await repo.inspect(scope,resourceId)).charges.filter(c=>c.category==='network');assert.deepEqual(charges.map(c=>[c.start,c.end,c.rateVersion,c.amount]),[[0,2,1,2],[2,20,1,18],[20,25,2,10]]);
 });
 await t.test('task-caused-service-cold-start-original-Run-vs-Space-cost',async()=>{
  const taskCharge=r.receipt(0,3,'service',{originRunId:b.binding.runId}),cold=r.receipt(0,2,'cold-start',{originRunId:b.binding.runId});await repo.record(scope,taskCharge.receiptId);await repo.record(scope,cold.receiptId);
  assert.equal(await unitsAt(b.leaf),5);assert.equal(await unitsAt(a.leaf),0);const view=await repo.inspect(scope,resourceId,b.sessionId);assert.equal(view.costs.allocatedTaskActual,5);assert.equal(view.costs.categories['service'],3);assert.equal(view.costs.categories['cold-start'],2);
  assert.equal((await repo.inspect(scope,resourceId,a.sessionId)).charges.some(c=>c.chargeId===taskCharge.receiptId),false);
  const wrong=r.receipt(3,4,'service',{originRunId:randomUUID()});await rejectUnchanged(()=>repo.record(scope,wrong.receiptId),'UNAUTHORIZED');
 });
 await t.test('required-audit-and-outbox-failure-roll-back-reserve-and-settlement',async()=>{
  for(const stage of ['audit','outbox'] as const){const receipt=r.receipt(25,26,'network'),bad=new ResourceRepository(f.uow,r.owner,{afterStage:async current=>{if(current===stage)throw new Error('Injected required '+stage);}}),before=await r.snapshot();await assert.rejects(bad.prepare(scope,receipt.receiptId),new RegExp('Injected required '+stage));assert.deepEqual(await r.snapshot(),before);}
  const receipt=r.receipt(25,26,'network');await repo.prepare(scope,receipt.receiptId);const before=await r.snapshot(),bad=new ResourceRepository(f.uow,r.owner,{afterStage:async stage=>{if(stage==='outbox')throw new Error('Injected settlement outbox');}});await assert.rejects(bad.settle(scope,receipt.receiptId),/Injected settlement outbox/);assert.deepEqual(await r.snapshot(),before);await repo.settle(scope,receipt.receiptId);
 });
 await t.test('foreign-Space-owner-receipt-and-revoked-read-denied',async()=>{
  const foreign=await f.scopeFor(1,f.otherSpace);await assert.rejects(repo.inspect(foreign,resourceId));const receipt=r.receipt(26,27,'network',{spaceId:f.otherSpace});await rejectUnchanged(()=>repo.record(scope,receipt.receiptId),'SCOPE_MISMATCH');
  await assert.rejects(repo.inspect(scope,resourceId,randomUUID()),code('UNAUTHORIZED'));
  await f.admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,scope.actorId]);await assert.rejects(repo.inspect(scope,resourceId));await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,scope.actorId]);scope=await f.scopeFor(1);
 });
 await t.test('no-worker-or-client-ledger-access-and-immutable-resource-history',async()=>{
  const permissions=(await f.admin.query("SELECT has_table_privilege('fabric_worker','fabric.model_resource_intervals','INSERT') AS worker,has_table_privilege('fabric_test_idp','fabric.model_resource_bindings','SELECT') AS client,has_table_privilege('fabric_controller','fabric.model_resource_rates','INSERT') AS rates")).rows[0];assert.deepEqual(permissions,{worker:false,client:false,rates:false});
  await assert.rejects(f.admin.query('UPDATE fabric.model_resource_intervals SET amount=amount+1 WHERE receipt_id=$1',[sharedId]));await assert.rejects(f.admin.query('DELETE FROM fabric.model_resource_intervals WHERE receipt_id=$1',[sharedId]));
 });
 await t.test('prepared-task-cost-settles-after-Stop-new-cost-and-fenced-child-refused',async()=>{
  const child=await n.task({parentTaskId:b.binding.taskId,ceiling:100}),receipt=r.receipt(3,4,'service',{originRunId:b.binding.runId});await repo.prepare(scope,receipt.receiptId);await n.native.session.stop(scope,{sessionId:b.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999});await repo.settle(scope,receipt.receiptId);assert.equal(await unitsAt(b.leaf),6);
  const before=await r.snapshot();await repo.record(scope,receipt.receiptId);assert.deepEqual(await r.snapshot(),before);await assert.rejects(repo.record(scope,r.receipt(4,5,'service',{originRunId:b.binding.runId}).receiptId));assert.deepEqual(await r.snapshot(),before);
  const childBefore=await r.snapshot();await assert.rejects(repo.prepare(scope,r.receipt(4,5,'service',{originRunId:child.binding.runId}).receiptId));assert.deepEqual(await r.snapshot(),childBefore);
 });
 await t.test('lifecycle-current-budget-controller-expiry-idempotency-and-key-conflict',async()=>{
  const command={resourceId,key:randomUUID(),expiresAt:expires(),at:20,action:'archive' as const};await rejectUnchanged(()=>repo.lifecycle(scope,command),'UNAUTHORIZED');await rejectUnchanged(()=>repo.lifecycle(owner,{...command,expiresAt:'2000-01-01T00:00:00.000Z'}),'EXPIRED_COMMAND');
  const result=await repo.lifecycle(owner,command),before=await r.snapshot();assert.deepEqual(await repo.lifecycle(owner,command),result);assert.deepEqual(await r.snapshot(),before);await rejectUnchanged(()=>repo.lifecycle(owner,{...command,action:'stop'}));
  await rejectUnchanged(()=>repo.confirmSuspended(scope,r.proof(20).proofId),'UNAUTHORIZED');
 });
 await t.test('Space-allowance-and-aggregate-exhaustion-no-partial-admission',async()=>{
  const account=await n.account(1,'person'),receipt=r.receipt(26,28,'network');await rejectUnchanged(()=>repo.record(scope,receipt.receiptId),'BUDGET_EXHAUSTED');await f.admin.query('UPDATE fabric.model_accounts SET ceiling=1000000 WHERE account_id=$1',[account]);
  const saved=(await f.admin.query('SELECT ceiling FROM fabric.budget_allowances WHERE allowance_id=$1',[r.common.leaf])).rows[0].ceiling;await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved WHERE allowance_id=$1',[r.common.leaf]);await rejectUnchanged(()=>repo.record(scope,receipt.receiptId),'BUDGET_EXHAUSTED');await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2 WHERE allowance_id=$1',[r.common.leaf,saved]);await repo.record(scope,receipt.receiptId);assert.equal((await f.admin.query('SELECT settled FROM fabric.model_accounts WHERE account_id=$1',[account])).rows[0].settled,'4');
 });
 await t.test('wait-Stop-archive-and-unknown-suspend-keep-compute-storage-costs',async()=>{
  const counters=await f.counters();assert.equal((await n.native.session.inspect(scope,a.sessionId)).wait?.reason,'resource');
  const archive=await lifecycle('archive',20) as {action:string};assert.equal(archive.action,'archive');assert.equal((await n.native.session.inspect(scope,a.sessionId)).state,'waiting');
  await n.native.session.stop(scope,{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999});await lifecycle('stop',20);await lifecycle('request-suspend',20);
  const compute=r.receipt(20,30),storage=r.receipt(0,30,'retained-storage');await rejectUnchanged(()=>repo.record(scope,storage.receiptId));await repo.record(scope,compute.receiptId);await repo.record(scope,r.receipt(0,20,'retained-storage').receiptId);await repo.record(scope,r.receipt(20,30,'retained-storage').receiptId);
  assert.equal((await repo.inspect(scope,resourceId)).compute,'billable; suspension/termination unconfirmed');assert.equal((await n.native.session.inspect(scope,a.sessionId)).state,'cancelling');assert.deepEqual(await f.counters(),counters);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
  const stoppedTask=r.receipt(3,4,'service',{originRunId:a.binding.runId});await assert.rejects(repo.record(scope,stoppedTask.receiptId));
 });
 await t.test('confirm-simulated-suspend-stops-future-compute-storage-persists-delete-retention-is-declarative',async()=>{
  const proof=r.proof(30);const bad=r.proof(29);await rejectUnchanged(()=>repo.confirmSuspended(owner,bad.proofId));await repo.confirmSuspended(owner,proof.proofId);const before=await r.snapshot();await repo.confirmSuspended(owner,proof.proofId);assert.deepEqual(await r.snapshot(),before);
  for(const category of ['active-compute','reserved-compute','cold-start'] as const)await rejectUnchanged(()=>repo.record(scope,r.receipt(30,31,category).receiptId));
  await repo.record(scope,r.receipt(30,40,'retained-storage').receiptId);await lifecycle('declare-delete-retention',35);await repo.record(scope,r.receipt(40,50,'retained-storage').receiptId);
  const view=await repo.inspect(scope,resourceId);assert.equal(view.confirmedSuspendAt,30);assert.equal(view.compute,'confirmed-simulated-suspended');assert.equal(view.storage.includes('continuing'),true);assert.equal(view.costs.categories['retained-storage'],80);assert.equal(view.lifecycle.some(e=>e.action==='declare-delete-retention'),true);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_bindings')).rows[0].n,1);const row=(await f.admin.query("SELECT key FROM fabric.model_resource_lifecycle WHERE action='declare-delete-retention'")).rows[0];await assert.rejects(f.admin.query('DELETE FROM fabric.model_resource_lifecycle WHERE key=$1',[row.key]));
 });
 await t.test('pending-native-model-plus-five-exposure-disclosed-with-independent-resource-liability',async()=>{
  const known=await n.task({ceiling:100_000}),answered=await n.native.session.requestTurn(scope,{...await n.command(known.sessionId),input:'known categorized usage',choice:null});assert.equal(answered.status,'completed');const knownView=await repo.inspect(scope,resourceId,known.sessionId);assert.equal(knownView.modelLiability?.categoryTotals?.service,2);assert.ok(knownView.modelLiability?.categoryTotals?.model!>0);assert.equal(knownView.modelLiability?.actual,knownView.modelLiability!.categoryTotals!.model+2);
  const task=await n.task({ceiling:100_000}),client=f.adapterClient(),models=new ModelService(n.native.models.model,n.native.models.usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:{...client,accept:async request=>{await f.schedule(request.original,{usage:'never'});return client.accept(request);},lookup:client.lookup.bind(client),cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)}}]);
  const session=new NativeSession(n.native.repository,models,n.native.ports),result=await session.requestTurn(scope,{...await n.command(task.sessionId),input:'pending model usage',choice:null});assert.equal(result.view.wait?.reason,'unknown-usage');const view=await repo.inspect(scope,resourceId,task.sessionId);assert.equal(view.modelLiability?.pendingExposure,5);assert.equal(view.modelLiability?.reserved,result.view.costs.reserved);assert.equal(view.modelLiability?.maximumLocalExposure,result.view.costs.reserved+5);assert.equal(view.costs.allocatedTaskActual,0);assert.equal(view.settlement.productionReserveGuarantee,'unsupported');
 });
 await t.test('nonmodel-settlement-and-checkpoint-at-full-exhaustion-after-Stop-zero-model-units',async()=>{
  const receipt=r.receipt(50,51,'retained-storage');await repo.prepare(scope,receipt.receiptId);const counters=await f.counters();
  for(const id of [...r.common.ids,a.leaf,...b.ids.slice(-2)])await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved WHERE allowance_id=$1',[id]);
  await repo.settle(scope,receipt.receiptId);const record=await lifecycle('archive',51) as {modelUnits:number};assert.equal(record.modelUnits,0);assert.equal((await repo.inspect(scope,resourceId)).costs.reserved,0);assert.deepEqual(await f.counters(),counters);
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_category_reservations c JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,reservation_id) WHERE c.category='model'")).rows[0].n,0);
 });
});
