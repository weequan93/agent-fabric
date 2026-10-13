import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { modelMigrationPins } from './migration-pins.js';
import { demand } from './errors.js';
import { migrateReceipts } from './receipt-migration.js';
import { migrateFamilyBudget } from './family-budget-migration.js';
/** Extend only our own ledger. F01/F02/F03 bytes and ledgers are prerequisites. */
export async function migrateModelLedger(pool:Pool,options:{ownedSyntheticDatabase:true;owner:string;root:string;sqlPath?:string;injectBeforeCommit?:boolean}):Promise<void>{
 await migrateReceipts(pool,{ownedSyntheticDatabase:true,owner:options.owner,root:options.root});
 const sql=await readFile(options.sqlPath??resolve(options.root,'g1-model/migrations/0002_model_ledger.sql'),'utf8'),digest=createHash('sha256').update(sql).digest('hex');
 demand(digest===modelMigrationPins[2],'CHECK_BINDING_MISMATCH');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  demand((await c.query('SELECT owner FROM public.fabric_model_fixture')).rows[0]?.owner===options.owner,'CLEANUP_UNPROVEN');
  demand(JSON.stringify((await c.query('SELECT version FROM public.fabric_recovery_migrations WHERE version<=7 ORDER BY version')).rows.map(r=>r.version))==='[4,5,6,7]','CHECK_BINDING_MISMATCH');
  const old=(await c.query('SELECT digest,owner FROM public.fabric_model_migrations WHERE version=2')).rows[0];
  demand(!old||(old.digest===digest&&old.owner===options.owner),'CHECK_BINDING_MISMATCH');
  if(!old){
   demand((await c.query("SELECT to_regclass('fabric.model_operations') AS table")).rows[0]?.table===null,'CHECK_BINDING_MISMATCH');
   await c.query(sql);if(options.injectBeforeCommit)throw new Error('Injected model migration rollback');
   await c.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES(2,$1,$2)',[digest,options.owner]);
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 await migrateFamilyBudget(pool,{ownedSyntheticDatabase:true,owner:options.owner,root:options.root});
}
