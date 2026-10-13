import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readJournal } from './recovery/journal.mjs';
import { startGuards,finalGuards,buildRecovery,recoverySchema,verifyBehavior } from './recovery/verification.mjs';
import { legacyInputs,legacyObservations } from './recovery/legacy.mjs';
import { containers } from './recovery/ownership.mjs';
import { postgresImage } from './paths.mjs';

const {candidate,guards}=startGuards(),failures=[];
try{
 buildRecovery();const schema=await recoverySchema(),{receipt,receiptIndex}=readJournal(candidate,schema);
 assert.deepEqual(receipt.guards,guards);
 const stdout=readFileSync(receipt.streams[0].path,'utf8'),stderr=readFileSync(receipt.streams[1].path,'utf8');
 const checked=verifyBehavior({status:0,signal:null,error:undefined,stdout,stderr},candidate,schema);
 assert.deepEqual(checked.behavior,receipt.behavior);
 const inputs=legacyInputs();assert.deepEqual(receipt.behavior.legacy.originalStreams,inputs.originalStreams);
 assert.equal(receipt.behavior.legacy.owner,inputs.container.owner);assert.equal(receipt.behavior.legacy.instance,inputs.container.instance);
 assert.deepEqual(receipt.behavior.legacy.originalContainerCensus,inputs.fixture.preexistingContainers);
 for(const outcome of receipt.behavior.legacy.outcomes){
  assert.equal(outcome.before.kind,outcome.after.kind);assert(outcome.before.observedAt<=outcome.after.observedAt);
  assert(outcome.after.observedAt<=receipt.createdAt);assert.equal(outcome.refusal,null);
  assert.equal(outcome.after.state,'absent');assert.equal(outcome.before.state,outcome.action==='removed'?'owned':'absent');
  assert(['removed','already-absent'].includes(outcome.action));
  assert.deepEqual(outcome.signals,outcome.before.kind==='process'&&outcome.action==='removed'?['SIGTERM']:[]);
  for(const o of [outcome.before,outcome.after]){
   if(o.kind==='root'){
    const expected=inputs.roots.find(r=>r.path===o.path);assert(expected);assert.deepEqual(o.expected,expected.identity);
    if(o.state==='owned'){assert.equal(o.device,expected.identity.device);assert.equal(o.inode,expected.identity.inode);assert.equal(o.symlink,false);assert(o.markerDigest);}
   }else if(o.kind==='process'){
    assert.equal(o.pid,inputs.process.pid);assert.equal(o.nonce,inputs.process.nonce);assert.equal(o.expectedInstance,inputs.process.instance);
    assert.equal(o.originalParentPid,inputs.process.parentPid);assert.equal(o.expectedCommand,inputs.process.command);
    if(o.state==='owned'){assert.equal(o.instance,inputs.process.instance);assert.equal(o.commandMatches,true);assert.equal(o.originalParentPresent,false);assert.equal(o.ppid,1);}
   }else{
    assert.equal(o.id,inputs.container.id);assert.equal(o.name,inputs.container.name);
    if(o.state==='owned'){
     assert.equal(o.owner,inputs.container.owner);assert.equal(o.instance,inputs.container.instance);assert.equal(o.image,postgresImage);
     assert.equal(o.loopback,true);assert.equal(o.bindMounts,0);assert.equal(o.databaseVerified,true);
     assert.equal(o.databaseOwner,inputs.container.owner);assert.equal(o.databaseInstance,inputs.container.instance);
    }
   }
  }
 }
 const actual=await legacyObservations(inputs);assert.equal(actual.length,7);
 for(const observed of actual){schema.RecoveryObservationSchema.parse(observed);assert.equal(observed.state,'absent','Current legacy terminal absence required');}
 const outcomeResources=receipt.behavior.legacy.outcomes.map(o=>o.before.kind==='root'?o.before.path:o.before.kind==='process'?String(o.before.pid):o.before.id).sort();
 assert.deepEqual(outcomeResources,[String(inputs.process.pid),inputs.container.id,...inputs.roots.map(r=>r.path)].sort());
 assert(receipt.behavior.legacy.outcomes.every(o=>o.after.state==='absent'&&o.refusal===null));
 assert.deepEqual(containers(),receipt.behavior.censusAfter,'Current complete labelled container census');
 finalGuards(candidate);
 console.log(JSON.stringify({measurement:'interrupted-receipt-verified',receiptIndex,receipt,
  currentTerminalObservations:actual,originalFailurePreserved:true,actualRecoveryOrMeasuredAbsence:true,
  externalQualification:'pending'}));
}catch(error){failures.push(error);}finally{try{finalGuards(candidate);}catch(error){failures.push(error);}}
if(failures.length)throw new AggregateError(failures,'Interrupted recovery receipt check failed');
