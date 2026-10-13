import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createResourceFixture } from './resource-fixture.js';
import { waitUntil,stopOwned,census,type OwnedProcess } from './process-fixture.js';
import { ResourceReceiptSchema,resourceUnits } from '../../src/resource-contract.js';
import { ResourceRepository } from '../../src/resource-repository.js';
import { NativeSession } from '../../src/native-session.js';
import { ModelService } from '../../src/model-service.js';
import { ModelError,FoundationError } from '../../src/errors.js';
import type { OriginalCall } from '../../src/contracts.js';

type ResourceFixture=Awaited<ReturnType<typeof createResourceFixture>>;
const code=(wanted:string)=>(e:unknown)=>(e instanceof ModelError||e instanceof FoundationError)&&e.code===wanted;
const expires=()=>new Date(Date.now()+60_000).toISOString();
async function unchanged(r:ResourceFixture,work:()=>Promise<unknown>,wanted='IDEMPOTENCY_CONFLICT'){
 const before=await r.snapshot();await assert.rejects(work(),code(wanted));assert.deepEqual(await r.snapshot(),before);
}
async function settled(r:ResourceFixture,id:string){return Number((await r.f.admin.query('SELECT settled FROM fabric.budget_allowances WHERE allowance_id=$1',[id])).rows[0].settled);}
async function blockers(r:ResourceFixture,p:OwnedProcess){return (await r.f.admin.query("SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1 AND cardinality(pg_blocking_pids(pid))>0",['model-resource-'+p.marker])).rows;}

