# G1-F04 solution: qualified local model calls and native FinOps

Date: 2026-10-07. Stage: solution. Role: architect. Status: design for independent test design and planning; no product implementation or behavioral acceptance is claimed here.

## 1. Decision and source boundary

Add an independently built `g1-model/` TypeScript package. Compose the existing native session semantics, authenticated PostgreSQL unit of work and current audience checks with a durable model-call repository and one native budget owner. A separately running deterministic adapter owns its downstream acceptance/usage receipts. The native controller owns selection, admission, retries, waits, Stop and continuation; the adapter never plans or increases authority. Synthetic model and resource units have no currency conversion.

The reviewed controller inventory contains 100 requirements: AF-02 and AF-02-01–20, AF-06 and AF-06-01–28, AF-18 and AF-18-01–15, supporting UX-11, and R-001–33. The corrected AF-02-07 explicitly requires **Auto - organization approved** when no choice is supplied. This document preserves those requirements and external gates; it does not amend the requirement inventory.

Sources read for the design:

- [Product brief](product-brief.md), six journeys and measurable qualification boundaries.
- [Roadmap](../../planning/roadmap.md), [foundations plan](../../planning/g1-foundations-plan.md), [remaining ledger](../../planning/g1-remaining-ledger.csv), AF-02/AF-06/AF-18 and supporting UX-11.
- [Master v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md), §§2, 7–12, 17, 22, 25–32: ownership, profiles/context, accounting, allocation, current authority, evidence and qualification.
- [F02 evidence](../../evidence/g1-f02-acceptance.md), especially original-key lock/lookup and lost-COMMIT handling; [decision register](../../planning/decision-register.md) and [design bundle](../../agent-fabric-design/README.md). Historical planning/sample design regions or prices are not approvals.
- [Native architecture](../../architecture/native-engine.md), [record owners](../../architecture/record-authority.md), [interface registry](../../architecture/interface-registry.md), [local API/recovery](../../architecture/g1-local-runtime-and-api.md), [client/module contracts](../../architecture/client-and-module-contracts.md).

Paid or external supplier routes, real credentials, cloud resources, shared releases and messages remain disabled. No human decision is needed for this local design. Before any external work, obtain the exact approval through `loop_ask(kind=approval)`; no supplier, commercial region, tariff or gateway edition is selected by this document.

## 2. Existing layout and dependencies

| Existing component inspected | Reuse or constraint |
| --- | --- |
| Root `package.json`, `tsconfig.base.json`; independent G1 package/locks/build scripts | Node 22.22.3, pnpm 10.18.0, TypeScript 5.9.3, Node types 22.18.6; ESM/NodeNext, strict checking, disposable cache output. Add a separate package/lock, without altering root discovery or accepted packages. |
| `engine/kernel/src/session-loop.ts` | Native `SessionLoop`, `SessionModelOperation`, `SessionModelResolution`, reducers and `pendingModel` fence. The owner-resolution port accepts an original identity, and in-flight absence cannot clear pending work. Compose these unchanged. |
| `engine/context/src/compile.ts`, `engine/profiles/src/capabilities.ts`, `adapters/models/src/model-adapter.ts` | Existing typed capsules, authorized retrieval, provider-scoped cache and local adapter contracts are useful vocabulary. Their in-memory registry/call maps are not durable F04 authority or full operating-profile qualification. Add a complete profile contract and adapter encoding; do not monkey-patch them. |
| `engine/contracts/src/budget.ts`, `engine/scheduler/src/budget-ledger.ts`, `adapters/models/src/retry-budget.ts` | Nonnegative safe integer units; reserved/unknown/settled/released; one retry allowance. Their synchronous G0 ports remain unchanged. The PG implementation needs an explicit asynchronous port, not a cast of promises to `BudgetPort`. |
| `infra/migrations/0001_core_records.sql` | Reuse authoritative `tasks`, `runs`, `budget_allowances`, `budget_reservations`, `usage_settlements`. Existing numeric/conservation/immutable-history constraints stay intact. New metadata and overflow liability are additive. |
| `g1-foundations/src/contracts.ts`, `postgres-uow.ts` | Use issued `VerifiedScope`, original-session revalidation plus transaction-locked authority, nonprivileged controller connection, transaction-local scope/reset and typed `UNKNOWN_COMMIT`. Never construct a verified scope from JSON. |
| `g1-identity/src/current-authority.ts`, `authenticated-uow.ts`, `audience.ts` | Current OIDC/test-session identity, late token/session expiry checks, source/destination audience and payer authority. No new login/role authority. |
| `g1-recovery/src/fence-guard.ts`, repository, native activities/workflow, schemas and migrations 4–10 | Reuse installed Space barrier/Run fencing and version vocabulary. Existing native checkpoint adapter is synchronous inside a transaction; do not insert awaited inference into it. F04 uses durable prepare/accept/settle around an asynchronous port. Accepted F03 execution/history/checks remain unchanged. |
| `g1-identity/scripts/check.mjs`, foundation PG fixture and recovery process fixtures | Strict build, pinned offline dependencies, mandatory nonempty Node TAP suites, no skips/TODO, actual PG/loopback/owned processes, original migration compatibility and before/after preservation guards. Extend this convention in a new runner. |

Dependency direction: `g1-model` → unchanged engine contracts/reducers/compiler; foundation UoW; identity authentication/audience; recovery fence helpers. Those packages do not import F04. The adapter sees only a validated encoded request and its own receipt interface, never the controller pool, session credential or mutable allowance. Do not import recovery test fixtures that drag Temporal dependencies into the model runtime; use a new owned fixture following their pattern.

## 3. Options and trade-offs

| Option | Benefits | Rejected cost or limitation |
| --- | --- | --- |
| Extend accepted G1-local SQLite service and reuse its serialized state | Fewest components; real file persistence and existing UI journey | Requires changing accepted local sources/check boundaries, introduces a separate billing authority beside the PG foundation, and does not exercise PG multi-account contention. Rejected for this additive increment. |
| Independent PG model/FinOps module composed into the native controller, deterministic downstream service | Reuses F01/F02 authority, actual multi-process transactions, existing base budget tables, and a separate acceptance/receipt boundary; no commercial dependency | More fixture/SQL work; short dispatch-accept locks and explicit asynchronous contracts must be tested. **Chosen.** |
| Add real LiteLLM/provider SDK plus a new workflow/router | Could establish real supplier and billing observations after authorization | Supplier, edition, keys, route, region and spend are undecided; another retry/router owner conflicts with native ownership. Deferred; real gateway belongs behind the same qualified adapter port after a separate decision. |

