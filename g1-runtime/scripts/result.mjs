import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha} from './build.mjs';
import {exactInventory} from './inventory.mjs';
export function raw(path){const b=readFileSync(path);return {bytes:b.length,sha256:sha(b)};}
export function verifyRaw(dir,record){for(const [name,meta]of Object.entries(record))if(JSON.stringify(raw(join(dir,name)))!==JSON.stringify(meta))throw new Error('Raw byte/digest mismatch: '+name);}
export function decodeEvents(text){
 if(!text.endsWith('\n'))throw new Error('Truncated runner events');
 return text.trim().split('\n').map(line=>{let e;try{e=JSON.parse(line);}catch{throw new Error('Malformed runner events');}if(!e||typeof e.type!=='string'||!e.data)throw new Error('Invalid runner event');return e;});
}
export function assertResults({stdout,events,status,signal,timedOut,selected}){
 if(status!==0||signal||timedOut)throw new Error('Failed/signalled/timed out test child');
 const es=decodeEvents(events),summaries=es.filter(e=>e.type==='test:summary'&&e.data.file===undefined);
 if(summaries.length!==1)throw new Error('Missing/duplicate outer runner summary');
 const s=summaries[0].data,c=s.counts;
 if(!s.success||!c||c.tests!==selected.length||c.passed!==selected.length||c.topLevel!==selected.length||c.suites!==0||['failed','cancelled','skipped','todo'].some(k=>c[k]!==0))throw new Error('Nonempty complete assertions without skip/TODO/cancel required');
 const plans=es.filter(e=>e.type==='test:plan'&&e.data.nesting===0&&e.data.file===undefined);
 if(plans.length!==1||plans[0].data.count!==selected.length)throw new Error('Missing/mismatched final runner plan');
 const passes=es.filter(e=>e.type==='test:pass'&&e.data.nesting===0);
 if(es.some(e=>e.type==='test:fail'||e.type==='test:pass'&&(e.data.skip||e.data.todo)))throw new Error('Failed/skip/TODO runner event');
 exactInventory(passes.map(e=>e.data.name.split(' ')[0]),selected,'completed bound assertions');
 if(!/^TAP version 13\n/.test(stdout)||!new RegExp('^1\\.\\.'+selected.length+'$','m').test(stdout)||!new RegExp('^# tests '+selected.length+'$','m').test(stdout)||!new RegExp('^# pass '+selected.length+'$','m').test(stdout)||['fail','cancelled','skipped','todo'].some(k=>!new RegExp('^# '+k+' 0$','m').test(stdout)))throw new Error('Malformed/truncated TAP');
 if((stdout.match(/^1\.\./gm)??[]).length!==1||(stdout.match(/^# tests /gm)??[]).length!==1||/^not ok |^ok .*# (SKIP|TODO)/mi.test(stdout))throw new Error('Duplicate/failed TAP');
 return true;
}
export function assertObservations(records,{selected,nonce,candidate,processes,requirements}){
 exactInventory(records.map(r=>r.id),selected,'behavior reports');
 for(const r of records){
  if(r.nonce!==nonce||r.candidate!==candidate||!processes.some(p=>p.pid===r.pid&&p.nonce===nonce)||r.success!==true||!Array.isArray(r.observations))throw new Error('Unbound behavior observation');
  const expected=requirements[r.id];
  if(!expected?.length)throw new Error('Missing observation contract: '+r.id);
  exactInventory(r.observations.map(o=>o.kind),expected,'required observations for '+r.id);
  for(const o of r.observations)if(o.forbidden!==false||o.observed!==true||!o.detail||typeof o.detail!=='object')throw new Error('Forbidden/missing actual observation');
 }
 return true;
}
export function assertMeasurement(samples,expected){
 if(!Array.isArray(samples)||samples.length!==expected||!expected)throw new Error('Measurement denominator changed');
 let previous=-Infinity;
 for(const s of samples){if(s.status!=='passed'||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start||s.start<previous)throw new Error('Failed/cancelled/out-of-order/impossible measurement');previous=s.start;}
 return true;
}
export function writeReport(dir,report){
 if(report.assurance!=='owned-local-fixture'||report.remoteQualified!==false||report.cleanup!==true||report.success!==true||!report.pending?.length)throw new Error('Invalid local assurance/cleanup report');
 verifyRaw(dir,report.raw);
 writeFileSync(join(dir,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
