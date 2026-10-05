import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope } from '../../../engine/contracts/src/identity.js';
import type { ScopeRef, Clock } from '../../../engine/contracts/src/identity.js';
import type { EffectExecutor, ExecutionReceipt } from '../../../engine/contracts/src/adapters.js';
import type { BudgetPort } from '../../../engine/contracts/src/budget.js';
import type { OperationInput, OperationRepository, OperationRecord } from './operation.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
export function validateExecutorReceipt(input:OperationInput,executor:EffectExecutor,receipt:ExecutionReceipt):ExecutionReceipt {
 canonicalDigest(receipt);record(receipt,['operationId','scope','executorId','outcome','externalId','usageUnits','recordedAt']);
 parseScope(receipt.scope);nonEmptyString(receipt.executorId);nonEmptyString(receipt.operationId);
 requireCondition(sameScope(receipt.scope,input.request.scope)&&receipt.operationId===input.request.operationId&&receipt.executorId===executor.executorId,'CHECK_BINDING_MISMATCH','Receipt belongs to another execution path');
 requireCondition(receipt.outcome==='committed'||receipt.outcome==='safely-failed','INVALID_SCHEMA');nonNegativeInteger(receipt.usageUnits);nonNegativeInteger(receipt.recordedAt);if(receipt.externalId!==null)nonEmptyString(receipt.externalId);
 return structuredClone(receipt);
}
export interface ReconcilePorts {clock:Clock;budget:BudgetPort;operations:OperationRepository;executor:EffectExecutor;authorize:(input:OperationInput)=>void}
export function settleOperation(ports:ReconcilePorts,input:OperationInput,receipt:ExecutionReceipt):OperationRecord {
 const validated=validateExecutorReceipt(input,ports.executor,receipt);
 ports.budget.settle({reservationId:input.request.reservationId,receiptId:canonicalDigest(validated),units:validated.usageUnits});
 return ports.operations.update(input.request.scope,input.request.operationId,validated.outcome,validated);
}
/** Unknown operations never invoke execute here. Lookup evidence retains original identity. */
export async function reconcileOperation(ports:ReconcilePorts,scope:ScopeRef,id:string):Promise<OperationRecord> {
 const row=ports.operations.get(scope,id);scope=structuredClone(row.input.request.scope);ports.authorize(row.input);
 if(row.state==='committed'||row.state==='safely-failed')return row;
 requireCondition(row.state==='unknown'||row.state==='dispatched','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
 if(ports.executor.reconciliation==='none')return ports.operations.update(scope,id,'unknown',undefined,'Human or domain recovery; reliable lookup unavailable');
 const result=await ports.executor.lookup(id,structuredClone(scope));ports.authorize(row.input);
 if(result.status==='found')return settleOperation(ports,row.input,result.receipt);
 if(result.status==='absent-safe')return settleOperation(ports,row.input,{operationId:id,scope:structuredClone(scope),executorId:ports.executor.executorId,outcome:'safely-failed',externalId:null,usageUnits:0,recordedAt:ports.clock.now()});
 return ports.operations.update(scope,id,'unknown',undefined,nonEmptyString(result.resolver));
}
