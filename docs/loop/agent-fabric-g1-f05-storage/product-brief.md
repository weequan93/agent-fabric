# G1-F05 product brief: owned storage and saved-decision answers

Date: 2026-10-08. Stage: intake. Role: product manager.

## Problem and product outcome

Deliver the additive G1-F05 storage/volume increment: encrypted persistence, basic retention and deletion propagation, and an actual restore, with scoped, versioned, source-backed saved knowledge as the foundation for G2 memory. A currently authorized user must be able to ask about a saved decision through the native service route without starting a Space VM. Storage, source eligibility and recovery must govern real local behavior rather than exist only as interfaces or fixtures that return predetermined success.

Agent Fabric promises no surprise audience, computer or publication. A saved decision is useful only if it survives recreation, retains its source and revision, and is eligible for the answer's entire audience. A stale writer must not silently overwrite a newer decision. Forgetting, expiry or revocation must stop future recall and derived disclosure, including after a delayed indexing job or an older backup restore. A volume snapshot alone cannot prove that a knowledge record committed or that unsaved editor work survived.

This increment advances AF-07 and UX-01 in the remaining ledger. It must actually exercise recall, conflicts, deletion and revocation within its declared local profile. It does not close the full G2 memory lifecycle or certify a production storage provider, remote runtime, real model route or whole G1 product.

## Source baseline

| Source | Product obligations carried forward |
| --- | --- |
| Current goal and [foundation dependency sequence](../../planning/g1-foundations-plan.md), G1-F05 | Own storage/volume behavior; encrypted persistence, retention/delete propagation and actual restore. The user authorizes additive local development, not external resources. |
| [Roadmap](../../planning/roadmap.md), G1/G2 and recovery increment | G1 already needs audience enforcement and basic retention. G2 expands STORE/LOAD, correction, connectors and enterprise lifecycle. Baseline safeguards cannot be deferred. |
| [Remaining ledger](../../planning/g1-remaining-ledger.csv), AF-07 and UX-01 | AF-07 cites master §§2, 15–18; UX-01 cites §§31, 5, 7, 17. Local contracts and actual behavior are required; full qualification remains separate. |
| [Master specification v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md), §§2–5, 7 | Immutable tenant/Space/task bindings; personal/group audience; source eligibility before disclosure; ordinary Ask uses a service worker without a Space filesystem or VM startup. |
| Master §§15–18 | Distinct authorities for metadata, object bytes, live volumes and derived indexes; durable commit acknowledgement, provenance, expected revisions, authorized recall, current policy, tombstones and descendant invalidation. |
| Master §§14, 28, 30–32 | Enforced delivery-path revocation; restore ordering and per-data-class recovery objectives; qualification boundaries; adversarial tests; unresolved shared-volume and retention decisions. |
| [G1-F02 acceptance index](../../evidence/g1-f02-acceptance.md) and [identity check](../../../g1-identity/scripts/check.mjs) | Current identity/audience and trusted PostgreSQL boundaries remain authoritative. Strict builds, required nonempty suites, no skipped/TODO cases, retained baseline guards and controller-owned evidence. |
| [Earlier F04 brief](../agent-fabric-g1-f04-model-finops/product-brief.md), repository README and existing local packages | Preserve service/computer classification and model/budget ownership. Existing local code and historical planning statements do not establish whole-product acceptance. |

The roadmap and README contain historical planning-only statements. The current goal authorizes this increment; those statements and retained acceptance histories must not be rewritten. The F02 index records actual local command observations and unresolved independent/external qualification separately. This brief supplies neither a review signature nor an acceptance verdict.

## Users and responsibilities

- Individual users need to save a personal decision, recall it later with its source, and know whether it was committed, expired, corrected or forgotten.
- Group contributors need a shared decision history that preserves authorship, handles concurrent corrections and does not incorporate a participant's private source into a room-visible answer.
- Authorized data/lifecycle operators need inspectable retention, deletion and restore outcomes, including propagation failures and restrictions. Room membership alone does not grant restore, deletion or policy-administration powers.
- Engine, identity, data and runtime maintainers need one owner per record, durable recovery and observable refusals that preserve existing Task and Space boundaries.
- Independent reviewers need executable journeys and complete evidence tied to the current candidate, check definitions and environment.

These are responsibility roles, not new grants, named owners or a production role-bundle decision.

## User journeys

