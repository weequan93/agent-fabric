import { FoundationError } from './contracts.js';
export const SYNTHETIC_PROFILE = Object.freeze({ schemaVersion: 1 as const, profileId: 'g1-foundations-synthetic-test' as const, modelMode: 'deterministic-test' as const, effectMode: 'synthetic-only' as const, paidCallsAllowed: false as const, newPaidResourcesAllowed: false as const, remoteExecutionAllowed: false as const, productionQualified: false as const });
export type FoundationProfile = typeof SYNTHETIC_PROFILE;
/** No environment variable, provider route or fallback can widen this profile. */
export function validateFoundationProfile(value: unknown = {}): FoundationProfile {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new FoundationError('PROFILE_NOT_ALLOWED');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.hasOwn(SYNTHETIC_PROFILE, key)) throw new FoundationError('PROFILE_NOT_ALLOWED');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor) || descriptor.value !== SYNTHETIC_PROFILE[key as keyof FoundationProfile]) throw new FoundationError('PROFILE_NOT_ALLOWED');
  }
  return SYNTHETIC_PROFILE;
}
