# G1-F04 test design: model profiles and FinOps

Date: 2026-10-07. Stage: test_design. Role: test designer. **Status: planned tests, not executed product acceptance.** This stage creates only this document. The package, suites, fixtures, operator entry point and delivery validators below are implementation tasks for the following plan/develop stages.

## 1. Scope, sources and proof rules

The reviewed inventory has 100 unique requirements (96 Must, 3 Should, 1 Could), including the corrected AF-02-07 Auto default. This design preserves its text and priorities. It proves local behavior for AF-02, AF-06 and AF-18 and the supporting UX-11 journey. It does not close those ledger rows' external qualification.

Read inputs: [product brief](product-brief.md), [solution](solution.md), full controller requirements with `verify` and sources, [roadmap](../../planning/roadmap.md), [foundations plan](../../planning/g1-foundations-plan.md), [remaining ledger](../../planning/g1-remaining-ledger.csv), [master v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md) §§2,7–12,17,22,25–32, and [F02 acceptance](../../evidence/g1-f02-acceptance.md). Existing framework references inspected: identity checker/build/tsconfig and approval/audience PostgreSQL cases; foundation contracts and PG fixture; recovery process/PG fixtures and unknown-effects tests; solution's unchanged native SessionLoop, scope, original-key and fence contracts.

Use Node's `node:test` and `node:assert/strict`, ESM/strict TypeScript with source **and tests** compiled. Real integration uses owned cached PostgreSQL, actual F02 synthetic IdP/session authority, nonprivileged service roles, native SessionLoop composition, and a separately running restricted deterministic adapter receipt owner. Never replace required PG/process behavior with a Map, mock-only answer or alternate acceptance harness. No new UI is required. HTTP-carrier-specific tests apply only if that carrier is shipped; trusted-service and actual adapter boundaries are mandatory regardless.

A case fails when its expected behavior differs, regardless of a printed label. Assertions inspect public observable responses, independently committed PG state and downstream accepted-request/usage receipts, not just implementation return values. Counter deltas are taken per original operation and suite. Require zero denied accepted calls, recovery-caused duplicate chargeable executions, duplicate settlements, foreign disclosures and forged cost-owner assignments. Nonzero valid authorized dispatch/settlement counterparts are essential to avoid vacuous zero-counter passes.

Only controller-run checks count as acceptance. This document's coverage audit is a documentation check, not a behavioral result. Independent security/code/release and product/human judgment are not fabricated or replaced by an artifact validator. Missing capability/dependency/environment is a failure or explicitly pending external qualification, never an acceptance-suite skip.

## 2. Suite commands and levels

Every local case below is mandatory under `node g1-model/scripts/check.mjs` (command to be created). Optional R-032 is tested as a scope guard even if no extra fixture is built. The aggregate command builds and executes all eight nonempty suites, rejects failures/skips/TODO and unknown arguments, and validates exact required case identities. Parameter variants are named subtests with nonempty data tables; no conditional skip or disappearing branch. A case ID maps to at least one assertion-backed `node:test` test and all enumerated local variants. Q04–Q09 also contain post-run independent/controller obligations; their local test IDs cover executable guards and artifact truthfulness, while the later audit/controller runs remain separate mandatory gates, not fabricated tests or suite skips.

A diagnostic runner `g1-model/scripts/check-slice.mjs` is to be created using the same frozen install/build/fixture/result guards and suite manifests, without declaring overall acceptance. It accepts only the following closed suite IDs. The aggregate checker must not delegate a partial suite run as full acceptance. Build command to create: `node g1-model/scripts/build.mjs`.

| Suite | Mandatory test file (to create) | Per-suite command (to create) | Levels assigned below |
| --- | --- | --- | --- |
| C | `tests/contracts.test.ts` | `node g1-model/scripts/check-slice.mjs contracts` | unit |
| P | `tests/profile-context.test.ts` | `node g1-model/scripts/check-slice.mjs profile-context` | integration, security |
| B | `tests/budget-concurrency.test.ts` | `node g1-model/scripts/check-slice.mjs budget-concurrency` | integration, security |
| U | `tests/retry-usage-recovery.test.ts` | `node g1-model/scripts/check-slice.mjs retry-usage-recovery` | integration, security |
| N | `tests/native-wait-resource.test.ts` | `node g1-model/scripts/check-slice.mjs native-wait-resource` | integration, security |
| A | `tests/authority-output.test.ts` | `node g1-model/scripts/check-slice.mjs authority-output` | security |
| Q | `tests/qualification.test.ts` | `node g1-model/scripts/check-slice.mjs qualification` | integration, security; specified reviewer audits additionally required |
| J | `tests/operator-journeys.test.ts` | `node g1-model/scripts/check-slice.mjs operator-journeys` | e2e through local documented entry point |

Keep registered acceptance checks exactly as approved:

| Controller ID | Existing or requested exact command | Proof |
| --- | --- | --- |
| `acceptance.g1-model-behavior` | `node g1-model/scripts/check.mjs` (to create) | all local F04 suites, strict build, mandatory fixtures and guards |
| `acceptance.identity-behavior` | `node g1-identity/scripts/check.mjs` (unchanged) | F02 regression |
| `acceptance.foundation-behavior` | `node g1-foundations/scripts/check.mjs` (unchanged) | foundation regression |
| `acceptance.retained-baselines` | `node g1-foundations/scripts/check-retained.mjs` (unchanged) | G0/G1-local checks, GUI/protected/raw baseline |

Q09's suite is controller regression: run these existing commands via `loop_check(ids=[...])`, then poll returned job IDs and inspect completed results. GUI/Electron probes run outside the Codex sandbox in the controller. Do not directly launch them in the sandbox or substitute a historical pass. Planner may add fast slice task checks but must preserve all four final acceptance definitions. Existing accepted F03 inputs/fences are preserved; an extra F03 regression is appropriate only if the eventual additive integration scope calls for it, not permission to rewrite its checks.

## 3. Fixture/data inventory to build

Fixture identifiers below define concrete data requirements; each case specifies its subset. Each integration case uses fresh authoritative objects and monotonic revisions. Do not reset accepted immutability or revision triggers to make a negative case work; use a separate fixture state instead. Actual admin/migration credentials are scoped only to owner-marked reproducible PG, never shared infrastructure.

| Fixture | Required contents and ownership |
| --- | --- |
| F-I identity and scopes | Actual synthetic test IdP/OIDC session, authenticated UoW/current lookup; 2 tenants, at least 2 Spaces in one tenant sharing billing person/team with different content, another foreign tenant; actor/task operator/budget-control administrator/ordinary reader/payer. Valid, revoked, expired, removed-membership, changed policy/audience/Space lifecycle variants; late authority locks; separately bounded authority read pool. Issued immutable VerifiedScope only. Separate fixture admin, service, receipt-owner, IdP, worker and client roles; no real credentials. |
| F-P profiles | Complete text P-A default and P-B explicit pin/equivalent, non-equivalent P-C, independent deployment equivalents, busy/missing/revoked/expired/untested profiles. Full operating components/digests; capabilities include supported text/local JSON dialect/chunks/synthetic-byte limits/cancellation+lookup/private cache, and explicit unsupported image/audio/arbitrary dialect/exact+semantic response caches/embedding-reranking execution. Installed approval/equivalence/preference rules and pricing version `2 service + encoded input bytes + output cap` conservative reservation. |
| F-C context | Typed approved instructions/goals/requirements/evidence/source manifests with source IDs/revisions/digests, scope/audience/provenance/time/trust; full safe capsule with uncertainty/hypotheses/failed plans/pending operations/artifacts/checks/next action. Unique hostile/source/private-state/secret sentinels. Instrument eligibility, retrieval, encode and disclosure separately. No actual secrets. |
| F-B ledger | Existing allowance/reservation/settlement tables plus additive metadata/account/deficit bindings. Parent100 and two children40 (actual request reserve2 service+8 validated input bytes+30 output-cap bytes); common person60 with Space100; each hierarchy/account limiting independently; depth64/65/cycle/foreign-payer graphs; numeric boundary vectors; operation/key/revision variants; independent observer and actual SQL trigger faults after partial writes. Normal and overrun arithmetic snapshots. |
| F-D downstream adapter | Independent loopback-only process with restricted durable acceptance/usage/seal journal in owned PG, original owner/operation/attempt/reservation/digest/epoch. Captured actual requests, feature probes, stream/chunk schedules, distinct `accept`, accepted-inference, lookup, cancel, seal and usage counters. Separate transactions from native ledger; no controller/session credentials. Explicit barriers for pre-accept, owner commit, lost ack, usage, chunk and lookup. Owner outage and tombstone/seal schedules. |
| F-U faults/recovery | Pre-accept sealed failure, known charged failure, delayed/missing usage, acceptance-ack loss, typed lost real COMMIT at prepare/claim/settle, rollback at verified partial-write stages, post-accept timeout/cancel without termination proof, forged/conflicting receipts, overrun R20/M23 and conformance-bound violation M26. Max3 total attempts; retry requester labels share one durable counter. |
| F-N native lifecycle | Actual unchanged SessionLoop/reducers with additive durable owner/history ports, original Task/Run/session, intent/capability/target/version/generation pins, saved checkpoint and work, model/effect pending gates. Wait reasons budget/model/approval/resource/permission/connection with resolver/since/update/expiry/next action. Instrumented LOCAL test effect/provision/wake/enroll ports with no real shell/computer. Strict single-assignment and Stop race barriers. |
| F-R resources | Trusted synthetic receipts for model/service/active compute/reserved compute/cold-start/storage/network; resource/Space owner/generation/rate-policy version and half-open intervals; active/reserved-until-confirmed-suspended/unknown suspend/storage-retention policy. Duplicate/adjacent/overlap/conflict/policy-split vectors. Initial per-task allocation explicitly unallocated-shared-cost, Space resource allowance distinct from task-caused Run cost. |
| F-X processes | Owned native caller/service, adapter and IdP processes with marker, actual PID/start-instance/census and ready/crash gates; same persisted owned PG across SIGKILL/restart. Validate changed PIDs and unchanged DB/journal identity; reaping/closed listeners/container cleanup. Never signal historical PID/group without current ownership proof. |
| F-V versions/build | Node22.22.3, pnpm10.18.0, TS5.9.3, Node types22.18.6, pg8.16.3/types8.15.5 and independent lock; cached PG image `postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333`. Candidate/source/check/lock/environment/profile digests, qualification tested/expiry clocks, new migration digests, accepted protected/raw baseline manifest, dependency/license/notice/security/update owner metadata. No automatic image/download/provider fetch. |
| F-H harness/evidence negatives | Owned fresh copies ONLY of the new package/evidence for checker sabotage, empty/failing/skipped/TODO suites, missing IDs/build/type faults, contradictory/forged TAP, changed NEW migration/version/evidence digests, fake external pass or high-severity finding. Do not mutate accepted inputs or controller state. Meta-test child runs use a bounded nonrecursive probe seam and actual checker entry/parser shared with aggregate acceptance. |
| F-J six journeys | Deterministic documented entry points with exact inputs and golden field obligations: Ask/preflight, capability/pin wait/switch, contested allowance, retry/unknown/recovery, budget-control/resume/approval wait and simulated computer/resource lifecycle. Run as actual native service composition, not screenshots or prewritten JSON. |

