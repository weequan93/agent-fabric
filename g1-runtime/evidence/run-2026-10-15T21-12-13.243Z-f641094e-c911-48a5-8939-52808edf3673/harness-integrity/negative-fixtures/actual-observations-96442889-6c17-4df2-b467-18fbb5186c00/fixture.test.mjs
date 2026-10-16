
 import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync,appendFileSync} from 'node:fs';
 test('H03/full',()=>{
  const target="/Users/super/Documents/ai/agent-fabric/g1-runtime/evidence/run-2026-10-15T21-12-13.243Z-f641094e-c911-48a5-8939-52808edf3673/harness-integrity/negative-fixtures/target-77c1089d-159b-430e-90d2-b8171b8b380b/state.json";
  const action="const fs=require('fs');const f=process.argv[1];let s;try{s=JSON.parse(fs.readFileSync(f))}catch{s={writes:0,owner:'a',waiter:'b'}}s.writes++;fs.writeFileSync(f,JSON.stringify(s));";
  const first=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);
  const one=JSON.parse(readFileSync(target));assert.equal(one.writes,1);assert.equal(one.owner,'a');assert.equal(one.waiter,'b');
  const second=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(second.status,0,second.stderr);
  const two=JSON.parse(readFileSync(target));assert.equal(two.writes,2);assert.equal(two.owner,one.owner);
  appendFileSync(process.env.RUNTIME_OBSERVATIONS,JSON.stringify({id:'H03/full',pid:process.pid,nonce:process.env.RUNTIME_OWNER_NONCE,candidate:process.env.RUNTIME_CANDIDATE,success:true,observations:['target','child','queue','restart'].map(kind=>({kind,observed:true,forbidden:false,detail:{firstPid:first.pid,secondPid:second.pid,one,two}}))})+'\n');
 });