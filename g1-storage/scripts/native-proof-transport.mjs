// Lossless structural evidence only. This protocol is never a product receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {writeDrained,drainOutput} from './measurement-transport.mjs';
export const nativeProofLimits=Object.freeze({raw:256*1024*1024,compressed:32*1024*1024,wire:48*1024*1024,chunk:8192});
export const nativeProofDigest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const header='storage-native-structural-proof-transport';
const headerKeys=['measurement','version','binding','structuralOnly','productQualification','bytes','digest','compressedBytes','compressedDigest','count','kind'];
const chunkKeys=['measurement','version','kind','digest','index','count','data'];
const keys=(v,k)=>{assert(v&&typeof v==='object'&&!Array.isArray(v),'Closed proof object');assert.deepEqual(Object.keys(v),k,'Closed proof keys');};
const digest=v=>{assert.equal(typeof v,'string');assert.match(v,/^sha256:[a-f0-9]{64}$/);};
function binding(v){
 keys(v,['candidate','sources']);keys(v.candidate,['digest','files']);digest(v.candidate.digest);assert(Number.isSafeInteger(v.candidate.files)&&v.candidate.files>0);
 keys(v.sources,['scripts/check-full-predecessor-composition.mjs','scripts/native-proof-transport.mjs']);for(const d of Object.values(v.sources))digest(d);
}
function utf8(raw){const s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);assert(Buffer.from(s,'utf8').equals(raw),'Exact proof UTF8');return s;}
function canonical(raw){const s=utf8(raw),v=JSON.parse(s);assert.equal(JSON.stringify(v),s,'Canonical proof JSON; duplicate keys refused');return v;}
function proofBinding(v,b){assert.equal(v.measurement,'storage-hostile-full-composition');assert.equal(v.structuralOnly,true);assert.equal(v.productQualification,false);assert.deepEqual(v.candidate,b.candidate,'Complete proof candidate binding');assert.deepEqual(v.nativeProofSources,b,'Complete proof source binding');}
export function encodeNativeProof(proof,expectedBinding){
 binding(expectedBinding);proofBinding(proof,expectedBinding);
 const raw=Buffer.from(JSON.stringify(proof));assert(raw.length>0&&raw.length<=nativeProofLimits.raw,'Proof raw bound');canonical(raw);
 const compressed=gzipSync(raw);assert(compressed.length>0&&compressed.length<=nativeProofLimits.compressed,'Proof compressed bound');
 const count=Math.ceil(compressed.length/nativeProofLimits.chunk),base={measurement:header,version:1,binding:expectedBinding,structuralOnly:true,productQualification:false,bytes:raw.length,digest:nativeProofDigest(raw),compressedBytes:compressed.length,compressedDigest:nativeProofDigest(compressed),count};
 const rows=[{...base,kind:'start'}];
 for(let index=0;index<count;index++)rows.push({measurement:header,version:1,kind:'chunk',digest:base.digest,index,count,data:compressed.subarray(index*nativeProofLimits.chunk,(index+1)*nativeProofLimits.chunk).toString('base64')});
 rows.push({...base,kind:'final'});
 const wire=Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join(''));assert(wire.length<=nativeProofLimits.wire,'Proof wire bound');return {wire,raw};
}
// Receives actual bytes, not parsed envelopes. Independent binding is mandatory;
// an optional independent raw declaration must match every decoded proof byte.
export function decodeNativeProof(wire,expectedBinding,expectedRaw){
 binding(expectedBinding);assert(Buffer.isBuffer(wire),'Actual proof wire bytes');assert(wire.length>0&&wire.length<=nativeProofLimits.wire,'Proof wire bound');
 const text=utf8(wire);assert(text.endsWith('\n'),'Final proof newline');const lines=text.slice(0,-1).split('\n');assert(lines.length>=3&&lines.length<=4098,'Complete bounded proof frames');
 const rows=lines.map(s=>canonical(Buffer.from(s))),first=rows[0],last=rows.at(-1);keys(first,headerKeys);keys(last,headerKeys);
 assert.equal(first.measurement,header);assert.equal(first.version,1);assert.equal(first.kind,'start');assert.equal(last.kind,'final');assert.deepEqual({...last,kind:'start'},first,'Identical proof start/final');
 binding(first.binding);assert.deepEqual(first.binding,expectedBinding,'Independent proof source binding');assert.equal(first.structuralOnly,true);assert.equal(first.productQualification,false);
 digest(first.digest);digest(first.compressedDigest);
 for(const k of ['bytes','compressedBytes','count'])assert(Number.isSafeInteger(first[k])&&first[k]>0,'Positive proof count');
 assert(first.bytes<=nativeProofLimits.raw,'Proof raw bound');assert(first.compressedBytes<=nativeProofLimits.compressed,'Proof compressed bound');assert.equal(first.count,Math.ceil(first.compressedBytes/nativeProofLimits.chunk));assert.equal(rows.length,first.count+2,'Every chunk exactly once');
 const parts=rows.slice(1,-1).map((r,index)=>{
  keys(r,chunkKeys);assert.equal(r.measurement,header);assert.equal(r.version,1);assert.equal(r.kind,'chunk');assert.equal(r.digest,first.digest);assert.equal(r.index,index,'Contiguous proof chunk order');assert.equal(r.count,first.count);assert.equal(typeof r.data,'string');assert(r.data.length<=10924,'Bounded proof base64');assert.match(r.data,/^[A-Za-z0-9+/]+={0,2}$/);
  const b=Buffer.from(r.data,'base64');assert.equal(b.toString('base64'),r.data,'Canonical proof base64');assert.equal(b.length,index===first.count-1?first.compressedBytes-index*nativeProofLimits.chunk:nativeProofLimits.chunk);return b;
 });
 const compressed=Buffer.concat(parts);assert.equal(compressed.length,first.compressedBytes);assert.equal(nativeProofDigest(compressed),first.compressedDigest,'Complete compressed proof digest');
 const raw=gunzipSync(compressed,{maxOutputLength:first.bytes});assert.equal(raw.length,first.bytes,'Complete raw proof count');assert.equal(nativeProofDigest(raw),first.digest,'Complete raw proof digest');assert(gzipSync(raw).equals(compressed),'Canonical single gzip; trailing/concatenated bytes refused');
 const proof=canonical(raw);proofBinding(proof,expectedBinding);
 if(expectedRaw!==undefined){assert(Buffer.isBuffer(expectedRaw),'Independent raw proof bytes');assert(raw.equals(expectedRaw),'Exact complete independent proof bytes');}
 return {proof,raw,compressed,wireBytes:wire.length};
}
export async function emitNativeProof(proof,expectedBinding,stdout=process.stdout,stderr=process.stderr){
 const {wire,raw}=encodeNativeProof(proof,expectedBinding);
 // Validate the entire intended wire before the first write. The acceptance
 // reader still has to decode the actual received controller stream separately.
 decodeNativeProof(wire,expectedBinding,raw);
 for(let offset=0;offset<wire.length;offset+=65536)await writeDrained(stdout,wire.subarray(offset,offset+65536));
 await drainOutput(stdout,stderr);
 return {bytes:raw.length,digest:nativeProofDigest(raw),wireBytes:wire.length};
}
