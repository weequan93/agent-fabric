import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile,readdir,mkdir,lstat,rename,symlink,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageKnowledgeCorrection,migrateStorageArtifactPublication,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { ArtifactPublicationRepository,type ArtifactCommand,type ArtifactHooks,type ArtifactControlsOwner,type ArtifactValidator } from '../../src/artifact-publication.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest } from '../../src/knowledge-save.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { StagingWitnessJournal } from '../../src/staging-witness.js';
import { OwnedCipherFiles } from '../../src/owned-cipher-files.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { AuthenticatedStagingPreparation,type StagingMaterial } from '../../src/staging-preparation.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import { BindingSchema,ArtifactCommandSchema,FileManifestSchema } from '../../src/schema.js';
import { demand } from '../../src/errors.js';
import { killCipherProcess } from './kill-cipher-process.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import { AuthenticatedUnitOfWork,type AsyncUnitOfWork,type VerifiedScope } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import pg from 'pg';
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};

/** Fixed wrapper and full K suite import the same real assertions, with no
 * selected case IDs or skipped tests. Fresh owned PG + filesystem + IdP only. */
export function registerArtifactPublicationTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('ARTIFACT-PUBLICATION/behavior / durable immutable bytes and orphan custody',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})};
  let saves=0,reads=0,writes=0,denials=0,conflicts=0,leaks=0,mutations=0,duplicate=0,owners=0;
  try{
   await migrateStorageKnowledgeCorrection(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const authorityRoot=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!;
   const journal=new EpochWitnessJournal(authorityRoot);await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const crypto=()=>new CryptoStore({resolve:async()=>({dataKey,digestKey})});
   const task=await f.task('maintenance'),marker='artifact-private-'+randomUUID(),binary=Buffer.concat([Buffer.from([0,255,254,0,128,13,10]),Buffer.from(marker+'🙂 e\u0301\r\n\u0000'),randomBytes(8192)]);
   const sourceCommand={schemaVersion:1,action:'source',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),title:marker,uri:null,narrative:marker,contentDigest:sourceNarrativeDigest(marker),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};
   const source=await new KnowledgeSaveRepository(f.uow,journal,f.native,crypto(),keys,new LocalSaveAdmission()).source(scope,sourceCommand);demand(source.status==='source-accepted');writes++;
   const prior=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,oldSource=(await f.admin.query('SELECT * FROM fabric.storage_sources ORDER BY source_id')).rows,beforeOwner=await installedOwnerSnapshot(f.admin);
   async function namespace(){const path=resolve(authorityRoot.path,'w-'+createHash('sha256').update(randomUUID()).digest('hex'));await mkdir(path,{mode:0o700});const st=await lstat(path),r={...authorityRoot,path,rootId:randomUUID(),device:st.dev,inode:st.ino};await writeFile(resolve(path,'.storage-owner.json'),JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),{flag:'wx',mode:0o600});return r;}
   const witnessRoot=await namespace();
   const deny=async(work:()=>Promise<unknown>,codes:readonly string[])=>{let caught=false;try{await work();leaks++;}catch(e){assert.ok(codes.includes(String((e as {code?:unknown}).code)),`Expected ${codes.join('/')} got ${String((e as {code?:unknown}).code)}`);caught=true;}assert.ok(caught);denials++;};
   const refused=async(work:()=>Promise<{status:string}>)=>{const r=await work();if(r.status==='artifact-committed')mutations++;assert.equal(r.status,'not-saved');denials++;return r;};
   const tables=['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox','storage_head_publications','storage_current_heads','storage_authority_epoch','storage_epoch_publications'] as const;
   const snapshot=async()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n+' ORDER BY tenant_id,space_id')).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   await t.test('ARTIFACT-PUBLICATION/migration',async()=>{
    await assert.rejects(migrateStorageArtifactPublication(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected artifact publication migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_artifact_versions') AS relation")).rows[0].relation,null);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,prior);
    await migrateStorageArtifactPublication(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageArtifactPublication(f.admin,options);await migrateStorageKnowledgeCorrection(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);
    assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=16 ORDER BY version')).rows,prior);
    assert.deepEqual((await f.admin.query('SELECT * FROM fabric.storage_sources ORDER BY source_id')).rows,oldSource);owners++;
   });
   async function setup(withSource=false,s:VerifiedScope=scope,deadlineMs=30_000){
    const root=await namespace(),native=s===scope?task:await f.task('maintenance',s),c:ArtifactCommand=ArtifactCommandSchema.parse({schemaVersion:1,action:'artifact',sessionId:native.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+deadlineMs).toISOString(),filename:'../'+marker+'\u0000.txt',bytes:binary.toString('base64'),sourceId:withSource?sourceCommand.targetId:null,validationId:randomUUID()});
    const binding=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'artifact',id:c.targetId,revision:1,generation,keyId});
    const originalControls={rootId:root.rootId,generation,keyId,retentionExpiresAt:new Date(Math.min(Date.now()+55_000,withSource?Date.parse(sourceCommand.retentionExpiresAt):Infinity)).toISOString()};
    let current=originalControls,validatorAvailable=true;
    const controls:ArtifactControlsOwner={current:async()=>({rootId:current.rootId,keyId:current.keyId,generation:current.generation}),resolve:async()=>current};
    const commandBytes=Buffer.from(JSON.stringify(c));let fingerprint:string;try{fingerprint=await crypto().fingerprint(binding,'command',commandBytes);}finally{commandBytes.fill(0);}
    const validator:ArtifactValidator={require:async(tx,sc,request)=>{
     demand(validatorAvailable,'AUTHORITY_UNAVAILABLE');demand(sc.tenantId===s.tenantId&&sc.spaceId===s.spaceId&&sc.actorId===s.actorId,'UNAUTHORIZED');
     demand(request.validationId===c.validationId&&request.commandFingerprint===fingerprint&&JSON.stringify(request.binding)===JSON.stringify(binding),'CHECK_BINDING_MISMATCH');
     demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[c.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');
    }};
    const repo=(hooks:ArtifactHooks={},cipher=crypto(),uow:AsyncUnitOfWork=f.uow)=>new ArtifactPublicationRepository(uow,new EpochWitnessJournal(authorityRoot),f.native,cipher,root,new StagingWitnessJournal(witnessRoot),controls,validator,hooks);
    const stage=async(hooks:ArtifactHooks={})=>{const p=await repo(hooks).prepare(s,c);assert.equal(p.replayAllowed,false);writes++;return p.uploadId;};
    const ref=async()=>{const r=(await f.admin.query('SELECT witness FROM fabric.storage_artifact_versions WHERE id=$1',[c.targetId])).rows[0];demand(r);return {class:'artifact' as const,id:c.targetId,revision:1,witness:String(r.witness)};};
    return {root,c,s,binding,native,originalControls,repo,stage,ref,set:(value:typeof current)=>{current=value;},setValidator:(value:boolean)=>{validatorAvailable=value;},materialId:idFor(['storage-artifact-material-v1',s.tenantId,s.spaceId,s.actorId,c.key])};
   }
   const retained=async(s:Awaited<ReturnType<typeof setup>>,id:string)=>Promise.all(['object','manifest'].map(n=>readFile(resolve(s.root.path,'u-'+id,n))));
   let saved:Awaited<ReturnType<typeof setup>>,savedUpload:string;
   await t.test('ARTIFACT-PUBLICATION/atomic-publication',async()=>{
    saved=await setup(true);savedUpload=await saved.stage();const bytes=await retained(saved,savedUpload),before=await snapshot();let pid=0;
    await deny(()=>saved.repo().read(scope,{class:'artifact',id:saved.c.targetId,revision:1,witness:'sha256:'+'0'.repeat(64)}),['STALE_REVISION']);
    const result=await saved.repo({afterArtifactWrite:async tx=>{
     pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);
     for(const n of ['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox']){
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.'+n+' WHERE command_key=$1',[saved.c.key])).rows[0]?.['n'],1);
      assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+n+' WHERE command_key=$1',[saved.c.key])).rows[0].n,0);
     }assert.deepEqual(await snapshot(),before);
    }}).commit(scope,saved.c);
    demand(result.status==='artifact-committed');assert.equal(result.unsavedEditorWork,'not-covered');assert.equal(result.lastSuccessfulCheckpoint,null);assert.ok(pid);saves++;writes++;
    assert.deepEqual(await retained(saved,savedUpload),bytes);assert.deepEqual(await saved.repo().lookup(scope,saved.c),result);reads++;
    assert.deepEqual(await saved.repo().collect(scope),{removed:0,protected:1});
    const row=(await f.admin.query('SELECT * FROM fabric.storage_artifact_versions WHERE id=$1',[saved.c.targetId])).rows[0];assert.equal(row.upload_id,savedUpload);assert.equal(row.object_id,saved.materialId);
    await deny(()=>saved.repo().prepare(scope,saved.c),['IDEMPOTENCY_CONFLICT']);
   });
   await t.test('ARTIFACT-PUBLICATION/recreated-exact-binary-and-manifest',async()=>{
    const result=await saved.repo().read(scope,await saved.ref());try{assert.ok(result.bytes.equals(binary));assert.equal(result.manifest.filename,saved.c.filename);assert.equal(result.manifest.logicalPath,saved.c.filename);assert.equal(result.manifest.source?.sourceId,sourceCommand.targetId);assert.equal(result.manifest.validationId,saved.c.validationId);assert.equal(result.manifest.entry.byteLength,binary.length);reads++;}finally{result.bytes.fill(0);}
    assert.equal((await readdir(saved.root.path)).some(n=>n.includes(marker)),false);
    const state=await snapshot();assert.equal(JSON.stringify(state).includes(marker),false);assert.equal(JSON.stringify(state).includes(dataKey.toString('hex')),false);assert.equal(JSON.stringify(state).includes(digestKey.toString('hex')),false);
    for(const bytes of await retained(saved,savedUpload))assert.equal(bytes.includes(Buffer.from(marker)),false);
   });
   await t.test('ARTIFACT-PUBLICATION/integrity-negatives',async()=>{
    for(const name of ['object','manifest']){
     const path=resolve(saved.root.path,'u-'+savedUpload,name),original=await readFile(path),envelope=JSON.parse(original.toString());
     for(const changed of [{...envelope,tag:Buffer.alloc(16).toString('base64')},{...envelope,id:randomUUID()},{...envelope,generation:randomUUID()}]){
      try{await writeFile(path,JSON.stringify(changed));await deny(async()=>saved.repo().read(scope,await saved.ref()),['INTEGRITY_FAILED']);}finally{await writeFile(path,original);}
     }
     const absent=path+'.missing';await rename(path,absent);try{await deny(async()=>saved.repo().read(scope,await saved.ref()),['ARTIFACT_NOT_COMMITTED']);}finally{await rename(absent,path);}
    }
    await deny(async()=>saved.repo({},new CryptoStore({resolve:async()=>({dataKey:randomBytes(32),digestKey})})).read(scope,await saved.ref()),['INTEGRITY_FAILED']);
    await deny(async()=>saved.repo().read(scope,{...await saved.ref(),revision:2}),['STALE_REVISION']);
    const good=await saved.repo().read(scope,await saved.ref());try{assert.ok(good.bytes.equals(binary));reads++;}finally{good.bytes.fill(0);}
   });
   await t.test('ARTIFACT-PUBLICATION/current-source-revocation-and-membership',async()=>{
    const revocation={key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),source:{id:sourceCommand.targetId,revision:1,witness:source.source.witness}};
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,revocation)).status,'committed');writes++;
    await deny(async()=>saved.repo().read(scope,await saved.ref()),['RETENTION_RESTRICTED']);await deny(()=>saved.repo().prepare(scope,{...saved.c,key:randomUUID(),targetId:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString()}),['RETENTION_RESTRICTED']);
    assert.deepEqual(await saved.repo().collect(scope),{removed:0,protected:1});
    const s=await setup(),id=await s.stage();assert.equal((await s.repo().commit(scope,s.c)).status,'artifact-committed');saves++;writes++;
    const kept=await retained(s,id),member=await f.scopeFor(f.actors[1]);let unauthorizedDecrypts=0;
    const cipher=new CryptoStore({resolve:async()=>{unauthorizedDecrypts++;return {dataKey,digestKey};}});
    await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[scope.tenantId,scope.spaceId,f.actors[1]]);
    await deny(async()=>s.repo({},cipher).read(member,await s.ref()),['UNAUTHORIZED','STALE_AUTHORITY']);assert.equal(unauthorizedDecrypts,0);
    const content=await s.repo().read(scope,await s.ref());try{assert.ok(content.bytes.equals(binary));reads++;}finally{content.bytes.fill(0);}
    assert.deepEqual(await retained(s,id),kept);
   });
   await t.test('ARTIFACT-PUBLICATION/schema-validation-and-scope',async()=>{
    const s=await setup(),before=await snapshot();
    for(const bad of [{...s.c,expectedRevision:1},{...s.c,rootId:s.root.rootId},{...s.c,actorId:scope.actorId},{...s.c,bytes:'AA='},{...s.c,validationId:randomUUID()}])await refused(()=>s.repo().commit(scope,bad));
    await refused(()=>s.repo().commit({...scope} as VerifiedScope,s.c));
    const guest=await f.scopeFor(f.actors[2]);await refused(()=>s.repo().commit(guest,s.c));
    const foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign);await refused(()=>s.repo().commit(foreign,s.c));
    const personal=await f.scopeFor(f.actors[0],f.spaces.personal);await refused(()=>s.repo().commit(personal,s.c));
    assert.deepEqual(await snapshot(),before);
    await s.stage();await refused(()=>s.repo().commit(scope,{...s.c,filename:'changed'}));assert.deepEqual(await snapshot(),before);
    s.setValidator(false);await refused(()=>s.repo().commit(scope,s.c));s.setValidator(true);
    for(const changed of [{...s.originalControls,generation:randomUUID()},{...s.originalControls,keyId:randomUUID()},{...s.originalControls,rootId:randomUUID()}]){s.set(changed);await refused(()=>s.repo().commit(scope,s.c));}s.set(s.originalControls);
    s.set({...s.originalControls,generation:randomUUID()});await deny(()=>s.repo().collect(scope),['SCOPE_MISMATCH']);
    s.set(s.originalControls);assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    for(const kind of ['bytes','description'] as const){
     const bad=await setup(),material:StagingMaterial={binding:bad.binding,rootId:bad.root.rootId,commandKey:bad.c.key,sessionId:bad.c.sessionId,sourceTaskId:task.binding.taskId,expiresAt:bad.c.expiresAt};
     const control=new AuthenticatedStagingPreparation(f.uow,new StorageAuthorityRepository(journal,f.native),scope,{resolve:async()=>material},bad.materialId,new StagingWitnessJournal(witnessRoot));
     const actual=kind==='bytes'?Buffer.from('authentic wrong binary'):binary;
     const correctDescription=FileManifestSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,id:bad.c.targetId,revision:1,generation,
      filename:bad.c.filename,logicalPath:bad.c.filename,entry:{id:bad.c.targetId,revision:1,objectId:bad.materialId,byteLength:binary.length,contentDigest:'sha256:'+createHash('sha256').update(binary).digest('hex')},source:null,base:null,validationId:bad.c.validationId});
     const description=kind==='description'?{...correctDescription,filename:'authentic wrong manifest'}:correctDescription;
     const upload=await new OwnedCipherFiles(bad.root,crypto(),control).stage(bad.binding,actual,JSON.stringify(description));writes++;
     const proof=await new OwnedCipherFiles(bad.root,crypto(),control).verifyConfirmation(upload,bad.binding);assert.ok(proof.objectSize>0&&proof.manifestSize>0);reads++;
     const rejected=await refused(()=>bad.repo().commit(scope,bad.c));assert.equal((rejected as {error?:string}).error,'IDEMPOTENCY_CONFLICT');
     assert.equal((await bad.repo().lookup(scope,bad.c)).status,'absent-safe');assert.deepEqual(await bad.repo().collect(scope),{removed:0,protected:1});
    }
    assert.deepEqual(await snapshot(),before);
   });
   await t.test('ARTIFACT-PUBLICATION/partial-publication-rollback',async()=>{
    const s=await setup(),id=await s.stage(),bytes=await retained(s,id),before=await snapshot();let inserted=false;
    await refused(()=>s.repo({afterArtifactWrite:async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_artifact_receipts WHERE command_key=$1',[s.c.key])).rows[0]?.['n'],1);inserted=true;await tx.query('SELECT 1/0');}}).commit(scope,s.c));
    assert.ok(inserted);assert.deepEqual(await snapshot(),before);assert.equal((await s.repo().lookup(scope,s.c)).status,'absent-safe');
    assert.deepEqual(await retained(s,id),bytes);assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    await s.repo().recovery(scope,s.c).abandon(id);assert.deepEqual(await s.repo().collect(scope),{removed:1,protected:0});writes++;
   });
   await t.test('ARTIFACT-PUBLICATION/deferred-required-evidence',async()=>{
    for(const table of ['storage_artifact_receipts','storage_artifact_events','storage_outbox']){
     const s=await setup(),id=await s.stage(),before=await snapshot();await f.admin.query('CREATE FUNCTION fabric.storage_artifact_test_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$');
     await f.admin.query('CREATE TRIGGER storage_artifact_test_suppress BEFORE INSERT ON fabric.'+table+' FOR EACH ROW EXECUTE FUNCTION fabric.storage_artifact_test_suppress()');
     try{await refused(()=>s.repo().commit(scope,s.c));assert.deepEqual(await snapshot(),before);assert.equal((await s.repo().lookup(scope,s.c)).status,'absent-safe');assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});}
     finally{await f.admin.query('DROP TRIGGER storage_artifact_test_suppress ON fabric.'+table);await f.admin.query('DROP FUNCTION fabric.storage_artifact_test_suppress()');}
     await s.repo().recovery(scope,s.c).abandon(id);assert.equal((await s.repo().collect(scope)).removed,1);writes++;
    }
   });
   await t.test('ARTIFACT-PUBLICATION/concurrent-original-and-collector',async()=>{
    async function blocked(pid:number){let observed=false;for(let i=0;i<120;i++){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Exact competing owner is blocked on the actual transaction');}
    // GC waits for publication, then observes its unresolved independent epoch.
    // A second gate fixes that ACK window; no retry may turn it into a GC permit.
    const s=await setup(),id=await s.stage(),bytes=await retained(s,id);
    let reached!:()=>void,release!:()=>void,ack!:()=>void,pid=0;
    const hit=new Promise<void>(r=>reached=r),gate=new Promise<void>(r=>release=r),ackGate=new Promise<void>(r=>ack=r);
    const first=s.repo({afterArtifactWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached();await gate;},beforeWitnessAck:async()=>ackGate}).commit(scope,s.c);first.catch(()=>{});
    await Promise.race([hit,first]);assert.ok(pid);
    const gc=deny(()=>s.repo().collect(scope),['AUTHORITY_UNAVAILABLE']);gc.catch(()=>{});
    try{await blocked(pid);release();await gc;assert.deepEqual(await retained(s,id),bytes);}finally{release();ack();await Promise.allSettled([first,gc]);}
    assert.equal((await first).status,'artifact-committed');saves++;writes++;assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    // Independently fix the exact duplicate-writer order; both recover one receipt.
    const duplicateSetup=await setup(),duplicateId=await duplicateSetup.stage(),duplicateBytes=await retained(duplicateSetup,duplicateId);
    let entered!:()=>void,unlock!:()=>void,writerPid=0;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>unlock=r);
    const one=duplicateSetup.repo({afterArtifactWrite:async tx=>{writerPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);entered();await hold;}}).commit(scope,duplicateSetup.c);one.catch(()=>{});await Promise.race([ready,one]);assert.ok(writerPid);
    const two=duplicateSetup.repo().commit(scope,duplicateSetup.c);two.catch(()=>{});
    try{await blocked(writerPid);}finally{unlock();await Promise.allSettled([one,two]);}
    const winner=await one;demand(winner.status==='artifact-committed');assert.deepEqual(await two,winner);saves++;writes++;conflicts++;
    for(const table of ['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox']){const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[duplicateSetup.c.key])).rows[0].n;if(n!==1)duplicate++;assert.equal(n,1);}
    await deny(()=>duplicateSetup.repo().lookup(scope,{...duplicateSetup.c,bytes:Buffer.from('different').toString('base64')}),['IDEMPOTENCY_CONFLICT']);
    assert.deepEqual(await retained(duplicateSetup,duplicateId),duplicateBytes);
   });
   await t.test('ARTIFACT-PUBLICATION/fsync-process-interruption',async()=>{
    const s=await setup(),material:StagingMaterial={binding:s.binding,rootId:s.root.rootId,commandKey:s.c.key,sessionId:s.c.sessionId,sourceTaskId:task.binding.taskId,expiresAt:s.c.expiresAt};
    const control=new AuthenticatedStagingPreparation(f.uow,new StorageAuthorityRepository(journal,f.native),scope,{resolve:async()=>material},s.materialId,new StagingWitnessJournal(witnessRoot));
    let phaseObserved=false;
    const id=await killCipherProcess(control,{root:s.root,binding:s.binding,value:binary,description:s.c.filename,operation:'stage',stopAt:'object-fsynced'},async(upload,pid)=>{
     assert.ok(pid>1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_reservations WHERE upload_id=$1',[upload])).rows[0].n,1);
     assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_confirmations WHERE upload_id=$1',[upload])).rows[0].n,0);
     assert.ok((await readdir(resolve(s.root.path,'u-'+upload))).some(n=>n.startsWith('.part-')));phaseObserved=true;
    });assert.ok(phaseObserved);writes++;
    await refused(()=>s.repo().commit(scope,s.c));assert.equal((await s.repo().lookup(scope,s.c)).status,'absent-safe');assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    await s.repo().recovery(scope,s.c).abandon(id);assert.deepEqual(await s.repo().collect(scope),{removed:1,protected:0});
   });
   await t.test('ARTIFACT-PUBLICATION/pg-process-publication-interruption',async()=>{
    const s=await setup(),id=await s.stage(),before=await snapshot(),bytes=await retained(s,id);let terminated=false;
    const pool=new pg.Pool({connectionString:f.fixtureDsn('controller'),max:1,connectionTimeoutMillis:2000});
    const transport=(e:Error)=>assert.ok(e.message==='Connection terminated unexpectedly'||(e as {code?:string}).code==='57P01');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
    const backend=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});let calls=0;
    const uow:AsyncUnitOfWork={withScope:async(sc,work)=>(++calls===2?backend:f.uow).withScope(sc,work)};
    try{await refused(()=>s.repo({afterArtifactWrite:async tx=>{const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);assert.ok(pid);assert.equal((await f.admin.query('SELECT pg_terminate_backend($1) AS stopped',[pid])).rows[0].stopped,true);terminated=true;}},crypto(),uow).commit(scope,s.c));
     assert.ok(terminated);assert.deepEqual(await snapshot(),before);assert.equal((await s.repo().lookup(scope,s.c)).status,'absent-safe');assert.deepEqual(await retained(s,id),bytes);assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    }finally{await pool.end();}
   });
   await t.test('ARTIFACT-PUBLICATION/unknown-commit-and-recreated-lookup',async()=>{
    const s=await setup(),id=await s.stage(),wire=await startCommitWireProxy(f.fixtureDsn('controller'),'commit');
    const pool=new pg.Pool({connectionString:wire.dsn,max:1,connectionTimeoutMillis:2000});const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
    const wireUow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});let calls=0;
    const uow:AsyncUnitOfWork={withScope:async(sc,work)=>(++calls===2?wireUow:f.uow).withScope(sc,work)};
    try{
     const result=await s.repo({},crypto(),uow).commit(scope,s.c);assert.equal(result.status,'unknown');assert.equal((result as {key?:string}).key,s.c.key);assert.equal((result as {replayAllowed?:boolean}).replayAllowed,false);assert.equal(wire.dropped(),1);
     assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_artifact_receipts WHERE command_key=$1',[s.c.key])).rows[0].n,1);
     await deny(async()=>s.repo().read(scope,await s.ref()),['AUTHORITY_UNAVAILABLE']);
     const recovered=await s.repo().lookup(scope,s.c);demand(recovered.status==='artifact-committed');reads++;saves++;writes++;
     const content=await s.repo().read(scope,await s.ref());try{assert.ok(content.bytes.equals(binary));reads++;}finally{content.bytes.fill(0);}
     assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});assert.equal((await s.repo().recovery(scope,s.c).outcome()).status,'consumed');
     await deny(()=>s.repo().recovery(scope,s.c).abandon(id),['ARTIFACT_NOT_COMMITTED']);
    }finally{await pool.end();await wire.close();}
    const pending=await setup(),upload=await pending.stage(),before=await retained(pending,upload),blocker=await f.admin.connect();
    let lookup:Promise<Awaited<ReturnType<ArtifactPublicationRepository['lookup']>>>|undefined;
    try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',scope.tenantId,scope.spaceId,scope.actorId,pending.c.key])]);
     const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);lookup=pending.repo().lookup(scope,pending.c);lookup.catch(()=>{});
     let observed=false;for(let i=0;i<120;i++){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Actual original-key lookup blocks on the nondigest namespace');
     const uncertain=await lookup;assert.equal(uncertain.status,'unknown');assert.equal((uncertain as {key?:string}).key,pending.c.key);assert.equal((uncertain as {replayAllowed?:boolean}).replayAllowed,false);reads++;
    }finally{await blocker.query('ROLLBACK');blocker.release();await lookup?.catch(()=>{});}
    assert.deepEqual(await pending.repo().lookup(scope,pending.c),{status:'absent-safe'});reads++;
    assert.deepEqual(await pending.repo().collect(scope),{removed:0,protected:1});assert.deepEqual(await retained(pending,upload),before);
   });
   await t.test('ARTIFACT-PUBLICATION/orphan-lease-quarantine-and-unowned',async()=>{
    const s=await setup(),id=await s.stage(),bytes=await retained(s,id);assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});assert.deepEqual(await retained(s,id),bytes);
    await s.repo().recovery(scope,s.c).abandon(id);let quarantined=false;
    await deny(()=>s.repo({files:{phase:async phase=>{if(phase==='quarantined'){quarantined=true;throw new Error('Synthetic GC interruption');}}}}).collect(scope),['CLEANUP_UNPROVEN']);
    assert.ok(quarantined);assert.deepEqual((await readdir(resolve(s.root.path,'q-'+id))).sort(),['manifest','object']);
    const sentinel=resolve(s.root.path,'q-'+id,'unowned');await writeFile(sentinel,marker);await deny(()=>s.repo().collect(scope),['CLEANUP_UNPROVEN']);assert.equal(await readFile(sentinel,'utf8'),marker);await unlink(sentinel);
    assert.deepEqual(await s.repo().collect(scope),{removed:1,protected:0});writes++;
    const own=await setup(),unknown=randomUUID(),path=resolve(own.root.path,'u-'+unknown);await mkdir(path);await writeFile(resolve(path,'object'),marker);
    await deny(()=>own.repo().collect(scope),['CLEANUP_UNPROVEN']);assert.equal(await readFile(resolve(path,'object'),'utf8'),marker);
    const symlinkId=randomUUID();await symlink(path,resolve(own.root.path,'u-'+symlinkId));await deny(()=>own.repo().collect(scope),['CLEANUP_UNPROVEN']);assert.equal(await readFile(resolve(path,'object'),'utf8'),marker);
   });
   await t.test('ARTIFACT-PUBLICATION/expired-unknown-operation-protected',async()=>{
    const s=await setup(false,scope,2000),id=await s.stage(),bytes=await retained(s,id);
    const material:StagingMaterial={binding:s.binding,rootId:s.root.rootId,commandKey:s.c.key,sessionId:s.c.sessionId,sourceTaskId:task.binding.taskId,expiresAt:s.c.expiresAt};
    const interrupted=new AuthenticatedStagingPreparation(f.uow,new StorageAuthorityRepository(journal,f.native),scope,{resolve:async()=>material},s.materialId,new StagingWitnessJournal(witnessRoot),{afterAbandonment:async tx=>{await tx.query('SELECT 1/0');}});
    await deny(()=>interrupted.recovery().abandon(id),['CONTENT_UNAVAILABLE']);
    const state=await new StagingWitnessJournal(witnessRoot).state(scope.tenantId,scope.spaceId,scope.actorId,s.c.key);assert.ok(state.intent);assert.equal(state.terminal,undefined);
    let expired=false;for(let i=0;i<250;i++){const row=(await f.admin.query('SELECT expires_at<=clock_timestamp() AND lease_until<=clock_timestamp() AS expired FROM fabric.storage_staging_reservations WHERE upload_id=$1',[id])).rows[0];if(row.expired){expired=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(expired,'The real database clock observes both original command and lease expiry');
    await interrupted.recovery().control.lock(id,async lease=>{const live=await lease.current();assert.equal(live.unknown,true);assert.equal(live.pending,true);assert.equal(live.reachable,false);assert.ok(live.leaseUntil<=live.observedAt);});
    assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});assert.deepEqual(await retained(s,id),bytes);
    await refused(()=>s.repo().commit(scope,s.c));writes++;
   });
   await t.test('ARTIFACT-PUBLICATION/posteffect-validator-and-manifest-refusal',async()=>{
    for(const kind of ['validator','bytes','root','generation','spoof'] as const){
     const s=await setup(),id=await s.stage(),before=await snapshot(),bytes=await retained(s,id),markerPath=resolve(s.root.path,'.storage-owner.json'),ownerMarker=await readFile(markerPath);let entered=false;
     try{await refused(()=>s.repo({afterArtifactWrite:async()=>{entered=true;if(kind==='validator')s.setValidator(false);else if(kind==='bytes')await writeFile(resolve(s.root.path,'u-'+id,'manifest'),'{}');else if(kind==='root')await writeFile(markerPath,'{}');else if(kind==='generation')s.set({...s.originalControls,generation:randomUUID()});else throw Object.assign(new Error('Synthetic ordinary error'),{code:'UNKNOWN_COMMIT'});}}).commit(scope,s.c));assert.ok(entered);assert.deepEqual(await snapshot(),before);}
     finally{s.setValidator(true);s.set(s.originalControls);await writeFile(markerPath,ownerMarker);await writeFile(resolve(s.root.path,'u-'+id,'manifest'),bytes[1]!);assert.equal((await s.repo().lookup(scope,s.c)).status,'absent-safe');}
     assert.deepEqual(await retained(s,id),bytes);assert.deepEqual(await s.repo().collect(scope),{removed:0,protected:1});
    }
   });
   await t.test('ARTIFACT-PUBLICATION/native-stop-retained-read',async()=>{
    const ownTask=await f.task('maintenance'),s=await setup(),changed={...s.c,sessionId:ownTask.binding.sessionId};
    // Re-enroll an independent exact validator because session is immutable in
    // the command fingerprint. This setup's original validator cannot approve
    // a changed binding; use a separate setup native scope below instead.
    await deny(()=>s.repo().prepare(scope,changed),['CHECK_BINDING_MISMATCH']);
    const stopScope=await f.scopeFor(f.actors[0],f.spaces.lifecycle);
    await journal.install(stopScope.tenantId,stopScope.spaceId,a.anchors.get(a.key(stopScope))!);
    const fresh=await setup(false,stopScope),id=await fresh.stage();assert.equal((await fresh.repo().commit(stopScope,fresh.c)).status,'artifact-committed');saves++;writes++;
    const before=await f.native.snapshot(stopScope,fresh.c.sessionId);await f.native.stop(stopScope,{sessionId:fresh.c.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+20_000).toISOString(),observedRevision:before.revision});
    const stopped=await f.native.snapshot(stopScope,fresh.c.sessionId);assert.equal(stopped.stopped,true);
    await refused(()=>fresh.repo().commit(stopScope,fresh.c));await deny(()=>fresh.repo().prepare(stopScope,fresh.c),['STALE_FENCE']);
    const content=await fresh.repo().read(stopScope,await fresh.ref());try{assert.ok(content.bytes.equals(binary));reads++;}finally{content.bytes.fill(0);}
    assert.deepEqual(await fresh.repo().collect(stopScope),{removed:0,protected:1});await deny(()=>fresh.repo().recovery(stopScope,fresh.c).abandon(id),['ARTIFACT_NOT_COMMITTED']);assert.deepEqual(await f.native.snapshot(stopScope,fresh.c.sessionId),stopped);
   });
   await t.test('ARTIFACT-PUBLICATION/forced-rls-narrow-function-and-history',async()=>{
    for(const table of ['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events']){
     assert.deepEqual((await f.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['fabric.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
     assert.equal((await f.controller.query('SELECT * FROM fabric.'+table)).rows.length,0);
     for(const pool of [f.worker,f.client,f.idpPool])await deny(()=>pool.query('SELECT * FROM fabric.'+table),['42501']);
     await deny(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);await deny(()=>f.admin.query('DELETE FROM fabric.'+table),['P0001']);
    }
    for(const pool of [f.worker,f.client,f.idpPool])await deny(()=>pool.query('SELECT fabric.storage_commit_artifact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[saved.c.key,savedUpload,randomUUID(),randomUUID(),null,null,null,randomUUID(),randomUUID(),randomUUID(),randomUUID()]),['42501']);
    await deny(()=>f.uow.withScope(scope,tx=>tx.query('SELECT fabric.storage_commit_artifact($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[saved.c.key,savedUpload,randomUUID(),randomUUID(),null,null,null,randomUUID(),randomUUID(),randomUUID(),randomUUID()])),['23514']);
    assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);owners++;
   });
   observe({schemaVersion:1,measurement:'storage-observations',suite:'artifact-publication',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:conflicts,propagate:0,backup:0,owner:owners,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicate,restrictedResurrection:0,askComputerStart:0}});
   binary.fill(0);
  }finally{dataKey.fill(0);digestKey.fill(0);await f.close();}
 });
}
