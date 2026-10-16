# Turn386 — revise census repair after PLAN385-01 and PLAN385-02

Assignment: plan, tech lead. F05 remains **not accepted**, 75/85 tasks done.
This is a plan revision for independent review, with no implementation, build,
test, runtime, environment, fixture cleanup or acceptance claim.

## Admission semantics (PLAN385-01)

The original failed job [job-55901f3dee](../../../.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-55901f3dee/)
failed both checks before build/tests. The generic census error does not
distinguish process failure from Docker failure. Current source requires both.
The earlier claim that harness-build never starts a full/PG-capable runner was
incorrect: `register-harness-build-tests.ts` launches `runHarnessPrerequisite`
in its cancellation, workload and stream schedules and holds its actual
contracts process. The private runner retains all ten mandatory suites, with
contracts before authority. Review references: runner lines101–106/124/145–180;
register-harness-build-tests lines1399–1402/1540/1730–1731.

Use suite admission, rather than the presence of a later integration suite in
the command's workload, to require Docker availability. The runner's existing
command measurement must always obtain a successful real process census and
attempt the real Docker census. Before integration admission, unavailable
Docker is an explicit **unknown/unqualified** observation with real diagnostic,
status/signal/error and captured output. Container identities/bytes are not an
empty successful census or evidence of absence. Available Docker preserves
exact raw bytes and parsed identities, and existing digest/transport semantics.
Legacy/structural census callers retain strict defaults; no public flag,
environment switch, selector or alternate success status is added.

For every integration suite, obtain a fresh successful strict process and
container census **before** private admitted-list/dispatch publication, fixture
import/start or integration work. Apply this at the same existing runner loop
for component, slice, aggregate and private fixed-ten paths, deriving the rule
from the actual registered suite's integration metadata. Contracts may run in
the full/private command before Docker becomes mandatory; this does not shorten
or replace the workload. Cancellation/failure during held contracts must settle
that real suite and refuse further dispatch exactly as before. If contracts
complete normally with Docker unavailable, integration admission must fail,
without a successful full report. Once integration has been admitted, its
return and command-final census remain strict; a later outage cannot downgrade
cleanup proof. Existing ownership/LIFO and current-candidate guards remain.

## Direct assertions and ownership (PLAN385-02)

One tester owns the two existing source files
`g1-storage/scripts/{execution-measurement,runner}.mjs` and minimal assertions
inside existing leaves in
`g1-storage/tests/helpers/{register-contract-tests,register-harness-build-tests}.ts`.
The lead owns docs/controller coordination and any necessary current F05-only
configuration re-freeze. Read the tester guide first. No accepted increment or
raw result may change. No new wrapper, probe module, admission layer, receipt,
candidate tree or historical reconstruction/mapping is permitted.

Direct assertions must exercise the actual measurement implementation and
runner boundary, not merely match source strings or command exit codes:

- Unavailable Docker produces unknown/unqualified observations with a nonempty
  real diagnostic, distinct from a successful empty container list, at start
  and return. Process bytes/digest remain mandatory and verifiable.
- Successful census retains exact raw process/container bytes, parsed IDs and
  digests, including a legitimate empty successful container result.
- Missing/failed/empty process census remains fatal even when containers are
  observational; strict legacy census refuses Docker failure. Strict suite and
  command-final census refuse Docker loss after integration admission.
- Real PG slice/component and full aggregate/private paths refuse before the
  first integration dispatch/fixture when Docker census fails. Preserve full
  contracts execution where it precedes that boundary; no shortened workload,
  fabricated PG execution or successful full report.
- Existing held-contracts cancellation, workload and stream schedules still
  launch the actual private fixed-ten runner, observe real contracts dispatch,
  settle the actual native suite and pipes, admit no subsequent suite and prove
  exact owned cleanup. Also assert the container observation in their decoded
  records and in the existing successful copied non-PG command.

Use minimal isolated test-local boundary fault injection for deterministic
success/failure cases, inside existing test facilities; retain real process
and Docker attempts in ordinary controller execution. Test doubles prove the
branch contract only and do not qualify a Docker daemon or PG fixture. Do not
add production switches, replace workloads, or weaken existing assertions.
All original C01–C03, harness-build tests/leaves and supplemental assertions,
including acknowledgement/Unicode/timeout/owner guards, remain mandatory.

## Checks, readiness and progression

Keep the two registered commands, serialized on one settled current candidate:
`node g1-storage/scripts/check-slice.mjs contracts` (900s), then
`node g1-storage/scripts/check-component.mjs harness-build` (2700s). Add the
assertions within current registered leaves; keep registry identities/counts
and workloads. Both checks must complete all original assertions plus the new
direct assertions, with zero failed/cancelled/skipped/TODO and independently
proved owned cleanup. No extra check command or verification layer is needed.

Plan review must pass before source edits. No fresh resource availability was
established this turn. The last observed Docker socket was unavailable; real
process census, no-overlap, dependencies and owned fixture safety must be
confirmed through the controller before regression dispatch. Non-PG portions
can progress with explicit unavailable Docker only after the repair passes its
direct assertions. This is a planned capability, not a present passing result.
An uncancelled full/private workload still requires actual successful Docker
census before its first PG suite; original interrupted ownership/LIFO lifecycle
settlement remains required for PG/full integration. Six previously observed
interrupted fixtures are untouched, with cleanup unqualified.

Preserve the acknowledgement task's dependency on this repair, original
delivery2700s/harness14400s and every downstream gate. Full/aggregate, terminal,
independent/final/product, whole-host cleanup, AF-07/UX-01 and X01–X09 remain
pending. Fixture assertions do not qualify real storage/key custody, provider
durability, remote isolation, streaming revocation, SSO, model quality/billing,
devices or production retention/RPO/RTO.

The existing live 81 nondropped tasks cover all96 requirements, with no missing
dependencies or cycles; this revision changes one task's detail/ownership and
check descriptions only. No turn/hour capacity gate or timeout reduction.
Oct13 standing approval covers this plan/team change and any later necessary
F05-only re-freeze; no freeze/re-freeze occurred this turn. No approval-only
action occurred. The independent reviewer retains the explicit read-only
source access granted in readiness, and must issue their own verdict.
