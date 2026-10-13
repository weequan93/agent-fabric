import { CurrentAudienceVerifier } from '../../g1-identity/src/audience.js';
import { canonicalDigest, assertVerifiedScope, revalidateScope } from './native-imports.js';
import type { AsyncUnitOfWork, SqlTransaction, VerifiedScope, TaskCallBinding, TaskCapsule, OperatingProfile, OriginalCall, EncodedRequest } from './contracts.js';
import type { SessionState } from './native-imports.js';
import { SourceRecordSchema, ScopeSchema, TaskCallBindingSchema, TaskCapsuleSchema, ContextManifestSchema, OperatingProfileSchema } from './schema.js';
import { boolean, body, digest, enumeration, list, nullable, object, revision, text, timestamp, uuid, version } from './decoder.js';
import { demand } from './errors.js';
import { LocalPayloadSchema, encodeLocalRequest, ADAPTER_VERSION } from './test-adapter.js';
import { safeAdd } from './arithmetic.js';

export const SourceDescriptorSchema=object({sourceId:uuid,revision,digest,scope:ScopeSchema,
 audience:object({destinationSpaceId:uuid,recipientActorIds:list(uuid,256,1),revisionDigest:digest}),provenance:text,observedAt:timestamp,
 trust:enumeration('approved-instruction','user-goal','requirement','source-evidence','untrusted-observation'),
 kind:enumeration('instruction','goal','requirement','evidence','repository','memory','dialogue','tool-schema'),
 sourceTaskId:uuid,crossThread:boolean});
export type SourceDescriptor=ReturnType<typeof SourceDescriptorSchema.parse>;
export const CapsuleFactsSchema=object({requirements:list(body),evidence:list(SourceRecordSchema),hypotheses:list(body),uncertainty:list(body),failedPlans:list(body),pendingOperations:list(uuid),
 artifacts:list(object({artifactId:uuid,revision,digest})),checks:list(object({checkId:uuid,artifactDigest:digest,status:enumeration('pending','passed','failed','unknown')})),nextSafeAction:text});
export type CapsuleFacts=ReturnType<typeof CapsuleFactsSchema.parse>;
/** Lossless safe-boundary capsule projection. No summary text gains authority. */
export function capsuleFactsOf(input:unknown):CapsuleFacts{
 const {schemaVersion:_version,binding:_binding,manifest:_manifest,...facts}=TaskCapsuleSchema.parse(input);
 return CapsuleFactsSchema.parse(facts);
}
const hash=(value:unknown)=>'sha256:'+canonicalDigest(value);
export const sourceRevisionDigestOf=(input:readonly SourceDescriptor[])=>hash(list(SourceDescriptorSchema).parse(input));
export function descriptorOf(record:ReturnType<typeof SourceRecordSchema.parse>,sourceTaskId:string,crossThread=false):SourceDescriptor{
 const {content:_content,...metadata}=SourceRecordSchema.parse(record);return SourceDescriptorSchema.parse({...metadata,sourceTaskId,crossThread});
}
/** Source owner only. Metadata reads disclose no body; every fetch is preceded by
 * current descriptor/audience authorization inside the authenticated transaction. */
export interface ContextSourcePort {
 current(tx:SqlTransaction,scope:VerifiedScope,sourceId:string):Promise<SourceDescriptor>;
 retrieve(tx:SqlTransaction,scope:VerifiedScope,descriptor:SourceDescriptor):Promise<ReturnType<typeof SourceRecordSchema.parse>>;
}
/** Minimal native Task-backed source owner. Sources are installed in governed
 * Task requirements; the compiler never owns a competing content store. Queries
 * use authenticated native RLS and select metadata before fetching any body.
 * Cross-Space sharing needs a separately installed current source owner route. */
