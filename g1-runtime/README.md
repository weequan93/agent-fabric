# G1-F06 runtime contracts and strict runners

This additive package currently implements **f06-01a** (Docker-free contract
kernel), **f06-01b** (shared strict runners and initial harness), and the early
**f06-02a/03a** native admission and durable reservation slices, plus **f06-02b/03b**
Plan persistence and assignment/execution/lifecycle/usage fixtures. It does not implement a production worker, allocator, PostgreSQL queue adapter, remote deployment or
host containment. The [increment plan](../docs/planning/g1-f06-plan.md) and
[approved solution](../docs/loop/agent-fabric-g1-f06-runtime/solution.md) own the
remaining implementation and qualification gates.

Run the strict source **and test** build with `node g1-runtime/scripts/build.mjs`.
Run the current task check through the controller:

```
node g1-runtime/scripts/check-component.mjs contract-kernel --cases C01 C02 C03 C04 C05 C06
```

The check requires an actual process census. If the sandbox refuses it, run the
same command through `loop_check`; there is no bypass switch. Node22.22.3,
pnpm10.18.0 and TypeScript5.9.3 are exact pins. Installation is frozen, offline and
script-free. No Docker/PG/GUI fixture or remote connection is started.

The selector expands all ten registered descendants of C01–C06. Unknown, empty,
duplicate, overlapping and wrong-view selectors fail before build or fixture I/O.
Raw TAP, byte counts, SHA256 digests, the candidate digest, process observations,
unexecuted contract IDs and cleanup outcome are retained in unique `evidence/`
directories. These are partial contract results, not full local qualification.
The full nine-suite check still refuses missing registrations. Other local behavior,
remaining H05–H09/H11–H14 sabotage, original owners and remote qualification belong
to later tasks. This is a partial increment, not whole local qualification.

## Contract decisions (ADR, 2026-10-16)

`src/owners.ts` directly aliases installed foundation, identity, recovery, native,
model and artifact owners. No accepted owner code, guard constant, union or raw
evidence is replaced. `verification/inherited-files.json` supplements those guards
with a turn-start snapshot of 3,767 inherited files, including unrelated dirty F05
work. It is a preservation record, not authority to accept an earlier regression.

`src/schemas.ts` uses the installed hardened decoder: closed keys, descriptor
inspection, safe integers, exact versions, UUIDs/digests/timestamps and immutable
copies. Original recovery generation/effect/receipt schemas remain original.
`src/contracts.ts` specifies cross-record invariants. Decoding never issues a
grant; installed ports validate original object provenance before reading copies.
Tests use private fixture issuers only for the new F06 ports. Foundation scope
provenance and revalidation execute the unchanged original verifier. Real approval
transactions and independent production verifier issuance remain later gates.

Qualification matches exact pins and total registry coverage, rejects blockers and
exact-now expiry, and cannot promote local assurance into Linux assurance. Fixture
matrix rows describe test specimens, not advertised runtime support. Sensitive
browser/input and hostile-process OS containment remain unqualified. Even a
schema-valid approved-host specimen cannot activate a remote connection.

Queue contracts keep assignment, storage, instance and lease distinct. A waiting
ticket is never a lease; cancelled tickets are terminal. Requests bind their entire
sorted resource set (1–32) and immutable original key. Actual cross-process queue
atomicity, allocation and cost observation belong to later tasks.

Effects bind canonical arguments/preconditions, exact original approval, budget,
generation and execution lease. Unknown outcomes route to original lookup with
replay disabled. Original transition functions distinguish effect `unknown` from
Run `reconciling`; direct unknown-to-confirmed is illegal. Read-only settlement
contracts require current private original-actor authority bounded by session/30s,
exact trusted terminal receipt and descendant/stream quiescence. A pure metadata
delta verifier checks original-key/revision CAS and preservation of stopped Run,
binding, lease, session generation and liability; it writes no SQL or second ledger.

