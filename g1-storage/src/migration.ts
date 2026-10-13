import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { demand } from './errors.js';
import { uuid } from './decoder.js';
import { modelMigrationPins } from '../../g1-model/src/migration-pins.js';
export const STORAGE_MIGRATIONS = Object.freeze({1:{file:'0001_resource_identity.sql',digest:'e26197ddce314fc9d1523f3374e6a24b409810d5e7f3a84fcab0d90dcc6e71ee'},
 2:{file:'0002_current_authority.sql',digest:'11fb935cc82f2f81f5dcd9f20a5489d9d274347546950dc442733a4f1556ab74'},
 3:{file:'0003_shared_authority.sql',digest:'2679071575b61a2203097456d76d7441b220d3f6e135ae0dfeab8d47e67d8e5a'},
 4:{file:'0004_epoch_publication.sql',digest:'5655dcfbfdb2412713df2562c8e8ad32537ce0036540ef74c5542b9b790568fe'},
 5:{file:'0005_policy_publication.sql',digest:'cdacba2dd4ebd6043c9f1d1a262263269445bb7ad73fa69086464c8dc5e4d62b'},
 6:{file:'0006_source_revocation.sql',digest:'8602b3748fc7ad4d7f62e8cbacc00c63f2506c28e113e199baba917c60745d01'},
 7:{file:'0007_tombstone_publication.sql',digest:'51ed3fa8316877aa425a1a44c9c4fc4e5ebffded0fe170aa6308c47a0539e274'},
 8:{file:'0008_forget_work.sql',digest:'eb0161fd3a2d1bd981cb1507ebba3b8e280918fc19529e9e8887e9432aa30c88'},
 9:{file:'0009_head_publication.sql',digest:'23e52909335b8349bab825d7f247eee3a1b14d3320646441746694aa474c90f1'},
 10:{file:'0010_share_publication.sql',digest:'066f7f9c413f83961c58e7fc4590d429c4a48e56204eaff77f8b5a76cb3f777c'},
 11:{file:'0011_staging_preparation.sql',digest:'43ce154a9001c3be12fcadd8cf3e881282923221365784d7cded08d52e73aba5'},
 12:{file:'0012_staging_abandonment.sql',digest:'32dc507d874f77f5b56553d9ee46190620544981be5691a6db2878fc2ed06993'},
 13:{file:'0013_source_content.sql',digest:'08f12f2a0112d5e173a254881f28b093f0ca9a6cedeea5a32ec7a7dbf3eb4b18'},
 14:{file:'0014_knowledge_save.sql',digest:'f5f919e82098bb554e5f407145091b7441a05018aa93d96bf902b303198c5bca'},
 15:{file:'0015_knowledge_status.sql',digest:'fc8e9fbd62500ea57a29011c25626b23ae69e20b5376dc67d9f87b98ac5aeb4a'},
 16:{file:'0016_knowledge_correction.sql',digest:'1c82e406c6fb35bedf70a6b204cf5094645cdf8d194ef54f7c4b5d1a6fc07102'},
 17:{file:'0017_artifact_publication.sql',digest:'e2fa2e18f3a20291723ea0d519ad42a2f06dcebfa2229f9c1de31dd56db2d990'},
 18:{file:'0018_volume_drafts.sql',digest:'9610f46e2d3aca03e2f7dffc3d7966353882d902aacf1d05e63ac069d129e543'},
 19:{file:'0019_volume_promotion.sql',digest:'5b27ac6193493ef25d0a3c8764e7fc86d12720fa00f09fb8200be2158cd8a6ae'},
 20:{file:'0020_query_controls.sql',digest:'b2059ab328f700973c04e15a61b000e8dcdec17e1f013cc47bc17dee4f74132d'},
 21:{file:'0021_native_ask.sql',digest:'a9e24c2bafc803950e243e77cccac4627eddbeceb2364b7ea91d4eaea4e56fb8'},
 22:{file:'0022_ask_disclosure.sql',digest:'c3c11655f693a23995e5ebc948802080c6d58d97be5f7ed9445855ee1a79d036'},
 23:{file:'0023_retention_work.sql',digest:'421adc499d872f5fdca104a2fb99775dd2acd08c5c083b7fe09d51b3045469df'},
 24:{file:'0024_dependency_graph.sql',digest:'d5a8028b0e04ec42be778f9b039afab9740486e536154c56705f785419992995'},
 25:{file:'0025_maintenance_admission.sql',digest:'22f64e7f911854f56cd13bb04014dee12a75be0daff391201c4eeed4642ac31c'},
 26:{file:'0026_propagation_retry.sql',digest:'b87492c7df110e2b2af581ac707e0627348773cefb484e18aca99a4a55da74db'},
 27:{file:'0027_backup_confirmation.sql',digest:'8723ad60da66e92cfdc2c8ec682048d47bba0799097fb19efc5f29a51ea77001'},
 28:{file:'0028_restore_activation.sql',digest:'feddad0ecd4486264bd1e3eef715357bbc7a547e3265dbdde0570b6d144f9c16'},
 29:{file:'0029_restore_progress.sql',digest:'40d2e63805609275826e9367814fd352ad88d59863be6f50823136a57d33a2c7'}});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Catalog definitions, permissions and ledger rows, with only the declared F05
 * FK and additive storage_* triggers excluded from the installed-owner snapshot.
 * No source/data/history body is printed by this observer. */
