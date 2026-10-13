import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createAtomicVerificationFixture,type AtomicVerificationFixture} from './helpers/atomic-verification-fixture.js';
import {atomicPhaseAllocation,atomicHostileNames,verifyAtomicPhaseRecords,type AtomicPhaseRecord} from './helpers/atomic-disconnect-records.js';
import {emitObservations} from './helpers/observations.js';

const records:AtomicPhaseRecord[]=[],ids:string[]=[],intervals:{category:string;startedMs:number;finishedMs:number}[]=[];
const totals={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0};
const violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
const root=process.env['STORAGE_REPO_ROOT'];assert.ok(root);
const allocationPath=resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json');
const allocationBytes=readFileSync(allocationPath),allocation=JSON.parse(allocationBytes.toString());
assert.deepEqual(atomicPhaseAllocation,allocation.realPhases);assert.deepEqual(atomicHostileNames.map(n=>'AD02/'+n),allocation.hostileProbes.map((p:{id:string})=>p.id));
for(const predecessor of allocation.repairPredecessorFiles){
 const actual=createHash('sha256').update(readFileSync(resolve(root,predecessor.path))).digest('hex');
 assert.notEqual(actual,predecessor.sha256,'Substantive repaired fixture/transport required');
}
const candidateModule=await import(pathToFileURL(resolve(root,'g1-storage/scripts/candidate.mjs')).href);
const candidate=candidateModule.candidateSnapshot().digest;
const fixture=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);
let failed=false;
await test('AD01 / five fresh sequential owned phase rounds',async t=>{
 for(let round=1;round<=5;round++){
  const setupStart=performance.now();let closeStart=setupStart,callbacks=0;
  await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
   assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
   const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));let f:AtomicVerificationFixture|undefined;
   try{
    for(const [k,v] of Object.entries(state.env))process.env[k]=v;
    f=await createAtomicVerificationFixture();intervals.push({category:'setup-close',startedMs:setupStart,finishedMs:performance.now()});
    for(const phase of atomicPhaseAllocation.filter(p=>p.round===round)){
     let passed=false;
     await t.test(phase.id,async()=>{
      const r=await f!.phase(f!.fresh(),phase.table,phase.timing,phase.expectedMask);
      let cursor=r.startedMs;
      for(const extra of r.observationIntervals){
       assert.ok(extra.startedMs>=cursor&&extra.finishedMs>=extra.startedMs&&extra.finishedMs<=r.finishedMs);
       intervals.push({category:'phase-bodies',startedMs:cursor,finishedMs:extra.startedMs},{category:'independent-observations',...extra});cursor=extra.finishedMs;
      }
      intervals.push({category:'phase-bodies',startedMs:cursor,finishedMs:r.finishedMs});records.push(r);ids.push(phase.id);passed=true;
     });
     assert.ok(passed,'Stop at first failed phase; no subsequent phase or retry');
    }
    const finalStart=performance.now();await f.assertFinal();intervals.push({category:'independent-observations',startedMs:finalStart,finishedMs:performance.now()});
    for(const k of Object.keys(totals) as (keyof typeof totals)[])totals[k]+=f.positives[k];
    for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];
   }catch(error){failed=true;throw error;}
   finally{closeStart=performance.now();try{await f?.close();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
  intervals.push({category:'setup-close',startedMs:closeStart,finishedMs:performance.now()});assert.equal(callbacks,1);
 }
});

await test('AD02 / hostile verifier subprocesses on this invocation',async t=>{
 assert.equal(failed,false);const startedMs=performance.now();verifyAtomicPhaseRecords(records,ids);
 intervals.push({category:'verifier-probes',startedMs,finishedMs:performance.now()});
 const original={records,ids};const index=ids.indexOf('AD01/r05/revision-after');assert.ok(index>=0);
 for(const mutation of atomicHostileNames){
  let passed=false;
  await t.test('AD02/'+mutation,()=>{
   const startedMs=performance.now(),input=structuredClone(original),r=input.records[index]!;
   switch(mutation){
    case 'omitted-repetition':input.records.splice(index,1);input.ids.splice(index,1);break;
    case 'duplicate-repetition':input.records[index]=structuredClone(input.records[1]!);input.ids[index]=input.ids[1]!;break;
    case 'unmatched-worker-nonce':r.disconnect.nonce='unrelated-nonce';break;
    case 'changed-backend-start':r.disconnect.before.find(b=>b.pid===r.lock.backendPid)!.backend_start='1970-01-01T00:00:00.000Z';break;
    case 'wrong-observed-mask':r.lock.mask=1;break;
    case 'exit-only-disconnection':r.disconnect.polls=[];break;
    case 'late-disconnection':r.disconnect.observedGoneMs=r.disconnect.signalDispatchMs+2001;r.disconnect.elapsedMs=2001;r.disconnect.polls.at(-1)!.observedAtMs=r.disconnect.observedGoneMs;break;
    case 'saved-response':r.savedResponse=true;break;
    case 'rollback-mismatch':r.effects[0]=1;break;
    case 'lookup-mismatch':r.lookup.body['replayAllowed']=true;break;
   }
   const env={...process.env};delete env['NODE_TEST_CONTEXT'];
   const result=spawnSync(process.execPath,[fileURLToPath(new URL('./helpers/atomic-disconnect-verifier.js',import.meta.url))],{input:JSON.stringify(input),encoding:'utf8',env,timeout:1500,maxBuffer:1024*1024});
   assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'ATOMIC_DISCONNECT_REJECT:'+mutation+'\n');
   totals.harness++;passed=true;intervals.push({category:'verifier-probes',startedMs,finishedMs:performance.now()});
  });
  assert.ok(passed,'Stop at first hostile verifier failure');
 }
});
if(!failed){
 assert.equal(records.length,50);assert.equal(totals.harness,10);assert.equal(candidateModule.candidateSnapshot().digest,candidate);
 console.log(JSON.stringify({measurement:'atomic-disconnect-results',candidate,allocationDigest:'sha256:'+createHash('sha256').update(allocationBytes).digest('hex'),records,ids,intervals,finishedMs:performance.now()}));
 emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'atomic-disconnect',positives:totals,violations});
}
