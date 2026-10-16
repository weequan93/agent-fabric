import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,unlinkSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {registerCases,type Observations} from './helpers/register-cases.js';
import {api,capsule,negativeEvidence,fixtureFile,json,source} from './helpers/owned-capsule.js';
import {exerciseWatchdog,exerciseBirthSnapshotRace,observePriorFailedCleanup} from './helpers/owned-processes.js';
const cases:Record<string,()=>Promise<Observations>>={};
const observed=(count:number,detail:Record<string,unknown>={}):Observations=>({'negative-gates':{count,...detail},'owned-cleanup':{verified:true}});
const fixtureObservation=(id:string,kinds=['assertions'])=>`process.getBuiltinModule('fs').appendFileSync(process.env.RUNTIME_OBSERVATIONS,JSON.stringify({id:${JSON.stringify(id)},pid:process.pid,nonce:process.env.RUNTIME_OWNER_NONCE,candidate:process.env.RUNTIME_CANDIDATE,success:true,observations:${JSON.stringify(kinds)}.map(kind=>({kind,observed:true,forbidden:false,detail:{executed:true}}))})+'\\n');`;
async function executed(name:string,body:string,timeoutMs=5000){
 const {dispatch}=await api('runner'),dir=negativeEvidence(name),file=join(dir,'fixture.test.mjs');
 fixtureFile(file,body);
 const selected=['H03/full'];
 return {dir,promise:dispatch({file,selected,evidence:dir,candidate:'fixture-'+name,timeoutMs,requirements:{'H03/full':['assertions']}})};
}
cases['H01/full']=async()=>{
 const {inventory,localSuites,view,select,exactInventory}=await api('inventory');const copy=await capsule();let count=0;
 try{
  const full=Object.fromEntries(localSuites.map((s:string)=>[s,{file:s+'.test.js',ids:view('suites',[s]),observations:['assertions']}]));
  const mutations:Record<string,unknown>[]=[];
  for(const suite of localSuites){const missing={...full};delete missing[suite];mutations.push(missing);mutations.push({...full,[suite]:{...full[suite],ids:[]}});}
  const contracts=full['contracts'];
  mutations.push({...full,contracts:{...contracts,ids:contracts.ids.slice(1)}});
  mutations.push({...full,contracts:{...contracts,ids:[...contracts.ids.slice(1),contracts.ids[1]]}});
  mutations.push({...full,contracts:{...contracts,ids:['renamed',...contracts.ids.slice(1)]}});
  for(const mutation of mutations){
   writeFileSync(join(copy.dir,'scripts/registrations.mjs'),'export const modules='+JSON.stringify(mutation)+';\n');
   const r=spawnSync(process.execPath,[join(copy.dir,'scripts/check.mjs')],{encoding:'utf8',timeout:5000});
   assert.equal(r.error,undefined);assert.notEqual(r.status,0);assert.match(r.stderr,/Missing\/empty|Required assertion|Invalid assertion/);assert.equal(existsSync(join(copy.dir,'evidence')),false);count++;
  }
  for(const kind of ['owners','remote']){const expected=view(kind);assert.throws(()=>exactInventory(expected.slice(1),expected));assert.throws(()=>exactInventory([expected[0].split('/')[0]],expected));count+=2;}
  for(const [kind,args]of [['suites',['harness-integrity','--cases']],['suites',['harness-integrity','--cases','H01','H01']],['suites',['harness-integrity','--cases','H01','H01/full']],['suites',['contracts','--cases','H01']],['owners',['--cases','P02/unknown']],['remote',['--cases','P01']],['full',['--cases','H01']]] as [string,string[]][]){assert.throws(()=>select(kind,args));count++;}
  const expanded=select('component',['contract-kernel','--cases','C05']).expanded;assert.equal(expanded.length,3);assert.ok(expanded.every((id:string)=>inventory.ids.includes(id)));
  for(const [script,args,pattern]of [['check-owners',['--cases','P01'],/OWNER_ADAPTER_UNAVAILABLE/],['check-remote',['--cases','X01'],/REMOTE_UNAPPROVED/]] as [string,string[],RegExp][]){const r=spawnSync(process.execPath,[join(copy.dir,'scripts',script+'.mjs'),...args],{encoding:'utf8',timeout:5000});assert.notEqual(r.status,0);assert.match(r.stderr,pattern);assert.equal(existsSync(join(copy.dir,'evidence')),false);count++;}
 }finally{copy.cleanup();}
 return observed(count,{missingEverySuite:true,missingOwnerAndRemoteDescendants:true,refusalBeforeFixtures:true});
};
cases['H02/full']=async()=>{
 const {compileCurrent,assertEmission,candidate,assertCandidate}=await api('build'),{assertCurrent}=await api('runner');const copy=await capsule();let count=0;
 try{
  for(const p of ['src','tests'])mkdirSync(join(copy.dir,p));
  const config=json(join(source,'tsconfig.json'));config.compilerOptions.typeRoots=[join(source,'node_modules/@types')];
  writeFileSync(join(copy.dir,'tsconfig.json'),JSON.stringify(config));writeFileSync(join(copy.dir,'package.json'),'{"type":"module"}');
  fixtureFile(join(copy.dir,'src/current.ts'),'export const current:number=1;');fixtureFile(join(copy.dir,'tests/current.test.ts'),'export const checked:number=1;');
  const output=join(copy.path,'compiled');compileCurrent(copy.dir,output);const emitted=join(output,'g1-runtime/tests/current.test.js');assertEmission([emitted]);
  for(const path of ['src/current.ts','tests/current.test.ts']){
   const original=readFileSync(join(copy.dir,path));writeFileSync(join(copy.dir,path),'export const broken: number = "wrong";');
   const failedOutput=join(copy.path,'failed-'+count);
   assert.throws(()=>compileCurrent(copy.dir,failedOutput),/TS2322/);assert.equal(existsSync(join(failedOutput,'g1-runtime',path.replace(/\.ts$/,'.js'))),false,'noEmitOnError must suppress stale success');writeFileSync(join(copy.dir,path),original);count++;
  }
  cpSync(join(source,'pnpm-lock.yaml'),join(copy.dir,'pnpm-lock.yaml'));
  const before=candidate(copy.dir).digest;assertCandidate(before,copy.dir);
  const migration=join(copy.dir,'migrations/0001_runtime_queue.sql'),originalMigration=readFileSync(migration);writeFileSync(migration,Buffer.concat([originalMigration,Buffer.from('\n-- candidate mutation fixture\n')]));assert.throws(()=>assertCandidate(before,copy.dir),/Candidate changed/);writeFileSync(migration,originalMigration);assertCandidate(before,copy.dir);count++;
  writeFileSync(join(copy.dir,'src/current.ts'),'export const current:number=2;');
  // The current-candidate gate is also the one used by dispatch; stale cache is insufficient.
  assert.throws(()=>assertCandidate(before,copy.dir),/Candidate changed/);assertEmission([emitted]);count++;
  assertCurrent({candidate:candidate().digest},[emitted]);unlinkSync(emitted);assert.throws(()=>assertCurrent({candidate:candidate().digest},[emitted]));count++;
 }finally{copy.cleanup();}
 return observed(count,{sourceAndTestCompilerNegatives:2,staleAndMissingEmission:true});
};
cases['H03/full']=async()=>{
 let count=0;
 const variants:Record<string,string>={
  fail:`import {test} from 'node:test';test('H03/full',()=>{throw new Error('intended failure')});`,
  skip:`import {test} from 'node:test';test('H03/full',{skip:true},()=>{});`,
  todo:`import {test} from 'node:test';test('H03/full',{todo:true},()=>{});`,
  cancel:`import {test} from 'node:test';const c=new AbortController();test('H03/full',{signal:c.signal},async()=>{c.abort();await new Promise(()=>{});});`,
  hang:`import {test} from 'node:test';test('H03/full',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});`,
  rejection:`import {test} from 'node:test';test('H03/full',()=>{setImmediate(()=>Promise.reject(new Error('unhandled fixture rejection')));});`
 };
 for(const [name,body]of Object.entries(variants)){
  const {dir,promise}=await executed(name,body,name==='hang'?1500:5000);await assert.rejects(promise);
  const result=json(join(dir,'supervisor.json'));assert.equal(result.cleanup.confirmed,true);assert.equal(result.cleanup.historicalGroupsSignalled,false);
  const stdout=readFileSync(join(dir,'stdout.txt'),'utf8');
  const events=readFileSync(join(dir,'events.ndjson'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  const summaries=events.filter((e:any)=>e.type==='test:summary');
  if(name==='hang'){assert.equal(result.timedOut,true);assert.ok(result.signals.length>0);assert.match(stdout,/SIGTERM/);}
  else if(name==='skip'||name==='todo'){assert.ok(summaries.some((e:any)=>e.data.counts[name==='skip'?'skipped':'todo']===1));assert.equal(result.exit.status,0,'Runner gate must reject skip/TODO even with zero exit');}
  else if(name==='cancel'){assert.ok(summaries.some((e:any)=>e.data.counts.cancelled===1));assert.notEqual(result.exit.status,0);}
  else if(name==='fail'){assert.match(stdout,/intended failure/);assert.notEqual(result.exit.status,0);}
  else {assert.match(stdout,/unhandled fixture rejection/);assert.notEqual(result.exit.status,0);}
  count++;
 }
 return observed(count,{variants:Object.keys(variants),failedRawRetained:true});
};
cases['H04/full']=async()=>{
 const {dir,promise}=await executed('tap-valid',`import {test} from 'node:test';test('H03/full',()=>{${fixtureObservation('H03/full')}});`);await promise;
 const {assertResults,decodeEvents}=await api('result');const stdout=readFileSync(join(dir,'stdout.txt'),'utf8'),events=readFileSync(join(dir,'events.ndjson'),'utf8');
 const valid={stdout,events,status:0,signal:null,timedOut:false,selected:['H03/full']};assertResults(valid);let count=0;
 for(const tap of ['ok 1 - H03/full\n',stdout.replace('1..1','1..0'),stdout.replace(/^1\.\.1\n/m,''),stdout.slice(0,stdout.length/2),stdout+'1..1\n',stdout.replace('# tests 1','# tests 0')]){assert.throws(()=>assertResults({...valid,stdout:tap}));count++;}
 const es=decodeEvents(events),summary=es.find((e:any)=>e.type==='test:summary'&&e.data.file===undefined);
 for(const modified of [es.filter((e:any)=>e!==summary),[...es,summary],es.map((e:any)=>e===summary?{...e,data:{...e.data,file:'fake-nested'}}:e),es.filter((e:any)=>e.type!=='test:pass')]){assert.throws(()=>assertResults({...valid,events:modified.map((e:any)=>JSON.stringify(e)).join('\n')+'\n'}));count++;}
 assert.throws(()=>assertResults({...valid,events:events.slice(0,-2)}));count++;
 const labels=await executed('labels-without-tests',`console.log('ok 1 - H03/full\\n1..1\\n# tests 1\\n# pass 1');`);await assert.rejects(labels.promise);count++;
 return observed(count,{actualRunnerEvents:true,stdoutLabelsInsufficient:true});
};
cases['H10/full']=async()=>{
 const {dir,promise}=await executed('actual-observations',`
 import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync,appendFileSync} from 'node:fs';
 test('H03/full',()=>{
  const target=${JSON.stringify('TARGET_PLACEHOLDER')};
  const action="const fs=require('fs');const f=process.argv[1];let s;try{s=JSON.parse(fs.readFileSync(f))}catch{s={writes:0,owner:'a',waiter:'b'}}s.writes++;fs.writeFileSync(f,JSON.stringify(s));";
  const first=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);
  const one=JSON.parse(readFileSync(target));assert.equal(one.writes,1);assert.equal(one.owner,'a');assert.equal(one.waiter,'b');
  const second=spawnSync(process.execPath,['-e',action,target],{encoding:'utf8'});assert.equal(second.status,0,second.stderr);
  const two=JSON.parse(readFileSync(target));assert.equal(two.writes,2);assert.equal(two.owner,one.owner);
  appendFileSync(process.env.RUNTIME_OBSERVATIONS,JSON.stringify({id:'H03/full',pid:process.pid,nonce:process.env.RUNTIME_OWNER_NONCE,candidate:process.env.RUNTIME_CANDIDATE,success:true,observations:['target','child','queue','restart'].map(kind=>({kind,observed:true,forbidden:false,detail:{firstPid:first.pid,secondPid:second.pid,one,two}}))})+'\\n');
 });`.replace(JSON.stringify('TARGET_PLACEHOLDER'),JSON.stringify(join(negativeEvidence('target'),'state.json'))));
 // H10 needs these stricter observation requirements on the same dispatcher.
 await assert.rejects(promise,/required observations/);
 const {assertObservations}=await api('result');const processResult=json(join(dir,'supervisor.json')),records=readFileSync(join(dir,'observations.ndjson'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
 const context={selected:['H03/full'],nonce:processResult.nonce,candidate:'fixture-actual-observations',processes:processResult.owned,requirements:{'H03/full':['target','child','queue','restart']}};
 assertObservations(records,context);let count=0;
 for(const kind of context.requirements['H03/full']){assert.throws(()=>assertObservations([{...records[0],observations:records[0].observations.filter((o:any)=>o.kind!==kind)}],context));count++;}
 for(const mutation of [{...records[0],nonce:randomUUID()},{...records[0],candidate:'stale'},{...records[0],pid:0},{...records[0],observations:records[0].observations.map((o:any)=>({...o,forbidden:true}))}]){assert.throws(()=>assertObservations([mutation],context));count++;}
 assert.ok(processResult.owned.some((p:any)=>processResult.owned.some((q:any)=>q.ppid===p.pid)),'Actual parent/descendant census');
 const watchdog=await exerciseWatchdog();
 const birthSnapshotRace=await exerciseBirthSnapshotRace();
 const priorFailedCleanup=await observePriorFailedCleanup();
 return observed(count+3,{targetWrites:2,queueAndRestartReadFromDisk:true,ancestryObserved:true,watchdog,birthSnapshotRace,priorFailedCleanup});
};
cases['H15/full']=async()=>{
 const {assertMeasurement}=await api('result');let count=0;
 const {dir,promise}=await executed('measurement-cancel',`import {test} from 'node:test';const c=new AbortController();test('H03/full',{signal:c.signal},async()=>{c.abort();await new Promise(()=>{});});`);await assert.rejects(promise);
 const originalEvents=readFileSync(join(dir,'events.ndjson'),'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.ok(originalEvents.some((e:any)=>e.type==='test:summary'&&e.data.counts.cancelled===1));
 const cancelled={status:'cancelled',start:1,end:2,raw:dir},failed={status:'failed',start:1,end:2,raw:dir},good={status:'passed',start:1,end:2};
 for(const samples of [[good,cancelled],[good,failed],[good],[good,{...good,start:3}],[good,{...good,start:0,end:1}],[good,{...good,end:-1}],[good,{...good,end:Infinity}]]){assert.throws(()=>assertMeasurement(samples,2));count++;}
 assertMeasurement([good,{...good,start:3,end:4}],2);assert.equal(json(join(dir,'supervisor.json')).cleanup.confirmed,true);
 return observed(count,{cancelledAndFailedDenominatorRetained:true});
};
cases['H16/full']=async()=>{
 const {assertPreserved,assertBaseline,sha}=await api('build'),copy=await capsule();let count=0;
 try{
  const baseline=json(join(source,'verification/inherited-files.json')).files;const paths=[Object.keys(baseline).find(p=>p.includes('/src/')&&p.startsWith('g1-foundations/'))!,Object.keys(baseline).find(p=>p.includes('/evidence/')&&p.endsWith('stdout.txt'))!];assert.ok(paths.every(Boolean));
  const expected=Object.fromEntries(paths.map(p=>[p,baseline[p]]));
  for(const path of paths){fixtureFile(join(copy.path,path),readFileSync(join(source,'..',path),'utf8'));}
  assertPreserved(copy.path,expected);
  for(const path of paths){const original=readFileSync(join(copy.path,path));writeFileSync(join(copy.path,path),Buffer.concat([original,Buffer.from('mutated replica')]));assert.throws(()=>assertPreserved(copy.path,expected),/Inherited source\/raw/);writeFileSync(join(copy.path,path),original);assertPreserved(copy.path,expected);count++;}
  assert.equal(assertBaseline(),3767);for(const path of paths)assert.equal(sha(readFileSync(join(source,'..',path))),expected[path]);
 }finally{copy.cleanup();}
 return observed(count,{protectedSourceAndRawReplicas:true,originalBaselineUnchanged:true});
};
registerCases(cases,['negative-gates','owned-cleanup']);
