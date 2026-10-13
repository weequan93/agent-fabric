# G1-F05 readiness — Turn152 / RESOURCE151-01

2026-10-11, resource planner. Local resources are ready for independent planning
review of EXEC150-01. This is resource availability, not implementation,
investigation completion, product acceptance or permission to repair frozen
helpers. No production code or investigation probe was written in this stage.

## Current definition and source bindings

The freshly reread installed candidate is **1132 files**,
`sha256:179e0d045adfdbadd9ae8f0af6ceeffe141ed17f7ec1fa390709fddda5b8e0d7`.
Current plan: **69 tasks / 123 task checks / 96 requirements / 46 done /
23 unfinished**. [Current definitions](readiness-turn152/current-definitions.json)
bind tasks, check objects, requirements, acceptance and policy. The
[readiness audit](readiness-turn152/readiness-audit.json) compares them with live
state and Turn150's plan-after; the96-case requirement matrix is exact once per
ID. Definitions, dependencies, covers, roles, teams and task statuses are unchanged.

[Allocation](readiness-turn152/task-resource-allocation.json) refreshes all69
tasks and209 source bindings:208 existing bindings reread/hash-verified, one
explicit pending implementation. It retains existing source/output owners from
Turn146's allocation and adds the investigation's source/fullstream owners.
[Input bindings](readiness-turn152/input-bindings.json) separately bind current
fixture, maintenance, accounting, authority, build and runner interfaces, source
documents and historical failure inputs. Allocation is against current bytes,
not an earlier readiness verdict or a future repaired candidate.

The prior primary report is preserved byte-for-byte as
[readiness-before.md](readiness-turn152/readiness-before.md), with original
hash in input-bindings.json. [Turn141 resources](develop-turn141/resources.md)
remains historical and untouched:1127/68/121/43 and BOOT141 do not establish
readiness for EXEC150. Historical failures and raw evidence remain intact.

Read: product brief, solution, test plan, current tasks/acceptance definitions,
roadmap, foundations sequence, AF-07/UX-01 remaining ledger, master §§15–18/28/31
and F02 evidence index. Their obligations remain actual encrypted persistence,
full-audience source/version/author lineage, useful recall/conflict/delete/
revocation, current-authority restore and native saved-decision Ask without VM
startup. Historical planning and ledger text are not acceptance claims.

## Bounded resource probes

[Resource probes](readiness-turn152/resource-probes.json) retain exact commands,
complete local streams, exits, byte counts and hashes. Local observations are
not controller evidence; controller results follow separately.

