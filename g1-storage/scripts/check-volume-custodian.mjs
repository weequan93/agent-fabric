import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cwd,root,cache } from './paths.mjs';
import { candidateSnapshot } from './candidate.mjs';
import { assertBaseline } from './guards.mjs';
import { executeSuite } from './suite-execution.mjs';
import { buildRecovery,sourceGuards as recoverySourceGuards } from './recovery/verification.mjs';
import { hash,assertRecoveryPins,assertPrivateFile } from './recovery/ownership.mjs';
import { createJournal,writeReceipt } from './custodian/journal.mjs';
const sources=['scripts/check-volume-custodian.mjs','scripts/custodian/journal.mjs','scripts/custodian/processes.mjs','scripts/custodian/lifetimes.mjs','scripts/custodian/custodian-process.mjs','scripts/custodian/probe-worker.mjs','scripts/custodian/probe-owner.mjs','scripts/custodian/custodian.test.mjs','src/custodian-receipt.ts'];
function guards(){
 assertBaseline();const original=[...assertRecoveryPins(),...recoverySourceGuards()];
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/custodian-sources.json')));assert.equal(pins.schemaVersion,1);assert.deepEqual(Object.keys(pins.files).sort(),sources.slice().sort());
 for(const source of sources)assert.equal(hash(readFileSync(resolve(cwd,source))),pins.files[source],'Custodian assertion/source changed: '+source);
 return [...original,...sources.map(path=>({path:'g1-storage/'+path,sha256:pins.files[path]}))];
}
assert.equal(process.argv.length,2,'Custodian check accepts no arguments');const pins=guards(),candidate=candidateSnapshot();
console.log(JSON.stringify({measurement:'custodian-candidate',...candidate,guards:pins,externalQualification:'pending'}));
let output;const errors=[];
try{
 buildRecovery();const schema=await import(pathToFileURL(resolve(cache,'g1-storage/src/custodian-receipt.js')).href);
 const names=JSON.parse(readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json'))).variants['VOLUME-CUSTODIAN/behavior'];assert.equal(names.length,8);
 const parent='VOLUME-CUSTODIAN/behavior';output=await executeSuite(resolve(cwd,'scripts/custodian/custodian.test.mjs'),[parent],{cwd:root},{[parent]:names});
 assert.equal(output.report.tests,9);assert.deepEqual(output.report.variants,names);
 const records=output.result.stdout.split(/\r?\n/).filter(l=>l.startsWith('# {')).map(l=>JSON.parse(l.slice(2)));
 const all=records.filter(r=>r.measurement==='storage-volume-custodian-behavior');assert.equal(all.length,1);const behavior=schema.CustodianBehaviorSchema.parse(all[0]);assert.equal(behavior.candidate,candidate.digest);assert.deepEqual(behavior.variants.map(v=>v.name),names);
 const observations=records.filter(r=>r.measurement==='custodian-variant');assert.equal(observations.length,8);
 for(const [i,v] of behavior.variants.entries()){assert.equal(observations[i].name,v.name);assert.equal(observations[i].observations.length,v.positive);assert.deepEqual(observations[i].observations.map(hash),v.proofs);}
 assert.deepEqual(behavior.variants.map(v=>v.refusals),[0,0,0,0,0,8,0,0]);
 const measured=records.filter(r=>r.measurement==='custodian-current-probe');assert.equal(measured.length,7);
 for(const [i,p] of behavior.probes.entries()){
  assert.deepEqual(schema.CustodianProbeSummarySchema.parse(measured[i].summary),p);assert.equal(measured[i].receipt.candidate,candidate.digest);
  assertPrivateFile(p.receipt.path);const bytes=readFileSync(p.receipt.path);assert.equal(bytes.length,p.receipt.bytes);assert.equal(hash(bytes),p.receipt.sha256);assert.deepEqual(JSON.parse(bytes),measured[i].receipt);
 }
 assert.equal(candidateSnapshot().digest,candidate.digest);guards();
 const journal=createJournal(candidate.digest),index=writeReceipt(journal,{schemaVersion:1,candidate,guards:pins,tests:output.report,behavior});
 console.log(JSON.stringify({measurement:'custodian-check-receipt',...index,candidate,tests:9,variants:8}));
}catch(e){errors.push(e);}
finally{try{assert.equal(candidateSnapshot().digest,candidate.digest);guards();}catch(e){errors.push(e);}}
if(errors.length)throw new AggregateError(errors,'Custodian check failed; all original guards retained');
