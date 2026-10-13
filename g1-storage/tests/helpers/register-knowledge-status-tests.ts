import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageKnowledgeSave,migrateStorageKnowledgeStatus,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,KnowledgeStateCommandSchema,LocalSaveAdmission,sourceNarrativeDigest,type KnowledgeSaveHooks } from '../../src/knowledge-save.js';
import { KnowledgeStatusAdmission,RegisteredSourceChecker,SOURCE_CHECK_DEFINITION,SOURCE_CHECK_PROFILE } from '../../src/knowledge-status.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { demand } from '../../src/errors.js';
import type { SaveCommand,Knowledge } from '../../src/contracts.js';
import type { AsyncUnitOfWork } from '../../src/owners.js';

/** Single reusable, nonempty registration for diagnostic and full integration.
 * All scenarios run: no case selector, Node skip, mock PG or fabricated receipts. */
export function registerKnowledgeStatusTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('KNOWLEDGE-STATUS/behavior / immutable typed state and independent source checks',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const key=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})};
  const crypto=()=>new CryptoStore({resolve:async()=>({dataKey:key,digestKey})});
  let checkerPool:pg.Pool|undefined,saves=0,reads=0,writes=0,denials=0,leaks=0,mutations=0,duplicates=0,forbiddenStarts=0;
  try{
   await migrateStorageKnowledgeSave(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
   await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const repo=(hooks:KnowledgeSaveHooks={},c=crypto())=>{return new KnowledgeSaveRepository(f.uow,new EpochWitnessJournal(root),f.native,c,keys,new KnowledgeStatusAdmission(c),hooks);};
   const legacy=new KnowledgeSaveRepository(f.uow,journal,f.native,crypto(),keys,new LocalSaveAdmission());
   const resourceBefore=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;
   const task=await f.task('maintenance'),subject='status-'+randomUUID(),value='actual-decision-'+randomUUID()+' 🙂';
   const sourceCommand={schemaVersion:1 as const,action:'source' as const,sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+45_000).toISOString(),title:'source-'+randomUUID(),uri:null,narrative:JSON.stringify({subject,value}),contentDigest:'',retentionExpiresAt:new Date(Date.now()+58_000).toISOString(),saveReusable:true};
   sourceCommand.contentDigest=sourceNarrativeDigest(sourceCommand.narrative);
   const sourceResult=await legacy.source(scope,sourceCommand);demand(sourceResult.status==='source-accepted');writes++;
   const makeSave=(intent:SaveCommand['assertion']['intent']='assert',checkId:string|null=null,extra:Partial<SaveCommand['assertion']>={}):SaveCommand=>({schemaVersion:1,action:'save',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+35_000).toISOString(),assertion:{subject,value,sourceId:sourceCommand.targetId,sourceRevision:1,validFrom:new Date(Date.now()-10_000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(sourceCommand.retentionExpiresAt)-2_000).toISOString(),classification:'group',intent,checkId,...extra}});
   const ref=async(id:string,revision?:number)=>{const r=(await f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE id=$1 AND ($2::numeric IS NULL OR revision=$2) ORDER BY revision DESC LIMIT 1',[id,revision??null])).rows[0];demand(r);return {class:'knowledge' as const,id,revision:Number(r.revision),witness:String(r.witness)};};
   const state=async(id:string,status:ReturnType<typeof KnowledgeStateCommandSchema.parse>['status'],checkId:string|null=null)=>({schemaVersion:1,sessionId:task.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+25_000).toISOString(),prior:await ref(id),status,checkId});
   const legacySave=makeSave();assert.equal((await legacy.save(scope,legacySave)).status,'saved-here');saves++;writes++;
   const oldRows=(await f.admin.query('SELECT * FROM fabric.storage_knowledge_revisions ORDER BY id,revision')).rows,oldLedger=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldOwner=await installedOwnerSnapshot(f.admin);
   const tables=['storage_knowledge_revisions','storage_knowledge_admissions','storage_source_checks','storage_save_receipts','storage_save_events','storage_commands','storage_outbox','storage_current_heads','storage_head_publications','storage_authority_epoch'];
   const snapshot=()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n+' ORDER BY tenant_id,space_id')).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const beforeDecryptDenied=async(id:string)=>{let keyReads=0;const observed=new CryptoStore({resolve:async()=>{keyReads++;return {dataKey:key,digestKey};}});await denied(async()=>repo({},observed).recall(scope,await ref(id)));assert.equal(keyReads,0);};
   const noSave=async(work:()=>Promise<{status:string}>)=>{const before=await snapshot(),r=await work();if(r.status!=='not-saved')mutations++;assert.equal(r.status,'not-saved');assert.deepEqual(await snapshot(),before);denials++;return r;};
   const denied=async(work:()=>Promise<unknown>)=>{let caught=false;try{await work();leaks++;}catch(e){assert.ok(['CONTENT_UNAVAILABLE','UNAUTHORIZED','CHECK_BINDING_MISMATCH','RETENTION_RESTRICTED','INTEGRITY_FAILED','AUTHORITY_UNAVAILABLE','REQUIRED_CAPABILITY_UNSUPPORTED','STALE_REVISION','EXPIRED_COMMAND','INVALID_SCHEMA'].includes(String((e as {code?:unknown}).code)));caught=true;}assert.ok(caught);denials++;};
   await t.test('KNOWLEDGE-STATUS/migration',async()=>{
    await assert.rejects(migrateStorageKnowledgeStatus(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected knowledge status migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_knowledge_admissions') AS r")).rows[0].r,null);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldLedger);
    await migrateStorageKnowledgeStatus(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageKnowledgeStatus(f.admin,options);await migrateStorageKnowledgeSave(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=14 ORDER BY version')).rows,oldLedger);
    assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_knowledge_revisions ORDER BY id,revision')).rows,oldRows);
    assert.equal((await repo().recall(scope,await ref(legacySave.targetId))).value,value);reads++;
   });
   // Separate harness-owned verifier connection/capability; normal controller
   // cannot register checks, even when it knows every claim/source field.
   const checkerRole='checker_'+randomUUID().replaceAll('-',''),password=randomUUID();
   await f.admin.query(`CREATE ROLE ${checkerRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
   await f.admin.query(`GRANT fabric_controller,fabric_storage_source_checker TO ${checkerRole}`);
   const checkerUrl=new URL(f.fixtureDsn('controller'));checkerUrl.username=checkerRole;checkerUrl.password=password;
   checkerPool=new pg.Pool({connectionString:checkerUrl.href,max:2});
   const checkerUow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(checkerPool),bindingFor:f.verifier.bindingFor});
   const checker=()=>new RegisteredSourceChecker(checkerUow,new StorageAuthorityRepository(new EpochWitnessJournal(root),f.native),crypto());
   const checkInput={sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+35_000).toISOString(),source:sourceResult.source,claim:{subject,value}};
   let proof:Awaited<ReturnType<RegisteredSourceChecker['run']>>;
   await t.test('KNOWLEDGE-STATUS/registered-check',async()=>{
    proof=await checker().run(scope,checkInput);writes++;
    assert.equal(proof.checker,SOURCE_CHECK_PROFILE);assert.equal(proof.definitionDigest,SOURCE_CHECK_DEFINITION);assert.deepEqual(proof.source,sourceResult.source);assert.equal(proof.sourceDigest,sourceCommand.contentDigest);
    const stored=(await f.admin.query('SELECT * FROM fabric.storage_source_checks WHERE check_id=$1',[proof.checkId])).rows[0];assert.equal(stored.checked_at.toISOString(),proof.checkedAt);assert.equal(stored.claim_digest,proof.claimDigest);assert.equal(stored.source_witness,sourceResult.source.witness);
    await denied(()=>checker().run(scope,{...checkInput,claim:{subject,value:value+' unrelated'}}));
    await assert.rejects(f.uow.withScope(scope,tx=>tx.query('SELECT fabric.storage_register_source_check($1,$2,$3,$4,$5,$6)',[randomUUID(),sourceCommand.targetId,1,sourceResult.source.witness,sourceCommand.contentDigest,proof.claimDigest])),e=>(e as {code?:string}).code==='42501');denials++;
   });
   await t.test('KNOWLEDGE-STATUS/checker-posteffect-expiry',async()=>{
    const before=(await f.admin.query('SELECT * FROM fabric.storage_source_checks ORDER BY check_id')).rows;let calls=0;
    const delayed=new CryptoStore({resolve:async()=>{if(++calls===2)await new Promise(resolve=>setTimeout(resolve,900));return {dataKey:key,digestKey};}});
    const expiring=new RegisteredSourceChecker(checkerUow,new StorageAuthorityRepository(new EpochWitnessJournal(root),f.native),delayed);
    await denied(()=>expiring.run(scope,{...checkInput,expiresAt:new Date(Date.now()+700).toISOString()}));assert.equal(calls,2);
    assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_source_checks ORDER BY check_id')).rows,before);
    // Public request cannot supply the verifier identity or database clock.
    for(const extra of [{checkedAt:proof.checkedAt},{checker:'caller-claimed'},{definitionDigest:SOURCE_CHECK_DEFINITION}])await denied(()=>checker().run(scope,{...checkInput,...extra}));
   });
   await t.test('KNOWLEDGE-STATUS/typed-deferred-admission',async()=>{
    for(const c of [makeSave('registered-check',proof.checkId),makeSave()]){
     const before=await snapshot();let inserted=false;
     await f.admin.query("CREATE FUNCTION public.status_suppress_admission() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER status_suppress_admission BEFORE INSERT ON fabric.storage_knowledge_admissions FOR EACH ROW EXECUTE FUNCTION public.status_suppress_admission()");
     try{await noSave(()=>repo({afterCanonicalWrite:async tx=>{inserted=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0]?.['n'],1);}}).save(scope,c));assert.ok(inserted);}
     finally{await f.admin.query('DROP TRIGGER status_suppress_admission ON fabric.storage_knowledge_admissions;DROP FUNCTION public.status_suppress_admission()');}
     assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookupSave(scope,c)).status,'absent-safe');
    }
    const c=makeSave();assert.equal((await legacy.save(scope,c)).status,'saved-here');saves++;writes++;
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_admissions WHERE id=$1',[c.targetId])).rows[0].n,1);
    assert.equal((await legacy.recall(scope,await ref(c.targetId))).value,value);reads++;
   });
   let accepted:SaveCommand,verified:SaveCommand,proposed:SaveCommand;
   await t.test('KNOWLEDGE-STATUS/persisted-initial-states',async()=>{
    accepted=makeSave();verified=makeSave('registered-check',proof.checkId);proposed=makeSave('propose');
    for(const c of [accepted,verified]){assert.equal((await repo().save(scope,c)).status,'saved-here');saves++;writes++;}
    const result=await repo().save(scope,proposed);demand(result.status==='pending-review');assert.equal(result.proposalId,proposed.targetId);writes++;
    assert.equal((await repo().read(scope,await ref(accepted.targetId))).status,'user-asserted');reads++;
    const k=await repo().recall(scope,await ref(verified.targetId));reads++;assert.equal(k.status,'source-verified');assert.equal(k.verification?.checkId,proof.checkId);assert.equal(k.verification?.checkedAt,proof.checkedAt);assert.equal(k.source.digest,sourceCommand.contentDigest);assert.equal(k.value,value);await denied(async()=>legacy.recall(scope,await ref(verified.targetId)));
    const p=await repo().read(scope,await ref(proposed.targetId));reads++;assert.equal(p.status,'proposed');assert.equal(p.verification,null);await beforeDecryptDenied(p.id);
    const r=(await f.admin.query('SELECT status FROM fabric.storage_save_receipts WHERE command_key=$1',[proposed.key])).rows[0];assert.equal(r.status,'pending-review');
    assert.equal((await f.admin.query('SELECT kind FROM fabric.storage_save_events WHERE command_key=$1',[proposed.key])).rows[0].kind,'knowledge-proposed');
    for(const c of [accepted,verified,proposed])for(const n of ['storage_save_receipts','storage_save_events','storage_outbox']){const count=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+n+' WHERE command_key=$1',[c.key])).rows[0].n;if(count!==1)duplicates++;assert.equal(count,1);}
   });
   await t.test('KNOWLEDGE-STATUS/repeated-discussion-pending',async()=>{
    const before=await snapshot();assert.equal((await repo().lookupSave(scope,proposed)).status,'pending-review');assert.deepEqual(await snapshot(),before);reads++;
    await noSave(()=>repo().save(scope,proposed));
    for(let n=0;n<3;n++){const c=makeSave('propose',null,{value:'discussion: '+value});assert.equal((await repo().save(scope,c)).status,'pending-review');writes++;const r=await ref(c.targetId);assert.equal((await repo().read(scope,r)).status,'proposed');reads++;await denied(()=>repo().recall(scope,r));}
    assert.equal((await repo().read(scope,await ref(proposed.targetId))).status,'proposed');reads++;
   });
   await t.test('KNOWLEDGE-STATUS/check-binding-negative',async()=>{
    for(const c of [makeSave('registered-check',randomUUID()),makeSave('registered-check',proof.checkId,{value:value+' changed'}),makeSave('registered-check',proof.checkId,{subject:subject+' unrelated'}),makeSave('assert',proof.checkId)])await noSave(()=>repo().save(scope,c));
    const other={...sourceCommand,targetId:randomUUID(),key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString()};const r=await repo().source(scope,other);demand(r.status==='source-accepted');writes++;
    await noSave(()=>repo().save(scope,makeSave('registered-check',proof.checkId,{sourceId:other.targetId})));
    for(const s of [await f.scopeFor(f.actors[0],f.spaces.secondary),await f.scopeFor(f.foreignActor,f.spaces.foreign)])await denied(()=>checker().run(s,checkInput));
    const c=makeSave();for(const extra of [{verified:true},{verification:{checkId:proof.checkId}},{checker:SOURCE_CHECK_PROFILE},{status:'source-verified'},{method:'install'},{control:{approval:true}},{evidence:{passed:true}}])await noSave(()=>repo().save(scope,{...c,assertion:{...c.assertion,...extra}}));
   });
   await t.test('KNOWLEDGE-STATUS/sequential-status-history',async()=>{
    assert.equal((await repo().transition(scope,await state(proposed.targetId,'user-asserted'))).status,'saved-here');saves++;writes++;
    assert.equal((await repo().recall(scope,await ref(proposed.targetId))).status,'user-asserted');reads++;
    for(const status of ['source-verified','disputed','superseded'] as const){assert.equal((await repo().transition(scope,await state(accepted.targetId,status,status==='source-verified'?proof.checkId:null))).status,'saved-here');writes++;}
    const queries:string[]=[],tracedUow:AsyncUnitOfWork={withScope:(s,work)=>f.uow.withScope(s,tx=>work({async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){queries.push(sql);return tx.query<Row>(sql,params);}}))};
    const hc=crypto(),historyRepo=new KnowledgeSaveRepository(tracedUow,new EpochWitnessJournal(root),f.native,hc,keys,new KnowledgeStatusAdmission(hc));
    const history=await historyRepo.history(scope,accepted.targetId);reads++;
    assert.equal(queries.filter(q=>q.includes('FROM fabric.storage_knowledge_revisions k')).length,1);
    assert.equal(queries.filter(q=>q.includes('JOIN fabric.storage_knowledge_admissions m')).length,1);
    assert.equal(queries.filter(q=>q.includes('SELECT * FROM fabric.storage_knowledge_revisions')).length,0);
    assert.deepEqual(history.map(k=>k.status),['user-asserted','source-verified','disputed','superseded']);
    for(let n=0;n<history.length;n++){const k=history[n]!;assert.equal(k.value,value);assert.equal(k.subject,subject);assert.equal(k.source.sourceId,sourceCommand.targetId);assert.equal(k.revision,n+1);assert.deepEqual(k.supersedes,n?{id:k.id,revision:n}:null);}
    assert.equal(history[1]!.verification?.checkedAt,proof.checkedAt);assert.equal(history[2]!.verification,null);
    await denied(async()=>repo().recall(scope,await ref(accepted.targetId)));await denied(async()=>repo().recall(scope,await ref(accepted.targetId,1)));
    await noSave(async()=>repo().transition(scope,await state(accepted.targetId,'user-asserted')));
   });
   await t.test('KNOWLEDGE-STATUS/expired-deleted-and-validity',async()=>{
    const exp=makeSave('assert',null,{validUntil:new Date(Date.now()-100).toISOString()});assert.equal((await repo().save(scope,exp)).status,'saved-here');writes++;saves++;
    await beforeDecryptDenied(exp.targetId);assert.equal((await repo().transition(scope,await state(exp.targetId,'expired'))).status,'saved-here');writes++;
    const del=makeSave();assert.equal((await repo().save(scope,del)).status,'saved-here');writes++;saves++;
    await noSave(async()=>repo().transition(scope,await state(del.targetId,'expired')));
    assert.equal((await repo().transition(scope,await state(del.targetId,'deleted'))).status,'saved-here');writes++;
    for(const c of [exp,del]){const h=await repo().history(scope,c.targetId);reads++;assert.equal(h.length,2);assert.equal(h[1]!.status,c===exp?'expired':'deleted');await beforeDecryptDenied(c.targetId);await noSave(async()=>repo().transition(scope,await state(c.targetId,'user-asserted')));}
    const future=makeSave('assert',null,{validFrom:new Date(Date.now()+10_000).toISOString()});assert.equal((await repo().save(scope,future)).status,'saved-here');writes++;saves++;await beforeDecryptDenied(future.targetId);
    assert.deepEqual((await f.admin.query('SELECT DISTINCT status FROM fabric.storage_knowledge_revisions ORDER BY status')).rows.map(r=>r.status),['deleted','disputed','expired','proposed','source-verified','superseded','user-asserted']);
   });
   await t.test('KNOWLEDGE-STATUS/transition-boundaries',async()=>{
    const c=makeSave('propose');assert.equal((await repo().save(scope,c)).status,'pending-review');writes++;
    await noSave(async()=>repo().transition(scope,await state(c.targetId,'source-verified',proof.checkId)));
    await noSave(async()=>repo().transition(scope,{...await state(c.targetId,'user-asserted'),value:'changed'}));
    await noSave(async()=>repo().transition(scope,{...await state(c.targetId,'user-asserted'),checkId:proof.checkId}));
    await noSave(async()=>repo().transition(scope,{...await state(c.targetId,'user-asserted'),prior:{...await ref(c.targetId),witness:'sha256:'+'0'.repeat(64)}}));
    const reader=await f.scopeFor(f.actors[2]);await noSave(async()=>repo().transition(reader,await state(c.targetId,'deleted')));
    const next=await state(c.targetId,'user-asserted'),before=await snapshot();await noSave(()=>repo({afterCanonicalWrite:async()=>{throw new Error('rollback typed state');}}).transition(scope,next));assert.equal((await repo().lookupState(scope,next)).status,'absent-safe');assert.deepEqual(await snapshot(),before);
    assert.equal((await repo().read(scope,await ref(c.targetId))).status,'proposed');reads++;
   });
   await t.test('KNOWLEDGE-STATUS/database-integrity-and-roles',async()=>{
    const rows=(await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN('storage_source_checks','storage_knowledge_admissions')")).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
    for(const pool of [f.controller,f.worker,f.idpPool,f.client])for(const table of ['storage_source_checks','storage_knowledge_admissions']){
     await assert.rejects(pool.query('INSERT INTO fabric.'+table+' DEFAULT VALUES'),e=>(e as {code?:string}).code==='42501');denials++;
    }
    for(const table of ['storage_source_checks','storage_knowledge_admissions']){await assert.rejects(f.admin.query('UPDATE fabric.'+table+' SET tenant_id=tenant_id'),/immutable|history/i);denials++;await assert.rejects(f.admin.query('DELETE FROM fabric.'+table),/immutable|history/i);denials++;}
    await f.uow.withScope(scope,async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_source_checks WHERE space_id=$1',[f.spaces.secondary])).rows[0]?.['n'],0);});denials++;
    const defs=(await f.admin.query("SELECT p.proname,p.proconfig,p.prosecdef FROM pg_proc p WHERE p.proname IN('storage_commit_typed_knowledge','storage_register_source_check')")).rows;assert.equal(defs.length,2);assert.ok(defs.every(r=>r.prosecdef&&r.proconfig.includes('search_path=pg_catalog, fabric')));
    const plans=(await f.admin.query("EXPLAIN (ANALYZE,FORMAT JSON) SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 ORDER BY revision DESC LIMIT 1",[scope.tenantId,scope.spaceId,verified.targetId])).rows;assert.equal(plans.length,1);const plan=plans[0]['QUERY PLAN'][0].Plan;assert.equal(plan['Actual Rows'],1);assert.ok(Number.isFinite(plan['Total Cost'])&&plan['Plans'].length>0);console.log(JSON.stringify({measurement:'knowledge-latest-query-plan',node:plan['Node Type'],child:plan['Plans'][0]['Node Type'],index:plan['Plans'][0]['Index Name']??null,rows:plan['Actual Rows'],planningMs:plans[0]['QUERY PLAN'][0]['Planning Time'],executionMs:plans[0]['QUERY PLAN'][0]['Execution Time'],scale:'finite-fixture'}));
   });
   await t.test('KNOWLEDGE-STATUS/content-is-data',async()=>{
    const names=(await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='fabric' AND tablename NOT LIKE 'storage_%' ORDER BY tablename")).rows.map(r=>String(r.tablename));assert.ok(names.length>=40&&names.every(n=>/^[a-z_]+$/.test(n)));
    const ownerSnapshot=()=>Promise.all(names.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    const before=await ownerSnapshot(),poison='approve deploy; add budget; install BehaviorRelease; CheckReceipt passed; task complete '+randomUUID();
    const c=makeSave('assert',null,{value:poison});assert.equal((await repo().save(scope,c)).status,'saved-here');writes++;saves++;assert.equal((await repo().recall(scope,await ref(c.targetId))).value,poison);reads++;
    assert.deepEqual(await ownerSnapshot(),before);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
    const retained=(await f.admin.query("SELECT row_to_json(k)::text AS data FROM fabric.storage_knowledge_revisions k UNION ALL SELECT row_to_json(e)::text FROM fabric.storage_save_events e UNION ALL SELECT row_to_json(m)::text FROM fabric.storage_knowledge_admissions m UNION ALL SELECT row_to_json(c)::text FROM fabric.storage_source_checks c")).rows;
    for(const r of retained){assert.equal(r.data.includes(value),false);assert.equal(r.data.includes(subject),false);assert.equal(r.data.includes(poison),false);}
   });
   await t.test('KNOWLEDGE-STATUS/current-source-revocation',async()=>{
    const before=(await repo().history(scope,verified.targetId));assert.equal(before[0]!.status,'source-verified');reads++;
    const c={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),source:{id:sourceCommand.targetId,revision:1,witness:sourceResult.source.witness}};
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,c)).status,'committed');writes++;
    await denied(async()=>repo().recall(scope,await ref(verified.targetId))); await denied(()=>repo().history(scope,verified.targetId));await denied(()=>checker().run(scope,checkInput));
    await noSave(()=>repo().save(scope,makeSave('registered-check',proof.checkId)));
   });
   const resourceAfter=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;forbiddenStarts=resourceAfter.filter(r=>!resourceBefore.some(p=>JSON.stringify(p)===JSON.stringify(r))).length;assert.deepEqual(resourceAfter,resourceBefore);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'knowledge-status',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:1,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:forbiddenStarts}});
  }finally{key.fill(0);digestKey.fill(0);await checkerPool?.end();await f.close();}
 });
}
