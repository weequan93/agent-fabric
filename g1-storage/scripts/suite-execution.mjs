import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { drainOutput } from './measurement-transport.mjs';
import { parseTap } from './process-result.mjs';
import { performance } from 'node:perf_hooks';
import { assertExecutionPreservation } from './execution-preservation.mjs';

// The same seam is used by the shipped runner and nonrecursive sabotage.
// Human decision 2026-10-09 removes only the default whole-file cap; explicit hostile timeouts remain.
export function validateSuiteFiles(selected, source, emitted) {
 for (const [id, suite] of selected) for (const file of [resolve(emitted, suite.file), resolve(source, suite.file.replace(/\.js$/, '.ts'))]) {
  try { if (!lstatSync(file).isFile()) throw new Error('Mandatory suite is not a regular file: ' + id); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('Mandatory suite missing: ' + id); throw error; }
 }
}
export async function executeSuite(file, cases, options = {}, variants = {}, admission = null) {
 assertExecutionPreservation();
 const env={...process.env,...options.env};delete env.NODE_TEST_CONTEXT;
 const dispatched=performance.now();
 // Stream the actual child as it runs, while retaining its complete original
 // bytes for the same TAP, variant and observation gates. This also leaves the
 // parent event loop available while nested fixtures run.
 const {maxBuffer=32*1024*1024,timeout,...spawnOptions}=options;
 const result=await new Promise(resolveResult=>{
  const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',file],{
   ...spawnOptions,env,stdio:['ignore','pipe','pipe']
  });
  const buffers={stdout:[],stderr:[]},sizes={stdout:0,stderr:0};let error,timer;
  const stop=reason=>{error??=reason;child.kill(options.killSignal??'SIGTERM');};
  const outputError=cause=>stop(cause);
  process.stdout.on('error',outputError);process.stderr.on('error',outputError);
  for(const kind of ['stdout','stderr']){
   const source=child[kind],destination=process[kind];
   source.on('error',outputError);
   source.on('data',bytes=>{
    sizes[kind]+=bytes.length;
    if(sizes[kind]>maxBuffer){stop(Object.assign(new Error(kind+' maxBuffer length exceeded'),{code:'ENOBUFS'}));return;}
    buffers[kind].push(bytes);
   });
   source.pipe(destination,{end:false});
  }
  child.on('error',cause=>{error??=cause;});
  if(timeout>0)timer=setTimeout(()=>stop(Object.assign(new Error('Suite explicit timeout exceeded'),{code:'ETIMEDOUT'})),timeout);
  child.on('close',async(status,signal)=>{
   clearTimeout(timer);
   try{await drainOutput();}catch(cause){error??=cause;}
   process.stdout.removeListener('error',outputError);process.stderr.removeListener('error',outputError);
   resolveResult({status,signal,error,stdout:Buffer.concat(buffers.stdout).toString('utf8'),stderr:Buffer.concat(buffers.stderr).toString('utf8')});
  });
 });
 const returned=performance.now();
 const timing={clock:'parent-monotonic',dispatchMs:dispatched,returnMs:returned,elapsedMs:returned-dispatched};
 Object.defineProperty(result,'timing',{value:Object.freeze(timing)});
 console.log(JSON.stringify({measurement:'storage-suite-dispatch',file,...timing,status:result.status,signal:result.signal,error:result.error?.code??null,explicitTimeoutMs:options.timeout??null}));
 try {
  const report=admission?admission(result):parseTap(result,cases);
  for(const [id,names] of Object.entries(variants)) for(const name of names){
   if(report.executions.filter(r=>r.indent===4&&r.name===name&&(r.parent===id||r.parent.startsWith(id+' / '))).length!==1)throw new Error('Mandatory executed variant missing/duplicated: '+name);
  }
  return { result, report, timing };
 }
 catch (error) { Object.defineProperty(error, 'result', { value: result }); throw error; }
}
