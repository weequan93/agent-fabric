if(process.argv.length!==2)throw new Error('Owned fixture suite takes no arguments');
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTap} from './run-suites.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
function run(cmd, args, cwd, env = process.env) {
 const r = spawnSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 150000, maxBuffer: 32*1024*1024});
 process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
 if (r.error || r.status !== 0) throw r.error ?? new Error(cmd+' failed '+r.status); return r.stdout;
}
// Cached dependencies only; original accepted scripts/ledgers remain intact.
for (const pkg of ['g1-foundations','g1-identity']) run('pnpm', ['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'], resolve(root,pkg));
run(process.execPath, ['scripts/build.mjs'], resolve(root,'g1-foundations'));
const {withPgFixture} = await import('../../g1-foundations/scripts/pg-fixture.mjs');
const {migrateFoundation} = await import('../../g1-foundations/node_modules/.cache/foundation-build/src/migration.js');
const pg = (await import('pg')).default;
await withPgFixture(async ({connectionString}) => {
 const admin = new pg.Pool({connectionString,max:1});
 try {await migrateFoundation(admin,{ownedSyntheticDatabase:true});} finally {await admin.end();}
 const output = run(process.execPath, ['--test','--test-concurrency=1','--test-reporter=tap',resolve(root,'g1-recovery/node_modules/.cache/recovery-build/g1-recovery/tests/durable-authority.test.js')],resolve(root,'g1-recovery'),{...process.env,RECOVERY_DATABASE_URL:connectionString});
 assertTap(output);
 const compatibility = new pg.Pool({connectionString,max:1});
 try {
  await migrateFoundation(compatibility,{ownedSyntheticDatabase:true});
  const {migrateIdentity} = await import('../node_modules/.cache/recovery-build/g1-identity/src/migration.js');
  await migrateIdentity(compatibility,{ownedSyntheticDatabase:true,sqlPath:resolve(root,'g1-identity/migrations/0003_identity_approvals.sql')});
  console.log(JSON.stringify({measurement:'recovery-ledger-compatibility',foundation:(await compatibility.query('SELECT version,digest FROM public.fabric_foundation_migrations ORDER BY version')).rows,identity:(await compatibility.query('SELECT version,digest FROM public.fabric_identity_migrations')).rows,recovery:(await compatibility.query('SELECT version,digest FROM public.fabric_recovery_migrations')).rows,originalMigrationsUnchanged:true}));
 } finally {await compatibility.end();}
});
