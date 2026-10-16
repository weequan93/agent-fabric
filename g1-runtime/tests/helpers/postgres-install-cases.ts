/** Real-PG-only P05 negative drafts. Not registered and never run on import.
 * The eventual original-owner factory supplies a new owned disposable database
 * per variant. No connection, role, process or fallback is created here. */
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {migrateRuntime,verifyRuntimeInstallation,runtimeOriginalOwnerSnapshot,runtimeSchemaSnapshot,RuntimeSchemaError,type RuntimeMigrationOptions} from '../../src/migration.js';

export type IncompatibleRuntimeVariant='ledger-acl'|'ledger-column-acl'|'runtime-column-acl'|'runtime-sequence-acl'|'runtime-sequence-shape'|'ledger-trigger'|'empty-ledger'|'missing-ledger'|'missing-ticket-table'|'extra-runtime-constraint'|'disabled-runtime-trigger'|'replica-runtime-trigger'|'disabled-foreign-key-trigger';
export interface DisposableRuntimeInstall {
 readonly admin:Pool;readonly options:RuntimeMigrationOptions;
 /** Factory owns exact instance teardown, including on failed assertions. */
 dispose():Promise<void>;
}
export type RuntimeInstallFactory=(variant:IncompatibleRuntimeVariant)=>Promise<DisposableRuntimeInstall>;
const variants:readonly IncompatibleRuntimeVariant[]=['ledger-acl','ledger-column-acl','runtime-column-acl','runtime-sequence-acl','runtime-sequence-shape','ledger-trigger','empty-ledger','missing-ledger','missing-ticket-table','extra-runtime-constraint','disabled-runtime-trigger','replica-runtime-trigger','disabled-foreign-key-trigger'];
const incompatible=(e:unknown)=>e instanceof RuntimeSchemaError;

/** Each factory instance must be fully installed and unused by an API/worker.
 * Corruption is deliberately committed in that owned fixture so a new original
 * installer connection sees it. A rolled-back DDL mock cannot prove startup
 * refusal. Cleanup always belongs to the exact factory-owned instance. */
