import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageKnowledgeSave,migrateStorageKnowledgeStatus,migrateStorageKnowledgeCorrection,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest,type KnowledgeSaveHooks } from '../../src/knowledge-save.js';
import { KnowledgeStatusAdmission } from '../../src/knowledge-status.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { demand } from '../../src/errors.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import type { SaveCommand } from '../../src/contracts.js';
import type { VerifiedScope,AsyncUnitOfWork } from '../../src/owners.js';

/** Fixed diagnostic and full suite import precisely this nonempty registration.
 * All children run against owned PG; no case selection or skipped Node tests. */
export function registerKnowledgeCorrectionTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('KNOWLEDGE-CORRECTION/behavior / exact original dedup and selective CAS correction',async t=>{
  // This migration journey must begin before v15. Other registrations in the
  // full S-K file have already installed v15 on their shared outer database.
  // Isolate the actual journey here so every caller exercises real v14 rows.
  const repoRoot=process.env['STORAGE_REPO_ROOT'];assert.ok(repoRoot);
  const harness=await import(pathToFileURL(resolve(repoRoot,'g1-storage/scripts/fixture.mjs')).href);
  let callbacks=0;
  await harness.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
   assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);
   const previous=new Map(Object.keys(state.env).map(name=>[name,process.env[name]]));
   try{
    for(const [name,value] of Object.entries(state.env))process.env[name]=value;
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const key=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})};
  let saves=0,reads=0,writes=0,denials=0,conflicts=0,leaks=0,mutations=0,duplicates=0,lost=0,starts=0;
  try{
   await migrateStorageKnowledgeSave(f.admin,options);
   assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_knowledge_admissions') AS r")).rows[0].r,null,'Legacy fixture begins at actual v14 before typed admissions');
   const a=await enrollAuthority(f),scope=f.scope;
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
   for(const s of [scope,await f.scopeFor(f.actors[0],f.spaces.secondary),await f.scopeFor(f.foreignActor,f.spaces.foreign)])await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
   const crypto=()=>new CryptoStore({resolve:async()=>({dataKey:key,digestKey})});
   const repo=(hooks:KnowledgeSaveHooks={},c=crypto(),uow:AsyncUnitOfWork=f.uow)=>new KnowledgeSaveRepository(uow,new EpochWitnessJournal(root),f.native,c,keys,new KnowledgeStatusAdmission(c),hooks);
   const task=await f.task('maintenance'),subject='decision-'+randomUUID(),value='old-'+randomUUID()+' 🙂';
   const source=async(s:VerifiedScope=scope)=>{
    const task=s===scope?undefined:await f.task('maintenance',s),sessionId=task?.binding.sessionId??baseSession;
    const c={schemaVersion:1,action:'source',sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),title:subject,uri:null,narrative:value,contentDigest:sourceNarrativeDigest(value),retentionExpiresAt:new Date(Date.now()+58_000).toISOString(),saveReusable:true};
    const r=await repo().source(s,c);demand(r.status==='source-accepted');writes++;return {command:c,ref:r.source};
   };
   const baseSession=task.binding.sessionId,baseSource=await source();
   const makeSave=(extra:Partial<SaveCommand['assertion']>={},src=baseSource):SaveCommand=>({schemaVersion:1,action:'save',sessionId:src.command.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+35_000).toISOString(),assertion:{subject,value,sourceId:src.ref.id,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(src.command.retentionExpiresAt)-2000).toISOString(),classification:'group',intent:'assert',checkId:null,...extra}});
   const ref=async(id:string,revision?:number)=>{const row=(await f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE id=$1 AND ($2::numeric IS NULL OR revision=$2) ORDER BY revision DESC LIMIT 1',[id,revision??null])).rows[0];demand(row);return {class:'knowledge' as const,id,revision:Number(row.revision),witness:String(row.witness)};};
   const correction=async(c:SaveCommand,newValue:string,sessionId=c.sessionId)=>({command:{...c,action:'correct' as const,key:randomUUID(),sessionId,expectedRevision:(await ref(c.targetId)).revision,expiresAt:new Date(Date.now()+25_000).toISOString(),assertion:{...c.assertion,value:newValue}},prior:await ref(c.targetId)});
   const legacy=makeSave({subject:subject+' v14'}),lc=crypto();assert.equal((await new KnowledgeSaveRepository(f.uow,journal,f.native,lc,keys,new LocalSaveAdmission()).save(scope,legacy)).status,'saved-here');writes++;saves++;
   await migrateStorageKnowledgeStatus(f.admin,options);
   const accepted=makeSave();assert.equal((await repo().save(scope,accepted)).status,'saved-here');saves++;writes++;
   const oldOwner=await installedOwnerSnapshot(f.admin),oldRows=(await f.admin.query('SELECT * FROM fabric.storage_knowledge_revisions ORDER BY id,revision')).rows,oldLedger=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   const resourceBefore=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;
   const tables=['storage_knowledge_revisions','storage_knowledge_admissions','storage_knowledge_corrections','storage_save_receipts','storage_save_events','storage_commands','storage_outbox','storage_current_heads','storage_head_publications','storage_authority_epoch'];
   const snapshot=()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const noSave=async(work:()=>Promise<{status:string}>,error?:string)=>{const r=await work();if(r.status==='saved-here')mutations++;assert.equal(r.status,'not-saved');if(error)assert.equal((r as {error?:string}).error,error);denials++;return r;};
   const denied=async(work:()=>Promise<unknown>,code:string)=>{let caught=false;try{await work();leaks++;}catch(e){assert.equal((e as {code?:string}).code,code);caught=true;}assert.ok(caught);denials++;};
   const one=async(key:string)=>{for(const table of ['storage_knowledge_revisions','storage_knowledge_admissions','storage_save_receipts','storage_save_events','storage_commands','storage_outbox']){
    const where=table==='storage_knowledge_admissions'?'(id,revision) IN(SELECT id,revision FROM fabric.storage_knowledge_revisions WHERE command_key=$1)':'command_key=$1';
    const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE '+where,[key])).rows[0].n;if(n!==1)duplicates++;assert.equal(n,1);
   }};
   const blocked=async(pid:number)=>{let observed=false;const deadline=Date.now()+1500;while(Date.now()<deadline){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Caller contends on actual PostgreSQL backend');};
   await t.test('KNOWLEDGE-CORRECTION/migration',async()=>{
    await assert.rejects(migrateStorageKnowledgeCorrection(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected knowledge correction migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_knowledge_corrections') AS r")).rows[0].r,null);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldLedger);
    await migrateStorageKnowledgeCorrection(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageKnowledgeCorrection(f.admin,options);await migrateStorageKnowledgeStatus(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=15 ORDER BY version')).rows,oldLedger);assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_knowledge_revisions ORDER BY id,revision')).rows,oldRows);
    assert.equal((await repo().recall(scope,await ref(accepted.targetId))).value,value);reads++;
   });
   await t.test('KNOWLEDGE-CORRECTION/legacy-v14-correction',async()=>{
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_admissions WHERE id=$1',[legacy.targetId])).rows[0].n,0);
    const original=(await repo().history(scope,legacy.targetId))[0]!;reads++;assert.equal(original.value,legacy.assertion.value);
    const c=await correction(legacy,'legacy-corrected-'+randomUUID());assert.equal((await repo().correct(scope,c)).status,'saved-here');writes++;saves++;await one(c.command.key);
    const history=await repo().history(scope,legacy.targetId);reads++;assert.equal(history.length,2);assert.deepEqual(history[0],original);assert.equal(history[1]!.value,c.command.assertion.value);
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_admissions WHERE id=$1 AND revision=1',[legacy.targetId])).rows[0].n,0);
    assert.equal((await repo().recall(scope,await ref(legacy.targetId))).value,c.command.assertion.value);reads++;
   });
   await t.test('KNOWLEDGE-CORRECTION/atomic-lineage-history',async()=>{
    const other=await f.scopeFor(f.actors[1]),otherTask=await f.task('maintenance',other),c=await correction(accepted,'corrected-'+randomUUID(),otherTask.binding.sessionId),before=await snapshot();let inserted=false;
    const r=await repo({afterCanonicalWrite:async tx=>{
     inserted=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_corrections WHERE command_key=$1',[c.command.key])).rows[0]?.['n'],1);assert.deepEqual(await snapshot(),before);
    }}).correct(other,c);assert.equal(r.status,'saved-here',JSON.stringify(r));assert.ok(inserted);writes++;saves++;await one(c.command.key);
    const history=await repo().history(scope,accepted.targetId);reads++;assert.deepEqual(history.map(k=>k.value),[value,c.command.assertion.value]);assert.deepEqual(history.map(k=>k.assertedBy),[scope.actorId,other.actorId]);assert.deepEqual(history[1]!.supersedes,{id:accepted.targetId,revision:1});assert.deepEqual(history[0]!.source,history[1]!.source);
    assert.equal((await repo().recall(scope,await ref(accepted.targetId))).value,c.command.assertion.value);reads++;await denied(()=>repo().recall(scope,c.prior),'STALE_REVISION');
    const row=(await f.admin.query('SELECT * FROM fabric.storage_knowledge_corrections WHERE command_key=$1',[c.command.key])).rows[0];assert.equal(row.previous_witness,c.prior.witness);assert.equal(row.previous_actor,scope.actorId);assert.equal(row.previous_key,accepted.key);assert.equal(row.actor_id,other.actorId);
    assert.deepEqual(await repo().correct(other,c),r);reads++;await one(c.command.key);
    await noSave(()=>repo().correct(other,{...c,command:{...c.command,assertion:{...c.command.assertion,value:'changed-key-payload'}}}),'IDEMPOTENCY_CONFLICT');
   });
   await t.test('KNOWLEDGE-CORRECTION/target-and-terminal-negative',async()=>{
    const base=makeSave({subject:subject+' boundary'});assert.equal((await repo().append(scope,base)).status,'saved-here');writes++;saves++;
    const c=await correction(base,'new');
    for(const bad of [{...c,prior:{...c.prior,witness:'sha256:'+'0'.repeat(64)}},{...c,command:{...c.command,targetId:randomUUID()}},{...c,command:{...c.command,assertion:{...c.command.assertion,subject:subject+' changed'}}},{...c,command:{...c.command,assertion:{...c.command.assertion,sourceId:randomUUID()}}},{...c,command:{...c.command,assertion:{...c.command.assertion,intent:'propose'}}},{...c,command:{...c.command,assertion:{...c.command.assertion,value:'fixture-secret-denied'}}},{...c,command:{...c.command,assertion:{...c.command.assertion,checkId:randomUUID(),intent:'registered-check'}}},{...c,approved:true}]){
     const before=await snapshot();await noSave(()=>repo().correct(scope,bad));assert.deepEqual(await snapshot(),before);
    }
    const state={schemaVersion:1,sessionId:base.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+20_000).toISOString(),prior:await ref(base.targetId),status:'deleted',checkId:null};assert.equal((await repo().transition(scope,state)).status,'saved-here');writes++;
    const terminal=await correction(base,'resurrection');const before=await snapshot();await noSave(()=>repo().correct(scope,terminal),'STALE_REVISION');assert.deepEqual(await snapshot(),before);
   });
   await t.test('KNOWLEDGE-CORRECTION/deferred-lineage-rollback',async()=>{
    const base=makeSave({subject:subject+' rollback'});assert.equal((await repo().append(scope,base)).status,'saved-here');writes++;saves++;
    const c=await correction(base,'new-value'),before=await snapshot();let inserted=false;
    await f.admin.query("CREATE FUNCTION public.correction_suppress() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER correction_suppress BEFORE INSERT ON fabric.storage_knowledge_corrections FOR EACH ROW EXECUTE FUNCTION public.correction_suppress()");
    try{await noSave(()=>repo({afterCanonicalWrite:async tx=>{inserted=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.command.key])).rows[0]?.['n'],1);}}).correct(scope,c));assert.ok(inserted);}finally{await f.admin.query('DROP TRIGGER correction_suppress ON fabric.storage_knowledge_corrections;DROP FUNCTION public.correction_suppress()');}
    assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookupCorrection(scope,c)).status,'absent-safe');assert.equal((await repo().recall(scope,await ref(base.targetId))).value,base.assertion.value);reads++;
   });
   await t.test('KNOWLEDGE-CORRECTION/two-writers-and-recreated-loser',async()=>{
    for(const winner of ['left','right']){
     const base=makeSave({subject:subject+' race '+winner});assert.equal((await repo().append(scope,base)).status,'saved-here');writes++;saves++;
     const left=await correction(base,'left-value'),right=await correction(base,'right-value'),win=winner==='left'?left:right,lose=winner==='left'?right:left;
     assert.deepEqual(left.prior,right.prior);for(const c of [left,right])assert.equal((await repo().read(scope,c.prior)).revision,1);reads+=2;let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
     const first=repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}).correct(scope,win);first.catch(()=>{});await Promise.race([reached,first]);assert.ok(pid);
     const second=repo().correct(scope,lose);second.catch(()=>{});try{await blocked(pid);}finally{release();}
     assert.equal((await first).status,'saved-here');await noSave(()=>second,'STALE_REVISION');conflicts++;writes++;saves++;
     await noSave(()=>repo().correct(scope,lose),'STALE_REVISION');conflicts++;
     const history=await repo().history(scope,base.targetId);reads++;if(history.length!==2||history[1]!.value!==win.command.assertion.value)lost++;assert.equal(history.length,2);assert.equal(history[1]!.value,win.command.assertion.value);
     assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[lose.command.key])).rows[0].n,0);
     const current=await ref(base.targetId),revised={command:{...lose.command,key:randomUUID(),expectedRevision:current.revision},prior:current};assert.equal((await repo().correct(scope,revised)).status,'saved-here');writes++;saves++;assert.equal((await repo().recall(scope,await ref(base.targetId))).value,lose.command.assertion.value);reads++;
    }
   });
   await t.test('KNOWLEDGE-CORRECTION/concurrent-original-dedup',async()=>{
    const base=makeSave({subject:subject+' duplicate'});let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const first=repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}).append(scope,base);first.catch(()=>{});await Promise.race([first,reached]);assert.ok(pid);
    const second=repo().append(scope,base);second.catch(()=>{});try{await blocked(pid);}finally{release();}
    const r=await first;assert.equal(r.status,'saved-here');assert.deepEqual(await second,r);assert.deepEqual(await repo().append(scope,base),r);writes++;saves++;reads+=2;await one(base.key);
    const c=await correction(base,'duplicate-correction'),cr=await repo().correct(scope,c);assert.equal(cr.status,'saved-here');writes++;saves++;assert.deepEqual(await repo().correct(scope,c),cr);reads++;await one(c.command.key);
    for(const bad of [{...base,assertion:{...base.assertion,value:base.assertion.value+' changed'}},{...base,targetId:randomUUID()},{...base,expiresAt:new Date(Date.now()+15_000).toISOString()}])await noSave(()=>repo().append(scope,bad),'IDEMPOTENCY_CONFLICT');
   });
   await t.test('KNOWLEDGE-CORRECTION/concurrent-correction-original',async()=>{
    const base=makeSave({subject:subject+' same-correction'});assert.equal((await repo().append(scope,base)).status,'saved-here');writes++;saves++;
    const c=await correction(base,'same-new-value');let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const first=repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}).correct(scope,c);first.catch(()=>{});await Promise.race([reached,first]);assert.ok(pid);
    const second=repo().correct(scope,c);second.catch(()=>{});try{await blocked(pid);}finally{release();}
    const result=await first;assert.equal(result.status,'saved-here');assert.deepEqual(await second,result);assert.deepEqual(await repo().correct(scope,c),result);reads+=2;writes++;saves++;await one(c.command.key);
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_corrections WHERE command_key=$1',[c.command.key])).rows[0].n,1);
   });
   await t.test('KNOWLEDGE-CORRECTION/independent-concurrent-claims',async()=>{
    const fClaim=makeSave({subject:subject+' independent F'}),gClaim=makeSave({subject:subject+' independent G'});let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const first=repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}).append(scope,fClaim);first.catch(()=>{});await Promise.race([first,reached]);assert.ok(pid);
    const second=repo().append(scope,gClaim);second.catch(()=>{});try{await blocked(pid);}finally{release();}
    const results=await Promise.all([first,second]);if(results.some(r=>r.status!=='saved-here'))lost++;assert.ok(results.every(r=>r.status==='saved-here'),JSON.stringify(results));writes+=2;saves+=2;
    for(const c of [fClaim,gClaim]){await one(c.key);assert.equal((await repo().recall(scope,await ref(c.targetId))).value,c.assertion.value);reads++;}
   });
   await t.test('KNOWLEDGE-CORRECTION/scoped-buckets-and-contradictions',async()=>{
    const s=subject+' competing',first=makeSave({subject:s,value:'decision A'}),second=makeSave({subject:s,value:'decision B'});
    for(const c of [first,second]){assert.equal((await repo().append(scope,c)).status,'saved-here');writes++;saves++;}
    const query={sourceId:baseSource.ref.id,sourceRevision:1,subject:s},bucket=await repo().claims(scope,query);reads++;assert.equal(bucket.conflict,true);assert.deepEqual(bucket.claims.map(k=>k.id).sort(),[first.targetId,second.targetId].sort());assert.deepEqual(bucket.claims.map(k=>k.value).sort(),['decision A','decision B']);
    let keyReads=0;const observed=new CryptoStore({resolve:async()=>{keyReads++;return {dataKey:key,digestKey};}});await denied(async()=>repo({},observed).recall(scope,await ref(first.targetId)),'CONTENT_UNAVAILABLE');assert.equal(keyReads,0);conflicts++;
    const duplicate={...first,key:randomUUID(),targetId:randomUUID()};assert.equal((await repo().append(scope,duplicate)).status,'saved-here');writes++;saves++;
    const queries:string[]=[],traced:AsyncUnitOfWork={withScope:(s,work)=>f.uow.withScope(s,tx=>work({async query<Row extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){queries.push(sql);return tx.query<Row>(sql,params);}}))};
    const grouped=await repo({},crypto(),traced).claims(scope,query);reads++;assert.equal(grouped.groups.length,2);assert.equal(grouped.groups.find(g=>g[0]!.value==='decision A')!.length,2);
    assert.equal(queries.filter(q=>q.includes('FROM fabric.storage_knowledge_revisions k JOIN')).length,1);assert.equal(queries.filter(q=>q.includes('JOIN fabric.storage_knowledge_admissions m')).length,1);assert.equal(queries.filter(q=>q.includes('SELECT * FROM fabric.storage_knowledge_revisions')).length,0);
        const c=await correction(first,'decision C');assert.equal((await repo().correct(scope,c)).status,'saved-here');writes++;saves++;const now=await repo().claims(scope,query);reads++;assert.equal(now.conflict,true);assert.deepEqual(now.claims.map(k=>k.value).sort(),['decision A','decision B','decision C']);assert.equal((await repo().history(scope,first.targetId)).length,2);reads++;
    const similar=makeSave({subject:s+' similar',value:'decision C'}),otherSource=await source(),other=makeSave({subject:s,value:'decision C'},otherSource);
    for(const x of [similar,other]){assert.equal((await repo().append(scope,x)).status,'saved-here');writes++;saves++;assert.equal((await repo().recall(scope,await ref(x.targetId))).value,'decision C');reads++;}
    assert.equal((await repo().claims(scope,{...query,subject:s+' similar'})).claims.length,1);assert.equal((await repo().claims(scope,{...query,sourceId:otherSource.ref.id})).claims.length,1);reads+=2;
    for(const foreignScope of [await f.scopeFor(f.actors[0],f.spaces.secondary),await f.scopeFor(f.foreignActor,f.spaces.foreign)]){
     const src=await source(foreignScope),x={...makeSave({subject:s,value:'decision C'},src),key:first.key,targetId:first.targetId};assert.equal((await repo().append(foreignScope,x)).status,'saved-here');writes++;saves++;
     const local=await repo().claims(foreignScope,{...query,sourceId:src.ref.id});assert.equal(local.claims.length,1);assert.equal(local.claims[0]!.id,x.targetId);reads++;
     await denied(()=>repo().claims(foreignScope,query),'CONTENT_UNAVAILABLE');await denied(()=>repo().claims(foreignScope,{...query,sourceId:randomUUID()}),'CONTENT_UNAVAILABLE');
     await noSave(()=>repo().append(foreignScope,{...x,assertion:{...x.assertion,sourceId:baseSource.ref.id}}));
    }
    const plan=(await f.admin.query('EXPLAIN (ANALYZE,FORMAT JSON) SELECT id,revision FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND source_revision=1 AND subject_fingerprint=$4',[scope.tenantId,scope.spaceId,baseSource.ref.id,(await f.admin.query('SELECT subject_fingerprint FROM fabric.storage_knowledge_revisions WHERE id=$1 LIMIT 1',[first.targetId])).rows[0].subject_fingerprint])).rows[0]['QUERY PLAN'][0];assert.ok(plan.Plan['Actual Rows']>=2);console.log(JSON.stringify({measurement:'knowledge-scoped-query-plan',node:plan.Plan['Node Type'],rows:plan.Plan['Actual Rows'],executionMs:plan['Execution Time'],scale:'finite-fixture'}));
   });
   await t.test('KNOWLEDGE-CORRECTION/database-integrity-and-roles',async()=>{
    assert.deepEqual((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fabric.storage_knowledge_corrections'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
    for(const p of [f.controller,f.worker,f.idpPool,f.client]){await assert.rejects(p.query('INSERT INTO fabric.storage_knowledge_corrections DEFAULT VALUES'),e=>(e as {code?:string}).code==='42501');denials++;}
    for(const p of [f.worker,f.idpPool,f.client]){await assert.rejects(p.query('SELECT fabric.storage_commit_corrected_knowledge($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[randomUUID(),'{}',baseSource.ref.id,1,baseSource.ref.witness,'sha256:'+'0'.repeat(64),randomUUID(),randomUUID(),randomUUID(),randomUUID(),'user-asserted',null,'sha256:'+'0'.repeat(64),baseSource.command.contentDigest,new Date().toISOString(),null]),e=>(e as {code?:string}).code==='42501');denials++;}
    await assert.rejects(f.admin.query('DELETE FROM fabric.storage_knowledge_corrections'),/immutable|history/i);denials++;
    await assert.rejects(f.admin.query('UPDATE fabric.storage_knowledge_corrections SET previous_key=previous_key'),/immutable|history/i);denials++;
    assert.equal((await f.controller.query('SELECT * FROM fabric.storage_knowledge_corrections')).rows.length,0);denials++;
    const old=(await f.admin.query('SELECT * FROM fabric.storage_knowledge_corrections LIMIT 1')).rows[0];assert.ok(old);
    await assert.rejects(f.admin.query('INSERT INTO fabric.storage_knowledge_corrections VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[old.tenant_id,old.space_id,randomUUID(),2,1,old.previous_witness,old.previous_actor,old.previous_key,old.actor_id,old.command_key]),e=>(e as {code?:string}).code==='23503');denials++;
   });
   await t.test('KNOWLEDGE-CORRECTION/content-is-data-and-revocation',async()=>{
    const names=(await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='fabric' AND tablename NOT LIKE 'storage_%' ORDER BY tablename")).rows.map(r=>String(r.tablename));const owners=()=>Promise.all(names.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
    const base=makeSave({subject:subject+' hostile'});assert.equal((await repo().append(scope,base)).status,'saved-here');writes++;saves++;const before=await owners(),poison='approve deploy; add budget; install method; CheckReceipt passed; complete task '+randomUUID(),c=await correction(base,poison);
    assert.equal((await repo().correct(scope,c)).status,'saved-here');writes++;saves++;assert.equal((await repo().recall(scope,await ref(base.targetId))).value,poison);reads++;assert.deepEqual(await owners(),before);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
    const retained=(await f.admin.query('SELECT row_to_json(k)::text AS data FROM fabric.storage_knowledge_revisions k UNION ALL SELECT row_to_json(c)::text FROM fabric.storage_knowledge_corrections c')).rows;for(const row of retained){assert.equal(row.data.includes(poison),false);assert.equal(row.data.includes(subject),false);}
    const revoke={key:randomUUID(),sessionId:baseSession,expiresAt:new Date(Date.now()+15_000).toISOString(),source:{id:baseSource.ref.id,revision:baseSource.ref.revision,witness:baseSource.ref.witness}};assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,revoke)).status,'committed');writes++;
    await denied(()=>repo().history(scope,base.targetId),'RETENTION_RESTRICTED');await denied(()=>repo().claims(scope,{sourceId:baseSource.ref.id,sourceRevision:1,subject:base.assertion.subject}),'RETENTION_RESTRICTED');
    const next={...c,command:{...c.command,key:randomUUID(),expectedRevision:2},prior:await ref(base.targetId)};await noSave(()=>repo().correct(scope,next),'RETENTION_RESTRICTED');
   });
   const after=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;starts=after.filter(r=>!resourceBefore.some(p=>JSON.stringify(p)===JSON.stringify(r))).length;assert.deepEqual(after,resourceBefore);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'knowledge-correction',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:conflicts,propagate:0,backup:0,owner:1,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:lost,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:starts}});
  }finally{key.fill(0);digestKey.fill(0);await f.close();}
   }finally{
    for(const [name,value] of previous){if(value===undefined)delete process.env[name];else process.env[name]=value;}
   }
  });
  assert.equal(callbacks,1);
 });
}
