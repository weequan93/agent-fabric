import { randomBytes, timingSafeEqual } from 'node:crypto';
import { LOCAL_POLICY, parseLoginRequest, type LocalState, type LocalClock, type LoginRequest, type LoginResponse, type TestIdentity, type LocalTask, type LocalSpace, type LocalMembership } from './contracts.js';
import { localAssert } from './errors.js';
import type { SQLiteStore } from './store.js';
export const TEST_CREDENTIALS = Object.freeze({
    operator: { username: 'operator', password: 'operator-local-test' },
    approver: { username: 'approver', password: 'approver-local-test' },
    viewer: { username: 'viewer', password: 'viewer-local-test' },
    outsider: { username: 'outsider', password: 'outsider-local-test' },
});
export function createSeedState(now = Date.now()): LocalState {
    const scope = (spaceId: string) => ({ tenantId: 'local-test-tenant', spaceId });
    const membership = (name: string, grants: LocalMembership['grants']): LocalMembership => ({ actorId: 'actor-' + name, revision: 1, revoked: false, grants, readableSourceIds: ['source-private', 'source-group'], shareableDestinations: [] });
    const all: LocalMembership['grants'] = ['read', 'ask', 'plan', 'simulate', 'stop'];
    const spaces: LocalSpace[] = [
        { scope: scope('private-test'), name: 'Personal test', kind: 'personal', payerId: 'actor-operator', ownerActorId: 'actor-operator', revision: 1, memberships: [membership('operator', all), membership('approver', ['read', 'approve'])] },
        { scope: scope('group-test'), name: 'Group test', kind: 'group', payerId: 'actor-operator', ownerActorId: 'actor-operator', revision: 1, memberships: [membership('operator', all), membership('approver', ['read', 'approve']), membership('viewer', ['read'])] },
        { scope: scope('other-test'), name: 'Other test', kind: 'personal', payerId: 'actor-outsider', ownerActorId: 'actor-outsider', revision: 1, memberships: [membership('outsider', all)] },
    ];
    void now;
    return { schemaVersion: 1, authorityRevision: 1, identities: Object.keys(TEST_CREDENTIALS).map(username => ({ actorId: 'actor-' + username, tenantId: 'local-test-tenant', username, role: username === 'approver' ? 'approver' : username === 'viewer' ? 'viewer' : 'operator', revoked: false, identityMode: 'local-test' })), sessions: [], spaces,
        sources: [{ sourceId: 'source-private', scope: scope('private-test'), audience: ['actor-operator', 'actor-approver'], content: 'Synthetic private decision.', revision: 1, deleted: false }, { sourceId: 'source-group', scope: scope('group-test'), audience: ['actor-operator', 'actor-approver', 'actor-viewer'], content: 'Synthetic group decision.', revision: 1, deleted: false }],
        tasks: [], plans: [], runs: [], approvals: [], operations: [], modelOperations: [], reservations: [], budgets: spaces.map(space => ({ scope: space.scope, payerId: space.payerId, ceiling: 1000000, reserved: 0, settled: 0, currency: 'synthetic-units', realSupplierCost: null })), artifacts: [], checks: [], commands: [], outbox: [], events: [], tombstones: [] };
}
export function authenticate(state: LocalState, token: string, now: number): TestIdentity {
    const session = state.sessions.find(s => s.token === token && !s.revoked && s.expiresAt > now);
    const actor = state.identities.find(a => a.actorId === session?.actorId && !a.revoked);
    localAssert(actor, 'UNAUTHORIZED', 'Current local-test login is required.');
    return actor;
}
export function authorizeSpace(state: LocalState, actor: TestIdentity, spaceId: string, grant: LocalMembership['grants'][number] = 'read'): {
    space: LocalSpace;
    membership: LocalMembership;
} {
    const space = state.spaces.find(s => s.scope.spaceId === spaceId && s.scope.tenantId === actor.tenantId);
    const membership = space?.memberships.find(m => m.actorId === actor.actorId && !m.revoked);
    localAssert(space && membership && membership.grants.includes(grant) && !state.tombstones.some(t => t.scope.spaceId === spaceId && t.recordId === spaceId), 'UNAUTHORIZED', 'Current Space permission is required.');
    return { space, membership };
}
export function authorizeTask(state: LocalState, actor: TestIdentity, task: LocalTask, grant: LocalMembership['grants'][number] = 'read'): void {
    const { space, membership } = authorizeSpace(state, actor, task.scope.spaceId, grant);
    localAssert(task.scope.tenantId === actor.tenantId && task.payerId === space.payerId, 'SCOPE_MISMATCH', 'Immutable Task scope and payer required.');
    for (const id of task.sourceIds) {
        const source = state.sources.find(s => s.sourceId === id && !s.deleted);
        localAssert(source && source.scope.tenantId === task.scope.tenantId && source.audience.includes(actor.actorId) && membership.readableSourceIds.includes(id), 'UNAUTHORIZED', 'Current source audience required.');
        const from = authorizeSpace(state, actor, source.scope.spaceId, 'read').membership;
        localAssert(from.readableSourceIds.includes(id), 'UNAUTHORIZED', 'Current source readability required.');
        if (source.scope.spaceId !== task.scope.spaceId) {
            const key = id + '->' + task.scope.spaceId;
            localAssert(from.shareableDestinations.includes(key) && membership.shareableDestinations.includes(key), 'UNAUTHORIZED', 'Both source and destination sharing grants required.');
        }
    }
}
export class LocalIdentity {
    constructor(private readonly store: SQLiteStore, private readonly clock: LocalClock) { }
    login(input: LoginRequest): LoginResponse {
        const request = parseLoginRequest(input), expected = TEST_CREDENTIALS[request.username as keyof typeof TEST_CREDENTIALS];
        const a = Buffer.from(request.password), b = Buffer.from(expected?.password ?? '');
        localAssert(expected && a.length === b.length && timingSafeEqual(a, b), 'UNAUTHORIZED', 'Invalid synthetic test credentials.');
        return this.store.transaction(state => { const actor = state.identities.find(a => a.username === request.username && !a.revoked); localAssert(actor, 'UNAUTHORIZED', 'Test identity is revoked.'); const token = randomBytes(32).toString('hex'), expiresAt = this.clock.now() + 3600000; state.sessions.push({ token, actorId: actor.actorId, expiresAt, revoked: false }); return { schemaVersion: 1, ...LOCAL_POLICY, token, expiresAt, identity: structuredClone(actor) }; });
    }
    logout(token: string): void {
        this.store.transaction(state => {
            authenticate(state, token, this.clock.now());
            state.sessions.find(s => s.token === token)!.revoked = true;
            // Ending this session changes no identity, membership or approval policy.
        });
    }
    me(token: string): TestIdentity { return structuredClone(authenticate(this.store.snapshot(), token, this.clock.now())); }
}