export async function assertPgIncompatibleRuntimeInstall(factory:RuntimeInstallFactory){
 const results=[];
 for(const variant of variants){
  const f=await factory(variant);
  try{
   await verifyRuntimeInstallation(f.admin,f.options);
   const c=await f.admin.connect();let original:string;let damaged:string;
   try{
    const marker=(await c.query('SELECT owner,instance FROM public.fabric_runtime_fixture')).rows;
    assert.deepEqual(marker,[{owner:f.options.owner,instance:f.options.instance}]);
    original=await runtimeOriginalOwnerSnapshot(c);
    const healthy=await runtimeSchemaSnapshot(c);
    // No admitted tickets, allocation intents or other workload can be damaged.
    for(const table of ['runtime_queue_tickets','runtime_allocation_slots'])assert.equal((await c.query(`SELECT count(*)::int AS n FROM fabric.${table}`)).rows[0]?.n,0);
    await c.query('BEGIN');
    if(variant==='ledger-acl')await c.query('GRANT SELECT ON public.fabric_runtime_migrations TO fabric_worker');
    else if(variant==='ledger-column-acl')await c.query('GRANT SELECT(digest) ON public.fabric_runtime_migrations TO fabric_worker');
    else if(variant==='runtime-column-acl')await c.query('GRANT SELECT(request) ON fabric.runtime_queue_tickets TO fabric_worker');
    else if(variant==='runtime-sequence-acl')await c.query('GRANT USAGE ON SEQUENCE fabric.runtime_queue_tickets_sequence_seq TO fabric_worker');
    else if(variant==='runtime-sequence-shape')await c.query('ALTER SEQUENCE fabric.runtime_queue_tickets_sequence_seq INCREMENT BY 2');
    else if(variant==='ledger-trigger')await c.query('CREATE TRIGGER runtime_fixture_unexpected BEFORE DELETE ON public.fabric_runtime_migrations FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()');
    else if(variant==='empty-ledger')await c.query('DELETE FROM public.fabric_runtime_migrations');
    else if(variant==='missing-ledger')await c.query('ALTER TABLE public.fabric_runtime_migrations RENAME TO f06_fixture_hidden_migrations');
    else if(variant==='missing-ticket-table')await c.query('ALTER TABLE fabric.runtime_queue_tickets RENAME TO runtime_fixture_hidden_tickets');
    else if(variant==='extra-runtime-constraint')await c.query("ALTER TABLE fabric.runtime_queue_tickets ADD CONSTRAINT runtime_fixture_unexpected CHECK(state<>'not-a-queue-state')");
    else if(variant==='disabled-runtime-trigger')await c.query('ALTER TABLE fabric.runtime_queue_tickets DISABLE TRIGGER runtime_complete_ticket');
    else if(variant==='replica-runtime-trigger')await c.query('ALTER TABLE fabric.runtime_queue_tickets ENABLE REPLICA TRIGGER runtime_queue_binding');
    else {
     // The exact owned FK trigger is catalog-resolved and quoted by PostgreSQL.
     // No system catalog mutation or original-owner relation is used.
     const trigger=(await c.query(`SELECT format('ALTER TABLE %s DISABLE TRIGGER %I',t.tgrelid::regclass,t.tgname) AS ddl
      FROM pg_trigger t JOIN pg_constraint k ON k.oid=t.tgconstraint
      WHERE t.tgrelid='fabric.runtime_queue_resources'::regclass AND t.tgisinternal AND k.contype='f'
      ORDER BY t.tgname LIMIT 1`)).rows[0];
     assert.ok(typeof trigger?.ddl==='string');await c.query(trigger.ddl);
    }
    await c.query('COMMIT');damaged=await runtimeSchemaSnapshot(c);
    // Ledger contents are checked independently; hashing the ledger digest row
    // into its own schema digest would make an installed value self-referential.
    if(variant!=='empty-ledger')assert.notEqual(damaged,healthy,variant+' changes the complete catalog fingerprint');
    assert.equal(await runtimeOriginalOwnerSnapshot(c),original);
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
   await assert.rejects(verifyRuntimeInstallation(f.admin,f.options),(e:unknown)=>incompatible(e)||variant==='missing-ledger'&&(e as {code?:unknown})?.code==='42P01',variant+' startup refuses');
   // A missing ledger cannot be reconstructed around already-present runtime
   // objects. All other variants must also refuse without changing the fault.
   await assert.rejects(migrateRuntime(f.admin,f.options),incompatible,variant+' installer refuses');
   const observed=await f.admin.connect();try{
    assert.equal(await runtimeOriginalOwnerSnapshot(observed),original);
    assert.equal(await runtimeSchemaSnapshot(observed),damaged,variant+' is never silently repaired');
    if(variant==='ledger-acl')assert.equal((await observed.query("SELECT has_table_privilege('fabric_worker','public.fabric_runtime_migrations','SELECT') AS granted")).rows[0]?.granted,true);
    if(variant==='ledger-column-acl')assert.equal((await observed.query("SELECT has_column_privilege('fabric_worker','public.fabric_runtime_migrations','digest','SELECT') AS granted")).rows[0]?.granted,true);
    if(variant==='runtime-column-acl')assert.equal((await observed.query("SELECT has_column_privilege('fabric_worker','fabric.runtime_queue_tickets','request','SELECT') AS granted")).rows[0]?.granted,true);
    if(variant==='runtime-sequence-acl')assert.equal((await observed.query("SELECT has_sequence_privilege('fabric_worker','fabric.runtime_queue_tickets_sequence_seq','USAGE') AS granted")).rows[0]?.granted,true);
    if(variant==='runtime-sequence-shape')assert.equal((await observed.query("SELECT seqincrement::text AS increment FROM pg_sequence WHERE seqrelid='fabric.runtime_queue_tickets_sequence_seq'::regclass")).rows[0]?.increment,'2');
    if(variant==='empty-ledger')assert.equal((await observed.query('SELECT count(*)::int AS n FROM public.fabric_runtime_migrations')).rows[0]?.n,0);
    if(variant==='missing-ledger')assert.equal((await observed.query("SELECT to_regclass('public.fabric_runtime_migrations') AS ledger")).rows[0]?.ledger,null);
   }finally{observed.release();}
   results.push({variant,refused:true,originalCatalog:original,runtimeCatalog:damaged});
  }finally{await f.dispose();}
 }
 return results;
}
