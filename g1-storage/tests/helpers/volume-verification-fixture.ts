import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createArtifactVerificationFixture} from './artifact-verification-fixture.js';
import {volumeVerificationOwner} from './volume-verification-owner.js';
import {CapturedInventorySchema,BackupCaptureRepository} from '../../src/backup-capture.js';
import {BackupConfirmationRepository} from '../../src/backup-confirmation.js';
import {RestoreImportRepository} from '../../src/restore-import.js';
import {RestoreActivationRepository} from '../../src/restore-activation.js';
import {DependencyGraphRepository} from '../../src/dependency-graph.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import type {OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {migrateStorageRestoreActivation,migrateStorageVolumePromotion} from '../../src/migration.js';
import type {VolumeCommand,VolumeDraftHooks,VolumeReadRef} from '../../src/volume-drafts.js';
import type {VerifiedScope} from '../../src/owners.js';
import {KnowledgeSaveRepository,LocalSaveAdmission,sourceNarrativeDigest,type KnowledgeSaveHooks} from '../../src/knowledge-save.js';
import type {SaveCommand} from '../../src/contracts.js';
import {RecoveryRepository,leaseSchema} from '../../../g1-recovery/src/repository.js';
import {runSchema,sessionSchema,bindingDigest} from '../../../g1-recovery/src/contracts.js';
import {TaskCallBindingSchema} from '../../../g1-model/src/schema.js';
export const byteDigest=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');
export async function createVolumeVerificationFixture(){
 const k=await createArtifactVerificationFixture(),f=k.f,scope=k.scope;
 try{
  await migrateStorageVolumePromotion(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
  const scenario=async(caller:VerifiedScope=scope)=>{
   const original=await k.setup(),s={...original,task:caller===scope?original.task:await f.task('maintenance',caller)},commands:VolumeCommand[]=[],logicalPath='documents/'+randomUUID();let valid=true;let currentGeneration:string=k.generation;
   if(caller!==scope)await k.journal.install(caller.tenantId,caller.spaceId,k.authorityEnrollment.anchors.get(k.authorityEnrollment.key(caller))!);
   const common=()=>({schemaVersion:1 as const,sessionId:s.task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+45_000).toISOString()});
   const enroll=<T extends VolumeCommand>(c:T)=>{commands.push(c);return c;};
   const live=(patch:Partial<Extract<VolumeCommand,{action:'live-write'}>>={})=>enroll({...common(),action:'live-write' as const,filename:'../'+randomUUID()+'.bin',logicalPath,bytes:s.bytes.toString('base64'),...patch});
   const draft=(patch:Partial<Extract<VolumeCommand,{action:'draft'}>>={})=>enroll({...common(),action:'draft' as const,filename:'draft.bin',logicalPath,bytes:s.bytes.toString('base64'),sourceId:null,baseRevision:1,...patch});
   const checkpoint=(liveIds:string[])=>enroll({...common(),action:'checkpoint' as const,liveIds});
   const promote=(base:Extract<VolumeCommand,{action:'live-write'}>,d:Extract<VolumeCommand,{action:'draft'}>,patch:Partial<Extract<VolumeCommand,{action:'promote'}>>={})=>enroll({...common(),action:'promote' as const,targetId:base.targetId,expectedRevision:1,draftId:d.targetId,draftRevision:1,validationId:randomUUID(),...patch});
   const repo=(hooks:VolumeDraftHooks={})=>volumeVerificationOwner({uow:f.uow,native:f.native,scope:caller,crypto:k.crypto(),authorityRoot:k.authorityRoot,root:s.root,witnessRoot:k.witnessRoot,keyId:k.keyId,generation:k.generation,commands,retentionExpiresAt:s.retentionExpiresAt,valid,currentGeneration},hooks);
   const spawn=(c:VolumeCommand,gate:string|readonly string[]|null=null,extra:Record<string,unknown>={})=>k.spawn(s,gate,{script:new URL('./volume-process-worker.js',import.meta.url),input:{volumeCommand:c,commands,valid,currentGeneration,tenantId:caller.tenantId,spaceId:caller.spaceId,token:f.tokens.get(caller.actorId),...extra}});
   const call=async(c:VolumeCommand,kind:string,ref?:unknown,extra:Record<string,unknown>={})=>{const w=await spawn(c,null,extra);try{return await k.request(w,kind,ref);}finally{await k.kill(w);}};
   const read=async(c:VolumeCommand,ref:VolumeReadRef,extra:Record<string,unknown>={})=>{const r=await call(c,'read',ref,extra);assert.equal(r.kind,'result',JSON.stringify(r));k.count.read++;return r.value;};
   const write=async(c:VolumeCommand,status=c.action==='live-write'?'live-written':c.action==='draft'?'draft-saved':c.action==='checkpoint'?'checkpoint-confirmed':'artifact-committed')=>{const owner=repo(),result=c.action==='live-write'?await owner.writeLive(caller,c):c.action==='draft'?await owner.saveDraft(caller,c):c.action==='checkpoint'?await owner.confirmCheckpoint(caller,c):await owner.promote(caller,c);assert.equal(result.status,status,JSON.stringify(result));k.count.write++;k.count.save++;return result;};
   const pair=async()=>{const base=live(),d=draft({bytes:Buffer.concat([s.bytes,Buffer.from('draft-'+randomUUID())]).toString('base64')});await write(base);await write(d);return {base,d};};
   const refused=async(c:VolumeCommand,kind='commit',extra:Record<string,unknown>={})=>{const r=await call(c,kind,undefined,extra);assert(r.kind==='refused'||r.value?.status==='not-saved',JSON.stringify(r));k.count.deny++;return r;};
   return {...s,commands,live,draft,checkpoint,promote,repo,spawn,call,read,write,pair,refused,setValid:(v:boolean)=>valid=v,setGeneration:(v:string)=>currentGeneration=v};
  };
  type Scenario=Awaited<ReturnType<typeof scenario>>;
  const effects=async(c:VolumeCommand,n:number)=>{for(const table of ['storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox','storage_head_publications']){const actual=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.key])).rows[0].n;if(actual!==n)k.violations.duplicateCanonicalEffect++;assert.equal(actual,n,table);}assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_volume_promotions WHERE command_key=$1',[c.key])).rows[0].n,c.action==='promote'?n:0);};
  const snapshot=async()=>{const names=(await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='fabric' AND tablename LIKE 'storage_%' ORDER BY tablename")).rows;return Promise.all(names.map(async r=>[r.tablename,(await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.'+r.tablename+' x ORDER BY row_to_json(x)::text')).rows]));};
  const object=async(s:Scenario,c:VolumeCommand)=>{const row=(await f.admin.query('SELECT upload_id FROM fabric.storage_artifact_versions WHERE command_key=$1',[c.key])).rows[0];assert(row);return resolve(s.root.path,'u-'+row.upload_id);};
  const exact=async(s:Scenario,c:VolumeCommand,ref:VolumeReadRef,bytes:Buffer)=>{const v=await s.read(c,ref);assert(Buffer.from(v.bytes).equals(bytes));assert.deepEqual(v.command,c);assert.equal(v.manifest.entry.contentDigest,byteDigest(bytes));assert.equal(v.manifest.entry.byteLength,bytes.length);assert.equal(v.manifest.entry.id,c.targetId);assert.equal(v.manifest.entry.revision,ref.revision);assert.equal(v.receipt.unsavedEditorWork,'not-covered');assert.equal(v.taskId,s.task.binding.taskId);assert.equal(v.runId,s.task.binding.runId);assert.equal(v.workerGeneration,s.task.binding.workerGeneration);return v;};
  const knowledge=async(s:Scenario)=>{
   const narrative='volume-class-decision-'+randomUUID(),base={schemaVersion:1 as const,sessionId:s.task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString()},source={...base,action:'source' as const,title:'separate saved decision',uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+50_000).toISOString(),saveReusable:true};
   const repo=(hooks:KnowledgeSaveHooks={})=>new KnowledgeSaveRepository(f.uow,k.journal,f.native,k.crypto(),{resolve:async()=>({keyId:k.keyId,generation:k.generation})},new LocalSaveAdmission(),hooks);
   assert.equal((await repo().source(scope,source)).status,'source-accepted');k.count.write++;
   const save:SaveCommand={...base,action:'save',key:randomUUID(),targetId:randomUUID(),assertion:{subject:'decision-'+randomUUID(),value:narrative,sourceId:source.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.now()+40_000).toISOString(),classification:'group',intent:'assert',checkId:null}};
   return {save,repo};
  };
  const capture=async(s:Scenario)=>{
   await migrateStorageRestoreActivation(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
   const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,keys={resolve:async()=>({keyId:k.keyId,generation:k.generation})},graph=new DependencyGraphRepository(f.uow,k.journal,f.native,k.crypto(),keys),backup=new BackupConfirmationRepository(f.uow,k.journal,f.native,graph,k.crypto(),keys,roots['backup']!),owner=s.repo();
   const command={schemaVersion:1 as const,key:randomUUID(),sessionId:s.task.binding.sessionId,targetId:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),action:'backup' as const};
   const captured=await new BackupCaptureRepository(f.uow,graph,k.crypto(),keys,s.root,roots['backup']!,{},{artifacts:owner.artifacts,volume:owner}).capture(scope,command);assert.equal((await backup.confirm(scope,command)).status,'backup-confirmed');k.count.backup++;k.count.write++;
   const archive=await backup.restoreCandidate(scope,{schemaVersion:1,sessionId:command.sessionId,backupId:captured.backupId,expiresAt:command.expiresAt}),inventory=CapturedInventorySchema.parse(archive.inventory);assert.equal(archive.confirmed,true);k.count.read++;
   return {captured,backup,roots,inventory};
  };
  const restored=async(s:Scenario)=>{
   const {captured,backup,roots}=await capture(s),restoreCommand={schemaVersion:1 as const,key:randomUUID(),sessionId:s.task.binding.sessionId,targetId:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),action:'restore' as const,backupId:captured.backupId},importer=new RestoreImportRepository(backup,k.crypto(),roots['restore']!,{resolve:async()=>({keyId:k.keyId,rootId:roots['restore']!.rootId})});
   const imported=await importer.import(scope,restoreCommand);assert.equal(imported.serving,false);assert.notEqual(imported.generation,k.generation);k.count.write++;
   const activation=new RestoreActivationRepository(importer,new KnowledgeStatusAdmission(k.crypto()));return {captured,restoreCommand,imported,activation};
  };
  const recoverableWriter=async()=>{
   const seed=await f.task('maintenance'),runId=randomUUID(),binding=TaskCallBindingSchema.parse({...seed.binding,runId,sessionId:randomUUID(),workerGeneration:1});
   await f.admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,2,1,'{}',1,'pending')",[scope.tenantId,scope.spaceId,runId,binding.taskId]);
   await f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[scope.tenantId,scope.spaceId,runId,binding.taskId,scope.actorId,scope.payerId,f.department,binding.costCenter,seed.leaf,JSON.stringify(binding)]);
   const allowance=randomUUID(),reservation=randomUUID();await f.admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,payer_actor_id,currency,ceiling,reserved,revision) VALUES($1,$2,$3,$4,'synthetic',100,50,1)",[scope.tenantId,scope.spaceId,allowance,scope.payerId]);
   await f.admin.query("INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES($1,$2,$3,$4,$5,$6,$7,50,'active')",[scope.tenantId,scope.spaceId,reservation,allowance,scope.actorId,runId,randomUUID()]);
   const rb={task:{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:binding.taskId},runId,requirementsRevision:binding.requirementsRevision,engineVersion:'g1-recovery/0.0.1',behaviorVersion:'storage-fixture/1',schemaVersion:1,environmentDigest:binding.versions.environmentDigest,dependencyLockDigest:binding.versions.dependencyLockDigest},g={cancellation:0,worker:1,resource:0};
   const value={run:runSchema.parse({binding:rb,revision:1,generation:g,state:'preparing',wait:null,outcomeDigest:null}),session:sessionSchema.parse({binding:rb,sessionId:binding.sessionId,generation:g,role:'lead',modelProfile:'synthetic',toolProfile:'proposal-only',contextDigest:binding.sourceRevisionDigest,budgetReservationId:reservation,cursor:0,state:'ready',adapter:'deterministic-test-only'}),lease:leaseSchema.parse({leaseId:randomUUID(),binding:rb,generation:g,expiresAt:new Date(Date.now()+55_000).toISOString(),revokedAt:null})};
   const recovery=new RecoveryRepository(f.uow,f.verifier.bindingFor);await recovery.initialize(scope,{commandId:randomUUID(),key:randomUUID(),runId,expectedRevision:0,payloadDigest:bindingDigest(value),expiresAt:new Date(Date.now()+45_000).toISOString()},value);await f.native.open(scope,runId,seed.admission);return {binding,recovery,value};
  };
  return {...k,scenario,effects,snapshot,object,exact,knowledge,capture,restored,recoverableWriter,bindingDigest,readFile};
 }catch(e){await k.close();throw e;}
}
export type VolumeVerificationFixture=Awaited<ReturnType<typeof createVolumeVerificationFixture>>;
