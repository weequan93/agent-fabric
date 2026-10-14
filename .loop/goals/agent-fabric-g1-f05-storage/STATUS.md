# Loop · agent-fabric: G1-F05 storage

**RUNNING** — Turn 339 finished (ok).

- Goal `agent-fabric-g1-f05-storage` · kind **develop** · updated 2026-10-14T14:14:05+00:00
- Next: **wait_job** (controller) — Waiting for check job job-4796beec7d (acceptance.g1-storage-behavior), started 2026-10-14T13:52:09+00:00.
- Runner: running · pid 32446 · adapter codex
- Turns 339 · agent time 4829.0 min · reported cost $0.00 (partial: some turns reported no cost)

## Working on

- Controller check job `job-4796beec7d` (1 checks) running 22 min
- `f05-14-harness` Prove original full D/H after bounded direct F05 source repairs · checks 1/2 · 10 recent turns · last (turn 339): Fixed H02’s registry lookup crash without changing assertions. The tester independently reviewed the correction.

Full controller acceptance is running as `job-4796beec7d`. F05 remains unaccepted pend

## Pipeline

● intake → ● requirements → ● requirements_review → ● solution → ● test_design → ● plan → ● resources → ● plan_review → ◐ develop → ○ test → ○ reviews → ○ final-acceptance → ○ product-acceptance → ○ done

- intake: docs/loop/agent-fabric-g1-f05-storage/product-brief.md
- requirements: 96 recorded · final
- requirements_review: pass
- solution: docs/loop/agent-fabric-g1-f05-storage/solution.md
- test_design: docs/loop/agent-fabric-g1-f05-storage/test-plan.md
- plan: 81 tasks · 0 uncovered · final
- resources: docs/loop/agent-fabric-g1-f05-storage/readiness.md
- plan_review: pass
- develop: 73/81 tasks
- test: integration:fail, regression:pass, regression:pass, regression:pass
- reviews: security:-, code:-, performance-review:-
- final-acceptance: pending
- product-acceptance: pending

## Objective

Deliver the G1-F05 increment of Agent Fabric G1: Owned storage/volume: encrypted persistence, retention/delete propagation and an actual restore, as the base for G2 memory.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-07: 记忆有作用域版本与来源 — remaining: lineage/source/audience契约；实际recall/conflict/delete/revocation
- UX-01: 授权来源问答且不启动Space VM — remaining: service routing/source eligibility fixture；实际saved decision问答和VM未启动

Create g1-storage/ with a build and g1-storage/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f05-plan.md and docs/evidence/g1-f05-acceptance.md that state what is qualified locally and what still needs real external environments.

## Tasks (73/81 done)

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
- ◐ `f05-14-harness` Prove original full D/H after bounded direct F05 source repairs ← f05-10, f05-11, f05-12, f05-13, f05-15-evidence, f05-14-cipher, f05-14-copies, f05-14-control-scan, f05-14-postscan-profile, f05-14-direct-cpu-profile, f05-14-epoch-metadata, f05-14-owned-copy-design, f05-14-owned-copy-repair · 1×tester
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
- ● `f05-14-admission-profile` Attribute staging/publication admission latency directly ← f05-13 · tester
- ● `f05-14-control-scan` Repair repeated F05 control-scan transport without changing admission boundaries ← f05-14-admission-profile, f05-02, f05-03, f05-05-artifacts, f05-09-activation · 1×tester
- ● `f05-14-postscan-profile` Attribute remaining direct admission cost after the full-H timeout ← f05-14-control-scan, f05-14-admission-profile · 1×tester
- ● `f05-14-direct-cpu-profile` Sample direct F05 file-operation cost without admission decorators ← f05-14-postscan-profile, f05-14-control-scan · 1×tester
- ● `f05-14-epoch-metadata` Reduce fresh epoch-directory metadata scheduling with unchanged authority ← f05-14-direct-cpu-profile, f05-14-control-scan · 1×tester
- ● `f05-14-owned-copy-design` Prescribe direct H02 owned-copy execution and immutable D origin handling ← f05-14-epoch-metadata, f05-14-copies, f05-15-evidence · 1×tester
- ● `f05-14-owned-copy-repair` Repair direct H02 owned-copy execution and immutable D origins ← f05-14-owned-copy-design · 1×tester

