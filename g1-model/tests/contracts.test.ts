import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../src/schema.js';
import * as d from '../src/decoder.js';
import * as a from '../src/arithmetic.js';
import * as f from './helpers/acceptance-contract-fixtures.js';
import { id,sha,profileFixture,qualificationFixture,receiptFixture } from './helpers/contract-fixtures.js';
import { ModelError,safeFailure } from '../src/errors.js';
import { QualificationRegistry } from '../src/qualification.js';
import { ProfileNeedSchema,ProfileChoiceSchema,ApprovalRulesSchema,CachePolicySchema,supports } from '../src/profile.js';
import { AuthorizedContextCompiler,CapsuleFactsSchema,SourceDescriptorSchema,capsuleFactsOf } from '../src/context.js';
import { ResourceCategorySchema,ResourceReceiptSchema,ResourceCommandSchema,SuspendProofSchema,resourceUnits } from '../src/resource-contract.js';
import { LocalAdapterClient,LocalPayloadSchema,ScheduleSchema,StreamChunkSchema,encodeLocalRequest,requestDigestOf } from '../src/test-adapter.js';
import { AdmissionSchema,NativeCommandSchema,TurnCommandSchema,ResumeCommandSchema,SwitchCommandSchema,TopUpSchema,StopSchema } from '../src/native-repository.js';
import { ComputerPreflightSchema,NativeComputer } from '../src/native-computer.js';
import { ProposalValidator,LocalProposalArgumentsSchema,type ValidatedProposal } from '../src/proposal.js';
import { assertBillingAncestor } from '../src/native-guard.js';
import { assertContinuationAllowed } from '../src/native-session.js';
import { decodeCategories } from '../src/budget-repository.js';
import { resourceCostView,nativeView } from '../src/view.js';
import * as native from '../src/native-imports.js';
import * as unchanged from '../../engine/kernel/src/session-loop.js';
import { parseTaskEnvelope } from '../../engine/contracts/src/task-envelope.js';
import { DomainError,canonicalDigest } from '../../engine/contracts/src/identity.js';
import { FoundationError } from '../../g1-foundations/src/contracts.js';
import type { TaskCallBinding } from '../src/contracts.js';
import type { TaskEnvelope } from '../../engine/contracts/src/task-envelope.js';

type Row=readonly [string,d.Decoder<unknown>,unknown];
function frozen(value:unknown):void{
 if(value!==null&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const v of Object.values(value))frozen(v);}
}
function paths(value:unknown,prefix:readonly (string|number)[]=[]):readonly (readonly (string|number)[])[]{
 if(value===null||typeof value!=='object')return [];
 return Object.entries(value).flatMap(([key,v])=>{const p=[...prefix,Array.isArray(value)?Number(key):key];return [p,...paths(v,p)];});
}
function parent(value:unknown,path:readonly (string|number)[]):Record<string,unknown>{
 let p=value as Record<string,unknown>;for(const k of path.slice(0,-1))p=p[k] as Record<string,unknown>;return p;
}
function changed(value:unknown,path:readonly (string|number)[],mutate:(p:Record<string,unknown>,k:string)=>void):unknown{
 const clone=structuredClone(value);mutate(parent(clone,path),String(path.at(-1)));return clone;
}
function rehash(value:ReturnType<typeof profileFixture>):ReturnType<typeof profileFixture>{return {...value,profileDigest:s.profileDigestOf(value)};}
const command={sessionId:f.binding.sessionId,key:id(80),expectedRevision:0,expiresAt:f.later};
const request=encodeLocalRequest({schemaVersion:1,original:f.original,profileDigest:f.manifest.profileDigest,contextDigest:sha(34),payload:JSON.stringify({schemaVersion:1,modality:'text',dialect:'local-json-v1',text:'中🙂',response:'text',toolArguments:null,privateState:null}),outputCap:32,durationCapMs:1000,dispatchEpoch:1});
function schemaRows():readonly Row[]{
 const p=profileFixture(),q=qualificationFixture(p),receipt=receiptFixture();
 return [
  ['Scope',s.ScopeSchema,f.source.scope],['OriginalCall',s.OriginalCallSchema,f.original],['Capabilities',s.CapabilitiesSchema,p.capabilities],
  ['OperatingProfile',s.OperatingProfileSchema,p],['LocalQualification',s.LocalQualificationSchema,q],['QualifiedProfile',s.QualifiedProfileSchema,{profile:p,qualification:q}],
  ['VersionPins',s.VersionPinsSchema,f.pins],['TaskCallBinding',s.TaskCallBindingSchema,f.binding],['SourceRecord',s.SourceRecordSchema,f.source],
  ['ContextManifest',s.ContextManifestSchema,f.manifest],['TaskCapsule',s.TaskCapsuleSchema,f.capsule],['EncodedRequest',s.EncodedRequestSchema,request],
  ...(['prepared','pending','unknown','safely-failed','settled'] as const).map(status=>['ModelOperation/'+status,s.ModelOperationSchema,{...f.operation,status,knownReceiptId:status==='settled'?id(18):null}] as const),
  ...(['prepared','claimed','accepted','unknown','settled','sealed-not-accepted'] as const).map(status=>['ModelAttempt/'+status,s.ModelAttemptSchema,{...f.attempt,status,claimId:status==='prepared'?null:id(81)}] as const),
  ['CostComponents',s.CostComponentsSchema,receipt.components],
  ...(['answer','known-failure','cancelled'] as const).map(outcome=>['UsageReceipt/'+outcome,s.UsageReceiptSchema,{...receipt,outcome,outputDigest:outcome==='answer'?sha(19):null}] as const),
  ...(['accepted','unknown'] as const).map(status=>['OwnerObservation/'+status,s.OwnerObservationSchema,{status,original:f.original}] as const),
  ['OwnerObservation/settled',s.OwnerObservationSchema,{status:'settled',receipt}],
  ['ModelAttempt/unclaimed-permanent-seal',s.ModelAttemptSchema,{...f.attempt,status:'sealed-not-accepted',claimId:null}],
  ['OwnerObservation/sealed-not-accepted',s.OwnerObservationSchema,{status:'sealed-not-accepted',original:f.original,ownerId:id(17),proofId:id(39),dispatchEpoch:1}],
  ...(['budget','model-unavailable','approval','resource','permission','connection','unknown-usage'] as const).map(reason=>['Wait/'+reason,s.WaitSchema,{...f.wait,reason}] as const),
  ['ResourceCharge',s.ResourceChargeSchema,f.resource],...f.modelEvents.map(e=>['ModelEvent/'+e.kind,s.ModelEventSchema,e] as const),
  ['LocalConfig',s.LocalConfigSchema,{schemaVersion:1,adapter:'deterministic-local',host:'127.0.0.1',paidCallsAllowed:false,responseCaching:false,gatewayKnowledgeMemory:false,maxAttempts:3,maxAncestry:64,maxContenders:8,postgresImage:'postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333'}],
  ['SourceDescriptor',SourceDescriptorSchema,f.descriptor],['CapsuleFacts',CapsuleFactsSchema,f.facts],['ProfileNeed',ProfileNeedSchema,f.need],
  ['ProfileChoice',ProfileChoiceSchema,{schemaVersion:1,pin:null,preference:'Balanced',allowEquivalentFallback:false}],
  ['ApprovalRules',ApprovalRulesSchema,{schemaVersion:1,providers:[p.provider],routes:[p.route],regions:[p.region],dataPolicies:[p.dataPolicy],runtimeProfiles:[p.runtimeRequirements.profileId]}],
  ['CachePolicy',CachePolicySchema,{schemaVersion:1,exactResponse:false,semanticResponse:false,gatewayKnowledgeMemory:false}],
  ['ResourceReceipt',ResourceReceiptSchema,f.resourceReceipt],['ResourceCommand',ResourceCommandSchema,{resourceId:f.resource.resourceId,key:id(80),expiresAt:f.later,at:0,action:'archive'}],
  ['SuspendProof',SuspendProofSchema,{schemaVersion:1,assurance:'deterministic-local-only',proofId:id(39),ownerId:id(38),tenantId:f.binding.tenantId,spaceId:f.binding.spaceId,resourceId:f.resource.resourceId,assignmentGeneration:0,at:5,status:'confirmed-simulated-suspended'}],
  ['LocalPayload/text',LocalPayloadSchema,JSON.parse(request.payload)],['LocalPayload/tool',LocalPayloadSchema,{...JSON.parse(request.payload),response:'tool',toolArguments:{message:'✓'}}],
  ['Schedule',ScheduleSchema,{usage:'manual',outcome:'answer',durationMs:0,extraUnits:0,dropAck:false}],
  ['StreamChunk',StreamChunkSchema,{schemaVersion:1,original:f.original,sequence:1,kind:'tool-arguments',fragment:'{"message":',final:false}],
  ['LocalProposalArguments',LocalProposalArgumentsSchema,{message:'✓'}],['Admission/service',AdmissionSchema,f.admission],
  ['Admission/computer',AdmissionSchema,{...f.admission,executionClass:'computer',computerCapability:'simulated-computer',resourceId:f.resource.resourceId}],
  ['Admission/target',AdmissionSchema,{...f.admission,executionClass:'target',targetEffect:true}],
  ['NativeCommand',NativeCommandSchema,command],['TurnCommand',TurnCommandSchema,{...command,input:'hello',choice:null}],
  ['ResumeCommand',ResumeCommandSchema,{...command,inputLimitBytes:1}],['SwitchCommand',SwitchCommandSchema,{...command,choice:{schemaVersion:1,pin:id(1),preference:'Fast',allowEquivalentFallback:false}}],
  ['TopUp',TopUpSchema,{sessionId:command.sessionId,key:command.key,expiresAt:command.expiresAt,allowanceId:id(40),expectedAllowanceRevision:1,addedUnits:1}],
  ['Stop',StopSchema,{sessionId:command.sessionId,key:command.key,expiresAt:command.expiresAt,observedRevision:0}],
  ['ComputerPreflight',ComputerPreflightSchema,{schemaVersion:1,sessionId:f.binding.sessionId,taskId:f.binding.taskId,runId:f.binding.runId,resourceId:f.resource.resourceId,policyRevision:0,requirementsRevision:0,generation:0,phase:'preparing',capability:'simulated-computer',requiredGrant:'computer:use',costCategories:['reserved-compute'],chargePolicy:'reserved-until-confirmed-suspended',assurance:'deterministic-local-only'}]
 ];
}