ADR F04-01: use PG and the existing native owner contracts. ADR F04-02: one durable retry counter and independently identified chargeable attempts. ADR F04-03: original downstream lookup/seal before release; unknown is a liability. ADR F04-04: refuse response caching initially; keep provider-private state scoped. ADR F04-05: resource accounting is a deterministic contract, with real provisioning/isolation/tariffs deferred.

## 4. Components and record owners

Proposed implementation files are downstream deliverables, not files created in this stage:

| Module | Responsibility / authority |
| --- | --- |
| `src/contracts.ts`, `schema.ts`, `errors.ts` | Closed versioned request/profile/capsule/receipt/event schemas, type inference and safe errors. Reuse canonical hashing, ID and numeric vocabulary. |
| `src/profile.ts`, `context.ts`, `qualification.ts` | Full profiles, explicit eligible Auto/pin/equivalent selection, current context manifests, safe switch capsules and executable local conformance records. Profiles are installed by the trusted composition root; model self-declaration is insufficient. |
| `src/budget-repository.ts`, `retry-repository.ts` | **One native FinOps owner** of existing allowance/reservation/settlement tables and new aggregate/overflow metadata. All model, declared tool and resource costs use this owner. Adapter retry requests consume this same durable attempt counter. |
| `src/model-repository.ts` | Durable operation/attempt identity, request digest, dispatch claim, usage state and original-key receipts; atomically links budget, session-pending event, audit and outbox. |
| `src/model-service.ts`, `native-session.ts` | Native controller composition/admission/dispatch/reconciliation/continuation, current authority, output checks and durable event persistence. Use unchanged native reducers and `SessionLoop` semantics; no second planner. |
| `src/test-adapter.ts`, `test-adapter-process.ts` | Deterministic loopback-only request encoder/stream and downstream acceptance/usage/seal owner, stored durably under a separate restricted fixture role. This is a simulated provider boundary, not a provider SDK or real gateway. |
| `src/resource-contract.ts`, `view.ts`, optional `operator.ts` | Classified preflight, simulated single-assignment contention, charge intervals and authorized/redacted views. No shell, provisioner, arbitrary URL or real lifecycle endpoint. |
| `migrations/`, `src/migration.ts`, `scripts/build.mjs`, `scripts/check.mjs`, `tests/` | Independent additive migration ledger, owned fixture, strict build and executable qualification. |

Existing identity owns actors, membership, sessions, payer and policy. Existing scheduler Task/Run records own immutable task/run bindings and cancellation. F04 extends the native session with model-operation/session events; it does not create a competing copy of Task/Run, result, approval or effect authority. Recorded F04 events are authoritative session/model history; reducers/views are projections. The adapter owns its accepted-request and usage receipt, not the native ledger. Qualification owner records local probe results; required independent release reviews remain controller-owned.

F04 exposes only its composed model/session entry point. Legacy trusted F03 methods are not separate endpoints for F04 sessions. All F04 model and test effect continuations pass the durable pending-operation fence and native intent checks. External tool proposals are validated but cannot execute through this package; the only effect-continuation acceptance callback is an instrumented local test port behind the native fence. This is not a claim that an unchanged legacy endpoint gains F04 integration automatically.

## 5. Data model and executable contract target

All identities are server-assigned UUIDs at the PG boundary. Security records use closed schema decoders, bounded arrays/strings and exact schema versions. Reject unknown fields, accessors/non-JSON values, absent required flags and invalid/unsafe arithmetic before mutation. Runtime decoders must validate the relationships below; TypeScript alone is insufficient.

| Record | Required bindings and invariants |
| --- | --- |
| `OperatingProfile v1` | Profile ID/version/digest; provider/model/modelVersion/deployment/route/region/dataPolicy; instruction-pack digest, tool-presentation/schema dialect and digest, context-policy digest, reasoning controls, verifier ID/digest, runtime requirements; capabilities and cost assumptions. Route names are synthetic identifiers, not commercial-region approvals. |
| `ModelCapabilities v1` | Modalities; tool/schema dialect; streaming text/tool arguments; context limit and unit; usage reporting mode; cancellation request/lookup/termination distinction; private-state caching, exact/semantic response cache; required optional features; output/duration cap support. Every declared support is exercised or explicitly refused. |
| `LocalQualification v1` | Profile/capability/version digests, adapter version/deployment, environment and lock/check-definition digests, registered probe identity, testedAt/expiresAt, executed case references and assurance `deterministic-local-only`. Expired/revoked/mismatched/untested claims cannot select a route. |
| `TaskCallBinding v1` | Original tenant, Space, actor, immutable task payer/cost center, Task/Run/parent-child relation, native session, purpose/category, requirement revision, engine/behavior/schema/environment/lock pins, current policy/membership/source revisions, cancellation/worker/resource generation. Server derives these from authoritative admission; client tags are not inputs to payer selection. |
| `ContextManifest v1` | Authorized typed records: source ID/revision/digest, scope/audience, provenance, observation time, trust; policy/membership revisions, actual profile/encoding digest. Capsule also preserves requirements, selected evidence, hypotheses/uncertainty, failed plans, pending operations, artifact references, checks and next safe action. Final request hashes the complete manifest. |
| `ModelOperation v1` | Original logical call ID, session turn, immutable request/binding digest, original key, retry ceiling, pending/known result. One logical identity owns all attempts; changed payload under the same key conflicts. |
| `ModelAttempt v1` | Logical operation + ordinal + attemptId + reservationId + exact route/profile/context + retry requester layer + dispatch epoch/claim. Distinct potentially chargeable attempts have distinct reservation and usage keys; transport lookup/dedup retains the original attempt. |
| Base budget + new `model_budget_metadata` | Existing same-Space allowance ancestry and safe-integer reservation amounts; server payer/purpose/cost center/category, immutable lineage and policy. Parent/children share ancestor counters; child allowance may restrict further but never copies usable capacity. |
| `model_limit_accounts` / `model_limit_bindings` | Owner-installed tenant/department/person/Space/task/run account keys and limits. Each obligation joins all applicable accounts once. Same billable person across Spaces shares an account, but never a source/audience namespace. Aggregate account access is through fixed privileged ledger functions, not cross-Space table reads. |
| `model_usage_receipts`, existing `usage_settlements`, `model_overrun_liabilities` | Original attempt/reservation/digest/owner usage key, measured units, outcome, category components, synthetic label. Receipts immutable; same usage cannot settle another call. Excess measured units are retained separately without weakening original amount/ceiling constraints; see §8. |
| `model_session_events`, `model_command_receipts`, audit/outbox | Contiguous native session history plus pending/resolution, scoped actor/key/digest, monotonic sequence/revision. Transaction commits intent/reservation/pending event/audit/outbox together. Key lookup and writer share the same scoped transaction lock, excluding payload digest from the lock namespace. |
| `model_resource_charges` / allocation view | Owning tenant/Space/resource/generation, category, bounded half-open interval `[start,end)`, rate-policy version, receipt identity, correlated Run/action/call when applicable. No overlapping full-machine interval twice, even if tasks differ. Per-task view says `unallocated-shared-cost` initially. |

