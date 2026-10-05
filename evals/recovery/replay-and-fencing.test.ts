import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest, DomainError } from '../../engine/contracts/src/identity.js';
import { SessionLoop, replaySession } from '../../engine/kernel/src/session-loop.js';
import { createRun } from '../../engine/scheduler/src/run-state.js';
import { DeterministicClock } from '../helpers/fixture.js';
import { OperationRepository, type OperationInput } from '../../execution/action-broker/src/operation.js';

const scope={tenantId:'checkpoint-tenant',spaceId:'checkpoint-space'};
function input(operationId='checkpoint-operation'):OperationInput {
  const fence={taskGeneration:1,runGeneration:2,runtimeGeneration:3};const parameters={value:'prepared payload'};
  return {request:{scope,operationId,actorId:'actor',target:'allowed-target',parameters,parametersDigest:canonicalDigest(parameters),artifactDigest:null,policyRevision:4,intent:'act',fence,reservationId:`reservation-${operationId}`},taskId:'task',runId:'run',payerId:'payer',allowanceId:'allowance',units:5,approvalId:'approval',lease:{leaseId:'lease',scope,runId:'run',actorId:'actor',fence,expiresAt:1000}};
}
test('checkpoint preserves original unknown operation and reservation identities on restart',()=>{
  const owner=new OperationRepository(()=>{});const request=input();owner.prepare(request);owner.update(scope,request.request.operationId,'dispatched');owner.update(scope,request.request.operationId,'unknown',undefined,'reconcile downstream');
  const snapshot=owner.snapshot(scope);const restarted=new OperationRepository(()=>{});restarted.restore(snapshot);
  const result=restarted.get(scope,request.request.operationId);assert.equal(result.state,'unknown');assert.equal(result.resolver,'reconcile downstream');assert.deepEqual(result.input,request);assert.equal(result.input.request.reservationId,request.request.reservationId);
  snapshot[0]!.input.payerId='mutable-client';assert.equal(restarted.get(scope,request.request.operationId).input.payerId,'payer');
});
test('checkpoint dispatched interruption becomes unknown instead of prepared',()=>{
  const owner=new OperationRepository(()=>{});const request=input();owner.prepare(request);owner.update(scope,request.request.operationId,'dispatched');const restarted=new OperationRepository(()=>{});restarted.restore(owner.snapshot(scope));assert.equal(restarted.get(scope,request.request.operationId).state,'unknown');
});
test('checkpoint snapshot and restore enforce current grants',()=>{
  let permitted=true;const authorize=()=>{if(!permitted)throw new DomainError('UNAUTHORIZED');};const owner=new OperationRepository(authorize);owner.prepare(input());const snapshot=owner.snapshot(scope);permitted=false;
  assert.throws(()=>owner.snapshot(scope),DomainError);const restarted=new OperationRepository(authorize);assert.throws(()=>restarted.restore(snapshot),DomainError);permitted=true;assert.throws(()=>restarted.get(scope,'checkpoint-operation'),DomainError);
});
test('checkpoint invalid late row is rejected before any restored mutation',()=>{
  const source=new OperationRepository(()=>{});source.prepare(input('valid'));source.prepare(input('invalid'));const rows=source.snapshot(scope);rows[1]!.requestDigest='0'.repeat(64);
  const target=new OperationRepository(()=>{});assert.throws(()=>target.restore(rows),DomainError);assert.throws(()=>target.get(scope,'valid'),DomainError);
});
test('checkpoint older prepared data cannot downgrade unknown or committed state',()=>{
  const owner=new OperationRepository(()=>{});const request=input();owner.prepare(request);const old=owner.snapshot(scope);owner.update(scope,request.request.operationId,'dispatched');owner.update(scope,request.request.operationId,'unknown',undefined,'lookup');owner.restore(old);assert.equal(owner.get(scope,request.request.operationId).state,'unknown');
  const receipt={scope,operationId:request.request.operationId,executorId:'registered-executor',outcome:'committed' as const,externalId:'original-external-effect',usageUnits:3,recordedAt:10};owner.update(scope,request.request.operationId,'committed',receipt);owner.restore(old);assert.equal(owner.get(scope,request.request.operationId).state,'committed');assert.deepEqual(owner.get(scope,request.request.operationId).receipt,receipt);
});
test('checkpoint immutable operation binding rejects altered input and mismatched receipt',()=>{
  const owner=new OperationRepository(()=>{});owner.prepare(input());const rows=owner.snapshot(scope);rows[0]!.input.payerId='different-payer';rows[0]!.requestDigest=canonicalDigest(rows[0]!.input);assert.throws(()=>owner.restore(rows),DomainError);
  const invalid=owner.snapshot(scope);invalid[0]!.state='committed';invalid[0]!.receipt={scope,operationId:'another-operation',executorId:'registered-executor',outcome:'committed',externalId:null,usageUnits:1,recordedAt:10};assert.throws(()=>new OperationRepository(()=>{}).restore(invalid),DomainError);
});