Lock contracts preserve entrypoint-specific phase/recovery keys, native Stop's
borrowed edge and fence-only barrier prelocking. Finite trace witnesses cover both
same-key arrival orders with equal/conflicting payloads and deny fence-key
acquisition while blocked on the barrier. ACK-only claim witnesses require the same
original effect instance and a unique invocation slot. These are executable
specifications; actual PG locks, commits, permits and competing processes remain
P02. No universal barrier-first wrapper or borrowed claim COMMIT is introduced.

Plan contracts preserve the original Plan/planning/service parent and a distinct
Ask/maintenance/service child. Installed TaskCallBinding has neither execution class
nor allowance/department fields, so admission and model12 lineage are separate
records. The child retains payer, actor, pins, cost center, parent Task/Run and shared
ancestor allowance family. Physical artifact revision stays 1 while logical document
versions use CAS and new immutable artifacts. Actual model12/F05 transactions,
journal ACKs and reopened bytes remain P04.

The rejected alternatives were copied owner authority, a universal lock wrapper,
directory-only browser isolation, local receipts presented as remote qualification,
and simulated SQL presented as original-owner evidence. Downstream adapters must
satisfy these contracts and their real L/P/X gates; schemas alone do not establish
that the adapters are secure or qualified.

## Shared runners and assertion module interface (turn27)

The following exact task command requires the controller outside the sandbox:

```
node g1-runtime/scripts/check-suites.mjs harness-integrity --cases H01 H02 H03 H04 H10 H15 H16
```

`verification/case-inventory.json` freezes all 5,350 assertion nodes derived from
[test-design22](../docs/loop/agent-fabric-g1-f06-runtime/test-design-turn22/case-subsets.json).
Its digest is fixed in `scripts/inventory.mjs`; no accepted historical guard is
replaced. The nine primary local suites, P children, X descendants, primary levels
and exact component views stay present even before their implementation. A missing
selected module/case fails. `check.mjs` accepts no arguments and requires all nine
suites and every local node. `check-owners.mjs` and `check-remote.mjs` select their
full fixed inventories without arguments; currently both refuse missing adapters
and authorization before builds/connections. Neither can issue qualification.

Each owning task adds its module to `scripts/registrations.mjs`: emitted test file,
exact implemented **leaf** IDs, and required observation kind names. It calls
`tests/helpers/register-cases.ts` with those same IDs and actual assertion functions.
The runner selects a subset by ID and invokes those functions unchanged in either
primary-suite or component views. Each successful function returns an object from
observation kind to concrete assertion details. The helper emits its case result
only after the assertions resolve. Requirements/steps/oracles from parent design
rows remain obligations of each registered leaf; an ID is not evidence by itself.
No assertion module needs to edit `runner.mjs`. Add independently bound observation
requirements when introducing target/queue/recovery/other behavior.

`process.mjs` launches an independent IPC supervisor. Census records actual PID,
PPID, process group (observation only), OS birth time and nonce ancestry. Node
fixtures wait for census acknowledgement before executing. Every Node birth must
match observed ancestry. Cleanup refreshes each instance before signaling it and
never signals a group. Deadline, cancellation or runner disconnection triggers
bounded TERM/KILL cleanup; ambiguity, unobserved birth, stream loss or surviving
owned processes fail. Unrelated processes are excluded from retained inventories.
This cooperative fixture supervisor provides no hostile-process OS containment.

The raw stdout/stderr streams are written as bytes with SHA256 and counts on both
success and failure. Node's actual test-runner event stream is retained separately
from TAP and test stdout. The result gate requires exactly the selected completed
assertions, one final outer summary/plan, no failure/cancel/skip/TODO, and bound
nonce/candidate/process observations. Printed labels cannot satisfy that gate.
Reports include primary suite/level/domain, observation references, raw digests,
unexecuted siblings and all omitted global nodes. Candidate checks run before and
after dispatch. All temporary copied inputs and build caches use nonce/inode-owned
cleanup; negative mutations never touch inherited source/raw evidence. Small
negative fixture programs and their original streams remain in that run's evidence.

