# G1-F06 product brief: protected runtime and explicit contention

Date: 2026-10-16. Stage: intake. Role: product manager.

## Problem and outcome

Deliver the additive G1-F06 runtime increment: authorized remote test deployment, a qualified Linux image, and protected worker, tool and egress boundaries. A user must be able to ask or plan without changing a target, run authorized work without another tool bypassing its limits, understand why conflicting work waits on one computer, and use sensitive authentication only where other agent processes cannot access it.

The existing accepted contract and local increments do not establish hostile-process containment or deployment qualification. A policy decision that rejects one broker request is insufficient if a shell, SDK, browser, MCP server or direct network connection can perform the same forbidden effect. Likewise, a named browser profile, hidden screenshot or exclusive input lock alone does not isolate credentials or input from another process.

This increment advances AF-13, UX-03, UX-07 and UX-10. It must distinguish actual local behavior, capability refusal, and actual remote qualification. Supervised local development cannot issue the remote qualification. The full goal remains open until the required environment and evidence exist; locally passing checks must not close external obligations or advertise an unsupported profile.

This turn produces this intake brief only. Requirements, solution, tests, implementation and final evidence follow their controller stages.

## Source baseline and precedence

| Source | Obligations carried into this increment |
| --- | --- |
| Current goal and human decisions, 2026-10-13 and 2026-10-16 | Additive runtime package, strict behavioral check, plan and acceptance evidence. Broad local autonomy remains; Docker and all containers are temporarily prohibited. Remote access/resources/security changes need explicit approval. |
| [Roadmap](../../planning/roadmap.md), G1 and G3 | G1 requires a qualified runtime, no-VM ordinary Ask, bounded effects and protected checks. G3 expands browser/desktop interaction; baseline safeguards for any path opened in G1 cannot be deferred. |
| [Foundation plan](../../planning/g1-foundations-plan.md), G1-F06 dependency | Authorized remote test deployment and qualified Linux worker/tool/egress boundaries; supervised local execution cannot certify them. Preserve F01–F05 responsibilities and the F07 client qualification boundary. |
| [Remaining ledger](../../planning/g1-remaining-ledger.csv) | AF-13 cites master §§2, 13–14; UX-03 cites §§31, 5, 10; UX-07 cites §§31, 12, 21; UX-10 cites §§31, 13, 21. All four retain local fixtures and actual environment validation obligations. |
| [Master specification v1.1](../../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md), §§2, 5, 10, 12–14, 21 | Authority intersection, intent ceilings, actual all-path boundaries, qualified runtime activation, one-computer contention, separate driver/view grants and actual sensitive-session isolation or refusal. |
| Master §§11, 26, 28–32 | Shared compute cost counted once; immutable targets and fencing; current authority after recreation; explicit uncertainty; zero unauthorized effects in the finite release suite; deployment-specific evidence and pilot timing parameters. |
| [F02 acceptance index](../../evidence/g1-f02-acceptance.md) and [identity check](../../../g1-identity/scripts/check.mjs) | Preserve current identity/approval boundaries and accepted evidence. Strict build, mandatory nonempty suites, no skips/TODO, protected-baseline verification and controller-owned current-candidate evidence. The existing identity check invokes Docker and is not runnable under the current prohibition. |
| [Prior F04 brief](../agent-fabric-g1-f04-model-finops/product-brief.md), [F05 brief](../agent-fabric-g1-f05-storage/product-brief.md), repository README and existing packages | Reuse native service/computer classification and existing identity, recovery, model/cost and storage ownership. Historical planning statements and prior local passes do not establish this runtime's qualification. |

The current goal authorizes this additive work. Historical roadmap/README statements and prior raw evidence remain intact. No ledger entry is declared fully accepted by this brief.

## Target users

- Individual and group contributors need predictable Ask/Plan/Act behavior, an explicit execution target, and useful refusal or waiting messages.
- Task operators sharing a Space computer need visible ownership and queue reasons, reliable cancellation and safe recovery without duplicate work or additional surprise computers.
- Users signing into sensitive applications need a genuinely isolated authentication session, or a clear blocked path with a permitted alternative.
- Runtime/security operators need an inspectable supported-control matrix, image/policy generations, actual enforcement and a way to quarantine or refuse an unsafe profile.
- Independent reviewers need reproducible positive, negative, concurrent and recovery observations tied to the candidate, checks and environment.

