import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,writeSync,closeSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {census,sameInstance,signalOwned} from './census.mjs';
import {publishBirthAck} from './birth-ack.mjs';
const [configPath,nonce]=process.argv.slice(2),config=JSON.parse(readFileSync(configPath,'utf8'));
if(!nonce||nonce!==config.nonce||!process.send)throw new Error('Supervisor requires nonce and IPC owner');
process.title='af-supervisor:'+nonce;
const owned=[],signals=[],snapshots=[];let child,closed=false,settling=false,problem=null,timedOut=false,exit=null,bytes=0,monitor,deadline;
const fds=[openSync(join(config.evidence,'stdout.txt'),'wx'),openSync(join(config.evidence,'stderr.txt'),'wx')];
const hashes=[createHash('sha256'),createHash('sha256')],sizes=[0,0];
function observe(){
 // Freeze the birth-log prefix before taking the OS snapshot. A child born
 // during census stays blocked in bootstrap until the next observation; its
 // newly appended log entry must not be judged against an older OS snapshot.
 const log=join(config.evidence,'births.ndjson');
 const births=existsSync(log)?readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
 const rows=census(),self=rows.find(p=>p.pid===process.pid);
 if(!self||!self.command.includes(nonce))throw new Error('Supervisor nonce not observable');
 let changed=true;
 while(changed){changed=false;for(const p of rows){
  if(p.pid===process.pid||owned.some(o=>sameInstance(o,p)))continue;
  if(p.ppid===process.pid||owned.some(o=>o.pid===p.ppid&&rows.some(r=>sameInstance(r,o)))){owned.push({...p,nonce,observedAt:performance.now()});changed=true;}
 }}
 snapshots.push({at:performance.now(),live:owned.filter(o=>rows.some(p=>sameInstance(p,o))).map(o=>o.pid)});
 for(const b of births){
  const o=owned.find(o=>o.pid===b.pid&&o.ppid===b.ppid);
  const ack=log+'.'+b.pid+'.ack';
  if(b.nonce!==nonce||!o)throw new Error('Unproven descendant birth');
  if(!existsSync(ack)){
   if(!rows.some(p=>sameInstance(p,o)))throw new Error('Descendant exited before birth acknowledgement');
   publishBirthAck(ack,{nonce,pid:o.pid,birth:o.birth});
  }
 }
 return rows;
}
function mark(error){problem??=String(error.stack??error);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function cleanup(){
 let rows=observe();
 for(const signal of ['SIGTERM','SIGKILL']){
  for(const o of [...owned].reverse())if(rows.some(p=>sameInstance(p,o))&&signalOwned(o,owned,signal))signals.push({pid:o.pid,birth:o.birth,signal});
  const until=performance.now()+1500;
  while(performance.now()<until){rows=observe();if(!owned.some(o=>rows.some(p=>sameInstance(o,p))))break;await pause(25);}
 }
 rows=observe();
 const remaining=owned.filter(o=>rows.some(p=>sameInstance(o,p)));
 const escaped=rows.filter(p=>p.pid!==process.pid&&p.command.includes(nonce)&&!owned.some(o=>sameInstance(o,p)));
 if(remaining.length||escaped.length)throw new Error('Unresolved owned process residue: '+JSON.stringify({remaining,escaped}));
 return {confirmed:true,remaining:[],historicalGroupsSignalled:false};
}
async function finish(reason){
 if(settling)return;settling=true;clearInterval(monitor);clearTimeout(deadline);
 if(reason)mark(new Error(reason));
 let cleanupResult;
 try{cleanupResult=await cleanup();}catch(e){mark(e);cleanupResult={confirmed:false,error:String(e)};}
 if(child&&!closed){await Promise.race([new Promise(r=>child.once('close',r)),pause(1000)]);if(!closed){
  mark(new Error('Child streams not closed; failed raw capture incomplete'));
  // A failed/quarantined cleanup cannot certify complete streams. Stop local
  // readers before closing their files so later bytes cannot cause EBADF and
  // erase the original failure report. Success still requires actual close.
  for(const stream of [child.stdout,child.stderr]){stream.removeAllListeners('data');stream.destroy();}
 }}
 fds.forEach(closeSync);
 const rawStreams=Object.fromEntries(['stdout.txt','stderr.txt'].map((name,i)=>[name,{bytes:sizes[i],sha256:hashes[i].digest('hex')}]));
 const result={schemaVersion:1,nonce,candidate:config.env.RUNTIME_CANDIDATE??process.env.RUNTIME_CANDIDATE??null,rawStreams,streamsComplete:closed,supervisor:{pid:process.pid,ppid:process.ppid},owned,signals,snapshots,exit,timedOut,streamBytes:bytes,cleanup:cleanupResult,error:problem};
 writeFileSync(join(config.evidence,'supervisor.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 if(process.connected)await new Promise(resolve=>process.send({type:'finished',result},()=>resolve()));
 process.exitCode=problem||!cleanupResult.confirmed?1:0;
 if(process.connected)process.disconnect();
}
process.on('disconnect',()=>{if(!settling)void finish('Runner disconnected; independent cleanup');});
process.on('SIGTERM',()=>{void finish('Supervisor cancellation');});
process.on('message',m=>{if(m?.type==='cancel')void finish('Runner cancellation');});
try{
 observe();
 child=spawn(process.execPath,config.args,{cwd:config.cwd,env:{...process.env,...config.env,RUNTIME_OWNER_NONCE:nonce,RUNTIME_BIRTH_LOG:join(config.evidence,'births.ndjson'),NODE_OPTIONS:[process.env.NODE_OPTIONS??'','--import='+new URL('./bootstrap.mjs',import.meta.url).href].join(' ')},stdio:['ignore','pipe','pipe']});
 child.once('error',e=>{mark(e);void finish('Child spawn failed');});
 child.stdout.on('data',b=>{writeSync(fds[0],b);hashes[0].update(b);sizes[0]+=b.length;bytes+=b.length;if(bytes>config.maxBytes)void finish('Output budget exceeded');});
 child.stderr.on('data',b=>{writeSync(fds[1],b);hashes[1].update(b);sizes[1]+=b.length;bytes+=b.length;if(bytes>config.maxBytes)void finish('Output budget exceeded');});
 child.once('spawn',()=>{try{observe();process.send({type:'started',pid:child.pid,supervisor:process.pid});}catch(e){mark(e);void finish('Birth census failed');}});
 child.once('close',(status,signal)=>{closed=true;exit={status,signal};void finish();});
 monitor=setInterval(()=>{try{observe();}catch(e){mark(e);void finish('Census lost');}},75);
 deadline=setTimeout(()=>{timedOut=true;void finish('Child timeout');},config.timeoutMs);
}catch(e){mark(e);await finish('Supervisor preflight failed');}
