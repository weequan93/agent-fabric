import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { completedTurn } from './operator-journey.js';
import { operatorCommand } from '../../src/operator.js';
import type { operatorInspect } from '../../src/operator-view.js';
import { AUTO_CHOICE,ProfileNeedSchema,equivalent } from '../../src/profile.js';
import { OperatingProfileSchema,profileDigestOf } from '../../src/schema.js';
import type { NativeSession } from '../../src/native-session.js';
import { capsuleFactsOf } from '../../src/context.js';
import { hash } from '../../src/model-repository.js';
import { createNativeFixture } from './native-fixture.js';
import { captured,requestsFor,proveReceipt } from './profile-context-journey.js';
import { operatorChannelJourney,operatorMultiTargetRetryJourney } from './operator-channel-journey.js';
import { operatorPreflightJourney } from './operator-preflight-journey.js';

type NativeView=Awaited<ReturnType<NativeSession['inspect']>>;
type OperatorView=Awaited<ReturnType<typeof operatorInspect>>;
function result<T>(r:Record<string,unknown>):T{
 assert.equal(r['error'],undefined,JSON.stringify(r));assert.ok(Object.hasOwn(r,'result'));
 return r['result'] as T;
}
function redacted(value:unknown){
 const text=JSON.stringify(value);
 for(const marker of ['NATIVE_SOURCE_PRIVATE_MARKER','transportToken','controllerDsn','authorityDsn','privateState','Bearer '])assert.equal(text.includes(marker),false,marker);
}

/** J02 uses the documented bounded operator entry point and independently
 * authenticated service process. Profiles are actually probed, not imported
 * qualification JSON; denied steps never enter the adapter. */
