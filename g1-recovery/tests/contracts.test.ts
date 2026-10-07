import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as c from '../src/contracts.js';
import {createDeterministicSessionAdapter, sessionEventSchema} from '../src/test-session.js';
import {timestamp} from '../src/schema.js';
import {artifact, check, delivery, effect, generation, id, runBinding, session, sha, task, taskBinding, wait} from './fixtures.js';
const rejects = (work: () => unknown, code = 'INVALID_INPUT') => assert.throws(work, (error: unknown) => error instanceof c.RecoveryError && error.code === code);

test('CONTRACTS/ every record validates, copies and freezes nested immutable data', () => {
  for (const [schema, record] of [[c.taskSchema, task()], [c.sessionSchema, session()], [c.effectSchema, effect()], [c.artifactSchema, artifact()], [c.checkSchema, check()], [c.deliverySchema, delivery()]] as const) {
    const parsed = schema.parse(record); assert.deepEqual(parsed, record); assert.notEqual(parsed, record); assert.ok(Object.isFrozen(parsed));
    rejects(() => schema.parse({...record, privileged: true}));
    for (const key of Object.keys(record)) {const missing = {...record} as Record<string, unknown>; delete missing[key]; rejects(() => schema.parse(missing));}
  }
  const mutable = structuredClone(effect()); const pinned = c.effectSchema.parse(mutable);
  Object.assign(mutable.binding.run.task, {spaceId: id(100)}); Object.assign(mutable.binding, {target: 'synthetic://other'});
  assert.equal(pinned.binding.run.task.spaceId, taskBinding.spaceId);
  assert.equal(pinned.binding.target, 'synthetic://target/document');
  assert.throws(() => Object.assign(pinned.binding.generation, {worker: 3}), TypeError);
});
test('CONTRACTS/ reject invalid identity, numeric, time, digest, prototype and accessor inputs', () => {
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0']) rejects(() => c.generationSchema.parse({...generation, cancellation: value}));
  rejects(() => c.generationSchema.parse({...generation, worker: 0}));
  for (const value of ['x', '', null, id(1) + '/../../']) rejects(() => c.taskBindingSchema.parse({...taskBinding, tenantId: value}));
  for (const value of ['2026-02-30T00:00:00.000Z', '2026-10-06', '2026-10-06T00:00:00+00:00']) rejects(() => timestamp.parse(value));
  rejects(() => c.artifactSchema.parse({...artifact(), digest: 'sha256:xx'}));
  rejects(() => c.taskBindingSchema.parse(Object.create(taskBinding)));
  rejects(() => c.taskBindingSchema.parse({...taskBinding, [Symbol('grant')]: true}));
  rejects(() => c.taskBindingSchema.parse({...taskBinding, get spaceId() {throw new Error('Getter must not execute');}}));
});
test('CONTRACTS/ bind every scope/version/target/effect precondition and canonicalize key order', () => {
  const original = effect().binding;
  assert.equal(c.bindingDigest(original), c.bindingDigest(Object.fromEntries(Object.entries(original).reverse())));
  for (const key of Object.keys(original)) {
    const value = original[key as keyof typeof original];
    const changed = {...original, [key]: typeof value === 'number' ? value + 1 : typeof value === 'object' ? {...value, changed: true} : String(value) + '-changed'};
    rejects(() => c.assertBinding(original, changed), 'BINDING_CONFLICT');
  }
  for (const key of Object.keys(runBinding)) rejects(() => c.assertBinding(runBinding, {...runBinding, [key]: null}), 'BINDING_CONFLICT');
  for (const key of Object.keys(taskBinding)) rejects(() => c.assertBinding(taskBinding, {...taskBinding, [key]: id(200)}), 'BINDING_CONFLICT');
  rejects(() => c.validEffectBindingSchema.parse({...original, artifactVersion: null}));
  rejects(() => c.bindingDigest({a: undefined}));
});
test('CONTRACTS/ terminal Run is immutable; retry is a new attempt, never a terminal transition', () => {
  c.assertRunTransition('queued', 'preparing'); c.assertRunTransition('running', 'waiting'); c.assertRunTransition('verifying', 'succeeded');
  for (const terminal of ['succeeded', 'partial', 'failed', 'cancelled'] as const)
    for (const state of c.runStates) rejects(() => c.assertRunTransition(terminal, state), 'ILLEGAL_TRANSITION');
  rejects(() => c.assertRunTransition('queued', 'succeeded'), 'ILLEGAL_TRANSITION');
  const base = {binding: runBinding, revision: 0, generation, state: 'running', wait: null, outcomeDigest: null};
  c.runSchema.parse(base);
  rejects(() => c.runSchema.parse({...base, state: 'succeeded'}));
  rejects(() => c.runSchema.parse({...base, outcomeDigest: sha(10)}));
  c.runSchema.parse({...base, state: 'succeeded', outcomeDigest: sha(10)});
});
test('CONTRACTS/ waits carry bounded expiry, resolver and reason-specific safe action', () => {
  c.validWaitSchema.parse(wait);
  for (const change of [{expiresAt: wait.since}, {ownerId: ''}, {nextAction: 'add-budget'}, {reason: 'automatic-approval'}])
    rejects(() => c.validWaitSchema.parse({...wait, ...change}));
  const base = {binding: runBinding, revision: 0, generation, state: 'waiting', wait, outcomeDigest: null};
  c.runSchema.parse(base); rejects(() => c.runSchema.parse({...base, wait: null}));
  rejects(() => c.runSchema.parse({...base, state: 'running'}));
});
test('CONTRACTS/ lost effect ACK is unknown; only reconciliation can establish confirmed or not-applied', () => {
  const base = effect();
  const unknown = c.effectSchema.parse({...base, state: 'unknown', nextAction: 'lookup-original-operation'});
  c.assertEffectTransition('dispatched', 'unknown'); c.assertEffectTransition('unknown', 'reconciling');
  c.assertEffectTransition('reconciling', 'confirmed'); c.assertEffectTransition('reconciling', 'not-applied');
  for (const destination of ['prepared', 'dispatched', 'failed', 'confirmed', 'cancelled'] as const)
    rejects(() => c.assertEffectTransition('unknown', destination), 'ILLEGAL_TRANSITION');
  rejects(() => c.assertEffectTransition('not-applied', 'dispatched'), 'ILLEGAL_TRANSITION');
  rejects(() => c.effectSchema.parse({...unknown, nextAction: null}));
  rejects(() => c.effectSchema.parse({...unknown, receiptDigest: sha(12)}));
  rejects(() => c.effectSchema.parse({...unknown, binding: {...base.binding, downstream: 'human-reconciliation'}}));
  c.effectSchema.parse({...unknown, binding: {...base.binding, downstream: 'human-reconciliation'}, nextAction: 'human-reconcile'});
  rejects(() => c.effectSchema.parse({...base, state: 'confirmed'}));
});
test('CONTRACTS/ Stop omits progress revision and validates immutable task/run scope', () => {
  const base = {task: taskBinding, runId: null, commandId: id(20), idempotencyKey: id(21), actorId: id(5), payloadDigest: sha(12), expiresAt: wait.expiresAt, kind: 'stop-task'};
  c.parseCommand(base); c.parseCommand({...base, kind: 'stop-run', runId: id(4)});
  rejects(() => c.parseCommand({...base, expectedRevision: 0}));
  rejects(() => c.parseCommand({...base, kind: 'stop-run'}));
  rejects(() => c.parseCommand({...base, runId: id(4)}));
  rejects(() => c.parseCommand({...base, kind: 'publish'}));
  c.parseCommand({...base, kind: 'publish', expectedRevision: 0});
});
test('CONTRACTS/ each generation axis fences stale workers and cannot overflow', () => {
  for (const kind of ['worker', 'cancellation', 'resource'] as const) {
    const current = c.advanceGeneration(generation, kind); c.assertGeneration(current, {...current});
    rejects(() => c.assertGeneration(current, generation), 'STALE_GENERATION');
    rejects(() => c.assertGeneration(generation, current), 'STALE_GENERATION');
    rejects(() => c.advanceGeneration({...generation, [kind]: Number.MAX_SAFE_INTEGER}, kind));
  }
});
test('CONTRACTS/ Stop response distinguishes fencing, termination and in-flight uncertainty', () => {
  const receipt = c.commandReceiptSchema.parse({commandId: id(20), task: taskBinding, runId: id(4), status: 'accepted', revision: 9,
    generation: {...generation, cancellation: 1}, timestamp: wait.since, nextAction: 'Reconcile original operation',
    effectState: 'unknown', dispatch: 'fenced', termination: 'pending'});
  assert.equal(receipt.status, 'accepted'); assert.equal(receipt.termination, 'pending'); assert.equal(receipt.effectState, 'unknown');
  rejects(() => c.commandReceiptSchema.parse({...receipt, termination: 'fenced'}));
});
test('CONTRACTS/ draft, checks, acceptance and publication remain distinct', () => {
  const a = artifact(), checks = [check()];
  assert.equal(c.resultReadiness({...a, verification: 'unchecked'}, checks, [sha(7)]), 'draft');
  assert.equal(c.resultReadiness(a, [], [sha(7)]), 'draft'); assert.equal(c.resultReadiness(a, checks, []), 'draft');
  assert.equal(c.resultReadiness(a, checks, [sha(7)]), 'checked');
  assert.equal(c.resultReadiness({...a, stage: 'accepted', acceptedVersion: 1}, checks, [sha(7)]), 'accepted');
  rejects(() => c.artifactSchema.parse({...a, stage: 'accepted', acceptedVersion: 2}));
  rejects(() => c.artifactSchema.parse({...a, baseVersion: 1}));
  assert.equal(c.obligationSatisfied(task(), a, checks, [sha(7)], null), true);
  const publishTask = {...task(), obligation: 'publish' as const};
  for (const state of ['requested', 'awaiting-approval', 'in-progress', 'failed', 'unknown'] as const)
    assert.equal(c.obligationSatisfied(publishTask, a, checks, [sha(7)], {...delivery(), state}), false);
  assert.equal(c.obligationSatisfied(publishTask, a, checks, [sha(7)], {...delivery(), state: 'confirmed', receiptDigest: sha(20)}), true);
  rejects(() => c.deliverySchema.parse({...delivery(), state: 'confirmed'}));
  rejects(() => c.deliverySchema.parse({...delivery(), state: 'in-progress', approvalId: null}));
});
test('CONTRACTS/ stale or cross-Space checks/delivery cannot satisfy the current artifact', () => {
  const a = artifact(), ch = check();
  for (const change of [{artifactVersion: 2}, {artifactDigest: sha(99)}, {artifactId: id(99)}, {task: {...taskBinding, spaceId: id(99)}}, {status: 'failed' as const}, {status: 'unavailable' as const}])
    assert.equal(c.resultReadiness(a, [{...ch, ...change}], [sha(7)]), 'draft');
  assert.equal(c.resultReadiness(a, [ch, ch], [sha(7)]), 'draft');
  const published = {...delivery(), state: 'confirmed' as const, receiptDigest: sha(20)};
  assert.equal(c.obligationSatisfied({...task(), obligation: 'publish'}, a, [ch], [sha(7)], {...published, artifactVersion: 2}), false);
  rejects(() => c.obligationSatisfied(task(), {...a, task: {...taskBinding, spaceId: id(99)}}, [ch], [sha(7)], null), 'BINDING_CONFLICT');
});
test('CONTRACTS/ notification is a minimal fetch hint; failures do not change result readiness', () => {
  const result = c.bindingDigest(artifact());
  for (const state of ['pending', 'sent', 'failed', 'unknown'] as const) {
    c.notificationSchema.parse({task: taskBinding, notificationId: id(30), resultDigest: result, recipientId: id(5), state, attempts: 1, deepLink: '/tasks/' + id(3)});
    assert.equal(c.obligationSatisfied(task(), artifact(), [check()], [sha(7)], null), true);
  }
  rejects(() => c.notificationSchema.parse({task: taskBinding, notificationId: id(30), resultDigest: result, recipientId: id(5), state: 'failed', attempts: 1, deepLink: 'https://evil.test?token=secret'}));
});
test('CONTRACTS/ native test session advances deterministic proposals; replay performs zero calls', () => {
  const s = session();
  const proposal = sessionEventSchema.parse({binding: runBinding, sessionId: s.sessionId, sequence: 1, kind: 'proposal',
    proposal: {operationId: id(9), target: effect().binding.target, resourceId: id(10), action: 'write', argsDigest: sha(4), effectClass: 'external-write'}, wait: null, answerDigest: null});
  const answer = sessionEventSchema.parse({...proposal, sequence: 2, kind: 'answer', proposal: null, answerDigest: sha(30)});
  const adapter = createDeterministicSessionAdapter(s, [proposal, answer]);
  const first = adapter.next(s, []); assert.deepEqual(first, proposal);
  const recreated = createDeterministicSessionAdapter(s, [proposal, answer]);
  const checkpoint = {...s, cursor: 1};
  assert.equal(recreated.replay(checkpoint, [first]).cursor, 1);
  assert.deepEqual(recreated.measurements, {syntheticTurns: 0, providerCalls: 0, writeCalls: 0});
  assert.deepEqual(recreated.next(checkpoint, [first]), answer);
  rejects(() => recreated.next({...s, cursor: 2}, [first, answer]), 'ILLEGAL_TRANSITION');
  assert.equal(adapter.measurements.syntheticTurns, 1);
  assert.equal(adapter.measurements.writeCalls, 0);
});
test('CONTRACTS/ session rejects foreign/stale/malformed histories and grants in proposals', () => {
  const s = session(), answer = sessionEventSchema.parse({binding: runBinding, sessionId: s.sessionId, sequence: 1, kind: 'answer', proposal: null, wait: null, answerDigest: sha(30)});
  const adapter = createDeterministicSessionAdapter(s, [answer]);
  rejects(() => adapter.next({...s, sessionId: id(99)}, []), 'BINDING_CONFLICT');
  rejects(() => adapter.next({...s, generation: {...generation, worker: 2}}, []), 'STALE_GENERATION');
  rejects(() => adapter.next({...s, state: 'waiting'}, []), 'ILLEGAL_TRANSITION');
  rejects(() => adapter.replay({...s, cursor: 1}, [{...answer, binding: {...runBinding, requirementsRevision: 2}}]), 'BINDING_CONFLICT');
  rejects(() => adapter.replay({...s, cursor: 1}, [{...answer, sequence: 2}]));
  rejects(() => sessionEventSchema.parse({...answer, approvalId: id(12)}));
  rejects(() => createDeterministicSessionAdapter(s, []));
});
test('CONTRACTS/ complete gate rejects filtering; slice rejects unknown or empty suites', () => {
  const root = resolve(process.cwd()); // runner sets cwd to g1-recovery
  for (const [script, args, message] of [
    ['check.mjs', ['contracts'], 'unfiltered'],
    ['check-slice.mjs', [], 'Explicit known'],
    ['check-slice.mjs', ['invented'], 'Explicit known']
  ] as const) {
    const output = spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {encoding: 'utf8', timeout: 60000});
    assert.equal(output.status, 1); assert.match(output.stderr, new RegExp(message));
  }
});
test('CONTRACTS/ baseline guard rejects modified/missing dependency and TAP guard rejects empty/skip/TODO', async () => {
  const root = resolve(process.cwd());
  // The scripts are source artifacts outside the TypeScript build tree.
  const {verifyFiles} = await import(join(root, 'scripts/baseline.mjs'));
  const {assertTap, assertMandatory} = await import(join(root, 'scripts/run-suites.mjs'));
  const temp = mkdtempSync(join(tmpdir(), 'af-f03-contracts-'));
  try {
    assert.throws(() => assertMandatory(temp, ['contracts', 'durable-authority']), /Mandatory suite missing: contracts/);
    writeFileSync(join(temp, 'contracts.test.js'), '');
    assert.throws(() => assertMandatory(temp, ['contracts', 'durable-authority']), /Mandatory suite missing: durable-authority/);
    assert.throws(() => assertMandatory(temp, ['invented']), /Mandatory suite missing/);
    writeFileSync(join(temp, 'dependency'), 'original');
    const files = {dependency: createHash('sha256').update(readFileSync(join(temp, 'dependency'))).digest('hex')};
    verifyFiles(temp, files); writeFileSync(join(temp, 'dependency'), 'mutated');
    assert.throws(() => verifyFiles(temp, files), /changed/);
    rmSync(join(temp, 'dependency')); assert.throws(() => verifyFiles(temp, files), /ENOENT/);
  } finally {rmSync(temp, {recursive: true, force: true});}
  const tap = 'ok 1 - actual\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assertTap(tap);
  for (const output of ['', tap.replace('# tests 1', '# tests 0'), tap.replace('# pass 1', '# pass 0'), tap.replace('# pass 1\n', ''), tap + tap, tap.replace('# skipped 0', '# skipped 1'), tap.replace('# todo 0', '# todo 1'), tap.replace('# cancelled 0', '# cancelled 1'), tap.replace('ok 1', 'not ok 1'), tap.replace('actual', 'actual # SKIP')])
    assert.throws(() => assertTap(output));
});
