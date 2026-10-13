import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QualificationObservationSchema } from '../../src/schema.js';
import { emitObservations, type SuiteObservations } from './observations.js';
import { packageRoot } from './harness-copy.js';
import { harnessRegistration, harnessBuildSchedules, harnessResultNegativeSchedules } from './register-harness-build-tests.js';
import { cleanupRegistration, harnessCleanupSchedules, harnessObservationSchedules, missingFixtureNeverSkipped } from './register-harness-cleanup-tests.js';

/** Original component composition only. Every predecessor assertion executes;
 * the observation is the actual H04 authorized control, never an invented count.
 * Frozen full H02/good-full-run remains the terminal full-suite owner's job. */
export function registerHarnessComponent() {
 return test('HARNESS/behavior / complete hostile harness predecessor composition', async t => {
  const { components } = await import(pathToFileURL(resolve(packageRoot,'scripts/manifest.mjs')).href);
  const names: string[] = [], records: SuiteObservations[] = [];
  const nested = { test(name: string, body: (t: TestContext) => void | Promise<void>) {
   names.push(name); return t.test(name, body);
  }} as TestContext;
  const originalLog = console.log;
  // Preserve complete child receipts while adapting the existing real control
  // observation to the original component's required observation identity.
  console.log = (...args: unknown[]) => {
   originalLog(...args);
   if (args.length !== 1 || typeof args[0] !== 'string' || !args[0].startsWith('{')) return;
   const record = JSON.parse(args[0]);
   if (record.measurement !== 'harness-child-result' || record.label !== 'exact-executed-identities') return;
   assert.equal(record.status,0); assert.equal(record.signal,null); assert.equal(record.error,null);
   const stdout = Buffer.from(record.stdoutBase64,'base64').toString('utf8');
   const gate = stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
    .filter(value => value.measurement === 'harness-observation-gate-pass');
   assert.equal(gate.length,1); records.push(QualificationObservationSchema.parse(gate[0].observation));
  };
  try {
   await nested.test('HARNESS-BUILD/registration-preservation',harnessRegistration);
   await harnessBuildSchedules(nested,'HARNESS-BUILD');
   await harnessResultNegativeSchedules(nested,'HARNESS-BUILD');
   await nested.test('HARNESS-CLEANUP/registration-preservation',cleanupRegistration);
   await harnessCleanupSchedules(nested,'HARNESS-CLEANUP');
   await harnessObservationSchedules(nested,'HARNESS-CLEANUP');
   await missingFixtureNeverSkipped(nested);
  } finally { console.log = originalLog; }
  assert.deepEqual(names,[...components['harness-build'].variants['HARNESS-BUILD/behavior'],
   ...components['harness-cleanup'].variants['HARNESS-CLEANUP/behavior']]);
  assert.equal(records.length,1); assert.equal(records[0]!.suite,'harness');
  emitObservations(records[0]!);
 });
}
