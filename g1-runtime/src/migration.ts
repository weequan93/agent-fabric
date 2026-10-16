/** F06 additive PG installation. Draft until real original-owner P05 passes.
 * This API never creates a database, fixture identity, role, or original record. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {uuid} from './schemas.js';
import {ORIGINAL_RUNTIME_PREREQUISITES} from './migration-prerequisites.js';
export const RUNTIME_MIGRATIONS=Object.freeze({1:Object.freeze({file:'0001_runtime_queue.sql',digest:'7b2809f6a38f66bb50244dd8024a47e8a7d24ebcd505641c324b10bc54811e0c'})});
export class RuntimeSchemaError extends Error {constructor(){super('Runtime schema/owned fixture incompatible; admissions disabled');}}
function requireCompatible(value:unknown):asserts value {if(!value)throw new RuntimeSchemaError();}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
type Catalog=Pick<PoolClient,'query'>;
/** Read-only, value-free catalog observer; excludes only additive F06 objects.
 * Old functions, grants, RLS, columns, indexes, triggers and migration rows remain bound. */
export async function runtimeOriginalOwnerSnapshot(c:Catalog):Promise<string>{
 const out=[];
 for(const sql of [
  `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('fabric','model_receipts') AND p.proname NOT LIKE 'runtime_%' ORDER BY n.nspname,p.proname,args`,
  `SELECT n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN('fabric','model_receipts') AND c.relkind IN('r','v') AND c.relname NOT LIKE 'runtime_%' ORDER BY n.nspname,c.relname,a.attnum`,
  `SELECT c.conname,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN('fabric','model_receipts') AND t.relname NOT LIKE 'runtime_%' ORDER BY relation,c.conname`,
  `SELECT t.tgname,t.tgrelid::regclass::text AS relation,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('fabric','model_receipts') AND c.relname NOT LIKE 'runtime_%'
   AND NOT EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_class owned ON owned.oid=k.conrelid WHERE k.oid=t.tgconstraint AND owned.relnamespace='fabric'::regnamespace AND owned.relname LIKE 'runtime_%') ORDER BY relation,t.tgname`,
  `SELECT n.nspname AS schemaname,c.relname AS tablename,i.relname AS indexname,pg_get_indexdef(i.oid) AS indexdef,x.indisvalid,x.indisready,x.indislive FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('fabric','model_receipts') AND c.relname NOT LIKE 'runtime_%' ORDER BY schemaname,tablename,indexname`,
  `SELECT * FROM pg_policies WHERE schemaname IN('fabric','model_receipts') AND tablename NOT LIKE 'runtime_%' ORDER BY schemaname,tablename,policyname`,
  `SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin,rolconfig FROM pg_roles WHERE rolname IN('fabric_controller','fabric_worker','fabric_test_idp') ORDER BY rolname`,
  `SELECT roleid,member,grantor,admin_option FROM pg_auth_members WHERE roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('fabric_controller','fabric_worker','fabric_test_idp')) ORDER BY roleid,member`
 ])out.push((await c.query(sql)).rows);
 for(const name of Object.keys(ORIGINAL_RUNTIME_PREREQUISITES)){
  out.push((await c.query(`SELECT * FROM public.fabric_${name}_migrations ORDER BY version`)).rows);
  out.push(await ledgerCatalog(c,`fabric_${name}_migrations`));
 }
 return hash(JSON.stringify(out));
}
/** Include ledger shape/ownership/ACLs without hashing its own digest row. */
async function ledgerCatalog(c:Catalog,name:string):Promise<unknown>{
 const out=[];
 for(const sql of [
  `SELECT c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname=$1 ORDER BY a.attnum`,
  `SELECT k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 ORDER BY k.conname`,
  `SELECT i.relname AS indexname,pg_get_indexdef(i.oid) AS indexdef,x.indisvalid,x.indisready,x.indislive FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 ORDER BY indexname`,
  `SELECT t.tgname,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 ORDER BY t.tgname`,
  `SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=$1 ORDER BY policyname`
 ])out.push((await c.query(sql,[name])).rows);
 return out;
}
export async function runtimeSchemaSnapshot(c:Catalog):Promise<string>{
 const out=[];
 for(const sql of [
  `SELECT c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='fabric' AND c.relname LIKE 'runtime_%' ORDER BY c.relname,a.attnum`,
  `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fabric' AND p.proname LIKE 'runtime_%' ORDER BY p.proname,args`,
  `SELECT c.conname,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relnamespace='fabric'::regnamespace AND t.relname LIKE 'runtime_%' ORDER BY relation,c.conname`,
  // pg_get_triggerdef alone does not include DISABLE/ENABLE REPLICA state.
  // Internal FK triggers enforce integrity too, including the referenced-side
  // triggers attached to original tables by an additive runtime-owned FK. Those
  // belong here rather than in the unchanged original-owner catalog.
  `SELECT t.tgname,t.tgrelid::regclass::text AS relation,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='fabric'::regnamespace AND (c.relname LIKE 'runtime_%'
   OR EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_class owned ON owned.oid=k.conrelid WHERE k.oid=t.tgconstraint AND owned.relnamespace='fabric'::regnamespace AND owned.relname LIKE 'runtime_%')) ORDER BY relation,t.tgname`,
  // Bind sequence configuration, never mutable sequence consumption/last_value.
  `SELECT c.relname,s.seqtypid,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid WHERE c.relnamespace='fabric'::regnamespace AND c.relname LIKE 'runtime_%' ORDER BY c.relname`,
  `SELECT * FROM pg_policies WHERE schemaname='fabric' AND tablename LIKE 'runtime_%' ORDER BY tablename,policyname`,
  `SELECT n.nspname AS schemaname,c.relname AS tablename,i.relname AS indexname,pg_get_indexdef(i.oid) AS indexdef,x.indisvalid,x.indisready,x.indislive FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fabric' AND c.relname LIKE 'runtime_%' ORDER BY tablename,indexname`
 ])out.push((await c.query(sql)).rows);
 out.push(await ledgerCatalog(c,'fabric_runtime_migrations'));
 return hash(JSON.stringify(out));
}
/** Initial default privileges or inherited grants must not become a trusted
 * baseline. Effective privilege checks include column grants and PUBLIC, which
 * has_table_privilege alone does not cover. This function performs no repair. */
