import { CurrentRetrievalManifestSchema } from './ask-disclosure-schema.js';
import { randomUUID } from 'node:crypto';
import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { TextDecoder } from 'node:util';
import type { IdentityScopeVerifier } from '../../g1-identity/src/contracts.js';
import { replaySession,isTerminal } from '../../g1-model/src/native-imports.js';
import { ModelError } from '../../g1-model/src/errors.js';
import { runSchema } from '../../g1-recovery/src/contracts.js';
import { AskCommandSchema,AskPayloadSchema,AskResultSchema,BindingSchema,CipherEnvelopeSchema,parseCommand } from './schema.js';
import { uuid,object,version,revision,timestamp,enumeration,nullable,literal,list }  from './decoder.js';
import { demand,StorageError,FoundationError,safeFailure,type StorageErrorCode } from './errors.js';
import { LIMITS } from './arithmetic.js';
import { ServiceAccountingSchema,type StorageServiceAccounting,type ServiceAccounting } from './resource-composition.js';
import { RecallRequestSchema,type SourceRecallBroker,type RecallSelection } from './recall-broker.js';
import type { NativeSnapshot,SqlTransaction,VerifiedScope } from './owners.js';

import { QueryControlsRepository } from './query-controls.js';
import type { KnowledgeSaveRepository } from './knowledge-save.js';
import { DisclosureBarrier } from './ask-disclosure.js';

export const AskReceiptReadSchema=object({schemaVersion:version,sessionId:uuid,receiptId:uuid,expectedRevision:revision,expiresAt:timestamp});
export const AskServiceRequestSchema=object({schemaVersion:version,request:enumeration('saved','live'),command:AskCommandSchema});
export const AskServiceOutcomeSchema=object({schemaVersion:version,status:enumeration('answered','missing-evidence','live-unsupported','current-authority-required','unknown'),
 result:nullable(AskResultSchema),preserved:literal('existing-history'),
 chargeState:enumeration('preparation-settled','no-new-charge','preparation-may-be-settled','unknown'),
 notExecuted:list(enumeration('computer','shell','model','enrichment','effect','live-inspection','remote-link','stream'),8,8),
 resolver:enumeration('inspect-current-sources','request-permitted-source','request-live-capability','inspect-current-authority','original-key-lookup'),
 replayAllowed:literal(false),computerStarted:literal(false)});
export interface AskDisclosureHooks {beforeDisclosure?(receiptId:string):Promise<void>;
 /** Installed optional graph owner; runs in the exact disclosure transaction,
  * before answer open and again before release. Requests cannot supply it. */
 authorizeReceipt?(tx:SqlTransaction,scope:VerifiedScope,receiptId:string):Promise<void>;
}
type Command=ReturnType<typeof AskCommandSchema.parse>;
type Result=ReturnType<typeof AskResultSchema.parse>;
type Prepared={receiptId:string;empty:boolean};
/** Trusted installed resource interval channel. Caller JSON has neither a
 * receipt, rate, budget, owner, resource nor an alternative origin. */
