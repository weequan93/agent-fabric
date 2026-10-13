import { FoundationError } from '../../g1-foundations/src/contracts.js';
export { FoundationError };
export const STORAGE_ERROR_CODES = Object.freeze(['INVALID_SCHEMA','UNSUPPORTED_VERSION','NUMERIC_OVERFLOW',
 'UNAUTHORIZED','AUTHORITY_UNAVAILABLE','SCOPE_MISMATCH','STALE_REVISION','EXPIRED_COMMAND',
 'IDEMPOTENCY_CONFLICT','STALE_FENCE','BUDGET_EXHAUSTED','ARTIFACT_NOT_COMMITTED','CONTENT_UNAVAILABLE',
 'INTEGRITY_FAILED','RETENTION_RESTRICTED','RESTORE_BLOCKED','REQUIRED_CAPABILITY_UNSUPPORTED',
 'CHECK_BINDING_MISMATCH','CLEANUP_UNPROVEN','TRANSACTION_CLOSED'] as const);
export type StorageErrorCode = typeof STORAGE_ERROR_CODES[number];
/** No input, SQL, path, source title or exception text belongs in a public error. */
export class StorageError extends Error {
 constructor(readonly code: StorageErrorCode) { super(code); this.name = 'StorageError'; }
}
export function demand(value: unknown, code: StorageErrorCode = 'INVALID_SCHEMA'): asserts value {
 if (!value) throw new StorageError(code);
}
export function safeFailure(error: unknown) {
 if (error instanceof FoundationError && error.code === 'UNKNOWN_COMMIT') return Object.freeze({
  schemaVersion: 1 as const, status: 'unknown' as const, error: 'UNKNOWN_COMMIT' as const,
  replayAllowed: false as const, nextAction: 'original-key-lookup' as const
 });
 return Object.freeze({schemaVersion: 1 as const, status: 'not-saved' as const,
  error: error instanceof StorageError && STORAGE_ERROR_CODES.includes(error.code) ? error.code : 'UNAUTHORIZED' as const,
  replayAllowed: false as const, nextAction: 'inspect-current-authority' as const});
}
