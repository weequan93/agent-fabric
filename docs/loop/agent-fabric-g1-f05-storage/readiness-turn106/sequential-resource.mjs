// Disposable SQL isolation resource probe. No F05 product scenario or body runs.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,lstatSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from '../../../../g1-storage/node_modules/pg/lib/index.js';
import {assertContainerOwned,assertRootOwned} from '../../../../g1-storage/scripts/fixture.mjs';
import {postgresImage} from '../../../../g1-storage/scripts/paths.mjs';
const label='agent-fabric.storage-fixture-owner',opened=[],identities=[],tick=performance.now();
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw Error('Resource Docker failed '+args[0]);return r.stdout.trim();}
const census=()=>docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();
const before=census();console.log(JSON.stringify({measurement:'sequential-resource-before',containers:before,productQualified:false}));
async function create(slot){
 const owner=randomUUID(),instance=randomUUID(),name='agent-fabric-storage-'+instance,root=mkdtempSync('/private/tmp/agent-fabric-readiness106-'),s=lstatSync(root),identity={owner,instance,rootId:randomUUID(),device:s.dev,inode:s.ino};
 const f={slot,owner,instance,name,root,identity,before:census()};opened.push(f);
 writeFileSync(resolve(root,'.storage-owner.json'),JSON.stringify(identity),{mode:0o600,flag:'wx'});
 const password=randomBytes(32).toString('hex');writeFileSync(resolve(root,'postgres.env'),'POSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=storage_test\n',{mode:0o600,flag:'wx'});
 f.id=docker(['run','--detach','--pull=never','--name',name,'--label',label+'='+owner,'--label','agent-fabric.storage-fixture-instance='+instance,'--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432','--env-file',resolve(root,'postgres.env'),postgresImage]);
 const info=JSON.parse(docker(['inspect',f.id]))[0];assertContainerOwned(info,owner,instance,name,f.id);assertRootOwned(root,identity);
 assert.equal(info.HostConfig.NanoCpus,1e9);assert.equal(info.HostConfig.Memory,268435456);assert.equal(info.HostConfig.PidsLimit,128);assert.deepEqual(info.Mounts.filter(x=>x.Type==='bind'),[]);assert.equal(info.NetworkSettings.Ports['5432/tcp'][0].HostIp,'127.0.0.1');
 const deadline=performance.now()+10000;
 while(performance.now()<deadline){const c=new pg.Client({host:'127.0.0.1',port:Number(info.NetworkSettings.Ports['5432/tcp'][0].HostPort),database:'storage_test',user:'postgres',password,connectionTimeoutMillis:1000,query_timeout:2000});try{await c.connect();f.client=c;break;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,100));}}
 assert.ok(f.client);identities.push({slot,owner,instance,containerId:f.id,rootId:identity.rootId,root,device:s.dev,inode:s.ino});return f;
}
async function close(f){
 assert.equal(opened.at(-1),f,'Exact nested lifetime LIFO');await f.client?.end();
 if(!f.id){const p=spawnSync('docker',['inspect',f.name],{encoding:'utf8',timeout:5000});if(p.status===0)f.id=JSON.parse(p.stdout)[0].Id;}
 if(f.id){assertContainerOwned(JSON.parse(docker(['inspect',f.id]))[0],f.owner,f.instance,f.name,f.id);docker(['rm','--force','--volumes',f.id]);}
 assert.deepEqual(census(),f.before);assertRootOwned(f.root,f.identity);rmSync(f.root,{recursive:true});assert.equal(lstatSync(f.root,{throwIfNoEntry:false}),undefined);opened.pop();
 console.log(JSON.stringify({measurement:'sequential-resource-cleanup',slot:f.slot,containerId:f.id,root:f.root,exactCensus:true,rootAbsent:true,owned:true}));
}
try{
 const outer=await create('O');await outer.client.query('CREATE TABLE resource_probe_sentinel(value integer NOT NULL)');await outer.client.query('INSERT INTO resource_probe_sentinel VALUES (106)');
 for(const slot of ['L-retention','L-graph','L-maintenance','L-retry','V-drafts','V-promotion']){
  const f=await create(slot);
  try{assert.equal((await f.client.query("SELECT to_regclass('public.resource_probe_sentinel') AS r")).rows[0].r,null);await f.client.query('CREATE TABLE resource_probe_sentinel(value integer NOT NULL)');await f.client.query('INSERT INTO resource_probe_sentinel VALUES (1)');assert.equal((await f.client.query('SELECT count(*)::int AS n FROM resource_probe_sentinel')).rows[0].n,1);assert.equal((await outer.client.query('SELECT sum(value)::int AS n FROM resource_probe_sentinel')).rows[0].n,106);console.log(JSON.stringify({measurement:'sequential-resource-fresh-sql',slot,owner:f.owner,instance:f.instance,containerId:f.id,rootId:f.identity.rootId,priorTableAbsent:true,ownCount:1,outerUnchanged:true,peakContainers:2,noResetOrParallelLifetime:true}));}
  finally{await close(f);}
 }
 assert.equal(new Set(identities.map(x=>x.containerId)).size,7);assert.equal(new Set(identities.map(x=>x.rootId)).size,7);
}finally{
 const failures=[];while(opened.length){const f=opened.at(-1);try{await close(f);}catch(e){failures.push(e);opened.pop();}}
 assert.deepEqual(census(),before);console.log(JSON.stringify({measurement:'sequential-resource-after',containers:census(),exactCensus:true,identities,elapsedMs:performance.now()-tick,f05MigrationsOrAssertionsExecuted:false}));if(failures.length)throw new AggregateError(failures,'Resource cleanup failed');
}
