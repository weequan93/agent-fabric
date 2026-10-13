# Loop · agent-fabric: G1-F04 model

**DONE** — Review product-acceptance passed. 4 review(s) passed.

- Goal `agent-fabric-g1-f04-model-finops` · kind **develop** · updated 2026-10-07T20:19:25+00:00
- Next: **finished** (none) — Review product-acceptance passed. 4 review(s) passed.
- Runner: running · pid 86098 · adapter codex
- Turns 60/60 · agent time 825.1 min · reported cost $0.00 (partial: some turns reported no cost)

## Pipeline

● intake → ● requirements → ● requirements_review → ● solution → ● test_design → ● plan → ● resources → ● plan_review → ● develop → ● test → ● reviews → ● final-acceptance → ● product-acceptance → ● done

- intake: docs/loop/agent-fabric-g1-f04-model-finops/product-brief.md
- requirements: 100 recorded · final
- requirements_review: pass (round 1)
- solution: docs/loop/agent-fabric-g1-f04-model-finops/solution.md
- test_design: docs/loop/agent-fabric-g1-f04-model-finops/test-plan.md
- plan: 16 tasks · 0 uncovered · final
- resources: docs/loop/agent-fabric-g1-f04-model-finops/readiness.md
- plan_review: pass
- develop: 16/16 tasks
- test: integration:pass, regression:pass, regression:pass, regression:pass
- reviews: security:pass, code:pass
- final-acceptance: pass
- product-acceptance: pass

## Objective

Deliver the G1-F04 increment of Agent Fabric G1: Model adapter, qualified operating profile and FinOps integration (atomic reservation, retry, unknown usage, cost attribution). The deterministic test adapter is the acceptance route; a real supplier route, region, billing and paid enablement require a separate user decision.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-02: 模型家族使用经评估的完整operating profile — remaining: capability拒绝/切换fixture；实际provider conformance与可比任务
- AF-06: 企业模型访问预算和成本归属 — remaining: 原子reservation/retry/unknown usage；实际gateway billing reconciliation
- AF-18: 计算分配和持续计费显式 — remaining: service/computer分类和wait/charge契约；实际无VM Ask/cold start/存储成本

Create g1-model/ with a build and g1-model/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f04-plan.md and docs/evidence/g1-f04-acceptance.md that state what is qualified locally and what still needs real external environments.

## Tasks (16/16 done)

- ● `f04-01` Freeze additive contracts, package build and verification boundaries · architect
- ● `f04-02` Implement owned PG fixture and independent deterministic receipt adapter ← f04-01 · backend
- ● `f04-03` Implement eligible profiles, authorized context and safe proposal boundaries ← f04-01, f04-02 · backend
- ● `f04-04` Implement atomic shared allowance admission and immutable model intent ← f04-01, f04-02, f04-03 · data
- ● `f04-05` Implement coordinated retry, original-owner reconciliation and honest overrun settlement ← f04-02, f04-03, f04-04 · backend
- ● `f04-06` Compose native session entry point, durable waits, current output checks and Stop ← f04-03, f04-04, f04-05 · backend
- ● `f04-07` Implement synthetic resource interval accounting and lifecycle cost views ← f04-04, f04-05, f04-06 · backend
- ● `f04-08` Complete strict unit contract and pure native boundary suite ← f04-01, f04-03, f04-04, f04-05, f04-06, f04-07 · tester
- ● `f04-09` Execute profile conformance, selection, source and stream integration suite ← f04-08 · tester
- ● `f04-10` Execute atomic allowance, cost attribution and overrun integration suite ← f04-09 · tester
- ● `f04-11` Execute retry and durable unknown-usage crash/reconciliation suite ← f04-10 · tester
- ● `f04-12` Execute native wait, Stop and persistent resource integration suite ← f04-11 · tester
- ● `f04-13` Deliver and execute six documented local operator journeys ← f04-12 · tester
- ● `f04-14` Execute current authority, isolation, output and credential boundary suite ← f04-13 · security
- ● `f04-15` Complete qualification sabotage suite, evidence delivery and unchanged controller regressions ← f04-14 · tester
- ● `f04-16` Repair proposed-choice operator preflight and verify authenticated regressions ← f04-15 · tester

## Acceptance checks

