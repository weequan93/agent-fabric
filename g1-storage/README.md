# G1-F05 owned storage contracts

Turn45 / v2 plan: f05-01–03 are controller-done. f05-04 now implements explicit
source admission and an atomic canonical user-asserted save. Controller diagnostic
`job-a78c026e25` passes atomic-save14/14 and source-content12/12. The current task
completion record is owned by `.loop/STATUS.md`; these diagnostics do not qualify
the whole increment. The approved plan has55 tasks and preserves every earlier
note, check, requirement and failure limit.

`KnowledgeSaveRepository.source()` requires `SourceCommand.saveReusable: true`,
current native maintenance identity/audience, installed key/generation controls,
finite `local-fixture-v1` admission and exact narrative digest. Its `source-accepted`
response identifies encrypted provenance. `save()` consumes that committed current
same-Space source with an explicit SaveCommand assertion. It seals KnowledgeSchema
and commits accepted head/current witness, revision, immutable Saved here receipt,
knowledge-committed event and required pending outbox in one authenticated transaction.
Head and command/outbox forecasts enter the exact controls digest before reserve;
the final digest and identity/native/source/time checks run after every write.
No piece is inserted after COMMIT. Deferred/forward composite FKs reject partial
canonical publication. Receipt metadata never carries descriptive source or value.

Migration14 is additive from13 and tests with representative encrypted source
history. A failed migration rolls back completely; a committed migration has no
SQL down path that discards acknowledged data. Reads use scoped primary keys;
source/subject/tail indexes support later bounded consumers. Subject/tail retrieval
and large-data performance are not qualified by these small fixtures.

Saved here follows a confirmed COMMIT and original-key witness reconciliation.
Rollback returns Not saved; a post-COMMIT acknowledgment failure returns unknown
with replayAllowed:false and the copied original key. `lookupSave()` performs only
current authorized original-key metadata reconciliation. HTTP unknown handling,
automatic identical-original retry, proposals/verification/status transitions and
CAS correction remain the separate f05-04 successors. The mandatory f05-04-gate
must pass complete knowledge/commands integration before f05-05.

Shared assertions live in `tests/helpers/register-atomic-save-tests.ts`; the fixed
component wrapper imports them without case filtering. Future full integrations
must import these same assertions. Runner/build/fixture/observation/cleanup behavior
and the64-case/420-variant frozen aggregate registry are unchanged. Evidence and
all remaining external gates are indexed in
[evidence/f05-04-atomic-save-v1.json](evidence/f05-04-atomic-save-v1.json).

## Historical substrate state (retained turn34 notes)

Current increment state: f05-01 contracts and f05-02 authority are controller-done.
f05-03 encrypted storage substrate is controller-done; the plan is3/15.
Task-completion job `job-96e4c3903b` passes encryption8/8 and staging75/75. Installed ciphertext/head publication now
consumes exact staging under current original-command authority; recreated outcomes
verify both PostgreSQL protocol rows and independent committed head history. A
consumed staging outcome grants no canonical save receipt, replay or serving access.
f05-04 is active: encrypted attributed source PG payloads now publish in the
same authenticated head transaction through `src/source-content.ts`, with current
same-Space reads. Diagnostic `source-content` passes11/11, authority118/118 and
staging75/75 under controller `job-52a2afb24d`. Source publication provides no
Saved here/knowledge receipt; canonical knowledge/save/event/outbox remains f05-04; class-specific
artifact/live-file/draft/checkpoint owners belong to f05-05. Content serving,
retention propagation, saved-decision Ask, actual restore, full E01–E04 inventory,
aggregate/independent/final acceptance and external qualification remain pending.

Turn25 adds authenticated durable preparation through
`src/staging-preparation.ts`: installed current material, actual authenticated
UoW/all-party audience/native maintenance/Stop/current policy and original-key
serialization gate immutable scoped reservation and byte/manifest confirmation
in migration11. Final controller encryption8/8 and staging21/21 pass;
compatibility authority118/118 and migration8/8 also pass. Full failed/repaired/
final streams are retained in `evidence/f05-03-preparation-v1.json`.
Preparation keeps every unconsumed upload pending and GC-protected. Publication
explicitly refuses until the authenticated outcome/reachability owner is
integrated; there is no canonical save or serving receipt. That integration,
verified abandonment/GC, staging rollback/wire uncertainty and process-kill
recovery remain within active f05-03. Synthetic material capabilities and local
filesystem behavior do not qualify external authority, KMS or storage durability.

Turn28 adds explicit `AuthenticatedStagingPreparation.recovery()`. The installed
capability requires current authenticated maintenance policy/independent epoch,
original actor, exact native maintenance admission/source Task/current full audience,
and unchanged installed material/root/generation under the same Space/original locks.
It reconciles or abandons an existing unreachable upload after original expiry or
actual native Stop, then enables bounded quarantine/GC. It cannot reserve, confirm,
publish, inspect reachable bytes, resume a native run or permit replay. Pending
and absent outcomes remain `replayAllowed:false`; genuine UNKNOWN_COMMIT requires
original outcome reconciliation. Revoked current identity/audience/maintenance
still refuses cleanup. Surviving current PG and material authority remain required;
independent terminal anti-rollback and canonical publication remain pending.

From the repository root:

```sh
node g1-storage/scripts/build.mjs
node g1-storage/scripts/check-component.mjs contracts
node g1-storage/scripts/check-component.mjs migration
node g1-storage/scripts/check-component.mjs authority
node g1-storage/scripts/check-slice.mjs contracts
node g1-storage/scripts/check.mjs
```

The aggregate accepts no arguments and intentionally fails until all ten frozen
suites, every case and required variant, and the owned fixture exist. Component
and slice results are diagnostics. Checks parse actual Node test results; missing
cases, variants, failures, cancellations, skips/TODO and failed final guards fail.

