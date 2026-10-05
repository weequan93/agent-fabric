import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLocalRuntime } from '../src/session-service.js';
import { TEST_CREDENTIALS } from '../src/identity.js';
import { startLocalHttp } from '../src/http.js';
import { LocalClient } from '../src/client.js';
import type { TaskView } from '../src/contracts.js';

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-http-'));
  const runtime = createLocalRuntime({ directory });
  const http = await startLocalHttp({ service: runtime.service, port: 0 });
  const client = new LocalClient(http.baseUrl);
  const login = await client.login(TEST_CREDENTIALS.operator);
  const token = runtime.service.login(TEST_CREDENTIALS.operator).token;
  return { ...runtime, directory, http, client, login, token, cleanup: async () => { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); } };
}
function raw(baseUrl: string, path: string, options: { method?: string; token?: string; body?: unknown; text?: string; headers?: Record<string, string> } = {}) {
  const url = new URL(path, baseUrl); const body = options.text ?? (options.body === undefined ? '' : JSON.stringify(options.body));
  return new Promise<{ status: number; text: string; body: any }>((resolve, reject) => {
    const req = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: options.method ?? 'GET', headers: { ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(body ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } : {}), ...options.headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; }); response.on('end', () => { let value: unknown; try { value = JSON.parse(text); } catch { value = null; } resolve({ status: response.statusCode ?? 0, text, body: value }); });
    }); req.on('error', reject); req.end(body);
  });
}
async function create(f: Awaited<ReturnType<typeof fixture>>, commandId: string, intent: 'ask' | 'plan' = 'ask') {
  const response = await f.client.createTask({ spaceId: 'private-test', title: 'HTTP synthetic Task', input: 'Synthetic local-only input', intent, commandId });
  assert.ok(response.task); return response.task as TaskView;
}
function hasCode(code: string) { return (error: unknown) => error !== null && typeof error === 'object' && 'code' in error && error.code === code; }

test('G1-LR04/real-sdk', async () => {
  const f = await fixture();
  try {
    assert.equal(f.login.identity.identityMode, 'local-test'); assert.equal(f.login.modelMode, 'deterministic-test');
    assert.equal(f.login.paidCallsAllowed, false); assert.equal(f.login.remoteAllowed, false);
    const spaces = await f.client.spaces(); assert.ok(spaces.some(s => s.scope.spaceId === 'private-test'));
    const view = await create(f, 'sdk-create'); const read = await f.client.getTask(view.task.taskId);
    assert.equal(read.task.taskId, view.task.taskId); assert.deepEqual(read.task.scope, view.task.scope);
    assert.equal(read.task.ownerActorId, f.login.identity.actorId); assert.equal(read.task.payerId, 'actor-operator');
    assert.equal(read.modelMode, 'deterministic-test'); assert.equal(read.effectMode, 'synthetic-only');
    assert.equal(f.model.invocationCount, 1); assert.equal(f.effects.executionCount, 0);
    assert.ok(read.result?.committed); assert.deepEqual(await f.client.result(view.task.taskId), read.result);
    assert.ok((await f.client.listTasks('private-test')).some(task => task.task.taskId === view.task.taskId));
    assert.equal((await raw(f.http.baseUrl, '/v1/health')).body.identityMode, 'local-test');
    const stored = f.store.snapshot(); assert.equal(stored.tasks[0]!.taskId, read.task.taskId); assert.equal(stored.reservations[0]!.state, 'settled');
  } finally { await f.cleanup(); }
});