export interface NativeAskAccountingOwner {
 resolve(tx:SqlTransaction,scope:VerifiedScope,native:NativeSnapshot,key:string,expiresAt:string):Promise<ServiceAccounting>;
}
export interface NativeAskPorts {
 computer(input:unknown):Promise<unknown>;shell(input:unknown):Promise<unknown>;
 model(input:unknown):Promise<unknown>;enrichment(input:unknown):Promise<unknown>;effect(input:unknown):Promise<unknown>;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const selectedRefs=(s:RecallSelection)=>s.selected.map(v=>({id:v.ref.id,revision:v.ref.revision,witness:v.ref.witness,
 sourceId:s.records.find(r=>r.id===v.ref.id)!.source.sourceId,sourceRevision:s.records.find(r=>r.id===v.ref.id)!.source.revision,
 }));

/** Native Ask uses the actual installed session, F03 fences and F04 allowance
 * transaction. It writes no model request/response/history and creates no
 * ComputerAssignment. Its sole profile is bounded local extraction from the
 * canonical broker's eligible bytes. Query and answer are retained encrypted. */
export class NativeAskRepository {
 constructor(readonly accounting:StorageServiceAccounting,readonly broker:SourceRecallBroker,
  readonly accountingOwner:NativeAskAccountingOwner,readonly ports:NativeAskPorts,readonly disclosureHooks:AskDisclosureHooks={}){}
 /** The installed routing seam is reachable for fail-on-call probes. No HTTP
  * input can choose a route/profile; ask always selects local-extractive-v1. */
 async route(kind:'local-extractive-v1'|keyof NativeAskPorts,selection:RecallSelection):Promise<unknown>{
  if(kind!=='local-extractive-v1')return this.ports[kind](selection);
  if(selection.status==='disputed')return 'The saved evidence is disputed. Request a permitted source.';
  if(!selection.records.length)return 'No current eligible saved evidence was found. Request a permitted source.';
  // Source text is data. No parser interprets commands, tools, markdown links,
  // shell syntax or instructions inside a saved value.
  const answer=selection.records.map(r=>`${r.subject}: ${r.value}`).join('\n');
  demand(Buffer.byteLength(answer)<=LIMITS.commandBytes,'REQUIRED_CAPABILITY_UNSUPPORTED');return answer;
 }
 async #native(tx:SqlTransaction,s:VerifiedScope,c:Command,validateInput=true):Promise<NativeSnapshot>{
  await this.broker.authority.assertCurrent(tx,s,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
  const n=await this.accounting.native.load(tx,s,c.sessionId);await this.accounting.native.fresh(tx,s,n);
  demand(n.revision===c.expectedRevision,'STALE_REVISION');
  if(validateInput)demand(Buffer.byteLength(c.question)>0&&Buffer.byteLength(c.question)<=n.control.inputLimitBytes
   &&Buffer.byteLength(c.question)<=n.admission.maxInputBytes,'REQUIRED_CAPABILITY_UNSUPPORTED');
  const state=replaySession(n.origin,n.events);
  demand(!state.pendingModel&&!state.pendingOperations.length&&!n.control.wait,'STALE_FENCE');
  demand(!(await tx.query("SELECT 1 FROM fabric.model_operations WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 AND record->>'status' IN('prepared','pending','unknown') LIMIT 1",[s.tenantId,s.spaceId,n.binding.taskId])).rowCount,'STALE_FENCE');
  demand(!isTerminal(state.run.state)&&state.run.state!=='cancelling','STALE_FENCE');
  const b=n.binding;
  const row=(await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE',[s.tenantId,s.spaceId,b.runId])).rows[0];
  demand(b.workerGeneration===0||row,'AUTHORITY_UNAVAILABLE');
  if(row){const r=runSchema.parse(row['record']);demand(r.binding.runId===b.runId&&r.binding.task.taskId===b.taskId
   &&r.binding.task.tenantId===s.tenantId&&r.binding.task.spaceId===s.spaceId&&r.binding.requirementsRevision===b.requirementsRevision
   &&r.generation.worker===b.workerGeneration&&r.generation.cancellation===b.cancellationGeneration
   &&r.generation.resource===b.resourceGeneration&&!isTerminal(r.state)&&r.state!=='cancelling','STALE_FENCE');}
  const resources=(await tx.query('SELECT c.record FROM fabric.recovery_run_resources r JOIN fabric.recovery_resource_controls c USING(tenant_id,space_id,resource_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.run_id=$3 FOR SHARE OF c',[s.tenantId,s.spaceId,b.runId])).rows;
  demand(resources.length===0&&b.resourceGeneration===0,'REQUIRED_CAPABILITY_UNSUPPORTED');
  return n;
 }
 async #manifest(tx:SqlTransaction,s:VerifiedScope,n:NativeSnapshot,selection:RecallSelection,generation:string){
  const audience=await this.broker.authority.currentAudience(tx,s,n.binding.taskId);
  const awaitSourceWitness=new Map<string,string>();
  for(const r of selection.records){const row=(await tx.query('SELECT source_witness FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,r.id,r.revision])).rows[0];demand(row,'CONTENT_UNAVAILABLE');awaitSourceWitness.set(r.id,String(row['source_witness']));}
  return CurrentRetrievalManifestSchema.parse({schemaVersion:2,tenantId:s.tenantId,spaceId:s.spaceId,
   audience:{destinationSpaceId:s.spaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest},
   policyRevision:selection.anchor.policyRevision,membershipRevision:s.membershipRevision,restrictionEpoch:selection.anchor.epoch,
   storageGeneration:generation,profile:'local-extractive-v1',indexWatermark:selection.indexWatermark,
   selected:selection.records.map(r=>({knowledgeId:r.id,knowledgeRevision:r.revision,knowledgeWitness:selection.selected.find(v=>v.ref.id===r.id)!.ref.witness,
    sourceWitness:String(awaitSourceWitness.get(r.id)),source:{...r.source,audience:{destinationSpaceId:s.spaceId,
      recipientActorIds:selection.selected.find(v=>v.ref.id===r.id)!.audience.recipientActorIds,
      revisionDigest:selection.selected.find(v=>v.ref.id===r.id)!.audience.revisionDigest}},
    inclusionReason:selection.selected.find(v=>v.ref.id===r.id)!.reason})),limitations:selection.limitations});
 }
 async ask(scope:VerifiedScope,raw:unknown):Promise<Result>{
  const c=parseCommand(AskCommandSchema,raw),prepared=await this.#prepare(scope,c);
  // Receipt is committed before this installed seam. No answer bytes leave the
  // repository until a new transaction reauthorizes its complete dependency set.
  await this.disclosureHooks.beforeDisclosure?.(prepared.receiptId);
  return this.#read(scope,{schemaVersion:1,sessionId:c.sessionId,receiptId:prepared.receiptId,expectedRevision:c.expectedRevision,expiresAt:c.expiresAt},prepared.empty?{sessionId:c.sessionId,expiresAt:c.expiresAt,selector:c.selector,attachmentIds:c.attachmentIds}:undefined);
 }
 async service(scope:VerifiedScope,raw:unknown){
  const input=parseCommand(AskServiceRequestSchema,raw);
  const outcome=(status:ReturnType<typeof AskServiceOutcomeSchema.parse>['status'],resolver:ReturnType<typeof AskServiceOutcomeSchema.parse>['resolver'],result:Result|null=null)=>AskServiceOutcomeSchema.parse({schemaVersion:1,status,result,preserved:'existing-history',chargeState:result?'preparation-settled':status==='live-unsupported'?'no-new-charge':status==='unknown'?'unknown':'preparation-may-be-settled',notExecuted:['computer','shell','model','enrichment','effect','live-inspection','remote-link','stream'],resolver,replayAllowed:false,computerStarted:false});
  try{
   if(input.request==='live'){await this.accounting.authenticated.withScope(scope,tx=>this.#native(tx,scope,input.command));return outcome('live-unsupported','request-live-capability');}
   const result=await this.ask(scope,input.command);return outcome(result.status==='answered'?'answered':'missing-evidence',result.status==='answered'?'inspect-current-sources':'request-permitted-source',result);
  }catch(e){const failure=safeFailure(e);return outcome(failure.status==='unknown'?'unknown':'current-authority-required',failure.status==='unknown'?'original-key-lookup':'inspect-current-authority');}
 }
 async read(scope:VerifiedScope,raw:unknown):Promise<Result>{return this.#read(scope,raw);}
 async #read(scope:VerifiedScope,raw:unknown,emptyRequest?:Parameters<SourceRecallBroker['retrieveInTransaction']>[2]):Promise<Result>{
  const c=parseCommand(AskReceiptReadSchema,raw);
  return this.accounting.authenticated.withScope(scope,async tx=>{
   const barrier=new DisclosureBarrier(this.broker);
   await barrier.lock(tx,scope,[scope.spaceId]);
   const n=await this.#native(tx,scope,AskCommandSchema.parse({schemaVersion:1,sessionId:c.sessionId,key:c.receiptId,expectedRevision:c.expectedRevision,expiresAt:c.expiresAt,question:'receipt',selector:{kind:'tail',limit:1},attachmentIds:[]}),false);
   const row=(await tx.query('SELECT * FROM fabric.storage_ask_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND id=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.receiptId])).rows[0];
   demand(row&&row['session_id']===c.sessionId&&row['task_id']===n.binding.taskId&&row['run_id']===n.binding.runId&&Number(row['native_revision'])===c.expectedRevision,'CONTENT_UNAVAILABLE');
   await this.disclosureHooks.authorizeReceipt?.(tx,scope,c.receiptId);
   const controls=await this.broker.controls.read(tx,scope,c.sessionId);demand(controls.revision===Number(row['controls_revision']),'CONTENT_UNAVAILABLE');
   const anchor=await this.broker.authority.check(tx,scope,'read',c.expiresAt),keys=await this.broker.keys.resolve(tx,scope);
   demand(anchor.epoch===Number(row['epoch'])&&keys.keyId===row['key_id']&&keys.generation===row['generation'],'CONTENT_UNAVAILABLE');
   demand((await tx.query('SELECT clock_timestamp()<$1 AS live',[row['expires_at']])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
   const audienceAdmission=(await tx.query(`SELECT a.audiences=fabric.storage_ask_current_audiences($3) AND a.envelope_digest='sha256:'||encode(sha256(convert_to(r.envelope::text,'UTF8')),'hex') AS current FROM fabric.storage_ask_disclosure_admissions a JOIN fabric.storage_ask_receipts r ON(r.tenant_id,r.space_id,r.id)=(a.tenant_id,a.space_id,a.ask_id) WHERE a.tenant_id=$1 AND a.space_id=$2 AND a.ask_id=$3`,[scope.tenantId,scope.spaceId,c.receiptId])).rows[0];
   demand(audienceAdmission?.['current']===true,'UNAUTHORIZED');
   const dependencies=(await tx.query('SELECT * FROM fabric.storage_ask_dependencies WHERE tenant_id=$1 AND space_id=$2 AND ask_id=$3 ORDER BY ordinal LIMIT 65',[scope.tenantId,scope.spaceId,c.receiptId])).rows;
   const current=await barrier.dependencies(tx,scope,dependencies,keys);
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'ask',id:c.receiptId,revision:1,...keys});
   let emptyPayload:ReturnType<typeof AskPayloadSchema.parse>|undefined;
   if(dependencies.length===0&&emptyRequest){
    // A current safe gap is computed without source or retained answer opening.
    // Never reuse prepared plaintext. The immutable envelope digest above still
    // proves this governed receipt was not substituted after publication.
    const selected=await this.broker.retrieveInTransaction(tx,scope,emptyRequest);
    demand(selected.records.length===0,'CONTENT_UNAVAILABLE');
    const manifest=await this.#manifest(tx,scope,n,selected,keys.generation);
    emptyPayload=AskPayloadSchema.parse({schemaVersion:1,question:'',answer:this.#gapAnswer(selected.status==='disputed'),manifest});
   }
   const bytes=emptyPayload?Buffer.from(JSON.stringify(emptyPayload)):await this.broker.crypto.open(binding,row['envelope']);
   try{
    const payload=AskPayloadSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))),manifest=CurrentRetrievalManifestSchema.parse(payload.manifest);
    demand(manifest.tenantId===scope.tenantId&&manifest.spaceId===scope.spaceId&&manifest.policyRevision===anchor.policyRevision&&manifest.restrictionEpoch===anchor.epoch&&manifest.membershipRevision===scope.membershipRevision&&manifest.storageGeneration===keys.generation,'CONTENT_UNAVAILABLE');
    const audience=await this.broker.authority.currentAudience(tx,scope,n.binding.taskId);
    demand(same(manifest.audience,{destinationSpaceId:scope.spaceId,recipientActorIds:audience.recipientActorIds,revisionDigest:audience.revisionDigest}),'UNAUTHORIZED');
    demand(manifest.selected.length===current.length,'CONTENT_UNAVAILABLE');
    if(!current.length)demand(payload.answer===this.#gapAnswer(manifest.limitations.includes('disputed-evidence')),'INTEGRITY_FAILED');
    for(const [i,item] of manifest.selected.entries()){const d=current[i];demand(d&&item.knowledgeId===d.id&&item.knowledgeRevision===d.revision&&item.knowledgeWitness===d.witness&&item.sourceWitness===d.sourceWitness&&item.source.sourceId===d.sourceId&&item.source.revision===d.sourceRevision&&item.source.sourceTaskId===d.sourceTaskId&&item.source.spaceId===scope.spaceId&&same(item.source.audience,d.audience),'CONTENT_UNAVAILABLE');}
    // Fresh full-audience/metadata and live time checks after decrypt, including
    // empty/disputed receipts. Locks are held until this disclosure tx commits.
    await barrier.dependencies(tx,scope,dependencies,keys);
    await this.broker.authority.assertCurrent(tx,scope,{purpose:'ask',sessionId:c.sessionId,expiresAt:c.expiresAt});
    demand((await tx.query('SELECT clock_timestamp()<$1 AS live',[row['expires_at']])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
    const finalKeys=await this.broker.keys.resolve(tx,scope);demand(same(finalKeys,keys),'CONTENT_UNAVAILABLE');
    await this.disclosureHooks.authorizeReceipt?.(tx,scope,c.receiptId);
    return AskResultSchema.parse({schemaVersion:1,status:manifest.selected.length?'answered':manifest.limitations.includes('disputed-evidence')?'disputed':'evidence-gap',receiptId:c.receiptId,answer:payload.answer,manifest,profile:'local-extractive-v1',computerStarted:false,nextAction:manifest.selected.length?'inspect-sources':'request-permitted-source'});
   }finally{bytes.fill(0);}
  });
 }
 #gapAnswer(disputed:boolean){return disputed?'The saved evidence is disputed. Request a permitted source.':'No current eligible saved evidence was found. Request a permitted source.';}
 async #prepare(scope:VerifiedScope,raw:unknown):Promise<Prepared>{
  const c=parseCommand(AskCommandSchema,raw);
  try{return await this.accounting.authenticated.withScope(scope,async tx=>{
   let n=await this.#native(tx,scope,c);
   // Acquire installed Space/native locks before the actor's original lock.
   // Concurrent duplicate commands cannot allocate or charge another interval.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-native-ask',scope.tenantId,scope.spaceId,scope.actorId,c.key])]);
   n=await this.#native(tx,scope,c);
   const keys=await this.broker.keys.resolve(tx,scope),id=randomUUID();
   const binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'ask',id,revision:1,
    generation:keys.generation,keyId:keys.keyId});
   const mac=async(purpose:'command'|'subject',value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value));try{return await this.broker.crypto.fingerprint(binding,purpose,bytes);}finally{bytes.fill(0);}};
   const fingerprint=await mac('command',{actorId:scope.actorId,command:c,taskId:n.binding.taskId,runId:n.binding.runId});
   const old=(await tx.query('SELECT * FROM fabric.storage_ask_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.key])).rows[0];
   const request={sessionId:c.sessionId,expiresAt:c.expiresAt,selector:c.selector,attachmentIds:c.attachmentIds};
   if(old){
    demand(old['binding_fingerprint']===fingerprint,'IDEMPOTENCY_CONFLICT');
    demand(old['generation']===keys.generation&&old['key_id']===keys.keyId&&old['session_id']===c.sessionId
     &&old['task_id']===n.binding.taskId&&old['run_id']===n.binding.runId,'CONTENT_UNAVAILABLE');
    demand((await tx.query('SELECT clock_timestamp()<$1 AS live',[old['expires_at']])).rows[0]?.['live']===true,'CONTENT_UNAVAILABLE');
    // Duplicate preparation is metadata-only. The single following disclosure
    // transaction performs complete audience/controls/epoch/dependency/crypto
    // reauthorization before any retained answer is opened. Never repeat source
    // decryption or resource admission while duplicates queue under the fixed
    // installed lock bound.
    return {receiptId:uuid.parse(old['id']),empty:false};
   }
   // Installed intent resolution is control-only. No source body is opened until
   // ResourceRepository.prepare has obtained actual current allowance admission.
   const accounting=ServiceAccountingSchema.parse(await this.accountingOwner.resolve(tx,scope,n,c.key,c.expiresAt));
   demand(accounting.sessionId===c.sessionId&&accounting.originRunId===n.binding.runId
    &&accounting.purpose==='ask'&&accounting.expiresAt===c.expiresAt,'CHECK_BINDING_MISMATCH');
   let result:Prepared|undefined;
   await this.accounting.inTransaction(scope,tx,accounting,async()=>{
    await this.#native(tx,scope,c);
    const selection=await this.broker.retrieveInTransaction(tx,scope,request);
    const answer=await this.route('local-extractive-v1',selection);demand(typeof answer==='string','INTEGRITY_FAILED');
    return {selection,answer};
   },async({selection,answer},admitted)=>{
    await this.#native(tx,scope,c);await this.#current(tx,scope,request,selection,keys);
    const manifest=await this.#manifest(tx,scope,admitted,selection,keys.generation);
    const bytes=Buffer.from(JSON.stringify(AskPayloadSchema.parse({schemaVersion:1,question:c.question,answer,manifest})));
    let envelope;try{envelope=CipherEnvelopeSchema.parse(await this.broker.crypto.seal(binding,bytes));}finally{bytes.fill(0);}
    await this.#native(tx,scope,c);await this.#current(tx,scope,request,selection,keys);
    const queryFingerprint=await mac('subject',c.question);
    const expiry=(await tx.query(`SELECT least(clock_timestamp()+make_interval(secs=>(periods->>'ask')::integer),$4::timestamptz) AS expires
     FROM fabric.storage_policy WHERE tenant_id=$1 AND space_id=$2 AND revision=$3`,[scope.tenantId,scope.spaceId,selection.anchor.policyRevision,
      selection.records.length?selection.records.map(r=>r.expiresAt).sort()[0]:new Date(Date.now()+86_400_000).toISOString()])).rows[0]?.['expires'];
    demand(expiry instanceof Date,'AUTHORITY_UNAVAILABLE');
    await tx.query('SELECT fabric.storage_publish_native_ask($1::jsonb,$2::jsonb)',[JSON.stringify({id,commandKey:c.key,sessionId:c.sessionId,
     taskId:admitted.binding.taskId,runId:admitted.binding.runId,nativeRevision:c.expectedRevision,controlsRevision:selection.controlsRevision,
     epoch:selection.anchor.epoch,keyId:keys.keyId,generation:keys.generation,resourceReceiptId:accounting.receiptId,bindingFingerprint:fingerprint,
     queryFingerprint,envelope,expiresAt:expiry.toISOString(),commandExpiresAt:c.expiresAt}),JSON.stringify(selectedRefs(selection))]);
    await tx.query('SELECT fabric.storage_admit_ask_disclosure($1)',[id]);
    await this.#native(tx,scope,c);await this.#current(tx,scope,request,selection,keys);
    result={receiptId:id,empty:selection.records.length===0};
   });
   demand(result,'INTEGRITY_FAILED');return result;
  });}catch(e){
   if(e instanceof FoundationError&&e.code==='STALE_AUTHORITY')throw new StorageError('STALE_FENCE');
   if(e instanceof ModelError){if(['STALE_FENCE','CHECK_BINDING_MISMATCH','BUDGET_EXHAUSTED','UNAUTHORIZED','STALE_REVISION'].includes(e.code))throw new StorageError(e.code as StorageErrorCode);
    if(e.code==='UNKNOWN_EFFECT_REQUIRES_RECONCILIATION')throw new StorageError('STALE_FENCE');}
   throw e;
  }
 }
 async #current(tx:SqlTransaction,s:VerifiedScope,raw:Parameters<SourceRecallBroker['retrieveInTransaction']>[2],prior:RecallSelection,keys:{generation:string;keyId:string}){
  // A fresh metadata-only publication fence. Space/native locks are already
  // held, but database time, independent anchor/key state and source audience
  // can change across awaited installed-owner work. Reopening the same bytes
  // adds no authority and would hold the installed lock beyond its fixed bound.
  const request=RecallRequestSchema.parse(raw);
  const anchor=await this.broker.authority.check(tx,s,'read',request.expiresAt);
  demand(same(anchor,prior.anchor),'CONTENT_UNAVAILABLE');
  const controls=await this.broker.controls.read(tx,s,request.sessionId);
  demand(controls.revision===prior.controlsRevision,'CONTENT_UNAVAILABLE');
  demand(prior.selected.length===prior.records.length,'INTEGRITY_FAILED');
  for(const selected of prior.selected){
   const row=(await tx.query('SELECT * FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND revision=$4',[s.tenantId,s.spaceId,selected.ref.id,selected.ref.revision])).rows[0];
   demand(row&&row['witness']===selected.ref.witness&&row['key_id']===keys.keyId&&row['generation']===keys.generation,'CONTENT_UNAVAILABLE');
   await this.broker.authority.entity(tx,s,selected.ref);
   await this.broker.authority.entity(tx,s,{class:'source',id:row['source_id'],revision:Number(row['source_revision']),witness:row['source_witness']});
   await this.broker.admission.recallEligibility(tx,s,row);await this.broker.admission.conflictEligibility(tx,s,row);
   demand(['user-asserted','source-verified'].includes(String(row['status'])),'CONTENT_UNAVAILABLE');
   const audience=await this.broker.authority.currentAudience(tx,s,uuid.parse(row['source_task_id']));
   demand(same(audience,selected.audience),'UNAUTHORIZED');
  }
  const k=await this.broker.keys.resolve(tx,s);
  demand(k.generation===keys.generation&&k.keyId===keys.keyId,'CONTENT_UNAVAILABLE');
 }

}

/** Local authenticated native query ingress. Fixed verifier and owners; closed
 * route/body, bounded UTF-8, no public supplier/computer/effect/continuation port. */
export async function startNativeAskHttp(verifier:IdentityScopeVerifier,repository:NativeAskRepository,remember?:KnowledgeSaveRepository){
 const reply=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
 async function body(req:IncomingMessage){
  demand(req.headers['content-type']==='application/json'&&!req.headers['content-encoding']);
  if(req.headers['content-length']!==undefined)demand(/^\d+$/.test(req.headers['content-length'])&&Number(req.headers['content-length'])<=LIMITS.commandBytes);
  const chunks:Buffer[]=[];let size=0;
  try{for await(const chunk of req.iterator({destroyOnReturn:false})){const b=Buffer.from(chunk as Uint8Array);size+=b.length;
    if(size>LIMITS.commandBytes){b.fill(0);req.resume();throw new StorageError('INVALID_SCHEMA');}chunks.push(b);}
   const bytes=Buffer.concat(chunks);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}
   catch{throw new StorageError('INVALID_SCHEMA');}finally{bytes.fill(0);}
  }finally{for(const b of chunks)b.fill(0);}
 }
 const server=createServer((req,res)=>{void(async()=>{
  try{
   const route=/^\/v1\/tenants\/([^/]+)\/spaces\/([^/]+)\/native\/(ask|ask-service|ask-receipt|query-controls|remember|remember-lookup)$/.exec(req.url??'');
   if(req.method!=='POST'||!route){reply(res,404,safeFailure(new StorageError('INVALID_SCHEMA')));return;}
   const tenantId=uuid.parse(route[1]),spaceId=uuid.parse(route[2]),credential=req.headers.authorization;
   demand(typeof credential==='string'&&/^Bearer [A-Za-z0-9_.-]+$/.test(credential),'UNAUTHORIZED');
   const scope=await verifier.verify({tenantId,spaceId,sessionCredential:credential.slice(7)});
   const raw=await body(req);
   if(route[3]==='query-controls'){demand(repository.broker.controls instanceof QueryControlsRepository,'REQUIRED_CAPABILITY_UNSUPPORTED');reply(res,200,await repository.broker.controls.set(scope,raw));return;}
   if(route[3]==='remember'||route[3]==='remember-lookup'){demand(remember,'REQUIRED_CAPABILITY_UNSUPPORTED');const result=route[3]==='remember'?await remember.remember(scope,raw):await remember.lookupRemember(scope,raw);reply(res,result.status==='unknown'?503:result.status==='not-saved'?(['INVALID_SCHEMA','UNSUPPORTED_VERSION'].includes(result.error)?400:['IDEMPOTENCY_CONFLICT','STALE_REVISION'].includes(result.error)?409:403):200,result.status==='unknown'?{...result,resolver:{method:'POST',path:`/v1/tenants/${tenantId}/spaces/${spaceId}/native/remember-lookup`}}:result);return;}
   const result=route[3]==='ask-service'?await repository.service(scope,raw):route[3]==='ask-receipt'?await repository.read(scope,raw):await repository.ask(scope,raw);reply(res,200,result);
  }catch(e){const failure=safeFailure(e);reply(res,failure.status==='unknown'?503:
   ['INVALID_SCHEMA','UNSUPPORTED_VERSION'].includes(failure.error)?400:['IDEMPOTENCY_CONFLICT','STALE_REVISION'].includes(failure.error)?409:403,failure);}
 })().catch(()=>{if(!res.headersSent)reply(res,500,safeFailure(new StorageError('AUTHORITY_UNAVAILABLE')));else res.destroy();});});
 server.requestTimeout=10_000;server.headersTimeout=10_000;server.maxHeadersCount=32;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();demand(address&&typeof address==='object','AUTHORITY_UNAVAILABLE');
 return {url:`http://127.0.0.1:${address.port}`,async close(){server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
