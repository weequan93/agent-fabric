// Synthetic primitive resource availability only, never storage qualification.
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { mkdtemp, open, rename, readFile, rm } from 'node:fs/promises';
import { tmpdir, platform, arch, totalmem, freemem, availableParallelism } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
const key=randomBytes(32), iv=randomBytes(12), aad=randomBytes(20), plain=randomBytes(1024);
const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
function decrypt(k, a, body, t) { const d=createDecipheriv('aes-256-gcm',k,iv);d.setAAD(a);d.setAuthTag(t);return Buffer.concat([d.update(body),d.final()]); }
assert.deepEqual(decrypt(key,aad,encrypted,tag),plain);
const changed=Buffer.from(encrypted);changed[0]^=1;
for(const args of [[randomBytes(32),aad,encrypted,tag],[key,randomBytes(20),encrypted,tag],[key,aad,changed,tag],[key,aad,encrypted,randomBytes(16)]])assert.throws(()=>decrypt(...args));
assert.notEqual(createHmac('sha256',key).update(plain).digest('hex'),createHmac('sha256',randomBytes(32)).update(plain).digest('hex'));
const root=await mkdtemp(join(tmpdir(),'af-resource86-'));
try { const from=join(root,'staged'),to=join(root,'confirmed');const f=await open(from,'wx',0o600);await f.writeFile(encrypted);await f.sync();await f.close();await rename(from,to);const dir=await open(root,'r');await dir.sync();await dir.close();assert.deepEqual(await readFile(to),encrypted); }
finally { await rm(root,{recursive:true}); }
const server=createServer((req,res)=>res.end('synthetic-resource-86'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try { assert.equal(await (await fetch('http://127.0.0.1:'+server.address().port,{signal:AbortSignal.timeout(2000)})).text(),'synthetic-resource-86'); }
finally { await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
for(const signal of ['SIGKILL','SIGTERM']) {
 const child=spawn(process.execPath,['-e',"process.send({kind:'ready',pid:process.pid});setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('IPC readiness timeout')),2000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.once('error',reject);});
 assert.equal(ready.pid,child.pid);assert.equal(ready.kind,'ready');
 const ended=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('child exit timeout')),2000);child.once('exit',(code,sig)=>{clearTimeout(timer);resolve({code,sig});});});
 assert.equal(child.kill(signal),true);assert.deepEqual(await ended,{code:null,sig:signal});
}
const census=spawnSync('/bin/ps',['-axo','pid=,ppid=,pgid=,lstart=,command='],{encoding:'utf8',timeout:3000});
const censusResult={argv:['/bin/ps','-axo','pid=,ppid=,pgid=,lstart=,command='],status:census.status,signal:census.signal,error:census.error?{code:census.error.code,message:census.error.message}:null,stdout:census.stdout??'',stderr:census.stderr??''};
console.log(JSON.stringify({measurement:'resource-primitives',cryptoRoundTrip:true,integrityRefusals:4,scopedHmac:true,exclusiveFileFsyncRenameDirectorySync:true,loopbackHttp:true,ownedIpcSignals:['SIGKILL','SIGTERM'],monotonicClock:typeof performance.now==='function',host:{platform:platform(),arch:arch(),parallelism:availableParallelism(),totalmem:totalmem(),freemem:freemem()},census:censusResult,qualification:'resource availability only; no repeated atomic repair, storage restore or external qualification'}));
