/** Small closed JSON decoders: all keys required, unknown keys/prototypes rejected.
 * Decoding copies and deeply freezes values; TypeScript casts are never validation. */
export class RecoveryError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'BINDING_CONFLICT' | 'ILLEGAL_TRANSITION' | 'STALE_GENERATION' | 'RECONCILIATION_REQUIRED', message: string = code) {
    super(message); this.name = 'RecoveryError';
  }
}
export interface Decoder<T> { parse(value: unknown): T }
export type Value<D> = D extends Decoder<infer T> ? T : never;
function invalid(): never { throw new RecoveryError('INVALID_INPUT'); }
export const uuid: Decoder<string> = {parse: value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value) ? value : invalid()};
export const digest: Decoder<string> = {parse: value => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value) ? value : invalid()};
export const text: Decoder<string> = {parse: value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\u0000-\u001f]/u.test(value) ? value : invalid()};
export const revision: Decoder<number> = {parse: value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid()};
export const positive: Decoder<number> = {parse: value => { const n = revision.parse(value); return n > 0 ? n : invalid(); }};
export const timestamp: Decoder<string> = {parse: value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return invalid();
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : invalid();
}};
export function enumeration<const T extends readonly string[]>(...values: T): Decoder<T[number]> {
  return {parse: value => typeof value === 'string' && values.includes(value) ? value as T[number] : invalid()};
}
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> { return {parse: value => value === null ? null : decoder.parse(value)}; }
export function list<T>(decoder: Decoder<T>): Decoder<readonly T[]> {
  return {parse: value => Array.isArray(value) && value.length <= 1000 ? Object.freeze(Array.from(value, item => decoder.parse(item))) : invalid()};
}
export function object<const S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<{readonly [K in keyof S]: Value<S[K]>}> {
  return {parse: value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
    const record = value as Record<string, unknown>;
    if (Reflect.ownKeys(record).length !== Object.keys(shape).length || Reflect.ownKeys(record).some(k => typeof k !== 'string' || !Object.hasOwn(shape, k))) return invalid();
    const result: Record<string, unknown> = {};
    for (const [key, decoder] of Object.entries(shape)) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return invalid();
      result[key] = decoder.parse(descriptor.value);
    }
    return Object.freeze(result) as {readonly [K in keyof S]: Value<S[K]>};
  }};
}
export function refined<T>(decoder: Decoder<T>, valid: (value: T) => boolean): Decoder<T> {
  return {parse: value => {const parsed = decoder.parse(value); return valid(parsed) ? parsed : invalid();}};
}