The following minimal type contract fixes the asynchronous boundary and the distinction between an unresolved owner observation and authoritative non-acceptance. It is a compilable design excerpt; downstream `contracts.ts` must bind it to closed runtime decoders and the actual native types.

```typescript
export type Units = number; // Runtime: nonnegative Number.isSafeInteger; sums checked too.
export interface OriginalCall {
  readonly tenantId: string; readonly spaceId: string;
  readonly operationId: string; readonly attemptId: string;
  readonly reservationId: string; readonly requestDigest: string;
}
export interface UsageReceipt {
  readonly original: OriginalCall; readonly ownerId: string;
  readonly receiptId: string; readonly usageKey: string;
  readonly measuredUnits: Units;
  readonly outcome: 'answer' | 'known-failure' | 'cancelled';
  readonly outputDigest: string | null;
  readonly assurance: 'deterministic-local-only';
}
export type OwnerObservation =
  | { readonly status: 'settled'; readonly receipt: UsageReceipt }
  | { readonly status: 'accepted'; readonly original: OriginalCall }
  | { readonly status: 'unknown'; readonly original: OriginalCall }
  | { readonly status: 'sealed-not-accepted'; readonly original: OriginalCall;
      readonly ownerId: string; readonly proofId: string; readonly dispatchEpoch: number };
export interface EncodedRequest {
  readonly original: OriginalCall; readonly profileDigest: string;
  readonly contextDigest: string; readonly payload: string;
  readonly outputCap: Units; readonly durationCapMs: number;
}
export interface ModelAdapterPort {
  accept(request: EncodedRequest): Promise<OwnerObservation>;
  lookup(original: OriginalCall): Promise<OwnerObservation>;
  cancel(original: OriginalCall): Promise<OwnerObservation>;
  sealUnaccepted(original: OriginalCall, dispatchEpoch: number): Promise<OwnerObservation>;
}
export interface AsyncBudgetPort {
  reserve(original: OriginalCall, units: Units): Promise<void>;
  markUnknown(original: OriginalCall): Promise<void>;
  settle(receipt: UsageReceipt): Promise<void>;
  release(proof: Extract<OwnerObservation, {status: 'sealed-not-accepted'}>): Promise<void>;
}
```

Additional schema refinements: nonempty identity/digest, exact original binding equality, receipt owner in the installed registry, epoch equality, coherent outcome/output, measured/estimated/settled values kept distinct, required profile capability proof, positive finite caps, ordered valid intervals, full parsed streamed arguments, and coherent wait/terminal fields. Invalid union combinations are failures. Adapter observations are obtained only through trusted ports; posting an object shaped like `UsageReceipt` or `OwnerObservation` does not confer authority.

## 6. Selection, context and adapter conformance

1. Omitted choice normalizes to Auto - organization approved. Filter current organization approval, profile qualification/expiry, capabilities, runtime class, route/region/data policy and current source restrictions before applying a fixed installed preference order. No eligible Auto profile yields a model-unavailable wait/refusal and zero dispatch. Show modality, data policy and estimated cost class even before work.
2. Explicit manual choice selects that exact qualified profile. Busy/unavailable pins wait; fallback requires explicit current user/policy permission and an installed equivalence relation. No semantic/residency change is an automatic gateway failover. Preference Fast/Balanced/Thorough cannot change Ask/Plan/Act or grants.
3. Initial supported fixture: text input/output, complete bounded JSON/tool arguments in one documented local dialect, incremental text/tool fragments, finite context/output/duration limits in **synthetic UTF-8 byte units**, delayed/known usage, cancellation request plus original lookup, provider-private opaque state. Image/audio, arbitrary dialects, embeddings/reranking execution and undeclared optional features refuse explicitly. Planning and within-task reflection use the task allowance; separate maintenance is allowed only with an owner-installed maintenance allowance. Embedding/reranking/tool/network accounting fixtures may exercise the shared ledger without advertising those execution adapters.
4. Synthetic reservation price is versioned: two service units plus validated encoded input bytes plus permitted output bytes; the conservative reserve substitutes the output cap for actual output. Split the measured service and model components without adding them twice. Use bounded fixture clock schedules for delay/cancellation; do not call byte units provider tokens or claim real price/cap equivalence.
5. Decode streamed proposals only after the complete tool name/schema/arguments have arrived and passed closed validation. Partial/truncated/unsupported mandatory arguments produce no proposal dispatch. Even complete proposals require the native effect-class/target/intent check; model text does not execute a tool.
6. Authorize sources **before** retrieve/encode; after retrieval verify descriptor equality/revision and before dispatch verify the manifest and current audience again. Recheck current destination/source audience after inference/lookup and before returning any text/stream chunk or publishing a result. Hold back tool fragments and sensitive result material until checks pass. Revocation cannot unsend previously authorized bytes, but must prevent subsequent disclosure.
7. Switch only when no pending model/effect exists and the native turn is at a safe boundary. Recompile the complete approved capsule under current sources, policy/membership and requested profile; do not merely change a model string. Old opaque reasoning/KV state is not a capsule field and is never sent across provider/region/model/profile/authority boundaries. Expose cache loss as `lost/not-used` plus the new encoding/revalidation cost estimate; actual recomputation is attributed to the next call, never silently free.
8. Exact and semantic response caches are unsupported initially and attempts to enable either refuse. This enforces semantic-action safety and exercises the permitted refusal branch of AF-02-15. Provider-private state/prefix reuse is distinct, scoped by profile/route/manifest/authority; stale permissions invalidate it. Gateway feedback memory is disabled. No gateway projection becomes Space knowledge.

