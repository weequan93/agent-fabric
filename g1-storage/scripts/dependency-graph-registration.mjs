import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertMaintenanceAdditiveRegistry,assertMaintenanceRegistration } from './maintenance-admission-registration.mjs';
const prior='sha256:52bc1f7b5df5d205b93ce7b031d406c98a93740227be1f72023e24667b91bf66';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/dependency-graph-registration-v1.json'),'utf8'));
export function assertGraphAdditiveRegistry(bytes){
 bytes=assertMaintenanceAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one fixed dependency graph component');
 const predecessor=bytes.replace(registration.extension,'');
 assert.equal(hash(predecessor),prior,'Every predecessor registry byte preserved');return predecessor;
}
export function assertGraphRegistration(){
 assertGraphAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 const extension=assertMaintenanceRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
