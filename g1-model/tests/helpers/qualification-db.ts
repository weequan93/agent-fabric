import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash,randomUUID } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { migrateIdentity } from '../../../g1-identity/src/migration.js';
import { migrateRecovery } from '../../../g1-recovery/src/migration.js';
import { migrateNativeHistory } from '../../../g1-recovery/src/native-migration.js';
import { migrateEffectHistory } from '../../../g1-recovery/src/effect-migration.js';
import { migrateFences } from '../../../g1-recovery/src/fence-migration.js';
import { migrateDispatch } from '../../../g1-recovery/src/dispatch-migration.js';
import { migrateResults } from '../../../g1-recovery/src/result-migration.js';
import { migrateResourceReconciliation } from '../../../g1-recovery/src/resource-reconciliation-migration.js';
import { migrateReceipts } from '../../src/receipt-migration.js';
import { migrateModelLedger } from '../../src/ledger-migration.js';
import { familyBudgetUpgradeCases } from './family-budget-upgrade.js';
import { preparedSealUpgradeCases } from './prepared-seal-upgrade.js';
import { migratePreparedSeal } from '../../src/prepared-seal-migration.js';
import { migrateFamilyBudget } from '../../src/family-budget-migration.js';
import { migrateNativeControls } from '../../src/native-migration.js';
import { migrateResourceIntervals } from '../../src/resource-migration.js';
import { modelMigrationFiles,modelMigrationPins } from '../../src/migration-pins.js';
import { ModelError } from '../../src/errors.js';
import { VersionPinsSchema } from '../../src/schema.js';
import { SessionLoop } from '../../src/native-imports.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { createNativeFixture } from './native-fixture.js';
import { waitUntil } from './process-fixture.js';
import { sha } from './contract-fixtures.js';
import type { OriginalCall } from '../../src/contracts.js';

const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const expires=()=>new Date(Date.now()+60_000).toISOString();
const mismatch=(error:unknown)=>error instanceof ModelError&&error.code==='CHECK_BINDING_MISMATCH';
/** Retained bytes are read from the frozen original guard, never recaptured. */
async function retained(root:string){
 const guard=JSON.parse(await readFile(resolve(root,'g1-model/verification/preserved-inputs.json'),'utf8')) as {schemaVersion:number;algorithm:string;files:Record<string,string>};
 assert.equal(guard.schemaVersion,1);assert.equal(guard.algorithm,'sha256');assert.equal(Object.keys(guard.files).length,1733);
 for(const [file,expected]of Object.entries(guard.files)){assert.ok(!file.startsWith('/')&&!file.split('/').includes('..')&&!file.startsWith('.loop/')&&!file.startsWith('g1-model/'));assert.equal(digest(await readFile(resolve(root,file))),expected,file);}
 return digest(JSON.stringify(guard.files));
}
async function prerequisiteLedgers(pool:pg.Pool){
 const result:Record<string,unknown>={};
 for(const name of ['foundation','identity','recovery'])result[name]=(await pool.query('SELECT * FROM public.fabric_'+name+'_migrations ORDER BY version')).rows;
 return result;
}
/** Existing definitions must survive exactly; additive F04 objects/triggers may appear. */
async function existingDefinitions(pool:pg.Pool){
 return {
  relations:(await pool.query("SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fabric' ORDER BY c.oid")).rows,
  columns:(await pool.query("SELECT a.attrelid,a.attname,a.atttypid,a.attnotnull,a.attnum,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='fabric' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum")).rows,
  constraints:(await pool.query("SELECT c.oid,c.conrelid,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='fabric' ORDER BY c.oid")).rows,
  functions:(await pool.query("SELECT p.oid,p.proname,p.proowner,p.proacl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fabric' ORDER BY p.oid")).rows,
  policies:(await pool.query("SELECT p.oid,to_jsonb(p) AS definition FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fabric' ORDER BY p.oid")).rows,
  triggers:(await pool.query("SELECT t.oid,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fabric' ORDER BY t.oid")).rows
 };
}
async function concurrentLocked(pool:pg.Pool,work:()=>Promise<void>,label:string){
 const lock=await pool.connect();let released=false;
 const pending:Promise<void>[]=[];
 try{
  await lock.query('BEGIN');await lock.query("SELECT pg_advisory_xact_lock(hashtextextended('agent-fabric-model-migration',0))");
  const blocker=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  for(let i=0;i<3;i++)pending.push(work());
  // Observe PostgreSQL's actual lock graph, rather than infer concurrency from promises.
  let rows:unknown[]=[];await waitUntil(async()=>{rows=(await pool.query("SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND wait_event='advisory' AND $1=ANY(pg_blocking_pids(pid))",[blocker])).rows;return rows.length===3;},label+' three real migration lock waiters',1500);
  console.log(JSON.stringify({measurement:'qualification-model-migration-lock',label,blocker,waiters:rows}));
  await lock.query('COMMIT');released=true;await Promise.all(pending);
 }finally{if(!released)await lock.query('ROLLBACK');await Promise.allSettled(pending);lock.release();}
}

