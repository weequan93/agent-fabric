import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {PoolClient} from 'pg';
import {createAuthorityRouteFixture,type AuthorityRouteFixture} from './authority-route-fixture.js';
import {enrollServiceAccounting,accountingSnapshot} from './accounting-fixture.js';
import {emitObservations} from './observations.js';
import type {ComponentTest} from './canonical-component.js';
import {QueryControlsRepository} from '../../src/query-controls.js';
import {SourceRecallBroker,type RecallSelection} from '../../src/recall-broker.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {NativeAskRepository,type AskDisclosureHooks,type NativeAskPorts} from '../../src/native-ask.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {SourceRevocationRepository} from '../../src/source-revocation.js';
import {TombstonePublicationRepository} from '../../src/tombstone-publication.js';
import {AskCommandSchema,AskResultSchema,AskPayloadSchema,BindingSchema,ArtifactCommandSchema} from '../../src/schema.js';
import {CurrentRetrievalManifestSchema} from '../../src/ask-disclosure-schema.js';
import {installedOwnerSnapshot} from '../../src/migration.js';
import type {VerifiedScope,SqlTransaction} from '../../src/owners.js';

type Core=Awaited<ReturnType<AuthorityRouteFixture['core']>>;
const gate=()=>{let release!:()=>void;return {wait:new Promise<void>(r=>release=r),release:()=>release()};};
async function blocked(f:AuthorityRouteFixture,pid:number,variant:string,minimum=1){
 const deadline=Date.now()+3000;let rows:Record<string,unknown>[]=[];
 do{await f.f.admin.query('SELECT pg_stat_clear_snapshot()');rows=(await f.f.admin.query('SELECT pid,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows;if(rows.length>=minimum)break;}while(Date.now()<deadline);
 assert(rows.length>=minimum,'Actual queued PostgreSQL work required');for(const r of rows)assert((r['blockers'] as number[]).includes(pid));
 console.log(JSON.stringify({measurement:'ask-disclosure-lock',variant,blockerPid:pid,waiters:rows}));
}
function restrictionCode(e:unknown){const code=String(e&&typeof e==='object'&&'code' in e?e.code:undefined);assert(['STALE_AUTHORITY','UNAUTHORIZED','RETENTION_RESTRICTED','AUTHORITY_UNAVAILABLE','CONTENT_UNAVAILABLE','STALE_REVISION','STALE_FENCE','INVALID_COMMAND','CHECK_BINDING_MISMATCH'].includes(code),'Actual current binding/authority refusal required: '+code);return code;}
async function refusal(f:AuthorityRouteFixture,work:()=>Promise<unknown>,expectedCode?:'INVALID_SCHEMA'){
 const n=f.opens(),before=await f.snapshot();let rejected=false;
 try{await work();f.violations.unauthorizedDisclosure++;assert.fail('Current restriction must refuse disclosure');}catch(e){if(e instanceof assert.AssertionError)throw e;if(expectedCode)assert.equal(e&&typeof e==='object'&&'code' in e?e.code:undefined,expectedCode);else restrictionCode(e);rejected=true;}
 assert(rejected);assert.equal(f.opens(),n,'Refuse before decrypt');assert.deepEqual(await f.snapshot(),before,'Refusal has no storage or economic effects');f.count.deny++;
}
async function enrollment(f:AuthorityRouteFixture,x:Core,s:VerifiedScope=x.s){
 const e=await enrollServiceAccounting(f.f,f.authority(),'ask',s),controls=new QueryControlsRepository(f.f.uow,f.authority()),sourceTaskId=(await f.task(x.s)).binding.taskId;
 const expectedRecipients=(await f.f.admin.query('SELECT actor_id FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND revoked_at IS NULL ORDER BY actor_id',[s.tenantId,s.spaceId])).rows.map(r=>String(r.actor_id));
 await controls.set(s,{schemaVersion:1,action:'query-controls',sessionId:e.task.binding.sessionId,targetId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),controls:{attachments:false,olderRecall:true,saveReusable:false}});
 const command=AskCommandSchema.parse({schemaVersion:1,sessionId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),question:'What saved decision applies? '+randomUUID(),selector:{kind:'id',value:x.save.targetId},attachmentIds:[]});
 const inputs:RecallSelection[]=[],payloads:ReturnType<typeof AskPayloadSchema.parse>[]=[];
 const fail=(name:keyof typeof f.ports)=>async()=>{f.ports[name]++;if(name==='computer')f.violations.askComputerStart++;throw new Error('Forbidden Ask port '+name);};
 const ports:NativeAskPorts={computer:fail('computer'),shell:fail('shell'),model:fail('model'),enrichment:fail('enrichment'),effect:fail('effect')};
 const repository=(hooks:AskDisclosureHooks={})=>{
  const c=f.cipher(),seal=c.seal.bind(c);c.seal=async(...args)=>{if(BindingSchema.parse(args[0]).class==='ask'){const payload=AskPayloadSchema.parse(JSON.parse(args[1].toString()));CurrentRetrievalManifestSchema.parse(payload.manifest);payloads.push(payload);}return seal(...args);};
  const broker=new SourceRecallBroker(f.f.uow,f.authority(),c,{resolve:async()=>({keyId:f.keyId,generation:f.generation})},new KnowledgeStatusAdmission(c),f.canonical(),controls);
  const repo=new NativeAskRepository(new StorageServiceAccounting(f.f.uow,f.f.native,e.owner,f.authority()),broker,{resolve:async(_tx,scope,n,_key,expiresAt)=>{assert.equal(scope.tenantId,s.tenantId);assert.equal(scope.spaceId,s.spaceId);assert.equal(scope.actorId,s.actorId);assert.equal(n.binding.sessionId,e.task.binding.sessionId);f.count.owner++;return {...e.command,expiresAt};}},ports,hooks),route=repo.route.bind(repo);
  repo.route=async(kind,selection)=>{assert.equal(kind,'local-extractive-v1');inputs.push(selection);return route(kind,selection);};return repo;
 };
 const read=(id:string)=>({schemaVersion:1,sessionId:e.task.binding.sessionId,receiptId:id,expectedRevision:0,expiresAt:command.expiresAt});
 return {e,s,command,repository,read,inputs,payloads,sourceTaskId,expectedRecipients};
}
function exact(f:AuthorityRouteFixture,x:Core,value:unknown){const r=AskResultSchema.parse(value),m=CurrentRetrievalManifestSchema.parse(r.manifest);assert.equal(r.status,'answered');assert(r.answer.includes(x.save.assertion.value));assert.equal(m.spaceId,x.s.spaceId);assert.equal(m.selected[0]?.knowledgeId,x.save.targetId);assert.equal(m.selected[0]?.source.sourceId,x.source.targetId);assert.equal(m.selected[0]?.source.digest,x.source.contentDigest);assert.deepEqual(m.selected[0]?.source.audience,m.audience);f.count.ask++;f.count.read++;return r;}
function preparedInput(en:Awaited<ReturnType<typeof enrollment>>,x:Core){assert.equal(en.inputs.length,1);assert.equal(en.inputs[0]?.records[0]?.value,x.save.assertion.value);assert.equal(en.inputs[0]?.records[0]?.source.sourceId,x.source.targetId);assert.equal(en.inputs[0]?.records[0]?.source.sourceTaskId,en.sourceTaskId);assert.equal(en.payloads.length,1);assert(en.payloads[0]!.answer.includes(x.save.assertion.value));const m=CurrentRetrievalManifestSchema.parse(en.payloads[0]!.manifest);assert.equal(m.selected[0]?.knowledgeWitness,x.knowledgeRef.witness);assert.equal(m.selected[0]?.sourceWitness,x.sourceRef.witness);assert.equal(m.selected[0]?.source.sourceId,x.source.targetId);assert.equal(m.selected[0]?.source.sourceTaskId,en.sourceTaskId);assert.deepEqual([...m.audience.recipientActorIds].sort(),en.expectedRecipients);assert.deepEqual(m.selected[0]?.source.audience,m.audience);return m;}

/** Every frozen Q04/Q07 variant uses installed native, canonical and resource
 * owners. Gates select actual PG transaction winners; no synthetic answer or
 * alternative authority implementation is used. */
export async function registerAskDisclosureVerificationTests(suite:'verify-ask-disclosure'|'recall-ask',register:ComponentTest=test,observe=emitObservations){
 const positives={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const family=async(id:string,body:(t:TestContext,f:AuthorityRouteFixture)=>Promise<void>)=>register(id+' / installed Ask disclosure and immutable Space binding',async t=>{
  const root=process.env['STORAGE_REPO_ROOT'];assert(root);const harness=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let callbacks=0;
  await harness.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const prior=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));let f:AuthorityRouteFixture|undefined;
   try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;f=await createAuthorityRouteFixture();await body(t,f);assert.equal(await installedOwnerSnapshot(f.f.admin),f.ownerBefore);assert.deepEqual(f.ports,{computer:0,shell:0,model:0,enrichment:0,effect:0});assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,0);for(const k of Object.keys(positives) as (keyof typeof positives)[])positives[k]+=f.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];}
   finally{try{await f?.close();}finally{for(const [k,v] of prior)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });assert.equal(callbacks,1);
 });
 await family('Q04',async(t,f)=>{
  let survivor:Core|undefined,oldAudience='';const removed:VerifiedScope[]=[];
  for(const mode of ['forget','source-revoke','membership-remove','correction'] as const)for(const order of ['before','after'] as const)await t.test(`Q04/${mode}-${order}-disclosure`,async()=>{
   const variant=`Q04/${mode}-${order}-disclosure`,s=mode==='membership-remove'&&order==='after'?await f.f.scopeFor(f.f.actors[0],f.f.spaces.secondary):f.f.scope,x=await f.core(s),en=await enrollment(f,x),member=mode==='membership-remove'?await f.f.scopeFor(f.f.actors[1],s.spaceId):s,memberEn=mode==='membership-remove'?await enrollment(f,x,member):undefined;
   const prepared=gate(),releasePrepared=gate(),disclosing=gate(),releaseDisclosure=gate(),restrictionHeld=gate(),releaseRestriction=gate();let receiptId='',pid=0,admissions=0,admin:PoolClient|undefined,pending:Promise<unknown>|undefined,restrict:Promise<unknown>|undefined;
   const afterPublication=async(tx:SqlTransaction)=>{if(order==='before'){pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);restrictionHeld.release();await releaseRestriction.wait;}};
   const mutate=async()=>{
    const common={key:randomUUID(),sessionId:(await f.task(s)).binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString()};
    if(mode==='forget')return new TombstonePublicationRepository(f.f.uow,f.journal,f.f.native,{afterPublication}).forget(s,{...common,entity:x.knowledgeRef});
    if(mode==='source-revoke')return new SourceRevocationRepository(f.f.uow,f.journal,f.f.native,{afterPublication}).revoke(s,{...common,source:{id:x.sourceRef.id,revision:x.sourceRef.revision,witness:x.sourceRef.witness}});
    if(mode==='correction')return f.canonical({afterPublication}).correct(s,{command:{...x.save,...common,action:'correct',expectedRevision:1,assertion:{...x.save.assertion,value:'corrected-'+randomUUID()}},prior:x.knowledgeRef});
    admin=await f.f.admin.connect();try{await admin.query('BEGIN');await admin.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',s.tenantId,s.spaceId])]);await admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[member.tenantId,member.spaceId,member.actorId]);await afterPublication(admin);await admin.query('COMMIT');return {status:'committed'};}catch(e){await admin.query('ROLLBACK');throw e;}finally{admin.release();admin=undefined;}
   };
   try{
    if(memberEn){const selection=await memberEn.repository().broker.retrieve(member,{sessionId:memberEn.command.sessionId,expiresAt:memberEn.command.expiresAt,selector:memberEn.command.selector,attachmentIds:[]});assert.equal(selection.records[0]?.value,x.save.assertion.value);f.count.read++;}
    const repo=en.repository({beforeDisclosure:async id=>{receiptId=id;prepared.release();await releasePrepared.wait;},authorizeReceipt:async tx=>{admissions++;if(order==='after'&&admissions===1){pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);disclosing.release();await releaseDisclosure.wait;}}});
    pending=repo.ask(s,en.command);pending.catch(()=>{});await Promise.race([prepared.wait,pending.then(()=>assert.fail('Ask bypassed prepared gate'))]);
    const manifest=preparedInput(en,x);assert(manifest.audience.recipientActorIds.includes(member.actorId));assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_ask_receipts WHERE id=$1',[receiptId])).rows[0].n,1);f.count.write++;
    const opens=f.opensFor(s.spaceId,'ask',receiptId),economic=await accountingSnapshot(f.f);
    if(order==='after'){releasePrepared.release();await Promise.race([disclosing.wait,pending.then(()=>assert.fail('Ask bypassed disclosure transaction gate'))]);}
    restrict=mutate();restrict.catch(()=>{});
    if(order==='before'){
     await Promise.race([restrictionHeld.wait,restrict.then(()=>assert.fail('Restriction bypassed publication gate'))]);releasePrepared.release();await blocked(f,pid,variant);releaseRestriction.release();const r=await restrict as {status:string};assert.equal(r.status,mode==='correction'?'saved-here':'committed');
     await assert.rejects(pending,e=>{restrictionCode(e);return true;});assert.equal(f.opensFor(s.spaceId,'ask',receiptId),opens);assert.deepEqual(await accountingSnapshot(f.f),economic);f.count.deny++;
    }else{await blocked(f,pid,variant);releaseDisclosure.release();const r=exact(f,x,await pending);assert.deepEqual(r.manifest,manifest);assert.equal((await restrict as {status:string}).status,mode==='correction'?'saved-here':'committed');assert.equal(f.opensFor(s.spaceId,'ask',receiptId),opens+1);}
    f.count.write++;if(mode==='forget')f.count.forget++;if(mode==='correction')f.count.save++;
    if(mode==='membership-remove'){removed.push(member);if(order==='before'){survivor=x;oldAudience=manifest.audience.revisionDigest;}assert((await f.f.admin.query('SELECT revoked_at FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[s.tenantId,s.spaceId,member.actorId])).rows[0].revoked_at instanceof Date);}
    await refusal(f,()=>en.repository().read(s,en.read(receiptId)));await refusal(f,()=>en.repository().ask(s,en.command));
    if(memberEn){await refusal(f,()=>memberEn.repository().ask(member,memberEn.command));await refusal(f,()=>x.readKnowledge(member));}
    console.log(JSON.stringify({measurement:'ask-disclosure-winner',variant,receiptId,preGeneratorKnowledgeIds:en.inputs[0]!.records.map(r=>r.id),prePublicationManifest:manifest,restrictionCommitted:true,deliveredBeforeRestriction:order==='after',futureDeliveriesRefused:true,unauthorizedAnswerOpens:0,alreadyDeliveredRecalled:false}));
   }finally{releasePrepared.release();releaseDisclosure.release();releaseRestriction.release();await Promise.allSettled([pending,restrict].filter((p):p is Promise<unknown>=>!!p));if(admin){await admin.query('ROLLBACK');admin.release();}}
  });
  await t.test('Q04/remaining-member-allowed',async()=>{assert(survivor);assert.equal(removed.length,2);const en=await enrollment(f,survivor),r=exact(f,survivor,await en.repository().ask(survivor.s,en.command));const m=preparedInput(en,survivor);assert.notEqual(m.audience.revisionDigest,oldAudience);assert(m.audience.recipientActorIds.includes(survivor.s.actorId));assert(!m.audience.recipientActorIds.includes(removed[0]!.actorId));assert.deepEqual(await en.repository().read(survivor.s,en.read(r.receiptId)),r);f.count.read++;f.count.write++;});
 });
 await family('Q07',async(t,f)=>{
  const a=await f.core(f.f.scope),sB=await f.f.scopeFor(f.f.actors[0],f.f.spaces.secondary),b=await f.core(sB),enA=await enrollment(f,a),enB=await enrollment(f,b);let currentSpace=sB.spaceId;
  await t.test('Q07/immutable-session-space',async()=>{
   assert.equal(currentSpace,sB.spaceId);const r=exact(f,a,await enA.repository().ask(a.s,enA.command));preparedInput(enA,a);assert.equal(r.manifest.spaceId,a.s.spaceId);assert(!r.answer.includes(b.save.assertion.value));assert.equal((await f.f.native.snapshot(a.s,enA.command.sessionId)).binding.spaceId,a.s.spaceId);assert.deepEqual(await enA.repository().read(a.s,enA.read(r.receiptId)),r);f.count.read++;f.count.write++;
   for(const hints of [{currentSpace:sB.spaceId},{spaceId:sB.spaceId},{actorId:f.f.actors[1]},{payerId:f.f.sharePayer},{targetId:b.save.targetId}])await refusal(f,()=>enA.repository().ask(a.s,{...enA.command,...hints}),'INVALID_SCHEMA');
  });
  await t.test('Q07/foreign-session-denied',async()=>{await refusal(f,()=>enA.repository().ask(sB,enA.command));await refusal(f,()=>enB.repository().ask(a.s,enB.command));const foreign=await f.f.scopeFor(f.f.foreignActor,f.f.spaces.foreign);await refusal(f,()=>enA.repository().ask(foreign,enA.command));});
  await t.test('Q07/queued-space-switch',async()=>{
   const x=await f.core(a.s),en=await enrollment(f,x),save={...x.save,...await f.base(a.s),assertion:{...x.save.assertion,subject:'queued-'+randomUUID(),value:'queued-value-'+randomUUID()}},bytes=Buffer.from('queued-attachment-'+randomUUID()),artifact=ArtifactCommandSchema.parse({...await f.base(a.s),action:'artifact',filename:'attachment.txt',bytes:bytes.toString('base64'),sourceId:x.source.targetId,validationId:randomUUID()});
   const blocker=await f.f.admin.connect();let pendingAsk:Promise<unknown>|undefined,pendingSave:Promise<unknown>|undefined,pendingArtifact:Promise<unknown>|undefined;
   try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',a.s.tenantId,a.s.spaceId])]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);currentSpace=a.s.spaceId;
    // Observe actual installed Ask waiting under A, then complete its current
    // disclosure before the independent queued writes advance A's epoch.
    pendingAsk=en.repository().ask(a.s,en.command);pendingAsk.catch(()=>{});await blocked(f,pid,'Q07/queued-space-switch-ask');currentSpace=sB.spaceId;await blocker.query('COMMIT');const result=exact(f,x,await pendingAsk);assert.equal(result.manifest.spaceId,a.s.spaceId);preparedInput(en,x);assert.deepEqual(await en.repository().read(a.s,en.read(result.receiptId)),result);f.count.read++;
    await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',a.s.tenantId,a.s.spaceId])]);currentSpace=a.s.spaceId;pendingSave=f.canonical().save(a.s,save);pendingSave.catch(()=>{});await blocked(f,pid,'Q07/queued-space-switch-save');currentSpace=sB.spaceId;await blocker.query('COMMIT');assert.equal((await pendingSave as {status:string}).status,'saved-here');assert.equal(currentSpace,sB.spaceId);
    // Artifact prepare pins current authority. Prepare only after the queued
    // canonical save commits, then observe its own real queued A publication.
    f.enroll(a.s,artifact,x.source.retentionExpiresAt);await f.artifact().prepare(a.s,artifact);await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',a.s.tenantId,a.s.spaceId])]);currentSpace=a.s.spaceId;pendingArtifact=f.artifact().commit(a.s,artifact);pendingArtifact.catch(()=>{});await blocked(f,pid,'Q07/queued-space-switch-attachment');currentSpace=sB.spaceId;await blocker.query('COMMIT');assert.equal((await pendingArtifact as {status:string}).status,'artifact-committed');assert.equal(currentSpace,sB.spaceId);
    const k=(await f.f.admin.query('SELECT * FROM fabric.storage_knowledge_revisions WHERE id=$1',[save.targetId])).rows;assert.equal(k.length,1);assert.equal(k[0].space_id,a.s.spaceId);assert.equal(k[0].source_task_id,(await f.task(a.s)).binding.taskId);const knowledgeRef={...await f.ref(a.s,'knowledge',save.targetId),class:'knowledge' as const},knowledge=await f.canonical().recall(a.s,knowledgeRef);assert.equal(knowledge.value,save.assertion.value);const ref={...await f.ref(a.s,'artifact',artifact.targetId),class:'artifact' as const},read=await f.artifact().read(a.s,ref);try{assert(read.bytes.equals(bytes));}finally{read.bytes.fill(0);}await refusal(f,()=>f.artifact().read(sB,ref));await refusal(f,()=>f.canonical().recall(sB,knowledgeRef));f.count.save+=2;f.count.write+=3;f.count.read+=2;
   }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled([pendingAsk,pendingSave,pendingArtifact].filter((p):p is Promise<unknown>=>!!p));bytes.fill(0);}
  });
  await t.test('Q07/billing-no-merge',async()=>{
   assert.equal(a.s.payerId,sB.payerId);const r=exact(f,b,await enB.repository().ask(sB,enB.command));assert(!r.answer.includes(a.save.assertion.value));preparedInput(enB,b);const gapEn=await enrollment(f,b),gap=AskResultSchema.parse(await gapEn.repository().ask(sB,{...gapEn.command,selector:{kind:'id',value:a.save.targetId}}));assert.equal(gap.status,'evidence-gap');assert.deepEqual(gap.manifest.selected,[]);assert(!gap.answer.includes(a.save.assertion.value));assert.equal(gapEn.inputs[0]?.records.length,0);assert.equal(gapEn.payloads[0]?.manifest.selected.length,0);f.count.ask++;f.count.read++;f.count.write+=2;
   for(const e of [enA,enB,gapEn]){const rows=(await f.f.admin.query('SELECT space_id,payer_id,resource_id FROM fabric.model_resource_bindings WHERE resource_id=$1',[e.e.receipt.resourceId])).rows;assert.equal(rows.length,1);assert.equal(rows[0].space_id,e.s.spaceId);assert.equal(rows[0].payer_id,e.s.payerId);}assert.equal((await f.f.native.snapshot(a.s,enA.command.sessionId)).binding.spaceId,a.s.spaceId);assert.equal((await f.f.native.snapshot(sB,enB.command.sessionId)).binding.spaceId,sB.spaceId);
  });
 });
 observe({schemaVersion:1,measurement:'storage-observations',suite,positives,violations});return {positives,violations};
}
