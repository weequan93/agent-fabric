import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createNativeFixture } from './native-fixture.js';
import { journey,requestsFor,noDispatch } from './profile-context-journey.js';
import { waitUntil,stopOwned } from './process-fixture.js';
import { operator,result,completedTurn } from './operator-journey.js';
import { ModelRepository,type PrepareInput } from '../../src/model-repository.js';
import { NativeRepository } from '../../src/native-repository.js';
import { NativeSession } from '../../src/native-session.js';
import { UsageRepository } from '../../src/usage-repository.js';
import { ModelService } from '../../src/model-service.js';
import { SessionLoop } from '../../src/native-imports.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { AUTO_CHOICE } from '../../src/profile.js';
import type { AsyncUnitOfWork } from '../../src/contracts.js';
type Native=Awaited<ReturnType<typeof createNativeFixture>>;
const code=(s:string)=>(e:unknown)=>(e as {code?:string}).code===s;
const deferred=()=>{let release!:()=>void;const promise=new Promise<void>(r=>{release=r;});return {promise,release};};
async function zero(n:Native,a:Awaited<ReturnType<Native['task']>>){
 assert.equal((await requestsFor(n,a.binding.runId)).length,0);
 for(const table of ['model_operations','budget_reservations'])assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE run_id=$1',[a.binding.runId])).rows[0].n,0,table);
 assert.equal((await n.native.session.inspect(a.scope,a.sessionId)).costs.reserved,0);
}
async function prefix(n:Native){
 const a=await n.task(),s=await n.native.repository.snapshot(a.scope,a.sessionId),ids={tenantId:a.scope.tenantId,spaceId:a.scope.spaceId,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},request=await n.native.ports.encode(a.scope,s,n.profile,'serialized admission',ids);
 const loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:ids.operationId,reservationId:ids.reservationId}),model:async()=>{throw new Error('capture only');},execute:async()=>{throw new Error('no effect');}});
 loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});await assert.rejects(loop.callModel('serialized admission'),/capture only/);
 const input:PrepareInput={binding:s.binding,origin:s.origin,nativePrefix:loop.events(),request,route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:'model:'+randomUUID(),expiresAt:new Date(Date.now()+60_000).toISOString(),retryCeiling:3}};
 return {a,s,input};
}
async function observed(n:Native,pid:()=>number|undefined,blocker:number,label:string){
 let row:Record<string,unknown>|undefined;await waitUntil(async()=>{if(!pid())return false;row=(await n.f.admin.query('SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid()])).rows[0];return row?.['wait_event_type']==='Lock'&&(row['blockers'] as number[]).includes(blocker);},label,1500);
 console.log(JSON.stringify({measurement:'preparation-refusal-lock-order',label,...row}));
}
function tracked(n:Native,onPid:(pid:number)=>void):AsyncUnitOfWork{return {withScope:(scope,work)=>n.f.uow.withScope(scope,async tx=>{onPid(Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']));return work(tx);})};}

export async function preparationRefusalCases(t:TestContext){
 for(const stage of ['reserved','operation','attempt','pending','audit','outbox'] as const)await t.test('prepare-required-write-rollback/'+stage+'/safe-recovery',async()=>{
  const n=await createNativeFixture();try{
   const a=await n.task(),j=journey(n),model=new ModelRepository(n.f.uow,j.models.model.authority,{afterStage:async(at,tx)=>{if(at===stage)await tx.query('SELECT 1/0');}}),models=new ModelService(model,j.models.usage,[n.installed()]),session=new NativeSession(n.native.repository,models,j.session.ports);
   await noDispatch(n,async()=>{const wait=await session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'rolled back admission',choice:null});assert.equal(wait.status,'waiting');assert.equal(wait.view.pendingModel,null);assert.equal(wait.view.wait?.reason,'connection');assert.equal(wait.view.modelResultCount,0);await zero(n,a);});
   const proof=(await n.f.admin.query('SELECT original,original_key FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rows;assert.equal(proof.length,1);
   for(const table of ['model_claims','model_receipt_owners'])assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE attempt_id=$1',[proof[0].original.attemptId])).rows[0].n,0,table);
   for(const table of ['model_audit','model_outbox','model_command_receipts'])assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[proof[0].original_key])).rows[0].n,1,'only durable refusal '+table);
   await session.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:64});assert.equal((await j.turn(a,'authorized new turn')).status,'completed');assert.equal(j.requests.length,1);
  }finally{await n.close();}
 });
 await t.test('native-retry-preparation-rollback/keeps-original-charges-and-retry-count',async()=>{
  const n=await createNativeFixture();try{
   const a=await n.task(),first=journey(n,{schedule:{outcome:'known-failure'}}),failed=await first.turn(a);assert.equal(failed.status,'waiting');const original=first.requests[0]!.original,actual=failed.view.costs.actual;assert.ok(actual>0);
   let injected=0;const j=journey(n),model=new ModelRepository(n.f.uow,j.models.model.authority),usage=new UsageRepository(n.f.uow,j.models.usage.authority,{afterStage:async(at,tx)=>{if(at==='attempt'){injected++;await tx.query('SELECT 1/0');}}}),models=new ModelService(model,usage,[n.installed()]),session=new NativeSession(n.native.repository,models,j.session.ports);
   await noDispatch(n,async()=>{const wait=await session.retryTurn(a.scope,{...await n.command(a.sessionId),operationId:original.operationId,input:'rollback only new retry',choice:null});assert.equal(wait.view.pendingModel,null);assert.equal(wait.view.wait?.reason,'connection');assert.equal(wait.view.costs.actual,actual);assert.equal(wait.view.costs.reserved,0);});
   assert.equal(injected,1);assert.equal((await requestsFor(n,a.binding.runId)).length,1);assert.equal((await n.f.admin.query('SELECT record FROM fabric.model_operations WHERE operation_id=$1',[original.operationId])).rows[0].record.attemptsTaken,1);
   const done=await j.session.retryTurn(a.scope,{...await n.command(a.sessionId),operationId:original.operationId,input:'explicit current retry',choice:null});assert.equal(done.status,'completed');assert.equal((await requestsFor(n,a.binding.runId)).length,2);assert.equal(done.view.pendingModel,null);assert.ok(done.view.costs.actual>actual);
  }finally{await n.close();}
 });
 for(const stage of ['audit','outbox'] as const)await t.test('refusal-required-write-rollback/'+stage+'/no-orphan-checkpoint',async()=>{
  const n=await createNativeFixture();try{
   const a=await n.task(),j=journey(n),repository=new NativeRepository(n.f.uow,n.f.bindingFor,{afterStage:async(at,tx)=>{if(at===stage&&(await tx.query('SELECT 1 FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rowCount)await tx.query('SELECT 1/0');}});
   const models=new ModelService(new ModelRepository(n.f.uow,j.models.model.authority,{afterStage:async(at,tx)=>{if(at==='pending')await tx.query('SELECT 1/0');}}),j.models.usage,[n.installed()]),session=new NativeSession(repository,models,j.session.ports);
   await noDispatch(n,()=>assert.rejects(session.requestTurn(a.scope,{...command(a),input:'proof rollback',choice:null}),code('22012')));
   const saved=await repository.snapshot(a.scope,a.sessionId);assert.equal(saved.events.length,0);assert.equal(saved.control.wait,null);assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rows[0].n,0);await zero(n,a);
   assert.equal((await j.turn(a,'new explicit turn after rollback')).status,'completed');
  }finally{await n.close();}
 });
 await t.test('refusal-committed-checkpoint-rollback/restart-reconcile-accurate-wait',async()=>{
  const n=await createNativeFixture();try{
   const a=await n.task(),j=journey(n),repository=new NativeRepository(n.f.uow,n.f.bindingFor,{afterStage:async(at,tx)=>{if(at==='audit'&&(await tx.query("SELECT 1 FROM fabric.model_command_receipts WHERE receipt->>'sessionId'=$1 AND receipt ? 'noDispatchOriginal'",[a.sessionId])).rowCount)await tx.query('SELECT 1/0');}});
   const session=new NativeSession(repository,j.models,{...j.session.ports,encode:async(...args)=>{const r=await j.session.ports.encode(...args);await n.f.admin.query('UPDATE fabric.model_policies SET admission_enabled=false WHERE tenant_id=$1 AND space_id=$2',[a.scope.tenantId,a.scope.spaceId]);return r;}});
   await noDispatch(n,()=>assert.rejects(session.requestTurn(a.scope,{...command(a),input:'current PG policy refusal',choice:null})));
   const proof=(await n.f.admin.query('SELECT original FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rows[0];assert.ok(proof);await zero(n,a);
   const old=await n.process(),counts=await n.f.counters();await stopOwned(old,'SIGKILL');const p=await n.process(),op=operator(n,p);
   const replay=result<{pendingModel:{operationId:string}}>(await op('replay',{sessionId:a.sessionId}));assert.equal(replay.pendingModel.operationId,proof.original.operationId);assert.deepEqual(await n.f.counters(),counts);
   const resolved=result<{status:string;view:Awaited<ReturnType<NativeSession['inspect']>>}>(await op('reconcile',{sessionId:a.sessionId,operationId:proof.original.operationId}));assert.equal(resolved.status,'safely-failed');assert.equal(resolved.view.pendingModel,null);assert.equal(resolved.view.wait?.reason,'permission');assert.deepEqual(await n.f.counters(),counts);
   await n.f.admin.query('UPDATE fabric.model_policies SET admission_enabled=true WHERE tenant_id=$1 AND space_id=$2',[a.scope.tenantId,a.scope.spaceId]);result(await op('qualify',{}));result(await op('resume',{...await n.command(a.sessionId),inputLimitBytes:64}));assert.equal((await completedTurn(n,p,{...await n.command(a.sessionId),input:'restored current authority',choice:null})).status,'completed');
  }finally{await n.close();}
 });
 for(const order of ['commit','rollback','timeout'] as const)await t.test('prepare-before-refusal/'+order+'/actual-PG-serialization',async()=>{
  const n=await createNativeFixture(),held=deferred(),release=deferred();let preparePid=0,refusePid=0;try{
   const {a,s,input}=await prefix(n),model=new ModelRepository(tracked(n,p=>{preparePid=p;}),n.native.models.model.authority,{afterStage:async(at,tx)=>{if(at==='pending'){held.release();await release.promise;if(order==='rollback')await tx.query('SELECT 1/0');}}}),models=new ModelService(model,n.native.models.usage,[n.installed()]);
   const preparing=models.prepare(a.scope,input).then(value=>({value}),error=>({error}));await Promise.race([held.promise,preparing.then(outcome=>{assert.ok('value' in outcome,'prepare failed before barrier: '+JSON.stringify(outcome));})]);
   const repo=new NativeRepository(tracked(n,p=>{refusePid=p;}),n.f.bindingFor),refusing=repo.refusePreparation(a.scope,s,input.nativePrefix,input.request.original,input.command.key,'connection').then(value=>({value}),error=>({error}));
   await observed(n,()=>refusePid,preparePid,order);if(order==='timeout'){const refusal=await refusing;assert.ok('error' in refusal);assert.equal((refusal.error as {code:string}).code,'55P03');}
   release.release();const prepared=await preparing,refusal=await refusing;
   if(order==='rollback'){assert.ok('error' in prepared);assert.deepEqual(refusal,{value:true});await zero(n,a);}else{assert.ok('value' in prepared);if(order==='commit')assert.deepEqual(refusal,{value:false});assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rows[0].n,0);assert.ok((await n.native.session.inspect(a.scope,a.sessionId)).costs.reserved>0);}
   assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[input.request.original.attemptId])).rows[0].n,0);assert.equal(await n.f.journal(input.request.original),undefined);
  }finally{release.release();await n.close();}
 });
 for(const order of ['commit','rollback'] as const)await t.test('refusal-before-prepare/'+order+'/permanent-fence-or-rollback',async()=>{
  const n=await createNativeFixture(),held=deferred(),release=deferred();let preparePid=0,refusePid=0;try{
   const {a,s,input}=await prefix(n),repo=new NativeRepository(tracked(n,p=>{refusePid=p;}),n.f.bindingFor,{afterStage:async(at,tx)=>{if(at==='audit'){held.release();await release.promise;if(order==='rollback')await tx.query('SELECT 1/0');}}});
   const refusing=repo.refusePreparation(a.scope,s,input.nativePrefix,input.request.original,input.command.key,'model-unavailable').then(value=>({value}),error=>({error}));await Promise.race([held.promise,refusing.then(outcome=>{assert.ok('value' in outcome,'refusal failed before barrier: '+JSON.stringify(outcome));})]);
   const model=new ModelRepository(tracked(n,p=>{preparePid=p;}),n.native.models.model.authority),models=new ModelService(model,n.native.models.usage,[n.installed()]);const preparing=models.prepare(a.scope,input).then(value=>({value}),error=>({error}));
   await observed(n,()=>preparePid,refusePid,order);release.release();const refusal=await refusing,prepared=await preparing;
   if(order==='commit'){
    assert.deepEqual(refusal,{value:true});assert.ok('error' in prepared);assert.equal((prepared.error as {code:string}).code,'IDEMPOTENCY_CONFLICT');await zero(n,a);
    await assert.rejects(models.prepare(a.scope,{...input,command:{...input.command,key:'changed-key:'+randomUUID()}}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
    const before=await n.snapshot();assert.equal(await repo.refusePreparation(a.scope,s,input.nativePrefix,input.request.original,input.command.key,'model-unavailable'),true);assert.deepEqual(await n.snapshot(),before);
    await assert.rejects(n.f.admin.query('DELETE FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId]));for(const pool of [n.f.worker,n.f.client,n.f.receiptOwner]){await assert.rejects(pool.query('SELECT * FROM fabric.model_preparation_refusals'));await assert.rejects(pool.query('SELECT fabric.model_preparation_unreserved($1,$2)',[input.request.original.reservationId,input.request.original.attemptId]));}
   }else{assert.ok('error' in refusal);assert.ok('value' in prepared);assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_preparation_refusals WHERE session_id=$1',[a.sessionId])).rows[0].n,0);assert.ok((await n.native.session.inspect(a.scope,a.sessionId)).costs.reserved>0);}
  }finally{release.release();await n.close();}
 });
}
function command(a:{sessionId:string}){return {sessionId:a.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+60_000).toISOString()};}
