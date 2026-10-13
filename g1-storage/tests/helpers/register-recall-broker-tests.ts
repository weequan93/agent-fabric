import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes,randomUUID } from 'node:crypto';
import type { ComponentTest } from './canonical-component.js';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { exerciseQueryControls } from './register-query-controls-tests.js';
import { emitObservations } from './observations.js';
import { migrateStorageKnowledgeSave,migrateStorageQueryControls,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest } from '../../src/knowledge-save.js';
import { KnowledgeStatusAdmission } from '../../src/knowledge-status.js';
import { QueryControlsRepository } from '../../src/query-controls.js';
import { SourceRecallBroker,type RecallAttachmentOwner,type RecallIndexOwner } from '../../src/recall-broker.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { TombstonePublicationRepository } from '../../src/tombstone-publication.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { demand } from '../../src/errors.js';
import type { SaveCommand,CipherBinding } from '../../src/contracts.js';
import type { VerifiedScope,SqlTransaction,AsyncUnitOfWork } from '../../src/owners.js';

/** Repository-only diagnostic; full recall/Ask imports these exact assertions.
 * No generator is installed or invoked. Each positive consumes random persisted
 * canonical bytes, each negative observes actual CryptoStore.open calls. */
export function registerRecallBrokerTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('RECALL-BROKER/behavior / current canonical eligibility before decrypt',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const key=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})};
  let reads=0,writes=0,saves=0,denials=0,opens=0,leaks=0,mutations=0,lost=0,duplicates=0,starts=0;
  const makeCrypto=()=>{const c=new CryptoStore({resolve:async()=>({dataKey:key,digestKey})}),open=c.open.bind(c);c.open=async(...args)=>{opens++;return open(...args);};return c;};
  try{
   await migrateStorageKnowledgeSave(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
   const personal=await f.scopeFor(f.actors[0],f.spaces.personal),secondary=await f.scopeFor(f.actors[0],f.spaces.secondary),foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);
   for(const s of [scope,personal,secondary,foreign])await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
   const authority=new StorageAuthorityRepository(journal,f.native),crypto=makeCrypto(),admission=new KnowledgeStatusAdmission(crypto);
   const repo=(c=makeCrypto(),uow:AsyncUnitOfWork=f.uow)=>new KnowledgeSaveRepository(uow,journal,f.native,c,keys,new KnowledgeStatusAdmission(c));
   const controls=new QueryControlsRepository(f.uow,authority),ask=await f.task('ask'),maintenance=await f.task('maintenance');
   let revision=0;
   const flags=async(attachments=false,olderRecall=true,saveReusable=false)=>{const r=await controls.set(scope,{schemaVersion:1,action:'query-controls',sessionId:ask.binding.sessionId,targetId:ask.binding.sessionId,key:randomUUID(),expectedRevision:revision,expiresAt:new Date(Date.now()+40_000).toISOString(),controls:{attachments,olderRecall,saveReusable}});revision=r.revision;return r;};
   const grants=new Set<string>();let attachmentCalls=0;
   const attachments:RecallAttachmentOwner={assert:async(_tx,_s,session,ids)=>{attachmentCalls++;demand(session.binding.sessionId===ask.binding.sessionId&&ids.every(id=>grants.has(id)),'UNAUTHORIZED');}};
   let indexState:unknown=undefined,indexCalls=0;
   const index:RecallIndexOwner={inspect:async()=>{indexCalls++;if(!indexState)throw new Error('private-index-error-'+randomUUID());return indexState;}};
   const broker=(auth=authority,c=makeCrypto(),k=keys,uow:AsyncUnitOfWork=f.uow)=>new SourceRecallBroker(uow,auth,c,k,new KnowledgeStatusAdmission(c),repo(c,uow),controls,attachments,index);
   const request=(selector:unknown,attachmentIds:string[]=[])=>({sessionId:ask.binding.sessionId,expiresAt:new Date(Date.now()+35_000).toISOString(),selector,attachmentIds});
   const newSource=async(s=scope,sessionId=maintenance.binding.sessionId,retentionMs=58_000)=>{
    const narrative='source-'+randomUUID();const c={schemaVersion:1,action:'source',sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+45_000).toISOString(),title:'private-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+retentionMs).toISOString(),saveReusable:true};
    const r=await repo().source(s,c);assert.equal(r.status,'source-accepted',JSON.stringify(r));demand(r.status==='source-accepted');writes++;return {c,ref:r.source};
   };
   const save=async(source:Awaited<ReturnType<typeof newSource>>,extra:Partial<SaveCommand['assertion']>={},s=scope)=>{
    const c:SaveCommand={schemaVersion:1,action:'save',sessionId:source.c.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),assertion:{subject:'decision-'+randomUUID(),value:'A-'+randomUUID()+' 🙂',sourceId:source.ref.id,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(source.c.retentionExpiresAt)-1000).toISOString(),classification:s.spaceId===personal.spaceId?'personal':'group',intent:'assert',checkId:null,...extra}};
    const r=await repo().save(s,c);assert.equal(r.status,c.assertion.intent==='propose'?'pending-review':'saved-here',JSON.stringify(r));writes++;if(r.status==='saved-here')saves++;return c;
   };
   const ref=async(id:string)=>{const r=(await f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];demand(r);return {class:'knowledge' as const,id,revision:Number(r.revision),witness:String(r.witness)};};
   const get=async(b:SourceRecallBroker,c:unknown,s=scope)=>{const r=await b.retrieve(s,c);reads+=r.records.length;return r;};
   const denied=async(work:()=>Promise<unknown>,codes:string[]=[])=>{const before=opens;let caught=false;try{await work();leaks++;}catch(e){caught=true;if(codes.length)assert.ok(codes.includes(String((e as {code?:string}).code)),String((e as {code?:string}).code));}assert.ok(caught);assert.equal(opens,before,'denied before opening ciphertext');denials++;};
   const gap=async(c:unknown,b=broker())=>{const before=opens,r=await get(b,c);if(r.records.length)leaks++;assert.equal(r.status,'evidence-gap');assert.deepEqual(r.records,[]);assert.ok(r.limitations.includes('current-evidence-gap'));assert.equal(opens,before);denials++;return r;};
   const ownerBefore=await installedOwnerSnapshot(f.admin);
   const noEffect=async()=>Promise.all(['storage_knowledge_revisions','storage_save_receipts','model_operations','model_resource_bindings','model_computer_assignments'].map(async name=>[name,(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+name)).rows[0].n]));
   const legacySource=await newSource(),legacy:SaveCommand={schemaVersion:1,action:'save',sessionId:maintenance.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),assertion:{subject:'legacy-'+randomUUID(),value:'legacy-future-'+randomUUID(),sourceId:legacySource.ref.id,sourceRevision:1,validFrom:new Date(Date.now()+20_000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(legacySource.c.retentionExpiresAt)-1000).toISOString(),classification:'group',intent:'assert',checkId:null}};
   assert.equal((await new KnowledgeSaveRepository(f.uow,journal,f.native,crypto,keys,new LocalSaveAdmission()).save(scope,legacy)).status,'saved-here');saves++;writes++;
   await t.test('RECALL-BROKER/build-migration',async()=>{
    await assert.rejects(migrateStorageQueryControls(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected query controls migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_query_controls') AS r")).rows[0].r,null);
    await migrateStorageQueryControls(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageQueryControls(f.admin,options);assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);await flags();
   });
   await t.test('RECALL-BROKER/registration-preservation',async()=>{
    const guard=await import(pathToFileURL(resolve(f.root,'g1-storage/scripts/recall-registration.mjs')).href),source=await readFile(resolve(f.root,'g1-storage/scripts/manifest.mjs'),'utf8');
    assert.equal(guard.assertRecallRegistration().onlyPinChanged,'scripts/manifest.mjs');
    for(const bad of [source.replace('"C01/roundtrip"','"C01/weakened"'),source+'\n// unregistered extension',source.replace('"recall-broker":','"dynamic-recall":')])assert.throws(()=>guard.assertAdditiveRegistry(bad));
   });
   await t.test('RECALL-BROKER/legacy-validity-metadata-unavailable',async()=>{await gap(request({kind:'id',value:legacy.targetId}));assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_admissions WHERE id=$1',[legacy.targetId])).rows[0].n,0);});
   await t.test('RECALL-BROKER/persisted-random-recreated-correction',async()=>{
    const source=await newSource(),c=await save(source),r=broker(),id=request({kind:'id',value:c.targetId});
    for(const selector of [{kind:'id',value:c.targetId},{kind:'subject',value:c.assertion.subject},{kind:'tail',limit:64}]){const result=await get(r,request(selector));assert.equal(result.status,'eligible');assert.ok(result.records.some(k=>k.id===c.targetId&&k.value===c.assertion.value));assert.ok(result.limitations.includes('index-unavailable'));}
    assert.equal((await get(broker(),id)).records[0]!.value,c.assertion.value);
    const prior=await ref(c.targetId),newValue='B-'+randomUUID()+' 漢字',corrected={command:{...c,action:'correct' as const,key:randomUUID(),expectedRevision:1,expiresAt:new Date(Date.now()+30_000).toISOString(),assertion:{...c.assertion,value:newValue}},prior};
    assert.equal((await repo().correct(scope,corrected)).status,'saved-here');saves++;writes++;
    indexState={epoch:1,watermark:1,refs:[prior]};
    for(const b of [r,broker()]){const result=await get(b,id);if(result.records[0]?.value!==newValue)lost++;assert.equal(result.records[0]!.value,newValue);assert.equal(result.selected[0]!.ref.revision,2);assert.ok(result.limitations.includes('index-lag'));}
    const result=await get(broker(),request({kind:'subject',value:c.assertion.subject}));assert.equal(result.records[0]!.value,newValue);assert.equal(result.selected[0]!.reason,'exact-subject');
    const retained=(await f.admin.query("SELECT row_to_json(k)::text AS data FROM fabric.storage_knowledge_revisions k")).rows;for(const r of retained){assert.equal(r.data.includes(c.assertion.subject),false);assert.equal(r.data.includes(c.assertion.value),false);assert.equal(r.data.includes(newValue),false);}indexState=undefined;
   });
   await t.test('RECALL-BROKER/status-validity-conflict-before-decrypt',async()=>{
    const source=await newSource();
    for(const extra of [{intent:'propose' as const},{validFrom:new Date(Date.now()+30_000).toISOString()},{validFrom:new Date(Date.now()-30_000).toISOString(),validUntil:new Date(Date.now()-500).toISOString()}]){const c=await save(source,extra);await gap(request({kind:'id',value:c.targetId}));}
    for(const status of ['disputed','superseded','deleted'] as const){const c=await save(source);assert.equal((await repo().transition(scope,{schemaVersion:1,sessionId:maintenance.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),prior:await ref(c.targetId),status,checkId:null})).status,'saved-here');writes++;
     const before=opens,result=await get(broker(),request({kind:'id',value:c.targetId}));assert.equal(result.status,status==='disputed'?'disputed':'evidence-gap');assert.deepEqual(result.records,[]);assert.equal(opens,before);denials++;
    }
    const subject='contended-'+randomUUID(),left=await save(source,{subject,value:'left-'+randomUUID()}),right=await save(source,{subject,value:'right-'+randomUUID()});
    for(const selector of [{kind:'id',value:left.targetId},{kind:'id',value:right.targetId},{kind:'subject',value:subject}]){const before=opens,r=await get(broker(),request(selector));assert.equal(r.status,'disputed');assert.deepEqual(r.records,[]);assert.equal(opens,before);denials++;}
   });
   await t.test('RECALL-BROKER/tombstoned-conflict-survivor',async()=>{
    const source=await newSource(),subject='forget-conflict-'+randomUUID(),left=await save(source,{subject,value:'left-'+randomUUID()}),right=await save(source,{subject,value:'right-'+randomUUID()}),q=request({kind:'id',value:left.targetId});
    const before=opens;assert.equal((await get(broker(),q)).status,'disputed');assert.equal(opens,before);
    assert.equal((await new TombstonePublicationRepository(f.uow,journal,f.native).forget(scope,{key:randomUUID(),sessionId:maintenance.binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),entity:await ref(right.targetId)})).status,'committed');writes++;
    assert.equal((await get(broker(),q)).records[0]!.value,left.assertion.value);await gap(request({kind:'id',value:right.targetId}));
   });
   await t.test('RECALL-BROKER/empty-outcome-final-authority',async()=>{
    for(const disputed of [false,true]){
     let value:string=randomUUID();if(disputed){const source=await newSource(),c=await save(source);value=c.targetId;assert.equal((await repo().transition(scope,{schemaVersion:1,sessionId:maintenance.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+25_000).toISOString(),prior:await ref(value),status:'disputed',checkId:null})).status,'saved-here');writes++;}
     let missing=false,calls=0;const auth=new StorageAuthorityRepository({current:async(t,s)=>missing?undefined:journal.current(t,s)},f.native);
     const owner={read:async(tx:SqlTransaction,s:VerifiedScope,id:string)=>{const r=await controls.read(tx,s,id);if(++calls===2)missing=true;return r;}};
     const c=makeCrypto(),b=new SourceRecallBroker(f.uow,auth,c,keys,new KnowledgeStatusAdmission(c),repo(c),owner,attachments,index);
     await denied(()=>b.retrieve(scope,request({kind:'id',value})),['AUTHORITY_UNAVAILABLE']);assert.equal(calls,2);
    }
   });
   await t.test('RECALL-BROKER/source-expiry-during-index-wait',async()=>{
    const source=await newSource(scope,maintenance.binding.sessionId,4000),c=await save(source),before=opens;
    const waiting:RecallIndexOwner={inspect:async tx=>{const remaining=Number((await tx.query('SELECT greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.03 AS remaining',[source.c.retentionExpiresAt])).rows[0]?.['remaining']);await tx.query('SELECT pg_sleep($1)',[remaining]);return {epoch:0,watermark:0,refs:[]};}};
    const crypto=makeCrypto(),b=new SourceRecallBroker(f.uow,authority,crypto,keys,new KnowledgeStatusAdmission(crypto),repo(crypto),controls,attachments,waiting);
    await gap(request({kind:'id',value:c.targetId}),b);assert.equal(opens,before);
   });
   await t.test('RECALL-BROKER/independent-eight-controls-and-attachment-grants',async()=>{
    const source=await newSource(),c=await save(source);grants.add(c.targetId);
    for(let n=0;n<8;n++){
     const attachment=!!(n&4),recall=!!(n&2),saveReusable=!!(n&1);await flags(attachment,recall,saveReusable);
     const before=await noEffect(),r=await get(broker(),request({kind:'id',value:c.targetId},[c.targetId]));assert.equal(r.status,attachment||recall?'eligible':'evidence-gap');assert.equal(r.records.length,attachment||recall?1:0);assert.deepEqual(await noEffect(),before);
     const noAttachment=await get(broker(),request({kind:'id',value:c.targetId}));assert.equal(noAttachment.records.length,recall?1:0);
    }
    await flags(true,false,false);grants.delete(c.targetId);await denied(()=>broker().retrieve(scope,request({kind:'id',value:c.targetId},[c.targetId])),['UNAUTHORIZED']);assert.ok(attachmentCalls>0);
    await flags(false,true,false);assert.equal((await get(broker(),request({kind:'id',value:c.targetId},[c.targetId]))).records[0]!.value,c.assertion.value);
    const before=await noEffect();await denied(()=>broker().exportToPersonal(scope,{sessionId:ask.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),destinationSpaceId:personal.spaceId}),['REQUIRED_CAPABILITY_UNSUPPORTED']);assert.deepEqual(await noEffect(),before);
   });
   await t.test('RECALL-BROKER/index-tail-overlay-and-canonical-scan',async()=>{
    const source=await newSource(),c=await save(source);indexState={epoch:0,watermark:0,refs:[]};
    const tail=await get(broker(),request({kind:'tail',limit:1}));assert.equal(tail.records.length,1);assert.equal(tail.records[0]!.id,c.targetId);assert.ok(tail.limitations.includes('index-lag'));assert.equal(tail.indexWatermark,0);
    indexState=undefined;const exact=await get(broker(),request({kind:'id',value:c.targetId}));assert.equal(exact.records[0]!.value,c.assertion.value);assert.ok(exact.limitations.includes('index-unavailable'));assert.ok(indexCalls>0);
   });
   await t.test('RECALL-BROKER/authority-outage-and-stale-populated-cache',async()=>{
    const source=await newSource(),c=await save(source);let mode:'current'|'missing'|'stale'='current';const old=await journal.current(scope.tenantId,scope.spaceId);
    const auth=new StorageAuthorityRepository({current:async(t,s)=>mode==='missing'?undefined:mode==='stale'?old:journal.current(t,s)},f.native),b=broker(auth),q=request({kind:'id',value:c.targetId});assert.equal((await get(b,q)).records[0]!.value,c.assertion.value);
    mode='missing';await denied(()=>b.retrieve(scope,q),['AUTHORITY_UNAVAILABLE']);mode='current';assert.equal((await get(b,q)).records[0]!.value,c.assertion.value);
    await save(source);mode='stale';await denied(()=>b.retrieve(scope,q),['AUTHORITY_UNAVAILABLE']);mode='current';assert.equal((await get(b,q)).records[0]!.value,c.assertion.value);
    const before=opens,otherGeneration=randomUUID();const wrongGeneration=broker(authority,makeCrypto(),{resolve:async()=>({keyId,generation:otherGeneration})});await gap(q,wrongGeneration);assert.equal(opens,before);
   });
   await t.test('RECALL-BROKER/source-revocation-and-remaining-audience',async()=>{
    const source=await newSource(),c=await save(source),b=broker(),q=request({kind:'id',value:c.targetId});assert.equal((await get(b,q)).records[0]!.value,c.assertion.value);
    await f.admin.query('DELETE FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[scope.tenantId,scope.spaceId,f.actors[2]]);
    // A remaining member sees newly derived full audience, never stale recipients.
    const allowed=await get(b,q);assert.equal(allowed.records[0]!.value,c.assertion.value);assert.ok(!allowed.selected[0]!.audience.recipientActorIds.includes(f.actors[2]));
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,{sessionId:maintenance.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),source:{id:source.ref.id,revision:source.ref.revision,witness:source.ref.witness}})).status,'committed');writes++;await gap(q,b);
   });
   await t.test('RECALL-BROKER/scope-keyed-subject-and-session-binding',async()=>{
    const subject='same-subject-'+randomUUID(),source=await newSource(),left=await save(source,{subject}),otherTask=await f.task('maintenance',secondary),otherSource=await newSource(secondary,otherTask.binding.sessionId),right=await save(otherSource,{subject,value:'other-'+randomUUID()},secondary),otherAsk=await f.task('ask',secondary);
    await controls.set(secondary,{schemaVersion:1,action:'query-controls',sessionId:otherAsk.binding.sessionId,targetId:otherAsk.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),controls:{attachments:false,olderRecall:true,saveReusable:false}});
    const fingerprints=(await f.admin.query('SELECT subject_fingerprint FROM fabric.storage_knowledge_revisions WHERE id=ANY($1::uuid[])',[ [left.targetId,right.targetId] ])).rows;assert.notEqual(fingerprints[0].subject_fingerprint,fingerprints[1].subject_fingerprint);
    const local=await get(broker(),request({kind:'subject',value:subject}));assert.deepEqual(local.records.map(k=>k.value),[left.assertion.value]);
    const remote=await get(broker(),{...request({kind:'subject',value:subject}),sessionId:otherAsk.binding.sessionId},secondary);assert.deepEqual(remote.records.map(k=>k.value),[right.assertion.value]);
    await denied(()=>broker().retrieve(secondary,request({kind:'id',value:left.targetId})));await denied(()=>broker().retrieve(foreign,request({kind:'id',value:left.targetId})));
    for(const extra of [{spaceId:secondary.spaceId},{actorId:f.actors[1]},{payerId:scope.payerId},{generation},{controls:{olderRecall:true}},{selector:{kind:'tail',limit:65}}])await denied(()=>broker().retrieve(scope,{...request({kind:'id',value:left.targetId}),...extra}),['INVALID_SCHEMA']);
    await gap(request({kind:'id',value:right.targetId}));
   });
   await t.test('RECALL-BROKER/real-lock-wait-and-immutable-queued-request',async()=>{
    const source=await newSource(),c=await save(source),holder=await f.admin.connect();let settled=false;
    try{await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
     const q=request({kind:'id',value:c.targetId}),pending=broker().retrieve(scope,q).finally(()=>{settled=true;});pending.catch(()=>{});
     let blocked=false;const end=Date.now()+1500;while(Date.now()<end){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(blocked);assert.equal(settled,false);
     // Mutate the caller object during the actual wait. Closed parse captured
     // the original immutable request; switching a UI tab cannot retarget it.
     q.selector={kind:'id',value:randomUUID()};q.sessionId=randomUUID();await holder.query('COMMIT');const r=await pending;reads+=r.records.length;assert.equal(r.records[0]!.value,c.assertion.value);
    }finally{await holder.query('ROLLBACK');holder.release();}
   });
   const observedControls=await exerciseQueryControls(t,f,authority);reads+=observedControls.reads;writes+=observedControls.writes;denials+=observedControls.denials;
   await t.test('RECALL-BROKER/full-audience-denied-before-decrypt',async()=>{
    const source=await newSource(),c=await save(source),q=request({kind:'id',value:c.targetId}),b=broker();assert.equal((await get(b,q)).records[0]!.value,c.assertion.value);
    const actor=f.actors[1];await f.admin.query("UPDATE fabric.memberships SET revision=revision+1,grants='[]'::jsonb WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[scope.tenantId,scope.spaceId,actor]);
    await denied(()=>b.retrieve(scope,q),['AUDIENCE_DENIED']);
   });
   assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   const computers=Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n);starts=computers;assert.equal(starts,0);
   const total=(await f.admin.query('SELECT count(*)::int AS n,count(DISTINCT (tenant_id,space_id,actor_id,command_key))::int AS keys FROM fabric.storage_save_receipts')).rows[0];duplicates=total.n-total.keys;assert.equal(duplicates,0);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'recall-broker',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:1,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:lost,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:starts}});
  }finally{key.fill(0);digestKey.fill(0);await f.close();}
 });
}
