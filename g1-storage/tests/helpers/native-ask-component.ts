import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ComponentTest } from './canonical-component.js';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { enrollServiceAccounting,accountingSnapshot } from './accounting-fixture.js';
import { emitObservations } from './observations.js';
import { migrateStorageQueryControls,migrateStorageNativeAsk,installedOwnerSnapshot,storageSchemaSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,sourceNarrativeDigest } from '../../src/knowledge-save.js';
import { KnowledgeStatusAdmission } from '../../src/knowledge-status.js';
import { QueryControlsRepository } from '../../src/query-controls.js';
import { SourceRecallBroker } from '../../src/recall-broker.js';
import { NativeAskRepository,startNativeAskHttp,type NativeAskAccountingOwner,type NativeAskPorts } from '../../src/native-ask.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { BorrowedUnitOfWork,StorageServiceAccounting } from '../../src/resource-composition.js';
import { NativeRepository,ResourceReceiptSchema,type ResourceReceipt } from '../../src/owners.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { PostgresTaskRepository } from '../../../g1-foundations/src/task-repository.js';
import { TaskCallBindingSchema } from '../../../g1-model/src/schema.js';
import { SessionLoop } from '../../../g1-model/src/native-imports.js';
import { RecoveryRepository,leaseSchema } from '../../../g1-recovery/src/repository.js';
import { runSchema,sessionSchema,bindingDigest } from '../../../g1-recovery/src/contracts.js';
import { TombstonePublicationRepository } from '../../src/tombstone-publication.js';
import { AskCommandSchema,AskResultSchema,AskPayloadSchema,BindingSchema } from '../../src/schema.js';
import { demand } from '../../src/errors.js';
import type { SaveCommand } from '../../src/contracts.js';

/** Shared HTTP/native/resource assertions. The component and full Ask suite
 * invoke this complete registration with fresh owned PostgreSQL and real OIDC.
 * Content positives are random persisted bytes; every refusal checks actual
 * broker/open counters and the installed economic rows. */
