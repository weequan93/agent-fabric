# G1-F04 product brief: model profiles and FinOps

Date: 2026-10-07. Stage: intake. Role: product manager.

## Product decision and problem

Deliver an additive G1-F04 package that makes model selection, call admission, cost ownership and uncertain usage enforceable and inspectable. Acceptance uses only a deterministic local test adapter. A model interface or a plausible accounting summary is insufficient: actual calls, denials, concurrent reservations and recovery must demonstrate the contracts.

Agent Fabric's product promise is no surprise action, audience, computer or cost. A user needs to know which approved operating profile will run, who pays, how much allowance remains and what happens when work waits or a call's usage is unknown. Without coordinated admission and retries, concurrent parent/child work can overspend, gateway retries can multiply engine retries, and a lost acknowledgement can cause either duplicate inference or prematurely released budget. Without explicit execution classification, an ordinary question can appear to require a computer and ongoing resource charges can be hidden by a stopped or waiting task.

This increment advances AF-02, AF-06 and AF-18 in the remaining ledger. It establishes local behavioral qualification; it does not close their real-environment obligations or certify the whole G1 product.

## Source baseline and interpretation

| Source | Application to this increment |
| --- | --- |
| Current user objective (controller intake assignment) and [G1-F04 dependency entry](../../planning/g1-foundations-plan.md) | The current assignment authorizes this increment, deterministic acceptance and additive work. Supplier route, region, billing and paid enablement remain separate human decisions. |
| [Roadmap](../../planning/roadmap.md), G1/G2/G5 | G1 needs baseline budget and model boundaries; G2 adds enterprise billing depth; G5 qualifies additional combinations. Failed capabilities cannot be hidden by a fallback. |
| [Remaining ledger](../../planning/g1-remaining-ledger.csv), AF-02/AF-06/AF-18 | Preserve the distinction between fixture qualification and actual provider, gateway and runtime evidence. UX-11 is a supporting budget-wait journey, not a claim to complete every UX obligation. |
| [Master specification v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md), §§2, 7, 9, 11–12 | Complete operating profiles, capability/data-policy filters, shared atomic reservation, coordinated retries, trusted attribution and explicit service/computer and charge contracts. |
| Master specification §§10, 22, 29–32 | Native ownership, correlated cost evidence, observable failure/recovery, honest qualification and total cost rather than token-price claims. |
| [G1-F02 evidence](../../evidence/g1-f02-acceptance.md) and [identity check](../../../g1-identity/scripts/check.mjs) | Current authority and payer boundaries remain authoritative. Preserve accepted sources/raw evidence and use strict build, mandatory nonempty behavioral suites, no skips/TODO, and controller-owned evidence conventions. |

README and the roadmap retain historical planning statements. The repository now contains local implementation packages and evidence; those historical statements and implementation observations must not be rewritten as current full-product acceptance. G1-F02's evidence distinguishes local synthetic identity/actual PostgreSQL observations from independent final acceptance and formal SSO. G1-local already uses deterministic model receipts and synthetic budget units; G1-F04 must add integration without replacing that accepted baseline.

## Target users and responsibilities

- Individual task owners and group contributors need understandable profile, payer, remaining-budget and wait information within their original Space and Task.
- Authorized task operators and budget administrators need to reconcile uncertain usage or authorize a budget change without silently replaying a call or granting new effects.
- Model/evaluation maintainers need an executable profile/capability qualification route and explicit unsupported combinations.
- FinOps administrators need accurate cost-center and purpose attribution, separate estimates/reservations/settled amounts, and resource costs that are not counted repeatedly.
- Engine/runtime maintainers and independent reviewers need durable admission/recovery behavior and evidence tied to the current candidate and check definitions.

These are responsibility roles, not invented named owners, new access grants or a commitment to a particular organization structure.

## User journeys

