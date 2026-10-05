import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'node_modules/.cache/agent-fabric-build');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit', timeout: 60000 });
if (result.error || result.status !== 0) { console.error(result.error ?? 'TypeScript build failed'); process.exit(1); }
writeFileSync(resolve(output, 'package.json'), JSON.stringify({ type: 'module' }));
console.log('Built strict NodeNext modules in node_modules/.cache/agent-fabric-build');

