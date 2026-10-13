# Loop · agent-fabric: G1-F05 storage

**READY** — Approved by human (via Claude): gpt-6.1-sol max effort. Start with `loop start`.

- Goal `agent-fabric-g1-f05-storage` · kind **develop** · updated 2026-10-13T03:42:11+00:00
- Next: **wait_job** (controller) — Waiting for check job job-05faf2e750 (f05-14-harness.full-delivery-prerequisite, f05-14-harness.full-harness-prerequisite), started 2026-10-13T03:13:39+00:00.
- Runner: running · pid 39390 · adapter codex
- Turns 249 · agent time 3237.2 min · reported cost $0.00 (partial: some turns reported no cost)

## Working on

- Controller check job `job-05faf2e750` (2 checks) running 29 min
- `f05-14-harness` Implement and prove full nonrecursive H01–H04 harness before security integratio · checks 1/2 · 22 recent turns · last (turn 249): Hostile harness passed all 42 tests; cleanup succeeded. Tester review found no supported defect.

Full delivery and harness checks are running in `job-05faf2e750`. Handoff recorded; task completion re

## Pipeline

● intake → ● requirements → ● requirements_review → ● solution → ● test_design → ● plan → ● resources → ● plan_review → ◐ develop → ○ test → ○ reviews → ○ final-acceptance → ○ product-acceptance → ○ done

- intake: docs/loop/agent-fabric-g1-f05-storage/product-brief.md
- requirements: 96 recorded · final
- requirements_review: pass
- solution: docs/loop/agent-fabric-g1-f05-storage/solution.md
- test_design: docs/loop/agent-fabric-g1-f05-storage/test-plan.md
- plan: 74 tasks · 0 uncovered · final
- resources: docs/loop/agent-fabric-g1-f05-storage/readiness.md
- plan_review: pass
- develop: 66/74 tasks
- test: integration:-, regression:pass, regression:pass, regression:pass
- reviews: security:-, code:-
- final-acceptance: pending
- product-acceptance: pending

## Objective

Deliver the G1-F05 increment of Agent Fabric G1: Owned storage/volume: encrypted persistence, retention/delete propagation and an actual restore, as the base for G2 memory.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-07: 记忆有作用域版本与来源 — remaining: lineage/source/audience契约；实际recall/conflict/delete/revocation
- UX-01: 授权来源问答且不启动Space VM — remaining: service routing/source eligibility fixture；实际saved decision问答和VM未启动

Create g1-storage/ with a build and g1-storage/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f05-plan.md and docs/evidence/g1-f05-acceptance.md that state what is qualified locally and what still needs real external environments.

## Tasks (66/74 done)