/** Q03 executes before any native fixture in the fresh qualification-suite DB. */
export async function qualificationMigrationCases(t:TestContext){
 const root=process.env['MODEL_REPO_ROOT']!,owner=process.env['MODEL_FIXTURE_OWNER']!,url=process.env['MODEL_DATABASE_URL']!;
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.pathname,'/model_test');
 const pool=new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:2000});let directory:string|undefined,family:Awaited<ReturnType<typeof familyBudgetUpgradeCases>>|undefined;
 try{
  assert.equal((await pool.query('SELECT owner FROM public.fabric_model_fixture')).rows[0].owner,owner);
  assert.equal((await pool.query("SELECT to_regclass('public.fabric_model_migrations') AS ledger")).rows[0].ledger,null,'Q03 must receive the fresh qualification database');
  const retainedBefore=await retained(root);
  await migrateIdentity(pool,{ownedSyntheticDatabase:true,sqlPath:resolve(root,'g1-identity/migrations/0003_identity_approvals.sql')});
  await migrateRecovery(pool,{ownedSyntheticDatabase:true,sqlPath:resolve(root,'g1-recovery/migrations/0004_recovery.sql')});
  await migrateNativeHistory(pool,resolve(root,'g1-recovery/migrations/0005_native_history.sql'));
  await migrateEffectHistory(pool,resolve(root,'g1-recovery/migrations/0006_effect_reconciliation.sql'));
  await migrateFences(pool,resolve(root,'g1-recovery/migrations/0007_fences.sql'));
  await migrateDispatch(pool,resolve(root,'g1-recovery/migrations/0008_dispatch.sql'));
  await migrateResults(pool,resolve(root,'g1-recovery/migrations/0009_results.sql'));
  await migrateResourceReconciliation(pool,resolve(root,'g1-recovery/migrations/0010_resource_reconciliation.sql'));
  const prior=await prerequisiteLedgers(pool),definitions=await existingDefinitions(pool);
  assert.deepEqual((prior['foundation'] as {version:number}[]).map(r=>r.version),[1,2]);assert.deepEqual((prior['identity'] as {version:number}[]).map(r=>r.version),[3]);assert.deepEqual((prior['recovery'] as {version:number}[]).map(r=>r.version),[4,5,6,7,8,9,10]);
  const options={ownedSyntheticDatabase:true as const,owner,root};
  await t.test('Q03-concurrent-first-receipt-domain-and-idempotent-owner',async()=>{await concurrentLocked(pool,()=>migrateReceipts(pool,options),'first-receipt');assert.deepEqual((await pool.query('SELECT version,digest,owner FROM public.fabric_model_migrations ORDER BY version')).rows,[{version:1,digest:modelMigrationPins[1],owner}]);});
  await t.test('Q03-real-partial-model-migration-rollback',async()=>{await assert.rejects(migrateModelLedger(pool,{...options,injectBeforeCommit:true}),/Injected model migration rollback/);assert.equal((await pool.query("SELECT to_regclass('fabric.model_operations') AS table")).rows[0].table,null);assert.deepEqual((await pool.query('SELECT version FROM public.fabric_model_migrations ORDER BY version')).rows,[{version:1}]);});
  // Representative historical model2 installation, with original immutable SQL.
  const oldSql=await readFile(resolve(root,'g1-model/migrations/0002_model_ledger.sql'),'utf8');assert.equal(digest(oldSql),modelMigrationPins[2]);
  const install=await pool.connect();try{await install.query('BEGIN');await install.query(oldSql);await install.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES(2,$1,$2)',[modelMigrationPins[2],owner]);await install.query('COMMIT');}catch(e){await install.query('ROLLBACK');throw e;}finally{install.release();}
  family=await familyBudgetUpgradeCases(t,pool,options);
  await preparedSealUpgradeCases(t,pool,options);
  await t.test('Q03-original-native-schema-to-refusal-forward-rollback',async()=>{
   // Install exact original native model6/7/8/11 before the new version14.
   for(const v of [6,7,8,11]){const c=await pool.connect();try{await c.query('BEGIN');const sql=await readFile(resolve(root,'g1-model/migrations',modelMigrationFiles[v]!),'utf8');assert.equal(digest(sql),modelMigrationPins[v]);await c.query(sql);await c.query('INSERT INTO public.fabric_model_migrations(version,digest,owner) VALUES($1,$2,$3)',[v,modelMigrationPins[v],owner]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
   const ledger=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,definitions=await existingDefinitions(pool);
   await assert.rejects(migrateNativeControls(pool,{...options,injectBeforeCommit:true}),/Injected native migration rollback/);
   assert.equal((await pool.query("SELECT to_regclass('fabric.model_preparation_refusals') AS table")).rows[0].table,null);
   assert.equal((await pool.query("SELECT to_regprocedure('fabric.model_preparation_unreserved(uuid,uuid)') AS function")).rows[0].function,null);
   assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,ledger);assert.deepEqual(await existingDefinitions(pool),definitions);
   await migrateNativeControls(pool,options);await migrateNativeControls(pool,options);
   const after=await existingDefinitions(pool);for(const kind of Object.keys(definitions) as (keyof typeof definitions)[])for(const row of definitions[kind])assert.deepEqual(after[kind].find(r=>kind==='columns'?(r.attrelid===row.attrelid&&r.attnum===row.attnum):r.oid===row.oid),row,'original native '+kind);
  });
  await t.test('Q03-concurrent-additive-model-migrations-and-repeat',async()=>{
   await concurrentLocked(pool,()=>migrateResourceIntervals(pool,options),'forward-model');
   const installed=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows;
   assert.deepEqual(installed.map(r=>r.version),Array.from({length:14},(_,i)=>i+1));for(const row of installed){assert.equal(row.owner,owner);assert.equal(row.digest,modelMigrationPins[row.version]);assert.equal(row.digest,digest(await readFile(resolve(root,'g1-model/migrations',modelMigrationFiles[row.version]!))));}
   await Promise.all([migrateResourceIntervals(pool,options),migrateResourceIntervals(pool,options)]);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,installed);
  });
  await family.checkBackfill();
  await t.test('Q03-actual-same-version-source-and-installed-digest-refusal',async()=>{
   directory=await mkdtemp(resolve(tmpdir(),'fabric-q03-migration-'));
   const sql=resolve(directory,'0002_model_ledger.sql');await writeFile(sql,(await readFile(resolve(root,'g1-model/migrations/0002_model_ledger.sql'),'utf8'))+'\n-- labeled synthetic changed same-version candidate\n');
   const installed=(await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows;
   await assert.rejects(migrateModelLedger(pool,{...options,sqlPath:sql}),mismatch);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,installed);
   const familySql=resolve(directory,'0012_family_budget.sql');await writeFile(familySql,(await readFile(resolve(root,'g1-model/migrations/0012_family_budget.sql'),'utf8'))+'\n-- changed same-version family bytes\n');await assert.rejects(migrateFamilyBudget(pool,{...options,sqlPath:familySql}),mismatch);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,installed);
   const sealSql=resolve(directory,'0013_unclaimed_seal.sql');await writeFile(sealSql,(await readFile(resolve(root,'g1-model/migrations/0013_unclaimed_seal.sql'),'utf8'))+'\n-- changed same-version seal bytes\n');await assert.rejects(migratePreparedSeal(pool,{...options,sqlPath:sealSql}),mismatch);assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,installed);
   // Reproducible owned fixture ledger sabotage, restored before any later case.
   await pool.query('UPDATE public.fabric_model_migrations SET digest=$1 WHERE version=2',['0'.repeat(64)]);
   try{await assert.rejects(migrateResourceIntervals(pool,options),mismatch);assert.equal((await pool.query('SELECT digest FROM public.fabric_model_migrations WHERE version=2')).rows[0].digest,'0'.repeat(64));}finally{await pool.query('UPDATE public.fabric_model_migrations SET digest=$1 WHERE version=2',[modelMigrationPins[2]]);}
   await assert.rejects(migrateResourceIntervals(pool,{...options,owner:randomUUID()}),e=>e instanceof ModelError&&e.code==='CLEANUP_UNPROVEN');
   assert.deepEqual((await pool.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,installed);
  });
  await t.test('Q03-unchanged-prerequisite-ledgers-definitions-and-retained-bytes',async()=>{
   assert.deepEqual(await prerequisiteLedgers(pool),prior);
   const after=await existingDefinitions(pool);for(const name of Object.keys(definitions) as (keyof typeof definitions)[])for(const row of definitions[name])assert.deepEqual(after[name].find(r=>name==='columns'?(r.attrelid===row.attrelid&&r.attnum===row.attnum):r.oid===row.oid),row,name+' retained definition');
   assert.equal(await retained(root),retainedBefore);
   console.log(JSON.stringify({measurement:'qualification-migration-preservation',foundation:[1,2],identity:[3],loadedRecovery:[4,5,6,7,8,9,10],model:Array.from({length:14},(_,i)=>i+1),retainedFiles:1733,retainedManifestDigest:retainedBefore,unchanged:true}));
  });
 }finally{if(family)await family.close();if(directory)await rm(directory,{recursive:true});await pool.end();}
}

