import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd, root } from './paths.mjs';
const baseline = JSON.parse(readFileSync(resolve(cwd, 'verification/preserved-inputs.json'), 'utf8'));
export function assertBaseline() {
 if (baseline.schemaVersion !== 1 || baseline.algorithm !== 'sha256' || Object.keys(baseline.files).length < 700) throw new Error('Missing closed accepted-input baseline');
 for (const [path, expected] of Object.entries(baseline.files)) {
  if (path.startsWith('/') || path.split('/').includes('..') || path.startsWith('.loop/') || path.startsWith('g1-model/')) throw new Error('Invalid preservation path');
  const file = resolve(root, path);
  if (!lstatSync(file).isFile() || createHash('sha256').update(readFileSync(file)).digest('hex') !== expected) throw new Error('Preserved input changed: ' + path);
 }
 console.log(JSON.stringify({ measurement: 'preserved-inputs', files: Object.keys(baseline.files).length, categories: baseline.categories, unchanged: true }));
 return Object.keys(baseline.files).length;
}
