import { assertRestoreImportAdditiveRegistry,assertRestoreImportRegistration } from './restore-import-registration.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
const prior='sha256:6e62504431a92d7d4f7639a29488c9746b3c862866de06ecda7a1b2c75db45cc';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const r=JSON.parse(readFileSync(resolve(cwd,'verification/backup-confirmation-registration-v1.json'),'utf8'));
export function assertBackupAdditiveRegistry(bytes){
 bytes=assertRestoreImportAdditiveRegistry(bytes);
 assert.equal(r.schemaVersion,1);assert.equal(r.predecessorDigest,prior);assert.equal(hash(bytes),r.currentDigest);
 assert.equal(bytes.split(r.currentBlock).length,2);const previous=bytes.replace(r.currentBlock,r.predecessorBlock);
 assert.equal(hash(previous),prior,'Original backup entry strengthened; every other predecessor registry byte preserved');return previous;
}
export function assertBackupRegistration(){
 assertBackupAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 assert.equal(hash(JSON.stringify(r.predecessorPins,null,2)+'\n'),r.predecessorPinsDigest);
 const extension=assertRestoreImportRegistration();
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.deepEqual(pins,{...r.predecessorPins,files:{...r.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:prior,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
