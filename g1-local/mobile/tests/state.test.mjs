// Component tests use the bundled actual mobile helpers/shared SDK with an
// explicitly injected transport. They do not attest emulator installation/UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mergeTaskView, applyTaskSync, deliveryMessage } from '../node_modules/.cache/test-state.mjs';
import { LocalClient, createClient } from '../node_modules/.cache/test-api.mjs';
const labels = { schemaVersion: 1, modelMode: 'deterministic-test', effectMode: 'synthetic-only', paidCallsAllowed: false, remoteAllowed: false };
function view(revision = 2, sequence = 3, generation = 0) {
  return { ...labels, task: { taskId: 'task-mobile', scope: { tenantId: 'tenant-mobile', spaceId: 'space-mobile' }, revision, generation }, authorityRevision: 3, cursor: { streamId: 'task-mobile', sequence, generation }, runs: [], plan: null, operations: [], approvals: [], checks: [], result: null, lastUpdate: 1 };
}
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const login = { ...labels, token: 'abcdefghijklmnop', identity: { actorId: 'actor-operator', identityMode: 'local-test' } };
const credentials = { username: 'operator', password: 'operator-local-test' };
function code(expected) { return error => error && typeof error === 'object' && error.code === expected; }

test('Mobile component preserves immutable Task and tenant/Space binding', () => {
  const current = view();
  assert.equal(mergeTaskView(null, current), current);
  for (const task of [{ ...current.task, taskId: 'other-task' }, { ...current.task, scope: { tenantId: 'other-tenant', spaceId: 'space-mobile' } }, { ...current.task, scope: { tenantId: 'tenant-mobile', spaceId: 'other-space' } }]) {
    assert.throws(() => mergeTaskView(current, { ...view(3, 4), task }), /mismatch/i);
  }
  assert.throws(() => mergeTaskView(current, { ...view(3, 4), cursor: { ...current.cursor, streamId: 'other-stream' } }), /mismatch/i);
  assert.equal(mergeTaskView(current, view(3, 4)).task.revision, 3);
});

test('Mobile component refuses authority, revision, cursor and generation rollback', () => {
  const current = { ...view(8, 12, 4), authorityRevision: 9 };
  for (const incoming of [
    { ...view(9, 13, 4), authorityRevision: 8 },
    { ...view(7, 13, 4), authorityRevision: 9 },
    { ...view(9, 11, 4), authorityRevision: 9 },
    { ...view(9, 13, 3), authorityRevision: 9 },
    { ...view(9, 13, 4), authorityRevision: 9, cursor: { streamId: 'task-mobile', sequence: 13, generation: 3 } },
  ]) assert.equal(mergeTaskView(current, incoming), current);
  const next = { ...view(9, 1, 5), authorityRevision: 10 }; assert.equal(mergeTaskView(current, next), next);
});

test('Mobile component handles ordered duplicate deltas and rejects gaps/mixed bindings', () => {
  const current = view(), next = view(3, 4); const event = { taskId: current.task.taskId, scope: current.task.scope, generation: 0, sequence: 4, task: next };
  const delta = { kind: 'delta', scope: current.task.scope, authorityRevision: 3, events: [event, event], cursor: next.cursor };
  assert.equal(applyTaskSync(current, delta).task.revision, 3);
  for (const bad of [{ ...event, sequence: 5 }, { ...event, taskId: 'other-task' }, { ...event, scope: { tenantId: 'other', spaceId: 'space-mobile' } }, { ...event, generation: 1 }, { ...event, task: view(3, 5) }]) {
    assert.throws(() => applyTaskSync(current, { ...delta, events: [bad] }), /gap|binding/i);
  }
  assert.throws(() => applyTaskSync(current, { ...delta, cursor: { ...next.cursor, streamId: 'other' } }), /scope/i);
  assert.throws(() => applyTaskSync(current, { ...delta, cursor: { ...next.cursor, sequence: 5 } }), /cursor/i);
  assert.equal(applyTaskSync(current, { ...delta, authorityRevision: 2 }), current);
});

test('Mobile component requires a fresh authorized snapshot for a new generation', () => {
  const current = view(), next = view(4, 1, 1);
  assert.throws(() => applyTaskSync(current, { kind: 'delta', scope: current.task.scope, authorityRevision: 3, events: [], cursor: next.cursor }), /snapshot/i);
  assert.equal(applyTaskSync(current, { kind: 'snapshot', snapshot: next }), next);
  assert.equal(applyTaskSync(next, { kind: 'snapshot', snapshot: current }), next);
});

