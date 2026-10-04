# Agent Fabric
## Master product and technical specification

**Version 1.1 | 2 October 2026 | Reviewed product baseline**

### An owned agent engine. A persistent remote workspace. Every device.

Agent Fabric is a proposed enterprise platform built around one native, model-adaptive harness. Users work through desktop, mobile and web applications; their agents execute in governed remote computers attached to personal or shared Spaces.

The product combines engineering and research workflows, Design Studio, Dispatch, computer use, Fleet Console, persistent memory and evaluated self-improvement. Identity, authorization, budgets, verification and evidence remain consistent across all interfaces.

**Product commitment**

Desktop for detailed creation and operations. Mobile for meaningful work, dispatch, review and control on the go. Web for access without installation. Cloud computers for execution by default; local computers only after explicit enrollment.

| Specification record | Value |
| --- | --- |
| Document status | Reviewed design baseline; implementation and user testing pending |
| Primary audience | Product, engineering, security, platform operations and enterprise stakeholders |
| Core ownership | Our engine owns the loop, context, delegation, tool semantics, memory and completion criteria |
| Distribution | Desktop: macOS, Windows, Linux. Mobile: iOS, Android. Web: supported browsers |
| Default execution | Remote Linux for computer work; no Space VM required for ordinary chat |
| Performance position | World-class performance is an evaluation objective, not a measured claim |

This revision supersedes the v1.0 master as the proposed product contract while retaining its 33 numbered sections and requirements AF-01 to AF-15. It incorporates the native-engine, enterprise-memory, product-module and cross-device decisions. Earlier documents remain historical records, not competing instructions. [D01-D05]

**Revision focus:** make the product understandable in use. Clarify Ask / Plan / Act, group triggers, task ownership, lazy computer startup, draft versus delivery status, reliable Stop, scoped sharing and safe human takeover. The companion review register explains the changes. These are design corrections and extensions, not implemented or usability-tested behavior.


---

# User operating guide

## Five things a user needs to understand

**Space:** who can see this work and where its files and knowledge belong. **Conversation:** where people discuss it. **Task:** the outcome the agent is asked to produce. **Computer:** the remote environment used only when that task needs one. **Result:** the versioned output, with checks and delivery status.

The user should not need to understand a harness, inference gateway, driver lease, vector index or subagent tree to complete ordinary work. Advanced details remain inspectable rather than mandatory setup.

| User intention | Visible experience | Default boundary |
| --- | --- | --- |
| Ask a question | Answer using selected authorized sources | No workspace edits or external writes; no Space VM unless live inspection is explicitly required |
| Plan work | Review a saved plan with assumptions, steps and likely resource needs | No changes to the target system |
| Act on a request | A task card shows the outcome, Space, target, limits and next required decision | Work within the approved task envelope; confirm sensitive external effects separately |
| Review a result | Open its file, design, evidence or preview | Draft readiness, checks and publication are separate facts |
| Continue elsewhere | Open the same task from another device | Same server state; no implicit change of Space or authority |

## A coherent everyday journey

A member opens the Product Space and asks what the team decided. The agent retrieves eligible records without starting the Space computer. The member then requests a dashboard prototype using Act. A compact preflight identifies the Space, sources, draft deliverable, execution needs, payer and limits. The assigned computer starts only if needed.

The member closes the desktop app. On mobile, Inbox shows a request for a missing requirement, not an unexplained spinner. The completed result reads **Draft ready - required checks passed - not published**. Opening Personal Space leaves the Product task bound to Product. Publishing outside the Space requires its own current authorization.

## Progressive disclosure

Global navigation is **Home, Spaces and Inbox**. Inside a Space, use **Chat, Work, Files and Computer**. Designs open in Design Studio from Files or a task; Knowledge and Methods are tabs within Files. Fleet-wide controls, policy, billing and learning administration are available only to qualified roles. Mobile uses the same objects with fewer simultaneous panels.

# Contents and reading conventions

- 1. Executive decisions and boundaries
- 2. Requirements and release traceability
- 3. Spaces and conversation switching
- 4. Collaboration, identity and authority
- 5. Desktop, mobile and web applications
- 6. Synchronization, offline behavior and client safety
- 7. Native engine and system ownership
- 8. Lifecycle, durability and recovery
- 9. Context compiler and model adaptation
- 10. Native specialists, tools and verification
- 11. Enterprise model gateway and cost control
- 12. Remote computers and execution lifecycle
- 13. Security architecture and NVIDIA integration
- 14. Enterprise governance and approvals
- 15. Storage architecture and authoritative records
- 16. Memory STORE: capture and curate
- 17. Memory LOAD: authorize, retrieve and compile
- 18. Memory correction, deletion and privacy
- 19. Design Studio and artifact creation
- 20. Dispatch and scheduling
- 21. Computer use, streaming and takeover
- 22. Fleet Console and operational observability
- 23. Reflect: evidence-driven self-improvement
- 24. Reflect evaluation, publication and rollback
- 25. Interfaces, protocols and extensibility
- 26. Proposed API and configuration contract
- 27. Implementation stack and repository shape
- 28. Deployment, operations and resilience
- 29. Quality, security and usability evaluation
- 30. Build sequence and delivery gates
- 31. Acceptance scenarios and adversarial tests
- 32. Risks, trade-offs and decision register
- 33. Research inheritance and final architecture position

## Contract language

**MUST** identifies a release-blocking requirement. **SHOULD** identifies the intended default with a documented exception process. **MAY** identifies an optional, policy-controlled capability. These terms describe Agent Fabric requirements, not guarantees made by upstream vendors.

**Decided** means part of this design baseline. **Proposed implementation** means a selected engineering direction still requiring prototypes and qualification. **Pilot target** means a measurable objective, not a published service-level agreement. **Deferred** means outside the first release, not silently removed from the product vision.

The source register distinguishes earlier design artifacts [Dxx] from external primary references [Sxx]. Examples and API names are proposed Agent Fabric contracts. They are not commands accepted by an existing vendor product.


---

# 1. Executive decisions and boundaries

## Build the engine, not a launcher around competitors

Agent Fabric MUST complete its native acceptance suite without a Claude Code, Codex, OpenCode, Pi, Hermes or other competitor harness executable owning the work. Approved model libraries, API endpoints and infrastructure dependencies are allowed. Optional compatibility adapters cannot become hidden dependencies of native mode.

We own the session lifecycle, context compiler, model-profile selection, subagent scheduler, action ledger, workspace coordination, memory admission, Reflect proposals and artifact-bound verification. We reuse suitable databases, inference transports, policy evaluators, isolation infrastructure and telemetry libraries.

## One product, explicit ownership

| Decision | Design consequence |
| --- | --- |
| Remote-first execution | Closing a client does not terminate accepted server work or bypass approval |
| Space-scoped collaboration | Every conversation, run, file, memory and computer session has an explicit audience and Space |
| Personal/group defaults | One default personal Space per tenant/user; one default shared Space per tenant/room |
| Durable data, replaceable compute | Committed memory and artifacts survive worker recreation; live files need their own save/snapshot policy |
| Model proposes; software authorizes | No model or ordinary plugin can grant privileges or redefine completion |
| Evidence before success | Protected checks, current artifacts and required approvals determine completion |
| Measured improvement | Reflect changes methods only after independent evaluation and authorized release |

## Product scope

The initial product path includes native engineering work, remote Spaces, real desktop and mobile clients, web access, enterprise model governance, basic memory, Dispatch and operational visibility. Design, computer use and Reflect are first-class modules delivered through the staged gates in section 30, not unbounded promises of universal application support.

The first release does not promise arbitrary operating-system compatibility, lossless design-file conversion, perfect autonomy, automatic model-weight training, or a certified hardware security layer on ordinary VMs. Production writes remain separately authorized. No customer content is pooled across tenants for learning by default.

**Definition of success:** useful tasks finish with trustworthy evidence, bounded total cost and a controllable execution history, while the same work remains accessible across devices.

## Product invariants in everyday language

No surprise action, audience, computer, cost or publication. A user can inspect what will be used, what changed, what remains undone and how to stop. These expectations map to enforceable server contracts rather than relying on wording in a prompt.

Ask / Plan / Act describes intent and allowed effects, not model quality. Design, coding and research are deliverable types, not separate permission modes. Auto model selection and optional specialist delegation remain implementation choices within the user's approved boundary.

---

# 2. Requirements and release traceability

The following product requirements require behavioral and failure-handling tests. An interface, adapter or prompt alone does not establish completion.

| ID | Required behavior | Evidence / detailed section |
| --- | --- | --- |
| AF-01 | Native engine owns all ordinary agent execution | No competitor harness process in native tests; 7-10 |
| AF-02 | Supported model families use evaluated operating profiles | Provider conformance and comparable tasks; 9, 11 |
| AF-03 | Personal and group chats select their own storage and compute | Space-switch and membership tests; 3-4 |
| AF-04 | Desktop, mobile and web operate the same tasks | Sleep, reconnect, handoff and stale-command tests; 5-6 |
| AF-05 | Remote work persists independently of the client | Worker recreation and durable-state tests; 8, 12 |
| AF-06 | Enterprise model access, budgets and cost attribution | LiteLLM integration and ledger reconciliation; 11 |
| AF-07 | Memory is scoped, versioned and source-backed | Store/load, recall, correction and deletion tests; 15-18 |
| AF-08 | Design Studio creates editable, versioned prototypes | Preview isolation, edit conflicts and checks; 19 |
| AF-09 | Dispatch schedules, monitors and safely controls work | Queue, duplicate-command and approval tests; 20 |
| AF-10 | Computer use supports observation and exclusive takeover | Wrong-target, stale-frame and lease tests; 21 |
| AF-11 | Fleet Console exposes resources, logs and authorized controls | Metric correlation and lifecycle-control tests; 22 |
| AF-12 | Reflect proposes, evaluates and versions improvements | Protected holdouts, release and rollback; 23-24 |
| AF-13 | Runtime policy cannot be bypassed by another tool path | Shell, browser, SDK and connector containment; 13-14 |
| AF-14 | The platform recovers without blindly repeating writes | Unknown-outcome, cancellation and replay tests; 8, 28 |
| AF-15 | Integration and data contracts remain portable | Capability negotiation and export tests; 25-27 |
| AF-16 | Chat intent cannot silently authorize task effects | Ask / Plan / Act and human-group-message tests; 4-5, 10, 14 |
| AF-17 | Task, attempt, result and delivery states are unambiguous | State mapping and partial-result tests; 8, 19-20 |
| AF-18 | Computer allocation and continuing charges are explicit | No-VM question, startup and budget-wait tests; 7, 11-12 |
| AF-19 | Stop and takeover remain effective under concurrency | Stale-view Stop and all-path mutation-barrier tests; 6, 21, 26 |
| AF-20 | Onboarding and recovery expose a usable next action | First-task, reconnect, access and quota journeys; 5, 28, 31 |

## Release discipline

A high-severity authorization, isolation, stale-approval or duplicate-effect defect blocks the affected release profile, regardless of task success or latency improvements. A deployment may advertise only the client/model/runtime combinations that have qualified.



---

# 3. Spaces and conversation switching

## The Space is the persistent boundary

A Space owns its audience, storage bindings, memory namespace, approved connectors, behavior releases, runtime profile and default computer. A conversation belongs to one Space; multiple conversations may share it. A task pins that binding when admitted.

| Context | Default binding | Override behavior |
| --- | --- | --- |
| Personal chat | User's default personal Space, VM and storage within the tenant | Select or create another authorized personal/project Space |
| Group chat | Group-owned shared Space, VM and storage | Link another Space only through an authorized audience-checked operation |
| Isolated task | Dedicated temporary or persistent Space | Attach selected knowledge explicitly; no inherited private mounts |
| Existing conversation | Its recorded Space, not the currently open tab | Continue in another Space through an explicit copy/fork workflow |

The server enforces default uniqueness without preventing additional project Spaces. Display names and chat titles are not security identifiers. A group Space belongs to the organization/room, not exclusively to its creator.

## Switching is navigation, not migration

Opening a conversation selects its Space in that tab. It MUST NOT move an active job, remount a different disk under it, merge histories, import the previous prompt, or reuse the prior Space's credentials. Reading stored history, ordinary model answers and retrieval over committed sources do not need to wake a Space VM. A task requiring its filesystem, process or graphical application does. Live inspection is explicitly declared and follows the same resource and permission checks.

Every tab, terminal, preview, approval and queued command carries immutable tenant, Space and target IDs. A global mutable 'current Space' variable is never an authorization source. The header shows audience, target computer, model policy and connection freshness.

## Deliberate sharing

Moving work to a group creates a destination conversation and an audience-approved artifact set or reference. Transfer a sanitized task capsule, not a live vendor session or all personal history. Rebind approvals, credentials and budgets in the destination.

Cross-thread recall is independently configurable. Turning it off does not hide files from a worker allowed to read the same disk. Real privacy separation requires a different Space or another enforced data boundary.

**Acceptance example:** start task A in Team Space, switch to Personal Space, and send task B. A continues against Team storage; B sees only Personal-authorized records. Reconnecting on a phone reproduces the same bindings.

## Object identity and audience

Use immutable Tenant -> Space -> Conversation -> Task -> Run relationships. A Task is the durable requested outcome; a Run is one execution attempt. An AgentSession is a bounded worker within a Run. A ComputerAssignment is the Space's default environment identity; a RuntimeInstance is replaceable compute implementing it. ArtifactVersion and DeliveryOperation are separate records, not aliases for a chat response.

One default personal Space per tenant/user and one default group Space per room remain unchanged. A private project creates an additional Space. An enterprise Personal Space is private from ordinary colleagues, not a separate consumer account or exemption from disclosed enterprise retention.

Within a shared Space, chat participants and data audience MUST derive from the same authoritative membership model. A smaller guest audience cannot be simulated by hiding messages while exposing the full shared filesystem. A channel binding records its audience rules; relinking it does not mutate existing conversation/run bindings.

## Archive, stop and delete are different