export function registerNativeAskTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('NATIVE-ASK/behavior / authenticated native useful Ask',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID(),keys={resolve:async()=>({keyId,generation})};
  const counters={computer:0,shell:0,model:0,enrichment:0,effect:0};
  const ports:NativeAskPorts={computer:async()=>{counters.computer++;throw new Error('Forbidden computer called');},shell:async()=>{counters.shell++;throw new Error('Forbidden shell called');},model:async()=>{counters.model++;throw new Error('Forbidden model called');},enrichment:async()=>{counters.enrichment++;throw new Error('Forbidden enrichment called');},effect:async()=>{counters.effect++;throw new Error('Forbidden effect called');}};
  let opens=0,brokerCalls=0,ownerCalls=0,saveCount=0,asks=0,reads=0,writes=0,denials=0,leaks=0,lost=0,duplicates=0;
  const crypto=()=>{const c=new CryptoStore({resolve:async()=>({dataKey,digestKey})}),open=c.open.bind(c);c.open=async(...args)=>{opens++;return open(...args);};return c;};
  let http:Awaited<ReturnType<typeof startNativeAskHttp>>|undefined;
  try{
   await migrateStorageQueryControls(f.admin,options);const ownerBefore=await installedOwnerSnapshot(f.admin),a=await enrollAuthority(f),scope=await f.scopeFor(f.actors[0],f.spaces.personal);
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
   await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const authority=new StorageAuthorityRepository(journal,f.native),controls=new QueryControlsRepository(f.uow,authority),sourceTask=await f.task('maintenance',scope);
   const canonical=(c=crypto())=>new KnowledgeSaveRepository(f.uow,journal,f.native,c,keys,new KnowledgeStatusAdmission(c));
   const enrolled=new Map<string,Awaited<ReturnType<typeof enrollServiceAccounting>>>(),receiptState=new Map<string,{receipts:Map<string,ResourceReceipt>;keys:Map<string,string>;calls:number}>();
   const accountingOwner:NativeAskAccountingOwner={resolve:async(_tx,s,snapshot,key,expiresAt)=>{
    ownerCalls++;const e=enrolled.get(snapshot.binding.sessionId),state=receiptState.get(snapshot.binding.sessionId);demand(e&&state&&s.tenantId===scope.tenantId&&s.spaceId===scope.spaceId&&s.actorId===scope.actorId,'UNAUTHORIZED');let receiptId=state.keys.get(key);
    if(!receiptId){const n=state.keys.size,receipt=ResourceReceiptSchema.parse({...e.receipt,receiptId:n===0?e.receipt.receiptId:randomUUID(),start:n*3,end:n*3+3});receiptId=receipt.receiptId;state.receipts.set(receiptId,receipt);state.keys.set(key,receiptId);}
    return {...e.command,receiptId,expiresAt};
   }};
   // A repository owns an installed receipt owner. Give each session a fresh
   // repository/owner so no request can redirect receipt custody across owners.
   const makeFor=(e:Awaited<ReturnType<typeof enrollServiceAccounting>>,afterSeal?:()=>Promise<void>)=>{
    const c=crypto(),broker=new SourceRecallBroker(f.uow,authority,c,keys,new KnowledgeStatusAdmission(c),canonical(c),controls),retrieve=broker.retrieveInTransaction.bind(broker);
    broker.retrieveInTransaction=async(...args)=>{brokerCalls++;return retrieve(...args);};
    if(afterSeal){const seal=c.seal.bind(c);c.seal=async(...args)=>{const envelope=await seal(...args);await afterSeal();return envelope;};}
    const state=receiptState.get(e.task.binding.sessionId);demand(state);const owner={ownerId:e.owner.ownerId,receipt:async(id:string)=>{state.calls++;const r=state.receipts.get(id);demand(r,'CHECK_BINDING_MISMATCH');return r;},suspension:async()=>{throw new Error('Logical service has no suspension');}};
    return new NativeAskRepository(new StorageServiceAccounting(f.uow,f.native,owner,authority),broker,accountingOwner,ports);
   };
   const enrollment=async(rate=1)=>{const e=await enrollServiceAccounting(f,authority,'ask',scope,rate);enrolled.set(e.task.binding.sessionId,e);receiptState.set(e.task.binding.sessionId,{receipts:new Map(),keys:new Map(),calls:0});await controls.set(scope,{schemaVersion:1,action:'query-controls',sessionId:e.task.binding.sessionId,targetId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),controls:{attachments:false,olderRecall:true,saveReusable:false}});return e;};
   const saved=async(retentionMs=55_000)=>{
    const narrative='native-source-'+randomUUID(),source={schemaVersion:1,action:'source',sessionId:sourceTask.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),title:'native-private-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+retentionMs).toISOString(),saveReusable:true};
    const accepted=await canonical().source(scope,source);assert.equal(accepted.status,'source-accepted');demand(accepted.status==='source-accepted');
    const command:SaveCommand={schemaVersion:1,action:'save',sessionId:sourceTask.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+35_000).toISOString(),assertion:{subject:'decision-'+randomUUID(),value:'A-'+randomUUID()+' 漢字 🙂',sourceId:accepted.source.id,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(source.retentionExpiresAt)-500).toISOString(),classification:'personal',intent:'assert',checkId:null}};
    assert.equal((await canonical().save(scope,command)).status,'saved-here');saveCount++;writes+=2;return {command,source};
   };
   const request=async(e:Awaited<ReturnType<typeof enrollment>>,id:string,extra:Record<string,unknown>={})=>AskCommandSchema.parse({schemaVersion:1,sessionId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:(await f.native.snapshot(scope,e.task.binding.sessionId)).revision,expiresAt:new Date(Date.now()+30_000).toISOString(),question:'What decision applies? '+randomUUID(),selector:{kind:'id',value:id},attachmentIds:[],...extra});
   const accepted=async(repository:NativeAskRepository,command:ReturnType<typeof AskCommandSchema.parse>)=>{const r=AskResultSchema.parse(await repository.ask(scope,command));asks++;reads+=r.manifest.selected.length;return r;};
   const post=async(command:unknown,credential=f.tokens.get(scope.actorId),path=`/v1/tenants/${scope.tenantId}/spaces/${scope.spaceId}/native/ask`)=>{
    demand(http,'AUTHORITY_UNAVAILABLE');const res=await fetch(http.url+path,{method:'POST',headers:{'content-type':'application/json',...(credential?{authorization:'Bearer '+credential}:{})},body:JSON.stringify(command)});return {status:res.status,body:await res.json() as Record<string,unknown>};
   };
   const denied=async(work:()=>Promise<unknown>,codes:readonly string[]=[])=>{
    const before=[opens,brokerCalls],economic=await accountingSnapshot(f);let caught=false;
    try{await work();leaks++;}catch(e){caught=true;if(codes.length)assert.ok(codes.includes(String((e as {code?:string}).code)),String((e as {code?:string}).code));}
    assert.equal(caught,true);assert.deepEqual([opens,brokerCalls],before,'refusal precedes evidence and ciphertext');assert.deepEqual(await accountingSnapshot(f),economic);denials++;
   };
   await t.test('NATIVE-ASK/build-migration',async()=>{
    await assert.rejects(migrateStorageNativeAsk(f.admin,{...options,injectBeforeCommit:true}),{message:'Injected native ask migration rollback'});
    assert.equal((await f.admin.query("SELECT to_regclass('fabric.storage_ask_receipts') AS r")).rows[0].r,null);
    await migrateStorageNativeAsk(f.admin,options);const schema=await storageSchemaSnapshot(f.admin);await migrateStorageNativeAsk(f.admin,options);assert.equal(await storageSchemaSnapshot(f.admin),schema);assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   });
   await t.test('NATIVE-ASK/registration-preservation',async()=>{
    const guard=await import(pathToFileURL(resolve(f.root,'g1-storage/scripts/native-ask-registration.mjs')).href),source=await readFile(resolve(f.root,'g1-storage/scripts/manifest.mjs'),'utf8');assert.equal(guard.assertNativeAskRegistration().onlyPinChanged,'scripts/manifest.mjs');
    for(const bad of [source.replace('"C01/roundtrip"','"C01/weakened"'),source+'\n// unregistered extension',source.replace('"native-ask":','"dynamic-ask":')])assert.throws(()=>guard.assertNativeAdditiveRegistry(bad));
   });
   const main=await enrollment(),sample=await saved();let aCommand=await request(main,sample.command.targetId),aAnswer:ReturnType<typeof AskResultSchema.parse>|undefined,bCommand:typeof aCommand|undefined,bAnswer:typeof aAnswer;
   await t.test('NATIVE-ASK/random-save-recreate-http-A',async()=>{
    http=await startNativeAskHttp(f.verifier,makeFor(main));const response=await post(aCommand);assert.equal(response.status,200,JSON.stringify(response));aAnswer=AskResultSchema.parse(response.body);assert.equal(aAnswer.status,'answered');assert.ok(aAnswer.answer.includes(sample.command.assertion.value));assert.equal(aAnswer.profile,'local-extractive-v1');assert.equal(aAnswer.computerStarted,false);assert.deepEqual(aAnswer.manifest.selected.map(r=>r.knowledgeId),[sample.command.targetId]);asks++;reads++;
    await http.close();http=await startNativeAskHttp(f.verifier,makeFor(main));const recreated=await post(aCommand);assert.equal(recreated.status,200,JSON.stringify(recreated));assert.deepEqual(recreated.body,aAnswer);asks++;reads++;
   });
   await t.test('NATIVE-ASK/correct-recreate-http-B',async()=>{
    const row=(await f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE id=$1 ORDER BY revision DESC LIMIT 1',[sample.command.targetId])).rows[0];
    const value='B-'+randomUUID()+' 汉字 🙂';assert.equal((await canonical().correct(scope,{command:{...sample.command,action:'correct',key:randomUUID(),expectedRevision:1,expiresAt:new Date(Date.now()+30_000).toISOString(),assertion:{...sample.command.assertion,value}},prior:{class:'knowledge',id:sample.command.targetId,revision:Number(row.revision),witness:String(row.witness)}})).status,'saved-here');saveCount++;writes++;
    demand(http);await http.close();http=await startNativeAskHttp(f.verifier,makeFor(main));bCommand=await request(main,sample.command.targetId);const response=await post(bCommand);assert.equal(response.status,200,JSON.stringify(response));bAnswer=AskResultSchema.parse(response.body);if(!bAnswer.answer.includes(value))lost++;assert.ok(bAnswer.answer.includes(value));assert.equal(bAnswer.answer.includes(sample.command.assertion.value),false);assert.equal(bAnswer.manifest.selected[0]!.knowledgeRevision,2);asks++;reads++;
   });
   await t.test('NATIVE-ASK/installed-service-settlement-no-computer',async()=>{
    const state=receiptState.get(main.task.binding.sessionId)!;assert.ok(state.calls>0);const costs=(await f.uow.withScope(scope,tx=>tx.query('SELECT fabric.model_resource_costs($1) AS costs',[main.receipt.resourceId]))).rows[0]?.['costs'];assert.deepEqual(costs,[...state.receipts.values()].map(receipt=>({receipt,settled:true})));
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[main.receipt.receiptId])).rows[0].n,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,0);
   });
   await t.test('NATIVE-ASK/encrypted-query-answer-and-opaque-native-refs',async()=>{
    demand(aAnswer&&bAnswer&&bCommand);const rows=(await f.admin.query('SELECT * FROM fabric.storage_ask_receipts ORDER BY accepted_at')).rows;assert.equal(rows.length,2);
    for(const [command,result] of [[aCommand,aAnswer],[bCommand,bAnswer]] as const){const row=rows.find(r=>r['command_key']===command.key);demand(row);const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'ask',id:row['id'],revision:1,generation:row['generation'],keyId:row['key_id']});const bytes=await crypto().open(binding,row['envelope']);try{const payload=AskPayloadSchema.parse(JSON.parse(bytes.toString()));assert.equal(payload.question,command.question);assert.equal(payload.answer,result.answer);assert.deepEqual(payload.manifest,result.manifest);}finally{bytes.fill(0);}}
    const secretValues:readonly string[]=[aCommand.question,bCommand.question,sample.command.assertion.value,bAnswer.answer];
    for(const table of ['storage_ask_receipts','storage_native_ask_refs','model_native_events','model_sessions','model_operations','model_attempts','model_command_receipts','model_audit','model_outbox']){
     const text=JSON.stringify((await f.admin.query('SELECT row_to_json(t) AS r FROM fabric.'+table+' t')).rows);
     for(const secret of secretValues)assert.equal(text.includes(secret),false,table+' retains only ciphertext/opaque references');
    }
    const refs=(await f.admin.query('SELECT * FROM fabric.storage_native_ask_refs')).rows;assert.equal(refs.length,2);for(const ref of refs){assert.equal(ref['session_id'],main.task.binding.sessionId);assert.equal(ref['task_id'],main.task.binding.taskId);assert.equal(ref['run_id'],main.task.binding.runId);}
   });
   await t.test('NATIVE-ASK/installed-rls-and-immutable-history',async()=>{
    for(const table of ['storage_ask_receipts','storage_native_ask_refs','storage_ask_dependencies']){
     assert.deepEqual((await f.admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['fabric.'+table])).rows[0],{relrowsecurity:true,relforcerowsecurity:true});assert.equal((await f.controller.query('SELECT * FROM fabric.'+table)).rows.length,0);
     for(const pool of [f.worker,f.client,f.idpPool])await denied(()=>pool.query('SELECT * FROM fabric.'+table),['42501']);
     await denied(()=>f.uow.withScope(scope,tx=>tx.query('INSERT INTO fabric.'+table+' SELECT * FROM fabric.'+table)),['42501']);
     await denied(()=>f.uow.withScope(scope,tx=>tx.query('DELETE FROM fabric.'+table)),['42501']);
     await denied(()=>f.admin.query('UPDATE fabric.'+table+' SET space_id=space_id'),['P0001']);
    }
   });
   await t.test('NATIVE-ASK/authentication-and-closed-http-boundary',async()=>{
    demand(bCommand);const before=[opens,brokerCalls];for(const [command,credential,path] of [[bCommand,'invalid',undefined],[{...bCommand,spaceId:f.spaces.secondary},f.tokens.get(scope.actorId),undefined],[{...bCommand,continuation:randomUUID()},f.tokens.get(scope.actorId),undefined],[bCommand,f.tokens.get(f.actors[1]),undefined],[bCommand,f.tokens.get(scope.actorId),`/v1/tenants/${scope.tenantId}/spaces/${f.spaces.secondary}/native/ask`]] as const){const r=await post(command,credential,path);assert.ok(r.status>=400,JSON.stringify(r));assert.equal('answer' in r.body,false);denials++;}assert.deepEqual([opens,brokerCalls],before);
   });
   await t.test('NATIVE-ASK/budget-refusal-before-content',async()=>{const e=await enrollment(100000),command=await request(e,sample.command.targetId);await denied(()=>makeFor(e).ask(scope,command),['BUDGET_EXHAUSTED']);});
   await t.test('NATIVE-ASK/Stop-refusal-before-content',async()=>{const e=await enrollment(),command=await request(e,sample.command.targetId);await f.native.stop(scope,{sessionId:e.task.binding.sessionId,key:randomUUID(),expiresAt:command.expiresAt,observedRevision:0});await denied(()=>makeFor(e).ask(scope,command),['STALE_FENCE','STALE_AUTHORITY']);});
   await t.test('NATIVE-ASK/replacement-origin-refusal-before-content',async()=>{const e=await enrollment(),command=await request(e,sample.command.targetId);assert.equal(await new PostgresTaskRepository(f.uow).revise(scope,e.task.binding.taskId,1,{intent:'Ask',replacement:randomUUID()}),2);await denied(()=>makeFor(e).ask(scope,command));});
   await t.test('NATIVE-ASK/F03-initialized-worker-positive-then-replaced-refusal',async()=>{
    const seed=await enrollment(),runId=randomUUID(),binding=TaskCallBindingSchema.parse({...seed.task.binding,runId,sessionId:randomUUID(),workerGeneration:1}),leaf=randomUUID(),parent=seed.task.ids.at(-2);demand(parent);
    await f.admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,2,1,'{}',1,'pending')",[scope.tenantId,scope.spaceId,runId,binding.taskId]);
    await f.admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,'synthetic-utf8-byte-unit',100000,1)",[scope.tenantId,scope.spaceId,leaf,parent,scope.payerId]);await f.admin.query("INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,'run',$4)",[scope.tenantId,scope.spaceId,leaf,runId]);
    await f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[scope.tenantId,scope.spaceId,runId,binding.taskId,scope.actorId,scope.payerId,f.department,binding.costCenter,leaf,JSON.stringify(binding)]);
    const allowance=randomUUID(),reservation=randomUUID();await f.admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,payer_actor_id,currency,ceiling,reserved,revision) VALUES($1,$2,$3,$4,'synthetic',100,50,1)",[scope.tenantId,scope.spaceId,allowance,scope.payerId]);await f.admin.query("INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES($1,$2,$3,$4,$5,$6,$7,50,'active')",[scope.tenantId,scope.spaceId,reservation,allowance,scope.actorId,runId,randomUUID()]);
    const rb={task:{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:binding.taskId},runId,requirementsRevision:1,engineVersion:'g1-recovery/0.0.1',behaviorVersion:'storage-fixture/1',schemaVersion:1,environmentDigest:binding.versions.environmentDigest,dependencyLockDigest:binding.versions.dependencyLockDigest},g={cancellation:0,worker:1,resource:0},value={run:runSchema.parse({binding:rb,revision:1,generation:g,state:'preparing',wait:null,outcomeDigest:null}),session:sessionSchema.parse({binding:rb,sessionId:binding.sessionId,generation:g,role:'lead',modelProfile:'synthetic',toolProfile:'proposal-only',contextDigest:binding.sourceRevisionDigest,budgetReservationId:reservation,cursor:0,state:'ready',adapter:'deterministic-test-only'}),lease:leaseSchema.parse({leaseId:randomUUID(),binding:rb,generation:g,expiresAt:new Date(Date.now()+55_000).toISOString(),revokedAt:null})},recovery=new RecoveryRepository(f.uow,f.verifier.bindingFor);
    await recovery.initialize(scope,{commandId:randomUUID(),key:randomUUID(),runId,expectedRevision:0,payloadDigest:bindingDigest(value),expiresAt:new Date(Date.now()+45_000).toISOString()},value);await f.native.open(scope,runId,seed.task.admission);
    const resourceId=randomUUID(),receipt=ResourceReceiptSchema.parse({...seed.receipt,receiptId:randomUUID(),resourceId,originRunId:runId}),command={...seed.command,accountingResourceId:resourceId,sessionId:binding.sessionId,originRunId:runId,receiptId:receipt.receiptId},e={...seed,task:{...seed.task,binding,leaf,ids:[...seed.task.ids.slice(0,-1),leaf]},receipt,command};
    await f.admin.query('INSERT INTO fabric.storage_service_resources VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11)',[scope.tenantId,scope.spaceId,resourceId,receipt.ownerId,'ask',runId,scope.actorId,scope.payerId,f.department,leaf,binding.costCenter]);await f.admin.query("INSERT INTO fabric.model_resource_bindings VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,'reserved-until-confirmed-suspended')",[scope.tenantId,scope.spaceId,resourceId,receipt.ownerId,scope.actorId,scope.payerId,f.department,leaf,runId,binding.costCenter,'ask']);await f.admin.query("INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,'service',1,0,1000,1)",[scope.tenantId,scope.spaceId,resourceId]);
    enrolled.set(binding.sessionId,e);receiptState.set(binding.sessionId,{receipts:new Map(),keys:new Map(),calls:0});await controls.set(scope,{schemaVersion:1,action:'query-controls',sessionId:binding.sessionId,targetId:binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),controls:{attachments:false,olderRecall:true,saveReusable:false}});
    const positive=await accepted(makeFor(e),await request(e,sample.command.targetId));assert.equal(positive.status,'answered');assert.equal(positive.manifest.selected[0]?.knowledgeId,sample.command.targetId);
    const replace={sessionId:binding.sessionId,previousWorker:1,nextWorker:2};assert.equal((await recovery.replaceWorker(scope,{commandId:randomUUID(),key:randomUUID(),runId,expectedRevision:1,payloadDigest:bindingDigest(replace),expiresAt:new Date(Date.now()+35_000).toISOString()},replace)).revision,2);assert.equal(Number((await f.admin.query('SELECT generation FROM fabric.runs WHERE run_id=$1',[runId])).rows[0].generation),1);
    await denied(()=>makeFor(e).ask(scope,{schemaVersion:1,sessionId:binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),question:'Must not execute old worker '+randomUUID(),selector:{kind:'id',value:sample.command.targetId},attachmentIds:[]}),['STALE_FENCE']);
   });
   await t.test('NATIVE-ASK/unknown-continuation-refusal-before-content',async()=>{
    const e=await enrollment();await f.uow.withScope(scope,async tx=>{const s=await f.native.load(tx,scope,e.task.binding.sessionId);await f.native.fresh(tx,scope,s);const wait=await f.native.makeWait(tx,s,'unknown-usage',null);await f.native.save(tx,scope,s,s.events,{...s.control,wait});});const command=await request(e,sample.command.targetId);await denied(()=>makeFor(e).ask(scope,command));
   });
   await t.test('NATIVE-ASK/persisted-pending-model-and-effect-refuse-before-content',async()=>{
    for(const kind of ['model','effect'] as const){const e=await enrollment(),snapshot=await f.native.snapshot(scope,e.task.binding.sessionId),loop=new SessionLoop(snapshot.origin,{clock:{now:()=>Date.now()},authorize:()=>{},model:async()=>{throw new Error('Owned synthetic unknown model');},execute:async()=> 'unknown'});loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});if(kind==='model')await assert.rejects(loop.callModel('Synthetic fixture unknown'),{message:'Owned synthetic unknown model'});else await loop.dispatchEffect(randomUUID());assert.ok(kind==='model'?loop.inspect().pendingModel:loop.inspect().pendingOperations.length);
     await f.native.persist(scope,snapshot,loop.events(),null,randomUUID());const command=await request(e,sample.command.targetId);await denied(()=>makeFor(e).ask(scope,command),['STALE_FENCE']);}
   });
   await t.test('NATIVE-ASK/stale-revision-and-expired-command-before-content',async()=>{const e=await enrollment(),command=await request(e,sample.command.targetId);await denied(()=>makeFor(e).ask(scope,{...command,expectedRevision:999}),['STALE_REVISION']);await denied(()=>makeFor(e).ask(scope,{...command,expiresAt:'2000-01-01T00:00:00.000Z'}),['EXPIRED_COMMAND']);});
   await t.test('NATIVE-ASK/real-allowance-wait-expiry-before-content',async()=>{
    const e=await enrollment(),command=await request(e,sample.command.targetId,{expiresAt:new Date(Date.now()+500).toISOString()}),blocker=await f.admin.connect();let pending:Promise<void>|undefined;
    try{await blocker.query('BEGIN');await blocker.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',[e.task.leaf]);pending=denied(()=>makeFor(e).ask(scope,command),['EXPIRED_COMMAND']);pending.catch(()=>{});const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);let blocked=false;const end=Date.now()+1500;while(Date.now()<end){await blocker.query('SELECT pg_stat_clear_snapshot()');blocked=(await blocker.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true);await blocker.query('SELECT pg_sleep(0.6)');await blocker.query('COMMIT');await pending;}finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
   });
   await t.test('NATIVE-ASK/queued-Ask-observes-actual-Stop-before-content',async()=>{
    const e=await enrollment(),command=await request(e,sample.command.targetId),before=[opens,brokerCalls];let pending:Promise<unknown>|undefined;
    try{await f.uow.withScope(scope,async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);pending=makeFor(e).ask(scope,command);pending.catch(()=>{});let blocked=false;const end=Date.now()+1500;while(Date.now()<end){blocked=(await f.admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',[pid])).rows[0].blocked;if(blocked)break;await new Promise(r=>setTimeout(r,10));}assert.equal(blocked,true,'Native Ask actually queues behind owned Space barrier');
     const borrowed=new BorrowedUnitOfWork(scope,tx);try{const native=new NativeRepository(borrowed,f.verifier.bindingFor),stop=await native.stop(scope,{sessionId:e.task.binding.sessionId,key:randomUUID(),expiresAt:command.expiresAt,observedRevision:0});assert.equal(stop.dispatch,'fenced');}finally{borrowed.close();}});
     demand(pending);await assert.rejects(pending);assert.deepEqual([opens,brokerCalls],before);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resource_intervals WHERE resource_id=$1',[e.receipt.resourceId])).rows[0].n,0);denials++;
    }finally{await pending?.catch(()=>{});}
   });
   await t.test('NATIVE-ASK/concurrent-exact-key-single-effect-and-conflict',async()=>{
    const e=await enrollment(),command=await request(e,sample.command.targetId),repository=makeFor(e);const results=await Promise.all([accepted(repository,command),accepted(makeFor(e),command),accepted(makeFor(e),command)]);for(const r of results)assert.deepEqual(r,results[0]);const rows=Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_ask_receipts WHERE command_key=$1',[command.key])).rows[0].n);duplicates+=Math.max(0,rows-1);assert.equal(rows,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE settlement_id=$1',[e.receipt.receiptId])).rows[0].n,1);await denied(()=>repository.ask(scope,{...command,question:'different-'+randomUUID()}),['IDEMPOTENCY_CONFLICT']);
   });
   await t.test('NATIVE-ASK/tombstone-prevents-old-answer-replay',async()=>{
    const e=await enrollment(),entry=await saved(),command=await request(e,entry.command.targetId),repository=makeFor(e),r=await accepted(repository,command);assert.ok(r.answer.includes(entry.command.assertion.value));const row=(await f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE id=$1 ORDER BY revision DESC LIMIT 1',[entry.command.targetId])).rows[0];assert.equal((await new TombstonePublicationRepository(f.uow,journal,f.native).forget(scope,{key:randomUUID(),sessionId:sourceTask.binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),entity:{class:'knowledge',id:entry.command.targetId,revision:Number(row.revision),witness:String(row.witness)}})).status,'committed');writes++;
    const before=opens;await assert.rejects(repository.ask(scope,command));assert.equal(opens,before,'old persisted answer is not decrypted after tombstone');denials++;
   });
   await t.test('NATIVE-ASK/retention-expiry-yields-gap-before-decrypt',async()=>{
    const e=await enrollment(),entry=await saved(2500),repository=makeFor(e);const remaining=Number((await f.admin.query('SELECT greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.03 AS remaining',[entry.source.retentionExpiresAt])).rows[0].remaining);await f.admin.query('SELECT pg_sleep($1)',[remaining]);const command=await request(e,entry.command.targetId),before=opens,r=await accepted(repository,command);assert.equal(r.status,'evidence-gap');assert.equal(r.answer.includes(entry.command.assertion.value),false);assert.deepEqual(r.manifest.selected,[]);assert.equal(opens,before,'retained source expiry is decided before opening content');denials++;
   });
   await t.test('NATIVE-ASK/source-expiry-after-seal-rolls-back-settlement',async()=>{
    const e=await enrollment(),entry=await saved(7000),command=await request(e,entry.command.targetId),before=opens,economic=await accountingSnapshot(f);
    let seals=0;const repository=makeFor(e,async()=>{seals++;const remaining=Number((await f.admin.query('SELECT greatest(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.03 AS remaining',[entry.source.retentionExpiresAt])).rows[0].remaining);await f.admin.query('SELECT pg_sleep($1)',[remaining]);});
    await assert.rejects(repository.ask(scope,command));assert.equal(seals,1,'actual eligible bytes were encrypted before expiry');assert.ok(opens>before,'actual source/knowledge bytes opened before the interrupted publication');
    assert.deepEqual(await accountingSnapshot(f),economic,'same borrowed resource preparation/settlement rolls back');
    for(const table of ['storage_ask_receipts','storage_native_ask_refs'])assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[command.key])).rows[0].n,0);
    denials++;
   });
   await t.test('NATIVE-ASK/reachable-forbidden-ports-zero-actual-calls',async()=>{
    assert.deepEqual(counters,{computer:0,shell:0,model:0,enrichment:0,effect:0});assert.ok(ownerCalls>0);assert.ok(brokerCalls>0);assert.ok(opens>0);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,0);
    const probes={computer:0,shell:0,model:0,enrichment:0,effect:0},probePorts:NativeAskPorts={computer:async()=>{probes.computer++;throw new Error('Probe computer called');},shell:async()=>{probes.shell++;throw new Error('Probe shell called');},model:async()=>{probes.model++;throw new Error('Probe model called');},enrichment:async()=>{probes.enrichment++;throw new Error('Probe enrichment called');},effect:async()=>{probes.effect++;throw new Error('Probe effect called');}},repository=makeFor(main),probe=new NativeAskRepository(repository.accounting,repository.broker,repository.accountingOwner,probePorts),selection=await repository.broker.retrieve(scope,{sessionId:main.task.binding.sessionId,expiresAt:new Date(Date.now()+20_000).toISOString(),selector:{kind:'id',value:sample.command.targetId},attachmentIds:[]});
    for(const kind of ['computer','shell','model','enrichment','effect'] as const)await assert.rejects(probe.route(kind,selection),{message:'Probe '+kind+' called'});assert.deepEqual(probes,{computer:1,shell:1,model:1,enrichment:1,effect:1});assert.deepEqual(counters,{computer:0,shell:0,model:0,enrichment:0,effect:0});
   });
   assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);
   const queryWrites=Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_ask_receipts')).rows[0].n);
   observe({schemaVersion:1,measurement:'storage-observations',suite:'native-ask',positives:{save:saveCount,ask:asks,forget:1,restore:0,read:reads,write:writes+queryWrites,deny:denials,conflict:0,propagate:0,backup:0,owner:ownerCalls,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:0,silentLostUpdate:lost,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:counters.computer}});
  }finally{await http?.close();dataKey.fill(0);digestKey.fill(0);await f.close();}
 });
}
