import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync,copyFileSync,rmSync,cpSync,readlinkSync,realpathSync } from 'node:fs';
import { resolve,dirname,relative,join,isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID,createHash } from 'node:crypto';
import { spawn,spawnSync,type ChildProcess } from 'node:child_process';
import { type Writable } from 'node:stream';
import { constants,lstat,realpath,readdir,readlink,open,fstatSync,read,close } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const digest=(bytes:string|Buffer)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export const repository=resolve('g1-storage','..');
export const packageRoot=resolve(repository,'g1-storage');
// The runner imports this reproducible F05 allocation outside the package.
// Include its exact bytes so hostile copies reach their intended build gates.
const fixtureInputs:Record<string,string>={
 'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json':'2bd2348ce60cf11ff37a1370cad7c7dfff3a3bd29f63ac434125080b1efce872'
};
export type ChildResult=ReturnType<typeof spawnSync> & {stdout:string;stderr:string};
export type ChildIdentity={pid:number;ppid:number;birth:string;command:string};
export type AsyncChildResult={status:number|null;signal:NodeJS.Signals|null;stdout:string;stderr:string;identity:ChildIdentity|null;nonce?:string};
type RootIdentity={device:number;inode:number;realpath:string};
type CopyInput={path:string;bytes:number;sha256:string;mode:number};
type CopySnapshot={inputs:CopyInput[];sourceFiles:[string,string][];candidate:{digest:string;files:number}};
type InstalledEntry={path:string;type:'directory'|'file'|'link';mode:number;bytes?:number;sha256?:string;target?:string;resolved?:string};
type InstalledTree={owner:string;rootIdentity:RootIdentity;entries:InstalledEntry[]};
type DependencyBinding={original:InstalledTree[];copied:InstalledTree[]};
type PositiveBinding=CopySnapshot & {schema:string;owner:string;directoryIdentity:RootIdentity;rootIdentity:RootIdentity;originRoot:string;originIdentity:RootIdentity;controllerFingerprint:string;dependencies:DependencyBinding};
type InstallationState={paths:string[];prunedAt:string;lastValidatedTimestamp:number};
type InstallWindow={originRoot:string;startedMs:number;finishedMs:number;previous:Pick<InstallationState,'prunedAt'|'lastValidatedTimestamp'>};
type PositiveReader={copyInputSnapshot(root?:string):CopySnapshot;installedDependencySnapshot(root?:string,expected?:InstalledTree[]):Promise<InstalledTree[]>;assertStorageInstallationMetadata(root?:string,shimRoot?:string,window?:InstallWindow|null):InstallationState;liveControllerFingerprint():Promise<string>;evidenceOrigin():Promise<{executionRoot:string;originRoot:string}>};
const storageMetadataPaths=['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'];
const immutableInstalled=(trees:InstalledTree[])=>trees.map(tree=>({...tree,entries:tree.entries.map(entry=>{
 if(tree.owner==='g1-storage'&&storageMetadataPaths.includes(entry.path)){assert.equal(entry.type,'file','Only the five regular storage metadata files may regenerate');return {path:entry.path,type:entry.type,mode:entry.mode};}return entry;
})}));
const rootIdentity=(path:string):RootIdentity=>{const s=lstatSync(path);assert(s.isDirectory()&&!s.isSymbolicLink());return {device:s.dev,inode:s.ino,realpath:realpathSync(path)};};
/** Complete installation census; .cache at the installation root is the sole
 * build-output exclusion. Links are recorded, never followed by the walk. */
