# G1-F05 solution: owned encrypted storage and saved-decision Ask

Date: 2026-10-08. Stage: solution. Role: architect. Status: architecture for implementation and independent test design; no implementation or product qualification is claimed.

## 1. Baseline, decisions and scope

Implement the [F05 brief](product-brief.md) and the controller's finalized 96 requirements (AF-07, UX-01, R-001–R-094). This is an additive, finite local storage profile, using real PostgreSQL transactions and encrypted owned files. It must recover acknowledged decisions/files, handle competing writers, propagate retention/deletion/revocation and answer from eligible stored bytes without starting a Space computer.

Authoritative sources are the [remaining ledger](../../planning/g1-remaining-ledger.csv), [roadmap](../../planning/roadmap.md), [foundation dependency sequence](../../planning/g1-foundations-plan.md), [master v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md) §§2–7, 14–18, 26–32, [record ownership](../../architecture/record-authority.md), [interface registry](../../architecture/interface-registry.md), and [F02 evidence](../../evidence/g1-f02-acceptance.md). Preserve their historical wording and evidence. Missing historical materials under decision-register O-10 do not authorize inventing facts. The current goal authorizes local fixture work; it does not authorize any external environment or real policy/key change.

Architecture decisions:

1. PostgreSQL owns scoped source metadata, knowledge revisions, canonical file manifests, commands and outbox work. Encrypted immutable files own large bytes; a separately identified encrypted editable-file store implements the local volume adapter. Derived views are disposable.
2. Current identity, deletion/restriction state and accepted-head freshness survive independently of a content backup. Restore never replaces these authorities. Missing current authority blocks serving.
3. The first Ask profile is deterministic local extraction through the installed native conversation/session boundary, with actual encrypted-source retrieval and a source manifest. It invokes no inference, enrichment, embedding or reranking supplier. It is useful local behavior, not model conformance.
4. All retained F05 payload copies are authenticated ciphertext. Titles, subject/value, filenames, questions, answer bodies and sensitive lineage text are payloads too. Routing IDs, revisions, status codes and opaque dependency edges have an explicit plaintext metadata boundary.
5. No new planner, Task/Run control owner, identity authority, budget ceiling, approval issuer, protected verifier or release authority is introduced.

## 2. Existing layout and dependency direction

Read before selection: root package/strict TypeScript configuration; `g1-foundations/src/{contracts,postgres-uow,task-repository,outbox}.ts`; `g1-identity/src/{current-authority,authenticated-uow,audience,contracts}.ts`; `g1-identity/scripts/{build,check}.mjs`; `g1-recovery/src/fence-guard.ts`; `engine/kernel/src/session-loop.ts`; `g1-model/src/{native-imports,native-repository,native-session,native-runtime,native-context,context,model-service,budget-repository,resource-repository,resource-contract}.ts`; F04 build/migration pins and its solution. These are installed source dependencies, not interfaces to reproduce by copying.

The repository uses ESM `.js` imports from TypeScript, NodeNext, strict/noUncheckedIndexedAccess, package-owned caches under `node_modules/.cache`, pinned dependencies and independent migration ledgers. The F02 check actually authenticates an independent local IdP, uses non-owner PG sessions, requires named suites, rejects empty/failed/skipped/TODO tests and guards accepted source/evidence. F04 additionally clears stale emission and has checked dependency metadata and suite execution inventories. F05 extends those conventions in its own files.

Dependency graph:

```text
F05 HTTP/operator entry point
  -> F02 token verifier + identity scope verifier
  -> F02 AuthenticatedUnitOfWork -> F01 PostgresUnitOfWork
  -> native Task/Run and F04 NativeRepository load/fresh
  -> F03 Space/Run fences and F04 installed resource/budget owner
  -> F05 memory/artifact/lifecycle owners -> encrypted payload/volume adapter
  -> exact eligible recall -> local extractive answer -> current disclosure check

F05 outbox/restore -> same current authorities and restrictions
F05 views/backups/models -> cannot create any authority above
```

Do not call `composeNative` with fabricated source descriptors or copy private values into `TaskContextSourceStore`: that store currently reads plaintext `requirements.contextSources`. F04 model attempts/receipt-owner history also persist request/response payloads. F05 must not send private saved content through those existing plaintext paths and then claim its new object store encrypted all copies.

## 3. Options and trade-offs

| Viable option | Advantages | Costs and decision |
| --- | --- | --- |
| A. Entire content catalog in an encrypted file journal | Small standalone package; simple file backup | Would duplicate the required PG metadata/UoW authority and make real identity locks/atomic outbox composition harder. Reject for this increment. |
| B. PG metadata and encrypted files, direct native local extraction | Reuses installed identity/fences; real durable commits, provenance and restore; small exact retrieval surface; avoids hidden plaintext inference history | Requires cross-store staging and a surviving freshness ledger; no semantic-quality or supplier claim. Choose this local profile. |
| C. PG metadata and encrypted files, F04 model invocation with full encrypted context/history integration | Exercises a generation path and allows later supplier qualification | Needs additional encrypted persistence integration across F04 request, receipt and native response stores, plus provider-policy and model/maintenance budget contracts. Do not implement by SQL-string interception or by altering accepted F04 code. Defer inference enablement until an additive, tested owner API supports all payload copies. |

Option B's deterministic generator is a bounded formatter/extractor of the selected decision value and uncertainty, not a prerecorded answer or an autonomous model loop. Tests change the persisted value and recreate the service before asking; output must change with it. This satisfies the brief's explicitly allowed deterministic local answer path. No requirement for an actual model invocation is inferred from R-037; if any inference/enrichment invocation is added, R-037 becomes mandatory for that path and Option C's gates apply.

## 4. Components and ownership

Proposed package layout is an implementation contract, not files created in this stage:

