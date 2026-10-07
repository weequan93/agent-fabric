# G1-F03 recovery increment

This additive increment follows [roadmap](roadmap.md), the F03 dependency in
[foundations plan](g1-foundations-plan.md), [remaining ledger](g1-remaining-ledger.csv)
and the [master specification v1.1](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md).
It builds on the current F02 working-tree repair described in
[F02 evidence](../evidence/g1-f02-acceptance.md); that evidence does not establish
formal enterprise identity or whole-G1 qualification.

## Record ownership and frozen boundaries

Temporal owns workflow history and orchestration, not planning or policy. The
controller owns task semantics; PostgreSQL owns current authority, Task/Run,
session checkpoints, operations, command receipts and outbox records. Projections
and notifications cannot authorize effects. Artifact/check references bind exact
versions and digests. Large payloads remain outside workflow history. All attempts
pin engine, behavior, schema, environment and dependency lock versions.

The initial `g1-recovery/src/contracts.ts` decoders require every field, reject
unknown fields, copy/freeze nested bindings and distinguish Task, Run, session,
effect, command, generation, wait, artifact, check, delivery and notification.
These are internal records, not authenticated grants. Subsequent trusted services
must reuse F01/F02 scope provenance and locked current authority checks rather
than accepting a cast, worker message or client-supplied actor as authority.

The deterministic native session adapter is **test-only**. It proposes complete
typed actions, cannot issue approvals/check receipts or dispatch tools, and has no
model provider transport. It accepts recorded transcripts for pure replay without
synthetic turns, model requests or write calls. A terminal Run never resumes;
explicit authorized retries create new attempts. A Stop-task blocks retries until
an explicit current-authority retry; Stop-run affects its immutable attempt.
Unknown effects enter reconciliation, never an automatic write retry. A proven
not-applied effect is terminal in this contract; any later execution requires a
new, explicitly authorized operation.

## Durable authority slice

Migration4 uses a separate `fabric_recovery_migrations` ledger, checks pinned
F01 versions/digests1/2 and F02 version/digest3, and rolls back DDL/ledger together.
Recovery-owned runs, sessions, leases, operations, result references, immutable
command receipts and immutable outbox events use forced RLS and original trusted
service assertions. Reciprocal deferred keys require each receipt and its exact
actor/key/run/outbox event to commit together. Completion changes only the outbox
completion timestamp. Client/untrusted-worker roles receive no SQL grants; the native adapter receives
no connection. The Temporal process hosts a trusted controller activity boundary
with its controller-role pool; OS separation remains F06 qualification. Tests
try actual SQL/GUC spoofing with non-owner worker, client and IdP logins.

`RecoveryRepository` composes unchanged `PostgresUnitOfWork` and
`AuthenticatedUnitOfWork`. New scopes use the real F02 token verifier and current
PostgreSQL identity lookup with a separate synthetic IdP process (actual local
RS256/JWKS/PKCE, no enterprise identity claim). Current session, membership,
actor/payer, lifecycle, grants and policy remain transaction-locked. Reconstructed
snapshots are data; continuation checks current authority, exact run binding,
lease generation/expiry, original session and a live backed reservation again.
The read-only budget helper cannot mint/top up/resettle allowances; its synthetic
fixture backing is not qualified billing or the F04 budget controller. This slice
permits one external operation per reservation, refusing duplicate allocation.

External preparation composes F02 exact approval consumption inside the **same**
transaction as operation/receipt/outbox writes. It checks Act intent, target,
normalized arguments, artifact version, audience, policy, independent synthetic
approval parties, limits, generation, lease and remaining reservation. It checks
all participant sessions/tokens, approval/command/lease expiry again after SQL
waits and all writes. Preparation does not dispatch an external effect. Artifact
bytes, independent checks and final delivery semantics belong to the later result
slice; persisted summary/digest references do not establish those qualifications.

An original command-key advisory lock serializes mutation and lookup through
COMMIT/ROLLBACK. Lost durable COMMIT acknowledgement yields `UNKNOWN_COMMIT`;
lookup returns committed/absent-safe, or unknown on timeout. Neither lookup nor
checkpoint reconstruction calls an effect/model/command mutator. Different keys
still use run revision locks to prevent lost checkpoints. The Temporal slice below exercises local worker death and replacement generation;
external success/ACK loss remains the next slice.

## Temporal/native recreation slice

Free local CLI1.4.1 embeds Server1.28.0 and is pinned by upstream archive and
extracted binary SHA256 for Darwin arm64. Explicit setup populates the cache;
acceptance never downloads, uses an in-memory substitute or skips readiness.
SDK1.24.0 is frozen, with a recorded declaration-only schedule typing patch using
the upstream `WithWorkflowArgs` helper. All strict compiler flags, including
exact-optional and library declaration checking, stay enabled. Runtime SDK code
is unchanged. The local dev service is not a production Temporal deployment.

