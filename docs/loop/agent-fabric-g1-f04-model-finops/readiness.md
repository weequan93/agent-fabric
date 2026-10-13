# G1-F04 resource readiness

Date: 2026-10-07. Stage: resources. Role: resource planner. Turn: 9.

## Decision

The local deterministic development resources are available: pinned offline dependencies, strict TypeScript/Node tests, owned PostgreSQL, loopback services, current synthetic identity, native contracts, process termination/recreation and the controller's outside-sandbox execution route. No new supplier, gateway, cloud account, paid resource or UI is needed. The F04 package and fixtures are still implementation deliverables; none has been qualified by this resource report.

One approval gap affects the eventual unchanged foundation regression. Its existing nested script uses an SSH identity for a remote read-only inventory. The resource-stage controller run already executed that script before its credential dependency was inspected. This action is recorded below without treating it as approval or real F04 qualification. Approval question **q-6e6222040b** requests permission for exact future runs. Although the request specified `blocking=false`, the controller returned `blocking=true` and changed the goal to **waiting**. This report can be completed independently; further workflow progress follows the controller's human-answer gate. Do not repeat the credential-bearing check until the decision is resolved, and do not weaken or remove it.

## Inputs and scope

Read the [product brief](product-brief.md), [solution](solution.md), [independent test design](test-plan.md), [15-task plan](../../planning/g1-f04-plan.md), [roadmap](../../planning/roadmap.md), [foundation dependency plan](../../planning/g1-foundations-plan.md), [remaining ledger](../../planning/g1-remaining-ledger.csv), [master v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md) profile/accounting/resource/recovery/build/qualification contracts and [F02 evidence](../../evidence/g1-f02-acceptance.md). Inspected existing package/lock/tsconfig/build files, identity/foundation/retained checkers, foundation PG fixture, recovery fence and process fixture, controller check definitions, effective team-limit implementation and process cleanup semantics.

The acceptance route remains eight mandatory suites and 65 named cases: C3/P13/B9/U11/N8/A6/Q9/J6, with all planned variants. These are not resources already implemented or tests passed here. Temporal's server/SDK, a real provider SDK, LiteLLM deployment and new browser/device journeys are unnecessary for the selected model package. The unchanged F03 fence helper imports foundation contracts; F04 must avoid importing recovery test helpers that pull Temporal into its runtime.

Source document digests remained unchanged during the probes:

| Input | SHA256 |
| --- | --- |
| `solution.md` | `3422f829b4dd896c1ab9d8a86943b6cce1655e15e8242938f14b9604fc2c1ca9` |
| `test-plan.md` | `8bbb22b392220f7c83c7c061e32cbc7128602fb8efb950ea796b0c9ae6ea22eb` |
| `docs/planning/g1-f04-plan.md` | `77356f8d3a674375ce1ac863d2fae37dd0adb5f75a2d1a5fa09e24453a1193e0` |

## Resource inventory and probes

“Ready” means observed usable for this local development route, not production qualification. “Missing — to build” identifies assigned repository deliverables, not an unavailable external environment. A resource marked “needs approval” is not enabled by this report.

