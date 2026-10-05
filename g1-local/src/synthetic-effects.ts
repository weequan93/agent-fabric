import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import type { SyntheticEffectPort, LocalOperation, ExactApprovalRequest, SyntheticReceipt, ScopeRef, LocalClock } from './contracts.js';
import { localAssert } from './errors.js';
import type { Failpoint } from './store.js';
export class SyntheticEffects implements SyntheticEffectPort {
    readonly effectMode = 'synthetic-only' as const;
    readonly externalInvocationCount = 0;
    executionCount = 0;
    guard?: (operationId: string, scope: ScopeRef) => void;
    private readonly db: DatabaseSync;
    constructor(filePath: string, private readonly clock: LocalClock = { now: () => Date.now() }, private readonly failpoint?: Failpoint) { mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 }); this.db = new DatabaseSync(filePath); chmodSync(filePath, 0o600); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS receipts(key TEXT PRIMARY KEY,digest TEXT NOT NULL,receipt TEXT NOT NULL) STRICT;'); }
    get receiptCount(): number { return Number(this.db.prepare('SELECT count(*) AS n FROM receipts').get()!.n); }
    async execute(operation: LocalOperation, request: ExactApprovalRequest): Promise<SyntheticReceipt> {
        localAssert(request.target === 'synthetic://' + operation.scope.spaceId + '/' + operation.operationId && request.operationId === operation.operationId && canonicalDigest(request.scope) === canonicalDigest(operation.scope), 'REMOTE_NOT_AUTHORIZED', 'Only the exact synthetic target is supported.');
        localAssert(operation.inputDigest === request.bindingDigest, 'APPROVAL_MISMATCH', 'Exact synthetic binding required.');
        const key = canonicalDigest({ scope: operation.scope, operationId: operation.operationId });
        const old = this.db.prepare('SELECT digest,receipt FROM receipts WHERE key=?').get(key);
        if (old) {
            localAssert(old.digest === operation.inputDigest, 'IDEMPOTENCY_CONFLICT', 'Effect identity cannot change.');
            return JSON.parse(String(old.receipt)) as SyntheticReceipt;
        }
        await this.failpoint?.('effect.before-execute');
        this.guard?.(operation.operationId, operation.scope);
        this.executionCount++;
        const receipt: SyntheticReceipt = { receiptId: 'effect-receipt-' + key, operationId: operation.operationId, scope: operation.scope, inputDigest: operation.inputDigest, outcome: 'committed', artifactId: 'artifact-' + key, syntheticUnits: 1, recordedAt: this.clock.now(), effectMode: this.effectMode };
        this.db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(key, operation.inputDigest, JSON.stringify(receipt));
        await this.failpoint?.('effect.after-receipt');
        return structuredClone(receipt);
    }
    async lookup(operationId: string, scope: ScopeRef): Promise<{
        status: 'found' | 'absent-safe' | 'unknown';
        receipt: SyntheticReceipt | null;
    }> { const row = this.db.prepare('SELECT receipt FROM receipts WHERE key=?').get(canonicalDigest({ scope, operationId })); return row ? { status: 'found', receipt: JSON.parse(String(row.receipt)) as SyntheticReceipt } : { status: 'unknown', receipt: null }; }
    close(): void { this.db.close(); }
}