1. **Save and reopen a decision.** An authorized user explicitly saves a decision in Personal or an authorized group Space. The operation records scope, author, source identity/revision, audience, status and retention information. An acknowledgement says Saved here only after the accepted record and required durable work commit. Reopening through a recreated service returns the acknowledged version and eligible source. Pending review and Not saved remain distinct outcomes; ordinary discussion is not promoted to an approved decision by implication.
2. **Ask about the saved decision.** A user asks what was decided. The native service resolves the original Space and intended audience, selects eligible current sources before content enters answer generation, and returns an answer grounded in stored bytes plus an inspectable source/version manifest. No Space computer is provisioned, awakened or mounted. Source failure, missing evidence or service failure returns a safe limitation/refusal and next action without secretly starting compute. A locally deterministic answer/model path must be labelled as such and consume actual selected stored content, rather than return a canned answer.
3. **Correct while another writer works.** Two authorized writers read the same revision. One corrects the decision; the other's incompatible stale update produces a visible conflict or review outcome instead of overwriting it. Independent facts may append. Repeating the same scoped operation returns the same committed result; changing its binding under the same key conflicts. Recall exposes the current accepted revision, author and source while preserving permitted history and unresolved contradictions.
4. **Forget, expire or lose access.** A permitted forget operation or declared retention expiry tombstones the active record and durably invalidates dependent summaries, indexes, caches and any supported derived records. Source or membership revocation blocks subsequent retrieval and publication under current authority even while background propagation is pending. A queued job cannot resurrect content. The response distinguishes affected active/derived records, pending propagation, external copies and retention restrictions; it cannot claim to recall bytes already delivered.
5. **Persist files without confusing authorities.** An authorized task writes to its owned Space storage binding and commits artifact bytes and their manifest through the owning service. Live editable files, drafts and canonical artifacts have distinct save/checkpoint status. A conflicting promotion cannot silently replace a newer version. Worker recreation preserves confirmed committed data; uncommitted or uncheckpointed work is reported according to its actual recovery class. A private record is never placed on a group-readable volume merely because a chat hides it.
6. **Restore an older backup safely.** An authorized local operator restores a real encrypted backup/checkpoint into fresh owned fixture storage after recreating the service. Current policy, membership/source revocation and the deletion ledger are applied before serving restored records, files or rebuilding derived views. Surviving eligible decisions and committed files become usable again; records deleted, expired or revoked since the backup remain unavailable. Missing current authority, inconsistent manifests, corrupt bytes or unusable decryption material blocks affected serving with an inspectable recovery state. Restore grants no permission to replay effects, stale approvals or old worker writes.

## Goals, priorities and scope

### Must