The initial H cases test missing/empty/renamed/duplicate inventories; source and
test compiler errors, stale emission and missing JS; real failure/skip/TODO/cancel/
hang/unhandled rejection; false/truncated/duplicate/nested results; missing/forbidden
or unbound observations; real target writes, child census and fixture queue state
reopened after process recreation; runner SIGKILL with independent descendant and
stream cleanup plus an unrelated live sentinel; cancelled/failed/out-of-order
measurement denominators; and protected source/raw **replica** mutation. The fixture
queue is a harness observation specimen, separate from the reservation repository below.

## Native admission and resource repository (turn28)

The exact Docker-free commands are:

```
node g1-runtime/scripts/check-component.mjs admission --cases I00/ask I01 I02 I05/admission I06/admission I07 I08/admission I09/admission
node g1-runtime/scripts/check-component.mjs resources --cases Q00/atomic-ownership Q02/repository Q07/repository Q09/queue-commit
```

`RuntimeAdmission` installs the existing native `SessionLoop`, original TaskEnvelope
parser, and original foundation/F02 scope provenance and currentness functions.
The authenticated HTTP adapter defaults to Ask. Its service composition has only
eligible-source and bounded deterministic model ports, no Space mount, unrestricted
shell, computer or allocator. A separate Act task requires its immutable preflight
and separately persisted synthetic exact acceptance before one bounded target effect.
Authentication precedes dedup/status; current source/model permissions and the
organization/Space/role/envelope/tool/runtime intersection are independent gates.
Actual target observers and two OS clients exercise unchanged-target Ask, accepted
Act, duplicate receipts, altered payloads, expiry/revocation after waits and lost
target ACK. Persisted unknown commands reopen as unknown, preserve work and refuse
replay. The approval port is synthetic: original approval digest/binding is reused,
while PG parties/approval consumption and real human judgment remain later gates.

`ResourceRepository` owns whole sorted reservation sets and original command keys
over a transaction port. Its test-only built-in SQLite adapter uses WAL and
`BEGIN IMMEDIATE`; independent processes exercise A+B/B+A races, current waiting
owner/reason, scoped immutable payloads, cancellation order, exact expiry and
fresh-process reopening. Precommit SIGKILL rolls back; postcommit SIGKILL and lost
ACK recover the original key. Real SQLite busy/read-only errors refuse without
automatic replay. Acquired cancellation/expiry retains the whole set until an
independent release-proof port accepts a fixture proof that no executor is installed.
This reservation is not an execution lease, VM, termination receipt or cost settlement.

These early leaves do not close Plan/artifact persistence, live computer inspection,
all-route tools, continuation, allocator/usage or full recovery siblings. The complete
nine-suite check still refuses missing modules. Local source/data/approval/SQLite
ports share the harness user and cannot establish hostile-process containment.
Remote Linux, original PG/FinOps/F05 owners, actual provider/one-VM cost inventory
and browser/profile/cookie/input/telemetry isolation remain unqualified.

## Plan persistence and execution fixtures (turn29)

`src/plan-persistence.ts` implements the solution §6.1 bridge control flow over
explicit UoW/admission/byte-store ports. The Docker-free I03/I04 fixtures use actual
SQLite transactions and independent processes, with plain synthetic bytes. A save
key derives a new Ask/maintenance/service child from the unchanged Plan parent,
including its payer, actor, cost center, pins and shared ancestor allowance family.
No child is seeded. Durable internal-child lookup rejects general turn, model,
tool, VM and promotion routes; byte publication also needs a private issued permit.
Logical CAS versions each reference a new physical artifact at revision1.

The fixture checks exact v1/v2/recreated-process reads, original-key replay,
same-base and equal-key races, staged/publication rollback, lost commit ACK, actual
process kills and recovery, restricted children, forged fields/links and current
parent/source/payer/grant/expiry/budget refusal before and after waits. Routine
Ask/Plan transcript/audit and explicit allowed memory records use separate durable
records; required audit failure rolls them back. Target/canonical bytes, allocator
calls and original parent records remain unchanged. The fixture bridge conservatively
requires its finite save binding to remain current for reads as well as publication.
These are local port/fixture results, not actual SQL admission, model12 lineage,
F05 encryption/journal acknowledgment, general memory qualification or canonical
promotion authority. The original-owner P04 leaves must repeat against real owners.

