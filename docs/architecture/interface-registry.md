# G0 public interface registry

The registry fixes responsibility and safety semantics before implementation. Exact TypeScript declarations are owned by G0-02, exported through explicit .js ESM imports. Subsequent packages use one shared identity, error, fence and budget vocabulary, not independent replacement authorities.

## Shared declarations

| Contract / module | Public interface | Failure / concurrency / restore |
|---|---|---|
| identity.ts | validated string aliases for tenant/Space/actor/Task/Run/operation/command/artifact IDs; ScopeRef; AuthenticatedActorRef; Clock; IdFactory; FencingToken; DomainError; Result; canonical digest | runtime parsers reject empty identity/non-JSON or unsafe numeric values; aliases are not nominal compile-time brands; immutable scope; server actor references |
| task-envelope.ts | Intent ask/plan/act; EffectClass; SourceRef; TargetRef; TaskEnvelope; strict parse/serialize; version pins | closed versioned schema, required audience and targets; unknown security fields/partial arguments deny; explicit migration or UNSUPPORTED_VERSION |
| commands.ts | CommandEnvelope, StopCommand, Command, CommandAcceptance | ordinary expected revision/expiry; Stop current authority and immutable identity despite stale view; same scoped key identity |
| events.ts | versioned DomainEvent/RunEvent; EventCursor; AuthorizedSnapshot | monotonic per-stream sequence; invalid histories reject; reducers pure; cursor fallback current authorized snapshot |
| adapters.ts | ModelCapabilities; RuntimeCapabilities; ToolDefinition; QualificationRef; EffectExecutor; ExecutionReceipt; ReconciliationResult | mandatory features explicit, pin provider/region/deployment; no fallback to unqualified backend; receipt provenance required |
| budget.ts | BudgetPort.reserve/markUnknown/settle/release/inspect; ReservationRequest; Reservation; UsageSettlement; RetryBudget | amounts nonnegative safe integers, server scope/payer, parent-child atomic allowance; unknown retained, settlement dedup/conflicts reject; one engine/gateway retry allowance |

## Package-owned entry points

| Package / owner | Interface and trusted input | Required control / restore |
|---|---|---|
| 03 Spaces/identity/policy | bind trusted Space, authenticate actor, effectiveAuthority(six layers), readable source + shareable destination | current revisions, explicit group trigger, strict intention ceiling; authority outage/revocation denies |
| 04 artifact/outbox/data | confirmBytes, commitManifest, transaction/outbox, tombstone restore | no partial publish, same-scope FKs/grants, idempotent late jobs/current authority, committed manifests only |
| 05 Task/Run/kernel | task/run reducers, transition matrix, next session action | controller owns completion/check gate; terminal retry new attempt, pure replay and unknown waiting |
| 06 command/events API | dispatchCommand, queryCommand, event cursor/snapshot | authorizes before dedup; immutable target, no changed approval replay, uncommitted tokens ignored |
| 07 effect broker | prepareOperation, dispatch, reconcile | exact digest/artifact/policy/actor approval + lease + fence + BudgetPort; no blind unknown retry |
| 08 scheduler/desktop broker | Stop-run/Task, current fence validator, mutation barrier | shell/SDK/API/filesystem/browser/desktop covered; old generation denies; disconnected input never replay |
| 09 compiler/profile/model | compileContext, qualify profile, invoke via reserve | authorize before retrieval; no-VM Ask; no capability dropping/provider fallback; hostile data is not authority |
| 10 FinOps/scheduler | BudgetPort implementation and unified retry manager | atomic allowance across children; unknown retains; settlement idempotent; grants after top-up |
| 11 artifact/verifier/delivery | version CAS/variant, validate registered CheckReceipt, delivery status | exact candidate/lock/environment/check digest; no worker attestation, notification separate |
| 12 runtime/tool/channel/conformance | runtime lifecycle, tool effect/resource/schema/grants/reconcile, channel identity/audience, trusted qualification | version/expiry/tested deployment; mandatory controls; capability loss fences lease, fresh replacement credentials |
| 13 presentation/future modules | view state, memory/version/delete, desktop protocol, behavior release/rollback | private title/source boundaries, last-update/not-delivered, fact edits not release; archive/suspend/delete distinct |
| 14 integration/protected tests | fixed independent oracle registry, deterministic transport/counters, integrated ledger/recovery | all allowed/denied/recovery branches executed, no skips or changed expected results; evidence assurance classified |