| F05 component | Responsibility and boundary |
| --- | --- |
| `src/contracts.ts`, `schema.ts`, `errors.ts` | Closed versioned schemas with derived types; reuse existing identity/error/digest vocabulary. No parsed object grants authority. |
| `src/composition.ts`, `http-service.ts`, `operator.ts` | Trusted installed adapters and loopback operator journey. Client input contains IDs/commands, never pools, filesystem roots, keys, callbacks, actors, payers or grants. |
| `src/repository.ts`, `source-repository.ts` | Memory owner: encrypted source/knowledge revisions, provenance, expected-head CAS, receipt and canonical outbox. Source policy is owner metadata in addition to current F02 permission. |
| `src/artifact-repository.ts`, `volume.ts` | Artifact owner: durable byte/manifest confirmation, draft/variant and canonical promotion; storage owner: scope-bound encrypted live-file versions/checkpoints. Neither sets CheckReceipt or external delivery success. |
| `src/crypto-store.ts` | Authenticated encryption and owned filesystem operations; key resolution is an installed local fixture capability, not a worker/HTTP secret. |
| `src/recall.ts`, `ask-service.ts` | Memory owner selects eligible current sources; native conversation service extension performs a read-only Ask over the installed native session. Its answer receipt is a query/delivery record, not another Task or progression state. |
| `src/lifecycle.ts`, `outbox.ts` | Lifecycle owner of tombstones, source restrictions, dependency invalidation, physical cleanup and retention enforcement. Identity still owns membership/session revocation. |
| `src/backup.ts`, `restore.ts` | Storage recovery owner: encrypted content backup, cross-store validation, quarantined generation and activation barrier. Never restores current authority from that backup. |
| `migrations/`, `src/migration.ts`, `scripts/`, `tests/` | Independent additive PG ledger, fixtures, strict build, mandatory behavior suites, retained-source guards and evidence capture. |

New records each have exactly one service owner: memory owns source/knowledge/head metadata; artifact service owns artifact/draft manifests; storage owns encrypted objects/live versions/checkpoints; lifecycle owns deletion/source restriction and propagation state; native conversation owns Ask receipts; recovery owns backup/restore manifests. Current-head witnesses are written only by their owning canonical commit transaction. Derived workers cannot write them. F02 owns identity/membership/policy/payer; native Task/Run/session and F03 own Stop/generations; F04 owns resource/budget records; independent verifiers own checks. Logical services may share this local trusted process, without merging their authority.

## 5. Supported data classes and encryption inventory

All content is synthetic for qualification. Tests use an ownership-marked fixture root and a separate target root/generation on restore. No real user data or existing unowned store is inspected or erased.

| Class | Durable representation and commit/checkpoint | Recovery and retention |
| --- | --- | --- |
| Source and typed knowledge | PG ciphertext payload plus routing/status columns, immutable revision and atomic receipt/event/outbox/head witness | Acknowledged revision survives recreation. Backup recovers only included revisions; current heads/restrictions gate availability. Validity/expiry on each read plus expiry tombstone sweep. |
| Artifact bytes and manifest | Encrypted immutable object and encrypted descriptive manifest; PG accepted manifest pointer after both files confirmed | Recreated reader verifies scope, length and digest. Incomplete upload remains quarantined; current canonical head governs restore/promotion. |
| Live editable files | Local service-owned logical volume with encrypted immutable write versions and a CAS live pointer; no raw VM mount | `live-written` means the encrypted live version was durably written, not a canonical artifact or completed backup. Recovery reports last successful checkpoint and edits since it. |
| Recoverable task drafts | Encrypted file/PG descriptive payload, Task/Run binding and base revision, durable draft-version receipt | Acknowledged draft survives recreation; restore recovers included versions. Compare/rebase proposal/retain variant is explicit; no reconnect auto-promotion. |
| Volume checkpoints | Encrypted file-set manifest and confirmed version references; PG checkpoint receipt only after confirmation | Restore last complete included checkpoint. No knowledge commit, metadata transaction or unsaved editor guarantee is implied. |
| Unsent/unpersisted editor work | Client/process memory only; no save receipt | Lost on recreation by design; status says unsaved/not checkpointed. Never dispatch or promote from backup. |
| Derived summaries, keyword index and answer cache | Encrypted payloads, source-version dependency edges and watermark; optional bounded in-memory copies | Rebuild from current eligible canon. Invalidate nested descendants; drop old payloads under declared retention. Cache hits still check current authority/heads. |
| Ask question, answer and retrieval manifest | Encrypted F05 receipt payload with exact dependency edges; native records contain opaque receipt IDs only | Later answer fetch rechecks all dependencies and audience. A historic answer is not a way to serve deleted/revoked text. TTL/forget applies. |
| Command/outbox/audit | Opaque IDs, kind, revision, timestamps, keyed binding digest, counts/error codes; any descriptive payload encrypted | Retain minimum declared metadata; outbox completion never requires private body in logs. Tombstones/head witnesses persist beyond content backups and cannot be aged away while old backups remain usable. |
| Backup content | Encrypted metadata export, encrypted object/checkpoint inventory and encrypted archive manifest; final confirmed backup receipt | Declared fixture expiry; old backup bytes can remain until expiry but cannot be served directly. Restore is the only read route, with current authority. |
| Keys, credentials, control and protected evidence | Fixture keys installed outside content roots; current identity/control/budget/approval and baseline evidence remain their existing owners | Not in F05 content backup; no cookie/credential, live approval, verifier receipt, method registry or external effect replay. |

AES-256-GCM uses a fresh cryptographically random 96-bit nonce per encryption and 128-bit tag. AAD is a canonical versioned tuple of tenant, Space, class, stable object/revision ID, generation and key ID. Envelope parsing checks algorithm/version, exact fields, decoded nonce/tag lengths, ciphertext bounds and expected binding before decryption; modified binding/ciphertext or wrong/missing key is unavailable/corrupt, never an empty successful read. Files use random IDs rather than content-addressed global names. Digests of private content live encrypted; public lookup fingerprints and command payload digests use a per-scope keyed digest to avoid global equality/existence probes. Permitted manifests reveal content digests only after authorization.

Metadata encryption includes source titles, subject/value, filenames/paths, verification narrative, source URI text, query/answer and summaries. Plaintext metadata is limited to UUID bindings, revisions, timestamps/expiry, status/class, key IDs/nonce/tag, ciphertext sizes, opaque object references, keyed search tokens and dependency edges. These still reveal traffic/relationships and are not claimed to have full disk or metadata confidentiality. Fixture PG logs must not log bound parameters/private bodies; process errors/audit must use allowlisted codes. Scan actual files, PG values, logs and serialized events with marked private strings. F05 keys never go into backups or stdout. Process memory and authorized delivery are explicitly outside encryption-at-rest; minimize lifetime, avoid core/diagnostic payload export and make no guaranteed zeroization claim.

