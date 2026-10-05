import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalRuntime } from '../src/session-service.js';
import { startLocalHttp } from '../src/http.js';
import { LocalClient } from '../src/client.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import type { CommandResponse, LocalState } from '../src/contracts.js';

const code = (expected: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === expected;
function gate(point: string) {
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }); const hold = new Promise<void>(resolve => { release = resolve; });
  return { release, wait: async () => { let timer: ReturnType<typeof setTimeout> | undefined; try { await Promise.race([reached, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Actual failpoint not reached: ' + point)), 4000); })]); } finally { if (timer) clearTimeout(timer); } }, hook: (name: string) => { if (name === point) { entered(); return hold; } } };
}
async function fixture(failpoint?: (name: string) => void | Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-fault-'));
  const runtime = createLocalRuntime({ directory, ...(failpoint ? { failpoint } : {}) }); const http = await startLocalHttp({ service: runtime.service, port: 0 });
  const operator = new LocalClient(http.baseUrl), approver = new LocalClient(http.baseUrl);
  await operator.login(TEST_CREDENTIALS.operator); await approver.login(TEST_CREDENTIALS.approver);
  return { ...runtime, directory, http, operator, approver, cleanup: async () => { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); } };
}
async function approved(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const created = await f.operator.createTask({ spaceId: 'private-test', title: 'Fault synthetic report', input: 'Create synthetic artifact', intent: 'act', commandId: id });
  assert.ok(created.task?.plan); await f.approver.command(created.taskId, { kind: 'approve', planVersion: created.task.plan.version, commandId: id + '-approval' }); return created;
}
function conservation(state: LocalState) {
  for (const budget of state.budgets) {
    const rows = state.reservations.filter(row => row.scope.tenantId === budget.scope.tenantId && row.scope.spaceId === budget.scope.spaceId && row.payerId === budget.payerId);
    assert.equal(budget.reserved, rows.filter(row => row.state === 'reserved' || row.state === 'unknown').reduce((sum, row) => sum + row.units, 0));
    assert.equal(budget.settled, rows.filter(row => row.state === 'settled').reduce((sum, row) => sum + row.settledUnits, 0));
    assert.ok(budget.reserved >= 0 && budget.settled >= 0 && budget.reserved + budget.settled <= budget.ceiling);
  }
}

test('fault: lost committed create acknowledgement is recovered by original actor/Space query without another POST', async () => {
  const f = await fixture(); let createPosts = 0, lose = true;
  const proxy = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url ?? '/', f.http.baseUrl); const create = incoming.method === 'POST' && target.pathname === '/v1/tasks'; if (create) createPosts++;
    const upstream = httpRequest({ hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: incoming.method, headers: { ...incoming.headers, host: target.host } }, response => {
      if (create && lose) { lose = false; response.resume(); response.on('end', () => outgoing.destroy()); }
      else { outgoing.writeHead(response.statusCode ?? 500, response.headers); response.pipe(outgoing); }
    }); upstream.on('error', error => outgoing.destroy(error)); incoming.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  try {
    const client = new LocalClient(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`); await client.login(TEST_CREDENTIALS.operator); client.unsentDraft = 'Keep mobile/desktop draft';
    await assert.rejects(() => client.createTask({ spaceId: 'private-test', title: 'Lost create acknowledgement', input: 'Durable synthetic answer', intent: 'ask', commandId: 'lost-create-original' }), code('UNKNOWN_DELIVERY'));
    assert.equal(client.lastDelivery!.commandId, 'lost-create-original'); assert.equal(client.lastDelivery!.taskId, null);
    assert.equal(createPosts, 1); assert.equal(f.store.snapshot().tasks.length, 1); assert.equal(f.model.invocationCount, 1);
    await client.reconnect(); const original = await client.queryCommand('lost-create-original', 'private-test');
    assert.equal(original.completion, 'committed'); assert.equal(original.taskId, f.store.snapshot().tasks[0]!.taskId); assert.ok(original.task?.result?.committed);
    assert.equal(client.unsentDraft, 'Keep mobile/desktop draft'); assert.equal(createPosts, 1);
    await assert.rejects(() => f.approver.queryCommand('lost-create-original', 'private-test'), code('NOT_FOUND'));
    await assert.rejects(() => client.queryCommand('lost-create-original', 'other-test'), code('UNAUTHORIZED'));
    assert.equal(f.effects.executionCount, 0); conservation(f.store.snapshot());
  } finally { await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve())); await f.cleanup(); }
});

test('fault: approver revocation after a durable effect receipt permits accounting but never late publication', async () => {
  const g = gate('effect.after-receipt'), f = await fixture(g.hook); let outstanding: Promise<CommandResponse> | undefined;
  try {
    const made = await approved(f, 'issuer-fault');
    outstanding = f.operator.command(made.taskId, { kind: 'startRun', commandId: 'issuer-fault-start', planVersion: made.task!.plan!.version }); await g.wait();
    const op = f.store.snapshot().operations[0]!; const original = await f.effects.lookup(op.operationId, op.scope); assert.ok(original.receipt); assert.equal(f.effects.executionCount, 1);
    f.store.transaction(state => { state.identities.find(actor => actor.actorId === 'actor-approver')!.revoked = true; state.authorityRevision++; });
    g.release(); assert.equal((await outstanding).completion, 'unknown'); assert.equal(f.store.snapshot().artifacts.length, 0);
    const held = f.store.snapshot().reservations.find(row => row.operationId === op.operationId)!; assert.equal(held.state, 'unknown'); conservation(f.store.snapshot());
    await f.operator.command(made.taskId, { kind: 'reconcile', operationId: op.operationId, commandId: 'issuer-fault-original-receipt' });
    const after = f.store.snapshot(); assert.equal(after.reservations.find(row => row.reservationId === held.reservationId)!.receiptId, original.receipt!.receiptId);
    assert.equal(after.reservations.find(row => row.reservationId === held.reservationId)!.state, 'settled'); assert.equal(after.artifacts.length, 0); assert.equal(f.effects.executionCount, 1); conservation(after);
    await assert.rejects(() => f.operator.result(made.taskId), code('ARTIFACT_NOT_COMMITTED'));
  } finally { g.release(); await outstanding?.catch(() => undefined); await f.cleanup(); }
});

test('fault: source content changes while model receipt awaits settlement preserve known usage without stale publication', async () => {
  const g = gate('model.after-receipt'), f = await fixture(g.hook); let outstanding: Promise<CommandResponse> | undefined;
  try {
    outstanding = f.operator.createTask({ spaceId: 'private-test', title: 'Pinned source model', input: 'Summarize source', sourceIds: ['source-private'], intent: 'ask', commandId: 'source-model-fault' }); await g.wait();
    const op = f.store.snapshot().modelOperations[0]!; const original = await f.model.lookup(op.operationId, op.scope); assert.ok(original.receipt?.output.includes('Synthetic private decision.'));
    f.store.transaction(state => { const source = state.sources.find(source => source.sourceId === 'source-private')!; source.content = 'Changed authorized source'; source.revision++; state.authorityRevision++; });
    g.release(); assert.equal((await outstanding).completion, 'unknown'); assert.equal(f.store.snapshot().artifacts.length, 0);
    await f.operator.command(op.taskId, { kind: 'reconcile', commandId: 'source-model-original-receipt', operationId: op.operationId });
    const after = f.store.snapshot(); const reservation = after.reservations.find(row => row.operationId === op.operationId)!;
    assert.equal(reservation.state, 'settled'); assert.equal(reservation.receiptId, original.receipt!.receiptId); assert.equal(reservation.settledUnits, original.receipt!.syntheticUnits);
    assert.equal(after.artifacts.length, 0); assert.equal(f.model.invocationCount, 1); assert.equal(f.effects.executionCount, 0); conservation(after);
  } finally { g.release(); await outstanding?.catch(() => undefined); await f.cleanup(); }
});

test('fault: concurrent identical command remains pending until one actual effect completes', async () => {
  const g = gate('effect.before-execute'), f = await fixture(g.hook); let first: Promise<CommandResponse> | undefined;
  try {
    const made = await approved(f, 'concurrent'); const secondClient = new LocalClient(f.http.baseUrl); await secondClient.login(TEST_CREDENTIALS.operator);
    const command = { kind: 'startRun' as const, commandId: 'concurrent-original-start', planVersion: made.task!.plan!.version };
    first = f.operator.command(made.taskId, command); await g.wait();
    const duplicate = await secondClient.command(made.taskId, command);
    assert.equal(duplicate.commandId, command.commandId); assert.equal(duplicate.taskId, made.taskId); assert.equal(duplicate.completion, 'pending', 'an in-flight operation has no receipt or committed result');
    assert.equal(f.effects.executionCount, 0); assert.equal(f.store.snapshot().operations.length, 1);
    g.release(); const complete = await first; assert.equal(complete.completion, 'committed');
    assert.equal(f.effects.executionCount, 1); assert.equal(f.effects.receiptCount, 1); assert.equal(f.store.snapshot().artifacts.length, 1);
    assert.equal(f.store.snapshot().commands.filter(row => row.commandId === command.commandId).length, 1); conservation(f.store.snapshot());
  } finally { g.release(); await first?.catch(() => undefined); await f.cleanup(); }
});

test('fault: Stop reconciles known original usage exactly once without publishing the stopped result', async () => {
  const g = gate('effect.after-receipt'), f = await fixture(g.hook); let outstanding: Promise<CommandResponse> | undefined;
  try {
    const made = await approved(f, 'stop-accounting');
    outstanding = f.operator.command(made.taskId, { kind: 'startRun', commandId: 'stop-accounting-start', planVersion: made.task!.plan!.version }); await g.wait();
    const op = f.store.snapshot().operations[0]!; const original = await f.effects.lookup(op.operationId, op.scope); assert.ok(original.receipt);
    const stopped = await f.operator.command(made.taskId, { kind: 'stop', commandId: 'stop-accounting-fence', scope: 'task', expectedRevision: 0 }); assert.equal(stopped.stop!.inFlight, 'unknown');
    g.release(); assert.equal((await outstanding).completion, 'unknown');
    const command = { kind: 'reconcile' as const, commandId: 'stop-accounting-original-receipt', operationId: op.operationId };
    await f.operator.command(made.taskId, command); const state = f.store.snapshot(); conservation(state);
    const reservation = state.reservations.find(row => row.operationId === op.operationId)!; assert.equal(reservation.state, 'settled'); assert.equal(reservation.receiptId, original.receipt!.receiptId);
    assert.equal(state.artifacts.length, 0); assert.equal(state.tasks[0]!.stopped, true); assert.equal(f.effects.executionCount, 1);
    await f.operator.command(made.taskId, command); assert.deepEqual(f.store.snapshot().budgets, state.budgets); assert.equal(f.effects.executionCount, 1);
    await assert.rejects(() => f.operator.result(made.taskId), code('ARTIFACT_NOT_COMMITTED'));
  } finally { g.release(); await outstanding?.catch(() => undefined); await f.cleanup(); }
});

test('fault: HTTP restart retains unknown original reservation and performs zero executor replay before receipt lookup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-http-unknown-restart-')); let lost = false;
  let runtime = createLocalRuntime({ directory, failpoint: name => { if (name === 'effect.after-receipt' && !lost) { lost = true; throw new Error('effect ack lost'); } } });
  let http = await startLocalHttp({ service: runtime.service, port: 0 });
  try {
    let operator = new LocalClient(http.baseUrl); const approver = new LocalClient(http.baseUrl); await operator.login(TEST_CREDENTIALS.operator); await approver.login(TEST_CREDENTIALS.approver);
    const made = await operator.createTask({ spaceId: 'private-test', title: 'Unknown after restart', input: 'Synthetic result', intent: 'act', commandId: 'restart-fault-create' }); assert.ok(made.task?.plan);
    await approver.command(made.taskId, { kind: 'approve', commandId: 'restart-fault-approve', planVersion: made.task.plan.version });
    const outcome = await operator.command(made.taskId, { kind: 'startRun', commandId: 'restart-fault-original-start', planVersion: made.task.plan.version }); assert.equal(outcome.completion, 'unknown');
    const op = runtime.store.snapshot().operations[0]!, held = runtime.store.snapshot().reservations.find(row => row.operationId === op.operationId)!; const balances = runtime.store.snapshot().budgets;
    assert.equal(held.state, 'unknown'); await http.close(); runtime.close();
    runtime = createLocalRuntime({ directory }); http = await startLocalHttp({ service: runtime.service, port: 0 }); operator = new LocalClient(http.baseUrl); await operator.login(TEST_CREDENTIALS.operator);
    await operator.getTask(made.taskId); await operator.events(made.taskId); await operator.queryCommand('restart-fault-original-start', 'private-test');
    assert.equal(runtime.model.invocationCount, 0); assert.equal(runtime.effects.executionCount, 0); assert.deepEqual(runtime.store.snapshot().budgets, balances);
    assert.equal(runtime.store.snapshot().operations[0]!.operationId, op.operationId); assert.equal(runtime.store.snapshot().reservations.find(row => row.reservationId === held.reservationId)!.state, 'unknown');
    await assert.rejects(() => operator.command(made.taskId, { kind: 'reviseTask', commandId: 'restart-no-blind-resume', input: 'Do not implicitly retry' }), code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
    await operator.command(made.taskId, { kind: 'reconcile', commandId: 'restart-original-lookup', operationId: op.operationId });
    assert.ok((await operator.result(made.taskId)).committed); assert.equal(runtime.model.invocationCount, 0); assert.equal(runtime.effects.executionCount, 0); assert.equal(runtime.effects.receiptCount, 1); conservation(runtime.store.snapshot());
  } finally { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
