# Reproduce the G1 data foundation

Use Node 22.22.3, pnpm 10.18.0 and an accessible Docker daemon. Install only the new independent package with `pnpm --dir g1-foundations install --ignore-workspace --ignore-scripts --frozen-lockfile --store-dir /private/tmp/agent-fabric-pnpm-store`. Build with `node g1-foundations/scripts/build.mjs`; run the owned synthetic PostgreSQL suite with `node g1-foundations/scripts/check.mjs`. Run original baselines via `node g1-foundations/scripts/check-retained.mjs`. Drivers/toolchain are pinned by the new lock; pg 8.16.3 is MIT, registry integrity is retained in that lock. Accepted root and g1-local locks stay unchanged.

The fixture uses a pinned cached PostgreSQL16 image, an ephemeral unique labeled container and synthetic identifiers. Its port is loopback-only, CPU/memory bounded and credentials test-only. Cleanup is restricted to its own actual container identity; never use an existing database, delete existing services, or prune Docker. A missing daemon/image/driver fails the check; no mock or remote fallback may satisfy PostgreSQL qualification. Recover a failure by inspecting its measured stage, stopping only the exact owned fixture, and rerunning within the original attempt budget. Unknown command commits are reconciled by receipt lookup, not blind replay.

Scope/profile APIs belong to the trusted service, not a client SDK. Passing an object with actor or payer fields never establishes authority. Database GUCs alone do not authenticate a user. Formal SSO, provider/region/budget, Temporal/storage integration, full Linux isolation, physical phones and signing/distribution remain pending; all previous local accepted artifacts retain their narrower scope.

The foundation-behavior check requires the remote probe, which performs strictly read-only SSH with an existing pinned host key against the user-approved test machine; it reads no private-key bytes or credential values and makes no deployment or region/OS isolation claim. Existing local/remote services must remain untouched. Paid models/new paid resources are disabled throughout this increment.

## Locked dependency inventory

Declared package metadata below was read from the installed exact lock-resolved packages. DevOps owns updates and license rechecks before enabling a deployment; current accepted locks are preserved.

| Package | Version | Declared license |
|---|---|---|
| @types/node | 22.18.6 | MIT |
| @types/pg | 8.15.5 | MIT |
| pg | 8.16.3 | MIT |
| pg-cloudflare | 1.4.1 | MIT |
| pg-connection-string | 2.14.1 | MIT |
| pg-int8 | 1.0.1 | ISC |
| pg-pool | 3.14.0 | MIT |
| pg-protocol | 1.16.1 | MIT |
| pg-types | 2.2.0 | MIT |
| pgpass | 1.0.5 | MIT |
| postgres-array | 2.0.0 | MIT |
| postgres-bytea | 1.0.1 | MIT |
| postgres-date | 1.0.7 | MIT |
| postgres-interval | 1.2.0 | MIT |
| split2 | 4.2.0 | ISC |
| typescript | 5.9.3 | Apache-2.0 |
| undici-types | 6.21.0 | MIT |
| xtend | 4.0.2 | MIT |
