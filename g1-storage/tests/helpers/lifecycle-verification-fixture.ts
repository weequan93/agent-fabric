import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createVolumeVerificationFixture} from './volume-verification-fixture.js';
import {volumeVerificationOwner} from './volume-verification-owner.js';
import {enrollServiceAccounting} from './accounting-fixture.js';
import {migrateStorageRestoreActivation,installedOwnerSnapshot} from '../../src/migration.js';
import {EpochWitnessJournal,type OwnedAnchorRoot,EntityRefSchema} from '../../src/epoch-journal.js';
import {KnowledgeSaveRepository,sourceNarrativeDigest} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {SourceContentRepository} from '../../src/source-content.js';
import {DependencyGraphRepository,type GraphRef,type DerivedMaterialOwner} from '../../src/dependency-graph.js';
import {ArtifactPublicationRepository} from '../../src/artifact-publication.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import {PolicyPublicationRepository} from '../../src/policy-publication.js';
import {RetentionWorkRepository} from '../../src/retention-work.js';
import {SourceRevocationRepository} from '../../src/source-revocation.js';
import {QueryControlsRepository} from '../../src/query-controls.js';
import {SourceRecallBroker} from '../../src/recall-broker.js';
import {NativeAskRepository,type NativeAskPorts} from '../../src/native-ask.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {BackupCaptureRepository} from '../../src/backup-capture.js';
import {BackupConfirmationRepository} from '../../src/backup-confirmation.js';
import {demand} from '../../src/errors.js';
import type {AsyncUnitOfWork} from '../../src/owners.js';
import type {SaveCommand} from '../../src/contracts.js';
import type {EpochPublicationHooks} from '../../src/epoch-publication.js';
type EntityRef=ReturnType<typeof EntityRefSchema.parse>;
export const identities=(refs:readonly GraphRef[])=>refs.map(r=>JSON.stringify([r.class,r.id,r.revision,r.witness])).sort();
/** Only the trusted test adapter fixes storage SELECT time. Stored publication
 * functions, real identity/native freshness, COMMIT and durable sweeps retain
 * live PG time. No payload/head/expiry is rewritten to simulate expiration. */
