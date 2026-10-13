import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createResourceFixture } from './resource-fixture.js';
import { waitUntil,stopOwned } from './process-fixture.js';
import { operatorCommand } from '../../src/operator.js';
import { OriginalCallSchema } from '../../src/schema.js';
import type { OriginalCall } from '../../src/contracts.js';

type Fixture=Awaited<ReturnType<typeof createResourceFixture>>;
type NativeView=Awaited<ReturnType<Fixture['n']['native']['session']['inspect']>>;
type ResourceView=Awaited<ReturnType<Fixture['repo']['inspect']>>;
type Port=Parameters<typeof operatorCommand>[0];
const expiry=()=>new Date(Date.now()+60_000).toISOString();
async function result<T>(port:Port,command:string,input:unknown):Promise<T>{
 const response=await operatorCommand(port,command,input);
 assert.equal(response['error'],undefined,JSON.stringify(response));
 assert.ok(Object.hasOwn(response,'result'));
 return response['result'] as T;
}
function redacted(value:unknown,r:Fixture){
 const text=JSON.stringify(value);
 for(const secret of ['NATIVE_SOURCE_PRIVATE_MARKER',r.f.transportToken,...r.f.tokens,r.f.fixtureDsn('controller'),r.f.fixtureDsn('authority')])assert.equal(text.includes(secret),false);
 assert.equal(text.includes('sourceRecords'),false);assert.equal(text.includes('privateState'),false);
}

/** J06 uses the same bounded authenticated native service port as the other journeys.
 * Only the installed fixture owner issues intervals and suspension observations. */
