import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm,open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {createRecoveryFixture} from './pg-fixture.js';
import {census,freePort,launchOwned,stopOwned,waitUntil,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {migrateEffectHistory} from '../src/effect-migration.js';
import {migrateFences} from '../src/fence-migration.js';
import {migrateResourceReconciliation} from '../src/resource-reconciliation-migration.js';
import {FenceRepository,type ResourceMutation,type ResourceResolution} from '../src/fence-repository.js';
import {createFenceHttpService} from '../src/fence-http.js';
import {bindingDigest,runSchema,type Generation} from '../src/contracts.js';
import {RecoveryRepository} from '../src/repository.js';
import {AuthenticatedUnitOfWork} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {EffectRepository} from '../src/effect-repository.js';
import {effectSchema,type Effect} from '../src/contracts.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import {audienceDigest,type AudienceRow} from '../../g1-identity/src/audience.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import {createEffectActivities} from '../src/effect-activities.js';
import {migrateDispatch} from '../src/dispatch-migration.js';
import {migrateResults} from '../src/result-migration.js';
import {DispatchRepository,type Schedule} from '../src/dispatch-repository.js';
import {ResultRepository} from '../src/result-repository.js';
import {NotificationRepository,notificationId} from '../src/notification-repository.js';
import {createNativeActivities} from '../src/native-activities.js';
let f:Awaited<ReturnType<typeof createRecoveryFixture>>,fences:FenceRepository,http:Awaited<ReturnType<typeof createFenceHttpService>>,directory:string;
const owner=randomUUID(),children:OwnedChild[]=[],resourceFiles=new Map<string,string>(),resourceChildren=new Map<string,OwnedChild>(),failedQuiescence=new Set<string>();
const observer={quiesce:async(resourceId:string)=>{if(failedQuiescence.has(resourceId))return false;const child=resourceChildren.get(resourceId);if(child){await stopOwned(child);assert.equal(census().some(row=>row.pid===child.pid),false);}return true;},observeBase:async(resourceId:string)=>{const path=resourceFiles.get(resourceId);assert.ok(path,'Owned filesystem resource required');return bindingDigest(await readFile(path,'utf8'));}};
function resourceFile(s:{resourceId:string}){const path=resourceFiles.get(s.resourceId);assert.ok(path);return path;}
before(async()=>{
 census();f=await createRecoveryFixture();
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
 await migrateFences(f.admin,resolve('migrations/0007_fences.sql'));
 await migrateResourceReconciliation(f.admin,resolve('migrations/0010_resource_reconciliation.sql'));
 fences=new FenceRepository(f.repo,observer);
 http=await createFenceHttpService({fences,verify:async(credential,tenantId,spaceId)=>{assert.equal(tenantId,f.tenant);const index=f.tokens.indexOf(credential);if(index<0)throw new Error('Invalid credential');if(spaceId!==f.space&&spaceId!==f.source)throw new Error('Foreign Space');return f.scopeFor(index,spaceId===f.space?f.space:f.source);}});
 directory=await mkdtemp(resolve(tmpdir(),'fabric-fences-'+owner+'-'));await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});
});
after(async()=>{
 const errors:unknown[]=[];for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await http?.close();}catch(e){errors.push(e);}try{await f?.close();}catch(e){errors.push(e);}
 try{if(directory){assert.equal(await readFile(resolve(directory,'owner'),'utf8'),owner);await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'owned-fence-files-cleanup',owner,removed:true}));}}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory fence fixture cleanup');
});
async function seed(resourceId=randomUUID()){
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);await f.repo.initialize(scope,s.init,s.value);
 const run=runSchema.parse({...s.value.run,state:'running',revision:2}),cp={run,session:s.value.session,result:null};await f.repo.checkpoint(scope,f.mutation(s.runId,1,cp),cp);
 if(!resourceFiles.has(resourceId)){const path=resolve(directory,'resource-'+resourceId);await writeFile(path,'resource-base');resourceFiles.set(resourceId,path);}
 await fences.enroll(scope,{runId:s.runId,resourceId});return {...s,resourceId,generation:run.generation};
}
type Seed=Awaited<ReturnType<typeof seed>>;
type Command=Parameters<FenceRepository['execute']>[1];
function command(s:Seed,kind:Command['kind']='stop-run',overrides:Partial<Command>={}):Command{
 return {task:s.value.run.binding.task,runId:kind==='stop-task'||kind==='retry-task'?null:s.runId,commandId:randomUUID(),idempotencyKey:randomUUID(),expiresAt:new Date(Date.now()+60000).toISOString(),kind,resourceId:kind==='stop-run'||kind==='stop-task'||kind==='retry-task'?null:s.resourceId,expectedResourceGeneration:null,observationId:null,baseDigest:null,leaseExpiresAt:null,...overrides};
}
async function post(c:Command,index=1){return fetch(http.endpoint+'/commands',{method:'POST',headers:{authorization:'Bearer '+f.tokens[index],'content-type':'application/json'},body:JSON.stringify(c)});}
async function accepted(c:Command,index=1){const response=await post(c,index);assert.equal(response.status,200,await response.clone().text());return await response.json() as Awaited<ReturnType<FenceRepository['execute']>>;}
function offered<P extends Parameters<FenceRepository['mutateResource']>[1]['path']='filesystem'>(s:Seed,path:P='filesystem' as P,generation:Generation=s.generation){return {runId:s.runId,resourceId:s.resourceId,generation,path,operationId:randomUUID()};}
async function take(s:Seed,expiry=new Date(Date.now()+60000).toISOString()){
 const state=await fences.state(await f.scopeFor(1),s.resourceId);return accepted(command(s,'take-control',{expectedResourceGeneration:state.generation,leaseExpiresAt:expiry}));
}
function ref(s:Seed){return {tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.value.session.sessionId,bindingDigest:bindingDigest(s.value.run.binding)};}
test('FENCE/online stale progress Stop advances current generation once and duplicate taps have stable immutable receipt',async()=>{
 const s=await seed(),old=await f.repo.get(await f.scopeFor(1),s.runId),c=command(s);
 // A committed native turn advances progress after the client captured its old view.
 await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:()=>{}}).nativeTurn(ref(s),1);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.revision,old!.run.revision+1);
 const results=await Promise.all(Array.from({length:12},()=>accepted(c)));for(const r of results)assert.deepEqual(r,results[0]);
 const r=results[0]!;assert.equal(r.accepted,true);assert.equal(r.dispatch,'fenced');assert.equal(r.termination,'pending');assert.equal(r.observedResourceQuiescence,false);assert.deepEqual(r.affectedRuns,[s.runId]);
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snap?.run.generation.worker,old!.run.generation.worker+1);assert.equal(snap?.run.state,'cancelling');assert.ok(snap?.leases[0]?.revokedAt);
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.deepEqual(await restored.execute(await f.scopeFor(1),c),r);
 const changed=await post({...c,runId:randomUUID()});assert.ok(changed.status>=400);assert.deepEqual(await accepted(c),r);
 console.log(JSON.stringify({measurement:'online-stop-dedup',runId:s.runId,concurrentTaps:12,oldWorker:old!.run.generation.worker,newWorker:snap!.run.generation.worker,dispatch:r.dispatch,termination:r.termination}));
});
test('FENCE/distinct concurrent Stops cannot lose monotonic generation updates',async()=>{
 const s=await seed(),rs=await Promise.all([accepted(command(s)),accepted(command(s))]);assert.equal(new Set(rs.map(r=>r.commandId)).size,2);
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snap?.run.generation.worker,3);assert.equal(snap?.run.state,'cancelling');
});
test('FENCE/Stop-run leaves another attempt of its task executing',async()=>{
 const s=await seed(),other=await f.seedRun(await f.scopeFor(1),{taskId:s.taskId,attempt:2,cancellationGeneration:0}),v=other.value;
 await f.repo.initialize(await f.scopeFor(1),other.init,v);
 await accepted(command(s));assert.equal((await f.repo.get(await f.scopeFor(1),other.runId))?.run.generation.worker,1);
 let calls=0;await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')calls++;}}).nativeTurn({...ref(s),runId:other.runId,sessionId:v.session.sessionId,bindingDigest:bindingDigest(v.run.binding)},1);assert.equal(calls,1);
});
test('FENCE/Stop-task blocks new attempts until explicit authenticated retry and never revives old attempt',async()=>{
 const s=await seed();await accepted(command(s,'stop-task'));
 const other=await f.seedRun(await f.scopeFor(1),{taskId:s.taskId,attempt:2,cancellationGeneration:1}),v=other.value,m=other.init;
 await assert.rejects(f.repo.initialize(await f.scopeFor(1),m,v));await accepted(command(s,'retry-task'));await f.repo.initialize(await f.scopeFor(1),m,v);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.state,'cancelling');assert.equal((await f.repo.get(await f.scopeFor(1),other.runId))?.run.state,'preparing');
});
test('FENCE/revoked Stop actor and cross-Space immutable target fail without fencing',async()=>{
 const s=await seed(),scope=await f.scopeFor(1);
 await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 try{assert.ok((await post(command(s))).status>=400);await assert.rejects(fences.execute(scope,command(s)));assert.equal((await f.repo.get(await f.scopeFor(0),s.runId))?.run.generation.worker,1);}finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
 const cross=command(s,'stop-run',{task:{...s.value.run.binding.task,spaceId:f.source}});assert.ok((await post(cross)).status>=400);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.generation.worker,1);
});
test('FENCE/Stop rejects queued resource write, old model publication, checkpoint and worker replacement',async()=>{
 const s=await seed(),old=await f.repo.get(await f.scopeFor(1),s.runId);await accepted(command(s));let calls=0;
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{calls++;return null;}));
 await assert.rejects(createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')calls++;}}).nativeTurn(ref(s),1));
 const cp={run:{...old!.run,revision:old!.run.revision+1},session:old!.sessions[0]!,result:null};await assert.rejects(f.repo.checkpoint(await f.scopeFor(1),f.mutation(s.runId,old!.run.revision,cp),cp));
 const replacement={sessionId:s.value.session.sessionId,previousWorker:1,nextWorker:2};await assert.rejects(f.repo.replaceWorker(await f.scopeFor(1),f.mutation(s.runId,old!.run.revision,replacement),replacement));assert.equal(calls,0);
});
function deferred<T=void>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
async function observedWait(label:string){await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")).rowCount!>0,label);}
for(const path of ['api','sdk','shell','filesystem'] as const)test('FENCE/actual '+path+' adapter mutation completes, then Stop fences every queued repeat',async()=>{
 const s=await seed(),file=resolve(directory,path+'-'+randomUUID()),scope=await f.scopeFor(1);let writes=0;
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));await writeFile(file,Buffer.concat(chunks));writes++;res.end('committed');});
 let endpoint='';
 if(path==='api'||path==='sdk'){await new Promise<void>(res=>server.listen(0,'127.0.0.1',res));const a=server.address();assert.ok(a&&typeof a!=='string');endpoint='http://127.0.0.1:'+a.port;}
 async function io(){
  if(path==='api'||path==='sdk'){const request=()=>fetch(endpoint,{method:'POST',body:'mutation-'+path});const response=await request();assert.equal(response.status,200);await response.text();}
  else if(path==='filesystem'){await writeFile(file,'mutation-'+path);writes++;}
  else {const marker='--fixture-owner='+owner,child=launchOwned(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],'mutation-shell');console.log('committed')",file,marker],marker,{PATH:process.env.PATH??''});children.push(child);await waitUntil(async()=>child.child.exitCode!==null,'actual shell child mutation');assert.equal(child.child.exitCode,0);assert.equal(child.output().trim(),'committed');writes++;}
  return bindingDigest(await readFile(file,'utf8'));
 }
 try{
  await fences.mutateResource(scope,offered(s,path),io);assert.equal(await readFile(file,'utf8'),'mutation-'+path);assert.equal(writes,1);
  const stopped=await accepted(command(s));assert.equal(stopped.dispatch,'fenced');await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s,path),io));assert.equal(writes,1);assert.equal(await readFile(file,'utf8'),'mutation-'+path);
  console.log(JSON.stringify({measurement:'actual-mutation-adapter-fenced',path,resourceId:s.resourceId,writes:1,postStopWrites:0,productionAdapter:false}));
 }finally{if(server.listening)await new Promise<void>((res,rej)=>server.close(e=>e?rej(e):res()));}
});
for(const path of ['browser','gui'] as const)test('FENCE/unavailable '+path+' mutation path fails closed before callback',async()=>{
 const s=await seed();let writes=0;await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s,path),async()=>{writes++;}));assert.equal(writes,0);
});
test('FENCE/dispatch-first race: Stop waits for observed mutation barrier and reports acceptance separately from termination',async()=>{
 const s=await seed(),scope=await f.scopeFor(1),entered=deferred(),release=deferred(),file=resolve(directory,'dispatch-first-'+randomUUID());
 const mutation=fences.mutateResource(scope,offered(s),async()=>{entered.resolve();await release.promise;await writeFile(file,'committed-before-stop');return 'written';});await entered.promise;
 let acknowledged=false;const stopped=accepted(command(s)).then(r=>{acknowledged=true;return r;});
 try{await observedWait('actual Stop blocked behind current resource mutation');assert.equal(acknowledged,false);release.resolve();assert.equal(await mutation,'written');const receipt=await stopped;assert.equal(receipt.dispatch,'fenced');assert.equal(receipt.termination,'pending');assert.equal(await readFile(file,'utf8'),'committed-before-stop');
  let writes=0;await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{writes++;}));assert.equal(writes,0);
  console.log(JSON.stringify({measurement:'stop-dispatch-order',order:'dispatch-first',observedDatabaseWait:true,committedWrites:1,postStopWrites:0,termination:receipt.termination}));
 }finally{release.resolve();await Promise.allSettled([mutation,stopped]);}
});
test('FENCE/Stop-first race: queued mutation released after authenticated acknowledgement never submits I/O',async()=>{
 const s=await seed(),queued=deferred(),ready=deferred(),file=resolve(directory,'stop-first-'+randomUUID());let writes=0;
 const mutation=(async()=>{ready.resolve();await queued.promise;return fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{writes++;await writeFile(file,'unsafe');});})();await ready.promise;
 const receipt=await accepted(command(s));queued.resolve();await assert.rejects(mutation);assert.equal(writes,0);await assert.rejects(readFile(file),{code:'ENOENT'});
 console.log(JSON.stringify({measurement:'stop-dispatch-order',order:'stop-first',queuedBeforeStop:true,dispatch:receipt.dispatch,submittedWrites:0}));
});
test('FENCE/takeover shared-resource barrier drains active write before human lease and invalidates both runs',async()=>{
 const s=await seed(),other=await seed(s.resourceId),entered=deferred(),release=deferred();
 const mutation=fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{entered.resolve();await release.promise;return 'drained';});await entered.promise;
 let granted=false;const takeover=take(s).then(r=>{granted=true;return r;});
 try{await observedWait('actual takeover blocks on active resource callback');assert.equal(granted,false);release.resolve();assert.equal(await mutation,'drained');const receipt=await takeover;assert.ok(receipt.humanLeaseId);assert.deepEqual(new Set(receipt.affectedRuns),new Set([s.runId,other.runId]));
  const state=await fences.state(await f.scopeFor(1),s.resourceId);assert.equal(state.mode,'human');assert.equal(state.holderId,f.actors[1]);assert.equal(state.generation,1);
  for(const run of [s,other]){let writes=0;await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(run),async()=>{writes++;}));assert.equal(writes,0);const snap=await f.repo.get(await f.scopeFor(1),run.runId);assert.equal(snap?.run.state,'paused');assert.equal(snap?.run.generation.resource,1);}
  const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.deepEqual(await restored.state(await f.scopeFor(1),s.resourceId),state);
  console.log(JSON.stringify({measurement:'observed-human-resource-barrier',resourceId:s.resourceId,affectedRuns:receipt.affectedRuns,issuedAfterDrain:true,generation:state.generation}));
 }finally{release.resolve();await Promise.allSettled([mutation,takeover]);}
});
test('FENCE/unknown submitted local write survives recreation, appears in Stop and prohibits automatic return',async()=>{
 const s=await seed(),op=offered(s),file=resourceFile(s);
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(file,'external-success-ack-lost');throw new Error('lost actual local ACK');}));assert.equal(await readFile(file,'utf8'),'external-success-ack-lost');
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor)),receipt=await restored.execute(await f.scopeFor(1),command(s));assert.ok(receipt.unknownEffects.includes(op.operationId));assert.equal(receipt.termination,'pending');
 const t=await take(s),observationId=randomUUID(),baseDigest=bindingDigest(await readFile(file,'utf8'));await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});
 const state=await fences.state(await f.scopeFor(1),s.resourceId);await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest})));assert.ok(t.humanLeaseId);
 console.log(JSON.stringify({measurement:'stop-unknown-effect-visible',operationId:op.operationId,unknownEffects:receipt.unknownEffects,externalWrites:1,blindRetries:0}));
});
test('FENCE/Stop acceptance does not falsely assert real process termination',async()=>{
 const s=await seed(),marker='--fixture-owner='+owner,file=resolve(directory,'process-'+randomUUID());let child:OwnedChild|undefined;
 await fences.mutateResource(await f.scopeFor(1),offered(s,'shell'),async()=>{child=launchOwned(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],'child-write');console.log('ready');setInterval(()=>{},1000)",file,marker],marker,{PATH:process.env.PATH??''});children.push(child);await waitUntil(async()=>child!.output().includes('ready'),'actual mutable child readiness');return child.pid;});
 assert.ok(child);const observed=child;assert.ok(census().find(p=>p.pid===observed.pid)?.command.includes(marker));const receipt=await accepted(command(s));assert.equal(receipt.termination,'pending');assert.equal(child.child.exitCode,null);assert.equal(child.child.signalCode,null);assert.equal(await readFile(file,'utf8'),'child-write');
 await stopOwned(child);assert.equal(census().some(p=>p.pid===child!.pid),false);console.log(JSON.stringify({measurement:'stop-versus-observed-termination',pid:child.pid,accepted:receipt.accepted,dispatch:receipt.dispatch,receiptTermination:receipt.termination,observedTermination:true}));
});
test('FENCE/return requires fresh observed reconciled base and then only new generations can mutate',async()=>{
 const s=await seed(),file=resourceFile(s);await writeFile(file,'base1');await take(s);let state=await fences.state(await f.scopeFor(1),s.resourceId);
 await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation})));
 const observationId=randomUUID(),baseDigest=bindingDigest(await readFile(file,'utf8'));await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});
 await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest:bindingDigest('changed')})));
 await assert.rejects(fences.execute(await f.scopeFor(0),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest})));
 await writeFile(file,'human-edited-after-observation');await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest})));
 const newObservationId=randomUUID(),newBaseDigest=bindingDigest(await readFile(file,'utf8'));await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId:newObservationId,baseDigest:newBaseDigest});
 await accepted(command(s,'return-control',{expectedResourceGeneration:state.generation,observationId:newObservationId,baseDigest:newBaseDigest}));state=await fences.state(await f.scopeFor(1),s.resourceId);assert.equal(state.mode,'agent');
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snap?.run.state,'running');let writes=0;
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{writes++;}));await fences.mutateResource(await f.scopeFor(1),offered(s,'filesystem',snap!.run.generation),async()=>{writes++;await writeFile(file,'agent2');});assert.equal(writes,1);assert.equal(await readFile(file,'utf8'),'agent2');
});
test('FENCE/disconnect and real human lease expiry remain paused after fresh repository and cannot auto-resume',async()=>{
 const s=await seed();await take(s);let state=await fences.state(await f.scopeFor(1),s.resourceId);await accepted(command(s,'disconnect',{expectedResourceGeneration:state.generation}));assert.equal((await fences.state(await f.scopeFor(1),s.resourceId)).mode,'paused');
 const expired=await seed();await take(expired,new Date(Date.now()+450).toISOString());await waitUntil(async()=>Date.now()>=Date.parse((await fences.state(await f.scopeFor(1),expired.resourceId)).leaseExpiresAt??'1970-01-01'),'actual human lease expiry');
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor));state=await restored.state(await f.scopeFor(1),expired.resourceId);assert.equal(state.mode,'paused');assert.equal((await f.repo.get(await f.scopeFor(1),expired.runId))?.run.state,'paused');let calls=0;
 await assert.rejects(restored.mutateResource(await f.scopeFor(1),offered(expired),async()=>{calls++;}));await assert.rejects(createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')calls++;}}).nativeTurn(ref(expired),1));assert.equal(calls,0);
});
async function approved(s:Seed,mutationPath:Effect['binding']['mutationPath']='api'){
 const scope=await f.scopeFor(1),run=(await f.repo.get(scope,s.runId))!.run,artifact='approved-local-bytes',argsDigest=bindingDigest({artifactDigest:bindingDigest(artifact)}),target='synthetic://'+randomUUID();
 await f.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,1,$4)',[f.tenant,f.space,target,argsDigest]);
 const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);
 const approval:ExactApprovalBinding={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:{sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)},limits:{maxOperations:1,maxCostMicrounits:30},expiresAt:new Date(Date.now()+60000).toISOString()};
 const approvals=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor}),a=await approvals.create(await f.scopeFor(0),{approvalId:randomUUID(),executorId:scope.actorId,binding:approval});await approvals.approve(await f.scopeFor(2),a.approvalId,a.bindingDigest);
 const effect=effectSchema.parse({binding:{run:run.binding,sessionId:s.value.session.sessionId,operationId:approval.operationId,target,resourceId:s.resourceId,action:approval.action,argsDigest,artifactId:randomUUID(),artifactVersion:1,artifactDigest:bindingDigest(artifact),actorId:scope.actorId,policyRevision:1,audienceDigest:approval.sourceAudience.revisionDigest,approvalId:a.approvalId,budgetReservationId:s.reservationId,executionLeaseId:s.value.lease.leaseId,generation:run.generation,expiresAt:approval.expiresAt,effectClass:'external-write',mutationPath,downstream:'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const payload={effect,approval,cost:20};await f.repo.prepareEffect(scope,f.mutation(s.runId,run.revision,payload),effect,approval,20);return effect;
}
test('FENCE/Stop closes existing exact-approved external effect claim and guarded HTTP dispatch paths',async()=>{
 const s=await seed(),effect=await approved(s),scope=await f.scopeFor(1),effects=new EffectRepository(f.repo);await accepted(command(s));let writes=0;
 await assert.rejects(effects.claim(scope,effect.binding.operationId,1));await assert.rejects(effects.guardedIO(scope,effect.binding.operationId,1,true,async()=>{writes++;return null;}));assert.equal(writes,0);
 const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snap?.effects[0]?.state,'cancelled');
});
test('FENCE/already submitted exact-approved HTTP effect reports uncertainty and cannot re-dispatch after Stop',async()=>{
 const s=await seed(),effect=await approved(s),scope=await f.scopeFor(1),effects=new EffectRepository(f.repo),file=resolve(directory,'effect-http-'+randomUUID());let writes=0;
 const externalCommitted=deferred(),releaseAck=deferred();let pendingWrite:Promise<void>|undefined,pendingStop:Promise<Awaited<ReturnType<typeof accepted>>>|undefined;
 const server=createServer(async(_req,res)=>{await writeFile(file,'approved-external-write');writes++;externalCommitted.resolve();await releaseAck.promise;res.end('ok');});await new Promise<void>(res=>server.listen(0,'127.0.0.1',res));const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  assert.equal(await effects.claim(scope,effect.binding.operationId,1),true);
  pendingWrite=effects.guardedIO(scope,effect.binding.operationId,1,true,async()=>{const response=await fetch('http://127.0.0.1:'+address.port,{method:'POST',body:'approved-external-write'});assert.equal(response.status,200);await response.text();});
  await externalCommitted.promise;assert.equal(writes,1);let stopAccepted=false;pendingStop=accepted(command(s)).then(receipt=>{stopAccepted=true;return receipt;});
  await observedWait('online Stop blocked behind real committed HTTP effect before ACK');assert.equal(stopAccepted,false);releaseAck.resolve();await pendingWrite;
  const receipt=await pendingStop;assert.ok(receipt.unknownEffects.includes(effect.binding.operationId));assert.equal(receipt.termination,'pending');await assert.rejects(effects.guardedIO(await f.scopeFor(1),effect.binding.operationId,1,true,async()=>{writes++;}));assert.equal(writes,1);
  assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'unknown');assert.equal(await readFile(file,'utf8'),'approved-external-write');
  console.log(JSON.stringify({measurement:'stop-inflight-exact-approved-effect',operationId:effect.binding.operationId,committedWrites:1,postStopWrites:0,unknownEffects:receipt.unknownEffects,termination:receipt.termination}));
 }finally{releaseAck.resolve();await Promise.allSettled([pendingWrite,pendingStop]);await new Promise<void>((res,rej)=>server.close(e=>e?rej(e):res()));}
});
test('FENCE/expired commands and stale takeover generation cannot issue fences or human leases',async()=>{
 const s=await seed();assert.ok((await post(command(s,'stop-run',{expiresAt:new Date(Date.now()-1000).toISOString()}))).status>=400);
 await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'take-control',{expectedResourceGeneration:999,leaseExpiresAt:new Date(Date.now()+60000).toISOString()})));
 assert.equal((await fences.state(await f.scopeFor(1),s.resourceId)).mode,'agent');assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.generation.worker,1);
});
test('FENCE/idempotency scope belongs to authenticated actor; spoofed actor and arbitrary unknown command fields fail',async()=>{
 const s=await seed(),c=command(s),one=await accepted(c,1),two=await accepted(c,0);assert.equal(one.commandId,two.commandId);assert.equal(two.generation,one.generation+1);assert.deepEqual(await accepted(c,1),one);assert.deepEqual(await accepted(c,0),two);
 const response=await fetch(http.endpoint+'/commands',{method:'POST',headers:{authorization:'Bearer '+f.tokens[1],'content-type':'application/json'},body:JSON.stringify({...command(s),actorId:f.actors[0],expectedRevision:0})});assert.ok(response.status>=400);
});
test('FENCE/return cannot resurrect an attempt explicitly Stopped during human takeover',async()=>{
 const s=await seed();await take(s);await accepted(command(s));const state=await fences.state(await f.scopeFor(1),s.resourceId),observationId=randomUUID(),baseDigest=bindingDigest(await readFile(resourceFile(s),'utf8'));await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});
 await accepted(command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest}));const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(snap?.run.state,'cancelling');assert.ok(snap?.leases[0]?.revokedAt);let writes=0;
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s,'filesystem',snap!.run.generation),async()=>{writes++;}));assert.equal(writes,0);
});
test('FENCE/old original-key native receipt cannot authorize duplicate publication after Stop',async()=>{
 const s=await seed();let calls=0;const a=createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')calls++;}});await a.nativeTurn(ref(s),1);assert.equal(calls,1);await accepted(command(s));await assert.rejects(a.nativeTurn(ref(s),1));assert.equal(calls,1);assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.value.session.sessionId)).length,1);
});
test('FENCE/submission COMMIT ACK loss has zero I/O and durable submitted uncertainty reported after recreation',async()=>{
 const s=await seed(),op=offered(s);let writes=0;
 const lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost durable resource submission ACK');}),bindingFor:f.bindingFor}),f.bindingFor));
 await assert.rejects(lost.mutateResource(await f.scopeFor(1),op,async()=>{writes++;}),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');assert.equal(writes,0);
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor)),receipt=await restored.execute(await f.scopeFor(1),command(s));assert.ok(receipt.submittedEffects.includes(op.operationId));assert.equal(receipt.termination,'pending');
 await assert.rejects(restored.mutateResource(await f.scopeFor(1),op,async()=>{writes++;}));assert.equal(writes,0);
 console.log(JSON.stringify({measurement:'stop-submission-ack-loss',operationId:op.operationId,submittedEffects:receipt.submittedEffects,ioCalls:0,termination:receipt.termination}));
});
test('FENCE/return rejects an actually expired observation and requires current authenticated authority',async()=>{
 const s=await seed();await take(s);const observationId=randomUUID(),baseDigest=bindingDigest(await readFile(resourceFile(s),'utf8'));await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});const state=await fences.state(await f.scopeFor(1),s.resourceId);
 await f.admin.query("UPDATE fabric.recovery_resource_controls SET record=jsonb_set(record,'{observedAt}',to_jsonb((clock_timestamp()-interval '31 seconds')::text)) WHERE resource_id=$1",[s.resourceId]);
 await assert.rejects(fences.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest})));assert.equal((await fences.state(await f.scopeFor(1),s.resourceId)).mode,'human');
 await fences.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});const stale=await f.scopeFor(1);
 await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 try{await assert.rejects(fences.execute(stale,command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest})));assert.ok((await post(command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest}))).status>=400);}finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
 assert.equal((await fences.state(await f.scopeFor(1),s.resourceId)).mode,'human');
});
test('FENCE/forced RLS, immutable receipts/events/enrollment and reciprocal durable command keys are enforced in PostgreSQL',async()=>{
 const s=await seed(),c=command(s);await accepted(c);
 const tables=['recovery_task_controls','recovery_resource_controls','recovery_run_resources','recovery_fence_receipts','recovery_fence_events','recovery_resource_mutations'];
 const security=(await f.admin.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=\'fabric\'::regnamespace AND relname=ANY($1::text[])',[tables])).rows;assert.equal(security.length,6);for(const row of security){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);await assert.rejects(f.worker.query('SELECT * FROM fabric.'+row.relname),/permission denied/);await assert.rejects(f.client.query('SELECT * FROM fabric.'+row.relname),/permission denied/);}
 await assert.rejects(f.admin.query('UPDATE fabric.recovery_fence_receipts SET receipt=receipt WHERE command_key=$1',[c.idempotencyKey]),/immutable/);
 await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_fence_events WHERE command_key=$1',[c.idempotencyKey]),/immutable/);
 await assert.rejects(f.admin.query('UPDATE fabric.recovery_run_resources SET resource_id=$2 WHERE run_id=$1',[s.runId,randomUUID()]),/immutable/);
 await assert.rejects(f.admin.query('INSERT INTO fabric.recovery_fence_receipts(tenant_id,space_id,actor_id,command_key,command_id,payload_digest,receipt,event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[f.tenant,f.space,f.actors[1],randomUUID(),randomUUID(),bindingDigest(c),'{}',randomUUID()]),/foreign key/);
 await assert.rejects(f.admin.query('INSERT INTO fabric.recovery_fence_events(tenant_id,space_id,actor_id,command_key,event_id,record) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.space,f.actors[1],randomUUID(),randomUUID(),'{}']),/foreign key/);
 assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_fence_receipts WHERE command_key=$1',[c.idempotencyKey])).rows[0].n,1);
});
test('FENCE/revocation wins while online Stop is observed waiting for current authority row lock',async()=>{
 const s=await seed(),lock=await f.admin.connect();let pending:Promise<Response>|undefined;
 try{
  await lock.query('BEGIN');await lock.query('SELECT actor_id FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 FOR UPDATE',[f.tenant,f.space,f.actors[1]]);
  const pid=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);pending=post(command(s));
  await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount!>0,'online Stop observed waiting for current authority');
  await lock.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);await lock.query('COMMIT');assert.ok((await pending).status>=400);
  assert.equal((await f.repo.get(await f.scopeFor(0),s.runId))?.run.generation.worker,1);console.log(JSON.stringify({measurement:'stop-current-authority-lock-race',runId:s.runId,observedWait:true,revocationWon:true,generationAdvanced:false}));
 }finally{await lock.query('ROLLBACK');lock.release();await pending?.catch(()=>{});await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
});
test('FENCE/command expiring after all durable writes rolls back Stop, receipt and event together',async()=>{
 const s=await seed(),c=command(s,'stop-run',{expiresAt:new Date(Date.now()+250).toISOString()});
 await f.admin.query(`CREATE FUNCTION fabric.fence_test_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.command_key='${c.idempotencyKey}' THEN PERFORM pg_sleep(0.35);END IF;RETURN NEW;END $$;CREATE TRIGGER fence_test_expiry AFTER INSERT ON fabric.recovery_fence_events FOR EACH ROW EXECUTE FUNCTION fabric.fence_test_expiry()`);
 try{const start=Date.now();assert.ok((await post(c)).status>=400);assert.ok(Date.now()-start>=300);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.generation.worker,1);for(const table of ['recovery_fence_receipts','recovery_fence_events'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.idempotencyKey])).rows[0].n,0);
  console.log(JSON.stringify({measurement:'stop-late-expiry-rollback',runId:s.runId,elapsedMs:Date.now()-start,generationAdvanced:false,receipts:0,events:0}));
 }finally{await f.admin.query('DROP TRIGGER fence_test_expiry ON fabric.recovery_fence_events;DROP FUNCTION fabric.fence_test_expiry()');}
});
test('FENCE/takeover requires observed driver quiescence and kills actual owned resource process before issuing human lease',async()=>{
 const s=await seed(),marker='--fixture-owner='+owner,file=resourceFile(s);let child:OwnedChild|undefined;
 await fences.mutateResource(await f.scopeFor(1),offered(s,'shell'),async()=>{child=launchOwned(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],'background-resource');console.log('ready');setInterval(()=>{},1000)",file,marker],marker,{PATH:process.env.PATH??''});children.push(child);resourceChildren.set(s.resourceId,child);await waitUntil(async()=>child!.output().includes('ready'),'resource child ready');return child.pid;});assert.ok(child);
 const receipt=await take(s);assert.ok(receipt.humanLeaseId);assert.equal(receipt.observedResourceQuiescence,true);assert.equal(receipt.termination,'pending');assert.equal(census().some(row=>row.pid===child!.pid),false);assert.ok(child.child.exitCode!==null||child.child.signalCode!==null);let writes=0;
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s,'filesystem'),async()=>{writes++;await writeFile(file,'unsafe-after-human');}));assert.equal(writes,0);assert.equal(await readFile(file,'utf8'),'background-resource');
 console.log(JSON.stringify({measurement:'human-lease-after-observed-process-quiescence',resourceId:s.resourceId,pid:child.pid,observedTermination:true,humanLeaseId:receipt.humanLeaseId,queuedWrites:0}));
});
test('FENCE/missing or unconfirmed quiescence observer refuses takeover without advancing generation or issuing lease',async()=>{
 const s=await seed(),plain=new FenceRepository(f.repo),c=command(s,'take-control',{expectedResourceGeneration:0,leaseExpiresAt:new Date(Date.now()+60000).toISOString()});await assert.rejects(plain.execute(await f.scopeFor(1),c));
 failedQuiescence.add(s.resourceId);try{await assert.rejects(fences.execute(await f.scopeFor(1),c));const state=await fences.state(await f.scopeFor(1),s.resourceId);assert.equal(state.mode,'agent');assert.equal(state.generation,0);assert.equal(state.leaseId,null);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.generation.worker,1);}finally{failedQuiescence.delete(s.resourceId);}
});
test('FENCE/lost actual Stop COMMIT ACK resolves through original-key online lookup with no generation replay',async()=>{
 const s=await seed(),c=command(s),lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost actual Stop receipt ACK');}),bindingFor:f.bindingFor}),f.bindingFor));
 await assert.rejects(lost.execute(await f.scopeFor(1),c),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor));const result=await restored.lookupCommand(await f.scopeFor(1),c);assert.equal(result.status,'committed');if(result.status!=='committed')throw new Error('Committed receipt required');
 assert.equal(result.receipt.dispatch,'fenced');assert.equal(result.receipt.termination,'pending');assert.equal(result.receipt.generation,2);
 const response=await fetch(http.endpoint+'/lookup',{method:'POST',headers:{authorization:'Bearer '+f.tokens[1],'content-type':'application/json'},body:JSON.stringify(c)});assert.equal(response.status,200);assert.deepEqual(await response.json(),result);
 assert.equal((await restored.lookupCommand(await f.scopeFor(1),command(s))).status,'absent-safe');await assert.rejects(restored.lookupCommand(await f.scopeFor(1),{...c,commandId:randomUUID()}));
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.generation.worker,2);for(const table of ['recovery_fence_receipts','recovery_fence_events'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.idempotencyKey])).rows[0].n,1);
 console.log(JSON.stringify({measurement:'stop-original-key-ack-recovery',commandId:c.commandId,idempotencyKey:c.idempotencyKey,lookupStatus:result.status,generation:result.receipt.generation,replayCalls:0}));
});
for(const path of ['sdk','shell','filesystem','browser','gui'] as const)test('FENCE/unavailable external '+path+' preparation refuses before consuming approval or recording effect',async()=>{
 const s=await seed();await assert.rejects(approved(s,path));
 assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_operations WHERE run_id=$1',[s.runId])).rows[0].n,0);
 const rows=(await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE binding->>\'runId\'=$1',[s.runId])).rows;assert.equal(rows.length,1);assert.equal(rows[0].state,'approved');assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.revision,2);
});
test('FENCE/unavailable native application resource path fails closed before local I/O',async()=>{
 const s=await seed();let writes=0;const invalid={...offered(s),path:'native'};await assert.rejects(fences.mutateResource(await f.scopeFor(1),invalid as never,async()=>{writes++;}));assert.equal(writes,0);
});
test('FENCE/completed native answer stays verifying and session finished across durable takeover and return',async()=>{
 const s=await seed();let calls=0;const native=(workerGeneration:number)=>createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration,measure:r=>{if(r.kind==='model')calls++;}});
 await native(1).nativeTurn(ref(s),1);await native(1).nativeTurn(ref(s),2);assert.equal(calls,2);
 const before=await f.repo.get(await f.scopeFor(1),s.runId),history=await f.repo.nativeTranscript(await f.scopeFor(1),s.value.session.sessionId);assert.equal(before?.run.state,'verifying');assert.equal(before?.sessions[0]?.state,'finished');assert.equal(before?.sessions[0]?.cursor,2);
 const taken=await take(s);assert.equal(taken.observedResourceQuiescence,true);assert.equal(taken.termination,'pending');
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor),observer),state=await restored.state(await f.scopeFor(1),s.resourceId);assert.equal(state.resume[s.runId]?.state,'verifying');assert.equal(state.resume[s.runId]?.sessions[s.value.session.sessionId],'finished');
 const observationId=randomUUID(),baseDigest=bindingDigest(await readFile(resourceFile(s),'utf8'));await restored.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});
 await restored.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest}));
 const after=await f.repo.get(await f.scopeFor(1),s.runId);assert.equal(after?.run.state,'verifying');assert.equal(after?.sessions[0]?.state,'finished');assert.equal(after?.sessions[0]?.cursor,2);assert.deepEqual(await f.repo.nativeTranscript(await f.scopeFor(1),s.value.session.sessionId),history);
 calls=0;await assert.rejects(native(1).nativeTurn(ref(s),2));
 for(const workerGeneration of [1,after!.run.generation.worker]){
  const value={sessionId:s.value.session.sessionId,sequence:3};await assert.rejects(f.repo.nativeCheckpoint(await f.scopeFor(1),f.mutation(s.runId,after!.run.revision,value),value,workerGeneration,()=>{calls++;throw new Error('Finished session must never call model');}));
 }
 assert.equal(calls,0);assert.deepEqual(await f.repo.get(await f.scopeFor(1),s.runId),after);assert.deepEqual(await f.repo.nativeTranscript(await f.scopeFor(1),s.value.session.sessionId),history);
 console.log(JSON.stringify({measurement:'finished-native-takeover-return',runId:s.runId,restoredRunState:after!.run.state,restoredSessionState:after!.sessions[0]!.state,cursor:2,workerGeneration:after!.run.generation.worker,extraModelCalls:0}));
});
test('FENCE/migration7 rerun preserves installed ledgers and refuses altered bytes while original migrations4-6 remain unchanged',async()=>{
 const snapshot=async()=>({foundation:(await f.admin.query('SELECT * FROM public.fabric_foundation_migrations ORDER BY version')).rows,identity:(await f.admin.query('SELECT * FROM public.fabric_identity_migrations ORDER BY version')).rows,recovery:(await f.admin.query('SELECT * FROM public.fabric_recovery_migrations ORDER BY version')).rows});
 const before=await snapshot();assert.deepEqual(before.recovery.map(row=>Number(row.version)),[4,5,6,7,10]);
 for(const [version,name] of [[4,'0004_recovery.sql'],[5,'0005_native_history.sql'],[6,'0006_effect_reconciliation.sql']] as const){const bytes=await readFile(resolve('migrations',name));assert.equal(before.recovery.find(row=>Number(row.version)===version)?.digest,createHash('sha256').update(bytes).digest('hex'));}
 const original=resolve('migrations/0007_fences.sql');await migrateFences(f.admin,original);assert.deepEqual(await snapshot(),before);
 const altered=resolve(directory,'changed-fences.sql');await writeFile(altered,(await readFile(original,'utf8'))+'\n-- incompatible installed migration\n',{flag:'wx'});await assert.rejects(migrateFences(f.admin,altered),/incompatible/);assert.deepEqual(await snapshot(),before);
 console.log(JSON.stringify({measurement:'fence-installed-migration-compatibility',unchangedVersions:[4,5,6],version7Idempotent:true,changedDigestRefused:true,originalLedgersUnchanged:true}));
});

