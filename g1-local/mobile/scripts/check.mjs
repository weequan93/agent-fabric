import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, statSync, writeFileSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const native = process.argv.includes('--native');
assert.ok(process.argv.slice(2).every(arg => arg === '--native'), 'Only --native is supported');
const deadline = Date.now() + (native ? 600000 : 150000);
const require = createRequire(join(root, 'package.json'));
function run(command, args, options = {}) {
  const remaining = deadline - Date.now(); assert.ok(remaining > 0, 'Mobile check deadline exhausted');
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024, ...options, timeout: Math.min(options.timeout ?? 120000, remaining) });
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  if (result.error || result.status !== 0 || result.signal) throw new Error(`Actual mobile check failed (${command}): ${result.error?.message ?? result.signal ?? result.status}`);
  return result.stdout;
}
function nonempty(path) { assert.ok(existsSync(path) && statSync(path).isFile() && statSync(path).size > 0, 'Missing nonempty actual file: ' + path); }
const sources = ['package.json', 'pnpm-lock.yaml', 'app.json', 'babel.config.cjs', 'tsconfig.json', 'App.tsx', 'src/api.ts', 'src/state.ts'];
for (const name of sources) nonempty(join(root, name));
const cache = join(root, 'node_modules/.cache'); mkdirSync(cache, { recursive: true });
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'], { timeout: 60000 });
const esbuild = require('esbuild');
for (const name of ['state', 'api']) esbuild.buildSync({ entryPoints: [join(root, 'src', name + '.ts')], bundle: true, platform: 'browser', format: 'esm', outfile: join(cache, `test-${name}.mjs`), logLevel: 'info' });
const tap = run(process.execPath, ['--test', '--test-reporter=tap', 'tests/state.test.mjs']);
const total = Number(tap.match(/^# tests (\d+)$/m)?.[1] ?? 0), passed = Number(tap.match(/^# pass (\d+)$/m)?.[1] ?? 0);
assert.ok(total >= 8 && total === passed && !/^not ok /m.test(tap) && !/^# (?:skipped|todo) [1-9]/m.test(tap) && !/^(?:ok|not ok).*#\s*(?:SKIP|TODO)/mi.test(tap), 'Nonempty actually executed mobile component tests without skips/TODO are required');

// Build a disposable source copy. Expo CNG and Metro configuration never write
// Android sources/configuration into the accepted mobile or G0 project tree.
const generated = mkdtempSync('/private/tmp/agent-fabric-g1-native-');
const mobile = join(generated, 'g1-local/mobile'), core = join(generated, 'g1-local/src');
mkdirSync(mobile, { recursive: true }); mkdirSync(core, { recursive: true });
const copied = [];
for (const name of sources) { const target = join(mobile, name); mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(root, name), target); copied.push({ path: 'g1-local/mobile/' + name, sha256: createHash('sha256').update(readFileSync(target)).digest('hex') }); }
for (const name of ['client.ts', 'contracts.ts', 'errors.ts']) { const source = resolve(root, '../src', name); nonempty(source); copyFileSync(source, join(core, name)); copied.push({ path: 'g1-local/src/' + name, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') }); }
symlinkSync(join(root, 'node_modules'), join(mobile, 'node_modules'), 'dir');
writeFileSync(join(mobile, 'metro.config.cjs'), `const {getDefaultConfig}=require('expo/metro-config');const config=getDefaultConfig(__dirname);config.watchFolders=[${JSON.stringify(join(generated, 'g1-local'))},${JSON.stringify(join(root, 'node_modules'))}];config.resolver.nodeModulesPaths=[${JSON.stringify(join(root, 'node_modules'))}];module.exports=config;\n`);
const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' };
const bundle = join(cache, 'android-bundle'); rmSync(bundle, { recursive: true, force: true });
run(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'android', '--output-dir', bundle, '--clear', '--max-workers', '2'], { cwd: mobile, env });
function files(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]); }
assert.ok(existsSync(bundle), 'Actual Android Metro output is missing');
const bundles = files(bundle).filter(path => /\.(?:hbc|js|bundle)$/.test(path) && path.includes('android'));
assert.ok(bundles.length > 0, 'A real Android-platform Metro/Hermes bundle is required'); bundles.forEach(nonempty);
const nativeInputDigest = 'sha256:' + createHash('sha256').update(JSON.stringify(copied)).digest('hex');
if (native) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '/Users/super/Library/Android/sdk';
  assert.ok(existsSync(join(sdk, 'platforms/android-36')), 'Android SDK 36 is required');
  const javaHome = process.env.JAVA_HOME ?? run('/usr/libexec/java_home', ['-v', '17'], { timeout: 10000 }).trim();
  const nativeEnv = { ...env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  run(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], { cwd: mobile, env: nativeEnv });
  nonempty(join(mobile, 'android/gradlew'));
  run(join(mobile, 'android/gradlew'), ['app:assembleDebug', '-PreactNativeArchitectures=arm64-v8a', '--no-daemon', '--console=plain'], { cwd: join(mobile, 'android'), env: nativeEnv, timeout: 480000 });
  const apk = join(mobile, 'android/app/build/outputs/apk/debug/app-debug.apk'); nonempty(apk);
  assert.equal(readFileSync(apk).subarray(0, 2).toString(), 'PK', 'Actual APK ZIP artifact is required');
  console.log(JSON.stringify({ schemaVersion: 1, nativeInputDigest, generatedProject: mobile, apk, apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'), assurance: 'actual-local-debug-build', emulatorInstalled: false, uiExecuted: false, signedDistributionQualified: false }));
}
console.log(`Mobile: strict TypeScript, ${total} actual helper/shared SDK component tests and Android Metro bundle passed. Native installation and UI interactions remain separate mandatory checks.`);