export async function qualificationRollbackCases(t:TestContext){
 const n=await createNativeFixture(),f=n.f;
 try{
  const a=await n.task({noSources:true}),s=await n.native.repository.snapshot(a.scope,a.sessionId),ids={tenantId:f.tenant,spaceId:f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},request=await n.native.context.encode(a.scope,s,n.profile,'original unknown liability through disabled admission',ids);
  const loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:ids.operationId,reservationId:ids.reservationId}),model:async()=>{throw new Error('Q07 capture original pending before dispatch');},execute:async()=>{throw new Error('Q07 forbids tool execution');}});
  loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});await assert.rejects(loop.callModel('Q07 original liability'),/Q07 capture original pending/);
  await n.native.models.prepare(a.scope,{binding:a.binding,request,origin:s.origin,nativePrefix:loop.events(),route:n.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:expires(),retryCeiling:3}});
  await f.schedule(request.original,{usage:'manual'},true);assert.equal((await n.native.models.dispatch(a.scope,request.original)).status,'unknown');assert.equal((await f.journal(request.original)).status,'accepted');
  const original:OriginalCall=request.original,prefix=(await n.native.repository.snapshot(a.scope,a.sessionId)).events;
  const reserve=(await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0];assert.equal(reserve.state,'unknown');assert.equal(Number(reserve.settled_amount),0);
  const ledger=(await f.admin.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows;
  const selection=()=>n.profiles.select({need:n.need,pins:n.pins,now:new Date().toISOString()});assert.equal(selection().status,'selected');
  await t.test('Q07-updated-environment-lock-and-check-pins-disable-current-selection',async()=>{
   for(const field of ['environmentDigest','dependencyLockDigest','checkDefinitionDigest'] as const){const changed=VersionPinsSchema.parse({...n.pins,[field]:sha(15)}),result=n.profiles.select({need:n.need,pins:changed,now:new Date().toISOString()});assert.equal(result.status,'waiting');if(result.status==='waiting'){assert.equal(result.refusal,'QUALIFICATION_MISMATCH');assert.equal(result.dispatchAllowed,false);}}
   assert.equal(selection().status,'selected','actual current unaltered pins remain qualified');
  });
  async function refusesFresh(label:string){
   const next=await n.task({noSources:true}),before=await f.counters();const response=await n.native.session.requestTurn(next.scope,{...await n.command(next.sessionId),input:'disabled admission',choice:null});assert.equal(response.status,'waiting');assert.equal(response.view.wait?.reason,'model-unavailable');assert.deepEqual(await f.counters(),before,label+' zero adapter calls');
   assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0],reserve);assert.equal((await f.journal(original)).status,'accepted');assert.deepEqual((await n.native.repository.snapshot(a.scope,a.sessionId)).events,prefix);
  }
  await t.test('Q07-installed-availability-and-organization-controls-disable-new-admission',async()=>{
   n.profiles.setAvailable(n.profile.profileId,false);await refusesFresh('unavailable');n.profiles.setAvailable(n.profile.profileId,true);
   n.profiles.setOrganizationApproved(n.profile.profileId,false);await refusesFresh('unapproved');n.profiles.setOrganizationApproved(n.profile.profileId,true);
   assert.equal(selection().status,'selected');
  });
  await t.test('Q07-durable-policy-alone-refuses-actual-native-model-prepare',async()=>{
   const candidate=await n.task({noSources:true}),snapshot=await n.native.repository.snapshot(candidate.scope,candidate.sessionId),nextIds={tenantId:f.tenant,spaceId:f.space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},nextRequest=await n.native.context.encode(candidate.scope,snapshot,n.profile,'candidate before durable disable',nextIds);
   const pending=new SessionLoop(snapshot.origin,{clock:{now:()=>Date.now()},authorize:()=>{},modelOperation:()=>({operationId:nextIds.operationId,reservationId:nextIds.reservationId}),model:async()=>{throw new Error('Q07 prospective pending prefix');},execute:async()=>{throw new Error('Q07 forbids effects');}});
   pending.transition('preparing',{currentAuthorized:true});pending.transition('running',{currentAuthorized:true});await assert.rejects(pending.callModel('candidate'),/Q07 prospective pending/);
   await f.admin.query('UPDATE fabric.model_policies SET admission_enabled=false WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);
   try{
    assert.equal(selection().status,'selected','qualification and availability remain valid, so durable policy is the refusal');const state=await n.snapshot(),counts=await f.counters();
    await assert.rejects(n.native.models.prepare(candidate.scope,{binding:candidate.binding,request:nextRequest,origin:snapshot.origin,nativePrefix:pending.events(),route:n.profile.route,categories:{model:reserveEstimate(nextRequest.payload,nextRequest.outputCap)-2,service:2},command:{key:randomUUID(),expiresAt:expires(),retryCeiling:3}}),e=>(e as {code?:string}).code==='42501');
    assert.deepEqual(await n.snapshot(),state);assert.deepEqual(await f.counters(),counts);assert.equal((await n.native.models.reconcile(a.scope,original)).status,'accepted');assert.equal((await f.journal(original)).receipt,null);assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0],reserve);
   }finally{await f.admin.query('UPDATE fabric.model_policies SET admission_enabled=true WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);}
  });
  await t.test('Q07-rollback-revokes-qualification-and-durable-policy-without-erasing-liability',async()=>{
   n.q.revoke(n.qualification.probeId);await f.admin.query('UPDATE fabric.model_policies SET admission_enabled=false WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);
   const selected=selection();assert.equal(selected.status,'waiting');if(selected.status==='waiting')assert.equal(selected.refusal,'QUALIFICATION_MISMATCH');await refusesFresh('rollback');
   assert.equal((await n.native.models.reconcile(a.scope,original)).status,'accepted');assert.equal((await f.journal(original)).receipt,null);assert.deepEqual((await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0],reserve);assert.deepEqual((await n.native.repository.snapshot(a.scope,a.sessionId)).events,prefix);
  });
  await t.test('Q07-original-lookup-and-once-settlement-remain-after-disable-no-output-replay',async()=>{
   const before=await f.counters();await f.finalize(original);const receipt=(await f.journal(original)).receipt;
   const resolution=await n.native.session.reconcile(a.scope,{sessionId:a.sessionId,operationId:original.operationId});assert.equal(resolution.status,'completed');assert.equal(resolution.replayAllowed,false);assert.equal(resolution.view.pendingModel,null);assert.equal(resolution.view.modelResultCount,0);assert.equal(n.chunks.length,0);
   const reservation=(await f.admin.query('SELECT * FROM fabric.budget_reservations WHERE reservation_id=$1',[original.reservationId])).rows[0];assert.equal(reservation.state,'settled');assert.equal(Number(reservation.settled_amount),receipt.measuredUnits);assert.ok(receipt.measuredUnits>0);
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[original.attemptId])).rows[0].n,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE reservation_id=$1',[original.reservationId])).rows[0].n,1);
   const after=await n.snapshot();assert.equal((await n.native.models.reconcile(a.scope,original)).status,'settled');assert.deepEqual(await n.snapshot(),after);assert.deepEqual((await n.native.repository.snapshot(a.scope,a.sessionId)).events.slice(0,prefix.length),prefix);
   const counters=await f.counters();assert.equal(counters['accept']??0,before['accept']??0);assert.equal(counters['acceptance']??0,before['acceptance']??0);assert.equal(selection().status,'waiting');assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_model_migrations ORDER BY version')).rows,ledger);
   console.log(JSON.stringify({measurement:'qualification-rollback-original-recovery',operationId:original.operationId,attemptId:original.attemptId,reservationId:original.reservationId,admission:'disabled',originalSettled:true,inferenceReplayed:false,outputPublished:false,migrationsPreserved:true}));
  });
 }finally{await n.close();}
}
