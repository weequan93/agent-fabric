import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createLocalRuntime } from '../src/session-service.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import type { TaskView } from '../src/contracts.js';
function fixture(failpoint?: (name: string) => void | Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-store-'));
    const runtime = createLocalRuntime({ directory, ...(failpoint ? { failpoint } : {}) });
    const token = runtime.service.login(TEST_CREDENTIALS.operator).token;
    const approver = runtime.service.login(TEST_CREDENTIALS.approver).token;
    return { ...runtime, directory, token, approver, cleanup: () => { runtime.close(); rmSync(directory, { recursive: true, force: true }); } };
}
async function planned(f: ReturnType<typeof fixture>, commandId: string) {
    const response = await f.service.createTask(f.token, { spaceId: 'private-test', title: 'Synthetic artifact', input: 'Create artifact', intent: 'act', commandId });
    assert.ok(response.task?.plan);
    return response.task as TaskView;
}
async function approved(f: ReturnType<typeof fixture>, commandId: string) {
    const view = await planned(f, commandId);
    await f.service.command(f.approver, view.task.taskId, { kind: 'approve', planVersion: view.plan!.version, commandId: commandId + '-approve' });
    return view;
}
test('G1-LR05/sqlite-rollback', async () => {
    const f = fixture();
    try {
        await planned(f, 'rollback');
        const before = f.store.snapshot();
        assert.equal(readFileSync(f.store.filePath).subarray(0, 16).toString(), 'SQLite format 3\0');
        assert.ok(before.tasks.length);
        assert.ok(before.events.length);
        assert.ok(before.outbox.length);
        assert.throws(() => f.store.transaction(state => {
            state.tasks[0]!.title = 'uncommitted';
            state.outbox[0]!.state = 'unknown';
            state.events[0]!.kind = 'uncommitted';
            state.authorityRevision++;
            throw new Error('rollback record/event/outbox together');
        }), /rollback record/);
        assert.deepEqual(f.store.snapshot(), before);
        assert.throws(() => f.store.transaction(state => { state.tasks[0]!.input = 'promise must rollback'; return Promise.resolve(); }));
        assert.deepEqual(f.store.snapshot(), before);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR05/crash-reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'af-g1-crash-'));
    const serviceUrl = new URL('../src/session-service.js', import.meta.url).href;
    const identityUrl = new URL('../src/identity.js', import.meta.url).href;
    const child = `import {createLocalRuntime} from ${JSON.stringify(serviceUrl)};import {TEST_CREDENTIALS} from ${JSON.stringify(identityUrl)};const r=createLocalRuntime({directory:${JSON.stringify(directory)}});const token=r.service.login(TEST_CREDENTIALS.operator).token;const result=await r.service.createTask(token,{spaceId:'private-test',title:'Crash durable',input:'Persist this synthetic task',intent:'ask',commandId:'crash-create'});process.stdout.write(JSON.stringify({taskId:result.taskId,state:r.store.snapshot()})+'\\n',()=>process.kill(process.pid,'SIGKILL'));`;
    let r: ReturnType<typeof createLocalRuntime> | undefined;
    try {
        const crashed = spawnSync(process.execPath, ['--input-type=module', '-e', child], { encoding: 'utf8', timeout: 15000 });
        assert.equal(crashed.signal, 'SIGKILL', crashed.stderr);
        const original = JSON.parse(crashed.stdout.trim()) as {
            taskId: string;
            state: ReturnType<typeof createLocalRuntime>['store'] extends {
                snapshot(): infer S;
            } ? S : never;
        };
        r = createLocalRuntime({ directory });
        const token = r.service.login(TEST_CREDENTIALS.operator).token;
        const view = r.service.getTask(token, original.taskId);
        assert.equal(view.task.taskId, original.taskId);
        const state = r.store.snapshot();
        assert.deepEqual(state.tasks, original.state.tasks);
        assert.deepEqual(state.outbox, original.state.outbox);
        assert.deepEqual(state.modelOperations, original.state.modelOperations);
        assert.deepEqual(state.reservations, original.state.reservations);
        assert.equal(r.model.invocationCount, 0);
        assert.equal(r.effects.executionCount, 0);
    }
    finally {
        r?.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
test('G1-LR05/duplicate-settlement', async () => {
    const f = fixture();
    try {
        const view = await approved(f, 'duplicate');
        const command = { kind: 'startRun' as const, commandId: 'original-start', planVersion: view.plan!.version };
        const first = await f.service.command(f.token, view.task.taskId, command);
        assert.equal(first.completion, 'committed');
        const before = f.store.snapshot();
        const effects = f.effects.executionCount;
        const repeat = await f.service.command(f.token, view.task.taskId, command);
        assert.deepEqual(repeat, first);
        assert.deepEqual(f.store.snapshot(), before);
        assert.equal(f.effects.executionCount, effects);
        assert.equal(effects, 1);
        assert.equal(before.artifacts.filter(row => row.committed).length, 1);
        const op = before.operations[0]!;
        const reservation = before.reservations.find(row => row.reservationId === op.reservationId)!;
        assert.equal(reservation.state, 'settled');
        assert.equal(reservation.receiptId, op.receiptId);
        await f.service.command(f.token, view.task.taskId, { kind: 'reconcile', commandId: 'duplicate-reconcile', operationId: op.operationId });
        assert.equal(f.effects.executionCount, 1);
        assert.equal(f.store.snapshot().artifacts.length, 1);
        assert.deepEqual(f.store.snapshot().budgets, before.budgets);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR05/partial-commit', async () => {
    let armed = false, failed = false;
    const f = fixture(name => { if (name === 'service.before-settle' && armed && !failed) {
        failed = true;
        throw new Error('owner transaction interrupted');
    } });
    try {
        const view = await approved(f, 'partial');
        armed = true;
        const response = await f.service.command(f.token, view.task.taskId, { kind: 'startRun', commandId: 'partial-start', planVersion: view.plan!.version });
        assert.equal(response.completion, 'unknown');
        assert.equal(f.effects.executionCount, 1);
        assert.equal(f.store.snapshot().artifacts.filter(row => row.committed).length, 0);
        assert.throws(() => f.service.result(f.token, view.task.taskId));
        const op = f.store.snapshot().operations[0]!;
        assert.equal(op.state, 'unknown');
        assert.equal(f.store.snapshot().reservations.find(row => row.reservationId === op.reservationId)!.state, 'unknown');
        await f.service.command(f.token, view.task.taskId, { kind: 'reconcile', operationId: op.operationId, commandId: 'partial-reconcile' });
        const artifact = f.service.result(f.token, view.task.taskId);
        assert.equal(artifact.committed, true);
        assert.equal(artifact.byteLength, Buffer.byteLength(artifact.text));
        assert.equal(f.effects.executionCount, 1);
    }
    finally {
        f.cleanup();
    }
});
test('G1-LR05/unknown-reconcile', async () => {
    let lost = false;
    const f = fixture(name => { if (name === 'effect.after-receipt' && !lost) {
        lost = true;
        throw new Error('ack lost after durable synthetic effect');
    } });
    try {
        const view = await approved(f, 'unknown');
        const command = { kind: 'startRun' as const, commandId: 'unknown-start', planVersion: view.plan!.version };
        const unknown = await f.service.command(f.token, view.task.taskId, command);
        assert.equal(unknown.completion, 'unknown');
        assert.equal(f.effects.executionCount, 1);
        const op = f.store.snapshot().operations[0]!;
        const reservation = f.store.snapshot().reservations.find(row => row.reservationId === op.reservationId)!;
        assert.equal(op.state, 'unknown');
        assert.equal(reservation.state, 'unknown');
        assert.equal(reservation.receiptId, null);
        const lookup = await f.effects.lookup(op.operationId, op.scope);
        assert.equal(lookup.status, 'found');
        assert.ok(lookup.receipt);
        await f.service.command(f.token, view.task.taskId, command);
        assert.equal(f.effects.executionCount, 1);
        const reconcile = { kind: 'reconcile' as const, operationId: op.operationId, commandId: 'trusted-lookup' };
        const first = await f.service.command(f.token, view.task.taskId, reconcile);
        assert.equal(first.completion, 'committed');
        const settled = f.store.snapshot().reservations.find(row => row.reservationId === reservation.reservationId)!;
        assert.equal(settled.receiptId, lookup.receipt!.receiptId);
        assert.equal(settled.state, 'settled');
        const balances = f.store.snapshot().budgets;
        await f.service.command(f.token, view.task.taskId, reconcile);
        assert.deepEqual(f.store.snapshot().budgets, balances);
        assert.equal(f.effects.executionCount, 1);
        assert.equal(f.store.snapshot().artifacts.length, 1);
    }
    finally {
        f.cleanup();
    }
});