| Area | Required outcome | Local success measure |
| --- | --- | --- |
| Owned storage and volume | Bind every supported content object, metadata relation and volume/checkpoint to its immutable tenant/Space and authorized audience. Keep native task/control, identity, storage, memory and verifier authorities distinct. | Execute allowed access plus wrong-tenant, wrong-Space, forged-binding and private-to-group refusals. Denied requests disclose no restricted content or source title and cause no durable unauthorized mutation. |
| Encrypted persistence | Persist supported retained content and backups as genuinely encrypted bytes, with authenticated integrity and documented scope/key handling. Do not put real secrets in fixtures or retain private content indefinitely in audit/log copies. | Read actual retained files/checkpoints, demonstrate round-trip recovery across recreation, and refuse corruption or wrong/unavailable fixture decryption material. Inventory metadata, logs and derived stores so the encryption claim has an explicit boundary; plaintext private payloads cannot be hidden outside it. |
| Durable commit and provenance (AF-07) | Accepted typed revisions retain source identity/revision/digest, asserted-by author, scope/audience, status, validity/expiry, verification basis and supersession lineage where applicable. Publication requires confirmed bytes and manifest; acknowledge only after canonical commit. Derived work uses durable outbox processing. | Observe committed records and stored bytes through a fresh service, retry receipts and source manifests. Exercise interrupted byte/manifest/metadata writes and lost acknowledgements; no false Saved here, dangling published artifact or duplicate accepted revision. Uncommitted uploads remain unavailable pending documented cleanup. |
| Conflict and correction (AF-07) | Scoped idempotency and expected revisions prevent stale summaries or file promotions from silently overwriting current accepted data. Corrections do not rewrite unrelated knowledge or publish methods. | Actual contention demonstrates no lost update: incompatible writers yield an explicit conflict, identical retries have one result, and independent writes retain their records. Recovered writers still respect the current revision. |
| Authorized recall (AF-07) | Filter eligibility before content reaches the model/answer generator, reranker or enrichment boundary. Recheck source/output audience at disclosure. A manifest exposes only permitted source, knowledge and authority revisions with inclusion reasons. | Recall newly committed eligible decisions from actual persistence, including with a delayed/unavailable derived index via authorized exact/tail retrieval. Assert zero restricted content in generator inputs, answers, manifests and shared diagnostics; stale caches cannot bypass denial or authority outage. |
| Saved-decision Ask (UX-01) | Route an ordinary question through the native service with no Space filesystem, unrestricted shell or computer startup. Respect independent source attachment, older-conversation recall and saving controls. Missing evidence is explicit. | A runnable saved-decision journey produces a source-grounded local answer and source manifest. Observe zero provision/wake/mount/computer-dispatch calls in allowed, denied, unavailable-index, service-failure, concurrent and restored journeys. Unsupported live inspection requires its separately declared capability; it cannot be an Ask fallback. |
| Retention, deletion and revocation (AF-07) | Basic retention applies to supported content classes. Forget/expiry records tombstones; current source/membership revocation suppresses future context and publication. Dependencies invalidate durably, with late jobs rechecking current policy. | Exercise actual expiry, authorized/denied delete, repeated delete, descendant invalidation, retry after propagation failure and delete/revoke races with retrieval, writing and background jobs. Observe no future disallowed recall/publication or content resurrection. Report pending cleanup and disclosed retention restrictions truthfully. |
| Actual restore | Recover real persisted bytes and canonical records into fresh owned storage, preserving cross-store consistency. Apply current deletion/revocation/retention policy before rehydration, indexing and user access. Old copies are not authority. | Restore an older backup after post-backup deletion/revocation/correction, serve eligible survivors, and prove tombstoned or newly unauthorized data cannot be served. Exercise corrupt/incomplete backup and interrupted/repeated restore, not merely serialize/deserialize an in-memory object. State the measured local recovery boundary and last checkpoint; invent no production RPO/RTO. |
| Required delivery | Later stages add `g1-storage/` with a build and `g1-storage/scripts/check.mjs`, `docs/planning/g1-f05-plan.md` and `docs/evidence/g1-f05-acceptance.md`. | Strict build of the current sources followed by mandatory nonempty behavior suites for both ledger rows and storage/restore, covering real allowed, negative, concurrency and recovery cases. Missing suites, failed/cancelled tests, skips/TODO, stale outputs and failed cleanup must fail the check. Follow the identity check's conventions without altering that check. |
| Baseline and evidence preservation | Additive integration preserves accepted G0/G1-local/G1-foundations/G1-F02 checks, protected files and raw evidence. No parallel source of identity, approval, budget, task or completion authority. | Controller-run checks supply current evidence and required unchanged regressions. Electron/GUI commands use `loop_check` outside the sandbox. The acceptance document names the candidate, commands, supported local profile, raw result locations, limitations and unresolved external gates. |

Success means every Must obligation has observable local evidence and all mandatory checks pass under the controller. In the finite required suites, unauthorized disclosures, silent lost updates, duplicate canonical commits, resurrected deleted/revoked content and Ask computer-start calls must each be zero. Positive authorized journeys must succeed as well; a system that refuses everything does not qualify. Numerical retention durations, performance percentiles, RPO/RTO and legal guarantees are not invented acceptance targets.

### Should

- Offer a documented local user/operator entry point for save, ask, conflict, forget and restore, with understandable scope, source, save status, preservation and next-action outputs. A new GUI is not required for this increment.
- Provide an obligation-to-test matrix for AF-07 and UX-01, separating direct canonical behavior, derived propagation, volume/checkpoint behavior and each remaining external qualification.
- Document recoverable versus unsaved work, the tested restore procedure, propagation retries and failure states. State that retained storage can continue after Task Stop, archive or computer suspension; those actions do not mean deletion or zero charges.

### Could

- Add deterministic failure schedules or fixture variants where they improve required contention, deletion-ordering or recovery coverage without broadening the product surface.

Could items cannot substitute for a Must journey or its negative/recovery evidence.

## Explicit non-scope and external qualification

This intake writes only this brief. Production code, solution selection, test implementation and the requested increment plan/evidence belong to later controller stages.

The delivery scope is a finite local behavioral profile, with repository-reproducible synthetic data and ephemeral fixture keys/identities. It does not include paid model/product APIs, new paid resources, cloud buckets or managed keys, real credentials, remote deployment, production retention changes or messages to people. A deterministic local answer route does not establish real supplier conformance or answer quality.

