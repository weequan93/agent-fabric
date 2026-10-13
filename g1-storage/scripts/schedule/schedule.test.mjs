import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { cwd,root } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { parseTap } from '../process-result.mjs';
import { components } from '../manifest.mjs';
import { containers,hash } from '../recovery/ownership.mjs';
import { durableFile } from '../recovery/journal.mjs';
import { createJournal,writeReceipt } from '../custodian/journal.mjs';
import { variants,validateReceipt,readBound,predecessors,verifyPriorFailures } from './verification.mjs';
const parent='VOLUME-SCHEDULE/behavior';
test(parent,async t=>{
 const candidate=candidateSnapshot(),journal=createJournal(candidate.digest),censusBefore=containers(),priorFailures=await verifyPriorFailures(),started=performance.now();
 const result=spawnSync(process.execPath,[resolve(cwd,'scripts/check-component.mjs'),'volume'],{cwd:root,env:process.env,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
 const elapsed=performance.now()-started,raw={};
 for(const kind of ['stdout','stderr']){const bytes=result[kind]??'',path=resolve(journal.root.path,'original-volume-'+kind+'.log');durableFile(path,bytes);raw[kind]={path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};}
 console.log(JSON.stringify({measurement:'schedule-original-volume-command',candidate,elapsed,status:result.status,signal:result.signal,error:result.error?.code??null,raw}));
 assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.error,undefined);
 const tapLines=result.stdout.split(/\r?\n/),tapStart=tapLines.indexOf('TAP version 13'),tapEnd=tapLines.findIndex((l,i)=>i>tapStart&&/^# duration_ms [0-9.]+$/.test(l));
 assert(tapStart>=0&&tapEnd>tapStart);const volume=parseTap({...result,stdout:tapLines.slice(tapStart,tapEnd+1).join('\n')+'\n'},components.volume.cases);
 const suiteElapsed=Number(tapLines[tapEnd].slice('# duration_ms '.length));assert(Number.isFinite(suiteElapsed)&&suiteElapsed>0&&suiteElapsed<=235000,'Actual full original volume suite exceeds 235000ms target');
 assert.equal(volume.tests,4);assert.deepEqual(volume.variants,predecessors.map(p=>p.executions.at(-1).name));
 const lines=result.stdout.split(/\r?\n/),current=lines.filter(l=>l.startsWith('# {"measurement":"volume-schedule-current-receipt"')).map(l=>JSON.parse(l.slice(2)));
 assert.equal(current.length,1);const receipt=JSON.parse(readBound(current[0].index));assert.equal(receipt.candidate,current[0].candidate);assert.equal(receipt.custodian.nonce,current[0].nonce);for(const kind of ['stdout','stderr'])readBound(current[0].custodianOutput[kind]);await validateReceipt(receipt);
 const report=lines.filter(l=>l.startsWith('{"measurement":"storage-test-report"')).map(l=>JSON.parse(l));assert.equal(report.length,1);assert.equal(report[0].reports.length,1);assert.equal(report[0].reports[0].suite,'volume');
 const actual=report[0].reports[0];assert.equal(actual.tests,4);assert.deepEqual(actual.variants,predecessors.map(p=>p.executions.at(-1).name));
 assert.deepEqual(containers(),censusBefore);assert.equal(candidateSnapshot().digest,candidate.digest);
 const measurements=[],refusals=[];
 async function proof(name,body){const values=await body();assert(values.length>0);measurements.push({name,positive:values.length,proofs:values.map(hash)});console.log(JSON.stringify({measurement:'schedule-variant',name,observations:values}));}
 async function refuse(name,changed){await assert.rejects(validateReceipt(changed));refusals.push(name);return {sabotage:name,refused:true,candidate:candidate.digest};}
 function clone(){return structuredClone(receipt);}
 function rewrite(child,stdout){const path=resolve(journal.root.path,'sabotage-'+refusals.length+'-'+hash(stdout).slice(7,20)+'.log');durableFile(path,stdout);child.stdout={path,bytes:Buffer.byteLength(stdout),sha256:hash(stdout)};}
 await t.test(variants[0],()=>proof(variants[0],async()=>receipt.children.map(c=>({component:c.component,tests:c.report.tests,executions:c.report.executions,observations:c.observations,stdout:c.stdout,stderr:c.stderr,worker:c.worker,fixture:c.fixture,candidate:c.candidate}))));
 await t.test(variants[1],()=>proof(variants[1],async()=>receipt.events.filter(e=>e.phase==='fresh-migration-environment').map((e,i)=>({...e,environment:receipt.children[i].environment,sourceDigest:receipt.children[i].sourceDigest}))));
 await t.test(variants[2],()=>proof(variants[2],async()=>[...receipt.events.filter(e=>['fixture-before','fixture-open','fixture-finally','all-workers-settled'].includes(e.phase)),...priorFailures]));
 await t.test(variants[3],()=>proof(variants[3],async()=>[{phaseDurations:receipt.phaseDurations,originalCommandElapsed:elapsed,actualOriginalSuiteElapsed:suiteElapsed,unchangedSuiteLimit:240000,target:235000,workStarted:receipt.workStarted,workEnded:receipt.workEnded,workerIntervals:receipt.children.map(c=>({component:c.component,started:c.started,ended:c.ended}))}]));
 await t.test(variants[4],()=>proof(variants[4],async()=>{
  const a=clone();a.children.pop();const b=clone();b.children[2]=structuredClone(b.children[1]);return [await refuse('missing-child',a),await refuse('duplicate-child',b)];
 }));
 await t.test(variants[5],()=>proof(variants[5],async()=>{
  const values=[];
  for(const p of predecessors){
   const i=predecessors.indexOf(p),a=clone(),raw=readBound(a.children[i].stdout).toString(),lines=raw.split('\n');
   const start=lines.indexOf('    # Subtest: '+p.executions[0].name),end=lines.findIndex((l,n)=>n>start&&l==='    # Subtest: '+p.executions[1].name);assert(start>=0&&end>start);
   const missing=[...lines.slice(0,start),...lines.slice(end)].map(l=>l.replace(/^    ok (\d+) - /,(_,n)=>'    ok '+(Number(n)-1)+' - ').replace(/^    1\.\.(\d+)$/,(_,n)=>'    1..'+(Number(n)-1)).replace(/^# (tests|pass) (\d+)$/,(_,k,n)=>'# '+k+' '+(Number(n)-1))).join('\n');
   rewrite(a.children[i],missing);values.push(await refuse('missing-leaf-'+p.component,a));
   const b=clone(),duplicate=raw.replaceAll(p.executions[0].name,p.executions[1].name);rewrite(b.children[i],duplicate);values.push(await refuse('duplicate-leaf-'+p.component,b));
  }return values;
 }));
 await t.test(variants[6],()=>proof(variants[6],async()=>{
  const values=[];
  for(const kind of ['failed','skipped','TODO','cancelled']){
   const a=clone(),c=a.children[0],raw=readBound(c.stdout).toString();
   const changed=kind==='failed'?raw.replace(/^    ok 1 - /m,'    not ok 1 - '):kind==='cancelled'?raw.replace('# cancelled 0','# cancelled 1'):raw.replace(/^(    ok 1 - .+)$/m,'$1 # '+(kind==='skipped'?'SKIP':'TODO')+' sabotage');
   assert.notEqual(changed,raw);rewrite(c,changed);values.push(await refuse(kind+'-child',a));
  }return values;
 }));
 await t.test(variants[7],()=>proof(variants[7],async()=>{
  const values=[];
  for(const field of ['candidate','fixture','environment','observations','binding','emittedDigest','sourceDigest','worker']){
   const a=clone(),c=a.children[0];
   if(field==='candidate'||field==='emittedDigest'||field==='sourceDigest')c[field]='sha256:'+'0'.repeat(64);
   else if(field==='fixture')c.fixture=structuredClone(a.fixtures[1]);
   else if(field==='environment')c.environment.instance=a.fixtures[1].identity.instance;
   else if(field==='observations')c.observations.positives.read=0;
   else if(field==='binding')c.binding.observationsDigest='sha256:'+'0'.repeat(64);
   else c.worker.nonce=a.workers[1].nonce;
   values.push(await refuse('stale-unbound-'+field,a));
  }
  const a=clone(),c=a.children[0],raw=readBound(c.stdout).toString(),record=raw.split('\n').find(l=>l.startsWith('# {"schemaVersion":1,"measurement":"storage-observations"'));assert(record);
  const value=JSON.parse(record.slice(2));value.suite='volume-drafts';rewrite(c,raw.replace(record,'# '+JSON.stringify(value)));values.push(await refuse('stale-observation-identity',a));
  return values;
 }));
 assert.deepEqual(containers(),censusBefore);assert.equal(candidateSnapshot().digest,candidate.digest);
 const behavior={schemaVersion:1,measurement:'storage-volume-schedule-behavior',candidate:candidate.digest,variants:measurements,refusals,actualChildTests:48,originalVolumeTests:4,raw,receipt:current[0].index,phaseDurations:receipt.phaseDurations,censusBefore,censusAfter:containers(),externalQualification:'pending'};
 const index=writeReceipt(journal,{status:'passed',behavior});console.log(JSON.stringify(behavior));console.log(JSON.stringify({measurement:'schedule-proof-receipt',index}));
});
