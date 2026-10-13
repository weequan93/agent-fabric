import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { openSync,writeSync,fsyncSync,closeSync,readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cache,emittedTests } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { parseTap } from '../process-result.mjs';
import { validateObservations } from '../observation-gate.mjs';
import { components } from '../manifest.mjs';
import { hash,processTools } from '../recovery/ownership.mjs';
import { durableFile } from '../recovery/journal.mjs';
import { readJournal } from '../custodian/journal.mjs';
import { predecessors } from './verification.mjs';
const config=JSON.parse(process.env.FABRIC_CUSTODIAN_CONFIG);delete process.env.FABRIC_CUSTODIAN_CONFIG;
assert.equal(process.argv.length,3);assert.deepEqual(Object.keys(config).sort(),['operation','component','candidate','fixture','journal','marker'].sort());
assert.equal(config.operation,'complete-predecessor');assert.equal(config.marker,process.argv[2]);readJournal(config.journal);
const p=predecessors.find(p=>p.component===config.component);assert(p);assert.equal(candidateSnapshot().digest,config.candidate);
const {census,waitUntil}=await processTools(),identity=census().find(r=>r.pid===process.pid),parent=census().find(r=>r.pid===process.ppid);assert(identity&&parent);
const worker={pid:process.pid,nonce:config.marker,instance:identity.instance,command:identity.command,parentPid:parent.pid,parentInstance:parent.instance};
let begin=false,finish=false,disconnected=false;
process.on('message',m=>{if(m.kind==='begin')begin=true;if(m.kind==='finish')finish=true;});process.on('disconnect',()=>disconnected=true);
console.log(JSON.stringify({pid:process.pid,marker:config.marker}));
await waitUntil(async()=>{assert(!disconnected,'Custodian disconnected before release');return begin;},'durably journalled complete worker release',8000);
const file=resolve(emittedTests,p.file),args=['--test','--test-concurrency=1','--test-reporter=tap',file];
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const url=new URL(env.STORAGE_DATABASE_URL);
const environment={owner:env.STORAGE_FIXTURE_OWNER,instance:env.STORAGE_FIXTURE_INSTANCE,fixtureRoot:env.STORAGE_FIXTURE_ROOT,roots:config.fixture.roots.map(r=>r.path),repoRoot:env.STORAGE_REPO_ROOT,ownerRoot:env.STORAGE_OWNER_ROOT,databaseHost:url.hostname,databaseName:url.pathname,databasePort:url.port,digest:hash(Object.fromEntries(Object.entries(env).filter(([k])=>k.startsWith('STORAGE_')).sort(([a],[b])=>a.localeCompare(b))))};
const started=performance.now(),startedGlobal=performance.timeOrigin+started;
const streams={};let total=0,error=null;
for(const kind of ['stdout','stderr']){
 const path=resolve(config.journal.root.path,config.component+'-'+config.marker+'-'+kind+'.log');durableFile(path,'');streams[kind]={path,fd:openSync(path,'a')};
}
const child=spawn(process.execPath,args,{env,cwd:env.STORAGE_REPO_ROOT,stdio:['ignore','pipe','pipe']});
child.on('error',e=>error={code:e.code??'SPAWN_ERROR',message:'Complete predecessor spawn failed'});
for(const kind of ['stdout','stderr'])child[kind].on('data',b=>{
 total+=b.length;if(total>32*1024*1024){error={code:'OUTPUT_BOUND',message:'32MiB predecessor output bound exceeded'};return;}
 writeSync(streams[kind].fd,b);fsyncSync(streams[kind].fd);
});
const closed=new Promise(r=>child.once('close',(status,signal)=>r({status,signal})));
await waitUntil(async()=>census().some(r=>r.pid===child.pid&&r.command===process.execPath+' '+args.join(' ')),'complete runner exec command',3000);
const runner=census().find(r=>r.pid===child.pid);assert(runner);assert.equal(runner.ppid,process.pid);assert.equal(runner.command,process.execPath+' '+args.join(' '));
if(process.connected)process.send({kind:'runner-born',worker,runner,args},()=>{});
const result=await closed,ended=performance.timeOrigin+performance.now();
for(const stream of Object.values(streams))closeSync(stream.fd);
const raw={};for(const kind of ['stdout','stderr']){const bytes=readFileSync(streams[kind].path);raw[kind]={path:streams[kind].path,bytes:bytes.length,sha256:hash(bytes)};}
let report=null,observations=null,validationError=null;
try{
 report=parseTap({...result,error,stdout:readFileSync(raw.stdout.path,'utf8'),stderr:readFileSync(raw.stderr.path,'utf8')},components[p.component].cases);
 assert.deepEqual(report.executions,p.executions);assert.equal(report.tests,p.tests);
 const {QualificationObservationSchema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
 observations=validateObservations(readFileSync(raw.stdout.path,'utf8'),p.component,components[p.component].positives,QualificationObservationSchema);
 assert.equal(candidateSnapshot().digest,config.candidate);
}catch(e){validationError=e.message;}
const receipt={component:p.component,candidate:config.candidate,fixture:config.fixture,worker,runner,file,args,sourceDigest:'sha256:'+p.sourceSha256,emittedDigest:hash(readFileSync(file)),environment,...result,error,validationError,...raw,report,observations,started:startedGlobal,ended,
 binding:{candidate:config.candidate,fixtureDigest:hash(config.fixture),environmentDigest:environment.digest,workerDigest:hash(worker),stdoutDigest:raw.stdout.sha256,observationsDigest:hash(observations)}};
const path=resolve(config.journal.root.path,config.component+'-'+config.marker+'-receipt.json');durableFile(path,JSON.stringify(receipt)+'\n');
if(process.connected)process.send({kind:'child-receipt',index:{path,bytes:readFileSync(path).length,sha256:hash(readFileSync(path))}},()=>{});
await waitUntil(async()=>{assert(!disconnected,'Custodian disconnected before child join');return finish;},'custodian joins all complete reports',240000);
// The census invokes ps as this process's own short-lived child. Verify
// the actual test handle; the custodian independently verifies the full tree.
assert(!census().some(r=>r.pid===child.pid),'Complete test runner remains');
process.exitCode=validationError?1:0;if(process.connected)process.disconnect();
