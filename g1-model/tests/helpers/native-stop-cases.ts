import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createNativeFixture } from './native-fixture.js';
import { stopOwned,waitUntil } from './process-fixture.js';
import { SessionLoop } from '../../src/native-imports.js';
import { NativeRepository,type NativeSnapshot } from '../../src/native-repository.js';
import { NativeSession,assertContinuationAllowed } from '../../src/native-session.js';
import { ModelRepository,type PrepareInput } from '../../src/model-repository.js';
import { ModelService } from '../../src/model-service.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import type { AsyncUnitOfWork } from '../../src/contracts.js';

type Native=Awaited<ReturnType<typeof createNativeFixture>>;
const expires=()=>new Date(Date.now()+60_000).toISOString();
const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;
const deferred=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};};
const result=<T>(r:Record<string,unknown>):T=>{assert.equal(r['error'],undefined,JSON.stringify(r));return r['result'] as T;};

async function prepare(n:Native,a:Awaited<ReturnType<Native['task']>>):Promise<PrepareInput>{
 const s=await n.native.repository.snapshot(a.scope,a.sessionId),ids={tenantId:n.f.tenant,spaceId:n.f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()};
 const request=await n.native.context.encode(a.scope,s,n.profile,'native Stop original pending',ids);
 const loop=n.native.session.restore(s,a.scope);
 const prefix=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:ids.operationId,reservationId:ids.reservationId}),model:async()=>{throw new Error('Capture genuine pending before prepare');},execute:async()=>{throw new Error('No fixture effect');}});
 prefix.restore(loop.events());if(prefix.inspect().run.state==='queued'){prefix.transition('preparing',{currentAuthorized:true});prefix.transition('running',{currentAuthorized:true});}
 await assert.rejects(prefix.callModel('native Stop original pending'),/Capture genuine pending before prepare/);
 const input={binding:a.binding,request,origin:s.origin,nativePrefix:prefix.events(),route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:expires(),retryCeiling:3}};
 await n.native.models.prepare(a.scope,input);return input;
}

async function lock(n:Native,pid:()=>number|undefined,blocker:number,label:string){
 let observed:Record<string,unknown>|undefined;
 await waitUntil(async()=>{const backend=pid();if(!backend)return false;const row=(await n.f.admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[backend])).rows[0];if(row?.wait_event_type==='Lock'&&row.blockers.includes(blocker)){observed=row;return true;}return false;},label);
 assert.equal(observed!['wait_event_type'],'Lock');assert.ok((observed!['blockers'] as number[]).includes(blocker));
 console.log(JSON.stringify({measurement:'native-Stop-lock-order',schedule:label,...observed}));return observed!;
}

/** Stop order is proved by actual independent PostgreSQL backends, not by
 * promise launch order. Every attempted continuation crosses the installed
 * native fence; the only post-Stop I/O admitted below is original accounting. */
