import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import type { LocalState, LocalStorePort } from './contracts.js';
import { localAssert } from './errors.js';
import { createSeedState } from './identity.js';
export type Failpoint = (name: string) => void | Promise<void>;
function validateState(state: LocalState): void {
    localAssert(state.schemaVersion === 1 && Number.isSafeInteger(state.authorityRevision) && state.authorityRevision >= 0, 'INVALID_SCHEMA', 'Versioned local state required.');
    for (const key of ['identities', 'sessions', 'spaces', 'sources', 'tasks', 'plans', 'runs', 'approvals', 'operations', 'modelOperations', 'reservations', 'budgets', 'artifacts', 'checks', 'commands', 'outbox', 'events', 'tombstones'] as const)
        localAssert(Array.isArray(state[key]), 'INVALID_SCHEMA', 'Required owner collections are missing.');
    for (const task of state.tasks)
        localAssert(state.spaces.some(s => s.scope.spaceId === task.scope.spaceId && s.scope.tenantId === task.scope.tenantId && s.payerId === task.payerId) && state.identities.some(a => a.actorId === task.ownerActorId) && task.runIds.every(id => state.runs.some(r => r.runId === id && r.taskId === task.taskId)), 'SCOPE_MISMATCH', 'Task owner and Run relations required.');
    for (const run of state.runs)
        localAssert(state.tasks.some(t => t.taskId === run.taskId && canonicalDigest(t.scope) === canonicalDigest(run.scope)), 'SCOPE_MISMATCH', 'Run parent relation required.');
    for (const op of [...state.operations, ...state.modelOperations])
        localAssert(state.runs.some(r => r.runId === op.runId && r.taskId === op.taskId && canonicalDigest(r.scope) === canonicalDigest(op.scope)) && state.reservations.some(r => r.reservationId === op.reservationId && r.operationId === op.operationId), 'SCOPE_MISMATCH', 'Operation and reservation relations required.');
    for (const budget of state.budgets) {
        const rows = state.reservations.filter(r => canonicalDigest(r.scope) === canonicalDigest(budget.scope));
        const held = rows.filter(r => r.state === 'reserved' || r.state === 'unknown').reduce((n, r) => n + r.units, 0);
        const settled = rows.filter(r => r.state === 'settled').reduce((n, r) => n + r.settledUnits, 0);
        localAssert([budget.ceiling, budget.reserved, budget.settled].every(n => Number.isSafeInteger(n) && n >= 0) && budget.reserved === held && budget.settled === settled && held + settled <= budget.ceiling, 'BUDGET_EXHAUSTED', 'Synthetic budget conservation required.');
    }
    for (const artifact of state.artifacts)
        if (artifact.committed)
            localAssert(state.runs.some(r => r.runId === artifact.runId && r.taskId === artifact.taskId) && artifact.digest === createHash('sha256').update(artifact.text).digest('hex') && artifact.byteLength === Buffer.byteLength(artifact.text), 'ARTIFACT_NOT_COMMITTED', 'Committed artifact bytes and parent required.');
}
export class SQLiteStore implements LocalStorePort {
    private readonly database: DatabaseSync;
    private closed = false;
    constructor(readonly filePath: string, initialState: LocalState = createSeedState(), private readonly failpoint?: Failpoint) {
        mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
        this.database = new DatabaseSync(filePath, { timeout: 1000, allowExtension: false });
        chmodSync(filePath, 0o600);
        this.database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_state(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, digest TEXT NOT NULL) STRICT;');
        localAssert(this.database.prepare('PRAGMA busy_timeout').get()?.timeout === 1000, 'STORE_UNAVAILABLE', 'Required local busy timeout unavailable.');
        if (!this.database.prepare('SELECT id FROM local_state WHERE id=1').get()) {
            const value = JSON.stringify(initialState);
            this.database.prepare('INSERT INTO local_state VALUES(1,?,?)').run(value, canonicalDigest(initialState));
        }
        this.snapshot();
    }
    snapshot(): LocalState { localAssert(!this.closed, 'STORE_UNAVAILABLE', 'Store is closed.'); const row = this.database.prepare('SELECT value,digest FROM local_state WHERE id=1').get(); localAssert(row && typeof row.value === 'string', 'STORE_UNAVAILABLE', 'State is unavailable.'); const state = JSON.parse(row.value) as LocalState; localAssert(state.schemaVersion === 1 && canonicalDigest(state) === row.digest, 'CHECK_BINDING_MISMATCH', 'Persisted state integrity mismatch.'); validateState(state); return state; }
    transaction<T>(mutate: (state: LocalState) => T): T {
        localAssert(!this.closed, 'STORE_UNAVAILABLE', 'Store is closed.');
        this.database.exec('BEGIN IMMEDIATE');
        try {
            const state = this.snapshot(), result = mutate(state);
            localAssert(!(result && typeof result === 'object' && 'then' in result), 'INVALID_SCHEMA', 'Transaction callback must be synchronous.');
            const detached = structuredClone(result);
            validateState(state);
            const digest = canonicalDigest(state);
            const fault = this.failpoint?.('store.before-commit');
            localAssert(!(fault && typeof fault === 'object' && 'then' in fault), 'INVALID_SCHEMA', 'Store fault hooks must be synchronous.');
            this.database.prepare('UPDATE local_state SET value=?,digest=? WHERE id=1').run(JSON.stringify(state), digest);
            this.database.exec('COMMIT');
            return detached;
        }
        catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }
    close(): void { if (!this.closed) {
        this.database.close();
        this.closed = true;
    } }
}
