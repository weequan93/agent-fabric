# G1-F05 owned storage operator procedure

Run the repository-local procedure from the repository root:

```sh
node g1-storage/scripts/check-component.mjs delivery-operations
```

This strictly builds the current source and tests, creates ownership-marked synthetic PostgreSQL 16.12 and loopback OIDC resources through the existing fixture seam, executes all D01/D03/D04/D05 assertions, and checks owned cleanup. The cached image is used with `--pull=never`; no paid API, provider, shared deployment or real credential is used. Only controller-run checks count as qualification evidence. D02/D06 remain mandatory in the full `node g1-storage/scripts/check.mjs` gate and share the implemented `delivery-evidence` component assertions. Run `node g1-storage/scripts/check-component.mjs delivery-evidence` through the controller to exercise their seven fixed leaves. `node g1-storage/scripts/check-evidence.mjs local` audits original result references and reports pending qualification; `controller-behavior` requires fresh terminal storage/identity/foundation/retained checks and refuses missing or stale evidence. Independent verdicts remain separate controller gates. Security/harness/full aggregate, unchanged regressions, independent reviews, final acceptance and product acceptance remain subsequent controller gates. Never edit `.loop/` by hand or declare controller COMPLETE.

The actual executable journey is [the shared helper](tests/helpers/delivery-operations-component.ts); its diagnostic wrapper and full delivery-audit wrapper invoke the same assertions. There is no CLI selection by case ID, selective full run, skipped test or substitute evidence fixture. Optional fault probes cannot replace real PG/file/network cases.

## Authenticated save, Ask and conflict

The installed user entry point is HTTP POST `/v1/tenants/{tenant}/spaces/{space}/native/remember`, `native/remember-lookup`, `native/ask`, `native/ask-service`, `native/ask-receipt` and `native/query-controls`. Each request supplies the current OIDC bearer token. URL scope is verified against current identity, payer, membership, immutable native session and full audience; client scope/grant/key/root assertions are refused. The owned fixture enrolls the source, exact maintenance Task and allowed local service accounting through installed owners.

D01 opens `startNativeAskHttp` with the actual `KnowledgeSaveRepository` and `NativeAskRepository`. It enables independent olderRecall and saveReusable controls on the answer session and submits:

```js
const remember = {
  schemaVersion: 1,
  sessionId: answerSessionId,
  destination: 'here',
  command: {
    schemaVersion: 1, action: 'save', sessionId: maintenanceSessionId,
    targetId: knowledgeId, key: originalKey, expectedRevision: 0, expiresAt,
    assertion: { subject, value, sourceId, sourceRevision: 1,
      validFrom, validUntil: null, expiresAt: contentExpiry,
      classification: 'group', intent: 'assert', checkId: null }
  }
};
```

The fixture creates random source-backed decision text, makes two concurrent authenticated `native/remember` requests with this exact original key and requires the same Saved here receipt plus exactly one persisted revision. Changing the value under that key yields HTTP 409 `IDEMPOTENCY_CONFLICT`; it does not overwrite the decision. An invalid bearer returns 403 and no restricted text. `native/ask` selects the saved ID and returns its actual persisted value and matching source revision/digest, `local-extractive-v1`, full source manifest and `computerStarted:false`. The five reachable computer/shell/model/enrichment/effect ports remain zero and there is no ComputerAssignment.

For a correction, use `KnowledgeSaveRepository.correct(currentVerifiedScope, { command, prior })` with current expected revision and exact previous witness. Concurrent incompatible changes preserve one winner and explicit stale conflict in K08; history and supersedes remain inspectable. A same-key conflict is different from accepting a new correction. Unknown COMMIT returns the original key with `replayAllowed:false`; inspect `native/remember-lookup` with the complete unchanged original request and current authority. Never silently issue a new key or replay after uncertainty.

Saved here means acknowledged canonical COMMIT and current owner confirmation. Pending review is durable proposed knowledge, never an accepted fact just because it was repeated. Not saved has no accepted canonical revision. Derived outage does not erase a canonical receipt. A knowledge save does not checkpoint live files or editor memory.

## Forget, backup, actual loss and restore

Lifecycle/recovery operations use the installed trusted authenticated service API. They are not advertised as public HTTP routes. Obtain `currentVerifiedScope` from `IdentityScopeVerifier.verify` and retain the exact tenant/Space/actor/original key, native maintenance session, expiry and scoped entity witness. Cloning a scope cannot mint authority. Separate `storage:forget`, `storage:backup`, `storage:restore`, `storage:read` and maintenance grants are required.

