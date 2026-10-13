import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cwd, root, emittedTests } from './paths.mjs';
import { assertBaseline } from './guards.mjs';
import { run } from './process-result.mjs';
import { validateSuiteFiles, executeSuite } from './suite-execution.mjs';
import { candidateSnapshot } from './qualification-artifacts.mjs';
import { suites, components } from './manifest.mjs';

export async function check(mode, args) {
 const registry = mode === 'component' ? components : suites;
 if (!['aggregate', 'slice', 'component'].includes(mode)) throw new Error('Unknown checker mode');
 if (mode === 'aggregate' ? args.length !== 0 : args.length !== 1 || !Object.hasOwn(registry, args[0])) throw new Error('Unknown/extra checker argument');
 const selected = mode === 'aggregate' ? Object.entries(suites) : [[args[0], registry[args[0]]]];
 assertBaseline();
 const candidate = candidateSnapshot();
 console.log(JSON.stringify({ measurement: 'model-candidate', ...candidate }));
 try {
  run(process.execPath, [resolve(cwd, 'scripts/build.mjs')]);
  // Validate the ENTIRE selected manifest before any product suite starts.
  validateSuiteFiles(selected, resolve(cwd, 'tests'), emittedTests);
  const reports = [];
  for (const [id, suite] of selected) {
   const execute = env => {
    // Always expose complete raw bytes, also on failure.
    let result;
    try {
     const output = executeSuite(resolve(emittedTests, suite.file), suite.cases, { cwd: root, env: { ...process.env, ...env } });
     result = output.result; process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
     reports.push({ suite: id, ...output.report });
    } catch (error) {
     if (error.result) { process.stdout.write(error.result.stdout ?? ''); process.stderr.write(error.result.stderr ?? ''); }
     throw error;
    }
   };
   if (suite.integration) {
    // f04-02 owns this fixture hook. Missing hook/environment fails, never skips.
    // The callback receives only fresh owned synthetic fixture environment.
    const fixture = await import(pathToFileURL(resolve(cwd, 'scripts/fixture.mjs')).href);
    if (typeof fixture.withModelFixture !== 'function') throw new Error('Mandatory owned PG/IdP/adapter fixture missing');
    let callbacks = 0;
    await fixture.withModelFixture(async fixtureState => {
     if (++callbacks !== 1) throw new Error('Fixture callback must execute exactly once');
     if (!fixtureState || fixtureState.assurance !== 'deterministic-local-only' || !fixtureState.env || fixtureState.paidCallsAllowed !== false) throw new Error('Invalid deterministic fixture contract');
     execute(fixtureState.env);
    });
    if (callbacks !== 1) throw new Error('Fixture omitted mandatory suite execution');
   } else execute({});
  }
  if (reports.length !== selected.length) throw new Error('Mandatory suite execution report missing');
  console.log(JSON.stringify({ measurement: 'model-test-report', scope: mode, diagnosticOnly: mode !== 'aggregate', qualification: 'deterministic-local-only', externalQualification: 'pending', reports }));
 } finally {
  if (candidateSnapshot().digest !== candidate.digest) throw new Error('Candidate changed during check');
  assertBaseline();
 }
}