// SEC-F03-001: refusals here happen while both Runs are running and mode=agent.
// There is deliberately no Stop/takeover in the setup or refusal assertions.
async function assertUncertaintyBlocks(s:Seed,other:Seed,operationId:string){
 const repo=new RecoveryRepository(f.uow,f.bindingFor),restored=new FenceRepository(repo);let models=0,io=0;
 const native=createNativeActivities({repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});
 const before=await Promise.all([repo.get(await f.scopeFor(1),s.runId),repo.get(await f.scopeFor(1),other.runId)]);
 assert.equal((await restored.state(await f.scopeFor(1),s.resourceId)).mode,'agent');
 for(const snap of before){assert.equal(snap?.run.state,'running');assert.equal(snap?.run.generation.worker,1);}
 const results=await Promise.allSettled([native.nativeTurn(ref(s),1),native.nativeTurn(ref(other),1),
  restored.mutateResource(await f.scopeFor(1),offered(s),async()=>{io++;await writeFile(resourceFile(s),'blind-duplicate');}),
  restored.mutateResource(await f.scopeFor(1),offered(other),async()=>{io++;await writeFile(resourceFile(s),'conflicting-other-run');})]);
 for(const result of results){assert.equal(result.status,'rejected');if(result.status==='rejected'){assert.equal(result.reason.code,'STALE_AUTHORITY');assert.match(result.reason.message,/local resource uncertainty/);}}
 assert.equal(models,0);assert.equal(io,0);
 assert.deepEqual(await Promise.all([repo.get(await f.scopeFor(1),s.runId),repo.get(await f.scopeFor(1),other.runId)]),before);
 for(const run of [s,other])assert.deepEqual(await repo.nativeTranscript(await f.scopeFor(1),run.value.session.sessionId),[]);
 assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_resource_mutations WHERE resource_id=$1',[s.resourceId])).rows[0].n,1);
 console.log(JSON.stringify({measurement:'local-uncertainty-before-stop',operationId,resourceId:s.resourceId,recreatedRepositories:true,sharedRuns:2,newOperationIo:io,modelCalls:models,stopCalls:0}));
}
for(const path of ['api','sdk','shell','filesystem'] as const)test('RECOVERY/'+path+' success with lost ACK blocks recreated current native continuation and fresh IDs in both shared Runs before Stop',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s,path),file=resourceFile(s),content='committed-'+op.operationId;let writes=0;
 const server=createServer(async(req,res)=>{for await(const _ of req){}await writeFile(file,content);writes++;res.end('committed');});let endpoint='';
 if(path==='api'||path==='sdk'){await new Promise<void>(res=>server.listen(0,'127.0.0.1',res));const a=server.address();assert.ok(a&&typeof a!=='string');endpoint='http://127.0.0.1:'+a.port;}
 try{
  await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{
   if(path==='api'||path==='sdk'){const sdk={write:()=>fetch(endpoint,{method:'POST',body:content})};const response=await (path==='sdk'?sdk.write():fetch(endpoint,{method:'POST',body:content}));assert.equal(response.status,200);await response.text();}
   else if(path==='filesystem'){await writeFile(file,content);writes++;}
   else {const marker='--fixture-owner='+owner,child=launchOwned(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],process.argv[2]);console.log('committed')",file,content,marker],marker,{PATH:process.env.PATH??''});children.push(child);await waitUntil(async()=>child.child.exitCode!==null,'owned shell committed');assert.equal(child.child.exitCode,0);writes++;}
   throw new Error('Lost actual resource ACK');
  }),/Lost actual resource ACK/);
  assert.equal(writes,1);assert.equal(await readFile(file,'utf8'),content);
  assert.equal((await f.admin.query('SELECT state FROM fabric.recovery_resource_mutations WHERE operation_id=$1',[op.operationId])).rows[0].state,'unknown');
  await assertUncertaintyBlocks(s,other,op.operationId);assert.equal(await readFile(file,'utf8'),content);assert.equal(writes,1);
  let duplicate=0;await assert.rejects(new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor)).mutateResource(await f.scopeFor(1),op,async()=>{duplicate++;}));assert.equal(duplicate,0);
 }finally{if(server.listening)await new Promise<void>((res,rej)=>server.close(e=>e?rej(e):res()));}
});
test('RECOVERY/submission COMMIT ACK loss blocks fresh IDs and current model in shared Runs before Stop with zero initial I/O',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s);let writes=0;
 const lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost submission COMMIT ACK');}),bindingFor:f.bindingFor}),f.bindingFor));
 await assert.rejects(lost.mutateResource(await f.scopeFor(1),op,async()=>{writes++;await writeFile(resourceFile(s),'unsafe');}),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');
 assert.equal(writes,0);assert.equal((await f.admin.query('SELECT state FROM fabric.recovery_resource_mutations WHERE operation_id=$1',[op.operationId])).rows[0].state,'submitted');
 await assertUncertaintyBlocks(s,other,op.operationId);assert.equal(await readFile(resourceFile(s),'utf8'),'resource-base');
});
test('RECOVERY/queued native and conflicting I/O observe unknown after actual held-write failure, without Stop',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s),entered=deferred(),release=deferred();let io=0,models=0;
 const write=fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'ack-lost-inflight');entered.resolve();await release.promise;throw new Error('lost ACK after held write');});
 const failure=assert.rejects(write,/lost ACK/);await entered.promise;
 const queuedIo=assert.rejects(new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor)).mutateResource(await f.scopeFor(1),offered(other),async()=>{io++;}));
 const queuedModel=assert.rejects(createNativeActivities({repo:new RecoveryRepository(f.uow,f.bindingFor),scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(ref(s),1));
 try{await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")).rowCount!>=2,'both queued operations observed behind held write');release.resolve();await Promise.all([failure,queuedIo,queuedModel]);assert.equal(io,0);assert.equal(models,0);await assertUncertaintyBlocks(s,other,op.operationId);
 }finally{release.resolve();await Promise.allSettled([failure,queuedIo,queuedModel]);}
});
test('RECOVERY/original native receipt cannot bypass uncertainty; unrelated resource continues',async()=>{
 const s=await seed();let models=0;const native=createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});await native.nativeTurn(ref(s),1);assert.equal(models,1);
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),offered(s),async()=>{await writeFile(resourceFile(s),'uncertain');throw new Error('lost ACK');}));
 const restored=createNativeActivities({repo:new RecoveryRepository(f.uow,f.bindingFor),scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});
 await assert.rejects(restored.nativeTurn(ref(s),1),/local resource uncertainty/);await assert.rejects(restored.nativeTurn(ref(s),2),/local resource uncertainty/);assert.equal(models,1);
 const independent=await seed();await restored.nativeTurn(ref(independent),1);assert.equal(models,2);let writes=0;await fences.mutateResource(await f.scopeFor(1),offered(independent),async()=>{writes++;await writeFile(resourceFile(independent),'independent');});assert.equal(writes,1);
});

