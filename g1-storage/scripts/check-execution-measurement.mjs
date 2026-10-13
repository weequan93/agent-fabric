// Fixed structural transport proof. Product qualification remains in the
// unchanged hostile harness and the separately assigned full suites.
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { cwd,root,cache } from './paths.mjs';
import { candidateSnapshot } from './candidate.mjs';
import { assertBaseline } from './guards.mjs';
import { assertExecutionPreservation,reconstructTransportSource,reconstructExecutionSource } from './execution-preservation.mjs';
import { decodeMeasurement,encodeMeasurement,measurementDigest,drainOutput } from './measurement-transport.mjs';
import { createRoot,removeRoot,containers,processTools,assertRecoveryPins } from './recovery/ownership.mjs';
import { withStorageFixture } from './fixture.mjs';

if(process.argv.length!==2)throw new Error('Measurement checker accepts no arguments');
const started=performance.now(),candidate=candidateSnapshot(),errors=[];
let sentinelRoot,sentinel,tools;
const proof={measurement:'storage-lossless-measurement-proof',structuralOnly:true,externalQualification:'pending',candidate,children:[],rejections:[],compiler:null};
function censusReceipts(stdout){
 const lines=stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 const records=lines.filter(r=>r.measurement==='storage-measurement-transport'),decoded=[];
 for(let i=0;i<records.length;){
  const start=records[i];assert.equal(start.kind,'start');
  const receipt=records.slice(i,i+start.count+2),value=decodeMeasurement(receipt,start.binding);
  decoded.push({...value,receipt});i+=start.count+2;
 }
 return {lines,decoded};
}
function verifyCensus(census){
 assert.equal(measurementDigest(census.processBytes),census.processDigest);
 assert.deepEqual(census.processes,census.processBytes.trimEnd().split('\n'));
 assert.deepEqual(census.containers,census.containerBytes.trim().split('\n').filter(Boolean).sort());
 assert(census.processes.some(line=>new RegExp('^\\s*'+sentinel.pid+'\\s').test(line)),'Unowned sentinel must remain in actual census');
 for(const line of census.processes)assert.match(line,/^\s*\d+\s+\d+\s+\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+\s+.+$/);
 for(const r of census.roots){assert.equal(r.symlink,false);assert(r.marker);assert.equal(r.device,r.marker.device);assert.equal(r.inode,r.marker.inode);}
}
async function child(code){
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const p=spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 const out=[],err=[];p.stdout.on('data',b=>out.push(b));p.stderr.on('data',b=>err.push(b));
 const result=await new Promise((yes,no)=>{
  const timer=setTimeout(()=>{p.kill('SIGKILL');},20_000);
  p.once('error',e=>{clearTimeout(timer);no(e);});
  p.once('close',(status,signal)=>{clearTimeout(timer);yes({status,signal});});
 });
 assert.equal(result.signal,null,'Real subprocess must close within fixed structural bound');
 return {...result,pid:p.pid,stdout:Buffer.concat(out),stderr:Buffer.concat(err)};
}
try{
 assertBaseline();assertExecutionPreservation();assertRecoveryPins();
 const extension=JSON.parse(readFileSync(resolve(cwd,'verification/measurement-transport-extension-v1.json'),'utf8'));
 const predecessor=extension.predecessor.files.map(([path,digest])=>{
  const bytes=reconstructTransportSource(path,readFileSync(resolve(cwd,path),'utf8'));
  assert.equal(measurementDigest(bytes),'sha256:'+digest,'Exact 1103-file predecessor: '+path);return [path,digest];
 });
 assert.equal(measurementDigest(JSON.stringify(predecessor)),extension.predecessor.digest);
 assert.equal(predecessor.length,1103);
 const previous=JSON.parse(readFileSync(resolve(cwd,'verification/execution-extension-v1.json'),'utf8'));
 const original=predecessor.filter(([path])=>!['scripts/execution-measurement.mjs','scripts/execution-preservation.mjs','verification/execution-extension-v1.json'].includes(path))
  .map(([path,digest])=>[path,previous.files[path]?.predecessorDigest.slice(7)??digest]);
 assert.equal(original.length,1100);assert.deepEqual(Object.fromEntries(original),extension.original1100);
 for(const [path,digest] of original)assert.equal(measurementDigest(reconstructExecutionSource(path,readFileSync(resolve(cwd,path),'utf8'))),'sha256:'+digest);
 for(const path of Object.keys(extension.files))assert.throws(()=>reconstructTransportSource(path,readFileSync(resolve(cwd,path),'utf8')+'\n'));
 const built=spawnSync(process.execPath,[resolve(cwd,'scripts/build.mjs')],{cwd:root,encoding:'utf8',timeout:60_000,maxBuffer:32*1024*1024});
 process.stdout.write(built.stdout??'');process.stderr.write(built.stderr??'');
 assert.equal(built.error,undefined);assert.equal(built.signal,null);assert.equal(built.status,0,built.stderr);assert.match(built.stdout,/"measurement":"strict-build"/);
 tools=await processTools();sentinelRoot=createRoot();
 const script=resolve(sentinelRoot.path,'sentinel.mjs');
 writeFileSync(script,"const c=JSON.parse(process.env.MEASUREMENT_CHILD);console.log(JSON.stringify({pid:process.pid,marker:c.marker}));setInterval(()=>{},1000);",{flag:'wx'});
 sentinel=await tools.launchOwned(script,'MEASUREMENT_CHILD',{});const identity=tools.census().find(r=>r.pid===sentinel.pid);
 const before=containers();
 for(const fatal of [false,true]){
  const code=`import {createHash} from 'node:crypto';
   import {startMeasurement,endMeasurement} from ${JSON.stringify(pathToFileURL(resolve(cwd,'scripts/execution-measurement.mjs')).href)};
   import {emitMeasurement,drainOutput} from ${JSON.stringify(pathToFileURL(resolve(cwd,'scripts/measurement-transport.mjs')).href)};
   import {withStorageFixture} from ${JSON.stringify(pathToFileURL(resolve(cwd,'scripts/fixture.mjs')).href)};
   const bindings={candidate:${JSON.stringify(candidate.digest)},mode:'structural-only'},m=startMeasurement('command',bindings,true);let original;
   try{await m.ready;await withStorageFixture(async()=>{
    const live=startMeasurement('build',bindings,true);
    try{await live.ready;
     process.stdout.write('original-stdout-prefix\\n'+ 'x'.repeat(524288)+'\\noriginal-stdout-complete\\n');
     process.stderr.write('original-stderr-prefix\\n'+ 'y'.repeat(262144)+'\\noriginal-stderr-complete\\n');
     const padding=Array.from({length:4096},(_,i)=>createHash('sha256').update(String(i)).digest('hex')).join('');
     await emitMeasurement({measurement:'storage-lossless-census-probe',phase:'build',candidate:bindings.candidate,before:live.before,padding},live.binding);
     ${fatal?"throw new Error('measurement-deliberate-uncaught-error');":''}
    }finally{await endMeasurement(live);}
   });}catch(error){original=error;}finally{await endMeasurement(m,{success:!original});await drainOutput();}
   if(original)throw original;`;
  const r=await child(code);assert.equal(r.status,fatal?1:0,r.stderr.toString());
  const stdout=r.stdout.toString(),stderr=r.stderr.toString();
  assert(stdout.includes('original-stdout-prefix\n'+'x'.repeat(524288)+'\noriginal-stdout-complete\n'));
  assert(stderr.startsWith('original-stderr-prefix\n'+'y'.repeat(262144)+'\noriginal-stderr-complete\n'));
  if(fatal)assert.match(stderr,/measurement-deliberate-uncaught-error/);else assert.equal(stderr,'original-stderr-prefix\n'+'y'.repeat(262144)+'\noriginal-stderr-complete\n');
  const {lines,decoded}=censusReceipts(stdout);assert.equal(decoded.length,5);
  for(const value of decoded){
   assert.equal(value.record.transportBinding.candidate,candidate.digest);
   assert.deepEqual(value.record.transportBinding.command,{executable:process.execPath,args:['--input-type=module','-e',code],cwd:root});
   for(const [path,digest] of Object.entries(value.record.transportBinding.sources))assert.equal(digest,measurementDigest(readFileSync(resolve(cwd,'scripts',path))));
   for(const c of [value.record.before,value.record.after].filter(Boolean))verifyCensus(c);
  }
  const command=decoded.filter(v=>v.record.phase==='command');assert.equal(command.length,2);
  assert.equal(command[0].record.measurement,'storage-parent-start');assert.equal(command[1].record.measurement,'storage-parent-return');
  assert.equal(command[1].record.success,!fatal);assert.equal(command[0].record.startedMs,command[1].record.startedMs);
  assert.equal(command[1].record.elapsedMs,command[1].record.returnedMs-command[0].record.startedMs);assert(command[1].record.elapsedMs>0);
  assert.deepEqual(command[0].record.before.containers,before);assert.deepEqual(command[1].record.after.containers,before);
  const large=decoded.find(v=>v.record.measurement==='storage-lossless-census-probe');assert(large.raw.length>66112);assert(large.receipt.length>3);
  assert.equal(large.record.before.containers.length,before.length+1);assert(large.record.before.roots.length>command[0].record.before.roots.length);
  const cleanup=lines.find(v=>v.measurement==='storage-container-cleanup');assert(cleanup?.removed&&cleanup.censusUnchanged);
  assert(lines.some(v=>v.measurement==='storage-root-cleanup'&&v.removed));
  const rootPath=large.record.before.roots.find(v=>!command[0].record.before.roots.some(b=>b.path===v.path)).path;
  assert.equal(lstatSync(rootPath,{throwIfNoEntry:false}),undefined);assert.deepEqual(containers(),before);
  assert.deepEqual(tools.census().find(v=>v.pid===sentinel.pid),identity);assert(!tools.census().some(v=>v.pid===r.pid));
  // Deliberately damage actual child receipts, never the product assertion.
  const reject=(name,mutate,binding=large.record.transportBinding)=>{
   const copy=structuredClone(large.receipt);mutate(copy);assert.throws(()=>decodeMeasurement(copy,binding),name);proof.rejections.push((fatal?'fatal:':'success:')+name);
  };
  reject('truncated',r=>r.splice(1,1));reject('missing-final',r=>r.pop());reject('out-of-order',r=>{[r[1],r[2]]=[r[2],r[1]];});
  reject('corrupt-bytes',r=>{r[1].data=(r[1].data[0]==='A'?'B':'A')+r[1].data.slice(1);});
  reject('corrupt-byte-count',r=>{r[0].bytes++;r.at(-1).bytes++;});reject('corrupt-digest',r=>{r[0].digest='sha256:'+'0'.repeat(64);r.at(-1).digest=r[0].digest;});
  reject('duplicate-chunk',r=>r.splice(2,0,r[1]));reject('unbound-candidate',()=>{}, {...large.record.transportBinding,candidate:'sha256:'+'0'.repeat(64)});
  reject('unbound-command',()=>{}, {...large.record.transportBinding,command:{...large.record.transportBinding.command,args:['unbound']}});
  reject('unbound-source',()=>{}, {...large.record.transportBinding,sources:{...large.record.transportBinding.sources,'runner.mjs':'sha256:'+'0'.repeat(64)}});
  reject('corrupt-final',r=>r.at(-1).binding.phase='command');
  reject('unbound-payload',r=>{
   const changed={...large.record,transportBinding:{...large.record.transportBinding,candidate:'sha256:'+'0'.repeat(64)}};
   // Build a valid byte envelope, then rebind only its header: payload authority must still fail.
   const forged=encodeMeasurement(changed,changed.transportBinding);for(const header of [forged[0],forged.at(-1)]){
    header.binding=large.record.transportBinding;header.bindingDigest=measurementDigest(JSON.stringify(header.binding));
   }r.splice(0,r.length,...forged);
  });
  proof.children.push({fatal,pid:r.pid,status:r.status,signal:r.signal,stdoutBytes:r.stdout.length,stderrBytes:r.stderr.length,stdoutDigest:measurementDigest(r.stdout),stderrDigest:measurementDigest(r.stderr),receiptBytes:large.raw.length,receiptChunks:large.receipt.length-2,commandMs:command[1].record.elapsedMs,ownedContainer:cleanup.containerId,ownedRoot:rootPath,cleanup:true});
  // Complete source bytes are retained in the controller stream, with hashes.
  console.log(JSON.stringify({measurement:'measurement-drain-child',fatal,pid:r.pid,status:r.status,stdoutBase64:r.stdout.toString('base64'),stderrBase64:r.stderr.toString('base64'),stdoutDigest:measurementDigest(r.stdout),stderrDigest:measurementDigest(r.stderr)}));
 }
 const broken=new Writable({write(_bytes,_encoding,callback){callback(new Error('measurement-deliberate-output-failure'));}});
 let goodDrained=0;const good=new Writable({write(_bytes,_encoding,callback){goodDrained++;callback();}});let outputFailure,failedRoot;
 try{await withStorageFixture(async state=>{failedRoot=state.env.STORAGE_FIXTURE_ROOT;await drainOutput(broken,good);});}catch(error){outputFailure=error;}
 assert.equal(goodDrained,1);assert(outputFailure);assert.match(String(outputFailure.errors?.[0]?.errors?.[0]),/measurement-deliberate-output-failure/);
 assert.equal(lstatSync(failedRoot,{throwIfNoEntry:false}),undefined);
 assert.deepEqual(containers(),before);assert.deepEqual(tools.census().find(v=>v.pid===sentinel.pid),identity);
 proof.rejections.push('real-output-failure-retains-owned-cleanup');
 // Actual unchanged copied compiler and missing-fixture regressions also retain
 // their original stdout diagnostics and the final failing parent clock.
 const {HarnessCopy}=await import(pathToFileURL(resolve(cache,'g1-storage/tests/helpers/harness-copy.js')).href);
 const copy=new HarnessCopy();try{
  const {rmSync}=await import('node:fs');rmSync(resolve(copy.storage,'src/contracts.ts'));
  const r=copy.run('measurement-actual-compiler-failure','scripts/check.mjs');assert.equal(r.status,1);assert.match(r.stdout,/TS2307/);
  const {decoded}=censusReceipts(r.stdout),last=decoded.at(-1).record;
  assert.equal(last.measurement,'storage-parent-return');assert.equal(last.phase,'command');assert.equal(last.success,false);
  assert(last.elapsedMs>0);assert.match(r.stderr,/Storage check failed; behavior and final guards retained/);
  proof.compiler={status:r.status,diagnostic:'TS2307',stdoutBytes:Buffer.byteLength(r.stdout),finalClockMs:last.elapsedMs};
  writeFileSync(resolve(copy.storage,'src/contracts.ts'),readFileSync(resolve(cwd,'src/contracts.ts')));
  rmSync(resolve(copy.storage,'scripts/fixture.mjs'));
  const missing=copy.run('measurement-actual-missing-fixture','scripts/check-component.mjs',['commands']);
  assert.equal(missing.status,1);assert.match(missing.stdout,/strict-build/);assert.match(missing.stderr,/ERR_MODULE_NOT_FOUND/);
  assert.equal(missing.stdout.split('"measurement":"preserved-inputs"').length-1,4);
  const final=censusReceipts(missing.stdout).decoded.at(-1).record;
  assert.equal(final.measurement,'storage-parent-return');assert.equal(final.phase,'command');assert.equal(final.success,false);
  assert(final.elapsedMs>0);proof.missingFixture={status:missing.status,stdoutBytes:Buffer.byteLength(missing.stdout),finalClockMs:final.elapsedMs};
 }finally{copy.close();}
 proof.predecessorFiles=predecessor.length;proof.originalFiles=original.length;proof.recoveryPins=14;
} catch(error){errors.push(error);}
finally{
 try{if(sentinel)await tools.stopOwned(sentinel);}catch(error){errors.push(error);}
 try{if(sentinelRoot)assert.equal(removeRoot(sentinelRoot.path,sentinelRoot.identity).action,'removed');}catch(error){errors.push(error);}
 try{assert.equal(candidateSnapshot().digest,candidate.digest);assertBaseline();assertExecutionPreservation();assertRecoveryPins();}catch(error){errors.push(error);}
 proof.elapsedMs=performance.now()-started;
 try{assert(proof.elapsedMs<120_000,'Fixed 120s structural checker bound');}catch(error){errors.push(error);}
 try{await drainOutput();}catch(error){errors.push(error);}
}
if(errors.length)throw new AggregateError(errors,'Lossless measurement proof failed; final guards and cleanup retained');
console.log(JSON.stringify(proof));await drainOutput();