Fixture key custody: generate ephemeral per-scope data/digest keys at fixture creation; pass an installed key resolver to trusted services through a controlled fixture channel. Keep them outside content/backup roots, accessible only to the owned test harness/service; never put them in argv or evidence. Recreated fixtures deliberately reuse that harness-held material. This is local round-trip assurance, not independent hardware/KMS custody. The wrong/missing-key tests must really fail before a correct-key restore succeeds. Rotation, regional custody and historic key retention are external gates.

## 6. Data model and executable contract target

Use a `fabric_storage_migrations` ledger, with additive tables/functions under the existing trusted schema. Content rows carry `(tenant_id, space_id, storage_generation, id, revision)`; all same-scope relations use composite FKs. Cross-Space edges require a separately recorded explicit relation and current source/destination authorization; a caller cannot bypass a failed FK by asserting sharing. No cross-tenant sharing is supported.

Required logical tables:

- `storage_sources`, `storage_knowledge_revisions`, `storage_artifact_versions`, `storage_drafts`, `storage_live_versions`, `storage_checkpoints`: immutable ciphertext and scoped bindings.
- `storage_heads`: active generation's pointers; `storage_current_heads`: independent current accepted revision/digest witness for every canonical entity and checkpoint/draft head. They update in the same owner transaction but only the former is restored as content.
- `storage_commands`, `storage_events`, `storage_outbox`: scoped receipts, minimal events and durable idempotent jobs; command lock namespace excludes payload digest. Their current command-key/receipt and pending-work authority survives alongside current heads; it is not replaced during content restore. Archived receipts are provenance copies only, not new execution or dedup authority.
- `storage_dependencies`, `storage_derived`: exact immutable ancestor revision edges, ciphertext and watermark; cycles/invalid ownership rejected.
- `storage_restrictions`, `storage_tombstones`, `storage_policy`, `storage_authority_epoch`: durable current lifecycle owner state, outside restore replacement. Restriction updates are monotonic; regrant is a new explicit grant/revision, not removal of history.
- `storage_generations`, `storage_backups`, `storage_restore_operations`: owned root IDs, confirmed inventory, activation/readiness, original-key state and failure summaries.
- `storage_ask_receipts`, `storage_query_controls`: encrypted answer/manifest, dependencies and independent recall/save/attachment settings. They reference existing Task/Run/session, not copies of their authority.

Every new application table has forced RLS and scope predicates; relation constraints/triggers additionally enforce binding/status transitions and immutable history. App sessions retain non-owner/non-superuser/non-BYPASSRLS status. Public/worker/IdP get no new grants. Migration admin only bootstraps the owned synthetic database and is never passed to services. Narrow functions use a fixed `pg_catalog,fabric` search path and revoke PUBLIC. Inspect actual grants and direct-access denials, not just migration text.

This normative type excerpt must compile as documentation now; implementation must add corresponding closed runtime schemas and positive/negative contract tests to `g1-storage/` later. Aliases below describe validated values, not token provenance. Use existing `VerifiedScope` and transaction types at trusted interfaces rather than minting another scope type.

```ts
type Id = string;
type Digest = string;
type Time = string;
type Rev = number;
type Scope = Readonly<{tenantId: Id; spaceId: Id}>;
type KnowledgeStatus = 'proposed' | 'user-asserted' | 'source-verified'
  | 'disputed' | 'superseded' | 'expired' | 'deleted';
type Class = 'source' | 'knowledge' | 'artifact' | 'draft' | 'live-file'
  | 'checkpoint' | 'summary' | 'index' | 'cache' | 'ask' | 'backup';
type Audience = Readonly<{destinationSpaceId: Id; recipientActorIds: readonly Id[];
  revisionDigest: Digest}>;
type SourceRef = Scope & Readonly<{sourceId: Id; sourceTaskId: Id;
  revision: Rev; digest: Digest; audience: Audience}>;
type Knowledge = Scope & Readonly<{schemaVersion: 1; id: Id; revision: Rev;
  subject: string; value: string; source: SourceRef; assertedBy: Id;
  recordedAt: Time; validFrom: Time; validUntil: Time | null; expiresAt: Time;
  classification: 'personal' | 'group'; status: KnowledgeStatus;
  verification: {method: string; checkId: Id | null; checkedAt: Time} | null;
  supersedes: {id: Id; revision: Rev} | null}>;
type Command = Scope & Readonly<{schemaVersion: 1; sessionId: Id; targetId: Id;
  key: Id; expectedRevision: Rev; expiresAt: Time;
  action: 'save' | 'correct' | 'forget' | 'draft' | 'promote' | 'checkpoint' | 'restore'}>;
type CipherEnvelope = Scope & Readonly<{schemaVersion: 1; algorithm: 'AES-256-GCM';
  class: Class; id: Id; revision: Rev; generation: Id; keyId: Id;
  nonce: string; tag: string; ciphertext: string}>;
type SaveResult = {status: 'saved-here'; receiptId: Id; id: Id; revision: Rev}
  | {status: 'pending-review'; receiptId: Id; proposalId: Id}
  | {status: 'not-saved'; error: string; nextAction: string}
  | {status: 'unknown'; key: Id; replayAllowed: false; nextAction: string};
type Manifest = Scope & Readonly<{schemaVersion: 1; audience: Audience;
  policyRevision: Rev; membershipRevision: Rev; restrictionEpoch: Rev;
  storageGeneration: Id; profile: 'local-extractive-v1'; indexWatermark: Rev;
  selected: readonly {knowledgeId: Id; knowledgeRevision: Rev; source: SourceRef;
    inclusionReason: 'exact-id' | 'exact-subject' | 'authorized-tail'}[];
  limitations: readonly string[]}>;
type Ask = Readonly<{schemaVersion: 1; sessionId: Id; key: Id;
  expectedRevision: Rev; expiresAt: Time; question: string;
  selector: {kind: 'id' | 'subject'; value: string}; attachmentIds: readonly Id[]}>;
type ForgetResult = Readonly<{status: 'tombstoned'; receiptId: Id;
  affectedActive: number; affectedDerived: number; pendingJobs: number;
  externalCopies: 'not-recalled'; backupErasure: 'subject-to-retention';
  retentionRestrictions: readonly string[]; nextAction: string}>;
type RestoreState = 'staged' | 'validating' | 'reconciling-current'
  | 'ready' | 'blocked-authority' | 'blocked-integrity' | 'blocked-freshness';
type RestoreResult = Readonly<{operationId: Id; backupId: Id; generation: Id;
  state: RestoreState; serving: boolean; restrictionEpoch: Rev | null;
  lastSuccessfulCheckpoint: Time | null; unavailableEntityIds: readonly Id[];
  preserved: readonly string[]; notExecuted: readonly string[]; nextAction: string}>;
```

