import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PropagationVerificationFixture} from './propagation-verification-fixture.js';
import {volumeVerificationOwner} from './volume-verification-owner.js';
import type {VolumeCommand} from '../../src/volume-drafts.js';
import type {AsyncUnitOfWork} from '../../src/owners.js';
import {DependencyGraphRepository} from '../../src/dependency-graph.js';
import type {CryptoStore} from '../../src/crypto-store.js';
import type {GraphRef,DerivedMaterialOwner} from '../../src/dependency-graph.js';
/** Small real publication graph for the Cartesian races. Each operation uses
 * the existing installed canonical, graph and volume owners. The separate
 * L04/L06 bodies keep the complete nested graph; this fixture adds no behavior. */
export async function lifecycleRaceScenario(f:PropagationVerificationFixture,lifetime:number,cacheEnabled=true){
 const original=await f.setup(),commands:VolumeCommand[]=[],expiry=new Date(Date.now()+lifetime).toISOString(),src=await f.source(original.task.binding.sessionId,expiry),c=await f.saved(original.task.binding.sessionId,src,expiry),sr=await f.ref('source',src.targetId),kr=await f.ref('knowledge',c.targetId),cache=cacheEnabled?await f.derived(original.task.binding.sessionId,'cache',[kr],expiry,Buffer.from(c.assertion.value)):null;
 const common=()=>({schemaVersion:1 as const,...f.command(original.task.binding.sessionId),targetId:randomUUID(),expectedRevision:0});const enroll=<T extends VolumeCommand>(c:T)=>{commands.push(c);return c;},logicalPath='documents/'+randomUUID();
 const live=(patch:Partial<Extract<VolumeCommand,{action:'live-write'}>>={})=>enroll({...common(),action:'live-write' as const,filename:'live.bin',logicalPath,bytes:original.bytes.toString('base64'),...patch});
 const draft=(patch:Partial<Extract<VolumeCommand,{action:'draft'}>>={})=>enroll({...common(),action:'draft' as const,filename:'draft.bin',logicalPath,bytes:original.bytes.toString('base64'),sourceId:null,baseRevision:1,...patch});
 const promote=(base:Extract<VolumeCommand,{action:'live-write'}>,d:Extract<VolumeCommand,{action:'draft'}>,patch:Partial<Extract<VolumeCommand,{action:'promote'}>>={})=>enroll({...common(),action:'promote' as const,targetId:base.targetId,expectedRevision:1,draftId:d.targetId,draftRevision:1,validationId:randomUUID(),...patch});
 const volumeOwner=(u:AsyncUnitOfWork=f.f.uow,crypto:CryptoStore=f.graph(f.f.uow).crypto)=>volumeVerificationOwner({uow:u,native:f.f.native,scope:f.scope,crypto,authorityRoot:f.authorityRoot,root:original.root,witnessRoot:f.witnessRoot,keyId:f.keyId,generation:f.generation,commands,retentionExpiresAt:expiry});
 const closure=async(root:GraphRef)=>f.f.uow.withScope(f.scope,async tx=>(await tx.query('SELECT fabric.storage_graph_closure($1,$2,$3,$4,true) AS refs',[root.class,root.id,root.revision,root.witness])).rows[0]?.['refs'] as GraphRef[]);
 const queued=async()=>{
  const outbox=(await f.f.uow.withScope(f.scope,tx=>tx.query('SELECT o.* FROM fabric.storage_outbox o JOIN fabric.storage_save_receipts r USING(tenant_id,space_id,job_id,actor_id,command_key) WHERE o.command_key=$1',[c.key]))).rows;assert.equal(outbox.length,1);assert.equal(outbox[0]?.['target_id'],kr.id);assert.equal(Number(outbox[0]?.['target_revision']),1);
  const input=Buffer.from((await f.canonical().recall(f.scope,kr)).value);f.count.read++;const id=randomUUID(),command={...f.command(original.task.binding.sessionId),materialId:randomUUID(),expected:null},owner:DerivedMaterialOwner={resolve:async()=>({class:'summary',id,revision:1,sourceTaskId:original.task.binding.taskId,expiresAt:expiry,bytes:input,dependencies:[kr]})};const repo=(u:AsyncUnitOfWork=f.f.uow,crypto?:CryptoStore)=>(crypto?new DependencyGraphRepository(u,f.journal,f.f.native,crypto,{resolve:async()=>({keyId:f.keyId,generation:f.generation})}):f.graph(u)).publisher(owner);
  const publish=async(u:AsyncUnitOfWork=f.f.uow,crypto?:CryptoStore)=>{assert.equal((await repo(u,crypto).publish(f.scope,command)).status,'committed');f.count.write++;f.count.save++;return f.ref('summary',id);};return {id,c:command,input,publish,repo,outbox};
 };
 return {s:{...original,commands,live,draft,promote},expiry,src,c,sr,kr,cache,volumeOwner,closure,queued};
}
