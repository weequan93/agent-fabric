# G1-F05 implementation plan: owned encrypted storage and saved-decision Ask

Date: 2026-10-08. Stage: develop. Version: 1. **Status: f05-01–03 controller-done, plan3/15. The encrypted storage substrate includes authenticated staged-head publication prerequisite and exact independent original staging consumption. f05-04 is ACTIVE with encrypted source provenance prerequisite/current reads; canonical knowledge/save/event/outbox/content receipts remain pending; f05-04–15, aggregate/independent/final acceptance and all external qualification remain pending.**

Deliver the additive local `g1-storage/` increment for AF-07 and UX-01: genuinely encrypted owned persistence, source-backed revisions, current authorized recall, conflict-safe writes, retention/delete/revocation propagation, and actual content recovery into fresh owned storage. Ordinary saved-decision Ask consumes real persisted eligible values through the installed native conversation service, without computer startup. This plan does not qualify full AF-07, whole G1/G2, an external storage provider or a production service.

## Frozen sources and ownership

Read and preserve the [roadmap](roadmap.md), [foundations dependency sequence](g1-foundations-plan.md), [remaining ledger](g1-remaining-ledger.csv) AF-07/UX-01, [master specification](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md) §§2–7, 14–18, 28–32, and [F02 evidence](../evidence/g1-f02-acceptance.md). The [brief](../loop/agent-fabric-g1-f05-storage/product-brief.md), [solution](../loop/agent-fabric-g1-f05-storage/solution.md) and [test design v1](../loop/agent-fabric-g1-f05-storage/test-plan.md) are the approved-stage inputs. The controller's finalized 96 requirements and their original source/verification notes remain authoritative. Historical planning, ledger and acceptance statements are retained.

F05 reuses F02 trusted identity, current all-party audience verification and authenticated UoW; F03/native Task/Run/runtime fences and Space barriers; F04 NativeRepository load/fresh plus ResourceRepository/SyntheticResourceOwner admission and accounting. Identity, native control, approvals, budgets, protected checks and release authority keep their installed owners. F05 memory/artifact/storage/lifecycle/recovery owners manage only their declared records. Derived summaries/index/cache and restored payloads cannot create authority.

Local Ask is `local-extractive-v1`, bounded extraction over eligible decrypted persisted values, with zero inference/embedding/reranking/supplier enrichment. Existing plaintext F04 Task/model request/response/history paths must receive no private F05 content. Supported deterministic summary/index/cache workers still require explicit installed-owner **maintenance** admission/accounting under R-037 and L09; Ask admission is insufficient for them. f05-01 resolves a borrowed authenticated transaction adapter; it must not open a second committing UoW while holding owner locks or copy a budget ceiling. The logical service accounting resource is separate from NativeAdmission's computer assignment.

## Supported classes and recovery boundary

The closed supported classes are source and typed knowledge revisions; canonical artifacts and descriptive manifests; service-owned encrypted logical live-file versions; recoverable Task drafts/variants; confirmed volume checkpoints; deterministic nested summaries/keyword indexes/answer caches; encrypted Ask query/answer/manifests; minimal commands/events/outbox/audit metadata; encrypted backup content. Unsent/unpersisted editor memory has no durable save receipt. Keys, current credentials/sessions/Task control/approvals/budgets, protected evidence, methods and external effects are excluded from F05 content backup.

All retained descriptive payloads, including title, subject/value, filename/path, source URI/narrative, query/answer and summary, are authenticated ciphertext. Opaque routing UUIDs/revisions/status/time/expiry/key IDs/cipher sizes/scope-keyed fingerprints/dependency edges have an explicit plaintext metadata boundary; metadata confidentiality and guaranteed memory zeroization are not claimed. f05-01 inventories every actual field/store, f05-03 implements the envelope, and f05-14 scans every retained PG/file/log/native/model/backup copy.

Canonical knowledge commit, durable artifact bytes+manifest publication, live-written version, draft-saved version and checkpoint-confirmed file set are distinct. A memory commit or volume snapshot does not acknowledge unsaved edits. Artifacts use byte-first owned staging with fsync/rename/directory-fsync and PG publication pointer; orphan leases/reachability/unknown operations govern quarantine or cleanup. No distributed filesystem/PG transaction or hardware power-loss guarantee is claimed.

Positive restore means **content-store loss with surviving current PostgreSQL identity/control/restriction/head/command authority and independently held ephemeral fixture keys**. Source content, backup and restore destination are physically separate. Actual owned source content is removed after a real encrypted backup; restored canonical metadata and bytes go to a fresh generation/root and are read through recreated services. Current deletion ledger, source/membership revocation, policy/expiry, anchored epoch and accepted-head freshness gate serving before activation and every later read/job. N restored after N+1 correction is never a current answer; absent current bytes cause a visible freshness block. Missing, empty, rolled-back or unavailable current authority fails closed. An archive does not replace that authority or replay jobs/effects/approvals/unsent drafts.

## Task/check execution contract

There are 15 tasks, each with one lead specialist and an empty team. Shared schema, fixture and owner interfaces make sequential slices appropriate; no parallel seats are requested. Implementation components are intentionally small diagnostics, implemented and checked in their owning task. Independent testers later extend them into all frozen suites and schedules. Component/slice commands do not replace aggregate acceptance.

f05-01 creates the package/build and fixed diagnostic commands `check-component.mjs <name>` and `check-slice.mjs <suite>`. Each strictly builds current sources and required imported owner code, validates exact case/variant execution, and fails for unavailable required fixtures or cleanup. Unknown/extra arguments fail. The aggregate `check.mjs` accepts **no selective arguments**, uses the full mandatory manifest, and fails until every suite exists. There is no public skip/meta-suite bypass. Required unchanged migration assets are copied byte-for-byte only into F05's own reproducible cache if their installed URL layout requires it; accepted sources/locks/checks and sibling emission are never regenerated as a repair.

Tests retain actual HTTP/IdP/PG/filesystem/process behavior, PG-observed contention, durable phase observations before verified process termination, original-key COMMIT/ROLLBACK/timeout windows, and strict current-authority checks after waits. Scope/actor/payer/key/root/clock/epoch/capability fields cannot be client authority. Guards run in failure paths. Fixture-only cryptographic material and policy durations are not production decisions.

### Task sequence

