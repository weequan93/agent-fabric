# Turn39 test-design handoff

Stage remains **incomplete**. PR-F06-08 and PR-F06-09 stay open. No stage_done or
product implementation/task closure. Current source candidate remains
`sha256:7089d81f4ccd5f1d9ac6a2674c1a20e521bbd6f4039dd9da41394f3e91f7ebb4`.

The concrete result is a reproducible cleanup short-circuit. The docs-owned
[probe](cancellation-probe.mjs) calls unchanged runtime supervisor code on a
bounded actual parent/child tree, with independent real birth/ACK proof and an
unrelated owned live sentinel. Valid-prefix cancellation is the positive cleanup
control and still fails the wrapper. A deliberately invalid-nonce birth record
in a separate scene makes strict observe() throw at the beginning of cleanup,
before it signals already-proved actors. Both actors remain live; the supervisor
immutably reports cleanup:false/streamsComplete:false/signals:0. Separate guarded
same-birth SIGTERM recovery removes both, preserves the unrelated sentinel after
each scene, and then tears down that sentinel explicitly. Final known/nonce
census is empty. The failed product outcome remains failed.

Controller precheck job-13454408d5 PASS2915ms and required task-completion
job-4053092113 PASS3045ms each observe the counterexample/control/recovery. A green
diagnostic means the expected defect was observed, not repaired product success,
H08/H14/H15 completion or full workload fit. The diagnostic task alone is done.
Controller14/70 done includes two incident/design diagnostics; no further product
task is complete. The profile task remains failed/pending,06c active under NO-GO,
06d/e pending and08a source-only under the Docker prohibition.

Initial collector job-5c67fcb71b FAIL13594ms and
[original collector](cancellation-probe-attempt1.mjs)/raw are retained. It awaited
wrapper close before recovering actors; failed supervisor child handles delayed
close until actor self-expiry. A transient changed command during reaping was
correctly not signaled, but the collector then failed before its second sentinel
check. Its final current census was empty. Corrected collection waits for the
immutable report, performs recovery before wrapper close, and requires fresh
absence rather than signaling a changed command. All original failed reports are
still present and unchanged. No product repair or budget change occurred.

[Cancellation contract](cancellation-contract.md) and
[case manifest](cancellation-cases.json) specify20 exact future owning bodies with
their existing H08/H14/H15 suite/levels, preconditions, gate order, data, failing
oracle and command. Multiple corruption/window variants require separate actual
journeys;20 is not an upper-bound workload. Exact source-copy gates follow the
existing birth-snapshot fixture convention and may orchestrate real events only.
Known actors must be cleaned despite integrity failure; unresolved or reused-PID
ownership cannot authorize blind signals. No useful work/ACK may start after
cancellation. Raw/stream/process/build cleanup and failed denominator remain
separate. H04 remains its TAP-decoder case. This probe covers only CB07 and the
CB08 counterexample; natural orphan/birth timing cases remain unexecuted.

Updated test-plan §18, readiness/planning NO-GO overlays and appended to living
F06 acceptance evidence. [Proposal](proposed-task-payload.json) retains all15
one-lead rows and exact original c/d/e checks/dependencies/covers. Cancellation
estimate45–85min+5min whole check+10reserve=100min upper; totals610–1065min
work+124min checks+150reserve=884–1339min/max row108. These estimates are NOT
independently sized or officially submitted. Only the one-off diagnostic was
added via loop_plan(final=false); official product subdivision/task-plan snapshot
still needs plan/resources/review. The full H08/H14/H15 command is not currently
implemented and its120s inner/300s outer fit remains unproved.

Read-only raw/design audit verifies10,565 prior file identities except four
intentional living document changes, prior acceptance prefix and entire prior
test-plan prefix. It preserves all101 requirement mappings/142 families/29 owner
children/5,350 IDs and all pre-existing runtime source/raw evidence. Six groups
also check all three new run reports/raw/ACKs, original failed denominator,
separate recovery, per-case levels and exact unchanged aggregate check proposal.
This is document/raw diagnostics, not product acceptance. Syntax/scoped whitespace
checks apply only to this turn's files. No product build is run by this specimen.

[Controller history](controller-history.json) preserves original job verdicts
fail/pass/pass from controller jobs/events. Later
[loop_check requery replies](controller-results.json) surprisingly return the
latest shared check result even for old job IDs: they show3045ms/pass for all
three. They are retained but MUST NOT replace historical verdicts/durations.
Original contemporaneous tool responses established13594/2915/3045ms, and the
controller's own jobs[].results/job.finished events still retain fail/pass/pass.
No controller code/state is edited to address this tooling limitation.

No Docker CLI/daemon/container/PG check, GUI/other app, remote/network/paid
resource, real credential/security/settings change, communication, sub-agent,
freeze/re-freeze or manual .loop edit. Standing local approval covers the owned
diagnostics. Recovery-only300s remains the exact prior human-approved future
inner change; source still120s. All outer bounds/samples remain. Remote stays
unapproved. Linux/image/hostile worker/tool/egress, actual one-VM cost/queue and
positive sensitive browser profile/cookie/input/telemetry isolation remain
unqualified. Turn38 historical failures and five retained fixture roots remain.

Next meaningful design step: a lower-footprint independent composition with all
matrix/state/nonmatrix branch costs and complete fresh-command timing. The
four-lane result is not sufficient; no unmeasured32/64 ramp, linear throughput
claim or maximum-host conclusion. Then submit complete test design and formally
repartition remaining work through plan→independent resources→plan review. Do
not implement the known oversized06c parent or repeat already answered human
questions. If further exact budget amendment becomes demonstrably necessary,
use loop_ask with the actual constraint; no new approval is inferred here.