// Each two-owner census owns fresh buffers and queues. Directory recursion
// holds no IO slot; a file lease lasts through hashing and the close callback.
function installedLimit() {
 const available:Buffer[]=[];
 try{for(let index=0;index<16;index++){const buffer=Buffer.allocUnsafeSlow(512*1024);available.push(buffer);buffer.fill(0);}}
 catch(error){
  const errors=[error];for(const buffer of available)try{buffer.fill(0);}catch(cause){errors.push(cause);}
  throw new AggregateError(errors,'Installed buffer initialization failed before IO: '+errors.map(cause=>String(cause)).join('; '));
 }
 let poisoned=false,poisonCause:unknown;
 const queued:Array<{start:(buffer:Buffer)=>Promise<void>;no:(error:unknown)=>void}>=[];
 const poison=(error:unknown)=>{if(!poisoned){poisoned=true;poisonCause=error;for(const waiter of queued.splice(0))waiter.no(error);}};
 return <T>(body:(lease:{buffer:Buffer;touched:number;failed:boolean;assertAdmission:()=>void})=>Promise<T>)=>new Promise<T>((yes,no)=>{
  const start=async(buffer:Buffer)=>{
   const lease={buffer,touched:0,failed:false,assertAdmission:()=>{if(poisoned)throw poisonCause;}};
   const errors:unknown[]=[];let value:T|undefined;
   try{value=await body(lease);}catch(error){lease.failed=true;errors.push(error);}finally{
    // A dirty lease cannot reach another unit, even when erasure itself fails.
    try{buffer.fill(0,0,lease.failed?buffer.length:lease.touched);}catch(error){errors.push(error);poison(error);}
    if(!poisoned){const waiter=queued.shift();if(waiter)void waiter.start(buffer);else available.push(buffer);}
   }
   if(errors.length)no(new AggregateError(errors,'Installed lease failed after read/close settlement: '+errors.map(error=>String(error)).join('; ')));else yes(value as T);
  };
  if(poisoned)no(poisonCause);else{const buffer=available.pop();if(buffer)void start(buffer);else queued.push({start,no});}
 });
}
// Callback IO uses one promise per native operation; queues settle before
// their result is exposed and never retain buffers or completed scan results.
function installedIO(){
 let active=0;const queued:Array<()=>void>=[];
 return <T>(invoke:(done:(error:unknown,value:T)=>void)=>void)=>new Promise<T>((yes,no)=>{
  const start=()=>{
   active++;let finished=false;
   const done=(error:unknown,value:T)=>{if(finished)return;finished=true;active--;queued.shift()?.();error?no(error):yes(value);};
   try{invoke(done);}catch(error){done(error,undefined as T);}
  };
  if(active<16)start();else queued.push(start);
 });
}
async function installedSnapshot(atRoot:string,expected?:InstalledTree[]):Promise<InstalledTree[]> {
 if(expected!==undefined){assert(Array.isArray(expected)&&expected.length===2,'Complete expected installation pair required');for(const [index,owner] of ['g1-storage','g1-recovery'].entries())assert.equal(expected[index]?.owner,owner,'Literal expected installed owner order required');}
 const capturedExpected=expected===undefined?undefined:structuredClone(expected);
 const io=installedIO(),readUnit=installedLimit();
 const stat=(full:string)=>io<import('node:fs').BigIntStats>(done=>lstat(full,{bigint:true},done));
 const real=(full:string)=>io<string>(done=>realpath.native(full,done));
 const namesAt=(full:string)=>io<string[]>(done=>readdir(full,done));
 const linkAt=(full:string)=>io<string>(done=>readlink(full,done));
 const identityAt=async (full:string)=>{const s=await stat(full);assert(s.isDirectory()&&!s.isSymbolicLink());return {device:Number(s.dev),inode:Number(s.ino),realpath:await real(full)};};
 const coherent=(after:import('node:fs').BigIntStats,before:import('node:fs').BigIntStats,message:string)=>{for(const key of ['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'] as const)assert.equal(after[key],before[key],message);};
 const trees:InstalledTree[]=[];
 for(const [index,owner] of ['g1-storage','g1-recovery'].entries()){
  const base=resolve(atRoot,owner,'node_modules');
  assert.equal(await real(resolve(atRoot,owner)),resolve(atRoot,owner),'Canonical installed parent required');
  const identity=await identityAt(base),entries:InstalledEntry[]=[];
  const walk=async (full:string,path:string):Promise<void>=>{
   const before=await stat(full),mode=Number(before.mode&0o7777n);
   assert.equal(before.uid,BigInt(process.getuid!()),'Owned dependency required: '+owner+'/'+path);
   if(before.isSymbolicLink()){
    const target=await linkAt(full);assert(!isAbsolute(target)&&!target.includes('\\')&&!target.includes('\0'),'Relative dependency link required: '+owner+'/'+path);
    assert(resolve(dirname(full),target).startsWith(base+'/'),'Escaping dependency link refused: '+owner+'/'+path);
    const actual=await real(full);assert(actual.startsWith(base+'/'),'Foreign dependency link refused: '+owner+'/'+path);
    entries.push({path,type:'link',mode,target,resolved:relative(base,actual)});
    assert.equal(await linkAt(full),target,'Dependency link changed during census');
   }else if(before.isDirectory()){
    entries.push({path,type:'directory',mode});
    const names=(await namesAt(full)).filter(name=>path!=='.'||name!=='.cache').sort();
    const children=await Promise.allSettled(names.map(name=>walk(resolve(full,name),path==='.'?name:path+'/'+name)));
    const errors=children.filter((result):result is PromiseRejectedResult=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Installed descendants failed after all reads and closes settled: '+owner+'/'+path+'; '+errors.map(error=>String(error)).join('; '));
    assert.deepEqual((await namesAt(full)).filter(name=>path!=='.'||name!=='.cache').sort(),names,'Installed path list changed during census');
   }else{
    assert(before.isFile()&&before.nlink===1n,'Private regular installed file required: '+owner+'/'+path);
    const entry=await readUnit(async lease=>{
     const {buffer}=lease,hash=createHash('sha256');let bytes=0,fd:number|undefined;
     const errors:unknown[]=[];
     try{
      fd=await io<number>(done=>{lease.assertAdmission();open(full,constants.O_RDONLY|constants.O_NOFOLLOW,done);});
      const descriptor=fd;
      // Descriptor metadata is read synchronously only inside its IO reservation;
      // payload, pathname and close operations still overlap independently.
      const descriptorStat=()=>io<import('node:fs').BigIntStats>(done=>done(null,fstatSync(descriptor,{bigint:true})));
      coherent(await descriptorStat(),before,'Installed descriptor/path instance changed before read: '+owner+'/'+path);
      for(;;){
       const count=await io<number>(done=>read(descriptor,buffer,0,buffer.length,null,done));
       assert(Number.isSafeInteger(count)&&count>=0&&count<=buffer.length,'Bounded installed read required');
       lease.touched=Math.max(lease.touched,count);
       if(count===0)break;
       bytes+=count;assert(Number.isSafeInteger(bytes)&&BigInt(bytes)<=before.size,'Installed file grew during read: '+owner+'/'+path);
       hash.update(buffer.subarray(0,count));
      }
      assert.equal(BigInt(bytes),before.size,'Complete installed EOF byte count required: '+owner+'/'+path);
      coherent(await descriptorStat(),before,'Installed descriptor changed during read: '+owner+'/'+path);
      coherent(await stat(full),before,'Installed descriptor/path instance changed after read: '+owner+'/'+path);
     }catch(error){errors.push(error);}finally{
      if(fd!==undefined){const descriptor=fd;try{await io<void>(done=>close(descriptor,error=>done(error,undefined)));}catch(error){errors.push(error);}}
     }
     if(errors.length)throw new AggregateError(errors,'Installed read/close failed after settlement: '+owner+'/'+path+'; '+errors.map(error=>String(error)).join('; '));
     return {path,type:'file' as const,mode,bytes,sha256:'sha256:'+hash.digest('hex')};
    });entries.push(entry);
   }
   const after=await stat(full);
   for(const key of ['dev','ino','mode','uid','nlink'] as const)assert.equal(after[key],before[key],'Installed instance changed: '+owner+'/'+path);
   // Root .cache alone may alter root size/timestamps. Non-root entries retain
   // every native field at nanosecond precision and enclosing name lists.
   if(path!=='.')for(const key of ['size','mtimeNs','ctimeNs'] as const)assert.equal(after[key],before[key],'Installed bytes changed during census: '+owner+'/'+path);
  };
  await walk(base,'.');assert.deepEqual(await identityAt(base),identity,'Installed root changed during census');
  const tree={owner,rootIdentity:identity,entries:entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
  if(capturedExpected!==undefined)assert(isDeepStrictEqual(tree,capturedExpected[index]),'Captured installed owner changed: '+owner);
  trees.push(tree);
 }
 return trees;
}
const childEnvironment=()=>{
 const env:NodeJS.ProcessEnv={};
 for(const name of ['PATH','HOME','TMPDIR','LANG','LC_ALL','CI'])if(process.env[name]!==undefined)env[name]=process.env[name];
 env['LC_ALL']='C';return env;
};
const childScripts=new Set(['scripts/build.mjs','scripts/check.mjs','scripts/check-slice.mjs','scripts/check-component.mjs',
 'private-driver.mjs','private-cleanup-driver.mjs','private-observation-driver.mjs']);
function census():ChildIdentity[]{
 const r=spawnSync('/bin/ps',['-ww','-axo','pid=,ppid=,lstart=,command='],{encoding:'utf8',env:{...childEnvironment(),LC_ALL:'en_US.UTF-8'},timeout:3000,maxBuffer:4*1024*1024});
 assert.equal(r.error,undefined,'Mandatory current child process census');assert.equal(r.signal,null);assert.equal(r.status,0,r.stderr);
 return r.stdout.trim().split('\n').map(line=>{
  const m=/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/.exec(line);assert(m,'Complete current process census row');
  return {pid:Number(m[1]),ppid:Number(m[2]),birth:m[3]!,command:m[4]!};
 });
}
function writeOutput(stream:Writable,bytes:Buffer|string):Promise<void>{
 return new Promise((yes,no)=>{
  let settled=false;const finish=(error?:Error|null)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)setImmediate(()=>stream.removeListener('error',failed));else stream.removeListener('error',failed);error?no(error):yes();};
  const failed=(error:Error)=>finish(error),timer=setTimeout(()=>finish(new Error('Harness child output drain exceeded 5000ms')),5000);
  stream.once('error',failed);try{stream.write(bytes,finish);}catch(error){finish(error as Error);}
 });
}
/** F-H owns only regular, reproducible copies. No sibling install or cache is
 * linked into the child. All accepted inputs are copied and rehashed again. */
