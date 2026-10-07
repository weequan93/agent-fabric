# Loop · agent-fabric: G1-F03 recovery

**DONE** — Review acceptance passed. 3 review(s) passed.

- Goal `agent-fabric-g1-f03-recovery` · kind **develop** · updated 2026-10-07T01:32:08+00:00
- Next: **finished** (none) — Review acceptance passed. 3 review(s) passed.
- Runner: running · pid 31890 · adapter codex
- Turns 25/60 · agent time 298.4 min · reported cost $0.00 (partial: some turns reported no cost)

## Objective

Deliver the G1-F03 increment of Agent Fabric G1: Temporal/controller integration and actual recreated-worker recovery with fences, unknown-effect reconciliation and notifications.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-01: 原生引擎拥有普通代理执行 — remaining: 确定性session/effect契约；实际运行无竞争harness进程
- AF-05: 远端工作独立于客户端并可恢复 — remaining: replay/恢复fixture；实际worker再建与durable state恢复
- AF-09: Dispatch调度监测和安全控制任务 — remaining: command dedup/审批/等待fixture；实际schedule/timezone/expiry/recovery
- AF-14: 恢复不能盲目重复外部写入 — remaining: 外部成功ack丢失/dedup/reconcile/replay零写；实际crash recovery
- AF-17: Task尝试产物交付状态无歧义 — remaining: 状态正/负/恢复fixture；实际draft/check/delivery/notification分立
- AF-19: 并发时Stop和接管有效 — remaining: stale Stop/旧generation拒绝fixture；实际所有冲突mutation quiesce
- UX-08: 旧移动进度Stop按当前权限推进fencing并显示不确定性 — remaining: stale Stop/idempotency/generation fixture；实际在线Stop与in-flight报告
- UX-18: 通知失败不改变已有任务结果且另有delivery status — remaining: task/artifact/delivery/notification fixture；实际推送失败仍能取回结果

…

## Tasks (8/8 done)

- ● `f03-contracts` Scaffold the additive recovery package and freeze its contracts
- ● `f03-durable-authority` Persist recovery records through the trusted PostgreSQL and identity boundary ← f03-contracts
- ● `f03-temporal-worker` Integrate native task control with real Temporal history and worker recreation ← f03-durable-authority
- ● `f03-unknown-effects` Reconcile externally committed effects across lost acknowledgements and crashes ← f03-temporal-worker
- ● `f03-stop-fences` Make Stop and takeover fence every exposed conflicting mutation path ← f03-unknown-effects
- ● `f03-dispatch-schedules` Execute durable schedule, approval and wait controls without stale catch-up ← f03-stop-fences
- ● `f03-results-notifications` Recover results independently from publication and notification delivery ← f03-dispatch-schedules
- ● `f03-qualification` Run strict integrated qualification and record the remaining external gates ← f03-results-notifications

## Acceptance checks

