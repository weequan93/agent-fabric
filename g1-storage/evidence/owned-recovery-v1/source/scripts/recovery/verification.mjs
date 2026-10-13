import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cwd,root,cache } from '../paths.mjs';
import { run,parseTap } from '../process-result.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { assertBaseline } from '../guards.mjs';
import { assertRecoveryPins,hash } from './ownership.mjs';
export const parent='OWNED-RECOVERY/behavior';
export const testFile=resolve(cwd,'scripts/recovery/owned-recovery.test.mjs');
const recoverySources=['scripts/check-volume-owned-recovery.mjs','scripts/check-volume-interrupted-receipt.mjs',
 'scripts/recovery/ownership.mjs','scripts/recovery/legacy.mjs','scripts/recovery/probe-process.mjs',
 'scripts/recovery/owned-recovery.test.mjs','scripts/recovery/journal.mjs','scripts/recovery/verification.mjs',
 'src/owned-recovery-receipt.ts'];
export function sourceGuards(){
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/owned-recovery-sources.json'),'utf8'));
 assert.equal(pins.schemaVersion,1);assert.deepEqual(Object.keys(pins.files).sort(),recoverySources.slice().sort());
 return recoverySources.map(file=>{
  assert.equal(hash(readFileSync(resolve(cwd,file))),pins.files[file],'Recovery source/assertion hash changed: '+file);
  return {path:'g1-storage/'+file,sha256:pins.files[file]};
 });
}
export function buildRecovery(){run(process.execPath,[resolve(cwd,'scripts/build.mjs')]);}
export async function recoverySchema(){return import(pathToFileURL(resolve(cache,'g1-storage/src/owned-recovery-receipt.js')).href);}
export function expectedVariants(){
 const plan=JSON.parse(readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json'),'utf8'));
 const names=plan.variants['OWNED-RECOVERY/behavior'];assert.equal(names.length,8);assert.equal(new Set(names).size,8);return names;
}
export function verifyBehavior(result,candidate,schema){
 const report=parseTap(result,[parent]),names=expectedVariants();
 assert.equal(report.tests,9);assert.deepEqual(report.executions.filter(r=>r.indent===4).map(r=>r.name),names);
 assert(report.executions.filter(r=>r.indent===4).every(r=>r.parent===report.cases[0]));
 const lines=result.stdout.split(/\r?\n/).filter(l=>l.startsWith('# {'));
 const records=lines.map(l=>JSON.parse(l.slice(2))),behaviors=records.filter(r=>r.measurement==='storage-owned-recovery-behavior');
 assert.equal(behaviors.length,1);const behavior=schema.RecoveryBehaviorSchema.parse(behaviors[0]);
 assert.equal(behavior.candidate,candidate.digest);assert.deepEqual(behavior.variants.map(r=>r.name),names);
 const probes=records.filter(r=>r.measurement==='owned-recovery-variant');assert.equal(probes.length,8);
 for(const [i,variant] of behavior.variants.entries()){
  assert.equal(probes[i].name,variant.name);assert.equal(probes[i].observations.length,variant.positive);
  assert.deepEqual(probes[i].observations.map(hash),variant.proofs);
  for(const observation of probes[i].observations){
   if(typeof observation==='string')assert.match(observation,/^sha256:[a-f0-9]{64}$/);
   else if(observation.kind)schema.RecoveryObservationSchema.parse(observation);
   else if(observation.action)schema.RecoveryOutcomeSchema.parse(observation);
   else schema.LegacyRecoverySchema.parse(observation);
  }
 }
 assert.deepEqual(behavior.variants.map(r=>r.refusals),[2,1,2,4,1,1,1,0]);
 assert.deepEqual(behavior.censusAfter,behavior.censusBefore.filter(id=>!behavior.legacy.outcomes.some(o=>o.before.kind==='container'&&o.before.id===id&&o.action==='removed')));
 return {report,behavior};
}
export function startGuards(){
 if(process.argv.length!==2)throw new Error('Recovery check accepts no arguments');
 assertBaseline();const guards=[...assertRecoveryPins(),...sourceGuards()],candidate=candidateSnapshot();
 console.log(JSON.stringify({measurement:'owned-recovery-candidate',...candidate,guards,externalQualification:'pending'}));return {guards,candidate};
}
export function finalGuards(candidate){
 const errors=[];
 try{assert.equal(candidateSnapshot().digest,candidate.digest,'Candidate changed during recovery check');}catch(e){errors.push(e);}
 try{assertRecoveryPins();sourceGuards();}catch(e){errors.push(e);}
 try{assertBaseline();}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'All recovery final guards attempted');
}
