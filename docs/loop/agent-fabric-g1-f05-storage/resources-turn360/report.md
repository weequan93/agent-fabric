# Turn360 — reviewer access and local resource readiness

2026-10-15 UTC. Assignment: resources, following REVIEW359-ACCESS. F05 remains
unaccepted; 73/82 tasks are done. No production or test source was edited.

## Review-access resolution

The installed controller's `prompts.py:292–296` says to use only four Loop tools,
while its plan-review assignment at `prompts.py:199–210` requires independently
reading source and stage documents. The Codex adapter at `adapters.py:161–195`
already launches reviewers with a read-only sandbox; its shell reader has not
been removed. The MCP allowlist at `mcp_server.py:128` limits controller mutations,
but does not expose file contents. This is a procedural wording conflict, not a
reproduced filesystem permission failure.

A controller decision note explicitly authorizes read-only filesystem inspection
for the next independent plan review as a specific exception to that generic
four-tool-only wording. The reviewer may use `functions.exec`/`exec_command` (or
equivalent read-only `cat`, `sed`, `rg` and Python reads) to inspect the original
documents, live goal/state/check definitions, named source files and raw logs.
No file writes, builds, check starts, network/service operations or delegation;
retain the read-only sandbox and controller mutation boundary, record exactly
one `loop_review` verdict, then stop. No controller code, sandbox configuration,
product permission, scope, requirement or acceptance budget was changed.

The [current readiness section](../readiness.md) lists original paths. All were
successfully opened using bounded local reads. No copied source bundle, raw
fixture or new verification layer was created. Independent judgment belongs to
the next reviewer; this turn does not issue a review verdict.

## Fresh observations

| Resource | Probe/result | Limit and owner |
| --- | --- | --- |
| Node/pnpm/TypeScript/Python/Git | Versions exit0: 22.22.3/10.18.0/5.9.3/3.13.5/2.51.0. | Existing build/evidence owners; no install or fetch. |
| Strict build/offline dependencies | Controller job `job-b2aba11db6`, existing `f05-14-owned-copy-repair.strict-build`, PASS/exit0/9023ms. Offline/frozen/ignore-scripts install192ms, current source/test/imported-owner emission. | Build availability only; no TAP-reader repair or fresh full behavior qualification. |
| Dependency store/lock/notices | `/private/tmp/agent-fabric-pnpm-store/v10` exists. Wanted/installed locks equal, SHA256 `ca42a644c6d09dd16500bb4b7d2f1a5885bb796e4660b3ac974bdb68a2c37ec4`. Validator reports18 packages/17 notices. | Security assessment unknown; installed pg-types/pgpass notices missing, unchanged existing inventory. Security owner. |
| Native TAP and child process | Actual bounded Node child uses builtin `node:test`, exits0, pass1, stderr0. | Capability smoke only. Large folded/escaped payload behavior belongs to planned D02 tests. |
| Original full-run streams | Read actual stdout6508961bytes and stderr0; hashes below match Turn358. | Historical native format/coverage regression, not current-candidate acceptance. Evidence owner. |
| Docker/cache | Client29.1.0/server29.1.2; desktop-linux, aarch64,12CPU/33864495104bytes. Pinned cached PostgreSQL image ID and RepoDigest match `c91180c6…13333`. | No pull, start, stop or unrelated container operation. Fixture owner. |
| Existing owned containers | Label-filtered census finds `cc26a43ae7cb` and `3c42ab380310`, both Up21hours. | Left untouched. Historical interrupted-fixture/whole-host settlement remains unqualified; fixture owner must preserve preexisting census. No empty-host claim. |
| Process census | Exact Node `spawnSync('ps',['-axo','pid=,ppid=,comm='],{timeout:5000})`: status:null, code:EPERM, message:`spawnSync ps EPERM`. | Actual sandbox restriction; existing controller route required, no bypass/security change. Fixture owner. |
| Disk | `df -Pk .`:1153973276KiB available,40% used. | Snapshot availability only, no reservation or performance guarantee. Serialized checks. |
| Plan/team/resources | 82tasks/78nondropped,96requirements, no uncovered/unknown IDs, missing dependencies or cycles. Maximum one specialist/task; controller default team_limit4, host4 total slots. | At most lead+one specialist; no delegation this turn. Shared build/census/controller checks serialize. |
| Budget/check guards | max_iterations/max_hours:null. Four human-approved task guards remain14400s; aggregate acceptance14400s unchanged. | No capacity gate, timing optimization, re-plan or budget amendment. |

