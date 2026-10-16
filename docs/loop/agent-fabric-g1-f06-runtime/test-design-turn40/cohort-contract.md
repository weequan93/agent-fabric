# Cohort fixture composition: proposed, unimplemented

This is a design alternative to turn37's process-per-lane composition. It is
not a measured schedule, product code, namespace-isolation pass or budget change.
PR-F06-08/09 remain open. No cohort may run until turn39's complete H08/H14/H15
cancellation gate passes on its actual candidate. Existing test-plan §15.2 permits
shared service infrastructure, while requiring independent mutable histories.

## Actual runner and owning assertions

Keep one logical recovery-stop invocation and its single absolute deadline.
The future runner applies ONLY the approved recovery-stop 300s inner ceiling;
all other suites retain 120s. No cohort receives a new suite deadline. The
continuation command still has 300s from command start, including build, all
selected suites, raw verification and cleanup. The original c/d 480s commands,
authority/recovery 480s command, local 900/1800s and P600/X900s gates remain.

The existing `--test-concurrency=1` and one real top-level Node test per selected
inventory leaf can remain. A fixture manager prepares a bounded cohort of
**independent originals**, then each owning test consumes its own prepared
history. Preparation is actual admission, claim, send/lost-ACK, live child/stream,
Stop or real expiry and service recreation. It is not execution of another
case's negative or restored-success callback. No callback returns a previously
completed assertion, and no confirmed/terminal row is seeded or rewound.

At the first case of each cohort, before its owning callback, prepare only that
cohort's exact manifest branches. Future cases have not run assertions or
produced pass records. Every owning callback independently checks its original
admission/receipt/Stop/expiry/process history and current target/owner state,
executes its actual negative/race/fault, freshly authenticates and GETs after
restoration, settles legally and performs its own distinct useful successor.
Branches requiring their own fault during setup use an independent setup recipe;
the ordinary acknowledged-send recipe cannot stand for lost claim-COMMIT ACK.
Shared preparation must remain inside the suite and whole-command deadlines.

