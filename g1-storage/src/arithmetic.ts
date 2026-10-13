import { demand } from './errors.js';
export const LIMITS = Object.freeze({commandBytes: 1_048_576, selected: 64, recipients: 256,
 depth: 16, nodes: 512, files: 1024, backupBytes: 67_108_864});
export function units(v: unknown): number {
 demand(typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0)); return v;
}
export function positiveUnits(v: unknown): number { const n = units(v); demand(n > 0); return n; }
export function safeAdd(a: number, b: number): number {
 units(a); units(b); const n = a + b; demand(Number.isSafeInteger(n), 'NUMERIC_OVERFLOW'); return n;
}
export function safeMultiply(a: number, b: number): number {
 units(a); units(b); const n = a * b; demand(Number.isSafeInteger(n), 'NUMERIC_OVERFLOW'); return n;
}
