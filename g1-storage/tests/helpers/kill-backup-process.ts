import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import type { OwnedAnchorRoot } from '../../src/epoch-journal.js';
import type { BackupCommandSchema } from '../../src/schema.js';
export interface BackupProcessInput {
 controllerDsn:string;authorityDsn:string;issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;
 keyId:string;generation:string;dataKey:Buffer;digestKey:Buffer;contentRoot:OwnedAnchorRoot;backupRoot:OwnedAnchorRoot;authorityRoot:OwnedAnchorRoot;
 command:ReturnType<typeof BackupCommandSchema.parse>;operation:'capture'|'confirm';stopAt:'archive-fsynced'|'directory-fsynced';
}
/** Own and kill exactly this process. Parent observes the actual PG transaction
 * and waits for backend death/rollback before recreating the owner. Local process
 * death is not power loss, database-host death or regional disaster recovery. */
export async function killBackupProcess(input:BackupProcessInput,observe:(pid:number)=>Promise<void>,gone:(pid:number)=>Promise<void>){
 const child=fork(new URL('./backup-process-worker.js',import.meta.url),[],{execArgv:[],env:{},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'}),pid=child.pid;assert.ok(pid&&pid>1&&pid!==process.pid);
 const output:Buffer[]=[];child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));
 const closed=once(child,'close');closed.catch(()=>{});let phaseResolve!:(pid:number)=>void,phaseReject!:(e:Error)=>void;
 const phase=new Promise<number>((resolve,reject)=>{phaseResolve=resolve;phaseReject=reject;});phase.catch(()=>{});
 child.on('message',(raw:unknown)=>{try{const m=raw as {kind:string;operation:string;phase:string;pid:number};assert.equal(m.kind,'phase');assert.equal(m.phase,input.stopAt);assert.equal(m.operation,input.operation);assert.ok(Number.isInteger(m.pid)&&m.pid>0);phaseResolve(m.pid);}catch{phaseReject(new Error('Unproven backup phase'));}});
 child.once('exit',()=>phaseReject(new Error('Backup worker exited before phase')));const timer=setTimeout(()=>phaseReject(new Error('Backup phase timeout')),10_000);
 try{child.send(input);const backend=await phase;await observe(backend);assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);assert.equal(child.kill('SIGKILL'),true);const [code,signal]=await closed;assert.equal(code,null);assert.equal(signal,'SIGKILL');await gone(backend);const bytes=Buffer.concat(output),text=bytes.toString('utf8');
  // Report fixed diagnostic facts, never the raw worker output: it may contain
  // paths or synthetic credentials. The zero-byte oracle remains unconditional.
  assert.equal(bytes.length,0,JSON.stringify({workerOutputBytes:bytes.length,outputSha256:createHash('sha256').update(bytes).digest('hex'),warningCodes:[...new Set(text.match(/\bDEP\d{4}\b/g)??[])],fileHandleGarbageCollected:/Closing file descriptor \d+ on garbage collection/.test(text),implicitFileHandleCloseDeprecated:/Closing a FileHandle object on garbage collection is deprecated/.test(text)}));
  console.log(JSON.stringify({measurement:'storage-backup-process-kill',operation:input.operation,phase:input.stopAt,pid,backendPid:backend,phaseObserved:true,signal,exitCode:code,backendGone:true,workerOutputBytes:0}));
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
}