Full G2 semantic retrieval quality, enterprise memory curation/inspector breadth, complete connector/JML lifecycle, legal-hold administration, billing reconciliation, schedule/Fleet breadth and Reflect release are deferred. The present increment still must implement and test its baseline lineage, recall, conflict, delete and revocation behaviors; naming G2 is not permission to defer those local requirements. It must not claim to complete UX-12–17 or all AF-07 obligations on the strength of these supporting local cases.

External qualification remains necessary for actual object-store/volume encryption and key custody/rotation, approved data-processing regions, provider backup durability, crash consistency on the real filesystem/runtime, multi-host availability and disaster recovery, policy/legal-hold retention periods, real download/stream revocation and direct-link exposure windows, qualified no-VM service isolation, formal SSO, real model routes, physical clients and measured production recovery/performance. Immediate erasure from every historical backup and revocation of prior exports/provider transmissions are not assumed.

The acceptance document must identify which of these remain unqualified and why. Local encrypted-file behavior is useful evidence for that profile, not a cloud, hardware or regulatory attestation. A restored volume is not permission to restore credentials/browser sessions or replay external actions.

## Constraints and decision boundaries

- Keep changes additive. Do not rewrite accepted checks, protected inputs, raw logs, evidence histories or prior ledger acceptance status to create a pass. Existing worktree changes from F04 and controller-owned `.loop/` state are outside this intake's edits.
- Use existing trusted current identity/membership/audience and PostgreSQL/UoW contracts; source and storage bindings must not trust a client-supplied current Space, payer tag or stale snapshot. Requirements/solution must identify one owning service per record.
- Paid calls/resources, shared/production releases, nonreproducible data deletion/overwrite, communication to people, credential/security/access-setting changes and published-history rewrites require `loop_ask(kind="approval")` before action. Local behavioral fixtures do not authorize changes to real access policy or secrets.
- Use only owned repository-reproducible fixture data for destructive/recovery tests, with bounded, ownership-checked cleanup. No unowned processes, volumes or databases may be removed to make a check pass.
- Only controller-run results count as acceptance evidence. Run GUI/Electron through the controller outside the sandbox; a sandbox crash does not justify skipping or weakening a regression.

## Open questions and risks

No human answer is required to complete this intake: the requested local scope and approval boundaries are explicit. Unresolved implementation choices must be settled in requirements/solution/test design; unresolved enterprise policy and external environment choices remain gates, not invented product decisions.

| Question/risk | Next resolution or required boundary |
| --- | --- |
| What exact bytes/classes are committed, checkpointed, encrypted and restored? | Solution and test design must inventory metadata, decisions, artifacts, live files, drafts, indexes/caches and audit retention. Define confirmation and recovery semantics per supported class, including unsaved work. Do not equate one snapshot with an atomic database transaction. |
| Where does current deletion/revocation authority survive an older backup? | Design must establish a durable current ledger/policy source and a serving barrier. If freshness cannot be established, fail closed rather than advertise the old backup as current authority. Test crashes and races around that barrier. |
| How are identity, native Ask/model service and stored sources composed? | Identify additive integration paths and explicit installed owners; reuse current authorization and service/computer routing. Demonstrate a real stored-decision journey, not isolated tests whose generated answer ignores storage. |
| Which retention, region, legal-hold, key and direct-link policy is approved? | No enterprise values are provided. Local durations/keys may be explicit reproducible test parameters only. Before external use, ask the authorized human/policy owner through `loop_ask`; do not treat a test default as an enterprise decision. |
| Can an index, cache, delayed worker or backup resurrect sensitive descendants? | Trace source dependencies and retry durable invalidation; recheck canonical tombstone/current authorization at reads and job processing. Include nested derivations and post-backup restrictions. |
| Can encryption conceal gaps in authorization or data handling? | Verify both cryptographic persistence behavior and independent audience enforcement. Inspect logs/metadata/backup manifests and avoid private payload copies outside the declared retention/encryption boundary. |
| Can local green results be overclaimed? | Bind evidence to candidate/check/environment and preserve raw failures. Independent review and controller completion remain separate; external gates stay visible. |

## Handoff to requirements

Translate every Must outcome into source-cited, verifiable requirements, retaining AF-07/UX-01 traceability and the local/external distinction. Specify actual stored bytes, canonical revisions, answer inputs, source manifests, route counters, propagation records and restore observations as verification targets. Include positive usefulness, denied access, actual concurrent contention and service/process recreation. Resolve storage-class and commit/checkpoint boundaries before implementation, preserve the approval gates and accepted baselines, and carry the same user journeys into product acceptance. The controller decides stage progression and final completion.