export class HarnessCopy {
 readonly directory=realpathSync(mkdtempSync(join(tmpdir(),'fabric-storage-harness-')));
 readonly owner=randomUUID();
 readonly root=resolve(this.directory,'candidate');
 readonly storage=resolve(this.root,'g1-storage');
 readonly cache=resolve(this.storage,'node_modules/.cache/storage-build');
 private readonly directoryIdentity=rootIdentity(this.directory);
 private rootProof:RootIdentity|undefined;
 private active=false;
 private closed=false;
 private childReadiness:Promise<Readonly<ChildIdentity>|null>=Promise.resolve(null);
 private prerequisiteControl:{nonce:string;cancel:()=>Promise<void>}|undefined;
 // This is the parent's current kernel proof, not a child protocol or verdict.
 get asyncChildReady(){return this.childReadiness;}
 private markerCreated=false;
 private markerContents:string=this.owner;
 private removalMarkerContents:string|undefined;
 private checkerKeys:{slices:string[];components:string[]}|undefined;
 private positive:PositiveBinding|undefined;
 private originalReader:PositiveReader|undefined;
 private copiedReader:PositiveReader|undefined;
 private installWindow:InstallWindow|null=null;
 private inputs:Record<string,string>={};
 private dependencies:DependencyBinding|undefined;
 private constructor(){}
 static async create(dependencies=true):Promise<HarnessCopy>{
  const copy=new HarnessCopy();copy.active=true;
  try{await copy.initialize(dependencies);return copy;}finally{copy.active=false;}
 }
 private claim(){assert(!this.active&&!this.closed,'Harness copy operation already active or closed');this.active=true;}
 private async initialize(dependencies:boolean){
  try{
  writeFileSync(resolve(this.directory,'owner'),this.owner,{flag:'wx',mode:0o600});this.markerCreated=true;
  this.inputs=JSON.parse(readFileSync(resolve(packageRoot,'verification/preserved-inputs.json'),'utf8')).files;
  mkdirSync(this.root);this.rootProof=rootIdentity(this.root);
  for(const [name,hash] of Object.entries({...this.inputs,...fixtureInputs})){
   assert.equal(digest(readFileSync(resolve(repository,name))).slice(7),hash,name);
   this.copy(resolve(repository,name),resolve(this.root,name));
  }
  const walk=(directory:string)=>{for(const name of readdirSync(directory).sort()){
   if(name==='node_modules')continue;
   const source=resolve(directory,name),s=lstatSync(source);assert.equal(s.isSymbolicLink(),false);
   if(s.isDirectory())walk(source);else this.copy(source,resolve(this.storage,relative(packageRoot,source)));
  }};walk(packageRoot);
  // Reuse verified installed bytes in a private copy. The global offline store
  // is incomplete; no network fetch, shared symlink or install bypass is used.
  if(dependencies){
   const original=await installedSnapshot(repository);
   for(const owner of ['g1-storage','g1-recovery']){
    const installed=resolve(repository,owner,'node_modules');
    cpSync(installed,resolve(this.root,owner,'node_modules'),{recursive:true,verbatimSymlinks:true,mode:constants.COPYFILE_FICLONE,
     filter:path=>{const rel=relative(installed,path);return rel!=='.cache'&&!rel.startsWith('.cache/');}});
   }
   assert(isDeepStrictEqual(await installedSnapshot(repository,original),original),'Original installation changed during copy');
   const copied=await installedSnapshot(this.root);
   assert(isDeepStrictEqual(copied.map(tree=>({owner:tree.owner,entries:tree.entries})),original.map(tree=>({owner:tree.owner,entries:tree.entries}))),'Complete private installed copy required');
   this.dependencies={original,copied};
  }
  this.put('node_modules/.cache/sibling-sentinel','sibling-'+this.owner,true);
  }catch(error){
   try{this.removeOwned();}catch(cleanup){throw new AggregateError([error,cleanup],'F-H setup and owned cleanup failed');}throw error;
  }
 }
 /** Prepare the complete regular positive closure. Installed dependency
  * transitions and private prerequisite dispatch are separate boundaries. */
 async preparePositive(){
  assert(!this.active&&!this.closed&&!this.positive,'Positive copy preparation must be single and inactive');this.active=true;
  try{this.assertOwned();
   const reader=await import(pathToFileURL(resolve(packageRoot,'scripts/delivery-evidence.mjs')).href) as PositiveReader;
   assert(this.dependencies,'Positive copy requires both private installations');reader.assertStorageInstallationMetadata(repository);reader.assertStorageInstallationMetadata(this.root,repository);await this.assertDependencies();
   assert(isDeepStrictEqual(await reader.installedDependencySnapshot(repository,this.dependencies.original),this.dependencies.original),'Independent original installed census');
   assert(isDeepStrictEqual(await reader.installedDependencySnapshot(this.root,this.dependencies.copied),this.dependencies.copied),'Independent private installed census');
   const fingerprint=await reader.liveControllerFingerprint(),snapshot=reader.copyInputSnapshot(repository);
   for(const entry of snapshot.inputs)this.copy(resolve(repository,entry.path),resolve(this.root,entry.path));
   assert.deepEqual(reader.copyInputSnapshot(repository),snapshot,'Original positive inputs changed during preparation');
   assert.deepEqual(reader.copyInputSnapshot(this.root),snapshot,'Complete copied positive input closure required');
   assert.equal(await reader.liveControllerFingerprint(),fingerprint,'Original controller changed during preparation');
   assert(this.rootProof);
   const binding:PositiveBinding={schema:'owned-storage-copy-v1',owner:this.owner,directoryIdentity:this.directoryIdentity,rootIdentity:this.rootProof,
    originRoot:repository,originIdentity:rootIdentity(repository),controllerFingerprint:fingerprint,...snapshot,dependencies:this.dependencies};
   // Source/origin/fingerprint and every immutable installation entry stay
   // captured. Only a proved copied build may advance five destination hashes.
   this.markerContents=JSON.stringify(binding);writeFileSync(resolve(this.directory,'owner'),this.markerContents);
   this.positive=JSON.parse(this.markerContents) as PositiveBinding;this.originalReader=reader;
   this.copiedReader=await import(pathToFileURL(resolve(this.storage,'scripts/delivery-evidence.mjs')).href) as PositiveReader;
   const registry=await import(pathToFileURL(resolve(this.storage,'scripts/registry.mjs')).href) as {executionSuites:Record<string,unknown>;executionComponents:Record<string,unknown>};
   this.checkerKeys={slices:Object.keys(registry.executionSuites),components:Object.keys(registry.executionComponents)};
   await this.assertPositiveWithinOperation();
  }catch(error){
   try{this.removeOwned();}catch(cleanup){throw new AggregateError([error,cleanup],'Positive preparation and independently proved cleanup failed');}throw error;
  }finally{this.active=false;}
 }
 async assertPositive(){
  this.claim();try{await this.assertPositiveWithinOperation();}finally{this.active=false;}
 }
 private async assertPositiveWithinOperation(){
  this.assertOwned();assert(this.positive&&this.originalReader&&this.copiedReader,'Prepared positive copy required');
  const {inputs,sourceFiles,candidate}=this.positive,snapshot={inputs,sourceFiles,candidate};
  assert.deepEqual(this.originalReader.copyInputSnapshot(this.root),snapshot,'Copied positive closure changed');
  assert.deepEqual(this.originalReader.copyInputSnapshot(repository),snapshot,'Original positive closure changed');
  assert.equal(await this.originalReader.liveControllerFingerprint(),this.positive.controllerFingerprint,'Original positive fingerprint changed');
  this.originalReader.assertStorageInstallationMetadata(repository);this.originalReader.assertStorageInstallationMetadata(this.root,this.installWindow?this.root:repository,this.installWindow);
  await this.assertDependencies();assert(isDeepStrictEqual(this.positive.dependencies,this.dependencies),'Parent installed capture must remain unchanged');
  assert.deepEqual(await this.copiedReader.evidenceOrigin(),{executionRoot:this.root,originRoot:repository},'Actual copied reader origin required');
 }
 private async assertDependencies(){
  assert(this.dependencies,'Private installation capture required');
  assert(isDeepStrictEqual(await installedSnapshot(this.root,this.dependencies.copied),this.dependencies.copied),'Copied installed dependency closure changed');
  assert(isDeepStrictEqual(await installedSnapshot(repository,this.dependencies.original),this.dependencies.original),'Original installed dependency closure changed');
 }
 private beginPositiveBuild(script:string,args:string[],prerequisite=false){
  if(!this.positive)return null;
  if(prerequisite)assert(script==='scripts/runner.mjs'&&args.length===1&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(args[0]!),'Exact private prerequisite operation required');
  else if(script==='scripts/build.mjs')assert(args.length===0,'Prepared copy requires the exact standalone build operation');
  else{
   assert(this.checkerKeys,'Prepared copied registry required');
   const valid=script==='scripts/check.mjs'?args.length===0:
    script==='scripts/check-slice.mjs'?args.length===1&&this.checkerKeys.slices.includes(args[0]!):
    script==='scripts/check-component.mjs'?args.length===1&&this.checkerKeys.components.includes(args[0]!):false;
   assert(valid,'Prepared copy requires the exact known checker CLI operation');
  }
  assert(this.originalReader);const state=this.originalReader.assertStorageInstallationMetadata(this.root,this.installWindow?this.root:repository,this.installWindow);
  const startedMs=Date.now();assert(Number.isSafeInteger(startedMs)&&startedMs>=0,'Native copied-build start clock required');
  return {originRoot:repository,startedMs,previous:{prunedAt:state.prunedAt,lastValidatedTimestamp:state.lastValidatedTimestamp}};
 }
 private async settlePositiveBuild(start:Omit<InstallWindow,'finishedMs'>,finishedMs:number,result:{status:number|null;signal:NodeJS.Signals|null;stdout:string},admit:boolean,checker=false){
  assert(this.positive&&this.dependencies&&this.originalReader,'Live positive build capture required');
  const marker=resolve(this.directory,'owner'),currentContents=readFileSync(marker,'utf8');
  if(checker){
   const current=JSON.parse(currentContents) as PositiveBinding;
   const immutable=(binding:PositiveBinding)=>({...binding,dependencies:{...binding.dependencies,copied:immutableInstalled(binding.dependencies.copied)}});
   assert(isDeepStrictEqual(immutable(current),immutable(this.positive)),'Copied checker cannot advance any original, source, origin, fingerprint or immutable owner field');
   this.assertOwned(currentContents);
  }else this.assertOwned();
  assert.deepEqual(rootIdentity(repository),this.positive.originIdentity,'Original root instance protected through copied build');
  const {inputs,sourceFiles,candidate}=this.positive,snapshot={inputs,sourceFiles,candidate};
  assert.deepEqual(this.originalReader.copyInputSnapshot(repository),snapshot,'Original positive closure changed during build');
  assert.deepEqual(this.originalReader.copyInputSnapshot(this.root),snapshot,'Copied positive closure changed during build');
  assert.equal(await this.originalReader.liveControllerFingerprint(),this.positive.controllerFingerprint,'Original controller changed during build');
  assert(isDeepStrictEqual(this.positive.dependencies,this.dependencies),'Unchanged live installed capture required before admission');
  const window={...start,finishedMs};
  this.originalReader.assertStorageInstallationMetadata(repository);this.originalReader.assertStorageInstallationMetadata(this.root,this.root,window);
  assert(isDeepStrictEqual(await installedSnapshot(repository,this.dependencies.original),this.dependencies.original),'Every original installed entry protected through copied build');
  const actual=await installedSnapshot(this.root);
  assert(isDeepStrictEqual(immutableInstalled(actual),immutableInstalled(this.dependencies.copied)),'Copied build may change only five destination byte counts/hashes');
  assert(isDeepStrictEqual(await this.originalReader.installedDependencySnapshot(repository,this.dependencies.original),this.dependencies.original),'Independent original build census required');
  assert(isDeepStrictEqual(await this.originalReader.installedDependencySnapshot(this.root,actual),actual),'Independent private build census required');
  assert.equal(readFileSync(resolve(this.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+this.owner,'Sibling cache protected through copied build');
  const updates=storageMetadataPaths.map(path=>{const entry=actual.find(tree=>tree.owner==='g1-storage')!.entries.find(entry=>entry.path===path)!;assert(entry.type==='file'&&entry.bytes!==undefined&&entry.sha256!==undefined);return {path,bytes:entry.bytes,sha256:entry.sha256};});
  const next=JSON.parse(this.markerContents) as PositiveBinding;
  for(const update of updates){const entry=next.dependencies.copied.find(tree=>tree.owner==='g1-storage')!.entries.find(entry=>entry.path===update.path)!;entry.bytes=update.bytes;entry.sha256=update.sha256;}
  const contents=JSON.stringify(next);
  if(checker){
   assert.equal(currentContents,contents,'Actual runner may advance only the five independently validated destination hashes');
   // Failure is still failure. Independently proved current roots/owner and
   // closed actual bytes permit owned removal even if streams/workload fail;
   // this exact removal binding is never accepted for another operation.
   this.removalMarkerContents=contents;
  }
  assert(admit&&result.status===0&&result.signal===null,'Successful settled copied build required before metadata admission');
  const records=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line) as Record<string,unknown>).filter(row=>row['measurement']==='strict-build');
  assert.equal(records.length,1,'One actual copied strict-build record required');const built=records[0]!;
  assert.equal(built['sourceAndTests'],true);assert.equal(built['cacheCleared'],true);assert.equal(built['node'],'v22.22.3');
  assert.deepEqual(built['pins'],{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'});
  assert.equal(built['dependencyLockDigest'],digest(readFileSync(resolve(this.storage,'pnpm-lock.yaml'))));assert.equal(built['install'],'offline/frozen/ignore-scripts');
  // No whole-census adoption: all non-output fields come from the unchanged
  // parent capture. The child has settled; no reader races this private write.
  if(!checker)try{writeFileSync(marker,contents);}catch(error){try{writeFileSync(marker,this.markerContents);}catch(recovery){throw new AggregateError([error,recovery],'Copied build marker write and restoration failed');}throw error;}
  for(const captured of [this.dependencies,this.positive.dependencies])for(const update of updates){const entry=captured.copied.find(tree=>tree.owner==='g1-storage')!.entries.find(entry=>entry.path===update.path)!;entry.bytes=update.bytes;entry.sha256=update.sha256;}
  this.markerContents=contents;this.removalMarkerContents=undefined;this.installWindow=window;await this.assertPositiveWithinOperation();
 }
 private copy(source:string,target:string){assert.equal(lstatSync(source).isFile(),true);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);assert.deepEqual(readFileSync(target),readFileSync(source));}
 put(name:string,body:string,atRoot=false){const path=resolve(atRoot?this.root:this.storage,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body);return path;}
 async run(label:string,script:string,args:string[]=[]):Promise<ChildResult>{
  this.claim();try{return await this.runWithinOperation(label,script,args);}finally{this.active=false;}
 }
 private async runWithinOperation(label:string,script:string,args:string[]):Promise<ChildResult>{
  this.assertOwned();
  if(this.positive)await this.assertPositiveWithinOperation();
  assert(childScripts.has(script),'Unknown/escaping harness child script');
  if(this.positive)assert(script==='scripts/build.mjs','Prepared checker requires async dispatch');
  const buildStart=this.beginPositiveBuild(script,args);let buildFinishedMs:number|undefined;
  const errors:unknown[]=[];let result:ChildResult|undefined;try{
  result=spawnSync(process.execPath,[resolve(this.storage,script),...args],{cwd:this.root,env:childEnvironment(),encoding:'utf8',timeout:120_000,maxBuffer:32*1024*1024}) as ChildResult;
  buildFinishedMs=Date.now();
  assert.equal(typeof result.stdout,'string');assert.equal(typeof result.stderr,'string');
  console.log(JSON.stringify({measurement:'harness-child-result',label,owner:this.owner,script,args,status:result.status,signal:result.signal,error:result.error?.message??null,
   stdoutBase64:Buffer.from(result.stdout).toString('base64'),stderrBase64:Buffer.from(result.stderr).toString('base64'),stdoutBytes:Buffer.byteLength(result.stdout),stderrBytes:Buffer.byteLength(result.stderr),stdoutSha256:digest(result.stdout),stderrSha256:digest(result.stderr)}));
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  }catch(error){errors.push(error);}finally{
   if(buildStart&&result&&buildFinishedMs!==undefined)try{await this.settlePositiveBuild(buildStart,buildFinishedMs,result,errors.length===0,script!=='scripts/build.mjs');}catch(error){errors.push(error);}
   if(this.positive)try{await this.assertPositiveWithinOperation();}catch(error){errors.push(error);}
   if(this.positive)try{await this.assertDependencies();}catch(error){errors.push(error);}
  }
  if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Harness child and positive guards failed');
  assert(result);return result;
 }
 /** Generic known-script child: unchanged CLI, no private-runner IPC or nonce.
  * Retain complete hostile streams and forward live bytes with backpressure. */
 async runAsync(label:string,script:string,args:string[]=[]):Promise<AsyncChildResult>{
  this.claim();let ready:(identity:Readonly<ChildIdentity>|null)=>void=()=>{};
  this.childReadiness=new Promise(yes=>{ready=yes;});
  try{return await this.runAsyncWithinOperation(label,script,args,ready);}catch(error){ready(null);throw error;}finally{this.active=false;}
 }
 /** The sole positive private operation has a fixed runner, selection and IPC.
  * Ordinary children never receive this nonce or control channel. */
 async runHarnessPrerequisite(label:string):Promise<AsyncChildResult>{
  this.claim();let ready:(identity:Readonly<ChildIdentity>|null)=>void=()=>{};
  this.childReadiness=new Promise(yes=>{ready=yes;});
  try{
   assert(this.positive,'Prepared positive copy required for private prerequisite');
   return await this.runAsyncWithinOperation(label,'scripts/runner.mjs',[randomUUID()],ready,true);
  }catch(error){ready(null);throw error;}finally{this.prerequisiteControl=undefined;this.active=false;}
 }
 async cancelHarnessPrerequisite(){
  assert(this.active&&this.prerequisiteControl,'No current ready private prerequisite operation');
  await this.prerequisiteControl.cancel();
 }
 private async runAsyncWithinOperation(label:string,script:string,args:string[],ready:(identity:Readonly<ChildIdentity>|null)=>void,prerequisite=false):Promise<AsyncChildResult>{
  this.assertOwned();if(this.positive)await this.assertPositiveWithinOperation();
  const buildStart=this.beginPositiveBuild(script,args,prerequisite);let buildFinishedMs:number|undefined;
  const nonce=prerequisite?args[0]!:undefined;
  const startedAt=performance.now();
  const errors:unknown[]=[],stdout:Buffer[]=[],stderr:Buffer[]=[];
  let child:ChildProcess|undefined,identity:ChildIdentity|null=null,status:number|null=null,signal:NodeJS.Signals|null=null;
  let childClosed:Promise<void>|undefined;const streamClosed:Promise<void>[]=[];
  let stdoutBytes=0,stderrBytes=0,overflow=false;
  let timer:ReturnType<typeof setTimeout>|undefined,killTimer:ReturnType<typeof setTimeout>|undefined;
  const pending=new Set<Promise<void>>();
  let cancelRequested=false,cancelAccepted=false;
  const stopPrivate=()=>{
   if(!prerequisite||!child?.connected||cancelRequested)return;
   cancelRequested=true;const processHandle=child;
   // Keep the current channel until the runner's normal finally disconnects.
   // Parent disconnect on pinned Node can prevent its actual close callback.
   const work=new Promise<void>((yes,no)=>{
    assert(processHandle.connected&&processHandle.send,'Live private cancellation IPC required');
    processHandle.send({type:'harness-prerequisite-cancel',operation:'harness-prerequisite',nonce,owner:this.owner},error=>error?no(error):yes());
   }).catch(error=>{errors.push(error);}).finally(()=>{pending.delete(work);});
   pending.add(work);
  };
  const forward=(stream:Writable,bytes:Buffer,input:NodeJS.ReadableStream)=>{
   input.pause();const work=writeOutput(stream,bytes).catch(error=>{errors.push(error);stopPrivate();}).finally(()=>{pending.delete(work);input.resume();});pending.add(work);
  };
  try{
   assert(prerequisite||childScripts.has(script),'Unknown/escaping harness child script');
   const before=census(),argv=[resolve(this.storage,script),...args],command=[process.execPath,...argv].join(' ');
   child=spawn(process.execPath,argv,{cwd:this.root,env:childEnvironment(),stdio:prerequisite?['ignore','pipe','pipe','ipc']:['ignore','pipe','pipe']});
   const processHandle=child;
   const operation='harness-prerequisite',markerSha256=digest(this.markerContents);
   let receivedReady=false;
   let readyProtocol:(ok:boolean)=>void=()=>{},acknowledgeCancel:(ok:boolean)=>void=()=>{};
   const protocolReady=new Promise<boolean>(yes=>{readyProtocol=yes;}),cancelAcknowledged=new Promise<boolean>(yes=>{acknowledgeCancel=yes;});
   const send=(message:Record<string,unknown>)=>new Promise<void>((yes,no)=>{
    assert(processHandle.connected&&processHandle.send,'Live private IPC required');
    processHandle.send(message,error=>error?no(error):yes());
   });
   if(prerequisite)processHandle.on('message',(message:unknown)=>{
    try{
     const value=message as Record<string,unknown>;
     if(!receivedReady){
      assert.deepEqual(value,{type:'harness-prerequisite-ready',operation,nonce,owner:this.owner,pid:processHandle.pid,ppid:process.pid,root:this.root,markerSha256},'Exact live private runner readiness required');
      receivedReady=true;readyProtocol(true);
     }else{
      assert(cancelRequested&&!cancelAccepted,'Only one requested current cancellation acknowledgement permitted');
      assert.deepEqual(value,{type:'harness-prerequisite-cancel-accepted',operation,nonce,owner:this.owner},'Exact current cancellation acknowledgement required');
      cancelAccepted=true;acknowledgeCancel(true);
     }
    }catch(error){
     errors.push(error);readyProtocol(false);acknowledgeCancel(false);
     // Disconnect cancels only this live operation. Its active suite retains
     // normal finally ownership; no historical PID or descendant is signalled.
     stopPrivate();
    }
   });
   const launched=new Promise<boolean>(yes=>{processHandle.once('spawn',()=>yes(true));processHandle.once('error',()=>yes(false));});
   childClosed=new Promise<void>(yes=>{
    processHandle.on('error',error=>errors.push(error));
    processHandle.once('close',(code,sig)=>{status=code;signal=sig;buildFinishedMs=Date.now();readyProtocol(false);acknowledgeCancel(false);yes();});
   });
   const streams=[processHandle.stdout!,processHandle.stderr!];
   for(const [index,input] of streams.entries())streamClosed.push(new Promise<void>(yes=>{
    let end=false;
    input.on('error',error=>{errors.push(error);stopPrivate();});input.once('end',()=>{end=true;});
    input.once('close',()=>{if(!end&&!processHandle.pid)end=true;if(!end){errors.push(new Error('Harness child stream closed before complete end'));stopPrivate();}yes();});
    input.on('data',(value:Buffer)=>{
     const bytes=Buffer.from(value);if(index===0)stdoutBytes+=bytes.length;else stderrBytes+=bytes.length;
     if((index===0?stdoutBytes:stderrBytes)<=32*1024*1024)(index===0?stdout:stderr).push(bytes);
     else if(!overflow){overflow=true;errors.push(new Error('Harness child output exceeds complete 32MiB retention bound'));stopPrivate();}
     forward(index===0?process.stdout:process.stderr,bytes,input);
    });
   }));
   // Darwin can publish '(node)' immediately after exec, before argv is visible.
   // Keep the current birth/parent bound through that specific startup state;
   // only the full exact command can qualify the operation. No extra CLI/IPC.
   try{
    assert(await launched,'Actual child spawn required');
    assert(processHandle.pid,'Current spawned child PID required');
    let birth:string|undefined;
    while(identity===null){
     assert(performance.now()-startedAt<120_000,'Hostile harness child exceeded 120000ms during startup');
     assert(processHandle.exitCode===null&&processHandle.signalCode===null,'Child exited before exact launch proof');
     const row=census().find(r=>r.pid===processHandle.pid);assert(row,'Current child birth instance required');
     assert.equal(row.ppid,process.pid);assert(!before.some(r=>r.pid===row.pid),'Child PID already present before launch');
     birth??=row.birth;assert.equal(row.birth,birth,'Child birth substitution during startup refused');
     if(row.command===command){identity=row;if(!prerequisite)ready(Object.freeze({...row}));break;}
     assert(process.platform==='darwin'&&row.command==='(node)','Exact current child command required: '+row.command);
     await new Promise<void>(yes=>setImmediate(yes));
    }
    if(prerequisite){
     assert(await protocolReady,'Private runner exited/refused before live readiness');
     assert(identity&&nonce,'Current nonce-owned child proof required');
     const assertCurrent=()=>{
      assert(processHandle.exitCode===null&&processHandle.signalCode===null&&processHandle.pid===identity!.pid,'Current private child handle required');
      assert.deepEqual(census().find(row=>row.pid===identity!.pid),identity,'Current private child birth/parent/command substitution refused');
     };
     assertCurrent();
     this.prerequisiteControl={nonce,cancel:async()=>{
      assertCurrent();assert(!cancelRequested,'Current prerequisite cancellation already requested');cancelRequested=true;
      await send({type:'harness-prerequisite-cancel',operation,nonce,owner:this.owner});
      assert(await cancelAcknowledged,'Current prerequisite cancellation must be acknowledged before settlement');
     }};
     ready(Object.freeze({...identity}));
     await send({type:'harness-prerequisite-start',operation,nonce,owner:this.owner,root:this.root,markerSha256,identity});
    }
   }catch(error){errors.push(error);ready(null);stopPrivate();}
   const signalOwned=(sig:NodeJS.Signals)=>{
    if(processHandle.exitCode!==null||processHandle.signalCode!==null)return;
    assert(identity&&processHandle.pid===identity.pid,'Current child handle and birth proof required');
    const rows=census();assert.deepEqual(rows.find(r=>r.pid===identity!.pid),identity,'Current child birth/parent/command substitution refused');
    assert(!rows.some(r=>r.ppid===identity!.pid),'Active child descendants must settle before signal');
    assert.equal(processHandle.kill(sig),true,'Current owned child signal failed');
   };
   if(!this.positive||script==='scripts/build.mjs')timer=setTimeout(()=>{
    errors.push(new Error('Hostile harness child exceeded 120000ms'));
    try{signalOwned('SIGTERM');killTimer=setTimeout(()=>{try{signalOwned('SIGKILL');}catch(error){errors.push(error);}},5000);}catch(error){errors.push(error);}
   },Math.max(0,120_000-(performance.now()-startedAt)));
   await Promise.all([childClosed,...streamClosed]);if(timer)clearTimeout(timer);if(killTimer)clearTimeout(killTimer);
   await Promise.all([...pending]);
   if(!overflow){assert.equal(Buffer.concat(stdout).length,stdoutBytes,'Complete stdout retained');assert.equal(Buffer.concat(stderr).length,stderrBytes,'Complete stderr retained');}
   if(signal!==null)errors.push(new Error('Harness child terminated by '+signal));
   if(prerequisite&&status!==0)errors.push(new Error('Private prerequisite workload failed ('+status+')'));
   if(prerequisite&&cancelRequested)errors.push(new Error('Current private prerequisite cancelled after normal suite settlement'));
   if(identity){const rows=census();assert(!rows.some(r=>r.pid===identity!.pid),'Owned child process must be reaped');assert(!rows.some(r=>r.ppid===identity!.pid),'Owned child descendants must settle');}
   // Prepared checkers validate the exact five-field transition on settlement;
   // their admitted marker must not be compared to the prebuild byte string.
   if(!buildStart||script==='scripts/build.mjs')this.assertOwned();
  }catch(error){errors.push(error);ready(null);}
  finally{
   // A startup/proof/stream failure still waits for the actual handle and both
   // pipes; releasing this copy can never race a child left in flight.
   if(childClosed)await childClosed;await Promise.all(streamClosed);await Promise.all([...pending]);
   if(timer)clearTimeout(timer);if(killTimer)clearTimeout(killTimer);
   const drained=await Promise.allSettled([writeOutput(process.stdout,''),writeOutput(process.stderr,'')]);
   for(const result of drained)if(result.status==='rejected')errors.push(result.reason);
   if(buildStart&&buildFinishedMs!==undefined)try{await this.settlePositiveBuild(buildStart,buildFinishedMs,{status,signal,stdout:Buffer.concat(stdout).toString('utf8')},errors.length===0&&!overflow,script!=='scripts/build.mjs');}catch(error){errors.push(error);}
   if(this.positive)try{await this.assertPositiveWithinOperation();}catch(error){errors.push(error);}
   if(this.positive)try{await this.assertDependencies();}catch(error){errors.push(error);}
   ready(null);
  }
  const out=Buffer.concat(stdout),err=Buffer.concat(stderr);
  const result:AsyncChildResult={status,signal,stdout:out.toString('utf8'),stderr:err.toString('utf8'),identity,...(nonce===undefined?{}:{nonce})};
  try{await writeOutput(process.stdout,JSON.stringify({measurement:'harness-async-child-result',label,owner:this.owner,script,args,status,signal,identity,stdoutBytes,stderrBytes,stdoutSha256:digest(out),stderrSha256:digest(err),complete:!overflow,success:errors.length===0&&status===0,failures:errors.map(error=>String(error))})+'\n');}catch(error){errors.push(error);}
  if(errors.length)throw Object.assign(new AggregateError(errors,'Harness async child failed; streams and ownership retained'),{result});
  return result;
 }
 private assertOwned(expectedContents=this.markerContents){
  assert.deepEqual(rootIdentity(this.directory),this.directoryIdentity,'Refusing substituted harness directory');
  assert.equal(realpathSync(dirname(this.directory)),dirname(this.directory),'Refusing substituted harness parent');
  const marker=resolve(this.directory,'owner');
  if(this.markerCreated){const s=lstatSync(marker);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid?.()&&(s.mode&0o777)===0o600,'Private regular harness owner required');
   assert(readFileSync(marker,'utf8')===expectedContents,'Refusing substituted harness owner');
  }else assert(!exists(marker),'Unproved constructor owner marker');
  if(this.rootProof)assert.deepEqual(rootIdentity(this.root),this.rootProof,'Refusing substituted harness candidate root');
 }
 private removeOwned(){
  this.assertOwned(this.removalMarkerContents??this.markerContents);
  rmSync(this.directory,{recursive:true});assert.equal(exists(this.directory),false);
  this.closed=true;
 }
 async close(){
  assert(!this.active,'Active harness child must settle before copy cleanup');assert(!this.closed,'Harness copy already closed');this.active=true;
  try{await this.closeWithinOperation();}finally{this.active=false;}
 }
 private async closeWithinOperation(){
  const errors:unknown[]=[];let siblingPreserved=false;
  try{assert.equal(readFileSync(resolve(this.root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+this.owner);siblingPreserved=true;}catch(error){errors.push(error);}
  if(this.positive)try{await this.assertPositiveWithinOperation();}catch(error){errors.push(error);}
  for(const [name,hash] of Object.entries({...this.inputs,...fixtureInputs}))for(const root of [repository,this.root])try{assert.equal(digest(readFileSync(resolve(root,name))).slice(7),hash,name);}catch(error){errors.push(error);}
  try{this.removeOwned();}catch(error){errors.push(error);}
  // Even a failed pre-remove guard cannot skip original protection checks.
  for(const [name,hash] of Object.entries({...this.inputs,...fixtureInputs}))try{assert.equal(digest(readFileSync(resolve(repository,name))).slice(7),hash,name);}catch(error){errors.push(error);}
  if(this.positive&&this.dependencies)try{assert(isDeepStrictEqual(await installedSnapshot(repository,this.dependencies.original),this.dependencies.original),'Original installations changed during cleanup');}catch(error){errors.push(error);}
  if(this.positive&&this.originalReader)try{const {inputs,sourceFiles,candidate}=this.positive;assert.deepEqual(this.originalReader.copyInputSnapshot(repository),{inputs,sourceFiles,candidate},'Original positive closure changed during cleanup');assert.equal(await this.originalReader.liveControllerFingerprint(),this.positive.controllerFingerprint);}catch(error){errors.push(error);}
  console.log(JSON.stringify({measurement:'harness-copy-cleanup',owner:this.owner,removed:this.closed,protectedInputs:Object.keys(this.inputs).length,fixtureInputs:Object.keys(fixtureInputs).length,siblingPreserved,success:errors.length===0}));
  if(errors.length)throw new AggregateError(errors,'Harness copy guards and independently proved cleanup failed');
 }
}
function exists(path:string){try{lstatSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return false;}}
