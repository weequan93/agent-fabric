import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const cwd = fileURLToPath(new URL('../', import.meta.url));
export const root = resolve(cwd, '..');
export const cache = resolve(cwd, 'node_modules/.cache/storage-build');
export const emittedTests = resolve(cache, 'g1-storage/tests');
export const postgresImage = 'postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333';
