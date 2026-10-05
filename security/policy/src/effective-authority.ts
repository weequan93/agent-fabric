import { canonicalDigest, requireCondition, sameScope, nonEmptyString, nonNegativeInteger, record as parseRecord } from '../../../engine/contracts/src/identity.js';
import type { ScopeRef, AuthenticatedActorRef } from '../../../engine/contracts/src/identity.js';
import { parseTaskEnvelope, parseScope } from '../../../engine/contracts/src/task-envelope.js';
import type { TaskEnvelope, EffectClass, SourceRef } from '../../../engine/contracts/src/task-envelope.js';
import type { SpacesRepository } from '../../../services/spaces/src/bindings.js';
export interface AuthorityRecord {
 scope: ScopeRef; actorId: string; revision: number; membershipRevision: number;
 enterprise: readonly EffectClass[]; space: readonly EffectClass[]; role: readonly EffectClass[];
 tool: readonly EffectClass[]; runtime: readonly EffectClass[];
 readableSources: readonly string[]; shareableDestinations: readonly string[];
}
export interface AuthorityRequest {
 actor: AuthenticatedActorRef; envelope: TaskEnvelope; effect: EffectClass;
 source?: SourceRef; destination?: ScopeRef; explicitTrigger?: boolean;
}
export interface AuthorityDependency { scope: ScopeRef; actorId: string; revision: number; membershipRevision: number }
export interface AuthorizedAuthority { scope: ScopeRef; actorId: string; revision: number; membershipRevision: number; payerId: string; effect: EffectClass; dependencies: readonly AuthorityDependency[] }
function key(scope:ScopeRef,actorId:string):string {parseScope(scope);nonEmptyString(actorId);return canonicalDigest({scope,actorId});}
export function sharingGrantKey(sourceId:string,destination:ScopeRef):string {return canonicalDigest({sourceId:nonEmptyString(sourceId),destination:parseScope(destination)});}
export class AuthorityService {
 private readonly records=new Map<string,AuthorityRecord>();
 private readonly revisionHighWater=new Map<string,number>();
 private available=true;
 constructor(private readonly spaces:SpacesRepository) {}
 setAvailable(available:boolean):void {this.available=available;}
 // Trusted owner setup/update only, never exposed as a model/client grant operation.
 register(record:AuthorityRecord):void {
  const id=key(record.scope,record.actorId);canonicalDigest(record);
  nonNegativeInteger(record.revision);nonNegativeInteger(record.membershipRevision);
  for(const layer of [record.enterprise,record.space,record.role,record.tool,record.runtime])requireCondition(Array.isArray(layer)&&layer.every(v=>['read','model','write','computer'].includes(v)),'INVALID_SCHEMA','Explicit supported capability layer required');
  for(const grants of [record.readableSources,record.shareableDestinations])requireCondition(Array.isArray(grants)&&grants.every(v=>typeof v==='string'&&v.trim().length>0),'INVALID_SCHEMA','Explicit source/sharing grant list required');
  const previous=this.revisionHighWater.get(id);
  requireCondition(previous===undefined||record.revision>previous,'STALE_REVISION','Authority updates must advance revision, including revoked records');
  this.revisionHighWater.set(id,record.revision);
  this.records.set(id,structuredClone(record));
 }
 current(scope:ScopeRef,actorId:string):AuthorityRecord {
  requireCondition(this.available,'AUTHORITY_UNAVAILABLE','Current authority unavailable');
  const record=this.records.get(key(scope,actorId));requireCondition(record!==undefined,'UNAUTHORIZED','No current authority');
  return structuredClone(record);
 }
 revoke(scope:ScopeRef,actorId:string):void {this.records.delete(key(scope,actorId));}
 authorize(request:AuthorityRequest):AuthorizedAuthority {
  canonicalDigest(request);parseRecord(request,['actor','envelope','effect','source','destination','explicitTrigger'],['actor','envelope','effect']);
  parseRecord(request.actor,['actorId','tenantId']);nonEmptyString(request.actor.actorId);nonEmptyString(request.actor.tenantId);
  requireCondition(['read','model','write','computer'].includes(request.effect),'INVALID_SCHEMA','Supported effect required');
  const dependencies:AuthorityDependency[]=[];
  const envelope=parseTaskEnvelope(request.envelope);const scope=envelope.scope;
  requireCondition(this.available,'AUTHORITY_UNAVAILABLE','Current authority unavailable');
  requireCondition(request.actor.tenantId===scope.tenantId,'SCOPE_MISMATCH','Authenticated tenant mismatch');
  const binding=this.spaces.getAuthorized(scope,request.actor);
  const record=this.current(scope,request.actor.actorId);
  requireCondition(record.membershipRevision===binding.membershipRevision,'UNAUTHORIZED','Membership revision changed; refresh authority');
  requireCondition(envelope.payerId===binding.payerId,'UNAUTHORIZED','Payer must be server stamped');
  const layers=[record.enterprise,record.space,record.role,envelope.effectCeiling,record.tool,record.runtime];
  requireCondition(layers.every(layer=>layer.includes(request.effect)),'UNAUTHORIZED','Six-layer capability intersection denied');
  requireCondition(envelope.intent==='act'||request.effect==='read'||request.effect==='model','INTENT_EXCEEDED','Intent is a mutation ceiling');
  if(binding.kind==='group')requireCondition(envelope.groupTrigger===true&&request.explicitTrigger===true,'UNAUTHORIZED','Group discussion is not an explicit trigger');
  if(request.effect==='computer')requireCondition(binding.computerAssignment!==null,'REQUIRED_CAPABILITY_UNSUPPORTED','Explicit ComputerAssignment required');
  for(const target of envelope.targets)requireCondition(sameScope(target.scope,scope),'SCOPE_MISMATCH','Pending effect cannot migrate to another Space');
  if(request.source!==undefined){
   const source=request.source;canonicalDigest(source);const sourceBinding=this.spaces.getAuthorized(source.scope,request.actor);
   const sourceAuthority=this.current(source.scope,request.actor.actorId);
   requireCondition(sourceAuthority.membershipRevision===sourceBinding.membershipRevision&&[sourceAuthority.enterprise,sourceAuthority.space,sourceAuthority.role,sourceAuthority.tool,sourceAuthority.runtime].every(layer=>layer.includes('read')),'UNAUTHORIZED','Current source authority denied');
   dependencies.push({scope:source.scope,actorId:request.actor.actorId,revision:sourceAuthority.revision,membershipRevision:sourceAuthority.membershipRevision});
   requireCondition(source.scope.tenantId===scope.tenantId,'SCOPE_MISMATCH','Cross-tenant source denied');
   requireCondition(envelope.sources.some(s=>canonicalDigest(s)===canonicalDigest(source)),'UNAUTHORIZED','Source absent from admitted envelope');
   requireCondition(source.audience.includes(request.actor.actorId)&&sourceAuthority.readableSources.includes(source.sourceId)&&record.readableSources.includes(source.sourceId),'UNAUTHORIZED','Source unreadable');
   if(request.destination!==undefined)requireCondition(sameScope(request.destination,scope),'SCOPE_MISMATCH','Sharing destination must match admitted envelope and targets');
   // The admitted envelope owns the actual destination. Omitting a caller hint
   // must never turn a cross-Space transfer into an ordinary private read.
   if(request.destination!==undefined||!sameScope(source.scope,scope)){
    const destination=scope;const destinationBinding=this.spaces.getAuthorized(destination,request.actor);
    const destinationAuthority=this.current(destination,request.actor.actorId);
    requireCondition(destinationAuthority.membershipRevision===destinationBinding.membershipRevision,'UNAUTHORIZED','Current destination authority denied');
    dependencies.push({scope:destination,actorId:request.actor.actorId,revision:destinationAuthority.revision,membershipRevision:destinationAuthority.membershipRevision});
    const grant=sharingGrantKey(source.sourceId,destination);
    requireCondition(sourceAuthority.shareableDestinations.includes(grant)&&destinationAuthority.shareableDestinations.includes(grant),'UNAUTHORIZED','Source readability does not grant destination sharing');
   }
  } else requireCondition(request.destination===undefined,'INVALID_SCHEMA','Sharing requires explicit source');
  return {scope:structuredClone(scope),actorId:request.actor.actorId,revision:record.revision,membershipRevision:record.membershipRevision,payerId:binding.payerId,effect:request.effect,dependencies:structuredClone(dependencies)};
 }
 assertCurrent(admission:AuthorizedAuthority):void {
  for(const dep of admission.dependencies){const current=this.current(dep.scope,dep.actorId);const scope=this.spaces.getAuthorized(dep.scope,{actorId:dep.actorId,tenantId:dep.scope.tenantId});requireCondition(current.revision===dep.revision&&current.membershipRevision===dep.membershipRevision&&scope.membershipRevision===dep.membershipRevision,'UNAUTHORIZED','Source/destination cached authority changed');}
  const record=this.current(admission.scope,admission.actorId);
  const binding=this.spaces.getAuthorized(admission.scope,{actorId:admission.actorId,tenantId:admission.scope.tenantId});
  requireCondition(record.revision===admission.revision&&record.membershipRevision===admission.membershipRevision&&binding.membershipRevision===admission.membershipRevision,'UNAUTHORIZED','Cached authority revoked/changed');
  requireCondition(binding.payerId===admission.payerId&&[record.enterprise,record.space,record.role,record.tool,record.runtime].every(layer=>layer.includes(admission.effect)),'UNAUTHORIZED','Current grant/payer denied');
 }
}