`nativeConversation` contains deterministic activity/signal control only. History
contains opaque Task/Run/session and checkpoint digest references. Trusted
controller-hosted activities obtain fresh real F02 scopes and current locked
PostgreSQL authority for each turn. The native test adapter receives no database,
credentials or tool executor. Its proposal and answer events commit atomically
with the session cursor, run revision, immutable receipt and outbox. Migration5
adds forced-RLS append-only session events without changing migration4. Stable
workflow IDs, reject-duplicate reuse and a checked admission memo reconcile lost
start ACKs and concurrent outbox delivery without creating another workflow.
Temporal completion here leaves the Run **verifying**, with artifact acceptance,
result, delivery and notification still separate work.

The mandatory fixture observes owned service/worker PIDs and commands, persists
Temporal history to its own SQLite file, closes the actual submitting connection,
kills the observed worker only after PostgreSQL and Temporal acknowledge the first
turn, restarts the service from disk, advances the locked worker generation and
launches another native process with no session cache. That process restores the
same Task/Run/session and recorded first response, calling the synthetic model
only for the missing second turn. Original-key duplicate continuation from the
old generation is also refused before model execution. Real recreated processes
recheck revoked write membership, actual lease expiry and an active reservation
with exhausted capacity, with exact failure assertions and zero missing-turn model
calls. Current budget backing here does not qualify provider billing or charging.

Full actual histories and measured process/model/replay streams are retained in
unique ignored `node_modules/.cache/temporal-evidence/<owner>/` directories,
with checked copies/hashes retained under `g1-recovery/evidence/temporal/<owner>/`. SDK history replay runs
in another process with no live service/DB connection or activities; model and
checkpoint counters stay zero and all recovery-table bytes remain unchanged.
A timer-first incompatible workflow must fail with `DeterminismViolationError`.
There is no external effect executor in this conversation slice; real external
write/ACK-loss instrumentation remains mandatory in the next slice. Native
execution children are observed separately from the test runner and infrastructure;
no competitor harness or ordinary-conversation VM is launched. Ownership-checked
PID cleanup, readiness and bounded exits fail closed; the sandbox-denied census
must run through the controller outside the sandbox.

Local process recovery does not qualify remote Linux isolation, credential/egress
containment, cloud failover/backup, model-provider crash settlement or production
Temporal topology. Native activities have one attempt; arbitrary model/effect
retries cannot be inferred safe from this local deterministic fixture.

## Durable local effect executor and reconciliation

Migration6 adds forced-RLS, immutable effect-phase journals and prevents changes
to record bindings as well as SQL binding columns. Migrations4/5 stay unchanged.
Each phase advances the Run revision with an atomic original-operation phase
receipt/outbox. These phase receipts take the same original-key advisory lock as
`lookupCommand`, so a pending local commit cannot appear safely absent.

The independently spawned loopback HTTP downstream has no controller credentials.
Its fsynced append journal is its own receipt/counter authority; a replacement
service derives both from those committed records. Complete arguments and
artifact bytes must match persisted digests. The approved normalized arguments
include the artifact digest, so replacing both bytes and their proposed digest
cannot preserve an earlier approval. Concurrent identical POSTs yield one
write; changed target, argument, artifact or operation intent is refused.
This is an explicit synthetic adapter, never an arbitrary HTTP connector.

Before any POST, the controller commits the original immutable operation as
**unknown** (logical prepared→dispatched→unknown) and sets the Run reconciling.
One claimant may send; no unknown operation is resent, even if a read-only lookup
reports absence. Current F02 scope, requester/approver/executor identity, source
audience, target/version/digest, policy, requirement/cancellation generation,
lease and backed reservation remain locked across bounded I/O and are rechecked
at the end. A recreated generation may reconcile the original older binding but
cannot dispatch it. Remaining reservations stay unsettled; synthetic downstream
receipts do not qualify provider billing settlement.

The real effect workflow has one activity attempt. Tests kill generation1 after
the downstream fsynced commit and before its HTTP ACK/local settlement. A distinct
empty-cache generation2 reads the original operation, rechecks current authority,
and uses only GET status lookup. A matching receipt permits confirmed→paused;
a separate explicit workflow continuation resumes the Run before any missing
native model turn. Native model checkpoints reject every unresolved effect before
both new execution and original-key duplicate return.

Outage keeps lookup as the safe next action. Ambiguity/absence, unsupported lookup
or dedup and changed receipt target/digest persist a reconciliation detail requiring
human/domain recovery. The immutable binding continues to record the originally
declared adapter strategy; current unresolved detail and command response supply
the stricter next action. Expired/revoked authority leaves the prior unknown or
reconciling record and refuses settlement/continuation. No timeout, activity retry,
capability restoration or client reconnect authorizes another POST.

