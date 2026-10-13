import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync,writeFileSync,lstatSync } from 'node:fs';
import { cwd,root,cache } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { withStorageFixture } from '../fixture.mjs';
import { hash,containers,processTools,freshExpected,observeProcess,observeContainer,removeRoot,assertPrivateFile } from '../recovery/ownership.mjs';
import { readJournal } from './journal.mjs';
import { fixtureIdentity } from './lifetimes.mjs';
import { launchFresh } from './processes.mjs';
const schema=await import(pathToFileURL(resolve(cache,'g1-storage/src/custodian-receipt.js')).href);
const candidate=candidateSnapshot(),names=JSON.parse(readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json'))).variants['VOLUME-CUSTODIAN/behavior'];
assert.equal(process.argv.length,2);assert.equal(names.length,8);
const variants=[],probes=[],receipts=new Map(),sentinelProofs=[];
const {launchOwned,stopOwned,assertOwned,census,waitUntil}=await processTools();
function record(name,proofs,refusals=0){const record=schema.CustodianVariantSchema.parse({name,positive:proofs.length,refusals,proofs:proofs.map(hash)});variants.push(record);console.log(JSON.stringify({measurement:'custodian-variant',name,observations:proofs}));}

test('VOLUME-CUSTODIAN/behavior / durable work, actual process loss and exact LIFO recovery',async t=>{
 const before=containers();
 await withStorageFixture(async sentinel=>{
  const identity=fixtureIdentity(sentinel,'unowned-sentinel'),file=resolve(identity.roots[0].path,'unowned-sentinel.bin'),bytes=randomBytes(71);
  writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
  const p=await launchOwned(resolve(cwd,'scripts/recovery/probe-process.mjs'),'FABRIC_RECOVERY_PROBE',{}),expected=await freshExpected(p);
  async function sentinels(){assert.deepEqual(readFileSync(file),bytes);assert.equal(observeContainer(identity.container).state,'owned');const row=await observeProcess(expected);assert.equal(row.state,'owned');return [hash(readFileSync(file)),hash(observeContainer(identity.container).inspectDigest),hash({instance:row.instance,command:row.commandDigest})];}
  async function run(scenario){
   sentinelProofs.push(...await sentinels());const current=containers(),ownerMode=scenario==='owner-loss';
   const child=await launchFresh(resolve(cwd,'scripts/custodian/'+(ownerMode?'probe-owner':'custodian-process')+'.mjs'),ownerMode?{operation:'owner-loss-probe',candidate:candidate.digest}:{operation:'closed-probe',scenario,candidate:candidate.digest});
   const journal=child.ready.journal;assert(journal);let index;
   try{
    if(ownerMode){
     await waitUntil(async()=>child.messages.some(m=>m.event?.phase==='all-durable'),'owner sees durable work',15000);
     const rows=census(),custodian=rows.find(r=>r.pid===child.ready.custodian.pid);
     assert.equal(custodian.ppid,child.pid);assert.equal(custodian.instance,child.ready.custodian.instance);assert.equal(custodian.command,child.ready.custodian.command);
     assertOwned(child,rows.find(r=>r.pid===child.pid));assert(child.child.kill('SIGKILL'));assert.equal((await child.exit).signal,'SIGKILL');
     await waitUntil(async()=>lstatSync(resolve(journal.root.path,'receipt.json'),{throwIfNoEntry:false})&&!census().some(r=>r.pid===custodian.pid),'surviving custodian cleanup and absence',15000);
     const path=resolve(journal.root.path,'receipt.json'),b=readFileSync(path);index={path,bytes:b.length,sha256:hash(b)};
    }else{
     await waitUntil(async()=>child.messages.some(m=>m.kind==='receipt'),'custodian cleanup receipt',30000);
     index=child.messages.find(m=>m.kind==='receipt').index;const exit=await child.exit;
     assert.equal(exit.signal,null);assert.equal(exit.code,scenario==='normal'?0:1);await stopOwned(child);
    }
    assertPrivateFile(index.path);const raw=readFileSync(index.path);assert.equal(raw.length,index.bytes);assert.equal(hash(raw),index.sha256);
    const receipt=JSON.parse(raw);assert.equal(receipt.scenario,scenario);assert.equal(receipt.candidate,candidate.digest);
    assert.equal(receipt.status,scenario==='normal'?'passed':'failed');assert.deepEqual(receipt.censusBefore,current);assert.deepEqual(receipt.censusAfter,current);
    const expectedFailures=scenario==='normal'?[]:scenario==='cleanup-failure'?['Owned storage fixture execution/cleanup failed','owned residue remains']:
     [...(scenario==='owner-loss'?['suite-owner-disconnected']:scenario==='owner-deadline'?['suite-owner-deadline-expired']:[]),'worker-lost-'+scenario,'nonzero worker outcome'];
    assert.deepEqual(receipt.failures,expectedFailures,'Injected work failure cannot mask another failure');
    const journalEvents=readJournal(journal).slice(1).map(l=>l.event);assert.deepEqual(journalEvents.slice(0,-1),receipt.events);
    const durable=receipt.events.filter(e=>e.phase==='durable-worker'),settled=receipt.events.filter(e=>e.phase==='worker-settled');
    assert.equal(durable.length,3);assert.equal(settled.length,3);assert.equal(new Set(durable.map(e=>e.worker.pid)).size,3);
    assert.equal(new Set(durable.map(e=>e.proof.environment.databasePort)).size,3);
    for(const [i,e] of durable.entries()){
     assert(e.proof.encrypted&&e.proof.fsynced&&e.proof.databaseCommitted);assert.equal(e.proof.idpHttpStatus,200);assert(e.proof.bytes>0);
     assert.equal(e.proof.environment.fixtureRoot,receipt.fixtures[i].path);assert.deepEqual(e.proof.environment.roots,receipt.fixtures[i].roots.map(r=>r.path));
     const outcome=settled.find(s=>s.worker.pid===e.worker.pid);assert(outcome);
     if(i===1&&scenario!=='normal'&&scenario!=='cleanup-failure'){assert.equal(outcome.signal,'SIGKILL');assert.equal(outcome.code,null);}
     else{assert.equal(outcome.signal,null);assert.equal(outcome.code,0);}
    }
    const finallyEvents=receipt.events.filter(e=>e.phase==='fixture-finally');assert.deepEqual(finallyEvents.map(e=>e.label),['C','B','A']);
    const joinIndex=receipt.events.findIndex(e=>e.phase==='all-workers-settled');assert(joinIndex>0);assert(receipt.events.findIndex(e=>e.phase==='fixture-finally')>joinIndex);
    const releaseIndex=receipt.events.findIndex(e=>e.phase==='workers-released');assert(releaseIndex>0);
    assert.equal(receipt.events.slice(0,releaseIndex).filter(e=>e.phase==='fixture-open').length,3);
    assert.equal(receipt.events.slice(0,releaseIndex).filter(e=>e.phase==='worker-born').length,3);
    assert(receipt.events.findIndex(e=>e.phase==='durable-worker')>releaseIndex);
    for(const e of finallyEvents)assert.deepEqual(e.containers,e.expected);
    for(const [i,f] of receipt.fixtures.entries()){
     const open=receipt.events.find(e=>e.phase==='fixture-open'&&e.fixture.label===f.label);
     assert.deepEqual(open.before,[...current,...receipt.fixtures.slice(0,i).map(f=>f.container.id)].sort());
    }
    if(scenario==='cleanup-failure'){
     assert(receipt.failures.includes('Owned storage fixture execution/cleanup failed'));assert.deepEqual(receipt.residue,[receipt.dirtyRoot.fixture.path]);
     const f=receipt.dirtyRoot.fixture;assert.equal(lstatSync(f.path).ino,f.identity.inode);
     assert.equal(JSON.parse(readFileSync(resolve(f.path,'.storage-owner.json'))).instance,receipt.custodian.nonce);
     // Restore only the fresh reproducible marker after the failure was recorded;
     // recovery then uses the unchanged original root guards.
     writeFileSync(resolve(f.path,'.storage-owner.json'),JSON.stringify(receipt.dirtyRoot.originalMarker));
     assert.equal(removeRoot(f.path,f.identity,f.roots).action,'removed');
    }else assert.deepEqual(receipt.residue,[]);
    const currentRows=census();for(const e of durable){assert(!currentRows.some(r=>r.pid===e.worker.pid||r.pid===e.child.pid||r.command.includes(e.worker.nonce)||r.command.includes(e.child.nonce)));}
    for(const f of receipt.fixtures){assert(!lstatSync(f.path,{throwIfNoEntry:false}));assert(!containers().includes(f.container.id));}
    for(const e of settled)for(const kind of ['stdout','stderr']){const s=e.streams[kind];assertPrivateFile(s.path);const b=readFileSync(s.path);assert.equal(b.length,s.bytes);assert.equal(hash(b),s.sha256);}
    if(['worker-deadline','owner-deadline'].includes(scenario)){
     const prefix=scenario==='worker-deadline'?'worker':'suite-owner',expire=receipt.events.find(e=>e.phase===prefix+'-deadline-expired');assert(expire.observed>=expire.installed);assert(receipt.events.findIndex(e=>e===expire)>receipt.events.findIndex(e=>e.phase==='all-durable'));
    }
    if(ownerMode){const loss=receipt.events.find(e=>e.phase==='owner-loss-observed');assert.equal(loss.current,null);assert.equal(loss.owner.pid,child.pid);}
    if(scenario!=='normal'&&scenario!=='cleanup-failure'){
     const died=receipt.events.find(e=>e.phase==='worker-death-proven');assert.equal(died.result.signal,'SIGKILL');
     const recovered=receipt.cleanup.find(e=>e.action==='removed');assert(recovered);assert.equal(recovered.before.ppid,1);assert.equal(recovered.expected.parentPid,died.worker.pid);assert.equal(recovered.expected.parentInstance,died.worker.instance);assert.equal(recovered.after,'absent');
    }
    assert(receipt.phaseDurations.total<30000);assert.deepEqual(containers(),current);sentinelProofs.push(...await sentinels());
    const summary=schema.CustodianProbeSummarySchema.parse({schemaVersion:1,scenario,candidate:candidate.digest,status:receipt.status,receipt:index,journalDigest:hash(readFileSync(journal.path)),
     fixtureInstances:receipt.fixtures.map(f=>f.identity.instance),workerBirths:durable.map(e=>e.worker.pid+'/'+e.worker.instance),childBirths:durable.map(e=>e.child.pid+'/'+e.child.instance),
     censusBefore:current,censusAfter:containers(),fixtureFinallyOrder:finallyEvents.map(e=>e.label),durableWorkers:3,settledWorkers:3,ownedResidue:0,totalMilliseconds:Math.ceil(receipt.phaseDurations.total)});
    probes.push(summary);receipts.set(scenario,receipt);console.log(JSON.stringify({measurement:'custodian-current-probe',summary,receipt}));return receipt;
   }finally{if(child.child.exitCode===null&&child.child.signalCode===null)throw new Error('Live owner/custodian remains; task fails closed');}
  }
  try{
   await t.test(names[0],async()=>{const r=await run('normal');record(names[0],r.events.filter(e=>['fixture-open','fixture-finally','all-workers-settled'].includes(e.phase)));});
   await t.test(names[1],async()=>{const r=await run('sigkill');record(names[1],r.events.filter(e=>['durable-worker','worker-death-proven','child-cleaned'].includes(e.phase)));});
   await t.test(names[2],async()=>{const r=await run('worker-deadline');record(names[2],r.events.filter(e=>['all-durable','worker-deadline-installed','worker-deadline-expired','worker-death-proven','child-cleaned'].includes(e.phase)));});
   await t.test(names[3],async()=>{const a=await run('owner-loss'),b=await run('owner-deadline');record(names[3],[a.custodian,...a.events.filter(e=>['owner-loss-observed','worker-death-proven','child-cleaned'].includes(e.phase)),...b.events.filter(e=>['suite-owner-deadline-installed','suite-owner-deadline-expired'].includes(e.phase))]);});
   await t.test(names[4],()=>{const r=receipts.get('sigkill');assert(r);record(names[4],[r.cleanup.find(c=>c.action==='removed'),...r.events.filter(e=>e.phase==='worker-death-proven')]);});
   await t.test(names[5],async()=>{const r=await run('refusals'),e=r.events.find(e=>e.phase==='actual-cleanup-refusals');assert.deepEqual(e.refusals,['missing-journal','substituted-journal-inode','substituted-journal-nonce','substituted-journal-instance','substituted-process-birth','substituted-process-nonce','substituted-process-parent','substituted-fixture-root']);record(names[5],[e,...r.cleanup],e.refusals.length);});
   await t.test(names[6],async()=>{const r=await run('cleanup-failure');assert.equal(r.status,'failed');record(names[6],[r.failures,r.residue,r.dirtyRoot]);});
   await t.test(names[7],async()=>{assert.equal(probes.length,7);sentinelProofs.push(...await sentinels());record(names[7],[{container:identity.container,process:expected,fileDigest:hash(readFileSync(file)),probes:probes.map(p=>p.scenario)},sentinelProofs]);});
  }finally{await stopOwned(p);}
 });
 assert.deepEqual(variants.map(v=>v.name),names);assert.equal(candidateSnapshot().digest,candidate.digest);assert.deepEqual(containers(),before);
 const behavior=schema.CustodianBehaviorSchema.parse({schemaVersion:1,measurement:'storage-volume-custodian-behavior',candidate:candidate.digest,variants,probes,sentinelProofs:[...new Set(sentinelProofs)],censusBefore:before,censusAfter:containers(),cleanup:'complete',assurance:'deterministic-local-only',paidCallsAllowed:false,externalQualification:'pending'});
 console.log(JSON.stringify(behavior));
});
