import {reconstructCompositionSource,assertCompositionPreservation} from './composition-preservation.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cwd } from './paths.mjs';
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const transport=JSON.parse(readFileSync(resolve(cwd,'verification/measurement-transport-extension-v1.json'),'utf8'));
export function reconstructTransportSource(path,bytes){
 const supplied=bytes;
 bytes=reconstructCompositionSource(path,bytes);
 const entry=transport.files[path];if(!entry)return bytes;
 if(path==="tests/helpers/harness-copy.ts"){
  assert.equal(hash(bytes),'sha256:91eb05fda7107a0d6a1a058768d59c06175bae05b70269e43bac52cc7d6cfde0','Exact earlier transport source: '+path);
  assert.equal(hash(supplied),entry.currentDigest,'Exact supplied transport source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 if(path==="tests/helpers/register-harness-build-tests.ts"){
  assert.equal(hash(bytes),'sha256:87f16d4afa61f9214701760578368b9d78cd71855551c467e650bbed8995f64a','Exact earlier transport source: '+path);
  assert.equal(hash(supplied),entry.currentDigest,'Exact supplied transport source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 if(path==="tests/helpers/register-harness-cleanup-tests.ts"){
  assert.equal(hash(bytes),'sha256:691cec6e3551629a8c9695db048f1f0d91b040bb3646c1fb5c0a6e8d20cf7696','Exact earlier transport source: '+path);
  assert.equal(hash(supplied),entry.currentDigest,'Exact supplied transport source: '+path);
  bytes=Buffer.isBuffer(supplied)?supplied.toString('utf8'):supplied;
 }
 assert.equal(hash(bytes),entry.currentDigest,'Current authorized measurement transport: '+path);
 for(const change of [...entry.changes].reverse()){
  assert.equal(bytes.split(change.after).length,2,'Exact measurement transport insertion: '+path);
  bytes=bytes.replace(change.after,()=>change.before);
 }
 assert.equal(hash(bytes),entry.predecessorDigest,'Every transport predecessor byte: '+path);return bytes;
}
const record=JSON.parse(readFileSync(resolve(cwd,'verification/execution-extension-v1.json'),'utf8'));
export function reconstructExecutionSource(path,bytes){
 bytes=reconstructTransportSource(path,bytes);
 const entry=record.files[path];if(!entry)return bytes;
 assert.equal(hash(bytes),entry.currentDigest,'Current authorized execution extension: '+path);
 for(const change of [...entry.changes].reverse()){
  if(change.prefix){assert(bytes.startsWith(change.after));bytes=bytes.slice(change.after.length);}
  else{assert.equal(bytes.split(change.after).length,2,'Exact execution insertion: '+path);bytes=bytes.replace(change.after,()=>change.before);}
 }
 assert.equal(hash(bytes),entry.predecessorDigest,'Every predecessor execution byte: '+path);return bytes;
}
export function assertExecutionPreservation(){
 assertCompositionPreservation();
 assert.equal(transport.schemaVersion,1);
 assert.equal(transport.predecessor.digest,'sha256:22caabb0e47f1820e7211f70ea4f9f2ffce73912e1178e280c2288d875de3157');
 assert.equal(transport.predecessor.files.length,1103);
 assert.deepEqual(Object.keys(transport.files),['scripts/execution-measurement.mjs','scripts/execution-preservation.mjs','scripts/runner.mjs',
  'tests/helpers/harness-copy.ts','tests/helpers/register-harness-build-tests.ts','tests/helpers/register-harness-cleanup-tests.ts']);
 for(const path of Object.keys(transport.files))reconstructTransportSource(path,readFileSync(resolve(cwd,path),'utf8'));
 for(const [path,digest] of Object.entries(transport.added))assert.equal(hash(readFileSync(resolve(cwd,path))),digest,'Sealed measurement transport addition: '+path);
 assert.equal(record.schemaVersion,1);
 assert.deepEqual(Object.keys(record.files),['scripts/suite-execution.mjs','scripts/runner.mjs','scripts/recovery/ownership.mjs']);
 for(const path of Object.keys(record.files))reconstructExecutionSource(path,readFileSync(resolve(cwd,path),'utf8'));
 for(const [path,digest] of Object.entries(record.unchanged))assert.equal(hash(reconstructCompositionSource(path,readFileSync(resolve(cwd,path),'utf8'))),digest,'Unchanged execution prerequisite: '+path);
 return {measurement:'storage-execution-preservation',authorizedDefaultCapRemoved:true,predecessors:Object.fromEntries(Object.entries(record.files).map(([p,e])=>[p,e.predecessorDigest])),unchanged:record.unchanged};
}