async function requireWorkerBoundary(c:Catalog):Promise<void>{
 const tables=(await c.query(`SELECT c.relname,
  has_table_privilege('fabric_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
  has_any_column_privilege('fabric_worker',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE (n.nspname='fabric' AND c.relname LIKE 'runtime_%' AND c.relkind IN('r','p','v','m','f'))
   OR (n.nspname='public' AND c.relname='fabric_runtime_migrations') ORDER BY c.relname`)).rows;
 requireCompatible(tables.length===8&&tables.every(r=>r.table_access===false&&r.column_access===false));
 const sequences=(await c.query(`SELECT c.relname,has_sequence_privilege('fabric_worker',c.oid,'USAGE,SELECT,UPDATE') AS access
  FROM pg_class c WHERE c.relnamespace='fabric'::regnamespace AND c.relname LIKE 'runtime_%' AND c.relkind='S' ORDER BY c.relname`)).rows;
 requireCompatible(sequences.length===1&&sequences.every(r=>r.access===false));
 const functions=(await c.query(`SELECT p.proname,has_function_privilege('fabric_worker',p.oid,'EXECUTE') AS access
  FROM pg_proc p WHERE p.pronamespace='fabric'::regnamespace AND p.proname LIKE 'runtime_%' ORDER BY p.proname`)).rows;
 requireCompatible(functions.length===4&&functions.every(r=>r.access===false));
}
export interface RuntimeMigrationOptions {
 readonly ownedSyntheticDatabase:true;readonly owner:string;readonly instance:string;readonly root:string;
 readonly injectBeforeCommit?:boolean;
}
async function fixture(c:Catalog,o:RuntimeMigrationOptions):Promise<void>{
 const marker=(await c.query('SELECT owner,instance FROM public.fabric_runtime_fixture')).rows;
 requireCompatible(marker.length===1&&marker[0]?.owner===o.owner&&marker[0]?.instance===o.instance);
 const version=Number((await c.query('SHOW server_version_num')).rows[0]?.server_version_num);
 requireCompatible(version>=160000&&version<170000);
}
async function prerequisites(c:Catalog):Promise<void>{
 for(const [name,pins]of Object.entries(ORIGINAL_RUNTIME_PREREQUISITES)){
  const rows=(await c.query(`SELECT version,digest FROM public.fabric_${name}_migrations ORDER BY version`)).rows;
  requireCompatible(rows.length===pins.length&&rows.every((r,i)=>r.version===pins[i]?.version&&r.digest===pins[i]?.digest));
 }
}
/** Separate admin pool, explicitly owned marker and all installed original pins.
 * A failed/interrupted transaction leaves no F06 ledger or partial objects. */