export async function installedOwnerSnapshot(c:Pick<PoolClient,'query'>):Promise<string>{
 const data=[];
 for(const sql of [
  `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('fabric','model_receipts') AND p.proname NOT LIKE 'storage_%' ORDER BY n.nspname,p.proname,args`,
  `SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN('fabric','model_receipts') AND c.relkind IN('r','v') AND c.relname NOT LIKE 'storage_%' ORDER BY n.nspname,c.relname,a.attnum`,
  `SELECT c.conname,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN('fabric','model_receipts') AND t.relname NOT LIKE 'storage_%' AND c.conname<>'storage_resource_identity_fk' AND NOT(c.conrelid='fabric.model_resource_bindings'::regclass AND c.contype='f' AND c.confrelid='fabric.model_computer_assignments'::regclass) ORDER BY relation,c.conname`,
  `SELECT t.tgname,t.tgrelid::regclass::text AS relation,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN('fabric','model_receipts') AND c.relname NOT LIKE 'storage_%' AND t.tgname NOT LIKE 'storage_%' ORDER BY relation,t.tgname`,
  `SELECT * FROM pg_policies WHERE schemaname IN('fabric','model_receipts') AND tablename NOT LIKE 'storage_%' ORDER BY schemaname,tablename,policyname`,
  `SELECT * FROM public.fabric_foundation_migrations ORDER BY version`,
  `SELECT * FROM public.fabric_identity_migrations ORDER BY version`,
  `SELECT * FROM public.fabric_recovery_migrations ORDER BY version`,
  `SELECT * FROM public.fabric_model_migrations ORDER BY version`
 ])data.push((await c.query(sql)).rows);
 return digest(data);
}
export async function storageSchemaSnapshot(c:Pick<PoolClient,'query'>):Promise<string>{
 const data=[];
 for(const sql of [
  `SELECT c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='fabric' AND c.relkind='r' AND c.relname LIKE 'storage_%' ORDER BY c.relname,a.attnum`,
  `SELECT p.proname,pg_get_functiondef(p.oid) AS definition,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fabric' AND p.proname LIKE 'storage_%' ORDER BY p.proname`,
  `SELECT c.conname,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relnamespace='fabric'::regnamespace AND(t.relname LIKE 'storage_%' OR c.conname='storage_resource_identity_fk') ORDER BY relation,c.conname`,
  `SELECT t.tgname,t.tgrelid::regclass::text AS relation,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname LIKE 'storage_%' ORDER BY relation,t.tgname`,
  `SELECT * FROM pg_policies WHERE schemaname='fabric' AND tablename LIKE 'storage_%' ORDER BY tablename,policyname`
 ])data.push((await c.query(sql)).rows);
 return digest(data);
}
export async function migrateStorage(pool:Pool,options:{ownedSyntheticDatabase:true;owner:string;instance:string;root:string;injectBeforeCommit?:boolean}):Promise<void>{
 demand(options.ownedSyntheticDatabase===true,'UNAUTHORIZED');uuid.parse(options.owner);uuid.parse(options.instance);
 const migration=STORAGE_MIGRATIONS[1],sql=await readFile(resolve(options.root,'g1-storage/migrations',migration.file),'utf8');
 demand(createHash('sha256').update(sql).digest('hex')===migration.digest,'CHECK_BINDING_MISMATCH');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
  // Serialize with installed F04 and other storage migration invocations.
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-storage-migration',0))");
  const marker=(await c.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows;
  demand(marker.length===1&&marker[0]?.owner===options.owner&&marker[0]?.instance===options.instance,'CLEANUP_UNPROVEN');
  demand((await c.query('SELECT owner FROM public.fabric_model_fixture')).rows[0]?.owner===options.owner,'CLEANUP_UNPROVEN');
  const installed=(await c.query('SELECT version,digest,owner FROM public.fabric_model_migrations ORDER BY version')).rows;
  demand(installed.length===14&&installed.every((r,i)=>r.version===i+1&&r.digest===modelMigrationPins[r.version]&&r.owner===options.owner),'CHECK_BINDING_MISMATCH');
  const before=await installedOwnerSnapshot(c);
  await c.query(`CREATE TABLE IF NOT EXISTS public.fabric_storage_migrations(version integer PRIMARY KEY,digest text NOT NULL,owner uuid NOT NULL,instance uuid NOT NULL,owner_schema_digest text NOT NULL,storage_schema_digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON public.fabric_storage_migrations FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp`);
  const prior=(await c.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
  demand(prior.length<=29,'CHECK_BINDING_MISMATCH');
  if(prior.length){const last=prior.at(-1)!;
   demand(prior.every((p,i)=>p.version===i+1&&p.digest===STORAGE_MIGRATIONS[(i+1) as 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29].digest&&p.owner===options.owner&&p.instance===options.instance&&p.owner_schema_digest===before)
    &&last.storage_schema_digest===await storageSchemaSnapshot(c),'CHECK_BINDING_MISMATCH');
  }else{
   demand((await c.query("SELECT to_regclass('fabric.storage_resource_identities') AS relation")).rows[0]?.relation===null,'CHECK_BINDING_MISMATCH');
   await c.query(sql);demand(await installedOwnerSnapshot(c)===before,'CHECK_BINDING_MISMATCH');
   if(options.injectBeforeCommit)throw new Error('Injected storage migration rollback');
   await c.query('INSERT INTO public.fabric_storage_migrations(version,digest,owner,instance,owner_schema_digest,storage_schema_digest) VALUES(1,$1,$2,$3,$4,$5)',[migration.digest,options.owner,options.instance,before,await storageSchemaSnapshot(c)]);
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
/** Additive control ledger on the same original installed migration lineage.
 * Version1 remains byte-identical. Repetition verifies the latest full catalog;
 * historical version1 schema fingerprints are preserved rather than rewritten.
 */
export async function migrateStorageAuthority(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageVersion(pool,options,2,'storage_authority_epoch','authority');
}
export async function migrateStorageSharing(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageAuthority(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,3,'storage_shares','sharing');
}
export async function migrateStorageEpochPublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageSharing(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,4,'storage_epoch_publications','epoch publication');
}
export async function migrateStoragePolicyPublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageEpochPublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,5,'storage_policy_changes','policy publication');
}
export async function migrateStorageSourceRevocation(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStoragePolicyPublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,6,'storage_source_revocations','source revocation');
}
export async function migrateStorageTombstonePublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageSourceRevocation(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,7,'storage_tombstone_publications','tombstone publication');
}
export async function migrateStorageForgetWork(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageTombstonePublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,8,'storage_forget_work','forget work');
}
export async function migrateStorageHeadPublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageForgetWork(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,9,'storage_head_publications','head publication');
}
export async function migrateStorageSharePublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageHeadPublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,10,'storage_share_publications','share publication');
}
export async function migrateStorageStagingPreparation(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageSharePublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,11,'storage_staging_reservations','staging preparation');
}
export async function migrateStorageStagingAbandonment(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageStagingPreparation(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,12,'storage_staging_abandonments','staging abandonment');
}
export async function migrateStorageSourceContent(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageStagingAbandonment(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,13,'storage_sources','source content');
}
export async function migrateStorageKnowledgeSave(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageSourceContent(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,14,'storage_knowledge_revisions','knowledge save');
}
async function migrateStorageVersion(pool:Pool,options:Parameters<typeof migrateStorage>[1],version:2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29,relation:string,label:string):Promise<void>{
 await migrateStorage(pool,{...options,injectBeforeCommit:false});
 const migration=STORAGE_MIGRATIONS[version],sql=await readFile(resolve(options.root,'g1-storage/migrations',migration.file),'utf8');
 demand(createHash('sha256').update(sql).digest('hex')===migration.digest,'CHECK_BINDING_MISMATCH');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-storage-migration',0))");
  const marker=(await c.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows;
  demand(marker.length===1&&marker[0]?.owner===options.owner&&marker[0]?.instance===options.instance,'CLEANUP_UNPROVEN');
  const before=await installedOwnerSnapshot(c),prior=(await c.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
  demand(prior.length>=version-1&&prior.length<=29&&prior.every((p,i)=>p.version===i+1&&p.digest===STORAGE_MIGRATIONS[(i+1) as 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29].digest&&p.owner===options.owner&&p.instance===options.instance&&p.owner_schema_digest===before)
   &&prior.at(-1)?.storage_schema_digest===await storageSchemaSnapshot(c),'CHECK_BINDING_MISMATCH');
  if(prior.length===version-1){
   demand((await c.query('SELECT to_regclass($1) AS relation',['fabric.'+relation])).rows[0]?.relation===null,'CHECK_BINDING_MISMATCH');
   await c.query(sql);demand(await installedOwnerSnapshot(c)===before,'CHECK_BINDING_MISMATCH');
   if(options.injectBeforeCommit)throw new Error('Injected '+label+' migration rollback');
   await c.query('INSERT INTO public.fabric_storage_migrations(version,digest,owner,instance,owner_schema_digest,storage_schema_digest) VALUES($1,$2,$3,$4,$5,$6)',[version,migration.digest,options.owner,options.instance,before,await storageSchemaSnapshot(c)]);
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function migrateStorageKnowledgeStatus(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageKnowledgeSave(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,15,'storage_knowledge_admissions','knowledge status');
}

export async function migrateStorageKnowledgeCorrection(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageKnowledgeStatus(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,16,'storage_knowledge_corrections','knowledge correction');
}

export async function migrateStorageArtifactPublication(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageKnowledgeCorrection(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,17,'storage_artifact_versions','artifact publication');
}

export async function migrateStorageVolumeDrafts(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageArtifactPublication(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,18,'storage_volume_versions','volume drafts');
}

export async function migrateStorageVolumePromotion(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageVolumeDrafts(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,19,'storage_volume_promotions','volume promotion');
}

export async function migrateStorageQueryControls(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageVolumePromotion(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,20,'storage_query_controls','query controls');
}

export async function migrateStorageNativeAsk(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageQueryControls(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,21,'storage_ask_receipts','native ask');
 await migrateStorageVersion(pool,options,22,'storage_ask_disclosure_admissions','ask disclosure');
}

/** Explicit disclosure migration gate: original native21 is installed first;
 * injected disclosure rollback leaves21 and every owner intact. */
export async function migrateStorageAskDisclosure(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageQueryControls(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,{...options,injectBeforeCommit:false},21,'storage_ask_receipts','native ask');
 await migrateStorageVersion(pool,options,22,'storage_ask_disclosure_admissions','ask disclosure');
}

/** Forward-only retention events and expiry protocol. Legacy content/control
 * rows and installed owners survive rollback of the unapplied migration. */
export async function migrateStorageRetentionWork(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageAskDisclosure(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,23,'storage_retention_events','retention work');
}

/** Additive graph owner; unapplied migration rollback preserves v23. */
export async function migrateStorageDependencyGraph(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageRetentionWork(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,24,'storage_graph_nodes','dependency graph');
}

/** Forward-only installed maintenance admission; failed application preserves v24. */
export async function migrateStorageMaintenanceAdmission(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageDependencyGraph(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,25,'storage_maintenance_admissions','maintenance admission');
}

/** Forward-only fenced retry; failed application leaves v25 intact. */
export async function migrateStoragePropagationRetry(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageMaintenanceAdmission(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,26,'storage_propagation_leases','propagation retry');
}

/** Forward-only backup confirmation; rollback preserves v26 and installed owners. */
export async function migrateStorageBackupConfirmation(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStoragePropagationRetry(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,27,'storage_backup_confirmations','backup confirmation');
}

/** Additive restore availability metadata; original authority stays current. */
export async function migrateStorageRestoreActivation(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageBackupConfirmation(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,28,'storage_restore_activations','restore activation');
}

/** Cancellation and original-operation progress do not rewrite v28 authority. */
export async function migrateStorageRestoreProgress(pool:Pool,options:Parameters<typeof migrateStorage>[1]):Promise<void>{
 await migrateStorageRestoreActivation(pool,{...options,injectBeforeCommit:false});
 await migrateStorageVersion(pool,options,29,'storage_restore_rollbacks','restore progress');
}
