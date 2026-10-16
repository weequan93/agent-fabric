/** Only the fixed local parent/descendant stream workload is installed. */
import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {ProcessLaunch} from '../process-control.js';
const role=process.argv[2];if(role!=='parent'&&role!=='child')throw new Error('UNSUPPORTED');
let child:ChildProcess|null=null,stopping=false,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null;
let started:ProcessLaunch|null=null;
let childExit:Promise<void>|null=null;
let activate!:()=>void;const activation=new Promise<void>(resolve=>{activate=resolve;});
async function stop(){
 if(stopping)return;stopping=true;activate();controller?.abort();if(timer)clearTimeout(timer);
 if(child){if(child.connected)child.send({kind:'stop'});await childExit;}
 process.stdout.write(role+' stream closed\n');if(process.connected)process.disconnect();
}
process.on('disconnect',()=>{void stop();});
process.on('message',async(raw:unknown)=>{
 const m=raw as ProcessLaunch&{kind:string};if(m.kind==='stop'){await stop();return;}if(m.kind==='activate'){if(child?.connected)child.send({kind:'activate'});activate();return;}if(m.kind!=='start'||started)return;
 started=m;const deadline=performance.now()+Math.max(0,m.remainingMs);
 timer=setTimeout(()=>{void stop();},Math.max(0,deadline-performance.now()));
 if(role==='parent'){
  const before=performance.now();child=fork(fileURLToPath(import.meta.url),['child'],{execArgv:[],env:process.env,stdio:['ignore','inherit','inherit','ipc']});
  childExit=new Promise(resolve=>{child!.once('close',()=>{if(process.connected)process.send!({kind:'descendant-exited',pid:child!.pid,bootId:started!.bootId,generation:started!.generation});resolve();});});
  child.on('error',()=>{void stop();});
  child.on('message',(value:any)=>{if(value?.kind==='bootstrap')child!.send({...m,remainingMs:Math.max(0,m.remainingMs-(performance.now()-before)),kind:'start'});if(value?.kind==='ready')process.send?.({kind:'ready',pid:process.pid,ppid:process.ppid,childPid:child!.pid,bootId:m.bootId,generation:m.generation});});
 }else process.send?.({kind:'ready',pid:process.pid,ppid:process.ppid,bootId:m.bootId,generation:m.generation});
 await activation;
 while(!stopping&&performance.now()<deadline){
  controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),300);
  try{const r=await fetch(m.endpoint+'/step',{method:'POST',headers:{authorization:m.credential,'content-type':'application/json'},body:JSON.stringify({operationId:m.operationId,bootId:m.bootId,generation:m.generation,pid:process.pid,role,action:'mutation'}),signal:controller.signal});if(r.status!==200){await stop();break;}await r.arrayBuffer();process.stdout.write(role+' tick\n');}
  catch{await stop();break;}finally{clearTimeout(timeout);}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,50));
 }
 await stop();
});
process.send?.({kind:'bootstrap'});
