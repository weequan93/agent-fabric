# G1-F05 continuation decision — proposed, not authorized

RESOURCE39-01 blocks resources sign-off. At iteration40/max60,3/55 tasks are done and52 bounded work tasks remain. The controller has20 subsequent turns; work alone needs52. Original started_at is2026-10-07T20:19:27Z, iteration_base is0, and max_hours is24. The52 authored estimates sum3,705m/61.75h; the read-only snapshot observes7.3253h elapsed and16.6747h remaining. See capacity-audit.json and controller-status-before.json.

Request: authorize the controller policy owner to change only this existing goal's max_iterations from60 to120 and max_hours from24 to144 through an audited, history-preserving controller contract process. All other policy values, including120min turn timeout, attempt/repair ceilings and approval boundaries, stay as approved. No new provider, paid resource, deployment, credential/access change, external message or expanded product scope is requested.

| Future allocation after turn40 | Turns | Time allocation |
| --- | ---: | ---: |
| All52 unchanged bounded work tasks |52|61h45m authored estimates |
| Resource revalidation/submission |1|up to2h |
| Independent plan review |1|up to2h |
| Staged-test reporting/preparation |1|up to2h |
| Independent security review |1|up to2h reserved; configured review timeout15m |
| Independent code review |1|up to2h reserved; configured review timeout15m |
| Final acceptance review |1|up to2h |
| Product acceptance review |1|up to2h |
| Final evidence/handoff or another resource review |1|up to2h |
| Bounded repair/rework turns, including reruns/re-review |20|up to40h at existing turn ceiling |
| Controller-run staged/final checks |0 agent turns|3h reserve; acceptance command timeout sum70m per cycle |
| Total future |80|120h45m |

Proposed cumulative turn endpoint is40+52+8+20=120. Proposed wall budget is elapsed7.3253h + future120.75h =128.0753h, below144h with15.9247h headroom at snapshot. Time waiting for the human counts under the implementation's original-start wall-clock budget and consumes that headroom. These are capacity estimates, not guarantees of completion or product evidence. Further repairs beyond the reserve or delayed authorization need a fresh decision, not weakened checks.

Preserve this goal ID, all55 tasks/statuses/attempts/start times/notes, all96 requirements, all76 task checks and original full-suite gates,420 mandatory variants, original start and iteration_base0, cumulative usage and complete event chain. history-before.json records cumulative usage and event head726/hash677b917cc9ccdc07e498b3e85e08bae877427889c95c54c69b9c3f7bf40e614e before the question. Approval/note/policy events append to that prefix. No goal recreation or accounting reset is authorized.

The installed MCP surface has no policy-update operation. loop_ask records the decision; engine.answer does not alter goal.policy. The human/controller maintainer must arrange the audited change and contract authorization. Do not manufacture a human answer or use controller goal creation to replace this goal. engine.resume/unblock from limit resets iteration_base and started_at, so that path cannot establish the requested preserved cumulative budget.

After actual policy application, recheck loop_status, policy, history/integrity and original-start elapsed time; verify80 or fewer future slots still cover all unfinished work plus the remaining mandatory pipeline and repair allocation. Revalidate tools as needed, then submit resources and obtain a separate independent plan review. Until then readiness stays NOT READY and loop_stage_done is withheld. A denial keeps this exact resource unresolved.
