import { canonicalDigest, requireCondition } from '../../../engine/contracts/src/identity.js';
import type { ScopeRef, FencingToken, Clock } from '../../../engine/contracts/src/identity.js';
import type { EffectExecutor } from '../../../engine/contracts/src/adapters.js';
import type { BudgetPort } from '../../../engine/contracts/src/budget.js';
import { ApprovalRegistry, OperationRepository, validateOperationInput } from './operation.js';
import type { OperationInput, OperationRecord } from './operation.js';
import { reconcileOperation, settleOperation } from './reconcile.js';
export interface BrokerAuthority {actorId:string;payerId:string;policyRevision:number}
export interface BrokerPorts {clock:Clock;budget:BudgetPort;approvals:ApprovalRegistry;operations:OperationRepository;executor:EffectExecutor;authorize:(input:OperationInput,phase:'prepare'|'dispatch'|'reconcile'|'read')=>BrokerAuthority;currentFence:(input:OperationInput)=>FencingToken;assertArtifactCurrent:(input:OperationInput)=>void}
/** No model worker receives the approval owner, ledger owner or executor directly. */
export class EffectBroker {
 constructor(private readonly ports:BrokerPorts){}
 prepare(input:OperationInput):OperationRecord {
  this.preconditions(input,'prepare');const row=this.ports.operations.prepare(input);
  if(row.state!=='prepared')return row;
  const reservation=this.ports.budget.reserve({reservationId:input.request.reservationId,operationId:input.request.operationId,scope:input.request.scope,actorId:input.request.actorId,payerId:input.payerId,runId:input.runId,purpose:'task',allowanceId:input.allowanceId,units:input.units});
  requireCondition(reservation.state==='reserved','BUDGET_EXHAUSTED','A live reservation is required');return row;
 }
 inspect(scope:ScopeRef,id:string):OperationRecord {const row=this.ports.operations.get(scope,id);this.ports.authorize(row.input,'read');return row;}
 async dispatch(scope:ScopeRef,id:string):Promise<OperationRecord> {
  const row=this.ports.operations.get(scope,id);scope=structuredClone(row.input.request.scope);this.preconditions(row.input,'dispatch');
  if(row.state==='committed'||row.state==='safely-failed')return row;
  requireCondition(row.state==='prepared','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Never blindly redispatch unknown effects');
  this.prepare(row.input);this.ports.operations.update(scope,id,'dispatched');
  try {const receipt=await this.ports.executor.execute(structuredClone(row.input.request));this.ports.authorize(row.input,'reconcile');return settleOperation(this.reconcilePorts(),row.input,receipt);}
  catch {this.ports.budget.markUnknown(row.input.request.reservationId);return this.ports.operations.update(scope,id,'unknown',undefined,'Lookup original operation before any continuation');}
 }
 reconcile(scope:ScopeRef,id:string):Promise<OperationRecord> {return reconcileOperation(this.reconcilePorts(),scope,id);}
 private reconcilePorts(){return {clock:this.ports.clock,budget:this.ports.budget,operations:this.ports.operations,executor:this.ports.executor,authorize:(input:OperationInput)=>{this.ports.authorize(input,'reconcile');}};}
 private preconditions(input:OperationInput,phase:'prepare'|'dispatch'):void {
  input=validateOperationInput(input);const authority=this.ports.authorize(input,phase),request=input.request;
  requireCondition(authority.actorId===request.actorId&&authority.payerId===input.payerId,'UNAUTHORIZED','Actor and payer are server authorities');
  requireCondition(authority.policyRevision===request.policyRevision,'APPROVAL_MISMATCH','Policy changed since approval');
  requireCondition(request.intent==='act','INTENT_EXCEEDED');
  requireCondition(canonicalDigest(request.parameters)===request.parametersDigest,'APPROVAL_MISMATCH','Partial or changed arguments');
  const approval=this.ports.approvals.get(input.approvalId);
  for(const key of ['scope','operationId','actorId','target','parametersDigest','artifactDigest','policyRevision'] as const)requireCondition(canonicalDigest(approval[key])===canonicalDigest(request[key]),'APPROVAL_MISMATCH','Exact approval binding changed');
  requireCondition(input.lease.expiresAt>this.ports.clock.now(),'LEASE_EXPIRED');
  requireCondition(canonicalDigest(input.lease.fence)===canonicalDigest(request.fence)&&canonicalDigest(this.ports.currentFence(input))===canonicalDigest(request.fence),'STALE_FENCE');
  this.ports.assertArtifactCurrent(input);
 }
}