## Stable errors

INVALID_SCHEMA, UNSUPPORTED_VERSION, REQUIRED_CAPABILITY_UNSUPPORTED, UNAUTHORIZED, AUTHORITY_UNAVAILABLE, SCOPE_MISMATCH, INTENT_EXCEEDED, STALE_REVISION, EXPIRED_COMMAND, IDEMPOTENCY_CONFLICT, APPROVAL_MISMATCH, APPROVAL_EXPIRED, STALE_FENCE, LEASE_EXPIRED, BUDGET_EXHAUSTED, TERMINAL_RUN, UNKNOWN_EFFECT_REQUIRES_RECONCILIATION, ARTIFACT_NOT_COMMITTED, CHECK_BINDING_MISMATCH.

Each error is machine readable and has a safe resolver: refresh current authorized state, obtain exact approval, wait for authority/budget, reconcile unknown identity, or request a new qualified attempt. An error never implies authority to retry or disclose private state.

## Compatibility and build boundary

Each Run pins engine/schema/behavior/environment; adapters pin required manifests. A version switch is explicit and validated, never silently applied mid-Run. Closed runtime schemas reject unsupported mandatory capabilities. Canonical digests include every exact security precondition and reject partial streamed arguments until a complete parsed object exists.

Build probe actually installed TypeScript 5.9.3 and @types/node 22.18.6 with pnpm 10.18.0 on Node 22.22.3; G0-02 owns lockfile and clean-copy frozen-install/typecheck/test qualification. Generated outputs go under node_modules/.cache/agent-fabric-build, outside candidate inputs. License/update ownership remains build owner, recorded in final evidence.

Interface questions that would change authorization/effect semantics: 0. Implementation defects or compatibility conflicts are returned to their owner, never repaired by weakening protected oracles. Formal independent security/review/acceptance are pending until the integrated G0 candidate exists.

## Session model reconciliation

`engine/kernel/src/session-loop.ts` exports `SessionModelOperation` (operationId/reservationId) and `SessionModelResolution` (exact original identity, completed/safely-failed/unknown, receiptId). `SessionState.pendingModel` is persisted in the session's contiguous event history before async invocation. It fences model and effect continuation, and a live restore cannot rewrite the observed history prefix.

Trusted server `SessionPorts.modelOperation` binds the real adapter identity; `modelResolution` performs current original-owner lookup. `SessionLoop.resolveModel(operationId)` accepts an identity and uses that port rather than accepting a caller's outcome. Completed reconciliation requires the original nonempty receipt and current authorization after asynchronous lookup. When this port exists, returned model text also requires completed owner evidence; unknown usage remains pending. An in-flight call rejects premature absence reconciliation. Legacy trusted successful string-returning model ports retain their API; an error without trusted resolution remains unknown. Current verification and the previous blocking result are source-linked in `docs/evidence/g0-security-repair.json`.

### Cross-Space source destination authority

`AuthorityRequest.destination` is an optional caller hint, never authority to select the actual context. `AuthorityService` derives that destination from the admitted `TaskEnvelope.scope`. Cross-Space source use requires both current source and destination sharing grants even when the hint is omitted; an explicit hint that differs from the envelope fails. Ordinary same-Space reads remain subject to readability and current membership without requiring a sharing grant. The admission records both sides for `assertCurrent`, so revocation invalidates cached cross-Space access before retrieval or dispatch.
