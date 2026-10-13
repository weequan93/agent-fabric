import { demand, ModelError } from './errors.js';

/** No currency or provider-token meaning. Runtime checks are required at every boundary. */
export type Units = number;
export const UNIT = 'synthetic-utf8-byte-unit' as const;
export const PRICING_VERSION = 'synthetic-bytes-v1' as const;
export const MAX_ATTEMPTS = 3;
export const MAX_ANCESTRY = 64;
export const PENDING_EXPOSURE = 5;
export function units(value: unknown): Units {
 demand(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0));
 return value;
}
export function positiveUnits(value: unknown): Units { const parsed = units(value); demand(parsed > 0); return parsed; }
export function safeAdd(...values: readonly number[]): Units {
 let result = 0;
 for (const value of values) {
  const n = units(value);
  if (n > Number.MAX_SAFE_INTEGER - result) throw new ModelError('NUMERIC_OVERFLOW');
  result += n;
 }
 return result;
}
export function safeMultiply(a: number, b: number): Units {
 units(a); units(b);
 const product = BigInt(a) * BigInt(b);
 if (product > BigInt(Number.MAX_SAFE_INTEGER)) throw new ModelError('NUMERIC_OVERFLOW');
 return Number(product);
}
export function safeSubtract(a: number, b: number): Units { units(a); units(b); demand(a >= b); return a - b; }
export function encodedBytes(value: unknown): Units {
 demand(typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 1_048_576);
 // Reject lone surrogates rather than silently pricing replacement characters.
 demand(value.isWellFormed());
 return units(Buffer.byteLength(value, 'utf8'));
}
export function reserveEstimate(payload: string, outputCap: Units): Units {
 return safeAdd(2, encodedBytes(payload), positiveUnits(outputCap));
}
export function measuredCost(payload: string, output: string): Readonly<{ service: Units; model: Units; total: Units }> {
 const model = safeAdd(encodedBytes(payload), encodedBytes(output));
 return Object.freeze({ service: 2, model, total: safeAdd(2, model) });
}
