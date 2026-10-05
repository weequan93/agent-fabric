/** Public errors for the synthetic local subbatch. Internal errors never leak SQL or credentials. */
export const LOCAL_ERROR_CODES = [
  'INVALID_SCHEMA', 'UNSUPPORTED_VERSION', 'UNAUTHORIZED', 'AUTHORITY_UNAVAILABLE',
  'SCOPE_MISMATCH', 'INTENT_EXCEEDED', 'STALE_REVISION', 'EXPIRED_COMMAND',
  'IDEMPOTENCY_CONFLICT', 'APPROVAL_MISMATCH', 'APPROVAL_EXPIRED', 'STALE_FENCE',
  'LEASE_EXPIRED', 'BUDGET_EXHAUSTED', 'TERMINAL_RUN', 'REQUIRED_CAPABILITY_UNSUPPORTED',
  'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'ARTIFACT_NOT_COMMITTED',
  'CHECK_BINDING_MISMATCH', 'PAID_ROUTE_NOT_AUTHORIZED', 'REMOTE_NOT_AUTHORIZED',
  'LOCAL_POLICY_VIOLATION', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'METHOD_NOT_ALLOWED',
  'STORE_UNAVAILABLE', 'INTERNAL_ERROR',
] as const;
export type LocalErrorCode = typeof LOCAL_ERROR_CODES[number];
export interface LocalErrorBody {
  schemaVersion: 1;
  error: { code: LocalErrorCode; message: string; nextAction: string; retryable: boolean };
}
export function errorStatus(code: LocalErrorCode): number {
  if (['UNAUTHORIZED', 'SCOPE_MISMATCH', 'INTENT_EXCEEDED', 'PAID_ROUTE_NOT_AUTHORIZED', 'REMOTE_NOT_AUTHORIZED'].includes(code)) return 403;
  if (code === 'NOT_FOUND') return 404;
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (['AUTHORITY_UNAVAILABLE', 'STORE_UNAVAILABLE'].includes(code)) return 503;
  if (code === 'INTERNAL_ERROR') return 500;
  if (['STALE_REVISION', 'IDEMPOTENCY_CONFLICT', 'APPROVAL_MISMATCH', 'APPROVAL_EXPIRED', 'STALE_FENCE', 'TERMINAL_RUN', 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'ARTIFACT_NOT_COMMITTED', 'CHECK_BINDING_MISMATCH', 'BUDGET_EXHAUSTED'].includes(code)) return 409;
  return 400;
}
export class LocalError extends Error {
  readonly status: number;
  constructor(readonly code: LocalErrorCode, message: string, readonly nextAction = 'Refresh current authorized state.', readonly retryable = false) {
    super(message); this.name = 'LocalError'; this.status = errorStatus(code);
  }
}
export function localAssert(condition: unknown, code: LocalErrorCode, message: string, nextAction?: string): asserts condition {
  if (!condition) throw new LocalError(code, message, nextAction);
}
/** G0 DomainError codes can be translated without returning untrusted exception text. */
export function toLocalError(error: unknown): LocalError {
  if (error instanceof LocalError) return error;
  if (error instanceof Error && 'code' in error && LOCAL_ERROR_CODES.includes(error.code as LocalErrorCode)) {
    const code = error.code as LocalErrorCode;
    return new LocalError(code, 'The operation did not satisfy its current local contract.');
  }
  return new LocalError('INTERNAL_ERROR', 'The local operation could not be completed.', 'Inspect the local diagnostic record; query the original command before retrying.');
}
export function errorBody(error: unknown): LocalErrorBody {
  const e = toLocalError(error);
  return { schemaVersion: 1, error: { code: e.code, message: e.message, nextAction: e.nextAction, retryable: e.retryable } };
}
