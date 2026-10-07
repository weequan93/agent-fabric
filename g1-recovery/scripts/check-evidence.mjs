// Validate copied evidence against read-only controller records and complete raw bytes.
import assert from 'node:assert/strict';
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, relative, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertBaseline, root} from './baseline.mjs';
import {suites} from './suites.mjs';

const controllerPath = '.loop/goals/agent-fabric-g1-f03-recovery';
const metricKeys = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const requiredChecks = ['f03-all-behavior', 'f03-identity-retained', 'f03-foundation-retained', 'f03-original-retained'];
export function readController() {
  return {state: json(controllerPath + '/state.json'), events: readFileSync(resolve(root, controllerPath, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)};
}
export function tapMetrics(text) {
  return Object.fromEntries(metricKeys.map(key => {
    const values = [...text.matchAll(new RegExp('^# ' + key + ' (\\d+)$', 'gm'))];
    return [key, values.length ? values.reduce((sum, row) => sum + Number(row[1]), 0) : null];
  }));
}
export function measureStreams(jobId, checkId) {
  assert.match(jobId, /^job-[a-f0-9]+$/);
  assert.match(checkId, /^[a-z0-9.-]+$/);
  return ['stdout', 'stderr'].map(name => {
    const path = controllerPath + '/runs/checks/' + jobId + '/' + checkId + '/' + name + '.log';
    const bytes = readFileSync(resolve(root, path));
    return {path, bytes: bytes.length, sha256: sha(bytes), text: bytes.toString('utf8')};
  });
}
function verifyBytes(record, path) {
  assert.equal(typeof path, 'string');
  assert.equal(relative(root, resolve(root, path)), path, 'Evidence path must be canonical and repository relative');
  assert.ok(!relative(realpathSync(root), realpathSync(resolve(root, path))).startsWith('..'), 'Evidence escapes repository');
  const bytes = readFileSync(resolve(root, path));
  assert.equal(record.bytes, bytes.length, 'Evidence byte count differs: ' + path);
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.sha256, sha(bytes), 'Evidence digest differs: ' + path);
  if (Object.hasOwn(record, 'text')) assert.equal(record.text, bytes.toString('utf8'), 'Truncated or altered complete stream: ' + path);
  return bytes.toString('utf8');
}
function completion(jobId, controller) {
  const event = controller.events.findLast(row => row.type === 'job.finished' && row.data.job === jobId);
  assert.ok(event, 'Controller completion event missing: ' + jobId);
  const start = controller.events.find(row => row.type === 'job.started' && row.data.job === jobId);
  assert.ok(start && start.seq < event.seq, 'Controller start event missing: ' + jobId);
  // The controller bounds its current jobs map; its original append-only events
  // still prove older jobs' check lists, results and start/finish timestamps.
  const job = controller.state.jobs[jobId] ?? {id: jobId, status: 'finished', checks: start.data.checks, results: event.data.results, started_at: start.at, finished_at: event.at};
  assert.equal(job.status, 'finished', 'Actual finished controller job required: ' + jobId);
  assert.deepEqual(job.checks, start.data.checks);
  assert.deepEqual(event.data.results, job.results);
  return {job, event, retainedCurrentJob: Object.hasOwn(controller.state.jobs, jobId)};
}
function passingTap(text) {
  const metrics = tapMetrics(text);
  assert.ok(metrics.tests > 0 && metrics.tests === metrics.pass, 'Nonempty complete passing TAP required');
  for (const key of metricKeys.slice(2)) assert.equal(metrics[key], 0, 'Nonzero TAP ' + key);
  assert.ok(!/^\s*not ok \d+\b/m.test(text) && !/^\s*(?:ok|not ok) .*# (?:SKIP|TODO)/mi.test(text), 'Failed/skipped/TODO subtest');
  return metrics;
}
function validateCheck(jobId, check, controller) {
  const {job, event} = completion(jobId, controller);
  assert.ok(job.checks.includes(check.checkId), 'Check absent from actual job');
  assert.equal(check.status, event.data.results[check.checkId]);
  assert.equal(check.streams.length, 2, 'Exactly complete stdout and stderr required');
  const path = controllerPath + '/runs/checks/' + jobId + '/' + check.checkId;
  const texts = {};
  for (const name of ['stdout', 'stderr']) {
    const stream = check.streams.find(row => row.path === path + '/' + name + '.log');
    assert.ok(stream, 'Missing original stream path: ' + path + '/' + name);
    texts[name] = verifyBytes(stream, stream.path);
  }
  if (check.metrics) assert.deepEqual(check.metrics, tapMetrics(texts.stdout), 'Invented TAP metrics');
  const result = check.result;
  if (result) {
    assert.equal(result.log, path);
    assert.equal(result.status, check.status);
    assert.match(result.fingerprint, /^git:[a-f0-9]{16,64}$/);
    const started = controller.events.find(row => row.type === 'job.started' && row.data.job === jobId);
    assert.ok(started, 'Actual job start required');
    const actual = controller.events.find(row => row.type === 'check.result' && row.seq > started.seq && row.seq < event.seq && row.data.check === check.checkId);
    assert.ok(actual, 'Actual check result event required');
    assert.equal(result.status, actual.data.status);
    assert.equal(result.exit_code, actual.data.exit);
    const completionDelay = Date.parse(actual.at) - Date.parse(result.finished_at);
    assert.ok(Number.isFinite(completionDelay) && completionDelay >= 0 && completionDelay <= 5000, 'Result timestamp must precede its immediate controller event');
    const current = controller.state.checks[check.checkId];
    if (current?.log === path) {
      const {tail: _tailA, ...a} = current, {tail: _tailB, ...b} = result;
      assert.deepEqual(b, a, 'Copied metadata differs from actual controller result');
    }
    if (check.status === 'pass') {
      assert.equal(result.exit_code, 0);
      assert.equal(result.outcome, 'completed');
      if (tapMetrics(texts.stdout).tests !== null) passingTap(texts.stdout);
    }
  }
  return {...check, stdout: texts.stdout};
}
export function validateIndex(name, controller = readController()) {
  const index = json('g1-recovery/evidence/' + name + '-controller.json');
  assert.equal(index.schemaVersion, 1);
  assert.ok(typeof index.scope === 'string' && index.scope.length > 20, 'Explicit evidence scope required');
  const validated = [];
  if (!index.runs) {
    const {job} = completion(index.jobId, controller);
    for (const [checkId, result] of Object.entries(index.controllerResults)) {
      assert.ok(job.checks.includes(checkId));
      assert.equal(result.fingerprint, index.candidateFingerprint);
      const check = validateCheck(index.jobId, {checkId, status: result.status, result, streams: index.streams.filter(row => dirname(row.path) === result.log)}, controller);
      const summary = index.checks[checkId.split('.').at(-1)];
      assert.equal(summary.status, check.status);
      assert.equal(summary.exitCode, result.exit_code);
      const metrics = tapMetrics(check.stdout);
      for (const key of metricKeys) if (Object.hasOwn(summary, key)) assert.equal(summary[key], metrics[key]);
      validated.push({jobId: index.jobId, checks: [check]});
    }
    assert.ok(validated.length > 0);
  } else {
    assert.ok(index.runs.length > 0, 'Nonempty controller index required');
    const ids = new Set();
    for (const run of index.runs) {
      assert.ok(!ids.has(run.jobId), 'Duplicate indexed job'); ids.add(run.jobId);
      const {job, event, retainedCurrentJob} = completion(run.jobId, controller);
      if (retainedCurrentJob) assert.deepEqual(run.job, job, 'Copied controller job differs');
      else for (const key of ['id', 'status', 'checks', 'results', 'started_at', 'finished_at']) assert.deepEqual(run.job[key], job[key], 'Copied historical job differs from retained controller events: ' + key);
      if (run.completionEvent) assert.deepEqual(run.completionEvent, event, 'Copied completion event differs');
      assert.equal(run.postCheckIndexUpdate, true, 'Post-check index update must be disclosed');
      const checks = run.checks ?? [{checkId: dirname(run.streams[0].path).split('/').at(-1), status: job.results[dirname(run.streams[0].path).split('/').at(-1)], result: run.result, streams: run.streams}];
      assert.ok(checks.length > 0 && new Set(checks.map(row => row.checkId)).size === checks.length);
      const rows = checks.map(check => validateCheck(run.jobId, check, controller));
      for (const artifact of run.artifacts ?? []) {
        assert.ok(artifact.copyPath.startsWith('g1-recovery/evidence/'), 'Raw artifact must have retained copy');
        verifyBytes(artifact, artifact.copyPath);
      }
      validated.push({...run, checks: rows});
    }
  }
  assert.ok(validated.some(run => run.checks.some(check => check.status === 'pass' && check.result && !check.result.workspace_changed)), 'Index has no unchanged passing controller candidate: ' + name);
  return validated;
}
function validateDocs() {
  const plan = readFileSync(resolve(root, 'docs/planning/g1-f03-plan.md'), 'utf8');
  const evidence = readFileSync(resolve(root, 'docs/evidence/g1-f03-acceptance.md'), 'utf8');
  for (const id of ['AF-01', 'AF-05', 'AF-09', 'AF-14', 'AF-17', 'AF-19', 'UX-08', 'UX-18']) {
    assert.ok(plan.includes(id) && evidence.includes(id), 'Missing requirement coverage: ' + id);
  }
  const coverage = {'AF-01': 'temporal-worker', 'AF-05': 'qualification', 'AF-09': 'dispatch-schedules', 'AF-14': 'unknown-effects', 'AF-17': 'results-notifications', 'AF-19': 'stop-fences', 'UX-08': 'stop-fences', 'UX-18': 'notifications'};
  for (const [id, suite] of Object.entries(coverage)) assert.ok(evidence.split('\n').some(line => line.includes(id) && line.includes(suite + '.test.ts')), 'Missing per-requirement executable coverage row: ' + id);
  for (const [name, file] of Object.entries(suites)) {
    assert.ok(plan.includes(name) || plan.includes(file.replace(/\.js$/, '.ts')), 'Plan lacks required suite: ' + name);
    assert.ok(evidence.includes(file.replace(/\.js$/, '.ts')), 'Acceptance lacks executable suite mapping: ' + name);
    readFileSync(resolve(root, 'g1-recovery/tests', file.replace(/\.js$/, '.ts')));
  }
  const external = evidence.split(/^## Unqualified external environments\s*$/m)[1]?.split(/^## /m)[0];
  assert.ok(external, 'Explicit unqualified external section required');
  for (const expression of [/remote Linux/i, /containment/i, /\bHA\b|high.availability|fleet failover/i, /backup/i, /supplier|provider/i, /billing/i, /SSO/i, /human approval/i, /GUI/i, /all.path/i, /physical/i, /push|APNs|FCM/i, /enterprise/i, /connector/i, /lifecycle|JML/i, /pilot/i, /timing/i])
    assert.match(external, expression, 'Missing explicit external qualification limit: ' + expression);
  assert.match(evidence, /independent reviews?[^.]*pending|reviews?[^.]*controller|controller[^.]*reviews?/i);
  assert.match(evidence, /paid[^.]*OFF|OFF[^.]*paid/i);
  assert.match(evidence, /post.check|post-check/i);
  return evidence;
}
export function checkEvidence() {
  assertBaseline();
  const controller = readController();
  const names = ['contracts', 'durable-authority', 'temporal', 'effects', 'fences', 'dispatch', 'results'];
  for (const name of names) validateIndex(name, controller);
  const runs = validateIndex('qualification', controller);
  const candidate = runs.findLast(run => requiredChecks.every(id => run.checks.some(check => check.checkId === 'f03-qualification.' + id && check.status === 'pass' && check.result?.exit_code === 0 && !check.result.workspace_changed)) && run.checks.every(check => check.status === 'pass' && check.result && !check.result.workspace_changed));
  assert.ok(candidate, 'Actual unchanged passing integrated + identity + foundation + original controller job required');
  const fingerprints = new Set(candidate.checks.map(check => check.result.fingerprint));
  assert.equal(fingerprints.size, 1, 'Qualification checks must use one controller snapshot');
  for (const check of candidate.checks) {
    if (!check.checkId.endsWith('.f03-evidence-index')) passingTap(check.stdout);
  }
  const all = candidate.checks.find(check => check.checkId.endsWith('.f03-all-behavior')).stdout;
  for (const label of ['CONTRACTS/', 'POSTGRES/', 'TEMPORAL/', 'EFFECT/', 'FENCE/', 'DISPATCH/', 'RESULT/', 'QUALIFICATION/', 'real rejecting adapter keeps checked draft Task success']) assert.ok(all.includes(label), 'Missing actual integrated suite: ' + label);
  assert.ok(all.split('F03 entry dependency hashes: 666 unchanged').length >= 3, 'Entry and exit retained hashes required');
  assert.match(candidate.checks.find(check => check.checkId.endsWith('.f03-original-retained')).stdout, /UI evidence: current source, actual three-client twelve-flow records/);
  const evidence = validateDocs();
  assert.ok(evidence.includes(candidate.jobId), 'Acceptance must identify actual integrated controller job');
  assert.ok(evidence.includes([...fingerprints][0]), 'Acceptance must identify actual candidate fingerprint');
  assert.ok(evidence.includes('qualification-controller.json'), 'Acceptance must link full qualification streams');
  assertBaseline();
  console.log('F03 evidence index: original controller events, complete raw bytes/SHA256, unchanged qualification snapshot and explicit external limits verified; controller completion/reviews remain authoritative.');
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Evidence gate is unfiltered and takes no arguments');
  checkEvidence();
}
