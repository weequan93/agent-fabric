import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { modelMigrationFiles,modelMigrationPins } from './migration-pins.js';
import { demand } from './errors.js';

/** Forward-only repair; installed model1–12 SQL and original liabilities stay put. */
export async function migratePreparedSeal(pool:Pool,options:{ownedSyntheticDatabase:true;owner:string;root:string;sqlPath?:string;injectBeforeCommit?:boolean}):Promise<void>{
 demand(options.ownedSyntheticDatabase===true);
 const version=13,sql=await readFile(options.sqlPath??resolve(options.root,'g1-model/migrations',modelMigrationFiles[version]!),'utf8'),digest=createHash('sha256').update(sql).digest('hex');
 demand(digest===modelMigrationPins[version],'CHECK_BINDING_MISMATCH');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  demand((await c.query('SELECT owner FROM public.fabric_model_fixture')).rows[0]?.owner===options.owner,'CLEANUP_UNPROVEN');
  for(const v of [1,2,3,4,5,12]){const r=(await c.query('SELECT digest,owner FROM public.fabric_model_migrations WHERE version=$1',[v])).rows[0];demand(r?.owner===options.owner&&r.digest===modelMigrationPins[v],'CHECK_BINDING_MISMATCH');}
  const old=(await c.query('SELECT digest,owner FROM public.fabric_model_migrations WHERE version=$1',[version])).rows[0];
  demand(!old||(old.digest===digest&&old.owner===options.owner),'CHECK_BINDING_MISMATCH');
  if(!old){
   await c.query(sql);if(options.injectBeforeCommit)throw new Error('Injected prepared seal migration rollback');
   await c.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES($1,$2,$3)',[version,digest,options.owner]);
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