## 4. Concurrency, crash and accounting oracle protocol

Integration is sequential across isolated suites by default; required contention is inside a case with independent processes/connections. Use explicit gate readiness, actual PG `wait_event_type='Lock'` plus `pg_blocking_pids` and observer visibility, not elapsed sleep or `Promise.all` alone. Reverse lock/race order where stated. Keep locks bounded and authority read pool separate; harness timeout fails or yields typed product wait/unknown, never fallback success. Deadlines are test safety bounds, not performance SLAs. Pure clock schedules are injected; actual PG expiry is proved using `clock_timestamp()` before releasing held locks.

For each crash point, snapshot original key/operation/attempt/reservation/claim/generation, prove reached gate and durable state with independent observer, kill ONLY owned native PID, verify exit/reap and restart with new PID against same data. Recreate receipt owner too for explicit durable-owner cases. Set counter baselines before replay and assert `accept` as well as accepted-inference deltas: adapter dedup must not hide a forbidden replay attempt. Lookup-only recovery may increment lookup but not accept/model/effect/provision. Native pending fences must be checked through real model/effect continuation entry points.

Normal account conservation is `ceiling = available + reserved + baseSettled` at every acknowledged transition, applied once to each account/ancestor, not summing ancestor subtotals as economic costs. For measured M>R, immutable receipt M and unique deficit M-R are mandatory: economic settled = baseSettled + uncovered deficit; covered deficit transfers exactly once into base accounting with preserved covering history. Category totals equal actual economic usage. Freeze affected-account admission until authorized cover/current limits pass. Unknown/in-flight reserve remains held. Synthetic bound is +5 per accepted pending attempt; an out-of-bound owner response fails conformance yet retains actual cost. Do not weaken accepted base-table guards or claim invoice caps.

Required race/crash schedules and minimum parameter variants are fixed by U03/U04/U06/U07/U08/N06/A02/A03/A04 and B01/B02/B03/B09. Development may add cases but cannot omit a described variant to pass. Every negative has a fresh valid counterpart; every boundary has exact-limit and just-outside cases. Require8 nonempty suites and every case ID in the manifest, not a brittle total assertion count. Reporter records subtest identities and counts so omitted variant tables are detectable.

## 5. Cases

All cases inherit the owned deterministic fixture setup, current authenticated native boundaries, no paid/external action, fail-on-cleanup-error and before/after preserved hashes. Preconditions below add to that baseline. A security level means a behavioral boundary test, usually actual PG/adapter integration, not a new security implementation stage.

### C01 — suite C, unit

- Requirements: AF-02-01, AF-02-02, AF-02-17, R-025.
- Environment: Local deterministic.
- Preconditions: F-P complete profiles, F-V pinned versions and a fixed clock; no database writes.
- Steps: Decode a complete profile, capability and qualification; independently remove each mandatory field and alter each bound digest. Decode every operation, attempt, manifest, receipt, event, wait and resource schema. Try unknown fields, wrong versions, null/arrays, accessors, prototype keys, non-JSON values, excessive strings/arrays and invalid relationships.
- Expected result: Only complete closed contracts decode. Every required component is retained; incompatible versions and mismatched qualifications refuse. Accessor code never runs. A profile cannot qualify itself. Version identities survive round-trip with no silent defaults that erase required semantics.
- Data: F-P, F-V; one explicit parameter row per mandatory field and decoder, with invalid-value reason.

### C02 — suite C, unit

- Requirements: AF-06-26, AF-06-17, AF-18-11.
- Environment: Local deterministic.
- Preconditions: Pure arithmetic, pricing, ancestry and allocation helpers, F-B/F-R.
- Steps: Exercise 0, 1, MAX_SAFE_INTEGER, exact cap, cap+1, empty input and multibyte UTF-8; calculate safe and overflowing sums/products. Try negative, fractional, NaN, infinity, numeric strings, unsafe revisions and amounts. Walk acyclic ancestry at 64 levels and reject 65, cycles, foreign payer/Space. Sum explicit task allocations and unallocated shared costs.
- Expected result: Valid boundary arithmetic is exact; invalid/overflowing arithmetic and malformed ancestry refuse before mutation. Unit is synthetic encoded UTF-8 bytes, not tokens. Allocated plus unallocated equals the single Space charge; references are not allocations.
- Data: F-B numeric/ancestor vectors, F-P pricing, F-R allocation vectors.

### C03 — suite C, unit

- Requirements: AF-02-13, AF-06-09, AF-18-02, R-020, R-021.
- Environment: Local deterministic.
- Preconditions: Unchanged native reducers and F-C typed capsule/history; no adapter ports attached.
- Steps: Compact hostile observations alongside uncertainty, failed plans, pending external operations, verification state and artifacts. Reduce known safe failure, accepted/in-flight, unknown and settled events. Classify admitted conversation, computer and target-aware effect capabilities; attempt mode changes using model/tool names and fabricated projection events.
- Expected result: All unresolved facts remain typed evidence with trust/provenance. Hostile text creates no instructions, grants, allowance or approval. Distinct outcomes remain distinct; classification derives from admitted capabilities/target. Derived views and summaries cannot grant work.
- Data: F-C hostile markers and complete capsule, F-U state vectors, F-N intent vectors.

### P01 — suite P, integration

- Requirements: AF-02, AF-02-01, AF-02-02, AF-02-17.
- Environment: Local deterministic.
- Preconditions: Owned PG/F-I, actual independent F-D adapter process, approved text profile P-A and qualification not expired.
- Steps: Run conformance against actual encoder/transport: text, bounded local JSON dialect, chunked text/tool args, context/output limits at exact encoded byte cap and cap+1, known/delayed usage, cancellation request plus lookup, and private-state scoping. Inspect captured request and durable receipt. Probe each advertised feature and every unsupported feature.
- Expected result: Every supported declaration has an executed behavior assertion; request binds model/version, instructions, tool/context policy, reasoning/verifier/runtime digests and actual route. Unsupported image/audio, dialects and optional features explicitly refuse without dispatch. A conformance failure prevents creation/use of its qualification.
- Data: F-P feature matrix with probe IDs and expiry; F-D captures/chunks/receipts.

### P02 — suite P, integration

- Requirements: AF-02, R-027, R-031.
- Environment: Local deterministic.
- Preconditions: F-D direct baseline and native P-A route; identical task, starting state, model version, permissions, tools and total allowance.
- Steps: Execute at least two controlled tasks (plain answer and complete proposal) on each route in independent fresh states. Compare specified output obligations, actual profile/input and total synthetic cost, including a known charged retry/revalidation schedule. Try an unsupported pairing.
- Expected result: Both supported routes satisfy the same protected obligations and report actual cost/failures/attempts with controls recorded. Unsupported pairing is non-comparable, never a zero-cost success. Results label deterministic contract consistency; no supplier quality, savings, latency leadership or invoice claim.
- Data: F-J controlled tasks, F-P fixed version/pricing, F-U known-failure schedule.

### P03 — suite P, security

- Requirements: AF-02-03, AF-02-04, AF-02-05, AF-06-17, AF-18-01.
- Environment: Local deterministic.
- Preconditions: F-P pool includes eligible, cheap but incompatible, busy, unapproved-provider/route/region/data-policy and expired profiles.
- Steps: Require each missing modality/dialect/tool/runtime/optional feature in turn. Select with each Fast/Balanced/Thorough/cost/capacity preference. Attempt translation that omits a mandatory requirement; request shell, Space mount, arbitrary egress or unsupported required caps.
- Expected result: All denied cases return stable reason and allowed next action with zero adapter acceptance, source disclosure or computer request. Eligible profile wins only after all current filters; preferences never rescue an ineligible candidate. Required semantics reach supported encoding intact; adaptive routing is absent.
- Data: F-P eligibility Cartesian negatives, F-N service forbidden capabilities.

### P04 — suite P, integration

- Requirements: AF-02-07.
- Environment: Local deterministic.
- Preconditions: Fresh Ask entry point with choice omitted and at least two approved eligible profiles in explicit installed order.
- Steps: Submit no-choice Ask; pause immediately before acceptance to inspect user-readable selection/preflight, then release. Capture actual encoded request and inspect task details after settlement.
- Expected result: Choice displays Auto - organization approved; selected profile is current eligible organization-approved default. Captured profile equals displayed actual model/profile. Modality, data policy, estimated cost class and fallback reason (including no fallback) are present. Exactly one authorized service acceptance.
- Data: F-J no-choice Ask, F-P default order, F-D acceptance barrier.

### P05 — suite P, integration

- Requirements: AF-02-06, AF-02-07.
- Environment: Local deterministic.
- Preconditions: P-A Auto candidate, P-B separate qualified manual profile; F-J explicit choice.
- Steps: Choose P-B while P-A is preferred; inspect capture. Make P-B unavailable and repeat without fallback permission. Repeat with user permission, and separately installed policy permission, for a qualified equivalent. Remove permission before dispatch.
- Expected result: Manual pin dispatches exactly P-B, never silently Auto. Unavailable pin produces model-unavailable wait with zero fallback calls. Only explicit current permission plus approved equivalence allows replacement; revoked permission denies. Details preserve pin and permitted fallback reason.
- Data: F-P manual/equivalent/busy fixtures; F-I permission revisions.

### P06 — suite P, integration

- Requirements: AF-02-07, AF-02-04.
- Environment: Local deterministic.
- Preconditions: No choice supplied; independently fresh profile inventories.
- Steps: Remove every available default; then test capability-incompatible default, expired/revoked qualification, unapproved provider, route, region and data policy separately. Include a tempting cheap ineligible alternative. Inspect restored task view after service recreation.
- Expected result: Each inventory yields readable model-unavailable wait/refusal and zero dispatch. No unapproved or incompatible substitute is chosen. Durable wait and next action survive restart; default remains Auto rather than an invented manual choice.
- Data: F-P seven negative default inventories, F-N wait state.

### P07 — suite P, security

- Requirements: AF-02-08, AF-02-10, AF-02-16, AF-02-18, R-025.
- Environment: Local deterministic.
- Preconditions: F-C full capsule and settled native turn; P-B qualified approved equivalent.
- Steps: Switch at safe boundary, inspect new capsule/profile and dispatch. Separately attempt switch with model/effect pending, incomplete capsule, stale source/policy/membership, incompatible semantics/residency and changed engine/schema/environment pins. Repeat preferences in Ask/Plan/Act and attempt forbidden effect.
- Expected result: Allowed switch preserves requirements/evidence/uncertainty/failed plans/pending operations/artifacts/checks/next action and recompiles current manifest. Unsafe or stale switch produces zero switched dispatch. Semantic/residency change needs explicit profile validation. Cache loss and revalidation cost estimate are visible and measured next call cost is attributed once. Intent/grants never increase; version upgrade only at compatible safe boundary.
- Data: F-C capsule, F-P switch/equivalence graph, F-V compatible/incompatible versions.

