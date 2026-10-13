// Built-in-only first layer. Seal nine live sources before restoring frozen1127.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const changed=['scripts/check-full-predecessor-composition.mjs','scripts/native-generated-preservation.mjs','scripts/native-proof-preservation.mjs','scripts/native-control-preservation.mjs','scripts/receipt-correction-preservation.mjs'];
const added=['scripts/native-proof-dictionary.mjs','scripts/native-proof-packed-transport.mjs','scripts/native-proof-retention.mjs','scripts/native-packed-preservation.mjs'];
const sourcePaths=[...changed,...added];
const sourceFiles=sourcePaths.map(path=>resolve(cwd,path));
const recordFile=resolve(cwd,'verification/full-native-packed-extension-v1.json');
const changedIndex=new Map(changed.map((path,index)=>[path,index]));
let validatedRaw,validatedRecord,validatedPredecessors,sealedRecord,sealedBytes;
function record(){
 const bytes=readFileSync(recordFile);
 // Every access rereads the record. Only successful byte-identical metadata
 // validation is reused; source bytes are always read and sealed again.
 if(validatedRaw&&bytes.equals(validatedRaw))return validatedRecord;
 const raw=bytes.toString('utf8');
 const r=JSON.parse(raw);
 assert.equal(Buffer.from(raw).equals(bytes),true,'UTF8 native packed record');
 assert.equal(raw,JSON.stringify(r,null,2)+'\n','Canonical closed native packed record');
 assert.deepEqual(Object.keys(r),['schemaVersion','predecessor','files','added']);assert.equal(r.schemaVersion,1);
 assert.deepEqual(Object.keys(r.predecessor),['digest','files']);
 assert.equal(r.predecessor.digest,'sha256:de07706a6593b5f8ef3a7cf820d906f62a25fbe45c3f411016b0100c23d1d471');
 assert.equal(r.predecessor.files.length,1127);assert.equal(hash(JSON.stringify(r.predecessor.files)),r.predecessor.digest);
 const predecessors=new Map(r.predecessor.files);assert.equal(predecessors.size,1127);
 assert.deepEqual(Object.keys(r.files),changed);assert.deepEqual(Object.keys(r.added),added);
 const decoded=new Map();
 for(const path of changed){
  const e=r.files[path];assert.deepEqual(Object.keys(e),['currentDigest','predecessorDigest','predecessor']);
  assert.match(e.currentDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(e.predecessorDigest,'sha256:'+predecessors.get(path));
  const old=Buffer.from(e.predecessor,'base64');
  assert.equal(old.toString('base64'),e.predecessor,'Canonical native packed predecessor: '+path);
  assert.equal(hash(old),e.predecessorDigest,'Exact native packed predecessor: '+path);
  assert.equal(Buffer.from(old.toString('utf8')).equals(old),true,'UTF8 native packed predecessor: '+path);
  decoded.set(path,old.toString('utf8'));
 }
 for(const path of added){assert.equal(predecessors.has(path),false);assert.match(r.added[path],/^sha256:[a-f0-9]{64}$/);}
 validatedRaw=bytes;validatedRecord=r;validatedPredecessors=decoded;return r;
}
function seal(r){
 const current=sourceFiles.map(file=>readFileSync(file));
 // Read every file first, even after a success. Buffer equality avoids repeated
 // hashing only when all nine current inputs and closed metadata are identical.
 if(sealedRecord===r&&current.every((bytes,index)=>bytes.equals(sealedBytes[index])))return;
 for(let index=0;index<changed.length;index++){const path=changed[index];assert.equal(hash(current[index]),r.files[path].currentDigest,'Sealed native packed source: '+path);}
 // This includes the reader itself. No old import, self certification or
 // absent-source fallback can bypass the new bootstrap.
 for(let index=0;index<added.length;index++){const path=added[index];assert.equal(hash(current[index+changed.length]),r.added[path],'Sealed native packed addition: '+path);}
 sealedRecord=r;sealedBytes=current;
}
function reverse(r,path,bytes){
 const e=r.files[path];if(!e)return bytes;
 // seal() has just authenticated the current bytes. Exact equality to those
 // bytes proves the supplied-source binding without hashing the same file again.
 const supplied=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 assert.equal(supplied.equals(sealedBytes[changedIndex.get(path)]),true,'Sealed native packed supplied source: '+path);
 return validatedPredecessors.get(path);
}
export function reconstructNativePackedSource(path,bytes){const r=record();seal(r);return reverse(r,path,bytes);}
export function assertNativePackedPreservation({all=false}={}){
 const r=record();seal(r);
 if(all)for(const [path,digest] of r.predecessor.files)assert.equal(hash(reverse(r,path,readFileSync(resolve(cwd,path)))),'sha256:'+digest,'All 1127 native packed predecessor bytes: '+path);
 return {predecessor:r.predecessor.digest,files:1127};
}