Runtime rules: IDs are validated UUIDs; revisions are nonnegative safe integers; time is strict ISO UTC with finite validity; exact version/enum and unknown fields reject. Local limits are 1 MiB per command/knowledge payload, 64 selected records, 256 audience recipients, dependency depth 16 and 512 visited nodes, and 1,024 files/64 MiB decoded content per fixture backup. These are explicit admission bounds for this profile, not production capacity claims. Oversize input/expansion refuses before mutation/disclosure. Reject accessors, functions, undefined, duplicate recipients, cyclic data and unsafe arithmetic. Server derives actor/payer, accepted status, current audience, policy/epoch and generations; client `verified=true`, source title or requested revision is never proof. Correct/forget/promote require a nonzero existing base; append/save creation uses expected revision zero. Source-verified requires a registered, exact source-bound check/time, never a caller's check claim. `saved-here` records accepted user assertions or verified decisions; `pending-review` is a durable proposal and cannot be answered as an accepted decision.

Contract tests must cover valid round-trip for each exposed command/envelope/result; wrong enum/version/extra security field; invalid time/revision; AAD/key/class/scope mismatch; nonexistent/cross-scope relation; fabricated verification; private-to-group audience; duplicate-key changed action/target/expiry/body; missing current authority; source expiry/supersession/conflict; restore state with `serving=true` before ready. Unsupported methods/release, raw SQL/path/URL, direct links and group-to-personal export fail explicitly. The type excerpt is not a runtime validator or a qualification pass.

## 7. API, event and permission contracts

Expose loopback authenticated JSON routes from the trusted native service extension: `POST /storage/save`, `/storage/correct`, `/storage/forget`, `/storage/lookup`, `/storage/drafts`, `/storage/promote`, `/storage/live/write`, `/storage/checkpoint`, `/storage/backup`, `/storage/restore`, `/storage/restore/status`, `/ask`; `POST /storage/inspect` returns only currently permitted provenance/history. Use POST for private queries to avoid URL/body leakage. A minimal operator script drives the same routes; it cannot bypass them with admin SQL. Only the fixture bootstrap has migrations/enrollment rights.

Resolve session ID to immutable recorded tenant/Space/conversation/Task/Run binding. An explicit scope hint must match; a mutable tab/currentSpace and client actor/payer fields reject. Read/save/correct/forget/backup/restore are distinct grant checks. Extend fixture membership grants with `storage:read`, `memory:write`, `memory:forget`, `storage:write`, `storage:checkpoint`, `storage:backup`, `storage:restore` as needed; these are synthetic enrolled policy, not a real access-setting change. Current `task:read`/`task:write` and native session ownership/fences remain required where applicable. Contributors/readers do not inherit delete/restore/policy powers. Optional administrative access uses its own authenticated operation context, not a member's stale Task approval.

`Remember here` saves into the recorded current Space. `Remember for me` within a group is unsupported in this local profile and returns `REQUIRED_CAPABILITY_UNSUPPORTED` with explicit permitted private/export workflow guidance; no copy occurs. Same-tenant source sharing is supported only with an installed owner relation and current two-sided permission for every recipient, exercised by a permitted fixture. Independently valid publication grants are not supported locally: on source revocation every local source-dependent copy is suppressed. Do not imply that requirement R-047's exception exists when none has been installed.

Events are versioned and content-free: `knowledge-committed`, `knowledge-proposed`, `knowledge-superseded`, `artifact-committed`, `draft-saved`, `checkpoint-confirmed`, `content-tombstoned`, `source-restricted`, `derived-invalidated`, `backup-confirmed`, `restore-state-changed`, `ask-answered`. Include scoped IDs, revision, original command, mutation/job IDs and current epoch. Any content-bearing event detail is encrypted. Events/outbox never carry approval, budget top-up, external effect, CheckReceipt or executable method payloads.

## 8. Commit, conflict, error and retry semantics

Knowledge/source small payloads are encrypted before SQL persistence; serialize all accepted revision, head witness, command receipt, event and required outbox writes in one authenticated PG transaction. Use current identity/session checks at transaction start/end and fresh time after locks. Enforce local secret admission with an explicit fixture policy (typed credential/secret class and marked fixture patterns); reject unsupported secret storage and indefinite retention. This does not claim a universal secret detector. Durable proposed records return Pending review. Only confirmed COMMIT returns Saved here; failed transaction returns Not saved; transport/COMMIT uncertainty returns Unknown.

Artifacts/live files/checkpoints use a real staged-byte protocol:

1. Admit scope/actor/native fences/current policy; allocate an opaque owned staging ID. Persist a scoped staging lease without publishing a manifest.
2. Encrypt and write an exclusive temporary file in the owned root, fsync it, atomically rename within that filesystem, then fsync the directory. Confirm encrypted manifest and referenced bytes/digests; never treat a fulfilled write callback alone as durability.
3. In a new authenticated transaction recheck authority, lease expiry/current generation, required validation and expected canonical revision; atomically commit accepted manifest/head witness, receipt/event/outbox. A concurrent delete/revoke invalidates the staged publication. No user read follows a staging filename.
4. Orphans remain unavailable; a scoped, lease-aware janitor quarantines/cleans only unreachable expired uploads after checking pending/unknown commands. It never removes a reachable byte or an unrelated owner's file.

No distributed PG/filesystem transaction is claimed. Content is immutable after confirmation, with a publication pointer as the linearization point; byte-first failures yield an orphan, not a dangling published object. Missing/corrupt published bytes discovered later place that entity in integrity-blocked state. General hardware/power-loss durability is external qualification despite local fsync and process-crash exercises.

Ordinary mutations acquire the same `(tenant, Space, actor, original key)` transaction advisory lock for execute and lookup, excluding payload digest so changed-key reuse serializes and conflicts. Bind the digest to action, target/session, expected revision, expiry, audience, payload and applicable generations. Receipt read occurs after lock acquisition in a fresh READ COMMITTED statement. Reauthorize before returning a duplicate; restricted payloads are not replayed from a receipt. Same-key identical retry produces one receipt/revision/event/outbox set. Fresh reads compare current expected revision; incompatible correction/promotion yields STALE_REVISION with a permitted compare/retain-variant next action. Independent records append without overwriting each other; the local Space barrier may serialize their commits but both must succeed.