### P08 — suite P, security

- Requirements: AF-02-09, AF-02-11, AF-06-21.
- Environment: Local deterministic.
- Preconditions: Actual calls have private-state sentinel, P-A scope and a manifest; second Space shares billing person/team.
- Steps: Reuse private prefix only within exact permitted profile/route/manifest/authority scope, then change provider, model, region, profile, Space or membership revision. Capture all outgoing requests; try gateway feedback-memory/source lookup across the team.
- Expected result: Private reasoning/KV sentinel never crosses any changed scope. Stale permission invalidates reuse. Final request records current actual profile/manifest; gateway memory is disabled and billing team reveals no Space content/cache. No private state in diagnostic exports.
- Data: F-C unique private/source sentinels, F-P scope variants, F-I two Spaces.

### P09 — suite P, security

- Requirements: AF-02-11, AF-02-12, AF-02-13.
- Environment: Local deterministic.
- Preconditions: F-C descriptors from allowed, cross-Space, revoked and narrower-audience sources; instrument actual retrieval/exposure counters.
- Steps: Compile allowed records. Reject disallowed descriptors before fetch; race source revision change between eligibility, retrieval and final admission. Verify descriptor/revision/digest after fetch. Include hostile evidence asking for grants or top-up. Inspect adapter, embedding/reranker accounting probes and logs.
- Expected result: Allowed scope/provenance/time/trust and current source/policy/membership revisions bind actual fingerprint. Denied source has zero retrieval or model/embedding/reranker exposure; post-fetch mismatch prevents dispatch. Hostile text remains evidence, with no new grants/limits. Changed revisions change fingerprint; no forbidden marker is disclosed.
- Data: F-C typed descriptors plus body sentinels and revisions; F-I current audience barriers.

### P10 — suite P, security

- Requirements: AF-02-14, AF-02-15.
- Environment: Local deterministic.
- Preconditions: Closed configuration has exact and semantic response cache unsupported; Ask and action-turn requests.
- Steps: Attempt to enable each cache via installed-config decoder, client request and model proposal. Submit near-identical action turns under changed Space/audience/version/revocation and try to use a cached response as an action grant.
- Expected result: Every enable attempt explicitly refuses before any cached response/action. No semantic replay or exact-cache authority occurs. Legitimate fresh uncached turn still works after current checks. Evidence states refusal branch of exact-cache requirement, not implemented cache isolation.
- Data: F-P cache flags, F-N action intents, F-C fake cached authority.

### P11 — suite P, security

- Requirements: AF-02-16, AF-02-04, AF-02-06.
- Environment: Local deterministic.
- Preconditions: P-A and approved same-semantics/residency deployment equivalent; unapproved and altered alternatives.
- Steps: Fail original deployment in a provably safe schedule; permit approved equivalent and inspect request. Try failover with unknown original usage, changed semantics, region/data-policy, missing permission and stale equivalence qualification.
- Expected result: Equivalent failover passes profile layer and consumes original coordinated attempt allowance. No switch/retry during unknown usage. Each changed/ineligible alternative refuses/waits with zero calls there; no silent gateway translation bypass.
- Data: F-P equivalence relation, F-U safe/unknown failure, F-D route captures.

### P12 — suite P, integration

- Requirements: AF-02-17, R-025.
- Environment: Local deterministic.
- Preconditions: P-A has probe-bound local qualification; fixed clock; loaded original attempt.
- Steps: Select just before expiry, exactly at expiry, after expiry, after revocation; alter deployment/version/capability/check/environment/lock digest or omit executed probes. Restart with incompatible schema/environment and attempt automatic continuation.
- Expected result: Only unexpired matching tested qualification selects. Expiry boundary and every changed binding refuse with zero dispatch. Previous attempt/version evidence is immutable after restart; unsupported upgrade waits, never silently rewrites history.
- Data: F-P qualification vectors, F-V digest/version mutations and clock.

### P13 — suite P, security

- Requirements: AF-02-19, AF-02-18.
- Environment: Local deterministic.
- Preconditions: F-D actual chunk stream; native test effect port has dispatch counter and intent/target authorization.
- Steps: Deliver tool name/arguments across chunks; observe counter between fragments. Test truncated, malformed, missing required, unknown-field and unsupported-dialect args, then complete supported proposal in admitted Act; repeat complete proposal in Ask and with wrong target.
- Expected result: No proposal/effect dispatch before complete closed validation. Invalid streams return explicit failure and zero effects. Supported complete proposal passes existing native authorization once through test port; Ask/wrong-target remain denied. Package does not execute real tools.
- Data: F-D fragment schedules and F-N target/intent grants.

### B01 — suite B, integration

- Requirements: AF-06, AF-06-02, R-004.
- Environment: Local deterministic.
- Preconditions: Fresh parent allowance 100, parent and two children; each contender requests 40 synthetic units via real service ledger. Two independent caller processes and separate PG connections.
- Steps: Hold account/ancestor lock for first contender and launch the others. Observe actual wait_event=Lock and blocking PID, then release. Verify committed reservations before allowing adapter acceptance; settle admitted calls and restart owner for denied child.
- Expected result: Exactly two 40-unit admissions and one budget wait; no copied child capacity, no dispatch for loser. At each observed durable boundary all applicable reservations+base settled <=100, availability nonnegative. Each acceptance joins a committed reservation; restarting loser does not grant it another allowance.
- Data: F-B 100/40 barrier schedule, F-D durable acceptance records, F-X caller processes.

### B02 — suite B, security

- Requirements: AF-06-01, AF-06-21, AF-06-04.
- Environment: Local deterministic.
- Preconditions: Two isolated Spaces in one synthetic team/person account, private limits 100 each, common person cap60; requests40 in each. Other configured account ceilings present.
- Steps: Race independent Space callers against common account; then make tenant, department, person, Space, Task and Run ceiling independently limiting. Query foreign content/account details as both service scopes. Reverse contender/lock order.
- Expected result: One40 admission against cap60; losing caller sees only scoped wait/admission detail. Every configured limiting ceiling independently blocks. Account binding is trusted; no foreign content/title/balance or source leak. Reverse order terminates within harness deadline without duplicated liability/deadlock hidden as success.
- Data: F-I Spaces/tenants/team bindings; F-B account limit vectors, per-Space sentinels.

### B03 — suite B, integration

- Requirements: AF-06-02, AF-06-13, AF-06-27.
- Environment: Local deterministic.
- Preconditions: Fresh F-B/F-N; fixture-admin fault triggers on NEW F04 writes only; independent observer.
- Steps: Fail after first ancestor reserve, aggregate update, attempt/pending event, audit and outbox respectively. Trigger verifies prior partial writes occurred in same transaction. Observe no committed artifacts or adapter I/O. Remove injected fixture fault and retry original key; repeat with settlement partial writes.
- Expected result: Reservation/accounts/attempt/pending/history/receipt/audit/outbox commit or roll back together. All injected prepare failures leave initial balances and zero dispatch; settlement failures retain original liability/receipt for recovery with no partial total. Subsequent authorized original-key operation commits once.
- Data: F-B SQL fault schedule with verified stage, F-D counter, original command/usage keys.

### B04 — suite B, integration

- Requirements: AF-06-26, AF-06-02.
- Environment: Local deterministic.
- Preconditions: Actual ledger methods with safe-integer SQL/JS bounds; fresh allowance/receipt for each vector.
- Steps: Run C02 numeric negatives through reserve, top-up, settle and resource interval inputs; test exact-fit and +1 reservations, safe maximum subtotal, aggregate overflow, zero release and checked products. Exercise invalid ancestry/payer/cycle via public ledger boundary, without disabling accepted constraints.
- Expected result: All invalid inputs leave balances/history/reservations/dispatch unchanged. Exact-fit valid values conserve normal ledger; +1 refuses. Unsafe values cannot bypass through bigint casts or numeric strings. Existing SQL ceiling/settled_amount guards remain active.
- Data: F-B vectors and snapshots, valid large fixture receipt (no huge allocation/output).

### B05 — suite B, integration

- Requirements: AF-06-14, AF-06, AF-06-07.
- Environment: Local deterministic.
- Preconditions: Task allowance and owner-installed separate maintenance allowance; category ports explicit.
- Steps: Execute planning and within-task reflection through deterministic model; exercise embeddings/reranking/tool/execution/network accounting fixtures with receipts. Attempt unsupported execution adapters and maintenance without an installed allowance; repeat authorized maintenance and contest it with sibling obligations.
- Expected result: Each accepted category debits original task or explicitly authorized maintenance account and every applicable limit once. Unsupported embedding/reranking/tool execution refuses (accounting probe is labeled); no unapproved/free auxiliary work or copied allowance. Category totals match independent receipts.
- Data: F-B purpose/category matrix, F-D actual planning/reflection receipts, synthetic resource receipts.

### B06 — suite B, integration

- Requirements: AF-06-15, AF-06-16, AF-06-17, AF-06-22.
- Environment: Local deterministic.
- Preconditions: Pricing2+encodedInputBytes+outputCap; fixed F-P encoded input/cap, approved scope.
- Steps: Pause prior to acceptance; inspect preflight owner/cost center/ceiling and range assumptions. Accept with delayed usage; inspect reserved/in-flight/unknown. Return output below cap and settle. Check multibyte input and exact output/duration cap, then over-cap request and unsupported required cap.
- Expected result: Preflight precedes actual adapter I/O. Reservation uses conservative validated encoding+cap+service; measured charge uses actual bytes/service and releases only proven unused remainder. Ceiling, estimate/range, reserved, measured and settled are separate and match records. Supported caps bound actual adapter behavior; unsupported/invalid required caps deny. No invoice guarantee.
- Data: F-P byte/cap/duration vectors and deterministic clock, F-D barriers/captures.

### B07 — suite B, integration

- Requirements: AF-06-18, AF-06-16, AF-18-14, AF-06-11.
- Environment: Local deterministic.
- Preconditions: Reserve R=20; fault owner returns M=23 within +5 bound; ceiling100 and affected aggregate accounts.
- Steps: Settle trusted measured receipt; inspect base subtotal20, deficit3, economic actual23 and category sum23. Attempt new admission and ordinary/authorized top-up. Cover deficit with authorized current grant; retry duplicate receipt/cover. Admit two independent sessions before overrun settlement to check exposure bounds; return M>R+5 separately.
- Expected result: Receipt23 is immutable; base accepted constraints unchanged; unique deficit3 binds every affected account and freezes admission until once-only cover. Cover preserves history and economic actual23, no double counting. Unknown reserves persist; exposure shows outstanding reserves+5 per accepted pending attempt. Out-of-bound measured cost remains recorded but conformance/check fails; it is never truncated.
- Data: F-B R20/M23/M26, affected accounts, F-I budget-control scope, F-D overrun receipt.