export class TaskContextSourceStore implements ContextSourcePort {
 private readonly catalogue:ReadonlyMap<string,{readonly tenantId:string;readonly spaceId:string;readonly taskId:string}>;
 constructor(entries:readonly {readonly sourceId:string;readonly tenantId:string;readonly spaceId:string;readonly taskId:string}[]){
  const map=new Map<string,{tenantId:string;spaceId:string;taskId:string}>();
  for(const e of entries){demand(!map.has(uuid.parse(e.sourceId)),'IDEMPOTENCY_CONFLICT');map.set(e.sourceId,Object.freeze({tenantId:uuid.parse(e.tenantId),spaceId:uuid.parse(e.spaceId),taskId:uuid.parse(e.taskId)}));}this.catalogue=map;
 }
 private owner(scope:VerifiedScope,sourceId:string){const o=this.catalogue.get(uuid.parse(sourceId));demand(o&&o.tenantId===scope.tenantId&&o.spaceId===scope.spaceId,'UNAUTHORIZED');return o;}
 async current(tx:SqlTransaction,scope:VerifiedScope,sourceId:string):Promise<SourceDescriptor>{
  const o=this.owner(scope,sourceId);
  const row=(await tx.query("SELECT revision,requirements->'contextSources'->$4::text->'descriptor' AS descriptor FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3",[o.tenantId,o.spaceId,o.taskId,sourceId])).rows[0];
  demand(row?.['descriptor'],'UNAUTHORIZED');const d=SourceDescriptorSchema.parse(row['descriptor']);
  demand(d.sourceId===sourceId&&d.sourceTaskId===o.taskId&&d.scope.tenantId===o.tenantId&&d.scope.spaceId===o.spaceId&&d.revision===Number(row['revision']),'CHECK_BINDING_MISMATCH');return d;
 }
 async retrieve(tx:SqlTransaction,scope:VerifiedScope,descriptor:SourceDescriptor):Promise<ReturnType<typeof SourceRecordSchema.parse>>{
  const d=SourceDescriptorSchema.parse(descriptor),o=this.owner(scope,d.sourceId);
  demand(same(await this.current(tx,scope,d.sourceId),d),'STALE_REVISION');
  const row=(await tx.query("SELECT requirements->'contextSources'->$4::text->'record' AS record FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3",[o.tenantId,o.spaceId,o.taskId,d.sourceId])).rows[0];
  return SourceRecordSchema.parse(row?.['record']);
 }
}
export interface ContextBindingPort {
 /** Owner compares to admitted native Task/Run/session, intent/grants, versions,
  * current selected profile and original payer. A caller binding is never authority. */
 authorize(tx:SqlTransaction,scope:VerifiedScope,binding:TaskCallBinding,profile:OperatingProfile):Promise<void>;
 /** Historical facts require current native authority, never invocation availability. */
 authorizePreserved?(tx:SqlTransaction,scope:VerifiedScope,binding:TaskCallBinding,profile:OperatingProfile):Promise<void>;
}
const same=(a:unknown,b:unknown)=>canonicalDigest(a)===canonicalDigest(b);
export function encodingDigestOf(input:OperatingProfile):string{return hash({adapterVersion:ADAPTER_VERSION,encoding:'typed-profile-capsule-v1',profile:OperatingProfileSchema.parse(input)});}
function manifestEncodingDigestOf(profile:OperatingProfile,binding:TaskCallBinding,facts:CapsuleFacts):string{return hash({encoder:encodingDigestOf(profile),binding:TaskCallBindingSchema.parse(binding),facts:CapsuleFactsSchema.parse(facts)});}

