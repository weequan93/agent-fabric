import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createNativeFixture } from './native-fixture.js';
import { launchOwned,stopOwned,type OwnedProcess } from './process-fixture.js';
import { SessionLoop,replaySession,type SessionState } from '../../src/native-imports.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { nativeView } from '../../src/view.js';
import type { OriginalCall } from '../../src/contracts.js';
import type { NativeSnapshot } from '../../src/native-repository.js';
type Native=Awaited<ReturnType<typeof createNativeFixture>>;
type History={name:string;sessionId:string;snapshot:NativeSnapshot;original:OriginalCall|null;state:SessionState};
type Replay={state:SessionState;history:NativeSnapshot['events'];projection:ReturnType<typeof nativeView>;pins:NativeSnapshot['binding']['versions'];nextAction:string;negatives:Record<string,string>;counters:Record<string,number>};
const result=<T>(r:Record<string,unknown>):T=>{assert.equal(r['error'],undefined,JSON.stringify(r));assert.ok(r['result']);return r['result'] as T;};
async function prepared(n:Native,name:string){
 const a=await n.task({noSources:true}),s=await n.native.repository.snapshot(a.scope,a.sessionId),ids={tenantId:n.f.tenant,spaceId:n.f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},request=await n.native.context.encode(a.scope,s,n.profile,'durable native replay fixture',ids);
 const loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:ids.operationId,reservationId:ids.reservationId}),model:async()=>{throw new Error('Fixture capture before model prepare');},execute:async()=>{throw new Error('Fixture must never execute a tool');}});
 loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});await assert.rejects(loop.callModel('durable native replay fixture'),/Fixture capture before model prepare/);
 await n.native.models.prepare(a.scope,{binding:a.binding,request,origin:s.origin,nativePrefix:loop.events(),route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:new Date(Date.now()+60_000).toISOString(),retryCeiling:3}});
 if(name==='claimed'){assert.ok(await n.native.models.model.claim(a.scope,request.original.attemptId));}
 if(name==='unknown'||name==='stopped'){
  await n.f.schedule(request.original,{usage:'manual'},true);assert.equal((await n.native.models.dispatch(a.scope,request.original)).status,'unknown');
  assert.equal((await n.f.journal(request.original)).status,'accepted');
 }
 if(name==='stopped'){
  const v=await n.native.session.inspect(a.scope,a.sessionId);await n.native.session.stop(a.scope,{sessionId:a.sessionId,key:randomUUID(),observedRevision:v.revision,expiresAt:new Date(Date.now()+60_000).toISOString()});
 }
 return {sessionId:a.sessionId,original:request.original};
}
async function identity(n:Native){return {owner:n.f.fixtureOwner,postgres:(await n.f.admin.query('SELECT current_database() AS name,(SELECT oid FROM pg_database WHERE datname=current_database()) AS oid,pg_postmaster_start_time() AS started')).rows[0],journal:(await n.f.admin.query("SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY attempt_id),'[]') AS rows FROM model_receipts.journal j WHERE owner_id=$1",[n.f.ownerId])).rows[0].rows};}
async function spawn(n:Native){return launchOwned(resolve(n.f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/recovery-native-replay-process.js'),'FABRIC_MODEL_REPLAY_CALLER',{controllerDsn:n.f.fixtureDsn('controller'),authorityDsn:n.f.fixtureDsn('authority'),token:n.f.tokens[1],tenantId:n.f.tenant,spaceId:n.f.space,issuer:n.f.endpoints['issuer'],jwksUrl:n.f.endpoints['jwksUrl'],url:n.f.adapterUrl(),transportToken:n.f.transportToken,ownerId:n.f.ownerId,profile:n.profile,pins:n.pins,descriptors:[...n.descriptors]});}
/** True recreated native service compositions replay unchanged kernel reducers.
 * All histories below were committed by actual F04 owners, never inserted events. */
export function registerNativeReplay():void{
 test('U10',async t=>{
  const n=await createNativeFixture(),children:OwnedProcess[]=[];
  try{
   const histories:History[]=[];
   for(const name of ['settled','budget-wait','prepared','claimed','unknown','stopped']){
    let value:{sessionId:string;original:OriginalCall|null};
    if(name==='settled'||name==='budget-wait'){
     const a=await n.task({noSources:true,...(name==='budget-wait'?{ceiling:1}:{})});
     const response=await n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'native durable answer',choice:null});assert.equal(response.status,name==='settled'?'completed':'waiting');
     if(name==='budget-wait')assert.equal(response.view.wait?.reason,'budget');
     const o=(await n.f.admin.query('SELECT a.request FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.session_id=$1',[a.sessionId])).rows[0]?.request?.original as OriginalCall|undefined;
     value={sessionId:a.sessionId,original:o??null};
    }else value=await prepared(n,name);
    const snapshot=await n.native.repository.snapshot(n.f.issued[1]!,value.sessionId),state=replaySession(snapshot.origin,snapshot.events);
    assert.ok(snapshot.events.length>0);if(['prepared','claimed','unknown','stopped'].includes(name))assert.ok(state.pendingModel);if(name==='stopped')assert.equal(snapshot.stopped,true);
    histories.push({name,...value,snapshot,state});
   }
   const first=await spawn(n);children.push(first);const saved=new Map<string,Replay>();
   const ledger=await n.snapshot(),db=await identity(n),before=await n.f.counters();
   for(const h of histories)await t.test('pure-native-replay/'+h.name,async()=>{
    const r=result<Replay>(await n.call(first,'replay',{sessionId:h.sessionId}));saved.set(h.name,r);assert.deepEqual(r.state,h.state);assert.deepEqual(r.history,h.snapshot.events);assert.deepEqual(r.pins,n.pins);
    assert.equal(r.projection.committedWorkDigest,(await n.native.session.inspect(n.f.issued[1]!,h.sessionId)).committedWorkDigest);assert.deepEqual(r.projection.costs,(await n.native.session.inspect(n.f.issued[1]!,h.sessionId)).costs);
    assert.equal(r.negatives['incompatibleVersion'],'UNSUPPORTED_VERSION');for(const amount of Object.values(r.counters))assert.equal(amount,0);
    if(h.state.pendingModel){assert.ok(r.negatives['freshModel']);assert.ok(r.negatives['freshEffect']);assert.equal(r.negatives['wrongOriginal'],'CHECK_BINDING_MISMATCH');assert.equal(r.negatives['untrustedResolution'],'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');assert.equal(r.nextAction,'reconcile');}
    assert.deepEqual(await n.snapshot(),ledger);assert.deepEqual(await identity(n),db);assert.deepEqual(await n.f.counters(),before);
   });
   await stopOwned(first,'SIGKILL');const next=await spawn(n);children.push(next);assert.notEqual(next.pid,first.pid);assert.deepEqual(await identity(n),db);assert.deepEqual(await n.snapshot(),ledger);
   for(const h of histories)await t.test('changed-PID-replay/'+h.name,async()=>{
    const r=result<Replay>(await n.call(next,'replay',{sessionId:h.sessionId}));assert.deepEqual(r,saved.get(h.name));assert.deepEqual(await n.snapshot(),ledger);assert.deepEqual(await identity(n),db);
    const counts=await n.f.counters();assert.equal(counts['accept']??0,before['accept']??0,'accept ATTEMPTS unchanged');assert.equal(counts['acceptance']??0,before['acceptance']??0,'accepted inference unchanged');assert.deepEqual(counts,before);
   });
   // Only an explicit original-owner operation may append a resolution. Pure
   // restore refuses even the correct identity unless trusted resolution is installed.
   for(const h of histories.filter(h=>['prepared','claimed','unknown','stopped'].includes(h.name)))await t.test('explicit-original-resolution/'+h.name,async()=>{
    const o=h.original!;const counts=await n.f.counters(),snap=await n.snapshot();assert.equal((await n.call(next,'resolve',{sessionId:h.sessionId,operationId:randomUUID()}))['error'],'CHECK_BINDING_MISMATCH');assert.deepEqual(await n.f.counters(),counts);assert.deepEqual(await n.snapshot(),snap);
    if(h.name==='prepared'){
     const reservation=(await n.f.admin.query('SELECT amount,settled_amount,state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];assert.ok(reservation);assert.equal(reservation.state,'active');assert.equal(Number(reservation.settled_amount),0);
     assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[o.attemptId])).rows[0].n,0);
     const absent=result<{status:string;view:{pendingModel:unknown}}>(await n.call(next,'resolve',{sessionId:h.sessionId,operationId:o.operationId}));assert.equal(absent.status,'unknown');assert.deepEqual(absent.view.pendingModel,h.state.pendingModel);assert.deepEqual(await n.snapshot(),snap);
     assert.deepEqual((await n.f.admin.query('SELECT amount,settled_amount,state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0],reservation);assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[o.attemptId])).rows[0].n,0);
     const observed=await n.f.counters();assert.equal(observed['accept']??0,counts['accept']??0);assert.equal(observed['acceptance']??0,counts['acceptance']??0);
     // Prepare has an acknowledged durable owner. Only a separately explicit,
     // current claim may establish an admission identity; replay grants none.
     const permit=await n.native.models.model.claim(n.f.issued[1]!,o.attemptId);assert.ok(permit);assert.equal((await n.f.admin.query('SELECT claim_id FROM fabric.model_claims WHERE attempt_id=$1',[o.attemptId])).rows[0].claim_id,permit.claimId);assert.equal((await n.f.admin.query('SELECT record FROM fabric.model_attempts WHERE attempt_id=$1',[o.attemptId])).rows[0].record.status,'claimed');
     const claimedCounts=await n.f.counters();assert.equal(claimedCounts['accept']??0,counts['accept']??0);assert.equal(claimedCounts['acceptance']??0,counts['acceptance']??0);
    }
    if(h.name==='prepared'||h.name==='claimed')assert.equal((await n.native.models.seal(n.f.issued[1]!,o)).status,'sealed-not-accepted');else await n.f.finalize(o);
    const r=result<{status:string;replayAllowed:boolean;view:{pendingModel:unknown;modelResultCount:number}}>(await n.call(next,'resolve',{sessionId:h.sessionId,operationId:o.operationId}));assert.equal(r.status,h.name==='prepared'||h.name==='claimed'?'safely-failed':'completed');assert.equal(r.replayAllowed,false);assert.equal(r.view.pendingModel,null);assert.equal(r.view.modelResultCount,0,'resolution does not replay or publish output');
    const after=await n.f.counters();assert.equal(after['accept']??0,counts['accept']??0);assert.equal(after['acceptance']??0,counts['acceptance']??0);
    const restored=result<Replay>(await n.call(next,'replay',{sessionId:h.sessionId}));assert.equal(restored.state.pendingModel,null);assert.deepEqual(restored.pins,n.pins);for(const amount of Object.values(restored.counters))assert.equal(amount,0);
   });
  }finally{const results=await Promise.allSettled(children.map(c=>stopOwned(c)));await n.close();for(const r of results)if(r.status==='rejected')throw r.reason;}
 });
}
