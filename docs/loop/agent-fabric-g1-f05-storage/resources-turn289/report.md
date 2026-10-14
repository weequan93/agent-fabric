# Turn289 resources report

2026-10-13. Assignment: resources after PLAN287-01 and the Turn288 plan revision.
Current readiness: [readiness.md](../readiness.md).
**Local tools and owned fixtures are available for independent plan review.
F05, the relocated positive and full H remain unaccepted.**

Read Loop next/status/guide, the brief/solution/test plan, current task plan and
owned-copy prescription, roadmap/foundations/AF-07+UX-01 ledger/master cited
sections/F02 evidence, live goal/state, and actual package/build/check,
dependency/guard/candidate/evidence and fixture owners. No production code,
tests, harness, dependency pin, plan/check/team definition or raw history changed.
Only current readiness and this report are edited. All preexisting worktree
changes are left alone.

## Bounded local observations

| Command / probe | Actual observation |
| --- | --- |
| `node --version`, `pnpm --version`, `node g1-storage/node_modules/typescript/bin/tsc --version` | Exit0;22.22.3/10.18.0/5.9.3. |
| `python3 --version`, `/Users/super/Documents/ai/loop-engineering-code/.venv/bin/python --version` | Exit0; both3.13.5. Read original .loop/bin/loop; installed library/interpreter/project origin exists. |
| Existing inline Node imports of assertBaseline/assertManifest/assertExecutionPreservation/assertDependencyMetadata/candidateSnapshot | Pass;2581 accepted inputs,18 packages/17 notices, unchanged1177-file candidate e8ea418e…ef8b30. Independent package security/license clearance remains unknown; pg-types/pgpass installed notices absent. |
| `docker version --format '{{json .}}'`; `docker info --format '{{json .NCPU}} {{json .MemTotal}} {{json .ContainersRunning}}'` | Exit0; client29.1.0/server29.1.2/local desktop-linux;12CPU/33864495104bytes/four unrelated running containers. |
| `docker image inspect postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333 --format '{{json .Id}} {{json .RepoDigests}} {{json .Architecture}} {{json .Os}}'` | Exact cached image and RepoDigest;arm64/Linux. No pull. |
| `df -Pk . /private/tmp/agent-fabric-pnpm-store` | Exit0;1078632296KiB available/44% used at snapshot, same data filesystem. Availability only. |
| Read/hash Python installed census, excluding .cache | storage397files/36links/26588553bytes; recovery12531files/523links/392101061bytes. All relative links resolve within their installation, no special files. Five exact storage metadata paths are regular; current lock bytes equal pinned wanted lock. Existing shims contain original absolute NODE_PATH entries, confirming the plan's regeneration need. No install/copy is inferred from the census. |
| Node spawnSync ps, encoding:utf8/timeout5000 | Exact argv `ps -axo pid=,ppid=,comm=`; status:null/signal:null/error.code:EPERM/message:“spawnSync ps EPERM”; probe exit1. No permission change/bypass. Fresh controller fixture result below supplies the available route. |
| Inline Node owned fs/HTTP/IPC primitive probe | Exit0; exclusive write+file fsync+rename+directory fsync+exact read; loopback HTTP200/exact synthetic body; minimal-environment Node IPC child nonce round-trip and exit0. Finally listener closed, child settled, UUID/device/inode/realpath/owner-marked temporary root removed, zero cleanup failures. No product fixture invoked. |
| Inline Python five-PG resource probe, first attempt | Exit1 on overly narrow probe comparison: SHOW server_version returns `16.12 (Debian 16.12-1.pgdg13+1)`, not bare16.12. All five identity-proved containers removed in reverse order, root removed, original labeled census unchanged. This failure is retained as an observation. |
| Corrected fresh five-PG probe | Exit0; five simultaneously running cached PG containers, SQL1 in each, actual16.12 Debian suffix,1527ms before cleanup. Each1CPU/256MiB/128PID, random owner/instance/name/full container ID,127.0.0.1-only mapping, no host bind, pull=never. Reverse creation cleanup removes5/5 plus their anonymous volumes; UUID/device/inode/realpath marked temporary root removed; census unchanged; zero cleanup failures. |
| `docker ps -aq --filter label=agent-fabric.storage-fixture-owner` after controller settlement | Exit0/empty. Unrelated containers untouched. No whole-host PID equality/reaping is inferred. |

Direct resource probes are observations recorded from actual tool execution,
not independent reviews or product acceptance artifacts. They create no retained
script, wrapper, capture/admission layer, candidate copy or raw-log copy.
Their subprocesses are bounded5–15s, PG readiness30s, HTTP/IPC3s; failure cleanup
checks actual ownership before removal and preserves cleanup errors.
No filesystem/device/security setting changed.

## Original controller results

Checks are existing definitions, run serialized and unchanged. All completed
before the final report; raw streams are directly read and SHA256 hashed,
never copied. The original build is availability evidence; commands component
also executes real current behavior but cannot qualify the seven-file repair
or H02.

