import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { demand } from '../../src/errors.js';

export type ProcessRow={pid:number;ppid:number;instance:string;command:string};
export function census():ProcessRow[]{
 const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,pgid=,lstart=,command='],{encoding:'utf8',timeout:3000,env:{PATH:process.env['PATH']!,LC_ALL:'C'},maxBuffer:4*1024*1024});
 if(result.error||result.status!==0)throw new Error('Mandatory process census failed: '+(result.error?.message??result.stderr));
 return result.stdout.trim().split('\n').map(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/.exec(line);demand(m,'CLEANUP_UNPROVEN');return {pid:Number(m[1]),ppid:Number(m[2]),instance:m[3]+'/'+m[4],command:m[5]!};});
}
export async function waitUntil(predicate:()=>Promise<boolean>,label:string,ms=8000):Promise<void>{
 const deadline=Date.now()+ms;while(Date.now()<deadline){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Deadline: '+label);
}
export type OwnedProcess={child:ChildProcess;pid:number;marker:string;identity:ProcessRow;ready:Record<string,unknown>;messages:Record<string,unknown>[];stderr:()=>string};
export function assertOwned(owned:OwnedProcess,row:ProcessRow|undefined):void{
 demand(row && row.pid===owned.pid && row.ppid===process.pid && row.instance===owned.identity.instance && row.command===owned.identity.command && row.command.includes(owned.marker),'CLEANUP_UNPROVEN');
}
export async function launchOwned(script:string,configKey:string,config:Record<string,unknown>):Promise<OwnedProcess>{
 // Fail before spawning if this execution surface cannot prove process ownership.
 census();
 const marker=randomUUID(),child=spawn(process.execPath,[script,marker],{env:{PATH:process.env['PATH']!,LC_ALL:'C',[configKey]:JSON.stringify({...config,marker})},stdio:['pipe','pipe','pipe','ipc']});
 demand(child.pid,'CLEANUP_UNPROVEN');let stderr='',stdout='';const messages:Record<string,unknown>[]=[];
 child.stderr!.on('data',b=>stderr+=String(b));child.stdout!.on('data',b=>stdout+=String(b));child.on('message',v=>{if(v&&typeof v==='object')messages.push(v as Record<string,unknown>);});
 let spawnError:Error|undefined;child.on('error',e=>spawnError=e);
 try{
  await waitUntil(async()=>{if(spawnError)throw spawnError;if(child.exitCode!==null||child.signalCode!==null)throw new Error('Owned process failed to start');return stdout.includes('\n');},'owned child readiness');
  const ready=JSON.parse(stdout.split('\n')[0]!) as Record<string,unknown>;
  const identity=census().find(r=>r.pid===child.pid);demand(identity && identity.ppid===process.pid && identity.command.includes(marker),'CLEANUP_UNPROVEN');
  demand(ready['marker']===marker && ready['pid']===child.pid,'CLEANUP_UNPROVEN');
  const owned={child,pid:child.pid,marker,identity,ready,messages,stderr:()=>stderr};assertOwned(owned,census().find(r=>r.pid===child.pid));
  console.log(JSON.stringify({measurement:'model-owned-process',pid:child.pid,marker,instance:identity.instance,ppid:identity.ppid,loopback:true}));return owned;
 }catch(error){
  // Fresh child handle plus observed current marker; never signal a historical PID.
  if(child.exitCode===null&&child.signalCode===null){const row=census().find(r=>r.pid===child.pid);demand(row?.ppid===process.pid && row.command.includes(marker),'CLEANUP_UNPROVEN');child.kill('SIGKILL');await waitUntil(async()=>child.exitCode!==null||child.signalCode!==null,'failed-start child reap');}
  throw error;
 }
}
export async function stopOwned(owned:OwnedProcess,signal:'SIGTERM'|'SIGKILL'='SIGTERM'):Promise<void>{
 if(owned.child.exitCode===null&&owned.child.signalCode===null){
  assertOwned(owned,census().find(r=>r.pid===owned.pid));demand(!census().some(r=>r.ppid===owned.pid),'CLEANUP_UNPROVEN');
  owned.child.kill(signal);
  try{await waitUntil(async()=>owned.child.exitCode!==null||owned.child.signalCode!==null,'owned child reap',5000);}catch(error){assertOwned(owned,census().find(r=>r.pid===owned.pid));owned.child.kill('SIGKILL');await waitUntil(async()=>owned.child.exitCode!==null||owned.child.signalCode!==null,'forced child reap',2000);throw error;}
 }
 demand(!census().some(r=>r.pid===owned.pid),'CLEANUP_UNPROVEN');
 console.log(JSON.stringify({measurement:'model-owned-process-cleanup',pid:owned.pid,instance:owned.identity.instance,signal,removed:true}));
}
export async function control(owned:OwnedProcess,value:Record<string,unknown>):Promise<void>{
 assertOwned(owned,census().find(r=>r.pid===owned.pid));const requestId=randomUUID();
 await new Promise<void>((resolve,reject)=>owned.child.send({...value,requestId},e=>e?reject(e):resolve()));
 await waitUntil(async()=>owned.messages.some(m=>m['requestId']===requestId),'verified control acknowledgement');
 demand(owned.messages.find(m=>m['requestId']===requestId)?.['kind']==='control-ack');
}
