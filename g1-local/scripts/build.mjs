import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Independent output contains compiled read-only G0 imports and local source/tests.
// node_modules is excluded from Loop candidates. No original build/lock is changed.
const localRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(localRoot, 'node_modules/.cache/g1-build');
// Discard only this fixed derived directory so removed tests cannot leave stale evidence.
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const result = spawnSync(process.execPath, [resolve(localRoot, 'node_modules/typescript/bin/tsc'), '-p', resolve(localRoot, 'tsconfig.json')], {
  cwd: localRoot, stdio: 'inherit', timeout: 60000,
});
if (result.error || result.status !== 0) {
  console.error(result.error?.message ?? 'G1-local TypeScript build failed');
  process.exit(1);
}
writeFileSync(resolve(output, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
console.log(`G1-local build: ${output}`);
