import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,watch,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {api,capsule,negativeEvidence,fixtureFile,source,json} from './owned-capsule.js';
function ready(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error('Owned fixture readiness timeout')),5000);
 child.once('error',e=>{clearTimeout(timer);reject(e);});
 child.once('message',m=>{clearTimeout(timer);resolve(m);});
});}
async function fileReady(path:string,dir:string):Promise<void>{
 if(existsSync(path))return;
 await new Promise<void>((resolve,reject)=>{
  const watcher=watch(dir,()=>{if(existsSync(path)){clearTimeout(timer);watcher.close();resolve();}});
  const timer=setTimeout(()=>{watcher.close();reject(new Error('Watchdog cleanup result timeout'));},6000);
  if(existsSync(path)){clearTimeout(timer);watcher.close();resolve();}
 });
}
/** Force an actual Node birth between the supervisor's OS snapshot and its
 * return. Frozen-log-before-census ordering must leave it bootstrap-blocked
 * until a later actual census proves its ancestry; reading the later birth log
 * against that older snapshot deterministically fails this fixture. */
export async function exerciseBirthSnapshotRace():Promise<Record<string,unknown>>{
 const copy=await capsule(),dir=negativeEvidence('birth-after-census'),record=join(dir,'late-birth.json');
 try{
  const supervisor=join(copy.dir,'scripts/supervisor.mjs');
  let code=readFileSync(supervisor,'utf8');
  assert.equal(code.split('const rows=census(),self=').length,2);
  code=code.replace('const rows=census(),self=','const rows=lateSnapshot(),self=');
  const hook=`
let injected=false;
function lateSnapshot(){
 const rows=census();
 if(!injected){
  injected=true;
  const log=join(config.evidence,'births.ndjson');
  const late=spawn(process.execPath,['--import='+new URL('./bootstrap.mjs',import.meta.url).href,'-e','process.exitCode=0'],{env:{...process.env,NODE_OPTIONS:'',RUNTIME_OWNER_NONCE:nonce,RUNTIME_BIRTH_LOG:log},stdio:'ignore'});
  const until=performance.now()+2000;
  while(performance.now()<until&&(!existsSync(log)||!readFileSync(log,'utf8').includes('"pid":'+late.pid+',')))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2);
  if(!existsSync(log)||!readFileSync(log,'utf8').includes('"pid":'+late.pid+','))throw new Error('Actual late birth not published');
  writeFileSync(${JSON.stringify(record)},JSON.stringify({pid:late.pid,ppid:process.pid,absentFromEarlierSnapshot:!rows.some(p=>p.pid===late.pid),nonce}),{flag:'wx'});
 }
 return rows;
}
`;
  code=code.replace('function observe(){',hook+'\nfunction observe(){');fixtureFile(supervisor,code);
  const {supervise}=await import(pathToFileURL(join(copy.dir,'scripts/process.mjs')).href);
  const result=await supervise({args:['-e','process.stdout.write("owned root completed\\n")'],cwd:source,evidence:dir,nonce:randomUUID(),timeoutMs:5000});
  const late=json(record);assert.equal(late.absentFromEarlierSnapshot,true);
  const birth=result.births.find((b:any)=>b.pid===late.pid);assert.ok(birth);assert.equal(birth.ppid,late.ppid);assert.equal(birth.nonce,late.nonce);
  const owned=result.owned.find((p:any)=>p.pid===late.pid&&p.ppid===late.ppid);assert.ok(owned);
  const ack=json(join(dir,'births.ndjson.'+late.pid+'.ack'));assert.equal(ack.pid,late.pid);assert.equal(ack.nonce,late.nonce);assert.equal(ack.birth,owned.birth);
  assert.equal(result.cleanup.confirmed,true);assert.equal(result.streamsComplete,true);
  return {lateBirth:late,actualBirthAcknowledgedAfterLaterCensus:true,raw:dir};
 }finally{copy.cleanup();}
}
/** Historical failed cleanup stays failed in raw evidence. An independent
 * current census must additionally show that its nonce-bearing processes have
 * gone; this read-only diagnostic never signals a historical PID. */
