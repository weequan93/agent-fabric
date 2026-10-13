import { rmSync, readFileSync, lstatSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { cwd, root, cache } from './paths.mjs';
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
 for (const path of ['node_modules', 'node_modules/.cache', 'node_modules/.cache/storage-build']) {
  try { if (lstatSync(resolve(cwd, path)).isSymbolicLink()) throw new Error('Symlinked own build cache refused'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
 }
 rmSync(cache, { recursive: true, force: true });
 run('pnpm', ['install', '--ignore-workspace', '--offline', '--frozen-lockfile', '--ignore-scripts', '--store-dir', '/private/tmp/agent-fabric-pnpm-store'], { timeout: 30_000, env: { ...process.env, CI: 'true' } });
 for (const [name, expected] of Object.entries(pins)) {
  if (JSON.parse(readFileSync(resolve(cwd, 'node_modules', name, 'package.json'), 'utf8')).version !== expected) throw new Error('Installed version mismatch: ' + name);
 }
 assertDependencyMetadata();
 const config=JSON.parse(readFileSync(resolve(cwd,'tsconfig.json'),'utf8')),o=config.compilerOptions;
 for(const option of ['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','useUnknownInCatchVariables','forceConsistentCasingInFileNames','noEmitOnError']){
  if(o[option]!==true)throw new Error('Mandatory strict compiler option missing: '+option);
 }
 if(o.skipLibCheck!==false||o.rootDir!=='..'||o.outDir!=='node_modules/.cache/storage-build'
  ||o.module!=='NodeNext'||o.moduleResolution!=='NodeNext'||o.noEmit===true||o.noCheck===true||o.emitDeclarationOnly===true
  ||JSON.stringify(o.paths)!==JSON.stringify({pg:['node_modules/@types/pg/index.d.ts']})
  ||JSON.stringify(config.include)!==JSON.stringify(['src/**/*.ts','tests/**/*.ts','../g1-foundations/src/**/*.ts','../g1-identity/src/**/*.ts','../g1-recovery/src/**/*.ts','../g1-model/src/**/*.ts','../engine/*/src/**/*.ts']))throw new Error('Independent compiler boundary changed');
 run(process.execPath, [resolve(cwd, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { timeout: 60_000 });
 for(const file of ['src/schema.js','src/contracts.js','src/owners.js','src/resource-composition.js',
  'src/record-inventory.js','tests/contracts.test.js','tests/components/contracts.component.test.js']){
  if(!lstatSync(resolve(cache,'g1-storage',file)).isFile())throw new Error('Mandatory current storage emission missing: '+file);
 }
 const assets=JSON.parse(readFileSync(resolve(cwd,'verification/owner-migration-assets.json'),'utf8'));
 if(assets.schemaVersion!==1||Object.keys(assets.files).length!==24)throw new Error('Closed owner migration manifest missing');
 for(const [file,expected] of Object.entries(assets.files)){
  if(!/^(infra|g1-foundations|g1-identity|g1-recovery|g1-model)\/migrations\/[a-z0-9_]+\.sql$/.test(file))throw new Error('Invalid owner migration asset');
  const source=resolve(root,file),target=resolve(cache,file);
  if(createHash('sha256').update(readFileSync(source)).digest('hex')!==expected)throw new Error('Owner migration digest changed: '+file);
  mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);
  if(!readFileSync(source).equals(readFileSync(target)))throw new Error('Owner migration copy changed bytes');
 }
 for(const owner of ['g1-foundations','g1-identity','g1-recovery','g1-model']){
  if(!lstatSync(resolve(cache,owner,'src')).isDirectory())throw new Error('Installed owner not emitted: '+owner);
 }
 console.log(JSON.stringify({ measurement: 'strict-build', sourceAndTests: true, node: process.version, pins, dependencyLockDigest: 'sha256:' + createHash('sha256').update(readFileSync(resolve(cwd, 'pnpm-lock.yaml'))).digest('hex'), cacheCleared: true, install: 'offline/frozen/ignore-scripts' }));
} finally { assertBaseline(); }
