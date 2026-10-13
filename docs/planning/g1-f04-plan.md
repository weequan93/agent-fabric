# G1-F04 implementation plan: qualified local model and FinOps

Date: 2026-10-07. Stage: develop. **Status: f04-01–14 delivered through controller task checks; f04-15 qualification/evidence in progress. Integrated current-candidate, independent review, final and product gates remain pending.**

Deliver an additive `g1-model/` package that makes full operating profiles, current eligible model selection, atomic admission, coordinated retry, unknown usage, trusted cost attribution and explicit resource waits executable and inspectable. Acceptance uses the deterministic local test adapter. AF-02, AF-06 and AF-18 gain bounded local qualification; their real-environment obligations remain open. UX-11 is a supporting local budget-wait journey.

This document implements the current authorized F04 goal; historical roadmap statements remain retained. It does not select a supplier, region, commercial gateway edition or price, enable paid resources, deploy a shared service or authorize messages.

## Source and design baseline

- [Roadmap](roadmap.md), G1/G2/G5 and release evidence: preserve one native engine/record owner, basic G1 budget and audience safeguards, and later enterprise/adapter depth.
- [Foundations plan](g1-foundations-plan.md), dependency sequence G1-F01–F07: F04 follows current identity/recovery and defers real storage/runtime/client qualification.
- [Remaining ledger](g1-remaining-ledger.csv), AF-02 §§2/9/11, AF-06 §§2/11, AF-18 §§2/7/11–12 and supporting UX-11 §§31/8/11: fixture proof is distinct from full obligation acceptance.
- [Master v1.1](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md), §§2,7–12,17,22,25–32: full profiles, eligibility before preferences, Auto default, source authorization, shared reservation, original accounting identity, single retries, recovery, classification and release discipline.
- [F02 evidence](../evidence/g1-f02-acceptance.md), original-key lookup, current/late authority, raw-stream and candidate binding; [unchanged identity checker](../../g1-identity/scripts/check.mjs).
- [Product brief](../loop/agent-fabric-g1-f04-model-finops/product-brief.md), six journeys; [solution](../loop/agent-fabric-g1-f04-model-finops/solution.md), chosen independent PG/native composition; [independent test design](../loop/agent-fabric-g1-f04-model-finops/test-plan.md), fixed65 cases and every required variant.

Reviewed requirement inventory:100 unique, final=true,96 Must/3 Should/1 Could. Canonical inventory digest: `7ee9471461068fc94e27bc231bae04badbc11032ceedad6f5405bc097aad4600`. Solution digest: `3422f829b4dd896c1ab9d8a86943b6cce1655e15e8242938f14b9604fc2c1ca9`; test-design digest: `8bbb22b392220f7c83c7c061e32cbc7128602fb8efb950ea796b0c9ae6ea22eb`. Planning does not change these records, priorities or checks.

## Local delivery and record authority

Only `g1-model/`, this planning document and the future [F04 acceptance index](../evidence/g1-f04-acceptance.md) are delivery paths. Preserve all accepted G0/G1-local/foundations/F02/F03 sources, locks, checks, protected oracles and raw evidence. Never edit controller-owned `.loop/` files by hand.

| Record/decision | One authoritative owner | Derived or untrusted input |
| --- | --- | --- |
| Actor/session/member/payer/policy/source audience | Existing F01/F02 current authenticated authority | Caller tags, copied scope JSON, model claims |
| Task/Run/intent/target/cancellation | Existing native scheduler and installed F03 fence | Navigation, tool/model names, displayed progress |
| Session turn/history/pending model/continuation | Unchanged native SessionLoop semantics, durable F04 history port | Rebuilt projections and summaries |
| Profile eligibility/Auto/pin/safe switch | Native controller profile layer, installed rules and probe-bound local qualification | Adapter self-declaration, cost/latency preferences |
| Allowance/reservation/retry/settled accounting | Native FinOps repository reusing existing budget tables | Gateway retry labels, receipts posted by callers |
| Accepted inference/usage/non-acceptance seal | Independent restricted deterministic downstream receipt owner | Empty lookup, cancellation request, client-supplied outcome |
| Resource cost | Trusted synthetic original Space receipt, same native ledger | Concurrent Task references, archive or Stop label |
| Acceptance and independent judgment | Loop controller current-candidate checks and required independent reviews/human stages | Author/component diagnostics and synthetic gate-test data |

Data flow: current identity → immutable native Task/Run → eligible full profile and authorized typed context → atomic PG reservation/pending intent → separately committed one-use claim → bounded native fence-held downstream acceptance → independent durable owner receipt → original-owner reconciliation/once-only settlement → current output/source-audience check → scoped redacted projection.

Dependency direction is new package → unchanged engine/foundation/identity/fence contracts. Accepted packages never import the new package. No supplier SDK, Temporal server merely for F04 tests, second planner/router/retry loop, Space filesystem, unrestricted shell or local-worker enrollment belongs to this route.

Operating profiles bind every required component. Missing user choice is **Auto - organization approved**; an explicit qualified manual pin stays exact. Capability/provider/route/region/data-policy and current qualification eligibility precede preferences. An unavailable pin or no eligible Auto inventory waits/refuses with zero dispatch. Equivalent fallback needs current explicit user or installed policy permission. Switches require a safe complete revalidated task capsule and visible cache-loss/context-revalidation cost. Exact/semantic response caching and gateway knowledge memory are explicitly unsupported initially. Partial streamed proposals confer no effects; output/chunks recheck current audience.

Ledger invariants use nonnegative safe-integer synthetic UTF-8 byte units; normal ceiling = available + reserved + base settled per applicable account/ancestor. Parent/children and cross-room aggregate ceilings contend without merging data scopes. Distinct max3 attempts each reserve/account under original attribution. Unknown remains held and fences model/effect continuation. A committed claim is never restart submission permission. Original-owner lookup or permanent epoch seal is the only way to reconcile; absence is unknown. For M>R, record actual M plus immutable deficit/cover history, freeze affected admission and retain the accepted base constraints. Show outstanding reserves and local +5 exposure per accepted pending attempt; an out-of-bound measurement fails conformance while preserving actual cost.

Waits are durable native reasons with Task/resource/resolver/since/update/expiry/preserved work/allowed next action. Top-up is synthetic authorized budget control, then separate fresh resume; it never discards unknown reserves or auto-submits. Approval polling uses zero model turns. Stop advances cancellation despite stale progress; it cannot prove accepted inference free or terminated. Ordinary Ask and its failures use service only and issue zero computer/wake/enroll calls. Computer behavior here is admitted visible single-assignment simulation, with contention waits and no added workers.

Resource receipts distinguish model/service/active/reserved compute/cold-start/retained-storage/network. Half-open intervals are billed once to owning Space; Task views use `unallocated-shared-cost`. Reserved-until-confirmed-suspended policy continues through wait/Stop/unknown suspension; storage persists under retention. Archive, Stop, simulated suspend and declared delete-retention are distinct. Nonmodel lookup/settlement/checkpoint costs zero model units locally; a production safe-settlement reserve guarantee is unsupported.

## f04-01 executable contract and migration decisions

Implementation supplement, 2026-10-07: the independent package/build, closed v1 data contracts, arithmetic, direct native import facade, retained-input guards, fixed suite/component manifests and contracts diagnostic are now delivered under `g1-model/`. This is the architecture task boundary; adapter/ledger/service behavior, all65 acceptance cases, evidence and independent reviews remain downstream work. Local diagnostic output is not controller acceptance. The original solution/test-design and accepted regression definitions remain unchanged.

### Module and data ownership

`src/decoder.ts` owns bounded closed parsing mechanics; `src/schema.ts` owns record relationships; `src/contracts.ts` derives readonly TypeScript types from those executable schemas and fixes narrow installed ports. `src/arithmetic.ts` owns synthetic pricing/safe arithmetic only. `src/errors.ts` supplies fixed safe errors and recognizes genuine imported foundation COMMIT uncertainty. `src/native-imports.ts` directly reexports unchanged SessionLoop/reducers, canonical digest, current verified-scope/identity and F03 fence functions. It contains no replacement native implementation. Source direction is F04 → existing owners; emitted copies are disposable build artifacts, never new record authority.

Profile/context/qualification modules implement selection and context compilation in f04-03; budget/model/retry repositories implement authenticated transactional accounting in f04-04/05; native-session/model-service compose durable history/output/Stop in f04-06; resource-contract/view provide f04-07's explicit accounting projections. New modules must use these boundaries. Adapters never select payer, grant authority, plan continuation, raise allowance or create a second retry counter. The test effect continuation port is instrumented local behavior behind the native fence, not a production tool endpoint.

Admission flow is current F02 authentication/session → immutable Task/Run/payer/intent/version binding → installed current qualified full profile → source authorization before retrieval → bounded typed complete capsule/encoding → current manifest check → authenticated atomic prepare transaction → acknowledged separately committed one-use claim → original claimant's bounded native-fence-held downstream acceptance → independent durable owner usage/seal → original-owner atomic reconciliation/settlement → fresh output/source audience → redacted view. A downstream observation is not a grant. Decoding a receipt, qualification or VerifiedScope-shaped JSON cannot mint trusted owner/session/probe provenance.

The decoded full profile fixes provider/model/modelVersion/deployment/route/region/dataPolicy, instruction pack, tool/schema presentation, context policy, reasoning controls, verifier, runtime requirements, capabilities and cost assumptions. All participate in `profileDigestOf`, prefixed `sha256:` using the unchanged native canonical digest. Capabilities require explicit modalities/dialects, text/tool streaming, byte context cap, usage mode, request/lookup/termination cancellation distinctions, private/prefix/exact/semantic cache flags, optional/required features and output/duration-cap flags. No required flags default away. QualifiedProfile binds profile identity/version/digest, capability digest, deployment and environment; the later trusted registry must also establish the actual registered probe, lock/check identity, current approval, expiry and revocation. Shape validation is not completed conformance.

OriginalCall is the immutable tenant/Space/operation/attempt/reservation/request-digest tuple. UsageReceipt additionally binds original owner/receipt/usage key, measured time, synthetic assurance, outcome/output digest and an exact component total. `answer` requires output digest; known failure/cancelled have no answer digest. OwnerObservation has exactly settled/accepted/unknown/sealed-not-accepted variants. Unknown has no inferred absence/release. A seal binds the original tuple, installed owner, proof and epoch. Caller-supplied objects cannot authorize settlement/release; repositories validate current scope, original binding and installed owner observations.

Operation owns retry ceiling/attempt count, original key and immutable request/binding; distinct attempts have independent original reservation/usage identity and shared logical counter. A claimed/accepted attempt requires a persisted claim. Claim history is not an invocation permit: only the live acknowledged claimant gets a nontransferable in-memory permission at the service boundary. Budget port implementations borrow the caller's authenticated transaction; they do not acquire an independent committing UoW. SessionHistoryPort append belongs in the same intent/reservation/audit/outbox transaction. Native history remains contiguous and pending unknowns fence both model and effect continuation.

ContextManifest records actual profile/encoding, current policy/membership, typed scoped source revision/digest/audience/provenance/time/trust and explicit cross-thread setting. Capsule keeps requirements, selected evidence, hypotheses/uncertainty, failed plans, pending operations, artifacts/checks and next safe action. It refuses provider-private opaque fields. Capsule binding/manifest scope and authority revisions must agree. Source trust labels remain data; the compiler/identity owner authorizes retrieval and disclosure. New context encoding cannot silently convert hostile evidence into instructions.

WaitRecord is a durable native detail: Task/Run/resource, reason/resolver, since/update/expiry, preserved-work digest, allowed next actions, ongoing charge categories and `replayAllowed:false`. ResourceCharge binds original Space/resource/generation/receipt/usage/rate policy, positive half-open fixture interval, validated product and category. References to Run/action/call do not allocate the full machine cost; allocation is explicitly `unallocated-shared-cost`. Resource admission/lifecycle remains simulated. No provisioner, shell, arbitrary URL/SQL/path endpoint or real ACL change is supplied by these contracts.

### Version, consistency and error contracts

Every persisted top-level F04 record/transport envelope uses required `schemaVersion:1`; nested identities inherit the envelope version. Wrong versions throw `UNSUPPORTED_VERSION`; missing/extra/symbol/prototype/accessor/non-JSON fields throw safe `INVALID_SCHEMA` without running getters. Decoders copy and deeply freeze dense bounded arrays/records. UUIDs, canonical `sha256:` digests, UTC millisecond timestamps, finite nonnegative safe revisions/amounts and positive caps are mandatory. Unsafe sums/products throw `NUMERIC_OVERFLOW` before mutation. Byte payloads are bounded1MiB and reject lone surrogates. Synthetic v1 pricing is2 service units plus encoded UTF-8 input bytes plus capped output bytes; a measured split adds each component once. No token or currency conversion is defined.

Task pins bind engine/behavior/schema/environment/lock/check definitions; qualification binds adapter/version/deployment/profile/probe/expiry. New request, claim, retry, event or receipt rechecks the compatible original pins; changing data under a logical key conflicts. Unsupported versions wait/refuse and preserve history; they never silently upgrade an in-flight request. Data-schema extensions require an explicit compatible decoder/version decision and affected tests/requalification. The independent model migration ledger owns SQL version/digest records under an owner lock. f04-02/04 add schema only in owner-marked reproducible PG, verifying base foundation versions1/2, identity3 and installed recovery digests. Same-version changed SQL refuses. No destructive migration or accepted CHECK/grant/history change is allowed.

Lock order remains identity/session/controller authority → recovery Space barrier/native Task/Run fence → sorted operation/command keys → sorted account/ancestor rows, throughout admission/top-up/retry/settlement. Original-key locks exclude payload digest. Lookup performs a fresh READ COMMITTED statement after lock acquisition, matching writer commit/rollback/timeout behavior. Required audit/outbox failure rolls back the entire native transaction before invocation. The independent receipt owner transaction is intentionally not the native transaction; acceptance/ack loss remains unknown with retained reserve until authoritative original lookup/seal.

Known schema/auth/version/budget failures do not grant retry or automatic replay. Only `instanceof FoundationError` with native `UNKNOWN_COMMIT` maps to unknown original-key lookup; a plain object/Error with a spoofed code maps to a safe refusal. Exports never include exception/SQL/credential/prompt text. Unknown inference/COMMIT is distinct from a known charged failure and from sealed non-acceptance. All retries, including adapter requester labels, consume the same durable ceiling(max3) and separately reserve. Lookups/cancel/seal never count as fresh inference or justify a reset.

### Recovery, rollback and qualification boundary

On restart, load current authority → original Task/Run/pins and history → reconstruct projections with zero I/O → inspect pending/claimed/unknown attempts and persistent resource liability → original-owner lookup/seal only → atomically settle/release authorized originals → expose current wait/result. Recreated claimant never calls accept from persisted claim. Unknown prepare/claim/settle COMMIT retains original command/key/digest and serializes lookup; absence while blocked/outage is unknown. Explicit current resume/retry after known safe resolution is separate work. Stop advances native cancellation and fences future acceptance/continuation; it cannot erase accepted usage, prove termination or stop retained-storage charges. Approval polling consumes zero model turns; top-up is synthetic budget control and cannot submit/resume automatically.

Rollback disables new F04 admission/selection while preserving model/session events, reservations, unknown liabilities, receipts, deficits/cover history, resource intervals and settled charges. Continue authorized original-owner reconciliation. Do not drop tables, undo accounting, replay accepted inference, reset allowances, rewrite evidence or turn stopped work into an unrelated Task. Only owned reproducible fixture artifacts can be cleaned after ownership verification. Shared deployment/migrations, nonreproducible deletion/restore, credentials/settings/ACL changes, paid resources, messages and published-history changes require the goal's exact approval.

Rejected trade-offs remain those in the approved solution: an in-memory route cannot prove durability/contention; gateway-owned planning/retries cannot preserve native intent/pending/accounting ownership; a production provider would introduce unapproved supplier/region/custody/spend. A bounded native-lock-held downstream acceptance makes the local Stop boundary observable but is not a production latency or cancellation guarantee. Real gateway admission must qualify an equivalent protocol or revisit that boundary under a separate decision.

### Build, dependency and harness freeze

