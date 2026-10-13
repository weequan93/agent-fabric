import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as schemas from '../../src/schema.js';
import { list, text } from '../../src/decoder.js';
import { encodedBytes, units, safeAdd, safeMultiply, safeSubtract, reserveEstimate, measuredCost } from '../../src/arithmetic.js';
import { ModelError, safeFailure } from '../../src/errors.js';
import * as native from '../../src/native-imports.js';
import * as originalNative from '../../../engine/kernel/src/session-loop.js';
import { FoundationError } from '../../../g1-foundations/src/contracts.js';
import { IdentityError } from '../../../g1-identity/src/contracts.js';
import { lockSpaceBarrier, assertRunUnfenced } from '../../../g1-recovery/src/fence-guard.js';
import { profileFixture, qualificationFixture, receiptFixture, sha } from '../helpers/contract-fixtures.js';
import type { Decoder } from '../../src/decoder.js';

test('CONTRACTS/profile-receipt', () => {
 const profile = profileFixture(), receipt = receiptFixture();
 assert.deepEqual(schemas.OperatingProfileSchema.parse(JSON.parse(JSON.stringify(profile))), profile);
 assert.deepEqual(schemas.UsageReceiptSchema.parse(JSON.parse(JSON.stringify(receipt))), receipt);
 assert.equal(profile.profileDigest, schemas.profileDigestOf(profile));
 assert.equal(receipt.measuredUnits, 12);
 assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.capabilities) && Object.isFrozen(profile.capabilities.inputModalities));
 assert.ok(Object.isFrozen(receipt) && Object.isFrozen(receipt.original) && Object.isFrozen(receipt.components));
 const qualified = schemas.QualifiedProfileSchema.parse({ profile, qualification: qualificationFixture(profile) });
 assert.equal(qualified.profile.profileDigest, qualified.qualification.profileDigest);
 for (const key of ['profileDigest', 'capabilitiesDigest', 'environmentDigest', 'dependencyLockDigest', 'checkDefinitionDigest']) {
  const changed = { ...qualificationFixture(profile), [key]: sha(99) };
  // Lock/check binding is verified by the installed registry; profile relationships are structural here.
  if (!['dependencyLockDigest', 'checkDefinitionDigest'].includes(key)) assert.throws(() => schemas.QualifiedProfileSchema.parse({ profile, qualification: changed }), ModelError);
  else assert.notEqual(schemas.LocalQualificationSchema.parse(changed)[key as 'dependencyLockDigest' | 'checkDefinitionDigest'], qualificationFixture(profile)[key as 'dependencyLockDigest' | 'checkDefinitionDigest']);
 }
 assert.throws(() => schemas.UsageReceiptSchema.parse({ ...receipt, measuredUnits: 13 }), ModelError);
 assert.throws(() => schemas.UsageReceiptSchema.parse({ ...receipt, outputDigest: null }), ModelError);
 assert.throws(() => schemas.UsageReceiptSchema.parse({ ...receipt, outcome: 'cancelled' }), ModelError);
});

test('CONTRACTS/closed-negative', async t => {
 const records: readonly [string, Decoder<unknown>, object][] = [
  ['profile', schemas.OperatingProfileSchema, profileFixture()], ['receipt', schemas.UsageReceiptSchema, receiptFixture()],
  ['capability', schemas.CapabilitiesSchema, profileFixture().capabilities], ['qualification', schemas.LocalQualificationSchema, qualificationFixture()]
 ];
 for (const [name, decoder, data] of records) {
  await t.test(name, () => {
   for (const key of Object.keys(data)) {
    const missing = { ...data } as Record<string, unknown>; delete missing[key];
    assert.throws(() => decoder.parse(missing), ModelError, name + '/' + key);
    let reads = 0;
    const accessor = { ...data }; Object.defineProperty(accessor, key, { enumerable: true, get() { reads++; throw new Error('executed'); } });
    assert.throws(() => decoder.parse(accessor), ModelError); assert.equal(reads, 0);
   }
   assert.throws(() => decoder.parse({ ...data, unapproved: true }), ModelError);
   assert.throws(() => decoder.parse({ ...data, schemaVersion: 2 }), (e: unknown) => e instanceof ModelError && e.code === 'UNSUPPORTED_VERSION');
   for (const invalid of [null, [], undefined, new Date(), Object.create(data), { ...data, [Symbol('hidden')]: true }]) assert.throws(() => decoder.parse(invalid), ModelError);
   const proto = { ...data }; Object.defineProperty(proto, '__proto__', { value: {}, enumerable: true });
   assert.throws(() => decoder.parse(proto), ModelError);
  });
 }
 let reads = 0;
 const array = ['text']; Object.defineProperty(array, '0', { get() { reads++; return 'text'; }, enumerable: true });
 assert.throws(() => list(text).parse(array), ModelError); assert.equal(reads, 0);
 assert.throws(() => list(text).parse(new Array(1)), ModelError);
 assert.throws(() => list(text).parse(['x', undefined]), ModelError);
 assert.throws(() => list(text, 1).parse(['x', 'y']), ModelError);
 const profile = profileFixture();
 const nested = { ...profile, capabilities: { ...profile.capabilities } };
 Object.defineProperty(nested.capabilities, 'contextLimit', { get() { reads++; return 4096; }, enumerable: true });
 assert.throws(() => schemas.OperatingProfileSchema.parse(nested), ModelError); assert.equal(reads, 0);
 assert.throws(() => schemas.OperatingProfileSchema.parse({ ...profile, region: 'changed-region' }), ModelError);
 assert.throws(() => schemas.OwnerObservationSchema.parse({ status: 'unknown', original: receiptFixture().original, receipt: receiptFixture() }), ModelError);
});

