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
 const selected=Object.entries(suites).filter(([id])=>id!=='harness');
 const expected=['contracts','authority','owned-encryption','commit-conflict','atomic-disconnect','recall-ask','lifecycle-propagation','volume-draft','backup-restore','delivery-audit'];
 if(JSON.stringify(selected.map(([id])=>id))!==JSON.stringify(expected))throw new Error('Exact nonrecursive mandatory workload required');
 return runSelected('harness-prerequisite',selected);
}

async function runSelected(mode,selected){
 assertBaseline();console.log(JSON.stringify({measurement:'frozen-storage-registry',...assertManifest()}));const candidate=candidateSnapshot();
 console.log(JSON.stringify({measurement:'storage-candidate',...candidate,diagnosticOnly:mode!=='aggregate'}));
 assertExecutionPreservation();
 let commandMeasurement;
 const errors=[],reports=[];
 let built;
 try{
  commandMeasurement=startMeasurement('command',{mode,candidate:candidate.digest},true);
  await commandMeasurement.ready;
  const buildMeasurement=startMeasurement('build',{mode,candidate:candidate.digest});
  try{await buildMeasurement.ready;const result=run(process.execPath,[resolve(cwd,'scripts/build.mjs')]);
   const records=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).filter(row=>row.measurement==='strict-build');
   if(records.length!==1||records[0].sourceAndTests!==true||records[0].cacheCleared!==true)throw new Error('Actual fresh strict build required');built=records[0];}finally{try{await endMeasurement(buildMeasurement);}catch(error){errors.push(error);}}
  const {QualificationObservationSchema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
  const {verifyAtomicPhaseRecords}=await import(pathToFileURL(resolve(emittedTests,'helpers/atomic-disconnect-records.js')).href);
  validateSuiteFiles(selected,resolve(cwd,'tests'),emittedTests);
  for(const [id,suite] of selected){
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
  }
  if(reports.length!==selected.length)throw new Error('Mandatory execution report missing');
  console.log(JSON.stringify({measurement:'storage-test-report',scope:mode,diagnosticOnly:mode!=='aggregate',externalQualification:'pending',reports}));
 }catch(error){errors.push(error);}
 finally{
  try{if(candidateSnapshot().digest!==candidate.digest)throw new Error('Candidate changed during check');}catch(error){errors.push(error);}
  try{assertBaseline();}catch(error){errors.push(error);}
  try{assertExecutionPreservation();}catch(error){errors.push(error);}
  try{if(commandMeasurement)await endMeasurement(commandMeasurement,{success:errors.length===0});}catch(error){errors.push(error);}
 }
 try{await drainOutput();}catch(error){errors.push(error);}
 if(errors.length)throw new AggregateError(errors,'Storage check failed; behavior and final guards retained');
 return {build:built,reports,candidate:candidate.digest};
}