Archiving a conversation hides it from active navigation; it does not silently stop its work. Show active tasks and let an authorized user stop them separately. Suspending a computer preserves committed Space data. Deleting a Space is a reviewed lifecycle operation: stop admitting tasks, revoke grants, drain or fence workers, settle unknown actions, then apply retention and deletion policy. It is not a large unqualified Delete button.

---

# 4. Collaboration, identity and authority

## Shared knowledge without shared private accounts

All authorized group members use the same committed group knowledge and canonical files. Each task receives a relevant subset rather than the entire group history. Personal conversations, connector results, browser profiles and secrets do not become group data through membership alone.

Before publishing a room-visible result, the source must permit disclosure to that room audience. The requester having access is insufficient. Private work must use a private task and private output; a sanitized result may be published separately when permitted.

| Grant family | Separately controlled powers |
| --- | --- |
| Reader / contributor | View eligible conversations, read files, propose memories, comment and upload |
| Task operator | Submit, steer, pause and cancel authorized tasks |
| Screen access | View a desktop, control input, access clipboard and transfer files; distinct grants |
| Fleet operator | Drain, restart, resize, snapshot, restore or delete authorized computers |
| Production approver | Approve an exact external operation within a delegated scope |
| Security / learning administrator | Change policies or publish behavior releases; these are separate roles |

Default roles may bundle low-risk grants, but room membership MUST NOT imply all operator powers. An approval requiring separation of duties cannot be issued by the requester or executing agent. Break-glass access needs a reason, expiry, independent audit and review.

## Membership and concurrent work

Admission to a full shared workspace discloses access to its group-readable historical files. Restricted-history guests need a separate/redacted Space or mediated artifact access, not an unrestricted shell on the same volume.

Memory writes use revision checks. Shared file changes use branches, task directories or exclusive write leases. Separate folders and Git worktrees are consistency tools, not hostile-code isolation. A strict one-VM setting serializes work when qualified per-task isolation is unavailable.

Revoking membership blocks new authorized reads, context compilation and actions; invalidates caches; and terminates affected grants. Download and stream revocation follows the explicit delivery-path guarantees in section 14; previously issued bearer URLs are not assumed instantly invalidated. Jobs dependent on a user's personal authority pause unless explicitly reassigned. An organization-authorized scheduled job may continue under its own valid service identity.

Enterprise-private means unavailable to other ordinary users, not an absolute exclusion of disclosed, authorized compliance access. Previously viewed or exported data cannot be recalled.

## A group conversation is not an always-listening agent trigger

By default, messages between people are stored under room policy but do not invoke an agent. An explicit @Agent mention, reply to an agent's outstanding question, or task action starts agent processing. Automated triggers require an approved rule. The UI marks whether a message is discussion, an agent request or an accepted task update.

Every active task has one accountable task owner and a current control revision. Authorized colleagues may comment, propose changes or take over task ownership through a visible control operation. Simultaneous conflicting instructions are not concatenated into a new prompt without resolution. Task ownership does not override organization, Space or source permissions.

A reply composer identifies **Question about this task**, **Update this task** or **New task**. The default follows an explicit reply target. Ambiguous group replies are discussion/questions until resolved; they cannot modify another member's run. Editing an earlier message does not undo dispatched work. Changes to requirements update the task revision and invalidate affected checks or approvals.

## Connected, readable and shareable are separate

Connection setup records the credential owner, allowed resources, read/write scopes, data audience and renewal status. A personal OAuth connection is not a room service account. Use group-approved connections for shared work; if only a personal grant is available, offer a private task and an explicit permitted publication instead of fetching private content into a shared model context.

Room answers use information suitable for the room's full audience. Failed source permission checks show a safe access message without exposing restricted titles or snippets. Membership changes revalidate connectors, in-flight outputs and scheduled identities, not just the conversation list.

---

# 5. Desktop, mobile and web applications

## One product with interfaces suited to the device

| Surface | Required experience |
| --- | --- |
| Desktop: macOS / Windows / Linux | Full workbench: Spaces, conversations, Design Studio, files, code/diffs, terminal, remote desktop, Fleet views and administration |
| Mobile: iOS / Android | Substantive chat and voice input, attachments, dispatch, approvals, artifact/design review, comments, status, resource summaries and remote takeover |
| Web | No-install access to conversations, shared Spaces, task review, previews and enterprise administration |

Mobile is not only a notification viewer. It SHOULD support common complete workflows, while large canvas edits, dense code review and multi-panel diagnostics are optimized for desktop. Remote-desktop streaming is optional for most actions; task cards and direct controls should handle normal mobile work.

## Application architecture

Use React for the web workbench and an Electron desktop carrier. Use React Native for mobile, with Expo development builds where native streaming and device integrations qualify. Share API clients, schemas, synchronization code, design tokens and business rules; adapt navigation and interaction to each platform. React Native documents platform-specific components, and Expo development builds allow native customization beyond Expo Go. [S02, S03]

Installing a client MUST NOT enroll its device as an execution worker. Local filesystem access, local screen capture, microphones, cameras and local computer use require purpose-specific consent plus enterprise permission. A separate enrollment flow registers a local worker and advertises its real assurance level.

## Experience and accessibility

Use global Home, Spaces and Inbox. A Space exposes Chat, Work, Files and Computer. Work contains tasks and automations; Files contains artifacts, Knowledge and Methods. Design Studio is the editor for a design artifact, not a second competing task system. Fleet-wide views and administration are role-scoped. Mobile preserves these object names and opens detail panels as screens. Preserve keyboard support, screen-reader labels, touch targets, zoom, color-independent status and reduced-motion behavior.

Voice requests display a transcript before high-impact action confirmation. Uploads show progress, destination Space and final server acknowledgement. Notifications avoid sensitive content on lock screens by default.

**First cross-device proof:** start on desktop, sleep the laptop, review and steer on mobile, then reopen desktop into the same authoritative task state. The remote job continues without using a phone background task as its execution host.

## Intent controls and a useful default

New conversations begin in Ask. The composer provides Ask, Plan and Act without forcing users to select a model, tool or specialist. A clear action request may produce an Act preflight, but the engine cannot silently exceed the current intent ceiling. A user can explicitly choose Act or accept the proposed task card. Established Act tasks may continue within their recorded envelope without a modal for every step.

Ask permits authorized retrieval and answers, not target-file mutation or external writes. Plan adds a versioned plan artifact through the artifact service but still cannot change the target system. Routine message storage, audit records and explicit memory controls are not prohibited merely because the user chose Ask. Live read-only inspection of a computer is a declared task capability with any necessary startup consent, not an invisible exception.

A preflight shows the intended result, selected sources, Space/audience, computer only when required, approved model policy, payer and cost limits, and actions that will need later approval. Defaults come from the Space. Small authorized operations use a compact inline card; choosing Start in Act is the task-level confirmation, not the first of two redundant dialogs. High-impact operations show the full required confirmation surface. Unknown cost or support is labeled, not estimated with false precision.

## Progressive onboarding

The administrator qualifies a model route, region, budget, runtime image/policy and membership rules before shared execution. The user then signs in, sees whether the current Space is personal or shared, and can ask a question without provisioning compute. A guided first Act request demonstrates a saved result and evidence. Connect additional data sources when needed, not as a mandatory catalog setup task.

Display a useful empty state and next action: no files -> upload or connect; no model route -> contact an authorized administrator; computer asleep -> starts when required; incompatible app -> choose a qualified target or supported output. Do not show an endless setup spinner. Persist onboarding progress server-side and keep client-only permissions purpose-specific.

---

# 6. Synchronization, offline behavior and client safety

## Server state is authoritative

Ordinary state-changing commands use an idempotency key, explicit target, expected revision and expiry. Stop/revoke is a monotonic exception described below; a merely stale progress revision cannot defeat it. Acknowledged requests receive a stable command/run ID. Reconnecting clients query the command status before resubmitting. Events have ordered sequence numbers per stream; a durable snapshot plus cursor lets a client recover missed updates. Token streaming is transient display data, not proof of a committed result.

| Situation | Required behavior |
| --- | --- |
| App closed or device asleep | Accepted remote work continues within permissions; approvals still pause it |
| Offline drafting | Store an explicitly marked unsent draft, subject to device policy |
| Offline control request | Revalidate on reconnection; show pending, never falsely executed |
| Sensitive approval while offline | Do not queue blanket consent; reconnect, refresh the exact operation and reauthenticate |
| Expired cursor or local cache | Reload an authorized snapshot and purge revoked local records |
| Simultaneous artifact edits | Compare base revisions; reconcile or expose a conflict, never silently overwrite |

Mobile background services support notification/synchronization purposes only; they are not the long-running harness. Android documents distinct background-work options and lifecycle constraints. The design does not rely on unrestricted background execution on either mobile platform. [S04]

## Client trust boundary

Keep provider keys, fleet credentials and authorization policy out of clients. Use system-browser authentication, short-lived sessions, secure OS credential storage and server-side revocation. Deep links identify objects, never grant access. A push message is a hint to fetch state, not an approval or credential.

Electron renderers MUST use context isolation and sandboxing, with Node access disabled for untrusted content. Validate IPC senders and arguments; restrict navigation, external URLs and permission requests. Serve generated previews on an isolated origin without privileged bridges. These controls follow Electron's published security guidance. [S01]

Signed updates, version negotiation, rollback protection and minimum-supported security versions are release requirements. Enterprise policy controls downloads, clipboard, local cache retention and screen recordings. Remote wipe is best-effort after a disconnected device reconnects; do not promise erasure of prior exports.

A stale status panel must visibly show its last update. Loss of connectivity is neither evidence of task success nor permission to assume the agent has stopped.

## Stop must work from a stale progress view

An authenticated Stop identifies the immutable run or task scope and has an idempotency key. The server rechecks the actor's current stop authority and records a new cancellation/fencing generation; it does not reject the request merely because progress advanced after the user opened the screen. Stop-task blocks new attempts until an explicit authorized retry; Stop-run targets only that attempt.

A Stop response distinguishes request accepted, dispatch fenced, processes terminated and unknown external outcomes. It does not claim to undo a sent email, committed transaction or remote deployment. If an offline device queues Stop, show **Not delivered** until the server accepts it; the user should be offered another online control path, not a false Stopped badge.

For other controls, stale revision responses return a safe reason and a refreshed authorized object. Never silently resend Approve, Publish, Resize, Restore or a GUI click against changed state. Input events expire quickly and are not replayed after reconnection.

---

# 7. Native engine and system ownership

## Logical architecture

```text
Desktop / Mobile / Web / CLI / Approved channels
                       |
             Authenticated Task API
                       |
         Space resolver + native task controller
              |                        |
     Session runner(s)           Trusted services
 context -> model proposal       policy / budgets
 observe -> next step            approvals / memory
              |                  evidence / release
       Model + action brokers           |
              +-------------------------+
                       |
    Qualified Space VM / task sandbox / desktop
                       |
       Approved APIs, models and artifact stores
```

Session runners may execute in the remote Space environment, but they do not receive controller authority. Arbitrary tool processes and third-party executable plugins remain behind separate enforcement boundaries. The application can begin as a modular core rather than a service for every box.

| Module | Authoritative responsibility |
| --- | --- |
| Native session kernel | Turns, messages, streaming, interruption and validated proposals |
| Workflow controller | Task graph, gates, leases, continuation and terminal outcomes |
| Context / model-profile layer | Authorized request assembly and compatible provider encoding |
| Action broker | Effect validation, authorization, dispatch and operation settlement |
| Space/runtime manager | Workspace binding, lifecycle and qualified execution resources |
| Memory / evidence services | Knowledge admission and provenance; protected artifact/check records |
| Reflect release service | Candidate publication after evaluation; no self-authorization |

Use Temporal for durable orchestration infrastructure, not as a second planner. Temporal owns its workflow event history; our workflow code owns task semantics. PostgreSQL holds configuration, action/memory records and query projections with explicit owners. Large payloads live in artifact storage rather than workflow history. [S13, S14]

The source of truth is defined per record, not as several independent copies of task state. Cross-store notifications use idempotent outboxes and reconciliation. A query view is rebuildable; it cannot authorize an action when the authoritative policy or operation record disagrees.

No model-written summary may create a budget, approval, completed check or fleet-administrator grant.

## Three execution classes, one native engine

**Conversation work** runs the native session engine in a qualified service worker with no Space filesystem or unrestricted shell. It may invoke authorized model, memory and read-only connector APIs. **Computer work** uses the Space's assigned environment for shell, files, builds, browser or desktop operations. **External-effect work** passes through a target-aware broker or dedicated executor regardless of where the session runs.

The classification does not weaken isolation: service workers still enforce tenant/source policy and approved model egress. It avoids making a simple answer depend on booting a desktop VM. A classified need for computer access can trigger a visible capability/preflight transition, never a hidden mounting of another Space's disk.

A service-mode failure must not fall back to a user's local machine or an unapproved region. The controller owns mode changes, not the model's choice of tool name.

---

# 8. Lifecycle, durability and recovery

## Task, attempt and outcome are separate

A Task records the requested outcome and requirement revision. A Run is one attempt, containing native agent sessions and their operations. Internal transport retries retain the operation identity; starting over after a terminal failure creates a new Run. New attempts do not erase previous evidence or charges.

The session loop performs model/tool iteration. The workflow loop controls only the gates applicable to the deliverable. An ordinary answer does not need a deployment gate; an explicitly requested publication does.

| Run lifecycle | Meaning and next action |
| --- | --- |
| Queued / preparing | Admitted; waiting for capacity or validating computer/resources |
| Running / verifying | Executing authorized work or checking its result |
| Waiting | Paused on a reason: input, approval, budget, resource, connection or permission; show who can resolve it |
| Paused | Explicitly stopped at a resumable safe boundary; resume requires current authorization |
| Cancelling / reconciling | Stopping further work or establishing an uncertain outcome; not yet safely terminal |
| Succeeded / partial / failed / cancelled | Terminal attempt outcome with evidence; retry is a new Run |

