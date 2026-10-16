# G1-F06 resource readiness

Date: 2026-10-16 Asia/Singapore (probes recorded 2026-10-15 UTC). Stage: resources. Role: resource planner. Candidate: current dirty repository; unrelated F05 work preserved.

> Turn 11 supersession: the primitive probe results below remain historical diagnostics. The rejected generic lock order and original task/seat table are NOT current architecture/readiness approval. Use [solution §§5.1,6.1,11.1](solution.md) for the resolved owner protocol, Plan bridge and replacement task checkpoints; the next resources stage must reassess the regenerated plan. No resource probes or raw results were changed.

## Decision and evidence boundary

**Conditional GO for plan review and Docker-free local development, beginning with f06-01.** The pinned compiler, dependency installation, SQLite transactions across processes, loopback HTTP, shell, stdio and live owned-child termination work. Two setup gaps found by actual probes were resolved: incomplete offline dependency cache and missing ES2024 library declarations in the diagnostic compile. The process census remains unavailable inside the Codex sandbox and needs a controller execution gate before census-dependent checks. Every remaining gap has a task owner below.

This is resource readiness, not product acceptance. No F06 production code, product tests, current-build runtime qualification or independent verdict exists yet. `g1-runtime/` and the F06 acceptance document are planned development outputs and are currently absent. PostgreSQL integration, preserved behavior regressions and remote Linux/browser qualification remain outstanding. No task is marked done by this report.

Read: [brief](product-brief.md), [solution](solution.md), [test design](test-plan.md), [task snapshot](task-plan.json), [implementation plan](../../planning/g1-f06-plan.md), [roadmap](../../planning/roadmap.md), [foundation sequence](../../planning/g1-foundations-plan.md), [ledger](../../planning/g1-remaining-ledger.csv), master specification §§2,5,10,12–14,21,29,31, and [F02 evidence](../../evidence/g1-f02-acceptance.md). The master is [here](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md). Historical passes are context, not current resource or qualification receipts.

Resource diagnostics, with full command arguments and child stdout/stderr where captured:

- [Initial probe source](resources-turn9/probe.mjs) and [results, including failures](resources-turn9/results.json): `node docs/loop/agent-fabric-g1-f06-runtime/resources-turn9/probe.mjs`.
- [Remediation/recheck source](resources-turn9/recheck.mjs) and [results](resources-turn9/recheck-results.json): `node docs/loop/agent-fabric-g1-f06-runtime/resources-turn9/recheck.mjs`.
- [Owner dependency cache results](resources-turn9/owner-dependency-results.json): copied identity package/lock into fresh owned temporary directories; exact install arguments and original offline failure retained.
- [Read-only audit source](resources-turn9/audit.py) and [audit results](resources-turn9/audit-results.json): `python3 docs/loop/agent-fabric-g1-f06-runtime/resources-turn9/audit.py`.

These files are manual diagnostic records, not controller-owned acceptance evidence. Listed commands identify the original invocations; the retained diagnostic sources now refuse to overwrite their existing result files. Use a new output location for a new run. Do not rerun the cache-populating recheck as an offline acceptance preflight. Development checks must use frozen, offline, script-free installation and fail missing prerequisites. Original failures remain in separate records.

## Resources checked

Statuses: **ready** means the stated bounded observation succeeded; **missing** means unavailable or not implemented for that purpose; **needs approval** means a human restriction prevents that use. A ready library or protocol primitive does not establish the product's behavior.

