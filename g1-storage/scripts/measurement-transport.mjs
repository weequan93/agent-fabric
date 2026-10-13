import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const limit=32*1024*1024,chunkBytes=8192;
export const measurementDigest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const keys=(value,names)=>assert.deepEqual(Object.keys(value).sort(),names.slice().sort());
function validateBinding(binding){
 keys(binding,['phase','candidate','command','sources']);
 assert(['command','build','suite-lifetime'].includes(binding.phase));assert.match(binding.candidate,/^sha256:[a-f0-9]{64}$/);
 keys(binding.command,['executable','args','cwd']);assert(binding.command.executable.startsWith('/')&&binding.command.cwd.startsWith('/'));
 assert(Array.isArray(binding.command.args)&&binding.command.args.length>0&&binding.command.args.every(a=>typeof a==='string'));
 keys(binding.sources,['execution-measurement.mjs','measurement-transport.mjs','runner.mjs','suite-execution.mjs','build.mjs','process-result.mjs']);
 for(const digest of Object.values(binding.sources))assert.match(digest,/^sha256:[a-f0-9]{64}$/);
}
export function encodeMeasurement(record,binding){
 validateBinding(binding);assert.deepEqual(record.transportBinding,binding);
 const raw=Buffer.from(JSON.stringify(record));assert(raw.length>0&&raw.length<=limit);
 const compressed=gzipSync(raw),count=Math.ceil(compressed.length/chunkBytes);
 const receipt={measurement:'storage-measurement-transport',version:1,binding,
  bindingDigest:measurementDigest(JSON.stringify(binding)),digest:measurementDigest(raw),bytes:raw.length,
  compressedDigest:measurementDigest(compressed),compressedBytes:compressed.length,count};
 const records=[{...receipt,kind:'start'}];
 for(let index=0;index<count;index++)records.push({measurement:receipt.measurement,version:1,kind:'chunk',
  digest:receipt.digest,index,count,data:compressed.subarray(index*chunkBytes,(index+1)*chunkBytes).toString('base64')});
 records.push({...receipt,kind:'final'});return records;
}
export function decodeMeasurement(records,expectedBinding){
 validateBinding(expectedBinding);
 assert(Array.isArray(records)&&records.length>=3,'Complete measurement receipt required');
 const [first]=records,last=records.at(-1);
 const headerKeys=['measurement','version','binding','bindingDigest','digest','bytes','compressedDigest','compressedBytes','count','kind'];
 keys(first,headerKeys);keys(last,headerKeys);
 assert.equal(first.measurement,'storage-measurement-transport');assert.equal(first.version,1);assert.equal(first.kind,'start');
 assert.equal(last.kind,'final');assert.deepEqual({...last,kind:'start'},first,'Final measurement receipt mismatch');
 assert.deepEqual(first.binding,expectedBinding,'Unbound measurement refused');
 assert.equal(first.bindingDigest,measurementDigest(JSON.stringify(expectedBinding)));
 for(const key of ['digest','compressedDigest'])assert.match(first[key],/^sha256:[a-f0-9]{64}$/);
 for(const key of ['bytes','compressedBytes','count'])assert(Number.isSafeInteger(first[key])&&first[key]>0);
 assert(first.bytes<=limit&&first.compressedBytes<=limit);
 assert.equal(first.count,Math.ceil(first.compressedBytes/chunkBytes));assert.equal(records.length,first.count+2);
 const compressed=Buffer.concat(records.slice(1,-1).map((r,index)=>{
  keys(r,['measurement','version','kind','digest','index','count','data']);
  assert.equal(r.measurement,first.measurement);assert.equal(r.version,1);assert.equal(r.kind,'chunk');
  assert.equal(r.digest,first.digest);assert.equal(r.index,index,'Out-of-order measurement chunk');assert.equal(r.count,first.count);
  assert.equal(typeof r.data,'string');assert.match(r.data,/^[A-Za-z0-9+/]+={0,2}$/);
  const bytes=Buffer.from(r.data,'base64');assert.equal(bytes.toString('base64'),r.data,'Noncanonical measurement bytes');
  assert.equal(bytes.length,index===first.count-1?first.compressedBytes-index*chunkBytes:chunkBytes);return bytes;
 }));
 assert.equal(compressed.length,first.compressedBytes);assert.equal(measurementDigest(compressed),first.compressedDigest);
 const raw=gunzipSync(compressed,{maxOutputLength:limit});assert.equal(raw.length,first.bytes);assert.equal(measurementDigest(raw),first.digest);
 const record=JSON.parse(raw.toString('utf8'));assert.equal(JSON.stringify(record),raw.toString('utf8'));
 assert.deepEqual(record.transportBinding,expectedBinding,'Receipt payload binding mismatch');return {record,raw};
}

// Callback completion includes all earlier writes on this stream. Both streams
// are attempted even if one fails; an output failure is never a success receipt.
export function writeDrained(stream,bytes){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error)setImmediate(()=>stream.removeListener('error',onError));else stream.removeListener('error',onError);error?reject(error):resolve();};
  const onError=error=>finish(error);
  const timer=setTimeout(()=>finish(new Error('Measurement output drain exceeded 5000ms')),5000);
  stream.once('error',onError);
  try{stream.write(bytes,finish);}catch(error){finish(error);}
 });
}
export async function drainOutput(stdout=process.stdout,stderr=process.stderr){
 const outcomes=await Promise.allSettled([writeDrained(stdout,''),writeDrained(stderr,'')]);
 const errors=outcomes.filter(r=>r.status==='rejected').map(r=>r.reason);
 if(errors.length)throw new AggregateError(errors,'Measurement output drain failed');
}
export async function emitMeasurement(record,binding){
 for(const envelope of encodeMeasurement({...record,transportBinding:binding},binding))
  await writeDrained(process.stdout,JSON.stringify(envelope)+'\n');
 // Keep parent clocks readily inspectable. Complete censuses are in the verified
 // transport payload, never replaced with a count or a lossy prefix.
 const {before,after,...summary}=record;
 console.log(JSON.stringify({...summary,...(before||after?{censusReceipt:measurementDigest(JSON.stringify({...record,transportBinding:binding}))}:{})}));
 await drainOutput();
}