export class AuthorizedContextCompiler {
 private readonly audience=new CurrentAudienceVerifier();
 constructor(private readonly uow:AsyncUnitOfWork,private readonly sources:ContextSourcePort,private readonly bindingOwner:ContextBindingPort){}
 private async authorizeDescriptor(tx:SqlTransaction,scope:VerifiedScope,d:SourceDescriptor,crossThreadRecall:boolean):Promise<void>{
  demand(d.scope.tenantId===scope.tenantId&&d.audience.destinationSpaceId===scope.spaceId&&d.audience.recipientActorIds.includes(scope.actorId),'SCOPE_MISMATCH');
  demand(!d.crossThread||crossThreadRecall,'UNAUTHORIZED');
  // Trust is typed metadata from the source owner, never inferred from body text.
  demand(d.kind==='instruction'?d.trust==='approved-instruction':d.kind==='goal'?d.trust==='user-goal':d.kind==='requirement'?d.trust==='requirement':!['approved-instruction','user-goal','requirement'].includes(d.trust),'UNAUTHORIZED');
  await this.audience.verify(tx,scope,{sourceSpaceId:d.scope.spaceId,destinationSpaceId:d.audience.destinationSpaceId,sourceTaskId:d.sourceTaskId,
   recipientActorIds:d.audience.recipientActorIds,revisionDigest:d.audience.revisionDigest});
  const current=SourceDescriptorSchema.parse(await this.sources.current(tx,scope,d.sourceId));demand(same(current,d),'STALE_REVISION');
 }
 private async binding(tx:SqlTransaction,scope:VerifiedScope,b:TaskCallBinding,p:OperatingProfile,preserved=false):Promise<void>{
  assertVerifiedScope(scope);await revalidateScope(scope);
  demand(b.tenantId===scope.tenantId&&b.spaceId===scope.spaceId&&b.actorId===scope.actorId&&b.payerId===scope.payerId,'SCOPE_MISMATCH');
  demand(b.policyRevision===scope.authorityRevision&&b.membershipRevision===scope.membershipRevision,'STALE_REVISION');
  demand(b.versions.environmentDigest===p.runtimeRequirements.environmentDigest,'CHECK_BINDING_MISMATCH');
  if(preserved){demand(this.bindingOwner.authorizePreserved,'UNAUTHORIZED');await this.bindingOwner.authorizePreserved(tx,scope,b,p);}
  else await this.bindingOwner.authorize(tx,scope,b,p);
 }
 async compile(scope:VerifiedScope,input:{binding:TaskCallBinding;profile:OperatingProfile;descriptors:readonly SourceDescriptor[];facts:CapsuleFacts;crossThreadRecall:boolean}):Promise<TaskCapsule>{
  return this.uow.withScope(scope,tx=>this.compileInTransaction(tx,scope,input));
 }
 async compileInTransaction(tx:SqlTransaction,scope:VerifiedScope,input:{binding:TaskCallBinding;profile:OperatingProfile;descriptors:readonly SourceDescriptor[];facts:CapsuleFacts;crossThreadRecall:boolean}):Promise<TaskCapsule>{
  const b=TaskCallBindingSchema.parse(input.binding),p=OperatingProfileSchema.parse(input.profile),descriptors=list(SourceDescriptorSchema).parse(input.descriptors),facts=CapsuleFactsSchema.parse(input.facts),recall=boolean.parse(input.crossThreadRecall);
  demand(new Set(descriptors.map(d=>d.sourceId)).size===descriptors.length,'INVALID_SCHEMA');
  demand(b.sourceRevisionDigest===sourceRevisionDigestOf(descriptors),'CHECK_BINDING_MISMATCH');
  await this.binding(tx,scope,b,p);
  // All descriptors authorize before the FIRST retrieval. A denied later source
  // cannot cause earlier selected source bodies to leak to an encoder/model.
  for(const d of descriptors)await this.authorizeDescriptor(tx,scope,d,recall);
  const records=[];
  for(const d of descriptors){
   const record=SourceRecordSchema.parse(await this.sources.retrieve(tx,scope,d));
   demand(same(descriptorOf(record,d.sourceTaskId,d.crossThread),d)&&record.digest===hash(record.content),'STALE_REVISION');records.push(record);
  }
  for(const e of facts.evidence)demand(records.some(r=>same(r,e)),'UNAUTHORIZED');
  const manifest=ContextManifestSchema.parse({schemaVersion:1,scope:{tenantId:b.tenantId,spaceId:b.spaceId},policyRevision:b.policyRevision,membershipRevision:b.membershipRevision,
   profileDigest:p.profileDigest,encodingDigest:manifestEncodingDigestOf(p,b,facts),sources:records,crossThreadRecall:recall});
  const capsule=TaskCapsuleSchema.parse({schemaVersion:1,binding:b,manifest,...facts});
  await this.assertCurrentInTransaction(tx,scope,capsule,p,descriptors);return capsule;
 }
 async assertCurrent(scope:VerifiedScope,input:TaskCapsule,profile:OperatingProfile,descriptors:readonly SourceDescriptor[]):Promise<void>{
  await this.uow.withScope(scope,tx=>this.assertCurrentInTransaction(tx,scope,input,profile,descriptors));
 }
 async assertCurrentInTransaction(tx:SqlTransaction,scope:VerifiedScope,input:TaskCapsule,profile:OperatingProfile,refs:readonly SourceDescriptor[]):Promise<void>{
  await this.validateInTransaction(tx,scope,input,profile,refs,false);
 }
 async assertPreservedInTransaction(tx:SqlTransaction,scope:VerifiedScope,input:TaskCapsule,profile:OperatingProfile,refs:readonly SourceDescriptor[]):Promise<void>{
  await this.validateInTransaction(tx,scope,input,profile,refs,true);
 }
 private async validateInTransaction(tx:SqlTransaction,scope:VerifiedScope,input:TaskCapsule,profile:OperatingProfile,refs:readonly SourceDescriptor[],preserved:boolean):Promise<void>{
  const c=TaskCapsuleSchema.parse(input),p=OperatingProfileSchema.parse(profile),ds=list(SourceDescriptorSchema).parse(refs);
  const {schemaVersion:_version,binding:_binding,manifest:_manifest,...facts}=c;
  await this.binding(tx,scope,c.binding,p,preserved);
  demand(c.manifest.profileDigest===p.profileDigest&&c.manifest.encodingDigest===manifestEncodingDigestOf(p,c.binding,facts)&&c.binding.sourceRevisionDigest===sourceRevisionDigestOf(ds)
   &&ds.length===c.manifest.sources.length,'CHECK_BINDING_MISMATCH');
  for(let i=0;i<ds.length;i++){const d=ds[i]!,r=c.manifest.sources[i]!;demand(same(descriptorOf(r,d.sourceTaskId,d.crossThread),d)&&r.digest===hash(r.content),'STALE_REVISION');await this.authorizeDescriptor(tx,scope,d,c.manifest.crossThreadRecall);}
  for(const e of c.evidence)demand(c.manifest.sources.some(r=>same(r,e)),'UNAUTHORIZED');
  await revalidateScope(scope);
 }
 async encode(scope:VerifiedScope,input:{capsule:TaskCapsule;profile:OperatingProfile;descriptors:readonly SourceDescriptor[];original:OriginalCall;outputCap:number;durationCapMs:number;dispatchEpoch:number;response:'text'|'tool';toolArguments:{readonly message:string}|null;privateState:string|null}):Promise<EncodedRequest>{
  return this.uow.withScope(scope,async tx=>{
   await this.assertCurrentInTransaction(tx,scope,input.capsule,input.profile,input.descriptors);
   const p=OperatingProfileSchema.parse(input.profile),capsule=TaskCapsuleSchema.parse(input.capsule);
   demand(input.original.tenantId===scope.tenantId&&input.original.spaceId===scope.spaceId,'SCOPE_MISMATCH');
   // Entire full profile and actual manifest are captured downstream; hostile
   // source content remains in typed records. No instruction/grant promotion.
   const payload=JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:p.toolPresentation.dialect,
    text:JSON.stringify({schemaVersion:1,profile:p,capsule}),response:input.response,toolArguments:input.toolArguments,privateState:input.privateState}));
   demand(Buffer.byteLength(payload)<=p.capabilities.contextLimit,'REQUIRED_CAPABILITY_UNSUPPORTED');
   demand(p.capabilities.caps.output&&p.capabilities.caps.duration&&input.outputCap<=1_048_576&&input.durationCapMs<=30_000,'REQUIRED_CAPABILITY_UNSUPPORTED');
   demand(input.response==='tool'?p.capabilities.streaming.toolArguments&&input.toolArguments!==null:input.toolArguments===null,'REQUIRED_CAPABILITY_UNSUPPORTED');
   return encodeLocalRequest({schemaVersion:1,original:input.original,profileDigest:p.profileDigest,contextDigest:hash(capsule.manifest),payload,outputCap:input.outputCap,durationCapMs:input.durationCapMs,dispatchEpoch:input.dispatchEpoch});
  });
 }
}

