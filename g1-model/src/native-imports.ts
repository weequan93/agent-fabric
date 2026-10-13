/** Dependency direction is F04 -> native owners. These are direct aliases, not copies. */
export { SessionLoop, initialSession, reduceSession, replaySession } from '../../engine/kernel/src/session-loop.js';
export type { SessionState, SessionPorts, SessionModelOperation, SessionModelResolution } from '../../engine/kernel/src/session-loop.js';
export { canonicalDigest, DomainError } from '../../engine/contracts/src/identity.js';
export type { RunRecord, RunGuard, RunState } from '../../engine/scheduler/src/run-state.js';
export { isTerminal } from '../../engine/scheduler/src/run-state.js';
export { FoundationError, assertVerifiedScope, revalidateScope } from '../../g1-foundations/src/contracts.js';
export type { AsyncUnitOfWork, SqlTransaction, VerifiedScope, ScopeRef } from '../../g1-foundations/src/contracts.js';
export { IdentityError } from '../../g1-identity/src/contracts.js';
export type { IdentityScopeVerifier, AudienceVerifier } from '../../g1-identity/src/contracts.js';
export { lockSpaceBarrier, assertRunUnfenced } from '../../g1-recovery/src/fence-guard.js';
