# G1-F03 local recovery evidence

Status: **all eight development tasks controller-qualified locally (8/8);
independent security/code/acceptance reviews and final controller acceptance
pending**. This additive
record follows [F03 plan](../planning/g1-f03-plan.md) and the unchanged
[remaining ledger](../planning/g1-remaining-ledger.csv). It does not attest whole
AF-01/05/09/14/17/19 or UX-08/18 acceptance.

## Current candidate scope

`g1-recovery/` has a pinned offline strict TypeScript build, closed immutable
record decoders, deterministic test-only session adapter, an unfiltered complete
gate and a separate development slice runner. The entry baseline snapshots 666
current working-tree dependency files including seven preexisting F02 changes;
original sources, checks and raw evidence are preserved.

Local author diagnostics on 2026-10-07: `check-slice.mjs contracts` strictly built
and passed 16/16 tests, with zero failed/cancelled/skipped/TODO. Tests exercise
required/unknown fields, prototype/accessor refusal, UUID/time/numeric/digest
validation, immutable scope/version/target bindings, illegal terminal and unknown
effect transitions, bounded waits, stale generations, Stop response distinctions,
draft/check/acceptance/publication separation, mismatched evidence, notification
independence, deterministic continuation/replay and fail-closed gates. Adapter
replay has zero synthetic turns, provider calls and write calls. These are
contract observations, not real worker crash, external-write recovery or remote
isolation qualification. An initial build caught readonly assignment in a test;
the fixture now mutates its copied input with Object.assign to test decoder
isolation without weakening readonly contract types.

Controller job `job-7cc2357a34` passed `f03-contracts.f03-build` and
`f03-contracts.f03-contract-cases` for fingerprint
`git:094bfc6feadac5e9038cd9ee`, both exit 0. The contract command passed
16/16 with zero failed/cancelled/skipped/TODO; both commands verified all 666
entry dependency hashes. The controller marked **f03-contracts done (1/8)**.
[Complete copied controller streams](../../g1-recovery/evidence/contracts-controller.json)
retain all four stdout/stderr streams, original paths, byte counts and SHA256.
The original controller logs remain unchanged. These results precede this evidence
index update and qualify only the contract slice; final checks must rerun the
integrated candidate. No recovery, external environment or independent review
pass is claimed.

The controller recorded `cleanup: zombie` for both completed command groups;
that metadata is retained in the copied index. These tests create no long-lived
product worker or database resources. No historical process ID was signalled;
process cleanup qualification belongs to the actual worker integration checks.

## Durable authority implementation and diagnostic scope

Additive migration4 and a separate recovery ledger persist controller-owned
Run/session/lease/operation/result references, stable command receipts and paired
outbox events. Original foundation versions/digests1/2 and identity version/digest3
are checked unchanged. Untrusted worker-role logins, clients and the narrow synthetic IdP role have no
recovery SQL rights. The Temporal process hosts trusted controller activities
with a controller-role pool; the native adapter receives records only. OS
separation and hostile-worker containment remain unqualified. Forced RLS, immutable bindings/receipts/event payloads and
reciprocal deferred receipt/event keys are exercised against actual PostgreSQL.

The new repository composes the unchanged F01/F02 UoWs. Tests authenticate through
a separate local synthetic IdP (actual RS256/JWKS/PKCE/token verification) and
current database session authority, use distinct backend connections for fresh
reconstruction, and measure real PostgreSQL lock waits. Cases cover concurrent
same-key dedup and different-key revisions; changed-key/payload refusal; partial
SQL-write rollback; lost actual durable COMMIT ACK with original-key lookup;
uncommitted commit/rollback/timeout lookup; revoked/expired/forged scopes; current
membership, actor/payer, lifecycle, grants and policy; stale generation/lease;
remaining reservation and allowance ancestry; exact F02 approval consumption
atomic with effect/receipt/outbox; participant/approval/command/lease expiry after
lock waits and all writes; immutable terminal result references and outbox
completion. Tests use synthetic actors, allowances and targets, not real humans
or billing. No external effect is dispatched by this slice.

Author diagnostics on 2026-10-07: `check-slice.mjs postgres` strictly built and
passed 28/28 actual PostgreSQL cases, zero failed/cancelled/skipped/TODO, with
owned database/IdP cleanup and unchanged F01/F02 ledger digests plus all 666 entry
file hashes. `check-slice.mjs contracts` also passed 16/16 after runner changes.
The full gate still rejects missing `temporal-worker`. These observations are not
controller evidence. Earlier diagnostic expansion
exposed mutable outbox payloads; a new immutable-event guard and exact deferred
receipt/event pair constraints fixed it. Strict compilation also caught attempted
assignment to readonly mutation fields; fixtures now copy those inputs. The
controller result and full streams below establish only this PostgreSQL slice.

Persisted results here are summary/digest references. They do not qualify artifact
bytes/check/verifier/delivery/notification semantics, native worker recreation,
Temporal history, external write success/ACK loss, zero-I/O workflow replay or OS
containment. The one-effect-per-reservation restriction is conservative local
backing, not a qualified provider usage/settlement implementation. Those boundaries
remain required work in subsequent slices and external increments.

Controller job `job-674eb76f87` passed `f03-durable-authority.f03-postgres`
for fingerprint `git:06cc382364cd4a5256cc0075` (exit0, 28/28 tests; zero
failed/cancelled/skipped/TODO). The controller marked **f03-durable-authority done
(2/8)**. [Full copied stdout/stderr and metadata](../../g1-recovery/evidence/durable-authority-controller.json)
retain original paths, bytes, SHA256, complete measurement records and controller
results. The check used the pinned PostgreSQL16.12 image, observed a distinct
backend for reconstruction, recorded both owned IdP child exits and removed its
owned database container. The ledger measurement preserves F01 digests1/2, F02
digest3 and recovery digest4; all 666 entry hashes passed.

Controller group metadata is `cleanup: zombie`, retained verbatim; product fixture
cleanup is independently reported in the full streams. No historical process or
container was signalled. A diagnostic `ps` census is denied inside the Codex
sandbox; native process-census qualification remains the next controller-run
worker slice. This evidence index update follows the checked candidate; final
integrated acceptance must rerun. No independent review, external environment or
whole-requirement pass is inferred.

## Temporal/native worker implementation and local controller checks

The slice pins the free Darwin arm64 CLI1.4.1 (embedded Server1.28.0) by archive
and binary SHA256, and SDK1.24.0 in the frozen lock. A declaration-only upstream
schedule typing patch uses `WithWorkflowArgs` without changing runtime code or
weakening strict/exact-optional/library compilation. Explicit setup cached the
free dependencies; checks install offline and never substitute an in-memory
service or skip service/process readiness.

Migration5 adds forced-RLS, append-only session events. The deterministic workflow
performs activity/signal orchestration with opaque Task/Run/session references.
Controller-hosted activities use actual F02 fresh authenticated scopes, locked
current PostgreSQL authority and a live generation/lease/backed reservation. The
adapter receives records only. Session event/cursor/run/receipt/outbox writes
commit together. A stable workflow ID, checked memo and reject-duplicate reuse
handle lost admission ACKs and concurrent outbox delivery. Conversation completion
leaves the Run **verifying**; no artifact acceptance, delivery, Task success or
notification is inferred.

Controller job `job-f36c4044ba`, fingerprint `git:4419babcf8454c9c077222bb`,
passed the strict Temporal check **9/9**, zero fail/cancel/skip/TODO. It closed the
actual submitting connection, observed and SIGKILLed generation1 after the first
PostgreSQL and Temporal checkpoint, restarted the real service against the owned
SQLite history and verified unchanged history, then launched a distinct native
process with generation2 and empty session cache. The same Task/Run/session and
first recorded response survived; only the second synthetic turn called the model.
Old-generation original-key and new-turn continuation were refused before model
execution. Separate recreated-worker cases refused revoked write membership,
actual lease expiry and an active reservation with no remaining capacity, asserting
the exact FoundationError recorded in Temporal history and zero new model calls.

Actual completed and denial histories were exported. SDK replay in a separate
process with no activity registrations or DB/service connection had zero measured
model/checkpoint calls and left every PostgreSQL recovery table unchanged. The
incompatible timer-first workflow failed with `DeterminismViolationError`. There
is no external effect executor in this conversation slice; external-write/ACK-loss
instrumentation remains required in the next task. Native execution had no child
harness or ordinary-conversation VM at the observed process census. PIDs/commands,
service versions, checkpoint/model records and ownership-checked exits are in the
complete streams and artifacts in the
[Temporal controller index](../../g1-recovery/evidence/temporal-controller.json).