Budget exhaustion is normally Waiting: budget until a configured expiry or explicit stop, not an automatically terminal state that later magically resumes. A denied action is blocked without widening policy; the run can wait for an allowed alternative or terminate with a documented reason. Quarantined is a runtime/security condition that blocks the run; it is not a substitute for describing the task outcome.

## Result readiness is not external delivery

An artifact separately records draft/candidate version, verification status and accepted version. A DeliveryOperation separately records requested, awaiting-approval, in-progress, confirmed, failed or unknown publication/application. A notification also has its own delivery state.

For **prepare a proposal**, success means the agreed draft and checks exist. The card can read **Draft ready - checks passed - not published**. For **publish the proposal**, the overall task remains awaiting the required delivery until it is authorized and confirmed. A later Publish button creates a new, linked delivery request; it does not retroactively grant the original task broad external access.

An outcome card reports what was produced, which checks ran or were unavailable, files affected, external effects, remaining work and cost status. Do not use Completed as a substitute for Delivered, Accepted or Deployed.

## Effect protocol

Before an action, record operation ID, exact target, argument digest, artifact preconditions, actor, policy revision, approval, budget reservation and execution lease. Validate complete tool arguments; never execute a partial streamed argument. Settle the outcome with a receipt from the execution path.

If an external operation succeeds but acknowledgement is lost, its state is unknown, not safely failed. Use downstream idempotency, status lookup and reconciliation. If safe deduplication is unavailable, require a human or domain-specific recovery process. Temporal's activity retry semantics do not make arbitrary external effects exactly once. [S14]

## Interruption and cancellation

Pause stops new actions and waits for an advertised safe boundary. Cancel invalidates further dispatch, propagates to children/process groups and revokes capabilities. It cannot reverse an operation already accepted by another system. Track cancel-requested separately from confirmed termination; quarantine an unreachable worker as necessary.

On recovery, validate membership, active policy, approval expiry, remaining budget and worker generation. Use fencing tokens so a stale worker cannot publish over its replacement. Reconcile incomplete actions before asking the model to continue.

Replay reconstructs state from recorded events. A replay MUST NOT resubmit model requests or execute write tools. Re-running a task for model comparison is a new attempt; qualified model selection within a run is recorded per call.

Pin engine, behavior, schema and environment versions for each attempt. Upgrade at validated boundaries; test state migrations and preserve a usable recovery path.


---

# 9. Context compiler and model adaptation

## Compile a request, do not append forever

Construct each model request from typed records: approved instructions, user goal, exact task obligations, selected repository structure, source-linked observations, eligible memories, recent dialogue and required tool schemas. Each record carries scope, provenance, time and trust classification.

Authorize before retrieval; budget before invocation. Preserve unresolved hypotheses, failed approaches, pending external operations and verification state through compaction. Keep source evidence retrievable under retention policy. Summarizing hostile tool output cannot elevate it into an instruction or permission.

Codex's documented loop illustrates the importance of prompt assembly, caching and compaction; Aider's repository map provides a token-budgeted code-structure reference. Our compiler is an independent implementation with measurable strategies, not a claim of equivalent hidden behavior. [S29, S36]

## Select a full operating profile

```text
model + instruction pack + tool presentation
      + context policy + reasoning controls
      + verifier + runtime requirements
```

The adapter declares supported modalities, schema/tool dialect, streaming, context limits, usage reporting, cancellation, caching and optional provider-specific features. Required unsupported features fail explicitly; they are not silently dropped by a gateway translation.

Use capability and data-policy filters first, then measured task outcomes, cost, latency and capacity. No task receives an unapproved provider or region because a preferred model is busy. Keep explicit routing rules initially; adaptive selection requires validated outcome data, not model self-confidence alone.

## Handoffs and caching

Switch models at safe boundaries using an approved task capsule: requirements, evidence, uncertainty, artifact references, checks and next safe action. Opaque reasoning items and KV caches remain provider-scoped. Cache loss and context revalidation are explicit switch costs.

Provider prompt-prefix caching, response caching and long-term memory are different mechanisms. Keep stable authorized prompt regions where useful, but never let cache efficiency override updated permissions. Context fingerprints include policy/membership revisions and sources; final model requests record the actual profile and manifest.

Count planning, reflection, embeddings and reranking in the task or authorized maintenance budget. Retain unsettled reservations until usage is reconciled.

## An understandable model choice

Default the user control to **Auto - organization approved**. Advanced users may select a qualified profile with its modality, data policy and estimated cost class visible. Keep actual model/profile and fallback reasons in task details. A manual pin is honored unless the user or policy explicitly permits an equivalent fallback; otherwise expose Waiting: model unavailable.

Do not interpret Fast, Balanced or Thorough as authority levels. Quality/latency preference and Ask / Plan / Act are separate dimensions. The model is selected for the current capability, not because a user must understand which vendor is best for each specialist.

Use selected Sources, pinned knowledge and this conversation as the visible context scope. Cross-thread recall is a separate setting. An Ask answer may save no cross-task knowledge while still producing the ordinary governed transcript. This distinction should be available in the composer and memory inspector.

---

# 10. Native specialists, tools and verification

## Delegation is selective

A native child session has a role, instructions, model profile, selected context, tool profile, budget, workspace and result schema. A lead may propose a specialist; the scheduler validates the role and capacity before creating it. Difficulty is only one signal alongside risk, ambiguity, specialization and independent work.

| Task shape | Default execution |
| --- | --- |
| Small obvious change | One agent plus required checks |
| Routine feature | Implementer, protected test runner, required review |
| Ambiguous incident | Bounded parallel read-only investigators, then synthesis |
| High-impact change | Approved plan, constrained implementation, independent review and approval |

Children receive the intersection of parent delegation, role, Space and runtime permissions. Reserve rather than copy their budgets. Enforce depth, fan-out, time and repair-cycle limits. The parent receives evidence-linked findings, not every token from every worker.

## Tools as effect contracts

A tool declares versioned schemas, side-effect class, resource scope, required grants, timeout, idempotency/reconciliation behavior and output limits. Tool discovery exposes only eligible capabilities. Large results become referenced artifacts with exit status and truncation markers. Shell, SDK, browser and MCP paths MUST face the same actual resource boundary.

Use independent branches/snapshots for parallel changes and digest preconditions for edits. Serialize overlapping writes. A worktree is not isolation from malicious code. Integrated output must be retested even when individual branches passed.

## Protected completion

The verifier runs approved checks against the exact artifact, environment image, dependency lock and check definition. It issues a check receipt under an identity separate from the implementer. Reviews also bind to the artifact digest. New edits invalidate affected receipts.

Implementation agents may propose new tests but cannot disable protected checks or rewrite scoring rules. Model review supplements executable checks and human judgment. A reviewer using another model may still make correlated errors.

For production, use a separate executor and an exact expiring approval. Signing keys remain outside agent-readable storage. A database write or blockchain transaction is not undone by reverting a file; recovery must be domain-specific.

## A task envelope, not repeated permission prompts

Admission creates a TaskEnvelope binding requirement revision, allowed effect classes, target resources, source audience, selected model/runtime policy, cost ceilings, allowed continuation and required verification. It may preauthorize routine operations such as editing a task draft or running an approved local test. A tool proposal still passes the broker, but does not require another human dialog when it is already inside that envelope.

Effects are classified by the resource and operation, not only the tool name. A shell command can make an external write; a browser button can send data; a file edit can alter protected policy. Those remain governed by their actual effects. Unknown high-impact operations are blocked or require human execution, not auto-approved because they use an allowed application.

Verification is proportional to the deliverable: source support for a research answer, format/formula checks for a file, build/interaction checks for a prototype, and exact postconditions for an external action. A proposed check set cannot weaken mandatory enterprise controls. Human acceptance records a judgment without fabricating a missing automated test result.

---

# 11. Enterprise model gateway and cost control

## LiteLLM beneath our native engine

Use a controlled model-egress path to an enterprise LiteLLM deployment or a customer's qualified gateway. LiteLLM provides unified model access, virtual keys and spending controls; it does not own our task loop, Space permissions, memory lifecycle or VM metrics. Edition-dependent controls must be included in procurement and release qualification. [S05, S08]

The controller selects the eligible logical profile. Gateway deployment failover may choose only approved equivalents. Switching model semantics or data residency requires revalidation by our profile layer. Use one coordinated retry budget across engine and gateway to prevent multiplied attempts.

## Accounting boundaries

| Accountable entity | Our requirement |
| --- | --- |
| Tenant / department | Budget, allowed providers, cost-center reporting and region restrictions |
| User / Space | Attribution and concurrency controls without merging data scopes |
| Run / children | Atomic shared reservation for model, tool and execution costs |
| Maintenance | Explicit allowance for memory enrichment, indexing and Reflect |
| Provider usage | Correlation to requests, reconciliation, estimated versus settled charges |

LiteLLM distinguishes personal, team and team-member budgets. A team-associated key does not automatically consume its owner's personal budget under the current documented behavior. Any aggregate per-person ceiling across rooms belongs in our ledger and must be tested. [S06]

The server stamps tenant, user, Space, run and purpose. A client-supplied team tag cannot select another payer. Provider credentials remain brokered; clients and arbitrary tool processes never receive gateway master keys. Customer-owned keys must be handled under a clear custody, rotation and billing contract.

## Safe caching and provider compatibility

Disable semantic response caching for agent action turns. LiteLLM explicitly warns that near-identical multi-turn prompts can replay stale responses and repeat tools. Approved exact caching still needs Space/audience/version keys and cannot authorize an action. Provider prompt caching is a separate optimization. [S07]

LiteLLM's preference/feedback memory API is not a second authoritative store for our room-scoped knowledge. Use it only through an explicit projection or disable it for native prompts. [S35]

Do not advertise exact invoice caps when provider metering is delayed or an in-flight request cannot be stopped. Reserve conservatively, cap output and duration where supported, block new work at exhaustion, reconcile unknown costs, and disclose the maximum permitted overrun policy.

## Make cost ownership visible before work

A task shows payer/cost center, configured task allowance, estimated versus settled consumption, and any separate persistent storage or reserved-compute charges. An estimate is a range with assumptions, not an invoice guarantee. Ordinary chat may incur model cost without Space-computer cost. Waiting for approval does not consume model turns; idle-compute policy determines whether the VM remains billable.

At a budget threshold, stop admitting new chargeable steps, preserve committed work and show **Waiting for budget** with an authorized top-up or smaller-scope alternative. Neither the model nor Reflect can raise the allowance. Reserve capacity for safe settlement/checkpoint operations where supported; disclose any bounded in-flight overrun.

Shared VM usage is charged once to its owning Space. Per-task views use an explicit allocation method or display unallocated shared cost; do not sum the full machine bill into every concurrent task. Storage continues under retention policy after Stop. A lifecycle screen must distinguish stop compute, archive a conversation and delete retained data.

---

# 12. Remote computers and execution lifecycle

## Persistent Space identity, controlled compute allocation

By default, each personal Space has its own ComputerAssignment and storage; each group Space has one group-owned ComputerAssignment and canonical volume. The assignment materializes as its dedicated qualified VM when needed and may be suspended afterward. Several conversations can use that computer; they do not share one unrestricted agent process or writable credential home. An explicit policy may permit temporary child workers or a different qualified computer; navigation alone never changes the assignment.

Separate Space identity, storage binding, runtime instance and active execution lease. Suspending or replacing an instance does not delete committed knowledge. Live file durability, memory commit durability and VM snapshot consistency are distinct guarantees.

| Runtime state | Controller responsibility |
| --- | --- |
| Provisioning / validating | Verify image, policy, mounts, capacity and workload identity |
| Ready / running | Admit only eligible tasks and keep quotas/leases current |
| Draining / suspending | Stop new work; reach safe boundaries; persist eligible state |
| Suspended / resuming | Restore approved data; recheck identity, policy and unknown operations |
| Unreachable / quarantined | Revoke authority; distinguish unknown from confirmed stopped |
| Deleting | Coordinate retention, exports, snapshots and separate Space-data deletion |

Remote developer workspaces provide shell, builds, tests, editors, browser and authenticated previews. Computer workspaces add separately qualified graphical applications and desktop tooling. CPU-only workers may call approved remote model endpoints; private GPU inference is a separate resource class.

## Deployment profiles

Offer a managed cloud profile, a dedicated/customer-controlled infrastructure profile and an explicit enrolled-workstation profile. Each publishes its tested operating system, architecture, egress, identity, resource limits and recovery behavior. An interface on Windows does not imply Windows tool execution in a Linux worker.

Start with qualified remote Linux. OpenShell documents Docker, Podman, Kubernetes and MicroVM drivers, but host/kernel support determines available controls; Linux MicroVM execution requires host virtualization support. Our runtime adapter must verify actual resource enforcement rather than infer it from a declared limit. [S10]

No public SSH, RDP or VNC endpoint is exposed by default. Use authenticated short-lived relays. File transfers, previews and desktop streams are scoped operations. Secrets and host-admin sockets must not appear in workspace mounts.

Always reachable is not always consuming compute. Show cold-start, suspension and storage costs separately; offer always-running profiles only with explicit cost and lifecycle policy.

## Computer startup and contention

Provision or wake only after a task requiring computer capabilities is admitted. Validate image/policy, mounts, execution identity and current access before opening a terminal or publishing a ready state. Show Preparing computer with the actual phase; a failure offers Retry setup, Choose a qualified profile or Contact administrator as applicable. Never hide a failed provision behind a task-running spinner.

Within the default single VM, each run has its own process identity, scratch directory, dependency context and resource lease where the backend supports them. Canonical file writes use controlled commits, not unconstrained simultaneous edits. Conflicting file, package-install, browser-profile or desktop actions queue explicitly with an owner and reason. Independent model calls may remain parallel; they do not justify parallel conflicting filesystem writes.

If strong per-task isolation is unavailable, serialize only workloads safe under the common Space trust model. Untrusted or differently privileged work is blocked or uses an explicitly allowed isolated child worker. A lock or serialization does not make malicious code safe. Additional workers stay off by default in a strict one-computer Space; no silent fleet expansion.