1. **Ask with a known cost owner.** A currently authorized user submits an ordinary question. The system identifies the approved full profile, original tenant/Space/Task/Run, payer/cost center, purpose and allowance before invocation. It reserves budget and calls the deterministic service adapter. The local journey records zero Space-computer provision requests. It exposes estimated and settled synthetic model consumption separately from any declared persistent-resource charge.
2. **A required capability is unavailable.** The selected profile lacks a required modality, tool/schema dialect or runtime property, or violates route/data policy. Dispatch is refused with a reason and permitted next action. An unavailable manual pin waits unless equivalent fallback is explicitly allowed. A permitted profile switch occurs only at a safe boundary with a revalidated task capsule; the actual profile and reason are visible. It cannot move to an unapproved provider, region, local machine or weaker authority.
3. **Concurrent work meets one allowance.** A parent and its children compete for the same applicable budget. Reservations are atomic and shared rather than copied. Only calls covered by successful reservations dispatch; insufficient allowance creates a durable budget wait. Client-supplied payer/team tags cannot choose another account or merge Space data scopes.
4. **Failure and retry remain bounded.** A deterministic failure exercises the single coordinated engine/adapter retry allowance. Each potentially chargeable attempt is accounted for. An uncertain acknowledgement leaves the original call and reservation visibly unknown; timeout, cancellation or restart cannot be treated as proof of zero usage. Recovery looks up/reconciles the original identity and receipt before any safe continuation, with no blind replay and no duplicate settlement.
5. **Budget wait and authorized continuation.** At exhaustion the system preserves committed work, stops new chargeable steps and exposes the reason, owner, affected Task/resource and permitted top-up or smaller-scope action. Waiting for approval consumes no model turns. A synthetic authorized allowance change permits continuation after current authority/policy checks; an unauthorized change is denied. Unknown reservations remain held. This tests a local budget operation, not a real money transfer.
6. **Computer need and continuing charges are explicit.** A task requiring computer capabilities has a visible classified/preflight transition. Service failure cannot secretly start a computer. Local resource contracts distinguish model/service, active or reserved compute, cold-start and retained-storage charges. A shared machine charge belongs once to its owning Space, with an explicit allocation method or unallocated shared cost. Stop, wait, suspension and archive do not imply retained storage is free or deleted. Actual provisioning, suspension and deletion qualification belongs to later increments.

## Goals, priorities and scope

### Must

