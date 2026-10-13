import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import type { StagingControl,LockedStagingLease } from '../../src/owned-cipher-files.js';
import type { CipherProcessInput,CipherProcessMessage } from './cipher-process-protocol.js';

type Input=Omit<CipherProcessInput,'dataKey'|'digestKey'>;
/** Kill only the exact spawned synthetic filesystem worker. The parent retains
 * installed authenticated PG authority and aborts its held transaction on exit.
 * This is real filesystem-process death, not database-host/power-loss evidence. */
export async function killCipherProcess(control:StagingControl,input:Input,
 observe:(id:string,pid:number)=>Promise<void>){
 const dataKey=randomBytes(32),digestKey=randomBytes(32);
 const child=fork(new URL('./cipher-process-worker.js',import.meta.url),[],
  {execArgv:[],env:{},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});
 const pid=child.pid;assert.ok(pid&&pid>1&&pid!==process.pid);
 const output:Buffer[]=[];
 child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));
 let lease:LockedStagingLease|undefined,release:(()=>void)|undefined,abort:((e:Error)=>void)|undefined;
 let phaseResolve!:(v:{id:string;phase:string})=>void,phaseReject!:(e:Error)=>void;
 const phase=new Promise<{id:string;phase:string}>((resolve,reject)=>{phaseResolve=resolve;phaseReject=reject;});
 // Attach rejection immediately, including exit-before-phase and timeout paths.
 phase.catch(()=>{});
 const closed=once(child,'close');closed.catch(()=>{});
 const operations:Promise<void>[]=[];let lockFailure:unknown,closing=false;
 const send=(m:CipherProcessMessage)=>{if(child.connected&&!closing)child.send(m);};
 child.once('exit',()=>{closing=true;const e=new Error('Filesystem worker exited');abort?.(e);phaseReject(e);});
 child.on('message',(raw:unknown)=>{
  const m=raw as CipherProcessMessage;
  if(m.kind==='phase'){
   try{assert.equal(m.phase,input.stopAt);assert.ok(lease);assert.ok(m.uploadId);phaseResolve({id:m.uploadId,phase:m.phase!});}catch{phaseReject(new Error('Unproven filesystem phase'));}
   return;
  }
  if(m.kind!=='request'){phaseReject(new Error('Unexpected filesystem worker completion'));return;}
  const operation=(async()=>{
   try{
    let value:unknown;
    if(m.operation==='reserve'){
     assert.ok(!lease);assert.equal(m.args?.length,3);
     await control.reserve(m.args![0] as string,m.args![1] as string,m.args![2] as Input['binding']);
    }else if(m.operation==='lock'){
     assert.ok(!lease);assert.equal(m.args?.length,1);
     try{await control.lock(m.args![0] as string,async l=>{
      lease=l;const held=new Promise<void>((resolve,reject)=>{release=resolve;abort=reject;});
      send({kind:'reply',request:m.request!,value:null});await held;
     });}catch(e){lockFailure=e;throw e;}finally{lease=undefined;abort=undefined;release=undefined;}
     return;
    }else{
     assert.ok(lease);
     if(m.operation==='current')value=await lease.current();
     else if(m.operation==='confirm')await lease.confirm(m.args![0] as Parameters<LockedStagingLease['confirm']>[0]);
     else if(m.operation==='publish')await lease.publish(m.args![0] as Parameters<LockedStagingLease['publish']>[0]);
     else if(m.operation==='unlock')release!();
     else throw new Error('Unknown installed owner operation');
    }
    send({kind:'reply',request:m.request!,value});
   }catch{send({kind:'refusal',request:m.request!});if(!closing)phaseReject(new Error('Installed owner RPC failed'));}
  })();operations.push(operation);
 });
 const timer=setTimeout(()=>phaseReject(new Error('Filesystem phase timeout')),10_000);
 let observed=false,phaseValue:{id:string;phase:string}|undefined;
 try{
  child.send({kind:'install',value:{...input,dataKey,digestKey}});
  phaseValue=await phase;await observe(phaseValue.id,pid);observed=true;
  assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);
  assert.equal(child.kill('SIGKILL'),true,'Exact owned filesystem process must be killed');
  const [code,signal]=await closed;
  assert.equal(code,null);assert.equal(signal,'SIGKILL');
  await Promise.all(operations);assert.ok(lockFailure,'Killed filesystem worker must abort its held PG transaction');
  assert.equal(Buffer.concat(output).length,0,'Worker must emit no content/key/diagnostic output');
  console.log(JSON.stringify({measurement:'storage-cipher-process-kill',phase:input.stopAt,operation:input.operation,
   pid,uploadId:phaseValue.id,signal,exitCode:code,phaseObserved:observed,pgOwnerAborted:true,workerOutputBytes:0}));
  return phaseValue.id;
 }finally{
  clearTimeout(timer);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await closed;await Promise.all(operations);dataKey.fill(0);digestKey.fill(0);
 }
}