Conformance runs the actual test adapter encoder, chunks, usage/cancellation/lookup and negative translations. Comparable fixture tasks hold task/start state/model version/tools/permissions/budget constant between a direct approved baseline encoding and the native full-profile path; check output obligations and total synthetic costs including retries/revalidation. Unsupported pairings report non-comparable, not zero-cost success. These results establish local contract consistency, never model intelligence, real supplier quality or savings.

## 7. Admission, locking and retry protocol

The native service is asynchronous but owns explicit transaction boundaries. Budget writes are fixed ledger functions or repository methods invoked inside the caller's authenticated UoW; no independent nested commit and no inference inside a workflow reducer. SQL functions have fixed search paths, no dynamic caller SQL, no PUBLIC/worker/IdP grants and derive tenant/Space/actor from verified service assertions plus authoritative Task/Run. Use a separate F04 service role for new entry points in the owned test DB; do not widen accepted roles' existing grants.

Within a UoW, identity/session and controller authority locks precede model locks. F04 then acquires the installed recovery Space barrier, native Run/Task fence, sorted operation/command locks, and sorted applicable budget-account/allowance rows. Every F04 ledger/top-up/settlement/reconciliation path follows the same ordering. Multi-Space aggregate contention locks the common account key; it never locks another Space's content rows. Ancestry must be acyclic, at most 64 levels, same tenant/Space and payer; malformed graphs refuse before mutation. Timeouts produce visible wait/unknown as appropriate, never an optimistic grant.

Prepare transaction:

- Authenticate via F02 and original session lookup. Read admitted immutable Task/Run payer, intent, requirement and version pins. Validate current lifecycle, membership/source/payer and policy; changed current payer refuses instead of retargeting a Task.
- Revalidate qualified selection and compiled manifest. Check no terminal/stopped/stale generation, incompatible version, unresolved model/effect or required approval/resource wait.
- Serialize logical operation key. Same key/digest returns recorded identity after current authorization; conflicting digest refuses. Recover uncertain COMMIT by original-key lookup on the same lock after a fresh READ COMMITTED statement.
- Atomically acquire a single attempt ordinal from the operation retry counter and reserve against **every** applicable account/ancestor. Initial call counts as attempt 1; default local maximum is 3 attempts. Adapter/gateway and engine requester labels consume the same counter. Duplicate take returns `granted=false`; changed retry ceiling/key cannot create another allowance. Do not count status lookups as inference attempts.
- If budget is unavailable, persist native Waiting: budget and its receipt/event/audit/outbox with no attempt dispatch and no partially reserved accounts. Otherwise commit attempt+reservation+native `model-pending` intent+audit/outbox. Actual asynchronous invocation starts only after acknowledged prepare commit. Unknown prepare commit blocks invocation until lookup resolves it.

Dispatch-accept transaction:

- First run a separate short authenticated claim transaction using the same Stop/barrier/fence/operation locks. Validate reservation, profile/context, generation, session/expiry and original input; persist a one-use dispatch epoch/claim **and acknowledge its COMMIT before any adapter I/O**. Only that original live claimant gets the in-memory permission to enter acceptance. Unknown claim COMMIT or recreated claimant is lookup/seal-only; finding a committed claim does not authorize another accept. The claimed row therefore survives a subsequent acceptance transaction rollback.
- The original claimant then opens the bounded acceptance transaction, obtains current scope and the same locks again, validates the committed claim and all current preconditions, and calls `accept` exactly once. No persisted job/replay worker can turn a claimed attempt back into a fresh submission.
- Keep the native Task/Stop barrier through the **bounded downstream acceptance step**, not through inference completion. The deterministic adapter commits its own acceptance under original identity/digest in a separate transaction and returns promptly; it may delay usage/result afterward. Stop either wins before acceptance (zero accepted inference) or waits for the already-started bounded acceptance and then fences all subsequent dispatch. Acceptance loss/timeout/rollback is unknown and retains the earlier prepared liability.
- This bounded lock-held step is a local protocol trade-off, not a production latency/termination claim. A future gateway must provide an equivalent fenced admission contract or requalify the Stop boundary; it cannot assume arbitrary remote HTTP is atomic with PG.
- On restart a previously claimed attempt is lookup-only, even if the controller's dispatch transaction rolled back. Never repeat `accept` to discover its state. Downstream identity dedup is defense in depth, not permission for blind replay.

Retry is allowed only for trusted sealed non-acceptance or a known settled failure/cancellation, after the original pending intent is resolved and current eligibility/authority is rechecked. A known chargeable failed attempt settles its actual units before the next attempt reserves. Both pre-acceptance and post-acceptance failures consume the finite attempt allowance. Unknown/in-flight usage stops both engine and adapter retry requests. A terminal Task retry is a new native Run; it keeps original ancestor/account totals, attempt evidence and earlier charges. No automatic reset of project allowance.

## 8. Settlement, unknown usage and overrun