Node 22.22.3, pnpm 10.18.0 and all 18 offline dependencies are pinned. Installation
uses the frozen lock, ignores scripts and never pulls an image. Build removes only
its own reproducible `node_modules/.cache/storage-build`, rejects symlinked cache
parents, compiles installed F01–F04/native sources there and copies 24 migration
assets byte-for-byte. It never invokes sibling build/check/install commands.
[dependencies.json](dependencies.json) records 17 available notices, two missing
installed notice sets, unknown vulnerability/license sufficiency, and explicit
update/requalification responsibilities.

[The plan](../docs/planning/g1-f05-plan.md) records the resource-domain extension,
record/field encryption and retention inventory, API and commit/recovery semantics.
The frozen test-design mapping has 96 requirements, 64 local cases, three separate
controller G cases and nine pending X gates. Registry variants name executions;
they do not certify that any behavior has happened.

Ask and deterministic maintenance share `StorageServiceAccounting` on the same
authenticated transaction. F04 owns reserve/settle/budget arithmetic. The borrowed
UoW cannot begin or commit, use a cloned scope or outlive its callback. Work stages
content; the publication callback runs after settlement and fresh native/policy
checks while transaction locks remain held. Only the outer authenticated UoW's
acknowledged COMMIT may be reported as a save. Private values never enter F04
TaskContextSourceStore, native model turn input, or model request/response history.

The contract component's SQL-shape probe checks orchestration and owner identity;
it is not real PG, IdP, allowance or contention evidence. Those checks remain
mandatory in authority/admission/maintenance suites. Local software-port observations
will not qualify provider storage/KMS, remote runtime containment, disaster recovery,
real identity/providers, physical clients or G2 retrieval quality.

The migration component requires the host controller execution surface for real
process census. It creates cached PostgreSQL16.12, a separate-process F02 IdP and
four owned filesystem roots; it fails if ownership/cleanup cannot be proved. The
independent resource-subtype migration preserves installed accounting owners and
proves actual Ask/maintenance prepare/settle without computer assignment.
[Interim evidence](../docs/evidence/g1-f05-acceptance.md) retains both failed runs
and the passing component. Head/command/outbox/sharing
mutation remains f05-02 work; local independently acknowledged refresh and policy
publication are implemented. The authority component
now checks an independent installed epoch/control-digest witness, immutable scoped
heads/restrictions/original commands/pending jobs and closed finite policy, using
the actual F02 live full audience and F04 native service guard. Initial enrollment remains fixture-only; current refresh and policy publication
use the authenticated bounded local journal protocol. No content payload read/save,
retention propagation, restore or production anchor persistence is qualified.

The authority component now also qualifies explicit group/share-to-group/share
opaque source references in the same tenant. The fixed-path control bridge keeps
source tables isolated, uses the exact installed F02 full live audience and both
payers, and compares separately installed source and destination epoch witnesses.
Both sharing directions acquire sorted F03 barrier keys before inspecting controls.
Call sharedEntity before single-Space authority/native/accounting locks; the future
content disclosure owner must predeclare and sort its entire dependency lock set.
Sharing enrollment/revocation is fixture-only, Personal export is unsupported, and
this component does not decrypt or deliver a source. Installing v3 extends the
witnessed control projection; existing v2 epochs fail closed until trusted fresh
publication. Seamless live migration and durable external anchors are unqualified.

The authority component now uses the actual StorageServiceAccounting adapter with
live installed storage authority for Ask and maintenance. forSharedSources accepts
a bounded list of unique opaque relation references, resolves their enrolled source
Spaces and acquires the entire sorted dependency Space set before native/accounting
locks. Both sharing directions and two source references across three Spaces were
observed in PostgreSQL. Each accounting boundary rechecks those current sources.
Recreated adapters retain one installed settlement per receipt; accounting replay
does not establish content-command idempotency. Work/publication interruption,
missing witness, allowance exhaustion, Stop, expiry after actual allowance waits
and settlement, source-grant changes and maintenance-grant removal roll back or
refuse without new accounting effects. Head/command/outbox/sharing mutation and encrypted content publication remain unqualified. Control-only
epoch refresh and original-key reconciliation now have the local diagnostic described below.

The authority component now runs `EpochPublicationRepository` with a separate owned
authority root and `EpochWitnessJournal`. Immutable, bounded hash-chain events use
fsynced exclusive staging files, hard-link CAS and directory fsync. One-time witness
installation remains a trusted fixture capability. Pending publication returns no
serving anchor until authenticated original-key lookup observes the exact unchanged
previous controls or the committed next epoch under the Space/original-key barriers.
The fixed-path function refreshes an unchanged epoch only and retains a scoped
immutable original-command receipt; serving roles gain no table write privileges.
Real PostgreSQL wire loss covers both a committed transaction with its backend ACK
dropped and a COMMIT request dropped before delivery, plus rollback, ACK interruption,
two actual lookup/publisher waiters, journal CAS, timeout, truncation and substitution.
No automatic/new-key replay follows an unknown result or serialized absence.

This is local control publication, not content save/forget or production disaster
recovery. Head/sharing mutation still belongs only to fixture enrollment; exact source-revision restriction now has the separately versioned service owner described below.
The original refresh journal branch rejects changed policy/control digests. A separate
version2 policy-reduction branch is described below.
The roots share one host and journal state is bounded to 1,024 events per Space with
no compaction or external anti-rollback service qualified. Full host/disk loss, malicious
concurrent filesystem replacement and hardware power loss remain unqualified.


`PolicyPublicationRepository.reduce` requires the separately enrolled synthetic
`storage:policy-admin` grant, current task/maintenance grants, authenticated native
maintenance service session and live full audience. Ordinary contributors and valid
maintenance callers do not inherit policy powers. The fixed-path SQL owner also checks
the dedicated grant and validates the exact closed operation subset, unique operations,
finite per-class period reductions and consecutive policy/epoch publication. Maintenance
is retained for recovery; authority expansion requires a separately authorized workflow.
No request supplies epochs, anchors, digests or administrator identity.

