import test from 'node:test';
test('SEC-G0-002 omitted destination cannot disclose private sources into a group envelope',()=>{
 const f=setup();
 assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect:'read',source:source(),explicitTrigger:true}),{code:'UNAUTHORIZED'});
 assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});
});
test('revoked policy revision cannot be reused to resurrect a cached admission',()=>{
 const f=setup();const old=f.authority.authorize({actor:alice,envelope:envelope(),effect:'write'});
 f.authority.revoke(personal,alice.actorId);assert.throws(()=>f.authority.assertCurrent(old),{code:'UNAUTHORIZED'});
 assert.throws(()=>f.authority.register(row(personal,{revision:1})),{code:'STALE_REVISION'});
 f.authority.register(row(personal,{revision:8}));assert.throws(()=>f.authority.assertCurrent(old),{code:'UNAUTHORIZED'});
 f.act({actor:alice,envelope:envelope(),effect:'write'});assert.equal(f.counters().dispatches,1);
});
test('structured sharing keys prevent delimiter collision grants',()=>{
 const first={tenantId:'tenant-a',spaceId:'x:tenant-a/y'},second={tenantId:'tenant-a',spaceId:'y'};
 const firstSource='s',secondSource='s:tenant-a/x';
 assert.equal(firstSource+':'+first.tenantId+'/'+first.spaceId,secondSource+':'+second.tenantId+'/'+second.spaceId);
 assert.notEqual(sharingGrantKey(firstSource,first),sharingGrantKey(secondSource,second));
 const f=setup();f.spaces.register({scope:first,kind:'group',ownerActorId:alice.actorId,payerId:'payer-group',audience:[alice.actorId],membershipRevision:4,dataNamespace:'collision-data',computeNamespace:'collision-compute',computerAssignment:null});
 const wrongGrant=sharingGrantKey(secondSource,second),correctGrant=sharingGrantKey(firstSource,first);
 f.authority.register(row(personal,{revision:8,readableSources:[firstSource,secondSource],shareableDestinations:[wrongGrant]}));
 f.authority.register(row(first,{readableSources:[firstSource],shareableDestinations:[wrongGrant]}));
 const inputSource={...source(),sourceId:firstSource},input={...envelope(first),sources:[inputSource],groupTrigger:true};
 const request:AuthorityRequest={actor:alice,envelope:input,effect:'read',source:inputSource,destination:first,explicitTrigger:true};
 assert.throws(()=>f.act(request),{code:'UNAUTHORIZED'});assert.equal(f.counters().retrievals,0);
 f.authority.register(row(personal,{revision:9,readableSources:[firstSource],shareableDestinations:[correctGrant]}));
 f.authority.register(row(first,{revision:8,readableSources:[firstSource],shareableDestinations:[correctGrant]}));
 f.act(request);assert.equal(f.counters().retrievals,1);
});
test('sharing destination stays bound to envelope and its mutation capability',()=>{
 const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));
 f.authority.register(row(group,{revision:8,shareableDestinations:[sharing],role:['read']}));
 assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'write',source:source(),destination:group}),{code:'SCOPE_MISMATCH'});
 const request:AuthorityRequest={actor:alice,envelope:envelope(group),effect:'write',source:source(),destination:group,explicitTrigger:true};
 assert.throws(()=>f.act(request),{code:'UNAUTHORIZED'});assert.equal(f.counters().dispatches,0);
 f.authority.register(row(group,{revision:9,shareableDestinations:[sharing]}));f.act(request);assert.equal(f.counters().dispatches,1);
});

