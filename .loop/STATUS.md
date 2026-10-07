# Loop · agent-fabric: G1-F04 model

**RUNNING** — Turn 2: requirements — Read the documents and record every requirement with its source and how it will be verified.

- Goal `agent-fabric-g1-f04-model-finops` · kind **develop** · updated 2026-10-07T01:34:39+00:00
- Next: **requirements** (agent) — Read the documents and record every requirement with its source and how it will be verified.
- Runner: running · pid 31890 · adapter codex
- Turns 2/60 · agent time 2.5 min · reported cost $0.00 (partial: some turns reported no cost)

## Pipeline

● intake → ◐ requirements → ○ requirements_review → ○ solution → ○ test_design → ○ plan → ○ resources → ○ plan_review → ○ develop → ○ test → ○ reviews → ○ final-acceptance → ○ product-acceptance → ○ done

- intake: docs/loop/agent-fabric-g1-f04-model-finops/product-brief.md
- requirements: 0 recorded
- requirements_review: pending
- solution: pending
- test_design: pending
- plan: 0 tasks · 0 uncovered
- resources: pending
- plan_review: pending
- develop: 0/0 tasks
- test: integration:-, regression:-, regression:-, regression:-
- reviews: security:-, code:-
- final-acceptance: pending
- product-acceptance: pending

## Objective

Deliver the G1-F04 increment of Agent Fabric G1: Model adapter, qualified operating profile and FinOps integration (atomic reservation, retry, unknown usage, cost attribution). The deterministic test adapter is the acceptance route; a real supplier route, region, billing and paid enablement require a separate user decision.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-02: 模型家族使用经评估的完整operating profile — remaining: capability拒绝/切换fixture；实际provider conformance与可比任务
- AF-06: 企业模型访问预算和成本归属 — remaining: 原子reservation/retry/unknown usage；实际gateway billing reconciliation
- AF-18: 计算分配和持续计费显式 — remaining: service/computer分类和wait/charge契约；实际无VM Ask/cold start/存储成本

Create g1-model/ with a build and g1-model/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f04-plan.md and docs/evidence/g1-f04-acceptance.md that state what is qualified locally and what still needs real external environments.

## Acceptance checks

- ○ `g1-model-behavior` not run — `node g1-model/scripts/check.mjs`
- ○ `identity-behavior` not run — `node g1-identity/scripts/check.mjs`
- ○ `foundation-behavior` not run — `node g1-foundations/scripts/check.mjs`
- ○ `retained-baselines` not run — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ○ `security` (agent) pending
- ○ `code` (agent) pending
- ○ `final-acceptance` (agent) pending
- ○ `product-acceptance` (agent) pending

## Recent turns

- #1 intake · codex @high · ok · 147s · progress — Created the [product brief](docs/loop/agent-fabric-g1-f04-model-finops/product-brief.md) covering users, journeys, scope, priorities, success metrics and external qualification gaps.

Intake was submi

## Recent notes

- 2026-10-07T01:34:32+00:00 [handoff] Intake completed and submitted via loop_stage_done; controller advanced to requirements. Added only docs/loop/agent-fabric-g1-f04-model-finops/product-brief.md (108 lines), covering users, six journeys, AF-02/06/18 Must outcomes, priorities, measurable acceptance, constraints, risks and explicit ext

## Goal queue

- ✓ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — done
- ▶ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — running · approved
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
