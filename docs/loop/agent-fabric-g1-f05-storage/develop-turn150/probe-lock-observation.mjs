// EXEC150-01: standalone investigation, never a product/receipt qualification.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,openSync,writeSync,closeSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {root,cache} from '../../../../g1-storage/scripts/paths.mjs';
import {candidateSnapshot} from '../../../../g1-storage/scripts/candidate.mjs';
import {assertBaseline} from '../../../../g1-storage/scripts/guards.mjs';

const source=fileURLToPath(import.meta.url),sourceBytes=readFileSync(source);
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const expected={digest:'sha256:179e0d045adfdbadd9ae8f0af6ceeffe141ed17f7ec1fa390709fddda5b8e0d7',files:1132};
const originalSQL='SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))';
const errorRecord=e=>({name:e?.name,message:e?.message,code:e?.code??null,stack:e?.stack,errors:e instanceof AggregateError?e.errors.map(errorRecord):undefined});
const mono=()=>String(process.hrtime.bigint());
const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});

function preflight(){
 assert.deepEqual(candidateSnapshot(),expected);assertBaseline();
 const base=resolve(root,'docs/loop/agent-fabric-g1-f05-storage'),ready=resolve(base,'readiness-turn152');
 const seal=JSON.parse(readFileSync(resolve(ready,'step-seal.json')));
 for(const b of seal.files){const bytes=readFileSync(resolve(root,b.path));assert.equal(bytes.length,b.bytes);assert.equal(hash(bytes),b.sha256);}
 const state=JSON.parse(readFileSync(resolve(root,'.loop/goals/agent-fabric-g1-f05-storage/state.json')));
 const definitions=JSON.parse(readFileSync(resolve(ready,'current-definitions.json')));
 const fields=['id','title','detail','covers','depends_on','role','team','checks'];
 const authored=tasks=>tasks.map(t=>Object.fromEntries(fields.map(k=>[k,t[k]])));
 assert.deepEqual(authored(state.tasks),authored(definitions.tasks));assert.deepEqual(state.requirements,definitions.requirements);
 assert.equal(state.tasks.length,69);assert.equal(state.tasks.reduce((n,t)=>n+t.checks.length,0),123);
 assert.equal(state.tasks.filter(t=>t.status==='done'&&t.id!=='f05-11-lock-observation-investigation').length,46);
 for(const old of definitions.tasks)if(old.id!=='f05-11-lock-observation-investigation')assert.equal(state.tasks.find(t=>t.id===old.id).status,old.status);
 assert.equal(state.stages.plan_review.verdict,'pass');assert.equal(state.stages.plan_review.digest,'sha256:f000880ac42c0d8d83008c55e011a0b43a2874956baabfaa63956d9eee8cfb1e');
 const inputs=JSON.parse(readFileSync(resolve(ready,'input-bindings.json')));
 for(const b of [...inputs.sources,...inputs.contexts]){const bytes=readFileSync(resolve(root,b.path));assert.equal(bytes.length,b.bytes);assert.equal(hash(bytes),b.sha256);}
 const allocation=JSON.parse(readFileSync(resolve(ready,'task-resource-allocation.json')));let existing=0,pending=0;
 for(const task of allocation)for(const check of task.checks)for(const b of check.sourceBindings){
  if('bytes' in b){const bytes=readFileSync(resolve(root,b.path));assert.equal(bytes.length,b.bytes);assert.equal(hash(bytes).replace('sha256:',''),b.sha256.replace('sha256:',''));existing++;}
  else{assert.equal(resolve(root,b.path),source);pending++;}
 }
 assert.equal(existing,208);assert.equal(pending,1);
 return {candidate:expected,readinessSeal:61,existingBindings:208,implementedPendingSource:{path:relative(root,source),bytes:sourceBytes.length,sha256:hash(sourceBytes)},independentReview:state.stages.plan_review,productQualification:false};
}

