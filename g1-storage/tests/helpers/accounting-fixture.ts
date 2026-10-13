import { randomUUID } from 'node:crypto';
import { StorageServiceAccounting,ServiceAccountingSchema } from '../../src/resource-composition.js';
import { ResourceReceiptSchema,type VerifiedScope } from '../../src/owners.js';
import type { createStorageFixture } from './pg-fixture.js';
import { demand } from '../../src/errors.js';

type Fixture=Awaited<ReturnType<typeof createStorageFixture>>;
/** Fixture-held enrollment only; no public request can supply owner/rate/budget. */
export async function enrollServiceAccounting(f:Fixture,authority:import('../../src/contracts.js').CurrentStorageAuthority,
 purpose:'ask'|'maintenance'='ask',scope:VerifiedScope=f.scope,rate=1){
 const task=await f.task(purpose,scope),resourceId=randomUUID(),ownerId=randomUUID();
 await f.admin.query('INSERT INTO fabric.storage_service_resources VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)',
  [scope.tenantId,scope.spaceId,resourceId,ownerId,purpose,task.binding.runId,scope.actorId,scope.payerId,f.department,task.leaf,task.binding.costCenter]);
 await f.admin.query("INSERT INTO fabric.model_resource_bindings VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,'reserved-until-confirmed-suspended')",
  [scope.tenantId,scope.spaceId,resourceId,ownerId,scope.actorId,scope.payerId,f.department,task.leaf,task.binding.runId,task.binding.costCenter,purpose]);
 await f.admin.query("INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,'service',1,0,1000,$4)",[scope.tenantId,scope.spaceId,resourceId,rate]);
 const receipt=ResourceReceiptSchema.parse({schemaVersion:1,assurance:'deterministic-local-only',receiptId:randomUUID(),ownerId,
  tenantId:scope.tenantId,spaceId:scope.spaceId,resourceId,assignmentGeneration:1,category:'service',start:0,end:3,rateVersion:1,rateUnits:rate,originRunId:task.binding.runId});
 let ownerCalls=0;
 const owner={ownerId,receipt:async(id:string)=>{demand(id===receipt.receiptId,'CHECK_BINDING_MISMATCH');ownerCalls++;return receipt;},suspension:async()=>{throw new Error('Service has no suspension');}};
 const command=ServiceAccountingSchema.parse({schemaVersion:1,kind:'logical-service',accountingResourceId:resourceId,ownerId,
  assignmentGeneration:1,sessionId:task.binding.sessionId,originRunId:task.binding.runId,purpose,receiptId:receipt.receiptId,expiresAt:new Date(Date.now()+30_000).toISOString()});
 return {task,receipt,command,owner,service:new StorageServiceAccounting(f.uow,f.native,owner,authority),ownerCalls:()=>ownerCalls};
}
/** Exact installed economic and command state, never descriptive content. */
export async function accountingSnapshot(f:Fixture){
 const data:unknown[]=[];
 for(const sql of [
  'SELECT allowance_id,reserved,settled,revision FROM fabric.budget_allowances ORDER BY allowance_id',
  'SELECT * FROM fabric.budget_reservations ORDER BY reservation_id',
  'SELECT * FROM fabric.usage_settlements ORDER BY settlement_id',
  'SELECT * FROM fabric.model_resource_intervals ORDER BY receipt_id',
  'SELECT * FROM fabric.model_command_receipts ORDER BY tenant_id,space_id,actor_id,command_key',
  'SELECT * FROM fabric.model_audit ORDER BY audit_id',
  'SELECT * FROM fabric.model_outbox ORDER BY outbox_id'
 ])data.push((await f.admin.query(sql)).rows);
 return data;
}
