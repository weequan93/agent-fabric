import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync,lstatSync,readdirSync,realpathSync,readlinkSync,constants,lstat,realpath,readdir,readlink,open,fstatSync,read,close} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cwd,root} from './paths.mjs';
import {candidateSnapshot} from './candidate.mjs';
import {suites} from './manifest.mjs';
import {fullDescriptor} from './full-composition.mjs';
import {decodeMeasurement} from './measurement-transport.mjs';

const cases=['D02','D06'];
const variants=Object.fromEntries(cases.map(id=>[id,suites['delivery-audit'].variants[id]]));
const required=JSON.parse(readFileSync(resolve(cwd,'verification/required-variants-v1.json'),'utf8'));
for(const id of cases)assert.deepEqual(variants[id],required.cases[id]);
assert.equal(Object.values(variants).flat().length,7);
export const deliveryEvidenceComponent=Object.freeze({file:'components/delivery-evidence.test.js',cases,integration:false,positives:null,variants});
const goalPath='.loop/goals/agent-fabric-g1-f05-storage';
export const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const json=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
function ownedFile(atRoot,path){
 assert(typeof path==='string'&&!isAbsolute(path)&&!path.includes('\\')&&!path.includes('\0')&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Closed repository-relative input path required');
 const base=resolve(atRoot);assert.equal(realpathSync(base),base,'Canonical input root required');
 let full=base;const parts=path.split('/');
 for(const [index,part] of parts.entries()){
  full=resolve(full,part);const stat=lstatSync(full);
  assert(!stat.isSymbolicLink(),'Symlink input refused: '+path);
  if(index<parts.length-1)assert(stat.isDirectory(),'Regular input parent required: '+path);
  else assert(stat.isFile()&&stat.nlink===1,'Private regular input required: '+path);
 }
 return full;
}
function fileEntry(atRoot,path){
 const full=ownedFile(atRoot,path),before=lstatSync(full),bytes=readFileSync(full),after=lstatSync(full);
 assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);assert.equal(after.size,before.size);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.mode,before.mode);assert.equal(after.nlink,1);
 return {path,bytes:bytes.length,sha256:digest(bytes),mode:before.mode&0o777};
}
function directoryIdentity(path){const s=lstatSync(path);assert(s.isDirectory()&&!s.isSymbolicLink(),'Actual owned directory required');return {device:s.dev,inode:s.ino,realpath:realpathSync(path)};}
/** Independently enumerate installed bytes and relative links; no mutable
 * package baseline or successful install is inferred from this input census. */
