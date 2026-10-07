import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assertBaseline} from './baseline.mjs';
import {suites} from './suites.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
function run(args, timeout = 60000) {
  const r = spawnSync(process.execPath, args, {cwd, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024});
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
  if (r.error || r.status !== 0) throw r.error ?? new Error('Recovery check failed: ' + r.status);
  return r.stdout;
}
export function assertTap(output) {
  if (!/^# tests [1-9]\d*$/m.test(output) || !/^ok \d+ - /m.test(output) ||
      !/^# fail 0$/m.test(output) || !/^# cancelled 0$/m.test(output) ||
      !/^# skipped 0$/m.test(output) || !/^# todo 0$/m.test(output) ||
      /^not ok \d+ - /m.test(output) || /^(?:ok|not ok) .*# (?:SKIP|TODO)/mi.test(output))
    throw new Error('Nonempty actual pass without skips/TODO/cancellation required');
  const summaries = [...output.matchAll(/^# tests (\d+)$/gm)];
  const passes = [...output.matchAll(/^# pass (\d+)$/gm)];
  if (summaries.length !== 1 || passes.length !== 1 || summaries[0][1] !== passes[0][1])
    throw new Error('One complete TAP summary with every test passed required');
}
export function assertMandatory(dir, names) {
  for (const name of names) if (!Object.hasOwn(suites, name) || !existsSync(resolve(dir, suites[name])))
    throw new Error('Mandatory suite missing: ' + name);
}
export function runSuites(names, all = false) {
  if (!names.length || names.some(name => !Object.hasOwn(suites, name)) || new Set(names).size !== names.length)
    throw new Error('Explicit known nonduplicate suites required');
  assertBaseline();
  try {
  run(['scripts/build.mjs']);
  const dir = resolve(cwd, 'node_modules/.cache/recovery-build/g1-recovery/tests');
  assertMandatory(dir, names);
  // Final gate also executes every added suite; no unregistered extra can be silently omitted.
  const files = all ? readdirSync(dir).filter(name => name.endsWith('.test.js')).sort() : names.map(name => suites[name]);
  for (const file of files) {
    if (file === suites['durable-authority']) run(['scripts/postgres-suite.mjs'], 180000);
    else if (file === suites['dispatch-schedules']) run(['scripts/dispatch-suite.mjs'], 300000);
    else if (file === 'dispatch-calendar.test.js') assertTap(run(['--test', '--test-concurrency=1', '--test-reporter=tap', resolve(dir, file)], 180000));
    else if (file === suites['results-notifications']) run(all?['scripts/results-suite.mjs','results']:['scripts/results-suite.mjs'], 300000);
    else if (file === 'notifications.test.js') run(['scripts/results-suite.mjs','notifications'], 300000);
    else if (file === suites['stop-fences']) run(['scripts/fences-suite.mjs'], 300000);
    else if (file === suites['unknown-effects']) run(['scripts/effects-suite.mjs'], 300000);
    else if (file === suites.qualification) run(['scripts/qualification-suite.mjs'], 300000);
    else if (file === suites['temporal-worker']) run(['scripts/temporal-suite.mjs'], 300000);
    else assertTap(run(['--test', '--test-concurrency=1', '--test-reporter=tap', resolve(dir, file)], 180000));
  }
  } finally { assertBaseline(); }
}