These are responsibility roles, not new grants or named staffing assignments. Room membership, task ownership and operator visibility do not confer host administration or credential access.

## User journeys

1. **Ask how to fix a service.** An authorized user receives an answer using eligible service-side sources. An attempted server/repository write is refused through every exposed path. An ordinary question starts no Space VM and has no Space filesystem mount. Declared live read-only inspection requires the appropriate capability/startup consent. Plan can save a versioned plan through the artifact service, but cannot modify the target. Routine transcript/audit persistence is distinguished from target modification. Switching tools or choosing a stronger model cannot raise the intent ceiling. Act requires an explicitly accepted task envelope and any separate exact-action gates.

2. **Perform a bounded Act task.** After admission, the system validates the Linux image, workload identity, policy generation, mounts, resource limits and required controls before declaring the computer ready. A permitted operation succeeds on an owned fixture. Equivalent forbidden filesystem, process, control-service or network operations fail when attempted by shell, SDK, browser and MCP paths, including direct child processes that avoid cooperative broker calls. Workers cannot modify the policy authority, protected checks, receipts or broad secrets. Missing or lost mandatory controls prevent affected execution and expose the next safe action.

3. **Two tasks need the same resource.** Task A holds a canonical-file, package-install, browser-profile or desktop lease. Task B sees a waiting state with the current owner and conflict reason; the system does not race their writes or create another VM. Only demonstrably disjoint, enforceable work can run concurrently. Queue cancellation, owner failure, lease expiry and service recreation preserve ownership/fencing and allow safe subsequent progress. A released lease does not authorize replay of an uncertain effect. Shared compute is counted once for the Space; waiting does not imply that an already-running VM is free.

4. **Sign into a sensitive application.** Before authentication begins, the system verifies a separately isolated session and appropriate grants. Agent input, capture, recordings and telemetry are suspended for user-only authentication; other agent processes cannot read its profile, cookies, clipboard or input channels. A private profile directory or screenshot masking alone cannot satisfy this journey. Where isolation is unsupported, block the flow before exposing credentials and explain the supported alternative. Use only synthetic credentials in project-owned fixtures; never import personal browser profiles. Loss of isolation or restart fences old access and does not silently restore authenticated sessions.

5. **Recover from policy loss or runtime interruption.** Required capability loss, stale generations, authorization/evidence outages and controller disconnection stop affected privileged continuation within the qualified lease contract. Startup-only changes remain Pending recreation until a matching qualified worker generation is reported. Unreachable is shown as unknown, not confirmed stopped. Recovery rechecks authority, reconciles in-flight effects, fences old workers and reacquires resources before new writes. Human takeover or an expired/disconnected driver leaves mutable work paused until explicit return/resume, fresh observation and reconciliation; conflicting shell/SDK/API/browser writes cannot continue behind the human's input lease.

## Goals and measurable success

The following are acceptance outcomes for later stages, not observations already obtained.

| Requirement | Required behavior and measurement | Qualification boundary |
| --- | --- | --- |
| AF-13 | Every advertised tool path has an allowed operation and actual forbidden-operation attempts, including alternate paths and capability loss. Observe filesystem/process and destination-side effects, not only returned denial objects. Zero forbidden effects, cross-Space disclosure, unauthorized dispatch or duplicate effects in the finite required suite. | Local owned processes/endpoints establish only their measured behavior. Actual Linux host/kernel/image enforcement, protected worker identity, resource controls and egress bypass resistance require approved deployment tests. |
| UX-03 | Send actual Ask and Plan requests, including forged/escalating tool requests. Verify target file/repository state and owned target-service mutation counters remain unchanged; ordinary Ask VM allocation count is zero. Plan artifact persistence succeeds through its distinct service. A separately admitted, bounded Act operation proves useful allowed behavior. | Fixture target observations do not establish untouched real servers or a remotely isolated service worker. Those require equivalent tests on the approved environment. |
| UX-07 | Exercise simultaneous conflicting requests across independent processes, visible owner/reason/wait status, cancellation, expiry, stale-owner attempts and recreation. No overlapping conflicting effects, hidden VM creation or duplicate allocation. Queue advances only after safe ownership transfer. Report observed VM allocations and shared-cost accounting without treating estimates as invoices. | Local process/allocator/accounting fixtures prove local behavior only. Actual one-VM contention, runtime allocation inventory and continuing/settled compute costs need the real environment. |
| UX-10 | Unsupported isolation refuses before login. Where supported, actual independent agent processes attempt profile/cookie/clipboard/input access while authentication and telemetry paths are exercised with synthetic canaries. No canary disclosure or unauthorized input; loss/restart/reconnect cannot reuse stale grants or sessions. | A refusal fixture qualifies refusal only. An isolated browser claim needs the actual browser/process/OS boundary and capture/telemetry configuration; no simulated directory test can certify it. |

