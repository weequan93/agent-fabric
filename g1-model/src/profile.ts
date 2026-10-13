import { canonicalDigest } from './native-imports.js';
import type { OperatingProfile, LocalQualification, VersionPins, ModelAdapterPort, OriginalCall } from './contracts.js';
import { OperatingProfileSchema, VersionPinsSchema, OwnerObservationSchema, OriginalCallSchema } from './schema.js';
import { boolean, enumeration, list, nullable, object, positive, text, uuid, version } from './decoder.js';
import { demand, ModelError } from './errors.js';
import type { QualificationRegistry } from './qualification.js';

export const ProfileNeedSchema = object({
 schemaVersion: version, inputModalities: list(enumeration('text','image','audio'),3,1),
 outputModalities: list(enumeration('text','image','audio'),3,1), toolDialect:text, schemaDialect:text,
 streamText:boolean, streamToolArguments:boolean, contextBytes:positive, outputCap:positive, durationCapMs:positive,
 usage:boolean, cancellation:boolean, privateState:boolean, optionalFeatures:list(text),
 executionClass:enumeration('service','computer'), runtimeCapabilities:list(text)
});
export type ProfileNeed = ReturnType<typeof ProfileNeedSchema.parse>;
export const ProfileChoiceSchema = object({schemaVersion:version, pin:nullable(uuid), preference:enumeration('Fast','Balanced','Thorough'), allowEquivalentFallback:boolean});
export type ProfileChoice = ReturnType<typeof ProfileChoiceSchema.parse>;
export const AUTO_CHOICE: ProfileChoice = ProfileChoiceSchema.parse({schemaVersion:1,pin:null,preference:'Balanced',allowEquivalentFallback:false});
export const ApprovalRulesSchema = object({schemaVersion:version, providers:list(text),routes:list(text),regions:list(text),dataPolicies:list(text),runtimeProfiles:list(text)});
type ApprovalRules = ReturnType<typeof ApprovalRulesSchema.parse>;
declare const failureBrand:unique symbol;
export interface SafeFallbackEvidence {readonly [failureBrand]:true}
const safeFailures=new WeakMap<object,{readonly profileDigest:string;readonly original:OriginalCall}>();
/** Only an installed original receipt-owner channel can create safe evidence.
 * No caller receipt/observation import endpoint. Native retry allowance remains
 * the admission owner's responsibility after this eligibility diagnostic. */
