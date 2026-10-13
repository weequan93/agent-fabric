import {assertAtomicVerificationAdditiveRegistry,assertAtomicVerificationRegistration} from './atomic-verification-registration.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cwd} from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const r=JSON.parse(readFileSync(resolve(cwd,'verification/authority-route-registration-v1.json'),'utf8'));
export function assertAuthorityRouteAdditiveRegistry(bytes){
 bytes=assertAtomicVerificationAdditiveRegistry(bytes);
 assert.equal(r.schemaVersion,1);assert.equal(hash(bytes),r.currentDigest);assert.equal(bytes.split(r.extension).length,2);
 const predecessor=bytes.replace(r.extension,'');assert.equal(hash(predecessor),r.predecessorDigest,'Every predecessor registry byte preserved');return predecessor;
}
export function assertAuthorityRouteRegistration(){
 assertAuthorityRouteAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 assert.equal(hash(JSON.stringify(r.predecessorPins,null,2)+'\n'),r.predecessorPinsDigest);
 const extension=assertAtomicVerificationRegistration();
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.deepEqual(pins,{...r.predecessorPins,files:{...r.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:r.predecessorDigest,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