## Checks running now

- `job-4796beec7d` acceptance.g1-storage-behavior · started 2026-10-14T13:52:09+00:00 · pid 36733

## Acceptance checks

- ✗ `g1-storage-behavior` fail · 2026-10-14T13:39:31+00:00 — `node g1-storage/scripts/check.mjs`
- ✓ `identity-behavior` pass · 2026-10-07T21:07:26+00:00 — `node g1-identity/scripts/check.mjs`
- ✓ `foundation-behavior` pass · 2026-10-07T21:07:29+00:00 — `node g1-foundations/scripts/check.mjs`
- ✓ `retained-baselines` pass · 2026-10-09T08:42:02+00:00 — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ○ `security` (agent) pending
- ○ `code` (agent) pending
- ○ `performance-review` (agent) pending
- ○ `final-acceptance` (agent) pending
- ○ `product-acceptance` (agent) pending

## Findings

- `f-da55f95e28` [evidence/recorded] Turn322 final joined direct inverse migration controller checks PASS: strict-build job-14b79dc6f2 6170ms/full originalstdout1148 sha256b950ecbc...079dd; unchangedmeasurement120s job-f0060db7d8 33475ms/stdout4625471 sha2563ba74858...6cdc3; bothstderr0. Shippedreader verifies complete originals/actual
- `f-4d0678d098` [evidence/recorded] Turn324 after final tester join, unchanged serialized controller checks PASS exit0/completed: strict-build job-30ccdf1e93 7497ms stdout1148 sha25699c57997…04c11; measurement120s job-9b2ddff1c8 33899ms stdout4620844 fa62d5c8…76d0e; existing native-proof120s job-f0444d685e 87598ms stdout17202968 43bb0
- `f-be69ca93c6` [evidence/recorded] Turn326 local source-equivalent FIFO prototype completes6 alternating complete HC/D original/private comparisons plus8 unchanged H01-hooked full pair scans. Original/private535+14935 entries,12928files418689614bytes exact; every hook16TOTAL allocations/backings,fresh disjoint,26474reads25856descript
- `f-b2f21f150e` [root_cause/recorded] Turn328 terminal job-54d7e5d2be is six PASS/one H-build FAIL443134ms, not timeout. Fresh-build92.372s exact input guard correctly refuses seq4970 turn.finished327 event (events1997399→1997781bytes exact old/new hashes) during copied evidence reading; future active copy checks must remain within turn
- `f-574b79e7cc` [evidence/recorded] Turn329 same-turn job-fceb1f3adb terminal ALL7 PASS: strict5857ms/H-build1651629/H-cleanup87656/D-evidence7930/D-operations96884/E196587/measurement35852. Complete original stdout+stderr read/hashed; all stderr0. Hbuild19/cleanup24/evidence9/operations28/E32 tests, every fail/cancelled/skipped/TODO0
- `f-955d530291` [evidence/recorded] Turn330 follows human5026 product-first directive. Original acceptance.g1-storage-behavior job-9d30b47c5e terminal TIMEOUT1800152ms/exit-15/cleanupterminated, actual unchanged1800s definition, fingerprintgit:5127ad245a5419cb6cd36365. Complete original stdout1526223B/c7a08d3d and stderr0 read/hashed.
- `f-83945ea212` [root_cause/recorded] Turn334 actual original product check job-247fb30362 FAIL exit1 duration583478ms, not3600s timeout. Sole underlying assertion atomic-disconnect.mjs67: setup-close 32551.711667ms exceeds 30000ms. All 5 child suites pass 284 tests; AD 62 tests/50 real phases/10 hostile probes pass, maximum 100 phase w
- `f-75ed9b2d09` [evidence/recorded] Turn334 after approved exact AD correction, complete current product rerun job-e22a9f2e36 TIMEOUT3600136ms exit-15, cleanup=terminated, fingerprint3396ad7d. Candidate1177/e4331848; fresh build and9outer suites947tests including273backup/restore PASS, zero fail/cancel/skip/TODO;34observations sixzero
- `f-32c83073ff` [evidence/recorded] Turn335 complete original job-df07c43458 TIMEOUT7200095ms exit-15 cleanup=terminated fingerprint91899077; stdout4953152/6a30a4743d223a0be37b76b1904a4aece7623ca0b82b6c0017f5385883fdf6f2, stderr0 retained. Original freshbuild6831.107ms and H02copybuild12841.519ms each execute9suites947tests incl273bac
- `f-ceeed71b42` [root_cause/confirmed] Turn339 independently confirmed actual job-e179294710 FAIL1/7014842ms sole genuine leaf H02/good-full-run TypeError at harness.test.ts55 after actual private fixed10run PASS984 and successful copy removal. Manifest.suites lacks atomic-disconnect while actual runner uses registry.executionSuites. App

