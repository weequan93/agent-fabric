import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,rmSync,lstatSync,existsSync,readdirSync } from 'node:fs';
import { resolve,relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HarnessCopy,digest,packageRoot } from './harness-copy.js';

type Register=(name:string,body:(t:TestContext)=>Promise<void>)=>Promise<void>;
const copy=async(body:(c:HarnessCopy)=>void|Promise<void>,dependencies=true)=>{const c=new HarnessCopy(dependencies);try{await body(c);}finally{c.close();}};
const passed=(r:ReturnType<HarnessCopy['run']>)=>{assert.equal(r.status,0,r.stderr);return r;};
const refused=(r:ReturnType<HarnessCopy['run']>,reason:RegExp)=>{assert.equal(r.status,1);assert.match(r.stdout+'\n'+r.stderr,reason);return r;};
const plantStale=(c:HarnessCopy)=>{
 const canary=c.put('stale-executed','must remain unchanged');
 c.put('node_modules/.cache/storage-build/g1-storage/tests/contracts.test.js',`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(canary)},'executed stale code');`);
 return ()=>assert.equal(readFileSync(canary,'utf8'),'must remain unchanged');
};

export async function harnessRegistration(){
 const gate=await import(pathToFileURL(resolve(packageRoot,'scripts/harness-build-registration.mjs')).href);
 const bytes=readFileSync(resolve(packageRoot,'scripts/manifest.mjs'),'utf8');
 assert.equal(gate.assertHarnessBuildRegistration().onlyPinChanged,'scripts/manifest.mjs');
 for(const b of [bytes+'\n',bytes.replace('"C01/roundtrip"','"C01/forged"'),bytes.replace('"harness-build":','"fake-build":')])assert.throws(()=>gate.assertHarnessBuildAdditiveRegistry(b));
 const {suites}=await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href);
 const required=JSON.parse(readFileSync(resolve(packageRoot,'verification/required-variants-v1.json'),'utf8'));
 assert.deepEqual(suites.harness.variants.H02,required.cases.H02);
 assert.equal(suites.harness.variants.H02.includes('H02/good-full-run'),true);
}

/** These exact assertions serve diagnostic and full H01 entry points. */
export async function harnessBuildSchedules(t:TestContext,prefix='H01'){
 await t.test(prefix+'/fresh-build',()=>copy(c=>{
  const sentinel=c.put('node_modules/.cache/storage-build/stale','old emission');
  const r=passed(c.run('fresh-build','scripts/build.mjs'));
  assert.equal(existsSync(sentinel),false);assert.match(r.stdout,/"cacheCleared":true/);
  for(const file of ['src/schema','src/owners','tests/contracts.test','tests/components/harness-build.component.test'])for(const suffix of ['.js','.d.ts','.js.map'])assert.equal(lstatSync(resolve(c.cache,'g1-storage',file+suffix)).isFile(),true);
  const checked=passed(c.run('fresh-built-contracts-check','scripts/check-component.mjs',['contracts']));
  assert.match(checked.stdout,/"measurement":"storage-test-report"/);assert.match(checked.stdout,/"tests":12/);
 }));
 await t.test(prefix+'/compiler-failure',()=>copy(c=>{
  const stale=plantStale(c);c.put('src/hostile-build.ts','export const wrong: string = 42;\n');
  refused(c.run('compiler-failure','scripts/build.mjs'),/TS2322/);stale();assert.equal(existsSync(c.cache),false);
 }));
 await t.test(prefix+'/deleted-source',()=>copy(c=>{
  const stale=plantStale(c);rmSync(resolve(c.storage,'src/schema.ts'));
  refused(c.run('deleted-source-full-check','scripts/check.mjs'),/TS2307/);stale();assert.equal(existsSync(c.cache),false);
 }));
 await t.test(prefix+'/stale-output',()=>copy(c=>{
  const stale=plantStale(c);const r=passed(c.run('replace-stale-build','scripts/build.mjs'));stale();
  assert.match(r.stdout,/"sourceAndTests":true/);
  const source=readFileSync(resolve(c.cache,'g1-storage/tests/contracts.test.js'),'utf8');assert.match(source,/registerContractTests/);assert.doesNotMatch(source,/executed stale code/);
 }));
 await t.test(prefix+'/owner-emission',()=>copy(c=>{
  passed(c.run('owner-emission','scripts/build.mjs'));
  const assets=JSON.parse(readFileSync(resolve(c.storage,'verification/owner-migration-assets.json'),'utf8'));
  assert.equal(Object.keys(assets.files).length,24);
  for(const [name,hash] of Object.entries(assets.files))assert.equal(digest(readFileSync(resolve(c.cache,name))).slice(7),hash);
  let sources=0;
  const emissions=(directory:string)=>{for(const name of readdirSync(directory)){
   const file=resolve(directory,name);if(lstatSync(file).isDirectory())emissions(file);
   else if(name.endsWith('.ts')&&!name.endsWith('.d.ts')){sources++;for(const suffix of ['.js','.d.ts','.js.map'])assert.ok(readFileSync(resolve(c.cache,relative(c.root,file).replace(/\.ts$/,suffix))).length>0);}
  }};
  for(const owner of ['g1-foundations','g1-identity','g1-recovery','g1-model'])emissions(resolve(c.root,owner,'src'));
  for(const owner of readdirSync(resolve(c.root,'engine')))emissions(resolve(c.root,'engine',owner,'src'));
  assert.ok(sources>50);
 }));
 await t.test(prefix+'/dependency-pins',()=>copy(c=>{
  const lock=readFileSync(resolve(c.storage,'pnpm-lock.yaml'));
  const r=passed(c.run('dependency-pins','scripts/build.mjs'));assert.deepEqual(readFileSync(resolve(c.storage,'pnpm-lock.yaml')),lock);
  assert.match(r.stdout,/"node":"v22.22.3"/);assert.match(r.stdout,/"dependencies":18/);
  const pkg=JSON.parse(readFileSync(resolve(c.storage,'package.json'),'utf8'));
  for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies}))assert.equal(JSON.parse(readFileSync(resolve(c.storage,'node_modules',name,'package.json'),'utf8')).version,version);
  pkg.devDependencies.typescript='5.9.2';writeFileSync(resolve(c.storage,'package.json'),JSON.stringify(pkg));
  refused(c.run('changed-package-pin','scripts/build.mjs'),/Independent dependency pins changed/);
  pkg.devDependencies.typescript='5.9.3';writeFileSync(resolve(c.storage,'package.json'),JSON.stringify(pkg));
  writeFileSync(resolve(c.storage,'pnpm-lock.yaml'),lock.toString().replaceAll('typescript@5.9.3','typescript@5.9.2'));
  refused(c.run('changed-lock-pin','scripts/build.mjs'),/ERR_PNPM|Independent dependency metadata mismatch/);
 }));
}

