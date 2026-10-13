import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createNativeFixture } from '../helpers/native-fixture.js';
import { waitUntil,stopOwned } from '../helpers/process-fixture.js';
import { NativeSession } from '../../src/native-session.js';
import { NativeRepository } from '../../src/native-repository.js';
import { ModelRepository } from '../../src/model-repository.js';
import { ModelService } from '../../src/model-service.js';
import { SessionLoop } from '../../src/native-imports.js';
import { ModelError } from '../../src/errors.js';
import type { OriginalCall } from '../../src/contracts.js';
const code=(expected:string)=>(e:unknown)=>e instanceof ModelError&&e.code===expected;
const expires=()=>new Date(Date.now()+60_000).toISOString();

test('NATIVE/wait-stop',async t=>{
 const n=await createNativeFixture(),f=n.f; t.after(n.close);const svc=n.native.session;
 const latest=async(runId:string)=>{let original:OriginalCall|undefined;await waitUntil(async()=>{const rows=(await f.admin.query('SELECT a.record FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.run_id=$1 ORDER BY a.ordinal DESC',[runId])).rows;if(!rows[0])return false;original=rows[0].record.original as OriginalCall;return true;},'actual prepared native original');return original!;};
 await t.test('owned-native-process-no-choice-Ask-actual-compiler-and-service-receipt',{timeout:15_000},async()=>{
  const a=await n.task(),p=await n.process();const qualified=await n.call(p,'qualify',{});assert.equal(qualified['error'],undefined);assert.equal((qualified['result'] as {qualified:boolean}).qualified,true);
  const before=await f.counters(),result=await n.call(p,'requestTurn',{...await n.command(a.sessionId),input:'Ask briefly',choice:null});assert.equal(result['error'],undefined,JSON.stringify(result));const response=result['result'] as {status:string;output:string;view:{choiceLabel:string;modelResultCount:number;costs:{actual:number}}};assert.equal(response.status,'completed');assert.ok(response.output.startsWith('local:'));assert.equal(response.view.choiceLabel,'Auto - organization approved');assert.equal(response.view.modelResultCount,1);assert.ok(response.view.costs.actual>2);
  const o=await latest(a.binding.runId),journal=await f.journal(o);assert.equal(journal.status,'settled');assert.equal(journal.request.profileDigest,n.profile.profileDigest);const payload=JSON.parse(journal.request.payload),compiled=JSON.parse(payload.text);assert.equal(compiled.capsule.binding.payerId,a.binding.payerId);assert.equal(compiled.profile.profileDigest,n.profile.profileDigest);assert.equal(compiled.capsule.manifest.sources[0].sourceId,n.record.sourceId);
  assert.equal((await f.counters())['acceptance'],(before['acceptance']??0)+1);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});assert.ok(!JSON.stringify(response.view).includes('NATIVE_SOURCE_PRIVATE_MARKER'));await stopOwned(p);
 });
 await t.test('actual-native-budget-wait-no-fictitious-reservation-restart-and-32-polls',{timeout:15_000},async()=>{
  const a=await n.task({ceiling:100}),command={...await n.command(a.sessionId),input:'budget refusal',choice:null},before=await f.counters();
  const result=await svc.requestTurn(a.scope,command);assert.equal(result.status,'waiting');assert.equal(result.view.wait?.reason,'budget');assert.equal(result.view.pendingModel,null);assert.equal(result.view.costs.reserved,0);assert.equal(result.view.state,'waiting');assert.equal(result.view.wait?.resolver,'native-budget-owner');assert.ok(result.view.wait?.since);assert.equal(result.view.wait?.replayAllowed,false);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_no_dispatch WHERE session_id=$1',[a.sessionId])).rows[0].n,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE session_id=$1',[a.sessionId])).rows[0].n,0);
  const p=await n.process();for(let i=0;i<32;i++){const state=await n.call(p,'inspect',{sessionId:a.sessionId});assert.equal((state['result'] as {wait:{reason:string}}).wait.reason,'budget');}
  await stopOwned(p,'SIGKILL');const recreated=await n.process();const view=await n.call(recreated,'inspect',{sessionId:a.sessionId});assert.deepEqual((view['result'] as {wait:unknown}).wait,result.view.wait);const replay=await n.call(recreated,'replay',{sessionId:a.sessionId});assert.equal((replay['result'] as {nextAction:string}).nextAction,'wait');assert.deepEqual(await f.counters(),before);await stopOwned(recreated);
 });
 await t.test('authorized-idempotent-top-up-is-separate-from-resume-and-smaller-scope',{timeout:15_000},async()=>{
  const a=await n.task({ceiling:100}),result=await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'budget refusal',choice:null});assert.equal(result.status,'waiting');
  const top={sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),allowanceId:a.leaf,expectedAllowanceRevision:1,addedUnits:100_000},before=await n.snapshot();await assert.rejects(svc.topUp(a.scope,top),code('UNAUTHORIZED'));assert.deepEqual(await n.snapshot(),before);
  const owner=await f.scopeFor(0);assert.equal((await svc.topUp(owner,top)).autoResumed,false);const after=await n.snapshot();assert.deepEqual(await svc.topUp(owner,top),{revision:2,autoResumed:false});assert.deepEqual(await n.snapshot(),after);await assert.rejects(svc.topUp(owner,{...top,addedUnits:100_001}),code('IDEMPOTENCY_CONFLICT'));await assert.rejects(svc.topUp(owner,{...top,key:randomUUID()}),code('STALE_REVISION'));
  assert.equal((await svc.inspect(a.scope,a.sessionId)).wait?.reason,'budget');const noPoll=await f.counters();await assert.rejects(svc.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:65}),code('INTENT_EXCEEDED'));await assert.rejects(svc.resume(f.issued[2]!,{...await n.command(a.sessionId),inputLimitBytes:8}),code('UNAUTHORIZED'));
  // Task ancestor must still admit the same native obligation, not merely its leaf.
  await assert.rejects(svc.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:8}),code('BUDGET_EXHAUSTED'));
  const taskAllowance=a.ids.at(-2)!;await svc.topUp(owner,{...top,key:randomUUID(),allowanceId:taskAllowance,addedUnits:100_000});
  const resumed=await svc.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:8});assert.equal(resumed.autoDispatched,false);assert.equal(resumed.view.wait,null);assert.equal(resumed.view.state,'running');assert.deepEqual(await f.counters(),noPoll);
  await assert.rejects(svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'widened input',choice:null}),code('INTENT_EXCEEDED'));
  const answered=await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'short',choice:null});assert.equal(answered.status,'completed');
 });
 await t.test('approval-wait-preserves-result-expiry-and-ongoing-cost-policy-zero-turns',{timeout:15_000},async()=>{
  const a=await n.task();assert.equal((await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'save prior work',choice:null})).status,'completed');
  // Current trusted approval owner changes its decision, not the admitted intent.
  const session=new NativeSession(n.native.repository,n.native.models,{...n.native.ports,admission:async()=> 'approval'}),before=await f.counters();const wait=await session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'await approval',choice:null});assert.equal(wait.view.wait?.reason,'approval');assert.equal(wait.view.modelResultCount,1);assert.ok(wait.view.wait?.expiresAt);
  const p=await n.process();for(let i=0;i<32;i++){const r=await n.call(p,'inspect',{sessionId:a.sessionId});assert.equal((r['result'] as {modelResultCount:number}).modelResultCount,1);}await stopOwned(p,'SIGKILL');const restarted=await n.process();assert.deepEqual((await n.call(restarted,'inspect',{sessionId:a.sessionId}))['result'],wait.view);assert.deepEqual(await f.counters(),before);await stopOwned(restarted);
  const b=await n.task({approval:true});const continuing=await svc.requestTurn(b.scope,{...await n.command(b.sessionId),input:'needs approval',choice:null});assert.deepEqual(continuing.view.wait?.ongoingChargeCategories,['reserved-compute','retained-storage']);await assert.rejects(svc.resume(b.scope,{...await n.command(b.sessionId),inputLimitBytes:64}),code('UNAUTHORIZED'));
  n.approved.add(b.sessionId);const c=await n.command(b.sessionId);assert.equal((await svc.resume(b.scope,{...c,inputLimitBytes:64})).autoDispatched,false);
 });
 await t.test('model-permission-resource-connection-waits-use-native-state-not-model-text',{timeout:15_000},async()=>{
  for(const reason of ['model-unavailable','permission','resource','connection'] as const){
   const a=await n.task(),before=await f.counters();let session=svc;
   if(reason==='model-unavailable')n.profiles.setAvailable(n.profile.profileId,false);else session=new NativeSession(n.native.repository,n.native.models,{...n.native.ports,admission:async()=>reason});
   const result=await session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'bounded wait',choice:null});assert.equal(result.view.wait?.reason,reason);assert.equal(result.view.pendingModel,null);assert.deepEqual(await f.counters(),before);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
   n.profiles.setAvailable(n.profile.profileId,true);
  }
 });
 await t.test('unknown-usage-holds-original-reserve-top-up-and-resume-cannot-clear-it',{timeout:15_000},async()=>{
  const a=await n.task(),model=new ModelService(n.native.models.model,n.native.models.usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:{...f.adapterClient(),accept:async r=>{await f.schedule(r.original,{usage:'never'});return f.adapterClient().accept(r);},lookup:f.adapterClient().lookup.bind(f.adapterClient()),cancel:f.adapterClient().cancel.bind(f.adapterClient()),sealUnaccepted:f.adapterClient().sealUnaccepted.bind(f.adapterClient())}}]);
  const session=new NativeSession(n.native.repository,model,n.native.ports),result=await session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'unknown usage',choice:null});assert.equal(result.view.wait?.reason,'unknown-usage');assert.ok(result.view.pendingModel);const reserve=result.view.costs.reserved;assert.ok(reserve>0);const o=await latest(a.binding.runId),before=await f.counters();
  await session.topUp(await f.scopeFor(0),{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),allowanceId:a.leaf,expectedAllowanceRevision:Number((await f.admin.query('SELECT revision FROM fabric.budget_allowances WHERE allowance_id=$1',[a.leaf])).rows[0].revision),addedUnits:20});assert.equal((await session.inspect(a.scope,a.sessionId)).costs.reserved,reserve);
  await assert.rejects(session.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:8}));await assert.rejects(session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'new',choice:null}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  const p=await n.process();const replay=await n.call(p,'replay',{sessionId:a.sessionId});assert.equal((replay['result'] as {nextAction:string}).nextAction,'reconcile');assert.deepEqual(await f.counters(),before);await stopOwned(p);
  await f.finalize(o);const reconciled=await session.reconcile(a.scope,{sessionId:a.sessionId,operationId:o.operationId});assert.equal(reconciled.status,'completed');assert.equal(reconciled.view.costs.reserved,0);assert.equal(reconciled.view.wait?.reason,'connection');assert.equal(reconciled.view.modelResultCount,0);assert.equal((await session.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:8})).autoDispatched,false);
 });
 await t.test('Stop-first-burns-fresh-claim-blocks-every-continuation-and-survives-restart',{timeout:15_000},async()=>{
  const a=await n.task(),s=await n.native.repository.snapshot(a.scope,a.sessionId),o={tenantId:f.tenant,spaceId:f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},request=await n.native.context.encode(a.scope,s,n.profile,'pending before stop',o);
  const loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:o.operationId,reservationId:o.reservationId}),model:async()=>{throw new Error('prefix only');},execute:async()=>{throw new Error('no effects');}});loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});await loop.callModel('pending before stop').catch(()=>{});
  await n.native.models.prepare(a.scope,{binding:a.binding,request,origin:a.origin,nativePrefix:loop.events(),route:n.profile.route,categories:{model:Buffer.byteLength(request.payload)+32,service:2},command:{key:randomUUID(),expiresAt:expires(),retryCeiling:3}});const permit=await n.native.models.model.claim(a.scope,request.original.attemptId);assert.ok(permit);const before=await f.counters();const stopped=await svc.stop(a.scope,{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:999_999});assert.equal(stopped.dispatch,'fenced');assert.equal(stopped.termination,'unknown');assert.equal(stopped.cancellationGeneration,1);assert.equal(stopped.unsettled,true);
  await assert.rejects(n.native.models.dispatchPermit(a.scope,request.original,permit));assert.deepEqual(await f.counters(),before);
  for(const effect of ['child','computer','target'] as const)await assert.rejects(svc.continue(a.scope,await n.command(a.sessionId),effect,async()=>{n.counters.effect++;}));
  await assert.rejects(svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'after Stop',choice:null}),code('STALE_FENCE'));
  const p=await n.process();assert.equal(((await n.call(p,'inspect',{sessionId:a.sessionId}))['result'] as {state:string}).state,'cancelling');assert.equal(((await n.call(p,'replay',{sessionId:a.sessionId}))['result'] as {nextAction:string}).nextAction,'reconcile');assert.deepEqual(await f.counters(),before);await stopOwned(p);
  const settled=await n.native.models.seal(a.scope,request.original);assert.equal(settled.status,'sealed-not-accepted');const resolved=await svc.reconcile(a.scope,{sessionId:a.sessionId,operationId:o.operationId});assert.equal(resolved.status,'safely-failed');assert.equal(resolved.view.state,'cancelling');assert.equal(resolved.view.costs.reserved,0);
 });
 await t.test('accept-first-Stop-is-actually-blocked-then-fences-with-retained-liability',{timeout:15_000},async()=>{
  const a=await n.task(),p=await n.process();await f.arm('pre-accept');const work=svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'accept before Stop',choice:null});const guarded=work.then(value=>({value}),error=>({error}));const o=await latest(a.binding.runId);await f.reached('pre-accept',o);
  const stop=n.call(p,'stop',{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:0});
  await waitUntil(async()=>Number((await f.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND cardinality(pg_blocking_pids(pid))>0",['model-native-'+p.marker])).rows[0].n)>0,'observed Stop blocked on native acceptance fence');
  await f.release('pre-accept');const response=await stop;assert.equal(response['error'],undefined,JSON.stringify(response));assert.equal((response['result'] as {dispatch:string}).dispatch,'fenced');await guarded;
  assert.equal((await f.counters())['acceptance']!>0,true);assert.ok(await f.journal(o));assert.equal((await svc.inspect(a.scope,a.sessionId)).state,'cancelling');assert.ok((await svc.inspect(a.scope,a.sessionId)).costs.actual>0||(await svc.inspect(a.scope,a.sessionId)).costs.reserved>0);
  if((await svc.inspect(a.scope,a.sessionId)).pendingModel)await svc.reconcile(a.scope,{sessionId:a.sessionId,operationId:o.operationId});const count=await f.counters();await assert.rejects(svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'new',choice:null}));assert.deepEqual(await f.counters(),count);await stopOwned(p);
 });
 await t.test('parent-Stop-fences-a-separately-admitted-child-before-model-acceptance',{timeout:15_000},async()=>{
  const parent=await n.task(),child=await n.task({parentTaskId:parent.binding.taskId});await svc.stop(parent.scope,{sessionId:parent.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:1});const before=await f.counters();await assert.rejects(svc.requestTurn(child.scope,{...await n.command(child.sessionId),input:'child after Stop',choice:null}));assert.deepEqual(await f.counters(),before);assert.equal((await svc.inspect(child.scope,child.sessionId)).costs.reserved,0);
 });
 await t.test('zero-port-pure-replay-does-not-encode-select-authorize-output-or-publish',{timeout:15_000},async()=>{
  const a=await n.task(),before=await f.counters();await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'saved',choice:null});const state=await n.native.repository.snapshot(a.scope,a.sessionId),ports={...n.native.ports,profiles:{select:()=>{throw new Error('selection during replay');}},encode:async()=>{throw new Error('encoding during replay');},assertOutput:async()=>{throw new Error('output during replay');},assertControl:async()=>{throw new Error('control during replay');},admission:async()=>{throw new Error('admission during replay');},publishChunk:async()=>{throw new Error('publication during replay');}},zero=new NativeSession(n.native.repository,n.native.models,ports);
  const counters=await f.counters(),snapshot=await n.snapshot();const loop=zero.restore(state,a.scope);assert.equal(loop.inspect().modelResponses.length,1);assert.deepEqual(loop.events(),state.events);assert.deepEqual(await f.counters(),counters);assert.deepEqual(await n.snapshot(),snapshot);assert.ok((counters['acceptance']??0)>(before['acceptance']??0));
 });
 await t.test('boundary-forgery-expiry-conflicts-and-cost-view-redaction',{timeout:15_000},async()=>{
  const a=await n.task(),cmd={...await n.command(a.sessionId),input:'closed',choice:null},before=await n.snapshot(),counts=await f.counters();
  for(const extra of [{payerId:f.actors[0]},{route:'real-provider'},{mount:'/Users'},{tool:'computer'},{topUp:900},{scope:{}}])await assert.rejects(svc.requestTurn(a.scope,{...cmd,...extra}));await assert.rejects(svc.requestTurn(a.scope,{...cmd,expiresAt:new Date(Date.now()-1000).toISOString()}),code('EXPIRED_COMMAND'));await assert.rejects(svc.requestTurn({...a.scope},cmd));assert.deepEqual(await n.snapshot(),before);assert.deepEqual(await f.counters(),counts);
  const answered=await svc.requestTurn(a.scope,cmd),after=await f.counters();assert.equal(answered.status,'completed');assert.equal((await svc.requestTurn(a.scope,cmd)).status,'recorded');assert.deepEqual(await f.counters(),after);await assert.rejects(svc.requestTurn(a.scope,{...cmd,input:'conflict'}),code('IDEMPOTENCY_CONFLICT'));const view=JSON.stringify(await svc.inspect(a.scope,a.sessionId));for(const marker of ['NATIVE_SOURCE_PRIVATE_MARKER','contextSources','privateState',f.tokens[1]!,'local:{'])assert.ok(!view.includes(marker));await assert.rejects(svc.inspect(await f.scopeFor(1,f.otherSpace),a.sessionId),code('UNAUTHORIZED'));
 });
 await t.test('required-native-checkpoint-audit-failure-rolls-back-without-new-dispatch',{timeout:15_000},async()=>{
  const a=await n.task({approval:true}),before=await n.snapshot(),counts=await f.counters();let reached=false;
  const repo=new NativeRepository(f.uow,f.bindingFor,{async afterStage(stage,tx){if(stage==='audit'){reached=true;await tx.query('SELECT 1/0');}}}),broken=new NativeSession(repo,n.native.models,n.native.ports);
  await assert.rejects(broken.requestTurn(a.scope,{...await n.command(a.sessionId),input:'audit must work',choice:null}));assert.ok(reached);assert.deepEqual(await n.snapshot(),before);assert.deepEqual(await f.counters(),counts);
 });
 await t.test('revoked-in-flight-audience-blocks-output-but-original-cost-remains-settled',{timeout:15_000},async()=>{
  const x=await createNativeFixture(),g=x.f;let release=()=>{};let pending:Promise<unknown>|undefined;try{
   const a=await x.task();let entered=false;const gate=new Promise<void>(r=>release=r);
   const base=x.native.models,model=new ModelService(base.model,base.usage,[{ownerId:g.ownerId,route:x.profile.route,profileDigest:x.profile.profileDigest,port:g.adapterClient(),result:async o=>{entered=true;await gate;return g.adapterClient().result(o);}}]);
   const session=new NativeSession(x.native.repository,model,x.native.ports),work=session.requestTurn(a.scope,{...await x.command(a.sessionId),input:'revoked result',choice:null});let early:unknown;const guarded=work.catch(error=>{early=error;return null;});pending=guarded;await waitUntil(async()=>{if(early)throw early;return entered;},'staged native result');
   await g.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[g.tenant,g.space,g.actors[2]]);release();
   const result=await guarded;assert.ok(result);assert.equal(result.status,'waiting');assert.equal(result.view.modelResultCount,0);assert.ok(result.view.costs.actual>0);assert.equal(result.view.costs.reserved,0);assert.equal(x.chunks.length,0);
   const frozen=await x.snapshot(),beforeControls=await g.counters();
   const control=await x.command(a.sessionId);await assert.rejects(session.switchProfile(a.scope,{...control,choice:{schemaVersion:1,pin:x.profile.profileId,preference:'Fast',allowEquivalentFallback:false}}));await assert.rejects(session.resume(a.scope,{...control,inputLimitBytes:8}));assert.deepEqual(await x.snapshot(),frozen);assert.deepEqual(await g.counters(),beforeControls);
   await assert.rejects(session.inspect(g.issued[2]!,a.sessionId));const costs=await session.inspect(await g.scopeFor(0),a.sessionId);assert.ok(costs.costs.actual>0);assert.ok(!JSON.stringify(costs).includes('NATIVE_SOURCE_PRIVATE_MARKER'));
  }finally{release();try{await pending;}finally{await x.close();}}
 });
 await t.test('revocation-between-broker-chunks-denies-subsequent-disclosure',{timeout:15_000},async()=>{
  const x=await createNativeFixture(),g=x.f;let update:Promise<unknown>|undefined;try{
   const a=await x.task(),sent:string[]=[];let blocked=false;
   const session=new NativeSession(x.native.repository,x.native.models,{...x.native.ports,publishChunk:async fragment=>{
    sent.push(fragment);if(sent.length===1){
     update=g.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[g.tenant,g.space,g.actors[2]]);
     await waitUntil(async()=>Number((await g.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE query LIKE 'UPDATE fabric.memberships SET revoked_at=clock_timestamp(),%' AND cardinality(pg_blocking_pids(pid))>0")).rows[0].n)>0,'revoker queued behind first authorized chunk');blocked=true;
    }
   }});
   const result=await session.requestTurn(a.scope,{...await x.command(a.sessionId),input:'chunk revocation',choice:null});await update;assert.ok(blocked);assert.equal(sent.length,1);assert.equal(result.status,'waiting');assert.equal(result.view.modelResultCount,0);assert.ok(result.view.costs.actual>0);
  }finally{try{await update;}finally{await x.close();}}
 });
 await t.test('switch-and-resume-are-fresh-safe-controls-never-replay-an-original',{timeout:15_000},async()=>{
  const a=await n.task({approval:true});await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'waiting',choice:null});const before=await f.counters(),work=(await svc.inspect(a.scope,a.sessionId)).committedWorkDigest;
  const switchCommand={...await n.command(a.sessionId),choice:{schemaVersion:1 as const,pin:n.profile.profileId,preference:'Fast' as const,allowEquivalentFallback:false}};
  await assert.rejects(svc.switchProfile(f.issued[2]!,switchCommand),code('UNAUTHORIZED'));const changed=await svc.switchProfile(a.scope,switchCommand);assert.equal(changed.cache,'lost/not-used');assert.equal(changed.autoDispatched,false);assert.equal(changed.view.committedWorkDigest,work);assert.equal(changed.view.wait?.reason,'approval');assert.deepEqual(await f.counters(),before);
  const b=await n.task();let original:OriginalCall|undefined;const model=new ModelService(n.native.models.model,n.native.models.usage,[{...n.installed(),profileDigest:n.profile.profileDigest,port:{accept:async r=>{original=r.original;await f.schedule(r.original,{usage:'never'});return f.adapterClient().accept(r);},lookup:f.adapterClient().lookup.bind(f.adapterClient()),cancel:f.adapterClient().cancel.bind(f.adapterClient()),sealUnaccepted:f.adapterClient().sealUnaccepted.bind(f.adapterClient())}}]);
  const session=new NativeSession(n.native.repository,model,n.native.ports);await session.requestTurn(b.scope,{...await n.command(b.sessionId),input:'pending',choice:null});await assert.rejects(session.switchProfile(b.scope,{...await n.command(b.sessionId),choice:switchCommand.choice}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));assert.ok(original);await f.finalize(original);await session.reconcile(b.scope,{sessionId:b.sessionId,operationId:original.operationId});
 });
 await t.test('visible-admitted-computer-preflight-one-assignment-and-explicit-resume', {timeout:15_000},async()=>{
  const bad=await n.task({computer:true}),before=await f.counters(),assignmentBefore=await f.admin.query('SELECT * FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);
  const denied=await svc.requestTurn(bad.scope,{...await n.command(bad.sessionId),input:'computer not admitted by Ask',choice:null});assert.equal(denied.view.wait?.reason,'permission');assert.equal(denied.view.preflight,null);assert.deepEqual((await f.admin.query('SELECT * FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows,assignmentBefore.rows);
  const resource=randomUUID(),a=await n.task({computer:true,intent:'Act',resourceId:resource});const preflight=await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'simulate admitted computer',choice:null});assert.equal(preflight.status,'waiting');assert.equal(preflight.view.wait?.reason,'resource');assert.equal(preflight.view.preflight?.phase,'preparing');assert.equal(preflight.view.preflight?.resourceId,resource);assert.equal(preflight.view.preflight?.requiredGrant,'computer:use');assert.equal(preflight.view.spaceComputerAssignment,resource);assert.deepEqual(await f.counters(),before);
  const p=await n.process();for(let i=0;i<4;i++)assert.equal(((await n.call(p,'inspect',{sessionId:a.sessionId}))['result'] as {preflight:{phase:string}}).preflight.phase,'preparing');assert.deepEqual(await f.counters(),before);await stopOwned(p);
  const b=await n.task({computer:true,intent:'Act'}),contender=await svc.requestTurn(b.scope,{...await n.command(b.sessionId),input:'competing assignment',choice:null});assert.equal(contender.view.wait?.reason,'resource');assert.equal(contender.view.preflight,null);assert.equal(contender.view.spaceComputerAssignment,resource);assert.notEqual(b.admission.resourceId,resource);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows[0].n,1);
  const ready=await svc.resume(a.scope,{...await n.command(a.sessionId),inputLimitBytes:64});assert.equal(ready.view.preflight?.phase,'simulated-ready');assert.equal(ready.autoDispatched,false);let calls=0;await svc.continue(a.scope,await n.command(a.sessionId),'computer',async()=>{calls++;});assert.equal(calls,1);assert.deepEqual(await f.counters(),before);await svc.stop(a.scope,{sessionId:a.sessionId,key:randomUUID(),expiresAt:expires(),observedRevision:0});await assert.rejects(svc.continue(a.scope,await n.command(a.sessionId),'computer',async()=>{calls++;}));assert.equal(calls,1);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
 });
 await t.test('native-controls-rls-history-and-current-stop-do-not-erase-accounting',{timeout:15_000},async()=>{
  const names=['model_native_controls','model_no_dispatch'];const rows=(await f.admin.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1::text[])',[names])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));for(const pool of [f.worker,f.client,f.receiptOwner])for(const name of names)await assert.rejects(pool.query('SELECT * FROM fabric.'+name));
  const a=await n.task({ceiling:1});await svc.requestTurn(a.scope,{...await n.command(a.sessionId),input:'denied',choice:null});await assert.rejects(f.admin.query('DELETE FROM fabric.model_no_dispatch WHERE session_id=$1',[a.sessionId]));await assert.rejects(f.admin.query('UPDATE fabric.model_native_controls SET admission=$2::jsonb WHERE session_id=$1',[a.sessionId,JSON.stringify({...a.admission,maxInputBytes:999})]));assert.equal((await f.admin.query('SELECT version FROM public.fabric_model_migrations ORDER BY version')).rows.map(r=>r.version).join(','),'1,2,3,4,5,6,7,8,11,12,13,14');
 });
});
