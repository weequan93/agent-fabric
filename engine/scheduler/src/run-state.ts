import { canonicalDigest, nonEmptyString, nonNegativeInteger, requireCondition, type ScopeRef } from '../../contracts/src/identity.js';
import { parseScope, parseVersionPins, type VersionPins } from '../../contracts/src/task-envelope.js';

export const RUN_STATES = ['queued', 'preparing', 'running', 'verifying', 'waiting', 'paused', 'cancelling', 'reconciling', 'succeeded', 'partial', 'failed', 'cancelled'] as const;
export type RunState = typeof RUN_STATES[number];
export type WaitingReason = 'input' | 'approval' | 'budget' | 'resource' | 'connection' | 'permission' | 'unknown-effect';
export interface Waiting { reason: WaitingReason; resolver: string; nextAction: string }
export interface RunRecord {
  scope: ScopeRef; taskId: string; runId: string; attempt: number; requirementsRevision: number;
  versions: VersionPins; state: RunState; revision: number; generation: number;
  waiting: Waiting | null; evidence: string[]; charges: number;
}
export interface RunGuard {
  currentAuthorized?: boolean; checksSatisfied?: boolean; controllerVerifier?: boolean;
  deliveryRequired?: boolean; deliveryConfirmed?: boolean; unknownEffect?: boolean;
  waiting?: Waiting; evidence?: readonly string[]; additionalCharges?: number;
}
export const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = Object.freeze({
  queued: ['preparing', 'waiting', 'cancelling', 'failed'],
  preparing: ['running', 'waiting', 'cancelling', 'failed'],
  running: ['verifying', 'waiting', 'paused', 'cancelling', 'reconciling', 'failed', 'partial'],
  verifying: ['succeeded', 'partial', 'failed', 'waiting', 'cancelling', 'reconciling'],
  waiting: ['preparing', 'running', 'verifying', 'paused', 'cancelling', 'reconciling', 'failed'],
  paused: ['running', 'waiting', 'cancelling'],
  cancelling: ['reconciling', 'cancelled'],
  reconciling: ['verifying', 'waiting', 'failed', 'partial', 'cancelled'],
  succeeded: [], partial: [], failed: [], cancelled: [],
});
export function isTerminal(state: RunState): boolean { return state === 'succeeded' || state === 'partial' || state === 'failed' || state === 'cancelled'; }
export function createRun(input: { scope: ScopeRef; taskId: string; runId: string; attempt: number; requirementsRevision: number; versions: VersionPins; generation?: number }): RunRecord {
  const attempt = nonNegativeInteger(input.attempt, 'attempt'); requireCondition(attempt > 0, 'INVALID_SCHEMA', 'Attempt starts at one');
  return { scope: parseScope(input.scope), taskId: nonEmptyString(input.taskId), runId: nonEmptyString(input.runId), attempt, requirementsRevision: nonNegativeInteger(input.requirementsRevision), versions: parseVersionPins(input.versions), state: 'queued', revision: 0, generation: nonNegativeInteger(input.generation ?? 0), waiting: null, evidence: [], charges: 0 };
}
export function transitionRun(record: RunRecord, to: RunState, guard: RunGuard = {}): RunRecord {
  canonicalDigest(record);
  requireCondition(RUN_STATES.includes(record.state) && RUN_STATES.includes(to), 'INVALID_SCHEMA', 'Unknown lifecycle state');
  requireCondition(!isTerminal(record.state), 'TERMINAL_RUN', 'Terminal attempts require a new Run');
  requireCondition(RUN_TRANSITIONS[record.state].includes(to), 'INVALID_SCHEMA', 'Illegal lifecycle transition');
  requireCondition(guard.currentAuthorized === true, 'UNAUTHORIZED', 'State changes require current authority');
  requireCondition(guard.unknownEffect !== false || record.waiting?.reason !== 'unknown-effect' || record.state === 'reconciling', 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'Unknown outcomes clear only at a reconciliation boundary');
  const unknown = guard.unknownEffect ?? (record.waiting?.reason === 'unknown-effect');
  requireCondition(!unknown || !['preparing', 'running', 'verifying', 'succeeded', 'cancelled'].includes(to), 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'Unknown effects must be reconciled');
  if (to === 'succeeded') {
    requireCondition(guard.checksSatisfied === true && guard.controllerVerifier === true, 'CHECK_BINDING_MISMATCH', 'Controller-verified required checks determine success');
    requireCondition(guard.deliveryRequired !== true || guard.deliveryConfirmed === true, 'ARTIFACT_NOT_COMMITTED', 'Required delivery remains pending');
  }
  if (to === 'waiting') {
    requireCondition(guard.waiting !== undefined, 'INVALID_SCHEMA', 'Waiting requires a reason and resolver');
    requireCondition(['input','approval','budget','resource','connection','permission','unknown-effect'].includes(guard.waiting.reason), 'INVALID_SCHEMA', 'Unsupported waiting reason');
    nonEmptyString(guard.waiting.resolver); nonEmptyString(guard.waiting.nextAction);
    requireCondition(!unknown || guard.waiting.reason === 'unknown-effect', 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'Waiting must retain unknown-effect state');
  }
  const added = nonNegativeInteger(guard.additionalCharges ?? 0, 'additionalCharges');
  const evidence = (guard.evidence ?? []).map(value => nonEmptyString(value, 'evidence'));
  requireCondition(!isTerminal(to) || record.evidence.length + evidence.length > 0, 'CHECK_BINDING_MISMATCH', 'Terminal outcomes require recorded evidence');
  const waiting = to === 'waiting' ? structuredClone(guard.waiting!) : (unknown ? structuredClone(record.waiting ?? { reason: 'unknown-effect' as const, resolver: 'effect-broker', nextAction: 'Reconcile recorded operation before continuation' }) : null);
  return { ...structuredClone(record), state: to, revision: nonNegativeInteger(record.revision + 1), waiting, evidence: [...record.evidence, ...evidence], charges: nonNegativeInteger(record.charges + added) };
}
