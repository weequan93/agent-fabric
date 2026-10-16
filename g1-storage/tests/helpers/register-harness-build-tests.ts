import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs,{ readFileSync,writeFileSync,rmSync,lstatSync,existsSync,readdirSync,chmodSync,symlinkSync,linkSync,readlinkSync,realpathSync,mkdirSync,renameSync } from 'node:fs';
import { resolve,relative,dirname,isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import type { ChildProcess,SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { HarnessCopy,digest,packageRoot,repository } from './harness-copy.js';

type Register=(name:string,body:(t:TestContext)=>Promise<void>)=>Promise<void>;
const copy=async(body:(c:HarnessCopy)=>void|Promise<void>,dependencies=true)=>{
 const c=await HarnessCopy.create(dependencies),errors:unknown[]=[];
 try{
  const parent=resolve(packageRoot,'node_modules/.cache'),directory=lstatSync(c.directory);
  assert.equal(realpathSync(parent),parent,'Harness fixture parent is the canonical project cache');
  assert.equal(dirname(c.directory),parent,'Every positive and hostile harness fixture stays in the project cache');
  assert.equal(realpathSync(c.directory),c.directory);assert(directory.isDirectory()&&!directory.isSymbolicLink());assert.equal(directory.uid,process.getuid!());assert.equal(directory.mode&0o777,0o700);
  assert.match(relative(parent,c.directory),/^fabric-storage-harness-[^/]+$/,'Retain the owned harness fixture prefix');
  assert(!c.directory.startsWith(resolve(parent,'storage-build')+'/'),'Harness fixtures remain outside disposable build output');
  assert.equal(c.root,resolve(c.directory,'candidate'));assert.equal(c.storage,resolve(c.root,'g1-storage'));
  await body(c);
 }catch(error){errors.push(error);}
 try{await c.close();}catch(error){errors.push(error);}
 if(errors.length===1)throw errors[0];
 if(errors.length)throw new AggregateError(errors,'Harness copy body and independently proved cleanup failed: '+errors.map(error=>String(error)).join('; '),{cause:errors[0]});
};
const passed=(r:Awaited<ReturnType<HarnessCopy['run']>>)=>{assert.equal(r.status,0,r.stderr);return r;};
const refused=(r:Awaited<ReturnType<HarnessCopy['run']>>,reason:RegExp)=>{assert.equal(r.status,1);assert.match(r.stdout+'\n'+r.stderr,reason);return r;};
const plantStale=(c:HarnessCopy)=>{
 const canary=c.put('stale-executed','must remain unchanged');
 c.put('node_modules/.cache/storage-build/g1-storage/tests/contracts.test.js',`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(canary)},'executed stale code');`);
 return ()=>assert.equal(readFileSync(canary,'utf8'),'must remain unchanged');
};

type PositiveInput={path:string;bytes:number;sha256:string;mode:number};
type InstalledOwner='g1-storage'|'g1-recovery';
type InstalledEntry={path:string;mode:number}&({type:'directory'}|{type:'file';bytes:number;sha256:string}|{type:'link';target:string;resolved:string});
type InstalledTree={owner:InstalledOwner;rootIdentity:{device:number;inode:number;realpath:string};entries:InstalledEntry[]};
type PositiveMarker={schema:string;owner:string;originRoot:string;controllerFingerprint:string;candidate:{digest:string;files:number};
 directoryIdentity:{device:number;inode:number;realpath:string};rootIdentity:{device:number;inode:number;realpath:string};
 originIdentity:{device:number;inode:number;realpath:string};inputs:PositiveInput[];sourceFiles:[string,string][];
 dependencies:{original:InstalledTree[];copied:InstalledTree[]}};
type FinishedCheck={finished_at?:string;status:string;log:string};
/** Independently enumerate installed files and links, without the shipped copy
 * snapshot implementation. Only the installation's own root cache is omitted. */
function installedTree(root:string,owner:InstalledOwner,expected?:InstalledTree):InstalledTree{
 const installed=resolve(root,owner,'node_modules'),entries:InstalledEntry[]=[];
 const identity=()=>{const s=lstatSync(installed);assert(s.isDirectory()&&!s.isSymbolicLink());return {device:s.dev,inode:s.ino,realpath:realpathSync(installed)};};
 const rootIdentity=identity();assert.equal(rootIdentity.realpath,installed);
 const confined=(file:string)=>{const path=relative(installed,file);assert(!isAbsolute(path)&&path!=='..'&&!path.startsWith('../'),'Installed link must stay inside its own root: '+file);return path||'.';};
 const stable=(file:string)=>{const s=lstatSync(file,{bigint:true});return {device:s.dev,inode:s.ino,mode:s.mode,uid:s.uid,nlink:s.nlink,bytes:s.size,mtime:s.mtimeNs,ctime:s.ctimeNs};};
 const walk=(file:string,path:string)=>{
  const before=lstatSync(file,{bigint:true}),beforeState={device:before.dev,inode:before.ino,mode:before.mode,uid:before.uid,nlink:before.nlink,bytes:before.size,mtime:before.mtimeNs,ctime:before.ctimeNs},mode=Number(before.mode&0o7777n);
  if(before.isSymbolicLink()){
   const target=readlinkSync(file);assert(!isAbsolute(target),'Relative installed link required: '+path);
   confined(resolve(dirname(file),target));const resolved=confined(realpathSync(file));
   entries.push({path,type:'link',mode,target,resolved});assert.equal(readlinkSync(file),target);assert.equal(confined(realpathSync(file)),resolved);
  }else if(before.isDirectory()){
   entries.push({path,type:'directory',mode});const names=readdirSync(file).sort();
   for(const name of names)if(path!=='.'||name!=='.cache')walk(resolve(file,name),path==='.'?name:path+'/'+name);
   assert.deepEqual(readdirSync(file).sort(),names,'Installed directory changed while reading: '+path);
  }else{
   assert(before.isFile(),'Only regular dependency payloads are supported: '+path);assert.equal(before.uid,BigInt(process.getuid!()),path);assert.equal(before.nlink,1n,'Private installed file required: '+path);
   const bytes=readFileSync(file);assert.equal(BigInt(bytes.length),before.size,path);entries.push({path,type:'file',mode,bytes:bytes.length,sha256:digest(bytes)});
  }
  assert.deepEqual(stable(file),beforeState,'Installed entry changed while reading: '+path);
 };walk(installed,'.');assert.deepEqual(identity(),rootIdentity);
 entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);const tree={owner,rootIdentity,entries};
 if(expected!==undefined){assert.equal(expected.owner,owner,'Literal expected installed owner required');assert.equal(digest(JSON.stringify(tree)),digest(JSON.stringify(expected)),'Captured installed owner changed: '+owner);}return tree;
}
/** Hold actual callback boundaries; no timers or successful synthetic result
 * determine these scanner races. Every opened descriptor is closed natively. */
type InstalledCallbackHook=(path:string,args:unknown[],proceed:()=>void)=>void;
type InstalledDescriptorHook=(path:string,proceed:()=>import('node:fs').BigIntStats)=>import('node:fs').BigIntStats;
type InstalledReadUnit={path:string;closing:boolean;closeSettled:boolean};
type InstalledBufferCensus={root?:string;complete:boolean;buffers:Set<Buffer>;backings:Set<ArrayBufferLike>;allocations:number;files:number;bytes:number;owners:string[]};
type InstalledBufferState={buffer:Buffer;census:InstalledBufferCensus;initialized:boolean;used:boolean;touched:number;failed:boolean;retired:boolean;unit?:InstalledReadUnit};
type InstalledCallbackOptions={
 observeBuffers?:boolean;allowNoReads?:boolean;disjointFrom?:InstalledBufferCensus[];
 allocate?:(size:number,proceed:()=>Buffer)=>Buffer;
 fill?:(state:InstalledBufferState,phase:'initial'|'erase',args:unknown[],proceed:()=>Buffer)=>Buffer;
 nativeStart?:(method:string,path:string,args:unknown[])=>void;
 nativeFinish?:(method:string,path:string,values:unknown[])=>void;
 settled?:(censuses:InstalledBufferCensus[])=>void;
};
async function installedCallbacks(body:()=>Promise<void>,readHook?:InstalledCallbackHook,closeHook?:InstalledCallbackHook,descriptorHook?:InstalledDescriptorHook,options:InstalledCallbackOptions={}){
 const methods=['open','read','close','fstat','lstat','realpath','readdir','readlink'] as const;
 type NativeCall=(...args:unknown[])=>unknown;
 const originals=new Map(methods.map(method=>[method,fs[method] as unknown as NativeCall])),originalFstat=fs.fstatSync,originalNativeRealpath=fs.realpath.native as unknown as NativeCall;
  const descriptors=new Map<number,InstalledReadUnit>(),liveUnits=new Set<InstalledReadUnit>(),buffers=new Map<InstalledReadUnit,Buffer>();
  const originalAllocate=Buffer.allocUnsafeSlow,originalFill=Buffer.prototype.fill;
  const zero=Buffer.alloc(512*1024),censuses:InstalledBufferCensus[]=[],bufferStates=new Map<Buffer,InstalledBufferState>();
  let current:InstalledBufferCensus|undefined,recoveryRootCalls=0;
  const fresh=()=>{const census:InstalledBufferCensus={complete:false,buffers:new Set(),backings:new Set(),allocations:0,files:0,bytes:0,owners:[]};censuses.push(census);return census;};
  const nativeFields=(stat:import('node:fs').BigIntStats)=>[stat.dev,stat.ino,stat.mode,stat.uid,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs];
  if(options.observeBuffers){
   Buffer.allocUnsafeSlow=((size:number)=>{
    if(size!==512*1024)return originalAllocate(size);
    if(!current||current.complete){current=fresh();recoveryRootCalls=0;}
    const proceed=()=>originalAllocate(size),buffer=options.allocate?options.allocate(size,proceed):proceed();
    assert(Buffer.isBuffer(buffer));assert.equal(buffer.length,512*1024);assert.equal(buffer.byteOffset,0,'Installed buffers are unpooled');assert.equal(buffer.buffer.byteLength,512*1024,'Each buffer owns its whole bounded backing store');
    current.allocations++;
    for(const previous of [...options.disjointFrom??[],...censuses.filter(census=>census!==current)]){
     assert(!previous.buffers.has(buffer),'Every independent invocation uses fresh Buffer identities');assert(!previous.backings.has(buffer.buffer),'Every independent invocation/scanner uses fresh backing storage');
    }
    assert(!current.buffers.has(buffer)&&!current.backings.has(buffer.buffer),'Every actual allocation has distinct unpooled storage');current.buffers.add(buffer);current.backings.add(buffer.buffer);
    bufferStates.set(buffer,{buffer,census:current,initialized:false,used:false,touched:0,failed:false,retired:false});
    assert(current.allocations<=16,'TOTAL scanner allocations across BOTH owners must be at most sixteen');return buffer;
   }) as typeof Buffer.allocUnsafeSlow;
   Buffer.prototype.fill=(function(this:Buffer,...args:unknown[]){
    const state=bufferStates.get(this);if(!state)return Reflect.apply(originalFill,this,args);
    const phase=state.used?'erase':'initial';
    if(phase==='erase'){
     assert(state.unit?.closing&&state.unit.closeSettled,'The lease lasts through the ACTUAL descriptor-close callback');
     assert.equal(args[0],0,'Returned leases erase plaintext');assert.equal(args[1],0,'Erasure starts at the first potentially touched byte');
     assert.equal(args[2],state.failed?this.length:state.touched,'Errors erase the whole buffer; success erases the maximum written prefix');
    }else assert.equal(args[0],0,'Fresh buffers are initially zeroed before admission');
    const proceed=():Buffer=>{const value:unknown=Reflect.apply(originalFill,this,args);assert(Buffer.isBuffer(value),'Native fill returns its Buffer');return value;};
    let result:Buffer;
    try{result=options.fill?options.fill(state,phase,args,proceed):proceed();}catch(error){state.retired=true;throw error;}
    assert.equal(result,this);assert(this.equals(zero),'Every initialized or returned buffer contains no retained plaintext');
    state.initialized=true;if(phase==='erase'){state.used=false;delete state.unit;state.touched=0;state.failed=false;}return result;
   }) as typeof Buffer.prototype.fill;
  }
  let active=0,peak=0,units=0,unitPeak=0,reads=0,eofs=0,descriptorReads=0;
  for(const method of methods){
   fs[method]=((...args:unknown[])=>{
    const callback=args.at(-1) as (...values:unknown[])=>void;
    assert.equal(typeof callback,'function','Pinned public filesystem callback required');
    const descriptor=method==='read'||method==='fstat'||method==='close'?args[0] as number:undefined;
    const capturedUnit=method==='open'?{path:String(args[0]),closing:false,closeSettled:false}:descriptor===undefined?undefined:descriptors.get(descriptor);
    if(descriptor!==undefined)assert(capturedUnit&&liveUnits.has(capturedUnit)&&!capturedUnit.closing,'Live owned descriptor required for native callback');
    const path=descriptor===undefined?String(args[0]):capturedUnit!.path;
    if(options.observeBuffers&&method==='realpath'&&path.endsWith('/g1-storage')){
     if(!current||current.complete){current=fresh();recoveryRootCalls=0;}
     assert.equal(current.root,undefined,'One allocation census covers one complete TWO-owner invocation');current.root=dirname(path);current.owners.push('g1-storage');
    }
    if(options.observeBuffers&&method==='realpath'&&current?.root&&path===resolve(current.root,'g1-recovery'))current.owners.push('g1-recovery');
    if(method==='close'){assert(capturedUnit);capturedUnit.closing=true;}
    if(method==='open'){
     assert.equal((args[1] as number)&fs.constants.O_NOFOLLOW,fs.constants.O_NOFOLLOW,'Every installed regular file opens without following links');
     assert(capturedUnit);liveUnits.add(capturedUnit);units++;unitPeak=Math.max(unitPeak,units);assert(units<=16,'At most sixteen active regular-file read units');
    }
    if(method==='read'){
     assert(capturedUnit);const buffer=args[1];assert(Buffer.isBuffer(buffer));assert.equal(buffer.length,512*1024,'Fixed bounded per-file read buffer');
     assert.equal(args[2],0);assert.equal(args[3],buffer.length);assert.equal(args[4],null);
     const previous=buffers.get(capturedUnit);if(previous)assert.equal(buffer,previous,'One buffer reused through actual EOF');else buffers.set(capturedUnit,buffer);
     assert(buffers.size<=16,'At most sixteen live bounded file buffers');reads++;
     if(options.observeBuffers){
      const state=bufferStates.get(buffer);assert(state&&state.census===current,'Every real read buffer belongs to the invocation-wide allocation census');assert(state.initialized&&!state.retired,'Only initialized, unretired buffers may enter a lease');
      if(!previous){assert.equal(state.unit,undefined,'A buffer cannot be reused before its prior logical lease settles');assert(buffer.equals(zero),'Every logical read generation starts with zeroed storage');
       for(const [unit,other] of buffers)if(unit!==capturedUnit)assert.notEqual(other.buffer,buffer.buffer,'Simultaneous leases cannot alias backing storage');
       state.unit=capturedUnit;state.used=true;state.census.files++;
      }else assert.equal(state.unit,capturedUnit,'Numeric descriptor reuse cannot change logical lease ownership');
     }
    }
    options.nativeStart?.(method,path,args);
    active++;peak=Math.max(peak,active);assert(active<=16,'At most sixteen active filesystem operations per invocation');
    const finish=(...values:unknown[])=>{
     active--;
     if(method==='open'){
      assert(capturedUnit);
      if(values[0]){liveUnits.delete(capturedUnit);units--;}
      else{const fd=values[1] as number,previous=descriptors.get(fd);assert(!previous||previous.closing,'A reused descriptor must follow its prior native close');descriptors.set(fd,capturedUnit);}
     }
     if(method==='read'){
      if(!values[0]&&values[1]===0)eofs++;
      if(options.observeBuffers){const state=bufferStates.get(args[1] as Buffer);assert(state);const count=values[1];if(values[0]||!Number.isSafeInteger(count)||(count as number)<0||(count as number)>state.buffer.length)state.failed=true;else{state.touched=Math.max(state.touched,count as number);state.census.bytes+=count as number;}}
     }
     if(method==='close'){
      assert(capturedUnit&&descriptor!==undefined);capturedUnit.closeSettled=true;if(descriptors.get(descriptor)===capturedUnit)descriptors.delete(descriptor);
      buffers.delete(capturedUnit);liveUnits.delete(capturedUnit);units--;
     }
     if(options.observeBuffers&&method==='realpath'&&current?.root&&path===resolve(current.root,'g1-recovery/node_modules')&&!values[0]){
      recoveryRootCalls++;if(recoveryRootCalls===2){current.complete=true;assert.deepEqual(current.owners,['g1-storage','g1-recovery'],'Each census retains the literal owner order');}
     }
     options.nativeFinish?.(method,path,values);
     callback(...values);
    };
    args[args.length-1]=finish;
    let nativeStarted=false;
    const proceed=()=>{nativeStarted=true;try{Reflect.apply(method==='realpath'?originalNativeRealpath:originals.get(method)!,fs,args);}catch(error){active--;if(method==='open'){assert(capturedUnit);liveUnits.delete(capturedUnit);units--;}throw error;}};
    try{
     if(method==='read'&&readHook)readHook(path,args,proceed);
     else if(method==='close'&&closeHook)closeHook(path,args,proceed);
     else proceed();
    }catch(error){if(!nativeStarted)active--;throw error;}
   }) as never;
  }
  fs.realpath.native=fs.realpath as typeof fs.realpath.native;
  fs.fstatSync=((descriptor:number,statOptions:{bigint:true})=>{
   const unit=descriptors.get(descriptor);assert(unit&&liveUnits.has(unit)&&!unit.closing,'Live owned descriptor required for native metadata');const path=unit.path;assert.equal(statOptions.bigint,true);
   active++;peak=Math.max(peak,active);descriptorReads++;
   try{assert(active<=16,'Synchronous descriptor stats share the same sixteen filesystem reservations');const proceed=()=>originalFstat(descriptor,statOptions);const result=descriptorHook?descriptorHook(path,proceed):proceed();if(options.observeBuffers)assert.deepEqual(nativeFields(result),nativeFields(lstatSync(path,{bigint:true})),'Actual descriptor retains all eight native pathname fields');return result;}finally{active--;}
  }) as typeof fs.fstatSync;
  syncBuiltinESMExports();
  try{await body();if(!options.allowNoReads){assert(descriptorReads>0);assert(reads>0);assert(peak>1,'The shipped scanner overlaps real filesystem operations');assert(unitPeak>1,'The shipped scanner overlaps regular-file reads');}}
  finally{
   Buffer.allocUnsafeSlow=originalAllocate;Buffer.prototype.fill=originalFill;
   for(const method of methods)fs[method]=originals.get(method) as never;fs.fstatSync=originalFstat;syncBuiltinESMExports();
   options.settled?.(censuses);
   assert.equal(active,0,'Every started filesystem callback settles before return');assert.equal(units,0,'Every started file unit closes before return');assert.equal(descriptors.size,0);assert.equal(buffers.size,0);assert.equal(liveUnits.size,0);
   if(options.observeBuffers)for(const state of bufferStates.values()){assert(!state.used||state.retired,'Every logical lease settles before scanner rejection/return');if(!state.retired)assert(state.buffer.equals(zero),'No plaintext survives a settled lease');}
  }
  return {reads,eofs,peak,unitPeak,descriptorReads,censuses};
}
async function installedReadSchedules(c:HarnessCopy,reader:{installedDependencySnapshot(root:string,expected?:InstalledTree[]):Promise<InstalledTree[]>},expected:InstalledTree[],originalExpected:InstalledTree[]){
 const markerPath=resolve(c.directory,'owner'),markerBytes=readFileSync(markerPath);
 const siblingPath=resolve(c.root,'node_modules/.cache/sibling-sentinel'),siblingBytes=readFileSync(siblingPath);
 const payload=resolve(c.storage,'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js');
 const payloadBytes=readFileSync(payload),payloadMode=lstatSync(payload).mode&0o7777;
 const originalPayload=readFileSync(resolve(packageRoot,'node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js'));
 const expectedBytes=JSON.stringify(expected);
 const recover=async()=>{
  assert.deepEqual(readFileSync(markerPath),markerBytes,'Scanner refusal never advances owner metadata');
  assert.deepEqual(readFileSync(payload),payloadBytes);assert.equal(lstatSync(payload).mode&0o7777,payloadMode);
  assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(resolve(packageRoot,relative(c.storage,payload))),originalPayload);
  assert.equal(JSON.stringify(expected),expectedBytes,'Captured expected census never becomes scanner output');
  await c.assertPositive();assert.deepEqual(await reader.installedDependencySnapshot(c.root,expected),expected,'Fresh separate full private reader recovers after every refusal');
 };
 const useful=await installedCallbacks(async()=>{assert.deepEqual(await reader.installedDependencySnapshot(c.root,expected),expected);await c.assertPositive();});
 assert(useful.eofs>0,'Complete installed files are read through actual EOF');await recover();
 // Observe the shipped allocators for the whole TWO-owner invocation, including
 // buffers already returned by earlier files. Active-peak accounting alone
 // would incorrectly accept the predecessor's 12,928 allocations per pair.
 const retained:InstalledBufferCensus[]=[];
 const zeros=Buffer.alloc(512*1024);
 const fullBufferRecovery=async(scanner:'HC'|'D')=>{
  const observed=await installedCallbacks(async()=>{
   if(scanner==='HC')await c.assertPositive();
   else for(const [root,trees] of [[c.root,expected],[repository,originalExpected]] as const)assert.deepEqual(await reader.installedDependencySnapshot(root,trees),trees,'Fresh full D hash/path/count/native recovery: '+root);
  },undefined,undefined,undefined,{observeBuffers:true,disjointFrom:retained});
  // The full HC guard retains its two HC pairs, then independently invokes
  // copied D's private/original/original closure reads. None is coalesced.
  const roots=scanner==='HC'?[c.root,repository,c.root,repository,repository]:[c.root,repository];
  assert.equal(observed.censuses.length,roots.length,'Every separate original/private scanner invocation remains an actual read');assert.deepEqual(observed.censuses.map(census=>census.root),roots);
  for(const census of observed.censuses){
   const trees=census.root===c.root?expected:originalExpected,files=trees.flatMap(tree=>tree.entries).filter((entry):entry is InstalledEntry&{type:'file';bytes:number}=>entry.type==='file');
   assert(census.complete,'No partial census substitutes for the complete final root callback');assert.equal(census.allocations,16);assert.equal(census.buffers.size,16);assert.equal(census.backings.size,16);
   assert.equal(census.files,files.length,'Every regular file across both owners reaches its own logical read generation');assert.equal(census.bytes,files.reduce((sum,file)=>sum+file.bytes,0),'Every actual byte across both owners contributes to the full hash/count');
  }
  retained.push(...observed.censuses);return observed;
 };
 for(const scanner of ['HC','D'] as const){await fullBufferRecovery(scanner);await fullBufferRecovery(scanner);}
 const hasCause=(value:unknown,cause:Error):boolean=>value===cause||(value instanceof AggregateError&&value.errors.some(error=>hasCause(error,cause)))||(value instanceof Error&&value.cause!==undefined&&hasCause(value.cause,cause));
 const causeLeaves=(value:unknown,ancestors:Set<unknown>=new Set()):unknown[]=>{
  if(ancestors.has(value))return [value];
  const children:unknown[]=value instanceof AggregateError?[...value.errors]:[];
  if(value instanceof Error&&value.cause!==undefined)children.push(value.cause);
  if(!children.length)return [value];
  const next=new Set(ancestors);next.add(value);return children.flatMap(child=>causeLeaves(child,next));
 };
 for(const scanner of ['HC','D'] as const)for(const fault of ['allocation','initial-zeroing','erasure'] as const){
  const cause=new Error('F-H '+scanner+' installed buffer '+fault+' failure');
  let injected=0,allocationCalls=0,initialCalls=0,poisoned=false,settled=false,returned=false,unwinding=false;
  let dirty:Buffer|undefined,started:Promise<unknown>|undefined;
  const opens=new Set<string>(),reads=new Set<string>(),ready=new Set<string>(),enumerated=new Set<string>(),held=new Map<string,()=>void>(),heldBuffers=new Map<string,Buffer>(),heldResults=new Map<string,unknown[]>();
  const waiting=new Set<string>(),later=new Set<string>();let releasePath='',postPoisonOpens=0,postPoisonReads=0;
  let notifySaturated!:()=>void,notifyPoison!:()=>void;
  const saturated=new Promise<void>(yes=>{notifySaturated=yes;}),poison=new Promise<void>(yes=>{notifyPoison=yes;});
  const invoke=()=>scanner==='HC'?c.assertPositive():reader.installedDependencySnapshot(c.root,expected);
  let failedCensus:InstalledBufferCensus[]=[];
  try{
   const observed=await installedCallbacks(async()=>{
    started=invoke();void started.then(()=>{settled=true;returned=true;},()=>{settled=true;});void started.catch(()=>{});
    try{
     if(fault==='erasure'){
      await Promise.race([saturated,started.then(()=>assert.fail('The actual scanner returned before sixteen native read callbacks were held'),error=>{throw error;})]);
      assert.equal(held.size,16,'Saturate every admitted logical file unit with real native callback barriers');assert.equal(opens.size,16);assert.equal(settled,false);assert.equal(existsSync(c.directory),true);
      for(const values of heldResults.values())assert.equal(values[0],null,'Every held sibling result comes from an actual successful native read');
      for(const path of ready)if(!opens.has(path))waiting.add(path);
      for(const path of enumerated)if(!opens.has(path))later.add(path);
      assert(waiting.size>0,'Actual regular-file stat callbacks prove additional file units waiting behind saturated admissions');assert(later.size>0,'Actual enclosing enumeration identifies later regular-file admissions beyond the sixteen opened units');
      releasePath=[...held.keys()].find(path=>(heldResults.get(path)![1] as number)>0&&!heldBuffers.get(path)!.equals(zeros))??'';
      assert(releasePath,'A real completed native read must leave touched plaintext for the erasure fault');
      const release=held.get(releasePath)!;held.delete(releasePath);release();
      await Promise.race([poison,started.then(()=>assert.fail('The actual scanner completed without the required dirty-buffer erasure fault'),error=>{throw error;})]);
      assert.equal(injected,1);assert.equal(settled,false,'Rejection waits for every already-started sibling callback and actual descriptor close');assert.equal(held.size,15);assert.equal(existsSync(c.directory),true,'Poisoning does not remove the owned root while native work remains');
      assert.equal(postPoisonOpens,0);assert.equal(postPoisonReads,0);assert(dirty&&!dirty.equals(zeros),'The deliberately failed erasure leaves a retired dirty buffer');
      for(const release of held.values())release();held.clear();
     }
     await assert.rejects(started,(error:unknown)=>{
      assert(hasCause(error,cause),'Rejection retains the exact injected buffer-management cause');
      const leaves=causeLeaves(error);assert(leaves.length>0,'The rejection retains actual failure leaves');
      for(const leaf of leaves)assert.equal(leaf,cause,'No observer assertion or unexpected native failure may hide beside the injected buffer-management cause');return true;
     },'No successful or partial tree follows poisoned buffer admission');
     assert.equal(settled,true);assert.equal(returned,false);assert.equal(injected,1);assert.equal(postPoisonOpens,0);assert.equal(postPoisonReads,0,'Queued/later read starts stay zero even after every held native sibling is released');
     for(const path of [...waiting,...later]){assert(!opens.has(path),'Queued/later paths never acquire descriptors after poison: '+path);assert(!reads.has(path),'Queued/later paths never begin reads after poison: '+path);}
     if(fault!=='erasure'){assert.equal(opens.size,0,'Eager initialization failure starts zero descriptors');assert.equal(reads.size,0,'Eager initialization failure starts zero reads');}
     assert.equal(existsSync(c.directory),true,'Failed guard retains the exact owned root for fresh recovery');
    }finally{unwinding=true;for(const release of held.values())release();held.clear();if(started)await Promise.allSettled([started]);}
   },(path,args,proceed)=>{
    if(fault==='erasure'&&!unwinding&&!reads.has(path))assert.fail('Native start accounting must precede the callback hook');
    if(fault==='erasure'&&!unwinding&&!heldBuffers.has(path)){
     const callback=args.at(-1) as (...values:unknown[])=>void,buffer=args[1] as Buffer;heldBuffers.set(path,buffer);
     args[args.length-1]=(...values:unknown[])=>{
      if(unwinding){callback(...values);return;}
      heldResults.set(path,values);held.set(path,()=>callback(...values));if(held.size===16)notifySaturated();
     };
    }
    proceed();
   },undefined,undefined,{
    observeBuffers:true,allowNoReads:fault!=='erasure',disjointFrom:retained,
    allocate:(_size,proceed)=>{allocationCalls++;if(fault==='allocation'&&allocationCalls===3){injected++;poisoned=true;throw cause;}assert(!poisoned||fault==='erasure','No allocation proceeds after initialization is poisoned');return proceed();},
    fill:(state,phase,_args,proceed)=>{
     if(phase==='initial'){initialCalls++;if(fault==='initial-zeroing'&&initialCalls===3){injected++;poisoned=true;dirty=state.buffer;throw cause;}}
     if(fault==='erasure'&&phase==='erase'&&state.unit?.path===releasePath&&!injected){assert(state.touched>0);assert(!state.buffer.equals(zeros));dirty=state.buffer;injected++;poisoned=true;notifyPoison();throw cause;}
     return proceed();
    },
    nativeStart:(method,path,args)=>{
     if(method==='open'){if(poisoned)postPoisonOpens++;opens.add(path);}
     if(method==='read'){if(poisoned&&(waiting.has(path)||later.has(path)))postPoisonReads++;assert.notEqual(args[1],dirty,'A retired dirty buffer never enters another native read');reads.add(path);}
    },
    nativeFinish:(method,path,values)=>{
     if(values[0])return;
     if(method==='lstat'&&(values[1] as import('node:fs').BigIntStats).isFile())ready.add(path);
     if(method==='readdir')for(const name of values[1] as string[]){if(name==='.cache'&&path.endsWith('/node_modules'))continue;const full=resolve(path,name);if(lstatSync(full).isFile())enumerated.add(full);}
    },settled:censuses=>{failedCensus=censuses;}
   });
   failedCensus=observed.censuses;retained.push(...failedCensus);assert.equal(injected,1);
   if(fault!=='erasure'){assert.equal(observed.peak,0,'Eager buffer failure starts zero native IO callbacks');assert.equal(observed.reads,0);assert.equal(observed.descriptorReads,0);assert.equal(allocationCalls,3,'Initialization poisoning stops all later backing allocations');}
   if(fault==='allocation'){assert.equal(allocationCalls,3);assert.equal(failedCensus[0]!.allocations,2,'The allocation fault follows earlier successful real backing allocations');}
   if(fault==='initial-zeroing'){assert(dirty);assert(!reads.size,'The exact failed initial-zeroing buffer never reaches a lease');}
  }finally{
   unwinding=true;for(const release of held.values())release();held.clear();if(started)await Promise.allSettled([started]);
   // Controlled test memory keeps the identity census, but no injected dirty
   // plaintext. Product seams have already been restored by installedCallbacks.
   for(const census of failedCensus)for(const buffer of census.buffers)buffer.fill(0);
  }
  await recover();await fullBufferRecovery(scanner);
 }
 // Extra disposable files are read by the direct complete scanner, then removed
 // before any captured-closure guard/recovery; empty files still reach EOF.
 const empty=resolve(c.storage,'node_modules/owned-reader-empty'),boundary=resolve(c.storage,'node_modules/owned-reader-boundary');
 assert(!existsSync(empty)&&!existsSync(boundary));let shortReads=0,emptyEofs=0;
 try{
  writeFileSync(empty,Buffer.alloc(0),{mode:0o600});writeFileSync(boundary,Buffer.alloc(512*1024+17,0x6b),{mode:0o600});
  const independent=(['g1-storage','g1-recovery'] as InstalledOwner[]).map(owner=>installedTree(c.root,owner));
  await installedCallbacks(async()=>{assert.deepEqual(await reader.installedDependencySnapshot(c.root),independent,'Empty/boundary/short reads retain every actual byte and full census');},(path,args,proceed)=>{
   if(path===boundary&&shortReads===0){shortReads++;args[3]=13;}
   if(path===empty){const callback=args.at(-1) as (...values:unknown[])=>void;args[args.length-1]=(...values:unknown[])=>{if(!values[0]&&values[1]===0)emptyEofs++;callback(...values);};}
   proceed();
  });
  assert.equal(shortReads,1);assert.equal(emptyEofs,1,'An empty regular file is opened, read to EOF and closed');
 }finally{rmSync(empty,{force:true});rmSync(boundary,{force:true});}
 await recover();
 for(const mode of ['native-error','synchronous-throw','premature-eof'] as const){
  let injected=0;
  await installedCallbacks(async()=>{await assert.rejects(()=>reader.installedDependencySnapshot(c.root,expected),(error:unknown)=>{
   if(mode!=='premature-eof'){const causes=(value:unknown):string=>String(value)+(value instanceof AggregateError?'\n'+value.errors.map(causes).join('\n'):'');assert.match(causes(error),mode==='native-error'?/F-H callback installed read failure/:/F-H synchronous installed read failure/);}return true;
  },'A failed/short complete read never returns a good tree');},(path,args,proceed)=>{
   if(path!==payload||injected){proceed();return;}injected++;
   if(mode==='synchronous-throw')throw new Error('F-H synchronous installed read failure');
   const callback=args.at(-1) as (...values:unknown[])=>void;
   callback(mode==='native-error'?new Error('F-H callback installed read failure'):null,0,args[1]);
  });
  assert.equal(injected,1,'The actual owned payload reaches the failure seam');await recover();
 }
 let descriptorFailures=0;
 await installedCallbacks(async()=>{await assert.rejects(()=>reader.installedDependencySnapshot(c.root,expected),(error:unknown)=>{const causes=(value:unknown):string=>String(value)+(value instanceof AggregateError?'\n'+value.errors.map(causes).join('\n'):'');assert.match(causes(error),/F-H native descriptor stat failure/);return true;});},undefined,undefined,(path,proceed)=>{
  if(path===payload&&!descriptorFailures){descriptorFailures++;throw new Error('F-H native descriptor stat failure');}return proceed();
 });
 assert.equal(descriptorFailures,1);await recover();
 for(const operation of ['standalone','preflight','sibling-failure','native-mutation','pathname-substitution'] as const){
  let releaseRead:(()=>void)|undefined,releaseClose:(()=>void)|undefined,notifyHeld!:()=>void,notifyFailure!:()=>void,notifyClose!:()=>void;
  const held=new Promise<void>(yes=>{notifyHeld=yes;}),failed=new Promise<void>(yes=>{notifyFailure=yes;}),closeHeld=new Promise<void>(yes=>{notifyClose=yes;});
  let heldPath='',injected=0,settled=false,unwinding=false,closeClaimed=false,spawns=0,started:Promise<unknown>|undefined;
  const spawnActual=childProcess.spawn,syncActual=childProcess.spawnSync,heldPayload=payload+'.owned-held';
  assert(!existsSync(heldPayload));
  childProcess.spawn=((...args:Parameters<typeof childProcess.spawn>)=>{if(args[0]===process.execPath&&Array.isArray(args[1])&&String(args[1][0]).startsWith(c.storage+'/'))spawns++;return Reflect.apply(spawnActual,childProcess,args);}) as typeof childProcess.spawn;
  childProcess.spawnSync=((...args:Parameters<typeof childProcess.spawnSync>)=>{if(args[0]===process.execPath&&Array.isArray(args[1])&&String(args[1][0]).startsWith(c.storage+'/'))spawns++;return Reflect.apply(syncActual,childProcess,args);}) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();
  try{
   await installedCallbacks(async()=>{
    started=operation==='preflight'?c.runAsync('positive-held-preflight','scripts/build.mjs'):c.assertPositive();
    void started.then(()=>{settled=true;},()=>{settled=true;});void started.catch(()=>{});
    try{
     await Promise.race([held,started.then(()=>assert.fail('Guard completed without its held native read'),error=>{throw error;})]);
     assert.equal(settled,false);assert.equal(existsSync(c.directory),true);assert.equal(spawns,0);
     await assert.rejects(()=>c.assertPositive(),/active|closed/i);
     await assert.rejects(()=>c.run('held-guard-sync-dispatch','scripts/build.mjs'),/Harness copy operation already active or closed/);
     await assert.rejects(()=>c.runAsync('held-guard-async-dispatch','scripts/build.mjs'),/Harness copy operation already active or closed/);
     await assert.rejects(()=>c.close(),/Active harness child must settle before copy cleanup/);
     assert.equal(spawns,0,'Concurrent guards/preflight/cleanup refuse before any spawn');
     if(operation==='sibling-failure'){
      await Promise.race([failed,started.then(()=>assert.fail('Guard completed before required failed sibling callback'),error=>{throw error;})]);assert.equal(settled,false,'Sibling failure waits for the other started recursive read');
      releaseRead!();releaseRead=undefined;await Promise.race([closeHeld,started.then(()=>assert.fail('Guard completed before required held descriptor close'),error=>{throw error;})]);assert.equal(settled,false,'Sibling failure also waits for the held descriptor close');
      await assert.rejects(()=>c.close(),/Active harness child must settle before copy cleanup/);assert.equal(existsSync(c.directory),true);
      releaseClose!();releaseClose=undefined;
     }else{
      if(operation==='pathname-substitution'){renameSync(payload,heldPayload);writeFileSync(payload,payloadBytes,{mode:payloadMode});}
      else if(operation!=='standalone')writeFileSync(payload,Buffer.concat([payloadBytes,Buffer.from('\nowned held-read mutation\n')]));
      releaseRead!();releaseRead=undefined;
     }
     if(operation==='standalone')await started;else await assert.rejects(started,'Native mutation/descriptor substitution/sibling failure cannot return a good tree');
     assert.equal(settled,true);assert.equal(spawns,0);assert.equal(existsSync(c.directory),true,'Standalone/preflight failure keeps the copy for exact restoration');
    }finally{
     unwinding=true;releaseRead?.();releaseRead=undefined;releaseClose?.();releaseClose=undefined;if(started)await Promise.allSettled([started]);
    }
   },(path,args,proceed)=>{
    if(!releaseRead&&!heldPath&&(operation==='sibling-failure'?path.startsWith(resolve(c.storage,'node_modules')+'/'):path===payload)){
     heldPath=path;releaseRead=proceed;notifyHeld();return;
    }
    if(operation==='sibling-failure'&&heldPath&&path!==heldPath&&path.startsWith(resolve(c.storage,'node_modules')+'/')&&!injected){
     injected++;const callback=args.at(-1) as (...values:unknown[])=>void;callback(new Error('F-H failed installed sibling'),0,args[1]);notifyFailure();return;
    }
    proceed();
   },(path,_args,proceed)=>{
    if(operation==='sibling-failure'&&path===heldPath&&!unwinding&&!closeClaimed){closeClaimed=true;releaseClose=proceed;notifyClose();}else proceed();
   });
  }finally{
   unwinding=true;releaseRead?.();releaseClose?.();if(started)await Promise.allSettled([started]);
   childProcess.spawn=spawnActual;childProcess.spawnSync=syncActual;syncBuiltinESMExports();
   if(existsSync(heldPayload)){rmSync(payload,{force:true});renameSync(heldPayload,payload);}else writeFileSync(payload,payloadBytes);chmodSync(payload,payloadMode);
  }
  if(operation==='sibling-failure')assert.equal(injected,1);await recover();
 }
}