async function fsyncedReceipt(op:ResourceMutation,outcome:'applied'|'not-applied'){
 const receipt={operationId:op.operationId,bindingDigest:bindingDigest(op),outcome,targetDigest:bindingDigest(await readFile(resourceFiles.get(op.resourceId)!,'utf8'))};
 const file=resolve(directory,'receipt-'+op.operationId),handle=await open(file,'wx');try{await handle.writeFile(JSON.stringify(receipt));await handle.sync();}finally{await handle.close();}return file;
}
function receiptObserver(file:string,counters:{lookups:number}){
 return {...observer,lookupMutation:async(op:ResourceMutation):Promise<ResourceResolution>=>{
  counters.lookups++;const receipt=JSON.parse(await readFile(file,'utf8')),targetDigest=bindingDigest(await readFile(resourceFiles.get(op.resourceId)!,'utf8'));
  return {operationId:receipt.operationId,bindingDigest:receipt.bindingDigest,outcome:targetDigest===receipt.targetDigest?receipt.outcome:'unknown',evidenceDigest:bindingDigest({receipt,targetDigest})};
 }};
}
test('RECOVERY/trusted original-operation fsynced lookup settles uncertainty durably without writes; lost reconciliation COMMIT ACK recovers immutable receipt',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s);let originalWrites=0,file='';
 await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'exact-domain-commit');originalWrites++;file=await fsyncedReceipt(op,'applied');throw new Error('Lost ACK');}));await assertUncertaintyBlocks(s,other,op.operationId);
 const counters={lookups:0},drivers=receiptObserver(file,counters),lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost reconciliation COMMIT ACK');}),bindingFor:f.bindingFor}),f.bindingFor),drivers);
 await assert.rejects(lost.reconcileResourceMutation(await f.scopeFor(1),op.operationId),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');assert.equal(counters.lookups,1);assert.equal(originalWrites,1);
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor));const receipt=await restored.reconcileResourceMutation(await f.scopeFor(1),op.operationId);assert.equal(receipt.outcome,'applied');assert.equal(receipt.bindingDigest,bindingDigest(op));assert.equal(counters.lookups,1);
 assert.equal((await f.admin.query('SELECT state FROM fabric.recovery_resource_mutations WHERE operation_id=$1',[op.operationId])).rows[0].state,'unknown');
 let replayWrites=0;await assert.rejects(restored.mutateResource(await f.scopeFor(1),op,async()=>{replayWrites++;}));assert.equal(replayWrites,0);
 let models=0;await createNativeActivities({repo:restored.repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(ref(other),1);assert.equal(models,1);
 await restored.mutateResource(await f.scopeFor(1),offered(s),async()=>{await writeFile(resourceFile(s),'explicit-new-operation');});assert.equal(originalWrites,1);
 const row=(await f.admin.query('SELECT record FROM fabric.recovery_resource_reconciliations WHERE operation_id=$1',[op.operationId])).rows[0];assert.deepEqual(row.record,receipt);
 await assert.rejects(f.admin.query('UPDATE fabric.recovery_resource_reconciliations SET record=record WHERE operation_id=$1',[op.operationId]),/immutable/);await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_resource_reconciliations WHERE operation_id=$1',[op.operationId]),/immutable/);
 console.log(JSON.stringify({measurement:'resource-read-only-reconciliation-ack-recovery',operationId:op.operationId,originalWrites,lookupCalls:counters.lookups,lookupOutcome:receipt.outcome,replayedWrites:replayWrites,postResolutionModelCalls:models,originalJournalState:'unknown'}));
});
test('RECOVERY/unknown, mismatched, missing and unquiesced domain evidence cannot clear local uncertainty; revoked and cross-Space requests perform zero lookup',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s);let file='';await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'domain-committed');file=await fsyncedReceipt(op,'applied');throw new Error('lost ACK');}));
 const counters={lookups:0},real=receiptObserver(file,counters);await writeFile(resourceFile(s),'unreconciled-change');
 const uncertain=await new FenceRepository(f.repo,real).reconcileResourceMutation(await f.scopeFor(1),op.operationId);assert.equal(uncertain.outcome,'unknown');await assertUncertaintyBlocks(s,other,op.operationId);
 await writeFile(resourceFile(s),'domain-committed');
 for(const mismatch of ['operationId','bindingDigest'] as const){const bad={...real,lookupMutation:async(b:ResourceMutation)=>({...await real.lookupMutation(b),[mismatch]:mismatch==='operationId'?randomUUID():bindingDigest('wrong binding')})};await assert.rejects(new FenceRepository(f.repo,bad).reconcileResourceMutation(await f.scopeFor(1),op.operationId),/binding mismatch/);}
 await assert.rejects(new FenceRepository(f.repo).reconcileResourceMutation(await f.scopeFor(1),op.operationId));
 await assert.rejects(new FenceRepository(f.repo,{...real,lookupMutation:async()=>{throw new Error('status unavailable');}}).reconcileResourceMutation(await f.scopeFor(1),op.operationId),/status unavailable/);
 const count=counters.lookups;failedQuiescence.add(s.resourceId);try{await assert.rejects(new FenceRepository(f.repo,real).reconcileResourceMutation(await f.scopeFor(1),op.operationId));}finally{failedQuiescence.delete(s.resourceId);}assert.equal(counters.lookups,count);
 await assert.rejects(new FenceRepository(f.repo,real).reconcileResourceMutation(await f.scopeFor(1,f.source),op.operationId));assert.equal(counters.lookups,count);
 const stale=await f.scopeFor(1);await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 try{await assert.rejects(new FenceRepository(f.repo,real).reconcileResourceMutation(stale,op.operationId));assert.equal(counters.lookups,count);}finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
 assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_resource_reconciliations WHERE operation_id=$1',[op.operationId])).rows[0].n,0);await assertUncertaintyBlocks(s,other,op.operationId);
});
test('RECOVERY/proven not-applied submission uses domain evidence and explicit new ID, never retries the original callback',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s);let writes=0;
 const lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost submission ACK');}),bindingFor:f.bindingFor}),f.bindingFor));
 await assert.rejects(lost.mutateResource(await f.scopeFor(1),op,async()=>{writes++;}),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');assert.equal(writes,0);await assertUncertaintyBlocks(s,other,op.operationId);
 // This synthetic domain knows submission never invoked I/O. It writes a durable
 // original-operation status receipt, rather than interpreting missing data as safe.
 const file=await fsyncedReceipt(op,'not-applied'),count={lookups:0},restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor),receiptObserver(file,count));
 const receipt=await restored.reconcileResourceMutation(await f.scopeFor(1),op.operationId);assert.equal(receipt.outcome,'not-applied');assert.equal(count.lookups,1);assert.equal(writes,0);
 await assert.rejects(restored.mutateResource(await f.scopeFor(1),op,async()=>{writes++;}));assert.equal(writes,0);
 await restored.mutateResource(await f.scopeFor(1),offered(other),async()=>{writes++;await writeFile(resourceFile(s),'new-explicit-operation');});assert.equal(writes,1);
});
test('RECOVERY/domain reconciliation permits explicit fresh-base return, preserves original Stop receipt and never revives a stopped Run',async()=>{
 const s=await seed(),op=offered(s);let file='';await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'committed');file=await fsyncedReceipt(op,'applied');throw new Error('lost ACK');}));
 const stopCommand=command(s),stopped=await accepted(stopCommand);assert.ok(stopped.unknownEffects.includes(op.operationId));await take(s);
 const restored=new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor),receiptObserver(file,{lookups:0}));await restored.reconcileResourceMutation(await f.scopeFor(1),op.operationId);
 const state=await restored.state(await f.scopeFor(1),s.resourceId),observationId=randomUUID(),baseDigest=bindingDigest(await readFile(resourceFile(s),'utf8'));await restored.observe(await f.scopeFor(1),{resourceId:s.resourceId,observationId,baseDigest});
 const returned=await restored.execute(await f.scopeFor(1),command(s,'return-control',{expectedResourceGeneration:state.generation,observationId,baseDigest}));assert.deepEqual(returned.unknownEffects,[]);assert.deepEqual(await restored.lookupCommand(await f.scopeFor(1),stopCommand),{status:'committed',receipt:stopped});assert.ok(stopped.unknownEffects.includes(op.operationId));assert.equal((await restored.repo.get(await f.scopeFor(1),s.runId))?.run.state,'cancelling');
 let io=0;await assert.rejects(restored.mutateResource(await f.scopeFor(1),offered(s),async()=>{io++;}));assert.equal(io,0);
});
test('RECOVERY/additive migration10 is immutable, forced-RLS and repeatable with original migration ledgers preserved',async()=>{
 const path=resolve('migrations/0010_resource_reconciliation.sql'),snapshot=async()=>(await f.admin.query('SELECT * FROM public.fabric_recovery_migrations ORDER BY version')).rows,before=await snapshot();
 await migrateResourceReconciliation(f.admin,path);assert.deepEqual(await snapshot(),before);
 const altered=resolve(directory,'changed-resource-reconciliation.sql');await writeFile(altered,(await readFile(path,'utf8'))+'\n-- altered bytes\n',{flag:'wx'});await assert.rejects(migrateResourceReconciliation(f.admin,altered),/incompatible/);assert.deepEqual(await snapshot(),before);
 const security=(await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fabric.recovery_resource_reconciliations'::regclass")).rows[0];assert.equal(security.relrowsecurity,true);assert.equal(security.relforcerowsecurity,true);
 for(const pool of [f.worker,f.client])await assert.rejects(pool.query('SELECT * FROM fabric.recovery_resource_reconciliations'),/permission denied/);
});

test('RECOVERY/absence of optional reconciliation schema fails closed on actual unknown resource state',async()=>{
 const s=await seed(),other=await seed(s.resourceId),op=offered(s);await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'unknown-without-evidence-schema');throw new Error('lost ACK');}));
 // Rename only this disposable owned fixture table to exercise old migration7
 // installations. No historical evidence or repository schema bytes are changed.
 await f.admin.query('ALTER TABLE fabric.recovery_resource_reconciliations RENAME TO fixture_hidden_reconciliations');
 try{await assertUncertaintyBlocks(s,other,op.operationId);await assert.rejects(new FenceRepository(f.repo,observer).reconcileResourceMutation(await f.scopeFor(1),op.operationId),/Installed reconciliation evidence schema required/);}
 finally{await f.admin.query('ALTER TABLE fabric.fixture_hidden_reconciliations RENAME TO recovery_resource_reconciliations');}
});

