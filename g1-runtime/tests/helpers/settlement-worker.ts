/** Fixed one-send local specimen, never an arbitrary execution adapter. */
import {fork,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const role=process.argv[2];if(role!=='parent'&&role!=='child')throw new Error('UNSUPPORTED');
let started=false,stopping=false,child:ChildProcess|null=null,childExit:Promise<void>|null=null,abort:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null;
function send(child:ChildProcess,message:unknown){if(child.connected)child.send(message as object,()=>{});}
async function report(message:unknown){if(process.connected)await new Promise<void>(resolve=>process.send!(message as object,()=>resolve()));}
let activate!:()=>void;const activated=new Promise<void>(r=>{activate=r;});
async function stop(){if(stopping)return;stopping=true;activate();abort?.abort();if(timer)clearTimeout(timer);if(child){send(child,{kind:'stop'});await childExit;}process.stdout.write(role+' settlement stream closed\n');if(process.connected)process.disconnect();}
process.on('disconnect',()=>{void stop();});
process.on('message',async(m:any)=>{
 if(m.kind==='stop'){await stop();return;}if(m.kind==='activate'){if(child)send(child,{kind:'activate'});activate();return;}if(m.kind!=='start'||started)return;started=true;
 const deadline=performance.now()+Math.max(0,m.remainingMs);timer=setTimeout(()=>{void stop();},Math.max(0,deadline-performance.now()));
 if(role==='parent'){
  const before=performance.now();child=fork(fileURLToPath(import.meta.url),['child'],{execArgv:[],env:process.env,stdio:['ignore','inherit','inherit','ipc']});
  childExit=new Promise(r=>child!.once('close',()=>{void report({kind:'descendant-exited',pid:child!.pid}).then(r);}));
  child.on('message',(v:any)=>{if(v.kind==='bootstrap')send(child!,{...m,remainingMs:Math.max(0,m.remainingMs-(performance.now()-before))});if(v.kind==='ready')void report({kind:'ready',pid:process.pid,ppid:process.ppid,childPid:child!.pid});});
 }else await report({kind:'ready',pid:process.pid,ppid:process.ppid});
 await activated;if(stopping)return;abort=new AbortController();
 try{
  if(role==='parent'){
   const result=await fetch(m.endpoint+'/effect',{method:'POST',headers:{authorization:m.credential},body:JSON.stringify(m.request),signal:abort.signal});await result.arrayBuffer();process.send?.({kind:'send-returned'});
  }else{
   const response=await fetch(m.endpoint+'/stream/'+m.request.intent.operationId,{headers:{authorization:m.credential},signal:abort.signal});if(response.status!==200)throw new Error('STREAM_REFUSED');process.stdout.write('descendant actual stream open\n');await response.arrayBuffer();
  }
 }catch{if(role==='parent')process.send?.({kind:'send-ack-lost'});}
 // Parent stays owned until explicit Stop or its independent bounded deadline.
 if(role==='child'&&!stopping)await stop();
});
process.send?.({kind:'bootstrap'});