async function installedCloseSettlement(c:HarnessCopy,body:()=>Promise<void>){
 let releaseRead:(()=>void)|undefined,releaseClose:(()=>void)|undefined,notifyHeld!:()=>void,notifyFailure!:()=>void,notifyClose!:()=>void;
 const held=new Promise<void>(yes=>{notifyHeld=yes;}),failed=new Promise<void>(yes=>{notifyFailure=yes;}),closeHeld=new Promise<void>(yes=>{notifyClose=yes;});
 let heldPath='',injected=0,settled=false,unwinding=false,closeClaimed=false,closing:Promise<void>|undefined;
 try{
  await installedCallbacks(async()=>{
   closing=body();void closing.then(()=>{settled=true;},()=>{settled=true;});void closing.catch(()=>{});
   try{
    await Promise.race([held,closing.then(()=>assert.fail('Failed close completed without held read'),error=>{throw error;})]);
    await Promise.race([failed,closing.then(()=>assert.fail('Close completed before required failed sibling callback'),error=>{throw error;})]);assert.equal(settled,false);assert.equal(existsSync(c.directory),true,'Failed close cannot remove while a recursive read is active');
    await assert.rejects(()=>c.close(),/Active harness child must settle before copy cleanup/);
    releaseRead!();releaseRead=undefined;await Promise.race([closeHeld,closing.then(()=>assert.fail('Close completed before required held descriptor close'),error=>{throw error;})]);
    assert.equal(settled,false);assert.equal(existsSync(c.directory),true,'Failed close cannot remove before descriptor-close callback settlement');
    releaseClose!();releaseClose=undefined;
    await closing;assert.equal(settled,true);assert.equal(existsSync(c.directory),false,'Guard failure still removes only the independently proved copy after every read/close settles');
   }finally{unwinding=true;releaseRead?.();releaseRead=undefined;releaseClose?.();releaseClose=undefined;if(closing)await Promise.allSettled([closing]);}
  },(path,args,proceed)=>{
   if(!heldPath&&path.startsWith(resolve(c.storage,'node_modules')+'/')){heldPath=path;releaseRead=proceed;notifyHeld();return;}
   if(heldPath&&path!==heldPath&&path.startsWith(resolve(c.storage,'node_modules')+'/')&&!injected){injected++;const callback=args.at(-1) as (...values:unknown[])=>void;callback(new Error('F-H failed close sibling'),0,args[1]);notifyFailure();return;}
   proceed();
  },(path,_args,proceed)=>{if(path===heldPath&&!unwinding&&!closeClaimed){closeClaimed=true;releaseClose=proceed;notifyClose();}else proceed();});
  assert.equal(injected,1);
 }finally{unwinding=true;releaseRead?.();releaseClose?.();if(closing)await Promise.allSettled([closing]);}
}

/** Closure/origin controls stay in H01's useful fresh-build leaf. This independent
 * positive copy runs no install or child and claims no prerequisite result. */
