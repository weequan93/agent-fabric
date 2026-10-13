import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { census } from '../../../g1-model/tests/helpers/process-fixture.js';
import type { OwnedAnchorRoot } from '../../src/epoch-journal.js';
import type { RestoreCommandSchema } from '../../src/schema.js';
export interface RestoreProcessInput {
 controllerDsn:string;authorityDsn:string;issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;
 keyId:string;generation:string;dataKey:Buffer;digestKey:Buffer;targetKeyId:string;targetDataKey:Buffer;targetDigestKey:Buffer;
 backupRoot:OwnedAnchorRoot;restoreRoot:OwnedAnchorRoot;authorityRoot:OwnedAnchorRoot;
 command:ReturnType<typeof RestoreCommandSchema.parse>;
 stopAt:'item-fsynced'|'item-recorded'|'staging-created'|'import-validated'|'metadata-imported'|'restrictions-reconciled'|'before-activation-commit'|'after-activation-commit';
 operation?:'resume'|'activate';
}
/** Private-IPC held keys and credentials. Kill exactly this owned process after
 * actual fsync checkpoint and PG transaction observation; prove backend death. */
export interface RestoreProcessObservation {kind:string;phase:string;pid:number;index:number;activationRows:number;operationId:string;nonce:string;result?:unknown}
export async function killRestoreProcess(input:RestoreProcessInput,observe:(pid:number,observation?:RestoreProcessObservation)=>Promise<void>,gone:(pid:number)=>Promise<void>){
 census();const nonce=randomUUID();
 const child=fork(new URL('./restore-process-worker.js',import.meta.url),[nonce],{execArgv:[],env:{},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'}),pid=child.pid;assert.ok(pid&&pid>1&&pid!==process.pid);
 const output:Buffer[]=[];child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));
 const closed=once(child,'close');closed.catch(()=>{});let hit!:(pid:number)=>void,fail!:(e:Error)=>void;
 let observation:RestoreProcessObservation|undefined;
 const phase=new Promise<number>((r,j)=>{hit=r;fail=j;});phase.catch(()=>{});
 child.on('message',(raw:unknown)=>{try{const m=raw as RestoreProcessObservation;assert.equal(m.nonce,nonce);assert.equal(m.operationId,input.command.targetId);observation=m;assert.equal(m.kind,'phase');assert.equal(m.phase,input.stopAt);assert.ok(Number.isInteger(m.index)&&m.index>=0);assert.ok(Number.isInteger(m.pid)&&m.pid>0);hit(m.pid);}catch{fail(new Error('Unproven restore phase'));}});
 child.once('exit',()=>fail(new Error('Restore worker exited before phase')));const timer=setTimeout(()=>fail(new Error('Restore phase timeout')),10_000);
 let identity:ReturnType<typeof census>[number]|undefined;
 const owned=()=>{const row=census().find(r=>r.pid===pid);assert.ok(row);assert.equal(row.ppid,process.pid);assert.ok(row.command.includes(nonce));if(identity)assert.deepEqual(row,identity);else identity=row;assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);assert.equal(census().some(r=>r.ppid===pid),false);};
 try{owned();child.send({...input,nonce});const backend=await phase;await observe(backend,observation);owned();assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);assert.equal(child.kill('SIGKILL'),true);const [code,signal]=await closed;assert.equal(code,null);assert.equal(signal,'SIGKILL');await gone(backend);assert.equal(census().some(r=>r.pid===pid),false);assert.equal(Buffer.concat(output).length,0);
  console.log(JSON.stringify({measurement:'storage-restore-process-kill',phase:input.stopAt,index:observation!.index,pid,nonce,instance:identity!.instance,backendPid:backend,activationRows:observation!.activationRows,phaseObserved:true,signal,exitCode:code,backendGone:true,workerOutputBytes:0}));
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){owned();child.kill('SIGKILL');}await closed;}
}
