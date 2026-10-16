import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {api} from './owned-capsule.js';
import type {LocalOriginalRecord} from './settlement-ledger.js';
export class SettlementControl {
 private parent:ChildProcess|null=null;private childPid=-1;private childExited=false;private parentExited=false;private streamsComplete=false;private stdoutBytes=0;private stderrBytes=0;private parentBirth='';private childBirth='';private ended!:()=>void;private exit=new Promise<void>(r=>{this.ended=r;});
 readonly send:Promise<void>;private sent!:()=>void;
 constructor(){this.send=new Promise(r=>{this.sent=r;});}
 async start(config:{endpoint:string;credential:string;request:unknown;remainingMs:number}){
  const begin=performance.now();assert.ok(config.remainingMs>0&&config.remainingMs<=30_000);
  const env:Record<string,string>={};for(const k of ['NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG','RUNTIME_SOURCE_ROOT'])if(process.env[k])env[k]=process.env[k]!;
  const parent=fork(fileURLToPath(new URL('./settlement-worker.js',import.meta.url)),['parent'],{execArgv:[],env,stdio:['ignore','pipe','pipe','ipc']});this.parent=parent;
  parent.stdout!.on('data',(b:Buffer)=>{this.stdoutBytes+=b.length;process.stdout.write(b);});parent.stderr!.on('data',(b:Buffer)=>{this.stderrBytes+=b.length;process.stderr.write(b);});
  parent.once('close',()=>{this.parentExited=true;this.streamsComplete=true;this.ended();});
  parent.on('message',(m:any)=>{if(m.kind==='descendant-exited'&&m.pid===this.childPid)this.childExited=true;if(m.kind==='send-ack-lost')this.sent();});
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('WORKER_START_TIMEOUT')),6500);parent.once('error',reject);parent.on('message',(m:any)=>{
   if(m.kind==='bootstrap')parent.send({...config,remainingMs:Math.max(0,config.remainingMs-(performance.now()-begin)),kind:'start'});
   if(m.kind==='ready'){clearTimeout(timer);assert.equal(m.pid,parent.pid);assert.equal(m.ppid,process.pid);this.childPid=m.childPid;resolve();}
  });});
  const {census}=await api('census'),rows=census(),p=rows.find((r:any)=>r.pid===parent.pid),c=rows.find((r:any)=>r.pid===this.childPid);assert.ok(p&&c);assert.equal(p.ppid,process.pid);assert.equal(c.ppid,p.pid);
  for(const row of [p,c]){assert.equal(row.command,'af-runtime:'+process.env['RUNTIME_OWNER_NONCE']);const ack=JSON.parse(readFileSync(process.env['RUNTIME_BIRTH_LOG']+'.'+row.pid+'.ack','utf8'));assert.equal(ack.pid,row.pid);assert.equal(ack.nonce,process.env['RUNTIME_OWNER_NONCE']);assert.equal(ack.birth,row.birth);}
  this.parentBirth=p.birth;this.childBirth=c.birth;parent.send({kind:'activate'});
 }
 observe():NonNullable<LocalOriginalRecord['process']>{return {parentPid:this.parent?.pid??-1,childPid:this.childPid,parentBirth:this.parentBirth,childBirth:this.childBirth,parentExited:this.parentExited,childExited:this.childExited,streamsComplete:this.streamsComplete,terminated:this.parentExited&&this.childExited&&this.streamsComplete,stdoutBytes:this.stdoutBytes,stderrBytes:this.stderrBytes};}
 async stop(){if(this.parentExited){assert.equal(this.observe().terminated,true,JSON.stringify(this.observe()));return this.observe();}if(this.parent?.connected)this.parent.send({kind:'stop'});let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([this.exit,new Promise(r=>{timer=setTimeout(r,3000);})]);assert.equal(this.observe().terminated,true,JSON.stringify(this.observe()));return this.observe();}finally{if(timer)clearTimeout(timer);}}
}