| Owner observation | Native state / accounting | Allowed next operation |
| --- | --- | --- |
| Prepared, never dispatched | Reservation held, pending intent | Explicit current dispatch, or atomically fence and obtain sealed-not-accepted proof before release |
| Accepted, usage not final | In-flight; held reserve; outcome may be answer-ready but usage pending | Lookup/cancel original identity; no model/effect continuation |
| Connection loss, timeout, process death, missing usage, uncertain COMMIT | Unknown; held reserve; original identity and resolver visible | Authorized original lookup; no release, replay or next attempt |
| Sealed-not-accepted | Safely failed; zero usage proven for the sealed epoch; release once | Explicit authorized retry/continuation within remaining attempt count |
| Known usage plus receipt | Settled usage, known outcome; resolve pending once | Current source/output checks; answer or bounded known-failure retry |

`reconcile` takes only `{operationId}` (and authenticated task binding), never outcome/usage/payer. Serialize reconciliation against dispatch and other reconciliation, look up the trusted original owner, then recheck current session/membership/payer/source authorization after the await and before returning/committing. Adapter lookup serializes on its original key; absent row alone returns unknown. `sealUnaccepted` atomically writes a permanent non-acceptance tombstone for that epoch, or observes an existing acceptance/receipt. A stale delayed accept cannot pass the seal. Active dispatch cannot be released on a competing empty lookup. Owner outage, missing identity or unprovable absence leaves unknown.

Settlement locks the original call, reservation and all charged accounts and validates exact owner/binding/digest. Same receipt/key/units/outcome is idempotent; changed receipt, units, outcome, scope or assignment conflicts. Settlement+cost split+pending resolution+audit/outbox commit together. Accounting reconciliation after Stop may recognize an already accepted cost under the **original** generation but cannot publish or dispatch a continuation under that old generation. Required authority/audit unavailability blocks the mutation; retained liability remains visible to an authorized operator.

Numeric policy: reject negative, fractional, nonfinite, unsafe and overflowing amounts/revisions/totals. SQL numeric intermediates and checked JS safe integers prevent bigint casts/rounding from bypassing validation. Normal conservation per budget is `ceiling = available + reserved + settled`; apply once to each ancestor/account, without summing ancestors as separate costs.

Overrun policy for local fault qualification:

- Normal adapter honors conservative caps; a fault fixture may return measured `M > R`. Do not pretend the provider used `R`. Preserve immutable receipt `M`, settle `min(M,R)` into the unchanged base reservation/allowance, and record `M-R` as a unique additional liability under the same attempt and every applicable account. Actual economic settled total is base settled **plus** this deficit; the base capped balance is a compatibility subtotal, not the displayed actual cost.
- Insert the original `usage_settlements` receipt with the measured usage and bind the additive liability so the displayed total does not also add the full receipt amount to the base subtotal. Category components sum to `M`; projections test this arithmetic. Existing `settled_amount <= amount` and allowance ceilings remain untouched.
- Freeze further chargeable admission for affected accounts until an authorized budget-control operation covers the deficit and the resulting state passes all limits. A normal top-up may cover recognized deficit by increasing ceiling and representing it once in capped accounting; the deficit history stays immutable, with a separate covering entry preventing double count. Unknown reserves remain held. Do not discard the overrun to make a conservation assertion pass.
- Local fault schedule advertises at most 5 extra synthetic units per accepted in-flight attempt and at most one pending attempt per native session. Expose outstanding reserves and the sum of those synthetic bounds; exceeding the fixture bound is a conformance failure while the actual liability is still retained. Real provider overrun remains unbounded/unqualified until a contract is chosen.
- Usage lookup, settlement and checkpoint are local non-model control operations with zero model units in this fixture. No separate safe-settlement model reserve is promised. Display this unsupported production guarantee and current in-flight exposure; do not spend the last allowance on another inference to settle it.

## 9. Native session, wait, Stop and resource contracts

The F04 native composition persists pending events in the same prepare transaction as reservation. `SessionPorts.modelOperation` is synchronous and only binds server-assigned original IDs; it does not perform SQL or grant admission. For a fresh `SessionLoop.callModel`, its asynchronous `model` port first commits that exact pending event/history prefix plus reservation through the authenticated repository, then performs the original claim/accept flow. The already-entered model port owns this initial dispatch; it does not call `callModel` a second time after preparing. A budget refusal produces a durable native wait and trusted no-dispatch resolution, rather than leaving a fictitious active reservation.

Restore reads current authority/tombstones and authoritative events, then applies unchanged pure reducers; no model/retrieval/write callback runs during replay. Restored pending/unknown work can only enter `resolveModel` through the original operation/reservation and trusted `modelResolution` port; it cannot call a fresh `callModel` or `dispatchEffect`. The native loop's synchronous authorization callback checks its pinned controller state, but is never the sole current-authority gate: asynchronous repository/dispatch/output boundaries use F02/F01 current authenticated checks before any actual I/O or disclosure. The asynchronous owner port feeds trusted completion evidence into the existing native contract. Persist subsequent model-result/resolution history atomically; a reconstructed `SessionLoop` alone is not durable storage.

Waiting belongs to native scheduler/session state, not a model string. Its record contains reason (budget/model/approval/resource/permission/connection), immutable Task/resource, current resolver owner, since/updatedAt/expiry, remaining liability, preserved committed work and permitted next action. Expiry or explicit Stop transitions under native semantics; no timer creates another model turn. Recreated service preserves the wait.

An authorized synthetic top-up uses a scoped idempotent command, expected allowance revision, finite amount, current budget-control grant and late session/payer checks; ordinary users, model output, source text or Reflect cannot create/increase limits. Smaller-scope continuation must be within the admitted task or an authorized requirement revision at a safe boundary; it cannot discard unknown liability. Resume is a separate current native action, not an automatic side effect of top-up or reconnect. Waiting for approval invokes zero models; last recorded result and ongoing charges remain inspectable.

Stop uses current authority and immutable Task/Run, independent of stale displayed progress. Compose existing fence owner/barrier, advance cancellation, persist acknowledgement and invalidate new dispatch before return. Test both lock race directions and restart. An already accepted inference becomes cancel-requested/in-flight or unknown until owner evidence settles it. No termination receipt means termination unknown. New or stale-generation model/computer/effect continuation is denied; cost reconciliation does not reopen a stopped task.