D01 first calls `BackupCaptureRepository.capture` and `BackupConfirmationRepository.confirm` for a coherent actual archive containing the HTTP-saved decision and unrelated confirmed source, knowledge, artifact/live/draft/checkpoint/summary content. It asserts that the exact HTTP knowledge ID is included. Then `ForgetWorkRepository.forget` commits its tombstone and pending propagation under current authority. Canonical recall refuses the forgotten record immediately. Logical restriction precedes physical propagation; the forget result is not a claim that every backup or external copy has been erased.

The same fixture removes four ownership-checked reproducible content directories and its owned derived payload rows while preserving PostgreSQL control metadata and the independent authority journal. This is actual payload loss, not a mocked missing flag. The backup and keys survive. `RestoreProgressRepository.resume` stages to a fresh generation and separately held target key. `RestoreProgressRepository.status` reports staged, expected/completed items, last included successful checkpoint, serving false and jobs false. No staged content may serve.

`RestoreProgressRepository.activate` rechecks current independent epoch, policy, full audience, current heads, source/ancestry and restrictions, then commits activation. The archived HTTP-saved decision remains unavailable because its post-backup tombstone survives. Restored reading of that exact knowledge ref is refused. The unrelated archived survivor yields its exact value through the restored reader and a fresh authenticated `native/ask`, with no VM or model start. Ready status is content serving eligibility; jobs remain disabled and credentials, approvals, methods, unsent drafts and external effects are not replayed.

To resume after interruption, preserve the exact original restore command, key and target operation. `RestoreProgressRepository.status`, `.resume` and `.lookup` use that binding and current authority; they continue the same generation. Changed original fields conflict. Staging or a missing ACK is not permission to activate or recreate work automatically. Lookup returns the exact original receipt after a committed activation; pending/unknown outcomes require current original-operation inspection.

`RestoreProgressRepository.rollback` commits forward-only cancellation, disables serving/admission/jobs, then cleans only authenticated owned staging. `status` remains rolled-back, a repeated rollback is idempotent, and resume is refused. Preserve original canonical receipts, heads, pending work, tombstones/restrictions, the authority journal and original backup. To withdraw an F05 profile, the owner disables new F05 admission/serving/publication through an authorized lifecycle operation; there is no destructive down migration. Rollback cannot undo already delivered bytes, completed external effects, lost unsaved editor memory or real provider/host/region loss.

## Inventory, expiry and storage after Stop

The versioned [delivery inventory](verification/delivery-inventory-v1.json) carries all 11 class records, their encrypted and opaque fields, final 57 installed storage tables/651 columns, owner contracts, graph/store and restore metadata, and excluded restore authorities. D03 compares these to imported source inventories and actual PostgreSQL `information_schema` columns. Original descriptive inventories contain historical pending-language; `currentImplementations` distinguishes that history from implemented coherent capture, graph payloads and authenticated routes. It does not manufacture an E03 scan or whole-security verdict.

Source/knowledge belong to the memory owner; artifact/draft publication to the artifact owner; live versions/checkpoints and backup/restore to storage owners; summary/index/cache to rebuildable memory projections; Ask generation/disclosure to the native query owner. F02 remains identity/current audience owner. F04 owns reserve/settle arithmetic and native service resources. Content cannot create approval, protected CheckReceipt, budget, method release or task completion authority.

Every durable descriptive payload is AES-256-GCM ciphertext bound to tenant/Space/class/ID/revision/generation/key ID. Titles, filenames, source/lineage and answer manifests are sealed. Routing IDs, timing, traffic metadata, keyed fingerprints, opaque control rows and authenticated envelope metadata remain declared metadata. Keys are ephemeral harness-held 32-byte data/digest capabilities; target restore keys differ. They are never HTTP/archive/log content. This is fixture policy, not managed KMS/rotation custody.

Finite per-class durations, expiry windows, synthetic billing units and local bounds are fixture policy parameters. D03 does not invent enterprise legal hold, provider retention, key deletion, physical/backup erasure or a production SLA. Tombstones and minimal original-key/current-control metadata survive content cleanup. Derived logical restriction/invalidation uses current dependencies; bounded retry owns actual local cleanup. Real provider/backup/external-copy erasure remains X03/X04.