async function native(attempt){
 const traceFd=openSync(resolve(attempt,'sql-and-events.ndjson'),'wx',0o600);
 let sequence=0;const cases=[];let sameQueryNullWithBlocker=0;
 const event=(kind,value)=>{const row={sequence:++sequence,monoNs:mono(),wall:new Date().toISOString(),kind,...value};writeSync(traceFd,JSON.stringify(row)+'\n');return row;};
 const query=async(client,label,sql,args=[])=>{
  const start=event('sql-submit',{label,sql,args});
  try{const result=await client.query(sql,args);event('sql-result',{label,submission:start.sequence,rows:result.rows,rowCount:result.rowCount});return result;}
  catch(e){event('sql-error',{label,submission:start.sequence,error:errorRecord(e)});throw e;}
 };
 const identity=(c,label)=>query(c,label,'SELECT pg_backend_pid() AS pid,txid_current_if_assigned()::text AS xid,clock_timestamp() AS at');
 const sample=async(f,pid,label)=>{await query(f.admin,label+'/clear','SELECT pg_stat_clear_snapshot()');const rows=(await query(f.admin,label,originalSQL,[pid])).rows;
  for(const row of rows)if(row.wait_event_type===null&&row.blockers.includes(pid))sameQueryNullWithBlocker++;
  return rows;
 };
 // This is a diagnostic coherent-wait barrier, not a changed original helper.
 // Every first-row return (including null) is retained, never replaced.
 const wait=async(f,pid,label,waiterPid)=>{
  const end=Date.now()+1500;let rows;
  do{rows=await sample(f,pid,label);const row=rows.find(r=>r.wait_event_type==='Lock'&&r.blockers.includes(pid)&&(waiterPid===undefined||r.pid===waiterPid));
   if(row){const activity=(await query(f.admin,label+'/identity','SELECT pid,backend_start,xact_start,query_start,state,wait_event_type,wait_event,backend_xid::text,query,clock_timestamp() AS at,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[row.pid])).rows;
    return {row,activity};}
   await new Promise(r=>setImmediate(r));
  }while(Date.now()<end);
  throw new Error('Diagnostic coherent actual wait absent: '+label);
 };
 const {withStorageFixture}=await import('../../../../g1-storage/scripts/fixture.mjs');
 const {createMaintenanceVerificationFixture}=await import(pathToFileURL(resolve(cache,'g1-storage/tests/helpers/maintenance-verification-fixture.js')).href);
 let x,fixtureError;
 try{
  await withStorageFixture(async state=>{
   assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
   const previous=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));Object.assign(process.env,state.env);
   try{
    x=await createMaintenanceVerificationFixture();
    event('fixture-ready',{owner:x.f.owner,instance:x.f.instance,sourceBoundHelper:true,unchangedDriver:true});
    const bare=await x.f.admin.connect();
    try{
     const id=(await identity(bare,'absent-blocker/identity')).rows[0];
     assert.deepEqual(await sample(x.f,id.pid,'absent-blocker/query'),[]);
     const before=await x.snapshot(),n=x.opens();
     await assert.rejects(()=>x.blocked(bare,'diagnostic-absent-blocker'),/actual PostgreSQL lock wait: diagnostic-absent-blocker/);
     await x.unchanged(before);assert.equal(x.opens(),n);
     cases.push({name:'absent-blocker',blocker:id,originalQueryRows:[],originalHelperActuallyRefused:true,decryptDelta:0,effectsUnchanged:true});
    }finally{bare.release();event('client-release',{label:'absent-blocker'});}

    // A real independent row lock must not satisfy a different blocker PID.
    const unrelatedBefore=await x.snapshot(),unrelatedOpens=x.opens();
    const c=await x.f.admin.connect(),w=await x.f.admin.connect(),idle=await x.f.admin.connect();let unrelated;
    try{
     await query(c,'unrelated/holder-begin','BEGIN');await query(w,'unrelated/waiter-begin','BEGIN');
     const holder=(await identity(c,'unrelated/holder')).rows[0],waiter=(await identity(w,'unrelated/waiter')).rows[0],target=(await identity(idle,'unrelated/idle-target')).rows[0];
     const sql='SELECT * FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 FOR UPDATE',args=[x.f.foreignTenant,x.f.spaces.foreign,x.f.foreignActor];
     await query(c,'unrelated/hold',sql,args);unrelated=query(w,'unrelated/request',sql,args);unrelated.catch(()=>{});
     const observed=await wait(x.f,holder.pid,'unrelated/actual-wait',waiter.pid);
     assert.deepEqual(await sample(x.f,target.pid,'unrelated/wrong-pid'),[]);
     await assert.rejects(()=>x.blocked(idle,'diagnostic-unrelated-blocker'),/actual PostgreSQL lock wait: diagnostic-unrelated-blocker/);
     cases.push({name:'unrelated-blocker',holder,waiter,target,observed,wrongPidRows:[],originalHelperActuallyRefused:true});
    }finally{
     const failures=[];for(const [client,label] of [[c,'unrelated/holder-rollback']])try{await query(client,label,'ROLLBACK');}catch(e){failures.push(e);}
     try{if(unrelated)await unrelated;}catch(e){failures.push(e);}
     try{await query(w,'unrelated/waiter-rollback','ROLLBACK');}catch(e){failures.push(e);}
     c.release();w.release();idle.release();event('client-release',{label:'unrelated/all'});if(failures.length)throw new AggregateError(failures,'Unrelated lock cleanup failed');
    }
    await x.unchanged(unrelatedBefore);assert.equal(x.opens(),unrelatedOpens);event('unrelated-effects',{unchanged:true,decryptDelta:0});

    // Pending outcomes are captured before assertion or cleanup can lose them.
    // No SQL/driver return or installed admission rule is replaced.
    async function requestCase(kind){
     const p=await x.prepare('summary-v1',[x.knowledge]);
     const before=await x.snapshot(),openBefore=x.opens(),c=await x.f.admin.connect();
     const params=[x.s.tenantId,x.s.spaceId,x.s.actorId];
     const member=(await query(x.f.admin,kind+'/old-member','SELECT grants,revision FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0];
     let pending,denial,outcome,observed,helperRow,blocker,after,effects,observerExit,restored=false,releaseByFinally=false;
     const submitted={kind,scope:{tenantId:x.s.tenantId,spaceId:x.s.spaceId,actorId:x.s.actorId},command:p.command,plan:p.plan,receiptId:p.e.receipt.receiptId};event('request-input',submitted);
     try{
      await query(c,kind+'/begin','BEGIN');
      await query(c,kind+'/hold',kind==='membership-revoke'?'SELECT * FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 FOR UPDATE':'SELECT * FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',kind==='membership-revoke'?params:[p.e.task.leaf]);
      blocker=(await identity(c,kind+'/blocker')).rows[0];
      const work=()=>{const raw=x.repo(p).publish(x.s,p.command);pending=raw.then(result=>{outcome={status:'resolved',result,monoNs:mono()};event('request-result',{kind,...outcome});return result;},e=>{outcome={status:'rejected',error:errorRecord(e),monoNs:mono()};event('request-result',{kind,...outcome});throw e;});pending.catch(()=>{});return pending;};
      if(kind==='finally-release')work();
      else{denial=x.denied(work,kind==='membership-revoke'?['STALE_AUTHORITY']:['CONTENT_UNAVAILABLE','INVALID_SCHEMA','REQUIRED_CAPABILITY_UNSUPPORTED']);denial.catch(()=>{});}
      observed=await wait(x.f,blocker.pid,kind+'/coherent-wait');
      assert.equal(observed.row.wait_event_type,'Lock');assert(observed.row.blockers.includes(blocker.pid));
      assert.equal(x.opens(),openBefore,'private decrypt must not precede held lock');assert.equal(outcome,undefined,'request remains pending at barrier');
      helperRow=await x.blocked(c,'diagnostic-'+kind);assert.equal(helperRow.wait_event_type,'Lock');assert(helperRow.blockers.includes(blocker.pid));
      event('original-helper-return',{kind,row:helperRow});
      if(kind==='allowance-policy')p.owner.policy=async()=>({...p.policy,sourceAllowed:false});
      if(kind==='membership-revoke')await query(c,kind+'/revoke','UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(member.grants.filter(g=>g!=='storage:maintenance'))]);
      if(kind==='finally-release'){
       // Explicit controlled observer abort exercises release-before-await only.
       // This is not an injected helper error or historical-null reproduction.
       releaseByFinally=true;observerExit=new Error('Explicit diagnostic observer exit after coherent wait');throw observerExit;
      }else{await query(c,kind+'/commit','COMMIT');await denial;}
     }catch(e){
      if(!observerExit||e!==observerExit)throw e;
      event('controlled-observer-abort',{kind,error:errorRecord(e),helperFailed:false,historicalFailureReproduced:false});
     }finally{
      const failures=[];
      try{await query(c,kind+'/finally-rollback','ROLLBACK');}catch(e){failures.push(e);}c.release();event('client-release',{label:kind});
      try{if(pending)await pending;}catch(e){if(!outcome||outcome.status!=='rejected')failures.push(e);}
      // A failed denial assertion is fatal; never caught/relabelled as success.
      try{if(denial)await denial;}catch(e){failures.push(e);}
      try{after=await x.snapshot();effects=await x.effects(p);event('request-effects',{kind,before,after,effects,openBefore,openAfter:x.opens(),decryptDelta:x.opens()-openBefore,violations:x.violations,outcome});}catch(e){failures.push(e);}
      if(kind==='membership-revoke')try{await query(x.f.admin,kind+'/restore-member','UPDATE fabric.memberships SET grants=$4::jsonb,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(member.grants),member.revision]);restored=true;}catch(e){failures.push(e);}
      if(failures.length)throw new AggregateError(failures,'Request capture/cleanup failed: '+kind);
     }
     assert(outcome);const delta=x.opens()-openBefore;
     if(kind==='finally-release'){
      assert.equal(outcome.status,'resolved');assert.equal(outcome.result.status,'committed');assert(delta>0);
      for(const [name,rows] of Object.entries(effects))assert.equal(rows.length,1,name);
      assert.equal(effects.settlements[0].amount,'3');assert.equal(Number(effects.meters[0].amount),3);
      const old=before.allowances.filter(r=>p.e.task.ids.includes(r.allowance_id)),now=after.allowances.filter(r=>p.e.task.ids.includes(r.allowance_id));assert.equal(old.length,6);assert.equal(now.length,6);
      for(let i=0;i<old.length;i++){assert.equal(now[i].allowance_id,old[i].allowance_id);assert.equal(now[i].ceiling,old[i].ceiling);assert.equal(Number(now[i].settled),Number(old[i].settled)+3);assert.equal(now[i].reserved,old[i].reserved);}
      const ref=await x.ref(p),bytes=await x.read(ref);try{assert.equal(bytes.toString(),x.value);}finally{bytes.fill(0);}
     }else{
      assert.equal(outcome.status,'rejected');assert.equal(delta,0);assert.deepEqual(after,before);assert(Object.values(effects).every(r=>r.length===0));
     }
     assert.deepEqual(await sample(x.f,blocker.pid,kind+'/released'),[]);
     cases.push({name:kind,blocker,observed,originalHelperRow:helperRow,outcome,decryptDelta:delta,effects:Object.fromEntries(Object.entries(effects).map(([name,rows])=>[name,rows.length])),membershipRestored:restored,releaseByFinally,originalQueryReproduction:false});
    }
    await requestCase('allowance-policy');await requestCase('membership-revoke');await requestCase('finally-release');
    event('fixture-final',{violations:x.violations,opens:x.opens(),cases:cases.length});
    assert(Object.values(x.violations).every(n=>n===0));
   }finally{
    const failures=[];try{if(x)await x.close();event('fixture-close',{poolsAndOwnedChildrenClosed:true});}catch(e){failures.push(e);}
    for(const [k,v] of previous)if(v===undefined)delete process.env[k];else process.env[k]=v;
    if(failures.length)throw new AggregateError(failures,'Diagnostic fixture close failed');
   }
  });
 }catch(e){fixtureError=e;event('diagnostic-error',{error:errorRecord(e)});throw e;}
 finally{
  json(resolve(attempt,'native-result.json'),{candidate:expected,sourceDigest:hash(sourceBytes),cases,sameQueryNullWithBlocker,rootCauseConfirmed:false,historicalFailedRowAvailable:false,structuralSeparateSamplingUsed:false,productQualification:false,error:fixtureError?errorRecord(fixtureError):null,outerSupervisorCleanupQualified:false});closeSync(traceFd);
 }
 console.log(JSON.stringify({measurement:'lock-observation-investigation',cases:cases.length,sameQueryNullWithBlocker,rootCauseConfirmed:false,productQualification:false,attempt:relative(root,attempt)}));
}

async function capture(attempt,label,args){
 const start=mono(),wall=new Date().toISOString(),out=openSync(resolve(attempt,label+'.stdout.log'),'wx',0o600),err=openSync(resolve(attempt,label+'.stderr.log'),'wx',0o600);
 let spawnError;const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{writeSync(out,b);process.stdout.write(b);});child.stderr.on('data',b=>{writeSync(err,b);process.stderr.write(b);});
 const result=await new Promise(resolve=>{child.on('error',e=>spawnError=errorRecord(e));child.on('close',(code,signal)=>resolve({code,signal}));});closeSync(out);closeSync(err);
 const streams=Object.fromEntries(['stdout','stderr'].map(channel=>{const p=resolve(attempt,label+'.'+channel+'.log'),b=readFileSync(p);return [channel,{path:relative(root,p),bytes:b.length,sha256:hash(b)}];}));
 const receipt={command:[process.execPath,...args],pid:child.pid,startMonoNs:start,endMonoNs:mono(),wall,...result,spawnError:spawnError??null,streams};json(resolve(attempt,label+'.command.json'),receipt);
 assert.equal(result.code,0,label+' failed; complete streams retained');assert.equal(result.signal,null);assert.equal(spawnError,undefined);return receipt;
}

if(process.argv.length===4&&process.argv[2]==='--native-worker'){
 const attempt=resolve(process.argv[3]),marker=JSON.parse(readFileSync(resolve(attempt,'owner.json')));
 assert.equal(marker.sourceDigest,hash(sourceBytes));assert.equal(marker.source,source);assert.equal(marker.attempt,attempt);
 assert(attempt.startsWith(resolve(root,'docs/loop/agent-fabric-g1-f05-storage/develop-turn154/attempts')+'/'));
 await native(attempt);
}else{
 assert.equal(process.argv.length,2,'Diagnostic accepts no user arguments');
 const base=resolve(root,'docs/loop/agent-fabric-g1-f05-storage/develop-turn154/attempts');mkdirSync(base,{recursive:true});
 const attempt=resolve(base,randomUUID());mkdirSync(attempt,{mode:0o700});
 json(resolve(attempt,'owner.json'),{attempt,source,sourceDigest:hash(sourceBytes),owner:randomUUID()});
 writeFileSync(resolve(attempt,'probe-source.mjs'),sourceBytes,{flag:'wx',mode:0o600});
 let failure;const commands=[];
 try{
  json(resolve(attempt,'preflight.json'),preflight());
  commands.push(await capture(attempt,'strict-build',[resolve(root,'g1-storage/scripts/build.mjs')]));
  commands.push(await capture(attempt,'native',[source,'--native-worker',attempt]));
  assert.deepEqual(candidateSnapshot(),expected);assertBaseline();assert(readFileSync(source).equals(sourceBytes));
  const lines=readFileSync(resolve(attempt,'native.stdout.log'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const fixture=lines.find(r=>r.measurement==='storage-owned-fixture'),containers=lines.filter(r=>r.measurement==='storage-container-cleanup'),roots=lines.filter(r=>r.measurement==='storage-root-cleanup');
  assert(fixture);assert.equal(containers.length,1);assert.equal(roots.length,1);assert.equal(containers[0].owner,fixture.owner);assert.equal(containers[0].instance,fixture.instance);assert.equal(containers[0].containerId,fixture.containerId);assert.equal(containers[0].removed,true);assert.equal(containers[0].censusUnchanged,true);
  assert.equal(roots[0].owner,fixture.owner);assert.equal(roots[0].instance,fixture.instance);assert.equal(roots[0].rootId,fixture.fixtureRoot.rootId);assert.equal(roots[0].removed,true);assert.deepEqual(roots[0].rootIds,Object.values(fixture.roots).map(v=>v.rootId));
  json(resolve(attempt,'cleanup.json'),{fixture,containers,roots,innerCleanupExact:true,outerSupervisorCleanupQualified:false});
 }catch(e){failure=e;throw e;}
 finally{
  json(resolve(attempt,'attempt-result.json'),{candidate:candidateSnapshot(),sourceDigest:hash(sourceBytes),commands,error:failure?errorRecord(failure):null,productQualification:false,rootCauseConfirmed:false});
  console.log(JSON.stringify({measurement:'lock-diagnostic-attempt',attempt:relative(root,attempt),success:!failure,productQualification:false}));
 }
}
