import test from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as S from '../../src/schema.js';
import { StorageError, safeFailure, FoundationError } from '../../src/errors.js';
import { units, safeAdd, safeMultiply, LIMITS } from '../../src/arithmetic.js';
import { revision, timestamp, body, uuid, list } from '../../src/decoder.js';
import * as owners from '../../src/owners.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { ResourceRepository } from '../../../g1-model/src/resource-repository.js';
import { AdmissionSchema, NativeRepository } from '../../../g1-model/src/native-repository.js';
import { ServiceAccountingSchema } from '../../src/resource-composition.js';
import { examples,id,sha,at,expires,audience,knowledge,verification,base,assertion,envelope,manifest,file,backup,backupItem,restore,ask } from './contract-fixtures.js';
import { resourceContractProbe } from './resource-contract-probe.js';
import { executionGateProbe } from './execution-gate-probe.js';

export function registerContractTests(){
 test('C01 / closed contracts',async t=>{
  await t.test('C01/roundtrip',()=>{
   const fixtures=examples();
   assert.deepEqual(fixtures.map(x=>x[0]).sort(),Object.keys(S).filter(k=>k.endsWith('Schema')).sort());
   for(const [,schema,value] of fixtures)assert.deepEqual(schema.parse(JSON.parse(JSON.stringify(value))),value);
   for(const status of ['proposed','user-asserted','source-verified','disputed','superseded','expired','deleted'])
    assert.equal(S.KnowledgeSchema.parse({...knowledge,status,verification:status==='source-verified'?verification:null}).status,status);
   for(const data of [{schemaVersion:1,status:'pending-review',receiptId:id(20),proposalId:id(8)},
    {schemaVersion:1,status:'not-saved',error:'UNAUTHORIZED',nextAction:'inspect-current-authority'},
    {schemaVersion:1,status:'unknown',key:id(9),replayAllowed:false,nextAction:'original-key-lookup'}])assert.deepEqual(S.SaveResultSchema.parse(data),data);
   assert.equal(owners.AuthenticatedUnitOfWork,AuthenticatedUnitOfWork);
   assert.equal(owners.ResourceRepository,ResourceRepository);assert.equal(owners.NativeRepository,NativeRepository);
  });
  await t.test('C01/closed-negative',()=>{
   for(const [name,schema,value] of examples()){
    assert.throws(()=>schema.parse(undefined),StorageError,name);
    assert.throws(()=>schema.parse(()=>true),StorageError,name);
    if(value&&typeof value==='object'&&!Array.isArray(value)){
     const record=value as Record<string,unknown>;
     for(const key of Object.keys(record)){
      const missing={...record};delete missing[key];assert.throws(()=>schema.parse(missing),StorageError,name);
      let reads=0;const accessor={...record};Object.defineProperty(accessor,key,{enumerable:true,get(){reads++;return record[key];}});
      assert.throws(()=>schema.parse(accessor),StorageError,name);assert.equal(reads,0);
     }
     for(const key of ['actorId','payerId','grants','verified','path','sql','url','clock','keys','epoch','root'])
      assert.throws(()=>schema.parse({...record,[key]:'forged'}),StorageError,name);
     if(Object.hasOwn(record,'schemaVersion'))assert.throws(()=>schema.parse({...record,schemaVersion:2}),StorageError,name);
     assert.throws(()=>schema.parse({...record,[Symbol('extra')]:true}),StorageError,name);
     assert.throws(()=>schema.parse(Object.create(record)),StorageError,name);
     const cycle={...record};cycle[Object.keys(record)[0]!]=cycle;assert.throws(()=>schema.parse(cycle),StorageError,name);
    }
   }
   for(const bad of [-0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1'])assert.throws(()=>revision.parse(bad),StorageError);
   for(const bad of ['2026-02-30T00:00:00.000Z','now',at.replace('.000',''),0])assert.throws(()=>timestamp.parse(bad),StorageError);
   assert.throws(()=>uuid.parse('not-an-id'),StorageError);
   assert.throws(()=>S.KnowledgeSchema.parse({...knowledge,status:'source-verified'}),StorageError);
   assert.throws(()=>S.KnowledgeSchema.parse({...knowledge,status:'approved'}),StorageError);
   assert.throws(()=>S.AudienceSchema.parse({...audience,recipientActorIds:[id(3),id(3)]}),StorageError);
   assert.throws(()=>S.SaveCommandSchema.parse({...base,action:'save',expectedRevision:1,assertion}),StorageError);
   for(const action of ['correct','forget','promote']){
    const fixture=examples().find(x=>x[0]===action[0]!.toUpperCase()+action.slice(1)+'CommandSchema')!;
    assert.throws(()=>fixture[1].parse({...fixture[2] as object,expectedRevision:0}),StorageError);
   }
   assert.throws(()=>S.CipherEnvelopeSchema.parse({...envelope,algorithm:'none'}),StorageError);
   assert.throws(()=>S.CipherEnvelopeSchema.parse({...envelope,nonce:Buffer.alloc(11).toString('base64')}),StorageError);
   assert.throws(()=>S.CipherEnvelopeSchema.parse({...envelope,tag:Buffer.alloc(15).toString('base64')}),StorageError);
   assert.throws(()=>S.CipherEnvelopeSchema.parse({...envelope,ciphertext:'YQ='}),StorageError);
   assert.throws(()=>S.CipherEnvelopeSchema.parse({...envelope,ciphertext:'YR=='}),StorageError);
   const genuine=safeFailure(new FoundationError('UNKNOWN_COMMIT','sensitive input'));
   assert.deepEqual(S.FailureResultSchema.parse(genuine),genuine);
   assert.equal(genuine.status,'unknown');assert.equal(genuine.replayAllowed,false);
   assert.equal(safeFailure(Object.assign(new Error('private'),{code:'UNKNOWN_COMMIT'})).status,'not-saved');
   assert.ok(!JSON.stringify(genuine).includes('sensitive'));
  });
  await t.test('C01/restore-state',()=>{
   for(const state of ['staged','validating','reconciling-current','blocked-authority','blocked-integrity','blocked-freshness']){
    assert.equal(S.RestoreResultSchema.parse({...restore,state,serving:false}).serving,false);
    assert.throws(()=>S.RestoreResultSchema.parse({...restore,state,serving:true}),StorageError);
   }
   assert.throws(()=>S.RestoreResultSchema.parse({...restore,restrictionEpoch:null}),StorageError);
  });
 });
 test('C02 / finite admission bounds',async t=>{
  await t.test('C02/bounds',()=>{
   assert.equal(body.parse('a'.repeat(LIMITS.commandBytes)).length,LIMITS.commandBytes);
   assert.throws(()=>body.parse('a'.repeat(LIMITS.commandBytes+1)),StorageError);
   assert.throws(()=>S.parseCommand(S.AskCommandSchema,{...ask,question:'a'.repeat(LIMITS.commandBytes)}),StorageError);
   const overhead=Buffer.byteLength(JSON.stringify({...ask,question:''}));
   assert.equal(Buffer.byteLength(JSON.stringify(S.parseCommand(S.AskCommandSchema,{...ask,question:'a'.repeat(LIMITS.commandBytes-overhead)}))),LIMITS.commandBytes);
   assert.equal(S.AudienceSchema.parse({...audience,recipientActorIds:Array.from({length:256},(_,i)=>id(100+i))}).recipientActorIds.length,256);
   assert.throws(()=>S.AudienceSchema.parse({...audience,recipientActorIds:Array.from({length:257},(_,i)=>id(100+i))}),StorageError);
   const entries=Array.from({length:64},(_,i)=>({...manifest.selected[0],knowledgeId:id(100+i)}));
   assert.equal(S.RetrievalManifestSchema.parse({...manifest,selected:entries}).selected.length,64);
   assert.equal(S.RetrievalManifestSchema.parse({...manifest,selected:[]}).selected.length,0);
   assert.throws(()=>S.RetrievalManifestSchema.parse({...manifest,selected:[...entries,{...entries[0],knowledgeId:id(999)}]}),StorageError);
   assert.equal(S.CheckpointManifestSchema.parse({schemaVersion:1,tenantId:id(1),spaceId:id(2),id:id(14),revision:1,generation:id(10),confirmedAt:at,files:Array.from({length:1024},(_,i)=>({...file,id:id(100+i)}))}).files.length,1024);
   const largeCipher=Buffer.alloc(65536,1).toString('base64');
   const items=Array.from({length:1024},(_,i)=>({...backupItem,id:id(100+i),envelope:{...envelope,id:id(100+i),ciphertext:largeCipher},decodedBytes:65536}));
   assert.equal(S.BackupInventorySchema.parse({...backup,items,decodedBytes:LIMITS.backupBytes}).items.length,1024);
   assert.throws(()=>S.BackupInventorySchema.parse({...backup,items:[...items,items[0]],decodedBytes:LIMITS.backupBytes}),StorageError);
   assert.throws(()=>S.BackupInventorySchema.parse({...backup,items:[{...backupItem,decodedBytes:LIMITS.backupBytes+1}],decodedBytes:LIMITS.backupBytes+1}),StorageError);
   assert.throws(()=>S.BackupInventorySchema.parse({...backup,decodedBytes:6}),StorageError);
   const accessor=[id(1)];let reads=0;Object.defineProperty(accessor,'0',{enumerable:true,get(){reads++;return id(1);}});
   assert.throws(()=>list(uuid).parse(accessor),StorageError);assert.equal(reads,0);
   assert.throws(()=>list(uuid).parse(new Array(1)),StorageError);
  });
  await t.test('C02/graph',()=>{
   const chain=(n:number)=>Array.from({length:n},(_,i)=>({id:id(100+i),revision:1,ancestors:i?[{id:id(99+i),revision:1}]:[]}));
   assert.equal(S.DependencyGraphSchema.parse(chain(17)).length,17);
   assert.throws(()=>S.DependencyGraphSchema.parse(chain(18)),StorageError);
   assert.equal(S.DependencyGraphSchema.parse(Array.from({length:512},(_,i)=>({id:id(100+i),revision:1,ancestors:[]}))).length,512);
   assert.throws(()=>S.DependencyGraphSchema.parse(Array.from({length:513},(_,i)=>({id:id(100+i),revision:1,ancestors:[]}))),StorageError);
   assert.throws(()=>S.DependencyGraphSchema.parse([{id:id(1),revision:1,ancestors:[{id:id(1),revision:1}]}]),StorageError);
   assert.throws(()=>S.DependencyGraphSchema.parse([{id:id(1),revision:1,ancestors:[{id:id(2),revision:1}]}]),StorageError);
   assert.throws(()=>S.DependencyGraphSchema.parse([{id:id(1),revision:1,ancestors:[{id:id(2),revision:2}]},{id:id(2),revision:1,ancestors:[]}]),StorageError);
  });
  await t.test('C02/overflow',()=>{
   assert.equal(units(Number.MAX_SAFE_INTEGER),Number.MAX_SAFE_INTEGER);
   assert.equal(safeAdd(1,2),3);assert.equal(safeMultiply(3,4),12);
   assert.throws(()=>safeAdd(Number.MAX_SAFE_INTEGER,1),{code:'NUMERIC_OVERFLOW'});
   assert.throws(()=>safeMultiply(Number.MAX_SAFE_INTEGER,2),{code:'NUMERIC_OVERFLOW'});
  });
 });
 test('C03 / independent controls and owner composition',async t=>{
  await t.test('C03/controls',()=>{
   for(let n=0;n<8;n++){
    const controls={attachments:!!(n&1),olderRecall:!!(n&2),saveReusable:!!(n&4)};
    assert.deepEqual(S.QueryControlsSchema.parse(controls),controls);
   }
   assert.deepEqual(S.AskCommandSchema.parse({...ask,attachmentIds:[id(4)]}).attachmentIds,[id(4)]);
  });
  await t.test('C03/service-separation',async()=>{
   const need={schemaVersion:1,inputModalities:['text'],outputModalities:['text'],toolDialect:'local',schemaDialect:'local',streamText:false,streamToolArguments:false,contextBytes:1,outputCap:1,durationCapMs:1,usage:true,cancellation:true,privateState:false,optionalFeatures:[],executionClass:'service',runtimeCapabilities:[]};
   const admission={executionClass:'service',computerCapability:null,maxInputBytes:1024,need,targetEffect:false,approvalRequired:false,resourceId:null,ongoingCharges:[]};
   assert.equal(AdmissionSchema.parse(admission).resourceId,null);
   assert.throws(()=>AdmissionSchema.parse({...admission,resourceId:id(25)}));
   assert.throws(()=>AdmissionSchema.parse({...admission,computerCapability:'simulated-computer'}));
   const service={schemaVersion:1,kind:'logical-service',accountingResourceId:id(25),ownerId:id(23),assignmentGeneration:1,sessionId:id(7),originRunId:id(22),purpose:'ask',receiptId:id(26),expiresAt:expires};
   assert.equal(ServiceAccountingSchema.parse(service).accountingResourceId,id(25));
   for(const extra of ['resourceId','computerAssignment','rateUnits','payerId','allowance','clock','keys','root','epoch'])assert.throws(()=>ServiceAccountingSchema.parse({...service,[extra]:id(1)}),StorageError);
   const script=await import(pathToFileURL(resolve('g1-storage/scripts/process-result.mjs')).href);
   assert.throws(()=>script.parseTap({status:0,signal:null,stdout:'TAP version 13\n# C01 passed\n1..0\n',stderr:''},['C01']));
   assert.throws(()=>script.parseTap({status:0,signal:null,stdout:'TAP version 13\n# Subtest: C01\nok 1 - C01 # SKIP\n1..1\n',stderr:''},['C01']));
   await executionGateProbe();
   // Isolated boundary doubles exercise the actual measurement implementation;
   // they qualify its branches, never a Docker daemon or a PG execution.
   const measurement=await import(pathToFileURL(resolve('g1-storage/scripts/execution-measurement.mjs')).href);
   const transport=await import(pathToFileURL(resolve('g1-storage/scripts/measurement-transport.mjs')).href);
   const originalSpawnSync=childProcess.spawnSync,originalWrite=process.stdout.write;
   const processBytes='  17 1 Thu Oct 15 12:00:00 2026 /actual-process\n';
   let processResult:Record<string,unknown>={status:0,signal:null,stdout:processBytes,stderr:''};
   let dockerResult:Record<string,unknown>={status:1,signal:null,stdout:'partial-container-output\n',stderr:'test-local Docker boundary failure'};
   const calls:string[]=[],writes:string[]=[];
   const decode=()=>{
    const rows=writes.join('').split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
    const frames=rows.filter(row=>row.measurement==='storage-measurement-transport'),values=[];
    for(let index=0;index<frames.length;){const header=frames[index],count=header.count+2;
     const decoded=transport.decodeMeasurement(frames.slice(index,index+count),header.binding);
     assert.equal(transport.measurementDigest(decoded.raw),header.digest);values.push(decoded.record);index+=count;
    }return values;
   };
   try{
    childProcess.spawnSync=((file:unknown)=>{assert(file==='ps'||file==='docker');calls.push(String(file));return file==='ps'?processResult:dockerResult;}) as unknown as typeof childProcess.spawnSync;syncBuiltinESMExports();
    process.stdout.write=((chunk:unknown,encoding?:unknown,callback?:unknown)=>{
     const bytes=String(chunk);assert(bytes.split('\n').filter(Boolean).every(line=>line.startsWith('{')),'Only this measurement boundary output is intercepted');
     writes.push(bytes);const done=typeof encoding==='function'?encoding:callback;
     if(typeof done==='function')queueMicrotask(()=>done());return true;
    }) as typeof process.stdout.write;
    const observed=measurement.startMeasurement('command',{candidate:sha},{containers:'observe'});await observed.ready;await measurement.endMeasurement(observed);
    let values=decode();assert.deepEqual(values.map(value=>value.measurement),['storage-parent-start','storage-parent-return']);
    for(const census of [values[0].before,values[1].before,values[1].after]){
     assert.equal(census.processBytes,processBytes);assert.deepEqual(census.processes,[processBytes.trimEnd()]);assert.equal(census.processDigest,transport.measurementDigest(processBytes));
     assert.equal(census.containerBytes,null);assert.equal(census.containers,null);assert.equal(census.containerDigest,null);
     assert.deepEqual(census.containerObservation,{status:'unknown',qualified:false,exitStatus:1,signal:null,error:null,stdout:dockerResult.stdout,stderr:dockerResult.stderr,diagnostic:'Docker census unavailable: '+JSON.stringify({exitStatus:1,signal:null,error:null,stdout:dockerResult.stdout,stderr:dockerResult.stderr})});
    }
    assert.deepEqual(calls,['ps','docker','ps','docker']);
    for(const containerBytes of ['bbb\naaa\n','']){
     dockerResult={status:0,signal:null,stdout:containerBytes,stderr:''};writes.length=0;
     const state=measurement.startMeasurement('command',{candidate:sha},true);await state.ready;await measurement.endMeasurement(state);values=decode();
     for(const census of [values[0].before,values[1].before,values[1].after]){
      assert.equal(census.processBytes,processBytes);assert.equal(census.processDigest,transport.measurementDigest(processBytes));assert.deepEqual(census.processes,[processBytes.trimEnd()]);
      assert.equal(census.containerBytes,containerBytes);assert.deepEqual(census.containers,containerBytes.trim().split('\n').filter(Boolean).sort());assert.equal(census.containerDigest,transport.measurementDigest(containerBytes));
      assert.deepEqual(census.containerObservation,{status:'available',qualified:true,exitStatus:0,signal:null,error:null,stdout:containerBytes,stderr:'',diagnostic:null});
     }
    }
    for(const bad of [
     {status:null,signal:null,error:Object.assign(new Error('spawn ps ENOENT'),{code:'ENOENT'}),stdout:null,stderr:null},
     {status:1,signal:null,stdout:'partial processes',stderr:'ps failed'},
     {status:0,signal:'SIGTERM',stdout:processBytes,stderr:''},
     {status:0,signal:null,stdout:undefined,stderr:''},{status:0,signal:null,stdout:' \n',stderr:''}
    ]){
     processResult=bad;const count=calls.length;
     assert.throws(()=>measurement.startMeasurement('command',{candidate:sha},{containers:'observe'}),/Process census unavailable/);
     assert.deepEqual(calls.slice(count),['ps','docker'],'Observational mode still attempts both real command boundaries');
     const failedResult=processResult;processResult={status:0,signal:null,stdout:processBytes,stderr:''};
     const returning=measurement.startMeasurement('command',{candidate:sha},{containers:'observe'});await returning.ready;processResult=failedResult;
     await assert.rejects(()=>measurement.endMeasurement(returning),(error:unknown)=>error instanceof AggregateError&&error.errors.some(value=>/Process census unavailable/.test(String(value))));
    }
    processResult={status:0,signal:null,stdout:processBytes,stderr:''};
    for(const bad of [
     {status:1,signal:null,stdout:'partial',stderr:'Docker failed'},
     {status:null,signal:null,error:Object.assign(new Error('spawn docker ENOENT'),{code:'ENOENT'}),stdout:null,stderr:null},
     {status:0,signal:'SIGTERM',stdout:'',stderr:''},{status:0,signal:null,stdout:undefined,stderr:''}
    ]){
     dockerResult=bad;assert.throws(()=>measurement.startMeasurement('command',{candidate:sha},true),/Docker census unavailable/);
     writes.length=0;const unknown=measurement.startMeasurement('command',{candidate:sha},{containers:'observe'});await unknown.ready;await measurement.endMeasurement(unknown);
     for(const value of decode())for(const census of [value.before,...(value.after?[value.after]:[])]){
      assert.equal(census.containerObservation.status,'unknown');assert.equal(census.containerObservation.qualified,false);assert(census.containerObservation.diagnostic.length>0);
      assert.equal(census.containerObservation.exitStatus,bad.status);assert.equal(census.containerObservation.signal,bad.signal);
      assert.equal(census.containerObservation.stdout,typeof bad.stdout==='string'?bad.stdout:null);assert.equal(census.containerObservation.stderr,typeof bad.stderr==='string'?bad.stderr:null);
      assert.deepEqual(census.containerObservation.error,'error' in bad?{name:(bad.error as Error).name,message:(bad.error as Error).message,code:'ENOENT'}:null);assert.equal(census.containers,null);assert.equal(census.containerBytes,null);
     }
    }
    for(const phase of ['suite-lifetime','command']){
     dockerResult={status:0,signal:null,stdout:'',stderr:''};
     const admitted=measurement.startMeasurement(phase,{candidate:sha},phase==='command'?{containers:'observe'}:true);await admitted.ready;
     // The runner makes its command policy sticky at actual integration admission.
     admitted.census=true;dockerResult={status:1,signal:null,stdout:'',stderr:'Docker lost after integration admission'};
     await assert.rejects(()=>measurement.endMeasurement(admitted),(error:unknown)=>error instanceof AggregateError&&error.errors.some(value=>/Docker census unavailable/.test(String(value))));
    }
   }finally{childProcess.spawnSync=originalSpawnSync;syncBuiltinESMExports();process.stdout.write=originalWrite;}

   const observationGate=await import(pathToFileURL(resolve('g1-storage/scripts/observation-gate.mjs')).href);
   const example=examples().find(x=>x[0]==='QualificationObservationSchema')![2];
   const record=S.QualificationObservationSchema.parse(example),stream='# '+JSON.stringify(record);
   assert.deepEqual(observationGate.validateObservations(stream,'authority',['read','deny'],S.QualificationObservationSchema),record);
   assert.throws(()=>observationGate.validateObservations('', 'authority',['read'],S.QualificationObservationSchema));
   assert.throws(()=>observationGate.validateObservations(stream+'\n'+stream, 'authority',['read'],S.QualificationObservationSchema));
   assert.throws(()=>observationGate.validateObservations(stream,'authority',['ask'],S.QualificationObservationSchema));
   const legacy={measurement:'artifact-verification-observations',suite:'artifact-publication',positives:record.positives,violations:record.violations};
   const sources=[{suite:'authority',measurement:'storage-observations',positives:['read','deny']},{suite:'artifact-publication',measurement:'artifact-verification-observations',positives:['read','deny']}];
   const multi=stream+'\n# '+JSON.stringify(legacy);
   assert.equal(observationGate.validateObservations(multi,'commit-conflict',[],S.QualificationObservationSchema,sources).length,2);
   for(const bad of [stream,multi+'\n'+stream,'# '+JSON.stringify(legacy)+'\n'+stream,
    stream+'\n# '+JSON.stringify({...legacy,suite:'foreign'}),
    stream+'\n# '+JSON.stringify({...legacy,extra:true}),
    stream+'\n# '+JSON.stringify({...legacy,positives:{...legacy.positives,read:0}})]){
    assert.throws(()=>observationGate.validateObservations(bad,'commit-conflict',[],S.QualificationObservationSchema,sources));
   }
   for(const index of [0,1])for(const key of Object.keys(record.violations)){
    const values=[record,legacy].map((value,i)=>i===index?{...value,violations:{...value.violations,[key]:1}}:value);
    assert.throws(()=>observationGate.validateObservations(values.map(value=>'# '+JSON.stringify(value)).join('\n'),'commit-conflict',[],S.QualificationObservationSchema,sources));
   }
   for(const key of Object.keys(record.violations)){
    const changed={...record,violations:{...record.violations,[key]:1}};
    assert.throws(()=>observationGate.validateObservations('# '+JSON.stringify(changed),'authority',['read'],S.QualificationObservationSchema));
   }
  });
  await t.test('C03/borrowed-owner',resourceContractProbe);
 });
}
