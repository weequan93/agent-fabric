import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertRetentionAdditiveRegistry,assertRetentionRegistration } from './retention-registration.mjs';
const prior='sha256:3cc8337c253c1ce3395b8ea6dea8efb7ad428b4349e560a8b188bc18b3ad40a4';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/ask-disclosure-registration-v1.json'),'utf8'));
export function assertDisclosureAdditiveRegistry(bytes){
 bytes=assertRetentionAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one additive disclosure component');
 const predecessor=bytes.replace(registration.extension,'');
 assert.equal(hash(predecessor),prior,'Every predecessor registry byte preserved');return predecessor;
}
export function assertDisclosureRegistration(){
 assertDisclosureAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 const extension=assertRetentionRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
