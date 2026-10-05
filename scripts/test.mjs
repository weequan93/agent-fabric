import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv[2] ?? 'all';
if (!['all', 'contracts', 'protected'].includes(mode)) throw new Error('Unknown test mode');
const built = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit', timeout: 65000 });
if (built.error || built.status !== 0) process.exit(1);
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? discover(resolve(dir, e.name)) : e.name.endsWith('.test.js') ? [resolve(dir, e.name)] : []);
}
let tests = discover(resolve(root, 'node_modules/.cache/agent-fabric-build/evals')).sort();
if (mode === 'contracts') tests = tests.filter(p => p.includes('/contracts/'));
if (tests.length === 0) throw new Error('No actual test files discovered');
const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.error || run.status !== 0) { console.error(run.error ?? 'Behavioral tests failed'); process.exit(1); }
const tap = run.stdout ?? '';
if (tap.split('\n').some(line => /^(?:ok|not ok) \d+.* # (?:SKIP|TODO)(?:\s|$)/i.test(line.trim()) || /^# (?:skipped|todo) [1-9]/i.test(line.trim()))) throw new Error('Skipped/TODO behavior cannot pass');
const count = /# tests (\d+)/.exec(tap);
if (!count || Number(count[1]) < 1) throw new Error('Empty behavioral execution');
if (mode === 'protected') {
  const oracle = JSON.parse(readFileSync(resolve(root, 'evals/fixtures/g0-oracle-definition.json'), 'utf8'));
  if (oracle.oracles?.length !== 34 || new Set(oracle.oracles.map(o => o.id)).size !== 34) throw new Error('Protected oracle count/identity mismatch');
  const passed = new Map();
  for (const line of tap.split('\n')) {
    const m = /^ok \d+ - (G0-O\d{2}\/(?:allowed|denied|recovery))$/.exec(line.trim());
    if (m) passed.set(m[1], (passed.get(m[1]) ?? 0) + 1);
  }
  for (const o of oracle.oracles) for (const branch of ['allowed','denied','recovery']) {
    if (passed.get(o.id + '/' + branch) !== 1) throw new Error('Required protected branch missing or duplicated: ' + o.id + '/' + branch);
  }
  if (passed.size !== 102) throw new Error('Expected exactly 102 executed protected branches');
  console.log('Protected G0: all 102 mandatory allowed/denied/recovery branches passed exactly once');
}
