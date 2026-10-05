import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type Clock } from '../../../engine/contracts/src/identity.js';
import type { QualificationRef, RuntimeCapabilities } from '../../../engine/contracts/src/adapters.js';

export const REQUIRED_RUNTIME_CONTROLS=['shell','sdk','api','filesystem','browser','desktop','isolatedWorkspace','policyEnforcement','cancellation','spendAccounting'] as const;
export interface QualificationInput {qualificationId:string;capabilities:RuntimeCapabilities;version:string;environmentDigest:string;definitionDigest:string;expiresAt:number}
export interface QualificationProbeResult {passed:boolean;capabilityDigest:string;checks:string[]}
export interface QualificationRecord extends QualificationRef {capabilityDigest:string;assurance:'controlled-local';checks:string[]}
export type QualificationProbe=(input:QualificationInput)=>QualificationProbeResult;
export function validateRuntimeCapabilities(value:unknown):RuntimeCapabilities {
  canonicalDigest(value);const p=record(value,['deployment','region','isolatedWorkspace','policyEnforcement','cancellation','spendAccounting','mutationPaths']);
  for(const c of ['isolatedWorkspace','policyEnforcement','cancellation','spendAccounting'])requireCondition(p[c]===true,'REQUIRED_CAPABILITY_UNSUPPORTED','Mandatory runtime control missing');
  const paths=p.mutationPaths;requireCondition(Array.isArray(paths),'INVALID_SCHEMA','Explicit mutation path array required');
  requireCondition(paths.length===6&&new Set(paths).size===6&&REQUIRED_RUNTIME_CONTROLS.slice(0,6).every(c=>paths.includes(c)),'REQUIRED_CAPABILITY_UNSUPPORTED','All six mutation paths required');
  return {deployment:nonEmptyString(p.deployment),region:nonEmptyString(p.region),isolatedWorkspace:true,policyEnforcement:true,cancellation:true,spendAccounting:true,mutationPaths:structuredClone(p.mutationPaths) as RuntimeCapabilities['mutationPaths']};
}
export class QualificationRegistry {
  private readonly verifiers=new Map<string,QualificationProbe>();private readonly records=new Map<string,QualificationRecord>();private readonly revoked=new Set<string>();
  constructor(private readonly clock:Clock,private readonly authorizeOwner:()=>void) {}
  registerVerifier(verifierId:string,probe:QualificationProbe):void {this.authorizeOwner();nonEmptyString(verifierId);requireCondition(typeof probe==='function'&&!this.verifiers.has(verifierId),'IDEMPOTENCY_CONFLICT','Registered verifier identity immutable');this.verifiers.set(verifierId,probe);}
  qualify(verifierId:string,value:QualificationInput):QualificationRecord {
    this.authorizeOwner();canonicalDigest(value);record(value,['qualificationId','capabilities','version','environmentDigest','definitionDigest','expiresAt']);
    const input:QualificationInput={qualificationId:nonEmptyString(value.qualificationId),capabilities:validateRuntimeCapabilities(value.capabilities),version:nonEmptyString(value.version),environmentDigest:nonEmptyString(value.environmentDigest),definitionDigest:nonEmptyString(value.definitionDigest),expiresAt:nonNegativeInteger(value.expiresAt)};
    requireCondition(!this.records.has(input.qualificationId)&&!this.revoked.has(input.qualificationId),'IDEMPOTENCY_CONFLICT','Qualification identity cannot be reused');
    const probe=this.verifiers.get(nonEmptyString(verifierId));requireCondition(probe!==undefined,'UNAUTHORIZED','Self-declared or unregistered verifier denied');
    const testedAt=nonNegativeInteger(this.clock.now());requireCondition(input.expiresAt>testedAt,'LEASE_EXPIRED','Qualification must have bounded future expiry');
    const result=probe(structuredClone(input));canonicalDigest(result);record(result,['passed','capabilityDigest','checks']);
    requireCondition(result.passed===true&&result.capabilityDigest===canonicalDigest(input.capabilities)&&Array.isArray(result.checks)&&REQUIRED_RUNTIME_CONTROLS.every(c=>result.checks.includes(c)),'REQUIRED_CAPABILITY_UNSUPPORTED','Actual registered probe did not establish required local controls');
    this.authorizeOwner();requireCondition(input.expiresAt>nonNegativeInteger(this.clock.now()),'LEASE_EXPIRED','Qualification expired during its actual probe');
    const qualified:QualificationRecord={qualificationId:input.qualificationId,deployment:input.capabilities.deployment,version:input.version,environmentDigest:input.environmentDigest,definitionDigest:input.definitionDigest,verifierId,testedAt,expiresAt:input.expiresAt,capabilities:[...REQUIRED_RUNTIME_CONTROLS],capabilityDigest:result.capabilityDigest,assurance:'controlled-local',checks:result.checks.map(c=>nonEmptyString(c))};
    this.records.set(input.qualificationId,structuredClone(qualified));return structuredClone(qualified);
  }
  get(id:string):QualificationRecord {this.authorizeOwner();const r=this.records.get(nonEmptyString(id));requireCondition(r!==undefined&&!this.revoked.has(id),'UNAUTHORIZED','Current registered qualification required');requireCondition(r.expiresAt>nonNegativeInteger(this.clock.now()),'LEASE_EXPIRED','Qualification expired');return structuredClone(r);}
  assertCurrent(id:string,capabilities:RuntimeCapabilities,version:string,environmentDigest:string,definitionDigest:string):QualificationRecord {
    const caps=validateRuntimeCapabilities(capabilities);const r=this.get(id);requireCondition(r.deployment===caps.deployment&&r.version===version&&r.environmentDigest===environmentDigest&&r.definitionDigest===definitionDigest&&r.capabilityDigest===canonicalDigest(caps),'CHECK_BINDING_MISMATCH','Qualification must bind exact deployment/version/environment/definition/capabilities');return r;
  }
  revoke(id:string):void {this.authorizeOwner();nonEmptyString(id);requireCondition(this.records.has(id),'UNAUTHORIZED','Unknown qualification');this.revoked.add(id);}
}