Suspension requires no active driver or noncheckpointable workload, a saved state policy and settled resource leases. A long-lived development server may keep a workspace active under an explicit keep-alive cost setting. Resuming does not resurrect expired credentials or permissions.

---

# 13. Security architecture and NVIDIA integration

## Independent authority, defense in depth

Assume that repositories, web pages, files, retrieved memories, model outputs and third-party plugins may be malicious. The trusted computing base includes identity, authorization, mandatory brokers, runtime enforcement, protected verification and audit controls. The agent cannot replace those services through a plugin.

OpenShell separates gateway control-plane responsibilities from a supervisor inside the sandbox that launches restricted agent processes and enforces local policy. We integrate that boundary through a qualified runtime adapter; it does not supply the entire product interface or application-specific authorization. [S09]

| Layer | Proposed control |
| --- | --- |
| Identity and policy | Short-lived user/workload identities; least privilege; independent decisions |
| Files and processes | Approved mounts, restricted child identities, process limits and protected control services |
| Network and models | Constrained destinations and request paths; no alternate SDK/browser bypass |
| Secrets | Brokered, narrowly scoped credentials; no broad keys in prompts or workspace files |
| Applications | Target-aware checks for deployments, data writes, signing and sensitive GUI actions |
| Evidence | Separate protected receipts from worker-writable diagnostic logs |

OpenShell distinguishes startup-time filesystem/process policy from controls that may refresh while running. Policy changes therefore trigger the correct refresh or safe recreation, not a misleading immediate-success indicator. [S11]

## Qualified hardware enhancement

NVIDIA describes Sentry as an out-of-band watchdog using BlueField-4 DPUs in its Open Agent Safety Platform reference design. It is an optional enterprise integration, not a property of every remote VM. Record deployment evidence and actual integration scope before displaying a hardware-assurance claim. [S12]

The initial product must remain usable without that hardware, while preserving the same product-level authorization and evidence contracts. No mandatory control may silently degrade because a worker lacks support.

## Limits we must expose

Allowed operations can still be wrong. A hostname allowlist does not prove that data sent to an allowed endpoint is safe. A policy advisor or prover cannot establish application correctness beyond its modeled assumptions. Runtime isolation does not protect an insecure desktop client, recall exported data or undo an approved payment.

Policy revocation must not rely only on a disconnected supervisor receiving a refresh. Sensitive execution requires current grants and short leases; controller loss stops privileged continuation at expiry.

## Runtime qualification must match the displayed claim

Translate task envelopes into the actual controls of the selected runtime. A network-policy update and a process/filesystem restriction may have different activation semantics; show Pending recreation when a stronger boundary cannot be applied live. Do not mark the new policy Active until the worker reports the matching qualified generation. [S09-S11]

No OpenShell or Sentry logo substitutes for a deployment record. Expose control coverage and last verification to administrators, while ordinary users see a clear policy profile and any limitation that affects the requested work. The product remains operable on qualified software-only infrastructure without claiming hardware assurance.

---

# 14. Enterprise governance and approvals

## A policy hierarchy with no privilege inflation

Enterprise policy sets the outer boundary. Space, role, task and tool rules can restrict it further. Effective authority is their intersection with runtime capabilities. User settings may choose stricter behavior; neither a prompt nor a room administrator can override organization prohibitions.

Use SSO/directory provisioning with explicit joiner, mover and leaver flows. Model access, data access, desktop control, compute administration and production approval are separate grants. Identity-provider integration, customer-managed keys and audit export are qualification items, not presumed certifications.

| Operation | Default governance |
| --- | --- |
| Read eligible Space artifacts | Membership plus source/audience permission |
| Change workspace files | Task grant, version precondition and conflict handling |
| Submit external write | Effect-class policy, explicit task intent and required exact-action human gate |
| Restart/resize shared VM | Fleet grant, affected-run disclosure and renewed consent when required |
| Publish learned behavior | Independent evaluation and release grant |
| Change security/retention | Dedicated administrator workflow; never agent-installed |

## Approval contract

An approval binds tenant, Space, actor, task, exact target/action, normalized argument or artifact digest, policy revision, expiry and any spending/value limits. The action broker validates those bindings at dispatch. An altered recipient, file, transaction, target or policy invalidates affected approval.

Sensitive actions require fresh authentication and, where configured, a distinct approver. A push notification, screenshot or old chat message is not a bearer authorization. No response means pause. Offline approvals are not blindly delivered when connectivity returns.

Open Policy Agent is a candidate policy-decision component. It separates policy evaluation from application code; enforcement must still occur in our brokers and runtime. [S15]

## Security operations

Provide independent revoke/quarantine controls, key rotation, access reviews, policy-diff review and incident export. Record approved break-glass access without giving the worker audit-deletion rights. Use a signed, allowlisted extension catalog with dependency scanning and rollback.

A customer's regulatory obligations, contracts and region policy determine retention and access. Collect only needed data; identify subprocessors and processing destinations for generation, embeddings, screenshots and telemetry. Do not equate local execution with local-only inference.

## Separate intent, permission, approval and authentication

Intent says what the user requested. Permission says what the user and executor may do. Approval is a current decision on a particular required effect. Authentication establishes the actor. None alone replaces the others. A task-owner role cannot spend another user's authority, and accepting a design does not approve deployment.

Organization policy defines which bounded routine writes can execute under a recorded task envelope. Production, destructive, financial, security-sensitive and external-disclosure operations retain the required precise gate. Group-approved read access does not grant write access. Scope expansion requires a revised envelope and any affected approvals.

An approval card includes a human-readable diff, target, destination audience, requested effect, impact, cost and expiry. Show only affected changes when reapproval is needed, but bind the approved digest in full. When no approver is available, preserve the draft and wait or expire according to policy; never infer consent from silence.

## Strict revocation requires the delivery path to enforce it

App membership removal does not by itself invalidate an already issued object-store bearer URL. S3 documents that presigned URLs may be reused until expiry and that an already-started download can continue; object-store credential/policy changes have their own semantics. [S38]

For data requiring online revocation, route reads through an authorization-checking download/stream broker with short bounded checks and no long-lived direct bearer link. Where direct signed URLs are allowed, disclose their maximum exposure window, keep expiry short and use provider controls where applicable. No path can recall bytes already delivered. Apply the same reasoning to previews, exported caches and desktop recordings.

---

# 15. Storage architecture and authoritative records

## Distinct records, explicit owners

| Record class | Contents and authority |
| --- | --- |
| Space / Membership | Ownership, audience, bindings and revocation revision; identity service |
| Run / AgentSession | Task graph and session progression; native controller/kernel |
| Action / Approval / Budget | Authorized effects and reservations; trusted brokers |
| ArtifactVersion / CheckReceipt | Files, designs, patches and protected checks; artifact/verifier services |
| MemoryRevision / RetrievalManifest | Source-backed knowledge and selected context; memory service |
| Reflection / BehaviorRelease | Hypotheses, candidates and published methods; independent release path |
| Runtime / DriverLease | Computer state, session driver and fencing generation; lifecycle broker |

Use PostgreSQL for scoped metadata, memory revisions, action records and transactional outboxes. Use encrypted object storage for large artifacts and retained evidence. Space volumes hold editable files; committed artifact versions have a separate manifest. Search indexes and caches are derived, rebuildable views.

Do not treat a volume snapshot as a database transaction or a successful memory commit as proof that every live file is saved. Explicitly display unsaved or uncheckpointed work where possible. Deduplicate content within permitted scopes without revealing cross-tenant file existence.

## Isolation and indexing

Every content-bearing record carries tenant and scope; every relation validates matching ownership or an explicit sharing grant. Use restricted application database roles and row-level policies as defense in depth. PostgreSQL documents bypass behavior for superusers, BYPASSRLS roles and normally table owners, so worker processes must never hold those credentials. [S16]

Start retrieval with exact indexes, PostgreSQL full-text and pgvector. Approximate vector retrieval needs tests under tenant/source filters; eligible results can be under-returned unless indexing/search settings are appropriate. Similarity is neither permission nor factual certainty. [S17]

## Consistency across stores

Publish an artifact only after its bytes and manifest are durably confirmed; uncommitted uploads are quarantined or garbage-collected. A transactional outbox schedules derived indexing and Reflect jobs. Workers revalidate deletion and authorization when processing delayed jobs.

Backups need encrypted access, tested restores and documented recovery objectives. On restore, apply revocation/deletion tombstones and current policy before rehydrating workspace data. Preserve minimal audit metadata where required without embedding indefinitely retained private content.

## Draft, canonical and evidence storage are distinct

Persist task drafts and autosaved design edits as recoverable versions. They remain visible only to the authorized Space audience; draft does not mean private from other Space members. Canonical file promotion uses an expected base revision, validation and an authorized merge/apply operation. Protected evidence is written by the verifier, not copied from an agent's self-report.

A stale draft can be rebased, explicitly compared or retained as a new variant. It cannot overwrite a newer accepted version on reconnect. Post-save status distinguishes acknowledged artifact bytes from unsaved editor state. Room members can inspect provenance without acquiring permission to alter canonical files.

One service owns each record class. Task/control state is not recovered from free-form conversation; chat history is not a command queue; a tool log is not an approval; a screen recording is not a replay authorization.

---

# 16. Memory STORE: capture and curate

## Separate execution facts from reusable knowledge

Execution state is authoritative task/operation data. Conversation history records who said what. Working context is a disposable selection. Facts and decisions are attributed records. Episodes and procedures describe evidence-backed experience. Artifacts hold original files and observations.

LangGraph's distinction between thread checkpoints and namespaced long-term memory is a useful conceptual reference. Hermes provides another reference for bounded memory and searchable history. Our service owns its own concurrency, source permissions and lifecycle. [S18, S19]

## Fast path

For an accepted message, settled tool result or explicit memory request: authenticate, resolve scope and audience, apply secret/retention rules, then commit an idempotent event and accepted typed revision with a durable outbox job. Acknowledge only after commit.

'Remember here' targets the current authorized Space. 'Remember for me' offered inside a group is an explicit group-to-personal copy and must pass export/audience policy; it cannot silently extract room content. 'Use only in this task' disables cross-task promotion but does not silently disable mandatory transcript or audit retention. A review-required write is acknowledged as pending, not approved.

## Curated path

```text
Committed event -> candidate extraction -> source binding
 -> scope/secrets/trust checks -> deduplication and conflict check
 -> accepted revision or review item -> derived indexes
```

Use deterministic extraction for structured observations where possible. A model may propose a useful fact or lesson, not decide authority. Record subject, value, source revision, asserted-by identity, recorded time, validity interval, verification method, classification, expiry and superseded record.

Statuses distinguish proposed, user-asserted, source-verified, disputed, superseded, expired and deleted. 'Verified' identifies a check and time, not timeless truth. Do not convert an AI hypothesis into fact by summarizing it repeatedly.

Deduplicate by scope/source/subject; never merge claims solely because embeddings are similar. A late summarizer cannot replace a whole group profile based on an old revision. Keep unresolved contradictions visible.

Summarization, embedding and enrichment calls follow the source's allowed provider and region and consume an explicit budget. If enrichment is unavailable, retain the committed record and defer indexing; do not lose an acknowledged memory.

## Sensible memory defaults

Explicit user instructions, confirmed project decisions and structured verified observations can become attributed records under Space policy. Inferred durable preferences or lessons are shown as proposals or admitted through a narrowly defined rule; ordinary discussion is not automatically treated as an approved team decision. Saving a preference does not require a Reflect experiment.

Present independent controls for sources attached to this task, permission to recall older conversations, and permission to save new reusable memories. Disabling one does not imply the others. User-facing status says Saved here, Pending review or Not saved; each acknowledgment maps to the canonical commit status.

---

# 17. Memory LOAD: authorize, retrieve and compile

## Retrieval pipeline

```text
Request identity + Space + intended audience
 -> exact task state and pinned context
 -> permitted recent history and source candidates
 -> exact + keyword + semantic retrieval
 -> freshness/conflict/deduplication checks
 -> selected source expansion and reranking
 -> model-specific context pack + manifest
```

Authorization filters apply before data reaches a model, reranker or external embedding endpoint. Do not retrieve every tenant and ask an LLM to conceal restricted content. Recheck output-audience permission before publication and current authorization before sensitive action.

| Retrieval path | Appropriate use |
| --- | --- |
| Exact | IDs, transaction hashes, configuration keys, authoritative task/approval state |
| Keyword | Literal error messages, paths, versions and named decisions |
| Semantic | Paraphrased incidents, related lessons and intent similarity |
| Relationship expansion | Incident-to-service-to-runbook-to-evidence links; start with relational edges |

Use a bounded Space context card plus exact task obligations and recent messages. Retrieve the remaining material on demand. Rank only eligible records using relevance, source quality, validity, freshness and diversity; no relevance score can compensate for missing permission.

## Freshness and explainability

The context manifest records Space/audience, membership and policy revisions, memory versions, source digests, index watermark, profile and inclusion reasons. Users can inspect the permitted sources behind an answer without exposing hidden model reasoning.

If the semantic index lags, overlay recent committed events and exact lookups. If only semantic search fails, use authorized alternatives and disclose a material recall limitation. If authorization fails, stop the affected retrieval; a stale cache is not a fallback for permission.

A group decision made after a run begins can be surfaced at a safe turn boundary. Membership removal and high-impact policy restrictions invalidate new authority through the control system rather than waiting for a context snapshot to expire. Enforcement convergence and in-flight data exposure are bounded by the qualified broker/lease contract; already delivered data cannot be recalled.

Historical remedies are examples, not automatic instructions for today's production system. Query the live system of record when current state matters.

## Make selective context visible

Before a task, show the chosen source set and any pinned scope restrictions; during review, expose the RetrievalManifest through Sources used. A reference to another conversation does not silently broaden access. If the user disabled cross-thread recall, ordinary same-Space files remain readable under their storage grant; the interface explains that this is not filesystem privacy.

An answer that lacks evidence states the gap or asks for a source. Similarity alone never establishes that a historical fix applies now. A service outage may degrade optional semantic recall but cannot bypass permission checks or turn an old memory into current machine state.