For lost COMMIT acknowledgement use the real foundation UNKNOWN_COMMIT distinction, with HTTP 503, original-key lookup, `replayAllowed:false`. Lookup returns committed/absent-safe/unknown; blocked lock acquisition remains unknown. Absence is not automatic resubmission permission. Persisted commands or backup history cannot dispatch writes. Normal transaction conflicts may be retried only after definite rollback and current authorization, with the same binding/key; never retry a lost acknowledgement under a new key.

Error responses use stable registry codes and safe resolvers: INVALID_SCHEMA/UNSUPPORTED_VERSION, UNAUTHORIZED/AUTHORITY_UNAVAILABLE, SCOPE_MISMATCH, STALE_REVISION, EXPIRED_COMMAND, IDEMPOTENCY_CONFLICT, STALE_FENCE, BUDGET_EXHAUSTED, ARTIFACT_NOT_COMMITTED; F05 adds CONTENT_UNAVAILABLE, INTEGRITY_FAILED, RETENTION_RESTRICTED and RESTORE_BLOCKED with versioned codes. Restrictive errors cannot reveal title/snippet/existence. Appropriate operators can inspect permitted state: what was preserved, what never executed, pending cleanup, and the next authorized action. Do not catch every exception and return successful empty knowledge.

## 9. Recall and native saved-decision Ask

The trusted `StorageAskService` is an additive query handler of the native conversation service, not another session loop. It uses F04 `NativeRepository.load/fresh` over the real recorded Task/Run/session and F03 fences. It never invokes `NativeSession.requestTurn`, `SessionLoop.callModel`, a supplier adapter, a shell, the live volume adapter or `NativeComputer.advance`. It does not persist a second session/event history or set Task/Run state. Its answer/manifest receipt references that native binding and is storage-owned delivery data; native audit may reference its opaque ID. This reuse must be exercised through actual installed owners, not mock `current=true` ports.

Require the installed native admission to be service/Ask, no target effect, no approval-required effect, no computer capability/resource assignment, no stopped/pending/unresolved native continuation or stale version. A service-only resource for accounting is a logical resource, not `ComputerAssignment`; validate this distinction in schemas/tests. Live machine-state questions or requests for filesystem inspection return an explicit unsupported capability/next action. No source/index/service outage invokes a computer fallback.

Ask pipeline:

1. Authenticate and load the immutable native session, its grant/expiry/generations and the current independent controls. Task attachments, older-conversation recall and reusable saving are separately represented; an Ask never saves new reusable knowledge by implication.
2. Within authenticated transactions, find bounded candidate metadata through exact ID or per-scope keyed subject token plus recent canonical tail. Encrypted keyword/index data is optional. Check current full destination member set via F02 `CurrentAudienceVerifier`, requester source-read grant, explicit cross-Space relation if needed, source-specific restrictions, transitive dependency eligibility, current head witness/status/validity/conflict and serving generation **before decryption/expansion**. Never fetch all scopes and filter after reading bodies.
3. Decrypt only eligible selected records; verify source/revision/digest and admitted knowledge. Proposed/ordinary discussion cannot answer an accepted-decision query; disputed candidates produce explicit uncertainty, with no confident answer or concealed conflict. Superseded history is available only through a separately authorized history view, never ranked as the current decision. Exact/tail fallback succeeds for new commits when an index is unavailable, with watermark and limitation disclosed.
4. The local extractor consumes selected values and source references, producing `Saved decision: <actual value>` plus uncertainty when appropriate. It uses no model and has an explicit profile `local-extractive-v1`. Missing evidence returns a gap and permitted next action. The profile promises bounded exact/subject queries only; it does not promise general semantic answers.
5. Immediately before disclosure, reauthorize native scope/fences, current heads/restrictions and full audience under locks, then emit the one bounded response through the installed sink while these locks protect the disclosure. Later cached-answer fetch repeats this check. The encrypted receipt and exact dependencies are committed; COMMIT loss is reconciled through the original key. Already delivered bytes are not recalled. Restriction commits and serving serialize: disclosure before restriction commit was authorized; no later disclosure may bypass it.

Use F04's existing `ResourceRepository`/installed `SyntheticResourceOwner` and resource reserve/settle functions for explicit synthetic service accounting, on a logical service resource with origin Run and an enrolled allowance. No second budget tables, copied ceilings or client measured-cost fields. A resource receipt contains no question/value/title. Budget admission failure stops the useful query; no inference receipt is manufactured. Install and test this service accounting path; it must never imply a real tariff. Model-based inference, summarization, embeddings and reranking are unsupported, so their invocation count is zero; future enablement must use F04's original model/budget/provider/region owners and encrypted history integration. Deterministic local summary projections remain supported under §10.

The implementation default for this increment is the installed synthetic service-accounting path. Measure its actual resource receipt/budget conservation, repeated-key behavior and failure before disclosure. Retained storage may continue after Stop/archive/suspension; display ongoing storage separately and do not claim zero real charges. Local rates/ticks are fixture quantities, not an enterprise pricing decision.

Recorded provenance retains the audience at save time; it is not a forever-valid current audience digest. At recall the source owner resolves current read/share policy and the current full destination member set, then constructs a new F02 audience binding for verification and the manifest. Current group-readable policy may permit remaining/new authorized members; it cannot grant a restricted-history guest a shared filesystem. A membership revision change must not freeze all surviving group knowledge indefinitely: denied removed-member reads and successful remaining-member reads are both required. Historical recipient metadata is disclosed only where permitted.

Manifest fields are exactly those in §6: source and knowledge versions/digests, scope/audience and current policy/membership/restriction revisions, storage generation, index watermark, profile and inclusion reason. Private manifests and generator input captures are only in controlled test memory or encrypted diagnostic artifacts. All Ask journeys instrument provision/wake/mount/computer-dispatch, inference and target/external-write ports with observable zero counts; exercise positive, denied, concurrent, index/service failure and restored paths. Positive usefulness and zero forbidden calls are both required.

## 10. Retention, dependency invalidation and races

Every retained class has a required fixture policy ID, duration/expiry and cleanup handling. Use explicit short synthetic test durations; no production duration, legal-hold or backup guarantee is inferred. An unsupported hold/policy extension returns a restriction, not silent erasure. Date validity/expiry is checked synchronously at recall/publication even if the sweep/outbox is late.

