// Infrastructure probe, independent of any future shipped envelope/decoder.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
const here=new URL('./',import.meta.url),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const save=(name,b)=>writeFileSync(new URL(name,here),b,{flag:'wx'});
const reporter=process.binding('natives')['internal/test_runner/reporter/tap'];
assert.equal(process.version,'v22.22.3');assert.equal(reporter,readFileSync(new URL('../develop-turn110/node-v22.22.3-tap-reporter.js',here),'utf8'));
save('native-tap-reporter.js',reporter);
const value={resourceOnly:true,qualification:false,text:'quotes " \\ # Unicode 汉字 🧪 newline\n'.repeat(16000)},bytes=Buffer.from(JSON.stringify(value)),base64=bytes.toString('base64');
save('native-payload.json',bytes);
const childSource=`import test from 'node:test';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const bytes=readFileSync(${JSON.stringify(new URL('native-payload.json',here).pathname)}),data=bytes.toString('base64'),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
console.log(JSON.stringify({measurement:'resource-legacy-native',raw:bytes.toString()}));
console.log(JSON.stringify({measurement:'resource-native-large',resourceOnly:true,bytes:bytes.length,digest:hash(bytes),data}));
for(const [i,p] of data.match(/.{1,4096}/g).entries())console.log(JSON.stringify({measurement:'resource-native-chunk',i,data:p}));
await new Promise((res,rej)=>process.stderr.write('resource-stderr-start\\n'+'e'.repeat(262144)+'\\nresource-stderr-end\\n',e=>e?rej(e):res()));
await test('resource-only actual native serializer',()=>{});`;
save('native-resource.test.mjs',childSource);
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const result=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',new URL('native-resource.test.mjs',here).pathname],{env,stdio:['ignore','pipe','pipe']});
 const out=[],err=[];let events=0,ended=0;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Resource native child timeout'));},15000);
 child.stdout.on('data',b=>{out.push(b);events++;});child.stderr.on('data',b=>err.push(b));
 child.stdout.on('end',()=>ended++);child.stderr.on('end',()=>ended++);child.once('error',e=>{clearTimeout(timer);reject(e);});
 child.once('close',(status,signal)=>{clearTimeout(timer);resolve({stdout:Buffer.concat(out),stderr:Buffer.concat(err),status,signal,events,ended});});
});
save('native-child.stdout.log',result.stdout);save('native-child.stderr.log',result.stderr);
assert.equal(result.status,0);assert.equal(result.signal,null);assert.equal(result.ended,2);assert(result.events>1);assert.equal(result.stderr.length,0);
const text=new TextDecoder('utf-8',{fatal:true}).decode(result.stdout),lines=text.split('\n');
const frameText=lines.filter(l=>l.startsWith('# ')).map(l=>l.slice(2)).join('\n');
const legacy=frameText.slice(frameText.indexOf('{"measurement":"resource-legacy-native"'),frameText.indexOf('{"measurement":"resource-native-large"')).replace(/\n/g,'');
assert.throws(()=>JSON.parse(legacy));
function getFrame(measurement){
 const start=frameText.indexOf('{"measurement":"'+measurement+'"');assert(start>=0);let acc='';
 for(const line of frameText.slice(start).split('\n')){acc+=line;try{const v=JSON.parse(acc);if(v.measurement===measurement)return v;}catch{}}
 throw Error('Incomplete infrastructure frame');
}
const full=getFrame('resource-native-large'),decoded=Buffer.from(full.data,'base64');
assert.equal(decoded.toString('base64'),full.data);assert.equal(decoded.length,full.bytes);assert.equal(hash(decoded),full.digest);assert.deepEqual(decoded,bytes);
assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(decoded),bytes.toString());
const chunks=lines.filter(l=>l.startsWith('# {"measurement":"resource-native-chunk"')).map(l=>JSON.parse(l.slice(2)));
assert.deepEqual(chunks.map(c=>c.i),chunks.map((_,i)=>i));assert.equal(chunks.map(c=>c.data).join(''),base64);
const invalidUtf8=[[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0x80],[0xe2,0x82],[0xff]];
for(const b of invalidUtf8)assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(b)));
const noncanonical=['Zg','Zh==','Zg===','Zg==\n','Zg--'];
for(const s of noncanonical)assert.notEqual(Buffer.from(s,'base64').toString('base64'),s);
const corrupt=Buffer.from(bytes);corrupt[0]^=1;assert.notEqual(hash(corrupt),hash(bytes));assert.notEqual(bytes.length-1,full.bytes);
assert(text.includes('resource-stderr-start')&&text.includes('resource-stderr-end'));assert.match(text,/# tests 1\n# suites 0\n# pass 1\n# fail 0/);
console.log(JSON.stringify({resourceOnly:true,productQualification:false,nodeVersion:process.version,reporterDigest:hash(reporter),payloadBytes:bytes.length,payloadDigest:hash(bytes),nativeStdoutBytes:result.stdout.length,nativeStdoutDigest:hash(result.stdout),nativeStderrBytes:result.stderr.length,pipeDataEvents:result.events,closeAfterBothEnds:result.ended===2,nativeLegacyRejected:true,nativeBase64Exact:true,orderedChunks:chunks.length,strictUtf8Refusals:invalidUtf8.length,noncanonicalBase64Refusals:noncanonical.length,corruptHashRefused:true,wrongLengthRefused:true}));