test('G1-LR04/wire-denial', async () => {
  const f = await fixture();
  try {
    const view = await create(f, 'wire-existing', 'plan'); const state = f.store.snapshot();
    for (const fields of [{ actorId: 'actor-outsider' }, { payerId: 'forged-payer' }, { grants: ['simulate'] }, { sourcePermissions: ['source-private'] }, { audience: ['actor-viewer'] }]) {
      const denied = await raw(f.http.baseUrl, '/v1/tasks', { method: 'POST', token: f.token, body: { spaceId: 'private-test', title: 'forged', input: 'x', commandId: 'forged', ...fields } });
      assert.equal(denied.status, 400); assert.equal(denied.body.error.code, 'INVALID_SCHEMA');
    }
    for (const body of [{ kind: 'startRun', commandId: 'partial' }, { kind: 'approve', commandId: 'forged-approval', planVersion: 1, approverActorId: 'actor-approver' }, { kind: 'stop', commandId: 'unknown-target', scope: 'task', taskId: 'forged' }, { kind: 'unknown', commandId: 'unknown' }]) {
      const denied = await raw(f.http.baseUrl, `/v1/tasks/${view.task.taskId}/commands`, { method: 'POST', token: f.token, body });
      assert.equal(denied.status, 400); assert.equal(denied.body.error.code, 'INVALID_SCHEMA');
    }
    assert.deepEqual(f.store.snapshot(), state); assert.equal(f.effects.executionCount, 0);
    for (const headers of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { origin: 'null' }]) {
      const denied = await raw(f.http.baseUrl, '/v1/tasks?spaceId=private-test', { token: f.token, headers });
      assert.ok(denied.status === 400 || denied.status === 403); assert.ok(denied.body?.error); assert.ok(!denied.text.includes(view.task.input));
    }
    assert.equal((await raw(f.http.baseUrl, `/v1/tasks/${view.task.taskId}`)).status, 403);
    assert.equal((await raw(f.http.baseUrl, `/v1/tasks/${view.task.taskId}`, { token: 'forged-token' })).status, 403);
    const tooLarge = await raw(f.http.baseUrl, '/v1/tasks', { method: 'POST', token: f.token, text: JSON.stringify({ spaceId: 'private-test', title: 'huge', input: 'x'.repeat(300000), commandId: 'huge' }) });
    assert.equal(tooLarge.status, 413); assert.equal(tooLarge.body.error.code, 'PAYLOAD_TOO_LARGE');
    const outsider = f.service.login(TEST_CREDENTIALS.outsider).token;
    assert.equal((await raw(f.http.baseUrl, `/v1/tasks/${view.task.taskId}`, { token: outsider })).status, 403);
    const invokes = f.model.invocationCount;
    f.store.transaction(s => { s.spaces.find(space => space.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === 'actor-operator')!.revoked = true; s.authorityRevision++; });
    const denied = await raw(f.http.baseUrl, `/v1/tasks/${view.task.taskId}`, { token: f.token }); assert.equal(denied.status, 403); assert.ok(!denied.text.includes(view.task.input));
    assert.equal(f.model.invocationCount, invokes); assert.equal(f.effects.executionCount, 0);
  } finally { await f.cleanup(); }
});

test('G1-LR04/command-dedup', async () => {
  const f = await fixture();
  try {
    const request = { spaceId: 'private-test', title: 'HTTP duplicate', input: 'Fixed input', intent: 'plan' as const, commandId: 'same-create' };
    const first = await f.client.createTask(request); const second = await f.client.createTask(request);
    assert.deepEqual(second, first); assert.equal(f.store.snapshot().tasks.length, 1); assert.equal(f.model.invocationCount, 1);
    await assert.rejects(() => f.client.createTask({ ...request, input: 'changed payload' }), hasCode('IDEMPOTENCY_CONFLICT'));
    const other = await create(f, 'other-task', 'plan');
    const stop = { kind: 'stop' as const, commandId: 'same-stop', scope: 'task' as const, expectedRevision: 0 };
    const stopped = await f.client.command(first.taskId, stop); const generation = stopped.generation; const before = f.store.snapshot();
    assert.deepEqual(await f.client.command(first.taskId, stop), stopped); assert.deepEqual(f.store.snapshot(), before);
    await assert.rejects(() => f.client.command(other.task.taskId, stop), hasCode('IDEMPOTENCY_CONFLICT'));
    assert.equal(f.service.getTask(f.token, first.taskId).task.generation, generation); assert.equal(f.service.getTask(f.token, other.task.taskId).task.stopped, false);
    await assert.rejects(() => f.client.command(first.taskId, { ...stop, scope: 'run', runId: first.task!.runs[0]!.runId }), hasCode('IDEMPOTENCY_CONFLICT'));
    assert.equal(f.effects.executionCount, 0);
  } finally { await f.cleanup(); }
});