---

# 18. Memory correction, deletion and privacy

## Versioned knowledge and shared writers

Each write carries a scoped idempotency key and an expected revision where relevant. Independent facts may append concurrently; conflicting updates are rejected, reconciled or reviewed. Retain author and evidence lineage so a correction can supersede one claim without rewriting unrelated knowledge.

Example: tasks A and B read room revision 40. A publishes revision 41. B's conflicting update is evaluated against 41 instead of overwriting it with a stale summary. An active task may retain an evidence snapshot for reproducibility, but cannot use it to bypass revoked permissions.

## Memory inspector

Expose source, author, scope, current status, last verification, expiry and change history. Provide remember, correct, supersede, forget and explain-context actions. Let users distinguish a personal preference, a participant assertion and an observed configuration fact.

Editing a generated SPACE_CONTEXT.md in the VM is a proposal, not a direct canonical-memory write. A private note must not be placed on a group-readable volume. Shared shell access exposes permitted files independently of chat-display controls.

## Lifecycle propagation

| Change | Required downstream behavior |
| --- | --- |
| Correction / superseding | Rebuild affected summaries, update indexes and expose current revision |
| Membership removal | Invalidate access caches, links, streams, current grants and affected tasks |
| Forget / retention expiry | Tombstone authoritative records and invalidate derived content and candidates |
| Backup restoration | Apply current deletion ledger and policy before serving restored content |
| Source access revoked | Block derived disclosure unless a separately valid publication grant exists |

Derived summaries, embeddings, evaluation fixtures and learned procedures can carry sensitive source information. Track dependencies and invalidate or rebuild affected descendants. A delayed indexing job cannot resurrect deleted content.

Legal holds and backup retention require explicit enterprise rules; immediate deletion from every historic backup is not assumed. Previously exported files and information already transmitted to a provider cannot be recalled by deleting our record.

## Isolation from improvement and accounting

Memory may preserve evidence for Reflect, but cannot publish executable behavior or approval. LiteLLM billing teams may aggregate several rooms without merging their records. Cache keys, search scopes and learned releases remain tenant/Space/audience-aware.

Measure recall quality and stale-fact use against a no-memory baseline, alongside leakage, correction and deletion tests. More retained text is not automatically better memory.

## Correcting facts is not releasing behavior

An authorized user can correct an attributed fact or preference through the memory workflow. A change to a reusable executable method or a team-wide behavior profile follows Reflect/release controls. The UI labels Knowledge and Methods separately, even though both have lineage and versions.

A forget request reports affected active records, derived material, external copies and any disclosed retention restriction. It does not claim that all exports or backups vanished immediately. On source revocation, suppress affected future context and publication through the governing delivery path; source-to-derived invalidation is retried durably. Independent publication rights for a copied artifact, if any, must be explicit and recorded.

---

# 19. Design Studio and artifact creation

## A code-backed, collaborative design surface

Design Studio provides conversation, an editable canvas, comments, variants, source and responsive previews in the same Space. Claude Design's documented canvas and design-system workflow is a product reference; our implementation runs through the native engine, not a delegated Claude Design session. [S20]

| Capability | Required native behavior |
| --- | --- |
| Brief and generate | Build UI concepts, flows, dashboards and interactive prototypes from authorized references |
| Edit and iterate | Select supported elements, edit text/properties, annotate, compare variants and inspect source |
| Design system | Version approved tokens, typography, components and brand constraints |
| Collaborate | Presence, comments, revision checks and conflict handling; no silent overwrite |
| Validate and deliver | Build/interaction checks, accessibility evidence, exports and authorized publishing |

A DesignArtifact links requirements, source/component references, design-token version, asset manifest, preview build, comments, checks and exports. Stable element IDs map supported canvas edits to source patches against an expected revision. Published output binds to a specific artifact version.

Start with supported web components and properties. Arbitrary imported applications may contain regions that remain source-only or need conversion; no lossless universal round-trip promise. Image generation and other media tools are optional qualified providers with their own data/cost controls.

## Safe previews and validation

Build generated code inside the constrained runtime. Serve previews on a separate origin with no control-plane cookies, secrets or privileged desktop bridge. Restrict network access, external fonts/assets and export destinations. Validate attachments and retain asset provenance and licensing records.

Checks include responsive sizes, keyboard flows, contrast, overflow, build success and task-specific behavior. Automated accessibility results are evidence, not certification. Aesthetic disagreements require calibrated human review rather than a fabricated objective score.

## Beyond prototypes

Documents, spreadsheets, presentations, research reports and media are capability packages sharing the artifact, policy and verification contracts. Export validity is format-specific. A research report needs source checks; a spreadsheet needs formula checks; a design needs interaction and visual review.

Desktop emphasizes deep editing. Mobile supports creating briefs, reviewing variants, comments, previews and approval without forcing full desktop streaming. Handoff to implementation continues from the same artifact and requirements, not a disconnected screenshot.

## Design is an artifact workflow, not another chat mode

The journey is Brief -> versioned draft -> preview -> feedback -> checked candidate -> accepted version -> optional external delivery. Act is needed to generate/edit a prototype; Ask can explain the design and Plan can define its brief. Canvas comments are feedback, not direct authorization to deploy or install packages.

Autosaving an internal draft and building a private preview within the authorized Space do not require external-publication approval. Sharing outside the Space, making a preview public, exporting to another service or deploying the result is a distinct DeliveryOperation. Use explicit actions such as Accept version, Download, Share to Space and Publish externally rather than one ambiguous Ship button.

If preview compute is asleep, show an available committed snapshot and a clearly priced Start live preview action. A static snapshot is labeled noninteractive. Unsupported edits retain their source region and explain the supported alternative; do not lose user's manual work while regenerating.

Comments and change requests bind to artifact/element versions. The user can accept a proposed patch, compare alternatives or keep the current version. Updating a design system is separately governed; one user's aesthetic preference does not silently redefine the organization's brand.

---

# 20. Dispatch and scheduling

## Work control from any device

Dispatch is the authenticated interface to submit, schedule, supervise and deliver remote work. It is distinct from computer use, which is an execution tool beneath it. Claude's documented Dispatch offers a remote-task reference; our default execution target is a cloud Space computer rather than a required awake personal desktop. [S21]

The task inbox supports text, approved voice transcription, attachments, goal, Space, budget and completion criteria. The run view exposes current stage, selected workers, dependencies, evidence, blockers and authoritative state. Users can steer, pause, cancel, reconcile or start a new attempt under their grants.

## Admission and fair queues

Resolve identity, Space and intended audience server-side. Filter runtime candidates by assignment, region, operating system, tools/apps, isolation and model policy before capacity or latency. Use the assigned Space VM by default; opted-in child workers receive scoped mounts and publish reviewed artifacts back.

Reserve compute concurrency and root budget atomically. Apply tenant/user/Space quotas, fair scheduling and bounded priorities. Long jobs cannot monopolize all workers; interactive work and maintenance have separate capacity/budget policies.

## Scheduled and event-driven work

A schedule records timezone, recurrence, owner/service identity, Space, policy, expiry, input template, limits and overlap policy. Define missed-run behavior as skip, coalesce or authorized catch-up; never unexpectedly replay all missed destructive actions. Use deduplication IDs for incoming events and handle daylight-saving changes explicitly.

If the human owner leaves, pause schedules relying on that identity. Continued organization jobs require an explicit service identity and current grant. Webhooks need authenticated origin, replay protection and scope mapping; webhook text cannot choose privileged authority.

## Reliable controls and delivery

Ordinary mutation commands bind target run/machine, expected revision, actor, operation ID and expiry. Stop uses the monotonic contract in section 6 instead of a stale progress precondition. Duplicate mobile taps yield one command outcome. Pause, cancel and retry have the semantics in section 8. Missing approval or user response does not increase autonomy.

Notifications contain minimal status and deep links; clients fetch authorized current details. A delivery failure does not mean the task failed, and a task failure must not be hidden by notification success. Exports and channel posts undergo a final audience check.

Closing an app does not cancel an accepted remote task. The UI must distinguish queued, running, waiting, reconciling, cancelled and completed work rather than showing a single ambiguous spinner.

## Dispatch is the Work surface, not a second executor

A conversation request and a mobile Dispatch request create the same Task object. Work shows that object across devices; no duplicate task is created simply because another interface is opened. Follow-up messages target a task explicitly under section 4. Inbox groups items needing a decision, with one authoritative approval record even if several devices receive a notification.

Each waiting card exposes reason, affected task/computer, current owner, last update and the permitted next action: Clarify, Review action, Reconnect, Add budget, Wait for resource or Request access. A denied operation offers an allowed alternative where one exists, not a button that weakens policy.

## Automation setup is a reviewed task template

Before activation, show the schedule timezone, next occurrences, source/connection identity, target Space, maximum spend and runtime, overlap policy, delivery audience and expiry. Offer a non-destructive preview/test run under the same permissions. A scheduled job cannot inherit a human's later approval for arbitrary future recipients or targets.

Renewing a connection revalidates pending work and reconciles any uncertain effect; it is not a reason to rerun the last write. Owner-offboarding behavior is displayed during setup. A schedule can pause independently of retaining its history and artifacts.

---

# 21. Computer use, streaming and takeover

## Controlled operation of the remote computer

Computer use MUST be a supported execution capability, not merely a remote-view window. Choose an approved API for precise operations, structured browser/accessibility tools where appropriate, or screenshot-based desktop actions when required. Visual verification may intentionally use the screen.

```text
Observe -> propose action -> authorize -> execute
        -> observe again -> verify postcondition
```

An observation records session/frame ID, timestamp, application identity where available, display geometry and focus. An action binds to the current observation and driver lease. Recapture after focus, geometry or relevant state changes. A low-confidence or stale target prompts inspection instead of blind coordinate replay.

## Single-driver ownership

Allow one active input driver per browser/desktop session. Authorized viewers may observe without input control. Independent graphical jobs need separate desktops or serialization, even if they use the same group VM.

Human takeover first blocks new agent input, invalidates queued actions and acknowledges in-flight status. Then issue a human lease with a new fencing generation. Returning control to the agent requires fresh observation and reconciliation of user edits. An already-submitted click cannot be guaranteed reversible.

## Streaming contract

Prototype WebRTC-based display transport with authenticated signaling and short-lived relay credentials. Keep video delivery separate from the authorization of input commands; view access alone never grants control. Validate focus, keyboard layouts, touch mapping, clipboard and display scaling on every supported client. A degraded network may reduce video quality, but must not extend an expired control lease.

No direct public desktop port is required. Mobile offers touch-friendly task controls and optional full-screen takeover. Prevent accidental duplicate input after reconnect; queued GUI actions expire rather than replay on a changed screen.

## Sensitive sessions and irreversible actions

Treat screenshots, recordings, clipboard, downloads and browser cookies as sensitive resources. Never import a personal authenticated browser into a group desktop by default. During user-only authentication, suspend agent capture and input; enforce that suspension across telemetry and recordings too.

When an exact high-impact GUI transaction cannot be reliably mediated, require the user to complete it or block it. A permitted hostname is insufficient authorization for every action on that site. Reconcile uncertain submissions through application state rather than pressing Submit again.

Record replay is viewing evidence. Executing a recorded workflow is a new authorized task. Demonstrations may feed Reflect only under the recording's scope and review policy.

## Input exclusivity alone is insufficient

A human can alter files, settings and authenticated applications while holding the mouse. Before takeover, establish a workspace mutation barrier across every conflicting path: GUI input, shell jobs, file edits, browser automation and API actions against the same leased resources. Read-only or disjoint work can continue only if the scheduler can enforce that distinction. Otherwise pause all mutable work on the shared computer and disclose affected tasks.

Acknowledge in-flight effects before granting human control. When the human disconnects or the lease expires, leave the task paused by default; do not unexpectedly resume the agent on a changed desktop. Resume requires an explicit action, fresh observation, filesystem/base-version reconciliation and current permission. Computer restarts fence all old driver generations.

## Authentication must be isolated, not merely hidden from screenshots

User-only authentication requires more than suppressing capture. Other agent-controlled processes must not be able to read the browser profile, cookies, clipboard or input channels. Use a separately isolated authenticated session and approved brokered capabilities; otherwise require an appropriate private workspace or block that path.

Recordings are opt-in under enterprise policy. Showing a screen, controlling input, exporting clipboard and downloading files are separate capabilities. Human takeover operates the remote workspace, not the user's local device, unless that device was separately enrolled and explicitly selected.

---

# 22. Fleet Console and operational observability

## Manage the work and the machine separately

| View | Measurements and evidence |
| --- | --- |
| Computer health | Heartbeat age, instance/image/policy, region, uptime, CPU, RAM, disk/inodes, I/O and network |
| Optional accelerator | GPU utilization/memory and device availability on qualified workers |
| Agent execution | Queue/startup time, model latency, context size, tool duration, retries, stalls and checks |
| Logs | Correlated tool receipts, process output, redacted application logs and policy denials |
| Cost | Model/tool spend, compute duration, storage/network estimates and remaining reservations |

Use OpenTelemetry for trace/metric/log integration, runtime collectors for machine measurements, and gateway request IDs for model attribution. OpenTelemetry defines complementary signals; it does not make LiteLLM a VM resource collector. [S22]

Correlate tenant, Space, conversation, run, agent, computer, action and model-call IDs. Put high-cardinality identifiers in traces/logs rather than unlimited metric labels. Stamp accounting metadata in trusted services. Distinguish estimates, measured resource use and reconciled billing.

## Lifecycle operations

Start, suspend, drain, restart, resize, snapshot, restore and delete are separately authorized asynchronous operations. Show affected conversations/runs and expected data/cost implications. A restart of the group's VM can interrupt everyone sharing it; no member gets silent fleet-wide control.

An independent stop path revokes grants and quarantines workers even when the model session is stuck. Security collectors and audit sinks must not be writable by the agent. Missing heartbeat means unknown health, not success; alert on stale data, stalled cancellation and monitoring gaps.

