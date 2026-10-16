# Loop · agent-fabric: G1-F06 runtime

**RUNNING** — Turn 41: test_design — Design the test cases that will prove every requirement, before development. (revise after plan_review findings)

- Goal `agent-fabric-g1-f06-runtime` · kind **develop** · updated 2026-10-16T00:39:31+00:00
- Next: **test_design** (agent) — Design the test cases that will prove every requirement, before development. (revise after plan_review findings)
- Runner: running · pid 53704 · adapter codex
- Turns 41 · agent time 408.0 min · reported cost $0.00 (partial: some turns reported no cost)

## Working on

- `f06-08a` Install additive PG schema and atomic queue keys · checks 0/1 · 5 recent turns · last (turn 34): Completed the recovery pilot: 18 real negative/recovery journeys passed, plus 25 regression assertions.

Progress: **12/67 tasks done**. PostgreSQL 08a remains source-only under the no-Docker restrict
- `f06-06c` Verify local settlement authority receipt and quiescence · checks 0/1 · 1 recent turns · last (turn 34): Completed the recovery pilot: 18 real negative/recovery journeys passed, plus 25 regression assertions.

Progress: **12/67 tasks done**. PostgreSQL 08a remains source-only under the no-Docker restrict

## Pipeline

● intake → ● requirements → ● requirements_review → ● solution → ◐ test_design → ○ plan → ○ resources → ○ plan_review → ○ develop → ○ test → ○ reviews → ○ final-acceptance → ○ product-acceptance → ○ done

- intake: docs/loop/agent-fabric-g1-f06-runtime/product-brief.md
- requirements: 101 recorded · final
- requirements_review: pass (round 1)
- solution: docs/loop/agent-fabric-g1-f06-runtime/solution.md
- test_design: pending
- plan: 70 tasks · 0 uncovered
- resources: pending
- plan_review: fail (round 4)
- develop: 14/70 tasks
- test: integration:-, regression:-, regression:-, regression:-
- reviews: security:-, code:-
- final-acceptance: pending
- product-acceptance: pending

## Objective

Deliver the G1-F06 increment of Agent Fabric G1: Authorized remote test deployment, qualified Linux image and protected worker/tool/egress boundaries (shell/SDK/browser/MCP/egress containment, intent ceilings, single-VM lease queueing, isolated browser profiles). Supervised local development cannot issue this qualification.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-13: 所有开放工具路径无法绕过运行时策略 — remaining: 拒绝/能力丢失fixture；实际shell/SDK/browser/MCP/egress containment
- UX-03: Ask/Plan不修改目标服务器或仓库 — remaining: intent ceiling与target-write拒绝fixture；实际请求无目标修改
- UX-07: 冲突文件或desktop lease明示排队不偷偷多开VM — remaining: 冲突lease/owner/wait契约；实际single-VM冲突队列与费用
- UX-10: 敏感登录真实隔离profile cookies input或阻止 — remaining: unsupported拒绝fixture；实际跨进程browser profile/cookies/input/telemetry隔离

Create g1-runtime/ with a build and g1-runtime/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f06-plan.md and docs/evidence/g1-f06-acceptance.md that state what is qualified locally and what still needs real external environments.

## Tasks (14/70 done)

