// Exact admission supplements the frozen registry. Controls are never product evidence.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cwd,root,cache,postgresImage} from './paths.mjs';
import {candidateSnapshot} from './candidate.mjs';
import {compositionDigest as hash} from './composition-preservation.mjs';
import {parseTap} from './process-result.mjs';
import {validateObservations} from './observation-gate.mjs';
import {decodeFullReceipt} from './full-receipt-transport.mjs';
import {decodeFullDiagnostic} from './full-diagnostic-transport.mjs';
const inventory=JSON.parse(readFileSync(resolve(cwd,'verification/full-predecessor-inventory-v1.json'),'utf8'));
const observations=new Set(['storage-observations','propagation-verification-observations','volume-verification-observations']);
const plain=v=>JSON.parse(JSON.stringify(v));
export function fullDescriptor(id){return Object.hasOwn(inventory.suites,id)?inventory.suites[id]:null;}
export function fullSources(id,registration){
 const d=fullDescriptor(id);assert(d);const s=d.registrations.find(r=>r.id===registration);assert(s);
 const paths=[d.wrapper,s.source,'scripts/fixture.mjs','scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/full-receipt-transport.mjs','scripts/full-diagnostic-transport.mjs','scripts/manifest.mjs','verification/full-predecessor-inventory-v1.json'];
 return Object.fromEntries(paths.map(p=>[p,hash(readFileSync(resolve(cwd,p)))]));
}
function supervisor(env){
 const roots=JSON.parse(env.STORAGE_OWNED_ROOTS);
 return {owner:env.STORAGE_FIXTURE_OWNER,instance:env.STORAGE_FIXTURE_INSTANCE,fixtureRoot:env.STORAGE_FIXTURE_ROOT,
  roots:plain(roots),databaseDigest:hash(env.STORAGE_DATABASE_URL),repoRoot:env.STORAGE_REPO_ROOT,ownerRoot:env.STORAGE_OWNER_ROOT};
}
export function createFullContext(id,candidate,env){
 assert(fullDescriptor(id));assert.equal(candidate,candidateSnapshot().digest);
 const value={version:1,suite:id,candidate,supervisor:supervisor(env)};
 assert.equal(value.supervisor.repoRoot,root);assert.equal(value.supervisor.ownerRoot,cache);return value;
}
export function registrationBinding(context,spec,index){
 return {...context,registration:spec.id,ordinal:index,sources:fullSources(context.suite,spec.id)};
}
export function validateFullTap(result,id){
 const d=fullDescriptor(id);assert(d);
 const report=parseTap(result,d.parents);
 assert.deepEqual(report.cases,d.parents,'Exact full parent identities and order');
 assert.deepEqual(report.executions,d.executions,'Every mandatory full parent and leaf exactly once');
 assert.equal(report.tests,d.parents.length+d.leaves);return report;
}
function records(stdout){
 const rows=[];let pending='';
 for(const line of stdout.split(/\r?\n/)){
  const comment=/^\s*# (.*)$/.exec(line);
  if(!comment){assert.equal(pending,'','Interrupted full JSON observation/receipt');continue;}
  if(!pending&&!comment[1].startsWith('{'))continue;
  pending+=comment[1];
  let value;try{value=JSON.parse(pending);}catch(error){if(error instanceof SyntaxError)continue;throw error;}
  const raw=pending;pending='';
  assert.equal(typeof value.measurement,'string','Full record measurement header required');
  assert(!['storage-full-registration-start','storage-full-registration-end'].includes(value.measurement),'Raw legacy full receipt refused');
  if(value.measurement==='storage-full-sql-diagnostic'){
   assert.equal(JSON.stringify(value),raw,'Canonical diagnostic envelope; duplicate keys refused');
   const decoded=decodeFullDiagnostic(value);rows.push({raw:decoded.raw.toString('utf8'),value:decoded.diagnostic,diagnosticOnly:true,productQualification:false});
  }else if(value.measurement==='storage-full-receipt'){
   assert.equal(JSON.stringify(value),raw,'Canonical envelope; duplicate keys refused');
   const decoded=decodeFullReceipt(value);rows.push({raw:decoded.raw.toString('utf8'),value:decoded.value});
  }else{
   assert(!Object.hasOwn(value,'diagnosticOnly')&&!Object.hasOwn(value,'productQualification')&&!(Object.hasOwn(value,'data')&&Object.hasOwn(value,'count')&&Object.hasOwn(value,'digest')),'Unrecognized SQL diagnostic envelope refused');
   assert.notEqual(value.measurement,'maintenance-sql-diagnostic','Raw SQL diagnostic refused');
   assert(!value.measurement?.startsWith('storage-full-'),'Unknown full receipt header');rows.push({raw,value});
  }
 }
 assert.equal(pending,'','Complete full JSON observation/receipt required');return rows;
}
export function validateFullObservations(stdout,id,context,schema){
 const d=fullDescriptor(id);assert(d);assert.equal(context.suite,id);
 const rows=records(stdout),starts=rows.filter(r=>r.value.measurement==='storage-full-registration-start'),ends=rows.filter(r=>r.value.measurement==='storage-full-registration-end');
 assert.equal(starts.length,d.registrations.length,'Every original full registration');assert.equal(ends.length,starts.length);
 const actual=rows.filter(r=>observations.has(r.value.measurement));assert.equal(actual.length,d.records,'Exact full observation count');
 const fixtureCount=d.registrations.reduce((n,s)=>n+s.fixtures,0);
 assert.equal(rows.filter(r=>r.value.measurement==='storage-owned-fixture').length,fixtureCount,'No extra or omitted fixture origins');
 assert.equal(rows.filter(r=>['storage-container-cleanup','storage-root-cleanup'].includes(r.value.measurement)).length,fixtureCount*2,'No unbound cleanup origins');
 const admitted=[],diagnostics=[],owners=new Set(),instances=new Set(),containerIds=new Set(),rootIds=new Set(Object.values(context.supervisor.roots).map(r=>r.rootId));let previous=-1;
 for(const [i,spec] of d.registrations.entries()){
  const begin=starts[i],end=ends[i],a=rows.indexOf(begin),b=rows.indexOf(end),binding=registrationBinding(context,spec,i);
  assert(a>previous&&b>a,'Sequential nonoverlapping original registrations');previous=b;
  assert.deepEqual(begin.value,{measurement:'storage-full-registration-start',binding});
  const range=rows.slice(a+1,b),source=range.filter(r=>observations.has(r.value.measurement));
  for(const r of range.filter(r=>r.diagnosticOnly))diagnostics.push({registration:spec.id,raw:r.raw,rawDigest:hash(r.raw),diagnostic:r.value,diagnosticOnly:true,productQualification:false});
  assert.equal(source.length,1,'Exactly one actual origin per registration');assert.equal(source[0].value.measurement,spec.measurement);assert.equal(source[0].value.suite,spec.suite);
  const fixtures=range.filter(r=>r.value.measurement==='storage-owned-fixture').map(r=>r.value);
  const cleanup=range.filter(r=>['storage-container-cleanup','storage-root-cleanup'].includes(r.value.measurement)).map(r=>r.value);
  assert.equal(fixtures.length,spec.fixtures,'Every mandatory owned fixture lifetime');assert.equal(cleanup.length,fixtures.length*2);
  const stack=[];
  for(const {value:v} of range){
   if(v.measurement==='storage-owned-fixture'){
    assert.equal(v.assurance,'deterministic-local-only');assert.equal(v.paidCallsAllowed,false);assert.equal(v.loopback,true);
    assert.equal(v.image,postgresImage);assert(v.version.startsWith('PostgreSQL 16.12 '));
    assert.match(v.owner,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(v.instance,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    assert.match(v.containerId,/^[a-f0-9]{64}$/);assert(!containerIds.has(v.containerId),'Independent actual container');containerIds.add(v.containerId);
    assert(Array.isArray(v.preexistingContainers));assert(!v.preexistingContainers.some(id=>v.containerId.startsWith(id)),'Fresh container absent from prior census');
    assert.deepEqual(Object.keys(v.roots),['content','backup','restore','authority']);
    for(const r of [v.fixtureRoot,...Object.values(v.roots)]){
     assert.deepEqual(Object.keys(r),['rootId','device','inode']);assert.match(r.rootId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
     assert(Number.isSafeInteger(r.device)&&r.device>0&&Number.isSafeInteger(r.inode)&&r.inode>0);
    }
    for(const [set,key] of [[owners,v.owner],[instances,v.instance],[rootIds,v.fixtureRoot.rootId]]){assert(!set.has(key),'Independent fixture identities');set.add(key);}
    for(const r of Object.values(v.roots)){assert(!rootIds.has(r.rootId),'Independent child/supervisor root identity');rootIds.add(r.rootId);}
    assert.notEqual(v.owner,context.supervisor.owner);assert.notEqual(v.instance,context.supervisor.instance);stack.push({fixture:v,containerClosed:false});
   }else if(v.measurement==='storage-container-cleanup'){
    const frame=stack.at(-1);assert(frame);assert.equal(frame.containerClosed,false,'Exactly one container cleanup per fixture');frame.containerClosed=true;
    const f=frame.fixture;assert.equal(v.owner,f.owner);assert.equal(v.instance,f.instance);assert.equal(v.containerId,f.containerId);assert.equal(v.removed,true);assert.equal(v.censusUnchanged,true);
   }else if(v.measurement==='storage-root-cleanup'){
    const frame=stack.pop();assert(frame);assert.equal(frame.containerClosed,true,'Container cleanup precedes root cleanup exactly once');
    const f=frame.fixture;assert.equal(v.owner,f.owner);assert.equal(v.instance,f.instance);assert.equal(v.rootId,f.fixtureRoot.rootId);assert.equal(v.removed,true);assert.deepEqual(v.rootIds,Object.values(f.roots).map(r=>r.rootId));
   }
  }
  assert.equal(stack.length,0,'Exact LIFO fixture cleanup');
  assert.deepEqual(end.value,{measurement:'storage-full-registration-end',binding,raw:source[0].raw,rawDigest:hash(source[0].raw),fixtures,cleanup});
  const raw=source[0].value;
  // Only the two closed legacy headers are converted. Their actual counters are copied intact.
  const value=spec.measurement==='storage-observations'?raw:{schemaVersion:1,measurement:'storage-observations',suite:raw.suite,positives:raw.positives,violations:raw.violations};
  if(spec.measurement!=='storage-observations')assert.deepEqual(Object.keys(raw),['measurement','suite','positives','violations']);
  const qualified=validateObservations('# '+JSON.stringify(value)+'\n',spec.suite,spec.positives,schema);
  admitted.push({registration:spec.id,binding,raw:source[0].raw,rawDigest:hash(source[0].raw),observation:qualified,fixtures,cleanup});
 }
 assert.equal(admitted.length,actual.length,'No unbound, latest-only or omitted source');
 assert.deepEqual(actual.map(r=>r.raw),admitted.map(r=>r.raw),'Every raw source admitted exactly once in original order');
 assert.deepEqual(rows.filter(r=>r.diagnosticOnly).map(r=>r.raw),diagnostics.map(r=>r.raw),'Every diagnostic bound inside its original registration');
 return {measurement:'storage-full-observation-composition',suite:id,candidate:context.candidate,sources:admitted,diagnostics};
}
