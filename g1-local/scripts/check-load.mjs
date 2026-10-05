import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { candidateScopeDigest } from './check.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const definition = JSON.parse(readFileSync(resolve(root, 'g1-local/evals/definition.json'), 'utf8'));
const output = resolve(root, definition.evidencePaths.load);
const args = process.argv.slice(2);
if (args.length) {
  assert.equal(args.length, 3, 'Use --record --task-id <authorized local Task>');
  assert.equal(args[0], '--record'); assert.equal(args[1], '--task-id');
  assert.match(args[2], /^[A-Za-z0-9._:-]{1,256}$/);
  const baseUrl = 'http://127.0.0.1:8791';
  const taskId = args[2], startedAt = new Date().toISOString();
  const candidateDigest = candidateScopeDigest();
  const login = await fetch(baseUrl + '/v1/sessions/login', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'operator', password: 'operator-local-test' }), signal: AbortSignal.timeout(10000) });
  assert.equal(login.status, 200); const session = await login.json();
  assert.equal(session.identity.identityMode, 'local-test'); assert.equal(session.paidCallsAllowed, false); assert.equal(session.remoteAllowed, false);
  let errors = 0;
  async function sample(index) {
    const start = performance.now(); let status = 0, error = null;
    try {
      const response = await fetch(baseUrl + '/v1/tasks/' + encodeURIComponent(taskId), { redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer ' + session.token }, signal: AbortSignal.timeout(10000) });
      status = response.status; assert.equal(status, 200); const view = await response.json();
      assert.equal(view.task.taskId, taskId); assert.equal(view.modelMode, 'deterministic-test'); assert.equal(view.effectMode, 'synthetic-only'); assert.equal(view.paidCallsAllowed, false); assert.equal(view.remoteAllowed, false);
    } catch (failure) { errors++; error = failure instanceof Error ? failure.message : 'request failed'; }
    return { index, durationMs: performance.now() - start, status, error, cancelled: false };
  }
  const warmup = []; for (let i = 0; i < definition.performance.warmupSamples; i++) warmup.push(await sample(i));
  const samples = Array(definition.performance.measuredSamples); let next = 0;
  await Promise.all(Array.from({ length: definition.performance.concurrency }, async () => { while (next < samples.length) { const index = next++; samples[index] = await sample(index); } }));
  const sorted = samples.map(s => s.durationMs).sort((a,b) => a-b);
  const record = { schemaVersion: 1, candidateDigest, transport: 'http-loopback', baseUrl, workload: 'authorized-task-read', timingSource: 'performance.now', concurrency: definition.performance.concurrency, startedAt, finishedAt: new Date().toISOString(), taskId, identityMode: 'local-test', environment: { node: process.version, arch: process.arch, platform: process.platform }, warmup, samples, p95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1], errors, assurance: 'observed-local-workload', productionSLAQualified: false };
  assert.equal(candidateScopeDigest(), candidateDigest, 'Source changed during measurement');
  writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  // Release the test login without outputting or persisting its token.
  const logout = await fetch(baseUrl + '/v1/sessions/current', { method: 'DELETE', headers: { Authorization: 'Bearer ' + session.token }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(logout.status, 204);
}
const record = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(record.schemaVersion, 1); assert.equal(record.candidateDigest, candidateScopeDigest());
assert.equal(record.transport, 'http-loopback'); assert.equal(record.workload, 'authorized-task-read'); assert.equal(record.timingSource, 'performance.now');
const url = new URL(record.baseUrl); assert.equal(url.protocol, 'http:'); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.equal(record.concurrency, definition.performance.concurrency); assert.ok(Number.isFinite(Date.parse(record.startedAt)) && Date.parse(record.finishedAt) >= Date.parse(record.startedAt));
for (const [name, count] of [['warmup', definition.performance.warmupSamples], ['samples', definition.performance.measuredSamples]]) {
  assert.equal(record[name].length, count);
  record[name].forEach((s,i) => { assert.equal(s.index, i); assert.ok(Number.isFinite(s.durationMs) && s.durationMs > 0); assert.equal(s.status, 200); assert.equal(s.error, null); assert.equal(s.cancelled, false); });
}
const sorted = record.samples.map(s => s.durationMs).sort((a,b) => a-b), p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
assert.equal(record.errors, 0); assert.ok(Math.abs(record.p95Ms - p95) < 0.000001); assert.ok(p95 <= definition.performance.p95MaxMs);
console.log(JSON.stringify({ check: 'actual-local-http-load', taskId: record.taskId, candidateDigest: record.candidateDigest, samples: record.samples.length, p95Ms: p95, errors: 0, productionSLAQualified: false }));