test('CONTRACTS/arithmetic', () => {
 for (const value of [0, 1, Number.MAX_SAFE_INTEGER]) assert.equal(units(value), value);
 for (const value of [-0, -1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined, 1n]) assert.throws(() => units(value), ModelError);
 assert.equal(safeAdd(Number.MAX_SAFE_INTEGER, 0), Number.MAX_SAFE_INTEGER);
 assert.equal(safeAdd(), 0); assert.equal(safeMultiply(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
 assert.equal(safeMultiply(Number.MAX_SAFE_INTEGER, 0), 0);
 assert.throws(() => safeAdd(Number.MAX_SAFE_INTEGER, 1), ModelError);
 assert.throws(() => safeMultiply(Number.MAX_SAFE_INTEGER, 2), ModelError);
 assert.throws(() => safeSubtract(0, 1), ModelError);
 assert.equal(encodedBytes(''), 0); assert.equal(encodedBytes('中🙂'), 7);
 assert.equal(reserveEstimate('12345678', 30), 40);
 assert.deepEqual(measuredCost('中', '🙂'), { service: 2, model: 7, total: 9 });
 assert.throws(() => reserveEstimate('x', 0), ModelError);
 assert.throws(() => encodedBytes('\ud800'), ModelError);
 assert.throws(() => encodedBytes('x'.repeat(1_048_577)), ModelError);
});

test('CONTRACTS/native-identity', () => {
 assert.equal(native.SessionLoop, originalNative.SessionLoop);
 assert.equal(native.reduceSession, originalNative.reduceSession);
 assert.equal(native.initialSession, originalNative.initialSession);
 assert.equal(native.replaySession, originalNative.replaySession);
 assert.equal(native.FoundationError, FoundationError); assert.equal(native.IdentityError, IdentityError);
 assert.equal(native.lockSpaceBarrier, lockSpaceBarrier); assert.equal(native.assertRunUnfenced, assertRunUnfenced);
 const unknown = safeFailure(new FoundationError('UNKNOWN_COMMIT'));
 assert.equal(unknown.status, 'unknown'); assert.equal(unknown.replayAllowed, false);
 assert.equal(safeFailure({ code: 'UNKNOWN_COMMIT', message: 'synthetic-secret' }).status, 'refused');
 assert.equal(safeFailure(new Error('synthetic-secret')).error, 'UNAUTHORIZED');
 assert.ok(!JSON.stringify(unknown).includes('synthetic-secret'));
});

test('CONTRACTS/harness', async () => {
 const { suites, components } = await import(pathToFileURL(resolve(process.cwd(), 'g1-model/scripts/manifest.mjs')).href);
 const { parseTap } = await import(pathToFileURL(resolve(process.cwd(), 'g1-model/scripts/process-result.mjs')).href);
 assert.equal(Object.keys(suites).length, 8);
 assert.equal((Object.values(suites) as { cases: readonly string[] }[]).reduce((n, s) => n + s.cases.length, 0), 65);
 assert.deepEqual(Object.keys(components), ['contracts', 'adapter', 'profile', 'ledger', 'usage', 'native', 'resource']);
 const good = 'TAP version 13\n# Subtest: C01 / actual test\nok 1 - C01 / actual test\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
 const result = { status: 0, signal: null, stdout: good, stderr: '' };
 assert.equal(parseTap(result, ['C01']).tests, 1);
 for (const stdout of [
  '', '# C01\n# tests 1', good.replace('ok 1', 'not ok 1'), good.replace('# fail 0', '# fail 1'),
  good.replace('1..1', '1..2'), good.replace('# tests 1', '# tests 2'),
  good.replace('# skipped 0', '# skipped 1'), good.replace('# todo 0', '# todo 1'),
  good.replace('# cancelled 0', '# cancelled 1'), good + '# tests 1\n',
  good.replace('C01 / actual test', 'P01 / fake') .replace('C01 / actual test', 'P01 / fake'),
  good.replace('ok 1 - C01 / actual test', 'ok 1 - C01 / actual test # SKIP'),
  good.replace('# Subtest: C01 / actual test\n', ''),
  good.replace('# Subtest: C01 / actual test', '# Subtest: C01 / mismatched'),
  good + 'ok 2 - C02\n', good + 'unparsed output\n'
 ]) assert.throws(() => parseTap({ ...result, stdout }, ['C01']));
 for (const badExit of [{ status: 1 }, { signal: 'SIGKILL' }, { error: new Error('spawn failed') }]) assert.throws(() => parseTap({ ...result, ...badExit }, ['C01']));
 assert.throws(() => parseTap(result, ['C01', 'C02']));
});
