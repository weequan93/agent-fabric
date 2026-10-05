import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope, type Clock, type FencingToken, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
import type { EffectRequest, ExecutionReceipt } from '../../../engine/contracts/src/adapters.js';

export interface ExecutionLease { leaseId: string; scope: ScopeRef; runId: string; actorId: string; fence: FencingToken; expiresAt: number }
export interface OperationInput { request: EffectRequest; taskId: string; runId: string; payerId: string; allowanceId: string; units: number; approvalId: string; lease: ExecutionLease }
export interface ApprovalBinding { approvalId: string; scope: ScopeRef; operationId: string; actorId: string; target: string; parametersDigest: string; artifactDigest: string | null; policyRevision: number; expiresAt: number }
export type OperationState = 'prepared' | 'dispatched' | 'unknown' | 'committed' | 'safely-failed';
export interface OperationRecord { input: OperationInput; requestDigest: string; state: OperationState; receipt: ExecutionReceipt | null; resolver: string | null }
function identity(scope: ScopeRef, id: string): string { const s = parseScope(scope); return JSON.stringify([s.tenantId,s.spaceId,nonEmptyString(id)]); }
function digest(value: unknown): string { const d = nonEmptyString(value, 'digest'); requireCondition(/^[a-f0-9]{64}$/.test(d), 'INVALID_SCHEMA', 'SHA256 required'); return d; }
function fence(value: unknown): FencingToken { const f = record(value, ['taskGeneration','runGeneration','runtimeGeneration']); return { taskGeneration: nonNegativeInteger(f.taskGeneration), runGeneration: nonNegativeInteger(f.runGeneration), runtimeGeneration: nonNegativeInteger(f.runtimeGeneration) }; }
function parseApproval(value: unknown): ApprovalBinding {
  const p = record(value, ['approvalId','scope','operationId','actorId','target','parametersDigest','artifactDigest','policyRevision','expiresAt']);
  return { approvalId: nonEmptyString(p.approvalId), scope: parseScope(p.scope), operationId: nonEmptyString(p.operationId), actorId: nonEmptyString(p.actorId), target: nonEmptyString(p.target), parametersDigest: digest(p.parametersDigest), artifactDigest: p.artifactDigest === null ? null : digest(p.artifactDigest), policyRevision: nonNegativeInteger(p.policyRevision), expiresAt: nonNegativeInteger(p.expiresAt) };
}
export function validateOperationInput(value: unknown): OperationInput {
  canonicalDigest(value);
  const p = record(value, ['request','taskId','runId','payerId','allowanceId','units','approvalId','lease']);
  const r = record(p.request, ['scope','operationId','actorId','target','parameters','parametersDigest','artifactDigest','policyRevision','intent','fence','reservationId']);
  requireCondition(typeof r.parameters === 'object' && r.parameters !== null && !Array.isArray(r.parameters), 'INVALID_SCHEMA', 'Complete parameter object required');
  const parameters = record(r.parameters, Object.keys(r.parameters as object));
  requireCondition(r.intent === 'ask' || r.intent === 'plan' || r.intent === 'act', 'INVALID_SCHEMA', 'Explicit intent required');
  const request: EffectRequest = { scope: parseScope(r.scope), operationId: nonEmptyString(r.operationId), actorId: nonEmptyString(r.actorId), target: nonEmptyString(r.target), parameters: structuredClone(parameters), parametersDigest: digest(r.parametersDigest), artifactDigest: r.artifactDigest === null ? null : digest(r.artifactDigest), policyRevision: nonNegativeInteger(r.policyRevision), intent: r.intent, fence: fence(r.fence), reservationId: nonEmptyString(r.reservationId) };
  requireCondition(request.parametersDigest === canonicalDigest(request.parameters), 'APPROVAL_MISMATCH', 'Complete parameters must match digest');
  const l = record(p.lease, ['leaseId','scope','runId','actorId','fence','expiresAt']);
  const lease: ExecutionLease = { leaseId: nonEmptyString(l.leaseId), scope: parseScope(l.scope), runId: nonEmptyString(l.runId), actorId: nonEmptyString(l.actorId), fence: fence(l.fence), expiresAt: nonNegativeInteger(l.expiresAt) };
  const result: OperationInput = { request, taskId: nonEmptyString(p.taskId), runId: nonEmptyString(p.runId), payerId: nonEmptyString(p.payerId), allowanceId: nonEmptyString(p.allowanceId), units: nonNegativeInteger(p.units), approvalId: nonEmptyString(p.approvalId), lease };
  requireCondition(sameScope(request.scope, lease.scope) && request.actorId === lease.actorId && result.runId === lease.runId, 'SCOPE_MISMATCH', 'Lease must bind exact scope, actor and Run');
  requireCondition(canonicalDigest(request.fence) === canonicalDigest(lease.fence), 'STALE_FENCE', 'Lease and request generations disagree');
  return structuredClone(result);
}
/** Trusted G0 approver port; ordinary agents cannot mint approvals. */
export class ApprovalRegistry {
  private readonly bindings = new Map<string, ApprovalBinding>(); private readonly revoked = new Set<string>();
  constructor(private readonly clock: Clock, private readonly authorizeApprover: (approval: ApprovalBinding) => void) {}
  approve(binding: ApprovalBinding): ApprovalBinding {
    const parsed = parseApproval(binding); this.authorizeApprover(structuredClone(parsed));
    requireCondition(parsed.expiresAt > nonNegativeInteger(this.clock.now()), 'APPROVAL_EXPIRED', 'Approval must be current');
    requireCondition(!this.revoked.has(parsed.approvalId), 'APPROVAL_MISMATCH', 'Revoked approval cannot be restored');
    const current = this.bindings.get(parsed.approvalId);
    requireCondition(current === undefined || canonicalDigest(current) === canonicalDigest(parsed), 'IDEMPOTENCY_CONFLICT', 'Approval identity is immutable');
    this.bindings.set(parsed.approvalId, structuredClone(parsed)); return structuredClone(parsed);
  }
  revoke(id: string): void { const current = this.bindings.get(nonEmptyString(id)); requireCondition(current !== undefined, 'APPROVAL_MISMATCH', 'Approval unavailable'); this.authorizeApprover(structuredClone(current)); this.revoked.add(id); }
  get(id: string): ApprovalBinding {
    const current = this.bindings.get(nonEmptyString(id));
    requireCondition(current !== undefined && !this.revoked.has(id), 'APPROVAL_MISMATCH', 'Current exact approval required');
    requireCondition(current.expiresAt > nonNegativeInteger(this.clock.now()), 'APPROVAL_EXPIRED', 'Approval expired'); return structuredClone(current);
  }
}
/** Sole operation owner; no execution or budget authority in this repository. */
export class OperationRepository {
  private readonly operations = new Map<string, OperationRecord>();
  constructor(private readonly authorize: (input: OperationInput) => void) {}
  prepare(input: OperationInput): OperationRecord {
    const parsed = validateOperationInput(input); this.authorize(structuredClone(parsed)); const id = identity(parsed.request.scope, parsed.request.operationId); const requestDigest = canonicalDigest(parsed);
    const current = this.operations.get(id); requireCondition(current === undefined || current.requestDigest === requestDigest, 'IDEMPOTENCY_CONFLICT', 'Operation identity is immutable');
    if (current !== undefined) return structuredClone(current);
    const result: OperationRecord = { input: parsed, requestDigest, state: 'prepared', receipt: null, resolver: null };
    this.operations.set(id, result); return structuredClone(result);
  }
  get(scope: ScopeRef, operationId: string): OperationRecord { return structuredClone(this.current(scope, operationId)); }
  /** Owner checkpoint only; a snapshot is not approval or execution authority. */
  snapshot(scope: ScopeRef): OperationRecord[] {
    const requested=parseScope(scope);const rows:OperationRecord[]=[];
    for(const row of this.operations.values()) if(sameScope(row.input.request.scope,requested)){this.authorize(structuredClone(row.input));rows.push(structuredClone(row));}
    return rows;
  }
  restore(records: readonly OperationRecord[]): void {
    canonicalDigest(records);requireCondition(Array.isArray(records),'INVALID_SCHEMA','Operation checkpoint must be an array');
    const restored=new Map(this.operations);const seen=new Set<string>();
    for(const value of records){
      const parsed=record(value,['input','requestDigest','state','receipt','resolver']);const input=validateOperationInput(parsed.input);this.authorize(structuredClone(input));
      const requestDigest=digest(parsed.requestDigest);requireCondition(requestDigest===canonicalDigest(input),'CHECK_BINDING_MISMATCH','Checkpoint input digest mismatch');
      requireCondition(parsed.state==='prepared'||parsed.state==='dispatched'||parsed.state==='unknown'||parsed.state==='committed'||parsed.state==='safely-failed','INVALID_SCHEMA','Invalid checkpoint state');
      const id=identity(input.request.scope,input.request.operationId);requireCondition(!seen.has(id),'IDEMPOTENCY_CONFLICT','Duplicate checkpoint operation');seen.add(id);
      const terminal=parsed.state==='committed'||parsed.state==='safely-failed';let receipt:ExecutionReceipt|null=null;
      if(parsed.receipt!==null){
        const r=record(parsed.receipt,['scope','operationId','executorId','outcome','externalId','usageUnits','recordedAt']);const scope=parseScope(r.scope);
        requireCondition(terminal&&(r.outcome==='committed'||r.outcome==='safely-failed')&&r.outcome===parsed.state,'INVALID_SCHEMA','Checkpoint receipt must match terminal outcome');
        requireCondition(sameScope(scope,input.request.scope)&&r.operationId===input.request.operationId,'SCOPE_MISMATCH','Checkpoint receipt binds another operation');
        requireCondition(r.externalId===null||typeof r.externalId==='string','INVALID_SCHEMA','Invalid external identity');
        receipt={scope,operationId:nonEmptyString(r.operationId),executorId:nonEmptyString(r.executorId),outcome:r.outcome,externalId:r.externalId,usageUnits:nonNegativeInteger(r.usageUnits),recordedAt:nonNegativeInteger(r.recordedAt)};
      }
      requireCondition(!terminal||receipt!==null,'CHECK_BINDING_MISMATCH','Terminal checkpoint requires original execution receipt');
      let resolver=parsed.resolver===null?null:nonEmptyString(parsed.resolver);requireCondition(!terminal||resolver===null,'INVALID_SCHEMA','Terminal checkpoint cannot remain unresolved');
      const state:OperationState=parsed.state==='dispatched'?'unknown':parsed.state;
      if(parsed.state==='dispatched'&&resolver===null)resolver='effect-reconciliation';
      const candidate:OperationRecord={input,requestDigest,state,receipt,resolver};const current=this.operations.get(id);
      requireCondition(current===undefined||current.requestDigest===requestDigest,'IDEMPOTENCY_CONFLICT','Checkpoint cannot change operation identity');
      if(current!==undefined){
        this.authorize(structuredClone(current.input));
        if(current.state==='committed'||current.state==='safely-failed'){
          requireCondition(!terminal||(current.state===state&&canonicalDigest(current.receipt)===canonicalDigest(receipt)),'IDEMPOTENCY_CONFLICT','Conflicting terminal checkpoint');
          restored.set(id,structuredClone(current));continue;
        }
        if((current.state==='unknown'||current.state==='dispatched')&&state==='prepared'){
          restored.set(id,{...structuredClone(current),state:'unknown',resolver:current.resolver??'effect-reconciliation'});continue;
        }
        if(current.state==='unknown'&&state==='unknown')candidate.resolver=current.resolver??candidate.resolver;
      }
      restored.set(id,structuredClone(candidate));
    }
    // Revalidate current grants after all validation callbacks, before one map commit.
    for(const id of seen)this.authorize(structuredClone(restored.get(id)!.input));
    this.operations.clear();for(const [id,row] of restored)this.operations.set(id,row);
  }
  update(scope: ScopeRef, operationId: string, state: OperationState, receipt?: ExecutionReceipt, resolver?: string): OperationRecord {
    const current = this.current(scope, operationId);
    const transitions: Record<OperationState, readonly OperationState[]> = { prepared: ['dispatched','safely-failed'], dispatched: ['unknown','committed','safely-failed'], unknown: ['committed','safely-failed'], committed: [], 'safely-failed': [] };
    requireCondition(Object.hasOwn(transitions, state), 'INVALID_SCHEMA', 'Invalid operation state');
    if (current.state === state) {
      requireCondition(receipt === undefined || canonicalDigest(receipt) === canonicalDigest(current.receipt), 'IDEMPOTENCY_CONFLICT', 'Conflicting duplicate settlement');
      if(state==='unknown'&&resolver!==undefined)current.resolver=nonEmptyString(resolver);
      else requireCondition(resolver === undefined || resolver === current.resolver,'IDEMPOTENCY_CONFLICT');
      return structuredClone(current);
    }
    requireCondition(transitions[current.state].includes(state), 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'Unsafe operation transition');
    if (receipt !== undefined) {
      canonicalDigest(receipt); const r = record(receipt, ['scope','operationId','executorId','outcome','externalId','usageUnits','recordedAt']);
      parseScope(r.scope); nonEmptyString(r.operationId); nonEmptyString(r.executorId); nonNegativeInteger(r.usageUnits); nonNegativeInteger(r.recordedAt);
      requireCondition(r.externalId === null || typeof r.externalId === 'string', 'INVALID_SCHEMA', 'Invalid external receipt identity');
      requireCondition((state === 'committed' || state === 'safely-failed') && r.outcome === state, 'INVALID_SCHEMA', 'Receipt outcome must match terminal settlement');
      requireCondition(sameScope(receipt.scope, current.input.request.scope) && receipt.operationId === operationId, 'SCOPE_MISMATCH', 'Receipt must bind exact operation');
    }
    requireCondition((state !== 'committed'&&state!=='safely-failed') || receipt !== undefined, 'INVALID_SCHEMA', 'Terminal effect outcomes require execution evidence');
    const next: OperationRecord = { ...current, state, receipt: receipt === undefined ? current.receipt : structuredClone(receipt), resolver: state==='committed'||state==='safely-failed'?null:resolver === undefined ? current.resolver : nonEmptyString(resolver) };
    this.operations.set(identity(scope, operationId), next); return structuredClone(next);
  }
  private current(scope: ScopeRef, operationId: string): OperationRecord {
    const result = this.operations.get(identity(scope, operationId)); requireCondition(result !== undefined, 'UNAUTHORIZED', 'Current operation authority required'); this.authorize(structuredClone(result.input)); return result;
  }
}