The version2 journal reservation pins previous/next closed policies and exact next
policy/epoch/control digest, blocks serving, and shares original-key serialization
with refresh. Recreated lookup verifies the committed original policy marker or exact
previous-state absence before witness ACK. Historical policies remain immutable and
cannot authorize current reads. Scope/role/expiry/native failures, real wire COMMIT
loss in both directions, rollback, policy corruption, actual duplicate/lookup waiters
and administrator-grant removal have controller diagnostics in
[evidence/f05-02-policy-v1.json](evidence/f05-02-policy-v1.json).

This path qualifies synthetic policy metadata and current operation refusal. It does
not yet shorten previously stored payload deadlines, propagate retention/delete to
descendants or backups, implement enterprise holds/region/administrator UI, or recover
pending commands after their original native binding is revoked. Those capabilities,
encrypted payloads, useful saved-decision Ask, content restore, aggregate acceptance
and all external gates remain pending. Fixture administrator grant enrollment is
local synthetic setup; no real credential/access-setting or shared environment changed.


`SourceRevocationRepository.revoke` is an authenticated, monotonic restriction of an
exact currently accepted source ID/revision/witness. It requires current forget/task/
maintenance authority and policy, a real native maintenance service binding and the
full current audience. No command can unrevoke or supply scope/epoch/anchor/digest/
time/kind. Migration6 installs an immutable forced-RLS scoped original marker and
one fixed-path/revoked-PUBLIC SQL function; serving roles receive no table write grants.
Restriction, epoch and original receipt publish atomically in the actual F02 UoW.

A separate version3 independent-journal reservation binds that exact source and
recorded time, advances one epoch, retains policy revision and changes control digest.
Existing refresh/policy-reduction transition rules remain intact. Original-key lookup
compares exact marker binding/head witness/restriction epoch/time/current digest and
reserved old/new anchors before ACK; pending/unknown blocks serving, without automatic
replay. Rollback, ACK corruption/gap, observed original-key timeout, both genuine
wire-loss outcomes, actual PG waiters/single restriction, live grant/expiry/role/scope
refusals and recreated metadata readers have controller diagnostics in
[evidence/f05-02-source-v1.json](evidence/f05-02-source-v1.json).

This qualifies exact source-revision metadata suppression. Canonical source/head
creation, payload forget/erasure, derived invalidation/outbox propagation, generic
connector revocation, retention deadline application and two-sided sharing mutations
remain pending. Independent recovery after original-native revocation is also pending.
Encryption, saved-decision Ask, actual content restore, aggregate/final acceptance and
all external qualification gates remain unqualified; f05-02 stays active.


`TombstonePublicationRepository.forget` publishes current deletion control only for
an exact accepted class/ID/revision/witness with installed same-Space Task lineage.
Real F02 scope/full audience, F03 barriers and F04 native maintenance guards enforce
current forget/task/maintenance grants and policy. Migration7 installs an immutable
forced-RLS marker and fixed-path/revoked-PUBLIC function with controller SELECT/EXECUTE
only. Tombstone/epoch/original receipt commit atomically. A version4 independent
journal reservation pins exact entity/time and same-policy/changed-digest anchors;
original-key reconciliation verifies exact marker/head/tombstone binding before ACK.
Pending/unknown/corrupt authority suppresses reads and never permits blind replay.

Controller diagnostics include source/knowledge read suppression, same-ID class
isolation, missing lineage and changed-class refusal, real rollback/COMMIT loss in
both directions, ACK corruption/timeout, actual two-waiter/single-publication races,
live grant/expiry/native/role negatives and unchanged migration lineage. See
[evidence/f05-02-tombstone-v1.json](evidence/f05-02-tombstone-v1.json). This is a control
receipt; physical erasure, full forget responses, descendant propagation, backup
handling and restore are pending. Canonical head/command/outbox/sharing mutation,
encryption, useful Ask, aggregate/final acceptance and external gates remain pending.


Turn18 adds `ForgetWorkRepository` and migration8: exact tombstone, immutable scoped
command receipt and one pending outbox intent commit atomically under a version5
independent witness reservation. The caller cannot supply receipt/job IDs or control
epochs. `pendingWork` exposes `propagation-pending` only; no physical erasure,
worker consumption, descendant completion or full forget receipt is qualified.
Missing-job/cross-protocol recovery, partial command-before-outbox rollback, real wire
UNKNOWN_COMMIT, actual two-waiter contention and current grant/native/expiry denials
pass in controller `job-a1188914fd`: authority78/78, migration8/8, all six violation
counters0 and2,581 unchanged inputs. Full raw streams and all prior index hash links:
[evidence/f05-02-forget-work-v1.json](evidence/f05-02-forget-work-v1.json).
Accepted-head/sharing service mutation remains f05-02 work; content and all external
qualification remain pending. Index/docs additions follow the diagnostic candidate.


Turn21 adds `HeadPublicationRepository.publish` with an installed opaque
`HeadMaterialResolver`. A request supplies only material ID, expected prior
class/ID/revision/witness and native original-command controls. The trusted owner
resolves scope/lineage/witness/key/generation/deadline; all11 classes require an
installed same-Space Task and current full F02 audience. New heads begin at1;
updates require exact current expected revision and cannot reuse restricted or
expired heads. Policy bounds the new deadline. No material capability comes
from request JSON or a backup. This synthetic material resolver supplies controls
only; encrypted staged objects and canonical payload commands/jobs are pending.