export async function createLifecycleVerificationFixture(){
 const v=await createVolumeVerificationFixture(),f=v.f,scope=v.scope,keys={resolve:async()=>({keyId:v.keyId,generation:v.generation})};let fixedAt:string|undefined,opens=0;
 const crypt=()=>{const c=v.crypto(),open=c.open.bind(c);c.open=async(...args)=>{opens++;return open(...args);};return c;};
 const timed:AsyncUnitOfWork={withScope:async(s,body)=>f.uow.withScope(s,tx=>body({query:async<Row extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[])=>{
  // Native/identity SQL is never altered. Pure SELECT comparisons are storage
  // authority calls; content SELECTs identify their fabric.storage_ tables.
  const storage=sql.includes('fabric.storage_')||/^SELECT clock_timestamp\(\)</.test(sql)||sql.includes('$1::timestamptz<=clock_timestamp()');
  if(fixedAt&&storage&&/^\s*(SELECT|WITH)\b/.test(sql)&&sql.includes('clock_timestamp()'))return tx.query<Row>(sql.replaceAll('clock_timestamp()',`$${values.length+1}::timestamptz`),[...values,fixedAt]);
  return tx.query<Row>(sql,values);
 }}))};
 const journal=()=>new EpochWitnessJournal(v.authorityRoot),graph=(u:AsyncUnitOfWork=timed)=>new DependencyGraphRepository(u,journal(),f.native,crypt(),keys);
 const canonical=(u:AsyncUnitOfWork=timed)=>{const c=crypt();return new KnowledgeSaveRepository(u,journal(),f.native,c,keys,new KnowledgeStatusAdmission(c));};
 const retention=(hooks:EpochPublicationHooks={})=>new RetentionWorkRepository(f.uow,journal(),f.native,hooks);
 const command=(sessionId:string)=>({key:randomUUID(),sessionId,expiresAt:new Date(Date.now()+45_000).toISOString()});
 const denied=async(work:()=>Promise<unknown>,codes:readonly string[]=[])=>{const before=opens;let error:unknown;try{await work();v.violations.unauthorizedDisclosure++;}catch(e){error=e;}assert(error,'required refusal');if(codes.length)assert(codes.includes(String((error as {code?:unknown}).code)),String((error as {code?:unknown}).code));assert.equal(opens,before,'refusal before decryption');v.count.deny++;};
 const snapshot=async()=>{const result=[];for(const table of ['storage_current_heads','storage_commands','storage_outbox','storage_tombstones','storage_restrictions','storage_retention_events','storage_graph_events','storage_graph_jobs','storage_authority_epoch','storage_epoch_publications','storage_tombstone_publications'])result.push([table,(await f.admin.query('SELECT * FROM fabric.'+table+' ORDER BY row_to_json('+table+')::text')).rows]);return result;};
 try{
  await migrateStorageRestoreActivation(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
  // Short backup retention is trusted fixture policy, with a real witnessed
  // publication. Other classes retain their original accepted finite periods.
  const policyTask=await f.task('maintenance');
  assert.equal((await new PolicyPublicationRepository(f.uow,v.journal,f.native).reduce(scope,{...command(policyTask.binding.sessionId),policy:{...v.authorityEnrollment.policy,periods:{...v.authorityEnrollment.policy.periods,backup:20}}})).status,'committed');v.count.write++;
  const ownerBefore=await installedOwnerSnapshot(f.admin),computerBefore=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n;
  const final=async()=>{assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,computerBefore);assert.equal(computerBefore,0);assert(opens>0);v.count.owner++;};
  const source=async(sessionId:string,expiry:string)=>{const narrative='lifecycle-'+randomUUID()+' 漢字 🙂',c={schemaVersion:1,action:'source',...command(sessionId),targetId:randomUUID(),expectedRevision:0,title:'source-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:expiry,saveReusable:true};assert.equal((await canonical(f.uow).source(scope,c)).status,'source-accepted');v.count.save++;v.count.write++;return c;};
  const saved=async(sessionId:string,src:Awaited<ReturnType<typeof source>>,expiry:string,validFrom=new Date(Date.now()-1000).toISOString())=>{const c:SaveCommand={schemaVersion:1,action:'save',...command(sessionId),targetId:randomUUID(),expectedRevision:0,assertion:{subject:'decision-'+randomUUID(),value:src.narrative,sourceId:src.targetId,sourceRevision:1,validFrom,validUntil:null,expiresAt:expiry,classification:'group',intent:'assert',checkId:null}};assert.equal((await canonical(f.uow).save(scope,c)).status,'saved-here');v.count.save++;v.count.write++;return c;};
  const ref=(cl:GraphRef['class'],id:string,revision=1)=>graph().ref(scope,{class:cl,id,revision});
  const derived=async(sessionId:string,cl:'summary'|'index'|'cache',parents:readonly GraphRef[],expiry:string,bytes=Buffer.from('derived-'+randomUUID()),u:AsyncUnitOfWork=f.uow)=>{
   const sourceTaskId=(await f.native.snapshot(scope,sessionId)).binding.taskId,id=randomUUID(),materialId=randomUUID(),c={...command(sessionId),materialId,expected:null},owner:DerivedMaterialOwner={resolve:async()=>({class:cl,id,revision:1,sourceTaskId,expiresAt:expiry,bytes,dependencies:parents})};
   assert.equal((await graph(u).publisher(owner).publish(scope,c)).status,'committed');v.count.save++;v.count.write++;return {ref:await ref(cl,id),bytes,c,owner};
  };
  const scenario=async(lifetime=50_000,volume:boolean|'graph'=true,withAsk=true,withFutureValidity=false)=>{
   const s=await v.scenario(),expiry=new Date(Date.now()+lifetime).toISOString(),src=await source(s.task.binding.sessionId,expiry),c=await saved(s.task.binding.sessionId,src,expiry),sr=await ref('source',src.targetId),kr=await ref('knowledge',c.targetId),sum1=await derived(s.task.binding.sessionId,'summary',[kr],expiry,Buffer.from(c.assertion.value)),sum2=await derived(s.task.binding.sessionId,'summary',[sum1.ref],expiry),index=await derived(s.task.binding.sessionId,'index',[sum2.ref],expiry),cache=await derived(s.task.binding.sessionId,'cache',[index.ref],expiry);
   const futureCommand=withFutureValidity?await saved(s.task.binding.sessionId,src,expiry,new Date(Date.now()+1000).toISOString()):undefined,future=futureCommand?{c:futureCommand,ref:await ref('knowledge',futureCommand.targetId)}:undefined;
   const rows:{class:string;ref:EntityRef|GraphRef;expiryRef?:EntityRef;expiry:string;read:()=>Promise<unknown>}[]=[{class:'source',ref:sr,expiry,read:()=>new SourceContentRepository(timed,graph().authority,crypt()).read(scope,sr)},{class:'knowledge',ref:kr,expiry,read:()=>canonical().recall(scope,kr)},...[sum1,sum2,index,cache].map(n=>({class:n.ref.class,ref:n.ref,expiry,read:()=>graph().read(scope,n.ref)}))];
   if(future)rows.push({class:'knowledge',ref:future.ref,expiry,read:()=>canonical().recall(scope,future.ref)});
   const allAskRefs:GraphRef[]=[];
   const volumeOwner=(u:AsyncUnitOfWork=timed)=>volumeVerificationOwner({uow:u,native:f.native,scope,crypto:crypt(),authorityRoot:v.authorityRoot,root:s.root,witnessRoot:v.witnessRoot,keyId:v.keyId,generation:v.generation,commands:s.commands,retentionExpiresAt:expiry});
   if(volume){const live=s.live(),draft=s.draft({sourceId:src.targetId}),cp=s.checkpoint([live.targetId]);for(const cmd of volume==='graph'?[draft]:[live,draft,cp]){const repo=volumeOwner(f.uow),r=cmd.action==='live-write'?await repo.writeLive(scope,cmd):cmd.action==='draft'?await repo.saveDraft(scope,cmd):await repo.confirmCheckpoint(scope,cmd);assert.equal(r.status,cmd.action==='live-write'?'live-written':cmd.action==='draft'?'draft-saved':'checkpoint-confirmed');v.count.save++;v.count.write++;const cl=cmd.action==='live-write'?'live-file':cmd.action;const h=(await f.admin.query('SELECT v.artifact_id,v.index_witness,a.witness FROM fabric.storage_volume_versions v JOIN fabric.storage_artifact_versions a ON a.id=v.artifact_id WHERE v.kind=$1 AND v.id=$2',[cl,cmd.targetId])).rows[0];assert(h);rows.push({class:cl,ref:{class:cl,id:cmd.targetId,revision:1,witness:h.index_witness},expiryRef:{class:'artifact',id:h.artifact_id,revision:1,witness:h.witness},expiry,read:()=>volumeOwner().read(scope,{kind:cl,id:cmd.targetId,revision:1})});}
    const d=rows.find(r=>r.class==='draft')!,dr=await ref('draft',d.ref.id);d.ref=dr;
    const ac={...s.command,key:randomUUID(),targetId:randomUUID(),sourceId:src.targetId},artifacts=(u:AsyncUnitOfWork=timed)=>new ArtifactPublicationRepository(u,journal(),f.native,crypt(),s.root,new StagingWitnessJournal(v.witnessRoot),{current:async()=>({rootId:s.root.rootId,keyId:v.keyId,generation:v.generation}),resolve:async()=>({rootId:s.root.rootId,keyId:v.keyId,generation:v.generation,retentionExpiresAt:expiry})},{require:async(_tx,caller,r)=>{assert.equal(caller,scope);assert.equal(r.validationId,ac.validationId);assert.equal(r.binding.id,ac.targetId);}});
    await artifacts(f.uow).prepare(scope,ac);assert.equal((await artifacts(f.uow).commit(scope,ac)).status,'artifact-committed');v.count.save++;v.count.write+=2;const ar=await ref('artifact',ac.targetId);rows.push({class:'artifact',ref:ar,expiry,read:()=>timed.withScope(scope,tx=>artifacts().readWithTransaction(tx,scope,ar))});
   }
   let askRead:Record<string,unknown>|undefined;
   const ask=async(u:AsyncUnitOfWork,enrolled:Awaited<ReturnType<typeof enrollServiceAccounting>>)=>{const g=graph(u),cc=crypt(),can=new KnowledgeSaveRepository(u,journal(),f.native,cc,keys,new KnowledgeStatusAdmission(cc)),controls=new QueryControlsRepository(u,g.authority),broker=new SourceRecallBroker(u,g.authority,cc,keys,new KnowledgeStatusAdmission(cc),can,controls);const ports:NativeAskPorts={computer:async()=>{v.violations.askComputerStart++;throw new Error('computer forbidden');},shell:async()=>{throw new Error('shell forbidden');},model:async()=>{throw new Error('model forbidden');},enrichment:async()=>{throw new Error('enrichment forbidden');},effect:async()=>{throw new Error('effect forbidden');}};return new NativeAskRepository(new StorageServiceAccounting(u,f.native,enrolled.owner,g.authority),broker,{resolve:async(_tx,_s,_n,_key,expiresAt)=>({...enrolled.command,expiresAt})},ports,{authorizeReceipt:g.authorizeAskReceipt.bind(g)});};
   const refreshAsk=async()=>{rows.splice(0,rows.length,...rows.filter(r=>r.class!=='ask'));const enrolled=await enrollServiceAccounting(f,graph(f.uow).authority),q=new QueryControlsRepository(f.uow,graph(f.uow).authority);await q.set(scope,{schemaVersion:1,action:'query-controls',...command(enrolled.task.binding.sessionId),targetId:enrolled.task.binding.sessionId,expectedRevision:0,controls:{attachments:false,olderRecall:true,saveReusable:false}});const cmd={schemaVersion:1,...command(enrolled.task.binding.sessionId),expectedRevision:(await f.native.snapshot(scope,enrolled.task.binding.sessionId)).revision,question:'What decision?',selector:{kind:'id',value:kr.id},attachmentIds:[]},repo=await ask(graph(f.uow).askUnitOfWork({resolve:async()=>[cache.ref]}),enrolled),r=await repo.ask(scope,cmd);assert.equal(r.status,'answered');assert(r.answer.includes(c.assertion.value));v.count.ask++;v.count.write++;v.count.read++;askRead={schemaVersion:1,sessionId:cmd.sessionId,receiptId:r.receiptId,expectedRevision:cmd.expectedRevision,expiresAt:cmd.expiresAt};const ar=await ref('ask',r.receiptId),row=(await f.admin.query('SELECT expires_at FROM fabric.storage_ask_receipts WHERE id=$1',[ar.id])).rows[0];allAskRefs.push(ar);rows.push({class:'ask',ref:ar,expiry:row.expires_at.toISOString(),read:async()=>(await ask(timed,enrolled)).read(scope,askRead)});};
   if(withAsk)await refreshAsk();
   const closure=async(root:GraphRef)=>f.uow.withScope(scope,async tx=>(await tx.query('SELECT fabric.storage_graph_closure($1,$2,$3,$4,true) AS refs',[root.class,root.id,root.revision,root.witness])).rows[0]?.['refs'] as GraphRef[]);
   return {s,expiry,src,c,sr,kr,sum1,sum2,index,cache,rows,volumeOwner,closure,refreshAsk,allAskRefs,future};
  };
  const read=async(row:{read:()=>Promise<unknown>})=>{const r=await row.read();if(Buffer.isBuffer(r))r.fill(0);else if(r&&typeof r==='object'&&'bytes' in r&&Buffer.isBuffer(r.bytes))r.bytes.fill(0);v.count.read++;return r;};
  // Wait to the actual server deadline before the existing observation guard;
  // a future deadline is test data, not a maximum fixture-setup duration.
  const waitExpired=async(at:string)=>{const started=(await f.admin.query('SELECT clock_timestamp() AS at')).rows[0].at as Date;const allowance=Math.max(0,Date.parse(at)-started.getTime())+25_000;const rows=await v.until(async()=>(await f.admin.query('SELECT clock_timestamp() AS at,clock_timestamp()>=$1::timestamptz AS expired',[at])).rows[0],r=>r.expired===true,'actual storage expiry',allowance);assert(rows.at>=new Date(at));console.log(JSON.stringify({measurement:'lifecycle-live-expiry',deadline:at,observedAt:rows.at,expired:rows.expired}));};
  const impact=async(sessionId:string,key:string,expected:readonly GraphRef[])=>{const r=await graph(f.uow).impact(scope,{key,sessionId,expiresAt:new Date(Date.now()+30_000).toISOString()});assert.equal(r.affectedDerived,expected.length);assert.deepEqual(identities(r.jobs.map(j=>j.ref)),identities(expected));assert(r.jobs.every(j=>j.status==='pending'));assert.equal(r.cleanup,'pending');assert.equal(r.backupCopies,null);assert.equal(r.externalCopies,null);assert.equal(r.alreadyDeliveredRecalled,false);v.count.propagate++;v.count.read++;return r;};
  const corruption=async(work:(client:pg.PoolClient,g:DependencyGraphRepository)=>Promise<void>)=>{const client=await f.admin.connect();try{await client.query('BEGIN');await client.query("SET LOCAL session_replication_role='replica'");const u:AsyncUnitOfWork={withScope:async(s,body)=>{assert.equal(s,scope);await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true),set_config('app.identity_verified','true',true)",[scope.tenantId,scope.spaceId,scope.actorId]);return body({query:async<Row extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[])=>{const r=await client.query<Row>(sql,[...values]);return {rows:r.rows,rowCount:r.rowCount};}});}};await work(client,graph(u));}finally{await client.query('ROLLBACK');client.release();}};
  const backup=async(x:Awaited<ReturnType<typeof scenario>>)=>{const roots=JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>,cmd={schemaVersion:1 as const,action:'backup' as const,...command(x.s.task.binding.sessionId),targetId:randomUUID(),expectedRevision:0},owners=x.volumeOwner(f.uow),captured=await new BackupCaptureRepository(f.uow,graph(f.uow),crypt(),keys,x.s.root,roots['backup']!,{},{artifacts:owners.artifacts,volume:owners}).capture(scope,cmd),owner=(u:AsyncUnitOfWork=timed)=>new BackupConfirmationRepository(u,journal(),f.native,graph(u),crypt(),keys,roots['backup']!);assert.equal((await owner(f.uow).confirm(scope,cmd)).status,'backup-confirmed');v.count.backup++;v.count.save++;v.count.write++;const head=(await f.admin.query("SELECT witness FROM fabric.storage_current_heads WHERE class='backup' AND id=$1",[captured.backupId])).rows[0];assert(head);return {class:'backup',ref:{class:'backup' as const,id:captured.backupId,revision:1,witness:head.witness},expiry:captured.expiresAt,read:()=>owner().restoreCandidate(scope,{schemaVersion:1,sessionId:cmd.sessionId,backupId:captured.backupId,expiresAt:new Date(Date.now()+45_000).toISOString()}),captured};};
  return {...v,final,graph,canonical,retention,source,saved,derived,scenario,ref,command,denied,read,snapshot,waitExpired,impact,corruption,backup,clock:(at?:string)=>{fixedAt=at;},openCount:()=>opens};
 }catch(e){await v.close();throw e;}
}
export type LifecycleVerificationFixture=Awaited<ReturnType<typeof createLifecycleVerificationFixture>>;
