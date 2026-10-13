import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { createModelFixture } from './pg-fixture.js';
import { sha } from './contract-fixtures.js';
import { migrateFamilyBudget } from '../../src/family-budget-migration.js';
import { PostgresTaskRepository,commandDigest } from '../../../g1-foundations/src/task-repository.js';
import { TaskCallBindingSchema,VersionPinsSchema } from '../../src/schema.js';
import { TransactionBudgetRepository } from '../../src/budget-repository.js';
import { code } from './budget-fixture.js';

/** Install representative v2 records before v12; all are owned synthetic data.
 * No alternate current-runtime mode or migration bypass is shipped. */
export async function familyBudgetUpgradeCases(t:TestContext,pool:Pool,options:{ownedSyntheticDatabase:true;root:string;owner:string}){
 const f=await createModelFixture();
 try{
  const scope=await f.scopeFor(1),department=randomUUID(),repo=new PostgresTaskRepository(f.uow),pins=VersionPinsSchema.parse({schemaVersion:1,engineDigest:sha(1),behaviorDigest:sha(2),schemaDigest:sha(3),environmentDigest:sha(4),dependencyLockDigest:sha(5),checkDefinitionDigest:sha(6)});
  const common:string[]=[];let previous:string|null=null;
  for(const [kind,subject]of [['tenant',f.tenant],['department',department],['person',scope.actorId],['space',f.space]]as const){
   const id=randomUUID();await pool.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,1000000,1)',[f.tenant,f.space,id,previous,scope.payerId,'synthetic-utf8-byte-unit']);await pool.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[f.tenant,f.space,id,kind,subject]);common.push(id);previous=id;
  }
  await pool.query('INSERT INTO fabric.model_policies VALUES($1,$2,1,true,$3::jsonb)',[f.tenant,f.space,JSON.stringify([f.profile.profileDigest])]);
  async function task(parentTaskId:string|null){
   const taskId=randomUUID(),runId=randomUUID(),input={taskId,runId,commandId:randomUUID(),mutationId:randomUUID(),jobId:randomUUID(),eventId:randomUUID(),idempotencyKey:randomUUID(),payloadDigest:'',expectedRevision:0,requirements:{intent:'Ask'}};
   await repo.create(scope,{...input,payloadDigest:commandDigest(input)});
   const binding=TaskCallBindingSchema.parse({schemaVersion:1,tenantId:f.tenant,spaceId:f.space,actorId:scope.actorId,payerId:scope.payerId,costCenter:'synthetic-upgrade-fixture',taskId,runId,parentTaskId,sessionId:randomUUID(),purpose:'answer',category:'model',requirementsRevision:1,versions:pins,policyRevision:1,membershipRevision:scope.membershipRevision,sourceRevisionDigest:sha(7),cancellationGeneration:0,workerGeneration:0,resourceGeneration:0,intent:'Ask'});
   const ids=[...common];let leaf=common.at(-1)!;
   for(const [kind,subject]of [['task',taskId],['run',runId]]as const){const id=randomUUID();await pool.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,10000,1)',[f.tenant,f.space,id,leaf,scope.payerId,'synthetic-utf8-byte-unit']);await pool.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[f.tenant,f.space,id,kind,subject]);ids.push(id);leaf=id;}
   await pool.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[f.tenant,f.space,runId,taskId,scope.actorId,scope.payerId,department,binding.costCenter,leaf,JSON.stringify(binding)]);return {binding,ids,leaf};
  }
  const parent=await task(null),child=await task(parent.binding.taskId),ledger=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,definition=(await pool.query("SELECT pg_get_functiondef('fabric.model_reserve(uuid,uuid,text,jsonb)'::regprocedure) AS value")).rows[0].value,sql=await readFile(resolve(options.root,'g1-model/migrations/0012_family_budget.sql'),'utf8');
  const state=async()=>(await pool.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[[...new Set([...parent.ids,...child.ids])]])).rows;
  await t.test('Q03-family-v12-current-code-refuses-old-schema-and-old-route-proves-child-only-rollback',async()=>{
   await pool.query('UPDATE fabric.budget_allowances SET ceiling=39 WHERE allowance_id=$1',[parent.leaf]);const before=await state(),o=f.original(),counters=await f.counters();
   await assert.rejects(f.uow.withScope(scope,tx=>new TransactionBudgetRepository(tx).reserve(child.binding.runId,o,{tool:40})),e=>(e as {code?:string}).code==='42P01');
   // The fixed schema2 source really admits the child despite parent39, then
   // deliberately rolls back this local probe before the upgrade fixtures.
   await assert.rejects(f.uow.withScope(scope,async tx=>{
    await tx.query('SELECT fabric.model_reserve($1,$2,$3,$4::jsonb)',[child.binding.runId,o.reservationId,o.attemptId,JSON.stringify({tool:40})]);
    const originalMembership=(await tx.query('SELECT allowance_id FROM fabric.model_reservation_allowances WHERE reservation_id=$1 ORDER BY allowance_id',[o.reservationId])).rows.map(row=>String(row['allowance_id']));
    assert.deepEqual(originalMembership,[...child.ids].sort());assert.ok(!originalMembership.includes(parent.leaf));
    throw new Error('Observed legacy child-only admission; roll back probe');
   }),/Observed legacy child-only admission; roll back probe/);
   assert.deepEqual(await state(),before);assert.deepEqual(await f.counters(),counters);assert.equal((await pool.query('SELECT count(*)::int AS n FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0].n,0);
  });
  await t.test('Q03-family-v12-actual-complete-SQL-rollback-keeps-v2-definition-and-lineage',async()=>{
   const before=await state();await assert.rejects(migrateFamilyBudget(pool,{...options,injectBeforeCommit:true}),/Injected family budget migration rollback/);
   assert.equal((await pool.query("SELECT to_regclass('fabric.model_budget_lineage') AS value")).rows[0].value,null);assert.equal((await pool.query("SELECT to_regclass('fabric.model_task_run_allowance_identity') AS value")).rows[0].value,null);
   assert.equal((await pool.query("SELECT pg_get_functiondef('fabric.model_reserve(uuid,uuid,text,jsonb)'::regprocedure) AS value")).rows[0].value,definition);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,ledger);assert.deepEqual(await state(),before);
  });
  await t.test('Q03-family-v12-historical-unattributed-child-liability-refuses-no-history-rewrite',async()=>{
   const c=await pool.connect(),reservationId=randomUUID(),before=await state();try{
    await c.query('BEGIN');
    // Exact v2 child-only membership/counters as representative legacy state.
    await c.query('UPDATE fabric.budget_allowances SET reserved=reserved+40,revision=revision+1 WHERE allowance_id=ANY($1::uuid[])',[child.ids]);
    await c.query("INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES($1,$2,$3,$4,$5,$6,$7,40,'unknown')",[f.tenant,f.space,reservationId,child.leaf,scope.actorId,child.binding.runId,randomUUID()]);
    for(const id of child.ids)await c.query('INSERT INTO fabric.model_reservation_allowances VALUES($1,$2,$3,$4)',[f.tenant,f.space,reservationId,id]);
    assert.equal((await c.query('SELECT reserved FROM fabric.budget_allowances WHERE allowance_id=$1',[parent.leaf])).rows[0].reserved,'0');
    await assert.rejects(c.query(sql),e=>(e as {code?:string;message?:string}).code==='42501'&&(e as {message:string}).message==='legacy child liabilities require explicit reconciliation');
   }finally{await c.query('ROLLBACK');c.release();}
   assert.deepEqual(await state(),before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM fabric.budget_reservations WHERE reservation_id=$1',[reservationId])).rows[0].n,0);assert.equal((await pool.query("SELECT to_regclass('fabric.model_budget_lineage') AS value")).rows[0].value,null);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,ledger);
  });
  return {close:f.close,async checkBackfill(){
   await t.test('Q03-family-v12-uncharged-existing-parent-backfill-and-authenticated-denial',async()=>{
    assert.equal((await pool.query('SELECT parent_run_id FROM fabric.model_budget_lineage WHERE run_id=$1',[child.binding.runId])).rows[0].parent_run_id,parent.binding.runId);
    await pool.query('UPDATE fabric.budget_allowances SET ceiling=39 WHERE allowance_id=$1',[parent.leaf]);const before=await state(),counters=await f.counters();
    await assert.rejects(f.uow.withScope(scope,tx=>new TransactionBudgetRepository(tx).reserve(child.binding.runId,f.original(),{tool:40})),code('BUDGET_EXHAUSTED'));assert.deepEqual(await state(),before);assert.deepEqual(await f.counters(),counters);
   });
  }};
 }catch(e){await f.close();throw e;}
}