Migration9 adds immutable forced-RLS `storage_head_publications` with exact
composite references to head controls, installed lineage, expected prior witness
and original epoch publication; controller SELECT/EXECUTE only. Journal6 binds
exact scoped material, original opaque ID, expected reference and database time.
Projection and actual controls must agree before original-key recovery can ACK.
Two observed PG waiters, partial entity-before-head rollback, both genuine
COMMIT-wire outcomes, expired/material/current audience/native/grant/role/foreign
controls and all11 same-ID class isolation have mandatory component checks.

The original sharing bridge selected `epoch::text AS epoch ORDER BY epoch DESC`,
which chooses9 ahead of10. Migration9 adds `storage_shared_controls_v2` with
qualified numeric epoch order, preserving the original function and migrations1–8.
Shared reads require v2; no fallback to the stale selector. Its full8 control
projections keep the historical row/field/numeric/timestamp encoding. The new
integration child retains v1's actual9 result, compares v2 to exact scoped PG rows
and verifies the existing real source restriction after service head publication.
The [complete head evidence index](evidence/f05-02-head-v1.json) retains every
controller attempt, cleanup and diagnostic. f05-02 stays active: authenticated
two-sided sharing mutation and canonical content-command/outbox publication are
next. Full encrypted persistence/recall/conflict/propagation/Ask/restore, aggregate
acceptance and all external qualification remain pending.


Turn22 adds `SharePublicationRepository` with an installed `ShareMaterialResolver`.
Closed requests never choose source scope, relation/lineage, control epochs or
anchors. Sorted two-Space barriers, current full F02 audience/payers, sender source
share/task-write permission, destination maintenance/share authority and exact F04
native maintenance service gate publication. Migration10 adds immutable exact
original-receipt/relation/source-witness FKs and fixed/revoked-PUBLIC functions;
SQL1–9 and their original catalog/ledgers remain unchanged. Journal7 witnesses
incoming destination controls and pins the independently held source anchor.
Original-key recovery works without the material owner; pending/missing/corrupt
controls block serving and confer no replay. Source restrictions suppress shared
reads; metadata relations do not grant a content-copy/publication exception.

Controller `job-280c43de62` passes authority117/117 and migration8/8,
six violations0/2,581 protected inputs unchanged. Source-journal loss and tampered
schema7 scope refinements are submitted to the current task checks. Complete
success/failure streams, local diagnostics and all prior index hash links:
[evidence/f05-02-share-publication-v1.json](evidence/f05-02-share-publication-v1.json).
f05-03 encryption/staging and f05-04 canonical encrypted content commands/events/
outbox are next; later lifecycle owns service relation revoke and propagation.
Saved-decision Ask, backup/content-loss restore, aggregate/final qualification
and all external environments remain pending.


Controller task completion `job-d2159738e1` passes authority118/118 and migration8/8,
all six violations0 and2,581 protected inputs unchanged. Twelve new sharing children
include actual source-witness filesystem loss/restoration and recreated schema7
scope-tamper refusal. f05-02 is done; f05-03 encryption/owned staging is next.
[Completion evidence](evidence/f05-02-completion-v1.json) retains both task attempts,
complete raw streams, hashes/candidates and actual owned cleanup. Full F05 content/
Ask/restore/aggregate acceptance and all external environments remain pending.


Turn29 adds mandatory `StagingWitnessJournal` to authenticated preparation.
The independently installed authority root is outside content and backup roots;
never bootstrap or replace it from PG/content/backup. Immutable fsynced enrollment
precedes reservation; durable intent precedes abandonment INSERT; settlement binds
exact committed original/upload/material and the full PG microsecond terminal time
only after a fresh authenticated observation under the same Space/original locks.
A PG terminal snapshot rollback or altered timestamp refuses. Enrollment surviving
reservation rollback blocks another stage; absence never grants replay. Rolled-back
or interrupted abandonment intent forbids confirmation/publication and protects GC
until explicit authenticated reconciliation/retry. Reachability after an intent
is contradictory and refuses, including administrative inspect.

The witness has bounded 4KiB reads, at most1,024 original directories, exact owned
markers, nofollow/single-link checks and immutable hard-link CAS publication. It
stores only opaque controls, no descriptive data or keys. Synthetic authority and
material capabilities survive; no root compaction, whole-service/PG-host crash,
witness-append process death, shared host/disk loss, hardware durability, multi-host
consistency, external anti-rollback/KMS or hostile host administrator is qualified.
Interrupted witness publication may fail closed on retained temporary/hard links;
there is no automatic authority repair. f05-03 remains active for authenticated
publication/settled original content-command integration. Full F05 acceptance,
actual content backup/restore and all external gates remain pending.


Turn31 adds exact file-adapter callback postconditions: stage rereads the retained
confirmation, publication checks the confirmation after decryption and then checks
same-scope/root/binding, reachable/nonpending/nonunknown result and owned sentinel
before leaving the held owner transaction. No-op or contradictory callbacks refuse
and real diagnostic PG mutations roll back. Controller encryption8/8/staging63/63
pass, with original failures and complete raw streams retained in
[evidence/f05-03-publication-postconditions-v1.json](evidence/f05-03-publication-postconditions-v1.json).
These publication positives use the admin-only diagnostic owner. Authenticated
canonical publication and content-command settlement remain next in active f05-03;
serving, propagation, actual backup/content-loss restore and external qualification
remain pending. The installed owner must still revalidate current authority through
COMMIT; this adapter supplies no independent save receipt or replay permission.


The Turn31 final follow-up copies/freezes verified confirmation objects before
owner callbacks, so mutation cannot defeat exact postcondition comparisons.
Runtime mutation/rollback cases pass in `job-541bbeaddc` (encryption8/8,
staging63/63; all violations0). The original and readonly-test compilation
failures remain preserved alongside full final streams in
[evidence/f05-03-publication-postconditions-v2.json](evidence/f05-03-publication-postconditions-v2.json).
Authenticated canonical publication still requires one shared owner transaction,
not a nested independently committing head-publication UoW.