- ✓ `g1-recovery-behavior` pass · 2026-10-07T01:18:37+00:00 — `node g1-recovery/scripts/check.mjs`
- ✓ `identity-behavior` pass · 2026-10-07T01:18:55+00:00 — `node g1-identity/scripts/check.mjs`
- ✓ `foundation-behavior` pass · 2026-10-07T01:18:58+00:00 — `node g1-foundations/scripts/check.mjs`
- ✓ `retained-baselines` pass · 2026-10-07T01:19:17+00:00 — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ✓ `security` (agent) pass · 2026-10-07T01:21:49+00:00 — No blocking security findings in assigned git:c2ecd01199e945fa0bd7649b plus working-tree increment, assessed only within its documented supervised local scope. RecoveryRepository.checkpoint (g1-recove
- ✓ `code` (agent) pass · 2026-10-07T01:27:02+00:00 — No blocking file:line findings. Independent read-only review covered the diff since approval plus uncommitted increment, the ledger/master contracts and bounded acceptance claims, all implementation s
- ✓ `acceptance` (agent) pass · 2026-10-07T01:32:02+00:00 — No blocking findings in the documented local G1-F03 increment. All eight in-scope ledger IDs have real positive, negative, concurrency and recovery coverage, including persisted Temporal/controller in

## Findings

- `f-cf89e630ab` [evidence/recorded] Controller mutation proof job-5cc82dddff intentionally omitted only the new local uncertainty predicate to reproduce pre-repair behavior. Strict existing stop-races command built and ran53 cases:43 passed/10 failed, zero skip/cancel/TODO; new before-Stop checks observed fulfilled operations where re
- `f-b8ae5da508` [root_cause/recorded] Full diagnostic job-e9b3bf1ccf passed unchanged35/17/197+72 and evidence gate but new migration10 SQL proof digest shape rejected valid sha256:-prefixed contract digests (51/54 fence cases). Fixed only new migration grammar to existing digest decoder; IS TRUE additionally rejects nullable proof fiel
- `f-a07426d772` [evidence/recorded] SEC-F03-001 repair full current controller job-a737482ebd passed all5 approved checks: recovery251/251 executions (243 distinct; preserved calendar8 repeated), identity35, foundation17, originalG0197/G1-local72 + nativeElectron44.5.1/Android and evidence-index gate; exit0 zero fail/cancel/skip/TODO/
- `f-4bcca3399e` [root_cause/recorded] SEC-F03-002 and REC-F03-003 confirmed and repaired in source. Shared Space-locked uncertainty now includes local submitted/unknown entries excluding definitive immutable migration10 receipts and uncertain external operations by original resource binding. Model/new resource or effect I/O/terminal res
- `f-9f694b8b85` [root_cause/recorded] REC-F03-004 is confirmed: shared executable current() rejects genuine native verifying/finished publication completion. Added actual PostgreSQL/independent HTTP/two-native-turn regression before repair, fresh repositories, immutable outcome/atomic notification intents, zero additional POST/model, an
- `f-2d5f6a6ff1` [evidence/recorded] REC-F03-004 repaired and controller-qualified locally. Stable full5 job-698e85cd70 fingerprint git:7f158f939cf60446be300223 passed recovery265/265 executions (257 distinct; calendar8 twice), identity35/foundation17/originalG0197/G1-local72 with real outside-sandbox Electron44.5.1/Android and evidenc
- `f-763b954830` [root_cause/recorded] REC-F03-005 confirmed: dispatch current() accepts paused and claim() has no running-state prerequisite; Dispatch gate omits paused. Repair will keep paused read-only reconciliation/confirmed metadata, require running for prepared claims, reject paused at actual dispatch I/O, and persist resource wai
- `f-ca3415a929` [evidence/recorded] REC-F03-005 repaired slice job-dcf55e3c84, stable fingerprint git:fddfa0c4e8f3398cde87b517: effects30/30 and Dispatch/calendar59/59, both exit0, zero fail/cancel/skip/TODO. Nine new actual PG/independent HTTP tests; legal core migration4–6 Pause checkpoint/I/O races observe actual Run locks, full mi
- `f-3e68e5e0f1` [root_cause/recorded] Turn22 confirms both code-review defects. P1 generic checkpoint accepts terminal/result writes in the migration9 profile without atomic Task/outcome/check/Delivery/notification completion. P2 migrateRecovery treats any legitimate later ledger version as incompatible. Added 12 actual full-profile PG 
- `f-3d3d357f1f` [evidence/recorded] Turn22 full five-check qualification job-199fe285bf at stable git:8075defcbfd68f2f50e02c55 passes recovery288/288 executions (280 distinct; calendar8 twice), identity35/35, foundation17/17, retainedG0197/G1local72 including outside-sandbox Electron44.5.1/Android, and evidence-index. All exit0, no wo

## Recent turns

- #21 review · codex · ok · 386s · progress — Recorded `loop_review(code, fail)` with two findings:

- **P1 — [repository.ts:94](/Users/super/Documents/ai/agent-fabric/g1-recovery/src/repository.ts:94):** Generic checkpoints can mark a configured
- #22 repair · codex · ok · 852s · progress — Fixed both findings: generic completion now requires the qualified atomic path, and migrations 4–10 rerun safely after upgrade.

Controller qualification passed: recovery 288/288 and all retained regr
- #23 review · codex · ok · 156s · progress — Security review recorded **pass**. No blocking findings within the documented local scope; no files modified.

Current-source TypeScript and evidence checks passed. Retained controller evidence confir
- #24 review · codex · ok · 311s · progress — Recorded `code: pass`. No new blocking findings; prior completion and migration defects are repaired.

Read-only checks and retained full regression evidence passed. Acceptance applies to the document
- #25 review · codex · ok · 300s · progress — Recorded acceptance **pass**. No blocking defects found in the documented local scope.

Verified evidence shows 288/288 recovery executions and all retained regressions passing. Current strict compila

## Recent notes

- 2026-10-07T01:07:16+00:00 [progress] Turn22 repaired P1 and P2. Installed migration9 result profile rejects generic terminal/result checkpoints (including no configuration); only atomic qualified finish remains, preserving isolated4 legacy behavior. Base migration pins/validates installed4–10 and prerequisites without reapplying4; inco
- 2026-10-07T01:13:31+00:00 [evidence] Turn22 full five-check qualification job-199fe285bf at stable git:8075defcbfd68f2f50e02c55 passes recovery288/288 executions (280 distinct; calendar8 twice), identity35/35, foundation17/17, retainedG0197/G1local72 including outside-sandbox Electron44.5.1/Android, and evidence-index. All exit0, no wo
- 2026-10-07T01:13:49+00:00 [handoff] Turn22 repair complete; no agents started. Changed only F03 src/repository.ts installed-profile terminal/result gate, src/migration.ts pinned4–10 compatible history/prerequisite validation, results-notifications.test.ts14 additions and F03 plan/acceptance/index/raw-copy appends. No accepted checks/m
- 2026-10-07T01:21:49+00:00 [handoff] Turn23 independent read-only security review of assigned git:c2ecd01199e945fa0bd7649b against base3875a4cae50434056225def6e2ebbfe338b6a9c1 plus staged/unstaged/untracked increment. No repository files edited; no agents started. Reviewed ledger/master sections6/8/14/20/28, roadmap/F01/F02/F03 qualifi
- 2026-10-07T01:26:53+00:00 [handoff] Turn24 independent read-only code review of assigned git:c2ecd01199e945fa0bd7649b against base3875a4cae50434056225def6e2ebbfe338b6a9c1 plus staged/unstaged/untracked increment. No repository files edited and no agents started. Reviewed requirements/ledger/master cited sections, roadmap/F01/F02/F03 s
- 2026-10-07T01:31:54+00:00 [handoff] Turn25 independent read-only acceptance review of assigned git:c2ecd01199e945fa0bd7649b against base3875a4cae50434056225def6e2ebbfe338b6a9c1 plus working-tree increment. No files edited and no agents started. Reviewed all F03 source/migrations/build/check/evidence runners and added tests against led

## Report

Turn22 repaired both confirmed code-review findings. P1: installed result profile rejects every generic terminal/result checkpoint, including configuration omission, requiring ResultRepository.finish's atomic qualified Task/Run/outcome/notification commit; isolated migration4 generic fixtures preserved. P2: base migration validates pinned versions4–10 and prerequisite ledgers and does not reapply4 after upgrade; altered/unknown/orphaned ledgers refused. Fourteen additive cases cover full-profile missing/failed checks/unconfirmed publication, all terminal statuses, recreated qualified recovery, existing malformed-input refusal, both observed Run/Space barrier completion orders, complete migration sequence twice preserving schema/functions/ACLs/policies/all fabric data/all ledger timestamps and incompatible digest/version/base refusals. All original cases/checks/migration SQL/protected/raw evidence preserved. Full stable five-check job-199fe285bf git:8075defcbfd68f2f50e02c55 passes recovery288/288 (280 distinct), identity35, foundation17, retainedG0197/G1local72 with outside-sandbox Electron/Android and evidence validation. Complete failed/pre-repair and repaired controller streams retained; docs disclose malformed initial fixtures and corrected SQL blocking observations, and post-check append with current evidence validator pass. Production Temporal/PostgreSQL, remote containment/HA/backup, supplier semantics/billing, enterprise identity/human approval, GUI all-path containment, physical devices/push/connector lifecycle/pilot timings remain unqualified. No agents, paid APIs/cloud resources/real credentials/remote deployment/messages/accepted checks changes. Submit repaired candidate for controller final acceptance and independent re-review.

## Goal queue

- ▶ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ○ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — ready · approved
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
