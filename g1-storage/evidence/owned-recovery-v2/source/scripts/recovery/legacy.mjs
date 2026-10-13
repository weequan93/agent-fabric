import assert from 'node:assert/strict';
import { readFileSync,lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { root,cache } from '../paths.mjs';
import { hash,containers,observeContainer,removeContainer,observeRoot,removeRoot,
 observeProcess,removeProcess,processCensus } from './ownership.mjs';

const job='job-27c90a1221';
const streamPins=[{bytes:19786,sha256:'sha256:c4788a221ffa218e49e2a10ff51dfd74aee428e9c9c3e5155978824aedbef480'},
 {bytes:2663,sha256:'sha256:fed715b7be0d03a4c4bbacecd34346b17f32f7a0d74604c3a1504ac8bc4231d6'}];
export function legacyInputs(){
 const index=JSON.parse(readFileSync(resolve(root,'g1-storage/evidence/f05-05-volume-integration-v1.json'),'utf8'));
 assert.equal(index.controllerJob,job);assert.equal(index.status,'fail');assert.equal(index.streams.length,2);
 const originalStreams=index.streams.map((s,i)=>{
  assert.equal(s.bytes,streamPins[i].bytes);assert.equal('sha256:'+s.sha256,streamPins[i].sha256);
  for(const path of [s.path,s.controllerPath]){
   assert(lstatSync(resolve(root,path)).isFile());const bytes=readFileSync(resolve(root,path));
   assert.equal(bytes.length,s.bytes);assert.equal(hash(bytes),streamPins[i].sha256);
  }
  return {path:s.path,...streamPins[i]};
 });
 const records=readFileSync(resolve(root,index.streams[0].path),'utf8').split('\n').filter(l=>/^# \{/.test(l)).map(l=>JSON.parse(l.slice(2)));
 const fixtures=records.filter(r=>r.measurement==='storage-owned-fixture'),fixture=fixtures.at(-1);
 assert.deepEqual(fixture,index.lastInterruptedFixture);
 const processes=records.filter(r=>r.measurement==='model-owned-process');assert.equal(processes.length,3);
 const last=processes.at(-1);assert.equal(last.pid,50469);assert.equal(last.ppid,50105);
 assert.equal(last.marker,'270c9cf9-4a19-47e9-85ae-d45ef032202a');
 assert.equal(last.instance,'50008/Thu Oct  8 16:56:36 2026');
 assert(!records.some(r=>r.measurement==='model-owned-process-cleanup'&&r.pid===last.pid));
 const container={owner:fixture.owner,instance:fixture.instance,id:fixture.containerId,name:'agent-fabric-storage-'+fixture.instance};
 const rootPath='/private/tmp/agent-fabric-storage-e6o6Yo';
 const identity=v=>({owner:fixture.owner,instance:fixture.instance,...v});
 const roots=[{path:rootPath,identity:identity(fixture.fixtureRoot)},
  ...Object.entries(fixture.roots).map(([kind,v])=>({path:resolve(rootPath,kind),identity:identity(v)}))];
 const process={pid:last.pid,nonce:last.marker,instance:last.instance,parentPid:last.ppid,mode:'orphan',
  command:processCommand(last.marker)};
 return {job,originalStreams,container,roots,process,rootPath,fixture};
}
function processCommand(nonce){return [process.execPath,resolve(cache,'g1-storage/tests/helpers/idp-process.js'),nonce].join(' ');}
export async function legacyObservations(input=legacyInputs()){
 return [await observeProcess(input.process),observeContainer(input.container),...input.roots.map(r=>observeRoot(r.path,r.identity))];
}
export async function recoverLegacy(sentinel){
 const input=legacyInputs(),censusBefore=containers(),before=await legacyObservations(input);
 console.log(JSON.stringify({measurement:'legacy-recovery-preflight',originalStreams:input.originalStreams,censusBefore,observations:before}));
 const rows=await processCensus();
 // The last IdP is the sole unresolved child. Never silently clean unknown siblings.
 assert(!rows.some(r=>r.command.includes(resolve(cache,'g1-storage/tests/helpers/idp-process.js'))&&r.command.endsWith(' '+input.process.nonce)&&r.pid!==input.process.pid));
 const outcomes=[];
 if(before.some(r=>r.state==='refused')){
  const after=await legacyObservations(input);
  for(let i=0;i<before.length;i++)outcomes.push({action:before[i].state==='absent'?'already-absent':'refused',
   before:before[i],after:after[i],signals:[],refusal:before[i].state==='absent'?null:'Recovery preflight refused; no mutation'});
 }else{
  outcomes.push(await removeProcess(input.process));
  outcomes.push(removeContainer(input.container));
  // Preserve current observations for every child, then delete only the proven parent.
  const childrenBefore=input.roots.slice(1).map(r=>observeRoot(r.path,r.identity));
  const parentOutcome=removeRoot(input.roots[0].path,input.roots[0].identity,input.roots.slice(1));
  outcomes.push(parentOutcome);
  input.roots.slice(1).forEach((r,i)=>{
   const after=observeRoot(r.path,r.identity);assert.equal(after.state,'absent');
   outcomes.push({action:childrenBefore[i].state==='absent'?'already-absent':'removed',before:childrenBefore[i],after,signals:[],refusal:null});
  });
 }
 const censusAfter=containers();
 const expected=censusBefore.filter(id=>!outcomes.some(o=>o.before.kind==='container'&&o.before.id===id&&o.action==='removed'));
 assert.deepEqual(censusAfter,expected,'Every unrelated labelled container preserved');
 const sentinelProofs=await sentinel();
 const value={job:input.job,originalStreams:input.originalStreams,rootPath:input.rootPath,
  owner:input.container.owner,instance:input.container.instance,originalContainerCensus:input.fixture.preexistingContainers,
  censusBefore,censusAfter,outcomes,refusals:outcomes.filter(o=>o.action==='refused').length,
  residue:outcomes.filter(o=>o.after.state!=='absent').length,
  commandBasis:'unchanged-launchOwned-and-idp-registration',sentinelProofs,sentinelPreserved:true};
 // The failed record is diagnostic only. Refusal is never exported as executed recovery.
 console.log(JSON.stringify({measurement:'legacy-current-recovery',...value}));
 assert.equal(value.refusals,0,'Recovery refusal remains unresolved');assert.equal(value.residue,0,'Legacy resource residue');
 return value;
}