Controller classification is derived from admitted capabilities/effect target. Ordinary Ask uses only the deterministic service port, with no provision/wake callback, Space mount or unrestricted shell capability. Instrument separate simulated resource-request counters and assert zero for Ask, service errors and approval wait. Naming a tool `computer` or changing a profile preference cannot grant Act/compute access. Admitted computer need exposes Preparing computer with assignment, policy, current grants, requirements, resource costs and phase; unavailable qualification/access yields resource/permission wait. A test-only assignment/preflight may advance to simulated ready, never a real worker or local-machine enrollment. Strict single-assignment conflicts queue with owner/reason rather than allocating a second worker.

Resource costs are explicit deterministic owner receipts, reserved/settled through the same native ledger:

- Separate model, service, active-compute, reserved-compute, cold-start, retained-storage and network categories; unsupported real metering is labeled. This expands presentation categories additively rather than changing G0's accepted category type.
- Initial shared-machine allocation is `unallocated-shared-cost`. Bill each half-open resource interval once to its owning Space. Concurrent Task views reference the same charge ID; neither full charge duplication nor summing task references is allowed. Rate-policy boundaries split intervals; overlap/duplicate/conflicting receipts refuse.
- Fixture idle policy is explicit `reserved-until-confirmed-suspended`; wait/Stop do not stop reserved compute or retained storage. Simulated suspend confirmation stops later compute intervals, retaining storage. Archive changes conversation state; delete is only a declared/tested retention transition, not real data deletion. Unknown suspend/termination remains billable/unknown per fixture policy.
- Resource intervals without an originating task use the explicit Space resource allowance and purpose; task-caused model/tool/execution work uses its original Run/parent-child allowance plus applicable aggregate limits. Persistent Space charges cannot silently debit every concurrent Task. Display when storage/resource liability outlives the Task; actual retention/delete/provision/cold-start remains F05/F06 qualification.

## 10. APIs, events and safe errors

Primary API is the trusted model-service port and a bounded local operator journey. If a loopback HTTP carrier is supplied, it exposes the same closed contracts and F02 session authentication, exact Host/Origin controls, bounded body size and no arbitrary URL/path/SQL inputs. No new client UI is required.

| Operation | Input boundary | Observable outcome |
| --- | --- | --- |
| `requestTurn` | Original admitted Task/Run/session, command key/revision/expiry, optional Auto/pin/preference, source refs and bounded native input; actor/payer/cost-center/route approval derived server-side | Accepted call identity/preflight details, or durable typed wait/refusal; not a claim of inference completion |
| `inspectTaskCosts` / `inspectCall` | Authenticated original Task/call identity | Current scoped profile/retry/reservation/usage/category view; no source bodies or provider-private state |
| `reconcile` | Original operationId only, scoped current authorization | Original receipt and once-only settled state, safe sealed failure or unknown with `replayAllowed:false` |
| `topUp` | Allowance ID, amount, original command key/revision/expiry; separate current budget-control grant | Synthetic allowance-change receipt; unauthorized/stale duplicate conflict; no real payment |
| `resume` / `switchProfile` / `stop` | Exact native command/Task binding and appropriate authority; Stop ignores stale progress revision | Native generation/wait/selection update; unresolved usage continues to fence work |

Model/accounting event envelope binds schema version, tenant/Space, Task/Run/session/call/attempt as applicable, generation, contiguous sequence, timestamp and redacted payload. Event kinds: `model-prepared`, `attempt-admitted`, `model-accepted`, `usage-unknown`, `usage-settled`, `model-safely-failed`, `profile-switched`, `budget-wait`, `allowance-changed`, `resource-charge-recorded`, and native Stop/resume. Record stable correlation IDs, counts and digests; no prompt bodies, reasoning items, synthetic auth tokens or environment secrets in audit/export. Outbox consumers reauthorize and deduplicate; events/logs are not grants.

Reuse stable domain errors: INVALID_SCHEMA/UNSUPPORTED_VERSION, REQUIRED_CAPABILITY_UNSUPPORTED, UNAUTHORIZED/AUTHORITY_UNAVAILABLE, SCOPE_MISMATCH, INTENT_EXCEEDED, STALE_REVISION/STALE_FENCE, IDEMPOTENCY_CONFLICT, BUDGET_EXHAUSTED, TERMINAL_RUN, UNKNOWN_EFFECT_REQUIRES_RECONCILIATION and CHECK_BINDING_MISMATCH. Add package-local model-unavailable/overrun reasons inside typed wait details if needed. Only genuine imported typed foundation `UNKNOWN_COMMIT` maps to unknown original-key lookup; a spoofed error code is not trusted. Never expose SQL/exception messages or use `retryable:true` to authorize replay of unknown inference.

## 11. Security, performance and recovery boundaries

Data flow: F02 current identity → native immutable task binding → authorized source compiler/profile → PG admission/reservation/pending intent → bounded fenced adapter acceptance → separately durable synthetic receipt → PG reconciliation/settlement → current output-audience check → redacted view. Tool proposals return to native authorization; they do not bypass it. Provider keys are absent from this implementation. Installed local config is closed and `paidCallsAllowed=false`; supplier key environment variables or caller destination fields cannot enable an external transport. Child test processes receive only their owned fixture credentials; diagnostic exports strip them. Synthetic test DB/IdP credentials are not real supplier credentials.

Threat-boundary changes are the new ledger functions, aggregate account access, adapter receipt channel and streamed proposals. Fixed SQL/closed decoders, independent receipt ownership, one-use claims/seals, RLS and current audience checks cover forged metadata, cross-Space lookup, early absence, duplicate charge and stale authority. Required audit failure is injected after writes and proves rollback before dispatch. New scoped tables use ENABLE/FORCE RLS, immutable binding/history triggers, composite scope foreign keys, non-owner/non-superuser/non-BYPASSRLS service roles; workers/clients have no accounting or controller-table access. Aggregate account functions reveal only admission/wait information for the caller's obligation; arbitrary account IDs/balances/other Space titles are not queryable.

Acceptance migrations run only against an explicitly owned reproducible fixture using the separate admin/migration connection. They do not change real credentials/security settings or deploy schema to a shared database. Any application of migrations to a real/shared environment is an approval-gated action. Preserve all existing role definitions/RLS/functions; do not replace accepted conformance to make F04 pass.