The initial maximum privileged lease of 30 seconds and online Stop-to-new-dispatch target of 2 seconds come from master §29 as pilot test parameters, not published SLAs. Requirements/test design must identify the measured clock and distinguish dispatch cessation, process termination and uncertain external completion. Report sample counts, failures and cancellations; do not infer universal safety or latency guarantees from a finite pass.

The strict check must build the current increment, require every mandatory named suite to execute, reject empty suites, failed builds/tests, skips and TODOs, and cover positive, refusal, concurrency and recovery cases for all four IDs. A missing capability is exercised as a real refusal path; a required remote qualification that has not run remains unqualified. A local success exit must be explicitly limited to local verification and cannot stand in for remote acceptance. Do not add a fake remote pass or weaken a required suite to obtain green output.

## Scope and priorities

### Must

- Create additive `g1-runtime/`, its build, and `g1-runtime/scripts/check.mjs`, following the identity check's strictness while respecting the no-Docker restriction. Reuse existing authority contracts through additive integration; verify actual execution paths rather than disconnected policy helpers alone.
- Define and enforce one effective authority intersection: organization, Space, role, task intent/envelope, tool and qualified runtime capabilities. A client-supplied intent, manifest, current-Space value or MCP tool description cannot grant authority. Unknown effects fail closed.
- Exercise the four journeys through actual local service/process/resource behavior, with negative, concurrent and recovery coverage. Clearly identify unsupported capabilities and their tested refusal behavior.
- Protect every opened shell/SDK/browser/MCP/egress path. Unavailable mandatory containment blocks the affected capability; no automatic local, alternate-region or less-protected fallback is allowed.
- Provide observable single-VM lease ownership, waiting reasons, fenced transfer/recovery and compute-accounting semantics. Serialize only work safe under the common Space trust boundary; serialization is not hostile-code isolation.
- Protect sensitive login at the actual process/resource and telemetry boundaries or refuse it. Preserve separate view/input/clipboard/download grants and all-path mutation barriers where desktop/input capability is opened.
- Produce `docs/planning/g1-f06-plan.md` and `docs/evidence/g1-f06-acceptance.md` in later stages, with requirement-to-check mapping, supported capability matrix, exact candidate/image/check identities, controller results, preserved failures and explicit remaining external work.
- Obtain remote approval before remote actions, then qualify only the approved image/topology/control combination. Approval absence does not waive external tests or authorize a completion claim.

### Should

- Make blocked/waiting/preparing/unknown/pending-recreation states understandable: what happened, what was preserved, whether charges continue, and who can resolve it.
- Publish an operator-readable control matrix, activation/recreation semantics and requalification triggers. Use bounded cleanup of owned test resources and preserve complete raw outputs and cleanup failures.
- Demonstrate the same immutable tenant/Space/Task/resource binding through admission, queueing, execution and recovery. Distinguish worker diagnostics from protected verification receipts.

### Could

- Add inspection summaries for queue state and qualification evidence when they help reviewers reproduce the mandatory journeys. They must not expand the release profile, grants or acceptance scope.

## Explicit non-scope

This increment does not certify whole G1 or G2–G5, provide general native application automation, complete Design Studio/streaming/client distribution, qualify physical devices, formal enterprise SSO or paid model routes, or introduce arbitrary extra workers. It does not claim Windows/macOS worker support, high availability, hardware/Sentry assurance, regulatory compliance, real credential security from synthetic fixtures, or perfect reversal of already completed effects.

F03 recovery, F04 model/FinOps and F05 persistence remain their respective owners; F06 integrates their necessary contracts without rewriting accepted increments. F07 retains complete cross-device qualification. Broader G3 browser/desktop features may remain unsupported, but every path actually opened here must meet its baseline safeguards. Real deployment and Linux containment are in scope but approval-gated, not excluded or replaced with local tests.

## Constraints and qualification evidence