Build pins Node22.22.3/pnpm10.18.0/TS5.9.3/Node types22.18.6/pg8.16.3/types8.15.5. The independent lock was seeded byte-for-byte from the unchanged F02 graph; it is a separately owned lock. No Temporal/provider SDK dependency is added. `build.mjs` rejects arguments/tool drift, clears only its own nonsymlinked emitted cache before install/compile, installs frozen/offline/ignore-scripts into the new package, verifies dependency/notice metadata and strictly compiles source AND tests with `noEmitOnError`, `skipLibCheck:false`, exact optional properties and noUncheckedIndexedAccess. Fresh copies resolve transitive type-only PG imports against the new pinned types. No build of accepted packages or use of their emitted cache is required by f04-01.

`verification/preserved-inputs.json` captures1733 current immutable input hashes: all existing non-controller tracked inputs plus every original597 retained-protected guard key, all42 accepted foundation files, F02/F03 source/check/lock/raw inputs and approved F04 brief/solution/test design. It includes the ignored retained `.DS_Store`; no hash is recomputed/updated by checks. Mutable F04 plan and controller `.loop/` files are excluded; the controller owns its logs/status. Guards run before/after builds and all runners, including failures. Original raw evidence and usage remain intact; no old result is relabeled as this candidate's acceptance.

`dependencies.json` records the actual18 cached dependencies, declared license and installed package/notice hashes. Seventeen installed license/notice files are retained unchanged under `notices/`; pg-types2.2.0 and pgpass1.0.5 declare MIT without an installed notice file. No new patch is present. Security/vulnerability status, image component license/SBOM and complete legal sufficiency are unknown pending independent assessment. Architect owns pins/metadata, backend/data own adapter/SQL compatibility, independent security reviewer assesses findings and tester owns requalification. Updates require reviewed additive pins/lock and affected strict/conformance/authority/concurrency/recovery/regression checks; no unattended updates, downloads or install scripts. Cached PG is exactly `postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333`; missing image is a failure, never a pull.

The fixed manifest has eight suites/65 cases(C3/P13/B9/U11/N8/A6/Q9/J6) and a separate closed seven-component diagnostic registry. Only actual assertion-backed component tests can satisfy component checks. f04-01 implements five contract probe identities with four negative-record variants; it does not impersonate future C01–C03. Aggregate/slice/component share strict build, preserved-input guards and actual successful `node --test` TAP parsing. Exact mandatory top-level executed IDs, complete nonempty plan and reconciled counts are required; failures/signals/timeouts/skips/TODO/cancelled/contradictory or label-only outputs fail. All selected files are validated before executing suites. Missing future suite/probe/fixture fails with no optional mode. Component/slice reports explicitly say diagnostic only. Integration hook `scripts/fixture.mjs` is owned by f04-02: `withModelFixture(callback)` must supply `{assurance:'deterministic-local-only', paidCallsAllowed:false, env}` after real owned PG/IdP/adapter preflight and must verify complete teardown. No ps/GUI fallback or skip is authorized.

Still unqualified: real provider conformance/model quality/comparable tasks and approved route/region; gateway edition/custody/rotation/tariffs/invoices/top-up; qualified no-VM service isolation and computer cold-start/compute/storage/network/retention costs; full product/human/device/SSO/release and benchmark results(E01–E05). The future acceptance document and independent/controller stages must state these explicitly. No present contract or diagnostic result completes those gates.

## f04-02 receipt adapter and fixture implementation

Implementation supplement, 2026-10-07: `src/test-adapter.ts` and its independent child process own the deterministic downstream journal under `model_receipts`, separated from native `fabric` authority/accounting. `receipt-migration.ts` verifies the owner-marked synthetic database, original F01 versions1/2 and F02 version3 SQL digests (and any installed F03 digests), uses a separate owner-locked `fabric_model_migrations` ledger and refuses changed existing version bytes or untracked receipt schemas. Migration1 adds restricted owner-login mapping, FORCE RLS, immutable acceptance/usage/seal guards, unique usage/receipt identities, captured exact requests, scoped opaque state and durable counters. It adds no grants to accepted controller/worker tables.

`scripts/fixture.mjs` starts only the cached pinned PG16.12 image with a fresh owner label/name, loopback ephemeral port and bounded CPU/memory/PID allocation. It calls the unchanged F01 build/migration in the original emitted layout because that API resolves its SQL relatively; only disposable generated files/dependencies are installed offline, without accepted source/check/lock edits. `tests/helpers/pg-fixture.ts` invokes unchanged F02 migration, separate-process synthetic OIDC/PKCE login, current identity verifier and authenticated UoW. Distinct admin/controller/authority/worker/client/IdP/receipt connections have distinct synthetic credentials. Receipt credentials fail controller authentication; receipt role cannot read fabric records, and controller/IdP/worker/client cannot read the receipt journal. The adapter receives only its receipt DSN/transport token/profile/owner, and retains PATH/LC_ALL after consuming its own configuration. Process census verifies marker, current child relationship, start/group instance and exact command before signalling/reaping; marker/instance/parent/command mismatches refuse cleanup. Docker cleanup verifies current ownership and preserves the preexisting fixture census.

The closed local payload and carrier are documented in `g1-model/README.md`. Text and local closed JSON/tool proposals, scalar-safe byte caps, synthetic duration failure, incremental NDJSON text/tool frames, request cancellation plus original lookup and profile/context/Space-bound private state are executable. Output streams after final usage is recorded; partial tool arguments confer no effects. Unsupported modality/dialect/config fields and nonexact-loopback destinations/Host/Origin/token refuse. Request digests bind exact original identity, full profile/context digests, payload, caps and epoch. This transport is an installed trusted broker channel, not an end-user operator HTTP API.

Owner acceptance commits independently before a bounded ACK and separate final usage. Original-key locks omit payload digest and lookup reads a fresh statement after obtaining the lock. Empty absence stays unknown. A permanent owner seal records an epoch without accepting inference; stale accepts cannot cross it. Cancellation is a request, never a non-acceptance/termination proof. Restart uses existing captured acceptance to finish eligible synthetic usage, without issuing another accept or resetting counters. Test-only IPC supplies acknowledged pre-accept/owner-commit/lost-ACK/usage/lookup/chunk barriers and manual/never/failure/overrun schedules; no arbitrary SQL/path/destination or production endpoint is supplied.

The adapter component diagnostic queries the independent journal through fixture admin, tests eight concurrent dedup transports, both seal race orders with an observed PG blocker, lost ACK and two SIGKILL/recreates, exact/over-cap and Unicode/JSON/duration/cancel cases, private-state rebinding refusal, actual frame assembly, immutable history and concurrent/digest-incompatible migrations. Component results remain diagnostic; profile qualification/provenance, native accounting/one-use claim/Stop/output composition, all65 acceptance cases and independent reviews are assigned to later tasks. E01–E05 remain unqualified; no real provider/credential/spend/remote deployment, real ACL change or human message is introduced.

## f04-03 profile, context, qualification and proposal implementation

Implementation supplement, 2026-10-07: `profile.ts`, `context.ts`, `qualification.ts` and `proposal.ts` now implement the profile-layer boundaries. Current organization approval, provider/route/region/data-policy/runtime rules, executable qualification and all required capabilities precede fixed installed Fast/Balanced/Thorough preference orders. Omitted choice is Auto - organization approved; exact pins expose a typed model-unavailable result rather than silently substitute. Approved equivalent fallback requires explicit choice permission, a current installed policy predicate, equivalent semantics/residency and opaque evidence obtained by original-key lookup through the installed owner channel. Accepted/unknown/answer observations cannot create it. This layer performs no dispatch, ordinary session planning, durable retry-count change or native budget mutation; f04-04/05/06 own those operations and the persisted wait.

`QualificationRegistry` has no JSON register/import endpoint. Its local probe runs eight assertion groups through actual encoding/independent transport and durable captured receipts: delayed/known usage and lookup; Unicode text stream; complete local JSON tool stream; encoded context exact/over-cap; output/duration caps; cancellation request distinct from termination; exact/current-manifest private state; unsupported modality/dialect refusals. The resulting record binds actual Node/platform/architecture/loaded emitted-module/package/PG identity, source/check-definition and independent lock digests, complete profile/deployment/adapter version, unique executed probe/date/expiry and deterministic assurance. Unsupported feature declarations, absent/mismatched capture or changed pins prevent issuance; copied/untested/revoked/expired/mismatched records cannot select. Recreated registries need fresh probes. Probe records are finite local conformance diagnostics, not controller acceptance, independent review or external supplier clearance. Qualification/release finding gates remain f04-15.

Context composes the unchanged F01/F02 issued scope, authenticated UoW and `CurrentAudienceVerifier`. Native audience vocabulary requires source Task identity; the additive `SourceDescriptor` carries it explicitly. The new `ContextSourcePort`/`ContextBindingPort` participate in the existing transaction and compare current typed metadata/admitted Task/Run/payer/intent/profile rather than treating the earlier generic source-ID-only port as authority. No accepted port/schema is altered. The minimal `TaskContextSourceStore` reads metadata/body separately from governed native Task requirements through RLS; it creates no second source/memory authority. Cross-Space sharing would require an installed current source-owner read route, not billing-team membership. All descriptors authorize before any selected body retrieval. Returned revision/provenance/trust/scope/audience and content digest must match, and final authority/descriptor checks run again before encoding and remain available inside the later native dispatch transaction.

Captured payload contains the complete actual operating profile and typed capsule. Manifest fingerprint includes current policy/membership, sources, encoding/version identity, full original binding and preserved requirements/evidence/hypotheses/uncertainty/failed plans/pending operations/artifacts/checks/next action. Hostile evidence remains typed untrusted observation; it never raises intent/grants/allowance. Opaque state is scoped to provider/profile/route/region/Space/current manifest/actor/authority/pins. Exact and semantic response caching plus gateway knowledge memory have explicit enable refusals. Safe switches reload the native session, reject pending/terminal/stale boundaries, forbid attribution/intent/fence changes, validate semantic/residency/version changes through the installed native owner, recompile current sources and preserve all facts. Return values disclose cache lost/not-used and a synthetic reencoded input-plus-service estimate; the next native admission reserves its output separately and later FinOps records actual cost once.

Streamed tool proposals require complete contiguous bounded tool-argument frames, closed arguments, exact original request digest/full profile/current manifest/capsule encoding and the installed original-owner settled output digest. A one-use opaque token alone permits the local test handoff; Ask/wrong target/forged or stale token and invalid/partial stream refuse. Eight concurrent token handoffs admit exactly one. The effect identity derives stably from the original call for later native durable dedup; the installed native test port still owns current grant/intent/target/pending/generation admission. No real tool executor is added.

`components/profile.component.test.ts` executes one mandatory diagnostic identity with thirteen assertion-backed variants against two independent deterministic deployments, actual native Tasks/source revisions/audience and adapter captures. It exercises Auto and exact pin, denied/unsupported/busy/absent/expired/default rules, probe provenance/binding/expiry/revocation, descriptor-before-fetch and post-fetch/final mismatch, cache/opaque-state boundaries, safe/unknown fallback, complete proposal/native test-effect contention, actual capsule/deployment switch and final source/membership revocation. Earlier build-cache race observations are retained in controller logs; build-based commands must run sequentially because they share disposable emission. This diagnostic does not impersonate P01–P13 or qualify native session/ledger behavior. All65 acceptance cases, final evidence and independent reviews remain downstream. E01–E05 remain unqualified and external actions remain disabled.

## f04-04 shared ledger and immutable native intent implementation

Implementation supplement, 2026-10-07: migration2 expands the accepted PostgreSQL schema without changing any F01/F02/F03 migration, role grant, allowance/reservation/settlement constraint or check. Own migration1/2 bytes have explicit SHA256 pins; the separate owner-marked ledger verifies all installed prerequisites, refuses incompatible bytes/unknown versions/untracked tables, serializes concurrent migration callers and tests rollback from the previous schema. This is forward-only accounting expansion: operational rollback disables new admission while preserving every reservation, unknown liability, claim, session event, command receipt, audit and outbox. It does not drop tables or reverse settled costs.

Immutable server-installed billing metadata binds native Task/Run, actor, original payer/cost center, department, policy/version/source/session/fence identity and Run leaf allowance. The scoped allowance chain must include all tenant/department/person/Space/task/Run kinds with matching subjects and payer. Every configured aggregate account matching the native tenant/department/person subject applies automatically, including across Spaces; optional explicit account bindings may add constraints but cannot omit matching ones. Canonical tenant/kind/subject uniqueness prevents cloning cross-Space capacity. Account topology and billing/allowance metadata are immutable installation authority; account rows have no application SELECT grants. Fixed restricted functions return scoped leaf identity or a refusal, never foreign balances/content. Account and scoped tables have ENABLE/FORCE RLS; composite FKs and immutable history/intent guards preserve original attribution. Fixture admin installs this synthetic metadata; a production enrollment/billing administration route is not supplied.

Admission computes categories with safe-integer arithmetic, walks ancestry with depth64/cycle checks, locks the union of aggregate accounts in sorted UUID order then scoped allowance rows in sorted order, rechecks ancestry/current binding after waiting, and atomically increments all applicable reserves. It uses existing fabric budget_allowances/budget_reservations; category allocations and exact ancestor/account joins are additional metadata. Shared parent ceilings are consumed, never copied as child authority. Queries use composite primary/unique indexes for native identity, command keys, canonical aggregate subjects and reservation joins, plus the pending-Run expression index. The diagnostic executes EXPLAIN ANALYZE/BUFFERS on the actual sorted64-ancestor query; its finite fixture plan is not a scale/performance qualification.

ModelRepository.prepare composes the issued F02 authenticated UoW, unchanged F03 Space barrier/Run fence and actual native SessionLoop pending prefix. It validates the immutable installed binding, exact request/profile/context digest, native origin/version/attempt and contiguous reducer-valid history. Reservation, original operation, first attempt, native/model events, redacted correlated audit/outbox and original command receipt share one transaction. Mandatory late scope/session/payer/membership/policy/source-authority and command-expiry checks run after awaited locks and after actual audit/outbox writes. Original command-key advisory locks exclude request/payload digest; receipt lookup reads freshly after the lock. Genuine foundation UNKNOWN_COMMIT stays distinct from definite server refusals or spoofed error objects.

Claim has its own acknowledged authenticated COMMIT, unique durable per-attempt history and correlated audit/outbox. Only the acknowledging invocation receives a nonserializable one-use in-memory dispatch permit. Dispatch burns that permit before awaiting anything, rechecks current binding under the native fence and invokes only the injected trusted dispatch port. A failed or rolled-back dispatch transaction, lost claim-COMMIT acknowledgement, forged permit or recreated repository cannot regrant it. A prepared/claimed operation remains pending admission liability until f04-05's original-owner reconciliation; there is no automatic retry or release here. TransactionRetryRepository owns only borrowed-transaction count primitives; f04-05 supplies proof-qualified retry admission and settlement.

Synthetic top-up requires a fresh issued budget:control scope, current payer/Space/membership, exact scoped allowance, safe amount, original idempotent control key and mandatory audit/outbox/receipt in one transaction. It returns autoResumed:false and invokes no model/tool/resource port. It increases only the explicitly selected scoped ceiling; parent and aggregate ceilings remain independent limits. Resume/unknown retention and aggregate enterprise billing administration are separate operations.

The ledger diagnostic uses independent owned Node callers and nonprivileged authenticated PostgreSQL sessions to observe actual transaction/tuple Lock waits: parent100 with three distinct40-unit child reservations admits two; canonical shared person60 across isolated Spaces with40-unit contenders admits one. It verifies committed reserve/claim before independent adapter acceptance, one-use claim after rollback/recreation/lost ACK, native history/attribution/category joins, every limit independently binding, depth64/65/cycle/numeric/forged-scope denial, migration preservation, RLS/immutable/composite constraints, idempotent authorized top-up without resume and actual partial-write faults at reservation/operation/attempt/pending/audit/outbox. Dedicated synthetic tenants exercise membership/payer/policy revocation while blocked and session expiry at the account lock or after actual audit writes; expired sessions are never revived. Snapshots compare all model and budget records/balances, and adapter counters establish zero I/O on refused/rolled-back admission. These component diagnostics do not satisfy the still-pending65 full acceptance cases or independent reviews. E01–E05 remain explicitly unqualified.

