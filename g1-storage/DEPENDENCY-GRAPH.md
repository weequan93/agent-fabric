# Local dependency graph contract

`DependencyGraphRepository` owns immutable scoped dependency inventories and encrypted prepared summary/index/cache bytes. `GraphDerivedPayloadSchema` and `GRAPH_RECORD_INVENTORY` declare the new stores without replacing V1 record inventories. Prepared binary projections are supplied by an installed opaque material owner; this increment does not admit or run summarization, embedding, indexing or retry workers.

```ts
const graph = new DependencyGraphRepository(uow, journal, native, crypto, keys);
const publisher = graph.publisher(installedPreparedMaterialOwner);
const command = {key, sessionId, expiresAt, materialId, expected: null};
await publisher.publish(currentScope, command);
// An uncertain original is reconciled with the same exact command/key:
await publisher.lookup(currentScope, command);
const bytes = await graph.read(currentScope, exactRef);
try { /* authorized bytes */ } finally { bytes.fill(0); }
```

The installed material owner supplies the class, ID/revision, Task, expiry, bytes and exact parent refs; a public command supplies none of these authorities. Each direct parent set is unique, bounded64 and canonicalized. The payload binds both the binary bytes and dependency refs inside AES256-GCM. The head, graph inventory, edges and ciphertext commit in one authenticated transaction. An exact same-transaction pending head projection may be borrowed during publication; an independent caller still refuses pending authority. A definite rollback or missing payload does not become Saved here. Original lookup never authorizes automatic replay.

Migration24 enrolls existing accepted source, knowledge, artifact, logical draft and native Ask metadata without rewriting their original bodies or history. New canonical owner inserts acquire exact graph nodes through additive triggers. Source roots are independent; knowledge points to its exact source revision; an artifact points to its source when bound; a logical draft points to its exact backing artifact. Ask keeps every native selected knowledge ref and may additionally bind installed index/cache refs. These are sensitive dependency edges, not independent publication grants. Cross-Space edges, unqualified sharing/publication exceptions and missing inventories refuse.

For an Ask profile using retained index/cache dependencies, install **both** the receipt transaction adapter and receipt disclosure guard:

```ts
const askUow = graph.askUnitOfWork(installedAskCacheOwner);
// Construct the existing native/accounting/broker owners with askUow.
const hooks = {authorizeReceipt: graph.authorizeAskReceipt.bind(graph)};
// Pass hooks as the NativeAskRepository disclosureHooks argument.
```

The adapter binds supplemental dependencies in the actual native receipt transaction. The native receipt guard checks current ancestry before answer decryption and again before release, inside that same disclosure transaction. The existing native owner continues to check native/Task/recovery fences, controls, full audiences, encrypted manifest and actual settlement. The predecessor direct canonical-source Ask profile is retained; it does not consume graph projections or acquire optional projection-worker qualification.

`disclose(scope, ref, installedReader)` guards an installed artifact/draft/content reader in a borrowed transaction. Its callback is an internal composition capability, not request JSON. Space barriers span ancestry, decryption and final checks. The graph closure visits each exact vertex once through scoped indexed SQL, then checks the complete dependency inventory, cycles and longest path. Maximum depth is16 edges and maximum closure size is512 nodes, including the requested node. Missing ancestors, inventories or witnesses refuse. A512-node synthetic metadata fixture qualifies traversal bounds only; it does not qualify512 payload transformations or production capacity.

All current backing heads, key/generation, finite expiry, tombstones, source restrictions, knowledge status/validity/conflict and each distinct origin Task's complete current audience are checked before payload lookup/open. They are checked again after waits. Current-head overlay blocks old summaries immediately after a correction, while the corrected canonical record and independent branches remain eligible. A stale cache is not a permission fallback. No information already delivered to a caller is recalled.

Forget/expiry, source revocation and knowledge correction trigger exact immutable graph events and one pending job per affected enrolled descendant in the original publication transaction. Deferred constraints require exact backing controls, graph payloads, event origin and complete job sets at COMMIT. Failed traversal/inventory or failed job publication rolls back the command and leaves its independent original pending until explicit reconciliation. It does not acknowledge a restriction or completed cleanup. Existing exact-target restriction receipts retain their narrower contract. `impact(scope, {key, sessionId, expiresAt})` returns current-authorized, integrity-checked descendant IDs/counts and pending jobs. Counts cover the enrolled local graph; backups/external copies remain unknown (`null`). Missing jobs cannot yield a complete graph impact response. Pending jobs contain no worker lease, attempt, budget, dispatch or retry authorization.

Migration24 is additive and forward-only. An unapplied/interrupted migration rolls back to23 with accepted bodies and installed owners intact. Once used, a destructive down migration that removes graph/restriction evidence is unsupported. Application rollback must keep current ancestry readers and restrictive history. Whole-cluster rollback, external KMS/key rotation/region, enterprise SSO/legal holds, cloud storage/DR, remote worker isolation, provider model/billing, exported/streaming/download exposure windows and production timing/capacity remain unqualified.

`node g1-storage/scripts/check-component.mjs dependency-graph` strictly builds and executes all33 mandatory variants with real owned PostgreSQL16, OIDC and encrypted local files. Component and full lifecycle entrypoints import identical assertions. The runner, observation gate, fixture, cleanup, strict compiler and predecessor assertions stay unchanged; unknown/extra CLI arguments still refuse. Physical erasure, maintenance resource admission, leased retries, capture/import/activation, actual content-loss restore, complete frozen lifecycle journeys and aggregate/product acceptance remain pending.
