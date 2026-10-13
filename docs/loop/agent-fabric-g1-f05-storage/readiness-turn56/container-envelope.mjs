// Resource-only disposable local probe; no product tests or legacy recovery.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, lstatSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from '../../../../g1-storage/node_modules/pg/lib/index.js';
import { assertContainerOwned, assertRootOwned } from '../../../../g1-storage/scripts/fixture.mjs';
import { postgresImage } from '../../../../g1-storage/scripts/paths.mjs';
const label='agent-fabric.storage-fixture-owner';
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw new Error('Probe Docker '+args[0]+' failed: '+(r.error?.code??r.status));return r.stdout.trim();}
function census(){return docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();}
const before=census(), fixtures=[],started=performance.now();
console.log(JSON.stringify({measurement:'resource-envelope-before',preexistingContainers:before,productQualified:false}));
try{
 for(const slot of ['O','A','B','C']){
  const owner=randomUUID(),instance=randomUUID(),name='agent-fabric-storage-'+instance,root=mkdtempSync('/private/tmp/agent-fabric-readiness56-'),st=lstatSync(root),identity={owner,instance,rootId:randomUUID(),device:st.dev,inode:st.ino};
  writeFileSync(resolve(root,'.storage-owner.json'),JSON.stringify(identity),{mode:0o600,flag:'wx'});
  const password=randomBytes(32).toString('hex');writeFileSync(resolve(root,'postgres.env'),'POSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=storage_test\n',{mode:0o600,flag:'wx'});
  const f={slot,owner,instance,name,root,identity,password,expectedBefore:census()};fixtures.push(f);
  f.id=docker(['run','--detach','--pull=never','--name',name,'--label',label+'='+owner,'--label','agent-fabric.storage-fixture-instance='+instance,'--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432','--env-file',resolve(root,'postgres.env'),postgresImage]);
  f.info=JSON.parse(docker(['inspect',f.id]))[0];assertContainerOwned(f.info,owner,instance,name,f.id);
  assert.equal(f.info.HostConfig.NanoCpus,1e9);assert.equal(f.info.HostConfig.Memory,256*1024*1024);assert.equal(f.info.HostConfig.PidsLimit,128);
 }
 const ready=await Promise.all(fixtures.map(async f=>{
  const deadline=performance.now()+30000;let version;
  while(performance.now()<deadline){const c=new pg.Client({host:'127.0.0.1',port:Number(f.info.NetworkSettings.Ports['5432/tcp'][0].HostPort),database:'storage_test',user:'postgres',password:f.password,connectionTimeoutMillis:1000,query_timeout:2000});try{await c.connect();version=(await c.query('SELECT version() AS version,pg_sleep(0.25)')).rows[0].version;break;}catch{await new Promise(r=>setTimeout(r,150));}finally{await c.end().catch(()=>{});}}
  assert.match(version??'',/^PostgreSQL 16\.12 /);return {slot:f.slot,containerId:f.id,owner:f.owner,instance:f.instance,version,cpu:1,memoryBytes:256*1024*1024,pidsLimit:128,loopback:true,noBindMount:true};
 }));
 assert.equal(new Set(fixtures.map(f=>f.info.NetworkSettings.Ports['5432/tcp'][0].HostPort)).size,4);
 const stats=docker(['stats','--no-stream','--format','{{json .}}',...fixtures.map(f=>f.id)]).split('\n').map(x=>JSON.parse(x));
 console.log(JSON.stringify({measurement:'four-concurrent-resource-envelope',ready,stats,setupAndQueriesMs:performance.now()-started,f05MigrationsOrAssertionsExecuted:false}));
}finally{
 const failures=[];
 for(const f of fixtures.reverse()){
  try{if(!f.id){const r=spawnSync('docker',['inspect',f.name],{encoding:'utf8',timeout:5000});if(r.status===0)f.id=JSON.parse(r.stdout)[0].Id;}
   if(f.id){assertContainerOwned(JSON.parse(docker(['inspect',f.id]))[0],f.owner,f.instance,f.name,f.id);docker(['rm','--force','--volumes',f.id]);}
   assert.deepEqual(census(),f.expectedBefore);
   assertRootOwned(f.root,f.identity);rmSync(f.root,{recursive:true});assert.equal(lstatSync(f.root,{throwIfNoEntry:false}),undefined);
   console.log(JSON.stringify({measurement:'resource-envelope-LIFO-cleanup',slot:f.slot,id:f.id,root:f.root,rootId:f.identity.rootId,removed:true,exactCensusUnchanged:true}));
  }catch(e){failures.push(e);}
 }
 assert.deepEqual(census(),before);console.log(JSON.stringify({measurement:'resource-envelope-after',preexistingContainers:before,exactCensusUnchanged:true,totalMs:performance.now()-started,legacyRecoveryPerformed:false}));
 if(failures.length)throw new AggregateError(failures,'Resource probe cleanup failed');
}
