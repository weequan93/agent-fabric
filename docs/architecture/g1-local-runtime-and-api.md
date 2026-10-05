# G1-local runtime and API

Implementation contract for the user-approved local subbatch, 2026-10-05. Sources: `.loop/spec.md`, G0 native-engine/record-authority/interface-registry, and actual G0 parsers/reducers. This document is architecture, not deployment qualification or independent acceptance. Full G1 remote Linux, PostgreSQL/RLS, Temporal, SSO, supplier billing and physical-device obligations remain pending.

## Independent build and owned engine

All new core source/tests live in `g1-local/`; its package and pnpm lock are independent. Install with `pnpm --dir g1-local --ignore-workspace install --offline --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store`; run `node g1-local/scripts/build.mjs`. TypeScript 5.9.3 and @types/node22.18.6 match the existing tested toolchain. Build output is `g1-local/node_modules/.cache/g1-build`; rootDir is the project root so imports of unchanged G0 pure contracts/reducers compile into the same disposable output. Local compiled tests appear under `g1-local/tests` inside that output. Original source, lock, G0 tests/checkers, plans and evidence remain unchanged. Each Web/Electron/mobile package owns its separate package/lock/build; the root build must not discover their dependencies.

Use G0 `canonicalDigest`, scope/envelope validation, Run transitions and pure replay as unchanged dependencies. Do not serialize private Maps, monkey-patch G0 classes, or present recreated Map state as a database transaction. `session-service.ts` is the new durable native controller applying original pure semantics. Models provide text only; the service owns Task/Run, authority, approvals, fences, receipt verification and completion. There is no competitor harness or workstation-worker enrollment.

## Local persistence and recovery