### Installed staged-head prerequisite (turn32, partial f05-03)

`preparation.headPrerequisite(contentRoot,crypto)` can be installed as the final
constructor capability of `HeadPublicationRepository`. Use the SAME verified
scope and independent current epoch authority for preparation and head owners;
epoch and staging witnesses need separately marked closed directories outside
content/backup roots. Head and staging material IDs, original key, session,
command expiry, source Task and all ciphertext controls must match. Set the
installed head witness to `stagedHeadWitness(exactConfirmation)`. These are owner
capabilities and installed material, never request-selected options or keys.

The gate uses the head owner's transaction and existing Space/original staging
locks through COMMIT. `OwnedCipherFiles.verifyConfirmation` authenticates retained
object/manifest bytes and returns a frozen content-free proof, clearing temporary
plaintext. The gate repeats verification after the head effect, current owner
checks and final decryption, including current lease validity. An independent
abandonment intent or terminal cannot be published. UNKNOWN_COMMIT blocks current
authority/GC until serialized original head lookup reconciles committed controls
or rollback; staging itself grants no replay.

This installs an authenticated durable *head control* prerequisite. The old
control-only head path is retained; future canonical content constructors must
require the gate. Preparation `lock().publish` remains unsupported, content
outcome remains pending/replayAllowed:false, and no canonical save/event/outbox
receipt, serving API or full restore is provided. Nine mandatory new children
include real deadline expiry during final decryption. Controller final
`job-b32fc954d6` passes encryption8/8/staging72/72;
`job-5131ecccbd` also passes authority118/118 before the final lease addition.
See [staged-head-v1](evidence/f05-03-staged-head-v1.json) for complete failures,
passing streams, candidates and limitations. Current independent authority/keys
and trusted single-host filesystem custody remain required; all external and
integrated acceptance limitations remain pending.


Turn33 adds `EpochWitnessJournal.headPublication` and exact consumed-staging
outcomes. The bounded validated immutable chain distinguishes original committed,
pending and rolled-back head attempts. Preparation requires the matching current
scoped PG head/epoch/lineage/accepted-head records, original command binding and
actual confirmation witness. Missing even both protocol rows, changed material,
original binding or confirmation refuses; a committed original never becomes
pending or replayable. Post-effect prerequisite validation uses the same pending
transition in the containing committing UoW; independent ACK is required before
ordinary outcome/GC. Current maintenance recovery can inspect the consumed
control outcome after actual Stop, while reachable-byte inspect/cleanup/resume
remain refused. f05-04 must install its content publication gate without a
request-selectable omission; old control-only head diagnostics remain distinct.

Controller `job-05178584c4` passes encryption8/8, staging75/75 and unchanged
authority118/118. Complete tests-first failed and passing controller streams,
local diagnostics and preceding evidence preservation are indexed in
[evidence/f05-03-consumed-head-v1.json](evidence/f05-03-consumed-head-v1.json).
These are local component results; current task submission and later aggregate
acceptance remain separate. Surviving current PG/epoch/staging/material authority,
ephemeral keys and trusted single-host filesystem custody remain required.


Controller task-completion `job-96e4c3903b` rechecks the integrated candidate and
marks f05-03 done,3/15 tasks complete. Complete final stdout/stderr and preservation
hashes are in [consumed-head-v2](evidence/f05-03-consumed-head-v2.json). Next is
f05-04 canonical source/knowledge commits, corrections and original content receipts.
F05 aggregate/independent/final acceptance and all external limits above remain pending.

## Typed knowledge status owner (turn46)

After forward migration15, install `KnowledgeStatusAdmission(crypto)` in the
existing `KnowledgeSaveRepository`. The fixed source verifier is a separate
`RegisteredSourceChecker` with its own authenticated check-minting connection;
never install it as a command-selected option. It admits exact closed JSON
subject/value support under `local-source-exact-v1`, not arbitrary factual truth.
Serving/controller/worker/IdP/PUBLIC roles cannot register receipts. Exact source,
claim, checker/definition and database time/expiry are persisted and validated.

`save()` with `intent: 'propose'` returns durable `pending-review`; explicit assert
and an exact registered check return `saved-here`. Repeated discussion/lookup does
not accept proposals. `transition()` takes only the closed prior witness, desired
status, optional exact check ID and current native original-command controls. It
copies content into a new immutable encrypted revision in the SAME head/receipt/
event/outbox transaction. Terminal statuses cannot reactivate; delete status needs
forget authority. Content changes/correction contention remain successor work.

`read()` inspects the current revision; `history()` separately inspects up to512
currently source-authorized immutable revisions. `recall()` serves only current,
valid user-asserted/source-verified values; proposal/dispute/superseded/expiry/delete
statuses refuse. Legacy assertion-only composition refuses typed verified/later
revisions. `lookupState()` only reconciles exact original status metadata after
rollback/ACK uncertainty, never dispatches/replays a command. Source revocation
blocks payload history and recall. Status deletion does not claim physical erasure.

Run `node g1-storage/scripts/check-component.mjs knowledge-status` through the Loop
controller for real PG/IdP execution. Its fixed nonempty wrapper and full
commit-conflict wrapper import `register-knowledge-status-tests.ts`; every scenario
runs. The original runner/build/observation/fixture/cleanup seam and frozen full
case inventory remain required. Component passing is not full increment acceptance.
See [knowledge-status-v1](evidence/f05-04-knowledge-status-v1.json) and the appended
[acceptance boundary](../docs/evidence/g1-f05-acceptance.md). Full Ask/no-VM, lifecycle,
actual restore, HTTP/correction/recovery and all external environments remain pending.

## Selective correction and scoped dedup (turn47)