/** N07 uses only owner-issued synthetic intervals and explicit native dispatch fences. */
export async function nativeResourceLifecycleCases(t:TestContext,r:ResourceFixture){
 const {n,f,repo,resourceId,a,b}=r,scope=a.scope,owner=await f.scopeFor(0);
 const lifecycle=(action:'archive'|'stop'|'request-suspend'|'declare-delete-retention',at:number)=>repo.lifecycle(owner,{resourceId,key:randomUUID(),expiresAt:expires(),at,action});
 const clock:Array<{at:number;phase:string;compute:string;storage:number;reserved:number}>=[];
 const capture=async(at:number,phase:string)=>{const view=await repo.inspect(scope,resourceId);clock.push({at,phase,compute:view.compute,storage:view.costs.categories['retained-storage']!,reserved:view.costs.reserved});return view;};
 const pending=await n.task({ceiling:100_000});let original:OriginalCall|undefined;
 const client=f.adapterClient(),models=new ModelService(n.native.models.model,n.native.models.usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:{...client,accept:async request=>{original=request.original;await f.schedule(request.original,{usage:'manual'});return client.accept(request);},lookup:client.lookup.bind(client),cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)}}]);
 const native=new NativeSession(n.native.repository,models,n.native.ports);
 await t.test('N07-pending-inference-original-liability-plus-five-disclosed-separately',async()=>{
  const result=await native.requestTurn(scope,{...await n.command(pending.sessionId),input:'resource lifecycle pending',choice:null});
  assert.equal(result.view.wait?.reason,'unknown-usage');assert.ok(original);assert.equal((await f.journal(original!))?.status,'accepted');
  const view=await repo.inspect(scope,resourceId,pending.sessionId);assert.equal(view.modelLiability?.pendingExposure,5);assert.ok(view.modelLiability!.reserved>0);assert.equal(view.modelLiability?.maximumLocalExposure,view.modelLiability!.reserved+5);assert.equal(view.costs.reserved,0);assert.equal(view.costs.allocatedTaskActual,0);assert.equal(view.settlement.productionReserveGuarantee,'unsupported');
 });
 await t.test('N07-archive-without-Stop-preserves-work-wait-and-accepted-inference',async()=>{
  const before=await native.inspect(scope,pending.sessionId),computer=await n.native.session.inspect(scope,a.sessionId),counts=await f.counters();
  assert.equal(computer.wait?.reason,'resource');await repo.record(scope,r.receipt(0,5,'active-compute').receiptId);await repo.record(scope,r.receipt(0,2,'cold-start').receiptId);
  const result=await lifecycle('archive',5) as {realDeletion:boolean;realProvisioning:boolean;termination:string};assert.equal(result.realDeletion,false);assert.equal(result.realProvisioning,false);assert.equal(result.termination,'unknown');
  assert.deepEqual(await native.inspect(scope,pending.sessionId),before);assert.deepEqual(await n.native.session.inspect(scope,a.sessionId),computer);assert.deepEqual(await f.counters(),counts);assert.equal((await f.journal(original!))?.status,'accepted');
  await repo.record(scope,r.receipt(5,10,'reserved-compute').receiptId);const view=await capture(10,'waiting-archived');assert.equal(view.archiveEffect,'conversation only');assert.equal(view.confirmedSuspendAt,null);assert.equal(view.costs.categories['active-compute'],5);assert.equal(view.costs.categories['reserved-compute'],5);
 });
 await t.test('N07-native-Stop-fences-work-but-retains-unknown-and-billable-resource',async()=>{
  const before=await native.inspect(scope,pending.sessionId),counts=await f.counters();
  await native.stop(scope,{sessionId:pending.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999});await n.native.session.stop(scope,{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999});await lifecycle('stop',10);
  const after=await native.inspect(scope,pending.sessionId);assert.equal(after.state,'cancelling');assert.deepEqual(after.pendingModel,before.pendingModel);assert.equal(after.costs.reserved,before.costs.reserved);assert.equal(after.costs.pendingExposure,5);assert.equal((await f.counters())['accept'],counts['accept']);
  await repo.record(scope,r.receipt(10,20,'active-compute').receiptId);await repo.record(scope,r.receipt(0,20,'retained-storage').receiptId);await repo.record(scope,r.receipt(0,20,'network').receiptId);
  const view=await capture(20,'native-stopped');assert.equal(view.compute,'billable; suspension/termination unconfirmed');assert.equal(view.stopEffect,'native Task dispatch fence; no resource termination proof');assert.equal((await f.journal(original!))?.status,'accepted');assert.equal((await f.journal(original!))?.receipt,null);
 });
 await t.test('N07-unknown-suspension-ack-keeps-all-clock-categories-billable',async()=>{
  const counts=await f.counters();await lifecycle('request-suspend',20);
  for(const receipt of [r.receipt(20,30,'reserved-compute'),r.receipt(20,30,'retained-storage'),r.receipt(20,30,'network'),r.receipt(20,21,'cold-start')])await repo.record(scope,receipt.receiptId);
  const view=await capture(30,'suspend-ack-unknown');assert.equal(view.confirmedSuspendAt,null);assert.equal(view.costs.categories['active-compute'],15);assert.equal(view.costs.categories['reserved-compute'],25);assert.equal(view.costs.categories['cold-start'],4);assert.equal(view.costs.categories['network'],40);assert.equal(view.costs.categories['retained-storage'],40);assert.deepEqual(await f.counters(),counts);assert.equal((await native.inspect(scope,pending.sessionId)).costs.pendingExposure,5);
 });
 await t.test('N07-confirmation-authority-key-generation-owner-and-boundary-refusals',async()=>{
  const current=r.proof(30);await unchanged(r,()=>repo.confirmSuspended(scope,current.proofId),'UNAUTHORIZED');
  const earlier=r.proof(29);await unchanged(r,()=>repo.confirmSuspended(owner,earlier.proofId));
  const stale=r.proof(30);r.proofs.set(stale.proofId,{...stale,assignmentGeneration:1});await unchanged(r,()=>repo.confirmSuspended(owner,stale.proofId),'STALE_FENCE');
  const foreign=r.proof(30);r.proofs.set(foreign.proofId,{...foreign,ownerId:randomUUID()});await unchanged(r,()=>repo.confirmSuspended(owner,foreign.proofId),'CHECK_BINDING_MISMATCH');
  const wrongScope=r.proof(30);r.proofs.set(wrongScope.proofId,{...wrongScope,spaceId:f.otherSpace});await unchanged(r,()=>repo.confirmSuspended(owner,wrongScope.proofId),'SCOPE_MISMATCH');
  const command={resourceId,key:randomUUID(),expiresAt:expires(),at:30,action:'archive' as const};await unchanged(r,()=>repo.lifecycle(scope,command),'UNAUTHORIZED');await unchanged(r,()=>repo.lifecycle(owner,{...command,expiresAt:'2000-01-01T00:00:00.000Z'}),'EXPIRED_COMMAND');
  const result=await repo.lifecycle(owner,command),before=await r.snapshot();assert.deepEqual(await repo.lifecycle(owner,command),result);assert.deepEqual(await r.snapshot(),before);await unchanged(r,()=>repo.lifecycle(owner,{...command,action:'stop'}));
 });
 await t.test('N07-confirmed-simulated-suspend-only-stops-compute-at-half-open-boundary',async()=>{
  const prior=r.receipt(29,30,'cold-start');await repo.prepare(scope,prior.receiptId);const proof=r.proof(30);await repo.confirmSuspended(owner,proof.proofId);await repo.settle(scope,prior.receiptId);
  const before=await r.snapshot();assert.deepEqual(await repo.confirmSuspended(owner,proof.proofId),proof);assert.deepEqual(await r.snapshot(),before);await unchanged(r,()=>repo.confirmSuspended(owner,r.proof(31).proofId));
  for(const category of ['active-compute','reserved-compute','cold-start'] as const){await unchanged(r,()=>repo.record(scope,r.receipt(30,31,category).receiptId));await unchanged(r,()=>repo.record(scope,r.receipt(29,31,category).receiptId));}
  const view=await capture(30,'confirmed-simulated-suspend');assert.equal(view.compute,'confirmed-simulated-suspended');assert.equal(view.confirmedSuspendAt,30);assert.equal(view.costs.categories['cold-start'],6);assert.equal((await native.inspect(scope,pending.sessionId)).costs.pendingExposure,5);assert.equal((await f.journal(original!))?.status,'accepted');
 });
 await t.test('N07-retained-storage-survives-confirmation-and-declared-delete-retention',async()=>{
  await repo.record(scope,r.receipt(30,40,'retained-storage').receiptId);await lifecycle('declare-delete-retention',35);await repo.record(scope,r.receipt(40,50,'retained-storage').receiptId);
  const view=await capture(50,'declared-delete-retention');assert.equal(view.costs.categories['retained-storage'],80);assert.equal(view.storage,'retained; continuing charges under retention policy');assert.equal(view.deleteEffect,'declared retention transition; no real deletion');assert.equal(view.actualMeters,'unsupported; real compute/cold-start/storage/network billing unqualified');assert.equal(view.label,'synthetic-resource-interval-unit');assert.equal(view.assurance,'deterministic-local-only');assert.equal(view.policy,'reserved-until-confirmed-suspended');assert.equal(view.lifecycle.find(e=>e.action==='declare-delete-retention')?.at,35);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_bindings WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows[0].n,1);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
 });
 await t.test('N07-prepared-original-task-settles-after-Stop-fresh-task-cost-refused',async()=>{
  const child=await n.task({parentTaskId:b.binding.taskId,ceiling:100}),receipt=r.receipt(0,3,'service',{originRunId:b.binding.runId});await repo.prepare(scope,receipt.receiptId);
  await n.native.session.stop(scope,{sessionId:b.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999});await repo.settle(scope,receipt.receiptId);assert.equal(await settled(r,b.leaf),3);
  const before=await r.snapshot();await repo.record(scope,receipt.receiptId);assert.deepEqual(await r.snapshot(),before);
  await unchanged(r,()=>repo.record(scope,r.receipt(3,4,'service',{originRunId:b.binding.runId}).receiptId),'UNAUTHORIZED');await unchanged(r,()=>repo.record(scope,r.receipt(3,4,'service',{originRunId:child.binding.runId}).receiptId),'STALE_AUTHORITY');
 });
 await t.test('N07-full-model-and-Space-exhaustion-control-settlement-checkpoint-zero-model',async()=>{
  const receipt=r.receipt(50,51,'retained-storage');await repo.prepare(scope,receipt.receiptId);const counts=await f.counters(),prior=await native.inspect(scope,pending.sessionId);
  await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved WHERE tenant_id=$1',[f.tenant]);await f.admin.query('UPDATE fabric.model_accounts SET ceiling=settled+reserved WHERE tenant_id=$1',[f.tenant]);
  await repo.settle(scope,receipt.receiptId);const command=await lifecycle('archive',51) as {modelUnits:number};assert.equal(command.modelUnits,0);assert.deepEqual(await f.counters(),counts);assert.deepEqual(await native.inspect(scope,pending.sessionId),prior);
  const view=await capture(51,'exhausted-control-settlement');assert.equal(view.costs.reserved,0);assert.equal(view.settlement.modelUnits,0);assert.equal(view.settlement.productionReserveGuarantee,'unsupported');assert.equal(view.settlement.modelPendingExposurePerClaimedAttempt,5);
  await unchanged(r,()=>repo.prepare(scope,r.receipt(51,52,'retained-storage').receiptId),'BUDGET_EXHAUSTED');
  assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_category_reservations c JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,reservation_id) WHERE c.category='model'")).rows[0].n,0);
  console.log(JSON.stringify({measurement:'N07-native-resource-clock',owner:f.fixtureOwner,clock,modelPendingExposure:prior.costs.pendingExposure,productionReserveGuarantee:'unsupported',actualMeters:'unqualified',ownedProcesses:census().filter(p=>p.ppid===process.pid).map(p=>({pid:p.pid,instance:p.instance}))}));
 });
}