export async function operatorResourceJourney(t:TestContext){
 const r=await createResourceFixture(),{n,f,resourceId}=r;t.after(()=>r.close());
 n.installResourceOwner(r.owner);
 const work=await n.task({computer:true,intent:'Act',resourceId}),other=await n.task({computer:true,intent:'Act',resourceId}),contender=await n.task({computer:true,intent:'Act'});
 const p=await n.process(),admin=await n.process(0),reader=await n.process(2);
 const port:Port=(kind,input)=>n.call(p,kind,input),ownerPort:Port=(kind,input)=>n.call(admin,kind,input),readerPort:Port=(kind,input)=>n.call(reader,kind,input);
 const inspect=async(sessionId:string)=>(await result<{view:NativeView}>(port,'operatorInspect',{sessionId})).view;
 const resource=(sessionId:string|null=null)=>result<ResourceView>(port,'resourceInspect',{resourceId,sessionId});
 const command=async(sessionId:string)=>({sessionId,key:randomUUID(),expectedRevision:(await inspect(sessionId)).revision,expiresAt:expiry()});
 const lifecycle=(action:'archive'|'stop'|'request-suspend'|'declare-delete-retention',at:number)=>result<Record<string,unknown>>(ownerPort,'resourceLifecycle',{resourceId,key:randomUUID(),expiresAt:expiry(),action,at});
 const record=async(start:number,end:number,category:Parameters<Fixture['receipt']>[2])=>{
  const receipt=r.receipt(start,end,category);assert.deepEqual(await result(port,'resourceRecord',{receiptId:receipt.receiptId}),receipt);return receipt;
 };
 const assignmentCount=async()=>Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows[0].n);
 await result(port,'qualify',{});
 let pending:NativeView|undefined,original:OriginalCall|undefined;

 await t.test('J06-visible-preparing-explicit-resume-and-competing-resource-wait',async()=>{
  const counts=await f.counters();
  const first=await result<{status:string;view:NativeView}>(port,'requestTurn',{...await command(work.sessionId),input:'Prepare a simulated computer',choice:null});
  assert.equal(first.status,'waiting');assert.equal(first.view.wait?.reason,'resource');assert.equal(first.view.wait?.resolver,'native-controller');assert.deepEqual(first.view.wait?.allowedNextActions,['resume','stop']);
  assert.equal(first.view.wait?.resourceId,resourceId);assert.match(first.view.wait!.preservedWorkDigest,/^sha256:/);
  assert.deepEqual(first.view.preflight,{schemaVersion:1,sessionId:work.sessionId,taskId:work.binding.taskId,runId:work.binding.runId,resourceId,policyRevision:work.binding.policyRevision,requirementsRevision:work.binding.requirementsRevision,generation:work.binding.resourceGeneration,phase:'preparing',capability:'simulated-computer',requiredGrant:'computer:use',costCategories:['reserved-compute','active-compute','cold-start','retained-storage','network'],chargePolicy:'reserved-until-confirmed-suspended',assurance:'deterministic-local-only'});
  assert.equal(first.view.spaceComputerAssignment,resourceId);assert.equal(first.view.computer.realProvisioning,'unqualified');assert.equal(first.view.pendingModel,null);assert.equal(first.view.costs.reserved,0);assert.equal(first.view.attribution.payerId,work.binding.payerId);
  for(let i=0;i<3;i++)assert.deepEqual(await inspect(work.sessionId),first.view);
  const ready=await result<{autoDispatched:boolean;view:NativeView}>(port,'resume',{...await command(work.sessionId),inputLimitBytes:64});
  assert.equal(ready.autoDispatched,false);assert.equal(ready.view.preflight?.phase,'simulated-ready');assert.equal(ready.view.wait,null);assert.equal(ready.view.state,'running');
  const competing=await result<{view:NativeView}>(port,'requestTurn',{...await command(contender.sessionId),input:'Use another simulated computer',choice:null});
  assert.equal(competing.view.wait?.reason,'resource');assert.equal(competing.view.wait?.resolver,'native-controller');assert.equal(competing.view.wait?.resourceId,contender.admission.resourceId);assert.equal(competing.view.spaceComputerAssignment,resourceId);assert.equal(competing.view.preflight,null);
  const blocked=await r.snapshot();const retry=await operatorCommand(port,'resume',{...await command(contender.sessionId),inputLimitBytes:64});assert.equal(retry['error'],'UNAUTHORIZED');assert.deepEqual(await r.snapshot(),blocked);assert.equal((await inspect(contender.sessionId)).wait?.reason,'resource');
  assert.equal(await assignmentCount(),1);assert.deepEqual(await f.counters(),counts);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
  const db=(await f.admin.query('SELECT record FROM fabric.model_computer_preflights WHERE session_id=$1',[work.sessionId])).rows[0].record;assert.deepEqual(db,ready.view.preflight);
  redacted(first,r);redacted(ready,r);redacted(competing,r);
 });

 await t.test('J06-actual-adapter-unknown-liability-is-separate-from-shared-resource-units',async()=>{
  const counts=await f.counters(),cursor=f.adapter().messages.length;let released=false;
  await f.arm('pre-accept');
  const turn=result<{view:NativeView}>(port,'requestTurn',{...await command(work.sessionId),input:'Explain the simulated resource contract',choice:null});
  try{
   await waitUntil(async()=>f.adapter().messages.slice(cursor).some(m=>m['kind']==='barrier-hit'&&m['hook']==='pre-accept'),'J06 actual request at installed adapter barrier');
   original=OriginalCallSchema.parse(f.adapter().messages.slice(cursor).find(m=>m['kind']==='barrier-hit'&&m['hook']==='pre-accept')!['original']);
   await f.schedule(original,{usage:'manual'});await f.release('pre-accept');released=true;pending=(await turn).view;
  }finally{if(!released&&original)await f.release('pre-accept');await turn;}
  assert.equal(pending.wait?.reason,'unknown-usage');assert.equal(pending.wait?.resolver,'original-model-receipt-owner');assert.deepEqual(pending.wait?.allowedNextActions,['reconcile','stop']);assert.ok(pending.pendingModel);assert.ok(pending.costs.reserved>0);assert.equal(pending.costs.pendingExposure,5);assert.equal(pending.costs.actual,0);
  assert.equal(pending.model?.profileDigest,n.profile.profileDigest);assert.equal(pending.model?.route,n.profile.route);assert.equal(pending.choiceLabel,'Auto - organization approved');assert.equal(pending.model?.fallbackReason,null);
  assert.equal((await f.counters())['accept'],(counts['accept']??0)+1);assert.equal((await f.counters())['acceptance'],(counts['acceptance']??0)+1);assert.equal((await f.journal(original!))?.status,'accepted');
  const view=await resource(work.sessionId);assert.equal(view.modelLiability?.reserved,pending.costs.reserved);assert.equal(view.modelLiability?.pendingExposure,5);assert.equal(view.costs.spaceActual,0);assert.equal(view.costs.allocatedTaskActual,0);assert.equal(view.settlement.modelUnits,0);
  redacted(pending,r);redacted(view,r);
 });

 await t.test('J06-archive-preserves-work-Stop-fences-dispatch-and-neither-terminates-charges',async()=>{
  const prior=await inspect(work.sessionId),counts=await f.counters();
  for(const [start,end,category]of [[0,5,'active-compute'],[5,10,'reserved-compute'],[0,2,'cold-start'],[0,10,'retained-storage'],[0,10,'network']] as const)await record(start,end,category);
  const archived=await lifecycle('archive',5);assert.equal(archived['termination'],'unknown');assert.equal(archived['realDeletion'],false);assert.equal(archived['realProvisioning'],false);assert.deepEqual(await inspect(work.sessionId),prior);
  const stop=await result<{dispatch:string;termination:string;unsettled:boolean}>(port,'stop',{sessionId:work.sessionId,key:randomUUID(),expiresAt:expiry(),observedRevision:999});
  assert.equal(stop.dispatch,'fenced');assert.equal(stop.termination,'unknown');assert.equal(stop.unsettled,true);await lifecycle('stop',10);
  const stopped=await inspect(work.sessionId);assert.equal(stopped.state,'cancelling');assert.deepEqual(stopped.pendingModel,prior.pendingModel);assert.equal(stopped.costs.reserved,prior.costs.reserved);assert.equal(stopped.costs.pendingExposure,5);
  const deniedBefore=await r.snapshot(),denied=await operatorCommand(port,'requestTurn',{...await command(work.sessionId),input:'Start after Stop',choice:null});assert.equal(denied['error'],'STALE_FENCE');assert.deepEqual(await r.snapshot(),deniedBefore);
  const view=await resource(work.sessionId);assert.equal(view.costs.spaceActual,32);assert.equal(view.compute,'billable; suspension/termination unconfirmed');assert.equal(view.archiveEffect,'conversation only');assert.equal(view.stopEffect,'native Task dispatch fence; no resource termination proof');assert.equal(view.confirmedSuspendAt,null);assert.equal(view.modelLiability?.pendingExposure,5);
  assert.deepEqual(await f.counters(),counts);redacted(view,r);redacted(denied,r);
 });

 await t.test('J06-suspend-request-is-unknown-until-original-owner-confirmation-and-storage-continues',async()=>{
  const counts=await f.counters();await lifecycle('request-suspend',10);
  for(const [start,end,category]of [[10,20,'reserved-compute'],[10,20,'retained-storage'],[10,20,'network'],[10,11,'cold-start']] as const)await record(start,end,category);
  const unconfirmed=await resource(work.sessionId);assert.equal(unconfirmed.compute,'billable; suspension/termination unconfirmed');assert.equal(unconfirmed.confirmedSuspendAt,null);assert.equal(unconfirmed.costs.spaceActual,63);
  const proof=r.proof(20),before=await r.snapshot();
  const denied=await operatorCommand(port,'resourceConfirmSuspended',{proofId:proof.proofId});assert.equal(denied['error'],'UNAUTHORIZED');assert.deepEqual(await r.snapshot(),before);
  assert.deepEqual(await result(ownerPort,'resourceConfirmSuspended',{proofId:proof.proofId}),proof);
  const duplicateBefore=await r.snapshot();assert.deepEqual(await result(ownerPort,'resourceConfirmSuspended',{proofId:proof.proofId}),proof);assert.deepEqual(await r.snapshot(),duplicateBefore);
  for(const category of ['active-compute','reserved-compute','cold-start'] as const){const receipt=r.receipt(20,21,category),state=await r.snapshot(),response=await operatorCommand(port,'resourceRecord',{receiptId:receipt.receiptId});assert.equal(response['error'],'IDEMPOTENCY_CONFLICT');assert.deepEqual(await r.snapshot(),state);}
  await record(20,30,'retained-storage');await record(20,25,'network');await lifecycle('declare-delete-retention',25);await record(30,40,'retained-storage');
  const view=await resource(work.sessionId);assert.equal(view.compute,'confirmed-simulated-suspended');assert.equal(view.confirmedSuspendAt,20);assert.equal(view.storage,'retained; continuing charges under retention policy');assert.equal(view.deleteEffect,'declared retention transition; no real deletion');assert.equal(view.lifecycle.find(e=>e.action==='declare-delete-retention')?.at,25);
  assert.deepEqual(view.costs.categories,{model:0,service:0,'active-compute':5,'reserved-compute':15,'cold-start':3,'retained-storage':60,network:30});assert.equal(view.costs.spaceActual,113);assert.equal(view.costs.reserved,0);assert.equal(view.costs.sharedActual,113);assert.equal(view.costs.allocatedTaskActual,0);assert.equal(view.assurance,'deterministic-local-only');assert.match(view.actualMeters,/unqualified/);assert.equal(view.settlement.productionReserveGuarantee,'unsupported');assert.deepEqual(await f.counters(),counts);redacted(view,r);
 });

 await t.test('J06-two-Task-references-charge-once-scope-and-owner-denials-have-zero-effects',async()=>{
  const a=await resource(work.sessionId),b=await resource(other.sessionId),space=await resource();assert.deepEqual(a.charges,b.charges);assert.deepEqual(a.charges,space.charges);assert.equal(a.costs.allocatedTaskActual+b.costs.allocatedTaskActual+space.costs.sharedActual,space.costs.spaceActual);assert.ok(a.charges.every(c=>c.allocation==='unallocated-shared-cost'&&c.originRunId===null));
  const db=(await f.admin.query("SELECT sum(i.amount)::int AS n,count(*)::int AS count,count(DISTINCT i.receipt_id)::int AS distinct FROM fabric.model_resource_intervals i JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE i.resource_id=$1 AND r.state='settled'",[resourceId])).rows[0];assert.equal(db.n,113);assert.equal(db.count,a.charges.length);assert.equal(db.distinct,a.charges.length);
  for(const charge of a.charges){const row=(await f.admin.query('SELECT r.allowance_id FROM fabric.budget_reservations r JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,reservation_id) WHERE i.receipt_id=$1',[charge.chargeId])).rows[0];assert.equal(row.allowance_id,r.common.leaf);}
  const duplicate=a.charges[0]!,before=await r.snapshot(),counts=await f.counters();await result(port,'resourceRecord',{receiptId:duplicate.chargeId});assert.deepEqual(await r.snapshot(),before);
  const requests:[Port,string,unknown,string][]=[
   [port,'resourceLifecycle',{resourceId,key:randomUUID(),expiresAt:expiry(),action:'archive',at:41},'UNAUTHORIZED'],
   [readerPort,'resourceRecord',{receiptId:duplicate.chargeId},'UNAUTHORIZED'],
   [port,'resourceInspect',{resourceId,sessionId:randomUUID()},'UNAUTHORIZED'],
   [port,'resourceInspect',{resourceId:randomUUID(),sessionId:null},'UNAUTHORIZED'],
  ];
  for(const [caller,kind,input,error]of requests){const prior=await r.snapshot(),response=await operatorCommand(caller,kind,input);assert.equal(response['error'],error);assert.equal(response['replayAllowed'],false);assert.equal(response['recovery'],'inspect-current-authority');assert.deepEqual(await r.snapshot(),prior);redacted(response,r);}
  assert.deepEqual(await f.counters(),counts);assert.equal(await assignmentCount(),1);redacted(a,r);redacted(b,r);redacted(space,r);
 });

 await t.test('J06-restart-retains-stopped-pending-work-and-original-reconciliation-without-replay',async()=>{
  const before=await inspect(work.sessionId),resourceBefore=await resource(work.sessionId),counts=await f.counters();await stopOwned(p,'SIGKILL');const restarted=await n.process(),restoredPort:Port=(kind,input)=>n.call(restarted,kind,input);
  const restored=(await result<{view:NativeView}>(restoredPort,'operatorInspect',{sessionId:work.sessionId})).view;assert.deepEqual(restored,before);assert.deepEqual(await result(restoredPort,'resourceInspect',{resourceId,sessionId:work.sessionId}),resourceBefore);assert.deepEqual(await f.counters(),counts);
  await f.finalize(original!);const reconciled=await result<{status:string;view:NativeView}>(restoredPort,'reconcile',{sessionId:work.sessionId,operationId:original!.operationId});assert.equal(reconciled.status,'completed');assert.equal(reconciled.view.state,'cancelling');assert.equal(reconciled.view.pendingModel,null);assert.equal(reconciled.view.costs.reserved,0);assert.ok(reconciled.view.costs.actual>0);
  assert.equal((await f.counters())['accept'],counts['accept']);assert.equal((await f.counters())['acceptance'],counts['acceptance']);const settled=await result<ResourceView>(restoredPort,'resourceInspect',{resourceId,sessionId:work.sessionId});assert.equal(settled.costs.spaceActual,113);assert.equal(settled.modelLiability?.actual,reconciled.view.costs.actual);assert.equal(settled.modelLiability?.categoryTotals?.service,2);assert.equal(settled.modelLiability?.categoryTotals?.model,settled.modelLiability!.actual-2);assert.equal(settled.modelLiability?.pendingExposure,0);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id IN (SELECT receipt_id FROM fabric.model_resolutions WHERE attempt_id=$1)',[original!.attemptId])).rows[0].n,1);
  assert.equal(await assignmentCount(),1);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});redacted(reconciled,r);redacted(settled,r);
  t.diagnostic(JSON.stringify({journey:'J06',assurance:'deterministic-local-only',assignmentCount:1,sharedResourceActual:113,taskAllocatedResourceActual:0,modelActual:reconciled.view.costs.actual,categories:settled.costs.categories,realMeters:'unqualified',E05:'not executed; process deadlines protect test termination only'}));
 });
}