| Area | Required product outcome | Local verification boundary |
| --- | --- | --- |
| AF-02: complete operating profile | Bind model/version, instruction pack, tool presentation, context policy, reasoning controls, verifier and runtime requirements. Declare modalities, schema/tool dialect, streaming, context limits, usage reporting, cancellation, caching and supported optional features. Missing required capabilities fail explicitly. | Execute deterministic conformance and comparable local fixture tasks. Validate actual profile/request binding, capability denials, allowed switching, prohibited fallback and manual-pin behavior. No inference-quality or supplier-conformance claim. |
| AF-02: safe selection and switch | Apply capability and data-policy filters before selection. Record approved route/profile and fallback reason; revalidate context, source/policy revisions and safe-boundary capsule. Opaque provider reasoning and KV cache stay provider-scoped; cache loss/revalidation cost is explicit. | Observe request/dispatch counters and switch records. Required semantics cannot silently disappear in translation. Action turns cannot use semantic response caching; any supported exact cache is scope/audience/version bound and cannot authorize work. |
| AF-06: budget admission | Budget before invocation; atomic shared reservation across applicable parent/child limits and model/tool/execution cost categories. Count retries, planning, reflection, embeddings and reranking against the Task or an explicitly authorized maintenance allowance. | Actual contested reservations and rollback/recovery tests demonstrate no copied child allowance, double admission, negative availability or dispatch without a reservation. Categories unsupported for execution are explicitly refused or tested as accounting fixtures. |
| AF-06: coordinated retries and unknown usage | One finite retry budget across engine and adapter/gateway boundary. Retain unsettled reservations until usage is reconciled. Distinguish safely failed, in-flight, unknown and settled outcomes. | Execute failures before and after provider acceptance, delayed/missing usage and lost acknowledgements. Recreate the caller/service and reconcile original receipts. Duplicate or conflicting settlements cannot alter totals. |
| AF-06: attribution and visibility | Trusted service stamps tenant, actor/user, Space, Task, Run/child, purpose, model-call identity and payer/cost center. Separate configured ceiling, estimate/range assumptions, reserved amount, measured usage and settled synthetic charge. | Deny forged or stale payer/scope/authority and cross-Space receipts; correlate every accepted call and charge to its original binding. No real credentials or invoice-equivalence claims. |
| AF-18: execution classification | Ordinary Ask uses the service route without requesting a Space computer. Computer work requires classified admission/preflight; mode change is controller-owned and visible. | Execute service/computer positive and negative fixtures, including failed service calls and forbidden fallback. Observe zero computer-start requests for ordinary Ask. This is a local contract result, not qualified remote isolation. |
| AF-18: wait and continuing charges | Durable budget/approval/resource waits disclose cause and next action; approval wait consumes no model turns. Disclose idle-compute policy, in-flight uncertainty, cold-start and storage charges; shared compute is counted once. | Exercise wait, authorized/denied continuation, Stop and restart accounting paths against deterministic clocks/receipts. Distinguish simulated resource charges from measured host/cloud use. |
| Qualification delivery | Add `g1-model/` with a build and `g1-model/scripts/check.mjs`, plus `docs/planning/g1-f04-plan.md` and `docs/evidence/g1-f04-acceptance.md`. | Strict clean build and mandatory nonempty behavioral suites covering positive, negative, concurrency and recovery cases for all three ledger rows. The check fails on missing suites, failed tests, skips or TODO. Acceptance evidence identifies candidate, commands, environment, raw results and unresolved external obligations. |
| Baseline preservation | Additive integration with existing trusted scope, identity/payer and native recovery contracts; no parallel authority or competitor harness owns ordinary work. | Retain unchanged accepted G0/G1-local/G1-foundations/G1-F02 checks, protected files and raw evidence; controller runs required regression checks. Any GUI/Electron checks run through `loop_check` outside the sandbox. |

### Should

- Provide a concise local operator entry point or documented journey that demonstrates selection, budget wait, unknown usage and reconciliation using user-readable outcomes; a new UI is not required.
- Make retry counts, retained reservation, actual profile and separate charge categories easy for reviewers to inspect without reading private reasoning or source content.
- Document recovery and a qualification matrix linking every obligation to its behavior test and remaining real-environment gate.

### Could

- Add more deterministic fixture profiles or failure schedules when they improve coverage within the same authority and cost boundaries. More real suppliers, adaptive routing or additional product modules do not follow from this optional priority.

## Success metrics and acceptance

These are intended gates for the later implementation, not observed passes at intake.

1. The controller runs `node g1-model/scripts/check.mjs` successfully against the current candidate. It performs a strict build and real mandatory suites with at least one executed test in each required behavior group, zero failures, zero skips and zero TODO. Missing tests or a build failure are failures.
2. Every Must outcome maps to executable positive and refusal coverage; reservation/retry/unknown/wait flows additionally have concurrent and recreated-process recovery coverage. Tests assert actual dispatches, committed records, balances and receipts, not only schema acceptance or printed labels.
3. In the finite concurrency suite, admitted reservations plus settled charges never exceed the configured admission boundary. Unknown/in-flight liability stays represented, no call dispatches without an accepted reservation, and authorized settlement happens once. Any synthetic measured overrun is recorded and blocks or constrains further admission under an explicit tested policy; it is never hidden as an exact invoice cap.
4. The deterministic failure suite produces zero unauthorized dispatches, duplicate chargeable executions caused by recovery, double settlements, cross-Space disclosures or forged cost-owner assignments. Retry attempts do not exceed the one configured coordinated allowance.
5. Ordinary Ask and approval-wait journeys record zero computer-start requests and zero wait-induced model invocations respectively. Shared-compute fixtures count the owning Space charge once; storage/in-flight charges remain visible through wait and Stop.
6. Required retained baseline guards/checks pass unchanged through the controller. Complete current raw command output and failures remain available; implementer observations do not substitute for independent reviews or controller completion.
7. The plan and acceptance document explicitly mark real provider conformance/comparable tasks, gateway billing reconciliation and remote no-VM/cold-start/storage cost qualification as pending. No supplier savings, production SLA or whole-G1 completion is claimed.