`check-slice.mjs effects` (alias: `unknown-effects`) runs the strict offline build
and real PostgreSQL/Temporal/process/HTTP suite through the controller. It covers
16 simultaneous downstream deliveries, concurrent controller claims, original-key
preparation/dispatch/settlement COMMIT ACK loss, pending-commit lookup, lease expiry
during status lookup, 13 actual crash/recreation outcomes, and exported successful
and unresolved histories replayed without registered activities or live credentials.
Replay leaves downstream counters and every recovery SQL table unchanged, with
zero measured model/checkpoint/write calls. Raw histories, worker records and the
downstream journal are generated in unique ignored cache roots and retained with
original paths/byte hashes in the effects evidence index. Owned resources are
censused/reaped and fixture data removed after checks.

Qualification covers this disposable local adapter and process-crash window only.
Real provider dedup/status guarantees, irreversible operations, remote networks,
power-loss journal integrity, Linux isolation, production Temporal fleet/backup,
human reconciliation judgment and real settlement remain unqualified.

## Stop and resource barrier slice

Migration7 adds forced-RLS task retry controls, immutable Run/resource enrollment,
immutable scoped command receipts with reciprocal deferred event keys, mutable
resource ownership and an immutable-binding submitted/settled/unknown mutation
journal. Migrations4–6 and accepted F01/F02 sources are unchanged. The online
`/commands` and `/lookup` boundaries require real F02 verification and current
transaction-locked authority. Stop binds immutable Task/Run and current
`task:write` control authority without a progress revision. Actor-scoped duplicate
keys return the original receipt; changed payloads conflict. Stop-run advances
only its attempt's worker fence and revokes its lease. Stop-task additionally
advances the Task cancellation generation and blocks admission until explicit
current-authority retry; it never revives the stopped attempt.

Every installed-fence controller checkpoint, native publication, replacement and
approved effect phase acquires a conservative Space mutation barrier before Run
locks. All enrolled resource paths additionally require current agent ownership.
This local implementation serializes mutable work within a Space; it does not
claim a disjoint-work scheduler. Older isolated migration4–6 slice fixtures retain
their original ledger profile; they do not expose the new online fence service or
qualify resource takeover. Migration7 is mandatory for the online service and
all new resource drivers; missing driver/schema capability fails closed.

Takeover invalidates prepared operations, old worker/resource generations and
execution leases across all enrolled attempts before committing a human lease.
The trusted driver must observe its actual resource processes quiescent under the
barrier; missing or failed observation denies the lease. The response separates
accepted, dispatch fenced, observed resource quiescence, process termination still
pending, and submitted/unknown operation IDs. A Stop does not undo a committed
HTTP effect or claim process termination. Human disconnect/lease expiry remains
paused, including after repository recreation. Return requires the holder's
current authority, expected resource generation, a generation-bound fresh trusted
observation, filesystem/base reread, no unresolved submitted/unknown operations,
and live execution leases. Prior native cursor and finished/verifying states are
restored rather than reopening a finished answer.

Actual loopback API/SDK-style HTTP, owned one-shot shell and filesystem drivers
are tested through a trusted **synthetic local callback boundary**; callbacks,
resource observation and process handles are never exposed through HTTP. Resource
mutation intent commits before I/O; lost local submission ACK causes zero I/O and
retains submitted uncertainty. Callback failure after a real write persists
unknown and prohibits automatic return/retry. Approved external effects still
use the separate exact-approval/effect protocol, with only its loopback API
adapter admitted. GUI, browser and other external/native driver paths are closed
before any callback or approval consumption. A real resource driver registry,
OS isolation, hostile bypass containment, interactive GUI/native/browser controls,
remote process termination and physical mobile transport remain later environment
qualification. Fresh observation can deny changed human files; it does not supply
human/domain judgment for an irreversible unknown effect.

## Bounded durable Dispatch slice

Migration8 appends forced-RLS schedules, immutable occurrence bindings and
immutable paired command receipts/events; migrations4–7 and F01/F02 stay unchanged.
Schedules pin an existing immutable Task/Run/session continuation (sequence1 or2),
or one already exactly approved external operation. Dispatch queues the same
controller work; it creates no alternate agent executor and cannot grant arbitrary
future writes. Creating fresh recurring Tasks/attempts, unattended credential
renewal and enterprise connector/event lifecycle remain separate qualification.

Every template includes an explicit IANA timezone, bounded interval or daily
recurrence, gap-skip and earlier/later-fold semantics, current owner/service
identity, policy, connection identity/expiry, input digest, delivery audience,
cost/runtime/wait limits, overlap exclusion and skip/coalesce/catch-up policy.
Preview uses actual Node Intl timezone data and writes nothing. The database clock
fires occurrences; UTC instants and incoming event IDs produce stable identities.
The complete bounded scan fails closed on more than1000 occurrences or a horizon
above366 days, retaining cursor and a Clarify wait instead of truncating backlog.

