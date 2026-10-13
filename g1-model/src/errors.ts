import { DomainError } from '../../engine/contracts/src/identity.js';
import { FoundationError } from '../../g1-foundations/src/contracts.js';

export { DomainError, FoundationError };
export type ModelErrorCode = 'INVALID_SCHEMA' | 'UNSUPPORTED_VERSION' | 'NUMERIC_OVERFLOW'
 | 'REQUIRED_CAPABILITY_UNSUPPORTED' | 'MODEL_UNAVAILABLE' | 'QUALIFICATION_MISMATCH'
 | 'UNAUTHORIZED' | 'AUTHORITY_UNAVAILABLE' | 'SCOPE_MISMATCH' | 'INTENT_EXCEEDED'
 | 'STALE_REVISION' | 'STALE_FENCE' | 'EXPIRED_COMMAND' | 'IDEMPOTENCY_CONFLICT'
 | 'BUDGET_EXHAUSTED' | 'TERMINAL_RUN' | 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'
 | 'CHECK_BINDING_MISMATCH' | 'OVERRUN_LIABILITY' | 'CLEANUP_UNPROVEN';

/** Fixed safe messages: never include prompts, SQL, credentials or provider bodies. */
export class ModelError extends Error {
 constructor(readonly code: ModelErrorCode) { super(code); this.name = 'ModelError'; }
}
export function demand(condition: unknown, code: ModelErrorCode = 'INVALID_SCHEMA'): asserts condition {
 if (!condition) throw new ModelError(code);
}
export interface SafeFailure {
 readonly error: ModelErrorCode | 'UNKNOWN_COMMIT';
 readonly status: 'refused' | 'unknown';
 readonly replayAllowed: false;
 readonly recovery: 'original-key-lookup' | 'inspect-current-authority';
}
/** Only the genuine native typed exception establishes COMMIT uncertainty. */
export function safeFailure(error: unknown): SafeFailure {
 if (error instanceof FoundationError && error.code === 'UNKNOWN_COMMIT') {
  return Object.freeze({ error: 'UNKNOWN_COMMIT', status: 'unknown', replayAllowed: false, recovery: 'original-key-lookup' });
 }
 return Object.freeze({ error: error instanceof ModelError ? error.code : 'UNAUTHORIZED', status: 'refused', replayAllowed: false, recovery: 'inspect-current-authority' });
}