import assert from 'node:assert/strict';
import { SpacesRepository } from '../../services/spaces/src/bindings.js';
import { ActorDirectory } from '../../security/identity/src/actor.js';
import { AuthorityService, sharingGrantKey } from '../../security/policy/src/effective-authority.js';
import type { AuthorityRecord, AuthorityRequest } from '../../security/policy/src/effective-authority.js';
import type { EffectClass, TaskEnvelope, SourceRef } from '../../engine/contracts/src/task-envelope.js';
import type { ScopeRef } from '../../engine/contracts/src/identity.js';
import { DeterministicClock } from '../helpers/fixture.js';
const personal={tenantId:'tenant-a',spaceId:'space-private'};const group={tenantId:'tenant-a',spaceId:'space-group'};
const alice={actorId:'actor-alice',tenantId:'tenant-a'};const bob={actorId:'actor-bob',tenantId:'tenant-a'};
const all:EffectClass[]=['read','model','write','computer'];const sharing=sharingGrantKey('source-1',group);
function source():SourceRef{return {sourceId:'source-1',scope:{...personal},audience:['actor-alice'],trust:'trusted',observedAt:1700000000000};}
function row(scope:ScopeRef,patch:Partial<AuthorityRecord>={}):AuthorityRecord{return {scope:{...scope},actorId:alice.actorId,revision:7,membershipRevision:4,enterprise:[...all],space:[...all],role:[...all],tool:[...all],runtime:[...all],readableSources:['source-1'],shareableDestinations:[],...patch};}
function envelope(scope:ScopeRef=personal):TaskEnvelope{return {schemaVersion:1,scope:{...scope},taskId:'task-1',requirementsRevision:7,intent:'act',executionClass:'external-effect',effectCeiling:[...all],sources:[source()],targets:[{resourceId:'resource-1',scope:{...scope},kind:'repository'}],payerId:scope.spaceId==='space-private'?'payer-private':'payer-group',allowanceId:'allowance-1',ceilingUnits:100,continuation:'safe',requiredChecks:['protected-g0'],versions:{engine:'engine-1',schema:'schema-1',behavior:'behavior-1',environment:'image-1'},groupTrigger:scope.spaceId==='space-group'};}
function setup(){const spaces=new SpacesRepository();spaces.register({scope:personal,kind:'personal',ownerActorId:alice.actorId,payerId:'payer-private',audience:[alice.actorId],membershipRevision:4,dataNamespace:'private-data',computeNamespace:'private-compute',computerAssignment:null});spaces.register({scope:group,kind:'group',ownerActorId:alice.actorId,payerId:'payer-group',audience:[alice.actorId,bob.actorId],membershipRevision:4,dataNamespace:'group-data',computeNamespace:'group-compute',computerAssignment:null});const authority=new AuthorityService(spaces);authority.register(row(personal));authority.register(row(group));let retrievals=0;let dispatches=0;function act(request:AuthorityRequest){const admission=authority.authorize(request);authority.assertCurrent(admission);if(request.effect==='read')retrievals++;else dispatches++;return admission;}return {spaces,authority,act,counters:()=>({retrievals,dispatches})};}
test('G0-O03/allowed',()=>{const f=setup();assert.equal(f.spaces.getAuthorized(personal,alice).payerId,'payer-private');assert.equal(f.spaces.getAuthorized(group,alice).payerId,'payer-group');f.act({actor:alice,envelope:envelope(),effect:'write'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:1});});
test('G0-O03/denied',()=>{const f=setup();assert.throws(()=>f.spaces.getAuthorized(personal,bob),{code:'UNAUTHORIZED'});assert.throws(()=>f.act({actor:{...alice,tenantId:'tenant-b'},envelope:envelope(),effect:'read'}),{code:'SCOPE_MISMATCH'});assert.throws(()=>f.act({actor:alice,envelope:{...envelope(),payerId:'forged-payer'},effect:'write'}),{code:'UNAUTHORIZED'});assert.throws(()=>f.spaces.assertClientBinding({...f.spaces.get(personal),ownerActorId:bob.actorId,audience:[bob.actorId]}),{code:'UNAUTHORIZED'});assert.throws(()=>f.act({actor:alice,envelope:{...envelope(),targets:[{resourceId:'resource-1',scope:group,kind:'repository'}]},effect:'write'}),{code:'SCOPE_MISMATCH'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});});
test('G0-O03/recovery',()=>{const f=setup();const pending=envelope();const before=structuredClone(pending);f.spaces.getAuthorized(group,alice);assert.deepEqual(pending,before);assert.deepEqual(f.act({actor:alice,envelope:pending,effect:'write'}).scope,personal);assert.deepEqual(pending.targets[0]?.scope,personal);assert.equal(f.counters().dispatches,1);});
test('G0-O04/allowed',()=>{const f=setup();const admitted=f.act({actor:alice,envelope:envelope(),effect:'write'});assert.equal(admitted.payerId,'payer-private');assert.equal(admitted.effect,'write');assert.equal(f.counters().dispatches,1);});
test('G0-O04/denied',()=>{for(const layer of ['enterprise','space','role','tool','runtime'] as const){const f=setup();f.authority.register(row(personal,{revision:8,[layer]:['read']}));assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'write'}),{code:'UNAUTHORIZED'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});}const f=setup();assert.throws(()=>f.act({actor:alice,envelope:{...envelope(),effectCeiling:['read']},effect:'write'}),{code:'UNAUTHORIZED'});assert.equal(f.counters().dispatches,0);});
test('G0-O04/recovery',()=>{const f=setup();const admitted=f.authority.authorize({actor:alice,envelope:envelope(),effect:'write'});f.authority.register(row(personal,{revision:8,role:['read']}));assert.throws(()=>f.authority.assertCurrent(admitted),{code:'UNAUTHORIZED'});assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'write'}),{code:'UNAUTHORIZED'});f.authority.register(row(personal,{revision:9}));f.act({actor:alice,envelope:envelope(),effect:'write'});assert.equal(f.counters().dispatches,1);});
test('G0-O05/allowed',()=>{const f=setup();for(const intent of ['ask','plan'] as const)f.act({actor:alice,envelope:{...envelope(),intent,executionClass:'conversation',effectCeiling:['read','model'],targets:[]},effect:'read'});f.act({actor:alice,envelope:envelope(),effect:'write'});f.act({actor:alice,envelope:envelope(group),effect:'write',explicitTrigger:true});assert.deepEqual(f.counters(),{retrievals:2,dispatches:2});});
test('G0-O05/denied',()=>{const f=setup();assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect:'write'}),{code:'UNAUTHORIZED'});assert.throws(()=>f.act({actor:alice,envelope:{...envelope(group),groupTrigger:false},effect:'write',explicitTrigger:true}),{code:'UNAUTHORIZED'});for(const intent of ['ask','plan'] as const)assert.throws(()=>f.act({actor:alice,envelope:{...envelope(),intent},effect:'write'}),{code:'INTENT_EXCEEDED'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});});
test('G0-O05/recovery',()=>{const f=setup();assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect:'write',explicitTrigger:false}),{code:'UNAUTHORIZED'});f.act({actor:alice,envelope:envelope(group),effect:'write',explicitTrigger:true});assert.equal(f.counters().dispatches,1);});
test('G0-O06/allowed',()=>{const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));f.authority.register(row(group,{revision:8,shareableDestinations:[sharing]}));const admission=f.act({actor:alice,envelope:envelope(group),effect:'read',source:source(),destination:group,explicitTrigger:true});assert.equal(admission.dependencies.length,2);assert.equal(f.counters().retrievals,1);});
test('G0-O06/denied',()=>{const f=setup();assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect:'read',source:source(),destination:group,explicitTrigger:true}),{code:'UNAUTHORIZED'});f.authority.register(row(group,{revision:8,shareableDestinations:[sharing]}));assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect:'read',source:source(),destination:group,explicitTrigger:true}),{code:'UNAUTHORIZED'});assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'read',source:{...source(),audience:[bob.actorId]}}),{code:'UNAUTHORIZED'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});});
test('G0-O06/recovery',()=>{const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));f.authority.register(row(group,{revision:8,shareableDestinations:[sharing]}));const request:AuthorityRequest={actor:alice,envelope:envelope(group),effect:'read',source:source(),destination:group,explicitTrigger:true};const old=f.authority.authorize(request);f.authority.register(row(personal,{revision:9,readableSources:[],shareableDestinations:[]}));assert.throws(()=>f.authority.assertCurrent(old),{code:'UNAUTHORIZED'});assert.throws(()=>f.act(request),{code:'UNAUTHORIZED'});assert.equal(f.counters().retrievals,0);f.authority.register(row(personal,{revision:10,shareableDestinations:[sharing]}));f.act(request);assert.equal(f.counters().retrievals,1);});
test('authority outages fail closed and explicit restoration permits work',()=>{const f=setup();f.authority.setAvailable(false);assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'read'}),{code:'AUTHORITY_UNAVAILABLE'});f.authority.setAvailable(true);f.spaces.setAvailable(false);assert.throws(()=>f.act({actor:alice,envelope:envelope(),effect:'write'}),{code:'AUTHORITY_UNAVAILABLE'});assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});f.spaces.setAvailable(true);f.act({actor:alice,envelope:envelope(),effect:'write'});assert.equal(f.counters().dispatches,1);});
test('membership CAS invalidates old admission and never restores removed member',()=>{const f=setup();const admission=f.authority.authorize({actor:alice,envelope:envelope(group),effect:'read',explicitTrigger:true});f.spaces.updateAudience(group,[alice.actorId],4);assert.throws(()=>f.authority.assertCurrent(admission),{code:'UNAUTHORIZED'});assert.throws(()=>f.spaces.getAuthorized(group,bob),{code:'UNAUTHORIZED'});assert.throws(()=>f.spaces.updateAudience(group,[alice.actorId,bob.actorId],4),{code:'STALE_REVISION'});f.authority.register(row(group,{revision:8,membershipRevision:5}));f.act({actor:alice,envelope:envelope(group),effect:'read',explicitTrigger:true});assert.equal(f.counters().retrievals,1);});
test('deleted namespaces and shared namespaces cannot be revived',()=>{const f=setup();const original=f.spaces.get(personal);assert.throws(()=>f.spaces.register({...f.spaces.get(group),dataNamespace:original.dataNamespace}),{code:'IDEMPOTENCY_CONFLICT'});f.spaces.tombstone(personal);assert.throws(()=>f.spaces.getAuthorized(personal,alice),{code:'UNAUTHORIZED'});assert.throws(()=>f.spaces.register(original),{code:'UNAUTHORIZED'});});
test('controlled authentication rejects expired revoked and forged sessions',()=>{const clock=new DeterministicClock();const directory=new ActorDirectory(clock);directory.registerSession('token-a',alice,clock.now()+100);assert.deepEqual(directory.authenticate('token-a'),alice);assert.throws(()=>directory.authenticate('made-up'),{code:'UNAUTHORIZED'});directory.setAvailable(false);assert.throws(()=>directory.authenticate('token-a'),{code:'AUTHORITY_UNAVAILABLE'});directory.setAvailable(true);directory.revoke('token-a');assert.throws(()=>directory.authenticate('token-a'),{code:'UNAUTHORIZED'});assert.throws(()=>directory.registerSession('token-a',alice,clock.now()+100),{code:'IDEMPOTENCY_CONFLICT'});directory.registerSession('token-b',bob,clock.now()+100);clock.advance(100);assert.throws(()=>directory.authenticate('token-b'),{code:'UNAUTHORIZED'});});

