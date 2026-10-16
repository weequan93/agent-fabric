/** Five registered pilot leaves. Each invocation exercises the SAME adapter/API
 * and an independent real owned original; it never manufactures confirmed state,
 * caches a pass or restores a settled original ledger. The field partition is
 * deliberately smaller than the full normative path/family/vector inventory. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {bindingDigest} from '../../src/owners.js';
import {settlementFixture,type SettlementPath} from './settlement-fixture.js';
import {eventually} from './continuation-fixture.js';
import type {Observations} from './register-cases.js';

export const quiescenceFieldDrafts=['operationId','originalBindingDigest','snapshotDigest','instanceId','bootId','resourceId',
 'generation','observedAt-stale','observedAt-future','descendantsQuiescent','streamsClosed','digest','missing','extra-field'] as const;
export type QuiescenceFieldDraft=typeof quiescenceFieldDrafts[number];
async function quiescenceFieldJourney(path:SettlementPath,field:QuiescenceFieldDraft):Promise<Observations>{
 const f=await settlementFixture();try{
  const original=await f.issue(path),id=original.operationId,send=await f.request(id,'dispatch');assert.equal(send.status,200,JSON.stringify(send));assert.equal(send.body.sendAck,'lost');
  await eventually(async()=>{const target=await f.snapshot();return target.writes.filter((w:any)=>w.receipt.operationId===id).length===1&&(target.streams[id]??0)===1;});
  assert.equal((await f.fence(original)).status,200);const actual=await f.quiescent(id);await f.restart();
  const before=f.read(id),targetBefore=await f.snapshot();assert.equal(before.effect.state,'unknown');assert.equal(Object.keys(before.commands).length,0);
  assert.equal(before.dispatchFenced,true);assert.equal(before.resource.held,true);
  const proof:Record<string,unknown>={};
  if(field==='missing')f.settlementFaults[id]={missingProof:true};
  else{
   if(field.endsWith('Digest')||field==='digest')proof[field]=bindingDigest(['wrong-quiescence-field',field]);
   else if(field==='generation')proof.generation={...before.snapshot!.generation,resource:before.snapshot!.generation.resource+1};
   else if(field==='observedAt-stale')proof.observedAt=new Date(Date.now()-60_000).toISOString();
   else if(field==='observedAt-future')proof.observedAt=new Date(Date.now()+60_000).toISOString();
   else if(field==='descendantsQuiescent'||field==='streamsClosed')proof[field]=false;
   else if(field==='extra-field')proof.dispatch=true;
   else proof[field]=randomUUID();
   f.settlementFaults[id]={proof};
  }
  const refused=await f.request(id,'recover');assert.equal(refused.status,403,JSON.stringify(refused));assert.equal(refused.body.replayAllowed,false);assert.equal(refused.body.resourceHeld,true);
  if(field==='observedAt-stale'||field==='observedAt-future')assert.equal(refused.body.code,'STALE_QUIESCENCE');
  else if(['missing','extra-field','descendantsQuiescent','streamsClosed'].includes(field))assert.equal(refused.body.code,'INVALID_SCHEMA');
  else if(field==='digest')assert.match(refused.body.code,/^QUIESCENCE_PROOF_CHANGED/);
  else assert.equal(refused.body.code,'QUIESCENCE_BINDING_CONFLICT');
  assert.deepEqual(f.read(id),before,'Refused proof changes no original metadata, Stop, lease, ownership or accounting');
  await assert.rejects(()=>f.successor(original),'No successor enrollment before proof settlement');
  const deniedTarget=await f.snapshot();assert.deepEqual(deniedTarget.writes,targetBefore.writes);assert.equal(deniedTarget.gets.length,targetBefore.gets.length+1,'One exact authenticated GET, no POST fallback');
  assert.equal(await f.directOld(id),403);assert.equal(await f.directOld(id,true),403);
  delete f.settlementFaults[id];const recoveryBefore=await f.snapshot(),recovered=await f.request(id,'recover');assert.equal(recovered.status,200,JSON.stringify(recovered));
  const after=f.read(id),recoveryAfter=await f.snapshot();assert.equal(after.effect.state,'confirmed');assert.equal(after.run.revision,before.run.revision+1);assert.equal(after.outbox.length,1);
  for(const key of ['task','lease','session','resource','accounting','historicalDigest','admission','approval','stopReceipt','snapshot'] as const)assert.deepEqual(after[key],before[key]);
  assert.deepEqual({...after.run,revision:before.run.revision},before.run);
  assert.deepEqual(after.effect.binding,before.effect.binding);assert.deepEqual(recoveryAfter.writes,recoveryBefore.writes);assert.equal(recoveryAfter.gets.length,recoveryBefore.gets.length+1,'Fresh restored GET rather than reusing rejected proof');
  const successor=await f.successor(original),useful=await f.request(successor.operationId,'dispatch');assert.equal(useful.status,200,JSON.stringify(useful));
  await eventually(async()=>{const target=await f.snapshot();return target.writes.filter((w:any)=>w.receipt.operationId===successor.operationId).length===1;});
  const finalTarget=await f.snapshot();assert.equal(finalTarget.value,f.bindings[successor.operationId].request.arguments.value);assert.equal(finalTarget.writes.filter((w:any)=>w.receipt.operationId===id).length,1);
  const oldAgain=await f.request(id,'dispatch');assert.equal(oldAgain.status,403);assert.equal(await f.directOld(id),403);assert.deepEqual(f.read(id).accounting,before.accounting);
  return {'continuation-state':{path,field,originalOperationId:id,rejectedCode:refused.body.code,unchangedOriginal:true,freshRecovery:true,fixtureOnly:true,
    originalBeforeDigest:bindingDigest(before),originalAfterDigest:bindingDigest(after),settlementReceipt:recovered.body.receipt,authority:recovered.body.authority,oldLeaseUnchanged:true},
   'target-observer':{pid:f.targetPid,originalOperationId:id,originalReceipt:targetBefore.writes[0].receipt,originalWrites:1,negativeGets:1,restoredGets:1,
    negativeStatusGet:deniedTarget.gets.at(-1),restoredStatusGet:recoveryAfter.gets.at(-1),successorOperationId:successor.operationId,successorWrites:1,usefulDistinctSuccessorValue:finalTarget.value},
   'process-census':{...actual,serviceBirths:f.serviceBirths,independentFreshVerification:true,retainedDescendantFaultExercised:false,cleanupRequired:true}};
 }finally{await f.cleanup();}
}

// All fourteen schema faults occur at least once, with wrong boot on EVERY
// path. Eighteen separate original/target/owner fixtures run sequentially. This
// is not the seventy-field cross-product or the normative fourteen race vectors.
const pilotFields:Readonly<Record<SettlementPath,readonly QuiescenceFieldDraft[]>>=Object.freeze({
 'stopped-original-stop-run':['bootId','operationId','originalBindingDigest','snapshotDigest'],
 'stopped-original-stop-task':['bootId','instanceId','resourceId','generation'],
 'lease-expired-original':['bootId','observedAt-stale','observedAt-future'],
 'effect-expired-original':['bootId','descendantsQuiescent','streamsClosed'],
 'stop-and-both-expiries':['bootId','digest','missing','extra-field']
});
assert.deepEqual([...new Set(Object.values(pilotFields).flat())].sort(),[...quiescenceFieldDrafts].sort());
assert.equal(Object.values(pilotFields).flat().length,18);
export const settlementQuiescencePilotCases:Record<string,()=>Promise<Observations>>={};
for(const [path,fields]of Object.entries(pilotFields)){
 settlementQuiescencePilotCases['A16/quiescence-snapshot/settlement/'+path+'/wrong-boot']=async()=>{
  const observations:Observations[]=[];
  for(const field of fields)observations.push(await quiescenceFieldJourney(path as SettlementPath,field));
  const operations=observations.map(o=>o['continuation-state']!['originalOperationId']);assert.equal(new Set(operations).size,fields.length,'Every vector owns a distinct actual original');
  return Object.fromEntries(['continuation-state','target-observer','process-census'].map(kind=>[kind,{path,pilot:true,fieldCount:fields.length,fields:[...fields],
   fullNormativeMatrix:false,fieldPathCrossProduct:false,vectors:observations.map(o=>o[kind])}]));
 };
}
