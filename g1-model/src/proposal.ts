import { canonicalDigest } from './native-imports.js';
import { body, object, uuid } from './decoder.js';
import { EncodedRequestSchema, TaskCapsuleSchema, OperatingProfileSchema } from './schema.js';
import { StreamChunkSchema, LocalPayloadSchema, requestDigestOf, type LocalAdapterClient } from './test-adapter.js';
import type { OriginalCall, EncodedRequest, TaskCapsule, OperatingProfile, VerifiedScope } from './contracts.js';
import { AuthorizedContextCompiler, type SourceDescriptor } from './context.js';
import { demand, ModelError } from './errors.js';

export const LocalProposalArgumentsSchema=object({message:body});
declare const proposalBrand:unique symbol;
export interface ValidatedProposal {readonly [proposalBrand]:true}
interface ProposalRecord {readonly original:OriginalCall;readonly capsule:TaskCapsule;readonly profile:OperatingProfile;readonly descriptors:readonly SourceDescriptor[];readonly arguments:ReturnType<typeof LocalProposalArgumentsSchema.parse>}
export interface NativeTestEffectPort {
 /** Installed native owner checks Task/Run, pending model/effects, current intent,
  * grants, exact target and generation. It performs its own effect transaction. */
 handoff(scope:VerifiedScope,input:{original:OriginalCall;capsule:TaskCapsule;target:'local-test-effect';operationId:string;arguments:ReturnType<typeof LocalProposalArgumentsSchema.parse>}):Promise<void>;
}
/** Validation tokens are one use and never transferable JSON. No real tools. */
export class ProposalValidator {
 private readonly proposals=new WeakMap<object,ProposalRecord>();
 private readonly collected=new Set<string>();
 constructor(private readonly client:LocalAdapterClient,private readonly compiler:AuthorizedContextCompiler,private readonly native:NativeTestEffectPort){}
 async collect(scope:VerifiedScope,input:{request:EncodedRequest;capsule:TaskCapsule;profile:OperatingProfile;descriptors:readonly SourceDescriptor[]},frames:AsyncIterable<unknown>=this.client.stream(input.request.original)):Promise<ValidatedProposal>{
  const request=EncodedRequestSchema.parse(input.request),original=request.original,capsule=TaskCapsuleSchema.parse(input.capsule),profile=OperatingProfileSchema.parse(input.profile);
  demand(original.requestDigest===requestDigestOf(request)&&request.profileDigest===profile.profileDigest&&request.contextDigest==='sha256:'+canonicalDigest(capsule.manifest),'CHECK_BINDING_MISMATCH');
  let payload:unknown;try{payload=JSON.parse(request.payload);}catch{throw new ModelError('INVALID_SCHEMA');}
  const encoded=LocalPayloadSchema.parse(payload);
  demand(encoded.response==='tool'&&encoded.toolArguments!==null&&encoded.text===JSON.stringify({schemaVersion:1,profile,capsule}),'CHECK_BINDING_MISMATCH');
  demand(original.tenantId===capsule.binding.tenantId&&original.spaceId===capsule.binding.spaceId,'SCOPE_MISMATCH');
  await this.compiler.assertCurrent(scope,capsule,profile,input.descriptors);
  const identity=canonicalDigest(original);demand(!this.collected.has(identity),'IDEMPOTENCY_CONFLICT');
  let raw='',sequence=0,final=false;
  for await(const value of frames){const frame=StreamChunkSchema.parse(value);
   demand(!final&&frame.kind==='tool-arguments'&&canonicalDigest(frame.original)===canonicalDigest(original)&&frame.sequence===++sequence&&sequence<=256,'CHECK_BINDING_MISMATCH');
   raw+=frame.fragment;demand(Buffer.byteLength(raw)<=1_048_576,'INVALID_SCHEMA');final=frame.final;
  }
  demand(sequence>0&&final,'CHECK_BINDING_MISMATCH');
  let data:unknown;try{data=JSON.parse(raw);}catch{throw new ModelError('INVALID_SCHEMA');}
  const args=LocalProposalArgumentsSchema.parse(data);
  // No caller supplied receipt, cached reply or final flag establishes completion.
  const observation=await this.client.lookup(original);
  demand(observation.status==='settled'&&observation.receipt.outcome==='answer'&&observation.receipt.outputDigest==='sha256:'+canonicalDigest(raw),'CHECK_BINDING_MISMATCH');
  await this.compiler.assertCurrent(scope,capsule,profile,input.descriptors);
  demand(!this.collected.has(identity),'IDEMPOTENCY_CONFLICT');this.collected.add(identity);
  const token=Object.freeze({}) as ValidatedProposal;
  this.proposals.set(token,{original,capsule,profile,descriptors:input.descriptors.map(d=>Object.freeze({...d})),arguments:args});return token;
 }
 async handoff(scope:VerifiedScope,proposal:ValidatedProposal,target:string):Promise<void>{
  const record=this.proposals.get(proposal);demand(record,'CHECK_BINDING_MISMATCH');
  demand(target==='local-test-effect','REQUIRED_CAPABILITY_UNSUPPORTED');demand(record.capsule.binding.intent==='Act','INTENT_EXCEEDED');
  await this.compiler.assertCurrent(scope,record.capsule,record.profile,record.descriptors);
  // Stable native operation identity survives validator recreation; the native
  // owner still supplies durable original-key/idempotency/fencing admission.
  const digest=canonicalDigest({kind:'local-proposal-effect-v1',original:record.original}),operationId=uuid.parse([digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-'));
  demand(this.proposals.get(proposal)===record,'IDEMPOTENCY_CONFLICT');
  this.proposals.delete(proposal); // Failure/unknown is not permission to replay.
  await this.native.handoff(scope,{original:record.original,capsule:record.capsule,target,operationId,arguments:record.arguments});
 }
}