## Access and alerting

A user allowed to read CPU metrics may not be allowed to read terminal contents or view screens. Redact logs before broad indexing, minimize prompt/screenshots by default and apply Space retention to sensitive evidence. A monitoring dashboard must enforce source permissions rather than becoming a cross-tenant data export.

Alerts SHOULD cover resource exhaustion, repeated tool errors, no-progress loops, policy violations, budget pressure, failed backups and unavailable dependencies. Each has an owner, severity, suppression window and remediation link. Proposed automatic remediation uses ordinary task/lifecycle authorization; Reflect cannot independently restart machines.

**Diagnostic goal:** answer 'Why is this task slow?' using correlated evidence that separates provider delay, resource pressure, blocked approval, tool failure and cold start.

## Default health view versus expert telemetry

The ordinary Computer panel answers: is the task progressing, what is waiting, is the machine healthy, what does it cost and can I safely stop it? It shows a current status summary, resource pressure, time of last signal, task links and scoped controls. Detailed traces, raw process logs, historical resource charts and fleet-wide operations are expandable or role-specific.

Do not equate low CPU with a hung model request or missing metrics with zero use. Correlate the actual wait category. Avoid invented percentage completion for open-ended reasoning; show verified milestones and remaining known gates.

Before a destructive lifecycle action, list affected runs and unsaved/noncheckpointable work, not merely the VM name. Stop a task without restarting the shared VM. Emergency quarantine is independently authorized and records its broad impact.

---

# 23. Reflect: evidence-driven self-improvement

## Remembering and improving have different authorities

Memory records what happened and what was asserted. Reflect diagnoses outcomes and proposes a better method. The evaluator tests the proposal. A release controller publishes approved behavior. These roles must not collapse into a model congratulating itself.

Reflexion studies feedback stored as episodic language memory without updating model weights. GEPA studies reflective prompt proposal and evaluation. They are methodologies to test, not evidence of automatic improvement in this product. [S23, S24]

| Loop | Trigger and permitted output |
| --- | --- |
| Within-task repair | Failed check, repeated no-progress action or correction; bounded replan within existing authority |
| After-task reflection | Settled useful success/failure/intervention; source-linked diagnosis and lesson |
| Cross-run optimization | Recurring authorized pattern; candidate prompt, context, tool or model-profile change |
| Engine improvement lab | Reproducible harness defect; proposed code change in a development branch |

Do not run an expensive reflection job for every message. Admit jobs through explicit triggers, budgets, queue limits and scope checks. Retain unknown causality instead of inventing explanations.

## Candidate construction

Build an evidence pack containing task requirements, environment/model/behavior versions, selected tool outputs, protected checks, resource telemetry and explicit feedback. Diagnose whether the problem was missing context, stale screen, wrong action, infrastructure shortage, tool defect, evaluator defect or uncertain requirements.

A ReflectionRecord stores the hypothesis and its evidence. An ImprovementCandidate contains base version, narrow patch, applicability, expected improvement, evaluation plan, risks and rollback reference. The source's data classification and audience apply to both records and any derived evaluation fixtures.

## Allowed and prohibited change classes

Candidates may improve instructions, retrieval recipes, context budgets, tool descriptions, design checklists, browser procedures and runbook preconditions. A suggestion to reduce test concurrency or resize a VM still requires ordinary resource authorization.

Reflect MUST NOT widen permissions, disable protected checks, alter grader answers, suppress audit evidence, raise its budget, change retention or install arbitrary executable code. Engine patches use the normal development/release pipeline; the live controller is not self-modified.

Initial Reflect releases are proposal-only until a human publishes them. Persistent improvement is not model-weight training. Cross-tenant learning and training require separate data rights and explicit product approval.

## Learning users can understand and control

Expose Methods as the home for proposed and active procedures. A short improvement card states what failed, the proposed change, scope, evaluation cost, evidence and approval state. New preferences and corrected facts use Knowledge, not this experimental release path.

Task repair stays inside the run and its budget. Cross-run optimization uses a separate approved maintenance allowance, idle capacity policy and source scope. A completed task does not remain falsely Running because optional Reflect work is queued. Users can disable optional improvement jobs where enterprise policy permits, without corrupting task history.

Explicit feedback such as Wrong, Needs changes or Useful creates attributed evidence, not an automatic reward signal granting a policy change. Separate subjective preference from a reproducible defect. No personal or tenant-wide generalization follows from one user's feedback without an approved scope transition.

---

# 24. Reflect evaluation, publication and rollback

## Evaluate outcomes, not persuasive explanations

Use protected deterministic checks, appropriately calibrated model review and human evaluation. Anthropic's agent-evaluation guidance distinguishes the agent transcript from the resulting environment; our independent verifiers apply the same distinction. [S25]

```text
Evidence -> diagnostic hypothesis -> versioned candidate
 -> isolated experiments -> protected holdout evaluation
 -> authorized release -> limited rollout -> retain / revert
```

| Workload | Required outcome evidence |
| --- | --- |
| Coding | Build, tests, integrated behavior and exact artifact identity |
| Design | Responsive/accessibility checks, brand constraints and human design review |
| Computer use | Actual application state, wrong-target rate and takeover correctness |
| Operations | Health recovery, resource impact, recurrence and unauthorized-action checks |
| Memory | Relevant source recall, stale-fact use, attribution, deletion and leakage behavior |

Compare the candidate with the current version under controlled model, starting state, environment, permissions and budget. Repeated trials should match observed variance and risk. Keep development cases separate from holdouts; the optimizer must not inspect hidden solutions or grader internals. Avoid selecting a lucky winner through uncontrolled repeated testing.

## Promotion contract

Safety and authorization tests are mandatory before quality/cost trade-offs. Predeclare expected benefit and tolerable regressions; record uncertainty, failures, cancellations and all auxiliary costs. If the evidence is inconclusive, retain the baseline.

A release binds candidate digest, evidence, conditions, approver, scope, applicability, expiry and prior version. Publish using revision checks so concurrent jobs cannot overwrite each other. Pin behavior per run; activate new versions at new-run or validated safe boundaries.

Later, an administrator MAY authorize auto-promotion for narrow low-risk classes with protected gates. Organization-wide procedures, executable tools and engine-code changes retain stronger review. A policy denial is not a defect to optimize away.

## Limited rollout

Release to a small authorized cohort and monitor the same outcomes. Rollback changes future behavior selection; it does not undo completed external effects. Requalify after relevant model, app, tool, environment or policy changes. Shadow trials use isolated fixtures and must not duplicate production writes.

Show an improvement card containing the evidence, diff, evaluated conditions, measured results, uncertainty, approval and rollback state. No successful single demonstration is labeled a statistically established gain.

## Active-version response to a regression

A rollback prevents selection of the bad version for new runs and identifies active runs using it. Security-critical defects stop/fence affected continuation immediately; ordinary quality regressions offer a controlled pause or safe-boundary change according to release policy. Pinning a version for reproducibility does not excuse continued use of a revoked unsafe method.

Retain an improvement only when its measured net benefit includes evaluation, maintenance and correction cost. Expire or requalify stale methods after meaningful tool/app/model changes. Publish Inconclusive rather than Improved when evidence is insufficient.

---

# 25. Interfaces, protocols and extensibility

## Own semantics behind replaceable contracts

| Contract | Minimum responsibilities |
| --- | --- |
| ModelAdapter | Capabilities, request encoding, streaming, usage, cancellation and provider-private state |
| RuntimeAdapter | Provision, qualify, inspect, suspend, terminate, transfer eligible artifacts and delete |
| ToolAdapter | Schemas, scope, side effects, credentials, limits and reconciliation |
| MemoryService | Admit revisions, retrieve authorized context, explain sources and revoke/delete |
| DesktopBroker | Observations, view grants, exclusive input leases, takeover and recording controls |
| ChannelAdapter | Authenticated input/output, audience mapping and notification status |
| Evaluator / ReleaseRegistry | Independent checks, behavior versions and publication/rollback |

Extensions declare API compatibility, dependencies, capabilities, provenance and digest. Pin them per attempt. Run third-party executable plugins outside trusted controller authority; review updates and test migrations. A missing cosmetic renderer may degrade the UI; a missing mandatory authorization check blocks execution.

## Use protocols for their intended purpose

MCP supplies host/client/server connectivity for tools and resources. Agent Client Protocol supports editor-to-agent interaction. A2A supports task and artifact exchanges with external agents. None of them substitutes for our identity, policy, isolation or completion contract. [S26-S28]

Optional remote-agent adapters are marked opaque where necessary. They cannot satisfy native-engine acceptance or strict per-action guarantees without demonstrated interception and accounting. A protocol-compatible endpoint is not automatically trusted or safe.

## Interoperability and export

Task capsules export requirements, selected findings, artifacts, uncertainty, checks and next safe action under audience/retention policy. They exclude secrets and hidden model reasoning. Memory export preserves source/validity/scope; design export preserves the version and asset manifest. A new import does not grant access to all original private sources.

API versioning, schema evolution and event compatibility need tests. Reject unsupported required fields rather than silently ignoring a security setting. Capability records include version, tested deployment, supported features, qualification date and expiry; self-declarations alone are insufficient.

Do not stack several independent workflow engines, memory authorities, model routers or retry loops. Every authoritative decision has one named owner.

## Export does not silently create continuing access

Distinguish a permission-checked live reference from a published copy. A live reference follows source revocation and remains unavailable if its audience is unauthorized. A published copy needs explicit rights, destination scope, retention and provenance; it may have a different lifecycle only where those rights permit. Neither exposes private source titles by default.

Integration acceptance tests cover identity, audience, revocation, effect deduplication, current schemas and capability loss, not only a successful demo call. Connection status separates configured, authenticated, resource-authorized and qualified for the requested operation. [S39]

---

# 26. Proposed API and configuration contract

**Illustrative design syntax. These endpoints and manifests require implementation; they are not current vendor APIs.**

| Operation family | Proposed contract |
| --- | --- |
| Spaces / conversations | Create/list/read; resolve binding; explicitly publish selected material to a destination Space |
| Runs | Submit, inspect, stream events, steer, pause, resume, cancel and reconcile |
| Approvals | Request, inspect exact digest, approve/deny with current authentication and expiry |
| Computers | Inspect resources; request lifecycle operation; acquire/release view or input lease |
| Artifacts / memory | Upload/commit, query sources, propose/commit revision, supersede and delete |
| Reflect | Inspect diagnosis/candidate, start evaluation, publish or revert an authorized release |

Ordinary mutating commands MUST bind authenticated identity, Space, expected revision, expiry and a scoped idempotency key. Stop/revoke commands instead bind the immutable target and current authority, then advance a fencing generation; stale progress alone is not a reason to reject them. Return acceptance separately from completion. Resolve named profiles against current grants and qualified capabilities; a manifest cannot grant authority or weaken policy.

## Space policy example

```yaml
apiVersion: agentfabric.dev/v1alpha1
kind: SpaceProfile
metadata:
  name: infrastructure-team
spec:
  ownership: room
  interaction:
    newConversationIntent: ask
    groupAgentTrigger: explicit
  execution:
    mode: remote
    defaultComputer: assigned-space-vm
    allocation: on-demand
    chatWithoutComputer: true
    additionalWorkers: disallow
    conflictingWrites: serialize
  models:
    gatewayRef: enterprise-approved
    profileRef: engineering-qualified
  memory:
    scope: space
    crossThreadRecall: permitted-records-only
  computerUse:
    inputDriversPerSession: 1
    takeover: fenced-lease
  reflect:
    mode: propose-and-evaluate
    publication: human-approved
  security:
    profileRef: restricted-linux-qualified
    productionWrites: exact-approval-required
```

## Proposed command response contract

Return **accepted**, **rejected** or **requires-review** before reporting operation completion. A response includes command ID, task/run and Space IDs, server revision or fencing generation, status timestamp, known effect state and a safe next action. The same idempotency key under the same authenticated scope returns the same command identity.

Task admission additionally records intent ceiling, result type, requirement revision, source set, target resources, payer, budget, required checks and effect approvals. A comment is not an update command. A delivery request is not merely a changed task status. A Stop command is not a retryable stale-version edit.

Expose typed operations for requestTask, reviseTask, stopRun, stopTask, approveEffect, publishArtifact, takeControl and returnControl. TakeControl includes the resource mutation-barrier result. Client-supplied owner, payer, tenant and role fields are never trusted without server resolution.

---

# 27. Implementation stack and repository shape

## Proposed initial technology decisions

| Component | Initial direction and boundary |
| --- | --- |
| Native engine / API | TypeScript modular core; typed contracts and explicit state transitions |
| Desktop / web | React workbench with a hardened Electron desktop carrier |
| Mobile | React Native; Expo development builds where required integrations qualify |
| Workflow durability | Temporal; nondeterministic I/O in activities, large payloads outside history |
| Metadata / memory | PostgreSQL, full-text retrieval and pgvector; restricted service access |
| Files / workspaces | Encrypted object storage plus separately managed Space volumes/snapshots |
| Model access | Qualified LiteLLM gateway and native provider adapters |
| Policy / runtime | OPA-backed decisions, mandatory brokers and qualified OpenShell integration |
| Observability | OpenTelemetry with host/workload collectors and protected audit sink |
| Desktop streaming | Prototype an authenticated WebRTC transport and separate input broker |

These are implementation choices, not endorsements that eliminate evaluation. Electron's security requirements and React Native's platform-specific support inform the client boundaries. A technical spike must validate input, streaming, enterprise authentication, build distribution and reconnect behavior before stack lock-in. [S01-S03]

```text
apps/       api, web, desktop, mobile, cli
engine/     kernel, contracts, context, profiles, scheduler
services/   spaces, memory, artifacts, dispatch, reflect
execution/  action-broker, verification, desktop-broker
security/   identity, policy, credentials, audit, conformance
adapters/   models, runtimes, tools, channels, optional-agents
infra/      deployment, images, migrations, backup, telemetry
evals/      fixtures, holdouts, safety, recovery, client-e2e
```

## Dependency and build discipline

