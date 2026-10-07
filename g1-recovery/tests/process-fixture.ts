import {spawn,spawnSync,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {Connection} from '@temporalio/client';
export function census():{pid:number;ppid:number;command:string}[] {
 const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',timeout:3000});
 if(r.error||r.status!==0)throw new Error('Mandatory actual process census failed: '+(r.error?.message??r.stderr));
 return r.stdout.trim().split('\n').map(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);if(!m)throw new Error('Unparseable process census');return {pid:Number(m[1]),ppid:Number(m[2]),command:m[3]!};});
}
export function descendants(pid:number) {
 const all=census(),ids=new Set([pid]);let change=true;
 while(change){change=false;for(const row of all)if(ids.has(row.ppid)&&!ids.has(row.pid)){ids.add(row.pid);change=true;}}
 return all.filter(r=>ids.has(r.pid)&&r.pid!==pid);
}
export async function waitUntil(predicate:()=>Promise<boolean>,label:string,ms=15000):Promise<void> {
 const deadline=Date.now()+ms;while(Date.now()<deadline){if(await predicate())return;await new Promise(res=>setTimeout(res,50));}throw new Error('Deadline: '+label);
}
export async function freePort():Promise<number> {
 const server=createServer();await new Promise<void>((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res);});
 const address=server.address();if(!address||typeof address==='string')throw new Error('No port');const port=address.port;
 await new Promise<void>((res,rej)=>server.close(e=>e?rej(e):res()));return port;
}
export interface OwnedChild {child:ChildProcessWithoutNullStreams;pid:number;marker:string;output:()=>string;errors:()=>string}
export function launchOwned(command:string,args:string[],marker:string,env=process.env):OwnedChild {
 const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe']});if(!child.pid)throw new Error('No owned child PID');
 let out='',err='';child.stdout.on('data',b=>{out+=String(b);});child.stderr.on('data',b=>{err+=String(b);});
 child.on('error',e=>{err+=e.message;});return {child,pid:child.pid,marker,output:()=>out,errors:()=>err};
}
export async function stopOwned(owned:OwnedChild,signal:'SIGTERM'|'SIGKILL'='SIGTERM'):Promise<void> {
 if(owned.child.exitCode!==null||owned.child.signalCode!==null)return;
 const row=census().find(r=>r.pid===owned.pid);
 if(!row || !row.command.includes(owned.marker))throw new Error('Refusing cleanup of unowned PID '+owned.pid);
 owned.child.kill(signal);
 await waitUntil(async()=>owned.child.exitCode!==null||owned.child.signalCode!==null,'owned child exit',5000).catch(async e=>{
  const current=census().find(r=>r.pid===owned.pid);if(current?.command.includes(owned.marker))owned.child.kill('SIGKILL');
  await waitUntil(async()=>owned.child.exitCode!==null||owned.child.signalCode!==null,'owned child forced exit',2000);throw e;
 });
 if(census().some(r=>r.pid===owned.pid))throw new Error('Owned PID still present after reaping');
 console.log(JSON.stringify({measurement:'owned-process-cleanup',pid:owned.pid,signal,exitCode:owned.child.exitCode,signalCode:owned.child.signalCode,removed:true}));
}
export async function createTemporalFixture() {
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Pinned Temporal Darwin arm64 fixture required');
 const binary=resolve('node_modules/.cache/temporal-cli/temporal');
 if(createHash('sha256').update(await readFile(binary)).digest('hex')!=='a1ae1b420699c1351521f296bf59cd195d25239e89a08c60bc69a6edd01069cc')throw new Error('Pinned CLI digest mismatch; run prepare-temporal.mjs');
 const version=spawnSync(binary,['--version'],{encoding:'utf8',timeout:5000});
 if(version.status!==0||version.stdout.trim()!=='temporal version 1.4.1 (Server 1.28.0, UI 2.39.0)')throw new Error('Pinned service version mismatch');
 const owner=randomUUID(),directory=await mkdtemp(resolve(tmpdir(),'fabric-temporal-'+owner+'-')),port=await freePort(),address='127.0.0.1:'+port,db=resolve(directory,'history.sqlite');
 await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});
 let service:OwnedChild|undefined;
 async function start() {
  service=launchOwned(binary,['--disable-config-file','--disable-config-env','server','start-dev','--headless','--ip','127.0.0.1','--port',String(port),'--db-filename',db],db);
  await waitUntil(async()=>{
   if(service!.child.exitCode!==null||service!.child.signalCode!==null)throw new Error('Temporal service exited '+service!.errors());
   let connection:Connection|undefined;try{connection=await Connection.connect({address,connectTimeout:500});await connection.workflowService.getSystemInfo({});return true;}catch{return false;}finally{await connection?.close();}
  },'real Temporal service readiness',30000);
  const row=census().find(r=>r.pid===service!.pid);if(!row?.command.includes(db))throw new Error('Temporal ownership census failed');
  console.log(JSON.stringify({measurement:'real-temporal-service',owner,pid:service.pid,address,version:version.stdout.trim(),db,bytes:(await stat(db)).size,process:row,productionQualified:false}));
 }
 try {await start();return {owner,directory,address,db,service:()=>service!,restart:async()=>{await stopOwned(service!);await start();},close:async()=>{
  await stopOwned(service!);if(await readFile(resolve(directory,'owner'),'utf8')!==owner)throw new Error('Fixture owner marker mismatch');
  await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'owned-temporal-directory-cleanup',owner,removed:true}));
 }};}catch(e){if(service)await stopOwned(service);if(await readFile(resolve(directory,'owner'),'utf8')===owner)await rm(directory,{recursive:true});throw e;}
}
