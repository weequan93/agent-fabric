import assert from 'node:assert/strict';
import { readFileSync,lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cwd,root,cache,emittedTests } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { assertBaseline } from '../guards.mjs';
import { parseTap } from '../process-result.mjs';
import { validateSuiteFiles } from '../suite-execution.mjs';
import { validateObservations } from '../observation-gate.mjs';
import { components } from '../manifest.mjs';
import { hash,assertRecoveryPins,assertPrivateFile,processTools,containers } from '../recovery/ownership.mjs';
import { sourceGuards } from '../recovery/verification.mjs';
import { readJournal } from '../custodian/journal.mjs';
export const allocation=JSON.parse(readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json')));
export const predecessors=allocation.predecessors;
export const variants=allocation.variants['VOLUME-SCHEDULE/behavior'];
export const sources=['scripts/check-volume-schedule.mjs','scripts/schedule/verification.mjs','scripts/schedule/supervisor.mjs','scripts/schedule/custodian-process.mjs','scripts/schedule/full-worker.mjs','scripts/schedule/descendants.mjs','scripts/schedule/schedule.test.mjs','tests/helpers/volume-component.ts','scripts/manifest.mjs'];
export function guards(){
 assertBaseline();assertRecoveryPins();sourceGuards();
 for(const p of predecessors)assert.equal(hash(readFileSync(resolve(root,p.source))),'sha256:'+p.sourceSha256);
 const custodian=JSON.parse(readFileSync(resolve(cwd,'verification/custodian-sources.json')));
 for(const [file,digest] of Object.entries(custodian.files))assert.equal(hash(readFileSync(resolve(cwd,file))),digest);
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json')));assert.equal(pins.schemaVersion,1);assert.deepEqual(Object.keys(pins.files).sort(),sources.slice().sort());
 for(const file of sources)assert.equal(hash(readFileSync(resolve(cwd,file))),pins.files[file],'Schedule source/assertion changed: '+file);
 validateSuiteFiles(predecessors.map(p=>[p.component,components[p.component]]),resolve(cwd,'tests'),emittedTests);
 return pins;
}
export function readBound(index){
 assert.deepEqual(Object.keys(index).sort(),['path','bytes','sha256'].sort());assertPrivateFile(index.path);
 const bytes=readFileSync(index.path);assert.equal(bytes.length,index.bytes);assert.equal(hash(bytes),index.sha256);return bytes;
}
export async function validateChild(child,receipt){
 assert.equal(child.candidate,receipt.candidate);assert.equal(child.candidate,candidateSnapshot().digest);
 const p=predecessors.find(p=>p.component===child.component);assert(p);
 assert.equal(child.file,resolve(emittedTests,p.file));assert.equal(child.emittedDigest,hash(readFileSync(child.file)));
 assert.equal(child.sourceDigest,'sha256:'+p.sourceSha256);
 const i=predecessors.indexOf(p);assert.deepEqual(child.fixture,receipt.fixtures[i]);
 assert.equal(child.worker.nonce,receipt.workers[i].nonce);assert.deepEqual(child.worker,receipt.workers[i]);
 assert.equal(child.environment.owner,child.fixture.identity.owner);assert.equal(child.environment.instance,child.fixture.identity.instance);
 assert.equal(child.environment.fixtureRoot,child.fixture.path);assert.deepEqual(child.environment.roots,child.fixture.roots.map(r=>r.path));
 assert.equal(child.environment.databaseHost,'127.0.0.1');assert.equal(child.environment.databaseName,'/storage_test');assert.match(child.environment.digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(child.environment.repoRoot,root);assert.equal(child.environment.ownerRoot,cache);
 assert.equal(child.validationError,null);assert.equal(child.status,0);assert.equal(child.signal,null);assert.equal(child.error,null);
 assert.deepEqual(child.args,['--test','--test-concurrency=1','--test-reporter=tap',child.file]);
 assert(child.runner.pid>0&&child.runner.ppid===child.worker.pid);assert.equal(child.runner.command,process.execPath+' '+child.args.join(' '));
 const result={status:child.status,signal:child.signal,error:child.error,stdout:readBound(child.stdout).toString(),stderr:readBound(child.stderr).toString()};
 const report=parseTap(result,components[p.component].cases);assert.deepEqual(report.executions,p.executions);assert.equal(report.tests,p.tests);assert.deepEqual(report,child.report);
 const {QualificationObservationSchema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
 const observations=validateObservations(result.stdout,p.component,components[p.component].positives,QualificationObservationSchema);
 assert.deepEqual(observations,child.observations);
 for(const kind of ['stdout','stderr'])assert.equal(child[kind].path,resolve(receipt.journal.root.path,child.component+'-'+child.worker.nonce+'-'+kind+'.log'));
 const born=receipt.events.filter(e=>e.phase==='descendant-born'&&e.expected.pid===child.runner.pid&&e.expected.instance===child.runner.instance);assert.equal(born.length,1);
 assert.equal(born[0].expected.command,child.runner.command);assert.equal(born[0].expected.ppid,child.worker.pid);assert.equal(born[0].expected.parentInstance,child.worker.instance);assert.equal(born[0].expected.workerNonce,child.worker.nonce);
 const processRecords=result.stdout.split(/\r?\n/).filter(l=>l.startsWith('# {"measurement":"model-owned-process"')).map(l=>JSON.parse(l.slice(2)));
 const cleanupRecords=result.stdout.split(/\r?\n/).filter(l=>l.startsWith('# {"measurement":"model-owned-process-cleanup"')).map(l=>JSON.parse(l.slice(2)));
 assert.equal(processRecords.length,1);assert.equal(cleanupRecords.length,1);
 const idp=processRecords[0],idpBorn=receipt.events.filter(e=>e.phase==='descendant-born'&&e.expected.pid===idp.pid&&e.expected.instance===idp.instance);assert.equal(idpBorn.length,1);
 assert.equal(idpBorn[0].expected.command,process.execPath+' '+resolve(cache,'g1-storage/tests/helpers/idp-process.js')+' '+idp.marker);assert.equal(idpBorn[0].expected.ppid,idp.ppid);assert.equal(idpBorn[0].expected.workerNonce,child.worker.nonce);
 assert.equal(cleanupRecords[0].pid,idp.pid);assert.equal(cleanupRecords[0].instance,idp.instance);assert.equal(cleanupRecords[0].removed,true);

 assert.deepEqual(child.binding,{candidate:receipt.candidate,fixtureDigest:hash(child.fixture),environmentDigest:child.environment.digest,workerDigest:hash(child.worker),stdoutDigest:child.stdout.sha256,observationsDigest:hash(observations)});
 assert(child.started>=receipt.workStarted&&child.ended>child.started&&child.ended<=receipt.workEnded);
 return {report,observations};
}
export async function validateReceipt(receipt){
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.measurement,'storage-volume-schedule');assert.equal(receipt.status,'passed');assert.equal(receipt.candidate,candidateSnapshot().digest);
 assert.deepEqual(receipt.failures,[]);assert.deepEqual(receipt.residue,[]);assert.equal(receipt.externalQualification,'pending');
 assert.equal(receipt.children.length,3);assert.deepEqual(receipt.children.map(c=>c.component),predecessors.map(p=>p.component));
 assert.equal(receipt.workers.length,3);assert.equal(new Set(receipt.workers.map(w=>w.pid)).size,3);assert.equal(new Set(receipt.workers.map(w=>w.nonce)).size,3);
 assert.equal(receipt.fixtures.length,3);assert.deepEqual(receipt.fixtures.map(f=>f.label),['A','B','C']);
 for(const field of ['owner','instance'])assert.equal(new Set(receipt.fixtures.map(f=>f.identity[field])).size,3);
 assert.equal(new Set(receipt.fixtures.map(f=>f.path)).size,3);assert.equal(new Set(receipt.fixtures.map(f=>f.container.id)).size,3);
 assert.equal(new Set(receipt.children.map(c=>c.environment.digest)).size,3);assert.equal(new Set(receipt.children.map(c=>c.environment.databasePort)).size,3);
 const events=readJournal(receipt.journal).slice(1).map(l=>l.event);assert.deepEqual(events.filter(e=>e.phase!=='receipt'),receipt.events);
 assert.deepEqual(receipt.censusAfter,receipt.censusBefore);
 const opened=events.filter(e=>e.phase==='fixture-open'),closed=events.filter(e=>e.phase==='fixture-finally');
 assert.deepEqual(opened.map(e=>e.fixture.label),['A','B','C']);assert.deepEqual(closed.map(e=>e.label),['C','B','A']);
 for(const [i,e] of opened.entries()){
  assert.deepEqual(e.fixture,receipt.fixtures[i]);assert.deepEqual(e.before,[...receipt.censusBefore,...receipt.fixtures.slice(0,i).map(f=>f.container.id)].sort());
  assert.deepEqual(e.containers,[...e.before,e.fixture.container.id].sort());
 }
 for(const e of closed){const i=['A','B','C'].indexOf(e.label);assert.deepEqual(e.expected,opened[i].before);assert.deepEqual(e.containers,e.expected);}
 const released=events.filter(e=>e.phase==='workers-released');assert.equal(released.length,1);assert.deepEqual(released[0].workers,receipt.workers);
 const setup=events.filter(e=>e.phase==='fresh-migration-environment');assert.equal(setup.length,3);
 for(const [i,e] of setup.entries()){
  assert.equal(e.label,['A','B','C'][i]);assert.deepEqual(e.storageMigrations,[]);assert.equal(e.storageMigrationTable,null);
  assert.deepEqual(e.marker,[{owner:receipt.fixtures[i].identity.owner,instance:receipt.fixtures[i].identity.instance}]);
  assert.equal(e.environmentDigest,receipt.children[i].environment.digest);
 }
 const phaseIndex=name=>events.findIndex(e=>e.phase===name);assert(phaseIndex('workers-released')>events.findLastIndex(e=>e.phase==='worker-born'));
 assert(phaseIndex('workers-released')>events.findLastIndex(e=>e.phase==='fresh-migration-environment'));
 assert(phaseIndex('all-workers-settled')<phaseIndex('fixture-finally'));
 assert.equal(events.filter(e=>e.phase==='worker-settled').length,3);
 assert(receipt.phaseDurations.total>0&&receipt.phaseDurations.total<=235000,'Whole suite target exceeded');
 for(const n of ['setup','work','join','cleanup'])assert(receipt.phaseDurations[n]>=0);
 assert(Math.abs(receipt.phaseDurations.total-Object.values(receipt.phaseDurations).slice(0,4).reduce((a,b)=>a+b,0))<1000);
 assert(Math.max(...receipt.children.map(c=>c.started))<Math.min(...receipt.children.map(c=>c.ended)),'All full predecessor workers must overlap');
 let count=0;for(const child of receipt.children){count+=(await validateChild(child,receipt)).report.tests;}
 assert.equal(count,48);
 for(const f of receipt.fixtures)assert.equal(lstatSync(f.path,{throwIfNoEntry:false}),undefined);
 return receipt;
}

/** Read historical bindings only to measure current absence. This function has
 * no signalling/deletion capability; PID alone is never action authority. */
export async function verifyPriorFailures(){
 const index=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-prior-failures.json')));assert.equal(index.schemaVersion,1);assert.equal(index.failedRuns.length,2);
 const {census}=await processTools(),rows=census(),currentContainers=containers(),observations=[];
 for(const run of index.failedRuns){
  const receipt=JSON.parse(readBound(run.receipt));assert.equal(receipt.status,'failed');
  const processes=[{...receipt.custodian.identity,nonce:receipt.custodian.nonce},...receipt.workers.map(w=>({...w,nonce:w.nonce})),...receipt.events.filter(e=>e.phase==='descendant-born').map(e=>e.expected)];
  for(const e of processes){assert(!rows.some(r=>r.pid===e.pid&&r.instance===e.instance&&r.command===e.command),'Historical process still live');if(e.nonce)assert(!rows.some(r=>r.command.includes(e.nonce)),'Historical nonce still present');}
  for(const f of receipt.fixtures){assert.equal(lstatSync(f.path,{throwIfNoEntry:false}),undefined);assert(!currentContainers.includes(f.container.id));}
  observations.push({job:run.job,receipt:run.receipt,measurement:'current-historical-schedule-absence',observedAt:new Date().toISOString(),processes:processes.map(e=>({pid:e.pid,instance:e.instance,commandDigest:hash(e.command),currentSameInstance:false})),roots:receipt.fixtures.map(f=>({path:f.path,instance:f.identity.instance,absent:true})),containers:receipt.fixtures.map(f=>({id:f.container.id,absent:true})),signals:[],deletions:[]});
 }
 return observations;
}