| Needed resource / purpose | Actual probe and result | Status and owner |
| --- | --- | --- |
| Node native execution, ESM, fs/crypto/zlib/clocks | `node --version`:v22.22.3; actual strict build, failure checker and original authenticated receipt decoder execute native modules. | Ready; tester/build owners. |
| pnpm/offline package store | pnpm10.18.0; original controller build actually installs offline/frozen/ignore-scripts/ignore-workspace from `/private/tmp/agent-fabric-pnpm-store`. No registry acquisition. | Ready; f05-01. |
| TypeScript and PG dependencies | Actual compiler5.9.3; imported pg8.16.3 exports Client/Pool. Build verifies @types/pg8.15.5, @types/node22.18.6, strict options, current sources/tests, installed owner imports and24 migration assets. | Ready offline; f05-01. Lock `sha256:ca42a644c6d09dd16500bb4b7d2f1a5885bb796e4660b3ac974bdb68a2c37ec4`. |
| Dependency assessment/notices | Unchanged build reports securityAssessment:unknown and missingInstalledNotices pg-types/pgpass. | Availability ready, assessment/notice limits remain with security/evidence owners; no security qualification claimed. |
| Python evidence tooling | Python3.13.5; actual current plan/allocation/source audits execute. | Ready; resource/evidence owner. |
| Docker local daemon | CLI29.1.0/server29.1.2; actual daemon info12 CPUs/33,864,495,104 memory bytes. | Ready; local fixture owner, no paid resource. |
| Cached PostgreSQL image | Actual image inspect exact digest `postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333`; original controller fixture starts with `--pull=never` and observes PostgreSQL16.12. | Ready offline; original fixture owner. |
| Local PG/IdP/current authority/accounting | Controller original authority component executes118 tests with loopback PG, synthetic IdP, restricted clients and installed owners; owned container/root cleanup receipts retained. | Ready through controller; f05-02/current fixture owners. No EXEC150 lock schedules tested here. |
| Disk/evidence roots | `df -k . /private/tmp`:1,111,579,316 KiB available. Docs output created; actual fullstream copies and source hashes read-verify. | Ready for bounded local attempts; tester/evidence owner. Observed space is not reserved capacity/SLA. |
| Host process census inside sandbox | Exact `ps -axo pid=,ppid=,comm=` raises `[Errno1] Operation not permitted`. Original local smoke fails `Real process census unavailable` before fixture allocation. | Missing inside sandbox; available via original controller census/startup/cleanup. No security setting change needed. |
| Host CPU/memory sysctl inside sandbox | Exact `sysctl -n hw.ncpu hw.memsize` exit1, `Operation not permitted`. | Missing inside sandbox; daemon capacity above is independently available. No host-capacity claim from sysctl. |
| Compiled original fixture exports | Native imports after build expose createStorageFixture, createMaintenanceVerificationFixture, accountingSnapshot and enrollServiceAccounting as functions. | Ready. First import during cache rebuilding failed ERR_MODULE_NOT_FOUND and is retained; await build, then serial execution. |
| Browsers/GUI/devices/remote CI/accounts | Not dependencies of the bounded PG investigation. GUI regression execution remains through controller; actual devices/remote CI accounts not probed. | Not needed locally; external owners below. |

[Local smoke result](readiness-turn152/fixture-smoke-result.json) and full streams
retain the original fixture census failure: its SQL/body never ran, and it
created no fixture resources. It is not a passed probe. Successful
[export import](readiness-turn152/export-import-after-build.stdout.log) verifies
exports, not execution of returned closures. Earlier export failure is retained.
The capture harness initially aborted on ps, then its broad all-success assertion
failed on sysctl; those harness failures are in this turn's tool transcript.
The retained final probe rows explicitly preserve both errors, not success.

## Fresh controller evidence and cleanup limit

[Controller evidence](readiness-turn152/controller-evidence.json) binds all six
original/copied streams byte-for-byte, metadata and fingerprints. Both jobs
finished. Only these actual controller results count as controller evidence:

| Job / unchanged command | Result | Resource meaning |
| --- | --- | --- |
| job-2ad3e3456a / `node g1-storage/scripts/build.mjs` | PASS6809ms | Actual pinned offline strict build;2581 protected inputs unchanged before/after. |
| job-7cda7343d4 / `node g1-storage/scripts/check-component.mjs authority` | PASS79842ms,118 tests | Original owned PG/IdP/current authority environment available outside sandbox. |
| job-7cda7343d4 / `node docs/loop/agent-fabric-g1-f05-storage/develop-turn150/check-retained-failure.mjs` | PASS216ms | Read-only original failure admission; lifecycle185/187 and nonzero observation still rejected, no task/product qualification. |

The original authenticated decoder reconstructs authority's complete final
command census receipt into
[authority-command-decoded.json](readiness-turn152/authority-command-decoded.json):
433010 bytes, `sha256:a11f3e0b160b040efb0407a5e9b1d0b9634d56dcb73aba2e216f93b2252671dc`.
Outer complete stdout retains original fixture identity/version/loopback/root
identity and successful container/root cleanup. No tail replaces full streams.
An initial docs decoder assumption of one command receipt pair failed; actual
stream has initial and final census pairs, and the final pair is now explicitly
authenticated. Original stream bytes were not changed.

All three check metadata records still report **cleanup:zombie**; authority and
retained replay also report **workspace_changed:true**. These remain unresolved.
Inner owned cleanup is observed and available; outer supervisor cleanup is
**unqualified**. Future diagnostics must retain exact pool/child/container/root
cleanup and complete failure streams. No unowned resource is removed to tidy a
census. No task completed and no receipt-owner retry submitted this turn.