### B08 — suite B, integration

- Requirements: AF-06-03, AF-06-05, AF-06-22, R-021.
- Environment: Local deterministic.
- Preconditions: Parent/child calls, assigned original payer/cost center and immutable Task/Run.
- Steps: Execute/settle parent and child, inspect call/reservation/receipt/category/audit/outbox joins. Navigate to another Space, change optional client tags and retry/recreate. Attempt SQL rebinding with authorized fixture inspector (expect existing immutable guards) and fabricated projection authority.
- Expected result: Every accepted call and charge retains original tenant/actor/Space/Task/Run/child/purpose/call/payer/cost center and relevant resource/action IDs. Navigation and restart do not retarget; forbidden rebinding/projection effects reject. Views correlate without exposing prompt/private reasoning.
- Data: F-I immutable owners, F-B lineage, F-C redaction sentinels.

### B09 — suite B, integration

- Requirements: AF-06-02, AF-06-11, AF-06-18.
- Environment: Local deterministic.
- Preconditions: Finite seed-controlled ledger action schedules plus B01/B02 true process contention.
- Steps: Run 32 fixed small schedules of reserve/known settlement/sealed release/unknown/top-up/duplicate and reverse lock order using bounded independent connections. After each acknowledged transition inspect durable account/ancestor equations and actual receipt totals. Keep overrun schedules under separately defined deficit equations.
- Expected result: Normal ceiling=available+reserved+base-settled per account; no sum of ancestors as separate economic costs. Economic settled=base settled+uncovered deficits, adjusting base exactly once on cover. No negative available/double admission or erased unknown liability. All cases terminate or return typed waits; timeouts never become grants.
- Data: F-B deterministic seeds/schedule manifest, bounded8 contenders, independent observer snapshots.

### U01 — suite U, integration

- Requirements: AF-06-06, AF-06-07, AF-06-09, AF-06-25.
- Environment: Local deterministic.
- Preconditions: One operation, max3 attempts; server and adapter-requested retry labels; adequate shared budget.
- Steps: Schedule attempt1 sealed pre-accept failure, attempt2 accepted known charged failure, attempt3 success. Request retries at both layers sequentially and concurrently, including duplicate take/key and forged ceiling reset. Then attempt4; restart mid-schedule.
- Expected result: Durable single ordinal never exceeds3; duplicate retry acquisition grants no extra dispatch. Each potentially charged attempt has unique reservation/usage key but same logical Task/purpose correlation. Attempt2 settles before next reserve; pre-accept release requires seal. Attempts, charges and failure evidence survive restart; fourth refuses.
- Data: F-U mixed failure schedule, F-D counts, F-X recreated native caller.

### U02 — suite U, integration

- Requirements: AF-06-08, AF-06-09, AF-06-10, AF-06-23, AF-06-27.
- Environment: Local deterministic.
- Preconditions: Committed prepared attempt and one-use claim, independent adapter durable journal; usage release barrier.
- Steps: Accept then delay usage, lose acceptance acknowledgement and separately omit usage indefinitely. Poll/cancel/timeout; attempt new model and test effect continuation/retry. SIGKILL native caller; recreate native service and adapter against unchanged owned PG, then release original usage and reconcile.
- Expected result: In-flight versus unknown is visible; reservation/pending fence stays held through every unproven outcome. Exactly one accepted inference, no blind accept after restart. Lookup original identity resolves once; known result settles only then and current explicit continuation is required. Missing/outage usage stays unknown with replayAllowed:false.
- Data: F-U delay/lost-ack/missing schedules, F-X owned PIDs and restart DB identity, F-D receipt journal.

### U03 — suite U, integration

- Requirements: AF-06-27, AF-06-10, AF-06-02.
- Environment: Local deterministic.
- Preconditions: Fault gates around durable prepare and claim commit, before any adapter I/O.
- Steps: SIGKILL caller before prepare COMMIT, after prepare COMMIT before claim, after acknowledged claim COMMIT before accept, and during accept transaction rollback. Inspect original events/reservation/claim from independent connection and recreate service; invoke only permitted recovery action.
- Expected result: No invocation before acknowledged prepare AND claim COMMIT. Uncommitted prepare has no dispatch or liability. Prepared unclaimed work can use explicit current dispatch; committed claim is lookup/seal-only after death, never another accept permission. Claim survives accept-transaction rollback; accepted owner evidence remains charged/unknown. Replay cannot create fresh model/effect.
- Data: F-X four exact crash gates, F-D durable accepted counter, F-B independent commit observations.

### U04 — suite U, integration

- Requirements: AF-06-10, AF-06-27, AF-06-28.
- Environment: Local deterministic.
- Preconditions: Real PG prepare/claim/settle mutation, genuine foundation UNKNOWN_COMMIT; original scoped key/digest.
- Steps: Drop acknowledgement after real COMMIT at each mutation; lookup original key while competing writer holds same key lock for commit/rollback/timeout. Try wrong actor/key/digest and spoofed {code:UNKNOWN_COMMIT}. Recreate process and lookup again.
- Expected result: Unknown acknowledged outcome never permits accept/release/retry until serialized original-key proof. Lookup waits on actual original-key lock (digest excluded from lock namespace), sees committed record after commit or proven absent after rollback, timeout remains unknown. Wrong digest conflicts; foreign scope cannot read. Only imported typed error follows unknown path; spoof fails safely.
- Data: F-U lost-COMMIT harness and key variants, F-B blocking PID, F-X restart.

### U05 — suite U, security

- Requirements: AF-06-28, AF-06-11, AF-06-04.
- Environment: Local deterministic.
- Preconditions: Unknown operation with trusted original owner receipt; public reconcile accepts identity only.
- Steps: Call reconcile with supplied outcome/units/payer/profile/receipt, foreign operation/usageKey, changed digest/binding and counterfeit receipt. Then reconcile original operation normally; instrument lookup destination and late authorization.
- Expected result: Forged fields/receipts refuse before accounting mutation or disclosure. Lookup goes only to trusted owner for original identity, derives exact receipt; no arbitrary destination. Same receipt cannot settle another call. Authorized positive settles original binding once with complete attribution.
- Data: F-U counterfeit receipts, F-I foreign scopes, F-D original owner capture.

### U06 — suite U, integration

- Requirements: AF-06-28, AF-06-08, AF-06-27.
- Environment: Local deterministic.
- Preconditions: Original live claimant enters accept but owner row not yet committed; independent reconcile/seal contender.
- Steps: Hold bounded acceptance before owner commit. Start lookup/reconcile, observe actual lock/blocker and attempt absence-based release/retry. Commit acceptance, then finish lookup. Separately lose ack and restart claimant while held owner acceptance resolves.
- Expected result: Empty lookup is unknown, never safe non-acceptance. Active claimant/owner serialization prevents early release; held budget/pending remains. After commit lookup finds one exact acceptance/receipt; no second accept/retry occurs. Restart cannot infer a new grant from absence.
- Data: F-D accept-before-commit barrier, F-B owner/native blocking PID, F-X crash variant.

### U07 — suite U, integration

- Requirements: AF-06-28, AF-06-09, AF-06-02.
- Environment: Local deterministic.
- Preconditions: Claimed original attempt whose acceptance is unproven; same original key/epoch for seal and delayed accept.
- Steps: Force seal-first ordering and obtain committed permanent non-acceptance proof; then deliver delayed stale accept. Release twice and attempt current authorized retry. Repeat accept-first ordering with competing seal, plus owner outage/unprovable absence.
- Expected result: Seal-first rejects delayed accept for sealed epoch; release exactly once then separate remaining-budget retry is possible. Accept-first seal observes accepted evidence, retains/settles liability rather than releasing. Outage/absent-without-proof remains unknown. Both races use real independent transactions, not Maps.
- Data: F-D permanent tombstone/epoch race barriers, F-U outage, F-B release totals.

### U08 — suite U, integration

- Requirements: AF-06-11, AF-06-02.
- Environment: Local deterministic.
- Preconditions: Original trusted known receipt; three independent settlement callers and no result publication yet.
- Steps: Settle twice sequentially; race identical settlements and changed units/outcome/receipt/category/scope; fault after usage insertion before budget/event commit. Kill/recreate native service and repeat original settlement.
- Expected result: Only exact duplicates are idempotent. One economic charge/base settlement/pending resolution/audit/outbox result; conflicts preserve immutable original values. Fault rolls back all settlement writes, liability held for original recovery. Restart duplicates do not change totals.
- Data: F-U exact/conflicting receipts, F-X restarted settle callers, F-B partial-write fault.

### U09 — suite U, integration

- Requirements: AF-06-23, AF-18-15, AF-06-10.
- Environment: Local deterministic.
- Preconditions: One accepted call with delayed usage and cancellation owner that cannot prove termination.
- Steps: Cancel, timeout and Stop independently after acceptance; restart caller/adapter, inspect retained liability; attempt old generation model/effect/computer continuation. Reconcile usage under original generation, then try to publish/resume stopped work.
- Expected result: Cancel-requested is distinct from terminated; no zero-cost inference. Pending/unknown survives Stop/restart. New/stale continuation and publication denied. Accounting can recognize original accepted charge without reopening stopped task. Owner termination receipt, if provided, is explicit and still includes known usage.
- Data: F-U no-termination and known-cancelled receipts, F-N generations, F-D counts.

### U10 — suite U, integration

- Requirements: AF-06-24, R-020, R-025.
- Environment: Local deterministic.
- Preconditions: Durable event histories for settled, budget wait, prepared, claimed, unknown and stopped sessions.
- Steps: Recreate native composition and replay unchanged reducers with instrumented model/retrieval/tool/provision/top-up ports. Compare projections and accounting; attempt fresh callModel/dispatchEffect while unresolved and load incompatible history version.
- Expected result: Replay invokes zero I/O ports and reconstructs exact committed state and version pins. Unresolved session permits only trusted original resolveModel, never fresh call/effect. Incompatible history waits/refuses; reconstruction alone is not another persistence authority.
- Data: F-N history snapshots, F-X actual recreated composition; zero-port counters.

### U11 — suite U, integration

- Requirements: AF-06-25, AF-06-05, AF-06-06.
- Environment: Local deterministic.
- Preconditions: Terminal failed Run with known charges, ancestor allowance partly consumed; separate unknown Run fixture.
- Steps: Create linked native retry Run with fresh allowed identity after known terminal failure. Inspect original receipt/failure/ancestor counters; attempt reuse/reset of prior ceilings and retry keys. Attempt new Run while unresolved original liability fences applicable work.
- Expected result: New Run does not erase previous evidence or costs, copy allowance or retarget payer. Original ancestor/account totals constrain it. Logical retry max remains immutable; unknown obligation stays represented and cannot be evaded by new-run repair.
- Data: F-N terminal/run lineage, F-B partially spent/unknown accounts, F-U previous receipts.

