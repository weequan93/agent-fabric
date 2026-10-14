import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHarnessBuildCases} from './helpers/register-harness-build-tests.js';
import {registerHarnessCleanupCases} from './helpers/register-harness-cleanup-tests.js';
import {emitObservations} from './helpers/observations.js';
import {digest} from './helpers/harness-copy.js';

const completed:string[]=[];
const register=(name:string,body:(t:TestContext)=>Promise<void>)=>test(name,async t=>{
 await body(t);completed.push(name);
});
const prerequisiteOrder=['contracts','authority','owned-encryption','commit-conflict','atomic-disconnect',
 'recall-ask','lifecycle-propagation','volume-draft','backup-restore','delivery-audit'];

await registerHarnessBuildCases(register,async(_t,c)=>{
 // Execute the actual copied runner's fixed workload through its current
 // nonce-owned child; its ordinary import has no main-entry side effects.
 const runner=await import(pathToFileURL(resolve(c.storage,'scripts/runner.mjs')).href);
 assert.equal(typeof runner.runHarnessPrerequisite,'function');
 const marker=JSON.parse(readFileSync(resolve(c.directory,'owner'),'utf8'));
 const operation=c.runHarnessPrerequisite('H02-owned-copy-fixed-workload');void operation.catch(()=>{});
 let result:Awaited<ReturnType<typeof c.runHarnessPrerequisite>>;
 try{
  const proof=await c.asyncChildReady;assert(proof,'Current private child launch proof required');
  assert.equal(Object.isFrozen(proof),true);assert(proof.pid>0);assert.equal(proof.ppid,process.pid);assert(proof.birth);
  await assert.rejects(()=>c.runAsync('H02-private-overlap-refused','scripts/build.mjs'),/Harness copy operation already active or closed/);
  await assert.rejects(()=>c.close(),/Active harness child must settle before copy cleanup/);
  result=await operation;assert.deepEqual(result.identity,proof);
 }finally{await Promise.allSettled([operation]);}
 assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);assert.equal(result.stderr,'');
 assert.match(result.nonce!,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(result.identity!.command,[process.execPath,resolve(c.storage,'scripts/runner.mjs'),result.nonce].join(' '));
 const reader=await import(pathToFileURL(resolve(c.storage,'scripts/delivery-evidence.mjs')).href);
 const allRows=reader.records(Buffer.from(result.stdout)),rows=reader.outerRecords(allRows);
 const builds=rows.filter((row:{measurement?:string})=>row.measurement==='strict-build');assert.equal(builds.length,1,'Exactly one actual copied strict build');
 const build=builds[0];assert.equal(build.sourceAndTests,true);assert.equal(build.cacheCleared,true);
 assert.equal(build.node,'v22.22.3');assert.deepEqual(build.pins,{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'});
 assert.equal(build.dependencyLockDigest,digest(readFileSync(resolve(c.storage,'pnpm-lock.yaml'))));assert.equal(build.install,'offline/frozen/ignore-scripts');
 const summaries=rows.filter((row:{measurement?:string})=>row.measurement==='storage-test-report');assert.equal(summaries.length,1,'One complete current prerequisite report');
 const summary=summaries[0];assert.equal(summary.scope,'harness-prerequisite');assert.equal(summary.diagnosticOnly,true);assert.equal(summary.externalQualification,'pending');
 assert.equal(summary.reports.length,10);assert.deepEqual(summary.reports.map((report:{suite:string})=>report.suite),prerequisiteOrder);
 const candidates=rows.filter((row:{measurement?:string})=>row.measurement==='storage-candidate');assert.equal(candidates.length,1);
 const current=await import(pathToFileURL(resolve(c.storage,'scripts/candidate.mjs')).href);
 assert.equal(candidates[0].digest,current.candidateSnapshot().digest);assert.equal(candidates[0].digest,marker.candidate.digest);assert.equal(candidates[0].files,marker.candidate.files);assert.equal(candidates[0].diagnosticOnly,true);
 for(const report of summary.reports){
  assert(report.tests>0);assert(report.cases.length>0);assert.equal(report.executions.length,report.tests);
  for(const key of ['fail','cancelled','skipped','todo'])assert.equal(report[key],0,key);
 }
 const dispatches=rows.filter((row:{measurement?:string})=>row.measurement==='storage-suite-dispatch');assert.equal(dispatches.length,10);
 const {executionSuites:suites}=await import(pathToFileURL(resolve(c.storage,'scripts/registry.mjs')).href);
 for(const [index,id] of prerequisiteOrder.entries()){
  const dispatch=dispatches[index];assert.equal(dispatch.file,resolve(c.cache,'g1-storage/tests',suites[id].file));
  assert.equal(dispatch.status,0);assert.equal(dispatch.signal,null);assert.equal(dispatch.error,null);assert.equal(dispatch.explicitTimeoutMs,null);
 }
 const transport=await import(pathToFileURL(resolve(c.storage,'scripts/measurement-transport.mjs')).href),commands=[];
 for(let index=0;index<allRows.length;index++){
  const first=allRows[index];if(reader.recordContext(first).prefix!==''||first.measurement!=='storage-measurement-transport'||first.kind!=='start'||first.binding?.phase!=='command')continue;
  assert(Number.isSafeInteger(first.count)&&first.count>0);const frames=allRows.slice(index,index+first.count+2);
  for(const frame of frames)assert.equal(reader.recordContext(frame).prefix,'','The actual private command transport retains its original outer depth');
  const {record}=transport.decodeMeasurement(frames,first.binding);commands.push(record);
  assert.equal(first.binding.candidate,marker.candidate.digest);
  assert.deepEqual(first.binding.command,{executable:process.execPath,args:[resolve(c.storage,'scripts/runner.mjs'),result.nonce],cwd:c.root});
  for(const [path,hash] of Object.entries(first.binding.sources))assert.equal(hash,digest(readFileSync(resolve(c.storage,'scripts',path))));
  index+=first.count+1;
 }
 assert.equal(commands.length,2);assert.deepEqual(commands.map(record=>record.measurement),['storage-parent-start','storage-parent-return']);
 for(const command of commands){assert.equal(command.mode,'harness-prerequisite');assert.equal(command.candidate,marker.candidate.digest);}
 assert.equal(commands[1].success,true);
});
const observations=await registerHarnessCleanupCases(register);
assert.deepEqual(completed,['H01','H02','H03','H04']);
// Retain the successful H04 probe's actual gate observation. Its hostile
// variants are qualified only when the same strict gate refuses them.
emitObservations(observations);
