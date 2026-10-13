# Apply the already approved capacity through the human CLI

q-3336b91016 was approved by human (telegram) at 2026-10-08T03:44:03Z. That authorization remains valid. The subsequent `Continue approved from Telegram` unblock at 2026-10-08T04:21:23Z did not apply it. Actual limits at turn42 are still60 turns/24 hours. No additional approval of this delta is requested.

Correction to turn41: the installed controller DOES support updating an existing goal. `cli.py:215–235` calls `Service.goal_draft`, whose `api.py:63–95` updates an existing ID, normalizes the merged contract and appends `goal.updated`. The previous handoff incorrectly inferred creation-only behavior from `store.create_goal` without following this existing-ID branch. That earlier report remains preserved as evidence, not current guidance.

The route is human-only. In this autonomous session (`LOOP_AUTONOMOUS=1`, unchanged), the exact approved command below returned exit2:

```text
loop: Autonomous agents cannot draft goals; a human does this with the loop CLI or in chat
```

Complete stdout/stderr and command hashes are in `interface-probes.json`. Byte comparisons prove goal.json, state.json and events.jsonl were unchanged by this refusal. Installed `api.py:319–321` enforces the restriction before mutation; `mcp_server.py:130–141` also excludes human tools from autonomous sessions. No actor/environment override was attempted. This is a reproduced controller restriction, not a filesystem permission diagnosis.

The authorized human can run these commands in an ordinary non-autonomous terminal at the repository root, after inspecting `approved-goal-update.json`:

```sh
.loop/bin/loop goal --from-file docs/loop/agent-fabric-g1-f05-storage/readiness-turn42/approved-goal-update.json
.loop/bin/loop --goal agent-fabric-g1-f05-storage approve
.loop/bin/loop --json audit
.loop/bin/loop --json status
```

The file contains this same goal ID and the complete original policy with ONLY max_iterations60→120 and max_hours24→144. `audit.py` normalizes the proposed merge through the installed model and proves no other contract field changes. Policy is a replacement field; do not supply only the two values and inadvertently replace other policy settings with defaults. Do not create another goal, manually edit .loop, change scope/checks or reset accounting. The approve command records the already given human authorization against the changed contract; it is not a request for new scope.

Verify the resulting contract digest, actual120/144 policy, original started_at2026-10-07T20:19:27Z, effective iteration_base0, monotonic usage, all55 task histories,96 requirements,76 checks,420 variants and both retained event prefixes. If a blocker remains, clear it only after this verification, then resume resources. Current repair_rounds/stagnant_turns are0/0. Ordinary `unblock` assigns both zero; record its event and prove no historical event/task/usage loss. Limit resume/unblock would reset started_at/iteration_base and must not be used to replace the approved delta.

At this turn's audit snapshot, the authorized budget has78 future slots =52 work +7 mandatory pipeline +19 repair. This extra resources turn consumes one previously reserved repair slot; all seven remaining pipeline slots are retained. Future hours61.75work +14pipeline +38repair +3controller =116.75; elapsed8.0699 gives124.8199 cumulative hours,19.1801 below144. Waiting and later turns require recalculation. These are estimates, not product evidence.

After application, the resources agent must revalidate local tools as needed and submit readiness for a separate independent plan review. No development resumes merely because the blocker is cleared. Full local save/Ask/forget/restore remains pending; X01–X09 remain unqualified and separately gated.
