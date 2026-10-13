import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { ModelService } from '../../src/model-service.js';
import { composeNative } from '../../src/native-runtime.js';
import { ModelError } from '../../src/errors.js';
import { AUTO_CHOICE } from '../../src/profile.js';
import type { EncodedRequest,OperatingProfile } from '../../src/contracts.js';
import { captured,requestsFor } from './profile-context-journey.js';
import { accounted,operator,result,type NativeFixture,type OperatorDetails } from './operator-journey.js';
import { stopOwned,waitUntil,type OwnedProcess } from './process-fixture.js';

/** Regression for CODE-F04-001: only the shipped authenticated service process
 * creates ModelService. Fixture ports control downstream timing, never routing. */
export async function operatorChannelJourney(t:TestContext,n:NativeFixture,p:OwnedProcess,
 tasks:{pin:Awaited<ReturnType<NativeFixture['task']>>;switch:Awaited<ReturnType<NativeFixture['task']>>;retry:Awaited<ReturnType<NativeFixture['task']>>;deniedPolicy:Awaited<ReturnType<NativeFixture['task']>>},profile:OperatingProfile){
 const f=n.f,extra=n.additionalAdapters.get(profile.profileId)!;
 assert.ok(extra);assert.notEqual(extra.ownerId,f.ownerId);
 const choice={...AUTO_CHOICE,pin:profile.profileId};
 const op=operator(n,p);
 async function counts(){return {primary:await f.counters(),extra:await extra.counters()};}
 async function scheduled(a:typeof tasks.pin,command:'requestTurn'|'retryTurn',input:Record<string,unknown>,owner:'primary'|'extra',outcome:'answer'|'known-failure',usage:'auto'|'manual',dropAck=false){
  const channel=owner==='primary'?f:extra,count=(await requestsFor(n,a.binding.runId)).length;
  await channel.arm('pre-accept');if(usage==='auto')await channel.arm('lost-ack');
  let returned:Record<string,unknown>|undefined;
  const pending=op(command,input).then(r=>{returned=r;return r;});
  // The fixture admin observes preparation while the dispatch fence is held.
  let r:EncodedRequest|undefined;
  await waitUntil(async()=>{if(returned)throw new Error('Channel command returned before dispatch: '+JSON.stringify(returned));const rows=await requestsFor(n,a.binding.runId);if(rows.length>count)r=rows.at(-1);return !!r;},'operator actual channel dispatch');
  await channel.reached('pre-accept',r!.original);await channel.schedule(r!.original,{outcome,usage},dropAck);await channel.release('pre-accept');
  if(usage==='auto'){await channel.reached('lost-ack',r!.original);await channel.finalize(r!.original);await channel.release('lost-ack');}
  return {request:r!,response:result<{status:string;view:OperatorDetails['view']}>(await pending)};
 }
 async function proof(r:EncodedRequest,owner:'primary'|'extra'){
  const channel=owner==='primary'?f:extra,other=owner==='primary'?extra:f,ownerId=owner==='primary'?f.ownerId:extra.ownerId;
  const row=await channel.journal(r.original);assert.ok(row);assert.deepEqual(row.request,r);assert.equal(row.status,'settled');
  assert.equal(row.receipt.ownerId,ownerId);assert.deepEqual(row.receipt.original,r.original);
  assert.equal(row.receipt.measuredUnits,2+Buffer.byteLength(r.payload)+Buffer.byteLength(row.output??''));
  assert.equal(await other.journal(r.original),undefined,'Original was sent to a different channel');
  const binding=(await f.admin.query('SELECT owner_id,route,profile_digest FROM fabric.model_receipt_owners WHERE attempt_id=$1',[r.original.attemptId])).rows;
  assert.deepEqual(binding,[{owner_id:ownerId,route:owner==='primary'?n.profile.route:profile.route,profile_digest:r.profileDigest}]);
  const rows=(await f.admin.query('SELECT amount FROM fabric.usage_settlements WHERE reservation_id=$1',[r.original.reservationId])).rows;
  assert.equal(rows.length,1);assert.equal(Number(rows[0].amount),row.receipt.measuredUnits);return row.receipt;
 }
 await t.test('installed-channel-ambiguities-refuse-before-any-IO',async()=>{
  const before=await counts(),frozen=await n.snapshot(),client=f.adapterClient(),owner={ownerId:f.ownerId,route:n.profile.route,profileDigest:n.profile.profileDigest,port:client};
  const code=(e:unknown)=>e instanceof ModelError&&e.code==='CHECK_BINDING_MISMATCH';
  assert.throws(()=>new ModelService(n.native.models.model,n.native.models.usage,[owner,{...owner,profileDigest:profile.profileDigest}]),code);
  assert.throws(()=>new ModelService(n.native.models.model,n.native.models.usage,[owner,{...owner,ownerId:extra.ownerId}]),code);
  assert.throws(()=>composeNative({uow:f.uow,bindingFor:f.bindingFor,pins:n.pins,profile:n.profile,profiles:n.profiles,adapter:client,additionalAdapters:[{profile:n.profile,adapter:extra.client()}],descriptors:n.descriptors}),code);
  assert.deepEqual(await counts(),before);assert.deepEqual(await n.snapshot(),frozen);
 });
 await t.test('shipped-available-second-pin-dispatches-exact-capture-once',async()=>{
  const a=tasks.pin,before=await counts(),command={...await n.command(a.sessionId),input:'honor qualified second pin',choice};
  const reader=await n.process(2),frozen=await n.snapshot();
  assert.equal((await operator(n,reader)('requestTurn',command))['error'],'UNAUTHORIZED');assert.deepEqual(await n.snapshot(),frozen);assert.deepEqual(await counts(),before);
  const turn=await scheduled(a,'requestTurn',command,'extra','answer','auto');assert.equal(turn.response.status,'completed');assert.equal(turn.response.view.model?.profileId,profile.profileId);
  const data=captured(turn.request);assert.deepEqual(data.profile,profile);assert.deepEqual(data.capsule.binding,a.binding);assert.deepEqual(data.capsule.manifest.sources,[n.record]);assert.equal(data.payload.privateState,null);
  const receipt=await proof(turn.request,'extra'),d=await accounted(n,p,a.sessionId);assert.equal(d.accounting.attemptCount,1);assert.equal(d.accounting.retryCount,0);assert.equal(d.accounting.heldReserve,0);assert.equal(d.accounting.measured,receipt.measuredUnits);
  const after=await counts();for(const k of ['accept','acceptance']){assert.equal(after.extra[k],(before.extra[k]??0)+1);assert.equal(after.primary[k]??0,before.primary[k]??0);}
  assert.equal(result<{status:string}>(await op('requestTurn',command)).status,'recorded');assert.deepEqual(await counts(),after);assert.deepEqual((await accounted(n,p,a.sessionId)).accounting,d.accounting);
 });
 await t.test('shipped-explicit-switch-to-second-channel-preserves-work-and-revalidates',async()=>{
  const a=tasks.switch;
  const first=await scheduled(a,'requestTurn',{...await n.command(a.sessionId),input:'preserve work before switch',choice:null},'primary','answer','auto');assert.equal(first.response.status,'completed');
  const old=captured(first.request).capsule,receipt=await proof(first.request,'primary'),saved=await n.native.repository.snapshot(a.scope,a.sessionId),before=await counts();
  const switched=result<{autoDispatched:boolean;cache:string;revalidationEstimate:number}>(await op('switchProfile',{...await n.command(a.sessionId),choice}));
  assert.equal(switched.autoDispatched,false);assert.equal(switched.cache,'lost/not-used');assert.ok(switched.revalidationEstimate>2);assert.deepEqual(await counts(),before);assert.deepEqual((await n.native.repository.snapshot(a.scope,a.sessionId)).events,saved.events);
  const next=await scheduled(a,'requestTurn',{...await n.command(a.sessionId),input:'continue saved work on second',choice:null},'extra','answer','auto');assert.equal(next.response.status,'completed');assert.equal(next.response.view.modelResultCount,2);
  const data=captured(next.request);assert.deepEqual(data.profile,profile);assert.deepEqual(data.capsule.binding,old.binding);assert.deepEqual(data.capsule.manifest.sources,old.manifest.sources);assert.equal(data.payload.privateState,null);
  const nextReceipt=await proof(next.request,'extra'),d=await accounted(n,p,a.sessionId);assert.equal(d.accounting.attemptCount,2);assert.equal(d.accounting.retryCount,0);assert.equal(d.accounting.heldReserve,0);assert.equal(d.accounting.measured,receipt.measuredUnits+nextReceipt.measuredUnits);assert.equal(d.accounting.categories['service'],4);
  const after=await counts();for(const k of ['accept','acceptance']){assert.equal(after.extra[k],(before.extra[k]??0)+1);assert.equal(after.primary[k]??0,before.primary[k]??0);}
 });
 await t.test('shipped-equivalent-retry-needs-installed-policy-as-well-as-user-permission',async()=>{
  const a=tasks.deniedPolicy,failed=await scheduled(a,'requestTurn',{...await n.command(a.sessionId),input:'policy denied safe failure',choice:null},'primary','known-failure','auto');
  assert.equal(failed.response.status,'waiting');const receipt=await proof(failed.request,'primary');
  n.approveEquivalentRetries([]);const restricted=await n.process();n.approveEquivalentRetries([[n.profile.profileId,profile.profileId]]);
  const restrictedOp=operator(n,restricted);result(await restrictedOp('qualify',{}));const before=await counts();
  const denied=result<{status:string;view:OperatorDetails['view']}>(await restrictedOp('retryTurn',{...await n.command(a.sessionId),operationId:failed.request.original.operationId,input:'user cannot grant policy',choice:{...choice,allowEquivalentFallback:true}}));
  assert.equal(denied.status,'waiting');assert.equal(denied.view.wait?.reason,'model-unavailable');assert.equal(denied.view.pendingModel,null);
  const shown=await accounted(n,restricted,a.sessionId);assert.equal(shown.accounting.attemptCount,1);assert.equal(shown.accounting.retryCount,0);assert.equal(shown.accounting.heldReserve,0);assert.equal(shown.accounting.measured,receipt.measuredUnits);
  const after=await counts();for(const k of ['accept','acceptance']){assert.equal(after.primary[k],before.primary[k]);assert.equal(after.extra[k],before.extra[k]);}
  assert.equal((await requestsFor(n,a.binding.runId)).length,1);await stopOwned(restricted);
 });
 await t.test('shipped-approved-equivalent-retry-recovers-original-owner-after-restart',async()=>{
  const a=tasks.retry;
  const failed=await scheduled(a,'requestTurn',{...await n.command(a.sessionId),input:'safe failed original',choice:null},'primary','known-failure','auto');assert.equal(failed.response.status,'waiting');assert.equal(failed.response.view.wait?.reason,'connection');
  const oldReceipt=await proof(failed.request,'primary'),originalJournal=await f.journal(failed.request.original),before=await counts();
  // User permission is independent of the trusted installed equivalent policy.
  const refused=await op('retryTurn',{...await n.command(a.sessionId),operationId:failed.request.original.operationId,input:'deny unpermitted equivalent',choice});assert.equal(refused['error'],'UNAUTHORIZED');assert.deepEqual(await counts(),{...before,primary:{...before.primary,lookup:before.primary['lookup']!+1}});assert.equal((await requestsFor(n,a.binding.runId)).length,1);
  const command={...await n.command(a.sessionId),operationId:failed.request.original.operationId,input:'approved equivalent retry',choice:{...choice,allowEquivalentFallback:true}};
  const retried=await scheduled(a,'retryTurn',command,'extra','answer','manual',true);assert.equal(retried.response.status,'waiting');assert.equal(retried.response.view.wait?.reason,'unknown-usage');
  assert.equal(retried.request.original.operationId,failed.request.original.operationId);assert.notEqual(retried.request.original.attemptId,failed.request.original.attemptId);assert.notEqual(retried.request.original.reservationId,failed.request.original.reservationId);assert.deepEqual(captured(retried.request).profile,profile);
  const unknown=await accounted(n,p,a.sessionId);assert.equal(unknown.view.model?.fallbackReason,'Known safe failure; approved equivalent deployment');assert.equal(unknown.accounting.attemptCount,2);assert.equal(unknown.accounting.retryCount,1);assert.ok(unknown.accounting.heldReserve>0);
  const after=await counts();assert.equal(after.extra['acceptance'],(before.extra['acceptance']??0)+1);assert.equal(after.primary['acceptance'],before.primary['acceptance']);
  assert.equal(result<{status:string}>(await op('retryTurn',command)).status,'recorded');assert.deepEqual(await counts(),after);
  const saved=await n.native.repository.snapshot(a.scope,a.sessionId);await stopOwned(p,'SIGKILL');await extra.restart();
  const restored=await n.process(),recover=operator(n,restored);assert.equal((await accounted(n,restored,a.sessionId)).view.model?.fallbackReason,'Known safe failure; approved equivalent deployment');assert.deepEqual((await accounted(n,restored,a.sessionId)).accounting,unknown.accounting);assert.deepEqual(await n.native.repository.snapshot(a.scope,a.sessionId),saved);
  assert.equal(result<{nextAction:string}>(await recover('replay',{sessionId:a.sessionId})).nextAction,'reconcile');
  // Restored accounting has no qualified selection. It must use the recorded
  // owner, route and profile, with neither new admission nor a probe/accept.
  const beforeRecovery=await counts();assert.equal(result<{status:string}>(await recover('reconcile',{sessionId:a.sessionId,operationId:retried.request.original.operationId})).status,'unknown');
  const held=await n.snapshot();assert.equal((await recover('switchProfile',{...await n.command(a.sessionId),choice:AUTO_CHOICE}))['error'],'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');assert.ok((await recover('requestTurn',{...await n.command(a.sessionId),input:'no replay',choice:null}))['error']);assert.deepEqual(await n.snapshot(),held);
  await extra.finalize(retried.request.original);
  const recovered=await Promise.all(Array.from({length:4},()=>recover('reconcile',{sessionId:a.sessionId,operationId:retried.request.original.operationId})));assert.ok(recovered.some(r=>r['error']===undefined&&result<{status:string}>(r).status==='completed'));
  for(const r of recovered){if(r['error']===undefined)assert.equal(result<{status:string}>(r).status,'completed');else assert.ok(['STALE_REVISION','CHECK_BINDING_MISMATCH'].includes(String(r['error'])),JSON.stringify(r));}
  const receipt=await proof(retried.request,'extra'),settled=await accounted(n,restored,a.sessionId);assert.equal(settled.accounting.heldReserve,0);assert.equal(settled.accounting.measured,oldReceipt.measuredUnits+receipt.measuredUnits);assert.equal(settled.accounting.retryCount,1);assert.equal(settled.accounting.attemptCount,2);assert.equal(settled.accounting.categories['service'],4);assert.equal(settled.view.modelResultCount,0);
  assert.deepEqual(await f.journal(failed.request.original),originalJournal);
  const finalCounts=await counts();assert.ok(finalCounts.extra['lookup']!>beforeRecovery.extra['lookup']!);assert.equal(finalCounts.primary['lookup'],beforeRecovery.primary['lookup']);
  for(const k of ['accept','acceptance']){assert.equal(finalCounts.extra[k],after.extra[k]);assert.equal(finalCounts.primary[k],after.primary[k]);}
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_attempts WHERE operation_id=$1',[failed.request.original.operationId])).rows[0].n,2);
 });
 console.log(JSON.stringify({measurement:'operator-CODE-F04-001',carrier:'authenticated-native-service-port',qualifiedPin:profile.profileId,ownerChannels:2,exactCapture:true,switch:true,approvedEquivalentRetry:true,originalOwnerRecovery:true,onceOnlyAccounting:true,externalQualification:'E01-E05 unqualified'}));
}

