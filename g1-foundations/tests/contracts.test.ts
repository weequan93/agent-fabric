import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUuid, assertVerifiedScope, createScopeVerifier, revalidateScope, type CurrentAuthority, type ScopeRequest, type VerifiedScope } from '../src/contracts.js';
import { SYNTHETIC_PROFILE, validateFoundationProfile } from '../src/profile.js';
const tenantId = '10000000-0000-0000-0000-000000000001', spaceId = '20000000-0000-0000-0000-000000000001';
const actorId = '30000000-0000-0000-0000-000000000001', payerId = '30000000-0000-0000-0000-000000000002';
function authority(): CurrentAuthority { return { tenantId, spaceId, actorId, payerId, authorityRevision: 1, membershipRevision: 1, grants: ['task:create'], actorRevoked: false, payerRevoked: false, membershipRevoked: false, lifecycle: 'active' }; }
const request: ScopeRequest = { tenantId, spaceId, sessionCredential: 'synthetic-session' };
test('server-derived scope is immutable; caller and copied authority are rejected', async () => {
  const verifier = createScopeVerifier(async input => input.sessionCredential === request.sessionCredential ? authority() : null);
  const scope = await verifier.verify(request); assertVerifiedScope(scope); assert.equal(scope.payerId, payerId); assert.ok(Object.isFrozen(scope)); assert.ok(Object.isFrozen(scope.grants));
  assert.throws(() => assertVerifiedScope({ ...scope }), { code: 'UNVERIFIED_SCOPE' });
  assert.throws(() => assertVerifiedScope(JSON.parse(JSON.stringify(scope))), { code: 'UNVERIFIED_SCOPE' });
  await assert.rejects(verifier.verify({ ...request, actorId } as ScopeRequest), { code: 'INVALID_INPUT' });
  await assert.rejects(verifier.verify({ ...request, sessionCredential: 'invalid' }), { code: 'UNAUTHORIZED' });
});
test('authority lookup catches revocation, revision, payer and grant changes', async () => {
  let current = authority(); const scope = await createScopeVerifier(async () => current).verify(request);
  await revalidateScope(scope);
  for (const patch of [{ actorRevoked: true }, { payerRevoked: true }, { membershipRevoked: true }, { lifecycle: 'deleted' as const }]) {
    current = { ...authority(), ...patch }; await assert.rejects(revalidateScope(scope), { code: 'UNAUTHORIZED' });
  }
  for (const patch of [{ authorityRevision: 2 }, { membershipRevision: 2 }, { payerId: actorId }, { grants: [] }]) {
    current = { ...authority(), ...patch }; await assert.rejects(revalidateScope(scope), { code: 'STALE_AUTHORITY' });
  }
  await assert.rejects(revalidateScope({ ...scope } as VerifiedScope), { code: 'UNVERIFIED_SCOPE' });
});
test('UUID boundaries and scope mismatch fail closed', async () => {
  assert.throws(() => assertUuid('space-name'), { code: 'INVALID_INPUT' });
  await assert.rejects(createScopeVerifier(async () => ({ ...authority(), spaceId: tenantId })).verify(request), { code: 'UNAUTHORIZED' });
  await assert.rejects(createScopeVerifier(async () => ({ ...authority(), authorityRevision: -1 })).verify(request), { code: 'INVALID_INPUT' });
});
test('profile permits synthetic preparation only and cannot widen through config', () => {
  assert.equal(validateFoundationProfile(), SYNTHETIC_PROFILE);
  assert.equal(validateFoundationProfile({ paidCallsAllowed: false }), SYNTHETIC_PROFILE);
  for (const value of [{ paidCallsAllowed: true }, { newPaidResourcesAllowed: true }, { remoteExecutionAllowed: true }, { modelMode: 'paid-provider' }, { provider: 'anything' }, { productionQualified: true }, null, []]) assert.throws(() => validateFoundationProfile(value), { code: 'PROFILE_NOT_ALLOWED' });
  let called = false; const accessor = Object.defineProperty({}, 'paidCallsAllowed', { get() { called = true; return false; } });
  assert.throws(() => validateFoundationProfile(accessor), { code: 'PROFILE_NOT_ALLOWED' }); assert.equal(called, false);
});
