/** G1-F02 trusted composition contracts. Local synthetic IdP; no production qualification.
 * Original foundation authenticating lookup and locked authority remain mandatory.
 * Objects below are internal service values, never authority received from HTTP.
 */
import type { AsyncUnitOfWork, CurrentAuthority, CurrentAuthorityLookup, JsonValue, ScopeRef, SqlTransaction, VerifiedScope } from '../../g1-foundations/src/contracts.js';
export type { AsyncUnitOfWork, CurrentAuthority, CurrentAuthorityLookup, JsonValue, ScopeRef, SqlTransaction, VerifiedScope };

export type IdentityErrorCode = 'INVALID_INPUT' | 'INVALID_TOKEN' | 'INVALID_GRANT' | 'UNAUTHORIZED' | 'STALE_IDENTITY' | 'APPROVAL_REQUIRED' | 'APPROVAL_CONFLICT' | 'AUDIENCE_DENIED' | 'UNKNOWN_COMMIT';
export class IdentityError extends Error {
 constructor(readonly code: IdentityErrorCode, message: string = code) { super(message); this.name = 'IdentityError'; }
}
/** Runtime provenance is owned by token-verifier.ts (private WeakSet), not this type.
 * Implementations must reject copied/cast objects at their verifier boundary. */
export interface VerifiedAccessToken {
 readonly issuer: string; readonly subject: string; readonly sessionId: string;
 readonly audience: string; readonly issuedAt: number; readonly expiresAt: number;
 readonly tokenId: string; readonly tokenUse: 'access';
}
export interface TokenVerifierOptions {
 readonly issuer: string; readonly apiAudience: string; readonly jwksUrl: string;
 readonly now?: () => number; // Epoch seconds. Production composition supplies trusted clock.
}
export type AccessTokenVerifier = (raw: string) => Promise<VerifiedAccessToken>;
export interface SessionIdentity { readonly issuer: string; readonly subject: string; readonly sessionId: string }
export interface SessionAuthority extends CurrentAuthority {
 readonly principalKind: 'human' | 'service'; readonly sessionExpiresAt: string;
}
/** Database implementation authenticates issuer+subject+sid and resolves current
 * actor/payer/membership/lifecycle; JWT actor/grants/payer claims are ignored. */
export type SessionAuthorityLookup = (identity: SessionIdentity, scope: ScopeRef) => Promise<SessionAuthority | null>;
export interface AuthenticatedBinding extends SessionIdentity {
 readonly actorId: string; readonly principalKind: 'human' | 'service';
 readonly tokenExpiresAt: number;
}
export type ScopeBindingLookup = (scope: VerifiedScope) => AuthenticatedBinding;
export interface IdentityScopeVerifier {
 verify(request: ScopeRef & { readonly sessionCredential: string }): Promise<VerifiedScope>;
 /** Private WeakMap lookup: unissued scopes throw, copies cannot mint bindings. */
 bindingFor(scope: VerifiedScope): AuthenticatedBinding;
}
export interface IdentityScopeVerifierOptions {
 readonly verifyToken: AccessTokenVerifier; readonly lookupAuthority: SessionAuthorityLookup;
 readonly now?: () => number;
}
export interface AuthenticatedUnitOfWorkOptions {
 readonly foundation: AsyncUnitOfWork; readonly bindingFor: ScopeBindingLookup;
 readonly now?: () => number;
}
export interface IdpSessionRecord extends SessionIdentity {
 readonly expiresAt: string; readonly revokedAt: string | null;
}
/** Narrow independent IdP store: issue/revoke only known mapped identities;
 * no actor, membership, approval or business audit mutation authority. */
export interface IdpSessionStore {
 create(session: IdpSessionRecord): Promise<void>;
 revoke(identity: SessionIdentity): Promise<void>;
}
export interface TestIdpUser { readonly subject: string; readonly password: string }
export interface TestIdpOptions {
 readonly host?: '127.0.0.1'; readonly port?: number;
 readonly clientId: string; readonly redirectUri: string; readonly apiAudience: string;
 readonly users: readonly TestIdpUser[]; readonly sessionStore?: IdpSessionStore;
 readonly accessTokenSeconds?: number;
}
export interface RunningTestIdp {
 readonly issuer: string; readonly jwksUrl: string; readonly authorizationEndpoint: string;
 readonly tokenEndpoint: string; readonly qualification: 'local-synthetic-test-only';
 close(): Promise<void>;
}

/** Exact immutable approval target. Canonical digest binds EVERY field including
 * audience and ceilings. Revisions use nonnegative safe integers; monetary ceiling
 * is integer microunits. No arbitrary SQL/tool body executes through this interface. */
