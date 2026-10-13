# Local retention and forget component

The repository API is `RetentionWorkRepository` in `src/retention-work.ts`. It uses the installed authenticated UoW, native maintenance binding and independent epoch journal. This API has no deployment, paid-resource or credential authority.

```ts
const repository = new RetentionWorkRepository(uow, journal, native);
const command = {
  key: originalKey,
  sessionId: nativeMaintenanceSessionId,
  expiresAt: finiteCommandDeadline,
  entity: {class: 'knowledge', id, revision, witness}
};
const result = await repository.forget(currentVerifiedScope, command);
// After a lost ACK or unknown COMMIT, preserve this exact command/key:
const receipt = await repository.lookup(currentVerifiedScope, command);
```

Only exact current canonical heads can be targeted. Explicit forget requires current `storage:forget`, maintenance and Task authority; expiry requires maintenance/read/Task authority and an actually elapsed database-clock deadline. New class windows must use the enrolled finite class period. Expiry validates against the policy at the accepted head's epoch. A later reduction governs new admissions without rewriting already committed immutable deadlines. Enterprise legal-hold/retention decisions are not supplied by this fixture policy.

`expire(scope, command)` and `lookup(scope, command, 'expiry')` preserve the same original-key discipline. `sweep(scope, {key, sessionId, expiresAt, class})` discovers a bounded current per-class candidate set. The scan obtains latest heads and tombstone eligibility in one query and checks each unique origin Task audience. Every target publication is a separate atomic commit. The returned target keys identify unknown operations. An unknown or failed batch can have prior committed targets; resolve exact originals before any retry. Sweep is not an atomic batch receipt, and repetition can return no current candidates.

A `restriction-committed` receipt means exactly one current head has a monotonic tombstone and one durable invalidation intent. The event, original-key receipt, outbox and epoch commit together. It is not completed erasure. Same-key repetition returns the original currently authorized receipt; changed binding/mode conflicts. Already-tombstoned new keys refuse. A different key can refuse while a previous commit awaits independent ACK. Missing events, rollback, stale head/witness, revoked identity/audience, unavailable independent authority or expired commands cannot authorize another effect or content read.

The impact contract explicitly says `coverage: 'exact-target-only'`. `activeRestricted: 1` counts this canonical retained head (including an expired head), not transitive descendants or currently servable bytes. `pendingInvalidationJobs: 1` counts the durable intent, which this component does not consume. Exact source/knowledge/artifact ciphertext row counts are reported from the database; other payload inventories and derived/backup/external copy counts are `null`, meaning unknown or unqualified, not zero. Cleanup remains pending; backup erasure remains subject to retention. Minimal restriction/control history survives. No response recalls bytes already delivered to a caller.

Migration23 is additive and forward-only. An interrupted application of the migration rolls back to22 without rewriting its content/history. Once retention commands exist, a down migration that removes restrictions or their evidence is unsupported. An application rollback must retain the current restriction readers and ledger. No accepted migration, installed owner or check is replaced.

`node g1-storage/scripts/check-component.mjs retention-forget` strictly builds and runs all24 mandatory component variants, with real owned PostgreSQL16/IdP/cipher fixtures and ownership-checked cleanup. Component and full lifecycle registration import identical assertions; no test-name selection or skipped test is supported. All11 classes have finite-window/control-sweep coverage, with distinct enrolled periods. Actual persisted source/knowledge reads prove delayed-sweep refusal before decryption. Classes lacking a product payload owner use synthetic canonical control heads and do not acquire content-erasure/restore qualification through these tests.

Transitive graph processing, leased retries, maintenance accounting, physical ciphertext cleanup, backup capture/import/activation and actual content-loss restore remain separate pending tasks. The frozen full lifecycle suite remains required. Production KMS/key rotation/storage region, enterprise retention/legal holds/identity, remote isolation, cloud disaster recovery, real provider billing, stream/download windows and production timing/capacity remain unqualified external environments. AF-07, UX-01 and full G1-F05 are not closed by this component.