Forget/expiry commits monotonic tombstone/restriction, current-head nonserveable state, minimal receipt/event and durable invalidation job together. Each derived node stores immutable ancestor revision edges (including summaries of summaries, indexes/caches/answers and source-dependent artifacts/drafts). Before disclosure, traversal checks all ancestors; orphan/missing dependency or unsupported provenance blocks. Prevent cycles and cap traversal, failing closed when the bound is exceeded. Correction invalidates descendants of the old revision and exposes only the current accepted claim; it cannot rewrite unrelated facts.

Outbox jobs are at-least-once, scoped and idempotent by mutation+job identity. Claim/lease/retry metadata commits durably; a recreated worker observes outstanding work. Revalidate current actor/service authorization, native generation when applicable, source/ancestor restrictions and expected revision before reading/decrypting and again before writing derived results. The supported summary/index/cache builders are deterministic local projections with no model invocation; a queued summary carries exact ancestor revisions and cannot replace a newer profile/head. Stale jobs terminate as obsolete/invalidation-complete, not successful indexing. A dependency-owner service can clean restricted ciphertext with its narrow maintenance grant; it does not gain user read or model authority. Failure leaves pending propagation inspectable and retryable; synchronous canonical restrictions already block serving. A membership removal is owned by F02 and immediately denies affected reads; derivative cleanup cannot be a prerequisite for access denial.

Lock order extends existing owners: authenticated foundation/identity locks first, existing recovery Space barrier, original command lock, entity/dependency IDs in deterministic order, then budget/resource owner's prescribed locks. Never acquire a second UoW while holding these locks. Local artifact/file I/O is bounded; do slow staging outside locks and recheck at publication. Sharing locks source/destination using the existing identity owner sorted order; supported cross-Space operations must either avoid multiple recovery barriers or acquire them in a fixed sorted order before any entity lock. Test actual PG contention/deadlock refusals in both race directions; uncertain timeout never promotes data.

Delete/revoke/read races hold current eligibility through bounded disclosure. Write/jobs/delete races hold current restriction row locks through canonical publication. A restriction that wins blocks a later write/job; an earlier accepted write is then invalidated by the restriction. Tests must verify both schedules, including membership/session expiry after waiting for locks and late background writes. Repeated delete uses the original receipt or already-tombstoned status without new incompatible effects. Forget reports active/derived counts, pending jobs, retention restrictions and external/backup limits; it cannot claim universal erase.

## 11. Backup, actual restore and freshness barrier

The local restore qualification is **content-store loss/recreation with surviving current control/restriction/freshness authority**, not complete cluster disaster recovery. Physically separate the backup directory, source content root, restore target root and current PG control tables. Keys are held independently by the owned harness. A backup exports validated encrypted F05 canonical metadata/receipts at a coherent captured epoch under the Space barrier, plus immutable referenced encrypted object files and checkpoint manifests. Write and fsync the inventory/archive, then confirm it in PG. Active mutable work not covered by the recorded checkpoint is explicitly excluded. Backup never exports live identity/approval/budget/control state, raw credentials or arbitrary SQL.

Current authority is not a backup field. F02 identity/session/membership and F05 `storage_authority_epoch`, current policy, monotonic tombstones/source restrictions and `storage_current_heads` remain live in PG. Their known enrollment/epoch is anchored by the installed trusted service, so an empty/missing ledger cannot masquerade as an unrestricted new database. The restore request supplies neither the current epoch nor keys. The content backup's epoch only identifies its historical boundary. In a later whole-cluster restore, a qualified fresh authority feed/checkpoint and authoritative replay would be required; none is claimed here.

Restore protocol:

1. Check the authenticated operator's specific restore grant, original key, exact backup identity/digest, source/destination ownership and current control availability. Allocate a fresh target generation with `serving=false`; do not overwrite existing owned content or make caller paths authoritative.
2. Validate/decrypt the real backup inventory and recover bytes to that fresh root, recording durable per-item progress. Validate every cipher binding, class, manifest, length, reference and FK. Reject traversal, symlinks, unowned roots, extra forbidden control classes, missing/corrupt bytes and wrong/unavailable keys. Unknown archive versions refuse.
3. Import encrypted F05 content rows into the staged generation with ordinary composite relationships and immutable IDs. Verify/decrypt each original envelope against its recorded source generation, then re-encrypt with fresh nonce/AAD for the target generation; never relabel an envelope's generation without authenticating it. Immutable logical revision/content digests remain the same. Do not execute SQL from the archive, replace existing command authorities, replay jobs, restore stale task approval or dispatch drafts. Restore receipts remain owned by recovery, not an authority inferred from restored content.
4. Reconcile against current tombstones/retention/source restrictions and current F02 permissions before any file rehydration, derived rebuild or user read. Match each restored canonical head against `storage_current_heads`. A post-backup correction's old revision is never current: use current surviving verified bytes if available through the owning service, otherwise block that entity with `blocked-freshness` and request a newer backup/current data. Do not silently reaccept the old decision. Eligible unchanged survivors must become usable.
5. Under the current Space/restriction barrier, check current epoch and all integrity/freshness outcomes again, then atomically activate the generation pointer/readiness plus restore receipt/event. Durable per-entity blocks remain explicit; only ready eligible entities may serve. Restore status distinguishes a ready generation with unavailable entities from fully recovered data. Every subsequent read/job also checks current restrictions; activation is not a permanent permission snapshot.
6. Interrupted/repeated restore resumes the same original operation/generation after ownership and current-authority checks; completed phases are idempotent. A lost activation COMMIT uses original-key lookup. No partial staged data serves. Cleanup is bounded to the operation's owned staging generation and cannot delete the surviving current ledger.

Actual acceptance must create decisions, sources, committed artifacts, live/checkpointed files and drafts; write a real encrypted backup; then delete/revoke/expire/correct some content **after** that backup. Terminate/recreate the source service, remove only owned reproducible source content as the declared failure, restore into a fresh root/generation, recreate a reader and fetch exact surviving payloads. Verify restricted/stale originals cannot be served or indexed, including old answer caches and queued jobs. A serialized in-memory object or file-copy-only check is insufficient. Keep the existing control ledger in this positive profile and separately remove/unavailable it in a negative fixture to prove the serving barrier.

