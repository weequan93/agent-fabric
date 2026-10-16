import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import type {ComponentTest} from './canonical-component.js';

// The component and full delivery suite call this same seven-leaf body. It reads
// original controller results; an old result stays historical after source edits.
export async function registerDeliveryEvidenceTests(register:ComponentTest=test){
 const root=process.env['STORAGE_REPO_ROOT']??process.cwd();
 const modulePath=pathToFileURL(resolve(root,'g1-storage/scripts/delivery-evidence.mjs')).href;
 const m=await import(modulePath),audit=await m.inspectEvidence(),origin=await m.evidenceOrigin();
 const original=audit.latest.find((r:{id:string})=>r.id==='f05-15-docs.delivery-operations-component');assert(original);
 await register('D02 / actual candidate, definitions, raw streams and independent status',async t=>{
  await t.test('D02/candidate-check-lock-binding',async()=>{
   assert.equal(origin.executionRoot,root);assert.equal(audit.executionRoot,root);assert.equal(audit.originRoot,origin.originRoot);
   assert.deepEqual(await m.evidenceOrigin(),{executionRoot:root,originRoot:audit.originRoot});
   assert.match(audit.current.candidate.digest,/^sha256:[a-f0-9]{64}$/);const current=await import(pathToFileURL(resolve(root,'g1-storage/scripts/candidate.mjs')).href);assert.deepEqual(audit.current.candidate,current.candidateSnapshot());
   for(const file of ['tests/helpers/delivery-evidence-component.ts','tests/components/delivery-evidence.test.ts','tests/delivery-audit.test.ts','scripts/delivery-evidence.mjs','scripts/check-evidence.mjs']){const stat=lstatSync(resolve(root,'g1-storage',file));assert(stat.isFile()&&!stat.isSymbolicLink());assert(stat.size>0);}
   assert.match(audit.current.controllerFingerprint,/^git:[a-f0-9]{24}$/);
   const dependencies=JSON.parse(readFileSync(resolve(root,'g1-storage/dependencies.json'),'utf8'));assert.equal(audit.current.lock.sha256,'sha256:'+dependencies.lockSha256);
   assert.equal(original.command,'node g1-storage/scripts/check-component.mjs delivery-operations');assert.match(original.candidate,/^sha256:[a-f0-9]{64}$/);assert.equal(original.status,'pass');assert.equal(original.exitCode,0);assert.equal(original.outcome,'completed');assert(original.elapsedMs>0);
   const transport=m.outerRecords(original.rows).find((r:{measurement:string;binding?:{phase:string}})=>r.measurement==='storage-measurement-transport'&&r.binding?.phase==='command');assert(transport);assert.equal(transport.binding.candidate,original.candidate);assert.equal(transport.binding.command.args.at(-1),'delivery-operations');assert.equal(transport.binding.command.args.at(-2),resolve(audit.originRoot,'g1-storage/scripts/check-component.mjs'));assert.equal(transport.binding.command.cwd,audit.originRoot);
   for(const [id,path] of [['g1-storage-behavior','g1-storage/scripts/check.mjs'],['identity-behavior','g1-identity/scripts/check.mjs'],['foundation-behavior','g1-foundations/scripts/check.mjs'],['retained-baselines','g1-foundations/scripts/check-retained.mjs']])assert.deepEqual(audit.definitions['acceptance.'+id].argv,['node',path]);
   assert.equal(original.candidateCurrent,original.candidate===audit.current.candidate.digest);assert.equal(original.workspaceCurrent,original.controllerFingerprint===audit.current.controllerFingerprint);
   assert.throws(()=>m.assertCurrentRun({...original,candidate:audit.current.candidate.digest,controllerFingerprint:'git:000000000000000000000000'},audit.current),/Stale controller workspace/);
   assert.throws(()=>m.assertCurrentRun({...original,controllerFingerprint:audit.current.controllerFingerprint,candidate:'sha256:'+'0'.repeat(64)},audit.current),/Stale F05 candidate/);
  });
  await t.test('D02/complete-controller-streams',async()=>{
   for(const stream of [original.stdout,original.stderr]){const bytes=readFileSync(resolve(root,stream.path));m.assertStream(bytes,stream);assert.throws(()=>m.assertStream(Buffer.concat([bytes,Buffer.from('changed')]),stream));if(bytes.length)assert.throws(()=>m.assertStream(bytes.subarray(0,-1),stream),/Complete stream byte count/);assert.throws(()=>m.assertStream(bytes,{...stream,sha256:'sha256:'+'0'.repeat(64)}),/Original stream SHA256/);}
   const output=m.outerRecords(original.rows).filter((r:{measurement:string})=>r.measurement==='storage-test-report');assert.equal(output.length,1);assert.equal(output[0].scope,'component');assert.equal(output[0].diagnosticOnly,true);const r=output[0].reports[0];assert.equal(r.suite,'delivery-operations');assert.equal(r.tests,28);assert.equal(r.cases.length,4);assert.equal(r.variants.length,24);
   const required=JSON.parse(readFileSync(resolve(root,'g1-storage/verification/required-variants-v1.json'),'utf8'));for(const id of ['D01','D03','D04','D05'])for(const leaf of required.cases[id])assert.equal(r.executions.filter((e:{name:string;indent:number;parent:string|null})=>e.indent===4&&e.name===leaf&&e.parent?.startsWith(id+' / ')).length,1,leaf);
   const fixtures=original.rows.filter((r:{measurement:string})=>r.measurement==='storage-owned-fixture');assert.equal(fixtures.length,1);
   for(const f of fixtures){for(const name of ['storage-container-cleanup','storage-root-cleanup']){const entries=original.rows.filter((r:{measurement:string;owner:string;instance:string})=>r.measurement===name&&r.owner===f.owner&&r.instance===f.instance);assert.equal(entries.length,1);assert.equal(entries[0].removed,true);if(name==='storage-container-cleanup')assert.equal(entries[0].censusUnchanged,true);}}
   const children=original.rows.filter((r:{measurement:string})=>r.measurement==='model-owned-process');assert.equal(children.length,4);for(const child of children){const cleanup=original.rows.filter((r:{measurement:string;pid:number})=>r.measurement==='model-owned-process-cleanup'&&r.pid===child.pid);assert.equal(cleanup.length,1);assert.equal(cleanup[0].removed,true);}
   assert.equal(m.outerRecords(original.rows).filter((r:{measurement:string})=>r.measurement==='strict-build').length,1);const guards=original.rows.filter((r:{measurement:string})=>r.measurement==='preserved-inputs');assert(guards.length>=2);for(const g of guards){assert.equal(g.files,2581);assert.equal(g.unchanged,true);}
   // These bounded in-memory controls exercise the shipped raw reader and
   // coverage gate. They create no controller job, fixture or product verdict.
   const registry=await import(pathToFileURL(resolve(root,'g1-storage/scripts/registry.mjs')).href);
   const {fullDescriptor}=await import(pathToFileURL(resolve(root,'g1-storage/scripts/full-composition.mjs')).href);
   const {encodeMeasurement,decodeMeasurement}=await import(pathToFileURL(resolve(root,'g1-storage/scripts/measurement-transport.mjs')).href);
   const dependencies=JSON.parse(readFileSync(resolve(root,'g1-storage/dependencies.json'),'utf8'));
   const candidate=audit.current.candidate.digest,copyRoot=resolve('/private/tmp/agent-fabric-storage-stream-format/candidate');
   const sources=Object.fromEntries(['execution-measurement.mjs','measurement-transport.mjs','runner.mjs','suite-execution.mjs','build.mjs','process-result.mjs'].map(file=>[file,m.digest(readFileSync(resolve(root,'g1-storage/scripts',file)))]));
   const outerCommand={executable:process.execPath,args:[resolve(root,'g1-storage/scripts/check.mjs')],cwd:root};
   const nestedCommand={executable:process.execPath,args:[resolve(copyRoot,'g1-storage/scripts/runner.mjs'),'00000000-0000-4000-8000-000000000001'],cwd:copyRoot};
   type StreamEntry={prefix:string;value:Record<string,unknown>};
   type ControlSuite={cases:string[];variants:Record<string,string[]>;positives:string[]|null};
   type ObservationSource={component:string;suite?:string};
   type Execution={indent:number;number:number;name:string;parent:string|null};
   const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
   const entry=(value:Record<string,unknown>,prefix=''):StreamEntry=>({prefix,value});
   const positiveNames=['save','ask','forget','restore','read','write','deny','conflict','propagate','backup','owner','harness'];
   const violationNames=['unauthorizedDisclosure','unauthorizedMutation','silentLostUpdate','duplicateCanonicalEffect','restrictedResurrection','askComputerStart'];
   const observation=(suite:string)=>({schemaVersion:1,measurement:'storage-observations',suite,positives:Object.fromEntries(positiveNames.map(name=>[name,1])),violations:Object.fromEntries(violationNames.map(name=>[name,0]))});
   let fixtureSequence=0;
   const uuid=()=>`00000000-0000-4000-8000-${String(++fixtureSequence).padStart(12,'0')}`;
   const fixture=()=>{
    const owner=uuid(),instance=uuid(),fixtureRoot={rootId:uuid(),device:1,inode:fixtureSequence};
    const roots=Object.fromEntries(['content','backup','restore','authority'].map(name=>[name,{rootId:uuid(),device:1,inode:fixtureSequence}]));
    const containerId=m.digest(owner).slice(7);
    return {origin:{measurement:'storage-owned-fixture',owner,instance,containerId,fixtureRoot,roots},cleanup:[
     {measurement:'storage-container-cleanup',owner,instance,containerId,removed:true,censusUnchanged:true},
     {measurement:'storage-root-cleanup',owner,instance,rootId:fixtureRoot.rootId,rootIds:Object.values(roots).map(r=>r.rootId),removed:true}]};
   };
   const suiteReport=(id:string,suite:ControlSuite)=>{
    const descriptor=fullDescriptor(id);
    const components:ControlSuite[]=id==='recall-ask'?registry.recallAskObservationSources.map((s:ObservationSource)=>registry.executionComponents[s.component]):id==='backup-restore'?registry.backupRestoreObservationSources.map((s:ObservationSource)=>registry.executionComponents[s.component]):id==='commit-conflict'?[...registry.commitConflictPredecessors.map((name:string)=>registry.executionComponents[name]),suite]:[suite];
    const cases:string[]=descriptor?clone(descriptor.parents):components.flatMap(component=>component.cases);
    const variants:Record<string,string[]>=Object.assign({},...components.map(component=>component.variants));
    if(id==='harness')variants['H03']=[...variants['H03']!,'H03/missing-fixture-never-skipped'];
    const executions:Execution[]=descriptor?clone(descriptor.executions):cases.flatMap((parent,index)=>[...(variants[parent]??[]).map((name,leaf)=>({indent:4,number:leaf+1,name,parent})),{indent:0,number:index+1,name:parent,parent:null}]);
    let observations:unknown=suite.positives===null?null:observation(id);
    if(descriptor)observations={measurement:'storage-full-observation-composition',suite:id,candidate,sources:descriptor.registrations.map((spec:{id:string;suite:string;fixtures:number})=>{
     const owned=Array.from({length:spec.fixtures},fixture);
     return {registration:spec.id,observation:observation(spec.suite),fixtures:owned.map(f=>f.origin),cleanup:owned.flatMap(f=>f.cleanup)};
    }),diagnostics:[]};
    else if(['commit-conflict','recall-ask','backup-restore'].includes(id)){
     const expected:ObservationSource[]=id==='commit-conflict'?registry.commitConflictObservationSources:id==='recall-ask'?registry.recallAskObservationSources:registry.backupRestoreObservationSources;
     observations=expected.map(source=>observation(source.suite??source.component));
    }
    return {suite:id,tests:executions.length,cases,variants:executions.filter(e=>e.indent>0).map(e=>e.name),executions,fail:0,cancelled:0,skipped:0,todo:0,observations};
   };
   const reports=Object.entries(registry.executionSuites).map(([id,suite])=>suiteReport(id,suite as ControlSuite));
   const prerequisite=Object.entries(registry.executionSuites).filter(([id])=>id!=='harness').map(([id,suite])=>suiteReport(id,suite as ControlSuite));
   assert.equal(reports.length,11);assert.equal(prerequisite.length,10);assert.equal(prerequisite.findIndex(report=>report.suite==='atomic-disconnect'),prerequisite.findIndex(report=>report.suite==='commit-conflict')+1);
   const build={measurement:'strict-build',sourceAndTests:true,node:'v22.22.3',pins:{pg:'8.16.3','@types/pg':'8.15.5','@types/node':'22.18.6',typescript:'5.9.3'},dependencyLockDigest:'sha256:'+dependencies.lockSha256,cacheCleared:true,install:'offline/frozen/ignore-scripts'};
   const guard={measurement:'preserved-inputs',files:2581,unchanged:true};
   const commandRows=(mode:string,command:typeof outerCommand,returning:boolean,prefix=''):StreamEntry[]=>{
    const binding={phase:'command',candidate,command,sources};
    const value={measurement:returning?'storage-parent-return':'storage-parent-start',phase:'command',clock:'parent-monotonic',mode,candidate,startedMs:1,...(returning?{returnedMs:2,elapsedMs:1,success:true}:{}),transportBinding:binding};
    return encodeMeasurement(value,binding).map((row:Record<string,unknown>)=>entry(row,prefix));
   };
   const nestedFixture=fixture(),outerFixture=fixture();
   const nested:StreamEntry[]=[entry({measurement:'storage-candidate',digest:candidate,diagnosticOnly:true},'# '),...commandRows('harness-prerequisite',nestedCommand,false,'# '),entry(guard,'# '),entry(build,'# '),entry(nestedFixture.origin,'# '),...nestedFixture.cleanup.map(row=>entry(row,'# ')),entry({measurement:'storage-test-report',scope:'harness-prerequisite',diagnosticOnly:true,externalQualification:'pending',reports:prerequisite},'# '),entry(guard,'# '),...commandRows('harness-prerequisite',nestedCommand,true,'# ')];
   const diagnosticCommand={executable:process.execPath,args:[resolve(copyRoot,'g1-storage/scripts/check-component.mjs'),'harness-build'],cwd:copyRoot};
   const diagnostic:StreamEntry[]=[...commandRows('component',diagnosticCommand,false,'# '),entry(guard,'# '),entry(build,'# '),entry({measurement:'storage-test-report',scope:'component',diagnosticOnly:true,externalQualification:'pending',reports:[]},'# '),entry(guard,'# '),...commandRows('component',diagnosticCommand,true,'# ')];
   const stream:StreamEntry[]=[entry({measurement:'storage-candidate',digest:candidate,diagnosticOnly:false}),...commandRows('aggregate',outerCommand,false),entry(guard),entry(build),...diagnostic,...nested,entry(outerFixture.origin),...outerFixture.cleanup.map(row=>entry(row)),entry({measurement:'storage-test-report',scope:'aggregate',diagnosticOnly:false,externalQualification:'pending',reports}),entry(guard),...commandRows('aggregate',outerCommand,true)];
   const read=(entries:StreamEntry[])=>m.records(Buffer.from(entries.map(({prefix,value})=>prefix+JSON.stringify(value)).join('\n')+'\n'));
   const coverage=(entries:StreamEntry[])=>m.assertAggregateCoverage({rows:read(entries),candidate,command:'node g1-storage/scripts/check.mjs',commandBinding:outerCommand},registry);
   const isRecord=(row:StreamEntry,prefix:string,measurement:string)=>row.prefix===prefix&&row.value['measurement']===measurement;
   const refuse=(name:string,change:(entries:StreamEntry[])=>StreamEntry[])=>assert.throws(()=>coverage(change(clone(stream))),name);
   coverage(stream);
   const failedCommand={executable:process.execPath,args:[resolve(copyRoot+'-failed','g1-storage/scripts/runner.mjs'),'00000000-0000-4000-8000-000000000002'],cwd:copyRoot+'-failed'};
   const failedFixture=fixture();
   const failedReturn=commandRows('harness-prerequisite',failedCommand,true,'# ');
   const failedBinding=failedReturn[0]!.value['binding'];
   const failedValue=decodeMeasurement(failedReturn.map(row=>row.value),failedBinding).record;failedValue.success=false;
   const earlierAttempt:StreamEntry[]=[entry({measurement:'storage-candidate',digest:candidate,diagnosticOnly:true},'# '),...commandRows('harness-prerequisite',failedCommand,false,'# '),entry(guard,'# '),entry(build,'# '),entry(failedFixture.origin,'# '),...failedFixture.cleanup.map(row=>entry(row,'# ')),entry(guard,'# '),...encodeMeasurement(failedValue,failedBinding).map((row:Record<string,unknown>)=>entry(row,'# '))];
   const afterCommand={executable:process.execPath,args:[resolve(copyRoot+'-after','g1-storage/scripts/check-component.mjs'),'harness-build'],cwd:copyRoot+'-after'};
   const afterDiagnostic=[...commandRows('component',afterCommand,false,'# '),entry(build,'# '),entry({measurement:'storage-test-report',scope:'component',diagnosticOnly:true,externalQualification:'pending',reports:[]},'# '),...commandRows('component',afterCommand,true,'# ')];
   const attemptStream=clone(stream);
   const nestedAt=attemptStream.findIndex(row=>isRecord(row,'# ','storage-candidate'));
   attemptStream.splice(nestedAt,0,...clone(earlierAttempt),...clone(diagnostic));
   const outerFixtureAt=attemptStream.findIndex(row=>isRecord(row,'','storage-owned-fixture'));
   attemptStream.splice(outerFixtureAt,0,...clone(afterDiagnostic));
   coverage(attemptStream);
   const attemptRefuse=(name:string,change:(rows:StreamEntry[])=>void)=>{const rows=clone(attemptStream);change(rows);assert.throws(()=>coverage(rows),name);};
   const genuineReport=(rows:StreamEntry[])=>rows.findIndex(row=>isRecord(row,'# ','storage-test-report')&&row.value['scope']==='harness-prerequisite');
   const genuineCandidate=(rows:StreamEntry[])=>rows.findLastIndex(row=>isRecord(row,'# ','storage-candidate')&&rows.indexOf(row)<genuineReport(rows));
   const insertBeforeReport=(rows:StreamEntry[],values:StreamEntry[])=>rows.splice(genuineReport(rows),0,...values);
   attemptRefuse('overlapping earlier start cannot enclose successful command',rows=>{const index=rows.findIndex(row=>isRecord(row,'# ','storage-candidate'));rows.splice(index,0,...commandRows('component',afterCommand,false,'# '));});
   attemptRefuse('competing start before report',rows=>{insertBeforeReport(rows,commandRows('component',afterCommand,false,'# '));});
   attemptRefuse('interleaved settled diagnostic command before report',rows=>{insertBeforeReport(rows,[...commandRows('component',afterCommand,false,'# '),...commandRows('component',afterCommand,true,'# ')]);});
   attemptRefuse('interleaved return before report',rows=>{insertBeforeReport(rows,commandRows('component',afterCommand,true,'# '));});
   attemptRefuse('duplicate selected start provenance',rows=>{insertBeforeReport(rows,commandRows('harness-prerequisite',nestedCommand,false,'# '));});
   attemptRefuse('duplicate selected return provenance',rows=>{rows.splice(genuineReport(rows)+1,0,...commandRows('harness-prerequisite',nestedCommand,true,'# '));});
   attemptRefuse('reused selected provenance in earlier settled attempt',rows=>{const index=rows.findIndex(row=>isRecord(row,'# ','storage-candidate'));rows.splice(index,0,...commandRows('harness-prerequisite',nestedCommand,false,'# '),...commandRows('harness-prerequisite',nestedCommand,true,'# '));});
   const genuineReturn=(rows:StreamEntry[])=>rows.findIndex((row,index)=>index>genuineReport(rows)&&isRecord(row,'# ','storage-measurement-transport')&&row.value['kind']==='start'&&(row.value['binding'] as {command?:{cwd:string}}|undefined)?.command?.cwd===copyRoot);
   const replaceGenuineReturn=(rows:StreamEntry[],command:typeof nestedCommand,success:boolean)=>{
    const index=genuineReturn(rows);assert(index>=0);const count=(rows[index]!.value['count'] as number)+2;
    const frames=commandRows('harness-prerequisite',command,true,'# '),binding=frames[0]!.value['binding'];
    const value=decodeMeasurement(frames.map(row=>row.value),binding).record;value.success=success;
    rows.splice(index,count,...encodeMeasurement(value,binding).map((row:Record<string,unknown>)=>entry(row,'# ')));
   };
   attemptRefuse('mismatched selected return binding',rows=>replaceGenuineReturn(rows,failedCommand,true));
   attemptRefuse('selected false return cannot use earlier settlement',rows=>replaceGenuineReturn(rows,nestedCommand,false));
   attemptRefuse('missing selected return cannot use diagnostic return',rows=>{const index=genuineReturn(rows);assert(index>=0);rows.splice(index,(rows[index]!.value['count'] as number)+2);});
   attemptRefuse('earlier failed guards cannot supply good command',rows=>{const begin=genuineCandidate(rows),end=genuineReturn(rows);for(let index=end-1;index>begin;index--)if(isRecord(rows[index]!,'# ','preserved-inputs'))rows.splice(index,1);});
   attemptRefuse('earlier failed cleanup cannot supply good command',rows=>{for(let index=rows.length-1;index>=0;index--)if(isRecord(rows[index]!,'# ','storage-root-cleanup')&&rows[index]!.value['owner']===nestedFixture.origin.owner)rows.splice(index,1);});
   attemptRefuse('earlier failed build cannot supply good command',rows=>{const index=rows.findLastIndex(row=>isRecord(row,'# ','strict-build')&&rows.indexOf(row)<genuineReport(rows));rows.splice(index,1);});
   attemptRefuse('earlier failed candidate cannot supply good command',rows=>{const index=genuineCandidate(rows);assert(index>=0);rows.splice(index,1);});
   attemptRefuse('earlier failed report cannot supply good command',rows=>{const index=genuineReport(rows),[report]=rows.splice(index,1);const earlier=rows.findIndex(row=>isRecord(row,'# ','storage-candidate'));rows.splice(earlier,0,report!);});
   coverage(clone(attemptStream));
   const supplemental='H03/missing-fixture-never-skipped';
   const harness=reports.find(report=>report.suite==='harness')!;assert.equal(harness.tests,44);assert.equal(harness.variants.length,40);
   assert.deepEqual(harness.executions.filter(execution=>execution.name===supplemental),[{indent:4,number:14,name:supplemental,parent:'H03'}]);
   const changeHarness=(rows:StreamEntry[],change:(report:typeof harness)=>void)=>{const report=rows.find(row=>isRecord(row,'','storage-test-report'))!;change((report.value['reports'] as typeof reports).find(report=>report.suite==='harness')!);return rows;};
   refuse('missing H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{report.executions=report.executions.filter(execution=>execution.name!==supplemental);report.variants=report.variants.filter(name=>name!==supplemental);report.tests--;}));
   refuse('duplicate H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{const index=report.executions.findIndex(execution=>execution.name===supplemental);report.executions.splice(index,0,clone(report.executions[index]!));report.variants.push(supplemental);report.tests++;}));
   refuse('wrong-parent H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{report.executions.find(execution=>execution.name===supplemental)!.parent='H03 / forged';}));
   refuse('renamed H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{report.executions.find(execution=>execution.name===supplemental)!.name='H03/missing-fixture-skipped';report.variants[report.variants.indexOf(supplemental)]='H03/missing-fixture-skipped';}));
   refuse('wrong-number H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{report.executions.find(execution=>execution.name===supplemental)!.number=13;}));
   refuse('wrong-indent H03 mandatory missing-fixture execution',rows=>changeHarness(rows,report=>{report.executions.find(execution=>execution.name===supplemental)!.indent=8;}));

   // Identical payloads retain their actual line prefix, depth and order. TAP
   // escaping and indentation cannot elevate a nested record to outer scope.
   const payload={measurement:'stream-format-control',scope:'aggregate',depth:0,prefix:''};
   const prefixes=['','# ','# \\# ','    # '];
   const scoped=read(prefixes.map(prefix=>entry(payload,prefix)));
   assert.equal(scoped.length,4);for(const row of scoped)assert.deepEqual(row,payload);
   assert.deepEqual(scoped.map((row:object)=>m.recordContext(row).prefix),prefixes);
   assert.deepEqual(scoped.map((row:object)=>m.recordContext(row).depth),[0,1,2,1]);
   const orders:number[]=scoped.map((row:object)=>m.recordContext(row).order);assert(orders.every((order,index)=>index===0||order>orders[index-1]!));
   assert.deepEqual(m.outerRecords(scoped),[scoped[0]]);assert.throws(()=>m.outerRecords([payload]),/raw|context|record/i);
   // Produce the format through the actual pinned native TAP reporter, not a
   // hand-written escaped fixture. Its stdout pipe folds large JSON; a nested
   // diagnostic uses the actual indented prefix and escaping on one large line.
   const nativeOutput=(value:Record<string,unknown>,wrapped=false)=>{
    const directory=mkdtempSync(resolve(tmpdir(),'fabric-storage-native-tap-'));
    try{
     const file=resolve(directory,'native.mjs');
     writeFileSync(file,"import test from 'node:test';const value="+JSON.stringify(value)+";test('native-record',async t=>{process.stdout.write(JSON.stringify(value)+'\\n');process.stdout.write(JSON.stringify({measurement:'native-following'})+'\\n');await t.test('indented',t=>t.diagnostic(JSON.stringify(value)));});");
     let executing=file;
     if(wrapped){
      executing=resolve(directory,'outer.mjs');
      writeFileSync(executing,"import test from 'node:test';import assert from 'node:assert/strict';import{spawnSync}from'node:child_process';test('native-wrapper',()=>{const child=spawnSync(process.execPath,['--test','--test-reporter=tap',"+JSON.stringify(file)+"],{env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);process.stdout.write(child.stdout);});");
     }
     const result=spawnSync(process.execPath,['--test','--test-reporter=tap',executing],{env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',maxBuffer:16*1024*1024});
     assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');
     return result.stdout;
    }finally{rmSync(directory,{recursive:true,force:true});assert.throws(()=>lstatSync(directory),{code:'ENOENT'});}
   };
   const nativePayload={...payload,unicode:'记忆 café 😀',embedded:JSON.stringify({path:'literal\\path',hash:'#',newline:'first\nsecond',literal:'\\n'}),boundary:''};
   const boundaryStart=Buffer.byteLength(JSON.stringify(nativePayload))-2;
   nativePayload.boundary='x'.repeat(65535-boundaryStart)+'\\'.repeat(160000);
   assert(Buffer.byteLength(JSON.stringify(nativePayload))>65536);
   const native=nativeOutput(nativePayload),nativeLines=native.split(/\r?\n/),nativeRows=m.records(Buffer.from(native));
   const nativeControls=nativeRows.filter((row:{measurement:string})=>row.measurement===payload.measurement);
   assert.equal(nativeControls.length,2);for(const row of nativeControls)assert.deepEqual(row,nativePayload,'Exact native Unicode/embedded JSON/backslash/hash/newline round-trip');
   const firstContext=m.recordContext(nativeControls[0]),indentedContext=m.recordContext(nativeControls[1]);
   assert.equal(firstContext.prefix,'# ');assert.equal(firstContext.depth,1);assert.equal(nativeLines[firstContext.order]!.startsWith('# {'),true);
   assert.equal(indentedContext.prefix,'    # ');assert.equal(indentedContext.depth,1);assert.equal(nativeLines[indentedContext.order]!.startsWith('    # {'),true);
   const following=nativeRows.find((row:{measurement:string})=>row.measurement==='native-following');assert(following);
   const followingContext=m.recordContext(following);assert.equal(followingContext.prefix,'# ');assert(followingContext.order>firstContext.order+1);assert(followingContext.order<indentedContext.order);
   for(const line of nativeLines.slice(firstContext.order,followingContext.order))assert(line.startsWith('# '),'Actual folded fragments retain their exact prefix');
   assert.equal(m.outerRecords(nativeRows).length,0,'Payload outer claims never promote native scope');
   const folded=nativeLines.slice(firstContext.order,followingContext.order);
   // At least one real pipe boundary falls within a JSON escape, so separately
   // decoded physical fragments must reassemble before JSON parsing.
   assert(folded.slice(0,-1).some(line=>(line.match(/\\+$/)?.[0].length??0)%4===2), 'Actual native boundary inside a JSON escape');
   const nestedPayload={...nativePayload,boundary:'edge\\#\n',truth:true,number:-1.25e21,empty:null};
   const nestedNative=nativeOutput(nestedPayload,true),nestedNativeRows=m.records(Buffer.from(nestedNative));
   const nestedControls=nestedNativeRows.filter((row:{measurement:string})=>row.measurement===payload.measurement);
   assert.equal(nestedControls.length,2);for(const row of nestedControls)assert.deepEqual(row,nestedPayload,'Exact twice-native-escaped payload');
   assert.deepEqual(nestedControls.map((row:object)=>m.recordContext(row).prefix),['# \\# ','#     \\# ']);
   assert.deepEqual(nestedControls.map((row:object)=>m.recordContext(row).depth),[2,2]);
   const nestedLines=nestedNative.split(/\r?\n/);
   for(const row of nestedControls){const context=m.recordContext(row);assert(nestedLines[context.order]!.startsWith(context.prefix+'{'));}
   const nestedFollowing=nestedNativeRows.find((row:{measurement:string})=>row.measurement==='native-following');assert(nestedFollowing);
   assert(m.recordContext(nestedControls[0]).order<m.recordContext(nestedFollowing).order);assert(m.recordContext(nestedFollowing).order<m.recordContext(nestedControls[1]).order);
   // Split actual native escaped bytes at valid JSON token boundaries. These
   // remain legal prefixes even when V8 reports a delimiter/number error
   // instead of its "unexpected end" message; no error text classifies them.
   const tokenPrefix=m.recordContext(nestedControls[0]).prefix;
   const tokenText=nestedLines[m.recordContext(nestedControls[0]).order]!.slice(tokenPrefix.length);
   for(const token of ['"truth":t','"number":-','"number":-1.25e+','"empty":n']){
    const cut=tokenText.indexOf(token)+token.length;assert(cut>=token.length);
    const splitRows=m.records(Buffer.from(tokenPrefix+tokenText.slice(0,cut)+'\n'+tokenPrefix+tokenText.slice(cut)+'\n'));
    assert.equal(splitRows.length,1,token);assert.deepEqual(splitRows[0],nestedPayload,token);assert.deepEqual(m.recordContext(splitRows[0]),{prefix:tokenPrefix,depth:2,order:0});
   }
   const requiredReport=nested.find(row=>row.value['measurement']==='storage-test-report')!.value;
   const reportNative=nativeOutput(requiredReport),reportRows=m.records(Buffer.from(reportNative));
   const decodedReport=reportRows.find((row:{measurement:string})=>row.measurement==='storage-test-report');assert(decodedReport);assert.deepEqual(decodedReport,requiredReport);
   const reportLines=reportNative.split(/\r?\n/),reportStart=m.recordContext(decodedReport).order;
   const reportEnd=m.recordContext(reportRows.find((row:{measurement:string})=>row.measurement==='native-following')).order;
   assert(reportEnd>reportStart+1,'Required copied report actually folds in native node:test output');
   const reportFragments=reportLines.slice(reportStart,reportEnd);
   const nativeCoverage=(fragments:string[])=>{
    const lines=stream.flatMap(row=>row===nested.find(n=>n.value['measurement']==='storage-test-report')?fragments:[row.prefix+JSON.stringify(row.value)]);
    const rows=m.records(Buffer.from(lines.join('\n')+'\n'));
    m.assertAggregateCoverage({rows,candidate,command:'node g1-storage/scripts/check.mjs',commandBinding:outerCommand},registry);
   };
   nativeCoverage(reportFragments);
   const rejectFragments=(name:string,change:(lines:string[])=>string[])=>assert.throws(()=>nativeCoverage(change([...reportFragments])),name);
   rejectFragments('native required report missing',()=>[]);
   rejectFragments('native required report duplicate',lines=>[...lines,...lines]);
   rejectFragments('native required report truncated',lines=>lines.slice(0,-1));
   rejectFragments('native required report corrupted',lines=>{lines[1]='# \\q'+lines[1]!.slice(2);return lines;});
   rejectFragments('native TAP diagnostic interleaving',lines=>{lines.splice(1,0,'# Subtest: interleaved diagnostic');return lines;});
   rejectFragments('native diagnostic counters interleaving',lines=>{lines.splice(1,0,'# tests 0');return lines;});
   for(const diagnostic of ['','TAP version 13','Bail out! stopped','pragma +strict'])rejectFragments('native TAP boundary '+diagnostic,lines=>{lines.splice(1,0,'# '+diagnostic);return lines;});
   rejectFragments('native new JSON interleaving',lines=>{lines.splice(1,0,'# '+JSON.stringify({measurement:'interleaved'}));return lines;});
   rejectFragments('native changed prefix',lines=>{lines[1]='    '+lines[1];return lines;});
   rejectFragments('native changed depth',lines=>{lines[1]='# \\# '+lines[1]!.slice(2);return lines;});
   rejectFragments('native nested report cannot forge outer',lines=>lines.map(line=>line.slice(2)));
   nativeCoverage(reportFragments);
   for(const measurement of ['storage-candidate','storage-test-report','strict-build']){
    refuse('missing outer '+measurement,rows=>rows.filter(row=>!isRecord(row,'',measurement)));
    refuse('duplicate outer '+measurement,rows=>{const index=rows.findIndex(row=>isRecord(row,'',measurement));rows.splice(index,0,clone(rows[index]!));return rows;});
   }
   refuse('nested-only success',rows=>rows.filter(row=>row.prefix!==''));
   refuse('nested aggregate payload cannot supply missing outer',rows=>rows.filter(row=>!isRecord(row,'','storage-test-report')).map(row=>{if(isRecord(row,'# ','storage-test-report'))Object.assign(row.value,{scope:'aggregate',diagnosticOnly:false});return row;}));
   for(const property of ['sourceAndTests','cacheCleared'])refuse('nonfresh outer '+property,rows=>{const row=rows.find(row=>isRecord(row,'','strict-build'))!;row.value[property]=false;return rows;});
   for(const [property,value] of [['node','v22.0.0'],['dependencyLockDigest','sha256:'+'0'.repeat(64)],['install','online']] as const)refuse('unbound outer build '+property,rows=>{rows.find(row=>isRecord(row,'','strict-build'))!.value[property]=value;return rows;});
   const inPrerequisite=(rows:StreamEntry[],row:StreamEntry)=>rows.indexOf(row)>=rows.findIndex(row=>isRecord(row,'# ','storage-candidate'));
   for(const measurement of ['storage-candidate','storage-test-report','strict-build']){
    refuse('missing nested '+measurement,rows=>rows.filter(row=>!isRecord(row,'# ',measurement)||!inPrerequisite(rows,row)));
    refuse('duplicate nested '+measurement,rows=>{const index=rows.findIndex(row=>isRecord(row,'# ',measurement)&&inPrerequisite(rows,row));rows.splice(index,0,clone(rows[index]!));return rows;});
   }
   const changeNestedReport=(rows:StreamEntry[],change:(report:typeof prerequisite)=>void)=>{const report=rows.find(row=>isRecord(row,'# ','storage-test-report')&&inPrerequisite(rows,row))!;change(report.value['reports'] as typeof prerequisite);return rows;};
   refuse('incomplete nested workload',rows=>changeNestedReport(rows,reports=>{reports.pop();}));
   refuse('nested suite order',rows=>changeNestedReport(rows,reports=>{[reports[0],reports[1]]=[reports[1]!,reports[0]!];}));
   refuse('incomplete nested execution',rows=>changeNestedReport(rows,reports=>{reports[0]!.executions.pop();}));
   for(const field of ['fail','cancelled','skipped','todo'] as const)refuse('nested '+field,rows=>changeNestedReport(rows,reports=>{reports[0]![field]=1;}));
   refuse('nested aggregate payload with genuine outer',rows=>{Object.assign(rows.find(row=>isRecord(row,'# ','storage-test-report')&&inPrerequisite(rows,row))!.value,{scope:'aggregate',diagnosticOnly:false});return rows;});
   refuse('nonfresh nested build',rows=>{rows.find(row=>isRecord(row,'# ','strict-build')&&inPrerequisite(rows,row))!.value['cacheCleared']=false;return rows;});
   refuse('different-depth nested build',rows=>{rows.find(row=>isRecord(row,'# ','strict-build')&&inPrerequisite(rows,row))!.prefix='# \\# ';return rows;});
   refuse('standalone nested build cannot supply workload',rows=>{const index=rows.findIndex(row=>isRecord(row,'# ','strict-build')&&inPrerequisite(rows,row));const [build]=rows.splice(index,1);const start=rows.findIndex(row=>inPrerequisite(rows,row)&&row.prefix==='# '&&row.value['kind']==='start'&&(row.value['binding'] as {phase?:string}|undefined)?.phase==='command');rows.splice(start,0,build!);return rows;});
   refuse('different copied candidate',rows=>{rows.find(row=>isRecord(row,'# ','storage-candidate'))!.value['digest']='sha256:'+'0'.repeat(64);return rows;});
   for(const position of ['before','after'])refuse('prerequisite outside outer command '+position,rows=>{
    const start=rows.findIndex(row=>isRecord(row,'# ','storage-candidate'));
    const complete=rows.splice(start,nested.length);
    if(position==='before')rows.unshift(...complete);else rows.push(...complete);
    return rows;
   });
   const alterNestedTransport=(rows:StreamEntry[],returning:boolean,change:(record:Record<string,unknown>)=>void)=>{
    const headers=rows.map((row,index)=>({row,index})).filter(({row})=>inPrerequisite(rows,row)&&row.prefix==='# '&&row.value['measurement']==='storage-measurement-transport'&&row.value['kind']==='start'&&(row.value['binding'] as {phase?:string}|undefined)?.phase==='command');
    const header=headers[returning?1:0]!;
    const count=(header.row.value['count'] as number)+2,transport=rows.slice(header.index,header.index+count).map(row=>row.value);
    const value=decodeMeasurement(transport,header.row.value['binding']).record;
    change(value);const replacement=encodeMeasurement(value,value.transportBinding).map((row:Record<string,unknown>)=>entry(row,'# '));
    rows.splice(header.index,count,...replacement);return rows;
   };
   refuse('unsuccessful nested command',rows=>alterNestedTransport(rows,true,value=>{value['success']=false;}));
   refuse('nested command mode',rows=>alterNestedTransport(rows,false,value=>{value['mode']='component';}));
   for(const returning of [false,true])refuse('missing nested command '+(returning?'return':'start'),rows=>{
    const headers=rows.map((row,index)=>({row,index})).filter(({row})=>inPrerequisite(rows,row)&&row.prefix==='# '&&row.value['kind']==='start'&&(row.value['binding'] as {phase?:string}|undefined)?.phase==='command');
    const header=headers[returning?1:0]!;rows.splice(header.index,(header.row.value['count'] as number)+2);return rows;
   });
   const changeNestedObservation=(rows:StreamEntry[],change:(value:ReturnType<typeof observation>)=>void)=>changeNestedReport(rows,reports=>{change(reports.find(report=>report.suite==='authority')!.observations as ReturnType<typeof observation>);});
   refuse('nested positive omitted',rows=>changeNestedObservation(rows,observation=>{observation.positives['read']=0;}));
   refuse('nested violation',rows=>changeNestedObservation(rows,observation=>{observation.violations['unauthorizedDisclosure']=1;}));
   refuse('nested descriptor source omitted',rows=>changeNestedReport(rows,reports=>{(reports.find(report=>report.suite==='lifecycle-propagation')!.observations as {sources:unknown[]}).sources.pop();}));
   refuse('nested descriptor root cleanup omitted',rows=>changeNestedReport(rows,reports=>{const source=(reports.find(report=>report.suite==='lifecycle-propagation')!.observations as {sources:{cleanup:{measurement:string}[]}[]}).sources[0]!;source.cleanup=source.cleanup.filter(row=>row.measurement!=='storage-root-cleanup');}));
   refuse('missing nested root cleanup',rows=>rows.filter(row=>!(isRecord(row,'# ','storage-root-cleanup')&&row.value['owner']===nestedFixture.origin.owner)));
   refuse('nested cleanup failure',rows=>{rows.find(row=>isRecord(row,'# ','storage-container-cleanup')&&row.value['owner']===nestedFixture.origin.owner)!.value['removed']=false;return rows;});
   refuse('nested cleanup order',rows=>{const index=rows.findIndex(row=>isRecord(row,'# ','storage-container-cleanup')&&row.value['owner']===nestedFixture.origin.owner);[rows[index],rows[index+1]]=[rows[index+1]!,rows[index]!];return rows;});
   // A later complete fresh control demonstrates refusal did not poison the
   // reader; it cannot retrospectively qualify any deliberately damaged stream.
   coverage(clone(stream));
   // Controller-wrapper cleanup stays distinct from these owned fixture records.
   assert(original.cleanup==='zombie'||original.cleanup==='clean'||original.cleanup==='reaped');assert.equal(audit.qualification.authorVerdict,false);
  });
  await t.test('D02/pending-review-visible',async()=>{
   const reviews=m.reviewState(audit.state,audit.events,audit.current.controllerFingerprint);assert.deepEqual(Object.keys(reviews),['security','code','final-acceptance','product-acceptance']);
   for(const [id,r] of Object.entries(reviews) as [string,{status:string}][])if(r.status!=='pass')assert(audit.qualification.blockers.some((b:string)=>b.includes(id)),id);
   const manufactured={...audit.state,reviews:{...audit.state.reviews,security:{verdict:'pass',fingerprint:audit.current.controllerFingerprint,at:'2000-01-01T00:00:00Z',by:'author',signature:'fabricated'}}};assert.equal(m.reviewState(manufactured,audit.events,audit.current.controllerFingerprint).security.status,'unregistered');assert.equal(m.qualification({...audit,state:manufactured}).qualified,false);
   assert.equal(audit.qualification.externalQualification,'pending');assert.equal(audit.qualification.authorVerdict,false);
  });
  await t.test('D02/historical-failures-retained',async()=>{
   const path='.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-bef5a26060/f05-15-docs.delivery-operations-component/';
   for(const [name,bytes,sha256] of [['stdout',169738,'4a6b1a4a4d03c5b702d51af33eca62a1e0e78dd67a81f4ca6ef19ab2a31c6ae0'],['stderr',2165,'c5c4576d5868611faf8b824974ade32ac89735935871030259e94df04e20df53']] as const)m.assertStream(readFileSync(resolve(root,path+name+'.log')),{bytes,sha256:'sha256:'+sha256});
   const raw=readFileSync(resolve(root,path+'stdout.log'),'utf8');assert(raw.includes('D03/all-fields-inventory'));assert(raw.includes('# fail 2'));assert(audit.events.some((e:{type:string;data:{job?:string;results?:Record<string,string>}})=>e.type==='job.finished'&&e.data.job==='job-bef5a26060'&&e.data.results?.['f05-15-docs.delivery-operations-component']==='fail'));
   assert.notEqual(original.job,'job-bef5a26060');
  });
 });
 await register('D06 / unsupported qualification is refused against live controller evidence',async t=>{
  await t.test('D06/severe-finding-blocks',async()=>{
   for(const category of ['authorization','isolation','stale-approval','duplicate-effect'])for(const severity of ['high','critical']){
    const finding={id:'owned-negative-'+category+'-'+severity,status:'confirmed',severity,category,profile:'deterministic-local-only',text:'Unresolved '+category+' defect'};
    const findings=[...audit.state.findings,finding],result=m.qualification(audit,{findings});assert.equal(result.qualified,false);assert(result.blockers.includes('Unresolved severe finding: '+finding.id));assert.throws(()=>m.requireControllerBehavior({...audit,state:{...audit.state,findings}}),/Unresolved severe findings/);
    assert(!m.severeFindings([{...finding,status:'rejected'}]).length);
   }
  });
  await t.test('D06/missing-current-acceptance-blocks',async()=>{
   const absent={...audit,latest:audit.latest.filter((r:{id:string})=>!r.id.startsWith('f05-15.')),state:{...audit.state,verification:null}};
   const result=m.qualification(absent);assert.equal(result.qualified,false);assert(result.blockers.includes('Missing current controller final acceptance'));assert.throws(()=>m.requireControllerBehavior(absent),/Missing terminal controller result/);
   const noAcceptance=m.qualification({...audit,state:{...audit.state,verification:null}});assert.equal(noAcceptance.qualified,false);assert(noAcceptance.blockers.includes('Missing current controller final acceptance'));
   const staleAcceptance=m.qualification({...audit,state:{...audit.state,verification:{passed:true,fingerprint:'git:'+'0'.repeat(24)}}});assert.equal(staleAcceptance.qualified,false);assert(staleAcceptance.blockers.includes('Missing current controller final acceptance'));
   for(const status of ['fail','timeout']){const failed={...original,id:'f05-15.full-storage-behavior',status,controllerFingerprint:audit.current.controllerFingerprint,candidate:audit.current.candidate.digest};const result=m.qualification({...audit,latest:[failed,...audit.latest]});assert.equal(result.qualified,false);assert(result.blockers.includes('Failed or stale terminal controller check: full-storage-behavior'));}
   for(const [id,check] of Object.entries(audit.definitions) as [string,{run?:string}][])if(id==='f05-15.evidence-controller')assert.equal(check.run,'node g1-storage/scripts/check-evidence.mjs controller-behavior');
  });
  await t.test('D06/no-author-verdict',async()=>{
   for(const claim of ['COMPLETE','qualified','security-pass']){const r=m.qualification(audit,{claim});assert.equal(r.qualified,false);assert(r.blockers.includes('Author claims cannot issue controller acceptance'));assert.equal(r.authorVerdict,false);}
   for(const args of [[],['local','extra'],['unknown'],['controller-behavior','extra']]){const r=spawnSync(process.execPath,[resolve(root,'g1-storage/scripts/check-evidence.mjs'),...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/Unknown\/extra evidence checker argument/);assert.equal(r.stdout,'');}
   assert.equal(audit.qualification.externalQualification,'pending');
  });
 });
 console.log(JSON.stringify({measurement:'delivery-evidence-assertions',candidate:audit.current.candidate.digest,controllerFingerprint:audit.current.controllerFingerprint,latestChecks:audit.latest.length,operationsJob:original.job,operationsCandidate:original.candidate,operationsWorkspaceCurrent:original.workspaceCurrent,qualification:audit.qualification,reviews:m.reviewState(audit.state,audit.events,audit.current.controllerFingerprint),wholeHostReaped:false}));
}