### N01 — suite N, security

- Requirements: AF-18, AF-18-01, AF-18-02, AF-18-03.
- Environment: Local deterministic.
- Preconditions: Actual native service composition, service-only profile and separate instrumented provision/wake/local-enroll/effect ports.
- Steps: Complete ordinary Ask, then inject known service failure, unavailable route and unknown usage. Request computer by tool name/preference, local-machine fallback, unapproved region and arbitrary mount/shell; classify admitted target-aware external effect separately.
- Expected result: Successful Ask has service receipt and exactly zero Space-computer starts. Failures stay bounded retry/wait; zero computer/local enrollment/unapproved dispatch. Service contract denies mount/shell and target-aware effects without grants. No actual remote isolation/no-VM product claim.
- Data: F-N Ask/classification vectors, F-U service failures, F-D route records.

### N02 — suite N, integration

- Requirements: AF-18-04, AF-18-13, AF-18-02.
- Environment: Local deterministic.
- Preconditions: Admitted computer capability, test assignment/policy/authority/requirements/costs; simulated single computer.
- Steps: Advance visible Preparing computer phases only after preflight; independently omit grant/capability/qualified profile or stale policy. Contest same assignment with two caller processes and reverse ownership; inspect resolver wait and callback counts.
- Expected result: Eligible local fixture reaches simulated-ready with exact assignment/policy/current access/phase/resource implications; each ineligible case waits/refuses with zero start. Contender queues with owner/reason, never allocates second worker. No real provisioning, shell or local enrollment.
- Data: F-N preflight/single-assignment barriers, F-I current grants, F-R cost preflight.

### N03 — suite N, integration

- Requirements: AF-18-05, AF-18-06, UX-11.
- Environment: Local deterministic.
- Preconditions: Saved committed work, exhausted/threshold allowance and unknown sibling reservation; fixed expiry policy.
- Steps: Request chargeable step, inspect native wait, poll/advance time before expiry and recreate service. Try denied continuation, then configured expiry and explicit Stop separately. Observe checkpoint, current resolver/timestamps and held amounts.
- Expected result: No extra dispatch at exhaustion/threshold. Durable Waiting: budget retains original Task/work/unknown reserve, since/updatedAt/expiry, cause/resource/current owner and permitted action. Wait is not automatic terminal failure; configured expiry/Stop follows native semantics with zero automatic model turns.
- Data: F-N checkpoint/wait/clock, F-B threshold/exhaustion, F-X restart.

### N04 — suite N, security

- Requirements: UX-11, AF-06-19, AF-06-12, AF-18-06.
- Environment: Local deterministic.
- Preconditions: Budget wait; current budget-control administrator, ordinary user and model/Reflect hostile proposals; unknown reserve.
- Steps: Try unauthorized/stale/model/Reflect top-ups; authorized idempotent top-up with revision/expiry, duplicate and conflicting key; revoke budget authority during awaited mutation. Inspect wait before separate resume. Resume after fresh checks; repeat admitted smaller-scope continuation, widened requirement and insufficient balance.
- Expected result: Denied changes leave ceilings/receipts/history unchanged. Exact authorized synthetic top-up once increases/appropriately covers deficit, never releases unknown reserves or auto-resumes. Current explicit resume can continue saved original work within admitted scope and all remaining limits; widening/stale/insufficient cases refuse. No real money transfer.
- Data: F-I budget grants/late-lock barrier, F-N wait/scope revision, F-B amount and keys.

### N05 — suite N, integration

- Requirements: AF-18-07, AF-18-06, AF-18-08.
- Environment: Local deterministic.
- Preconditions: Native approval wait with last known result and ongoing reserved/storage resource policy.
- Steps: Poll32 times, advance fixture clock across several intervals, reconnect and SIGKILL/recreate service. Attempt model turn from polling/expiry/reconnect and check visible cause/owner/last update/next action/ongoing costs.
- Expected result: Zero new model accept/attempt/model units and zero computer starts caused by approval wait; no auto-submission. Saved result and durable reason/current resolver survive restart. Explicit synthetic continuing resource charges remain visible independently of zero model turns.
- Data: F-N approval wait/clock, F-R ongoing intervals, F-X recreated owner, F-D counters.

### N06 — suite N, integration

- Requirements: AF-18-15, AF-06-23, AF-06-27.
- Environment: Local deterministic.
- Preconditions: Prepared original attempt and installed native Space/Run fence; acceptance and Stop barriers; current Stop user, stale progress revision.
- Steps: Order Stop-before-accept and observe committed cancellation barrier before releasing claimant. Order accept-before-Stop and observe Stop actually blocked on lock while bounded owner acceptance completes. Restart and attempt old/new generation continuation, child model and computer dispatch.
- Expected result: Stop from stale progress still works. Stop-first produces zero accepted inference; accept-first recognizes only prior accepted liability then blocks all later dispatch. Acknowledgement fences new/stale generation calls and children/computer effects, retains unknown until reconciliation. No unconfirmed termination/SLA claim.
- Data: F-N cancellation generations/child linkage, F-D acceptance barrier, F-B blocking PID, F-X restart.

### N07 — suite N, integration

- Requirements: AF-18-08, AF-18-09, AF-18-12, AF-18-14.
- Environment: Local deterministic.
- Preconditions: Synthetic resource policy reserved-until-confirmed-suspended; task pending inference, explicit Space resource allowance.
- Steps: Advance active/reserved/storage/network/cold-start intervals through wait and Stop. Archive conversation without Stop; request suspend with unknown ack, then confirm simulated suspend. Observe next intervals and declared delete-retention transition. Exhaust model allowance and run local non-model settlement/checkpoint.
- Expected result: Wait/Stop/archive do not fabricate free compute/storage or terminate inference. Compute billing stops only at confirmed simulated suspension boundary; storage persists under retention. Archive does not stop work; delete is declared fixture transition, not real data deletion/restore. Categories/policy/units labeled synthetic; zero-model control settlement works at exhaustion and production settlement reserve guarantee is explicitly unsupported with +5 exposure.
- Data: F-R clock/lifecycle/rate vectors, F-U unknown/cancelled receipt, F-N archives.

### N08 — suite N, integration

- Requirements: AF-18-10, AF-18-11, AF-18-12, AF-06-22.
- Environment: Local deterministic.
- Preconditions: One Space assignment and two concurrent tasks, interval [0,10), deterministic category/rate, owner receipt.
- Steps: Race identical resource receipt from separate callers; repeat after service recreation. Submit overlap [5,15), adjacency [10,20), conflicting rate/owner/scope and boundary-spanning policy change. Inspect both task and Space views and task-origin versus persistent resource allowance.
- Expected result: Original interval charged once to owning Space. Exact duplicate idempotent; overlap/conflict rejects with no partial charges; adjacent/split policy intervals correct. Task references say unallocated-shared-cost, task allocated totals0 plus unallocated equals Space total, never sum machine bill twice. Task-caused cost uses Run lineage; idle persistent cost uses explicit Space allowance/purpose.
- Data: F-R half-open interval/key/rate receipt vectors, F-B dedicated allowances, F-X restart.

### A01 — suite A, security

- Requirements: AF-06-04, AF-06-05, AF-06-12, AF-06-21, R-021.
- Environment: Local deterministic.
- Preconditions: F-I issued immutable verified scopes, separate client/worker/service/adapter roles and two Spaces/tenants.
- Steps: Try forged/copied/JSON verified scopes and client role/team/owner/payer metadata, foreign Task/Run/call/source/account and changed original binding. Attempt direct SQL writes/selects as client/worker/adapter and foreign service scope. Run authorized control counterpart.
- Expected result: Zero denied dispatches/cost assignments/disclosures. Trusted server stamps original owner; client cannot select account. Nonowner NOSUPERUSER/NOBYPASSRLS roles cannot access control/accounting tables; new tables ENABLE/FORCE RLS and composite scope bindings protect row/content reads. Adapter reads/writes only own receipt domain; aggregate functions do not expose foreign balances/content.
- Data: F-I role DSNs never exported, F-C unique foreign marker, F-B account bindings.

### A02 — suite A, security

- Requirements: AF-06-12, AF-06-13, AF-06-19, AF-02-08.
- Environment: Local deterministic.
- Preconditions: F-I current scope before prepare/claim/resume/switch/top-up; independent held authority lock.
- Steps: For each boundary separately expire token/session, revoke actor/payer/member/grant, make Space lifecycle inactive/deleted or resource quarantined, or advance membership/policy/source authority while contender waits. Observe actual PG blocking then commit change; revalidate after all required waits/partial writes. Inject authority outage and required audit failure.
- Expected result: All affected operations fail closed with typed safe reason; zero unauthorized accepted calls/accounting writes. Preexisting work/liability preserved; no retarget to new payer. Expiry after awaited later locks is caught, not just initial validation. Faulted sensitive transaction rolls back and reports allowed next action.
- Data: F-I independent monotonic authority fixtures per variant; F-B expiry/fault gates.

### A03 — suite A, security

- Requirements: AF-02-20, AF-06-22, AF-06-23.
- Environment: Local deterministic.
- Preconditions: Accepted inference using permitted source; staged text result and multiple chunks; destination/source membership initially valid.
- Steps: Revoke destination membership and separately source audience/payer/policy while inference in flight, between chunks and before publication. Complete trusted usage and inspect authorized operator cost view; try read/result publication as revoked user.
- Expected result: No subsequent unauthorized text/chunks/publication/source marker; already-authorized bytes are not claimed recalled. Original cost settles/accountable independently of denied disclosure. Authorized cost view is correlated/redacted; revoked caller cannot obtain result/private reasoning via logs or inspect endpoints.
- Data: F-D result/chunk gates, F-I source/destination variants, F-C content sentinels.

### A04 — suite A, security

- Requirements: AF-06-28, AF-06-12, AF-06-13.
- Environment: Local deterministic.
- Preconditions: Unknown call; authorized requester starts awaited original-owner lookup; receipt release gate.
- Steps: During lookup expire/revoke requester session/member/payer/source authority or make current authority unavailable. Then return valid original receipt. Repeat top-up/resume response while held later-party lock. Inspect transaction effects and response bytes from independent connections.
- Expected result: Late current authorization is checked before commit/return; affected mutations/disclosure refuse and retained original liability remains recoverable by authorized operator. Receipt arrival is not an authority grant; no caller-supplied outcome substitutes owner. Independent positive counterpart succeeds.
- Data: F-D lookup barrier, F-I expiry/revocation variants and foreign receipt.

### A05 — suite A, security

