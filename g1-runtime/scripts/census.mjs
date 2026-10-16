import {spawnSync} from 'node:child_process';
export function census(){
 const r=spawnSync('ps',['-axo','pid=,ppid=,pgid=,lstart=,args='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'},timeout:3000,maxBuffer:16*1024*1024});
 if(r.error||r.status!==0)throw new Error('Actual process census unavailable; controller outside sandbox required: '+JSON.stringify({status:r.status,error:r.error?.code,stderr:r.stderr}));
 const rows=r.stdout.trim().split('\n').map(line=>{
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+)$/);
  if(!m)throw new Error('Unparseable process census');
  return {pid:Number(m[1]),ppid:Number(m[2]),pgid:Number(m[3]),birth:m[4].replace(/\s+/g,' '),command:m[5]};
 }).filter(p=>p.pid!==r.pid); // Do not count the census's own transient ps process.
 if(!rows.some(p=>p.pid===process.pid))throw new Error('Current process missing from actual census');
 return rows;
}
export const sameInstance=(a,b)=>Boolean(a&&b&&a.pid===b.pid&&a.birth===b.birth);
export function currentInstance(instance){const current=census().find(p=>p.pid===instance.pid);if(current&&!sameInstance(current,instance))throw new Error('Process birth mismatch; never signal reused PID');return current;}
export function signalOwned(instance,owned,signal){
 if(!owned.some(p=>sameInstance(p,instance)&&p.nonce===instance.nonce)||!instance.nonce)throw new Error('Unproven process ownership');
 if(!currentInstance(instance))return false;
 try{process.kill(instance.pid,signal);return true;}catch(e){
  // A process may exit after the fresh census. Only actual absence confirmed
  // by another OS snapshot resolves ESRCH; mismatched/reused PIDs still fail.
  if(e.code==='ESRCH'&&!currentInstance(instance))return false;
  throw e;
 }
}
