// Thin registration/fixture composition. Every imported test body remains unchanged.
import assert from 'node:assert/strict';
import {withStorageFixture} from './fixture.mjs';
import {candidateSnapshot} from './candidate.mjs';
import {fullDescriptor,createFullContext,registrationBinding} from './full-composition.mjs';
import {compositionDigest as hash} from './composition-preservation.mjs';
import {encodeFullReceipt} from './full-receipt-transport.mjs';
import {encodeFullDiagnostic} from './full-diagnostic-transport.mjs';
const cursor=new Map();
export async function registerFullComponent(suite,id,component,test){
 const d=fullDescriptor(suite);assert(d);const index=cursor.get(suite)??0,spec=d.registrations[index];assert.equal(spec?.id,id,'Original registration order');
 const context=JSON.parse(process.env.STORAGE_FULL_COMPOSITION_CONTEXT);
 assert.deepEqual(context,createFullContext(suite,candidateSnapshot().digest,process.env));
 const binding=registrationBinding(context,spec,index),log=console.log,records=[],fixtures=[],cleanup=[];
 log(JSON.stringify(encodeFullReceipt({measurement:'storage-full-registration-start',binding}))); 
 console.log=(...args)=>{
  if(args.length!==1||typeof args[0]!=='string'||!args[0].startsWith('{')){log(...args);return;}
  const raw=args[0],v=JSON.parse(raw);
  if(v.measurement==='maintenance-sql-diagnostic'){log(JSON.stringify(encodeFullDiagnostic(raw)));return;}
  log(...args);
  if(['storage-observations','propagation-verification-observations','volume-verification-observations'].includes(v.measurement))records.push({raw,value:v});
  if(v.measurement==='storage-owned-fixture')fixtures.push(v);
  if(['storage-container-cleanup','storage-root-cleanup'].includes(v.measurement))cleanup.push(v);
 };
 try{
  const register=spec.isolate?(name,body)=>test(name,async t=>{
   let callbacks=0;
   await withStorageFixture(async state=>{
    assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
    const previous=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));
    try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;await body(t);}
    finally{for(const [k,v] of previous)if(v===undefined)delete process.env[k];else process.env[k]=v;}
   });assert.equal(callbacks,1);
  }):test;
  await component(register);
  assert.equal(records.length,1);assert.equal(records[0].value.measurement,spec.measurement);assert.equal(records[0].value.suite,spec.suite);
  log(JSON.stringify(encodeFullReceipt({measurement:'storage-full-registration-end',binding,raw:records[0].raw,rawDigest:hash(records[0].raw),fixtures,cleanup}))); cursor.set(suite,index+1);
 }finally{console.log=log;}
}
