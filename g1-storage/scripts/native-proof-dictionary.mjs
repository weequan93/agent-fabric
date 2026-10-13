// Canonical lossless bytes only; this is never a product qualification.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const nativeDictionaryLimits=Object.freeze({raw:256*1024*1024,block:4096,entries:524288});
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const table=Array.from({length:256},(_,i)=>createHash('sha256').update('agent-fabric-native-proof-dictionary-v1/'+i).digest().readUInt32LE(0));
const keys=['version','bytes','digest','blocks','order'];
export function packNativeProofBytes(raw){
 assert(Buffer.isBuffer(raw),'Actual native dictionary bytes');
 assert(raw.length>0&&raw.length<=nativeDictionaryLimits.raw,'Native dictionary raw bound');
 const blocks=[],order=[],seen=new Map();let start=0,gear=0;
 for(let i=0;i<raw.length;i++){
  gear=((gear<<1)+table[raw[i]])>>>0;const bytes=i-start+1;
  if((bytes>=512&&((gear&1023)===0||bytes===4096))||i===raw.length-1){
   const b=raw.subarray(start,i+1),d=digest(b);let index=seen.get(d);
   if(index===undefined){
    assert(blocks.length<nativeDictionaryLimits.entries,'Native dictionary block count');
    index=blocks.length;seen.set(d,index);blocks.push(b.toString('base64'));
   }else assert(Buffer.from(blocks[index],'base64').equals(b),'Native dictionary hash collision');
   assert(order.length<nativeDictionaryLimits.entries,'Native dictionary reference count');
   order.push(index);start=i+1;gear=0;
  }
 }
 return {version:1,bytes:raw.length,digest:digest(raw),blocks,order};
}
export function unpackNativeProofBytes(packed){
 assert(packed&&typeof packed==='object'&&!Array.isArray(packed),'Closed native dictionary');
 assert.deepEqual(Object.keys(packed),keys,'Closed native dictionary keys');
 assert.equal(packed.version,1,'Native dictionary version');
 assert(Number.isSafeInteger(packed.bytes)&&packed.bytes>0&&packed.bytes<=nativeDictionaryLimits.raw,'Native dictionary raw bound');
 assert.equal(typeof packed.digest,'string');assert.match(packed.digest,/^sha256:[a-f0-9]{64}$/,'Native dictionary digest');
 for(const name of ['blocks','order'])assert(Array.isArray(packed[name])&&packed[name].length>0&&packed[name].length<=nativeDictionaryLimits.entries,'Native dictionary '+name+' count');
 // Decode only bounded individual blocks. Validate all expansion lengths and
 // first use before allocating the original body, even for a hostile carrier.
 const seen=new Map(),blocks=packed.blocks.map(s=>{
  assert.equal(typeof s,'string');assert(s.length>0&&s.length<=5464,'Native dictionary base64 bound');
  assert.match(s,/^[A-Za-z0-9+/]+={0,2}$/,'Native dictionary base64');
  const b=Buffer.from(s,'base64');assert.equal(b.toString('base64'),s,'Canonical native dictionary base64');
  assert(b.length>0&&b.length<=nativeDictionaryLimits.block,'Native dictionary block bound');
  const d=digest(b);assert(!seen.has(d),'Duplicate native dictionary block or hash collision');seen.set(d,true);return b;
 });
 let bytes=0,next=0;const used=new Set();
 for(const index of packed.order){
  assert(Number.isSafeInteger(index)&&index>=0&&index<blocks.length,'Native dictionary reference');
  if(!used.has(index)){assert.equal(index,next,'Native dictionary first use order');used.add(index);next++;}
  bytes+=blocks[index].length;
  assert(Number.isSafeInteger(bytes)&&bytes<=packed.bytes&&bytes<=nativeDictionaryLimits.raw,'Native dictionary expansion bound before allocation');
 }
 assert.equal(used.size,blocks.length,'Unused native dictionary block');assert.equal(bytes,packed.bytes,'Native dictionary exact byte count');
 const raw=Buffer.allocUnsafe(bytes);let offset=0;
 for(const index of packed.order){blocks[index].copy(raw,offset);offset+=blocks[index].length;}
 assert.equal(digest(raw),packed.digest,'Native dictionary exact raw digest');
 assert.equal(JSON.stringify(packNativeProofBytes(raw)),JSON.stringify(packed),'Canonical native dictionary segmentation and references');
 return raw;
}
