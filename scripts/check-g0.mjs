import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const stage = process.argv[2];
const oracleDigest = '1b322da5ef56f4c57700d5e71ae06368eea8110312ecff674db3429dc827d41e';
if (createHash('sha256').update(readFileSync(resolve(root, 'evals/fixtures/g0-oracle-definition.json'))).digest('hex') !== oracleDigest) throw new Error('Protected oracle definition changed');
if (!/^G0-(?:0[1-9]|1[0-4])$/.test(stage ?? '')) throw new Error('Explicit package required');
const preserved = {
 'README.md':'ef7723e299de1d76acedd347bf15cfd5b367ae95a8337eb05546cd58acfa5e6d',
 'docs/planning/roadmap.md':'3a5442e8651455c3a142a4b8f224837911c233fa0530d636b19e332a11930470',
 'docs/planning/g0-implementation-plan.md':'9b455b83ef7688ccaae7b204b17bb323f2da8580e684e82b439910f9f3f3ae83',
 'docs/planning/decision-register.md':'5d70240e01d49202f3d588089dec96041dff774c06be358ceaf7686d4e5a0b4a',
 'docs/planning/requirements-traceability.csv':'1717dcde86e5701fc742fd5f31e216ac3c51aca8b2bd265ff45cc41100d4bad1'
};
for (const [path, digest] of Object.entries(preserved)) {
 if (createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') !== digest) throw new Error('Accepted planning artifact changed: ' + path);
}
if (process.versions.node.split('.')[0] !== '22') throw new Error('Qualified baseline requires Node 22');
function checked(command, argv) {
 const result = spawnSync(command, argv, { cwd: root, stdio: 'inherit', timeout: 70000, env: { ...process.env, CI: 'true' } });
 if (result.error || result.status !== 0) { console.error(result.error ?? command + ' failed'); process.exit(1); }
}
checked('pnpm', ['install','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store']);
checked('pnpm', ['typecheck']);
checked(process.execPath, ['scripts/test.mjs', stage === 'G0-14' ? 'protected' : 'all']);
console.log(stage + ' current candidate install/type/behavior passed; deployment qualification is separate');
