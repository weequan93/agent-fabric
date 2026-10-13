import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { assertNativeAdditiveRegistry,assertNativeAskRegistration } from './native-ask-registration.mjs';
const prior='sha256:320a652ef7da556458786c9a9280f743dc857c151d7d0710934cf799f54d1a94';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/recall-registration-v1.json'),'utf8'));
/** Additive registry proof, alongside the unchanged predecessor source guards.
 * Removing precisely the one new fixed registration must recover EVERY byte
 * of the previously pinned manifest, not merely matching selected fields. */
export function assertAdditiveRegistry(bytes){
 bytes=assertNativeAdditiveRegistry(bytes);
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one additive component block');
 assert.equal(hash(bytes.replace(registration.extension,'')),prior,'Every predecessor registry byte preserved');
 return registration.currentDigest;
}
export function assertRecallRegistration(){
 const current=readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8');assertAdditiveRegistry(current);
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 const extension=assertNativeAskRegistration();
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
