import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {Pool} from 'pg';
export async function migrateIdentity(pool:Pool,options:{ownedSyntheticDatabase:true;injectBeforeCommit?:boolean;sqlPath?:string}):Promise<void>{
 if(options.ownedSyntheticDatabase!==true)throw new Error('Owned synthetic database authorization required');
 const sql=await readFile(options.sqlPath??(existsSync(resolve('g1-identity/migrations/0003_identity_approvals.sql'))?resolve('g1-identity/migrations/0003_identity_approvals.sql'):resolve('migrations/0003_identity_approvals.sql')),'utf8');const digest=createHash('sha256').update(sql).digest('hex');
 const c=await pool.connect();let locked=false;
 try{await c.query("SET statement_timeout='15s';SET lock_timeout='2s'");await c.query("SELECT pg_advisory_lock(hashtextextended('agent-fabric-identity-migration',0))");locked=true;
 const old=await c.query('SELECT version FROM public.fabric_foundation_migrations ORDER BY version');if(JSON.stringify(old.rows.map(x=>x.version))!=='[1,2]')throw new Error('Foundation versions 1 and 2 required unchanged');
 await c.query('BEGIN');try{await c.query('CREATE TABLE IF NOT EXISTS public.fabric_identity_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON public.fabric_identity_migrations FROM PUBLIC');
 const prior=await c.query('SELECT version,digest FROM public.fabric_identity_migrations');if(prior.rows.some(x=>x.version!==3||x.digest!==digest))throw new Error('Identity migration incompatible');
 if(prior.rowCount===0){await c.query(sql.replace(/^BEGIN;\s*/m,'').replace(/COMMIT;\s*$/,''));if(options.injectBeforeCommit)throw new Error('Injected identity migration rollback');await c.query('INSERT INTO public.fabric_identity_migrations(version,digest) VALUES(3,$1)',[digest]);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}
 }finally{try{if(locked)await c.query("SELECT pg_advisory_unlock(hashtextextended('agent-fabric-identity-migration',0))");await c.query('RESET statement_timeout;RESET lock_timeout');}finally{c.release();}}
}
