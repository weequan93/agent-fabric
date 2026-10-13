// Reuse the unchanged v1 carrier; reconstruct every original proof byte.
import assert from 'node:assert/strict';
import {encodeNativeProof,decodeNativeProof,nativeProofLimits} from './native-proof-transport.mjs';
import {packNativeProofBytes,unpackNativeProofBytes} from './native-proof-dictionary.mjs';
import {writeDrained,drainOutput} from './measurement-transport.mjs';
const sourceKeys=['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-transport.mjs','scripts/native-proof-dictionary.mjs','scripts/native-proof-packed-transport.mjs','scripts/native-proof-retention.mjs'];
const carrierKeys=['measurement','structuralOnly','productQualification','candidate','nativeProofSources','transportOnly','packedProofBinding','packedProof'];
const keys=(v,n)=>{assert(v&&typeof v==='object'&&!Array.isArray(v),'Closed packed proof object');assert.deepEqual(Object.keys(v),n,'Closed packed proof keys');};
const digest=d=>{assert.equal(typeof d,'string');assert.match(d,/^sha256:[a-f0-9]{64}$/);};
function bindings(original,packed){
 for(const b of [original,packed]){
  keys(b,['candidate','sources']);keys(b.candidate,['digest','files']);digest(b.candidate.digest);
  assert(Number.isSafeInteger(b.candidate.files)&&b.candidate.files>0,'Packed proof candidate file count');
 }
 keys(original.sources,sourceKeys.slice(0,2));keys(packed.sources,sourceKeys);
 for(const b of [original,packed])for(const d of Object.values(b.sources))digest(d);
 assert.deepEqual(packed.candidate,original.candidate,'Independent packed candidate binding');
 for(const p of sourceKeys.slice(0,2))assert.equal(packed.sources[p],original.sources[p],'Independent packed original source binding');
}
function canonical(raw){
 assert(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=nativeProofLimits.raw,'Packed original raw bound');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
 assert(Buffer.from(text).equals(raw),'Exact packed original UTF8');const v=JSON.parse(text);
 assert.equal(JSON.stringify(v),text,'Canonical packed original JSON');return v;
}
function proofBinding(proof,original,packed){
 assert.equal(proof.measurement,'storage-hostile-full-composition');assert.equal(proof.structuralOnly,true);assert.equal(proof.productQualification,false);
 assert.deepEqual(proof.candidate,original.candidate,'Complete packed original candidate binding');
 assert.deepEqual(proof.nativeProofSources,original,'Complete packed original source binding');
 assert.deepEqual(proof.nativePackedProofSources,packed,'Complete packed facilities binding');
 assert.equal(Object.hasOwn(proof,'transportOnly'),false,'A transport-only carrier is not a complete proof');
}
export function encodePackedNativeProof(proof,originalBinding,packedBinding){
 bindings(originalBinding,packedBinding);proofBinding(proof,originalBinding,packedBinding);
 const raw=Buffer.from(JSON.stringify(proof));canonical(raw);
 const carrier={measurement:proof.measurement,structuralOnly:true,productQualification:false,candidate:originalBinding.candidate,nativeProofSources:originalBinding,transportOnly:true,packedProofBinding:packedBinding,packedProof:packNativeProofBytes(raw)};
 const encoded=encodeNativeProof(carrier,originalBinding);return {wire:encoded.wire,raw,carrier,carrierRaw:encoded.raw};
}
export function decodePackedNativeProof(wire,originalBinding,packedBinding,expectedRaw){
 bindings(originalBinding,packedBinding);
 const decoded=decodeNativeProof(wire,originalBinding),carrier=decoded.proof;
 keys(carrier,carrierKeys);assert.equal(carrier.transportOnly,true,'Explicit transport-only packed carrier');
 assert.deepEqual(carrier.packedProofBinding,packedBinding,'Independent packed facilities binding');
 const raw=unpackNativeProofBytes(carrier.packedProof),proof=canonical(raw);proofBinding(proof,originalBinding,packedBinding);
 if(expectedRaw!==undefined){assert(Buffer.isBuffer(expectedRaw),'Independent packed raw bytes');assert(raw.equals(expectedRaw),'Exact complete independent packed proof bytes');}
 return {proof,raw,carrier,carrierRaw:decoded.raw,compressed:decoded.compressed,wireBytes:decoded.wireBytes};
}
export async function emitPackedNativeProof(proof,originalBinding,packedBinding,stdout=process.stdout,stderr=process.stderr){
 const {wire,raw}=encodePackedNativeProof(proof,originalBinding,packedBinding);
 decodePackedNativeProof(wire,originalBinding,packedBinding,raw);
 for(let offset=0;offset<wire.length;offset+=65536)await writeDrained(stdout,wire.subarray(offset,offset+65536));
 await drainOutput(stdout,stderr);
 return {bytes:raw.length,wireBytes:wire.length};
}
