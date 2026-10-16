import assert from 'node:assert/strict';
import type pg from 'pg';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,lstat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createStorageFixture} from './pg-fixture.js';
import {enrollAuthority} from './authority-fixture.js';
import {enrollServiceAccounting,accountingSnapshot} from './accounting-fixture.js';
import {migrateStorageRestoreProgress,installedOwnerSnapshot} from '../../src/migration.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {KnowledgeSaveRepository,sourceNarrativeDigest,type KnowledgeSaveHooks} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {SourceContentRepository} from '../../src/source-content.js';
import {StorageAuthorityRepository,controlDigest} from '../../src/authority.js';
import {currentScope} from '../../../g1-model/src/model-repository.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import {ArtifactPublicationRepository,type ArtifactControlsOwner,type ArtifactValidator,type ArtifactCommand,type ArtifactHooks} from '../../src/artifact-publication.js';
import {VolumeDraftRepository,type VolumeCommand} from '../../src/volume-drafts.js';
import {DependencyGraphRepository,type GraphRef} from '../../src/dependency-graph.js';
import {MaintenanceBuildersRepository,MaintenancePlanSchema,MaintenancePolicySchema,buildMaintenance,type MaintenancePlan} from '../../src/maintenance-builders.js';
import {QueryControlsRepository} from '../../src/query-controls.js';
import {SourceRecallBroker} from '../../src/recall-broker.js';
import {NativeAskRepository,startNativeAskHttp,AskReceiptReadSchema,type NativeAskPorts} from '../../src/native-ask.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {BackupCaptureRepository} from '../../src/backup-capture.js';
import {BackupConfirmationRepository} from '../../src/backup-confirmation.js';
import {RestoreImportRepository} from '../../src/restore-import.js';
import {ForgetWorkRepository} from '../../src/forget-work.js';
import {ArtifactCommandSchema,BindingSchema,AskCommandSchema,AskResultSchema} from '../../src/schema.js';
import {demand} from '../../src/errors.js';
import type {VerifiedScope} from '../../src/owners.js';
import {revalidateScope} from '../../src/owners.js';
import type {SaveCommand} from '../../src/contracts.js';
const stable=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};

/** Only fixture enrollment/composition: all reads/writes use the installed
 * public product repositories. No replacement authority/content implementation. */