Record captured epoch, included canonical revisions and last successful checkpoint/backup timestamp, restore start/finish, measured local elapsed time, recovered/unavailable classes and bytes, and actual interruption points. Report the surviving control boundary and work excluded since checkpoint. No numerical production RPO/RTO, filesystem/power-loss SLA, multi-host durability or provider backup assertion follows.

## 12. Security, performance and rollout

Data flow: untrusted authenticated command -> trusted immutable native binding/current grants -> owner metadata admission -> encrypted payload -> eligible context in trusted bounded memory -> current authorized answer sink. Backup is a content transport into quarantine; it is not authorization. Arbitrary worker code receives neither DB controller credentials, keys nor filesystem root access. Local process separation/port counters do not establish OS/cloud containment; F06 must qualify enforcement on the real runtime.

Threat additions and required controls are cross-scope object/AAD substitution, plaintext copies in metadata/log/model history, global digest existence probing, stale current-head witnesses, poisoned backups, path/symlink cleanup attacks, late descendant resurrection and source-to-answer authority injection. Test them against actual stored bytes/PG rows/routes. Retrieved text is data; it cannot publish methods, change budgets, approve actions or mint check evidence. Required audit/current-authority failure blocks affected operations. High-severity failures block this advertised local profile.

Performance approach: bounded exact ID/subject/tail selection, indexed scope/head/status metadata, bounded dependency closure and ciphertext sizes; optional encrypted derived keyword views. One conservative local Space barrier prioritizes predictable ordering over throughput. No unapproved pgvector/provider enrichment dependency is necessary. Measure actual counts/elapsed local restore and contention; do not invent percentile, throughput or SLA targets. Derivative backlog cannot make an acknowledged revision disappear.

Build with independent Node 22.22.3 / pnpm 10.18.0 / TypeScript 5.9.3, `@types/node` 22.18.6, `pg` 8.16.3 and `@types/pg` 8.15.5 pins; use built-in Node crypto/fs. Produce its own frozen lock and license/notice/update inventory, reusing the existing cached PostgreSQL fixture/image by its pinned digest. Strictly compile own sources/tests and imported owner sources into its own cleared cache. Never regenerate protected sibling caches/locks as a repair shortcut or fetch a new cloud image/provider.

Load unchanged foundation/identity/recovery/model migrations in documented installed order and require their exact ledgers/digests, then the separate F05 ledger. New migrations only add F05 tables/functions/grants to owned synthetic databases; never redefine accepted functions, weaken RLS/budget/fence constraints or rewrite prior migrations. Compatibility check re-runs original migration functions and compares their ledgers after F05. A changed migration at an installed version refuses.

Rollout is local fixtures only. F05 routes default denied unless all required owners, storage/key policy, native bindings and current ledger are installed. No environment flag installs a real provider/region/VM. Rollback disables new F05 admission/Ask serving and worker publication while retaining monotonic current restrictions, canonical revisions, original receipts and pending work; no table drop, old-backup activation or policy downgrade. Current-authorized recovery/status remains inspectable. Rollback cannot undo delivered bytes or completed external effects. Shared deployment, real data restore/deletion, paid enablement, real security/key/ACL changes and human messages require exact `loop_ask(kind=approval)` first.

## 13. Downstream validation and requirement allocation

Independent test design must freeze case identities, mandatory groups and finite zero-violation observations before implementation. Proposed suites: `contracts.test.ts`, `owned-encryption.test.ts`, `commit-conflict.test.ts`, `recall-ask.test.ts`, `lifecycle-propagation.test.ts`, `volume-draft.test.ts`, `backup-restore.test.ts`. Names can be refined; behaviors cannot be removed. Mandatory real network/auth/PG/filesystem/process cases cannot be replaced with Maps, mocked success, labels in stdout or sleep-only race guesses. Use actual blocked PG locks and bounded synchronization, recreated processes/readers, failure after partial durable work and verification of no unauthorized durable state. Optional deterministic fault gates may improve these cases without changing authority semantics.

| Design obligation | Requirement IDs | Required evidence target |
| --- | --- | --- |
| Scope, current identity/full audience, owner/RLS boundaries (§§2, 4, 6–10) | AF-07, R-001–R-008 | Real same-scope/share positive, wrong tenant/Space/private-to-group/forged actor/payer refusals; current-authority outage and late expiry; actual non-owner grants/RLS. |
| Inventory, encryption/integrity/keys/redacted copies (§5) | R-009–R-013 | Exact round-trip across recreation; ciphertext/database/log scan; wrong key, corrupt tag/AAD/binding and plaintext-path denials. |
| Canonical commit, provenance/status/admission, artifact confirmation and original-key uncertainty (§§6–8) | R-014–R-024 | Accepted and proposed positive; partial PG/byte/manifest failures; real COMMIT loss and lookup commit/rollback/timeout windows; one receipt/event/outbox. |
| Concurrent correction, lineage/dedup/no method authority (§§6, 8, 10) | R-025–R-029 | Two incompatible writers plus independent facts, exact retry and changed binding, unrelated facts unchanged, stale recreated writer; hostile content has no control/release effect. |
| Eligible recall/manifest/fallback/cache/current freshness (§9) | R-030–R-037, R-094 | Selected stored bytes before generator; current output checks; stale/disputed/proposed/source-revoked negatives, index lag/outage positive; zero inference/enrichment calls and existing service budget ownership. |
| Useful native service Ask, immutable conversation binding and independent controls (§§7, 9) | UX-01, R-038–R-043 | Authenticated Personal/group saved-decision answer from persisted changed values; switched tab doesn't retarget; attachments/recall/save controls vary independently; all no-VM failure/race/restore paths; unsupported live/export explicit. |
| Basic retention and real descendant propagation (§10) | R-044–R-054 | Actual tombstones, nested derivatives/answer cache invalidation, post-commit source/member removal, expiry, late jobs, retry after failure, both delete/read/write/job race schedules, truthful forget. |
| Distinct live/draft/checkpoint/artifact saves and fenced promotions (§§5, 8) | R-055–R-059 | Actual encrypted writes/checkpoint, unsaved loss explained, recoverable draft variant, competing file promotions, current Task/Run/generation after recreation. |
| Real encrypted backup and current-authority restore (§11) | R-060–R-068 | Fresh root recovered exact surviving bytes/metadata; old-backup post-delete/revoke/expiry/correction; integrity/missing authority negatives, interrupted/repeated activation, zero replay, local timing/checkpoint and safe status. |
| Package/build/check/delivery and finite suite gates (§§12–14) | R-069–R-072 | Strict clean emission, mandatory nonempty groups and captured useful positives plus zero forbidden behavior. Missing/failed/cancelled/skipped/TODO/stale emission/cleanup must fail. |
| Protected baselines and controller-bound evidence package (§§1, 12–14) | R-073–R-076 | Unchanged original checks/guards/ledgers/raw evidence; current candidate/definitions/raw streams; requirements matrix, dependency/legal/update inventory, recovery/threat/rollback documentation. |
| Authorization/workflow and safe owned fixtures (§§1, 12, 14) | R-077–R-079 | OFF gates, exact ownership/bounded cleanup; R-079 was discharged by requirements stage, not a new implementation behavior. No hand edits to controller state. |
| Operator/matrix/recovery explanation and optional fault gates (§§7, 11, 13) | R-080–R-083 | Same authorized journey entry point, canonical/derived/volume/external matrix, recoverable versus unsaved work and storage continuation; optional schedules cannot replace Must cases. |
| External and wider-product nonclaims (§14) | R-084–R-093 | Explicit unqualified list; no enterprise policy/timing/SLA invention, no full ledger/G1/G2 completion claim; severe defects block supported profile. |

