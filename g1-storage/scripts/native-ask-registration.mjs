import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertDisclosureAdditiveRegistry,assertDisclosureRegistration } from './ask-disclosure-registration.mjs';
const prior='sha256:cbc23bda136f31a18d6112c49893318174eaef52246f05421716374f043464f4';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/native-ask-registration-v1.json'),'utf8'));
export function assertNativeAdditiveRegistry(bytes){
 bytes=assertDisclosureAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one additive native component');
 const predecessor=bytes.replace(registration.extension,'');
 assert.equal(hash(predecessor),prior,'All predecessor registry bytes preserved');return predecessor;
}
export function assertNativeAskRegistration(){
 assertNativeAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 const extension=assertDisclosureRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:assertDisclosureRegistration().current,onlyPinChanged:'scripts/manifest.mjs'};
}
