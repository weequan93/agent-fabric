import { AuthorizedContextCompiler,CapsuleFactsSchema,capsuleFactsOf,type SourceDescriptor } from './context.js';
import { TaskCapsuleSchema,OperatingProfileSchema,EncodedRequestSchema } from './schema.js';
import { LocalPayloadSchema } from './test-adapter.js';
import { object,version } from './decoder.js';
import { demand } from './errors.js';
import { safeAdd } from './arithmetic.js';
import { hash,type CurrentModelAuthority } from './model-repository.js';
import type { NativeSnapshot } from './native-repository.js';
import type { VerifiedScope,SqlTransaction,EncodedRequest,OperatingProfile,OriginalCall,AsyncUnitOfWork } from './contracts.js';
/** One compiler and current audience owner for request admission, dispatch and
 * every disclosure. Sources are installed native references, never URL/tool text. */
export class NativeContext {
 constructor(readonly compiler:AuthorizedContextCompiler,readonly descriptorsFor:(sessionId:string)=>readonly SourceDescriptor[],readonly currentBinding:CurrentModelAuthority,readonly uow:AsyncUnitOfWork){}
 private async preserved(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot){
  const pending=[...s.events].reverse().find(e=>e.kind==='model-pending'),operation=pending?.payload['operation'] as {operationId:string}|undefined;
  const row=operation?(await tx.query('SELECT a.request FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.operation_id=$3 AND o.session_id=$4 ORDER BY a.ordinal DESC LIMIT 1',[scope.tenantId,scope.spaceId,operation.operationId,s.binding.sessionId])).rows[0]:undefined;
  if(!row)return null;
  const request=EncodedRequestSchema.parse(row['request']),payload=LocalPayloadSchema.parse(JSON.parse(request.payload)),old=object({schemaVersion:version,profile:OperatingProfileSchema,capsule:TaskCapsuleSchema}).parse(JSON.parse(payload.text));
  demand(request.profileDigest===old.profile.profileDigest&&hash(old.capsule.manifest)===request.contextDigest&&hash(old.capsule.binding)===hash(s.binding),'CHECK_BINDING_MISMATCH');
  await this.compiler.assertPreservedInTransaction(tx,scope,old.capsule,old.profile,this.descriptorsFor(s.binding.sessionId));
  return old.capsule;
 }
 async encode(scope:VerifiedScope,s:NativeSnapshot,profile:OperatingProfile,input:string,original:Omit<OriginalCall,'requestDigest'>):Promise<EncodedRequest>{
  const descriptors=this.descriptorsFor(s.binding.sessionId),old=await this.uow.withScope(scope,tx=>this.preserved(tx,scope,s));
  const facts=old?CapsuleFactsSchema.parse({...capsuleFactsOf(old),requirements:[...old.requirements,input]}):CapsuleFactsSchema.parse({requirements:[input],evidence:[],hypotheses:[],uncertainty:['Local deterministic adapter only'],failedPlans:[],pendingOperations:[],artifacts:[],checks:[],nextSafeAction:'Reconcile only the original model operation'});
  const capsule=await this.compiler.compile(scope,{binding:s.binding,profile,descriptors,facts,crossThreadRecall:old?.manifest.crossThreadRecall??false});
  return this.compiler.encode(scope,{capsule,profile,descriptors,original:{...original,requestDigest:'sha256:'+'0'.repeat(64)},outputCap:s.admission.need.outputCap,durationCapMs:s.admission.need.durationCapMs,dispatchEpoch:1,response:'text',toolArguments:null,privateState:null});
 }
 async assertCurrent(tx:SqlTransaction,scope:VerifiedScope,request:EncodedRequest):Promise<void>{
  const r=EncodedRequestSchema.parse(request),payload=LocalPayloadSchema.parse(JSON.parse(r.payload)),decoded=object({schemaVersion:version,profile:OperatingProfileSchema,capsule:TaskCapsuleSchema}).parse(JSON.parse(payload.text));
  demand(decoded.profile.profileDigest===r.profileDigest&&hash(decoded.capsule.manifest)===r.contextDigest,'CHECK_BINDING_MISMATCH');
  await this.currentBinding.assertCurrent(tx,scope,decoded.capsule.binding,r);
  await this.compiler.assertCurrentInTransaction(tx,scope,decoded.capsule,decoded.profile,this.descriptorsFor(decoded.capsule.binding.sessionId));
 }
 async assertControl(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot,profile:OperatingProfile):Promise<number>{
  const old=await this.preserved(tx,scope,s),facts=old?capsuleFactsOf(old):CapsuleFactsSchema.parse({requirements:[],evidence:[],hypotheses:[],uncertainty:['Local deterministic adapter only'],failedPlans:[],pendingOperations:[],artifacts:[],checks:[],nextSafeAction:'Explicit current native control'}),recall=old?.manifest.crossThreadRecall??false;
  demand(facts.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
  const capsule=await this.compiler.compileInTransaction(tx,scope,{binding:s.binding,profile,descriptors:this.descriptorsFor(s.binding.sessionId),facts,crossThreadRecall:recall});
  const payload=JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:profile.toolPresentation.dialect,text:JSON.stringify({schemaVersion:1,profile,capsule}),response:'text',toolArguments:null,privateState:null}));
  return safeAdd(2,Buffer.byteLength(payload),s.admission.need.outputCap);
 }
}