## f04-05 coordinated retry and original-owner usage implementation

Implementation supplement, 2026-10-07: `model-service.ts`, `usage-repository.ts`, expanded `retry-repository.ts` and forward pinned migrations3/4/5 now supply the task's dispatch/reconcile and economic settlement primitives. Migrations1/2 and every accepted prerequisite remain byte-identical. Migration3 installs immutable scoped owner/resolution/category/deficit/cover records and fixed accounting functions; migration4 supplies a scoped exposure function without changing accepted base grants; migration5 enforces owner receipt/usage-key uniqueness across Spaces. Disable admission and retain these histories for rollback; never drop or rewrite installed records.

The service installs exact owner/profile/route channels. Prepare and owner binding precede acknowledged one-use claim; acceptance then holds the unchanged native fence for its bounded ACK only. Durable unclaimed preparations support separate explicit current dispatch, while any restored committed claim is lookup/seal-only. Engine and adapter retry labels use one immutable max3 operation count with unique reservations; both sealed preaccept and known charged failures consume an ordinal. Pending/unknown prohibits retry. Reconcile/cancel/seal accept only original identity, use the installed original receipt owner, serialize with acceptance, and recheck current identity/session/payer/policy/source/profile authority before commit/return. A stopped Task can recognize original liability under the separate recovery authority predicate without reopening native dispatch. Full native SessionLoop/output/wait/Stop composition remains f04-06.

Usage, exact original resolution, categories, base settlement/release, model state/events, audit/outbox and command result share one authenticated transaction. Conflicting observations preserve history; exact final duplicates cannot charge again, including cross-Space usage-key reuse. Unknown/accepted usage holds reserve through timeout, cancel, Stop, restart, rollback and COMMIT ambiguity. Only original permanent epoch seal permits release and rejects delayed acceptance. No absence-based release, receipt submission, destination selection or counter reset exists at the reconciliation boundary.

Measured overrun retains actual M and categories once, settles min(R,M) within accepted base guards, and records unique deficit M-R across all original allowance/account memberships. Uncovered deficit freezes affected admission, including shared aggregate accounts in another Space. Ordinary top-up leaves it unresolved; exact current budget:control cover adds the deficit to affected ceilings/base subtotals once, retains history/economic actual and returns autoResumed:false. Scoped exposure is held reserve+5 per potentially accepted pending claim; unclaimed prepare has no additional +5. M>R+5 is retained with explicit conformance:false, and qualification callers must propagate that failure.

`USAGE/retry-reconcile` is a diagnostic component, not any U/B acceptance case. It executes mixed three-attempt failure/success, duplicate retry contention, independent caller+adapter SIGKILL/recreation, original lookup-only once settlement, prepared-unclaimed recovery, empty-lookup unknown, actual native acceptance/reconcile lock blocking, bounded ACK versus inference delay, permanent seal-before-delayed-accept, immutable owner/receipt/category/cross-Space key conflicts, faults after real usage/audit/outbox writes, genuine lost-settlement COMMIT ACK, cancel/outage retention, native stopped-fence accounting and session expiry after writes. Deficit checks use explicit native-ledger tariff-fault primitives R20/M23/M26 with a separately persisted trusted fault observation; the actual immutable adapter journal is untouched. They do not claim byte-price preflight/full B01/B07. Ordinary local JSON requests still price the exact closed encoded payload. f04-10 must implement the approved full fixture consistently with frozen pricing rather than using this primitive as its substitute.

The task's controller usage check and relevant ledger regression run against actual owned PostgreSQL16.12, separate OIDC/adapter/caller processes and verified cleanup. Local strict source/test builds and contracts diagnostics also pass. The first usage diagnostic failed on hashing an installed port instead of serializable owner identity, exposure reading protected base tables, an invalid Stop fixture column and an attempted immutable journal mutation; the fixes retain all guards and raw controller failures, use a fixed scoped view/valid fence and separate fault observation. Current result identities/raw hashes belong to the controller handoff, not an author acceptance signature. All65 full suites, independent reviews and E01–E05 remain pending. No real supplier, credentials, spend, remote deployment or messages are enabled.

## f04-06 native composition implementation

Implementation supplement, 2026-10-07: `native-session` composes unchanged SessionLoop/replay, F01/F02 scoped UoW/authentication/audience and F03 native/parent fences. The trusted owned service-port carrier is parent IPC, with fresh F02 verification on every command and closed requestTurn/inspect/reconcile/topUp/resume/switchProfile/stop boundaries. It accepts no operator-provided identities, payer, port, URL, grant, mounted path, proposal outcome or accounting observation. HTTP carrier qualification is not claimed; adding that carrier requires the approved conditional negatives. Independent local qualification is explicit, never an effect of restore/inspect/polling.

Forward pinned migrations6–8 add immutable admission and durable controls, scoped safe no-dispatch proof, restricted cost/top-up functions and one Space computer assignment plus visible simulated preflight. No accepted migrations/grants/constraints or checks are edited. The async model port encodes the full qualified profile/current typed source capsule, atomically persists the exact native pending prefix and all reservations, then uses the initial acknowledged one-use claim. Acceptance ACK is separate from completion; a single original-owner control lookup can recognize known usage, otherwise a durable unknown wait remains. It is never a retry/polling inference loop. Restore is pure; explicit recovery uses only original resolveModel/owner accounting, including after Stop.

Model, budget, approval, resource, permission, connection and unknown-usage waits retain native history/preserved-work digest, installed resolver, database time, expiry and next actions/ongoing charge categories. Fresh synthetic budget:control top-up returns autoResumed:false. Explicit current narrower-scope resume rechecks the complete current capsule, original lineage/payer/fences/limits and unchanged budget owner under a rollback-only savepoint; it returns autoDispatched:false and cannot clear pending/unknown work. Safe switches preserve native work, revalidate complete current source/capsule authority and explicitly lose unused cache. Exact next-call encoding/reservation remains separate.

Stop invokes the unchanged F03 Stop owner in the authenticated native transaction and advances durable cancellation generation despite stale observed progress. Both Stop-first and accept-first lock orders fence future/stale model/child/computer/target work, while original costs/reserves and lookup/seal settlement remain. Output assembly checks settled original receipt digest; each chunk, returned output and final checkpoint reauthorize current source/audience/payer/intent/qualification/fences. Costs/views/errors exclude raw sources, model/private state and native/audit payloads.

Ask/service failures never provision/wake/enroll or fall back to a region. An installed local simulated computer requires Act/current computer:use plus visible preparing preflight with policy/requirements/generation/cost categories; a competing assignment cannot create a second Space computer. Only fresh explicit resume marks simulated-ready. Real provision/VM/no-VM isolation/storage/cold-start meters are unqualified. Task f04-07 supplies interval billing/lifecycle receipts; all65 named acceptance cases and E01–E05 remain pending beyond this component diagnostic.

The mandatory native diagnostic uses actual owned native processes and independent adapter/PG: compiled no-choice Ask, budget/approval waits with 32 zero-turn polls and SIGKILL/recreation, unauthorized/idempotent/stale/ancestor-limit top-up and narrower resume, unknown reserve retention, both observed Stop lock orders/parent Stop, zero-port replay, closed scope forgery/expiry/conflict negatives, required audit rollback, source audience revoked in flight and between separately authorized chunks, stale source control refusal, visible one-assignment computer simulation and RLS/immutable migration preservation. Final task-controller results belong to the run logs; this supplement does not claim aggregate or external acceptance.

## Task order and staffing

Fifteen bounded tasks: contracts/build first, seven implementation slices including contracts, then unit/integration/e2e/security/qualification suites. Every task has one lead and `team=[]`. Files and state transitions are coupled within each slice; extra seats would add coordination and file conflicts without a separate necessary output. Independent controller reviewers remain separate stages, not implementation team members. Resource stage verifies cached tooling, owned fixture capability and role responsibility before development; no named human owner or extra budget is invented here.

Implementation tasks include small assertion-backed component checks so each can be completed before the full independent suite exists. `check-component.mjs` accepts only seven closed component IDs and always strictly builds the current source AND tests, enforces nonempty passing tests/no skip/TODO, uses the same guards and actual relevant PG/process/native ports, and clearly reports diagnostic scope. Contracts is pure; integration components require real owned PG/IdP/adapter. No component pass establishes overall acceptance. The final checker already has a fixed manifest and must fail for any still-missing mandatory suite/case; there is no temporary optional-suite switch.

`check-slice.mjs` accepts only the eight suite IDs below, runs all cases/variants in that suite with the same build/fixture/parser guards, and never labels a slice overall acceptance. All commands below are **to be implemented**, not current successful checks.

| Task | Lead | Dependencies | Outcome | Controller task command(s) |
| --- | --- | --- | --- | --- |
| f04-01 | architect | none | Freeze additive contracts, package build and verification boundaries | `node g1-model/scripts/build.mjs`<br>`node g1-model/scripts/check-component.mjs contracts` |
| f04-02 | backend | f04-01 | Implement owned PG fixture and independent deterministic receipt adapter | `node g1-model/scripts/check-component.mjs adapter` |
| f04-03 | backend | f04-01, f04-02 | Implement eligible profiles, authorized context and safe proposal boundaries | `node g1-model/scripts/check-component.mjs profile` |
| f04-04 | data | f04-01, f04-02, f04-03 | Implement atomic shared allowance admission and immutable model intent | `node g1-model/scripts/check-component.mjs ledger` |
| f04-05 | backend | f04-02, f04-03, f04-04 | Implement coordinated retry, original-owner reconciliation and honest overrun settlement | `node g1-model/scripts/check-component.mjs usage` |
| f04-06 | backend | f04-03, f04-04, f04-05 | Compose native session entry point, durable waits, current output checks and Stop | `node g1-model/scripts/check-component.mjs native` |
| f04-07 | backend | f04-04, f04-05, f04-06 | Implement synthetic resource interval accounting and lifecycle cost views | `node g1-model/scripts/check-component.mjs resource` |
| f04-08 | tester | f04-01, f04-03, f04-04, f04-05, f04-06, f04-07 | Complete strict unit contract and pure native boundary suite | `node g1-model/scripts/check-slice.mjs contracts` |
| f04-09 | tester | f04-08 | Execute profile conformance, selection, source and stream integration suite | `node g1-model/scripts/check-slice.mjs profile-context` |
| f04-10 | tester | f04-09 | Execute atomic allowance, cost attribution and overrun integration suite | `node g1-model/scripts/check-slice.mjs budget-concurrency` |
| f04-11 | tester | f04-10 | Execute retry and durable unknown-usage crash/reconciliation suite | `node g1-model/scripts/check-slice.mjs retry-usage-recovery` |
| f04-12 | tester | f04-11 | Execute native wait, Stop and persistent resource integration suite | `node g1-model/scripts/check-slice.mjs native-wait-resource` |
| f04-13 | tester | f04-12 | Deliver and execute six documented local operator journeys | `node g1-model/scripts/check-slice.mjs operator-journeys` |
| f04-14 | security | f04-13 | Execute current authority, isolation, output and credential boundary suite | `node g1-model/scripts/check-slice.mjs authority-output` |
| f04-15 | tester | f04-14 | Complete qualification sabotage suite, evidence delivery and unchanged controller regressions | `node g1-model/scripts/check-slice.mjs qualification`<br>`node g1-model/scripts/check.mjs`<br>`node g1-identity/scripts/check.mjs`<br>`node g1-foundations/scripts/check.mjs`<br>`node g1-foundations/scripts/check-retained.mjs`<br>`node g1-model/scripts/check-evidence.mjs controller-behavior` |

### f04-01: Freeze additive contracts, package build and verification boundaries

Create only g1-model/ package/independent lock, strict source-and-test tsconfig, contracts/schema/errors and safe synthetic arithmetic; finish docs/planning/g1-f04-plan.md ownership/data-flow/version/recovery/rollback contracts against approved solution. Pin Node22.22.3/pnpm10.18.0/TS5.9.3/Node types22.18.6/pg8.16.3/types8.15.5 and cached PG digest; dependency license/notice/security/update metadata is factual (unknown remains unknown). Add baseline hash guards over accepted G0/local/foundations/F02/F03/protected/raw/design inputs, build.mjs frozen offline/script-disabled install and own-cache clearing, shared strict TAP/exit parser, fixed eight-suite/65-case manifest and fail-closed aggregate/slice runner. Missing future suites must fail aggregate rather than be optional. Define separate closed check-component.mjs diagnostics contracts/adapter/profile/ledger/usage/native/resource using real assertion-backed component tests; no partial acceptance. This task's contracts probe decodes a complete profile/receipt, rejects missing/unknown/accessor/version fields without executing getters, checks safe numeric overflow and unchanged native import identity. Later tester tasks complete all case variants. Touch no accepted source/check/lock/raw evidence or .loop by hand.

Covers: R-001, R-002, R-006, R-008, R-010, R-011, R-020, R-021, R-023, R-024, R-025, AF-02-01, AF-02-02, AF-02-17, AF-06-26.

- `node g1-model/scripts/build.mjs` — unit, timeout120s: Frozen independent install; clean strict compile includes source and tests; before/after retained hashes.
- `node g1-model/scripts/check-component.mjs contracts` — unit, timeout240s: Complete contract positive; unsafe/accessor/version negatives; exact pinned imports/manifest and native ownership.

### f04-02: Implement owned PG fixture and independent deterministic receipt adapter

Build src/test-adapter.ts/test-adapter-process.ts, adapter-only receipt schema/migration and tests/helpers process/PG/IdP fixture. Start only owner-marked cached PG and loopback child processes; reuse unchanged F01/F02 migration/authentication APIs with distinct fixture admin/controller/worker/client/receipt-owner connections. Adapter gets no controller/session credentials. Persist acceptance, captured encoded requests, usage, original-key epoch seals and counters in a separate restricted receipt domain. Support bounded text/local JSON dialect/chunks/context-output-duration bytes/cancel-request/lookup/private-state; unsupported capabilities and arbitrary destinations explicitly refuse. Add verified barrier hooks for acceptance/usage/lost-ack/lookup, process census/instance identity/reap and cleanup refusal. The adapter diagnostic actually roundtrips and records one accepted request, independently queries receipt, denies wrong binding/nonloopback/unknown fields, returns unknown on absence, seals a new epoch then denies stale accept, kills/recreates adapter and proves same journal with no fresh accept. Separate migration ledger owner lock/digest prevents replacing existing migrations; no Temporal dependency or downloads.

Covers: AF-02, AF-02-02, AF-06-20, AF-06-28, R-013, R-014, R-016, R-017, R-020, R-023.

- `node g1-model/scripts/check-component.mjs adapter` — integration, timeout240s: Actual cached PG, IdP/adapter owned startup/reap, independent persisted acceptance+usage+seal, closed loopback/refusal and recreated adapter journal.

### f04-03: Implement eligible profiles, authorized context and safe proposal boundaries

Implement profile/context/qualification modules on unchanged native contract vocabulary. Installed explicit eligibility rules precede preferences; omitted choice is Auto - organization approved, explicit qualified pin remains exact, absent/ineligible inventory waits with zero dispatch, and only currently permitted approved equivalents may fall back after known safe failure. Encode all full operating components and actual current manifest; authorize typed descriptors before retrieval, check returned digest/revision and final current authority, preserve hostile evidence and unresolved capsule facts without authority promotion. Scope opaque state to provider/profile/route/Space/current manifest; disable exact and semantic response caches and gateway knowledge memory with explicit enable refusals. Validate complete streamed proposals before native test-effect handoff; changes to semantics/residency/version require safe revalidated capsule with visible loss/revalidation cost. Local qualification binds actual probe/environment/check/lock/deployment/version/date/expiry, cannot self-declare. Profile component diagnostic uses actual deterministic adapter encoding/capture for eligible Auto and exact pin, and tests unsupported/ineligible/expired/default/fallback/context-revocation/cache/partial-proposal negatives; never owns ordinary session/retry planning.

Covers: AF-02, AF-02-01, AF-02-02, AF-02-03, AF-02-04, AF-02-05, AF-02-06, AF-02-07, AF-02-08, AF-02-09, AF-02-10, AF-02-11, AF-02-12, AF-02-13, AF-02-14, AF-02-15, AF-02-16, AF-02-17, AF-02-18, AF-02-19, AF-06-17, AF-06-21, R-025.

