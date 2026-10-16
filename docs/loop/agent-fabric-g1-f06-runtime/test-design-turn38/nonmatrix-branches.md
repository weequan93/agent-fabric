# Continuation obligations outside the settlement matrix

This is a design branch ledger, not elapsed-time evidence or an upper bound. The
2,475 settlement IDs and at least 2,488 real original journeys in turn37 remain
unchanged. These ten additional recovery IDs and two other-suite IDs are in the
same 300-second continuation command. A label does not account for its actors,
attempts, waits, currentness checks, negative observations, recovery or cleanup.

Every row inherits the named requirement's suite/level, F1–F13 preconditions,
and exact command in test-plan.md. A diagnostic is not the row's full test.
Functional rows may overlap only in independent fixture universes. Exclusive
measurement rows never overlap functional rows, another measurement, build or
other check activity. A restored condition never authorizes replay of a stopped,
expired, already sent or unknown original.

| Exact owning ID; level | Required actual actor/history branches and recovery | Required independent observations/data | Scheduling and missing cost |
| --- | --- | --- | --- |
| A04/full; security | For EACH installed mandatory control: refuse before launch, restore and start a valid original, remove it while child/stream is active, observe fence/cessation or quarantine. Separate qualification expiry before and during work. Deny local/weaker/other-region fallback. Current unaffected eligible control succeeds. | Seven current controls: owned-process, owned-descendants, broker, authority, required-audit, required-evidence, monotonic-watchdog; actual target/process/stream, qualification and launch inventory. Preserve original uncertainty after loss; no restart from a checkpoint alone. | Functional; current implementation contains seven control fixture histories plus a qualification history. Future added mandatory controls expand this denominator. Measure all setup/control-loss/expiry/refusal/recovery/cleanup; no upper bound yet. |
| A10/full; integration | Active old generation becomes pending; old and prematurely new claims refuse. First new boot independently fails validation and causes zero target effects. After observed quiescence, separately enrolled fresh operation/boot activates only after validation; old boot remains denied. | At least old, failed and useful fresh operation identities, generation tuples, desired/effective policy, target launch/activation order and each boot/process census. | Functional; actual startup attempts and teardown cannot be represented by one generation-field assertion. Profile failed and successful activation separately. |
| A12/full; security | Exact before/at/after deterministic boundaries and invalid leases; independent real elapsed 1s AND 30s disconnected lease runs with live child/stream. Renewal denial, wall rollback and old-boot/reboot refusal. | Trusted monotonic issue/expiry/last-privilege stamps, independent cessation observer, actual attempts and ambiguity bounds, current original lease and boot IDs. | Exclusive. Minimum real elapsed lifetime is31s, BEFORE setup/requests/cessation/cleanup. Existing short renewed lease in source is not the required1s sample and receives no such credit. |
| A14/full; integration | For required audit and evidence separately: outage before dispatch AND renewal/continuation; valid start after pre-effect restoration, subsequent outage fences ongoing work. Restore sink without replaying original unknown effect. Separate noncritical heartbeat/usage gaps while allowed work actually progresses. | Separate required-sink histories and optional-gap history; durable required evidence, target bytes/effect attempts, process/stream state; optional usage remains stale/unknown. | Functional; normal optional gaps cannot stand for failed required sinks. Before-renewal and post-start outage branches remain mandatory even if source currently covers only a subset. |
| A15/full; integration | Lose control/heartbeat while owner is alive; observe unknown/quarantine and refused replacement/renewal. Later actual owner absence without authenticated termination acknowledgement remains unknown/held. Query original identity; safe recovery/progress requires separately observed quiescence and original reconciliation, never disappearance alone. | Alive-at-loss census, later fresh birth-aware absence, dropped control ACK, original target/effect identity, held assignment and denied replacement. Preserve unresolvable branch alongside separate resolvable control. | Functional; live-loss and later-absence are successive observations of the same history. Unresolvable and resolvable outcomes require separate originals; no state rewind. Cost unmeasured. |
| A16/executable-continuation-currentness; security | New OS owner loads checkpoint. Individually revoke current identity/membership, policy, exact approval and remaining budget; each denies resumed effects. Restore legitimate current conditions and reauthorize/reacquire for the executable control. A stopped/expired original must use settlement instead. | Durable checkpoint and original IDs, actual independent service births/current lookups/lease reacquisition; target counters for each denied request and useful legitimate control. | Functional; at least the five named currentness dimensions retain their separate attempts. Fields with incompatible committed outcomes require distinct originals. Source checkpoint JSON alone is not evidence. |
| A17/full; security | Stop old owned parent/child/stream and keep unrelated owned sentinel alive. Recreated/current successor cannot run while resource held. After safe transfer, race retained old worker, recreated adapter, scalar/wrong tuple and old boot against actual useful new mutation AND publication; both arrival orders and required repeated trials remain. | Distinct client processes/handles, actual F03 tuple seam, per-attempt target and publication state, original and successor operation/generation IDs, live sentinel and cleanup provenance. | Functional with trial sequence within its universe. No speculative disjoint computer writers. Cost includes both ordered barriers plus20 old/new race-kind trials where applicable, not just one Promise.all. Real F05/P proof remains separate. |
| A18/legacy-release-expiry-resend-new-key-unavailable-lookup; integration | Retain release versus expiry, old send and new-key attempts, actual target-accepted/lost-ACK original and new-process original-key lookup unavailable then restored. Unknown keeps held ownership/replay denied. Fresh exact lookup/metadata and safe useful distinct successor resolve only the genuinely provable branch. | Every old/new key, durable receipt, actual sends/GET counts, unavailable lookup and fresh restored response, original accounting and held owner history. | Functional; separate immutable histories for release-first/expiry-first or incompatible committed outcomes. Existing base paths cannot supply this sibling's old probes or recovery observations. |
| R18/native-monotonic-stop-parent-child-stale-progress-and-unrelated-pid; integration | Independent dispatchers versus duplicate Stop; parent/child run and stale progress revisions; current Stop grants/ACK loss. Observe original monotonic F03 generation and both snapshot orders, actual descendant/stream cessation and unrelated sentinel. Preserve same-key receipt history across new OS service. | Both controlled Stop/dispatch orderings plus20 Stop/dispatch trials, original keys/Stop receipts, target attempts and accepted/fenced times, birth-aware parent/child/sentinel identities. | Functional correctness race samples, distinct from R19's performance denominator. Two sample sets cannot borrow outcomes. Unknown or missing ACK cannot be reported terminated. |
| R19/full; performance | All30 serial online Stop trials. Two independent clients offer every20ms around each accepted Stop and continue3s after acceptance. Include zero-after-acceptance and stale-view duplicate Stop. Every trial records termination separately and retains failures/cancellations. | One trusted executor/collector monotonic domain; raw offers, acceptance/fence/Stop/termination timestamps, immutable causal IDs, actual observer and full denominator. p95/max/interval reports as required. | Exclusive. At least90s post-acceptance observation ALONE; setup, pre-accept offers, Stop request/ACK, quiescence and cleanup add cost. Parallel functional fixtures cannot consume this interval. |
| A11/full; security; egress suite | Revoke policy/grant midstream and recreate generation; direct IP/DNS/redirect/method/body/size/child/broker bypass attempts and bounded allowed control. Prevent continued target effects after revocation, retain required actual network/target observations. | Actual loopback endpoints/streams, original pin/grant/current generation, per-attempt destination counters and full raw requests; source A11 + E rows retain all earlier limits. | Other suite,120s inner. Selected by continuation; complete A11 cost belongs inside the same300s outer command. Cannot import a prior egress-suite receipt. |
| A13/full; security; authority-intent suite | Current authority unavailable/revoked before write AND native read; after real owner lock wait and current-lookup wait; lose authority mid-run and fence parent/descendant. Deny revoked read/renewal and unknown replay, then valid fresh scope useful distinct successor. | Actual lock waiter/barrier, independently launched clients, current owner lookups and scope identity, actual read/model/source call and target/process counts. | Other suite,120s inner. Fresh complete body within continuation, including every negative and restored useful control. Pending PG owner authority remains unqualified. |

