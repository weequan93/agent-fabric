import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest, SessionLoop } from '../../src/native-imports.js';
import { OperatingProfileSchema, LocalQualificationSchema, TaskCapsuleSchema, SourceRecordSchema } from '../../src/schema.js';
import { ProfileRegistry, ProfileNeedSchema, ApprovalRulesSchema, AUTO_CHOICE, OwnerFailureVerifier, assertCachesDisabled, equivalent, type SafeFallbackEvidence } from '../../src/profile.js';
import { sourceRevisionDigestOf, switchCapsule, ScopedPrivateState, descriptorOf, type ContextSourcePort, type SourceDescriptor } from '../../src/context.js';
import { ProposalValidator, type ValidatedProposal } from '../../src/proposal.js';
import { QualificationRegistry, localQualificationPins } from '../../src/qualification.js';
import { encodeLocalRequest, LocalPayloadSchema } from '../../src/test-adapter.js';
import { ModelError } from '../../src/errors.js';
import { createProfileFixture, hash } from '../helpers/profile-fixture.js';
import { qualificationFixture, sha } from '../helpers/contract-fixtures.js';
import type { TaskCapsule, OperatingProfile, EncodedRequest } from '../../src/contracts.js';
import type { JsonValue } from '../../../g1-foundations/src/contracts.js';