## Original interfaces available to the future investigation

Source-bound, compiled exports are available as follows. Their presence is not
evidence the rejected row was captured or the planned diagnostic executed.

| Required observation | Existing interface and source owner | Readiness boundary |
| --- | --- | --- |
| Actual SQL inputs/rows/PIDs/transaction identities | pg8.16.3 Client/Pool connect/query/release; createStorageFixture exposes admin/controller/authority. Original blocked() uses pg_backend_pid, pg_stat_clear_snapshot, pg_stat_activity and pg_blocking_pids. | Interfaces source/import verified and real PG controller-tested. Future probe must record actual arguments/results/client identities/clocks without fabricated rows or altered driver returns. Original rejected row/PID remain absent. |
| Held allowance/membership locks and query/client barriers | Original fixture exposes clients, verified scope, task/allowance IDs. Original registration uses checked transactions and awaited queries. | Available for future explicit query/client barriers. Held allowance/membership, coherent wait, absent/unrelated blocker schedules remain pending; no sleeps as investigation schedules. |
| Pending request result/error and release/finally outcome | Maintenance fixture exposes prepare, repo, publish, denied, blocked, close; actual repo publish promise remains accessible. | Retain actual pending outcomes before cleanup loses them. Original denied() can increment disclosure counter if work resolves; original helper/finally must remain unchanged. |
| Actual decrypt delta | Maintenance fixture opens() counts actual CryptoStore.open; count/violations exposed. | Available source-bound interface; original failure delta was not captured. Never reset original unauthorizedDisclosure=1 or assert/dismiss plaintext exposure without actual effects. |
| Storage/accounting effects | snapshot()/unchanged() query storage tables, seven accounting sets and allowances. effects(prepared) queries actual admissions/receipts/meters/settlements/head publications. Accounting fixture owns enrollment/snapshot. | Available original definitions/compiled exports. Future before/after snapshots and request/decrypt deltas are pending, not retrospective failure evidence. |
| Ownership/fatal cleanup | withStorageFixture checks exact image/labels/name/ID/loopback/no-bind container plus owner/root/device/inode markers. createStorageFixture.close owns IdP children and pools; maintenance close zeroes its fixture buffers then delegates. | Original controller path works. Close checked clients/pools/helper before outer cleanup, restore env, preserve every cleanup error. Synthetic owned resources only. |
| Fixed source/full native streams | Existing runner, process-result, measurement/receipt decoders; docs attempt hashes/copies. | Fresh complete streams and receipt decoding exercise capture availability. Future probe source and every child stdout/stderr must be frozen and retained on failure as well as success. |

Original maintenance helper at `g1-storage/tests/helpers/maintenance-verification-fixture.ts:60–62`
breaks on the first returned blocking-PID row, then asserts Lock before logging.
It provides no pre-assert rejected-row receipt. A standalone probe can use the
exposed original clients and unchanged SQL to record actual returns. Any separate
sampling facility must be visibly structural and cannot prove reproduction by
the original single query. Implementation choice and diagnosis remain the
pending task's work after independent review.

Current identity/control/fences retain F01–F04/native owners; storage/maintenance
owns additive content/effects; existing resource/budget owners own accounting.
Synthetic roles/keys/identities are original enrollment inside newly owned
reproducible test resources. No real credential/shared ACL/security setting or
production policy is changed. No original helper, assertion, driver return,
package file, protected file or historical raw evidence changed.

## Task/output allocation and sequencing

`f05-11-lock-observation-investigation`:tester/empty team,65 engineering minutes
(audit10, actual probes25, negative/boundary10, diagnosis/proposal10, evidence10).
Receipt-boundaries, native-diagnostic-controls and native-proof-transport
prerequisites are actually done. Their existing check objects remain exact.

