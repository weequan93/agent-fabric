import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client,Connection,WorkflowFailedError} from '@temporalio/client';
import proto from '@temporalio/proto';
import {createRecoveryFixture} from './pg-fixture.js';
import {census,freePort,launchOwned,stopOwned,waitUntil,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {migrateEffectHistory} from '../src/effect-migration.js';
import {createTemporalFixture} from './process-fixture.js';
import {bindingDigest,effectSchema,runSchema,type Effect} from '../src/contracts.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import {audienceDigest,type AudienceRow} from '../../g1-identity/src/audience.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import {AuthenticatedUnitOfWork} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {RecoveryRepository} from '../src/repository.js';
import {EffectRepository} from '../src/effect-repository.js';
import {createEffectActivities,type EffectRef} from '../src/effect-activities.js';
import {effectKey,type EffectRequest} from '../src/effect-protocol.js';
import {createNativeActivities} from '../src/native-activities.js';
const {temporal}=proto,EventType=temporal.api.enums.v1.EventType;
let f:Awaited<ReturnType<typeof createRecoveryFixture>>,service:Awaited<ReturnType<typeof createTemporalFixture>>,connection:Connection,client:Client;
let external:OwnedChild,endpoint:string,directory:string,journal:string,port:number;
const owner=randomUUID(),children:OwnedChild[]=[],evidence=resolve('node_modules/.cache/effects-evidence',owner),workerFiles=new Map<number,string>();
let confirmedHistory='',unresolvedHistory='';
before(async()=>{
 census();f=await createRecoveryFixture();
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
 await mkdir(evidence,{recursive:true});directory=await mkdtemp(resolve(tmpdir(),'fabric-effects-'+owner+'-'));
 await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});journal=resolve(directory,'receipts.jsonl');port=await freePort();endpoint='http://127.0.0.1:'+port;
 await startExternal();service=await createTemporalFixture();connection=await Connection.connect({address:service.address});client=new Client({connection});
});
after(async()=>{
 const errors:unknown[]=[];
 for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await connection?.close();await service?.close();}catch(e){errors.push(e);}
 try{await f?.close();}catch(e){errors.push(e);}
 try{if(directory){assert.equal(await readFile(resolve(directory,'owner'),'utf8'),owner);await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'owned-effect-data-cleanup',owner,removed:true}));}}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory effect fixture cleanup');
});
async function startExternal(){
 const marker='--fixture-owner='+owner;
 external=launchOwned(process.execPath,[fileURLToPath(new URL('../src/effect-service-process.js',import.meta.url)),marker],marker,{FABRIC_EFFECT_SERVICE:JSON.stringify({owner,journal,port})});children.push(external);
 await waitUntil(async()=>{if(external.child.exitCode!==null)throw new Error(external.errors());return external.output().includes('"kind":"ready"');},'independent durable effect service');
 const ready=JSON.parse(external.output().trim().split('\n')[0]!);assert.equal(ready.databaseCredentials,false);
 const row=census().find(r=>r.pid===external.pid);assert.ok(row?.command.includes('effect-service-process.js'));
 console.log(JSON.stringify({measurement:'independent-effect-service',owner,pid:external.pid,endpoint,journal,hasControllerCredentials:false}));
}
async function mode(lookup='normal',dedup=true,ack='normal'){
 const response=await fetch(endpoint+'/fixture-mode',{method:'POST',body:JSON.stringify({lookup,dedup,ack})});assert.equal(response.status,200);
}
async function metrics(){const response=await fetch(endpoint+'/metrics');assert.equal(response.status,200);return await response.json() as {writes:number;posts:number;lookups:number;receipts:{operationId:string;intentDigest:string}[]};}
async function seeded(options:{downstream?:Effect['binding']['downstream'];expiry?:string;prepareLost?:boolean}={}){
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);await f.repo.initialize(scope,s.init,s.value);
 const run=runSchema.parse({...s.value.run,state:'running',revision:2});const cp={run,session:s.value.session,result:null};await f.repo.checkpoint(scope,f.mutation(s.runId,1,cp),cp);
 const artifact='local draft '+randomUUID(),argumentsValue={text:'disposable publication',destination:randomUUID(),artifactDigest:bindingDigest(artifact)},argsDigest=bindingDigest(argumentsValue),target='synthetic://'+randomUUID();
 await f.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,1,$4)',[f.tenant,f.space,target,argsDigest]);
 const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);
 const approval:ExactApprovalBinding={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:{sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)},limits:{maxOperations:1,maxCostMicrounits:30},expiresAt:options.expiry??new Date(Date.now()+60000).toISOString()};
 const approvals=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor});const a=await approvals.create(await f.scopeFor(0),{approvalId:randomUUID(),executorId:scope.actorId,binding:approval});await approvals.approve(await f.scopeFor(2),a.approvalId,a.bindingDigest);
 const effect=effectSchema.parse({binding:{run:run.binding,sessionId:s.value.session.sessionId,operationId:approval.operationId,target,resourceId:randomUUID(),action:approval.action,argsDigest,artifactId:randomUUID(),artifactVersion:1,artifactDigest:bindingDigest(artifact),actorId:scope.actorId,policyRevision:1,audienceDigest:approval.sourceAudience.revisionDigest,approvalId:a.approvalId,budgetReservationId:s.reservationId,executionLeaseId:s.value.lease.leaseId,generation:run.generation,expiresAt:approval.expiresAt,effectClass:'external-write',mutationPath:'api',downstream:options.downstream??'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const payload={effect,approval,cost:20},prepare=f.mutation(s.runId,2,payload);
 const repo=options.prepareLost?new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost prepare ACK');}),bindingFor:f.bindingFor}),f.bindingFor):f.repo;
 if(options.prepareLost)await assert.rejects(repo.prepareEffect(scope,prepare,effect,approval,20),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');else await repo.prepareEffect(scope,prepare,effect,approval,20);
 const ref:EffectRef={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.value.session.sessionId,bindingDigest:bindingDigest(run.binding),operationId:effect.binding.operationId,intentDigest:bindingDigest(effect.binding)};
 const request:EffectRequest={intent:effect.binding,arguments:argumentsValue,artifact};return {...s,ref,request,effect,prepare};
}
type Seed=Awaited<ReturnType<typeof seeded>>;
function activities(s:Seed,generation=1,repo=f.repo,measurements:Record<string,unknown>[]=[]){return createEffectActivities({repo:new EffectRepository(repo),scope:()=>f.scopeFor(1),generation,endpoint,requestFor:async()=>s.request,measure:r=>measurements.push(r)});}
async function launchWorker(s:Seed,queue:string,generation:number){
 const marker='--fixture-owner='+owner,measurementPath=resolve(evidence,'worker-'+children.length+'.jsonl');
 const child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/native-worker-process.js',import.meta.url)),marker],marker,{...process.env,FABRIC_NATIVE_WORKER:JSON.stringify({owner,dsn:f.dsn,issuer:f.endpoints.issuer,jwksUrl:f.endpoints.jwksUrl,token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,address:service.address,taskQueue:queue,generation,measurementPath,effectEndpoint:endpoint,effectRequest:s.request})});children.push(child);workerFiles.set(child.pid,measurementPath);
 await waitUntil(async()=>{if(child.child.exitCode!==null||child.child.signalCode!==null)throw new Error('Effect worker exited '+child.errors());return child.output().includes('"kind":"ready"');},'actual effect worker readiness',20000);
 assert.ok(census().find(r=>r.pid===child.pid)?.command.includes('native-worker-process.js'));
 console.log(JSON.stringify({measurement:'effect-worker-process',owner,pid:child.pid,generation,measurementPath,sessionCacheEntries:0}));return child;
}
async function logs(child:OwnedChild){return (await readFile(workerFiles.get(child.pid)!,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);}
async function exported(id:string,name:string){
 const history=await client.workflow.getHandle(id).fetchHistory();const raw=temporal.api.history.v1.History.toObject(temporal.api.history.v1.History.fromObject(history),{longs:String,enums:String,bytes:String});
 const path=resolve(evidence,name+'.history.json'),bytes=JSON.stringify(raw,null,2)+'\n';await writeFile(path,bytes,{flag:'wx'});
 console.log(JSON.stringify({measurement:'effect-history-export',path,workflowId:id,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes)}));return {path,history};
}
async function replace(s:Seed){const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(snap);const value={sessionId:s.ref.sessionId,previousWorker:1,nextWorker:2};await f.repo.replaceWorker(await f.scopeFor(1),f.mutation(s.runId,snap.run.revision,value),value);}
async function checkpointState(s:Seed,state:'paused'|'running'|'reconciling',repo=f.repo){
 const scope=await f.scopeFor(1),snap=await repo.get(scope,s.runId);assert.ok(snap);
 const value={run:runSchema.parse({...snap.run,state,revision:snap.run.revision+1}),session:snap.sessions[0]!,result:null};
 return repo.checkpoint(scope,f.mutation(s.runId,snap.run.revision,value),value);
}
const stale=(e:unknown)=>(e as {code:string}).code==='STALE_AUTHORITY';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
// Hold a real authenticated transaction after its work, with all PostgreSQL
// locks intact. The competing transaction must be observed blocked, not timed.
function heldRepository(){
 const entered=deferred(),release=deferred();let pid=0;
 const repo=new RecoveryRepository({withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{
  const result=await work(tx);pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
  entered.resolve();await release.promise;return result;
 })},f.bindingFor);
 return {repo,entered,release,pid:()=>pid};
}
async function observeBlocked(pid:number){await waitUntil(async()=>(await f.admin.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount!>0,'competing transaction blocked by actual effect/pause lock');}
async function originalPost(s:Seed){
 const r=await fetch(endpoint+'/effects',{method:'POST',body:JSON.stringify(s.request),signal:AbortSignal.timeout(1000)});assert.equal(r.status,200);
}
test('EFFECT/prepare then legal Pause denies new dispatch across recreation; explicit authorized Run resume sends the original operation once',async()=>{
 await mode();const s=await seeded(),before=await metrics();await checkpointState(s,'paused');
 for(let i=0;i<2;i++){
  const fresh=new RecoveryRepository(f.uow,f.bindingFor);
  await assert.rejects(activities(s,1,fresh).dispatchEffect(s.ref),stale);
  await assert.rejects(new EffectRepository(fresh).claim(await f.scopeFor(1),s.ref.operationId,1),stale);
 }
 assert.equal((await metrics()).posts,before.posts);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.state,'paused');
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');
 await checkpointState(s,'running',new RecoveryRepository(f.uow,f.bindingFor));
 const a=activities(s);await a.dispatchEffect(s.ref);assert.equal((await a.reconcileEffect(s.ref)).status,'confirmed');
 assert.equal((await metrics()).posts,before.posts+1);assert.equal((await metrics()).writes,before.writes+1);
 assert.equal((await metrics()).receipts.filter(r=>r.operationId===s.ref.operationId).length,1);
 // Confirmed metadata/read-only lookup remains legal in the paused state.
 assert.equal((await activities(s).reconcileEffect(s.ref)).status,'confirmed');assert.equal((await metrics()).posts,before.posts+1);
});
test('EFFECT/Pause commits before queued prepared claim: observed PostgreSQL barrier denies claim with zero POSTs',async()=>{
 const s=await seeded(),before=await metrics(),scope=await f.scopeFor(1),snap=await f.repo.get(scope,s.runId);assert.ok(snap);
 const value={run:runSchema.parse({...snap.run,state:'paused',revision:snap.run.revision+1}),session:snap.sessions[0]!,result:null},held=heldRepository();
 const pause=held.repo.checkpoint(scope,f.mutation(s.runId,snap.run.revision,value),value);let claim:Promise<void>|undefined;
 try{
  await held.entered.promise;claim=assert.rejects(new EffectRepository(f.repo).claim(scope,s.ref.operationId,1),stale);
  await observeBlocked(held.pid());held.release.resolve();await pause;await claim;
  assert.equal((await metrics()).posts,before.posts);assert.equal((await f.repo.get(scope,s.runId))?.effects[0]?.state,'prepared');
 }finally{held.release.resolve();await Promise.allSettled([pause,claim]);}
});
test('EFFECT/new prepared claim requires running even when a legal reconciling checkpoint retains authority and lease',async()=>{
 const s=await seeded(),before=await metrics();await checkpointState(s,'reconciling');
 await assert.rejects(new EffectRepository(new RecoveryRepository(f.uow,f.bindingFor)).claim(await f.scopeFor(1),s.ref.operationId,1),stale);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');assert.equal((await metrics()).posts,before.posts);
});
test('EFFECT/acknowledged claim then Pause before I/O consumes send capability and permits only read-only original reconciliation after recreation',async()=>{
 await mode();const s=await seeded(),before=await metrics(),scope=await f.scopeFor(1),effects=new EffectRepository(f.repo);
 assert.equal(await effects.claim(scope,s.ref.operationId,1),true);await checkpointState(s,'paused');
 await assert.rejects(effects.guardedIO(scope,s.ref.operationId,1,true,()=>originalPost(s)),stale);
 const fresh=new EffectRepository(new RecoveryRepository(f.uow,f.bindingFor));
 await assert.rejects(fresh.guardedIO(scope,s.ref.operationId,1,true,()=>originalPost(s)),stale);
 await assert.rejects(effects.guardedIO(scope,s.ref.operationId,1,true,()=>originalPost(s)),stale);
 assert.equal((await activities(s).reconcileEffect(s.ref)).status,'unresolved');await assert.rejects(activities(s).resumeEffect(s.ref),stale);
 assert.equal((await metrics()).posts,before.posts);assert.equal((await f.repo.get(scope,s.runId))?.run.state,'paused');
});
test('EFFECT/Pause transaction wins barrier after claim and before queued actual I/O: zero POSTs',async()=>{
 const s=await seeded(),before=await metrics(),scope=await f.scopeFor(1),effects=new EffectRepository(f.repo);assert.equal(await effects.claim(scope,s.ref.operationId,1),true);
 const snap=await f.repo.get(scope,s.runId);assert.ok(snap);const held=heldRepository();
 const value={run:runSchema.parse({...snap.run,state:'paused',revision:snap.run.revision+1}),session:snap.sessions[0]!,result:null};
 const pause=held.repo.checkpoint(scope,f.mutation(s.runId,snap.run.revision,value),value);let io:Promise<void>|undefined;
 try{
  await held.entered.promise;io=assert.rejects(effects.guardedIO(scope,s.ref.operationId,1,true,()=>originalPost(s)),stale);
  await observeBlocked(held.pid());held.release.resolve();await pause;await io;assert.equal((await metrics()).posts,before.posts);
 }finally{held.release.resolve();await Promise.allSettled([pause,io]);}
});
test('EFFECT/actual dispatch I/O wins barrier before Pause: one original POST finishes before paused commit; no recreated replay',async()=>{
 await mode();const s=await seeded(),before=await metrics(),scope=await f.scopeFor(1);let pid=0;
 const observed=new RecoveryRepository({withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{
  pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);return work(tx);
 })},f.bindingFor),effects=new EffectRepository(observed);assert.equal(await effects.claim(scope,s.ref.operationId,1),true);
 const snap=await f.repo.get(scope,s.runId);assert.ok(snap);const entered=deferred(),release=deferred();
 const io=effects.guardedIO(scope,s.ref.operationId,1,true,async()=>{
  await originalPost(s);entered.resolve();await release.promise;
 });
 let pause:Promise<unknown>|undefined;
 try{
  await entered.promise;const value={run:runSchema.parse({...snap.run,state:'paused',revision:snap.run.revision+1}),session:snap.sessions[0]!,result:null};
  pause=f.repo.checkpoint(scope,f.mutation(s.runId,snap.run.revision,value),value);
  await observeBlocked(pid);
  release.resolve();await io;await pause;assert.equal((await metrics()).posts,before.posts+1);assert.equal((await f.repo.get(scope,s.runId))?.run.state,'paused');
  assert.equal((await activities(s).reconcileEffect(s.ref)).status,'confirmed');await assert.rejects(activities(s).dispatchEffect(s.ref),stale);assert.equal((await metrics()).posts,before.posts+1);
  console.log(JSON.stringify({measurement:'pause-dispatch-barrier',order:'dispatch-before-pause',operationId:s.ref.operationId,blockingPid:pid,posts:1,paused:true}));
 }finally{release.resolve();await Promise.allSettled([io,pause]);}
});
test('EFFECT/real separate fsynced downstream dedups concurrent deliveries and rejects argument/artifact/target changes',async()=>{
 const s=await seeded(),before=await metrics();
 const responses=await Promise.all(Array.from({length:16},()=>fetch(endpoint+'/effects',{method:'POST',body:JSON.stringify(s.request)})));
 const receipts=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return r.json();}));for(const receipt of receipts)assert.deepEqual(receipt,receipts[0]);
 assert.equal((await metrics()).writes,before.writes+1);
 for(const request of [{...s.request,arguments:{text:'changed'}},{...s.request,artifact:'changed'},{...s.request,artifact:'changed',intent:{...s.request.intent,artifactDigest:bindingDigest('changed')}},{...s.request,intent:{...s.request.intent,target:'synthetic://changed'}}]){
  const r=await fetch(endpoint+'/effects',{method:'POST',body:JSON.stringify(request)});assert.ok([400,409].includes(r.status));
 }
 const writeCount=(await metrics()).writes,oldPid=external.pid;await stopOwned(external,'SIGKILL');await startExternal();assert.notEqual(external.pid,oldPid);assert.equal((await metrics()).writes,writeCount);
 const duplicate=await fetch(endpoint+'/effects',{method:'POST',body:JSON.stringify(s.request)});assert.equal(duplicate.status,200);assert.deepEqual(await duplicate.json(),receipts[0]);assert.equal((await metrics()).writes,writeCount);
 console.log(JSON.stringify({measurement:'durable-downstream-dedup',deliveries:16,externalWrites:1,oldPid,newPid:external.pid,operationId:s.ref.operationId}));
});
test('EFFECT/approved normalized arguments bind artifact bytes before initial controller dispatch',async()=>{
 const s=await seeded(),before=await metrics(),changedArtifact='unapproved bytes';
 const a=createEffectActivities({repo:new EffectRepository(f.repo),scope:()=>f.scopeFor(1),generation:1,endpoint,requestFor:async()=>({...s.request,artifact:changedArtifact,intent:{...s.request.intent,artifactDigest:bindingDigest(changedArtifact)}}),measure:()=>{throw new Error('Must refuse before any I/O');}});
 await assert.rejects(a.dispatchEffect(s.ref),/Approved normalized arguments must bind artifact digest/);assert.deepEqual(await metrics(),before);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');
});
test('EFFECT/duplicate concurrent controller dispatch has one POST and exact persisted intent before I/O',async()=>{
 const s=await seeded(),before=await metrics(),a=activities(s);await Promise.all([a.dispatchEffect(s.ref),a.dispatchEffect(s.ref)]);
 const after=await metrics();assert.equal(after.writes,before.writes+1);assert.equal(after.posts,before.posts+1);
 const snapshot=await f.repo.get(await f.scopeFor(1),s.runId);assert.deepEqual(snapshot?.effects[0]?.binding,s.request.intent);assert.equal(snapshot?.effects[0]?.state,'unknown');assert.equal(snapshot?.run.state,'reconciling');
 await assert.rejects(createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:()=>{throw new Error('No model may run');}}).nativeTurn(s.ref,1));
 assert.equal((await a.reconcileEffect(s.ref)).status,'confirmed');assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.state,'paused');await a.resumeEffect(s.ref);
 const events=(await f.admin.query('SELECT phase,record FROM fabric.recovery_effect_events WHERE operation_id=$1 ORDER BY phase',[s.ref.operationId])).rows;assert.equal(events.length,4);
 await assert.rejects(f.admin.query("UPDATE fabric.recovery_operations SET record=jsonb_set(record,'{binding,target}','\"synthetic://changed\"') WHERE operation_id=$1",[s.ref.operationId]),/immutable/);
 await assert.rejects(f.worker.query('SELECT * FROM fabric.recovery_effect_events'),/permission denied/);
 await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_effect_events WHERE operation_id=$1',[s.ref.operationId]),/immutable/);
});
test('EFFECT/lost preparation COMMIT ACK restores original command and operation before any send',async()=>{
 const s=await seeded({prepareLost:true}),before=await metrics();assert.equal((await f.repo.lookupCommand(await f.scopeFor(1),s.prepare.key,s.prepare.payloadDigest)).status,'committed');
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.binding.operationId,s.ref.operationId);assert.equal((await metrics()).writes,before.writes);
 await activities(s).dispatchEffect(s.ref);assert.equal((await activities(s).reconcileEffect(s.ref)).status,'confirmed');assert.equal((await metrics()).writes,before.writes+1);
});
test('EFFECT/local dispatch COMMIT ACK loss permits original-key lookup only and never sends an unsafe write',async()=>{
 const s=await seeded(),before=await metrics();let commits=0;
 const lost=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{if(++commits===2)throw new Error('Lost actual dispatch marker ACK');}),bindingFor:f.bindingFor}),f.bindingFor);
 // guarded capability read is commit1; durable claim is commit2.
 await assert.rejects(activities(s,1,lost).dispatchEffect(s.ref),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');
 const payloadDigest=bindingDigest({binding:s.effect.binding,phase:'dispatch'}),key=effectKey(s.ref.operationId,'dispatch');
 assert.equal((await f.repo.lookupCommand(await f.scopeFor(1),key,payloadDigest)).status,'committed');assert.equal((await metrics()).writes,before.writes);
 await activities(s).dispatchEffect(s.ref);const result=await activities(s).reconcileEffect(s.ref);assert.equal(result.status,'unresolved');assert.equal((await metrics()).posts,before.posts);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'reconciling');
 console.log(JSON.stringify({measurement:'local-unknown-dispatch-commit',operationId:s.ref.operationId,originalKey:key,externalWrites:0,safeAction:'lookup-original-operation',lookupResult:'absent-no-retry'}));
});
for(const downstream of ['lookup-only','human-reconciliation'] as const)test('EFFECT/unsafe '+downstream+' adapter refuses initial write and never lets model continue',async()=>{
 const s=await seeded({downstream}),before=await metrics();await assert.rejects(activities(s).dispatchEffect(s.ref),/Explicit domain\/human/);assert.equal((await metrics()).posts,before.posts);
 await assert.rejects(activities(s).resumeEffect(s.ref));assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');
});
test('EFFECT/original-key lookup waits for an actual pending dispatch-marker COMMIT',async()=>{
 const s=await seeded(),scope=await f.scopeFor(1),repo=new EffectRepository(f.repo),gate='effect-gate-'+randomUUID(),lock=await f.admin.connect();
 await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[gate]);
 await f.admin.query(`CREATE FUNCTION fabric.effect_commit_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ BEGIN IF NEW.operation_id='${s.ref.operationId}' AND NEW.phase='dispatch' THEN PERFORM pg_advisory_xact_lock(hashtextextended('${gate}',0));END IF;RETURN NEW;END $$;CREATE TRIGGER effect_commit_gate BEFORE INSERT ON fabric.recovery_effect_events FOR EACH ROW EXECUTE FUNCTION fabric.effect_commit_gate()`);
 let claim:Promise<boolean>|undefined,lookup:ReturnType<RecoveryRepository['lookupCommand']>|undefined;
 try {
  claim=repo.claim(scope,s.ref.operationId,1);
  await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO fabric.recovery_effect_events%'")).rowCount!>0,'actual dispatch transaction blocked at journal write');
  let resolved=false;lookup=f.repo.lookupCommand(scope,effectKey(s.ref.operationId,'dispatch'),bindingDigest({binding:s.effect.binding,phase:'dispatch'})).then(r=>{resolved=true;return r;});
  await new Promise(res=>setTimeout(res,100));assert.equal(resolved,false,'Pending original key cannot be reported absent-safe');
  await lock.query('COMMIT');assert.equal(await claim,true);assert.equal((await lookup).status,'committed');
  console.log(JSON.stringify({measurement:'effect-original-key-pending-commit',operationId:s.ref.operationId,lookupWaited:true,result:'committed',externalWrites:0}));
 } finally {await lock.query('ROLLBACK');lock.release();await Promise.allSettled([claim,lookup].filter(Boolean));await f.admin.query('DROP TRIGGER effect_commit_gate ON fabric.recovery_effect_events;DROP FUNCTION fabric.effect_commit_gate()');}
});
test('EFFECT/lost confirmed-settlement COMMIT ACK recovers original receipt without another write',async()=>{
 const s=await seeded();await activities(s).dispatchEffect(s.ref);const before=await metrics();let commits=0;
 const lost=new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{if(++commits===3)throw new Error('Lost confirmed settlement ACK');}),bindingFor:f.bindingFor}),f.bindingFor);
 await assert.rejects(activities(s,1,lost).reconcileEffect(s.ref),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');
 const key=effectKey(s.ref.operationId,'confirmed'),payloadDigest=bindingDigest({binding:s.effect.binding,phase:'confirmed'});
 assert.equal((await f.repo.lookupCommand(await f.scopeFor(1),key,payloadDigest)).status,'committed');
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'confirmed');
 const settledCounts=await metrics();assert.equal(settledCounts.writes,before.writes);assert.equal(settledCounts.posts,before.posts);
 assert.equal((await activities(s).reconcileEffect(s.ref)).status,'confirmed');assert.deepEqual(await metrics(),settledCounts);
});
test('EFFECT/lease expires while downstream read-only lookup is in flight: receipt cannot settle or authorize model',async()=>{
 const s=await seeded(),a=activities(s);await a.dispatchEffect(s.ref);await mode('delayed');const before=await metrics();
 await f.admin.query("UPDATE fabric.recovery_leases SET record=jsonb_set(record,'{expiresAt}',to_jsonb($2::text)) WHERE run_id=$1",[s.runId,new Date(Date.now()+250).toISOString()]);
 const started=Date.now();
 try {
  await assert.rejects(a.reconcileEffect(s.ref),e=>(e as {code:string;message:string}).code==='STALE_AUTHORITY'&&(e as Error).message==='Expired effect or execution lease');assert.ok(Date.now()-started>=500);
  const snap=(await f.admin.query('SELECT record FROM fabric.recovery_operations WHERE operation_id=$1',[s.ref.operationId])).rows[0].record;assert.equal(snap.state,'reconciling');assert.equal(snap.receiptDigest,null);
  await assert.rejects(a.resumeEffect(s.ref));assert.equal((await metrics()).posts,before.posts);assert.equal((await metrics()).writes,before.writes);
  console.log(JSON.stringify({measurement:'effect-expiry-during-lookup',operationId:s.ref.operationId,lookupMs:Date.now()-started,confirmed:false,modelCalls:0,recoveryWrites:0}));
 } finally {await mode();}
});
const cases=['confirmed','outage','ambiguous','unsupported','no-dedup','mismatch-target','mismatch-digest','lease-expiry','approval-expiry','membership','approver-revoked','target-changed','budget-exhausted'] as const;
for(const scenario of cases)test('EFFECT/real worker crash after downstream commit: recreated recovery '+scenario,async()=>{
 const s=await seeded(scenario==='approval-expiry'?{expiry:new Date(Date.now()+10000).toISOString()}:{}),queue='effect-'+randomUUID(),id='effect-'+s.ref.operationId;
 await mode('normal',true,'hold');const before=await metrics(),worker1=await launchWorker(s,queue,1);
 await client.workflow.start('effectRecovery',{workflowId:id,taskQueue:queue,args:[s.ref]});
 await waitUntil(async()=>external.output().includes('"operationId":"'+s.ref.operationId+'"'),'external fsynced commit before ACK',15000);
 const committed=await metrics();assert.equal(committed.writes,before.writes+1);assert.equal(committed.posts,before.posts+1);
 const raw=(await f.admin.query('SELECT record FROM fabric.recovery_operations WHERE operation_id=$1',[s.ref.operationId])).rows[0].record;assert.equal(raw.state,'unknown');assert.deepEqual(raw.binding,s.request.intent);
 assert.equal((await logs(worker1)).filter(r=>r.kind==='external-ack'||r.kind==='model').length,0);
 await stopOwned(worker1,'SIGKILL');await replace(s);
 if(scenario==='confirmed'){
  const count=(await metrics()).writes;await stopOwned(external,'SIGKILL');await startExternal();assert.equal((await metrics()).writes,count);
 }
 const lookup=['outage','ambiguous','unsupported','mismatch-target','mismatch-digest'].includes(scenario)?scenario:'normal';await mode(lookup,scenario!=='no-dedup');
 const priorRecovery=await metrics();
 if(scenario==='lease-expiry'){
  await f.admin.query("UPDATE fabric.recovery_leases SET record=jsonb_set(record,'{expiresAt}',to_jsonb($2::text)) WHERE run_id=$1",[s.runId,new Date(Date.now()+100).toISOString()]);
  await waitUntil(async()=>(await f.admin.query("SELECT (record->>'expiresAt')::timestamptz<=clock_timestamp() AS expired FROM fabric.recovery_leases WHERE run_id=$1",[s.runId])).rows[0].expired===true,'actual lease expiry');
 }
 if(scenario==='approval-expiry')await waitUntil(async()=>(await f.admin.query('SELECT $1::timestamptz<=clock_timestamp() AS expired',[s.effect.binding.expiresAt])).rows[0].expired===true,'actual approval expiry',11000);
 if(scenario==='membership')await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 if(scenario==='approver-revoked')await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2]]);
 if(scenario==='target-changed')await f.admin.query('UPDATE fabric.identity_target_versions SET args_digest=$2 WHERE target=$1',[s.effect.binding.target,bindingDigest('changed')]);
 if(scenario==='budget-exhausted')await f.admin.query('UPDATE fabric.budget_reservations SET settled_amount=amount WHERE reservation_id=$1',[s.reservationId]);
 const worker2=await launchWorker(s,queue,2);assert.notEqual(worker1.pid,worker2.pid);let result:unknown;
 try {
  await client.workflow.getHandle(id).signal('recoverEffect');
  const denied=['lease-expiry','approval-expiry','membership','approver-revoked','target-changed','budget-exhausted'].includes(scenario);
  if(denied)await assert.rejects(client.workflow.getHandle(id).result(),e=>e instanceof WorkflowFailedError);
  else {
   const r=await client.workflow.getHandle(id).result() as {resolution:{status:string;operationId:string;nextAction?:string};continuation:{sequence:number}|null};result=r;
   assert.equal(r.resolution.operationId,s.ref.operationId);assert.equal(r.resolution.status,scenario==='confirmed'?'confirmed':'unresolved');assert.equal(r.continuation?.sequence??null,scenario==='confirmed'?1:null);
   if(scenario!=='confirmed'){
    assert.equal(r.resolution.nextAction,scenario==='outage'?'lookup-original-operation':'human-reconcile');
    const events=(await f.admin.query("SELECT record FROM fabric.recovery_effect_events WHERE operation_id=$1 AND phase LIKE 'unresolved-%'",[s.ref.operationId])).rows;assert.equal(events.length,1);assert.equal(events[0].record.detail.nextAction,r.resolution.nextAction);
   }
  }
  const after=await metrics();assert.equal(after.writes,priorRecovery.writes);assert.equal(after.posts,priorRecovery.posts);
  const records=await logs(worker2);assert.equal(records.filter(r=>r.kind==='external-post').length,0);assert.equal(records.filter(r=>r.kind==='model').length,scenario==='confirmed'?1:0);
  if(scenario==='confirmed')assert.ok(records.findIndex(r=>r.kind==='effect-resolution')<records.findIndex(r=>r.kind==='model'));
  const snap=(await f.admin.query('SELECT record FROM fabric.recovery_operations WHERE operation_id=$1',[s.ref.operationId])).rows[0].record;assert.equal(snap.binding.operationId,s.ref.operationId);assert.equal(snap.state,scenario==='confirmed'?'confirmed':denied?'unknown':'reconciling');
  const history=await exported(id,scenario);if(scenario==='confirmed')confirmedHistory=history.path;if(scenario==='outage')unresolvedHistory=history.path;
  assert.ok(history.history.events?.some(e=>e.eventType===EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT));
  if(denied){const failure=history.history.events?.find(e=>e.eventType===EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED)?.activityTaskFailedEventAttributes?.failure;assert.equal(failure?.applicationFailureInfo?.type,'FoundationError');assert.equal(failure?.message,scenario==='membership'||scenario==='approver-revoked'||scenario==='budget-exhausted'?'UNAUTHORIZED':scenario==='lease-expiry'||scenario==='approval-expiry'?'Expired effect or execution lease':'STALE_AUTHORITY');assert.equal(after.lookups,priorRecovery.lookups);}
  console.log(JSON.stringify({measurement:'effect-worker-crash-recovery',scenario,operationId:s.ref.operationId,taskId:s.taskId,runId:s.runId,sessionId:s.ref.sessionId,oldPid:worker1.pid,newPid:worker2.pid,externalWrites:1,recoveryPosts:0,modelCalls:scenario==='confirmed'?1:0,result:result??'authority-denied',measurementPath:workerFiles.get(worker2.pid)}));
 } finally {
  await stopOwned(worker2);
  if(scenario==='membership')await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);
  if(scenario==='approver-revoked')await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=NULL WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2]]);
  await mode();
 }
});
test('EFFECT/SDK replay of confirmed and unresolved crash histories performs zero HTTP/model/PG mutations',async()=>{
 const state=async()=>{const rows:Record<string,unknown>={};for(const table of ['runs','sessions','leases','operations','results','receipts','outbox','session_events','effect_events'])rows[table]=(await f.admin.query(`SELECT to_jsonb(t) AS record FROM fabric.recovery_${table} t ORDER BY to_jsonb(t)::text`)).rows;return bindingDigest(rows);};
 const before=await state(),counts=await metrics();
 for(const path of [confirmedHistory,unresolvedHistory]){
  assert.ok(path);const env={...process.env};delete env.RECOVERY_DATABASE_URL;delete env.FABRIC_NATIVE_WORKER;delete env.FABRIC_EFFECT_SERVICE;
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('../src/replay-process.js',import.meta.url)),path,'effects'],{env,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  const name=path===confirmedHistory?'confirmed':'unresolved';await writeFile(resolve(evidence,'replay-'+name+'.stdout'),r.stdout??'',{flag:'wx'});await writeFile(resolve(evidence,'replay-'+name+'.stderr'),r.stderr??'',{flag:'wx'});
  assert.ifError(r.error);assert.equal(r.status,0,r.stderr);const record=JSON.parse(r.stdout.trim().split('\n').at(-1)!);assert.equal(record.modelCalls,0);assert.equal(record.externalWrites,0);assert.equal(record.checkpointWrites,0);console.log(JSON.stringify({measurement:'effect-sdk-replay',path,...record}));
 }
 assert.equal(await state(),before);assert.deepEqual(await metrics(),counts);
 const bytes=await readFile(journal);await writeFile(resolve(evidence,'downstream-receipts.jsonl'),bytes,{flag:'wx'});console.log(JSON.stringify({measurement:'effect-journal-export',path:resolve(evidence,'downstream-receipts.jsonl'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
});