function unknownSession(){
 let current=true,models=0,effects=0,lookups=0;
 const origin=createRun({scope,taskId:'model-checkpoint-task',runId:'model-checkpoint-run',attempt:1,requirementsRevision:1,versions:{engine:'1',schema:'1',behavior:'1',environment:'local'}});
 const pending={operationId:'original-model',reservationId:'original-model-reservation'};
 const make=()=>new SessionLoop(origin,{clock:new DeterministicClock(),authorize:()=>{if(!current)throw new DomainError('UNAUTHORIZED');},modelOperation:()=>pending,model:async()=>{models++;throw new DomainError('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');},execute:async()=>{effects++;return 'committed';},modelResolution:(_run,p)=>{lookups++;return {...p,status:'unknown',receiptId:null};}});
 return {origin,pending,make,revoke:()=>{current=false;},grant:()=>{current=true;},counts:()=>({models,effects,lookups})};
}

test('session replay retains unknown model identity with zero model, write or owner lookup calls',async()=>{
 const f=unknownSession(),s=f.make();s.transition('preparing',{});s.transition('running',{});
 await assert.rejects(()=>s.callModel('original-input'),DomainError);const history=JSON.parse(JSON.stringify(s.events()));const before=f.counts();
 const restored=f.make();restored.restore(history);assert.deepEqual(restored.inspect(),s.inspect());assert.deepEqual(replaySession(f.origin,history),s.inspect());assert.deepEqual(f.counts(),before);
 assert.deepEqual(restored.inspect().pendingModel,f.pending);assert.equal(restored.nextAction(),'reconcile');
 await assert.rejects(()=>restored.callModel('premature-model'),{code:'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'});
 await assert.rejects(()=>restored.dispatchEffect('premature-effect'),{code:'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'});assert.deepEqual(f.counts(),before);
 f.revoke();assert.throws(()=>f.make().restore(history),{code:'UNAUTHORIZED'});assert.deepEqual(f.counts(),before);
 f.grant();assert.equal(restored.nextAction(),'reconcile');
});

test('older or rewritten session history cannot erase an observed unknown model operation',async()=>{
 const f=unknownSession(),s=f.make();s.transition('preparing',{});s.transition('running',{});const older=s.events();
 await assert.rejects(()=>s.callModel('original-input'),DomainError);const original=s.inspect(),events=s.events(),counts=f.counts();
 assert.throws(()=>s.restore(older),{code:'STALE_REVISION'});
 const changed=structuredClone(events);const pendingEvent=changed.find(event=>event.kind==='model-pending');assert.ok(pendingEvent);
 pendingEvent.payload.operation={operationId:'replacement-model',reservationId:'replacement-reservation'};
 assert.throws(()=>s.restore(changed),{code:'STALE_REVISION'});assert.deepEqual(s.inspect(),original);assert.deepEqual(s.events(),events);assert.deepEqual(f.counts(),counts);
 assert.equal(s.nextAction(),'reconcile');
});

test('generic effect reconciliation cannot discharge a pending model reservation',async()=>{
 const f=unknownSession(),s=f.make();s.transition('preparing',{});s.transition('running',{});await assert.rejects(()=>s.callModel('original-input'),DomainError);
 const before=s.events();assert.throws(()=>s.reconcile(f.pending.operationId,'committed'),{code:'INVALID_SCHEMA'});assert.deepEqual(s.events(),before);
 assert.throws(()=>s.transition('verifying',{}),{code:'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'});
 assert.throws(()=>s.transition('succeeded',{controllerVerifier:true,checksSatisfied:true}),{code:'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'});
 assert.deepEqual(s.inspect().pendingModel,f.pending);assert.deepEqual(f.counts(),{models:1,effects:0,lookups:1});
});
