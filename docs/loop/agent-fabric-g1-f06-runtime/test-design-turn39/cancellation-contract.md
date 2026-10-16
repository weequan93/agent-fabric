# Cancellation and birth-observation test contract

Design only. This refines H08/H14/H15 under R-003, R-016 and R-018; it adds no
product requirement, changes no existing inventory ID and drops no earlier
oracle. Existing levels remain **integration for H08/H15** and **security for
H14**; suite: **harness-integrity**, domain: owned local fixtures. All cases below are required future owning assertion bodies. The
two-scene diagnostic is explicitly a counterexample, not their implementation.

## Actors, barriers and evidence

Each case creates an independent runner R, supervisor S, workload parent P,
descendant C and unrelated owned sentinel U. Cases needing a late descendant add
G. A case owns fresh directories, nonce, actor IDs and raw files. U is outside
S's proven ancestry and can share its actual process group: no process-group
signal is permitted. All actors have a bounded independent self-expiry; waiting
for that expiry does not satisfy timely supervisor cleanup. Actual test cleanup
uses the current OS birth tuple and fails rather than signaling an ambiguous
PID. No arbitrary executable, external target or user data is involved.

Future fixtures must expose these **test-only** barriers in an owned copy, using
the existing exerciseBirthSnapshotRace copy/injection convention. Publish the
copy's exact diff, input source hash and gate event records. The production
supervisor must not accept an environment flag that disables validation. Hooks
may pause or release these boundaries; they may not fabricate OS rows, accepted
ACKs, process exits, cleanup success or case observations:

| Event | Meaning and required independently observed fact |
| --- | --- |
| B0 | An actual spawn has occurred; bootstrap is held before birth-log append. P is kept alive until its real parent/child link is observed. |
| B1 | Complete birth record appended; no user body has run. Freeze exact log prefix bytes/hash. |
| O0/O1 | Actual census requested/returned. Save returned OS rows, their time and actual PID/PPID/birth/command. |
| A0/A1 | ACK publication about to occur/atomically published for a proved live birth. Save original ACK bytes. |
| W | Actor's user body enters and publishes its own readiness marker. W must follow valid A1. |
| F | Cancellation, deadline or runner-disconnect trigger is accepted once. Save its cause/time; subsequent triggers cannot reset a deadline. |
| T | Each per-instance signal is about to issue; take a fresh actual census and verify unchanged ownership before issuing it. |
| Z | Final actual census and stream-close observation, with complete started-child denominator and retained integrity failures. |

The parent test releases gates based on these events/IPC/file records, not elapsed
sleep or waiter fairness. Short test-only deadlines bound a disposable child;
they do not change any product grant/lease, original owner bound or suite limit.
Every gate has a failure deadline and an independent recovery path. A root failure
must not leave a gate waiting forever. No risky ramp starts until these cases
and the subsequent exact aggregate pass on a fresh candidate.

## Required separation of outcomes

Integrity and resource cleanup are different observations. A malformed,
foreign-nonce, missing-ACK, incomplete raw, cancellation or timeout error
permanently fails that product invocation. Cleaning a known process later never
erases that failure or turns its timing sample into success. Conversely, an
integrity error must not abort attempts to stop **other already-proved owned
instances**. A later current census can prove current absence only.

No birth log alone authorizes a signal or ACK. Newly observed ancestry must bind
to a still-proved live parent and its actual current birth. A previously proved
child may remain owned after reparenting, but a new orphan carrying only a nonce
does not become proved merely because its title resembles the runner. An
unresolved/unproved live process, unusable census, mismatched birth or incomplete
stream keeps whole-resource cleanup unconfirmed and quarantines the invocation;
there is no blind PID/PGID kill. Preserve any failure while cleaning known actors.

After F, no new useful test work may start. A cooperative bootstrap that is
already blocked must either remain blocked until removed, or receive an explicit
teardown instruction; it must not be granted permission to enter W during
cleanup. This does not add a hostile-process containment claim to local fixtures.

## Exact cases to implement

Common preconditions are the independent actors/gates above and a current bound
candidate. Each row needs its own actual execution and gate trace. Positive
controls do not supply the negative row's cleanup or current census. Unless a
row specifies otherwise, data includes exact frozen birth prefix, all actual OS
snapshots, ACK bytes, actor readiness markers, signal tuples, raw streams/hash,
stream-close events, immutable supervisor result and separate recovery result.