Timer recreation reads the persisted cursor and occurrence states. Concurrent
commands and event/timer fires deduplicate; concurrent claims produce one ticket.
Overlap exclusion spans schedules targeting the same Run. Missed occurrences are
retained as skipped/coalesced or await exact, expiring human catch-up consent.
External writes always additionally require the original F02 exact approval and
effect protocol. Consent pins its actual approving identity/session and policy,
not merely a boolean. Admission rechecks authority, expiry, original task/run,
fences, current leases/reservations, unknown effects and original approval parties,
audience and target, including after SQL waits.

Input, approval, budget, resource, connection and permission waits persist reason,
owner, deadline and permitted next action. Owner or connection loss pauses the
schedule; a current authenticated observer can persist that pause even after owner
verification fails. Renewing the local synthetic connection requires an explicit
current-owner resume and cannot resend an unknown effect. Restoring a prerequisite
is an authenticated controller action; it never creates budget or approvals.

The independently spawned local timer/controller process reuses the existing
native activity/checkpoint boundary. Each native transaction checks the scheduled
runtime deadline before and after work; late results roll back, while timeout
retains submitted uncertainty. This is not OS termination or provider-cost
settlement. Crash after durable admission with no checkpoint requires read-only
recovery, actual worker-generation fencing and explicit authorized read-only
resume. Crash after checkpoint recovers its original record with zero extra model
calls. Unknown external effects stay reconciling; the existing GET-only original
operation protocol establishes confirmation without another POST. The fixture
uses a real fsynced independent downstream and actual process recreation.

This slice qualifies only local bounded native continuation/effect admission,
synthetic identity/connection/budget and actual owned PG/process/HTTP behavior.
Automatic fresh recurring job materialization, production service credentials,
webhook origin/replay-signature verification, enterprise connection/JML lifecycle,
timezone database upgrades, distributed fairness/quotas, cloud timer/Temporal fleet
recovery, physical clients, real provider semantics and hard OS containment are
explicitly unqualified. The child timer does not itself implement an external
write driver; exact scheduled-effect tests invoke the existing qualified local
effect executor and reconcile protocol through the controller boundary.

## Requirement-to-implementation and test map

The cases below are required work, not claims of completed qualification. The
contracts slice covers validation and state boundaries; race and process recovery
claims require the later real local integration suites.

| Requirement / master sections | Implementation | Positive and negative cases | Race and recovery cases | Qualification limit |
| --- | --- | --- | --- | --- |
| AF-01 / 2; 7–10 | Native typed session, controller gates, immutable context/profile/version binding; no competitor executor | Deterministic native turn; refuse foreign scope, malformed/partial proposal, fake grant and unsupported adapter; conversation work needs no Space VM | Actual owned native worker process, assert executable/children; pure history replay has zero model/write invocations; recreate adapter at durable cursor | Deterministic model transport only; real model/region/profile conformance is F04, remote service-worker containment F06 |
| AF-05 / 2; 8; 12 | Durable PostgreSQL checkpoint/outbox + Temporal workflow; replaceable fenced worker | Client disconnect preserves accepted work; committed state available to new worker; refuse stale/unauthorized restore | Kill actual worker, create a distinct process, recover acknowledged Task/Run/session/operations; duplicate continuation/outbox race; preserve original evidence and generation | Local orchestration/process/PG recovery only; remote disconnect, qualified Linux image, cloud outage/backup/restore are later environments |
| AF-09 / 2; 20 | Native Dispatch command receipts, bounded waits, schedule timezone/expiry/owner and occurrence IDs | Duplicate commands yield one identity; approval/input/budget waits expose resolver/expiry; refuse stale ordinary commands, expired or revoked schedule | Concurrent duplicate submissions and overlap; DST occurrence identity; missed-run skip/coalesce/catch-up policy; worker recreation cannot replay stale destructive schedule effects | Local synthetic authority/effects and real local scheduling; enterprise webhook/connector/JML and full scheduling breadth remain G2 |
| AF-14 / 2; 8; 28 | Exact effect ledger before dispatch, downstream idempotency/status lookup, unknown reconciliation | Lost success ACK becomes unknown; recover original receipt; refuse direct unknown-to-dispatch/failed, changed target/key or unsafe retry; require human reconciliation where lookup cannot prove outcome | External local service commits then worker dies before ACK; replacement looks up original operation; concurrent dedup; replay has zero writes/model calls; ambiguous absence stays blocked | Real local external-service crash windows only; real provider semantics, irreversible APIs, remote failures and disaster restore need separate qualification |
| AF-17 / 2; 8; 19–20 | Separate Task/attempt/outcome, versioned draft/check/acceptance and linked DeliveryOperation | Draft ready with exact checks succeeds for draft obligation; publish obligation waits for confirmed approved delivery; reject stale/cross-Space checks, mismatched artifact/delivery, terminal resurrection | Concurrent draft/version or delivery update conflict; durable restart retains partial/failed/unknown result and original receipts | Internal local artifact/check/delivery behavior; independent verifier identity, full design editor/preview, physical clients and real publication are later qualification |
| AF-19 / 2; 6; 21; 26 | Monotonic Stop/cancellation/worker/resource generations and mutation barrier for all registered conflicting paths | Stale-view Stop succeeds under fresh stop grant; refuse old generation, revoked authority and conflicting mutation; distinguish dispatch fenced from termination | Both Stop/dispatch race orders; API/SDK/shell/filesystem/browser/GUI broker paths; in-flight acknowledged before takeover; replacement generation; disconnect/lease expiry never auto-resumes | Local broker/path quiescence only; OS enforcement, hostile bypass and real GUI/resource termination require F06/G3 environments |
| UX-08 / 31; 6; 8; 26 | Stop command excludes progress precondition; stable idempotency receipt with fencing, termination and uncertainty fields | Stale progress does not reject Stop; repeated tap returns one generation advance; unauthorized Stop fails; offline request remains not delivered | Online local Stop against live worker and in-flight local effect; current authority revoked during race; uncertain external outcome remains visible after restart | Local API/worker semantics; physical phone/offline transport and pilot Stop timing are F07, not an SLA |
| UX-18 / 31; 8; 20 | Minimal notification outbox/hint with independent delivery state and authorized result fetch | Push failure preserves successful Task/artifact/check and retrievable result; notification success cannot conceal failed Task; deny unauthorized/cross-Space fetch | Failed/unknown push retry and duplicate delivery concurrent with result fetch; recreate worker retains result and notification status | Local synthetic notification endpoint only; APNs/FCM/email/channels, real people, physical device delivery and provider billing are unqualified |

