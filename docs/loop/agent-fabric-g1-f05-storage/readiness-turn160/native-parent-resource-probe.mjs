// Pass-through import capability only; original registration is never invoked.
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {MessageChannel} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const base=resolve('g1-storage/node_modules/.cache/storage-build/g1-storage/tests/helpers');
const target=pathToFileURL(resolve(base,'maintenance-verification-fixture.js')).href;
const parent=pathToFileURL(resolve(base,'register-maintenance-verification-tests.js')).href;
const {port1,port2}=new MessageChannel();const seen=[];port1.on('message',r=>seen.push(r));
const code=`let p,t;export function initialize(d){p=d.p;t=d.t;}export async function resolve(s,c,n){const r=await n(s,c);if(r.url===t)p.postMessage({specifier:s,parentURL:c.parentURL,url:r.url});return r;}`;
register('data:text/javascript,'+encodeURIComponent(code),{parentURL:import.meta.url,data:{p:port2,t:target},transferList:[port2]});
const original=await import(parent);assert.equal(typeof original.registerMaintenanceVerificationTests,'function');
await new Promise(r=>setTimeout(r,20));assert.equal(seen.length,1);assert.equal(seen[0].specifier,'./maintenance-verification-fixture.js');assert.equal(seen[0].parentURL,parent);assert.equal(seen[0].url,target);port1.close();
console.log(JSON.stringify({originalParentImportObserved:seen[0],passThroughOnly:true,fixtureInvoked:false,registrationInvoked:false,redirectImplemented:false,observerImplemented:false,productQualification:false}));