The cached image is
`postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333`.
The existing five-fixture envelope (1CPU/256MiB/128PID each), synthetic credentials,
loopback ports, owned persistence/backup/restore roots, crypto, local IdP/HTTP/IPC
and imported native owners need no additional resource for this two-file repair.
Their actual behavior is established by the original full run and must be
requalified on the repaired candidate through the existing controller checks.
No new live database, physical device, browser, account or provider is needed
for the direct reader/component change.

## Original controller evidence

Latest availability check:

- [stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-b2aba11db6/f05-14-owned-copy-repair.strict-build/stdout.log):1148bytes, SHA256 `f99bdd614bfb2c23e09aa3b22dddf477af70c4eb69a39dd0dbade76023e0217c`.
- [stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-b2aba11db6/f05-14-owned-copy-repair.strict-build/stderr.log):0bytes, SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Fingerprint `git:d22daab8373359e1cc59c785`; result completed, cleanup:`zombie`.
All2581 accepted inputs pass the existing hash comparison before/after build.
The controller cleanup label does not prove whole-process reaping. Later
documentation/controller writes change the workspace fingerprint.

Original full acceptance `job-7b2a813852` remains PASS0/7959471ms with actual
outer1028/copied984 tests as recorded in the [Turn358 report](../develop-turn358/report.md).
Its immutable [stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-7b2a813852/acceptance.g1-storage-behavior/stdout.log)
is6508961bytes, SHA256 `4c60fd8e5a9d6393d634048b9fc927e6cd9ec5ce35bf6074cbad3de6ba321458`;
[stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-7b2a813852/acceptance.g1-storage-behavior/stderr.log)
is empty with the empty-stream hash above. No raw bytes were rewritten or copied.

A fresh read-only invocation of the shipped `records()` on those original bytes
still returns one outer report and zero nested reports where one is required.
Physical lines19117–19121 have65538/65638/65916/65636/24233bytes with actual `# `
prefixes. This reproduces the existing parser defect without a behavior rerun;
the two-file repair remains unimplemented pending independent plan review.

Untouched repair inputs at the end of resource probing:

- `g1-storage/scripts/delivery-evidence.mjs`:54727bytes, SHA256 `ca7eaedcc4ce068e362a2d47e7a2141690fb282df9c6b2271b39a8cc687a55f8`.
- `g1-storage/tests/helpers/delivery-evidence-component.ts`:28925bytes, SHA256 `67d2d3c1054320671d9981ed5817e21c6522aede47c3f9e4589fd6ecea43b450`.

## Next and remaining gaps

Submit resources and repeat the separate independent plan review. Only after
approval implement `f05-14-tap-reader-repair`, preserving all existing D02/D06
assertions and native prefix/depth/physical-order/corruption safeguards. Its
existing component2700s then immutable-original-raw180s checks remain serialized.
Resolve that direct reader task and independent source/raw review before changed
candidate full D/H, aggregate, terminal and registered acceptance stages.

Real X01–X09 remain pending with the owners and approval gates in readiness:
provider/KMS, physical/multi-host recovery, enterprise policy, real delivery
revocation, F06 OS/runtime isolation, enterprise SSO/human judgment, actual
models/billing, signed physical clients and G2–G5 depth. No external resource or
human decision is required to start the bounded local repair after review.

Only readiness and this report are edited. Standing Oct13 approval covers the
in-scope procedural/resource/docs/build work; no freeze/re-freeze occurs.
Production/tests/check definitions/timeouts/accepted files/raw evidence stay
unchanged. Existing uncommitted work is preserved. No paid/remote/real-secret,
shared-deployment, other-app, personal-data, messaging or history action occurs.
