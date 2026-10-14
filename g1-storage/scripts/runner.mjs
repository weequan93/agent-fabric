import {fullDescriptor,createFullContext,validateFullTap,validateFullObservations} from './full-composition.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cwd, root, cache, emittedTests } from './paths.mjs';
import { assertBaseline } from './guards.mjs';
import { run } from './process-result.mjs';
import { validateSuiteFiles, executeSuite } from './suite-execution.mjs';
import { candidateSnapshot } from './candidate.mjs';
import { executionSuites as suites,executionComponents as components } from './registry.mjs';
import {validateAtomicDisconnect} from './atomic-disconnect.mjs';
import { assertManifest,commitConflictPredecessors,commitConflictObservationSources,recallAskPredecessors,recallAskObservationSources,backupRestorePredecessors,backupRestoreObservationSources } from './registry.mjs';
import { validateObservations } from './observation-gate.mjs';
import { startMeasurement, endMeasurement } from './execution-measurement.mjs';
import { drainOutput } from './measurement-transport.mjs';
import { assertExecutionPreservation } from './execution-preservation.mjs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {dirname,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evidenceOrigin,copyInputSnapshot,installedDependencySnapshot,assertStorageInstallationMetadata,fingerprintAt,digest} from './delivery-evidence.mjs';

const copiedMetadataPaths=['.bin/tsc','.bin/tsserver','.modules.yaml','.pnpm-workspace-state-v1.json','.pnpm/lock.yaml'];
let privatePrerequisite=null;
const copiedRootIdentity=path=>{const s=lstatSync(path);assert(s.isDirectory()&&!s.isSymbolicLink());return {device:s.dev,inode:s.ino,realpath:realpathSync(path)};};
const copiedImmutable=trees=>trees.map(tree=>({...tree,entries:tree.entries.map(entry=>{
 if(tree.owner==='g1-storage'&&copiedMetadataPaths.includes(entry.path)){assert.equal(entry.type,'file');return {path:entry.path,type:entry.type,mode:entry.mode};}return entry;
})}));
function copiedMarker(path){
 const before=lstatSync(path,{bigint:true});assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.uid===BigInt(process.getuid())&&(before.mode&0o777n)===0o600n,'Private copied runner marker required');
 const contents=readFileSync(path,'utf8'),after=lstatSync(path,{bigint:true});
 for(const key of ['dev','ino','mode','uid','nlink','size','mtimeNs','ctimeNs'])assert.equal(after[key],before[key],'Copied runner marker changed during read');
 return contents;
}
async function captureCopiedRunner(requiredPrivate=false){
 // Public original-root commands keep their existing path. Relocated commands
 // validate the actual marker/origin before any build can regenerate metadata.
 const directory=dirname(root);
 if(basename(root)!=='candidate'||!basename(directory).startsWith('fabric-storage-harness-')){assert(!requiredPrivate,'Private prerequisite requires its actual prepared copied root');return null;}
 const marker=resolve(directory,'owner'),contents=copiedMarker(marker);
 // Existing hostile copies have a literal UUID marker and keep their original
 // inexpensive build gates. Malformed positive markers have no fallback.
 if(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(contents)){assert(!requiredPrivate,'Private prerequisite refuses positive owner UUID downgrade');return null;}
 const origin=await evidenceOrigin(),binding=JSON.parse(contents);
 assert.equal(copiedMarker(marker),contents,'Stable prepared runner capture required');
 const initial=copiedMetadataPaths.every(path=>isDeepStrictEqual(binding.dependencies.copied[0].entries.find(entry=>entry.path===path),binding.dependencies.original[0].entries.find(entry=>entry.path===path)));
 const state=assertStorageInstallationMetadata(root,initial?origin.originRoot:root);
 return {marker,contents,binding,origin,state,window:null};
}
async function settleCopiedRunnerBuild(capture,startedMs,finishedMs,built){
 if(!capture)return;
 const {binding,origin,marker}=capture;
 const failures=[],check=async body=>{try{return await body();}catch(error){failures.push(error);return undefined;}};
 await check(async()=>assert.equal(copiedMarker(marker),capture.contents,'Runner cannot adopt changed owner capture'));
 await check(async()=>assert.deepEqual(copiedRootIdentity(dirname(root)),binding.directoryIdentity));await check(async()=>assert.deepEqual(copiedRootIdentity(root),binding.rootIdentity));
 await check(async()=>assert.deepEqual(copiedRootIdentity(origin.originRoot),binding.originIdentity));
 const snapshot={inputs:binding.inputs,sourceFiles:binding.sourceFiles,candidate:binding.candidate};
 await check(async()=>assert.deepEqual(copyInputSnapshot(root),snapshot,'Private build protects complete copied regular closure'));
 await check(async()=>assert.deepEqual(copyInputSnapshot(origin.originRoot),snapshot,'Private build protects complete original regular closure'));
 await check(async()=>assert.equal(fingerprintAt(origin.originRoot),binding.controllerFingerprint));
 const window={originRoot:origin.originRoot,startedMs,finishedMs,previous:{prunedAt:capture.state.prunedAt,lastValidatedTimestamp:capture.state.lastValidatedTimestamp}};
 await check(async()=>assertStorageInstallationMetadata(origin.originRoot));await check(async()=>assertStorageInstallationMetadata(root,root,window));
 await check(async()=>assert(isDeepStrictEqual(await installedDependencySnapshot(origin.originRoot,binding.dependencies.original),binding.dependencies.original),'Runner protects every original installed entry'));
 const actual=await check(async()=>await installedDependencySnapshot(root));
 if(actual)await check(async()=>assert(isDeepStrictEqual(copiedImmutable(actual),copiedImmutable(binding.dependencies.copied)),'Runner build changes only five destination hashes'));
 await check(async()=>assert.equal(readFileSync(resolve(root,'node_modules/.cache/sibling-sentinel'),'utf8'),'sibling-'+binding.owner));
 await check(async()=>{
  assert(built&&built.sourceAndTests===true&&built.cacheCleared===true,'Runner admission requires actual successful fresh strict build');
  assert.equal(built.node,'v22.22.3');assert.deepEqual(built.pins,{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'});
  assert.equal(built.dependencyLockDigest,digest(readFileSync(resolve(cwd,'pnpm-lock.yaml'))));assert.equal(built.install,'offline/frozen/ignore-scripts');
 });
 if(failures.length)throw new AggregateError(failures,'Copied runner build and original/immutable guards failed');
 const next=JSON.parse(capture.contents);
 for(const path of copiedMetadataPaths){const entry=actual[0].entries.find(entry=>entry.path===path),target=next.dependencies.copied[0].entries.find(entry=>entry.path===path);assert(entry.type==='file'&&target.type==='file');target.bytes=entry.bytes;target.sha256=entry.sha256;}
 const contents=JSON.stringify(next);
 try{writeFileSync(marker,contents);}catch(error){try{writeFileSync(marker,capture.contents);}catch(recovery){throw new AggregateError([error,recovery],'Copied runner marker write and restoration failed');}throw error;}
 capture.contents=contents;capture.window=window;
 assert.deepEqual(await evidenceOrigin(),origin,'Actual postbuild copied origin required before imports/dispatch');
}
async function guardCopiedRunner(capture){
 if(!capture)return;
 const errors=[],check=async body=>{try{await body();}catch(error){errors.push(error);}};
 await check(async()=>assert.equal(copiedMarker(capture.marker),capture.contents,'Admitted runner owner cannot change during workload'));
 await check(async()=>assert.deepEqual(await evidenceOrigin(),capture.origin));
 // A copied-side failure still independently checks the captured originals.
 const {binding,origin}=capture,snapshot={inputs:binding.inputs,sourceFiles:binding.sourceFiles,candidate:binding.candidate};
 await check(async()=>assert.deepEqual(copiedRootIdentity(origin.originRoot),binding.originIdentity));
 await check(async()=>assert.deepEqual(copyInputSnapshot(origin.originRoot),snapshot));
 await check(async()=>assert(isDeepStrictEqual(await installedDependencySnapshot(origin.originRoot,binding.dependencies.original),binding.dependencies.original)));
 await check(async()=>assert.equal(fingerprintAt(origin.originRoot),binding.controllerFingerprint));
 if(capture.window)await check(async()=>assertStorageInstallationMetadata(root,root,capture.window));
 if(errors.length)throw new AggregateError(errors,'Copied runner final guards failed');
}

export async function check(mode,args){
 const registry=mode==='component'?components:suites;
 if(!['aggregate','slice','component'].includes(mode))throw new Error('Unknown checker mode');
 if(mode==='aggregate'?args.length!==0:args.length!==1||!Object.hasOwn(registry,args[0]))throw new Error('Unknown/extra checker argument');
 const selected=mode==='aggregate'?Object.entries(suites):[[args[0],registry[args[0]]]];
 return runSelected(mode,selected);
}

/** Fixed nonrecursive H02 workload. No caller selector or public CLI bypass. */
export async function runHarnessPrerequisite(){
 if(arguments.length!==0)throw new Error('Harness prerequisite accepts no arguments');
 assert(privatePrerequisite?.started,'Harness prerequisite requires the live private intended operation');
 assert.equal(digest(copiedMarker(privatePrerequisite.marker)),privatePrerequisite.markerSha256,'Current intended operation must retain its prepared owner');
 const selected=Object.entries(suites).filter(([id])=>id!=='harness');
 const expected=['contracts','authority','owned-encryption','commit-conflict','atomic-disconnect','recall-ask','lifecycle-propagation','volume-draft','backup-restore','delivery-audit'];
 if(JSON.stringify(selected.map(([id])=>id))!==JSON.stringify(expected))throw new Error('Exact nonrecursive mandatory workload required');
 return runSelected('harness-prerequisite',selected);
}

async function runSelected(mode,selected){
 const copied=await captureCopiedRunner(mode==='harness-prerequisite');
 assertBaseline();console.log(JSON.stringify({measurement:'frozen-storage-registry',...assertManifest()}));const candidate=candidateSnapshot();
 console.log(JSON.stringify({measurement:'storage-candidate',...candidate,diagnosticOnly:mode!=='aggregate'}));
 assertExecutionPreservation();
 let commandMeasurement;
 const errors=[],reports=[];
 let built;
 try{
  if(mode==='harness-prerequisite')assertPrivateAdmission();
  commandMeasurement=startMeasurement('command',{mode,candidate:candidate.digest},true);
  await commandMeasurement.ready;
  const buildMeasurement=startMeasurement('build',{mode,candidate:candidate.digest});
  let copiedBuildStarted,copiedBuildFinished;
  try{await buildMeasurement.ready;
   if(copied){assert.equal(copiedMarker(copied.marker),copied.contents);assert.deepEqual(await evidenceOrigin(),copied.origin,'Complete unchanged copied inputs required immediately before install');}
   copiedBuildStarted=Date.now();if(copied)assert(Number.isSafeInteger(copiedBuildStarted)&&copiedBuildStarted>=0,'Native copied runner build start required');
   const result=run(process.execPath,[resolve(cwd,'scripts/build.mjs')]);
   const records=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).filter(row=>row.measurement==='strict-build');
   if(records.length!==1||records[0].sourceAndTests!==true||records[0].cacheCleared!==true)throw new Error('Actual fresh strict build required');built=records[0];}finally{
    copiedBuildFinished=Date.now();
    try{if(copied)await settleCopiedRunnerBuild(copied,copiedBuildStarted,copiedBuildFinished,built);}catch(error){errors.push(error);}
    try{await endMeasurement(buildMeasurement);}catch(error){errors.push(error);}
   }
  if(errors.length)throw new AggregateError([...errors],'Build must settle all copied guards before dispatch');
  if(mode==='harness-prerequisite')assertPrivateAdmission();
  const {QualificationObservationSchema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
  const {verifyAtomicPhaseRecords}=await import(pathToFileURL(resolve(emittedTests,'helpers/atomic-disconnect-records.js')).href);
  validateSuiteFiles(selected,resolve(cwd,'tests'),emittedTests);
  for(const [id,suite] of selected){
   if(mode==='harness-prerequisite'){
    assertPrivateAdmission();privatePrerequisite.admitted.push(id);
    console.log(JSON.stringify({measurement:'harness-prerequisite-dispatch',suite:id,nonce:privatePrerequisite.nonce,owner:privatePrerequisite.owner}));
   }
   const lifetimeMeasurement=startMeasurement('suite-lifetime',{suite:id,mode,candidate:candidate.digest});
   try{
   await lifetimeMeasurement.ready;
   const descriptor=mode!=='component'?fullDescriptor(id):null;
   const predecessors=(id==='commit-conflict'?commitConflictPredecessors:id==='recall-ask'?recallAskPredecessors:id==='backup-restore'?backupRestorePredecessors:[]).map(name=>components[name]);
   const registeredComponents=mode!=='component'&&['recall-ask','backup-restore'].includes(id)
    ?(id==='recall-ask'?recallAskObservationSources:backupRestoreObservationSources).map(source=>components[source.component])
    :[...predecessors,suite];
   const executionCases=registeredComponents.flatMap(component=>component.cases);
   const executionVariants=Object.assign({},...registeredComponents.map(component=>component.variants));
   const observationSources=['commit-conflict','recall-ask','backup-restore'].includes(id)?(id==='commit-conflict'?commitConflictObservationSources:id==='recall-ask'?recallAskObservationSources:backupRestoreObservationSources).map(s=>({suite:s.suite??s.component,measurement:s.measurement??'storage-observations',positives:components[s.component].positives})):null;
   const execute=async env=>{
    const composition=descriptor?createFullContext(id,candidate.digest,{...process.env,...env}):null;
    try{
     const output=await executeSuite(resolve(emittedTests,suite.file),executionCases,{cwd:root,env:{...process.env,...env,...(composition?{STORAGE_FULL_COMPOSITION_CONTEXT:JSON.stringify(composition)}:{})}},executionVariants,descriptor?result=>validateFullTap(result,id):null);
     if(mode!=='component'&&['backup-restore','recall-ask'].includes(id)){
      const leaves=Object.values(executionVariants).flat();
      if(output.report.tests!==executionCases.length+leaves.length||output.report.variants.length!==leaves.length
       ||output.report.cases.some((name,index)=>name!==executionCases[index]&&!name.startsWith(executionCases[index]+' / ')))throw new Error('Exact original and shared full workload census/order required: '+id);
     }
     if(suite===suites['atomic-disconnect'])validateAtomicDisconnect(output,candidate.digest,verifyAtomicPhaseRecords);
     const observations=descriptor?validateFullObservations(output.result.stdout,id,composition,QualificationObservationSchema):validateObservations(output.result.stdout,suite===suites['atomic-disconnect']?'atomic-disconnect':id,suite.positives,QualificationObservationSchema,observationSources);
     reports.push({suite:id,...output.report,observations});
    }catch(error){throw error;}
   };
   if(suite.integration){
    const fixture=await import(pathToFileURL(resolve(cwd,'scripts/fixture.mjs')).href);
    if(typeof fixture.withStorageFixture!=='function')throw new Error('Mandatory owned PG/IdP/content fixture missing');
    let callbacks=0;
    const fixtureStarted=performance.now();let fixtureReady=null,workReturned=null;
    try{await fixture.withStorageFixture(async state=>{
     if(++callbacks!==1||state?.assurance!=='deterministic-local-only'||state.paidCallsAllowed!==false||!state.env)throw new Error('Invalid owned fixture contract');
     fixtureReady=performance.now();try{await execute(state.env);}finally{workReturned=performance.now();}
    });}finally{const fixtureReturned=performance.now();console.log(JSON.stringify({measurement:'storage-fixture-execution-times',suite:id,mode,clock:'parent-monotonic',startedMs:fixtureStarted,readyMs:fixtureReady,workReturnedMs:workReturned,returnedMs:fixtureReturned,setupMs:fixtureReady===null?null:fixtureReady-fixtureStarted,workMs:workReturned===null?null:workReturned-fixtureReady,cleanupMs:workReturned===null?null:fixtureReturned-workReturned}));}
    if(callbacks!==1)throw new Error('Fixture omitted mandatory execution');
   }else await execute({});
   }finally{try{await endMeasurement(lifetimeMeasurement);}catch(error){errors.push(error);}}
   if(mode==='harness-prerequisite')assertPrivateAdmission();
  }
  if(reports.length!==selected.length)throw new Error('Mandatory execution report missing');
  console.log(JSON.stringify({measurement:'storage-test-report',scope:mode,diagnosticOnly:mode!=='aggregate',externalQualification:'pending',reports}));
 }catch(error){errors.push(error);}
 finally{
  try{await guardCopiedRunner(copied);}catch(error){errors.push(error);}
  try{if(candidateSnapshot().digest!==candidate.digest)throw new Error('Candidate changed during check');}catch(error){errors.push(error);}
  try{assertBaseline();}catch(error){errors.push(error);}
  try{assertExecutionPreservation();}catch(error){errors.push(error);}
  try{if(commandMeasurement)await endMeasurement(commandMeasurement,{success:errors.length===0});}catch(error){errors.push(error);}
 }
 try{await drainOutput();}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError(errors,'Storage check failed; behavior and final guards retained');
 return {build:built,reports,candidate:candidate.digest};
}

function assertPrivateAdmission(){
 assert(privatePrerequisite?.started,'Current private prerequisite operation required');
 if(privatePrerequisite.cancelled||privatePrerequisite.failures.length)throw new AggregateError([...privatePrerequisite.failures,new Error('Current private prerequisite cancelled; active suite settled normally')],'Private prerequisite refuses new dispatch');
 assert(process.connected,'Current private parent IPC required before dispatch');
}
function privateIdentity(){
 const result=spawnSync('/bin/ps',['-ww','-axo','pid=,ppid=,lstart=,command='],{encoding:'utf8',env:{...process.env,LC_ALL:'en_US.UTF-8'},timeout:3000,maxBuffer:4*1024*1024});
 assert.equal(result.error,undefined,'Private runner current census required');assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);
 const rows=result.stdout.trim().split('\n').map(line=>{
  const match=/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/.exec(line);assert(match,'Complete private runner census row required');
  return {pid:Number(match[1]),ppid:Number(match[2]),birth:match[3],command:match[4]};
 });
 const identity=rows.find(row=>row.pid===process.pid);assert(identity,'Actual private runner instance required');
 assert.equal(identity.ppid,process.ppid);assert.equal(identity.command,[process.execPath,...process.argv.slice(1)].join(' '),'Exact private runner command required');return identity;
}
async function privateMain(){
 assert.deepEqual(process.execArgv,[],'Private runner refuses loader arguments');
 assert.equal(process.argv.length,3,'Private runner accepts exactly its nonce');
 const nonce=process.argv[2];assert.match(nonce,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'Fresh private nonce required');
 assert(process.connected&&process.send&&process.channel,'Private runner requires live parent IPC');
 for(const key of Object.keys(process.env))assert(!/^(STORAGE_|MODEL_|IDENTITY_|FABRIC_|HARNESS_CHILD|LOOP_)/.test(key)&&!['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE'].includes(key),'Private runner refuses inherited outer capabilities: '+key);
 const operation='harness-prerequisite',state={nonce,owner:null,marker:null,markerSha256:null,started:false,cancelled:false,admitted:[],failures:[]};
 const pendingMessages=new Set();
 let prepared=false,acceptStart,rejectStart;
 const start=new Promise((yes,no)=>{acceptStart=yes;rejectStart=no;});
 // A refusal during the independent preflight is still observed by this turn.
 void start.catch(()=>{});
 const fail=error=>{state.failures.push(error);state.cancelled=true;rejectStart(error);};
 const send=message=>new Promise((yes,no)=>{assert(process.connected&&process.send,'Current private parent IPC required');process.send(message,error=>error?no(error):yes());});
 const onMessage=message=>{
  try{
   assert(prepared,'Private operation cannot start before independent copied-origin readiness');
   if(message?.type==='harness-prerequisite-start'){
    assert(!state.started,'Private operation starts exactly once');
    assert.deepEqual(message,{type:'harness-prerequisite-start',operation,nonce,owner:state.owner,root,markerSha256:state.markerSha256,identity:privateIdentity()},'Exact current private intended operation required');
    assert.equal(digest(copiedMarker(state.marker)),state.markerSha256,'Private operation owner cannot change before start');
    state.started=true;acceptStart();
   }else{
    assert(!state.cancelled,'Private operation cancellation accepted exactly once');
    assert.deepEqual(message,{type:'harness-prerequisite-cancel',operation,nonce,owner:state.owner},'Exact current private cancellation required');
    state.cancelled=true;
    const pending=send({type:'harness-prerequisite-cancel-accepted',operation,nonce,owner:state.owner}).catch(fail).finally(()=>pendingMessages.delete(pending));pendingMessages.add(pending);
    if(!state.started)rejectStart(new Error('Current private prerequisite cancelled before intended-operation start'));
   }
  }catch(error){fail(error);}
 };
 const onDisconnect=()=>fail(new Error('Private parent IPC disconnected; no further suite admission'));
 process.on('message',onMessage);process.once('disconnect',onDisconnect);
 try{
  const capture=await captureCopiedRunner(true);assert(capture,'Actual prepared private copy required');
  state.owner=capture.binding.owner;state.marker=capture.marker;state.markerSha256=digest(capture.contents);
  privateIdentity();prepared=true;
  await send({type:'harness-prerequisite-ready',operation,nonce,owner:state.owner,pid:process.pid,ppid:process.ppid,root,markerSha256:state.markerSha256});
  await start;privatePrerequisite=state;assertPrivateAdmission();
  await runHarnessPrerequisite();
  assertPrivateAdmission();
 }finally{
  await Promise.allSettled([...pendingMessages]);
  privatePrerequisite=null;process.removeListener('message',onMessage);process.removeListener('disconnect',onDisconnect);
  if(process.connected)process.disconnect();
 }
}
// Importing the runner and ordinary check entry points never dispatch this
// operation. Only the actual copied main path and its live nonce IPC can do so.
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{await privateMain();}catch(error){console.error(error);process.exitCode=1;if(process.connected)process.disconnect();}
}
