# Loop · agent-fabric: G1-F07 clients

**READY** — Approved by human. Start with `loop start`.

- Goal `agent-fabric-g1-f07-clients` · kind **develop** · updated 2026-10-06T17:15:31+00:00
- Next: **intake** (agent) — Write the product brief: problem, users, journeys, goals, success metrics, scope and non-scope.
- Runner: not running
- Turns 0/60 · agent time 0.0 min · reported cost $0.00

## Pipeline

◐ intake → ○ requirements → ○ requirements_review → ○ solution → ○ test_design → ○ plan → ○ resources → ○ plan_review → ○ develop → ○ test → ○ reviews → ○ final-acceptance → ○ product-acceptance → ○ done

- intake: pending
- requirements: 0 recorded
- requirements_review: pending
- solution: pending
- test_design: pending
- plan: 0 tasks · 0 uncovered
- resources: pending
- plan_review: pending
- develop: 0/0 tasks
- test: integration:-, regression:-, regression:-, regression:-
- reviews: security:-, code:-, devices:-
- final-acceptance: pending
- product-acceptance: pending

## Objective

Deliver the G1-F07 increment of Agent Fabric G1: Web/Electron/mobile operating the same Task: shared events/reconnect, desktop sleep → mobile steer/Stop → web/desktop result, distinct pilot timing measurements, then complete G1 independent acceptance.

Ledger requirements in scope (docs/planning/g1-remaining-ledger.csv):
- AF-04: 桌面移动网页操作同一Task — remaining: 共享事件/重连契约；真实desktop sleep/mobile steer/web result/stale Stop
- UX-04: Act preflight后桌面睡眠远端继续移动端同任务 — remaining: accepted/reconnect契约；真实desktop sleep/mobile steer/结果

Create g1-clients/ with a build and g1-clients/scripts/check.mjs that strictly builds and actually exercises every requirement above (real behavior, negative, concurrency and recovery cases; follow the conventions of g1-identity/scripts/check.mjs), plus docs/planning/g1-f07-plan.md and docs/evidence/g1-f07-acceptance.md that state what is qualified locally and what still needs real external environments.

## Acceptance checks

- ○ `g1-clients-behavior` not run — `node g1-clients/scripts/check.mjs`
- ○ `identity-behavior` not run — `node g1-identity/scripts/check.mjs`
- ○ `foundation-behavior` not run — `node g1-foundations/scripts/check.mjs`
- ○ `retained-baselines` not run — `node g1-foundations/scripts/check-retained.mjs`

## Reviews

- ○ `security` (agent) pending
- ○ `code` (agent) pending
- ○ `final-acceptance` (agent) pending
- ○ `product-acceptance` (agent) pending
- ○ `devices` (human) pending

## Goal queue

- ○ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — running · approved
- ○ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — ready · approved
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ○ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ▶ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