Pin package/image versions and digests. Record licenses, notices, modifications, vulnerability status, owners and update plans. Publicly readable code is not automatically permitted for redistribution. No leaked implementation material or assumed consumer-subscription resale rights are part of the product.

Use signed release artifacts, reproducible build metadata, SBOMs and environment-specific deployment promotion. Python tools may execute in isolated workers; introduce Rust where measured requirements justify it rather than assuming language choice produces better agents.

Avoid privileged developer conveniences in the shipped build. Test the hardened configuration, not only the permissive development profile.

## Prototype the risky contracts before expanding UI breadth

Prioritize a native no-VM question, an isolated computer task, scoped connector access, artifact promotion, Stop under concurrency and remote takeover before broad marketplace work. Reuse one set of API/event schemas across thin desktop, mobile and web clients. The same acceptance scenario must run through all three surfaces.

Client frameworks remain provisional until streaming, input mapping, accessibility, enterprise authentication and secure update behavior pass prototypes. These tests should not delay implementing the server-side safety contract. A working browser experience remains available when a specific native integration is unqualified.

---

# 28. Deployment, operations and resilience

## Separate execution and control failure domains

A team deployment separates client/API access, native control services, workflow/storage services, model gateway, runtime security gateway, execution workers and observability. A single-host pilot may colocate trusted services, but arbitrary task code remains isolated and the deployment is not advertised as highly available.

In customer infrastructure, support outbound authenticated workers, approved inference routes and region-constrained storage. Dedicated gateways and storage may be required for stricter tenants. Data-processing destinations include control-plane logs, embeddings, reranking and recordings, not only the VM region.

| Dependency failure | Required behavior |
| --- | --- |
| Model/gateway outage | Bounded retry or approved equivalent; otherwise pause/fail explicitly |
| Memory index unavailable | Authorized exact/tail retrieval; no permission bypass |
| Authorization service unavailable | Fail closed for affected reads/actions and stop privileged continuation |
| Client disconnected | Continue already-authorized remote work; wait at required approval |
| Runtime unreachable | Mark unknown, revoke leases, reconcile before replacement writes |
| Reflection service unavailable | Preserve task evidence; defer candidates without inventing improvement |
| Telemetry gap | Alert and mark stale; required audit failure blocks sensitive dispatch |

## Backup and disaster recovery

Back up task/action metadata, memory revisions, artifact manifests, behavior registries and policy configuration. Test restore ordering and cross-store consistency. Reconcile external effects rather than replaying them after recovery. Restore-time deletion/revocation handling applies before any user access.

Define recovery objectives per data class. An acknowledged memory commit differs from uncommitted file edits or transient screen frames. Active browser cookies and credentials need separate rotation and recovery rules; do not copy them blindly from a snapshot.

## Capacity and cost operations

Measure warm/cold startup, per-Space contention, model wait and storage growth. Apply admission queues, idle suspension, graceful drain and workload placement. A one-VM-per-Space default is a product ownership model, not a promise of infinite parallel capacity. One strict shared machine must queue conflicting jobs.

No service-level claim is published until load, interruption, backup and revocation tests establish it for the advertised region and topology. Customer support needs diagnostic bundles that preserve scope and omit secrets by default.

## Recover into a usable state

On reconnect or dependency recovery, restore the last acknowledged task, explain any uncertain effect and identify the next authorized action. Do not auto-submit unsent drafts or replay stale approvals. A model outage may permit a preapproved equivalent; a pinned or incompatible model produces an explicit wait instead.

Define checkpoint/backup targets per class before production qualification: canonical records, committed artifacts, live files, optional recordings and credentials. Display actual last successful backup/checkpoint times where relevant. Restoring a VM is a new runtime generation and revalidates current policies; it does not revert externally committed actions or resurrect revoked methods.

Review copy for every error: what happened, what was preserved, what did not execute, whether charges continue and who can resolve it. Security-sensitive details are disclosed only to an appropriate role. Required authorization/evidence outages block the affected operation even when this reduces availability.

---

# 29. Quality, security and usability evaluation

## Separate engine comparison from product comparison

In a controlled harness test, hold the model/version, repository/task, tools, permissions, starting environment and total budget constant where feasible. Compare native strategies with a simple baseline; use ablations and interaction tests. Unsupported pairings are marked non-comparable.

In a product comparison, each competitor uses its supported configuration. Report that as a product-plus-model result, not evidence that the harness alone is better. SWE-bench is a useful issue-to-patch benchmark; private representative tasks and operational/security tests remain necessary. [S34]

| Dimension | Primary measures |
| --- | --- |
| Task quality | Protected completion, regressions, incorrect-success reports and human repair |
| Economics | Total settled cost including review, reflection, retries, compute and corrections |
| Usability | Successful cross-device completion, approval mistakes, Space confusion and takeover friction |
| Latency | Queue, startup, first useful output, tool delays and end-to-end distributions |
| Reliability | Recovery, stale-command rejection, cancellation and unknown-effect reconciliation |
| Memory | Recall relevance, source support, freshness, deletion and cross-scope leakage |
| Security | Successful boundary violations, false blocks and monitoring blind spots |

## Pilot targets, not service guarantees

Use these initial targets to size tests; revise them through measured workload results. For healthy warm-control-plane tests, target a p95 accepted-command acknowledgement within 2 seconds and visible task-state propagation within 3 seconds. Exclude model completion and cold VM startup; measure those separately.

For online control paths, target stopping new dispatch within 2 seconds of cancellation acceptance. Remote process termination and external actions have separate measured outcomes. Use an initial 30-second maximum privileged lease as a revocation-test parameter, not a claim that data already sent can be revoked.

Require zero cross-Space disclosures, unauthorized dispatches and duplicate test effects in the release suite. Finite zero-failure results are gates, not a proof of immunity. Report observed distributions and confidence intervals, failures and cancellations rather than hiding them in a success average.

Use fresh, isolated evaluation states and protected holdouts. Every significant model, policy, tool or runtime update triggers the relevant requalification; user settings cannot disable required qualification. More features remain optional unless their measured benefit exceeds their cost and complexity.

## Usability validation of the revised operating model

Use moderated tests with representative individual users, group contributors, task operators and administrators across phone and desktop. These are planned studies, not completed tests. Ask participants to identify the current audience, next action, execution target and whether a result is externally delivered before they use a control.

Measure unassisted completion, incorrect Space/recipient selections, unexpected task starts, approval comprehension, duplicate actions, time to find a result, Stop success and recovery after disconnect. Test denied and degraded paths as well as the happy path. A participant should not need to know a lease, gateway or embedding model to recover.

Compare the simplified navigation and intent controls with the v1.0 concept using the same tasks. Record confusion and design changes without inventing satisfaction percentages. Any observed cross-audience disclosure, unintended sensitive action or ineffective Stop blocks the affected profile regardless of visual appeal.

---

# 30. Build sequence and delivery gates

## Deliver a coherent vertical slice before a large catalog

| Gate | Deliverable | Required exit evidence |
| --- | --- | --- |
| G0: contracts and baseline | Native event/action semantics, Space model, threat model and test fixtures | Deterministic state tests; effect/retry and permission boundaries reviewed |
| G1: usable secure core | Qualified runtime/model route; Ask/Plan/Act; personal/group Spaces; baseline identity, audience, budgets and approval; protected checks; web plus thin desktop/mobile clients | No-VM question and computer task without competitor harness; intentional group triggers, isolation, reliable Stop and cross-device result retrieval |
| G2: enterprise workbench | Richer gateway administration/accounting, memory, connector lifecycle, schedules and Fleet visibility | Reconciled billing, recall, reconnect, restart/restore and full joiner/mover/leaver journeys |
| G3: creation and computer use | Design artifacts, safe previews, browser/desktop tools and human takeover | Versioned creation, exclusive input leases, stale-frame handling and mobile controls |
| G4: governed improvement | Reflect proposals, independent lab, release registry and limited rollout | Protected holdouts, no privilege change, real behavior rollback |
| G5: qualified expansion | More runtimes, apps, channels, private inference and optional hardware layer | Per-adapter conformance; documented deployment/edition limits |

Desktop and mobile are product requirements from G1, initially as thin but real clients to the same backend. Advanced canvas editing, fleet administration and optional native integrations grow by gate; mobile must still support meaningful dispatch and review. Web remains a supported no-install access path.

## Engineering ownership

Assign named owners before implementation: engine/control, clients/design, identity/security, runtime/SRE, data/memory, model gateway/FinOps and evaluation/Reflect. These are responsibilities, not an assumed team headcount. Security and verifier ownership must remain independent enough to challenge implementation shortcuts.

## Release evidence package

Each gate ships a versioned requirements checklist, dependency manifest, operating procedure, data-flow review, threat-model changes, test results and rollback plan. Documentation, client/API compatibility and user-visible limitations are deliverables, not cleanup tasks.

The first production pilot excludes unrestricted production writes and cross-tenant learning. Broader authority is introduced only after exact-action approval, incident handling and recovery have passed their dedicated gates.

A functioning demonstration proves integration and correctness under tested conditions. Performance leadership requires separate benchmark evidence and a stated workload.

## Baseline protection is not deferred enterprise polish

Do not permit shared pilot work before tenant/Space authorization, accountable execution identity, source-audience checks, bounded cost, basic retention and effect approvals are working. G2 expands administration and automation rather than introducing those controls for the first time.

All required product modules remain in the roadmap. Stage depth, not truthfulness: a thin mobile client can dispatch and review real work; it must not advertise unsupported computer applications or inaccessible design-edit operations. Product owners sign off on observed user journeys, while security and reliability owners sign off on their own gates.

---

# 31. Acceptance scenarios and adversarial tests

## Three complete product journeys

**A. Cross-device engineering.** On desktop, a user starts a fix in Personal Space, sleeps the laptop, views remote test evidence on mobile, adds a correction, and returns to the same state on desktop. No local-worker enrollment was needed. A duplicate mobile command does not repeat an external action.

**B. Shared design and computer use.** A group creates a dashboard prototype in its own Space. Two members comment; source edits use revision checks. Dispatch schedules the assigned VM, computer use tests the prototype, and Fleet Console correlates a failure with screen and resource evidence. Human takeover fences agent input. Switching another tab to Personal Space does not move the task or its files.

**C. Memory and Reflect.** A failed narrow-screen interaction creates a scoped episode. Reflect proposes a viewport-aware procedure, tests it against clean fixtures and protected cases, and publishes only with approval. A deleted source invalidates dependent memory/candidates; rollback selects the prior procedure for future runs.

| Adversarial/failure test | Release-blocking assertion |
| --- | --- |
| Same billing team, different rooms | No shared memory/cache disclosure |
| Late tab switch and queued command | Original immutable target preserved or explicit conflict |
| Membership removed during inference | No subsequent unauthorized publication; active grants invalidate |
| Stale approval after artifact edit | Changed operation is denied until reapproved |
| Worker crashes after remote write | Status reconciled; no blind replay |
| Human takeover during a click | In-flight state exposed; old input generation rejected |
| Poisoned memory/skill/webpage | No authority promotion, grader tampering or secret access |
| Generated preview attacks client | No control-plane cookies, Node/IPC or local-file privilege |
| Two group writers | No silent lost update or conflicting canonical-file overwrite |
| Semantic index delayed | Newly committed permitted memory remains directly retrievable |
| Offline notification/approval | No false execution or delayed blanket consent |
| Unsupported security backend | Scheduling fails explicitly; no silent downgrade |

Test both allowed and denied paths, including legitimate work blocked by excessive policy. Exported diagnostic evidence must itself obey Space and retention rules. An observed pass is attached to the exact build and deployment profile.

## Reviewed user-journey acceptance suite

The following cases are design acceptance tests to implement. They have not been run against an application.

| Test | User journey and required outcome |
| --- | --- |
| UX-01 | Open Personal chat and ask about a saved decision. Only eligible sources/model calls run; no Space VM starts. |
| UX-02 | Two members discuss a design in group chat. No agent starts until an explicit trigger; a follow-up clearly targets a task. |
| UX-03 | Ask how to fix a service. The response explains or proposes a plan; no server or repository mutation occurs. |
| UX-04 | Accept an Act preflight, then sleep the laptop. The remote task continues; mobile sees the same task, limits and sources. |
| UX-05 | Generate a prototype. Its result says draft/check status and not published; external publication is separately authorized. |
| UX-06 | Switch Space while an operation is pending. The operation retains the original immutable target; no credential/context crossover. |
| UX-07 | A second task needs a file or desktop already leased. It queues with an owner/reason instead of racing or secretly allocating another VM. |
| UX-08 | Stop from stale mobile progress. Current stop authority is checked, the new fencing generation takes effect, and in-flight uncertainty remains visible. |
| UX-09 | Human takeover occurs during tool activity. All conflicting mutation paths quiesce; a reconnect does not auto-resume agent input. |
| UX-10 | User signs in to a sensitive app. No other agent process can read profile/cookies/input; unsupported isolation blocks that flow. |
| UX-11 | Budget expires. Work is saved and waits; a permitted top-up resumes it. Persistent storage and in-flight estimates remain visible. |
| UX-12 | Personal connection is requested in a shared answer. The system does not expose private content; an authorized private/publication alternative is offered. |
| UX-13 | Membership is removed during generation/download. Future context/publication and brokered streams enforce revocation; any direct-link window is documented. |
| UX-14 | A draft is edited concurrently on phone and desktop. No silent overwrite; the user can compare or preserve a variant. |
| UX-15 | A user corrects a fact. Knowledge is versioned directly; a method patch remains a Reflect proposal until its independent gates pass. |
| UX-16 | A schedule owner leaves or a connector expires. The job pauses or uses its explicitly valid service identity; no stale write is replayed. |
| UX-17 | Archive a chat, suspend its VM, or delete a Space. Each has different explicit effects on active work, data and continuing charges. |
| UX-18 | A task passes but notification delivery fails. The task result remains available; alert delivery status does not redefine completion. |

## Integrated release demonstration

