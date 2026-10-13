import { demand, ModelError } from './errors.js';
import { units, positiveUnits } from './arithmetic.js';

export interface Decoder<T> { parse(value: unknown): T }
export type Value<D> = D extends Decoder<infer T> ? T : never;
function invalid(): never { throw new ModelError('INVALID_SCHEMA'); }
export const uuid: Decoder<string> = { parse: v => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v) ? v : invalid() };
export const digest: Decoder<string> = { parse: v => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v) ? v : invalid() };
export const text: Decoder<string> = { parse: v => typeof v === 'string' && v.length > 0 && v.length <= 2048 && v.trim() === v && v.isWellFormed() && !/[\u0000-\u001f]/u.test(v) ? v : invalid() };
export const body: Decoder<string> = { parse: v => typeof v === 'string' && v.isWellFormed() && Buffer.byteLength(v, 'utf8') <= 1_048_576 ? v : invalid() };
export const boolean: Decoder<boolean> = { parse: v => typeof v === 'boolean' ? v : invalid() };
export const revision: Decoder<number> = { parse: units };
export const positive: Decoder<number> = { parse: positiveUnits };
export const version: Decoder<1> = { parse: v => { if (v !== 1) throw new ModelError('UNSUPPORTED_VERSION'); return 1; } };
export const timestamp: Decoder<string> = { parse: v => {
 if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) return invalid();
 const date = new Date(v); return Number.isFinite(date.getTime()) && date.toISOString() === v ? v : invalid();
} };
export function literal<const T extends string | number | boolean>(expected: T): Decoder<T> { return { parse: v => v === expected ? expected : invalid() }; }
export function enumeration<const T extends readonly string[]>(...allowed: T): Decoder<T[number]> {
 return { parse: v => typeof v === 'string' && allowed.includes(v) ? v as T[number] : invalid() };
}
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> { return { parse: v => v === null ? null : decoder.parse(v) }; }
export function list<T>(decoder: Decoder<T>, max = 256, min = 0): Decoder<readonly T[]> {
 return { parse: v => {
  demand(Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(v as object);
  // Inspect descriptors before accessing elements/length; never execute a getter.
  const length = descriptors['length']?.value as unknown;
  demand(typeof length === 'number' && Number.isSafeInteger(length) && length >= min && length <= max);
  demand(Reflect.ownKeys(v).length === length + 1);
  const result: T[] = [];
  for (let i = 0; i < length; i++) {
   const d = descriptors[String(i)]; demand(d && Object.hasOwn(d, 'value') && d.enumerable);
   result.push(decoder.parse(d.value));
  }
  return Object.freeze(result);
 } };
}
export function object<const S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<{ readonly [K in keyof S]: Value<S[K]> }> {
 return { parse: v => {
  demand(v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)));
  const keys = Reflect.ownKeys(v); const expected = Object.keys(shape);
  demand(keys.length === expected.length && keys.every(k => typeof k === 'string' && Object.hasOwn(shape, k) && !['__proto__', 'constructor', 'prototype'].includes(k)));
  const result: Record<string, unknown> = {};
  for (const [key, decoder] of Object.entries(shape)) {
   const d = Object.getOwnPropertyDescriptor(v, key);
   demand(d && Object.hasOwn(d, 'value') && d.enumerable);
   result[key] = decoder.parse(d.value);
  }
  return Object.freeze(result) as { readonly [K in keyof S]: Value<S[K]> };
 } };
}
export function refined<T>(decoder: Decoder<T>, predicate: (value: T) => boolean, code: ConstructorParameters<typeof ModelError>[0] = 'INVALID_SCHEMA'): Decoder<T> {
 return { parse: v => { const result = decoder.parse(v); demand(predicate(result), code); return result; } };
}
/** Discriminant is inspected as a data descriptor before selecting a closed branch. */
export function tagged<const S extends Record<string, Decoder<unknown>>>(key: string, branches: S): Decoder<Value<S[keyof S]>> {
 return { parse: v => {
  demand(v !== null && typeof v === 'object');
  const d = Object.getOwnPropertyDescriptor(v, key);
  demand(d && Object.hasOwn(d, 'value') && typeof d.value === 'string' && Object.hasOwn(branches, d.value));
  return branches[d.value]!.parse(v) as Value<S[keyof S]>;
 } };
}
