import { createHash } from 'node:crypto';

export interface ScopeRef { readonly tenantId: string; readonly spaceId: string }
export interface AuthenticatedActorRef { readonly actorId: string; readonly tenantId: string }
export interface FencingToken { readonly taskGeneration: number; readonly runGeneration: number; readonly runtimeGeneration: number }
export interface Clock { now(): number }
export interface IdFactory { next(prefix: string): string }
export type TenantId = string;
export type SpaceId = string;
export type ActorId = string;
export type TaskId = string;
export type RunId = string;
export type OperationId = string;
export type CommandId = string;
export type ArtifactId = string;

export const ERROR_CODES = ['INVALID_SCHEMA', 'UNSUPPORTED_VERSION', 'REQUIRED_CAPABILITY_UNSUPPORTED', 'UNAUTHORIZED', 'AUTHORITY_UNAVAILABLE', 'SCOPE_MISMATCH', 'INTENT_EXCEEDED', 'STALE_REVISION', 'EXPIRED_COMMAND', 'IDEMPOTENCY_CONFLICT', 'APPROVAL_MISMATCH', 'APPROVAL_EXPIRED', 'STALE_FENCE', 'LEASE_EXPIRED', 'BUDGET_EXHAUSTED', 'TERMINAL_RUN', 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'ARTIFACT_NOT_COMMITTED', 'CHECK_BINDING_MISMATCH'] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export class DomainError extends Error {
  constructor(readonly code: ErrorCode, message: string = code) {
    super(message);
    this.name = 'DomainError';
  }
}
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DomainError };
export function requireCondition(condition: unknown, code: ErrorCode, message: string = code): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
export function sameScope(a: ScopeRef, b: ScopeRef): boolean {
  return a.tenantId === b.tenantId && a.spaceId === b.spaceId;
}
export function nonEmptyString(value: unknown, field: string = 'value'): string {
  requireCondition(typeof value === 'string' && value.length > 0 && value.trim() === value, 'INVALID_SCHEMA', `${field} must be a nonempty trimmed string`);
  return value;
}
export function nonNegativeInteger(value: unknown, field: string = 'value'): number {
  requireCondition(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'INVALID_SCHEMA', `${field} must be a nonnegative safe integer`);
  return value;
}
export function record(value: unknown, keys: readonly string[], required: readonly string[] = keys): Record<string, unknown> {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_SCHEMA', 'Expected a JSON object');
  const proto: unknown = Object.getPrototypeOf(value);
  requireCondition(proto === Object.prototype || proto === null, 'INVALID_SCHEMA', 'Expected a plain object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireCondition(Object.getOwnPropertySymbols(value).length === 0, 'INVALID_SCHEMA', 'Symbol keys are not JSON');
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    requireCondition(keys.includes(key) && descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true, 'INVALID_SCHEMA', `Invalid field: ${key}`);
  }
  for (const key of required) requireCondition(Object.prototype.hasOwnProperty.call(descriptors, key) && descriptors[key]?.value !== undefined, 'INVALID_SCHEMA', `Missing field: ${key}`);
  return value as Record<string, unknown>;
}

// No toJSON, accessors, undefined, sparse arrays, cycles or unsafe numbers.
// Canonicalization must not execute user-defined getters while computing an approval digest.
export function canonicalDigest(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown): string {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      requireCondition(Number.isSafeInteger(input), 'INVALID_SCHEMA', 'Digest numbers must be safe integers');
      return JSON.stringify(input);
    }
    requireCondition(typeof input === 'object' && input !== null, 'INVALID_SCHEMA', 'Digest input must be JSON');
    requireCondition(!ancestors.has(input), 'INVALID_SCHEMA', 'Cyclic digest input');
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        const descriptors = Object.getOwnPropertyDescriptors(input);
        requireCondition(Object.getOwnPropertySymbols(input).length === 0 && Object.keys(descriptors).length === input.length + 1, 'INVALID_SCHEMA', 'Invalid JSON array properties');
        const items: string[] = [];
        for (let index = 0; index < input.length; index++) {
          const descriptor = descriptors[String(index)];
          requireCondition(descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true, 'INVALID_SCHEMA', 'Sparse/accessor array');
          items.push(encode(descriptor.value));
        }
        return `[${items.join(',')}]`;
      }
      const keys = Object.getOwnPropertyNames(input).sort();
      const parsed = record(input, keys);
      const descriptors = Object.getOwnPropertyDescriptors(parsed);
      return `{${keys.map(key => `${JSON.stringify(key)}:${encode(descriptors[key]?.value)}`).join(',')}}`;
    } finally { ancestors.delete(input); }
  }
  return createHash('sha256').update(encode(value), 'utf8').digest('hex');
}