- ✓ `g1-model-behavior` pass · 2026-10-07T19:56:04+00:00 — `node g1-model/scripts/check.mjs`
- ✓ `identity-behavior` pass · 2026-10-07T19:56:21+00:00 — `node g1-identity/scripts/check.mjs`
- ✓ `foundation-behavior` pass · 2026-10-07T19:56:24+00:00 — `node g1-foundations/scripts/check.mjs`
- ✓ `retained-baselines` pass · 2026-10-07T19:56:43+00:00 — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ✓ `security` (agent) pass · 2026-10-07T19:59:49+00:00 — No blocking security finding in the claimed deterministic-local increment. g1-model/src/profile.ts:122-134 now validates the same currently selected target and requires original-owner safe evidence, e
- ✓ `code` (agent) pass · 2026-10-07T20:07:55+00:00 — No blocking correctness, failure-handling, concurrency, data-loss, maintainability or requirement-conformance finding in the claimed deterministic local G1-F04 increment. profile.ts:122-134 now valida
- ✓ `final-acceptance` (agent) pass · 2026-10-07T20:12:28+00:00 — PASS for the authorized deterministic-local G1-F04 increment on assigned git:463a1625fdd39ccab6bab3f1, executable SHA256 c98deae8726b428aaf46a71374e7dfb579ab326edf929adbe95464927ef9263a. Unproven in-s
- ✓ `product-acceptance` (agent) pass · 2026-10-07T20:19:16+00:00 — PASS for the authorized deterministic-local G1-F04 increment on git:463a1625fdd39ccab6bab3f1, executable c98deae8726b428aaf46a71374e7dfb579ab326edf929adbe95464927ef9263a. No blocking product defect fo

## Findings

- `f-e65f3cc92f` [root_cause/recorded] Turn42 confirmed reviewer CODE-F04-004 with strengthened actual PostgreSQL P05: controller job-32a7469ce1 P226 has 224 pass/2 fail (post-encode fallback-revocation case plus P05 parent), specifically pendingModel surviving known pre-admission refusal. Repair establishes immutable non-dispatch under 
- `f-26ffd18b6b` [root_cause/recorded] PROD-F04-001 confirmed: proposed-choice preflight projected saved operatorInspect selection onto an estimate encoded for the proposed profile. Repair separates historical details and explicit proposed selection/next action, binds visible estimate to encoded profile digest, and adds actual authentica
- `f-3528e581de` [evidence/recorded] Controller targeted fixed job-e7f3182e59 PASS20/20, six original J01-J06 identities and five new authenticated PG preview variants, zero fail/cancel/skip/TODO. Controller mutation job-cccba81605 deliberately reintroduced ONLY selected choice:s.control.choice in operatorPreflight; all five new previe
- `f-19347beba5` [evidence/recorded] Full controller diagnostic job-30f9555ae4 PASS exit0/778514ms on executable ad1f71eacd20e0d40f13167beb326916983352b530e87a518b41cccee3a10f9d /151 inputs. Eight strict aggregate streams C1666/P241/B148/U118/N99/A111/Q51/J20=2454 tests,65 mandatory identities,zero fail/cancel/skip/TODO. stdout934114by
- `f-654b135a21` [root_cause/recorded] Turn49 runtime failure reproduced without modifying accepted checks: automatic acceptance checks-21e51ef434 runs all four unchanged commands under Node v20.12.2; F04/F02/G0 pin guards fail, foundation test loader rejects ESM emitted JavaScript under Node20. Original MCP acceptance.identity-behavior 
- `f-cbd7e24c39` [root_cause/recorded] Turn50 fresh unchanged MCP acceptance.identity-behavior job-696a642133 exits1 at Node22.22.3 guard and reports Node20.12.2; preserved foundation guard passes. Status shows new runner PID79720 launched 2026-10-07T16:33:15Z after Telegram Continue, so runner restart alone did not establish qualified P
- `f-c78d88a9f4` [root_cause/recorded] CODE-F04-001 confirmed. Shipped qualification advertised extra profiles while ModelService installed only default and profiles wrapper omitted selectEquivalent. Repair installs exact frozen channels for qualification and dispatch; equivalent retry policy is explicit trusted pairs. J02 now exercises 
- `f-5cbae9ae29` [evidence/recorded] New J02 operator slice passed25/25 in job-50dc317881 with all1733 preserved inputs and owned cleanup. Mutation job-8d5ab18fae default-only channel reproduced actual model-unavailable pre-dispatch wait (new second-pin regression failed); mutation job-a9ce047a74 removed only selectEquivalent and faile
- `f-2b893cb6c8` [root_cause/recorded] Turn56 confirms multi-target retry correctness finding. ProfileRegistry.selectEquivalent scans approved pair order independently from select(choice); with pin C and pairs A->B,A->C it substitutes B, then native current authority correctly rejects the pin mismatch. Added mandatory J02 authenticated s
- `f-10e560a17e` [evidence/recorded] Turn56 targeted job-adb636575c passed J28/P241,0fail/cancel/skip/TODO and1733 unchanged protected hashes. Initial red job-737325ba44 retained actual B-before-C model-unavailable refusal (two later qualifier failures due unused gates disclosed). Added failure gate cleanup and reran ONLY original sele