## Sequential work and bounded checks

| Task | Concrete outcome | Development check |
| --- | --- | --- |
| f03-contracts | Frozen decoders, deterministic adapter, snapshot and strict gate scaffold | `node g1-recovery/scripts/build.mjs`; `node g1-recovery/scripts/check-slice.mjs contracts` |
| f03-durable-authority | Additive migrations/repository with current F02 scopes and atomic receipts/checkpoints/outbox | `node g1-recovery/scripts/check-slice.mjs postgres` (alias: `durable-authority`) |
| f03-temporal-worker | Actual local Temporal/controller and distinct recreated native worker | `node g1-recovery/scripts/check-slice.mjs temporal` (alias: `temporal-worker`) |
| f03-unknown-effects | Real local external-service ACK loss and safe recovery | `node g1-recovery/scripts/check-slice.mjs effects` (alias: `unknown-effects`) |
| f03-stop-fences | Stop/takeover fences and observed all-path mutation races | `node g1-recovery/scripts/check-slice.mjs stop-fences` |
| f03-dispatch-schedules | Durable dedup, bounded wait, timezone/DST/expiry and recovery | `node g1-recovery/scripts/check-slice.mjs dispatch-schedules` |
| f03-results-notifications | Separate results/delivery/notification and authorized retrieval | `node g1-recovery/scripts/check-slice.mjs results-notifications` |
| f03-qualification | Complete fail-closed suite, frozen dependencies and evidence limits | `node g1-recovery/scripts/check-slice.mjs qualification`; `node g1-recovery/scripts/check.mjs` |

Build uses Node22.22.3, pnpm10.18.0, TypeScript5.9.3 and @types/node22.18.6 with
a frozen independent lock, offline installation and scripts disabled. Missing
cache is an actionable failure, not permission to download or choose other versions.
The PostgreSQL slice pins pg8.16.3 and @types/pg8.15.5 and reuses the unchanged
F01 owned loopback PostgreSQL16.12 fixture image by digest, with `--pull=never`.
Temporal CLI/SDK pins and the mandatory local recreation fixture are described
above; preparation is explicit and the strict build installs offline.

`check-slice.mjs` is exclusively for named development suites. The final
`check.mjs` takes no arguments, strictly builds from clean owned output, requires
all eight suite files, executes every additional test file, and refuses empty
tests, skips, TODOs, cancellation or failures. Missing integration suites fail
closed throughout development. Fixtures must create owned temporary resources
and verify cleanup; no historical process/container IDs may be signalled.

## Preservation and evidence

`g1-recovery/evidence/dependency-baseline.json` snapshots 666 existing product,
planning and evidence files from their current **working-tree bytes**, not HEAD.
It records the seven preexisting F02 product/evidence changes. This is an entry
preservation guard, not a replacement for original accepted hash guards or final
reviews. Do not regenerate it to silence a failure. No G0/G1-local/F01/F02 source,
protected checks, original migrations or raw evidence may be changed. New
migrations use a separate recovery ledger; original foundation versions stay 1/2.

