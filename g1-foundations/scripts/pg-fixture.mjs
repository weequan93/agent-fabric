import {randomUUID, randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
export const POSTGRES_IMAGE='postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333';
const label='agent-fabric.foundation-fixture-owner';
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});if(r.error||r.status!==0)throw new Error('Docker '+args[0]+' failed: '+(r.error?.message??r.stderr));return r.stdout.trim();}
export async function withPgFixture(work){
 const owner=randomUUID(),name='agent-fabric-foundation-'+owner,password=randomBytes(24).toString('hex');let id;let version;
 try{
  id=docker(['run','--detach','--pull=never','--name',name,'--label',label+'='+owner,'--cpus','1','--memory','256m','--pids-limit','128','--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB=foundation_test',POSTGRES_IMAGE]);
  const info=JSON.parse(docker(['inspect',id]))[0];if(info.Config.Labels[label]!==owner||info.Name!=='/'+name)throw new Error('Fixture ownership mismatch');
  const ports=info.NetworkSettings.Ports['5432/tcp'];if(ports.length!==1||ports[0].HostIp!=='127.0.0.1')throw new Error('Fixture must be loopback only');
  const url=new URL('postgresql://postgres@127.0.0.1:'+ports[0].HostPort+'/foundation_test');url.password=password;
  const deadline=Date.now()+30000;let ready=false;
  while(Date.now()<deadline){const client=new pg.Client({connectionString:url.href,connectionTimeoutMillis:1000});try{await client.connect();const q=await client.query('SELECT version() AS version');if(!q.rows[0].version.startsWith('PostgreSQL 16.'))throw new Error('Pinned PG16 required');version=q.rows[0].version;ready=true;break;}catch(e){if(Date.now()+500>=deadline)throw e;}finally{await client.end().catch(()=>{});}await new Promise(resolve=>setTimeout(resolve,300));}
  if(!ready)throw new Error('PostgreSQL readiness deadline');
  console.log(JSON.stringify({measurement:'actual-postgres-fixture',image:POSTGRES_IMAGE,owner,version,containerId:id,loopback:true,cpuLimit:1,memoryBytes:268435456,productionQualified:false}));
  return await work({connectionString:url.href,owner,containerId:id});
 }finally{
  if(!id){const discovery=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000});if(discovery.status===0){const found=JSON.parse(discovery.stdout)[0];if(found.Config.Labels[label]===owner&&found.Name==='/'+name)id=found.Id;}}
  if(id){const info=JSON.parse(docker(['inspect',id]))[0];if(info.Config.Labels[label]!==owner||info.Name!=='/'+name)throw new Error('Refusing cleanup of unowned container');docker(['rm','--force','--volumes',id]);console.log(JSON.stringify({measurement:'fixture-owned-cleanup',owner,containerId:id,removed:true}));}
 }
}
