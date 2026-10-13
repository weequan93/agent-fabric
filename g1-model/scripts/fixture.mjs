import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { root, cwd, postgresImage } from './paths.mjs';
import { run } from './process-result.mjs';
const label='agent-fabric.model-fixture-owner';
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw new Error('Owned model Docker '+args[0]+' failed');return r.stdout.trim();}
export function assertContainerOwned(info,owner,name){
 if(info.Config.Labels[label]!==owner||info.Name!=='/'+name||!info.Id||info.Config.Image!==postgresImage)throw new Error('Refusing unowned container cleanup');
 const ports=info.NetworkSettings.Ports['5432/tcp'];if(ports && (ports.length!==1||ports[0].HostIp!=='127.0.0.1'))throw new Error('Fixture is not loopback only');
}
/** Fresh cached PG only, no image pulls, host volume or retained data deletion. */
export async function withModelFixture(work){
 const owner=randomUUID(),name='agent-fabric-model-'+owner,password=randomBytes(24).toString('hex');let id;
 docker(['image','inspect',postgresImage]);
 const before=docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();
 try{
  id=docker(['run','--detach','--pull=never','--name',name,'--label',label+'='+owner,'--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB=model_test',postgresImage]);
  const info=JSON.parse(docker(['inspect',id]))[0];assertContainerOwned(info,owner,name);
  const u=new URL('postgresql://postgres@127.0.0.1:'+info.NetworkSettings.Ports['5432/tcp'][0].HostPort+'/model_test');u.password=password;
  const deadline=Date.now()+30000;let version;
  while(Date.now()<deadline){const c=new pg.Client({connectionString:u.href,connectionTimeoutMillis:1000});try{await c.connect();version=(await c.query('SELECT version() AS version')).rows[0].version;break;}catch{await new Promise(r=>setTimeout(r,200));}finally{await c.end().catch(()=>{});}}
  if(!version?.startsWith('PostgreSQL 16.12 '))throw new Error('Actual pinned PostgreSQL16.12 readiness failed');
  // Run the unchanged F01 build/API in its original layout; its migration URL
  // contract is relative to that layout. Disposable emission only, no source edits.
  run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],{cwd:resolve(root,'g1-foundations'),env:{...process.env,CI:'true'},timeout:30000});
  run(process.execPath,[resolve(root,'g1-foundations/scripts/build.mjs')],{cwd:root});
  const {migrateFoundation}=await import('../../g1-foundations/node_modules/.cache/foundation-build/src/migration.js');
  const admin=new pg.Pool({connectionString:u.href,max:1,connectionTimeoutMillis:2000});
  try{await migrateFoundation(admin,{ownedSyntheticDatabase:true});await admin.query('CREATE TABLE public.fabric_model_fixture(owner uuid PRIMARY KEY); REVOKE ALL ON public.fabric_model_fixture FROM PUBLIC');await admin.query('INSERT INTO public.fabric_model_fixture VALUES($1)',[owner]);}finally{await admin.end();}
  console.log(JSON.stringify({measurement:'model-owned-postgres',owner,containerId:id,image:postgresImage,version,loopback:true,paidCallsAllowed:false,assurance:'deterministic-local-only'}));
  return await work({assurance:'deterministic-local-only',paidCallsAllowed:false,env:{MODEL_DATABASE_URL:u.href,MODEL_FIXTURE_OWNER:owner,MODEL_REPO_ROOT:root}});
 }finally{
  if(!id){const r=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000});if(r.status===0){const info=JSON.parse(r.stdout)[0];assertContainerOwned(info,owner,name);id=info.Id;}}
  if(id){const info=JSON.parse(docker(['inspect',id]))[0];assertContainerOwned(info,owner,name);docker(['rm','--force','--volumes',id]);console.log(JSON.stringify({measurement:'model-owned-postgres-cleanup',owner,containerId:id,removed:true}));}
  const after=docker(['ps','-a','--filter','label='+label,'--format','{{.ID}}']).split('\n').filter(Boolean).sort();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Owned fixture census changed after cleanup');
 }
}
