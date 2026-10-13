import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withStorageFixture,assertRootOwned } from '../fixture.mjs';
import { containers,docker } from '../recovery/ownership.mjs';
import { appendJournal } from './journal.mjs';

export function fixtureIdentity(f,label){
 const path=f.env.STORAGE_FIXTURE_ROOT,identity=JSON.parse(readFileSync(resolve(path,'.storage-owner.json'),'utf8'));
 const roots=Object.values(JSON.parse(f.env.STORAGE_OWNED_ROOTS)).map(({path,...identity})=>({path,identity}));
 const info=JSON.parse(docker(['inspect','agent-fabric-storage-'+f.env.STORAGE_FIXTURE_INSTANCE]))[0];
 assertRootOwned(path,identity);for(const r of roots)assertRootOwned(r.path,r.identity);
 return {label,path,identity,roots,container:{id:info.Id,name:info.Name.slice(1),owner:f.env.STORAGE_FIXTURE_OWNER,instance:f.env.STORAGE_FIXTURE_INSTANCE}};
}
/** Keep the accepted fixture's exact censuses and finally blocks, nesting A/B/C.
 * The innermost work must join EVERY worker and descendant before returning.
 */
export async function nestedLifetimes(j,work){
 const fixtures=[],environments=[],before=containers();
 async function enter(label,next){
  const censusBefore=containers();appendJournal(j,{phase:'fixture-before',label,containers:censusBefore});
  let identity;
  try{return await withStorageFixture(async f=>{
   identity=fixtureIdentity(f,label);fixtures.push(identity);environments.push({...f.env});
   assert.deepEqual(containers(),[...censusBefore,identity.container.id].sort());
   appendJournal(j,{phase:'fixture-open',fixture:identity,containers:containers(),before:censusBefore});
   return next();
  });}finally{
   const after=containers();appendJournal(j,{phase:'fixture-finally',label,containers:after,expected:censusBefore});
   assert.deepEqual(after,censusBefore,'Exact global census after '+label);
  }
 }
 await enter('A',()=>enter('B',()=>enter('C',()=>work({fixtures,environments}))));
 assert.deepEqual(containers(),before);return {fixtures,before,after:containers()};
}
