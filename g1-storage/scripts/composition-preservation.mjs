import {reconstructReceiptSource,assertReceiptPreservation} from './receipt-preservation.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cwd} from './paths.mjs';
export const compositionDigest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
export function reconstructCompositionSource(path,bytes){
 const supplied=bytes;
 bytes=reconstructReceiptSource(path,bytes);
 const record=JSON.parse(readFileSync(resolve(cwd,'verification/full-composition-extension-v1.json'),'utf8'));
 const entry=record.files[path];if(!entry)return bytes;
 if(path==="scripts/execution-preservation.mjs"){
  assert.equal(compositionDigest(bytes),'sha256:8ee89ab09e6bf48afaebd196f092d1d7ecc3a23225729f073f48befc424b43e1','Exact earlier composition source: '+path);
  assert.equal(compositionDigest(supplied),entry.currentDigest,'Exact supplied composition source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 if(path==="scripts/runner.mjs"){
  assert.equal(compositionDigest(bytes),'sha256:010f22c10f42112c3c4e6d57e3e10f24a727b305c1853474bf6f696ce5b2b9be','Exact earlier composition source: '+path);
  assert.equal(compositionDigest(supplied),entry.currentDigest,'Exact supplied composition source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 if(path==="scripts/suite-execution.mjs"){
  assert.equal(compositionDigest(bytes),'sha256:cd927f340b805837e150998eb33a19d34b468acbdcb3a51a3da16eeb99ef3336','Exact earlier composition source: '+path);
  assert.equal(compositionDigest(supplied),entry.currentDigest,'Exact supplied composition source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 assert.equal(compositionDigest(bytes),entry.currentDigest,'Authorized full composition source: '+path);
 for(const change of [...entry.changes].reverse()){
  assert.equal(bytes.split(change.after).length,2,'Exact full composition insertion: '+path);
  bytes=bytes.replace(change.after,change.before);
 }
 assert.equal(compositionDigest(bytes),entry.predecessorDigest,'Every full composition predecessor byte: '+path);return bytes;
}
export function assertCompositionPreservation({all=false}={}){
 assertReceiptPreservation({all});
 const r=JSON.parse(readFileSync(resolve(cwd,'verification/full-composition-extension-v1.json'),'utf8'));
 assert.equal(r.schemaVersion,1);assert.equal(r.predecessor.digest,'sha256:2cea390ccaf03e7fdc1c0b4f8d740806d082a0fda08f0bcd90c599696f80e935');
 assert.equal(r.predecessor.files.length,1106);
 assert.deepEqual(Object.keys(r.files),['scripts/runner.mjs','scripts/suite-execution.mjs','scripts/execution-preservation.mjs','scripts/lifecycle-races-verification-registration.mjs','scripts/volume-verification-registration.mjs','tests/lifecycle-propagation.test.ts','tests/volume-draft.test.ts']);
 for(const path of Object.keys(r.files))reconstructCompositionSource(path,readFileSync(resolve(cwd,path),'utf8'));
 if(all)for(const [path,digest] of r.predecessor.files)assert.equal(compositionDigest(reconstructCompositionSource(path,readFileSync(resolve(cwd,path),'utf8'))),'sha256:'+digest,'Unchanged full predecessor input: '+path);
 assert.equal(compositionDigest(JSON.stringify(r.predecessor.files)),r.predecessor.digest);
 for(const [path,digest] of Object.entries(r.added))assert.equal(compositionDigest(reconstructReceiptSource(path,readFileSync(resolve(cwd,path),'utf8'))),digest,'Sealed full composition addition: '+path);
 return {predecessor:r.predecessor.digest,files:1106};
}
