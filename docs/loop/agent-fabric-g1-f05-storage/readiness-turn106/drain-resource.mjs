// Resource capability probe only. Does not import or implement product transport.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
const base=new URL('./',import.meta.url);
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const fatal of [false,true]){
 const name=fatal?'fatal':'success',start=performance.now();
 const prefix=Buffer.from('resource-prefix\n'),body=Buffer.alloc(524288,120),final=Buffer.from('\nresource-final-clock\n');
 const stderr=Buffer.concat([Buffer.alloc(262144,121),Buffer.from('\nresource-error-diagnostic\n')]);
 const code=`const write=(s,b)=>new Promise((resolve,reject)=>s.write(b,e=>e?reject(e):resolve()));
 await write(process.stdout,Buffer.from('resource-prefix\\n'));
 await write(process.stdout,Buffer.alloc(524288,120));
 await write(process.stderr,Buffer.concat([Buffer.alloc(262144,121),Buffer.from('\\nresource-error-diagnostic\\n')]));
 await write(process.stdout,Buffer.from('\\nresource-final-clock\\n'));
 ${fatal?"throw new Error('resource-deliberate-uncaught-error');":""}`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));
 const ended=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Resource drain deadline exceeded'));},5000);
  child.once('error',reject);child.once('close',(status,signal)=>{clearTimeout(timer);resolve({status,signal});});
 });
 const stdout=Buffer.concat(out),errors=Buffer.concat(err),expected=Buffer.concat([prefix,body,final]);
 assert.deepEqual(stdout,expected);assert.ok(errors.subarray(0,stderr.length).equals(stderr));
 assert.equal(ended.status,fatal?1:0);assert.equal(ended.signal,null);
 if(fatal)assert.match(errors.subarray(stderr.length).toString(),/resource-deliberate-uncaught-error/);else assert.deepEqual(errors,stderr);
 const compressed=gzipSync(stdout);assert.deepEqual(gunzipSync(compressed),stdout);
 const chunks=[];for(let i=0;i<stdout.length;i+=16384)chunks.push({sequence:chunks.length,bytes:stdout.subarray(i,i+16384).toString('base64')});
 const rebuilt=Buffer.concat(chunks.map((c,i)=>{assert.equal(c.sequence,i);return Buffer.from(c.bytes,'base64');}));assert.deepEqual(rebuilt,stdout);
 for(const [channel,b] of [['stdout',stdout],['stderr',errors]])writeFileSync(new URL(`drain-${name}.${channel}.log`,base),b,{flag:'wx'});
 console.log(JSON.stringify({measurement:'resource-lossless-pipe',path:name,pid:child.pid,...ended,closeAfterBothStreams:true,stdoutBytes:stdout.length,stdoutHash:digest(stdout),stderrBytes:errors.length,stderrHash:digest(errors),compressedBytes:compressed.length,compressedHash:digest(compressed),chunks:chunks.length,completePrefixFinalAndDiagnostic:true,elapsedMs:performance.now()-start,productTransportQualified:false}));
}
