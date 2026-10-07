# G1 recovery increment

Additive local recovery implementation with mandatory real PostgreSQL, Temporal,
HTTP, worker recreation, fencing, Dispatch, result and notification suites.
See [plan](../docs/planning/g1-f03-plan.md) and
[qualification scope](../docs/evidence/g1-f03-acceptance.md).

Run `node g1-recovery/scripts/build.mjs` from the repository, or
`node g1-recovery/scripts/check-slice.mjs contracts` for development.
`node g1-recovery/scripts/check-slice.mjs postgres` builds and runs the actual
owned loopback PostgreSQL and separate synthetic IdP integration suite. It needs
the cached pinned PostgreSQL image and Docker. `durable-authority` is its alias.
`node g1-recovery/scripts/check.mjs` is the unfiltered full gate.
Node22.22.3, pnpm10.18.0 and the frozen offline store are required.

Decoders produce frozen internal data, never authorization. The test adapter
proposes actions and performs pure replay with no provider or effect transport.
The entry snapshot must retain preexisting working-tree bytes and original checks.

The Temporal slice requires the free pinned Darwin arm64 CLI in the local cache.
Set it up explicitly with `node g1-recovery/scripts/prepare-temporal.mjs`; setup
verifies the upstream archive and extracted binary SHA256. Checks never download
or substitute a service. CLI1.4.1 embeds Server1.28.0. SDK1.24.0 is locked with a
small declaration-only patch: use its own `WithWorkflowArgs` around nongeneric
schedule options to fix exact-optional typing. Runtime SDK files are unchanged;
strict, exact-optional and library declaration checks stay enabled.

Run `node g1-recovery/scripts/check-slice.mjs temporal` through the Loop controller
because the Codex sandbox denies the mandatory native process census. The fixture
owns a loopback service, persisted SQLite history, synthetic PostgreSQL database
and IdP, and separate native worker processes. It verifies readiness, observed
PIDs/commands, SIGKILL and new PID/generation, cold service restart, recorded
session response restoration, current authority/expiry/budget denial, actual SDK
replay and incompatible replay rejection. Histories and measured worker/replay
streams are written under unique `node_modules/.cache/temporal-evidence/<owner>/` directories.
Checked copies and hashes are retained under `evidence/temporal/<owner>/`; raw
outputs and copies are never overwritten. Cleanup checks ownership and deadlines before signaling;
no historical PID is reused for cleanup. Conversation execution launches no
child harness or VM. Local trusted controller activities host database access;
the deterministic adapter receives records only. Hostile worker containment,
real remote Linux operation and paid model transport remain F06/F04 work.

Temporal workflow completion here means the two-turn conversation reached
`verifying`. It does not create accepted artifacts, a delivered outcome or a
notification; those remain separate later slices. Retry is capped at one for
native activities. An actual provider-call/ACK crash would need its own model
operation reconciliation before widening that policy; no provider is called by
this test-only adapter.

Run `node g1-recovery/scripts/check-slice.mjs effects` through the controller for
the independent durable loopback HTTP service, original-operation unknown-before-send
protocol, actual worker crashes/recreation and read-only reconciliation. The same
strict gate checks ambiguous/outage/unsupported/digest mismatch outcomes, current
revocation/expiry, original-key COMMIT ACK loss, concurrent dedup and zero-I/O
exported history replay. Only disposable synthetic targets are supported; real
provider semantics, irreversible writes and remote isolation remain unqualified.

The Stop/resource slice runs with `node g1-recovery/scripts/check-slice.mjs fences`
(alias `stop-fences`). It requires the owned PostgreSQL fixture and outside-sandbox
process census. Migration7 and trusted observed process/base drivers are mandatory
for online takeover; unsupported GUI/browser/native paths are closed. The HTTP
service exposes `/commands` and original-key `/lookup`, with fresh F02 scope
verification. Local mutation callbacks are synthetic test drivers, never a
production tool/approval bypass. Stop acceptance/fencing, observed resource drain,
pending process termination and submitted/unknown effect IDs remain separate.

The bounded Dispatch slice is `node scripts/check-slice.mjs dispatch`. It requires
actual owned PostgreSQL and process census, so the controller runs it outside the
Codex sandbox. Migration8 persists timezone/recurrence and stable occurrence/event
identities, bounded waits, current-authority admission, explicit missed-run consent
and checkpoint/effect recovery. Templates pin an existing Task/Run continuation
or exact operation; fresh recurring job construction and enterprise connector or
unattended credential lifecycles remain unqualified. See the F03 plan/evidence.

The result/notification slice is `node g1-recovery/scripts/check-slice.mjs results`
(alias `results-notifications`). Controller-only actual process census, isolated
owned PG fixtures and synthetic IdP are mandatory. Migration9 separates Task and
attempt outcomes, versioned artifact bytes, bounded executed check receipts,
DeliveryOperations and atomic minimal notification intents. Publication reuses
the exact-approved effect executor with current artifact/check validation at its
locked I/O boundary. An independent fsynced notification adapter actually rejects,
loses ACKs and survives recreation; fresh brokers fetch authorized results without
reexecuting the task. Retry is capped at three only after definite rejection;
unknown is GET-only original-ID reconciliation. Unsupported real storage,
providers/push/physical clients and remote environments remain unqualified.


The final `node g1-recovery/scripts/check.mjs` includes the required integrated
`qualification.test.ts` across migrations4–9: actual client exit, downstream ACK
loss, SIGKILL/recreated worker/supplier and persisted Temporal service restart,
original-operation GET-only settlement, concurrent stale online Stop fencing and
checked result retrieval by a fresh broker despite actual notification failure.
`check-evidence.mjs` validates complete actual controller evidence, not review or
external qualification. The controller also runs unchanged identity/foundation/
retained gates, including native Electron outside the sandbox. Full G1 and real
external environments remain unqualified as recorded in the evidence document.


Local resource ACK-loss recovery is covered by the fence slice and full gate.
Submitted/unknown entries block native continuation and conflicting I/O on every
Run enrolled on that resource, even with current generation and agent control.
A repeated operation never receives the original submitting invocation's I/O
exemption. Additive `0010_resource_reconciliation.sql` is installed through
`migrateResourceReconciliation` after migration7, preserving migrations4–9.
Missing migration10 fails closed on uncertainty.

`FenceRepository.reconcileResourceMutation` is a trusted synthetic domain recovery
boundary. Current human task-write authority, measured driver quiescence and a
configured read-only original-operation status observer are required. Exact
operation/binding/evidence digests and applied/not-applied status are stored in
an immutable scoped receipt; ambiguous status remains blocked. Workers and the
online command service cannot supply proof or invoke this recovery method.
Resolution does not retry I/O or restore a Stopped Run. Real supplier status
semantics, domain recovery judgment and remote containment remain unqualified.