Only controller-run checks count as acceptance evidence. The controller must run
the original identity, foundation and retained commands, including Electron/GUI
outside the Codex sandbox. Local self-tests are diagnostic observations. Final
evidence binds candidate/check definitions, pinned dependencies, environment,
complete stdout/stderr and failure history. Author claims cannot substitute for
independent required reviews. Track the current scope in
[F03 acceptance evidence](../evidence/g1-f03-acceptance.md).

Paid APIs/resources, credentials, remote deployment and messages to people remain
OFF. Shared/production deployment, spending, nonreproducible data deletion,
messages, credential/access/security changes and published history rewrites
require `loop_ask(kind=approval)`. This increment does not qualify full G1, real
enterprise SSO, Linux/OpenShell isolation, external providers, signed clients,
physical devices, human approval judgment, region topology or a production SLA.

## Durable results and independent notification slice

Migration9 adds scoped Task result obligations, immutable artifact byte/version
bindings, protected check receipts and terminal attempt outcomes, separately
bound DeliveryOperations and notification intents. The local verifier executes
only agreed `nonempty`/`contains` checks against persisted bounded text; its
receipt binds definition, bytes, environment and dependency pins. It cannot
qualify production build, Design rendering, deployment or arbitrary checks.
Candidate checks and expected accepted base govern canonical promotion. New
artifact versions never inherit old checks. Task result reads include retained
versions from earlier attempts under the same current audience.

Draft success requires the agreed checks and records that publication and cost
settlement remain separate. Publication obligations wait for an exact-approved
operation and a confirmed downstream receipt. Delivery composes the existing
fenced effect executor inside the same current authenticated transaction; no
second publication executor or fabricated receipt is admitted. Publication runs
stay executable while awaiting delivery, explicitly resume after reconciliation,
then atomically finish through verification. A later Publish request uses a new
linked Run and fresh exact approval while preserving the original draft outcome.

Terminal outcomes and minimal per-recipient notification intents commit together.
Notification delivery does not change Task, artifact or publication outcomes.
Definite local rejection permits at most three original-ID attempts; dispatch
COMMIT acknowledgement loss and worker death leave unknown, admitting only a
GET lookup at the original endpoint. Absence, unsupported lookup or mismatched
receipt remains unknown. Fresh brokers rebuild from PostgreSQL with no session
cache and revalidate current identity, membership and source audience before
returning bytes or sending hints. Hints/deep links contain identifiers and no
result bytes, credentials or authorization grant.

Qualification uses actual disposable PostgreSQL, independent fsynced loopback
publication/notification services and owned empty-cache broker processes. Paid
providers, remote publication, APNs/FCM, phones, cloud fleet, committed encrypted
object storage/restore/delete and strict online streaming revocation remain
unqualified. Controller checks provide local evidence; author compilation and
review are diagnostics. All previous acceptance files/checks and migrations4–8
remain unchanged.


## Integrated qualification boundary

The required `qualification.test.ts` runs with all additive migrations4–9 in one
actual owned PostgreSQL database, the current separate-process synthetic OIDC
IdP, an actual persisted local Temporal service and disposable client/worker/
supplier/result-broker processes. The accepted original command is deduplicated
and looked up before admission. The real client closes its Temporal connection
and exits; accepted work continues. An independent no-database fsynced HTTP
supplier commits exactly one approved artifact write but withholds its ACK.
SIGKILL removes the actual worker and supplier; restarting Temporal over its
existing history and a distinct empty-cache worker recovers the original
operation with GET only. Only a confirmed receipt permits the native continuation.

A previously captured progress view then issues six concurrent authenticated
online Stop taps, all returning one receipt and one current-generation fence.
Old worker/model and old outcome proposals are refused. The cancelled attempt
retains its executed passed check, checked bytes and confirmed publication record;
cancellation explicitly cannot undo that write. A distinct fresh broker observes
actual notification rejection and another fresh broker retrieves the unchanged
result. Successful draft despite notification failure and unknown in-flight Stop
remain mandatory in their dedicated result/notification and fence suites.
Stop before reconciliation leaves unknown effects blocked for domain/human
resolution; the integrated scenario does not invent an automatic resume after Stop.

`node g1-recovery/scripts/check.mjs` installs the pinned package offline with a
frozen lock and lifecycle scripts disabled, removes only reproducible owned build
output, strictly compiles from fresh sources, requires all eight named suites and
runs every added test suite. Every TAP stream must contain exactly one nonempty
complete summary with tests equal to passes and zero failure/cancellation/skip/
TODO. Unknown arguments are rejected. Entry666 dependency hashes are checked
before build and after the run, including failure; owned fixtures have bounded
ownership-checked cleanup. Additional notification and calendar suites remain
mandatory through complete-directory enumeration.

