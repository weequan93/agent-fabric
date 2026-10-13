import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile,readdir,mkdir,lstat,rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageArtifactPublication,migrateStorageVolumeDrafts,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CheckpointManifestSchema } from '../../src/schema.js';
import { VolumeDraftRepository,type VolumeCommand,type VolumeDraftHooks } from '../../src/volume-drafts.js';
import { ArtifactPublicationRepository,type ArtifactControlsOwner,type ArtifactValidator } from '../../src/artifact-publication.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest } from '../../src/knowledge-save.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { StagingWitnessJournal } from '../../src/staging-witness.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { demand,StorageError,FoundationError } from '../../src/errors.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import { AuthenticatedUnitOfWork } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import pg from 'pg';
import type { AsyncUnitOfWork,VerifiedScope } from '../../src/owners.js';
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const digest=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');

/** Component and full suite import these identical assertions. Real owned PG,
 * authenticated scopes/native service sessions, fsync ciphertext and recreation;
 * no case selection, skipped tests, external resources or caller validator proof. */
export function registerVolumeDraftTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('VOLUME-DRAFTS/behavior / encrypted live drafts and exact confirmed checkpoints',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
  let saves=0,reads=0,writes=0,denials=0,conflicts=0,leaks=0,mutations=0,duplicates=0,owners=0;
  try{
   await migrateStorageArtifactPublication(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const authorityRoot=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!;
   const journal=new EpochWitnessJournal(authorityRoot);await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const crypto=()=>new CryptoStore({resolve:async()=>({dataKey,digestKey})});
   async function namespace(){const path=resolve(authorityRoot.path,'w-'+createHash('sha256').update(randomUUID()).digest('hex'));await mkdir(path,{mode:0o700});const st=await lstat(path),r={...authorityRoot,path,rootId:randomUUID(),device:st.dev,inode:st.ino};await writeFile(resolve(path,'.storage-owner.json'),JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),{flag:'wx',mode:0o600});return r;}
   const root=await namespace(),witnessRoot=await namespace(),task=await f.task('maintenance'),marker='volume-secret-'+randomUUID();
   const binary=Buffer.concat([Buffer.from([0,255,254,0,128,13,10]),Buffer.from(marker+'🙂 e\u0301\r\n\u0000'),randomBytes(4096)]),later=Buffer.concat([binary,Buffer.from('\u0000C2')]);
   const commands=new Map<string,VolumeCommand>(),fingerprints=new Map<string,string>(),expiries=new Map<string,string>(),sourceExpiries=new Map<string,string>();let validatorAvailable=true;
   const controlsValue={rootId:root.rootId,generation,keyId};let current=controlsValue;
   const controls:ArtifactControlsOwner={current:async()=>current,resolve:async(_tx,s,c)=>{demand(s.tenantId===scope.tenantId&&s.spaceId===scope.spaceId,'SCOPE_MISMATCH');let expiry=expiries.get(c.key);if(!expiry){expiry=new Date(Math.min(Date.now()+59_000,c.sourceId?Date.parse(sourceExpiries.get(c.sourceId)!):Infinity)).toISOString();expiries.set(c.key,expiry);}return {...current,retentionExpiresAt:expiry};}};
   const validator:ArtifactValidator={require:async(tx,s,r)=>{
    demand(validatorAvailable,'AUTHORITY_UNAVAILABLE');const c=[...commands.values()].find(c=>r.validationId===idFor(['storage-volume-validation-v1',scope.tenantId,scope.spaceId,scope.actorId,c.key]));demand(c,'CHECK_BINDING_MISMATCH');
    demand(s.tenantId===scope.tenantId&&s.spaceId===scope.spaceId&&s.actorId===scope.actorId,'UNAUTHORIZED');
    assert.deepEqual(r.binding,{schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:idFor(['storage-volume-artifact-v1',scope.tenantId,scope.spaceId,scope.actorId,c.key]),revision:1,generation,keyId});
    const old=fingerprints.get(c.key);if(old)demand(old===r.commandFingerprint,'CHECK_BINDING_MISMATCH');else fingerprints.set(c.key,r.commandFingerprint);
    demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[c.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
   }};
   const repo=(hooks:VolumeDraftHooks={},cipher=crypto(),uow:AsyncUnitOfWork=f.uow)=>new VolumeDraftRepository(uow,new EpochWitnessJournal(authorityRoot),f.native,cipher,root,new StagingWitnessJournal(witnessRoot),controls,validator,hooks);
   const enroll=<C extends VolumeCommand>(c:C)=>{if(!commands.has(c.key))commands.set(c.key,c);return c;};
   const common=()=>({schemaVersion:1 as const,sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+45_000).toISOString()});
   const live=(patch:Partial<Extract<VolumeCommand,{action:'live-write'}>>={})=>enroll({...common(),action:'live-write' as const,filename:'../'+marker+'\u0000.txt',logicalPath:'documents/'+marker,bytes:binary.toString('base64'),...patch});
   const draft=(patch:Partial<Extract<VolumeCommand,{action:'draft'}>>={})=>enroll({...common(),action:'draft' as const,filename:'../'+marker+'\u0000.txt',logicalPath:'documents/'+marker,bytes:binary.toString('base64'),sourceId:null,baseRevision:1,...patch});
   const checkpoint=(liveIds:string[],patch:Partial<Extract<VolumeCommand,{action:'checkpoint'}>>={})=>enroll({...common(),action:'checkpoint' as const,liveIds,...patch});
   const deny=async(work:()=>Promise<unknown>,codes:readonly string[])=>{let caught=false;try{await work();leaks++;}catch(e){assert.ok(codes.includes(String((e as {code?:unknown}).code)),`Expected ${codes.join('/')} got ${String((e as {code?:unknown}).code)}`);caught=true;}assert.ok(caught);denials++;};
   const refused=async(work:()=>Promise<{status:string}>)=>{const result=await work();if(['live-written','draft-saved','checkpoint-confirmed'].includes(result.status))mutations++;assert.equal(result.status,'not-saved');denials++;return result;};
   const tables=['storage_volume_versions','storage_checkpoint_files','storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox','storage_head_publications','storage_current_heads','storage_authority_epoch','storage_epoch_publications'] as const;
   const snapshot=async()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const beforeOwner=await installedOwnerSnapshot(f.admin),prior=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
   await t.test('VOLUME-DRAFTS/migration',async()=>{
    await assert.rejects(migrateStorageVolumeDrafts(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected volume drafts migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_volume_versions') AS relation")).rows[0].relation,null);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,prior);
    await migrateStorageVolumeDrafts(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageVolumeDrafts(f.admin,options);await migrateStorageArtifactPublication(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=17 ORDER BY version')).rows,prior);owners++;
   });
   const c1=live(),d1=draft();let c1Result:Awaited<ReturnType<VolumeDraftRepository['commit']>>,d1Result:Awaited<ReturnType<VolumeDraftRepository['commit']>>;
   await t.test('VOLUME-DRAFTS/live-written-recreated-exact-bytes',async()=>{
    c1Result=await repo().writeLive(scope,c1);demand(c1Result.status==='live-written');assert.equal(c1Result.id,c1.targetId);assert.equal(c1Result.revision,1);assert.equal(c1Result.unsavedEditorWork,'not-covered');assert.equal(c1Result.lastSuccessfulCheckpoint,null);saves++;writes++;
    const r=await repo().current(scope,c1.targetId);demand(r);try{assert.ok(r.bytes.equals(binary));assert.deepEqual(r.command,c1);assert.deepEqual(r.receipt,c1Result);assert.equal(r.taskId,task.binding.taskId);assert.equal(r.runId,task.binding.runId);assert.equal(r.workerGeneration,task.binding.workerGeneration);assert.equal(r.audience.destinationSpaceId,scope.spaceId);assert.ok(r.audience.recipientActorIds.includes(scope.actorId));reads++;}finally{r.bytes.fill(0);}
    assert.deepEqual(await repo().lookup(scope,c1),c1Result);reads++;
    const largeBytes=randomBytes(600*1024),large=live({bytes:largeBytes.toString('base64')});try{const result=await repo().writeLive(scope,large);assert.equal(result.status,'live-written');saves++;writes++;const copy=await repo().current(scope,large.targetId);demand(copy);try{assert.ok(copy.bytes.equals(largeBytes));assert.deepEqual(copy.command,large);reads++;}finally{copy.bytes.fill(0);}}finally{largeBytes.fill(0);}
   });
   await t.test('VOLUME-DRAFTS/draft-saved-recreated-exact-audience',async()=>{
    d1Result=await repo().saveDraft(scope,d1);demand(d1Result.status==='draft-saved');assert.equal(d1Result.id,d1.targetId);assert.equal(d1Result.unsavedEditorWork,'not-covered');assert.equal(d1Result.lastSuccessfulCheckpoint,null);saves++;writes++;
    const r=await repo().read(scope,{kind:'draft',id:d1.targetId,revision:1}),l=await repo().current(scope,c1.targetId);demand(l);
    try{assert.ok(r.bytes.equals(binary));assert.deepEqual(r.command,d1);assert.deepEqual(r.receipt,d1Result);assert.deepEqual(r.audience,l.audience);assert.equal(r.taskId,task.binding.taskId);assert.equal(r.runId,task.binding.runId);reads+=2;}finally{r.bytes.fill(0);l.bytes.fill(0);}
    const state=await snapshot();assert.equal(JSON.stringify(state).includes(marker),false);assert.equal(JSON.stringify(state).includes(binary.toString('base64')),false);assert.equal(JSON.stringify(state).includes(dataKey.toString('hex')),false);
    assert.equal((await readdir(root.path)).some(n=>n.includes(marker)),false);
    for(const name of await readdir(root.path)){if(!name.startsWith('u-'))continue;for(const file of ['object','manifest'])assert.equal((await readFile(resolve(root.path,name,file))).includes(Buffer.from(marker)),false);}
   });
   let cp:Extract<VolumeCommand,{action:'checkpoint'}>,cpResult:Awaited<ReturnType<VolumeDraftRepository['commit']>>,c2:Extract<VolumeCommand,{action:'live-write'}>;
   await t.test('VOLUME-DRAFTS/checkpoint-confirmed-frozen-C1-excludes-live-C2',async()=>{
    cp=checkpoint([c1.targetId]);const p=await repo().prepare(scope,cp);assert.equal(p.replayAllowed,false);writes++;
    c2=live({targetId:c1.targetId,expectedRevision:1,bytes:later.toString('base64')});assert.equal((await repo().writeLive(scope,c2)).status,'live-written');saves++;writes++;
    cpResult=await repo().commit(scope,cp);demand(cpResult.status==='checkpoint-confirmed');assert.equal(cpResult.id,cp.targetId);assert.equal(cpResult.unsavedEditorWork,'not-covered');assert.ok(cpResult.lastSuccessfulCheckpoint);saves++;writes++;
    const inventory=await repo().checkpointInventory(scope,{kind:'checkpoint',id:cp.targetId,revision:1});assert.equal(inventory.confirmedAt,cpResult.lastSuccessfulCheckpoint);const manifest=CheckpointManifestSchema.parse(inventory.manifest);assert.equal(manifest.tenantId,scope.tenantId);assert.equal(manifest.spaceId,scope.spaceId);assert.equal(manifest.id,cp.targetId);assert.equal(manifest.revision,1);assert.equal(manifest.confirmedAt,inventory.confirmedAt);assert.equal(manifest.files[0]!.revision,1);assert.equal(manifest.files[0]!.objectId,(await f.admin.query("SELECT a.object_id FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(v.tenant_id,v.space_id,v.artifact_id) WHERE v.tenant_id=$1 AND v.space_id=$2 AND v.kind='live-file' AND v.id=$3 AND v.revision=1",[scope.tenantId,scope.spaceId,c1.targetId])).rows[0].object_id);assert.equal(inventory.unsavedEditorWork,'not-covered');assert.equal(inventory.files.length,1);assert.equal(inventory.files[0]!.id,c1.targetId);assert.equal(inventory.files[0]!.revision,1);assert.equal(inventory.files[0]!.byteLength,binary.length);assert.equal(inventory.files[0]!.contentDigest,digest(binary));reads++;
    const restored=await repo().read(scope,{kind:'live-file',id:inventory.files[0]!.id,revision:inventory.files[0]!.revision}),current=await repo().current(scope,c1.targetId);demand(current);
    try{assert.ok(restored.bytes.equals(binary));assert.ok(current.bytes.equals(later));assert.equal(inventory.files.some(file=>file.revision===2),false);reads+=2;}finally{restored.bytes.fill(0);current.bytes.fill(0);}
    const encryptedInventory=await repo().read(scope,{kind:'checkpoint',id:cp.targetId,revision:1});try{assert.deepEqual(encryptedInventory.command,cp);assert.equal(encryptedInventory.files.length,1);assert.equal(encryptedInventory.bytes.includes(Buffer.from(marker)),false);reads++;}finally{encryptedInventory.bytes.fill(0);}
   });
   await t.test('VOLUME-DRAFTS/stale-comparison-and-explicit-retained-variant',async()=>{
    const stale=await repo().compare(scope,{draft:{kind:'draft',id:d1.targetId,revision:1},liveId:c1.targetId});try{assert.equal(stale.stale,true);assert.equal(stale.baseRevision,1);assert.equal(stale.currentRevision,2);assert.equal(stale.sameBytes,false);assert.ok(stale.draft.bytes.equals(binary));assert.ok(stale.current?.bytes.equals(later));reads+=2;}finally{stale.draft.bytes.fill(0);stale.current?.bytes.fill(0);}
    const variant=draft();const result=await repo().retainVariant(scope,{command:variant,prior:{kind:'draft',id:d1.targetId,revision:1}});assert.equal(result.status,'draft-saved');saves++;writes++;
    const kept=await repo().read(scope,{kind:'draft',id:variant.targetId,revision:1}),original=await repo().read(scope,{kind:'draft',id:d1.targetId,revision:1});try{assert.ok(kept.bytes.equals(binary));assert.deepEqual(kept.command,variant);assert.equal(kept.command.action,'draft');assert.equal((kept.command as typeof variant).baseRevision,1);assert.ok(original.bytes.equals(binary));reads+=2;}finally{kept.bytes.fill(0);original.bytes.fill(0);}
    await deny(()=>repo().retainVariant(scope,{command:draft({bytes:later.toString('base64')}),prior:{kind:'draft',id:d1.targetId,revision:1}}),['IDEMPOTENCY_CONFLICT','INVALID_SCHEMA','CHECK_BINDING_MISMATCH']);
    const current=await repo().current(scope,c1.targetId);demand(current);try{assert.ok(current.bytes.equals(later));assert.equal(current.receipt.revision,2);reads++;}finally{current.bytes.fill(0);}
    const matching=await repo().compare(scope,{draft:{kind:'draft',id:variant.targetId,revision:1},liveId:randomUUID()});try{assert.equal(matching.stale,true);assert.equal(matching.current,null);assert.equal(matching.currentRevision,0);reads++;}finally{matching.draft.bytes.fill(0);matching.current?.bytes.fill(0);}
   });
   await t.test('VOLUME-DRAFTS/editor-memory-has-no-receipt-and-closed-input',async()=>{
    const reserved=live();const ordinary=new ArtifactPublicationRepository(f.uow,new EpochWitnessJournal(authorityRoot),f.native,crypto(),root,new StagingWitnessJournal(witnessRoot),controls,validator);
    await deny(()=>ordinary.prepare(scope,{schemaVersion:1,action:'artifact',sessionId:reserved.sessionId,key:reserved.key,targetId:idFor(['storage-volume-artifact-v1',scope.tenantId,scope.spaceId,scope.actorId,reserved.key]),expectedRevision:0,expiresAt:reserved.expiresAt,filename:'fabric-volume-v1',bytes:reserved.bytes,sourceId:null,validationId:idFor(['storage-volume-validation-v1',scope.tenantId,scope.spaceId,scope.actorId,reserved.key])}),['UNAUTHORIZED']);
    const held:Buffer[]=[];const failAfterRead:AsyncUnitOfWork={withScope:async(s,work)=>{const value=await f.uow.withScope(s,work);if(value&&typeof value==='object'&&'bytes' in value&&Buffer.isBuffer(value.bytes))held.push(value.bytes);throw new StorageError('AUTHORITY_UNAVAILABLE');}};
    await deny(()=>repo({},crypto(),failAfterRead).read(scope,{kind:'live-file',id:c1.targetId,revision:1}),['AUTHORITY_UNAVAILABLE']);assert.equal(held.length,1);assert.ok(held[0]!.equals(Buffer.alloc(held[0]!.length)));

    const before=await snapshot(),unsaved=live();assert.deepEqual(await repo().lookup(scope,unsaved),{status:'absent-safe'});reads++;
    for(const bad of [{...unsaved,editorMemory:marker},{...unsaved,rootId:root.rootId},{...unsaved,actorId:scope.actorId},{...unsaved,bytes:'AA='},{...checkpoint([c1.targetId]),liveIds:[c1.targetId,c1.targetId]}])await refused(()=>repo().commit(scope,bad));
    for(const ref of [{kind:'live-file',id:c1.targetId,revision:1,witness:'sha256:'+'0'.repeat(64)},{kind:'artifact',id:c1.targetId,revision:1},{kind:'draft',id:d1.targetId,revision:0}])await deny(()=>repo().read(scope,ref),['INVALID_SCHEMA']);
    await deny(()=>repo().checkpointInventory(scope,{kind:'draft',id:d1.targetId,revision:1}),['INVALID_SCHEMA']);
    assert.deepEqual(await snapshot(),before);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE command_key=$1',[unsaved.key])).rows[0].n,0);
   });
   await t.test('VOLUME-DRAFTS/original-idempotency-and-kind-CAS',async()=>{
    assert.deepEqual(await repo().commit(scope,c1),c1Result);assert.deepEqual(await repo().lookup(scope,d1),d1Result);assert.deepEqual(await repo().lookup(scope,cp),cpResult);reads+=3;
    // Convenience retries recover the original receipt instead of preparing or
    // recapturing new bytes (live has already advanced to C2).
    assert.deepEqual(await repo().writeLive(scope,c1),c1Result);assert.deepEqual(await repo().saveDraft(scope,d1),d1Result);assert.deepEqual(await repo().confirmCheckpoint(scope,cp),cpResult);reads+=3;
    await deny(()=>repo().lookup(scope,{...d1,bytes:later.toString('base64')}),['IDEMPOTENCY_CONFLICT','CHECK_BINDING_MISMATCH']);
    await refused(()=>repo().commit(scope,{...c1,bytes:later.toString('base64')}));
    await refused(()=>repo().writeLive(scope,live({targetId:c1.targetId,expectedRevision:0})));
    const changed=draft({targetId:d1.targetId,expectedRevision:1,baseRevision:2,bytes:later.toString('base64')});assert.equal((await repo().saveDraft(scope,changed)).status,'draft-saved');saves++;writes++;
    assert.deepEqual(await repo().saveDraft(scope,d1),d1Result);reads++;
    const old=await repo().read(scope,{kind:'draft',id:d1.targetId,revision:1}),fresh=await repo().read(scope,{kind:'draft',id:d1.targetId,revision:2});try{assert.ok(old.bytes.equals(binary));assert.ok(fresh.bytes.equals(later));reads+=2;}finally{old.bytes.fill(0);fresh.bytes.fill(0);}
    await deny(()=>repo().read(scope,{kind:'live-file',id:d1.targetId,revision:1}),['STALE_REVISION']);
   });
   await t.test('VOLUME-DRAFTS/personal-group-guest-foreign-ownership-denied',async()=>{
    const before=await snapshot(),guest=await f.scopeFor(f.actors[2]),member=await f.scopeFor(f.actors[1]),personal=await f.scopeFor(f.actors[0],f.spaces.personal),foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);
    for(const s of [personal,foreign])await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
    for(const s of [guest,member,personal,foreign,{...scope} as VerifiedScope])await refused(()=>repo().commit(s,live({targetId:c1.targetId,expectedRevision:2})));
    let decrypts=0;const cipher=new CryptoStore({resolve:async()=>{decrypts++;return {dataKey,digestKey};}});
    for(const s of [personal,foreign,{...scope} as VerifiedScope])await deny(()=>repo({},cipher).read(s,{kind:'draft',id:d1.targetId,revision:1}),['UNAUTHORIZED','SCOPE_MISMATCH','STALE_REVISION','STALE_AUTHORITY']);assert.equal(decrypts,0);assert.deepEqual(await snapshot(),before);
   });
   await t.test('VOLUME-DRAFTS/concurrent-original-one-effect-and-live-CAS',async()=>{
    const same=live(),p=await repo().prepare(scope,same);assert.equal(p.replayAllowed,false);writes++;
    let reached!:()=>void,release!:()=>void,pid=0;const ready=new Promise<void>(r=>reached=r),hold=new Promise<void>(r=>release=r);
    const one=repo({afterArtifactWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached();await hold;}}).commit(scope,same);one.catch(()=>{});await Promise.race([ready,one]);assert.ok(pid);
    const two=repo().commit(scope,same);two.catch(()=>{});
    try{let blocked=false;for(let i=0;i<120;i++){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(blocked,'Exact duplicate blocks on actual original owner');}finally{release();await Promise.allSettled([one,two]);}
    const result=await one;assert.equal(result.status,'live-written');assert.deepEqual(await two,result);saves++;writes++;conflicts++;
    for(const table of ['storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox']){const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[same.key])).rows[0].n;if(n!==1)duplicates++;assert.equal(n,1);}
    const left=live({targetId:same.targetId,expectedRevision:1,bytes:Buffer.from('left').toString('base64')}),right=live({targetId:same.targetId,expectedRevision:1,bytes:Buffer.from('right').toString('base64')});
    await Promise.all([repo().prepare(scope,left),repo().prepare(scope,right)]);writes+=2;const results=await Promise.all([repo().commit(scope,left),repo().commit(scope,right)]);assert.equal(results.filter(r=>r.status==='live-written').length,1);assert.equal(results.filter(r=>r.status==='not-saved').length,1);saves++;writes++;denials++;conflicts++;
    const winner=results[0]!.status==='live-written'?left:right,loser=winner===left?right:left;assert.deepEqual(await repo().lookup(scope,loser),{status:'absent-safe'});reads++;
    const head=await repo().current(scope,same.targetId);demand(head);try{assert.ok(head.bytes.equals(Buffer.from(winner.bytes,'base64')));assert.equal(head.receipt.revision,2);reads++;}finally{head.bytes.fill(0);}
   });
   await t.test('VOLUME-DRAFTS/logical-and-artifact-atomic-rollback',async()=>{
    const c=live();await repo().prepare(scope,c);writes++;const before=await snapshot();let entered=false;
    await refused(()=>repo({afterArtifactWrite:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_volume_versions WHERE command_key=$1',[c.key])).rows[0]?.['n'],1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_volume_versions WHERE command_key=$1',[c.key])).rows[0].n,0);entered=true;await tx.query('SELECT 1/0');}}).commit(scope,c));
    assert.ok(entered);assert.deepEqual(await snapshot(),before);assert.deepEqual(await repo().lookup(scope,c),{status:'absent-safe'});reads++;
    assert.equal((await repo().commit(scope,c)).status,'live-written');saves++;writes++;
    for(const table of ['storage_volume_versions','storage_checkpoint_files']){
     const suppressed=table==='storage_volume_versions'?live():checkpoint([c1.targetId]);await repo().prepare(scope,suppressed);writes++;const intact=await snapshot();
     await f.admin.query('CREATE FUNCTION fabric.storage_volume_test_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$');await f.admin.query('CREATE TRIGGER storage_volume_test_suppress BEFORE INSERT ON fabric.'+table+' FOR EACH ROW EXECUTE FUNCTION fabric.storage_volume_test_suppress()');
     try{await refused(()=>repo().commit(scope,suppressed));assert.deepEqual(await snapshot(),intact);assert.deepEqual(await repo().lookup(scope,suppressed),{status:'absent-safe'});reads++;}
     finally{await f.admin.query('DROP TRIGGER storage_volume_test_suppress ON fabric.'+table);await f.admin.query('DROP FUNCTION fabric.storage_volume_test_suppress()');}
     assert.deepEqual(await snapshot(),intact);
    }
   });
   await t.test('VOLUME-DRAFTS/actual-lost-COMMIT-ACK-original-recovery',async()=>{
    // Observe the real publication UoW through its transactional write hook.
    // Private byte recovery has several read transactions; intercepting one of
    // their COMMITs would not qualify uncertain publication recovery.
    const calibration=live();await repo().prepare(scope,calibration);writes++;let calls=0,publicationCall=0;
    const counted:AsyncUnitOfWork={withScope:async(s,work)=>{calls++;return f.uow.withScope(s,work);}};
    assert.equal((await repo({afterArtifactWrite:async()=>{publicationCall=calls;}},crypto(),counted).commit(scope,calibration)).status,'live-written');assert.ok(publicationCall>0);saves++;writes++;
    const c=live();await repo().prepare(scope,c);writes++;
    const wire=await startCommitWireProxy(f.fixtureDsn('controller'),'commit'),pool=new pg.Pool({connectionString:wire.dsn,max:1,connectionTimeoutMillis:2000});
    const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
    const backend=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});let routedCalls=0,typed=0,actualWrite=false;
    const routed:AsyncUnitOfWork={withScope:async(s,work)=>{const selected=++routedCalls===publicationCall?backend:f.uow;try{return await selected.withScope(s,work);}catch(e){if(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')typed++;throw e;}}};
    try{
     const result=await repo({afterArtifactWrite:async()=>{assert.equal(routedCalls,publicationCall);actualWrite=true;}},crypto(),routed).commit(scope,c);
     assert.ok(actualWrite);assert.equal(typed,1);assert.equal(wire.dropped(),1);assert.equal(result.status,'unknown');assert.equal((result as {key?:string}).key,c.key);assert.equal((result as {replayAllowed?:boolean}).replayAllowed,false);
     assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_volume_versions WHERE command_key=$1',[c.key])).rows[0].n,1);
     await deny(()=>repo().read(scope,{kind:'live-file',id:c.targetId,revision:1}),['AUTHORITY_UNAVAILABLE']);
     const recovered=await repo().lookup(scope,c);assert.equal(recovered.status,'live-written');assert.deepEqual(await repo().lookup(scope,c),recovered);reads+=2;saves++;writes++;
     const value=await repo().read(scope,{kind:'live-file',id:c.targetId,revision:1});try{assert.ok(value.bytes.equals(binary));assert.deepEqual(value.command,c);reads++;}finally{value.bytes.fill(0);}
     for(const table of ['storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.key])).rows[0].n,1);
    }finally{await pool.end();await wire.close();}
   });
   await t.test('VOLUME-DRAFTS/exact-checkpoint-byte-and-current-control-rechecks',async()=>{
    const row=(await f.admin.query('SELECT a.upload_id FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON a.id=v.artifact_id WHERE v.id=$1 AND v.revision=1',[c1.targetId])).rows[0];demand(row);const path=resolve(root.path,'u-'+String(row.upload_id),'object'),missing=path+'.missing',original=await readFile(path);
    await rename(path,missing);try{await deny(()=>repo().checkpointInventory(scope,{kind:'checkpoint',id:cp.targetId,revision:1}),['ARTIFACT_NOT_COMMITTED','CONTENT_UNAVAILABLE']);await deny(()=>repo().read(scope,{kind:'live-file',id:c1.targetId,revision:1}),['ARTIFACT_NOT_COMMITTED','CONTENT_UNAVAILABLE']);}finally{await rename(missing,path);}
    const bad={...JSON.parse(original.toString()),tag:Buffer.alloc(16).toString('base64')};await writeFile(path,JSON.stringify(bad));try{await deny(()=>repo().checkpointInventory(scope,{kind:'checkpoint',id:cp.targetId,revision:1}),['INTEGRITY_FAILED']);}finally{await writeFile(path,original);}
    // Only reproducible fixture content is faulted. The separately witnessed
    // command/outbox/current head still names C2; missing its logical index must
    // refuse current(), never select the older C1 that remains recoverable.
    const missingIndex=(await f.admin.query('SELECT * FROM fabric.storage_volume_versions WHERE id=$1 AND revision=2',[c1.targetId])).rows[0];demand(missingIndex);const intact=await snapshot(),fault=await f.admin.connect();
    try{
     await fault.query('BEGIN');await fault.query('ALTER TABLE fabric.storage_volume_versions DISABLE TRIGGER ALL');await fault.query('DELETE FROM fabric.storage_volume_versions WHERE id=$1 AND revision=2',[c1.targetId]);await fault.query('ALTER TABLE fabric.storage_volume_versions ENABLE TRIGGER ALL');await fault.query('COMMIT');
     await deny(()=>repo().current(scope,c1.targetId),['AUTHORITY_UNAVAILABLE']);await deny(()=>repo().checkpointInventory(scope,{kind:'checkpoint',id:cp.targetId,revision:1}),['AUTHORITY_UNAVAILABLE']);
    }finally{
     await fault.query('ROLLBACK');const columns=Object.keys(missingIndex);await fault.query('INSERT INTO fabric.storage_volume_versions('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(missingIndex));fault.release();
    }assert.deepEqual(await snapshot(),intact);
    for(const changed of [{column:'id',value:randomUUID()},{column:'kind',value:'draft'}]){
     const corrupted=await f.admin.connect();
     try{
      await corrupted.query('BEGIN');await corrupted.query('ALTER TABLE fabric.storage_volume_versions DISABLE TRIGGER ALL');await corrupted.query('UPDATE fabric.storage_volume_versions SET '+changed.column+'=$1 WHERE artifact_id=$2',[changed.value,missingIndex['artifact_id']]);await corrupted.query('ALTER TABLE fabric.storage_volume_versions ENABLE TRIGGER ALL');await corrupted.query('COMMIT');
      // The altered row still names the independently witnessed C2 artifact.
      // Selecting C1 from MAX(revision) would silently lose the latest write.
      await deny(()=>repo().current(scope,c1.targetId),['AUTHORITY_UNAVAILABLE']);await deny(()=>repo().read(scope,{kind:'live-file',id:c1.targetId,revision:1}),['AUTHORITY_UNAVAILABLE']);
     }finally{
      await corrupted.query('ROLLBACK');await corrupted.query('BEGIN');await corrupted.query('ALTER TABLE fabric.storage_volume_versions DISABLE TRIGGER ALL');await corrupted.query('UPDATE fabric.storage_volume_versions SET '+changed.column+'=$1 WHERE artifact_id=$2',[missingIndex[changed.column],missingIndex['artifact_id']]);await corrupted.query('ALTER TABLE fabric.storage_volume_versions ENABLE TRIGGER ALL');await corrupted.query('COMMIT');corrupted.release();
     }assert.deepEqual(await snapshot(),intact);
    }
    const c=live();await repo().prepare(scope,c);writes++;const before=await snapshot();validatorAvailable=false;try{await refused(()=>repo().commit(scope,c));}finally{validatorAvailable=true;}
    for(const changed of [{...controlsValue,keyId:randomUUID()},{...controlsValue,generation:randomUUID()},{...controlsValue,rootId:randomUUID()}]){current=changed;try{await refused(()=>repo().commit(scope,c));}finally{current=controlsValue;}}
    assert.deepEqual(await snapshot(),before);assert.equal((await repo().checkpointInventory(scope,{kind:'checkpoint',id:cp.targetId,revision:1})).files[0]!.revision,1);reads++;
   });
   await t.test('VOLUME-DRAFTS/source-revocation-blocks-recreated-draft',async()=>{
    const narrative=marker+' source',sourceCommand={schemaVersion:1,action:'source',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),title:marker,uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};
    sourceExpiries.set(sourceCommand.targetId,sourceCommand.retentionExpiresAt);const source=await new KnowledgeSaveRepository(f.uow,journal,f.native,crypto(),{resolve:async()=>({keyId,generation})},new LocalSaveAdmission()).source(scope,sourceCommand);demand(source.status==='source-accepted');writes++;
    const c=draft({sourceId:sourceCommand.targetId});assert.equal((await repo().saveDraft(scope,c)).status,'draft-saved');saves++;writes++;
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,{key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),source:{id:sourceCommand.targetId,revision:1,witness:source.source.witness}})).status,'committed');writes++;
    await deny(()=>repo().read(scope,{kind:'draft',id:c.targetId,revision:1}),['RETENTION_RESTRICTED']);await refused(()=>repo().saveDraft(scope,draft({sourceId:sourceCommand.targetId})));
   });
   await t.test('VOLUME-DRAFTS/native-stop-denies-writes-preserves-eligible-read',async()=>{
    const stopTask=await f.task('maintenance'),c=live({sessionId:stopTask.binding.sessionId});assert.equal((await repo().writeLive(scope,c)).status,'live-written');saves++;writes++;
    const before=await f.native.snapshot(scope,stopTask.binding.sessionId);await f.native.stop(scope,{sessionId:stopTask.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+20_000).toISOString(),observedRevision:before.revision});writes++;
    const stopped=await f.native.snapshot(scope,stopTask.binding.sessionId);assert.equal(stopped.stopped,true);
    await refused(()=>repo().writeLive(scope,live({sessionId:stopTask.binding.sessionId,targetId:c.targetId,expectedRevision:1})));
    const r=await repo().read(scope,{kind:'live-file',id:c.targetId,revision:1});try{assert.ok(r.bytes.equals(binary));reads++;}finally{r.bytes.fill(0);}
    assert.deepEqual(await f.native.snapshot(scope,stopTask.binding.sessionId),stopped);
   });
   await t.test('VOLUME-DRAFTS/forced-RLS-immutable-history',async()=>{
    for(const table of ['storage_volume_versions','storage_checkpoint_files']){
     assert.deepEqual((await f.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['fabric.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});assert.equal((await f.controller.query('SELECT * FROM fabric.'+table)).rows.length,0);
     for(const pool of [f.worker,f.client,f.idpPool])await deny(()=>pool.query('SELECT * FROM fabric.'+table),['42501']);await deny(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);await deny(()=>f.admin.query('DELETE FROM fabric.'+table),['P0001']);
    }assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);owners++;
   });
   observe({schemaVersion:1,measurement:'storage-observations',suite:'volume-drafts',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:conflicts,propagate:0,backup:0,owner:owners,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:0}});
   binary.fill(0);later.fill(0);
  }finally{dataKey.fill(0);digestKey.fill(0);await f.close();}
 });
}