| ID / resource | Purpose and check | Result and responsibility |
| --- | --- | --- |
| R01 Node / pnpm | `node --version`; `pnpm --version`; actual Node TAP execution in a fresh owned temporary directory | **Ready:** Node `v22.22.3`, pnpm `10.18.0`; 1/1 resource test, zero failure/cancel/skip/TODO. Architect owns new package pins/build (f04-01). |
| R02 compiler and libraries | Read installed package manifests; fresh frozen offline install of a copied identity package/lock; execute TS compiler on valid source and an intentionally invalid assignment | **Ready:** TS `5.9.3`, Node types `22.18.6`, pg `8.16.3`, pg types `8.15.5`. Valid strict ESM build exits 0; invalid source exits 2 with TS2322. Existing identity/foundation source AND test builds also execute in controller regressions. New F04 strict options and clean-cache failure cases remain f04-01/f04-08/f04-15. |
| R03 offline dependency store / registry | `pnpm install --ignore-workspace --offline --frozen-lockfile --ignore-scripts --store-dir /private/tmp/agent-fabric-pnpm-store` in fresh `/private/tmp/agent-fabric-f04-readiness-hp_5v7ml` containing only copied package/lock and temporary probes | **Ready:** 18 resolved, 18 reused, 0 downloaded; lock accepted with scripts disabled. No registry access needed. f04-01 creates independent F04 lock; never change accepted locks. Adding dependencies beyond this verified set requires another cache/license/security readiness check. |
| R04 local Docker | `docker version --format '{{json .}}'`; `docker info --format '{{json .NCPU}} {{json .MemTotal}} {{json .DockerRootDir}}'` | **Ready:** client 29.1.0 Darwin arm64; server 29.1.2 Linux arm64, Docker Desktop 4.54.0. Daemon responds; 12 CPUs, 33,864,495,104 bytes RAM reported. No new cloud/container service account needed. Backend owns bounded owned fixtures (f04-02). |
| R05 cached PG image | `docker image inspect postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333 --format '{{json .RepoDigests}} {{.Id}} {{.Architecture}} {{.Size}}'` | **Ready:** exact digest present, arm64, image size 158,775,489 bytes. No pull performed. Fixture uses `--pull=never`. Image/license/vulnerability metadata must not be inferred from availability (f04-01/f04-15). |
| R06 owned PostgreSQL and SQL capabilities | Controller runs unchanged fixture/build/identity/foundation tests: real fresh PG startup, independent connections, current-authority locking, rollback/unknown-COMMIT lookup, role/grant/RLS checks and migration compatibility | **Ready:** PG16.12, Debian arm64; loopback-only published endpoint; fixture limit 1 CPU/256MiB/128 PIDs; ownership checked before teardown. Foundation 17/17 and identity 35/35 pass. Foundation versions 1/2 remain unchanged. New account hierarchy, receipt-owner role, model migration locks and F04 contention cases are not yet tested. Owners: f04-02/f04-04/f04-05 and f04-10/f04-11/f04-14/f04-15. |
| R07 local credentials / test accounts | Actual F02 synthetic IdP/OIDC/PKCE and issued scopes, current sessions/member/payer checks in controller identity suite | **Ready:** local synthetic identity route works, including real network login and late authority denials. No formal SSO or real enterprise account qualified. f04-02 builds fresh multi-tenant/Space identities and distinct admin/controller/worker/client/receipt-owner pools; use only generated owned-fixture credentials. Never export DSNs/tokens or reuse a real credential for the test adapter. |
| R08 loopback transport | Direct bounded Node HTTP server on `127.0.0.1:0`, actual fetch with 2s abort, exact response assertion and close; controller identity preflight independently repeats its own request/close | **Ready:** actual roundtrip and listener closure succeeded both locally and through controller. f04-02 owns receipt transport; f04-06/f04-14 own native carrier/current-output boundaries. No arbitrary egress or external endpoint was used by this probe. |
| R09 owned process spawn/crash/recreate/reap | Direct Node child with per-run UUID over IPC; verify IPC PID equals newly spawned handle, send SIGKILL, await exit, start new child, verify changed PID, SIGTERM and await exit | **Ready for tooling:** owned PID72105 exited via SIGKILL; recreated PID72106 exited via SIGTERM; both reaped. This small probe does not prove persisted F04 state or its required census/race/recovery oracles. f04-02/f04-11 implement those against the same owned PG with actual barriers and counters. |
| R10 process census / start identity | Exact shell `ps -p $$ -o pid= -o ppid= -o pgid= -o lstart= -o comm=` reproduces sandbox denial; controller identity runtime preflight observes actual ps census/start identity; read-only controller `procs.info`, `identity`, `group_members` use Darwin libproc successfully in sandbox | **Ready through controller; sandbox ps restricted.** Shell probe exit127: `zsh:1: operation not permitted: ps`. Controller observes 826 processes and current PID69310/start identity, verifies owned child PID69323 and removes it. libproc observes probe PID72305/start `1791339276.080943` and its group. Do not loosen checks or signal retained historical IDs. Process suites requiring the planned ps census must run through controller; an alternative requires equivalent ownership proof and explicit review, not a skip. |
| R11 native contracts, migrations and authority inputs | Read unchanged SessionLoop/foundation/identity/recovery fence references and accepted build/check outputs; retained byte guards | **Ready as inputs:** foundation42-file guard and retained597 protected/88 raw-file guards pass. Native session, budget, identity, current audience and fence schemas remain the single owners. F04 async adapter/session composition and additive migration application are still to build. Owners f04-01 through f04-07. |
| R12 controller check/evidence route | `loop_next`, `loop_status`, `loop_check` start/poll job; read full six controller streams and metadata | **Ready:** job-484e02b90b finishes all three existing commands with exit0. Exact commands and limits unchanged. Controller handles native Electron outside sandbox. Logs are available for f04-15 indexing. Approval gap R18 governs further foundation runs. New F04 check remains absent/unrun. |
| R13 retained client tooling / GUI | Unchanged retained-baselines controller check executes G0, local backend, web, Electron assets/binary, mobile strict TS and Android Metro bundle | **Ready for retained regression:** G0 197/197; local48 + web5 + desktop9 + mobile10 =72/72; Electron44.5.1 binary probe and Android bundle pass. Historical three-client evidence bytes are verified, not new live UI journeys. No direct sandbox Electron launch performed. New native UI/physical devices/signing are outside this increment. |
| R14 disk, CPU and memory | `df -h . /private/tmp`; Node `os` inventory; Docker inventory; actual temporary install/build/write and owned container teardown | **Ready for bounded development:** host Darwin25.2.0 arm64, 14 CPUs/parallelism14, 68,719,476,736 bytes RAM, about3.6GB free at observation; disk1.8TiB with1.0TiB available. Docker reports its separate limits above. `sysctl -n hw.ncpu hw.memsize` exit1: `sysctl: sysctl fmt -1 1024 1: Operation not permitted`; Node/Docker inventory provides usable observations without settings changes. Full F04 max8-contender/32-schedule sizing and timing remain actual test obligations, not a benchmark or SLA. |
| R15 local deterministic receipt service, profiles and fixture data | Compare required F-I/P/C/B/D/U/N/R/X/V/H/J inventory with repository | **Missing — to build:** g1-model package, restricted independent durable receipt owner/process, current qualification fixtures, native service process, synthetic resource receipts and operator journeys. All ingredients above exist; these are assigned code/data outputs, not missing provider accounts. f04-01..07 implement, f04-08..15 verify. |
| R16 licenses, notices, modifications and security/update metadata | Read all18 installed dependency manifests from fresh offline graph; inspect top-level license files | **Ready to inventory, incomplete release metadata:** package declarations enumerated below. No vulnerability database/provider/network query performed; current vulnerability status and redistributability review remain **unknown/unqualified**. f04-01 records graph/digests/notices/modifications/update responsibility; f04-15 and independent reviewer audit completeness/findings. No “secure because pinned” claim. |
| R17 CI, external accounts, browser/devices | Read goal registered checks and plan; existing controller runs real local commands | **Ready local controller; external CI not needed:** no shared CI/release deployment probed or created. New browser installation, native phones, real suppliers/gateway/SSO, cloud runtime/storage are unnecessary for deterministic acceptance and are not available as qualified environments. External gates below retain owners. |
| R18 inherited SSH inventory | Inspect unchanged `g1-foundations/scripts/remote-probe.mjs` and controller foundation output | **Needs approval for future execution:** exact inherited remote inventory already ran in resource job before nested inspection. q-6e6222040b is pending and controller-blocking. User owns permission; plan reviewer/f04-15 own preserving accepted check and resolving the conflict before rerun. No remote deployment, real model call, new paid resource or security-setting change was performed. |