// Fixed private nonrecursive driver exists only within F-H. It imports the
// shipped file/execution gates byte-for-byte and has no selection/bypass flag.
const driver=`import {resolve} from 'node:path';
import {validateSuiteFiles,executeSuite} from './scripts/suite-execution.mjs';
if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');
 validateSuiteFiles([['probe',{file:'probe.test.js'}]],resolve('source'),resolve('emitted'));
 const output=await executeSuite(resolve('emitted/probe.test.js'),['PROBE'],{}, {PROBE:['PROBE/required']});
 console.log(JSON.stringify({measurement:'harness-private-gate-pass',report:output.report}));
`;
const good=`import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('PROBE',async t=>{await t.test('PROBE/required',()=>assert.equal(readFileSync('g1-storage/probe-input','utf8'),'actual-input'));});\n`;
function prepare(c:HarnessCopy,body=good){
 c.put('private-driver.mjs',driver);c.put('source/probe.test.ts','export {};',true);
 // The isolated root is ESM, like the real candidate package.
 c.put('emitted/package.json','{"type":"module"}',true);c.put('emitted/probe.test.js',body,true);c.put('probe-input','actual-input');
}

/** H02/good-full-run is deliberately separate: diagnostic execution cannot
 * qualify it. Full H02 below always registers it and requires its real owner. */