Exact task command: `node g1-runtime/scripts/check-component.mjs admission --cases I03 I04`.
The allocator/lifecycle/usage slice and exact controller results are described in
the [turn29 report](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn29/report.md).
Full local nine-suite coverage and external qualification remain pending.

`src/{allocation,lifecycle,usage}.ts` supplies durable one-assignment orchestration
ports, current owned execution, resource-bound promotion CAS, saved-state lifecycle
and explicit fixture-unit accounting. Independent fixture clients execute four
resource conflict classes ×20 trials, with actual target effects and a single
synthetic inventory object. Unknown original create slots only query their original
inventory/key; waiters never create replacements. Hostile/different-privilege work
and unproven computer separation refuse; eligible same-trust service reads proceed.
Queue summaries use a read-only batch snapshot; expiry is projected without writes.
Usage deduplicates Space/payer intervals across actors and leaves task compute
unallocated. Suspend requires no observed drivers/children/resource leases; resume
updates the original allocation slot with fresh instance/boot/grant identity before
useful execution, retaining assignment/storage/provider key. Current fixture launch
checks ticket, owner rows, instance and execution marker under the writer gate.

This shares the host user and cooperative fixture processes; it is no hostile
process boundary, real VM/provider inventory, invoice or Linux suspend proof.
Q08, Q13/unknown-effect, full recovery/07c, original owners and all external gates
remain pending. Exact task command:

```
node g1-runtime/scripts/check-suites.mjs lease-queue --cases Q00/conflicts Q01 Q02 Q03 Q04 Q06 Q07 Q09 Q10 Q11 Q12 Q13/lifecycle
```

The increased independent-client census exposed a shared ACK publication race:
creating the final name before writing let a child observe empty JSON. The supervisor
now writes a unique temporary file and hard-links complete bytes to the final name
without overwrite. Bootstrap additionally requires matching nonce/PID and recorded
OS birth. Original failure streams remain retained; strict census is not bypassed.

## Browser refusal and fixed tool dispatch (turn30)

`src/browser.ts` supplies a scoped authenticated HTTP boundary with **no launch
or sensitive channel ports**. All browser/GUI/shell/SDK/MCP/API/filesystem aliases
refuse login, profiles/cookies, capture/view/input, clipboard, downloads,
recordings/import, takeover/return and submit. Payloads are bounded and discarded;
proof/grant/configuration fields cannot enable a channel. Responses contain no
sensitive request/error bytes and offer a qualified private or human alternative.
Actual independent API/client/sink processes exercise B00–B11 and Q14–Q17,
concurrency and recreation. B12 refusal inputs are included, while its independent
qualification oracle remains07a. Refusal qualifies no positive browser isolation.

`src/{tool-registry,dispatch}.ts` provides finite fixed owned shell/Node SDK/MCP/
filesystem workers. Literal argument data cannot select code, executable, plugin,
endpoint, environment or module. Actual owned resource authorities bound to the
original operation enforce the same exact target/arguments; synthetic protected,
secret, control, socket, DB and external replicas remain unchanged. Useful allowed
bounded effects, denied bypasses, actual MCP stdio lifecycle, output/timeout edges,
original-ID lookup and worker process/scratch/dependency/lease facts are tested.
These are cooperative same-user fixtures, without hostile-process containment.
Browser and egress siblings04b and actual original F03/PG integration remain open.

Exact Docker-free task commands require the controller process census:

```
node g1-runtime/scripts/check-suites.mjs browser-refusal
node g1-runtime/scripts/check-component.mjs tools
```

The additive PostgreSQL migration/repository is **source/build draft only**.
No real owner P02/P05 fixture/registration, PG execution or08a completion is claimed.
The SQL directory is included in the candidate digest, with a copied-input mutation
regression. Do not invoke PG/Docker checks while the human prohibition remains.
See the [turn30 report](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn30/report.md)
and [PG draft handoff](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn30/pg-queue.md).