// Each two-owner census owns fresh buffers and queues. Directory recursion
// holds no IO slot; a file lease lasts through hashing and the close callback.
function installedLimit() {
 const available=[];
 try{for(let index=0;index<16;index++){const buffer=Buffer.allocUnsafeSlow(512*1024);available.push(buffer);buffer.fill(0);}}
 catch(error){
  const errors=[error];for(const buffer of available)try{buffer.fill(0);}catch(cause){errors.push(cause);}
  throw new AggregateError(errors,'Installed buffer initialization failed before IO: '+errors.map(cause=>String(cause)).join('; '));
 }
 let poisoned=false,poisonCause;
 const queued=[];
 const poison=error=>{if(!poisoned){poisoned=true;poisonCause=error;for(const waiter of queued.splice(0))waiter.no(error);}};
 return body=>new Promise((yes,no)=>{
  const start=async buffer=>{
   const lease={buffer,touched:0,failed:false,assertAdmission:()=>{if(poisoned)throw poisonCause;}};
   const errors=[];let value;
   try{value=await body(lease);}catch(error){lease.failed=true;errors.push(error);}finally{
    // A dirty lease cannot reach another unit, even when erasure itself fails.
    try{buffer.fill(0,0,lease.failed?buffer.length:lease.touched);}catch(error){errors.push(error);poison(error);}
    if(!poisoned){const waiter=queued.shift();if(waiter)void waiter.start(buffer);else available.push(buffer);}
   }
   if(errors.length)no(new AggregateError(errors,'Installed lease failed after read/close settlement: '+errors.map(error=>String(error)).join('; ')));else yes(value);
  };
  if(poisoned)no(poisonCause);else{const buffer=available.pop();if(buffer)void start(buffer);else queued.push({start,no});}
 });
}
// Callback IO uses one promise per native operation; queues settle before
// their result is exposed and never retain buffers or completed scan results.
function installedIO(){
 let active=0;const queued=[];
 return (invoke)=>new Promise((yes,no)=>{
  const start=()=>{
   active++;let finished=false;
   const done=(error,value)=>{if(finished)return;finished=true;active--;queued.shift()?.();error?no(error):yes(value);};
   try{invoke(done);}catch(error){done(error,undefined);}
  };
  if(active<16)start();else queued.push(start);
 });
}
export async function installedDependencySnapshot(atRoot=root,expected=undefined) {
 const baseRoot=resolve(atRoot);
 if(expected!==undefined){assert(Array.isArray(expected)&&expected.length===2,'Complete expected installation pair required');for(const [index,owner] of ['g1-storage','g1-recovery'].entries())assert.equal(expected[index]?.owner,owner,'Literal expected installed owner order required');}
 const capturedExpected=expected===undefined?undefined:structuredClone(expected);
 const io=installedIO(),readUnit=installedLimit();
 const stat=full=>io(done=>lstat(full,{bigint:true},done));
 const real=full=>io(done=>realpath.native(full,done));
 const namesAt=full=>io(done=>readdir(full,done));
 const linkAt=full=>io(done=>readlink(full,done));
 const identityAt=async full=>{const s=await stat(full);assert(s.isDirectory()&&!s.isSymbolicLink());return {device:Number(s.dev),inode:Number(s.ino),realpath:await real(full)};};
 const coherent=(after,before,message)=>{for(const key of ['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key],message);};
 const trees=[];
 for(const [index,owner] of ['g1-storage','g1-recovery'].entries()){
  const base=resolve(baseRoot,owner,'node_modules');
  assert.equal(await real(resolve(baseRoot,owner)),resolve(baseRoot,owner),'Canonical installed package parent required');
  const identity=await identityAt(base),entries=[];
  const walk=async (full,path)=>{
   const before=await stat(full),mode=Number(before.mode&0o7777n);
   assert.equal(before.uid,BigInt(process.getuid()),'Owned dependency required: '+owner+'/'+path);
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
    const errors=children.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Installed descendants failed after all reads and closes settled: '+owner+'/'+path+'; '+errors.map(error=>String(error)).join('; '));
    assert.deepEqual((await namesAt(full)).filter(name=>path!=='.'||name!=='.cache').sort(),names,'Installed path list changed during census');
   }else{
    assert(before.isFile()&&before.nlink===1n,'Private regular installed file required: '+owner+'/'+path);
    const entry=await readUnit(async lease=>{
     const {buffer}=lease,hash=createHash('sha256');let bytes=0,fd;
     const errors=[];
     try{
      fd=await io(done=>{lease.assertAdmission();open(full,constants.O_RDONLY|constants.O_NOFOLLOW,done);});
      const descriptor=fd;
      // Keep both actual descriptor checks inside the bounded IO reservation.
      const descriptorStat=()=>io(done=>done(null,fstatSync(descriptor,{bigint:true})));
      coherent(await descriptorStat(),before,'Installed descriptor/path instance changed before read: '+owner+'/'+path);
      for(;;){
       const count=await io(done=>read(descriptor,buffer,0,buffer.length,null,done));
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
      if(fd!==undefined){const descriptor=fd;try{await io(done=>close(descriptor,error=>done(error,undefined)));}catch(error){errors.push(error);}}
     }
     if(errors.length)throw new AggregateError(errors,'Installed read/close failed after settlement: '+owner+'/'+path+'; '+errors.map(error=>String(error)).join('; '));
     return {path,type:'file',mode,bytes,sha256:'sha256:'+hash.digest('hex')};
    });entries.push(entry);
   }
   const after=await stat(full);
   for(const key of ['dev','ino','mode','uid','nlink'])assert.equal(after[key],before[key],'Installed instance changed: '+owner+'/'+path);
   // Root .cache alone may alter root size/timestamps. Non-root entries retain
   // every native field at nanosecond precision and enclosing name lists.
   if(path!=='.')for(const key of ['size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key],'Installed bytes changed during census: '+owner+'/'+path);
  };
  await walk(base,'.');assert.deepEqual(await identityAt(base),identity,'Installed root changed during census');
  const tree={owner,rootIdentity:identity,entries:entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
  if(capturedExpected!==undefined)assert(isDeepStrictEqual(tree,capturedExpected[index]),'Captured installed owner changed: '+owner);
  trees.push(tree);
 }
 return trees;
}
/** Closed pnpm10.18.0 metadata, independently pinned to the storage graph.
 * Initial original-root shims remain quarantined. A supervisor's build window
 * permits only the two native timestamps to change; census/owner advancement
 * and child admission remain the executing parent/runner's responsibility. */
const storageMetadataPaths=Object.freeze(['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml']);
const initialShimTemplate="#!/bin/sh\nbasedir=$(dirname \"$(echo \"$0\" | sed -e 's,\\\\,/,g')\")\n\ncase `uname` in\n    *CYGWIN*|*MINGW*|*MSYS*)\n        if command -v cygpath > /dev/null 2>&1; then\n            basedir=`cygpath -w \"$basedir\"`\n        fi\n    ;;\nesac\n\nif [ -z \"$NODE_PATH\" ]; then\n  export NODE_PATH=\"__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules/typescript/bin/node_modules:__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules/typescript/node_modules:__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules:__INSTALLED_ROOT__/.pnpm/node_modules\"\nelse\n  export NODE_PATH=\"__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules/typescript/bin/node_modules:__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules/typescript/node_modules:__INSTALLED_ROOT__/.pnpm/typescript@5.9.3/node_modules:__INSTALLED_ROOT__/.pnpm/node_modules:$NODE_PATH\"\nfi\nif [ -x \"$basedir/node\" ]; then\n  exec \"$basedir/node\"  \"$basedir/../.pnpm/typescript@5.9.3/node_modules/typescript/bin/__BIN__\" \"$@\"\nelse\n  exec node  \"$basedir/../.pnpm/typescript@5.9.3/node_modules/typescript/bin/__BIN__\" \"$@\"\nfi\n";
const modulesTemplate="hoistPattern:\n  - '*'\nhoistedDependencies:\n  pg-cloudflare@1.4.1:\n    pg-cloudflare: private\n  pg-connection-string@2.14.1:\n    pg-connection-string: private\n  pg-int8@1.0.1:\n    pg-int8: private\n  pg-pool@3.14.0(pg@8.16.3):\n    pg-pool: private\n  pg-protocol@1.16.1:\n    pg-protocol: private\n  pg-types@2.2.0:\n    pg-types: private\n  pgpass@1.0.5:\n    pgpass: private\n  postgres-array@2.0.0:\n    postgres-array: private\n  postgres-bytea@1.0.1:\n    postgres-bytea: private\n  postgres-date@1.0.7:\n    postgres-date: private\n  postgres-interval@1.2.0:\n    postgres-interval: private\n  split2@4.2.0:\n    split2: private\n  undici-types@6.21.0:\n    undici-types: private\n  xtend@4.0.2:\n    xtend: private\nincluded:\n  dependencies: true\n  devDependencies: true\n  optionalDependencies: true\ninjectedDeps: {}\nlayoutVersion: 5\nnodeLinker: isolated\npackageManager: pnpm@10.18.0\npendingBuilds: []\nprunedAt: __PRUNED_AT__\npublicHoistPattern: []\nregistries:\n  '@jsr': https://npm.jsr.io/\n  default: https://registry.npmjs.org/\nskipped: []\nstoreDir: /private/tmp/agent-fabric-pnpm-store/v10\nvirtualStoreDir: .pnpm\nvirtualStoreDirMaxLength: 120\n";
const workspaceFields={"projects":{},"pnpmfiles":[],"settings":{"autoInstallPeers":true,"dedupeDirectDeps":false,"dedupeInjectedDeps":true,"dedupePeerDependents":true,"dev":true,"excludeLinksFromLockfile":false,"hoistPattern":["*"],"hoistWorkspacePackages":true,"injectWorkspacePackages":false,"linkWorkspacePackages":false,"nodeLinker":"isolated","optional":true,"preferWorkspacePackages":false,"production":true,"publicHoistPattern":[]},"filteredInstall":false};
export function assertStorageInstallationMetadata(atRoot=root,shimRoot=atRoot,installWindow=null){
 const base=resolve(atRoot),shimBase=resolve(shimRoot),installed=resolve(base,'g1-storage/node_modules');
 assert.equal(realpathSync(base),base,'Canonical installation metadata root required');
 assert.equal(realpathSync(shimBase),shimBase,'Canonical quarantined shim origin required');
 assert.equal(process.version,'v22.22.3','Pinned metadata Node required');
 // A supplied interval validates an observed private build's output; it does
 // not update the positive owner marker or adopt any installed census. The
 // parent/runner must capture it around their actual unchanged build before
 // using this validator at their own dispatch/settlement boundary.
 let previous=null;
 if(installWindow!==null){
  assert(typeof installWindow==='object'&&!Array.isArray(installWindow),'Closed copied-build window required');
  assert.deepEqual(Object.keys(installWindow).sort(),['originRoot','startedMs','finishedMs','previous'].sort(),'Closed copied-build window fields required');
  const {originRoot,startedMs,finishedMs}=installWindow;
  assert(typeof originRoot==='string'&&isAbsolute(originRoot)&&resolve(originRoot)===originRoot&&originRoot!==base,'Distinct canonical original install root required');
  assert.equal(realpathSync(originRoot),originRoot,'Actual original install root required');
  assert.equal(shimBase,base,'Regenerated storage shims must be copy-local');
  assert(Number.isSafeInteger(startedMs)&&startedMs>=0&&Number.isSafeInteger(finishedMs)&&finishedMs>=startedMs&&finishedMs<=Date.now(),'Nonregressed native-millisecond copied-build window required');
  previous=installWindow.previous;
  assert(previous&&typeof previous==='object'&&!Array.isArray(previous),'Captured previous copied metadata required');
  assert.deepEqual(Object.keys(previous).sort(),['prunedAt','lastValidatedTimestamp'].sort(),'Closed previous copied timestamp fields required');
  assert(typeof previous.prunedAt==='string'&&new Date(previous.prunedAt).toUTCString()===previous.prunedAt&&Number.isFinite(Date.parse(previous.prunedAt)),'Native UTC-second previous modules timestamp required');
  assert(Number.isSafeInteger(previous.lastValidatedTimestamp)&&previous.lastValidatedTimestamp>=0,'Native integer-millisecond previous workspace timestamp required');
  assertStorageInstallationMetadata(originRoot);
 }
 const read=path=>{
  const full=ownedFile(base,'g1-storage/'+path),before=lstatSync(full,{bigint:true});
  assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n,'Private regular installation metadata required: '+path);
  assert.equal(before.uid,BigInt(process.getuid()),'Owned installation metadata required: '+path);
  const bytes=readFileSync(full),after=lstatSync(full,{bigint:true});assert.equal(BigInt(bytes.length),before.size,'Complete installation metadata read required: '+path);
  for(const key of ['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key],'Installation metadata changed during read: '+path);
  return {bytes,mode:Number(before.mode&0o7777n)};
 };
 const metadata=new Map(storageMetadataPaths.map(path=>[path,read('node_modules/'+path)]));
 const text=path=>{const bytes=metadata.get(path).bytes,value=bytes.toString('utf8');assert(bytes.equals(Buffer.from(value,'utf8')),'Exact UTF-8 metadata required: '+path);return value;};
 const pkg=JSON.parse(read('package.json').bytes);
 const pins={pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'};
 assert.equal(pkg.packageManager,'pnpm@10.18.0');assert.equal(pkg.engines.node,'22.22.3');
 assert(isDeepStrictEqual({...pkg.dependencies,...pkg.devDependencies},pins),'Independent storage dependency pins required');
 assert.deepEqual(readdirSync(resolve(installed,'.bin')).sort(),['tsc','tsserver'],'Closed storage launcher names required');
 for(const name of ['tsc','tsserver']){
  const path='.bin/'+name;
  assert.equal(metadata.get(path).mode,0o755,'Pinned storage shim mode required: '+path);
  const expected=initialShimTemplate.replaceAll('__INSTALLED_ROOT__',resolve(shimBase,'g1-storage/node_modules')).replaceAll('__BIN__',name);
  assert(text(path)===expected,'Exact pinned quarantined storage shim template required: '+path);
  const target=realpathSync(resolve(installed,'.pnpm/typescript@5.9.3/node_modules/typescript/bin',name));
  assert.equal(target,resolve(installed,'.pnpm/typescript@5.9.3/node_modules/typescript/bin',name),'Confined TypeScript shim exec target required');
  for(const suffix of ['.pnpm/typescript@5.9.3/node_modules/typescript/bin/node_modules','.pnpm/typescript@5.9.3/node_modules/typescript/node_modules','.pnpm/typescript@5.9.3/node_modules','.pnpm/node_modules']){
   let ancestor=resolve(installed,suffix);
   for(;;){try{lstatSync(ancestor);break;}catch(error){if(error.code!=='ENOENT')throw error;ancestor=dirname(ancestor);}}
   const actual=realpathSync(ancestor);assert(actual.startsWith(installed+'/'),'Confined NODE_PATH existing ancestor required');
   assert(lstatSync(actual).isDirectory(),'Directory NODE_PATH existing ancestor required');
  }
 }
 for(const path of storageMetadataPaths.filter(path=>!path.startsWith('.bin/')))assert.equal(metadata.get(path).mode,0o644,'Pinned storage metadata mode required: '+path);
 const modules=text('.modules.yaml'),pruned=modules.match(/^prunedAt: ([^\n]+)$/m)?.[1];
 assert(pruned&&new Date(pruned).toUTCString()===pruned&&Number.isFinite(Date.parse(pruned)),'Native UTC-second modules timestamp required');
 assert(modules.replace(/^prunedAt: [^\n]+$/m,'prunedAt: __PRUNED_AT__')===modulesTemplate,'Closed modules fields, graph, registries and local store required');
 const workspaceText=text('.pnpm-workspace-state-v1.json'),workspace=JSON.parse(workspaceText),timestamp=workspace.lastValidatedTimestamp;
 assert(Number.isSafeInteger(timestamp)&&timestamp>=0,'Native integer-millisecond workspace timestamp required');
 const expectedWorkspace={lastValidatedTimestamp:timestamp,...workspaceFields};
 assert(isDeepStrictEqual(workspace,expectedWorkspace),'Closed workspace keys, settings, projects and hooks required');
 assert(workspaceText===JSON.stringify(expectedWorkspace,null,2)+'\n','Exact pinned workspace serialization required');
 if(previous){
  const {startedMs,finishedMs}=installWindow;
  const prunedSecond=Date.parse(pruned)/1000;
  assert(pruned===previous.prunedAt||(prunedSecond>=Math.floor(startedMs/1000)&&prunedSecond<=Math.floor(finishedMs/1000)),'Changed modules timestamp must belong to the copied-build window at native second precision');
  assert(timestamp===previous.lastValidatedTimestamp||(timestamp>=startedMs&&timestamp<=finishedMs),'Changed workspace timestamp must belong to the copied-build window at native millisecond precision');
 }
 const wanted=read('pnpm-lock.yaml').bytes,lock=metadata.get('.pnpm/lock.yaml').bytes;
 assert.equal(digest(wanted),'sha256:ca42a644c6d09dd16500bb4b7d2f1a5885bb796e4660b3ac974bdb68a2c37ec4','Independent storage wanted lock pin required');
 assert(lock.equals(wanted),'Storage current/wanted installed lock equality required');
 const data=JSON.parse(read('dependencies.json').bytes);
 assert.equal(data.schemaVersion,1);assert.equal(data.observedAt,'2026-10-08');assert.equal(data.node,'22.22.3');assert.equal(data.packageManager,'pnpm@10.18.0');
 assert.equal(data.lockSha256,digest(wanted).slice(7));assert.equal(data.dependencies.length,18);
 for(const [name,version] of Object.entries(pins)){
  const actual=realpathSync(resolve(installed,name,'package.json'));assert(actual.startsWith(installed+'/'),'Private installed pinned package required');
  assert.equal(JSON.parse(read(relative(resolve(base,'g1-storage'),actual)).bytes).version,version,'Independent installed version pin: '+name);
 }
 for(const dependency of data.dependencies){
  assert(dependency.installedPath.startsWith('node_modules/.pnpm/')&&dependency.localPatches.length===0,'Closed installed metadata package path required');
  const bytes=read(dependency.installedPath+'/package.json').bytes,declared=JSON.parse(bytes);
  assert.equal(digest(bytes),'sha256:'+dependency.packageJsonSha256,'Independent installed package hash required');
  assert.equal(declared.name,dependency.name);assert.equal(declared.version,dependency.version);
  assert(isDeepStrictEqual(declared.license??'unknown',dependency.declaredLicense),'Installed package license declaration required');
  for(const notice of dependency.notices){
   assert(notice.path.startsWith('notices/')&&!notice.installedName.includes('/'),'Closed installed notice path required');
   for(const path of [notice.path,dependency.installedPath+'/'+notice.installedName])assert.equal(digest(read(path).bytes),'sha256:'+notice.sha256,'Independent installed notice pin required');
  }
 }
 // Re-read the five bytes/modes after all template and payload reads.
 for(const [path,before] of metadata){const after=read('node_modules/'+path);assert(after.mode===before.mode&&after.bytes.equals(before.bytes),'Initial metadata changed during validation: '+path);}
 return {paths:[...storageMetadataPaths],prunedAt:pruned,lastValidatedTimestamp:timestamp};
}
/** The complete regular input closure, derived from actual sources/state. It
 * neither creates controller state nor treats historical results as current. */
export function copyInputSnapshot(atRoot=root){
 const base=resolve(atRoot),inputs=new Map(),sourceFiles=[];
 const add=(path,pin=null)=>{
  const entry=fileEntry(base,path);if(pin)assert.equal(entry.sha256,pin.startsWith('sha256:')?pin:'sha256:'+pin,'Pinned copy input: '+path);
  if(inputs.has(path))assert.deepEqual(inputs.get(path),entry,'Conflicting copy input: '+path);else inputs.set(path,entry);
  return entry;
 };
 const readJson=path=>{add(path);return JSON.parse(readFileSync(ownedFile(base,path),'utf8'));};
 const preserved=readJson('g1-storage/verification/preserved-inputs.json');
 for(const [path,hash] of Object.entries(preserved.files))add(path,hash);
 const walk=directory=>{for(const name of readdirSync(directory).sort()){
  if(name==='node_modules')continue;const full=resolve(directory,name),s=lstatSync(full);assert(!s.isSymbolicLink(),'Candidate symlink refused');
  if(s.isDirectory())walk(full);else{assert(s.isFile(),'Regular candidate file required');const entry=add(relative(base,full));sourceFiles.push([relative(resolve(base,'g1-storage'),full),entry.sha256.slice(7)]);}
 }};walk(resolve(base,'g1-storage'));
 add('docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json','2bd2348ce60cf11ff37a1370cad7c7dfff3a3bd29f63ac434125080b1efce872');
 for(const path of ['docs/loop/agent-fabric-g1-f05-storage/plan-turn55/repair-case-allocation.json','docs/planning/g1-f05-plan.md','docs/evidence/g1-f05-acceptance.md','docs/evidence/g1-f05-delivery-inventory.md'])add(path);
 const obligation=readJson('g1-storage/verification/obligation-to-test-v1.json');add(obligation.requirementsSource);
 const inventory=readJson('g1-storage/verification/delivery-inventory-v1.json');
 for(const [path,hash] of Object.entries(inventory.sourceFiles))add(path,hash);
 add('.loop/bin/loop');const goal=readJson(goalPath+'/goal.json'),state=readJson(goalPath+'/state.json');add(goalPath+'/events.jsonl');
 const definitions=checkDefinitions(goal,state);
 for(const [id,result] of Object.entries(state.checks))if(result.finished_at){
  assert(definitions[id],'Actual finished check definition required: '+id);
  assert.match(result.log,new RegExp('^'+goalPath.replaceAll('.','\\.')+'/runs/checks/job-[a-f0-9]+/[^/]+$'));
  assert.equal(result.log.split('/').at(-1),id,'Finished check log binding');
  add(result.log+'/stdout.log');add(result.log+'/stderr.log');
 }
 const failure=goalPath+'/runs/checks/job-bef5a26060/f05-15-docs.delivery-operations-component/';
 for(const [name,bytes,sha256] of [['stdout',169738,'4a6b1a4a4d03c5b702d51af33eca62a1e0e78dd67a81f4ca6ef19ab2a31c6ae0'],['stderr',2165,'c5c4576d5868611faf8b824974ade32ac89735935871030259e94df04e20df53']]){
  const entry=add(failure+name+'.log',sha256);assert.equal(entry.bytes,bytes,'Pinned historical failure bytes');
 }
 const recovery=inventory.observedRecovery.stdout,entry=add(recovery.path,recovery.sha256);assert.equal(entry.bytes,recovery.bytes,'Pinned recovery stream bytes');
 return {inputs:[...inputs.keys()].sort().map(path=>inputs.get(path)),sourceFiles,candidate:{digest:digest(JSON.stringify(sourceFiles)),files:sourceFiles.length}};
}
export function fingerprintAt(origin){
 const launcher=readFileSync(ownedFile(origin,'.loop/bin/loop'),'utf8');
 const library=launcher.match(/^PYTHONPATH=([^$\n]+)\$\{PYTHONPATH/m)?.[1],python=launcher.match(/ exec ([^ ]+) -m loop_engineering /)?.[1];
 assert(library&&python,'Installed controller launcher required');
 assert.equal(launcher.match(/ -m loop_engineering --project ([^\n]+) "\$@"\n?$/)?.[1],origin,'Actual installed launcher --project origin required');
 const env={};for(const key of ['PATH','HOME','TMPDIR','LANG','LC_ALL','CI'])if(process.env[key]!==undefined)env[key]=process.env[key];env.PYTHONPATH=library;
 const result=spawnSync(python,['-c','from pathlib import Path; from loop_engineering.checks import fingerprint; import sys; print(fingerprint(Path(sys.argv[1])))',origin],{env,encoding:'utf8',timeout:90_000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout.trim(),/^git:[a-f0-9]{24}$/);return result.stdout.trim();
}
export async function evidenceOrigin(){
 const executionRoot=resolve(root),directory=dirname(executionRoot);
 // A relocated execution cannot fall back to a synthetic walk fingerprint.
 if(basename(executionRoot)!=='candidate'||!basename(directory).startsWith('fabric-storage-harness-'))return {executionRoot,originRoot:executionRoot};
 const marker=resolve(directory,'owner'),s=lstatSync(marker);
 assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid?.()&&(s.mode&0o777)===0o600,'Private positive copy marker required');
 const binding=JSON.parse(readFileSync(marker,'utf8'));
 assert.deepEqual(Object.keys(binding).sort(),['schema','owner','directoryIdentity','rootIdentity','originRoot','originIdentity','controllerFingerprint','candidate','inputs','sourceFiles','dependencies'].sort(),'Closed positive copy marker fields required');
 assert.equal(binding.schema,'owned-storage-copy-v1');assert.match(binding.owner,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.deepEqual(directoryIdentity(directory),binding.directoryIdentity,'Current positive copy directory required');assert.deepEqual(directoryIdentity(executionRoot),binding.rootIdentity,'Current positive candidate root required');
 const originRoot=binding.originRoot;assert(typeof originRoot==='string'&&isAbsolute(originRoot)&&resolve(originRoot)===originRoot&&originRoot!==executionRoot,'Actual original origin required');
 assert.deepEqual(directoryIdentity(originRoot),binding.originIdentity,'Current original root identity required');
 const copied=copyInputSnapshot(executionRoot);
 assert.deepEqual(copied.inputs,binding.inputs,'Complete immutable copy input closure required');assert.deepEqual(copied.sourceFiles,binding.sourceFiles,'Complete immutable source list required');assert.deepEqual(copied.candidate,binding.candidate,'Actual copy/original candidate equality required');
 const copiedDependencies=await installedDependencySnapshot(executionRoot,binding.dependencies.copied);
 assert.equal(fingerprintAt(originRoot),binding.controllerFingerprint,'Live original controller fingerprint required');
 const original=copyInputSnapshot(originRoot);
 assert.deepEqual(original.inputs,binding.inputs,'Complete immutable copy input closure required');assert.deepEqual(original.sourceFiles,binding.sourceFiles,'Complete immutable source list required');assert.deepEqual(original.candidate,binding.candidate,'Actual copy/original candidate equality required');
 assertStorageInstallationMetadata(originRoot);
 const originalDependencies=await installedDependencySnapshot(originRoot,binding.dependencies.original);
 assert(isDeepStrictEqual(binding.dependencies,{original:originalDependencies,copied:copiedDependencies}),'Complete original/private installed closure required');
 const immutable=trees=>trees.map(tree=>({owner:tree.owner,entries:tree.entries.map(entry=>{
  if(tree.owner==='g1-storage'&&storageMetadataPaths.includes(entry.path)){assert.equal(entry.type,'file','Only five regular private storage outputs may regenerate');return {path:entry.path,type:entry.type,mode:entry.mode};}return entry;
 })}));
 assert(isDeepStrictEqual(immutable(copiedDependencies),immutable(originalDependencies)),'Every immutable private installed payload/mode/type/link/path remains original-equal');
 const entry=(trees,path)=>trees.find(tree=>tree.owner==='g1-storage').entries.find(entry=>entry.path===path);
 const initial=storageMetadataPaths.every(path=>isDeepStrictEqual(entry(copiedDependencies,path),entry(originalDependencies,path)));
 // The marker transports only parent-admitted destination hashes. It is no
 // independent build proof: the live supervisor validates the actual child,
 // previous timestamps and enclosing interval before advancing these hashes.
 // D independently binds current bytes and every unchanged original entry.
 assertStorageInstallationMetadata(executionRoot,initial?originRoot:executionRoot);
 for(const [index,tree] of copiedDependencies.entries())assert.notDeepEqual(tree.rootIdentity,originalDependencies[index].rootIdentity,'Distinct private installation roots required');
 assert(isDeepStrictEqual(await installedDependencySnapshot(originRoot,originalDependencies),originalDependencies),'Original installations changed during copied evidence reading');
 assert.deepEqual(copyInputSnapshot(originRoot),original,'Original inputs changed during copied evidence reading');
 assert.equal(fingerprintAt(originRoot),binding.controllerFingerprint,'Original controller changed during copied evidence reading');
 return {executionRoot,originRoot};
}
export function streamInfo(path){
 const full=resolve(root,path),rel=relative(root,full);
 assert(!isAbsolute(rel)&&!rel.startsWith('../'),'Evidence must remain repository-owned');
 ownedFile(root,path);
 const bytes=readFileSync(full);return {path,bytes:bytes.length,sha256:digest(bytes)};
}
export function assertStream(bytes,expected){assert.equal(bytes.length,expected.bytes,'Complete stream byte count');assert.equal(digest(bytes),expected.sha256,'Original stream SHA256');}
// Scope is derived from the raw TAP line, never from the JSON payload. Keep
// payloads unchanged for existing all-depth fixture and cleanup consumers.
const contexts=new WeakMap();
export function records(bytes){
 const rows=[];
 for(const [order,line] of bytes.toString().split(/\r?\n/).entries()){
  const prefix=/^(?:[ \t]*\\?# )*/.exec(line)[0];
  const text=line.slice(prefix.length);
  if(!text.startsWith('{'))continue;
  let value;try{value=JSON.parse(text);}catch{continue;}
  if(!value||typeof value!=='object'||Array.isArray(value))continue;
  contexts.set(value,Object.freeze({prefix,depth:(prefix.match(/#/g)??[]).length,order}));rows.push(value);
 }
 return rows;
}
export function recordContext(row){
 const context=contexts.get(row);assert(context,'Record must originate in the actual raw stream reader');return context;
}
export function outerRecords(rows){return rows.filter(row=>recordContext(row).prefix==='');}
function sameScope(a,b){const x=recordContext(a),y=recordContext(b);return x.depth===y.depth&&x.prefix===y.prefix;}
function commandRecords(rows){
 const decoded=[];
 for(let index=0;index<rows.length;index++){
  const first=rows[index];
  if(first.measurement!=='storage-measurement-transport'||first.kind!=='start'||first.binding?.phase!=='command')continue;
  // A complete command transport must be contiguous at its original depth.
  assert(Number.isSafeInteger(first.count)&&first.count>0,'Complete command transport required');
  const frames=rows.slice(index,index+first.count+2);assert(frames.every(r=>sameScope(first,r)),'Command transport depth changed');
  const {record}=decodeMeasurement(frames,first.binding);
  assert(['storage-parent-start','storage-parent-return'].includes(record.measurement));assert.equal(record.phase,'command');
  decoded.push({record,binding:first.binding,context:recordContext(first),end:recordContext(frames.at(-1)).order});
  index+=first.count+1;
 }
 return decoded;
}
export async function liveControllerFingerprint(){
 // Use the installed controller's own read-only implementation; do not approximate
 // its candidate algorithm or write framework state.
 return fingerprintAt((await evidenceOrigin()).originRoot);
}
export function checkDefinitions(goal,state){
 const result={};for(const c of goal.acceptance)result['acceptance.'+c.id]=c;
 for(const t of state.tasks)for(const c of t.checks??[])result[t.id+'.'+c.id]=c;
 return result;
}
export async function inspectRun(id,result,definition,current){
 return inspectRunAt(id,result,definition,current,(await evidenceOrigin()).originRoot);
}
function inspectRunAt(id,result,definition,current,originRoot){
 assert(definition,'Actual controller check definition required: '+id);
 const prefix=goalPath+'/runs/checks/';assert(result.log.startsWith(prefix));
 const relativeLog=result.log.slice(prefix.length),parts=relativeLog.split('/');assert.equal(parts.length,2);assert.equal(parts[1],id);assert.match(parts[0],/^job-[a-f0-9]+$/);
 assert(Number.isSafeInteger(result.duration_ms)&&result.duration_ms>=0);assert(result.started_at&&result.finished_at);assert(Date.parse(result.finished_at)>=Date.parse(result.started_at));
 const stdout=streamInfo(result.log+'/stdout.log'),stderr=streamInfo(result.log+'/stderr.log');
 const raw=readFileSync(resolve(root,stdout.path)),rows=records(raw),outer=outerRecords(rows),candidates=outer.filter(r=>r.measurement==='storage-candidate');assert(candidates.length<=1,'Exactly one outer candidate provenance');const candidate=candidates[0]?.digest??null;
 const command=definition.run??definition.argv.join(' ');
 const commands=commandRecords(outer).filter(r=>r.record.measurement==='storage-parent-start');assert(commands.length<=1,'Exactly one outer command provenance');
 const emitted=commands[0]?.binding??null;
 if(emitted){assert.equal(emitted.candidate,candidate);const args=definition.argv??definition.run.split(' ');assert.equal(emitted.command.cwd,resolve(originRoot,definition.cwd??'.'));assert.equal(relative(originRoot,emitted.command.args[0]),args[1]);assert.deepEqual(emitted.command.args.slice(1),args.slice(2));}
 return {id,job:parts[0],command,definition,elapsedMs:result.duration_ms,status:result.status,exitCode:result.exit_code,outcome:result.outcome,cleanup:result.cleanup,workspaceChanged:result.workspace_changed??false,
  commandBinding:emitted?.command??{source:'controller-qualified-check-dispatch',definitionId:id},controllerFingerprint:result.fingerprint,candidate,candidateCurrent:candidate===current.candidate.digest,workspaceCurrent:result.fingerprint===current.controllerFingerprint,
  stdout,stderr,rows};
}
export function assertCurrentRun(run,current){
 assert.equal(run.status,'pass');assert.equal(run.exitCode,0);assert.equal(run.outcome,'completed');assert.equal(run.controllerFingerprint,current.controllerFingerprint,'Stale controller workspace result');
 if(run.command.includes('g1-storage/'))assert.equal(run.candidate,current.candidate.digest,'Stale F05 candidate result');
}
function assertCleanup(rows){
 const origins=rows.filter(r=>r.measurement==='storage-owned-fixture');assert(origins.length>0,'Actual owned fixture origins');
 for(const f of origins){
  const containers=rows.filter(r=>r.measurement==='storage-container-cleanup'&&r.owner===f.owner&&r.instance===f.instance&&r.containerId===f.containerId);
  const roots=rows.filter(r=>r.measurement==='storage-root-cleanup'&&r.owner===f.owner&&r.instance===f.instance&&r.rootId===f.fixtureRoot.rootId);
  assert.equal(containers.length,1);assert.equal(containers[0].removed,true);assert.equal(containers[0].censusUnchanged,true);assert.equal(roots.length,1);assert.equal(roots[0].removed,true);assert(rows.indexOf(f)<rows.indexOf(containers[0])&&rows.indexOf(containers[0])<rows.indexOf(roots[0]),'Owned container cleanup precedes root cleanup');assert.deepEqual(roots[0].rootIds,Object.values(f.roots).map(r=>r.rootId));
 }
 for(const process of rows.filter(r=>r.measurement==='model-owned-process')){
  const removed=rows.filter(r=>r.measurement==='model-owned-process-cleanup'&&r.pid===process.pid);assert.equal(removed.length,1);assert.equal(removed[0].removed,true);
 }
}
function freshBuild(build){
 assert.equal(build.sourceAndTests,true,'Successful fresh source/test build required');assert.equal(build.cacheCleared,true,'Fresh build cache required');
 assert.equal(build.node,'v22.22.3');assert.deepEqual(build.pins,{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'});
 const dependencies=json('g1-storage/dependencies.json');
 assert.equal(build.dependencyLockDigest,'sha256:'+dependencies.lockSha256);assert.equal(build.install,'offline/frozen/ignore-scripts');
}
function assertReports(actual,selected,registry,candidate){
 assert.deepEqual(actual.map(r=>r.suite),selected.map(([id])=>id),'Exact mandatory suite order plus atomic-disconnect');
 for(const [id,suite] of selected){
  const components=id==='recall-ask'?registry.recallAskObservationSources.map(s=>registry.executionComponents[s.component]):id==='backup-restore'?registry.backupRestoreObservationSources.map(s=>registry.executionComponents[s.component]):id==='commit-conflict'?[...registry.commitConflictPredecessors.map(c=>registry.executionComponents[c]),suite]:[suite];
  const expectedCases=components.flatMap(c=>c.cases),expectedVariants=Object.assign({},...components.map(c=>c.variants));
  const reports=actual.filter(r=>r.suite===id);assert.equal(reports.length,1);const r=reports[0];
  for(const field of ['fail','cancelled','skipped','todo'])assert.equal(r[field],0,'No failed/cancelled/skipped/TODO workload: '+id);
  const descriptor=fullDescriptor(id);
  if(descriptor){assert.deepEqual(r.cases,descriptor.parents);assert.deepEqual(r.executions,descriptor.executions);assert.equal(r.tests,descriptor.parents.length+descriptor.leaves);assert.equal(r.variants.length,descriptor.leaves);}
  else assert.equal(r.cases.length,expectedCases.length);
  for(const c of expectedCases){assert(r.cases.some(name=>name===c||name.startsWith(c+' / ')),c);for(const leaf of expectedVariants[c])assert.equal(r.executions.filter(e=>e.indent===4&&e.name===leaf&&(e.parent===c||e.parent.startsWith(c+' / '))).length,1,leaf);}
  if(!descriptor){assert.equal(r.tests,expectedCases.length+Object.values(expectedVariants).flat().length);assert.equal(r.variants.length,Object.values(expectedVariants).flat().length);}
  assert.equal(r.executions.length,r.tests);assert.deepEqual(r.variants,r.executions.filter(e=>e.indent>0).map(e=>e.name));
  const checkObservation=(o,required,suiteId)=>{
   assert(o&&o.suite===suiteId,'Actual observation identity required: '+suiteId);
   assert.deepEqual(Object.keys(o.violations??{}).sort(),['unauthorizedDisclosure','unauthorizedMutation','silentLostUpdate','duplicateCanonicalEffect','restrictedResurrection','askComputerStart'].sort(),'Complete zero-violation observation counters required');
   assert(Object.values(o.violations).every(n=>Number.isSafeInteger(n)&&n===0),'Every reported finite violation remains zero');
   for(const name of required)assert(Number.isSafeInteger(o.positives?.[name])&&o.positives[name]>=1,'Useful positive observation required: '+name);
  };
  if(descriptor){
   assert.equal(r.observations?.measurement,'storage-full-observation-composition');assert.equal(r.observations.suite,id);assert.equal(r.observations.candidate,candidate);
   assert.deepEqual(r.observations.sources.map(s=>s.registration),descriptor.registrations.map(s=>s.id),'Every full observation source in original order');
   for(const [index,spec] of descriptor.registrations.entries())checkObservation(r.observations.sources[index].observation,spec.positives,spec.suite);
  }else if(['commit-conflict','recall-ask','backup-restore'].includes(id)){
   const sources=id==='commit-conflict'?registry.commitConflictObservationSources:id==='recall-ask'?registry.recallAskObservationSources:registry.backupRestoreObservationSources;
   assert.equal(r.observations.length,sources.length,'Every original observation source required');
   for(const [index,source] of sources.entries())checkObservation(r.observations[index],registry.executionComponents[source.component].positives,source.suite??source.component);
  }else if(suite.positives!==null)checkObservation(r.observations,suite.positives,id);
 }
}
function segment(rows,commands,mode,report,candidate){
 const scope=recordContext(report);
 const matching=commands.filter(c=>c.context.prefix===scope.prefix&&c.context.depth===scope.depth&&c.record.mode===mode);
 const starts=matching.filter(c=>c.record.measurement==='storage-parent-start'),returns=matching.filter(c=>c.record.measurement==='storage-parent-return');
 assert.equal(starts.length,1,'Exactly one '+mode+' command start');assert.equal(returns.length,1,'Exactly one '+mode+' command return');
 const start=starts[0],end=returns[0];assert(start.end<scope.order&&scope.order<end.context.order,'Report inside its actual command segment');
 assert.deepEqual(end.binding,start.binding,'Same command provenance on settlement');assert.equal(end.record.success,true,'Successful command settlement required');
 assert.equal(start.binding.candidate,candidate);assert.equal(start.record.candidate,candidate);assert.equal(end.record.candidate,candidate);
 const previous=commands.filter(c=>c.context.prefix===scope.prefix&&c.context.depth===scope.depth&&c.end<start.context.order&&c.record.measurement==='storage-parent-return').at(-1)?.end??-1;
 const local=rows.filter(r=>sameScope(report,r)&&recordContext(r).order>previous&&recordContext(r).order<end.end);
 const candidates=local.filter(r=>r.measurement==='storage-candidate'&&recordContext(r).order<start.context.order);
 assert.equal(candidates.length,1,'Exactly one candidate for the actual command');assert.equal(candidates[0].digest,candidate);assert.equal(candidates[0].diagnosticOnly,mode!=='aggregate');
 const builds=local.filter(r=>r.measurement==='strict-build');assert.equal(builds.length,1,'Exactly one '+mode+' fresh strict build');
 assert(start.end<recordContext(builds[0]).order&&recordContext(builds[0]).order<scope.order,'Own command build precedes report');freshBuild(builds[0]);
 const reports=local.filter(r=>r.measurement==='storage-test-report');assert.equal(reports.length,1,'Exactly one report in command segment');assert.equal(reports[0],report);
 const guards=local.filter(r=>r.measurement==='preserved-inputs');assert(guards.length>=2,'Before/after command preservation guards');for(const g of guards){assert.equal(g.files,2581);assert.equal(g.unchanged,true);}
 return {start,end,rows:rows.filter(r=>{const c=recordContext(r);return c.prefix.startsWith(scope.prefix)&&c.depth>=scope.depth&&c.order>previous&&c.order<end.end;})};
}
export function assertAggregateCoverage(run,registry){
 assert(registry,'Current execution registry required');
 const outer=outerRecords(run.rows),reports=outer.filter(r=>r.measurement==='storage-test-report');assert.equal(reports.length,1,'Exactly one genuine outer aggregate report');
 const report=reports[0];assert.equal(report.scope,'aggregate');assert.equal(report.diagnosticOnly,false);assert.equal(report.externalQualification,'pending');
 const commands=commandRecords(run.rows),outerCommands=commands.filter(c=>c.context.prefix==='');
 assert.equal(outerCommands.filter(c=>c.record.measurement==='storage-parent-start').length,1,'Exactly one genuine outer command start');assert.equal(outerCommands.filter(c=>c.record.measurement==='storage-parent-return').length,1,'Exactly one genuine outer command return');
 assert.equal(outer.filter(r=>r.measurement==='storage-candidate').length,1,'Exactly one genuine outer candidate');
 const own=segment(run.rows,commands,'aggregate',report,run.candidate);
 assert.deepEqual(own.start.binding.command,run.commandBinding,'Outer command provenance must match inspected controller command');
 const outerBuilds=outer.filter(r=>r.measurement==='strict-build');assert.equal(outerBuilds.length,1,'Exactly one genuine outer strict build');
 assertReports(report.reports,Object.entries(registry.executionSuites),registry,run.candidate);
 const nested=run.rows.filter(r=>recordContext(r).depth>0&&r.measurement==='storage-test-report'&&r.scope==='harness-prerequisite');
 assert.equal(nested.length,1,'Exactly one nested H02 prerequisite report');const prerequisite=nested[0];assert.equal(prerequisite.diagnosticOnly,true);assert.equal(prerequisite.externalQualification,'pending');
 const child=segment(run.rows,commands,'harness-prerequisite',prerequisite,run.candidate);
 assert(own.start.end<child.start.context.order&&child.end.end<recordContext(report).order,'Nested prerequisite must settle inside the actual outer command before its report');
 const command=child.start.binding.command;
 assert.equal(command.executable,own.start.binding.command.executable);assert.notEqual(command.cwd,own.start.binding.command.cwd,'Prerequisite must execute its own copied root');
 assert.equal(command.args[0],resolve(command.cwd,'g1-storage/scripts/runner.mjs'));assert.equal(command.args.length,2);assert.match(command.args[1],/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 const selected=Object.entries(registry.executionSuites).filter(([id])=>id!=='harness');
 assert.deepEqual(selected.map(([id])=>id),['contracts','authority','owned-encryption','commit-conflict','atomic-disconnect','recall-ask','lifecycle-propagation','volume-draft','backup-restore','delivery-audit']);
 assertReports(prerequisite.reports,selected,registry,run.candidate);
 // Validate nested closure independently as well as retaining all-depth outer
 // closure. Other H diagnostics must neither supply nor hide prerequisite cleanup.
 for(const [rows,actual] of [[child.rows,prerequisite.reports],[run.rows,report.reports]]){
  const admitted=actual.flatMap(r=>r.observations?.sources??[]).flatMap(s=>[...(s.fixtures??[]),...(s.cleanup??[])]);
  const cleanupRows=[...rows,...admitted].filter((v,i,all)=>!['storage-owned-fixture','storage-container-cleanup','storage-root-cleanup'].includes(v.measurement)||all.findIndex(w=>w.measurement===v.measurement&&w.owner===v.owner&&w.instance===v.instance)===i);
  assertCleanup(cleanupRows);
 }
}
export function severeFindings(findings){
 return findings.filter(f=>!['rejected','resolved','closed'].includes(f.status)&&(f.severity==='high'||f.severity==='critical'||/\b(high.severity|release.blocking|blocking security)\b/i.test(f.text??'')));
}
export function reviewState(state,events,fingerprint){
 return Object.fromEntries(['security','code','final-acceptance','product-acceptance'].map(id=>{
  const controllerId=id;
  const r=state.reviews[controllerId];
  const registered=!!r&&r.by==='reviewer'&&events.some(e=>e.type==='review.recorded'&&e.at===r.at&&e.data.review===controllerId&&e.data.verdict===r.verdict&&e.data.by===r.by);
  const current=!!r&&r.fingerprint===fingerprint;
  return [id,{status:!r?'pending':!registered?'unregistered':!current?'stale':r.verdict,by:r?.by??null,registered,current,early:r?.early??false}];
 }));
}
export function qualification(audit,{findings=audit.state.findings,claim=null}={}){
 const blockers=[];
 if(claim)blockers.push('Author claims cannot issue controller acceptance');
 for(const f of severeFindings(findings))blockers.push('Unresolved severe finding: '+f.id);
 for(const id of ['full-storage-behavior','identity-retained','foundation-retained','original-retained']){
  const r=audit.latest.find(r=>r.id==='f05-15.'+id);if(!r)blockers.push('Missing terminal controller check: '+id);else try{assertCurrentRun(r,audit.current);}catch{blockers.push('Failed or stale terminal controller check: '+id);}
 }
 if(!audit.state.verification?.passed||audit.state.verification.fingerprint!==audit.current.controllerFingerprint)blockers.push('Missing current controller final acceptance');
 for(const [id,r] of Object.entries(reviewState(audit.state,audit.events,audit.current.controllerFingerprint)))if(r.status!=='pass'||r.early)blockers.push('Independent verdict '+id+': '+r.status);
 return {qualified:blockers.length===0,blockers,externalQualification:'pending',authorVerdict:false};
}
export async function inspectEvidence(){
 const origin=await evidenceOrigin();
 const goal=json(goalPath+'/goal.json'),state=json(goalPath+'/state.json'),events=readFileSync(resolve(root,goalPath+'/events.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse);
 const current={candidate:candidateSnapshot(),controllerFingerprint:fingerprintAt(origin.originRoot),lock:streamInfo('g1-storage/pnpm-lock.yaml')};
 const definitions=checkDefinitions(goal,state),latest=[];
 for(const [id,result] of Object.entries(state.checks))if(result.finished_at)latest.push(inspectRunAt(id,result,definitions[id],current,origin.originRoot));
 const inventory=json('g1-storage/verification/delivery-inventory-v1.json');
 for(const [path,hash] of Object.entries(inventory.sourceFiles))assert.equal(streamInfo(path).sha256,hash);
 assert.equal(inventory.qualification,'pending-controller-final-acceptance');assert.equal(inventory.delivery.noAuthorVerdict,true);
 const audit={goal,state,events,current,definitions,latest,...origin};return {...audit,qualification:qualification(audit)};
}
export function requireControllerBehavior(audit,registry){
 assert.equal(severeFindings(audit.state.findings).length,0,'Unresolved severe findings block affected qualification');
 const ids=['full-storage-behavior','identity-retained','foundation-retained','original-retained'];
 for(const id of ids){const run=audit.latest.find(r=>r.id==='f05-15.'+id);assert(run,'Missing terminal controller result: '+id);assertCurrentRun(run,audit.current);assert(audit.events.some(e=>e.type==='check.result'&&e.data.check===run.id&&e.data.status==='pass'&&e.data.exit===0),'Controller must have recorded completed actual check');assert(audit.events.some(e=>e.type==='job.started'&&e.data.job===run.job&&e.data.checks.includes(run.id)),'Actual controller dispatch required');
  if(id==='full-storage-behavior')assertAggregateCoverage(run,registry);
  else {const raw=readFileSync(resolve(root,run.stdout.path),'utf8');
   const summaries=[...raw.matchAll(/^# tests (\d+)\n# suites \d+\n# pass (\d+)\n# fail (\d+)\n# cancelled (\d+)\n# skipped (\d+)\n# todo (\d+)$/gm)].map(m=>m.slice(1).map(Number));
   assert(summaries.length>0,'Complete real regression TAP summaries');for(const [tests,passed,...bad] of summaries){assert(tests>0);assert.equal(tests,passed);assert(bad.every(n=>n===0));}
   if(id==='identity-retained'){assert.deepEqual(summaries.map(s=>s[0]),[35]);assert(raw.includes('foundation-source-hashes: 42 accepted files unchanged'));}
   if(id==='foundation-retained'){assert.deepEqual(summaries.map(s=>s[0]),[17]);assert(raw.includes('actual-postgres-role-and-version'));}
   if(id==='original-retained'){assert.deepEqual(summaries.map(s=>s[0]),[197,48,5,9,10]);assert(/^v44\.5\.1$/m.test(raw));assert(raw.includes('Desktop: 9 policy component tests, real renderer assets and Electron 44.5.1 binary probe passed.'));const retained=run.rows.find(r=>r.protectedFiles===597&&r.rawFiles===88);assert.deepEqual(retained?.checks,['original-g0-regression','original-g1-local-regression']);}
   for(const fixture of run.rows.filter(r=>r.measurement==='actual-postgres-fixture'))assert(run.rows.some(r=>r.measurement==='fixture-owned-cleanup'&&r.owner===fixture.owner&&r.containerId===fixture.containerId&&r.removed===true),'Every original regression fixture closed');
  }
 }
 // This command validates implementation evidence; independent verdicts remain
 // pending until issued by the controller. Never publish an author COMPLETE.
 return {controllerBehavior:true,qualification:qualification(audit)};
}
export function conciseEvidence(audit){return {measurement:'delivery-evidence',scope:'local-artifact-audit',current:audit.current,latest:audit.latest.map(({rows,...run})=>run),reviews:reviewState(audit.state,audit.events,audit.current.controllerFingerprint),qualification:audit.qualification};}
