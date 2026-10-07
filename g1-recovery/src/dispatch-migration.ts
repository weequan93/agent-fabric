import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
/** Separate additive migration; accepted migration 4 bytes remain unchanged. */
export async function migrateDispatch(pool: Pool, sqlPath: string): Promise<void> {
 const sql=await readFile(sqlPath,'utf8'),digest=createHash('sha256').update(sql).digest('hex');
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-recovery-migration',0))");
  if (!(await c.query('SELECT version FROM public.fabric_recovery_migrations WHERE version=7')).rowCount) throw new Error('Recovery migration7 required');
  const old=(await c.query('SELECT digest FROM public.fabric_recovery_migrations WHERE version=8')).rows[0];
  if(old && old.digest!==digest)throw new Error('Dispatch migration incompatible');
  if(!old){await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));await c.query('INSERT INTO public.fabric_recovery_migrations(version,digest) VALUES(8,$1)',[digest]);}
  await c.query('COMMIT');
 } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
