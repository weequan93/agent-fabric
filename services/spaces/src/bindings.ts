import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type AuthenticatedActorRef, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
export { parseScope } from '../../../engine/contracts/src/task-envelope.js';

export interface ComputerAssignment { readonly assignmentId: string; readonly runtimeId: string; readonly runtimeGeneration: number; readonly qualificationId: string }
export interface SpaceBinding {
  readonly scope: ScopeRef; readonly kind: 'personal' | 'group'; readonly ownerActorId: string;
  readonly payerId: string; readonly audience: readonly string[]; readonly membershipRevision: number;
  readonly dataNamespace: string; readonly computeNamespace: string; readonly computerAssignment: ComputerAssignment | null;
}
function key(scope: ScopeRef): string { return JSON.stringify([scope.tenantId, scope.spaceId]); }
function parseBinding(value: unknown): SpaceBinding {
  const p = record(value, ['scope', 'kind', 'ownerActorId', 'payerId', 'audience', 'membershipRevision', 'dataNamespace', 'computeNamespace', 'computerAssignment']);
  requireCondition(p.kind === 'personal' || p.kind === 'group', 'INVALID_SCHEMA', 'Invalid Space kind');
  const ownerActorId = nonEmptyString(p.ownerActorId, 'ownerActorId');
  requireCondition(Array.isArray(p.audience), 'INVALID_SCHEMA', 'Audience required');
  canonicalDigest(p.audience);
  const audience = p.audience.map((id: unknown) => nonEmptyString(id, 'audience actor'));
  requireCondition(new Set(audience).size === audience.length && audience.includes(ownerActorId), 'INVALID_SCHEMA', 'Audience must be unique and include owner');
  requireCondition(p.kind !== 'personal' || (audience.length === 1 && audience[0] === ownerActorId), 'INVALID_SCHEMA', 'Personal audience is owner only');
  let computerAssignment: ComputerAssignment | null = null;
  if (p.computerAssignment !== null) {
    const c = record(p.computerAssignment, ['assignmentId', 'runtimeId', 'runtimeGeneration', 'qualificationId']);
    computerAssignment = { assignmentId: nonEmptyString(c.assignmentId), runtimeId: nonEmptyString(c.runtimeId), runtimeGeneration: nonNegativeInteger(c.runtimeGeneration), qualificationId: nonEmptyString(c.qualificationId) };
  }
  return { scope: parseScope(p.scope), kind: p.kind, ownerActorId, payerId: nonEmptyString(p.payerId, 'payerId'), audience, membershipRevision: nonNegativeInteger(p.membershipRevision, 'membershipRevision'), dataNamespace: nonEmptyString(p.dataNamespace), computeNamespace: nonEmptyString(p.computeNamespace), computerAssignment };
}
/** Trusted G0 owner setup only; no VM provisioning, billing or SSO qualification. */
export class SpacesRepository {
  private readonly bindings = new Map<string, SpaceBinding>();
  private readonly deleted = new Set<string>();
  private available = true;
  setAvailable(available: boolean): void { this.available = available; }
  register(binding: SpaceBinding): void {
    this.assertAvailable();
    const parsed = parseBinding(binding); const id = key(parsed.scope);
    requireCondition(!this.deleted.has(id), 'UNAUTHORIZED', 'Deleted binding cannot be restored');
    const existing = this.bindings.get(id);
    requireCondition(existing === undefined || canonicalDigest(existing) === canonicalDigest(parsed), 'IDEMPOTENCY_CONFLICT', 'Binding identity, payer and namespaces are immutable');
    for (const [otherId, other] of this.bindings) {
      if (otherId === id) continue;
      requireCondition(other.dataNamespace !== parsed.dataNamespace && other.computeNamespace !== parsed.computeNamespace, 'SCOPE_MISMATCH', 'Space namespaces cannot overlap');
      if (other.computerAssignment !== null && parsed.computerAssignment !== null) requireCondition(other.computerAssignment.assignmentId !== parsed.computerAssignment.assignmentId && other.computerAssignment.runtimeId !== parsed.computerAssignment.runtimeId, 'SCOPE_MISMATCH', 'Computer assignment belongs to one Space');
    }
    this.bindings.set(id, structuredClone(parsed));
  }
  get(scope: ScopeRef): SpaceBinding {
    this.assertAvailable(); const id = key(parseScope(scope)); const binding = this.bindings.get(id);
    requireCondition(binding !== undefined && !this.deleted.has(id), 'UNAUTHORIZED', 'Current Space authority required');
    return structuredClone(binding);
  }
  getAuthorized(scope: ScopeRef, actor: AuthenticatedActorRef): SpaceBinding {
    const trustedScope = parseScope(scope);
    const a = record(actor, ['actorId', 'tenantId']);
    requireCondition(nonEmptyString(a.tenantId) === trustedScope.tenantId, 'UNAUTHORIZED', 'Current Space authority required');
    const actorId = nonEmptyString(a.actorId); const binding = this.get(trustedScope);
    requireCondition(binding.audience.includes(actorId), 'UNAUTHORIZED', 'Current Space authority required');
    return binding;
  }
  updateAudience(scope: ScopeRef, actorIDs: readonly string[], expectedRevision: number): void {
    const current = this.get(scope); nonNegativeInteger(expectedRevision, 'expectedRevision');
    requireCondition(current.membershipRevision === expectedRevision, 'STALE_REVISION', 'Refresh current membership');
    const updated = parseBinding({ ...current, audience: actorIDs, membershipRevision: nonNegativeInteger(expectedRevision + 1) });
    this.bindings.set(key(current.scope), structuredClone(updated));
  }
  tombstone(scope: ScopeRef): void { this.assertAvailable(); this.deleted.add(key(parseScope(scope))); }
  assertClientBinding(claim: SpaceBinding): void {
    const parsed = parseBinding(claim); const current = this.get(parsed.scope);
    requireCondition(canonicalDigest(current) === canonicalDigest(parsed), 'UNAUTHORIZED', 'Client claims do not define Space authority');
  }
  private assertAvailable(): void { requireCondition(this.available, 'AUTHORITY_UNAVAILABLE', 'Space authority unavailable'); }
}
