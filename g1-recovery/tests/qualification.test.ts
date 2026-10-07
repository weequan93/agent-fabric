import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client,Connection} from '@temporalio/client';
import proto from '@temporalio/proto';
import {createRecoveryFixture} from './pg-fixture.js';
import {census,descendants,freePort,launchOwned,stopOwned,waitUntil,createTemporalFixture,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {migrateEffectHistory} from '../src/effect-migration.js';
import {migrateFences} from '../src/fence-migration.js';
import {migrateDispatch} from '../src/dispatch-migration.js';
import {migrateResults} from '../src/result-migration.js';
import {ResultRepository,type Outcome} from '../src/result-repository.js';
import {NotificationRepository} from '../src/notification-repository.js';
import {RecoveryRepository} from '../src/repository.js';
import {FenceRepository} from '../src/fence-repository.js';
import {createFenceHttpService} from '../src/fence-http.js';
import {bindingDigest,runSchema,effectSchema} from '../src/contracts.js';
import {audienceDigest,type AudienceRow} from '../../g1-identity/src/audience.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import type {EffectRequest} from '../src/effect-protocol.js';
import type {EffectRef} from '../src/effect-activities.js';
import {createNativeActivities} from '../src/native-activities.js';

const owner=randomUUID(),children:OwnedChild[]=[];
let f:Awaited<ReturnType<typeof createRecoveryFixture>>,temporal:Awaited<ReturnType<typeof createTemporalFixture>>,connection:Connection,client:Client;
let directory:string,endpoint:string,journal:string,port:number,external:OwnedChild,notificationEndpoint:string;
let http:Awaited<ReturnType<typeof createFenceHttpService>>,results:ResultRepository,completed=false;
before(async()=>{
 census();f=await createRecoveryFixture();
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
 await migrateFences(f.admin,resolve('migrations/0007_fences.sql'));
 await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));
 await migrateResults(f.admin,resolve('migrations/0009_results.sql'));
 results=new ResultRepository(f.repo);
 directory=await mkdtemp(resolve(tmpdir(),'fabric-qualification-'+owner+'-'));await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});
 journal=resolve(directory,'effects.jsonl');port=await freePort();endpoint='http://127.0.0.1:'+port;await startExternal();
 const nport=await freePort();notificationEndpoint='http://127.0.0.1:'+nport;
 await service('notification-service-process.js','FABRIC_NOTIFICATION_SERVICE',{owner,journal:resolve(directory,'notifications.jsonl'),port:nport});
 temporal=await createTemporalFixture();connection=await Connection.connect({address:temporal.address});client=new Client({connection});
 http=await createFenceHttpService({fences:new FenceRepository(f.repo),verify:async(credential,tenantId,spaceId)=>{
  assert.equal(tenantId,f.tenant);assert.equal(spaceId,f.space);const i=f.tokens.indexOf(credential);assert.ok(i>=0);return f.scopeFor(i);
 }});
});
after(async()=>{
 const errors:unknown[]=[];
 for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await http?.close();await connection?.close();await temporal?.close();}catch(e){errors.push(e);}
 try{
  if(directory){const files=(await readdir(directory)).filter(file=>file!=='owner').sort();assert.ok(files.length<=10);
   if(completed)for(const file of ['effects.jsonl','recovery.history.json','worker-1.jsonl','worker-2.jsonl'])assert.ok(files.includes(file),'Successful fixture must retain '+file);
   for(const file of files){const bytes=await readFile(resolve(directory,file));console.log(JSON.stringify({measurement:'qualification-raw-artifact',owner,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),text:bytes.toString('utf8')}));}
   console.log(JSON.stringify({measurement:'qualification-process-streams',owner,processes:children.map(c=>({pid:c.pid,stdout:c.output(),stderr:c.errors(),exitCode:c.child.exitCode,signal:c.child.signalCode}))}));
  }
 }catch(e){errors.push(e);}
 try{await f?.close();}catch(e){errors.push(e);}
 try{if(directory){assert.equal(await readFile(resolve(directory,'owner'),'utf8'),owner);await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'qualification-owned-files-cleanup',owner,removed:true}));}}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory integrated fixture cleanup');
});
async function service(file:string,envName:string,config:unknown){
 const marker='--fixture-owner='+owner,child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/'+file,import.meta.url)),marker],marker,{[envName]:JSON.stringify(config)});children.push(child);
 await waitUntil(async()=>{if(child.child.exitCode!==null)throw new Error(child.errors());return child.output().includes('"kind":"ready"');},'owned independent '+file);
 assert.equal(JSON.parse(child.output().trim().split('\n')[0]!).databaseCredentials,false);return child;
}
async function startExternal(){external=await service('effect-service-process.js','FABRIC_EFFECT_SERVICE',{owner,journal,port});}
async function metrics(){return await (await fetch(endpoint+'/metrics')).json() as {posts:number;writes:number;lookups:number};}
async function seed(){
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);
 const accepted=await f.repo.initialize(scope,s.init,s.value);
 assert.deepEqual(await f.repo.initialize(scope,s.init,s.value),accepted);
 assert.equal((await f.repo.lookupCommand(scope,s.init.key,s.init.payloadDigest)).status,'committed');
 const run=runSchema.parse({...s.value.run,state:'running',revision:2}),cp={run,session:s.value.session,result:null};await f.repo.checkpoint(scope,f.mutation(s.runId,1,cp),cp);
 const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);
 const audience={sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)};
 await results.configure(scope,s.runId,{obligation:'publish',definitions:[{kind:'contains',argument:'verified'}],audience});
 const artifactId=randomUUID(),bytes='verified integrated artifact '+randomUUID();await results.saveDraft(scope,s.runId,1,artifactId,1,null,bytes);await results.verify(scope,s.runId,1,artifactId,1);
 const target='synthetic://'+randomUUID(),args={artifactDigest:bindingDigest(bytes),destination:randomUUID()},argsDigest=bindingDigest(args);
 await f.admin.query('INSERT INTO fabric.identity_target_versions VALUES($1,$2,$3,1,$4)',[f.tenant,f.space,target,argsDigest]);
 const approval:ExactApprovalBinding={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:audience,limits:{maxOperations:1,maxCostMicrounits:30},expiresAt:new Date(Date.now()+60000).toISOString()};
 const approvals=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor}),a=await approvals.create(await f.scopeFor(0),{approvalId:randomUUID(),executorId:scope.actorId,binding:approval});await approvals.approve(await f.scopeFor(2),a.approvalId,a.bindingDigest);
 const resourceId=randomUUID();await new FenceRepository(f.repo).enroll(scope,{runId:s.runId,resourceId});
 const effect=effectSchema.parse({binding:{run:run.binding,sessionId:s.value.session.sessionId,operationId:approval.operationId,target,resourceId,action:approval.action,argsDigest,artifactId,artifactVersion:1,artifactDigest:bindingDigest(bytes),actorId:scope.actorId,policyRevision:1,audienceDigest:audience.revisionDigest,approvalId:a.approvalId,budgetReservationId:s.reservationId,executionLeaseId:s.value.lease.leaseId,generation:run.generation,expiresAt:approval.expiresAt,effectClass:'external-write',mutationPath:'api',downstream:'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const payload={effect,approval,cost:20};await f.repo.prepareEffect(scope,f.mutation(s.runId,2,payload),effect,approval,20);
 const ref:EffectRef={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.value.session.sessionId,bindingDigest:bindingDigest(run.binding),operationId:effect.binding.operationId,intentDigest:bindingDigest(effect.binding)};
 const request:EffectRequest={intent:effect.binding,arguments:args,artifact:bytes},deliveryId=randomUUID();await results.requestDelivery(scope,s.runId,1,deliveryId,artifactId,1,target);await results.bindDelivery(scope,deliveryId,ref.operationId);
 return {...s,artifactId,bytes,ref,request,deliveryId};
}
type Seed=Awaited<ReturnType<typeof seed>>;
async function worker(s:Seed,queue:string,generation:number){
 const marker='--fixture-owner='+owner,measurementPath=resolve(directory,'worker-'+generation+'.jsonl');
 const child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/native-worker-process.js',import.meta.url)),marker],marker,{...process.env,FABRIC_NATIVE_WORKER:JSON.stringify({owner,dsn:f.dsn,issuer:f.endpoints.issuer,jwksUrl:f.endpoints.jwksUrl,token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,address:temporal.address,taskQueue:queue,generation,measurementPath,effectEndpoint:endpoint,effectRequest:s.request})});children.push(child);
 await waitUntil(async()=>{if(child.child.exitCode!==null)throw new Error(child.errors());return child.output().includes('"kind":"ready"');},'actual integrated worker readiness',20000);
 assert.deepEqual(descendants(child.pid),[]);assert.ok(census().find(r=>r.pid===child.pid)?.command.includes('native-worker-process.js'));return child;
}
async function fresh(action:'get'|'send',s:Seed,notificationId?:string){
 const marker='--fixture-owner='+owner,child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/result-worker-process.js',import.meta.url)),marker],marker,{...process.env,FABRIC_RESULT_WORKER:JSON.stringify({owner,dsn:f.dsn,issuer:f.endpoints.issuer,jwksUrl:f.endpoints.jwksUrl,token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,runId:s.runId,action,notificationId,endpoint:notificationEndpoint})});children.push(child);
 await waitUntil(async()=>child.child.exitCode!==null,'fresh integrated broker exit',10000);assert.equal(child.child.exitCode,0,child.errors());
 const records=child.output().trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);assert.equal(records[0]?.sessionCacheEntries,0);assert.equal(records.at(-1)?.closed,true);assert.equal(census().some(r=>r.pid===child.pid),false);
 return records.find(r=>r.kind==='result')?.result as Awaited<ReturnType<ResultRepository['get']>> & {state:string};
}
test('QUALIFICATION/accepted command survives real client disconnect, effect ACK loss, worker/service recreation, GET-only settlement, stale online Stop and notification failure',async()=>{
 const s=await seed(),queue='qualification-'+randomUUID(),id='qualification-'+s.runId;
 const staleView=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(staleView);
 assert.equal((await fetch(endpoint+'/fixture-mode',{method:'POST',body:JSON.stringify({lookup:'normal',dedup:true,ack:'hold'})})).status,200);
 const first=await worker(s,queue,1),marker='--fixture-owner='+owner;
 const disposable=launchOwned(process.execPath,[fileURLToPath(new URL('../src/qualification-client-process.js',import.meta.url)),marker],marker,{FABRIC_QUALIFICATION_CLIENT:JSON.stringify({owner,address:temporal.address,workflowId:id,taskQueue:queue,ref:s.ref})});children.push(disposable);
 await waitUntil(async()=>disposable.child.exitCode!==null,'actual client disconnect',10000);assert.equal(disposable.child.exitCode,0,disposable.errors());assert.ok(disposable.output().includes('"connectionClosed":true'));assert.equal(census().some(r=>r.pid===disposable.pid),false);
 await waitUntil(async()=>external.output().includes('"operationId":"'+s.ref.operationId+'"'),'actual fsynced effect while client absent');
 // The dispatch I/O deliberately owns the mutation barrier while its ACK is
 // withheld. Read the durable committed marker on an independent read-only
 // diagnostic connection; a locking product get must wait until worker death.
 assert.equal((await metrics()).writes,1);assert.equal((await f.admin.query('SELECT record FROM fabric.recovery_operations WHERE operation_id=$1',[s.ref.operationId])).rows[0].record.state,'unknown');
 await stopOwned(first,'SIGKILL');
 await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,{status:'succeeded',summary:'unsafe success',artifactId:s.artifactId,version:1,deliveryId:s.deliveryId,remainingWork:'none'}));
 await stopOwned(external,'SIGKILL');await startExternal();await temporal.restart();
 await connection.close();connection=await Connection.connect({address:temporal.address});client=new Client({connection});
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(snap);const replacement={sessionId:s.ref.sessionId,previousWorker:1,nextWorker:2};await f.repo.replaceWorker(await f.scopeFor(1),f.mutation(s.runId,snap.run.revision,replacement),replacement);
 const before=await metrics(),second=await worker(s,queue,2);assert.notEqual(first.pid,second.pid);
 await client.workflow.getHandle(id).signal('recoverEffect');const recovery=await client.workflow.getHandle(id).result() as {resolution:{status:string;operationId:string};continuation:{sequence:number}};
 assert.equal(recovery.resolution.status,'confirmed');assert.equal(recovery.resolution.operationId,s.ref.operationId);assert.equal(recovery.continuation.sequence,1);
 assert.deepEqual(await metrics(),{...before,lookups:before.lookups+1});
 const records=(await readFile(resolve(directory,'worker-2.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);
 assert.equal(records[0]?.sessionCacheEntries,0);assert.equal(records.filter(r=>r.kind==='external-post').length,0);assert.equal(records.filter(r=>r.kind==='model').length,1);assert.ok(records.findIndex(r=>r.kind==='effect-resolution')<records.findIndex(r=>r.kind==='model'));
 assert.equal((await results.refreshDelivery(await f.scopeFor(1),s.deliveryId)).state,'confirmed');
 const current=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(current!.run.revision>staleView.run.revision);
 const stop={task:s.value.run.binding.task,runId:s.runId,commandId:randomUUID(),idempotencyKey:randomUUID(),expiresAt:new Date(Date.now()+30000).toISOString(),kind:'stop-run' as const,resourceId:null,expectedResourceGeneration:null,observationId:null,baseDigest:null,leaseExpiresAt:null};
 const responses=await Promise.all(Array.from({length:6},()=>fetch(http.endpoint+'/commands',{method:'POST',headers:{authorization:'Bearer '+f.tokens[1],'content-type':'application/json'},body:JSON.stringify(stop)})));
 const receipts=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return r.json() as Promise<Awaited<ReturnType<FenceRepository['execute']>>>;}));for(const receipt of receipts)assert.deepEqual(receipt,receipts[0]);
 const receipt=receipts[0]!;assert.equal(receipt.generation,3);assert.equal(receipt.dispatch,'fenced');assert.equal(receipt.termination,'pending');assert.deepEqual(receipt.unknownEffects,[]);
 await assert.rejects(createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:2,measure:()=>assert.fail('Stale worker must do zero model I/O')}).nativeTurn(s.ref,2));
 const proposal={status:'cancelled' as const,summary:'Stopped after original effect confirmed; checked bytes retained',artifactId:s.artifactId,version:1,deliveryId:s.deliveryId,remainingWork:'Review published receipt; cancellation cannot undo committed effect'};
 await assert.rejects(results.finish(await f.scopeFor(1),s.runId,2,proposal));
 const outcome=await results.finish(await f.scopeFor(1),s.runId,3,proposal);assert.equal(outcome.checks.length,1);assert.equal(outcome.checks[0]?.status,'passed');
 const notification=await new NotificationRepository(f.repo).enqueue(await f.scopeFor(1),s.runId,f.actors[1]);assert.equal((await fetch(notificationEndpoint+'/fixture-mode',{method:'POST',body:JSON.stringify({ack:'reject',lookup:'normal'})})).status,200);
 assert.equal((await fresh('send',s,notification.notificationId)).state,'failed');
 const retrieved=await fresh('get',s);assert.deepEqual(retrieved.outcome,outcome);assert.equal(retrieved.artifacts[0]?.bytes,s.bytes);assert.equal(retrieved.deliveries[0]?.state,'confirmed');assert.equal(retrieved.task.state,'cancelled');assert.equal(retrieved.run.generation.worker,3);
 assert.equal((await metrics()).writes,1);assert.equal((await metrics()).posts,0,'Recreated supplier has zero POSTs');
 const history=await client.workflow.getHandle(id).fetchHistory(),raw=proto.temporal.api.history.v1.History.toObject(proto.temporal.api.history.v1.History.fromObject(history),{longs:String,enums:String,bytes:String});await writeFile(resolve(directory,'recovery.history.json'),JSON.stringify(raw,null,2)+'\n',{flag:'wx'});
 assert.ok(history.events?.some(e=>e.eventType===proto.temporal.api.enums.v1.EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT));
 console.log(JSON.stringify({measurement:'integrated-recovery-qualification',owner,taskId:s.taskId,runId:s.runId,sessionId:s.ref.sessionId,operationId:s.ref.operationId,deliveryId:s.deliveryId,notificationId:notification.notificationId,originalCommandKey:s.init.key,clientPid:disposable.pid,clientDisconnected:true,oldWorkerPid:first.pid,newWorkerPid:second.pid,oldGeneration:1,replacementGeneration:2,stopGeneration:3,externalWrites:1,recoveryPosts:0,recoveryLookups:1,modelCallsAfterReconcile:1,concurrentStopTaps:6,stopDispatch:receipt.dispatch,processTermination:receipt.termination,outcomeDigest:outcome.resultDigest,notificationState:'failed',checkedResultRetrieved:true,productionQualified:false}));
 completed=true;
});
