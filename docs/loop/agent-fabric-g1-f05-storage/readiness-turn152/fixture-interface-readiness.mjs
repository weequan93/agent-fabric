// Resource smoke check only. No lock schedule or maintenance publication.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {withStorageFixture} from '../../../../g1-storage/scripts/fixture.mjs';
import {cache} from '../../../../g1-storage/scripts/paths.mjs';
await withStorageFixture(async ({env})=>{
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 Object.assign(process.env,env);
 let fixture;
 try{
  const module=await import(pathToFileURL(resolve(cache,'g1-storage/tests/helpers/maintenance-verification-fixture.js')).href);
  assert.equal(typeof module.createMaintenanceVerificationFixture,'function');
  fixture=await module.createMaintenanceVerificationFixture();
  const required=['prepare','repo','publish','snapshot','unchanged','denied','blocked','effects','close','opens'];
  for(const name of required)assert.equal(typeof fixture[name],'function',name);
  for(const name of ['admin','controller','authority'])assert.equal(typeof fixture.f[name].connect,'function',name);
  const client=await fixture.f.admin.connect();
  try{
   const sql='SELECT pg_backend_pid() AS pid, pg_blocking_pids(pg_backend_pid()) AS blockers, $1::text AS bound_argument, current_setting(\'server_version\') AS version';
   const start=process.hrtime.bigint();const result=await client.query(sql,['readiness-only']);
   assert(result.rows[0].pid>0);assert.deepEqual(result.rows[0].blockers,[]);assert.equal(result.rows[0].bound_argument,'readiness-only');
   const snapshot=await fixture.snapshot();
   assert(snapshot.storage.length>0&&snapshot.accounting.length===7);
   console.log(JSON.stringify({measurement:'readiness-original-fixture-interfaces',sql,args:['readiness-only'],rows:result.rows,elapsedNs:String(process.hrtime.bigint()-start),interfaces:required,storageTables:snapshot.storage.map(([name,rows])=>({name,rows:rows.length})),accountingSets:snapshot.accounting.length,decryptCounterAvailable:Number.isSafeInteger(fixture.opens()),originalQueryChanged:false,driverReturnsChanged:false,lockSchedulesExecuted:false,productQualification:false}));
  }finally{client.release();}
 }finally{
  try{if(fixture)await fixture.close();}finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
