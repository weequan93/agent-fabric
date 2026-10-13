import { canonicalDigest } from './native-imports.js';
import { body,list,nullable,object,version } from './decoder.js';
import { ModelRepository,type PrepareInput,type DispatchPermit } from './model-repository.js';
import { UsageRepository,type OriginalState,type UsageResult,type InstalledReceiptOwner } from './usage-repository.js';
import { RetryRepository,type RetryInput,type NativeRetryPrefix } from './retry-repository.js';
import { OwnerFailureVerifier } from './profile.js';
import { EncodedRequestSchema,OriginalCallSchema,OwnerObservationSchema } from './schema.js';
import { uuid,text } from './decoder.js';
import { demand,ModelError } from './errors.js';
import type { ModelAdapterPort,VerifiedScope,OriginalCall,EncodedRequest,OwnerObservation,PreparedAttempt } from './contracts.js';
export interface InstalledAdapter extends InstalledReceiptOwner{readonly port:ModelAdapterPort;readonly result?:(original:OriginalCall)=>Promise<unknown>}
/** Composition root owns the registry. Public commands cannot supply destinations,
 * receipts, measured units, owner IDs, payers, profiles or replacement bindings. */
export class ModelService{
 private readonly owners:ReadonlyMap<string,InstalledAdapter>;
 readonly retry:RetryRepository;
 constructor(readonly model:ModelRepository,readonly usage:UsageRepository,installed:readonly InstalledAdapter[],readonly acceptTimeoutMs=1000){
  demand(Number.isSafeInteger(acceptTimeoutMs)&&acceptTimeoutMs>0&&acceptTimeoutMs<=1500);
  const map=new Map<string,InstalledAdapter>();
  for(const raw of installed){const owner=Object.freeze({ownerId:uuid.parse(raw.ownerId),route:text.parse(raw.route),profileDigest:text.parse(raw.profileDigest),port:raw.port,...(raw.result?{result:raw.result}:{})});demand(!map.has(owner.ownerId)&&![...map.values()].some(o=>o.route===owner.route&&o.profileDigest===owner.profileDigest),'CHECK_BINDING_MISMATCH');map.set(owner.ownerId,owner);}
  this.owners=map;this.retry=new RetryRepository(model,usage,usage.hooks);
 }
 private route(route:string,profileDigest:string):InstalledAdapter{const matches=[...this.owners.values()].filter(o=>o.route===route&&o.profileDigest===profileDigest);demand(matches.length===1,'MODEL_UNAVAILABLE');return matches[0]!;}
 private originalOwner(state:OriginalState):InstalledAdapter{const o=this.owners.get(state.owner.ownerId);demand(o&&o.route===state.owner.route&&o.profileDigest===state.owner.profileDigest,'MODEL_UNAVAILABLE');return o;}
 async prepare(scope:VerifiedScope,input:PrepareInput):Promise<PreparedAttempt>{
  const r=EncodedRequestSchema.parse(input.request),owner=this.route(input.route,r.profileDigest);return this.model.prepare(scope,input,tx=>this.usage.installInTransaction(tx,scope,r.original,owner));
 }
 async takeRetry(scope:VerifiedScope,input:RetryInput,native?:NativeRetryPrefix):Promise<PreparedAttempt>{const owner=this.route(input.route,EncodedRequestSchema.parse(input.request).profileDigest);return this.retry.take(scope,input,owner,native);}
 async failureEvidence(scope:VerifiedScope,original:OriginalCall){
  const state=await this.usage.uow.withScope(scope,tx=>this.usage.load(tx,scope,original)),owner=this.originalOwner(state);
  return new OwnerFailureVerifier(owner.port,owner.ownerId,owner.profileDigest).resolve(original);
 }
 async dispatch(scope:VerifiedScope,original:OriginalCall):Promise<UsageResult>{
  const o=OriginalCallSchema.parse(original);
  // Validate installed original before consuming durable claim. Restored claimed
  // work returns no permit, regardless of adapter lookup absence.
  await this.usage.uow.withScope(scope,async tx=>{await this.usage.load(tx,scope,o);});
  const permit=await this.model.claim(scope,o.attemptId);demand(permit,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');return this.dispatchPermit(scope,o,permit);
 }
 async dispatchPermit(scope:VerifiedScope,raw:OriginalCall,permit:DispatchPermit):Promise<UsageResult>{
  const o=OriginalCallSchema.parse(raw);
  return this.model.withDispatch(scope,permit,async(tx,r)=>{
   demand(r.original.attemptId===o.attemptId&&r.original.requestDigest===o.requestDigest,'CHECK_BINDING_MISMATCH');const state=await this.usage.load(tx,scope,o),owner=this.originalOwner(state);
   let timer:ReturnType<typeof setTimeout>|undefined;
   let observation:OwnerObservation;
   try{observation=await Promise.race([owner.port.accept(r),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new ModelError('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION')),this.acceptTimeoutMs);})]);}
   catch{observation={status:'unknown',original:o};}finally{if(timer)clearTimeout(timer);}
   // This transaction holds native fence only across bounded acceptance ACK,
   // never inference delay/completion or a later usage poll.
   return this.usage.observe(tx,scope,state,OwnerObservationSchema.parse(observation));
  });
 }
 /** Stages only already-settled output. Disclosure belongs to the native current
  * audience boundary; usage/accounting remains recoverable independently. */
 async stageOutput(scope:VerifiedScope,raw:OriginalCall):Promise<{output:string;chunks:readonly string[];request:EncodedRequest}>{
  const o=OriginalCallSchema.parse(raw);
  const state=await this.usage.uow.withScope(scope,async tx=>{
   const state=await this.usage.load(tx,scope,o);
   const row=(await tx.query('SELECT record FROM fabric.model_resolutions WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[o.tenantId,o.spaceId,o.attemptId])).rows[0];
   const observation=OwnerObservationSchema.parse(row?.['record']);demand(observation.status==='settled'&&observation.receipt.outcome==='answer','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');return {state,receipt:observation.receipt};
  });
  const owner=this.originalOwner(state.state);demand(owner.result,'MODEL_UNAVAILABLE');
  const r=object({schemaVersion:version,original:OriginalCallSchema,output:nullable(body),chunks:list(body),privateState:nullable(uuid)}).parse(await owner.result(o));
  demand(canonicalDigest(r.original)===canonicalDigest(o)&&r.output!==null&&r.chunks.join('')===r.output&&'sha256:'+canonicalDigest(r.output)===state.receipt.outputDigest,'CHECK_BINDING_MISMATCH');
  return {output:r.output,chunks:r.chunks,request:state.state.request};
 }
 async reconcile(scope:VerifiedScope,original:OriginalCall):Promise<UsageResult>{return this.ownerAction(scope,original,'lookup');}
 async seal(scope:VerifiedScope,original:OriginalCall):Promise<UsageResult>{return this.ownerAction(scope,original,'seal');}
 async cancel(scope:VerifiedScope,original:OriginalCall):Promise<UsageResult>{return this.ownerAction(scope,original,'cancel');}
 private async ownerAction(scope:VerifiedScope,raw:OriginalCall,action:'lookup'|'seal'|'cancel'):Promise<UsageResult>{
  const o=OriginalCallSchema.parse(raw);
  return this.usage.uow.withScope(scope,async tx=>{
   const state=await this.usage.load(tx,scope,o),owner=this.originalOwner(state);
   let observation:OwnerObservation;
   try{observation=await(action==='lookup'?owner.port.lookup(o):action==='cancel'?owner.port.cancel(o):owner.port.sealUnaccepted(o,state.attempt.dispatchEpoch));}
   catch(e){if(e instanceof ModelError&&['UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','AUTHORITY_UNAVAILABLE'].includes(e.code))observation={status:'unknown',original:o};else throw e;}
   return this.usage.observe(tx,scope,state,OwnerObservationSchema.parse(observation));
  });
 }
}