- `node g1-model/scripts/check-component.mjs profile` — integration, timeout240s: Captured full eligible Auto/pin request; zero denied dispatch/retrieval, qualification/capsule/cache/private-state/stream refusals.

### f04-04: Implement atomic shared allowance admission and immutable model intent

Add NEW digest-locked model migration(s), budget/model/retry repository prepare primitives and native immutable Task/Run/session linkage. Reuse existing allowance/reservation/settlement owners and constraints; add hierarchy/aggregate account metadata with sorted locks, depth64/cycle/safe arithmetic checks, single trusted billing binding across isolated Spaces. Reserve model/tool/execution/accounting categories against Run/ancestor and every applicable tenant/department/person/Space/task/run limit without copied child capacity. Persist original operation/attempt/reservation/version/history pending event/command receipt/audit/outbox in one authenticated transaction. Claim is separately durable and COMMIT acknowledged before any adapter I/O; one-use claim survives dispatch-transaction rollback. Shared original key lock excludes digest; known errors differ from genuine UNKNOWN_COMMIT. Add ENABLE/FORCE RLS, composite scope FKs/immutable history and restricted fixed account functions; late current session/membership/payer/policy/audit checks deny after awaited locks. Authorized synthetic top-up is scoped idempotent budget control and cannot auto-resume. Ledger diagnostic observes true blocked independent PG callers (100/40 parent+children and shared60/40 across Spaces), reservation committed before dispatch, forged owner/numeric denial, and verified partial-write audit rollback with unchanged records/balances and zero adapter I/O.

Covers: AF-06, AF-06-01, AF-06-02, AF-06-03, AF-06-04, AF-06-05, AF-06-12, AF-06-13, AF-06-14, AF-06-15, AF-06-16, AF-06-19, AF-06-26, AF-06-27, R-021, R-025.

- `node g1-model/scripts/check-component.mjs ledger` — integration, timeout240s: Actual ancestor/aggregate contention and blockers, immutable trusted owner, no-copy limits, partial-write rollback and safe-integer denial.

### f04-05: Implement coordinated retry, original-owner reconciliation and honest overrun settlement

Implement usage/retry repository and model-service dispatch/reconcile primitives. One immutable max3 operation attempt counter serves native and adapter retry requests; sealed preaccept and known settled failure consume ordinals, unknown prohibits all replay/retry. Bounded acceptance holds unchanged native Task/Stop fence but inference delay does not; accept only after durable prepare+claim commits. reconcile accepts original operation identity only, contacts installed original receipt owner, serializes lookup/seal with acceptance, rechecks late current authority before commit/return and settles exact trusted binding once. Empty lookup is unknown; only durable epoch seal releases and rejects late accept. Retain in-flight/unknown reserve across timeout/cancel/Stop/restart/COMMIT ambiguity. Settlement/resolution/categories/audit/outbox atomic; duplicate identical idempotent, conflicts immutable. Preserve measured M>R as additive unique deficit without altering accepted base guards; display economic actual, freeze affected admission, authorized once-only cover, +5 per pending local exposure and conformance failure while retaining out-of-bound actual. Usage diagnostic mixes three real attempts (sealed fail/charged fail/success) and denies fourth, loses accepted ack/recreates caller+adapter, verifies lookup-only once settlement/held unknown, conflicting receipt refusal, seal-before-delayed-accept and R20/M23 deficit/cover conservation.

Covers: AF-06-02, AF-06-06, AF-06-07, AF-06-08, AF-06-09, AF-06-10, AF-06-11, AF-06-16, AF-06-18, AF-06-23, AF-06-25, AF-06-27, AF-06-28, AF-18-14, R-025.

- `node g1-model/scripts/check-component.mjs usage` — integration, timeout240s: Actual max3 mixed attempts, lost-ack restart no-replay, original-owner seal/conflict settlement and overrun deficit/cover.

### f04-06: Compose native session entry point, durable waits, current output checks and Stop

Implement model-service.ts/native-session.ts/owned native-service process/view.ts and trusted operator port with requestTurn/inspect/reconcile/topUp/resume/switchProfile/stop. Compose unchanged SessionLoop/reducers/F01+F02 authentication/audience/F03 fences; no second planner or retry loop. modelOperation only binds server identities, async model port persists exact native pending prefix+reservation then initial claimed dispatch; restore/replay has zero I/O and pending work permits only original resolveModel. Persist model/budget/approval/resource/permission/connection waits with owner/times/expiry/preserved work/allowed next action. Current synthetic top-up and smaller-scope resume are separate fresh controls retaining unknown reserves. Controller classifies service/computer/target effects; Ask/service failure never provision/wake/enroll/fallback region, computer simulation requires visible admitted preflight and one assignment. Stop advances durable generations despite stale progress, fences all new/stale model/child/computer/effect continuation but preserves accounting. Reauthorize every output/chunk/source/payer/audience before disclosure, redact costs/events/errors. Choose trusted service-port operator carrier; if adding HTTP later, all conditional carrier negatives in test plan are mandatory. Native diagnostic runs actual no-choice Ask, budget and approval waits/restart with zero polling turns, authorized/unauthorized top-up+resume, both Stop/accept lock orderings, revoked in-flight output and zero-port replay.

Covers: AF-02-08, AF-02-20, AF-06-12, AF-06-13, AF-06-19, AF-06-22, AF-06-23, AF-06-24, AF-18, AF-18-01, AF-18-02, AF-18-03, AF-18-04, AF-18-05, AF-18-06, AF-18-07, AF-18-13, AF-18-15, UX-11, R-009, R-020, R-021, R-033.

- `node g1-model/scripts/check-component.mjs native` — integration, timeout240s: Actual native Ask/no-computer, restored waits, separate current top-up/resume, two Stop orderings, output revocation and replay counters.

### f04-07: Implement synthetic resource interval accounting and lifecycle cost views

Implement resource-contract/repository and extend authorized views only within g1-model. Trusted synthetic receipts reserve/settle via same native ledger; classify model/service/active/reserved compute/cold-start/storage/network separately and label unsupported actual meters. Half-open resource intervals/rate version/Space assignment generation are once-only; reject overlap/conflicting owner/rate, accept adjacency and explicit policy splits. Task-caused cost uses original Run lineage, persistent resource cost explicit Space allowance; concurrent task views reference one owning Space charge with unallocated-shared-cost, never duplicate economic machine charge. Reserved-until-confirmed-suspended policy persists through wait/Stop/unknown suspension; confirmed simulated suspend stops future compute while retained storage persists. Archive/Stop/suspend/delete-retention distinct; no real deletion/provisioning. Nonmodel settlement/checkpoint at exhaustion costs zero model units; production reserve guarantee unsupported, pending +5 exposure disclosed. Resource diagnostic races duplicate receipts through independent PG connections, restarts and proves one Space bill, rejects overlap/foreign owner, tests adjacent/policy split and continuing storage/compute before+after confirmed simulation.

Covers: AF-06-14, AF-06-22, AF-18-04, AF-18-08, AF-18-09, AF-18-10, AF-18-11, AF-18-12, AF-18-13, AF-18-14, R-024, R-033.

- `node g1-model/scripts/check-component.mjs resource` — integration, timeout240s: Real concurrent/restart interval once-charge and overlap refusal; unallocated conservation, lifecycle/category synthetic views.

### f04-08: Complete strict unit contract and pure native boundary suite

Implement tests/contracts.test.ts C01-C03 and every named field/decoder/numeric/ancestry/classification/capsule variant from independent test-plan §5. Exercise real exported schemas/helpers/unchanged reducers, complete frozen roundtrips and absent/unknown/accessor/version/malformed relationships; exact UTF8/safe max/overflow/cap0/exact/+1/64vs65/cycle/foreign ancestry; allocation equality and hostile capsule facts retained without grants. Assert distinct failure/inflight/unknown/settled and admitted service/computer/target authority, fabricated projections cannot authorize. Use fixed manifest actual test identities, no labels-only success. Expand component tests where useful but full C suite must run nonempty with no skip/TODO.

Covers: AF-02-01, AF-02-02, AF-02-13, AF-02-17, AF-06-09, AF-06-17, AF-18-02, AF-18-11, R-020, R-021, R-025, AF-06-26.

- `node g1-model/scripts/check-slice.mjs contracts` — unit, timeout180s: C01-C03 complete independent contract/numeric/native variants.

### f04-09: Execute profile conformance, selection, source and stream integration suite

Implement tests/profile-context.test.ts P01-P13 exactly from independent plan including actual adapter feature probes+PG qualification, controlled answer/proposal comparable baseline tasks and honest non-comparable unsupported pairing; captured full component bindings; capability/route/provider/region/data-policy filtering before preferences; no-choice Auto/exact pin/unavailable default negatives and both user/policy-equivalence permission branches; safe/stale/pending switch with costs/version pins; scoped private state/current fingerprints; authorize-before-fetch source races/hostile evidence; both unsupported response-cache enable refusals; approved deployment failover vs unknown usage; exact expiry/digest/version changes and all chunk argument variants with actual effect counts. No omitted variant tables, fake supplier/economics pass or private-state export. Tests observe actual native request/captures/receipts for ordinary journeys and only designated conformance baseline uses direct adapter probe.

Covers: AF-02, AF-02-01, AF-02-02, AF-02-03, AF-02-04, AF-02-05, AF-02-06, AF-02-07, AF-02-08, AF-02-09, AF-02-10, AF-02-11, AF-02-12, AF-02-13, AF-02-14, AF-02-15, AF-02-16, AF-02-17, AF-02-18, AF-06-17, AF-06-21, AF-18-01, R-025, R-027, R-031, AF-02-19.

- `node g1-model/scripts/check-slice.mjs profile-context` — integration, timeout600s: P01-P13 all supported/refusal/captured context/selection/switch/stream cases.

### f04-10: Execute atomic allowance, cost attribution and overrun integration suite

Implement tests/budget-concurrency.test.ts B01-B09 including independent-process parent100/40 race, shared person60/40 across two isolated Spaces and each limit independently binding; observe actual Lock wait/blocking PIDs, reverse orders and receipt joins. Fault after each verified partial write (ancestor/account/attempt/pending/audit/outbox and settlement) before rollback; boundary vectors run through ledger without mutation; task+maintenance/category execution/refusal; preflight/estimate/reserved/measured/settled exact bytes/caps; overrun20/23/out-of-bound26, immutable deficit+cover/frozen admission/exposure; original immutable payer/Run/action joins and no navigation retarget. Run32 fixed small schedules with max8 contenders and independent observers, preserve unknown conservation and economic receipts after each transition. Record timing only as harness diagnostics, no latency/SLA/leadership claim.

Covers: AF-06, AF-06-01, AF-06-02, AF-06-03, AF-06-04, AF-06-05, AF-06-07, AF-06-11, AF-06-13, AF-06-14, AF-06-15, AF-06-16, AF-06-17, AF-06-18, AF-06-21, AF-06-22, AF-18-14, R-004, R-021, AF-06-26, AF-06-27.

- `node g1-model/scripts/check-slice.mjs budget-concurrency` — integration, timeout600s: B01-B09 actual PG blocking, all partial-write/numeric/limit/category/overrun variants and32 schedules.

### f04-11: Execute retry and durable unknown-usage crash/reconciliation suite

Implement tests/retry-usage-recovery.test.ts U01-U11. Prove one max3 retry counter at both layers sequential/concurrent/duplicate, per-attempt charged failure receipts and no new-run allowance/history reset. Use true independent native/adapter processes and explicit four crash gates before/after prepare/claim/accept; SIGKILL/reap only current owner-marked PID, changed restart PID and unchanged PG/journal. Genuine lost prepare/claim/settle COMMIT with original-key commit/rollback/timeout contention vs spoofed error; original-owner identity-only reconciliation and forged/cross-Space/digest receipt refusal; active-absence before owner commit; both permanent-seal/accept race orders, outage remains unknown; duplicate/conflicting concurrent settlement+partial rollback; cancel/timeout/Stop liability/generation across restart; zero accept/write/provision/top-up/retrieval counters on replay. Count accept attempts as well as accepted inference so dedup cannot mask blind replay. Every exact fault/race variant from approved U case descriptions is mandatory.

Covers: AF-06-02, AF-06-04, AF-06-05, AF-06-06, AF-06-07, AF-06-08, AF-06-09, AF-06-10, AF-06-11, AF-06-23, AF-06-24, AF-06-25, R-020, R-025, AF-06-27, AF-06-28, AF-18-15.

- `node g1-model/scripts/check-slice.mjs retry-usage-recovery` — integration, timeout900s: U01-U11 actual process death/recreate and lock/COMMIT/seal/settle schedules; zero recovery accept/effect replay.

### f04-12: Execute native wait, Stop and persistent resource integration suite

Implement tests/native-wait-resource.test.ts N01-N08. Run genuine native Ask/failure/no-computer and classification refusal; admitted visible simulated preflight vs missing/stale cases and strict one-assignment contention; budget threshold/exhaustion wait preserved work+unknown liabilities across process restart/expiry/Stop; current authorized/unauthorized/stale/idempotent/conflicting top-up and within-scope separate resume;32 approval polls+clock/reconnect/restart zero models with ongoing costs. Observe both Stop-before-accept and accept-before-Stop actual blocker orderings, stale progress Stop and postrestart old/current child/computer/model/effect denial. Resource clock intervals through Stop/archive/unknown+confirmed suspension/declared retention, categories/caps settlement guarantee boundaries; race duplicate shared resource receipts, overlaps/adjacency/rate split/foreign bindings, recreated service and one Space/unallocated totals. Export diagnostic clock/barrier/census evidence without declaring real runtime tariffs/isolation.

Covers: AF-06-12, AF-06-19, AF-06-22, AF-06-23, AF-18, AF-18-01, AF-18-02, AF-18-03, AF-18-04, AF-18-05, AF-18-06, AF-18-07, UX-11, AF-18-08, AF-18-09, AF-18-10, AF-18-11, AF-18-12, AF-18-13, AF-18-14, AF-06-27, AF-18-15.

- `node g1-model/scripts/check-slice.mjs native-wait-resource` — integration, timeout600s: N01-N08 complete waits/restart/Stop races and synthetic lifecycle/shared interval behavior.

### f04-13: Deliver and execute six documented local operator journeys

Add bounded documented operator entry point in g1-model and usage in docs/planning/g1-f04-plan.md; implement tests/operator-journeys.test.ts J01-J06 through same authenticated native service port, actual adapter and PG. Fixed commands/inputs execute Ask preflight+Auto/payer/no-computer, denied capability/manual pin then current permitted switch, contested parent/shared aggregate and forged owner, known retry/unknown/restart/original lookup, saved budget wait+current synthetic top-up/smaller scope+approval polling, simulated computer/preflight/contention/Stop/archive/suspend/storage shared-charge. Assert readable reason/resolver/next action/preserved work/profile/fallback/retry count/held reserve/estimate/measured/settled/category fields from durable records, scope/redaction and correct valid/denied counter deltas; no prewritten JSON or new GUI. Record the deterministic performance limitation; measured process bounds protect tests only, E05 benchmark remains off.

Covers: AF-02-03, AF-02-06, AF-02-07, AF-02-08, AF-06, AF-06-01, AF-06-04, AF-06-06, AF-06-08, AF-06-10, AF-06-15, AF-06-24, AF-18, AF-18-04, AF-18-05, AF-18-06, AF-18-07, UX-11, AF-18-08, AF-18-09, AF-18-10, AF-18-11, AF-18-12, AF-18-13, R-009, R-033.

- `node g1-model/scripts/check-slice.mjs operator-journeys` — e2e, timeout600s: J01-J06 documented actual local entrypoint journeys and readable scoped retry/profile/reserve/category outcomes.

### f04-14: Execute current authority, isolation, output and credential boundary suite

