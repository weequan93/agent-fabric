import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const originalOracleDigest = '1b322da5ef56f4c57700d5e71ae06368eea8110312ecff674db3429dc827d41e';
const branches = ['allowed', 'denied', 'recovery'] as const;
type Branch = typeof branches[number];
interface BranchDefinition {
  name: string; mustExecute: boolean; zeroCounters: Record<string, number>;
  expected: { observation: string; prohibitedCounters: Record<string, number> };
}
type Oracle = {
  id: string; requirements: string[]; packages: string[]; laterGatePending: string[];
} & Record<Branch, BranchDefinition>;
interface Definition {
  schemaVersion: number; branches: string[]; mandatoryBranchCount: number;
  executionPolicy: { allBranchesRequired: boolean; skipAllowed: boolean; missingBranchIsFailure: boolean; expectationsFromImplementationAllowed: boolean };
  thresholds: Record<string, number>; oracles: Oracle[];
}
interface Suite {
  schemaVersion: number; oracleDigest: string; lockDigest: string;
  environment: { node: string; pnpm: string; typescript: string; scope: string };
  oracles: { id: string; branches: string[]; requirements: string[]; packages: string[]; expectedSource: string }[];
}
const bytes = (path: string) => readFileSync(resolve(process.cwd(), path));
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const definitionBytes = bytes('evals/fixtures/g0-oracle-definition.json');
const definition = JSON.parse(definitionBytes.toString('utf8')) as Definition;
const suite = JSON.parse(bytes('evals/fixtures/g0-contract-suite.json').toString('utf8')) as Suite;
const expectedIds = Array.from({ length: 34 }, (_, i) => 'G0-O' + String(i + 1).padStart(2, '0'));
const expectedThresholds = {
  crossSpaceDisclosure: 0, unauthorizedDispatch: 0, duplicateEffect: 0, oldGenerationWrites: 0,
  replayModelCalls: 0, replayWriteCalls: 0, duplicateSettlements: 0, unexpectedAllowedWorkRejections: 0,
};

test('frozen G0 oracle retains its original digest and zero thresholds', () => {
  assert.equal(digest(definitionBytes), originalOracleDigest);
  assert.equal(definition.schemaVersion, 1);
  assert.deepEqual(definition.branches, branches);
  assert.equal(definition.mandatoryBranchCount, 102);
  assert.deepEqual(definition.thresholds, expectedThresholds);
  assert.equal(definition.executionPolicy.allBranchesRequired, true);
  assert.equal(definition.executionPolicy.skipAllowed, false);
  assert.equal(definition.executionPolicy.missingBranchIsFailure, true);
  assert.equal(definition.executionPolicy.expectationsFromImplementationAllowed, false);
});

test('G0 contract suite maps all 34 frozen oracles to 102 unique required branches', () => {
  assert.equal(suite.schemaVersion, 1);
  assert.equal(suite.oracleDigest, originalOracleDigest);
  assert.deepEqual(definition.oracles.map(o => o.id), expectedIds);
  assert.deepEqual(suite.oracles.map(o => o.id), expectedIds);
  const actualNames: string[] = [];
  for (const [index, oracle] of definition.oracles.entries()) {
    const entry = suite.oracles[index];
    assert.ok(entry);
    assert.deepEqual(entry.branches, branches.map(branch => oracle.id + '/' + branch));
    assert.deepEqual(entry.requirements, oracle.requirements);
    assert.deepEqual(entry.packages, oracle.packages);
    assert.equal(entry.expectedSource, 'g0-oracle-definition.json');
    assert.ok(oracle.requirements.length > 0);
    assert.ok(oracle.packages.length > 0);
    assert.ok(oracle.laterGatePending.length > 0, 'Local evidence must retain later qualification gates');
    for (const branch of branches) {
      const frozen = oracle[branch];
      assert.equal(frozen.name, oracle.id + '/' + branch);
      assert.equal(frozen.mustExecute, true);
      assert.ok(frozen.expected.observation.length > 0);
      assert.deepEqual(frozen.zeroCounters, expectedThresholds);
      assert.deepEqual(frozen.expected.prohibitedCounters, expectedThresholds);
      actualNames.push(frozen.name);
    }
  }
  assert.equal(actualNames.length, 102);
  assert.equal(new Set(actualNames).size, 102);
  assert.deepEqual(actualNames, suite.oracles.flatMap(o => o.branches));
});

test('G0 suite binds the actual dependency lock and deterministic local environment', () => {
  const pkg = JSON.parse(bytes('package.json').toString('utf8')) as { packageManager: string; devDependencies: { typescript: string } };
  assert.equal(suite.lockDigest, digest(bytes('pnpm-lock.yaml')));
  assert.equal(suite.environment.node, '22.22.3');
  assert.equal(suite.environment.pnpm, '10.18.0');
  assert.equal(suite.environment.typescript, '5.9.3');
  assert.equal(suite.environment.scope, 'deterministic-local');
  assert.equal(pkg.packageManager, 'pnpm@' + suite.environment.pnpm);
  assert.equal(pkg.devDependencies.typescript, suite.environment.typescript);
  assert.equal(process.versions.node, suite.environment.node);
});