- Requirements: AF-06-20, AF-06-21, AF-06-22, R-013, R-014.
- Environment: Local deterministic.
- Preconditions: Installed deterministic-only config; child processes receive minimal fixture environment; harmless synthetic credential sentinel.
- Steps: Attempt paidCallsAllowed, cloud/remote transport, real-looking destination/provider key via config/client/env (synthetic marker only). Inspect interface/child env/audit/outbox/operator/diagnostic exports and capture all adapter connections at installed transport boundary. Try team feedback-memory enabling.
- Expected result: No external transport constructed or requested, zero nonloopback supplier/cloud destinations; no real credential is used. Prompt/tool/client/export never receives fixture DSN/password/session/private reasoning. Diagnostic sentinel redacted; gateway memory disabled. Only installed deterministic adapter accepts.
- Data: F-V closed config vectors, F-C harmless secret markers, F-X environment allowlist/census; never read real secrets.

### A06 — suite A, security

- Requirements: R-021, AF-06-22, R-005.
- Environment: Local deterministic.
- Preconditions: Committed scoped model/accounting events and cost views; original current reader.
- Steps: Validate contiguous envelope/tenant/Space/Task/Run/session/call/attempt/generation/time correlations. Deliver outbox event twice, then after reader revocation; forge log/summary/projection as grant/settlement/top-up. Inspect safe error text for unknown fields, SQL and exception leak.
- Expected result: Original correlated events/usage are inspectable without source bodies/reasoning/secrets. Consumer reauthorizes/deduplicates; duplicate delivery does not charge or dispatch. Revoked read denied. Logs/views never authorize work, and errors expose stable reason/next action without SQL/private exception.
- Data: F-N event histories, F-C sentinel logs/forged summaries, F-I current reader.

### Q01 — suite Q, integration

- Requirements: R-001, R-002, R-023.
- Environment: Local deterministic.
- Preconditions: Disposable owned fresh copy and pinned cached Node22.22.3/pnpm10.18.0/TS5.9.3/Node types22.18.6/pg8.16.3/types8.15.5; dependencies frozen offline.
- Steps: Install offline/frozen/ignore-scripts and build source AND tests from no cache. In separate reproducible copies introduce source type error, test type error, stale emitted success file and missing mandatory suite. Invoke actual checker and record exit/stdout/stderr; restore only disposable copies.
- Expected result: Fresh build succeeds for real candidate; each bad copy fails nonzero. Stale artifact cannot mask missing/failed compile. Independent lock/tool versions and build identity recorded; no accepted file edits or network install/fallback.
- Data: F-V fresh-copy owner manifest/tool/lock versions, F-H checker mutations.

### Q02 — suite Q, integration

- Requirements: R-002, R-003, R-004, R-005.
- Environment: Local deterministic.
- Preconditions: Owned checker meta-test copies; all mandatory suite and case identities in approved manifest.
- Steps: Remove each suite and each expected case ID individually; substitute empty tests, label-only output, failing assertion, skip, TODO and unknown checker arg. Feed forged contradictory TAP summary/result into parsing seam; enforce actual subprocess exit. Run full real candidate and reconcile manifest IDs to assertion-backed test report and receipt counters.
- Expected result: Every sabotage fails nonzero, including a pass string beside failure/skip and printed case IDs without actual tests. Each mandatory suite nonempty; all planned cases present/executed, no failures/skips/TODO. Checker records actual assertions/observations and zero forbidden outcomes, not label substring alone. Meta-tests do not recursively spawn themselves.
- Data: F-H report/fixture mutations, case manifest, bounded test process; full candidate receipts.

### Q03 — suite Q, integration

- Requirements: R-010, R-011, R-025.
- Environment: Local deterministic.
- Preconditions: Accepted source/raw evidence digests and original migrations/ledgers; new independent F04 migration ledger in owned fixture.
- Steps: Hash preserved baseline before/after every suite. Apply F04 additive migrations twice/concurrently, rerun foundation/identity compatibility, inspect versions/digests and loaded recovery fences. Change same-version NEW migration digest in disposable copy; try unsafe rollback/upgrade. Compare additive repository diff.
- Expected result: Accepted files/raw evidence/constraints/roles and foundation1/2, identity3, loaded recovery digests unchanged. New migration idempotent under owner lock; conflicting digest fails. No drop/reset/history rewriting. F04 schema changes confined to separate additive module.
- Data: F-V baseline/digest manifest, F-B owned PG, F-H changed new-migration copy.

### Q04 — suite Q, security

- Requirements: R-013, R-014, R-015, R-016, R-017, R-018, R-019, R-020.
- Environment: Local executable guards plus mandatory independent human/reviewer action audit; no external action performed.
- Preconditions: Run action/process/connection/cleanup inventory; repository-reproducible owner-marked data only.
- Steps: Run runtime preflight: actual census, loopback roundtrip, owned child creation/reap and cached PG image fixture. Test mismatched marker/symlink/foreign path/PID reuse as dry-run cleanup refusals. Independent reviewer compares command/action ledger and approval history for paid/provider/cloud/deploy/destructive/credential/ACL/message/history actions; inventory native task owner and minimal dependencies.
- Expected result: Cleanup touches only current owned reproducible fixture and verifies before signalling/deletion. Foreign ownership refuses without action. No supplier/cloud, shared deploy, human message, real credential/settings change or history rewrite executed; synthetic fixture role changes explicitly local. If a future restricted action exists it needs exact prior loop_ask approval, never assumed. No competitor/second native planner/retry owner.
- Data: F-X instance/owner markers, F-V fixed PG image digest, controller action and approval ledger.

### Q05 — suite Q, integration

- Requirements: R-006, R-007, R-008, R-011, R-022, R-024, R-033.
- Environment: Local artifact validation plus independent release/evidence review; no acceptance claimed at design.
- Preconditions: Downstream plan/evidence exist at delivery; local artifact validator accepts explicit pending checks, and F-H supplies valid/invalid binding specimens. Actual current-candidate logs/failure history are reviewed after controller runs.
- Steps: Run new qualification artifact validator; verify every100 requirement maps to executed case/remaining gate. Check links and raw result digests/byte counts, candidate source/lock/check/environment identities and commanded outputs. Independent reviewer assesses data flow/owner/threat/recovery/rollback/operator copy and preservation of failed observations; invalidate a copied stale or edited evidence binding.
- Expected result: Missing documents/requirements or stale/unsupported pass identities fail validation; explicit missing-result pending state can pass local truthfulness tests but cannot establish acceptance. Final evidence review requires complete actual current controller results. Evidence clearly separates proposed, author diagnostic, controller pass, independent review and pending human/environment status. No manufactured signatures. Actual raw failures/history/cumulative usage retained; scoped retry/reserve/profile/category views explained. Reviewer judgment remains required, validator cannot self-attest acceptance.
- Data: F-H artifact mutation copies; actual controller result paths, candidate manifest and requirements digest.

### Q06 — suite Q, security

- Requirements: R-026, R-005, R-022.
- Environment: Local qualification gate test plus independent security/release judgment.
- Preconditions: Local qualification schema and reproducible F04-only blocker fixture; actual controller finite zero-violation results and independent review records are audited after they exist.
- Steps: In owned qualification test input inject an unresolved high-severity authorization/isolation/stale-approval/duplicate-effect finding with otherwise passing checks; test repaired-but-unverified and verified repair. Reviewer checks actual controller findings/reviews before affected profile acceptance.
- Expected result: Unresolved or unverified high-severity finding blocks affected local qualification/release; a green author/task report cannot override. No fabricated controller result or signature; actual final approval follows controller reviews. Forbidden counters are zero in executed local suites, interpreted only for finite tested environment.
- Data: F-H synthetic qualification-findings input distinct from controller-owned state; actual review ledger.

### Q07 — suite Q, integration

- Requirements: R-023, R-024, R-025.
- Environment: Local deterministic.
- Preconditions: Downstream manifest/license/notice/security/update metadata and rollback procedure; pending/settled model states.
- Steps: Validate pins against installed package versions/lock and actual image/tool identities; check license/notice and dated vulnerability status (unknown if not investigated, never assert clean). Execute local rollback disable-admission, lookup/settle original receipt and version boundary refusal. Follow documented restore ordering with tombstoned source/member.
- Expected result: Manifest matches actual build, includes owners/update duties and honestly known/unknown security metadata. Rollback blocks new admission but retains history, charges, unknown reserves and original recovery. Restore rechecks tombstones/current authority before access; no erased data or replayed inference.
- Data: F-V manifests, F-U pending/settled receipts, F-I tombstones; documentation commands tested locally.

### Q08 — suite Q, integration

- Requirements: R-027, R-028, R-029, R-030, R-031, R-032.
- Environment: Local artifact checks plus independent scope/qualification review; external gates pending.
- Preconditions: Downstream plan/evidence and local qualification summary; external environments not authorized.
- Steps: Validate and independently review pending-gate table for supplier, gateway/billing, runtime/storage, broader product and performance; insert fake supplier/invoice/no-VM/SLA/whole-G1 pass in disposable evidence and require mismatch refusal. Review any optional deterministic profile/failure schedule purpose.
- Expected result: All five external gates explicit, owner responsibility/approval/evidence conditions recorded. Local synthetic outputs never promoted to supplier quality/invoice equivalence/real tariff/isolation/performance/product pass. Optional fixture stays deterministic and demonstrates added refusal/race coverage, or is recorded absent. No fabricated benchmark; UX-11 is only local supporting journey.
- Data: F-H evidence claim mutations and source obligations, E01–E05 future gate checklist.

### Q09 — suite Q, integration

- Requirements: R-010, R-011, R-012, R-022.
- Environment: Controller outside-sandbox regression environment plus independent result review.
- Preconditions: Current candidate ready for later registered controller checks; GUI/Electron outside sandbox. Local artifact guard uses actual unchanged checker definitions and explicitly pending results.
- Steps: In the local Q09 test, verify unchanged registered commands/protected checker digests and reject fabricated or mismatched regression receipts using F-H inputs. After implementation, run unchanged identity-behavior, foundation-behavior and retained-baselines through loop_check; record controller jobs, exact commands/check definitions and source bindings. Poll completion and inspect full stdout/stderr including GUI probes. Compare protected/raw hashes and review receipts against current candidate.
- Expected result: Local guard rejects altered check definitions or false attestation and allows honest pending state only. Final controller gate requires all three unchanged commands pass outside sandbox as registered, raw evidence unchanged and current receipts accessible. A sandbox GUI crash, missing environment, old pass or author run is not substituted for controller result. Failure is preserved and repaired without weakening baseline. This stage only designs these runs.
- Data: Controller check IDs and actual retained source/manifest; no sandbox GUI invocation.

### J01 — suite J, e2e

- Requirements: AF-18, AF-06-15, AF-02-07, R-009, R-033.
- Environment: Local deterministic.
- Preconditions: Fresh scoped local operator journey1 and approved Auto profile, sufficient allowance.
- Steps: Execute documented Ask command/entry point from authenticated task admission to preflight, actual service receipt, native answer and cost inspection. Pause before I/O to assert preflight ordering; use ordinary user/redacted view.
- Expected result: User reads Auto/actual profile/modality/data policy/cost class, original payer/cost center/allowance and separate estimate/settled cost. Actual service call succeeds, computer starts0. Source/private reasoning absent from cost output; synthetic label clear.
- Data: F-J journey1, F-D request/receipt barriers, F-I ordinary authorized user.