`node g1-storage/scripts/check.mjs` must build current candidate sources/tests before execution, require all frozen suites and per-group executed counts, reject unknown arguments and stale emission, and capture both successful and failed outputs. No empty suite, failed/cancelled test, skip/TODO or incomplete ownership-checked cleanup passes. Perform preflight on actual process census, loopback and cached owned PG; fail rather than silently skip unavailable required capabilities. Before/after guards preserve accepted G0/G1-local/foundation/F02 files/checks/raw histories; pin imported F03/F04 sources used by this composition without rewriting their pending/historical evidence. Guard the build/check in failure paths too.

Controller acceptance commands remain `node g1-storage/scripts/check.mjs`, `node g1-identity/scripts/check.mjs`, `node g1-foundations/scripts/check.mjs`, `node g1-foundations/scripts/check-retained.mjs`. Electron/GUI regression uses `loop_check` outside the sandbox. F05-focused checks must additionally exercise the imported F03/F04 fence/native/budget owners; do not equate imported types with integration evidence. Planning may add focused unchanged owner regressions, without replacing any registered command. Use cached/offline/frozen dependencies and cleanup only owner-marked reproducible processes/databases/roots after verifying actual instance ownership; no historical PID signaling or broad deletion.

Later delivery must include `docs/planning/g1-f05-plan.md` and `docs/evidence/g1-f05-acceptance.md`, the requirement-to-case matrix, local operator/recovery procedure, key/encryption inventory and data-flow/threat/rollback changes. Acceptance names candidate/source/check/lock/environment identities, supported class/profile, complete controller raw stdout/stderr paths with byte counts/digests, counts/failures and current independent verdicts only when actually issued. Author prose/document validation is not a reviewer signature or acceptance result.

## 14. Risks and qualification limits

| Risk or remaining environment | Mitigation / explicit boundary |
| --- | --- |
| Loss or rollback of both content and current restriction/head authority | Current ledger enrollment/epoch required; fail closed. Local positive restore requires surviving current PG authority. Whole-cluster disaster recovery and external freshness feeds remain unqualified. |
| PG/file crash window or GC deleting live bytes | Immutable staging+confirmed publication, fsync/local crash tests, scope-bound reachability/leases; actual filesystem/runtime power-loss and provider durability still unqualified. |
| Private payload entering existing plaintext Task/model/audit stores | F05 ciphertext-only payload inventory, opaque native references, no inference invocation; actual marked-string scan required. Future model enablement needs full encrypted persistence integration. |
| Late generation, dependency growth, stale cache or restore resurrecting content | Current head/restriction checks on every read/write/job/activation, bounded closure, monotonic tombstones, explicit per-entity freshness block, both race orders. |
| Lock duration, new deadlock ordering, service-accounting failure | Conservative existing barriers, bounded I/O, installed owner order, contention/timeout recovery tests. Performance evidence is diagnostic only. |
| Actual object store/volume encryption, managed key custody/rotation, approved regions | Pending actual authorized environments and data-processing/key decisions; local AES files and harness keys do not qualify them. |
| Enterprise retention/legal hold, full backup erasure and link/stream revocation | Pending policy owner and real provider/broker tests. No direct links/remote streams supported locally; prior delivered/exported/provider bytes not recalled. |
| Qualified no-VM runtime and external isolation | Local zero-call observations only; F06 Linux/image/egress/mount/process enforcement remains pending. |
| SSO, human judgments, models and billing | Local synthetic identity/operators, local extraction and synthetic resource accounting only; formal directory/SSO, actual approval judgment, model quality/conformance and real invoice reconciliation remain pending. |
| Devices and product breadth | F07 physical sleep/signing/three-client/accessibility remains pending. Full G2 recall-quality/no-memory comparison, inspector/curation/connectors/JML/legal-hold/schedule/Fleet/billing, G3/G4/G5 remain outside F05. Local recall/conflict/delete/revocation cannot be deferred. |
| Evidence or high-severity security gap | Missing positive behavior, unauthorized disclosure, silent lost update, duplicate commit, resurrection or Ask computer start fails finite qualification. Never advertise full AF-07, UX-12–17, whole G1/G2 or an SLA from this design/local suite. |

No unresolved human question blocks this local architecture. Real retention, region, key, legal-hold, download exposure and disaster-recovery decisions remain authorization/qualification gates before external use. No paid API/cloud/shared release, real credentials/policy changes, messages, nonreproducible deletion or history rewrite is performed here.

## 15. Stage handoff

This turn produces only this design. Validate the embedded type excerpt and all local links/requirement references as documentation checks; do not label that product evidence. Next test design must specify observable case oracles and failure schedules, especially native-owner integration, scanning every retained payload copy, original-key uncertainty, full-audience disclosure races, transitive late jobs, staged-byte cleanup and post-backup freshness barriers. Production schemas, SQL, adapters, checks and qualification artifacts belong to later implementation stages. Submit through `loop_stage_done(stage="solution", path="docs/loop/agent-fabric-g1-f05-storage/solution.md")` and leave the controller a handoff note.
