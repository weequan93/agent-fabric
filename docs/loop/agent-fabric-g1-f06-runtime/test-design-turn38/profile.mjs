// Design specimen only: unchanged owning assertions, no product registrations or
// runner edits. Repeated IDs belong to separate benchmark invocations and NEVER
// supply a full-suite union, a previously passed case, or acceptance evidence.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {freemem,loadavg,totalmem,availableParallelism} from 'node:os';
import {spawnSync} from 'node:child_process';
import {build,assertBaseline,candidate,sha} from '../../../../g1-runtime/scripts/build.mjs';
import {dispatch,preflight,assertCurrent} from '../../../../g1-runtime/scripts/runner.mjs';
import {select} from '../../../../g1-runtime/scripts/inventory.mjs';
import {census,sameInstance} from '../../../../g1-runtime/scripts/census.mjs';
import {modules} from '../../../../g1-runtime/scripts/registrations.mjs';
import {verifyRaw} from '../../../../g1-runtime/scripts/result.mjs';

assert.equal(process.argv.length,2,'No arbitrary command, target or lane override');
const here=fileURLToPath(new URL('./',import.meta.url));
process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS??'','--import='+new URL('./birth-details.mjs',import.meta.url).href].join(' ');
const run=join(here,'profile-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
mkdirSync(run,{recursive:false});
const selected=['stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','stop-and-both-expiries'].map(p=>'A16/quiescence-snapshot/settlement/'+p+'/wrong-boot');
const selection=select('suites',['recovery-stop','--cases',...selected]);
preflight(selection);census();
const start=performance.now(),wholeEnd=start+460000;
const report={kind:'unchanged-pilot-concurrency-design-specimen',acceptance:false,fullMatrixFit:false,remoteQualified:false,
 selected,lanes:[1,2,4,8],perChildMaximumMs:120000,wholeWorkMaximumMs:460000,controllerMaximumMs:480000,
 guards:{minimumFreeBytes:1024**3,maximumOwnedRssBytes:4*1024**3},
 host:{totalmem:totalmem(),availableParallelism:availableParallelism()},phases:[],build:null,cleanup:false,success:false};
let built;
const allOwned=[],operations=new Set(),successors=new Set(),universes=new Set();
const write=()=>writeFileSync(join(run,'result.json'),JSON.stringify(report,null,2)+'\n');
const requirements=Object.fromEntries(selected.map(id=>[id,modules['recovery-stop'].observations]));
function diskSize(dir){let n=0;for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile())n+=statSync(p).size;else if(e.isDirectory())n+=diskSize(p);}return n;}
function sample(nonces){
 const r=spawnSync('ps',['-axo','pid=,ppid=,rss=,%cpu=,args='],{encoding:'utf8',timeout:3000,maxBuffer:16*1024*1024,env:{...process.env,LC_ALL:'C'}});
 assert.equal(r.status,0,'Actual RSS census required');
 const rows=r.stdout.trim().split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);assert.ok(m,'RSS census parse');return {pid:+m[1],ppid:+m[2],rssBytes:+m[3]*1024,cpu:+m[4],command:m[5]};});
 const owned=new Set(rows.filter(r=>nonces.some(n=>r.command.includes(n))).map(r=>r.pid));
 let changed=true;while(changed){changed=false;for(const r of rows)if(owned.has(r.ppid)&&!owned.has(r.pid)){owned.add(r.pid);changed=true;}}
 const actual=rows.filter(r=>owned.has(r.pid));
 return {atMs:performance.now()-start,freeBytes:freemem(),load:loadavg(),ownedLive:actual.length,ownedRssBytes:actual.reduce((s,r)=>s+r.rssBytes,0),ownedCpu:actual.reduce((s,r)=>s+r.cpu,0)};
}
function inspect(result,dir,nonce){
 verifyRaw(dir,result.raw);
 const records=readFileSync(join(dir,'observations.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
 let branches=0,expiry=0;const laneOperations=[];
 for(const r of records){
  const obs=Object.fromEntries(r.observations.map(o=>[o.kind,o.detail]));
  const states=obs['continuation-state'].vectors,targets=obs['target-observer'].vectors,processes=obs['process-census'].vectors;
  assert.equal(states.length,targets.length);assert.equal(states.length,processes.length);
  for(let i=0;i<states.length;i++){
   const s=states[i],t=targets[i],p=processes[i];
   assert.equal(s.originalOperationId,t.originalOperationId);assert.equal(s.freshRecovery,true);assert.equal(s.unchangedOriginal,true);
   assert.equal(t.negativeGets,1);assert.equal(t.restoredGets,1);assert.equal(t.originalWrites,1);assert.equal(t.successorWrites,1);
   assert.ok(t.restoredStatusGet.at>=t.negativeStatusGet.at);assert.notEqual(s.originalOperationId,t.successorOperationId);
   assert.equal(p.serviceBirths.length,2);assert.notEqual(p.serviceBirths[0],p.serviceBirths[1]);
   for(const [set,key] of [[operations,s.originalOperationId],[successors,t.successorOperationId]]){assert.ok(!set.has(key),'No branch or lane may reuse original/successor');set.add(key);}
   const ownedTarget=result.result.owned.find(o=>o.pid===t.pid);
   assert.ok(ownedTarget&&ownedTarget.nonce===nonce,'Actual nonce-owned target birth');
   const roots=readFileSync(join(dir,'births.ndjson.design-targets'),'utf8').trim().split('\n').map(JSON.parse);
   const root=roots.find(r=>r.pid===t.pid&&r.ppid===ownedTarget.ppid&&r.nonce===nonce);
   assert.ok(root,'Supplemental root must match independently censused target birth');
   assert.ok(!universes.has(root.root),'Every journey has its own mutable fixture root');universes.add(root.root);
   laneOperations.push({caseId:r.id,field:s.field,operationId:s.originalOperationId,successorOperationId:t.successorOperationId,
    targetPid:t.pid,targetBirth:ownedTarget.birth,fixtureRootDigest:sha(root.root),fixtureDev:root.dev,fixtureIno:root.ino,ownerPids:p.serviceBirths,
    originalReceiptDigest:sha(JSON.stringify(t.originalReceipt)),negativeGet:t.negativeStatusGet,restoredGet:t.restoredStatusGet});
   branches++;if(['lease-expired-original','effect-expired-original','stop-and-both-expiries'].includes(s.path))expiry++;
  }
 }
 assert.equal(branches,18);assert.equal(expiry,10); // 3+3+4 independently expired originals
 allOwned.push(...result.result.owned);
 return {branches,actualExpiryOriginals:expiry,operations:laneOperations,ownedBirths:result.result.owned.length};
}
try{
 const buildAt=performance.now();built=build();report.build={...built.metadata,durationMs:performance.now()-buildAt};write();
 for(const lanes of report.lanes){
  assert.ok(freemem()>=2*1024**3,'Insufficient free memory before ramp; no larger rung launched');
  const at=performance.now(),phase={lanes,startMs:at-start,dispatches:[],samples:[],success:false};report.phases.push(phase);write();
  const end=Math.min(at+120000,wholeEnd),abort=new AbortController(),nonces=Array.from({length:lanes},()=>randomUUID());
  let samplingError;
  const take=()=>{try{const s=sample(nonces);phase.samples.push(s);if(s.freeBytes<report.guards.minimumFreeBytes||s.ownedRssBytes>report.guards.maximumOwnedRssBytes)throw new Error('Resource guard reached; no higher rung');}catch(e){samplingError??=String(e.stack??e);abort.abort();}};
  take();const monitor=setInterval(take,2000),deadline=setTimeout(()=>abort.abort(),Math.max(1,end-performance.now()));
  try{
   const jobs=nonces.map(async(nonce,lane)=>{
    const dir=join(run,'lanes-'+lanes+'-child-'+lane);mkdirSync(dir);const childAt=performance.now();
    try{
     const file=join(built.path,'g1-runtime/tests/continuation.test.js');assertCurrent(built,[file]);
     const checked=await dispatch({file,selected,evidence:dir,candidate:built.candidate,requirements,nonce,timeoutMs:Math.max(1,Math.min(120000,end-performance.now())),signal:abort.signal});
     assert.ok(performance.now()<=end,'Phase includes final verification in deadline');
     assertCurrent(built,[file]);const identity=inspect(checked,dir,nonce);
     const extra=readFileSync(join(dir,'births.ndjson.design-targets'));
     const row={lane,nonce,durationMs:performance.now()-childAt,...identity,raw:{...checked.raw,'births.ndjson.design-targets':{bytes:extra.length,sha256:sha(extra)}},success:true};
     phase.dispatches.push(row);write();return row;
    }catch(e){phase.dispatches.push({lane,nonce,durationMs:performance.now()-childAt,error:String(e.stack??e),success:false});abort.abort();write();throw e;}
   });
   const outcomes=await Promise.allSettled(jobs);take();
   assert.ok(!samplingError,samplingError);assert.ok(outcomes.every(o=>o.status==='fulfilled'),'One or more real dispatches failed; retained, no retry or higher rung');
   assert.equal(phase.dispatches.length,lanes);assert.ok(performance.now()<=end,'No logical deadline reset');
   const now=census();assert.ok(!now.some(p=>nonces.some(n=>p.command.includes(n))),'Nonce process residue');
   phase.success=true;
  }finally{clearInterval(monitor);clearTimeout(deadline);phase.durationMs=performance.now()-at;phase.rawBytes=diskSize(run);write();}
 }
 assert.equal(candidate().digest,built.candidate);assertBaseline();
 const now=census();assert.ok(!allOwned.some(o=>now.some(p=>sameInstance(p,o))),'Owned birth residue');
 report.success=true;
}catch(e){report.error=String(e.stack??e);process.exitCode=1;}
finally{
 try{if(built)built.cleanup();assertBaseline();report.cleanup=true;}catch(e){report.cleanupError=String(e.stack??e);report.success=false;process.exitCode=1;}
 report.durationMs=performance.now()-start;report.uniqueOriginals=operations.size;report.uniqueSuccessors=successors.size;report.uniqueFixtureRoots=universes.size;
 report.specimenSha256=sha(readFileSync(fileURLToPath(import.meta.url)));write();
 console.log(JSON.stringify({run,success:report.success,acceptance:false,fullMatrixFit:false,phases:report.phases.map(p=>({lanes:p.lanes,success:p.success,durationMs:p.durationMs})),error:report.error??null}));
}