### J02 — suite J, e2e

- Requirements: AF-02-03, AF-02-06, AF-02-08, R-009.
- Environment: Local deterministic.
- Preconditions: Documented journey2 with unavailable pin and unsupported capability; allowed equivalent at later safe boundary.
- Steps: Execute request/refusal, inspect readable model wait and preserved work; explicitly authorize allowed equivalent/switch and recompile capsule, then execute. Repeat with no permission and ineligible alternative.
- Expected result: User sees reason/next action and actual profile/fallback cost; forbidden variants zero dispatch. Permitted current safe switch succeeds without new intent/provider approval assumption. No new GUI required.
- Data: F-J journey2, F-P equivalents/missing capability, F-C capsule.

### J03 — suite J, e2e

- Requirements: AF-06, AF-06-01, AF-06-04, R-009.
- Environment: Local deterministic.
- Preconditions: Documented journey3 parent/children/shared aggregate accounts; independent actual callers.
- Steps: Execute contested requests and inspect original task views/remaining allowance; forge payer/team tag and retry losing child. Compare each displayed balance to B01/B02 recorded ledger/captures.
- Expected result: Only atomically admitted calls run; user sees scoped wait and single shared capacity. No copied allowance/foreign owner/content; losing child cannot bypass by tag or retry.
- Data: F-J journey3, F-B contested fixtures and dispatch receipts.

### J04 — suite J, e2e

- Requirements: AF-06-06, AF-06-08, AF-06-10, AF-06-24, R-009, R-033.
- Environment: Local deterministic.
- Preconditions: Documented journey4 known retry then accepted lost-ack/delayed usage; native process restart.
- Steps: Execute failure schedule, inspect retry count/retained reserve/actual profile; recreate, lookup original call and reconcile. While unknown try continuation and inspect no-replay guidance.
- Expected result: Readable unknown/resolver and retry totals correspond to original durable receipts. Lookup/settle not replay; one chargeable acceptance for uncertain call. Known retries count once and charges visible; no private reasoning.
- Data: F-J journey4, F-U lost-ack and known failure, F-X restart.

### J05 — suite J, e2e

- Requirements: UX-11, AF-18-05, AF-18-06, AF-18-07, R-009.
- Environment: Local deterministic.
- Preconditions: Documented journey5 saved budget wait, current administrator and unknown sibling liability.
- Steps: Follow denied and authorized synthetic top-up/smaller-scope/resume commands; inspect restored wait and separate approval wait after restart; poll with deterministic time.
- Expected result: Committed work and original owner retained, authorized explicit continuation after fresh checks succeeds when budget permits, denied/widened variants do not. Unknown reserve held; approval wait has0 model turns. Output says synthetic allowance operation, no payment.
- Data: F-J journey5, F-I budget grants, F-N waits, F-U unknown liability.

### J06 — suite J, e2e

- Requirements: AF-18-04, AF-18-08, AF-18-09, AF-18-10, AF-18-11, AF-18-12, AF-18-13, R-009, R-033.
- Environment: Local deterministic.
- Preconditions: Documented journey6 simulated computer preflight, shared assignment and persistent resource receipts.
- Steps: Inspect Preparing computer/assignment/costs and contested resource wait. Stop/archive/request suspend; inspect resource and two Task views before/after confirmed simulated suspend, plus cold-start/storage/network categories.
- Expected result: User can distinguish stop/archive/suspend/delete-retention contract and continuing charges. Shared cost is once at Space with unallocated view; contention never creates second worker. All resource lifecycle/units explicitly simulated; no real environment claim.
- Data: F-J journey6, F-N contention/lifecycle, F-R intervals and scoped views.

## 6. Requirement-to-case matrix

All100 reviewed requirements are covered; all65 local case IDs have one suite and one allowed level. Inventory digest (canonical JSON, sorted object keys, compact separators, UTF-8, unescaped Unicode): `7ee9471461068fc94e27bc231bae04badbc11032ceedad6f5405bc097aad4600`. Planner must record each task's `covers` from this matrix; mere ID references do not prove implementation. Case sections supply preconditions/steps/oracles/data. Requirements with external/reviewer obligations need both local guard/artifact proof and the specified future gate/judgment.

| Requirement | Priority | Required local cases | Additional review/environment obligation |
| --- | --- | --- | --- |
| AF-02 | Must | P01, P02 | E01 real supplier quality/conformance/comparable economics pending |
| AF-02-01 | Must | C01, P01 | Local deterministic proof; no external qualification implied |
| AF-02-02 | Must | C01, P01 | Local deterministic proof; no external qualification implied |
| AF-02-03 | Must | P03, J02 | Local deterministic proof; no external qualification implied |
| AF-02-04 | Must | P03, P06, P11 | Local deterministic proof; no external qualification implied |
| AF-02-05 | Must | P03 | Local deterministic proof; no external qualification implied |
| AF-02-06 | Must | P05, P11, J02 | Local deterministic proof; no external qualification implied |
| AF-02-07 | Must | P04, P05, P06, J01 | Local deterministic proof; no external qualification implied |
| AF-02-08 | Must | P07, A02, J02 | Local deterministic proof; no external qualification implied |
| AF-02-09 | Must | P08 | Local deterministic proof; no external qualification implied |
| AF-02-10 | Must | P07 | Local deterministic proof; no external qualification implied |
| AF-02-11 | Must | P08, P09 | Local deterministic proof; no external qualification implied |
| AF-02-12 | Must | P09 | Local deterministic proof; no external qualification implied |
| AF-02-13 | Must | C03, P09 | Local deterministic proof; no external qualification implied |
| AF-02-14 | Must | P10 | Local deterministic proof; no external qualification implied |
| AF-02-15 | Must | P10 | Local deterministic proof; no external qualification implied |
| AF-02-16 | Must | P07, P11 | Local deterministic proof; no external qualification implied |
| AF-02-17 | Must | C01, P01, P12 | Local deterministic proof; no external qualification implied |
| AF-02-18 | Must | P07, P13 | Local deterministic proof; no external qualification implied |
| AF-06 | Must | B01, B05, J03 | E02 actual gateway billing reconciliation pending |
| AF-06-01 | Must | B02, J03 | Local deterministic proof; no external qualification implied |
| AF-06-02 | Must | B01, B03, B04, B09, U03, U07, U08 | Local deterministic proof; no external qualification implied |
| AF-06-03 | Must | B08 | Local deterministic proof; no external qualification implied |
| AF-06-04 | Must | B02, U05, A01, J03 | Local deterministic proof; no external qualification implied |
| AF-06-05 | Must | B08, U11, A01 | Local deterministic proof; no external qualification implied |
| AF-06-06 | Must | U01, U11, J04 | Local deterministic proof; no external qualification implied |
| AF-06-07 | Must | B05, U01 | Local deterministic proof; no external qualification implied |
| AF-06-08 | Must | U02, U06, J04 | Local deterministic proof; no external qualification implied |
| AF-06-09 | Must | C03, U01, U02, U07 | Local deterministic proof; no external qualification implied |
| AF-06-10 | Must | U02, U03, U04, U09, J04 | Local deterministic proof; no external qualification implied |
| AF-06-11 | Must | B07, B09, U05, U08 | Local deterministic proof; no external qualification implied |
| AF-06-12 | Must | N04, A01, A02, A04 | Local deterministic proof; no external qualification implied |
| AF-06-13 | Must | B03, A02, A04 | Local deterministic proof; no external qualification implied |
| AF-06-14 | Must | B05 | Local deterministic proof; no external qualification implied |
| AF-06-15 | Must | B06, J01 | Local deterministic proof; no external qualification implied |
| AF-06-16 | Must | B06, B07 | Local deterministic proof; no external qualification implied |
| AF-06-17 | Must | C02, P03, B06 | Local deterministic proof; no external qualification implied |
| AF-06-18 | Must | B07, B09 | Local deterministic proof; no external qualification implied |
| AF-06-19 | Must | N04, A02 | Local deterministic proof; no external qualification implied |
| AF-06-20 | Must | A05 | E02 real key custody/rotation pending |
| AF-06-21 | Must | P08, B02, A01, A05 | Local deterministic proof; no external qualification implied |
| AF-06-22 | Must | B06, B08, N08, A03, A05, A06 | Local deterministic proof; no external qualification implied |
| AF-06-23 | Must | U02, U09, N06, A03 | Local deterministic proof; no external qualification implied |
| AF-06-24 | Must | U10, J04 | Local deterministic proof; no external qualification implied |
| AF-06-25 | Must | U01, U11 | Local deterministic proof; no external qualification implied |
| AF-18 | Must | N01, J01 | E03 actual no-VM/cold-start/storage costs pending |
| AF-18-01 | Must | P03, N01 | E03 remote service isolation/egress pending |
| AF-18-02 | Must | C03, N01, N02 | Local deterministic proof; no external qualification implied |
| AF-18-03 | Must | N01 | Local deterministic proof; no external qualification implied |
| AF-18-04 | Must | N02, J06 | E03 actual provision/preflight pending |
| AF-18-05 | Must | N03, J05 | Local deterministic proof; no external qualification implied |
| AF-18-06 | Must | N03, N04, N05, J05 | Local deterministic proof; no external qualification implied |
| AF-18-07 | Must | N05, J05 | Local deterministic proof; no external qualification implied |
| UX-11 | Must | N03, N04, J05 | E02 actual delayed metering/real top-up; supporting local journey only |
| AF-18-08 | Must | N05, N07, J06 | Local deterministic proof; no external qualification implied |
| AF-18-09 | Must | N07, J06 | E03/E04 real retention/delete/restore pending |
| AF-18-10 | Must | N08, J06 | Local deterministic proof; no external qualification implied |
| AF-18-11 | Must | C02, N08, J06 | Local deterministic proof; no external qualification implied |
| AF-18-12 | Must | N07, N08, J06 | Local deterministic proof; no external qualification implied |
| AF-18-13 | Must | N02, J06 | Local deterministic proof; no external qualification implied |
| AF-18-14 | Must | B07, N07 | E02/E03 production reserve/overrun contract pending |
| R-001 | Must | Q01 | Local deterministic proof; no external qualification implied |
| R-002 | Must | Q01, Q02 | Local deterministic proof; no external qualification implied |
| R-003 | Must | Q02 | Local deterministic proof; no external qualification implied |
| R-004 | Must | B01, Q02 | Local deterministic proof; no external qualification implied |
| R-005 | Must | A06, Q02, Q06 | Local deterministic proof; no external qualification implied |
| R-006 | Must | Q05 | Local deterministic proof; no external qualification implied |
| R-007 | Must | Q05 | Independent current-candidate evidence audit |
| R-008 | Should | Q05 | Independent traceability review |
| R-009 | Should | J01, J02, J03, J04, J05, J06 | Local deterministic proof; no external qualification implied |
| R-010 | Must | Q03, Q09 | Unchanged controller regressions (Q09) |
| R-011 | Must | Q03, Q05, Q09 | Independent additive diff/raw/usage preservation audit |
| R-012 | Must | Q09 | Outside-sandbox controller GUI/Electron logs (Q09) |
| R-013 | Must | A05, Q04 | Local deterministic proof; no external qualification implied |
| R-014 | Must | A05, Q04 | Exact approval before future provider/credential/spend (E01/E02/E03) |
| R-015 | Must | Q04 | Exact approval before any shared/production deployment |
| R-016 | Must | Q04 | Exact approval before nonreproducible delete/overwrite |
| R-017 | Must | Q04 | Exact approval before real credentials/secrets/ACL/settings changes |
| R-018 | Must | Q04 | Exact approval before human messages/emails/posts |
| R-019 | Must | Q04 | Exact approval before history rewrite/branch delete/force push |
| R-020 | Must | C03, U10, Q04 | Local deterministic proof; no external qualification implied |
| R-021 | Must | C03, B08, A01, A06 | Local deterministic proof; no external qualification implied |
| R-022 | Must | Q05, Q06, Q09 | Controller results + independent reviews + applicable human judgment |
| R-023 | Must | Q01, Q07 | Dependency/license/security/update metadata review |
| R-024 | Must | Q05, Q07 | Independent data-flow/threat/recovery/rollback review |
| R-025 | Must | C01, P07, P12, U10, Q03, Q07 | Local deterministic proof; no external qualification implied |
| R-026 | Must | Q06 | Independent security/release blocker review |
| R-027 | Must | P02, Q08 | E01 supplier/conformance/comparable tasks pending |
| R-028 | Must | Q08 | E02 gateway billing/real top-up pending |
| R-029 | Must | Q08 | E03 runtime/resource/storage pending |
| R-030 | Must | Q08 | E04 full product/human/physical-device pending |
| R-031 | Must | P02, Q08 | E05 performance/economics pending |
| R-032 | Could | Q08 | Optional fixture absent or justified deterministic only |
| AF-02-19 | Must | P13 | Local deterministic proof; no external qualification implied |
| AF-02-20 | Must | A03 | Local deterministic proof; no external qualification implied |
| AF-06-26 | Must | C02, B04 | Local deterministic proof; no external qualification implied |
| AF-06-27 | Must | B03, U02, U03, U04, U06, N06 | Local deterministic proof; no external qualification implied |
| AF-06-28 | Must | U04, U05, U06, U07, A04 | Local deterministic proof; no external qualification implied |
| AF-18-15 | Must | U09, N06 | Local deterministic proof; no external qualification implied |
| R-033 | Should | Q05, J01, J04, J06 | Local deterministic proof; no external qualification implied |