This check's `workspace_changed: true` includes evidence generation and a plan
update during the run. The fixture now writes unique raw artifacts to the ignored
cache; the index copies checked artifacts byte-for-byte with original paths and
SHA256, refusing any overwrite. Task submission must rerun the stable candidate.
Controller group `cleanup: zombie` is retained as returned; full product measurements
independently show worker/service PIDs reaped, the synthetic IdP exited, the owned
Temporal directory removed and PostgreSQL container removed. No historical PID
or unrelated data was signalled or deleted.

Three earlier failed controller runs and complete streams are retained in that
index: CJS proto import failure (`job-10de3193be`), incorrect budget-release fixture
constraint (`job-ee052d5129`, 8/9) and a nonexistent fixture column
(`job-960e618ecc`, 8/9). The expiry case initially failed on invalid timestamp
decoding rather than expiry; it now supplies canonical ISO time and asserts the
exact expiry denial. The budget case now exhausts a valid active reservation and
native continuation requires capacity for one synthetic turn. No database guard,
compiler flag or test was weakened. Author regression diagnostics passed contracts
16/16 and durable authority28/28 after the repository changes, with all 666 entry
hashes unchanged. A local Temporal attempt fails closed because the sandbox denies
`ps`; actual process qualification uses controller execution outside the sandbox.

This qualifies local deterministic conversation recovery only. Remote Linux/OS
isolation, real provider transport/settlement, production Temporal topology,
cloud history backup/failover, irreversible effects and whole-G1 remain unqualified.
Native activities have one attempt; this does not authorize provider/effect retries.
Final integrated checks and independent reviews remain pending.

Controller task-submission job `job-684dc84f70`, fingerprint
`git:9d214be3b4e5638a9885d507`, reran the approved command on the stable candidate:
**9/9 pass**, exit0, zero fail/cancel/skip/TODO, all666 preserved dependency hashes.
The controller marked **f03-temporal-worker done (3/8)**. Its result has no
`workspace_changed` flag. Complete original stdout/stderr, controller metadata
(including `cleanup: zombie`), checked worker/replay streams and four actual
completed/denial histories are preserved in the same index, with original ignored
cache paths and byte-identical retained copies. Actual product resource cleanup
is reported in its full streams. This additive evidence/status update follows the
checked fingerprint; final integrated qualification must rerun. The local full
gate still fails closed at `Mandatory suite missing: unknown-effects` after a
strict build. No later slice, external environment or independent review pass is
claimed.

## Local unknown-effect executor and crash recovery

The new additive migration6 journals immutable effect phases and enforces identical
SQL/record bindings. Dispatch records the complete original operation intent,
argument/artifact digests, actor/policy/approval/reservation/lease and generations
before HTTP. Phase mutations commit Run revision, effect journal, original-key
receipt and outbox together. An independent loopback HTTP process owns its own
fsynced receipt/counter journal and supports downstream dedup plus read-only status.
Complete arguments and artifact bytes must match persisted digests; approved
normalized arguments additionally bind the artifact digest; the adapter
allows only disposable synthetic targets. It has no controller credentials.

One controller claimant commits **unknown before send**. Duplicate dispatch and
any recovery of that marker cannot issue another POST. A recreated generation
keeps the original operation ID/binding and performs only status lookup. Exact
matching receipt establishes confirmed, leaves the Run paused, and a separate
explicit continuation is required before a native model turn. Every unresolved
effect gates model continuation including original-key duplicate checkpoint calls.
Current requester/approver/executor sessions, membership, audience, policy,
target/version/digest, task/cancellation and worker/resource generation, lease,
expiry and backed reservation are locked across bounded HTTP I/O and rechecked.
The reservation stays unsettled; this is not real billing settlement evidence.

Outage preserves lookup as the safe next action. Ambiguity/absence, unsupported
lookup/dedup and target/artifact receipt mismatch persist a reconciliation detail
requiring human/domain recovery. The original adapter strategy remains immutable;
the response and newer detail supply the stricter action. Expiry/revocation refuses
lookup settlement and model continuation while preserving unknown/reconciling
state. No failed/timeout activity, missing ACK, absent lookup, capability restoration
or reconnect authorizes an unsafe retry.

Controller job `job-ede97ecb0c`, fingerprint `git:c2006dc6eede325fb2fc4b15`,
passed `f03-unknown-effects.f03-effects-crash` (strict build and **20/20**;
zero fail/cancel/skip/TODO, exit0, all666 entry hashes unchanged). This includes
16 simultaneous downstream deliveries yielding one actual write and identical
receipts; changed arguments/artifact/target refusal; SIGKILL/reconstruction of
the independent downstream from its journal; concurrent controller claims yielding
one POST; preparation and dispatch-marker COMMIT ACK loss with original-key
lookup; and refusal of initially unsafe lookup-only/human adapters.

Thirteen real Temporal workflows each lost generation1 via SIGKILL **after** the
independent service's durable effect commit but **before** HTTP ACK/local settlement.
Distinct empty-cache generation2 processes retained the same Task/Run/session and
operation. Confirmed recovery did one original write, zero recovery POSTs, then
one missing synthetic model turn only after matching lookup/confirmation. Separate
cases remained unresolved for outage, ambiguous lookup, unsupported lookup,
missing dedup and mismatched target/digest. Further cases denied expired lease or
approval, removed executor write membership, revoked approver session, changed
target version/digest or exhausted backed reservation, with zero post-recovery
model calls and writes. Actual histories record the old activity timeout without
automatic retry. Exported confirmed and unresolved histories replayed in isolated
SDK workers without activities/DB/service credentials: zero model/checkpoint/write
calls, unchanged every recovery SQL table and unchanged downstream counters.

[Full controller streams, metadata and byte-identical raw copies](../../g1-recovery/evidence/effects-controller.json)
retain stdout/stderr, 13 histories, worker records, replay outputs and the downstream
journal with original paths/bytes/SHA256. Controller metadata `cleanup: zombie`
is retained. Full fixture measurements independently show every owned worker and
service reaped, local IdP exited, PostgreSQL container removed and owned Temporal/
effect directories removed. No historical process or unrelated data was signalled.

The sandbox diagnostic fails closed on its denied actual `ps` census; process
checks run through the controller outside it. Author contract regression passed
16/16 and durable authority regression passed28/28. The unfiltered full gate
strictly built and failed closed at missing `stop-fences`. After this first controller pass, the phase implementation acquired the
same original-command key lock as receipt lookup, and tests were extended for
pending dispatch-marker commit, lost confirmed-settlement COMMIT ACK and actual
lease expiry while status lookup is in flight, plus approved normalized arguments
binding artifact bytes/digest before dispatch. A task submission caught a missing
transaction callback opener introduced by the lock-order refinement
(`job-0158488a7c`, strict compilation failure); it was restored without changing
compiler flags or tests. Controller task-submission `job-ab51ab6b45` passed the expanded **24/24**
(exit0; zero fail/cancel/skip/TODO) and marked f03-unknown-effects done (4/8).
After this pass, fixture review found the downstream process inherited the synthetic
admin DSN environment despite not using it. Launch now supplies only its own
fixture configuration; startup refuses any controller/database environment and
readiness asserts that absence. Final refinement controller job `job-8c913ce77d`, fingerprint
`git:c5c90ceeffb5b292e534dedc`, passed the approved strict command **24/24**, exit0,
zero fail/cancel/skip/TODO, all666 entry hashes unchanged and no
`workspace_changed` flag. Its complete streams and44 byte-identical raw artifacts
are retained in the same index; owned cleanup remains measured separately from
controller `cleanup: zombie` metadata. This evidence
index update follows the checked fingerprints; final integrated qualification must rerun after this
additive evidence/status update. It is not an integrated or
independent review pass.

Local process crash/ACK loss is qualified only for this fsynced synthetic service.
Real provider idempotency/status semantics, irreversible effects, remote partitions,
power-loss filesystem guarantees, disaster restore, Linux worker egress/OS containment,
production Temporal fleet/backup and human reconciliation judgment remain unqualified.
No real credentials, paid API/resources, remote deployment or messages were used.

## Stop and takeover local qualification

The additive migration7 and `FenceRepository` expose authenticated online Stop-run,
Stop-task, retry-task, take-control, disconnect and return-control, plus read-only
original-key lookup. Stop uses current `task:write` control authority, immutable
Task/Run targets and actor-scoped idempotency rather than a progress revision.
Concurrent duplicate taps produce one immutable receipt/event pair and generation
advance. Distinct Stops advance monotonically; Stop-run leaves another attempt
unchanged; Stop-task blocks new attempts until authorized retry without reviving
old work. Forced RLS, non-owner client/worker SQL denial, immutable enrollment and
receipt/event records, reciprocal deferred keys, migration digest refusal and
unchanged F01/F02/migrations4–6 ledgers are exercised in actual PostgreSQL.