Apply forward migration16 with `migrateStorageKnowledgeCorrection`. The previous
15 SQL files, functions, ledgers and attributed records remain intact. Install the
existing typed `KnowledgeStatusAdmission`; `LocalSaveAdmission` keeps its earlier
assertion-only contract.

`append(scope, SaveCommand)` is the original-key-aware entry: simultaneous and
recreated identical originals return one canonical ID/receipt/event/outbox set.
Changed target, payload or binding conflicts. `save()` remains the earlier strict
compatibility entry; source-only acknowledgment is still not a canonical save.

`correct(scope, {command: CorrectCommand, prior: KnowledgeReadRef})` requires the
same target ID, expected revision and exact prior witness. It replaces only the
value of the intended current typed claim; subject, source, classification and
validity/retention remain bound to the prior record. Terminal states refuse
correction. A new assertion clears verification; a verified correction needs a
fresh exact registered source-support check. History retains the original
attributed record and evidence, new author/time, and explicit supersession.
`lookupCorrection()` returns only original metadata and never replays effects.

`claims(scope, {sourceId, sourceRevision, subject})` returns current source-authorized
valid asserted/verified/disputed records, exact-value groups and a visible conflict
flag. Grouping retains every identity and author, and never aliases canonical
records across new commands or merges similar text. Its scoped index and batched
admission inspection avoid one query per candidate. The existing `recall()` refuses
competing current values before opening ciphertext and checks again before return.
History remains separately source-authorized; source revocation blocks it.

Advanced append/correction publication and receipt reads can settle an exact
same-actor pending head publication from the trusted journal under the existing
Space/original locks, with full native/audience/current-control inspection. They
never execute its content command or mint a new result. Another actor's pending
original fails closed; cross-actor uncertainty/recovery schedules still require the
full gates. Concurrent same-actor independent facts both append in the finite
diagnostic, and a second authorized actor's sequential correction preserves both
authors. No external verifier, KMS, production concurrency/SLA or physical crash
assurance is implied.

Run `node g1-storage/scripts/check-component.mjs knowledge-correction` through the
controller. The component and full commit-conflict wrapper import the same fixed
assertions. Full K01–K09/420-variant acceptance, HTTP/wire recovery, native saved-decision
Ask, lifecycle propagation, actual restore and external environments remain pending.

## Authenticated local save and original-key recovery (f05-04-recovery)

The installed composition exports `startKnowledgeCommandHttp(verifier, repository)`
from `src/command-http.ts`. It binds an ephemeral port on `127.0.0.1`; the trusted
F02 verifier and canonical repository are installed capabilities. Authenticate with
an actual IdP access token. Send the closed `SaveCommand` JSON to
`POST /v1/tenants/<tenant UUID>/spaces/<Space UUID>/knowledge/save` with
`Authorization: Bearer <access token>` and `Content-Type: application/json`.
Scope IDs select a requested namespace; F02 resolves its actual actor, payer,
grants and current audience. Client issuer/key/root/clock/actor/authority fields
are refused. No source-enrollment, checker, approval or key-management HTTP port
is exposed by this adapter.

A confirmed accepted commit returns HTTP200 `saved-here`; a committed proposal
returns HTTP200 `pending-review`. Definite denial/rollback returns `not-saved`;
changed original bindings and stale revisions use HTTP409. Invalid schemas use
HTTP400 and authorization failures use HTTP403. All JSON responses are `no-store`.
The bounded parser rejects invalid UTF-8, malformed JSON, extra fields and commands
over 1MiB before effects; this loopback profile does not qualify public ingress/TLS.

Retain the **exact original command** with its tenant/Space. An actual installed
Foundation `UNKNOWN_COMMIT` returns HTTP503, for example:

```json
{
  "schemaVersion": 1,
  "status": "unknown",
  "error": "UNKNOWN_COMMIT",
  "key": "<original UUID>",
  "replayAllowed": false,
  "nextAction": "original-key-lookup",
  "resolver": {
    "method": "POST",
    "path": "/v1/tenants/<tenant UUID>/spaces/<Space UUID>/knowledge/lookup"
  }
}
```

POST that exact original JSON to the resolver with current authentication. The
resolver returns HTTP200 `committed` with the exact original metadata result,
HTTP200 `absent-safe` with `replayAllowed:false`, or HTTP503 `unknown` while the
original lock cannot be acquired. A lock timeout has no fabricated UNKNOWN_COMMIT
error. Lookup does not save, change a key or dispatch derived work. Unknown and
serialized absence authorize no automatic resubmission. A deliberate retry after
definite rollback remains subject to current authorization and the same binding.

Execute and lookup use the existing Space barrier plus actor/tenant/Space/original
key advisory lock, excluding the payload digest. Reconciliation requires READ
COMMITTED, fresh receipt statements and current identity/native/audience checks
following contention. Original command expiry does not invalidate an otherwise
currently authorized durable metadata receipt. A stopped native session or removed
write/maintenance authority denies lookup. Source restriction blocks content reads;
an authorized minimal receipt is not a content-serving grant.

New opaque material IDs include the actor's original namespace to avoid the head
owner's Space-wide material-ID collision. Existing committed and pending originals
retain their stored material IDs and bindings. SQL1–16, immutable rows, owner grants,
old receipts and protected checks are unchanged.

Run `node g1-storage/scripts/check-component.mjs command-recovery` through the
controller. Its fixed component and full commit-conflict wrapper import the same
nonempty assertions. The fixture uses the unchanged PG wire proxy to lose the
actual canonical UoW COMMIT reply (or drop the COMMIT request), never an HTTP ACK.
Observed canonical-write gates, PG blocking, commit/rollback/timeout, original-key
dedup, expiry, current authority and spoofed-error refusals are local diagnostics.
Full K01–K09/420-variant integration, native saved-decision Ask/no-VM, lifecycle
propagation, actual restore, independent/final acceptance and all X01–X09 external
environments remain pending. This successor updates the historical pending HTTP
statements above; it does not retroactively qualify earlier candidates.

