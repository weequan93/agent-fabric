
 import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync,appendFileSync} from 'node:fs';
 test('H03/full',()=>{
  const target="/Users/super/Documents/ai/agent-fabric/g1-runtime/evidence/run-2026-10-15T20-20-48.147Z-3ababbd5-475a-4517-bb28-1e9a669e7319/harness-integrity/negative-fixtures/target-2c87ea42-31f3-439f-b542-4e44709e3604/state.json";
  const action="const fs=require('fs');const f=process.argv[1];let s;try{s=JSON.parse(fs.readFileSync(f))}catch{s={writes:0,owner:'a',waiter:'b'}}s.writes++;fs.writeFileSync(f,JSON.stringify(s));";
  const first=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);
  const one=JSON.parse(readFileSync(target));assert.equal(one.writes,1);assert.equal(one.owner,'a');assert.equal(one.waiter,'b');
  const second=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(second.status,0,second.stderr);
  const two=JSON.parse(readFileSync(target));assert.equal(two.writes,2);assert.equal(two.owner,one.owner);
  appendFileSync(process.env.RUNTIME_OBSERVATIONS,JSON.stringify({id:'H03/full',pid:process.pid,nonce:process.env.RUNTIME_OWNER_NONCE,candidate:process.env.RUNTIME_CANDIDATE,success:true,observations:['target','child','queue','restart'].map(kind=>({kind,observed:true,forbidden:false,detail:{firstPid:first.pid,secondPid:second.pid,one,two}}))})+'\n');
 });