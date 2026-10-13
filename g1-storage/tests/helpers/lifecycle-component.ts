import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QualificationObservationSchema } from '../../src/schema.js';
import { emitObservations, type SuiteObservations } from './observations.js';
import type { ComponentTest } from './canonical-component.js';
import { registerRetentionTests } from './retention-component.js';
import { registerDependencyGraphTests } from './dependency-graph-component.js';
import { registerMaintenanceAdmissionTests } from './maintenance-admission-component.js';
import { registerPropagationRetryTests } from './propagation-retry-component.js';

/** Original terminal components run every predecessor assertion unchanged.
 * Each migration-up registration needs a fresh owned database at its original
 * version. Only actual successful observations are summed; no new schedule or
 * product behavior is introduced by this composition. */
export function registerLifecycleComponent(suite: 'lifecycle' | 'maintenance') {
 return test(suite.toUpperCase()+'/behavior / complete durable lifecycle predecessor composition', async t => {
  const records: SuiteObservations[] = [];
  const observe = (value: SuiteObservations) => { records.push(QualificationObservationSchema.parse(value)); };
  const nested: ComponentTest = (name, body) => t.test(name, body);
  const repoRoot = process.env['STORAGE_REPO_ROOT'];
  assert.ok(repoRoot);
  const fixture = await import(pathToFileURL(resolve(repoRoot,'g1-storage/scripts/fixture.mjs')).href);
  assert.equal(typeof fixture.withStorageFixture,'function');
  for (const register of [registerRetentionTests, registerDependencyGraphTests, registerMaintenanceAdmissionTests, registerPropagationRetryTests]) {
   let callbacks = 0;
   await fixture.withStorageFixture(async (state: {assurance: string; paidCallsAllowed: boolean; env: Record<string,string>}) => {
    assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
    const previous = new Map(Object.keys(state.env).map(name => [name,process.env[name]]));
    try {
     for (const [name,value] of Object.entries(state.env)) process.env[name] = value;
     await register(nested,observe);
    } finally {
     for (const [name,value] of previous) { if(value===undefined) delete process.env[name]; else process.env[name] = value; }
    }
   });
   assert.equal(callbacks,1);
  }
  assert.deepEqual(records.map(record => record.suite), ['retention-forget','dependency-graph','maintenance-admission','propagation-retry']);
  const first = records[0]!;
  const positives = {...first.positives}, violations = {...first.violations};
  for (const record of records.slice(1)) {
   for (const name of Object.keys(positives) as (keyof SuiteObservations['positives'])[]) positives[name] += record.positives[name];
   for (const name of Object.keys(violations) as (keyof SuiteObservations['violations'])[]) violations[name] += record.violations[name];
  }
  emitObservations({...first, suite, positives, violations});
 });
}
