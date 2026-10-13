// Reversible transport extension: new bytes are never accepted as old bytes.
import {reconstructReceiptCorrectionSource,assertReceiptCorrectionPreservation} from './receipt-correction-preservation.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cwd} from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const record=()=>JSON.parse(readFileSync(resolve(cwd,'verification/full-receipt-extension-v1.json'),'utf8'));
export function reconstructReceiptSource(path,bytes){
 bytes=reconstructReceiptCorrectionSource(path,bytes);
 const entry=record().files[path];if(!entry)return bytes;
 assert.equal(hash(bytes),entry.currentDigest,'Authorized receipt extension: '+path);
 const old=Buffer.from(entry.predecessor,'base64');assert.equal(old.toString('base64'),entry.predecessor);
 assert.equal(hash(old),entry.predecessorDigest,'Exact receipt predecessor: '+path);return old.toString('utf8');
}
export function assertReceiptPreservation({all=false}={}){
 assertReceiptCorrectionPreservation({all});
 const r=record();assert.equal(r.schemaVersion,1);
 assert.equal(r.predecessor.digest,'sha256:d68c41b546ba468bb73d068af01f3f896e98bba81ff22f585e4730d9bb61e5f2');
 assert.equal(r.predecessor.files.length,1113);
 assert.deepEqual(Object.keys(r.files),['scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/check-full-predecessor-composition.mjs','scripts/composition-preservation.mjs']);
 assert.deepEqual(Object.keys(r.added),['scripts/full-receipt-transport.mjs','scripts/receipt-preservation.mjs']);
 assert.equal(hash(JSON.stringify(r.predecessor.files)),r.predecessor.digest);
 for(const path of Object.keys(r.files))reconstructReceiptSource(path,readFileSync(resolve(cwd,path),'utf8'));
 if(all)for(const [path,digest] of r.predecessor.files)assert.equal(hash(reconstructReceiptSource(path,readFileSync(resolve(cwd,path),'utf8'))),'sha256:'+digest,'All 1113 predecessor bytes: '+path);
 for(const [path,digest] of Object.entries(r.added))assert.equal(hash(reconstructReceiptCorrectionSource(path,readFileSync(resolve(cwd,path),'utf8'))),digest,'Sealed receipt module: '+path);
 return {predecessor:r.predecessor.digest,files:1113};
}