### Durable artifact publication

`ArtifactPublicationRepository` accepts the closed `ArtifactCommandSchema` through
an installed authenticated UoW. Install the owned root, current/stable original
storage controls, ephemeral `CryptoStore`, independent staging/epoch journals and
an exact command-bound validator. `validationId` is a lookup request; JSON cannot
supply root, keys, audience, actor, generation, expiry policy or validator authority.
The finite local validator fixture is not a protected product CheckReceipt.

Call `prepare` to retain encrypted original bytes and FileManifest; it is not a
serving receipt. `commit` authenticates the retained encrypted confirmation,
compares the actual bytes/description with the exact original command, and
publishes head/version/command/receipt/event/outbox in the same authenticated
transaction. `artifact-committed` follows acknowledged COMMIT and independent
witness reconciliation, has no checkpoint and excludes unsaved editor work.
Identical original publication returns one exact receipt. Unknown carries the
original UUID, `replayAllowed:false` and original-key lookup; lookup never replays
an effect, including after serialized absence or real lock timeout.

`read` rechecks current head, source, full audience and expiry before and after
opening the exact ciphertext snapshot. Corrupt/missing bytes or manifests refuse.
Stop fences writers while eligible committed reads remain under current storage
permissions. `collect` rechecks installed current root/key/generation and uses the
surviving independent staging/epoch witnesses. Published, active, pending and
unknown originals are protected; only settled authenticated abandonment permits
owned quarantine/removal. Unowned/symlink/unexpected entries refuse cleanup.

Run `node g1-storage/scripts/check-component.mjs artifact-publication` through the
controller. The wrapper and full commit-conflict suite import the same assertions;
no test selection/skips or runner/fixture/cleanup changes are added. Migration17
is forward-only; SQL1–16 and acknowledged history are preserved. See
`evidence/f05-05-artifact-publication-v1.json` and the acceptance document for exact
local diagnostics and failures. Live files/drafts/checkpoints/promotion, full K/V
qualification, propagation, actual restore, full acceptance and all real external
environments remain pending.


## Canonical promotion (local component)

`VolumeDraftRepository.promote(scope, command)` accepts the closed `promote`
command with an exact saved draft/revision, expected live base and installed
validation ID. It applies the exact saved bytes through the artifact publication
transaction and returns `artifact-committed`. `prepare`, `commit` and `lookup`
accept that same original command; unknown always requires original-key lookup
with replay disallowed. Stale bases reject, remain comparable through `compare`
and can be explicitly retained through `retainVariant`.

Install `migrateStorageVolumePromotion` after the retained migrations. Forward19
adds immutable forced-RLS acceptance links in the same artifact/volume COMMIT;
SQL1–18 stay unchanged. `current` reads editable live state. `canonical` reads the
latest eligible accepted version and preserves it across later autosaves. Its
logical FileManifest derives exact decoded bytes, object reference, base, source
and validation from the authenticated encrypted frame and immutable scoped links.
Missing newest acceptance metadata refuses instead of selecting an older version.
Current source/retention still governs historical reads; the finite local path
bounds history to 512 entries and dependency depth to 16.

Promotion requires the installed current Task/Run/cancellation/worker binding,
runtime enrollment/mode/generation, storage root/key/generation and exact scoped
validator fingerprint, before and after publication waits. The runtime rows and
validator used by this gate are owned local fixtures. Remote lifecycle control,
real mounted volumes/KMS and protected format CheckReceipts remain unqualified.
Run `node g1-storage/scripts/check-component.mjs volume-promotion` through the
controller. Full and component wrappers import the same complete assertions.
The promotion component qualifies 14 real local tests; full frozen volume,
propagation, archive/restore, saved-decision Ask/no-VM, independent acceptance
and all X01–X09 external environments remain pending. Complete diagnostic/failure
streams are indexed in `evidence/f05-05-volume-promotion-v2.json`.

Promotion also checks the installed typed recovery Run when enrolled. Positive
native worker generations require recovery proof. The real local regression
initializes the accepted RecoveryRepository with a finite reservation/lease and
calls its actual replaceWorker: advancing recovery worker 1 to 2 fences the old
promoter even when the foundation Run generation stays 1. Missing recovery proof
also refuses. Initial unbound service worker 0 carries no remote-worker claim.

## Canonical recall broker (turn63)

`SourceRecallBroker` consumes current admitted canonical knowledge without an answer generator. Exact IDs, per-Space keyed subjects and bounded recent tail discovery read opaque metadata in the authenticated native session's immutable scope. Current full audience, source dependency/head, tombstones, status, temporal admission, conflict, key and serving generation precede ciphertext opening; the canonical owner repeats checks around decryption. Optional index metadata and the bounded opaque-reference hint cache grant no access. Index outage/lag leaves canonical discovery useful with explicit limitations; authority outage/staleness blocks it. Empty/disputed outcomes also repeat current controls, native, key and independent anchor checks. Canonical conflict eligibility now excludes tombstoned competitors so unaffected accepted decisions remain useful.

Migration20 and `QueryControlsRepository` append three independent flags under forced scope/actor RLS, immutable native session/Task/Run FKs, exact original-key dedup and revision CAS. Explicit installed Task attachment grants are separately required. Query preference changes neither save knowledge nor acquire file grants. Group-to-Personal export is unsupported and refuses before any copy. Legacy v14 history remains intact: the new broker returns an evidence gap for revisions lacking independently admitted temporal metadata, rather than opening payloads to discover validity.

The fixed `recall-broker` component and full recall suite import the same nonempty assertions. Local repository diagnostics do not qualify native answers, resource settlement/disclosure, encrypted answer caches, semantic search, arbitrary cross-Space exports, transitive derived graph serving or external environments. These remain successor work. See the turn63 acceptance entry for controller-bound results.
 