Use indexed scoped keys, usage keys, parent-account references and interval keys; bounded batches and ancestor walks; deterministic clock/ID injection in pure logic. Limit fixture concurrency explicitly and measure actual blocked contenders, not just `Promise.all` timing. Keep separate authority read capacity, as existing recovery fixtures do, to avoid pool starvation during current-scope checks. Short acceptance holds trade throughput for a provable local Stop boundary. No benchmark/SLA, production HA, remote isolation or p95 claim follows from these tests.

Recovery procedure: load current authority/revocation/lifecycle → load original Task/Run/version pins/events → rebuild authorized projections with zero dispatch → enumerate pending/claimed/unknown attempts and retained resource liability → look up/seal only original downstream identities → settle atomically → expose wait/known result → explicit current resume/retry only. Unknown commit on any mutation retains the original key/digest and uses serialized lookup; rollback certainty and unobserved COMMIT are distinct. Replay must not call model, tools, provisioners or top-up. Unsupported schema/environment upgrade waits/refuses rather than rewriting history.

## 12. Additive migration, rollout and rollback

The implementation adds `g1-model/` (package/lock/build/check/types/schemas/tests/migrations and dependency metadata), [future planning document](../../planning/g1-f04-plan.md) and [future evidence document](../../evidence/g1-f04-acceptance.md). Those two documents are downstream delivery paths, not present-stage acceptance. No edits to accepted G0/G1-local/foundations/F02/F03 sources, checks, lockfiles, protected oracles or retained raw evidence are needed.

Model migrations use a separate `fabric_model_migrations` ledger with SQL digests and an owner lock. Verify unchanged foundation versions 1/2, identity version 3 and any loaded recovery versions/digests; rerun accepted migration compatibility. Add tables/functions/triggers rather than altering base budget ceilings or history guards. A changed same-version migration digest refuses. Fixtures may load the existing recovery fence schema to exercise Stop composition; no Temporal SDK or server is required merely to test model/ledger behavior. Existing Temporal/recovery acceptance remains separately retained.

Local rollout starts with the deterministic profile and mandatory denial defaults. This is a test composition, not a shared release. A later real route requires approved supplier/version/edition/region/key custody/prices/overrun terms, external conformance and revised evidence; selection cannot turn it on from an environment variable. New version/behavior/profile choices take effect only at validated native boundaries; mid-attempt incompatible pins refuse.

Rollback disables new admission/selection, retaining all model events, reservations, unknown liabilities, receipts and historical charges. Continue authorized original-owner lookup/accounting recovery; never undo settled charges, replay accepted inference, drop tables, reset allowance or relabel a stopped task as new. Fixture teardown deletes only owner-marked reproducible containers/directories, following original cleanup conventions. Restoring production data, deleting nonreproducible state, applying ACL changes, deploying, spending, messaging or rewriting published history still needs the specified approval.

## 13. Verification obligations and requirement allocation

The independent test designer must turn these contract cases into named behavioral assertions and fix mandatory groups before implementation. Build/runtime contract tests validate every schema plus invalid relationships; integration tests observe actual request captures, accepted-attempt/usage records and balances. Tests cannot pass from printed requirement labels alone.

| Solution part / required behavior group | Requirement IDs |
| --- | --- |
| Complete profile/capability decoder, local conformance/comparable tasks, qualification expiry and actual request binding (§§5–6) | AF-02, AF-02-01, AF-02-02, AF-02-03, AF-02-04, AF-02-05, AF-02-17 |
| Auto/no-choice, exact pin, approved equivalence, unavailable/ineligible defaults, safe-boundary switch and readable details (§6) | AF-02-06, AF-02-07, AF-02-08, AF-02-10, AF-02-16, AF-02-18 |
| Source-before-retrieval, current fingerprints/capsules, scoped opaque state, unsupported response caches, stream completion/output revocation (§§5–6) | AF-02-09, AF-02-11, AF-02-12, AF-02-13, AF-02-14, AF-02-15, AF-02-19, AF-02-20 |
| Atomic hierarchy/aggregate/parent-child reservation, competing actual PG processes, partial-write rollback, immutable trusted payer and numeric boundaries (§§5, 7–8) | AF-06, AF-06-01, AF-06-02, AF-06-03, AF-06-04, AF-06-05, AF-06-26 |
| One engine/adapter attempt ceiling, known charged failures, recreated owner, no allowance/evidence reset (§§7–9) | AF-06-06, AF-06-07, AF-06-25 |
| Delayed/missing usage, original key/receipt/seal, active-absence race, double/conflicting settlement, lost ack/COMMIT and zero-I/O replay (§§7–9) | AF-06-08, AF-06-09, AF-06-10, AF-06-11, AF-06-23, AF-06-24, AF-06-27, AF-06-28 |
| Current/late identity/payer/audience, required authority/audit failure, budget-control denials, absent provider keys/gateway knowledge (§§6–11) | AF-06-12, AF-06-13, AF-06-19, AF-06-20, AF-06-21 |
| Purpose/category admission or explicit unsupported execution, estimate/reserve/measured/actual separation, caps/overrun/cost correlations (§§5–8, 9–10) | AF-06-14, AF-06-15, AF-06-16, AF-06-17, AF-06-18, AF-06-22 |
| No-computer Ask/failure, service capability restrictions, classification/preflight and conflict wait with no fleet expansion (§9) | AF-18, AF-18-01, AF-18-02, AF-18-03, AF-18-04, AF-18-13 |
| Durable budget/model/approval/resource waits, authorized/unauthorized top-up and smaller-scope resume, zero wait model turns, raced Stop/restart (§9) | AF-18-05, AF-18-06, AF-18-07, AF-18-15, UX-11 |
| Explicit ongoing reserved-compute/in-flight/storage/cold-start/network, one shared charge/unallocated view, control-only settlement guarantee boundary (§§8–9) | AF-18-08, AF-18-09, AF-18-10, AF-18-11, AF-18-12, AF-18-14 |
| Package/build/check, mandatory positive/refusal/concurrency/recreated-process groups and observed zero-violation counters (§§2, 13) | R-001, R-002, R-003, R-004, R-005 |
| Implementation plan/evidence index, obligation-to-test matrix and scoped operator journey/retry/cost views (§§10, 12–13) | R-006, R-007, R-008, R-009, R-033 |
| Baseline/raw preservation, controller GUI checks/acceptance, deterministic-only gate, approval prohibitions (§§1, 11–13) | R-010, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019, R-022 |
| Native/record ownership, dependency/version metadata, data flow/recovery/rollback, pinned boundaries and high-severity release gate (§§2–5, 11–12, 14) | R-020, R-021, R-023, R-024, R-025, R-026 |
| Explicit remaining supplier/gateway/runtime/product/performance qualification and optional deterministic cases (§§6, 14) | R-027, R-028, R-029, R-030, R-031, R-032 |