- Preserve accepted G0, G1-local, foundation and F02 checks, protected files and raw evidence. Do not modify existing unrelated F05 worktree changes or hand-edit `.loop/`. No accepted oracle may be weakened, skipped or deleted.
- No Docker Desktop, daemon, container, Docker CLI, Docker-dependent fixture or check may run until the human lifts the 2026-10-16 restriction. This includes the existing F02 identity preflight and Docker-backed PostgreSQL/storage checks. Leave those checks pending; do not mark their tasks done or remove the dependency. If only Docker-dependent work remains, ask the human through `loop_ask`.
- Paid APIs, cloud resources, real credentials, remote deployments, security/access-setting changes and communications remain off without applicable explicit approval. Other reserved actions include shared/production release, personal/nonreproducible data deletion, other-app operation and published-history rewriting. Broad standing approval permits scoped local code/tests/builds/dependencies and project-owned disposable fixtures; it does not lift the Docker prohibition or remote gate.
- No personal browser data or real login is needed for local tests. Keep synthetic fixtures owned, bounded and reproducible; cleanup must not touch unrelated processes, files or resources.
- Electron/GUI checks run through `loop_check` outside the Codex sandbox. Only controller-run checks count as acceptance evidence. A sandbox crash or missing environment is a visible limitation, not a reason to weaken a check.
- Bind qualification to the exact source/build, dependency lock, OS/kernel/architecture/image, workload identity, mounts, enforcement configuration, runtime/policy generations, browser/tool versions and check definitions. Record resource/cost observations and uncertainty. Requalify after relevant changes.
- Local acceptance evidence must enumerate what ran and what remains unqualified: remote Linux enforcement and breakout attempts, actual egress, image/resource enforcement, real one-VM allocations/costs, cross-process sensitive browser/input/telemetry isolation, and any blocked inherited regression checks. Local broker/process/queue observations are never relabeled as deployment evidence.

## Open questions and risks

Remote approval request **q-a1b6151885** was recorded through `loop_ask(kind="approval", blocking=false)` at intake and is unanswered at this brief's creation. It requests the authorized host/provider, image/architecture, access method without sharing secrets, permitted deployment/isolation changes, network destinations, VM/resource/spend caps, test window and cleanup/retention limits. Local intake and Docker-free work can continue. No dependent remote action may proceed without an explicit answer.

| Gap or risk | Required resolution |
| --- | --- |
| No approved remote environment or limits | Human response to q-a1b6151885. Recommended bounded disposable non-production Linux VM is a proposal, not approval or an infrastructure choice already made. |
| Actual isolation backend and host capabilities are unknown | Solution/resources stages inspect and select a compatible qualified profile within approved limits. Do not assume namespaces, virtualization, browser isolation or policy refresh works because an adapter exposes an API. |
| Docker prohibition blocks inherited checks or a proposed backend | Identify dependencies before execution. Choose eligible Docker-free local work without changing acceptance; preserve blocked checks and ask if no eligible work remains. |
| A cooperative broker can be bypassed by arbitrary code | Require actual attempted effects outside cooperative wrappers, including child processes and alternate tool/network paths. Keep policy authority and verification outside worker control. |
| Profile naming or screenshot redaction is mistaken for isolation | Require independent-process probes and telemetry/input observations on the supported deployment; otherwise refuse sensitive login and retain the qualification gap. |
| Lease expiry causes overlapping writers or replay | Fence stale generations, observe actual effects, reconcile unknown in-flight work before ownership transfer and test crash/recreation windows. A timeout is not proof of termination. |
| Waiting hides charges or capacity expansion | Observe allocation attempts/inventory and shared-cost records; distinguish fixture units, estimates and actual provider charges. No new paid resource without approval. |
| Baseline failures or local green output are overclaimed | Preserve original checks/raw failures and current-candidate binding; list blocked/external obligations. Independent review and controller completion remain separate. |

No new product scope decision is invented here. Implementation choices belong to solution/test design within this baseline; changes to requirements, scope or acceptance budgets require human approval. Record authorized routine choices with `loop_note(kind="decision")` and continue.

## Handoff to requirements

Translate each Must into source-cited, independently verifiable requirements mapped to AF-13/UX-03/UX-07/UX-10. Inventory every exposed tool/effect path and its actual enforcement owner; name required local and external observations, suite presence checks, immutable targets, lease/fencing transitions and costs. Preserve positive usefulness as well as denied behavior, independent-process concurrency and restart recovery. Specify what remains blocked by remote approval or Docker before implementation. Carry these same user journeys and qualification limits into product acceptance; the controller owns stage progression and completion.
