import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLifecycleVerificationFixture} from './lifecycle-verification-fixture.js';
import {PropagationRetryRepository} from '../../src/propagation-retry.js';
import {StorageError} from '../../src/errors.js';
import {SourceRevocationRepository} from '../../src/source-revocation.js';
import {MaintenanceBuildersRepository,type MaintenanceAdmissionOwner,type MaintenancePlan} from '../../src/maintenance-builders.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {enrollServiceAccounting,accountingSnapshot} from './accounting-fixture.js';
import type {GraphRef,DerivedMaterialOwner} from '../../src/dependency-graph.js';
import type {AsyncUnitOfWork} from '../../src/owners.js';
import type {EpochPublicationHooks} from '../../src/epoch-publication.js';
export async function createPropagationVerificationFixture(){
 const f=await createLifecycleVerificationFixture(),workerId=randomUUID();
 type Scenario=Awaited<ReturnType<typeof f.scenario>>;
 type Event={key:string;sessionId:string;expiresAt:string};
 const retry=(worker:string=workerId,leaseMs=3000)=>new PropagationRetryRepository(f.f.uow,f.journal,f.f.native,{workerId:worker,leaseMs});
 const state=async(key:string)=>{const result=[];for(const table of ['storage_graph_events','storage_graph_jobs','storage_graph_invalidations'])result.push([table,(await f.f.admin.query('SELECT * FROM fabric.'+table+' WHERE command_key=$1 ORDER BY row_to_json('+table+')::text',[key])).rows]);for(const table of ['storage_propagation_leases','storage_propagation_results'])result.push([table,(await f.f.admin.query('SELECT x.* FROM fabric.'+table+' x JOIN fabric.storage_graph_jobs j USING(tenant_id,space_id,job_id) WHERE j.command_key=$1 ORDER BY row_to_json(x)::text',[key])).rows]);return result;};
 const progress=async(c:Event)=>{f.count.read++;return retry().progress(f.scope,c);};
 const complete=async(c:Event)=>{const opens=f.openCount(),before=await f.snapshot(),account=await accountingSnapshot(f.f),r=await retry().run(f.scope,{...c,limit:16});assert.equal(f.openCount(),opens,'cleanup control never decrypts');assert.deepEqual(await f.snapshot(),before,'cleanup never advances canonical/outbox');assert.deepEqual(await accountingSnapshot(f.f),account,'cleanup never reserves/charges');assert.equal(r.status,'converged');assert.equal(r.completed,r.total);assert.equal(r.remaining,0);assert.equal(r.replayAllowed,false);assert.equal(r.cleanup,'ciphertext-retained');assert.equal(r.backupCopies,null);assert.equal(r.externalCopies,null);assert.equal(r.alreadyDeliveredRecalled,false);f.count.propagate+=r.completed;f.count.write++;return r;};
 const restrict=async(x:Scenario,mode:'delete'|'expiry'|'source-revoke'|'correction',hooks:EpochPublicationHooks={},c:Event=f.command(x.s.task.binding.sessionId))=>{
  let receipt:unknown;
  if(mode==='correction'){const command={...x.c,action:'correct' as const,key:c.key,expiresAt:c.expiresAt,expectedRevision:1,assertion:{...x.c.assertion,value:'current-'+c.key}};receipt=await f.canonical().correct(f.scope,{command,prior:x.kr});if((receipt as {status:string}).status==='not-saved')throw new StorageError((receipt as {error:ConstructorParameters<typeof StorageError>[0]}).error);assert.equal((receipt as {status:string}).status,'saved-here');f.count.save++;}
  else if(mode==='source-revoke'){receipt=await new SourceRevocationRepository(f.f.uow,f.journal,f.f.native,hooks).revoke(f.scope,{...c,source:{id:x.sr.id,revision:1,witness:x.sr.witness}});assert.equal((receipt as {status:string}).status,'committed');}
  else{receipt=await (mode==='delete'?f.retention(hooks).forget(f.scope,{...c,entity:x.kr}):f.retention(hooks).expire(f.scope,{...c,entity:x.kr}));assert.equal((receipt as {status:string}).status,'restriction-committed');f.count.forget++;}
  f.count.write++;return {event:c,receipt};
 };
 const restrictionLookup=async(x:Scenario,mode:'delete'|'expiry'|'source-revoke'|'correction',c:Event)=>{
  if(mode==='correction')return f.canonical().lookupCorrection(f.scope,{command:{...x.c,action:'correct',key:c.key,expiresAt:c.expiresAt,expectedRevision:1,assertion:{...x.c.assertion,value:'current-'+c.key}},prior:x.kr});
  if(mode==='source-revoke')return new SourceRevocationRepository(f.f.uow,f.journal,f.f.native).lookup(f.scope,{...c,source:{id:x.sr.id,revision:1,witness:x.sr.witness}});
  return f.retention().lookup(f.scope,{...c,entity:x.kr},mode==='expiry'?'expiry':'forget');
 };
 const queued=async(x:Scenario,cl:'summary'|'index'|'cache'='summary',parent:GraphRef=x.kr,prior:GraphRef|null=null)=>{
  // The real canonical outbox is the durable processor input; its revision
  // remains unchanged across delayed delivery and restriction/correction.
  const queuedOutbox=(await f.f.uow.withScope(f.scope,tx=>tx.query('SELECT o.* FROM fabric.storage_outbox o JOIN fabric.storage_save_receipts r USING(tenant_id,space_id,job_id,actor_id,command_key) WHERE o.command_key=$1',[x.c.key]))).rows;assert.equal(queuedOutbox.length,1);assert.equal(queuedOutbox[0]?.['target_id'],x.kr.id);assert.equal(Number(queuedOutbox[0]?.['target_revision']),1);assert.equal(queuedOutbox[0]?.['class'],'knowledge');
  // Real eligible read is the stopped processor's exact revision-N input.
  const input=parent.class==='knowledge'?Buffer.from((await f.canonical().recall(f.scope,parent)).value):await f.graph().read(f.scope,parent);f.count.read++;const id=prior?.id??randomUUID(),revision=(prior?.revision??0)+1,materialId=randomUUID(),c={...f.command(x.s.task.binding.sessionId),materialId,expected:prior},owner:DerivedMaterialOwner={resolve:async()=>({class:cl,id,revision,sourceTaskId:x.s.task.binding.taskId,expiresAt:x.expiry,bytes:input,dependencies:[parent]})};
  const repo=(u:AsyncUnitOfWork=f.f.uow)=>f.graph(u).publisher(owner);
  const publish=async(u:AsyncUnitOfWork=f.f.uow)=>{assert.equal((await repo(u).publish(f.scope,c)).status,'committed');f.count.write++;f.count.save++;return f.ref(cl,id,revision);};return {id,revision,c,owner,input,queuedOutbox,repo,publish};
 };
 const spawn=(x:Scenario,c:Event,gate:string|null=null,worker:string=randomUUID(),leaseMs=3000)=>f.spawn({...x.s,repo:()=>x.s.repo().artifacts},gate,{script:new URL('./propagation-process-worker.js',import.meta.url),input:{event:c,workerId:worker,leaseMs}});
 const expireLease=async(key:string)=>{const row=await f.until(async()=>(await f.f.admin.query('SELECT clock_timestamp() AS at,max(l.expires_at) AS deadline,coalesce(bool_and(l.expires_at<=clock_timestamp()),true) AS expired FROM fabric.storage_propagation_leases l JOIN fabric.storage_graph_jobs j USING(tenant_id,space_id,job_id) WHERE j.command_key=$1',[key])).rows[0],r=>r.expired===true,'actual propagation lease expiry',7000);assert(row.deadline instanceof Date);assert(row.at>=row.deadline);console.log(JSON.stringify({measurement:'propagation-observed-lease-expiry',key,deadline:row.deadline,observedAt:row.at}));};
 const maintenance=async(x:Scenario,cl:'summary'|'index'|'cache',parent:GraphRef,prior:GraphRef|null=null)=>{
  const enrolled=await enrollServiceAccounting(f.f,f.graph().authority,'maintenance'),materialId=randomUUID(),plan:MaintenancePlan={schemaVersion:1,builder:cl==='summary'?'summary-v1':cl==='index'?'keywords-v1':'cache-v1',id:prior?.id??randomUUID(),revision:(prior?.revision??0)+1,sourceTaskId:enrolled.task.binding.taskId,expiresAt:x.expiry,dependencies:[parent]},c={...f.command(enrolled.task.binding.sessionId),materialId,expected:prior},owner:MaintenanceAdmissionOwner={plan:async()=>plan,policy:async()=>({schemaVersion:1,revision:1,profile:'local-deterministic-v1',region:'local-fixture',provider:'none',allowedBuilders:['summary-v1','keywords-v1','cache-v1'],sourceAllowed:true}),accounting:async(_tx,_s,_n,_k,expiresAt)=>({...enrolled.command,expiresAt})};
  const repo=()=>new MaintenanceBuildersRepository(f.graph(f.f.uow),new StorageServiceAccounting(f.f.uow,f.f.native,enrolled.owner,f.graph().authority),owner);return {c,plan,enrolled,repo};
 };
 return {...f,retry,state,progress,complete,restrict,restrictionLookup,queued,spawnRetry:spawn,expireLease,maintenance};
}
export type PropagationVerificationFixture=Awaited<ReturnType<typeof createPropagationVerificationFixture>>;
