# Loop · agent-fabric: G1-F06 runtime

**READY** — Approved by human. Start with `loop start`.

- Goal `agent-fabric-g1-f06-runtime` · kind **develop** · updated 2026-10-06T17:15:31+00:00
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

## Goal queue

- ○ 1. `agent-fabric-g1-f03-recovery` agent-fabric: G1-F03 recovery — running · approved
- ○ 2. `agent-fabric-g1-f04-model-finops` agent-fabric: G1-F04 model — ready · approved
- ○ 3. `agent-fabric-g1-f05-storage` agent-fabric: G1-F05 storage — ready · approved
- ▶ 4. `agent-fabric-g1-f06-runtime` agent-fabric: G1-F06 runtime — ready · approved
- ○ 5. `agent-fabric-g1-f07-clients` agent-fabric: G1-F07 clients — ready · approved

The runner continues with the next approved goal after this one is done.

---
Controller-owned file; regenerated on every change. Commands: `loop status`, `loop next`, `loop dashboard`. Agents: use the loop MCP tools.