async function positiveCopyInputs(c:HarnessCopy){
 await c.preparePositive();await c.assertPositive();
 assert.equal(dirname(c.directory),realpathSync(resolve(packageRoot,'node_modules/.cache')),'Prepared positive copy retains its canonical project cache parent');
 const markerPath=resolve(c.directory,'owner'),markerBytes=readFileSync(markerPath);
 const marker=JSON.parse(markerBytes.toString()) as PositiveMarker;
 assert.equal(marker.schema,'owned-storage-copy-v1');assert.equal(marker.owner,c.owner);assert.equal(marker.originRoot,repository);
 assert.notEqual(c.root,repository);assert.notEqual(marker.rootIdentity.inode,marker.originIdentity.inode);
 assert.equal(marker.rootIdentity.realpath,c.root);assert.equal(marker.directoryIdentity.realpath,c.directory);assert.equal(marker.originIdentity.realpath,repository);
 const owners:InstalledOwner[]=['g1-storage','g1-recovery'];
 const originalDependencies=owners.map(owner=>installedTree(repository,owner)),copiedDependencies=owners.map(owner=>installedTree(c.root,owner));
 const sameTrees=(actual:InstalledTree[],expected:InstalledTree[],message:string)=>assert.equal(digest(JSON.stringify(actual)),digest(JSON.stringify(expected)),message);
 sameTrees(marker.dependencies.original,originalDependencies,'Marker binds the complete original installed trees');
 sameTrees(marker.dependencies.copied,copiedDependencies,'Marker binds the complete copied installed trees');
 for(const [index,owner] of owners.entries()){
  const origin=originalDependencies[index]!,owned=copiedDependencies[index]!;
  assert.equal(origin.entries[0]!.path,'.');assert.equal(origin.entries[0]!.type,'directory');
  assert.equal(digest(JSON.stringify(owned.entries)),digest(JSON.stringify(origin.entries)),'Initial dependency bytes, modes, types and links equal: '+owner);
  assert.notDeepEqual(owned.rootIdentity,origin.rootIdentity);assert.equal(owned.rootIdentity.realpath,resolve(c.root,owner,'node_modules'));
  assert(origin.rootIdentity.device!==owned.rootIdentity.device||origin.rootIdentity.inode!==owned.rootIdentity.inode,'Original and copied installed roots have distinct instances: '+owner);
  assert.equal(new Set(origin.entries.map(entry=>entry.path)).size,origin.entries.length);
  assert.deepEqual(origin.entries.map(entry=>entry.path),origin.entries.map(entry=>entry.path).sort());
  assert(!origin.entries.some(entry=>entry.path==='.cache'||entry.path.startsWith('.cache/')));
  for(const entry of origin.entries)if(entry.type==='file'){
   const source=lstatSync(resolve(repository,owner,'node_modules',entry.path)),destination=lstatSync(resolve(c.root,owner,'node_modules',entry.path));
   assert(source.dev!==destination.dev||source.ino!==destination.ino,'Copy cannot share installed file identity: '+owner+'/'+entry.path);
  }
  for(const root of [repository,c.root]){
   const pkg=JSON.parse(readFileSync(resolve(root,owner,'package.json'),'utf8')) as {packageManager:string;dependencies:Record<string,string>;devDependencies:Record<string,string>};
   assert.equal(pkg.packageManager,'pnpm@10.18.0');
   for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies}))assert.equal(JSON.parse(readFileSync(resolve(root,owner,'node_modules',name,'package.json'),'utf8')).version,version,owner+'/'+name);
   assert.deepEqual(readFileSync(resolve(root,owner,'node_modules/.pnpm/lock.yaml')),readFileSync(resolve(root,owner,'pnpm-lock.yaml')),'Installed and wanted pinned locks agree: '+owner);
  }
 }
 const dependencyMetadata=JSON.parse(readFileSync(resolve(c.storage,'dependencies.json'),'utf8')) as {lockSha256:string;dependencies:{name:string;version:string;installedPath:string;packageJsonSha256:string;notices:{path:string;installedName:string;sha256:string}[]}[]};
 assert.equal(digest(readFileSync(resolve(c.storage,'pnpm-lock.yaml'))),'sha256:'+dependencyMetadata.lockSha256);assert.equal(dependencyMetadata.dependencies.length,18);
 for(const dependency of dependencyMetadata.dependencies)for(const root of [repository,c.root]){
  const pkg=readFileSync(resolve(root,'g1-storage',dependency.installedPath,'package.json'));
  assert.equal(digest(pkg),'sha256:'+dependency.packageJsonSha256,dependency.name);assert.equal(JSON.parse(pkg.toString()).version,dependency.version);
  for(const notice of dependency.notices)for(const path of [notice.path,dependency.installedPath+'/'+notice.installedName])assert.equal(digest(readFileSync(resolve(root,'g1-storage',path))),'sha256:'+notice.sha256,dependency.name+'/'+path);
 }
 const copied=await import(pathToFileURL(resolve(c.storage,'scripts/delivery-evidence.mjs')).href);
 const original=await import(pathToFileURL(resolve(packageRoot,'scripts/delivery-evidence.mjs')).href);
 // The metadata templates are exercised directly, independently of any
 // captured-input hash refusal. Initial private shims still name the original
 // root and remain uninvoked; this admits no relocated install transition.
 original.assertStorageInstallationMetadata(repository);
 copied.assertStorageInstallationMetadata(c.root,repository);
 const installationMetadataPaths=['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'];
 const initialMetadata=new Map(installationMetadataPaths.map(path=>{
  const origin=resolve(packageRoot,'node_modules',path),owned=resolve(c.storage,'node_modules',path),stat=lstatSync(origin),bytes=readFileSync(origin),mode=stat.mode&0o7777;
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,path);
  assert.deepEqual(readFileSync(owned),bytes,'Exact initial storage metadata bytes: '+path);
  assert.equal(lstatSync(owned).mode&0o7777,mode,'Exact initial storage metadata mode: '+path);
  return [path,{bytes,mode}] as const;
 }));
 const sourceSentinels=['src/schema.ts','scripts/build.mjs','pnpm-lock.yaml'].map(path=>{
  const bytes=readFileSync(resolve(packageRoot,path)),mode=lstatSync(resolve(packageRoot,path)).mode&0o7777;
  assert.deepEqual(readFileSync(resolve(c.storage,path)),bytes);assert.equal(lstatSync(resolve(c.storage,path)).mode&0o7777,mode);
  return {path,bytes,mode};
 });
 assert.deepEqual(await original.evidenceOrigin(),{executionRoot:repository,originRoot:repository});
 assert.deepEqual(await copied.evidenceOrigin(),{executionRoot:c.root,originRoot:repository});
 await installedReadSchedules(c,copied,copiedDependencies,originalDependencies);
 const audit=await copied.inspectEvidence(),sourceAudit=await original.inspectEvidence();
 assert.equal(audit.executionRoot,c.root);assert.equal(audit.originRoot,repository);
 assert.deepEqual(audit.current.candidate,sourceAudit.current.candidate);assert.deepEqual(audit.current.candidate,marker.candidate);
 assert.equal(audit.current.controllerFingerprint,sourceAudit.current.controllerFingerprint);assert.equal(audit.current.controllerFingerprint,marker.controllerFingerprint);
 assert.equal(audit.qualification.externalQualification,'pending');assert.equal(audit.qualification.authorVerdict,false);
 const originKeys=['STORAGE_REPO_ROOT','STORAGE_CONTROLLER_ORIGIN','LOOP_PROJECT','HARNESS_CHILD_ORIGIN','HARNESS_CHILD_NONCE'];
 const outerOrigins=new Map(originKeys.map(key=>[key,process.env[key]]));
 try{
  for(const key of originKeys)process.env[key]=resolve(c.directory,'forged-environment-origin');
  assert.deepEqual(await original.evidenceOrigin(),{executionRoot:repository,originRoot:repository});
  assert.deepEqual(await copied.evidenceOrigin(),{executionRoot:c.root,originRoot:repository});
 }finally{for(const [key,value] of outerOrigins)if(value===undefined)delete process.env[key];else process.env[key]=value;}

 const sourceFiles:[string,string][]=[];
 const sourceList=(directory:string)=>{for(const name of readdirSync(directory).sort()){
  if(name==='node_modules')continue;const file=resolve(directory,name),s=lstatSync(file);assert(!s.isSymbolicLink());
  if(s.isDirectory())sourceList(file);else{assert(s.isFile());sourceFiles.push([relative(packageRoot,file),digest(readFileSync(file)).slice(7)]);}
 }};sourceList(packageRoot);assert.deepEqual(marker.sourceFiles,sourceFiles);assert.equal(sourceFiles.length,marker.candidate.files);
 const goalPath='.loop/goals/agent-fabric-g1-f05-storage';
 const state=JSON.parse(readFileSync(resolve(c.root,goalPath,'state.json'),'utf8')) as {checks:Record<string,FinishedCheck>};
 const finished=Object.entries(state.checks).filter(([,result])=>result.finished_at);
 assert.equal(audit.latest.length,finished.length);assert(finished.length>0);
 const inventory=JSON.parse(readFileSync(resolve(c.storage,'verification/delivery-inventory-v1.json'),'utf8')) as {sourceFiles:Record<string,string>;observedRecovery:{stdout:PositiveInput}};
 const matrix=JSON.parse(readFileSync(resolve(c.storage,'verification/obligation-to-test-v1.json'),'utf8')) as {requirementsSource:string};
 const preserved=JSON.parse(readFileSync(resolve(c.storage,'verification/preserved-inputs.json'),'utf8')) as {files:Record<string,string>};
 const allocations=['docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json','docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json'];
 const documents=['docs/planning/g1-f05-plan.md','docs/evidence/g1-f05-acceptance.md','docs/evidence/g1-f05-delivery-inventory.md',matrix.requirementsSource];
 const failurePath=goalPath+'/runs/checks/job-bef5a26060/f05-15-docs.delivery-operations-component/';
 const historical=[{path:failurePath+'stdout.log',bytes:169738,sha256:'sha256:4a6b1a4a4d03c5b702d51af33eca62a1e0e78dd67a81f4ca6ef19ab2a31c6ae0'},
  {path:failurePath+'stderr.log',bytes:2165,sha256:'sha256:c5c4576d5868611faf8b824974ade32ac89735935871030259e94df04e20df53'},inventory.observedRecovery.stdout];
 const requiredPaths=new Set([...Object.keys(preserved.files),...sourceFiles.map(([path])=>'g1-storage/'+path),...allocations,...documents,...Object.keys(inventory.sourceFiles),
  '.loop/bin/loop',goalPath+'/goal.json',goalPath+'/state.json',goalPath+'/events.jsonl',...finished.flatMap(([,result])=>[result.log+'/stdout.log',result.log+'/stderr.log']),...historical.map(stream=>stream.path)]);
 assert.equal(marker.inputs.length,new Set(marker.inputs.map(input=>input.path)).size,'Every positive input exactly once');
 assert.deepEqual(marker.inputs.map(input=>input.path).sort(),[...requiredPaths].sort(),'Complete regular source/document/controller/raw input closure');
 for(const input of marker.inputs){
  const originBytes=readFileSync(resolve(repository,input.path)),copyBytes=readFileSync(resolve(c.root,input.path));
  assert.equal(input.bytes,originBytes.length,input.path);assert.equal(input.sha256,digest(originBytes),input.path);assert.deepEqual(copyBytes,originBytes,input.path);
  for(const root of [repository,c.root]){const s=lstatSync(resolve(root,input.path));assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,input.path);assert.equal(s.mode&0o777,input.mode,input.path);}
 }
 for(const [path,hash] of Object.entries(preserved.files))assert.equal(marker.inputs.find(input=>input.path===path)!.sha256,'sha256:'+hash,path);
 for(const [path,hash] of Object.entries(inventory.sourceFiles))assert.equal(marker.inputs.find(input=>input.path===path)!.sha256,hash,path);
 for(const stream of historical)copied.assertStream(readFileSync(resolve(c.root,stream.path)),stream);
 for(const run of audit.latest)for(const stream of [run.stdout,run.stderr]){
  copied.assertStream(readFileSync(resolve(c.root,stream.path)),stream);
  assert.equal(marker.inputs.find(input=>input.path===stream.path)!.bytes,stream.bytes,stream.path);
 }
 const operations=audit.latest.find((run:{id:string})=>run.id==='f05-15-docs.delivery-operations-component');assert(operations);
 assert.equal(operations.commandBinding.cwd,repository);assert.equal(operations.commandBinding.args[0],resolve(repository,'g1-storage/scripts/check-component.mjs'));
 assert.notEqual(operations.commandBinding.args[0],resolve(c.root,'g1-storage/scripts/check-component.mjs'));
 const actual=state.checks[operations.id]!,definition=audit.definitions[operations.id];
 const inspected=await copied.inspectRun(operations.id,actual,definition,audit.current);assert.deepEqual(inspected.commandBinding,operations.commandBinding);
 await assert.rejects(()=>copied.inspectRun(operations.id,actual,{...definition,cwd:c.root},audit.current),'Copied execution root cannot replace historical command cwd');
 await assert.rejects(()=>copied.inspectRun(operations.id,actual,{...definition,argv:['node',resolve(c.root,'g1-storage/scripts/check-component.mjs'),'delivery-operations'],run:undefined},audit.current),'Copied absolute command cannot replace actual original command');

 const recovery=async()=>{await c.assertPositive();assert.deepEqual(await copied.evidenceOrigin(),{executionRoot:c.root,originRoot:repository});};
 const rejectInput=async(path:string,mutate:(file:string)=>void,reason?:RegExp)=>{
  const file=resolve(c.root,path),bytes=readFileSync(file),mode=lstatSync(file).mode&0o777;
  try{mutate(file);if(reason)await assert.rejects(()=>c.assertPositive(),reason,path);else await assert.rejects(()=>c.assertPositive(),path);await assert.rejects(()=>copied.evidenceOrigin(),path);}
  finally{rmSync(file,{force:true});writeFileSync(file,bytes,{mode});chmodSync(file,mode);}
  assert.deepEqual(readFileSync(resolve(repository,path)),bytes,'Original remains unchanged: '+path);await recovery();
 };
 const stdout=finished.find(([,result])=>readFileSync(resolve(c.root,result.log+'/stdout.log')).length>0);assert(stdout);
 const failed=finished.find(([,result])=>result.status!=='pass'&&readFileSync(resolve(c.root,result.log+'/stdout.log')).length>0);assert(failed);
 const emptyStderr=finished.find(([,result])=>readFileSync(resolve(c.root,result.log+'/stderr.log')).length===0);assert(emptyStderr);
 const missing=[documents[0]!,matrix.requirementsSource,stdout[1].log+'/stdout.log',failed[1].log+'/stdout.log',emptyStderr[1].log+'/stderr.log',...historical.map(stream=>stream.path),...allocations];
 for(const path of new Set(missing))await rejectInput(path,file=>rmSync(file),new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 // Empty stderr is an actual captured file; adding even one byte is a mismatch.
 await rejectInput(emptyStderr[1].log+'/stderr.log',file=>writeFileSync(file,'not an empty stderr'));
 await rejectInput(stdout[1].log+'/stdout.log',file=>{const bytes=readFileSync(file);writeFileSync(file,bytes.subarray(0,-1));});
 for(const path of ['g1-storage/src/schema.ts',goalPath+'/state.json',goalPath+'/events.jsonl',documents[0]!])await rejectInput(path,file=>writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\nchanged owned input')])));
 await rejectInput('g1-storage/src/schema.ts',file=>chmodSync(file,(lstatSync(file).mode&0o777)^0o100));
 await rejectInput('g1-storage/src/schema.ts',file=>{rmSync(file);symlinkSync(resolve(c.root,'g1-storage/src/owners.ts'),file);});
 await rejectInput('g1-storage/src/schema.ts',file=>{rmSync(file);linkSync(resolve(c.root,'g1-storage/src/owners.ts'),file);});
 const extra=resolve(c.storage,'src/positive-copy-extra.ts');
 try{writeFileSync(extra,'export const unbound = true;\n');await assert.rejects(()=>c.assertPositive());await assert.rejects(()=>copied.evidenceOrigin());}finally{rmSync(extra,{force:true});}await recovery();
 await rejectInput('.loop/bin/loop',file=>{const source=readFileSync(file,'utf8');assert(source.includes('--project '+repository));writeFileSync(file,source.replace('--project '+repository,'--project '+c.root));});

 const siblingPath=resolve(c.root,'node_modules/.cache/sibling-sentinel'),siblingBytes=readFileSync(siblingPath);
 const dependencyRecovery=async()=>{await c.assertPositive();assert.deepEqual(readFileSync(siblingPath),siblingBytes,'Sibling sentinel survives dependency refusal/recovery');};
 const dependencyRefusal=async(label:string)=>{await assert.rejects(()=>c.assertPositive(),label);await assert.rejects(()=>copied.evidenceOrigin(),label);};
 const rejectInstalled=async(owner:InstalledOwner,path:string,mutate:(file:string)=>void)=>{
  const file=resolve(c.root,owner,'node_modules',path),source=resolve(repository,owner,'node_modules',path),s=lstatSync(file),mode=s.mode&0o7777;
  assert(s.isFile()||s.isSymbolicLink());const bytes=s.isFile()?readFileSync(file):undefined,target=s.isSymbolicLink()?readlinkSync(file):undefined;
  try{mutate(file);await dependencyRefusal(owner+'/'+path);}
  finally{rmSync(file,{force:true});if(target!==undefined)symlinkSync(target,file);else{assert(bytes);writeFileSync(file,bytes,{mode});chmodSync(file,mode);}}
  if(target!==undefined)assert.equal(readlinkSync(source),target,'Original link preserved: '+owner+'/'+path);else assert.deepEqual(readFileSync(source),bytes,'Original payload preserved: '+owner+'/'+path);
  await dependencyRecovery();
 };
 const typeRoot='.pnpm/typescript@5.9.3/node_modules/typescript',payload=typeRoot+'/lib/typescript.js';
 const typeVersion=readFileSync(resolve(c.storage,'node_modules',typeRoot,'package.json'));
 await rejectInstalled('g1-storage',payload,file=>writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\n// changed payload without a version change\n')])));
 assert.deepEqual(readFileSync(resolve(c.storage,'node_modules',typeRoot,'package.json')),typeVersion);
 const retarget=(target:string)=>(file:string)=>{rmSync(file);symlinkSync(target,file);};
 await rejectInstalled('g1-storage','pg',retarget(typeRoot));
 const transitive=copiedDependencies[0]!.entries.find(entry=>entry.type==='link'&&entry.path.startsWith('.pnpm/')&&!entry.path.startsWith('.pnpm/node_modules/'));assert(transitive&&transitive.type==='link');
 await rejectInstalled('g1-storage',transitive.path,retarget(relative(dirname(resolve(c.storage,'node_modules',transitive.path)),resolve(c.storage,'node_modules',typeRoot))));
 await rejectInstalled('g1-storage','pg',retarget(resolve(c.storage,'node_modules',typeRoot)));
 await rejectInstalled('g1-storage','pg',retarget(relative(resolve(c.storage,'node_modules'),resolve(repository,'g1-storage/node_modules',typeRoot))));
 await rejectInstalled('g1-storage','pg',retarget('.pnpm/missing-owned-package/node_modules/missing'));
 await rejectInstalled('g1-storage',payload,file=>rmSync(file));
 await rejectInstalled('g1-storage',payload,file=>chmodSync(file,(lstatSync(file).mode&0o7777)^0o100));
 await rejectInstalled('g1-storage',payload,file=>{rmSync(file);linkSync(resolve(c.storage,'node_modules',typeRoot,'LICENSE.txt'),file);});
 await rejectInstalled('g1-storage',payload,retarget('../package.json'));
 const installedDirectory=resolve(c.storage,'node_modules',typeRoot),directoryMode=lstatSync(installedDirectory).mode&0o7777;
 try{chmodSync(installedDirectory,directoryMode^0o020);await dependencyRefusal('Installed directory mode');}finally{chmodSync(installedDirectory,directoryMode);}await dependencyRecovery();
 for(const path of [typeRoot+'/lib/extra-installed-payload.js','.bin/node']){
  const file=resolve(c.storage,'node_modules',path);assert(!existsSync(file));
  try{writeFileSync(file,'unbound installed bytes\n',{mode:0o755});await dependencyRefusal('Additional installed payload/launcher: '+path);}finally{rmSync(file,{force:true});}await dependencyRecovery();
 }
 const nestedCache=resolve(c.storage,'node_modules',typeRoot,'.cache');assert(!existsSync(nestedCache));
 try{mkdirSync(nestedCache);writeFileSync(resolve(nestedCache,'unbound'),'nested caches are immutable installation inputs\n');await dependencyRefusal('Nested installed .cache must be included');}finally{rmSync(nestedCache,{recursive:true,force:true});}await dependencyRecovery();
 const rootCache=c.put('node_modules/.cache/positive-installed-cache','owned build cache is excluded');await dependencyRecovery();assert.deepEqual(await copied.evidenceOrigin(),{executionRoot:c.root,originRoot:repository});rmSync(rootCache);await dependencyRecovery();
 // Initial storage shims still contain the original root and stay quarantined.
 // Altering even copy-local NODE_PATH/exec bytes before an actual build refuses.
 await rejectInstalled('g1-storage','.bin/tsc',file=>{const source=readFileSync(file,'utf8');assert(source.includes(repository+'/g1-storage/node_modules'));writeFileSync(file,source.replaceAll(repository+'/g1-storage/node_modules',c.storage+'/node_modules'));});
 await rejectInstalled('g1-storage','.bin/tsc',file=>{const source=readFileSync(file,'utf8');assert(source.includes('/bin/tsc'));writeFileSync(file,source.replaceAll('/bin/tsc','/bin/tsserver'));});
 for(const path of ['.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'])await rejectInstalled('g1-storage',path,file=>writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\nchanged initial installation metadata\n')])));
 // Recovery imports private payloads; none of its launchers is ever invoked.
 for(const path of ['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'])await rejectInstalled('g1-recovery',path,file=>writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\nchanged uninvoked recovery installation\n')])));

 // Cheap closed-template controls do not repeat the full original inventory.
 // Each actual malformed destination must fail the direct shipped validator,
 // then recover exact disposable bytes/modes before the next control.
 const metadataRecovery=()=>{
  copied.assertStorageInstallationMetadata(c.root,repository);
  for(const [path,{bytes,mode}] of initialMetadata)for(const root of [packageRoot,c.storage]){
   const file=resolve(root,'node_modules',path),stat=lstatSync(file);
   assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,path);
   assert.deepEqual(readFileSync(file),bytes,'Metadata restoration/original protection: '+path);assert.equal(stat.mode&0o7777,mode,path);
  }
  for(const {path,bytes,mode} of sourceSentinels)for(const root of [packageRoot,c.storage]){
   assert.deepEqual(readFileSync(resolve(root,path)),bytes,'Source sentinel remains unchanged: '+path);assert.equal(lstatSync(resolve(root,path)).mode&0o7777,mode,path);
  }
  assert.deepEqual(readFileSync(siblingPath),siblingBytes,'Sibling sentinel survives direct metadata refusal/recovery');
 };
 const rewriteMetadata=(file:string,change:(source:string)=>string)=>{
  const before=readFileSync(file,'utf8'),after=change(before);assert.notEqual(after,before,'Metadata mutation must actually change bytes');writeFileSync(file,after);
 };
 const replaceMetadata=(file:string,before:string,after:string)=>rewriteMetadata(file,source=>{assert(source.includes(before),'Actual metadata mutation target required');return source.replaceAll(before,after);});
 const rejectMetadata=(label:string,path:string,mutate:(file:string)=>void)=>{
  const file=resolve(c.storage,'node_modules',path),saved=initialMetadata.get(path);assert(saved);
  try{mutate(file);assert.throws(()=>copied.assertStorageInstallationMetadata(c.root,repository),label);}
  finally{rmSync(file,{force:true});writeFileSync(file,saved.bytes,{mode:saved.mode});chmodSync(file,saved.mode);}
  metadataRecovery();
 };
 const modulesControls:[string,(file:string)=>void][]=[
  ['extra modules field',file=>rewriteMetadata(file,source=>source+'storageExtraField: true\n')],
  ['duplicate modules field',file=>rewriteMetadata(file,source=>source+'nodeLinker: isolated\n')],
  ['modules YAML alias',file=>rewriteMetadata(file,source=>source.replace("hoistPattern:\n  - '*'", "hoistPattern: &storageAlias\n  - '*'").replace('publicHoistPattern: []','publicHoistPattern: *storageAlias'))],
  ['modules YAML tag',file=>replaceMetadata(file,'nodeLinker: isolated','nodeLinker: !!str isolated')],
  ['foreign modules store',file=>replaceMetadata(file,'storeDir: /private/tmp/agent-fabric-pnpm-store/v10','storeDir: '+resolve(c.directory,'foreign-owned-store'))],
  ['changed hoisted graph visibility',file=>replaceMetadata(file,'pg-cloudflare: private','pg-cloudflare: public')],
  ['changed hoisted graph package',file=>replaceMetadata(file,'pg-cloudflare@1.4.1:','pg-cloudflare@1.4.0:')],
  ['changed modules linker',file=>replaceMetadata(file,'nodeLinker: isolated','nodeLinker: hoisted')],
  ['changed modules registry',file=>replaceMetadata(file,'default: https://registry.npmjs.org/','default: https://example.invalid/')],
  ['changed included dependency setting',file=>replaceMetadata(file,'  devDependencies: true','  devDependencies: false')],
  ['pending modules hook',file=>replaceMetadata(file,'pendingBuilds: []','pendingBuilds: [typescript@5.9.3]')],
  ['invalid modules timestamp',file=>rewriteMetadata(file,source=>source.replace(/^prunedAt: .+$/m,'prunedAt: invalid'))],
  ['non-native millisecond modules timestamp',file=>rewriteMetadata(file,source=>source.replace(/^prunedAt: .+$/m,'prunedAt: Wed, 07 Oct 2026 21:27:20.000 GMT'))],
  ['inconsistent native modules timestamp',file=>rewriteMetadata(file,source=>source.replace(/^prunedAt: .+$/m,'prunedAt: Thu, 07 Oct 2026 21:27:20 GMT'))]
 ];
 for(const [label,mutate] of modulesControls)rejectMetadata(label,'.modules.yaml',mutate);
 const rewriteWorkspace=(file:string,change:(workspace:Record<string,unknown>)=>void)=>rewriteMetadata(file,source=>{const workspace=JSON.parse(source) as Record<string,unknown>;change(workspace);return JSON.stringify(workspace,null,2)+'\n';});
 const workspaceControls:[string,(file:string)=>void][]=[
  ['extra workspace key',file=>rewriteWorkspace(file,workspace=>{workspace.storageExtraField=true;})],
  ['nonempty workspace projects',file=>rewriteWorkspace(file,workspace=>{workspace.projects={[c.storage]:{name:'forged-owned-project'}};})],
  ['workspace hook path',file=>rewriteWorkspace(file,workspace=>{workspace.pnpmfiles=[resolve(c.directory,'owned-pnpm-hook.cjs')];})],
  ['extra workspace setting',file=>rewriteWorkspace(file,workspace=>{(workspace.settings as Record<string,unknown>).storageExtraSetting=true;})],
  ['changed workspace setting',file=>rewriteWorkspace(file,workspace=>{(workspace.settings as Record<string,unknown>).autoInstallPeers=false;})],
  ['changed filtered install',file=>rewriteWorkspace(file,workspace=>{workspace.filteredInstall=true;})],
  ['null workspace timestamp',file=>rewriteWorkspace(file,workspace=>{workspace.lastValidatedTimestamp=null;})],
  ['fractional workspace timestamp',file=>rewriteWorkspace(file,workspace=>{workspace.lastValidatedTimestamp=0.5;})],
  ['duplicate workspace timestamp key',file=>rewriteMetadata(file,source=>source.replace('\n}',',\n  "lastValidatedTimestamp": '+JSON.parse(source).lastValidatedTimestamp+'\n}'))],
  ['missing workspace timestamp key',file=>rewriteWorkspace(file,workspace=>{delete workspace.lastValidatedTimestamp;})],
  ['string workspace timestamp',file=>rewriteWorkspace(file,workspace=>{workspace.lastValidatedTimestamp=String(workspace.lastValidatedTimestamp);})],
  ['nonfinite workspace timestamp',file=>rewriteMetadata(file,source=>source.replace(/"lastValidatedTimestamp": [0-9]+/,'"lastValidatedTimestamp": 1e309'))],
  ['wrong workspace projects type',file=>rewriteWorkspace(file,workspace=>{workspace.projects=[];})]
 ];
 for(const [label,mutate] of workspaceControls)rejectMetadata(label,'.pnpm-workspace-state-v1.json',mutate);
 const shimControls:[string,string,(file:string)=>void][]=[
  ['premature copy-local shim NODE_PATH','.bin/tsc',file=>replaceMetadata(file,repository+'/g1-storage/node_modules',c.storage+'/node_modules')],
  ['sibling shim NODE_PATH','.bin/tsc',file=>replaceMetadata(file,repository+'/g1-storage/node_modules',resolve(c.root,'node_modules'))],
  ['changed tsc exec target','.bin/tsc',file=>replaceMetadata(file,'/bin/tsc','/bin/tsserver')],
  ['changed tsserver exec target','.bin/tsserver',file=>replaceMetadata(file,'/bin/tsserver','/bin/tsc')],
  ['extra shim command','.bin/tsc',file=>rewriteMetadata(file,source=>source+'exit 0\n')],
  ['changed shim mode','.bin/tsc',file=>chmodSync(file,0o700)],
  ['changed shim interpreter','.bin/tsserver',file=>replaceMetadata(file,'#!/bin/sh','#!/bin/bash')],
  ['symlink shim substitution','.bin/tsc',file=>{rmSync(file);symlinkSync('tsserver',file);}],
  ['hardlink shim substitution','.bin/tsc',file=>{rmSync(file);linkSync(resolve(c.storage,'node_modules/.bin/tsserver'),file);}]
 ];
 for(const [label,path,mutate] of shimControls)rejectMetadata(label,path,mutate);
 for(const name of ['node','storage-extra-launcher']){
  const file=resolve(c.storage,'node_modules/.bin',name);assert(!existsSync(file));
  try{writeFileSync(file,'#!/bin/sh\nexit 0\n',{mode:0o755});assert.throws(()=>copied.assertStorageInstallationMetadata(c.root,repository),'Extra launcher must be refused: '+name);}
  finally{rmSync(file,{force:true});}metadataRecovery();
 }
 rejectMetadata('current installed lock byte mismatch','.pnpm/lock.yaml',file=>rewriteMetadata(file,source=>source+'# forged current lock\n'));
 const wantedLockPath=resolve(c.storage,'pnpm-lock.yaml'),wantedLock=readFileSync(wantedLockPath),wantedLockMode=lstatSync(wantedLockPath).mode&0o7777;
 const currentLockPath=resolve(c.storage,'node_modules/.pnpm/lock.yaml'),currentLock=initialMetadata.get('.pnpm/lock.yaml')!;
 try{
  const forged=Buffer.concat([wantedLock,Buffer.from('# forged matching current and wanted locks\n')]);writeFileSync(wantedLockPath,forged);writeFileSync(currentLockPath,forged);
  assert.throws(()=>copied.assertStorageInstallationMetadata(c.root,repository),'Matching current/wanted lock forgery still fails the independent lock pin');
 }finally{
  writeFileSync(wantedLockPath,wantedLock);chmodSync(wantedLockPath,wantedLockMode);writeFileSync(currentLockPath,currentLock.bytes);chmodSync(currentLockPath,currentLock.mode);
 }metadataRecovery();
 // Whole captured-input/origin boundaries are checked again only after every
 // direct control restored exactly, without adopting malformed metadata.
 await recovery();

 const rejectMarker=async(change:(forged:PositiveMarker)=>void,checkCopied=true)=>{
  const forged=JSON.parse(markerBytes.toString()) as PositiveMarker;change(forged);
  try{writeFileSync(markerPath,JSON.stringify(forged));await assert.rejects(()=>c.assertPositive());if(checkCopied)await assert.rejects(()=>copied.evidenceOrigin());}
  finally{writeFileSync(markerPath,markerBytes);chmodSync(markerPath,0o600);}await recovery();
 };
 try{rmSync(markerPath);await assert.rejects(()=>c.assertPositive());await assert.rejects(()=>copied.evidenceOrigin());}finally{writeFileSync(markerPath,markerBytes,{mode:0o600});}await recovery();
 await rejectMarker(forged=>{forged.schema='forged-copy';});
 await rejectMarker(forged=>{forged.owner='00000000-0000-4000-8000-000000000000';},false);
 await rejectMarker(forged=>{forged.originRoot=c.root;});
 await rejectMarker(forged=>{forged.controllerFingerprint='git:'+'0'.repeat(24);});
 for(const key of ['directoryIdentity','rootIdentity','originIdentity'] as const)await rejectMarker(forged=>{forged[key].inode++;});
 await rejectMarker(forged=>{forged.sourceFiles.pop();});
 await rejectMarker(forged=>{forged.candidate.digest='sha256:'+'0'.repeat(64);});
 for(const key of ['bytes','sha256','mode','path'] as const)await rejectMarker(forged=>{
  const input=forged.inputs.find(input=>input.path==='g1-storage/src/schema.ts')!;
  if(key==='bytes')input.bytes++;else if(key==='mode')input.mode^=0o100;else if(key==='sha256')input.sha256='sha256:'+'0'.repeat(64);else input.path='../g1-storage/src/schema.ts';
 });
 await rejectMarker(forged=>{forged.inputs.pop();});
 await rejectMarker(forged=>{delete (forged as Partial<PositiveMarker>).dependencies;});
 for(const side of ['original','copied'] as const){
  await rejectMarker(forged=>{delete (forged.dependencies as Partial<PositiveMarker['dependencies']>)[side];});
  await rejectMarker(forged=>{forged.dependencies[side][0]!.rootIdentity.inode++;});
  await rejectMarker(forged=>{const entry=forged.dependencies[side][0]!.entries.find(entry=>entry.path===payload);assert(entry&&entry.type==='file');entry.sha256='sha256:'+'0'.repeat(64);});
  await rejectMarker(forged=>{forged.dependencies[side][1]!.entries.pop();});
 }
 assert.deepEqual((await copied.inspectEvidence()).current,audit.current);await recovery();
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Every original installed byte/type/mode/link/path remains unchanged');
 sameTrees(owners.map(owner=>installedTree(c.root,owner)),copiedDependencies,'Every copied immutable installation entry restored exactly');
 // A dependency guard failure still removes only its independently proved
 // disposable copy. The first copy's sentinel and both originals survive.
 const damaged=await HarnessCopy.create(true);
 try{
  assert.equal(dirname(damaged.directory),realpathSync(resolve(packageRoot,'node_modules/.cache')),'Damaged private copy retains the project cache parent');
  assert.notEqual(damaged.directory,c.directory,'Private copies remain distinct sibling fixtures');
  await damaged.preparePositive();const file=resolve(damaged.storage,'node_modules',payload);
  writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\ncleanup dependency refusal\n')]));
  await installedCloseSettlement(damaged,async()=>{
   await assert.rejects(()=>damaged.close(),/Harness copy guards and independently proved cleanup failed/);assert.equal(existsSync(damaged.directory),false);
  });
 }finally{if(existsSync(damaged.directory))await damaged.close();}
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Original installation census survives failed-copy cleanup');await dependencyRecovery();

 // All preceding controls restore the initial quarantined installation. The
 // next operation is the unchanged real copied build, with no runner dispatch.
 const originalCache=()=>{
  const entries:unknown[]=[];let ownFixtureExclusions=0;
  const walk=(file:string)=>{
   // This exact proved fixture is deliberately under the original cache;
   // its copied build output changes. Every original and sibling path remains.
   if(file===c.directory){assert.equal(realpathSync(file),c.directory);assert.equal(dirname(file),resolve(packageRoot,'node_modules/.cache'));ownFixtureExclusions++;return;}
   const stat=lstatSync(file),path=relative(packageRoot,file),mode=stat.mode&0o7777;
   if(stat.isSymbolicLink())entries.push({path,mode,type:'link',target:readlinkSync(file)});
   else if(stat.isDirectory()){entries.push({path,mode,type:'directory'});for(const name of readdirSync(file).sort())walk(resolve(file,name));}
   else{assert(stat.isFile());const bytes=readFileSync(file);entries.push({path,mode,type:'file',bytes:bytes.length,sha256:digest(bytes)});}
  };
  if(existsSync(resolve(packageRoot,'node_modules/.cache')))walk(resolve(packageRoot,'node_modules/.cache'));
  assert.equal(ownFixtureExclusions,1,'Only the current owned fixture is excluded from original cache preservation');
  return digest(JSON.stringify(entries));
 };
 const originalCacheDigest=originalCache(),originalSpawn=childProcess.spawn;
 const spawnActual=originalSpawn as (file:string,argv:readonly string[],options?:SpawnOptions)=>ChildProcess;
 let preflightSpawns=0;
 try{
  childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{preflightSpawns++;return spawnActual(file,argv,options);}) as unknown as typeof childProcess.spawn;
  syncBuiltinESMExports();
  const modules=resolve(c.storage,'node_modules/.modules.yaml'),saved=initialMetadata.get('.modules.yaml')!;
  try{
   writeFileSync(modules,Buffer.concat([saved.bytes,Buffer.from('storageExtraField: true\n')]));
   await assert.rejects(()=>c.runAsync('positive-mutated-preflight','scripts/build.mjs'),'Mutated installation refuses before actual spawn');
  }finally{writeFileSync(modules,saved.bytes);chmodSync(modules,saved.mode);}
  assert.deepEqual(readFileSync(markerPath),markerBytes,'Rejected preflight cannot advance the owner marker');
  await assert.rejects(()=>c.runAsync('positive-build-extra-argument','scripts/build.mjs',['extra']),/exact standalone build operation/);
  for(const args of [[],['delivery-evidence','extra'],['unknown']] as string[][])await assert.rejects(()=>c.runAsync('positive-checker-closed-arguments','scripts/check-component.mjs',args),'Prepared checker requires exactly one known component');
  for(const badClock of [-1,NaN]){
   const now=Date.now;
   try{Date.now=()=>badClock;await assert.rejects(()=>c.runAsync('positive-invalid-start-clock','scripts/build.mjs'),/Native copied-build start clock/);}
   finally{Date.now=now;}
  }
  assert.equal(preflightSpawns,0,'Bad inputs, extra CLI and invalid clocks must refuse before actual spawn');
  assert.deepEqual(readFileSync(markerPath),markerBytes,'No preflight failure adopts metadata');
 }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
 await recovery();
 const stale=c.put('node_modules/.cache/storage-build/positive-stale','must be cleared by the actual copied build');
 const startedMs=Date.now(),built=await c.runAsync('positive-fresh-build','scripts/build.mjs'),finishedMs=Date.now();
 assert.equal(built.status,0,built.stderr);assert.equal(built.signal,null);assert.equal(built.stderr,'');assert(built.identity);
 assert(built.identity.pid>0);assert.equal(built.identity.ppid,process.pid);assert(built.identity.birth);
 assert.equal(built.identity.command,[process.execPath,resolve(c.storage,'scripts/build.mjs')].join(' '));
 const buildRows=original.records(Buffer.from(built.stdout)).filter((row:{measurement?:string})=>row.measurement==='strict-build');
 assert.equal(buildRows.length,1,'Exactly one actual copied strict-build emission');
 assert.deepEqual(buildRows[0],{measurement:'strict-build',sourceAndTests:true,node:'v22.22.3',pins:{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'},dependencyLockDigest:digest(readFileSync(resolve(c.storage,'pnpm-lock.yaml'))),cacheCleared:true,install:'offline/frozen/ignore-scripts'});
 assert.equal(existsSync(stale),false,'Actual copied build clears private stale emission');
 for(const file of ['src/schema','src/owners','tests/contracts.test','tests/components/harness-build.component.test'])for(const suffix of ['.js','.d.ts','.js.map']){
  const output=resolve(c.cache,'g1-storage',file+suffix),stat=lstatSync(output);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal(stat.uid,process.getuid?.());assert(readFileSync(output).length>0);
 }
 for(const file of ['g1-model/tests/helpers/process-fixture','g1-local/src/client','g1-local/src/contracts','g1-local/src/errors'])for(const suffix of ['.js','.d.ts','.js.map']){
  const output=resolve(c.cache,file+suffix),stat=lstatSync(output);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal(stat.uid,process.getuid?.());assert(readFileSync(output).length>0);
 }
 const processFixture=await import(pathToFileURL(resolve(c.cache,'g1-model/tests/helpers/process-fixture.js')).href) as typeof import('../../../g1-model/tests/helpers/process-fixture.js');
 assert(processFixture.census().some(row=>row.pid===process.pid),'Actual relocated process fixture imports and performs the current census');
 const restoreIntegrity=await import(pathToFileURL(resolve(c.cache,'g1-storage/tests/helpers/verify-restore-integrity.js')).href) as typeof import('./verify-restore-integrity.js');
 assert.equal(typeof restoreIntegrity.registerVerifyRestoreIntegrityTests,'function','Actual relocated restore integrity module imports its complete runtime closure');
 const {LocalClient,ClientTransportError}=await import(pathToFileURL(resolve(c.cache,'g1-local/src/client.js')).href) as typeof import('../../../g1-local/src/client.js');
 const {LocalError}=await import(pathToFileURL(resolve(c.cache,'g1-local/src/errors.js')).href) as typeof import('../../../g1-local/src/errors.js');
 let fetchCalls=0;
 const client=new LocalClient('http://127.0.0.1:1',{fetch:async()=>{fetchCalls++;throw new Error('Relocated refusal must not fetch');}});
 client.disconnect();
 await assert.rejects(()=>client.health(),error=>error instanceof ClientTransportError&&error.code==='NOT_DELIVERED');
 await assert.rejects(()=>client.login({} as never),error=>error instanceof LocalError&&error.code==='INVALID_SCHEMA');
 assert.equal(fetchCalls,0,'Actual relocated client/contract/error refusals never dispatch a request');
 const admittedBytes=readFileSync(markerPath),admitted=JSON.parse(admittedBytes.toString()) as PositiveMarker;
 const postInstalled=owners.map(owner=>installedTree(c.root,owner));
 const maskFive=(trees:InstalledTree[]):InstalledTree[]=>{
  const masked=JSON.parse(JSON.stringify(trees)) as InstalledTree[];
  for(const tree of masked)for(const entry of tree.entries)if(tree.owner==='g1-storage'&&installationMetadataPaths.includes(entry.path)){
   assert.equal(entry.type,'file');if(entry.type==='file'){entry.bytes=0;entry.sha256='';}
  }
  return masked;
 };
 const immutableMarker=(value:PositiveMarker)=>({...value,dependencies:{...value.dependencies,copied:maskFive(value.dependencies.copied)}});
 assert.equal(digest(JSON.stringify(immutableMarker(admitted))),digest(JSON.stringify(immutableMarker(marker))),'Only five copied file byte counts/hashes may advance; every other marker field stays exact');
 sameTrees(admitted.dependencies.original,originalDependencies,'Admitted marker preserves every original installed entry');
 sameTrees(admitted.dependencies.copied,postInstalled,'Admitted destination hashes bind actual current installed bytes');
 sameTrees(maskFive(postInstalled),maskFive(copiedDependencies),'Every immutable copied mode/type/link/path/payload stays unchanged');
 const observedState=copied.assertStorageInstallationMetadata(c.root,c.root,{originRoot:repository,startedMs,finishedMs,previous:{prunedAt:initialMetadata.get('.modules.yaml')!.bytes.toString().match(/^prunedAt: (.+)$/m)![1],lastValidatedTimestamp:JSON.parse(initialMetadata.get('.pnpm-workspace-state-v1.json')!.bytes.toString()).lastValidatedTimestamp}});
 assert.deepEqual(observedState.paths,installationMetadataPaths);
 for(const path of installationMetadataPaths){
  const entry=admitted.dependencies.copied[0]!.entries.find(entry=>entry.path===path);assert(entry&&entry.type==='file');
  const bytes=readFileSync(resolve(c.storage,'node_modules',path));assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,digest(bytes));
  if(path.startsWith('.bin/')){
   assert.notDeepEqual(bytes,initialMetadata.get(path)!.bytes,'Actual build regenerates the relocated shim: '+path);
   assert.deepEqual(bytes,Buffer.from(initialMetadata.get(path)!.bytes.toString().replaceAll(repository+'/g1-storage/node_modules',c.storage+'/node_modules')),'Exact unchanged pnpm copy-local shim: '+path);
  }
 }
 await recovery();assert.equal(originalCache(),originalCacheDigest,'Copied build preserves original emissions/cache');
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Copied build preserves every original installed entry');

 const postRefusal=async(label:string,path:string,mutate:(file:string)=>void,forge=false,checkCopied=true)=>{
  const file=resolve(c.storage,'node_modules',path),stat=lstatSync(file),mode=stat.mode&0o7777;
  const bytes=stat.isFile()?readFileSync(file):undefined,target=stat.isSymbolicLink()?readlinkSync(file):undefined;
  try{
   mutate(file);
   if(forge){
    const forged=JSON.parse(admittedBytes.toString()) as PositiveMarker,entry=forged.dependencies.copied[0]!.entries.find(entry=>entry.path===path);assert(entry);
    const changed=lstatSync(file);entry.mode=changed.mode&0o7777;
    if(entry.type==='file'){assert(changed.isFile());const current=readFileSync(file);entry.bytes=current.length;entry.sha256=digest(current);}
    else if(entry.type==='link'){assert(changed.isSymbolicLink());entry.target=readlinkSync(file);entry.resolved=relative(resolve(c.storage,'node_modules'),realpathSync(file));}
    writeFileSync(markerPath,JSON.stringify(forged));
   }
   await assert.rejects(()=>c.assertPositive(),label);if(checkCopied)await assert.rejects(()=>copied.evidenceOrigin(),label);
  }finally{
   rmSync(file,{force:true});if(target!==undefined)symlinkSync(target,file);else{assert(bytes);writeFileSync(file,bytes,{mode});chmodSync(file,mode);}
   writeFileSync(markerPath,admittedBytes);chmodSync(markerPath,0o600);
  }
  assert.deepEqual(readFileSync(markerPath),admittedBytes,'Exact admitted marker restored after '+label);
  if(bytes)assert.deepEqual(readFileSync(file),bytes);else assert.equal(readlinkSync(file),target);
  assert.equal(lstatSync(file).mode&0o7777,mode);
 };
 const postModules=(file:string)=>rewriteMetadata(file,source=>source.replace(/^prunedAt: .+$/m,'prunedAt: Thu, 01 Jan 1970 00:00:00 GMT'));
 const postWorkspace=(file:string)=>rewriteWorkspace(file,data=>{data.lastValidatedTimestamp=1;});
 await postRefusal('Modules timestamp cannot mutate outside the admitted build','.modules.yaml',postModules);
 await postRefusal('Workspace timestamp cannot mutate outside the admitted build','.pnpm-workspace-state-v1.json',postWorkspace);
 await postRefusal('Admitted storage shim cannot return to original NODE_PATH','.bin/tsc',file=>replaceMetadata(file,c.storage+'/node_modules',repository+'/g1-storage/node_modules'));
 await postRefusal('Admitted storage shim cannot use foreign NODE_PATH','.bin/tsserver',file=>replaceMetadata(file,c.storage+'/node_modules',resolve(c.directory,'foreign-node-modules')));
 const changePayload=(file:string)=>rewriteMetadata(file,source=>source+'\n// changed admitted immutable payload\n');
 const changeLink=retarget(typeRoot),changeMode=(file:string)=>chmodSync(file,(lstatSync(file).mode&0o7777)^0o100);
 await postRefusal('Admitted immutable payload bytes remain protected',payload,changePayload);
 await postRefusal('Admitted immutable package links remain protected','pg',changeLink);
 await postRefusal('Admitted immutable payload modes remain protected',payload,changeMode);
 const extraPayload=resolve(c.storage,'node_modules',typeRoot,'lib/admitted-extra.js');assert(!existsSync(extraPayload));
 try{writeFileSync(extraPayload,'unbound admitted installed path\n');await assert.rejects(()=>c.assertPositive(),'Admitted installed path census is closed');await assert.rejects(()=>copied.evidenceOrigin(),'Admitted reader installed path census is closed');}
 finally{rmSync(extraPayload,{force:true});}
 await postRefusal('Matching marker payload hash cannot adopt immutable bytes',payload,changePayload,true);
 await postRefusal('Matching marker link census cannot adopt altered targets','pg',changeLink,true);
 // D binds closed current metadata; a marker alone proves no build chronology.
 // The live parent must refuse even valid native output with a forged new hash.
 await postRefusal('Matching marker timestamp cannot advance the live parent','.pnpm-workspace-state-v1.json',postWorkspace,true,false);
 const forgedOriginal=JSON.parse(admittedBytes.toString()) as PositiveMarker;
 const originalShim=forgedOriginal.dependencies.original[0]!.entries.find(entry=>entry.path==='.bin/tsc'),copyShim=admitted.dependencies.copied[0]!.entries.find(entry=>entry.path==='.bin/tsc');
 assert(originalShim&&originalShim.type==='file'&&copyShim&&copyShim.type==='file');originalShim.bytes=copyShim.bytes;originalShim.sha256=copyShim.sha256;
 try{writeFileSync(markerPath,JSON.stringify(forgedOriginal));await assert.rejects(()=>c.assertPositive(),'Original installed hashes cannot advance');await assert.rejects(()=>copied.evidenceOrigin(),'Copied reader independently protects actual original hashes');}
 finally{writeFileSync(markerPath,admittedBytes);chmodSync(markerPath,0o600);}
 await recovery();assert.deepEqual((await copied.inspectEvidence()).current,audit.current,'A real private build never promotes historical controller results or candidate provenance');
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Original payload/link/mode/path census survives admitted mutation refusals');
 sameTrees(owners.map(owner=>installedTree(c.root,owner)),postInstalled,'Exact admitted installation is recovered after all mutation refusals');
 assert.equal(originalCache(),originalCacheDigest,'Source cache survives admitted mutation refusals');assert.deepEqual(readFileSync(siblingPath),siblingBytes);
 for(const {path,bytes,mode} of sourceSentinels)for(const root of [packageRoot,c.storage]){assert.deepEqual(readFileSync(resolve(root,path)),bytes);assert.equal(lstatSync(resolve(root,path)).mode&0o7777,mode);}

 // The prepared checker builds once through its unchanged public CLI. Its
 // copied runner admits the five private outputs before importing real D02/D06;
 // the parent independently binds those outputs after the child fully settles.
 const checkerPrevious={prunedAt:observedState.prunedAt,lastValidatedTimestamp:observedState.lastValidatedTimestamp};
 const capabilityKeys=['STORAGE_REPO_ROOT','STORAGE_DATABASE_URL','MODEL_DATABASE_URL','IDENTITY_OWNER_ROOT','FABRIC_OWNER','HARNESS_CHILD','HARNESS_CHILD_NONCE','LOOP_PROJECT','NODE_TEST_CONTEXT','NODE_OPTIONS','NODE_PATH','NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE'];
 const capabilityValues=new Map(capabilityKeys.map(key=>[key,process.env[key]]));
 const checkerSpawn=childProcess.spawn;
 childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
  assert.equal(file,process.execPath);assert.deepEqual(argv,[resolve(c.storage,'scripts/check-component.mjs'),'delivery-evidence']);
  return checkerSpawn(file,argv,{...options,env:{...options?.env,DOCKER_HOST:'unix://'+resolve(c.directory,'missing-docker.sock')}});
 }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
 const checkerStartedMs=Date.now();let checked:Awaited<ReturnType<HarnessCopy['runAsync']>>;
 try{
  for(const key of capabilityKeys)process.env[key]=key==='NODE_OPTIONS'?'--require='+resolve(c.directory,'never-load-outer-node-options.cjs'):'outer-capability-'+key;
  checked=await c.runAsync('positive-copied-delivery-evidence','scripts/check-component.mjs',['delivery-evidence']);
 }finally{childProcess.spawn=checkerSpawn;syncBuiltinESMExports();for(const [key,value] of capabilityValues)if(value===undefined)delete process.env[key];else process.env[key]=value;}
 const checkerFinishedMs=Date.now();
 assert.equal(checked.status,0,checked.stderr);assert.equal(checked.signal,null);assert.equal(checked.stderr,'');assert(checked.identity);
 const checkerCommand=[process.execPath,resolve(c.storage,'scripts/check-component.mjs'),'delivery-evidence'].join(' ');
 assert(checked.identity.pid>0);assert.equal(checked.identity.ppid,process.pid);assert(checked.identity.birth);assert.equal(checked.identity.command,checkerCommand);
 const checkerRows=original.records(Buffer.from(checked.stdout)),checkerOuter=original.outerRecords(checkerRows);
 const checkerBuilds=checkerOuter.filter((row:{measurement?:string})=>row.measurement==='strict-build');
 assert.equal(checkerBuilds.length,1,'Copied checker performs exactly one actual fresh build');assert.deepEqual(checkerBuilds[0],buildRows[0]);
 const checkerCandidates=checkerOuter.filter((row:{measurement?:string})=>row.measurement==='storage-candidate');
 assert.equal(checkerCandidates.length,1);assert.equal(checkerCandidates[0].digest,marker.candidate.digest);assert.equal(checkerCandidates[0].files,marker.candidate.files);assert.equal(checkerCandidates[0].diagnosticOnly,true);
 const checkerReports=checkerOuter.filter((row:{measurement?:string})=>row.measurement==='storage-test-report');
 assert.equal(checkerReports.length,1);const checkerReport=checkerReports[0];assert.equal(checkerReport.scope,'component');assert.equal(checkerReport.diagnosticOnly,true);assert.equal(checkerReport.externalQualification,'pending');assert.equal(checkerReport.reports.length,1);
 const component=copied.deliveryEvidenceComponent,report=checkerReport.reports[0];
 assert.equal(component.integration,false);assert.equal(component.positives,null);assert.equal(report.suite,'delivery-evidence');assert.equal(report.tests,9);assert.equal(report.cases.length,2);assert.equal(report.variants.length,7);assert.equal(report.executions.length,9);assert.equal(report.observations,null);
 assert.deepEqual(report.variants,Object.values(component.variants).flat());
 for(const [index,id] of (component.cases as string[]).entries()){
  const name=report.cases[index];assert(typeof name==='string'&&(name===id||name.startsWith(id+' / ')));
  const executions=report.executions.filter((execution:{parent:string|null;indent:number})=>execution.indent===4&&execution.parent===name);
  assert.deepEqual(executions.map((execution:{name:string})=>execution.name),component.variants[id]);
  assert.deepEqual(executions.map((execution:{number:number})=>execution.number),component.variants[id].map((_:string,leaf:number)=>leaf+1));
 }
 assert.deepEqual(report.executions.filter((execution:{indent:number})=>execution.indent===0).map((execution:{name:string;number:number;parent:string|null})=>({name:execution.name,number:execution.number,parent:execution.parent})),report.cases.map((name:string,index:number)=>({name,number:index+1,parent:null})));
 for(const key of ['fail','cancelled','skipped','todo'])assert.equal(report[key],0,key);
 const dispatches=checkerOuter.filter((row:{measurement?:string})=>row.measurement==='storage-suite-dispatch');assert.equal(dispatches.length,1);
 assert.equal(dispatches[0].file,resolve(c.cache,'g1-storage/tests',component.file));assert.equal(dispatches[0].status,0);assert.equal(dispatches[0].signal,null);assert.equal(dispatches[0].error,null);assert.equal(dispatches[0].explicitTimeoutMs,null);
 const commands=checkerOuter.filter((row:{measurement?:string;kind?:string;binding?:{phase?:string}})=>row.measurement==='storage-measurement-transport'&&row.kind==='start'&&row.binding?.phase==='command');assert.equal(commands.length,2);
 for(const row of commands){assert.equal(row.binding.candidate,marker.candidate.digest);assert.deepEqual(row.binding.command,{executable:process.execPath,args:[resolve(c.storage,'scripts/check-component.mjs'),'delivery-evidence'],cwd:c.root});}
 const checkerTransport=await import(pathToFileURL(resolve(packageRoot,'scripts/measurement-transport.mjs')).href);
 const checkerFrames=checkerOuter.filter((row:{measurement?:string})=>row.measurement==='storage-measurement-transport'),checkerDecoded=[];
 for(let index=0;index<checkerFrames.length;){const header=checkerFrames[index],count=header.count+2;
  const decoded=checkerTransport.decodeMeasurement(checkerFrames.slice(index,index+count),header.binding);
  assert.equal(digest(decoded.raw),header.digest);checkerDecoded.push(decoded.record);index+=count;
 }
 const checkerCommandCensuses=checkerDecoded.filter(row=>row.phase==='command');assert.equal(checkerCommandCensuses.length,2);
 assert.deepEqual(checkerCommandCensuses.map(row=>row.measurement),['storage-parent-start','storage-parent-return']);
 for(const census of [checkerCommandCensuses[0].before,checkerCommandCensuses[1].before,checkerCommandCensuses[1].after]){
  assert(census.processBytes.trim().length>0);assert.equal(digest(census.processBytes),census.processDigest);assert.deepEqual(census.processes,census.processBytes.trimEnd().split('\n'));
  assert.equal(census.containerBytes,null);assert.equal(census.containers,null);assert.equal(census.containerDigest,null);
  assert.equal(census.containerObservation.status,'unknown');assert.equal(census.containerObservation.qualified,false);
  assert.equal(census.containerObservation.exitStatus,1);assert.equal(census.containerObservation.signal,null);assert.equal(census.containerObservation.error,null);
  assert.equal(census.containerObservation.stdout,'');assert.match(census.containerObservation.stderr,/missing-docker\.sock/);assert.match(census.containerObservation.diagnostic,/Docker census unavailable/);
 }
 const returned=checkerOuter.filter((row:{measurement?:string;phase?:string})=>row.measurement==='storage-parent-return'&&row.phase==='command');assert.equal(returned.length,1);assert.equal(returned[0].mode,'component');assert.equal(returned[0].candidate,marker.candidate.digest);assert.equal(returned[0].success,true);
 const assertions=checkerRows.filter((row:{measurement?:string})=>row.measurement==='delivery-evidence-assertions');assert.equal(assertions.length,1);assert.equal(original.recordContext(assertions[0]).depth,1);
 assert.equal(assertions[0].candidate,marker.candidate.digest);assert.equal(assertions[0].controllerFingerprint,marker.controllerFingerprint);assert.equal(assertions[0].qualification.authorVerdict,false);assert.equal(assertions[0].qualification.externalQualification,'pending');assert.equal(assertions[0].wholeHostReaped,false);
 const checkerBytes=readFileSync(markerPath),checkerMarker=JSON.parse(checkerBytes.toString()) as PositiveMarker;
 assert.equal(digest(JSON.stringify(immutableMarker(checkerMarker))),digest(JSON.stringify(immutableMarker(admitted))),'Checker may advance only five private hashes; source/origin/fingerprint/roots/originals remain exact');
 const checkerInstalled=owners.map(owner=>installedTree(c.root,owner));
 sameTrees(checkerMarker.dependencies.original,originalDependencies,'Copied checker retains every original dependency binding');
 sameTrees(checkerMarker.dependencies.copied,checkerInstalled,'Copied checker marker binds every actual private installed byte/type/mode/link/path');
 sameTrees(maskFive(checkerInstalled),maskFive(postInstalled),'Copied checker retains every immutable private installed entry');
 const checkerState=copied.assertStorageInstallationMetadata(c.root,c.root,{originRoot:repository,startedMs:checkerStartedMs,finishedMs:checkerFinishedMs,previous:checkerPrevious});assert.deepEqual(checkerState.paths,installationMetadataPaths);
 await recovery();
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Actual copied D preserves every original installed entry');
 assert.equal(originalCache(),originalCacheDigest,'Actual copied D preserves original emissions/cache');assert.deepEqual(readFileSync(siblingPath),siblingBytes);

 // The existing spawn seam changes only owned reproducible metadata after
 // parent preflight. The actual copied runner must refuse before building or
 // importing D; the failed operation cannot admit even matching marker bytes.
 const modulesPath=resolve(c.storage,'node_modules/.modules.yaml'),modulesBytes=readFileSync(modulesPath),modulesMode=lstatSync(modulesPath).mode&0o7777;
 let poisonedSpawns=0,checkerFailure:unknown;
 try{
  childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
   assert.equal(file,process.execPath);assert.deepEqual(argv,[resolve(c.storage,'scripts/check-component.mjs'),'delivery-evidence']);
   poisonedSpawns++;writeFileSync(modulesPath,Buffer.concat([modulesBytes,Buffer.from('storageExtraField: true\n')]));return spawnActual(file,argv,options);
  }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
  try{await c.runAsync('positive-copied-runner-mutated-input','scripts/check-component.mjs',['delivery-evidence']);}catch(error){checkerFailure=error;}
  assert.equal(poisonedSpawns,1,'Actual copied checker must launch after parent preflight');assert(checkerFailure instanceof AggregateError);
  const result=(checkerFailure as AggregateError & {result:Awaited<ReturnType<HarnessCopy['runAsync']>>}).result;assert(result);assert.equal(result.status,1);assert.equal(result.signal,null);assert(result.identity);assert.equal(result.identity.ppid,process.pid);assert(result.identity.birth);assert.equal(result.identity.command,checkerCommand);
  assert.match(result.stderr,/Captured installed owner changed|metadata|closure/i);assert.doesNotMatch(result.stdout,/strict-build|storage-test-report|delivery-evidence-assertions|TAP version 13/);
  assert.deepEqual(readFileSync(markerPath),checkerBytes,'Failed copied runner cannot advance any owner field');
 }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();writeFileSync(modulesPath,modulesBytes);chmodSync(modulesPath,modulesMode);}
 assert.deepEqual(readFileSync(markerPath),checkerBytes);assert.deepEqual(readFileSync(modulesPath),modulesBytes);assert.equal(lstatSync(modulesPath).mode&0o7777,modulesMode);
 await recovery();
 sameTrees(owners.map(owner=>installedTree(c.root,owner)),checkerInstalled,'Fresh full private census recovers the exact admitted checker installation');
 sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Original installations survive actual child refusal/recovery');
 assert.equal(originalCache(),originalCacheDigest);assert.deepEqual(readFileSync(siblingPath),siblingBytes);
 for(const {path,bytes,mode} of sourceSentinels)for(const root of [packageRoot,c.storage]){assert.deepEqual(readFileSync(resolve(root,path)),bytes);assert.equal(lstatSync(resolve(root,path)).mode&0o7777,mode);}
 // The useful copied build/D control above precedes actual private-entry
 // capability refusals. Neither seam changes copied source or plants a driver.
 for(const fault of ['intended-operation','uuid-downgrade','prestart-cancellation'] as const){
  const beforeMarker=readFileSync(markerPath),startedChildren:ChildProcess[]=[],cancelledStarts:{nonce:string;identity:unknown}[]=[];let launches=0,alteredStarts=0,failed:unknown,nativeClosed=false;
  try{
   childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
    assert.equal(file,process.execPath);assert.equal(argv[0],resolve(c.storage,'scripts/runner.mjs'));assert.match(argv[1]!,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.equal(argv.length,2);
    launches++;if(fault==='uuid-downgrade')writeFileSync(markerPath,c.owner);
    const child=spawnActual(file,argv,options);startedChildren.push(child);child.once('close',()=>{nativeClosed=true;});
    if(fault!=='uuid-downgrade'){
     const send=child.send as (...args:unknown[])=>boolean;
     child.send=((message:unknown,...args:unknown[])=>{
      if(typeof message==='object'&&message!==null&&(message as {type?:string}).type==='harness-prerequisite-start'){
       alteredStarts++;
       if(fault==='intended-operation')message={...message,operation:'foreign-operation'};
       else{
        const start=message as {nonce:string;identity:unknown};
        assert.deepEqual(message,{type:'harness-prerequisite-start',operation:'harness-prerequisite',nonce:argv[1],owner:c.owner,root:c.root,markerSha256:digest(beforeMarker),identity:start.identity},'Prestart cancellation substitutes only the actual exact current intended-operation message');
        cancelledStarts.push({nonce:start.nonce,identity:start.identity});
        message={type:'harness-prerequisite-cancel',operation:'harness-prerequisite',nonce:argv[1],owner:c.owner};
       }
      }
      return Reflect.apply(send,child,[message,...args]);
     }) as typeof child.send;
    }
    return child;
   }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
   try{await c.runHarnessPrerequisite('positive-private-'+fault+'-refused');}catch(error){failed=error;}
   assert.equal(launches,1);assert.equal(alteredStarts,fault!=='uuid-downgrade'?1:0);assert(failed instanceof AggregateError);
   const result=(failed as AggregateError & {result:Awaited<ReturnType<HarnessCopy['runHarnessPrerequisite']>>}).result;
   assert(result);assert.equal(result.status,1);assert.equal(result.signal,null);assert(result.nonce);
   assert.equal(startedChildren.length,1);assert(startedChildren[0]!.pid);assert.equal(startedChildren[0]!.exitCode,1);assert.equal(startedChildren[0]!.signalCode,null);assert.equal(nativeClosed,true,'Actual intercepted child close settles before refusal result');
   if(fault!=='uuid-downgrade')assert(result.identity,'Current private ready/start operation has an exact kernel proof');
   if(result.identity){assert.equal(result.identity.pid,startedChildren[0]!.pid);assert.equal(result.identity.ppid,process.pid);assert(result.identity.birth);assert.equal(result.identity.command,[process.execPath,resolve(c.storage,'scripts/runner.mjs'),result.nonce].join(' '));}
   if(fault==='prestart-cancellation'){assert.equal(cancelledStarts.length,1,'The actual attempted start is replaced by current cancellation exactly once');assert.deepEqual(cancelledStarts[0],{nonce:result.nonce,identity:result.identity},'The substituted start retains the actual nonce-bound current child identity');}
   else assert.equal(cancelledStarts.length,0);
   assert.match(result.stderr,fault==='intended-operation'?/Exact current private intended operation required/:fault==='uuid-downgrade'?/Private prerequisite refuses positive owner UUID downgrade/:/Current private prerequisite cancelled before intended-operation start/);
   assert.doesNotMatch(result.stdout,/strict-build|storage-candidate|storage-test-report|TAP version 13|harness-prerequisite-dispatch/);
  }finally{
   childProcess.spawn=originalSpawn;syncBuiltinESMExports();if(fault==='uuid-downgrade')writeFileSync(markerPath,beforeMarker);
  }
  assert.deepEqual(readFileSync(markerPath),beforeMarker,'Refused operation never advances owner metadata');
  await recovery();await assert.rejects(()=>c.cancelHarnessPrerequisite(),'Settled private operation has no retained cancellation capability');
  sameTrees(owners.map(owner=>installedTree(c.root,owner)),checkerInstalled,'Fresh full private census after private '+fault+' refusal');
  sameTrees(owners.map(owner=>installedTree(repository,owner)),originalDependencies,'Fresh full original census after private '+fault+' refusal');
  assert.equal(originalCache(),originalCacheDigest);assert.deepEqual(readFileSync(siblingPath),siblingBytes);
  for(const {path,bytes,mode} of sourceSentinels)for(const root of [packageRoot,c.storage]){assert.deepEqual(readFileSync(resolve(root,path)),bytes);assert.equal(lstatSync(resolve(root,path)).mode&0o7777,mode);}
 }
}

export async function harnessRegistration(){
 const gate=await import(pathToFileURL(resolve(packageRoot,'scripts/harness-build-registration.mjs')).href);
 const bytes=readFileSync(resolve(packageRoot,'scripts/manifest.mjs'),'utf8');
 assert.equal(gate.assertHarnessBuildRegistration().onlyPinChanged,'scripts/manifest.mjs');
 for(const b of [bytes+'\n',bytes.replace('"C01/roundtrip"','"C01/forged"'),bytes.replace('"harness-build":','"fake-build":')])assert.throws(()=>gate.assertHarnessBuildAdditiveRegistry(b));
 const {suites}=await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href);
 const required=JSON.parse(readFileSync(resolve(packageRoot,'verification/required-variants-v1.json'),'utf8'));
 assert.deepEqual(suites.harness.variants.H02,required.cases.H02);
 assert.equal(suites.harness.variants.H02.includes('H02/good-full-run'),true);
}