Implement tests/authority-output.test.ts A01-A06 as independent behavioral assertions against genuine F02 IdP/issued scopes/nonprivileged PG roles/native/adapter. Forge scopes/client payer/team/foreign bindings and direct client/worker/adapter SQL; verify nonowner/nonsuperuser/nonBYPASSRLS and FORCE RLS/composite scope/aggregate non-disclosure. At prepare/claim/resume/switch/top-up hold real late-party locks and separately expire/revoke identity/session/member/payer/grants/Space/quarantine/policy/source; required authority/audit outage must fail closed and rollback. Revoke output/source audience between actual inference/chunks/publication; accounting stays original while denied disclosure zero. Revoke/expire during original-owner lookup and after later locks before commit/return; preserve liability. Harmless synthetic key/config/env/transport attempts cannot enable external route or leak secrets/DSNs/tokens/private reasoning into child/env/prompts/events/views. Assert correlated contiguous redacted outbox and consumer dedup/revocation, forged logs/projections grant nothing. If HTTP carrier is shipped include every listed carrier negative with valid counterpart. Suite implementation is not the later independent security review; unresolved high-severity findings block acceptance.

Covers: AF-02-08, AF-06-04, AF-06-05, AF-06-12, AF-06-13, AF-06-19, AF-06-20, AF-06-21, AF-06-22, AF-06-23, R-005, R-013, R-014, R-021, AF-02-20, AF-06-28.

- `node g1-model/scripts/check-slice.mjs authority-output` — security, timeout600s: A01-A06 late-authority/output/role/forgery/secret/derived-authority tests, zero forbidden outcomes.

### f04-15: Complete qualification sabotage suite, evidence delivery and unchanged controller regressions

Implement tests/qualification.test.ts Q01-Q09 and g1-model/scripts/check-evidence.mjs with closed local/controller-behavior phases. Freeze current candidate manifests; Q01-Q02 actual owned fresh-copy source+test error/stale cache/missing suite/case/empty/skip/TODO/failure/unknown arg/contradictory TAP sabotage using bounded shared parser/subprocess seam, nonrecursive and no accepted mutation. Q03 actual additive migration concurrency/idempotence/digest refusal and unchanged foundation1/2 identity3/loaded recovery/retained hashes; Q04 true runtime ownership/cleanup/process/native inventory plus later approval/action audit; Q05 every100 requirement/case/external gate, complete raw bytes/hash/current candidate/check/lock/env/profile binding with truthful pending statuses; Q06 unresolved/unverified high-severity gate refusal vs verified repair on labeled synthetic records; Q07 actual dependency/license/status/update and rollback disable admission but original recovery/history retained; Q08 fake supplier/invoice/no-VM/SLA/whole-G1 claims rejected, E01-E05 pending; Q09 false/old altered regression receipts refused, no fabricated review. Deliver docs/evidence/g1-f04-acceptance.md, finalize planning doc and100-row qualification matrix, preserve raw failed observations/usage and immutable complete controller stream indexes under g1-model/evidence. Before task done, request controller checks for current full model and unchanged identity/foundation/retained-baselines using loop_check; poll/inspect complete logs including outside-sandbox Electron/GUI, then append indexes/evidence with pre-index snapshot and post-check edits disclosed. Repeat integrated task/final checks after edits; never reuse author/old pass as acceptance. local phase permits honest pending current/controller/independent results; controller-behavior phase requires actual unchanged full-model+three baseline result bindings and complete raw logs, while independent reviews/human decisions stay separate pipeline gates. All four behavior checks and the evidence-index task check execute via controller on one fresh candidate; obtain required final security/code/evidence/action/license/scope judgments in controller review stages, no author signatures. Missing environment or forbidden outcomes fail, no skip/fallback; no supplier/network/paid/shared deployment/message approval needed or attempted.

Covers: R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-010, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019, R-020, R-022, R-023, R-024, R-025, R-026, R-027, R-028, R-029, R-030, R-031, R-032, R-033.

- `node g1-model/scripts/check-slice.mjs qualification` — integration, timeout900s: Q01-Q09 actual build/parser/migration/ownership/evidence/blocker/rollback/scope/refusal guards.
- `node g1-model/scripts/check.mjs` — acceptance, timeout1800s: Strict clean build plus all eight mandatory suites and65 case identities/variants, observed zero violations.
- `node g1-identity/scripts/check.mjs` — regression, timeout300s: Unchanged F02 current-candidate regression through controller.
- `node g1-foundations/scripts/check.mjs` — regression, timeout300s: Unchanged foundation current-candidate regression through controller.
- `node g1-foundations/scripts/check-retained.mjs` — regression, timeout1200s: Unchanged G0/G1-local/protected/raw/GUI checks controller outside sandbox.
- `node g1-model/scripts/check-evidence.mjs controller-behavior` — acceptance, timeout120s: Verify complete actual four-check controller streams/byte hashes and unchanged executable candidate/check/environment bindings; disclose post-index edits and pending independent judgment.
## Mandatory verification and controller evidence

| Suite | File | Fixed top-level cases | Slice command |
| --- | --- | --- | --- |
| C | `g1-model/tests/contracts.test.ts` | C01–C03 | `node g1-model/scripts/check-slice.mjs contracts` |
| P | `g1-model/tests/profile-context.test.ts` | P01–P13 | `node g1-model/scripts/check-slice.mjs profile-context` |
| B | `g1-model/tests/budget-concurrency.test.ts` | B01–B09 | `node g1-model/scripts/check-slice.mjs budget-concurrency` |
| U | `g1-model/tests/retry-usage-recovery.test.ts` | U01–U11 | `node g1-model/scripts/check-slice.mjs retry-usage-recovery` |
| N | `g1-model/tests/native-wait-resource.test.ts` | N01–N08 | `node g1-model/scripts/check-slice.mjs native-wait-resource` |
| A | `g1-model/tests/authority-output.test.ts` | A01–A06 | `node g1-model/scripts/check-slice.mjs authority-output` |
| Q | `g1-model/tests/qualification.test.ts` | Q01–Q09 | `node g1-model/scripts/check-slice.mjs qualification` |
| J | `g1-model/tests/operator-journeys.test.ts` | J01–J06 | `node g1-model/scripts/check-slice.mjs operator-journeys` |

All65 cases plus every named parameter variant in the independent design are mandatory in the aggregate, not just labels or reported totals. Source and test type errors, stale emitted success, removed suites/cases, empty tests, contradictory TAP, failure, skip, TODO, unknown arguments and failing cleanup must fail. Q01/Q02 sabotage only owned new-package copies through bounded nonrecursive shared-runner/parser seams. Missing cached PG, real process/loopback capability or blocker observation is failure, never a memory fallback. Valid authorized dispatch/settlement counterparts prevent vacuous zero-counter passes.

Contenders use independent processes/connections, explicit gates and actual PG wait_event=Lock/pg_blocking_pids observations. Maximum8 contenders/ancestry64. Observer and current-authority capacity are separate. Crash cases verify reached gate/committed records, original immutable key/digest/reservation/claim and current owner-marked PID/start identity, kill/reap/recreate the native/adapter process against the same database, and compare both accept-request and accepted-inference counters. Replay must produce zero model/tool/provision/top-up I/O. Partial-write trigger faults prove they reached their specified stage before rollback. Both Stop/accept and seal/accept lock orders are required.

No separate production performance suite or benchmark is enabled. B09's32 bounded schedules and process deadlines diagnose deterministic completion/contention; elapsed times are observations, not throughput/p95/2-second Stop/SLA or supplier savings qualification. Future E05 has its own approved workload/environment/budget decision. Security cases within P/B/U/N retain their original case levels even where the slice is classified integration; A is a dedicated security task after e2e.

Registered final checks remain exactly:

| Controller ID | Command | Required execution |
| --- | --- | --- |
| acceptance.g1-model-behavior | `node g1-model/scripts/check.mjs` | Current fresh candidate, strict clean build and all eight suites |
| acceptance.identity-behavior | `node g1-identity/scripts/check.mjs` | Unchanged F02 current candidate |
| acceptance.foundation-behavior | `node g1-foundations/scripts/check.mjs` | Unchanged foundations current candidate |
| acceptance.retained-baselines | `node g1-foundations/scripts/check-retained.mjs` | Unchanged protected/raw/G0/local/UI, controller outside sandbox |

Use `loop_check` for retained GUI/Electron execution outside the Codex sandbox. Do not directly launch GUI probes in sandbox or weaken them after a crash. New task checks may add slice diagnostics; they never replace these four definitions.

Qualification has two phases to avoid circular attestation:

1. Every aggregate runs local Q05/Q06/Q09 artifact/definition/finding-guard tests. Delivered evidence may truthfully state current controller checks or independent reviews pending. Labeled synthetic receipt/findings specimens test refusal; they are never saved as actual review/check results. Local validation passing cannot establish acceptance.
2. After actual controller runs complete, append complete immutable raw streams/indexes, original paths, byte counts/digests, candidate/source/check-definition/lock/environment/profile identities, actual case/variant counts and forbidden-outcome observations. `node g1-model/scripts/check-evidence.mjs controller-behavior` must verify actual full-model and unchanged baseline results; `local` validates truthful structure/pending status. Independent Q04–Q09 action/evidence/license/blocker/scope judgments and final/product reviews remain controller stages, separate from machine results.

f04-15 requests current controller checks before handoff, then records pre-index snapshot and post-check edits explicitly. Its task checks/final acceptance rerun after those edits. Evidence validators read controller records, never mutate them or recursively ask the controller to accept themselves. A post-check receipt-index update is disclosed rather than silently attributing an old check to the new document candidate; executable input manifests and later controller final fingerprint prove relevant identity. Historical failures and unknown host usage are retained. No author signature, invented zero cost, review rating or whole-G1 COMPLETE is emitted.

## Requirement delivery and qualification matrix

This planned matrix is100 rows, preserving all priorities. It links each obligation to implementation owners, full assertion-backed case IDs and tester owner(s). Cases/commands are not yet executed. External or independent gates remain additional obligations. Every listed local case and its variants must be exercised before local qualification; a requirement appearing in a task's `covers` is not evidence.

| Requirement | Priority | Implementation task(s) | Behavior case(s) / suite task(s) | Additional gate |
| --- | --- | --- | --- | --- |
| AF-02 | Must | f04-02, f04-03 | P01, P02 / f04-09 | E01 real supplier quality/conformance/comparable economics pending |
| AF-02-01 | Must | f04-01, f04-03 | C01, P01 / f04-08, f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-02 | Must | f04-01, f04-02, f04-03 | C01, P01 / f04-08, f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-03 | Must | f04-03 | P03, J02 / f04-09, f04-13 | Local deterministic proof; no external qualification implied |
| AF-02-04 | Must | f04-03 | P03, P06, P11 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-05 | Must | f04-03 | P03 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-06 | Must | f04-03 | P05, P11, J02 / f04-09, f04-13 | Local deterministic proof; no external qualification implied |
| AF-02-07 | Must | f04-03 | P04, P05, P06, J01 / f04-09, f04-13 | Local deterministic proof; no external qualification implied |
| AF-02-08 | Must | f04-03, f04-06 | P07, A02, J02 / f04-09, f04-14, f04-13 | Local deterministic proof; no external qualification implied |
| AF-02-09 | Must | f04-03 | P08 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-10 | Must | f04-03 | P07 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-11 | Must | f04-03 | P08, P09 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-12 | Must | f04-03 | P09 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-13 | Must | f04-03 | C03, P09 / f04-08, f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-14 | Must | f04-03 | P10 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-15 | Must | f04-03 | P10 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-16 | Must | f04-03 | P07, P11 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-17 | Must | f04-01, f04-03 | C01, P01, P12 / f04-08, f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-18 | Must | f04-03 | P07, P13 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-06 | Must | f04-04 | B01, B05, J03 / f04-10, f04-13 | E02 actual gateway billing reconciliation pending |
| AF-06-01 | Must | f04-04 | B02, J03 / f04-10, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-02 | Must | f04-04, f04-05 | B01, B03, B04, B09, U03, U07, U08 / f04-10, f04-11 | Local deterministic proof; no external qualification implied |
| AF-06-03 | Must | f04-04 | B08 / f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-04 | Must | f04-04 | B02, U05, A01, J03 / f04-10, f04-11, f04-14, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-05 | Must | f04-04 | B08, U11, A01 / f04-10, f04-11, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-06 | Must | f04-05 | U01, U11, J04 / f04-11, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-07 | Must | f04-05 | B05, U01 / f04-10, f04-11 | Local deterministic proof; no external qualification implied |
| AF-06-08 | Must | f04-05 | U02, U06, J04 / f04-11, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-09 | Must | f04-05 | C03, U01, U02, U07 / f04-08, f04-11 | Local deterministic proof; no external qualification implied |
| AF-06-10 | Must | f04-05 | U02, U03, U04, U09, J04 / f04-11, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-11 | Must | f04-05 | B07, B09, U05, U08 / f04-10, f04-11 | Local deterministic proof; no external qualification implied |
| AF-06-12 | Must | f04-04, f04-06 | N04, A01, A02, A04 / f04-12, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-13 | Must | f04-04, f04-06 | B03, A02, A04 / f04-10, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-14 | Must | f04-04, f04-07 | B05 / f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-15 | Must | f04-04 | B06, J01 / f04-10, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-16 | Must | f04-04, f04-05 | B06, B07 / f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-17 | Must | f04-03 | C02, P03, B06 / f04-08, f04-09, f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-18 | Must | f04-05 | B07, B09 / f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-19 | Must | f04-04, f04-06 | N04, A02 / f04-12, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-20 | Must | f04-02 | A05 / f04-14 | E02 real key custody/rotation pending |
| AF-06-21 | Must | f04-03 | P08, B02, A01, A05 / f04-09, f04-10, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-22 | Must | f04-06, f04-07 | B06, B08, N08, A03, A05, A06 / f04-10, f04-12, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-23 | Must | f04-05, f04-06 | U02, U09, N06, A03 / f04-11, f04-12, f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-24 | Must | f04-06 | U10, J04 / f04-11, f04-13 | Local deterministic proof; no external qualification implied |
| AF-06-25 | Must | f04-05 | U01, U11 / f04-11 | Local deterministic proof; no external qualification implied |
| AF-18 | Must | f04-06 | N01, J01 / f04-12, f04-13 | E03 actual no-VM/cold-start/storage costs pending |
| AF-18-01 | Must | f04-06 | P03, N01 / f04-09, f04-12 | E03 remote service isolation/egress pending |
| AF-18-02 | Must | f04-06 | C03, N01, N02 / f04-08, f04-12 | Local deterministic proof; no external qualification implied |
| AF-18-03 | Must | f04-06 | N01 / f04-12 | Local deterministic proof; no external qualification implied |
| AF-18-04 | Must | f04-06, f04-07 | N02, J06 / f04-12, f04-13 | E03 actual provision/preflight pending |
| AF-18-05 | Must | f04-06 | N03, J05 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-06 | Must | f04-06 | N03, N04, N05, J05 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-07 | Must | f04-06 | N05, J05 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| UX-11 | Must | f04-06 | N03, N04, J05 / f04-12, f04-13 | E02 actual delayed metering/real top-up; supporting local journey only |
| AF-18-08 | Must | f04-07 | N05, N07, J06 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-09 | Must | f04-07 | N07, J06 / f04-12, f04-13 | E03/E04 real retention/delete/restore pending |
| AF-18-10 | Must | f04-07 | N08, J06 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-11 | Must | f04-07 | C02, N08, J06 / f04-08, f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-12 | Must | f04-07 | N07, N08, J06 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-13 | Must | f04-06, f04-07 | N02, J06 / f04-12, f04-13 | Local deterministic proof; no external qualification implied |
| AF-18-14 | Must | f04-05, f04-07 | B07, N07 / f04-10, f04-12 | E02/E03 production reserve/overrun contract pending |
| R-001 | Must | f04-01 | Q01 / f04-15 | Local deterministic proof; no external qualification implied |
| R-002 | Must | f04-01 | Q01, Q02 / f04-15 | Local deterministic proof; no external qualification implied |
| R-003 | Must | Delivery/guard work in f04-15 | Q02 / f04-15 | Local deterministic proof; no external qualification implied |
| R-004 | Must | Delivery/guard work in f04-10, f04-15 | B01, Q02 / f04-10, f04-15 | Local deterministic proof; no external qualification implied |
| R-005 | Must | Delivery/guard work in f04-14, f04-15 | A06, Q02, Q06 / f04-14, f04-15 | Local deterministic proof; no external qualification implied |
| R-006 | Must | f04-01 | Q05 / f04-15 | Local deterministic proof; no external qualification implied |
| R-007 | Must | Delivery/guard work in f04-15 | Q05 / f04-15 | Independent current-candidate evidence audit |
| R-008 | Should | f04-01 | Q05 / f04-15 | Independent traceability review |
| R-009 | Should | f04-06 | J01, J02, J03, J04, J05, J06 / f04-13 | Local deterministic proof; no external qualification implied |
| R-010 | Must | f04-01 | Q03, Q09 / f04-15 | Unchanged controller regressions (Q09) |
| R-011 | Must | f04-01 | Q03, Q05, Q09 / f04-15 | Independent additive diff/raw/usage preservation audit |
| R-012 | Must | Delivery/guard work in f04-15 | Q09 / f04-15 | Outside-sandbox controller GUI/Electron logs (Q09) |
| R-013 | Must | f04-02 | A05, Q04 / f04-14, f04-15 | Local deterministic proof; no external qualification implied |
| R-014 | Must | f04-02 | A05, Q04 / f04-14, f04-15 | Exact approval before future provider/credential/spend (E01/E02/E03) |
| R-015 | Must | Delivery/guard work in f04-15 | Q04 / f04-15 | Exact approval before any shared/production deployment |
| R-016 | Must | f04-02 | Q04 / f04-15 | Exact approval before nonreproducible delete/overwrite |
| R-017 | Must | f04-02 | Q04 / f04-15 | Exact approval before real credentials/secrets/ACL/settings changes |
| R-018 | Must | Delivery/guard work in f04-15 | Q04 / f04-15 | Exact approval before human messages/emails/posts |
| R-019 | Must | Delivery/guard work in f04-15 | Q04 / f04-15 | Exact approval before history rewrite/branch delete/force push |
| R-020 | Must | f04-01, f04-02, f04-06 | C03, U10, Q04 / f04-08, f04-11, f04-15 | Local deterministic proof; no external qualification implied |
| R-021 | Must | f04-01, f04-04, f04-06 | C03, B08, A01, A06 / f04-08, f04-10, f04-14 | Local deterministic proof; no external qualification implied |
| R-022 | Must | Delivery/guard work in f04-15 | Q05, Q06, Q09 / f04-15 | Controller results + independent reviews + applicable human judgment |
| R-023 | Must | f04-01, f04-02 | Q01, Q07 / f04-15 | Dependency/license/security/update metadata review |
| R-024 | Must | f04-01, f04-07 | Q05, Q07 / f04-15 | Independent data-flow/threat/recovery/rollback review |
| R-025 | Must | f04-01, f04-03, f04-04, f04-05 | C01, P07, P12, U10, Q03, Q07 / f04-08, f04-09, f04-11, f04-15 | Local deterministic proof; no external qualification implied |
| R-026 | Must | Delivery/guard work in f04-15 | Q06 / f04-15 | Independent security/release blocker review |
| R-027 | Must | Delivery/guard work in f04-09, f04-15 | P02, Q08 / f04-09, f04-15 | E01 supplier/conformance/comparable tasks pending |
| R-028 | Must | Delivery/guard work in f04-15 | Q08 / f04-15 | E02 gateway billing/real top-up pending |
| R-029 | Must | Delivery/guard work in f04-15 | Q08 / f04-15 | E03 runtime/resource/storage pending |
| R-030 | Must | Delivery/guard work in f04-15 | Q08 / f04-15 | E04 full product/human/physical-device pending |
| R-031 | Must | Delivery/guard work in f04-09, f04-15 | P02, Q08 / f04-09, f04-15 | E05 performance/economics pending |
| R-032 | Could | Delivery/guard work in f04-15 | Q08 / f04-15 | Optional fixture absent or justified deterministic only |
| AF-02-19 | Must | f04-03 | P13 / f04-09 | Local deterministic proof; no external qualification implied |
| AF-02-20 | Must | f04-06 | A03 / f04-14 | Local deterministic proof; no external qualification implied |
| AF-06-26 | Must | f04-01, f04-04 | C02, B04 / f04-08, f04-10 | Local deterministic proof; no external qualification implied |
| AF-06-27 | Must | f04-04, f04-05 | B03, U02, U03, U04, U06, N06 / f04-10, f04-11, f04-12 | Local deterministic proof; no external qualification implied |
| AF-06-28 | Must | f04-02, f04-05 | U04, U05, U06, U07, A04 / f04-11, f04-14 | Local deterministic proof; no external qualification implied |
| AF-18-15 | Must | f04-06 | U09, N06 / f04-11, f04-12 | Local deterministic proof; no external qualification implied |
| R-033 | Should | f04-06, f04-07 | Q05, J01, J04, J06 / f04-15, f04-13 | Local deterministic proof; no external qualification implied |

