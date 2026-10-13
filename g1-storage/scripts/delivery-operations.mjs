import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from './paths.mjs';
import { suites } from './manifest.mjs';

// D02/D06 remain mandatory in the complete delivery-audit registry. Their
// controller evidence and independent verdict assertions belong to the successor.
const cases = ['D01', 'D03', 'D04', 'D05'];
const variants = Object.fromEntries(cases.map(id => [id, suites['delivery-audit'].variants[id]]));
const required = JSON.parse(readFileSync(resolve(cwd, 'verification/required-variants-v1.json'), 'utf8'));
for (const id of cases) assert.deepEqual(variants[id], required.cases[id]);
assert.equal(Object.values(variants).flat().length, 24);
assert.deepEqual(suites['delivery-audit'].cases, ['D01', 'D02', 'D03', 'D04', 'D05', 'D06']);
export const deliveryOperationsComponent = Object.freeze({
 file: 'components/delivery-operations.test.js', cases, integration: true,
 positives: ['save', 'ask', 'forget', 'restore'], variants,
});
