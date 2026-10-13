import {registerVerifyEncryptionTests} from './helpers/verify-encryption.js';
import {registerVerifyRetainedCopiesTests} from './helpers/verify-retained-copies.js';
import {emitObservations,type SuiteObservations} from './helpers/observations.js';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// The full suite runs the identical component assertions. Sum their actual
// counters through the existing observation callback. Each assertion group has
// its own existing owned fixture: unrelated ephemeral-key archives are not an
// input to the retained-copy scanner's declared current store inventory.
const observations:SuiteObservations[]=[];
const fixture=await import(pathToFileURL(resolve(process.env['STORAGE_REPO_ROOT']!,'g1-storage/scripts/fixture.mjs')).href);
for(const component of [registerVerifyEncryptionTests,registerVerifyRetainedCopiesTests]){
 let calls=0;
 await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
  assert.equal(++calls,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
  const previous=new Map(Object.keys(state.env).map(name=>[name,process.env[name]]));
  try{for(const [name,value] of Object.entries(state.env))process.env[name]=value;await component(undefined,value=>observations.push(value),'owned-encryption');}
  finally{for(const [name,value] of previous)if(value===undefined)delete process.env[name];else process.env[name]=value;}
 });assert.equal(calls,1);
}
if(observations.length!==2)throw new Error('Both encryption assertion groups must complete');
const combined={...observations[0]!,positives:{...observations[0]!.positives},violations:{...observations[0]!.violations}};
for(const value of observations.slice(1)){
 for(const key of Object.keys(combined.positives) as (keyof SuiteObservations['positives'])[])combined.positives[key]+=value.positives[key];
 for(const key of Object.keys(combined.violations) as (keyof SuiteObservations['violations'])[])combined.violations[key]+=value.violations[key];
}
emitObservations(combined);
