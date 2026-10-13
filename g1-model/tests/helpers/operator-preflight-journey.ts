import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { OperatingProfile } from '../../src/contracts.js';
import { AUTO_CHOICE } from '../../src/profile.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { LocalPayloadSchema } from '../../src/test-adapter.js';
import { result,redacted,type NativeFixture,type OperatorPreflight } from './operator-journey.js';

/** Actual authenticated IPC/PG preview of a proposed choice on a saved Auto
 * session. Qualification happens before the preview census, never in preview. */
export async function operatorPreflightJourney(t:TestContext,n:NativeFixture,
 command:(kind:string,input:unknown)=>Promise<Record<string,unknown>>,
 a:Awaited<ReturnType<NativeFixture['task']>>,image:Awaited<ReturnType<NativeFixture['task']>>,
 profiles:{available:OperatingProfile;unavailable:OperatingProfile;ineligible:OperatingProfile}){
 const input='preview proposed profile';
 const saved=await n.native.repository.snapshot(a.scope,a.sessionId);
 const encoded=await n.native.ports.encode(a.scope,saved,n.profile,input,n.f.original());
 const payload=LocalPayloadSchema.parse(JSON.parse(encoded.payload));
 const text=JSON.parse(payload.text);
 // Independent size oracle: the full proposed profile replaces the default
 // inside the actual compiled capsule. Profile/encoding digests have fixed
 // widths, so their values cannot change the conservative byte estimate.
 function estimateFor(p:OperatingProfile){return reserveEstimate(JSON.stringify({...payload,text:JSON.stringify({...text,profile:p,capsule:{...text.capsule,manifest:{...text.capsule.manifest,profileDigest:p.profileDigest}}})}),encoded.outputCap);}
 async function preview(sessionId:string,choice:OperatorPreflight['proposed']['choice']){
  const frozen=await n.snapshot(),counts=await n.f.counters();
  const pre=result<OperatorPreflight>(await command('operatorPreflight',{sessionId,input,choice}));
  assert.deepEqual(await n.snapshot(),frozen,'Preview changed durable acceptance/ledger/native state');
  assert.deepEqual(await n.f.counters(),counts,'Preview invoked the adapter');
  assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});redacted(pre);
  return pre;
 }
 function selected(pre:OperatorPreflight,p:OperatingProfile,pin:string|null,fallback:string|null){
  assert.equal(pre.dispatchAllowed,true);assert.equal(pre.proposed.choice.pin,pin);
  const s=pre.proposed.selection;assert.equal(s.status,'selected');if(s.status!=='selected')throw new Error('Proposed selection missing');
  assert.equal(s.profileId,p.profileId);assert.equal(s.profileDigest,p.profileDigest);
  assert.equal(s.choiceLabel,pin===null?'Auto - organization approved':'Qualified profile '+pin);
  assert.equal(s.model,p.model);assert.equal(s.modelVersion,p.modelVersion);assert.equal(s.deployment,p.deployment);
  assert.equal(s.provider,p.provider);assert.equal(s.route,p.route);assert.equal(s.region,p.region);
  assert.deepEqual(s.modality,p.capabilities.inputModalities);assert.equal(s.dataPolicy,p.dataPolicy);
  assert.equal(s.estimatedCostClass,p.costAssumptions.estimatedCostClass);assert.equal(s.fallbackReason,fallback);
  assert.equal(pre.estimateBasis?.profileDigest,s.profileDigest);assert.equal(pre.estimateBasis?.pricingVersion,p.costAssumptions.pricingVersion);
  assert.equal(pre.plannedEstimate,estimateFor(p));assert.equal(pre.plannedEstimate,pre.estimateBasis!.encodedBytes+pre.estimateBasis!.outputCap+pre.estimateBasis!.serviceUnits);
  assert.equal(pre.historical.view.choiceLabel,'Auto - organization approved');assert.equal(pre.historical.view.model?.profileId,n.profile.profileId);
  assert.equal(pre.historical.view.wait,null);assert.equal(pre.historical.accounting.attemptCount,0);
  assert.match(pre.proposed.nextAction,/Preview only; submit an explicit current command/);
 }
 function refused(pre:OperatorPreflight,p:OperatingProfile,refusal:string){
  assert.equal(pre.dispatchAllowed,false);assert.equal(pre.plannedEstimate,null);assert.equal(pre.estimateBasis,null);
  assert.equal(pre.proposed.choice.pin,p.profileId);const s=pre.proposed.selection;
  assert.equal(s.status,'waiting');if(s.status!=='waiting')throw new Error('Proposed refusal missing');
  assert.equal(s.choiceLabel,'Qualified profile '+p.profileId);assert.equal(s.reason,'model-unavailable');assert.equal(s.refusal,refusal);
  assert.deepEqual(s.allowedNextActions,['switch-profile','contact-administrator']);
  assert.match(pre.proposed.nextAction,/Waiting: model unavailable/);assert.ok(pre.proposed.nextAction.includes(refusal));
 }
 await t.test('preflight-available-pin-identifies-the-profile-actually-estimated',async()=>{
  const choice={...AUTO_CHOICE,pin:profiles.available.profileId};const pre=await preview(a.sessionId,choice);
  selected(pre,profiles.available,choice.pin,null);
  assert.notEqual(pre.plannedEstimate,estimateFor(n.profile),'Different deployment has a different encoded cost');
 });
 await t.test('preflight-unavailable-pin-has-readable-refusal-not-saved-Auto-selection',async()=>{
  const pre=await preview(a.sessionId,{...AUTO_CHOICE,pin:profiles.unavailable.profileId});refused(pre,profiles.unavailable,'MODEL_UNAVAILABLE');
  assert.equal(pre.historical.selection.status,'selected');assert.equal(pre.historical.view.wait,null);
 });
 await t.test('preflight-ineligible-pin-cannot-use-equivalent-fallback',async()=>{
  refused(await preview(a.sessionId,{...AUTO_CHOICE,pin:profiles.ineligible.profileId,allowEquivalentFallback:true}),profiles.ineligible,'UNAUTHORIZED');
 });
 await t.test('preflight-permitted-equivalent-shows-proposed-pin-and-actual-fallback',async()=>{
  selected(await preview(a.sessionId,{...AUTO_CHOICE,pin:profiles.unavailable.profileId,allowEquivalentFallback:true}),n.profile,profiles.unavailable.profileId,'Unavailable pin; explicitly permitted approved equivalent');
 });
 await t.test('preflight-unsupported-capability-refuses-and-null-uses-saved-choice',async()=>{
  refused(await preview(image.sessionId,{...AUTO_CHOICE,pin:n.profile.profileId,allowEquivalentFallback:true}),n.profile,'REQUIRED_CAPABILITY_UNSUPPORTED');
  const counts=await n.f.counters(),frozen=await n.snapshot();
  const pre=result<OperatorPreflight>(await command('operatorPreflight',{sessionId:a.sessionId,input,choice:null}));
  selected(pre,n.profile,null,null);assert.deepEqual(await n.f.counters(),counts);assert.deepEqual(await n.snapshot(),frozen);
 });
 assert.deepEqual(await n.native.repository.snapshot(a.scope,a.sessionId),saved);
 console.log(JSON.stringify({measurement:'operator-preflight-PROD-F04-001',carrier:'authenticated-native-service-port',proposedProfile:profiles.available.profileId,savedProfile:n.profile.profileId,variants:5,previewAcceptances:0,previewLedgerMutations:0,realProvider:'unqualified'}));
}