## Operating, recovery and rollback procedure

The implemented operator journey will be deterministic, authenticated and bounded; f04-13 supplies exact runnable inputs and f04-15 records resulting controller outputs. Ordinary operator views show Auto/pin/actual profile, modality/data policy/cost class/fallback, original payer and allowance, retry count, held reserve, distinct estimate/measured/settled/unknown state, separate charge categories and permitted next action without source bodies/private reasoning/credentials.

Recovery order: reload current identity/tombstones/Space/payer/policy; load original Task/Run/history/version pins; rebuild native projections with zero I/O; enumerate pending/claimed/unknown and persistent resource liability; lookup/seal only original downstream identity; settle once under late current authority; expose safe known result/wait; require explicit current continuation. Claimed work is lookup-only after death. Timeout/Stop/cancel and owner absence never release liability by themselves. Authentic UNKNOWN_COMMIT uses serialized original-key lookup, not spoofed error-code replay. Output revocation blocks publication without erasing original charges.

Rollback disables new F04 selection/admission while retaining history, unknown reservations, downstream receipts, settled charges and deficit/cover evidence. Current authorized original-owner lookup/settlement remains available; never drop records/tables, reset allowance, resubmit accepted inference or resurrect expired credentials. Version changes happen only at validated compatible boundaries; unsupported versions wait/refuse. Q07 executes the local disable-admission/retained-recovery path. Full backup/restore/delete propagation remains F05 and later runtime qualification.

New ledger/account/receipt/proposal boundaries require closed decoders, fixed SQL, current audience checks, one-use claims/seals, immutable original bindings and events, FORCE RLS, nonprivileged service roles and credential/environment minimization. Aggregate billing never becomes content access. Fixture admin may migrate or inject faults only in owner-marked reproducible local data, preserving accepted roles/functions/constraints. Cleanup verifies marker/path/symlink/process-instance before deleting/signalling only created reproducible artifacts; failure leaves diagnostic state and fails the check.

## Required environment and remaining external gates

Local resource stage must verify Node22.22.3, pnpm10.18.0, TypeScript5.9.3, Node types22.18.6, pg8.16.3/types8.15.5 and frozen offline cache `/private/tmp/agent-fabric-pnpm-store`; independent lock/install/license/notice/modification/security-status/update responsibility; cached PostgreSQL image `postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333`; owned process census/loopback/kill/recreate/reap and controller outside-sandbox GUI environment. It does not pull a new image or enable external resources. Security metadata must say unknown where not investigated, rather than presume clean.

| Gate | Still unqualified | Responsibility and future decision/evidence |
| --- | --- | --- |
| E01 supplier/model | Real supplier/version/route/region/data-policy, modalities/tools/stream/context/cancel/usage/private cache/failover, comparable task quality/economics | Model/evaluation responsibility; exact supplier/route/region/credential/spend user decision and loop approval before invocation; actual controlled conformance+task evidence/expiry |
| E02 gateway/FinOps | Gateway edition/license, key custody/rotation, delayed metering/invoice reconciliation, real aggregate budget/overrun terms and top-up | FinOps/security responsibility; approved gateway/billing contract and exact paid/credential actions, original request-to-invoice discrepancy evidence; G2 enterprise depth retained |
| E03 runtime/storage | Actual no-VM isolation, Linux image/mount/egress enforcement, provision/wake/cold-start distributions/idle suspension, compute/storage/network tariffs and resource reserve guarantee | Runtime/storage responsibility in F05/F06; approved actual host/image/region/resources/retention/settings, measured containment/lifecycle/meters; real delete/restore needs its own authorization |
| E04 broader product/human | Formal SSO, representative human judgment, physical three-device/sleep, signing/distribution, full deletion/restore, Fleet/Memory/Design/Reflect and whole G1/G2–G5 | Identity/clients/product and later increment responsibilities; independent approved environments/journeys/human evidence, no recruiting messages or invented ratings |
| E05 performance/economics | Warm/cold/model latency targets, production SLA, performance leadership or supplier savings | Evaluation/runtime/FinOps responsibility; separate controlled workload/environment/model/permissions/total-budget benchmark and independent review; local deadlines are no SLA |

Real provider calls, credentials, paid APIs/cloud/resources, shared/production deploy/release, nonreproducible deletion/overwrite, real credential/secret/ACL/security setting changes, human messages/posts, force-push/published-history rewrite/branch deletion remain OFF absent exact prior `loop_ask(kind=approval)`. Synthetic fixture roles are confined to newly owned reproducible databases. No external approval is requested merely to finish deterministic development. Optional R-032 profiles/failure schedules are absent by default; additions need an explicit coverage purpose under the same deterministic authority/cost limits.

High-severity authorization/isolation/stale-approval/duplicate-effect defects block the affected profile despite passing unrelated tests. Finite zero-violation suites are gates, not immunity. Independent security/code/final/product reviews and applicable real human/environment decisions remain necessary; neither this plan, a diagnostic check nor a local artifact validator issues them.

## Planning exit

Submit15 single-lead tasks with executable failing checks, valid acyclic dependencies and100/100 requirement coverage through `loop_plan(final=true)`. Next is resource verification and independent plan review before development. This stage creates planning documentation only and runs documentation/coverage/preservation audits; all behavioral product checks above are future work.

## f04-07 implementation boundary — synthetic resource intervals

`g1-model/src/resource-contract.ts` and `resource-repository.ts` consume only an installed synthetic owner channel by original receipt/proof ID. Operator commands cannot supply usage, tariff, payer or suspension proof. Migration9 installs immutable scoped resource bindings, rate windows, half-open intervals and lifecycle history; migration10 adds a fixed scoped cost projection without granting direct access to native reservation tables. Earlier applied SQL bytes/pins remain unchanged. The resource migration tests rollback before forward application and verifies fixture ownership and migration digests.

Every interval reserves and settles in the existing native `budget_reservations`, `usage_settlements`, allowance/account balances and original reservation membership tables. Task-caused receipts use their original Run billing ancestry and native/parent fencing. Persistent costs use an explicit Space resource allowance and tenant/department/person aggregate ceilings. The accepted schema requires non-null reservation `run_id`: persistent records retain an immutable admitted Run as a correlation anchor, while `origin_run_id = NULL` defines Space economic ownership. This anchor neither allocates the cost to that Task nor debits its Task/Run allowances. Views must use resource interval ownership, never infer allocation from the correlation anchor or sum ancestor balances.

One tenant/resource mutex serializes receipt IDs, overlapping intervals and lifecycle proofs across independent connections. Active/reserved compute cannot overlap each other; other categories have independent meters. Exact receipts are idempotent; different receipts for the same interval, foreign owner/Space/generation, changed rate or boundary-spanning rates refuse. Adjacency is valid. Policy change requires separate `[start,boundary)` and `[boundary,end)` receipts at their installed versions. Shared Task views reference identical owning-Space charge IDs as `unallocated-shared-cost`; allocated Task totals exclude those references.

The synthetic idle policy is `reserved-until-confirmed-suspended`. Wait and native Task Stop do not end compute/storage metering. Resource lifecycle archive/stop entries are explanatory local markers: actual Task Stop still goes through the native fence owner, and a conversation archive marker does not archive the Space or Stop a Task. Request-suspend remains unconfirmed and billable. Only the installed owner's confirmed simulated proof can close future compute, and its boundary cannot erase already recorded compute intervals. Retained storage continues after suspension and after a declared delete-retention transition. No data is deleted, no VM is provisioned and no external meter is queried.

Authorized views distinguish resource totals from native model/service liability, including actual claimed-attempt `+5` pending exposure. Settlement and lifecycle checkpoint operations call zero models at exhausted allowances; a production settlement/checkpoint reserve guarantee remains unsupported. Real cold-start, storage/compute/network tariffs, runtime suspension/deletion/restore and gateway invoices still require E02/E03 decisions and external qualification. The resource component is a development diagnostic, not approved N07/N08 or whole F04 acceptance.

## f04-08 strict contracts and pure native boundary coverage

Implementation supplement, 2026-10-07: `tests/contracts.test.ts` implements the fixed C01–C03 identities. Every central exported contract decoder has an actual positive row; operation/attempt/observation/outcome/event/wait branches have independent rows. Recursive named field cases remove mandatory fields, substitute undefined, install nonenumerable or accessor descriptors (zero getter executions), change versions and insert nested unknown fields. Separate vectors cover primitive decoder limits, sparse/prototyped/symbol arrays, all full-profile digest components, qualification relationships and refusal of unexecuted self-attestation, capsule/event scope relationships, receipt sums/outcomes, retry ceilings/claims, waits and half-open resource interval products. JSON roundtrips compare complete data and recursively assert freezing.

C02 exercises safe numeric boundaries and overflow, exact encoded UTF-8 pricing including local JSON overhead, empty/multibyte/combining text, cap0/exact/+1, 64/65 ancestry, cycles and foreign payer/Space/tenant, and resource view allocation equality. The locked native parent walk now calls exported `assertBillingAncestor` for the same pure identity/depth checks used by the unit cases. `resourceCostView` decodes each original resource receipt before validated multiplication. These pure tests do not replace PostgreSQL concurrency/recovery evidence or actual resource billing.

C03 exercises the unchanged reducer/SessionLoop aliases, explicit in-flight barriers, safely failed/unknown/settled owner resolutions, retained charges for known failure/cancellation, and model text or completion claims that cannot clear unknown usage or grant effects. Exported `capsuleFactsOf` is the lossless typed projection shared by safe profile switches and native controls; the unit suite proves retention of hostile observations, provenance/trust/time, hypotheses, uncertainty, failed plans, pending operations, artifacts and unknown checks. The exported continuation predicate is used inside the authenticated native transaction, after current repository authority/fence checks. It tests admitted service/computer/target and Ask/Plan/Act limits; it is not a scope, approval or target-permit minting API. Projection-shaped JSON, fake VerifiedScope and fake one-use proposal tokens refuse without invoking installed ports. Ordinary service and ungranted computer preflight invoke zero SQL in the pure boundary vectors. Actual current authority, target ownership, dispatch and economic settlement remain the integration suites' responsibilities.

No accepted source, migration, check or raw evidence was edited. The fixed eight-suite/65-case manifest and aggregate admission rules remain unchanged. Qualification remains deterministic local only; E01–E05 and the later full suites/reviews/product stages remain pending.

## f04-09 development checkpoint — native P suite remains red

Turn19 adds `tests/profile-context.test.ts` with all P01–P13 case identities and named executable variants, plus `tests/helpers/profile-context-journey.ts`. Ordinary journeys enter the real NativeSession, authenticated model reservation/claim, separately running deterministic receipt owner and once-only PostgreSQL settlement. Only the designated conformance probes and P02 comparison baseline call the adapter directly. Installed fault ports control real owner schedules and completion; they do not return fabricated responses or receipts. Current source owner and audience checks precede retrieval; fresh source/identity states and actual Task revision changes exercise refusal. No paid or external qualification is implied.

The initial red suite exposed native defects and fixture errors. The fixture errors were corrected without relaxing product expectations. Scoped production fixes retain the last complete typed capsule across later native encoding, recheck installed version pins during context/control authorization, expose recorded-request versus current-selection profile metadata, and return a synthetic byte-based switch revalidation estimate. The estimate covers the currently preserved capsule plus output cap; the next turn reserves its actual newly encoded input separately. It does not reserve or dispatch a model during switching. Required current source/authority/fence checks and original cost attribution remain mandatory.

