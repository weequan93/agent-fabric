import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HarnessCopy,packageRoot} from './harness-copy.js';
import {QualificationObservationSchema} from '../../src/schema.js';
import type {SuiteObservations} from './observations.js';
type Register=(name:string,body:(t:TestContext)=>Promise<void>)=>Promise<void>;
async function usingCopy(body:(c:HarnessCopy)=>Promise<void>){const c=new HarnessCopy();try{
 const built=c.run('cleanup-probe-current-strict-build','scripts/build.mjs');assert.equal(built.status,0,built.stderr);await body(c);
}finally{c.close();}}
export async function cleanupRegistration(){
 const gate=await import(pathToFileURL(resolve(packageRoot,'scripts/harness-cleanup-registration.mjs')).href);assert.equal(gate.assertHarnessCleanupRegistration().onlyPinChanged,'scripts/manifest.mjs');
 const bytes=readFileSync(resolve(packageRoot,'scripts/manifest.mjs'),'utf8');for(const b of [bytes+'\n',bytes.replace('"H03/real-census"','"H03/forged"')])assert.throws(()=>gate.assertHarnessCleanupAdditiveRegistry(b));
 const {suites}=await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href),required=JSON.parse(readFileSync(resolve(packageRoot,'verification/required-variants-v1.json'),'utf8'));
 for(const id of ['H03','H04'])assert.deepEqual(suites.harness.variants[id],required.cases[id]);
}
const rows:[string,RegExp|null][]=[
 ['real-census',null],['loopback',null],['owned-child',null],['cached-pg',null],
 ['census-denied',/Real process census unavailable/],['loopback-denied',/Storage fixture is not loopback only/],['pg-unavailable',/Owned storage Docker image failed/],
 ['child-cleanup-failed',/Owned child cleanup failed: CLEANUP_UNPROVEN/],['root-cleanup-failed',/Refusing substituted or unowned storage root/],
 ['container-cleanup-failed',/Owned storage Docker rm failed/],['symlink-cache',/Symlinked own build cache refused/],
 ['instance-substitution',/Refusing unowned storage container/],['guards-on-failure',/F-H actual callback failure/]
];
/** Same thirteen frozen H03 assertions in component and full suite. */
export async function harnessCleanupSchedules(t:TestContext,prefix='H03'){
 const fixture=await import(pathToFileURL(resolve(packageRoot,'scripts/fixture.mjs')).href);
 await fixture.withStorageFixture(async()=>usingCopy(async c=>{for(const [name,reason] of rows)await t.test(prefix+'/'+name,()=>{
  c.put('private-cleanup-driver.mjs',`import {cleanupProbe} from './scripts/harness/cleanup-probes.mjs';if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');await cleanupProbe(${JSON.stringify(name)});`);
  const r=c.run(name,'private-cleanup-driver.mjs');assert.equal(r.status,reason?1:0,r.stderr);
  const guards=r.stdout.split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)).filter(l=>l.measurement==='harness-probe-guards');assert.equal(guards.length,1);
  assert.equal(guards[0].unownedPreserved,true);assert.equal(guards[0].censusUnchanged,true);assert.equal(guards[0].protectedInputs,2581);
  if(reason){assert.match(r.stderr,reason);assert.equal(typeof guards[0].failure,'string');}else assert.equal(guards[0].failure,null);
  assert.doesNotMatch(r.stdout,/# skipped [1-9]|# todo [1-9]|storage-test-report/);
 });}));
}
const observations=['exact-executed-identities','missing-positive','unauthorized-disclosure','unauthorized-mutation','silent-lost-update','duplicate-canonical-effect','restricted-resurrection','ask-computer-start'];
/** Same eight frozen H04 assertions; refusal follows successful actual tests. */
export async function harnessObservationSchedules(t:TestContext,prefix='H04'){
 let qualified:SuiteObservations|undefined;
 await usingCopy(async c=>{for(const name of observations)await t.test(prefix+'/'+name,()=>{
  c.put('private-observation-driver.mjs',`import {observationProbe} from './scripts/harness/observation-probes.mjs';if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');await observationProbe(${JSON.stringify(name)});`);
  const r=c.run(name,'private-observation-driver.mjs');assert.equal(r.status,name==='exact-executed-identities'?0:1,r.stderr);
  assert.match(r.stdout,/"measurement":"harness-observation-executed"/);assert.match(r.stdout,/# tests 2/);assert.match(r.stdout,/# fail 0/);assert.match(r.stdout,/# skipped 0/);
  if(name==='exact-executed-identities')assert.match(r.stdout,/harness-observation-gate-pass/);
  else{assert.match(r.stderr,/Useful positive\/zero-violation qualification gate failed/);assert.doesNotMatch(r.stdout,/harness-observation-gate-pass/);}
  const line=r.stdout.split('\n').find(l=>l.startsWith('# {"schemaVersion":1,"measurement":"storage-observations"'));assert(line);const actual=JSON.parse(line.slice(2));
  const field:Record<string,string>={'unauthorized-disclosure':'unauthorizedDisclosure','unauthorized-mutation':'unauthorizedMutation','silent-lost-update':'silentLostUpdate','duplicate-canonical-effect':'duplicateCanonicalEffect','restricted-resurrection':'restrictedResurrection','ask-computer-start':'askComputerStart'};
  assert.equal(actual.positives.harness,name==='missing-positive'?0:1);for(const [k,v] of Object.entries(actual.violations))assert.equal(v,k===field[name]?1:0);
  if(name==='exact-executed-identities')qualified=QualificationObservationSchema.parse(actual);
 });});
 assert(qualified,'Successful actual harness observation required');return qualified;
}
export async function missingFixtureNeverSkipped(t:TestContext,prefix='HARNESS-CLEANUP'){
 await t.test(prefix+'/missing-fixture-never-skipped',async()=>{
  // Each hostile checker command clears the copy's cache and builds current
  // sources before importing the fixture. No preparatory emission is needed.
  const c=new HarnessCopy();try{
  const path=resolve(c.storage,'scripts/fixture.mjs'),original=readFileSync(path);
  try{for(const [kind,body,reason] of [
   ['missing-file',null,/ERR_MODULE_NOT_FOUND/],
   ['missing-export','export const unavailable=true;\n',/Mandatory owned PG\/IdP\/content fixture missing/],
   ['omitted-callback','export async function withStorageFixture(){return undefined;}\n',/Fixture omitted mandatory execution/]
  ] as [string,string|null,RegExp][]){if(body===null)rmSync(path);else writeFileSync(path,body);
   const r=c.run('fixture-'+kind,'scripts/check-component.mjs',['commands']);assert.equal(r.status,1);assert.match(r.stderr,reason);
   assert.match(r.stdout,/strict-build/);assert.doesNotMatch(r.stdout,/storage-test-report|# skipped [1-9]|# todo [1-9]/);
   assert.equal(r.stdout.split('"measurement":"preserved-inputs"').length-1,4);
   writeFileSync(path,original);
  }}finally{writeFileSync(path,original);}
  }finally{c.close();}
 });
}
export function registerHarnessCleanupDiagnostic(){test('HARNESS-CLEANUP/behavior',async t=>{
 await t.test('HARNESS-CLEANUP/registration-preservation',cleanupRegistration);
 await harnessCleanupSchedules(t,'HARNESS-CLEANUP');await harnessObservationSchedules(t,'HARNESS-CLEANUP');await missingFixtureNeverSkipped(t);
});}
export async function registerHarnessCleanupCases(register:Register){
 let qualified:SuiteObservations|undefined;
 await register('H03',async t=>{await cleanupRegistration();await harnessCleanupSchedules(t);await missingFixtureNeverSkipped(t,'H03');});
 await register('H04',async t=>{qualified=await harnessObservationSchedules(t);});
 assert(qualified,'Full H04 must complete its actual observation assertions');return qualified;
}