/** Opaque UUID handles are local provider state, never capsule facts or knowledge. */
export class ScopedPrivateState {
 private readonly entries=new Map<string,string>();
 constructor(private readonly compiler:AuthorizedContextCompiler){}
 private key(scope:VerifiedScope,c:TaskCapsule,p:OperatingProfile):string{return hash({tenantId:scope.tenantId,spaceId:scope.spaceId,actorId:scope.actorId,payerId:scope.payerId,
  policyRevision:c.binding.policyRevision,membershipRevision:c.binding.membershipRevision,versions:c.binding.versions,provider:p.provider,profile:p.profileDigest,route:p.route,region:p.region,manifest:c.manifest});}
 async put(scope:VerifiedScope,c:TaskCapsule,p:OperatingProfile,refs:readonly SourceDescriptor[],opaque:string):Promise<void>{await this.compiler.assertCurrent(scope,c,p,refs);demand(p.capabilities.caching.providerPrivateState,'REQUIRED_CAPABILITY_UNSUPPORTED');this.entries.set(this.key(scope,c,p),uuid.parse(opaque));}
 async get(scope:VerifiedScope,c:TaskCapsule,p:OperatingProfile,refs:readonly SourceDescriptor[]):Promise<string|null>{await this.compiler.assertCurrent(scope,c,p,refs);return this.entries.get(this.key(scope,c,p))??null;}
}
export interface SwitchBoundaryPort {
 loadCurrent(binding:TaskCallBinding):Promise<SessionState>;
 /** Native owner validates explicit semantic/residency/version changes and binds
  * the current admitted Task; this cannot be a caller boolean. */
 validateChange(previous:TaskCapsule,next:TaskCallBinding,from:OperatingProfile,to:OperatingProfile):Promise<void>;
}
export async function switchCapsule(input:{scope:VerifiedScope;compiler:AuthorizedContextCompiler;boundary:SwitchBoundaryPort;previous:TaskCapsule;from:OperatingProfile;to:OperatingProfile;binding:TaskCallBinding;descriptors:readonly SourceDescriptor[]}):Promise<{capsule:TaskCapsule;cache:'lost/not-used';revalidationEstimate:number}>{
 const old=TaskCapsuleSchema.parse(input.previous),from=OperatingProfileSchema.parse(input.from),to=OperatingProfileSchema.parse(input.to),next=TaskCallBindingSchema.parse(input.binding);
 await input.compiler.assertCurrent(input.scope,old,from,input.descriptors);
 const state=await input.boundary.loadCurrent(old.binding);
 demand(state.run.taskId===old.binding.taskId&&state.run.runId===old.binding.runId&&state.run.scope.tenantId===old.binding.tenantId&&state.run.scope.spaceId===old.binding.spaceId,'CHECK_BINDING_MISMATCH');
 demand(state.pendingModel===null&&state.pendingOperations.length===0&&old.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
 demand(['running','waiting','paused'].includes(state.run.state),'TERMINAL_RUN');
 // Switching cannot increase intent, move attribution, discard fences or invent a
 // new Task/Run/session. Only compatible pins/source revisions can be revalidated.
 const stable=(b:TaskCallBinding)=>({...b,versions:null,sourceRevisionDigest:null});demand(same(stable(old.binding),stable(next)),'CHECK_BINDING_MISMATCH');
 await input.boundary.validateChange(old,next,from,to);
 const facts=capsuleFactsOf(old);
 const capsule=await input.compiler.compile(input.scope,{binding:next,profile:to,descriptors:input.descriptors,facts,crossThreadRecall:old.manifest.crossThreadRecall});
 await input.boundary.validateChange(old,next,from,to);
 const final=await input.boundary.loadCurrent(next);demand(final.pendingModel===null&&final.pendingOperations.length===0&&final.run.generation===state.run.generation&&final.run.revision===state.run.revision,'STALE_FENCE');
 const reencoded=JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:to.toolPresentation.dialect,text:JSON.stringify({schemaVersion:1,profile:to,capsule}),response:'text',toolArguments:null,privateState:null}));
 return Object.freeze({capsule,cache:'lost/not-used',revalidationEstimate:safeAdd(2,Buffer.byteLength(reencoded)) });
}