Cases with multiple branch originals (including the pilot's 4/4/3/3/4 fields)
stay indivisible owning tests. Never split their bodies between separately
passing tests or dispatches. The assignment artifact groups consecutive cases
without splitting branches. Its width is a branch-count limit, not a count of
Node supervisors or a product concurrency allowance. No case larger than the
chosen width can be scheduled until explicitly enlarged/split without changing
its oracle, resourced and measured; it must not overflow silently.

## State, services and process epochs

| Item | Shared infrastructure | Independent per branch; failure oracle |
| --- | --- | --- |
| Build and key templates | One current strict build; immutable schema/source/key template. | Candidate/selection/raw identity per command. No earlier receipt supplies a pass. Mutable JWKS, verifier/session and authority caches cannot cross scopes. |
| Target listener | One owned loopback process with a closed namespace router. | Separate target file/value, write/get/denied counters, stream table, original receipt, enrolled connector and read/write/admin credentials. Requests bind exact namespace AND operation/binding. No global target `value` or aggregate counter proves another branch. |
| Admission/authority | One process may host separately constructed scope services. | Unique tenant/Space/resource/actor/session, current authority/intersection, approval/store/budget, exact bindings and fault map. Immutable keys alone confer no shared authority. Namespace dispatch precedes any owner lookup or mutable cache. |
| Original and successor | Read-only recipe only. | Actual original Task/Run/effect/lease/accounting/unknown liability and separately admitted useful successor. No reused admission, reservation, confirmation, private observation or outcome. |
| Live workload | Supervisor and bootstrap code only. | Each original retains its own actual P/C births, owned resource and stream, valid-before-send timestamps and unchanged 3s expiry when required. One multiplexed actor/stream cannot count as many originals. |
| Recovery epoch | One newly spawned OS service can reload all disjoint cohort stores. | Every original records old and new service births and fresh original-key load. The old process must actually exit. New objects in the old process fail. Cohorts use new process epochs; tests cannot borrow historical restart flags. |
| Currentness/race/fault state | Gate implementation only. | Per-original current lookups, barriers, transactions, receipts and current census/stream checks after every required boundary. Distinct committed outcomes use distinct originals. |
| Finalization | Supervisor/census implementation only. | All started and pending branches, child births and streams accounted; failed setup is a failed invocation even if no test registered yet. Retain raw and independently clean known instances. |

Current `settlement-target.ts` has a target-wide `value`, denied counter and root
file; `settlement-fixture.ts` has a mutable global config/fault/binding object;
`admission-fixture.ts` uses fixed scope/resource IDs. They are **not** the proposed
namespace router and must not simply be shared. Process co-location creates a
common failure domain; it provides no hostile-process isolation assurance.

## Ordered cohort protocol

1. Freeze exact selected case/branch manifest. Allocate independent scope/store/
   credential namespaces and prelaunch each cooperative P/C bootstrap blocked
   before useful work. Save actual birth proof. Prelaunch confers no lease,
   permission to send or privilege; unsupported prebinding fails closed.
2. Actually admit/approve/issue each original with the unchanged bound expiry,
   then bind its already-live blocked actor to the exact original and release
   useful work only after current authority/claim ACK. Independently observe its
   real one-write/lost-ACK and stream. Failure to send while valid fails the
   invocation; do not extend/backdate a grant or retry under a new original.
3. Stop-only originals obtain their own real Stop receipts. Each expiry original
   crosses its own actual issue/expiry interval with its own live workload and
   independent cessation observer. Overlap of elapsed intervals is permissible
   only across proven independent scopes/resources. Lease-only/effect-only must
   retain the other grant live at the required observations; unintended expiry
   of the other grant fails the path. Never edit its 25s fixture lifetime.
4. After every required old actor/stream is proved quiescent, close the cohort's
   original service, observe actual exit and start the recovery OS epoch against
   original stores. Fault/race recipes that require retained live descendants or
   streams perform their own controlled branches; do not falsely prepare them
   as already quiescent. Such recipes may prevent cohort sharing entirely.
5. Run each exact owning callback serially, with live observations as above.
   Every field/restored result remains distinct. Stop/generation races and
   prepared/dispatched/unknown/reconciling/confirmed/conflicting-confirmed states
   retain independent legal histories. COMMIT/ACK faults use actual fault and
   new-process lookup; they cannot be represented by callback return values.
6. On any setup/test/raw/census/cleanup failure, forbid further cohort setup or
   useful work. Retain full started/unstarted/failed/cancelled denominator, clean
   already-proved actors, quarantine unresolved ownership. Never start the next
   cohort to try for a green union. Confirm teardown before the next cohort.

Prelaunch and service co-location are proposals requiring their own real
positive/negative tests. If current adapters cannot bind prelaunched actors
without broadening authority, use independent ordinary launch; the measured
timing model must then include its actual issue-to-send cost.

## Required anti-interference bodies

All are refinements of existing H10/H14/H15 in harness-integrity, F1/F3/F7/F11,
owned local fixtures. Each row is a separate actual body with fresh two-namespace
data and candidate/raw/actor/target provenance, not a structural-schema pass.

| Body / owner; level | Steps | Expected result / failing oracle |
| --- | --- | --- |
| CO01 / H14; security | Enroll two actual originals; cross namespace, read/write/admin credential, operation and binding separately, then send exact legitimate controls. | Every crossed request causes zero unauthorized read/write/stream/change. Each legitimate branch progresses with its own actual bytes and one write. Every crossing is a separate request/history when mutation is irreversible. |
| CO02 / H10; security | Revoke only A's current session/policy/approval/budget/fault state, one dimension per original. Attempt A and B through actual router; restore A and use fresh eligible reads. | A refuses and B remains useful, no copied authority/cache. Current rechecks after wait/I/O/precommit still apply. Each original has its own restored GET/successor. |
| CO03 / H14; security | Expire/Stop A while B is actually active; cross birth/quiescence/stream proofs; retain unrelated sentinel. | No A proof settles B; B is not signaled/fenced by A. A's exact live/ceased stream observations remain distinct. Current sentinel birth survives. |
| CO04 / H10; security | Restart actual shared service with separate durable A/B stores. Attempt A handle against B before and after restart; execute own-key fresh recovery of each. | Old service actually absent; new birth recorded per original. No inherited private permit/observation, namespace crossover or fake object recreation. Each useful successor writes separately. |
| CO05 / H15; integration | Fail one actual cohort setup before registration, one middle owning test, and one final raw/cleanup step in separate runs. | Complete invocation fails each time with all prestarted and pending branches retained; no next cohort launch or cached successful prefix. Cleanup and build cleanup stay separate. |
| CO06 / H10; security | Supply owned collector copies containing A's complete true target/GET/successor/census details under B's ID, omit B's actor or merge target-wide value/counters. | Actual observation verifier rejects each alias. Genuine A/B records pass only with separate actual operations, target namespaces and current observations. This collector sabotage does not prove router isolation. |

Future gate (300s outer, harness120s inner; unimplemented additions):
`node g1-runtime/scripts/check-suites.mjs harness-integrity --cases H10 H14 H15`
plus complete turn39 cancellation gate and original pilot/full gates. No current
pass is claimed. Full local freshly repeats the complete owning cases.

## Honest timing and resource model

For cohort w record separate measured preparation, actual overlap intervals,
recovery epoch startup, serial owning callbacks, raw verification and teardown.
An interval union is valid only with per-original live-workload/issue/expiry
witnesses. `max(3s)` is a mathematical wait floor, never a cohort runtime bound.
Every planned variant/state/fault branch must be in the manifest before a bound
can be an upper bound. The 2,488 reference journeys remain only a lower bound;
turn38 nonmatrix ledger and turn39 cancellation variants remain additional work.

Continuation feasibility requires:

`build + selected-other-suite work + all cohort work + remaining recovery work
 + serial A12/R19 complete bodies + raw/census/cleanup <= 300s`.

The A12/R19 observation floor is 121s, leaving at most179s for ALL other work;
exclusive measurement forbids overlapping those samples with cohort work.
Recovery suite elapsed <=300s, every other selected suite <=120s, and R20 remains
in authority-intent with its warmup/100 commands/visibility/three cold samples/
2000 resamples and whole120s suite. Full gates run fresh bodies, not receipts.

For c and d there is no 121s observation subtraction unless selected, but their
recovery suite still has the logical300s cap inside480s outer. Reassess complete
local nine-suite scheduling plus the same A12/R19/R20 bodies. P/X remain unmeasured
and unavailable; neither can inherit local namespaces/concurrency or timing.
X's one VM serializes conflicting resources and retains original P transactions,
2s locks/5s statements and actual costs. No P/X task becomes done here.

Record current process count, CPU/load, descriptors, raw/disk growth, sumRSS and
independent current free memory. Sharing listeners/supervisors removes overhead
only; it does not remove the 2 actual workload actors per concurrent original.
Widths4/8/16/32/64 in the static artifact are alternatives, NOT launch permission
or capacity predictions. Any later bounded ramp starts small after cancellation
and anti-interference gates, retains failed rungs, stops at pressure and needs
measured whole-command timing. No further budget amendment is inferred.