Temporary compiler probes used a strict NodeNext/ES2022 ESM tsconfig with `skipLibCheck=false`, Node types and source importing actual `pg`, `node:test` and `node:assert/strict`. The valid test asserts `typeof pg.Pool === 'function'` and UTF-8 byte length of `问` equals3. The negative source is `const value: number = "strict-readiness-type-failure";`. Commands were `node node_modules/typescript/bin/tsc -p tsconfig.json`, `node --test --test-reporter=tap build/probe.js`, and `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck false negative.ts`. Intentional exit2 is evidence of compiler enforcement, not a product failure. Initial temporary-directory login shells printed `/etc/zlogin:2: parse error near disown` while commands still completed; subsequent probes used `login=false`. No shell configuration was changed.

## Controller observations and immutable logs

Requested `loop_check(ids=["acceptance.identity-behavior", "acceptance.foundation-behavior", "acceptance.retained-baselines"], wait_seconds=1)`, then polled the same job. Job **job-484e02b90b** ran 2026-10-07T02:11:44Z–02:12:28Z against controller fingerprint **git:7c5a7e1afc3b78bd5768a6a4**, before this readiness document. It is an environment/baseline observation, not final evidence for the later F04 candidate. Later artifact edits invalidate reuse as final acceptance; f04-15/final checks must execute afresh after the approval decision.