/** These exact assertions serve diagnostic and full H01 entry points. */
export async function harnessBuildSchedules(t:TestContext,prefix='H01'){
 await t.test(prefix+'/fresh-build',async()=>{
  const metadataReader=await import(pathToFileURL(resolve(packageRoot,'scripts/delivery-evidence.mjs')).href);
  await copy(async c=>{
  const sentinel=c.put('node_modules/.cache/storage-build/stale','old emission');
  // This first copy stays unprepared: only its two existing unchanged children
  // execute. Observing metadata here grants no positive marker/dispatch owner.
  const owners:InstalledOwner[]=['g1-storage','g1-recovery'];
  const metadataPaths=['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'];
  const originTrees=owners.map(owner=>installedTree(repository,owner)),initialTrees=owners.map(owner=>installedTree(c.root,owner));
  const sameTrees=(actual:InstalledTree[],expected:InstalledTree[],message:string)=>assert.equal(digest(JSON.stringify(actual)),digest(JSON.stringify(expected)),message);
  const immutableShape=(tree:InstalledTree)=>({...tree,entries:tree.entries.map(entry=>{
   if(tree.owner==='g1-storage'&&metadataPaths.includes(entry.path)){
    assert.equal(entry.type,'file','Only the literal five regular storage files can regenerate');return {path:entry.path,type:entry.type,mode:entry.mode};
   }return entry;
  })});
  const initialShape=initialTrees.map(immutableShape);
  const sourceCensus=(root:string)=>{
   const entries:{path:string;mode:number;type:'directory'|'file';bytes?:number;sha256?:string}[]=[];
   const walk=(directory:string)=>{for(const name of readdirSync(directory).sort()){
    if(name==='node_modules')continue;const file=resolve(directory,name),s=lstatSync(file),path=relative(root,file),mode=s.mode&0o7777;
    assert(!s.isSymbolicLink(),'Only regular owned source inputs: '+path);
    if(s.isDirectory()){entries.push({path,mode,type:'directory'});walk(file);}else{assert(s.isFile()&&s.nlink===1,path);const bytes=readFileSync(file);entries.push({path,mode,type:'file',bytes:bytes.length,sha256:digest(bytes)});}
   }};walk(root);return entries;
  };
  const privateSources=sourceCensus(c.root),originalStorageSources=sourceCensus(packageRoot);
  const originalSourceFiles=privateSources.filter(entry=>entry.type==='file').map(entry=>{
   const file=resolve(repository,entry.path),s=lstatSync(file),bytes=readFileSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,entry.path);
   return {path:entry.path,mode:s.mode&0o7777,bytes:bytes.length,sha256:digest(bytes)};
  });
  const siblingPath=resolve(c.root,'node_modules/.cache/sibling-sentinel'),siblingBytes=readFileSync(siblingPath),ownerBytes=readFileSync(resolve(c.directory,'owner'));
  const initialMetadata=new Map(metadataPaths.map(path=>{
   const source=resolve(packageRoot,'node_modules',path),owned=resolve(c.storage,'node_modules',path),s=lstatSync(source),bytes=readFileSync(source),mode=s.mode&0o7777;
   assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,path);assert.deepEqual(readFileSync(owned),bytes,'Initial quarantined metadata equals original: '+path);assert.equal(lstatSync(owned).mode&0o7777,mode,path);
   return [path,{bytes,mode}] as const;
  }));
  const protectSources=()=>{
   assert.equal(digest(JSON.stringify(sourceCensus(c.root))),digest(JSON.stringify(privateSources)),'Whole private source tree stays unchanged');
   assert.equal(digest(JSON.stringify(sourceCensus(packageRoot))),digest(JSON.stringify(originalStorageSources)),'Whole original storage source tree stays unchanged');
   for(const entry of originalSourceFiles){const file=resolve(repository,entry.path),s=lstatSync(file),bytes=readFileSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,entry.path);assert.equal(s.mode&0o7777,entry.mode,entry.path);assert.equal(bytes.length,entry.bytes,entry.path);assert.equal(digest(bytes),entry.sha256,entry.path);}
   assert.deepEqual(readFileSync(siblingPath),siblingBytes,'Sibling cache survives actual install and controls');
   assert.deepEqual(readFileSync(resolve(c.directory,'owner')),ownerBytes,'Unprepared owner never advances or acquires positive fields');
  };
  const protectOriginalMetadata=()=>{for(const [path,{bytes,mode}] of initialMetadata){const file=resolve(packageRoot,'node_modules',path),s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,path);assert.deepEqual(readFileSync(file),bytes,'Original generated metadata stays unchanged: '+path);assert.equal(s.mode&0o7777,mode,path);}};
  const protectInstallations=(phase:string)=>{
   sameTrees(owners.map(owner=>installedTree(repository,owner)),originTrees,'Every original installed byte/mode/type/link/path survives '+phase);
   const current=owners.map(owner=>installedTree(c.root,owner));
   assert.equal(digest(JSON.stringify(current.map(immutableShape))),digest(JSON.stringify(initialShape)),'Only five copied storage file contents may regenerate: '+phase);
   sameTrees([current[1]!],[initialTrees[1]!],'Whole copied recovery installation stays immutable and its launchers uninvoked: '+phase);
   protectOriginalMetadata();protectSources();return current;
  };
  const initialState=metadataReader.assertStorageInstallationMetadata(repository);
  const firstPrevious={prunedAt:initialState.prunedAt,lastValidatedTimestamp:initialState.lastValidatedTimestamp};
  assert.deepEqual(metadataReader.assertStorageInstallationMetadata(c.root,repository),initialState,'Original-root shims are admitted only before the actual install');
  for(const [index,owner] of owners.entries())assert.equal(digest(JSON.stringify(initialTrees[index]!.entries)),digest(JSON.stringify(originTrees[index]!.entries)),'Complete initial private installed equality: '+owner);
  protectInstallations('before first unchanged child');
  const firstStartedMs=Date.now();
  const r=passed(await c.run('fresh-build','scripts/build.mjs'));
  const firstFinishedMs=Date.now(),firstWindow={originRoot:repository,startedMs:firstStartedMs,finishedMs:firstFinishedMs,previous:firstPrevious};
  const firstState=metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow);
  assert.deepEqual(firstState.paths,metadataPaths);
  for(const name of ['tsc','tsserver']){
   const original=initialMetadata.get('.bin/'+name)!.bytes.toString('utf8'),actual=readFileSync(resolve(c.storage,'node_modules/.bin',name),'utf8');
   assert.equal(actual,original.replaceAll(repository+'/g1-storage/node_modules',c.storage+'/node_modules'),'Actual pnpm install regenerates the exact copy-local pinned shim: '+name);assert.notEqual(actual,original);
  }
  assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,repository),'Original-root shim expectation refuses actual regenerated copy-local launchers');
  assert.deepEqual(metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),firstState,'Fresh valid first-window recovery after original-root expectation refusal');
  const firstInstalled=protectInstallations('after first unchanged child');
  const postBuildMetadata=new Map(metadataPaths.map(path=>{const file=resolve(c.storage,'node_modules',path);return [path,{bytes:readFileSync(file),mode:lstatSync(file).mode&0o7777}] as const;}));
  const recoverMetadata=()=>{
   assert.deepEqual(metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),firstState,'Fresh direct validator recovers the actual first build output');
   for(const [path,{bytes,mode}] of postBuildMetadata){const file=resolve(c.storage,'node_modules',path),s=lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,path);assert.deepEqual(readFileSync(file),bytes,'Exact postbuild metadata restoration: '+path);assert.equal(s.mode&0o7777,mode,path);}
   protectOriginalMetadata();assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(resolve(c.directory,'owner')),ownerBytes);
  };
  const rewrite=(file:string,change:(source:string)=>string)=>{const before=readFileSync(file,'utf8'),after=change(before);assert.notEqual(after,before,'Every malformed control must actually change bytes');writeFileSync(file,after);};
  const replace=(file:string,before:string,after:string)=>rewrite(file,source=>{assert(source.includes(before),'Actual postbuild mutation target required');return source.replaceAll(before,after);});
  const rejectMetadata=(label:string,path:string,mutate:(file:string)=>void)=>{
   const file=resolve(c.storage,'node_modules',path),saved=postBuildMetadata.get(path);assert(saved);
   try{mutate(file);assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),label);}
   finally{rmSync(file,{force:true});writeFileSync(file,saved.bytes,{mode:saved.mode});chmodSync(file,saved.mode);}recoverMetadata();
  };
  const invalidWindows:[string,unknown][]=[
   ['array copied-build window',[]],['missing copied-build window field',{originRoot:repository,startedMs:firstStartedMs,previous:firstPrevious}],
   ['extra copied-build window field',{...firstWindow,extra:true}],['relative original root',{...firstWindow,originRoot:'.'}],
   ['noncanonical original root',{...firstWindow,originRoot:repository+'/.'}],['copied root is not original',{...firstWindow,originRoot:c.root}],
   ['negative start',{...firstWindow,startedMs:-1}],['fractional start',{...firstWindow,startedMs:firstStartedMs+0.5}],
   ['unsafe start',{...firstWindow,startedMs:Number.MAX_SAFE_INTEGER+1}],['regressed build clock',{...firstWindow,finishedMs:firstStartedMs-1}],
   ['future settlement',{...firstWindow,finishedMs:Date.now()+3_600_000}],['nonfinite settlement',{...firstWindow,finishedMs:Infinity}],
   ['fractional settlement',{...firstWindow,finishedMs:firstFinishedMs+0.5}],['string start',{...firstWindow,startedMs:String(firstStartedMs)}],
   ['missing previous capture',{originRoot:repository,startedMs:firstStartedMs,finishedMs:firstFinishedMs}],
   ['array previous capture',{...firstWindow,previous:[]}],['extra previous field',{...firstWindow,previous:{...firstPrevious,extra:true}}],
   ['missing previous timestamp',{...firstWindow,previous:{prunedAt:firstPrevious.prunedAt}}],
   ['nonnative previous modules timestamp',{...firstWindow,previous:{...firstPrevious,prunedAt:'Tue, 02 Jan 2001 03:04:05.000 GMT'}}],
   ['inconsistent previous modules weekday',{...firstWindow,previous:{...firstPrevious,prunedAt:'Wed, 02 Jan 2001 03:04:05 GMT'}}],
   ['fractional previous milliseconds',{...firstWindow,previous:{...firstPrevious,lastValidatedTimestamp:0.5}}],
   ['nonfinite previous milliseconds',{...firstWindow,previous:{...firstPrevious,lastValidatedTimestamp:NaN}}],
   ['unsafe previous milliseconds',{...firstWindow,previous:{...firstPrevious,lastValidatedTimestamp:Number.MAX_SAFE_INTEGER+1}}],
   ['negative previous milliseconds',{...firstWindow,previous:{...firstPrevious,lastValidatedTimestamp:-1}}]
  ];
  for(const [label,window] of invalidWindows){assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,window),label);recoverMetadata();}
  assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,repository,firstWindow),'An admitted build window requires copy-local shims');recoverMetadata();
  // These in-memory interval inputs and disposable timestamp mutations test
  // native precision only; they neither execute another child nor admit it.
  const edgeStartedMs=Date.UTC(2001,0,2,3,4,5,123),edgeFinishedMs=edgeStartedMs+2_345;
  const edgeWindow={originRoot:repository,startedMs:edgeStartedMs,finishedMs:edgeFinishedMs,previous:firstPrevious};
  const nativeSecond=(ms:number)=>new Date(Math.floor(ms/1000)*1000).toUTCString();
  assert.notEqual(nativeSecond(edgeStartedMs),firstPrevious.prunedAt);assert.notEqual(edgeStartedMs,firstPrevious.lastValidatedTimestamp);
  const timestamps=(prunedAt:string,lastValidatedTimestamp:number,window:unknown,refusal?:string)=>{
   const modules=resolve(c.storage,'node_modules/.modules.yaml'),workspace=resolve(c.storage,'node_modules/.pnpm-workspace-state-v1.json');
   try{
    writeFileSync(modules,postBuildMetadata.get('.modules.yaml')!.bytes.toString().replace(/^prunedAt: [^\n]+$/m,'prunedAt: '+prunedAt));
    const data=JSON.parse(postBuildMetadata.get('.pnpm-workspace-state-v1.json')!.bytes.toString());data.lastValidatedTimestamp=lastValidatedTimestamp;writeFileSync(workspace,JSON.stringify(data,null,2)+'\n');
    if(refusal)assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,window),refusal);
    else{const result=metadataReader.assertStorageInstallationMetadata(c.root,c.root,window);assert.equal(result.prunedAt,prunedAt);assert.equal(result.lastValidatedTimestamp,lastValidatedTimestamp);}
   }finally{for(const path of ['.modules.yaml','.pnpm-workspace-state-v1.json']){const saved=postBuildMetadata.get(path)!;writeFileSync(resolve(c.storage,'node_modules',path),saved.bytes);chmodSync(resolve(c.storage,'node_modules',path),saved.mode);}}recoverMetadata();
  };
  timestamps(nativeSecond(edgeStartedMs),edgeStartedMs,edgeWindow);
  timestamps(nativeSecond(edgeFinishedMs),edgeFinishedMs,edgeWindow);
  timestamps(nativeSecond(edgeStartedMs),edgeFinishedMs,edgeWindow);
  timestamps(nativeSecond(edgeFinishedMs),edgeStartedMs,edgeWindow);
  timestamps(firstPrevious.prunedAt,firstPrevious.lastValidatedTimestamp,edgeWindow);
  timestamps(firstState.prunedAt,firstState.lastValidatedTimestamp,{...edgeWindow,previous:{prunedAt:firstState.prunedAt,lastValidatedTimestamp:firstState.lastValidatedTimestamp}});
  timestamps(nativeSecond(edgeStartedMs-1_000),edgeStartedMs,edgeWindow,'Changed modules timestamp before floored start');
  timestamps(nativeSecond(edgeFinishedMs+1_000),edgeFinishedMs,edgeWindow,'Changed modules timestamp after floored finish');
  timestamps(nativeSecond(edgeStartedMs),edgeStartedMs-1,edgeWindow,'Changed workspace timestamp one millisecond before start');
  timestamps(nativeSecond(edgeFinishedMs),edgeFinishedMs+1,edgeWindow,'Changed workspace timestamp one millisecond after finish');
  timestamps(firstPrevious.prunedAt,edgeStartedMs,edgeWindow);
  timestamps(nativeSecond(edgeStartedMs),firstPrevious.lastValidatedTimestamp,edgeWindow);
  const admittedEdgePrevious={prunedAt:nativeSecond(edgeStartedMs),lastValidatedTimestamp:edgeStartedMs};
  const laterEdgeWindow={originRoot:repository,startedMs:edgeStartedMs+10_000,finishedMs:edgeFinishedMs+10_000,previous:admittedEdgePrevious};
  timestamps(admittedEdgePrevious.prunedAt,admittedEdgePrevious.lastValidatedTimestamp,laterEdgeWindow);
  timestamps(admittedEdgePrevious.prunedAt,admittedEdgePrevious.lastValidatedTimestamp,{...laterEdgeWindow,finishedMs:laterEdgeWindow.startedMs});
  timestamps(firstPrevious.prunedAt,edgeStartedMs,{...edgeWindow,previous:admittedEdgePrevious},'Reset original modules timestamp is not unchanged captured previous');
  timestamps(nativeSecond(edgeStartedMs),firstPrevious.lastValidatedTimestamp,{...edgeWindow,previous:admittedEdgePrevious},'Reset original workspace timestamp is not unchanged captured previous');
  const closedControls:[string,string,(file:string)=>void][]=[
   ['postbuild original shim NODE_PATH','.bin/tsc',file=>replace(file,c.storage+'/node_modules',repository+'/g1-storage/node_modules')],
   ['postbuild sibling shim NODE_PATH','.bin/tsserver',file=>replace(file,c.storage+'/node_modules',resolve(c.root,'node_modules'))],
   ['postbuild shim exec target','.bin/tsc',file=>replace(file,'/bin/tsc','/bin/tsserver')],
   ['postbuild extra shim command','.bin/tsserver',file=>rewrite(file,source=>source+'exit 0\n')],
   ['postbuild shim mode','.bin/tsc',file=>chmodSync(file,0o700)],
   ['postbuild symlink shim','.bin/tsc',file=>{rmSync(file);symlinkSync('tsserver',file);}],
   ['postbuild hardlinked shim','.bin/tsc',file=>{rmSync(file);linkSync(resolve(c.storage,'node_modules/.bin/tsserver'),file);}],
   ['postbuild modules store','.modules.yaml',file=>replace(file,'storeDir: /private/tmp/agent-fabric-pnpm-store/v10','storeDir: '+resolve(c.directory,'foreign-owned-store'))],
   ['postbuild modules graph','.modules.yaml',file=>replace(file,'pg-cloudflare: private','pg-cloudflare: public')],
   ['postbuild extra modules field','.modules.yaml',file=>rewrite(file,source=>source+'storageExtraField: true\n')],
   ['postbuild workspace project','.pnpm-workspace-state-v1.json',file=>rewrite(file,source=>{const data=JSON.parse(source);data.projects={[c.storage]:{name:'forged'}};return JSON.stringify(data,null,2)+'\n';})],
   ['postbuild workspace hook','.pnpm-workspace-state-v1.json',file=>rewrite(file,source=>{const data=JSON.parse(source);data.pnpmfiles=[resolve(c.directory,'foreign-hook.cjs')];return JSON.stringify(data,null,2)+'\n';})],
   ['postbuild extra workspace field','.pnpm-workspace-state-v1.json',file=>rewrite(file,source=>{const data=JSON.parse(source);data.storageExtra=true;return JSON.stringify(data,null,2)+'\n';})],
   ['postbuild installed lock','.pnpm/lock.yaml',file=>rewrite(file,source=>source+'# forged installed lock\n')]
  ];
  for(const [label,path,mutate] of closedControls)rejectMetadata(label,path,mutate);
  const wantedPath=resolve(c.storage,'pnpm-lock.yaml'),wantedBytes=readFileSync(wantedPath),wantedMode=lstatSync(wantedPath).mode&0o7777;
  try{
   const forged=Buffer.concat([wantedBytes,Buffer.from('# postbuild matching forged wanted/current locks\n')]);writeFileSync(wantedPath,forged);writeFileSync(resolve(c.storage,'node_modules/.pnpm/lock.yaml'),forged);
   assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),'Postbuild matching wanted/current forgery fails independent wanted lock pin');
  }finally{
   writeFileSync(wantedPath,wantedBytes);chmodSync(wantedPath,wantedMode);const saved=postBuildMetadata.get('.pnpm/lock.yaml')!;writeFileSync(resolve(c.storage,'node_modules/.pnpm/lock.yaml'),saved.bytes);chmodSync(resolve(c.storage,'node_modules/.pnpm/lock.yaml'),saved.mode);
  }recoverMetadata();
  const rejectInstalled=async(label:string,path:string,mutate:(file:string)=>void,direct=false)=>{
   const file=resolve(c.storage,'node_modules',path),source=resolve(packageRoot,'node_modules',path),s=lstatSync(file),mode=s.mode&0o7777;
   assert(s.isFile()||s.isSymbolicLink());const bytes=s.isFile()?readFileSync(file):undefined,target=s.isSymbolicLink()?readlinkSync(file):undefined;
   const originalBytes=lstatSync(source).isFile()?readFileSync(source):undefined,originalTarget=lstatSync(source).isSymbolicLink()?readlinkSync(source):undefined;
   try{mutate(file);if(direct)assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),label);else assert.throws(()=>sameTrees(owners.map((owner,index)=>installedTree(c.root,owner,firstInstalled[index])),firstInstalled,label),label);}
   finally{rmSync(file,{force:true});if(target!==undefined)symlinkSync(target,file);else{assert(bytes);writeFileSync(file,bytes,{mode});chmodSync(file,mode);}}
   if(originalBytes!==undefined)assert.deepEqual(readFileSync(source),originalBytes,'Original payload survives '+label);else assert.equal(readlinkSync(source),originalTarget,'Original link survives '+label);
   recoverMetadata();sameTrees(owners.map(owner=>installedTree(c.root,owner)),firstInstalled,'Exact installed recovery after '+label);
  };
  const typeRoot='.pnpm/typescript@5.9.3/node_modules/typescript',payload=typeRoot+'/lib/typescript.js';
  await rejectInstalled('postbuild pinned package version',typeRoot+'/package.json',file=>rewrite(file,source=>source.replace('"version": "5.9.3"','"version": "5.9.2"')),true);
  await rejectInstalled('postbuild pinned notice',typeRoot+'/LICENSE.txt',file=>rewrite(file,source=>source+'\nchanged notice\n'),true);
  await rejectInstalled('postbuild arbitrary package payload',payload,file=>rewrite(file,source=>source+'\n// changed immutable payload\n'));
  await rejectInstalled('postbuild missing payload',payload,file=>rmSync(file));
  await rejectInstalled('postbuild payload mode',payload,file=>chmodSync(file,(lstatSync(file).mode&0o7777)^0o100));
  await rejectInstalled('postbuild hardlinked payload',payload,file=>{rmSync(file);linkSync(resolve(c.storage,'node_modules',typeRoot,'LICENSE.txt'),file);});
  await rejectInstalled('postbuild payload link substitution',payload,file=>{rmSync(file);symlinkSync('../package.json',file);});
  await rejectInstalled('postbuild altered root package link','pg',file=>{rmSync(file);symlinkSync(typeRoot,file);});
  const transitive=firstInstalled[0]!.entries.find(entry=>entry.type==='link'&&entry.path.startsWith('.pnpm/')&&!entry.path.startsWith('.pnpm/node_modules/'));assert(transitive&&transitive.type==='link');
  await rejectInstalled('postbuild altered transitive link',transitive.path,file=>{rmSync(file);symlinkSync(relative(dirname(file),resolve(c.storage,'node_modules',typeRoot)),file);});
  const typeDirectory=resolve(c.storage,'node_modules',typeRoot),typeMode=lstatSync(typeDirectory).mode&0o7777;
  try{chmodSync(typeDirectory,typeMode^0o020);assert.throws(()=>sameTrees(owners.map((owner,index)=>installedTree(c.root,owner,firstInstalled[index])),firstInstalled,'postbuild directory mode'));}finally{chmodSync(typeDirectory,typeMode);}recoverMetadata();sameTrees(owners.map(owner=>installedTree(c.root,owner)),firstInstalled,'Exact installed recovery after directory mode refusal');
  for(const path of [typeRoot+'/lib/extra-installed-payload.js','.bin/node']){
   const file=resolve(c.storage,'node_modules',path);assert(!existsSync(file));
   try{writeFileSync(file,'unbound postbuild installed path\n',{mode:0o755});assert.throws(()=>sameTrees(owners.map((owner,index)=>installedTree(c.root,owner,firstInstalled[index])),firstInstalled,'Extra postbuild installed path: '+path));if(path==='.bin/node')assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),'Extra postbuild launcher');}
   finally{rmSync(file,{force:true});}recoverMetadata();sameTrees(owners.map(owner=>installedTree(c.root,owner)),firstInstalled,'Exact installed recovery after extra postbuild path refusal: '+path);
  }
  protectInstallations('after all postbuild refusals and exact recovery');
  assert.equal(existsSync(sentinel),false);assert.match(r.stdout,/"cacheCleared":true/);
  for(const file of ['src/schema','src/owners','tests/contracts.test','tests/components/harness-build.component.test'])for(const suffix of ['.js','.d.ts','.js.map'])assert.equal(lstatSync(resolve(c.cache,'g1-storage',file+suffix)).isFile(),true);
  const secondPrevious={prunedAt:firstState.prunedAt,lastValidatedTimestamp:firstState.lastValidatedTimestamp};
  assert.deepEqual(metadataReader.assertStorageInstallationMetadata(c.root,c.root,firstWindow),firstState,'Capture the already admitted previous metadata immediately before the second unchanged child');
  protectInstallations('before second unchanged child');
  const secondStartedMs=Date.now();
  const checked=passed(await c.run('fresh-built-contracts-check','scripts/check-component.mjs',['contracts']));
  const secondFinishedMs=Date.now(),secondWindow={originRoot:repository,startedMs:secondStartedMs,finishedMs:secondFinishedMs,previous:secondPrevious};
  const secondState=metadataReader.assertStorageInstallationMetadata(c.root,c.root,secondWindow);assert.deepEqual(secondState.paths,metadataPaths);
  assert.throws(()=>metadataReader.assertStorageInstallationMetadata(c.root,repository),'Second install retains only exact copy-local launcher templates');
  assert.deepEqual(metadataReader.assertStorageInstallationMetadata(c.root,c.root,secondWindow),secondState,'Fresh valid second-window recovery after original-root expectation refusal');
  protectInstallations('after second unchanged child');
  assert.match(checked.stdout,/"measurement":"storage-test-report"/);assert.match(checked.stdout,/"tests":12/);
  });
  await copy(positiveCopyInputs,true);
 });
 await t.test(prefix+'/compiler-failure',()=>copy(async c=>{
  const stale=plantStale(c);c.put('src/hostile-build.ts','export const wrong: string = 42;\n');
  refused(await c.run('compiler-failure','scripts/build.mjs'),/TS2322/);stale();assert.equal(existsSync(c.cache),false);
 }));
 await t.test(prefix+'/deleted-source',()=>copy(async c=>{
  const stale=plantStale(c);rmSync(resolve(c.storage,'src/schema.ts'));
  refused(await c.run('deleted-source-full-check','scripts/check.mjs'),/TS2307/);stale();assert.equal(existsSync(c.cache),false);
 }));
 await t.test(prefix+'/stale-output',()=>copy(async c=>{
  const stale=plantStale(c);const r=passed(await c.run('replace-stale-build','scripts/build.mjs'));stale();
  assert.match(r.stdout,/"sourceAndTests":true/);
  const source=readFileSync(resolve(c.cache,'g1-storage/tests/contracts.test.js'),'utf8');assert.match(source,/registerContractTests/);assert.doesNotMatch(source,/executed stale code/);
 }));
 await t.test(prefix+'/owner-emission',()=>copy(async c=>{
  passed(await c.run('owner-emission','scripts/build.mjs'));
  const assets=JSON.parse(readFileSync(resolve(c.storage,'verification/owner-migration-assets.json'),'utf8'));
  assert.equal(Object.keys(assets.files).length,24);
  for(const [name,hash] of Object.entries(assets.files))assert.equal(digest(readFileSync(resolve(c.cache,name))).slice(7),hash);
  let sources=0;
  const emissions=(directory:string)=>{for(const name of readdirSync(directory)){
   const file=resolve(directory,name);if(lstatSync(file).isDirectory())emissions(file);
   else if(name.endsWith('.ts')&&!name.endsWith('.d.ts')){sources++;for(const suffix of ['.js','.d.ts','.js.map'])assert.ok(readFileSync(resolve(c.cache,relative(c.root,file).replace(/\.ts$/,suffix))).length>0);}
  }};
  for(const owner of ['g1-foundations','g1-identity','g1-recovery','g1-model'])emissions(resolve(c.root,owner,'src'));
  for(const owner of readdirSync(resolve(c.root,'engine')))emissions(resolve(c.root,'engine',owner,'src'));
  assert.ok(sources>50);
 }));
 await t.test(prefix+'/dependency-pins',()=>copy(async c=>{
  const lock=readFileSync(resolve(c.storage,'pnpm-lock.yaml'));
  const r=passed(await c.run('dependency-pins','scripts/build.mjs'));assert.deepEqual(readFileSync(resolve(c.storage,'pnpm-lock.yaml')),lock);
  assert.match(r.stdout,/"node":"v22.22.3"/);assert.match(r.stdout,/"dependencies":18/);
  const pkg=JSON.parse(readFileSync(resolve(c.storage,'package.json'),'utf8'));
  for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies}))assert.equal(JSON.parse(readFileSync(resolve(c.storage,'node_modules',name,'package.json'),'utf8')).version,version);
  pkg.devDependencies.typescript='5.9.2';writeFileSync(resolve(c.storage,'package.json'),JSON.stringify(pkg));
  refused(await c.run('changed-package-pin','scripts/build.mjs'),/Independent dependency pins changed/);
  pkg.devDependencies.typescript='5.9.3';writeFileSync(resolve(c.storage,'package.json'),JSON.stringify(pkg));
  writeFileSync(resolve(c.storage,'pnpm-lock.yaml'),lock.toString().replaceAll('typescript@5.9.3','typescript@5.9.2'));
  refused(await c.run('changed-lock-pin','scripts/build.mjs'),/ERR_PNPM|Independent dependency metadata mismatch/);
 }));
}