export class OwnerFailureVerifier {
 constructor(private readonly owner:ModelAdapterPort,private readonly ownerId:string,private readonly profileDigest:string){uuid.parse(ownerId);}
 async resolve(original:OriginalCall):Promise<SafeFallbackEvidence>{
  const o=OriginalCallSchema.parse(original),observation=OwnerObservationSchema.parse(await this.owner.lookup(o));
  const observed=observation.status==='settled'?observation.receipt.original:observation.original;
  demand(canonicalDigest(observed)===canonicalDigest(o),'CHECK_BINDING_MISMATCH');
  const safe=observation.status==='sealed-not-accepted'&&observation.ownerId===this.ownerId
   ||observation.status==='settled'&&observation.receipt.ownerId===this.ownerId&&observation.receipt.outcome!=='answer';
  demand(safe,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');const evidence=Object.freeze({}) as SafeFallbackEvidence;
  safeFailures.set(evidence,{profileDigest:this.profileDigest,original:o});return evidence;
 }
}
export interface InstalledProfile {readonly profile:OperatingProfile;readonly qualification:LocalQualification;readonly organizationApproved:boolean;readonly available:boolean}
export type ModelSelection =
 | {readonly status:'selected';readonly profile:OperatingProfile;readonly qualification:LocalQualification;readonly choiceLabel:string;readonly modality:readonly string[];readonly dataPolicy:string;readonly estimatedCostClass:string;readonly fallbackReason:string|null}
 | {readonly status:'waiting';readonly reason:'model-unavailable';readonly refusal:string;readonly choiceLabel:string;readonly allowedNextActions:readonly ['switch-profile','contact-administrator'];readonly dispatchAllowed:false};

export function supports(profile:OperatingProfile,need:ProfileNeed):boolean {
 const c=profile.capabilities;
 return need.inputModalities.every(m=>c.inputModalities.includes(m)) && need.outputModalities.every(m=>c.outputModalities.includes(m))
  && need.toolDialect===c.toolDialect && need.schemaDialect===c.schemaDialect
  && (!need.streamText||c.streaming.text) && (!need.streamToolArguments||c.streaming.toolArguments)
  && need.contextBytes<=c.contextLimit && c.caps.output && c.caps.duration
  && (!need.usage||c.usageReporting!=='unknown') && (!need.cancellation||(c.cancellation.request&&c.cancellation.lookup))
  && (!need.privateState||c.caching.providerPrivateState) && need.optionalFeatures.every(f=>c.optionalFeatures.includes(f))
  && need.executionClass===profile.runtimeRequirements.executionClass
  && need.runtimeCapabilities.every(f=>profile.runtimeRequirements.capabilities.includes(f))
  && need.outputCap<=1_048_576 && need.durationCapMs<=30_000;
}
/** Equivalence excludes deployment/route/cost/capacity. Semantics and residency stay exact. */
export function equivalent(a:OperatingProfile,b:OperatingProfile):boolean {
 const semantic=(p:OperatingProfile)=>({provider:p.provider,model:p.model,modelVersion:p.modelVersion,region:p.region,dataPolicy:p.dataPolicy,
  instructionPackDigest:p.instructionPackDigest,toolPresentation:p.toolPresentation,contextPolicyDigest:p.contextPolicyDigest,
  reasoningControls:p.reasoningControls,verifier:p.verifier,runtimeRequirements:p.runtimeRequirements,capabilities:p.capabilities});
 return canonicalDigest(semantic(a))===canonicalDigest(semantic(b));
}
/** Trusted composition root installs inventory, explicit routing and current rules.
 * This layer has no adapter, retrieval, retry counter or session planning port. */
export class ProfileRegistry {
 private readonly inventory=new Map<string,InstalledProfile>();
 private readonly order:Readonly<Record<ProfileChoice['preference'],readonly string[]>>;
 private readonly equivalents:readonly (readonly [string,string])[];
 constructor(private readonly qualifications:QualificationRegistry,private readonly currentRules:()=>ApprovalRules,
  inventory:readonly InstalledProfile[],order:Readonly<Record<ProfileChoice['preference'],readonly string[]>>,equivalents:readonly (readonly [string,string])[]=[],
  private readonly currentFallbackPermission:(from:OperatingProfile,to:OperatingProfile)=>boolean=()=>false){
  for(const entry of inventory){
   const p=OperatingProfileSchema.parse(entry.profile);boolean.parse(entry.organizationApproved);boolean.parse(entry.available);
   demand(!this.inventory.has(p.profileId),'IDEMPOTENCY_CONFLICT');
   this.inventory.set(p.profileId,Object.freeze({...entry,profile:p}));
  }
  this.order=Object.freeze(Object.fromEntries(['Fast','Balanced','Thorough'].map(k=>{
   const ids=list(uuid).parse(order[k as ProfileChoice['preference']]);demand(new Set(ids).size===ids.length);return [k,ids];
  })) as Record<ProfileChoice['preference'],readonly string[]>);
  this.equivalents=Object.freeze(equivalents.map(pair=>{demand(pair.length===2);return Object.freeze([uuid.parse(pair[0]),uuid.parse(pair[1])] as const);}));
 }
 setAvailable(profileId:string,available:boolean):void{const old=this.inventory.get(uuid.parse(profileId));demand(old,'MODEL_UNAVAILABLE');this.inventory.set(profileId,Object.freeze({...old,available:boolean.parse(available)}));}
 setOrganizationApproved(profileId:string,approved:boolean):void{const old=this.inventory.get(uuid.parse(profileId));demand(old,'MODEL_UNAVAILABLE');this.inventory.set(profileId,Object.freeze({...old,organizationApproved:boolean.parse(approved)}));}
 private eligible(entry:InstalledProfile,need:ProfileNeed,pins:VersionPins,now:string):void{
  const p=entry.profile,r=ApprovalRulesSchema.parse(this.currentRules());
  demand(entry.organizationApproved && r.providers.includes(p.provider) && r.routes.includes(p.route) && r.regions.includes(p.region)
   && r.dataPolicies.includes(p.dataPolicy) && r.runtimeProfiles.includes(p.runtimeRequirements.profileId),'UNAUTHORIZED');
  this.qualifications.assertCurrent(p,entry.qualification,pins,now);
  demand(supports(p,need),'REQUIRED_CAPABILITY_UNSUPPORTED');demand(entry.available,'MODEL_UNAVAILABLE');
 }
 private selected(entry:InstalledProfile,choice:ProfileChoice,fallbackReason:string|null):ModelSelection{
  return Object.freeze({status:'selected',profile:entry.profile,qualification:entry.qualification,choiceLabel:choice.pin===null?'Auto - organization approved':'Qualified profile '+choice.pin,
   modality:entry.profile.capabilities.inputModalities,dataPolicy:entry.profile.dataPolicy,estimatedCostClass:entry.profile.costAssumptions.estimatedCostClass,fallbackReason});
 }
 select(input:{need:ProfileNeed;pins:VersionPins;now:string;choice?:ProfileChoice}):ModelSelection{
  const need=ProfileNeedSchema.parse(input.need),pins=VersionPinsSchema.parse(input.pins),choice=input.choice===undefined?AUTO_CHOICE:ProfileChoiceSchema.parse(input.choice);
  let refusal='MODEL_UNAVAILABLE';
  for(const id of choice.pin===null?this.order[choice.preference]:[choice.pin]){
   const entry=this.inventory.get(id);if(!entry)continue;
   try{this.eligible(entry,need,pins,input.now);return this.selected(entry,choice,null);}catch(e){if(!(e instanceof ModelError))throw e;refusal=e.code;}
  }
  if(choice.pin!==null){
   const previous=this.inventory.get(choice.pin);
   if(previous){
    // An unavailable pin still has to be currently qualified and approved.
    // Neither a preference nor a stale profile authorizes a semantic substitute.
    try{
     this.eligible({...previous,available:true},need,pins,input.now);
     for(const [from,to]of this.equivalents){
      if(from!==choice.pin)continue;const candidate=this.inventory.get(to);
      if(!candidate||!equivalent(previous.profile,candidate.profile)||!(choice.allowEquivalentFallback||this.currentFallbackPermission(previous.profile,candidate.profile)))continue;
      try{this.eligible(candidate,need,pins,input.now);return this.selected(candidate,choice,'Unavailable pin; explicitly permitted approved equivalent');}catch(e){if(!(e instanceof ModelError))throw e;refusal=e.code;}
     }
    }catch(e){if(!(e instanceof ModelError))throw e;refusal=e.code;}
   }
  }
  return Object.freeze({status:'waiting',reason:'model-unavailable',refusal,choiceLabel:choice.pin===null?'Auto - organization approved':'Qualified profile '+choice.pin,
   allowedNextActions:Object.freeze(['switch-profile','contact-administrator'] as const),dispatchAllowed:false});
 }
 /** Called only by the native owner AFTER it resolves the original attempt.
  * Parsed client observations never enter here: installed owner port supplies proof. */
 selectEquivalent(input:{previous:OperatingProfile;evidence:SafeFallbackEvidence;need:ProfileNeed;pins:VersionPins;now:string;choice:ProfileChoice}):ModelSelection{
  const previous=OperatingProfileSchema.parse(input.previous),choice=ProfileChoiceSchema.parse(input.choice),safe=safeFailures.get(input.evidence);
  demand(safe&&safe.profileDigest===previous.profileDigest,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');demand(choice.allowEquivalentFallback,'UNAUTHORIZED');
  // Retry eligibility validates the SAME current target as ordinary selection
  // and dispatch authority. Approved-pair ordering cannot replace a manual pin
  // or Auto's explicit routing result with another eligible destination.
  const selection=this.select(input);if(selection.status==='waiting')return selection;
  const target=selection.profile;
  if(this.equivalents.some(([from,to])=>from===previous.profileId&&to===target.profileId)
   &&equivalent(previous,target)&&this.currentFallbackPermission(previous,target))
   return Object.freeze({...selection,fallbackReason:'Known safe failure; approved equivalent deployment'});
  return Object.freeze({status:'waiting',reason:'model-unavailable',refusal:'REQUIRED_CAPABILITY_UNSUPPORTED',choiceLabel:choice.pin===null?'Auto - organization approved':'Qualified profile '+choice.pin,
   allowedNextActions:Object.freeze(['switch-profile','contact-administrator'] as const),dispatchAllowed:false});
 }
}

/** Explicit refusal branch; neither responses nor gateway memory can authorize work. */
export const CachePolicySchema=object({schemaVersion:version,exactResponse:boolean,semanticResponse:boolean,gatewayKnowledgeMemory:boolean});
export function assertCachesDisabled(input:unknown):void{const p=CachePolicySchema.parse(input);demand(!p.exactResponse&&!p.semanticResponse&&!p.gatewayKnowledgeMemory,'REQUIRED_CAPABILITY_UNSUPPORTED');}
