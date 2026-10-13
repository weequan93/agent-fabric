# G1-F05 atomic-disconnection repair gate, version 1

Turn85 planning correction for **PLAN84-01**. This freezes work before implementation. The [exact v4 plan](g1-f05-task-plan-v4.json), [case allocation](../loop/agent-fabric-g1-f05-storage/plan-turn85/repair-cases.json) and [current readiness/capacity supplement](../loop/agent-fabric-g1-f05-storage/plan-turn85/readiness-capacity-supplement.json) form the amendment. They preserve all earlier requirements, cases, checks and raw evidence. No behavior, repair, resource revalidation, independent acceptance or external qualification is issued here.

The retained Turn83 `job-b12cd36fd2` observed actual K03 revision AFTER mask3 and an owned SIGKILL, then failed the original 2000ms PostgreSQL-disconnection observation. The installed UoW lock_timeout and cleanup deadline are both two seconds; their interaction is a hypothesis. Backend/socket cause has not been established. Prior passing atomic results do not close this failure.

## Mandatory execution and count

Task `f05-11-atomic-disconnect` retains both existing commands, definitions and 900-second controller bounds:

- `node g1-storage/scripts/check-component.mjs verify-atomic` — all16 original K03/K06/K07 variants.
- `node g1-storage/scripts/check-component.mjs verify-knowledge` — all21 original K01/K02/K08/K09 variants.

Add one required controller completion command, `node g1-storage/scripts/check-component.mjs verify-atomic-disconnect`, with timeout900, integration stage and normal strict current build/runner/result/ownership gates. It must fail on the unchanged candidate because its registry/component does not exist. No planning-stage fake implementation or successful test is supplied. Implementation must require this component and its exact executed count; a report or an unchanged full-suite rerun cannot substitute.

The new shared registration also executes inside the aggregate `commit-conflict` suite; an additive manifest extension requires AD01/AD02 and their60 leaf identities. Preserve every predecessor registry byte via the existing reversible extension convention, all original case/variant identities and all original test assertions. Diagnostic and aggregate use the same test bodies and the same result/count verifier. Full aggregate remains mandatory and must fail if the extension, import, build emission or any leaf is missing. No caller selector, optional mode or environment switch may omit repetitions. The fixed frozen allocation digest is bound into registration; changing it requires another reviewed plan amendment.

AD01 contains **five rounds**, each with its own fresh owned synthetic fixture and ephemeral keys. Each round executes these ten phases exactly once, sequentially in the listed order; thus50 live phase executions, including five revision AFTER/mask3 executions. Each phase uses a fresh command key/target and freshly created writer; recreated lookup uses a separate new caller. Round isolation avoids reusing stale/expired source authority. Existing fixture expiry checks still apply. No source-expiry extension, stale token allowance, rerun, retry, skipped round or restart-on-failure is allowed. A failure is retained and fails this invocation.

| Phase | BEFORE observed mask | AFTER observed mask |
| --- | ---: | ---: |
| revision / storage_knowledge_revisions | 1 | 3 |
| head / storage_current_heads | 0 | 1 |
| receipt / storage_save_receipts | 31 | 63 |
| event / storage_save_events | 15 | 31 |
| outbox / storage_outbox | 7 | 15 |

Leaf IDs are `AD01/r01/revision-before` through the exact50 IDs in repair-cases.json. AD02 adds ten required hostile-verifier subprocess tests below. Parent names and process logs are not extra accepted leaves. The component requires exactly50 successful real-phase records, five complete rounds, ten schedules per round, exactly60 executed leaves, no unknown/duplicate leaf and zero failed/cancelled/skipped/TODO results. Original suite counts stay unchanged. New component and each test retain a240000ms execution deadline; controller900s includes strict build/setup/cleanup and is not permission to extend any original phase/readiness/HTTP/cleanup deadline. All six finite violation counters remain zero. Actual denied recreated reads and successful original-key lookups provide useful observations; labels alone do not supply counters.

## Required independent observations per live phase

