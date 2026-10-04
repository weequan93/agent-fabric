# G0 native controller architecture

Status: implementation baseline for G0-01. Sources: [accepted plan](../planning/g0-implementation-plan.md), [decisions](../planning/decision-register.md), [specification v1.1](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md). Prior planning is historical and remains byte-for-byte unchanged. This document does not attest deployment safety.

## Execution classes and ownership

| Class | Admission | Authority owner | Failure boundary |
|---|---|---|---|
| conversation | authenticated current Space, Ask/Plan ceiling, readable sources, qualified model, budget reservation | controller and authority repository | model cancellation/usage uncertainty; no Space VM provisioning |
| computer | explicit assigned ComputerAssignment, Act ceiling, qualified runtime generation, lease, budget and current grants | controller; broker owns mutation dispatch | worker disconnect/capability loss fences credentials; unknown external outcomes reconcile |
| external-effect | exact target/parameters/artifact/policy/actor approval and expiry, current fences and reservation | ActionBroker operation repository | downstream commit/ack loss is unknown, never ordinary safely failed retry |

SessionKernel proposes one next action from typed state. It has no authority to grant permissions, raise ceilings, mint approvals, accept protected checks or release behavior. Scheduler owns Task requirements/revision, immutable Run attempts, cancellation generations, waiting resolvers and budget admission. Query projections, model streams and clients are derived views. No model or competing product harness controls the durable state machine.

## Invocation path

Authenticated actor → current Space binding → six-layer effective authority → immutable TaskEnvelope/version pins → controller state admission → reservation → exact operation preflight/fence → executor → receipt or unknown → reconciliation/settlement → protected verification → optional separate delivery → notification.

Retrieval checks current authority before calling its source. Model calls reserve before invocation; Ask has no provision callback in its admission path. Group discussion is inert unless an explicit authorized trigger is supplied. Switching the visible Space cannot change the scope, target or payer of a pending command or effect.

## Implementation and concurrency

G0 uses strict TypeScript ESM/NodeNext, native Node tests, dependency-injected Clock/IdFactory, deterministic executors and synchronous in-memory owner repositories. Public errors are stable structured DomainError codes; failures are explicit and fail closed. Canonical JSON uses recursively sorted object keys, preserves array order and rejects non-JSON/unsafe values before SHA-256 hashing.

Repository mutation is the linearization point. Current grants, version, terminal state, lease, three fencing generations and reserve admission are checked in the same synchronous critical section immediately before effect invocation. An asynchronous boundary requires revalidation before a subsequent invocation. In-flight effects cannot be unsent by Stop: they retain an unknown outcome until safe lookup establishes a receipt. An old generation cannot publish, dispatch, accept GUI input or settle under a replacement identity.

Pure reducers replay versioned events without model, retrieval or write-executor calls. Terminal Runs remain immutable; retry creates a new Run and preserves charges/evidence. An unavailable authority service blocks affected reads and dispatch rather than using historical grants.

## Recovery order

1. Load authoritative identity, current grants, revocations and deletion tombstones.
2. Rebuild only authorized projections and committed artifact references.
3. Reconcile existing unknown operation/usage/delivery identities; retain unknown reservations when no safe lookup exists.
4. Validate current qualification, policy, lease, version pins and fencing generations.
5. Continue with an explicit safe next action or waiting resolver; never replay writes from events.

Restore, top-up, version switch, replacement worker and changed approval each require their own current authority. A stopped Task admits a new Run only after explicit authorized retry unlocks it. User pause/cancel and missing mandatory capability are visible gates.

## Assurance and future gates

G0 validates actual local contracts/controller behavior with deterministic substitutes. These tests are not PostgreSQL RLS, encrypted object durability, Temporal integration, SSO directory lifecycle, provider metering/cancellation, VM/kernel containment, browser isolation, real three-client reconnect or all-path desktop takeover evidence. G1 qualifies its actual deployments; G3 validates all six mutation paths; G4 qualifies independent behavior release/holdouts; G5 qualifies each extension/runtime profile. Worktrees, serial locks, MCP/ACP/A2A compatibility and hardware flags are not isolation proof. No cloud deployment or real charge is authorized in this batch.

No material product question is unresolved for this local baseline. Production overrun/regions/SSO/runtime choices remain pending at their accepted future gates.

