import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTap } from './process-result.mjs';

// The same bounded seam is used by the shipped runner and nonrecursive sabotage.
export function validateSuiteFiles(selected, source, emitted) {
 for (const [id, suite] of selected) for (const file of [resolve(emitted, suite.file), resolve(source, suite.file.replace(/\.js$/, '.ts'))]) {
  try { if (!lstatSync(file).isFile()) throw new Error('Mandatory suite is not a regular file: ' + id); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('Mandatory suite missing: ' + id); throw error; }
 }
}
export function executeSuite(file, cases, options = {}) {
 const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', file], {
  encoding: 'utf8', timeout: 240_000, maxBuffer: 32 * 1024 * 1024, ...options
 });
 try { return { result, report: parseTap(result, cases) }; }
 catch (error) { Object.defineProperty(error, 'result', { value: result }); throw error; }
}