- ● `f05-01` Freeze executable contracts, owner composition and independent build · architect
- ● `f05-02` Install scoped PG authority, authenticated fixture and current control ledger ← f05-01 · backend
- ● `f05-03` Persist authenticated ciphertext with owned staging and redacted copies ← f05-02 · backend
- ● `f05-04` Admit explicit source-backed save and commit canonical pieces ← f05-03 · data
- ● `f05-05` Integrate commit artifacts, encrypted live files, drafts and checkpoints ← f05-05-promotion, f05-05-schedule · backend
- ● `f05-06` Integrate serve useful authorized Ask through installed native owners ← f05-06-disclosure · backend
- ● `f05-07` Integrate propagate retention, forget and revocation through durable descendants ← f05-07-retry · data
- ● `f05-08` Confirm durable backup and recover original confirmation ← f05-08-capture · backend
- ● `f05-09` Integrate restore actual content into a fresh owned generation behind current authority ← f05-09-progress · backend
- ● `f05-10` Integrate complete unit contracts and hostile harness probes ← f05-10-cleanup · tester
- ● `f05-11` Integrate qualify authority, commit, lifecycle and volume integration schedules ← f05-11-races, f05-11-atomic-disconnect, f05-11-lifecycle-fix · tester
- ● `f05-12` Integrate qualify native saved-decision e2e and disclosure races ← f05-12-routing · tester
- ● `f05-13` Integrate qualify restore/recovery and measure actual local boundary ← f05-13-measurement · tester
- ○ `f05-14` Integrate qualify encryption inventory and adversarial security gates ← f05-14-cipher, f05-14-copies, f05-14-harness · security
- ○ `f05-15` Integrate deliver operator/evidence package and unchanged controller regressions ← f05-14, f05-15-evidence, f05-15-schedule · tester
- ● `f05-04-status` Persist proposals, seven statuses and registered verification ← f05-04 · data
- ● `f05-04-correction` Apply selective correction with CAS, lineage and scoped dedup ← f05-04-status · data
- ● `f05-04-recovery` Expose original-key HTTP save and commit recovery ← f05-04-correction · backend
- ● `f05-04-gate` Integrate canonical knowledge, commands and source content ← f05-04-recovery · data
- ● `f05-05-artifacts` Publish durable encrypted artifacts and quarantine orphans ← f05-04-gate · backend
- ● `f05-05-drafts` Persist live versions, recoverable drafts and distinct checkpoints ← f05-05-artifacts · backend
- ● `f05-05-promotion` Validate CAS file promotion and current writer fences ← f05-05-drafts · backend
- ● `f05-06-recall` Retrieve current eligible canonical sources before decryption ← f05-05 · backend
- ● `f05-06-native` Compose useful native Ask with installed resource admission ← f05-06-recall · backend
- ● `f05-06-disclosure` Publish reauthorized answers and versioned retrieval manifests ← f05-06-native · backend
- ● `f05-07-retention` Commit expiry and forget restrictions with truthful impact ← f05-06 · data
- ● `f05-07-graph` Track nested sensitive dependencies and block descendants ← f05-07-retention · data
- ● `f05-07-maintenance` Build encrypted projections under existing maintenance allowance ← f05-07-graph · data
- ● `f05-07-retry` Resume durable invalidation leases without resurrection ← f05-07-maintenance · data
- ● `f05-08-capture` Capture coherent encrypted backup inventory under Space barrier ← f05-07 · backend
- ● `f05-09-import` Validate archive and import into a fresh blocked generation ← f05-08 · backend
- ● `f05-09-activation` Reconcile current restrictions and activate useful restored content ← f05-09-import · backend
- ● `f05-09-progress` Recover interrupted restore and activation uncertainty ← f05-09-activation · backend
- ● `f05-10-build` Verify hostile build and executed-result harness schedules ← f05-09 · tester
- ● `f05-10-cleanup` Verify owned fixture cleanup and observation sabotage ← f05-10-build · tester
- ● `f05-11-authority` Exercise authority and source-eligibility schedules ← f05-10 · tester
- ● `f05-11-atomic` Exercise atomic knowledge commit and wire uncertainty ← f05-11-authority · tester
- ● `f05-11-knowledge` Exercise knowledge lineage, statuses and conflict writers ← f05-11-atomic · tester
- ● `f05-11-artifact` Exercise artifact durability and orphan cleanup schedules ← f05-11-knowledge · tester
- ● `f05-11-volume` Exercise file promotion, draft and checkpoint schedules ← f05-11-artifact · tester
- ● `f05-11-lifecycle` Exercise every-class expiry, forget and dependency graph ← f05-11-volume · tester
- ● `f05-11-retry` Exercise late jobs and interrupted propagation retry ← f05-11-lifecycle · tester
- ● `f05-11-maintenance` Exercise admitted maintenance and single-charge refusals ← f05-11-retry · tester
- ● `f05-11-races` Exercise revocation and lifecycle publication races ← f05-11-maintenance · tester
- ● `f05-12-recall` Exercise useful persisted Ask and recall gaps ← f05-06, f05-07, f05-09 · 1×tester
- ● `f05-12-disclosure` Exercise answer disclosure races and immutable Space binding ← f05-06, f05-07 · 1×tester
- ● `f05-12-routing` Exercise no-VM routing, controls and installed admission ← f05-12-recall, f05-12-disclosure, f05-09, f05-12-routing-schedule-repair · 1×tester
- ● `f05-13-current` Exercise actual restore usefulness and current-authority gates ← f05-09, f05-06 · 1×tester
- ● `f05-13-interruption` Exercise seven restore kill phases and wire recovery ← f05-09 · 1×tester
- ● `f05-13-integrity` Exercise poisoned archives and forbidden authority replay ← f05-08, f05-09-import · 1×tester
- ● `f05-13-measurement` Exercise coherent backup/operator schedules and measure restore ← f05-13-current, f05-13-interruption, f05-13-integrity, f05-13-backup-schedule-repair · 1×tester
- ● `f05-15-docs` Deliver executable operator journey and evidence inventories ← f05-12, f05-13 · 1×tester
- ● `f05-15-evidence` Bind evidence to candidate and block unsupported qualification ← f05-15-docs · 1×tester
- ● `f05-14-cipher` Exercise every-class ciphertext integrity and recreated reads ← f05-03, f05-05, f05-06, f05-07, f05-09 · 1×security
- ● `f05-14-copies` Scan all retained private copies and scoped equality probes ← f05-03, f05-05, f05-06, f05-07, f05-09 · 1×security
- ● `f05-05-schedule` Execute all complete volume predecessors concurrently within nested fixture lifetimes ← f05-05-promotion, f05-05-custodian · backend
- ● `f05-05-recovery` Prove exact owned recovery and recover the interrupted Turn53 fixture ← f05-05-promotion · devops
- ● `f05-05-custodian` Keep fixture custodian alive across worker loss with exact LIFO cleanup ← f05-05-recovery · backend
- ● `f05-11-atomic-disconnect` Repair owned atomic disconnection with mandatory repeated phase proof ← f05-11-atomic, f05-11-knowledge, f05-11-lifecycle-fix · tester
- – `f05-11-suite-execution` Remove obsolete per-file timeout and prove complete lifecycle schedule ← f05-11-races, f05-10, f05-11-full-predecessors · tester
- ○ `f05-15-schedule` Prove complete current aggregate workload before terminal delivery ← f05-14, f05-15-evidence · tester
- ◐ `f05-14-harness` Implement and prove full nonrecursive H01–H04 harness before security integration ← f05-10, f05-11, f05-12, f05-13, f05-15-evidence, f05-14-cipher, f05-14-copies · 1×tester
- ● `f05-11-measurement-drain` Repair fatal-path measurement output and prove complete hostile regression ← f05-11-races, f05-10 · tester
- – `f05-11-full-predecessors` Repair complete S-L/S-V predecessor isolation and exact result admission ← f05-11-races, f05-10, f05-11-measurement-drain, f05-11-full-receipt-transport · tester — last checks failed: f05-11-full-predecessors.complete-lifecycle-isolation-admission, f05-11-full-predecessors.complete-volume-isolation-admission
- – `f05-11-full-receipt-transport` Repair native full-registration receipt framing and real serializer controls ← f05-11-measurement-drain, f05-11-races, f05-10, f05-11-receipt-boundaries, f05-11-lock-observation-investigation, f05-11-maintenance-failure-capture · tester — last checks failed: f05-11-full-receipt-transport.complete-lifecycle-native-receipts
- ● `f05-11-receipt-boundaries` Repair SQL diagnostic framing, split native control markers and original preservation refusal paths ← f05-10, f05-11-races, f05-11-measurement-drain, f05-11-native-diagnostic-controls · tester
- ● `f05-11-native-diagnostic-controls` Preserve raw diagnostic negative bytes through closed native test-control transport ← f05-10, f05-11-races, f05-11-measurement-drain, f05-11-native-proof-transport · tester
- ● `f05-11-native-proof-transport` Retain complete native structural proof through bounded lossless controller transport ← f05-10, f05-11-races, f05-11-measurement-drain · tester
- ● `f05-11-lock-observation-investigation` Investigate actual maintenance lock observation failure without changing frozen helpers ← f05-11-receipt-boundaries, f05-11-native-diagnostic-controls, f05-11-native-proof-transport · tester
- – `f05-11-maintenance-failure-capture` Capture the unchanged original maintenance failure boundary without editing frozen sources ← f05-11-lock-observation-investigation · tester
- ● `f05-11-lifecycle-fix` Fix the lock-wait race at its source and pass lifecycle-propagation ← f05-10, f05-11-lock-observation-investigation, f05-11-measurement-drain, f05-11-races, f05-11-receipt-boundaries · backend
- ● `f05-12-routing-schedule-repair` Repair full Ask original migration fixture isolation ← f05-12-recall, f05-12-disclosure, f05-09, f05-13-current, f05-13-interruption, f05-12-routing-order-repair · 1×tester
- ● `f05-12-routing-order-repair` Repair complete Ask expected registration order ← f05-12-recall, f05-12-disclosure, f05-09, f05-13-current, f05-13-interruption · tester
- ● `f05-13-backup-schedule-repair` Repair original backup registration and killed-worker output ← f05-08, f05-09, f05-13-current, f05-13-interruption, f05-13-integrity · 1×tester

