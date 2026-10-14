# Turn268 — current-plan resource confirmation

2026-10-13. Resources stage, resource planner. Local resources are ready for independent plan review of the Turn267 direct control-scan repair. F05 remains **not accepted**. Production code/tests/migrations/check definitions are unchanged; no behavioral/controller check, database/container startup, subagent, external action or freeze/re-freeze occurred. No new resource audit script, capture machinery, raw copy or candidate tree is added.

Read the roadmap, foundations plan, AF-07/UX-01 ledger and master cited requirements/Ask/native/storage/memory/acceptance sections; F02 evidence; brief/solution/test plan; Turn265/267 reports; current controller goal, tasks, checks and dependencies; and the actual package/build/runner/fixture/dependency/candidate/guard owners. The new repair output is pending product work, not a missing tool or an excuse to claim the failed schedule ready.

The [primary readiness](../readiness.md) now attests to the current76-task plan:67 done,4 dropped,5 live unfinished;72 nondropped tasks;132 live task check definitions plus4 goal acceptance definitions;96/96 covered requirements. All live dependencies are acyclic with no dropped/missing prerequisite. Source repair → full D/H → security integration → aggregate → terminal, then actual controller reviews/final/product gates. Active H remains waiting on the source task. Source/test leads join before serialized checks.

Every task requires at most2 seats. This is within the prior declared4-seat ceiling and the host's4 agent slots; current goal policy has no numeric `team_limit`, so no unobserved enforcement is claimed. `max_iterations`/`max_hours` are null; there is no turn/hour capacity gate. The900s D/H and1800s aggregate bounds are unchanged and still require actual full execution. The removed240000ms per-file default remains removed.

## Bounded local probes

| Exact probe / read | Actual outcome |
| --- | --- |
| `node --version` | Exit0, `v22.22.3`. |
| `pnpm --version` | Exit0, `10.18.0`. |
| `node g1-storage/node_modules/typescript/bin/tsc --version` | Exit0, `Version 5.9.3`. |
| `node g1-storage/node_modules/typescript/bin/tsc -p g1-storage/tsconfig.json --noEmit` | Exit0, no diagnostics; no emitted/cache output written. Compiler/type-check availability only. |
| Existing `assertDependencyMetadata()`, `assertBaseline()`, `candidateSnapshot()` through inline Node imports |18 packages/17 notices validated; pg-types/pgpass installed notices absent, independent security/license assessment unknown.2581 accepted inputs unchanged. Product candidate remains1177 files, SHA256 `480a3e234b28367d933e3d1de1edbc5980006c7c9d5423f7606039dda897fd14`. |
| `docker --version` | Exit0, CLI29.1.0/build360952c8d3. |
| `docker info --format 'server={{.ServerVersion}} os={{.OSType}} arch={{.Architecture}} cpus={{.NCPU}} memoryBytes={{.MemTotal}} running={{.ContainersRunning}}'` | Exit0, server29.1.2/Linux/aarch64/12CPU/33864495104 bytes RAM/four running containers. Availability snapshot, no reservation/load/schedule verdict. |
| `docker image inspect postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333 --format '{{.Id}} {{json .RepoDigests}}'` | Exit0, exact image ID and repository digest match. No pull/start. |
| `docker ps -a --filter label=agent-fabric.storage-fixture-owner --format '{{.ID}} {{.Names}} {{.Status}}'` | Exit0, empty. Four unrelated running containers are untouched. Empty current census does not retroactively certify a timeout's cleanup. |
| `df -h . /private/tmp` | Exit0, shared data volume1.8TiB total/806GiB used/1.0TiB free/44% used. |
| `sysctl -n hw.ncpu hw.memsize` | Exit1, `sysctl: sysctl fmt -1 1024 1: Operation not permitted`. Docker capacity is the available read-only alternative; no host setting changed. |
| Direct shell `ps -axo pid=,ppid=,comm=` | Exit0, actual nonempty process rows. This route differs from the Node fixture's child-spawn boundary. |
| Inline Node ephemeral HTTP server on127.0.0.1/OS-selected port, bounded fetch with2000ms timeout, close in finally | HTTP200/exact synthetic response; cleanup `listening:false`. No persistent server or data. |
| Inline `statSync('/private/tmp/agent-fabric-pnpm-store').isDirectory()` | True. Latest original authority run also proves actual offline/frozen/ignore-scripts install; no install/registry request ran here. |

