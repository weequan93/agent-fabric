# G0 trust boundary and threat model

Scope: deterministic G0 controller/contracts and reviewable deployment protocol. Sources: accepted G0 plan, decision register, specification §§ identity, authority, effects, budgets, recovery and protected evaluation. Status: engineering analysis; formal independent security assessment is pending. No real isolation/deployment claim.

## Assets and trust boundaries

Assets are private Space content/titles, immutable target and audience, server payer/allowances, approvals, credentials/leases, operation identity, committed artifact bytes/manifests, protected check definitions/receipts, qualification evidence and behavior release grants. Models, retrieved web/tool/memory content, session workers, clients, channels, plugins and query projections are untrusted proposers. Trusted owner repositories and separately registered evaluators control admission.

A personal Space and a group Space are independent tenants/audiences/compute bindings. Source readability does not grant destination shareability. Client-supplied role/payer/owner cannot become authoritative. Authentication, capability, current authorization and exact approval are separate predicates.

| Threat / entry | Required G0 control and oracle | Recovery / residual qualification |
|---|---|---|
| Cross-Space read or private connector export | current scope, six-layer intersection, independent readable/shareable predicates; O03–06, O20 | invalidate cached capsules on revision; real SSO/RLS/connector credentials G1/G2 pending |
| Prompt/tool/memory injection or plugin manifest privilege | typed provenance/trust; tool name not actual effect; manifests no grant; O01, O14, O21–22, O30 | recompile from current authority; actual provider/tool conformance pending |
| Stale or forged approval / partial stream parameters | complete closed parser, canonical exact target/content/artifact/policy/actor/expiry binding; O01, O12, O14 | refresh approval with new validation boundary; no changed-state replay |
| Duplicate remote commit after lost acknowledgement | immutable operation identity, unknown state and downstream lookup/dedup before retry; O15–16, O29, O34 | no safe lookup retains reservation and waiting resolver; actual downstream exactly-once is not promised |
| Stop race, old worker/input/publish | current Stop authority despite stale progress, atomic generation change + dispatch fences; O17–19 | replacement fresh credentials/generation; in-flight unknown reconciled; real all-path barrier G3 pending |
| Copied child ceiling / stacked retry / duplicate settlement | one BudgetPort, atomic parent-child allowance, unified retry, retained unknown reserve, scoped dedup; O23–26 | conservation and current grants after top-up; actual invoice/quota/shared-compute policy G1/G2 pending |
| Forged completion or delivery / check tampering | trusted registered verifier, exact artifact/env/lock/check/verifier receipt, accepted≠delivered; O10, O27–29 | new candidate rechecks; formal G0 registered evaluations required, production executor qualification pending |
| Partial storage commit / resurrection after delete | durable bytes+manifest protocol, atomic outbox, current tombstones before late jobs/restore; O07–08, O33–34 | orphan quarantine, rebuild projections only; actual PostgreSQL/object encryption/volume restores pending |
| Fake or expired runtime qualification | trusted tested deployment/version/digest/expiry plus mandatory capability; O19, O30 | deny scheduling, revoke old lease, no local/region fallback; actual resource enforcement G1/G5 pending |
| Offline status lies or unauthorized title/cache | not-delivered + last-update + safe resolver; current authorized snapshot; O13, O31, O33 | clear revoked local records, retain unsent draft without submit; real clients G1 pending |
| Memory edit silently releases behavior | revision/source lineage, separate evaluation/release identity; O32 | source delete invalidates candidates, rollback cannot restore grants; actual Reflect G4 pending |
| Replay causes new model/write charges | pure reducer, current grants/tombstone→unknown reconciliation→continuation; O11, O34 | replay counters zero; real event store/crash deployment testing pending |

## Required observations

All 34 frozen oracles have allowed/denied/recovery branches; final G0 runs all 102, never only negative examples. Mandatory prohibited counters are zero for cross-Space disclosure, unauthorized dispatch, duplicate effect, old-generation writes, replay model/write calls and duplicate settlements. Unexpected rejection of allowed work is also a defect. Accounting remains nonnegative and conserved through concurrent reservations, delayed usage and reconciliation.

No worktree, serial lock, protocol compatibility, mock verifier, hardware brand or self-declared manifest is proof of actual containment or independent sign-off. Workers never receive database owner/superuser/BYPASSRLS. This batch uses controlled fakes and local real compiler/tests; real encrypted storage, deployment credentials, cloud spend and SSO are outside its scope. Required independent G0 security assessment runs against the integrated exact candidate and actual checks; unresolved high-severity authorization/isolation/stale-approval/duplicate-effect findings block acceptance.

