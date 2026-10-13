import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,lstatSync,rmSync,realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { root,cache,postgresImage } from './paths.mjs';
const label='agent-fabric.storage-fixture-owner';
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:30_000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw new Error('Owned storage Docker '+args[0]+' failed');return r.stdout.trim();}
function census(){const r=spawnSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000});if(r.error||r.status!==0||!r.stdout.trim())throw new Error('Real process census unavailable');return {rows:r.stdout.trim().split('\n').length,digest:createHash('sha256').update(r.stdout).digest('hex')};}
export function assertContainerOwned(info,owner,instance,name,id){
 if(info?.Config?.Labels?.[label]!==owner||info.Config.Labels['agent-fabric.storage-fixture-instance']!==instance||info.Name!=='/'+name||!info.Id||id&&info.Id!==id||info.Config.Image!==postgresImage)throw new Error('Refusing unowned storage container');
 const ports=info.NetworkSettings.Ports['5432/tcp'];if(!ports||ports.length!==1||ports[0].HostIp!=='127.0.0.1')throw new Error('Storage fixture is not loopback only');
 if(info.Mounts.some(m=>m.Type==='bind'))throw new Error('Storage fixture host mount refused');
}
function marker(path,owner,instance,rootId){const st=lstatSync(path);const identity={owner,instance,rootId,device:st.dev,inode:st.ino};writeFileSync(resolve(path,'.storage-owner.json'),JSON.stringify(identity),{mode:0o600,flag:'wx'});return identity;}
export function assertRootOwned(path,expected){const s=lstatSync(path);if(s.isSymbolicLink()||!s.isDirectory()||realpathSync(path)!==path||s.dev!==expected.device||s.ino!==expected.inode||JSON.stringify(JSON.parse(readFileSync(resolve(path,'.storage-owner.json'),'utf8')))!==JSON.stringify({owner:expected.owner,instance:expected.instance,rootId:expected.rootId,device:expected.device,inode:expected.inode}))throw new Error('Refusing substituted or unowned storage root');}
/** Reproducible fresh synthetic resources only. Never pulls images, rebuilds
 * sibling packages or deletes retained evidence/data. Cleanup failure is fatal. */