test('implicit cross-Space read and model use require both source and destination sharing grants',()=>{
 for(const effect of ['read','model'] as const){
  for(const authorizedSide of ['source','destination'] as const){
   const f=setup();
   f.authority.register(row(authorizedSide==='source'?personal:group,{revision:8,shareableDestinations:[sharing]}));
   const request:AuthorityRequest={actor:alice,envelope:envelope(group),effect,source:source(),explicitTrigger:true};
   assert.ok(!Object.hasOwn(request,'destination'),'Exercise omitted destination, not an explicit hint');
   assert.throws(()=>f.act(request),{code:'UNAUTHORIZED'},effect+' with '+authorizedSide+' grant only');
   assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});
  }
 }
});

test('implicit double-authorized cross-Space use binds both dependencies to current revisions',()=>{
 for(const effect of ['read','model'] as const){
  const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));f.authority.register(row(group,{revision:9,shareableDestinations:[sharing]}));
  const request:AuthorityRequest={actor:alice,envelope:envelope(group),effect,source:source(),explicitTrigger:true};
  const before=structuredClone(request),admission=f.act(request);
  assert.deepEqual(request,before);assert.deepEqual(admission.scope,group);assert.equal(admission.payerId,'payer-group');assert.equal(admission.effect,effect);
  assert.deepEqual(admission.dependencies,[{scope:personal,actorId:alice.actorId,revision:8,membershipRevision:4},{scope:group,actorId:alice.actorId,revision:9,membershipRevision:4}]);
  assert.doesNotThrow(()=>f.authority.assertCurrent(admission));
  assert.deepEqual(f.counters(),effect==='read'?{retrievals:1,dispatches:0}:{retrievals:0,dispatches:1});
 }
});

