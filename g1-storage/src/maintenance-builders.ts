import { createHash } from 'node:crypto';
import { object,uuid,positive,timestamp,enumeration,literal,list } from './decoder.js';
import { DerivedCommandSchema,GraphDependenciesSchema,type GraphRef,DependencyGraphRepository,type DerivedMaterialOwner } from './dependency-graph.js';
import { StorageAuthorityRepository } from './authority.js';
import { BorrowedUnitOfWork,StorageServiceAccounting,ServiceAccountingSchema,type ServiceAccounting } from './resource-composition.js';
import { KnowledgeSaveRepository } from './knowledge-save.js';
import { KnowledgeStatusAdmission } from './knowledge-status.js';
import { SourceContentRepository } from './source-content.js';
import { demand } from './errors.js';
import type { SqlTransaction,VerifiedScope,NativeSnapshot } from './owners.js';

export const MaintenancePlanSchema=object({schemaVersion:literal(1),builder:enumeration('summary-v1','keywords-v1','cache-v1'),
 id:uuid,revision:positive,sourceTaskId:uuid,expiresAt:timestamp,dependencies:GraphDependenciesSchema});
export type MaintenancePlan=ReturnType<typeof MaintenancePlanSchema.parse>;
export const MaintenancePolicySchema=object({schemaVersion:literal(1),revision:positive,profile:literal('local-deterministic-v1'),
 region:literal('local-fixture'),provider:literal('none'),allowedBuilders:list(enumeration('summary-v1','keywords-v1','cache-v1'),3,1),sourceAllowed:literal(true)});
export type MaintenancePolicy=ReturnType<typeof MaintenancePolicySchema.parse>;
export interface MaintenanceAdmissionOwner {
 /** Installed control-only preparation and current source processing policy.
  * No request can install a provider, region, cost or content-read callback. */
 plan(tx:SqlTransaction,s:VerifiedScope,materialId:string):Promise<MaintenancePlan>;
 policy(tx:SqlTransaction,s:VerifiedScope,plan:MaintenancePlan):Promise<MaintenancePolicy>;
 accounting(tx:SqlTransaction,s:VerifiedScope,native:NativeSnapshot,key:string,expiresAt:string):Promise<ServiceAccounting>;
}
const hash=(x:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const normalized=(raw:unknown)=>{const p=MaintenancePlanSchema.parse(raw);return {...p,dependencies:[...p.dependencies].sort((a,b)=>a.class.localeCompare(b.class)||a.id.localeCompare(b.id)||a.revision-b.revision)};};
const cls=(p:MaintenancePlan)=>p.builder==='summary-v1'?'summary':p.builder==='keywords-v1'?'index':'cache';
/** Declared deterministic UTF-8 builders, no model/embedding/supplier port.
 * Summary extracts the first 2048 Unicode scalars; index contains <=128 sorted
 * unique NFKC lowercase letter/number words; cache retains the ordered inputs.
 * Output is bounded bytes, encrypted by the existing graph publication owner. */
export function buildMaintenance(plan:MaintenancePlan,inputs:readonly Buffer[]):Buffer{
 const texts=inputs.map(b=>new TextDecoder('utf-8',{fatal:true}).decode(b));
 const text=texts.join('\n');let result:string;
 if(plan.builder==='summary-v1')result=Array.from(text).slice(0,2048).join('');
 else if(plan.builder==='keywords-v1')result=JSON.stringify([...new Set(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])].sort().slice(0,128));
 else result=JSON.stringify({schemaVersion:1,inputs:texts});
 const bytes=Buffer.from(result,'utf8');if(bytes.length>524288){bytes.fill(0);demand(false,'INVALID_SCHEMA');}return bytes;
}

/** Same authenticated publication transaction owns admission, decrypt, F04
 * settlement, encrypted graph+head and exact maintenance receipt. The epoch
 * witness is ACKed only by the existing publisher after its real outer COMMIT.
 * Lost COMMIT uses original-key metadata recovery and never rebuilds/recharges. */