Final qualification also requires the unchanged identity, foundation and original
retained gates, with native Electron outside the sandbox through the controller.
`check-evidence.mjs` verifies actual controller jobs/fingerprints/completion events,
full copied stream lengths/SHA256, per-suite metrics and explicit scope limits.
It is an index-integrity check, not an independent review or replacement for
behavior reruns. A diagnostic four-check job bootstraps that evidence before the
five-check final task submission; post-check index changes are labeled explicitly.

Remote Linux containment/HA/backup, real supplier effects and billing, formal
enterprise SSO/human approval, real GUI all-path enforcement, physical mobile and
push providers, enterprise connector lifecycle and pilot timings remain
unqualified. Checks use supervised local synthetic identities/targets only, not
paid APIs, real credentials, messages to people or remote deployment.


## Security repair SEC-F03-001

AF-14 / master section8 requires local resource uncertainty to gate ordinary
native continuation as well as later resource I/O. The shared Space-locked guard
checks durable submitted/unknown entries for the current Run and every Run
sharing its enrolled resource before receipt lookup, model callback or new
operation submission. Only the invocation which just committed its own fresh
submitted marker can enter that marker's I/O transaction. Duplicate/original-ID
calls, new IDs and other Runs receive no such exemption. Unknown never does.

Additive migration10 stores immutable original-operation reconciliation evidence
without changing migrations4–9 or erasing their submitted/unknown journal.
Without migration10 or a qualified trusted observer, uncertainty remains blocked.
The explicit synthetic recovery method requires current human task-write authority,
observed quiescence and a read-only domain status lookup tied to the exact original
binding and evidence digest. Ambiguous, unavailable or mismatched results cannot
clear uncertainty. Resolution never replays I/O, changes generation or revives a
Stopped Run; returning from takeover still requires explicit fresh-base observation.
This method is not exposed through the worker or online command service.

`stop-fences.test.ts` adds actual PostgreSQL/API/SDK/shell/filesystem ACK-loss
cases before any Stop, recreated repository instances, zero model/new-I/O checks
for two shared Runs, submission COMMIT ACK loss, queued concurrency, original
native receipt refusal and unrelated-resource progress. Domain fsynced receipt
lookup, lost reconciliation COMMIT ACK, immutable/RLS/migration compatibility,
not-applied/new-ID recovery, authority/cross-Space rejection and missing-schema
refusal cover the explicit safe path. The existing strict controller command and
full unfiltered gate execute these cases; no accepted checks are weakened.
Real supplier domain status guarantees, human recovery judgment, remote OS
containment and power-loss safety remain separate unqualified environments.

## Security/recovery repair SEC-F03-002 and REC-F03-003

One Space-locked unresolved predicate covers the originating Run and all Runs
sharing its enrolled resource. It includes external dispatched/unknown/reconciling
operations by their immutable resource binding, and local submitted/unknown rows
only while no definitive migration10 reconciliation receipt exists. Native/model,
new resource/effect I/O, Dispatch admission/recovery and terminal outcomes use this
predicate. Definitive applied/not-applied evidence leaves old journals and Stop
receipts intact. Missing evidence/schema continues to block.

An acknowledged original effect claim grants exactly one dispatch invocation to
that repository instance. Lost claim COMMIT ACK, repeated calls and recreation
cannot POST. Read-only original-operation reconciliation can proceed under current
identity/approval/audience/generation/lease gates. Originating worker replacement
can advance its fence to load external recovery without clearing uncertainty or
allowing model/I/O. Exact delivery-state refresh synchronizes evidence only; it
cannot create artifact versions, execute writes or finish an unknown result.

An occurrence blocked before admission has no worker to recover. After definitive
resolution, recovery rechecks all gates and can queue it. Submitted occurrences
without a checkpoint still require a new worker fence and explicit read-only
resume. Checkpoint recovery returns the original event with no model replay.

The strict stop-races suite adds four actual PG/process/HTTP tests: five queued
shared native/API/SDK/shell/filesystem transactions behind an external fsynced
success with lost ACK; independent supplier exact-approved POST/ACK loss and fresh
shared repositories with zero conflicting I/O/model before Stop; and both local
applied/not-applied resolutions through scheduled continuation, recreation,
terminal checked results and actual failed HTTP notification with unchanged
retrieval. The original operation cannot replay. Existing Stop-receipt immutability,
permission/expiry/negative and recreated Temporal worker cases remain mandatory.
A deliberate regression mutation of both predicates must fail these cases.
Real supplier/domain guarantees, production Temporal/PG recovery, remote OS/GUI
containment, enterprise identity, physical devices/push and billing stay unqualified.
## Native final-answer publication completion repair (REC-F03-004)

