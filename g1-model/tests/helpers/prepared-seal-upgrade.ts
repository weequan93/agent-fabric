import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLedgerFixture } from './ledger-fixture.js';
import { UsageRepository } from '../../src/usage-repository.js';
import { ModelService } from '../../src/model-service.js';
import { migratePreparedSeal } from '../../src/prepared-seal-migration.js';
import { modelMigrationFiles,modelMigrationPins } from '../../src/migration-pins.js';

/** Actual installed model3 function and committed unclaimed original liability
 * exist before applying model13. Original migrations are never edited. */
export async function preparedSealUpgradeCases(t:TestContext,pool:Pool,options:{ownedSyntheticDatabase:true;root:string;owner:string}){
 for(const version of [3,4,5]){
  const c=await pool.connect();try{await c.query('BEGIN');await c.query(await readFile(resolve(options.root,'g1-model/migrations',modelMigrationFiles[version]!),'utf8'));await c.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES($1,$2,$3)',[version,modelMigrationPins[version],options.owner]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const l=await createLedgerFixture();try{
  const f=l.f,a=await l.task(),input=await a.makeInput(),o=input.request.original,owner={ownerId:f.ownerId,route:f.profile.route,profileDigest:f.profile.profileDigest,port:f.adapterClient()},usage=new UsageRepository(f.uow,l.authority),service=new ModelService(l.model(),usage,[owner]);
  await service.prepare(a.scope,input);
  const snapshot=async():Promise<Record<string,unknown>>=>({...await l.snapshot(),owners:(await pool.query('SELECT * FROM fabric.model_receipt_owners ORDER BY attempt_id')).rows,resolutions:(await pool.query('SELECT * FROM fabric.model_resolutions ORDER BY attempt_id')).rows});
  const oldDefinition=(await pool.query("SELECT pg_get_functiondef('fabric.model_apply_observation(uuid,jsonb)'::regprocedure) AS value")).rows[0].value,oldLedger=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,before=await snapshot();
  await t.test('Q03-model13-old-model3-unclaimed-liability-reproduction-and-rollback',async()=>{
   await assert.rejects(service.seal(a.scope,o),e=>(e as {code?:string}).code==='42501');assert.equal((await f.journal(o)).status,'sealed-not-accepted');assert.deepEqual(await snapshot(),before);
   await assert.rejects(migratePreparedSeal(pool,{...options,injectBeforeCommit:true}),/Injected prepared seal migration rollback/);
   assert.deepEqual(await snapshot(),before);assert.equal((await pool.query("SELECT pg_get_functiondef('fabric.model_apply_observation(uuid,jsonb)'::regprocedure) AS value")).rows[0].value,oldDefinition);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,oldLedger);
  });
  await t.test('Q03-model13-forward-installed-liability-release-no-history-rewrite',async()=>{
   await migratePreparedSeal(pool,options);assert.deepEqual(await snapshot(),before);
   const upgraded=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows;assert.deepEqual(upgraded.filter(r=>r.version!==13),oldLedger);assert.equal(upgraded.find(r=>r.version===13).digest,modelMigrationPins[13]);
   await Promise.all([migratePreparedSeal(pool,options),migratePreparedSeal(pool,options)]);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,upgraded);
   assert.equal((await service.reconcile(a.scope,o)).status,'sealed-not-accepted');const after=await snapshot();await service.seal(a.scope,o);assert.deepEqual(await snapshot(),after);
   assert.equal((await pool.query('SELECT state,settled_amount FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].state,'released');assert.equal((await pool.query('SELECT record FROM fabric.model_attempts WHERE attempt_id=$1',[o.attemptId])).rows[0].record.claimId,null);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[o.attemptId])).rows[0].n,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0].n,1);
   assert.deepEqual(after['model_reservation_allowances'],before['model_reservation_allowances']);assert.deepEqual(after['model_reservation_accounts'],before['model_reservation_accounts']);assert.deepEqual(after['owners'],before['owners']);
  });
 }finally{await l.close();}
}