Mandatory proposed test files: `contracts.test.ts`, `profile-context.test.ts`, `budget-concurrency.test.ts`, `retry-usage-recovery.test.ts`, `native-wait-resource.test.ts`, and `authority-output.test.ts`. These names may be refined by independent test design; mandatory behavioral groups may not be removed. Recovery tests kill/recreate the actual native service and adapter processes using the same owned PG data, rather than reconstructing a Map. Concurrency observes actual PG blocking/commits and both Stop/accept and lookup/accept orderings. Local high-level entry-point cases cover all six brief journeys.

`node g1-model/scripts/check.mjs` must verify pins/preserved inputs, install frozen offline dependencies with scripts disabled, clear only its reproducible build cache, strictly compile source **and tests**, require every mandatory emitted suite, run actual nonempty TAP suites and fail on failed/empty/skipped/TODO cases or unknown arguments. Assert per-group executed counts/case identities and actual dispatch/receipt evidence, not a substring label. Missing Docker/cached PG/owned-process capability is a failure, never a skip or memory fallback. Establish bounded cleanup/ownership and retain complete failed outputs. Before/after guards must preserve accepted inputs and migration ledgers.

Retain the registered commands unchanged: `node g1-identity/scripts/check.mjs`, `node g1-foundations/scripts/check.mjs`, `node g1-foundations/scripts/check-retained.mjs`. The controller runs retained GUI/Electron checks outside the Codex sandbox through `loop_check`; an in-sandbox crash is not permission to skip/change them. Only controller-run current-candidate results and the required independent reviews/human judgment can establish acceptance. Document raw command/log paths, byte counts/digests, candidate/source/lock/check/environment identities, executed counts/failures and separate evidence assurance. Preserve historical failed evidence and usage; do not manufacture review signatures.

Dependency metadata downstream must pin the same observed Node/pnpm/TS/Node-types toolchain and `pg` 8.16.3 / PG types 8.15.5 if used, with an independent lock. Record actual installed dependency/license/notice/security/update metadata and owner responsibilities, not an assumed vulnerability-free status. Use the existing cached PG image digest/fixture; no unapproved image/cloud/provider fetch. Fresh-copy frozen install/build belongs to qualification.

## 14. Risks and still-unqualified environments

| Risk / pending gate | Mitigation and explicit evidence limit |
| --- | --- |
| Two ledger/session owners or bypass of pending guard | Reuse base budget and Task/Run owners; only F04 composition exposes F04 turns. Contract/negative tests reject legacy or raw adapter continuation. Integration with other live endpoints needs a later additive adapter task and checks; not implicit. |
| Cross-Space aggregate limit leaks or deadlocks | Fixed owner account binding/functions, sorted lock order, isolated content queries and observed competing PG processes. Billing team is not data scope. |
| Acceptance/COMMIT ambiguity, early absent lookup or killed claimant | Prepare before invocation, independent downstream receipt, bounded fenced accept and permanent epoch seal; retain unknown until proof. Both race directions and recreated processes required. |
| Overrun hidden by accepted base-table constraints | Measured immutable receipt plus separate deficit/cover history, actual totals, frozen admission and tested display/conservation. Never alter accepted CHECKs to admit larger amounts. |
| Stale context/output after awaiting inference | Recompile/recheck current source/policy/membership, late session/audience checks; scoped/redacted views. Already sent authorized data cannot be recalled. |
| Fake capability claims or partial streamed tools | Execute advertised local behavior; closed decoding/complete arguments; expired qualification refuses. Proposals confer no effect authority. |
| Lock-held acceptance limits throughput and Stop timing | Bounded local admission only; inference/usage delay outside lock; measure diagnostic timing separately. No production SLA. Real remote admission must qualify this boundary. |
| Real supplier route/conformance/comparable economics | **Pending:** supplier/model/version/route/region/data policy and paid enablement decision; actual modalities, streaming, tools, context, cancellation, caches, usage delay/failover and controlled comparable tasks. Local adapter does not qualify a model family. |
| Real enterprise gateway/billing | **Pending:** edition/license, custody/rotation, budget ownership/real overrun terms, metering and invoice reconciliation/top-up. G2 enterprise accounting depth retained. |
| Real runtime/storage/resource costs | **Pending:** actual no-VM qualified service isolation, Linux image/mount/egress enforcement, provision/wake/idle suspend, cold-start distributions and actual compute/storage/network tariffs. F05/F06 authorization/qualification retained. |
| Wider product/release quality | **Pending:** formal SSO, human approval judgment, physical three-device/sleep/signing/distribution, delete/restore/retention propagation, full Fleet/Memory/Design/Reflect and whole G1/G2–G5. Local counters cannot certify these. |
| Performance and security claims | Finite zero violations are required suite gates, not immunity; no supplier savings, exact invoice cap, latency target qualification or leadership claim. High-severity authorization/isolation/stale-approval/duplicate-effect findings block the affected profile. |

## 15. Stage handoff

This stage writes architecture only. The independent test-design stage must specify the observable races, fault schedules, case/group counts and qualification matrix; planning then orders the vertical slices and controller checks. Product schemas/SQL/build/behavior suites are implementation work, not present-stage passes. Validate the design type excerpt and requirement references as documentation checks; preserve that distinction in the handoff. Submit this path with `loop_stage_done(stage="solution", path="docs/loop/agent-fabric-g1-f04-model-finops/solution.md")` and record the remaining traps before stopping.