test('Mobile shared SDK component suppresses offline Stop and preserves draft on readonly resume', async () => {
  const calls = [];
  const client = new LocalClient('http://127.0.0.1:8791', { fetch: async (url, init) => { calls.push({ url, method: init.method, body: init.body }); return response(url.endsWith('/login') ? login : view()); } });
  await client.login(credentials); calls.length = 0; client.unsentDraft = 'Unsent mobile correction'; client.disconnect();
  await assert.rejects(() => client.command('task-mobile', { kind: 'stop', scope: 'task', commandId: 'original-mobile-stop', expectedRevision: 0 }), code('NOT_DELIVERED'));
  assert.equal(calls.length, 0); assert.equal(client.lastDelivery.status, 'not-delivered'); assert.match(deliveryMessage(client.lastDelivery), /^Not delivered/);
  await client.reconnect('task-mobile'); await client.getTask('task-mobile');
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.method === 'GET' && call.body === undefined));
  assert.equal(client.unsentDraft, 'Unsent mobile correction'); assert.equal(client.lastDelivery.commandId, 'original-mobile-stop');
  assert.equal(client.lastDelivery.status, 'not-delivered');
});

test('Mobile shared SDK component retains unknown acknowledgement identity without replay', async () => {
  let posts = 0; const gets = [];
  const client = new LocalClient('http://127.0.0.1:8791', { fetch: async (url, init) => {
    if (url.endsWith('/login')) return response(login);
    if (init.method === 'POST') { posts++; throw new Error('injected transport acknowledgement loss'); }
    gets.push(url);
    if (url.includes('/commands/')) return response({ ...labels, commandId: 'unknown-mobile-stop', taskId: 'task-mobile', task: view(), acceptance: 'accepted', completion: 'committed' });
    return response(view());
  } });
  await client.login(credentials); client.unsentDraft = 'Keep draft';
  await assert.rejects(() => client.command('task-mobile', { kind: 'stop', scope: 'task', commandId: 'unknown-mobile-stop' }), code('UNKNOWN_DELIVERY'));
  assert.equal(posts, 1); assert.equal(client.lastDelivery.taskId, 'task-mobile'); assert.equal(client.lastDelivery.commandId, 'unknown-mobile-stop');
  assert.match(deliveryMessage(client.lastDelivery), /unknown/i);
  await client.reconnect('task-mobile'); const original = await client.queryCommand('unknown-mobile-stop', 'space-mobile');
  assert.equal(original.taskId, 'task-mobile'); assert.equal(posts, 1); assert.equal(gets.length, 2);
  assert.equal(client.unsentDraft, 'Keep draft'); assert.equal(client.lastDelivery.status, 'unknown');
  await assert.rejects(() => client.queryCommand('unknown-mobile-stop', 'other-space'), code('SCOPE_MISMATCH')); assert.equal(posts, 1);
});

test('Mobile shared SDK component honors current authority denial without resend or stale fallback', async () => {
  const calls = [];
  const client = new LocalClient('http://127.0.0.1:8791', { fetch: async (url, init) => {
    calls.push(init.method);
    return url.endsWith('/login') ? response(login) : response({ schemaVersion: 1, error: { code: 'UNAUTHORIZED', message: 'Current authority revoked.' } }, 403);
  } });
  await client.login(credentials); client.unsentDraft = 'Keep revoked draft'; client.disconnect();
  await assert.rejects(() => client.reconnect('task-mobile'), code('UNAUTHORIZED'));
  assert.deepEqual(calls, ['POST', 'GET']); assert.equal(client.unsentDraft, 'Keep revoked draft');
});

test('Mobile component and shared SDK keep the local profile and reject external transport', () => {
  assert.equal(createClient().baseUrl, 'http://127.0.0.1:8791');
  for (const url of ['https://provider.invalid', 'http://remote.example:8791', 'http://operator:secret@127.0.0.1:8791', 'file:///mobile']) assert.throws(() => new LocalClient(url), code('LOCAL_POLICY_VIOLATION'));
  for (const profile of [{ paidCallsAllowed: true }, { remoteAllowed: true }, { modelMode: 'paid' }, { effectMode: 'computer' }]) assert.throws(() => mergeTaskView(null, { ...view(), ...profile }), /unsupported/i);
});

