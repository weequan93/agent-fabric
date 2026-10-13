# Approved continuation application — controller maintainer handoff

Authorization is already recorded: q-3336b91016, answer `approve`, human, 2026-10-08T03:44:03Z. Do not ask for the same authorization again. Apply only this existing goal's policy.max_iterations60→120 and policy.max_hours24→144. `approved-policy-change.json` records the exact delta and all unchanged policy values. No scope/external operation is authorized.

The agent cannot perform that mutation through the installed controller interface. Read-only CLI `--help`, `goal --help` and `repair --help`, installed cli.py:215–235, store.py:140–154 and engine.py:483–496/775–797/833–884 establish:

- CLI goal delegates to creation; the store rejects the existing ID, while a new goal creates new state. It cannot update this running goal.
- Approval answer records the decision and resumes status, without changing goal.policy.
- Contract approve approves the current contract, without changing policy.
- Repair accepts an inspected external state edit; it does not perform a policy change.
- Resume/unblock from limit resets iteration_base and started_at; ordinary unblock resets repair_rounds/stagnant_turns. These are not a history-preserving policy application/release.
- MCP inventory has no existing-goal policy mutation operation. Direct .loop edits and human impersonation are forbidden to the agent.

Required maintainer outcome, using an audited supported controller process or a maintainer-provided history-preserving operation:

1. Update only the two approved policy fields for agent-fabric-g1-f05-storage; authorize the resulting contract under the recorded human decision. Keep every other contract value and approval boundary unchanged.
2. Preserve original started_at2026-10-07T20:19:27Z, iteration_base0, cumulative iteration/usage, all55 task identities/statuses/attempts/start times/notes,96 requirements,76 checks,420 variants and complete existing event prefix. Append policy/contract/release events; do not recreate the goal or reset limits/accounting.
3. Release the environment blocker without resetting repair/stagnation/accounting histories. Resume the resources assignment, not development; resources and separate independent plan review are still required.
4. Supply actual loop_status, contract/history audit and policy event evidence. The resource planner must then recompute remaining turns/wall time including human delay and revalidate local prerequisites before stage submission.

Current observation at iteration41: actual60/24,19 future slots,52 work tasks,3,705m work. Authorized120/144 would provide79 future slots =52 work +7 remaining pipeline +20 repair. The current resource turn consumes the first originally reserved pipeline slot. At the snapshot, elapsed7.44825h +future118.75h =126.19825h,17.80175h wall headroom. Further waiting or another resource turn consumes reserve and requires recomputation; no guarantee of completion is claimed.

`history-after-answer.json` verifies monotonic usage, unchanged55 histories, original anchors and byte-identical event prefix through event726; CLI audit returned ok=true/problems=[]. `preservation-audit.json` confirms all2,581 protected inputs, nine input hashes, six controller streams and exact authored checks. These are resource/accounting audits, not product acceptance. Full save/Ask/forget/restore and all external X01–X09 remain unqualified.