export async function createAuthorityRouteFixture({retentionSeconds=60}:{retentionSeconds?:number}={}){
 const fixtureStarted=performance.now();
 const f=await createStorageFixture(),dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
 const count={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0};
 const violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const ports={computer:0,shell:0,model:0,enrichment:0,effect:0};let opens=0,online=true,closed=false;const openIdentities=new Map<string,number>();
 const servers:Awaited<ReturnType<typeof startNativeAskHttp>>[]=[];
 async function close(){if(closed)return;closed=true;try{for(const h of servers)await h.close();}finally{dataKey.fill(0);digestKey.fill(0);await f.close();}}
 try{
  const migrationStarted=performance.now();
  await migrateStorageRestoreProgress(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
  const migrationReturned=performance.now();
  const ownerBefore=await installedOwnerSnapshot(f.admin),a=await enrollAuthority(f,retentionSeconds),roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>;
  console.log(JSON.stringify({measurement:'authority-fixture-phase-times',clock:'child-monotonic',fixtureSetupMs:migrationStarted-fixtureStarted,migrationMs:migrationReturned-migrationStarted,enrollmentMs:performance.now()-migrationReturned}));
  const journal=new EpochWitnessJournal(roots['authority']!),originalCurrent=journal.current.bind(journal);
  journal.current=async(t,s)=>online?originalCurrent(t,s):undefined;
  for(const s of [f.scope,await f.scopeFor(f.actors[0],f.spaces.personal),await f.scopeFor(f.actors[0],f.spaces.share),await f.scopeFor(f.foreignActor,f.spaces.foreign),await f.scopeFor(f.actors[0],f.spaces.secondary)])await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
  const keys={resolve:async()=>({keyId,generation})};
  const cipher=()=>{const c=new CryptoStore({resolve:async()=>({dataKey,digestKey})}),open=c.open.bind(c);c.open=async(...args)=>{opens++;const b=BindingSchema.parse(args[0]),k=b.spaceId+'/'+b.class+'/'+b.id;openIdentities.set(k,(openIdentities.get(k)??0)+1);return open(...args);};return c;};
  const authority=()=>new StorageAuthorityRepository(journal,f.native);
  const canonical=(hooks:KnowledgeSaveHooks={})=>{const c=cipher();return new KnowledgeSaveRepository(f.uow,journal,f.native,c,keys,new KnowledgeStatusAdmission(c),hooks);};
  const graph=()=>new DependencyGraphRepository(f.uow,journal,f.native,cipher(),keys);
  const tasks=new Map<string,Awaited<ReturnType<typeof f.task>>>();
  const task=async(s:VerifiedScope)=>{const k=s.spaceId+'/'+s.actorId+'/'+s.membershipRevision;let t=tasks.get(k);if(!t){t=await f.task('maintenance',s);tasks.set(k,t);}return t;};
  const base=async(s:VerifiedScope)=>({schemaVersion:1 as const,sessionId:(await task(s)).binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString()});
  const snapshot=async()=>{const names=(await f.admin.query("SELECT relname FROM pg_class WHERE relnamespace='fabric'::regnamespace AND relkind='r' AND relname LIKE 'storage_%' ORDER BY relname")).rows.map(r=>String(r.relname));return {storage:await Promise.all(names.map(async n=>[n,(await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.'+n+' x ORDER BY row_to_json(x)::text')).rows])),accounting:await accountingSnapshot(f)};};
  const ref=async(s:VerifiedScope,cl:string,id:string)=>f.uow.withScope(s,async tx=>{await authority().check(tx,s,'read');const h=(await tx.query('SELECT witness FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class=$3 AND id=$4 ORDER BY revision DESC LIMIT 1',[s.tenantId,s.spaceId,cl,id])).rows[0];demand(h);return {class:cl,id,revision:1,witness:String(h['witness'])};});
  const core=async(s:VerifiedScope)=>{
   const narrative='source-'+randomUUID()+' Ω 漢字 🙂',source={...await base(s),action:'source' as const,title:'restricted-title-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+(retentionSeconds-1)*1000).toISOString(),saveReusable:true};
   assert.equal((await canonical().source(s,source)).status,'source-accepted');count.save++;count.write++;
   const save:SaveCommand={...await base(s),action:'save',assertion:{subject:'decision-'+randomUUID(),value:'decision-value-'+randomUUID()+' Ω 🙂',sourceId:source.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(source.retentionExpiresAt)-100).toISOString(),classification:s.spaceId===f.spaces.personal?'personal':'group',intent:'assert',checkId:null}};
   assert.equal((await canonical().save(s,save)).status,'saved-here');count.save++;count.write++;
   const sourceRef={...await ref(s,'source',source.targetId),class:'source' as const},knowledgeRef={...await ref(s,'knowledge',save.targetId),class:'knowledge' as const};
   return {s,source,save,sourceRef,knowledgeRef,readSource:(scope=s)=>new SourceContentRepository(f.uow,authority(),cipher()).read(scope,sourceRef),readKnowledge:(scope=s)=>canonical().recall(scope,knowledgeRef)};
  };
  const witnessPath=resolve(roots['authority']!.path,'w-'+randomUUID());await mkdir(witnessPath,{mode:0o700});const st=await lstat(witnessPath),witness={...roots['authority']!,path:witnessPath,rootId:randomUUID(),device:st.dev,inode:st.ino};await writeFile(resolve(witnessPath,'.storage-owner.json'),JSON.stringify({owner:witness.owner,instance:witness.instance,rootId:witness.rootId,device:witness.device,inode:witness.inode}),{flag:'wx',mode:0o600});
  const registered=new Map<string,{scope:VerifiedScope;validation:string;fingerprint?:string;expiry:string}>();
  const controls:ArtifactControlsOwner={current:async()=>({rootId:roots['content']!.rootId,keyId,generation}),resolve:async(_tx,s,c)=>{const r=registered.get(c.key);demand(r&&r.scope===s,'UNAUTHORIZED');return {rootId:roots['content']!.rootId,keyId,generation,retentionExpiresAt:r.expiry};}};
  const validator:ArtifactValidator={require:async(_tx,s,r)=>{const e=[...registered.values()].find(v=>v.validation===r.validationId);demand(e&&e.scope===s,'CHECK_BINDING_MISMATCH');if(e.fingerprint)demand(e.fingerprint===r.commandFingerprint,'CHECK_BINDING_MISMATCH');else e.fingerprint=r.commandFingerprint;}};
  const artifact=(hooks:ArtifactHooks={})=>new ArtifactPublicationRepository(f.uow,journal,f.native,cipher(),roots['content']!,new StagingWitnessJournal(witness),controls,validator,hooks);
  const volume=(hooks:ArtifactHooks={})=>new VolumeDraftRepository(f.uow,journal,f.native,cipher(),roots['content']!,new StagingWitnessJournal(witness),controls,validator,hooks);
  function enroll(s:VerifiedScope,c:VolumeCommand|ArtifactCommand,expiry:string){registered.set(c.key,{scope:s,validation:c.action==='artifact'?c.validationId:stable(['storage-volume-validation-v1',s.tenantId,s.spaceId,s.actorId,c.key]),expiry});return c;}
  const files=async(x:Awaited<ReturnType<typeof core>>)=>{
   const s=x.s,bytes=randomBytes(97),encoded=bytes.toString('base64'),expiry=x.source.retentionExpiresAt;
   const fileTimes:Record<string,number>={},filePhases:Record<string,{phase:string;elapsedMs:number}[]>={};let operation='artifactPrepare',operationStarted=performance.now();
   // Existing installed hooks only sample clocks. They perform no I/O, waits,
   // mutation, assertion or gate, and product IPC workers receive no probes.
   const hooks:ArtifactHooks={files:{phase:async phase=>{(filePhases[operation]??=[]).push({phase,elapsedMs:performance.now()-operationStarted});}},
    afterReserve:async()=>{(filePhases[operation]??=[]).push({phase:'epoch-reserved',elapsedMs:performance.now()-operationStarted});},
    beforeArtifactPublication:async()=>{(filePhases[operation]??=[]).push({phase:'artifact-prerequisite',elapsedMs:performance.now()-operationStarted});},
    afterArtifactWrite:async()=>{(filePhases[operation]??=[]).push({phase:'artifact-written',elapsedMs:performance.now()-operationStarted});},
    beforeWitnessAck:async()=>{(filePhases[operation]??=[]).push({phase:'before-witness-ack',elapsedMs:performance.now()-operationStarted});}};
   const ac=ArtifactCommandSchema.parse({...await base(s),action:'artifact',filename:'display-only',bytes:encoded,sourceId:x.source.targetId,validationId:randomUUID()});enroll(s,ac,expiry);await artifact(hooks).prepare(s,ac);fileTimes['artifactPrepare']=performance.now()-operationStarted;operation='artifactCommit';operationStarted=performance.now();assert.equal((await artifact(hooks).commit(s,ac)).status,'artifact-committed');count.save++;count.write++;fileTimes['artifactCommit']=performance.now()-operationStarted;operation='liveWrite';operationStarted=performance.now();
   const live={...await base(s),action:'live-write' as const,filename:'live',logicalPath:'docs/live',bytes:encoded};enroll(s,live,expiry);assert.equal((await volume(hooks).writeLive(s,live)).status,'live-written');count.save++;count.write++;fileTimes['liveWrite']=performance.now()-operationStarted;operation='draftSave';operationStarted=performance.now();
   const draft={...await base(s),action:'draft' as const,filename:'draft',logicalPath:'docs/draft',bytes:encoded,sourceId:null,baseRevision:1};enroll(s,draft,expiry);assert.equal((await volume(hooks).saveDraft(s,draft)).status,'draft-saved');count.save++;count.write++;fileTimes['draftSave']=performance.now()-operationStarted;operation='checkpointConfirm';operationStarted=performance.now();
   const checkpoint={...await base(s),action:'checkpoint' as const,liveIds:[live.targetId]};enroll(s,checkpoint,expiry);assert.equal((await volume(hooks).confirmCheckpoint(s,checkpoint)).status,'checkpoint-confirmed');count.save++;count.write++;fileTimes['checkpointConfirm']=performance.now()-operationStarted;
   console.log(JSON.stringify({measurement:'authority-file-operation-times',clock:'child-monotonic',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',...fileTimes,filePhases}));
   // Measure the installed authenticated UoW without product work. Keep every
   // transaction/session/role guard active; this isolates their aggregate cost.
   const transactionStarted=performance.now();let enteredMs=transactionStarted,leavingMs=transactionStarted;
   await f.uow.withScope(s,async()=>{enteredMs=performance.now();leavingMs=performance.now();});
   console.log(JSON.stringify({measurement:'authority-transaction-overhead-times',clock:'child-monotonic',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',entryMs:enteredMs-transactionStarted,exitMs:performance.now()-leavingMs}));
   // Exact read-only role probe from the accepted foundation owner. EXPLAIN
   // runs on its real nonprivileged controller connection, outside a scoped
   // transaction just as the original probe does. No settings are changed.
   const roleExplained=await f.controller.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole, EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='fabric' AND nspowner=pg_roles.oid) AS owns_schema, EXISTS(SELECT 1 FROM pg_auth_members am JOIN pg_roles parent ON parent.oid=am.roleid WHERE am.member=pg_roles.oid AND (parent.rolsuper OR parent.rolbypassrls)) AS privileged_membership FROM pg_roles WHERE rolname=current_user`);
   const rolePlans=roleExplained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(rolePlans)&&rolePlans[0]&&typeof rolePlans[0]==='object','INTEGRITY_FAILED');
   const rolePlan=rolePlans[0] as Record<string,unknown>,roleNode=rolePlan['Plan'] as Record<string,unknown>|undefined;
   console.log(JSON.stringify({measurement:'authority-role-probe-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:rolePlan['Planning Time'],executionMs:rolePlan['Execution Time'],totalCost:roleNode?.['Total Cost'],jit:rolePlan['JIT']??null}));
   // Read-only plan of the exact installed logical-index join, under the real
   // authenticated scope after the writes above. This is cost diagnosis only;
   // the original repositories and assertions remain the behavioral proof.
   await f.uow.withScope(s,async tx=>{
    // Exact original-recovery and receipt joins from the installed owners.
    // These read-only plans diagnose query execution, including any JIT work;
    // they do not replace the original recovery/read calls or their assertions.
    const originalExplained=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT r.*,x.object_digest,x.manifest_digest,x.object_size,x.manifest_size FROM fabric.storage_staging_reservations r JOIN fabric.storage_staging_confirmations x USING(tenant_id,space_id,upload_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.actor_id=$3 AND r.command_key=$4`,[s.tenantId,s.spaceId,s.actorId,live.key]);
    const originalPlans=originalExplained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(originalPlans)&&originalPlans[0]&&typeof originalPlans[0]==='object','INTEGRITY_FAILED');
    const originalPlan=originalPlans[0] as Record<string,unknown>,originalNode=originalPlan['Plan'] as Record<string,unknown>|undefined;
    console.log(JSON.stringify({measurement:'authority-original-join-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:originalPlan['Planning Time'],executionMs:originalPlan['Execution Time'],totalCost:originalNode?.['Total Cost'],jit:originalPlan['JIT']??null}));
    // The staging owner's consumed-original query is a separate FULL JOIN.
    // Diagnose that exact statement too; the simple reservation join above
    // cannot attribute its planning, row filtering or execution cost.
    const consumedExplained=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT p.*,e.binding_digest AS original_binding,e.session_id AS original_session,
     e.expires_at AS original_expires,e.previous_epoch,e.epoch AS original_epoch,e.anchor_id,
     x.source_task_id AS installed_task,
     ROW(p.witness,p.key_id,p.generation,p.epoch,p.accepted_at,p.expires_at)
      IS NOT DISTINCT FROM ROW(h.witness,h.key_id,h.generation,h.epoch,h.accepted_at,h.expires_at) AS exact_head,
     to_char(p.accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_at,
     to_char(p.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_expires,
     to_char(e.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_original_expires
     FROM fabric.storage_epoch_publications e FULL JOIN fabric.storage_head_publications p USING(tenant_id,space_id,actor_id,command_key)
     LEFT JOIN fabric.storage_current_heads h ON h.tenant_id=p.tenant_id AND h.space_id=p.space_id AND h.class=p.class AND h.id=p.id AND h.revision=p.revision
     LEFT JOIN fabric.storage_entities x ON x.tenant_id=p.tenant_id AND x.space_id=p.space_id AND x.class=p.class AND x.id=p.id AND x.revision=p.revision
     WHERE coalesce(e.tenant_id,p.tenant_id)=$1 AND coalesce(e.space_id,p.space_id)=$2
      AND coalesce(e.actor_id,p.actor_id)=$3 AND coalesce(e.command_key,p.command_key)=$4`,[s.tenantId,s.spaceId,s.actorId,live.key]);
    const consumedPlans=consumedExplained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(consumedPlans)&&consumedPlans[0]&&typeof consumedPlans[0]==='object','INTEGRITY_FAILED');
    const consumedPlan=consumedPlans[0] as Record<string,unknown>,consumedNode=consumedPlan['Plan'] as Record<string,unknown>|undefined;
    console.log(JSON.stringify({measurement:'authority-consumed-original-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:consumedPlan['Planning Time'],executionMs:consumedPlan['Execution Time'],totalCost:consumedNode?.['Total Cost'],actualRows:consumedNode?.['Actual Rows'],jit:consumedPlan['JIT']??null}));
    const receiptExplained=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT v.*,a.witness,a.key_id,a.generation,a.object_id,r.receipt_id FROM fabric.storage_volume_versions v
     JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(v.tenant_id,v.space_id,v.artifact_id)
     JOIN fabric.storage_artifact_receipts r ON (r.tenant_id,r.space_id,r.actor_id,r.command_key)=(v.tenant_id,v.space_id,v.actor_id,v.command_key)
     WHERE v.tenant_id=$1 AND v.space_id=$2 AND v.kind=$3 AND v.id=$4 AND v.revision=$5`,[s.tenantId,s.spaceId,'live-file',live.targetId,1]);
    const receiptPlans=receiptExplained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(receiptPlans)&&receiptPlans[0]&&typeof receiptPlans[0]==='object','INTEGRITY_FAILED');
    const receiptPlan=receiptPlans[0] as Record<string,unknown>,receiptNode=receiptPlan['Plan'] as Record<string,unknown>|undefined;
    console.log(JSON.stringify({measurement:'authority-receipt-join-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:receiptPlan['Planning Time'],executionMs:receiptPlan['Execution Time'],totalCost:receiptNode?.['Total Cost'],jit:receiptPlan['JIT']??null}));
    // Direct read-only calls isolate the remaining installed admission work.
    // These samples overlap (check/fresh include some smaller calls); do not
    // add their durations or treat them as the full operation's attribution.
    const admissionTimes:Record<string,number>={};let started=performance.now();
    await revalidateScope(s);admissionTimes['scopeRevalidation']=performance.now()-started;started=performance.now();
    await currentScope(tx,s);admissionTimes['currentScope']=performance.now()-started;started=performance.now();
    const anchor=await journal.current(s.tenantId,s.spaceId);demand(anchor,'AUTHORITY_UNAVAILABLE');admissionTimes['journalCurrent']=performance.now()-started;started=performance.now();
    demand(await controlDigest(tx,s.tenantId,s.spaceId,anchor.policyRevision)===anchor.controlDigest,'AUTHORITY_UNAVAILABLE');admissionTimes['controlDigest']=performance.now()-started;started=performance.now();
    await authority().check(tx,s,'read');admissionTimes['authorityCheck']=performance.now()-started;started=performance.now();
    const native=await f.native.load(tx,s,live.sessionId);admissionTimes['nativeLoad']=performance.now()-started;started=performance.now();
    await f.native.fresh(tx,s,native);admissionTimes['nativeFresh']=performance.now()-started;started=performance.now();
    await authority().currentAudience(tx,s,native.binding.taskId);admissionTimes['currentAudience']=performance.now()-started;
    console.log(JSON.stringify({measurement:'authority-admission-operation-times',clock:'child-monotonic',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',overlappingSamples:true,...admissionTimes}));
    const nativeExplained=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT s.binding,s.origin,c.admission,c.record,c.revision,t.cancellation_generation,coalesce(f.blocked,false) AS stopped FROM fabric.model_sessions s JOIN fabric.model_native_controls c USING(tenant_id,space_id,session_id) JOIN fabric.tasks t USING(tenant_id,space_id,task_id) LEFT JOIN fabric.recovery_task_controls f USING(tenant_id,space_id,task_id) WHERE s.tenant_id=$1 AND s.space_id=$2 AND s.session_id=$3`,[s.tenantId,s.spaceId,live.sessionId]);
    const nativePlans=nativeExplained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(nativePlans)&&nativePlans[0]&&typeof nativePlans[0]==='object','INTEGRITY_FAILED');
    const nativePlan=nativePlans[0] as Record<string,unknown>,nativeNode=nativePlan['Plan'] as Record<string,unknown>|undefined;
    console.log(JSON.stringify({measurement:'authority-native-load-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:nativePlan['Planning Time'],executionMs:nativePlan['Execution Time'],totalCost:nativeNode?.['Total Cost'],jit:nativePlan['JIT']??null}));
    const explained=await tx.query(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT o.actor_id AS original_actor,o.command_key AS original_key,o.target_id,v.*,a.key_id,a.generation
     FROM fabric.storage_outbox o LEFT JOIN fabric.storage_volume_versions v
     ON (v.tenant_id,v.space_id,v.artifact_id)=(o.tenant_id,o.space_id,o.target_id)
     LEFT JOIN fabric.storage_artifact_versions a ON (a.tenant_id,a.space_id,a.id)=(o.tenant_id,o.space_id,o.target_id)
     WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.class='artifact' ORDER BY o.job_id LIMIT 513`,[s.tenantId,s.spaceId]);
    const plans=explained.rows[0]?.['QUERY PLAN'];demand(Array.isArray(plans)&&plans[0]&&typeof plans[0]==='object','INTEGRITY_FAILED');
    const plan=plans[0] as Record<string,unknown>,node=plan['Plan'] as Record<string,unknown>|undefined;
    console.log(JSON.stringify({measurement:'authority-volume-index-plan-times',spaceKind:s.spaceId===f.spaces.personal?'personal':'group',planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],totalCost:node?.['Total Cost'],jit:plan['JIT']??null}));
   });
   const artifactRef={...await ref(s,'artifact',ac.targetId),class:'artifact' as const};
   const reads=[{class:'artifact',read:async(scope=s)=>{const b=await artifact().read(scope,artifactRef);try{assert.ok(b.bytes.equals(bytes));}finally{b.bytes.fill(0);}}},...[live,draft,checkpoint].map(c=>({class:c.action==='live-write'?'live-file':c.action,read:async(scope=s)=>{const r=await volume().read(scope,{kind:c.action==='live-write'?'live-file':c.action,id:c.targetId,revision:1});try{if(c.action!=='checkpoint')assert.ok(r.bytes.equals(bytes));else{assert.equal(r.checkpointManifest?.files.length,1);assert.equal(r.checkpointManifest?.files[0]?.id,live.targetId);assert.equal(r.checkpointManifest?.files[0]?.byteLength,bytes.length);assert.equal(r.checkpointManifest?.files[0]?.contentDigest,'sha256:'+createHash('sha256').update(bytes).digest('hex'));}assert.equal(r.audience.destinationSpaceId,s.spaceId);}finally{r.bytes.fill(0);}}}))];
   return {bytes,ac,live,draft,checkpoint,artifactRef,reads};
  };
  const derived=async(x:Awaited<ReturnType<typeof core>>,builder:MaintenancePlan['builder'])=>{
   const e=await enrollServiceAccounting(f,authority(),'maintenance',x.s),materialId=randomUUID(),plan=MaintenancePlanSchema.parse({schemaVersion:1,builder,id:randomUUID(),revision:1,sourceTaskId:e.task.binding.taskId,expiresAt:new Date(Date.parse(x.save.assertion.expiresAt)-100).toISOString(),dependencies:[x.knowledgeRef]});
   const policy=MaintenancePolicySchema.parse({schemaVersion:1,revision:1,profile:'local-deterministic-v1',region:'local-fixture',provider:'none',sourceAllowed:true,allowedBuilders:['summary-v1','keywords-v1','cache-v1']});
   const repository=()=>{const g=graph();return new MaintenanceBuildersRepository(g,new StorageServiceAccounting(f.uow,f.native,e.owner,g.authority),{plan:async(_tx,s,id)=>{demand(s===x.s&&id===materialId,'UNAUTHORIZED');return plan;},policy:async()=>policy,accounting:async(_tx,_s,_n,_k,expiresAt)=>({...e.command,expiresAt})});};
   const command={key:randomUUID(),sessionId:e.task.binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),materialId,expected:null};assert.equal((await repository().publish(x.s,command)).status,'committed');count.save++;count.write++;count.owner++;
   const cl=builder==='summary-v1'?'summary':builder==='keywords-v1'?'index':'cache',r=await graph().ref(x.s,{class:cl,id:plan.id,revision:1});
   // Installed builder serializes a knowledge input as its canonical value.
   const input=Buffer.from(x.save.assertion.value),expected=buildMaintenance(plan,[input]);input.fill(0);return {class:cl,ref:r,repository,command,plan,expected,read:async(s=x.s)=>graph().read(s,r)};
  };
  const ask=async(x:Awaited<ReturnType<typeof core>>)=>{
   const auth=authority(),e=await enrollServiceAccounting(f,auth,'ask',x.s),controls=new QueryControlsRepository(f.uow,auth);
   await controls.set(x.s,{schemaVersion:1,action:'query-controls',sessionId:e.task.binding.sessionId,targetId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),controls:{attachments:false,olderRecall:true,saveReusable:false}});
   const fail=(name:keyof typeof ports)=>async()=>{ports[name]++;throw new Error('Forbidden authority route port '+name);};const forbidden:NativeAskPorts={computer:fail('computer'),shell:fail('shell'),model:fail('model'),enrichment:fail('enrichment'),effect:fail('effect')};
   const repository=()=>{const c=cipher(),g=new SourceRecallBroker(f.uow,authority(),c,keys,new KnowledgeStatusAdmission(c),canonical(),controls);return new NativeAskRepository(new StorageServiceAccounting(f.uow,f.native,e.owner,authority()),g,{resolve:async(_tx,s,n,_key,expiresAt)=>{demand(s.tenantId===x.s.tenantId&&s.spaceId===x.s.spaceId&&s.actorId===x.s.actorId&&n.binding.sessionId===e.task.binding.sessionId,'UNAUTHORIZED');return {...e.command,expiresAt};}},forbidden);};
   const command=AskCommandSchema.parse({schemaVersion:1,sessionId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),question:'What saved decision applies?',selector:{kind:'id',value:x.save.targetId},attachmentIds:[]});
   const http=await startNativeAskHttp(f.verifier,repository());servers.push(http);
   const post=async(raw:unknown=command,credential:string|null|undefined=f.tokens.get(x.s.actorId),s=x.s)=>{const r=await fetch(http.url+`/v1/tenants/${s.tenantId}/spaces/${s.spaceId}/native/ask`,{method:'POST',headers:{'content-type':'application/json',...(credential?{authorization:'Bearer '+credential}:{})},body:JSON.stringify(raw)});return {status:r.status,body:await r.json()};};
   const response=await post();assert.equal(response.status,200,JSON.stringify(response));const result=AskResultSchema.parse(response.body);assert.equal(result.status,'answered');assert.ok(result.answer.includes(x.save.assertion.value));assert.equal(result.computerStarted,false);count.ask++;count.read++;
   const read=async(s=x.s)=>repository().read(s,AskReceiptReadSchema.parse({schemaVersion:1,sessionId:e.task.binding.sessionId,receiptId:result.receiptId,expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString()}));
   return {e,repository,command,result,post,read};
  };
  const capture=()=>new BackupCaptureRepository(f.uow,graph(),cipher(),keys,roots['content']!,roots['backup']!,{}, {artifacts:artifact(),volume:volume()});
  const backup=()=>new BackupConfirmationRepository(f.uow,journal,f.native,graph(),cipher(),keys,roots['backup']!);
  const importer=()=>new RestoreImportRepository(backup(),cipher(),roots['restore']!,{resolve:async()=>({keyId,rootId:roots['restore']!.rootId})});
  const backupOf=async(x:Awaited<ReturnType<typeof core>>)=>{const command={...await base(x.s),action:'backup' as const},captureStarted=performance.now(),c=await capture().capture(x.s,command),captureReturned=performance.now();assert.equal((await backup().confirm(x.s,command)).status,'backup-confirmed');count.backup++;count.write++;console.log(JSON.stringify({measurement:'authority-backup-operation-times',clock:'child-monotonic',spaceKind:x.s.spaceId===f.spaces.personal?'personal':'group',captureMs:captureReturned-captureStarted,confirmMs:performance.now()-captureReturned}));return {command,c,read:async(s=x.s)=>backup().restoreCandidate(s,{schemaVersion:1,sessionId:command.sessionId,backupId:c.backupId,expiresAt:new Date(Date.now()+25_000).toISOString()})};};
  const forget=()=>new ForgetWorkRepository(f.uow,journal,f.native);
  // Synthetic test capabilities only; callers erase their copies. Product
  // resolvers, HTTP inputs, archives, environment and observations expose no key.
  const keyCanaries=()=>[Buffer.from(dataKey),Buffer.from(digestKey)];
  return {f,a,journal,originalCurrent,violations,roots,keyId,generation,ownerBefore,count,ports,cipher,authority,canonical,graph,task,base,core,files,derived,ask,capture,backup,backupOf,importer,forget,artifact,volume,enroll,snapshot,ref,keyCanaries,opens:()=>opens,opensFor:(space:string,cl:string,id:string)=>openIdentities.get(space+'/'+cl+'/'+id)??0,setOnline:(v:boolean)=>{online=v;},close};
 }catch(e){await close();throw e;}
}
export type AuthorityRouteFixture=Awaited<ReturnType<typeof createAuthorityRouteFixture>>;
