import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cwd} from './paths.mjs';
import {suites} from './manifest.mjs';
const cases=['R05','R06'];
const variants=Object.fromEntries(cases.map(id=>[id,suites['backup-restore'].variants[id]]));
const required=JSON.parse(readFileSync(resolve(cwd,'verification/required-variants-v1.json'),'utf8'));
for(const id of cases)assert.deepEqual(variants[id],required.cases[id]);
assert.equal(Object.values(variants).flat().length,28);
export const verifyRestoreIntegrityComponent=Object.freeze({file:'components/verify-restore-integrity.component.test.js',cases,integration:true,
 positives:['restore','read','deny'],variants});
