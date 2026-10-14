import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync,writeFileSync,existsSync,watch,renameSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HarnessCopy,packageRoot} from './harness-copy.js';
import {QualificationObservationSchema} from '../../src/schema.js';
import type {SuiteObservations} from './observations.js';
type Register=(name:string,body:(t:TestContext)=>Promise<void>)=>Promise<void>;
async function usingCopy(body:(c:HarnessCopy)=>Promise<void>){const c=await HarnessCopy.create();try{
 const built=await c.run('cleanup-probe-current-strict-build','scripts/build.mjs');assert.equal(built.status,0,built.stderr);await body(c);
}finally{await c.close();}}
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
function readiness(c:HarnessCopy,operation:Promise<Awaited<ReturnType<HarnessCopy['runAsync']>>>){
 const file=resolve(c.storage,'ordinary-child-ready');
 return new Promise<{pid:number;ppid:number}>((settle,reject)=>{
  let done=false;
  const watcher=watch(c.storage,()=>check());
  const finish=(error:unknown,value?:{pid:number;ppid:number})=>{
   if(done)return;done=true;watcher.close();if(error)reject(error);else settle(value!);
  };
  const check=()=>{try{if(existsSync(file))finish(null,JSON.parse(readFileSync(file,'utf8')));}catch(error){finish(error);}};
  watcher.on('error',error=>finish(error));
  operation.then(()=>finish(new Error('Owned child exited before readiness')),error=>finish(error));
  check();
 });
}
async function ordinaryChildrenAndClose(){
 const copies:HarnessCopy[]=[];
 const operations:Promise<Awaited<ReturnType<HarnessCopy['runAsync']>>>[]=[];
 const source=readFileSync(resolve(packageRoot,'scripts/build.mjs'));
 const start=(c:HarnessCopy)=>{
  c.put('private-cleanup-driver.mjs',`import {watch,existsSync,writeFileSync,renameSync} from 'node:fs';
if(process.argv.length!==2){writeFileSync('g1-storage/unexpected-second-dispatch','unowned dispatch');throw new Error('Unexpected ordinary child args');}
await new Promise((settle,reject)=>{
 const watcher=watch('g1-storage',()=>{if(existsSync('g1-storage/ordinary-child-release')){watcher.close();settle();}});
 watcher.on('error',error=>{watcher.close();reject(error);});
 writeFileSync('g1-storage/ordinary-child-ready-writing',JSON.stringify({pid:process.pid,ppid:process.ppid}));
 renameSync('g1-storage/ordinary-child-ready-writing','g1-storage/ordinary-child-ready');
 if(existsSync('g1-storage/ordinary-child-release')){watcher.close();settle();}
});
process.stdout.write(${JSON.stringify('owned child '+c.owner+' 東京\n')});
process.stderr.write(${JSON.stringify('settled child '+c.owner+' café\n')});
`);
  const operation=c.runAsync('ordinary-owned-child','private-cleanup-driver.mjs');operations.push(operation);return operation;
 };
 try{
  const one=await HarnessCopy.create(false);copies.push(one);
  const two=await HarnessCopy.create(false);copies.push(two);
  assert.notEqual(one.owner,two.owner);assert.notEqual(realpathSync(one.root),realpathSync(two.root));
  assert.notDeepEqual([lstatSync(one.root).dev,lstatSync(one.root).ino],[lstatSync(two.root).dev,lstatSync(two.root).ino]);
  const first=start(one),firstReady=await readiness(one,first);
  assert.equal(firstReady.ppid,process.pid);assert.ok(firstReady.pid>0);
  await assert.rejects(one.runAsync('ordinary-concurrent-refused','private-cleanup-driver.mjs',['second']),/Harness copy operation already active or closed/);
  await assert.rejects(()=>one.run('ordinary-sync-concurrent-refused','private-cleanup-driver.mjs',['second']),/Harness copy operation already active or closed/);
  await assert.rejects(()=>one.runHarnessPrerequisite('ordinary-private-concurrent-refused'),/Harness copy operation already active or closed/);
  await assert.rejects(()=>one.cancelHarnessPrerequisite(),'Ordinary child cancellation cannot impersonate a private prerequisite operation');
  assert.equal(existsSync(resolve(one.storage,'unexpected-second-dispatch')),false);
  await assert.rejects(()=>one.close(),/Active harness child must settle before copy cleanup/);
  assert.equal(existsSync(one.directory),true);assert.equal(readFileSync(resolve(one.directory,'owner'),'utf8'),one.owner);
  const second=start(two),secondReady=await readiness(two,second);
  assert.equal(secondReady.ppid,process.pid);assert.notEqual(firstReady.pid,secondReady.pid);
  assert.equal(existsSync(resolve(two.storage,'unexpected-second-dispatch')),false);
  writeFileSync(resolve(one.storage,'ordinary-child-release'),'release owned first child');
  const settledFirst=await first;assert.equal(settledFirst.status,0);assert.equal(settledFirst.signal,null);assert(settledFirst.identity);
  assert.equal(Object.hasOwn(settledFirst,'nonce'),false);assert.equal(Object.hasOwn(settledFirst.identity,'nonce'),false);
  assert.equal(settledFirst.identity.pid,firstReady.pid);assert.equal(settledFirst.identity.ppid,process.pid);assert.ok(settledFirst.identity.birth);
  assert.match(settledFirst.identity.command,/private-cleanup-driver\.mjs/);
  assert.equal(settledFirst.stdout,'owned child '+one.owner+' 東京\n');assert.equal(settledFirst.stderr,'settled child '+one.owner+' café\n');
  await one.close();assert.equal(existsSync(one.directory),false);
  // The first copy's settlement/removal cannot settle or remove its sibling.
  assert.equal(existsSync(two.directory),true);assert.equal(readFileSync(resolve(two.directory,'owner'),'utf8'),two.owner);
  await assert.rejects(()=>two.close(),/Active harness child must settle before copy cleanup/);
  writeFileSync(resolve(two.storage,'ordinary-child-release'),'release owned second child');
  const settledSecond=await second;assert.equal(settledSecond.status,0);assert.equal(settledSecond.signal,null);assert(settledSecond.identity);
  assert.equal(settledSecond.identity.pid,secondReady.pid);assert.equal(settledSecond.identity.ppid,process.pid);assert.ok(settledSecond.identity.birth);
  assert.match(settledSecond.identity.command,/private-cleanup-driver\.mjs/);
  assert.equal(settledSecond.stdout,'owned child '+two.owner+' 東京\n');assert.equal(settledSecond.stderr,'settled child '+two.owner+' café\n');
  assert.doesNotMatch(settledFirst.stdout+settledFirst.stderr+settledSecond.stdout+settledSecond.stderr,/storage-test-report/);
  await two.close();assert.equal(existsSync(two.directory),false);
  assert.deepEqual(readFileSync(resolve(packageRoot,'scripts/build.mjs')),source);
 }finally{
  // Failure still releases and awaits actual children before identity cleanup.
  for(const c of copies)if(existsSync(c.storage))writeFileSync(resolve(c.storage,'ordinary-child-release'),'release after assertion failure');
  await Promise.allSettled(operations);
  for(const c of copies)if(existsSync(c.directory))await c.close();
 }
}
async function independentlyProvedCleanup(name:string,sibling:HarnessCopy){
 const c=await HarnessCopy.create(false),source=readFileSync(resolve(packageRoot,'scripts/build.mjs'));
 const marker=resolve(c.directory,'owner'),original=readFileSync(marker);
 const held=resolve(c.directory,'held-candidate'),foreign=resolve(c.root,'foreign-project-fixture');
 let restore=()=>{};
 try{
  if(name==='guards-on-failure'){
   writeFileSync(resolve(c.root,'node_modules/.cache/sibling-sentinel'),'F-H actual sibling guard failure');
   await assert.rejects(()=>c.close(),(error:unknown)=>{
    assert(error instanceof AggregateError);assert.match(error.errors.map(cause=>String(cause)).join('\n'),/F-H actual sibling guard failure/);return true;
   });
   assert.equal(existsSync(c.directory),false);
  }else if(name==='root-cleanup-failed'){
   renameSync(c.root,held);mkdirSync(c.root);writeFileSync(foreign,'foreign root must survive refused cleanup');
   restore=()=>{rmSync(c.root,{recursive:true});renameSync(held,c.root);};
   await assert.rejects(()=>c.close(),(error:unknown)=>{
    assert(error instanceof AggregateError);assert.match(error.errors.map(cause=>String(cause)).join('\n'),/Refusing substituted harness candidate root/);return true;
   });
   assert.equal(readFileSync(foreign,'utf8'),'foreign root must survive refused cleanup');assert.equal(existsSync(held),true);assert.equal(existsSync(c.directory),true);
   restore();restore=()=>{};await c.close();assert.equal(existsSync(c.directory),false);
  }else{
   writeFileSync(marker,'foreign project owner must survive refused cleanup');restore=()=>writeFileSync(marker,original);
   await assert.rejects(()=>c.close(),(error:unknown)=>{
    assert(error instanceof AggregateError);assert.match(error.errors.map(cause=>String(cause)).join('\n'),/Refusing substituted harness owner/);return true;
   });
   assert.equal(readFileSync(marker,'utf8'),'foreign project owner must survive refused cleanup');assert.equal(existsSync(c.root),true);
   restore();restore=()=>{};await c.close();assert.equal(existsSync(c.directory),false);
  }
  assert.equal(readFileSync(resolve(sibling.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+sibling.owner);
  assert.equal(readFileSync(resolve(sibling.directory,'owner'),'utf8'),sibling.owner);
  assert.deepEqual(readFileSync(resolve(packageRoot,'scripts/build.mjs')),source);
 }finally{if(existsSync(c.directory)){restore();await c.close();}}
}
/** Same thirteen frozen H03 assertions in component and full suite. */
export async function harnessCleanupSchedules(t:TestContext,prefix='H03'){
 const fixture=await import(pathToFileURL(resolve(packageRoot,'scripts/fixture.mjs')).href);
 await fixture.withStorageFixture(async()=>usingCopy(async c=>{for(const [name,reason] of rows)await t.test(prefix+'/'+name,async()=>{
  c.put('private-cleanup-driver.mjs',`import {cleanupProbe} from './scripts/harness/cleanup-probes.mjs';if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');await cleanupProbe(${JSON.stringify(name)});`);
  const r=await c.run(name,'private-cleanup-driver.mjs');assert.equal(r.status,reason?1:0,r.stderr);
  const guards=r.stdout.split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l)).filter(l=>l.measurement==='harness-probe-guards');assert.equal(guards.length,1);
  assert.equal(guards[0].unownedPreserved,true);assert.equal(guards[0].censusUnchanged,true);assert.equal(guards[0].protectedInputs,2581);
  if(reason){assert.match(r.stderr,reason);assert.equal(typeof guards[0].failure,'string');}else assert.equal(guards[0].failure,null);
  assert.doesNotMatch(r.stdout,/# skipped [1-9]|# todo [1-9]|storage-test-report/);
  if(name==='owned-child')await ordinaryChildrenAndClose();
  if(['guards-on-failure','root-cleanup-failed','instance-substitution'].includes(name))await independentlyProvedCleanup(name,c);
 });}));
}
const observations=['exact-executed-identities','missing-positive','unauthorized-disclosure','unauthorized-mutation','silent-lost-update','duplicate-canonical-effect','restricted-resurrection','ask-computer-start'];
/** Same eight frozen H04 assertions; refusal follows successful actual tests. */
export async function harnessObservationSchedules(t:TestContext,prefix='H04'){
 let qualified:SuiteObservations|undefined;
 await usingCopy(async c=>{for(const name of observations)await t.test(prefix+'/'+name,async()=>{
  c.put('private-observation-driver.mjs',`import {observationProbe} from './scripts/harness/observation-probes.mjs';if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');await observationProbe(${JSON.stringify(name)});`);
  const r=await c.run(name,'private-observation-driver.mjs');assert.equal(r.status,name==='exact-executed-identities'?0:1,r.stderr);
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
  const c=await HarnessCopy.create();try{
  const path=resolve(c.storage,'scripts/fixture.mjs'),original=readFileSync(path);
  try{for(const [kind,body,reason] of [
   ['missing-file',null,/ERR_MODULE_NOT_FOUND/],
   ['missing-export','export const unavailable=true;\n',/Mandatory owned PG\/IdP\/content fixture missing/],
   ['omitted-callback','export async function withStorageFixture(){return undefined;}\n',/Fixture omitted mandatory execution/]
  ] as [string,string|null,RegExp][]){if(body===null)rmSync(path);else writeFileSync(path,body);
   const r=await c.run('fixture-'+kind,'scripts/check-component.mjs',['commands']);assert.equal(r.status,1);assert.match(r.stderr,reason);
   assert.match(r.stdout,/strict-build/);assert.doesNotMatch(r.stdout,/storage-test-report|# skipped [1-9]|# todo [1-9]/);
   assert.equal(r.stdout.split('"measurement":"preserved-inputs"').length-1,4);
   writeFileSync(path,original);
  }}finally{writeFileSync(path,original);}
  }finally{await c.close();}
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