| Resource / purpose | How checked and actual result | Status / owner and limit |
| --- | --- | --- |
| Node execution and native tests | `node --version`: v22.22.3; executable `/Users/super/.hermes/node/bin/node`; built-in SQLite, HTTP, crypto, monotonic clock and child APIs execute. | ready for local implementation; f06-01 must enforce the same pin in snapshots/controller runs. |
| pnpm and compiler | `pnpm --version`: 10.18.0; installed `typescript/bin/tsc --version`: 5.9.3. Root and five owner packages resolve TS5.9.3 / `@types/node`22.18.6. | ready; preserve exact locks, create additive F06 lock in f06-01. |
| Strict owner compilation | Initial no-emit compile with ES2023 library failed TS2550 on `String.isWellFormed` in F04/F05. Recheck with target ES2023, **lib ES2024**, strict NodeNext, exact optional properties, unchecked indexing and library checking enabled returned exit0. Node confirms `isWellFormed` exists. | ready at import/compile level; f06-01 adopts existing F04/F05 library settings, without predecessor edits or weaker checking. |
| Public registry / compiler cache | Fresh frozen offline root-template install initially failed `ERR_PNPM_NO_OFFLINE_TARBALL` for `undici-types-6.21.0.tgz`. Bounded frozen script-free public-npm install populated only pinned dependencies; another fresh offline install passed with downloads0. | ready for this pinned template. Standing local-dependency approval used; no credentials or paid resource. |
| PostgreSQL client dependency cache | Installed owners resolve `pg`8.16.3 / `@types/pg`8.15.5. Fresh identity-template offline install exposed missing `pg-protocol-1.16.1.tgz`; bounded public-npm cache fill followed by fresh frozen offline install passed. | ready for identity-template dependencies. This does not establish all inherited web/mobile/Temporal caches; owners audit those before respective checks. |
| Existing owner modules | Actual type-only imports compiled against SessionLoop, foundation UoW, F02 authority, F03 effect repository, F04 native exports and F05 owners/Ask/artifact repository. Source exports and transaction/lock methods inspected. | ready as installed source dependencies. New composition/borrowed-transaction compatibility is implementation work, owned by f06-01/02/13; not behaviorally certified. |
| SQLite durable fixture | Node22 built-in SQLite opened an owned WAL DB; parent `BEGIN IMMEDIATE` blocked an independent writer with SQLite error5; after commit a new child read the original row, committed its row, and parent observed two rows. DB closed and owned directory removed. ExperimentalWarning retained. | ready for local F5 fixture; f06-03. No PostgreSQL locking/RLS equivalence claimed. |
| Target/repository/scratch fixtures | Actual temporary file write, atomic rename, symlink alias and byte read succeeded; directory removed. | ready for owned fixture construction; f06-01/03/04. Canonical version/CAS/security behavior still to implement and test. |
| Owned network services | Actual server bound `127.0.0.1:0`, fetch returned HTTP200 and expected body, listener closed. Two-second request deadline. No shared service or fixed-port dependency. | ready for synthetic IdP/API/target/allocator/egress observers; f06-02/04. No real egress containment claim. |
| Shell / SDK / stdio transport | `/bin/sh -c 'printf synthetic-owned-shell'` succeeded; separate Node child exchanged a JSON-RPC-shaped stdio message. | ready as primitives for f06-04. Actual MCP tool descriptors, protocol/dispatch/refusal suites must be implemented; no MCP support pass inferred from echo. |
| Owned child lifecycle | A fresh Node child emitted readiness and exited on SIGTERM through its live ChildProcess handle; observed exit signal retained, bounded kill fallback installed. | ready for this child only. Birth/nonce census, descendants, watchdog and safe process-group control remain f06-01/05/10 obligations. |
| Process census | Exact `spawnSync('ps',['-p','66490','-o','pid=,ppid=,pgid=,lstart=,comm='])` returned `spawnSync ps EPERM`, no stdout/stderr. Separate shell `ps` also returned operation not permitted. | missing in sandbox, reproduced. f06-01 must fail affected preflight and use controller-run checks outside sandbox. Never omit census, trust stored PID, broaden settings or claim quiescence. |
| CPU/RAM/disk | Node reports 14 available logical CPUs, 64GiB total RAM, about8.5GiB free at observation; load averages4.11/3.34/3.37. `df -h` reports about1.1TiB available on shared APFS volume. `sysctl -n hw.ncpu` and `sysctl -n hw.memsize` each returned exit1, `sysctl: sysctl fmt -1 1024 1: Operation not permitted`. | ready for bounded local development via Node observations; direct sysctl unavailable in sandbox. No idle-machine/timing qualification; f06-10 must acquire measurement guard and check current load/census. |
| Native PostgreSQL binaries | Read-only `psql --version`, `postgres --version`, `initdb --version` each report16.11 Homebrew. No cluster initialized, service started, existing server connected to or account inspected. | binaries ready; actual P environment missing. f06-13 may assess a project-owned non-Docker cluster later; this cannot satisfy unchanged Docker-backed regressions or waive their restriction. |
| Docker / containers / PG fixture | Read-only source audit finds identity preflight invokes Docker inspect/ps and `withPgFixture`; foundation imports the same fixture with Docker run/inspect/rm. | needs approval: human no-Docker decision must be lifted before these uses. **No Docker CLI/version/daemon/container probe ran.** f06-13/15 remain pending. |
| Browser / emulator / input | Reviewed selected profile: ordinary browser launch, sensitive auth, GUI, input/takeover, clipboard/export/download/recording refused. No browser, personal profile, other app, emulator or device was operated or discovered. | no browser dependency needed for initial local refusal profile. f06-06/08 must prove actual pre-exposure refusal. Browser process/cookie/input/telemetry isolation missing and unqualified; f06-14 owns future X07/X08. |
| Preserved Electron/client regression | Source graph reaches actual installed Electron version probe, web build, mobile Metro bundle and retained UI/load validators; default mobile path does not request native emulator execution. | controller execution required outside sandbox; not run here. f06-12 audits eligibility/caches, f06-15 retains full original results. Current GUI execution is not certified by historic F02 pass. |
| Loop controller / check route | `loop_next`, `loop_status` and `loop_note` succeeded; `.mcp.json` points to installed controller. Controller source confirms team-limit default4. | ready as orchestration interface; no new controller check job launched in resources. Actual current-candidate check receipts remain f06-12/15 and later stages. |
| Hosted CI / release runner | Read-only repository audit found no `.github/workflows` files. Local Loop is the available acceptance runner. | missing hosted CI; not required for initial local work. f06-09 owns release materials; no hosted run, paid service or external publication assumed. |
| Local accounts / model / APIs | Test plan requires synthetic tenants/sessions/IdP, deterministic local model, owned target and canaries. No real account/provider route required; no secrets read. | ready design inputs, fixture implementation f06-02/04. Paid models/product APIs, real credentials and people/messages remain approval-gated and unused. |
| Linux/OpenShell/KVM/image | Host is macOS26.2 / Darwin25.2.0 arm64, not a qualified Linux worker. No authorized remote host, architecture, backend binary, guest image or virtualization evidence. | needs approval and missing qualification. f06-14. Proposed OpenShell MicroVM is a design only; exact version/digest/image/topology cannot be pinned from local observations. |
| Single real VM / provider costs | Only fixture allocator and synthetic usage are planned locally; no provider inventory, resource collector, invoice or settlement account exists for this goal's tests. | needs approval for real resources; f06-14. No real single-VM or billing claim, no bootstrap/extra-login VM permitted implicitly. |
| Independent verifier / relay / protected mounts | Local test-verifier, canaries and receipt gates are planned; no approved remote verifier identity, relay grants, mounts, signing keys or protection settings. | local implementation f06-09; external resources need approval in f06-14. Worker self-report cannot fill this gap. |
| Physical devices / hardware / formal SSO | Not required to construct the L profile; whole-product/device/hardware/real-credential qualification is explicitly excluded from local evidence. | missing and unqualified; preserve F07 and other owners, do not acquire or operate other devices/apps. |

