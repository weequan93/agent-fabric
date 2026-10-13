// Availability probes only. No product fixture, method invocation or prototype interception.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync,writeFileSync,openSync,closeSync,fsyncSync,mkdtempSync,lstatSync,rmSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const base=resolve('g1-storage/node_modules/.cache/storage-build/g1-storage');
const modules=['src/maintenance-builders.js','src/crypto-store.js','tests/helpers/maintenance-verification-fixture.js','tests/helpers/register-maintenance-verification-tests.js'];
const bindings=modules.map(p=>{const path=resolve(base,p),b=readFileSync(path);return {path,bytes:b.length,sha256:hash(b)};});
const {MaintenanceBuildersRepository}=await import(pathToFileURL(bindings[0].path).href);
const {CryptoStore}=await import(pathToFileURL(bindings[1].path).href);
const descriptors=[];
for(const [klass,name] of [[MaintenanceBuildersRepository,'publish'],[CryptoStore,'open']]){
 const d=Object.getOwnPropertyDescriptor(klass.prototype,name);
 assert.equal(typeof d.value,'function');assert.equal(d.writable,true);assert.equal(d.configurable,true);
 descriptors.push({class:klass.name,method:name,writable:d.writable,configurable:d.configurable,enumerable:d.enumerable,functionType:typeof d.value});
}
// Structural API probe: two synthetic async contexts overlap. This is not the planned observer.
const context=new AsyncLocalStorage(),owners=new WeakMap(),one={},two={};
owners.set(one,'one');owners.set(two,'two');
const events=[],value={},error=new Error('synthetic original'),buffer=Buffer.from('synthetic');
let releaseOne,releaseTwo;
const pOne=new Promise(r=>releaseOne=r),pTwo=new Promise((_,r)=>releaseTwo=r);
const returned=context.run({owner:one},()=>{events.push(owners.get(context.getStore().owner));pOne.then(r=>{assert.equal(r,value);events.push(owners.get(context.getStore().owner));});return pOne;});
const rejected=context.run({owner:two},()=>{pTwo.catch(e=>{assert.equal(e,error);events.push(owners.get(context.getStore().owner));});return pTwo;});
assert.equal(returned,pOne);assert.equal(rejected,pTwo);assert.equal(context.getStore(),undefined);
releaseTwo(error);releaseOne(value);await Promise.allSettled([returned,rejected]);
assert.deepEqual(events,['one','two','one']);
const synthetic={open(){assert.equal(this,synthetic);assert.equal(context.getStore().owner,one);return buffer;}};
const bound=synthetic.open.bind(synthetic);assert.equal(context.run({owner:one},()=>Reflect.apply(bound,undefined,[])),buffer);
context.disable();
// Native exclusive creation primitive; two independent Node processes use the same owned path.
const {spawnSync}=await import('node:child_process');
const here=resolve('docs/loop/agent-fabric-g1-f05-storage/readiness-turn160');
const owned=mkdtempSync(resolve(here,'slot-resource-')),stat=lstatSync(owned),token=randomUUID();
writeFileSync(resolve(owned,'owner.json'),JSON.stringify({token,dev:stat.dev,ino:stat.ino}));
const slot=resolve(owned,'synthetic-slot'),fd=openSync(slot,'wx',0o600);fsyncSync(fd);closeSync(fd);
const child=spawnSync(process.execPath,['--input-type=module','-e',"import {openSync} from 'node:fs';try{openSync(process.argv[1],'wx');process.exitCode=9;}catch(e){if(e.code!=='EEXIST')throw e;console.log('exclusive-create-refused');}",slot],{timeout:5000,encoding:'utf8'});
assert.equal(child.status,0);assert.equal(child.stdout,'exclusive-create-refused\n');assert.equal(child.stderr,'');
assert.equal(JSON.parse(readFileSync(resolve(owned,'owner.json'))).token,token);
assert.equal(lstatSync(owned).dev,stat.dev);assert.equal(lstatSync(owned).ino,stat.ino);rmSync(owned,{recursive:true});
console.log(JSON.stringify({bindings,descriptors,asyncLocalStorageAvailable:true,syntheticOverlappingContexts:events,originalPromiseValueErrorBufferIdentityAvailable:true,weakOwnerMappingAvailable:true,exclusiveCreateCrossProcessRefusal:child.stdout.trim(),ownedPrimitiveCleanup:true,prototypeChanged:false,originalMethodsInvoked:false,fixtureInvoked:false,registrationInvoked:false,observerImplemented:false,prelaunchGateImplemented:false,nativeTransparencyPassed:false,originalLifecycleDispatches:0,productQualification:false}));