test('same-Space private conversation source remains usable without a sharing grant',()=>{
 for(const effect of ['read','model'] as const){
  const f=setup();assert.deepEqual(f.authority.current(personal,alice.actorId).shareableDestinations,[]);
  const request:AuthorityRequest={actor:alice,envelope:{...envelope(),intent:'ask',executionClass:'conversation',effectCeiling:['read','model'],targets:[]},effect,source:source()};
  const admission=f.act(request);assert.deepEqual(admission.scope,personal);assert.equal(admission.payerId,'payer-private');assert.equal(admission.dependencies.length,1);
  assert.deepEqual(admission.dependencies[0],{scope:personal,actorId:alice.actorId,revision:7,membershipRevision:4});
  assert.deepEqual(f.counters(),effect==='read'?{retrievals:1,dispatches:0}:{retrievals:0,dispatches:1});
 }
});

test('explicit destination cannot override the envelope even when both actual grants exist',()=>{
 for(const effect of ['read','model'] as const){
  const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));f.authority.register(row(group,{revision:8,shareableDestinations:[sharing]}));
  assert.throws(()=>f.act({actor:alice,envelope:envelope(group),effect,source:source(),destination:personal,explicitTrigger:true}),{code:'SCOPE_MISMATCH'});
  assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});
 }
});