Storage after Stop can still be charged: Stop fences native writers/dispatch, while current authorized committed reads and retained storage can remain available. Storage custody/reservation continues until separately confirmed suspension/deletion; Stop alone is not proof of physical removal. Live writes are versioned but recover only within the confirmed checkpoint included in the chosen backup. A draft is saved content with no automatic promotion or send. Unsaved editor memory and uncheckpointed work beyond that included set are not covered.

## Observed recovery and dependencies

Latest original controller `job-98cd6d907b/f05-13.backup-restore-suite` R07 restores an actual four-directory payload loss: 17 items, 17,034 decoded bytes and 57,381 archive bytes; six sources, six knowledge revisions, one artifact, live file, draft, checkpoint and summary. Its monotonic sample is **10298.687 ms**, captured epoch 18/current epoch 20, last successful backup `2026-10-12T21:10:38.642Z` and checkpoint `2026-10-12T21:10:31.884Z`. Actual read/write contention observed two blocking PG backends and **3744.847 ms**. Seven original interruption recoveries span staging-created, item-recorded, import-validated, metadata-imported, restrictions-reconciled and before/after activation COMMIT, **2744.740–4178.108 ms**. The inventory points to the original complete hashed controller stream; D03 checks the samples against those bytes. These are historical source-run observations, not passing evidence for a changed current candidate or a production RPO/RTO/SLA/percentile objective. Current PG control/typed canonical metadata and keys survived; whole-cluster/host loss remains unqualified.

[dependencies.json](dependencies.json) binds the 18 offline packages, lock, Node 22.22.3, pnpm 10.18.0 and cached PG16.12 image. Seventeen available notice files are retained byte-for-byte. pg-types and pgpass installed notice sets are missing; declared licenses do not establish legal sufficiency. Vulnerability assessment, image SBOM/license and runtime notice sufficiency remain unknown. D03 checks every retained notice and installed package JSON hash. Architect owns pins/metadata, backend/data owns SQL and adapter compatibility, independent security owns assessment and tester owns requalification. Updates require explicit reviewed version/lock/image changes and fresh complete relevant authority/concurrency/recovery and unchanged regressions; offline frozen install ignores scripts. No automatic update or image pull is authorized.

## Data-flow and threat changes

OIDC ingress → current F02 verified scope → authenticated PG/UoW and native barrier → source/knowledge owner → exact ciphertext commit → current source/audience broker → deterministic extractor → fresh disclosure/accounting commit. Derived graph edges hold scope and source ancestry. Coherent capture reads accepted heads/confirmed files under barriers into a separately encrypted owned archive. Import stages fresh target ciphertext; current authority, restrictions and source/version reconcile before activation. Source text and generated context remain data throughout.

Threat checks cover forged/stale identity and partial audiences (A01–A04/Q04/L03), ciphertext/AAD/key/root substitution (E01/E02/E04/R05), stale/conflicting/tombstoned knowledge and control laundering (K08/K09/Q02/Q03/L04/L05/L07), stale archive authority and effect/credential replay (R01–R06), and unapproved model/VM/provider fallback (Q05/Q08/D04/D05). The finite assertions qualify only their observed local boundaries. High-severity unresolved findings block affected qualification even when a useful journey passes.

## Historical requirements and approval boundaries

R-079 is historical requirements-only audit: controller event seq17 at `2026-10-07T20:32:40+00:00` recorded `requirements.updated`, 96 requirements and final=true. D04 reads that original event and compares exact requirement IDs/source/verify/mapping with current registered requirements. Development does not repeat that requirements-stage turn. Requirements history and controller-owned progression are separate from product behavior.

The following actions remain OFF without prior exact `loop_ask(kind=approval)`:

- deploy or release to a shared or production environment
- delete or overwrite data that is not reproducible from the repository
- spend money or start paid resources
- send messages, emails or posts to people
- change credentials, secrets, access control or security settings
- force-push, rewrite published git history or delete branches

Synthetic fixture enrollment, ephemeral keys and ownership-checked repository-reproducible cleanup are the existing authorized local scope. Full G1/G2, AF-07/UX-01 and UX-12–17 are not closed. F06 remote Linux isolation, F07 physical/signed clients and G2 enterprise memory/connectors/lifecycle/quality depth require their separate increments and actual environments. Every X01–X09 guarantee/environment/owner/action gate remains pending in [the acceptance inventory](../docs/evidence/g1-f05-delivery-inventory.md).