Delivery evidence synchronization has its own trusted metadata access mode. It
reuses the exact operation's current identity, approval parties/source audience,
target, artifact/checks, lease, budget and generation validation before and after
the metadata write, under the same Space/resource barrier. Only an already
confirmed effect may synchronize while its Run is verifying or succeeded.
Executable dispatch, lookup/reconciliation and resume retain their original
execution-state limits; metadata synchronization never invokes an adapter,
claims dispatch, changes effect state or restarts a native session.

`results-notifications.test.ts` composes actual PostgreSQL, an independent
loopback publication process, exact-approved HTTP POST and confirmed receipt,
explicit resume, and both genuine native turns. It checks verifying/finished
state, fresh-repository delivery refresh and concurrent immutable completion,
atomic completion notification intents, and zero additional POST/model calls.
Additional cases retain unconfirmed-effect denial and current target, lease,
budget, approver-session, source-audience, executor-membership, Stop and shared
unknown-resource gates. Fresh brokers can retrieve the successful outcome and
synchronize its confirmed delivery; terminal native/effect execution stays closed.
This qualifies the local composition only; previously listed external gates and
independent controller review/acceptance requirements remain unchanged.

## Pause dispatch repair (REC-F03-005)

Master section8 requires Pause to stop new actions and requires current
authorization for resume. A new prepared external operation can be claimed only
from running. The acknowledged claim moves the Run to reconciling before its
one-use POST; the locked I/O guard admits running/reconciling but refuses paused.
If Pause commits before I/O, the consumed claim cannot be replayed or transferred
to a recreated repository. Original-operation read-only reconciliation and
confirmed delivery metadata remain available under their existing exact gates.
If I/O owns the Run lock first, Pause waits for that transaction's safe boundary.

Dispatch admission persists a bounded resource wait for paused Runs. Resuming a
schedule cannot resume its Run. An explicit current-authorized Run checkpoint
must return a prepared operation to running before admission/execution can proceed.
Already uncertain operations retain the reconciliation requirement; no new
claim, automatic retry or model continuation is authorized by the repair.

Six additive `unknown-effects.test.ts` cases use actual PostgreSQL and an
independent fsynced HTTP service: prepare/Pause/recreation/explicit resume,
running-only claim, observed Pause-before-claim and both Pause/I/O lock orders,
acknowledged-claim/Pause-before-I/O, lost send capability and read-only lookup.
The migration4–6 core fixture exercises legal paused checkpoints while holding
the actual Run lock. In the migration7 fence profile, unresolved effects already
block generic checkpoints; that stronger uncertainty gate is unchanged. Three
additive `dispatch-schedules.test.ts` cases use the installed Space/resource
barrier: paused native admission, Pause before scheduled effect admission, and
Pause after admission but before execution. Fresh repositories observe zero
POSTs while paused and exactly one original POST after explicit Run resume.

These cases remain mandatory through the unchanged slice/full check commands.
Their local qualification does not establish production Temporal/PostgreSQL,
remote OS/GUI containment, supplier semantics, enterprise identity, physical
devices/push or billing; independent review and acceptance remain controller-owned.

## Generic completion and upgraded migration restart repair (turn22)

AF-17/UX-18 and master section8 require terminal Run, Task outcome and completion
notification intents to commit together after the requested obligation is
qualified. Once migration9's result profile is installed, generic checkpoints
must reject terminal proposals and result writes, including unconfigured Tasks.
Only `ResultRepository.finish` admits qualified completion. Isolated migration4
fixtures retain their original generic completion behavior. The existing schema
also rejects malformed nonterminal result proposals before any writes.

AF-05 and section8's durable recovery require normal migrations to rerun against
an upgraded database. `migrateRecovery` pins versions4–10, validates installed
digests and prerequisites, and applies4 only when the recovery ledger is empty.
Supported later versions remain installed without changing their application
timestamps. Changed base/later digests, unknown versions and orphaned history
remain incompatible; accepted migration SQL and F01/F02 ledgers stay unchanged.

Fourteen additive cases in `results-notifications.test.ts` cover missing artifact,
unchecked/failed checks, checked but unpublished results, awaiting approval, all
four terminal states, configuration omission, malformed nonterminal input,
recreated repositories and qualified completion after rejection. Both completion
orders observe the actual PostgreSQL Run lock and the second transaction's Space
barrier wait, then prove one qualified outcome and one intent per recipient.
The full4–10 migration case reruns the complete sequence twice, compares fabric
schema objects/functions/ACLs/policies, all fabric table data and all migration
ledger timestamps, and refuses each corrupted installed digest, unknown11,
missing4 and changed base SQL. These cases use the unchanged strict slice/full
commands; original migration4 authority fixtures remain mandatory.

Full current-snapshot qualification, independent review and final acceptance
remain controller-owned. Existing real external environment limits still apply.