## Explicit non-scope and qualification still needed

| Pending area | What local success cannot establish | Next authorization/qualification |
| --- | --- | --- |
| Real model families and supplier routes | Actual modalities, streaming, cancellation, usage reporting, tool dialects, context limits, quality, comparable-task economics, supplier cache semantics or paid failover | Separate human choice of supplier/model/version, route, region/data policy and paid enablement; actual provider conformance and controlled comparable tasks. |
| Enterprise gateway billing | Real gateway edition/license controls, credential custody/rotation, delayed metering, provider invoices, permitted real overrun and billing reconciliation | Approved gateway/deployment and billing contract, real usage/invoice reconciliation; enterprise depth remains in G2. |
| Remote runtime/resource costs | Qualified service isolation without Space mounts, actual no-VM Ask, Linux image/egress enforcement, provisioning, cold-start distributions, idle suspension and retained storage/network prices | G1-F06 authorized remote/runtime qualification, G1-F05 storage durability and later real resource accounting. |
| Full product journeys | Formal enterprise SSO, real human judgment, three-device/sleep behavior, signing/distribution, full lifecycle deletion/restore, complete Fleet/Memory/Design/Reflect | Preserve later G1-F05–F07 and G2–G5 gates; no closure of unrelated ledger rows. |

No production/shared deployment or release, real supplier call, credential use/change, paid model/product API, cloud resource creation, messaging to people, published-history rewrite or nonreproducible data deletion is included. The intake stage writes this brief only; production code and test implementation belong to later assigned stages.

## Constraints, open decisions and risks

The current user objective settles the local acceptance route. No blocking human question is needed to write this brief or implement that route. External decisions remain deliberately open; they must not be filled with invented vendors, regions, prices or approvals.

- **Human decisions before external work:** real supplier/profile/gateway edition, approved route/region, key custody, actual budget ownership/limits, permitted billing overrun, storage/compute tariffs and paid enablement. Use `loop_ask(kind=approval)` for the exact proposed external action before any call, credential, spend or deployment. Elapsed time is not approval.
- **Solution/test-design decisions within local scope:** explicit synthetic units and conservative reservation assumptions; a finite coordinated retry policy; durable recovery/receipt ownership; local overrun behavior; supported capability combinations; deterministic clock and shared-resource allocation fixtures. Document these as implementation/test contracts rather than real customer commercial terms. A safe unqualified behavior is refusal or visible wait, never silently free/settled usage.
- **Integration risk:** parallel budget or identity stores can diverge from current authoritative scope/payer policy. Requirements and solution stages must identify one authority per record and recheck current authorization on admission and continuation, preserving immutable Task bindings.
- **Concurrency/recovery risk:** a nominally atomic in-memory demo can miss actual process races and lost acknowledgements. Acceptance must observe contested admission and durable restart/reconciliation with retained unknown liability.
- **Qualification risk:** deterministic provider behavior can conceal real usage delays and cancellation gaps. Evidence must label synthetic units/profile/resource observations and list unavailable external evidence separately.
- **Regression/evidence risk:** the worktree already contains substantial prior work and raw evidence. Change only new increment artifacts or explicitly additive integration paths; never rewrite retained evidence or accepted checks. Controller completion and independent review remain separate from this author's claims.
- **Cost-clarity risk:** waiting or stopping a Task can be mistaken for stopping all charges. Expose continuing storage, reserved compute and uncertain in-flight cost under the declared fixture policy; do not promise an exact invoice cap or savings.

## Handoff to requirements

Record verifiable requirements for all Must outcomes with AF-02/AF-06/AF-18 and cited source sections. Preserve local versus external qualification in every requirement and test plan. Specify actual observable call, reservation, attribution, wait and recovery effects; identify supported refusal paths for unavailable capabilities. Carry this brief through requirements review, solution, test design and planning before implementation. Only the controller decides stage progression and final completion.
