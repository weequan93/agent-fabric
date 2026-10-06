/** Trusted service contracts. No worker or client receives a database connection. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ScopeRef { readonly tenantId: string; readonly spaceId: string }
export type FoundationErrorCode = 'INVALID_INPUT' | 'UNVERIFIED_SCOPE' | 'UNAUTHORIZED' | 'STALE_AUTHORITY' | 'REVISION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'UNKNOWN_COMMIT' | 'PROFILE_NOT_ALLOWED';
export class FoundationError extends Error {
  constructor(readonly code: FoundationErrorCode, message: string = code) { super(message); this.name = 'FoundationError'; }
}
export function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new FoundationError('INVALID_INPUT', 'UUID identity required');
}
export function assertRevision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new FoundationError('INVALID_INPUT', 'Nonnegative safe revision required');
}
const scopeBrand: unique symbol = Symbol('server-verified-scope');
export interface VerifiedScope extends ScopeRef {
  readonly actorId: string; readonly payerId: string; readonly authorityRevision: number;
  readonly membershipRevision: number; readonly grants: readonly string[];
  readonly [scopeBrand]: true;
}
/** sessionCredential is resolved server-side; actor/payer/grants cannot be supplied. */
export interface ScopeRequest extends ScopeRef { readonly sessionCredential: string }
export interface CurrentAuthority extends ScopeRef {
  readonly actorId: string; readonly payerId: string; readonly authorityRevision: number;
  readonly membershipRevision: number; readonly grants: readonly string[];
  readonly actorRevoked: boolean; readonly payerRevoked: boolean; readonly membershipRevoked: boolean;
  readonly lifecycle: 'active' | 'archived' | 'suspended' | 'deleted';
}
/** Injected only by the trusted service composition root; must authenticate and read current DB authority. */
export type CurrentAuthorityLookup = (request: ScopeRequest) => Promise<CurrentAuthority | null>;
const issued = new WeakMap<object, { request: ScopeRequest; lookup: CurrentAuthorityLookup }>();
function validateAuthority(record: CurrentAuthority | null, request: ScopeRequest): asserts record is CurrentAuthority {
  if (!record || record.tenantId !== request.tenantId || record.spaceId !== request.spaceId || record.actorRevoked || record.payerRevoked || record.membershipRevoked || record.lifecycle !== 'active') throw new FoundationError('UNAUTHORIZED');
  for (const id of [record.tenantId, record.spaceId, record.actorId, record.payerId]) assertUuid(id);
  assertRevision(record.authorityRevision); assertRevision(record.membershipRevision);
  if (!Array.isArray(record.grants) || !record.grants.every(grant => typeof grant === 'string' && grant.length > 0)) throw new FoundationError('INVALID_INPUT');
}
export function createScopeVerifier(lookup: CurrentAuthorityLookup): { verify(request: ScopeRequest): Promise<VerifiedScope> } {
  return { async verify(request) {
    assertUuid(request.tenantId); assertUuid(request.spaceId);
    if (typeof request.sessionCredential !== 'string' || request.sessionCredential.length === 0 || Object.keys(request).some(key => !['tenantId', 'spaceId', 'sessionCredential'].includes(key))) throw new FoundationError('INVALID_INPUT');
    const pinned = Object.freeze({ tenantId: request.tenantId, spaceId: request.spaceId, sessionCredential: request.sessionCredential });
    const current = await lookup(pinned); validateAuthority(current, pinned);
    const scope: VerifiedScope = Object.freeze({ tenantId: current.tenantId, spaceId: current.spaceId, actorId: current.actorId, payerId: current.payerId, authorityRevision: current.authorityRevision, membershipRevision: current.membershipRevision, grants: Object.freeze([...current.grants]), [scopeBrand]: true as const });
    issued.set(scope, { request: pinned, lookup }); return scope;
  } };
}
export function assertVerifiedScope(scope: unknown): asserts scope is VerifiedScope {
  if (scope === null || typeof scope !== 'object' || !issued.has(scope)) throw new FoundationError('UNVERIFIED_SCOPE');
}
/** Recheck authentication on every transaction/read/dispatch. Additional locked
 * authority lookup supplements the original session lookup; it never replaces it.
 * A copied token is never authority. */
export async function revalidateScope(scope: VerifiedScope, lookupOverride?: CurrentAuthorityLookup): Promise<void> {
  assertVerifiedScope(scope); const binding = issued.get(scope)!;
  const assertCurrent = (current: CurrentAuthority | null): void => {
    validateAuthority(current, binding.request);
    if (current.actorId !== scope.actorId || current.payerId !== scope.payerId || current.authorityRevision !== scope.authorityRevision || current.membershipRevision !== scope.membershipRevision || JSON.stringify([...current.grants].sort()) !== JSON.stringify([...scope.grants].sort())) throw new FoundationError('STALE_AUTHORITY');
  };
  // Session expiry/revocation must reject even while DB membership is unchanged.
  assertCurrent(await binding.lookup(binding.request));
  if (lookupOverride) assertCurrent(await lookupOverride(binding.request));
}
export interface QueryResult<Row> { rows: Row[]; rowCount: number | null }
export interface SqlTransaction {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}
/** Transaction-local app.* assertions only; reset/rollback before pool release. */
export interface AsyncUnitOfWork {
  withScope<T>(scope: VerifiedScope, work: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
}
export interface TaskCreateInput {
  readonly taskId: string; readonly runId: string; readonly commandId: string;
  readonly mutationId: string; readonly jobId: string; readonly eventId: string;
  readonly idempotencyKey: string; readonly payloadDigest: string;
  readonly expectedRevision: number; readonly requirements: JsonValue;
}
export interface TaskRecord extends ScopeRef { taskId: string; actorId: string; revision: number; cancellationGeneration: number; state: string; requirements: JsonValue }
export interface EventRecord extends ScopeRef { runId: string; eventId: string; sequence: number; kind: string; payload: JsonValue }
export interface OutboxRecord extends ScopeRef { jobId: string; mutationId: string; kind: string; payload: JsonValue; authorityRevision: number; completedAt: string | null }
export interface TaskCommitReceipt extends ScopeRef { taskId: string; runId: string; commandId: string; jobId: string; revision: number; payloadDigest: string }
/** Lost COMMIT acknowledgement requires original key lookup, never automatic replay. */
export type CommitLookup = { status: 'committed'; receipt: TaskCommitReceipt } | { status: 'absent-safe' } | { status: 'unknown'; nextAction: string };
export interface TaskRepositoryPort {
  create(scope: VerifiedScope, input: TaskCreateInput): Promise<TaskCommitReceipt>;
  get(scope: VerifiedScope, taskId: string): Promise<TaskRecord | null>;
  lookupCommand(scope: VerifiedScope, idempotencyKey: string, payloadDigest: string): Promise<CommitLookup>;
}