// Execute the actual RN dependency in an isolated VM. Only XMLHttpRequest is a
// simulated transport; this is a polyfill regression, not a live backend/UI test.
function installedNativeFetch() {
  const require = createRequire(import.meta.url);
  const nativeRequire = createRequire(require.resolve('react-native/package.json'));
  assert.equal(nativeRequire('whatwg-fetch/package.json').version, '3.6.20');
  const filename = nativeRequire.resolve('whatwg-fetch');
  const exports = {}, calls = [], requests = [];
  class XMLHttpRequest {
    headers = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name.toLowerCase()] = value; }
    getAllResponseHeaders() { return 'Content-Type: application/json\r\nCache-Control: no-store\r\n'; }
    send(body) {
      const request = { method: this.method, url: this.url, headers: this.headers, body, withCredentials: this.withCredentials };
      requests.push(request);
      const url = new URL(this.url);
      this.status = url.searchParams.has('_') ? 400 : 200;
      this.statusText = this.status === 200 ? 'OK' : 'Bad Request';
      this.responseURL = this.url;
      let payload;
      if (this.status === 400) payload = { schemaVersion: 1, error: { code: 'INVALID_SCHEMA', message: 'Unexpected query parameter.' } };
      else if (url.pathname === '/v1/sessions/login') payload = login;
      else if (url.pathname === '/v1/spaces') payload = [{ spaceId: 'space-mobile', tenantId: 'tenant-mobile' }];
      else if (url.pathname === '/v1/tasks') payload = [view()];
      else if (url.pathname.endsWith('/events')) payload = { kind: 'snapshot', snapshot: view() };
      else if (url.pathname.includes('/commands/')) payload = { ...labels, commandId: 'original-mobile-stop', taskId: 'task-mobile', task: view(), acceptance: 'accepted', completion: 'committed' };
      else if (this.method === 'POST') payload = { ...labels, commandId: JSON.parse(body).commandId, taskId: 'task-mobile', task: view(), acceptance: 'accepted', completion: 'committed' };
      else payload = view();
      this.responseText = JSON.stringify(payload);
      queueMicrotask(() => this.onload());
    }
  }
  runInNewContext(readFileSync(filename, 'utf8'), { exports, module: { exports }, XMLHttpRequest, setTimeout, clearTimeout, console }, { filename, timeout: 1000 });
  assert.equal(exports.fetch.polyfill, true);
  return {
    calls, requests, Request: exports.Request,
    fetch(input, init) { calls.push({ input, init }); return exports.fetch(input, init); },
  };
}

async function withNativeFetch(fetcher, operation) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await operation(); } finally { globalThis.fetch = previous; }
}

test('Actual installed native polyfill exposes default shared SDK cache query failure', async () => {
  const native = installedNativeFetch();
  assert.match(new native.Request('http://127.0.0.1:8791/v1/spaces', { cache: 'no-store' }).url, /\/v1\/spaces\?_=[0-9]+$/);
  await withNativeFetch(native.fetch, async () => {
    const client = new LocalClient('http://127.0.0.1:8791');
    await client.login(credentials);
    await assert.rejects(() => client.spaces(), code('INVALID_SCHEMA'));
  });
  assert.equal(native.requests[0].url, 'http://127.0.0.1:8791/v1/sessions/login');
  assert.match(native.requests[1].url, /\/v1\/spaces\?_=[0-9]+$/);
  assert.equal(native.calls[1].init.cache, 'no-store');
});

test('Mobile adapter keeps actual native polyfill URLs, auth, command identity and readonly recovery intact', async () => {
  const native = installedNativeFetch();
  await withNativeFetch(native.fetch, async () => {
    const client = createClient();
    await client.login(credentials);
    assert.equal((await client.spaces())[0].spaceId, 'space-mobile');
    await client.listTasks('space-mobile');
    await client.events('task-mobile', { streamId: 'task-mobile', sequence: 3, generation: 0 });
    await client.command('task-mobile', { kind: 'stop', scope: 'task', commandId: 'original-mobile-stop', expectedRevision: 2 });
    await client.queryCommand('original-mobile-stop', 'space-mobile');
    client.unsentDraft = 'Unsent native correction';
    client.disconnect();
    const sent = native.requests.length;
    await assert.rejects(() => client.command('task-mobile', { kind: 'stop', scope: 'task', commandId: 'unsent-mobile-stop' }), code('NOT_DELIVERED'));
    assert.equal(native.requests.length, sent);
    await client.reconnect('task-mobile');
    assert.equal(client.unsentDraft, 'Unsent native correction');
    assert.equal(client.lastDelivery.commandId, 'unsent-mobile-stop');
    assert.equal(client.lastDelivery.status, 'not-delivered');
  });
  assert.deepEqual(native.requests.map(request => request.url), [
    'http://127.0.0.1:8791/v1/sessions/login',
    'http://127.0.0.1:8791/v1/spaces',
    'http://127.0.0.1:8791/v1/tasks?spaceId=space-mobile',
    'http://127.0.0.1:8791/v1/tasks/task-mobile/events?streamId=task-mobile&sequence=3&generation=0',
    'http://127.0.0.1:8791/v1/tasks/task-mobile/commands',
    'http://127.0.0.1:8791/v1/commands/original-mobile-stop?spaceId=space-mobile',
    'http://127.0.0.1:8791/v1/tasks/task-mobile',
  ]);
  for (const { init } of native.calls) {
    assert.equal(Object.hasOwn(init, 'cache'), false);
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Accept, 'application/json');
  }
  assert.equal(native.requests[0].body, JSON.stringify(credentials));
  for (const request of native.requests.slice(1)) {
    assert.equal(request.headers.authorization, 'Bearer ' + login.token);
    assert.equal(request.withCredentials, false);
  }
  const command = native.requests[4];
  assert.equal(command.method, 'POST');
  assert.equal(command.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(command.body).commandId, 'original-mobile-stop');
  assert.equal(JSON.parse(command.body).expectedRevision, 2);
  assert.equal(native.requests.at(-1).method, 'GET');
  assert.equal(native.requests.at(-1).body, null);
});
