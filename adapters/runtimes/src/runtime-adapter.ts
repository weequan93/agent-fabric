import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope, type Clock, type IdFactory, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
import type { RuntimeCapabilities } from '../../../engine/contracts/src/adapters.js';
import { QualificationRegistry, validateRuntimeCapabilities } from '../../../security/conformance/src/qualification-record.js';

export interface RuntimeProfile {profileId:string;capabilities:RuntimeCapabilities;version:string;environmentDigest:string;definitionDigest:string;qualificationId:string}
export type RuntimeState='pending-qualification'|'ready'|'suspended'|'terminated'|'deleted'|'pending-recreation';
export interface RuntimeRecord {scope:ScopeRef;runId:string;runtimeId:string;credentialId:string;generation:number;profile:RuntimeProfile;state:RuntimeState;assurance:'controlled-local'}
export interface ControlledRuntimeOptions {clock:Clock;ids:IdFactory;registry:QualificationRegistry;authorize:(scope:ScopeRef,profile:RuntimeProfile,runId:string)=>void;fence:(scope:ScopeRef,runId:string)=>void}
function parseProfile(value:RuntimeProfile):RuntimeProfile {canonicalDigest(value);record(value,['profileId','capabilities','version','environmentDigest','definitionDigest','qualificationId']);return {profileId:nonEmptyString(value.profileId),capabilities:validateRuntimeCapabilities(value.capabilities),version:nonEmptyString(value.version),environmentDigest:nonEmptyString(value.environmentDigest),definitionDigest:nonEmptyString(value.definitionDigest),qualificationId:nonEmptyString(value.qualificationId)};}
/** Controlled local lifecycle only; no VM, cloud, local-machine fallback or autoscaling. */
export class ControlledRuntimeAdapter {
  private readonly runtimes=new Map<string,RuntimeRecord>();private readonly credentials=new Set<string>();
  constructor(private readonly options:ControlledRuntimeOptions) {}
  provision(scope:ScopeRef,runId:string,value:RuntimeProfile):RuntimeRecord {
    const s=parseScope(scope);const profile=parseProfile(value);nonEmptyString(runId);this.options.authorize(structuredClone(s),structuredClone(profile),runId);
    const runtimeId=nonEmptyString(this.options.ids.next('runtime'));const credentialId=nonEmptyString(this.options.ids.next('credential'));
    requireCondition(!this.runtimes.has(runtimeId)&&!this.credentials.has(credentialId),'IDEMPOTENCY_CONFLICT','Runtime and credential identity cannot be reused');
    const runtime:RuntimeRecord={scope:s,runId,runtimeId,credentialId,generation:0,profile,state:'pending-qualification',assurance:'controlled-local'};
    this.runtimes.set(runtimeId,runtime);this.credentials.add(credentialId);return structuredClone(runtime);
  }
  qualify(scope:ScopeRef,runtimeId:string):RuntimeRecord {
    const r=this.current(scope,runtimeId);requireCondition(r.state==='pending-qualification','STALE_FENCE','Only a fresh runtime generation can qualify');this.checkQualification(r);r.state='ready';return structuredClone(r);
  }
  inspect(scope:ScopeRef,runtimeId:string):RuntimeRecord {
    const r=this.current(scope,runtimeId);if(r.state==='ready'||r.state==='suspended')this.checkQualification(r);return structuredClone(r);
  }
  suspend(scope:ScopeRef,runtimeId:string):RuntimeRecord {const r=this.current(scope,runtimeId);requireCondition(r.state==='ready','STALE_FENCE','Only ready runtime can suspend');this.checkQualification(r);this.options.fence(structuredClone(r.scope),r.runId);r.state='suspended';return structuredClone(r);}
  resume(scope:ScopeRef,runtimeId:string):RuntimeRecord {const r=this.current(scope,runtimeId);requireCondition(r.state==='suspended','STALE_FENCE','Only suspended runtime can resume');this.checkQualification(r);r.generation=nonNegativeInteger(r.generation+1);r.state='ready';return structuredClone(r);}
  terminate(scope:ScopeRef,runtimeId:string):RuntimeRecord {const r=this.current(scope,runtimeId);requireCondition(r.state!=='deleted','STALE_FENCE','Deleted runtime cannot terminate');this.options.fence(structuredClone(r.scope),r.runId);r.state='terminated';return structuredClone(r);}
  transfer(scope:ScopeRef,runtimeId:string,artifact:{scope:ScopeRef;artifactId:string;digest:string}):{scope:ScopeRef;artifactId:string;digest:string} {
    const r=this.current(scope,runtimeId);requireCondition(r.state==='ready'||r.state==='suspended','STALE_FENCE','Transfer requires qualified generation');this.checkQualification(r);canonicalDigest(artifact);record(artifact,['scope','artifactId','digest']);requireCondition(sameScope(parseScope(artifact.scope),r.scope),'SCOPE_MISMATCH','Transfer must remain in approved scope');nonEmptyString(artifact.artifactId);nonEmptyString(artifact.digest);return structuredClone(artifact);
  }
  delete(scope:ScopeRef,runtimeId:string):RuntimeRecord {const r=this.current(scope,runtimeId);this.options.fence(structuredClone(r.scope),r.runId);r.state='deleted';return structuredClone(r);}
  replace(scope:ScopeRef,runtimeId:string):RuntimeRecord {const old=this.current(scope,runtimeId);requireCondition(old.state!=='deleted','STALE_FENCE','Deleted runtime cannot return');const generation=nonNegativeInteger(old.generation+1);old.state='pending-recreation';this.options.fence(structuredClone(old.scope),old.runId);const replacement=this.provision(old.scope,old.runId,old.profile);const next=this.runtimes.get(replacement.runtimeId)!;next.generation=generation;old.state='terminated';return structuredClone(next);}
  updateCapabilities(scope:ScopeRef,runtimeId:string,capabilities:RuntimeCapabilities):RuntimeRecord {
    const r=this.current(scope,runtimeId);requireCondition(r.state!=='deleted'&&r.state!=='terminated','STALE_FENCE','Terminal runtime cannot be revived by capability changes');canonicalDigest(capabilities);this.options.fence(structuredClone(r.scope),r.runId);r.state='pending-recreation';r.profile={...r.profile,capabilities:structuredClone(capabilities)};return structuredClone(r);
  }
  private current(scope:ScopeRef,runtimeId:string):RuntimeRecord {const s=parseScope(scope);const r=this.runtimes.get(nonEmptyString(runtimeId));requireCondition(r!==undefined&&sameScope(r.scope,s),'UNAUTHORIZED','Current runtime authority required');this.options.authorize(structuredClone(s),structuredClone(r.profile),r.runId);return r;}
  private checkQualification(r:RuntimeRecord):void {try {const p=r.profile;this.options.registry.assertCurrent(p.qualificationId,p.capabilities,p.version,p.environmentDigest,p.definitionDigest);}catch(error){this.options.fence(structuredClone(r.scope),r.runId);r.state='pending-recreation';throw error;}}
}
