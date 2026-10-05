import { nonEmptyString, nonNegativeInteger, record, requireCondition, type AuthenticatedActorRef, type Clock } from '../../../engine/contracts/src/identity.js';

/** Controlled G0 fixture authority. This is not a JWT/SSO implementation. */
export class ActorDirectory {
  private readonly sessions = new Map<string, { actor: AuthenticatedActorRef; expiresAt: number }>();
  private readonly revoked = new Set<string>();
  private available = true;
  constructor(private readonly clock: Clock) {}
  setAvailable(available: boolean): void { this.available = available; }
  registerSession(token: string, actor: AuthenticatedActorRef, expiresAt: number): void {
    this.assertAvailable();
    nonEmptyString(token, 'session token');
    const parsed = record(actor, ['actorId', 'tenantId']);
    const trusted = { actorId: nonEmptyString(parsed.actorId, 'actorId'), tenantId: nonEmptyString(parsed.tenantId, 'tenantId') };
    nonNegativeInteger(expiresAt, 'expiresAt');
    requireCondition(expiresAt > this.now(), 'EXPIRED_COMMAND', 'Session must have a future expiry');
    requireCondition(!this.sessions.has(token) && !this.revoked.has(token), 'IDEMPOTENCY_CONFLICT', 'Session identity cannot be replaced or resurrected');
    this.sessions.set(token, { actor: trusted, expiresAt });
  }
  authenticate(token: string): AuthenticatedActorRef {
    this.assertAvailable();
    nonEmptyString(token, 'session token');
    const session = this.sessions.get(token);
    requireCondition(session !== undefined && session.expiresAt > this.now(), 'UNAUTHORIZED', 'Current authentication required');
    return { ...session.actor };
  }
  revoke(token: string): void { this.assertAvailable(); nonEmptyString(token, 'session token'); this.revoked.add(token); this.sessions.delete(token); }
  private now(): number { return nonNegativeInteger(this.clock.now(), 'clock'); }
  private assertAvailable(): void { requireCondition(this.available, 'AUTHORITY_UNAVAILABLE', 'Authentication authority unavailable'); }
}