test('C01 / complete closed frozen contracts and qualification relationships',async t=>{
 const rows=schemaRows();assert.ok(rows.length>=70);
 // Every exported schema in the central contract module has an actual decoder row.
 const covered=new Set(rows.map(r=>r[1]));covered.add(s.CostCategorySchema);
 for(const [name,schema]of Object.entries(s))if(name.endsWith('Schema'))assert.ok(covered.has(schema as d.Decoder<unknown>),'unexercised schema '+name);
 for(const [name,decoder,value]of rows){
  await t.test('decoder/'+name+'/roundtrip-closed-root',()=>{
   const decoded=decoder.parse(JSON.parse(JSON.stringify(value)));assert.deepEqual(decoded,value);frozen(decoded);
   for(const invalid of [null,[],undefined,new Date(),()=>{},1n,Symbol('non-json'),Object.create(value as object)])assert.throws(()=>decoder.parse(invalid),ModelError);
   for(const extra of ['unknown','__proto__','constructor','prototype']){const invalid=structuredClone(value) as object;Object.defineProperty(invalid,extra,{value:true,enumerable:true});assert.throws(()=>decoder.parse(invalid),ModelError);}
   const sym=structuredClone(value) as object;Object.defineProperty(sym,Symbol('hidden'),{value:true});assert.throws(()=>decoder.parse(sym),ModelError);
  });
  for(const path of paths(value))await t.test('mandatory/'+name+'/'+path.join('.'),()=>{
   assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>{delete p[k];})),ModelError,'absent field');
   assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>{p[k]=undefined;})),ModelError,'undefined non-JSON field');
   let reads=0;
   assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>Object.defineProperty(p,k,{enumerable:true,configurable:true,get(){reads++;throw new Error('accessor executed');}}))),ModelError);
   assert.equal(reads,0,'accessors never run');
   assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>Object.defineProperty(p,k,{value:p[k],enumerable:false}))),ModelError,'hidden field');
   if(path.at(-1)==='schemaVersion')assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>{p[k]=2;})),ModelError,'incompatible version');
   const field=parent(value,path)[String(path.at(-1))];
   if(field!==null&&typeof field==='object')assert.throws(()=>decoder.parse(changed(value,path,(p,k)=>{p[k]=Object.assign(structuredClone(p[k]) as object,{unknown:true});})),ModelError,'nested unknown field');
  });
 }
 const primitives:readonly [string,d.Decoder<unknown>,readonly unknown[],readonly unknown[]][]=[
  ['uuid',d.uuid,[id(1),id(1).toUpperCase()],['x','00000000-0000-0000-0000-00000000000g',null]],
  ['digest',d.digest,[sha(1)],['sha256:'+'A'.repeat(64),'sha256:'+'0'.repeat(63),null]],
  ['text',d.text,['x','x'.repeat(2048),'中🙂'],['',' x','x ','a\n','\ud800','x'.repeat(2049),null]],
  ['body',d.body,['','中🙂','x'.repeat(1_048_576)],['\ud800','x'.repeat(1_048_577),undefined,1]],
  ['boolean',d.boolean,[true,false],['true',0,null]],['revision',d.revision,[0,1,Number.MAX_SAFE_INTEGER],[-0,-1,0.5,NaN,Infinity,'1',Number.MAX_SAFE_INTEGER+1]],
  ['positive',d.positive,[1,Number.MAX_SAFE_INTEGER],[0,-1,1.5,'1']],['version',d.version,[1],[0,2,'1',null]],
  ['timestamp',d.timestamp,[f.at,f.later],['2026-02-30T00:00:00.000Z','2026-10-07T00:00:00Z','2026-10-07T00:00:00.000+00:00',null]],
  ['literal',d.literal(false),[false],[true,'false',0]],['enumeration',d.enumeration('a','b'),['a','b'],['c',null,1]],
  ['nullable',d.nullable(d.uuid),[null,id(1)],[undefined,'']],['list',d.list(d.text,2,1),[['x'],['x','y']],[[],['x','y','z'],['x',undefined],new Array(1)]],
  ['refined',d.refined(d.revision,n=>n===0),[0],[1]],['tagged',d.tagged('status',{ok:d.object({status:d.literal('ok')})}),[{status:'ok'}],[{status:'bad'},{status:'ok',extra:1},{}]],
  ['object',d.object({id:d.uuid}),[{id:id(1)}],[{},{id:id(1),extra:1}]],
  ['CostCategory',s.CostCategorySchema,['model','service','tool','active-compute','reserved-compute','cold-start','retained-storage','network','embedding','reranking'],['computer','tokens']],
  ['ResourceCategory',ResourceCategorySchema,['service','active-compute','reserved-compute','cold-start','retained-storage','network'],['model','tool']]
 ];
 for(const [name,decoder,valid,invalid]of primitives)await t.test('primitive/'+name,()=>{assert.ok(valid.length&&invalid.length);for(const v of valid)assert.deepEqual(decoder.parse(v),v);for(const v of invalid)assert.throws(()=>decoder.parse(v),ModelError);});
 await t.test('arrays/descriptor-symbol-prototype-sparse-max',()=>{
  const decoder=d.list(d.text),valid=Array.from({length:256},()=> 'x');assert.equal(decoder.parse(valid).length,256);assert.throws(()=>decoder.parse([...valid,'x']),ModelError);
  for(const bad of [Object.assign(['x'],{extra:1}),Object.setPrototypeOf(['x'],null),Object.assign(['x'],{[Symbol('hidden')]:1})])assert.throws(()=>decoder.parse(bad),ModelError);
  const nullPrototype=d.object({id:d.uuid}).parse(Object.assign(Object.create(null),{id:id(1)}));assert.deepEqual(nullPrototype,{id:id(1)});frozen(nullPrototype);
  let reads=0;const accessor=['x'];Object.defineProperty(accessor,'0',{enumerable:true,get(){reads++;return 'x';}});assert.throws(()=>decoder.parse(accessor),ModelError);assert.equal(reads,0);
  let tagReads=0;const tag={};Object.defineProperty(tag,'status',{get(){tagReads++;return 'unknown';}});assert.throws(()=>s.OwnerObservationSchema.parse(tag),ModelError);assert.equal(tagReads,0);
  const cycle:unknown[]=[];cycle.push(cycle);assert.throws(()=>d.list(d.text).parse(cycle),ModelError);
 });
 const p=profileFixture();
 for(const path of paths(p).filter(path=>path.at(-1)!=='profileDigest'))await t.test('profile-digest-bound/'+path.join('.'),()=>{
  const v=parent(p,path)[String(path.at(-1))];
  const altered=changed(p,path,(parent,key)=>{parent[key]=typeof v==='string'?v+'x':typeof v==='number'?v+1:typeof v==='boolean'?!v:Array.isArray(v)?[...v,'unbound']:{...v as object,unbound:true};});
  assert.throws(()=>s.OperatingProfileSchema.parse(altered),ModelError);
 });
 const relationships:readonly Row[]=[
  ['profile/tool-dialect',s.OperatingProfileSchema,rehash({...p,toolPresentation:{...p.toolPresentation,dialect:'different'}})],
  ['profile/private-state',s.OperatingProfileSchema,rehash({...p,reasoningControls:{...p.reasoningControls,privateState:false}})],
  ['profile/input-duplicate',s.OperatingProfileSchema,rehash({...p,capabilities:{...p.capabilities,inputModalities:['text','text']}})],
  ['profile/output-duplicate',s.OperatingProfileSchema,rehash({...p,capabilities:{...p.capabilities,outputModalities:['text','text']}})],
  ['profile/required-optional',s.OperatingProfileSchema,rehash({...p,capabilities:{...p.capabilities,requiredOptionalFeatures:['unsupported']}})],
  ['qualification/time-equal',s.LocalQualificationSchema,{...qualificationFixture(),expiresAt:f.at}],
  ['qualification/time-reversed',s.LocalQualificationSchema,{...qualificationFixture(),expiresAt:'2026-10-06T00:00:00.000Z'}],
  ['qualification/duplicate-cases',s.LocalQualificationSchema,{...qualificationFixture(),executedCases:['same','same']}],
  ['qualification/empty-cases',s.LocalQualificationSchema,{...qualificationFixture(),executedCases:[]}],
  ['operation/attempts-ceiling',s.ModelOperationSchema,{...f.operation,retryCeiling:1,attemptsTaken:2}],
  ['operation/ceiling-four',s.ModelOperationSchema,{...f.operation,retryCeiling:4}],
  ['operation/count-four',s.ModelOperationSchema,{...f.operation,attemptsTaken:4}],
  ['operation/settled-no-receipt',s.ModelOperationSchema,{...f.operation,status:'settled'}],
  ['operation/pending-receipt',s.ModelOperationSchema,{...f.operation,knownReceiptId:id(18)}],
  ['attempt/prepared-claim',s.ModelAttemptSchema,{...f.attempt,claimId:id(81)}],
  ...(['accepted','unknown','settled'] as const).map(status=>['attempt/'+status+'-no-claim',s.ModelAttemptSchema,{...f.attempt,status}] as const),
  ['attempt/claimed-no-claim',s.ModelAttemptSchema,{...f.attempt,status:'claimed'}],
  ['attempt/ordinal-four',s.ModelAttemptSchema,{...f.attempt,ordinal:4}],
  ['receipt/total',s.UsageReceiptSchema,{...receiptFixture(),measuredUnits:13}],
  ['receipt/answer-no-digest',s.UsageReceiptSchema,{...receiptFixture(),outputDigest:null}],
  ['receipt/failure-answer-digest',s.UsageReceiptSchema,{...receiptFixture(),outcome:'known-failure'}],
  ['receipt/cancelled-answer-digest',s.UsageReceiptSchema,{...receiptFixture(),outcome:'cancelled'}],
  ['receipt/component-overflow',s.UsageReceiptSchema,{...receiptFixture(),components:{...receiptFixture().components,model:Number.MAX_SAFE_INTEGER}}],
  ['observation/unknown-receipt',s.OwnerObservationSchema,{status:'unknown',original:f.original,receipt:receiptFixture()}],
  ['observation/accepted-seal',s.OwnerObservationSchema,{status:'accepted',original:f.original,proofId:id(39)}],
  ['wait/update-before-since',s.WaitSchema,{...f.wait,updatedAt:'2026-10-06T00:00:00.000Z'}],
  ['wait/expiry-at-update',s.WaitSchema,{...f.wait,expiresAt:f.at}],
  ['wait/expiry-before-update',s.WaitSchema,{...f.wait,expiresAt:'2026-10-06T00:00:00.000Z'}],
  ['wait/replay-true',s.WaitSchema,{...f.wait,replayAllowed:true}],
  ['resource/equal-interval',s.ResourceChargeSchema,{...f.resource,start:5}],['resource/reversed-interval',s.ResourceChargeSchema,{...f.resource,start:6}],
  ['resource/product-mismatch',s.ResourceChargeSchema,{...f.resource,measuredUnits:11}],
  ['resource/product-overflow',s.ResourceChargeSchema,{...f.resource,end:Number.MAX_SAFE_INTEGER,rateUnits:2}],
  ['resource/task-reference-allocation',s.ResourceChargeSchema,{...f.resource,allocation:'allocated-task-cost'}],
  ['admission/service-computer-capability',AdmissionSchema,{...f.admission,computerCapability:'simulated-computer'}],
  ['admission/service-resource',AdmissionSchema,{...f.admission,resourceId:id(36)}],
  ['admission/computer-without-capability',AdmissionSchema,{...f.admission,executionClass:'computer'}]
 ];
 for(const key of ['profileId','profileVersion','profileDigest','capabilitiesDigest','deployment','environmentDigest'] as const){
  const old=qualificationFixture()[key];const value=key==='profileId'?id(99):key==='profileVersion'?2:key==='deployment'?'changed':sha(99);
  await t.test('qualification/binding/'+key,()=>{assert.notEqual(old,value);assert.throws(()=>s.QualifiedProfileSchema.parse({profile:p,qualification:{...qualificationFixture(),[key]:value}}),ModelError);});
 }
 for(const key of ['tenantId','spaceId','policyRevision','membershipRevision'] as const)await t.test('capsule/binding/'+key,()=>{
  assert.throws(()=>s.TaskCapsuleSchema.parse({...f.capsule,binding:{...f.binding,[key]:key.endsWith('Id')?id(99):1}}),ModelError);
 });
 for(const e of f.modelEvents){if('original'in e.payload)for(const key of ['tenantId','spaceId','operationId','attemptId'] as const)await t.test('event/original/'+e.kind+'/'+key,()=>{assert.throws(()=>s.ModelEventSchema.parse({...e,[key]:id(99)}),ModelError);});}
 for(const key of ['taskId','runId'])await t.test('event/wait/'+key,()=>{assert.throws(()=>s.ModelEventSchema.parse({...f.eventBase,kind:'budget-wait',payload:{...f.wait,[key]:id(99)}}),ModelError);});
 for(const [name,decoder,value]of relationships)await t.test('malformed-relationship/'+name,()=>assert.throws(()=>decoder.parse(value),ModelError));
 await t.test('qualification/decoded-profile-cannot-self-qualify-or-swap-lock-check',()=>{
  let pinReads=0;const registry=new QualificationRegistry(async()=>{pinReads++;return f.pins;},()=>f.at);
  for(const q of [qualificationFixture(),{...qualificationFixture(),dependencyLockDigest:sha(99)},{...qualificationFixture(),checkDefinitionDigest:sha(99)}])assert.throws(()=>registry.assertCurrent(p,q,f.pins,f.at),e=>e instanceof ModelError&&e.code==='QUALIFICATION_MISMATCH');
  assert.equal(pinReads,0);assert.throws(()=>registry.revoke(id(10)),ModelError);
 });
 await t.test('request/exact-encoded-roundtrip-and-all-bound-digests',()=>{
  assert.equal(request.original.requestDigest,requestDigestOf(request));assert.deepEqual(s.EncodedRequestSchema.parse(JSON.parse(JSON.stringify(request))),request);
  for(const [key,value]of Object.entries(request)){if(key==='original')continue;const altered={...request,[key]:typeof value==='number'?value+1:typeof value==='string'?value+'x':value};assert.notEqual(requestDigestOf(altered),request.original.requestDigest,key);}
  for(const key of ['tenantId','spaceId','operationId','attemptId','reservationId'] as const)assert.notEqual(requestDigestOf({...request,original:{...request.original,[key]:id(99)}}),request.original.requestDigest,key);
 });
});

