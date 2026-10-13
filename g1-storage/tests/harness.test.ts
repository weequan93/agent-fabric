import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHarnessBuildCases} from './helpers/register-harness-build-tests.js';
import {registerHarnessCleanupCases} from './helpers/register-harness-cleanup-tests.js';
import {emitObservations} from './helpers/observations.js';
import {packageRoot} from './helpers/harness-copy.js';

const completed:string[]=[];
const register=(name:string,body:(t:TestContext)=>Promise<void>)=>test(name,async t=>{
 await body(t);completed.push(name);
});
const prerequisiteOrder=['contracts','authority','owned-encryption','commit-conflict','atomic-disconnect',
 'recall-ask','lifecycle-propagation','volume-draft','backup-restore','delivery-audit'];

await registerHarnessBuildCases(register,async()=>{
 // This is the real runner's fixed prerequisite workload. It builds current
 // sources and executes every non-H file through the same strict gates. There
 // is no recursive aggregate invocation or synthetic successful report.
 const runner=await import(pathToFileURL(resolve(packageRoot,'scripts/runner.mjs')).href);
 assert.equal(typeof runner.runHarnessPrerequisite,'function');
 const result=await runner.runHarnessPrerequisite();
 assert.equal(result.build.sourceAndTests,true);assert.equal(result.build.cacheCleared,true);
 assert.equal(result.reports.length,10);assert.deepEqual(result.reports.map((report:{suite:string})=>report.suite),prerequisiteOrder);
 const current=await import(pathToFileURL(resolve(packageRoot,'scripts/candidate.mjs')).href);
 assert.equal(result.candidate,current.candidateSnapshot().digest);
 for(const report of result.reports){assert(report.tests>0);assert(report.cases.length>0);}
});
const observations=await registerHarnessCleanupCases(register);
assert.deepEqual(completed,['H01','H02','H03','H04']);
// Retain the successful H04 probe's actual gate observation. Its hostile
// variants are qualified only when the same strict gate refuses them.
emitObservations(observations);
