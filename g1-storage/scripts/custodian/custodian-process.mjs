import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { readFileSync,writeFileSync,renameSync,lstatSync,openSync,writeSync,fsyncSync,closeSync } from 'node:fs';
import { cwd,cache,root } from '../paths.mjs';
import { hash,containers,processCensus,processTools,observeRoot } from '../recovery/ownership.mjs';
import { durableFile } from '../recovery/journal.mjs';
import { createJournal,appendJournal,readJournal,writeReceipt,parkJournal,syncDirectory } from './journal.mjs';
import { launchFresh,processExpected,killWorker,recoverChild } from './processes.mjs';
import { nestedLifetimes } from './lifetimes.mjs';

const config=JSON.parse(process.env.FABRIC_CUSTODIAN_CONFIG);delete process.env.FABRIC_CUSTODIAN_CONFIG;
assert.equal(process.argv.length,3);assert.deepEqual(Object.keys(config).sort(),['operation','scenario','candidate','marker'].sort());
assert.equal(config.operation,'closed-probe');assert.equal(config.marker,process.argv[2]);
const scenarios=['normal','sigkill','worker-deadline','owner-loss','owner-deadline','refusals','cleanup-failure'];assert(scenarios.includes(config.scenario));
const started=performance.now(),deadline=started+30000,reserve=8000,j=createJournal(config.candidate);
const events=[],failures=[],workers=[],fixtures=[],cleanup=[],phaseDurations={};let ownerLost=false;
// Persist complete diagnostics even when the actual suite-owner is SIGKILLed.
for(const [kind,stream] of [['stdout',process.stdout],['stderr',process.stderr]]){
 const path=resolve(j.root.path,kind+'.log');durableFile(path,'');const fd=openSync(path,'a'),original=stream.write.bind(stream);let bytes=0,pipeAlive=true;
 stream.on('error',e=>{if(e.code==='EPIPE'){pipeAlive=false;ownerLost=true;}else failures.push(e.message);});
 stream.write=(chunk,...args)=>{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;assert(bytes<=32*1024*1024);writeSync(fd,b);fsyncSync(fd);return pipeAlive?original(chunk,...args):true;};
 process.on('exit',()=>closeSync(fd));
}
function event(e){appendJournal(j,e);events.push(e);if(process.connected)process.send({kind:'event',event:e},()=>{});}
process.on('disconnect',()=>{ownerLost=true;});
const {waitUntil,census,assertOwned,stopOwned}=await processTools();
const identity=census().find(r=>r.pid===process.pid),parent=census().find(r=>r.pid===process.ppid);assert(identity&&parent);
event({phase:'custodian-born',identity,parent,nonce:config.marker});
process.stdout.write(JSON.stringify({pid:process.pid,marker:config.marker,journal:j,identity})+'\n');
const globalBefore=containers();let dirtyRoot=null;
try{
 const setupAt=performance.now();
 await nestedLifetimes(j,async state=>{
  fixtures.push(...state.fixtures);phaseDurations.setup=performance.now()-setupAt;
  assert(performance.now()<deadline-reserve,'Whole-operation deadline expired during setup');
  const workAt=performance.now();
  try{
   // No mutation of the custodian's environment. Each complete environment is
   // installed in the options of its own fresh worker process.
   const launched=await Promise.allSettled(state.environments.map((env,i)=>launchFresh(resolve(cwd,'scripts/custodian/probe-worker.mjs'),{operation:'closed-durable-probe',label:['A','B','C'][i]},env)));
   workers.push(...launched.filter(r=>r.status==='fulfilled').map(r=>r.value));
   for(const [i,r] of launched.entries())if(r.status==='rejected'){
    failures.push(r.reason.message);const streams={};
    for(const kind of ['stdout','stderr']){const bytes=r.reason.streams?.[kind]??'',path=resolve(j.root.path,'failed-launch-'+i+'-'+kind+'.log');durableFile(path,bytes);streams[kind]={path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};}
    event({phase:'worker-launch-failed',label:['A','B','C'][i],streams});
   }
   assert.equal(workers.length,3,'Every worker must launch');
   for(const [i,w] of workers.entries())event({phase:'worker-born',label:['A','B','C'][i],worker:processExpected(w),fixture:fixtures[i]});
   event({phase:'workers-released',workers:workers.map(processExpected),fixtures:fixtures.map(f=>f.identity.instance)});
   for(const w of workers)w.child.send({kind:'begin'},()=>{});
   await waitUntil(async()=>{
    for(const w of workers){if(w.failure())throw w.failure();assert(w.child.exitCode===null&&w.child.signalCode===null,'Worker exited before durable work');}
    assert(performance.now()<deadline-reserve,'Whole-operation work deadline');
    return workers.every(w=>w.messages.filter(m=>m.kind==='durable').length===1);
   },'all workers durable encrypted work and live IdP',8000);
   for(const [i,w] of workers.entries()){
    const m=w.messages.find(m=>m.kind==='durable'),rows=census(),child=rows.find(r=>r.pid===m.child.pid);
    assert.equal(m.label,['A','B','C'][i]);assert.equal(m.child.script,resolve(cache,'g1-storage/tests/helpers/idp-process.js'));
    assert.match(m.child.nonce,/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    assert.equal(child.command,process.execPath+' '+m.child.script+' '+m.child.nonce);
    assert.deepEqual(m.child,{pid:child.pid,nonce:m.child.nonce,instance:child.instance,command:child.command,parentPid:w.pid,parentInstance:w.identity.instance,script:m.child.script});
    assert.equal(child.ppid,w.pid);assert.equal(m.proof.owner,fixtures[i].identity.owner);assert.equal(m.proof.instance,fixtures[i].identity.instance);
    assert.equal(hash(readFileSync(m.proof.file)),m.proof.digest);assert.equal(m.proof.fsynced,true);assert.equal(m.proof.idpHttpStatus,200);assert.equal(m.proof.databaseCommitted,true);
    const environment=m.proof.environment;assert.equal(environment.fixtureRoot,fixtures[i].path);assert.equal(environment.repoRoot,root);assert.equal(environment.ownerRoot,cache);
    assert.equal(environment.databaseHost,'127.0.0.1');assert.equal(environment.databaseName,'/storage_test');assert.deepEqual(environment.roots,fixtures[i].roots.map(r=>r.path));
    event({phase:'durable-worker',label:['A','B','C'][i],worker:processExpected(w),child:m.child,proof:m.proof});
   }
   event({phase:'all-durable',containers:containers(),workers:workers.map(processExpected)});
   const b=workers[1],child=b.messages.find(m=>m.kind==='durable').child;
   if(config.scenario==='owner-loss'){
    await waitUntil(async()=>ownerLost,'actual suite-owner IPC loss',5000);failures.push('suite-owner-disconnected');
    event({phase:'owner-loss-observed',owner:parent,current:census().find(r=>r.pid===parent.pid)??null});
   }else if(config.scenario==='owner-deadline'){
    const installed=performance.now()+250;event({phase:'suite-owner-deadline-installed',installed,clock:'monotonic'});
    await waitUntil(async()=>performance.now()>=installed,'actual suite-owner deadline expiry',2000);failures.push('suite-owner-deadline-expired');
    event({phase:'suite-owner-deadline-expired',installed,observed:performance.now()});
   }
   if(['sigkill','worker-deadline','refusals','owner-loss','owner-deadline'].includes(config.scenario)){
    if(config.scenario==='worker-deadline'){
     const installed=performance.now()+250;event({phase:'worker-deadline-installed',worker:processExpected(b),installed,clock:'monotonic'});
     await waitUntil(async()=>performance.now()>=installed,'actual worker deadline expiry',2000);event({phase:'worker-deadline-expired',installed,observed:performance.now()});
    }
    await killWorker(b,[child],j);failures.push('worker-lost-'+config.scenario);
    if(config.scenario==='refusals')await negativeProofs(child,state.fixtures);
   }
   if(config.scenario==='cleanup-failure'){
    const f=fixtures[2],path=resolve(f.path,'.storage-owner.json');dirtyRoot={path,bytes:readFileSync(path),fixture:f};
    writeFileSync(path,JSON.stringify({...f.identity,instance:config.marker}));
    event({phase:'actual-root-substitution-installed',fixture:f});
   }
  }catch(e){failures.push(e.message);}
  finally{
   // Join every worker before any accepted fixture finally can run.
   phaseDurations.work=performance.now()-workAt;
   const joinAt=performance.now();
   for(const w of workers)if(w.child.exitCode===null&&w.child.signalCode===null)w.child.send({kind:'finish'},()=>{});
   const settled=await Promise.allSettled(workers.map(async w=>{
    try{
     await waitUntil(async()=>w.child.exitCode!==null||w.child.signalCode!==null,'normal worker finally',5000);await w.exit;
    }catch(e){
     failures.push(e.message);const child=w.messages.find(m=>m.kind==='durable')?.child;assert(child,'No durable child identity; fail closed');await killWorker(w,[child],j);
    }
    const child=w.messages.find(m=>m.kind==='durable')?.child;
    if(w.child.signalCode!==null){
     assert(child);cleanup.push(await recoverChild(child,j,state.fixtures));
    }else{await stopOwned(w);assert(!census().some(r=>r.pid===child?.pid));cleanup.push({action:'normal-finally',worker:processExpected(w),child});}
    const streams=w.streams();const raw={};for(const kind of ['stdout','stderr']){const path=resolve(j.root.path,'worker-'+w.marker+'-'+kind+'.log');durableFile(path,streams[kind]);raw[kind]={path,bytes:Buffer.byteLength(streams[kind]),sha256:hash(streams[kind])};}
    event({phase:'worker-settled',worker:processExpected(w),code:w.child.exitCode,signal:w.child.signalCode,streams:raw});
    if(w.child.exitCode!==0||w.child.signalCode!==null)failures.push('nonzero worker outcome');
   }));
   for(const r of settled)if(r.status==='rejected')failures.push(r.reason.message);
   assert(settled.every(r=>r.status==='fulfilled'),'Descendant cleanup failed; cannot qualify');
   event({phase:'all-workers-settled',containers:containers()});phaseDurations.join=performance.now()-joinAt;
  }
 });
}catch(e){failures.push(e.message);}
const globalAfter=containers();if(JSON.stringify(globalBefore)!==JSON.stringify(globalAfter))failures.push('global census changed');
const rows=await processCensus(),residue=[];
for(const w of workers){if(rows.some(r=>r.pid===w.pid||r.command.includes(w.marker)))residue.push('worker:'+w.pid);const c=w.messages.find(m=>m.kind==='durable')?.child;if(c&&rows.some(r=>r.pid===c.pid||r.command.includes(c.nonce)))residue.push('child:'+c.pid);}
for(const f of fixtures){if(lstatSync(f.path,{throwIfNoEntry:false}))residue.push(f.path);if(globalAfter.includes(f.container.id))residue.push(f.container.id);}
if(residue.length)failures.push('owned residue remains');if(ownerLost&&!failures.includes('suite-owner-disconnected'))failures.push('suite-owner-disconnected');
phaseDurations.total=performance.now()-started;if(phaseDurations.total>=30000)failures.push('whole-operation deadline expired');
const receipt={schemaVersion:1,measurement:'storage-custodian-probe',candidate:config.candidate,scenario:config.scenario,status:failures.length?'failed':'passed',
 journal:j,custodian:{identity,parent,nonce:config.marker},fixtures,events:readJournal(j).slice(1).map(l=>l.event),cleanup,failures,residue,censusBefore:globalBefore,censusAfter:globalAfter,phaseDurations,
 externalQualification:'pending',dirtyRoot:dirtyRoot?{fixture:dirtyRoot.fixture,originalMarker:JSON.parse(dirtyRoot.bytes)}:null};
const index=writeReceipt(j,receipt);console.log(JSON.stringify({measurement:'custodian-receipt-written',...index,status:receipt.status}));
if(process.connected)await new Promise(r=>process.send({kind:'receipt',index,status:receipt.status},()=>r()));
process.exitCode=failures.length?1:0;if(process.connected)process.disconnect();

async function negativeProofs(child,fs){
 const before=containers(),rowsBefore=census().find(r=>r.pid===child.pid),refusals=[];
 async function refuse(name,c=child,journal=j){
  await assert.rejects(recoverChild(c,journal,fs));const current=census().find(r=>r.pid===child.pid);assert.deepEqual(current,rowsBefore);assert.deepEqual(containers(),before);
  refusals.push(name);
 }
 const parked=parkJournal(j);
 try{await refuse('missing-journal');durableFile(j.path,readFileSync(parked));await refuse('substituted-journal-inode');}
 finally{if(lstatSync(j.path,{throwIfNoEntry:false})){const replacement=lstatSync(j.path);assert(replacement.isFile()&&replacement.ino!==j.inode);const {unlinkSync}=await import('node:fs');unlinkSync(j.path);}renameSync(parked,j.path);syncDirectory(j.root.path);}
 await refuse('substituted-journal-nonce',child,{...j,nonce:config.marker});
 await refuse('substituted-journal-instance',child,{...j,root:{...j.root,identity:{...j.root.identity,instance:config.marker}}});
 await refuse('substituted-process-birth',{...child,instance:'1/Thu Jan  1 00:00:00 1970'});
 await refuse('substituted-process-nonce',{...child,nonce:config.marker});
 await refuse('substituted-process-parent',{...child,parentInstance:config.marker});
 const f=fs[0],marker=resolve(f.path,'.storage-owner.json'),original=readFileSync(marker);
 try{writeFileSync(marker,JSON.stringify({...f.identity,instance:config.marker}));await refuse('substituted-fixture-root');}finally{writeFileSync(marker,original);}
 event({phase:'actual-cleanup-refusals',refusals,childPreserved:census().find(r=>r.pid===child.pid),containers:before});
}
