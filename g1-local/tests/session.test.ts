import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRuntime } from '../src/session-service.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import type { CommandResponse, TaskView } from '../src/contracts.js';

test('authorized source content reaches the pinned test model context', async () => {
    const f = fixture();
    try {
        const response = await f.service.createTask(f.token, { spaceId: 'private-test', title: 'Source context', input: 'Use the synthetic decision', sourceIds: ['source-private'], commandId: 'source-context' });
        const result = f.service.result(f.token, response.taskId);
        assert.match(result.text, /Synthetic private decision/);
        assert.match(result.text, /"sourceId":"source-private","revision":1/);
        assert.equal(f.model.invocationCount, 1);
        assert.equal(f.effects.executionCount, 0);
    } finally { f.cleanup(); }
});
test('local approval survives switching local login sessions', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'switch-session');
        f.service.logout(f.token);
        assert.throws(() => f.service.me(f.token), { code: 'UNAUTHORIZED' });
        await approve(f, view, 'switch-approve');
        f.service.logout(f.approver);
        const token = f.service.login(TEST_CREDENTIALS.operator).token;
        const result = await f.service.command(token, view.task.taskId, { kind: 'startRun', commandId: 'switch-start', planVersion: view.plan!.version });
        assert.equal(result.completion, 'committed');
        assert.equal(f.effects.executionCount, 1);
        assert.ok(f.service.result(token, view.task.taskId).committed);
    }
    finally {
        f.cleanup();
    }
});
test('command idempotency binds the target Task', async () => {
    const f = fixture();
    try {
        const a = await plan(f, 'target-a');
        const b = await plan(f, 'target-b');
        const command = { kind: 'stop' as const, commandId: 'same-target-key', scope: 'task' as const };
        await f.service.command(f.token, a.task.taskId, command);
        const before = f.store.snapshot();
        await assert.rejects(f.service.command(f.token, b.task.taskId, command), { code: 'IDEMPOTENCY_CONFLICT' });
        assert.deepEqual(f.store.snapshot(), before);
        assert.equal(f.service.getTask(f.token, b.task.taskId).task.stopped, false);
    }
    finally {
        f.cleanup();
    }
});
test('Stop reconciles committed usage while blocking publication', async () => {
    let lost = false;
    const f = fixture(name => { if (name === 'effect.after-receipt' && !lost) {
        lost = true;
        throw new Error('lost receipt acknowledgement');
    } });
    try {
        const view = await plan(f, 'stopped-usage');
        await approve(f, view, 'stopped-approve');
        await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'stopped-start', planVersion: view.plan!.version });
        const op = f.store.snapshot().operations[0]!;
        await f.service.command(f.token, view.task.taskId, { kind: 'stop', scope: 'task', commandId: 'stopped-fence' });
        assert.equal(f.store.snapshot().reservations.find(r => r.operationId === op.operationId)!.state, 'unknown');
        await f.service.command(f.token, view.task.taskId, { kind: 'reconcile', operationId: op.operationId, commandId: 'stopped-reconcile' });
        const state = f.store.snapshot();
        const reservation = state.reservations.find(r => r.operationId === op.operationId)!;
        assert.equal(reservation.state, 'settled');
        assert.equal(reservation.settledUnits, 1);
        assert.equal(f.effects.executionCount, 1);
        assert.equal(state.artifacts.length, 0);
        assert.equal(f.service.getTask(f.token, view.task.taskId).task.stopped, true);
        assert.throws(() => f.service.result(f.token, view.task.taskId), { code: 'ARTIFACT_NOT_COMMITTED' });
    }
    finally {
        f.cleanup();
    }
});
async function denied(action: () => unknown | Promise<unknown>): Promise<void> {
    let response: unknown;
    try {
        response = await action();
    }
    catch (e) {
        assert.ok(e instanceof Error);
        return;
    }
    assert.equal((response as CommandResponse).acceptance, 'rejected');
}
function fixture(failpoint?: (name: string) => void | Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-session-'));
    const runtime = createLocalRuntime({ directory, ...(failpoint ? { failpoint } : {}) });
    const token = runtime.service.login(TEST_CREDENTIALS.operator).token;
    const approver = runtime.service.login(TEST_CREDENTIALS.approver).token;
    const outsider = runtime.service.login(TEST_CREDENTIALS.outsider).token;
    return { ...runtime, token, approver, outsider, cleanup: () => { runtime.close(); rmSync(directory, { recursive: true, force: true }); } };
}
async function plan(f: ReturnType<typeof fixture>, id: string) {
    const response = await f.service.createTask(f.token, { spaceId: 'private-test', title: 'Local workflow', input: 'Produce synthetic report', intent: 'act', commandId: id });
    assert.ok(response.task?.plan);
    return response.task as TaskView;
}
async function approve(f: ReturnType<typeof fixture>, view: TaskView, id: string) {
    const response = await f.service.command(f.approver, view.task.taskId, { kind: 'approve', commandId: id, planVersion: view.plan!.version });
    assert.equal(response.acceptance, 'accepted');
}
test('G1-LR06/ask-plan', async () => {
    const f = fixture();
    try {
        const ask = await f.service.createTask(f.token, { spaceId: 'private-test', title: 'Ask', input: 'Explain the synthetic input', intent: 'ask', commandId: 'ask' });
        assert.equal(ask.completion, 'committed');
        assert.ok(ask.task);
        assert.equal(ask.task.task.intent, 'ask');
        assert.ok(f.store.snapshot().modelOperations.find(row => row.taskId === ask.taskId)!.output);
        assert.equal(f.effects.executionCount, 0);
        assert.equal(f.store.snapshot().operations.length, 0);
        const planned = await f.service.createTask(f.token, { spaceId: 'private-test', title: 'Plan', input: 'Plan a report', intent: 'plan', commandId: 'plan' });
        assert.ok(planned.task?.plan);
        assert.equal(planned.task.plan.version, 1);
        assert.equal(planned.task.plan.requiresApproval, true);
        assert.equal(planned.task.result, null);
        assert.equal(f.effects.executionCount, 0);
        assert.equal(f.model.invocationCount, 2);
        assert.equal(planned.task.remoteAllowed, false);
        assert.equal(planned.task.effectMode, 'synthetic-only');
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR06/approved-synthetic-run', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'approved-run');
        const unapproved = await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'unapproved', planVersion: view.plan!.version });
        assert.equal(unapproved.acceptance, 'requires-review');
        assert.equal(unapproved.task!.runs.at(-1)!.waiting!.reason, 'approval');
        assert.equal(f.effects.executionCount, 0);
        await approve(f, view, 'approved-binding');
        const run = await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'approved-start', planVersion: view.plan!.version });
        assert.equal(run.acceptance, 'accepted');
        assert.equal(run.completion, 'committed');
        assert.ok(run.task?.result?.committed);
        assert.equal(f.effects.executionCount, 1);
        assert.equal(run.task.runs.at(-1)!.state, 'succeeded');
        assert.equal(run.task.checks.length, 1);
        assert.equal(run.task.checks[0]!.outcome, 'pass');
        assert.equal(run.task.checks[0]!.artifactDigest, run.task.result.digest);
        assert.equal(run.task.checks[0]!.assurance, 'local-synthetic');
        assert.deepEqual(f.service.result(f.token, view.task.taskId), run.task.result);
        assert.ok(run.task.runs.at(-1)!.evidenceIds.length);
        assert.equal(run.task.paidCallsAllowed, false);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR06/plan-drift', async () => {
    const f = fixture();
    try {
        const old = await plan(f, 'drift');
        await approve(f, old, 'old-plan-approval');
        const revised = await f.service.command(f.token, old.task.taskId, { kind: 'reviseTask', commandId: 'new-input', input: 'Changed requirements', expectedRevision: f.service.getTask(f.token, old.task.taskId).task.revision });
        assert.ok(revised.task?.plan);
        assert.ok(revised.task.plan.version > old.plan!.version);
        assert.ok(revised.task.task.requirementsRevision > old.task.requirementsRevision);
        await denied(() => f.service.command(f.token, old.task.taskId, { kind: 'startRun', commandId: 'old-plan-start', planVersion: old.plan!.version }));
        const unapproved = await f.service.command(f.token, old.task.taskId, { kind: 'startRun', commandId: 'new-plan-old-approval', planVersion: revised.task!.plan!.version });
        assert.equal(unapproved.acceptance, 'requires-review');
        assert.equal(unapproved.task!.runs.at(-1)!.waiting!.reason, 'approval');
        assert.equal(f.effects.executionCount, 0);
        assert.equal(f.store.snapshot().artifacts.length, 0);
        await approve(f, revised.task, 'new-plan-approval');
        const current = await f.service.command(f.token, old.task.taskId, { kind: 'startRun', commandId: 'current-plan-start', planVersion: revised.task.plan.version });
        assert.equal(current.completion, 'committed');
        assert.equal(f.effects.executionCount, 1);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR06/terminal-new-run', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'terminal');
        await approve(f, view, 'first-attempt-approval');
        const first = await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'first-attempt', planVersion: view.plan!.version });
        assert.equal(first.completion, 'committed');
        const original = first.task!.runs.at(-1)!;
        assert.equal(original.state, 'succeeded');
        const charges = f.store.snapshot().budgets.reduce((sum, row) => sum + row.settled, 0);
        assert.ok(charges > 0);
        const retry = await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'explicit-new-attempt', planVersion: view.plan!.version });
        assert.equal(retry.acceptance, 'accepted');
        assert.ok(retry.task);
        const newAttempt = retry.task.runs.at(-1)!;
        assert.notEqual(newAttempt.runId, original.runId);
        assert.ok(newAttempt.attempt > original.attempt);
        assert.deepEqual(retry.task.runs.find(row => row.runId === original.runId), original, 'terminal run evidence and charges remain immutable');
        assert.ok(f.store.snapshot().budgets.reduce((sum, row) => sum + row.settled, 0) >= charges);
        assert.equal(f.effects.executionCount, 1, 'fresh attempt must wait for a new exact approval');
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR07/stale-progress-stop', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'stale-stop');
        const stop = { kind: 'stop' as const, commandId: 'stale-view-stop', scope: 'task' as const, expectedRevision: 0 };
        const response = await f.service.command(f.token, view.task.taskId, stop);
        assert.equal(response.acceptance, 'accepted');
        assert.ok(response.stop?.dispatchFenced);
        assert.equal(response.stop.processesTerminated, null);
        assert.ok(response.generation > view.task.generation);
        assert.equal(response.task!.task.stopped, true);
        const state = f.store.snapshot();
        const duplicate = await f.service.command(f.token, view.task.taskId, stop);
        assert.deepEqual(duplicate, response);
        assert.deepEqual(f.store.snapshot(), state);
        assert.equal(f.effects.executionCount, 0);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR07/current-stop-authority', async () => {
    const f = fixture();
    try {
        const view = await plan(f, 'stop-authority');
        const before = f.store.snapshot();
        await denied(() => f.service.command(f.outsider, view.task.taskId, { kind: 'stop', commandId: 'cross-space-stop', scope: 'task', expectedRevision: 0 }));
        assert.deepEqual(f.store.snapshot(), before);
        f.store.transaction(state => { const member = state.spaces.find(s => s.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === view.task.ownerActorId)!; member.grants = member.grants.filter(g => g !== 'stop'); member.revision++; state.authorityRevision++; });
        const revoked = f.store.snapshot();
        await denied(() => f.service.command(f.token, view.task.taskId, { kind: 'stop', commandId: 'revoked-stop', scope: 'task', expectedRevision: 0 }));
        assert.deepEqual(f.store.snapshot(), revoked);
        assert.equal(f.effects.executionCount, 0);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR07/generation-fence', async () => {
    let entered!: () => void, release!: () => void;
    const entering = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const f = fixture(name => { if (name === 'effect.after-receipt') {
        entered();
        return hold;
    } });
    let outstanding: Promise<CommandResponse> | undefined;
    try {
        const view = await plan(f, 'inflight-stop');
        await approve(f, view, 'inflight-approval');
        outstanding = f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'inflight-start', planVersion: view.plan!.version });
        await Promise.race([entering, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('effect failpoint was not reached')), 3000))]);
        assert.equal(f.effects.executionCount, 1);
        const current = f.service.getTask(f.token, view.task.taskId);
        const oldFence = current.runs.at(-1)!.fence;
        const command = { kind: 'stop' as const, commandId: 'fence-inflight', scope: 'task' as const, expectedRevision: 0 };
        const stopped = await f.service.command(f.token, view.task.taskId, command);
        assert.equal(stopped.stop!.inFlight, 'unknown');
        assert.equal(stopped.stop!.dispatchFenced, true);
        assert.ok(stopped.generation > oldFence.taskGeneration);
        release();
        const late = await outstanding;
        assert.equal(late.completion, 'unknown');
        assert.equal(f.effects.executionCount, 1);
        assert.equal(f.store.snapshot().artifacts.filter(row => row.committed).length, 0);
        assert.throws(() => f.service.result(f.token, view.task.taskId));
        const duplicate = await f.service.command(f.token, view.task.taskId, command);
        assert.deepEqual(duplicate.stop, stopped.stop);
        assert.equal(f.service.getTask(f.token, view.task.taskId).task.generation, stopped.generation);
    }
    finally {
        release();
        await outstanding?.catch(() => undefined);
        f.cleanup();
    }
});
