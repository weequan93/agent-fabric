import { assertActivationAdditiveRegistry,assertActivationRegistration } from './restore-activation-registration.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
const prior='sha256:93dea81b0a63ebd2fdec0cb5acda04c29da30095a33d4f4d803317285aa7cc38';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const r=JSON.parse(readFileSync(resolve(cwd,'verification/restore-import-registration-v1.json'),'utf8'));
export function assertRestoreImportAdditiveRegistry(bytes){
 bytes=assertActivationAdditiveRegistry(bytes);
 assert.equal(r.schemaVersion,1);assert.equal(r.predecessorDigest,prior);assert.equal(hash(bytes),r.currentDigest);
 assert.equal(bytes.split(r.extension).length,2);const previous=bytes.replace(r.extension,'');
 assert.equal(hash(previous),prior,'Every predecessor registry byte preserved');return previous;
}
export function assertRestoreImportRegistration(){
 assertRestoreImportAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 assert.equal(hash(JSON.stringify(r.predecessorPins,null,2)+'\n'),r.predecessorPinsDigest);
 const extension=assertActivationRegistration();
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.deepEqual(pins,{...r.predecessorPins,files:{...r.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