A group member asks about approved design requirements without starting compute, then creates a dashboard draft in Act. Another member comments rather than silently steering. Mobile Inbox requests one missing requirement. The agent tests the draft, a human takes over under the mutation barrier, and the final card distinguishes verified draft from external delivery. A proposed procedure improvement is evaluated separately. Switching to Personal leaves the group task and knowledge untouched.

The demonstration must expose intentional errors: exhausted budget, stale Stop, an unauthorized source and an expired connection. A persuasive demo of the happy path is insufficient.

---

# 32. Risks, trade-offs and decision register

## Fixed product direction versus implementation choices

The owned engine, remote-first execution, personal/group Spaces, enterprise model gateway, scoped memory, Design, Dispatch, computer use, Fleet, Reflect and multi-device clients are part of this baseline. Selecting a different implementation library must not weaken those contracts.

| Decision / risk | Initial position | Validation owner and trigger |
| --- | --- | --- |
| Desktop/mobile frameworks | React/Electron and React Native; Expo when native needs qualify | Client team: streaming, accessibility, SSO and signed-update spike |
| VM cost and contention | Assigned VM per Space; suspend idle; queue conflicting work | Runtime/FinOps: usage and cold-start tests |
| Runtime and OpenShell coverage | One strict remote Linux profile first | Security/SRE: required-control and bypass suite |
| Gateway translation loss | Capability-aware adapters; no silent feature dropping | Model platform: provider conformance corpus |
| Privacy in shared computers | Group-readable files are group data; no private mounts | Security/data: guest, browser and connector tests |
| Memory drift and poisoning | Source/status/revision checks; independent authority | Data/evaluation: temporal conflict and adversarial recall |
| Reflect regressions | Proposal-only first; held-out tests and controlled release | Evaluation owner: quality/safety evidence |
| Multi-region complexity | Approved regional placement; no silent cross-region fallback | Platform/legal: data-flow and recovery approval |
| Optional Sentry layer | Deployment-specific, not needed for initial core | Security/procurement: supported hardware and integration evidence |

## Economic model to instrument

Total task cost includes model inference, retries, tool services, compute time, storage/network, memory enrichment, reflection and human correction. Cost per verified successful task is more useful than cheapest input-token price. Do not promise savings before workload measurements.

## Product limitations to preserve

Protocol compatibility is not security certification. A separate reviewer is not mathematical proof. A snapshot cannot undo a remote transaction. Software isolation does not establish hardware protection. Cross-platform clients do not imply every OS-specific app can execute on every worker.

Any future feature proposal must state its scope, authority, data flow, measurable outcome, failure mode and maintenance cost. Reuse a mechanism only after its purpose can be expressed behind a testable contract. This keeps the product extensible without becoming a collection of incompatible agent loops.

## Remaining decisions before engineering commitment

| Open implementation decision | Required resolution |
| --- | --- |
| Qualified runtime and authenticated browser isolation | Prototype on the actual host/kernel/image; prove process, profile, egress and resource separation |
| Shared-volume commit and snapshot semantics | Specify file locking, revision conflicts, unsaved changes and crash-consistent restore |
| Gateway compatibility and spend ceiling | Test real model modalities, streaming, retries, usage delay and permitted overrun |
| Client streaming and remote input | Test keyboard/touch, accessibility, network loss, takeover and update distribution |
| Retention and download revocation profiles | Approve region, backup, direct-link lifetime and strict brokered-access policy |
| Initial user role bundles | Validate understandable grants without coupling room membership to shell or fleet control |

These open choices do not reopen native ownership, remote-first work, personal/group isolation or the requirement for mobile, desktop and web. Scope changes need a recorded decision and an updated acceptance case, not an undocumented implementation shortcut.

---

# 33. Research inheritance and final architecture position

## Learn from mechanisms, retain one native authority

| Reference | Mechanism to study | Agent Fabric application |
| --- | --- | --- |
| Pi | Small extensible harness and provider flexibility [S32] | Compact session kernel and replaceable request boundary |
| OpenCode | Configured primary/subagent roles and model permissions [S31] | Native AgentSpec and explicit delegation contracts |
| Claude Code | Specialist contexts, descriptions and tool/model selection [S30] | Scoped specialist sessions, not dependent CLI processes |
| Codex | Context assembly, model/tool loop and caching trade-offs [S29] | Measurable context compiler and provider-aware state |
| DeepSeek Harness | Prior inspected event/service and session-log architecture [D01] | Typed lifecycle seams without replaceable security authority |
| Qwen-Agent | Composable tools, models and retrieval-oriented agents [S33] | Bounded tool contracts and independently governed retrieval |
| Hermes | Persistent agents and procedural/context mechanisms [S19, S37] | Scoped memory and reviewed procedure evolution |
| Aider / LangGraph | Repository-map and checkpoint/store distinctions [S36, S18] | Budgeted code context and separate state/knowledge owners |
| NVIDIA OpenShell | External execution policy and supervisor separation [S09-S11] | Qualified runtime backend and independent authorization |

The earlier 167-project research catalog remains a discovery source for tools, memory systems, frameworks, evaluators and infrastructure. It is not a list of mandatory dependencies and is not a current compatibility certification. [D04]

## Changes resolved in this master specification

The initial emphasis on wrapping existing harnesses has been replaced by native ownership. Remote compute is now the default, not a future convenience. Personal and group Spaces bind conversation, storage, memory and computers. Design, Dispatch, Fleet, computer use and Reflect are explicit modules. Desktop and mobile are first-class clients alongside web.

The prior rule to postpone multiple graphical clients is superseded by the cross-device delivery requirement; rollout still begins with thin clients and one backend. Existing artifacts remain untouched for historical comparison. [D01-D03]

## Final product position

**Build one native engine with model-adaptive methods and independent execution authority. Give every personal or group Space a persistent, governed remote workspace. Make that workspace usable from desktop, mobile and web. Let the agent improve its methods only through evidence, evaluation and authorized release.**

## v1.1 operating model

The product now leads with Space, intent, task and result rather than its internal modules. A question does not automatically allocate a computer. A group discussion does not automatically invoke agents. A shared computer does not authorize competing writes or private credential access. A ready draft is not a published outcome. Stop and takeover remain meaningful under concurrency. Memory and Reflect stay useful without quietly altering authority.

All v1.0 numbered sections and AF-01 to AF-15 remain traceable; AF-16 to AF-20 and UX-01 to UX-18 specify the new interaction and lifecycle guarantees. The review register classifies the findings as missing contracts, clarifications, design conflicts or usability improvements. None is presented as an observed production defect.

**Final product promise:** choose a Space, state the desired outcome, understand the boundary, and stay in control while the native engine does the work. Inspectable evidence and consistent recovery are part of the user experience, not only backend engineering.

---

# Sources and implementation references

This revision reviewed the supplied research report and design lineage through v1.0. External dependencies materially affecting the changes were rechecked on 2 October 2026: Electron security, React Native platform behavior, LiteLLM gateway/budgets/caching/enterprise, OpenShell architecture/support/policies, Temporal activities, PostgreSQL row security, OpenTelemetry, agent evaluation, Codex loop, Claude Design and the added S3/MCP security references. Remaining entries are inherited bibliographic references, not a new source-code audit or a recertification of the 167-project catalog. Agent Fabric contracts are proposed requirements, not upstream guarantees.

[D01] Native Engine Blueprint v0.2. Prior conversation artifact: Agent_Fabric_Native_Engine_Blueprint_v0.2.md. Native ownership, state/effect contracts and prior repository inspections.

[D02] Enterprise Workspaces and Memory v0.3. Prior conversation artifact: Agent_Fabric_Enterprise_Workspaces_and_Memory_v0.3.md. Personal/group scope, STORE/LOAD, governance and retention.

[D03] Spaces, Design, Dispatch and Reflect v0.4. Prior conversation artifact: Agent_Fabric_Spaces_Design_Dispatch_and_Reflect_v0.4.md. Product modules, computer control and evaluated learning.

[D05] Master Product and Technical Specification v1.0. Prior conversation artifact: Agent_Fabric_Master_Product_and_Technical_Specification_v1.0.md. Immediate comparison baseline; preserved unchanged.

[D06] Architecture Blueprint v0.1. Prior conversation artifact: Agent_Fabric_Architecture_Blueprint_v0.1.md. Historical wrapper-oriented proposal; superseded by native-engine ownership.

[D04] Agent Harnesses Research Report. Prior conversation artifact: Agent_Harnesses_Research_Report_2026-10-01.docx. Seven-system research and 167-project snapshot; not a live compatibility matrix.

[S01] [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security). Renderer isolation, sandboxing, restricted IPC and remote-content safety.

[S02] [React Native: Platform-specific code](https://reactnative.dev/docs/platform-specific-code.html). Shared application logic with platform-specific components and behavior.

[S03] [Expo: Development builds](https://docs.expo.dev/develop/development-builds/introduction/). Native customization through development builds; integration qualification still required.

[S04] [Android: Background tasks overview](https://developer.android.com/develop/background-work/background-tasks). Background-work execution choices and lifecycle constraints.

[S05] [LiteLLM: AI Gateway](https://docs.litellm.ai/docs/simple_proxy). Unified model access, virtual-key controls, routing and spending facilities.

[S06] [LiteLLM: Budgets and rate limits](https://docs.litellm.ai/docs/proxy/users). Personal/team/team-member distinctions and database-backed enforcement requirements.

[S07] [LiteLLM: Caching](https://docs.litellm.ai/docs/proxy/caching). Response-cache behavior and warning about semantic caching for multi-turn agent traffic.

[S08] [LiteLLM: Enterprise](https://docs.litellm.ai/docs/enterprise). Edition-dependent enterprise capabilities; verify the licensed deployment at procurement.

[S09] [NVIDIA OpenShell: How it works](https://docs.nvidia.com/openshell/latest/about/how-it-works). Gateway/supervisor responsibilities and enforcement/inference integration boundaries.

[S10] [NVIDIA OpenShell: Support matrix](https://docs.nvidia.com/openshell/latest/reference/support-matrix). Platform, kernel, compute-driver and host virtualization requirements.

[S11] [NVIDIA OpenShell: Sandbox policies](https://docs.nvidia.com/openshell/latest/sandboxes/policies). Policy enforcement and the distinction between startup and live-updated controls.

[S12] [NVIDIA: Open Agent Safety Platform announcement](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Open-Agent-Safety-Platform-to-Secure-Agents-From-Testing-to-Deployment/default.aspx). 28 September 2026. Sentry/BlueField-4 reference-system description; not proof of an Agent Fabric deployment.

[S13] [Temporal: Platform overview](https://docs.temporal.io/temporal). Durable orchestration concepts and event-history-based recovery.

[S14] [Temporal: Activity definition](https://docs.temporal.io/activity-definition). Activity retries, idempotency and external-effect considerations.

[S15] [Open Policy Agent: Documentation](https://www.openpolicyagent.org/docs). Policy decisions decoupled from application implementation; enforcement remains an application responsibility.

[S16] [PostgreSQL: Row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Row-level policies, privileged-role exceptions and FORCE ROW LEVEL SECURITY.

[S17] [pgvector: Maintainer repository](https://github.com/pgvector/pgvector). Exact/approximate vector retrieval and filtering considerations.

[S18] [LangGraph: Memory concepts](https://docs.langchain.com/oss/python/concepts/memory). Thread checkpoints, namespaced long-term memory and distinct memory categories.

[S19] [Hermes: Persistent memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory). Bounded persistent memory and session-history retrieval as design references.

[S20] [Claude: Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design). Conversational canvas, prototypes, edits and design-system workflow.

[S21] [Claude: Assign tasks from anywhere in Cowork](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork). Dispatch and remote supervision reference; native Agent Fabric execution remains independent.

[S22] [OpenTelemetry: Signals](https://opentelemetry.io/docs/concepts/signals/). Trace, metric and log concepts for correlated observability.

[S23] [Shinn et al.: Reflexion](https://arxiv.org/abs/2303.11366). Language feedback and episodic reflection without direct model-weight updates.

[S24] [Agrawal et al.: GEPA](https://arxiv.org/abs/2507.19457). Reflective prompt proposal and evaluation; benchmark results are not transferred to this product.

[S25] [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Outcome-based evaluation, grader choices and experimental limitations.

[S26] [Model Context Protocol: Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture). Host/client/server roles, capabilities, tools and resources.

[S27] [Agent Client Protocol: Introduction](https://agentclientprotocol.com/get-started/introduction). Editor/client-to-agent interoperability.

[S28] [A2A: Core concepts](https://a2a-protocol.org/latest/topics/key-concepts/). Remote task, message and artifact interoperability without shared internal state.

[S29] [OpenAI: Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/). 23 January 2026 engineering discussion: model/tool iteration, context assembly and cache/compaction trade-offs.

[S30] [Claude Code: Custom subagents](https://code.claude.com/docs/en/sub-agents). Descriptions, scoped contexts and configurable specialist tools/models.

[S31] [OpenCode: Agents](https://opencode.ai/v2/docs/agents). Primary/subagent profiles and model/permission configuration.

[S32] [Pi: Product overview](https://pi.dev/). Extensible coding harness and provider flexibility. Select component reuse against a pinned release.

[S33] [Qwen-Agent: Maintainer repository](https://github.com/QwenLM/Qwen-Agent). Composable model/tool components, function calling and retrieval-oriented applications.

[S34] [SWE-bench: Overview](https://www.swebench.com/SWE-bench/). Issue-to-patch evaluation and containerized verification infrastructure.

[S35] [LiteLLM: Memory management](https://docs.litellm.ai/docs/proxy/memory). User/team preference and feedback storage; not our native room-memory authority.

[S36] [Aider: Repository map](https://aider.chat/docs/repomap.html). Token-budgeted repository structure for model context.

[S37] [Hermes: Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture/). Core-loop, session, provider, tool and entry-point design references.



[S38] [AWS S3: Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html). Time-limited bearer access, expiry and credential/policy semantics; not instant revocation through an unrelated application's membership change.

[S39] [MCP: Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices). Authorization and token-handling boundaries; a connected endpoint is not blanket authority.