Installed-fence native checkpoints, worker replacement, approved effect
preparation/claim/guarded dispatch and synthetic local resource mutations share
the conservative Space barrier. Actual API/SDK-style loopback HTTP, owned shell
children and filesystem writes run through the local test drivers. Tests observe
PostgreSQL blockers in both Stop/dispatch orders and before takeover, prohibit
queued writes after acknowledgement, and measure real PID exit before the trusted
driver grants human control. The online response separately records acceptance,
dispatch fencing, observed resource quiescence, pending process termination, and
submitted/unknown operation IDs. A durable local submitted marker precedes I/O:
it is an uncertainty record, **not proof that an external write occurred**. Lost
submission COMMIT ACK yields zero I/O; actual committed local/HTTP writes with
uncertain outcome remain visible after fresh repository reconstruction.

Takeover invalidates prepared effects and all enrolled attempts' old generations
and execution leases before human lease commit. Missing or unsuccessful trusted
quiescence fails closed. Disconnect and actual human lease expiry remain paused
across reconstruction. Return requires current holder authority, matching resource
generation, fresh generation-bound trusted observation, an actual filesystem/base
reread, absence of unresolved submitted/unknown operations and live execution
leases. A file edit after observation is rejected. Finished native answers retain
verifying/finished state and cursor after return, with zero additional model calls.
No Stop receipt claims to undo an external write or prove all worker processes
terminated. Unknown effects after Stop stay blocked for domain/human resolution;
there is no automatic resume or blind resend.

Controller diagnostic `job-ab2d102bf8` timed out before a case completed: twelve
concurrent Stop transactions could exhaust the fixture's shared transaction and
current-authority read pool and starve mandatory revalidation. A separate bounded
non-owner authority read pool fixes this without weakening revalidation. Subsequent
`job-5bdbfd0eb4` ran40 cases, passing38; two tests correctly hit the unchanged
immutable Run pin guard because they attempted to reparent an existing foundation
Run. Fixtures now insert genuine new attempts under the existing Task at creation.
Both failures and complete original streams remain retained.

Controller `job-7d7d51c302`, fingerprint `git:2e2ebcf05d1b8403632fec75`, passed the
approved strict `node g1-recovery/scripts/check-slice.mjs fences`: **41/41**, exit0,
zero fail/cancel/skip/TODO, all666 entry hashes unchanged. Compatibility controller
`job-b526912599` reran the earlier unchanged command definitions against the new
repository/fixture composition: PostgreSQL28/28, actual Temporal recreation9/9
and actual external-effect crash/reconciliation24/24 all passed, exit0 with zero
fail/cancel/skip/TODO. Those isolated suites preserve their original migration
profiles and do not individually qualify migration7 takeover.
[Complete fence and compatibility streams](../../g1-recovery/evidence/fences-controller.json)
retain original controller completion events, log paths, byte counts, SHA256 and
result metadata, including controller `cleanup: zombie`. Fresh actual Temporal and
effect histories/process records are copied byte-for-byte into their existing
append-only evidence indexes. Owned fixture/container/file/PID cleanup was measured;
no historical PID was signalled. The final task submission reruns the fence check
after this index update and stronger stale-view/HTTP in-flight race assertions.
Final integrated qualification still must rerun the complete candidate.

Final task-submission controller `job-d60fbbb5c4`, fingerprint `git:7a1a529174c50fee47e33956`,
passed the stronger current strict fence suite **41/41**, exit0, zero
fail/cancel/skip/TODO, with all666 baseline hashes unchanged; the controller marked
**f03-stop-fences done (5/8)**. This submission includes progress advancing after
the client's captured view and an observed online Stop wait while the exact-
approved HTTP service has committed bytes but withheld its ACK. The receipt
retains unknown outcome and dispatch fencing without another POST. Complete
streams, controller result/fingerprint and cleanup metadata are appended to the
same evidence index. This final index/status update follows the checked candidate;
full integrated qualification must rerun after all later slices are implemented.
An author-run full gate also strictly built and exited1 on mandatory missing
`dispatch-schedules`; this is a diagnostic failure, not controller qualification.

This qualification applies to the **trusted synthetic local drivers** and current
F02 scopes. Callback mutation/observation/process handles are never exposed through
HTTP and do not constitute a production tool or approval bypass. Only the exact-
approved loopback API external adapter is admitted; other external SDK/shell/file/
browser/GUI paths and arbitrary native application paths are explicitly closed
before I/O or approval consumption. Missing migration7/drivers denies online
control. Production driver registries, hostile OS bypass/egress containment,
interactive browser/GUI/native controls, remote worker/process termination,
irreversible provider/domain reconciliation, real mobile/offline transports and
Stop timing/SLA remain unqualified. The conservative barrier serializes mutable
work within a Space and does not qualify disjoint resource scheduling.

## Pending required local qualification

Bounded local Dispatch and result/notification qualification are recorded below.
The integrated gate, unchanged F02/foundation/retained commands and independent
reviews remain pending. The complete gate fails closed on mandatory missing
`qualification`; no placeholder establishes a pass. Native GUI checks must run
through the controller outside the sandbox.

## Unqualified external environments

Remote Linux containment, HA/high availability and backup recovery; real supplier
effects and billing; formal SSO and human approval; real GUI all-path enforcement;
physical mobile and push providers; enterprise connector lifecycle/JML; and pilot
timing remain unqualified. These require actual external environments, separate
permission where applicable and current-candidate evidence, not local fixtures.


Real model providers/profile/region/billing and context conformance (F04),
committed storage/backups/restore/delete propagation (F05), remote Linux image,
worker egress and OS containment/quiescence (F06), web/desktop/mobile same-Task
sleep/reconnect, signed distribution and physical phone notifications/timing
(F07), formal enterprise SSO and human approval judgments remain unqualified.
Real downstream idempotency/lookup semantics, irreversible publication, remote
network partition/fleet failover, production backup recovery, APNs/FCM/channel
delivery and all G2/G3 schedule/connector/desktop breadth require their own actual
environments. Local broker races cannot prove hostile-path containment or undo
already accepted external writes. No SLA or full-G1 release claim is made.

Paid product APIs, new paid resources, real credentials, remote deployments and
messages to people are OFF. Required approvals use the Loop controller. Only
controller-run checks and required independent reviews can qualify this candidate;
this document preserves the distinction from author-run diagnostics.

## Dispatch implementation and diagnostic scope

