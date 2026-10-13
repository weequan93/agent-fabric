import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createNativeFixture } from './native-fixture.js';
import { stopOwned,waitUntil } from './process-fixture.js';
import { requestsFor } from './profile-context-journey.js';
import { SessionLoop } from '../../src/native-imports.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import type { OwnerObservation } from '../../src/contracts.js';
import { operatorCommand } from '../../src/operator.js';

const result=<T>(r:Record<string,unknown>):T=>{assert.equal(r['error'],undefined,JSON.stringify(r));return r['result'] as T;};
const expires=()=>new Date(Date.now()+60_000).toISOString();
type Native=Awaited<ReturnType<typeof createNativeFixture>>;
async function acknowledgedPrepare(n:Native,a:Awaited<ReturnType<Native['task']>>){
 const s=await n.native.repository.snapshot(a.scope,a.sessionId),ids={tenantId:n.f.tenant,spaceId:n.f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()};
 const request=await n.native.context.encode(a.scope,s,n.profile,'unclaimed Stop recovery',ids),restored=n.native.session.restore(s,a.scope);
 const prefix=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:ids.operationId,reservationId:ids.reservationId}),model:async()=>{throw new Error('Capture native pending prefix');},execute:async()=>{throw new Error('No effect');}});
 prefix.restore(restored.events());prefix.transition('preparing',{currentAuthorized:true});prefix.transition('running',{currentAuthorized:true});
 await assert.rejects(prefix.callModel('unclaimed Stop recovery'),/Capture native pending prefix/);
 await n.native.models.prepare(a.scope,{binding:a.binding,request,origin:s.origin,nativePrefix:prefix.events(),route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:expires(),retryCeiling:3}});
 return request;
}
/** CODE-F04-003: real native Stop occurs while prepare is committed but unclaimed.
 * A permanent installed-owner seal resolves liability without any new dispatch. */
