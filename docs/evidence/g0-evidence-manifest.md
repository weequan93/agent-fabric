# G0 evidence and assurance manifest

Original implementation batch `team-b5072612869c462a89678f21097d346c` delivered packages G0-01–14 under the previously accepted plan. Current scoped repair/acceptance batch `team-938da3a64aea45dfbf4445e97651cfbe` preserves the original planning documents, code history and acceptance history. `g0-build.json` records the current local environment, dependency/oracle/check-definition digests and implementation/test artifact hashes. The final candidate digest is bound externally by the controller: embedding a candidate's own digest into its input file would be circular.

## Evidence authority

| Evidence | What it establishes | Authority |
|---|---|---|
| Original roadmap, G0 plan, decisions, traceability CSV | Accepted scope, dependencies, 65 required package outputs and later gates | Prior accepted planning batch, retained original bytes |
| `evals/fixtures/g0-oracle-definition.json` | Frozen 34 independent expected oracles, 102 mandatory branches, eight zero safety thresholds | Frozen G0-02 definition, SHA256 `1b322da5ef56f4c57700d5e71ae06368eea8110312ecff674db3429dc827d41e` |
| `evals/fixtures/g0-contract-suite.json` | Exact oracle/branch/requirement/package mapping and dependency lock | Local registry audited by `evals/protected/g0-oracle.test.ts` |
| Original `scripts/check-g0.mjs G0-14` | Frozen install, strict typecheck and all mandatory branch executions | Actual controller command result bound to candidate/environment/check digests |
| `evals/protected/g0-workflows.test.ts` | Actual local shared ledger + model + broker + replay/checkpoint recovery | Deterministic behavior observations; controlled external adapters |
| `evals/safety/authority-boundaries.test.ts` | Shared computer contention/waiting, old leases, six paths, absent controls, no added runtime assignment | Local protocol tests, no hardware qualification |
| `evals/recovery/replay-and-fencing.test.ts` | Owner checkpoint atomicity, current grants, unchanged identity and unknown/terminal preservation | Local deterministic owner tests |
| `docs/evidence/g0-requirements-matrix.csv` | Six G0 batch requirements plus 20 AF and 18 UX requirements, local evidence and later obligations | Local traceability, with final status from current controller record |
| Registered `team-independent-security`, `team-independent-reviewer`, `team-independent-acceptance` | Formal independent findings and acceptance for the integrated candidate | Actual signed evaluator envelopes in the Loop batch record, never native chat advice |

The host observed 197 passing tests, including all 102 required branches exactly once, with zero failed/cancelled/skipped/TODO tests before submission. Submission reruns the original checks on the imported candidate. Only that current result and the registered signed evaluations establish final acceptance. If repair changes any input, its hashes and local observations must be refreshed and stale evaluator evidence cannot qualify the changed candidate.

## Delivered local behavior

One shared identity/error/fence/budget vocabulary supports trusted Spaces/actors/grants, closed Task/Command/event schemas, artifact byte/manifest confirmation, outbox, Task/Run transitions, pure replay, authorized cursor/snapshot recovery, exact effect approval, unknown acknowledgement reconciliation, Stop and desktop mutation barriers, source-aware context and pinned model profiles, allowance conservation and unified retry budget, artifact/check/delivery lineage, controlled runtime/tool/channel contracts, presentation/desktop state and fact/behavior separation.

Checkpoint recovery validates current grants first, applies deletion tombstones, conserves original reservations and receipts, blocks unknown re-execution and reconciles before continuation. The integration test uses actual ledger owners for both G0-07 and G0-09. Earlier package-specific BudgetPort observation stubs remain labeled as stubs; they are not sole evidence for the integrated budget requirement.

The architecture registry's IDs are validated string aliases, not nominal TypeScript brands. Authoritative scope/actor checks remain runtime responsibilities. Controller dispatch is serial by package dependency; actual native workers have isolated drafts, exact file ownership and fixed deadlines. Expired or empty assignments remain recorded as stopped/collected failures, never successful evidence.

## Pending deployment and product qualifications

G0 is deterministic local protocol implementation. No actual PostgreSQL migration/RLS execution, encrypted object store, external model/provider invoice, production SSO, real runtime/OpenShell/Linux isolation, real shell/browser/desktop access, hardware mutation interception or three deployed clients has been qualified. Controlled runtime verifier callbacks and CheckReceiptRegistry fixtures establish local contracts only. They are separate from the registered independent evaluator executions.

G1 retains identity/storage/model/runtime/three-client qualification. G2 retains production Memory/Dispatch/Fleet capability. G3 retains complete real computer-use controls and production Design/desktop. G4 retains protected holdout, Reflect and behavior-release qualification. The 38-row original CSV remains planning history; the new matrix makes the local coverage and each later product obligation explicit. No pending gate has been relabeled as deployment acceptance.

Native host-model tokens and cost are outside scheduler accounting and remain unknown. Controller/evaluator limits and actual reported usage are in the durable Loop record; this manifest asserts no overall hard spend guarantee.

Reproduction: `docs/operations/g0-quickstart.md`. Recovery: `docs/operations/g0-recovery-procedure.md`. The live progress page exposes actual assignment states, imported outputs, checks and blockers. Batch completion requires `status=COMPLETE` and `final_candidate_current=true` in the authoritative record.

The user-approved 600-second recovery lineage is retained unchanged in `g0-review-recovery.json` and `g0-review-recovery.md`. Its registered safety assessment found blocking `SEC-G0-001`; that failed result remains historical. The subsequent scoped repair and atomic final verification are linked by `g0-security-repair.json` and `g0-security-repair.md`. The current repair team requires all original security, code and requirements checks, with their original criteria/procedures, on the exact post-repair candidate. Native specialist work and this manifest never replace those registered results. Historical known controller wall time is 615 seconds plus actual current-child usage; overall native-host token/cost remains unknown.

Current SEC-G0-002 repair supplements the unchanged 102 mandatory branches with six actual omission/authorized/revocation regressions. The collected candidate passed 197/197 tests with no failure, skip, cancellation or TODO. Exact failed review binding and actual red/green observations are retained in g0-acceptance-index.json. The current cumulative controller usage formula is 622 + current g0_final child usage.wall_seconds; the earlier 615 figure above is historical. All three registered checks remain required on this changed candidate.

Dependency license and update evidence (G0-02): g0-build.json dependencyLicenseInventory now records all three distinct locked packages: typescript 5.9.3 (Apache-2.0), @types/node 22.18.6 (MIT), and its transitive undici-types 6.21.0 (MIT). Records contain actual shipped license texts, package metadata/hash, lock integrity and upstream references. The compiler bundled third-party notice is separately source/hash/component bound and must be retained intact on future distribution. Existing G0-02 engine/control owner is accountable, with build/DevOps responsible for update evidence and original validation at any upgrade boundary. The earlier REV-G0-001 failure and security pass remain historical-candidate records in the acceptance index; this evidence change requires all three current-candidate reviews again.
