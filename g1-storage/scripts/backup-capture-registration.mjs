import { assertBackupAdditiveRegistry,assertBackupRegistration } from './backup-confirmation-registration.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
const prior='sha256:32e85328be36c4852e5e3faa67d39b4b0100d20c65dfab4fc32aeda6e6badebe';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(readFileSync(resolve(cwd,'verification/backup-capture-registration-v1.json'),'utf8'));
export function assertCaptureAdditiveRegistry(bytes){
 assert.equal(registration.schemaVersion,1);assert.equal(registration.predecessorDigest,prior);
 bytes=assertBackupAdditiveRegistry(bytes);
 assert.equal(typeof bytes,'string');assert.equal(hash(bytes),registration.currentDigest);
 assert.equal(bytes.split(registration.extension).length,2,'Exactly one fixed backup capture component');
 const predecessor=bytes.replace(registration.extension,'');assert.equal(hash(predecessor),prior,'Every predecessor registry byte preserved');return predecessor;
}
export function assertCaptureRegistration(){
 assertCaptureAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 const extension=assertBackupRegistration();
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.equal(hash(JSON.stringify(registration.predecessorPins,null,2)+'\n'),registration.predecessorPinsDigest);
 assert.deepEqual(pins,{...registration.predecessorPins,files:{...registration.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