## Bounded owned HTTP egress and PG drafts (turn31)

`src/egress.ts` adds a finite cooperative HTTP adapter with exact owned read,
accepted write, manual redirect refusal and bounded stream operations. Independent
shell/SDK/actual stdio MCP clients and calibrated destination processes observe
useful effects, before-forwarding refusals, received-and-refused probes, synthetic
credential expiry/revocation, existing stream closure and durable policy state.
Original request/context digests survive unknown results and two fresh API-process
reopenings; authenticated original-ID GET resolves without resending. Browser
aliases continue to refuse before launch. The exact Docker-free task command is:

```
node g1-runtime/scripts/check-suites.mjs tool-paths egress
```

Run through the controller for mandatory actual census. The supervisor freezes
birth-log bytes before its OS snapshot and ACKs each new child only after actual
ancestry/birth observation. H10 deterministically exercises a real birth during
that window, retains runner-loss/sentinel checks, and independently observes no
process residue from prior unconfirmed cleanup. Successful streams must actually
close. Prior failed raw results remain failures.

This is same-user cooperative request mediation and synthetic destination-owner
refusal. It qualifies no arbitrary-child firewall, hostile process isolation,
actual Linux policy backend, real credentials or positive browser isolation.
Local Plan target-write requests refuse; positive Plan/PG/F05 integration is not
claimed by this adapter. Original stopped/expired effect settlement stays06/09.

The08a migration draft adds Task/Run/request/receipt pairing, full canonical alias
set constraints and conflict indexes. Its real-PG-only observer/constraint/race/
installation assertion helpers are unregistered source drafts. No SQL execution,
complete P02/P05 fixture or08a completion is claimed. Read the
[turn31 report](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn31/report.md)
and [PG handoff](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn31/pg-queue.md).

## Fixed owned continuation and Stop (turn32)

`src/continuation.ts` and `src/process-control.ts` install only the cooperative
owned parent/descendant stream fixture. Current private F02 scope, accepted native
envelope, complete generation tuple/boot, required controls, qualification,
mandatory evidence and reservation owner guard dispatch and every target step.
Workers stay paused until actual nonce/birth/ancestry ACK observation; startup
policy changes require a verified new boot before effective activation. The
monotonic lease starts before launch/ACK and is at most30seconds. Renewal can
shorten the fixed fixture lease; unrestricted extension remains unsupported.

```
node g1-runtime/scripts/check-component.mjs continuation --cases A04 A10 A12 A13 A14 A15 A17
```

Use the controller for mandatory actual OS census. The selected cases include
real parent/child/open-stream control loss, required audit/evidence and authority
outage before dispatch and during continuation/actual local lock waits, exact
controlled expiry edges plus an actual30-second run, clock rollback, optional
stale telemetry, unreachable quarantine, native SessionLoop Stop, retained
independent old capability clients and current boot/generation mutation plus
bounded fixture-publication races. Unknown original operations survive adapter
recreation and cannot resend. No caller-supplied PID is ever signaled.

Stop acceptance/dispatch fencing, actual process/stream termination and effect
outcome remain separate. Unreachable control stays quarantined after rejected
renewals; eventual absence does not invent a missing acknowledgement or release
resources. Native Stop uses an explicitly synthetic cancellation owner and the
unchanged SessionLoop. The successor test owner is a controlled local fixture,
not the original F03/PG settlement/queue transfer. Bounded fixture publication is
not original F05 artifact promotion. All effect outcomes/costs remain unknown,
all unresolved holds remain conservative, and Linux/hostile-child isolation,
original owners and complete recovery/timing distribution remain unqualified.

The08a installation retry now refuses incompatible/empty installed ledgers
without silently repairing ACLs. New PG corruption/observer/wait helpers remain
unregistered, source/build-only and unexecuted. Docker/PG checks are prohibited.
See the [turn32 report](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn32/report.md)
and [PG source handoff](../docs/loop/agent-fabric-g1-f06-runtime/develop-turn32/pg-queue.md).
