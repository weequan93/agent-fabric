import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import type { DeterministicModelPort, ModelInput, ModelTestReceipt, ScopeRef, LocalClock } from './contracts.js';
import { validateLocalPolicy } from './contracts.js';
import { localAssert } from './errors.js';
import type { Failpoint } from './store.js';
export class DeterministicTestModel implements DeterministicModelPort {
    readonly modelMode = 'deterministic-test' as const;
    readonly externalInvocationCount = 0;
    invocationCount = 0;
    guard?: (operationId: string, scope: ScopeRef) => void;
    private readonly db: DatabaseSync;
    constructor(filePath: string, private readonly clock: LocalClock = { now: () => Date.now() }, private readonly failpoint?: Failpoint, policy: unknown = {}) { validateLocalPolicy(policy); mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 }); this.db = new DatabaseSync(filePath); chmodSync(filePath, 0o600); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts(key TEXT PRIMARY KEY,digest TEXT NOT NULL,receipt TEXT NOT NULL) STRICT;'); }
    get receiptCount(): number { return Number(this.db.prepare('SELECT count(*) AS n FROM receipts').get()!.n); }
    async invoke(input: ModelInput): Promise<ModelTestReceipt> {
        canonicalDigest(input);
        localAssert(input.inputDigest === canonicalDigest({ intent: input.intent, input: input.input }), 'CHECK_BINDING_MISMATCH', 'Exact deterministic model input required.');
        const key = canonicalDigest({ scope: input.scope, operationId: input.operationId });
        const old = this.db.prepare('SELECT digest,receipt FROM receipts WHERE key=?').get(key);
        if (old) {
            localAssert(old.digest === input.inputDigest, 'IDEMPOTENCY_CONFLICT', 'Model identity cannot change.');
            return JSON.parse(String(old.receipt)) as ModelTestReceipt;
        }
        await this.failpoint?.('model.before-invoke');
        this.guard?.(input.operationId, input.scope);
        this.invocationCount++;
        const receipt: ModelTestReceipt = { receiptId: 'model-receipt-' + key, operationId: input.operationId, inputDigest: input.inputDigest, output: (input.intent === 'ask' ? 'Deterministic answer: ' : 'Deterministic plan: ') + input.input, syntheticUnits: Math.max(1, Math.ceil(input.input.length / 4)), modelMode: this.modelMode };
        void this.clock;
        this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(key, input.inputDigest, JSON.stringify(receipt));
        await this.failpoint?.('model.after-receipt');
        return structuredClone(receipt);
    }
    async lookup(operationId: string, scope: ScopeRef): Promise<{
        status: 'completed' | 'safely-failed' | 'unknown';
        receipt: ModelTestReceipt | null;
    }> { const row = this.db.prepare('SELECT receipt FROM receipts WHERE key=?').get(canonicalDigest({ scope, operationId })); return row ? { status: 'completed', receipt: JSON.parse(String(row.receipt)) as ModelTestReceipt } : { status: 'unknown', receipt: null }; }
    close(): void { this.db.close(); }
}