## Native saved-decision Ask (Turn64)

`node g1-storage/scripts/check-component.mjs native-ask` runs the shared
Personal-space HTTP/native/resource assertions. `startNativeAskHttp` installs
the existing F02 verifier on `POST /v1/tenants/:tenant/spaces/:space/native/ask`.
The closed `AskCommandSchema` carries immutable session, original key, expected
native revision, finite expiry, question and bounded exact/subject/tail selector.
Installed owners choose accounting intent; clients cannot supply resources,
rates, budgets, routes, model profiles or continuation authority.

`NativeAskRepository` loads and rechecks the installed native origin, F03
Task/Run/worker fences, pending model/effect state and independent query controls.
`StorageServiceAccounting` borrows the same authenticated transaction for actual
F04 resource reservation and settlement before publication. Only admitted
canonical source bytes reach the fixed `local-extractive-v1` router. Reachable
computer, shell, model, enrichment and effect ports are fail-on-call fixture
capabilities with measured calls; ordinary Ask uses none. No ComputerAssignment
or plaintext F04 model history is created.

Migration21 retains encrypted question/answer/manifest in `storage_ask_receipts`,
opaque native references in `storage_native_ask_refs`, and exact scoped canonical
dependencies in `storage_ask_dependencies`. New serving roles receive SELECT and
one narrow publisher, with forced RLS and immutable history. Required native
reference, control revision and actual same-transaction resource settlement are
relationally bound. The retained query is finite under current Ask policy and
selected source expiry. An original-key retry reauthorizes current canonical
selection before decrypting a retained answer; stale or tombstoned dependencies
refuse. Source expiry after actual seal rolls back query and economic effects.

The additive registration reconstructs every predecessor manifest byte and
changes only its manifest digest in the existing schedule pin map; both native
and predecessor recall proof guards enforce that chain. Original runner/build/
observation/fixture/cleanup/CLI/timeouts and protected owners remain unchanged.
Shared assertions are imported by the full recall suite; full frozen Q cases
and whole-increment qualification remain later gates.

Controller diagnostic `job-c558cd4865` passes23 actual tests/all22 fixed variants
in34895ms, with no fail/cancel/skip/TODO, all six violations zero, and owned
cleanup/censuses intact. Two preceding failed diagnostics remain retained in
`docs/loop/agent-fabric-g1-f05-storage/develop-turn64/diagnostic-raw/`; they exposed
unnecessary repeated recall under the unchanged2s lock bound and a numeric-string
fixture assertion. This appendix follows that diagnostic; final frozen checks
and controller task completion are recorded in the turn64 submission evidence.

This qualifies local useful Personal saved-decision Ask, repository/HTTP
recreation and installed deterministic service accounting only. Complete Sources
used/disclosure receipts, encrypted cache serving, qualified stream/download
exposure windows, real service-process/host disaster recovery, transitive
retention/delete propagation, backup capture/import/actual restore, frozen420
variants, independent reviews, AF-07/UX-01 closure and aggregate/product acceptance
remain pending. All X01–X09 real identity/KMS/storage/mount/isolation/provider/
region/billing/physical-client/capacity environments remain unqualified. No paid
resources, remote deployment, real credentials or human messages were used.

## Reauthorized answer disclosure (Turn65)

`node g1-storage/scripts/check-component.mjs ask-disclosure` executes the complete
shared disclosure assertions. Preparation still settles its admitted logical
service interval atomically with an encrypted receipt. `ask()` then starts a
fresh authenticated disclosure transaction. A source revoked after preparation
can prevent both the answer and Sources used from leaving the repository, while
the governed encrypted preparation history and settled charge remain intact.

The bounded sorted installed barrier supports canonical dependencies within the
current Space. Shared/cross-Space disclosure is unsupported. Each receipt fetch
rechecks native fences, independent controls/current epoch, full audience,
retention, exact heads/status/temporal/conflict/source dependencies and key/
generation before opening ciphertext, and repeats current checks before return.
Migration22 stores opaque current identity audience controls and an immutable
same-publication envelope digest. These metadata grant no content access and
contain no query/answer/source text.

V2 Sources used has its own contract module and preserves the V1 schema export
namespace. It records current scope/audiences/revisions, exact knowledge/source
head witnesses, source digest, index watermark, inclusion and fixed profile.
The answer and full manifest remain encrypted together. Original-key retries
also reauthorize before opening a retained answer. A current empty/disputed Ask
can emit freshly authorized metadata plus fixed gap text without opening any
content; explicit empty receipt fetches still authenticate retained ciphertext.

The fixed authenticated `ask-receipt` route fetches an existing answer/manifest
without another accounting interval. `ask-service` explicitly selects saved or
live requests and gives safe preserved-history/unexecuted/resolver/charge-state
outcomes for missing evidence, unsupported live inspection and current authority
failure. It creates no ComputerAssignment and invokes no computer, shell, model,
enrichment or effect. Live capability is unsupported; saved text is not live
machine state. Exact unknown Ask reconciliation is a later integration gate.

This is supervised local repository/HTTP/PG qualification. The disclosure
transaction is the local authorization boundary; response-send buffering,
remote broker/stream/download/direct-link exposure windows and retracting
already delivered data are unqualified. Transitive retention/delete, actual
content-loss restore, full420 frozen variants, independent/aggregate/product
acceptance, AF-07/UX-01 closure and all X01-X09 real environments remain pending.
Controller-bound results are in the Turn65 acceptance entry and machine index.

Duplicate Ask preparation now resolves only the original scoped receipt and
binding. Its following disclosure transaction supplies all current serving
checks and authenticated answer opening. No duplicate source retrieval or
second preparation charge runs under the unchanged installed lock limit.
