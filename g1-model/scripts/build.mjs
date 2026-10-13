import { rmSync, readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { cwd, cache } from './paths.mjs';
import { assertBaseline } from './guards.mjs';
import { assertDependencyMetadata } from './dependencies.mjs';
import { run } from './process-result.mjs';

if (process.argv.length !== 2) throw new Error('Build accepts no arguments');
assertBaseline();
try {
 if (process.version !== 'v22.22.3') throw new Error('Pinned Node22.22.3 required');
 if (run('pnpm', ['--version']).stdout.trim() !== '10.18.0') throw new Error('Pinned pnpm10.18.0 required');
 const pins = { pg: '8.16.3', '@types/pg': '8.15.5', '@types/node': '22.18.6', typescript: '5.9.3' };
 const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
 if (pkg.packageManager !== 'pnpm@10.18.0' || pkg.engines.node !== '22.22.3'
  || JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies }) !== JSON.stringify(pins)) throw new Error('Independent dependency pins changed');
 // Only this package's reproducible emission is cleared, before any install/compile.
 // Refuse symlinked cache parents to avoid deleting another owner's data.
 for (const path of ['node_modules', 'node_modules/.cache', 'node_modules/.cache/model-build']) {
  try { if (lstatSync(resolve(cwd, path)).isSymbolicLink()) throw new Error('Symlinked own build cache refused'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
 }
 rmSync(cache, { recursive: true, force: true });
 run('pnpm', ['install', '--ignore-workspace', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', '/private/tmp/agent-fabric-pnpm-store'], { timeout: 30_000, env: { ...process.env, CI: 'true' } });
 for (const [name, expected] of Object.entries(pins)) {
  if (JSON.parse(readFileSync(resolve(cwd, 'node_modules', name, 'package.json'), 'utf8')).version !== expected) throw new Error('Installed version mismatch: ' + name);
 }
 assertDependencyMetadata();
 run(process.execPath, [resolve(cwd, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { timeout: 60_000 });
 console.log(JSON.stringify({ measurement: 'strict-build', sourceAndTests: true, node: process.version, pins, dependencyLockDigest: 'sha256:' + createHash('sha256').update(readFileSync(resolve(cwd, 'pnpm-lock.yaml'))).digest('hex'), cacheCleared: true, install: 'offline/frozen/ignore-scripts' }));
} finally { assertBaseline(); }
