import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { modelMigrationFiles,modelMigrationPins } from './migration-pins.js';
import { demand } from './errors.js';

/** Fixture admin only; separate digest ledger never replaces accepted migrations. */
export async function migrateReceipts(pool: Pool, options: { ownedSyntheticDatabase: true; owner: string; root: string; sqlPath?: string }): Promise<void> {
 demand(options.ownedSyntheticDatabase === true);
 const sql = await readFile(options.sqlPath ?? resolve(options.root, 'g1-model/migrations/0001_receipt_domain.sql'), 'utf8');
 const digest = createHash('sha256').update(sql).digest('hex');
 demand(digest===modelMigrationPins[1],'CHECK_BINDING_MISMATCH');
 const c = await pool.connect();
 try {
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  const marker = (await c.query('SELECT owner FROM public.fabric_model_fixture')).rows[0];
  demand(marker?.owner === options.owner, 'CLEANUP_UNPROVEN');
  for (const [table, versions, paths] of [
   ['fabric_foundation_migrations', [1, 2], ['infra/migrations/0001_core_records.sql', 'g1-foundations/migrations/0002_controller_roles.sql']],
   ['fabric_identity_migrations', [3], ['g1-identity/migrations/0003_identity_approvals.sql']]
  ] as const) {
   const installed = (await c.query(`SELECT version,digest FROM public.${table} ORDER BY version`)).rows;
   demand(JSON.stringify(installed.map(r => r.version)) === JSON.stringify(versions), 'CHECK_BINDING_MISMATCH');
   for (let i = 0; i < paths.length; i++) demand(installed[i]?.digest === createHash('sha256').update(await readFile(resolve(options.root, paths[i]!))).digest('hex'), 'CHECK_BINDING_MISMATCH');
  }
  // If a later task loads F03, its installed SQL must still match its owner.
  if ((await c.query("SELECT to_regclass('public.fabric_recovery_migrations') AS ledger")).rows[0]?.ledger) {
   const files: Record<number, string> = { 4:'0004_recovery.sql',5:'0005_native_history.sql',6:'0006_effect_reconciliation.sql',7:'0007_fences.sql',8:'0008_dispatch.sql',9:'0009_results.sql',10:'0010_resource_reconciliation.sql' };
   for (const r of (await c.query('SELECT version,digest FROM public.fabric_recovery_migrations')).rows) {
    demand(files[r.version] && r.digest === createHash('sha256').update(await readFile(resolve(options.root, 'g1-recovery/migrations', files[r.version]!))).digest('hex'), 'CHECK_BINDING_MISMATCH');
   }
  }
  await c.query('CREATE TABLE IF NOT EXISTS public.fabric_model_migrations(version integer PRIMARY KEY,digest text NOT NULL,owner uuid NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON public.fabric_model_migrations FROM PUBLIC');
  const prior = (await c.query('SELECT version,digest,owner FROM public.fabric_model_migrations ORDER BY version')).rows;
  const modelFiles=modelMigrationFiles;
  demand(!prior.length||prior[0]?.version===1,'CHECK_BINDING_MISMATCH');
  for(const r of prior){
   demand(modelFiles[r.version]&&r.owner===options.owner,'CHECK_BINDING_MISMATCH');
   const expected=r.version===1?digest:createHash('sha256').update(await readFile(resolve(options.root,'g1-model/migrations',modelFiles[r.version]!))).digest('hex');
   demand(expected===modelMigrationPins[r.version]&&r.digest===expected,'CHECK_BINDING_MISMATCH');
  }
  if (!prior.length) {
   demand((await c.query("SELECT to_regnamespace('model_receipts') AS schema")).rows[0]?.schema === null, 'CHECK_BINDING_MISMATCH');
   await c.query(sql);
   await c.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES(1,$1,$2)', [digest, options.owner]);
  }
  await c.query('COMMIT');
 } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}
