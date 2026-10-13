import { randomUUID } from 'node:crypto';
import { ResourceReceiptSchema,SuspendProofSchema,ResourceCommandSchema,resourceUnits,type SyntheticResourceOwner,type ResourceReceipt } from './resource-contract.js';
import { assertParentUnfenced } from './native-guard.js';
import { TaskCallBindingSchema } from './schema.js';
import { lockSpaceBarrier,assertRunUnfenced } from './native-imports.js';
import { currentScope,hash,recordCommand,commandReceipt,commandLive,type RepositoryHooks } from './model-repository.js';
import { resourceCostView } from './view.js';
import { uuid,timestamp } from './decoder.js';
import { demand,ModelError } from './errors.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope } from './contracts.js';
/** No operator accepts measured units, payer, rates, scope tags or suspend proof. */
export class ResourceRepository{
 constructor(readonly uow:AsyncUnitOfWork,readonly owner:SyntheticResourceOwner,readonly hooks:RepositoryHooks={}){uuid.parse(owner.ownerId);}
 async locked(tx:SqlTransaction,s:VerifiedScope,id:string){
  uuid.parse(id);demand(await lockSpaceBarrier(tx,s),'AUTHORITY_UNAVAILABLE');
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['resource/'+s.tenantId+'/'+id]);
  const b=(await tx.query('SELECT (fabric.model_resource_current($1,false)).*',[id])).rows[0];demand(b,'UNAUTHORIZED');await currentScope(tx,s);return b;
 }
 async trusted(s:VerifiedScope,id:string):Promise<ResourceReceipt>{
  uuid.parse(id);const r=ResourceReceiptSchema.parse(await this.owner.receipt(id));resourceUnits(r);
  demand(r.receiptId===id&&r.ownerId===this.owner.ownerId,'CHECK_BINDING_MISMATCH');demand(r.tenantId===s.tenantId&&r.spaceId===s.spaceId,'SCOPE_MISMATCH');return r;
 }
 async prepare(s:VerifiedScope,id:string):Promise<{receiptId:string;reservationId:string}>{
  const r=await this.trusted(s,id);return this.uow.withScope(s,async tx=>{
   await this.locked(tx,s,r.resourceId);demand(s.grants.includes('task:write'),'UNAUTHORIZED');
   const key='resource-prepare/'+id,digest=hash(r),old=await commandReceipt(tx,s,key,digest);if(old){await currentScope(tx,s);return old as {receiptId:string;reservationId:string};}
   if(r.originRunId!==null){try{const value=(await tx.query('SELECT fabric.model_current($1,NULL,false) AS binding',[r.originRunId])).rows[0]?.['binding'] as {record:unknown}|undefined;demand(value,'UNAUTHORIZED');const binding=TaskCallBindingSchema.parse(value.record);await assertRunUnfenced(tx,s,binding.runId);await assertParentUnfenced(tx,s,binding);}catch(e){this.failure(e);}}
   let reservationId:string;
   try{reservationId=String((await tx.query('SELECT fabric.model_resource_reserve($1::jsonb,$2) AS id',[JSON.stringify(r),randomUUID()])).rows[0]?.['id']);}
   catch(e){this.failure(e);}
   const result={receiptId:id,reservationId:reservationId!};await recordCommand(tx,s,key,digest,'resource-reserved',result,this.hooks);await currentScope(tx,s);return result;
  });
 }
 failure(e:unknown):never{const c=(e as {code?:string}).code;if(c==='23505')throw new ModelError('IDEMPOTENCY_CONFLICT');if(c==='P0002')throw new ModelError('BUDGET_EXHAUSTED');if(c==='P0003')throw new ModelError('OVERRUN_LIABILITY');if(c==='42501')throw new ModelError('UNAUTHORIZED');throw e;}
 async settle(s:VerifiedScope,id:string):Promise<ResourceReceipt>{
  const r=await this.trusted(s,id);return this.uow.withScope(s,async tx=>{
   await this.locked(tx,s,r.resourceId);demand(s.grants.includes('task:write'),'UNAUTHORIZED');
   const prior=(await tx.query('SELECT record FROM fabric.model_resource_intervals WHERE tenant_id=$1 AND space_id=$2 AND receipt_id=$3',[s.tenantId,s.spaceId,id])).rows[0];demand(prior&&hash(prior['record'])===hash(r),'CHECK_BINDING_MISMATCH');
   const key='resource-settle/'+id,digest=hash(r),old=await commandReceipt(tx,s,key,digest);if(old){await currentScope(tx,s);return ResourceReceiptSchema.parse(old);}
   let result:unknown;try{result=(await tx.query('SELECT fabric.model_resource_settle($1) AS receipt',[id])).rows[0]?.['receipt'];}catch(e){this.failure(e);}
   demand(hash(result)===digest,'CHECK_BINDING_MISMATCH');await recordCommand(tx,s,key,digest,'resource-charge-recorded',result,this.hooks);await currentScope(tx,s);return ResourceReceiptSchema.parse(result);
  });
 }
 async record(s:VerifiedScope,id:string){await this.prepare(s,id);return this.settle(s,id);}
 async lifecycle(s:VerifiedScope,raw:ReturnType<typeof ResourceCommandSchema.parse>){
  const c=ResourceCommandSchema.parse(raw);timestamp.parse(c.expiresAt);demand(s.grants.includes('budget:control'),'UNAUTHORIZED');
  return this.uow.withScope(s,async tx=>{
   await this.locked(tx,s,c.resourceId);const digest=hash(c),key='resource-lifecycle/'+c.key,old=await commandReceipt(tx,s,key,digest);if(old){await currentScope(tx,s);return old;}
   await commandLive(tx,c.expiresAt);const result={resourceId:c.resourceId,action:c.action,at:c.at,compute:'reserved-until-confirmed-suspended',storage:'retained',realDeletion:false,realProvisioning:false,termination:'unknown',modelUnits:0};
   await tx.query('INSERT INTO fabric.model_resource_lifecycle VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[s.tenantId,s.spaceId,c.resourceId,c.key,c.at,c.action,JSON.stringify(result)]);
   await recordCommand(tx,s,key,digest,'resource-lifecycle',result,this.hooks);await currentScope(tx,s);await commandLive(tx,c.expiresAt);return result;
  });
 }
 async confirmSuspended(s:VerifiedScope,id:string){
  uuid.parse(id);demand(s.grants.includes('budget:control'),'UNAUTHORIZED');const p=SuspendProofSchema.parse(await this.owner.suspension(id));
  demand(p.proofId===id&&p.ownerId===this.owner.ownerId,'CHECK_BINDING_MISMATCH');demand(p.tenantId===s.tenantId&&p.spaceId===s.spaceId,'SCOPE_MISMATCH');
  return this.uow.withScope(s,async tx=>{
   const b=await this.locked(tx,s,p.resourceId);demand(Number(b['generation'])===p.assignmentGeneration,'STALE_FENCE');demand(b['owner_id']===p.ownerId,'CHECK_BINDING_MISMATCH');const digest=hash(p),key='resource-suspend/'+id,old=await commandReceipt(tx,s,key,digest);if(old){await currentScope(tx,s);return old;}
   const events=(await tx.query('SELECT action,at_tick FROM fabric.model_resource_lifecycle WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3',[s.tenantId,s.spaceId,p.resourceId])).rows;
   demand(events.some(e=>e['action']==='request-suspend'&&Number(e['at_tick'])<=p.at),'CHECK_BINDING_MISMATCH');demand(!events.some(e=>e['action']==='confirmed-simulated-suspended'),'IDEMPOTENCY_CONFLICT');
   demand(!(await tx.query("SELECT 1 FROM fabric.model_resource_intervals WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3 AND category IN('active-compute','reserved-compute','cold-start') AND end_tick>$4",[s.tenantId,s.spaceId,p.resourceId,p.at])).rowCount,'IDEMPOTENCY_CONFLICT');
   await tx.query('INSERT INTO fabric.model_resource_lifecycle VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[s.tenantId,s.spaceId,p.resourceId,id,p.at,p.status,JSON.stringify(p)]);
   await recordCommand(tx,s,key,digest,'resource-simulated-suspended',p,this.hooks);await currentScope(tx,s);return p;
  });
 }
 async inspect(s:VerifiedScope,resourceId:string,sessionId:string|null=null){
  return this.uow.withScope(s,async tx=>{
   const b=await this.locked(tx,s,resourceId);let runId:string|null=null;
   if(sessionId!==null){uuid.parse(sessionId);const row=(await tx.query('SELECT binding,run_id FROM fabric.model_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[s.tenantId,s.spaceId,sessionId])).rows[0];demand(row,'UNAUTHORIZED');const binding=row['binding'] as {payerId:string};demand(binding.payerId===s.payerId,'UNAUTHORIZED');runId=String(row['run_id']);}
   const raw=(await tx.query('SELECT fabric.model_resource_costs($1) AS costs',[resourceId])).rows[0]?.['costs'] as {receipt:unknown;settled:boolean}[];
   const intervals=raw.map(r=>({receipt:ResourceReceiptSchema.parse(r.receipt),settled:r.settled}));
   const lifecycle=(await tx.query('SELECT action,at_tick FROM fabric.model_resource_lifecycle WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3 ORDER BY at_tick,key',[s.tenantId,s.spaceId,resourceId])).rows.map(e=>({action:String(e['action']),at:Number(e['at_tick'])}));
   const modelLiability=sessionId===null?null:(await tx.query('SELECT fabric.model_native_costs($1) AS costs',[sessionId])).rows[0]?.['costs'] as {reserved:number;actual:number;pendingExposure:number}|null;
   let modelCategoryTotals:{model:number;service:number}|null=null;
   if(sessionId!==null){const totals=(await tx.query("SELECT coalesce(sum(c.amount) FILTER(WHERE c.category='model'),0) AS model,coalesce(sum(c.amount) FILTER(WHERE c.category='service'),0) AS service FROM fabric.model_usage_categories c JOIN fabric.model_attempts a USING(tenant_id,space_id,attempt_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.session_id=$3",[s.tenantId,s.spaceId,sessionId])).rows[0]!;modelCategoryTotals={model:Number(totals['model']),service:Number(totals['service'])};}
   await currentScope(tx,s);return resourceCostView({resourceId,assignmentGeneration:Number(b['generation']),payerId:String(b['payer_id']),costCenter:String(b['cost_center']),purpose:String(b['purpose']),allowanceId:String(b['allowance_id']),runId,intervals,lifecycle,modelLiability,modelCategoryTotals});
  });
 }
}
