import {reconstructNativePackedSource,assertNativePackedPreservation} from './native-packed-preservation.mjs';
// First-layer bootstrap: seal live sources, then reconstruct the exact 1125 bytes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cwd} from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const changed=['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-preservation.mjs'];
const added=['scripts/native-generated-preservation.mjs'];
let validatedRaw,validatedRecord;
function record(){
 const raw=readFileSync(resolve(cwd,'verification/full-native-generated-extension-v1.json'),'utf8');
 // Reread every access: reuse validation only for byte-identical closed metadata.
 if(raw===validatedRaw)return validatedRecord;
 const r=JSON.parse(raw);
 assert.equal(raw,JSON.stringify(r,null,2)+'\n','Canonical closed native generated record');
 assert.deepEqual(Object.keys(r),['schemaVersion','predecessor','files','added']);assert.equal(r.schemaVersion,1);
 assert.deepEqual(Object.keys(r.predecessor),['digest','files']);
 assert.equal(r.predecessor.digest,'sha256:05a745e08cc84ebb4cebec3c1ecdf10844794de94d59c9454eb84696ff56f03a');
 assert.equal(r.predecessor.files.length,1125);assert.equal(hash(JSON.stringify(r.predecessor.files)),r.predecessor.digest);
 assert.deepEqual(Object.keys(r.files),changed);assert.deepEqual(Object.keys(r.added),added);
 const predecessors=new Map(r.predecessor.files);assert.equal(predecessors.size,1125);
 for(const path of changed){
  const e=r.files[path];assert.deepEqual(Object.keys(e),['currentDigest','predecessorDigest','predecessor']);
  assert.match(e.currentDigest,/^sha256:[a-f0-9]{64}$/);assert.equal(e.predecessorDigest,'sha256:'+predecessors.get(path));
 }
 for(const path of added){assert.equal(predecessors.has(path),false);assert.match(r.added[path],/^sha256:[a-f0-9]{64}$/);}
 validatedRaw=raw;validatedRecord=r;return r;
}
function reverse(r,path,bytes){
 const e=r.files[path];if(!e)return bytes;
 assert.equal(hash(bytes),e.currentDigest,'Sealed native generated source: '+path);
 const old=Buffer.from(e.predecessor,'base64');assert.equal(old.toString('base64'),e.predecessor,'Canonical native generated predecessor: '+path);
 assert.equal(hash(old),e.predecessorDigest,'Exact native generated predecessor: '+path);
 assert.equal(Buffer.from(old.toString('utf8')).equals(old),true,'UTF8 native generated predecessor: '+path);return old.toString('utf8');
}
export function reconstructNativeGeneratedSource(path,bytes){bytes=reconstructNativePackedSource(path,bytes);return reverse(record(),path,bytes);}
export function assertNativeGeneratedPreservation({all=false}={}){
 assertNativePackedPreservation({all});
 const r=record();
 for(const path of changed)reverse(r,path,reconstructNativePackedSource(path,readFileSync(resolve(cwd,path),'utf8')));
 // Bootstrap includes this reader itself, before the older reader's seal sees
 // its reconstructed 1125 predecessor. No old record or live-byte fallback.
 for(const [path,digest] of Object.entries(r.added))assert.equal(hash(reconstructNativePackedSource(path,readFileSync(resolve(cwd,path),'utf8'))),digest,'Sealed native generated addition: '+path);
 if(all)for(const [path,digest] of r.predecessor.files)assert.equal(hash(reverse(r,path,reconstructNativePackedSource(path,readFileSync(resolve(cwd,path),'utf8')))),'sha256:'+digest,'All 1125 native generated predecessor bytes: '+path);
 return {predecessor:r.predecessor.digest,files:1125};
}
