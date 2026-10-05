import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidateScopeDigest } from './check.mjs';

assert.equal(process.argv.length, 2, 'UI evidence validation accepts no execution or waiver flags');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const definition = JSON.parse(readFileSync(resolve(root, 'g1-local/evals/definition.json'), 'utf8'));
const evidence = JSON.parse(readFileSync(resolve(root, definition.evidencePaths.ui), 'utf8'));
assert.equal(evidence.schemaVersion, 1); assert.equal(evidence.candidateDigest, candidateScopeDigest()); assert.equal(evidence.assurance, 'actual-local-interaction');
assert.ok(typeof evidence.sharedTaskId === 'string' && evidence.sharedTaskId.length > 0);
assert.equal(evidence.clients.length, 3); assert.equal(new Set(evidence.clients.map(c => c.client)).size, 3);
const surfaces = { web: 'browser', desktop: 'electron', mobile: 'android-emulator' };
const executors = { web: 'browser-automation', desktop: 'native-desktop-automation', mobile: 'android-emulator-automation' };
for (const name of definition.uiEvidence.requiredClients) {
  const client = evidence.clients.find(c => c.client === name); assert.ok(client, 'Missing actual client ' + name);
  assert.equal(client.outcome, 'pass', 'Unavailable or unexecuted UI remains pending'); assert.equal(client.surface, surfaces[name]);
  assert.equal(client.executor.kind, executors[name]); assert.ok(client.executor.id?.trim());
  assert.equal(client.candidateDigest, evidence.candidateDigest); assert.ok(Object.keys(client.environment).length > 0);
  assert.equal(client.launch.outcome, 'pass'); assert.ok(client.launch.command?.trim());
  if (name === 'mobile') { assert.equal(client.installation.outcome, 'pass'); assert.ok(client.installation.command?.trim()); }
  assert.ok(Number.isFinite(Date.parse(client.startedAt)) && Date.parse(client.finishedAt) >= Date.parse(client.startedAt));
  for (const id of definition.uiEvidence.requiredFlow) {
    const steps = client.steps.filter(s => s.id === id); assert.equal(steps.length, 1, 'One actual observation for ' + name + '/' + id);
    const step = steps[0]; assert.equal(step.outcome, 'pass'); assert.ok(step.expected?.trim() && step.observed?.trim());
    if (!['login', 'space-selection'].includes(id)) { assert.ok(step.taskId?.trim()); assert.ok(Number.isSafeInteger(step.revision) && step.revision >= 0); }
    if (id === 'result') assert.equal(step.taskId, evidence.sharedTaskId, 'Read the same committed server Task result across clients');
  }
  assert.ok(client.artifacts.length > 0);
  for (const artifact of client.artifacts) { assert.ok(['log', 'screenshot'].includes(artifact.kind)); assert.match(artifact.sha256, /^[a-f0-9]{64}$/); const file = resolve(root, artifact.path); assert.ok(statSync(file).isFile() && statSync(file).size > 0); assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), artifact.sha256); }
}
console.log('UI evidence: current source, actual three-client twelve-flow records and retained artifact bytes verified. This validator does not execute or self-attest a UI journey.');
