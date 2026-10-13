// One closed diagnostic only. It never supplies a product observation or receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const header='storage-full-sql-diagnostic',limit=32*1024*1024;
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const keys=(value,names)=>{
 assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'Closed SQL diagnostic object');
 assert.deepEqual(Object.keys(value),names,'Closed SQL diagnostic keys');
};
function diagnostic(raw){
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
 assert(Buffer.from(text,'utf8').equals(raw),'Exact SQL diagnostic UTF8');
 const value=JSON.parse(text);
 assert.equal(JSON.stringify(value),text,'Canonical SQL diagnostic; duplicate keys refused');
 keys(value,['measurement','code','message','where']);
 assert.equal(value.measurement,'maintenance-sql-diagnostic','Only the original SQL diagnostic header');
 for(const key of ['code','message','where']){
  assert.equal(typeof value[key],'string','SQL diagnostic string: '+key);
  assert(value[key].isWellFormed(),'SQL diagnostic Unicode: '+key);
 }
 assert.match(value.code,/^[0-9A-Z]{5}$/,'SQLSTATE diagnostic code');
 return value;
}
export function encodeFullDiagnostic(text){
 assert.equal(typeof text,'string','Original raw SQL diagnostic JSON required');
 assert(text.isWellFormed(),'Original SQL diagnostic Unicode');
 const raw=Buffer.from(text,'utf8');assert(raw.length>0&&raw.length<=limit);
 diagnostic(raw);
 return {measurement:header,version:1,diagnosticOnly:true,productQualification:false,count:raw.length,digest:hash(raw),data:raw.toString('base64')};
}
export function decodeFullDiagnostic(envelope){
 keys(envelope,['measurement','version','diagnosticOnly','productQualification','count','digest','data']);
 assert.equal(envelope.measurement,header);assert.equal(envelope.version,1);
 assert.equal(envelope.diagnosticOnly,true);assert.equal(envelope.productQualification,false);
 assert(Number.isSafeInteger(envelope.count)&&envelope.count>0&&envelope.count<=limit);
 assert.equal(typeof envelope.digest,'string');assert.match(envelope.digest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(typeof envelope.data,'string');assert.match(envelope.data,/^[A-Za-z0-9+/]+={0,2}$/);
 const raw=Buffer.from(envelope.data,'base64');
 assert.equal(raw.toString('base64'),envelope.data,'Canonical SQL diagnostic base64');
 assert.equal(raw.length,envelope.count,'SQL diagnostic byte count');assert.equal(hash(raw),envelope.digest,'SQL diagnostic byte digest');
 return {diagnostic:diagnostic(raw),raw,diagnosticOnly:true,productQualification:false};
}
