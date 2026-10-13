import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync,readFileSync,renameSync,symlinkSync,unlinkSync,lstatSync,readlinkSync } from 'node:fs';
import { cache,cwd,root,postgresImage } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { withStorageFixture } from '../fixture.mjs';
import { hash,now,docker,containers,createRoot,removeRoot,observeRoot,observeContainer,removeContainer,
 processTools,freshExpected,observeProcess,removeProcess,assertRecoveryPins } from './ownership.mjs';
import { recoverLegacy } from './legacy.mjs';

const schema=await import(pathToFileURL(resolve(cache,'g1-storage/src/owned-recovery-receipt.js')).href);
const variants=JSON.parse(readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json'),'utf8')).variants['OWNED-RECOVERY/behavior'];
assert.equal(process.argv.length,2);assertRecoveryPins();
const candidate=candidateSnapshot(),records=[];
const {launchOwned,stopOwned}=await processTools();
const probe=resolve(cwd,'scripts/recovery/probe-process.mjs');
function record(name,proofs,refusals=0){
 for(const p of proofs){
  if(typeof p==='string')assert.match(p,/^sha256:[a-f0-9]{64}$/);
  else if(p.kind)schema.RecoveryObservationSchema.parse(p);
  else if(p.action)schema.RecoveryOutcomeSchema.parse(p);
  else schema.LegacyRecoverySchema.parse(p);
 }
 console.log(JSON.stringify({measurement:'owned-recovery-variant',name,observations:proofs}));
 records.push(schema.RecoveryVariantSchema.parse({name,observedAt:now(),positive:proofs.length,refusals,proofs:proofs.map(hash)}));
}
function envContainer(f){return {id:JSON.parse(docker(['inspect','agent-fabric-storage-'+f.env.STORAGE_FIXTURE_INSTANCE]))[0].Id,
 name:'agent-fabric-storage-'+f.env.STORAGE_FIXTURE_INSTANCE,owner:f.env.STORAGE_FIXTURE_OWNER,instance:f.env.STORAGE_FIXTURE_INSTANCE};}
function assertRefused(outcome){schema.RecoveryOutcomeSchema.parse(outcome);assert.equal(outcome.action,'refused');assert.equal(outcome.after.state,'refused');}

test('OWNED-RECOVERY/behavior / real substitutions, sentinels and exact interrupted recovery',async t=>{
 let legacy;const globalBefore=containers();
 await withStorageFixture(async sentinel=>{
  const sentinelContainer=envContainer(sentinel),sentinelRoot=JSON.parse(sentinel.env.STORAGE_OWNED_ROOTS).content;
  const bytes=randomBytes(47),file=resolve(sentinelRoot.path,'unowned-sentinel.bin');writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
  const sentinelProcess=await launchOwned(probe,'FABRIC_RECOVERY_PROBE',{}),sentinelExpected=await freshExpected(sentinelProcess);
  try{
   await withStorageFixture(async target=>{
    const container=envContainer(target);
    await t.test(variants[0],async()=>{
     const before=observeContainer(container),census=containers();assert.equal(before.state,'owned');
     const refused=removeContainer({...container,instance:randomUUID()});assertRefused(refused);
     assert.deepEqual(containers(),census);assert.equal(observeContainer(container).state,'owned');
     const substituteRoot=createRoot(),replacementInstance=randomUUID(),parked=container.name+'-parked-'+randomUUID();let replacementId,parkedOriginal=false;
     const proofs=[before,refused];
     try{
      // The immutable original ID stays parked. A distinct real container now
      // occupies its name with the same owner and a different instance.
      assert.equal(observeContainer(container).state,'owned');docker(['rename',container.id,parked]);parkedOriginal=true;
      writeFileSync(resolve(substituteRoot.path,'postgres.env'),'POSTGRES_PASSWORD='+randomBytes(32).toString('hex')+'\nPOSTGRES_DB=storage_test\n',{mode:0o600,flag:'wx'});
      replacementId=docker(['run','--detach','--pull=never','--name',container.name,
       '--label','agent-fabric.storage-fixture-owner='+container.owner,'--label','agent-fabric.storage-fixture-instance='+replacementInstance,
       '--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432',
       '--env-file',resolve(substituteRoot.path,'postgres.env'),postgresImage]);
      const replacement={owner:container.owner,instance:replacementInstance,name:container.name,id:replacementId};
      const replacementBefore=observeContainer(replacement,{database:false});assert.equal(replacementBefore.state,'owned');
      const actualSubstitution=removeContainer(container);assertRefused(actualSubstitution);
      assert.equal(observeContainer(replacement,{database:false}).state,'owned');
      assert.equal(observeContainer({...container,name:parked}).state,'owned');
      proofs.push(replacementBefore,actualSubstitution,observeContainer(replacement,{database:false}));
     }finally{
      const errors=[];
      try{if(replacementId)assert.equal(removeContainer({owner:container.owner,instance:replacementInstance,name:container.name,id:replacementId},{database:false}).action,'removed');}catch(e){errors.push(e);}
      try{if(parkedOriginal){assert.equal(observeContainer({...container,name:parked}).state,'owned');docker(['rename',container.id,container.name]);assert.equal(observeContainer(container).state,'owned');}}catch(e){errors.push(e);}
      try{assert.equal(removeRoot(substituteRoot.path,substituteRoot.identity).action,'removed');}catch(e){errors.push(e);}
      if(errors.length)throw new AggregateError(errors,'Container substitution cleanup failed');
     }
     assert.deepEqual(containers(),census);proofs.push(observeContainer(container));record(variants[0],proofs,2);
    });
    await t.test(variants[1],()=>{
     const p=createRoot(),marker=resolve(p.path,'.storage-owner.json'),original=readFileSync(marker),payload=randomBytes(23);
     const file=resolve(p.path,'owned-probe.bin');writeFileSync(file,payload,{mode:0o600,flag:'wx'});
     try{
      writeFileSync(marker,JSON.stringify({...p.identity,owner:randomUUID()}));
      const modified=readFileSync(marker),refused=removeRoot(p.path,p.identity);assertRefused(refused);
      assert.deepEqual(readFileSync(marker),modified);assert.deepEqual(readFileSync(file),payload);
      record(variants[1],[refused,hash(readFileSync(file))],1);
     }finally{writeFileSync(marker,original);assert.equal(removeRoot(p.path,p.identity).action,'removed');}
    });
    await t.test(variants[2],()=>{
     const p=createRoot(),parked=p.path+'-parked';let replacement,linkIdentity;
     const unlinkOwnedProbe=()=>{
      const current=lstatSync(p.path);assert(linkIdentity&&current.isSymbolicLink());
      assert.equal(current.ino,linkIdentity.ino);assert.equal(current.dev,linkIdentity.dev);
      assert.equal(readlinkSync(p.path),sentinelRoot.path);unlinkSync(p.path);
     };
     const payload=randomBytes(31);
     try{
      renameSync(p.path,parked);
      replacement=createRoot(p.path+'-replacement-');renameSync(replacement.path,p.path);replacement.path=p.path;
      const file=resolve(p.path,'replacement-sentinel.bin');writeFileSync(file,payload,{mode:0o600,flag:'wx'});
      const inodeRefusal=removeRoot(p.path,p.identity);assertRefused(inodeRefusal);
      assert.notEqual(lstatSync(p.path).ino,p.identity.inode);assert.deepEqual(readFileSync(file),payload);
      assert.equal(removeRoot(p.path,replacement.identity).action,'removed');replacement=null;
      symlinkSync(sentinelRoot.path,p.path);linkIdentity=lstatSync(p.path);
      const symlinkRefusal=removeRoot(p.path,p.identity);assertRefused(symlinkRefusal);
      assert(lstatSync(p.path).isSymbolicLink());assert.equal(readlinkSync(p.path),sentinelRoot.path);assert.deepEqual(readFileSync(fileFrom(sentinelRoot.path)),bytes);
      // Remove only this freshly created link instance, never its target.
      unlinkOwnedProbe();
      renameSync(parked,p.path);
      record(variants[2],[inodeRefusal,symlinkRefusal,hash(bytes)],2);
     }finally{
      if(replacement){assert.equal(removeRoot(replacement.path,replacement.identity).action,'removed');}
      if(lstatSync(parked,{throwIfNoEntry:false})){
       if(lstatSync(p.path,{throwIfNoEntry:false})?.isSymbolicLink())unlinkOwnedProbe();
       renameSync(parked,p.path);
      }
      assert.equal(removeRoot(p.path,p.identity).action,'removed');
     }
    });
    await t.test(variants[3],async()=>{
     const current=await observeProcess(sentinelExpected);assert.equal(current.state,'owned');const proofs=[current];
     for(const substitute of [{...sentinelExpected,instance:'1/Thu Jan  1 00:00:00 1970'},
      {...sentinelExpected,nonce:randomUUID()}, {...sentinelExpected,parentInstance:'substituted-parent'}]){
      const refused=await removeProcess(substitute);assertRefused(refused);proofs.push(refused);
      assert.equal((await observeProcess(sentinelExpected)).state,'owned');
     }
     const positive=await launchOwned(probe,'FABRIC_RECOVERY_PROBE',{});
     try{
      const positiveExpected=await freshExpected(positive),substitutedPid=await removeProcess({...sentinelExpected,pid:positive.pid});assertRefused(substitutedPid);
      assert.equal((await observeProcess(sentinelExpected)).state,'owned');assert.equal((await observeProcess(positiveExpected)).state,'owned');
      proofs.push(substitutedPid,await observeProcess(positiveExpected));
      const removed=await removeProcess(positiveExpected);schema.RecoveryOutcomeSchema.parse(removed);assert.equal(removed.action,'removed');proofs.push(removed);
     }
     finally{await stopOwned(positive);}
     record(variants[3],proofs,4);
    });
    await t.test(variants[4],()=>{
     const before=observeContainer(sentinelContainer),census=containers();
     const refused=removeContainer({...sentinelContainer,owner:container.owner,instance:container.instance});assertRefused(refused);
     assert.deepEqual(containers(),census);const after=observeContainer(sentinelContainer);assert.equal(after.state,'owned');
     assert.equal(after.databaseOwner,before.databaseOwner);assert.equal(after.databaseInstance,before.databaseInstance);
     record(variants[4],[before,refused,after],1);
    });
    await t.test(variants[5],()=>{
     // Expected identity is closed; the path from fixture env is not part of it.
     const {path,...identity}=sentinelRoot;
     const before=observeRoot(path,identity);
     const refused=removeRoot(path,{...identity,owner:container.owner});assertRefused(refused);
     assert.deepEqual(readFileSync(file),bytes);assert.equal(observeRoot(path,identity).state,'owned');
     record(variants[5],[before,refused,hash(readFileSync(file))],1);
    });
    await t.test(variants[6],async()=>{
     const before=await observeProcess(sentinelExpected),refused=await removeProcess({...sentinelExpected,nonce:randomUUID()});assertRefused(refused);
     const after=await observeProcess(sentinelExpected);assert.equal(after.state,'owned');
     assert.equal(after.instance,before.instance);assert.equal(after.commandDigest,before.commandDigest);
     record(variants[6],[before,refused,after],1);
    });
   });
   assert.deepEqual(readFileSync(file),bytes);assert.equal((await observeProcess(sentinelExpected)).state,'owned');
   assert.equal(observeContainer(sentinelContainer).state,'owned');
  }finally{await stopOwned(sentinelProcess);}
 });
 await t.test(variants[7],async()=>{
  // Independent sentinels: original fixture census cannot remove a preexisting
  // legacy container during its callback. Its unchanged finally is preserved.
  const sentinel=createRoot(),file=resolve(sentinel.path,'unowned-sentinel.bin'),bytes=randomBytes(61);
  writeFileSync(file,bytes,{mode:0o600,flag:'wx'});
  const process=await launchOwned(probe,'FABRIC_RECOVERY_PROBE',{}),expected=await freshExpected(process);
  const owner=randomUUID(),instance=randomUUID(),name='agent-fabric-storage-'+instance;
  let id;
  const census=containers();
  console.log(JSON.stringify({measurement:'recovery-probe-sentinel-created',root:sentinel,process:await observeProcess(expected)}));
  try{
   writeFileSync(resolve(sentinel.path,'postgres.env'),'POSTGRES_PASSWORD='+randomBytes(32).toString('hex')+'\nPOSTGRES_DB=storage_test\n',{mode:0o600,flag:'wx'});
   id=docker(['run','--detach','--pull=never','--name',name,'--label','agent-fabric.storage-fixture-owner='+owner,
    '--label','agent-fabric.storage-fixture-instance='+instance,'--cpus','1','--memory','256m','--pids-limit','128',
    '--publish','127.0.0.1::5432','--env-file',resolve(sentinel.path,'postgres.env'),postgresImage]);
   const container={owner,instance,name,id};
   console.log(JSON.stringify({measurement:'recovery-probe-container-created',container}));
   const sentinelBefore=[observeContainer(container,{database:false}),observeRoot(sentinel.path,sentinel.identity),await observeProcess(expected)];
   assert(sentinelBefore.every(o=>o.state==='owned'));
   legacy=await recoverLegacy(async()=>{
    assert.deepEqual(readFileSync(file),bytes);
    const after=[observeContainer(container,{database:false}),observeRoot(sentinel.path,sentinel.identity),await observeProcess(expected)];
    assert(after.every(o=>o.state==='owned'));
    assert.equal(after[0].id,sentinelBefore[0].id);assert.equal(after[1].inode,sentinelBefore[1].inode);
    assert.equal(after[2].instance,sentinelBefore[2].instance);assert.equal(after[2].commandDigest,sentinelBefore[2].commandDigest);
    return [...sentinelBefore,...after,hash(readFileSync(file))].map(hash);
   });
   record(variants[7],[legacy,...sentinelBefore]);
  }finally{
   const errors=[];
   try{await stopOwned(process);}catch(e){errors.push(e);}
   try{if(id)assert.equal(removeContainer({owner,instance,name,id},{database:false}).action,'removed');}catch(e){errors.push(e);}
   try{assert.equal(removeRoot(sentinel.path,sentinel.identity).action,'removed');}catch(e){errors.push(e);}
   if(errors.length)throw new AggregateError(errors,'Every owned sentinel cleanup attempted; errors remain fatal');
  }
  assert.deepEqual(containers(),census.filter(c=>!legacy?.outcomes.some(o=>o.before.kind==='container'&&o.before.id===c&&o.action==='removed')));
 });
 assert(legacy);assert.deepEqual(records.map(r=>r.name),variants);assert.equal(candidateSnapshot().digest,candidate.digest);
 const globalAfter=containers();assert.deepEqual(globalAfter,globalBefore.filter(id=>!legacy.outcomes.some(o=>o.before.kind==='container'&&o.before.id===id&&o.action==='removed')));
 const value=schema.RecoveryBehaviorSchema.parse({schemaVersion:1,measurement:'storage-owned-recovery-behavior',
  candidate:candidate.digest,censusBefore:globalBefore,censusAfter:globalAfter,variants:records,legacy,cleanup:'complete',assurance:'deterministic-local-only',paidCallsAllowed:false});
 console.log(JSON.stringify(value));
});
function fileFrom(path){return resolve(path,'unowned-sentinel.bin');}
