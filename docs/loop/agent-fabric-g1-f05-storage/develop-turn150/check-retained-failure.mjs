// Repeatable read-only check of the retained failure; no controller failure is reclassified.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,cwd,cache} from '../../../../g1-storage/scripts/paths.mjs';
import {candidateSnapshot} from '../../../../g1-storage/scripts/candidate.mjs';
import {decodeFullReceipt} from '../../../../g1-storage/scripts/full-receipt-transport.mjs';
import {decodeFullDiagnostic} from '../../../../g1-storage/scripts/full-diagnostic-transport.mjs';
import {registrationBinding,fullDescriptor,validateFullObservations,validateFullTap} from '../../../../g1-storage/scripts/full-composition.mjs';
const here=new URL('./',import.meta.url),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const official=JSON.parse(readFileSync(new URL('official-attempt.json',here)));
assert.deepEqual(candidateSnapshot(),official.candidate);
const {QualificationObservationSchema:schema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
const runs=[];
for(const r of official.runs){
 for(const pair of Object.values(r.streams)){
  const a=readFileSync(resolve(root,pair.original.path)),b=readFileSync(resolve(root,pair.copy.path));
  assert(a.equals(b));assert.equal(b.length,pair.copy.bytes);assert.equal(hash(b),pair.copy.sha256);
 }
 if(!r.actualChildTap)continue;
 const tap=readFileSync(resolve(root,r.actualChildTap.path),'utf8');
 if(r.children){assert.equal(r.children.length,63);assert.equal(r.tapTotals.tests,42);assert.equal(r.tapTotals.fail,0);continue;}
 const suite=r.result.data.check.includes('lifecycle')?'lifecycle-propagation':'volume-draft',rows=[];let pending='';
 for(const line of tap.split(/\r?\n/)){
  const m=/^\s*# (.*)$/.exec(line);if(!m){assert.equal(pending,'');continue;}
  if(!pending&&!m[1].startsWith('{'))continue;pending+=m[1];let value;
  try{value=JSON.parse(pending);}catch{continue;}
  rows.push({value,raw:pending});pending='';
 }
 assert.equal(pending,'');
 const receipts=rows.filter(r=>r.value.measurement==='storage-full-receipt').map(r=>decodeFullReceipt(r.value).value);
 const starts=receipts.filter(r=>r.measurement==='storage-full-registration-start'),ends=receipts.filter(r=>r.measurement==='storage-full-registration-end');
 const d=fullDescriptor(suite);assert.equal(starts.length,d.records);assert.equal(ends.length,d.records);
 const {registration,ordinal,sources,...context}=starts[0].binding;
 const observations=rows.filter(r=>['storage-observations','propagation-verification-observations','volume-verification-observations'].includes(r.value.measurement));
 assert.equal(observations.length,d.records);const bound=[];
 for(let i=0;i<d.records;i++){
  const binding=registrationBinding(context,d.registrations[i],i),end=ends[i];
  assert.deepEqual(starts[i].binding,binding);assert.deepEqual(end.binding,binding);
  assert.equal(end.raw,observations[i].raw);assert.equal(end.rawDigest,hash(end.raw));
  assert.equal(end.fixtures.length,d.registrations[i].fixtures);assert.equal(end.cleanup.length,end.fixtures.length*2);assert(end.cleanup.every(c=>c.removed));
  bound.push({registration:binding.registration,rawDigest:end.rawDigest,violations:observations[i].value.violations,positives:observations[i].value.positives});
 }
 const failed=suite==='lifecycle-propagation';
 if(failed){
  assert.deepEqual(r.tapTotals,{tests:187,pass:185,fail:2,cancelled:0,skipped:0,todo:0});
  assert.equal(r.testReports.length,0);assert.equal(r.commandClock.success,false);
  assert.throws(()=>validateFullTap({stdout:tap,stderr:'',status:1,signal:null},suite),/node:test failed/);
  assert.throws(()=>validateFullObservations(tap,suite,context,schema),/Useful positive\/zero-violation qualification gate failed/);
  assert.equal(bound[6].registration,'verify-maintenance');assert.equal(bound[6].violations.unauthorizedDisclosure,1);
  assert(tap.includes("null !== 'Lock'"));assert(tap.includes('Object.blocked '));
  const statuses=[...tap.matchAll(/^(\s*)(ok|not ok) (\d+) - (.+)$/gm)].map(m=>({indent:m[1].length,status:m[2],number:Number(m[3]),name:m[4]}));
  const failures=statuses.filter(r=>r.status==='not ok');assert.deepEqual(failures.map(r=>r.name),['L09/blocked-wait-revalidation','L09 / installed maintenance origin and existing allowance']);
  assert.equal(statuses.length,187);assert.equal(statuses.filter(r=>r.indent===0).length,13);assert.equal(statuses.filter(r=>r.indent>0).length,174);
  const after=rows.filter(r=>r.value.measurement==='maintenance-after-lock-refusal').map(r=>r.value.change);
  assert.deepEqual(after,['profile','region']);
  const wait=rows.filter(r=>r.value.measurement==='maintenance-observed-lock').map(r=>r.value.label);
  assert.deepEqual(wait,['profile','region']);
  runs.push({suite,failedCommandRetained:true,failures,observedAfterLockChanges:after,observedLockLabels:wait,notReachedChanges:['source','builder','provider','service-grant','budget','deadline'],allReceiptsLossless:receipts.length,allRawSourceBindingsExact:bound,shippedTapRefuses:true,shippedObservationsRefuse:true,productQualification:false});
 }else{
  const report=r.testReports[0].reports[0],observed=validateFullObservations(tap,suite,context,schema);assert.deepEqual(observed,report.observations);
  assert.equal(validateFullTap({stdout:tap,stderr:'',status:0,signal:null},suite).tests,61);
  runs.push({suite,successfulSiblingOnly:true,allReceiptsLossless:receipts.length,allRawSourceBindingsExact:bound,productQualification:false});
 }
 const diagnostics=rows.filter(r=>r.value.measurement==='storage-full-sql-diagnostic').map(r=>decodeFullDiagnostic(r.value));
 if(failed)assert.equal(diagnostics.length,1);
}
const paths=['tests/helpers/maintenance-verification-fixture.ts','tests/helpers/register-maintenance-verification-tests.ts','src/maintenance-builders.ts','scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/process-result.mjs','scripts/observation-gate.mjs'];
const snapshots=[];
for(const p of paths){const b=readFileSync(resolve(cwd,p)),copy=readFileSync(new URL('failed-candidate-source/'+p,here));assert(b.equals(copy));snapshots.push({path:p,bytes:b.length,digest:hash(b)});}
const out={candidate:official.candidate,runs,snapshots,confirmed:'Helper accepted first blocking-PID row then failed on null wait_event_type. Pending request subsequently resolved without refusal after finally released blocker; original observation records unauthorizedDisclosure=1.',hypothesis:'Activity and blocking-PID sampling can observe different instants. Actual failed row, query ordering and waiter PID were not logged, so root cause remains unconfirmed.',controllerTaskQualification:false,productQualification:false,retryPerformed:false};
assert.deepEqual(out,JSON.parse(readFileSync(new URL('diagnosis.json',here))));
console.log(JSON.stringify({candidate:out.candidate,runs:runs.map(r=>({suite:r.suite,receipts:r.allReceiptsLossless,failed:!!r.failedCommandRetained})),rootCauseConfirmed:false,controllerTaskQualification:false,productQualification:false}));