test('C02 / exact synthetic arithmetic bounded ancestry and single Space allocation',async t=>{
 for(const n of [0,1,Number.MAX_SAFE_INTEGER])await t.test('units/valid/'+n,()=>assert.equal(a.units(n),n));
 const invalid:readonly [string,unknown][]=[['negative-zero',-0],['negative',-1],['fraction',0.5],['NaN',NaN],['infinity',Infinity],['negative-infinity',-Infinity],['string','1'],['unsafe',Number.MAX_SAFE_INTEGER+1],['null',null],['undefined',undefined],['bigint',1n],['boolean',true]];
 for(const [name,value]of invalid)await t.test('numeric/refuse/'+name,()=>{
  assert.throws(()=>a.units(value),ModelError);assert.throws(()=>a.positiveUnits(value),ModelError);
  for(const decoder of [d.revision,d.positive])assert.throws(()=>decoder.parse(value),ModelError);
  const n=value as number;
  for(const values of [[n,0],[0,n]] as const){assert.throws(()=>a.safeAdd(...values),ModelError);assert.throws(()=>a.safeMultiply(values[0],values[1]),ModelError);assert.throws(()=>a.safeSubtract(values[0],values[1]),ModelError);}
  assert.throws(()=>s.TaskCallBindingSchema.parse({...f.binding,requirementsRevision:value}),ModelError);
  assert.throws(()=>s.UsageReceiptSchema.parse({...receiptFixture(),measuredUnits:value}),ModelError);
  assert.throws(()=>ResourceReceiptSchema.parse({...f.resourceReceipt,assignmentGeneration:value}),ModelError);
  assert.throws(()=>decodeCategories({model:value}),ModelError);
 });
 await t.test('arithmetic/safe-max-empty-zero-exact-overflow',()=>{
  const max=Number.MAX_SAFE_INTEGER;
  assert.equal(a.safeAdd(),0);assert.equal(a.safeAdd(max,0),max);assert.equal(a.safeAdd(max-1,1),max);
  assert.equal(a.safeMultiply(max,1),max);assert.equal(a.safeMultiply(max,0),0);assert.equal(a.safeMultiply(0,max),0);
  assert.equal(a.safeSubtract(max,max),0);assert.equal(a.safeSubtract(max,0),max);
  assert.equal(a.reserveEstimate('',max-2),max);
  for(const calculate of [()=>a.safeAdd(max,1),()=>a.safeMultiply(max,2),()=>a.safeMultiply(2,max),()=>a.reserveEstimate('',max),()=>a.safeSubtract(0,1)])assert.throws(calculate,ModelError);
  assert.throws(()=>a.safeAdd(max,1),e=>e instanceof ModelError&&e.code==='NUMERIC_OVERFLOW');
  assert.throws(()=>a.safeMultiply(max,2),e=>e instanceof ModelError&&e.code==='NUMERIC_OVERFLOW');
 });
 const utf8:readonly [string,string,number][]=[['empty','',0],['ascii','x',1],['multibyte','中🙂',7],['combining','e\u0301',3],['embedded-NUL','\0',1],['exact-byte-limit','中'.repeat(349525)+'x',1_048_576]];
 for(const [name,value,bytes]of utf8)await t.test('utf8/'+name,()=>{assert.equal(a.encodedBytes(value),bytes);assert.equal(d.body.parse(value),value);assert.equal(a.reserveEstimate(value,1),bytes+3);assert.deepEqual(a.measuredCost(value,''),{service:2,model:bytes,total:bytes+2});});
 for(const [name,value]of [['byte-limit-plus-one','中'.repeat(349525)+'xy'],['lone-high-surrogate','\ud800'],['lone-low-surrogate','\udfff'],['nonstring',1]] as const)await t.test('utf8/refuse/'+name,()=>{assert.throws(()=>a.encodedBytes(value),ModelError);assert.throws(()=>d.body.parse(value),ModelError);});
 await t.test('pricing/validated-units-cap0-exact-plus1-transport-bytes',()=>{
  assert.equal(a.reserveEstimate('12345678',30),40);assert.deepEqual(a.measuredCost('中','🙂'),{service:2,model:7,total:9});
  assert.throws(()=>a.reserveEstimate('',0),ModelError);
  const bytes=Buffer.byteLength(request.payload,'utf8');assert.equal(a.reserveEstimate(request.payload,request.outputCap),2+bytes+request.outputCap);
  assert.ok(bytes>7,'closed local JSON overhead is included');assert.equal(a.UNIT,'synthetic-utf8-byte-unit');assert.equal(a.PRICING_VERSION,'synthetic-bytes-v1');
  const p=profileFixture();assert.ok(supports(p,ProfileNeedSchema.parse({...f.need,contextBytes:p.capabilities.contextLimit,outputCap:1_048_576,durationCapMs:30_000})));
  for(const [key,value]of [['contextBytes',p.capabilities.contextLimit+1],['outputCap',1_048_577],['durationCapMs',30_001]] as const)assert.equal(supports(p,ProfileNeedSchema.parse({...f.need,[key]:value})),false,key);
  for(const key of ['contextBytes','outputCap','durationCapMs'])assert.throws(()=>ProfileNeedSchema.parse({...f.need,[key]:0}),ModelError,key);
  assert.equal(s.EncodedRequestSchema.parse({...request,outputCap:1}).outputCap,1);assert.throws(()=>s.EncodedRequestSchema.parse({...request,outputCap:0}),ModelError);
 });
 await t.test('categories/safe-closed-total-accessor-and-overflow',()=>{
  const parsed=decodeCategories({model:0,service:1,tool:2});assert.deepEqual(parsed,{model:0,service:1,tool:2});frozen(parsed);
  for(const v of [{},{model:0},{unknown:1},{model:Number.MAX_SAFE_INTEGER,service:1},{model:1,[Symbol('hidden')]:1}])assert.throws(()=>decodeCategories(v),ModelError);
  let reads=0;assert.throws(()=>decodeCategories(Object.defineProperty({},'model',{get(){reads++;return 1;}})),ModelError);assert.equal(reads,0);
 });
 function chain(length:number):readonly TaskCallBinding[]{return Array.from({length},(_,i)=>s.TaskCallBindingSchema.parse({...f.binding,taskId:id(1000+i),parentTaskId:i+1<length?id(1001+i):null}));}
 function walk(records:readonly TaskCallBinding[]):readonly string[]{
  const root=records[0]!;const visited=new Set([root.taskId]);let next=root.parentTaskId;
  while(next!==null){const row=records.find(r=>r.taskId===next);assert.ok(row,'fixture includes requested ancestor');const b=assertBillingAncestor(root,row,next,visited);visited.add(b.taskId);next=b.parentTaskId;}
  return [...visited];
 }
 for(const size of [1,64])await t.test('ancestry/valid-depth-'+size,()=>{const rows=chain(size),before=canonicalDigest(rows);assert.equal(walk(rows).length,size);assert.equal(canonicalDigest(rows),before);});
 const c=chain(2);
 const ancestryNegatives:readonly [string,readonly TaskCallBinding[]][]=[
  ['depth-65',chain(65)],['self-cycle',[{...c[0]!,parentTaskId:c[0]!.taskId}]],
  ['two-node-cycle',[c[0]!,{...c[1]!,parentTaskId:c[0]!.taskId}]],
  ['foreign-payer',[c[0]!,{...c[1]!,payerId:id(99)}]],['foreign-Space',[c[0]!,{...c[1]!,spaceId:id(99)}]],['foreign-tenant',[c[0]!,{...c[1]!,tenantId:id(99)}]]
 ];
 for(const [name,rows]of ancestryNegatives)await t.test('ancestry/refuse-'+name,()=>{const before=canonicalDigest(rows);assert.throws(()=>walk(rows),ModelError);assert.equal(canonicalDigest(rows),before);});
 await t.test('ancestry/wrong-parent-id-and-unsafe-revision',()=>{
  assert.throws(()=>assertBillingAncestor(c[0]!,c[1]!,id(99),new Set([c[0]!.taskId])),ModelError);
  assert.throws(()=>assertBillingAncestor(c[0]!,{...c[1]!,policyRevision:Number.MAX_SAFE_INTEGER+1},c[1]!.taskId,new Set([c[0]!.taskId])),ModelError);
 });
 const viewInput={resourceId:f.resource.resourceId,assignmentGeneration:0,payerId:f.binding.payerId,costCenter:f.binding.costCenter,purpose:'maintenance',allowanceId:id(40),runId:null,modelCategoryTotals:null,modelLiability:null,lifecycle:[]};
 const shared={...f.resourceReceipt,receiptId:id(90),end:5,rateUnits:2},taskA={...f.resourceReceipt,receiptId:id(91),category:'cold-start' as const,start:5,end:6,rateUnits:3,originRunId:f.binding.runId},taskB={...f.resourceReceipt,receiptId:id(92),category:'service' as const,start:6,end:7,rateUnits:4,originRunId:id(93)};
 await t.test('allocation/two-tasks-references-single-Space-economic-equality',()=>{
  const intervals=[shared,taskA,taskB].map(receipt=>({receipt,settled:true}));
  const space=resourceCostView({...viewInput,intervals}),a=resourceCostView({...viewInput,intervals,runId:f.binding.runId}),b=resourceCostView({...viewInput,intervals,runId:id(93)});
  assert.equal(space.costs.spaceActual,17);assert.equal(space.costs.sharedActual,10);assert.equal(a.costs.allocatedTaskActual,3);assert.equal(b.costs.allocatedTaskActual,4);
  assert.equal(a.costs.allocatedTaskActual+b.costs.allocatedTaskActual+space.costs.sharedActual,space.costs.spaceActual);
  assert.equal(a.charges[0]?.chargeId,b.charges[0]?.chargeId);assert.equal(a.charges[0]?.allocation,'unallocated-shared-cost');
  assert.equal(a.charges.reduce((sum,r)=>sum+r.amount,0)+b.charges.reduce((sum,r)=>sum+r.amount,0),27,'task references are deliberately not economic allocations');
  assert.equal(Object.values(space.costs.categories).reduce((sum,n)=>sum+n,0),space.costs.spaceActual);
 });
 await t.test('allocation/pending-empty-safe-max-and-malformed-overflow',()=>{
  assert.equal(resourceCostView({...viewInput,intervals:[]}).costs.spaceActual,0);
  const pending=resourceCostView({...viewInput,intervals:[{receipt:shared,settled:false}]});assert.equal(pending.costs.reserved,10);assert.equal(pending.costs.spaceActual,0);assert.equal(pending.costs.sharedActual,0);
  const max={...f.resourceReceipt,end:Number.MAX_SAFE_INTEGER,rateUnits:1};assert.equal(resourceUnits(ResourceReceiptSchema.parse(max)),Number.MAX_SAFE_INTEGER);
  assert.equal(resourceCostView({...viewInput,intervals:[{receipt:max,settled:true}]}).costs.spaceActual,Number.MAX_SAFE_INTEGER);
  for(const invalid of [{...max,rateUnits:2},{...max,start:1.5},{...max,rateUnits:-1},{...max,end:0},{...max,rateVersion:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>resourceCostView({...viewInput,intervals:[{receipt:invalid,settled:true}]}),ModelError);
  assert.throws(()=>resourceCostView({...viewInput,intervals:[{receipt:max,settled:true},{receipt:taskA,settled:true}]}),ModelError);
 });
});

test('C03 / hostile capsule facts native outcome distinctions and authority-free projections',async t=>{
 await t.test('native/reducer-and-loop-are-unchanged-direct-identities',()=>{
  assert.equal(native.reduceSession,unchanged.reduceSession);assert.equal(native.replaySession,unchanged.replaySession);assert.equal(native.initialSession,unchanged.initialSession);assert.equal(native.SessionLoop,unchanged.SessionLoop);
 });
 await t.test('capsule/hostile-roundtrip-preserves-all-unresolved-typed-facts',()=>{
  const c=s.TaskCapsuleSchema.parse(JSON.parse(JSON.stringify(f.capsule)));
  const facts=capsuleFactsOf(c);assert.deepEqual(facts,f.facts);
  assert.equal(facts.evidence[0]?.content,f.source.content);assert.equal(facts.evidence[0]?.trust,'untrusted-observation');assert.equal(facts.evidence[0]?.provenance,'test-tool-observation');assert.equal(facts.evidence[0]?.observedAt,f.at);assert.deepEqual(facts.evidence[0]?.scope,f.source.scope);
  assert.deepEqual(facts.hypotheses,['unproved cause']);assert.deepEqual(facts.uncertainty,['usage unknown']);assert.deepEqual(facts.failedPlans,['failed plan retained']);assert.deepEqual(facts.pendingOperations,[f.original.operationId]);assert.deepEqual(facts.artifacts,f.facts.artifacts);assert.equal(facts.checks[0]?.status,'unknown');assert.equal(facts.nextSafeAction,'reconcile original owner');
  assert.equal(c.binding.intent,'Ask');assert.equal(c.binding.category,'model');assert.equal(c.manifest.sources[0]?.kind,'evidence');assert.equal(c.manifest.crossThreadRecall,false);
  for(const grant of ['grants','approval','allowance','privateState','instructions','completedCheck'])assert.throws(()=>s.TaskCapsuleSchema.parse({...c,[grant]:f.source.content}),ModelError,grant);
  frozen(c);assert.ok(!('grants'in facts)&&!('approval'in facts)&&!('allowance'in facts));
 });
 await t.test('authority/capsule-projection-and-JSON-token-cannot-mint-scope-or-target-permit',async()=>{
  let boundaryCalls=0;const forbidden=async()=>{boundaryCalls++;throw new Error('forged token reached installed port');};
  const compiler=new AuthorizedContextCompiler({withScope:forbidden},{current:forbidden,retrieve:forbidden},{authorize:forbidden});
  const validator=new ProposalValidator(new LocalAdapterClient('http://127.0.0.1:9',id(80),id(17)),compiler,{handoff:forbidden});
  const shape={tenantId:f.binding.tenantId,spaceId:f.binding.spaceId,actorId:f.binding.actorId,payerId:f.binding.payerId,grants:['task:read','task:write','computer:use'],authorityRevision:0,membershipRevision:0};
  assert.throws(()=>native.assertVerifiedScope(shape),FoundationError);
  for(const fake of [{},f.capsule,{...f.capsule,approval:true,grants:shape.grants,completed:true}])for(const target of ['local-test-effect','computer','publish'])await assert.rejects(()=>validator.handoff(shape as unknown as native.VerifiedScope,fake as ValidatedProposal,target),ModelError);
  assert.equal(boundaryCalls,0,'no retrieval, owner lookup, effect, budget or approval port runs');
 });
 const pending={operationId:f.original.operationId,reservationId:f.original.reservationId};
 const queued=f.snapshot().origin;
 function runningLoop(authorize:unchanged.SessionPorts['authorize']=()=>{},model:unchanged.SessionPorts['model']=async()=> 'answer',resolution?:unchanged.SessionPorts['modelResolution']){
  let modelCalls=0,effectCalls=0;const loop=new native.SessionLoop(queued,{clock:{now:()=>0},authorize,modelOperation:()=>pending,model:async(input)=>{modelCalls++;return model(input);},execute:async()=>{effectCalls++;return 'committed';},...(resolution?{modelResolution:resolution}:{})});
  loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});return {loop,counts:()=>({modelCalls,effectCalls})};
 }
 await t.test('outcome/inflight-accepted-blocks-early-resolution-and-continuation',async()=>{
  let release!:(v:string)=>void;const gate=new Promise<string>(resolve=>{release=resolve;});
  const {loop,counts}=runningLoop(()=>{},()=>gate,async()=>({...pending,status:'completed',receiptId:id(18)}));
  const invocation=loop.callModel('start');assert.deepEqual(loop.inspect().pendingModel,pending);assert.equal(loop.nextAction(),'reconcile');
  await assert.rejects(()=>loop.callModel('second'),DomainError);await assert.rejects(()=>loop.dispatchEffect('effect'),DomainError);await assert.rejects(()=>loop.resolveModel(pending.operationId),DomainError);
  assert.deepEqual(counts(),{modelCalls:1,effectCalls:0});release('settled answer');assert.equal(await invocation,'settled answer');assert.equal(loop.inspect().pendingModel,null);assert.deepEqual(loop.inspect().modelResponses,['settled answer']);
  assert.equal(loop.events().filter(e=>e.kind==='model-resolved')[0]?.payload['receiptId'],id(18));
 });
 for(const status of ['safely-failed','unknown','completed'] as const)await t.test('outcome/owner-'+status+'-distinct',async()=>{
  const resolution={...pending,status,receiptId:status==='completed'?id(18):null};
  const {loop,counts}=runningLoop(()=>{},async()=>{throw new Error('accepted transport lost');},async()=>resolution);
  await assert.rejects(()=>loop.callModel('one'),/accepted transport lost/);
  const state=loop.inspect();assert.deepEqual(counts(),{modelCalls:1,effectCalls:0});assert.equal(state.modelResponses.length,0);
  assert.equal(state.pendingModel!==null,status==='unknown');
  const resolved=loop.events().find(e=>e.kind==='model-resolved');assert.equal(resolved?.payload['status'],status==='unknown'?undefined:status);assert.equal(resolved?.payload['receiptId'],status==='unknown'?undefined:resolution.receiptId);
  assert.equal(loop.nextAction(),status==='unknown'?'reconcile':'iterate');
  if(status==='unknown'){await assert.rejects(()=>loop.dispatchEffect('effect'),DomainError);await assert.rejects(()=>loop.callModel('another'),DomainError);}
  const before=counts(),replayed=native.replaySession(queued,loop.events());assert.deepEqual(replayed,state);assert.deepEqual(counts(),before,'pure replay has no ports');
 });
 await t.test('outcome/text-is-not-settlement-and-forged-errors-not-unknown-proof',async()=>{
  const {loop}=runningLoop(()=>{},async()=> 'model says complete',async()=>({...pending,status:'unknown',receiptId:null}));
  await assert.rejects(()=>loop.callModel('input'),DomainError);assert.equal(loop.inspect().modelResponses.length,0);assert.ok(loop.inspect().pendingModel);
  assert.equal(safeFailure(new FoundationError('UNKNOWN_COMMIT')).status,'unknown');assert.equal(safeFailure({code:'UNKNOWN_COMMIT'}).status,'refused');
  const decoded=[{status:'sealed-not-accepted',original:f.original,ownerId:id(17),proofId:id(39),dispatchEpoch:1},{status:'accepted',original:f.original},{status:'unknown',original:f.original},{status:'settled',receipt:receiptFixture()}].map(v=>s.OwnerObservationSchema.parse(v));
  assert.deepEqual(decoded.map(v=>v.status),['sealed-not-accepted','accepted','unknown','settled']);
  for(const outcome of ['known-failure','cancelled'] as const){const receipt=s.UsageReceiptSchema.parse({...receiptFixture(),outcome,outputDigest:null});assert.equal(receipt.measuredUnits,12);assert.equal(receipt.components.service,2);assert.equal(receipt.components.model,10);assert.equal(receipt.outputDigest,null,'charged failure has no answer');}
 });
 const envelope:TaskEnvelope={schemaVersion:1,scope:f.source.scope,taskId:f.binding.taskId,requirementsRevision:0,intent:'ask',executionClass:'conversation',effectCeiling:['read','model'],sources:[],targets:[],payerId:f.binding.payerId,allowanceId:id(40),ceilingUnits:40,continuation:'never',requiredChecks:[],versions:queued.versions,groupTrigger:false};
 for(const intent of ['ask','plan','act'] as const)await t.test('classification/admitted-'+intent+'-conversation-service',()=>{
  const admitted=parseTaskEnvelope({...envelope,intent});assert.equal(admitted.executionClass,'conversation');
  const snapshot={...f.snapshot(),binding:{...f.binding,intent:intent==='ask'?'Ask' as const:intent==='plan'?'Plan' as const:'Act' as const}};
  assert.equal(nativeView(snapshot,{reserved:0,actual:0,pendingExposure:0}).computer.executionClass,'service');
  for(const effect of ['computer','target'] as const)assert.throws(()=>assertContinuationAllowed(snapshot,effect),ModelError);
 });
 for(const executionClass of ['computer','external-effect'] as const)await t.test('classification/admitted-act-'+executionClass+'-requires-exact-target',()=>{
  const admitted=parseTaskEnvelope({...envelope,intent:'act',executionClass,effectCeiling:['write','computer'],targets:[{resourceId:f.resource.resourceId,scope:f.source.scope,kind:'local-test-effect'}]});
  assert.equal(admitted.executionClass,executionClass);assert.equal(admitted.targets[0]?.resourceId,f.resource.resourceId);
  assert.throws(()=>parseTaskEnvelope({...admitted,targets:[]}),DomainError);
  for(const intent of ['ask','plan'])assert.throws(()=>parseTaskEnvelope({...admitted,intent}),DomainError);
 });
 await t.test('classification/real-native-predicate-computer-target-and-child-boundaries',()=>{
  const act={...f.snapshot(),binding:{...f.binding,intent:'Act' as const}};
  assert.doesNotThrow(()=>assertContinuationAllowed(act,'child'));
  const computer={...act,admission:AdmissionSchema.parse({...f.admission,executionClass:'computer',computerCapability:'simulated-computer',resourceId:f.resource.resourceId})};
  assert.doesNotThrow(()=>assertContinuationAllowed(computer,'computer'));assert.throws(()=>assertContinuationAllowed(computer,'target'),ModelError);
  const target={...act,admission:AdmissionSchema.parse({...f.admission,executionClass:'target',targetEffect:true})};assert.doesNotThrow(()=>assertContinuationAllowed(target,'target'));assert.throws(()=>assertContinuationAllowed(target,'computer'),ModelError);
  for(const intent of ['Ask','Plan'] as const)for(const effect of ['child','computer','target'] as const)assert.throws(()=>assertContinuationAllowed({...computer,binding:{...computer.binding,intent}},effect),ModelError);
  for(const effect of ['child','computer','target'] as const)assert.throws(()=>assertContinuationAllowed({...computer,control:{...computer.control,wait:f.wait}},effect),ModelError);
 });
 await t.test('classification/computer-names-and-fabricated-projections-cannot-authorize',async()=>{
  const original=f.snapshot(),view=nativeView(original,{reserved:0,actual:0,pendingExposure:0});
  const fabricated={...view,state:'running',computer:{executionClass:'computer'},grants:['computer:use'],approval:true,allowance:9999};
  assert.throws(()=>AdmissionSchema.parse(fabricated),ModelError);assert.throws(()=>s.TaskCallBindingSchema.parse(fabricated),ModelError);assert.throws(()=>parseTaskEnvelope({...envelope,model:'computer',tool:'computer'}),DomainError);
  for(const name of ['computer','shell','publish','model-complete','grant-added','allowance-changed','usage-settled','resource-charge-recorded'])assert.throws(()=>native.reduceSession(native.initialSession(queued),f.nativeEvent(1,name,{completed:true,grants:['computer:use'],approval:true})),DomainError,name);
  let allowed=true;const auth:unchanged.SessionPorts['authorize']=(_run,effect)=>{if(!allowed&&effect!=='read')throw new DomainError('UNAUTHORIZED');};
  const {loop,counts}=runningLoop(auth);loop.claimCompletion(true);assert.equal(loop.inspect().modelClaimsCompleted,true);assert.equal(loop.inspect().run.state,'running');
  allowed=false;await assert.rejects(()=>loop.callModel('computer'),DomainError);await assert.rejects(()=>loop.dispatchEffect('computer'),DomainError);assert.deepEqual(counts(),{modelCalls:0,effectCalls:0});
  assert.equal(original.admission.executionClass,'service');assert.equal(original.binding.intent,'Ask');assert.equal(view.replayAllowed,false);
 });
 await t.test('native/history-pending-unknown-safe-and-settled-invalid-relationships',()=>{
  const pendingEvent=f.nativeEvent(1,'model-pending',{operation:pending}),state=native.reduceSession(native.initialSession(queued),pendingEvent);
  for(const bad of [f.nativeEvent(2,'model-resolved',{operation:pending,status:'unknown',receiptId:null,proof:'owner'}),f.nativeEvent(2,'model-resolved',{operation:pending,status:'completed',receiptId:null,proof:'owner'}),f.nativeEvent(2,'model-resolved',{operation:pending,status:'safely-failed',receiptId:null,proof:'response'}),f.nativeEvent(2,'model-resolved',{operation:{...pending,operationId:id(99)},status:'completed',receiptId:id(18),proof:'owner'})])assert.throws(()=>native.reduceSession(state,bad),DomainError);
  assert.ok(state.pendingModel);
  for(const status of ['safely-failed','completed'] as const){const resolved=native.reduceSession(state,f.nativeEvent(2,'model-resolved',{operation:pending,status,receiptId:status==='completed'?id(18):null,proof:'owner'}));assert.equal(resolved.pendingModel,null);assert.equal(resolved.modelResponses.length,0);}
  const snapshot={...f.snapshot(),binding:{...f.binding,intent:'Act' as const},admission:AdmissionSchema.parse({...f.admission,executionClass:'computer',computerCapability:'simulated-computer',resourceId:f.resource.resourceId}),events:[pendingEvent]};
  for(const effect of ['child','computer','target'] as const)assert.throws(()=>assertContinuationAllowed(snapshot,effect),ModelError);
  const effectPending=f.nativeEvent(1,'effect-pending',{operationId:id(94)});
  assert.throws(()=>assertContinuationAllowed({...snapshot,events:[effectPending]},'computer'),ModelError);
  assert.throws(()=>native.reduceSession(native.initialSession(queued),{...pendingEvent,scope:{...f.source.scope,spaceId:id(99)}}),DomainError);
  assert.throws(()=>native.reduceSession(state,pendingEvent),DomainError);assert.throws(()=>native.reduceSession(state,{...pendingEvent,sequence:3}),DomainError);
 });
 await t.test('native/service-and-ungranted-computer-preflight-execute-zero-SQL',async()=>{
  let queries=0;const tx={query:async()=>{queries++;throw new Error('unadmitted SQL');}};
  const scope={tenantId:f.binding.tenantId,spaceId:f.binding.spaceId,grants:[]} as unknown as native.VerifiedScope;
  const computer=new NativeComputer();assert.equal(await computer.admit(tx,scope,f.snapshot()),null);
  const s={...f.snapshot(),binding:{...f.binding,intent:'Act' as const},admission:AdmissionSchema.parse({...f.admission,executionClass:'computer',computerCapability:'simulated-computer',resourceId:f.resource.resourceId})};
  assert.equal(await computer.admit(tx,scope,s),'permission');assert.equal(await computer.admit(tx,{...scope,grants:['computer:use']},{...s,binding:f.binding}),'permission');
  assert.equal(await computer.admit(tx,{...scope,grants:['computer:use']},{...s,admission:{...s.admission,resourceId:null}}),'resource');assert.equal(queries,0);
 });
});