| Task | Lead | Depends on | Expected deliverable | Checks |
| --- | --- | --- | --- | --- |
| f05-01 | architect | — | Freeze executable contracts, owner composition and independent build | `node g1-storage/scripts/build.mjs` (unit, 180s)<br>`node g1-storage/scripts/check-component.mjs contracts` (unit, 180s) |
| f05-02 | backend | f05-01 | Install scoped PG authority, authenticated fixture and current control ledger | `node g1-storage/scripts/check-component.mjs authority` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs migration` (integration, 600s) |
| f05-03 | backend | f05-02 | Persist authenticated ciphertext with owned staging and redacted copies | `node g1-storage/scripts/check-component.mjs encryption` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs staging` (integration, 600s) |
| f05-04 | data | f05-03 | Commit source-backed knowledge, correction and original-key recovery | `node g1-storage/scripts/check-component.mjs knowledge` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs commands` (integration, 600s) |
| f05-05 | backend | f05-04 | Commit artifacts, encrypted live files, drafts and checkpoints | `node g1-storage/scripts/check-component.mjs volume` (integration, 600s) |
| f05-06 | backend | f05-05 | Serve useful authorized Ask through installed native owners | `node g1-storage/scripts/check-component.mjs ask` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs admission` (integration, 600s) |
| f05-07 | data | f05-06 | Propagate retention, forget and revocation through durable descendants | `node g1-storage/scripts/check-component.mjs lifecycle` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs maintenance` (integration, 600s) |
| f05-08 | backend | f05-07 | Capture coherent encrypted backups with durable confirmation | `node g1-storage/scripts/check-component.mjs backup` (integration, 600s) |
| f05-09 | backend | f05-08 | Restore actual content into a fresh owned generation behind current authority | `node g1-storage/scripts/check-component.mjs restore` (integration, 600s)<br>`node g1-storage/scripts/check-component.mjs restore-recovery` (integration, 600s) |
| f05-10 | tester | f05-09 | Complete unit contracts and hostile harness probes | `node g1-storage/scripts/check-slice.mjs contracts` (unit, 300s)<br>`node g1-storage/scripts/check-component.mjs harness` (unit, 600s) |
| f05-11 | tester | f05-10 | Qualify authority, commit, lifecycle and volume integration schedules | `node g1-storage/scripts/check-slice.mjs authority` (integration, 900s)<br>`node g1-storage/scripts/check-slice.mjs commit-conflict` (integration, 900s)<br>`node g1-storage/scripts/check-slice.mjs lifecycle-propagation` (integration, 900s)<br>`node g1-storage/scripts/check-slice.mjs volume-draft` (integration, 900s) |
| f05-12 | tester | f05-11 | Qualify native saved-decision e2e and disclosure races | `node g1-storage/scripts/check-slice.mjs recall-ask` (e2e, 1200s) |
| f05-13 | tester | f05-12 | Qualify restore/recovery and measure actual local boundary | `node g1-storage/scripts/check-slice.mjs backup-restore` (performance, 1200s) |
| f05-14 | security | f05-13 | Qualify encryption inventory and adversarial security gates | `node g1-storage/scripts/check-slice.mjs owned-encryption` (security, 900s)<br>`node g1-storage/scripts/check-slice.mjs harness` (security, 900s)<br>`node g1-storage/scripts/check-slice.mjs authority` (security, 900s)<br>`node g1-storage/scripts/check-component.mjs security` (integration, 600s) |
| f05-15 | tester | f05-14 | Deliver operator/evidence package and unchanged controller regressions | `node g1-storage/scripts/check-evidence.mjs local` (integration, 180s)<br>`node g1-storage/scripts/check.mjs` (integration, 1800s)<br>`node g1-identity/scripts/check.mjs` (regression, 600s)<br>`node g1-foundations/scripts/check.mjs` (regression, 600s)<br>`node g1-foundations/scripts/check-retained.mjs` (regression, 900s)<br>`node g1-storage/scripts/check-evidence.mjs controller-behavior` (acceptance, 180s) |

### Task outcomes and interfaces

#### f05-01: Freeze executable contracts, owner composition and independent build

Create only additive g1-storage package, pinned lock/dependency/license/update inventory, strict own-cache build, closed schemas/errors and direct installed-owner imports. Update docs/planning/g1-f05-plan.md with per-record owners, every retained class/field encryption and retention inventory, command/envelope/result contracts and per-class commit/checkpoint/recovery states. Implement fixed component/slice/aggregate manifests and diagnostic runners sharing strict gate functions: aggregate accepts no arguments and fails until every frozen suite/variant exists. Freeze C01-C03 and 64 executable local case IDs, 3 separately controller-run G cases, 9 pending X gates from test-plan v1; components never count as aggregate acceptance. Resolve ResourceRepository composition for Ask and deterministic summary/index/cache maintenance: bind the installed owner to the same authenticated transaction without independent/nested COMMIT; maintain policy/native fence/allowance checks before and after waits. Logical service-accounting resource is separate from NativeAdmission.resourceId/ComputerAssignment. Compile imported F01-F04/native sources and byte-identical required migration assets in own cache without sibling source/lock/check edits or sibling cache regeneration. Do not route private content into existing plaintext F04 Task/model history.

Covers: R-008, R-011, R-012, R-022, R-037, R-042, R-055, R-067, R-069, R-070, R-073, R-076, R-077, R-085. Lead: architect; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-02: Install scoped PG authority, authenticated fixture and current control ledger

Add independent storage migrations/schema repository plus real owned cached PG/IdP/process/filesystem fixture. Apply unchanged owner migrations with original ledgers/digests and narrow path adapter from f05-01; force RLS, composite scope FKs and immutable history, fixed-path/revoked-PUBLIC functions, no worker/IdP/admin serving grants. Use actual F02 token verification, AuthenticatedUnitOfWork and CurrentAudienceVerifier, F03 Space barriers/fences and F04 native bindings. Enroll two tenants, Personal/group/share rooms, all-party payer/membership authority and specific synthetic lifecycle grants. Keep current epoch anchor, policy, tombstone/source restriction, accepted-head witness and original-command/pending-work authority outside restorable content generations. Add trusted same-tenant two-sided sharing only, sorted source/destination locks; no cross-tenant sharing. Component checks prove actual scoped persisted metadata, current revocation/outage/forgery/direct-worker denial, remaining-member positive, authority rollback/missing anchor refusal and migration compatibility. Fixture cleanup records actual owner/instance/container/root identities and preexisting census; secrets remain fixture-held.

Covers: AF-07, R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-014, R-045, R-059, R-064, R-073, R-078. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-03: Persist authenticated ciphertext with owned staging and redacted copies

Implement crypto-store and bounded exclusive filesystem adapter using AES-256-GCM fresh nonce/tag and canonical tenant/Space/class/id/revision/generation/key AAD; scope-keyed fingerprints and opaque random filenames. Encrypt descriptive PG payloads and stored object/manifest/diagnostic copies, minimize content-free audits. Keys are ephemeral installed resolver capabilities outside content/backup roots, never caller fields, argv, stdout or archives. Stage/fsync/rename/directory-fsync actual files; publication requires durable byte+manifest confirmation, current ownership and reachability. Implement lease-aware orphan quarantine/GC with current pending/unknown command protection, sentinel/symlink/path checks and cleanup failure surfacing. Component assertions inspect real PG/files, recreate decrypting client, compare exact UTF-8/binary bytes, alter every AAD dimension/tag/body/key, test wrong/missing keys and race GC with staging/publication. Full every-class scan remains E01-E04 in f05-14 after all consumers exist.

Covers: R-009, R-010, R-011, R-012, R-013, R-020, R-021, R-028, R-044, R-061, R-078. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

Turn23 partial implementation: `CryptoStore` now supplies closed AES-256-GCM envelopes,
fresh96-bit nonce/128-bit tag, fixed versioned AAD over all binding dimensions and
domain-separated per-scope HMAC fingerprints. Installed resolver keys remain private
capabilities; key/input copies are bounded and resolver failures redact to typed errors.
Controller `job-bc4ca162c3` passed encryption8/8 with seven mandatory children,
including real synthetic PostgreSQL/file retained-copy scans, recreated reader exact
UTF-8/binary recovery, all AAD/tag/body/nonce/key negatives and concurrent/input-mutation
schedules. These are primitive/probe checks: the PG table is fixture-only and test
file writes do not attest durable staging. Next implement the bounded exclusive owned
filesystem adapter, durable byte+manifest confirmation and current pending/unknown-safe
lease/quarantine/GC; extend the components with actual durability/publication races.
f05-03 remains active. Every-class scan remains f05-14; canonical payload transactions
remain f05-04. No unchanged accepted migration/check/evidence was edited.

Turn25 partial implementation adds `AuthenticatedStagingPreparation` and additive
migration11. Real F02 authenticated transactions/current audience, F03 Space
barriers, native maintenance/fresh/Stop and independently anchored current storage
policy gate durable immutable scoped original-command reservation and byte/manifest
confirmation. Current material is an installed resolver capability binding root,
generation, original key, exact AAD, native session/source Task and finite expiry;
it is rechecked after locks/files. The original-key namespace excludes the binding.
Recreated original lookup never permits replay, including absence. Preparation
records contain only opaque IDs/times/leases and encrypted-copy digests/sizes,
are explicitly inventoried and excluded from backup. Historical migrations1–10,
their pins/ledger rows and installed owner catalog remain unchanged.

Controller `job-618ef41f44` passes encryption8/8 and staging21/21, including seven
additional mandatory authenticated preparation children and real observed
original-command contention. Compatibility `job-67e0c00d55` passes unchanged
authority118/118 and migration8/8. All2,581 protected inputs remain unchanged.
The full initial failure and repaired/final streams are retained in the
[preparation index](../../g1-storage/evidence/f05-03-preparation-v1.json).

Next within f05-03: install authenticated publication/reachability and exact
original-command pending/unknown/settled/abandoned outcomes with current-generation
and rollback protection, permit GC only after verified unreachability/abandonment,
and exercise genuine staging wire uncertainty and actual filesystem process-kill
recovery. The present preparation owner deliberately keeps every unconsumed
reservation pending and refuses publication; no canonical receipt/serving/GC
settlement qualification is implied. Current material enrollment is synthetic,
not an independently witnessed staging-command outcome. f05-03 stays active,
plan2/15. Canonical encrypted payload transactions remain f05-04, every-class
E01–E04 scan remains f05-14 and all external X01–X09 stay unqualified.

#### f05-04: Commit source-backed knowledge, correction and original-key recovery

Implement source/knowledge repositories with encrypted attributed provenance and all seven statuses, explicit save/proposal/verified-check admission, fixture secret/finite-retention rules, expected-head CAS, source/subject scoped dedup and authorized history. Atomically persist revision/current witness/receipt/event/outbox; acknowledge Saved here only after canonical COMMIT, proposals Pending review, rolled-back Not saved. Correct only intended claim with lineage/unrelated facts/conflicts retained; content cannot mint control/method/check authority. Execute/lookup share actor/scope/original-key advisory lock excluding digest, fresh READ COMMITTED receipt read and fresh authority/time after waits. Genuine foundation UNKNOWN_COMMIT yields typed HTTP503/replayAllowed:false; serialized absence and timeout prohibit blind/new-key replay. Component probes use actual concurrent callers/PG blocking, same-key changed binding, independent fact appends, killed partially written transactions and real COMMIT transport ACK loss with original-key commit/rollback/timeout reconciliation. Do not simulate uncertain commit by merely suppressing HTTP.

Covers: AF-07, R-014, R-015, R-016, R-017, R-018, R-019, R-022, R-023, R-024, R-025, R-026, R-027, R-028, R-029, R-036, R-058, R-068, R-094. Lead: data; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-05: Commit artifacts, encrypted live files, drafts and checkpoints

Implement artifact-repository/volume owned logical-file adapter, encrypted descriptive manifests, durable recoverable draft variants, CAS live versions/checkpoints and authorized validated canonical promotion. Distinguish live-written/draft-saved/checkpoint-confirmed/canonical Saved here from unsaved editor memory and uncheckpointed edits. Publish only confirmed exact bytes/manifests and current generation; private-to-group/guest/foreign relation denied. Two promoters from same base visibly conflict; recreated stale draft remains inspectable/comparable/retainable variant, never auto-promotes. Recheck installed Task/Run/runtime/cancellation/worker/storage fences before publication, including stale writer after Stop/replacement. Component checks interrupt actual durable file phases and recreate service, verify exact binary bytes, checkpoint does not imply rolled-back knowledge commit, and verify no dangling manifest/unowned cleanup.

Covers: R-001, R-005, R-020, R-021, R-022, R-041, R-055, R-056, R-057, R-058, R-059, R-061, R-067, R-068, R-082. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-06: Serve useful authorized Ask through installed native owners

Implement authenticated loopback composition/http-service/recall/ask-service as additive native query handler using actual NativeRepository.load/fresh, F02 current full audience and F03 fences. Exact ID/keyed-subject/tail reads verify current source/head/status/validity/conflict, dependencies and serving generation before decrypting, then local-extractive-v1 consumes actual persisted decision bytes and records encrypted query/answer/manifest with opaque native references. Under bounded sorted authority/disclosure locks recheck source/current full audience and emit; later receipt/cache reads reauthorize. Independent attachment/older-recall/save controls, immutable conversation Task/Run Space, explicit unsupported group-to-personal export/live inspection and safe error/resolver outputs. Install f05-01 bound-transaction F04 ResourceRepository/SyntheticResourceOwner admission/settlement with origin Run and existing allowance, idempotent original Ask accounting and no separate budget. No requestTurn/callModel/composeNative plaintext descriptor or inference history. Wire fail-on-call observers at actual reachable computer/shell/effect/model ports. Component journey saves random A, recreates, Asks A, corrects random B, recreates, Asks B; budget/Stop/pending-continuation/source/private/outage negatives fail before extraction/disclosure and never fall back to VM.

Covers: UX-01, R-003, R-004, R-007, R-030, R-031, R-032, R-033, R-034, R-035, R-036, R-037, R-038, R-039, R-040, R-041, R-042, R-043, R-068, R-086, R-089, R-094. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-07: Propagate retention, forget and revocation through durable descendants

Implement lifecycle/outbox/current-source-restriction services, every-class retention checks/sweep, durable monotonic tombstone+receipt/event/invalidation transaction and dependency DAG traversal bounds. Persist actual encrypted source→knowledge→summary1→summary2→index/cache→Ask receipt plus source-dependent artifact/draft and independent survivor. Deterministic summary/index/cache builders must use installed current service identity/native maintenance origin and f05-01 F04 resource allowance/receipts in borrowed authenticated transaction; denial before payload/read/build/publication, duplicate retry no double charge, source/provider/region policy restricted to local no-supplier profile. Cleanup-only maintenance is separate and cannot decrypt/read. Revalidate current policy/source/head/generations before derived read and publication; nested restriction denies synchronously even while jobs pending. Failed partial propagation remains durably pending/leased, recreated processor retries idempotently; late jobs become obsolete, never overwrite canonical head. Truthful forget reports active/derived/pending/backup/external/retention limits, already delivered bytes not recalled. Component checks run both observed PG winner orders and crash after durable progress, removed-member denial plus remaining-member positive; Stop/archive/suspension do not delete retained content or assert zero real charge.

Covers: R-013, R-031, R-035, R-036, R-037, R-044, R-045, R-046, R-047, R-048, R-049, R-050, R-051, R-052, R-053, R-054, R-059, R-068, R-082, R-094. Lead: data; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-08: Capture coherent encrypted backups with durable confirmation

Implement backup owner: specific current operation grant and original key, coherent canonical metadata/revision/checkpoint/byte inventory under actual Space barrier, encrypted bounded metadata/archive/manifest in physically separate owned backup root, file and directory fsync before PG confirmation. Explicitly exclude current identity/approval/budget/control/restriction/head/command authority, keys, credentials and unsaved/uncheckpointed work. Content archive includes provenance copies only; cannot execute SQL/jobs or become dedup authority. Preserve recorded captured epoch/included revisions/last C1 checkpoint and policy expiry. Component runs writer-first and capture-first real lock schedules alongside save/correction/restriction/artifact/checkpoint; terminate at inventory/archive phases, lose confirmation COMMIT ACK and reconcile original key; no confirmed partial/mixed backup.

Covers: R-009, R-010, R-012, R-022, R-023, R-024, R-044, R-045, R-060, R-061, R-066, R-067, R-078. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-09: Restore actual content into a fresh owned generation behind current authority

Implement restore owner/state machine with authenticated restore grant, original operation/key and fresh target root/generation serving=false. Validate/decrypt real archive/class/schema/count/decoded bytes and composite relationships, original AAD then fresh nonce/target generation re-encryption; refuse traversal/symlink/extra SQL/control/missing/corrupt/wrong-key input. Persist resumable per-item/phase progress without restoring surviving current restriction/head/policy/epoch/receipt authority. Apply current F02 grants, tombstones/source revocation/retention and accepted-head freshness before rehydration/index rebuild/reads and again locked activation. Old N after N+1 correction uses surviving current verified bytes or blocked-freshness, never N as current. Missing/unavailable/rolled-back current authority blocks; positive explicitly content-store loss with surviving PG control and independently held keys. Component deletes only owned synthetic content generation/root after real backup, recreates, restores fresh target and reads exact survivor knowledge/artifact/draft/C1 and useful Ask, denies post-backup deleted/revoked/expired/corrected originals. Interrupt/resume original operation around durable phases and activation ACK loss, duplicate requests, stale writers, no external/approval/credential/draft replay. Implement inspectable status/owned cleanup and rollback preserving restriction history.

Covers: R-060, R-061, R-062, R-063, R-064, R-065, R-066, R-067, R-068, R-010, R-024, R-045, R-059, R-078, R-084, R-092, R-094. Lead: backend; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-10: Complete unit contracts and hostile harness probes

Implement frozen S-C C01-C03 and S-H H01-H04 catalog/variant assertions plus own package diagnostic component harness. Verify exact limits max/max+1, all controls/statuses and every exposed closed schema. Strengthen runner to consume structured actual executed Node results and actual observation counters, require suite/case/variant and positive outcome coverage, strict clean build/import pins, no stale emission/cancellation/skip/TODO/forged labels or totals. Owned F-H copies test compiler error/source removal/suite/case/variant missing/empty/fail/cancel/skip/TODO/unknown arg/symlink cache/preflight and cleanup refusal. Guard inputs and cleanup in finally, surface all errors and complete raw streams. Avoid recursive full meta-suite: fixed internal driver shares identical gate functions and executes real fixture behavior, plus at least one corrupted-copy end-to-end aggregate probe. Components/slices are explicitly diagnostic and cannot satisfy aggregate acceptance. All-suite good aggregate and global positive/counter completeness are reasserted in f05-15 after final D suites exist; no placeholder or skipped product test is permitted at any checked slice.

Covers: R-016, R-021, R-022, R-042, R-049, R-061, R-069, R-070, R-071, R-072, R-073, R-077, R-078, R-083, R-093. Lead: tester; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-11: Qualify authority, commit, lifecycle and volume integration schedules

Complete frozen S-A A01-A06, S-K K01-K09, S-L L01-L09 and S-V V01-V05 against real authenticated HTTP/IdP/non-owner PG/encrypted files and recreated processes. Build on component assertions, preserve all test-plan v1 variants: source/destination sharing sorted locks and payer/session expiry after observed waits; every canonical transaction and byte/manifest durability crash phase; real PG COMMIT transport loss and original-key commit/rollback/timeout; same-key changed bindings, both correction/promotion winners and independent facts; delete/expiry/source revoke/correction versus save/promote/jobs in both publication orders; partial invalidation lease/retry and late duplicates; nested graph depth16/17,nodes512/513; current-source/history/verified admission; maintenance budget L09; unsaved/draft/checkpoint distinction and stale recreated/restored writers. Assert pg_blocking_pids/phase observations with bounded gates rather than sleep-only schedules. Kill only verified current owned process instances after observed actual durable work. G03 compatibility/installed-owner state remains verified. Missing schedule, deadlock treated as success, canned counters/refuse-all or any forbidden durable mutation fails.

Covers: AF-07, R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-014, R-015, R-016, R-017, R-018, R-019, R-020, R-021, R-022, R-023, R-024, R-025, R-026, R-027, R-028, R-029, R-030, R-031, R-035, R-036, R-037, R-041, R-044, R-045, R-046, R-047, R-048, R-049, R-050, R-051, R-052, R-053, R-054, R-055, R-056, R-057, R-058, R-059, R-061, R-066, R-067, R-072, R-073, R-076, R-078, R-082, R-086, R-091. Lead: tester; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-12: Qualify native saved-decision e2e and disclosure races

Complete S-Q Q01-Q09 via installed native query service and same documented authenticated user entry point. Random persisted A/B after real recreation drives exact useful Personal and group/shared source answers/manifests. Exercise pre-extractor current source/head/status/audience checks, delayed/failed index exact/tail positive, same billing team room isolation/cache revisions, all eight independent attachment/recall/save controls, queued Space A/tab B refusal and explicit export/live unsupported paths. Observe installed native admission/resource settlement and origin Run/Stop/unresolved-continuation/budget negatives. Q04 uses actual disclosure barrier and both full-audience forget/source-revoke/member-removal/correction orderings, historical-answer fetch reauthorization and remaining-member positive. Across allowed, denied, index/service/audit failure, concurrent and restored Ask journeys instrument reachable provision/wake/mount/computer-dispatch/live-volume/shell/model/enrichment/effect paths, require every forbidden count zero while positives work. Restore variant uses real completed f05-09 component recovery, not fabricated restored flag.

Covers: R-002, R-003, R-004, R-005, R-008, R-013, R-015, R-016, R-017, R-023, R-027, R-030, R-031, R-032, R-033, R-034, R-035, R-036, R-037, UX-01, R-038, R-039, R-040, R-041, R-042, R-043, R-047, R-048, R-054, R-059, R-068, R-072, R-077, R-080, R-086, R-087, R-089, R-094. Lead: tester; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-13: Qualify restore/recovery and measure actual local boundary

Complete S-R R01-R09 real encrypted archive/fresh-root recovery suite; include R01 positive survivor exact bytes and useful Ask after physically removing owned original content/canonical generation with surviving current control. R02 post-backup delete/revoke/member removal/expiry/correction, restriction during restoration wait and preactivation, staged read/rebuild denial and stale writer. R03 missing/unavailable/empty/rolled-back epoch/heads forbid old backup authority. R04 verified process kills at staged/item/inventory/import/reconcile/pre-post activation COMMIT plus duplicate original op and actual ACK loss/lookup commit-rollback-timeout. R05 integrity/binding/reference/FK/decoded size/count bounds, symlink/traversal/control class and concurrent staged-byte replacement variants. R06 no external/control/credential/model/unsent-input replay. R08 authenticated operator procedure/rollback/cleanup preserves sentinels and monotonic restrictions. R09 actual coherent backup capture contention/interrupted/expired original-key behavior. R07 reports monotonic timings, byte/item/class counts, last successful backup/checkpoint, captured epochs, accepted revisions/unavailable entities, interruption samples and concurrent outcomes from real runs; completeness is oracle, no invented percentile/production RPO/RTO/SLA threshold. Integration negatives remain mandatory even though this stage also records performance.

Covers: R-007, R-009, R-010, R-023, R-024, R-029, R-032, UX-01, R-039, R-044, R-045, R-049, R-050, R-053, R-059, R-060, R-061, R-062, R-063, R-064, R-065, R-066, R-067, R-068, R-072, R-078, R-080, R-082, R-084, R-092, R-094. Lead: tester; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-14: Qualify encryption inventory and adversarial security gates

Complete S-E E01-E04 over every supported retained class now implemented, and rerun S-H H01-H04 against completed behavior suites. Dump/scan actual PG F05 plus imported native/model/task/resource/audit/event/outbox retained values, every owned file/manifest/archive interior, encoded JSON values, raw stdout/stderr/PG logs/diagnostic export for randomized private payload/title/subject/path/query/answer/key canaries. Controlled-memory equality assertions redact failed diffs; a missing store scan fails. Correct-key round-trip across recreated readers and every AAD/cipher/key tamper; same value/source/tenant room nonmerging and equality/existence probes; keys never export. Re-exercise actual authority hostile JSON/direct worker/forged grants/personal-to-group, poison data not method/control authority, disclosure/restriction/restore freshness barriers and maintenance policy/budget refusal. Review supported serving path (bounded reauthorized local HTTP, no remote link/stream claim), synthetic fixture restrictions and ownership cleanup behavior; unresolved severe findings stay visible and block profile. This task records implementation security observations, not the later independent security review signature.

Covers: AF-07, R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-014, R-016, R-018, R-021, R-022, R-027, R-028, R-029, R-030, R-031, R-032, R-034, R-035, R-037, UX-01, R-038, R-039, R-040, R-041, R-044, R-045, R-046, R-047, R-048, R-049, R-050, R-054, R-056, R-057, R-059, R-061, R-062, R-063, R-064, R-065, R-066, R-069, R-070, R-071, R-072, R-073, R-077, R-078, R-083, R-084, R-086, R-087, R-093, R-094. Lead: security; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

#### f05-15: Deliver operator/evidence package and unchanged controller regressions

Complete S-D D01-D06, docs/planning/g1-f05-plan.md, docs/evidence/g1-f05-acceptance.md and linked versioned 96-requirement/76-case/variant matrix, OPERATIONS, class/key/retention/owner/data-flow/threat/rollback inventory, dependency/lock/image/license/notice/update pins and defect gates. Document and actually exercise authenticated save→Ask→conflict→forget→backup/restore/status including unsaved/checkpoint/propagation/storage-after-Stop explanations. R-079 is historical controller requirements-only audit, not new implementation; R-083 optional fault probes do not replace real cases. X01-X09 explicitly pending with missing environment/evidence, next responsible owner/approval gate; no external tasks executed or enterprise policy/SLA/whole-product claims. Freeze implementation/check/lock/documentation input fingerprint separate from append-only delivery indexes/raw streams to prevent self-reference; controller full candidate still recorded. D02/D06 verify actual stream/candidate/definitions/findings and keep independent review/final/product stages pending until controller issues them. Run via loop_check four unchanged commands, preserve complete success/failure stdout/stderr with original controller paths/byte counts/SHA256 and append-only copies, observation case/variant/counts, finite six zero-violation and useful positive outcomes, R07 measurements and cleanup census. After evidence updates rerun current checks; final task checks execute full aggregate, exact regressions outside sandbox and last controller-evidence validator over one fresh job/all four results. Never rewrite protected histories/ledger/raw evidence or claim author COMPLETE. Controller finish/review/final acceptance remain subsequent assignments.

Covers: R-002, R-006, R-008, R-011, R-012, R-013, R-037, R-053, R-055, R-067, R-069, R-073, R-074, R-075, R-076, R-077, R-079, R-080, R-081, R-082, R-083, R-084, R-085, R-086, R-087, R-088, R-089, R-090, R-091, R-092, R-093. Lead: tester; team: none. Checks listed above are future executable task gates, not commands run during this planning stage.

## Frozen test allocation and schedules

The catalog is 76 IDs: **64 executable local cases**, **3 unchanged controller regression cases**, **9 pending external cases**. This is the test design's 67 local/regression and 9 external split; parameter variants increase real executed counts. Case IDs and mandatory variants cannot be renamed away or replaced with labels in stdout.

| Task | Suites/case IDs owned for verification |
| --- | --- |
| f05-10 | S-C C01–C03; S-H runner/meta-probe implementation (H01–H04 finally rechecked in f05-14/15) |
| f05-11 | S-A A01–A06; S-K K01–K09; S-L L01–L09; S-V V01–V05; G03 installed-owner compatibility |
| f05-12 | S-Q Q01–Q09, including restored Ask and current full-audience disclosure |
| f05-13 | S-R R01–R09, actual archive/fresh-root restore, interruption, consistency and measurements |
| f05-14 | S-E E01–E04; S-H H01–H04; actual retained-copy/security checks across prior suites |
| f05-15 | S-D D01–D06; G01–G03 controller/regression audit; X01–X09 explicit pending-boundary audit |

Mandatory schedules remain exactly test design v1's K06 original-key retry/contention; K07/R04 real lost COMMIT and original-key commit/rollback/timeout; K08/V02 both correction/promotion winners plus recreated loser/independent facts; Q04/L03 both disclosure/restriction orders for forget/revoke/member removal/correction plus remaining-member positive; L05/L07 restriction versus save/promotion/derived publication with late worker restart/duplicates/expiry after lock; R02/R04 restriction during restore and activation plus stale pre-restore writer; A01/A03/L07 opposite-direction two-sided sharing lock order. Required K03/K04/K05/V01/V04/L06/L07/R04 crash phases use actual durable work and ownership-verified process termination/recreation, not a pre-effect thrown error. R09 adds coherent backup-capture contention.

The full runner requires all suites/IDs/variants, useful positive save/Ask/forget/restore outcomes, and six observed zero-violation counts: unauthorized disclosure, unauthorized mutation, silent lost update, duplicate canonical effect, restricted-content resurrection and Ask computer start. Refuse-all, canned zeros, missing variants, cancelled/skipped/TODO tests, stale generated success and cleanup/guard failure cannot pass. Owned harness mutation copies exercise negative gate conditions without touching accepted files.

## Requirement-to-task/case mapping

This allocation covers every finalized requirement. It preserves the frozen test design's case mapping; X cases mean explicit pending external gates, not executed local passes. R-079 is audited as the completed requirements-stage history. Full setup/steps/oracles/priorities are in test design v1 and the controller registry. Later evidence must attach each local case and variant to actual current-candidate assertions, distinguishing canonical knowledge, derived propagation, volume/checkpoint and external obligations.

| Requirement | Delivering tasks | Frozen cases |
| --- | --- | --- |
| AF-07 | f05-02, f05-04, f05-11, f05-14 | A01, A02, A03, K01, K08, L02, L03 |
| R-001 | f05-02, f05-05, f05-11, f05-14 | A01, A02, V05 |
| R-002 | f05-02, f05-11, f05-12, f05-14, f05-15 | A03, Q08, G01 |
| R-003 | f05-02, f05-06, f05-11, f05-12, f05-14 | A02, Q02, Q04 |
| R-004 | f05-02, f05-06, f05-11, f05-12, f05-14 | A02, E03, Q02, Q09 |
| R-005 | f05-02, f05-05, f05-11, f05-12, f05-14 | A02, Q06, V03 |
| R-006 | f05-02, f05-11, f05-14, f05-15 | A04, G02, G03 |
| R-007 | f05-02, f05-06, f05-11, f05-13, f05-14 | A05, R03 |
| R-008 | f05-01, f05-02, f05-11, f05-12, f05-14, f05-15 | K09, Q08, G03, D03 |
| R-009 | f05-03, f05-08, f05-13, f05-14 | E01, E03, R01 |
| R-010 | f05-03, f05-08, f05-09, f05-13, f05-14 | E02, R05 |
| R-011 | f05-01, f05-03, f05-14, f05-15 | E03, D03 |
| R-012 | f05-01, f05-03, f05-08, f05-14, f05-15 | E04, D03, D04 |
| R-013 | f05-03, f05-07, f05-12, f05-14, f05-15 | E03, Q09, D03 |
| R-014 | f05-02, f05-04, f05-11, f05-14 | K01, K03, K09, V01, L05 |
| R-015 | f05-04, f05-11, f05-12 | K01, Q01 |
| R-016 | f05-04, f05-10, f05-11, f05-12, f05-14 | C01, K02, Q02, L01, L02 |
| R-017 | f05-04, f05-11, f05-12 | K02, Q06 |
| R-018 | f05-04, f05-11, f05-14 | A03, K02, K03 |
| R-019 | f05-04, f05-11 | K02, K03, K07 |
| R-020 | f05-03, f05-05, f05-11 | K04, V05 |
| R-021 | f05-03, f05-05, f05-10, f05-11, f05-14 | K05, H03 |
| R-022 | f05-01, f05-04, f05-05, f05-08, f05-10, f05-11, f05-14 | C01, C02, A03, K06, V04 |
| R-023 | f05-04, f05-08, f05-11, f05-12, f05-13 | K06, Q08, R04 |
| R-024 | f05-04, f05-08, f05-09, f05-11, f05-13 | K07, R04 |
| R-025 | f05-04, f05-11 | K08 |
| R-026 | f05-04, f05-11 | K08 |
| R-027 | f05-04, f05-11, f05-12, f05-14 | K01, K08, Q02, L08 |
| R-028 | f05-03, f05-04, f05-11, f05-14 | E04, K08 |
| R-029 | f05-04, f05-11, f05-13, f05-14 | K09, R06 |
| R-030 | f05-06, f05-11, f05-12, f05-14 | A02, Q02, Q05 |
| R-031 | f05-06, f05-07, f05-11, f05-12, f05-14 | Q04, L07 |
| R-032 | f05-06, f05-12, f05-13, f05-14 | Q01, Q03, R01, R02 |
| R-033 | f05-06, f05-12 | Q03 |
| R-034 | f05-06, f05-12, f05-14 | Q02, Q09 |
| R-035 | f05-06, f05-07, f05-11, f05-12, f05-14 | E04, Q03, Q07, L03 |
| R-036 | f05-04, f05-06, f05-07, f05-11, f05-12 | K03, Q03, L05, L08 |
| R-037 | f05-01, f05-06, f05-07, f05-11, f05-12, f05-14, f05-15 | Q05, Q08, L09, D05, X07 |
| UX-01 | f05-06, f05-12, f05-13, f05-14 | Q01, Q05, R01 |
| R-038 | f05-06, f05-12, f05-14 | Q05, Q08 |
| R-039 | f05-06, f05-12, f05-13, f05-14 | Q01, Q03, Q04, Q05, R01 |
| R-040 | f05-06, f05-12, f05-14 | Q05, Q09 |
| R-041 | f05-05, f05-06, f05-11, f05-12, f05-14 | Q07, V04 |
| R-042 | f05-01, f05-06, f05-10, f05-12 | C03, Q06 |
| R-043 | f05-06, f05-12 | Q06, Q07 |
| R-044 | f05-03, f05-07, f05-08, f05-11, f05-13, f05-14 | L01, E03, R02 |
| R-045 | f05-02, f05-07, f05-08, f05-09, f05-11, f05-13, f05-14 | A06, R08 |
| R-046 | f05-07, f05-11, f05-14 | L01, L02, L07 |
| R-047 | f05-07, f05-11, f05-12, f05-14 | L03, Q04, L05 |
| R-048 | f05-07, f05-11, f05-12, f05-14 | A03, L03, Q04 |
| R-049 | f05-07, f05-10, f05-11, f05-13, f05-14 | C02, L04, L06, R02 |
| R-050 | f05-07, f05-11, f05-13, f05-14 | L05, L07, R02 |
| R-051 | f05-07, f05-11 | L06, L02 |
| R-052 | f05-07, f05-11 | K01, L04, L08 |
| R-053 | f05-07, f05-11, f05-13, f05-15 | L02, L06, R08, D03 |
| R-054 | f05-07, f05-11, f05-12, f05-14 | L07, Q04, L05 |
| R-055 | f05-01, f05-05, f05-11, f05-15 | V01, D03 |
| R-056 | f05-05, f05-11, f05-14 | V02, V04 |
| R-057 | f05-05, f05-11, f05-14 | V03 |
| R-058 | f05-04, f05-05, f05-11 | K03, K04, V05 |
| R-059 | f05-02, f05-05, f05-07, f05-09, f05-11, f05-12, f05-13, f05-14 | V04, Q08, R02 |
| R-060 | f05-08, f05-09, f05-13 | R01, R09 |
| R-061 | f05-03, f05-05, f05-08, f05-09, f05-10, f05-11, f05-13, f05-14 | C02, R05, E02, V05, R09 |
| R-062 | f05-09, f05-13, f05-14 | R01, R02, R03 |
| R-063 | f05-09, f05-13, f05-14 | R02 |
| R-064 | f05-02, f05-09, f05-13, f05-14 | R03, R04 |
| R-065 | f05-09, f05-13, f05-14 | R04, R02 |
| R-066 | f05-08, f05-09, f05-11, f05-13, f05-14 | R06, K09 |
| R-067 | f05-01, f05-05, f05-08, f05-09, f05-11, f05-13, f05-15 | V01, R07, R08, R09, D03 |
| R-068 | f05-04, f05-05, f05-06, f05-07, f05-09, f05-12, f05-13 | Q09, R08 |
| R-069 | f05-01, f05-10, f05-14, f05-15 | D01, H01 |
| R-070 | f05-01, f05-10, f05-14 | H01, H02, H04 |
| R-071 | f05-10, f05-14 | H01, H02, H03 |
| R-072 | f05-10, f05-11, f05-12, f05-13, f05-14 | H04, Q01, K08, L07, R01 |
| R-073 | f05-01, f05-02, f05-10, f05-11, f05-14, f05-15 | G01, G02, G03, H03, D02 |
| R-074 | f05-15 | G01, G02, D02 |
| R-075 | f05-15 | D02, D05, D06 |
| R-076 | f05-01, f05-11, f05-15 | D01, D03, G03 |
| R-077 | f05-01, f05-10, f05-12, f05-14, f05-15 | D04, Q05, H03 |
| R-078 | f05-02, f05-03, f05-08, f05-09, f05-10, f05-11, f05-13, f05-14 | H03, K05, R08 |
| R-079 | f05-15 | D04 |
| R-080 | f05-12, f05-13, f05-15 | D01, Q09, R08 |
| R-081 | f05-15 | D01, D05 |
| R-082 | f05-05, f05-07, f05-11, f05-13, f05-15 | V01, L08, R07, D03 |
| R-083 | f05-10, f05-14, f05-15 | D04, H04 |
| R-084 | f05-09, f05-13, f05-14, f05-15 | D05, R03, X01, X02 |
| R-085 | f05-01, f05-15 | D03, D05, X03 |
| R-086 | f05-06, f05-11, f05-12, f05-14, f05-15 | D05, Q04, L03, X04 |
| R-087 | f05-12, f05-14, f05-15 | D05, Q05, X05 |
| R-088 | f05-15 | D05, G01, X06 |
| R-089 | f05-06, f05-12, f05-15 | D05, Q01, Q08, X07 |
| R-090 | f05-15 | D05, G02, X08 |
| R-091 | f05-11, f05-15 | D05, L04, X09 |
| R-092 | f05-09, f05-13, f05-15 | D03, D05, R07, X02 |
| R-093 | f05-10, f05-14, f05-15 | D05, D06, H04 |
| R-094 | f05-04, f05-06, f05-07, f05-09, f05-12, f05-13, f05-14 | Q02, Q03, Q04, R02 |

## Acceptance, evidence and independent stages

Keep the registered goal commands and timeouts unchanged:

| Check | Command | Stage | Timeout |
| --- | --- | --- | --- |
| g1-storage-behavior | `node g1-storage/scripts/check.mjs` | integration | 1,800s |
| identity-behavior | `node g1-identity/scripts/check.mjs` | regression | 600s |
| foundation-behavior | `node g1-foundations/scripts/check.mjs` | regression | 600s |
| retained-baselines | `node g1-foundations/scripts/check-retained.mjs` | regression | 900s |

Task completion and acceptance use controller-run checks. Electron/GUI regressions run through `loop_check` outside the sandbox; a sandbox abort is not a skipped/waived result. All imported owner behavior is additionally exercised by F05, not inferred from types. No baseline guard, test, check definition, lock, source, historical statement or raw evidence is weakened.

f05-15 captures one fresh controller job for the four behavior/regression commands, complete stdout/stderr originals and append-only owned copies, bytes/SHA256, current controller candidate and exact check definitions. Evidence validation separates the exhaustive implementation/check/lock/documentation fingerprint from append-only indexes/streams to avoid a result hashing itself; the controller's full delivery candidate is still recorded. A changed executable input invalidates earlier evidence. Evidence updates are followed by current reruns. D02's in-suite audit does not require the running aggregate's own future result; the separate last `check-evidence.mjs controller-behavior` gate inspects completed fresh four-command results. Local evidence metadata never fabricates an independent security/code/final/product verdict.

R07 records actual monotonic restore times, sample conditions, class/item/byte counts, captured epochs and last successful backup/checkpoint, unavailable entities and crash phases. No throughput, percentile, production RPO/RTO, legal guarantee or SLA target is invented. High-severity authorization/isolation/stale-approval/duplicate-effect findings block the affected local profile. Independent reviews, final acceptance, product acceptance and completion remain controller-owned later stages.

## External gates and authorized scope

No task performs an external qualification. Each pending gate must include the missing environment/evidence, responsible role and next exact approval/qualification step in the final evidence:

| Gate | Missing environment or decision |
| --- | --- |
| X01 | Actual object store/volume encryption, managed KMS custody/rotation, provider region/payload/log handling |
| X02 | Provider/real-filesystem/power-loss/multi-host durability, whole-cluster recovery with fresh authority, production load and per-class recovery objectives |
| X03 | Authorized-human enterprise retention/legal hold/region/key/backup erasure and real-data handling decisions |
| X04 | Real authorization-checking download/stream broker and direct-link exposure-window qualification; already delivered bytes cannot be recalled |
| X05 | G1-F06 actual Linux host/kernel/image, no-filesystem service/runtime/egress/no-VM containment |
| X06 | Formal enterprise SSO/current directory and actual independent human approval judgment |
| X07 | Approved real supplier/profile/region, encrypted request/response integration, inference/answer quality and invoice reconciliation |
| X08 | G1-F07 physical desktop sleep/phones, signed distribution, accessibility and full three-client journeys |
| X09 | Full G2 semantic/no-memory quality, curation/inspector/connectors/JML/legal-hold/billing/schedule/Fleet depth, G3 computer creation, G4 Reflect release, G5 adapters |

Local synthetic identity/operator policy, AES files, port zeros, extractive answers and service/maintenance accounting do not qualify those guarantees. Fixture durations/keys/units/bounds are test parameters. Full ledger AF-07/UX-12–17 and unrelated rows stay pending; mandatory F05 local lineage/recall/conflict/delete/revocation are not deferred.

Paid APIs, cloud resources/pulls, real credentials, remote/shared/production deployment/release, people messaging, nonreproducible destructive operations, real credentials/ACL/security changes and published-history/branch deletion remain OFF without prior exact `loop_ask(kind=approval)`. Only owned repository-reproducible synthetic data, ephemeral keys and bounded ownership-checked cleanup are authorized. Rollback disables new F05 admission/serving/publication while preserving canonical receipts, heads, pending work, tombstones and current restrictions; it cannot undo delivered bytes or external effects.

## Planning-stage validation

This turn authors this plan and registers tasks with `loop_plan(final=true)`. Read-only/document validation checks task DAG/roles/real command definitions, exact 96-ID requirement allocation, 76 frozen case references, local links and unchanged acceptance definitions. No product code, tests, migrations, baseline/evidence edits, external actions, subagents or acceptance checks are performed in this stage. Resources and independent plan review precede development.


## f05-01 executable architecture contract — 2026-10-08

Implementation begins with an independent package, not an acceptance claim. `g1-storage/src/schema.ts` owns closed runtime schemas and derived types; `owners.ts` directly imports installed F01/F02/F03/F04/native owners. `record-inventory.ts` is the closed new-record inventory. No F05 database migration, encryption writer, HTTP serving endpoint or restore has been qualified at this task. The contracts component uses a clearly identified SQL-shape unit probe for resource orchestration. Real authenticated PG admission, native fences and allowance contention remain f05-02/f05-06/L09 obligations.

### Resolved resource composition and relational extension

Inspection found a concrete installed constraint: F04 `0009_resource_intervals.sql` makes `(tenant_id,space_id,resource_id)` in `model_resource_bindings` reference `model_computer_assignments`. F04 `0008_native_computer.sql` allows one assignment per Space. Merely binding a UoW does not make a new logical resource eligible. Creating a placeholder computer assignment would violate the service-only contract and consume the Space's computer slot. Copying reserve/settle arithmetic or intercepting SQL would duplicate the budget owner. Both alternatives are rejected.

Chosen additive F05 migration contract, implemented and exercised by **f05-02** in owned synthetic PG:

1. Preserve the exact F04 source SQL, migration digests/ledger, resource functions, existing table columns, immutable-history triggers, roles and grants. Require the installed original FK to have the exact known column/relation definition before extending it; an unexpected installed definition refuses migration.
2. Add forced-RLS, immutable `storage_resource_identities(tenant_id,space_id,resource_id,kind)` and `storage_service_resources`. `kind` is closed to `computer` or `logical-service`. The service record binds resource, owner, generation, purpose (`ask` or `maintenance`), actor/payer, native origin Run and an **existing** allowance. It has no copied ceiling/balance. Both source and billing relations use composite scope FKs. Service enrollment is a trusted fixture bootstrap operation, never a client body or serving grant.
3. Backfill computer identities only from exact existing F04 assignments, and register future computer identities through an additive fixed-path trigger on F04 assignment insertion. Preserve the original single-computer constraint and all prior assignment immutability/grants. A computer identity must match the original assignment exactly; a service identity must match the independently enrolled service record exactly. Mutual exclusion rejects a resource registered as both kinds. Add a closed integrity trigger for the union; do not permit arbitrary resource IDs to enter it.
4. Replace **only** F04's computer-only resource-binding FK with a validated FK to this closed union, plus a subtype integrity constraint/trigger. Existing computer bindings retain their original exact relation invariant. New logical-service bindings require enrolled matching actor/payer/owner/generation/origin/allowance and service-only rates; computer categories on a logical resource refuse. No inherited function or budget implementation is replaced. This extends the relational domain without adding a second accounting owner. `G03` checks original owner columns/functions/ledgers/grants/digests unchanged, the explicitly declared FK extension, computer-positive/invalid computer relations, service-positive/invalid service relations and zero service computer assignments.
5. Migration tests must actually call unchanged F04 `ResourceRepository.prepare/settle` on a logical resource with **zero** matching `model_computer_assignments` rows, for Ask **and** maintenance. A computer assignment must still be admitted independently after service registration, with its own resource ID. Repeated migration retains the same ledger/definition, incompatible installed FK/domain data refuses atomically, and migration failure leaves no partial domain extension. No production/shared database or ACL changes are authorized.

`StorageServiceAccounting.inTransaction` borrows the **same** authenticated F02 transaction through `BorrowedUnitOfWork`; the outer UoW alone begins/commits/rolls back. The adapter rejects a cloned scope or closed borrower, pins the exact installed `SyntheticResourceOwner` service receipt across prepare/settle, and uses the unchanged installed F04 repository. Receipt category is service, origin Run and logical resource/generation/owner must match installed enrollment. Neither `NativeAdmission.resourceId` nor a `ComputerAssignment` carries this logical ID.

Before owner calls, after reserve/allowance waits, after computation, after settlement and around final publication, reload/fresh-check the installed native session, current scope/session time, storage policy/epoch/full audience/dependencies and command expiry. Native binding is service/Ask, purpose answer for Ask or maintenance for derived work; no target effect, approval-required effect, computer capability, pending/unknown/stopped/replaced continuation. Maintenance additionally requires enrolled `storage:maintenance`. Source/provider/region eligibility remains in the current-storage-authority guard; the local profile invokes no supplier. The callback stages/ computes; disclosure uses the final publication callback after settlement under the same transaction locks. A later failure rolls back persisted mutation; already-authorized delivered bytes cannot be recalled. No commit uncertainty authorizes new-key replay. Independent real PG/expiry/rollback/resource conservation schedules remain mandatory even though the unit contract checks method ordering and one outer UoW.

### Per-record retained-field, owner and lifecycle inventory

This is the normative downstream inventory for the **new** stores, also exported as executable `RECORD_INVENTORY`, `CONTROL_INVENTORY`, `ENVELOPE_METADATA` and `EXCLUDED_FROM_BACKUP`. f05-02 and subsequent migrations must map each actual added column/file to it; new fields/stores require an explicit inventory update and E03/L01 coverage. No actual at-rest encryption claim follows from a type alone.

All content classes share opaque envelope/routing metadata: schemaVersion, algorithm, tenantId, spaceId, class, id, revision, generation, keyId, nonce, tag, ciphertextSize. Every content-bearing PG payload, object and descriptive manifest is authenticated ciphertext; routing IDs/revisions/status/time/expiry/keyed fingerprints/dependency edges are disclosed metadata. Keys and raw equality digests are not public columns. Content digests occur inside authorized encrypted payloads; current witness/command/search bindings use scope-keyed fingerprints. Source authors can also be correlated through opaque actor metadata in commands; metadata confidentiality/zeroization is unqualified.

| Record / one owner / actual target store | Encrypted descriptive fields and bytes | Plain routing fields beyond common envelope | Retention and recovery gate |
| --- | --- | --- | --- |
| Source / memory / `storage_sources` | title, URI, narrative, contentDigest, assertedBy, recordedAt | sourceId, sourceTaskId, revision, status, expiresAt | Finite expiry/source restriction; included content only with current source authority |
| Knowledge / memory / `storage_knowledge_revisions` | subject, value, full source provenance/audience, assertedBy, recordedAt, validity interval, classification, verification/check narrative, supersedes | id, revision, status, expiresAt, subjectFingerprint, sourceId/sourceRevision | Finite expiry/forget/source restriction; current accepted head witness governs restored version |
| Artifact / artifact / `storage_artifact_versions` and owned objects | exact bytes; filename, logicalPath, entry byte length/content digest, source, base, validation ID in manifest | id, revision, objectId, manifestObjectId, confirmedAt, expiresAt, sourceId/sourceRevision | Finite expiry/forget/dependency invalidation; confirmed bytes plus current canonical head |
| Live file / storage / `storage_live_versions` and owned objects | exact live bytes; filename/logicalPath/entry | id, revision, objectId, manifestObjectId, confirmedAt, expiresAt | Finite expiry/forget; only included confirmed checkpoint guarantees backup recovery |
| Draft/variant / artifact / `storage_drafts` and owned objects | exact draft bytes; filename/logicalPath/entry/source/base/validation | id, revision, object IDs, Task/Run/workerGeneration/baseRevision, expiresAt, source IDs | Finite expiry/forget/source restriction; included saved version, stale remains variant, no auto promotion |
| Checkpoint / storage / `storage_checkpoints` | exact confirmed files/entries | id, revision, generation, confirmedAt, expiresAt | Finite expiry/forget/dependency; last included confirmed set only |
| Summary/index/cache / memory projection / `storage_derived` | title, body/keyword entries/answer, full retrieval manifest | id, revision, watermark, source IDs/revisions, audience/query keyed tokens where needed, expiresAt, invalidatedAt | Finite expiry and transitive source invalidation; rebuild from current eligible canon under own maintenance admission |
| Ask / native conversation query / `storage_ask_receipts` | question, answer, full retrieval manifest | receipt id/revision, session/Task/Run IDs, resourceReceiptId, expiresAt, queryFingerprint | Finite expiry and dependency invalidation; every fetch reauthorizes, never answer/effect replay |
| Backup / storage recovery / `storage_backups` plus physically separate owned root | content items, descriptive metadata, full archive inventory/manifest | backupId, generation, capturedEpoch, confirmedAt, expiresAt, lastSuccessfulCheckpoint, objectId/cipher size | Finite fixture backup expiry; no direct read/disclosure, restore behind surviving current authority |

Minimal metadata has distinct owners and no hidden private body: `storage_heads` are restorable pointers; `storage_current_heads` are canonical-owner independent current revision/keyed witnesses. Commands retain original scoped actor/key/keyed digest/receipt IDs/status/epoch/time, with descriptive results encrypted. Events use only the closed EventSchema IDs/kind/revision/time/epoch. Outbox retains job/dependency/version/actor/epoch/status/lease/retry/count/error-code metadata. Lifecycle owns exact dependency edges/sharing relation ID, monotonic source restrictions and tombstones. Enrolled policy owner owns per-class finite fixture policy revisions; lifecycle owns the independent current epoch/anchor. Storage owns generation/root/operation IDs and staging lease/ownership markers; actual absolute paths are trusted in-memory configuration, not content API/archive authority. Recovery progress retains original key/generation/phase/count/code/checkpoint/epoch with encrypted inventory. Query controls retain session/revision and three independent booleans. F05 owns resource-subtype enrollment; F04 owns the existing accounting records, reservations and balances. Diagnostics and operator status accept only allowlisted codes, IDs, class/status, counts, times and opaque fingerprints; content requires current authorized delivery and encryption when retained.

Retention never depends solely on hiding rows. Every supported content class checks current expiry/source/head/dependency restrictions on read and publication, initiates durable invalidation/tombstones, retries pending propagation and cleans only unreachable owned ciphertext. Tombstones/epoch anchors/current head witnesses/original command/pending-job authority survive while an old backup can still be restored; they are not aged away or replaced from the archive. Fixture durations are enrolled later in F-A and are not production retention/legal-hold/key/region decisions. Immutable minimal audit metadata and historic backup restrictions must be disclosed by forget. Previously delivered/exported bytes cannot be recalled.

Excluded from content backup: keys, credentials/sessions, current identity/membership/policy, head witnesses/epoch anchor/tombstones/restrictions, original-command and pending-job authority, Task/Run/control, live approvals, budget balances, runtime/driver state, protected evidence, methods, external effects and unsent editor memory. Existing F04 audit/resource/native rows may carry only opaque F05 references, never question/value/title/file bytes. No private F05 content is sent through TaskContextSourceStore, composeNative/requestTurn/callModel or F04 supplier request/response history.

### Closed command, envelope, result and consistency contracts

Caller bodies have `schemaVersion:1`; session ID binds the immutable native scope. Commands carry target ID, original key, expected revision and expiry, with their closed action-specific payload. Save/source/artifact creation requires expected revision zero; correct/forget/promote require nonzero. Source creation carries encrypted title/URI/narrative and content digest; assertions carry source ID/revision, subject/value, finite validity/expiry, classification and explicit assert/propose/registered-check intent. An asserted check ID is only a lookup request: registered exact source verification is supplied by the installed verifier, never minted by parsing. Client actor/payer/grants/audience authority/root/key/clock/epoch/SQL/URL/capability fields reject. Logical filenames/paths are encrypted labels, never trusted filesystem paths. Closed schemas cover drafts/live writes, validation-bound promotion, checkpoint file IDs, independent controls, private lookup/inspect, backup/restore/status and Ask exact-ID/exact-subject/tail selectors with attachments.

`parseCommand` validates descriptor-safe closed schemas then enforces **serialized whole-command** size at 1MiB. UUIDs use canonical lower-case spelling without coercion. Revisions are nonnegative safe integers (creation zero, durable revision positive); negative zero/fractions/overflow reject. Times are canonical valid UTC milliseconds. Recipients are unique, nonempty, at most256; selected records at most64 (empty selection is a supported evidence gap). Graph expansion has depth16/nodes512, rejects cycles/missing ancestors/incorrect revisions/duplicate edges and uses a memoized DAG walk. A checkpoint/backup has at most1,024 files; decoded aggregate content at most64MiB. Archive size is checked from actual encoded payload lengths before walking/decrypting, independently of a caller's declared total; item lengths and scope/class/id/revision/generation bindings must reconcile. All limits are finite local parameters, not SLAs.

AES-256-GCM envelopes require the exact fields and algorithm/version, canonical base64, 12-byte nonce and16-byte tag, positive revision, declared scope/class/id/generation/keyID and bounded ciphertext. `BindingSchema` is the exact versioned AAD tuple. f05-03 will authenticate expected tuple and actual keys before decryption; a parsed envelope does not prove integrity. The key resolver is a trusted installed capability, with ephemeral scope data/digest material outside every retained root/archive/log. No production rotation/custody guarantee is inferred.

Results are closed: Saved here (acknowledged canonical receipt/revision), Pending review (durable proposal), Not saved (safe code/authorized next action), Unknown (original key, `replayAllowed:false`, original-key lookup). Forget reports actual affected active/derived/pending counts, external copies not recalled and backup erasure subject to retention. File results distinguish live-written, draft-saved, checkpoint-confirmed and artifact-committed and always exclude unsaved editor work. Ask has answered/evidence-gap/disputed states, authorized answer/manifest, local-extractive-v1 profile and no computer start. Restore records original operation/backup/generation, stage, current epoch, unavailable IDs, last successful checkpoint, preserved/not-executed lists and a closed resolver; `serving:true` requires ready plus a current nonnull epoch. The real HTTP layer must allow only genuine FoundationError UNKNOWN_COMMIT to return typed503, retain the original binding/key and prohibit automatic replay; spoofed exceptions and raw error text are denied safely.

| Class | Commit/checkpoint linearization | Recreation / content-store restore behavior |
| --- | --- | --- |
| Source/knowledge | One authenticated transaction: immutable revision, current head witness, receipt, event and outbox; saved only after acknowledged COMMIT | Confirmed revision survives recreation; restore included payload only behind surviving current authority/head. N after N+1 is freshness-blocked |
| Artifact | Byte-first stage, file fsync, rename, directory fsync, encrypted manifest confirmation; canonical PG publication after CAS/validation/fence checks | Published bytes/manifests exact or integrity-blocked. Before publication remains unavailable orphan; current head still governs |
| Live version | Durable encrypted immutable file, then live-pointer CAS and live-written receipt | Last durable version locally recoverable; backup boundary is included confirmed checkpoint, not later edits |
| Draft/variant | Durable encrypted draft/manifest then saved-version receipt with Task/Run/base | Saved draft survives; stale draft is inspectable/comparable/retainable, never silently canonical |
| Checkpoint | Confirm all exact live-file references, then checkpoint receipt | Included confirmed set restored. Does not save editor memory or imply knowledge transaction COMMIT |
| Summary/index/cache | Current authorized dependency checks plus explicit installed maintenance accounting, watermark/payload/outbox transaction | Canon preserved if projection unavailable; current-only rebuild, late/replayed jobs cannot redefine head or resurrect restricted bytes |
| Ask | Same authenticated native/resource transaction for eligible computation/encrypted receipt; publication after settlement/current checks under locks | Later receipt fetch reauthorizes dependencies/audience; not a native progression history or effect replay |
| Backup | Coherent locked epoch/inventory, immutable encrypted archive fsync/rename/directory fsync, then PG confirmation | Only confirmed archive; original-key lookup for COMMIT loss, no partial backup success |
| Restore | Quarantined fresh generation: staged → validating → reconciling-current → ready; activation barrier transaction after integrity/current epoch/head/policy check | No staged serving; resume identical original operation/generation. Missing/rolled-back authority blocks; current restrictions repeated after every restart/wait |
| Commands/events/outbox/current controls | Same owning canonical transaction; monotonic current authority independently retained | Archived provenance cannot replace current dedup/job/restriction authority or dispatch work |
| Unsent/unpersisted editor memory | No durable receipt/checkpoint | Lost on recreation, remains unsent; no recovery success claim |

The filesystem/PG boundary is byte-first with a publication pointer, not a distributed transaction. Lease/reachability/current unknown-command checks protect orphan collection. Each case retains the test design's actual process-loss/PG blocker/COMMIT transport-loss oracles; typed unit results cannot substitute for them.

### Executable build and frozen gates

Independent pnpm lock pins Node22.22.3/pnpm10.18.0/TS5.9.3/pg8.16.3/@types-pg8.15.5/@types-node22.18.6 and18 installed packages. `dependencies.json`/retained notices record declarations,17 installed notice files, missing pg-types/pgpass notice sets, unknown vulnerability/legal sufficiency and explicit update/requalification owners. There are no automatic updates/scripts/image pulls or provider SDKs. `build.mjs` strictly checks its compiler boundary, clears only F05's own cache after rejecting symlink parents, offline/frozen installs, compiles all installed F01–F04/native sources and its own tests, and copies24 pinned owner SQL assets byte-identically. It neither emits to a sibling cache nor changes sibling sources/locks/checks. A 2,581-file preservation guard runs at start/end; final check failures are accumulated with behavior failures.

`manifest.mjs` fixes10 local suites/64 IDs, C01–C03, three separate controller G cases and nine pending X gates. `verification/test-design-v1.json` retains the source-specified96 requirement mappings and67 local/regression oracles. The420 stable required variant names expand the v1 catalog's parameter/race/crash oracles; additional executions may strengthen them but cannot replace any frozen name. Components and slices share file/build/result/variant gates with the aggregate. Actual node:test executed parents/children, reconciled nonempty TAP plans/totals, subprocess exit and exact IDs/variants are checked; a label or printed pass summary is not evidence. Aggregate accepts no selective/extra arguments, validates the whole required manifest before running product suites and fails while any suite/fixture/variant is missing. Missing prerequisites and cleanup are failures, never skips. The component/slice contracts tests are diagnostics; aggregate acceptance and actual G/controller evidence remain pending.

All behavioral suite/components must emit exactly one closed `QualificationObservationSchema` record from their actual F-O ports/effects, through `tests/helpers/observations.ts`. The shared observation gate requires the selected suite identity, its frozen nonzero useful-positive categories and all six finite violation counters equal zero. Missing/duplicated records, a refuse-all result or any nonzero violation fails even when test IDs/TAP totals pass. Contracts deliberately emit no product observation record; their synthetic gate probes qualify validation only. The nonrecursive result-gate probe captures complete actual child stdout/stderr in base64 with byte counts/digests for expected missing-case/variant, empty, failure, skip and TODO refusals. The F05 gate clears inherited NODE_TEST_CONTEXT for a fresh child test runner; an initial diagnostic inherited the parent's internal protocol and failed the TAP check, which was repaired without relaxing the gate. Other full-harness sabotage and real cleanup/census schedules remain f05-10/f05-14 work.

### f05-02 turn 10: migration and owned fixture slice

**f05-02 remains active.** Added `0001_resource_identity.sql` and the independent storage migration runner. The migration creates the closed immutable forced-RLS subtype union, backfills exact legacy assignments, enrolls service resources against an existing Ask/service origin and its exact actor/payer/department/leaf allowance/cost center, validates and replaces only the declared F04 computer FK, and rejects non-service rates or mismatched origins on logical resources. New enrollment functions are fixed-path trigger functions with PUBLIC/controller/worker/IdP execution revoked. Serving roles have only SELECT on these two new tables; only the fresh fixture admin enrolls service resources. No shared environment, installed source/SQL/grant/function body or original ledger row is changed.

`migrateStorage` requires exact fixture owner/instance and all 14 installed F04 ledger versions/digests. It records an independent migration ledger and fingerprints original owner definitions/columns/policies/ACLs/triggers/ledgers while allowing only the declared FK replacement and additive storage triggers. Repeated migration verifies the new schema fingerprint; unknown/untracked/incompatible installations fail. These fingerprints describe the resource-domain slice only. The next additive migration must extend the schema verification/version handling explicitly, preserving this original version and its digest; do not silently replace version 1 or drop definition validation.

The fresh cached PostgreSQL16.12 wrapper uses byte-identical SQL and unchanged F01–F04 migration APIs emitted inside F05's own cache; no sibling caches are rebuilt. It creates physically separate content/backup/restore roots, keeps disposable database credentials fixture-held, and proves exact container/image/owner/instance/loopback identity and root marker/device/inode before cleanup. The test composition enrolls two tenants, private Personal and multi-member group/share Spaces, restricted synthetic login roles, actual separate-process F02 OIDC/PKCE/token verification, AuthenticatedUnitOfWork and native repository admission; there are no model/computer/effect provider calls. The unchanged installed process-ownership helper is imported into F05's own cache, records actual child PID/start instance/marker, and proves cleanup. Root/process/container hostile and recovery schedules remain the frozen H03 work; this initial fixture does not qualify those schedules.

Controller `job-01e3a64c2b` passes the migration component, 8/8 actual tests, no fail/cancel/skip/TODO: atomic injected rollback; incompatible FK rollback; repeated migration/owner-instance/digest refusal; forced RLS and restricted function/table privileges; real unchanged ResourceRepository.prepare/settle for **both** Ask and maintenance on the **same** borrowed authenticated transaction; zero matching service ComputerAssignment; exact original-key replay with one settlement; missing/wrong origin refusal with observed allowance rollback; immutable/closed enrollment; independent original computer registration and actual reserved-compute prepare/settle. Useful owner positives=2, tested denials=60 and six observed violation counters=0. The component does not run StorageServiceAccounting's full guard because current F05 storage authority is still unimplemented.

Historical failed controller runs are retained, including the initial SQL CASE parse error and root marker comparison failure. The root comparison mistakenly included the in-memory path in the on-disk marker comparison; it now compares the exact persisted identity fields. The initial container and IdP child were cleaned in the failed run. Its stranded reproducible root was subsequently verified against that run's recorded owner/instance/root/device/inode and removed; no retained data was deleted. A later negative test expected a subtype trigger error but the installed F04 owner correctly refused missing origin earlier as UNAUTHORIZED; the corrected test preserves that denial and separately exercises a valid-but-wrong origin reaching the subtype guard with full economic rollback. Raw streams, byte counts, hashes and each executed candidate digest are in `g1-storage/evidence/f05-02-migration-v1.json`. These interim execution candidates precede the additive evidence/inventory/docs update and are not final aggregate candidate evidence.

**Next before f05-02 can be done:** implement independently surviving current authority/policy/epoch anchor/head witness/tombstone/restriction/original-command/pending-work schema and repository; actual CurrentAudienceVerifier with trusted same-tenant two-sided sharing and sorted locks; persisted metadata and revocation/outage/forgery/worker/current-rollback/missing-anchor/remaining-member component cases; integrate the real authority into StorageServiceAccounting and repeat both task checks. Encryption, recall, delete propagation, restore and the 64-case/420-variant aggregate remain pending.


### Turn 11 — same-Space authority slice (f05-02 remains active)

Additive migration `0002_current_authority.sql` installs nine immutable forced-RLS control tables: room enrollment, closed per-class fixture policy, scoped opaque revision/Task registry, accepted-head witnesses, tombstones, source restrictions, original-command receipts, pending-job bindings and consecutive epoch history. Composite FKs bind tenant/Space/entity/Task/actor/command/epoch; deferred epoch FKs allow one canonical transaction. These are outside content generations and never archive authority. Version1 bytes and its historical ledger/schema fingerprint remain unchanged. Repeat validates the latest full storage catalog plus all original owner definitions/digests/permissions, rather than rewriting the old fingerprint. No installed-owner serving ACL or original migration was changed.

`StorageAuthorityRepository` uses the exact F02 authenticated UoW and bound scope revalidation, installed F03 Space barrier, live F02 all-party audience (including current payer checks), and F04 NativeRepository load/fresh for Ask/maintenance service intents. A separate installed in-memory fixture capability witnesses epoch, anchor ID, policy revision and deterministic current-control digest; empty/missing/rolled-back head/restriction/command/job state cannot imply unrestricted authority. Immutable control rows need only SELECT permission; epoch insertion acquires the same recovery Space barrier. The local integrity scan bounds every table at512 rows and accepts fixture periods of1–86,400 seconds; these are local refusal bounds, not production retention/capacity claims. Expiry and bound identity revalidate after waits, and source-head expiry repeats after the audience guard.

The owned fixture enrolls Personal/group/share rooms in two tenants and publishes synthetic control epochs separately from any content generation. All serving work uses nonowner/non-superuser/non-BYPASSRLS controller sessions. Fixture admin enrollment is not a serving UoW; no worker, IdP or PUBLIC storage serving grants exist. Metadata probes persist a real source Task relation, accepted-head witness, command/receipt and pending job, then read through recreated authority repositories. All nine authority children are mandatory in the component manifest.

Controller `job-1df6b27c1d` passed the authority component10/10 (one parent+nine mandatory children), reads12/denials74 and six actual violation counters0. It exercised real scope/token forgery, cross-scope FK/metadata isolation, read-only membership versus lifecycle grants, finite policy rejection, missing/offline/stale independent anchors, actual PG epoch/head/pending-job loss and exact recovery, observed advisory-lock expiry refusal, remaining-member positive after removal, source restriction and session revocation. It preserves all2,581 guarded inputs. This result precedes the evidence/documentation/inventory update and needs integrated rerun.

Two earlier controller failures remain retained. The first exposed a SELECT FOR SHARE/UPDATE-permission mismatch and two test setup expectations; no UPDATE ACL was added. The second corruption probe attempted ALTER ENABLE TRIGGER while deferred FK events were pending, then leaked a checked-out client during failed recovery; it hit the unchanged240-second suite timeout and ownership-checked fixture cleanup completed. The repair sets constraints immediate in the test-only corruption transaction and releases its client unconditionally. Editing that already-failed candidate during recovery also triggered the candidate-change guard, which remains enabled.

Still required before f05-02 completion: trusted two-sided same-tenant sharing with source/destination sorted barriers and explicit enrollment/current source grants, payer/guest/private-to-group negatives and both contention schedules; a canonical service mutation/commit/unknown-outcome protocol that advances the independently witnessed control epoch (current publication is fixture-only); full StorageServiceAccounting/current-authority composition for both purposes and lifecycle-grant after-wait rollback probes. The component pass qualifies opaque metadata checks only. It does not qualify encrypted payloads, source-dependent knowledge/derived traversal, useful saved-decision Ask, deletion propagation, actual content restore or a durable external/whole-cluster anchor feed. X01–X09 remain pending.


Integrated rerun `job-4d0ee2e486` passed authority10/10 (reads12/denials74) and migration8/8 (owner positives2/denials60); both had no failure/cancellation/skip/TODO, six zero violation counters and all2,581 preserved inputs unchanged. The [latest stream index](../../g1-storage/evidence/f05-02-authority-v2.json) retains four byte-identical complete controller streams with bytes/SHA256, exact tested candidate, reports and a digest link to all earlier failed/passing authority streams. This stream-copy/index update follows that run; final current-candidate acceptance is still pending. f05-02 remains active for the unfinished sharing/mutation/composition slices described above.


### Turn 12 — explicit two-sided sharing slice (f05-02 remains active)

Additive migration `0003_shared_authority.sql` preserves v1/v2 SQL bytes, original ledger rows and installed-owner fingerprints. It adds an immutable destination-scoped forced-RLS sharing registry. One composite tenant/source-Space/class/ID/revision/Task FK binds the exact source; destination and both publication epochs also have composite FKs. Only group/share room enrollment is supported; Personal sharing and cross-tenant relations are refused. Relation revisions can only advance from active to revoked without changing their source binding, and revoked relations cannot reactivate. Controller SELECT and one fixed-path, revoked-PUBLIC SECURITY DEFINER opaque control bridge are the only serving grants. Workers/IdP/raw clients have neither table nor function access; fixture admin without authenticated scope gets no serving result.

`sharedEntity` resolves only a destination-visible installed relation, acquires both exact F03 Space-barrier keys in sorted UUID order, rechecks the current destination policy/anchor and reloads the immutable relation after waits. The narrow bridge invokes the unchanged F02 `identity_audience`, rejects any ineligible member of the full live destination audience and locks both payers (including nonmembers); the installed CurrentAudienceVerifier repeats full live verification. The repository compares the source's independently installed epoch/anchor/policy/current-control digest, accepted head/witness, current source restriction/tombstone and fresh expiry. It repeats checks after waits and returns only opaque metadata. It neither changes transaction GUCs nor makes source tables directly readable. Source epochs/control arrays come through the fixed relation bridge, never from caller input or a restored content generation. Its JSON projection preserves field order/numeric strings and normalizes timestamp encoding to match the existing pg-driver digest representation; table scans still refuse above512 rows.

The v3 current-control projection additionally witnesses incoming sharing relations. Migrating schema does not mint or rewrite an authority witness. A live v2 epoch under the v3 schema refuses until a trusted fresh epoch/witness publication; automatic legacy restamping and seamless online upgrade are unqualified. Sharing relation enrollment/revocation and external witness ACK remain fixture-only. Shared reads are an entry path: they must acquire the complete sorted dependency Space set **before** any one-Space authority/native/accounting lock. Multi-source content/disclosure composition must enforce this rule in the next slice; the two-Space metadata pass does not qualify that future path.

Controller `job-ccfe9ef396` passes authority16/16 (one parent + the original nine and six additional mandatory children), actual useful reads27/denials103, and migration8/8 (owner2/denials60). Both report zero failures/cancellations/skips/TODO, six actual zero violation counters and all2,581 protected/installed inputs unchanged. Tests cover forward/reverse shared heads, recreated repository and read-only member positives, exact destination GUC preservation/source RLS isolation, missing/changed/foreign/private relation denial, forced RLS/fixed-path/role privileges, source missing/offline/stale independent witness, source policy and distinct nonmember source/destination payer revocation, full-audience denial followed by remaining-audience success, irrevocable relation status and current source restriction. Both forward-first and reverse-first schedules observe two independent authenticated transactions waiting on the same first barrier with zero second barrier locks held, then actual completion of both exact heads.

Four failed controller jobs remain retained. Strict TS compilation caught a lost opaque `id` return type; the checked ID is now explicit in the result. The installed immutable Space guard refused changing a fixture payer; distinct nonmember payers are now enrolled at Space creation. Two contention observer runs reused PostgreSQL's transaction-cached activity snapshot and saw only the first waiter; the observer now explicitly clears its snapshot before every measurement, with the two-waiter and zero-second-lock assertions retained. Using a different authenticated actor did not fix that snapshot defect; F02 session locks are shared, not an assumed serializer. No installed check, timeout, SQL guard or result oracle was weakened. Complete twenty stdout/stderr streams for all five jobs, candidate hashes and reports are in `g1-storage/evidence/f05-02-sharing-v1.json`, digest-linked to v2 and all prior raw evidence. This evidence/docs update follows the passing candidate; it is not final aggregate evidence.

Next f05-02 work: canonical service authority mutation and independently acknowledged witness protocol (including rollback/unknown COMMIT), complete sorted dependency lock-set composition before native/storage accounting, real StorageServiceAccounting guards and rollback for both Ask and maintenance, and grant-after-wait negatives. Encryption, saved-decision Ask, source/dependency propagation, content restore,64-case/420-variant qualification and X01–X09 remain pending. The task and plan stay active1/15; no shared/paid/external action was performed.


Integrated rerun `job-162e4bba57` passes authority16/16 (reads27/denials106) and migration8/8 (owner2/denials60), all six violation counters zero, no fail/cancel/skip/TODO and all2,581 guarded inputs unchanged. The SQL bridge now matches F02 on non-array source-grant refusal; actual missing-task:read/scalar-grant direct-function negatives and exact source-Task FK denial also pass. The [latest sharing stream index](../../g1-storage/evidence/f05-02-sharing-v2.json) adds four complete byte-identical controller streams, candidate/reports/bytes/SHA256 and a digest link to all previous streams including failures. Direct local contracts12/12 passed after adding the sharing control inventory. This final stream-index/docs append follows the diagnostic execution; aggregate/current-candidate final acceptance remains pending. f05-02 is active1/15; the next mutation/accounting slices and all X gates remain pending.


## Turn 13 — current-authority accounting composition slice

Controller `job-262be03f20` passes authority25/25 and migration8/8, zero fail/cancel/skip/TODO. Authority observations: metadata reads27, denials126, actual installed service settlements6, all six violation counters0; migration owner positives2/denials60 and all six counters0. All2,581 protected inputs remain unchanged. f05-02 is active; plan1/15.

`StorageServiceAccounting` now invokes installed current-storage authority before any native single-Space barrier. `StorageAuthorityRepository.forSharedSources` creates a frozen composition capability from1–16 unique opaque source-relation references. It resolves every enrolled source Space under destination RLS and acquires the union of source/destination F03 barrier keys in sorted UUID order before native/accounting work. It repeats current two-sided source authority/audience/policy/head/restriction/expiry verification around each native/accounting boundary. No caller chooses source Space/GUCs, budgets, rates or authority anchors. This predeclared bounded list must contain the whole supported source set; future derived-content dependency expansion must complete before this entry point, not discover and append locks during publication.

The real fixture exercises the full adapter for Ask and maintenance on one F02 authenticated transaction: matching transaction IDs during prepare/work/settle/publication, reserved and settled observations through the unchanged F04 scoped cost-view function, exact installed receipts and one settlement per receipt across adapter recreation/replay, with zero ComputerAssignments. PostgreSQL observes both forward-first/reverse-first accounting waiters with no destination/second barrier held. Two shared sources across three Spaces, both list orders and exact held barrier keys are observed before computation; malformed/missing secondary relation and missing secondary witness refuse. A separate enrolled same-tenant group supports that third-Space schedule.

Complete installed economic/command snapshots prove rollback after staged work interruption, publication interruption after settlement, witness disappearance after reservation, real allowance exhaustion, expiry after actual allowance-lock contention and expiry after settlement. Wrong purpose/owner/resource/generation/Run/receipt, read-only caller and native Stop refuse. Source membership grant changes after actual source full-audience lock contention prevent owner receipt/computation. A caller's removed storage:maintenance grant during actual PostgreSQL membership-lock contention refuses the captured scope, and a fresh authenticated scope still cannot perform maintenance. Fixture grants are restored with monotonic revisions; no installed permission is broadened. These are accounting/control operations, not useful Ask or content save/forget/restore. Generic accounting replay does not authorize replay of a content command.

The [accounting stream index](../../g1-storage/evidence/f05-02-accounting-v1.json) retains all twelve complete byte-identical streams from three controller jobs, bytes/SHA256/candidates/reports and a digest link to preceding sharing/authority/migration evidence. The initial job's new test failed on intentionally denied raw budget table reads and an untyped fixture owner lookup assertion. Tests now observe the unchanged scoped F04 cost view and use a typed fixture-held owner refusal; no ACL, check or rollback assertion was weakened. The second job passed23/23; the final job adds the three-Space and maintenance-grant schedules and passes25/25. Owned container/root/IdP cleanup is recorded.

Next f05-02 work is canonical service control mutation with independently acknowledged epoch/witness publication, rollback/unknown-COMMIT/recovery protocol and exact original-command/pending-work authority. Current publication and witness maps remain fixture-only; durable production anchors, automatic live schema upgrade and whole-cluster recovery remain unqualified. Encryption, useful native saved-decision Ask, source/dependency propagation, actual content restore,64-case/420-variant aggregate qualification and all X01–X09 remain pending. This evidence/docs update follows the passing diagnostic; final current-candidate acceptance remains pending.


## Turn 14 — independent durable witness and control-only epoch publication

f05-02 remains active, plan1/15. Additive migration `0004_epoch_publication.sql`
(`sha256:5655dcfbfdb2412713df2562c8e8ad32537ce0036540ef74c5542b9b790568fe`)
adds an immutable forced-RLS original-publication registry and one fixed-path,
revoked-PUBLIC function. It pins actor/original UUID key/binding/native maintenance
session/previous epoch/next epoch/exact anchor/expiry/time. Controller SELECT and
function EXECUTE are the only serving grants; there are no table write grants.
Installed owner fingerprints and byte-identical v1–v3 SQL/ledger rows remain unchanged.
The protocol registry is excluded from content backup and the content-control digest
(no circular witness); it neither executes content commands nor creates content
replay permission. Refresh deliberately preserves policy revision and control digest.

`EpochPublicationRepository` authenticates through unchanged F02, checks live
maintenance grants, installed F04 native service binding/current audience and F03
Space fences, and serializes Space plus actor/original-key locks excluding digest.
`EpochWitnessJournal` lives in a fourth independently marked owned authority root,
separate from content/backup/restore. It stores only closed opaque metadata in bounded
immutable sequence/hash-chain snapshots. Exclusive staging+file fsync, atomic hard-link
CAS and directory fsync publish each transition. Root marker/device/inode, canonical
UUID directories, no-follow file opens, chain continuity, finite record size/count and
closed transitions are checked on every observation. An unresolved reservation removes
the serving witness; no request/archive/database snapshot can automatically reinstall
it. One-time bootstrap remains a trusted enrollment capability.

After an acknowledged DB COMMIT, original-key lookup compares fresh current PG
controls with the independently reserved previous/next anchors and exact original
publication before resolving the journal. An absent committed marker restores the
previous witness only after the same locks and exact current-digest match; committed
next state acknowledges that exact witness. Mismatch, missing authority, corruption
or timeout leaves serving blocked. Serialized absence and unknown both prohibit
automatic replay. Native/session/audience are checked again around reconciliation;
these are control receipts, not durable knowledge save or useful Ask results.

Controller `job-432615e8f1` passes authority34/34 (metadata reads37/denials153,
installed accounting positives6) and migration8/8 (owner2/denials60), all six
violation counters0, no fail/cancel/skip/TODO and all2,581 inputs unchanged. Actual PG
wire schedules drop the backend COMMIT CommandComplete/ReadyForQuery after durable
commit, or drop the COMMIT request before delivery so the backend rolls back. Both
produce genuine foundation UNKNOWN_COMMIT and retain pending witness until recreated
owner lookup recovers exact committed state or serialized absence. Two real PG
lookup/competing-publisher waiters and exact single publication, timeout with pending
witness retained, rollback after reservation/SQL publication, commit-before-witness-ACK
interruption, two recreated journals racing on the same real predecessor, corrupted/
truncated/substituted/missing journal and role/immutable-history negatives pass.

All failed and passing controller raw streams remain in the epoch-publication index
linked from the acceptance evidence. Early wire fixtures failed on active pg client
error events after disconnect (the pool listener alone did not handle them); the
fixture now observes both client and pool errors while retaining actual wire loss and
UNKNOWN_COMMIT/single-receipt assertions. The new history test now expects the
unchanged installed owner's P0001 refusal. No accepted owner, limit or oracle changed.
The initial failed execution hit the retained240s test timeout; Docker/root cleanup
completed but its raw stream has no successful IdP cleanup record, so that attempt is
not cleanup qualification. Subsequent passing runs record actual process cleanup.

Next: separately versioned canonical scoped control mutation for current head/
restriction/tombstone/command/outbox/policy and two-sided sharing with independently
acknowledged changed-control witnesses. Do not silently broaden the refresh journal's
unchanged-digest/policy transition. Content-source writes, encryption, lifecycle
propagation, useful Ask, actual content loss/restore, frozen aggregate suites and final
regressions/reviews remain pending. Local roots share one host; external/disk-loss
anchor custody, multi-host/power-loss durability, authenticated provider copies,
compaction/capacity above1,024 events, malicious concurrent filesystem substitution
and all X01–X09 remain unqualified.

Integrated rerun `job-beb2d196a5` passes authority34/34 and migration8/8, zero failure/
cancellation/skip/TODO, six zero counters and2,581 unchanged inputs. Full current epoch/
publication snapshots now also prove no mutation after boundary/reader/direct-role/
history denials. `g1-storage/evidence/f05-02-epoch-v2.json` adds four complete verified
raw streams and a hash link to all sixteen prior epoch streams, including failures.
Index/docs additions follow the diagnostic run; aggregate/current-candidate final
qualification is still pending. Next remains versioned canonical changed-control
mutation; f05-02 is active, plan1/15.


## Turn 15 — dedicated synthetic administrator policy publication

f05-02 remains active, plan1/15. This additive slice implements one changed-control
owner: closed monotonic synthetic policy reductions. Master specification§14 requires
a dedicated administrator workflow, so `storage:policy-admin` is separately enrolled
only for the fixture owner. Current task:write/storage:maintenance, F02 authentication/
UoW/full audience, F03 barriers and the exact F04 native maintenance service binding
remain required. Valid ordinary maintenance callers are denied. Real enterprise
administrator authentication/workflow and X03 policies are unqualified.

Migration `0005_policy_publication.sql` installs immutable forced-RLS
`storage_policy_changes` with original scope/actor/key and both policy-revision FKs,
plus a fixed-path/revoked-PUBLIC `storage_reduce_policy` function. Controller receives
SELECT/EXECUTE only; no worker/IdP/raw-client/admin serving route or direct table writes.
The SQL owner checks the dedicated grant and exact monotonic revision, operation
subset/uniqueness, closed eleven finite per-class periods and no expansion. Maintenance
is retained for original-key recovery. Migrations1–4 remain byte-identical; rollback,
repeat, historical ledgers/fingerprints and installed-owner catalog are exercised.

`PolicyPublicationRepository` derives next policy/epoch/anchor/control digest inside
the actual scoped transaction. A projection of the exact desired policy uses PostgreSQL
JSONB/numeric encoding before reserving the independent journal. After SQL publication,
actual control digest/native/audience/identity/time are rechecked. The version2 pending
branch binds old/new closed policies and next anchor; the preexisting refresh branch
still requires identical policy/control digests. Pending serving stays blocked.
Recreated original-key lookup confirms the exact immutable policy marker and current
controls or serializable previous-state absence before witness ACK; no automatic replay.

Controller `job-548526bdca` passes authority44/44 (reads49/denials197/owner6),
migration8/8 (owner2/denials60), no failure/cancellation/skip/TODO, all six actual
violation counters0 and all2,581 guarded inputs unchanged. Ten mandatory policy children
exercise current persisted head reads/operation denial, malformed/expanding/unchanged
commands, read-only and valid nonadmin maintenance callers, actual SQL privilege and
immutable history refusals, reservation/publication rollback, ACK gap, corrupted policy
recovery refusal, both genuine wire UNKNOWN_COMMIT outcomes, two observed PG waiters/
one publication, expiry after SQL and observed waits, and dedicated administrator-grant
removal after a real membership wait. Restoring the grant monotonically does not
refresh the original F04 native membership binding: the stale session is explicitly
refused and a newly authenticated native session succeeds for the next operation.

The [policy stream index](../../g1-storage/evidence/f05-02-policy-v1.json) retains all
twelve complete controller streams from three jobs, bytes/SHA256/candidate/measurements
and links all preceding evidence. The initial43/43 diagnostic preceded the dedicated
grant correction. The second44-test candidate failed its post-race positive because
the test reused the rightly stale native session; the unchanged binding guard stayed
intact. Actual owned IdP/container/four-root cleanup is retained for all jobs. Local
contracts12/12 also passed before the dedicated-grant refinement; not controller evidence.

Next: canonical source/head/tombstone/command/outbox and two-sided sharing mutations
with versioned independently acknowledged witness/recovery. Policy-period reduction
metadata is implemented, but shortening existing payload deadlines and downstream
retention propagation remain pending. Payload encryption, recall/conflict/delete,
useful saved-decision Ask, actual source-loss restore,64-case/420-variant aggregate,
unchanged controller regressions/reviews/final acceptance and all X01–X09 remain
unqualified. Original-native revocation during pending publication still fails closed;
an independently authorized administrative recovery operation is not implemented.
These evidence/README/inventory updates follow the diagnostic candidate, so final
current-candidate acceptance remains pending. No paid/shared/external action occurred.


## Turn 16 — exact source-revision revocation authority

f05-02 remains active, plan1/15. `SourceRevocationRepository.revoke` adds one
monotonic service mutation: revoke the exact current accepted source ID/revision/
witness in the caller's authenticated Space. Current task:write/storage:maintenance/
storage:forget, policy read/forget/maintenance, actual native maintenance service
binding and the unchanged full source/native audience checks are required. No request
chooses an epoch, anchor, scope, timestamp, restriction kind or authority digest.
This is revision-specific source-control suppression, not connector revocation,
content deletion, expiry propagation or generic source enrollment.

Additive migration6 installs immutable forced-RLS `storage_source_revocations`,
composite references to original epoch receipt, exact accepted head and restriction,
and one fixed-path/revoked-PUBLIC SQL owner with controller SELECT/EXECUTE only.
Versions1–5, their historical ledger rows and installed owner definitions/ACLs remain
unchanged. Source restriction plus its epoch and original protocol receipt commit
in one actual F02 UoW. Its bounded desired-control projection uses PostgreSQL's UUID/
numeric/timestamp encoding; the published actual control digest must match it.

The separately versioned journal3 pins exact source reference/time and previous/next
anchors with identical policy revision and changed control digest. It preserves the
existing refresh and policy-reduction rules. Pending serving stays blocked. Recreated
original-key lookup validates the original command binding reconstructed from the
immutable marker, exact head witness/restriction epoch/time and current controls
before independently acknowledging committed state or serialized previous-state
absence. Neither absence nor unknown permits automatic replay.

Controller `job-76b1aceb2e` passes authority54/54 and migration8/8, zero failure/
cancellation/skip/TODO, all six violation counters0 and2,581 unchanged inputs.
Authority metadata reads62/denials251/accounting positives6 are diagnostics, not
save/Ask/forget/restore outcomes. Ten mandatory source children include other-Space
and other-tenant callers with real valid native sessions, malformed/stale references,
role/history denial, real SQL/reservation rollback, ACK-gap corruption, original-key
lookup timeout with unchanged pending state, both real COMMIT-wire outcomes, two
observed PG waiters/single restriction, expiry after SQL and real waits, dedicated
forget-grant removal, stale-native refusal and fresh-native positive, and closed
journal3 transition negatives. Local contracts12/12 pass separately.

Next: canonical head/tombstone/original content-command/outbox and two-sided sharing
mutations with changed-control witnesses. The service source restriction now exists,
but downstream derived invalidation, source-content loss/restore, retention-deadline
shortening and independent recovery after original-native revocation remain pending.
Encryption, useful saved-decision Ask, aggregate64/420 qualification, unchanged final
regressions/reviews and all X01–X09 remain unqualified. The source stream index retains
all20 complete streams from5 jobs, including cache collision and recovery/test failures;
index/docs additions follow the passing diagnostic candidate.

### Turn 17 — exact accepted-record tombstone publication (f05-02 active)

`TombstonePublicationRepository.forget` now publishes only a current tombstone control
for a closed class/ID/revision/witness. It requires current forget/task/maintenance
scope and policy, exact F04 native maintenance service and current full source/native
audience; every target needs an installed same-Space Task lineage. It does not perform
payload erasure, enqueue/complete descendant propagation or issue a full forget receipt.
Missing lineage and methods refuse. Migration7 pins
`51ed3fa8316877aa425a1a44c9c4fc4e5ebffded0fe170aa6308c47a0539e274` and adds an
immutable forced-RLS original marker/three composite FKs/fixed revoked-PUBLIC function,
with SELECT/EXECUTE only. Prior migrations/ledger rows/owner catalog remain unchanged.
Version4 journal reservations bind exact class/ID/revision/witness/time plus previous/
next anchors under same-policy/changed-digest rules. Actual PG projection, publication,
rollback and recreated original-key reconciliation must match exact marker binding,
head witness/tombstone command/epoch/time/current digest before independent ACK.
Pending, corrupt, offline and unknown state blocks serving; no automatic replay follows.

Controller `job-cc6f80a63a` passes65/65 authority (read78/deny310/owner6), migration8/8
(owner2/deny60), six zero violation counters, zero fail/cancel/skip/TODO and2,581 unchanged
inputs. Eleven mandatory tombstone children prove current source/knowledge suppression,
same-ID class isolation, missing-lineage and class-binding refusal, actual rollback,
ACK gap/corruption/timeout, genuine COMMIT wire loss in both directions, two observed
PG waiters/single tombstone, SQL/barrier expiry, live forget-grant removal with stale
native/new native behavior, direct role/immutable history and closed journal negatives.
The [stream index](../../g1-storage/evidence/f05-02-tombstone-v1.json) keeps all8 complete
streams from both passing jobs and hash links9 preceding indexes; all hashes/bytes
were verified. The first job passed64/64 before class-isolation and inventory additions.
Direct local contracts12/12 pass; the sandbox authority diagnostic failed process
census before fixture creation and is retained separately. These diagnostics precede
the stream/docs update and do not certify final acceptance.

f05-02 remains active1/15 for accepted-head/content-command/outbox/sharing mutation.
Full encryption/recall/conflict/forget/descendant propagation/Ask/content restore and
aggregate/regression/review acceptance remain pending. Every external X gate, enterprise
policy/holds/deadline application, original-native-revocation recovery, multi-host/
anti-rollback/KMS/provider storage, disk/power loss and journal compaction are unqualified.


## Turn 18 — atomic forget control receipt and pending propagation intent

f05-02 remains active, plan1/15. `ForgetWorkRepository.forget` publishes the exact
accepted-record tombstone, original scoped command receipt and one pending propagation
intent in a single actual F02 authenticated transaction. Current task/maintenance/
forget grants, policy, exact installed native maintenance binding, same-Space Task
lineage and full current source/native audience remain required. Receipt/job IDs,
epoch/anchor/digest/time are generated by the service; request fields cannot supply
these authorities. `pendingWork` returns only `propagation-pending` and opaque IDs
under current scoped authority. This is a control receipt, not physical erasure,
descendant completion or a full user-facing forget acknowledgment. No worker can
read, lease or consume the outbox in this slice; future processing needs installed
maintenance admission/accounting and current-authority checks.

Additive migration8 `0008_forget_work.sql`, SHA256
`eb0161fd3a2d1bd981cb1507ebba3b8e280918fc19529e9e8887e9432aa30c88`, adds
immutable forced-RLS `storage_forget_work`, exact composite FKs to the original command
(binding/receipt/epoch/time) and job (actor/key/class/target/revision/epoch/time),
original tombstone-publication and scoped tombstone FKs, plus a fixed-path revoked-PUBLIC
function. Serving roles receive only controller SELECT/function EXECUTE. The SQL
owner writes tombstone/command/job/epoch/original markers atomically. Migrations1–7,
their historical ledgers and installed owner catalog remain unchanged; migration8
rollback/repeat/latest-catalog/historical-ledger compatibility are exercised.

Journal version5 preserves the earlier four closed branches and reserves exact
entity/witness/time plus receipt/job IDs under same-policy/changed-control rules.
Command and outbox controls are included in the independently projected digest;
protocol markers remain outside it to avoid a circular digest. Recreated original-key
lookup reconstructs the exact tombstone command and checks every persisted receipt/job
field, epoch and time against the independent reservation before witness ACK. A missing
job, wrong protocol, corrupt control, timeout or unknown COMMIT leaves serving blocked.
Serialized absence restores only the exact previous witness and grants no automatic replay.

Controller `job-a1188914fd` passes authority78/78 (read95/deny390/owner6) and
migration8/8 (owner2/deny60), no fail/cancel/skip/TODO, six zero violation counters
and all2,581 guarded inputs unchanged. Thirteen mandatory new children include
source/knowledge suppression with unaffected positives, same-ID class isolation,
malformed/scope/lineage/native/grant denial, original actor/key binding isolation,
actual reservation/SQL rollback and an injected SQL failure after receipt insertion
but before job insertion, missing persisted-job recovery refusal, legacy-protocol
refusal, ACK-gap corruption/timeout, both genuine COMMIT-wire outcomes, two observed
PG waiters/single command+job+tombstone, expiry after publication/barrier waits,
live forget-grant removal and stale-native/fresh-native behavior, role/history/FK
catalog denial and closed reservation negatives. These metadata diagnostics retain
save/Ask/full-forget/propagate/restore positives at0. The earlier `job-f5443a07d3`
also passed78/78 and8/8 before missing-job/cross-protocol/reservation refinements.

The [complete stream index](../../g1-storage/evidence/f05-02-forget-work-v1.json)
retains all8 byte-identical controller stdout/stderr streams, candidate digests,
reports, actual fixture/process/container/four-root cleanup and verified hash links
to all10 preceding indexes. Separate sandbox authority stdout/stderr retain the
process-census refusal before fixture creation; local contracts12/12 passed. No
checks were bypassed. Stream/index/docs updates follow the diagnostic candidates;
aggregate/current-candidate final acceptance remains pending.

Next f05-02 work is canonical accepted-head publication and authenticated two-sided
sharing mutation with independently acknowledged changed-control witnesses. Full
payload encryption, content recall/conflict/forget/descendant propagation, useful
saved-decision Ask, actual source-loss restore, frozen64/420 suites, unchanged final
regressions, independent reviews and final acceptance remain pending. AllX01–X09,
enterprise holds/deadline application, recovery after original-native revocation,
provider/KMS/multi-host/anti-rollback/power-loss qualification and journal compaction
remain unqualified. Pending control intents are never archived/restored/replayed as
worker authority. No paid/shared/external action occurred.


## Turn 19 — current authority for historical control reads

f05-02 remains active, plan1/15. Original-key lookup now verifies the installed
native maintenance service binding, full current native audience and fences in
both pending and acknowledged witness branches, including serialized absence.
It repeats native freshness after current control-digest/authority checks.
`ForgetWorkRepository.pendingWork` uses the same native checks and repeats current
storage authority before returning opaque receipt/job metadata. Exact source,
tombstone and forget-work receipt inspection also resolves the immutable entity
revision's installed Task lineage and verifies its current source audience.
Deleted/revoked content is not reopened to inspect its own authorized control
receipt. A durable receipt can outlive its original command deadline; it grants
no replay, serving, worker-consumption or deletion-completion authority. Reads
after original native revocation/Stop remain unsupported and fail closed.

The six additive mandatory control-read children exercise all five publication
owners, recreated successful reads, missing lineage, all-party recipient read-grant
removal/restoration, and actual installed NativeRepository Stop followed by exact
original and new-key lookup refusal. A real uncommitted recipient mutation blocks
one audience reader and five readers behind the exact Space advisory barrier;
PostgreSQL observes all six blocked readers before COMMIT, and every reader then
refuses. Pending-witness audience refusal preserves the reservation; restoring
the synthetic grant permits original-key reconciliation. Actor/key isolation
still returns absence with the other actor's own valid native session and refuses
use of another actor's session.

The intentional pre-repair controller run `job-9514dfb02e` failed four new children
plus their parent (79/84 pass, unauthorizedDisclosure9). It confirmed that the
acknowledged branch skipped native/full audience checks, pending-work skipped native
freshness, and historical restriction/tombstone inspection omitted lineage.
After repair, controller `job-90d73f3571` passes authority84/84
(read119/deny416/owner6) and migration8/8 (owner2/deny60), no fail/cancel/skip/TODO,
six zero violation counters and all2,581 protected inputs unchanged. Migrations1–8,
their original pins/ledgers/catalog, installed owners and accepted checks are unchanged.

The [complete stream index](../../g1-storage/evidence/f05-02-control-read-v1.json)
retains all six byte-identical streams from the failed reproduction and passing
authority/migration checks, candidate digests, TAP results and actual owned
process/container/root cleanup. All12 preceding indexes and150 prior linked
references were verified. Local diagnostic logs remain complete: initial captures
inside the candidate were correctly rejected by its unchanged integrity guard;
sandbox authority also refused unavailable process census before fixture creation.
A subsequent stable local contracts run captured outside the candidate passes12/12.
These diagnostics do not replace controller evidence. Stream/index/docs additions
follow the passing candidate; final current-candidate acceptance is pending.

Next f05-02 work remains canonical accepted-head/content-command publication and
authenticated two-sided sharing mutation with independently acknowledged changed
control witnesses. Full encryption, recall/conflict, physical forget/retention/
descendant propagation, useful saved-decision Ask, actual content-loss restore,
frozen64/420 aggregate suites, final regressions and independent reviews remain
pending. Every X01–X09 external gate, enterprise holds/deadline application,
provider/KMS/multi-host/anti-rollback/power-loss qualification and journal compaction
remain unqualified. No paid/shared/external action or real access-setting change occurred.

## Turn 20 refinement — all-class accepted-head read authority

Every accepted-head class now requires its exact installed origin Task's current
F02 audience before a control read returns. Nullable lineage in historical
non-source enrollment cannot authorize a read; it fails closed. Optional source
payload attribution and installed origin Task lineage are distinct. Preserve
migrations1–8, original pins/ledgers, immutable history and historical digest
encoding. Full source dependency eligibility remains the later content/recall
owner's responsibility.

Seven new mandatory authority component children prove all11 classes with distinct
real Tasks under the same ID, all-party recipient denial, six actual queued PG
readers denied after a membership COMMIT, exact missing-lineage refusal/restoration,
scope/extra-field negatives, actual audience wait through content expiry and
remaining-member positives. The pre-repair failure and intermediate expiry-fixture
failure are retained. The expiry fixture must issue an actual membership UPDATE:
row FOR UPDATE does not conflict with the installed audience verifier's table
SHARE lock. Require exact observed pg_blocking_pids before delaying past expiry.

Controller `job-451ff4722a` passes authority91/91 and migration8/8, all six violation
counters zero and2,581 protected inputs unchanged. Complete logs and limitations
are in [the evidence appendix](../evidence/g1-f05-acceptance.md) and
[the immutable stream index](../../g1-storage/evidence/f05-02-entity-read-v1.json).
f05-02 remains active at1/15 tasks. Next is canonical accepted-head/content-command
and authenticated two-sided sharing publication; no content, useful Ask, propagation,
restore, aggregate/final acceptance or real external environment qualification is
claimed by this repair.


## Turn 21 — accepted-head control publication (f05-02 active)

Implement `HeadPublicationRepository` through an installed `HeadMaterialResolver`,
with closed original native command/material ID/expected reference, exact next
revision, current old/new installed Task audience and finite policy deadline.
No request/archive installs material controls or an epoch anchor. This owner
publishes control metadata only; staged ciphertext/canonical payload commands
and content jobs are later work. Migration9 pin `23e52909335b8349bab825d7f247eee3a1b14d3320646441746694aa474c90f1` adds
immutable forced-RLS original marker/full composite head-lineage-expected FKs,
fixed-path revoked-PUBLIC functions and controller SELECT/EXECUTE only. Preserve
all original migrations1–8/pins/ledger rows/function definitions. Journal6 binds
full scoped material/opaque ID/expected witness/database time and same-policy/
changed controls; actual PG projection/publication/recreated original-key ACK
must agree. Pending/unknown remains unavailable and grants no replay.

Use `storage_shared_controls_v2` with numeric current epoch ordering. Originalv1
selected its epoch text alias lexically, returning9 ahead of10. Preserve that
function and raw failed reproduction. Require installedv2 for serving, without
fallback; assert all8 bridge projections equal scoped PG rows and serialized
field/numeric/timestamp bytes before applying actual source restrictions.

Fifteen new mandatory authority children cover all11 same-ID classes, current
lineage/scope/material/native/retention/role negatives, exact corrections,
partial SQL rollback, ACK corruption/timeout, both actual wire outcomes, ordered
two PG waiters/one winning head, late expiry and grant/audience races. Keep new
children after unchanged legacy lifecycle checks to preserve their60s fixture
periods. Their original actor0 IdP session is genuinely revoked: use other valid
fixture identities, never refresh it silently or weaken the verifier. A restored
membership revision leaves old native binding stale; new native admission is needed.

Controller `job-36ae0ee784` passes authority106/106 and migration8/8,
all six violations0 and2,581 guarded inputs unchanged. Full failed/current streams,
exact candidate/cleanup diagnostics and local/external limits are in
[the evidence appendix](../evidence/g1-f05-acceptance.md) and
[the new index](../../g1-storage/evidence/f05-02-head-v1.json).
f05-02 stays active,1/15. Next: authenticated two-sided sharing mutation and
canonical payload command/outbox controls. Content encryption/recall/conflict/
propagation/Ask/restore,64/420 aggregate/final regression/reviews/acceptance and
all externalX gates remain pending. Material metadata is not ciphertext proof.


## Turn 22 — f05-02 scoped control ledger submission

Use the installed `ShareMaterialResolver` and `SharePublicationRepository` to create
same-tenant group/share source relations through actual F02/native authority.
Acquire both exact F03 barriers in sorted order before any one-Space lock; repeat
full source/native audience and finite freshness after publication. Source sender
share/task-write permission is separate from destination maintenance/share authority.
Never construct source scope from request JSON or archive metadata. Incoming
relation controls advance the destination epoch; source controls stay unchanged.
Journal7 pins the exact installed route/source Task/source independent anchor and
same-policy changed-destination digest. Additive migration10 pin
`066f7f9c413f83961c58e7fc4590d429c4a48e56204eaff77f8b5a76cb3f777c` adds immutable
exact original-receipt/relation/head composite FKs and fixed/revoked-PUBLIC functions.
Migrations1–9/pins/original ledgers/definitions and protected inputs are preserved.

Controller `job-280c43de62` passes authority117/117 and migration8/8,
six violations0 and2,581 unchanged inputs. New twelfth sharing child physically
removes/restores the source independent journal; final-event schema7 scope tamper
also refuses recreated reads. Current controller task checks must verify these
refinements and the evidence/docs candidate. Complete retained streams and limits:
[acceptance appendix](../evidence/g1-f05-acceptance.md),
[sharing publication index](../../g1-storage/evidence/f05-02-share-publication-v1.json).

The bounded f05-02 metadata/control-ledger outcome is now submitted. Prior notes
listing canonical payload command/outbox implementation under f05-02 were too broad;
those encrypted commits are f05-04 in this approved task sequence. Full lifecycle
consumption/descendant propagation and service relation revoke remain f05-07.
Next is f05-03 encryption/owned staging, followed by all remaining content/Ask/
restore/test/evidence tasks. No full aggregate, independent acceptance or external
X gate is qualified by component success; all original limits remain.


### Turn 22 completion handoff

Controller `job-d2159738e1` verifies the current task candidate: authority118/118,
migration8/8, all six violations0 and2,581 preserved inputs unchanged. f05-02 is
controller-done, plan2/15. The missing-source-journal and tampered schema7-reader
regressions pass. Complete current/prior task-attempt streams and ownership cleanup
are in [the completion index](../../g1-storage/evidence/f05-02-completion-v1.json).
These append-only evidence/status updates follow the task candidate; whole F05
current-candidate acceptance stays pending. Start f05-03 authenticated ciphertext
and owned staging next, preserving the actual F02 UoW before every resolver and
all current authority/native/source barriers. Later lifecycle supplies relation
revoke and propagation; no new external qualification or authority is inferred.

### Turn 24 — owned filesystem primitive, f05-03 still active

`OwnedCipherFiles` now stages exclusive opaque upload directories/files, encrypts
descriptive manifests, and awaits file fsync, rename and directory fsync before
confirming actual byte+manifest authentication and retained-copy digests. A trusted
installed `StagingControl` capability must serialize reserve/current/confirm/
publication/GC for the same upload, persist current lease and command state, and
refuse absent authority. Publication and administrative inspection require the
exact retained confirmation; inspection returns the verified byte snapshot without
reopening a different ciphertext. This primitive creates no canonical save receipt.

Controller `job-011d7367b8` passes encryption8/8 and staging14/14, zero failures,
cancellations/skips/TODO and six zero violations; all2,581 preserved inputs unchanged.
Actual diagnostic PG locks/rows survive recreated clients; three real PG-observed
stage/publication/GC waiter schedules serialize safely. Active/reachable/pending/
unknown leases protect bytes; expired unreachable orphans quarantine then clean
with directory fsync. Real retained files/PG rows, canary scans, typed corruption/
ownership refusals, partial-phase exceptions, actual ENOTEMPTY cleanup failure,
injected post-PG-COMMIT acknowledgement loss and a mid-read valid-ciphertext
replacement are exercised. Full streams and earlier checked candidates are retained
in [the staging index](../../g1-storage/evidence/f05-03-staging-v1.json).

The PG coordinator is an **admin-only synthetic diagnostic**, not the installed
authenticated lease/reachability repository. Next in f05-03: implement that owner
with current F02 identity/audience, F03/native fences/barriers, current generation,
pending/original-unknown command protection and real post-wait revalidation; extend
the component accordingly before `loop_task done`. Actual process-kill schedules
remain unqualified; exception-at-phase tests are not SIGKILL evidence. Canonical
encrypted payload/receipt/event/outbox and original-key integration stay f05-04;
all-class scans stay f05-14. Trusted single-host directory custody, surviving current
PG authority and independently held fixture keys remain the local profile. External
provider/KMS, malicious host administrator, multi-host/hardware durability and all
X gates are unqualified. Evidence/docs additions follow the checked implementation
candidate and do not replace later current-candidate acceptance.

### Turn 26 — authenticated preparation-only terminal abandonment

f05-03 stays active, plan2/15. Add migration12 immutable exact-original abandonment
and `AuthenticatedStagingPreparation.outcome/abandon` under current F02 audience,
native maintenance/Stop and F03 Space-first original-key locks. A committed
abandonment caps the preparation lease, enabling actual quarantine/GC for an
unreachable upload. Pending/missing/uncertain originals never authorize replay or
GC. Current accepted-head/original-command/outbox reachability protects bytes;
current material/root/generation/native/source/policy/epoch must still validate.
Preserve migrations1–11, their pins/historical ledgers and installed catalog.

Controller `job-dcab49b526` verifies encryption8/8 and staging31/31, all six
violations0 and2,581 preserved inputs unchanged. Ten new mandatory children cover
exact original/role/history boundaries, partial and confirmed recovery, genuine
wire-COMMIT commit/rollback, exact observed PG staging/GC waiters, quarantine
recovery, source audience/actual Stop, before/after-terminal current head
reachability, real ENOTEMPTY and expiry after terminal INSERT with rollback.
Initial failure and repair remain retained in the
[acceptance appendix](../evidence/g1-f05-acceptance.md) and
[stream index](../../g1-storage/evidence/f05-03-abandonment-v1.json).

Next in f05-03 is authenticated publication/outcome integration, post-original/
post-native expiry recovery without revived command authority, and actual
filesystem process-termination schedules. Current preparation owner explicitly
refuses publication; `inspect` has no user-serving authority. Future canonical
publication must hold the same Space/original locks and reject terminal uploads.
Keep canonical encrypted payload/save/event/outbox in f05-04, all-class E01–E04
in f05-14, and full lifecycle/Ask/backup/restore/frozen aggregate/independent
acceptance in their declared later tasks. Surviving current PG authority,
independently held fixture keys and trusted single-host directory custody remain
the only local profile; independent terminal anti-rollback, all X gates and all
previous external limitations remain unqualified.


## Turn 27 — actual filesystem worker termination

f05-03 remains active, plan2/15. Controller `job-b45f8c1aeb` passes
strictly built encryption8/8 and staging41/41. Ten new mandatory identities
exercise actual owned child `SIGKILL` at allocated, object-written,
object-fsynced, object-renamed, object-directory-fsynced, manifest-fsynced,
manifest-renamed, manifest-directory-fsynced, confirmed and quarantined phases.
Each phase is observed over private IPC and independently checked against real
files and PostgreSQL before termination. The worker receives synthetic installed
root/crypto capabilities through IPC with an empty environment and no arguments;
no credential, key or payload is written to its stdout/stderr or a capability file.

The filesystem process performs the actual adapter syscalls. Its installed
`StagingControl` calls use the parent's authenticated owner and the same held
transaction/locks. Verified child exit aborts that transaction. Recreated owners
prove the original reservation remains pending and protected with no committed
confirmation, even after the worker reached the confirmed hook. Original lookup
never grants replay; inspect/publication refuse and a second stage conflicts.
Only committed authenticated abandonment allows bounded quarantine/cleanup.
Quarantine interruption preserves exact ciphertext and terminal history; current
all-party denial still refuses cleanup before restored synthetic authority allows
recovery. Every child is closed and every original reservation remains unique.

This qualifies **filesystem worker process death with a surviving authenticated
PG owner**, not termination/restart of the whole service, database host, physical
host or power supply. Current PG identity/control authority, the installed
material resolver and independent ephemeral fixture keys survive. The additional
mandatory cases do not change the frozen64/420 aggregate inventory or any
accepted/protected checks. Raw streams and limitations are indexed in
`g1-storage/evidence/f05-03-process-kill-v1.json`; all21 preceding indexes and195
linked references were verified unchanged.

Next f05-03 work is installed authenticated durable publication/settled original
content-command integration under the same Space/original locks, terminal
anti-rollback and expired/revoked native recovery. Canonical encrypted save/event/
outbox remains f05-04. Whole-service crash windows need separate actual schedules
when that owner exists. Useful Ask, deletion/retention propagation, real backup/
content-loss restore, E01–E04, aggregate and independent acceptance remain later
tasks; all external X01–X09 remain unqualified.


## Turn 28 — preparation cleanup after original expiry or native Stop

f05-03 remains active, plan2/15. Add explicit installed
`AuthenticatedStagingPreparation.recovery()` with frozen maintenance-only control,
original outcome lookup and unreachable abandonment. It uses the same Space-first
original-key locks, authenticated UoW, independent current storage epoch/policy,
current maintenance grant, original actor, exact historical native service
maintenance admission/source Task/full current audience and unchanged material/
root/generation. It inspects native binding without `fresh()` or continuation
admission. Original expiry or native Stop can no longer strand an otherwise
currently authorized unpublished preparation. Current revoked identity/audience/
maintenance, missing material/original/current epoch or changed binding still
refuses. Recovery is an installed capability, never caller JSON or automatic
fallback from live-command refusal. Native controls are unchanged.

Recovery cannot reserve, confirm, publish, resume or grant replay. Pending remains
GC-protected until explicit terminal COMMIT. Reachable ciphertext is refused by
the entire recovery control lock, preventing administrative inspect eligibility
and leaving that upload to its canonical owner. Existing live preparation APIs
retain all expiry/write/fresh/Stop checks. Genuine `UNKNOWN_COMMIT` preserves its
redacted original-key lookup action; recreated recovery reconciles committed
abandonment versus pending rollback without replay permission. No migration,
serving ACL, installed owner, historical SQL/pin/ledger or accepted check changed.
Add the existing exact-original abandonment record to the closed control inventory.

Controller `job-bcd2b0d31d` passes encryption8/8 and staging50/50
(read64/write99/deny154), with six zero violation counters and2,581 protected
inputs unchanged. Nine mandatory new recovery children exercise actual original
expiry, confirmed/partial native Stop without resume, full current audience and
binding/actor/tenant negatives, maintenance authority without write grants,
actual original-lock wait revalidation, both stage/recovery race directions,
post-terminal material-change rollback, genuine lost-COMMIT commit/rollback and
reachable/quarantine refusal/recovery. Existing process-kill, filesystem and
live-expiry checks remain mandatory. Local strict builds and contracts12/12 pass.

Initial `job-1613fa0581` behavior passed encryption8/8 and staging49/49, but
staging correctly failed its unchanged candidate-stability guard: a reachable-
recovery review fix was edited while the job ran. Full failed and final streams
are retained in [the recovery index](../../g1-storage/evidence/f05-03-recovery-v1.json).
The final implementation remained stable during the passing job. Inventory/docs/
index additions follow those diagnostics, not final current-candidate acceptance.

Next f05-03 remains authenticated durable publication/settled original integration
and independently witnessed staging terminal anti-rollback under these same locks.
Future canonical publication must reject abandonment. Canonical encrypted save/
event/outbox stays f05-04. Whole-service crash/restart with that owner, useful Ask,
lifecycle/descendant propagation, actual encrypted backup/content-loss restore,
E01–E04, frozen aggregate and independent acceptance remain pending. The local
profile requires surviving current PG and installed material authority, independent
fixture keys and trusted single-host directory custody. All external X01–X09,
provider/KMS/rotation, enterprise holds, multi-host/hardware durability and host
administrator defenses remain unqualified. No paid/shared/external action or
nonreproducible data deletion occurred.


## Turn 29 — independent preparation terminal witness

f05-03 remains active, plan2/15. Add mandatory installed
`StagingWitnessJournal` outside content/backup roots to authenticated preparation.
Exclusive immutable enrollment pins the exact scoped actor/original command,
material/upload/root/cipher binding/native session/source Task/expiry before PG
reservation. Surviving enrollment blocks restaging after reservation rollback;
serialized absence still grants no replay. Durable abandonment intent precedes
terminal INSERT. Intent blocks confirmation/publication and protects physical GC
through rollback or lost acknowledgement. Only a fresh committed PG observation
under current authenticated authority and the same Space-first original locks may
settle the exact original and full PostgreSQL microsecond terminal timestamp.
Settlement is a separate transaction after INSERT COMMIT. Current authority and
material are rechecked before/after settlement; explicit expiry/Stop recovery
retains its maintenance-only scope and cannot resume/serve/replay.

An independent settled witness refuses older PG terminal snapshots and even a
one-microsecond timestamp alteration. Intent plus later reachability is a
contradictory control state and refuses all operations, including administrative
inspect; immutable original/terminal files are retained after actual content GC.
Witness files contain only opaque controls, no descriptions or keys. Closed
inventory and backup exclusions now include independent staging authority. Local
bounded 4KiB/nofollow/single-link reads, owned sentinel/device/inode checks,
fsynced exclusive temporary files, hard-link CAS and directory fsync are actual
filesystem behavior. Two recreated CAS contenders are held after observing the
same absent enrollment; exactly one exclusive publication succeeds.

Final controller `job-bcb9fd46d7` passes encryption8/8 and staging55/55
(read69/write107/deny187), six violation counters0, all2,581 protected inputs
unchanged and owned PG16.12/IdP/container/roots cleaned. Five mandatory new children
exercise PG snapshot rollback/exact terminal alteration, ack gap/rollback intent,
enrollment rollback/no replay, filesystem bounds/corruption/missing files/symlink/
hardlink/root substitution/CAS and postwait material refusal plus actual
GC/settlement lock contention. Existing wire-COMMIT, native Stop/expiry and ten
filesystem worker SIGKILL cases remain mandatory. Local strict build and
contracts12/12 pass. Initial controller failure retained the old reachable+terminal
expectation; that child is strengthened to assert complete refusal and exact
surviving ciphertext. The failed generic test-decorator build is also retained.
[The witness evidence index](../../g1-storage/evidence/f05-03-witness-v1.json)
retains12 complete controller streams and6 combined local streams; all23 preceding
indexes and154 unique linked references are verified unchanged. Diagnostics bind
stable candidate `sha256:c10a79d4fe7a2404eee467ab2d6e63ce4b35f0eb8c20546593af82e9cee52dca`.
Evidence/docs additions follow that check and require fresh final acceptance.

This qualifies only PG staging-terminal rollback with a surviving independent
installed witness and current identity/control/material authority. Root loss or
rollback, compaction beyond1,024 originals, witness-append process death and
whole-service/PG-host/hardware/multi-host disaster recovery remain unqualified;
interrupted hard-link publication may fail closed on temporary links and has no
automatic authority repair. The fixture snapshot restores a reproducible terminal
table, not a content backup/restore journey. Trusted single-host directory custody
and independent ephemeral keys remain the local profile.

Next f05-03 is authenticated durable publication/settled original content-command
integration under the same locks, rejecting every abandonment intent/terminal.
Canonical encrypted save/event/outbox stays f05-04. Useful saved-decision Ask,
retention/delete/descendant propagation, actual encrypted content-loss restore,
E01–E04, frozen64/420 aggregate and independent acceptance remain later tasks.
All X01–X09, provider/KMS/rotation, enterprise holds and remote runtime qualification
remain unqualified. No historical SQL/pin/ledger/installed serving ACL or accepted
check changed; no paid/shared/external action or nonreproducible deletion occurred.


## Turn 30 — administrative snapshot validation through owner completion

f05-03 remains active, plan2/15. `OwnedCipherFiles.inspect` now retains the exact
verified plaintext buffer until the installed owner's complete lock operation
succeeds. After byte/manifest decryption it rereads current scope/root/binding,
reachability, unknown status and exact confirmation, then rechecks the owned root.
A postread refusal, owner final current-authority refusal, rollback or typed lost
completion acknowledgement clears that held byte buffer before propagating the
redacted error. Successful inspect transfers the exact confirmed snapshot without
another file read. Descriptive JavaScript strings and complete process memory
zeroization are not claimed. This is administrative inspection, not a serving API.

Controller `job-a2f2d01054` passes strict encryption8/8 and staging59/59,
zero failure/cancellation/skip/TODO, six zero violation counters and all2,581
protected inputs unchanged. Staging observes read75/write113/deny193;
encryption remains49/49/59. Actual PG16.12/IdP/container/marked roots are cleaned.
Four new mandatory children cover changed retained PG confirmation with actual
transaction rollback, owner rollback/post-COMMIT acknowledgement/untyped failure,
authenticated post-decrypt material change and the unchanged authenticated owner's
final material refusal after a successful callback. Recreated readers recover the
exact UTF-8/binary content; contradictory confirmation rolls back and ciphertext
remains retained. Control-only fixture head enrollment supplies administrative
reachability and grants no canonical save receipt. Existing current audience,
Stop/expiry, wire-COMMIT, GC races, witness and ten SIGKILL cases remain mandatory.

[The inspect index](../../g1-storage/evidence/f05-03-inspect-v1.json) retains four
complete controller streams, six local build/contracts streams, the initial new
test typing failure and stable checked candidate
`sha256:4b911eddd34e72151b23e3341cba79b4592620773fbca07f40e9ed6992b666ec`.
All24 preceding indexes and174 total preserved index/linked files match their
prior byte counts and hashes. Local contracts12/12 pass. Evidence/docs additions
follow the passing diagnostics and need fresh current-candidate final acceptance.

Next f05-03 remains installed authenticated durable publication and settled
original content-command integration under the same Space/original locks,
rejecting every abandonment intent/terminal. Canonical encrypted save/event/outbox
stays f05-04. Whole-service/witness-append death, useful saved-decision Ask,
retention/delete/descendant propagation, actual encrypted backup/content-loss
restore, E01–E04, aggregate and independent acceptance remain pending. Current
PG/witness/material authority, independently held ephemeral keys and trusted
single-host directory custody remain required. All X01–X09, provider/KMS/rotation,
enterprise holds, hardware/multi-host/remote qualification remain unqualified.
No historical SQL/pin/ledger/installed serving ACL or protected check changed;
no paid/shared/external action or nonreproducible deletion occurred.


## Turn 31 — exact confirmation and publication callback postconditions

f05-03 remains active, plan2/15. `OwnedCipherFiles.stage` now observes the exact
retained byte/manifest confirmation after the confirm callback and phase hook,
rechecks the active lease and owned root, then leaves the held owner transaction.
`publish` compares the exact confirmation again after actual decryption, before
publisher entry. After the publication effect/hook it requires the same scope,
binding/root, exact confirmation, reachable pointer, nonpending/nonunknown status
and owned sentinel before the callback can finish. A fulfilled no-op or
contradictory callback cannot create a successful durable-file acknowledgment.
Current authorization and original-command checks through owner completion remain
the installed owner's responsibility. UNKNOWN_COMMIT still grants no replay.

Controller `job-06ca5175df` passes encryption8/8 and staging63/63, with no failed,
cancelled, skipped or TODO tests, six zero violation counters and all2,581
protected inputs unchanged. Staging observes read85/write136/deny208; encryption
remains49/49/59. Four added mandatory children cover no-op/altered confirmation,
actual post-decrypt confirmation change with zero publisher entries, contradictory
publication results with real PG rollback, and PG-observed GC waiting after the
publication effect. The rollback variants include no-op, lost reachability,
pending/unknown state, changed confirmation/generation/root and actual post-effect
sentinel corruption. Recreated clients publish once and recover exact retained
UTF-8/binary bytes after refusal. Existing authenticated Stop/expiry/witness,
wire-COMMIT and ten filesystem worker SIGKILL children remain mandatory.

[The postconditions index](../../g1-storage/evidence/f05-03-publication-postconditions-v1.json)
retains eight complete controller streams, eight local streams and stable checked
candidate `sha256:a150794352c948f43bacfbe950df4aa1d1df7d27c8c6282455c94be8aca20073`.
Pre-fix controller `job-cc993eb587` failed the three new negative groups; the full
failure/cleanup is retained. Local strict build and contracts12/12 pass. Initial
local contract capture wrote its changing log inside the candidate tree; all tests
passed but the final integrity guard correctly failed. The successful rerun captures
outside the tree, with both results retained. All25 preceding indexes and183 linked
index/evidence files retain their exact hashes/byte counts. Documentation/evidence
additions follow these diagnostics and require fresh integrated final acceptance.

The publication positives use the existing admin-only PG diagnostic owner; this
slice does not install authenticated canonical publication or settled content-command
integration. Those remain next in f05-03 under the same Space/original locks,
rejecting every independent abandonment intent/terminal. Canonical encrypted
save/event/outbox stays f05-04. Useful saved-decision Ask, retention/delete/descendant
propagation, actual encrypted content-loss restore, full E01–E04 scans, aggregate
and independent acceptance remain pending. All X01–X09 and external provider/KMS/
rotation/enterprise-hold/remote/hardware/multi-host environments remain unqualified.
Surviving current PG/witness/material authority, independent ephemeral keys and
trusted single-host filesystem custody remain required. No distributed FS/PG
atomicity or hostile host/filesystem custody is claimed. No protected checks,
historical SQL/pins/ledger or installed serving ACL changed; no paid/shared/external
action or nonreproducible deletion occurred.


### Turn 31 follow-up — immutable verified proof across callbacks

The exact verified byte/manifest confirmation is now copied and frozen before
passing it to either installed confirm or publish callback. Equality rechecks
cannot be defeated by a callback mutating the proof object itself. Runtime
`Object.assign` mutation attempts refuse with a redacted error; actual diagnostic
PG confirmation/pointer transactions roll back, retained bytes survive, and
recreated clients publish/read normally. The same four mandatory child identities
now include these two additional mutation variants.

Final controller `job-541bbeaddc` passes encryption8/8 and staging63/63,
read86/write139/deny211 for staging, all six violations0, no failed/cancelled/
skipped/TODO tests, all2,581 protected inputs unchanged and actual owned
PG16.12/IdP/container/roots cleaned. Strict local build passes. New-test readonly
assignments initially failed strict compilation; tests now attempt mutation
through the actual runtime operation, preserving the static readonly contract.
[The immutable-proof supplement](../../g1-storage/evidence/f05-03-publication-postconditions-v2.json)
retains eight more complete controller streams, four local build streams, that
failure and stable checked candidate
`sha256:601377fbc74bad306cd48fedc6c3bccfe1be0440166731dbf3d26a9ba059c8ff`.
All26 preceding indexes and200 linked files retain exact hashes/byte counts.
The earlier successful/failed postcondition and contract streams remain in v1.
Evidence/docs additions follow diagnostics and require integrated final acceptance.

This still qualifies only the file-adapter contract with the admin diagnostic
publication owner; f05-03 remains active. Next install authenticated durable
publication and original content-command outcome integration using the SAME
transaction and Space/original locks. Do not nest `HeadPublicationRepository.publish`
inside the file control callback: it opens its own committing UoW. Independent
abandonment intent/terminal must refuse publication. Every external, serving,
propagation, backup/content-loss restore and aggregate limitation above remains.


### Turn 32 f05-03 progress — installed durable head prerequisite

f05-03 stays active,2/15 tasks done. The installed
`AuthenticatedStagingPreparation.headPrerequisite(contentRoot,crypto)` now binds
actual confirmed encrypted object/manifest bytes to the head witness and exact
installed command/material/native/source/root/AAD controls. It runs before epoch
reserve and near transaction completion in `HeadPublicationRepository`'s SAME
committing authenticated UoW, with Space-first original staging locks held through
COMMIT. It rejects independent abandonment intent/terminal, rechecks actual bytes/
confirmation/material/sentinel after the head effect, and observes the lease again
after final decryption. Epoch and staging witnesses require separately marked
closed authority namespaces outside content/backup. No nested head UoW is allowed.

Controller final `job-b32fc954d6` passes encryption8/8 and staging72/72, six
violations0, all2,581 protected inputs unchanged and owned fixture cleanup.
`job-5131ecccbd` passes unchanged authority118/118 before the final lease assertion
was added. Nine mandatory new identities cover same-transaction/exact-byte positives,
missing committed confirmation, bindings/corrupt ciphertext, intent/terminal,
post-effect rollback, observed GC/duplicate/original waits, wire outcomes and actual
lease expiry during final decryption. Complete failed/passing/raw/build/contracts
streams and preservation hashes are in
[g1-f05-acceptance](../evidence/g1-f05-acceptance.md) and
[staged-head-v1](../../g1-storage/evidence/f05-03-staged-head-v1.json).

Next: require this installed prerequisite in the canonical content owner and
complete settled original content-command integration. The old head control-only
path and preparation `lock().publish` remain distinct; there is no save receipt,
content event/outbox, serving API or consumed content outcome in this slice.
Canonical encrypted PG save/event/outbox remains f05-04. Saved-decision Ask/no-VM,
retention/delete/descendants, actual encrypted content-loss restore, E01–E04,
aggregate and independent acceptance remain subsequent tasks. All external gates,
whole-host/witness-append/hardware/multi-host/host-custody environments remain
unqualified. This is partial local component qualification, not F05 completion.


### Turn 33 — exact original staging consumption, task-completion submission

`EpochWitnessJournal.headPublication` reads the same bounded validated immutable
chain as current authority and distinguishes exact original head pending,
committed and rolled-back attempts. `AuthenticatedStagingPreparation` now
requires the original scoped PostgreSQL head/epoch protocol rows, accepted-head
and entity lineage, exact command binding/previous-next anchor, microsecond
publication/expiry timestamps and cipher-confirmation witness to report consumed
staging. A committed independent original cannot become pending when one or both
PG protocol rows disappear. Consumption makes the lease nonpending but reachable;
it grants no GC permit, replay, canonical save or serving capability. The existing
post-effect prerequisite validates the same pending transition within the SAME
authenticated head UoW; ordinary outcomes require independent ACK reconciliation.

Three new mandatory children and extended genuine wire tests cover recreated
consumed state, actual Stop with consumed-control recovery and no resume/serving/
cleanup, missing both original protocol records and material/binding/confirmation
alterations, and a PG-observed original lock wait followed by changed installed
material. Unrelated reachability still reports pending and blocks abandonment;
independent abandonment intent/terminal still forbids publication. No SQL,
migration/ledger pin, installed serving ACL or accepted check changes were made.

Controller `job-05178584c4` passes encryption8/8, staging75/75 and unchanged
authority118/118 on stable candidate
`sha256:664c7a9226a19208c5fe4c40183026e54ec0b5b84a35765d63dd889e4e43344e`.
Staging read121/write165/deny254, all six violations0; no failures/cancellations/
skips/TODO, all2,581 protected inputs unchanged and actual PG16.12/IdP/container/
roots cleaned. Strict local build and contracts12/12 pass. The tests-first
`job-92d0d86d50` correctly failed four groups; complete streams and cleanup remain
in [consumed-head-v1](../../g1-storage/evidence/f05-03-consumed-head-v1.json),
which also preserves all28 preceding indexes and434 evidence files unchanged.
Evidence/inventory/docs additions follow that candidate; controller task submission
rechecks the integrated task candidate. Independent/final acceptance remains later.

This completes the f05-03 **substrate implementation** within its frozen task
boundary: crypto envelope, real PG/file encrypted diagnostics, bounded durable
files, authenticated owned staging, pending/unknown/abandoned/consumed control
outcomes, current reachability, owned quarantine/GC, current Stop/expiry recovery,
wire uncertainty and filesystem process-kill recovery. The full every-class scan
is explicitly f05-14 after consumers exist. The next task f05-04 installs canonical
encrypted source/knowledge PG payloads, source-backed expected revisions, save/event/
outbox/original content receipts using these prerequisites. Canonical content
owners must require the installed ciphertext gate without caller-selected omission;
the old control-only head diagnostic path remains distinct. f05-05 owns artifact/
live-file/draft/checkpoint content receipts. A consumed staging outcome is neither
of those receipts. Ask/no-VM, propagation/delete/revocation, actual encrypted
content-loss backup/restore, full aggregate and all external X01–X09 remain pending.
Surviving current PG/independent epoch/staging witness/material/keys and trusted
single-host filesystem custody remain required; whole-host/PG-host/witness append
failure, root loss/rollback/repair, multi-host/hardware/hostile-custody durability,
external provider/KMS/rotation/enterprise-hold/remote environments remain unqualified.


Turn33 task completion: controller `job-96e4c3903b` passes encryption8/8 and
staging75/75 after evidence/inventory/README integration and marks f05-03 **done**,
plan3/15. The additive [consumed-head-v2](../../g1-storage/evidence/f05-03-consumed-head-v2.json)
contains four complete final streams and preservation hashes for all29 preceding
indexes and453 evidence files. Source/tests are unchanged from the passing behavior
candidate; this final capture is a later documentation/evidence update. The next
assignment is f05-04. All canonical content/serving/propagation/restore/aggregate/
independent/external boundaries above remain pending.

## Turn34 — f05-04 encrypted source provenance prerequisite

f05-04 remains active, plan3/15. `src/source-content.ts` adds an installed
`SourceContentPrerequisite` and authenticated current same-Space
`SourceContentRepository`; these are source-content building blocks, not the
user-facing save/correction/command workflow. The existing accepted head
publisher remains unchanged. The prerequisite decrypts and validates closed
attributed source payloads, binds the exact original actor/key/session/deadline,
material/head/all AAD controls and encrypted-envelope witness, invokes required
installed admission before and after publication, and rechecks the exact
immutable installed material around every admission await. It inserts and
checks ciphertext inside the head publisher's same authenticated committing UoW.
The source reader checks the independently accepted head, current policy/full
source audience/restrictions/expiry before and after decrypt, exact retained
ciphertext and attributed actor, then returns only after successful UoW completion.
Temporary decrypted Buffers are cleared; string/process-memory zeroization is not
claimed.

Additive forward migration13 creates `storage_sources` with forced service RLS,
immutable history, closed bounded AES-256-GCM envelope publication, content witness
hash and composite scope/source-Task/head/key/generation/epoch/timestamp/expiry/
original-publication FKs. The function requires the head publication's actual
PostgreSQL insertion transaction (`xmin`) to match the current transaction;
postcommit content insertion under an earlier head is refused. Controller
gets SELECT plus the narrow publication function, without direct INSERT/UPDATE/
DELETE; workers/IdP/client/PUBLIC receive no read or publication grant. Previous
migrations1–12 and their ledger rows/pins/catalogs remain unchanged. Migration
rollback before COMMIT is tested on a previous schema already containing an
actual published source head; repetition and installed-owner snapshots pass.
A preexisting control-only source head stays content-unavailable after upgrade.
The committed migration is additive and has no destructive downgrade; do not
remove retained source data to roll back an application deployment.

Actual retained `storage_sources` fields: descriptive title/URI/narrative/source
content digest/asserted-by/recorded-at are inside `cipher_text` only. Plaintext
metadata is tenant/Space/class/source-ID/revision/source-Task/envelope routing,
key/generation IDs, encrypted-envelope witness, epoch/acceptance/expiry,
original actor/key, nonce/tag/ciphertext size. Every field is bounded by the
closed envelope or matching accepted-head constraint. These source payloads
are intended content-backup inputs; current heads/epoch/original command and
publication markers remain surviving control authority, never restored from
payloads. Backup/restore support for this new store is not yet implemented.

The additive `source-content-component` task diagnostic runs
`node g1-storage/scripts/check-component.mjs source-content`; f05-04's mandatory
`knowledge-component` and `commands-component` are preserved and still pending.
Its ten mandatory children use actual PG16.12/IdP/role/UoW/current epoch fixtures:
upgrade/rollback/repeat with representative prior data; exact Unicode/control
character recovery through recreated keys/readers and retained-copy scans;
secret-marker/attribution/future-time/changed-material/schema denials; roles and
real DB integrity failures; partially written rollback; actual backend termination
after same-transaction content insertion; postinsert installed-owner change;
current source revocation; actual duplicate callers observed blocking on the
committing backend; genuine foundation UNKNOWN_COMMIT via wire-level COMMIT
request or reply loss with exact original-key commit/rollback reconciliation.
The synthetic `fixture-secret-denied` admission marker and finite60s fixture
retention are test policy, not a qualified production secret detector or retention
policy. No external source-check authority comes from the encrypted content.

Remaining within f05-04: actual explicit SourceCommand/save/proposal/verified-check
APIs, all seven persisted knowledge statuses, source/subject scoped dedup,
expected-head CAS and authorized history, selective correction/conflicts,
atomic canonical revision/current witness/save receipt/event/outbox, Saved here /
Pending review / Not saved, and typed HTTP503 original-key commit/rollback/
serialized-absence/timeout recovery with replayAllowed:false. The source adapter
returns no canonical save receipt and counts save0. The original head control
lookup's `absent-safe` is not user-command replay authorization. No task-completion
submission is made for f05-04. Ask/no-VM, transitive lifecycle propagation,
content-loss backup/restore, every-class encryption scans, aggregate/independent/
final acceptance, full AF-07/UX-01 and external X01–X09 remain unqualified.
External KMS/custody/rotation, enterprise secret and hold/retention policies,
external connectors/SSO/storage/runtime, host/whole-PG/independent-journal loss,
remote deployments and hardware power-loss also remain unqualified.


Controller `job-52a2afb24d` passes source-content11/11 (read4/write3/deny32),
unchanged authority118/118 (read289/deny629/owner6) and staging75/75
(read121/write165/deny254), candidate
`sha256:e0b4cbf23ad0dc5f91bc383697bafb854ed14c63f55a17429495ebf2d917c66d`.
All six violations0, no failure/cancellation/skip/TODO, all2,581 protected inputs
unchanged; actual owned PG16.12/IdP/container/roots cleaned. Local strict builds and
contracts12/12 also pass. The local integration attempt refused unavailable
sandbox process census; controller execution provided the actual environment.
Initial controller failure `job-ffd7d99f42` was the new revocation probe's invalid
command shape; `job-88877540c7` was the backend-kill probe's missing active-client
transport listener. Both complete failures and cleanup remain retained. Dedicated
owned nonprivileged kill transport with explicit observed error handling fixes the
second test without bypassing actual backend termination. Interim
`job-30225401f6` passed11/11; the final job additionally exercises same-transaction
publication and representative previous-schema data.

[source-content-v1](../../g1-storage/evidence/f05-04-source-content-v1.json)
retains12 complete controller streams,4 local streams, candidate identity and exact
byte/SHA256 links to all preceding evidence. This inventory/README/evidence/docs
integration follows the checked component candidate; source/tests/SQL/pins are
unchanged. Fresh aggregate/independent/final acceptance remains required.
No task-completion submission or f05-04-done claim is made; no paid/shared/external
action, real credential/security-setting change or nonreproducible deletion occurred.


Turn34 final integrated source diagnostic: controller `job-fc48a1cc96` passes
source-content12/12, read4/write3/deny37/save0, all six violations0, no
failure/cancellation/skip/TODO,2,581 protected inputs unchanged and actual owned
PG16.12/IdP/container/roots cleaned. The added mandatory child invokes invalid
scope/ID/tag/nonce/control envelopes *inside* the original publishing transaction,
so those DB envelope guards are actually reached after passing the xmin
prerequisite; every refusal rolls back the whole head/source publication and
original lookup restores the unchanged independent anchor. Earlier postcommit
function calls deliberately exercise the separate same-transaction refusal.
Local integrated strict build and contracts12/12 pass. Accepted head publisher,
SQL/pins and preexisting tests are unchanged from the preceding compatibility
pass; the added source test/manifest entry and inventory/README integration are
included in this diagnostic candidate. Full streams and all preceding evidence
are retained in [source-content-v2](../../g1-storage/evidence/f05-04-source-content-v2.json).
This final evidence/docs append follows that checked candidate. f05-04 stays active,
plan3/15; no canonical save receipt or completed knowledge/command workflow is
claimed. Continue the explicit knowledge/source commands and same-transaction
receipt/event/outbox protocol, not f05-05. All previously listed external and
whole-product qualification remains pending.

Final source diagnostic candidate: `sha256:147dd15f0c813e41d24f59aadd14350c7663c8f7828d94ac04c653f8af961a7e`.
