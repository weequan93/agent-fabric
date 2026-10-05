import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRuntime } from '../src/session-service.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import { validateLocalPolicy } from '../src/contracts.js';
function options(directory: string) {
    let n = 0;
    return { directory, clock: { now: () => 100000 }, ids: { next: (kind: string) => `${kind}-fixed-${++n}` } };
}
test('G1-LR02/determinism', async () => {
    const directories = [mkdtempSync(join(tmpdir(), 'af-g1-model-a-')), mkdtempSync(join(tmpdir(), 'af-g1-model-b-'))];
    const runtimes = directories.map(directory => createLocalRuntime(options(directory)));
    try {
        const observed = [];
        for (const r of runtimes) {
            const login = r.service.login(TEST_CREDENTIALS.operator);
            const response = await r.service.createTask(login.token, { spaceId: 'private-test', title: 'Fixed input', input: 'Explain this synthetic input', intent: 'ask', commandId: 'determinism' });
            assert.equal(response.acceptance, 'accepted');
            assert.ok(response.task);
            assert.equal(response.task.modelMode, 'deterministic-test');
            assert.equal(response.task.effectMode, 'synthetic-only');
            assert.equal(response.task.paidCallsAllowed, false);
            assert.equal(response.task.remoteAllowed, false);
            assert.equal(r.model.invocationCount, 1);
            assert.equal(r.effects.executionCount, 0);
            const state = r.store.snapshot();
            assert.equal(state.modelOperations.length, 1);
            assert.equal(state.modelOperations[0]!.state, 'completed');
            const reservation = state.reservations.find(row => row.operationId === state.modelOperations[0]!.operationId)!;
            assert.equal(reservation.state, 'settled');
            assert.ok(reservation.receiptId);
            assert.ok(reservation.settledUnits > 0);
            observed.push({ view: response.task, model: state.modelOperations, reservations: state.reservations, events: state.events, budgets: state.budgets });
        }
        assert.deepEqual(observed[0], observed[1], 'same fixed inputs/IDs/clock must produce equal output, usage and events');
    }
    finally {
        runtimes.forEach(r => r.close());
        directories.forEach(d => rmSync(d, { recursive: true, force: true }));
    }
});
test('G1-LR02/no-route', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-no-route-'));
    const r = createLocalRuntime({ directory });
    try {
        const token = r.service.login(TEST_CREDENTIALS.operator).token;
        for (const route of [{ provider: 'external' }, { apiKey: 'caller-secret' }, { paidCallsAllowed: true }, { gateway: 'https://example.invalid' }, { modelMode: 'paid' }]) {
            assert.throws(() => validateLocalPolicy(route), error => error instanceof Error && 'code' in error && error.code === 'PAID_ROUTE_NOT_AUTHORIZED');
            await assert.rejects(() => r.service.createTask(token, { spaceId: 'private-test', title: 'Forbidden supplier', input: 'x', commandId: 'no-route', ...route }));
        }
        assert.equal(r.model.invocationCount, 0);
        assert.equal(r.effects.executionCount, 0);
        assert.equal(r.store.snapshot().tasks.length, 0);
        assert.equal(r.store.snapshot().reservations.length, 0);
    }
    finally {
        r.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
test('G1-LR02/replay-zero', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-replay-'));
    let lost = false;
    let r = createLocalRuntime({ directory, failpoint: name => { if (name === 'model.after-receipt' && !lost) {
            lost = true;
            throw new Error('synthetic acknowledgement lost');
        } } });
    try {
        const token = r.service.login(TEST_CREDENTIALS.operator).token;
        const response = await r.service.createTask(token, { spaceId: 'private-test', title: 'Unknown model usage', input: 'Original input', intent: 'ask', commandId: 'unknown-model' });
        assert.equal(response.completion, 'unknown');
        assert.equal(r.model.invocationCount, 1);
        assert.equal(r.effects.executionCount, 0);
        const original = r.store.snapshot().modelOperations[0]!;
        const held = r.store.snapshot().reservations.find(row => row.reservationId === original.reservationId)!;
        assert.equal(original.state, 'unknown');
        assert.equal(held.state, 'unknown');
        assert.equal(held.receiptId, null);
        r.close();
        r = createLocalRuntime({ directory });
        const freshToken = r.service.login(TEST_CREDENTIALS.operator).token;
        r.service.getTask(freshToken, response.taskId);
        r.service.events(freshToken, response.taskId);
        assert.equal(r.model.invocationCount, 0);
        assert.equal(r.effects.executionCount, 0);
        const restored = r.store.snapshot().modelOperations.find(row => row.operationId === original.operationId)!;
        assert.equal(restored.reservationId, original.reservationId);
        assert.equal(restored.state, 'unknown');
        assert.equal(r.store.snapshot().reservations.find(row => row.reservationId === held.reservationId)!.state, 'unknown');
        const reconciled = await r.service.command(freshToken, response.taskId, { kind: 'reconcile', operationId: original.operationId, commandId: 'original-model-receipt' });
        assert.equal(reconciled.completion, 'committed');
        assert.equal(r.model.invocationCount, 0);
        assert.equal(r.effects.executionCount, 0);
        const settled = r.store.snapshot().reservations.find(row => row.reservationId === held.reservationId)!;
        assert.equal(settled.state, 'settled');
        assert.ok(settled.receiptId);
    }
    finally {
        r.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