## Check dependency audit and execution gates

The original four acceptance commands and their budgets remain unchanged:

| Command | Current readiness / transitive dependency |
| --- | --- |
| `node g1-runtime/scripts/check.mjs` | missing by design until f06-01/11. Must build source AND tests and run all nine suites /127 mandatory local case IDs. Its future process census must pass in the actual runner. No Docker import, fixture, CLI or fallback allowed. |
| `node g1-identity/scripts/check.mjs` | needs approval to lift Docker prohibition. Preflight calls Docker even with `--runtime-preflight`; do not invoke it now. |
| `node g1-foundations/scripts/check.mjs` | needs approval to lift Docker prohibition. Uses Docker PostgreSQL fixture and a remote-probe policy guard. Do not invoke it now. |
| `node g1-foundations/scripts/check-retained.mjs` | Source audit: frozen byte guards → G0-14 → G1-local final → web/desktop/mobile/verify. No Docker dependency found in inspected reachable scripts/tests; Electron probe mandates controller outside sandbox. Retained UI/load commands validate existing artifacts; they do not perform new personal-app interaction. Eligible for controller audit/run in f06-12, actual full result still pending f06-15. Missing cache/native binary must fail visibly, not trigger an unapproved fallback. |

f06-01–06 component commands, f06-07 functional component, f06-08/09 suite commands and f06-10 timing command are future Docker-free entrypoints, not runnable resources today. f06-11/12 full local commands must retain all nine mandatory suites. Their helpers need transitive audit during implementation; today's review of a proposed command cannot prove code that does not exist is Docker-free. `check-owners.mjs` (P01–P05) requires actual eligible owners/PG; `check-remote.mjs` (X01–X10) requires later authorization before any connection. Their deny-first local guard tests never complete those real tasks.