The P suite is **not complete or qualified as a whole**. Its current failure gate preserves the blocked second-profile pin, user/policy equivalent replacement and original-operation retry/failover schedules. Native composition still constrains model authority to its single installed profile; the lower-level retry repository exists but the native session/operator path does not yet compose it. P02/P11 currently stop at an explicit missing native retry-route assertion after real failure/receipt observations. They must be expanded into actual ordinal/reservation/history/output/cost assertions after that route is implemented. A method-presence assertion alone must never be counted as proof of a completed retry. Complete the positive A→B switch, permission removal between selection and dispatch, separate current user/policy permission semantics, fallback detail/history binding and comparable retry/revalidation totals before claiming f04-09 done. The fixed approved variant obligations remain unchanged.

Current command evidence and remaining defects are indexed in `docs/evidence/g1-f04-acceptance.md`. All protected accepted inputs, earlier applied migration bytes, raw controller logs and final acceptance definitions remain unchanged. E01–E05 remain pending external decisions/environments.


## f04-10 budget integration implementation boundary

`tests/budget-concurrency.test.ts` implements B01–B09 through authenticated native model/budget/usage and synthetic resource repositories. `helpers/budget-caller-process.ts` authenticates in separate bounded processes and holds real PostgreSQL transactions at verified partial writes. `helpers/budget-fixture.ts` supplies isolated Spaces, original-owner fault observations and an independent observer that recomputes allowance/account balances from reservation memberships, actual settlement and immutable cover records. The observer checks availability and economic receipt/category sums at every explicit acknowledged transition; it never treats ancestor subtotals as independent charges.

The fixed parent100/40 and cross-Space person60/40 schedules test actual accounting reservations with reversed process order, observed Lock/blocking PIDs and denied-process recreation. Forty units is smaller than this local model dialect's conservative wire estimate: these are explicitly accounting probes, discharged only by the real independent owner's permanent original-identity seal. A separate independent-process model schedule sets the shared ceiling to exactly two conservative full-byte estimates, then checks every accepted request against its prior committed reservation and immutable original Task/Run/receipt; the third caller never reaches the owner. No test advertises a40-unit model invoice.

Fixture-admin triggers run after actual account/ancestor/reservation/resolution/category/settlement/deficit writes and raise only after their specified stage has occurred; trusted hooks verify operation/attempt/pending/audit/outbox rows before rollback. Independent snapshots and the real owner journal prove complete rollback and original-key recovery. No accepted constraint, migration byte, role, source or checker is disabled. Numeric vectors enter real reserve/top-up/settlement/resource methods, including exact fit, +1, a separate empty safe-maximum tenant, malformed inputs, checked products, depth64/65, cycles and mismatched payer. Immutable metadata rejects rebinding at installation.

Planning, within-task reflection and explicitly installed maintenance run through NativeSession and the real deterministic owner. Embedding/reranking/tool auxiliary execution remains unsupported and refuses; their category receipts are labeled accounting probes. Synthetic compute/storage/network intervals exercise real repository accounting, without real resources or tariffs. Acknowledged prepare can be held before claim for preflight inspection; a separate held acceptance ACK proves native unknown usage, retained reserve/exposure and once-only original-owner settlement. The retained Space barrier and bounded acceptance deadline remain unchanged.

R20/M20,23,26 tariff-fault fixtures persist immutable installed owner observations and exercise base=min(R,M), actualM, affected-path deficits/frozen admission, top-up versus explicit cover and exact economic totals. Separate real downstream full-byte requests generate an installed +3 overrun schedule for two accepted pending sessions. Out-of-bound usage remains actual and conformance=false. The32 fixed normal schedules use up to8 independent authenticated contenders with reverse ordering and separate observer connections; known settlement, permanent seal, unknown, duplicate and authorized top-up preserve balances and held liability. Timings remain harness diagnostics without SLA/performance/economic claims.

The existing native/resource fixture constructors now allow explicit trusted purpose/category options and repeated additive migration setup in the same owned database; defaults and original checks remain unchanged. B qualification is bounded local contract evidence, subject to its actual controller result and later aggregate/review gates. Supplier conformance, gateway invoices, real billing/top-up, no-VM containment, actual resource meters/retention and E01–E05 remain unqualified.


## f04-11 development checkpoint — terminal unknown liability still blocks completion

Turn22 implements all U01–U11 identities and111 assertion-backed tests, including four exact-case review additions: distinct engine/adapter contender identities, actual bounded timeout after owner acceptance COMMIT, original aggregate-account constraints on a linked Run, and terminal failed Run retaining unknown usage. Strict source/test build passes and1733 protected inputs remain unchanged. The terminal native command prewrite defect is fixed using the unchanged native terminal predicate; native18/18, profile/context223/223 and contracts1646/1646 controller regressions pass.

The final strengthened controller gate `job-382b438476` passes109/111 and fails one U11 admission variant plus its parent. NativeRepository.open incorrectly admits linked attempt2 while the same Task still carries the original accepted unknown call. This slice stays ACTIVE; no task completion or requirement downgrade is authorized. Next is a F04-only Task-scoped admission/continuation guard under the existing Space barrier, with direct model prepare bypass proof and original-owner reconciliation preserved, followed by strict/controller reruns. Keep accepted scheduler/foundation/recovery tracks unchanged. Complete raw failures, regression hashes, owned cleanup and external qualification limits are indexed in `docs/evidence/g1-f04-acceptance.md` Turn22. No real provider or paid route was enabled.

## f04-11 Turn23 repair boundary — unresolved usage spans linked Runs

`assertOtherRunsResolved` checks unresolved prepared/pending/unknown model operations on other Runs of the same immutable tenant/Space/Task. Native admission, native freshness and the lower model lock boundary use it under the existing exclusive Space barrier. Original Run claim/retry rules remain in force, and original-owner usage reconciliation does not acquire a fresh submission permit. Native freshness now acquires the barrier itself because the admission transaction may call it directly without loading a snapshot first. No accepted scheduler, foundation, identity, recovery implementation, applied migration bytes or frozen checks change.

The preserved terminal-unknown U11 negative now also submits a valid linked request directly to ModelRepository.prepare and calls the authenticated continuation freshness boundary. Both refuse before reservation, pending history, command/audit or I/O; full snapshots, old liability/journal and both acceptance counters remain exact. An independent connection holds the real Space advisory lock, and the test observes the freshness transaction's actual Lock/blocking PID before releasing it. This assertion fails if freshness observes the fence without owning the barrier. Actual original-owner finalization and native reconciliation then settle the original receipt, clear pending model state while retaining failed history, and permit linked admission with no new accept. Known charged linked-Run exact/short ancestor/account positives remain mandatory.

First repaired controller U gate passes111/111, and the first affected regression gate passes all profile/ledger/usage/native/resource components plus C/P/B. The final barrier-strengthened candidate is undergoing the same controller checks before f04-11 completion. Raw evidence, all owned cleanup and final status are recorded in the additive acceptance index. This is deterministic local development qualification only; remaining N/A/Q/J suites, aggregate/review/product gates and E01–E05 remain pending.

Turn23 completion: final barrier-strengthened job `job-a23efad9f8` passes U111/111 and all eight affected regression checks. Controller task-completion rerun `job-0e50787854` passes U111/111 with0 failures/cancelled/skipped/TODO and verifies all1733 retained inputs;204/204 owned children and the fixture PG are removed. The controller marks f04-11 done,11/15 tasks complete, and assigns f04-12 next. Complete raw streams, hashes and cleanup identities are indexed in the acceptance evidence. This closes the local U development slice only; the remaining suites, aggregate/review/product stages and external gates above stay open.


## Turn24 f04-12 implementation supplement

N01–N08 are implemented in the native wait/resource suite with connected continuation callbacks, explicit target classification, real authenticated preflight contention/Stop blocker orders, fixed control-clock and synthetic resource intervals, exact/below/exhausted admission, current top-up/resume, owned restart and once-only shared/Run accounting. All mandatory tests/checks and accepted sources remain unchanged. The optional trusted target-class fixture parameter does not affect prior defaults. Real runtime isolation/provisioning/retention/tariffs and E01–E05 remain unqualified.

The retained first N run times out due to a new nested TestContext scheduling error; its two missing cleanup witnesses are positively absent in supplemental controller census job-805996f9f9, with no signalling. An additive30second maintenance check was registered for f04-12 only; it leaves the mandatory N command/timeout/manifest intact. `loop_plan(final=true)` preserves coverage and requires controller review of the changed plan digest; historical plan-review results remain retained. All failed/corrected streams and exact implementation coverage are indexed in the acceptance evidence. Final strengthened N/controller regressions are running; f04-12 is not yet declared complete here.


Final strengthened N candidate job `job-65289354eb` passes99/99 (N01–N08+91 variants) and native18/resource18/contracts1646 with0 fail/cancelled/skipped/TODO. Seven actual required lock/barrier observations,51/51 N children reaped and PG removal are audited in the acceptance index. This closes the implementation candidate coverage gaps; task-completion rerun and controller review of the additive maintenance plan digest remain separate. Remaining J/A/Q/full acceptance and external environments stay pending.


Turn24 task completion: controller job `job-d3a8fbc36d` passes N99/99 and the supplemental retained-timeout census; strict source/tests and1733 guards pass,51/51 unique N children reaped and PG removed. f04-12 is DONE,12/15 tasks complete. Next controller assignment is plan_review for the changed supplemental-check plan digest; do not infer a new review verdict from prior history. After that gate, f04-13–15 remain in their original dependency order. Complete raw results/hashes, failures, bounded local coverage and external limitations are indexed in the acceptance document.

## f04-13 local operator entry point

The bounded operator entry point is `g1-model/src/operator.ts::operatorCommand`. It takes an installed trusted-parent IPC port and a closed command body. Each service command obtains a fresh synthetic F02 authenticated scope. The service composes the same native SessionLoop, current identity, PG reservation owner and independent deterministic receipt adapter used by the preceding slices. No operator command accepts actor/payer/team tags, credentials, a destination URL, SQL, a measured receipt or an approval flag. There is no new HTTP operator carrier or GUI.

Run all six fixed local journeys from the repository root:

```sh
node g1-model/scripts/operator.mjs local-journeys
```

This strictly builds the source/tests, starts the owned synthetic PG/IdP/receipt fixture, executes J01–J06, prints readable next actions plus redacted durable operator details, and proves cleanup. It is equivalent to the controller task command `node g1-model/scripts/check-slice.mjs operator-journeys`; neither command can select optional cases or enable paid transport. `qualify {}` explicitly probes the installed deterministic adapter. Restart/inspect/replay/reconcile do not probe or infer submission permission.

| Journey | Fixed commands and input | Durable fields and required outcome |
| --- | --- | --- |
| J01 Ask and cost owner | `qualify`, `operatorPreflight` with `Explain local cost ownership`, `requestTurn`, `operatorInspect` | Auto/full actual profile, modality/data policy/cost class, payer/cost center/purpose/allowance before I/O, planned estimate, held reserve before acceptance, measured/settled model+service cost after actual receipt; zero computer assignments/starts |
| J02 capability and pin | Saved Ask; unavailable equivalent pin; unsupported image need; denied switches; current explicit permitted `switchProfile`, `resume`, next turn | Model-unavailable reason/refusal/resolver/next action and preserved work; exact pin until fallback permission; safe capsule revalidation/cache-loss estimate; explicit resume and actual approved equivalent; denied controls have zero dispatch |
| J03 shared capacity | Concurrent `requestTurn` with `compete` from independent authenticated service processes, inspect both; losing retry and forged payer/team | One admitted call, losing budget wait, original parent/child attribution, shared parent allowance and person aggregate counted once, balance equal to PG; forged owner/losing retry refuse without acceptance |
| J04 retry and unknown | Known failure with `recover original answer`, explicit `retryTurn`, lost acknowledgement/manual usage; SIGKILL/recreate; `replay`, original `reconcile` | Two distinct attempt/reservation identities and one logical operation; retry count1; unknown held reserve/resolver/do-not-replay; original owner lookup after restart; one settlement per original reservation, zero recovery acceptances |
| J05 saved wait and approval | `save committed work`; budget wait; ordinary top-up denied; authorized synthetic `topUp` separately; restart and `resume` limit8; `short`; saved approval work and12 inspection/replay polls | Prior work/result retained; original sibling unknown reserve remains held; current allowance revisions checked; no payment and no automatic dispatch; widened input refuses; approval resolver and twelve polls with zero model turns |
| J06 computer and lifecycle | Preparing simulated computer, explicit resume, contested assignment; actual service model usage; `resourceRecord`, `resourceInspect`, `stop`, `resourceLifecycle`, owner-confirmed simulated suspension | Visible preflight/cost categories/single assignment; readable contention wait; archive/Stop/request-suspend preserve liabilities; half-open resource intervals billed once to owning Space; two Task references show unallocated shared cost; storage/network continue after confirmed simulated suspend; original usage recovery without replay |

`operatorInspect` derives attempt/retry counts, original reservation estimates, held reserves, measured and settled amounts, category totals and the current Task's allowance ancestry from scoped durable records. `operatorPreflight` compiles and authorizes the exact bounded input with zero model I/O; its estimate is informational, and atomic admission rechecks current state. Shared cross-Space account balances are not exported by this entry point. Cost views exclude raw model output, context/source content, private reasoning, credentials and transport configuration.

Process deadlines and observed barrier bounds protect this deterministic test harness only. They are not latency, throughput, warm acknowledgement, state propagation, Stop, cold-start, invoice or supplier quality benchmarks. E05 remains off/unqualified, as do E01 supplier/comparable-task, E02 real gateway/billing/top-up, E03 real no-VM/compute/storage, and E04 external product/human/device environments. Task execution evidence is recorded separately in the acceptance index; a local driver pass does not establish those external gates.


The operator view uses forward-only `0011_operator_views.sql`, whose scoped read
function checks current authenticated Task-read authority, original session and
payer, and exports only that session's accounting and allowance ancestry. It
preserves all prior SQL bytes and base no-direct-table grants, bounds integer
totals and deduplicates recursive ancestry. Model wait controls now expose
`resume` only after a successful current qualified switch; the separate resume
rechecks intent, current capsule, eligibility, approval/resource and budget.
Unknown original reconciliation records completion/settlement and clears the
pending operation without inventing a model-result event or automatically
publishing output. Actual Ask completion and safe subsequent turns still use
normal native current-audience output publication. Approval state comes from
the installed synthetic owner channel; it is not an operator-supplied flag or
an edit to immutable admission.

## f04-14 current authority and safe event delivery

A01–A06 use actual synthetic F02 login/scopes, nonprivileged PostgreSQL roles,
native composition and separate deterministic receipt owner processes. Current
Space task readers may inspect redacted status; another Task's controls still
require its owner. Shared payer/person-account use never expands source or
Space audiences. Closed IPC/adapter requests reject billing tags, copied scope
assertions, foreign bindings, external destinations and synthetic key/config
attempts. The operator carrier is trusted parent IPC; the adapter has its own
bounded loopback HTTP negative/positive matrix.

Native resume and profile switch repeat full source/capsule/current installed
authority checks after awaited sensitive writes before commit. Model admission,
claim and dispatch also reread the installed current approval/resource owner.
Real row/advisory lock graphs, token and persisted IdP session expiry, committed
authority revision changes, required authority failure and actual audit INSERT
faults must preserve original work/liability and roll back sensitive mutation.
An authorized transaction can precede a revocation blocked behind its authority
locks; subsequent calls refuse after that revocation commits. Expiry while
awaiting a lock/receipt fails before commit/return. A new genuine issued session
can recover an original receipt after session expiry, without new inference.

Budget top-up remains a current budget administration operation. It cannot
resume or authorize inference/disclosure from unavailable source/resource
authority. The resource quarantine fixture is a private PG-backed synthetic
owner installed through the shipped composition; real remote quarantine and
isolation remain F06/E03. Revoked member/payer accounting retains original
owner usage/reserve for authorized recovery; no revoked principal is revived.

The additive read-only `src/model-event-consumer.ts` binds an outbox/audit/receipt
to the current authorized session and its original attempts, validates
contiguous correlated events and excludes native payloads/private content.
Duplicate delivery reauthorizes. Its display deduplication is process-local and
restart may redeliver; durable billing/dispatch idempotency is owned by the
existing ledger, not this projection. Events and diagnostic logs grant nothing.
These development tests and their evidence do not replace independent security
review, final acceptance, product judgment or E01–E05 qualification.


