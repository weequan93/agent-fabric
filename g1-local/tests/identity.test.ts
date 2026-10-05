import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRuntime } from '../src/session-service.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import type { CommandResponse, TaskView } from '../src/contracts.js';
async function denied(action: () => unknown | Promise<unknown>): Promise<void> {
    let value: unknown;
    try {
        value = await action();
    }
    catch (error) {
        assert.ok(error instanceof Error);
        return;
    }
    assert.equal((value as CommandResponse)?.acceptance, 'rejected', 'unauthorized action must be rejected');
}
function fixture() {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-identity-'));
    let now = 100000;
    const runtime = createLocalRuntime({ directory, clock: { now: () => now } });
    const operator = runtime.service.login(TEST_CREDENTIALS.operator);
    const approver = runtime.service.login(TEST_CREDENTIALS.approver);
    const outsider = runtime.service.login(TEST_CREDENTIALS.outsider);
    return { ...runtime, directory, operator, approver, outsider, advance: (ms: number) => { now += ms; },
        cleanup: () => { runtime.close(); rmSync(directory, { recursive: true, force: true }); } };
}
async function plan(f: ReturnType<typeof fixture>, id: string, sourceIds: string[] = []) {
    const response = await f.service.createTask(f.operator.token, { spaceId: 'private-test', title: 'Synthetic plan', input: 'Create synthetic report', commandId: id, intent: 'act', sourceIds });
    assert.ok(response.task?.plan);
    return response.task as TaskView;
}
test('G1-LR03/server-identity', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'server-identity');
        assert.equal(view.task.ownerActorId, f.operator.identity.actorId);
        assert.equal(view.task.payerId, f.service.spaces(f.operator.token).find(s => s.scope.spaceId === 'private-test')!.payerId);
        const before = f.store.snapshot();
        for (const claim of [{ actorId: f.outsider.identity.actorId }, { payerId: 'payer-forged' }, { grants: ['simulate'] }]) {
            await denied(() => f.service.createTask(f.operator.token, { spaceId: 'private-test', title: 'forgery', input: 'forgery', commandId: 'forgery', ...claim }));
        }
        assert.deepEqual(f.store.snapshot(), before);
        await denied(() => f.service.createTask(f.outsider.token, { spaceId: 'private-test', title: 'cross Space', input: 'x', commandId: 'cross' }));
        assert.deepEqual(f.store.snapshot(), before);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR03/current-revoke', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'revoke', ['source-private']);
        const invokes = f.model.invocationCount, effects = f.effects.executionCount;
        f.store.transaction(state => {
            const membership = state.spaces.find(s => s.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === f.operator.identity.actorId)!;
            membership.revoked = true;
            membership.revision++;
            state.authorityRevision++;
        });
        await denied(() => f.service.getTask(f.operator.token, view.task.taskId));
        await denied(() => f.service.command(f.operator.token, view.task.taskId, { kind: 'startRun', commandId: 'revoked-start', planVersion: view.plan!.version }));
        assert.equal(f.model.invocationCount, invokes);
        assert.equal(f.effects.executionCount, effects);
        f.store.transaction(state => { const m = state.spaces.find(s => s.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === f.operator.identity.actorId)!; m.revoked = false; m.revision++; state.authorityRevision++; state.sources.find(s => s.sourceId === 'source-private')!.deleted = true; });
        await denied(() => f.service.createTask(f.operator.token, { spaceId: 'private-test', sourceIds: ['source-private'], title: 'deleted source', input: 'read', commandId: 'deleted-source', intent: 'ask' }));
        assert.equal(f.model.invocationCount, invokes);
        assert.equal(f.effects.executionCount, effects);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR03/cross-space-sharing', async () => {
    for (const grants of ['source-only', 'destination-only', 'both'] as const) {
        const f = fixture();
        try {
            const grant = 'source-private->group-test';
            f.store.transaction(state => {
                const source = state.spaces.find(s => s.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === f.operator.identity.actorId)!;
                const destination = state.spaces.find(s => s.scope.spaceId === 'group-test')!.memberships.find(m => m.actorId === f.operator.identity.actorId)!;
                source.shareableDestinations = grants === 'destination-only' ? [] : [grant];
                destination.shareableDestinations = grants === 'source-only' ? [] : [grant];
                source.revision++;
                destination.revision++;
                state.authorityRevision++;
            });
            const request = { spaceId: 'group-test', sourceIds: ['source-private'], title: 'Shared source', input: 'Read synthetic source', commandId: 'sharing', intent: 'ask' as const, explicitTrigger: true };
            if (grants !== 'both') {
                await denied(() => f.service.createTask(f.operator.token, request));
                assert.equal(f.model.invocationCount, 0);
                assert.equal(f.effects.executionCount, 0);
                assert.equal(f.store.snapshot().tasks.length, 0);
            }
            else {
                const response = await f.service.createTask(f.operator.token, request);
                assert.equal(response.acceptance, 'accepted');
                assert.ok(response.task);
                assert.equal(f.model.invocationCount, 1);
                assert.equal(f.effects.executionCount, 0);
                f.store.transaction(state => { state.sources.find(s => s.sourceId === 'source-private')!.audience = []; state.authorityRevision++; });
                await denied(() => f.service.getTask(f.operator.token, response.taskId));
                assert.equal(f.model.invocationCount, 1);
            }
        }
        finally {
            f.cleanup();
        }
    }
});
test('G1-LR03/independent-issuer', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'issuer');
        await denied(() => f.service.command(f.operator.token, view.task.taskId, { kind: 'approve', commandId: 'self-approval', planVersion: view.plan!.version }));
        assert.equal(f.effects.executionCount, 0);
        assert.equal(f.store.snapshot().approvals.length, 0);
        const approved = await f.service.command(f.approver.token, view.task.taskId, { kind: 'approve', commandId: 'independent-approval', planVersion: view.plan!.version });
        assert.equal(approved.acceptance, 'accepted');
        const approval = f.store.snapshot().approvals[0]!;
        assert.equal(approval.approverActorId, f.approver.identity.actorId);
        assert.notEqual(approval.approverActorId, approval.request.operatorActorId);
        assert.equal(approval.request.taskId, view.task.taskId);
        assert.equal(approval.request.planVersion, view.plan!.version);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR03/approval-expiry', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'expiry');
        await f.service.command(f.approver.token, view.task.taskId, { kind: 'approve', commandId: 'expiry-approval', planVersion: view.plan!.version });
        const expiry = f.store.snapshot().approvals[0]!.request.expiresAt;
        f.advance(expiry - 100000 + 1);
        await denied(() => f.service.command(f.operator.token, view.task.taskId, { kind: 'startRun', commandId: 'expired-start', planVersion: view.plan!.version }));
        assert.equal(f.effects.executionCount, 0);
        assert.equal(f.store.snapshot().artifacts.length, 0);
    }
    finally {
        f.cleanup();
    }
});