test('implicit admission cannot survive sharing revocation at either endpoint',()=>{
 for(const effect of ['read','model'] as const){
  for(const revokedScope of [personal,group]){
   const f=setup();f.authority.register(row(personal,{revision:8,shareableDestinations:[sharing]}));f.authority.register(row(group,{revision:8,shareableDestinations:[sharing]}));
   const request:AuthorityRequest={actor:alice,envelope:envelope(group),effect,source:source(),explicitTrigger:true};
   const cached=f.authority.authorize(request);assert.equal(cached.dependencies.length,2);f.authority.assertCurrent(cached);
   f.authority.register(row(revokedScope,{revision:9,shareableDestinations:[]}));
   assert.throws(()=>f.authority.assertCurrent(cached),{code:'UNAUTHORIZED'});assert.throws(()=>f.act(request),{code:'UNAUTHORIZED'});
   assert.deepEqual(f.counters(),{retrievals:0,dispatches:0});
   f.authority.register(row(revokedScope,{revision:10,shareableDestinations:[sharing]}));
   assert.throws(()=>f.authority.assertCurrent(cached),{code:'UNAUTHORIZED'},'Regrant does not resurrect an older admission');
   const renewed=f.act(request);assert.equal(renewed.dependencies.length,2);assert.ok(renewed.dependencies.some(d=>d.scope.spaceId===revokedScope.spaceId&&d.revision===10));
   assert.deepEqual(f.counters(),effect==='read'?{retrievals:1,dispatches:0}:{retrievals:0,dispatches:1});
  }
 }
});
