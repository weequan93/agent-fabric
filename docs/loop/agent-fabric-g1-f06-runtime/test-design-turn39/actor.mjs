// Owned diagnostic data/process only. No target, browser, network or credentials.
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [role,dir,nonce]=process.argv.slice(2);
if(!['root','grandchild','sentinel'].includes(role)||!dir||!nonce)throw new Error('Closed specimen arguments');
if(role==='sentinel')process.title='af-design-sentinel:'+nonce;
writeFileSync(join(dir,role+'-ready.json'),JSON.stringify({role,nonce,pid:process.pid,ppid:process.ppid}));
if(role==='root')spawn(process.execPath,[new URL(import.meta.url).pathname,'grandchild',dir,nonce],{stdio:['ignore','inherit','inherit']});
let count=0;
const timer=setInterval(()=>writeFileSync(join(dir,role+'-heartbeat.json'),JSON.stringify({pid:process.pid,count:++count})),100);
// Independent bounded self-expiry even if the tested supervisor fails cleanup.
setTimeout(()=>{clearInterval(timer);process.exit(0);},12000);
