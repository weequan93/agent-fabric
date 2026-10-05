import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type Clock, type ScopeRef } from './identity.js';
import { parseScope } from './task-envelope.js';

export interface BehaviorCandidate {scope:ScopeRef;candidateId:string;behaviorVersion:string;artifactId:string;artifactDigest:string;environmentImage:string;dependencyLockDigest:string;checkDefinitionDigest:string;verifierId:string;checkReceiptId:string;sourceIds:string[];expiresAt:number}
export interface BehaviorRelease extends BehaviorCandidate {releaseId:string;releasedAt:number;assurance:'controlled-local'}
export interface BehaviorHead {scope:ScopeRef;releaseId:string;revision:number}
export interface BehaviorEvaluationBinding {scope:ScopeRef;artifactId:string;artifactDigest:string;candidateId:string;environmentImage:string;dependencyLockDigest:string;checkDefinitionDigest:string;verifierId:string}
export interface BehaviorReleasePorts {clock:Clock;authorize:(scope:ScopeRef)=>void;assertEvaluation:(binding:BehaviorEvaluationBinding,receiptId:string)=>void;assertSourceCurrent:(scope:ScopeRef,sourceId:string)=>void}
function key(scope:ScopeRef,id:string):string {const s=parseScope(scope);return JSON.stringify([s.tenantId,s.spaceId,nonEmptyString(id)]);}
function scopeKey(scope:ScopeRef):string {const s=parseScope(scope);return JSON.stringify([s.tenantId,s.spaceId]);}
function digest(value:unknown):string {const result=nonEmptyString(value);requireCondition(/^(sha256:)?[a-f0-9]{64}$/.test(result),'INVALID_SCHEMA','Exact SHA256 binding required');return result;}
function parseCandidate(value:BehaviorCandidate):BehaviorCandidate {
  canonicalDigest(value);record(value,['scope','candidateId','behaviorVersion','artifactId','artifactDigest','environmentImage','dependencyLockDigest','checkDefinitionDigest','verifierId','checkReceiptId','sourceIds','expiresAt']);
  requireCondition(Array.isArray(value.sourceIds)&&new Set(value.sourceIds).size===value.sourceIds.length,'INVALID_SCHEMA','Unique source lineage required');
  return {scope:parseScope(value.scope),candidateId:nonEmptyString(value.candidateId),behaviorVersion:nonEmptyString(value.behaviorVersion),artifactId:nonEmptyString(value.artifactId),artifactDigest:digest(value.artifactDigest),environmentImage:nonEmptyString(value.environmentImage),dependencyLockDigest:digest(value.dependencyLockDigest),checkDefinitionDigest:digest(value.checkDefinitionDigest),verifierId:nonEmptyString(value.verifierId),checkReceiptId:nonEmptyString(value.checkReceiptId),sourceIds:value.sourceIds.map(s=>nonEmptyString(s)),expiresAt:nonNegativeInteger(value.expiresAt)};
}
/** Release authority is separate from facts; the mandatory port verifies registered protected checks. */
export class BehaviorReleaseRepository {
  private readonly candidates=new Map<string,BehaviorCandidate>();private readonly releases=new Map<string,BehaviorRelease>();private readonly heads=new Map<string,BehaviorHead>();private readonly deletedSources=new Set<string>();
  constructor(private readonly ports:BehaviorReleasePorts) {}
  propose(value:BehaviorCandidate):BehaviorCandidate {
    const candidate=parseCandidate(value);this.authorize(candidate.scope);this.assertSources(candidate);const id=key(candidate.scope,candidate.candidateId);const existing=this.candidates.get(id);
    requireCondition(existing===undefined||canonicalDigest(existing)===canonicalDigest(candidate),'IDEMPOTENCY_CONFLICT','Behavior candidate is immutable');this.candidates.set(id,structuredClone(candidate));return structuredClone(candidate);
  }
  publish(scope:ScopeRef,candidateId:string,releaseId:string,expectedHeadRevision:number):BehaviorRelease {
    const s=parseScope(scope);this.authorize(s);nonNegativeInteger(expectedHeadRevision);nonEmptyString(releaseId);const candidate=this.candidates.get(key(s,candidateId));requireCondition(candidate!==undefined,'CHECK_BINDING_MISMATCH','Registered behavior candidate required');this.assertEligible(candidate);
    const id=key(s,releaseId);const existing=this.releases.get(id);if(existing!==undefined){requireCondition(existing.candidateId===candidateId,'IDEMPOTENCY_CONFLICT','Release identity immutable');return structuredClone(existing);}
    const head=this.heads.get(scopeKey(s));requireCondition((head?.revision??0)===expectedHeadRevision,'STALE_REVISION','Refresh current behavior head');
    const revision=nonNegativeInteger(expectedHeadRevision+1);const release:BehaviorRelease={...structuredClone(candidate),releaseId,releasedAt:nonNegativeInteger(this.ports.clock.now()),assurance:'controlled-local'};
    this.releases.set(id,release);this.heads.set(scopeKey(s),{scope:s,releaseId,revision});return structuredClone(release);
  }
  current(scope:ScopeRef):BehaviorHead {const s=parseScope(scope);this.authorize(s);const head=this.heads.get(scopeKey(s));requireCondition(head!==undefined,'ARTIFACT_NOT_COMMITTED','No published behavior');this.get(s,head.releaseId);return structuredClone(head);}
  get(scope:ScopeRef,releaseId:string):BehaviorRelease {const s=parseScope(scope);this.authorize(s);const release=this.releases.get(key(s,releaseId));requireCondition(release!==undefined,'UNAUTHORIZED','Current release authority required');this.assertEligible(release);return structuredClone(release);}
  rollback(scope:ScopeRef,releaseId:string,expectedHeadRevision:number):BehaviorHead {
    const s=parseScope(scope);this.authorize(s);this.get(s,releaseId);const head=this.heads.get(scopeKey(s));requireCondition(head!==undefined&&head.revision===nonNegativeInteger(expectedHeadRevision),'STALE_REVISION','Rollback requires current behavior head');
    const next={scope:s,releaseId,revision:nonNegativeInteger(head.revision+1)};this.heads.set(scopeKey(s),next);return structuredClone(next);
  }
  sourceDelete(scope:ScopeRef,sourceId:string):void {const s=parseScope(scope);this.authorize(s);this.deletedSources.add(key(s,sourceId));}
  private assertEligible(candidate:BehaviorCandidate):void {
    this.assertSources(candidate);requireCondition(candidate.expiresAt>nonNegativeInteger(this.ports.clock.now()),'APPROVAL_EXPIRED','Behavior evaluation/release eligibility expired');
    const binding:BehaviorEvaluationBinding={scope:structuredClone(candidate.scope),artifactId:candidate.artifactId,artifactDigest:candidate.artifactDigest,candidateId:candidate.candidateId,environmentImage:candidate.environmentImage,dependencyLockDigest:candidate.dependencyLockDigest,checkDefinitionDigest:candidate.checkDefinitionDigest,verifierId:candidate.verifierId};
    this.ports.assertEvaluation(binding,candidate.checkReceiptId);this.authorize(candidate.scope);requireCondition(candidate.expiresAt>nonNegativeInteger(this.ports.clock.now()),'APPROVAL_EXPIRED','Release eligibility expired during evaluation');
  }
  private assertSources(candidate:BehaviorCandidate):void {for(const source of candidate.sourceIds){requireCondition(!this.deletedSources.has(key(candidate.scope,source)),'UNAUTHORIZED','Deleted source invalidates dependent behavior');this.ports.assertSourceCurrent(structuredClone(candidate.scope),source);}}
  private authorize(scope:ScopeRef):void {this.ports.authorize(structuredClone(parseScope(scope)));}
}
