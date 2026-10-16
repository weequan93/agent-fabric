# Turn38 test-design report

Status: INCOMPLETE. PR-F06-08/09 remain open. No stage_done, product task
completion, production change or acceptance-budget amendment.

Meaningful new evidence: the controller ran the unchanged real five-path pilot
at bounded concurrency. Job-5b06476310 FAILS after187624ms. Passing1/2/4-lane
phases execute18/36/72 independent actual negative/restored-GET/useful-successor
journeys (126 total,70 actual3s-expiry originals), taking53.839/55.688/59.588s.
Every completed journey has distinct original/successor IDs, fixture root and
independently censused target birth, new owner OS process and actual GET records.
The same pinned strict source/test build remains candidate7089d81f4ccd; product
source/tests/scripts/inventory/lock and prior task-plan.json are unchanged.

Eight lanes cross the chosen conservative4GiB sum-RSS guard, sampled4541366272
bytes/70live processes, and all8 dispatches cancel after13.905s. No8-lane
complete throughput or32/64-lane fit is credited. RSS sums shared pages and the
2s sampling cadence misses short peaks. This is neither a maximum host-capacity
finding nor proof every other composition is infeasible. No guard/timeout was
raised or failed work retried within the invocation. All failures/partial raw
remain retained. Four lanes' whole-journey minimum remains1240s with121s serial
observations against300s continuation; the full matrix is unproved.

Cancellation exposes a separate real failure: ALL8 supervisors preserve
cleanup.confirmed:false (7 Unproven descendant birth;1 Descendant exited before
birth acknowledgement). Their observe() validation can fail during cleanup after
cancellation; exact schedule requires deterministic birth/log/OS/ACK barriers.
The profile top-level cleanup:true concerns build-cache cleanup only. H08/H14/H15
new bodies in test-plan.md §17 require actual guarded cancellation, known-owned
cleanup despite historical log failure, unrelated sentinel/PID reuse protection,
full failed denominator and rejection of build-only cleanup being promoted to
whole-resource cleanup. H04 remains its separate TAP-decoder case.

Separate controller precheck94b0feefb8 PASS327ms and separate completion3ad01d51ef
PASS325ms perform fresh actual OS census. No known/nonce-bearing process remains,
zero signals sent. Five owned failed fixture roots are retained with original
markers/data, not deleted or reused. These observations resolve current process
residue only; historical cleanup:false and failed check remain unchanged.

Two official design-diagnostic tasks were added through loop_plan(final=false)
only to obtain outside-sandbox observations: f06-test-design-profile remains
pending/failed; f06-test-design-census is controller-completed. Controller total
is13/69 done including that incident diagnostic. f06-06c remains active but
NO-GO for broad feature work;06d/e pending,08a unfinished. No remaining product
implementation split was submitted; official task-plan.json is unchanged and
plan_final isfalse. A read-only controller task snapshot states this explicitly.

The revised proposal has15 single-lead rows, adding06c-cancel before runner
work:35–65min+300s full H08/H14/H15 check+10min reserve=80min upper. Existing
14 rows and original c/d/e selectors/covers/aggregate checks remain. All totals
are600–1045min work+124min checks+150min reserve=874–1319min; maximum row108min.
This is NOT an official plan or independent sizing. Composition/resources must
be resolved and the formal plan/resources/review progression must regenerate
before broad implementation. Old full06c65–95min/163–238min bundles remain
rejected execution baselines.

The nonmatrix ledger explicitly enumerates ten recovery siblings plus A11/A13
inside continuation and R20 outside. Mandatory-control loss, startup validation,
currentness, required-sink renewal, live-unreachable and absent-unknown owners,
legacy original key/recovery and all correctness/timing samples retain actual
observations. Existing A12's short renewed lease is not the required elapsed1s
sample. These costs plus incompatible matrix state/COMMIT histories remain
unmeasured;2,488 journeys is still a lower bound. All101 requirement mappings,
142 families,29 owner children,5,350 inventory IDs and original cases/oracles/
samples are preserved. Recovery300s inner is approved for future implementation;
source still120s and all outer limits remain unchanged.

Updated test-plan §17, readiness and implementation-plan NO-GO overlays, and
appended the result/limitations to living F06 acceptance evidence. Earlier
acceptance text remains a byte-identical prefix. No local/PG/deployed product
qualification is added. Docker/PG fixtures and inherited Docker regressions stay
prohibited; remote remains unapproved. Linux/image/hostile worker/tool/egress,
real one-VM billing/queue and positive sensitive browser isolation remain
unqualified. No Docker CLI/daemon/container, GUI/other-app, remote/paid resource,
real credential/security setting, communication, sub-agent, freeze/re-freeze or
manual .loop edit occurred. Standing local approval covers owned fixtures and
incident recovery; no repeated human approval was requested.

Diagnostics retained: first profiling collector wrongly expected target script
names after bootstrap process.title replacement; job-b326b997e8 FAIL57966ms,
raw existing five tests pass but no extra phase/coverage credit. Corrected design
collector adds supplemental owned-root startup records correlated with actual
nonce/PID/birth. Initial incident collector also assumed every ancestry-owned
root runner had a nonce title; it failed before census. Corrected birth/ancestry
plus exact-command-or-nonce check passes fresh controller census. Original
collector versions and failures remain. Neither correction changes product
checks. One readiness patch failed atomically on an exact heading mismatch.
The evidence append initially landed before its final historical paragraph;
the prefix audit caught this and the addition was moved to EOF, preserving all
previous bytes. The final raw/document audit passes5 groups; syntax and scoped
whitespace checks pass. These diagnostics do not convert the profile failure or
stage to a pass. No full evidence-tree re-audit is claimed.

Next: retain the measured resource/cancellation limits; deterministically finish
the cancellation design and a lower-footprint independent fixture composition,
including every nonmatrix/state branch and all nested deadlines. Do not launch
32/64 lanes from lower-bound arithmetic or repair production in test_design.
Demonstrate whole-command fit or use an exact amendment only when justified,
then stage_done→formal plan→independent resources→plan review. Do not repeat the
answered300s/remote questions or mark Docker-dependent tasks complete.