| Original check / job | Result | Complete original streams |
| --- | --- | --- |
| `node g1-storage/scripts/build.mjs`, f05-14-owned-copy-repair.strict-build / job-0ae9fb3f60 | PASS/exit0/6595ms, original120s definition. Own cache cleared; source/tests/imported owners compiled; pinned offline/frozen/ignore-scripts install178ms;18packages17notices/all2581 accepted inputs unchanged. | [stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-0ae9fb3f60/f05-14-owned-copy-repair.strict-build/stdout.log),1148bytes/SHA2567b5ddd3a10029bb741da923b26c561740032dde3bcb6116821ecaa8d375fc52a; [stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-0ae9fb3f60/f05-14-owned-copy-repair.strict-build/stderr.log),0bytes/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855. |
| `node g1-storage/scripts/check-component.mjs commands`, f05-04-gate.commands-component / job-fee05cf30e | PASS/exit0/70663ms, original600s definition;58tests, cancel/skip/TODO0; actual50save/85read/76write/199deny/11conflict/3owner observations and six violations0. Six real fixture origins have six matched container and root cleanup records, all container census checks unchanged; actual census/IdP/HTTP/PG/native owner route works outside sandbox. | [stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-fee05cf30e/f05-04-gate.commands-component/stdout.log),196142bytes/SHA256f2baa6594be01796f0c9e7de05e89ce7e9cbfb561f18f9edc1b6b8aeb124bf82; [stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-fee05cf30e/f05-04-gate.commands-component/stderr.log),0bytes/e3b0…b855. |

Final resource-document verification uses only the existing design checks in
job-2ebce48fe6: current-input-integrity PASS211ms/exit0 and
current-local-delivery-evidence PASS734ms/exit0. Complete
[integrity stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-2ebce48fe6/f05-14-owned-copy-design.current-input-integrity/stdout.log)
is284bytes/SHA2561dedf4df1e5bfeedbb3a7e9f79ec61ba210e7f5e8df3d3a0f196dc602f41aed7;
[integrity stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-2ebce48fe6/f05-14-owned-copy-design.current-input-integrity/stderr.log)
is empty/e3b0…b855. Complete
[local-evidence stdout](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-2ebce48fe6/f05-14-owned-copy-design.current-local-delivery-evidence/stdout.log)
is218105bytes/SHA2560be725b3022b771520350e487d8920b8df4c8dab7b66a4ddd2b93a39984951e2;
[local-evidence stderr](../../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-2ebce48fe6/f05-14-owned-copy-design.current-local-delivery-evidence/stderr.log)
is empty/e3b0…b855. Each original is directly read/hash-checked, not copied.
The reader reports qualified:false/authorVerdict:false/external:pending and
all four independent reviews pending. It supplies no repair or product verdict.

The controller records commands outer-process cleanup as `zombie`; this is
visible and does not establish whole-host reaping. It is separate from the six
actual fixture/container/root and synthetic IdP child cleanup observations.
Completed raw streams remain at their controller-owned origins. No pending
job or live probe resource remains.

Post-component input sizing:149 finished state.checks entries,298 stream files,
110750075bytes, none missing/nonregular. This count is historical sizing, never
the implementation allowlist. The prospective copy must capture every finished
entry coherently with original metadata/events/source/installed dependency
snapshots. Later integrity/evidence runs and stage/notes change that live closure.

## Plan/approval/qualification disposition

Static live audit:81tasks72done4pending1active4dropped,77nondropped;96 requirements
fully covered, zero unknown/missing predecessor/cycles;150 live task checks plus
four acceptance checks. Maximum two total seats per task fits controller default
four-specialist limit and host four total seats. No explicit goal team_limit;
max_iterations/max_hours are null, so no remaining-turn/hour capacity failure
or budget amendment. Check definitions/teams/requirements/budgets stay unchanged.

PLAN287-01 resources are ready: same tools/store, regular five metadata files,
confined installed links and immutable package payloads, sufficient observed
disk and actual five-container capacity. Closed regeneration validation and
relocated-build/package/link/metadata refusals belong inside existing
H01/HARNESS-BUILD and the seven owners after independent plan review.
No copied positive/build/currentness/async/capability/LIFO behavior is claimed
from these probes. Recovery's installation stays read-only with no launcher use.

Latest full D/H job-3d03803295 still D PASS101437ms/H TIMEOUT900130ms.
Their complete originals remain unchanged: D stdout199598bytes/SHA256
cf585a2f61cfd6db9c389136bff9718652ee24445397dc05d6cd95822ccfde09;
H stdout1920224bytes/SHA256
b560d8cf3f2ebb6e096c4cc13bcd8e861bd31ad8dc8e0e7cae9a7eb37334bcf0;
both stderr empty. These streams were directly read/hash-checked this turn.
No timeout cause, successful full H, current aggregate, author qualification
or whole AF-07/UX-01/G1/G2 completion is inferred.

All X01–X09 gaps and owners are explicit in current readiness: provider/KMS;
physical power/host/cluster recovery and objectives; enterprise policy;
brokered delivery revocation; F06 runtime; SSO/human judgment; supplier/billing;
F07 physical signed clients; later product breadth. They need real approved
environments before qualification, and are not local repair prerequisites.
No numerical enterprise retention/region/key/SLA/RPO/RTO choice is invented.
Delivered bytes cannot be recalled.

Standing2026-10-13 approval covers in-scope local builds, reproducible probes,
containers, test data, exact owned cleanup and documentation. Freeze/re-freeze:
none in this turn; no F05 pins or accepted input changed. No approval question
is needed. Money/paid/remote resources, real credentials/security settings,
shared deployment, personal-data deletion, other apps, messages and history
changes stay OFF. Submit resources through loop_stage_done; independent
plan_review owns the next verdict, implementation follows only afterward.

Submission outcome: loop_stage_done records resources DONE and returns next
assignment independent plan_review, dispatched to a separate read-only reviewer.
This author does not issue that verdict. No job, child, specialist or probe
resource remains in flight; the full-H/aggregate/external gates stay pending.