## Recent turns

- #56 repair · codex · ok · 1629s · progress — Repaired equivalent retry to honor the current selected target. Three-channel authenticated regressions cover both pair orders; restoring the old selector reproduces the failure.

Controller checks pa
- #57 review · codex @high · ok · 193s · progress — Recorded security review **pass**. No blocking security findings within the deterministic local scope.

Verified retained evidence: 2,462 model tests and unchanged regressions pass; all 1,733 protecte
- #58 review · codex · ok · 484s · progress — Recorded `code` review: **pass**. No blocking findings.

Verified current retained evidence: 2,462 model tests, all 65 mandatory cases, and required regressions pass. All 1,733 protected hashes remain
- #59 review · codex @high · ok · 272s · progress — Recorded `final-acceptance: pass`. No unproven requirements within the deterministic local scope.

Verified current evidence: 2,462 model tests, all 65 mandatory cases, required regressions, and 1,733
- #60 review · codex @high · ok · 409s · progress — Recorded `product-acceptance: pass`; the controller marked G1-F04 done. No blocking defects found in the deterministic local scope.

Verified 2,462 model tests, all 65 mandatory cases, passing retaine

## Recent notes

- 2026-10-07T19:26:17+00:00 [evidence] Turn56 targeted job-adb636575c passed J28/P241,0fail/cancel/skip/TODO and1733 unchanged protected hashes. Initial red job-737325ba44 retained actual B-before-C model-unavailable refusal (two later qualifier failures due unused gates disclosed). Added failure gate cleanup and reran ONLY original sele
- 2026-10-07T19:42:14+00:00 [handoff] Turn56 repair completed for multi-target equivalent retry finding. ProfileRegistry.selectEquivalent now resolves current choice via select and validates approved pair/equivalence/current policy against that same target; no approved-pair order substitution. Original-owner safe evidence/user permissio
- 2026-10-07T19:59:49+00:00 [handoff] Turn57 independent read-only security review of assigned git:463a1625fdd39ccab6bab3f1. No files edited, no agents started, no builds/fixtures or external provider/credential/spend actions performed. Reviewed AF-02/AF-06/AF-18 and cited specification/design/acceptance boundaries, authenticated IPC ->
- 2026-10-07T20:07:46+00:00 [handoff] Turn58 independent read-only code review of assigned git:463a1625fdd39ccab6bab3f1. No files modified, no agents started, no builds/fixtures rerun or external provider/credential/spend actions. Reviewed AF-02/AF-06/AF-18 requirements/specification, increment source/migrations/checker/tests/design/ope
- 2026-10-07T20:12:28+00:00 [handoff] Turn59 independent read-only final-acceptance review of git:463a1625fdd39ccab6bab3f1. No files modified, agents started, build/fixture/GUI reruns, provider/credential/spend/deployment or human-message actions. Read reviewed requirements/matrix, brief/solution/test design/readiness, roadmap/foundatio
- 2026-10-07T20:18:46+00:00 [handoff] Turn60 independent read-only product-acceptance review of assigned git:463a1625fdd39ccab6bab3f1. Read product brief/six journeys/Must/Should/success metrics, solution/test design/readiness, roadmap/foundations/ledger/master profile/accounting/resource contracts/F02 evidence, increment plan/acceptanc

## Report

Turn42 repair CODE-F04-004 is implemented and controller-verified for independent re-review. Safe pre-admission refusal now has a serialized permanent original; genuine committed/unknown usage remains reserved. Actual PG/operator rollback, concurrency, restart, explicit switch/resume/new turn and retry regressions pass. Integrated job-b58187c9bb on git:90b05e6394cd203d8486a38c / executable f93831fb7d7da8f9805d69e3b4770c00cfe80895c0d08edcb85085a677f52a3b passes all four unchanged behavior commands: 2449 model test nodes/65 mandatory cases, identity35, foundation17, original197+48+5+9+10 including controller GUI. Protected1733 hashes/model1–13 migration bytes unchanged. Evidence-index job-f58dae127b passes current executable/four-command binding; complete historical failures/pass streams retained. docs/evidence/g1-f04-acceptance.md and docs/planning/g1-f04-plan.md describe the repair and pending E01–E05. No independent verdict, full-G1 qualification or external provider/billing/deployment approval is claimed. Controller must re-review and own final/product completion.

## Goal queue

- ✓ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ▶ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — done
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
