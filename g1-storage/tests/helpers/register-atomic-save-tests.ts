import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageKnowledgeSave,migrateStorageSourceContent,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest,type KnowledgeSaveHooks } from '../../src/knowledge-save.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { SourceContentRepository } from '../../src/source-content.js';
import { StorageAuthorityRepository,controlDigest } from '../../src/authority.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { demand } from '../../src/errors.js';
import type { SaveCommand } from '../../src/contracts.js';
import type { SqlTransaction } from '../../src/owners.js';
import type { ComponentTest } from './canonical-component.js';

/** Shared assertions for the fixed diagnostic and subsequent full integrations.
 * No case selector, skip, fake UoW, mock database or synthetic COMMIT outcome. */
export function registerAtomicSaveTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('ATOMIC-SAVE/behavior / source-backed canonical transaction',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const key=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})},admission=new LocalSaveAdmission();
  let saves=0,reads=0,writes=0,denials=0,duplicate=0,leaks=0,mutations=0;
  try{
   await migrateStorageSourceContent(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
   await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const crypto=()=>new CryptoStore({resolve:async()=>({dataKey:key,digestKey})});
   const repo=(hooks:KnowledgeSaveHooks={},c=crypto())=>new KnowledgeSaveRepository(f.uow,new EpochWitnessJournal(root),f.native,c,keys,admission,hooks);
   const sourceReader=new SourceContentRepository(f.uow,new StorageAuthorityRepository(journal,f.native),crypto());
   const marker='saved-decision-'+randomUUID();
   const sourceCommand=async(extra={})=>{
    const task=await f.task('maintenance'),narrative=marker+'\n決策🙂 e\u0301\u0000\r\n';
    return {schemaVersion:1 as const,action:'source' as const,sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),title:marker+' title',uri:'local:'+marker,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+55_000).toISOString(),saveReusable:true,...extra};
   };
   const legacy=await sourceCommand(),legacyResult=await repo().source(scope,legacy);demand(legacyResult.status==='source-accepted');writes++;
   const oldSources=(await f.admin.query('SELECT * FROM fabric.storage_sources ORDER BY source_id')).rows,beforeOwner=await installedOwnerSnapshot(f.admin),oldLedger=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await t.test('ATOMIC-SAVE/migration',async()=>{
    await assert.rejects(migrateStorageKnowledgeSave(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected knowledge save migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_knowledge_revisions') AS relation")).rows[0].relation,null);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldLedger);
    await migrateStorageKnowledgeSave(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageKnowledgeSave(f.admin,options);await migrateStorageSourceContent(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=13 ORDER BY version')).rows,oldLedger);
    assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_sources ORDER BY source_id')).rows,oldSources);
   });
   const tables=['storage_entities','storage_current_heads','storage_authority_epoch','storage_epoch_publications','storage_head_publications','storage_sources','storage_knowledge_revisions','storage_commands','storage_outbox','storage_save_events','storage_save_receipts'] as const;
   const snapshot=async()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n+' ORDER BY tenant_id,space_id')).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const notSaved=async(work:()=>Promise<{status:string}>)=>{const r=await work();if(r.status==='saved-here'||r.status==='source-accepted'){mutations++;}assert.equal(r.status,'not-saved');denials++;return r;};
   const denied=async(work:()=>Promise<unknown>,codes:readonly string[])=>{let caught=false;try{await work();leaks++;}catch(e){assert.ok(codes.includes(String((e as {code?:unknown}).code)),`Expected ${codes.join('/')} got ${String((e as {code?:unknown}).code)}`);caught=true;}assert.ok(caught);denials++;};
   const makeSave=(extra:Partial<SaveCommand>={}):SaveCommand=>({schemaVersion:1,action:'save',sessionId:legacy.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),assertion:{subject:marker,value:marker+' random '+randomUUID()+'\n🙂\u0000\r\n',sourceId:legacy.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.now()+20_000).toISOString(),classification:'group',intent:'assert',checkId:null},...extra});
   const knowledgeRef=async(c:SaveCommand)=>{const r=(await f.admin.query('SELECT witness FROM fabric.storage_knowledge_revisions WHERE id=$1',[c.targetId])).rows[0];demand(r);return {class:'knowledge' as const,id:c.targetId,revision:1,witness:r.witness as string};};
   await t.test('ATOMIC-SAVE/explicit-source',async()=>{
    const before=await snapshot(),c=await sourceCommand({saveReusable:false});await notSaved(()=>repo().source(scope,c));assert.deepEqual(await snapshot(),before);
    const missing={...c} as Record<string,unknown>;delete missing['saveReusable'];await notSaved(()=>repo().source(scope,missing));
    for(const bad of [{title:'fixture-secret-denied'},{uri:'fixture-retention-denied'},{narrative:'-----BEGIN PRIVATE KEY-----'},{contentDigest:'sha256:'+'0'.repeat(64)},{retentionExpiresAt:new Date(Date.now()+90_000).toISOString()}]){
     await notSaved(()=>repo().source(scope,{...c,saveReusable:true,...bad}));assert.deepEqual(await snapshot(),before);
    }
    const actual=await sourceReader.read(scope,legacyResult.source);
    assert.deepEqual({...actual,recordedAt:'<database-time>'},{schemaVersion:1,title:legacy.title,uri:legacy.uri,narrative:legacy.narrative,contentDigest:legacy.contentDigest,assertedBy:scope.actorId,recordedAt:'<database-time>'});
    assert.ok(actual.recordedAt<=oldSources[0].accepted_at.toISOString());
    reads++;
   });
   const accepted=makeSave();let acceptedResult:Awaited<ReturnType<KnowledgeSaveRepository['save']>>;
   await t.test('ATOMIC-SAVE/commit-boundary',async()=>{
    let insidePid=0;const before=await snapshot();
    acceptedResult=await repo({afterCanonicalWrite:async tx=>{
     insidePid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);
     for(const n of ['storage_knowledge_revisions','storage_save_receipts','storage_save_events','storage_commands','storage_outbox']){
      const column=n==='storage_knowledge_revisions'?'command_key':'command_key';assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.'+n+' WHERE '+column+'=$1',[accepted.key])).rows[0]?.['n'],1);
      assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+n+' WHERE '+column+'=$1',[accepted.key])).rows[0].n,0);
     }
     const anchor=(await tx.query('SELECT policy_revision,control_digest FROM fabric.storage_authority_epoch WHERE tenant_id=$1 AND space_id=$2 ORDER BY epoch DESC LIMIT 1',[scope.tenantId,scope.spaceId])).rows[0]!;
     assert.equal(await controlDigest(tx,scope.tenantId,scope.spaceId,Number(anchor['policy_revision'])),anchor['control_digest']);
     assert.deepEqual(await snapshot(),before);
    }}).save(scope,accepted);
    demand(acceptedResult.status==='saved-here');assert.equal(acceptedResult.id,accepted.targetId);assert.equal(acceptedResult.revision,1);assert.ok(insidePid);saves++;writes++;
    const receipt=(await f.admin.query('SELECT * FROM fabric.storage_save_receipts WHERE command_key=$1',[accepted.key])).rows[0];assert.equal(receipt.receipt_id,acceptedResult.receiptId);
    const event=(await f.admin.query('SELECT * FROM fabric.storage_save_events WHERE command_key=$1',[accepted.key])).rows[0];assert.equal(event.event_id,receipt.event_id);assert.equal(event.job_id,receipt.job_id);assert.equal(event.kind,'knowledge-committed');
   });
   await t.test('ATOMIC-SAVE/exact-recreated-read',async()=>{
    const ref=await knowledgeRef(accepted),actual=await repo().read(scope,ref),source=await sourceReader.read(scope,legacyResult.source);
    assert.deepEqual({...actual,recordedAt:'<database-time>'},{schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,id:accepted.targetId,revision:1,subject:accepted.assertion.subject,value:accepted.assertion.value,source:{tenantId:scope.tenantId,spaceId:scope.spaceId,sourceId:legacy.targetId,sourceTaskId:oldSources[0].source_task_id,revision:1,digest:legacy.contentDigest,audience:actual.source.audience},assertedBy:scope.actorId,recordedAt:'<database-time>',validFrom:accepted.assertion.validFrom,validUntil:null,expiresAt:accepted.assertion.expiresAt,classification:'group',status:'user-asserted',verification:null,supersedes:null});
    const audience=await f.uow.withScope(scope,tx=>new StorageAuthorityRepository(journal,f.native).currentAudience(tx,scope,actual.source.sourceTaskId));
    assert.deepEqual(actual.source.audience,{destinationSpaceId:scope.spaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest});assert.ok(actual.recordedAt>=source.recordedAt);
    assert.deepEqual(await repo().read(scope,ref),actual);assert.deepEqual(await repo().lookupSave(scope,accepted),acceptedResult!);reads+=2;
    const rows=await snapshot();assert.equal(JSON.stringify(rows).includes(marker),false);assert.equal(JSON.stringify(rows).includes(key.toString('hex')),false);assert.equal(JSON.stringify(rows).includes(digestKey.toString('hex')),false);
    await denied(()=>repo({},new CryptoStore({resolve:async()=>({dataKey:randomBytes(32),digestKey})})).read(scope,ref),['INTEGRITY_FAILED']);
    await denied(()=>repo().read(scope,{...ref,witness:'sha256:'+'0'.repeat(64)}),['STALE_REVISION']);
   });
   await t.test('ATOMIC-SAVE/partial-rollback',async()=>{
    const c=makeSave(),before=await snapshot(),anchor=await journal.current(scope.tenantId,scope.spaceId);
    const result=await notSaved(()=>repo({afterCanonicalWrite:async tx=>{
     assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');
    }}).save(scope,c));assert.equal((result as {replayAllowed?:boolean}).replayAllowed,false);assert.deepEqual(await snapshot(),before);
    assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);assert.equal((await repo().lookupSave(scope,c)).status,'absent-safe');assert.deepEqual(await journal.current(scope.tenantId,scope.spaceId),anchor);
    await denied(()=>repo().read(scope,{class:'knowledge',id:c.targetId,revision:1,witness:'sha256:'+'0'.repeat(64)}),['STALE_REVISION']);
   });
   await t.test('ATOMIC-SAVE/deferred-required-pieces',async()=>{
    // Synthetic database owner deliberately suppresses one required insertion.
    // Unmodified forward/deferred FKs reject every partial transaction during
    // insertion or real COMMIT; the receipt omission reaches deferred COMMIT.
    for(const table of ['storage_save_receipts','storage_save_events','storage_outbox']){
     const c=makeSave(),before=await snapshot();
     await f.admin.query(`CREATE FUNCTION fabric.storage_test_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
     await f.admin.query('CREATE TRIGGER storage_test_suppress BEFORE INSERT ON fabric.'+table+' FOR EACH ROW EXECUTE FUNCTION fabric.storage_test_suppress()');
     try{await notSaved(()=>repo().save(scope,c));assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookupSave(scope,c)).status,'absent-safe');}
     finally{await f.admin.query('DROP TRIGGER storage_test_suppress ON fabric.'+table);await f.admin.query('DROP FUNCTION fabric.storage_test_suppress()');}
    }
   });
   await t.test('ATOMIC-SAVE/admission-negative',async()=>{
    const c=makeSave();for(const assertion of [{...c.assertion,value:'fixture-secret-denied'},{...c.assertion,subject:'fixture-retention-denied'},{...c.assertion,classification:'personal'},{...c.assertion,intent:'registered-check',checkId:randomUUID()},{...c.assertion,intent:'propose'},{...c.assertion,expiresAt:new Date(Date.now()+90_000).toISOString()}]){
     const before=await snapshot();await notSaved(()=>repo().save(scope,{...c,assertion}));assert.deepEqual(await snapshot(),before);
    }
    for(const bad of [{...c,actorId:f.actors[1]},{...c,expectedRevision:1},{...c,assertion:{...c.assertion,verified:true}}])await notSaved(()=>repo().save(scope,bad));
    const before=await snapshot();await notSaved(()=>repo().save({...scope} as typeof scope,c));assert.deepEqual(await snapshot(),before);
    const guest=await f.scopeFor(f.actors[2]);await notSaved(()=>repo().save(guest,c));assert.deepEqual(await snapshot(),before);
   });
   await t.test('ATOMIC-SAVE/source-negative',async()=>{
    const c=makeSave(),before=await snapshot();for(const source of [{sourceId:randomUUID(),sourceRevision:1},{sourceId:legacy.targetId,sourceRevision:2}])await notSaved(()=>repo().save(scope,{...c,assertion:{...c.assertion,...source}}));
    assert.deepEqual(await snapshot(),before);const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);
    const task=await f.task('maintenance',foreign);await notSaved(()=>repo().save(foreign,{...c,sessionId:task.binding.sessionId}));assert.deepEqual(await snapshot(),before);
   });
   await t.test('ATOMIC-SAVE/roles-and-immutability',async()=>{
    for(const table of ['storage_knowledge_revisions','storage_save_receipts','storage_save_events']){
     assert.deepEqual((await f.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['fabric.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
     assert.equal((await f.controller.query('SELECT * FROM fabric.'+table)).rows.length,0);
     for(const p of [f.worker,f.idpPool,f.client])await denied(()=>p.query('SELECT * FROM fabric.'+table),['42501']);
     await denied(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);
     await denied(()=>f.admin.query('DELETE FROM fabric.'+table),['P0001']);
    }
    for(const p of [f.worker,f.idpPool,f.client])await denied(()=>p.query('SELECT fabric.storage_commit_knowledge($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[accepted.key,'{}',legacy.targetId,1,legacyResult.source.witness,'sha256:'+'0'.repeat(64),randomUUID(),randomUUID(),randomUUID(),randomUUID()]),['42501']);
    await denied(()=>f.uow.withScope(scope,tx=>tx.query('SELECT fabric.storage_commit_knowledge($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[accepted.key,'{}',legacy.targetId,1,legacyResult.source.witness,'sha256:'+'0'.repeat(64),randomUUID(),randomUUID(),randomUUID(),randomUUID()])),['23514']);
   });
   await t.test('ATOMIC-SAVE/concurrent-original',async()=>{
    const c=makeSave();let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const first=repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}).save(scope,c);first.catch(()=>{});await Promise.race([reached,first]);assert.ok(pid,'First writer reached canonical rows');
    const second=repo().save(scope,c);second.catch(()=>{});
    try{let observed=false;const deadline=Date.now()+1500;while(Date.now()<deadline){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Duplicate writer blocks on actual PG backend');assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0].n,0);}finally{release();}
    assert.equal((await first).status,'saved-here');await notSaved(()=>second);saves++;writes++;
    for(const table of ['storage_knowledge_revisions','storage_save_receipts','storage_save_events','storage_commands','storage_outbox']){const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.key])).rows[0].n;if(n!==1)duplicate++;assert.equal(n,1);}
    assert.equal((await repo().read(scope,await knowledgeRef(c))).value,c.assertion.value);reads++;
    await denied(()=>repo().lookupSave(scope,{...c,assertion:{...c.assertion,value:'different'}}),['IDEMPOTENCY_CONFLICT']);
   });
   await t.test('ATOMIC-SAVE/final-expiry',async()=>{
    const c=makeSave({expiresAt:new Date(Date.now()+700).toISOString()}),before=await snapshot();let inserted=false;
    await notSaved(()=>repo({afterCanonicalWrite:async(tx:SqlTransaction)=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0]?.['n'],1);inserted=true;await tx.query('SELECT pg_sleep(0.8)');}}).save(scope,c));assert.ok(inserted);assert.deepEqual(await snapshot(),before);assert.equal((await repo().lookupSave(scope,c)).status,'absent-safe');
   });
   await t.test('ATOMIC-SAVE/current-source-revocation',async()=>{
    const command={key:randomUUID(),sessionId:legacy.sessionId,expiresAt:new Date(Date.now()+30_000).toISOString(),source:{id:legacy.targetId,revision:1,witness:legacyResult.source.witness}};
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,command)).status,'committed');
    await denied(async()=>repo().read(scope,await knowledgeRef(accepted)),['RETENTION_RESTRICTED']);await notSaved(()=>repo().save(scope,makeSave()));
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_revisions WHERE id=$1',[accepted.targetId])).rows[0].n,1);
   });
   await t.test('ATOMIC-SAVE/postcommit-ack-gap',async()=>{
    // Fresh independent source after restriction: useful save still commits.
    const source=await sourceCommand(),sr=await repo().source(scope,source);demand(sr.status==='source-accepted');writes++;
    const base=makeSave(),input={...base,sessionId:source.sessionId,assertion:{...base.assertion,sourceId:source.targetId}},c={...input};
    let accessorReads=0;
    const result=await repo({beforeWitnessAck:async()=>{
     // Mutating the original input after authenticated COMMIT cannot change
     // the response binding or execute a newly installed caller accessor.
     Object.defineProperty(input,'key',{enumerable:true,get(){accessorReads++;throw new Error(marker+' accessor');}});
     throw new Error(marker+' ack gap');
    }}).save(scope,input);assert.equal(result.status,'unknown');assert.equal((result as {key?:string}).key,c.key);assert.equal(accessorReads,0);assert.equal((result as {replayAllowed?:boolean}).replayAllowed,false);assert.equal(JSON.stringify(result).includes(marker),false);
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0].n,1);
    await denied(async()=>repo().read(scope,await knowledgeRef(c)),['AUTHORITY_UNAVAILABLE']);assert.equal((await repo().lookupSave(scope,c)).status,'saved-here');
    assert.equal((await repo().read(scope,await knowledgeRef(c))).value,c.assertion.value);saves++;writes++;reads++;
   });
   assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'atomic-save',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicate,restrictedResurrection:0,askComputerStart:0}});
  }finally{key.fill(0);digestKey.fill(0);await f.close();}
 });
}