export async function unclaimedSealCases(t:TestContext){
 for(const fault of ['acknowledged','lost-ack','crash-after-commit'] as const)await t.test('Stop-before-claim/'+fault+'/permanent-seal-release-and-native-recovery',async()=>{
  const n=await createNativeFixture(),f=n.f;
  try{
   const tenantAccount=await n.account(10_000_000,'tenant'),account=await n.account(10_000_000,'person',tenantAccount),parent=await n.task(),a=await n.task({parentTaskId:parent.binding.taskId});
   const caller=await n.process(1,fault==='acknowledged'?undefined:fault),operate=(p:Parameters<typeof n.call>[0],kind:string,input:unknown)=>operatorCommand((command,value)=>n.call(p,command,value),kind,input);
   let request;
   if(fault==='acknowledged')request=await acknowledgedPrepare(n,a);
   else{
    result(await operate(caller,'qualify',{}));const requestId=randomUUID(),command=await n.command(a.sessionId);
    await new Promise<void>((ok,no)=>caller.child.send({kind:'requestTurn',requestId,input:{...command,input:'unclaimed Stop recovery',choice:null}},e=>e?no(e):ok()));
    if(fault==='crash-after-commit')await waitUntil(async()=>caller.messages.some(m=>m['kind']==='prepare-committed'),'unclaimed seal post-COMMIT gate',15_000);
    else{await waitUntil(async()=>caller.messages.some(m=>m['kind']==='result'&&m['requestId']===requestId),'unclaimed lost prepare ACK',15_000);assert.equal(result<{status:string}>(caller.messages.find(m=>m['kind']==='result'&&m['requestId']===requestId)!).status,'waiting');}
    request=(await requestsFor(n,a.binding.runId))[0]!;
   }
   const o=request.original,counts=await f.counters();assert.equal(await f.journal(o),undefined);
   const original=(await f.admin.query('SELECT a.record,o.binding,p.* FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) JOIN fabric.model_receipt_owners p USING(tenant_id,space_id,attempt_id) WHERE a.attempt_id=$1',[o.attemptId])).rows[0];
   assert.equal(original.record.status,'prepared');assert.equal(original.record.claimId,null);assert.deepEqual(original.binding,a.binding);
   const members=async()=>(await f.admin.query('SELECT allowance_id FROM fabric.model_reservation_allowances WHERE reservation_id=$1 ORDER BY allowance_id',[o.reservationId])).rows;
   const accounts=async()=>(await f.admin.query('SELECT account_id FROM fabric.model_reservation_accounts WHERE reservation_id=$1 ORDER BY account_id',[o.reservationId])).rows;
   const membership=await members(),accountMembership=await accounts();
   for(const id of [...a.ids,...parent.ids])assert.ok(membership.some(r=>r.allowance_id===id),'all child/parent original limits included');
   for(const id of [account,tenantAccount])assert.ok(accountMembership.some(r=>r.account_id===id));
   const amount=Number((await f.admin.query('SELECT amount FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].amount);
   const balances=async()=>({allowances:(await f.admin.query('SELECT allowance_id AS id,ceiling,reserved,settled,revision FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[membership.map(r=>r.allowance_id)])).rows,accounts:(await f.admin.query('SELECT account_id AS id,ceiling,reserved,settled,revision FROM fabric.model_accounts WHERE account_id=ANY($1::uuid[]) ORDER BY account_id',[accountMembership.map(r=>r.account_id)])).rows});
   const before=await balances();for(const rows of Object.values(before))for(const r of rows)assert.equal(Number(r.reserved),amount);
   await stopOwned(caller,'SIGKILL');const restored=await n.process();assert.notEqual(restored.pid,caller.pid);
   result(await operate(restored,'stop',{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:0}));
   const stopped=await n.native.repository.snapshot(a.scope,a.sessionId);assert.equal(stopped.stopped,true);assert.equal(stopped.cancellationGeneration,1);
   assert.ok((await operate(restored,'dispatchPrepared',{sessionId:a.sessionId,operationId:o.operationId}))['error']);
   assert.equal((await n.native.models.reconcile(a.scope,o)).status,'unknown');assert.deepEqual(await balances(),before);
   // Independent actual PG backends contend for the same native Space barrier.
   // Holding the sealer after the resolution write proves claim waits until its COMMIT.
   let release!:()=>void,entered!:()=>void;const held=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});let sealPid=0,claimPid=0;
   const { UsageRepository }=await import('../../src/usage-repository.js'),{ ModelService }=await import('../../src/model-service.js'),{ ModelRepository }=await import('../../src/model-repository.js');
   const usage=new UsageRepository(f.uow,n.native.models.usage.authority,{async afterUsage(tx){sealPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);entered();await gate;}});
   const service=new ModelService(n.native.models.model,usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:f.adapterClient()}]);
   const permanent=await f.adapterClient().sealUnaccepted(o,request.dispatchEpoch);assert.equal(permanent.status,'sealed-not-accepted');
   assert.ok(permanent.status==='sealed-not-accepted');const untouched=await n.snapshot();
   // Current service and actual SQL independently reject missing claim unless
   // this is the exact installed original owner and a sufficient permanent epoch.
   for(const observation of [{status:'accepted',original:o},{...permanent,ownerId:randomUUID()},{...permanent,dispatchEpoch:request.dispatchEpoch-1},{...permanent,original:{...o,reservationId:randomUUID()}}]){
    await assert.rejects(f.uow.withScope(a.scope,async tx=>{const state=await usage.load(tx,a.scope,o);return usage.observe(tx,a.scope,state,observation as OwnerObservation);}));
    await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT fabric.model_apply_observation($1,$2::jsonb)',[o.attemptId,JSON.stringify(observation)])));
    assert.deepEqual(await n.snapshot(),untouched);
   }
   for(const status of ['accepted','unknown','settled',null])await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT fabric.model_apply_observation($1,$2::jsonb)',[o.attemptId,JSON.stringify({status,original:o})])));
   await assert.rejects(n.native.models.seal(await f.scopeFor(0),o));assert.deepEqual(await n.snapshot(),untouched);
   const rollbackUsage=new UsageRepository(f.uow,usage.authority,{async afterUsage(tx){assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0]?.['n'],1);throw new Error('Injected unclaimed seal rollback after actual resolution write');}});
   await assert.rejects(new ModelService(n.native.models.model,rollbackUsage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:f.adapterClient()}]).seal(a.scope,o),/Injected unclaimed seal rollback/);
   assert.deepEqual(await n.snapshot(),untouched);assert.deepEqual(await balances(),before);assert.equal((await f.journal(o)).status,'sealed-not-accepted');
   const sealing=service.reconcile(a.scope,o);void sealing.catch(()=>{});
   // On the broken candidate, seal rejects before reaching afterUsage. Do not hang.
   await Promise.race([held,sealing.then(()=>{throw new Error('Seal failed to exercise real resolution write');})]);
   const model=new ModelRepository({withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{claimPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return work(tx);})},n.native.models.model.authority);
   const claim=assert.rejects(model.claim(a.scope,o.attemptId));void claim.catch(()=>{});
   try{await waitUntil(async()=>!!claimPid&&(await f.admin.query('SELECT pg_blocking_pids($1) AS blockers',[claimPid])).rows[0].blockers.includes(sealPid),'claim waits for permanent unclaimed seal');assert.deepEqual(await balances(),before);}finally{release();}
   assert.equal((await sealing).status,'sealed-not-accepted');await claim;
   const proof=(await f.journal(o));assert.equal(proof.status,'sealed-not-accepted');assert.equal(proof.request,null);assert.equal(proof.receipt,null);
   const sealed=(await f.admin.query('SELECT record FROM fabric.model_attempts WHERE attempt_id=$1',[o.attemptId])).rows[0].record;
   assert.deepEqual(sealed,{...original.record,status:'sealed-not-accepted'});assert.equal(sealed.claimId,null);
   const after=await balances();for(const key of ['allowances','accounts'] as const)for(let i=0;i<before[key].length;i++){const old=before[key][i]!,r=after[key][i]!;assert.equal(r.ceiling,old.ceiling);assert.equal(r.settled,old.settled);assert.equal(Number(r.reserved),Number(old.reserved)-amount);assert.equal(Number(r.revision),Number(old.revision)+1);}
   assert.deepEqual(await members(),membership);assert.deepEqual(await accounts(),accountMembership);
   const frozen=await n.snapshot();await n.native.models.seal(a.scope,o);await n.native.models.reconcile(a.scope,o);assert.deepEqual(await n.snapshot(),frozen);
   await f.restart('SIGKILL');await stopOwned(restored,'SIGKILL');const next=await n.process();assert.notEqual(next.pid,restored.pid);
   assert.equal((await n.runtime().models.seal(a.scope,o)).status,'sealed-not-accepted');assert.deepEqual(await n.snapshot(),frozen);assert.deepEqual(await f.journal(o),proof);
   const resolved=result<{status:string;view:{pendingModel:unknown;state:string;costs:{reserved:number;actual:number}}}>(await operate(next,'reconcile',{sessionId:a.sessionId,operationId:o.operationId}));
   assert.equal(resolved.status,'safely-failed');assert.equal(resolved.view.pendingModel,null);assert.equal(resolved.view.state,'cancelling');assert.equal(resolved.view.costs.reserved,0);assert.equal(resolved.view.costs.actual,0);
   assert.equal((await f.admin.query('SELECT state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].state,'released');
   for(const table of ['model_claims','model_resolutions'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE attempt_id=$1',[o.attemptId])).rows[0].n,table==='model_claims'?0:1);
   assert.equal((await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_events WHERE event->>'attemptId'=$1 AND event->>'kind'='model-safely-failed'",[o.attemptId])).rows[0].n,1);
   for(const kind of ['dispatchPrepared','requestTurn','resume']){const input=kind==='dispatchPrepared'?{sessionId:a.sessionId,operationId:o.operationId}:kind==='resume'?{...await n.command(a.sessionId),inputLimitBytes:8}:{...await n.command(a.sessionId),input:'Stop remains effective',choice:null};assert.ok((await operate(next,kind,input))['error']);}
   assert.equal((await n.native.repository.snapshot(a.scope,a.sessionId)).stopped,true);assert.equal((await n.native.repository.snapshot(a.scope,a.sessionId)).cancellationGeneration,1);
   for(const k of ['accept','acceptance'])assert.equal((await f.counters())[k]??0,counts[k]??0);assert.deepEqual(await requestsFor(n,a.binding.runId),[request]);assert.equal(n.chunks.length,0);
  }finally{await n.close();}
 });
 for(const order of ['seal-first','claim-first'] as const)await t.test('unclaimed-seal-claim-contention/'+order+'/actual-PG-lock-and-one-resolution',async()=>{
  const n=await createNativeFixture();try{
   const a=await n.task(),request=await acknowledgedPrepare(n,a),o=request.original,counts=await n.f.counters();
   const { UsageRepository }=await import('../../src/usage-repository.js'),{ ModelService }=await import('../../src/model-service.js'),{ ModelRepository }=await import('../../src/model-repository.js');
   let release!:()=>void,enter!:()=>void;const held=new Promise<void>(r=>{enter=r;}),gate=new Promise<void>(r=>{release=r;});let firstPid=0,secondPid=0;
   const hook=async(tx:import('../../src/contracts.js').SqlTransaction)=>{firstPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);enter();await gate;};
   const secondUow:import('../../src/contracts.js').AsyncUnitOfWork={withScope:(scope,work)=>n.f.uow.withScope(scope,async tx=>{secondPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return work(tx);})};
   const owner={...n.installed(),profileDigest:n.profile.profileDigest,port:n.f.adapterClient()};
   const claimModel=new ModelRepository(order==='claim-first'?n.f.uow:secondUow,n.native.models.model.authority,order==='claim-first'?{afterStage:async(stage,tx)=>{if(stage==='claim')await hook(tx);}}:{});
   const usage=new UsageRepository(order==='seal-first'?n.f.uow:secondUow,n.native.models.usage.authority,order==='seal-first'?{afterUsage:hook}:{}),service=new ModelService(n.native.models.model,usage,[owner]);
   const first=order==='seal-first'?service.seal(a.scope,o):claimModel.claim(a.scope,o.attemptId);void first.catch(()=>{});
   await Promise.race([held,first.then(()=>{throw new Error('Missing first mutation lock gate');})]);
   const second=order==='seal-first'?assert.rejects(claimModel.claim(a.scope,o.attemptId)):service.seal(a.scope,o);void second.catch(()=>{});
   try{await waitUntil(async()=>!!secondPid&&(await n.f.admin.query('SELECT pg_blocking_pids($1) AS blockers',[secondPid])).rows[0].blockers.includes(firstPid),'unclaimed seal/claim '+order+' actual lock');console.log(JSON.stringify({measurement:'unclaimed-seal-claim-lock',order,firstPid,secondPid}));}finally{release();}
   const committed=await first;await second;if(order==='claim-first')assert.ok(committed);else assert.equal((committed as {status:string}).status,'sealed-not-accepted');
   assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[o.attemptId])).rows[0].n,order==='claim-first'?1:0);
   assert.equal((await n.f.admin.query('SELECT record FROM fabric.model_attempts WHERE attempt_id=$1',[o.attemptId])).rows[0].record.claimId===null,order==='seal-first');
   assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0].n,1);
   assert.equal((await n.f.admin.query('SELECT state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].state,'released');
   if(order==='seal-first')await assert.rejects(n.native.models.model.claim(a.scope,o.attemptId));else assert.equal(await n.native.models.model.claim(a.scope,o.attemptId),null);
   for(const key of ['accept','acceptance'])assert.equal((await n.f.counters())[key]??0,counts[key]??0);
  }finally{await n.close();}
 });

}