- – `f06-01` Freeze owner-bound contracts and strict runtime package primitives · 1×architect + 1×backend + 1×tester
- – `f06-02` Implement native intent admission and Plan bridge fixture journey ← f06-01 · 1×backend + 1×tester
- – `f06-03` Implement durable local queue, single assignment and fixture usage ← f06-01 · 1×data + 1×backend + 1×tester
- – `f06-04` Implement bounded tool and egress paths with actual observers ← f06-01, f06-02, f06-03 · 1×backend + 1×backend + 1×security
- ● `f06-05` Implement sensitive browser and input refusals ← f06-02b · security
- – `f06-06` Compose continuation, Stop and recovery with serial pilot timing ← f06-02, f06-03, f06-04, f06-05 · 1×backend + 1×tester
- – `f06-07` Close local qualification materials and strict full harness evidence ← f06-01, f06-02, f06-03, f06-04, f06-05, f06-06 · 1×devops + 1×tester + 1×tester
- – `f06-08` Implement additive PG runtime schema and scoped queue persistence ← f06-01, f06-03 · 1×data + 1×tester
- – `f06-09` Install safe fence composition, original effect settlement and atomic transfer ← f06-02, f06-04, f06-06, f06-08 · 1×backend + 1×backend + 1×tester
- – `f06-10` Integrate real-format usage receipts with the existing allowance family ← f06-03, f06-08, f06-09 · 1×backend + 1×tester
- – `f06-11` Implement the linked Plan maintenance bridge on real F05 and close owners ← f06-02, f06-08, f06-09, f06-10 · 1×backend + 1×backend + 1×tester
- – `f06-12` Pin the exact backend API, image and approved environment contract ← f06-07, f06-11 · 1×architect + 1×devops
- – `f06-13` Implement pinned Linux lifecycle and single-assignment backend ← f06-12 · 1×devops + 1×backend + 1×tester
- – `f06-14` Verify deployed boundaries, journeys, costs and serial timing ← f06-11, f06-13 · 1×tester + 1×security + 1×devops
- ○ `f06-15` Run unchanged regressions and hand off current evidence ← f06-07c, f06-11e, f06-14e · tester
- ● `f06-01a` Create strict package and original-owner contracts · architect
- ● `f06-01b` Build shared strict runners and owned fixture primitives ← f06-01a · tester
- ● `f06-02a` Implement native Ask and bounded Act admission ← f06-01b · backend
- ● `f06-02b` Implement linked Plan fixture save and reopen ← f06-02a · backend
- ● `f06-03a` Implement durable atomic local resource repository ← f06-01b · data
- ● `f06-03b` Implement single assignment and local lifecycle usage ← f06-03a · backend
- ● `f06-04a` Implement fixed shell SDK and stdio MCP dispatch ← f06-02b, f06-03b · backend
- ● `f06-04b` Implement bounded egress and close tool paths ← f06-04a, f06-05 · backend
- ● `f06-06a` Implement continuation Stop and process control ← f06-04b, f06-05 · backend
- ● `f06-06b` Implement local original settlement base journeys ← f06-06a, f06-03b · backend
- ◐ `f06-06c` Verify local settlement authority receipt and quiescence ← f06-06b, f06-06c-pilot · security
- ○ `f06-06d` Verify local settlement faults atomicity and no replay ← f06-06c · tester
- ○ `f06-06e` Close local authority recovery and serial pilot timing ← f06-06d, f06-02b · tester
- ○ `f06-07a` Implement capability matrix and exact qualification registry ← f06-06e · devops
- ○ `f06-07b` Complete strict harness sabotage and evidence integrity ← f06-07a · tester
- ○ `f06-07c` Publish local release materials and full local gate ← f06-07b · devops
- ◐ `f06-08a` Install additive PG schema and atomic queue keys ← f06-01b, f06-03b · data
- ○ `f06-08b` Verify PG queue cancellation recreation and rollback ← f06-08a · data
- ○ `f06-09a` Install fence-only authenticated prelocking composition ← f06-08b, f06-02b · backend
- ○ `f06-09b` Install ACK-only original effect dispatch adapter ← f06-09a, f06-04b · backend
- ○ `f06-09c` Implement fresh original read-only settlement authority ← f06-09b · backend
- ○ `f06-09d` Implement constrained original-owner metadata settlement ← f06-09c · backend
- ○ `f06-09e` Verify PG settlement authority and receipt field denials ← f06-09d · security
- ○ `f06-09f` Verify PG quiescence snapshots and stale execution denial ← f06-09e · security
- ○ `f06-09g` Verify PG original settlement faults and dedup ← f06-09f · tester
- ○ `f06-09h` Implement atomic original fence and queue transfer ← f06-09g · backend
- ○ `f06-09i` Verify legal original-owner phase and Stop races ← f06-09h, f06-06e · tester
- ○ `f06-09j` Close all real authority effect and owner lock cases ← f06-09i · tester
- ○ `f06-10a` Implement real-format usage in original allowance family ← f06-09j, f06-03b · backend
- ○ `f06-10b` Verify real usage rollback and lost acknowledgement ← f06-10a · tester
- ○ `f06-11a` Implement private Plan maintenance child admission ← f06-02b, f06-08b, f06-09j, f06-10b · backend
- ○ `f06-11b` Integrate real Plan artifact publication and reopen ← f06-11a · backend
- ○ `f06-11c` Verify Plan CAS authority and budget separation ← f06-11b · security
- ○ `f06-11d` Verify Plan staging publication and commit recovery ← f06-11c · tester
- ○ `f06-11e` Run full real Plan and owner integration gates ← f06-11d · tester
- ○ `f06-12a` Pin release-specific backend protocol without activation ← f06-07c · architect
- ○ `f06-12b` Bind later approved host facts and limits ← f06-12a, f06-11e · devops
- ○ `f06-13a` Implement disabled pinned backend on local protocol fixture ← f06-12a · backend
- ○ `f06-13b` Qualify actual image readiness and resource controls ← f06-13a, f06-12b · devops
- ○ `f06-13c` Qualify deployed one-assignment queue base behavior ← f06-13b · devops
- ○ `f06-13d1` Qualify deployed original settlement: stopped-original-stop-run ← f06-13c · tester
- ○ `f06-13d2` Qualify deployed original settlement: stopped-original-stop-task ← f06-13d1 · tester
- ○ `f06-13d3` Qualify deployed original settlement: lease-expired-original ← f06-13d2 · tester
- ○ `f06-13d4` Qualify deployed original settlement: effect-expired-original ← f06-13d3 · tester
- ○ `f06-13d5` Qualify deployed original settlement: stop-and-both-expiries ← f06-13d4 · tester
- ○ `f06-13e` Run full deployed lifecycle and recovery gate ← f06-13d5 · tester
- ○ `f06-14a` Verify deployed all-path containment and trust limits ← f06-13e, f06-11e · security
- ○ `f06-14b` Verify deployed intent artifact lifecycle and costs ← f06-14a · tester
- ○ `f06-14c` Verify deployed browser and GUI refusal profile ← f06-14b · security
- ○ `f06-14d` Verify deployed watchdog recovery and serial timing ← f06-14c · tester
- ○ `f06-14e` Run deployment release drill and full X gate ← f06-14d · tester
- ● `f06-06c-pilot` Establish genuine five-path quiescence vector restoration pilot ← f06-06b · security
- ○ `f06-test-design-profile` Measure unchanged local settlement pilot concurrency for test design ← f06-06c-pilot · test-designer
- ● `f06-test-design-census` Resolve process residue after guarded concurrency specimen cancellation ← f06-06c-pilot · test-designer
- ● `f06-test-design-cancel` Design diagnostic: reproduce birth-integrity cancellation gap and fresh owned recovery · tester

