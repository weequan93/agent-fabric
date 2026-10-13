import { assertHarnessBuildAdditiveRegistry,assertHarnessBuildRegistration } from './harness-build-registration.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const r=JSON.parse(readFileSync(resolve(cwd,'verification/restore-integration-registration-v1.json'),'utf8'));
export function assertIntegrationAdditiveRegistry(bytes){
 bytes=assertHarnessBuildAdditiveRegistry(bytes);
 assert.equal(r.schemaVersion,1);assert.equal(hash(bytes),r.currentDigest);
 for(const block of r.blocks){assert.equal(bytes.split(block.currentBlock).length,2);bytes=bytes.replace(block.currentBlock,block.predecessorBlock);}
 assert.equal(hash(bytes),r.predecessorDigest,'Only original restore component leaves strengthened; every other byte preserved');return bytes;
}
export function assertIntegrationRegistration(){
 assertIntegrationAdditiveRegistry(readFileSync(resolve(cwd,'scripts/manifest.mjs'),'utf8'));
 assert.equal(hash(JSON.stringify(r.predecessorPins,null,2)+'\n'),r.predecessorPinsDigest);
 const extension=assertHarnessBuildRegistration();
 const pins=JSON.parse(readFileSync(resolve(cwd,'verification/schedule-sources.json'),'utf8'));
 assert.deepEqual(pins,{...r.predecessorPins,files:{...r.predecessorPins.files,'scripts/manifest.mjs':extension.current}});
 return {predecessor:r.predecessorDigest,current:extension.current,onlyPinChanged:'scripts/manifest.mjs'};
}