/** A manual C pin must survive retry eligibility even when A->B precedes
 * A->C. Distinct installed owners prove actual routing, not just a preview. */
export async function operatorMultiTargetRetryJourney(t:TestContext,n:NativeFixture,
 tasks:readonly Awaited<ReturnType<NativeFixture['task']>>[],b:OperatingProfile,c:OperatingProfile){
 const f=n.f,owners=[f,n.additionalAdapters.get(b.profileId)!,n.additionalAdapters.get(c.profileId)!];
 assert.equal(new Set(owners.map(o=>o.ownerId)).size,3);
 for(const [index,label] of ['B-before-C','C-before-B','C-not-approved'].entries())await t.test('shipped-three-channel-pinned-retry/'+label,async sub=>{
  const a=tasks[index]!,ab=[n.profile.profileId,b.profileId] as const,ac=[n.profile.profileId,c.profileId] as const;
  n.approveEquivalentRetries(label==='C-not-approved'?[ab]:label==='B-before-C'?[ab,ac]:[ac,ab]);
  const p=await n.process(),op=operator(n,p);sub.after(()=>stopOwned(p));result(await op('qualify',{}));
  const counts=async()=>Promise.all(owners.map(o=>o.counters()));
  async function scheduled(kind:'requestTurn'|'retryTurn',owner:typeof f|typeof owners[1],input:Record<string,unknown>,outcome:'answer'|'known-failure'){
   const count=(await requestsFor(n,a.binding.runId)).length;await owner.arm('pre-accept');await owner.arm('lost-ack');
   let returned:Record<string,unknown>|undefined;const pending=op(kind,input).then(r=>{returned=r;return r;});
   let request:EncodedRequest|undefined;
   try{
    await waitUntil(async()=>{if(returned)throw new Error('Pinned retry returned before target dispatch: '+JSON.stringify(returned));const rows=await requestsFor(n,a.binding.runId);if(rows.length>count)request=rows.at(-1);return !!request;},'three-channel actual target preparation');
    await owner.reached('pre-accept',request!.original);await owner.schedule(request!.original,{outcome,usage:'auto'});await owner.release('pre-accept');
    await owner.reached('lost-ack',request!.original);await owner.finalize(request!.original);await owner.release('lost-ack');
    return {request:request!,response:result<{status:string;view:OperatorDetails['view']}>(await pending)};
   }catch(error){
    // A red routing assertion must not leave unused gates blocking qualification
    // in the next isolated Task. Restart clears gates, retaining durable usage.
    await owner.restart();throw error;
   }
  }
  const failed=await scheduled('requestTurn',f,{...await n.command(a.sessionId),input:'safely fail original A',choice:{...AUTO_CHOICE,pin:n.profile.profileId}},'known-failure');
  assert.equal(failed.response.status,'waiting');assert.equal(failed.response.view.wait?.reason,'connection');
  const oldJournal=await f.journal(failed.request.original);assert.equal(oldJournal.receipt.outcome,'known-failure');
  const before=await counts(),command={...await n.command(a.sessionId),operationId:failed.request.original.operationId,input:'retry exact pinned C',choice:{...AUTO_CHOICE,pin:c.profileId,allowEquivalentFallback:true}};
  if(label==='C-not-approved'){
   const denied=result<{status:string;view:OperatorDetails['view']}>(await op('retryTurn',command));assert.equal(denied.status,'waiting');assert.equal(denied.view.wait?.reason,'model-unavailable');assert.equal(denied.view.pendingModel,null);
   assert.equal((await requestsFor(n,a.binding.runId)).length,1);const after=await counts();
   for(const i of [0,1,2])for(const k of ['accept','acceptance'])assert.equal(after[i]![k],before[i]![k]);
   const details=await accounted(n,p,a.sessionId);assert.equal(details.accounting.attemptCount,1);assert.equal(details.accounting.retryCount,0);assert.equal(details.accounting.measured,oldJournal.receipt.measuredUnits);assert.equal(details.accounting.heldReserve,0);
  }else{
   const retried=await scheduled('retryTurn',owners[2]!,command,'answer');assert.equal(retried.response.status,'completed');assert.equal(retried.response.view.model?.profileId,c.profileId);assert.equal(retried.response.view.model?.fallbackReason,'Known safe failure; approved equivalent deployment');assert.equal(retried.response.view.modelResultCount,1);
   const r=retried.request,data=captured(r);assert.deepEqual(data.profile,c);assert.deepEqual(data.capsule.binding,a.binding);assert.deepEqual(data.capsule.manifest.sources,[n.record]);assert.equal(data.payload.privateState,null);
   assert.equal(r.original.operationId,failed.request.original.operationId);assert.notEqual(r.original.attemptId,failed.request.original.attemptId);assert.notEqual(r.original.reservationId,failed.request.original.reservationId);
   const journal=await owners[2]!.journal(r.original);assert.equal(journal.status,'settled');assert.deepEqual(journal.request,r);assert.equal(journal.receipt.ownerId,owners[2]!.ownerId);assert.deepEqual(journal.receipt.original,r.original);
   assert.equal(await f.journal(r.original),undefined);assert.equal(await owners[1]!.journal(r.original),undefined);
   const attempts=(await f.admin.query('SELECT a.ordinal,a.record,o.record AS operation FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE a.operation_id=$1 ORDER BY a.ordinal',[r.original.operationId])).rows;
   assert.deepEqual(attempts.map(row=>row.ordinal),[1,2]);assert.equal(attempts[1].operation.attemptsTaken,2);assert.equal(attempts[1].operation.retryCeiling,3);assert.equal(attempts[1].operation.status,'settled');assert.deepEqual(attempts[1].record.original,r.original);
   assert.deepEqual((await f.admin.query('SELECT owner_id,route,profile_digest FROM fabric.model_receipt_owners WHERE attempt_id=$1',[r.original.attemptId])).rows,[{owner_id:owners[2]!.ownerId,route:c.route,profile_digest:c.profileDigest}]);
   for(const request of [failed.request,r]){const rows=(await f.admin.query('SELECT amount FROM fabric.usage_settlements WHERE reservation_id=$1',[request.original.reservationId])).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].amount),request===r?journal.receipt.measuredUnits:oldJournal.receipt.measuredUnits);}
   const details=await accounted(n,p,a.sessionId);assert.equal(details.accounting.attemptCount,2);assert.equal(details.accounting.retryCount,1);assert.equal(details.accounting.heldReserve,0);assert.equal(details.accounting.measured,oldJournal.receipt.measuredUnits+journal.receipt.measuredUnits);assert.equal(details.accounting.settled,details.accounting.measured);assert.equal(details.accounting.categories['service'],4);assert.equal(details.accounting.categories['model'],oldJournal.receipt.components.model+journal.receipt.components.model);assert.equal(details.view.attribution.category,a.binding.category);assert.equal(details.view.costs.actual,details.accounting.settled);
   const after=await counts();for(const i of [0,1,2])for(const k of ['accept','acceptance'])assert.equal(after[i]![k],before[i]![k]!+(i===2?1:0));
   assert.equal(result<{status:string}>(await op('retryTurn',command)).status,'recorded');assert.deepEqual(await counts(),after);assert.deepEqual((await accounted(n,p,a.sessionId)).accounting,details.accounting);
   console.log(JSON.stringify({measurement:'operator-three-channel-retry',pairOrder:label,target:c.profileId,ownerChannels:3,ordinal:2,operationId:r.original.operationId,onceOnlyAccounting:true,externalQualification:'E01-E05 unqualified'}));
  }
  assert.deepEqual(await f.journal(failed.request.original),oldJournal);await stopOwned(p);
 });
}
