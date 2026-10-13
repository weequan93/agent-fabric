// Two closed payloads only. Native TAP never sees their nested JSON bytes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const header='storage-full-receipt',limit=32*1024*1024;
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const keys=(v,names)=>assert.deepEqual(Object.keys(v),names,'Closed full receipt keys');
function payload(value,role){
 assert(['start','end'].includes(role),'Closed full receipt role');
 keys(value,role==='start'?['measurement','binding']:['measurement','binding','raw','rawDigest','fixtures','cleanup']);
 assert.equal(value.measurement,'storage-full-registration-'+role);
 assert(value.binding&&typeof value.binding==='object'&&!Array.isArray(value.binding));
 if(role==='end'){
  assert.equal(typeof value.raw,'string');assert.match(value.rawDigest,/^sha256:[a-f0-9]{64}$/);
  assert(Array.isArray(value.fixtures)&&Array.isArray(value.cleanup));
 }
 return value;
}
export function encodeFullReceipt(value){
 const role=value.measurement?.slice('storage-full-registration-'.length);payload(value,role);
 const raw=Buffer.from(JSON.stringify(value),'utf8');assert(raw.length>0&&raw.length<=limit);
 return {measurement:header,version:1,role,count:raw.length,digest:hash(raw),data:raw.toString('base64')};
}
export function decodeFullReceipt(envelope){
 keys(envelope,['measurement','version','role','count','digest','data']);
 assert.equal(envelope.measurement,header);assert.equal(envelope.version,1);
 assert(['start','end'].includes(envelope.role));
 assert(Number.isSafeInteger(envelope.count)&&envelope.count>0&&envelope.count<=limit);
 assert.match(envelope.digest,/^sha256:[a-f0-9]{64}$/);assert.equal(typeof envelope.data,'string');
 assert.match(envelope.data,/^[A-Za-z0-9+/]+={0,2}$/);
 const raw=Buffer.from(envelope.data,'base64');
 assert.equal(raw.toString('base64'),envelope.data,'Canonical full receipt base64');
 assert.equal(raw.length,envelope.count,'Full receipt byte count');assert.equal(hash(raw),envelope.digest,'Full receipt byte digest');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
 assert(Buffer.from(text,'utf8').equals(raw),'Exact full receipt UTF8');
 const value=JSON.parse(text);assert.equal(JSON.stringify(value),text,'Canonical closed payload; duplicate keys refused');
 payload(value,envelope.role);return {value,raw};
}
