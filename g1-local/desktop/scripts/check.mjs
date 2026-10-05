import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(join(root, 'package.json'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024, ...options });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(`Desktop check failed (${command}): ${result.error?.message ?? result.signal ?? result.status}`);
  }
  return result.stdout;
}
function nonempty(path) { assert.ok(existsSync(path) && statSync(path).isFile() && statSync(path).size > 0, 'Required real file is missing/empty: ' + path); }
for (const name of ['main.cjs', 'preload.cjs', 'security.cjs', 'tests/security.test.cjs']) {
  nonempty(join(root, name)); run(process.execPath, ['--check', name]);
}
const tap = run(process.execPath, ['--test', '--test-reporter=tap', 'tests/security.test.cjs']);
const total = Number(tap.match(/^# tests (\d+)$/m)?.[1] ?? 0), passed = Number(tap.match(/^# pass (\d+)$/m)?.[1] ?? 0);
assert.ok(total >= 9 && passed === total, 'All nonempty desktop policy component tests must actually execute and pass');
assert.ok(!/^not ok /m.test(tap) && !/^# (?:skipped|todo) [1-9]/m.test(tap) && !/^(?:ok|not ok).*#\s*(?:SKIP|TODO)/mi.test(tap), 'Skipped/TODO desktop tests cannot pass');

// Generated Web assets are not copied between Loop task workbenches. Build from
// the separately locked Web package when the current workbench has no bundle.
const web = resolve(root, '../web'), dist = join(web, 'node_modules/.cache/web-dist');
const index = join(dist, 'index.html');
for (const path of ['package.json', 'pnpm-lock.yaml', 'index.html', 'src/main.tsx', 'vite.config.mjs']) nonempty(join(web, path));
if (!existsSync(index)) {
  run('pnpm', ['install', '--ignore-workspace', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', '/private/tmp/agent-fabric-pnpm-store'], { cwd: web });
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: web });
}
nonempty(index);
const html = readFileSync(index, 'utf8');
const assets = [...html.matchAll(/(?:src|href)=["'](?:\.\/|\/)?(assets\/[^"']+)["']/g)].map(match => match[1]);
assert.ok(assets.some(asset => asset.endsWith('.js')), 'A real production renderer JavaScript bundle is required');
for (const asset of assets) {
  const path = resolve(dist, asset), within = relative(dist, path);
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within), 'Renderer asset must remain in the build output'); nonempty(path);
}

const packagePath = require.resolve('electron/package.json'), installed = JSON.parse(readFileSync(packagePath, 'utf8'));
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const pinned = project.devDependencies?.electron ?? project.dependencies?.electron;
assert.equal(typeof pinned, 'string'); assert.match(pinned, /^\d+\.\d+\.\d+$/);
assert.equal(installed.version, pinned, 'The installed Electron package must match the exact declared version');
let binary;
try { binary = require('electron'); } catch {
  // --ignore-scripts installs package metadata, not a binary. The authorized
  // vendor cache must already contain the exact native archive: never silently
  // fetch an unapproved binary or substitute another application's Electron.
  const cache = '/private/tmp/agent-fabric-electron-cache';
  const archive = `electron-v${installed.version}-${process.platform}-${process.arch}.zip`;
  function cached(directory) {
    if (!existsSync(directory)) return false;
    return readdirSync(directory, { withFileTypes: true }).some(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? cached(path) : entry.isFile() && entry.name === archive && statSync(path).size > 0;
    });
  }
  assert.ok(cached(cache), 'Missing authorized Electron vendor cache archive: ' + archive + '. Populate it through an approved download before retrying.');
  const installEnv = { ...process.env, ELECTRON_CACHE: cache, electron_config_cache: cache };
  for (const name of ['ELECTRON_SKIP_BINARY_DOWNLOAD', 'ELECTRON_OVERRIDE_DIST_PATH', 'force_no_cache', 'electron_use_remote_checksums', 'npm_config_electron_use_remote_checksums']) delete installEnv[name];
  run(process.execPath, [join(dirname(packagePath), 'install.js')], { env: installEnv });
  binary = require('electron');
}
assert.equal(typeof binary, 'string'); nonempty(binary);
const electronRoot = realpathSync(dirname(packagePath)), realBinary = realpathSync(binary), location = relative(electronRoot, realBinary);
assert.ok(location && !location.startsWith('..') && !isAbsolute(location), 'The probed binary must belong to the installed pinned Electron package');
if (process.platform !== 'win32') assert.ok(statSync(realBinary).mode & 0o111, 'The Electron binary must be executable');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const versionOutput = run(realBinary, ['--version'], { timeout: 45000, env });
assert.ok(versionOutput.split(/\r?\n/).some(line => line.trim() === 'v' + installed.version), 'The actual Electron binary version must equal the installed package version');
console.log(`Desktop: ${total} policy component tests, real renderer assets and Electron ${installed.version} binary probe passed. Native UI interaction remains a separate mandatory check.`);