/** N08 exercises owner receipts through independent PostgreSQL callers, not copied view totals. */
export async function nativeSharedResourceCases(t:TestContext,r:ResourceFixture){
 const {n,f,a,b,repo,resourceId}=r,scope=a.scope;
 let sharedId='';
 await t.test('N08-strict-half-open-owner-receipt-unit-boundaries',()=>{
  const valid=r.receipt(0,10);assert.equal(resourceUnits(valid),10);
  for(const change of [{end:0},{start:-1},{rateUnits:0},{rateUnits:1.5},{category:'model'},{assurance:'real-meter'},{assignmentGeneration:-1},{originRunId:'foreign'},{extra:true}])assert.throws(()=>ResourceReceiptSchema.parse({...valid,...change}));
  assert.throws(()=>resourceUnits(ResourceReceiptSchema.parse({...valid,end:Number.MAX_SAFE_INTEGER,rateUnits:2})),code('NUMERIC_OVERFLOW'));
 });
 for(const firstTask of ['a','b'] as const)await t.test('N08-observed-independent-duplicate-race-'+firstTask,{timeout:15_000},async()=>{
  const receipt=r.receipt(firstTask==='a'?0:10,firstTask==='a'?10:20),p=await r.process(true),q=await r.process();if(firstTask==='a')sharedId=receipt.receiptId;
  try{
   const first=r.call(p,'record',{id:receipt.receiptId});await waitUntil(async()=>p.messages.some(m=>m['kind']==='audit-held'),'N08 original receipt held at real audit write');
   const second=r.call(q,'record',{id:receipt.receiptId});await waitUntil(async()=>(await blockers(r,q)).length>0,'N08 independent duplicate actually blocked');const observed=await blockers(r,q);assert.equal(observed[0].wait_event_type,'Lock');assert.ok(observed[0].blockers.length>0);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE receipt_id=$1',[receipt.receiptId])).rows[0].n,0);
   p.child.send({kind:'release'});for(const response of await Promise.all([first,second])){assert.equal(response['error'],undefined,JSON.stringify(response));assert.deepEqual(response['result'],receipt);}
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[receipt.receiptId])).rows[0].n,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE receipt_id=$1',[receipt.receiptId])).rows[0].n,1);
   assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_command_receipts WHERE command_key IN($1,$2)",['resource-prepare/'+receipt.receiptId,'resource-settle/'+receipt.receiptId])).rows[0].n,2);
   console.log(JSON.stringify({measurement:'N08-resource-duplicate-barrier',order:firstTask,receiptId:receipt.receiptId,pids:[p.pid,q.pid],postgres:observed,chargedOnce:true,assurance:'deterministic-local-only'}));
  }finally{p.child.send({kind:'release'});await stopOwned(p);await stopOwned(q);}
 });
 await t.test('N08-two-task-references-single-Space-allowance-unallocated-no-double-total',async()=>{
  const av=await repo.inspect(scope,resourceId,a.sessionId),bv=await repo.inspect(scope,resourceId,b.sessionId),sv=await repo.inspect(scope,resourceId);assert.deepEqual(av.charges,bv.charges);assert.equal(av.charges.length,2);
  assert.equal(av.charges[0]?.chargeId,sharedId);assert.ok(av.charges.every(c=>c.allocation==='unallocated-shared-cost'&&c.originRunId===null));assert.equal(av.costs.allocatedTaskActual,0);assert.equal(bv.costs.allocatedTaskActual,0);assert.equal(sv.costs.spaceActual,20);assert.equal(sv.costs.sharedActual,20);assert.equal(av.costs.allocatedTaskActual+bv.costs.allocatedTaskActual+sv.costs.sharedActual,sv.costs.spaceActual);
  assert.equal(await settled(r,r.common.leaf),20);assert.equal(await settled(r,a.leaf),0);assert.equal(await settled(r,b.leaf),0);assert.equal(sv.attribution.spaceAllowanceId,r.common.leaf);assert.equal(sv.attribution.purpose,'persistent-space-resource');assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows[0].n,1);
 });
 await t.test('N08-SIGKILL-service-recreation-exact-duplicate-and-reserve-only-recovery',{timeout:15_000},async()=>{
  const original=await r.process(),before=await r.snapshot();assert.equal((await r.call(original,'record',{id:sharedId}))['error'],undefined);assert.deepEqual(await r.snapshot(),before);await stopOwned(original,'SIGKILL');
  const restarted=await r.process();try{assert.equal((await r.call(restarted,'record',{id:sharedId}))['error'],undefined);assert.deepEqual(await r.snapshot(),before);}finally{await stopOwned(restarted);}
  const receipt=r.receipt(0,2,'network'),preparing=await r.process();assert.equal((await r.call(preparing,'prepare',{id:receipt.receiptId}))['error'],undefined);await stopOwned(preparing,'SIGKILL');assert.equal((await repo.inspect(scope,resourceId)).costs.reserved,2);
  const recovery=await r.process();try{assert.equal((await r.call(recovery,'settle',{id:receipt.receiptId}))['error'],undefined);assert.equal((await repo.inspect(scope,resourceId)).costs.reserved,0);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[receipt.receiptId])).rows[0].n,1);}finally{await stopOwned(recovery);}
 });
 await t.test('N08-overlap-including-active-reserved-alternation-zero-partial-charge',async()=>{
  for(const receipt of [r.receipt(5,15),r.receipt(0,10),r.receipt(5,15,'active-compute'),r.receipt(19,21,'reserved-compute')])await unchanged(r,()=>repo.record(scope,receipt.receiptId));
 });
 await t.test('N08-rate-version-owner-scope-resource-generation-and-Run-binding-refusals',async()=>{
  for(const extra of [{rateUnits:3},{rateVersion:1}])await unchanged(r,()=>repo.record(scope,r.receipt(20,21,'network',extra).receiptId));
  await unchanged(r,()=>repo.record(scope,r.receipt(20,21,'network',{ownerId:randomUUID()}).receiptId),'CHECK_BINDING_MISMATCH');await unchanged(r,()=>repo.record(scope,r.receipt(20,21,'network',{spaceId:f.otherSpace}).receiptId),'SCOPE_MISMATCH');await unchanged(r,()=>repo.record(scope,r.receipt(20,21,'network',{tenantId:randomUUID()}).receiptId),'SCOPE_MISMATCH');{const before=await r.snapshot();await assert.rejects(repo.record(scope,r.receipt(20,21,'network',{resourceId:randomUUID()}).receiptId),(e:unknown)=>e instanceof Error&&(e as {code?:string}).code==='42501');assert.deepEqual(await r.snapshot(),before);}await unchanged(r,()=>repo.record(scope,r.receipt(20,21,'network',{assignmentGeneration:1}).receiptId),'UNAUTHORIZED');await unchanged(r,()=>repo.record(scope,r.receipt(0,1,'service',{originRunId:randomUUID()}).receiptId),'UNAUTHORIZED');
  const old=r.receipts.get(sharedId)!;for(const change of [{rateUnits:2},{end:9},{originRunId:b.binding.runId}]){r.receipts.set(sharedId,{...old,...change});await unchanged(r,()=>repo.record(scope,sharedId));}r.receipts.set(sharedId,old);
  const foreign=await f.scopeFor(1,f.otherSpace),before=await r.snapshot();await assert.rejects(repo.inspect(foreign,resourceId));assert.deepEqual(await r.snapshot(),before);await unchanged(r,()=>repo.inspect(scope,resourceId,randomUUID()),'UNAUTHORIZED');
 });
 await t.test('N08-adjacent-active-compute-and-explicit-rate-policy-split',async()=>{
  await repo.record(scope,r.receipt(20,25,'active-compute').receiptId);await unchanged(r,()=>repo.record(scope,r.receipt(18,22,'network').receiptId));
  for(const receipt of [r.receipt(2,20,'network'),r.receipt(20,25,'network')])await repo.record(scope,receipt.receiptId);
  const view=await repo.inspect(scope,resourceId);assert.equal(view.costs.categories['active-compute'],10);assert.deepEqual(view.charges.filter(c=>c.category==='network').map(c=>[c.start,c.end,c.rateVersion,c.amount]),[[0,2,1,2],[2,20,1,18],[20,25,2,10]]);assert.deepEqual(view.charges.filter(c=>c.category==='reserved-compute').map(c=>[c.start,c.end]),[[0,10],[10,20]]);
 });
 await t.test('N08-task-caused-service-cold-start-original-Run-lineage-persistent-Space-purpose',async()=>{
  const service=r.receipt(0,3,'service',{originRunId:b.binding.runId}),cold=r.receipt(0,2,'cold-start',{originRunId:b.binding.runId});for(const receipt of [service,cold])await repo.record(scope,receipt.receiptId);
  const av=await repo.inspect(scope,resourceId,a.sessionId),bv=await repo.inspect(scope,resourceId,b.sessionId),sv=await repo.inspect(scope,resourceId);assert.equal(await settled(r,b.leaf),5);assert.equal(await settled(r,a.leaf),0);assert.equal(bv.costs.allocatedTaskActual,5);assert.equal(av.costs.allocatedTaskActual,0);assert.equal(sv.costs.sharedActual,60);assert.equal(sv.costs.spaceActual,65);assert.equal(av.costs.allocatedTaskActual+bv.costs.allocatedTaskActual+sv.costs.sharedActual,sv.costs.spaceActual);assert.equal(av.charges.some(c=>c.chargeId===service.receiptId),false);assert.ok(bv.charges.filter(c=>c.originRunId!==null).every(c=>c.originRunId===b.binding.runId&&c.allocation==='original-run'));
  for(const id of [service.receiptId,cold.receiptId])assert.equal((await f.admin.query('SELECT r.allowance_id FROM fabric.budget_reservations r JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,reservation_id) WHERE i.receipt_id=$1',[id])).rows[0].allowance_id,b.leaf);
  const leaf=(await f.admin.query('SELECT allowance_id FROM fabric.budget_reservations r JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,reservation_id) WHERE i.receipt_id=$1',[sharedId])).rows[0].allowance_id;assert.equal(leaf,r.common.leaf);
 });
 await t.test('N08-account-and-Space-cap-exhaustion-no-partial-reserve',async()=>{
  const account=await n.account(1,'person'),receipt=r.receipt(25,27,'network');await unchanged(r,()=>repo.record(scope,receipt.receiptId),'BUDGET_EXHAUSTED');await f.admin.query('UPDATE fabric.model_accounts SET ceiling=1000000 WHERE account_id=$1',[account]);
  const ceiling=(await f.admin.query('SELECT ceiling FROM fabric.budget_allowances WHERE allowance_id=$1',[r.common.leaf])).rows[0].ceiling;await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved WHERE allowance_id=$1',[r.common.leaf]);await unchanged(r,()=>repo.record(scope,receipt.receiptId),'BUDGET_EXHAUSTED');await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2 WHERE allowance_id=$1',[r.common.leaf,ceiling]);await repo.record(scope,receipt.receiptId);assert.equal((await f.admin.query('SELECT settled FROM fabric.model_accounts WHERE account_id=$1',[account])).rows[0].settled,'4');
 });
 await t.test('N08-required-audit-outbox-rollback-and-history-read-authority',async()=>{
  for(const stage of ['audit','outbox'] as const){const receipt=r.receipt(27,28,'network'),bad=new ResourceRepository(f.uow,r.owner,{afterStage:async current=>{if(current===stage)throw new Error('N08 injected '+stage);}}),before=await r.snapshot();await assert.rejects(bad.prepare(scope,receipt.receiptId),new RegExp('N08 injected '+stage));assert.deepEqual(await r.snapshot(),before);}
  const receipt=r.receipt(27,28,'network');await repo.prepare(scope,receipt.receiptId);const before=await r.snapshot(),bad=new ResourceRepository(f.uow,r.owner,{afterStage:async stage=>{if(stage==='outbox')throw new Error('N08 settlement outbox');}});await assert.rejects(bad.settle(scope,receipt.receiptId),/N08 settlement outbox/);assert.deepEqual(await r.snapshot(),before);await repo.settle(scope,receipt.receiptId);
  const permissions=(await f.admin.query("SELECT has_table_privilege('fabric_worker','fabric.model_resource_intervals','INSERT') AS worker,has_table_privilege('fabric_test_idp','fabric.model_resource_bindings','SELECT') AS client,has_table_privilege('fabric_controller','fabric.model_resource_rates','INSERT') AS rates")).rows[0];assert.deepEqual(permissions,{worker:false,client:false,rates:false});await assert.rejects(f.admin.query('UPDATE fabric.model_resource_intervals SET amount=amount+1 WHERE receipt_id=$1',[sharedId]));await assert.rejects(f.admin.query('DELETE FROM fabric.model_resource_intervals WHERE receipt_id=$1',[sharedId]));
  await f.admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,scope.actorId]);const revoked=await r.snapshot();await assert.rejects(repo.inspect(scope,resourceId));assert.deepEqual(await r.snapshot(),revoked);await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,scope.actorId]);
  const final=await repo.inspect(await f.scopeFor(1),resourceId);console.log(JSON.stringify({measurement:'N08-resource-census',resourceId,SpaceTotal:final.costs.spaceActual,unallocatedShared:final.costs.sharedActual,allocatedTask:5,assignmentCount:1,categories:final.costs.categories,assurance:final.assurance,actualMeters:final.actualMeters}));
 });
}
