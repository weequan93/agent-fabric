/** Private F-H assertions. No CLI entry point or checker selection flag. Every
 * destructive action uses the shipped live owner+instance proof. */
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync,writeFileSync,lstatSync,rmSync,symlinkSync,unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { cache } from '../paths.mjs';
import { withStorageFixture,assertRootOwned } from '../fixture.mjs';
import { createRoot,removeRoot,removeContainer,docker,containers,processTools,hash } from '../recovery/ownership.mjs';
import { assertBaseline } from '../guards.mjs';
const label='agent-fabric.storage-fixture-owner';
const childSource=`const c=JSON.parse(process.env.HARNESS_CHILD);console.log(JSON.stringify({pid:process.pid,marker:c.marker}));setInterval(()=>{},1000);`;
export async function cleanupProbe(mode){
 const tools=await processTools(),sentinelRoot=createRoot(),sentinelFile=resolve(sentinelRoot.path,'unowned-sentinel');
 writeFileSync(sentinelFile,'preexisting-unowned-'+sentinelRoot.identity.owner);
 const sentinelBytes=readFileSync(sentinelFile),before=containers(),baseline=assertBaseline();
 const script=resolve('g1-storage/sentinel-child.mjs');writeFileSync(script,childSource);
 let sentinel;try{sentinel=await tools.launchOwned(script,'HARNESS_CHILD',{});}catch(error){assert.deepEqual(readFileSync(sentinelFile),sentinelBytes);assert.equal(removeRoot(sentinelRoot.path,sentinelRoot.identity).action,'removed');rmSync(script);throw error;}
 const sentinelRow=tools.census().find(r=>r.pid===sentinel.pid);
 const originalSpawn=cp.spawnSync;let intercepted=0,callback=0,failure,fixture,rootMarker,container,inspectCount=0,cleanupReady=false,phase='work';
 const denied=()=>({status:1,signal:null,error:undefined,stdout:'',stderr:'F-H injected capability/cleanup denial'});
 cp.spawnSync=function(command,args,options){
  if(mode==='census-denied'&&phase==='work'&&(command==='ps'||command==='/bin/ps')){intercepted++;return denied();}
  if(command==='docker'){
   if(mode==='pg-unavailable'&&args[0]==='image'){intercepted++;return denied();}
   if(mode==='container-cleanup-failed'&&args[0]==='rm'&&phase==='work'){intercepted++;return denied();}
   const result=originalSpawn(command,args,options);
   if(args[0]==='inspect'&&result.status===0&&args.length===2){
    const rows=JSON.parse(result.stdout);if(rows[0]?.Config?.Labels?.[label]){
     inspectCount++;const info=rows[0];container={id:info.Id,name:info.Name.slice(1),owner:info.Config.Labels[label],instance:info.Config.Labels['agent-fabric.storage-fixture-instance']};
     if(mode==='loopback-denied'||mode==='instance-substitution'&&inspectCount>1&&cleanupReady){
      if(mode==='loopback-denied')info.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0';
      else info.Config.Labels['agent-fabric.storage-fixture-instance']='substituted-instance';
      intercepted++;return {...result,stdout:JSON.stringify(rows)};
     }
    }
   }
   return result;
  }
  return originalSpawn(command,args,options);
 };syncBuiltinESMExports();
 try{
  if(mode==='real-census'){
   const rows=tools.census();assert(rows.some(r=>r.pid===process.pid));assert.deepEqual(rows.find(r=>r.pid===sentinel.pid),sentinelRow);
   console.log(JSON.stringify({measurement:'harness-real-census',rows:rows.length,digest:hash(rows),sentinel:sentinelRow}));
  }else if(mode==='loopback'){
   const server=createServer((_req,res)=>res.end('owned-loopback'));
   try{await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});const address=server.address();assert(address&&typeof address==='object');const r=await fetch('http://127.0.0.1:'+address.port,{signal:AbortSignal.timeout(2000)});assert.equal(await r.text(),'owned-loopback');}
   finally{if(server.listening)await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));}assert.equal(server.listening,false);
  }else if(mode==='owned-child'||mode==='child-cleanup-failed'){
   const child=await tools.launchOwned(script,'HARNESS_CHILD',{});const identity=child.identity;
   try{if(mode==='child-cleanup-failed'){
    child.identity={...identity,instance:identity.instance+'-substitution'};
    await assert.rejects(tools.stopOwned(child),e=>e.code==='CLEANUP_UNPROVEN');
    assert.deepEqual(tools.census().find(r=>r.pid===child.pid),identity);intercepted++;
    failure=new Error('Owned child cleanup failed: CLEANUP_UNPROVEN');
   }}finally{child.identity=identity;await tools.stopOwned(child);}
  }else if(mode==='symlink-cache'){
   const target=resolve('g1-storage/node_modules/.cache/storage-build'),saved=target+'-saved';
   const fs=await import('node:fs');fs.renameSync(target,saved);symlinkSync(sentinelRoot.path,target);
   try{const r=originalSpawn(process.execPath,[resolve('g1-storage/scripts/build.mjs')],{encoding:'utf8',env:{...process.env,NODE_TEST_CONTEXT:''}});
    console.log(JSON.stringify({measurement:'harness-symlink-build-result',status:r.status,stdout:r.stdout,stderr:r.stderr}));
    assert.equal(r.status,1);assert.match(r.stderr,/Symlinked own build cache refused/);intercepted++;failure=new Error('Symlinked own build cache refused');
   }finally{unlinkSync(target);fs.renameSync(saved,target);}
  }else{
   await withStorageFixture(async state=>{
    callback++;fixture=state.env;rootMarker=JSON.parse(readFileSync(resolve(fixture.STORAGE_FIXTURE_ROOT,'.storage-owner.json')));
    const roots=JSON.parse(fixture.STORAGE_OWNED_ROOTS);for(const v of Object.values(roots))assertRootOwned(v.path,v);
    const rows=docker(['exec',container.id,'psql','-X','-U','postgres','-d','storage_test','-A','-t','-c','SELECT owner,instance FROM public.fabric_storage_fixture']);
    assert.equal(rows,fixture.STORAGE_FIXTURE_OWNER+'|'+fixture.STORAGE_FIXTURE_INSTANCE);
    if(mode==='instance-substitution'){
     const env={...process.env};Object.assign(process.env,fixture);
     try{
      const source=await import(pathToFileURL(resolve(cache,'g1-storage/tests/helpers/pg-fixture.js')).href);
      const changed=sentinelRoot.identity.instance;
      docker(['exec',container.id,'psql','-X','-U','postgres','-d','storage_test','-c',`UPDATE public.fabric_storage_fixture SET instance='${changed}'`]);
      try{await assert.rejects(source.createStorageFixture(),e=>e.code==='CLEANUP_UNPROVEN');
       const deniedCleanup=removeContainer(container);assert.equal(deniedCleanup.action,'refused');assert.equal(deniedCleanup.before.databaseVerified,false);assert.equal(deniedCleanup.before.instance,fixture.STORAGE_FIXTURE_INSTANCE);assert.equal(deniedCleanup.before.loopback,true);
       const untouched=docker(['exec',container.id,'psql','-X','-U','postgres','-d','storage_test','-A','-t','-c','SELECT owner,instance FROM public.fabric_storage_fixture']);assert.equal(untouched,fixture.STORAGE_FIXTURE_OWNER+'|'+changed);
       console.log(JSON.stringify({measurement:'harness-database-instance-refusal',owner:fixture.STORAGE_FIXTURE_OWNER,originalInstance:fixture.STORAGE_FIXTURE_INSTANCE,substitutedInstance:changed,fixtureCreationRefused:true,destructiveCleanupRefused:deniedCleanup.action,currentContainerPreserved:true}));
      }finally{docker(['exec',container.id,'psql','-X','-U','postgres','-d','storage_test','-c',`UPDATE public.fabric_storage_fixture SET instance='${fixture.STORAGE_FIXTURE_INSTANCE}'`]);}
     }finally{for(const key of Object.keys(process.env))if(!Object.hasOwn(env,key))delete process.env[key];Object.assign(process.env,env);}
    }
    if(mode==='root-cleanup-failed'){writeFileSync(resolve(fixture.STORAGE_FIXTURE_ROOT,'.storage-owner.json'),JSON.stringify({...rootMarker,instance:'substituted-instance'}));intercepted++;}
    cleanupReady=true;
    if(mode==='guards-on-failure')throw new Error('F-H actual callback failure');
   });
  }
 }catch(error){failure=error;}
 finally{
  phase='recovery';cp.spawnSync=originalSpawn;syncBuiltinESMExports();
  if(fixture&&lstatSync(fixture.STORAGE_FIXTURE_ROOT,{throwIfNoEntry:false})){
   // Restore only the marker this probe mutated, with original dev/inode proof.
   if(mode==='root-cleanup-failed'){
    const s=lstatSync(fixture.STORAGE_FIXTURE_ROOT);assert.equal(s.dev,rootMarker.device);assert.equal(s.ino,rootMarker.inode);assert.equal(s.isSymbolicLink(),false);
    assert.deepEqual(JSON.parse(readFileSync(resolve(fixture.STORAGE_FIXTURE_ROOT,'.storage-owner.json'))),{...rootMarker,instance:'substituted-instance'});
    writeFileSync(resolve(fixture.STORAGE_FIXTURE_ROOT,'.storage-owner.json'),JSON.stringify(rootMarker));
   }
   assert.equal(removeRoot(fixture.STORAGE_FIXTURE_ROOT,rootMarker,Object.values(JSON.parse(fixture.STORAGE_OWNED_ROOTS)).map(v=>({path:v.path,identity:v}))).action,'removed');
  }
  if(container){const r=removeContainer(container,{database:!!fixture});assert(['removed','already-absent'].includes(r.action));}
  assert.deepEqual(containers(),before);assert.deepEqual(readFileSync(sentinelFile),sentinelBytes);
  assert.deepEqual(tools.census().find(r=>r.pid===sentinel.pid),sentinelRow);assert.equal(assertBaseline(),baseline);
  console.log(JSON.stringify({measurement:'harness-probe-guards',mode,intercepted,callback,preexistingContainers:before,censusUnchanged:true,sentinelBytes:sentinelBytes.length,sentinelSha256:hash(sentinelBytes),sentinelProcess:sentinelRow,unownedPreserved:true,protectedInputs:baseline,failure:failure?.message??null}));
  await tools.stopOwned(sentinel);assert.equal(removeRoot(sentinelRoot.path,sentinelRoot.identity).action,'removed');rmSync(script);
 }
 const negative=['census-denied','loopback-denied','pg-unavailable','child-cleanup-failed','root-cleanup-failed','container-cleanup-failed','symlink-cache','instance-substitution','guards-on-failure'].includes(mode);
 if(negative){assert(failure,'Injected fault must fail');if(mode!=='guards-on-failure')assert(intercepted>0);if(['census-denied','loopback-denied','pg-unavailable'].includes(mode))assert.equal(callback,0);throw failure;}
 assert.equal(failure,undefined);if(mode==='cached-pg')assert.equal(callback,1);
}