Use the current original `phase()` body or an additive equivalent that demonstrably preserves every assertion; do not replace actual HTTP/PG/process behavior with an in-memory model. For every leaf retain a correlated record containing:

1. Round/leaf identity, current candidate and allocation digest, fixture owner/instance/root identity, command key/target, worker nonce/PID and current process birth identity. Validate the live fixture marker and worker IPC ownership agreement before signaling. Capture process census with the existing controller route; no historical PID or command-name-only signal.
2. Actual PG `application_name` containing this worker PID/nonce, restricted controller role, backend PID and `backend_start`, observer/blocker PID and birth, actual granted mask lock, and actual `pg_blocking_pids` relation. Record the mask obtained from the original six real in-transaction table counts. A requested mask or child IPC claim is insufficient. Capture all worker controller and auth PG connections with PID/start/application, using a separately connected parent observer. Every tracked connection must match the same current worker; nonempty controller inventory is required.
3. Actual pre-kill external canonical table snapshot and epoch anchor; zero visible partial rows and no Saved response while the writer remains blocked. Preserve the original phase gate/barrier and original wait behavior through kill/disconnection proof. Do not release its blocker early to manufacture a different schedule.
4. Monotonic timestamp immediately before ownership-checked `SIGKILL`, actual child exit signal `SIGKILL`, and independently queried PG disappearance. Clear PG activity snapshots on each read. Verify both every captured backend PID/start is gone and no connection with the matched controller/auth application remains. Child exit, a cancelled query or closing the parent's client is insufficient. Keep the original `kill()` PG-disconnection2000ms observer bound unchanged; additionally require elapsed kill-dispatch-to-first-independent-zero observation <=2000ms. Report elapsed time per phase and polling observation timestamps; no averaging may hide a late phase. Any poll/query failure, unmatched birth, missing observation, remaining connection or late result fails.
5. Actual request outcome contains no Saved here response. Check the dead HTTP port with the original bounded network request; preserve the original HTTP timeout and cleanup assertions. Capture result/closed-port outcome without source payloads, tokens, keys, DSNs or private content.
6. Exact post-kill PG snapshot equals pre-kill snapshot across all storage tables, each canonical effect count is zero, and no ghost content is readable. A separate recreated caller queries the same original key under current authorization and obtains the exact original `absent-safe`, `replayAllowed:false`, `inspect-current-authority` outcome; no fresh-key replay. Repeat lookup is nonmutating. Reconciled epoch anchor equals the original. Preserve original denied-read, installed-owner/resource snapshot, key zeroing, observer rollback/drop-trigger and full owned cleanup/census checks.

Before issuing any pass, the shared verifier checks exact ID-set/count, fixed phase/mask/round mapping, unique command/worker identities and complete matched observation chains. Each occurrence has its own worker and backend birth observations; reused PG numeric PID is allowed only with a distinct correctly correlated backend birth. Never accept an unmatched record merely because global PG count later reaches zero. A late observation fails even if later cleanup succeeds. Preserve successful and failed streams in full; cleanup failure also fails the task.

## Failing-oracle probes

AD02 executes ten fresh verifier subprocesses. Start from this invocation's complete independently observed50-phase record set and mutate exactly one condition per probe:

| Required leaf | Mutation that must be refused |
| --- | --- |
| AD02/omitted-repetition | Remove r05/revision-after entirely, leaving49 records. |
| AD02/duplicate-repetition | Replace that record with another round's ID/observations, retaining nominal count50. |
| AD02/unmatched-worker-nonce | Substitute an unrelated worker nonce in one connection/disconnection chain. |
| AD02/changed-backend-start | Substitute a different backend birth in one disappearance chain. |
| AD02/wrong-observed-mask | Change r05/revision-after observed mask3 to1 while leaving the expected schedule intact. |
| AD02/exit-only-disconnection | Delete independent PG observations while retaining SIGKILL/exit evidence. |
| AD02/late-disconnection | Set one elapsed observation to2001ms with otherwise valid identities. |
| AD02/saved-response | Record a Saved here response before commit for one killed writer. |
| AD02/rollback-mismatch | Alter one canonical snapshot/effect count to contain an unrolled-back row. |
| AD02/lookup-mismatch | Change the recreated original-key receipt to committed or replayAllowed:true. |

