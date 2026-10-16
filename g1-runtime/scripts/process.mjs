import {fork} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {census,sameInstance} from './census.mjs';
import {verifyRaw} from './result.mjs';
export async function supervise({args,cwd,evidence,env={},nonce=randomUUID(),timeoutMs=120000,maxBytes=16*1024*1024,signal}){
 census();
 const configPath=join(evidence,'process-config.json');
 writeFileSync(configPath,JSON.stringify({args,cwd,evidence,env,nonce,timeoutMs,maxBytes}),{flag:'wx'});
 const inherited={...process.env};
 // A copied single-suite fixture is a separate Node runner, not a nested test
 // registration in the parent's worker/serialization channel.
 delete inherited.NODE_TEST_CONTEXT;
 const supervisor=fork(new URL('./supervisor.mjs',import.meta.url),[configPath,nonce],{stdio:['ignore','ignore','pipe','ipc'],execArgv:[],env:inherited});
 let birth,result,stderr='',timer;
 const cancel=()=>{if(supervisor.connected)supervisor.send({type:'cancel'});};
 const onSignal=()=>cancel();
 process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);signal?.addEventListener('abort',cancel,{once:true});
 supervisor.stderr.on('data',b=>{stderr+=b.toString();});
 try{
  const completion=await new Promise((resolve,reject)=>{
   supervisor.once('error',reject);
   supervisor.on('message',m=>{
    if(m?.type==='started'){try{birth=census().find(p=>p.pid===supervisor.pid);if(!birth||!birth.command.includes(nonce))throw new Error('Supervisor birth/nonce unavailable');}catch(e){cancel();reject(e);}}
    if(m?.type==='finished')result=m.result;
   });
   supervisor.once('close',(status,signal)=>resolve({status,signal}));
   timer=setTimeout(()=>{cancel();},timeoutMs+1000);
  });
  const rows=census();
  if(result?.rawStreams)verifyRaw(evidence,result.rawStreams);
  if(!birth||rows.some(p=>sameInstance(p,birth))||!result||result.nonce!==nonce||result.cleanup?.confirmed!==true||result.streamsComplete!==true||completion.status!==0||completion.signal||result.error)throw new Error('Owned supervisor failed: '+JSON.stringify({completion,result,stderr}));
  if(rows.some(p=>p.command.includes(nonce)))throw new Error('Nonce-bearing process survived supervisor cleanup');
  const births=readFileSync(join(evidence,'births.ndjson'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  for(const b of births)if(b.nonce!==nonce||!result.owned.some(o=>o.pid===b.pid&&o.ppid===b.ppid))throw new Error('Unobserved Node descendant birth: '+JSON.stringify(b));
  return {...result,supervisorExitObserved:true,births};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);}
}
