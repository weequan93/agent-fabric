import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root} from './paths.mjs';

export const atomicAllocationDigest='sha256:2bd2348ce60cf11ff37a1370cad7c7dfff3a3bd29f63ac434125080b1efce872';
const bytes=readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json'));
assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),atomicAllocationDigest);
const allocation=JSON.parse(bytes);
export const atomicDisconnectSuite=Object.freeze({file:'atomic-disconnect.test.js',cases:['AD01','AD02'],integration:true,
 positives:['read','write','deny','owner','harness'],variants:{AD01:allocation.realPhases.map(p=>p.id),AD02:allocation.hostileProbes.map(p=>p.id)}});

export function assertAtomicDisconnectRegistry(suites,components){
 const names=Object.keys(suites),i=names.indexOf('commit-conflict');
 assert.equal(names[i+1],'atomic-disconnect');assert.equal(names.filter(n=>n==='atomic-disconnect').length,1);
 assert.equal(suites['atomic-disconnect'],atomicDisconnectSuite);assert.equal(components['verify-atomic-disconnect'],atomicDisconnectSuite);
 assert.equal(allocation.realPhases.length,50);assert.equal(allocation.hostileProbes.length,10);
 assert.equal(new Set([...atomicDisconnectSuite.variants.AD01,...atomicDisconnectSuite.variants.AD02]).size,60);
 return {additionalCases:2,additionalVariants:60,atomicDisconnectPlacement:'after commit-conflict'};
}

/** Parent wall time includes startup, import, fixture teardown, TAP and output.
 * All measured child intervals are disjoint; every gap consumes accounting. */
export function validateAtomicDisconnect(output,candidate,verify){
 assert.equal(output.report.tests,62);assert.equal(output.report.variants.length,60);
 assert.deepEqual(output.report.variants,[...atomicDisconnectSuite.variants.AD01,...atomicDisconnectSuite.variants.AD02]);
 const rows=[];let pending='';
 for(const line of output.result.stdout.split(/\r?\n/)){
  if(!pending&&!line.startsWith('# {"measurement":"atomic-disconnect-results"'))continue;
  assert(line.startsWith('# '),'Interrupted current-run JSON in TAP comments');pending+=line.slice(2);
  try{const value=JSON.parse(pending);rows.push(value);pending='';}
  catch(error){if(!(error instanceof SyntaxError))throw error;}
 }
 assert.equal(pending,'','Incomplete current-run JSON');
 assert.equal(rows.length,1,'Exactly one complete current-run result required');
 const r=rows[0];
 assert.equal(r.candidate,candidate);assert.equal(r.allocationDigest,atomicAllocationDigest);verify(r.records,r.ids);
 assert.deepEqual(r.ids,atomicDisconnectSuite.variants.AD01);
 const expectedBodyIntervals=[],expectedObservationIntervals=[];
 for(const record of r.records){
  assert.equal(record.observationIntervals.length,2,'Both added per-phase observations timed');
  let cursor=record.startedMs;
  for(const extra of record.observationIntervals){
   assert(Number.isFinite(extra.startedMs)&&extra.startedMs>=cursor&&Number.isFinite(extra.finishedMs)&&extra.finishedMs>extra.startedMs&&extra.finishedMs<=record.finishedMs);
   expectedBodyIntervals.push({category:'phase-bodies',startedMs:cursor,finishedMs:extra.startedMs});
   expectedObservationIntervals.push({category:'independent-observations',...extra});cursor=extra.finishedMs;
  }
  expectedBodyIntervals.push({category:'phase-bodies',startedMs:cursor,finishedMs:record.finishedMs});
 }
 assert.deepEqual(r.intervals.filter(i=>i.category==='phase-bodies'),expectedBodyIntervals,'Every original phase timed once');
 const extras=r.intervals.filter(i=>i.category==='independent-observations');
 assert.equal(extras.length,105,'One hundred phase observations plus five actual final round checks');
 assert.deepEqual(extras.filter(i=>expectedObservationIntervals.some(e=>JSON.stringify(e)===JSON.stringify(i))),expectedObservationIntervals,'Every added phase observation timed once');
 assert.equal(r.intervals.filter(i=>i.category==='setup-close').length,10,'Every fresh setup and close timed');
 assert.equal(r.intervals.filter(i=>i.category==='verifier-probes').length,11,'Positive verifier and all ten subprocesses timed');
 const limits={'setup-close':30000,'phase-bodies':150000,'independent-observations':35000,'verifier-probes':15000,'accounting':5000};
 const totals=Object.fromEntries(Object.keys(limits).map(k=>[k,0]));
 let end=0;
 for(const interval of r.intervals){
  assert(Object.hasOwn(limits,interval.category)&&interval.category!=='accounting');
  assert(Number.isFinite(interval.startedMs)&&interval.startedMs>=end&&Number.isFinite(interval.finishedMs)&&interval.finishedMs>=interval.startedMs);
  totals.accounting+=interval.startedMs-end;totals[interval.category]+=interval.finishedMs-interval.startedMs;end=interval.finishedMs;
 }
 assert(Number.isFinite(r.finishedMs)&&r.finishedMs>=end&&r.finishedMs<=output.timing.elapsedMs,'Child ledger bounded by actual parent wall');
 totals.accounting+=output.timing.elapsedMs-end;
 for(const [category,bound] of Object.entries(limits))assert(totals[category]>0&&totals[category]<=bound,category+' exceeds mandatory allocation');
 assert(output.timing.elapsedMs<=235000,'Atomic-disconnect subprocess exceeds235000ms');
 assert(Math.abs(Object.values(totals).reduce((n,v)=>n+v,0)-output.timing.elapsedMs)<0.001,'Disjoint timing covers entire parent wall');
 console.log(JSON.stringify({measurement:'atomic-disconnect-timing',clock:'parent-monotonic',elapsedMs:output.timing.elapsedMs,boundMs:235000,categories:totals,limits}));
 return totals;
}