## Checks running now

- `job-05faf2e750` f05-14-harness.full-delivery-prerequisite, f05-14-harness.full-harness-prerequisite · started 2026-10-13T03:13:39+00:00 · pid 79297

## Acceptance checks

- ○ `g1-storage-behavior` not run — `node g1-storage/scripts/check.mjs`
- ✓ `identity-behavior` pass · 2026-10-07T21:07:26+00:00 — `node g1-identity/scripts/check.mjs`
- ✓ `foundation-behavior` pass · 2026-10-07T21:07:29+00:00 — `node g1-foundations/scripts/check.mjs`
- ✓ `retained-baselines` pass · 2026-10-09T08:42:02+00:00 — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ○ `security` (agent) pending
- ○ `code` (agent) pending
- ○ `final-acceptance` (agent) pending
- ○ `product-acceptance` (agent) pending

## Findings

- `f-0bb013e131` [root_cause/confirmed] Turn220 first complete backupRestore job-523a57bc88 FAIL721575ms on frozeneb0e0ce/1165, child248TAP246pass2fail no cancelled/skipped/TODO. Original BACKUP/process-kill-capture-archive-fsynced fails helper zero-output oracle with427actual childpipe bytes (not retained/explained by producer; no warnin
- `f-eee37d63a3` [root_cause/recorded] Original backup diagnostic job-2bfd231f41 PASS56/56 88426ms did not reproduce prior427. Temporary controlled-GC probe only in existing worker at actual capture/archive-fsynced, preserving privateIPC/fork/PG/PID/SIGKILL/zero assertions, job-d27ef946ed FAIL88128ms with actual427bytes, sha256a18a5e8580
- `f-2991bdff8f` [root_cause/recorded] First diagnostic job-bef5a26060 failed D03/all-fields-inventory exact installed table census: new delivery inventory omitted inherited G0 storage_confirmations defined in infra/migrations/0001_core_records.sql, not F05 migration directory. All other table column lists exactly match existing E03 inve
- `f-f588ca005a` [root_cause/recorded] Turn227 first diagnostic job-35e162403e fails D02/complete-controller-streams: helper assumed four storage-owned-fixture records, actual original operations command has exactly one owned outer fixture and four model-owned processes. Raw original ops records show one container/root removal with uncha
- `f-5989329d76` [root_cause/recorded] Turn229 original diagnostic job72bd0d6d21 settled deliveryPASS37/6parents31leaves132965ms, harnessTIMEOUT900076ms/-15 with no completeH/cleanup. Authorized tester read owned3Hfiles, delivered/joined noedit timing/source diagnosis; no demonstrated recursion/deliberate waits. Latest eight nonH timings
- `f-125ce9dae4` [hypothesis/open] F05-H-COST-MIGRATION231: Joined authorized tester read-only review identified repeated migration-chain validation, not proven root cause: installed v29 calls56 migration transactions/784 catalogSELECTs; four delivery current-restore fixtures replay v29+v28 (440transactions/~6561catalogSELECTs incl f
- `f-2b30cbfa8f` [evidence/recorded] Turn233 read original authority job-43e3cb5820 settled PASS41/sixparents35leaves/95890ms; raw stdout174600 SHA337a5ecfed487537a5fd8772812c3dcf3c9e54caa8116bfe0057398a21aa2d5c stderr0. Actual setup/work/cleanup1183.555/88197.570/333.319ms, strictbuild5646.718ms and command95631.243ms. Six real migrat
- `f-9ff08a4bc1` [evidence/recorded] Turn235 original job-e0399b4b8d authority PASS41/6parents35leaves96227ms; stdout176712 SHA2ff92948aabcbe4b01819d95c439646b40a06dc4a7a77be8df735dc0b1dadbbd stderr0, ownedcleanup/censusPASS. Exact authenticatedvolumeindexSELECT0.048–0.052ms/noJIT rejects its execution as explanation for live/draft1.8s
- `f-e62a879b73` [root_cause/recorded] Turn248 directly inspected settled job-0bed32d3f2 hostile harness COMPONENT: fail143455ms/exit1; TAP42 tests/36pass/6fail includes five leaf failures (fresh-build,deleted-source,removed-suite,unknown-argument,missing-fixture-never-skipped) plus failed parent. All trace to eager atomic-disconnect imp
- `f-aeddb88710` [evidence/recorded] Turn249 directly inspected settled original job-a8161d4782 hostile harness COMPONENT: PASS exit0 158808ms candidate e4530831de30b1c3c4698cbb3f3c72f26cfef44abc6fc79617c72e1bc8d94dc5. Original stdout1664283 bytes SHA2564714eb75b19bb0199d3f4777ecfd815ab10caf6ebe24b0c692bb8dfb12852471, stderr0. TAP42/42

## Recent turns

- #245 work · codex · ok · 224s · progress — Authority passed 118 tests; dependency graph passed 34, including the journal regressions. Tester review found no supported defect.

Complete lifecycle and volume checks are running as `job-debac08435
- #246 work · codex · ok · 257s · progress — Lifecycle passed 187 tests; volume passed 61, with zero violations and successful cleanup.

Controller job `job-57b51eaad8` is running full delivery and harness checks using the approved 2700-second h
- #247 work · codex · ok · 771s · progress — Delivery passed; the full harness timed out at 2700 seconds and remains unqualified.

Updated the execution seam to stream live progress while preserving strict checks. Controller contracts passed 12/
- #248 work · codex · ok · 314s · progress — Fixed the harness fixture’s missing allocation file; strict build and preservation guards pass. The tester confirmed required cases remain intact.

Controller rerun `job-a8161d4782` is pending. Handof
- #249 work · codex · ok · 172s · progress — Hostile harness passed all 42 tests; cleanup succeeded. Tester review found no supported defect.

Full delivery and harness checks are running in `job-05faf2e750`. Handoff recorded; task completion re

## Recent notes

- 2026-10-13T03:03:30+00:00 [handoff] Turn247 stops waiting on serialized controller job-0bed32d3f2. POLL FIRST before F05/source/build/cache/container/root/census mutation. Contracts COMPONENT PASS12/8468ms candidate92146e61fe97a9d8827a5456f71da961495fcdb9f59d557ae463e26e455bbaf9 stdout168995 SHAbe774b96a68f3a568e9ed03ba920ccd7dd710daf
- 2026-10-13T03:07:07+00:00 [root_cause] Turn248 directly inspected settled job-0bed32d3f2 hostile harness COMPONENT: fail143455ms/exit1; TAP42 tests/36pass/6fail includes five leaf failures (fresh-build,deleted-source,removed-suite,unknown-argument,missing-fixture-never-skipped) plus failed parent. All trace to eager atomic-disconnect imp
- 2026-10-13T03:08:55+00:00 [handoff] Turn248 stops waiting on serialized controller job-a8161d4782 per workflow. POLL FIRST before F05/source/build/cache/container/root/census or report mutation. Existing hostile harness COMPONENT pending on repaired HarnessCopy. Lead read loop_next+skill/context; authorized tester read role guide firs
- 2026-10-13T03:12:52+00:00 [evidence] Turn249 directly inspected settled original job-a8161d4782 hostile harness COMPONENT: PASS exit0 158808ms candidate e4530831de30b1c3c4698cbb3f3c72f26cfef44abc6fc79617c72e1bc8d94dc5. Original stdout1664283 bytes SHA2564714eb75b19bb0199d3f4777ecfd815ab10caf6ebe24b0c692bb8dfb12852471, stderr0. TAP42/42
- 2026-10-13T03:13:30+00:00 [progress] Turn249 tester joined complete after reading role guide first. Delivered read-only review of owned five H/E/D entry/registration files plus relevant async/copy helpers; no supported defect or edits/builds/checks/container/cache/root/census mutation. Lead reviewed runner and actual harness callback: 
- 2026-10-13T03:14:00+00:00 [handoff] Turn249 stops waiting on serialized controller job-05faf2e750 per workflow. POLL FIRST before F05 source/build/cache/container/root/census/report mutation. Existing full-delivery-prerequisite900s and full-harness-prerequisite human-approved2700s pending. Initial request with unqualified ids was reje

## Goal queue

- ✓ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ✓ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — done
- ▶ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