export async function withStorageFixture(work){
 const owner=randomUUID(),instance=randomUUID(),name='agent-fabric-storage-'+instance;
 const password=randomBytes(32).toString('hex'),before=docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort(),processBefore=census();
 docker(['image','inspect',postgresImage]);
 const fixtureRoot=mkdtempSync('/private/tmp/agent-fabric-storage-'),rootId=randomUUID(),rootMarker=marker(fixtureRoot,owner,instance,rootId),roots={};
 for(const kind of ['content','backup','restore','authority']){const path=resolve(fixtureRoot,kind);mkdirSync(path,{mode:0o700});roots[kind]={path,...marker(path,owner,instance,randomUUID())};}
 const envFile=resolve(fixtureRoot,'postgres.env');writeFileSync(envFile,'POSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=storage_test\n',{mode:0o600,flag:'wx'});
 let id,result;const failures=[];
 try{
  id=docker(['run','--detach','--pull=never','--name',name,'--label',label+'='+owner,'--label','agent-fabric.storage-fixture-instance='+instance,'--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432','--env-file',envFile,postgresImage]);
  const info=JSON.parse(docker(['inspect',id]))[0];assertContainerOwned(info,owner,instance,name,id);
  const url=new URL('postgresql://postgres@127.0.0.1:'+info.NetworkSettings.Ports['5432/tcp'][0].HostPort+'/storage_test');url.password=password;
  const deadline=Date.now()+30_000;let version;
  while(Date.now()<deadline){const c=new pg.Client({connectionString:url.href,connectionTimeoutMillis:1000});try{await c.connect();version=(await c.query('SELECT version() AS version')).rows[0].version;break;}catch{await new Promise(r=>setTimeout(r,200));}finally{await c.end().catch(()=>{});}}
  if(!version?.startsWith('PostgreSQL 16.12 '))throw new Error('Actual pinned PostgreSQL16.12 readiness failed');
  const admin=new pg.Pool({connectionString:url.href,max:2,connectionTimeoutMillis:2000});
  try{
   // Exact emitted owners and byte-identical migration assets from F05 build.
   const owners=await import(pathToFileURL(resolve(cache,'g1-storage/src/owners.js')).href);
   await owners.migrateFoundation(admin,{ownedSyntheticDatabase:true});
   await admin.query('CREATE TABLE public.fabric_storage_fixture(owner uuid PRIMARY KEY,instance uuid NOT NULL);REVOKE ALL ON public.fabric_storage_fixture FROM PUBLIC,fabric_controller,fabric_worker');
   await admin.query('INSERT INTO public.fabric_storage_fixture VALUES($1,$2)',[owner,instance]);
   await admin.query('CREATE TABLE public.fabric_model_fixture(owner uuid PRIMARY KEY);REVOKE ALL ON public.fabric_model_fixture FROM PUBLIC');
   await admin.query('INSERT INTO public.fabric_model_fixture VALUES($1)',[owner]);
   await owners.migrateIdentity(admin,{ownedSyntheticDatabase:true,sqlPath:resolve(cache,'g1-identity/migrations/0003_identity_approvals.sql')});
   await owners.migrateRecovery(admin,{ownedSyntheticDatabase:true,sqlPath:resolve(cache,'g1-recovery/migrations/0004_recovery.sql')});
   await owners.migrateNativeHistory(admin,resolve(cache,'g1-recovery/migrations/0005_native_history.sql'));
   await owners.migrateEffectHistory(admin,resolve(cache,'g1-recovery/migrations/0006_effect_reconciliation.sql'));
   await owners.migrateFences(admin,resolve(cache,'g1-recovery/migrations/0007_fences.sql'));
   await owners.migrateResourceIntervals(admin,{ownedSyntheticDatabase:true,owner,root:cache});
  }finally{await admin.end();}
  console.log(JSON.stringify({measurement:'storage-owned-fixture',owner,instance,containerId:id,image:postgresImage,version,loopback:true,roots:Object.fromEntries(Object.entries(roots).map(([k,v])=>[k,{rootId:v.rootId,device:v.device,inode:v.inode}])),fixtureRoot:{rootId,device:rootMarker.device,inode:rootMarker.inode},preexistingContainers:before,processBefore,paidCallsAllowed:false,assurance:'deterministic-local-only'}));
  result=await work({assurance:'deterministic-local-only',paidCallsAllowed:false,env:{STORAGE_DATABASE_URL:url.href,STORAGE_FIXTURE_OWNER:owner,STORAGE_FIXTURE_INSTANCE:instance,STORAGE_REPO_ROOT:root,STORAGE_OWNER_ROOT:cache,STORAGE_FIXTURE_ROOT:fixtureRoot,STORAGE_OWNED_ROOTS:JSON.stringify(roots)}});
 }catch(e){failures.push(e);}
 finally{
  try{
   if(!id){const r=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000});if(r.status===0){const i=JSON.parse(r.stdout)[0];assertContainerOwned(i,owner,instance,name);id=i.Id;}}
   if(id){assertContainerOwned(JSON.parse(docker(['inspect',id]))[0],owner,instance,name,id);docker(['rm','--force','--volumes',id]);}
   const after=docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Preexisting container census changed');
   console.log(JSON.stringify({measurement:'storage-container-cleanup',owner,instance,containerId:id??null,removed:!!id,censusUnchanged:true,processAfter:census()}));
  }catch(e){failures.push(e);}
  try{assertRootOwned(fixtureRoot,rootMarker);for(const v of Object.values(roots))assertRootOwned(v.path,v);rmSync(fixtureRoot,{recursive:true});if(lstatSync(fixtureRoot,{throwIfNoEntry:false}))throw new Error('Owned fixture root remains');console.log(JSON.stringify({measurement:'storage-root-cleanup',owner,instance,rootId,rootIds:Object.values(roots).map(v=>v.rootId),removed:true}));}catch(e){failures.push(e);}
 }
 if(failures.length)throw new AggregateError(failures,'Owned storage fixture execution/cleanup failed');return result;
}
