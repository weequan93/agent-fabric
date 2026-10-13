import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStorageFixture } from '../helpers/pg-fixture.js';
import { migrateStorage,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { BorrowedUnitOfWork } from '../../src/resource-composition.js';
import { ResourceRepository } from '../../../g1-model/src/resource-repository.js';
import { ResourceReceiptSchema,type ResourceReceipt } from '../../../g1-model/src/resource-contract.js';
import { migrateResourceIntervals } from '../../src/owners.js';
import { emitObservations } from '../helpers/observations.js';

test('MIGRATION/behavior / real owned subtype migration and installed accounting',async t=>{
 const f=await createStorageFixture();
 const options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
 let charges=0,denials=0,unexpectedMutation=0,unexpectedDisclosure=0;
 const deny=async(work:()=>Promise<unknown>)=>{let rejected=false;try{await work();unexpectedMutation++;}catch(e){assert.ok(['23514','23503','23505','P0001'].includes((e as {code:string}).code),'Expected an integrity refusal, not infrastructure failure');rejected=true;}assert.equal(rejected,true,'Expected real database refusal');denials++;};
 try{
  const legacy=randomUUID();await f.admin.query('INSERT INTO fabric.model_computer_assignments VALUES($1,$2,$3)',[f.tenant,f.spaces.group,legacy]);
  const original=await installedOwnerSnapshot(f.admin);
  await t.test('rollback leaves original FK, schema and ledgers',async()=>{
   await assert.rejects(migrateStorage(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected storage migration rollback'});
   for(const table of ['fabric.storage_resource_identities','fabric.storage_service_resources','public.fabric_storage_migrations'])assert.equal((await f.admin.query('SELECT to_regclass($1) AS relation',[table])).rows[0].relation,null);
   assert.equal(await installedOwnerSnapshot(f.admin),original);
  });
  await t.test('unexpected installed FK refuses atomically',async()=>{
   const constraint=(await f.admin.query("SELECT conname FROM pg_constraint WHERE conrelid='fabric.model_resource_bindings'::regclass AND confrelid='fabric.model_computer_assignments'::regclass")).rows[0].conname as string;
   assert.match(constraint,/^[a-z_]+$/);
   await f.admin.query(`ALTER TABLE fabric.model_resource_bindings DROP CONSTRAINT ${constraint};ALTER TABLE fabric.model_resource_bindings ADD CONSTRAINT ${constraint} FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_computer_assignments(tenant_id,space_id,resource_id) ON UPDATE CASCADE`);
   await assert.rejects(migrateStorage(f.admin,options),{code:'23514'});
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_resource_identities') AS relation")).rows[0].relation,null);
   await f.admin.query(`ALTER TABLE fabric.model_resource_bindings DROP CONSTRAINT ${constraint};ALTER TABLE fabric.model_resource_bindings ADD CONSTRAINT ${constraint} FOREIGN KEY(tenant_id,space_id,resource_id) REFERENCES fabric.model_computer_assignments(tenant_id,space_id,resource_id)`);
   assert.equal(await installedOwnerSnapshot(f.admin),original);
  });
  await migrateStorage(f.admin,options);
  const schema=await storageSchemaSnapshot(f.admin);
  await t.test('repeat, identity substitution and digest tamper',async()=>{
   await migrateStorage(f.admin,options);assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),original);
   await assert.rejects(migrateStorage(f.admin,{...options,owner:randomUUID()}),{code:'CLEANUP_UNPROVEN'});
   await assert.rejects(migrateStorage(f.admin,{...options,instance:randomUUID()}),{code:'CLEANUP_UNPROVEN'});
   const prior=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations')).rows[0];
   await f.admin.query("UPDATE public.fabric_storage_migrations SET digest='incompatible'");
   await assert.rejects(migrateStorage(f.admin,options),{code:'CHECK_BINDING_MISMATCH'});
   await f.admin.query('UPDATE public.fabric_storage_migrations SET digest=$1',[prior.digest]);
   await migrateStorage(f.admin,options);
   // Original owner APIs still recognize their original ledgers after extension.
   await migrateResourceIntervals(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,root:f.ownerRoot});
   assert.equal(await installedOwnerSnapshot(f.admin),original);
  });
  await t.test('forced RLS and no enrollment/mutation grants',async()=>{
   const rows=(await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='fabric'::regnamespace AND relname IN('storage_resource_identities','storage_service_resources') ORDER BY relname")).rows;
   assert.equal(rows.length,2);for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
   const functions=(await f.admin.query("SELECT proname,prosecdef,proconfig,has_function_privilege('public',oid,'execute') AS public_execute,has_function_privilege('fabric_controller',oid,'execute') AS controller_execute FROM pg_proc WHERE pronamespace='fabric'::regnamespace AND proname LIKE 'storage_%'")).rows;
   assert.equal(functions.length,5);for(const fn of functions){assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=pg_catalog, fabric']);assert.equal(fn.public_execute,false);assert.equal(fn.controller_execute,false);}
   for(const role of [f.worker,f.idpPool,f.client]){try{await role.query('SELECT * FROM fabric.storage_resource_identities');unexpectedDisclosure++;assert.fail('unprivileged role read succeeded');}catch(e){assert.equal((e as {code:string}).code,'42501');denials++;}}
   await f.uow.withScope(f.scope,async tx=>{assert.equal((await tx.query('SELECT * FROM fabric.storage_resource_identities')).rows.length,1);await assert.rejects(tx.query('INSERT INTO fabric.storage_resource_identities VALUES($1,$2,$3,\'computer\')',[f.tenant,f.spaces.group,randomUUID()]),{code:'42501'});}).catch(e=>{assert.equal((e as {code:string}).code,'25P02');});
  });
  const s=await f.scopeFor(f.actors[0],f.spaces.share);
  const enroll=async(a:Awaited<ReturnType<typeof f.task>>,resourceId:string,ownerId:string,extra:Record<string,unknown>={})=>{
   const row={tenant:a.scope.tenantId,space:a.scope.spaceId,resource:resourceId,owner:ownerId,generation:1,purpose:a.purpose,run:a.binding.runId,actor:a.scope.actorId,payer:a.scope.payerId,department:f.department,allowance:a.leaf,costCenter:a.binding.costCenter,...extra};
   await f.admin.query('INSERT INTO fabric.storage_service_resources VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',Object.values(row));return row;
  };
  const bind=async(a:Awaited<ReturnType<typeof f.task>>,resourceId:string,ownerId:string,service=true,extra:Record<string,unknown>={})=>{
   const row={tenant:a.scope.tenantId,space:a.scope.spaceId,resource:resourceId,generation:service?1:0,owner:ownerId,actor:a.scope.actorId,payer:a.scope.payerId,department:f.department,allowance:a.leaf,run:a.binding.runId,costCenter:a.binding.costCenter,purpose:service?a.purpose:'persistent-space-resource',policy:'reserved-until-confirmed-suspended',...extra};
   await f.admin.query('INSERT INTO fabric.model_resource_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',Object.values(row));
  };
  for(const purpose of ['ask','maintenance'] as const)await t.test(purpose+' logical resource uses unchanged prepare/settle with zero computer assignment',async()=>{
   const a=await f.task(purpose,s),resourceId=randomUUID(),ownerId=randomUUID();
   for(const extra of [{actor:f.actors[1]},{payer:f.actors[1]},{department:randomUUID()},{allowance:a.spaceLeaf},{purpose:purpose==='ask'?'maintenance':'ask'},{generation:0},{run:randomUUID()},{resource:legacy}])await deny(()=>enroll(a,resourceId,ownerId,extra));
   await enroll(a,resourceId,ownerId);
   for(const extra of [{owner:randomUUID()},{generation:2},{actor:f.actors[1]},{payer:f.actors[1]},{department:randomUUID()},{allowance:a.spaceLeaf},{run:randomUUID()},{costCenter:'wrong'},{purpose:'wrong'}])await deny(()=>bind(a,resourceId,ownerId,true,extra));
   await bind(a,resourceId,ownerId);
   for(const category of ['active-compute','reserved-compute','cold-start','retained-storage','network'])await deny(()=>f.admin.query('INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,$4,1,0,1000,1)',[f.tenant,s.spaceId,resourceId,category]));
   await f.admin.query("INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,'service',1,0,1000,1)",[f.tenant,s.spaceId,resourceId]);
   const receipt=ResourceReceiptSchema.parse({schemaVersion:1,assurance:'deterministic-local-only',receiptId:randomUUID(),ownerId,tenantId:f.tenant,spaceId:s.spaceId,resourceId,assignmentGeneration:1,category:'service',start:0,end:3,rateVersion:1,rateUnits:1,originRunId:a.binding.runId});
   const owner={ownerId,receipt:async(id:string)=>{assert.equal(id,receipt.receiptId);return receipt;},suspension:async()=>{throw new Error('No suspension');}};
   let xid:string|undefined;
   await f.uow.withScope(s,async tx=>{
    xid=String((await tx.query('SELECT txid_current() AS xid')).rows[0]?.['xid']);
    const borrower=new BorrowedUnitOfWork(s,tx);try{const repo=new ResourceRepository(borrower,owner);await repo.prepare(s,receipt.receiptId);assert.deepEqual(await repo.settle(s,receipt.receiptId),receipt);assert.equal(String((await tx.query('SELECT txid_current() AS xid')).rows[0]?.['xid']),xid);}finally{borrower.close();}
   });
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments WHERE resource_id=$1',[resourceId])).rows[0].n,0);
   const interval=(await f.admin.query('SELECT i.amount,r.state,r.settled_amount FROM fabric.model_resource_intervals i JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE i.receipt_id=$1',[receipt.receiptId])).rows;
   assert.deepEqual(interval,[{amount:'3',state:'settled',settled_amount:'3'}]);charges++;
   // Replay keeps installed-owner command receipts and exact single accounting.
   const repo=new ResourceRepository(f.uow,owner);await repo.prepare(s,receipt.receiptId);assert.deepEqual(await repo.settle(s,receipt.receiptId),receipt);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[receipt.receiptId])).rows[0].n,1);
   const changed:ResourceReceipt={...receipt,receiptId:randomUUID(),originRunId:null,start:4,end:5};
   const invalid=new ResourceRepository(f.uow,{...owner,receipt:async()=>changed});await assert.rejects(invalid.prepare(s,changed.receiptId),{code:'UNAUTHORIZED'});denials++;
   const other=await f.task(purpose,s),wrong=ResourceReceiptSchema.parse({...changed,receiptId:randomUUID(),originRunId:other.binding.runId});
   const balances=async()=>(await f.admin.query('SELECT allowance_id,reserved,settled,revision FROM fabric.budget_allowances ORDER BY allowance_id')).rows;
   const before=await balances();
   await assert.rejects(new ResourceRepository(f.uow,{...owner,receipt:async()=>wrong}).prepare(s,wrong.receiptId),{code:'23514'});denials++;
   assert.deepEqual(await balances(),before);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE receipt_id=$1',[wrong.receiptId])).rows[0].n,0);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE receipt_id=$1',[changed.receiptId])).rows[0].n,0);
   await deny(()=>f.admin.query('INSERT INTO fabric.model_computer_assignments VALUES($1,$2,$3)',[f.tenant,s.spaceId,resourceId]));
  });
  await t.test('original computer relation remains independently available',async()=>{
   const resourceId=randomUUID(),ownerId=randomUUID(),a=await f.task('ask',s);
   await f.admin.query('INSERT INTO fabric.model_computer_assignments VALUES($1,$2,$3)',[f.tenant,s.spaceId,resourceId]);
   await bind(a,resourceId,ownerId,false,{allowance:a.spaceLeaf});
   await f.admin.query("INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,'reserved-compute',1,0,1000,1)",[f.tenant,s.spaceId,resourceId]);
   const computerReceipt=ResourceReceiptSchema.parse({schemaVersion:1,assurance:'deterministic-local-only',receiptId:randomUUID(),ownerId,tenantId:f.tenant,spaceId:s.spaceId,resourceId,assignmentGeneration:0,category:'reserved-compute',start:0,end:2,rateVersion:1,rateUnits:1,originRunId:null});
   const computerRepo=new ResourceRepository(f.uow,{ownerId,receipt:async()=>computerReceipt,suspension:async()=>null});
   await computerRepo.prepare(s,computerReceipt.receiptId);assert.deepEqual(await computerRepo.settle(s,computerReceipt.receiptId),computerReceipt);
   assert.equal((await f.admin.query('SELECT amount FROM fabric.usage_settlements WHERE settlement_id=$1',[computerReceipt.receiptId])).rows[0].amount,'2');
   assert.equal((await f.admin.query('SELECT kind FROM fabric.storage_resource_identities WHERE resource_id=$1',[resourceId])).rows[0].kind,'computer');
   await deny(()=>bind(a,randomUUID(),ownerId,false));
   await deny(()=>f.admin.query('INSERT INTO fabric.storage_resource_identities VALUES($1,$2,$3,\'computer\')',[f.tenant,s.spaceId,randomUUID()]));
   await deny(()=>f.admin.query('INSERT INTO fabric.model_computer_assignments VALUES($1,$2,$3)',[f.tenant,s.spaceId,randomUUID()]));
   const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);
   assert.equal(await f.uow.withScope(foreign,async tx=>(await tx.query('SELECT * FROM fabric.storage_resource_identities')).rows.length),0);
   for(const table of ['storage_service_resources','storage_resource_identities']){await deny(()=>f.admin.query('UPDATE fabric.'+table+' SET resource_id=$1',[randomUUID()]));await deny(()=>f.admin.query('DELETE FROM fabric.'+table));}
  });
  await migrateStorage(f.admin,options);assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),original);
  const actual=(await f.admin.query("SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE category='service'")).rows[0].n as number;
  const serviceComputer=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_service_resources s JOIN fabric.model_computer_assignments c USING(tenant_id,space_id,resource_id)')).rows[0].n as number;
  assert.equal(actual,charges);assert.equal(charges,2);assert.equal(serviceComputer,0);assert.ok(denials>30);
  emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'migration',positives:{owner:charges,deny:denials,save:0,ask:0,forget:0,restore:0,read:0,write:0,conflict:0,propagate:0,backup:0,harness:0},violations:{unauthorizedDisclosure:unexpectedDisclosure,unauthorizedMutation:unexpectedMutation,silentLostUpdate:Number(actual!==charges),duplicateCanonicalEffect:Math.max(0,actual-charges),restrictedResurrection:unexpectedMutation,askComputerStart:serviceComputer}});
 }finally{await f.close();}
});
