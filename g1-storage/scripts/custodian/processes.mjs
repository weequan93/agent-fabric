import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { processTools,processCensus,hash } from '../recovery/ownership.mjs';
import { readJournal,appendJournal } from './journal.mjs';
import { assertRootOwned } from '../fixture.mjs';

export async function launchFresh(script,config,env={}){
 const {census,waitUntil,assertOwned}=await processTools();census();
 const marker=randomUUID(),child=spawn(process.execPath,[script,marker],{
  env:{PATH:process.env.PATH,LC_ALL:'C',...env,FABRIC_CUSTODIAN_CONFIG:JSON.stringify({...config,marker})},stdio:['pipe','pipe','pipe','ipc']});
 assert(child.pid);let stdout='',stderr='',error;const messages=[];
 const capture=(kind,b)=>{if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+b.length>32*1024*1024){error=new Error('Child output bound exceeded');return;}if(kind==='stdout')stdout+=b;else stderr+=b;};
 child.stdout.on('data',b=>capture('stdout',b));child.stderr.on('data',b=>capture('stderr',b));
 child.on('error',e=>error=e);child.on('message',v=>{if(v&&typeof v==='object')messages.push(v);});
 const exit=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 const parent=census().find(r=>r.pid===process.pid);assert(parent);
 try{
  const readiness=()=>stdout.split('\n').slice(0,-1).map(line=>JSON.parse(line)).filter(v=>v.pid===child.pid&&v.marker===marker);
  await waitUntil(async()=>{if(error)throw error;assert(child.exitCode===null&&child.signalCode===null,'Child exited before readiness');return readiness().length>0;},'custodian child readiness');
  assert.equal(readiness().length,1);const ready=readiness()[0],identity=census().find(r=>r.pid===child.pid);
  assert.equal(ready.pid,child.pid);assert.equal(ready.marker,marker);
  assert.equal(identity?.command,process.execPath+' '+script+' '+marker);
  const owned={child,pid:child.pid,marker,identity,ready,messages,stderr:()=>stderr};assertOwned(owned,identity);
  return {...owned,parent,exit,streams:()=>({stdout,stderr}),failure:()=>error};
 }catch(e){
  const row=census().find(r=>r.pid===child.pid);
  if(row){
   assert.equal(row.ppid,process.pid);assert.equal(row.command,process.execPath+' '+script+' '+marker);
   // A fixture custodian may be in setup even before its ready handshake.
   // Disconnect cooperatively so its unchanged fixture finally can finish.
   if(script.endsWith('/custodian-process.mjs')||script.endsWith('/probe-owner.mjs')){
    if(child.connected)child.disconnect();await waitUntil(async()=>child.exitCode!==null||child.signalCode!==null,'failed startup custodian cleanup',30000);await exit;
   }else{assert(!census().some(r=>r.ppid===row.pid));child.kill('SIGKILL');await exit;}
  }
  Object.defineProperty(e,'streams',{value:{stdout,stderr}});throw e;
 }
}
export function processExpected(p){return {pid:p.pid,nonce:p.marker,instance:p.identity.instance,command:p.identity.command,parentPid:p.parent.pid,parentInstance:p.parent.instance};}
export async function killWorker(p,children,j){
 readJournal(j);const {assertOwned,census}=await processTools();
 function verify(){const rows=census();assertOwned(p,rows.find(r=>r.pid===p.pid));
  const actual=rows.filter(r=>r.ppid===p.pid);assert.deepEqual(actual.map(r=>r.pid).sort(),children.map(c=>c.pid).sort());
  for(const c of children){const row=actual.find(r=>r.pid===c.pid);assert.equal(row.instance,c.instance);assert.equal(row.command,c.command);assert.equal(c.parentPid,p.pid);assert.equal(c.parentInstance,p.identity.instance);assert(!rows.some(r=>r.ppid===c.pid));}
 }
 verify();
 appendJournal(j,{phase:'worker-before-SIGKILL',worker:processExpected(p),children});
 readJournal(j);verify();assert(p.child.kill('SIGKILL'));const result=await p.exit;
 assert.equal(result.signal,'SIGKILL');assert(!census().some(r=>r.pid===p.pid));
 appendJournal(j,{phase:'worker-death-proven',worker:processExpected(p),result});return result;
}
export async function recoverChild(expected,j,fixtures){
 // Journal, roots, recorded child and actual original-parent death are ALL
 // authority requirements. The accepted stopOwned ppid guard is untouched.
 const lines=readJournal(j);
 assert(lines.some(l=>l.event?.phase==='durable-worker'&&l.event.child&&hash(l.event.child)===hash(expected)),'Child not durably registered');
 assert(lines.some(l=>l.event?.phase==='worker-death-proven'&&l.event.worker.pid===expected.parentPid&&l.event.worker.instance===expected.parentInstance),'Parent death not durably proven');
 for(const f of fixtures){assertRootOwned(f.path,f.identity);for(const r of f.roots)assertRootOwned(r.path,r.identity);}
 const verify=async()=>{
  const rows=await processCensus(),row=rows.find(r=>r.pid===expected.pid);
  assert(!rows.some(r=>r.pid===expected.parentPid),'Original parent still present');
  assert(!rows.some(r=>r.pid!==expected.pid&&r.command.includes(expected.nonce)),'Nonce under substituted PID');
  if(!row)return null;
  assert.equal(row.ppid,1);assert.equal(row.instance,expected.instance);assert.equal(row.command,expected.command);
  assert.equal(row.command,process.execPath+' '+expected.script+' '+expected.nonce);
  assert(!rows.some(r=>r.ppid===row.pid),'Unknown descendant');return row;
 };
 const before=await verify();if(!before)return {action:'already-absent',expected};
 appendJournal(j,{phase:'child-before-signal',expected,current:before});await verify();process.kill(expected.pid,'SIGTERM');
 const {waitUntil}=await processTools();await waitUntil(async()=>!(await processCensus()).some(r=>r.pid===expected.pid),'reparented child absence',5000);
 assert.equal(await verify(),null);const result={action:'removed',expected,before,signals:['SIGTERM'],after:'absent'};
 appendJournal(j,{phase:'child-cleaned',result});return result;
}