test('RECOVERY/migration10 refuses unknown, null, missing and mismatched resolution evidence in PostgreSQL',async()=>{
 const s=await seed(),op=offered(s);await assert.rejects(fences.mutateResource(await f.scopeFor(1),op,async()=>{await writeFile(resourceFile(s),'uncertain');throw new Error('lost ACK');}));
 const valid={operationId:op.operationId,bindingDigest:bindingDigest(op),outcome:'applied',evidenceDigest:bindingDigest('measured-proof')};
 const missing={...valid} as Partial<typeof valid>;delete missing.evidenceDigest;
 for(const record of [{...valid,outcome:'unknown'},{...valid,bindingDigest:null},{...valid,evidenceDigest:null},{...valid,operationId:null},{...valid,outcome:null},missing,{...valid,operationId:randomUUID()},{...valid,evidenceDigest:'0'.repeat(64)}]){
  await assert.rejects(f.admin.query('INSERT INTO fabric.recovery_resource_reconciliations(tenant_id,space_id,operation_id,actor_id,record) VALUES($1,$2,$3,$4,$5)',[f.tenant,f.space,op.operationId,f.actors[1],JSON.stringify(record)]),/check constraint/);
 }
 assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.recovery_resource_reconciliations WHERE operation_id=$1',[op.operationId])).rows[0].n,0);
});

