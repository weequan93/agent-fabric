// Reverse the boundary repair before any older extension evaluates its bytes.
import {reconstructNativeControlSource,assertNativeControlPreservation} from './native-control-preservation.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cwd} from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const changed=['scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/check-full-predecessor-composition.mjs','scripts/composition-preservation.mjs','scripts/receipt-preservation.mjs'];
const added=['scripts/full-diagnostic-transport.mjs','scripts/receipt-correction-preservation.mjs'];
let validatedRaw,validatedRecord;
function record(){
 const raw=readFileSync(resolve(cwd,'verification/full-receipt-correction-extension-v1.json'),'utf8');
 if(raw===validatedRaw)return validatedRecord;
 const r=JSON.parse(raw);
 assert.equal(raw,JSON.stringify(r,null,2)+'\n','Canonical closed correction record');
 assert.deepEqual(Object.keys(r),['schemaVersion','predecessor','files','added']);assert.equal(r.schemaVersion,1);
 assert.deepEqual(Object.keys(r.predecessor),['digest','files']);
 assert.equal(r.predecessor.digest,'sha256:ce6fdecfbcb498a53d81ba8583cc43a386c4040f56e02cac14b869156e9f5725');
 assert.equal(r.predecessor.files.length,1116);assert.equal(hash(JSON.stringify(r.predecessor.files)),r.predecessor.digest);
 assert.deepEqual(Object.keys(r.files),changed);assert.deepEqual(Object.keys(r.added),added);
 const predecessors=new Map(r.predecessor.files);assert.equal(predecessors.size,1116);
 for(const path of changed){
  const e=r.files[path];assert.deepEqual(Object.keys(e),['currentDigest','predecessorDigest','predecessor']);
  assert.match(e.currentDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(e.predecessorDigest,'sha256:'+predecessors.get(path));
 }
 for(const path of added){assert.equal(predecessors.has(path),false);assert.match(r.added[path],/^sha256:[a-f0-9]{64}$/);}
 validatedRaw=raw;validatedRecord=r;
 return r;
}
function reverse(r,path,bytes){
 const e=r.files[path];if(!e)return bytes;
 assert.equal(hash(bytes),e.currentDigest,'Sealed receipt correction source: '+path);
 const old=Buffer.from(e.predecessor,'base64');assert.equal(old.toString('base64'),e.predecessor,'Canonical correction predecessor: '+path);
 assert.equal(hash(old),e.predecessorDigest,'Exact correction predecessor: '+path);
 assert.equal(Buffer.from(old.toString('utf8')).equals(old),true,'UTF8 correction predecessor: '+path);return old.toString('utf8');
}
export function reconstructReceiptCorrectionSource(path,bytes){return reverse(record(),path,reconstructNativeControlSource(path,bytes));}
export function assertReceiptCorrectionPreservation({all=false}={}){
 assertNativeControlPreservation({all});
 const r=record();
 // Includes both readers and the codec. Reader bootstrap never calls an old
 // reader on new reader bytes, nor certifies those bytes as a predecessor.
 for(const path of changed)reverse(r,path,reconstructNativeControlSource(path,readFileSync(resolve(cwd,path),'utf8')));
 for(const [path,digest] of Object.entries(r.added))assert.equal(hash(reconstructNativeControlSource(path,readFileSync(resolve(cwd,path),'utf8'))),digest,'Sealed receipt correction addition: '+path);
 if(all)for(const [path,digest] of r.predecessor.files)assert.equal(hash(reverse(r,path,reconstructNativeControlSource(path,readFileSync(resolve(cwd,path),'utf8')))),'sha256:'+digest,'All 1116 correction predecessor bytes: '+path);
 return {predecessor:r.predecessor.digest,files:1116};
}