First fixed source:existing `develop-turn150/check-retained-failure.mjs`, freshly
hashed and controller-run. Second fixed source:
`docs/loop/agent-fabric-g1-f05-storage/develop-turn150/probe-lock-observation.mjs`
is **pending implementation**. This task owns its source, native full stdout/
stderr, fresh docs attempt artifacts, SQL/request/decrypt/effect captures and
exact ownership cleanup. Freeze/hash actual source when written after review.
The original120s check limit remains. The missing implementation is not passed
readiness evidence or a missing tool/account. All208 existing source bindings
exist; this is the only pending source in the209-entry refreshed allocation.

Task check output allocation:
`.loop/goals/agent-fabric-g1-f05-storage/runs/checks/<fresh-job>/f05-11-lock-observation-investigation.<check-id>/{stdout,stderr}.log`,
plus byte-exact copies/hashes under a fresh docs attempt. Every check's existing
output owner/dependency is explicit in allocation. Both real investigation
checks must pass via controller before task completion. A concrete repair is
separately reviewed; claiming an original helper/assertion wrong requires the
prescribed loop_ask. Readiness does not authorize that repair.

Receipt owner's SAME4 remains downstream, then separate full-predecessor4 and
timeout3. S-K/Q/R/fullH/public aggregate/security/code/final/product owners remain
pending. Available resources do not establish that those workloads pass.

[Team/capacity audit](readiness-turn152/team-capacity.json) reads current
controller default agent.team_limit4:all69 empty teams use0 delegated seats.
No subagent launched. Current max_iterations/max_hours are null: **no remaining
turn/hour gate applies**. Estimates support assignment only, not admission.

Unchanged envelopes:concurrency1; investigation one sequential owned PG fixture;
standalone4/futureH5 PG maxima, each1CPU/256MiB/128PID; raw/carrier256MiB,
compressed32MiB/wire48MiB/controller64MiB/8192chunks; bootstrap10s/native120s/
L1800s/V900s/HARNESS900s; volume/AD235000ms/categories and atomic2000ms.
Obsolete240000ms default per-file cap stays removed. No deadline increase,
counter reset, selector, omitted variant, cached patch or weakened gate.

## External gaps with owners

These resources remain **needs approval/unqualified**, not prerequisites of the
offline task. No acquisition or external execution is attempted. Any later exact
external action must obtain loop_ask(kind=approval) first.

| Gate | Missing approved real environment / decision | Owner |
| --- | --- | --- |
| X01 | Actual object store/volume encryption, KMS custody/rotation/provider durability | Storage/security qualification and authorized infrastructure owner. |
| X02 | Multi-host/backup/power-loss/filesystem consistency, load and real RPO/RTO | Recovery/operator qualification in approved deployment. |
| X03 | Enterprise retention/legal hold/residency/key/data policy | Authorized human policy owner; no invented fixture-to-production policy. |
| X04 | Real download/stream/direct-link revocation and exposure window | Delivery/security owner and approved provider/broker. |
| X05 | Actual Linux/runtime/egress/no-filesystem isolation | G1-F06 runtime in approved host/topology. |
| X06 | Enterprise directory/SSO and independent human judgment | Identity/human approval qualification in approved real environment. |
| X07 | Supplier/model quality/conformance, paid route, usage/invoice reconciliation | Model/FinOps qualification with approved provider/region/data flow/spend. |
| X08 | Signed apps, physical devices, sleep/accessibility/three-client experience | G1-F07 clients with approved devices/distribution/users. |
| X09 | G2–G5 semantic/no-memory comparisons, connectors/JML/inspector/Reflect/adapter depth | Later product gates and authorized external owners. |

job-ffd8f8ecfb and earlier failed jobs5c63d21b7e/5b010df098 remain failures.
Fresh read-only admission retains lifecycle185/187, failed L09 leaf+parent,
missing later subcases and unauthorizedDisclosure=1 unchanged. Sampling skew
is unconfirmed; actual rejected row/PID/decrypt delta/pending economic effects
were not invented. Outer supervisor cleanup and X01–X09 remain unqualified.

Paid APIs/resources, real credentials/security changes, shared/production
deploy/release, messages, published-history/branch destruction and deletion of
irreproducible data remain OFF. RESOURCE151-01's stale resource binding is
addressed by this current report/allocation; independent plan review is next.