The finite L suite cannot qualify hostile arbitrary-code/macOS containment, PG locks/RLS/COMMIT, actual Linux mount/process/resource/egress isolation, VM inventory/cost or browser authentication. Same-UID local access limitations must stay visible, with arbitrary execution unsupported. Preserve every P/X obligation and actual independent post-development review; no task or requirement is waived.

## Ownership, transaction seams and evidence preparation

Existing seams are present, but an installed source export is not an already working F06 adapter. `AuthenticatedUnitOfWork` locks/rechecks the original session around the foundation transaction. `EffectRepository` retains original operation identity and permits only its existing API mutation adapter; it cannot be relabeled a Linux executor. F04 resource receipts remain deterministic-local-only. F05 artifact/Ask paths remain under their existing repository owners and its aggregate qualification remains pending.

**Historical order withdrawn by PR-F06-02; retained as the rejected readiness claim, not an implementation instruction.** The original text required: Before any real F06 SQL mutation, f06-01 (architect) must freeze the complete composed lock graph: foundation/current identity → existing Space barrier → F06 assignment and sorted canonical resource set → compatible existing run/operation/resource, exact-approval, allowance and artifact owner locks, with command-key locking independent of payload digest. This is an order-design obligation, **not a claim that arbitrary owner calls can be nested in that order**. Existing F03 paths acquire phase/run locks internally and F05 owns staging/epoch locks. f06-13 (data/backend) must prove a compatible borrowed-transaction sequence and independent-session races; refuse an incompatible seam instead of holding F06 locks while opening a second owner transaction. Fresh DB time and authority checks after waits remain mandatory. Local SQLite serial transactions do not discharge this gap.

f06-01 owns nonce-created fixture roots, synthetic canaries, child identity protocol and protected snapshot comparison. Cleanup can remove only resources created by that invocation, with current identity checks before process signalling; unknown ownership/quiescence must retain residue and fail. Today's probe used only fresh temp roots and a live owned child handle, closed the listener/DB and removed its roots. It did not signal groups, touch personal data or assert descendant quiescence.

f06-09/11/12 own complete stdout/stderr byte counts/digests, current source/build/lock/check/environment pins, results bound to actual suite/case/child/nonce, cleanup census, exhaustive status matrix, timing raw samples and controller job references. The resource records do not mint those receipts. No exact Linux/browser support row may be marked tested from these probes; no empty version, placeholder digest or absent external check may grant a capability.

The read-only hash diagnostic found **597/597 retained files unchanged (including88 raw files)** and **42/42 accepted foundation files unchanged**, using the existing check constants without running their executables. This establishes bytes only. [Audit results](resources-turn9/audit-results.json) also retain the current unrelated modified F05 file hashes; do not overwrite them. These snapshots must be compared again by development checks. No accepted guard, protected source, raw evidence or F05 file was edited. No freeze/re-freeze was performed in resources; broad standing approval already covers a necessary scoped future re-freeze, which must still be recorded.

## Team and budget fit

The current goal omits `agent.team_limit`; controller `engine.py:596` applies **4**. It validates the sum of specialist counts per task. The legacy-v1 policy's max_parallel2 is historical, not this pipeline's limit. Current host provides four collaboration slots including the coordinator: each largest team of3 specialists plus coordinator fits4. No sub-agent was needed or spawned in resources. Empty team lists mean the lead works alone, not zero staffing.