export async function observePriorFailedCleanup():Promise<Record<string,unknown>>{
 const failed:{run:string;suite:string;nonce:string}[]=[];
 for(const run of readdirSync(join(source,'evidence'),{withFileTypes:true}))if(run.isDirectory()&&run.name.startsWith('run-')){
  for(const suite of readdirSync(join(source,'evidence',run.name),{withFileTypes:true}))if(suite.isDirectory()){
   const path=join(source,'evidence',run.name,suite.name,'supervisor.json');if(!existsSync(path))continue;
   const record=json(path);if(record.cleanup?.confirmed===false){assert.equal(typeof record.nonce,'string');assert.ok(record.nonce.length>0);failed.push({run:run.name,suite:suite.name,nonce:record.nonce});}
  }
 }
 const {census}=await api('census'),rows=census();
 const residue=rows.filter((p:any)=>failed.some(f=>p.command.includes(f.nonce)));
 assert.deepEqual(residue,[],'No prior unconfirmed fixture processes may remain');
 return {priorUnconfirmedRuns:failed,currentResidue:[],readOnlyActualCensus:true,historicalFailureReclassified:false};
}
/** Actual runner death, descendant stream cleanup and an unrelated live sentinel. */
export async function exerciseWatchdog():Promise<Record<string,unknown>>{
 const {census,sameInstance,signalOwned}=await api('census');
 const dir=negativeEvidence('runner-loss'),nonce=randomUUID(),rootFile=join(dir,'owned-runner.mjs'),sentinelFile=join(dir,'sentinel.mjs'),readyPath=join(dir,'descendant-ready.json');
 const grandchild=`process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(readyPath)},JSON.stringify({pid:process.pid,ppid:process.ppid}));setInterval(()=>process.stdout.write('owned stream\\n'),100);`;
 const workload=`const {spawn}=process.getBuiltinModule('child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`;
 fixtureFile(rootFile,`import {watch,existsSync,readFileSync} from 'node:fs';import {supervise} from ${JSON.stringify(pathToFileURL(join(source,'scripts/process.mjs')).href)};const watcher=watch(${JSON.stringify(dir)},()=>{if(existsSync(${JSON.stringify(readyPath)})){watcher.close();process.send({ready:JSON.parse(readFileSync(${JSON.stringify(readyPath)},'utf8'))});}});await supervise({args:['-e',${JSON.stringify(workload)}],cwd:${JSON.stringify(source)},evidence:${JSON.stringify(dir)},nonce:${JSON.stringify(nonce)},timeoutMs:10000});`);
 fixtureFile(sentinelFile,`process.send({ready:true});setInterval(()=>{},1000);`);
 const env={...process.env};delete env['NODE_TEST_CONTEXT'];
 const sentinel=fork(sentinelFile,[],{env,execArgv:[],stdio:['ignore','ignore','ignore','ipc']});let runner:ChildProcess|undefined,sentinelBirth:any,runnerBirth:any;
 try{
  assert.deepEqual(await ready(sentinel),{ready:true});
  const outerNonce=process.env['RUNTIME_OWNER_NONCE'];
  sentinelBirth=census().find((p:any)=>p.pid===sentinel.pid);assert.equal(sentinelBirth.ppid,process.pid);assert.ok(sentinelBirth.command.includes(outerNonce));sentinelBirth={...sentinelBirth,nonce:outerNonce};
  runner=fork(rootFile,[],{env,execArgv:[],stdio:['ignore','ignore','ignore','ipc']});const m=await ready(runner);assert.ok(m.ready.pid&&m.ready.ppid);
  const rows=census();runnerBirth=rows.find((p:any)=>p.pid===runner!.pid);assert.equal(runnerBirth.ppid,process.pid);assert.ok(runnerBirth.command.includes(outerNonce));runnerBirth={...runnerBirth,nonce:outerNonce};
  assert.ok(rows.some((p:any)=>p.pid===m.ready.pid&&p.ppid===m.ready.ppid&&p.command.includes(nonce)));
  const exited=once(runner,'exit');signalOwned(runnerBirth,[runnerBirth],'SIGKILL');const exit=await exited;assert.equal(exit[1],'SIGKILL');
  await fileReady(join(dir,'supervisor.json'),dir);
  const result=json(join(dir,'supervisor.json'));assert.match(result.error,/Runner disconnected/);assert.equal(result.cleanup.confirmed,true);assert.equal(result.cleanup.historicalGroupsSignalled,false);assert.ok(result.owned.some((p:any)=>p.pid===m.ready.pid));assert.ok(result.signals.length>=2);
  assert.equal(census().some((p:any)=>result.owned.some((o:any)=>sameInstance(o,p))),false);
  assert.ok(census().some((p:any)=>sameInstance(p,sentinelBirth)),'Unrelated live sentinel survives runner loss');
  writeFileSync(join(dir,'runner-loss.json'),JSON.stringify({nonce,runnerBirth,exit,descendant:m.ready,sentinelBirth,sentinelSurvived:true})+'\n');
  return {runnerKilled:true,watchdogCleanedParentAndDescendant:true,unrelatedSentinelSurvived:true,raw:dir};
 }finally{
  if(runner&&runner.exitCode===null&&runner.signalCode===null&&runnerBirth){const exit=once(runner,'exit');signalOwned(runnerBirth,[runnerBirth],'SIGTERM');await exit;}
  if(sentinel.exitCode===null&&sentinel.signalCode===null&&sentinelBirth){const exit=once(sentinel,'exit');signalOwned(sentinelBirth,[sentinelBirth],'SIGTERM');await exit;}
 }
}
