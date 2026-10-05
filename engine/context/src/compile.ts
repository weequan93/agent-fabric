import {canonicalDigest,nonEmptyString,nonNegativeInteger,record,requireCondition,type Clock,type ScopeRef} from '../../contracts/src/identity.js';
import {parseScope,type SourceRef} from '../../contracts/src/task-envelope.js';
import {parseModelCapabilities,type ModelCapabilities} from '../../contracts/src/adapters.js';
export interface ContextRecord extends SourceRef {content:string}
export interface CapsuleRequirements {requirementsRevision:number;requirements:string;uncertainty:string[];failedPlans:string[];pendingEffects:string[];checks:string[];nextSafeAction:string}
export interface ContextCapsule extends CapsuleRequirements {scope:ScopeRef;actorId:string;authorityRevision:number;records:ContextRecord[];compiledAt:number;digest:string}
export interface ContextPorts {clock:Clock;currentAuthority(scope:ScopeRef,actorId:string):number;authorizeSource(scope:ScopeRef,actorId:string,source:SourceRef):void;retrieve(sourceId:string,scope:ScopeRef):ContextRecord}
function strings(v:unknown):string[]{requireCondition(Array.isArray(v),'INVALID_SCHEMA','String list required');return v.map(x=>nonEmptyString(x));}
function source(v:unknown,content=false):SourceRef|ContextRecord{canonicalDigest(v);const p=record(v,content?['sourceId','scope','audience','trust','observedAt','content']:['sourceId','scope','audience','trust','observedAt']);requireCondition(p.trust==='trusted'||p.trust==='untrusted','INVALID_SCHEMA','Explicit source trust required');requireCondition(Array.isArray(p.audience)&&p.audience.length>0,'INVALID_SCHEMA','Source audience required');const s:SourceRef={sourceId:nonEmptyString(p.sourceId),scope:parseScope(p.scope),audience:strings(p.audience),trust:p.trust,observedAt:nonNegativeInteger(p.observedAt)};return content?{...s,content:nonEmptyString(p.content)}:s;}
function requirements(v:unknown):CapsuleRequirements{const p=record(v,['requirementsRevision','requirements','uncertainty','failedPlans','pendingEffects','checks','nextSafeAction']);return {requirementsRevision:nonNegativeInteger(p.requirementsRevision),requirements:nonEmptyString(p.requirements),uncertainty:strings(p.uncertainty),failedPlans:strings(p.failedPlans),pendingEffects:strings(p.pendingEffects),checks:strings(p.checks),nextSafeAction:nonEmptyString(p.nextSafeAction)};}
export function parseContextCapsule(v:unknown):ContextCapsule{canonicalDigest(v);const p=record(v,['scope','actorId','authorityRevision','records','compiledAt','digest','requirementsRevision','requirements','uncertainty','failedPlans','pendingEffects','checks','nextSafeAction']);requireCondition(Array.isArray(p.records),'INVALID_SCHEMA','Typed context records required');const c:ContextCapsule={...requirements(Object.fromEntries(['requirementsRevision','requirements','uncertainty','failedPlans','pendingEffects','checks','nextSafeAction'].map(k=>[k,p[k]]))),scope:parseScope(p.scope),actorId:nonEmptyString(p.actorId),authorityRevision:nonNegativeInteger(p.authorityRevision),records:p.records.map(x=>source(x,true) as ContextRecord),compiledAt:nonNegativeInteger(p.compiledAt),digest:nonEmptyString(p.digest)};const {digest,...body}=c;requireCondition(digest===canonicalDigest(body),'INVALID_SCHEMA','Capsule digest mismatch');return c;}
/** Source content is data. Trusted server callbacks alone grant retrieval and reuse. */
export class ContextCompiler {
 constructor(private readonly ports:ContextPorts){}
 compile(scope:ScopeRef,actorId:string,input:CapsuleRequirements,sources:SourceRef[]):ContextCapsule{
  canonicalDigest({scope,actorId,input,sources});const s=parseScope(scope),actor=nonEmptyString(actorId),req=requirements(input);const revision=nonNegativeInteger(this.ports.currentAuthority(s,actor));
  const descriptors=sources.map(x=>source(x) as SourceRef);for(const d of descriptors)this.ports.authorizeSource(s,actor,d);
  const records=descriptors.map(d=>{const r=source(this.ports.retrieve(d.sourceId,d.scope),true) as ContextRecord;const {content,...metadata}=r;requireCondition(canonicalDigest(metadata)===canonicalDigest(d),'STALE_REVISION','Source provenance changed before retrieval');return r;});
  requireCondition(this.ports.currentAuthority(s,actor)===revision,'STALE_REVISION','Recompile after current grants change');for(const d of descriptors)this.ports.authorizeSource(s,actor,d);
  const body={...req,scope:s,actorId:actor,authorityRevision:revision,records,compiledAt:nonNegativeInteger(this.ports.clock.now())};return {...body,digest:canonicalDigest(body)};
 }
 assertCurrent(value:ContextCapsule):ContextCapsule{const c=parseContextCapsule(value);requireCondition(this.ports.currentAuthority(c.scope,c.actorId)===c.authorityRevision,'STALE_REVISION','Recompile after current grants change');for(const r of c.records){const {content,...d}=r;this.ports.authorizeSource(c.scope,c.actorId,d);}return c;}
}
/** Opaque KV/reasoning state is never transferred across provider/region/model/grants. */
export class ProviderScopedCache {
 private readonly entries=new Map<string,string>();constructor(private readonly compiler:ContextCompiler){}
 private key(capsule:ContextCapsule,route:ModelCapabilities):string{const c=this.compiler.assertCurrent(capsule),r=parseModelCapabilities(route);return canonicalDigest({scope:c.scope,actor:c.actorId,revision:c.authorityRevision,capsule:c.digest,provider:r.provider,region:r.region,model:r.model,manifest:r.manifestDigest});}
 put(capsule:ContextCapsule,route:ModelCapabilities,opaque:string):void{this.entries.set(this.key(capsule,route),nonEmptyString(opaque));}
 get(capsule:ContextCapsule,route:ModelCapabilities):string|null{return this.entries.get(this.key(capsule,route))??null;}
}
