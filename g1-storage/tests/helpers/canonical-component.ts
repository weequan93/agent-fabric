import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QualificationObservationSchema } from '../../src/schema.js';
import { emitObservations, type SuiteObservations } from './observations.js';
import { registerAtomicSaveTests } from './register-atomic-save-tests.js';
import { registerKnowledgeStatusTests } from './register-knowledge-status-tests.js';
import { registerKnowledgeCorrectionTests } from './register-knowledge-correction-tests.js';
import { registerCommandRecoveryTests } from './register-command-recovery-tests.js';

export type ComponentTest = (name: string, body: (context: TestContext) => Promise<void>) => Promise<void>;

/** Thin composition only: every predecessor assertion runs with its original
 * fresh owned database. Migration-up fixtures must not inherit another suite's
 * later migrations (in particular the required legacy v14 correction fixture).
 * The original diagnostic wrappers retain their names and observation records.
 * Counters below sum actual predecessor observations; no product effect is inferred
 * from a case label or from the existence of a source-content record. */
export function registerCanonicalComponent(suite: 'knowledge' | 'commands') {
 return test(suite.toUpperCase()+'/behavior / complete canonical predecessor composition', async t => {
  const records: SuiteObservations[] = [];
  const observe = (value: SuiteObservations) => { records.push(QualificationObservationSchema.parse(value)); };
  const nested: ComponentTest = (name, body) => t.test(name, body);
  const repoRoot = process.env['STORAGE_REPO_ROOT'];
  assert.ok(repoRoot);
  const fixture = await import(pathToFileURL(resolve(repoRoot,'g1-storage/scripts/fixture.mjs')).href);
  assert.equal(typeof fixture.withStorageFixture,'function');
  for (const register of [registerAtomicSaveTests, registerKnowledgeStatusTests, registerKnowledgeCorrectionTests, registerCommandRecoveryTests]) {
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
  assert.deepEqual(records.map(record => record.suite), ['atomic-save','knowledge-status','knowledge-correction','command-recovery']);
  const first = records[0]!;
  const positives = {...first.positives}, violations = {...first.violations};
  for (const record of records.slice(1)) {
   for (const name of Object.keys(positives) as (keyof SuiteObservations['positives'])[]) positives[name] += record.positives[name];
   for (const name of Object.keys(violations) as (keyof SuiteObservations['violations'])[]) violations[name] += record.violations[name];
  }
  emitObservations({...first, suite, positives, violations});
 });
}
