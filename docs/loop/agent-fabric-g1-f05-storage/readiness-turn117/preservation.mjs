// Read-only chained reconstruction of all predecessors; no historical replay pass.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertCompositionPreservation,compositionDigest as hash} from '../../../../g1-storage/scripts/composition-preservation.mjs';
import {assertReceiptPreservation} from '../../../../g1-storage/scripts/receipt-preservation.mjs';
import {assertExecutionPreservation,reconstructTransportSource,reconstructExecutionSource} from '../../../../g1-storage/scripts/execution-preservation.mjs';
import {candidateSnapshot} from '../../../../g1-storage/scripts/candidate.mjs';
const root=new URL('../../../../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const expected=json('docs/loop/agent-fabric-g1-f05-storage/develop-turn114/preservation-before.json'.replace('preservation-before.json','candidate.json'));
assert.deepEqual(candidateSnapshot(),expected);
assertReceiptPreservation();assertCompositionPreservation({all:true});assertExecutionPreservation();
const transport=json('g1-storage/verification/measurement-transport-extension-v1.json');
for(const [path,digest] of transport.predecessor.files)assert.equal(hash(reconstructTransportSource(path,read('g1-storage/'+path).toString())),'sha256:'+digest);
const original=json('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/predecessor.json');
for(const [path,digest] of Object.entries(original))assert.equal(hash(reconstructExecutionSource(path,read('g1-storage/'+path).toString())),'sha256:'+digest.replace(/^sha256:/,''));
const pins=json('g1-storage/verification/owned-recovery-pins.json').files;
for(const [path,digest] of Object.entries(pins))assert.equal(hash(path.startsWith('g1-storage/')?reconstructExecutionSource(path.slice(11),read(path).toString()):read(path)),'sha256:'+digest.replace(/^sha256:/,''));
console.log(JSON.stringify({candidate:candidateSnapshot(),predecessors:[1113,1106,1103,1100],recoveryPins:Object.keys(pins).length,productQualification:false,controllerQualification:false}));