test('G1-LR04/cursor-recovery', async () => {
  const f = await fixture();
  try {
    const view = await create(f, 'cursor-task', 'plan');
    const first = await f.client.events(view.task.taskId); assert.equal(first.kind, 'snapshot');
    const cursor = { ...view.cursor, sequence: 0 }; const delta = await f.client.events(view.task.taskId, cursor); assert.equal(delta.kind, 'delta');
    if (delta.kind !== 'delta') throw new Error('expected delta');
    assert.ok(delta.events.length > 0); assert.deepEqual(delta.events.map(event => event.sequence), Array.from({ length: delta.events.length }, (_, i) => i + 1));
    assert.deepEqual(await f.client.events(view.task.taskId, cursor), delta, 'duplicate reads do not mutate a stream');
    for (const invalid of [{ ...cursor, sequence: 99999 }, { ...cursor, generation: cursor.generation + 100 }, { ...cursor, streamId: 'other-stream' }]) {
      const recovered = await f.client.events(view.task.taskId, invalid); assert.equal(recovered.kind, 'snapshot');
      if (recovered.kind === 'snapshot') assert.equal(recovered.snapshot.task.taskId, view.task.taskId);
    }
    await f.client.command(view.task.taskId, { kind: 'stop', commandId: 'cursor-stop', scope: 'task', expectedRevision: 0 });
    assert.equal((await f.client.events(view.task.taskId, view.cursor)).kind, 'snapshot');
    const calls = f.model.invocationCount;
    f.store.transaction(state => { state.sessions.find(session => session.token === f.login.token)!.revoked = true; state.authorityRevision++; });
    await assert.rejects(() => f.client.events(view.task.taskId, cursor), hasCode('UNAUTHORIZED'));
    assert.equal(f.model.invocationCount, calls); assert.equal(f.effects.executionCount, 0);
  } finally { await f.cleanup(); }
});

test('G1-LR07/offline-no-resend', async () => {
  const f = await fixture();
  let upstreamPosts = 0, loseAcknowledgement = false;
  const proxy = createServer((incoming, outgoing) => {
    const target = new URL(incoming.url ?? '/', f.http.baseUrl);
    const headers = { ...incoming.headers, host: target.host };
    if (incoming.method === 'POST' && target.pathname.endsWith('/commands')) upstreamPosts++;
    const upstream = httpRequest({ hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: incoming.method, headers }, response => {
      if (loseAcknowledgement && incoming.method === 'POST' && target.pathname.endsWith('/commands')) {
        loseAcknowledgement = false; response.resume(); response.on('end', () => outgoing.destroy());
      } else { outgoing.writeHead(response.statusCode ?? 500, response.headers); response.pipe(outgoing); }
    }); upstream.on('error', error => outgoing.destroy(error)); incoming.pipe(upstream);
  });
  await new Promise<void>((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  try {
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    const client = new LocalClient(proxyUrl); await client.login(TEST_CREDENTIALS.operator);
    const made = await client.createTask({ spaceId: 'private-test', title: 'Offline Stop', input: 'Local synthetic plan', commandId: 'offline-task', intent: 'plan' }); assert.ok(made.task);
    client.unsentDraft = 'Preserve this unsent draft'; client.disconnect();
    await assert.rejects(() => client.command(made.taskId, { kind: 'stop', commandId: 'suppressed-stop', scope: 'task' }), hasCode('NOT_DELIVERED'));
    assert.equal(upstreamPosts, 0); assert.equal(f.service.getTask(f.token, made.taskId).task.stopped, false);
    assert.equal(client.lastDelivery?.commandId, 'suppressed-stop'); assert.equal(client.unsentDraft, 'Preserve this unsent draft');
    await client.reconnect(made.taskId); assert.equal(client.unsentDraft, 'Preserve this unsent draft'); assert.equal(upstreamPosts, 0); assert.equal(f.service.getTask(f.token, made.taskId).task.stopped, false);
    loseAcknowledgement = true;
    await assert.rejects(() => client.command(made.taskId, { kind: 'stop', commandId: 'lost-stop-ack', scope: 'task', expectedRevision: 0 }), hasCode('UNKNOWN_DELIVERY'));
    assert.equal(upstreamPosts, 1); assert.equal(f.service.getTask(f.token, made.taskId).task.stopped, true);
    assert.equal(client.lastDelivery?.commandId, 'lost-stop-ack'); assert.equal(client.lastDelivery?.taskId, made.taskId);
    const generation = f.service.getTask(f.token, made.taskId).task.generation;
    await client.reconnect(made.taskId); await client.getTask(made.taskId);
    const original = await client.queryCommand('lost-stop-ack', 'private-test'); assert.equal(original?.taskId, made.taskId); assert.equal(original?.stop?.generation, generation);
    assert.equal(client.unsentDraft, 'Preserve this unsent draft');
    assert.equal(upstreamPosts, 1); assert.equal(f.service.getTask(f.token, made.taskId).task.generation, generation);
    assert.equal(f.store.snapshot().commands.filter(c => c.commandId === 'suppressed-stop').length, 0);
    assert.equal(f.store.snapshot().commands.filter(c => c.commandId === 'lost-stop-ack').length, 1);
    assert.equal(f.effects.executionCount, 0);
  } finally { await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve())); await f.cleanup(); }
});

