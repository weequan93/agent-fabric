import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertGraphAdditiveRegistry,assertGraphRegistration } from './dependency-graph-registration.mjs';
const prior='sha256:fce844f8e14a56893c982933750ebf74286a757b3c4fc1453b721aa0c666e0bb';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/retention-registration-v1.json'),'utf8'));
export function assertRetentionAdditiveRegistry(bytes){
 bytes=assertGraphAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one additive retention component');
 const predecessor=bytes.replace(registration.extension,'');
 assert.equal(hash(predecessor),prior,'Every predecessor registry byte preserved');return predecessor;
}
export function assertRetentionRegistration(){
 assertRetentionAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 const extension=assertGraphRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
