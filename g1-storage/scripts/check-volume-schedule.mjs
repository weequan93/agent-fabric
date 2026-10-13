import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd,root } from './paths.mjs';
import { candidateSnapshot } from './candidate.mjs';
import { executeSuite } from './suite-execution.mjs';
import { buildRecovery } from './recovery/verification.mjs';
import { guards,variants,readBound,validateReceipt } from './schedule/verification.mjs';
import { hash } from './recovery/ownership.mjs';
assert.equal(process.argv.length,2,'Schedule proof accepts no arguments');
// Build first to validate emitted file presence; the source baseline is retained
// on both build failure and final proof failure.
const candidate=candidateSnapshot(),errors=[];let output;
try{
 buildRecovery();const pins=guards();console.log(JSON.stringify({measurement:'schedule-candidate',...candidate,guards:pins,externalQualification:'pending'}));
 const parent='VOLUME-SCHEDULE/behavior';output=await executeSuite(resolve(cwd,'scripts/schedule/schedule.test.mjs'),[parent],{cwd:root},{[parent]:variants});
 assert.equal(output.report.tests,9);assert.deepEqual(output.report.variants,variants);
 const records=output.result.stdout.split(/\r?\n/).filter(l=>l.startsWith('# {')).map(l=>JSON.parse(l.slice(2)));
 const all=records.filter(r=>r.measurement==='storage-volume-schedule-behavior');assert.equal(all.length,1);const behavior=all[0];
 assert.equal(behavior.schemaVersion,1);assert.equal(behavior.candidate,candidate.digest);assert.deepEqual(behavior.variants.map(v=>v.name),variants);assert.equal(behavior.actualChildTests,48);assert.equal(behavior.originalVolumeTests,4);assert.equal(behavior.externalQualification,'pending');
 assert.deepEqual(behavior.censusAfter,behavior.censusBefore);assert.equal(behavior.refusals.length,21);assert.equal(new Set(behavior.refusals).size,21);
 const observations=records.filter(r=>r.measurement==='schedule-variant');assert.equal(observations.length,8);
 for(const [i,v] of behavior.variants.entries()){assert.equal(observations[i].name,v.name);assert(v.positive>0);assert.equal(observations[i].observations.length,v.positive);assert.deepEqual(observations[i].observations.map(hash),v.proofs);}
 const receipt=JSON.parse(readBound(behavior.receipt));await validateReceipt(receipt);
 for(const kind of ['stdout','stderr'])readBound(behavior.raw[kind]);
 const original=records.filter(r=>r.measurement==='schedule-original-volume-command');assert.equal(original.length,1);assert.equal(original[0].status,0);assert.equal(original[0].signal,null);assert.equal(original[0].error,null);assert.deepEqual(original[0].raw,behavior.raw);
 assert.equal(candidateSnapshot().digest,candidate.digest);guards();
 console.log(JSON.stringify({measurement:'schedule-test-report',candidate,tests:output.report,behavior}));
}catch(e){errors.push(e);}
finally{try{assert.equal(candidateSnapshot().digest,candidate.digest);guards();}catch(e){errors.push(e);}}
if(errors.length)throw new AggregateError(errors,'Volume schedule proof failed; unchanged bounds and guards retained');
