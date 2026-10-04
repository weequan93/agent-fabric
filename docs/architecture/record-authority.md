# Authoritative record ownership

Every record carries immutable tenant/Space or an explicitly authorized source/destination relation. Models, workers and clients cannot author trusted control records. The in-memory G0 repositories demonstrate protocols; the SQL migration is a reviewable durable deployment contract, not a claim of actual database qualification.

| Record | Sole authoritative owner / interface | Concurrency / rejection | Recovery |
|---|---|---|---|
| Identity, membership, policy | trusted identity/authority repository; current lookup | revision stamped by owner, unavailable denies; client owner/payer/role ignored | current grants/revocations before snapshots |
| SpaceBinding / ComputerAssignment | Spaces service; bind/inspect/assign | immutable tenant/audience/payer; assignment belongs to same scope and qualified generation | restore only current assignment/qualification |
| Task / requirement revision | scheduler Task repository; revise/comment/stop/retry | expected revision for ordinary commands; comment is never revise | preserve revisions, stopped Task explicit retry authorization |
| Run / event stream | scheduler Run repository; transition/append/replay | immutable attempt/version pins; terminal cannot reopen; ordered cursor | pure replay, no model/write, new retry identity |
| Command | API command repository; admit/status | scope+actor+idempotency key, conflict payload rejected, ordinary stale/expiry rejected | reauthorize before dedup/status response; offline draft never auto-submit |
| Approval | trusted approval service; exact binding | actor/target/digest/artifact/policy/expiry required; no worker mint | changed state needs refreshed approval, no replay |
| Operation / execution receipt | broker; prepare/dispatch/reconcile | immutable operation identity, current policy/lease/fences/reserve; unknown forbids blind retry | downstream lookup/dedup or waiting resolver |
| Cancellation generations / leases | scheduler and trusted broker lease repository | task/run/runtime generation and expiry at dispatch/input/publish | invalidate old credentials; replacement fresh generation |
| Allowance / reservation / usage | budget ledger through one BudgetPort | atomic parent/children reserve; no ceiling copies; server payer; dedup settlement | unknown retains reserve; top-up rechecks grants; conservation |
| Artifact bytes / manifest / version | artifact repository + storage confirmation | bytes+manifest durable before commit, scoped ownership, expected base revision | uncommitted upload quarantined, variant retained; tombstone precedes rehydrate |
| CheckDefinition / CheckReceipt | protected verifier registration/executor | exact artifact/env/lock/check/verifier, no self-report | changed candidate invalidates receipt; unavailable remains pending |
| DeliveryOperation | ActionBroker separate from acceptance | delivery uses exact approved artifact and target, no acceptance grants effects | unknown delivery reconcile before resend |
| Notification | notification owner | failure never changes Task result or redoes effect | independently retry safe notification identity |
| Outbox / tombstone | transaction owner and Space lifecycle repository | mutation+outbox atomically committed; jobs idempotent and reauthorize | deletion applied before late jobs/index rebuilding |
| Context capsule / cache | compiler derived from authorized typed records | scope/provenance/trust/time, no grant creation; provider-scoped opaque cache | authority revision invalidates and recompiles |
| Qualification / extension pin | trusted conformance evaluator registry | deployment/environment/version/digest/expiry required; self-declaration rejects | capability loss revokes lease; replacement requalifies |
| Memory revision | future memory service contract | fact lineage and source permissions; no behavior release | source deletion invalidates dependent revisions/candidates |
| Behavior proposal / release grant | future independently qualified release service | separate immutable version/evaluation/approval; memory edit cannot release | rollback version never restores revoked grants |
| Presentation / local draft | authorized query view / client | last update + not-delivered + waiting resolver, private titles filtered | current snapshot clears revoked records; draft retained without dispatch |

Errors and callable contracts are registered in [interface registry](interface-registry.md). Commit/outbox recovery must distinguish simulated durable confirmation from actual storage capability. G0 checkpoint copies never replace a database transaction or save live computer files. Worker deployment accounts must lack owner/superuser/BYPASSRLS; actual roles/RLS tests are a G1 prerequisite, pending here.

