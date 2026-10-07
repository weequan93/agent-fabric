import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client,Connection,WorkflowFailedError} from '@temporalio/client';
import proto from '@temporalio/proto';
const {temporal}=proto;
import {createRecoveryFixture} from './pg-fixture.js';
import {createTemporalFixture,launchOwned,stopOwned,descendants,census,waitUntil,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {bindingDigest} from '../src/contracts.js';
import {admitNative} from '../src/temporal-admission.js';
import {createNativeActivities} from '../src/native-activities.js';
import type {NativeRef} from '../src/temporal-contracts.js';
const EventType=temporal.api.enums.v1.EventType;
let f:Awaited<ReturnType<typeof createRecoveryFixture>>,service:Awaited<ReturnType<typeof createTemporalFixture>>;
let connection:Connection,client:Client;
const children:OwnedChild[]=[],owner=randomUUID(),evidence=resolve('node_modules/.cache/temporal-evidence',owner);
type RecoveryFixture=Awaited<ReturnType<typeof createRecoveryFixture>>;
let workflowId='',ref:NativeRef,seed:Awaited<ReturnType<RecoveryFixture['seedRun']>>;
let first:OwnedChild,second:OwnedChild,firstHistory:unknown,finalHistoryFile='';
before(async()=>{
 census(); // Mandatory; controller executes this outside the Codex sandbox.
 f=await createRecoveryFixture();await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 service=await createTemporalFixture();connection=await Connection.connect({address:service.address});client=new Client({connection});
 await mkdir(evidence,{recursive:true});
});
after(async()=>{
 const errors:unknown[]=[];
 for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await connection?.close();}catch(e){errors.push(e);}
 try{await service?.close();}catch(e){errors.push(e);}
 try{await f?.close();}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory owned fixture cleanup failed');
});
const workerPath=fileURLToPath(new URL('../src/native-worker-process.js',import.meta.url));
async function launchWorker(queue:string,generation:number):Promise<OwnedChild> {
 const marker='--fixture-owner='+owner,measurementPath=resolve(evidence,'worker-'+children.length+'.jsonl');
 const child=launchOwned(process.execPath,[workerPath,marker],marker,{...process.env,FABRIC_NATIVE_WORKER:JSON.stringify({owner,dsn:f.dsn,issuer:f.endpoints.issuer,jwksUrl:f.endpoints.jwksUrl,token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,address:service.address,taskQueue:queue,generation,measurementPath})});
 children.push(child);
 await waitUntil(async()=>{
  if(child.child.exitCode!==null||child.child.signalCode!==null)throw new Error('Native worker failed: '+child.errors());
  return child.output().split('\n').some(line=>{try{return JSON.parse(line).kind==='ready';}catch{return false;}});
 },'real native worker readiness',20000);
 const row=census().find(r=>r.pid===child.pid);assert.ok(row);assert.ok(row.command.includes(workerPath));assert.ok(row.command.includes(marker));
 assert.deepEqual(descendants(child.pid),[],'Native execution has no child harness or VM');
 console.log(JSON.stringify({measurement:'native-process-census',owner,generation,worker:row,executionChildren:descendants(child.pid),competingHarnesses:0,ordinaryConversationVMs:0,measurementPath}));
 return child;
}
function refFor(s:typeof seed):NativeRef {return {tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.value.session.sessionId,bindingDigest:bindingDigest(s.value.run.binding)};}
async function newRun() {
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);
 await f.admin.query("UPDATE fabric.tasks SET requirements='{"+'"intent":"ask"'+"}' WHERE task_id=$1",[s.taskId]);
 await f.repo.initialize(scope,s.init,s.value);return s;
}
async function awaitCheckpoint(s:typeof seed,id:string) {
 await waitUntil(async()=>{
  const snap=await f.repo.get(await f.scopeFor(1),s.runId);if(snap?.sessions[0]?.cursor!==1)return false;
  const history=await client.workflow.getHandle(id).fetchHistory(),events=history.events??[];
  const completed=events.findIndex(e=>e.eventType===EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED);
  return completed>=0 && events.slice(completed+1).some(e=>e.eventType===EventType.EVENT_TYPE_WORKFLOW_TASK_COMPLETED);
 },'durable PG and actual Temporal checkpoint',20000);
}
async function replace(s:typeof seed) {
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(snap);
 const value={sessionId:s.value.session.sessionId,previousWorker:1,nextWorker:2};
 await f.repo.replaceWorker(await f.scopeFor(1),f.mutation(s.runId,snap.run.revision,value),value);
}
async function logs(child:OwnedChild) {
 const index=children.indexOf(child);return (await readFile(resolve(evidence,'worker-'+index+'.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);
}
async function exportHistory(id:string,name:string) {
 const history=await client.workflow.getHandle(id).fetchHistory(),object=temporal.api.history.v1.History.toObject(temporal.api.history.v1.History.fromObject(history),{longs:String,enums:String,bytes:String});
 const path=resolve(evidence,name+'.history.json'),bytes=JSON.stringify(object,null,2)+'\n';await writeFile(path,bytes,{flag:'wx'});
 console.log(JSON.stringify({measurement:'actual-temporal-history-export',path,workflowId:id,events:history.events?.length,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')}));return {path,history};
}
test('TEMPORAL/pinned real local service, disk history, strict SDK versions and append-only PG events',async()=>{
 for(const pkg of ['client','worker','workflow','proto']){
  const path=resolve('node_modules/@temporalio/'+pkg+'/package.json');assert.equal(JSON.parse(await readFile(path,'utf8')).version,'1.24.0');
 }
 assert.ok((await stat(service.db)).size>0);
 assert.deepEqual((await f.admin.query('SELECT version FROM public.fabric_recovery_migrations ORDER BY version')).rows.map(r=>r.version),[4,5]);
 await assert.rejects(f.worker.query('SELECT * FROM fabric.recovery_session_events'),/permission denied/);
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 console.log(JSON.stringify({measurement:'temporal-versions',cli:'1.4.1',server:'1.28.0',sdk:'1.24.0',node:process.version,persistence:'owned-sqlite',historyAuthority:'Temporal',policyAuthority:'PostgreSQL'}));
});
test('TEMPORAL/outbox admission ACK loss and concurrent dedup; submitting client disconnects after admission',async()=>{
 seed=await newRun();ref=refFor(seed);const taskQueue='fabric-'+owner;
 first=await launchWorker(taskQueue,1);
 const config={repo:f.repo,scope:await f.scopeFor(1),client,ref,taskQueue};
 await assert.rejects(admitNative({...config,afterStart:async()=>{throw new Error('Lost workflow start ACK');}}),/Lost workflow start ACK/);
 assert.equal((await f.repo.outbox(config.scope)).find(e=>e.run_id===seed.runId && Number((e.payload as {revision:number}).revision)===1)?.completed_at,null);
 const ids=await Promise.all([admitNative(config),admitNative(config)]);assert.equal(ids[0],ids[1]);workflowId=ids[0]!;
 const temporalRun=(await client.workflow.getHandle(workflowId).describe()).runId;
 await connection.close(); // Actual submitting transport closed, no heartbeat dependency.
 connection=await Connection.connect({address:service.address});client=new Client({connection});
 await awaitCheckpoint(seed,workflowId);assert.equal((await client.workflow.getHandle(workflowId).describe()).runId,temporalRun);
 const history=await client.workflow.getHandle(workflowId).fetchHistory();assert.equal(history.events?.filter(e=>e.eventType===EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED).length,1);
 firstHistory=temporal.api.history.v1.History.toObject(temporal.api.history.v1.History.fromObject(history),{longs:String,enums:String,bytes:String});
 assert.equal((await logs(first)).filter(r=>r.kind==='model').length,1);
 console.log(JSON.stringify({measurement:'client-disconnect-durable-checkpoint',workflowId,temporalRun,taskId:seed.taskId,runId:seed.runId,sessionId:ref.sessionId,cursor:1,modelCalls:1,admissions:1,clientTransportClosed:true}));
});
test('TEMPORAL/kill observed native worker, restart durable service and recreate generation2 with empty process memory',async()=>{
 await stopOwned(first,'SIGKILL');assert.equal(first.child.signalCode,'SIGKILL');
 await connection.close();await service.restart();connection=await Connection.connect({address:service.address});client=new Client({connection});
 const restored=await client.workflow.getHandle(workflowId).fetchHistory();
 assert.deepEqual(temporal.api.history.v1.History.toObject(temporal.api.history.v1.History.fromObject(restored),{longs:String,enums:String,bytes:String}),firstHistory);
 await replace(seed);second=await launchWorker('fabric-'+owner,2);assert.notEqual(second.pid,first.pid);
 const startup=(await logs(second)).find(r=>r.kind==='process-start');assert.equal(startup?.sessionCacheEntries,0);assert.equal(startup?.generation,2);
 const snapshot=await f.repo.get(await f.scopeFor(1),seed.runId);assert.equal(snapshot?.run.generation.worker,2);assert.equal(snapshot?.sessions[0]?.cursor,1);assert.equal(snapshot?.sessions[0]?.sessionId,ref.sessionId);
 assert.equal((await logs(second)).filter(r=>r.kind==='model').length,0);
});
test('TEMPORAL/old generation cannot continue even with the original committed command key',async()=>{
 const measurements:Record<string,unknown>[]=[];
 const old=createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>measurements.push(r)});
 await assert.rejects(old.nativeTurn(ref,1),e=>(e as {code:string}).code==='STALE_AUTHORITY');
 await assert.rejects(old.nativeTurn(ref,2),e=>(e as {code:string}).code==='STALE_AUTHORITY');
 assert.equal(measurements.filter(r=>r.kind==='model').length,0);assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),ref.sessionId)).length,1);
});
test('TEMPORAL/new process restores same Task/Run/session and recorded response; only missing turn calls model',async()=>{
 await client.workflow.getHandle(workflowId).signal('continueNative');
 const result=await client.workflow.getHandle(workflowId).result();assert.equal(result.sequence,2);assert.equal(result.runId,seed.runId);assert.equal(result.sessionId,ref.sessionId);
 const snapshot=await f.repo.get(await f.scopeFor(1),seed.runId);assert.equal(snapshot?.run.binding.task.taskId,seed.taskId);assert.equal(snapshot?.run.state,'verifying');assert.equal(snapshot?.sessions[0]?.cursor,2);assert.equal(snapshot?.sessions[0]?.state,'finished');
 const history=await f.repo.nativeTranscript(await f.scopeFor(1),ref.sessionId);assert.equal(history.length,2);assert.equal(bindingDigest(history[1]),result.eventDigest);
 const records=await logs(second);assert.deepEqual(records.filter(r=>r.kind==='model').map(r=>[r.sequence,r.recordedEvents]),[[2,1]]);
 assert.ok(records.some(r=>r.kind==='restore'&&r.loadedEvents===1&&r.cursor===1));assert.equal((await logs(first)).filter(r=>r.kind==='model').length,1);
 const exported=await exportHistory(workflowId,'completed');finalHistoryFile=exported.path;
 assert.equal(exported.history.events?.filter(e=>e.eventType===EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED).length,2);
 await assert.rejects(f.admin.query("UPDATE fabric.recovery_session_events SET record='{}' WHERE session_id=$1",[ref.sessionId]),/immutable/);
 console.log(JSON.stringify({measurement:'native-worker-recreation',oldPid:first.pid,newPid:second.pid,generation:2,taskId:seed.taskId,runId:seed.runId,sessionId:ref.sessionId,recordedResponsePreserved:true,modelCallsByGeneration:[1,1],cursor:2,taskResult:'verifying-not-yet-accepted',noExternalEffects:true}));
});
test('TEMPORAL/actual exported SDK replay invokes zero measured model/checkpoint/external writes; incompatible replay fails',async()=>{
 const stateDigest=async()=>{
  const rows:Record<string,unknown[]>={};
  for(const table of ['runs','sessions','leases','operations','results','receipts','outbox','session_events'])rows[table]=(await f.admin.query(`SELECT to_jsonb(t) AS record FROM fabric.recovery_${table} t ORDER BY to_jsonb(t)::text`)).rows;
  return bindingDigest(rows);
 };
 const before=await stateDigest();
 for(const mode of ['compatible','incompatible']){
  const env={...process.env};delete env.RECOVERY_DATABASE_URL;delete env.FABRIC_NATIVE_WORKER;
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('../src/replay-process.js',import.meta.url)),finalHistoryFile,mode],{env,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  await writeFile(resolve(evidence,'replay-'+mode+'.stdout'),r.stdout??'',{flag:'wx'});await writeFile(resolve(evidence,'replay-'+mode+'.stderr'),r.stderr??'',{flag:'wx'});
  assert.ifError(r.error);assert.equal(r.status,mode==='compatible'?0:1,r.stderr);
  const record=JSON.parse(r.stdout.trim().split('\n').at(-1)!);assert.equal(record.modelCalls,0);assert.equal(record.checkpointWrites,0);assert.equal(record.externalWrites,0);
  assert.equal(record.success,mode==='compatible');if(mode==='incompatible')assert.equal(record.errorName,'DeterminismViolationError');console.log(JSON.stringify({measurement:'real-sdk-replay',history:finalHistoryFile,...record}));
 }
 assert.equal(await stateDigest(),before,'SDK replay changes no PostgreSQL recovery record');
});
for(const denial of ['membership','lease-expiry','budget'] as const)test('TEMPORAL/recreated worker rechecks '+denial+' before any missing model turn',async()=>{
 const s=await newRun(),localRef=refFor(s),queue='denial-'+denial+'-'+owner;
 const worker1=await launchWorker(queue,1);
 const id=await admitNative({repo:f.repo,scope:await f.scopeFor(1),client,ref:localRef,taskQueue:queue});
 await awaitCheckpoint(s,id);await stopOwned(worker1,'SIGKILL');await replace(s);
 if(denial==='membership')await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 if(denial==='lease-expiry'){
  await f.admin.query("UPDATE fabric.recovery_leases SET record=jsonb_set(record,'{expiresAt}',to_jsonb($2::text)) WHERE run_id=$1",[s.runId,new Date(Date.now()+200).toISOString()]);
  await waitUntil(async()=>(await f.admin.query("SELECT (record->>'expiresAt')::timestamptz<=clock_timestamp() AS expired FROM fabric.recovery_leases WHERE run_id=$1",[s.runId])).rows[0].expired===true,'actual lease expiration');
 }
 if(denial==='budget')await f.admin.query("UPDATE fabric.budget_reservations SET settled_amount=amount WHERE reservation_id=$1",[s.reservationId]);
 const worker2=await launchWorker(queue,2);
 try {
  await client.workflow.getHandle(id).signal('continueNative');
  await assert.rejects(client.workflow.getHandle(id).result(),e=>e instanceof WorkflowFailedError);
  const transcript=(await f.admin.query('SELECT record FROM fabric.recovery_session_events WHERE session_id=$1',[localRef.sessionId])).rows;assert.equal(transcript.length,1);
  assert.equal((await logs(worker2)).filter(r=>r.kind==='model').length,0);
  const exported=await exportHistory(id,'denied-'+denial);const failure=exported.history.events?.find(e=>e.eventType===EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED)?.activityTaskFailedEventAttributes?.failure;
  assert.equal(failure?.applicationFailureInfo?.type,'FoundationError');
  assert.equal(failure?.message,denial==='membership'?'UNAUTHORIZED':denial==='lease-expiry'?'Expired recovery command or lease':'Current reservation and available budget required');
  console.log(JSON.stringify({measurement:'recovery-current-denial',denial,oldPid:worker1.pid,newPid:worker2.pid,generation:2,modelCallsAfterRecovery:0,durableCursor:1,failedActivityRecorded:true}));
 } finally {
  await stopOwned(worker2);
  if(denial==='membership')await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);
 }
});