// Fixed private nonrecursive driver exists only within F-H. It imports the
// shipped file/execution gates byte-for-byte and has no selection/bypass flag.
const driver=`import {resolve} from 'node:path';
import {validateSuiteFiles,executeSuite} from './scripts/suite-execution.mjs';
if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');
 validateSuiteFiles([['probe',{file:'probe.test.js'}]],resolve('source'),resolve('emitted'));
 const output=await executeSuite(resolve('emitted/probe.test.js'),['PROBE'],{}, {PROBE:['PROBE/required']});
 console.log(JSON.stringify({measurement:'harness-private-gate-pass',report:output.report}));
`;
const good=`import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('PROBE',async t=>{await t.test('PROBE/required',()=>assert.equal(readFileSync('g1-storage/probe-input','utf8'),'actual-input'));});\n`;
function prepare(c:HarnessCopy,body=good){
 c.put('private-driver.mjs',driver);c.put('source/probe.test.ts','export {};',true);
 // The isolated root is ESM, like the real candidate package.
 c.put('emitted/package.json','{"type":"module"}',true);c.put('emitted/probe.test.js',body,true);c.put('probe-input','actual-input');
}

/** Hold only the copied contracts suite's actual native process. This seam
 * never changes the positive source closure or supplies a substitute workload. */
