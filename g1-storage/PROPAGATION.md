# Fenced local graph invalidation retry

`PropagationRetryRepository` is the installed control-only owner over the immutable graph24 event/job set. Construct it with the authenticated UoW, independent epoch journal, existing native owner and an installed `{workerId, leaseMs}`. `leaseMs` is bounded to100–30000ms. These are local service configuration, never fields in public command JSON.

```ts
const worker = new PropagationRetryRepository(uow, journal, native,
  {workerId: installedWorkerId, leaseMs: 10000});
const request = {key: originalRestrictionKey, sessionId: currentMaintenanceSession,
  expiresAt: finiteProcessingDeadline};
const status = await worker.run(currentVerifiedScope, {...request, limit: 4});
// Recreate after interruption; preserve the original event key and job IDs.
const observed = await worker.progress(currentVerifiedScope, request);
```

The existing native maintenance service requires current Task/Space authority and a service-only Ask origin, with no computer or target effect. Current authenticated identity, independent epoch/digest, policy, native fences and original event audience are checked before claims and after waits. Exact descendant ancestry has all unique origin Task audiences checked before a claim returns and around each completion mutation. Cleanup never confers content-read authority. The module has no crypto, content builder, supplier, model, budget, computer, storage-delete or publication port.

`claim` selects one pending original job under a row lock and `SKIP LOCKED`, refusing one with any unexpired lease or completed result. It returns the exact jobId/leaseId/current session and observed database deadline/attempt. `complete` accepts only jobId, leaseId, sessionId and a processing-command expiry. It must match the installed worker, authenticated actor, original job and latest active attempt. After a lease expires, recreate/reclaim through current authority; a newer attempt fences the old lease. Leases do not grant source authority, and a stale worker cannot publish derived bytes or canonical heads through this owner.

A completion revalidates the original durable restriction/revocation/correction against its installed owner and verifies exact graph ancestry. Current target head/witness, current draft revision, target expiry and direct restrictions classify obsolete work. Current targets receive one monotonic exact invalidation marker; overlapping original jobs receive `already-invalidated`. Obsolete jobs receive `obsolete` without replacing a fresh canonical head. Invalidated ancestry is checked before subsequent graph content open/release, including enrolled Ask cache dependencies. Current source/restriction/expiry guards already deny descendants while processing is pending.

Each claim and each completion has its own atomic commit. Invalidation and original-job result commit together; a deferred constraint rejects an incomplete mutation. No watermark is advanced before the descendant result commits. Failure after a committed descendant leaves actual partial progress, and recreation continues the same original jobs. Failure before COMMIT rolls back its invalidation/result. Lost COMMIT returns the existing typed UNKNOWN_COMMIT. Inspect current `progress`, or complete the exact original lease again; do not invent a new job or replay content effects. Exact committed completion is idempotent after lease expiry, but still requires current authority. `run` stops on error and processes at most16 jobs per call.

`progress` reports the actual original job set and completed/remaining counts:

| Status | Meaning |
| --- | --- |
| pending | No descendant completion yet; individual jobs may have active leases |
| partial-retry | Some descendants completed, others pending or leased |
| converged | Every enrolled original descendant job has one result |

Converged is local invalidation processing, with `cleanup: ciphertext-retained`. The existing graph jobs/outbox and older pending-intent receipts remain immutable history; the new progress owner supplies worker completion. Canonical heads/receipts, payloads, restrictions and original job IDs are never rewritten. Backup/external copies remain unknown (`null`), and already delivered information cannot be recalled. Physical erasure, legal holds and historic backup retention need separate enterprise policy and qualification.

Migration26 is additive after25. An interrupted installation rolls back to25 while preserving representative pending jobs and ciphertext. Repetition verifies the complete source/catalog lineage and installed owner snapshots. Once installed, lease/invalidation/result history is forward-only: there is no destructive down migration. An application rollback must keep current restriction/invalidation readers and control history.

The new plaintext boundary contains opaque routing/control fields only:

| Table | Fields |
| --- | --- |
| storage_propagation_leases | tenant_id, space_id, job_id, lease_id, actor_id, worker_id, session_id, attempt, leased_at, expires_at |
| storage_graph_invalidations | tenant_id, space_id, class, id, revision, witness, job_id, lease_id, actor_id, command_key, at |
| storage_propagation_results | tenant_id, space_id, job_id, lease_id, outcome, at, invalidated_class, invalidated_id, invalidated_revision, invalidated_witness |

All three tables are immutable and forced-RLS; only the trusted controller has SELECT and the installed mutation functions. Workers/clients/IdP cannot directly select or mutate them. Exact foreign keys bind attempts to original jobs, invalidations to original lease/job/witness, and results to the same original job/lease and exact affected node. Unique constraints enforce one invalidation per exact node and one completion per original job. A current-lease index supports job/attempt lookup; the gate checks a real EXPLAIN plan. Bounded ancestry metadata queries load origin Tasks in bulk before deduplicated audience checks.

These controls belong to surviving current authority, not restorable content. Content archives must not restore active worker sessions or resume/replay lease/job authority. Future backup/import/activation must reconcile current restrictions and preserve the original progress owner; backups cannot turn a lease into a grant. No backup capture or actual restore is qualified by this component.

Run `node g1-storage/scripts/check-component.mjs propagation-retry`. All28 fixed mandatory variants run against fresh owned local PG16/OIDC/ephemeral keys, including actual partial mutation/failure/recreation, lost COMMIT/rollback, lease expiry/fencing, overlapping originals, deletion/revoke/expiry/correction non-resurrection, observed job-lock waits and restriction/publication races in both orders. Full lifecycle imports the same assertions. Unknown/extra CLI arguments fail before building or creating fixtures; no case-ID filtering or Node skips are supported. Full Cartesian tester schedules, full frozen L/Q journeys, independent/aggregate/product acceptance and AF-07/UX-01 closure remain pending.

Only this reproducible local environment is covered. Real enterprise service identity, source connectors, KMS/HSM/key recovery, provider/storage regions, remote isolation, cloud disaster recovery, legal-hold/physical backup erasure, production timing/load, paid usage and X01–X09 remain unqualified. No paid call/resource, deployment, real credentials/settings change or message to a person is used.