## Acceptance checks

- ○ `g1-runtime-behavior` not run — `node g1-runtime/scripts/check.mjs`
- ○ `identity-behavior` not run — `node g1-identity/scripts/check.mjs`
- ○ `foundation-behavior` not run — `node g1-foundations/scripts/check.mjs`
- ○ `retained-baselines` not run — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ○ `security` (agent) pending
- ○ `code` (agent) pending
- ○ `final-acceptance` (agent) pending
- ○ `product-acceptance` (agent) pending

## Findings

- `f-627a2142b4` [root_cause/recorded] Retain failed precheckjob1a9247fac1/candidate0d0228: all5 A16 passed; A18 exact target snapshot failed because owner restart closed an unrelated live successor stream. Repair establishes acknowledged stop + independent quiescence of successor BEFORE exact unchanged lostclaim baseline (no assertion w
- `f-63cf36fbe4` [hypothesis/open] Second precheck82ab8b9591 finished50236ms,14/15 passed; all5 A16 and4/5A18+allR18 passed. Lease-expiry A18 refused actual termination because parent close lacked observed descendant-exited ACK; conservatively failed and held, not downgraded to success. Fixed specimen child-close path to await IPC se
- `f-3260917e3f` [evidence/recorded] Completion controllerjobefdc469e4c PASS15/15 in51289ms whole360s and original120s inner, after current build preserved3767 files. Runtime raw run2026-10-15T21-46-53.361Z-e25c3371-4e71-4cf9-8b4a-52c1a681ceea. Precheck13df6fdf3b separatelyPASS51192ms, both earlier failed attempts retained. No source c
- `f-3ea10f0d21` [evidence/recorded] Turn33 final currentcandidateea22b5ac5db6b9b37b7aac3146bb0cc5c64c6d7608dfec33a77e201df1c75d11 controller06b ef dc469e4c PASS15/15 51289ms (job-efdc469e4c); unchanged regressionsjob1e5ee5356e01a10/10 7694ms,01b7/7 17019ms,06a7/7 53393ms,03b15/15 23133ms. Machineaudit54assertions36currentstreams447act
- `f-4c25da923d` [evidence/recorded] Root controller pilot precheck job3d4e037098 PASS5/5 registered wrongboot leaves with18actual independent schema-fault/restoredGET/useful-successor journeys in56878ms overall/52011.40075ms inner, no fail/cancel/skip/TODO. Source remains frozen; completion4e09893cc1 separately running, root owns fina
- `f-d334eb6fdb` [evidence/recorded] Turn34 controller completed pilot: job4e09893cc1 PASS5/5 in56592ms, actualinner51671.781375ms, all18independent negative/freshrestored-useful-successor journeys; precheck3d4e037098PASS56878ms. Currentruntimecandidate7089d81f4ccd5f1d9ac6a2674c1a20e521bbd6f4039dd9da41394f3e91f7ebb4. All14schemafaults 
- `f-0c77ed8424` [root_cause/recorded] Turn37 source-bound correction to PR-F06-08: actual case-inventory componentViews.continuation includes R19 (2487 IDs=2485 recovery+A11egress+A13authority), contrary to turn36's omit-R19/31s assumption. Its unchanged300s WHOLE command contains121s serial samples+build/three suites/cleanup. Human rec
- `f-e78faef312` [root_cause/recorded] Turn38 controller job-5b06476310 measured unchanged candidate7089d81f4ccd: complete1/2/4-lane pilot phases PASS53.839/55.688/59.588s,126 independent actual negative+fresh-restoredGET+useful-successor journeys. Eight-lane phase crossed conservative4GiB sum-owned-RSS guard(sample4541366272bytes,70live
- `f-6f2b7840d8` [root_cause/recorded] Turn39 unchanged-supervisor diagnostic job-13454408d5 PASS2915ms establishes a counterexample, NOT product acceptance: after root+grandchild OS births/ACKs, one intentionally invalid-nonce row in owned births.ndjson makes cleanup observe() throw before signaling; report cleanup:false/streamsComplete
- `f-f5062b62cd` [evidence/recorded] Turn40 local STATIC design audit only (no controller behavior claim): test-plan §19 + test-design-turn40/{cohort-contract.md,model.py,cohort-assignment-expiry-first.json,audit-final.json,report.md}. Ten deterministic packing candidates retain2488 reference branches/2475 owning cases/1492 actual3s ex

## Recent turns

- #36 test_design · codex/gpt-6.1-sol @high · ok · 526s · progress — Updated the [test-design draft](/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f06-runtime/test-plan.md) with state-independence rules and a proposed task split. Both findings remain
- #37 test_design · codex/gpt-6.1-sol @high · ok · 745s · progress — Updated the [test design](/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f06-runtime/test-plan.md) with the approved 300s inner limit, exact partition candidates and bounded task pro
- #38 test_design · codex/gpt-6.1-sol @high · ok · 1121s · progress — Updated the [test plan](/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f06-runtime/test-plan.md) with measured limits and cancellation cases.

- 126 independent journeys passed at 1/
- #39 test_design · codex/gpt-6.1-sol @high · ok · 614s · progress — Reproduced the cancellation cleanup defect and specified 20 future test cases. Independent recovery verified no remaining owned processes; production code is unchanged.

Test design remains incomplete
- #40 test_design · codex/gpt-6.1-sol @high · ok · 485s · progress — Updated [test-plan.md](/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f06-runtime/test-plan.md) with a cohort composition proposal, six isolation probes and reproducible static sched

## Recent notes

- 2026-10-16T00:23:43+00:00 [root_cause] Turn39 unchanged-supervisor diagnostic job-13454408d5 PASS2915ms establishes a counterexample, NOT product acceptance: after root+grandchild OS births/ACKs, one intentionally invalid-nonce row in owned births.ndjson makes cleanup observe() throw before signaling; report cleanup:false/streamsComplete
- 2026-10-16T00:29:52+00:00 [handoff] Turn39 test_design INCOMPLETE; no stage_done/product closure/production change. Read test-plan.md §18 and test-design-turn39/{report.md,cancellation-contract.md,cancellation-cases.json,result.json,final-results.json}. Unchanged7089d81f4ccd supervisor counterexample: wrong-nonce record after actual P
- 2026-10-16T00:32:04+00:00 [decision] Turn40 test_design will specify a lower-footprint cohort protocol and reproducible static assignment/budget audit, not launch live cohorts: shared service infrastructure may serve disjoint namespaces per §15.2, but current target-wide value/config cannot. Preserve each actually admitted original, li
- 2026-10-16T00:38:07+00:00 [evidence] Turn40 local STATIC design audit only (no controller behavior claim): test-plan §19 + test-design-turn40/{cohort-contract.md,model.py,cohort-assignment-expiry-first.json,audit-final.json,report.md}. Ten deterministic packing candidates retain2488 reference branches/2475 owning cases/1492 actual3s ex
- 2026-10-16T00:38:07+00:00 [handoff] Turn40 test_design INCOMPLETE; PR08/09 OPEN;14/70 unchanged. Read test-plan §19 and test-design-turn40/report.md/cohort-contract.md/current cohort-assignment-expiry-first.json/audit-final.json. Proposed lower-footprint namespaces share listener/service/recovery epoch ONLY, not mutable authority/targ
- 2026-10-16T00:39:31+00:00 [decision] Turn41 test_design will enumerate exact matrix state/order/fault recipes and all continuation nonmatrix branch obligations in docs-owned static artifacts; preserve current 5350 IDs/101 requirements and all deadlines/samples. No live cohort, diagnostic task, production edits, Docker, remote, official

## Goal queue

- ✓ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ✓ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — done
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — paused · approved
- ▶ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — running · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