The bounded Dispatch design and environment limits are recorded in the
[plan](../planning/g1-f03-plan.md#bounded-durable-dispatch-slice). Migration8 adds
schedule/occurrence persistence and reciprocal immutable receipt/events with
forced RLS, preserving prior migrations and all666 dependency hashes. Templates
pin existing native Task/Run/session continuation or one exact approved operation;
they do not implement fresh recurring job materialization or production unattended
credentials. Actual local timer processes reuse the existing native controller
checkpoint path, and exact local effect tests compose the original effect
executor. No second agent harness or arbitrary connector is introduced.

The first controller diagnostic `job-9a9fa17104` ran the strict offline build and
48 actual calendar/PG/process tests:26passed,22failed, zero cancelled/skipped/TODO.
Converting a PostgreSQL Date via String lost clock milliseconds, causing false
future-event denials and delayed expiry/timer checks. The controller clock now
preserves the original Date ISO milliseconds. Two external-effect fixtures also
correctly refused a resource absent from migration7 enrollment; the fixtures must
enroll that resource without weakening the fence. The repaired controller diagnostic `job-55e3288de1` passed53/53, zero
failed/cancelled/skipped/TODO, including actual cross-schedule overlap and SQL-lock
expiry regressions. The controller recorded `workspace_changed:true` because the
failed-stream evidence index was added during this diagnostic; this is not the
final task qualification. The final expanded frozen snapshot must be checked.
[Full failed and diagnostic streams](../../g1-recovery/evidence/dispatch-controller.json)
retain original paths/bytes/SHA256, completion events and results without editing
raw controller logs. A direct sandbox diagnostic passed calendar8/8 but failed
the mandatory process census with `ps EPERM`; that run is not integration evidence,
and its disposable PG container was measured removed.

The acceptance boundary remains local: real enterprise identity/connection/JML,
webhook origin and signed replay prevention, fresh recurring job creation, service
credential rotation, production timezone-data rollout, global fair quotas, cloud
Temporal/timer availability, real irreversible APIs/provider billing, OS isolation
and physical Dispatch clients still need external environments. No paid API,
cloud resource, real credential, remote deployment or message to a person was used.

The first final-task attempt `job-735c0af266` passed55/56, with one actual
owner-offboarding monitor regression failing. Revocation after the initial owner
verification but before a later verification exited the process before persisting
the pause. The timer loop now catches that authority failure at every iteration
boundary, authenticates only the configured monitor, and persists a pause via its
read-only control observation. The monitor never inherits the owner execution
identity or admits a native/effect ticket. The regression remains mandatory and
unchanged; the exact final rerun below qualifies the repaired slice. This failed job's full
streams and controller metadata are retained in the Dispatch evidence index.

Controller final-task job `job-1fe5d995cb` passed the unchanged approved command
`node g1-recovery/scripts/check-slice.mjs dispatch` for fingerprint
`git:1fbef569dc794168e54f6e97`: **56/56 passed**, zero failed/cancelled/skipped/TODO,
exit0 and `workspace_changed:false`. Strict offline build and all666 entry hashes
passed. The controller marked **f03-dispatch-schedules done (6/8)**. The
[complete Dispatch index](../../g1-recovery/evidence/dispatch-controller.json)
retains all failed/diagnostic/final stdout/stderr bytes and SHA256, original log
paths, controller job/completion events, process/model records and the exact raw
synthetic fsynced downstream journal. Raw controller logs remain unchanged.

Qualified local cases include explicit IANA DST gap/fold and non-hour-offset
previews; actual database-clock fires in independent empty-cache timer processes;
concurrent event/timer/claim dedup and overlap across schedules; skip/coalesce and
exact expiring human catch-up consent; expired command/schedule/approval/lease;
input/approval/budget/resource/connection/permission waits; current owner/service
identity and a monitor persisting offboarding pause without privileged execution;
actual observed SQL-lock expiry rollback for connection/wait/consent/runtime;
worker death before checkpoint requiring fenced explicit resume, and death after
checkpoint requiring zero extra model calls; actual external success/ACK loss,
service and controller recreation with GET-only original-operation reconciliation
and one original downstream write; original schedule-create durable COMMIT ACK
loss lookup; immutable migration bindings, receipts/event pairs and forced RLS.

Runtime expiry behind an observed native-history SQL lock produced zero model
calls and zero committed native events; submitted uncertainty remained available
for authorized recovery. Offboarding monitor tests produced zero model calls and
a persisted permission wait. The unknown-effect fixture committed one actual
fsynced write, recreated its independently owned downstream/controller processes,
and used one GET lookup with zero recreated POSTs to confirm the original effect.
This does not qualify arbitrary provider status APIs or OS execution termination.

Controller group metadata `cleanup:zombie` is preserved verbatim. Independently
measured owned child/IdP exits, process census absence, temporary fixture-file
removal and disposable PG container removal all passed. No historical PID was
signalled. This final evidence index update follows the checked source snapshot;
full integrated increment acceptance and the result/notification and qualification
tasks remain pending. External and fresh recurring-job limits listed above remain
unqualified; no whole AF-09 or whole-G1 pass is claimed.

## Result and notification implementation scope

Migration9 and the trusted result service separate Task obligations and current
attempt selection from immutable terminal attempt evidence. Artifact bytes,
versions, expected accepted base, executed digest-bound checks, publication
DeliveryOperations and notification delivery are separate records. The local
verifier runs only the agreed bounded text checks, preserving passed/failed
receipts with artifact/environment/dependency/definition digests. No agent
self-report creates a passed check. Task completion atomically creates minimal
notification intents; notification failure does not revise existing outcomes.

The result/publication check composes current exact approval, identity, audience,
target, expiry, budget, lease and generation gates with the existing effect
executor. Publication requires a matching confirmed effect receipt. Draft success
requires checks and preserves not-published status. Later publication uses a new
linked approved Run and leaves the original successful draft intact. Previous
attempt artifact/evidence remains available through the authorized current result
broker. Waiting failure clears its wait; safe cancellation settlement records the
current fenced generation without authorizing additional dispatch.

The independent notification fixture fsyncs original-ID hints, rejects delivery,
drops acknowledgements and supports receipt lookup. Durable pre-send markers
prevent a recreated broker from replaying an unknown send. Definite rejection
permits a bounded three-attempt retry; unknown remains lookup-only, including
absent/unsupported/outage/mismatched receipts. Current identity, recipient and
source/destination audience checks precede delivery and result retrieval. Minimal
hints/deep links confer no authorization and contain no summary/artifact bytes.

The initial controller diagnostic `job-1fd80e801a` strictly built and failed closed
on the missing mandatory result suite while it was being implemented. Its complete
streams and controller metadata are retained in
[the result evidence index](../../g1-recovery/evidence/results-controller.json).
Local controller qualification is still pending below; implementation and author
review do not establish a pass. Review corrected waiting terminal-state cleanup,
prior-attempt artifact retrieval and collaborating-writer atomic notification
intent creation, with mandatory behavioral regressions.

This slice stores bounded text in the owned synthetic PostgreSQL fixture. Real
encrypted artifact/object storage, general verifiers, backups/power-loss recovery,
irreversible external publication, provider dedup/reconciliation contracts,
production push/channel delivery, physical devices, distributed broker availability
and online bounded streaming revocation remain unqualified. No paid resource,
real credential, remote deployment or message to a person was used. Final
integrated acceptance and independent reviews remain pending.

The second controller diagnostic `job-99f89ae9b9` failed on denied direct identity
metadata reads and reuse of a migrated database by a second suite. The repair adds
only migration9's fixed scoped notification-authority helper; no broad identity
SELECT grants or older migration guards were changed. Each owned suite now has
its own actual database. Complete failed streams, including cleanup failure
metadata, remain in the result evidence index. Controller `job-9ad4c05abc` passed
the initial50 cases. Review then identified the changed-artifact interval after
Delivery binding but before external dispatch. The additive installed-result guard
now validates latest bytes and protected environment/definition-bound receipts
inside the existing executor's locked current-authority boundary, for direct
executor calls as well as linked Delivery calls. Unknown claims remain visible
when changed bytes forbid settlement; no replay is attempted.

Compatibility controller `job-8315d07eb4`, fingerprint
`git:154d489bbd31042e380fd087`, passed the unchanged approved result command:
**54/54** (24 notification +30 result cases), exit0, zero
failed/cancelled/skipped/TODO. Strict build and all666 baseline hashes passed;
no workspace-change flag was recorded. The same frozen candidate passed the
unchanged earlier actual effect/crash/replay command24/24 and fence command41/41.
These profiles preserve their original migration boundaries. Complete streams,
results and controller completion events are retained in the result index; fresh
actual Temporal effect histories and worker records are copied byte-for-byte into
the append-only effect index. Raw journal bytes/hashes and owned process/IdP/file/
database cleanup measurements are retained in the streams. Controller cleanup
metadata is preserved separately; no historical PID was signalled.

Qualified local cases include checked-draft success without acceptance/publication;
actual separately approved confirmed publication; later linked publication without
altering draft success; immutable prior failed/partial/cancelled evidence and bytes;
current cancellation after actual Stop while stale outcome proposals are rejected;
observed SQL-lock lease expiry rolling back all check receipts; changed artifact
before and after unknown dispatch claim, stale environment/dependency receipts and
revoked real approver session producing zero POSTs; concurrent version/check and
notification dedup; actual notification rejection/bounded retry/ACK loss/fsynced
worker death/service recreation/GET-only recovery; result/outbox and dispatch-marker
COMMIT ACK loss; fresh result retrieval after failed notification and successful
notification preserving task failure; current source audience/recipient/session
revocation and cross-Space denial; mutable notification projection tamper refusal.

The final task submission reruns the slice after these additive evidence and
suite-routing updates. Integrated increment qualification remains pending and
must rerun the complete current candidate; external limitations above remain.

Final-task attempt `job-b1d6913105` passed notification24/24 and result29/30,
with the mandatory collaborating-writer preserved-check comparison detecting
non-deterministic PostgreSQL receipt row order. Completion now orders receipts
by the immutable agreed definition list before hashing/persisting an outcome.
The behavioral assertion and receipt contents remain unchanged. Full failed
streams and metadata remain retained; this failed attempt did not complete the
task. The repaired final rerun is recorded below.

Final repaired task-submission `job-b9eae5c327`, fingerprint
`git:93234d705e9828df83a6c6c0`, passed the approved strict result command
**54/54** (notification24/24, result30/30), exit0, zero
failed/cancelled/skipped/TODO. All666 baseline hashes remained unchanged and no
workspace-change flag was recorded. The controller marked
**f03-results-notifications done (7/8)**. Complete final streams/results/finish
event and measured owned cleanup are appended to the result evidence index. This
post-check index/status update precedes the still-pending integrated qualification.
An author-run full gate strictly built and failed closed on mandatory missing
`qualification`; it is a diagnostic, not final acceptance. The full gate routes
the additional notification test through its isolated actual PG fixture, preserving
execution of every added suite. No whole increment/G1 or external pass is claimed.


## Integrated executable coverage and qualification limits

The following map records executable local coverage. It does not close the whole
ledger obligations or attest independent review, release, COMPLETE or external
qualification. The first seven task results above remain historical controller
evidence; the integrated current-candidate reruns are recorded separately below.

| Ledger requirement / master sections | Mandatory executable coverage | Actual local behavior and refusals | External gate still unqualified |
| --- | --- | --- | --- |
| AF-01 / 2;7–10 | `contracts.test.ts`, `temporal-worker.test.ts`, `qualification.test.ts` | Typed deterministic session/effect and pinned continuation; actual native worker PID/command/child census, no child harness/VM; current scope and stale generation refusal; SDK history replay with zero model/write calls | Real model/profile/region conformance, remote service-worker containment |
| AF-05 / 2;8;12 | `durable-authority.test.ts`, `temporal-worker.test.ts`, `qualification.test.ts` | Actual original-key receipts/COMMIT ACK loss and locks; actual client process disconnect; SIGKILL and distinct empty-cache worker PID, same Task/Run/session/operation and persisted PostgreSQL/Temporal restoration; old generation denial | Remote Linux image, cloud fleet/HA/network partitions, production backup/restore |
| AF-09 / 2;20 | `dispatch-calendar.test.ts`, `dispatch-schedules.test.ts`, `qualification.test.ts` | Database-clock scheduled fires and empty-cache timer processes; explicit IANA DST gap/fold/non-hour offset, command/event/timer/claim dedup, overlap, expiry after observed SQL waits, bounded waits, consent and monitor/offboarding; checkpoint/unknown-effect recovery | Fresh recurring Task materialization, real service credential/enterprise connector/JML lifecycle, signed webhooks, distributed fairness/timer availability |
| AF-14 / 2;8;28 | `unknown-effects.test.ts`, `stop-fences.test.ts`, `qualification.test.ts` | Independent fsynced external success before lost ACK, worker/service recreation, original-operation GET-only settlement, unsafe absence/mismatch/unsupported lookup blocked, expired/revoked authority zero I/O, actual concurrent dedup; SDK replay zero model/HTTP/PG writes | Real supplier dedup/status/irreversible effects and billing, domain/human reconciliation judgment, disaster/power-loss recovery |
| AF-17 / 2;8;19–20 | `results-notifications.test.ts`, `notifications.test.ts`, `qualification.test.ts` | Executed bounded checks bound to exact immutable bytes/version/environment; draft/acceptance/publication separated; confirmed Delivery receipt required; old artifact/check/approver refusals before I/O; prior failed/partial/cancelled evidence and later separately approved linked Run preserved | Encrypted production object storage, general protected verifier profiles/design GUI/preview, real publication and charges |
| AF-19 / 2;6;21;26 | `stop-fences.test.ts`, `qualification.test.ts` | Actual both barrier race directions and local API/SDK/shell/file drivers; unsupported browser/GUI paths closed; current Stop/takeover fences, lease/driver quiescence and fresh-base reread; stale mutation, expired/revoked authority and automatic disconnect resume denied | Remote Linux OS/egress containment, real GUI all-path enforcement, hostile bypass and remote process termination |
| UX-08 / 31;6;8;26 | `stop-fences.test.ts`, `qualification.test.ts` | Real online stale progress Stop, concurrent stable idempotency receipt/current generation, unknown in-flight external report, accepted/dispatch-fenced/process-termination-pending separation; stale native/outcome writes denied | Physical mobile/offline delivery and real sleep/reconnect, measured pilot Stop/propagation timing |
| UX-18 / 31;8;20 | `notifications.test.ts`, `results-notifications.test.ts`, `qualification.test.ts` | Actual rejection, bounded retries, lost ACK and crashed/recreated broker/service; GET-only unknown send reconciliation; checked success/cancelled result retrieval from fresh brokers despite failed notification; successful hint cannot hide failure; audience/identity/cross-Space denials | APNs/FCM/real channel/push providers, physical devices, messages to people, distributed broker delivery and billing |

The integrated case links one deduplicated accepted command to actual client
connection closure and process exit, one exact approved downstream commit whose
ACK is withheld, SIGKILL of the worker and supplier, persisted Temporal service
restart, fresh generation2 worker and original-operation GET reconciliation.
Only after confirmation does one native turn run. Six concurrent stale-view online
Stop taps yield one generation3 receipt; stale generation2 model/outcome writes
fail. Current cancellation stores the checked bytes and confirmed publication
receipt; it cannot undo the external write. Actual notification rejection is
observed in one fresh broker and a different fresh broker retrieves the immutable
checked cancelled result. Dedicated notification cases additionally preserve a
successful checked draft through failure. Dedicated in-flight Stop cases retain
unknown effect IDs and prohibit automatic reconciliation/continuation after Stop.

Raw integrated history, supplier/notification journals, worker measurements and
all child stdout/stderr are emitted with byte counts and SHA256 before only the
owned fixture files are removed. Complete controller streams retain these raw
records. Fixture process/database/file cleanup is checked separately from the
controller's command-group cleanup metadata; historical PIDs are never signalled.
The local qualification platform is pinned Node22.22.3/pnpm10.18.0/TypeScript5.9.3,
PostgreSQL16.12, Temporal CLI1.4.1 embedded Server1.28.0 and SDK1.24.0 on Darwin
arm64, supervised trusted controllers, separate synthetic OIDC/PKCE and disposable
loopback targets. No real provider model, credential, person or remote deployment
is used.

Remote Linux containment/HA/backup, real supplier effects and billing, formal SSO
and human approval, real GUI all-path enforcement, physical mobile/push providers,
enterprise connector lifecycle and pilot timings remain explicitly unqualified.
Additional unqualified areas include signed distribution, approved production
region topology, encrypted object storage/delete propagation, general verifiers,
real provider status guarantees and full G1/G2–G5. Local races and process recovery
cannot establish a production SLA, power-loss safety or hostile OS containment.

Integrated controller checks and the index verification are pending at this
entry. The evidence index will retain actual job IDs, fingerprints, original log
paths, completion events, exit/timeout/workspace-change metadata and complete
streams for diagnostic failures as well as passes. Index updates after a checked
snapshot remain labeled post-check updates and do not manufacture a current
behavior pass. Fresh task checks and subsequent required independent reviews
remain controller-owned.


Initial integrated diagnostics `job-d35b402020` and `job-79cfb92d4c` retained
identity35/35, foundation17/17 and original G0197/197 + G1-local72/72 passes,
including native Electron outside the sandbox. Neither completed integrated
qualification. The first failed because the author rebuilt the shared output
while the controller was reading the required notification suite. Builds and
mutations now finish before checks launch. The second caught a new stricter TAP
guard requiring `tests == pass` against the old synthetic positive TAP fixture
without a `pass` line. Its positive fixture now includes the real complete summary;
additional mismatch/missing-pass/duplicate-summary negative assertions strengthen
that guard. No accepted G0/G1-local/F01/F02 check was changed. Complete failed and
passing raw streams/events are retained in
[qualification-controller.json](../../g1-recovery/evidence/qualification-controller.json).
An author-run integrated diagnostic failed closed on mandatory `ps EPERM` in the
sandbox, removed its owned PG container and preserved all666 hashes; only the
outside-sandbox controller can qualify that process behavior.


Controller `job-f181c4f5d0` reached the new integrated fixture and failed on an
actual lock timeout: the fixture used a locking product read while the worker
held the mutation barrier awaiting the intentionally withheld HTTP ACK. The
fixture now reads the durable committed unknown marker on an independent
read-only diagnostic connection, kills the actual worker, then tests the product
terminal-outcome refusal and recovery. The product lock timeout/barrier remains
unchanged. Cleanup exports available raw files even after an earlier assertion
fails; successful fixtures still require every history/worker/journal artifact.
Failed raw streams, available journal bytes and original cleanup metadata remain
retained without inferring successful cleanup from controller group status.

Controller `job-41a479062e`, fingerprint `git:71d9ca576de376cb5968705f`, passed
`node g1-recovery/scripts/check.mjs`: **237/237 test executions**, exit0, zero
failed/cancelled/skipped/TODO and no workspace-change flag. This includes229
unique cases; the8 calendar cases execute once standalone and again in the
unchanged bounded Dispatch runner. All666 entry hashes passed before/after.
The full integrated case had a disconnected actual client PID46384, killed
worker PID46381 and distinct recreated PID46396, generations1→2→3, one durable
external write, one original-operation recovery GET, zero recovery POSTs, one
native turn only after confirmation and six stable online Stop taps. The Stop
receipt reported dispatch fenced and termination pending. A fresh broker observed
notification failure and another retrieved the exact checked cancelled outcome,
artifact bytes and confirmed Delivery receipt. No successful external write was
undone or automatically repeated.

The [complete qualification index](../../g1-recovery/evidence/qualification-controller.json)
retains all actual jobs, full streams, metrics and original log paths under
`.loop/goals/agent-fabric-g1-f03-recovery/runs/checks/`. New generated Temporal/effect
histories, replay streams, supplier journals and worker measurement files are
copied byte-for-byte into unique append-only qualification evidence directories.
Integrated raw artifact diagnostic lines are decoded through exactly the TAP
reporter's escaped-backslash layer, then checked against their original byte
count/SHA256 before retaining a raw copy. Existing evidence is never overwritten.
This post-check index/document update requires the next four-command snapshot
and five-check task submission. Independent reviews and final controller
acceptance remain pending; this single-command diagnostic did not finish the task.


The four-command bootstrap controller job `job-2856caa255`, one fingerprint
`git:2377fe3038fc4a17751c5786`, passed all approved commands: full recovery237/237 executions,
identity35/35, foundation17/17, original G0197/197 and G1-local72/72. Every command
returned exit0; TAP failures/cancellations/skips/TODO were zero, and no
workspace-change flag was recorded. Retained checks actually ran pinned native
Electron44.5.1 outside the sandbox and the Android Metro bundle. All666 F03 entry
hashes,42 accepted foundation sources,597 protected files and88 original raw
files passed unchanged guards. The unchanged foundation command also ran its
previously approved bounded read-only remote system smoke; that observation does
not qualify remote worker containment, deployment, HA or backup.

Complete eight raw stdout/stderr streams, original completion events and result
metadata, plus new byte-exact histories/journals/worker/replay records are appended
to the same qualification index. This post-check evidence update records that
actual snapshot; it supplies no independent review verdict. The final five-check
task submission below must rerun after this update, including the evidence-index
gate. All external limitations remain unqualified and paid product APIs/new paid
resources/real credentials/remote deployment/messages to people remain OFF.


## Final qualification task submission

Final task controller job `job-e351c258a1`, fingerprint `git:fc04ca28adc2434ca7c2bb6b`, passed all five
approved checks: `f03-all-behavior`, `f03-identity-retained`,
`f03-foundation-retained`, `f03-original-retained` and `f03-evidence-index`.
Recovery237/237 executions (229 distinct cases), identity35/35, foundation17/17,
G0197/197 and G1-local72/72 passed with zero failure/cancellation/skip/TODO,
exit0 and no workspace-change flag. The evidence-index gate actually verified
original controller events, complete streams and byte hashes, retained generated
raw artifacts, one unchanged four-command snapshot and the explicit external
limits. The controller marked **f03-qualification done (8/8 tasks)**.

All666 entry hashes and unchanged accepted42/597/88 source/protected/raw guards
passed. Native Electron44.5.1 ran outside the sandbox and the Android bundle was
built. The complete final ten stdout/stderr streams, original paths/byte counts/
SHA256, job/finish events, result metadata and newly generated raw histories,
worker/replay records and supplier journals are appended to
[qualification-controller.json](../../g1-recovery/evidence/qualification-controller.json).
Controller command-group cleanup metadata is retained verbatim; owned fixture
PID/file/PG cleanup measurements independently passed. No historical PID or
preexisting resource was signalled or removed.

This is a post-check index/status update. Final controller acceptance and all
three actual independent15-minute reviews remain pending; no review signature,
COMPLETE or release/external pass is manufactured here. The unchanged
[remaining ledger](../planning/g1-remaining-ledger.csv) is not marked complete.
Remote Linux containment/HA/backup, real supplier effects and billing, formal
SSO/human approval, real GUI all-path enforcement, physical mobile/push providers,
enterprise connector lifecycle and pilot timings remain unqualified. Paid
product APIs/resources, real credentials, remote deployments and messages to
people remain OFF.


## Security repair SEC-F03-001 — turn11

The independent security finding was confirmed: migration7's local submitted /
unknown mutation journal did not previously block direct native continuation or
fresh conflicting I/O while the Run remained running and resource mode agent.
Earlier tests issued Stop first and did not establish this requirement. Historical
passes above remain evidence of their earlier candidate, not of this repair.

The repair adds the current local journal to the existing locked shared guard,
covering the originating Run and all enrolled Runs on the resource before model,
receipt reuse or new I/O. Its sole submitted-marker exemption is restricted to
the original invocation immediately after a successful fresh insertion; unknown
or repeated operation IDs have no exemption. Additive migration10 and a trusted
read-only domain observer provide immutable exact-binding reconciliation receipts.
Current human authority and measured quiescence are required; unknown, malformed,
unavailable or mismatched evidence cannot clear the block. No original uncertainty
record, old Stop receipt or generation is rewritten; Stop still cannot be undone.
The method remains outside online worker/client command APIs.

Controller mutation-proof job `job-5cc82dddff` temporarily omitted only the new
uncertainty predicate, reproducing the earlier source behavior. The strict
stop-races command built and ran53 cases:43 passed and10 failed, including actual
before-Stop model/new-ID/shared-Run calls fulfilling when rejection was required.
The restored repair passed53/53 in controller job `job-5c66ec1957`, exit0,
zero failure/cancellation/skip/TODO and all666 entry hashes unchanged. Actual
owned PostgreSQL, IdP, HTTP, shell and filesystem cleanup was measured. Complete
original failed/passing controller streams are retained in the existing
[fence evidence index](../../g1-recovery/evidence/fences-controller.json).

These cases in `stop-fences.test.ts` explicitly qualify local AF-14 / AF-19
refusals without relying on Stop, including repository recreation, original
submission COMMIT ACK loss, fresh operation IDs, a second shared-resource Run,
queued actual lock waits and zero model / zero new I/O. Reconciliation uses a
fsynced synthetic domain receipt and actual current file measurement; missing
status is never interpreted as safe absence. Lost reconciliation COMMIT ACK
recovers the immutable original receipt without another lookup or write. A proven
not-applied operation still cannot replay its original callback; a fresh explicit
operation is required. Original native receipt reuse cannot bypass uncertainty;
an unrelated resource continues normally.

The added missing-reconciliation-schema case and stronger new migration10 SQL
shape constraints are pending the full controller rerun at this entry. Full
recovery, unchanged identity/foundation/original regressions and current evidence
validation will be recorded after actual completion. Independent re-review and
final acceptance remain controller-owned and pending. Real supplier/domain
reconciliation guarantees, human approval judgment, remote Linux containment/HA/
backup, GUI all-path enforcement, physical devices/push, enterprise connector
lifecycle, pilot timings and power-loss safety remain unqualified. Paid APIs,
new paid resources, real credentials, remote deployments and messages to people
remain OFF. No old evidence is overwritten or treated as a current review pass.


Full diagnostic job `job-e9b3bf1ccf` preserved the added missing-schema refusal
and all unchanged regressions (identity35, foundation17, G0197/G1-local72,
native Electron/Android), but recovery stopped at51/54 fence cases: the new SQL
shape constraint mistakenly required unprefixed hex rather than the existing
`sha256:` contract. Valid reconciliation insertions correctly failed closed.
The new migration now uses the exact existing digest grammar and `IS TRUE` to
reject SQL-null proof fields. Added actual PostgreSQL negative insertions cover
unknown outcome, null/missing evidence, wrong operation and unprefixed digest.
No behavioral assertion or original guard was weakened. Original complete failed
streams and their completion event remain retained in the qualification index;
this diagnostic is not a whole-increment pass.


Corrected strict fence controller job `job-9905d64f58` passed55/55, exit0,
zero failure/cancellation/skip/TODO and all666 hashes unchanged. This includes
missing-schema refusal and SQL-null/malformed proof rejection. The final full
candidate additionally reads back the original immutable Stop receipt after
reconciliation and return, rather than relying on the earlier client copy.
Current full-suite and unchanged-regression rerun follows this post-check update.


Final repair controller job `job-a737482ebd`, fingerprint `git:85042b0f7619e220542065e9`,
passed all five approved qualification checks: full unfiltered recovery
**251/251 test executions** (243 distinct cases; the8 calendar cases retain
execution in both the standalone and unchanged Dispatch runners), unchanged
identity35/35, foundation17/17, G0197/197 and G1-local72/72, and the actual
evidence-index validator. Exit codes were0 with zero test failures, cancellations,
skips or TODO and no workspace-change flag. The full recovery suite includes
55/55 fence cases and the integrated real client/worker/supplier/Temporal/
notification recovery case. Fourteen new fence cases cover the reviewed defect
and its explicit safe local reconciliation path. All666 entry hashes and the
accepted42/597/88 source/protected/raw guards remained unchanged; native
Electron44.5.1 and Android Metro ran through the outside-sandbox controller.

The [qualification index](../../g1-recovery/evidence/qualification-controller.json)
retains all10 complete stdout/stderr streams with original paths, byte counts,
SHA256, actual job/start/finish/result events and new byte-exact raw histories,
worker measurements, replay streams and supplier journals. The earlier deliberate
mutation failure and SQL-constraint diagnostic remain visible. Controller group
cleanup metadata is retained verbatim; actual owned PID/database/file cleanup is
measured independently. No historical PID or preexisting resource was removed.

This appended index/document entry follows the checked snapshot and is explicitly
a post-check evidence update. SEC-F03-001 is repaired in source and passes the
new behavior cases; independent re-review and final controller acceptance remain
pending, with no author-issued review signature or whole-G1/external completion.
The previously listed real external environments remain unqualified and paid
product APIs/resources, real credentials, remote deployments and messages to
people remain OFF.

## Repair follow-up SEC-F03-002 / REC-F03-003

Both review findings were confirmed. The shared fence had omitted external unknown
operations on the same resource, and Dispatch/results counted local journals even
after definitive immutable reconciliation. The repair uses one current unresolved
predicate for shared native/model and I/O guards, Dispatch admission/recovery and
terminal results. Only local entries without definitive evidence remain uncertain;
external dispatched/unknown/reconciling bindings fence every enrolled shared Run.
Original journals, migration bytes and immutable Stop receipts are preserved.

The original acknowledged external claim permits one dispatch invocation in its
repository instance. Lost COMMIT ACK, repeat or recreated instances cannot POST.
Read-only reconciliation and current originating worker-generation replacement
remain available without admitting model/new I/O. Exact delivery-status refresh
remains a metadata-only evidence synchronization with current identity, approvals,
audience, artifact, target and lease checks. This preserves the existing publication
assertion that transport ACK alone leaves delivery unknown.

New actual PostgreSQL cases carry both applied and not-applied local receipts
through recreated schedule recovery/admission and final checked artifact outcome.
An occurrence blocked before submission now rechecks all gates before queueing;
an admitted occurrence missing its checkpoint still requires a worker fence and
explicit read-only resume. Completion enqueues notifications in its transaction;
an actual loopback HTTP rejection changes notification status to failed while a
fresh broker retrieves identical succeeded result and checked bytes. Unknown
operations refuse every terminal status, and original callbacks never replay.
Existing tests also read the immutable old Stop receipt after domain resolution.

Strict controller job `job-8ddf15bd8a` passed **59/59** fence/recovery cases, exit0,
zero failure/cancellation/skip/TODO and all666 entry hashes unchanged. This includes
five observed queued SQL transactions (native, API, SDK, shell, filesystem) behind
a real external fsynced write which loses its HTTP ACK, and an independent supplier
with one exact-approved POST, one durable write, one original-operation GET and
zero shared model/conflicting I/O before settlement, without issuing Stop.

Deliberate regression mutation job `job-74e19335d4` removed external uncertainty
from the shared predicate and ignored definitive local reconciliation receipts.
The unchanged strict tests built and ran59 cases:52 passed, **7 failed**, including
both new external cases and both applied/not-applied schedule-result journeys.
The repair was restored immediately after completion. The
[fence evidence index](../../g1-recovery/evidence/fences-controller.json) preserves
complete original failed/passing streams, hashes and actual completion events.

Diagnostic job `job-39a4bedcbf` exposed impossible generation-based resume for a
never-admitted occurrence (57/59), which the current recovery fix addresses.
Earlier full diagnostic `job-692084172b` exposed the overbroad delivery-refresh
block (29/30 results cases); its original publication test stayed unchanged.
That diagnostic passed unchanged identity35, foundation17, G0197/G1-local72 and
outside-sandbox Electron/Android, but it is not a whole-repair pass; source changed
after its recovery failure while regressions were still running. Its original
streams are retained in the same index. The dedicated qualification recorder
correctly refused this acceptance-scoped diagnostic because its IDs were outside
that recorder's approved task checks; no validator or recorder was weakened.

Full current qualification and index verification follow this entry. Independent
re-review and final acceptance remain controller-owned. Real supplier status/dedup,
human domain judgment, remote Linux isolation/HA/backup, production Temporal/PG,
GUI all-path containment, physical push/mobile, enterprise connector/identity and
provider billing remain unqualified. Paid APIs/resources, real credentials,
remote deployment and messages to people remain OFF.

The evidence validator also rejected the generic fence recorder's last-suite-only
TAP summary when preserving the multi-suite acceptance diagnostic. The additive
recorder now sums all actual TAP summaries, matching the unchanged validator.
Only that new diagnostic entry's derived counts were corrected; original streams,
events, hashes and all earlier entries were preserved. Read-only index validation
passes again. This metadata fix occurred during the current qualification run;
that run is diagnostic, and the stable final candidate will be rerun after its
complete streams have been recorded.

Full repaired diagnostic controller job `job-ef56501fa5`, final result fingerprint `git:225753f73c297fd1e0e4e3ef`,
passed all five qualification checks: **255/255** recovery executions (247 distinct
cases; calendar8 still executes twice), unchanged identity35, foundation17,
G0197/G1-local72 with actual outside-sandbox Electron44.5.1 and Android, and the
unchanged evidence validator. All suites reported zero failure/cancellation/skip/
TODO, exit0; the final controller records correctly flag workspace changes for
this diagnostic because evidence metadata changed during execution. Complete original
streams and new raw histories/journals are appended in the
[qualification index](../../g1-recovery/evidence/qualification-controller.json).
The evidence recorder/doc metadata was updated during this job as disclosed above;
the code repair stayed unchanged. A final stable-snapshot rerun follows this
post-check evidence update, with review/final completion still controller-owned.

Final stable repair controller job `job-7c12377169`, fingerprint `git:831a3ca97fef22c8e914339e`,
passed all five approved qualification checks with **255/255** recovery executions
(247 distinct cases, calendar8 twice), identity35/35, foundation17/17,
G0197/197 and G1-local72/72, actual outside-sandbox Electron44.5.1/Android and
the evidence-index gate. Every exit was0; all tests reported zero failures,
cancellations, skips or TODO. All five final result records share the same
fingerprint and have **no workspace-change flag**. Entry666 and accepted42/597/88
source/protected/raw guards remain unchanged. Both original failed diagnostics
and the deliberate seven-failure regression proof remain retained.

The qualification index appends complete original streams, actual start/finish/
result events, byte-exact new raw histories, worker measurements and journals.
This index/document append follows the checked stable snapshot and is explicitly
a post-check evidence update. Source repair is locally verified; independent
security re-review and final acceptance remain controller-owned, with no author
review signature or whole-G1/external qualification claim. Previously listed real
external environments remain unqualified and paid APIs/resources, real credentials,
remote deployments and messages to people remain OFF.

Controller job `job-47b1cd793a` separately passed the unchanged evidence-index
command after the final logs and documentary correction were appended, exit0.
Its original stream/event/result is also retained in the qualification index.
## Turn 16 — native final-answer publication completion repair

REC-F03-004 was a local AF-17/master §8 defect: confirmed publication could finish
while running, but its real native final answer changed the Run to verifying and
session to finished, after which delivery refresh and completion wrongly used the
executable effect guard. Delivery metadata now uses a separate current-access
mode. Only confirmed receipt synchronization permits verifying/succeeded;
dispatch, lookup/reconciliation and resume retain their execution-state limits.
The same exact identity/approval/audience/target/artifact/check/lease/budget/
generation validation runs before and after metadata updates. Space/resource
fences still reject conflicting unknown operations, Stop and stale workers.

The unchanged strict result command, controller job `job-c28dca9675`, first ran
the new native completion regression against the unrepaired code: **55/56**
passed, with the new case failing at delivery refresh with STALE_AUTHORITY after
two committed native turns. No test was disabled or removed. Expanded repaired
diagnostics `job-2fc3edf46c` and `job-eae7ea375d` each passed **63/64**; both failures
were new test expectations for rejection codes, while the product correctly
denied access (source audience returns AUDIENCE_DENIED; the old executor scope
after membership revision returns STALE_AUTHORITY). Expectations now assert each
gate's exact existing code. All three original failed streams/results remain in
the [result evidence index](../../g1-recovery/evidence/results-controller.json).

Final slice job `job-3733505dbc` passes **64/64** (notification24/result40), exit0,
zero failure/cancellation/skip/TODO and all666 entry hashes unchanged. Ten new
cases prove actual PostgreSQL/native/independent HTTP composition, fresh
repositories between turns and completion, concurrent identical successful
outcomes with exactly one immutable outcome and one pending notification per
authorized recipient, recovered confirmed delivery and checked artifact bytes,
zero additional POST/model calls, unconfirmed verification refusal and the eight
current-authority/fence denials. Executable effect access after the native final
answer remains refused. Controller streams include the exact operation IDs,
outcome digests and observed native verifying/finished state.

The result index/document append follows the checked slice snapshot. Full stable
qualification, independent review and final acceptance remain controller-owned.
Real supplier status/dedup and billing, enterprise SSO/human approval, remote Linux
isolation/HA/backup and production Temporal/PostgreSQL, all-path GUI containment,
physical mobile/push, enterprise connector lifecycle and pilot timings remain
unqualified. Paid APIs/resources, real credentials, remote deployments and
messages to people remain OFF.

Full stable repair job `job-698e85cd70`, fingerprint
`git:7f158f939cf60446be300223`, passed all five qualification checks:
**265/265** recovery executions (257 distinct cases; calendar8 runs twice),
identity35/35, foundation17/17, original G0197/197 and G1-local72/72 including
actual outside-sandbox Electron44.5.1/Android, and evidence-index validation.
Every check returned exit0; behavioral suites reported zero failures,
cancellations, skips or TODO. All five original result records have the same
fingerprint and no workspace-change flag. Entry666 and accepted42/597/88
source/protected/raw guards remain unchanged.

The [qualification index](../../g1-recovery/evidence/qualification-controller.json)
appends complete original controller streams/events/results and byte-exact raw
histories, replay measurements and journals. This index/document update follows
the stable checked snapshot; the source repair remained unchanged throughout the
job. Independent re-review and final acceptance remain controller-owned, and all
previously listed real external qualifications remain unclaimed.

## Turn19 — Pause dispatch repair (REC-F03-005)

The finding is confirmed. Previously, a legal paused checkpoint retained the
prepared exact-approved operation, session and live lease, and dispatch could
move the Run to reconciling and POST without explicit resume. New prepared
claims now require running; the actual one-use dispatch I/O guard rejects paused.
Read-only original-operation reconciliation and confirmed delivery metadata keep
their existing authority/fence checks. Dispatch now records resource wait with
`run-not-executable` for paused Runs. Schedule resume does not resume the Run.

Red controller job `job-455d3964a9` proves the regressions detect the unrepaired
behavior: effects **24/29** (all five new cases fail on missing expected denials)
and Dispatch/calendar **56/59** (all three new cases fail on admission/dispatch).
Every prior case passes. Complete original failed streams and exact recovery
histories remain append-only in the [effect index](../../g1-recovery/evidence/effects-controller.json)
and [Dispatch index](../../g1-recovery/evidence/dispatch-controller.json).

Repaired controller job `job-dcf55e3c84` passes effects **30/30** and
Dispatch/calendar **59/59**, both exit0 with zero failure/cancellation/skip/TODO.
Nine additive cases cover actual PostgreSQL, independent fsynced loopback HTTP,
recreated repositories, running-only fresh claims, prepare/Pause/dispatch,
Pause-before-claim and both observed Pause/I/O lock orders, including acknowledged
claim/Pause-before-I/O. A denied send consumes the one-use claim; recreation and
retry cannot POST. Read-only original lookup remains possible while paused, and
an absent outcome cannot authorize resume/retry. If I/O holds the lock first,
Pause commits after its transaction; the confirmed original operation cannot
replay. Prepared direct and scheduled operations remain unchanged until explicit
current-authorized Run resume, which permits exactly one original POST.

The core migration4–6 effect fixture exercises the legal checkpoint race with
real Run locks. The installed migration7 uncertainty barrier already refuses
generic checkpoints once an effect is unknown; it is unchanged. Scheduled
Pause-before/after-admission tests exercise the installed Space/resource barrier.
Paused read continuations remain waiting with no submission/checkpoint/model;
resuming the schedule alone does not authorize execution.

Entry666 hashes and previous accepted checks/raw evidence remain unchanged.
These slices qualify the local paths only; full current-snapshot qualification,
independent re-review and final acceptance remain controller-owned. Production
Temporal/PostgreSQL and remote Linux isolation/HA/backup, supplier status/dedup
and billing, enterprise SSO/human approval, all-path GUI containment, physical
mobile/push, connector lifecycle and pilot timings remain unqualified. Paid
APIs/resources, real credentials, remote deployments and messages to people
remain OFF.

Full qualification job `job-9d1a00ae31`, stable fingerprint
`git:c0667f6796eba0554d35e54b`, passes all five unchanged qualification commands:
**274/274** recovery executions (266 distinct cases; calendar8 runs twice),
identity35/35, foundation17/17, original G0197/197 and G1-local72/72, including
actual outside-sandbox Electron44.5.1/Android and evidence-index validation.
Every check returns exit0 with the same fingerprint and no workspace-change
flag; all behavioral suites have zero failure/cancellation/skip/TODO. Entry666
and the accepted42/597/88 source/protected/raw guards remain unchanged.

The [qualification index](../../g1-recovery/evidence/qualification-controller.json)
appends complete original streams/events/results and exact raw histories,
journals and replay measurements. This index/document append follows that
stable checked snapshot; the source repair remained unchanged throughout the
job. Independent re-review and final controller acceptance remain pending.
The previously stated real external qualification limits still apply.

## Turn22 code-review repair — generic completion and migration restart

Both findings are confirmed. The installed migration9 result profile now refuses
generic terminal/result checkpoints, including configuration omission; atomic
qualified completion remains the only terminal path. Isolated legacy migration4
fixtures retain generic completion. `migrateRecovery` now validates pinned4 and
compatible installed5–10 digests/prerequisites without reapplying4; changed,
unknown or orphaned migration ledgers remain refused. No migration SQL, accepted
check, protected dependency or historical raw evidence was changed.

Fourteen added `results-notifications.test.ts` cases cover AF-17/UX-18 completion
and AF-05 upgraded restart. Actual full-profile PostgreSQL cases reject missing
artifact, unchecked/failed checks, checked but unpublished results, awaiting
approval, all terminal statuses and configuration omission. Refused commands
commit no result/receipt/outbox/outcome/notification writes. Fresh repositories
retain the exact original snapshot and can finish through the qualified path,
persisting matching Run/Task/outcome and notification intents. A separate case
retains the existing malformed nonterminal schema refusal. Both competing
completion orders observe Run-row and Space-barrier blocking and preserve one
qualified outcome. The complete4–10 sequence reruns twice with unchanged schema,
functions/ACLs/policies, all fabric data and all three ledger timestamps; every
installed digest corruption, unknown11, missing4 and changed4 SQL is refused.

Controller results and complete original streams/events are appended to the
[results index](../../g1-recovery/evidence/results-controller.json):

- `job-85ab260f5b`: original40 result cases pass; five actual publication bypasses
  and the composed migration rerun fail as expected. Six new proposals were
  malformed test fixtures, so those failures do not qualify the repair.
- `job-e58c8151d2`: the five bypass cases and composed migration repair pass;
  result46/52 exposes the six malformed fixtures. Original migration4 authority
  behavior passes28/28. All failed streams remain preserved.
- `job-e7a8433747`: after correcting the proposals, temporarily restoring both
  old admission defects reproduces eleven defect-specific failures. Two added
  race fixtures wrongly expected both transactions at the Run row and time out;
  these are fixture failures, not defect proof. The installed Space barrier
  serializes the second transaction before that row. The malformed-input case
  and all40 original cases pass. Both repaired sources were then restored.
- `job-d2788d4755`: corrected blocking observations and repaired source pass
  results54/54 plus notifications24/24, exit0 with zero failure/cancellation/
  skip/TODO. All666 entry hashes remain unchanged. No checks or assertions were
  removed or weakened.

These are local controller slice results and the index append follows the checked
snapshot. Full integrated qualification, independent review and final acceptance
remain controller-owned. Production Temporal/PostgreSQL, remote Linux isolation/
HA/backup, real supplier effects/dedup/billing, enterprise SSO/human approval,
GUI all-path containment, physical devices/push and connector lifecycle/pilot
timings remain unqualified. Paid APIs/resources, real credentials, remote
deployments and messages to people remain OFF.

Turn22 full qualification job `job-199fe285bf`, stable fingerprint
`git:8075defcbfd68f2f50e02c55`, passes all five unchanged qualification commands:
recovery **288/288** executions (280 distinct cases; calendar8 runs twice),
identity35/35, foundation17/17, original G0197/197 and G1-local72/72 including
outside-sandbox Electron44.5.1/Android, and evidence-index validation. Every check
returns exit0 with the same fingerprint, no workspace-change flag, and zero
behavioral failure/cancellation/skip/TODO. All666/42/597/88 retained guards remain
unchanged. The [qualification index](../../g1-recovery/evidence/qualification-controller.json)
appends complete original controller streams/events/results and exact raw history,
replay, worker and journal copies. This index/document append follows the checked
snapshot; repaired source remained unchanged throughout qualification.
Independent re-review and final controller acceptance remain pending; all stated
real external environment limits still apply.
