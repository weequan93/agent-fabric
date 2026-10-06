import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
const ORIGINAL_SHA='3976b9d7d6c877b17c91296cf19cf728cf1a378f284b58b554e546950e4bb027';
export interface MigrationOptions {ownedSyntheticDatabase:true; expectedVersion?:'g0-v1'; injectBeforeRoles?:boolean}
/** Only an explicitly owned synthetic fixture, using its separate migration/admin connection. */
export async function migrateFoundation(pool:Pool,options:MigrationOptions):Promise<void>{
 if(options.ownedSyntheticDatabase!==true||options.expectedVersion!==undefined&&options.expectedVersion!=='g0-v1')throw new Error('Migration target/version not authorized');
 const core=await readFile(new URL('../../../../../infra/migrations/0001_core_records.sql',import.meta.url),'utf8').catch(()=>readFile(new URL('../../infra/migrations/0001_core_records.sql',import.meta.url),'utf8'));
 const role=await readFile(new URL('../migrations/0002_controller_roles.sql',import.meta.url),'utf8').catch(()=>readFile(new URL('../../../../migrations/0002_controller_roles.sql',import.meta.url),'utf8'));
 const digest=(s:string)=>createHash('sha256').update(s).digest('hex');if(digest(core)!==ORIGINAL_SHA)throw new Error('Original G0 migration changed');
 const client=await pool.connect();let locked=false;let discard=false;
 try{
  await client.query("SET statement_timeout='15s'; SET lock_timeout='2s'");
  const version=await client.query('SHOW server_version_num');if(Number(version.rows[0].server_version_num)<160000||Number(version.rows[0].server_version_num)>=170000)throw new Error('Qualified fixture requires actual PostgreSQL16');
  await client.query("SELECT pg_advisory_lock(hashtextextended('agent-fabric-foundation-migration',0))");locked=true;
  await client.query('CREATE TABLE IF NOT EXISTS public.fabric_foundation_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON public.fabric_foundation_migrations FROM PUBLIC');
  const installed=await client.query('SELECT version,digest FROM public.fabric_foundation_migrations ORDER BY version');
  if(installed.rows.some(x=>![1,2].includes(x.version)))throw new Error('Unknown future schema version');
  for(const [version,sql] of [[1,core],[2,role]] as const){
   const prior=installed.rows.find(x=>x.version===version);if(prior){if(prior.digest!==digest(sql))throw new Error('Installed migration digest incompatible');continue;}
   if(version===1){const e=await client.query("SELECT to_regnamespace('fabric') AS schema");if(e.rows[0].schema!==null)throw new Error('Untracked existing fabric schema; no overwrite');}
   await client.query('BEGIN');
   try{
    if(version===2&&options.injectBeforeRoles)await client.query('SELECT deliberate_missing_migration_function()');
    const body=sql.replace(/^BEGIN;\s*/m,'').replace(/COMMIT;\s*$/,'');
    await client.query(body);await client.query('INSERT INTO public.fabric_foundation_migrations(version,digest) VALUES($1,$2)',[version,digest(sql)]);await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}
  }
 }finally{
  try{if(locked)await client.query("SELECT pg_advisory_unlock(hashtextextended('agent-fabric-foundation-migration',0))");await client.query('RESET statement_timeout;RESET lock_timeout');}catch{discard=true;}
  client.release(discard);
 }
}