Each subprocess must terminate within the existing harness probe deadline with a normal nonzero exit and the specific failed condition. A crash, signal, timeout, unavailable dependency, unrelated source/build error or synthetically printed failure label does not prove rejection. No negative child may produce an accepted success record. The same verifier first accepts the unmodified live record set, then refuses all ten mutations; no alternate test-only validator. These probes test the completion oracle; they do not replace any of the50 actual process/PG/HTTP journeys. Missing hostile probe also fails execution/count gates.

## Repair scope, evidence and completion

Investigate actual backend wait state, locks and socket/client lifetime before making a narrow fixture-only repair. Record diagnostic observations correlated to nonce/PID/backend birth rather than asserting the lock_timeout theory as fact. Permitted existing fixture repair targets are `tests/helpers/atomic-verification-fixture.ts` and `tests/helpers/atomic-command-worker.ts`; new test/registration/verifier files and reversible guard/pin extensions may be added. Every changed predecessor assertion must be reconstructible and preserved in the additive registration proof. Product `src/`, migrations, installed owner code, accepted F02/foundation/G0/G1-local checks, dependency locks, real credentials/ACLs and raw evidence remain untouched.

The completion verifier requires at least one of those two fixture files to differ from its frozen predecessor hash, a substantive explained transport/phase correction, and a current-candidate repair record binding the diff, diagnosis measurements and retained failure hashes. A documentation/comment-only or unrelated change is not a repair. Independent code review assesses the mechanism; differing bytes alone do not establish a root cause. If only repeated passing executions are available, report the finding unresolved and do not submit done. The hash refusal and missing repeat registration ensure the unchanged previously passing candidate cannot earn a new receipt.

Do not call `pg_terminate_backend`, manually cancel/close a backend, relax the signal/nonce/birth/mask oracle, increase any timeout, filter the census, suppress worker output failures, skip/quarantine a variant, modify production UoW semantics or accept a lucky/best-of rerun. Retained `job-b12cd36fd2` remains failed. Run all three controller task checks on the same frozen repaired candidate, retain complete raw streams/definitions/candidate identities, and reparse every mandatory leaf/measurement/cleanup result. Only the controller can issue completion. Finite repetitions demonstrate this local fixture schedule, not universal determinism or production recovery guarantees.

## Sizing, dependencies and resource boundary

One tester, empty team,95 minutes including diagnosis20, fixture repair25, gate/negative wiring25, controller checks/evidence20 and reserve5. This replaces the prior60-minute estimate; pending authored work increases from1620 to1655minutes. Existing dependencies `f05-11-atomic` and `f05-11-knowledge` remain; terminal `f05-11` still depends on this repair plus `f05-11-races`. All other task definitions/checks/roles/dependencies and completed receipts remain unchanged.

The amendment adds one check:59 tasks/87 checks,36 done/23 unfinished. The current supplement binds these exact definitions, all96 requirements and approved120-turn/144h policy from the original start; historical Turn56 readiness is58/84 and remains historical. No new local tool, paid resource or external environment is needed. The next resources stage must revalidate this supplement, then independent plan review decides readiness. No new capacity approval or demonstrated deficit is claimed.

Source basis: [roadmap](roadmap.md) G1/G2/evidence gates; [foundation sequence](g1-foundations-plan.md) F05 and unchanged authority; [master specification](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md) §§15–18,28–29 (canonical commit, provenance, current-authority restore and evidence); [F02 evidence](../evidence/g1-f02-acceptance.md) preserved local/current-authority/original-key boundaries; original [test plan](../loop/agent-fabric-g1-f05-storage/test-plan.md) K03/H01–H04. R-019/R-070/R-071/R-072/R-078 are directly covered. X01–X09 remain unqualified and OFF, including provider/KMS, whole-cluster durability/power loss, enterprise policy, real delivery revocation, F06 runtime isolation, SSO/human approval, real models/billing, physical clients and later G2–G5 depth. This amendment changes no product requirement or external authorization.