test('HTTP approval is independent and binds a committed synthetic result', async () => {
  const f = await fixture();
  try {
    const view = await create(f, 'http-approved-task', 'plan');
    const wait = await f.client.command(view.task.taskId, { kind: 'startRun', commandId: 'http-unapproved', planVersion: view.plan!.version });
    assert.equal(wait.acceptance, 'requires-review'); assert.equal(f.effects.executionCount, 0);
    await assert.rejects(() => f.client.command(view.task.taskId, { kind: 'approve', commandId: 'http-self-approve', planVersion: view.plan!.version }), hasCode('UNAUTHORIZED'));
    assert.equal((await f.client.me()).actorId, f.login.identity.actorId);
    const approver = new LocalClient(f.http.baseUrl); await approver.login(TEST_CREDENTIALS.approver);
    await approver.command(view.task.taskId, { kind: 'approve', commandId: 'http-separate-approve', planVersion: view.plan!.version });
    await approver.logout();
    const run = await f.client.command(view.task.taskId, { kind: 'startRun', commandId: 'http-approved-run', planVersion: view.plan!.version });
    assert.equal(run.completion, 'committed'); assert.equal(f.effects.executionCount, 1);
    const result = await f.client.result(view.task.taskId); assert.ok(result.committed);
    assert.equal(run.task!.checks[0]!.artifactDigest, result.digest); assert.equal(run.task!.checks[0]!.assurance, 'local-synthetic');
    const reader = new LocalClient(f.http.baseUrl); await reader.login(TEST_CREDENTIALS.operator);
    assert.deepEqual((await reader.getTask(view.task.taskId)).result, result);
  } finally { await f.cleanup(); }
});

test('original command query rechecks actor, Space and current authority', async () => {
  const f = await fixture();
  try {
    const view = await create(f, 'query-create');
    assert.equal((await f.client.queryCommand('query-create', 'private-test')).taskId, view.task.taskId);
    await assert.rejects(() => f.client.queryCommand('query-create', 'other-test'), hasCode('UNAUTHORIZED'));
    const approver = new LocalClient(f.http.baseUrl); await approver.login(TEST_CREDENTIALS.approver);
    await assert.rejects(() => approver.queryCommand('query-create', 'private-test'), hasCode('NOT_FOUND'));
    f.store.transaction(state => { state.spaces.find(s => s.scope.spaceId === 'private-test')!.memberships.find(m => m.actorId === f.login.identity.actorId)!.revoked = true; state.authorityRevision++; });
    await assert.rejects(() => f.client.queryCommand('query-create', 'private-test'), hasCode('UNAUTHORIZED'));
    assert.equal(f.model.invocationCount, 1); assert.equal(f.effects.executionCount, 0);
  } finally { await f.cleanup(); }
});

test('HTTP restart preserves committed task identities without executing ports', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'af-g1-http-restart-'));
  let runtime = createLocalRuntime({ directory });
  let http = await startLocalHttp({ service: runtime.service, port: 0 });
  try {
    const client = new LocalClient(http.baseUrl); await client.login(TEST_CREDENTIALS.operator);
    const response = await client.createTask({ spaceId: 'private-test', title: 'Restarted HTTP task', input: 'Durable local answer', intent: 'ask', commandId: 'http-restart-create' });
    assert.ok(response.task?.result); const original = response.task;
    const operations = runtime.store.snapshot().modelOperations, reservations = runtime.store.snapshot().reservations;
    await http.close(); runtime.close();
    runtime = createLocalRuntime({ directory }); http = await startLocalHttp({ service: runtime.service, port: 0 });
    const fresh = new LocalClient(http.baseUrl); await fresh.login(TEST_CREDENTIALS.operator);
    const restored = await fresh.getTask(response.taskId);
    assert.deepEqual(restored.task, original.task); assert.deepEqual(restored.result, original.result);
    assert.deepEqual(runtime.store.snapshot().modelOperations, operations); assert.deepEqual(runtime.store.snapshot().reservations, reservations);
    assert.equal(runtime.model.invocationCount, 0); assert.equal(runtime.effects.executionCount, 0);
  } finally { await http.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
