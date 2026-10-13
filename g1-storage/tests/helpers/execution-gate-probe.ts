import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, lstatSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
/** Real node:test child results through the shipped gates, nonrecursive and
 * repository-reproducible. This unit probe cannot count as aggregate acceptance.
 */
export async function executionGateProbe(){
 const gate=await import(pathToFileURL(resolve('g1-storage/scripts/suite-execution.mjs')).href);
 const directory=mkdtempSync(join(tmpdir(),'fabric-storage-contract-')),owner=randomUUID();
 const marker=join(directory,'owner'),file=join(directory,'probe.test.mjs');writeFileSync(marker,owner,{flag:'wx'});
 const rejected=async(probe:string,cases:string[],variants:Record<string,string[]>={},options:Record<string,unknown>={})=>{
  let failure:unknown;try{await gate.executeSuite(file,cases,options,variants);}catch(error){failure=error;}
  assert.ok(failure);
  const result=(failure as {result:{status:number|null;signal:string|null;stdout:string;stderr:string}}).result;
  assert.equal(typeof result.stdout,'string');assert.equal(typeof result.stderr,'string');
  console.log(JSON.stringify({measurement:'expected-contract-gate-refusal',probe,status:result.status,signal:result.signal,
   stdoutBase64:Buffer.from(result.stdout).toString('base64'),stderrBase64:Buffer.from(result.stderr).toString('base64'),
   stdoutBytes:Buffer.byteLength(result.stdout),stderrBytes:Buffer.byteLength(result.stderr),
   stdoutSha256:createHash('sha256').update(result.stdout).digest('hex'),stderrSha256:createHash('sha256').update(result.stderr).digest('hex')}));
 };
 try{
  writeFileSync(file,"import test from 'node:test';\ntest('PROBE / parent',async t=>{await t.test('PROBE/required',()=>{});});\n",{flag:'wx'});
  const good=await gate.executeSuite(file,['PROBE'],{}, {PROBE:['PROBE/required']});
  assert.equal(good.report.tests,2);assert.equal(good.report.variants[0],'PROBE/required');
  // The real child cannot finish until this parent's event loop acknowledges
  // its file creation. A synchronous suite wait deadlocks until the explicit
  // hostile deadline; streaming execution must keep the parent responsive.
  const started=join(directory,'started'),ack=join(directory,'ack');
  let acknowledged=false,running=true;
  const acknowledge=()=>{if(!running)return;if(existsSync(started)){acknowledged=true;writeFileSync(ack,'ack');}else setImmediate(acknowledge);};
  setImmediate(acknowledge);
  try{
   writeFileSync(file,`import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,existsSync,readFileSync} from 'node:fs';
   test('PROBE',async t=>{await t.test('PROBE/required',async()=>{
    writeFileSync(${JSON.stringify(started)},'started');
    await new Promise(resolve=>{const check=()=>{if(existsSync(${JSON.stringify(ack)}))resolve();else setImmediate(check);};check();});
    assert.equal(readFileSync(${JSON.stringify(ack)},'utf8'),'ack');console.log('unicode-☃-中文');
   });});`);
   const responsive=await gate.executeSuite(file,['PROBE'],{timeout:2000},{PROBE:['PROBE/required']});
   assert.equal(acknowledged,true);assert.equal(responsive.report.tests,2);assert.match(responsive.result.stdout,/unicode-☃-中文/);
  }finally{running=false;}
  writeFileSync(file,"import test from 'node:test';test('PROBE',()=>new Promise(()=>{setInterval(()=>{},1000);}));\n");
  await rejected('explicit-timeout',['PROBE'],{},{timeout:200});
  writeFileSync(file,"import test from 'node:test';\ntest('PROBE / parent',async t=>{await t.test('PROBE/required',()=>{});});\n");
  await rejected('missing-variant',['PROBE'],{PROBE:['PROBE/missing']});
  await rejected('missing-case',['OTHER']);
  for(const variant of ['skip','todo','empty','fail']){
   const body=variant==='empty'?"import test from 'node:test';\n":variant==='fail'?"import test from 'node:test'; test('PROBE',()=>{throw new Error('opaque-probe-failure');});\n":
    "import test from 'node:test'; test('PROBE',{ "+variant+":true },()=>{});\n";
   writeFileSync(file,body);
   await rejected(variant,['PROBE']);
  }
 }finally{
  assert.equal(lstatSync(directory).isSymbolicLink(),false);assert.equal(readFileSync(marker,'utf8'),owner);
  rmSync(directory,{recursive:true});
 }
}