Mandatory top-level case counts by suite: C=3, P=13, B=9, U=11, N=8, A=6, Q=9, J=6; total=65. Required named variants may produce more Node subtests, never fewer planned assertions. Build/check sabotage is confined to F-H copies; no accepted baseline or real credentials are altered.

## 7. External/human qualification gates — deliberately pending

These are future cases, not tests to run now and not skips in local suites. Local R-027–31 proof is Q08's truthful gate/claim validation. Each future case has a suite/level and a proposed command **to create only after an exact user decision and approved environment**. No real route/region/supplier/price/license is chosen here. Future command names are design placeholders and cannot enable paid calls from today's config.

| Case / suite / level | Preconditions and data | Steps | Expected result / evidence | Future command and decision |
| --- | --- | --- | --- | --- |
| E01 / external-provider / integration | Exact approved supplier/model/version/route/region/data policy, credential custody and maximum spend; controlled private tasks and comparable baseline conditions | Execute real modalities/dialects/tools/stream/context/cancel/usage/private-state/failover conformance plus comparable tasks; report failures/non-comparable pairings and total review/retry/revalidation costs | Probe-bound actual supplier qualification/expiry and task obligations; no hidden semantic/residency fallback; real quality/economic evidence scoped to exact environment | `node g1-model/scripts/check-provider.mjs --decision <approved-id>` (future); loop_ask approval and supplier/region/product human decision first |
| E02 / external-billing / integration | Approved gateway edition/license, tariffs/delayed-metering/overrun/top-up and custody/rotation terms, billing account, real limited budget | Correlate real request attempts, delayed/unknown usage and cancellations with gateway export and invoices; contest aggregate budget; rotate only when authorized; real top-up recovery | Document actual discrepancies/unmatched usage/rounding/overrun, once-only attribution and validated commercial limits; cannot infer invoice equivalence from byte fixtures | `node g1-model/scripts/check-billing.mjs --decision <approved-id>` (future); exact approval and commercial/billing decision first |
| E03 / external-runtime / security | Approved host/kernel/image/region/egress/mount/resource/retention profiles and tariffs; controlled actual workloads | Execute no-VM Ask, real service isolation/egress, computer preflight/provision/wake/contention/idle suspend, cold-start and retained storage/network accounting after Stop; controlled restore/deletion if separately authorized | Actual resource boundaries and cost/latency distributions match claimed profile; unknown termination/retention explicit; no counterfeit free idle/storage | `node g1-model/scripts/check-runtime.mjs --decision <approved-id>` (future cross-increment qualification); F05/F06 ownership and exact resource/settings/deletion approvals |
| E04 / external-product-human / e2e | Separate approved broader product scope, representative humans and physical devices, formal SSO/signing/distribution and retention environments; approved messages if recruiting | Observe moderated audience/approval/cost/next-action comprehension and device/sleep journeys; formal SSO, delete/restore, full product modules under their own acceptance | Independent human and actual environment results without invented ratings/signatures; UX-11 local journey is not whole-G1 qualification | `node g1-clients/scripts/check-product-journeys.mjs --decision <approved-id>` (future F07/broader owner command); human study and environment scope decision, no messages now |
| E05 / external-benchmark / performance | Approved workload/model/tools/permissions/start environment/total budget/host/topology; sufficient controlled samples and paid decision if applicable | Measure warm/cold/queue/first-output/end-to-end/Stop distributions with failures/cancellations/unknowns and total verified-task costs; state confidence/limitations | Report observed distributions and costs, not assumed SLA/leadership/savings; independent benchmark review | `node g1-model/scripts/check-benchmark.mjs --decision <approved-id>` (future); separate benchmark/environment/spend decision |

Q04–Q08 include **mandatory independent reviewer audits** of actual actions, evidence, ownership, licenses, unresolved findings and local-versus-external claims. They can be supported by machine validation but cannot be completed by author self-certification. Q09 requires actual controller outside-sandbox environment. Product acceptance and any real human judgment remain controller/human stages; no need to contact people or request external approvals during deterministic development. New package schemas/roles are applied only in owned reproducible fixtures, never shared ACLs.

## 8. Noncircular qualification execution and optional carrier

Qualification has two explicit phases. During each aggregate run, Q05 validates delivered documents, schema/traceability, preservation and truthful pending/observed statuses; Q06 executes the qualification gate against owned synthetic finding records; Q09 validates unchanged regression definitions and receipt-binding refusal. These tests can run before this run's controller receipt exists. F-H test data must be labeled test data, never saved as an actual review/check result. Missing current controller/reviewer receipt must remain pending, and any claim of acceptance without it fails.

After controller commands complete, Q04–Q09 require independent audits of actual action logs, findings, raw evidence and current-candidate results, and Q09 requires the actual unchanged outside-sandbox regressions. Final acceptance/evidence cannot pass until those observed gates are complete. A pending independent review is not a Node skip; it is an explicit unfulfilled later workflow gate. No local checker calls its own controller acceptance recursively, edits controller state or manufactures a result. A checker-running candidate can succeed at local behavior while overall product acceptance remains pending.

### Carrier, resource limits and evidence delivery

If implementation ships an HTTP operator/service carrier, extend A01/A05/A06/J cases with actual missing/invalid/expired bearer auth, forged actor/payer, exact Host/Origin (including loopback aliases), method/content-type/body-size bounds, unknown JSON fields, request expiry/revision and arbitrary URL/path/SQL negatives. Reject before sensitive writes/disclosure; supported authenticated counterpart succeeds. If no carrier ships, document absence; actual adapter HTTP transport still requires loopback-only bounded closed protocol and original-owner binding. A transport choice cannot remove late current-authority tests.

Limit each local race to8 contenders and ancestry64. Reserve observer/authority capacity independently. Every child/listener/container is owner-marked and reaped; teardown errors fail the suite and preserve diagnostics. Missing cached PG/process census/loopback capability fails runtime preflight, never skips or selects SQLite/memory. Test controlled delays outside the bounded fence-held acceptance; inference completion does not hold Stop indefinitely. Actual worst observed acceptance/Stop waits are diagnostic, no 2-second/production guarantee from this suite.

Evidence to produce during development/acceptance: complete controller stdout/stderr with byte counts/SHA256; candidate/source/dependency-lock/check-definition/environment/profile/qualification identities; suite/test/variant manifest, actual executed counts/fail/skip/TODO; per-operation observed request/accept/lookup/receipt/cost/reserve/generation records; actual contention/blocker and crash/restart/cleanup measurements; finite forbidden-outcome totals; protected-file/raw evidence preservation and migration compatibility; required independent findings/reviews; remaining E01–E05 and human gates. Keep synthetic test credentials, prompt bodies and private reasoning out of exported evidence. Preserve failed runs and cumulative historical usage rather than overwriting files or inventing zero host costs.

The later `docs/planning/g1-f04-plan.md` must order implementation/tester tasks with `covers`, explicit dependencies and real slice/check commands. The later `docs/evidence/g1-f04-acceptance.md` must map AF-02/AF-06/AF-18 and UX-11 local observations to exact current-candidate controller results and state all external obligations. These two paths are future implementation deliverables, not evidence created/passed at test design.

## 9. Exit and handoff

Documentation exit gate: all100 reviewed requirements mapped to named cases; every case has suite, one allowed level, preconditions, steps, falsifiable expected result, data and environment. Negative, exact-boundary, actual contention and recreated-process variants are explicit. Check commands and mandatory suite manifests are fixed before production code. External/human cases and no-approval local scope remain distinct.

Submit this document with `loop_stage_done(stage="test_design", path="docs/loop/agent-fabric-g1-f04-model-finops/test-plan.md")`, then record handoff. Next stage is planning, not a behavioral pass. Primary traps: no receipt is not non-acceptance; durable claim is not restart dispatch permission; Stop does not erase cost; child/team allowance is shared without data scope; overrun must not weaken accepted ledger CHECKs; Auto absent a choice and exact manual pins are separate cases; controller GUI regressions run outside sandbox; artifact tests cannot manufacture independent/human acceptance.
