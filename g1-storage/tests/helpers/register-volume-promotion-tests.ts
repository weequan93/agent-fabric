import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile,readdir,mkdir,lstat,rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageArtifactPublication,migrateStorageVolumeDrafts,migrateStorageVolumePromotion,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
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
import { RecoveryRepository,leaseSchema } from '../../../g1-recovery/src/repository.js';
import { runSchema,sessionSchema,bindingDigest } from '../../../g1-recovery/src/contracts.js';
import { TaskCallBindingSchema } from '../../../g1-model/src/schema.js';
import type { AsyncUnitOfWork,VerifiedScope } from '../../src/owners.js';
const idFor=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const digest=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');

/** Component and full suite import these identical assertions. Real owned PG,
 * authenticated scopes/native service sessions, fsync ciphertext and recreation;
 * no case selection, skipped tests, external resources or caller validator proof. */
export function registerVolumePromotionTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('VOLUME-PROMOTION/behavior / exact validated CAS and installed writer fences',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
  let saves=0,reads=0,writes=0,denials=0,conflicts=0,leaks=0,mutations=0,duplicates=0,owners=0;
  try{
   await migrateStorageVolumeDrafts(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
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
    demand(validatorAvailable,'AUTHORITY_UNAVAILABLE');const c=[...commands.values()].find(c=>r.validationId===(c.action==='promote'?c.validationId:idFor(['storage-volume-validation-v1',scope.tenantId,scope.spaceId,scope.actorId,c.key])));demand(c,'CHECK_BINDING_MISMATCH');
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
   const refused=async(work:()=>Promise<{status:string}>)=>{const result=await work();if(['live-written','draft-saved','checkpoint-confirmed','artifact-committed'].includes(result.status))mutations++;assert.equal(result.status,'not-saved');denials++;return result;};
   const tables=['storage_volume_promotions','storage_volume_versions','storage_checkpoint_files','storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox','storage_head_publications','storage_current_heads','storage_authority_epoch','storage_epoch_publications'] as const;
   const snapshot=async()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const beforeOwner=await installedOwnerSnapshot(f.admin);
   await t.test('VOLUME-PROMOTION/migration',async()=>{
    const prior=(await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows;
    await assert.rejects(migrateStorageVolumePromotion(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected volume promotion migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_volume_promotions') AS relation")).rows[0].relation,null);assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations ORDER BY version')).rows,prior);
    await migrateStorageVolumePromotion(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageVolumePromotion(f.admin,options);await migrateStorageVolumeDrafts(f.admin,options);
    assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_storage_migrations WHERE version<=18 ORDER BY version')).rows,prior);assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);owners++;
   });

   const promote=(base:Extract<VolumeCommand,{action:'live-write'}>,d:Extract<VolumeCommand,{action:'draft'}>,patch:Partial<Extract<VolumeCommand,{action:'promote'}>>={})=>enroll({...common(),action:'promote' as const,targetId:base.targetId,expectedRevision:1,draftId:d.targetId,draftRevision:1,validationId:randomUUID(),...patch});
   async function recoverableWriter(initialized=true){
    const seed=await f.task('maintenance'),runId=randomUUID(),binding=TaskCallBindingSchema.parse({...seed.binding,runId,sessionId:randomUUID(),workerGeneration:1});
    await f.admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,2,1,'{}',1,'pending')",[scope.tenantId,scope.spaceId,runId,binding.taskId]);
    await f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[scope.tenantId,scope.spaceId,runId,binding.taskId,scope.actorId,scope.payerId,f.department,binding.costCenter,seed.leaf,JSON.stringify(binding)]);
    const allowance=randomUUID(),reservation=randomUUID();await f.admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,payer_actor_id,currency,ceiling,reserved,revision) VALUES($1,$2,$3,$4,'synthetic',100,50,1)",[scope.tenantId,scope.spaceId,allowance,scope.payerId]);
    await f.admin.query("INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES($1,$2,$3,$4,$5,$6,$7,50,'active')",[scope.tenantId,scope.spaceId,reservation,allowance,scope.actorId,runId,randomUUID()]);
    const rb={task:{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:binding.taskId},runId,requirementsRevision:binding.requirementsRevision,engineVersion:'g1-recovery/0.0.1',behaviorVersion:'storage-fixture/1',schemaVersion:1,environmentDigest:binding.versions.environmentDigest,dependencyLockDigest:binding.versions.dependencyLockDigest},g={cancellation:0,worker:1,resource:0};
    const value={run:runSchema.parse({binding:rb,revision:1,generation:g,state:'preparing',wait:null,outcomeDigest:null}),session:sessionSchema.parse({binding:rb,sessionId:binding.sessionId,generation:g,role:'lead',modelProfile:'synthetic',toolProfile:'proposal-only',contextDigest:binding.sourceRevisionDigest,budgetReservationId:reservation,cursor:0,state:'ready',adapter:'deterministic-test-only'}),lease:leaseSchema.parse({leaseId:randomUUID(),binding:rb,generation:g,expiresAt:new Date(Date.now()+59_000).toISOString(),revokedAt:null})};
    const recovery=new RecoveryRepository(f.uow,f.verifier.bindingFor);if(initialized)await recovery.initialize(scope,{commandId:randomUUID(),key:randomUUID(),runId,expectedRevision:0,payloadDigest:bindingDigest(value),expiresAt:new Date(Date.now()+45_000).toISOString()},value);
    await f.native.open(scope,runId,seed.admission);return {binding,recovery,value};
   }
   async function pair(label:string){const base=live({logicalPath:label}),d=draft({logicalPath:label,bytes:Buffer.concat([binary,Buffer.from(label)]).toString('base64')});
    assert.equal((await repo().writeLive(scope,base)).status,'live-written');assert.equal((await repo().saveDraft(scope,d)).status,'draft-saved');saves+=2;writes+=2;return {base,d};}
   async function exact(base:Extract<VolumeCommand,{action:'live-write'}>,d:Extract<VolumeCommand,{action:'draft'}>,p:Extract<VolumeCommand,{action:'promote'}>){const value=await repo().current(scope,base.targetId);
    try{assert.ok(value.bytes.equals(Buffer.from(d.bytes,'base64')));assert.deepEqual(value.command,p);assert.equal(value.receipt.status,'artifact-committed');assert.equal(value.receipt.revision,p.expectedRevision+1);assert.equal(value.receipt.lastSuccessfulCheckpoint,null);assert.equal(value.receipt.unsavedEditorWork,'not-covered');
     assert.equal(value.manifest.filename,d.filename);assert.equal(value.manifest.logicalPath,d.logicalPath);assert.deepEqual(value.manifest.base,{id:base.targetId,revision:p.expectedRevision});assert.equal(value.manifest.validationId,p.validationId);assert.equal(value.manifest.entry.byteLength,value.bytes.length);assert.equal(value.manifest.entry.contentDigest,digest(value.bytes));assert.equal(value.manifest.entry.id,base.targetId);assert.equal(value.manifest.entry.revision,p.expectedRevision+1);assert.ok(value.audience.recipientActorIds.includes(scope.actorId));reads++;
    }finally{value.bytes.fill(0);}}
   await t.test('VOLUME-PROMOTION/exact-canonical-bytes-manifest-recreation',async()=>{
    const {base,d}=await pair('canonical'),p=promote(base,d),r=await repo().promote(scope,p);assert.equal(r.status,'artifact-committed',JSON.stringify(r));saves++;writes++;await exact(base,d,p);
    assert.deepEqual(await repo().promote(scope,p),r);assert.deepEqual(await repo().commit(scope,p),r);assert.deepEqual(await repo().lookup(scope,p),r);reads+=3;
    for(const table of ['storage_volume_promotions','storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox']){const n=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[p.key])).rows[0].n;if(n!==1)duplicates++;assert.equal(n,1);}
    const changed={...p,validationId:randomUUID()};await refused(()=>repo().promote(scope,changed));await deny(()=>repo().lookup(scope,changed),['IDEMPOTENCY_CONFLICT','CHECK_BINDING_MISMATCH','INTEGRITY_FAILED']);
    const old=await repo().read(scope,{kind:'live-file',id:base.targetId,revision:1});try{assert.ok(old.bytes.equals(binary));reads++;}finally{old.bytes.fill(0);}
    const editable=live({targetId:base.targetId,expectedRevision:2,logicalPath:base.logicalPath,bytes:later.toString('base64')});assert.equal((await repo().writeLive(scope,editable)).status,'live-written');saves++;writes++;
    const canonical=await repo().canonical(scope,base.targetId),current=await repo().current(scope,base.targetId);try{assert.deepEqual(canonical.receipt,r);assert.ok(canonical.bytes.equals(Buffer.from(d.bytes,'base64')));assert.deepEqual(canonical.command,p);assert.equal(current.receipt.status,'live-written');assert.equal(current.receipt.revision,3);assert.ok(current.bytes.equals(later));reads+=2;}finally{canonical.bytes.fill(0);current.bytes.fill(0);}
    const table='storage_volume_promotions';assert.deepEqual((await f.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['fabric.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});assert.equal((await f.controller.query('SELECT * FROM fabric.'+table)).rows.length,0);
    for(const pool of [f.worker,f.client,f.idpPool])await deny(()=>pool.query('SELECT * FROM fabric.'+table),['42501']);await deny(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);await deny(()=>f.admin.query('DELETE FROM fabric.'+table),['P0001']);
    // Reproducible missing-link fault must refuse the newest accepted version,
    // never choose an older canonical or silently convert the later autosave.
    const link=(await f.admin.query('SELECT * FROM fabric.'+table+' WHERE command_key=$1',[p.key])).rows[0],intact=await snapshot(),fault=await f.admin.connect();
    try{await fault.query('BEGIN');await fault.query('ALTER TABLE fabric.'+table+' DISABLE TRIGGER ALL');await fault.query('DELETE FROM fabric.'+table+' WHERE command_key=$1',[p.key]);await fault.query('ALTER TABLE fabric.'+table+' ENABLE TRIGGER ALL');await fault.query('COMMIT');await deny(()=>repo().canonical(scope,base.targetId),['INTEGRITY_FAILED']);}
    finally{await fault.query('ROLLBACK');const columns=Object.keys(link);await fault.query('INSERT INTO fabric.'+table+'('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(link));fault.release();}assert.deepEqual(await snapshot(),intact);
   });
   for(const order of ['a','b'])await t.test('VOLUME-PROMOTION/promoter-'+order+'-wins-observed-CAS',async()=>{
    const {base,d}=await pair('concurrent-'+order),other=draft({logicalPath:d.logicalPath,bytes:Buffer.concat([later,Buffer.from(order)]).toString('base64')});assert.equal((await repo().saveDraft(scope,other)).status,'draft-saved');saves++;writes++;
    const a=promote(base,d),b=promote(base,other),winner=order==='a'?a:b,loser=order==='a'?b:a,wd=order==='a'?d:other,ld=order==='a'?other:d;
    await Promise.all([repo().prepare(scope,a),repo().prepare(scope,b)]);writes+=2;
    let entered!:()=>void,release!:()=>void,pid=0;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    const one=repo({afterArtifactWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!['pid']);entered();await hold;}}).commit(scope,winner);one.catch(()=>{});await Promise.race([ready,one]);assert.ok(pid);
    const two=repo().commit(scope,loser);two.catch(()=>{});
    try{let blocked=false;for(let i=0;i<120;i++){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(blocked,'Competing real backend blocks on publication owner');}finally{release();await Promise.allSettled([one,two]);}
    assert.equal((await one).status,'artifact-committed');await refused(()=>two);saves++;writes++;conflicts++;await exact(base,wd,winner);
    assert.deepEqual(await repo().lookup(scope,loser),{status:'absent-safe'});reads++;await refused(()=>repo().commit(scope,loser));
    const compared=await repo().compare(scope,{draft:{kind:'draft',id:ld.targetId,revision:1},liveId:base.targetId});try{assert.equal(compared.stale,true);assert.equal(compared.baseRevision,1);assert.equal(compared.currentRevision,2);assert.ok(compared.draft.bytes.equals(Buffer.from(ld.bytes,'base64')));reads++;}finally{compared.draft.bytes.fill(0);compared.current?.bytes.fill(0);}
    for(const k of [winner.key,loser.key])for(const table of ['storage_volume_promotions','storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[k])).rows[0].n,k===winner.key?1:0);
   });
   await t.test('VOLUME-PROMOTION/stale-compare-retained-variant-and-path-binding',async()=>{
    const {base,d}=await pair('stale'),p=promote(base,d),next=live({targetId:base.targetId,expectedRevision:1,logicalPath:base.logicalPath,bytes:later.toString('base64')});assert.equal((await repo().writeLive(scope,next)).status,'live-written');saves++;writes++;
    const before=await snapshot();await refused(()=>repo().promote(scope,p));assert.deepEqual(await snapshot(),before);
    const variant=draft({...d,targetId:randomUUID(),key:randomUUID()});assert.equal((await repo().retainVariant(scope,{command:variant,prior:{kind:'draft',id:d.targetId,revision:1}})).status,'draft-saved');saves++;writes++;
    const v=await repo().compare(scope,{draft:{kind:'draft',id:variant.targetId,revision:1},liveId:base.targetId});try{assert.equal(v.stale,true);assert.ok(v.draft.bytes.equals(Buffer.from(d.bytes,'base64')));reads++;}finally{v.draft.bytes.fill(0);v.current?.bytes.fill(0);}
    await refused(()=>repo().promote(scope,promote(base,variant,{expectedRevision:2})));
    const wrong=await pair('wrong-path');await refused(()=>repo().promote(scope,promote(wrong.base,d)));
   });
   await t.test('VOLUME-PROMOTION/closed-command-and-scope-denials',async()=>{
    const {base,d}=await pair('closed'),p=promote(base,d),before=await snapshot();
    for(const raw of [{...p,bytes:binary.toString('base64')},{...p,actorId:scope.actorId},{...p,rootId:root.rootId},{...p,expectedRevision:0},{...p,draftRevision:0},{...p,validationId:null},{...p,runtimeGeneration:0}])await refused(()=>repo().promote(scope,raw));
    for(const s of [await f.scopeFor(f.actors[2]),await f.scopeFor(f.actors[1]),await f.scopeFor(f.actors[0],f.spaces.personal),await f.scopeFor(f.foreignActor,f.spaces.foreign),{...scope} as VerifiedScope])await refused(()=>repo().promote(s,p));
    assert.deepEqual(await snapshot(),before);
   });
   await t.test('VOLUME-PROMOTION/validator-current-storage-and-atomic-rollback',async()=>{
    const {base,d}=await pair('validator'),p=promote(base,d);await repo().prepare(scope,p);writes++;const before=await snapshot();
    const row=(await f.admin.query('SELECT a.upload_id FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON a.id=v.artifact_id WHERE v.id=$1',[d.targetId])).rows[0],path=resolve(root.path,'u-'+String(row.upload_id),'object'),missing=path+'.missing',original=await readFile(path);
    await rename(path,missing);try{await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);}finally{await rename(missing,path);}
    await writeFile(path,JSON.stringify({...JSON.parse(original.toString()),tag:Buffer.alloc(16).toString('base64')}));try{await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);}finally{await writeFile(path,original);}
    validatorAvailable=false;try{await refused(()=>repo().commit(scope,p));}finally{validatorAvailable=true;}assert.deepEqual(await snapshot(),before);
    for(const changed of [{...controlsValue,keyId:randomUUID()},{...controlsValue,generation:randomUUID()},{...controlsValue,rootId:randomUUID()}]){current=changed;try{await refused(()=>repo().commit(scope,p));}finally{current=controlsValue;}assert.deepEqual(await snapshot(),before);}
    let after=false;try{await refused(()=>repo({afterArtifactWrite:async tx=>{after=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_volume_versions WHERE command_key=$1',[p.key])).rows[0]!['n'],1);validatorAvailable=false;}}).commit(scope,p));}finally{validatorAvailable=true;}assert.ok(after);assert.deepEqual(await snapshot(),before);assert.deepEqual(await repo().lookup(scope,p),{status:'absent-safe'});reads++;
    after=false;await refused(()=>repo({afterArtifactWrite:async tx=>{after=true;await tx.query('SELECT 1/0');}}).commit(scope,p));assert.ok(after);assert.deepEqual(await snapshot(),before);assert.deepEqual(await repo().lookup(scope,p),{status:'absent-safe'});reads++;
    await f.admin.query("CREATE FUNCTION public.suppress_promotion_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");await f.admin.query('CREATE TRIGGER suppress_promotion_insert BEFORE INSERT ON fabric.storage_volume_promotions FOR EACH ROW EXECUTE FUNCTION public.suppress_promotion_insert()');
    try{await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);assert.deepEqual(await repo().lookup(scope,p),{status:'absent-safe'});reads++;}finally{await f.admin.query('DROP TRIGGER suppress_promotion_insert ON fabric.storage_volume_promotions');await f.admin.query('DROP FUNCTION public.suppress_promotion_insert()');}
    assert.equal((await repo().commit(scope,p)).status,'artifact-committed');saves++;writes++;await exact(base,d,p);
   });
   await t.test('VOLUME-PROMOTION/Stop-fences-recreated-writer-keeps-comparable-draft',async()=>{
    const {base,d}=await pair('stop'),writer=await f.task('maintenance'),p=promote(base,d,{sessionId:writer.binding.sessionId});await repo().prepare(scope,p);writes++;
    const n=await f.native.snapshot(scope,writer.binding.sessionId);await f.native.stop(scope,{sessionId:writer.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+20_000).toISOString(),observedRevision:n.revision});writes++;
    const before=await snapshot();await refused(()=>repo().commit(scope,p));await refused(()=>repo().promote(scope,p));assert.deepEqual(await snapshot(),before);
    const compared=await repo().compare(scope,{draft:{kind:'draft',id:d.targetId,revision:1},liveId:base.targetId});try{assert.equal(compared.stale,false);assert.equal(compared.currentRevision,1);reads++;}finally{compared.draft.bytes.fill(0);compared.current?.bytes.fill(0);}
   });
   await t.test('VOLUME-PROMOTION/installed-Task-Run-cancellation-worker-fences',async()=>{
    for(const fault of ['task','cancellation','worker','terminal']){const {base,d}=await pair('fence-'+fault),writer=await f.task('maintenance'),p=promote(base,d,{sessionId:writer.binding.sessionId});await repo().prepare(scope,p);writes++;
     if(fault==='task')await f.admin.query('UPDATE fabric.tasks SET revision=revision+1 WHERE task_id=$1',[writer.binding.taskId]);
     if(fault==='cancellation')await f.admin.query('UPDATE fabric.tasks SET cancellation_generation=cancellation_generation+1 WHERE task_id=$1',[writer.binding.taskId]);
     if(fault==='worker')await f.admin.query('UPDATE fabric.runs SET generation=generation+1 WHERE run_id=$1',[writer.binding.runId]);
     if(fault==='terminal')await f.admin.query("UPDATE fabric.runs SET state='cancelled' WHERE run_id=$1",[writer.binding.runId]);
     const before=await snapshot();await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);const v=await repo().compare(scope,{draft:{kind:'draft',id:d.targetId,revision:1},liveId:base.targetId});try{assert.equal(v.currentRevision,1);assert.equal(v.stale,false);reads++;}finally{v.draft.bytes.fill(0);v.current?.bytes.fill(0);}
    }
    const {base,d}=await pair('actual-recovery-worker'),writer=await recoverableWriter(),p=promote(base,d,{sessionId:writer.binding.sessionId});await repo().prepare(scope,p);writes++;
    const replacement={sessionId:writer.binding.sessionId,previousWorker:1,nextWorker:2};await writer.recovery.replaceWorker(scope,{commandId:randomUUID(),key:randomUUID(),runId:writer.binding.runId,expectedRevision:1,payloadDigest:bindingDigest(replacement),expiresAt:new Date(Date.now()+30_000).toISOString()},replacement);writes++;
    assert.equal(Number((await f.admin.query('SELECT generation FROM fabric.runs WHERE run_id=$1',[writer.binding.runId])).rows[0].generation),1);const replaced=await writer.recovery.get(scope,writer.binding.runId);assert.equal(replaced?.run.generation.worker,2);
    const before=await snapshot(),denied=await refused(()=>repo().commit(scope,p));assert.equal((denied as {error?:string}).error,'STALE_FENCE');assert.deepEqual(await snapshot(),before);const variant=await repo().compare(scope,{draft:{kind:'draft',id:d.targetId,revision:1},liveId:base.targetId});try{assert.equal(variant.currentRevision,1);assert.equal(variant.stale,false);reads++;}finally{variant.draft.bytes.fill(0);variant.current?.bytes.fill(0);}
    const missing=await recoverableWriter(false),unbound=promote(base,d,{sessionId:missing.binding.sessionId}),prior=await snapshot(),refusal=await refused(()=>repo().promote(scope,unbound));assert.equal((refusal as {error?:string}).error,'AUTHORITY_UNAVAILABLE');assert.deepEqual(await snapshot(),prior);
   });
   await t.test('VOLUME-PROMOTION/installed-runtime-generation-and-mode-fences',async()=>{
    for(const fault of ['generation','mode','late-enrollment']){const {base,d}=await pair('runtime-'+fault),writer=await recoverableWriter(),p=promote(base,d,{sessionId:writer.binding.sessionId}),resourceId=randomUUID();
     // Owned synthetic installed runtime rows. Product checks borrow the real
     // current table and native barrier; no caller JSON can assert this state.
     const enrollRuntime=async()=>{await f.admin.query('INSERT INTO fabric.recovery_resource_controls VALUES($1,$2,$3,$4::jsonb)',[scope.tenantId,scope.spaceId,resourceId,JSON.stringify({resourceId,generation:0,mode:'agent'})]);await f.admin.query('INSERT INTO fabric.recovery_run_resources VALUES($1,$2,$3,$4)',[scope.tenantId,scope.spaceId,writer.binding.runId,resourceId]);};
     if(fault!=='late-enrollment')await enrollRuntime();await repo().prepare(scope,p);writes++;
     if(fault==='late-enrollment')await enrollRuntime();else await f.admin.query('UPDATE fabric.recovery_resource_controls SET record=$2::jsonb WHERE resource_id=$1',[resourceId,JSON.stringify({resourceId,generation:fault==='generation'?1:0,mode:fault==='mode'?'paused':'agent'})]);
     const before=await snapshot();await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);
    }
   });
   await t.test('VOLUME-PROMOTION/source-revocation-before-promotion-and-after-commit',async()=>{
    const {base}=await pair('source'),narrative=marker+' source',sourceCommand={schemaVersion:1,action:'source',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),title:marker,uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};sourceExpiries.set(sourceCommand.targetId,sourceCommand.retentionExpiresAt);
    const source=await new KnowledgeSaveRepository(f.uow,journal,f.native,crypto(),{resolve:async()=>({keyId,generation})},new LocalSaveAdmission()).source(scope,sourceCommand);demand(source.status==='source-accepted');writes++;
    const d=draft({logicalPath:base.logicalPath,sourceId:sourceCommand.targetId});assert.equal((await repo().saveDraft(scope,d)).status,'draft-saved');saves++;writes++;
    const p=promote(base,d);await repo().prepare(scope,p);writes++;assert.equal((await repo({beforeWitnessAck:async()=>{throw new Error('owned source-backed promotion ACK boundary');}}).commit(scope,p)).status,'unknown');assert.equal((await repo().lookup(scope,p)).status,'artifact-committed');reads++;saves++;writes++;await exact(base,d,p);
    const value=await repo().current(scope,base.targetId);try{assert.equal(value.manifest.source?.sourceId,sourceCommand.targetId);reads++;}finally{value.bytes.fill(0);}
    const next=draft({logicalPath:base.logicalPath,baseRevision:2,sourceId:sourceCommand.targetId});assert.equal((await repo().saveDraft(scope,next)).status,'draft-saved');saves++;writes++;const blocked=promote(base,next,{expectedRevision:2});await repo().prepare(scope,blocked);writes++;
    assert.equal((await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,{key:randomUUID(),sessionId:task.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),source:{id:sourceCommand.targetId,revision:1,witness:source.source.witness}})).status,'committed');writes++;
    const before=await snapshot();await refused(()=>repo().commit(scope,blocked));assert.deepEqual(await snapshot(),before);await deny(()=>repo().current(scope,base.targetId),['RETENTION_RESTRICTED']);
    const row=(await f.admin.query('SELECT a.id,a.witness FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON a.id=v.artifact_id WHERE v.command_key=$1',[p.key])).rows[0];await deny(()=>repo().artifacts.read(scope,{class:'artifact',id:row.id,revision:1,witness:row.witness}),['RETENTION_RESTRICTED']);
   });
   await t.test('VOLUME-PROMOTION/unknown-ACK-exact-original-no-replay',async()=>{
    const {base,d}=await pair('unknown'),p=promote(base,d);await repo().prepare(scope,p);writes++;let entered=false;
    const r=await repo({beforeWitnessAck:async()=>{entered=true;throw new Error('owned synthetic ACK boundary');}}).commit(scope,p);assert.ok(entered);assert.equal(r.status,'unknown');assert.equal((r as {key?:string}).key,p.key);assert.equal((r as {replayAllowed?:boolean}).replayAllowed,false);
    await deny(()=>repo().current(scope,base.targetId),['AUTHORITY_UNAVAILABLE']);const recovered=await repo().lookup(scope,p);assert.equal(recovered.status,'artifact-committed');assert.deepEqual(await repo().lookup(scope,p),recovered);assert.deepEqual(await repo().promote(scope,p),recovered);reads+=3;saves++;writes++;await exact(base,d,p);
    for(const table of ['storage_volume_promotions','storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[p.key])).rows[0].n,1);
    // Calibrate the real publication transaction rather than intercepting a
    // private-read COMMIT. Then drop its actual PostgreSQL ReadyForQuery ACK.
    const calibrated=await pair('wire-calibration'),calibration=promote(calibrated.base,calibrated.d);await repo().prepare(scope,calibration);writes++;
    let calls=0,publicationCall=0;const counted:AsyncUnitOfWork={withScope:async(s,work)=>{calls++;return f.uow.withScope(s,work);}};
    assert.equal((await repo({afterArtifactWrite:async()=>{publicationCall=calls;}},crypto(),counted).commit(scope,calibration)).status,'artifact-committed');assert.ok(publicationCall>0);saves++;writes++;
    const uncertain=await pair('wire-uncertain'),c=promote(uncertain.base,uncertain.d);await repo().prepare(scope,c);writes++;
    const wire=await startCommitWireProxy(f.fixtureDsn('controller'),'commit'),pool=new pg.Pool({connectionString:wire.dsn,max:1,connectionTimeoutMillis:2000});
    const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
    const backend=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});let routedCalls=0,typed=0,actualWrite=false;
    const routed:AsyncUnitOfWork={withScope:async(s,work)=>{const selected=++routedCalls===publicationCall?backend:f.uow;try{return await selected.withScope(s,work);}catch(e){if(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')typed++;throw e;}}};
    try{const result=await repo({afterArtifactWrite:async()=>{assert.equal(routedCalls,publicationCall);actualWrite=true;}},crypto(),routed).commit(scope,c);
     assert.ok(actualWrite);assert.equal(typed,1);assert.equal(wire.dropped(),1);assert.equal(result.status,'unknown');assert.equal((result as {key?:string}).key,c.key);assert.equal((result as {replayAllowed?:boolean}).replayAllowed,false);
     assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_volume_versions WHERE command_key=$1',[c.key])).rows[0].n,1);
     await deny(()=>repo().current(scope,uncertain.base.targetId),['AUTHORITY_UNAVAILABLE']);const recovered=await repo().lookup(scope,c);assert.equal(recovered.status,'artifact-committed');assert.deepEqual(await repo().lookup(scope,c),recovered);reads+=2;saves++;writes++;await exact(uncertain.base,uncertain.d,c);
     for(const table of ['storage_volume_promotions','storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_commands','storage_outbox'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.key])).rows[0].n,1);
    }finally{await pool.end();await wire.close();}
   });
   await t.test('VOLUME-PROMOTION/membership-revocation-after-preparation',async()=>{
    const {base,d}=await pair('member-revocation'),p=promote(base,d);await repo().prepare(scope,p);writes++;
    await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[scope.tenantId,scope.spaceId,scope.actorId]);const before=await snapshot();await refused(()=>repo().commit(scope,p));assert.deepEqual(await snapshot(),before);
   });
   assert.equal(await installedOwnerSnapshot(f.admin),beforeOwner);owners++;
   observe({schemaVersion:1,measurement:'storage-observations',suite:'volume-promotion',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:conflicts,propagate:0,backup:0,owner:owners,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:0}});
   binary.fill(0);later.fill(0);
  }finally{dataKey.fill(0);digestKey.fill(0);await f.close();}
 });
}
