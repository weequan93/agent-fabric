import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecoveryFixture} from './pg-fixture.js';
import {census,freePort,launchOwned,stopOwned,waitUntil,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {migrateEffectHistory} from '../src/effect-migration.js';
import {migrateFences} from '../src/fence-migration.js';
import {migrateDispatch} from '../src/dispatch-migration.js';
import {migrateResults} from '../src/result-migration.js';
import {migrateResourceReconciliation} from '../src/resource-reconciliation-migration.js';
import {ResultRepository,type ResultConfig,type Outcome} from '../src/result-repository.js';
import {RecoveryRepository} from '../src/repository.js';
import {createNativeActivities} from '../src/native-activities.js';
import {FenceRepository} from '../src/fence-repository.js';
import {bindingDigest,runSchema,effectSchema,type Run} from '../src/contracts.js';
import {audienceDigest,type AudienceRow} from '../../g1-identity/src/audience.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import {EffectRepository} from '../src/effect-repository.js';
import {createEffectActivities,type EffectRef} from '../src/effect-activities.js';
import type {EffectRequest} from '../src/effect-protocol.js';

let f:Awaited<ReturnType<typeof createRecoveryFixture>>,results:ResultRepository,directory:string,endpoint:string;
const owner=randomUUID(),children:OwnedChild[]=[];
before(async()=>{
 census();f=await createRecoveryFixture();
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
 await migrateFences(f.admin,resolve('migrations/0007_fences.sql'));
 await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));
 await migrateResults(f.admin,resolve('migrations/0009_results.sql'));
 results=new ResultRepository(f.repo);directory=await mkdtemp(resolve(tmpdir(),'fabric-results-'+owner+'-'));
 await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});
 const port=await freePort();endpoint='http://127.0.0.1:'+port;
 const marker='--fixture-owner='+owner,child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/effect-service-process.js',import.meta.url)),marker],marker,{FABRIC_EFFECT_SERVICE:JSON.stringify({owner,journal:resolve(directory,'publication.jsonl'),port})});children.push(child);
 await waitUntil(async()=>{if(child.child.exitCode!==null)throw new Error(child.errors());return child.output().includes('"kind":"ready"');},'independent publication service');
 assert.ok(census().find(r=>r.pid===child.pid)?.command.includes('effect-service-process.js'));
});
after(async()=>{
 const errors:unknown[]=[];for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await f?.close();}catch(e){errors.push(e);}
 try{if(directory){assert.equal(await readFile(resolve(directory,'owner'),'utf8'),owner);await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'owned-results-files-cleanup',owner,removed:true}));}}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory result fixture cleanup');
});
async function audience(){const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);return {sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)};}
async function transition(runId:string,state:Run['state']){const scope=await f.scopeFor(1),s=await f.repo.get(scope,runId);assert.ok(s);const run=runSchema.parse({...s.run,state,revision:s.run.revision+1}),cp={run,session:s.sessions[0]!,result:null};await f.repo.checkpoint(scope,f.mutation(runId,s.run.revision,cp),cp);}
async function seed(obligation:ResultConfig['obligation']='draft',existingTask?:{taskId:string;attempt:number;cancellationGeneration:number}){
 const scope=await f.scopeFor(1),s=await f.seedRun(scope,existingTask);await f.repo.initialize(scope,s.init,s.value);await transition(s.runId,'running');
 const config:ResultConfig={obligation,definitions:[{kind:'nonempty',argument:'agreed bounded local check'},{kind:'contains',argument:'verified'}],audience:await audience()};await results.configure(scope,s.runId,config);
 return {...s,config,artifactId:randomUUID(),bytes:'verified local artifact '+randomUUID()};
}
type Seed=Awaited<ReturnType<typeof seed>>;
async function draft(s:Seed,bytes=s.bytes){return results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,1,null,bytes);}
async function checked(s:Seed){await draft(s);return results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1);}
function outcome(s:Seed,status:Outcome['status']='succeeded',deliveryId:string|null=null){return {status,summary:status+' persisted local result',artifactId:s.artifactId,version:1,deliveryId,remainingWork:status==='succeeded'?'none':'retry remaining work'};}
async function metrics(){const response=await fetch(endpoint+'/metrics');assert.equal(response.status,200);return await response.json() as {writes:number;posts:number;lookups:number};}
async function prepared(s:Seed,options:{expiry?:string;artifactId?:string;artifactVersion?:number;artifactDigest?:string;target?:string;resourceId?:string}={}){
 const scope=await f.scopeFor(1),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);const target=options.target??'synthetic://'+randomUUID(),artifactDigest=options.artifactDigest??bindingDigest(s.bytes),args={text:'disposable publication',destination:randomUUID(),artifactDigest},argsDigest=bindingDigest(args);
 await f.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,$4,$5)',[f.tenant,f.space,target,options.artifactVersion??1,argsDigest]);
 const approval:ExactApprovalBinding={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:options.artifactVersion??1,policyRevision:1,requirementsRevision:1,sourceAudience:s.config.audience,limits:{maxOperations:1,maxCostMicrounits:30},expiresAt:options.expiry??new Date(Date.now()+60000).toISOString()};
 const approvals=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor}),a=await approvals.create(await f.scopeFor(0),{approvalId:randomUUID(),executorId:scope.actorId,binding:approval});await approvals.approve(await f.scopeFor(2),a.approvalId,a.bindingDigest);
 const resourceId=options.resourceId??randomUUID();await new FenceRepository(f.repo).enroll(scope,{runId:s.runId,resourceId});
 const effect=effectSchema.parse({binding:{run:snapshot.run.binding,sessionId:s.value.session.sessionId,operationId:approval.operationId,target,resourceId,action:approval.action,argsDigest,artifactId:options.artifactId??s.artifactId,artifactVersion:options.artifactVersion??1,artifactDigest,actorId:scope.actorId,policyRevision:1,audienceDigest:approval.sourceAudience.revisionDigest,approvalId:a.approvalId,budgetReservationId:s.reservationId,executionLeaseId:s.value.lease.leaseId,generation:snapshot.run.generation,expiresAt:approval.expiresAt,effectClass:'external-write',mutationPath:'api',downstream:'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const payload={effect,approval,cost:20};await f.repo.prepareEffect(scope,f.mutation(s.runId,snapshot.run.revision,payload),effect,approval,20);
 const ref:EffectRef={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.value.session.sessionId,bindingDigest:bindingDigest(snapshot.run.binding),operationId:effect.binding.operationId,intentDigest:bindingDigest(effect.binding)},request:EffectRequest={intent:effect.binding,arguments:args,artifact:s.bytes};
 const activities=createEffectActivities({repo:new EffectRepository(f.repo),scope:()=>f.scopeFor(1),generation:1,endpoint,requestFor:async()=>request,measure:r=>console.log(JSON.stringify({measurement:'result-publication-activity',...r}))});return {effect,ref,request,activities,target,approvalId:a.approvalId};
}

test('RESULT/additive migration9 verifies exact digest, idempotency and unchanged earlier ledgers',async()=>{
 const ledger=(await f.admin.query('SELECT version,digest FROM public.fabric_recovery_migrations ORDER BY version')).rows;
 assert.deepEqual(ledger.map(r=>Number(r.version)),[4,5,6,7,8,9]);
 for(const [version,path] of [[4,'0004_recovery.sql'],[5,'0005_native_history.sql'],[6,'0006_effect_reconciliation.sql'],[7,'0007_fences.sql'],[8,'0008_dispatch.sql'],[9,'0009_results.sql']] as const)assert.equal(ledger.find(r=>Number(r.version)===version)?.digest,createHash('sha256').update(await readFile(resolve('migrations',path))).digest('hex'));
 const foundation=(await f.admin.query('SELECT * FROM public.fabric_foundation_migrations ORDER BY version')).rows;
 await migrateResults(f.admin,resolve('migrations/0009_results.sql'));const bad=resolve(directory,'incompatible.sql');await writeFile(bad,(await readFile(resolve('migrations/0009_results.sql'),'utf8'))+'\n-- changed digest\n');await assert.rejects(migrateResults(f.admin,bad),/incompatible/);
 assert.deepEqual((await f.admin.query('SELECT version,digest FROM public.fabric_recovery_migrations ORDER BY version')).rows,ledger);assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_foundation_migrations ORDER BY version')).rows,foundation);
});
test('RESULT/forced RLS and least privilege deny raw artifact/outcome/notification SQL to worker/client/IdP',async()=>{
 const tables=['recovery_result_tasks','recovery_artifact_versions','recovery_check_receipts','recovery_deliveries','recovery_attempt_outcomes','recovery_notifications'],flags=(await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='fabric'::regnamespace AND relname=ANY($1)",[tables])).rows;assert.equal(flags.length,tables.length);for(const flag of flags){assert.equal(flag.relrowsecurity,true);assert.equal(flag.relforcerowsecurity,true);}
 for(const pool of [f.worker,f.client,f.idp])for(const table of tables)await assert.rejects(pool.query('SELECT * FROM fabric.'+table),/permission denied/);
 const bare=await f.controller.connect();try{await bare.query('BEGIN');await bare.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true)",[f.tenant,f.space,f.actors[1]]);for(const table of tables)assert.equal((await bare.query('SELECT * FROM fabric.'+table)).rows.length,0);await bare.query('ROLLBACK');}finally{bare.release();}
});
test('RESULT/agreed checks are required and immutable; worker cannot nominate arbitrary checks',async()=>{
 const s=await seed();await assert.rejects(results.configure(await f.scopeFor(1),s.runId,{...s.config,definitions:[]}));await assert.rejects(results.configure(await f.scopeFor(1),s.runId,{...s.config,definitions:[s.config.definitions[0]!,s.config.definitions[0]!]}));await assert.rejects(results.configure(await f.scopeFor(1),s.runId,{...s.config,definitions:[{kind:'contains',argument:'different'}]}));
 await results.configure(await f.scopeFor(1),s.runId,s.config);assert.deepEqual((await results.get(await f.scopeFor(1),s.runId)).task.config,s.config);
});
for(const stage of ['missing-artifact','unchecked','failed-checks','checked-unpublished','awaiting-approval'] as const)test('RESULT/generic terminal checkpoint cannot bypass '+stage+' and qualified completion survives recreation',async()=>{
 const s=await seed('publish');
 if(stage==='unchecked')await draft(s);
 if(stage==='failed-checks'){await draft(s,'fails required content');const a=await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1);assert.equal(a.artifact.verification,'failed');}
 if(stage==='checked-unpublished'||stage==='awaiting-approval')await checked(s);
 const deliveryId=stage==='awaiting-approval'?randomUUID():null;
 if(deliveryId)await results.requestDelivery(await f.scopeFor(1),s.runId,1,deliveryId,s.artifactId,1,'synthetic://not-approved');
 await transition(s.runId,'verifying');
 const scope=await f.scopeFor(1),before=await results.get(scope,s.runId),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);
 const result={resultDigest:bindingDigest('arbitrary result '+s.runId),summary:'fabricated completed publication'},run=runSchema.parse({...snapshot.run,state:'succeeded',revision:snapshot.run.revision+1,outcomeDigest:result.resultDigest}),cp={run,session:snapshot.sessions[0]!,result},m=f.mutation(s.runId,snapshot.run.revision,cp),writes=await metrics();
 const fresh=()=>new RecoveryRepository(f.uow,f.bindingFor);
 await assert.rejects(fresh().checkpoint(scope,m,cp),(e:unknown)=>(e as {code:string}).code==='STALE_AUTHORITY');
 await assert.rejects(fresh().checkpoint(await f.scopeFor(1),m,cp),(e:unknown)=>(e as {code:string}).code==='STALE_AUTHORITY');
 assert.deepEqual(await fresh().lookupCommand(await f.scopeFor(1),m.key,m.payloadDigest),{status:'absent-safe'});
 assert.deepEqual(await fresh().get(await f.scopeFor(1),s.runId),snapshot);
 const qualified=new ResultRepository(fresh());assert.deepEqual(await qualified.get(await f.scopeFor(1),s.runId),before);
 await assert.rejects(qualified.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',deliveryId)));
 for(const table of ['recovery_results','recovery_attempt_outcomes','recovery_notifications'])assert.equal((await f.admin.query('SELECT * FROM fabric.'+table+' WHERE run_id=$1',[s.runId])).rowCount,0);
 for(const table of ['recovery_receipts','recovery_outbox'])assert.equal((await f.admin.query('SELECT * FROM fabric.'+table+' WHERE command_key=$1',[m.key])).rowCount,0);
 assert.deepEqual(await metrics(),writes);
 // A denied bypass leaves the attempt recoverable through atomic qualified completion.
 const failed={...outcome(s,'failed',deliveryId),...(stage==='missing-artifact'?{artifactId:null,version:null}:{})};
 const o=await qualified.finish(await f.scopeFor(1),s.runId,1,failed),restored=await new ResultRepository(fresh()).get(await f.scopeFor(1),s.runId);
 assert.deepEqual(restored.outcome,o);assert.equal(restored.run.state,'failed');assert.equal(restored.task.state,'failed');
 assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId])).rowCount,1);
 assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rowCount,s.config.audience.recipientActorIds.length);
 assert.deepEqual(await new ResultRepository(fresh()).finish(await f.scopeFor(1),s.runId,1,failed),o);assert.deepEqual(await metrics(),writes);
 console.log(JSON.stringify({measurement:'generic-terminal-checkpoint-denied',stage,runId:s.runId,recreatedRepository:true,rejectedCommandWrites:0,externalPosts:0,qualifiedRecoveryOutcome:o.resultDigest}));
});
for(const status of ['succeeded','partial','failed','cancelled'] as const)test('RESULT/generic '+status+' cannot omit Task outcome and notification intents',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,status==='cancelled'?'cancelling':'verifying');
 const scope=await f.scopeFor(1),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);
 const result={resultDigest:bindingDigest('arbitrary '+status),summary:'fabricated terminal '+status},cp={run:runSchema.parse({...snapshot.run,state:status,revision:snapshot.run.revision+1,outcomeDigest:result.resultDigest}),session:snapshot.sessions[0]!,result},m=f.mutation(s.runId,snapshot.run.revision,cp);
 await assert.rejects(f.repo.checkpoint(scope,m,cp),(e:unknown)=>(e as {code:string}).code==='STALE_AUTHORITY');assert.deepEqual(await f.repo.get(scope,s.runId),snapshot);
 const qualified=new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)),o=await qualified.finish(await f.scopeFor(1),s.runId,1,outcome(s,status)),restored=await qualified.get(await f.scopeFor(1),s.runId);
 assert.equal(restored.run.state,status);assert.equal(restored.task.state,status);assert.deepEqual(restored.outcome,o);
 assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rowCount,s.config.audience.recipientActorIds.length);
});
test('RESULT/existing schema rejects malformed nonterminal result proposal before durable writes',async()=>{
 const s=await seed(),scope=await f.scopeFor(1),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);
 const result={resultDigest:bindingDigest('premature result'),summary:'unchecked'},cp={run:{...snapshot.run,state:'verifying' as const,revision:snapshot.run.revision+1,outcomeDigest:result.resultDigest},session:snapshot.sessions[0]!,result},m=f.mutation(s.runId,snapshot.run.revision,cp);
 await assert.rejects(f.repo.checkpoint(scope,m,cp),(e:unknown)=>(e as {code:string}).code==='INVALID_INPUT');assert.deepEqual(await f.repo.get(scope,s.runId),snapshot);
 await checked(s);await transition(s.runId,'verifying');const o=await results.finish(scope,s.runId,1,outcome(s));assert.equal((await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(scope,s.runId)).outcome?.resultDigest,o.resultDigest);
});
test('RESULT/installed result profile requires qualified completion even before Task configuration',async()=>{
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);await f.repo.initialize(scope,s.init,s.value);await transition(s.runId,'running');await transition(s.runId,'verifying');const snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);
 const result={resultDigest:bindingDigest('unconfigured result'),summary:'arbitrary unconfigured success'},cp={run:runSchema.parse({...snapshot.run,state:'succeeded',revision:snapshot.run.revision+1,outcomeDigest:result.resultDigest}),session:snapshot.sessions[0]!,result};await assert.rejects(f.repo.checkpoint(scope,f.mutation(s.runId,snapshot.run.revision,cp),cp),(e:unknown)=>(e as {code:string}).code==='STALE_AUTHORITY');assert.deepEqual(await f.repo.get(scope,s.runId),snapshot);
});
for(const first of ['generic','qualified'] as const)test('RESULT/observed Run lock serializes '+first+' completion first without bypass or duplicate outcome',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,'verifying');const scope=await f.scopeFor(1),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);
 const result={resultDigest:bindingDigest('competing generic outcome'),summary:'arbitrary competing success'},cp={run:runSchema.parse({...snapshot.run,state:'succeeded',revision:snapshot.run.revision+1,outcomeDigest:result.resultDigest}),session:snapshot.sessions[0]!,result},m=f.mutation(s.runId,snapshot.run.revision,cp),blocker=await f.admin.connect();
 await blocker.query('BEGIN');await blocker.query('SELECT run_id FROM fabric.recovery_runs WHERE run_id=$1 FOR UPDATE',[s.runId]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
 const fresh=()=>new RecoveryRepository(f.uow,f.bindingFor),qualified=new ResultRepository(fresh());
 const generic=()=>fresh().checkpoint(scope,m,cp).then(value=>({value,error:null}),error=>({value:null,error}));
 const finish=()=>qualified.finish(scope,s.runId,1,outcome(s)).then(value=>({value,error:null}),error=>({value:null,error}));
 let a:ReturnType<typeof generic>|ReturnType<typeof finish>|undefined,b:ReturnType<typeof generic>|ReturnType<typeof finish>|undefined;
 let firstPid=0;
 const observed=async()=>waitUntil(async()=>{const rows=(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE query LIKE 'SELECT record FROM fabric.recovery_runs%' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rows;if(rows.length)firstPid=Number(rows[0].pid);return rows.length>0;},'actual completion Run lock wait',1500);
 try{
  a=first==='generic'?generic():finish();await observed();b=first==='generic'?finish():generic();
  // The installed Space barrier serializes the second transaction before it
  // can reach the Run row. Observe the actual blocking chain, not two row waits.
  await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE query LIKE 'SELECT pg_advisory_xact_lock%' AND $1=ANY(pg_blocking_pids(pid))",[firstPid])).rowCount!>0,'second completion waits on first Space barrier',1500);
  await blocker.query('COMMIT');const [one,two]=await Promise.all([a,b]),denied=first==='generic'?one:two,completed=first==='generic'?two:one;
  assert.ok(denied.error);assert.ok(['STALE_AUTHORITY','REVISION_CONFLICT'].includes((denied.error as {code:string}).code));assert.equal(completed.error,null);
  const restored=await new ResultRepository(fresh()).get(await f.scopeFor(1),s.runId);assert.deepEqual(restored.outcome,completed.value);assert.equal(restored.task.state,'succeeded');assert.equal(restored.run.state,'succeeded');assert.notEqual(restored.run.outcomeDigest,result.resultDigest);
  assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId])).rowCount,1);assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rowCount,s.config.audience.recipientActorIds.length);
  for(const table of ['recovery_receipts','recovery_outbox'])assert.equal((await f.admin.query('SELECT * FROM fabric.'+table+' WHERE command_key=$1',[m.key])).rowCount,0);
  assert.deepEqual(await qualified.finish(await f.scopeFor(1),s.runId,1,outcome(s)),restored.outcome);
  console.log(JSON.stringify({measurement:'generic-qualified-completion-lock-race',first,runId:s.runId,actualRunLockObserved:true,genericRejected:true,committedOutcomes:1}));
 }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled([a,b].filter((value):value is NonNullable<typeof value>=>value!==undefined));}
});
test('RESULT/draft unchecked bytes cannot finish or deliver; verifier computes failed checks from persisted bytes',async()=>{
 const s=await seed();await draft(s,'incomplete empty-policy artifact');await transition(s.runId,'verifying');await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s)));await assert.rejects(results.requestDelivery(await f.scopeFor(1),s.runId,1,randomUUID(),s.artifactId,1,'synthetic://unchecked'));
 const verified=await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1);assert.equal(verified.artifact.stage,'candidate');assert.equal(verified.artifact.verification,'failed');assert.deepEqual(verified.checks.map(c=>c.status),['passed','failed']);await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s)));assert.equal((await results.get(await f.scopeFor(1),s.runId)).outcome,null);
});
test('RESULT/prepare-draft success requires checks and remains independent of publication, acceptance, cost settlement and notifications',async()=>{
 const s=await seed(),candidate=await checked(s);assert.equal(candidate.artifact.stage,'candidate');assert.equal(candidate.artifact.acceptedVersion,null);await transition(s.runId,'verifying');const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s));assert.equal(o.status,'succeeded');assert.equal(o.checks.length,2);assert.equal(o.costStatus,'reservation-unsettled');
 const restored=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(await f.scopeFor(1),s.runId);assert.deepEqual(restored.outcome,o);assert.equal(restored.task.state,'succeeded');assert.equal(restored.run.state,'succeeded');assert.equal(restored.deliveries.length,0);const notifications=(await f.admin.query('SELECT record FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rows;assert.equal(notifications.length,s.config.audience.recipientActorIds.length);assert.ok(notifications.every(row=>row.record.state==='pending'));
 assert.deepEqual(await results.finish(await f.scopeFor(1),s.runId,1,outcome(s)),o);await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,{...outcome(s),summary:'different terminal summary'}));await assert.rejects(results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified late bytes'));
 console.log(JSON.stringify({measurement:'draft-result-without-publication',runId:s.runId,resultDigest:o.resultDigest,artifactDigest:candidate.artifact.digest,deliveryCount:0,pendingNotificationCount:notifications.length,costStatus:o.costStatus}));
});
test('RESULT/same artifact key cannot change immutable bytes and verifier receipts are append-only',async()=>{
 const s=await seed(),a=await draft(s);assert.deepEqual(await draft(s),a);await assert.rejects(draft(s,'verified altered bytes'));await assert.rejects(results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,3,null,s.bytes));const c=await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1);assert.deepEqual(await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1),c);
 for(const receipt of c.checks){await assert.rejects(f.admin.query('UPDATE fabric.recovery_check_receipts SET record=$2 WHERE check_id=$1',[receipt.checkId,'{}']),/immutable/);await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_check_receipts WHERE check_id=$1',[receipt.checkId]),/immutable/);}
 await assert.rejects(f.admin.query("UPDATE fabric.recovery_artifact_versions SET binding=jsonb_set(binding,'{bytes}','\"rewritten\"') WHERE artifact_id=$1",[s.artifactId]),/immutable/);await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_artifact_versions WHERE artifact_id=$1',[s.artifactId]),/immutable/);
});
test('RESULT/concurrent identical drafts/verifiers preserve one version and exactly agreed check receipts',async()=>{
 const s=await seed(),scope=await f.scopeFor(1),drafts=await Promise.all(Array.from({length:6},()=>results.saveDraft(scope,s.runId,1,s.artifactId,1,null,s.bytes)));for(const value of drafts)assert.deepEqual(value,drafts[0]);const checked=await Promise.all(Array.from({length:6},()=>results.verify(scope,s.runId,1,s.artifactId,1)));for(const value of checked)assert.deepEqual(value,checked[0]);assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_artifact_versions WHERE artifact_id=$1',[s.artifactId])).rowCount,1);assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_check_receipts WHERE artifact_id=$1',[s.artifactId])).rowCount,2);
});
test('RESULT/accepted artifact versions require current checked candidate and exact accepted base',async()=>{
 const s=await seed();await checked(s);await assert.rejects(results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,1,2));const a=await results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,1,null);assert.equal(a.artifact.stage,'accepted');assert.equal(a.artifact.acceptedVersion,1);
 await assert.rejects(results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified new version'));const two=await results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,1,'verified new version');assert.equal(two.artifact.baseVersion,1);await assert.rejects(results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,2,1));await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,2);await assert.rejects(results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,2,null));const accepted=await results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,2,1);assert.equal(accepted.artifact.acceptedVersion,2);assert.equal((await results.get(await f.scopeFor(1),s.runId)).task.accepted[s.artifactId],2);
});
test('RESULT/changed latest artifact cannot inherit old checks or be delivered as old checked version',async()=>{
 const s=await seed();await checked(s);await results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified changed bytes');for(const version of [1,2]){await assert.rejects(results.accept(await f.scopeFor(1),s.runId,1,s.artifactId,version,null));await assert.rejects(results.requestDelivery(await f.scopeFor(1),s.runId,1,randomUUID(),s.artifactId,version,'synthetic://stale'));}await transition(s.runId,'verifying');await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s)));assert.equal((await results.get(await f.scopeFor(1),s.runId)).deliveries.length,0);
});
for(const status of ['failed','partial','cancelled'] as const)test('RESULT/'+status+' attempt and partial artifact/check evidence survive actual new attempt',async()=>{
 const s=await seed();await draft(s,'unfinished artifact for '+status);await results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1);if(status==='partial')await transition(s.runId,'verifying');if(status==='cancelled')await transition(s.runId,'cancelling');const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s,status));const before=await results.get(await f.scopeFor(1),s.runId);assert.equal(o.status,status);assert.equal(o.checks[1]?.status,'failed');
 const next=await seed('draft',{taskId:s.taskId,attempt:2,cancellationGeneration:0});assert.notEqual(next.runId,s.runId);await checked(next);await transition(next.runId,'verifying');await results.finish(await f.scopeFor(1),next.runId,1,outcome(next));const previous=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(await f.scopeFor(1),s.runId);assert.deepEqual(previous.outcome,o);assert.deepEqual(previous.artifacts.filter(a=>a.artifact.artifactId===s.artifactId),before.artifacts);assert.ok(previous.artifacts.some(a=>a.artifact.artifactId===next.artifactId));assert.equal(previous.run.state,status);assert.equal(previous.task.currentRunId,next.runId);assert.equal(previous.task.state,'succeeded');
 await assert.rejects(f.admin.query('UPDATE fabric.recovery_attempt_outcomes SET record=$2 WHERE run_id=$1',[s.runId,'{}']),/immutable/);await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId]),/immutable/);
 console.log(JSON.stringify({measurement:'task-attempt-result-separation',taskId:s.taskId,oldRunId:s.runId,newRunId:next.runId,oldOutcome:status,currentTaskState:previous.task.state,preservedArtifactBytes:previous.artifacts[0]?.bytes}));
});
test('RESULT/old environment and dependency receipts cannot qualify a new attempt',async()=>{
 const s=await seed();await checked(s);await results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'failed'));const scope=await f.scopeFor(1),next=await f.seedRun(scope,{taskId:s.taskId,attempt:2,cancellationGeneration:0});const binding={...next.value.run.binding,environmentDigest:bindingDigest('fresh environment'),dependencyLockDigest:bindingDigest('fresh dependencies')},value={run:{...next.value.run,binding},session:{...next.value.session,binding},lease:{...next.value.lease,binding}};await f.repo.initialize(scope,f.mutation(next.runId,0,value),value);await transition(next.runId,'running');await results.configure(scope,next.runId,s.config);
 await assert.rejects(results.accept(await f.scopeFor(1),next.runId,1,s.artifactId,1,null));await assert.rejects(results.requestDelivery(await f.scopeFor(1),next.runId,1,randomUUID(),s.artifactId,1,'synthetic://old-environment'));await transition(next.runId,'verifying');await assert.rejects(results.finish(await f.scopeFor(1),next.runId,1,{...outcome(s),artifactId:s.artifactId}));assert.equal((await results.get(await f.scopeFor(1),next.runId)).outcome,null);
});
test('RESULT/requested publication stays awaiting approval and cannot succeed on checks alone',async()=>{
 const s=await seed('publish');await checked(s);const target='synthetic://awaiting',id=randomUUID(),delivery=await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,target);assert.equal(delivery.state,'awaiting-approval');assert.equal(delivery.approvalId,null);assert.deepEqual(await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,target),delivery);await assert.rejects(results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,target+'-changed'));await transition(s.runId,'verifying');await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s)));await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id)));assert.equal((await results.get(await f.scopeFor(1),s.runId)).outcome,null);
});
test('RESULT/separately approved publication requires actual confirmed downstream receipt, not transport ACK',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);assert.equal((await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId)).state,'in-progress');const before=await metrics();await p.activities.dispatchEffect(p.ref);assert.equal((await results.refreshDelivery(await f.scopeFor(1),id)).state,'unknown');await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id)));assert.equal((await p.activities.reconcileEffect(p.ref)).status,'confirmed');const d=await results.refreshDelivery(await f.scopeFor(1),id);assert.equal(d.state,'confirmed');assert.ok(d.receiptDigest);assert.equal(d.approvalId,p.approvalId);await p.activities.resumeEffect(p.ref);const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id));assert.equal(o.status,'succeeded');assert.equal((await metrics()).writes,before.writes+1);assert.equal((await metrics()).posts,before.posts+1);assert.equal((await results.get(await f.scopeFor(1),s.runId)).deliveries[0]?.state,'confirmed');
 console.log(JSON.stringify({measurement:'result-confirmed-authorized-publication',runId:s.runId,deliveryId:id,operationId:p.ref.operationId,approvalId:p.approvalId,resultDigest:o.resultDigest,externalWrites:1}));
});
test('RESULT/native final answer completes confirmed publication through fresh repositories without more POST or model calls',async()=>{
 const s=await seed('publish');const candidate=await checked(s),p=await prepared(s),id=randomUUID();
 await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);
 const before=await metrics();await p.activities.dispatchEffect(p.ref);assert.equal((await p.activities.reconcileEffect(p.ref)).status,'confirmed');await p.activities.resumeEffect(p.ref);
 let models=0;const native=(repo:RecoveryRepository)=>createNativeActivities({repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});
 await native(f.repo).nativeTurn(p.ref,1);await native(new RecoveryRepository(f.uow,f.bindingFor)).nativeTurn(p.ref,2);
 const snapshot=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snapshot?.run.state,'verifying');assert.equal(snapshot?.sessions[0]?.state,'finished');assert.equal(snapshot?.sessions[0]?.cursor,2);assert.equal(models,2);
 assert.deepEqual((await f.repo.nativeTranscript(await f.scopeFor(1),p.ref.sessionId)).map(e=>e.kind),['proposal','answer']);
 const settled=await metrics();assert.equal(settled.posts,before.posts+1);assert.equal(settled.writes,before.writes+1);
 // Executable effect access must remain closed after the real final answer.
 let io=0;await assert.rejects(new EffectRepository(new RecoveryRepository(f.uow,f.bindingFor)).guardedIO(await f.scopeFor(1),p.ref.operationId,1,false,async()=>{io++;}));assert.equal(io,0);
 const fresh=()=>new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor));
 await assert.rejects(fresh().finish(await f.scopeFor(1),s.runId,2,outcome(s,'succeeded',id)));
 await assert.rejects(fresh().refreshDelivery(await f.scopeFor(2),id));
 const delivery=await fresh().refreshDelivery(await f.scopeFor(1),id);assert.equal(delivery.state,'confirmed');assert.ok(delivery.receiptDigest);
 const scope=await f.scopeFor(1),completed=await Promise.all(Array.from({length:3},()=>fresh().finish(scope,s.runId,1,outcome(s,'succeeded',id)))),o=completed[0]!;assert.ok(completed.every(value=>bindingDigest(value)===bindingDigest(o)));assert.equal(o.status,'succeeded');assert.deepEqual(o.checks,candidate.checks);
 const restored=await fresh().get(await f.scopeFor(1),s.runId);assert.deepEqual(restored.outcome,o);assert.equal(restored.task.state,'succeeded');assert.equal(restored.run.state,'succeeded');assert.equal(restored.artifacts[0]?.bytes,s.bytes);assert.equal(restored.deliveries[0]?.receiptDigest,delivery.receiptDigest);
 assert.deepEqual(await fresh().refreshDelivery(await f.scopeFor(1),id),delivery);assert.deepEqual(await fresh().finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id)),o);
 await assert.rejects(fresh().finish(await f.scopeFor(1),s.runId,1,{...outcome(s,'succeeded',id),summary:'changed immutable outcome'}));
 const notifications=(await f.admin.query('SELECT record FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rows;assert.equal(notifications.length,s.config.audience.recipientActorIds.length);assert.ok(notifications.every(row=>row.record.state==='pending'&&row.record.resultDigest===o.resultDigest));
 assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId])).rowCount,1);assert.equal(models,2);assert.deepEqual(await metrics(),settled);
 console.log(JSON.stringify({measurement:'native-final-answer-confirmed-publication-recovery',runId:s.runId,operationId:p.ref.operationId,runBeforeFinish:'verifying',sessionState:'finished',modelCalls:models,additionalModels:0,externalPosts:1,externalWrites:1,additionalPosts:0,recreatedRepositories:true,outcomeDigest:o.resultDigest,pendingNotificationCount:notifications.length}));
});
for(const denial of ['target','lease','budget','approver-session','audience','executor-membership','Stop','shared-unknown'] as const)test('RESULT/confirmed delivery after native answer retains current '+denial+' gate',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);
 await p.activities.dispatchEffect(p.ref);assert.equal((await p.activities.reconcileEffect(p.ref)).status,'confirmed');await p.activities.resumeEffect(p.ref);
 let models=0;const native=createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});await native.nativeTurn(p.ref,1);await native.nativeTurn(p.ref,2);assert.equal(models,2);
 const scope=await f.scopeFor(1),before=await metrics();let restore=async()=>{};
 try{
  if(denial==='target')await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=artifact_version+1 WHERE tenant_id=$1 AND space_id=$2 AND target=$3',[f.tenant,f.space,p.target]);
  if(denial==='lease')await f.admin.query("UPDATE fabric.recovery_leases SET record=jsonb_set(record,'{expiresAt}',to_jsonb($2::text)) WHERE run_id=$1",[s.runId,new Date(0).toISOString()]);
  if(denial==='budget')await f.admin.query('UPDATE fabric.budget_reservations SET settled_amount=amount WHERE reservation_id=$1',[s.reservationId]);
  if(denial==='approver-session'){
   restore=async()=>{await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=NULL WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2]]);};await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2]]);
  }
  if(denial==='audience'){
   restore=async()=>{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[2]]);};await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[2]]);
  }
  if(denial==='executor-membership'){
   restore=async()=>{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);};await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
  }
  if(denial==='Stop')await new FenceRepository(f.repo).execute(scope,{task:s.value.run.binding.task,runId:s.runId,commandId:randomUUID(),idempotencyKey:randomUUID(),expiresAt:new Date(Date.now()+30000).toISOString(),kind:'stop-run',resourceId:null,expectedResourceGeneration:null,observationId:null,baseDigest:null,leaseExpiresAt:null});
  if(denial==='shared-unknown'){
   const other=await seed('publish');await checked(other);const pending=await prepared(other,{resourceId:p.effect.binding.resourceId});assert.equal(await new EffectRepository(f.repo).claim(await f.scopeFor(1),pending.ref.operationId,1),true);
  }
  const fresh=new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor));
  const expected={target:'STALE_AUTHORITY',lease:'STALE_AUTHORITY',budget:'UNAUTHORIZED','approver-session':'UNAUTHORIZED',audience:'AUDIENCE_DENIED','executor-membership':'STALE_AUTHORITY',Stop:'STALE_AUTHORITY','shared-unknown':'STALE_AUTHORITY'}[denial];
  const refused=(e:unknown)=>(e as {code:string}).code===expected;
  await assert.rejects(fresh.refreshDelivery(scope,id),refused);await assert.rejects(fresh.finish(scope,s.runId,1,outcome(s,'succeeded',id)),refused);
  assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId])).rowCount,0);assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rowCount,0);
  assert.equal((await f.admin.query('SELECT record FROM fabric.recovery_deliveries WHERE delivery_id=$1',[id])).rows[0].record.state,'in-progress');assert.equal((await f.admin.query('SELECT record FROM fabric.recovery_operations WHERE operation_id=$1',[p.ref.operationId])).rows[0].record.state,'confirmed');assert.equal(models,2);assert.deepEqual(await metrics(),before);
  console.log(JSON.stringify({measurement:'native-final-answer-confirmed-delivery-current-denial',denial,runId:s.runId,operationId:p.ref.operationId,committedOutcomes:0,committedNotifications:0,additionalModels:0,additionalPosts:0}));
 }finally{await restore();}
});
test('RESULT/verifying cannot synchronize unconfirmed delivery or reopen executable effect access',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);
 await transition(s.runId,'verifying');const before=await metrics();let io=0;
 await assert.rejects(results.refreshDelivery(await f.scopeFor(1),id));await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id)));
 await assert.rejects(new EffectRepository(f.repo).guardedIO(await f.scopeFor(1),p.ref.operationId,1,false,async()=>{io++;}));await assert.rejects(p.activities.dispatchEffect(p.ref));assert.equal(io,0);assert.deepEqual(await metrics(),before);
 const restored=await results.get(await f.scopeFor(1),s.runId);assert.equal(restored.outcome,null);assert.equal(restored.task.state,'waiting');assert.equal(restored.deliveries[0]?.state,'in-progress');assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rowCount,0);
});
test('RESULT/mismatched operation artifact identity refuses Delivery binding without any external write',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s,{artifactId:randomUUID()}),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);const before=await metrics();await assert.rejects(results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId));assert.deepEqual(await metrics(),before);assert.equal((await results.get(await f.scopeFor(1),s.runId)).deliveries[0]?.state,'awaiting-approval');
});
test('RESULT/changed artifact invalidates requested delivery even with a consumed exact approval',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified changed after approval');const before=await metrics();await assert.rejects(results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId));assert.deepEqual(await metrics(),before);
});
test('RESULT/target revision changes invalidate delivery approval and executor before I/O',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=artifact_version+1 WHERE tenant_id=$1 AND space_id=$2 AND target=$3',[f.tenant,f.space,p.target]);const before=await metrics();await assert.rejects(results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId));await assert.rejects(p.activities.dispatchEffect(p.ref));assert.deepEqual(await metrics(),before);
});
test('RESULT/expired approved delivery cannot bind, dispatch or complete',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s,{expiry:new Date(Date.now()+1500).toISOString()}),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await waitUntil(async()=>Date.now()>Date.parse(p.effect.binding.expiresAt),'approved delivery expires');const before=await metrics();await assert.rejects(results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId));await assert.rejects(p.activities.dispatchEffect(p.ref));await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'succeeded',id)));assert.deepEqual(await metrics(),before);
});
test('RESULT/notification hint or foreign Space cannot authorize result bytes',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,'verifying');await results.finish(await f.scopeFor(1),s.runId,1,outcome(s));await assert.rejects(results.get(await f.scopeFor(1,f.source),s.runId));const old=await f.scopeFor(1);await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:write'])]);try{await assert.rejects(results.get(old,s.runId));await assert.rejects(results.get(await f.scopeFor(1),s.runId));}finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
});
test('RESULT/final current audience revocation blocks retrieval without erasing authorized Task outcome',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,'verifying');const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s));await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[2]]);try{await assert.rejects(results.get(await f.scopeFor(1),s.runId));assert.equal((await f.admin.query('SELECT record FROM fabric.recovery_attempt_outcomes WHERE run_id=$1',[s.runId])).rows[0].record.resultDigest,o.resultDigest);}finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[2]]);}
});
test('RESULT/failed outcome clears actual input wait while preserving wait-era artifact evidence',async()=>{
 const s=await seed();await draft(s,'partial evidence while waiting');const scope=await f.scopeFor(1),snapshot=await f.repo.get(scope,s.runId);assert.ok(snapshot);const run=runSchema.parse({...snapshot.run,revision:snapshot.run.revision+1,state:'waiting',wait:{reason:'input',ownerId:scope.actorId,since:new Date().toISOString(),expiresAt:new Date(Date.now()+30000).toISOString(),nextAction:'clarify'}}),cp={run,session:snapshot.sessions[0]!,result:null};await f.repo.checkpoint(scope,f.mutation(s.runId,snapshot.run.revision,cp),cp);const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'failed')),restored=await results.get(await f.scopeFor(1),s.runId);assert.equal(o.status,'failed');assert.equal(restored.run.state,'failed');assert.equal(restored.run.wait,null);assert.equal(restored.artifacts[0]?.bytes,'partial evidence while waiting');
});
test('RESULT/later separately authorized publication preserves already successful draft Task and original attempt outcome',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,'verifying');const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s));const scope=await f.scopeFor(1),next=await f.seedRun(scope,{taskId:s.taskId,attempt:2,cancellationGeneration:0});await f.repo.initialize(scope,next.init,next.value);await transition(next.runId,'running');const successor={...s,...next,artifactId:s.artifactId,bytes:s.bytes},p=await prepared(successor),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),next.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);const before=await metrics();await p.activities.dispatchEffect(p.ref);assert.equal((await p.activities.reconcileEffect(p.ref)).status,'confirmed');assert.equal((await results.refreshDelivery(await f.scopeFor(1),id)).state,'confirmed');const original=await results.get(await f.scopeFor(1),s.runId),later=await results.get(await f.scopeFor(1),next.runId);assert.deepEqual(original.outcome,o);assert.equal(original.task.state,'succeeded');assert.equal(original.task.currentRunId,s.runId);assert.equal(original.run.state,'succeeded');assert.equal(later.outcome,null);assert.equal(later.deliveries[0]?.state,'confirmed');assert.ok(later.artifacts.some(a=>a.artifact.artifactId===s.artifactId&&a.bytes===s.bytes));assert.equal((await metrics()).writes,before.writes+1);
 console.log(JSON.stringify({measurement:'draft-success-later-publication',taskId:s.taskId,successfulRunId:s.runId,deliveryRunId:next.runId,deliveryId:id,originalOutcomeDigest:o.resultDigest,originalTaskState:original.task.state,externalWrites:1}));
});
test('RESULT/current collaborating task writer can complete verified result without impersonating executor or sending notification',async()=>{
 const s=await seed();const a=await checked(s);await transition(s.runId,'verifying');const collaborator=await f.scopeFor(2),o=await results.finish(collaborator,s.runId,1,outcome(s));assert.equal(o.status,'succeeded');assert.deepEqual(o.checks,a.checks);assert.ok(o.checks.every(check=>check.verifierId===f.actors[1]));const rows=(await f.admin.query('SELECT record FROM fabric.recovery_notifications WHERE run_id=$1',[s.runId])).rows;assert.equal(rows.length,s.config.audience.recipientActorIds.length);assert.ok(rows.every(row=>row.record.state==='pending'));assert.equal((await results.get(await f.scopeFor(2),s.runId)).outcome?.resultDigest,o.resultDigest);
});
test('RESULT/actual Stop fences stale outcome proposal then current cancellation records retrievable draft evidence',async()=>{
 const s=await seed();await draft(s,'partial bytes before online Stop');const scope=await f.scopeFor(1),c={task:s.value.run.binding.task,runId:s.runId,commandId:randomUUID(),idempotencyKey:randomUUID(),expiresAt:new Date(Date.now()+30000).toISOString(),kind:'stop-run' as const,resourceId:null,expectedResourceGeneration:null,observationId:null,baseDigest:null,leaseExpiresAt:null};const receipt=await new FenceRepository(f.repo).execute(scope,c);assert.equal(receipt.dispatch,'fenced');assert.equal(receipt.termination,'pending');assert.equal(receipt.generation,2);assert.deepEqual(receipt.unknownEffects,[]);await assert.rejects(results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'cancelled')));const o=await results.finish(await f.scopeFor(1),s.runId,receipt.generation,outcome(s,'cancelled')),restored=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(await f.scopeFor(1),s.runId);assert.equal(o.status,'cancelled');assert.equal(restored.run.state,'cancelled');assert.equal(restored.task.state,'cancelled');assert.equal(restored.artifacts[0]?.bytes,'partial bytes before online Stop');assert.equal(restored.run.generation.worker,2);assert.deepEqual(await results.finish(await f.scopeFor(1),s.runId,2,outcome(s,'cancelled')),o);
 console.log(JSON.stringify({measurement:'result-after-current-stop',runId:s.runId,generation:receipt.generation,dispatch:receipt.dispatch,termination:receipt.termination,outcomeDigest:o.resultDigest,preservedArtifact:true,staleFinishRejected:true}));
});
test('RESULT/result verifier rechecks execution lease after an observed artifact SQL lock and rolls back expired checks',async()=>{
 const s=await seed();await draft(s);const deadline=new Date(Date.now()+1500).toISOString();await f.admin.query("UPDATE fabric.recovery_leases SET record=jsonb_set(record,'{expiresAt}',to_jsonb($2::text)) WHERE run_id=$1",[s.runId,deadline]);const blocker=await f.admin.connect();await blocker.query('BEGIN');await blocker.query('SELECT artifact_id FROM fabric.recovery_artifact_versions WHERE artifact_id=$1 FOR UPDATE',[s.artifactId]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),work=results.verify(await f.scopeFor(1),s.runId,1,s.artifactId,1).then(value=>({value,error:null}),error=>({value:null,error}));
 try{await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE query LIKE 'SELECT binding,record FROM fabric.recovery_artifact_versions%' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount!>0,'actual verifier waits after initial execution lease gate');await waitUntil(async()=>Date.now()>Date.parse(deadline),'execution lease expires under observed verifier lock');await blocker.query('COMMIT');const finished=await work;assert.ok(finished.error,'Expired post-gate verifier must roll back');assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_check_receipts WHERE artifact_id=$1',[s.artifactId])).rowCount,0);const artifact=(await results.get(await f.scopeFor(1),s.runId)).artifacts[0]!;assert.equal(artifact.artifact.verification,'unchecked');assert.deepEqual(artifact.checks,[]);
 console.log(JSON.stringify({measurement:'result-verifier-lease-expired-under-observed-lock',runId:s.runId,actualSqlLockObserved:true,leaseExpiresAt:deadline,committedReceipts:0,verification:artifact.artifact.verification}));
 }finally{await blocker.query('ROLLBACK');blocker.release();await work;}
});
test('RESULT/complete migration sequence reruns after upgrade without changing schema, ledgers or durable result data',async()=>{
 const s=await seed();await checked(s);await transition(s.runId,'verifying');const o=await results.finish(await f.scopeFor(1),s.runId,1,outcome(s));
 const sequence=async()=>{
  await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
  await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
  await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
  await migrateFences(f.admin,resolve('migrations/0007_fences.sql'));
  await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));
  await migrateResults(f.admin,resolve('migrations/0009_results.sql'));
  await migrateResourceReconciliation(f.admin,resolve('migrations/0010_resource_reconciliation.sql'));
 };
 await migrateResourceReconciliation(f.admin,resolve('migrations/0010_resource_reconciliation.sql'));
 const snapshot=async()=>{
  const ledgers=[];for(const ledger of ['foundation','identity','recovery'])ledgers.push((await f.admin.query('SELECT * FROM public.fabric_'+ledger+'_migrations ORDER BY version')).rows);
  const schema=(await f.admin.query(`SELECT c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
   (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid) AS attributes,
   (SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid) AS indexes,
   (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid) AS triggers,
   (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
   FROM pg_class c WHERE c.relnamespace='fabric'::regnamespace ORDER BY c.relname`)).rows;
  const functions=(await f.admin.query("SELECT p.oid,p.proname,p.proacl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='fabric'::regnamespace ORDER BY p.oid")).rows;
  const data=[];for(const table of schema.filter(r=>r.relkind==='r')){assert.match(table.relname,/^[a-z_]+$/);data.push({table:table.relname,rows:(await f.admin.query('SELECT to_jsonb(t) AS row FROM fabric.'+table.relname+' t ORDER BY to_jsonb(t)::text')).rows});}
  return {ledgers,schema,functions,data};
 };
 const before=await snapshot();assert.deepEqual(before.ledgers[2]!.map(r=>r.version),[4,5,6,7,8,9,10]);
 await sequence();await sequence();assert.deepEqual(await snapshot(),before);
 const restored=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(await f.scopeFor(1),s.runId);assert.deepEqual(restored.outcome,o);assert.equal(restored.task.state,'succeeded');assert.equal(restored.run.state,'succeeded');
 // Reject incompatible installed ledgers, never accept arbitrary additive versions/digests.
 for(const version of [4,5,6,7,8,9,10]){
  const digest=before.ledgers[2]!.find(r=>r.version===version)!.digest;
  await f.admin.query('UPDATE public.fabric_recovery_migrations SET digest=$2 WHERE version=$1',[version,'0'.repeat(64)]);
  try{await assert.rejects(sequence(),/incompatible/);}finally{await f.admin.query('UPDATE public.fabric_recovery_migrations SET digest=$2 WHERE version=$1',[version,digest]);}
  assert.deepEqual(await snapshot(),before);
 }
 await f.admin.query('INSERT INTO public.fabric_recovery_migrations(version,digest) VALUES(11,$1)',['0'.repeat(64)]);
 try{await assert.rejects(sequence(),/incompatible/);}finally{await f.admin.query('DELETE FROM public.fabric_recovery_migrations WHERE version=11');}
 const base=before.ledgers[2]!.find(r=>r.version===4)!;await f.admin.query('DELETE FROM public.fabric_recovery_migrations WHERE version=4');
 try{await assert.rejects(sequence(),/incompatible/);}finally{await f.admin.query('INSERT INTO public.fabric_recovery_migrations(version,digest,applied_at) VALUES(4,$1,$2)',[base.digest,base.applied_at]);}
 assert.deepEqual(await snapshot(),before);
 const changed=resolve(directory,'changed-base.sql');await writeFile(changed,(await readFile(resolve('migrations/0004_recovery.sql'),'utf8'))+'\n-- incompatible base\n');await assert.rejects(migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:changed}),/incompatible/);assert.deepEqual(await snapshot(),before);
 console.log(JSON.stringify({measurement:'full-profile-migration-rerun',versions:[4,5,6,7,8,9,10],completeReruns:2,schemaUnchanged:true,allDataUnchanged:true,allAppliedAtUnchanged:true,recreatedResultDigest:o.resultDigest,incompatibleInstalledDigestsRejected:7,unknownVersionRejected:true,missingBaseRejected:true}));
});
test('RESULT/already linked exact approved delivery cannot dispatch old bytes after actual new draft version',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);assert.equal((await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId)).state,'in-progress');await results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified changed after linked delivery');const before=await metrics();await assert.rejects(p.activities.dispatchEffect(p.ref));assert.deepEqual(await metrics(),before);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_effect_events WHERE operation_id=$1',[p.ref.operationId])).rowCount,0);assert.equal((await results.get(await f.scopeFor(1),s.runId)).outcome,null);
 console.log(JSON.stringify({measurement:'linked-delivery-changed-artifact-executor-refusal',runId:s.runId,deliveryId:id,operationId:p.ref.operationId,oldArtifactVersion:1,currentArtifactVersion:2,externalPosts:0,externalWrites:0,dispatchClaims:0}));
});
test('RESULT/durable unknown claim fences new draft and changed target refuses actual dispatch and settlement without hiding uncertainty',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);assert.equal(await new EffectRepository(f.repo).claim(await f.scopeFor(1),p.ref.operationId,1),true);await assert.rejects(results.saveDraft(await f.scopeFor(1),s.runId,1,s.artifactId,2,null,'verified changed between durable claim and I/O'),/resource uncertainty or external effects/);await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=2 WHERE tenant_id=$1 AND space_id=$2 AND target=$3',[f.tenant,f.space,p.target]);const before=await metrics();await assert.rejects(p.activities.dispatchEffect(p.ref));await assert.rejects(p.activities.reconcileEffect(p.ref));await assert.rejects(results.refreshDelivery(await f.scopeFor(1),id));assert.deepEqual(await metrics(),before);const snapshot=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snapshot?.effects[0]?.state,'unknown');assert.equal(snapshot?.effects[0]?.nextAction,'lookup-original-operation');assert.equal(snapshot?.run.state,'reconciling');assert.equal((await results.get(await f.scopeFor(1),s.runId)).outcome,null);
 console.log(JSON.stringify({measurement:'claimed-delivery-changed-artifact-no-io',runId:s.runId,deliveryId:id,operationId:p.ref.operationId,state:snapshot?.effects[0]?.state,externalPosts:0,externalLookups:0,externalWrites:0}));
});
test('RESULT/direct executor refuses genuine prior-attempt check receipts after new environment and lock pins',async()=>{
 const s=await seed('publish');await checked(s);await results.finish(await f.scopeFor(1),s.runId,1,outcome(s,'failed'));const scope=await f.scopeFor(1),next=await f.seedRun(scope,{taskId:s.taskId,attempt:2,cancellationGeneration:0}),binding={...next.value.run.binding,environmentDigest:bindingDigest('different actual runtime environment'),dependencyLockDigest:bindingDigest('different actual dependency lock')},value={run:{...next.value.run,binding},session:{...next.value.session,binding},lease:{...next.value.lease,binding}};await f.repo.initialize(scope,f.mutation(next.runId,0,value),value);await transition(next.runId,'running');await results.configure(scope,next.runId,s.config);const successor={...s,...next,value,artifactId:s.artifactId,bytes:s.bytes},p=await prepared(successor),before=await metrics();await assert.rejects(results.requestDelivery(await f.scopeFor(1),next.runId,1,randomUUID(),s.artifactId,1,p.target));await assert.rejects(p.activities.dispatchEffect(p.ref));assert.deepEqual(await metrics(),before);assert.equal((await f.repo.get(await f.scopeFor(1),next.runId))?.effects[0]?.state,'prepared');assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_effect_events WHERE operation_id=$1',[p.ref.operationId])).rowCount,0);const preserved=await results.get(await f.scopeFor(1),s.runId);assert.equal(preserved.outcome?.status,'failed');assert.equal(preserved.artifacts.find(a=>a.artifact.artifactId===s.artifactId)?.checks[0]?.environmentDigest,s.value.run.binding.environmentDigest);
 console.log(JSON.stringify({measurement:'stale-environment-receipt-executor-refusal',taskId:s.taskId,oldRunId:s.runId,newRunId:next.runId,operationId:p.ref.operationId,oldEnvironmentDigest:s.value.run.binding.environmentDigest,newEnvironmentDigest:binding.environmentDigest,externalPosts:0,externalWrites:0,dispatchClaims:0}));
});
test('RESULT/revoked real approver session after delivery binding blocks executor before any POST',async()=>{
 const s=await seed('publish');await checked(s);const p=await prepared(s),id=randomUUID();await results.requestDelivery(await f.scopeFor(1),s.runId,1,id,s.artifactId,1,p.target);await results.bindDelivery(await f.scopeFor(1),id,p.ref.operationId);await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2',[f.endpoints.issuer,f.actors[2]]);const before=await metrics();await assert.rejects(p.activities.dispatchEffect(p.ref));await assert.rejects(results.refreshDelivery(await f.scopeFor(1),id));assert.deepEqual(await metrics(),before);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_effect_events WHERE operation_id=$1',[p.ref.operationId])).rowCount,0);assert.equal((await results.get(await f.scopeFor(1),s.runId)).outcome,null);
 console.log(JSON.stringify({measurement:'linked-delivery-revoked-approver-executor-refusal',runId:s.runId,deliveryId:id,operationId:p.ref.operationId,approverActorId:f.actors[2],externalPosts:0,externalWrites:0,dispatchClaims:0}));
});
