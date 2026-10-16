import {mkdirSync,readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {cwd,root,build,assertCandidate,assertBaseline} from './build.mjs';
import {census} from './census.mjs';
import {select,info,ids,exactInventory,assertSuiteInventory} from './inventory.mjs';
import {modules} from './registrations.mjs';
import {supervise} from './process.mjs';
import {raw,assertResults,assertObservations,writeReport} from './result.mjs';
export function preflight(selection,registrations=modules){
 if(selection.kind==='full')assertSuiteInventory(Object.keys(registrations));
 for(const id of selection.expanded){const s=info(id).suite;if(!registrations[s]?.ids.includes(id))throw new Error('Required assertion not implemented: '+id);}
 for(const [suite,m]of Object.entries(registrations)){if(new Set(m.ids).size!==m.ids.length||m.ids.some(id=>info(id)?.suite!==suite))throw new Error('Invalid assertion registration: '+suite);}
 return true;
}
export function assertCurrent(built,paths=[]){
 assertCandidate(built.candidate);
 for(const p of paths)if(!lstatSync(p).isFile())throw new Error('Emitted test missing');
 assertBaseline();
}
export async function dispatch({file,selected,evidence,candidate:binding,timeoutMs=120000,env={},signal,requirements,nonce=randomUUID()}){
 const eventsPath=join(evidence,'events.ndjson'),observationsPath=join(evidence,'observations.ndjson');
 const result=await supervise({args:['--test','--test-concurrency=1','--test-reporter=tap','--test-reporter-destination=stdout','--test-reporter='+new URL('./events-reporter.mjs',import.meta.url).pathname,'--test-reporter-destination='+eventsPath,file],cwd:root,evidence,timeoutMs,signal,nonce,env:{...env,RUNTIME_CASES:JSON.stringify(selected),RUNTIME_CANDIDATE:binding,RUNTIME_OBSERVATIONS:observationsPath,RUNTIME_SOURCE_ROOT:cwd}});
 const stdout=readFileSync(join(evidence,'stdout.txt'),'utf8'),events=readFileSync(eventsPath,'utf8');
 assertResults({stdout,events,status:result.exit?.status,signal:result.exit?.signal,timedOut:result.timedOut,selected});
 const records=readFileSync(observationsPath,'utf8').trim().split('\n').map(s=>JSON.parse(s));
 assertObservations(records,{selected,nonce,candidate:binding,processes:result.owned,requirements});
 return {result,raw:Object.fromEntries(['stdout.txt','stderr.txt','events.ndjson','observations.ndjson','births.ndjson','supervisor.json'].map(p=>[p,raw(join(evidence,p))]))};
}
export async function main(kind,args){
 const selection=select(kind,args);
 if(kind==='remote')throw new Error('REMOTE_UNAPPROVED: no authorized environment or installed adapter; no connection attempted');
 if(kind==='owners')throw new Error('OWNER_ADAPTER_UNAVAILABLE: Docker/PG execution prohibited; no connection attempted');
 preflight(selection);census();
 const evidence=join(cwd,'evidence','run-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());mkdirSync(evidence,{recursive:true});
 let built,cleaned=false;const started=performance.now();
 try{
  built=build();writeFileSync(join(evidence,'build.json'),JSON.stringify(built.metadata,null,2)+'\n');
  const executed=[];
  for(const suite of [...new Set(selection.expanded.map(id=>info(id).suite))]){
   const m=modules[suite],selected=selection.expanded.filter(id=>info(id).suite===suite),dir=join(evidence,suite);mkdirSync(dir);
   const file=join(built.path,'g1-runtime/tests',m.file);assertCurrent(built,[file]);
   const requirements=Object.fromEntries(selected.map(id=>[id,m.observations]));
   const checked=await dispatch({file,selected,evidence:dir,candidate:built.candidate,requirements});
   assertCurrent(built,[file]);executed.push({suite,selected,cases:selected.map(id=>({id,...info(id),requiredObservations:requirements[id],observationRef:suite+'/observations.ndjson'})),...checked});
   process.stdout.write(readFileSync(join(dir,'stdout.txt')));process.stderr.write(readFileSync(join(dir,'stderr.txt')));
  }
  exactInventory(executed.flatMap(r=>r.selected),selection.expanded,'executed inventory');
  built.cleanup();cleaned=true;assertBaseline();
  const report={schemaVersion:1,kind:selection.partial?'partial-check':'fixed-view-check',view:kind,names:selection.names,selectors:selection.selectors,expanded:selection.expanded,unexecuted:selection.permitted.filter(id=>!selection.expanded.includes(id)),unexecutedGlobal:ids.filter(id=>!selection.expanded.includes(id)),candidate:built.candidate,assurance:'owned-local-fixture',remoteQualified:false,inputProvenance:'synthetic-owned-fixtures',behaviorDomain:'L',executed,durationMs:performance.now()-started,cleanup:true,success:true,pending:['Unimplemented local assertion registrations','Original PostgreSQL owners and preserved Docker-backed regressions','Authorized Linux deployment and hostile-process/browser isolation'],raw:Object.fromEntries(executed.flatMap(r=>Object.entries(r.raw).map(([p,v])=>[r.suite+'/'+p,v])))};
  writeReport(evidence,report);console.log(JSON.stringify({evidence,success:true,remoteQualified:false}));return report;
 }catch(e){writeFileSync(join(evidence,'failure.txt'),String(e.stack??e));throw e;}
 finally{if(built&&!cleaned)built.cleanup();assertBaseline();}
}
