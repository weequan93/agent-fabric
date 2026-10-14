# Turn277 — Inspector resource readiness

PLAN276-01's missing capability is now **available through the controller**.
This resources assignment ran one inline probe; it implemented no storage
diagnostic or product repair. F05 remains **not accepted**. The next assignment
is independent plan review.

The probe is registered as `f05-14-direct-cpu-profile.resource-inspector-probe`
via `loop_plan(final=true)`, before the original strict build120s and direct
diagnostic180s. Both original definitions are unchanged. The resource preflight
remains registered; future task verification can recheck availability before
building and sampling. No task was claimed done. There are still78 tasks,
69done,4dropped,5live unfinished;74 nondropped cover all96 requirements,
with no unknown IDs, missing/dropped predecessors or cycles. Maximum one lead
plus one tester fits the four-seat limit; no subagent was needed here.
`max_iterations` and `max_hours` are null, so no capacity-budget condition applies.

Original controller job `job-7612d09b37`, at2026-10-13T13:09:01Z:
**PASS/exit0/313ms**, fingerprint `git:e119efad3ab1ccac625f7dc9`.
[stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-7612d09b37/f05-14-direct-cpu-profile.resource-inspector-probe/stdout.log)
is392 bytes/SHA256
`f7bd41623dacff6a2b3714d6fd467416223a090d6893d42955f6c1cd985608ea`;
[stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-7612d09b37/f05-14-direct-cpu-profile.resource-inspector-probe/stderr.log)
is empty/SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Original streams were read directly; no raw copy or CPU profile is retained.

The executed Node is `/Users/super/.hermes/node/bin/node`, v22.22.3.
Profiler enable/setSamplingInterval1000/start/stop actually succeeded.
250.026917ms of bounded local work yielded10 nodes,168 samples,168 resolved
sample IDs and168 finite nonnegative deltas. Sampled intervals total258291us;
profile span is258375us. The script reports disconnected:true and
networkListener:false only after its unconditional disconnect and final
listener check. Operation/stop/disconnect failures retain their original errors,
using AggregateError if several occur. The in-memory profile is released.

The controller's outer process cleanup field is `zombie`; this report does
not claim whole-host reaping. The job is finished. The probe opens no listener,
child process, product fixture or container. Session disconnection is its own
observed cleanup outcome, separate from that controller process observation.

Exact command: cwd repository root, timeout15s, expected exit0,
argv `["node","--input-type=module","--eval",SOURCE]`.
SOURCE is exactly the following UTF-8 block including its final newline:
3164 bytes/SHA256
`f8378b63c88d7f5bb36009a24f0f6af5374b08c519dc906898df594cfe6584a9`. The controller task definition stores this same argument;
this is a direct resource command, not a runner or verification wrapper.