export class MaintenanceBuildersRepository {
 constructor(readonly graph:DependencyGraphRepository,readonly accounting:StorageServiceAccounting,readonly owner:MaintenanceAdmissionOwner){}
 private installed(command:ReturnType<typeof DerivedCommandSchema.parse>,buffers:Buffer[]):DerivedMaterialOwner{
  let plan:MaintenancePlan|undefined,policy:MaintenancePolicy|undefined,account:ServiceAccounting|undefined,native:NativeSnapshot|undefined;
  const current=async(tx:SqlTransaction,s:VerifiedScope,authority:StorageAuthorityRepository)=>{
   demand(plan&&policy&&account&&native,'AUTHORITY_UNAVAILABLE');
   demand(same(normalized(await this.owner.plan(tx,s,command.materialId)),plan),'STALE_REVISION');
   const next=MaintenancePolicySchema.parse(await this.owner.policy(tx,s,plan));demand(same(next,policy)&&next.allowedBuilders.includes(plan.builder),'REQUIRED_CAPABILITY_UNSUPPORTED');
   await authority.assertCurrent(tx,s,{purpose:'maintenance',sessionId:command.sessionId,expiresAt:command.expiresAt});
   const n=await this.graph.native.load(tx,s,command.sessionId);await this.graph.native.fresh(tx,s,n);demand(n.revision===native.revision&&n.binding.runId===native.binding.runId,'STALE_REVISION');
   const k=await this.graph.keys.resolve(tx,s);
   const rows=(await tx.query('SELECT key_id,generation,expires_at FROM fabric.storage_graph_nodes WHERE tenant_id=$1 AND space_id=$2 AND (class,id,revision) IN (SELECT class,id,revision FROM jsonb_to_recordset($3::jsonb) AS r(class text,id uuid,revision numeric))',[s.tenantId,s.spaceId,JSON.stringify(plan.dependencies)])).rows;
   demand(rows.length===plan.dependencies.length&&rows.every(r=>r['key_id']===k.keyId&&r['generation']===k.generation&&r['expires_at'] instanceof Date&&r['expires_at'].toISOString()>=plan!.expiresAt),'CONTENT_UNAVAILABLE');
   const row=(await tx.query(`SELECT b.owner_id,b.generation,b.purpose,b.origin_run_id,i.record,EXISTS(SELECT 1 FROM jsonb_array_elements(fabric.model_resource_costs(i.resource_id)) c WHERE c->'receipt'->>'receiptId'=i.receipt_id::text AND c->>'settled'='true') AS settled FROM fabric.storage_service_resources b
    JOIN fabric.model_resource_intervals i ON (i.tenant_id,i.space_id,i.resource_id)=(b.tenant_id,b.space_id,b.resource_id)
    WHERE b.tenant_id=$1 AND b.space_id=$2 AND b.resource_id=$3 AND i.receipt_id=$4`,[s.tenantId,s.spaceId,account.accountingResourceId,account.receiptId])).rows[0];
   demand(row&&row['owner_id']===account.ownerId&&Number(row['generation'])===account.assignmentGeneration&&row['purpose']==='maintenance'&&row['origin_run_id']===account.originRunId&&row['settled']===true,'CHECK_BINDING_MISMATCH');
   const r=row['record'] as Record<string,unknown>;demand(r['category']==='service'&&r['originRunId']===native.binding.runId&&r['ownerId']===account.ownerId,'CHECK_BINDING_MISMATCH');
   demand(same(ServiceAccountingSchema.parse(await this.owner.accounting(tx,s,n,command.key,command.expiresAt)),account),'CHECK_BINDING_MISMATCH');
  };
  return {
   resolve:async(tx,s,id)=>{
    demand(id===command.materialId,'CHECK_BINDING_MISMATCH');demand(s.grants.includes('storage:read')&&s.grants.includes('storage:write')&&s.grants.includes('storage:maintenance'),'UNAUTHORIZED');
    plan=MaintenancePlanSchema.parse(await this.owner.plan(tx,s,id));demand(plan.dependencies.length>0&&plan.dependencies.every(r=>['source','knowledge','summary','index','cache'].includes(r.class)),'REQUIRED_CAPABILITY_UNSUPPORTED');
    const ordered=[...plan.dependencies].sort((a,b)=>a.class.localeCompare(b.class)||a.id.localeCompare(b.id)||a.revision-b.revision);plan={...plan,dependencies:ordered};
    policy=MaintenancePolicySchema.parse(await this.owner.policy(tx,s,plan));demand(policy.allowedBuilders.includes(plan.builder)&&new Set(policy.allowedBuilders).size===policy.allowedBuilders.length,'REQUIRED_CAPABILITY_UNSUPPORTED');
    // Check ALL parents (including nested source audience/conflict) before the
    // first open. Current installed policy grants no cross-Space fallback.
    for(const p of plan.dependencies)await this.graph.assertCurrent(tx,s,p);
    // Destination CAS, key/parent expiry and retention precede any content open.
    const target=(await tx.query('SELECT revision,witness FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 ORDER BY revision DESC LIMIT 1',[s.tenantId,s.spaceId,cls(plan),plan.id])).rows[0];
    if(command.expected){demand(command.expected.class===cls(plan)&&command.expected.id===plan.id&&plan.revision===command.expected.revision+1,'STALE_REVISION');await this.graph.authority.entity(tx,s,command.expected);}
    else demand(!target&&plan.revision===1,'STALE_REVISION');
    demand(!(await tx.query('SELECT 1 FROM fabric.storage_entities WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 AND revision>=$5',[s.tenantId,s.spaceId,cls(plan),plan.id,plan.revision])).rows.length,'STALE_REVISION');
    const anchor=await this.graph.authority.check(tx,s,'write',command.expiresAt);
    const limits=(await tx.query('SELECT $4::timestamptz>clock_timestamp() AND $4::timestamptz<=clock_timestamp()+make_interval(secs=>(periods->>$5)::integer) AS live FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3',[s.tenantId,s.spaceId,anchor.policyRevision,plan.expiresAt,cls(plan)])).rows[0];demand(limits?.['live']===true,'RETENTION_RESTRICTED');
    const expiry=(await tx.query('SELECT min(expires_at) AS expires FROM fabric.storage_graph_nodes WHERE tenant_id=$1 AND space_id=$2 AND (class,id,revision) IN (SELECT class,id,revision FROM jsonb_to_recordset($3::jsonb) AS r(class text,id uuid,revision numeric))',[s.tenantId,s.spaceId,JSON.stringify(plan.dependencies)])).rows[0]?.['expires'];demand(expiry instanceof Date&&expiry.toISOString()>=plan.expiresAt,'RETENTION_RESTRICTED');
    native=await this.graph.native.load(tx,s,command.sessionId);await this.graph.native.fresh(tx,s,native);demand(plan.sourceTaskId===native.binding.taskId,'CHECK_BINDING_MISMATCH');
    account=ServiceAccountingSchema.parse(await this.owner.accounting(tx,s,native,command.key,command.expiresAt));
    demand(account.purpose==='maintenance'&&account.sessionId===command.sessionId&&account.originRunId===native.binding.runId&&account.expiresAt===command.expiresAt,'CHECK_BINDING_MISMATCH');
    const admittedPlan=plan,admittedPolicy=policy,admittedAccount=account,admittedNative=native,borrowed=new BorrowedUnitOfWork(s,tx);let bytes:Buffer;
    try{
     const g=new DependencyGraphRepository(borrowed,this.graph.journal,this.graph.native,this.graph.crypto,this.graph.keys);
     const knowledge=new KnowledgeSaveRepository(borrowed,this.graph.journal,this.graph.native,this.graph.crypto,this.graph.keys,new KnowledgeStatusAdmission(this.graph.crypto));
     const source=new SourceContentRepository(borrowed,this.graph.authority,this.graph.crypto);
     const result=await this.accounting.inTransaction(s,tx,account,async()=>{
      demand(same(normalized(await this.owner.plan(tx,s,command.materialId)),admittedPlan),'STALE_REVISION');
      demand(same(MaintenancePolicySchema.parse(await this.owner.policy(tx,s,admittedPlan)),policy),'REQUIRED_CAPABILITY_UNSUPPORTED');
      demand(!(await tx.query('SELECT 1 FROM fabric.storage_maintenance_admissions WHERE tenant_id=$1 AND space_id=$2 AND receipt_id=$3',[s.tenantId,s.spaceId,admittedAccount.receiptId])).rows.length,'IDEMPOTENCY_CONFLICT');
      await tx.query('SELECT fabric.storage_admit_maintenance($1,$2::jsonb)',[command.key,JSON.stringify({materialId:command.materialId,builder:admittedPlan.builder,policyDigest:hash(admittedPolicy),planDigest:hash(admittedPlan),profile:admittedPolicy.profile,region:admittedPolicy.region,receiptId:admittedAccount.receiptId,sessionId:command.sessionId,runId:admittedNative.binding.runId,nativeRevision:admittedNative.revision})]);
      for(const p of admittedPlan.dependencies)await this.graph.assertCurrent(tx,s,p);
      const inputs:Buffer[]=[];try{
       for(const p of admittedPlan.dependencies){
        demand(same(normalized(await this.owner.plan(tx,s,command.materialId)),admittedPlan),'STALE_REVISION');
        demand(same(MaintenancePolicySchema.parse(await this.owner.policy(tx,s,admittedPlan)),policy),'REQUIRED_CAPABILITY_UNSUPPORTED');
        await this.graph.assertCurrent(tx,s,p);let value:Buffer;
        if(p.class==='source')value=Buffer.from((await source.read(s,p)).narrative);
        else if(p.class==='knowledge')value=Buffer.from((await knowledge.recall(s,p)).value);
        else value=await g.read(s,p);
        inputs.push(value);
        demand(same(MaintenancePolicySchema.parse(await this.owner.policy(tx,s,admittedPlan)),policy),'REQUIRED_CAPABILITY_UNSUPPORTED');
       }
       const value=buildMaintenance(admittedPlan,inputs);buffers.push(value);return value;
      }finally{for(const b of inputs)b.fill(0);}
     });bytes=result.value;
    }finally{borrowed.close();}
    await current(tx,s,this.graph.authority);
    return {class:cls(plan),id:plan.id,revision:plan.revision,sourceTaskId:plan.sourceTaskId,expiresAt:plan.expiresAt,dependencies:plan.dependencies,bytes};
   },
   validate:async(tx,s,id,authority)=>{demand(id===command.materialId,'CHECK_BINDING_MISMATCH');await current(tx,s,authority);},
   record:async(tx,_s,key,_head)=>{await tx.query('SELECT fabric.storage_record_maintenance($1)',[key]);},
   inspectOriginal:async(tx,s,row)=>{
    const r=(await tx.query(`SELECT m.*,EXISTS(SELECT 1 FROM jsonb_array_elements(fabric.model_resource_costs(i.resource_id)) c WHERE c->'receipt'->>'receiptId'=i.receipt_id::text AND c->>'settled'='true') AS settled,i.record,p.material_id,e.session_id AS head_session FROM fabric.storage_maintenance_admissions m
     JOIN fabric.storage_maintenance_receipts result USING(tenant_id,space_id,actor_id,command_key)
     JOIN fabric.model_resource_intervals i USING(tenant_id,space_id,receipt_id) JOIN fabric.storage_head_publications p USING(tenant_id,space_id,actor_id,command_key)
     JOIN fabric.storage_epoch_publications e USING(tenant_id,space_id,actor_id,command_key)
     WHERE m.tenant_id=$1 AND m.space_id=$2 AND m.actor_id=$3 AND m.command_key=$4 AND (result.class,result.id,result.revision,result.witness)=(p.class,p.id,p.revision,p.witness)`,[s.tenantId,s.spaceId,s.actorId,command.key])).rows[0];
    demand(r&&r['settled']===true&&r['material_id']===command.materialId&&r['session_id']===command.sessionId&&r['head_session']===command.sessionId,'AUTHORITY_UNAVAILABLE');
    const n=await this.graph.native.load(tx,s,command.sessionId);await this.graph.native.fresh(tx,s,n);demand(n.binding.runId===r['run_id'],'CHECK_BINDING_MISMATCH');
    const receipt=r['record'] as Record<string,unknown>;demand(receipt['originRunId']===r['run_id']&&receipt['category']==='service','CHECK_BINDING_MISMATCH');
   }
  };
 }
 async publish(s:VerifiedScope,raw:unknown){const c=DerivedCommandSchema.parse(raw),buffers:Buffer[]=[];try{return await this.graph.publisher(this.installed(c,buffers)).publish(s,c);}finally{for(const b of buffers)b.fill(0);}}
 async lookup(s:VerifiedScope,raw:unknown){const c=DerivedCommandSchema.parse(raw);return this.graph.publisher(this.installed(c,[])).lookup(s,c);}
}