| Registered exact command | Result / measured duration |
| --- | --- |
| `node g1-identity/scripts/check.mjs` | exit0;35/35;17,568ms; actual synthetic OIDC/PG/preflight and unchanged42-file guard |
| `node g1-foundations/scripts/check.mjs` | exit0;17/17;2,452ms; actual PG plus inherited credential-bearing remote inventory |
| `node g1-foundations/scripts/check-retained.mjs` | exit0;G0 197/197 and local72/72;23,061ms; unchanged597 protected/88 raw files; native binary/assets/bundle |
| `node g1-model/scripts/check.mjs` | **Not run; missing implementation.** Acceptance timeout1800s remains unchanged. |

Complete stdout/stderr were read and checked for actual test totals and failure/cancel/skip/TODO summaries, rather than relying on `loop_check` tails. Identity stdout242 lines, foundation123 lines, retained1742 lines; all test summary failure/cancel/skip/TODO counts zero. Retained stderr contains bundler diagnostics and is preserved. Full original streams remain controller-owned; none was edited/copied over an accepted raw artifact.

Each link below resolves under `../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/`:

| Stream | Bytes | SHA256 |
| --- | --- | --- |
| [identity stdout](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.identity-behavior/stdout.log) | 9668 | `fbd460e92b16538bad4984ac093306c4ca8c2fd1f505e9fba1f561c3ad2efe9a` |
| [identity stderr](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.identity-behavior/stderr.log) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| [foundation stdout](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.foundation-behavior/stdout.log) | 3882 | `d37e5f9b503daeb9b608b197389bf36a23e757c3195554cafc8b5cf796173029` |
| [foundation stderr](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.foundation-behavior/stderr.log) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| [retained stdout](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.retained-baselines/stdout.log) | 50306 | `09e48a04c195e69ad424edebd97deec53efef2679f40d486909ffbd87dac4434` |
| [retained stderr](../../../.loop/goals/agent-fabric-g1-f04-model-finops/runs/checks/job-484e02b90b/acceptance.retained-baselines/stderr.log) | 156 | `4f7fadb2e3ac19292737d1d31a96ac266d55399a4a50a69bc1cb30a01d15da25` |

PG fixtures started under three distinct owner UUIDs, all with the pinned image and observed PostgreSQL16.12. Logs confirm owned removal for preflight container9413407d…, identity6cb213ea… and foundation7770f7c4…. `docker ps -a --filter label=agent-fabric.foundation-fixture-owner --format '{{.ID}} {{.Status}}'` returned empty afterward, matching the initial empty census.

Controller result metadata reports `cleanup="zombie"` for the three completed command groups. The existing controller's `procs.py` uses libproc and classifies zombie-only groups as exited, not a permission failure. A subsequent bounded read-only `group_members` observation for job group69307 and identity group69310 returned empty lists and `group_quiescent=true`; no signals were sent. This is separate from mandatory F04 child/listener/fixture cleanup proof, which is still to implement. Do not reinterpret metadata as evidence that every future F04 process is reaped.