| Task | Specialist seats | Check ceiling total | Fit / scheduling |
| --- | --- | --- | --- |
| f06-01 | 3 | 180s | fits; contracts and resource preflight first |
| f06-02 | 3 | 180s | fits |
| f06-03 | 3 | 180s | fits |
| f06-04 | 3 | 180s | fits |
| f06-05 | 3 | 180s | fits |
| f06-06 | 2 | 180s | fits |
| f06-07 | 3 | 300s | fits |
| f06-08 | 3 | 300s | fits |
| f06-09 | 2 | 240s | fits |
| f06-10 | lead only | 600s | serial measurement; no other build/check/team work |
| f06-11 | 3 | 900s | fits; full runner includes serial timing |
| f06-12 | lead only | 900s | controller local evidence |
| f06-13 | 3 | 600s | conditional actual P environment |
| f06-14 | 3 | 900s | approval withheld; environment-dependent |
| f06-15 | lead only | 1780s | conditional unchanged final regressions |

Task teams are alternatives within a turn, not permission to launch all ready teams simultaneously; fit aggregate active seats within the controller/host limit and coordinate shared files. f06-10 and every full-run measurement must remain serial with an exclusive guard and fresh idle-context assessment; current machine load is not evidence of an idle run.

Controller status: iteration9, eight prior turns; max_iterations=null and max_hours=null. No finite remaining goal turn/hour cap is configured. Turn timeout is120min, controller check ceiling3600s; largest planned individual task check900s, largest task aggregate1780s (~29.7min), all18 task check ceilings total7600s (~2h6m40s) across multiple turns, excluding implementation/repairs. Original four acceptance ceilings are1800/600/600/900s, total3900s (65min); each fits controller ceiling and total fits120min before additional work. Keep long checks in their own turn with overhead margin. Stage reviews/repairs and eventual remote setup are additional, not included estimates or waived budgets. There is no evidenced numeric budget conflict, so no amendment is requested. Environment approvals can block completion indefinitely; unlimited configured hours do not grant spending or resources.

## Remaining gaps and next gate

| Gap | Owner / resolution before use |
| --- | --- |
| F06 package, strict build, registry/fixtures and actual suite commands absent | f06-01 architect/backend/tester create them; this is planned output, not pre-existing tooling. Keep initial dependency pins/ES2024 libraries and original guards. |
| Sandbox process census denied | f06-01 preflight and f06-12 controller runner must reproduce a successful actual census outside sandbox. A failed census blocks affected execution/cleanup claims; no settings change or synthetic substitute. |
| Native composition/borrowed transaction and full lock order unproved | f06-01 freezes installed owner adapters; f06-02/03 integrate local seams; f06-13 proves real P01–P05. No copied authority/parallel budget ledger. |
| Measurement and complete raw-result runner absent | f06-10/11 implement declared100 warm samples,30 Stop trials, actual1s/30s expiry, required race schedules, binding and cleanup gates. Current primitive probes do not satisfy them. |
| PG real owners / original Docker regressions unavailable under restriction | f06-13/15 retain pending status. Native binaries are not service/role/transaction proof. If eligible local work is exhausted, ask human through Loop before prohibited work; never invoke Docker to reproduce a known policy prohibition. |
| Inherited cache/native GUI/current regression evidence not established | f06-12 performs fresh transitive/cache audit and eligible unchanged retained check through controller; f06-15 keeps all original final regressions. Other-app operation is not authorized by this resource report. |
| Remote host, access, limits, exact OpenShell/image/KVM/control/verifier/cost resources absent | f06-14 remains unapproved. Human question q-a1b6151885 is already answered **“Keep remote testing unapproved; continue local work only,” approved:false**. No duplicate request now. A future change must explicitly authorize host/provider/image/arch/access, isolation/security actions, destinations, one-VM/bootstrap inventory, resource/spend/window and cleanup/retention limits before any remote discovery or action. |
| Actual browser/profile/cookie/input/telemetry isolation unavailable | f06-06/08 implement tested refusal only; f06-14 keeps X07/X08 unqualified and disabled unless separately supported, authorized and fully tested. No headless/browser dependency is added implicitly. |
| Independent security/code/final/product acceptance absent | Later controller stages alone issue verdicts. f06-15 hands over actual evidence and lists these decisions pending. |

No new approval question is necessary while authorized local work remains. No Docker command, GUI app, remote test host, paid API, real credential, security setting, communication, shared deployment or destructive history/data operation was used. Public pinned dependency downloads used existing standing local-install authorization only. Submit this readiness report to the controller for plan review; keep the external and inherited-regression gates visible throughout implementation.
