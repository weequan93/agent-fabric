import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, lstatSync, symlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { root, cwd } from './paths.mjs';
import { suites } from './manifest.mjs';
import { executeSuite, validateSuiteFiles } from './suite-execution.mjs';
import { parseTap } from './process-result.mjs';
import { sha } from './qualification-artifacts.mjs';
const markerName='.owned-f04-sabotage';
// Fresh separate test processes must not inherit node:test child runner context.
const subprocessEnv={...process.env};delete subprocessEnv.NODE_TEST_CONTEXT;
export function withOwnedCopy(work) {
 const path=mkdtempSync(resolve(tmpdir(),'f04-qualification-')),owner=randomUUID();writeFileSync(resolve(path,markerName),owner);
 try{return work(path);}finally{assert.equal(lstatSync(path).isSymbolicLink(),false);assert.equal(readFileSync(resolve(path,markerName),'utf8'),owner);rmSync(path,{recursive:true});assert.throws(()=>lstatSync(path));}
}
function observation(name,result) {
 assert.notEqual(result.status,0,name);assert.equal(result.signal,null,name);assert.equal(result.error,undefined,name);
 console.log(JSON.stringify({measurement:'qualification-sabotage',label:'synthetic-sabotage-test-data',name,exitCode:result.status,stdoutBytes:Buffer.byteLength(result.stdout),stdoutSha256:sha(result.stdout),stderrBytes:Buffer.byteLength(result.stderr),stderrSha256:sha(result.stderr)}));
}
export function buildSabotage() {
 withOwnedCopy(copy=>{
  const baseline=JSON.parse(readFileSync(resolve(cwd,'verification/preserved-inputs.json'),'utf8'));
  for(const path of Object.keys(baseline.files)){mkdirSync(dirname(resolve(copy,path)),{recursive:true});cpSync(resolve(root,path),resolve(copy,path));}
  cpSync(cwd,resolve(copy,'g1-model'),{recursive:true,filter:p=>!p.includes('/node_modules')&&!p.includes('/evidence')});
  cpSync(resolve(cwd,'node_modules'),resolve(copy,'g1-model/node_modules'),{recursive:true,filter:p=>!p.includes('/.cache')});
  const own=resolve(copy,'g1-model'),check=(args=['contracts'])=>spawnSync(process.execPath,[resolve(own,'scripts/check-slice.mjs'),...args],{cwd:copy,env:subprocessEnv,encoding:'utf8',timeout:90_000,maxBuffer:8*1024*1024});
  const good=check();assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/strict-build/);assert.match(good.stdout,/model-test-report/);
  for(const [name,path] of [['source-type-error','src/sabotage.ts'],['test-type-error','tests/sabotage.ts']]) {
   writeFileSync(resolve(own,path),'const mustBeNumber: number = "wrong"; export {};\n');
   const result=check();observation(name,result);assert.match(result.stdout,/error TS2322/);rmSync(resolve(own,path));
  }
  writeFileSync(resolve(own,'src/sabotage.ts'),'const mustBeNumber: number = "wrong"; export {};\n');
  const stale=resolve(own,'node_modules/.cache/model-build/g1-model/tests/contracts.test.js');mkdirSync(dirname(stale),{recursive:true});writeFileSync(stale,'console.log("all cases pass");');
  const failed=check();observation('stale-cache-cannot-mask-compile',failed);assert.match(failed.stdout,/error TS2322/);assert.throws(()=>lstatSync(stale));rmSync(resolve(own,'src/sabotage.ts'));
  rmSync(resolve(own,'tests/contracts.test.ts'));const missing=check();observation('actual-checker-missing-mandatory-suite',missing);assert.match(missing.stderr,/Mandatory suite missing/);
  observation('actual-checker-unknown-argument',check(['contracts','extra']));
  // Refuse a foreign/symlink cache parent before any destructive clearing.
  const target=resolve(copy,'foreign-cache');mkdirSync(target);writeFileSync(resolve(target,'keep'),'foreign bytes');rmSync(resolve(own,'node_modules/.cache'),{recursive:true,force:true});symlinkSync(target,resolve(own,'node_modules/.cache'));
  const unsafe=spawnSync(process.execPath,[resolve(own,'scripts/build.mjs')],{cwd:copy,env:subprocessEnv,encoding:'utf8',timeout:90_000,maxBuffer:8*1024*1024});observation('symlink-cache-refused',unsafe);assert.match(unsafe.stderr,/Symlinked own build cache refused/);assert.equal(readFileSync(resolve(target,'keep'),'utf8'),'foreign bytes');
 });
}
export function parserSabotage() {
 withOwnedCopy(copy=>{
  const seam=JSON.stringify('file://'+resolve(cwd,'scripts/suite-execution.mjs'));
  const validateChild=code=>spawnSync(process.execPath,['--input-type=module','-e','import {executeSuite,validateSuiteFiles} from '+seam+';'+code],{cwd:copy,env:subprocessEnv,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  const source=resolve(copy,'tests'),emitted=resolve(copy,'emitted');mkdirSync(source);mkdirSync(emitted);
  const selected=Object.entries(suites);
  for(const [,s] of selected){writeFileSync(resolve(source,s.file.replace(/\.js$/,'.ts')),'// disposable synthetic source');writeFileSync(resolve(emitted,s.file),'// disposable synthetic emission');}
  validateSuiteFiles(selected,source,emitted);
  for(const [id,s] of selected)for(const kind of ['source','emitted']){
   const file=resolve(kind==='source'?source:emitted,kind==='source'?s.file.replace(/\.js$/,'.ts'):s.file),bytes=readFileSync(file);rmSync(file);assert.throws(()=>validateSuiteFiles(selected,source,emitted),/Mandatory suite missing/,id+'/'+kind);
   const refused=validateChild('validateSuiteFiles('+JSON.stringify(selected)+','+JSON.stringify(source)+','+JSON.stringify(emitted)+');');observation('missing-suite-'+id+'-'+kind,refused);assert.match(refused.stderr,/Mandatory suite missing/);writeFileSync(file,bytes);
  }
  const file=resolve(copy,'synthetic.test.mjs'),code=names=>'import test from "node:test"; import assert from "node:assert/strict";\n'+names.map(n=>'test('+JSON.stringify(n)+',()=>assert.equal(1,1));').join('\n');
  for(const [id,s] of selected)for(const missing of s.cases){writeFileSync(file,code(s.cases.filter(c=>c!==missing)));
   const refused=validateChild('executeSuite('+JSON.stringify(file)+','+JSON.stringify(s.cases)+');');observation('missing-case-'+id+'-'+missing,refused);assert.match(refused.stderr,/Exact mandatory executed identities required/);
  }
  for(const [name,body] of [
   ['empty',''],['label-only','console.log("# Subtest: Q01\\n# all cases pass");'],
   ['failure','test("Q01",()=>assert.equal(1,2));'],['skip','test("Q01",{skip:true},()=>assert.equal(1,1));'],['TODO','test("Q01",{todo:true},()=>assert.equal(1,1));']
  ]){writeFileSync(file,'import test from "node:test";import assert from "node:assert/strict";'+body);const refused=validateChild('executeSuite('+JSON.stringify(file)+',["Q01"]);');observation('bad-process-'+name,refused);}
  writeFileSync(file,code(['Q01']));const {result}=executeSuite(file,['Q01'],{cwd:copy,env:subprocessEnv,timeout:5000});
  const mutations=[
   ['summary-pass',s=>s.replace('# pass 1','# pass 2')],['summary-failure',s=>s.replace('# fail 0','# fail 1')],['summary-tests',s=>s.replace('# tests 1','# tests 0')],['summary-skip',s=>s.replace('# skipped 0','# skipped 1')],['summary-TODO',s=>s.replace('# todo 0','# todo 1')],
   ['result-identity',s=>s.replace('ok 1 - Q01','ok 1 - fake')],['plan',s=>s.replace('1..1','1..2')],['duplicate-summary',s=>s+'# pass 1\n'],['extra-TAP',s=>s+'TAP version 13\n'],['post-plan-test',s=>s+'# Subtest: Q02\nok 2 - Q02\n'],['bail',s=>s+'Bail out!\n']
  ];
  for(const [name,mutate] of mutations)assert.throws(()=>parseTap({...result,stdout:mutate(result.stdout)},['Q01']),undefined,name);
  for(const status of [1,null])assert.throws(()=>parseTap({...result,status},['Q01']));assert.throws(()=>parseTap({...result,signal:'SIGTERM'},['Q01']));assert.throws(()=>parseTap({...result,error:new Error('execution failed')},['Q01']));
  console.log(JSON.stringify({measurement:'qualification-parser-sabotage',label:'synthetic-sabotage-test-data',missingSuites:16,missingCases:65,invalidProcesses:5,contradictoryStreams:mutations.length,recursive:false}));
 });
}
export function metadataSabotage() {
 withOwnedCopy(copy=>{
  const own=resolve(copy,'g1-model'),metadata=JSON.parse(readFileSync(resolve(cwd,'dependencies.json'),'utf8'));
  mkdirSync(own);cpSync(resolve(cwd,'scripts'),resolve(own,'scripts'),{recursive:true});cpSync(resolve(cwd,'notices'),resolve(own,'notices'),{recursive:true});
  cpSync(resolve(cwd,'dependencies.json'),resolve(own,'dependencies.json'));cpSync(resolve(cwd,'pnpm-lock.yaml'),resolve(own,'pnpm-lock.yaml'));
  for(const d of metadata.dependencies)for(const name of ['package.json',...d.notices.map(n=>n.installedName)]){const path=resolve(own,d.installedPath,name);mkdirSync(dirname(path),{recursive:true});cpSync(resolve(cwd,d.installedPath,name),path);}
  const command=()=>spawnSync(process.execPath,['--input-type=module','-e','import {assertDependencyMetadata} from '+JSON.stringify('file://'+resolve(own,'scripts/dependencies.mjs'))+';assertDependencyMetadata();'],{encoding:'utf8',env:subprocessEnv,cwd:copy,timeout:5000,maxBuffer:1024*1024});
  const good=command();assert.equal(good.status,0,good.stderr);
  const pg=metadata.dependencies.find(d=>d.name==='pg'),pkg=resolve(own,pg.installedPath,'package.json'),notice=resolve(own,pg.notices[0].path),lock=resolve(own,'pnpm-lock.yaml');
  for(const [name,path,mutate] of [['installed-version',pkg,b=>{const p=JSON.parse(b);p.version='0.0.0';return JSON.stringify(p);}],['installed-license',pkg,b=>{const p=JSON.parse(b);p.license='invented';return JSON.stringify(p);}],['notice-bytes',notice,b=>b+'altered'],['frozen-lock',lock,b=>b+'\n# altered lock']]) {
   const bytes=readFileSync(path);writeFileSync(path,mutate(bytes.toString('utf8')));observation('metadata-'+name,command());writeFileSync(path,bytes);
  }
  const path=resolve(own,'dependencies.json'),bytes=readFileSync(path);
  for(const [name,mutate] of [['status-clearance',d=>d.dependencies[0].securityStatus='clean'],['patch',d=>d.dependencies[0].localPatches=['unauthorized']],['date',d=>d.observedAt='old'],['image',d=>d.runtimeImage.downloadAllowed=true],['update-responsibility',d=>d.maintenance.securityAssessment='author']]) {
   const d=JSON.parse(bytes);mutate(d);writeFileSync(path,JSON.stringify(d));observation('metadata-'+name,command());writeFileSync(path,bytes);
  }
  assert.equal(command().status,0);
 });
}