```javascript
import assert from 'node:assert/strict';
import { Session, url } from 'node:inspector';
import { performance } from 'node:perf_hooks';

const session = new Session();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
const failures = [];
let started = false;
let profile;
let summary;
try {
  assert.equal(process.version, 'v22.22.3', 'pinned Node version required');
  assert.equal(url(), undefined, 'no Inspector network listener');
  session.connect();
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 1000 });
  await post('Profiler.start');
  started = true;
  const workStart = performance.now();
  const deadline = workStart + 250;
  let iterations = 0;
  let checksum = 0;
  while (performance.now() < deadline && iterations < 50000000) {
    checksum ^= Math.imul(++iterations, 2654435761);
  }
  const workMs = performance.now() - workStart;
  ({ profile } = await post('Profiler.stop'));
  started = false;
  assert.ok(profile && Array.isArray(profile.nodes) && profile.nodes.length > 0);
  assert.ok(Array.isArray(profile.samples) && profile.samples.length > 0);
  assert.ok(Array.isArray(profile.timeDeltas));
  assert.equal(profile.samples.length, profile.timeDeltas.length);
  assert.ok(Number.isFinite(profile.startTime) && Number.isFinite(profile.endTime));
  assert.ok(profile.endTime > profile.startTime);
  const ids = new Set(profile.nodes.map(node => node.id));
  assert.equal(ids.size, profile.nodes.length, 'unique node IDs');
  assert.ok(profile.nodes.every(node => Number.isSafeInteger(node.id) && node.id > 0));
  assert.ok(profile.samples.every(id => Number.isSafeInteger(id) && ids.has(id)),
    'every sample resolves to a profile node');
  assert.ok(profile.timeDeltas.every(delta => Number.isFinite(delta) && delta >= 0),
    'finite nonnegative timeDeltas');
  const sampledIntervalUs = profile.timeDeltas.reduce((sum, delta) => sum + delta, 0);
  assert.ok(Number.isFinite(sampledIntervalUs) && sampledIntervalUs > 0);
  summary = {
    probe: 'f05-in-process-inspector-resource', status: 'ready',
    node: process.version, executable: process.execPath, samplingIntervalUs: 1000,
    workMs, iterations, checksum, nodes: profile.nodes.length,
    samples: profile.samples.length, resolvedSamples: profile.samples.length,
    finiteTimeDeltas: profile.timeDeltas.length, sampledIntervalUs,
    profileSpanUs: profile.endTime - profile.startTime,
  };
} catch (error) {
  failures.push(error);
} finally {
  if (started) {
    try { await post('Profiler.stop'); } catch (error) { failures.push(error); }
  }
  profile = undefined;
  try { session.disconnect(); } catch (error) { failures.push(error); }
  try { assert.equal(url(), undefined, 'no Inspector network listener after disconnect'); }
  catch (error) { failures.push(error); }
}
if (failures.length === 1) throw failures[0];
if (failures.length > 1) throw new AggregateError(failures, 'Inspector probe/cleanup failures');
console.log(JSON.stringify({ ...summary, disconnected: true, networkListener: false }));
```

Fresh read-only local probes returned Node22.22.3, pnpm10.18.0 and
TypeScript5.9.3; Docker client29.1.0/server29.1.2,12CPU/33864495104 bytes
RAM/four unrelated running containers; cached pinned PostgreSQL image
`c91180c6…3333`; empty census using the actual
`agent-fabric.storage-fixture-owner` label; disk1.0TiB available/44% used.
Offline store exists; existing metadata validates18 dependencies/17 notices,
with pg-types/pgpass notice completeness and vulnerability assessment still
unknown. No build, install, PG startup, GUI or behavioral workload ran here.
The [readiness report](../readiness.md) distinguishes these fresh observations
from latest original fixture/build results and older sandbox refusals.

Read solution, brief, test environment/catalog, current plan/teams/checks,
roadmap/foundations/AF-07/UX-01 ledger/master storage/native/acceptance sections
and F02 evidence. Local integrity checks pass for2581 accepted inputs,
existing execution preservation and current product candidate
`sha256:67a9a60a65e52ac1ce3d7bfc78f221b68c13a850820942d9ef4ecd7e9d0f1893`
/1177 files. Original D/H, aggregate, terminal and goal acceptance definitions
compare equal before/after; original diagnostic build/run compare equal.
Latest original D/H and decorated profile stdout/stderr hashes match
[Turn272](../develop-turn272/report.md) and [Turn274](../develop-turn274/report.md).
These integrity observations supply no product pass.

Standing2026-10-13 approval covers the local check/plan/resources change.
No freeze/re-freeze, dependency/team change, accepted/raw input modification,
production/test/harness edit, new wrapper, candidate copy or external action.
Paid resources, real credentials, other apps, security settings, shared
deployments, personal data, messages and history changes remain untouched.
D/H900s, aggregate1800s and all workloads/assertions stay mandatory.
The future sampler still needs implementation and review, with real fixture
cleanup on every outcome. It measures sampled intervals, not exact CPU,
PG-server CPU/wait, speedup or acceptance. No unchanged H retry is permitted;
a supported repair requires a separate bounded plan and real component
regressions before changed-candidate D/H. Full-H/aggregate/security/terminal/
independent/final/product and AF-07/UX-01/G1/G2 remain unqualified.
External X01–X09 stay explicit in readiness and acceptance evidence.
