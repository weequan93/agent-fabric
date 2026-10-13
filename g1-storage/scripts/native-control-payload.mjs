// Structural native test controls only; never a product diagnostic or receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const header='storage-structural-control-payload',limit=32*1024*1024;
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const keys=['measurement','version','frameId','ordinal','structuralOnly','productQualification','count','digest','data'];
function binding(frameId){assert.equal(typeof frameId,'string');assert.match(frameId,/^sha256:[a-f0-9]{64}$/);}
function original(text){
 assert.equal(typeof text,'string','Independent original control bytes');
 assert(text.isWellFormed(),'Original control Unicode');
 const bytes=Buffer.from(text,'utf8');assert(bytes.length>0&&bytes.length<=limit,'Original control byte bound');return bytes;
}
export function encodeNativeControlPayload(lines,frameId){
 binding(frameId);assert(Array.isArray(lines)&&lines.length>0,'Nonempty original control frame');
 return lines.map((line,ordinal)=>{
  const raw=original(line);
  return JSON.stringify({measurement:header,version:1,frameId,ordinal,structuralOnly:true,productQualification:false,count:raw.length,digest:hash(raw),data:raw.toString('base64')});
 });
}
export function decodeNativeControlPayload(received,frameId,originalLines){
 binding(frameId);assert(Array.isArray(received)&&Array.isArray(originalLines)&&originalLines.length>0,'Closed received control frame');
 assert.equal(received.length,originalLines.length,'Every original control line exactly once');
 return received.map((line,ordinal)=>{
  assert.equal(typeof line,'string','Actual received control envelope');
  const value=JSON.parse(line);
  assert.equal(JSON.stringify(value),line,'Canonical control envelope; duplicate keys refused');
  assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'Closed control payload object');
  assert.deepEqual(Object.keys(value),keys,'Closed control payload keys');
  assert.equal(value.measurement,header);assert.equal(value.version,1);
  assert.equal(value.frameId,frameId,'Independent control frame binding');
  assert.equal(value.ordinal,ordinal,'Exact original control line order');
  assert.equal(value.structuralOnly,true);assert.equal(value.productQualification,false);
  assert(Number.isSafeInteger(value.count)&&value.count>0&&value.count<=limit,'Control byte bound');
  assert.equal(typeof value.digest,'string');assert.match(value.digest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(typeof value.data,'string');assert.match(value.data,/^[A-Za-z0-9+/]+={0,2}$/);
  const raw=Buffer.from(value.data,'base64');
  assert.equal(raw.toString('base64'),value.data,'Canonical control base64');
  assert.equal(raw.length,value.count,'Control byte count');assert.equal(hash(raw),value.digest,'Control byte digest');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
  assert(Buffer.from(text,'utf8').equals(raw),'Exact control UTF8');
  assert(raw.equals(original(originalLines[ordinal])),'Independent original control bytes preserved');
  return text;
 });
}