export interface SourceAudienceBinding {
 readonly sourceSpaceId: string; readonly sourceTaskId: string;
 readonly destinationSpaceId: string; readonly recipientActorIds: readonly string[];
 readonly revisionDigest: string;
}
export interface ApprovalLimits { readonly maxOperations: number; readonly maxCostMicrounits: number }
export interface ExactApprovalBinding extends ScopeRef {
 readonly taskId: string; readonly runId: string; readonly operationId: string;
 readonly target: string; readonly action: string; readonly argsDigest: string;
 readonly artifactVersion: number; readonly policyRevision: number;
 readonly requirementsRevision: number; readonly sourceAudience: SourceAudienceBinding;
 readonly limits: ApprovalLimits; readonly expiresAt: string;
}
export interface CreateApprovalInput {
 readonly approvalId: string; readonly executorId: string; readonly binding: ExactApprovalBinding;
}
export interface ApprovalRecord {
 readonly approvalId: string; readonly requesterId: string; readonly executorId: string;
 readonly approverId: string | null; readonly bindingDigest: string;
 readonly binding: ExactApprovalBinding; readonly state: 'pending' | 'approved' | 'consumed';
}
export interface ConsumeApprovalInput {
 readonly approvalId: string; readonly idempotencyKey: string;
 readonly binding: ExactApprovalBinding;
}
export interface ApprovalReceipt extends ScopeRef {
 readonly approvalId: string; readonly operationId: string; readonly idempotencyKey: string;
 readonly bindingDigest: string; readonly auditId: string; readonly outboxId: string;
 readonly requesterId: string; readonly approverId: string; readonly executorId: string;
}
export type ApprovalCommitLookup = { readonly status: 'committed'; readonly receipt: ApprovalReceipt }
 | { readonly status: 'absent-safe' } | { readonly status: 'unknown'; readonly nextAction: string };
/** A 503 preserves an unresolved outcome without echoing request data or secrets. */
export interface UnknownApprovalCommitResponse {
 readonly error: 'UNKNOWN_COMMIT'; readonly status: 'unknown';
 readonly recovery: { readonly path: '/approvals/lookup'; readonly method: 'POST'; readonly useOriginalKey: true; readonly replayAllowed: false };
}
export interface ApprovalRepositoryPort {
 create(scope: VerifiedScope, input: CreateApprovalInput): Promise<ApprovalRecord>;
 approve(scope: VerifiedScope, approvalId: string, bindingDigest: string): Promise<ApprovalRecord>;
 consume(scope: VerifiedScope, input: ConsumeApprovalInput): Promise<ApprovalReceipt>;
 lookupCommand(scope: VerifiedScope, idempotencyKey: string, bindingDigest: string): Promise<ApprovalCommitLookup>;
}
export interface AudienceVerifier {
 /** Uses current database source membership and destination member set, locked in
  * the SAME transaction; stale grants/member revisions fail without source titles. */
 verify(transaction: SqlTransaction, scope: VerifiedScope, audience: SourceAudienceBinding): Promise<void>;
}
export interface IdentityHttpServiceOptions {
 readonly scopes: IdentityScopeVerifier; readonly approvals: ApprovalRepositoryPort;
}
export interface RunningIdentityHttpService {
 readonly url: string; close(): Promise<void>;
}

/** SQL contract, fixed search_path pg_catalog,fabric; REVOKE PUBLIC/worker:
 * fabric.identity_authority(issuer text,subject text,sid text,tenant uuid,space uuid)
 *   RETURNS jsonb of SessionAuthority/null, reads current mapped identity/session
 *   and foundation authority; controller EXECUTE only.
 * fabric.identity_lock_session(issuer text,subject text,sid text) RETURNS boolean
 *   checks current app.* scope/actor, mapped identity, session revocation and
 *   clock_timestamp expiry, holds identity/session FOR SHARE through commit.
 *   Called INSIDE foundation.withScope callback before any work; false => deny.
 * fabric.identity_issue_session(issuer text,subject text,sid text,expires timestamptz)
 * fabric.identity_revoke_session(issuer text,subject text,sid text) RETURNS void
 *   IdP-only EXECUTE; issuer/subject must be enrolled, expiry bounded.
 * Identity migrations use fabric_identity_migrations separate from the protected
 * fabric_foundation_migrations versions 1/2. Controller cannot UPDATE/DELETE audit.
 * Approval transactions lock exact binding + requester/executor/current HUMAN
 * approver, require all three different and current approve grant, lock current
 * audience, check expiry using clock_timestamp AFTER locks, atomically receipt+
 * append-only audit+outbox. UNKNOWN_COMMIT uses original key lookup, no replay.
 */