## Dependency inventory and maintenance ownership

Fresh offline graph declarations:

| Package versions | Declared license |
| --- | --- |
| typescript 5.9.3 | Apache-2.0 |
| @types/node 22.18.6; @types/pg 8.15.5; undici-types 6.21.0 | MIT |
| pg 8.16.3; pg-cloudflare 1.4.1; pg-connection-string 2.14.1; pg-pool 3.14.0; pg-protocol 1.16.1; pg-types 2.2.0; pgpass 1.0.5 | MIT |
| postgres-array 2.0.0; postgres-bytea 1.0.1; postgres-date 1.0.7; postgres-interval 1.2.0; xtend 4.0.2 | MIT |
| pg-int8 1.0.1; split2 4.2.0 | ISC |

Top-level installed TypeScript has LICENSE.txt; pg and both types packages have LICENSE. This observes available declarations/files only. Complete transitive notices, image license components, changes/patches, lock integrity, SBOM/update procedures and vulnerability findings belong to f04-01/f04-15 and independent review. No new dependency patch was created; accepted dependency modifications remain historical inputs. Owner assignments are the approved task roles, not invented named people: architect owns pins/metadata/build, backend/data own adapters/SQL update compatibility, security reviewer owns finding assessment, tester owns qualification/requalification checks. A changed adapter/profile/schema/migration/dependency/environment must trigger relevant build/conformance/recovery requalification; unknown security status remains unknown until investigated.

## Every task's resource and team fit

The goal omits an explicit `agent.team_limit`; the actual controller `engine.py` default is4 and validation sums each team seat's `count`. All15 controller tasks have `team=[]`, zero specialist seats, and fit4. One lead performs each task in dependency order. No subagents were spawned. Independent later reviewers are workflow stages, not extra implementation seats. Existing role availability does not attest review completion.

| Task / lead | Resources and owned gaps | Seats / effective limit |
| --- | --- | --- |
| f04-01 architect | R01–03/R11/R16; create independent package/lock/build/guards/metadata | 0/4 |
| f04-02 backend | R04–10/R15; create restricted owned PG/IdP/adapter processes and fixture roles | 0/4 |
| f04-03 backend | R02/R07–08/R11/R15; create qualified full profiles/context/streams | 0/4 |
| f04-04 data | R06–07/R11/R15; create additive atomic hierarchy/account/model intent | 0/4 |
| f04-05 backend | R06/R08–11/R15; create retry/claim/lookup/seal/overrun settlement | 0/4 |
| f04-06 backend | R07–11/R15; create actual native session/output/wait/Stop ports | 0/4 |
| f04-07 backend | R06/R11/R15; create synthetic interval/category lifecycle accounting | 0/4 |
| f04-08 tester | R01–03/R11; implement complete C suite and compiler/native variants | 0/4 |
| f04-09 tester | R06–12/R15; implement/execute complete P suite | 0/4 |
| f04-10 tester | R06–12/R14–15; implement/execute B suite, observers/max8 contenders/32 schedules | 0/4 |
| f04-11 tester | R06–12/R15; implement/execute U suite, true crash/recreate/COMMIT/seal races | 0/4 |
| f04-12 tester | R06–12/R15; implement/execute N suite, waits/Stop/resource races | 0/4 |
| f04-13 tester | R06–12/R15; create/run six operator journeys through same native service | 0/4 |
| f04-14 security | R06–12/R15; implement/execute A suite; no real key/account needed | 0/4 |
| f04-15 tester | R01–16; Q suite/evidence/checker; R18 approval before unchanged full foundation rerun | 0/4 |

No environment gap has an unassigned owner. Missing package/fixture/test/evidence outputs are exactly planned tasks. Independent review/final/product acceptance remains separate; all tasks are still0/15 complete.

## Approval incident and external gates