const code=(expected:string)=>(error:unknown)=>error instanceof ModelError&&error.code===expected;
test('PROFILE/selection-context',async t=>{
 const f=await createProfileFixture();t.after(()=>f.close());
 const scope=f.fa.issued[1]!,compiler=f.compiler(),now=()=>new Date().toISOString();
 const select=(routing=f.routing(),changes:Partial<Parameters<ProfileRegistry['select']>[0]>={})=>routing.select({need:f.need,pins:f.pins,now:now(),...changes});
 const encode=(capsule:TaskCapsule,profile=f.a,changes:Partial<Parameters<typeof compiler.encode>[1]>={})=>compiler.encode(scope,{capsule,profile,descriptors:f.descriptors,original:f.fa.original(),outputCap:256,durationCapMs:1000,dispatchEpoch:1,response:'text',toolArguments:null,privateState:null,...changes});
 const manual=(text='safe diagnostic',response:'text'|'tool'='text',privateState:string|null=null,changes:Partial<EncodedRequest>={})=>encodeLocalRequest({schemaVersion:1,original:f.fa.original(),profileDigest:f.a.profileDigest,contextDigest:hash('profile-context-private'),
  payload:JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:'local-json-v1',text,response,toolArguments:response==='tool'?{message:'test effect'}:null,privateState})),outputCap:256,durationCapMs:1000,dispatchEpoch:1,...changes});
 await t.test('qualification-is-executed-not-self-declared',async()=>{
  assert.equal(f.qa.executedCases.length,8);assert.equal(f.qa.assurance,'deterministic-local-only');
  assert.ok(f.qa.testedAt<=now()&&now()<f.qa.expiresAt);
  assert.equal(f.qa.dependencyLockDigest,hashBytes(await readFile(resolve(f.fa.root,'g1-model/pnpm-lock.yaml'))));
  assert.equal(f.qa.environmentDigest,(await localQualificationPins(f.fa.root)).environmentDigest);
  assert.equal(f.qa.checkDefinitionDigest,(await localQualificationPins(f.fa.root)).checkDefinitionDigest);
  f.registry.assertCurrent(f.a,f.qa,f.pins,now());
  assert.throws(()=>f.registry.assertCurrent(f.a,qualificationFixture(f.a),f.pins,now()),code('QUALIFICATION_MISMATCH'));
  const recreated=new QualificationRegistry(()=>localQualificationPins(f.fa.root));assert.throws(()=>recreated.assertCurrent(f.a,f.qa,f.pins,now()),code('QUALIFICATION_MISMATCH'));
  const before=await f.fa.counters();
  const untested=f.make({capabilities:{...f.a.capabilities,caching:{...f.a.capabilities.caching,semanticResponse:true}}});
  await assert.rejects(f.registry.probe(untested,f.probePort(f.fa)),code('REQUIRED_CAPABILITY_UNSUPPORTED'));
  assert.deepEqual(await f.fa.counters(),before);
  await assert.rejects(recreated.probe(f.a,{...f.probePort(f.fa),capture:async()=>undefined}),code('QUALIFICATION_MISMATCH'));
  assert.throws(()=>recreated.assertCurrent(f.a,f.qa,f.pins,now()),code('QUALIFICATION_MISMATCH'));
 });
 let capsule:TaskCapsule;
 await t.test('auto-full-profile-current-manifest-actual-capture',async()=>{
  const selected=select();assert.equal(selected.status,'selected');if(selected.status!=='selected')throw new Error('Expected eligible Auto');
  assert.equal(selected.choiceLabel,'Auto - organization approved');assert.equal(selected.profile.profileId,f.a.profileId);assert.equal(selected.fallbackReason,null);assert.equal(selected.dataPolicy,f.a.dataPolicy);assert.equal(selected.estimatedCostClass,'balanced');assert.deepEqual(selected.modality,['text']);
  capsule=await f.compile(compiler);const before=(await f.fa.counters())['acceptance']??0,request=await encode(capsule);
  await f.fa.schedule(request.original,{usage:'manual'});await f.fa.adapterClient().accept(request);
  const capture=await f.fa.journal(request.original);assert.deepEqual(capture.request,request);assert.equal((await f.fa.counters())['acceptance'],before+1);
  const text=JSON.parse(request.payload).text as string,compiled=JSON.parse(text) as {profile:OperatingProfile;capsule:TaskCapsule};
  assert.deepEqual(compiled.profile,f.a);assert.deepEqual(compiled.capsule,capsule);assert.equal(request.contextDigest,hash(capsule.manifest));
  assert.ok(compiled.capsule.manifest.sources.some(r=>r.content.includes('HOSTILE_EVIDENCE_SENTINEL')&&r.trust==='untrusted-observation'&&r.kind==='evidence'));
  assert.deepEqual(compiled.capsule.hypotheses,f.facts.hypotheses);assert.deepEqual(compiled.capsule.uncertainty,f.facts.uncertainty);assert.deepEqual(compiled.capsule.failedPlans,f.facts.failedPlans);assert.deepEqual(compiled.capsule.checks,f.facts.checks);
  assert.equal(compiled.capsule.binding.intent,'Ask');assert.ok(!text.includes(f.fa.tokens[1]!));assert.ok(!text.includes(f.fa.transportToken));
  assert.equal((await f.fa.adapterClient().lookup(request.original)).status,'accepted');await f.fa.finalize(request.original);
 });
 await t.test('exact-qualified-pin-is-captured-not-substituted',async()=>{
  const choice={schemaVersion:1 as const,pin:f.b.profileId,preference:'Fast' as const,allowEquivalentFallback:false};
  const selected=select(f.routing(),{choice});assert.equal(selected.status,'selected');if(selected.status!=='selected')throw new Error('Expected pin');assert.equal(selected.profile.profileId,f.b.profileId);
  const current=await f.compile(compiler,f.originalBinding,f.b),request=await encode(current,f.b);const before=await f.fb.counters();
  await f.fb.schedule(request.original,{usage:'manual'});await f.fb.adapterClient().accept(request);const captured=await f.fb.journal(request.original);assert.deepEqual(captured.request,request);assert.deepEqual(JSON.parse(JSON.parse(request.payload).text).profile,f.b);assert.equal((await f.fb.counters())['acceptance'],before['acceptance']!+1);await f.fb.finalize(request.original);
  const unavailable=f.routing();unavailable.setAvailable(f.b.profileId,false);const result=select(unavailable,{choice});assert.equal(result.status,'waiting');assert.equal(result.choiceLabel,'Qualified profile '+f.b.profileId);
 });
 await t.test('eligibility-precedes-every-installed-preference-with-zero-dispatch',async()=>{
  const counters=await f.fa.counters(),retrievals=f.retrievals(),oldRules=f.rules();
  for(const field of ['providers','routes','regions','dataPolicies','runtimeProfiles']as const){f.setRules(ApprovalRulesSchema.parse({...oldRules,[field]:[]}));for(const preference of ['Fast','Balanced','Thorough']as const){const result=select(f.routing(),{choice:{...AUTO_CHOICE,preference}});assert.equal(result.status,'waiting',field+'/'+preference);}}
  f.setRules(oldRules);
  for(const need of [
   {...f.need,inputModalities:['image']},{...f.need,outputModalities:['audio']},{...f.need,toolDialect:'unsupported'},
   {...f.need,schemaDialect:'unsupported'},{...f.need,optionalFeatures:['unqualified']},{...f.need,contextBytes:f.a.capabilities.contextLimit+1},
   {...f.need,executionClass:'computer'},{...f.need,runtimeCapabilities:['unrestricted-shell']},{...f.need,durationCapMs:30_001}
  ])assert.equal(select(f.routing(),{need:ProfileNeedSchema.parse(need)}).status,'waiting');
  const busy=f.routing();busy.setAvailable(f.a.profileId,false);busy.setAvailable(f.b.profileId,false);assert.equal(select(busy).status,'waiting');
  const unapproved=f.routing();unapproved.setOrganizationApproved(f.a.profileId,false);unapproved.setOrganizationApproved(f.b.profileId,false);assert.equal(select(unapproved).status,'waiting');
  const missing=new ProfileRegistry(f.registry,()=>oldRules,[],{Fast:[],Balanced:[],Thorough:[]});assert.equal(select(missing).status,'waiting');
  const result=select(f.routing(),{now:new Date(Math.max(Date.parse(f.qa.expiresAt),Date.parse(f.qb.expiresAt))).toISOString()});assert.equal(result.status,'waiting');
  assert.deepEqual(await f.fa.counters(),counters);assert.equal(f.retrievals(),retrievals);
  const only=f.routing();only.setAvailable(f.a.profileId,false);const automatic=select(only);assert.equal(automatic.status,'selected');if(automatic.status==='selected')assert.equal(automatic.profile.profileId,f.b.profileId);
 });
 await t.test('qualification-expiry-revocation-and-every-binding-change-refuse',async()=>{
  const q=f.qa;f.registry.assertCurrent(f.a,q,f.pins,new Date(Date.parse(q.expiresAt)-1).toISOString());
  assert.throws(()=>f.registry.assertCurrent(f.a,q,f.pins,q.expiresAt),code('QUALIFICATION_MISMATCH'));
  for(const [key,value]of Object.entries({profileVersion:q.profileVersion+1,profileDigest:sha(11),capabilitiesDigest:sha(12),adapterVersion:'unqualified',deployment:'changed',environmentDigest:sha(13),dependencyLockDigest:sha(14),checkDefinitionDigest:sha(15),probeId:randomUUID(),testedAt:'2020-01-01T00:00:00.000Z',expiresAt:'2030-01-01T00:00:00.000Z',executedCases:['self-declared'],revoked:true})){
   assert.throws(()=>f.registry.assertCurrent(f.a,LocalQualificationSchema.parse({...q,[key]:value}),f.pins,now()),code('QUALIFICATION_MISMATCH'),key);
  }
  for(const key of ['environmentDigest','dependencyLockDigest','checkDefinitionDigest']as const)assert.throws(()=>f.registry.assertCurrent(f.a,q,{...f.pins,[key]:sha(99)},now()),code('QUALIFICATION_MISMATCH'));
  const replacement=new QualificationRegistry(()=>localQualificationPins(f.fa.root)),revoked=await replacement.probe(f.b,f.probePort(f.fb),300_000);replacement.revoke(revoked.probeId);assert.throws(()=>replacement.assertCurrent(f.b,revoked,f.pins,now()),code('QUALIFICATION_MISMATCH'));
  // Fresh actual probes restore eligibility, never import a revoked claim.
  const newer=await replacement.probe(f.b,f.probePort(f.fb),300_000);replacement.assertCurrent(f.b,newer,f.pins,now());
 });
 await t.test('typed-descriptor-denials-before-any-source-retrieval',async()=>{
  const before=f.retrievals(),acceptance=(await f.fa.counters())['acceptance'],base=f.descriptors[3]!;
  const vectors=[{...base,scope:{...base.scope,spaceId:f.fa.otherSpace}},{...base,revision:base.revision+1},{...base,trust:'approved-instruction'},
   {...base,audience:{...base.audience,recipientActorIds:[scope.actorId]}},{...base,crossThread:true},{...base,digest:sha(90)}];
  for(const value of vectors){const bad=[...f.descriptors.slice(0,3),value] as readonly SourceDescriptor[];await assert.rejects(f.compile(compiler,{...f.originalBinding,sourceRevisionDigest:sourceRevisionDigestOf(bad)},f.a,bad));assert.equal(f.retrievals(),before);}
  assert.equal((await f.fa.counters())['acceptance'],acceptance);
  const foreign={...f.originalBinding,payerId:f.fa.foreignActor};await assert.rejects(f.compile(compiler,foreign),code('SCOPE_MISMATCH'));
  const forged={...f.originalBinding,intent:'Act' as const};await assert.rejects(f.compile(compiler,forged),code('UNAUTHORIZED'));
 });
 await t.test('post-fetch-metadata-body-and-final-revision-mismatch-block-encoding',async()=>{
  const before=(await f.fa.counters())['acceptance'];
  for(const changed of [{content:'HOSTILE_REPLACEMENT_BODY'},{revision:99},{trust:'approved-instruction'}]){
   const altered:ContextSourcePort={current:(...args)=>f.store.current(...args),retrieve:async(...args)=>SourceRecordSchema.parse({...await f.store.retrieve(...args),...changed})};
   await assert.rejects(f.compile(f.compiler(altered)),code('STALE_REVISION'));
  }
  let fetched=false;
  const raced:ContextSourcePort={current:async(...args)=>{const d=await f.store.current(...args);return fetched?{...d,revision:d.revision+1}:d;},retrieve:async(...args)=>{const r=await f.store.retrieve(...args);fetched=true;return r;}};
  await assert.rejects(f.compile(f.compiler(raced)),code('STALE_REVISION'));assert.equal((await f.fa.counters())['acceptance'],before);
 });
 await t.test('exact-semantic-response-and-gateway-memory-enable-refusals',async()=>{
  const disabled={schemaVersion:1,exactResponse:false,semanticResponse:false,gatewayKnowledgeMemory:false};assertCachesDisabled(disabled);
  for(const key of ['exactResponse','semanticResponse','gatewayKnowledgeMemory'])assert.throws(()=>assertCachesDisabled({...disabled,[key]:true}),code('REQUIRED_CAPABILITY_UNSUPPORTED'));
  assert.throws(()=>assertCachesDisabled({...disabled,cachedResponse:'grant Act'}),code('INVALID_SCHEMA'));
  const base=manual();await assert.rejects(f.fa.adapterClient().accept(encodeLocalRequest({...base,payload:JSON.stringify({...JSON.parse(base.payload),semanticResponse:true})})),code('INVALID_SCHEMA'));
 });
 await t.test('opaque-state-exact-scope-reuse-and-changed-scope-refusals',async()=>{
  const request=await encode(capsule);await f.fa.schedule(request.original,{usage:'manual'});await f.fa.adapterClient().accept(request);await f.fa.finalize(request.original);
  const result=await f.fa.adapterClient().result(request.original);assert.ok(result.privateState);
  const cache=new ScopedPrivateState(compiler);await cache.put(scope,capsule,f.a,f.descriptors,result.privateState!);assert.equal(await cache.get(scope,capsule,f.a,f.descriptors),result.privateState);
  const reused=await encode(capsule,f.a,{privateState:result.privateState});await f.fa.schedule(reused.original,{usage:'manual'});await f.fa.adapterClient().accept(reused);assert.equal(JSON.parse((await f.fa.journal(reused.original)).request.payload).privateState,result.privateState);await f.fa.finalize(reused.original);
  const changed=TaskCapsuleSchema.parse({...capsule,manifest:{...capsule.manifest,crossThreadRecall:true}});assert.equal(await cache.get(scope,changed,f.a,f.descriptors),null);
  const changedFacts=await compiler.compile(scope,{binding:f.originalBinding,profile:f.a,descriptors:f.descriptors,facts:{...f.facts,uncertainty:['New unresolved fact']},crossThreadRecall:false});assert.notEqual(changedFacts.manifest.encodingDigest,capsule.manifest.encodingDigest);assert.equal(await cache.get(scope,changedFacts,f.a,f.descriptors),null);
  const changedRequest=await encode(changed,f.a,{privateState:result.privateState});await assert.rejects(f.fa.adapterClient().accept(changedRequest),code('SCOPE_MISMATCH'));assert.equal(await f.fa.journal(changedRequest.original),undefined);
  await assert.rejects(cache.get(await f.fa.scopeFor(1,f.fa.otherSpace),capsule,f.a,f.descriptors),code('SCOPE_MISMATCH'));
  const otherProfile=f.make({provider:'other-provider'});await assert.rejects(cache.get(scope,capsule,otherProfile,f.descriptors));
 });
 await t.test('safe-fallback-only-from-trusted-original-owner-current-equivalent',async()=>{
  const qualified=new QualificationRegistry(()=>localQualificationPins(f.fa.root)),q=await qualified.probe(f.b,f.probePort(f.fb),300_000);
  const inventory=[{profile:f.a,qualification:f.qa,organizationApproved:true,available:true},{profile:f.b,qualification:q,organizationApproved:true,available:true}];
  // A's qualification must also be owned by this registry, so probe it rather
  // than treating a copied JSON record from the earlier registry as authority.
  inventory[0]!.qualification=await qualified.probe(f.a,f.probePort(f.fa),300_000);
  let permission=true;const routing=new ProfileRegistry(qualified,()=>f.rules(),inventory,{Fast:[f.a.profileId],Balanced:[f.a.profileId],Thorough:[f.a.profileId]},[[f.a.profileId,f.b.profileId]],()=>permission);
  const verifier=new OwnerFailureVerifier(f.fa.adapterClient(),f.fa.ownerId,f.a.profileDigest),original=f.fa.original();
  await assert.rejects(verifier.resolve(original),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  await f.fa.adapterClient().sealUnaccepted(original,2);const evidence=await verifier.resolve(original),choice={...AUTO_CHOICE,pin:f.b.profileId,allowEquivalentFallback:true};
  const fallback=(e=evidence)=>routing.selectEquivalent({previous:f.a,evidence:e,need:f.need,pins:f.pins,now:now(),choice});
  const selected=fallback();assert.equal(selected.status,'selected');if(selected.status!=='selected')throw new Error('Expected equivalent');assert.equal(selected.profile.profileId,f.b.profileId);assert.ok(selected.fallbackReason);
  assert.equal(routing.selectEquivalent({previous:f.a,evidence,need:f.need,pins:f.pins,now:now(),choice:{...choice,pin:f.a.profileId}}).status,'waiting','An available selected A cannot be replaced by approved B');
  assert.throws(()=>fallback({} as SafeFallbackEvidence),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  assert.throws(()=>routing.selectEquivalent({previous:f.a,evidence,need:f.need,pins:f.pins,now:now(),choice:{...choice,allowEquivalentFallback:false}}),code('UNAUTHORIZED'));
  permission=false;assert.equal(fallback().status,'waiting');permission=true;
  routing.setAvailable(f.b.profileId,false);assert.equal(fallback().status,'waiting');routing.setAvailable(f.b.profileId,true);
  const old=f.rules();f.setRules(ApprovalRulesSchema.parse({...old,routes:[f.a.route]}));assert.equal(fallback().status,'waiting');f.setRules(old);
  for(const profile of [f.make({region:'changed-region'}),f.make({modelVersion:'changed-model'}),f.make({instructionPackDigest:sha(72)}),f.make({dataPolicy:'changed-policy'})])assert.equal(equivalent(f.a,profile),false);
  const pending=manual();await f.fa.schedule(pending.original,{usage:'manual'});await f.fa.adapterClient().accept(pending);await assert.rejects(verifier.resolve(pending.original),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));await f.fa.finalize(pending.original);await assert.rejects(verifier.resolve(pending.original),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  const failed=manual();await f.fa.schedule(failed.original,{usage:'manual',outcome:'known-failure'});await f.fa.adapterClient().accept(failed);await f.fa.finalize(failed.original);const known=await verifier.resolve(failed.original);assert.equal(fallback(known).status,'selected');
 });
 await t.test('complete-proposals-only-through-current-native-test-effect',async()=>{
  const ids=await f.createTask('Act'),binding=f.binding('Act',ids),act=await f.compile(compiler,binding),run=f.state(binding).run;
  let effects=0;
  const loop=new SessionLoop(run,{clock:{now:()=>Date.now()},authorize:(_run,effect)=>{if(effect==='write')assert.equal(binding.intent,'Act');},model:async()=>{throw new Error('Proposal diagnostic never plans model turns');},execute:async()=>{effects++;return 'committed';}});
  const validator=new ProposalValidator(f.fa.adapterClient(),compiler,{handoff:async(current,input)=>{assert.equal(current,scope);assert.equal(input.target,'local-test-effect');await compiler.assertCurrent(scope,input.capsule,f.a,f.descriptors);await loop.dispatchEffect(input.operationId);}});
  const request=await encode(act,f.a,{response:'tool',toolArguments:{message:'validated effect'}});await f.fa.schedule(request.original,{usage:'manual'});await f.fa.adapterClient().accept(request);await f.fa.finalize(request.original);
  const frames=[];for await(const frame of f.fa.adapterClient().stream(request.original)){frames.push(frame);assert.equal(effects,0);}
  const input={request,capsule:act,profile:f.a,descriptors:f.descriptors};
  const iterable=(values:unknown[])=>({async *[Symbol.asyncIterator](){for(const value of values){assert.equal(effects,0);yield value;}}});
  for(const bad of [frames.slice(0,-1),[{...frames[0],sequence:2}],frames.map((r,i)=>({...r,final:i===0})),[{...frames[0],kind:'text',final:true}],
   [{...frames[0],fragment:'{',final:true}],[{...frames[0],fragment:'{}',final:true}],[{...frames[0],fragment:'{"message":"x","grant":"Act"}',final:true}],
   [{...frames[0],fragment:'{"message":"forged complete"}',final:true}]]){
   await assert.rejects(validator.collect(scope,input,iterable(bad)));assert.equal(effects,0);
  }
  const proposal=await validator.collect(scope,input);assert.equal(effects,0);await assert.rejects(validator.handoff(scope,proposal,'shell'),code('REQUIRED_CAPABILITY_UNSUPPORTED'));assert.equal(effects,0);
  await assert.rejects(validator.collect(scope,input),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(validator.collect(scope,{...input,capsule}),code('CHECK_BINDING_MISMATCH'));
  await assert.rejects(validator.handoff(scope,{} as ValidatedProposal,'local-test-effect'),code('CHECK_BINDING_MISMATCH'));
  const askRequest=await encode(capsule,f.a,{response:'tool',toolArguments:{message:'Ask cannot Act'}});await f.fa.schedule(askRequest.original,{usage:'manual'});await f.fa.adapterClient().accept(askRequest);await f.fa.finalize(askRequest.original);
  const ask=await validator.collect(scope,{...input,request:askRequest,capsule});await assert.rejects(validator.handoff(scope,ask,'local-test-effect'),code('INTENT_EXCEEDED'));assert.equal(effects,0);
  const concurrent=await Promise.allSettled(Array.from({length:8},()=>validator.handoff(scope,proposal,'local-test-effect')));assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(effects,1);await assert.rejects(validator.handoff(scope,proposal,'local-test-effect'),code('CHECK_BINDING_MISMATCH'));assert.equal(effects,1);
  assert.equal(loop.events().filter(e=>e.kind==='effect-pending').length,1);assert.equal(loop.inspect().pendingOperations.length,0);
 });
 await t.test('switch-preserves-facts-and-exposes-loss-and-revalidation-estimate',async()=>{
  let state=f.state(),validated=0;
  const boundary={loadCurrent:async()=>structuredClone(state),validateChange:async(_old:TaskCapsule,next:typeof f.originalBinding,from:OperatingProfile,to:OperatingProfile)=>{validated++;assert.equal(next.intent,'Ask');assert.equal(from.profileDigest,f.a.profileDigest);assert.equal(to.profileDigest,f.b.profileDigest);assert.equal(equivalent(from,to),true);}};
  const input={scope,compiler,boundary,previous:capsule,from:f.a,to:f.b,binding:f.originalBinding,descriptors:f.descriptors};
  const switched=await switchCapsule(input);assert.equal(switched.cache,'lost/not-used');assert.ok(switched.revalidationEstimate>2);assert.equal(validated,2);
  const {manifest:_old,...oldFacts}=capsule,{manifest:_current,...newFacts}=switched.capsule;assert.deepEqual(newFacts,oldFacts);assert.equal(switched.capsule.manifest.profileDigest,f.b.profileDigest);
  const request=await encode(switched.capsule,f.b),before=await f.fb.counters();assert.equal(JSON.parse(request.payload).privateState,null);await f.fb.schedule(request.original,{usage:'manual'});await f.fb.adapterClient().accept(request);assert.equal((await f.fb.counters())['acceptance'],before['acceptance']!+1);assert.equal((await f.fb.journal(request.original)).request.profileDigest,f.b.profileDigest);await f.fb.finalize(request.original);
  for(const pending of [{pendingModel:{operationId:randomUUID(),reservationId:randomUUID()}},{pendingOperations:[randomUUID()]}]){state={...f.state(),...pending};await assert.rejects(switchCapsule(input),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));}
  state=f.state();await assert.rejects(switchCapsule({...input,binding:{...f.originalBinding,intent:'Act'}}),code('CHECK_BINDING_MISMATCH'));
  await assert.rejects(switchCapsule({...input,binding:{...f.originalBinding,versions:{...f.pins,engineDigest:sha(80)}},boundary:{...boundary,validateChange:async()=>{throw new ModelError('CHECK_BINDING_MISMATCH');}}}),code('CHECK_BINDING_MISMATCH'));
  const incomplete={...capsule};Reflect.deleteProperty(incomplete,'uncertainty');await assert.rejects(switchCapsule({...input,previous:incomplete}),code('INVALID_SCHEMA'));
  let loads=0;await assert.rejects(switchCapsule({...input,boundary:{...boundary,loadCurrent:async()=>{loads++;return {...f.state(),run:{...f.state().run,generation:loads-1}};}}}),code('STALE_FENCE'));
 });
 await t.test('source-revision-and-membership-revocation-invalidate-final-context',async()=>{
  const acceptance=(await f.fa.counters())['acceptance'],retrievals=f.retrievals();
  const changed=Object.fromEntries(f.records.map(r=>{const record=SourceRecordSchema.parse({...r,revision:3});return [r.sourceId,{record,descriptor:descriptorOf(record,f.sourceTask.taskId)}];}));
  await f.taskRepo.revise(scope,f.sourceTask.taskId,2,JSON.parse(JSON.stringify({contextSources:changed})) as JsonValue);
  await assert.rejects(encode(capsule),code('STALE_REVISION'));assert.equal(f.retrievals(),retrievals);assert.equal((await f.fa.counters())['acceptance'],acceptance);
  await f.fa.admin.query('UPDATE fabric.memberships SET revoked_at=now(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[scope.tenantId,scope.spaceId,scope.actorId]);
  await assert.rejects(compiler.assertCurrent(scope,capsule,f.a,f.descriptors));await assert.rejects(f.fa.scopeFor());
  assert.equal((await f.fa.counters())['acceptance'],acceptance);
 });
});
import { createHash } from 'node:crypto';
const hashBytes=(bytes:Buffer)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
