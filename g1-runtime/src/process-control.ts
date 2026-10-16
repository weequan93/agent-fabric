/** Fixed cooperative local workload. No caller supplied executable, PID or signal. */
import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bindingDigest,type Generation} from './owners.js';
export interface ProcessLaunch {readonly endpoint:string;readonly credential:string;readonly operationId:string;readonly bootId:string;readonly generation:Generation;readonly remainingMs:number}
export interface ProcessObservation {readonly parentPid:number;readonly childPid:number;readonly bootId:string;readonly generation:Generation;readonly parentExited:boolean;readonly childExited:boolean;readonly streamsComplete:boolean;readonly terminated:boolean;readonly stdoutBytes:number;readonly stderrBytes:number}
export interface ProcessControl {start(launch:ProcessLaunch):Promise<void>;activate():void;stop():Promise<ProcessObservation>;observe():ProcessObservation}
export class OwnedProcessControl implements ProcessControl {
 private parent:ChildProcess|null=null;private launch:ProcessLaunch|null=null;private childPid=-1;
 private parentExited=false;private childExited=false;private streamsComplete=false;
 private stdoutBytes=0;private stderrBytes=0;
 private readonly ended:Promise<void>;private endedResolve!:()=>void;
 constructor(){this.ended=new Promise(resolve=>{this.endedResolve=resolve;});}
 async start(launch:ProcessLaunch):Promise<void>{
  if(this.parent||!Number.isFinite(launch.remainingMs)||launch.remainingMs<=0||launch.remainingMs>30_000)throw new Error('PROCESS_CONTROL_UNAVAILABLE');
  const url=new URL(launch.endpoint);if(url.origin!==launch.endpoint||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port)throw new Error('PROCESS_CONTROL_UNAVAILABLE');
  this.launch=structuredClone(launch);
  const env:Record<string,string>={};for(const key of ['NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG'])if(process.env[key])env[key]=process.env[key]!;
  const parent=fork(fileURLToPath(new URL('./workers/continuation-worker.js',import.meta.url)),['parent'],{execArgv:[],env,stdio:['ignore','pipe','pipe','ipc']});this.parent=parent;
  // Drain both finite observation streams; completion is observed on close, not kill acceptance.
  parent.stdout!.on('data',(b:Buffer)=>{this.stdoutBytes+=b.length;});parent.stderr!.on('data',(b:Buffer)=>{this.stderrBytes+=b.length;});
  parent.on('message',(raw:unknown)=>{const m=raw as any;if(m?.kind==='descendant-exited'&&m.pid===this.childPid&&m.bootId===launch.bootId&&bindingDigest(m.generation)===bindingDigest(launch.generation))this.childExited=true;});
  parent.once('close',()=>{this.parentExited=true;this.streamsComplete=true;this.endedResolve();});
  const started=performance.now();
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('PROCESS_CONTROL_UNAVAILABLE')),6500);
   const error=()=>{clearTimeout(timeout);reject(new Error('PROCESS_CONTROL_UNAVAILABLE'));};parent.once('error',error);
   const onMessage=(raw:unknown)=>{const m=raw as any;if(m?.kind!=='ready')return;
    clearTimeout(timeout);parent.off('message',onMessage);parent.off('error',error);
    if(m.pid!==parent.pid||m.ppid!==process.pid||!Number.isSafeInteger(m.childPid)||m.childPid<=0||m.bootId!==launch.bootId||bindingDigest(m.generation)!==bindingDigest(launch.generation)){reject(new Error('PROCESS_CONTROL_UNAVAILABLE'));return;}
    this.childPid=m.childPid;resolve();
   };parent.on('message',onMessage);
   // Start time is before launch/ACK. Startup does not extend the privileged lease.
   parent.once('message',raw=>{if((raw as any)?.kind==='bootstrap'){
    const remainingMs=launch.remainingMs-(performance.now()-started);
    parent.send({...launch,remainingMs:Math.max(0,remainingMs),kind:'start'});
   }});
  });
 }
 observe():ProcessObservation {return {parentPid:this.parent?.pid??-1,childPid:this.childPid,bootId:this.launch?.bootId??'',generation:this.launch?.generation??{cancellation:0,worker:1,resource:0},parentExited:this.parentExited,childExited:this.childExited,streamsComplete:this.streamsComplete,terminated:this.parentExited&&this.childExited&&this.streamsComplete,stdoutBytes:this.stdoutBytes,stderrBytes:this.stderrBytes};}
 activate():void {if(!this.parent?.connected||this.childPid<=0||this.parentExited)throw new Error('PROCESS_CONTROL_UNAVAILABLE');this.parent.send({kind:'activate'});}
 async stop():Promise<ProcessObservation>{
  const parent=this.parent;if(parent?.connected)parent.send({kind:'stop'});
  if(!this.parentExited)await Promise.race([this.ended,new Promise<void>(resolve=>{const timer=setTimeout(resolve,2200);timer.unref();})]);
  return this.observe();
 }
}