test('RECOVERY/queued shared native and all conflicting adapters observe external unknown after held HTTP success loses ACK without Stop',async()=>{
 const s=await seed(),other=await seed(s.resourceId),effect=await approved(s),scope=await f.scopeFor(1),effects=new EffectRepository(f.repo),committed=deferred(),release=deferred();let writes=0,models=0,io=0;
 const server=createServer(async(req,_res)=>{for await(const _ of req){}const file=await open(resourceFile(s),'w');try{await file.writeFile('external-success-before-ACK');await file.sync();}finally{await file.close();}writes++;committed.resolve();await release.promise;req.socket.destroy();});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 assert.equal(await effects.claim(scope,effect.binding.operationId,1),true);
 const dispatched=assert.rejects(effects.guardedIO(scope,effect.binding.operationId,1,true,async()=>{await fetch('http://127.0.0.1:'+address.port,{method:'POST',body:'approved-local-bytes'});}));await committed.promise;
 const restored=new RecoveryRepository(f.uow,f.bindingFor),native=createNativeActivities({repo:restored,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});
 const queued=[assert.rejects(native.nativeTurn(ref(other),1)),...(['api','sdk','shell','filesystem'] as const).map(path=>assert.rejects(new FenceRepository(restored).mutateResource(scope,offered(other,path),async()=>{io++;})))];
 try{await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0")).rowCount!>=5,'shared model and four I/O transactions queued behind held external POST');release.resolve();await Promise.all([dispatched,...queued]);assert.equal(writes,1);assert.equal(models,0);assert.equal(io,0);await assert.rejects(effects.guardedIO(scope,effect.binding.operationId,1,true,async()=>{io++;}));assert.equal(io,0);assert.equal((await restored.get(scope,s.runId))?.effects[0]?.state,'unknown');assert.equal((await restored.get(scope,other.runId))?.run.state,'running');assert.equal(await readFile(resourceFile(s),'utf8'),'external-success-before-ACK');}
 finally{release.resolve();await Promise.allSettled([dispatched,...queued]);await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
 console.log(JSON.stringify({measurement:'external-unknown-shared-queued-before-stop',operationId:effect.binding.operationId,queuedTransactions:5,externalWrites:writes,modelCalls:models,conflictingIo:io,stopCalls:0}));
});

test('RECOVERY/exact-approved external success ACK loss blocks recreated shared Runs before Stop and permits only original read-only settlement',async()=>{
 const s=await seed(),other=await seed(s.resourceId),independent=await seed(),effect=await approved(s),scope=await f.scopeFor(1);
 const port=await freePort(),endpoint='http://127.0.0.1:'+port,marker='--fixture-owner='+owner;
 const child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/effect-service-process.js',import.meta.url)),marker],marker,{FABRIC_EFFECT_SERVICE:JSON.stringify({owner,journal:resolve(directory,'shared-external-'+effect.binding.operationId+'.jsonl'),port})});children.push(child);
 await waitUntil(async()=>child.output().includes('"kind":"ready"'),'independent external supplier');
 const mode=await fetch(endpoint+'/fixture-mode',{method:'POST',body:JSON.stringify({ack:'drop',lookup:'normal',dedup:true})});assert.equal(mode.status,200);
 const effectRef={...ref(s),operationId:effect.binding.operationId,intentDigest:bindingDigest(effect.binding)};
 const activities=(repo:RecoveryRepository,generation=1)=>createEffectActivities({repo:new EffectRepository(repo),scope:()=>f.scopeFor(1),generation,endpoint,requestFor:async()=>({intent:effect.binding,arguments:{artifactDigest:effect.binding.artifactDigest},artifact:'approved-local-bytes'}),measure:()=>{}});
 await assert.rejects(activities(f.repo).dispatchEffect(effectRef));
 const metrics=async()=>await (await fetch(endpoint+'/metrics')).json() as {posts:number;writes:number;lookups:number};
 const initial=await metrics();assert.deepEqual({posts:initial.posts,writes:initial.writes,lookups:initial.lookups},{posts:1,writes:1,lookups:0});
 assert.equal((await f.repo.get(scope,s.runId))?.effects[0]?.state,'unknown');
 assert.equal((await f.repo.get(scope,other.runId))?.run.state,'running');assert.equal((await fences.state(scope,s.resourceId)).mode,'agent');
 const before=await f.repo.get(scope,other.runId),restored=new RecoveryRepository(f.uow,f.bindingFor);let models=0,io=0;
 const native=createNativeActivities({repo:restored,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}});
 const attempts=await Promise.allSettled([
  native.nativeTurn(ref(other),1),native.nativeTurn(ref(s),1),
  ...(['api','sdk','shell','filesystem'] as const).map(path=>new FenceRepository(restored).mutateResource(scope,offered(other,path),async()=>{io++;await writeFile(resourceFile(s),'conflict');}))
 ]);
 for(const result of attempts){assert.equal(result.status,'rejected');if(result.status==='rejected')assert.equal(result.reason.code,'STALE_AUTHORITY');}
 assert.equal(models,0);assert.equal(io,0);assert.deepEqual(await restored.get(scope,other.runId),before);
 assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_resource_mutations WHERE resource_id=$1',[s.resourceId])).rowCount,0);
 const freshEffects=new EffectRepository(restored);assert.equal(await freshEffects.claim(scope,effect.binding.operationId,1),false);
 await assert.rejects(freshEffects.guardedIO(scope,effect.binding.operationId,1,true,async()=>{io++;}),/Original acknowledged claim/);
 assert.equal(io,0);assert.equal((await metrics()).posts,1);assert.equal((await metrics()).writes,1);
 await native.nativeTurn(ref(independent),1);assert.equal(models,1);
 // Replacement only fences the worker; it cannot clear the shared uncertainty.
 const snap=(await restored.get(scope,s.runId))!,replacement={sessionId:s.value.session.sessionId,previousWorker:1,nextWorker:2};
 await restored.replaceWorker(scope,f.mutation(s.runId,snap.run.revision,replacement),replacement);
 await assert.rejects(native.nativeTurn(ref(other),1));assert.equal(models,1);
 assert.equal((await activities(restored,2).reconcileEffect(effectRef)).status,'confirmed');
 assert.deepEqual({posts:(await metrics()).posts,writes:(await metrics()).writes,lookups:(await metrics()).lookups},{posts:1,writes:1,lookups:1});
 await new FenceRepository(new RecoveryRepository(f.uow,f.bindingFor)).mutateResource(await f.scopeFor(1),offered(other),async()=>{io++;await writeFile(resourceFile(s),'explicit-after-resolution');});
 await native.nativeTurn(ref(other),1);assert.equal(io,1);assert.equal(models,2);
 await activities(restored,2).resumeEffect(effectRef);await createNativeActivities({repo:restored,scope:()=>f.scopeFor(1),workerGeneration:2,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(ref(s),1);assert.equal(models,3);
 console.log(JSON.stringify({measurement:'external-uncertainty-shared-before-stop',operationId:effect.binding.operationId,sharedRuns:2,recreatedRepositories:true,stopCalls:0,conflictingIoBeforeResolution:0,modelCallsBeforeResolution:0,externalPosts:1,externalWrites:1,readOnlyLookups:1}));
});

for(const resolution of ['applied','not-applied'] as const)test('RECOVERY/'+resolution+' local resolution survives recreation through schedule admission/recovery and immutable result with failed notification',async()=>{
 await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));await migrateResults(f.admin,resolve('migrations/0009_results.sql'));
 const s=await seed(),scope=await f.scopeFor(1),repo=new RecoveryRepository(f.uow,f.bindingFor),dispatch=new DispatchRepository(repo),results=new ResultRepository(repo),artifactId=randomUUID(),bytes='verified recovered '+resolution;
 const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);
 await results.configure(scope,s.runId,{obligation:'draft',definitions:[{kind:'contains',argument:'verified'}],audience:{sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)}});
 await results.saveDraft(scope,s.runId,1,artifactId,1,null,bytes);await results.verify(scope,s.runId,1,artifactId,1);
 const expiry=()=>new Date(Date.now()+60000).toISOString(),cmd=(expectedRevision:number)=>({key:randomUUID(),expiresAt:expiry(),expectedRevision});
 async function schedule(sequence:number){const config:Schedule={scheduleId:randomUUID(),runId:s.runId,sessionId:s.value.session.sessionId,sequence,ownerActorId:f.actors[1],principalKind:'human',timezone:'Asia/Singapore',recurrence:{kind:'interval',startAt:expiry(),everyMs:60000},expiresAt:expiry(),policyRevision:1,connectionId:randomUUID(),connectionExpiresAt:expiry(),inputDigest:s.value.session.contextDigest,deliveryAudience:[f.actors[1]],maxCostMicrounits:20,maxRuntimeMs:10000,waitMs:5000,graceMs:10000,maxCatchUp:10,overlap:'exclude',missed:'skip',effectClass:'read',operationId:null,inputReady:true,resourceReady:true};await dispatch.create(scope,cmd(0),config);return config;}
 const first=await schedule(1),firstOccurrence=await dispatch.trigger(scope,cmd(1),first.scheduleId,randomUUID(),new Date().toISOString()),firstTicket=await dispatch.admit(scope,firstOccurrence.occurrenceId,expiry());assert.ok(firstTicket);
 let models=0;await createNativeActivities({repo,scope:()=>f.scopeFor(1),workerGeneration:1,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(firstTicket.ref,firstTicket.sequence);assert.equal(models,1);
 const second=await schedule(2),op=offered(s);let writes=0,file='';
 if(resolution==='applied')await assert.rejects(fences.mutateResource(scope,op,async()=>{await writeFile(resourceFile(s),'domain-applied');writes++;file=await fsyncedReceipt(op,resolution);throw new Error('Lost ACK');}));
 else {const lost=new FenceRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost submission ACK');}),bindingFor:f.bindingFor}),f.bindingFor));await assert.rejects(lost.mutateResource(scope,op,async()=>{writes++;}));file=await fsyncedReceipt(op,resolution);}
 const original=(await f.admin.query('SELECT * FROM fabric.recovery_resource_mutations WHERE operation_id=$1',[op.operationId])).rows[0];
 const pending=await dispatch.trigger(scope,cmd(1),second.scheduleId,randomUUID(),new Date().toISOString());assert.equal(pending.state,'reconciling');assert.equal(pending.detail,'reconcile-original-operation-no-replay');
 assert.equal((await dispatch.recover(scope,firstOccurrence.occurrenceId)).state,'reconciling');assert.equal(await dispatch.admit(scope,pending.occurrenceId,expiry()),null);
 for(const status of ['succeeded','partial','failed','cancelled'] as const)await assert.rejects(results.finish(scope,s.runId,1,{status,summary:'blocked',artifactId,version:1,deliveryId:null,remainingWork:'none'}));
 const restored=new RecoveryRepository(f.uow,f.bindingFor),restoredFences=new FenceRepository(restored,receiptObserver(file,{lookups:0}));
 assert.equal((await restoredFences.reconcileResourceMutation(await f.scopeFor(1),op.operationId)).outcome,resolution);
 await assert.rejects(restoredFences.mutateResource(scope,op,async()=>{writes++;}));assert.equal(writes,resolution==='applied'?1:0);
 const recoveredDispatch=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.equal((await recoveredDispatch.recover(scope,firstOccurrence.occurrenceId)).state,'completed');
 const queued=await recoveredDispatch.recover(scope,pending.occurrenceId);assert.equal(queued.state,'queued');assert.equal(queued.detail,'prerequisites-reconciled-before-admission');
 const snapshot=(await restored.get(scope,s.runId))!,replacement={sessionId:s.value.session.sessionId,previousWorker:1,nextWorker:2};await restored.replaceWorker(scope,f.mutation(s.runId,snapshot.run.revision,replacement),replacement);
 const admitted=await recoveredDispatch.admit(scope,pending.occurrenceId,expiry());assert.ok(admitted);assert.equal(admitted.generation,2);
 assert.equal((await new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor)).recover(scope,pending.occurrenceId)).detail,'checkpoint-absent-explicit-resume-required');
 const unexecuted=(await restored.get(scope,s.runId))!,nextReplacement={sessionId:s.value.session.sessionId,previousWorker:2,nextWorker:3};await restored.replaceWorker(scope,f.mutation(s.runId,unexecuted.run.revision,nextReplacement),nextReplacement);
 const current=await recoveredDispatch.get(scope,second.scheduleId);await recoveredDispatch.resumeOccurrence(scope,cmd(current.revision),pending.occurrenceId);
 const ticket=await new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor)).admit(await f.scopeFor(1),pending.occurrenceId,expiry());assert.ok(ticket);assert.equal(ticket.generation,3);
 await createNativeActivities({repo:new RecoveryRepository(f.uow,f.bindingFor),scope:()=>f.scopeFor(1),workerGeneration:3,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(ticket.ref,ticket.sequence);
 assert.equal((await new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor)).recover(scope,pending.occurrenceId)).state,'completed');assert.equal(models,2);
 const outcome=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).finish(scope,s.runId,3,{status:'succeeded',summary:'recovered '+resolution,artifactId,version:1,deliveryId:null,remainingWork:'none'});
 const n=new NotificationRepository(new RecoveryRepository(f.uow,f.bindingFor)),id=notificationId(s.runId,f.actors[1]);assert.equal((await n.get(scope,id)).resultDigest,outcome.resultDigest);
 const server=createServer((_req,res)=>{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({status:'rejected',definitelyNotSent:true}));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 try{assert.equal((await n.send(scope,id,'http://127.0.0.1:'+address.port)).state,'failed');const retrieved=await new ResultRepository(new RecoveryRepository(f.uow,f.bindingFor)).get(await f.scopeFor(1),s.runId);assert.deepEqual(retrieved.outcome,outcome);assert.equal(retrieved.artifacts[0]?.bytes,bytes);assert.equal(retrieved.artifacts[0]?.artifact.verification,'passed');}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
 assert.deepEqual((await f.admin.query('SELECT * FROM fabric.recovery_resource_mutations WHERE operation_id=$1',[op.operationId])).rows[0],original);
 console.log(JSON.stringify({measurement:'resolved-local-schedule-result-notification',resolution,originalJournalState:original.state,recreatedRepositories:true,modelCalls:models,originalOperationReplays:0,resultStatus:outcome.status,notificationStatus:'failed'}));
});
