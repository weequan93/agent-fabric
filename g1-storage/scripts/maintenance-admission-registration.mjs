import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertRetryAdditiveRegistry,assertRetryRegistration } from './propagation-retry-registration.mjs';
const prior='sha256:83e8d0068b1a067fe663f25e2e3149062e1b56d91b951dc0146b0c1d002d7a14';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/maintenance-admission-registration-v1.json'),'utf8'));
export function assertMaintenanceAdditiveRegistry(bytes){
 bytes=assertRetryAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one fixed maintenance admission component');
 const predecessor=bytes.replace(registration.extension,'');assert.equal(hash(predecessor),prior,'Every predecessor registry byte preserved');return predecessor;
}
export function assertMaintenanceRegistration(){
 assertMaintenanceAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 const extension=assertRetryRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