export async function nativeStopCases(t:TestContext,n:Native):Promise<void>{
 const f=n.f;
 for(const order of ['Stop-before-accept','accept-before-Stop'] as const)await t.test(order,{timeout:30_000},async st=>{
  // Use the already assigned simulated computer if another N case installed it.
  // Visible preflight and separate resume establish valid counterparts for all
  // three effects; no VM, worker enrollment or supplier call is installed.
  const resourceId=(await f.admin.query('SELECT resource_id FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows[0]?.resource_id as string|undefined;
  const parent=await n.task({intent:'Act',computer:true,targetEffect:true,noSources:true,...(resourceId?{resourceId}:{})});
  const child=await n.task({intent:'Act',computer:true,targetEffect:true,noSources:true,resourceId:parent.admission.resourceId!,parentTaskId:parent.binding.taskId});
  let callbacks=0;
  for(const a of [parent,child]){
   const wait=await n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'visible preflight',choice:null});assert.equal(wait.view.wait?.reason,'resource');
   const ready=await n.native.session.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:64});assert.equal(ready.view.preflight?.phase,'simulated-ready');
   for(const effect of ['child','computer','target'] as const)await n.native.session.continue(a.scope,await n.command(a.sessionId),effect,async()=>{callbacks++;});
  }
  assert.equal(callbacks,6);
  const oldParent=await n.native.repository.snapshot(parent.scope,parent.sessionId),oldChild=await n.native.repository.snapshot(child.scope,child.sessionId);
  const input=await prepare(n,parent),o=input.request.original,oldProcess=await n.process(),before=await f.counters();
  let dispatchPid:number|undefined;
  const capture:AsyncUnitOfWork={withScope:async(scope,work)=>f.uow.withScope(scope,async tx=>{dispatchPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return work(tx);})};
  const model=new ModelRepository(capture,n.native.models.model.authority),models=new ModelService(model,n.native.models.usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:f.adapterClient(),result:f.adapterClient().result.bind(f.adapterClient())}]);
  const permit=await model.claim(parent.scope,o.attemptId);assert.ok(permit);
  const stopInput={sessionId:parent.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:0};
  assert.ok(stopInput.observedRevision<oldParent.revision,'genuine earlier native progress observation');
  let stopReceipt:{dispatch:string;termination:string;cancellationGeneration:number;unsettled:boolean};
  if(order==='Stop-before-accept'){
   const held=deferred(),release=deferred();let stopPid:number|undefined;
   const repository=new NativeRepository(f.uow,f.bindingFor,{afterStage:async(stage,tx)=>{if(stage==='outbox'){stopPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);held.release();await release.promise;}}});
   const session=new NativeSession(repository,n.native.models,n.native.ports),stop=session.stop(parent.scope,stopInput);void stop.catch(()=>{});
   let rejection:Promise<void>|undefined;
   try{
    await held.promise;assert.ok(stopPid);const pendingStop=(await f.admin.query('SELECT cancellation_generation FROM fabric.tasks WHERE task_id=$1',[parent.binding.taskId])).rows[0];assert.equal(Number(pendingStop.cancellation_generation),0,'Stop cancellation not visible before COMMIT');
    rejection=assert.rejects(models.dispatchPermit(parent.scope,o,permit),code('STALE_AUTHORITY'));void rejection.catch(()=>{});
    await lock(n,()=>dispatchPid,stopPid,'claimant blocked by pending Stop COMMIT');assert.deepEqual(await f.counters(),before);
    release.release();stopReceipt=await stop;assert.equal(Number((await f.admin.query('SELECT cancellation_generation FROM fabric.tasks WHERE task_id=$1',[parent.binding.taskId])).rows[0].cancellation_generation),1);
    await rejection;assert.deepEqual(await f.counters(),before);assert.equal(await f.journal(o),undefined,'Stop-first sends zero accepts');
   }finally{release.release();await stop;if(rejection)await rejection;}
  }else{
   await f.schedule(o,{usage:'manual'});await f.arm('pre-accept');const acceptance=models.dispatchPermit(parent.scope,o,permit);void acceptance.catch(()=>{});
   let stopping:ReturnType<Native['call']>|undefined,released=false;
   try{
    await f.reached('pre-accept',o);assert.ok(dispatchPid);stopping=n.call(oldProcess,'stop',stopInput);void stopping.catch(()=>{});
    let stopPid:number|undefined;await waitUntil(async()=>{const row=(await f.admin.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type=\'Lock\' AND $2=ANY(pg_blocking_pids(pid))',['model-native-'+oldProcess.marker,dispatchPid])).rows[0];if(row){stopPid=Number(row.pid);return true;}return false;},'Stop actually blocked on acceptance native fence');
    await lock(n,()=>stopPid,dispatchPid,'Stop blocked by bounded original acceptance');assert.equal(await f.journal(o),undefined);
    await f.release('pre-accept');released=true;assert.equal((await acceptance).status,'accepted');stopReceipt=result(await stopping);
    const counts=await f.counters();assert.equal(counts['accept']??0,(before['accept']??0)+1);assert.equal(counts['acceptance']??0,(before['acceptance']??0)+1);assert.equal((await f.journal(o)).status,'accepted');assert.equal((await f.journal(o)).receipt,null);
   }finally{if(!released)await f.release('pre-accept');await acceptance;if(stopping)await stopping;}
  }
  assert.equal(stopReceipt.dispatch,'fenced');assert.equal(stopReceipt.termination,'unknown');assert.equal(stopReceipt.cancellationGeneration,1);assert.equal(stopReceipt.unsettled,true);
  const stopped=await n.native.repository.snapshot(parent.scope,parent.sessionId),view=await n.native.session.inspect(parent.scope,parent.sessionId);
  assert.equal(stopped.stopped,true);assert.equal(view.state,'cancelling');assert.equal(view.pendingModel?.operationId,o.operationId);assert.ok(view.costs.reserved>0);assert.equal(view.costs.actual,0);
  const retained=(await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];assert.ok(Number(retained.amount)>0);assert.equal(Number(retained.settled_amount),0);assert.ok(['active','unknown'].includes(retained.state));
  const restartBefore=await n.snapshot(),db=(await f.admin.query('SELECT current_database() AS name,pg_postmaster_start_time() AS started')).rows[0],counts=await f.counters();
  result(await n.call(oldProcess,'inspect',{sessionId:parent.sessionId}));await stopOwned(oldProcess,'SIGKILL');const restarted=await n.process();
  try{
   assert.notEqual(restarted.pid,oldProcess.pid);assert.deepEqual((await f.admin.query('SELECT current_database() AS name,pg_postmaster_start_time() AS started')).rows[0],db);assert.deepEqual(await n.snapshot(),restartBefore);
   const inspected=result<{state:string;pendingModel:unknown}>(await n.call(restarted,'inspect',{sessionId:parent.sessionId}));assert.equal(inspected.state,'cancelling');assert.deepEqual(inspected.pendingModel,view.pendingModel);
   assert.equal(result<{nextAction:string}>(await n.call(restarted,'replay',{sessionId:parent.sessionId})).nextAction,'reconcile');
   const recreated=n.runtime();
   for(const generation of ['old','current'] as const)await st.test('restart-'+generation+'-generation-all-path-denial',async()=>{
    const freshParent=await recreated.repository.snapshot(parent.scope,parent.sessionId),freshChild=await recreated.repository.snapshot(child.scope,child.sessionId);
    const proposed:NativeSnapshot=generation==='old'?oldParent:{...freshParent,stopped:false,binding:{...freshParent.binding,cancellationGeneration:freshParent.cancellationGeneration}};
    const childProposed=generation==='old'?oldChild:{...freshChild,stopped:false};
    for(const effect of ['child','computer','target'] as const){
     await assert.rejects(recreated.session.continue(parent.scope,{...await n.command(parent.sessionId),...(generation==='old'?{expectedRevision:oldParent.revision}:{})},effect,async()=>{callbacks++;}),code('STALE_FENCE'));
     // Bypass the command projection with both stale and currently observed
     // generation stamps. The installed Task fence still precedes every sink.
     for(const [a,s] of [[parent,proposed],[child,childProposed]] as const)await assert.rejects(f.uow.withScope(a.scope,async tx=>{await recreated.repository.fresh(tx,a.scope,s);assertContinuationAllowed(s,effect);callbacks++;}),code('STALE_AUTHORITY'));
    }
    const turn=await n.call(restarted,'requestTurn',{...await n.command(parent.sessionId),...(generation==='old'?{expectedRevision:oldParent.revision}:{}),input:'forbidden model continuation',choice:null});assert.equal(turn['error'],'STALE_FENCE');
    await assert.rejects(recreated.session.requestTurn(child.scope,{...await n.command(child.sessionId),input:'forbidden child inference',choice:null}),code('STALE_AUTHORITY'));
    await assert.rejects(recreated.models.model.prepare(parent.scope,{...input,binding:proposed.binding,command:{...input.command,key:randomUUID()}}),code('STALE_AUTHORITY'));
    await assert.rejects(recreated.models.dispatch(parent.scope,o),code('STALE_AUTHORITY'));assert.equal(callbacks,6);assert.deepEqual(await n.snapshot(),restartBefore);assert.deepEqual(await f.counters(),counts);
   });
   // A new child cannot convert a stopped parent's current generation into new
   // admission. It receives no native session or model reservation.
   const nativeCount=Number((await f.admin.query('SELECT count(*) AS n FROM fabric.model_native_controls')).rows[0].n);
   await assert.rejects(n.task({parentTaskId:parent.binding.taskId,noSources:true}),code('STALE_AUTHORITY'));assert.equal(Number((await f.admin.query('SELECT count(*) AS n FROM fabric.model_native_controls')).rows[0].n),nativeCount);assert.deepEqual(await f.counters(),counts);
   assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0],retained);
   // Unknown remains an original-owner accounting obligation, never permission
   // to replay output or a claim that Stop terminated accepted inference.
   const beforeResolution=await recreated.repository.snapshot(parent.scope,parent.sessionId);
   const unknown=result<{status:string;view:{pendingModel:unknown;costs:{reserved:number}}}>(await n.call(restarted,'reconcile',{sessionId:parent.sessionId,operationId:o.operationId}));assert.equal(unknown.status,'unknown');assert.deepEqual(unknown.view.pendingModel,view.pendingModel);assert.equal(unknown.view.costs.reserved,view.costs.reserved);assert.deepEqual(await recreated.repository.snapshot(parent.scope,parent.sessionId),beforeResolution);
   if(order==='Stop-before-accept')assert.equal((await recreated.models.seal(parent.scope,o)).status,'sealed-not-accepted');else await f.finalize(o);
   const resolved=result<{status:string;replayAllowed:boolean;view:{state:string;pendingModel:unknown;modelResultCount:number;costs:{reserved:number;actual:number}}}>(await n.call(restarted,'reconcile',{sessionId:parent.sessionId,operationId:o.operationId}));
   assert.equal(resolved.status,order==='Stop-before-accept'?'safely-failed':'completed');assert.equal(resolved.replayAllowed,false);assert.equal(resolved.view.state,'cancelling');assert.equal(resolved.view.pendingModel,null);assert.equal(resolved.view.modelResultCount,0);assert.equal(resolved.view.costs.reserved,0);assert.equal(resolved.view.costs.actual>0,order==='accept-before-Stop');
   assert.deepEqual((await recreated.repository.snapshot(parent.scope,parent.sessionId)).events.slice(0,stopped.events.length),stopped.events);
   assert.equal((await n.call(restarted,'requestTurn',{...await n.command(parent.sessionId),input:'still fenced after settlement',choice:null}))['error'],'STALE_FENCE');for(const k of ['accept','acceptance'])assert.equal((await f.counters())[k]??0,counts[k]??0);
   console.log(JSON.stringify({measurement:'native-Stop-restart-accounting',schedule:order,oldPid:oldProcess.pid,recreatedPid:restarted.pid,priorGeneration:oldParent.cancellationGeneration,cancellationGeneration:stopped.cancellationGeneration,termination:'unknown',acceptedInference:order==='accept-before-Stop'?1:0,originalReservation:o.reservationId,resolution:resolved.status,newEffects:callbacks-6,assurance:'deterministic-local-only'}));
  }finally{await stopOwned(restarted);}
 });
}