## Recent turns

- #335 work · codex/gpt-6.1-sol @xhigh · ok · 537s · progress — Started controller run `job-e179294710` with the human-approved 14400-second hang guard.

The previous run passed 947 tests in both the original and copied suites, but the full harness remained incomp
- #336 work · codex/gpt-6.1-sol @xhigh · exit 1 · 15s · no progress — {"message": "Your workspace is out of credits. Add credits to continue."}
- #337 work · codex/gpt-6.1-sol @xhigh · exit 1 · 3s · no progress — {"message": "Your workspace is out of credits. Add credits to continue."}
- #338 work · codex/gpt-6.1-sol @xhigh · exit 1 · 4s · no progress — {"message": "Your workspace is out of credits. Add credits to continue."}
- #339 work · codex/gpt-6.1-sol @xhigh · ok · 570s · progress — Fixed H02’s registry lookup crash without changing assertions. The tester independently reviewed the correction.

Full controller acceptance is running as `job-4796beec7d`. F05 remains unaccepted pend

## Recent notes

- 2026-10-14T11:42:34+00:00 [handoff] Turn335 staffed tester/root/tester read role guide FIRST; exact fileownershipNONE, returned independent complete originalstream/behavior/cleanup/14400configurationreview. Explicitly SETTLED with no edits/checks/builds/fixtures/resources/controllerwork in flight. Lead reviews report/currentplan/evide
- 2026-10-14T13:42:51+00:00 [decision] Unblocked: Continue approved from Telegram
- 2026-10-14T13:47:29+00:00 [decision] Turn339 product-first job-e179294710 terminal FAIL1/7014842ms within approved14400s, not timeout. Actual private H02 owned-copy fixed ten workload reports success/exit0/complete true, then sole genuine leaf fails harness.test.ts:55 TypeError because :53 imports manifest.suites, lacking atomic-discon
- 2026-10-14T13:52:01+00:00 [root_cause] Turn339 independently confirmed actual job-e179294710 FAIL1/7014842ms sole genuine leaf H02/good-full-run TypeError at harness.test.ts55 after actual private fixed10run PASS984 and successful copy removal. Manifest.suites lacks atomic-disconnect while actual runner uses registry.executionSuites. App
- 2026-10-14T13:52:01+00:00 [handoff] Turn339 prescribed guide-first tester /root/tester owns no files, independently reviewed complete original terminal result and direct single-line H02 lookup repair, confirms remaining private command frames assertions and explicitly SETTLED with no edits/builds/checks/fixtures/resources/cleanup/cont
- 2026-10-14T14:14:05+00:00 [decision] 人工决定（加快修复循环）：完整验收 acceptance.g1-storage-behavior 约 2 小时，因为 harness 会在复制的 runner 里把 10 个产品套件再跑一遍。以后修复时先用快速的组件/切片检查迭代（如 check-component.mjs harness、check-slice.mjs <失败的套件>，几分钟），确认通过后才跑一次完整验收作最终确认。当前 job-4796beec7d 照常等结果；若失败，只针对失败项用快速检查迭代。

## Goal queue

- ✓ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ✓ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — done
- ▶ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — running · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