export async function harnessResultNegativeSchedules(t:TestContext,prefix='H02'){
 await t.test(prefix+'/removed-suite',()=>copy(c=>{
  prepare(c);rmSync(resolve(c.root,'source/probe.test.ts'));
  refused(c.run('source-suite-missing','private-driver.mjs'),/Mandatory suite missing: probe/);
  prepare(c);rmSync(resolve(c.root,'emitted/probe.test.js'));
  refused(c.run('emitted-suite-missing','private-driver.mjs'),/Mandatory suite missing: probe/);
  // Real corrupted-copy full command, not solely the private gate driver.
  plantStale(c);rmSync(resolve(c.storage,'tests/contracts.test.ts'));
  const r=refused(c.run('removed-suite-full-check','scripts/check.mjs'),/ENOENT|Mandatory current storage emission missing/);
  assert.match(r.stdout,/"measurement":"storage-candidate"/);assert.doesNotMatch(r.stdout,/"measurement":"storage-test-report"/);
 }));
 const schedules:[string,string,RegExp][]=[
  ['removed-case',good.replace("test('PROBE'","test('OTHER'"),/Exact mandatory executed identities required/],
  ['empty-suite',"import test from 'node:test';\n",/Exact mandatory executed identities required/],
  ['failure',good.replace("'actual-input'","'wrong-input'"),/node:test failed \(1\)/],
  ['cancellation',"import test from 'node:test';test('PROBE',()=>new Promise(()=>{}));\n",/node:test failed \(1\)/],
  ['skip',"import test from 'node:test';test('PROBE',{skip:true},()=>{});\n",/Failed\/skipped\/TODO TAP/],
  ['todo',"import test from 'node:test';test('PROBE',{todo:true},()=>{});\n",/Failed\/skipped\/TODO TAP/],
  ['forged-label',"console.log('PROBE H02/good-full-run passed');\n",/Exact mandatory executed identities required/],
  ['forged-totals',good+"console.log('tests 2\\npass 2\\nfail 0\\ncancelled 0\\nskipped 0\\ntodo 0');\n",/Duplicate TAP summary|Contradictory TAP summary/],
  ['missing-variant',good.replaceAll('PROBE/required','PROBE/other'),/Mandatory executed variant missing\/duplicated/]
 ];
 for(const [name,body,reason] of schedules)await t.test(prefix+'/'+name,()=>copy(c=>{
  prepare(c);const positive=passed(c.run(name+'-positive-control','private-driver.mjs'));assert.match(positive.stdout,/"tests":2/);
  c.put('emitted/probe.test.js',body,true);const bad=refused(c.run(name,'private-driver.mjs'),reason);
  if(name==='failure')assert.match(bad.stdout,/ERR_ASSERTION/);
  if(name==='cancellation')assert.match(bad.stdout,/# cancelled 1/);
  if(name==='skip')assert.match(bad.stdout,/# skipped 1/);
  if(name==='todo')assert.match(bad.stdout,/# todo 1/);
  assert.doesNotMatch(bad.stdout,/"measurement":"harness-private-gate-pass"/);
 },false));
 await t.test(prefix+'/unknown-argument',()=>copy(c=>{
  for(const [script,args] of [
   ['scripts/check.mjs',['extra']],['scripts/check-slice.mjs',['contracts','extra']],
   ['scripts/check-slice.mjs',['unknown']],['scripts/check-component.mjs',['harness-build','extra']],
   ['scripts/check-component.mjs',['unknown']],['scripts/build.mjs',['extra']]
  ] as [string,string[]][]){const r=refused(c.run('closed-cli',script,args),/Unknown\/extra checker argument|Build accepts no arguments/);assert.doesNotMatch(r.stdout,/strict-build|storage-test-report/);}
 },false));
}

export function registerHarnessBuildDiagnostic(){
 test('HARNESS-BUILD/behavior',async t=>{
  await t.test('HARNESS-BUILD/registration-preservation',harnessRegistration);
  await harnessBuildSchedules(t,'HARNESS-BUILD');await harnessResultNegativeSchedules(t,'HARNESS-BUILD');
 });
}
/** Terminal full suite must supply a nonrecursive real full-suite driver; no
 * default, omitted case or synthetic success can complete frozen H02. */
export async function registerHarnessBuildCases(register:Register,goodFullRun:(t:TestContext)=>Promise<void>){
 await register('H01',async t=>{await harnessRegistration();await harnessBuildSchedules(t);});
 await register('H02',async t=>{await harnessResultNegativeSchedules(t);await t.test('H02/good-full-run',async child=>{
  const {suites}=await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href);
  const gate=await import(pathToFileURL(resolve(packageRoot,'scripts/suite-execution.mjs')).href);
  const source=resolve(packageRoot,'tests'),emitted=resolve(packageRoot,'node_modules/.cache/storage-build/g1-storage/tests');
  gate.validateSuiteFiles(Object.entries(suites),source,emitted);
  for(const suite of Object.values(suites) as {file:string}[])for(const file of [resolve(source,suite.file.replace(/\.js$/,'.ts')),resolve(emitted,suite.file)])assert.ok(readFileSync(file).length>0,'Mandatory full-suite content is empty');
  assert.equal(typeof goodFullRun,'function','Mandatory terminal full-suite execution owner missing');await goodFullRun(child);
 });});
}
