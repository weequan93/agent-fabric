import {spawnSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {assertBaseline} from './baseline.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const r = spawnSync(command, args, {cwd, stdio: 'inherit', timeout: 60000});
  if (r.error || r.status !== 0) throw r.error ?? new Error(command + ' failed: ' + r.status);
}
if (process.argv.length !== 2) throw new Error('Build takes no arguments');
if (process.version !== 'v22.22.3') throw new Error('Pinned Node22.22.3 required');
assertBaseline();
run('pnpm', ['install', '--ignore-workspace', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', '/private/tmp/agent-fabric-pnpm-store']);
// Remove only this package's reproducible output so removed sources cannot leave passing suites.
rmSync(new URL('../node_modules/.cache/recovery-build', import.meta.url), {recursive: true, force: true});
run(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.json']);
assertBaseline();
