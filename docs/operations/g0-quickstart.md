# G0 local verification

This batch implements the G0 deterministic local protocol baseline. The original roadmap, G0 plan, decision register and traceability CSV remain accepted planning history. Current implementation coverage is in `docs/evidence/g0-requirements-matrix.csv`.

Use Node 22.22.3 and pnpm 10.18.0. Dependencies are pinned to TypeScript 5.9.3, @types/node 22.18.6 and undici-types 6.21.0 by the frozen lockfile. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test:g0
```

In this verification environment the dependency cache is already populated. The controller's clean-copy check uses:

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /private/tmp/agent-fabric-pnpm-store
node scripts/check-g0.mjs G0-14
```

The original checker validates retained planning hashes and the frozen oracle, installs the frozen dependencies, typechecks and executes the protected suite. It requires each of the 34 oracles' allowed, denied and recovery branches to pass exactly once: 102 mandatory branches. Missing, duplicate, skipped, TODO or failing branches fail the gate. Generated ESM files are under `node_modules/.cache/agent-fabric-build`, outside candidate source inputs.

The main integration example is `evals/protected/g0-workflows.test.ts`: an actual local TaskRepository/SessionLoop, shared BudgetLedger, ControlledModelAdapter, durable-confirmation model, current FenceRegistry, exact ApprovalRegistry and EffectBroker. Real local owner classes are used; provider responses, downstream effects and clocks are controlled fixtures with observed calls. Read `docs/operations/g0-recovery-procedure.md` before wiring deployment adapters.

There is no deployed HTTP server or production client entry point in G0. G1 must qualify real identity, PostgreSQL/RLS, encrypted storage, provider/runtime deployment and three actual clients. G2–G4 retain the roadmap's product, computer-use, protected holdout and release qualification gates. The SQL migration is a scoped schema artifact, not an executed database attestation. Desktop mutation barriers and runtime probes are local protocols, not hardware isolation proof.

The authoritative final result is the Loop repair/acceptance batch record for `team-938da3a64aea45dfbf4445e97651cfbe`, including the current candidate, original command checks and all three registered independent evaluations. The original implementation batch `team-b5072612869c462a89678f21097d346c` and intermediate review recovery remain preserved history, linked in `docs/evidence/g0-security-repair.json`. A local test or native specialist report cannot substitute for the current registered record.