R20/full is **outside continuation**, but remains mandatory in full
authority-intent + recovery-stop and full local. It needs a retained separate
warm-up,100 command/status records (50 sequential and50 from four independent
clients), visibility records, all failures/cancellations in denominator, nearest
rank p95, fixed-seed2,000 bootstrap resamples, and at least three independent
cold/model/termination observations. It remains an exclusive measurement and
shares no samples across commands. Its unchanged120s authority-intent deadline
must also contain all other selected authority cases; a recovery300s override
does not apply to it.

The matrix's additional state/race/COMMIT branches are a SECOND outstanding cost
axis. Prepared/no-send, dispatched, unknown, reconciling, actual confirmed and
conflicting-confirmed histories must be reached legally in different originals
whenever incompatible. A rollback or lost-COMMIT-ACK branch executes the real
fault and new-process original-key lookup; it is not a field mutation. No
confirmed→unknown reset, Stop undo, seeded terminal row or shared completed
restored-GET/successor is allowed. These constraints and all variants in
case-subsets.json remain normative; the2,488 count is still only a lower bound.

Commands retaining these complete bodies:

- `node g1-runtime/scripts/check-component.mjs continuation` —300s outer;
  recovery300s approved future inner, other suites120s each.
- `node g1-runtime/scripts/check-suites.mjs authority-intent recovery-stop` —480s
  outer; includes fresh R20 alongside A12/R19 and every other selected body.
- `node g1-runtime/scripts/check.mjs` —900s task/1,800s final outer; all nine
  local suites and fresh full bodies, no subset sample reuse.

No complete current-command fit is claimed by this ledger. Profiling only the
five existing pilot leaves cannot fill any of the missing costs above. P600s and
X900s aggregates require their own serial/transaction/resource analysis; the
Docker prohibition and withheld remote approval remain in force.
