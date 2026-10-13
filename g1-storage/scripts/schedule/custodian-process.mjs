import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { readFileSync,lstatSync,openSync,writeSync,fsyncSync,closeSync } from 'node:fs';
import pg from 'pg';
import { cwd } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { containers,processTools,hash } from '../recovery/ownership.mjs';
import { durableFile } from '../recovery/journal.mjs';
import { createJournal,appendJournal,readJournal,writeReceipt } from '../custodian/journal.mjs';
import { launchFresh,processExpected } from '../custodian/processes.mjs';
import { nestedLifetimes } from '../custodian/lifetimes.mjs';
import { predecessors,readBound,validateReceipt } from './verification.mjs';
import { observeTree,settleDescendants } from './descendants.mjs';
const config=JSON.parse(process.env.FABRIC_CUSTODIAN_CONFIG);delete process.env.FABRIC_CUSTODIAN_CONFIG;
assert.equal(process.argv.length,3);assert.deepEqual(Object.keys(config).sort(),['operation','candidate','marker'].sort());
assert.equal(config.operation,'complete-volume-schedule');assert.equal(config.marker,process.argv[2]);assert.equal(config.candidate,candidateSnapshot().digest);
const started=performance.now(),j=createJournal(config.candidate),workers=[],fixtures=[],children=[],known=new Map(),failures=[],phaseDurations={};
let ownerLost=false,workStarted=null,workEnded=null,cleanupAt=null;
for(const [kind,stream] of [['stdout',process.stdout],['stderr',process.stderr]]){
 const path=resolve(j.root.path,kind+'.log');durableFile(path,'');const fd=openSync(path,'a'),original=stream.write.bind(stream);let bytes=0,alive=true;
 stream.on('error',e=>{if(e.code==='EPIPE'){alive=false;ownerLost=true;}else failures.push('custodian-stream-error');});
 stream.write=(chunk,...args)=>{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;assert(bytes<=32*1024*1024);writeSync(fd,b);fsyncSync(fd);return alive?original(chunk,...args):true;};process.on('exit',()=>closeSync(fd));
}
process.on('disconnect',()=>ownerLost=true);
const {census,waitUntil,stopOwned}=await processTools(),identity=census().find(r=>r.pid===process.pid),parent=census().find(r=>r.pid===process.ppid);assert(identity&&parent);
const event=e=>appendJournal(j,e);
event({phase:'custodian-born',identity,parent,nonce:config.marker});console.log(JSON.stringify({pid:process.pid,marker:config.marker,journal:j,identity}));
const censusBefore=containers();
try{
 await nestedLifetimes(j,async state=>{
  fixtures.push(...state.fixtures);
  // Inspect the original F01-F04 databases before any predecessor is released.
  for(const [i,env] of state.environments.entries()){
   const db=new pg.Client({connectionString:env.STORAGE_DATABASE_URL,connectionTimeoutMillis:2000});await db.connect();
   try{
    const marker=(await db.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows;
    const table=(await db.query("SELECT to_regclass('public.fabric_storage_migrations') AS relation")).rows[0].relation;
    assert.equal(table,null);assert.deepEqual(marker,[{owner:fixtures[i].identity.owner,instance:fixtures[i].identity.instance}]);
    const digest=hash(Object.fromEntries(Object.entries(env).sort(([a],[b])=>a.localeCompare(b))));
    event({phase:'fresh-migration-environment',label:['A','B','C'][i],marker,storageMigrationTable:table,storageMigrations:[],environmentDigest:digest});
   }finally{await db.end();}
  }
  assert(!ownerLost,'Owner disconnected during setup');
  const launched=await Promise.allSettled(state.environments.map((env,i)=>launchFresh(resolve(cwd,'scripts/schedule/full-worker.mjs'),{
   operation:'complete-predecessor',component:predecessors[i].component,candidate:config.candidate,fixture:fixtures[i],journal:j},env)));
  for(const [i,r] of launched.entries()){
   if(r.status==='fulfilled'){const w=r.value;w.component=predecessors[i].component;workers.push(w);event({phase:'worker-born',worker:processExpected(w),fixture:fixtures[i]});}
   else failures.push('worker-launch-failed:'+predecessors[i].component+':'+r.reason.message);
  }
  phaseDurations.setup=performance.now()-started;
  const workAt=performance.now();workStarted=performance.timeOrigin+workAt;
  try{
   assert.equal(workers.length,3);assert(workAt-started<220000,'Whole-operation deadline during setup');
   event({phase:'workers-released',workers:workers.map(processExpected),fixtures:fixtures.map(f=>f.identity.instance)});
   for(const w of workers)w.child.send({kind:'begin'},()=>{});
   while(true){
    observeTree(census(),workers,known,j);
    for(const w of workers){if(w.failure())throw w.failure();assert(w.child.exitCode===null&&w.child.signalCode===null,'Worker lost before complete report');}
    assert(!ownerLost,'Actual suite owner disconnected');assert(performance.now()-started<220000,'Whole-operation work deadline; reserve cleanup');
    if(workers.every(w=>w.messages.some(m=>m.kind==='child-receipt')))break;
    await new Promise(r=>setTimeout(r,200));
   }
   for(const [i,w] of workers.entries()){
    assert.equal(w.messages.filter(m=>m.kind==='child-receipt').length,1);assert.equal(w.messages.filter(m=>m.kind==='runner-born').length,1);
    const receipt=JSON.parse(readBound(w.messages.find(m=>m.kind==='child-receipt').index));children.push(receipt);
    assert.equal(receipt.worker.nonce,w.marker);assert.deepEqual(receipt.fixture,fixtures[i]);
    event({phase:'complete-child-report',component:w.component,index:w.messages.find(m=>m.kind==='child-receipt').index,runner:w.messages.find(m=>m.kind==='runner-born').runner});
    if(receipt.validationError||receipt.status!==0||receipt.signal!==null||receipt.error)failures.push('complete-worker-failed:'+w.component+':'+receipt.validationError);
   }
  }catch(e){failures.push(e.message);}
  finally{
   workEnded=performance.timeOrigin+performance.now();phaseDurations.work=workEnded-workStarted;
   const joinAt=performance.now();
   let descendantCleanup;
   try{descendantCleanup=await settleDescendants(workers,known,j,fixtures,{cancel:failures.length>0});}
   catch(e){failures.push('descendant-cleanup-refused:'+e.message);event({phase:'descendant-cleanup-refused',reason:e.message});}
   if(descendantCleanup)event({phase:'descendants-settled',outcomes:descendantCleanup});
   for(const w of workers)if(w.child.connected)w.child.send({kind:'finish'},()=>{});
   const settled=await Promise.allSettled(workers.map(async w=>{
    try{await waitUntil(async()=>w.child.exitCode!==null||w.child.signalCode!==null,'full worker join',5000);await w.exit;}
    catch(e){
     failures.push(e.message);
     if(census().some(r=>r.ppid===w.pid)){
      // Refused cleanup cannot authorize early fixture deletion. Keep the
      // surviving custodian alive for natural child settlement; the original
      // suite bound still fails and retained receipts report the overrun.
      await waitUntil(async()=>!census().some(r=>r.ppid===w.pid),'refused tree natural settlement',240000);
     }
     await stopOwned(w,'SIGKILL');await w.exit;
    }
    await stopOwned(w);if(w.child.exitCode!==0||w.child.signalCode!==null)failures.push('full-worker-nonzero:'+w.component);
    const raw={};for(const [kind,bytes] of Object.entries(w.streams())){const path=resolve(j.root.path,w.component+'-adapter-'+kind+'.log');durableFile(path,bytes);raw[kind]={path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};}
    event({phase:'worker-settled',worker:processExpected(w),status:w.child.exitCode,signal:w.child.signalCode,streams:raw});
   }));
   for(const r of settled)if(r.status==='rejected')failures.push(r.reason.message);
   assert(settled.every(r=>r.status==='fulfilled'),'Full worker cleanup failed');
   event({phase:'all-workers-settled',containers:containers()});phaseDurations.join=performance.now()-joinAt;cleanupAt=performance.now();
  }
 });
}catch(e){failures.push(e.message);}
phaseDurations.cleanup=cleanupAt===null?0:performance.now()-cleanupAt;phaseDurations.total=performance.now()-started;
const censusAfter=containers(),residue=[],rows=census();
if(JSON.stringify(censusAfter)!==JSON.stringify(censusBefore))failures.push('exact global census changed');
for(const w of workers)if(rows.some(r=>r.pid===w.pid||r.command.includes(w.marker)))residue.push('worker:'+w.pid);
for(const e of known.values())if(rows.some(r=>r.pid===e.pid&&r.instance===e.instance))residue.push('descendant:'+e.pid);
for(const f of fixtures)if(lstatSync(f.path,{throwIfNoEntry:false})||censusAfter.includes(f.container.id))residue.push('fixture:'+f.identity.instance);
if(residue.length)failures.push('owned terminal residue');if(ownerLost)failures.push('suite-owner-disconnected');
if(phaseDurations.total>235000)failures.push('235000ms full operation target exceeded');
if(candidateSnapshot().digest!==config.candidate)failures.push('candidate changed');
const receipt={schemaVersion:1,measurement:'storage-volume-schedule',candidate:config.candidate,status:failures.length?'failed':'passed',journal:j,custodian:{identity,parent,nonce:config.marker},fixtures,workers:workers.map(processExpected),children,
 events:readJournal(j).slice(1).map(l=>l.event),failures,residue,censusBefore,censusAfter,phaseDurations,workStarted,workEnded,externalQualification:'pending'};
try{if(!failures.length)await validateReceipt(receipt);}catch(e){failures.push(e.message);receipt.status='failed';}
const index=writeReceipt(j,receipt);console.log(JSON.stringify({measurement:'volume-schedule-receipt-written',...index,status:receipt.status}));
if(process.connected)await new Promise(r=>process.send({kind:'receipt',index,status:receipt.status},()=>r()));
process.exitCode=receipt.status==='passed'?0:1;if(process.connected)process.disconnect();
