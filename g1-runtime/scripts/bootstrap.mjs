// Every Node descendant cooperates with the owned-fixture census. This is not
// an OS boundary against hostile code or same-user processes.
import {appendFileSync,existsSync,readFileSync} from 'node:fs';
const nonce=process.env.RUNTIME_OWNER_NONCE;
if(nonce&&process.env.RUNTIME_BIRTH_LOG){
 process.title='af-runtime:'+nonce;
 appendFileSync(process.env.RUNTIME_BIRTH_LOG,JSON.stringify({nonce,pid:process.pid,ppid:process.ppid})+'\n');
 const ack=process.env.RUNTIME_BIRTH_LOG+'.'+process.pid+'.ack',until=performance.now()+5000;
 while(!existsSync(ack)&&performance.now()<until)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
 if(!existsSync(ack))throw new Error('Node birth was not independently observed');
 const observed=JSON.parse(readFileSync(ack,'utf8'));
 if(observed.nonce!==nonce||observed.pid!==process.pid||typeof observed.birth!=='string'||!observed.birth)throw new Error('Node birth was not independently observed');
}