async function privatePrerequisiteFailure(schedule:'cancellation'|'workload'|'stream',sibling:HarnessCopy){
 const c=await HarnessCopy.create(),directory=c.directory;
 const siblingPath=resolve(sibling.root,'node_modules/.cache/sibling-sentinel'),siblingBytes=readFileSync(siblingPath);
 const sourcePath=resolve(packageRoot,'src/schema.ts'),sourceBytes=readFileSync(sourcePath);
 const originalSpawn=childProcess.spawn,spawnActual=originalSpawn as (file:string,argv:readonly string[],options?:SpawnOptions)=>ChildProcess;
 type Native={pid:number;ppid:number;birth:string;command:string};
 const census=()=>{
  const result=childProcess.spawnSync('/bin/ps',['-ww','-axo','pid=,ppid=,lstart=,stat=,command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8'},timeout:3000,maxBuffer:4*1024*1024});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);
  return result.stdout.trim().split('\n').map(line=>{
   const match=/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(\S+)\s+(.+)$/.exec(line);assert(match,'Complete current native contracts census row required');
   return {pid:Number(match[1]),ppid:Number(match[2]),birth:match[3]!,state:match[4]!,command:match[5]!};
  });
 };
 const identity=(row:Native):Native=>({pid:row.pid,ppid:row.ppid,birth:row.birth,command:row.command});
 const next=()=>new Promise<void>(yes=>setImmediate(yes));
 const stopped:Native[]=[],observed:Native[]=[];
 let operation:Promise<Awaited<ReturnType<HarnessCopy['runHarnessPrerequisite']>>>|undefined,handle:ChildProcess|undefined;
 let discoveryError:unknown,primaryFailure:unknown;
 let proof:Native|undefined,launchedNonce:string|undefined,settled=false,nativeClosed=false,stdoutEnded=false,stderrEnded=false,stdoutClosed=false,stderrClosed=false,contractsReturned=false;
 let cancellationRequested=false,resolveCancellation:(value:boolean)=>void=()=>{};
 const cancellationReady=new Promise<boolean>(yes=>{resolveCancellation=yes;});
 let resolveDispatch:(value:boolean)=>void=()=>{};
 const dispatchReady=new Promise<boolean>(yes=>{resolveDispatch=yes;});
 const messages:unknown[]=[];
 const current=(expected:Native,requireParent=true)=>{
  assert(handle&&proof,'Actual private child handle and independent native proof required');
  assert.equal(handle.pid,proof.pid);assert.equal(handle.exitCode,null);assert.equal(handle.signalCode,null);
  const rows=census(),parent=rows.find(row=>row.pid===proof!.pid);assert(parent,'Current private runner remains present');assert.deepEqual(identity(parent),proof);
  const row=rows.find(entry=>entry.pid===expected.pid);assert(row,'Current owned contracts process remains present');assert.deepEqual(identity(row),expected);
  if(requireParent)assert.equal(expected.ppid,proof.pid);
  else if(expected.pid!==proof.pid){const enclosing=observed.find(entry=>entry.pid===expected.ppid);assert(enclosing,'Captured actual suite parent required before contracts worker signal');assert.equal(enclosing.ppid,proof.pid);const live=rows.find(entry=>entry.pid===enclosing.pid);assert(live);assert.deepEqual(identity(live),enclosing,'Worker parent native instance stays bound to the current private runner');}
  return row;
 };
 const stop=async(expected:Native,requireParent=true)=>{
  current(expected,requireParent);assert.equal(process.kill(expected.pid,'SIGSTOP'),true);stopped.push(expected);
  for(;;){const row=current(expected,requireParent);if(row.state.startsWith('T'))break;await next();}
  assert.equal(current(expected,requireParent).state.startsWith('T'),true,'Actual kernel stopped state holds the current native suite boundary');
 };
 const resume=()=>{
  // Every signal rechecks the current private handle and native birth/parent/
  // command; a vanished instance is never replaced by a same-PID process.
  const errors:unknown[]=[];
  for(const expected of [...stopped])try{
   const row=current(expected,expected.ppid===proof!.pid);assert.equal(row.state.startsWith('T'),true);
   assert.equal(process.kill(expected.pid,'SIGCONT'),true);stopped.splice(stopped.indexOf(expected),1);
  }catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Every recorded native contracts stop must independently resume its current owned instance');
 };
 const removeFailed=async()=>{
  let failed:unknown;try{await c.close();}catch(error){failed=error;}
  assert(failed instanceof AggregateError,'Unadmitted failed private metadata keeps the existing failed close guard');
  assert.equal(failed.message,'Harness copy guards and independently proved cleanup failed');
  assert.equal(existsSync(directory),false,'Failed close still independently proves and removes only its current owned copy');
 };
 let before:{inputs:unknown;sourceFiles:unknown;candidate:unknown;dependencies:{original:InstalledTree[];copied:InstalledTree[]}}|undefined;
 try{
  assert.equal(dirname(c.directory),realpathSync(resolve(packageRoot,'node_modules/.cache')),'Private failure schedule uses the canonical project cache');
  assert.notEqual(c.directory,sibling.directory,'Private failure schedule keeps a distinct owned sibling fixture');
  await c.preparePositive();
  // A useful real copied contracts check precedes the private negative. It
  // uses the unchanged known-script CLI and freshly builds its actual source.
  const useful=await c.runAsync('private-'+schedule+'-actual-contracts-positive','scripts/check-slice.mjs',['contracts']);
  assert.equal(useful.status,0,useful.stderr);assert.equal(useful.signal,null);assert.equal(useful.stderr,'');
  const reader=await import(pathToFileURL(resolve(packageRoot,'scripts/delivery-evidence.mjs')).href);
  const usefulRows=reader.outerRecords(reader.records(Buffer.from(useful.stdout)));
  const usefulReports=usefulRows.filter((row:{measurement?:string})=>row.measurement==='storage-test-report');assert.equal(usefulReports.length,1);
  assert.equal(usefulReports[0].scope,'slice');assert.deepEqual(usefulReports[0].reports.map((report:{suite:string})=>report.suite),['contracts']);
  for(const key of ['fail','cancelled','skipped','todo'])assert.equal(usefulReports[0].reports[0][key],0,key);
  before=JSON.parse(readFileSync(resolve(c.directory,'owner'),'utf8'));
  const file=resolve(c.cache,'g1-storage/tests/contracts.test.js'),command=[process.execPath,'--test','--test-concurrency=1','--test-reporter=tap',file].join(' ');
  childProcess.spawn=((executable:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
   assert.equal(handle,undefined,'Only the one actual private runner may launch from this current operation');
   assert.equal(executable,process.execPath);assert.equal(argv[0],resolve(c.storage,'scripts/runner.mjs'));assert.equal(argv.length,2);
   assert.match(argv[1]!,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);launchedNonce=argv[1]!;
   assert.equal(options?.cwd,c.root);assert.deepEqual(options?.stdio,['ignore','pipe','pipe','ipc']);
   const child=spawnActual(executable,argv,{...options,env:{...options?.env,DOCKER_HOST:'unix://'+resolve(c.directory,'missing-docker.sock')}});handle=child;
   child.once('close',()=>{nativeClosed=true;resolveDispatch(false);resolveCancellation(false);});child.on('message',message=>{
    messages.push(message);if((message as {type?:string})?.type==='harness-prerequisite-cancel-accepted')resolveCancellation(true);
   });
   child.stdout!.once('end',()=>{stdoutEnded=true;});child.stderr!.once('end',()=>{stderrEnded=true;});
   child.stdout!.once('close',()=>{stdoutClosed=true;});child.stderr!.once('close',()=>{stderrClosed=true;});
   let pending='';child.stdout!.on('data',(bytes:Buffer)=>{
    pending+=bytes.toString('utf8');const lines=pending.split('\n');pending=lines.pop()!;
    try{for(const line of lines)if(line.startsWith('{')){
     const row=JSON.parse(line) as {measurement?:string;suite?:string;file?:string};
     if(row.measurement==='harness-prerequisite-dispatch'&&row.suite==='contracts')resolveDispatch(true);
     if(row.measurement==='storage-suite-dispatch'&&row.file===file)contractsReturned=true;
    }}catch(error){discoveryError=error;resolveDispatch(false);}
   });return child;
  }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
  operation=c.runHarnessPrerequisite('private-'+schedule+'-actual-held-contracts');
  void operation.then(()=>{settled=true;resolveDispatch(false);},()=>{settled=true;resolveDispatch(false);});
  const ready=await c.asyncChildReady;assert(ready);proof=identity(ready);
  assert.equal(Object.isFrozen(ready),true);assert.equal(proof.ppid,process.pid);assert(proof.birth);assert(handle);assert.equal(handle.pid,proof.pid);
  assert.equal(await dispatchReady,true,'Actual fixed workload reaches contracts before native process discovery');assert.equal(discoveryError,undefined);
  let suite:Native|undefined,worker:Native|undefined;
  for(;;){
   assert.equal(settled,false);assert.equal(contractsReturned,false,'Already settled contracts cannot stand in for the active native boundary');current(proof,false);
   const rows=census(),row=rows.find(entry=>entry.ppid===proof!.pid&&entry.command===command);
   if(row){suite=identity(row);if(schedule!=='workload')break;
    const leaf=rows.find(entry=>entry.ppid===suite!.pid&&entry.command===[process.execPath,'--test-concurrency=1',file].join(' '));
    if(leaf){worker=identity(leaf);assert.equal(rows.some(entry=>entry.ppid===worker!.pid),false,'Pure contracts worker has no active deeper process at the workload fault');break;}
   }
   await next();
  }
  assert(suite);observed.push(suite);
  if(worker){observed.push(worker);await stop(worker,false);}
  await stop(suite);assert.equal(settled,false);assert.equal(existsSync(directory),true);
  await assert.rejects(()=>c.close(),/Active harness child must settle before copy cleanup/);
  await assert.rejects(()=>c.runHarnessPrerequisite('private-'+schedule+'-held-overlap'),/Harness copy operation already active or closed/);
  if(schedule==='cancellation'){
   cancellationRequested=true;
   await c.cancelHarnessPrerequisite();
  }else if(schedule==='stream'){
   const injected=new Error('F-H actual private stdout stream failure while contracts remains stopped');
   assert.equal(handle!.connected,true,'The current private IPC remains live before the actual stopped-suite stream fault');cancellationRequested=true;
   assert.equal(handle!.stdout!.emit('error',injected),true);assert.equal(handle!.connected,true,'Stream failure requests current cancellation without parent-driven IPC disconnect');
  }else{
   assert(worker);current(worker,false);assert.equal(census().some(row=>row.ppid===worker!.pid),false,'No deeper child is signalled through its contracts parent');
   assert.equal(process.kill(worker.pid,'SIGTERM'),true,'The exact current pure-contracts worker is intentionally terminated');
  }
  if(schedule!=='workload'){
   assert.equal(await cancellationReady,true,'The actual current private cancellation acknowledgement precedes native contracts release');
   const acknowledgements=messages.filter(message=>(message as {type?:string})?.type==='harness-prerequisite-cancel-accepted');assert.equal(acknowledgements.length,1);
   assert.deepEqual(acknowledgements[0],{type:'harness-prerequisite-cancel-accepted',operation:'harness-prerequisite',nonce:launchedNonce,owner:c.owner});
   assert.equal(handle!.connected,true,'The current private IPC stays live while its actual contracts suite remains stopped');
   await assert.rejects(()=>c.cancelHarnessPrerequisite(),/Current prerequisite cancellation already requested/);
  }
  assert.equal(settled,false,'Cancellation/failure cannot settle the stopped actual suite process');
  assert.equal(current(suite).state.startsWith('T'),true);assert.equal(contractsReturned,false);assert.equal(existsSync(directory),true);
  resume();
  let failed:unknown;try{await operation;}catch(error){failed=error;}
  assert(failed instanceof AggregateError);assert.equal(settled,true);
  const causes=(error:unknown):string=>error instanceof AggregateError?String(error)+'\n'+error.errors.map(causes).join('\n'):String(error);
  assert.match(causes(failed),schedule==='cancellation'?/Current private prerequisite cancelled after normal suite settlement/:schedule==='stream'?/F-H actual private stdout stream failure while contracts remains stopped/:/Private prerequisite workload failed \(1\)/);
  const result=(failed as AggregateError&{result:Awaited<ReturnType<HarnessCopy['runHarnessPrerequisite']>>}).result;assert(result);
  assert.equal(result.status,1);assert.equal(result.signal,null);assert.deepEqual(result.identity,proof);assert(result.nonce);assert.equal(result.nonce,launchedNonce);
  assert.equal(proof.command,[process.execPath,resolve(c.storage,'scripts/runner.mjs'),result.nonce].join(' '));
  assert.equal(nativeClosed,true);assert.equal(handle!.exitCode,1);assert.equal(handle!.signalCode,null);
  assert.equal(stdoutEnded,true);assert.equal(stderrEnded,true);assert.equal(stdoutClosed,true);assert.equal(stderrClosed,true);
  assert.equal(handle!.connected,false);await assert.rejects(()=>c.cancelHarnessPrerequisite(),'Settled failed copy retains no private cancellation capability');
  const rows=reader.outerRecords(reader.records(Buffer.from(result.stdout))),dispatches=rows.filter((row:{measurement?:string})=>row.measurement==='harness-prerequisite-dispatch');
  assert.deepEqual(dispatches.map((row:{suite:string})=>row.suite),['contracts'],'No integration or later mandatory suite is admitted after the held actual contracts fault');
  const transport=await import(pathToFileURL(resolve(packageRoot,'scripts/measurement-transport.mjs')).href);
  const frames=rows.filter((row:{measurement?:string})=>row.measurement==='storage-measurement-transport'),decoded=[];
  for(let index=0;index<frames.length;){const header=frames[index],count=header.count+2;
   const value=transport.decodeMeasurement(frames.slice(index,index+count),header.binding);assert.equal(digest(value.raw),header.digest);decoded.push(value.record);index+=count;
  }
  const commands=decoded.filter(row=>row.phase==='command');assert.equal(commands.length,2);assert.equal(commands[1].success,false);
  assert.deepEqual(commands.map(row=>row.measurement),['storage-parent-start','storage-parent-return']);
  for(const census of [commands[0].before,commands[1].before,commands[1].after]){
   assert(census.processBytes.trim().length>0);assert.equal(digest(census.processBytes),census.processDigest);assert.deepEqual(census.processes,census.processBytes.trimEnd().split('\n'));
   assert.equal(census.containerBytes,null);assert.equal(census.containers,null);assert.equal(census.containerDigest,null);
   assert.equal(census.containerObservation.status,'unknown');assert.equal(census.containerObservation.qualified,false);
   assert.equal(census.containerObservation.exitStatus,1);assert.equal(census.containerObservation.signal,null);assert.equal(census.containerObservation.error,null);
   assert.equal(census.containerObservation.stdout,'');assert.match(census.containerObservation.stderr,/missing-docker\.sock/);assert.match(census.containerObservation.diagnostic,/Docker census unavailable/);
  }

  const builds=rows.filter((row:{measurement?:string})=>row.measurement==='strict-build');assert.equal(builds.length,1,'The failed private operation still performed its one actual fresh build');
  assert.equal(builds[0].sourceAndTests,true);assert.equal(builds[0].cacheCleared,true);assert.equal(builds[0].node,'v22.22.3');
  assert.deepEqual(builds[0].pins,{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'});assert.equal(builds[0].install,'offline/frozen/ignore-scripts');
  assert.equal(builds[0].dependencyLockDigest,digest(readFileSync(resolve(c.storage,'pnpm-lock.yaml'))));
  assert.equal(rows.filter((row:{measurement?:string})=>row.measurement==='storage-test-report').length,0,'Failed private operation cannot report a successful fixed-ten workload');
  const finished=rows.filter((row:{measurement?:string})=>row.measurement==='storage-suite-dispatch');assert.equal(finished.length,1);assert.equal(finished[0].file,file);
  assert.equal(finished[0].status,schedule==='workload'?1:0);assert.equal(finished[0].signal,null);assert.equal(finished[0].error,null);
  if(schedule==='workload'){assert.match(result.stdout,/SIGTERM/);assert.match(result.stdout,/^not ok [1-9]\d* - .*contracts\.test\.js$/m);assert.match(result.stdout,/# fail [1-9]\d*/);assert.match(result.stderr,/node:test failed \(1\)/);}
  else{assert.match(result.stdout,/# fail 0/);assert.match(result.stdout,/# cancelled 0/);assert.match(result.stdout,/# skipped 0/);assert.match(result.stdout,/# todo 0/);
   const lines=result.stdout.split('\n'),start=lines.indexOf('TAP version 13'),end=lines.findIndex(line=>{if(!line.startsWith('{'))return false;const row=JSON.parse(line);return row.measurement==='storage-suite-dispatch'&&row.file===file;});
   assert.equal(lines.filter(line=>line==='TAP version 13').length,1);assert(start>=0&&end>start,'The actual contracts TAP prefix precedes its same native completed dispatch');
   const gate=await import(pathToFileURL(resolve(c.storage,'scripts/process-result.mjs')).href),{suites}=await import(pathToFileURL(resolve(c.storage,'scripts/manifest.mjs')).href);
   const report=gate.parseTap({status:finished[0].status,signal:finished[0].signal,stdout:lines.slice(start,end).join('\n')+'\n',stderr:result.stderr},suites.contracts.cases);
   assert.deepEqual(report.cases,['C01 / closed contracts','C02 / finite admission bounds','C03 / independent controls and owner composition']);for(const key of ['fail','cancelled','skipped','todo'])assert.equal(report[key],0,key);
   for(const [parent,names] of Object.entries(suites.contracts.variants) as [string,string[]][])for(const name of names)assert.equal(report.executions.filter((row:{indent:number;parent:string;name:string})=>row.indent===4&&(row.parent===parent||row.parent.startsWith(parent+' / '))&&row.name===name).length,1,'Every actual contracts variant finishes normally before private refusal');
  }
  const final=census();assert.equal(final.some(row=>row.pid===proof!.pid||row.ppid===proof!.pid||observed.some(expected=>row.pid===expected.pid||row.ppid===expected.pid)),false,'All observed actual suite/worker descendants settle before owned removal');
  assert.equal(existsSync(directory),true,'The actual failed private result precedes independently proved removal');
  await removeFailed();assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(sourcePath),sourceBytes);
 }catch(error){primaryFailure=error;throw error;}finally{
  // Failure cannot leave an owned process stopped or restore a seam while the
  // actual private operation is running. Exact identity remains mandatory.
  const cleanupErrors:unknown[]=[];
  try{if(stopped.length)resume();}catch(error){cleanupErrors.push(error);}
  try{if(operation&&!settled&&handle?.connected){
   if(!proof){const row=census().find(entry=>entry.pid===handle!.pid);assert(row,'Current actual private child required before exceptional IPC cancellation');assert.equal(row.ppid,process.pid);assert.equal(row.command,[process.execPath,resolve(c.storage,'scripts/runner.mjs'),launchedNonce].join(' '));proof=identity(row);}
   current(proof,false);
   if(!cancellationRequested){cancellationRequested=true;await c.cancelHarnessPrerequisite();}
   else assert.equal(await cancellationReady,true,'Already requested current cancellation must actually acknowledge before exceptional settlement');
  }}catch(error){cleanupErrors.push(error);}
  if(stopped.length){
   // A native identity refusal cannot authorize signalling a replacement or
   // deleting its root. Return a hard failure without waiting on a paused
   // process; the original operation/owned fixture stays explicitly unproven.
   childProcess.spawn=originalSpawn;syncBuiltinESMExports();
   throw new AggregateError([...(primaryFailure===undefined?[]:[primaryFailure]),...cleanupErrors],'Native contracts resume refused; private operation and owned removal remain unqualified');
  }
  try{if(operation)await Promise.allSettled([operation]);}finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
  if(existsSync(directory))try{await c.close();}catch(error){if(existsSync(directory))cleanupErrors.push(error);}
  if(cleanupErrors.length)throw new AggregateError([...(primaryFailure===undefined?[]:[primaryFailure]),...cleanupErrors],'Actual private failure and independent native cleanup causes retained');
 }
 assert(before);assert.equal(existsSync(directory),false);assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(sourcePath),sourceBytes);
 // Recovery is a fresh independently prepared full original/private census,
 // never another operation or a retrospective admission on the failed copy.
 const recovered=await HarnessCopy.create();try{
  assert.equal(dirname(recovered.directory),realpathSync(resolve(packageRoot,'node_modules/.cache')),'Fresh private recovery stays in the canonical project cache');
  assert.notEqual(recovered.directory,directory);assert.notEqual(recovered.owner,c.owner);await recovered.preparePositive();await recovered.assertPositive();
  const binding=JSON.parse(readFileSync(resolve(recovered.directory,'owner'),'utf8'));
  for(const key of ['inputs','sourceFiles','candidate'] as const)assert.deepEqual(binding[key],before[key],'Fresh recovery retains complete captured '+key);
  assert.deepEqual(binding.dependencies.original,before.dependencies.original,'Fresh recovery reads every unchanged original installed hash/count/census');
  const reader=await import(pathToFileURL(resolve(recovered.storage,'scripts/delivery-evidence.mjs')).href);
  assert.deepEqual(await reader.installedDependencySnapshot(repository,binding.dependencies.original),binding.dependencies.original);
  assert.deepEqual(await reader.installedDependencySnapshot(recovered.root,binding.dependencies.copied),binding.dependencies.copied);
  assert.deepEqual(await reader.evidenceOrigin(),{executionRoot:recovered.root,originRoot:repository});
  assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(sourcePath),sourceBytes);
 }finally{await recovered.close();}
 assert.equal(existsSync(recovered.directory),false,'Fresh fully recovered copy removes only its new proved instance');
 assert.deepEqual(readFileSync(siblingPath),siblingBytes);assert.deepEqual(readFileSync(sourcePath),sourceBytes);
}

/** H02/good-full-run is deliberately separate: diagnostic execution cannot
 * qualify it. Full H02 below always registers it and requires its real owner. */
export async function harnessResultNegativeSchedules(t:TestContext,prefix='H02'){
 await t.test(prefix+'/removed-suite',async()=>{await copy(async c=>{
  prepare(c);rmSync(resolve(c.root,'source/probe.test.ts'));
  refused(await c.run('source-suite-missing','private-driver.mjs'),/Mandatory suite missing: probe/);
  prepare(c);rmSync(resolve(c.root,'emitted/probe.test.js'));
  refused(await c.run('emitted-suite-missing','private-driver.mjs'),/Mandatory suite missing: probe/);
  // Real corrupted-copy full command, not solely the private gate driver.
  plantStale(c);rmSync(resolve(c.storage,'tests/contracts.test.ts'));
  const r=refused(await c.run('removed-suite-full-check','scripts/check.mjs'),/ENOENT|Mandatory current storage emission missing/);
  assert.match(r.stdout,/"measurement":"storage-candidate"/);assert.doesNotMatch(r.stdout,/"measurement":"storage-test-report"/);
 });
 // Exercise unchanged real entry points. The test-only child endpoint names a
 // missing socket inside that child's owned directory; the real Docker CLI
 // supplies the refusal. No fixture or PG work is substituted.
 for(const [entry,args,privateEntry] of [
  ['scripts/check-component.mjs',['authority'],false],['scripts/check-slice.mjs',['authority'],false],
  ['scripts/check.mjs',[],false],['scripts/runner.mjs',[],true]
 ] as const){
  const c=await HarnessCopy.create(),directory=c.directory,sibling=readFileSync(resolve(c.root,'node_modules/.cache/sibling-sentinel'));
  const source=readFileSync(resolve(packageRoot,'src/schema.ts')),spawnActual=childProcess.spawn;
  let child:ChildProcess|undefined,closed=false,stdoutEnded=false,stderrEnded=false,stdoutClosed=false,stderrClosed=false;
  let result:Awaited<ReturnType<HarnessCopy['runAsync']>>|undefined,failure:unknown;
  try{
   if(entry==='scripts/check-component.mjs'){
    // This existing UUID-only copy has no enclosing admitted positive runner.
    // Its actual runner builds/censuses normally; Docker doubles refuse the
    // first fixture census before image, root, container or PG work.
    const runner=await import(pathToFileURL(resolve(c.storage,'scripts/runner.mjs')).href);
    const transport=await import(pathToFileURL(resolve(c.storage,'scripts/measurement-transport.mjs')).href);
    const originalSpawnSync=childProcess.spawnSync,originalWrite=process.stdout.write;
    const measurementDocker=['ps','-a','--filter','label=agent-fabric.storage-fixture-owner','--no-trunc','--format','{{.ID}}'];
    const fixtureDocker=['ps','-a','--filter','label=agent-fabric.storage-fixture-owner','--format','{{.ID}}'];
    const calls:string[]=[],writes:string[]=[];let measurementCalls=0,buildCalls=0,runnerFailure:unknown;
    try{
     childProcess.spawnSync=((file:unknown,args:unknown,options:unknown)=>{
      if(file==='docker'){
       if(JSON.stringify(args)===JSON.stringify(measurementDocker)){
        calls.push('measurement');measurementCalls++;
        assert(measurementCalls<=4,'Only command/admission starts and suite/command returns may census Docker');
        assert.equal(calls.includes('fixture'),measurementCalls>2,'Docker loss begins at the actual fixture boundary');
        return {status:measurementCalls<=2?0:1,signal:null,stdout:'',stderr:measurementCalls<=2?'':'test-local Docker loss at '+(measurementCalls===3?'suite return':'command final')};
       }
       assert.deepEqual(args,fixtureDocker,'No image, container or other Docker work may run');
       assert.equal(calls.includes('fixture'),false);assert.equal(measurementCalls,2);
       calls.push('fixture');return {status:1,signal:null,stdout:'',stderr:'test-local fixture census failure'};
      }
      if(file===process.execPath&&JSON.stringify(args)===JSON.stringify([resolve(c.storage,'scripts/build.mjs')]))buildCalls++;
      return Reflect.apply(originalSpawnSync,childProcess,[file,args,options]);
     }) as unknown as typeof childProcess.spawnSync;syncBuiltinESMExports();
     process.stdout.write=((chunk:unknown,encoding?:unknown,callback?:unknown)=>{
      writes.push(String(chunk));const done=typeof encoding==='function'?encoding:callback;
      if(typeof done==='function')queueMicrotask(()=>done());return true;
     }) as typeof process.stdout.write;
     try{await runner.check('component',['authority']);}catch(error){runnerFailure=error;}
    }finally{childProcess.spawnSync=originalSpawnSync;syncBuiltinESMExports();process.stdout.write=originalWrite;}
    assert(runnerFailure instanceof AggregateError,'The actual authority runner must fail after strict admission');
    const causes=(error:unknown):unknown[]=>error instanceof AggregateError?error.errors.flatMap(causes):[error];
    const errors=causes(runnerFailure).map(String);
    assert.equal(errors.length,3,'Only the fixture refusal and the two strict return failures may explain this result');
    assert.equal(errors.filter(value=>value==='Error: Owned storage Docker ps failed').length,1,'Retain the actual fixture refusal');
    assert.equal(errors.filter(value=>value.startsWith('Error: Docker census unavailable:')).length,2,'Both actual suite-return and sticky command-final censuses must refuse Docker loss');
    for(const boundary of ['suite return','command final'])assert.equal(errors.filter(value=>value.includes('test-local Docker loss at '+boundary)).length,1);
    assert.equal(buildCalls,1,'Forward exactly one actual strict build');
    assert.deepEqual(calls,['measurement','measurement','fixture','measurement','measurement']);
    const rows=writes.join('').split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
    const builds=rows.filter(row=>row.measurement==='strict-build');assert.equal(builds.length,1);assert.equal(builds[0].sourceAndTests,true);assert.equal(builds[0].cacheCleared,true);
    const frames=rows.filter(row=>row.measurement==='storage-measurement-transport'),decoded=[];
    for(let index=0;index<frames.length;){const header=frames[index],count=header.count+2;const value=transport.decodeMeasurement(frames.slice(index,index+count),header.binding);assert.equal(digest(value.raw),header.digest);decoded.push(value.record);index+=count;}
    const lifetimeStarts=decoded.filter(row=>row.measurement==='storage-parent-start'&&row.phase==='suite-lifetime');
    assert.equal(lifetimeStarts.length,1);assert.equal(lifetimeStarts[0].suite,'authority');assert.equal(lifetimeStarts[0].mode,'component');
    assert.equal(lifetimeStarts[0].before.containerObservation.status,'available');assert.equal(lifetimeStarts[0].before.containerObservation.qualified,true);
    for(const row of decoded.filter(row=>row.before)){assert(row.before.processBytes.trim());assert.equal(row.before.processDigest,transport.measurementDigest(row.before.processBytes));}
    assert.equal(decoded.filter(row=>row.measurement==='storage-parent-return'&&['suite-lifetime','command'].includes(row.phase)).length,0,'Strict failures cannot publish qualified return records');
    assert.equal(rows.filter(row=>['storage-suite-dispatch','storage-owned-fixture','storage-test-report'].includes(row.measurement)).length,0,'The refused fixture cannot execute a PG suite or publish success');
    assert.deepEqual(readFileSync(resolve(c.root,'node_modules/.cache/sibling-sentinel')),sibling);assert.deepEqual(readFileSync(resolve(packageRoot,'src/schema.ts')),source);
   }
   if(privateEntry)await c.preparePositive();
   childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
    assert.equal(child,undefined);assert.equal(file,process.execPath);assert.equal(argv[0],resolve(c.storage,entry));assert.equal(options?.cwd,c.root);
    if(privateEntry){assert.equal(argv.length,2);assert.match(argv[1]!,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.deepEqual(options?.stdio,['ignore','pipe','pipe','ipc']);}
    else assert.deepEqual(argv,[resolve(c.storage,entry),...args]);
    child=spawnActual(file,argv,{...options,env:{...options?.env,DOCKER_HOST:'unix://'+resolve(directory,'missing-docker.sock')}});
    child.once('close',()=>{closed=true;});child.stdout!.once('end',()=>{stdoutEnded=true;});child.stderr!.once('end',()=>{stderrEnded=true;});
    child.stdout!.once('close',()=>{stdoutClosed=true;});child.stderr!.once('close',()=>{stderrClosed=true;});return child;
   }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
   try{result=privateEntry?await c.runHarnessPrerequisite('missing-docker-private-fixed-ten'):await c.runAsync('missing-docker-'+entry,entry,[...args]);}
   catch(error){failure=error;result=(error as AggregateError&{result:Awaited<ReturnType<HarnessCopy['runAsync']>>}).result;}
   assert(result);assert.equal(result.status,1);assert.equal(result.signal,null);assert(result.identity);assert.equal(result.identity.ppid,process.pid);assert(result.identity.birth);
   assert.equal(closed,true);assert.equal(child!.exitCode,1);assert.equal(child!.signalCode,null);assert.equal(stdoutEnded,true);assert.equal(stderrEnded,true);assert.equal(stdoutClosed,true);assert.equal(stderrClosed,true);
   if(privateEntry){assert(failure instanceof AggregateError);assert.equal(child!.connected,false);await assert.rejects(()=>c.cancelHarnessPrerequisite());}
   else assert.equal(failure,undefined);
   assert.match(result.stderr,/Docker census unavailable/);assert.match(result.stderr,/missing-docker\.sock/);
   const reader=await import(pathToFileURL(resolve(packageRoot,'scripts/delivery-evidence.mjs')).href),rows=reader.outerRecords(reader.records(Buffer.from(result.stdout)));
   assert.equal(rows.filter((row:{measurement?:string})=>row.measurement==='storage-owned-fixture'||row.measurement==='storage-fixture-execution-times'||row.measurement==='storage-test-report').length,0,'Unavailable strict admission cannot import/start fixture or publish a successful full report');
   const builds=rows.filter((row:{measurement?:string})=>row.measurement==='strict-build');assert.equal(builds.length,1);assert.equal(builds[0].sourceAndTests,true);assert.equal(builds[0].cacheCleared,true);
   const dispatches=rows.filter((row:{measurement?:string})=>row.measurement==='storage-suite-dispatch');
   const full=entry==='scripts/check.mjs'||privateEntry;
   assert.equal(dispatches.length,full?1:0);
   if(full){
    assert.equal(dispatches[0].file,resolve(c.cache,'g1-storage/tests/contracts.test.js'));assert.equal(dispatches[0].status,0);assert.equal(dispatches[0].signal,null);assert.equal(dispatches[0].error,null);
    const lines=result.stdout.split('\n'),start=lines.indexOf('TAP version 13'),end=lines.findIndex(line=>line.startsWith('{')&&JSON.parse(line).measurement==='storage-suite-dispatch');
    assert(start>=0&&end>start);const gate=await import(pathToFileURL(resolve(packageRoot,'scripts/process-result.mjs')).href),{suites}=await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href);
    const report=gate.parseTap({status:0,signal:null,stdout:lines.slice(start,end).join('\n')+'\n',stderr:result.stderr},suites.contracts.cases);
    assert.deepEqual(report.cases,['C01 / closed contracts','C02 / finite admission bounds','C03 / independent controls and owner composition']);assert.equal(report.tests,12);
    for(const key of ['fail','cancelled','skipped','todo'])assert.equal(report[key],0,key);
    for(const [parent,names] of Object.entries(suites.contracts.variants) as [string,string[]][])for(const name of names)assert.equal(report.executions.filter((row:{indent:number;parent:string;name:string})=>row.indent===4&&(row.parent===parent||row.parent.startsWith(parent+' / '))&&row.name===name).length,1);
   }
   const admissions=rows.filter((row:{measurement?:string})=>row.measurement==='harness-prerequisite-dispatch');assert.deepEqual(admissions.map((row:{suite:string})=>row.suite),privateEntry?['contracts']:[]);
   const transport=await import(pathToFileURL(resolve(packageRoot,'scripts/measurement-transport.mjs')).href),frames=rows.filter((row:{measurement?:string})=>row.measurement==='storage-measurement-transport'),decoded=[];
   for(let index=0;index<frames.length;){const header=frames[index],count=header.count+2;const value=transport.decodeMeasurement(frames.slice(index,index+count),header.binding);assert.equal(digest(value.raw),header.digest);decoded.push(value.record);index+=count;}
   assert.equal(decoded.filter(row=>row.phase==='suite-lifetime'&&row.suite==='authority').length,0,'Strict census refuses before integration lifetime/admission publication');
   const commands=decoded.filter(row=>row.phase==='command');assert.equal(commands.length,2);assert.equal(commands[1].success,false);
   for(const census of [commands[0].before,commands[1].before,commands[1].after]){
    assert(census.processBytes.trim());assert.equal(digest(census.processBytes),census.processDigest);assert.deepEqual(census.processes,census.processBytes.trimEnd().split('\n'));
    assert.equal(census.containerBytes,null);assert.equal(census.containers,null);assert.equal(census.containerDigest,null);assert.equal(census.containerObservation.status,'unknown');assert.equal(census.containerObservation.qualified,false);
    assert.equal(census.containerObservation.exitStatus,1);assert.equal(census.containerObservation.signal,null);assert.equal(census.containerObservation.error,null);assert.equal(census.containerObservation.stdout,'');
    assert.match(census.containerObservation.stderr,/missing-docker\.sock/);assert.match(census.containerObservation.diagnostic,/Docker census unavailable/);
   }
   assert.deepEqual(readFileSync(resolve(c.root,'node_modules/.cache/sibling-sentinel')),sibling);assert.deepEqual(readFileSync(resolve(packageRoot,'src/schema.ts')),source);
  }finally{
   childProcess.spawn=spawnActual;syncBuiltinESMExports();
   let cleanupFailure:unknown;try{await c.close();}catch(error){cleanupFailure=error;}
   if(privateEntry&&result){assert(cleanupFailure instanceof AggregateError);assert.equal(cleanupFailure.message,'Harness copy guards and independently proved cleanup failed');}
   else if(cleanupFailure)throw cleanupFailure;
   assert.equal(existsSync(directory),false,'Each actual refused entry removes only its independently proved owned copy');assert.deepEqual(readFileSync(resolve(packageRoot,'src/schema.ts')),source);
  }
 }
 });
 const schedules:[string,string,RegExp][]=[
  ['removed-case',good.replace("test('PROBE'","test('OTHER'"),/Exact mandatory executed identities required/],
  ['empty-suite',"import test from 'node:test';\n",/Exact mandatory executed identities required/],
  ['failure',good.replace("'actual-input'","'wrong-input'"),/node:test failed \(1\)/],
  ['cancellation',"import test from 'node:test';test('PROBE',()=>new Promise(()=>{}));\n",/node:test failed \(1\)/],
  ['skip',"import test from 'node:test';test('PROBE',{skip:true},()=>{});\n",/Failed\/skipped\/TODO TAP/],
  ['todo',"import test from 'node:test';test('PROBE',{todo:true},()=>{});\n",/Failed\/skipped\/TODO TAP/],
  ['forged-label',"console.log('PROBE H02/good-full-run passed');\n",/Exact mandatory executed identities required/],
  ['forged-totals',good+"console.log('tests 2\\npass 2\\nfail 0\\ncancelled 0\\nskipped 0\\ntodo 0');\n",/Duplicate TAP summary|Contradictory TAP summary/],
  ['missing-variant',good.replaceAll('PROBE/required','PROBE/other'),/Mandatory executed variant missing\/duplicated/]
 ];
 for(const [name,body,reason] of schedules)await t.test(prefix+'/'+name,()=>copy(async c=>{
  prepare(c);const positive=passed(await c.run(name+'-positive-control','private-driver.mjs'));assert.match(positive.stdout,/"tests":2/);
  c.put('emitted/probe.test.js',body,true);const bad=refused(await c.run(name,'private-driver.mjs'),reason);
  if(name==='failure')assert.match(bad.stdout,/ERR_ASSERTION/);
  if(name==='cancellation')assert.match(bad.stdout,/# cancelled 1/);
  if(name==='cancellation')await privatePrerequisiteFailure('cancellation',c);
  if(name==='skip')assert.match(bad.stdout,/# skipped 1/);
  if(name==='todo')assert.match(bad.stdout,/# todo 1/);
  assert.doesNotMatch(bad.stdout,/"measurement":"harness-private-gate-pass"/);
  if(name==='failure'){
   // A real disposable sibling guard failure cannot replace the body's cause.
   // node:test prints the message without nested AggregateError.errors, so the
   // two causes must also remain readable there, in their original order.
   const outerSiblingPath=resolve(c.root,'node_modules/.cache/sibling-sentinel'),outerSiblingBytes=readFileSync(outerSiblingPath);
   const originalSourcePath=resolve(packageRoot,'src/schema.ts'),originalSourceBytes=readFileSync(originalSourcePath);
   let successfulDirectory='';
   await copy(async inner=>{successfulDirectory=inner.directory;assert.equal(readFileSync(resolve(inner.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+inner.owner);},false);
   assert.equal(existsSync(successfulDirectory),false,'Successful helper still performs actual owned cleanup');
   for(const schedule of ['body-only','cleanup-only','body-and-cleanup'] as const){
    const primary=new Error('F-H retained exact body cause '+schedule);let directory='',failed:unknown;
    try{await copy(async inner=>{
     directory=inner.directory;assert.notEqual(directory,c.directory);
     if(schedule!=='body-only')writeFileSync(resolve(inner.root,'node_modules/.cache/sibling-sentinel'),'F-H actual sibling guard refusal '+schedule);
     await Promise.resolve();if(schedule!=='cleanup-only')throw primary;
    },false);}catch(error){failed=error;}
    assert(directory,'Actual disposable copy required');assert.equal(existsSync(directory),false,'Failed guard still removes its independently proved copy: '+schedule);
    if(schedule==='body-only')assert.equal(failed,primary,'Successful cleanup preserves the exact body error');
    else{
     assert(failed instanceof AggregateError);let cleanup:AggregateError;
     if(schedule==='cleanup-only'){
      assert.equal(failed.message,'Harness copy guards and independently proved cleanup failed','Successful body propagates the existing cleanup error directly');cleanup=failed;
     }else{
      assert.equal(failed.errors.length,2);assert.equal(failed.errors[0],primary,'Body cause remains first and exact');assert.equal(failed.cause,primary);
      assert(failed.errors[1] instanceof AggregateError);cleanup=failed.errors[1];
      assert.equal(failed.message,'Harness copy body and independently proved cleanup failed: '+String(primary)+'; '+String(cleanup),'TAP-visible message retains both causes in order');
     }
     assert.equal(cleanup.message,'Harness copy guards and independently proved cleanup failed');assert.equal(cleanup.errors.length,1);
     assert(cleanup.errors[0] instanceof assert.AssertionError);assert.match(String(cleanup.errors[0]),/F-H actual sibling guard refusal/);
    }
    assert.deepEqual(readFileSync(outerSiblingPath),outerSiblingBytes,'Sibling copy survives independent failing cleanup');
    assert.deepEqual(readFileSync(originalSourcePath),originalSourceBytes,'Original source survives independent failing cleanup');
   }
   let recoveredDirectory='';
   await copy(async inner=>{recoveredDirectory=inner.directory;assert.equal(readFileSync(resolve(inner.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+inner.owner);},false);
   assert.equal(existsSync(recoveredDirectory),false,'Fresh helper recovery cleans its own actual copy');
   assert.deepEqual(readFileSync(outerSiblingPath),outerSiblingBytes);assert.deepEqual(readFileSync(originalSourcePath),originalSourceBytes);
   // The ordinary known-script operation retains exact CLI arguments and both
   // UTF-8 streams. It has no private-runner IPC/nonce or inherited capability.
   const keys=['STORAGE_REPO_ROOT','STORAGE_DATABASE_URL','MODEL_DATABASE_URL','IDENTITY_OWNER_ROOT','FABRIC_OWNER','HARNESS_CHILD','HARNESS_CHILD_NONCE','LOOP_PROJECT','NODE_TEST_CONTEXT','NODE_OPTIONS','NODE_PATH','NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE'];
   const saved=new Map(keys.map(key=>[key,process.env[key]]));
   const out='ordinary stdout 東京 🧪\n',err='ordinary stderr café 🧬\n';
   const args=['argument with space','--recognizable=東京'];
   const release=resolve(c.storage,'ordinary-child-release');
   const parked=`import {watch,existsSync} from 'node:fs';
await new Promise((settle,reject)=>{
 const watcher=watch('g1-storage',()=>{if(existsSync('g1-storage/ordinary-child-release')){watcher.close();settle();}});
 watcher.on('error',error=>{watcher.close();reject(error);});
 if(existsSync('g1-storage/ordinary-child-release')){watcher.close();settle();}
});
`;
   const parkedRun=async(label:string,childArgs:string[]=[])=>{
    rmSync(release,{force:true});const operation=c.runAsync(label,'private-driver.mjs',childArgs);
    // Handle rejection while waiting for the parent's actual kernel proof.
    void operation.catch(()=>{});
    try{
     const proof=await c.asyncChildReady;
     if(proof===null){writeFileSync(release,'release after refused launch proof');await operation;assert.fail('Actual current child proof required');}
     assert.equal(Object.isFrozen(proof),true);assert.ok(proof.pid>0);assert.equal(proof.ppid,process.pid);assert.ok(proof.birth);assert.match(proof.command,/private-driver\.mjs/);
     assert.equal(Object.hasOwn(proof,'nonce'),false,'Generic child kernel proof carries no private-runner nonce');
     await assert.rejects(()=>c.cancelHarnessPrerequisite(),'An ordinary known-script child has no current private prerequisite operation');
     await assert.rejects(()=>c.runHarnessPrerequisite('ordinary-private-overlap-refused'),/Harness copy operation already active or closed/);
     writeFileSync(release,'release identity-proved ordinary child');
     const result=await operation;assert.deepEqual(result.identity,proof);return result;
    }finally{
     // Even an assertion failure releases and awaits this actual child before
     // the copy's finally cleanup; no timer determines the race outcome.
     writeFileSync(release,'release ordinary child after settlement or failure');
     await Promise.allSettled([operation]);rmSync(release,{force:true});
    }
   };
   c.put('private-driver.mjs',`import assert from 'node:assert/strict';
assert.deepEqual(process.argv.slice(2),${JSON.stringify(args)});
for(const key of ${JSON.stringify(keys)})assert.equal(process.env[key],undefined,key);
for(const key of Object.keys(process.env)){
 if(key==='__CF_USER_TEXT_ENCODING'){
  // CoreFoundation adds this numeric tuple during native macOS startup.
  assert.equal(process.platform,'darwin');assert.match(process.env[key],/^0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+$/);
 }else assert.ok(['PATH','HOME','TMPDIR','LANG','LC_ALL','CI'].includes(key),key);
}
${parked}
process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)});
process.stdout.write(JSON.stringify({pid:process.pid,ppid:process.ppid})+'\\n');
process.exitCode=Number(process.argv[2]==='argument with space'?7:0);
`);
   try{
    for(const key of keys)process.env[key]=key==='NODE_OPTIONS'?'--require='+resolve(c.storage,'never-load-outer-node-options.cjs'):'outer-capability-'+key;
    writeFileSync(release,'synchronous ordinary child is released before spawn');
    let sync:Awaited<ReturnType<HarnessCopy['run']>>;
    try{sync=await c.run('ordinary-capability-nonzero','private-driver.mjs',args);}finally{rmSync(release,{force:true});}
    assert.equal(sync.status,7,sync.stderr);assert.equal(sync.signal,null);
    assert.equal(sync.stdout.split('\n')[0]+'\n',out);assert.equal(sync.stderr,err);
    const asyncResult=await parkedRun('ordinary-capability-async-nonzero',args);
    assert.equal(asyncResult.status,7);assert.equal(asyncResult.signal,null);assert.equal(asyncResult.stderr,err);
    assert.equal(asyncResult.stdout.split('\n')[0]+'\n',out);assert(asyncResult.identity);
    const observed=JSON.parse(asyncResult.stdout.split('\n')[1]!);
    assert.equal(asyncResult.identity.pid,observed.pid);assert.equal(asyncResult.identity.ppid,process.pid);
    assert.equal(asyncResult.identity.ppid,observed.ppid);assert.ok(asyncResult.identity.birth);
    assert.match(asyncResult.identity.command,/private-driver\.mjs/);
    assert.doesNotMatch(asyncResult.stdout+asyncResult.stderr,/storage-test-report|harness-private-gate-pass/);
   }finally{for(const [key,value] of saved)if(value===undefined)delete process.env[key];else process.env[key]=value;}

   // Useful successful control precedes each failure and its fresh recovery.
   c.put('private-driver.mjs',`${parked}process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)});`);
   const success=await parkedRun('ordinary-async-stream-positive');
   assert.equal(success.status,0);assert.equal(success.signal,null);assert.equal(success.stdout,out);assert.equal(success.stderr,err);assert(success.identity);
   const originalSpawn=childProcess.spawn;
   const spawnActual=originalSpawn as (file:string,argv:readonly string[],options?:SpawnOptions)=>ChildProcess;
   try{
    childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>spawnActual(resolve(c.storage,'missing-executable'),argv,options)) as unknown as typeof childProcess.spawn;
    syncBuiltinESMExports();
    let failed:unknown;
    try{await c.runAsync('ordinary-async-spawn-failure','private-driver.mjs');}catch(error){failed=error;}
    assert(failed instanceof AggregateError);
    assert.match(failed.errors.map(error=>String(error)).join('\n'),/ENOENT|missing-executable/);
    const result=(failed as AggregateError & {result:Awaited<ReturnType<HarnessCopy['runAsync']>>}).result;
    assert(result);assert.equal(result.status,-2);assert.equal(result.signal,null);assert.equal(result.identity,null);
    assert.equal(result.stdout,'');assert.equal(result.stderr,'');
   }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
   const spawnRecovery=await parkedRun('ordinary-async-spawn-recovery');
   assert.equal(spawnRecovery.status,0);assert.equal(spawnRecovery.stdout,out);assert.equal(spawnRecovery.stderr,err);
   try{
    childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
     const child=spawnActual(file,argv,options);
     child.stdout!.once('data',()=>queueMicrotask(()=>child.stdout!.emit('error',new Error('F-H actual stdout stream failure'))));
     return child;
    }) as unknown as typeof childProcess.spawn;
    syncBuiltinESMExports();
    let failed:unknown;
    try{await parkedRun('ordinary-async-stream-failure');}catch(error){failed=error;}
    assert(failed instanceof AggregateError);
    assert.match(failed.errors.map(error=>String(error)).join('\n'),/F-H actual stdout stream failure/);
    const result=(failed as AggregateError & {result:Awaited<ReturnType<HarnessCopy['runAsync']>>}).result;
    assert(result);assert.equal(result.status,0);assert.equal(result.signal,null);assert(result.identity);
    assert.equal(result.stdout,out);assert.equal(result.stderr,err);
    assert.doesNotMatch(result.stdout+result.stderr,/storage-test-report|harness-private-gate-pass/);
   }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
   const streamRecovery=await parkedRun('ordinary-async-stream-recovery');
   assert.equal(streamRecovery.status,0);assert.equal(streamRecovery.stdout,out);assert.equal(streamRecovery.stderr,err);
   // A workload or stream failure may prove only settled owned removal. Run
   // each on a fresh hostile copy; the positive input closure gets no driver.
   for(const schedule of ['workload','stream'] as const){
    let failedDirectory='';
    await copy(async owned=>{
     failedDirectory=owned.directory;const ownedRelease=resolve(owned.storage,'ordinary-child-release');
     const runHeld=async(label:string)=>{
      rmSync(ownedRelease,{force:true});const operation=owned.runAsync(label,'private-driver.mjs');void operation.catch(()=>{});
      try{
       const proof=await owned.asyncChildReady;assert(proof);assert.equal(proof.ppid,process.pid);assert.ok(proof.birth);
       writeFileSync(ownedRelease,'release independently identity-proved child');const result=await operation;assert.deepEqual(result.identity,proof);return result;
      }finally{
       writeFileSync(ownedRelease,'release failed child before owned removal');await Promise.allSettled([operation]);rmSync(ownedRelease,{force:true});
      }
     };
     const successful=`${parked}process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)});`;
     owned.put('private-driver.mjs',successful);
     const control=await runHeld('removal-'+schedule+'-positive');assert.equal(control.status,0);assert.equal(control.stdout,out);assert.equal(control.stderr,err);
     if(schedule==='workload'){
      owned.put('private-driver.mjs',successful+"throw new Error('F-H actual workload failed before owned removal');\n");
      const failed=await runHeld('removal-workload-failed');assert.equal(failed.status,1);assert.equal(failed.signal,null);
      assert.equal(failed.stdout,out);assert(failed.stderr.startsWith(err));assert.match(failed.stderr,/F-H actual workload failed before owned removal/);
      assert.doesNotMatch(failed.stdout+failed.stderr,/storage-test-report|harness-private-gate-pass/);
     }else{
      try{
       childProcess.spawn=((file:string,argv:readonly string[]=[],options?:SpawnOptions)=>{
        const child=spawnActual(file,argv,options);child.stdout!.once('data',()=>queueMicrotask(()=>child.stdout!.emit('error',new Error('F-H actual stream failed before owned removal'))));return child;
       }) as unknown as typeof childProcess.spawn;syncBuiltinESMExports();
       let failed:unknown;try{await runHeld('removal-stream-failed');}catch(error){failed=error;}
       assert(failed instanceof AggregateError);assert.match(failed.errors.map(error=>String(error)).join('\n'),/F-H actual stream failed before owned removal/);
       const result=(failed as AggregateError & {result:Awaited<ReturnType<HarnessCopy['runAsync']>>}).result;
       assert(result);assert.equal(result.status,0);assert.equal(result.signal,null);assert(result.identity);assert.equal(result.stdout,out);assert.equal(result.stderr,err);
       assert.doesNotMatch(result.stdout+result.stderr,/storage-test-report|harness-private-gate-pass/);
      }finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();}
     }
     assert.equal(existsSync(owned.directory),true,'Failure is recorded before independently proved removal');
    },false);
    assert.equal(existsSync(failedDirectory),false,'Actual failed '+schedule+' copy is removed after streams/handle settle');
    assert.deepEqual(readFileSync(outerSiblingPath),outerSiblingBytes);assert.deepEqual(readFileSync(originalSourcePath),originalSourceBytes);
    let recoveryDirectory='';await copy(async recovered=>{
     recoveryDirectory=recovered.directory;assert.notEqual(recoveryDirectory,failedDirectory);
     recovered.put('private-driver.mjs',`process.stdout.write(${JSON.stringify(out)});process.stderr.write(${JSON.stringify(err)});`);
     const recovery=await recovered.run('removal-'+schedule+'-fresh-recovery','private-driver.mjs');assert.equal(recovery.status,0);assert.equal(recovery.signal,null);assert.equal(recovery.stdout,out);assert.equal(recovery.stderr,err);
    },false);
    assert.equal(existsSync(recoveryDirectory),false,'Fresh recovery removes only its own new copy');
    assert.deepEqual(readFileSync(outerSiblingPath),outerSiblingBytes);assert.deepEqual(readFileSync(originalSourcePath),originalSourceBytes);
   }
   await privatePrerequisiteFailure('workload',c);
   await privatePrerequisiteFailure('stream',c);
  }
 },false));
 await t.test(prefix+'/unknown-argument',()=>copy(async c=>{
  for(const [script,args] of [
   ['scripts/check.mjs',['extra']],['scripts/check-slice.mjs',['contracts','extra']],
   ['scripts/check-slice.mjs',['unknown']],['scripts/check-component.mjs',['harness-build','extra']],
   ['scripts/check-component.mjs',['unknown']],['scripts/build.mjs',['extra']]
  ] as [string,string[]][]){const r=refused(await c.run('closed-cli',script,args),/Unknown\/extra checker argument|Build accepts no arguments/);assert.doesNotMatch(r.stdout,/strict-build|storage-test-report/);}
  // Exercise the shipped private main entry, not a substitute implementation.
  // This seam remains outside every positive snapshot and every actual child
  // process/stream settles before the hostile copy's existing finally removal.
  c.put('private-driver.mjs',`import assert from 'node:assert/strict';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {spawnSync,fork} from 'node:child_process';import {randomUUID} from 'node:crypto';
if(process.argv.length!==2)throw new Error('Private driver accepts no arguments');
const runner=resolve('g1-storage/scripts/runner.mjs'),nonce=randomUUID();
const imported=await import(pathToFileURL(runner).href);assert.equal(typeof imported.runHarnessPrerequisite,'function');
await assert.rejects(()=>imported.runHarnessPrerequisite(),/Harness prerequisite requires the live private intended operation/);
for(const args of [[],['--unknown'],['invalid-nonce'],[nonce,'extra'],[nonce]]){
 const result=spawnSync(process.execPath,[runner,...args],{cwd:process.cwd(),env:process.env,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,1);
 assert.match(result.stderr,/harness|Harness|prerequisite|nonce|Unknown|IPC|argument/);
 assert.doesNotMatch(result.stdout,/strict-build|storage-candidate|storage-test-report/);
}
const child=fork(runner,[nonce],{cwd:process.cwd(),env:process.env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});
const out=[],err=[],messages=[],failures=[];child.on('message',message=>messages.push(message));
const streams=[child.stdout,child.stderr].map((stream,index)=>new Promise(settle=>{
 let ended=false;stream.on('data',bytes=>(index===0?out:err).push(Buffer.from(bytes)));stream.on('error',error=>failures.push(error));stream.once('end',()=>{ended=true;});stream.once('close',()=>{if(!ended)failures.push(new Error('Private refusal stream closed before end'));settle();});
}));
const closed=new Promise(settle=>{child.on('error',error=>failures.push(error));child.once('close',(status,signal)=>{try{assert.equal(status,1);assert.equal(signal,null);}catch(error){failures.push(error);}settle();});});
await Promise.all([closed,...streams]);if(failures.length)throw new AggregateError(failures,'Actual private refusal and all native streams settled');
assert.match(Buffer.concat(err).toString('utf8'),/positive|Positive|prepared|Prepared|marker|UUID/);
assert.doesNotMatch(Buffer.concat(out).toString('utf8'),/strict-build|storage-candidate|storage-test-report/);
assert.equal(messages.some(message=>message?.type==='harness-prerequisite-ready'),false,'Literal hostile UUID cannot downgrade the private positive operation');
`);
  const entry=passed(await c.run('private-entry-closed-capability','private-driver.mjs'));
  assert.doesNotMatch(entry.stdout,/strict-build|storage-candidate|storage-test-report/);assert.equal(entry.stderr,'');
 },false));
}

export function registerHarnessBuildDiagnostic(){
 test('HARNESS-BUILD/behavior',async t=>{
  await t.test('HARNESS-BUILD/registration-preservation',harnessRegistration);
  await harnessBuildSchedules(t,'HARNESS-BUILD');await harnessResultNegativeSchedules(t,'HARNESS-BUILD');
 });
}
/** Terminal full suite must supply a nonrecursive real full-suite driver; no
 * default, omitted case or synthetic success can complete frozen H02. */
export async function registerHarnessBuildCases(register:Register,goodFullRun:(t:TestContext,c:HarnessCopy)=>Promise<void>){
 await register('H01',async t=>{await harnessRegistration();await harnessBuildSchedules(t);});
 await register('H02',async t=>{await harnessResultNegativeSchedules(t);await t.test('H02/good-full-run',async child=>{
  await copy(async c=>{
   await c.preparePositive();
   await goodFullRun(child,c);
   const {suites}=await import(pathToFileURL(resolve(c.storage,'scripts/manifest.mjs')).href);
   const gate=await import(pathToFileURL(resolve(c.storage,'scripts/suite-execution.mjs')).href);
   const source=resolve(c.storage,'tests'),emitted=resolve(c.cache,'g1-storage/tests');
   gate.validateSuiteFiles(Object.entries(suites),source,emitted);
   for(const suite of Object.values(suites) as {file:string}[])for(const file of [resolve(source,suite.file.replace(/\.js$/,'.ts')),resolve(emitted,suite.file)])assert.ok(readFileSync(file).length>0,'Mandatory full-suite content is empty');
   assert.equal(typeof goodFullRun,'function','Mandatory terminal full-suite execution owner missing');
  });
 });});
}
