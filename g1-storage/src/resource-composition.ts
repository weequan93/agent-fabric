import { ResourceRepository, ResourceReceiptSchema, assertVerifiedScope, revalidateScope,
 NativeRepository, type AsyncUnitOfWork, type SqlTransaction, type VerifiedScope,
 type SyntheticResourceOwner, type ResourceReceipt, type NativeSnapshot } from './owners.js';
import { commandLive, currentScope } from '../../g1-model/src/model-repository.js';
import { object, version, uuid, literal, timestamp, enumeration, positive } from './decoder.js';
import { demand } from './errors.js';
import { StorageError } from './errors.js';
import { ModelError } from '../../g1-model/src/errors.js';
import type { CurrentStorageAuthority } from './contracts.js';

export const ServiceAccountingSchema = object({schemaVersion:version,
 kind:literal('logical-service'),accountingResourceId:uuid,ownerId:uuid,
 assignmentGeneration:positive,sessionId:uuid,originRunId:uuid,
 purpose:enumeration('ask','maintenance'),receiptId:uuid,expiresAt:timestamp});
export type ServiceAccounting = ReturnType<typeof ServiceAccountingSchema.parse>;

/** Borrow only the exact issued scope and transaction; outer authenticated UoW
 * owns BEGIN/COMMIT/ROLLBACK and authentication at both ends. No transaction SQL
 * is intercepted or rewritten. Close the capability before the outer callback exits.
 */
export class BorrowedUnitOfWork implements AsyncUnitOfWork {
 private active = true;
 constructor(private readonly scope:VerifiedScope,private readonly tx:SqlTransaction){assertVerifiedScope(scope);}
 close():void{this.active=false;}
 async withScope<T>(target:VerifiedScope,work:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  demand(this.active,'TRANSACTION_CLOSED');demand(target===this.scope,'UNAUTHORIZED');
  await revalidateScope(target);const result=await work(this.tx);
  demand(this.active,'TRANSACTION_CLOSED');await revalidateScope(target);return result;
 }
}

/** Installed F04 owner on a single outer authenticated transaction. API accepts
 * trusted installed accounting intent, never measured units or client budgets.
 * BOTH Ask and deterministic summary/index/cache maintenance use this path.
 */
export class StorageServiceAccounting {
 constructor(readonly authenticated:AsyncUnitOfWork,readonly native:NativeRepository,
  readonly owner:SyntheticResourceOwner,readonly authority:CurrentStorageAuthority){}
 async inTransaction<T>(scope:VerifiedScope,tx:SqlTransaction,raw:ServiceAccounting,
  work:(admitted:NativeSnapshot)=>Promise<T>,publish?:(value:T,admitted:NativeSnapshot)=>Promise<void>):Promise<{value:T;receipt:ResourceReceipt}>{
  assertVerifiedScope(scope);const c=ServiceAccountingSchema.parse(raw);
  demand(c.ownerId===this.owner.ownerId,'CHECK_BINDING_MISMATCH');
  const borrowed=new BorrowedUnitOfWork(scope,tx);
  const intent={purpose:c.purpose,sessionId:c.sessionId,expiresAt:c.expiresAt};
  const fresh=async()=>{
   // A bound shared-source authority acquires its entire sorted dependency
   // Space set first. Native load and F04 accounting take a single-Space barrier.
   await this.authority.assertCurrent(tx,scope,intent);
   await currentScope(tx,scope);await commandLive(tx,c.expiresAt);
   const s=await this.native.load(tx,scope,c.sessionId);await this.native.fresh(tx,scope,s);
   demand(s.binding.runId===c.originRunId&&s.binding.intent==='Ask'
    &&s.binding.purpose===(c.purpose==='ask'?'answer':'maintenance')
    &&s.admission.executionClass==='service'&&s.admission.resourceId===null
    &&s.admission.computerCapability===null&&!s.admission.targetEffect&&!s.admission.approvalRequired,
    'REQUIRED_CAPABILITY_UNSUPPORTED');
   if(c.purpose==='maintenance')demand(scope.grants.includes('storage:maintenance'),'UNAUTHORIZED');
   // f05-02's subtype registry extends the installed relational resource domain.
   // No NativeAdmission/ComputerAssignment or runtime resource is created here.
   const row=(await tx.query('SELECT owner_id,generation,purpose,origin_run_id FROM fabric.storage_service_resources WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3',
    [scope.tenantId,scope.spaceId,c.accountingResourceId])).rows[0];
   demand(row&&row['owner_id']===c.ownerId&&Number(row['generation'])===c.assignmentGeneration
    &&row['purpose']===c.purpose&&row['origin_run_id']===c.originRunId,'CHECK_BINDING_MISMATCH');
   demand(!(await tx.query('SELECT 1 FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3',
    [scope.tenantId,scope.spaceId,c.accountingResourceId])).rowCount,'CHECK_BINDING_MISMATCH');
   await this.authority.assertCurrent(tx,scope,intent);await currentScope(tx,scope);
   await commandLive(tx,c.expiresAt);await this.native.fresh(tx,scope,s);return s;
  };
  try{
   await fresh();
   // Fetch via installed owner and pin its exact immutable receipt across BOTH
   // repository operations; do not permit an owner to change it between awaits.
   const receipt=ResourceReceiptSchema.parse(await this.owner.receipt(c.receiptId));
   demand(receipt.receiptId===c.receiptId&&receipt.ownerId===c.ownerId
    &&receipt.tenantId===scope.tenantId&&receipt.spaceId===scope.spaceId
    &&receipt.resourceId===c.accountingResourceId&&receipt.assignmentGeneration===c.assignmentGeneration
    &&receipt.category==='service'&&receipt.originRunId===c.originRunId,'CHECK_BINDING_MISMATCH');
   const pinned:SyntheticResourceOwner={ownerId:this.owner.ownerId,
    receipt:async id=>{demand(id===receipt.receiptId,'CHECK_BINDING_MISMATCH');return receipt;},
    suspension:async()=>{throw new Error('Service accounting has no suspension port');}};
   const resource=new ResourceRepository(borrowed,pinned);
   await resource.prepare(scope,c.receiptId);
   const admitted=await fresh(); // allowance/owner waits may have expired/restricted the request
   // Compute/stage only. Caller must use publish for disclosure/publication;
   // it runs after installed settlement and current checks, under these locks.
   const value=await work(admitted);
   await fresh();
   const settled=await resource.settle(scope,c.receiptId);
   const final=await fresh(); // same owner settlement plus fresh policy/native/expiry checks
   await publish?.(value,final);await fresh();
   return {value,receipt:settled};
  }catch(error){
   if(error instanceof ModelError&&['BUDGET_EXHAUSTED','UNAUTHORIZED','CHECK_BINDING_MISMATCH','IDEMPOTENCY_CONFLICT','STALE_FENCE'].includes(error.code)){
    throw new StorageError(error.code as 'BUDGET_EXHAUSTED'|'UNAUTHORIZED'|'CHECK_BINDING_MISMATCH'|'IDEMPOTENCY_CONFLICT'|'STALE_FENCE');
   }throw error;
  }finally{borrowed.close();}
 }
 async execute<T>(scope:VerifiedScope,c:ServiceAccounting,work:(tx:SqlTransaction,s:NativeSnapshot)=>Promise<T>,
  publish?:(tx:SqlTransaction,value:T,s:NativeSnapshot)=>Promise<void>){
  return this.authenticated.withScope(scope,tx=>this.inTransaction(scope,tx,c,s=>work(tx,s),
   publish?((value,s)=>publish(tx,value,s)):undefined));
 }
}