## f04-15 qualification and evidence delivery

The fixed Q01–Q09 suite exercises the shipped strict build, mandatory suite-file and bounded subprocess/TAP seams in owned disposable copies, preserving all accepted inputs. It removes each suite and each of65 case IDs, refuses empty/label-only/failure/skip/TODO/contradictory output and unknown arguments, and ensures stale emission cannot hide source or test compilation errors. There is no recursive qualification invocation. Real locked additive migration install/repeat/rollback/digest conflict preserves foundation1/2, identity3 and loaded recovery4–10. Actual runtime inventory and original unknown usage remain subject to current owned cleanup and native accounting.

[g1-model/OPERATIONS.md](../../g1-model/OPERATIONS.md) provides dependency/update/recovery/rollback procedures. [100-row qualification matrix](../../g1-model/verification/qualification-matrix.json) retains the exact reviewed requirement-to-case and additional judgment/environment obligations. Artifact truthfulness uses `node g1-model/scripts/check-evidence.mjs local`; it permits explicit pending workflow gates. `controller-behavior` requires actual complete full-model and three unchanged controller regression outputs on one candidate. Synthetic finding and receipt specimens are labeled test data and never recorded as actual independent verdicts.

Executable candidate snapshots cover source, tests, scripts, SQL, licenses, locks, preservation/traceability and operation instructions. Complete raw controller streams, including failures, are copied byte-for-byte under `g1-model/evidence/raw/` with original paths/bytes/SHA256. Evidence snapshots disclose document/index edits after behavior runs; integrated task and final checks rerun after those edits. Frozen historic snapshots and cumulative controller usage remain retained. Independent security/code/evidence/action/license/scope and product judgments belong to later controller stages; no author signs them. E01–E05 remain pending and OFF as specified above.


## Turn29 qualification delivery checkpoint

The implementation and fixed C/P/B/U/N/A/Q/J suites are complete for the deterministic local route. Fresh controller `job-85f223bc7a` passes the full2386-assertion/65-case aggregate and all three unchanged identity/foundation/G0-G1-local regressions on one candidate. The100-row qualification matrix remains exact, and1733 preserved inputs are unchanged. Complete raw copies, candidate/environment/profile/check/lock bindings, cleanup, prior failures and usage are indexed in the acceptance evidence; its pre-index snapshot discloses subsequent documentation/index edits. No executable candidate inputs changed in this turn.

f04-15 remains active until the controller reruns its six mandatory checks on the updated integrated delivery. After development, obtain the controller's independent security/code/evidence/action/license/scope reviews, final acceptance and product judgment. The existing dependency inventory's missing installed notices and unknown vulnerability/image/runtime legal assessment remain visible for those reviews. Accepted desktop/Android regressions do not replace new GUI/physical-device qualification. E01–E05 remain pending/unqualified; supplier/region/billing/paid enablement and remote release retain their separate decision and approval boundaries.

## Turn31 security repair — SEC-F04-001

The confirmed AF-06 boundary defect is repaired additively by forward model12;
model1–11 SQL, all accepted increments and raw history remain unchanged. The
trusted installer stamps immutable parent Run lineage, rejects ambiguous or
invalid ancestry, and requires unique Task/Run allowance subjects. Each child
atomically reserves the union of its own and all inherited family allowances
and aggregate accounts. Settlement, unknown recovery and deficit accounting
retain that original membership. The operator allowance view includes inherited
limits. A missing model12 schema cannot run the current repository against the
old child-only reserve.

B01 retains every existing fixture and adds tight-parent Task and Run boundaries,
parent-own20 plus three child40 independent-process contention in both orders,
a grandchild, exact membership/conservation, durable refusal after caller
recreation, original owner loss/restart, once-only measured settlement and real
native budget wait with zero adapter I/O. These cases keep Space/aggregate and
individual child ceilings ample. Q03 adds actual model12 rollback, uncharged
parent backfill, original-source/digest refusal and fail-closed legacy child
liability upgrade tests. Existing registered eight-suite/65-case commands and the
100-row traceability remain intact. The pre-repair controller failing result is
retained to prove the new boundaries detect the defect. Fresh aggregate,
unchanged regressions and independent security review are required afterwards.

Ambiguous multi-Run parent selection and remediation of historical child
charges lacking parent attribution require separate trusted contracts and
explicit decisions. Real providers, gateway/invoices and real resources remain
unqualified E01–E05; this repair spends nothing and deploys nowhere.


## Turn34 — code-review recovery corrections

CODE-F04-001: ModelService installs its composition-owned immutable receipt owner
in ModelRepository.prepare's borrowed transaction, before the initial durable
pending prefix/command receipt COMMIT. U04 removes its test-side owner-install
workaround. Added native PG lost-prepare-COMMIT-ACK and process kill after the
actual COMMIT/before preparation returns, changed-PID replay with zero I/O, and
explicit authenticated first dispatch/once settlement of the server-resolved
original operation. Native `dispatchPrepared({sessionId,operationId})` accepts no
request, profile, owner, receipt or attribution overrides; existing fresh claim
and one-use permit enforce current authority and concurrent once-only admission.
Prepared original work is never dispatched by restore or duplicate requestTurn.

CODE-F04-002: NativeContext validates the immutable previous capsule's full
profile/manifest/binding integrity and current source/audience/Task/Run/payer/
policy/membership/fence/version authority through a separate historical binding
port. The old invocation's availability is irrelevant to preserved facts. The
selected next profile still passes complete current qualification, capabilities
and data-policy checks. P07 adds completed-A/unavailable-A/available-B explicit
switch, current user-equivalent and current policy-equivalent continuations,
with exact fact/source/version/old-charge preservation and private-cache loss.
All existing authority, data-policy, version, pending-work and capability negative
cases remain mandatory. Real provider/gateway/runtime/product/performance gates
E01, E02, E03, E04 and E05 remain pending and unqualified. These repairs do not
modify accepted/protected checks or model1–12 migration bytes.

## Turn36 — SEC-F04-002 operator recovery wiring

The shipped bounded `operatorCommand` now admits `dispatchPrepared` with only
`{sessionId, operationId}`. The authenticated native service still resolves the
original request, owner and reservation server-side, checks current authority and
uses the existing fresh claim/one-use permit. No new caller-supplied identity,
request, receipt, owner or payer path is introduced.

U04 now exercises actual lost-prepare-COMMIT-ACK and post-COMMIT caller death
through the operator entry point after native-process recreation. Replay and
duplicate requestTurn remain zero-I/O; reconciliation alone retains the unknown
prepared liability. Missing/malformed fields and owner/receipt/request/actor/payer
overrides refuse before any carrier invocation. Foreign authority, mismatched
operation, two separately qualified process contenders and a consumed original
have exact refusal assertions. One first acceptance uses the unchanged original
request, settles once and clears pending state/reserve; resume remains explicit.

Before the branch repair, controller `job-6213766fdb` strictly built and executed
U113:110 pass/3 fail (the two operator recovery variants plus their U04 parent),
zero cancelled/skip/TODO. Both variants fail specifically with
`REQUIRED_CAPABILITY_UNSUPPORTED` at `operatorCommand`. Full stdout138908 bytes
SHA256 `c0a50c53180f811fb732e0c7675e61db18442fed1ba73c140bfad21aeccaf11b`;
stderr1276 bytes SHA256
`adf4e3c86ae7343a277b5990945ee981cb4a12ecdf1d03be65e7af1c0ee42bc2`.
This failed observation is retained as the regression's defect reproduction.
Repaired full-model and retained controller checks, independent reviews, final
and product acceptance remain pending until the controller supplies them.

Accepted/protected checks and model1–12 migration bytes remain unchanged. E01
supplier/comparable tasks, E02 gateway/billing, E03 actual runtime/resources, E04
product/human/device, and E05 performance/SLA/economics remain unqualified. Paid
model calls, new resources, remote deployment and messages to people remain off.

Repaired targeted controller `job-c296ce209d` passes U113/113 with zero failed,
cancelled, skipped or TODO nodes. Complete stdout143596 bytes SHA256
`f7608e5cc4a3fa9cd25987ee86a11bd28bd12e5919d9af252017eb6119756b0d`; stderr0 bytes.
All394 reported process/PG cleanup records have removed=true (including repeated
owned-child cleanup confirmations). This targeted diagnostic proves the operator
repair; full integrated/current retained and independent gates remain separate.

Fresh integrated controller `job-08ec7f0013`, fingerprint
`git:6df9ac265ed56e3c8ad377ce`, passes all four registered behavior commands
on executable candidate
`319fb4b8e2a670ffee274493c7ea748104428fc5378b4069617f46d1aa54b3bb`.
Independent complete-stream parsing confirms C1646/P226/B148/U113/N99/A111/Q48/J15
=2406 executed test nodes and all65 mandatory identities, zero fail/cancel/skip/TODO.
Full model stdout899253 bytes SHA256
`94dfd17e06aefc35b849781d923ce586deffdcc594305bbefad4043813b36faf`; stderr0.
All856 process-cleanup and7 PG-cleanup records have removed=true. All144 executable
inputs match the current candidate. Identity35, foundation17 and retained original
197+48+5+9+10 pass on that same fingerprint, including actual pinned Electron and
Android Metro bundle. The unchanged foundation's specifically approved read-only
SSH inventory ran; its runtime/product qualification flags remain false.

Complete immutable raw streams, hashes and historical failures are indexed under
`g1-model/evidence/streams.json`. This evidence/doc update occurs after the observed
behavior job, changes no executable inputs, and is disclosed in the collector's
delivery snapshot. Controller re-verification and fresh independent/security/code/
final/product judgments remain pending. These local command passes do not qualify
E01–E05 or grant real-provider access, billing reconciliation, runtime containment,
product acceptance, performance clearance, deployment or paid enablement.

## Turn39 — CODE-F04-003 prepared Stop recovery repair

Add forward model13 for permanent original-owner nonacceptance of an unclaimed
preparation, preserving model1–12 bytes and original budget membership. Qualified
local tests must reproduce acknowledged prepare, lost PG prepare ACK and SIGKILL
after COMMIT followed by native Stop before claim. Prove one release across child,
parent and aggregate limits, zero accept calls/claims, duplicate/restart immutability,
rollback, invalid proof/current authority refusals, actual seal/claim PG contention
in both lock orders, and authenticated operator recovery with Stop still effective.
Q03 must upgrade actual installed model3 with original committed liability and
prove rollback, forward apply, repeat, pinned-byte refusal and no history rewrite.
The deterministic route remains the only qualification route; external E01–E05
and the controller's independent review/final acceptance gates remain pending.

## Turn42 — CODE-F04-004 admission refusal recovery

Native pending state must have a durable original even when a complete encoded
request is refused before preparation commits. Serialize a fresh absence check
and permanent refusal receipt with the same tenant/Space/actor/original key as
preparation. Preserve committed or uncertain liabilities, and fence later
preparation of the refused key/attempt/reservation. Do not infer non-dispatch from
an exception or an unlocked absent row. Forward model14 adds immutable scoped
refusal history and a narrow reservation-absence predicate; model1–13 SQL,
foundation grants, RLS, original receipts and budget membership remain unchanged.

P05 proves actual PostgreSQL post-encode fallback revocation, zero preparation/
reservation/claim/accept, resolved native pending, accurate wait, service restart,
explicit qualified switch/resume/new turn, preparation-stage and refusal-write
rollbacks, post-refusal checkpoint rollback/reconciliation, both observed PG lock
orders, timeout conservatism, permanent replay refusal, and a refused retry that
preserves original charges and attempt count. U04 must still preserve original
unknown usage/reserve after lost real prepare COMMIT ACK or process death. Q03
must prove actual original native schema → model14 rollback/forward/idempotence
with old definitions/grants and migration bytes intact. The chronological request
capture helper sorts native turn then ordinal, avoiding unspecified SQL tie order.
E01–E05 remain unqualified; no real-provider access, spend or deployment is enabled.
# Turn47 product repair — proposed-choice preview

PROD-F04-001 is confirmed. The old preflight selected and encoded a proposed
choice but returned saved-choice presentation. Repair `operatorPreflight` to
return explicit `proposed` selection/next action and `estimateBasis`, with saved
work/choice, current waits and ledger balances under `historical`. Selected
previews identify exact profile/digest, model/version/deployment/route/region,
modality, data policy, cost class and fallback; refused previews show reason,
refusal and allowed actions without an estimate. Preview never mutates choice,
acceptance or ledger state; real admission remains a separate current command.

J02 retains all existing assertions and adds authenticated native-service/local
PG cases for available B against saved Auto A, unavailable pin, ineligible pin
despite fallback permission, permitted equivalent fallback, unsupported image
capability and null-choice behavior. Compare each estimate with independent
full-profile encoded-byte arithmetic and verify full native/ledger snapshots,
adapter counters and zero computer/effect calls remain unchanged. The same
mandatory aggregate and retained checks must pass through the controller.
E01–E05 remain pending; no real provider, credential, spend or deployment follows.

## Turn53 code repair — installed qualified channels

CODE-F04-001 is confirmed. The shipped service qualified configured alternatives
but installed only the default dispatch channel and exposed only `select`.
Snapshot all configured profile/adapter channels in `composeNative`, use the same
clients for qualification, and reject duplicate profile/owner or route/digest
bindings. Preserve the registry's `selectEquivalent` method. Equivalent retry
requires an explicit trusted approved pair, user fallback permission, original
safe-failure evidence and the existing retry ceiling. Original-owner recovery
retains installed unavailable channels without admitting new work.

Extend mandatory J02 through the shipped authenticated operator process, without
replacing ModelService: dispatch the available second pin; explicitly switch
saved work to it and submit another turn; refuse missing user or installed policy
permission; permit an approved equivalent retry; lose its ACK/hold usage;
restart both service and secondary adapter; contend on original reconciliation;
assert exact downstream profile/capsule/owner, original payer, immutable attempt
identity, once-only settlement, preserved first receipt, no replay and no extra
charges. Reject ambiguous installation before I/O. Preserve the recorded retry
fallback reason after restart using durable adjacent attempt records.

All approved 65 top-level cases, 100 requirement mappings, build pins, original
acceptance definitions and 1733 protected inputs remain unchanged. Run unchanged
aggregate and retained commands through the controller after the mutation
experiments are restored. E01–E05 still require external environments and separate
supplier, credential, billing, spend and deployment decisions.

## Turn56 code repair — bind equivalent retry to current selection

The multi-destination retry finding is confirmed. `selectEquivalent` previously
walked the approved-pair list independently of current selection; A->B before
A->C replaced an explicit qualified C pin with B. Current exact-digest authority
correctly refused that substituted request, preventing a permitted C retry.
Resolve the current selection using the same need, version pins, time and choice,
then validate the original safe-failure evidence, approved pair, semantic
equivalence and trusted current fallback permission against that selected target.
Pair order supplies no authority to change the target. Native current-authority
rechecks, original accounting identity and the existing maximum3 attempts remain.

Extend mandatory authenticated shipped-service J02 with three qualified available
equivalent deployments and distinct receipt owners. Both A->B/A->C pair orders
must honor explicit C plus user fallback permission after a charged safe A failure:
actually dispatch ordinal2 to C, capture its exact profile/capsule/owner, retain
the original operation/payer/allowance, settle both receipts once, clear reserve,
and make duplicate commands add no I/O or charge. Selecting unapproved C while
B is approved must wait without dispatching B. Direct selector fixtures now name
the intended replacement and retain all denial assertions; an available selected
A also cannot be silently replaced with B. A failed routing test clears its unused
fixture gates by restarting its owned adapter, retaining durable usage so the
next pair-order case remains independently executable.

Retain original failing and restored-selector mutation streams, then run the
unchanged aggregate and identity/foundation/original commands through the
controller. No accepted check, protected input, migration, matrix mapping or raw
history changes. E01 provider/conformance/comparable tasks, E02 actual gateway
billing, E03 real runtime/no-VM/cold-start/storage, E04 broader product qualification
and E05 real performance/economics remain pending and unqualified; real provider
calls, credentials, spend, deployments and human messages remain OFF.
