import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLocalRuntime } from '../src/session-service.js';
import { startLocalHttp } from '../src/http.js';
import { LocalClient } from '../src/client.js';
import { TEST_CREDENTIALS } from '../src/identity.js';

const code = (expected: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === expected;

test('integration: three independent SDK sessions observe one independently approved Task/result', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-three-sdk-'));
  const runtime = createLocalRuntime({ directory }); const http = await startLocalHttp({ service: runtime.service, port: 0 });
  try {
    const operator = new LocalClient(http.baseUrl), approver = new LocalClient(http.baseUrl), reader = new LocalClient(http.baseUrl);
    const identities = await Promise.all([operator.login(TEST_CREDENTIALS.operator), approver.login(TEST_CREDENTIALS.approver), reader.login(TEST_CREDENTIALS.operator)]);
    assert.notEqual(identities[0]!.token, identities[2]!.token); assert.notEqual(identities[0]!.identity.actorId, identities[1]!.identity.actorId);
    const created = await operator.createTask({ spaceId: 'private-test', title: 'Shared SDK Task', input: 'Produce a synthetic decision summary', sourceIds: ['source-private'], intent: 'act', commandId: 'three-sdk-create' });
    assert.ok(created.task?.plan); const taskId = created.taskId, version = created.task.plan.version;
    const pinned = runtime.store.snapshot().modelOperations.find(op => op.taskId === taskId)!;
    const receipt = await runtime.model.lookup(pinned.operationId, pinned.scope); assert.ok(receipt.receipt?.output.includes('Synthetic private decision.'));
    await assert.rejects(() => operator.command(taskId, { kind: 'approve', commandId: 'three-sdk-self-approve', planVersion: version }), code('UNAUTHORIZED'));
    assert.equal(runtime.effects.executionCount, 0);
    await approver.command(taskId, { kind: 'approve', commandId: 'three-sdk-approve', planVersion: version });
    const outcome = await operator.command(taskId, { kind: 'startRun', commandId: 'three-sdk-start', planVersion: version });
    assert.equal(outcome.completion, 'committed'); assert.ok(outcome.task?.result?.committed);
    const views = await Promise.all([operator.getTask(taskId), approver.getTask(taskId), reader.getTask(taskId)]);
    for (const view of views) {
      assert.equal(view.task.taskId, taskId); assert.deepEqual(view.task.scope, { tenantId: 'local-test-tenant', spaceId: 'private-test' });
      assert.equal(view.task.ownerActorId, identities[0]!.identity.actorId); assert.equal(view.task.payerId, 'actor-operator');
      assert.deepEqual(view.result, outcome.task.result); assert.equal(view.modelMode, 'deterministic-test'); assert.equal(view.effectMode, 'synthetic-only');
      assert.equal(view.remoteAllowed, false); assert.equal(view.paidCallsAllowed, false);
    }
    const result = await reader.result(taskId); assert.equal(result.digest, createHash('sha256').update(result.text).digest('hex')); assert.equal(result.byteLength, Buffer.byteLength(result.text));
    assert.equal(outcome.task.checks[0]!.artifactDigest, result.digest); assert.equal(outcome.task.checks[0]!.outcome, 'pass');
    assert.equal(runtime.model.invocationCount, 1); assert.equal(runtime.effects.executionCount, 1);
    assert.equal(runtime.model.externalInvocationCount, 0); assert.equal(runtime.effects.externalInvocationCount, 0);
    assert.equal(runtime.model.receiptCount, 1); assert.equal(runtime.effects.receiptCount, 1);
    const state = runtime.store.snapshot(); assert.equal(state.tasks.length, 1); assert.equal(state.artifacts.length, 1);
    assert.ok(state.reservations.every(row => row.state === 'settled' && row.payerId === 'actor-operator' && row.receiptId));
    runtime.store.transaction(s => { s.sources.find(source => source.sourceId === 'source-private')!.audience = ['actor-operator']; s.authorityRevision++; });
    await assert.rejects(() => approver.getTask(taskId), code('UNAUTHORIZED'));
    assert.deepEqual((await reader.getTask(taskId)).result, result);
    assert.equal(runtime.effects.executionCount, 1);
  } finally { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('integration: owner transaction rejects immutable payer drift and preserves the original SDK Task', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-payer-drift-'));
  const runtime = createLocalRuntime({ directory }); const http = await startLocalHttp({ service: runtime.service, port: 0 });
  try {
    const client = new LocalClient(http.baseUrl); await client.login(TEST_CREDENTIALS.operator);
    const created = await client.createTask({ spaceId: 'private-test', title: 'Pinned payer', input: 'Synthetic report', intent: 'plan', commandId: 'payer-create' });
    assert.ok(created.task?.plan); const before = runtime.store.snapshot();
    assert.throws(() => runtime.store.transaction(state => { state.spaces.find(s => s.scope.spaceId === 'private-test')!.payerId = 'actor-outsider'; state.authorityRevision++; }), code('SCOPE_MISMATCH'));
    assert.deepEqual(runtime.store.snapshot(), before, 'payer corruption must roll back at the authoritative storage boundary');
    const preserved = await client.getTask(created.taskId); assert.equal(preserved.task.payerId, 'actor-operator');
    assert.deepEqual(preserved.task.scope, created.task!.task.scope);
    const request = { spaceId: 'private-test', title: 'Forged payer', input: 'Caller cannot choose a new payer', commandId: 'forged-payer', payerId: 'actor-outsider' };
    await assert.rejects(() => client.createTask(request), code('INVALID_SCHEMA'));
    assert.equal(runtime.effects.executionCount, 0); assert.equal(runtime.model.invocationCount, 1);
    assert.deepEqual(runtime.store.snapshot().budgets, before.budgets); assert.deepEqual(runtime.store.snapshot().reservations, before.reservations);
  } finally { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