| Case body / owning ID | Steps and additional data | Expected result and failing oracle |
| --- | --- | --- |
| CB01 / H08/full | B1 before O0; keep C alive through O1/A1; enter W then ordinary completion. | C is independently proved and ACKed once; actual complete raw and no residue. Wrong/missing ACK or unproved W fails. |
| CB02 / H08/full | Freeze prefix, then create/log C before O0; first O1 includes C but frozen prefix does not. Take a new observation before A1/W. | No stale-prefix assertion failure; no invented birth record. Current later observation pairs actual birth and log. |
| CB03 / H08/full | Freeze prefix and complete O1, then append actual C birth before observe returns. Keep P alive. | No ACK based on older OS rows; C remains blocked until next proving census. Existing birth-snapshot-race control is retained freshly. |
| CB04 / H08/full | Hold C at B0, establish its actual ancestry; accept F, release only teardown. | Known C/P are removed, W remains absent; user-body startup during cancellation fails even if later cleanup is empty. |
| CB05 / H08/full | B1 then actual C exit before O0; P remains known; accept F. | No synthetic ACK for dead C. Retain missing-ACK integrity failure and fresh absence; still remove known P. Record actual exit/OS absence, not an assumed TTL. |
| CB06 / H08/full | Prove C in O1, hold A0, cause real exit then accept F. | No stale ACK or user work; known survivors are cleaned. Exited-before-ACK cannot suppress their cleanup. |
| CB07 / H08/full | C reaches W after A1; cancel with root and child actually live. | Wrapper/invocation fails cancellation; cleanup confirms true only after known tree absent and actual streams close. Unrelated U remains live. This control was observed by the turn39 diagnostic. |
| CB08 / H08/full | After valid P/C ACK/W, append one wrong-nonce record for C into the owned log; accept F. | Permanent integrity failure, but known P/C cleanup is attempted and completes without outside rescue. Existing source instead short-circuits; turn39 observes both actors alive/zero signals. U survives. |
| CB09 / H08/full | As CB08, append truncated/malformed JSON (a separate original per corruption variant). | Parse failure retained; proved tree cleanup still attempted; raw never promoted to complete if streams did not actually close. |
| CB10 / H08/full | Append a record with wrong PPID, or name actual unrelated U as a descendant; each on its own history. | No ACK/adoption/signal for the unproved record; known P/C cleaned, integrity fails and U remains live. A nonce/title alone is insufficient. |
| CC01 / H14/full | Hold real C at B0/B1/O1/A0/A1/W in six **separate runs**; at each barrier kill only owned R or disconnect its IPC. | Independent S accepts F, stops useful work, cleans proved tree despite absent runner. Preserve disconnect failure and every started child; six traces required, no one happy run for six labels. |
| CC02 / H14/full | During SIGTERM of known P, let its handler spawn G. Hold P alive until actual ancestry census proves G, then release P exit. | Repeated teardown discovers/stops G using actual proof, never acknowledges useful G work; final empty census/closed inherited streams required. |
| CC03 / H14/full | Alternative to CC02: exit P before G is ever independently proved; G publishes a nonce birth and is reparented. | No blind ACK/adoption/signal. Cleanup remains unconfirmed while G is unresolved; known other actors still cleaned. A separately proved independent guardian can recover its own G; historical product result stays failed. |
| CC04 / H14/full | Force a false historical birth for U's **actual current PID** and invoke the real current-instance/ownership gate. Separately test same birth/forged nonce and valid known controls. | Reject before signal; U's heartbeat/actual current birth survives. This deterministically tests reused-birth refusal against a live process, and MUST NOT be reported as actual OS PID reuse. True OS-reuse stress is optional additional evidence. |
| CC05 / H14/full | In an owned instrumented copy make one actual census command fail, return malformed bytes or exceed its existing bound; each independent failure after known P/C acknowledged. | No pass or unproved signal; retain raw/error and unconfirmed state until fresh OS proof is available. Once census recovers, cleanup attempts for known actors proceed; no historical result rewrite or deadline reset. |
| CC06 / H14/full | Accept F by cancel, timeout and runner disconnect in controlled successive orders while an existing finalization gate is held. | One immutable result, no duplicate finalization/ACK/new useful work; all triggers/causes retained. No timer reset/extension; existing wrappers fail. |
| CE01 / H15/full | Cancel one actual child after other partitions have completed; separately fail it on CB08, raw truncation and cleanup uncertainty. | Full started/success/failed/cancelled denominator preserved; union may not pass or reuse earlier results. All failed raw remain. |
| CE02 / H15/full | Take an actual failed result and build-cache cleanup success; feed owned collector replicas that omit one failed child, replace tree cleanup with build cleanup, or set success on missing streams. | Collector rejects every replica. Legitimate complete negative invocation remains failed, with separate build/process/stream/raw results. |
| CE03 / H15/full | Recompute fresh census after failed cleanup, then independently clean a proved remaining actor. Record both before/after and historical report hashes. | Current residue can resolve, but historical failure/cleanup:false and measured failure stay unchanged. Any rewrite or success-only timing denominator fails. |
| CE04 / H15/full | Fail one late partition while another child is held just before launch/restart; let logical deadline expire near final raw/cleanup. | No new partition after failure; no fresh inner deadline, cached pass, cleanup grace counted as passing work or retry under same invocation. Entire invocation fails with pending/started branches explicit. |

CC01 contains six independent runner-loss journeys; CB09/CB10/CC05 and CE rows
contain all named corruption/failure variants. The **20 body labels are not a
20-journey upper bound**. Every variant must appear as a separate branch in the
future execution manifest with actual raw/gate provenance. One repeated label
cannot alias their observations. H04 remains its distinct TAP-decoder case.

## Commands and evidence status

Future product assertion gate (unchanged proposal, 300s outer; harness suite
retains its 120s inner):

`node g1-runtime/scripts/check-suites.mjs harness-integrity --cases H08 H14 H15`

H08/H14 are not yet registered, so no current pass is claimed. H15 existing
measurement-denominator tests do not implement the new bodies. The complete
original harness/full local gates must freshly rerun all owning cases after
implementation. This diagnostic is not a replacement for those checks.

Docs-owned present diagnostic, controller outside sandbox, 60s diagnostic ceiling:

`node docs/loop/agent-fabric-g1-f06-runtime/test-design-turn39/cancellation-probe.mjs`

It calls unchanged process/supervisor/bootstrap/census code directly, uses actual
OS processes, tests only CB07 and a CB08 counterexample, and performs separately
guarded recovery. It does not build/execute the runtime product test suite or
exercise the complete natural CB02–CB06/CC02–CC03 cancellation schedules. A zero
exit means the expected defect and recovery were observed, not H08/H14 passing.
Neither a same-user cooperative fixture nor the sentinel proves hostile Linux,
browser/input isolation or deployment qualification. No network, Docker or real
credential is used.