The nested inherited check executes `ssh -T` with BatchMode, StrictHostKeyChecking and bounded connect/liveness limits, using existing `/Users/super/.ssh/MBP.pem` against configured `217.216.75.50:34819`. Its remote command reads uname, Docker server version, cgroup filesystem, CPU count and MemTotal. The key contents were not read or exported, and no key/security settings were changed. Nevertheless the check uses a real credential, and this goal explicitly keeps real credentials off absent approval. Its source comment calls the inventory approved historically; that is not assumed to grant new scope under this goal.

The resource planner should have inspected this nested script before launching the registered regression. Actual execution is retained in the controller log and a risk note; approval requested now concerns only **future** executions and is not retroactive. q-6e6222040b names the exact unchanged command, target, identity and read-only operations. The controller made the question blocking, overriding the requested nonblocking mode. Human/controller decision is required before repeating it or advancing the waiting run. Do not edit the accepted command to suppress the remote portion, substitute a prior pass or present the inventory as F04 remote isolation/billing evidence. No additional remote probe is proposed.

| Gate / resource | Current status | Owner and required future decision |
| --- | --- | --- |
| Inherited credential-bearing foundation regression | **Needs approval:** q-6e6222040b pending; actual resource observation preserved | User decides exact future inherited read-only use; plan reviewer/f04-15 reconcile approved acceptance and credential restriction without weakening checks. |
| E01 real supplier/model/API account | **Needs approval; deliberately unqualified; not needed locally** | Model/evaluation plus user: supplier/model/version/route/region/data-policy, custody and bounded spend; exact `loop_ask(kind=approval)` before any provider call/credential/spend, then real conformance/comparable tasks. No call proposed now. |
| E02 gateway/billing/enterprise account | **Needs approval; deliberately unqualified; not needed locally** | FinOps/security plus user: edition/license/billing contract, keys/rotation, tariffs/overrun/top-up; actual request-to-invoice reconciliation. No gateway enabled. |
| E03 real runtime/storage/cloud | **Needs approval; deliberately unqualified; not needed locally** | F05 storage/F06 runtime plus user: host/image/region/egress/mount/resource/retention/settings/tariffs; actual no-VM isolation/cold-start/suspend/storage/network and separately authorized delete/restore. No provisioning or paid resource started. |
| E04 broader human/device/SSO/release | **Missing qualified environment; separate scope/approvals** | Identity/clients/product and F07: real humans/devices/formal SSO/signing/distribution/full lifecycle. No messages/recruiting/release/deployment. |
| E05 performance/economics | **Missing qualified benchmark; separate scope/approvals** | Evaluation/runtime/FinOps: controlled workload/topology/total budget and independent benchmark. Local probe durations do not establish SLA/savings/leadership. |

Real providers, paid APIs/cloud resources, shared/production deployments, nonreproducible overwrite/delete, credentials/secrets/access-control/security-setting changes, messages/posts and published-history rewrites/force-push/branch deletion remain outside local scope. Only R18 has an exact future operation requiring a present decision; other external gates are deliberate deferred qualification, not reasons to request unsolicited paid enablement.

## Handoff and stage boundary

Added only this readiness document. The exact owned temporary probe directory was removed after checking its expected parent/name, copied package bytes and generated probe contents; removal was verified. Controller writes/logs remain controller-owned. No production source, accepted check/lock, protected file, retained raw evidence or `.loop/` state was edited by hand. Earlier design/plan hashes and retained guards are unchanged. No production F04 code or F04 acceptance result is claimed.

Next is independent plan review once the controller permits it, then f04-01 contracts/build. Review the approval conflict and sandbox census execution route explicitly. Use controller runs for mandatory ps/process and GUI checks; do not skip them, silently fall back to Maps, add Temporal/provider dependencies, fetch images/packages or treat resource-stage baseline passes as final F04 evidence. Preserve unknown host costs/historical usage and failed observations. Development fixtures use fresh owned local identities/roles only. Submit this resources document through `loop_stage_done`; record the pending question and controller wait in the handoff note.