export async function operatorProfileJourney(t:TestContext){
 const n=await createNativeFixture(),f=n.f;t.after(n.close);
 const raw={...n.profile,profileId:randomUUID(),deployment:'journey-unavailable-equivalent'};
 const pin=OperatingProfileSchema.parse({...raw,profileDigest:profileDigestOf(raw)});
 const invalidRaw={...n.profile,profileId:randomUUID(),deployment:'journey-disallowed-alternative',region:'synthetic-unapproved-region'};
 const ineligible=OperatingProfileSchema.parse({...invalidRaw,profileDigest:profileDigestOf(invalidRaw)});
 const availableRaw={...n.profile,profileId:randomUUID(),deployment:'journey-available-second-deployment-for-cost-preview'};
 const available=OperatingProfileSchema.parse({...availableRaw,profileDigest:profileDigestOf(availableRaw)});
 const thirdRaw={...n.profile,profileId:randomUUID(),deployment:'journey-available-third-retry-target'};
 const third=OperatingProfileSchema.parse({...thirdRaw,profileDigest:profileDigestOf(thirdRaw)});
 assert.equal(equivalent(pin,n.profile),true);assert.equal(equivalent(ineligible,n.profile),false);
 await n.installAdditionalProfiles([pin,ineligible,available,third],[available.profileId,third.profileId]);
 n.approveEquivalentRetries([[n.profile.profileId,available.profileId]]);
 // Fixture owner installs synthetic organization digest authority before task
 // admission. Ordinary commands have no policy/profile installation endpoint.
 await f.admin.query('UPDATE fabric.model_policies SET profile_digests=$3::jsonb WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space,JSON.stringify([n.profile.profileDigest,pin.profileDigest,ineligible.profileDigest,available.profileDigest,third.profileDigest])]);
 const a=await n.task(),image=await n.task({need:ProfileNeedSchema.parse({...n.need,inputModalities:['image']})});
 const channelTasks={pin:await n.task(),switch:await n.task(),retry:await n.task(),deniedPolicy:await n.task()};
 const multiTasks=await Promise.all(Array.from({length:3},()=>n.task()));
 const p=await n.process(),port=(kind:string,input:unknown)=>n.call(p,kind,input);
 const command=(kind:string,input:unknown)=>operatorCommand(port,kind,input);
 assert.equal(result<{qualified:boolean}>(await command('qualify',{})).qualified,true);
 await operatorPreflightJourney(t,n,command,a,image,{available,unavailable:pin,ineligible});
 const baseline=await f.counters();
 const first=await completedTurn(n,p,{...await n.command(a.sessionId),input:'save local work before pin',choice:null});
 assert.equal(first.status,'completed');assert.equal(first.view.modelResultCount,1);
 const originalRequests=await requestsFor(n,a.binding.runId);assert.equal(originalRequests.length,1);
 const old=captured(originalRequests[0]!).capsule,receipt=await proveReceipt(n,originalRequests[0]!);
 const saved=await n.native.repository.snapshot(a.scope,a.sessionId),afterFirst=await f.counters();
 for(const k of ['accept','acceptance'])assert.equal(afterFirst[k]??0,(baseline[k]??0)+1);
 const deniedChoice={...AUTO_CHOICE,pin:pin.profileId,allowEquivalentFallback:false};
 const wait=result<{status:string;view:NativeView}>(await command('requestTurn',{...await n.command(a.sessionId),input:'unavailable pin refuses',choice:deniedChoice}));
 assert.equal(wait.status,'waiting');assert.equal(wait.view.wait?.reason,'model-unavailable');assert.equal(wait.view.wait?.resolver,'native-controller');
 assert.deepEqual(wait.view.wait?.allowedNextActions,['switch-profile','contact-administrator','stop']);
 assert.equal(wait.view.choiceLabel,'Qualified profile '+pin.profileId);assert.equal(wait.view.modelResultCount,1);assert.equal(wait.view.lastResultDigest,first.view.lastResultDigest);
 assert.deepEqual(wait.view.costs,first.view.costs);assert.equal(wait.view.pendingModel,null);
 const waiting=await n.native.repository.snapshot(a.scope,a.sessionId);
 assert.deepEqual(waiting.events.slice(0,saved.events.length),saved.events);assert.equal(wait.view.wait?.preservedWorkDigest,hash(waiting.events.slice(0,-1)));
 const shown=result<OperatorView>(await command('operatorInspect',{sessionId:a.sessionId}));
 assert.equal(shown.selection.status,'waiting');if(shown.selection.status==='waiting')assert.equal(shown.selection.refusal,'MODEL_UNAVAILABLE');
 assert.equal(shown.nextAction,'Choose a currently permitted qualified profile');assert.equal(shown.accounting.attemptCount,1);assert.equal(shown.accounting.retryCount,0);
 assert.equal(shown.accounting.heldReserve,0);assert.equal(shown.accounting.settled,receipt.receipt.measuredUnits);assert.equal(shown.accounting.measured,receipt.receipt.measuredUnits);
 assert.ok(shown.accounting.estimate>=shown.accounting.settled);assert.equal(shown.accounting.categories['service'],2);assert.equal(shown.accounting.categories['model'],receipt.receipt.components.model);
 assert.equal(shown.view.attribution.payerId,a.binding.payerId);assert.equal(shown.assurance,'deterministic-local-only');assert.equal(shown.realBilling,'unqualified');redacted(shown);
 assert.deepEqual(await f.counters(),afterFirst);

 await t.test('no-permission-and-ineligible-current-switches-preserve-every-owner',async()=>{
  for(const choice of [deniedChoice,{...AUTO_CHOICE,pin:ineligible.profileId,allowEquivalentFallback:true}]){
   const frozen=await n.snapshot(),counts=await f.counters();
   const refused=await command('switchProfile',{...await n.command(a.sessionId),choice});assert.equal(refused['error'],'MODEL_UNAVAILABLE');redacted(refused);
   assert.deepEqual(await n.snapshot(),frozen);assert.deepEqual(await f.counters(),counts);
  }
  const reader=await n.process(2),frozen=await n.snapshot(),counts=await f.counters();
  const refused=await operatorCommand((kind,input)=>n.call(reader,kind,input),'switchProfile',{...await n.command(a.sessionId),choice:{...deniedChoice,allowEquivalentFallback:true}});
  assert.equal(refused['error'],'UNAUTHORIZED');redacted(refused);assert.deepEqual(await n.snapshot(),frozen);assert.deepEqual(await f.counters(),counts);
 });

 await t.test('unsupported-image-is-readable-and-permission-cannot-hide-missing-capability',async()=>{
  const counts=await f.counters();
  const denied=result<{status:string;view:NativeView}>(await command('requestTurn',{...await n.command(image.sessionId),input:'image need is unsupported',choice:{...deniedChoice,allowEquivalentFallback:true}}));
  assert.equal(denied.status,'waiting');assert.equal(denied.view.wait?.reason,'model-unavailable');assert.equal(denied.view.pendingModel,null);assert.equal(denied.view.modelResultCount,0);
  const imageView=result<OperatorView>(await command('operatorInspect',{sessionId:image.sessionId}));
  assert.equal(imageView.selection.status,'waiting');if(imageView.selection.status==='waiting')assert.equal(imageView.selection.refusal,'REQUIRED_CAPABILITY_UNSUPPORTED');
  assert.equal(imageView.nextAction,'Choose a currently permitted qualified profile');assert.deepEqual(imageView.accounting,{attemptCount:0,retryCount:0,estimate:0,measured:0,settled:0,heldReserve:0,categories:{}});redacted(imageView);
  const frozen=await n.snapshot();assert.equal((await command('switchProfile',{...await n.command(image.sessionId),choice:{...AUTO_CHOICE,pin:n.profile.profileId,allowEquivalentFallback:true}}))['error'],'MODEL_UNAVAILABLE');
  assert.deepEqual(await n.snapshot(),frozen);assert.deepEqual(await f.counters(),counts);assert.equal((await requestsFor(n,image.binding.runId)).length,0);
 });

 await t.test('explicit-permitted-switch-revalidates-preserved-capsule-and-next-real-call',async()=>{
  const counts=await f.counters(),prior=await n.native.repository.snapshot(a.scope,a.sessionId);
  const switched=result<{cache:string;autoDispatched:boolean;revalidationEstimate:number;view:NativeView}>(await command('switchProfile',{...await n.command(a.sessionId),choice:{...deniedChoice,allowEquivalentFallback:true}}));
  assert.equal(switched.cache,'lost/not-used');assert.equal(switched.autoDispatched,false);assert.ok(switched.revalidationEstimate>2);
  assert.equal(switched.view.lastResultDigest,first.view.lastResultDigest);assert.equal(switched.view.modelResultCount,1);assert.deepEqual(switched.view.costs,first.view.costs);
  assert.deepEqual((await n.native.repository.snapshot(a.scope,a.sessionId)).events,prior.events);
  const selection=result<OperatorView>(await command('operatorInspect',{sessionId:a.sessionId}));assert.equal(selection.selection.status,'selected');
  if(selection.selection.status==='selected'){assert.equal(selection.selection.profileId,n.profile.profileId);assert.equal(selection.selection.fallbackReason,'Unavailable pin; explicitly permitted approved equivalent');}
  assert.deepEqual(selection.accounting,shown.accounting);redacted(selection);assert.deepEqual(await f.counters(),counts);
  const resumed=result<{autoDispatched:boolean;view:NativeView}>(await command('resume',{...await n.command(a.sessionId),inputLimitBytes:64}));
  assert.equal(resumed.autoDispatched,false);assert.equal(resumed.view.wait,null);assert.deepEqual(await f.counters(),counts);
  const next=await completedTurn(n,p,{...await n.command(a.sessionId),input:'continue preserved local work',choice:null});
  assert.equal(next.status,'completed');assert.equal(next.view.modelResultCount,2);assert.equal(next.view.model?.profileId,n.profile.profileId);assert.equal(next.view.model?.fallbackReason,'Unavailable pin; explicitly permitted approved equivalent');
  const requests=await requestsFor(n,a.binding.runId);assert.equal(requests.length,2);const compiled=captured(requests[1]!);
  assert.deepEqual(compiled.profile,n.profile);assert.deepEqual(compiled.capsule.binding,old.binding);assert.deepEqual(compiled.capsule.manifest.sources,old.manifest.sources);
  assert.deepEqual(capsuleFactsOf(compiled.capsule),{...capsuleFactsOf(old),requirements:[...old.requirements,'continue preserved local work']});assert.equal(compiled.payload.privateState,null);
  const settled=await proveReceipt(n,requests[1]!),final=result<OperatorView>(await command('operatorInspect',{sessionId:a.sessionId}));
  assert.equal(final.accounting.attemptCount,2);assert.equal(final.accounting.retryCount,0);assert.equal(final.accounting.heldReserve,0);assert.equal(final.accounting.measured,receipt.receipt.measuredUnits+settled.receipt.measuredUnits);assert.equal(final.accounting.settled,final.accounting.measured);
  assert.ok(final.accounting.estimate>=final.accounting.settled);assert.equal(final.accounting.categories['service'],4);assert.equal(final.accounting.categories['model'],receipt.receipt.components.model+settled.receipt.components.model);
  assert.equal(next.view.costs.actual,final.accounting.settled);assert.equal(final.view.attribution.category,a.binding.category);redacted(final);
  for(const k of ['accept','acceptance'])assert.equal((await f.counters())[k]??0,(counts[k]??0)+1);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,0);
  console.log(JSON.stringify({measurement:'operator-journey-J02',carrier:'authenticated-native-service-port',actualProfile:final.view.model,accounting:final.accounting,deniedDispatches:0,preservedWork:true,cache:'lost/not-used',revalidationEstimate:switched.revalidationEstimate,realProvider:'unqualified',supplierQuality:'unqualified'}));
 });
 await operatorChannelJourney(t,n,p,channelTasks,available);
 await operatorMultiTargetRetryJourney(t,n,multiTasks,available,third);
}