export async function migrateRuntime(pool:Pool,o:RuntimeMigrationOptions):Promise<void>{
 requireCompatible(o.ownedSyntheticDatabase===true);uuid.parse(o.owner);uuid.parse(o.instance);
 const m=RUNTIME_MIGRATIONS[1],sql=await readFile(resolve(o.root,'g1-runtime/migrations',m.file),'utf8');
 requireCompatible(hash(sql)===m.digest);
 for(const pins of Object.values(ORIGINAL_RUNTIME_PREREQUISITES))for(const pin of pins)requireCompatible(hash(await readFile(resolve(o.root,pin.file),'utf8'))===pin.digest);
 const c=await pool.connect();let discard=false;
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
  // Same order as original migration lineage; no serving transaction runs here.
  for(const name of ['foundation','identity','recovery','model','storage','runtime'])await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['agent-fabric-'+name+'-migration']);
  await fixture(c,o);await prerequisites(c);const before=await runtimeOriginalOwnerSnapshot(c);
  const ledgerExists=(await c.query("SELECT to_regclass('public.fabric_runtime_migrations') IS NOT NULL AS installed")).rows[0]?.installed===true;
  // The original installation is atomic: a surviving empty ledger is not an
  // interrupted-install marker. Never repair its ACL/shape before comparing the
  // recorded catalog, since doing so would hide an incompatible installation.
  if(ledgerExists){
   await requireWorkerBoundary(c);
   const rows=(await c.query('SELECT * FROM public.fabric_runtime_migrations ORDER BY version')).rows;
   const r=rows[0];requireCompatible(rows.length===1&&r?.version===1&&r.digest===m.digest&&r.owner===o.owner&&r.instance===o.instance&&r.owner_schema_digest===before&&r.runtime_schema_digest===await runtimeSchemaSnapshot(c));
  }
  else{
   requireCompatible((await c.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fabric' AND c.relname LIKE 'runtime_%'")).rows[0]?.n===0);
   requireCompatible((await c.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fabric' AND p.proname LIKE 'runtime_%'")).rows[0]?.n===0);
   await c.query(`CREATE TABLE public.fabric_runtime_migrations(version integer PRIMARY KEY,digest text NOT NULL,owner uuid NOT NULL,instance uuid NOT NULL,owner_schema_digest text NOT NULL,runtime_schema_digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp());REVOKE ALL ON public.fabric_runtime_migrations FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp`);
   await c.query(sql);await requireWorkerBoundary(c);requireCompatible(await runtimeOriginalOwnerSnapshot(c)===before);
   if(o.injectBeforeCommit)throw new Error('Injected runtime migration rollback');
   await c.query('INSERT INTO public.fabric_runtime_migrations(version,digest,owner,instance,owner_schema_digest,runtime_schema_digest) VALUES(1,$1,$2,$3,$4,$5)',[m.digest,o.owner,o.instance,before,await runtimeSchemaSnapshot(c)]);
  }
  requireCompatible(await runtimeOriginalOwnerSnapshot(c)===before);await c.query('COMMIT');
 }catch(e){try{await c.query('ROLLBACK');}catch{discard=true;}throw e;}finally{c.release(discard);}
}
/** Trusted startup, before issuing any runtime route. Never repairs a wrong DB. */
export async function verifyRuntimeInstallation(pool:Pool,o:RuntimeMigrationOptions):Promise<void>{
 requireCompatible(o.ownedSyntheticDatabase===true);uuid.parse(o.owner);uuid.parse(o.instance);
 const c=await pool.connect();try{
  await c.query('BEGIN READ ONLY');await fixture(c,o);await prerequisites(c);await requireWorkerBoundary(c);
  const rows=(await c.query('SELECT * FROM public.fabric_runtime_migrations ORDER BY version')).rows;
  const r=rows[0];requireCompatible(rows.length===1&&r?.version===1&&r.digest===RUNTIME_MIGRATIONS[1].digest&&r.owner===o.owner&&r.instance===o.instance&&r.owner_schema_digest===await runtimeOriginalOwnerSnapshot(c)&&r.runtime_schema_digest===await runtimeSchemaSnapshot(c));
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
