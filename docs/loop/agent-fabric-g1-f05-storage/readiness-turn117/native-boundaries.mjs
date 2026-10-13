// Availability only: native SQL bytes/marker fragmentation, never product admission.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=new URL('./',import.meta.url),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const save=(n,b)=>writeFileSync(new URL(n,here),b,{flag:'wx'});
const diagnostic={measurement:'maintenance-sql-diagnostic',code:'P0002',message:'budget exhausted',where:'PL/pgSQL function\nSQL statement "SELECT \\ # 中文🧪"'},raw=JSON.stringify(diagnostic);
const historical=JSON.parse(readFileSync(new URL('../develop-turn115/diagnosis.json',here))),marker=historical.nativeFrameDefect.splitMarkers[0],text=JSON.stringify(marker.value);
assert.equal(Buffer.byteLength(text),232);assert.deepEqual(marker.partBytes,[172,60]);
const envelope={resourceOnly:true,bytes:Buffer.byteLength(raw),digest:hash(raw),data:Buffer.from(raw).toString('base64')};
const source=`import test from 'node:test';await test('NONQUALIFYING SQL and marker facilities',()=>{console.log(${JSON.stringify(raw)});console.log(${JSON.stringify(JSON.stringify(envelope))});for(let i=0;i<400;i++)console.log(${JSON.stringify(text)});});`;
save('native-boundaries.test.mjs',source);
const env={...process.env};delete env.NODE_TEST_CONTEXT;
const r=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',new URL('native-boundaries.test.mjs',here).pathname],{env,encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
save('native-boundaries-child.stdout.log',r.stdout??'');save('native-boundaries-child.stderr.log',r.stderr??'');
assert.equal(r.error,undefined);assert.equal(r.status,0);assert.equal(r.signal,null);
const comments=r.stdout.split('\n').filter(l=>/^\s*# /.test(l)).map(l=>l.replace(/^\s*# /,''));
let pending='',encoded,markers=0,split=0,fragments=0;const diagFragments=[];
for(const s of comments){
 if(!pending&&!s.startsWith('{'))continue;
 pending+=s;fragments++;
 if(pending.startsWith('{"measurement":"maintenance-sql-diagnostic"')){diagFragments.push(s);pending='';fragments=0;continue;}
 try{const v=JSON.parse(pending);if(v.resourceOnly)encoded=v;else {assert.deepEqual(v,marker.value);assert.equal(pending,text);markers++;if(fragments>1)split++;}pending='';fragments=0;}catch(e){if(!(e instanceof SyntaxError))throw e;}
}
assert.equal(pending,'');assert.equal(markers,400);assert(split>0,'Actual reporter marker split required');
assert.throws(()=>JSON.parse(diagFragments.join('')));assert.deepEqual(encoded,envelope);
const bytes=Buffer.from(encoded.data,'base64');assert.equal(bytes.toString('base64'),encoded.data);assert.equal(bytes.length,encoded.bytes);assert.equal(hash(bytes),encoded.digest);assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(bytes),raw);
// Deterministic reconstruction of the retained actual 172+60 split, facilities only.
const parts=[text.slice(0,172),text.slice(172)];assert.deepEqual(parts.map(p=>Buffer.byteLength(p)),marker.partBytes);assert.deepEqual(JSON.parse(parts.join('')),marker.value);assert.equal(hash(parts.join('')),marker.joinedDigest);
console.log(JSON.stringify({resourceOnly:true,productQualification:false,controllerQualification:false,nodeVersion:process.version,nativeSQLRawRejected:true,nativeBase64SQLExact:true,diagnosticRawBytes:bytes.length,diagnosticDigest:hash(bytes),actualNativeMarkers:markers,actualSplitMarkers:split,retainedSplitBytes:marker.partBytes,retainedMarkerDigest:marker.joinedDigest,nativeStdoutBytes:Buffer.byteLength(r.stdout),nativeStdoutDigest:hash(r.stdout),qualification:'Facilities only; closed shipped diagnostic protocol, full admission and marker repair pending'}));