The first combined inline census/HTTP probe stopped at the census before starting the server. A separate minimal reproduction preserves the actual failure rather than treating the direct-shell success as Node availability:

```javascript
import {spawnSync} from 'node:child_process';
const r = spawnSync('ps', ['-axo', 'pid=,ppid=,comm='], {
  encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024
});
// Observed: status:null; error.code:'EPERM';
// error.message:'spawnSync ps EPERM'; stdoutBytes:0.
```

The separate HTTP/store probe succeeded afterward. Mandatory fixtures and Electron/GUI must continue through the existing controller outside sandbox; never replace the census or change system permissions. Latest original authority/profile runs prove actual controller census and ownership-checked fixture cleanup. No repeated unchanged failed H or unnecessary behavior rerun was launched for resource confirmation.

## Reused original evidence and remaining gaps

Directly read/hash-verified latest authority, staging, artifact, restore-activation, full D/H and diagnostic profile stdout/stderr at their original controller paths. The readiness report records exact job/check suffixes, byte counts/digests and candidate limits. Authority/D/H/profile on the current product candidate retain their prior verdicts:authority PASS75984ms, D PASS107732ms with qualified:false, H TIMEOUT900098ms without prerequisite completion, diagnostic profile PASS12037ms without fresh build. Staging/artifact/restore task-owner runs are earlier-candidate history, not passes for the future repair. No current aggregate check result exists.

Preserved historical Turn163/Turn162 readiness remains22414 bytes, SHA256 `aef8cc7339b96a11c388d28f76ec8d4f675ff5f0f24bc26d197e06314a90cd72`, at [the existing historical path](../plan-turn267/readiness-before.md). Its dropped capture task and five observer/admission outputs are absent from current prerequisites. No further historical copy is needed.

No local tool/account gap blocks the reviewed source step. Backend lead owns the pending read-only invoker projection and F05 migration pins; tester seat owns direct compatibility/multi-fault/wait/recovery assertions. Preserve source/full-audience/current-authority/native checks after waits/effects, exact digest/refusal ordering and original-key uncertainty/recovery. Existing four complete source components require fresh checks after implementation; then original full D/H remains the schedule oracle and aggregate remains separate. The plan is an evidence-supported performance hypothesis, not a guaranteed deadline fix.

Maximum five owned PG containers at1CPU/256MiB/128PID, loopback/no-bind/never-pull and complete ownership/LIFO/root/census cleanup remain. Existing compiler sabotage copies are ephemeral test fixtures, not retained candidate trees. Disposable root/disk/permission fixtures are pre-approved if later needed; real physical-device/host/power guarantees remain unqualified. The old H timeout and later exact recovery remain separate observations.

External X01–X09 remain unqualified with the owners/gates in the test plan and readiness:provider/KMS/storage; whole-cluster/power/multi-host recovery; enterprise retention/legal hold/residency; brokered delivery revocation; F06 runtime isolation; enterprise identity/human judgment; real supplier/billing; F07 signed physical clients; later G2–G5 depth. No external approval is requested because none is needed to start local implementation after plan review. Full H/aggregate/security/terminal/independent/final/product qualification remains pending.

The broad2026-10-13 standing approval covers this in-scope document/local-probe work. No product requirement/scope/budget, real credential/access/security setting, deployment, paid/remote resource, message, personal-data deletion or published history changed. No freeze/re-freeze flow applies to this resource-only turn.

Scoped whitespace/link validation passes; the preserved historical report and1177-file product candidate are unchanged, and2581 accepted guards pass. No controller check job is running. These local document/resource validations supply no behavioral acceptance verdict.

`loop_stage_done(stage="resources", path="docs/loop/agent-fabric-g1-f05-storage/readiness.md")` succeeds. The controller's actual next assignment is independent `plan_review`, dispatched by a separate read-only reviewer; this author does not perform that review or start production work in this turn.