Use Node `node:sqlite` DatabaseSync for an actual file-backed local test database, not a JSON file that is called durable. A read-only import probe on the supplied Node22.22.3 returned DatabaseSync=function and ExperimentalWarning. [Node22.22.3 documentation](https://nodejs.org/download/release/v22.22.3/docs/api/sqlite.html) confirms the experimental synchronous API, file databases, prepared statements and extension controls. The experiment status is a recorded dependency limitation, not a PostgreSQL qualification claim.

Single service process and small synthetic workloads: SQLite foreign keys, bounded busy timeout, explicit transactions and prepared bindings; use WAL and synchronous=FULL, and inspect actual PRAGMA results. Extension loading stays disabled. `LocalStorePort.transaction` is synchronous, rejects thenables, commits owner mutation, event, dedup response, reservation and outbox together; throw rolls back. All mutating APIs revalidate current authority inside that transaction. A versioned LocalState aggregate may be stored atomically as a JSON record initially; application validators must then enforce every relationship and counter, since such storage is not SQL-level foreign-key enforcement. Do not claim RLS, separate OS-user isolation, HA or production encryption. State directory/files are server-selected, owner-only and outside public/static roots; no API accepts a filesystem path or SQL.

Model/effect execution has a durable intent before invocation. Keep a separate durable synthetic-executor receipt ledger keyed by scope+operationId with the input digest; it models a downstream transaction boundary. The main DB settlement is a second transaction. Same identity/digest deduplicates; changed input conflicts. A process death between executor commit and settlement leaves the original operation unknown. `lookup` finds its receipt or proves absent-safe; no receipt/no proof means waiting, retaining the reservation. A model failure/cancellation does not mean zero synthetic usage. Unknown model reservations and effects block continuation. Pure event replay invokes no model/effect callback. Receipt reconciliation is a deliberate service action, never a client-supplied outcome.

Startup order: load schema/current identities/grants/revocations/tombstones; validate local state and committed artifacts; rebuild permitted projections; change recovered dispatching/invoked intents to unknown; fence replacement work; expose the preserved Task and resolver. Reconnect and replay do not auto-run pending jobs, resend unsent drafts, mint approvals or refund unknown usage. Only an authorized explicit command can reconcile/resume. All terminal attempts stay immutable; retry requires a new Run identity. Before a synthetic artifact commit, validate bytes/digest and scoped manifest, then commit the version with its event/outbox. Partial/staged objects never appear as committed results. Retention/deletion tombstones precede rehydration.

## Authentication, authority and current Space

`POST /v1/sessions/login` accepts `{username,password}` for server-seeded synthetic accounts and returns an opaque random expiring token. A username maps to a fixed server role, never a caller role field. operator and approver have separate test credentials/principals. Do not return password hashes or full store snapshots. This is explicitly local-test authentication, not SSO. Token+current identity/membership is checked on every read, command, event and artifact result. Logout/revoke is durable. Browser/native SDK tokens stay in memory; no hardcoded bearer token in a renderer bundle.

Actor/tenant/payer/grants and source audiences are derived by the service. `spaceId` selects a candidate Space at admission; the service stamps immutable ScopeRef. A later UI CurrentSpace switch cannot move that Task, its source, payer, queued commands or effects. Cross-Space source use needs current source readability and both source/destination sharing grants; source IDs themselves grant nothing. Group tasks require an explicit authorized trigger. Views omit forbidden tasks and source content; membership revoke invalidates cached view/event publication. An approver must be currently authorized and different from the executing operator; a model or operator cannot mint approval. The stored approval binds the exact operation, target, parameters/artifact digest, plan/requirements revision, policy and expiry. `approve{planVersion}` selects that server-generated immutable request, not a blanket future permission. Changed plan/artifact/policy/grants or expiry reject before executor invocation.

## Wire contract

Types and runtime request parsers are exported by `g1-local/src/contracts.ts`; errors by `errors.ts`. All body schemas are closed and bounded. `LOCAL_POLICY` is fixed: modelMode=deterministic-test, effectMode=synthetic-only, paidCallsAllowed=false, remoteAllowed=false. `validateLocalPolicy({})` yields this default; supplier/remote fields or enabling switches reject. Environment credentials cannot enable a route; no external provider import/fallback belongs in this service. All model/effect/result views carry truthful test-mode labels. Synthetic units have no currency/real billing qualification.

| HTTP | Request / response | Semantics |
|---|---|---|
| GET `/v1/health` | HealthResponse | Local profile and store label; never implies remote qualification |
| POST `/v1/sessions/login` | LoginRequest → LoginResponse | Fixed test identity; no actor/role/payer accepted |
| DELETE `/v1/sessions/current` | Bearer → empty success | Durable logout |
| GET `/v1/me`, `/v1/spaces` | Bearer → identity / allowed spaces | Current grants, filtered fields |
| POST `/v1/tasks` | `{spaceId,title,input,commandId,intent?,sourceIds?,explicitTrigger?}` → CommandResponse | Server IDs/scope/owner/payer; default intent ask; ask/plan no computer |
| GET `/v1/tasks?spaceId=…` | Bearer → TaskView[] | Current authorized Space only |
| GET `/v1/tasks/:taskId` | Bearer → TaskView | Committed state, versions, waiting, mode, cursor |
| POST `/v1/tasks/:taskId/commands` | TaskCommand → CommandResponse | Accepted/rejected/requires-review distinct from completion |
| GET `/v1/tasks/:taskId/events` | optional streamId/sequence/generation → TaskSync | Ordered delta or authoritative snapshot |
| GET `/v1/tasks/:taskId/result` | Bearer → committed LocalArtifact | Current grants/tombstones, bounded synthetic content, no local file path |

`commandId` is a client dedup key scoped to authenticated actor+immutable Space, not an authority record. Same key and canonical payload returns the same receipt after reauthorization; changed payload conflicts. Lost HTTP acknowledgement queries the original Task/key rather than creating another operation. JSON errors use `{schemaVersion:1,error:{code,message,nextAction,retryable}}`; unexpected SQL/exception details remain local. 400 invalid input, 403 authority/policy, 409 revision/approval/unknown conflicts, 503 missing authority/store. Ordinary expectedRevision is checked when supplied; service-generated current revisions and dispatch guards remain mandatory even when it is absent.

Commands share `kind,commandId,expectedRevision?` and exactly these additional fields:

* reviseTask: `input`; at an inactive/waiting boundary create new requirements/plan revision, invalidate affected approvals.
* startRun: `planVersion`; current plan and exact approval required for an act; terminal attempts never reopen.
* approve: `planVersion`; separate approver approves only that existing exact request.
* stop: `scope:'task'|'run',runId?`; run scope requires runId, task scope forbids it. Current authority and immutable target decide admission; stale progress revision is ignored. Fence+dedup receipt persist before any await. New dispatch/publish is blocked; already-in-flight unknown remains visible. processesTerminated=null truthfully means this profile has no remote/workstation process to terminate.
* reconcile: `operationId`; trusted original-owner lookup, not caller outcome; unknown remains unknown when no safe receipt exists.

TaskSync cursor binds streamId, sequence and generation. Duplicate events are idempotent; gap/wrong stream/obsolete generation requests a current authorized snapshot, never a replayed action. SDK creates a new local draft context on CurrentSpace changes; unsent drafts stay local and reconnect never auto-submits them. Do not retain forbidden cached content after an authorization failure.

## HTTP, SDK and clients

Use node:http bound to loopback only, fixed expected Host and an exact CORS allowlist for the actual local web origin; reject Origin:null and arbitrary origin reflection. Bounded body size/content-type/methods, JSON schema and bearer token validation precede service dispatch. Loopback alone is not authentication or OS isolation. No shell, filesystem arbitrary read, fetch-to-user-URL, SSH, provider gateway or paid-route enable endpoint. Synthetic artifact targets use server-generated synthetic identifiers, not a URL/path accepted from the user.

`client.ts` implements LocalClientPort and sends only this wire contract. Web, sandboxed Electron and Android share the same HTTP owner. Android emulator uses explicit adb reverse to the same loopback port instead of binding the server to 0.0.0.0. Electron renderer has no Node integration, context isolation and sandbox; IPC/navigation/preview are allowlisted. Browser viewport is not native Android evidence. Client build success, localhost demo and synthetic receipts never imply remote Act, SSO, physical-phone, true desktop sleep, signing or deployment qualification.

## Package handoff and meaningful checks

Accepted sequence: baseline contracts/build → store/identity/model/session/synthetic executor → HTTP/CLI/SDK → Web → Electron and Android → integration/fault/UI/load verification → registered current-candidate independent evaluation. Backend files are `store.ts`, `identity.ts`, `models.ts`, `session-service.ts`, `synthetic-effects.ts`; HTTP files are `http.ts`, `cli.ts`, `client.ts`. Tester owns the original local definition, check runner and contract tests. This architecture assignment does not author its own protected pass.

Required meaningful checks: actual file DB close/reopen and child-process crash before/after commit; transaction rollback and command lost-ack dedup; executor receipt commit before main settle and lookup without blind replay; unknown model usage retains budget and conservation; pure replay callback counters zero; unauthorized/cross-Space/revoked sources do not reach model; independent approval, stale plan/expiry deny before effects; stale-view Stop persists fence and old-generation continuation denies; real HTTP SDK flow and events gap/reconnect; external/paid/remote config rejection even when supplier env vars are supplied; result partial/path boundary; operator/approver/viewer current identities. New checks bind the current candidate and actual local environment. Unchanged full G0 regression/protected102 branches must still pass. Formal UI, real runtime and billing checks not executed remain pending; no invented evidence.
