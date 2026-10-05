import { canonicalDigest, nonEmptyString, record, requireCondition } from '../../contracts/src/identity.js';
import { parseModelCapabilities, type ModelCapabilities } from '../../contracts/src/adapters.js';

export interface QualifiedModelProfile { profileId:string;capabilities:ModelCapabilities;available:boolean }
export interface ProfileRequest { provider:string;region:string;model:string|null;schema:boolean;cancellation:boolean;usage:boolean;modalities:readonly ('text'|'image'|'audio')[] }
export type ModelSelection = {status:'selected';profile:QualifiedModelProfile}|{status:'waiting';reason:string;nextAction:string};
export function validateProfileRequest(value:unknown):ProfileRequest {
  canonicalDigest(value);const p=record(value,['provider','region','model','schema','cancellation','usage','modalities']);
  for(const name of ['schema','cancellation','usage']) requireCondition(typeof p[name]==='boolean','INVALID_SCHEMA','Explicit required capability flags');
  requireCondition(Array.isArray(p.modalities)&&p.modalities.length>0&&p.modalities.every(v=>v==='text'||v==='image'||v==='audio'),'REQUIRED_CAPABILITY_UNSUPPORTED','Required modalities unsupported');
  return {provider:nonEmptyString(p.provider),region:nonEmptyString(p.region),model:p.model===null?null:nonEmptyString(p.model),schema:p.schema as boolean,cancellation:p.cancellation as boolean,usage:p.usage as boolean,modalities:structuredClone(p.modalities) as ProfileRequest['modalities']};
}
/** Profiles are installed by a trusted G0 fixture owner, not self-qualified by a model. */
export class ModelProfileRegistry {
  private readonly profiles=new Map<string,QualifiedModelProfile>();
  register(value:QualifiedModelProfile):QualifiedModelProfile {
    canonicalDigest(value);const p=record(value,['profileId','capabilities','available']);requireCondition(typeof p.available==='boolean','INVALID_SCHEMA','Explicit route availability');
    const profile:QualifiedModelProfile={profileId:nonEmptyString(p.profileId),capabilities:structuredClone(parseModelCapabilities(p.capabilities)),available:p.available};
    const existing=this.profiles.get(profile.profileId);requireCondition(existing===undefined||canonicalDigest(existing)===canonicalDigest(profile),'IDEMPOTENCY_CONFLICT','Profile identity is immutable');
    this.profiles.set(profile.profileId,structuredClone(profile));return structuredClone(profile);
  }
  get(profileId:string):QualifiedModelProfile {const profile=this.profiles.get(nonEmptyString(profileId));requireCondition(profile!==undefined,'REQUIRED_CAPABILITY_UNSUPPORTED','Unknown profile');return structuredClone(profile);}
  setAvailable(profileId:string,available:boolean):void {requireCondition(typeof available==='boolean','INVALID_SCHEMA','Explicit route availability');const profile=this.get(profileId);profile.available=available;this.profiles.set(profileId,profile);}
  select(value:ProfileRequest):ModelSelection {
    const required=validateProfileRequest(value);
    const matching=[...this.profiles.values()].filter(p=>{const c=p.capabilities;return c.provider===required.provider&&c.region===required.region&&(required.model===null||c.model===required.model)&&(!required.schema||c.schema)&&(!required.cancellation||c.cancellation)&&(!required.usage||c.usage)&&required.modalities.every(m=>c.modalities.includes(m));}).sort((a,b)=>a.profileId.localeCompare(b.profileId));
    requireCondition(matching.length>0,'REQUIRED_CAPABILITY_UNSUPPORTED','No approved compatible profile; no provider, region or manual-pin fallback');
    const selected=matching.find(p=>p.available);
    if(selected===undefined)return {status:'waiting',reason:'model unavailable',nextAction:'Wait for the approved route or explicitly revise the model policy'};
    return {status:'selected',profile:structuredClone(selected)};
  }
}
