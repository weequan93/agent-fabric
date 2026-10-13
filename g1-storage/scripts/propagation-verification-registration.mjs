import {assertMaintenanceVerificationAdditiveRegistry,stripMaintenanceFullSuiteExtension} from './maintenance-verification-registration.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {cwd} from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const r=JSON.parse(readFileSync(resolve(cwd,'verification/propagation-verification-registration-v1.json'),'utf8'));
export function assertPropagationVerificationAdditiveRegistry(bytes){
 bytes=assertMaintenanceVerificationAdditiveRegistry(bytes);
 assert.equal(r.schemaVersion,1);assert.equal(hash(bytes),r.currentDigest);assert.equal(bytes.split(r.extension).length,2);const prior=bytes.replace(r.extension,'');assert.equal(hash(prior),r.predecessorDigest,'Every predecessor registry byte preserved');return prior;
}
export function stripPropagationFullSuiteExtension(full){
 full=stripMaintenanceFullSuiteExtension(full);
 const original=JSON.parse(readFileSync(resolve(cwd,'verification/propagation-full-suite-predecessor-v1.json'),'utf8'));assert(full.endsWith(original.extension));const prior=full.slice(0,-original.extension.length);assert.equal(Buffer.byteLength(prior),original.byteLength);assert.equal(hash(prior),original.digest);return prior;
}
export function assertPropagationVerificationRegistration(){
 assertPropagationVerificationAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 assert.equal(hash(JSON.stringify(r.predecessorPins,null,2)+'\n'),r.predecessorPinsDigest);const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));assert.deepEqual(pins,{...r.predecessorPins,files:{...r.predecessorPins.files,'scripts/manifest.mjs':JSON.parse(readFileSync(resolve(cwd,'verification/lifecycle-races-verification-registration-v1.json'),'utf8')).currentDigest}});
 stripPropagationFullSuiteExtension(readFileSync(resolve(cwd,'tests/lifecycle-propagation.test.ts'),'utf8'));
 return {predecessor:r.predecessorDigest,current:JSON.parse(readFileSync(resolve(cwd,'verification/lifecycle-races-verification-registration-v1.json'),'utf8')).currentDigest,onlyPinChanged:'scripts/manifest.mjs'};
}
