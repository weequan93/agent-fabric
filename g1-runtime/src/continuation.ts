/** Bounded owned-local continuation. Original F03/PG fencing is a separate gate. */
import {randomUUID} from 'node:crypto';
import {assertVerifiedScope,revalidateScope,bindingDigest,parseTaskEnvelope,generationSchema,type Generation,type VerifiedScope,type TaskEnvelope} from './owners.js';
import {immutable,requireIntent,type AuthorityIntersection} from './intent.js';
import {object,version,uuid,revision,refined,enumeration} from './schemas.js';
import type {ProcessControl,ProcessObservation} from './process-control.js';
export const continuationControls=Object.freeze(['owned-process','owned-descendants','broker','authority','required-audit','required-evidence','monotonic-watchdog'] as const);
export const ContinuationRequestSchema=object({schemaVersion:version,operationId:uuid,key:uuid,taskId:uuid,runId:uuid,bootId:uuid,generation:generationSchema,policyGeneration:revision,leaseMs:refined(revision,v=>v>0&&v<=30_000),workload:enumeration('fixed-owned-stream')});
export type ContinuationRequest=ReturnType<typeof ContinuationRequestSchema.parse>;
export interface ContinuationContext {
 readonly envelope:TaskEnvelope;readonly runId:string;readonly operationId:string;readonly bootId:string;readonly leaseId:string;readonly generation:Generation;
 readonly desiredGeneration:number;readonly effectiveGeneration:number;readonly effectiveBootId:string;readonly phase:'active'|'pending'|'failed';
 readonly qualificationExpiresAt:number;readonly controls:readonly string[];readonly intersection:AuthorityIntersection;
 readonly telemetry:'current'|'stale';readonly heartbeat:'current'|'stale';readonly assurance:'owned-local-fixture';
}
export interface ContinuationRecord {
 readonly request:ContinuationRequest;readonly contextDigest:string;readonly ownerDigest:string;
 readonly state:'starting'|'running'|'fenced'|'quarantined';readonly reason:string;readonly dispatchFenced:boolean;
 readonly process:ProcessObservation|null;readonly effectOutcome:'unknown';readonly resourcesHeld:true;readonly replayAllowed:false;
 readonly telemetry:'current'|'stale';readonly heartbeat:'current'|'stale';readonly usage:'unknown';readonly nativeStop:null|{readonly key:string;readonly generation:Generation};
}
export interface ContinuationPorts {
 now():number;current(scope:VerifiedScope,r:ContinuationRequest):Promise<ContinuationContext>;
 audit(scope:VerifiedScope,r:ContinuationRequest,event:'dispatch'|'continue'|'renew'|'stop'):Promise<void>;
 /** Reservation owner retains conflicts through unknown outcomes; never timeout-only release. */
 reserve(scope:VerifiedScope,r:ContinuationRequest):Promise<void>;
 /** Original owner adapter in production; explicit native SessionLoop fixture locally. */
 stopRun(scope:VerifiedScope,r:ContinuationRequest,key:string):Promise<Generation>;
 get(scope:VerifiedScope,operationId:string):Promise<ContinuationRecord|null>;
 save(scope:VerifiedScope,operationId:string,record:ContinuationRecord):Promise<void>;
 exclusive<T>(operationId:string,fn:()=>Promise<T>):Promise<T>;
 control():ProcessControl;endpoint:string;
 /** Trusted independent startup observation, never a worker/caller policy claim. */
 verifyStartup(scope:VerifiedScope,r:ContinuationRequest,c:ContinuationContext,observation:ProcessObservation):Promise<void>;
 activateStartup(scope:VerifiedScope,r:ContinuationRequest,c:ContinuationContext):Promise<void>;
 /** Guarded fixed owned target, never an executable/URL supplied by a request. */
 effect(scope:VerifiedScope,r:ContinuationRequest,actor:{pid:number;role:string;action:'mutation'|'fixture-publication'}):Promise<void>;
}
type Active={scope:VerifiedScope;request:ContinuationRequest;context:ContinuationContext;deadline:number;qualificationDeadline:number;credential:string;control:ProcessControl;record:ContinuationRecord;leaseTimer:ReturnType<typeof setTimeout>;monitor:ReturnType<typeof setInterval>;checking:boolean;blocked:boolean;transport:boolean};
const check=(ok:unknown,code:string):void=>{if(!ok)throw new Error(code);};
const owner=(s:VerifiedScope)=>bindingDigest([s.tenantId,s.spaceId,s.actorId,s.payerId]);
/** Exact edge is closed; real elapsed process tests additionally exercise timers. */
export function requireContinuationTime(now:number,leaseDeadline:number,qualificationDeadline:number):void {
 check([now,leaseDeadline,qualificationDeadline].every(Number.isFinite),'CONTINUATION_FENCED');
 check(now<leaseDeadline,'LEASE_EXPIRED');check(now<qualificationDeadline,'QUALIFICATION_EXPIRED');
}
function identity(c:ContinuationContext){return {envelope:c.envelope,runId:c.runId,operationId:c.operationId,bootId:c.bootId,leaseId:c.leaseId,generation:c.generation,desiredGeneration:c.desiredGeneration,effectiveGeneration:c.effectiveGeneration,effectiveBootId:c.effectiveBootId,qualificationExpiresAt:c.qualificationExpiresAt};}
export class RuntimeContinuation {
 private readonly active=new Map<string,Active>();
 constructor(private readonly ports:ContinuationPorts){}
 private async current(scope:VerifiedScope,r:ContinuationRequest,pinned?:ContinuationContext,pending=false):Promise<ContinuationContext>{
  assertVerifiedScope(scope);await revalidateScope(scope);const c=await this.ports.current(scope,r),e=parseTaskEnvelope(c.envelope);
  requireIntent(scope,e,'bounded-write',c.intersection);
  check(c.assurance==='owned-local-fixture'&&e.taskId===r.taskId&&c.runId===r.runId&&c.operationId===r.operationId&&c.bootId===r.bootId&&bindingDigest(generationSchema.parse(c.generation))===bindingDigest(r.generation),'CHECK_BINDING_MISMATCH');uuid.parse(c.leaseId);
  check(pending?c.phase==='pending'&&c.desiredGeneration===r.policyGeneration&&c.effectiveGeneration<c.desiredGeneration&&c.effectiveBootId!==r.bootId:c.phase==='active'&&c.desiredGeneration===r.policyGeneration&&c.effectiveGeneration===r.policyGeneration&&c.effectiveBootId===r.bootId,'PENDING_RECREATION');
  check(continuationControls.every(control=>c.controls.includes(control)),'REQUIRED_CONTROL_UNAVAILABLE');
  check(Number.isSafeInteger(c.qualificationExpiresAt)&&c.qualificationExpiresAt>this.ports.now(),'QUALIFICATION_EXPIRED');
  if(pinned)check(bindingDigest(identity(c))===bindingDigest(identity(pinned)),'CHECK_BINDING_MISMATCH');
  await revalidateScope(scope);return immutable(c);
 }
 private async bounded<T>(fn:()=>Promise<T>):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([fn(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('CONTROL_UNREACHABLE')),300);})]);}finally{if(timer)clearTimeout(timer);}}
 private live(a:Active){check(!a.blocked&&a.transport,'CONTINUATION_FENCED');requireContinuationTime(performance.now(),a.deadline,a.qualificationDeadline);}
 private update(a:Active,delta:Partial<ContinuationRecord>){a.record=immutable({...a.record,...delta});}
 private async persist(a:Active){await this.ports.save(a.scope,a.request.operationId,a.record);}
 private async fence(a:Active,reason:string,unreachable=false):Promise<void>{
  // In-memory privilege ends before any required sink, native owner or transport await.
  a.blocked=true;clearTimeout(a.leaseTimer);clearInterval(a.monitor);
  const quarantine=unreachable||!a.transport||a.record.state==='quarantined';
  this.update(a,{state:quarantine?'quarantined':'fenced',reason:a.record.dispatchFenced?a.record.reason:reason,dispatchFenced:true,...(quarantine?{heartbeat:'stale' as const}:{})});
  try{await this.persist(a);}catch{this.update(a,{state:'quarantined',reason:'REQUIRED_EVIDENCE_UNAVAILABLE'});}
  if(!a.transport||unreachable)return;
  try{const observed=await a.control.stop();this.update(a,{process:observed,...(!observed.terminated?{state:'quarantined' as const}:{})});await this.persist(a);}catch{this.update(a,{state:'quarantined',reason:'PROCESS_CONTROL_UNAVAILABLE'});}
 }
 async start(scope:VerifiedScope,raw:unknown):Promise<ContinuationRecord>{
  return this.startOwned(scope,raw,false);
 }
 /** Internal composition operation: new workers stay paused until verified activation. */
 async recreateStartup(scope:VerifiedScope,raw:unknown):Promise<ContinuationRecord>{return this.startOwned(scope,raw,true);}
 private async startOwned(scope:VerifiedScope,raw:unknown,pending:boolean):Promise<ContinuationRecord>{
  const r=ContinuationRequestSchema.parse(raw);assertVerifiedScope(scope);await revalidateScope(scope);
  return this.ports.exclusive(r.operationId,async()=>{
   let c=await this.bounded(()=>this.current(scope,r,undefined,pending));const prior=await this.ports.get(scope,r.operationId);
   if(prior){check(prior.ownerDigest===owner(scope)&&bindingDigest(prior.request)===bindingDigest(r),'IDEMPOTENCY_CONFLICT');throw new Error('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');}
   await this.bounded(()=>this.ports.audit(scope,r,'dispatch'));await this.bounded(()=>this.current(scope,r,c,pending));
   await this.ports.reserve(scope,r);await this.bounded(()=>this.current(scope,r,c,pending));
   const at=performance.now(),control=this.ports.control(),a={} as Active;
   const record:ContinuationRecord=immutable({request:r,contextDigest:bindingDigest(identity(c)),ownerDigest:owner(scope),state:'starting',reason:'starting-owned-worker',dispatchFenced:false,process:null,effectOutcome:'unknown',resourcesHeld:true,replayAllowed:false,telemetry:c.telemetry,heartbeat:c.heartbeat,usage:'unknown',nativeStop:null});
   Object.assign(a,{scope,request:r,context:c,deadline:at+r.leaseMs,qualificationDeadline:at+c.qualificationExpiresAt-this.ports.now(),credential:randomUUID(),control,record,checking:false,blocked:false,transport:true});
   this.active.set(r.operationId,a);await this.persist(a);
   a.leaseTimer=setTimeout(()=>{void this.fence(a,'LEASE_EXPIRED');},Math.max(0,Math.min(a.deadline,a.qualificationDeadline)-performance.now()));
   a.monitor=setInterval(()=>{if(a.checking||a.blocked||a.record.state!=='running')return;a.checking=true;void this.bounded(async()=>{this.live(a);const current=await this.current(scope,r,c,pending&&a.record.state==='starting');this.live(a);await this.ports.audit(scope,r,'continue');this.live(a);if(a.record.state==='running'&&a.control.observe().parentExited)throw new Error('PROCESS_EXITED');this.update(a,{telemetry:current.telemetry,heartbeat:current.heartbeat});}).catch(e=>this.fence(a,e instanceof Error?e.message:'CONTROL_UNAVAILABLE',e instanceof Error&&e.message==='CONTROL_UNREACHABLE')).finally(()=>{a.checking=false;});},40);
   try{
    await control.start({endpoint:this.ports.endpoint,credential:a.credential,operationId:r.operationId,bootId:r.bootId,generation:r.generation,remainingMs:Math.max(0,Math.min(a.deadline,a.qualificationDeadline)-performance.now())});
    this.live(a);const observed=control.observe();check(observed.bootId===r.bootId&&bindingDigest(observed.generation)===bindingDigest(r.generation)&&!observed.parentExited&&!observed.childExited,'CHECK_BINDING_MISMATCH');
    await this.bounded(()=>this.ports.verifyStartup(scope,r,c,observed));this.live(a);
    if(pending){await this.bounded(()=>this.ports.activateStartup(scope,r,c));c=await this.bounded(()=>this.current(scope,r));a.context=c;}
    await this.bounded(()=>this.current(scope,r,c));this.live(a);this.update(a,{state:'running',reason:'owned-local-fixture-active',process:control.observe()});await this.persist(a);control.activate();return immutable(a.record);
   }catch(e){await this.fence(a,e instanceof Error?e.message:'PROCESS_CONTROL_UNAVAILABLE');throw e;}
  });
 }
 /** The only installed worker capability. Data cannot select another route or target. */
 async step(credential:string,raw:unknown):Promise<void>{
  const step=object({operationId:uuid,bootId:uuid,generation:generationSchema,pid:refined(revision,v=>v>0),role:enumeration('parent','child'),action:enumeration('mutation','fixture-publication')}).parse(raw),a=this.active.get(step.operationId);
  check(a&&a.credential===credential,'UNAUTHORIZED');const current=a!;
  await this.ports.exclusive(step.operationId,async()=>{
   this.live(current);check(step.bootId===current.request.bootId&&bindingDigest(step.generation)===bindingDigest(current.request.generation),'CHECK_BINDING_MISMATCH');
   const p=current.control.observe();check(step.pid===(step.role==='parent'?p.parentPid:p.childPid),'CHECK_BINDING_MISMATCH');
   await this.bounded(()=>this.current(current.scope,current.request,current.context));this.live(current);
   await this.bounded(()=>this.ports.audit(current.scope,current.request,'continue'));this.live(current);
   await this.ports.effect(current.scope,current.request,{pid:step.pid,role:step.role,action:step.action});
  });
 }
 async status(scope:VerifiedScope,id:string):Promise<ContinuationRecord>{
  uuid.parse(id);assertVerifiedScope(scope);await revalidateScope(scope);const a=this.active.get(id),record=a?.record??await this.ports.get(scope,id);check(record&&record.ownerDigest===owner(scope),'NOT_FOUND');return immutable(record!);
 }
 async renew(scope:VerifiedScope,id:string,leaseMs:number):Promise<void>{
  check(Number.isSafeInteger(leaseMs)&&leaseMs>0&&leaseMs<=30_000,'LEASE_EXPIRED');assertVerifiedScope(scope);await revalidateScope(scope);
  const a=this.active.get(uuid.parse(id));check(a&&owner(scope)===a.record.ownerDigest,'NOT_FOUND');
  try{this.live(a!);await this.bounded(()=>this.current(scope,a!.request,a!.context));await this.bounded(()=>this.ports.audit(scope,a!.request,'renew'));this.live(a!);
   // This fixed workload never extends a lease from a delayed worker ACK. A new
   // lease may shorten the current one; full renewal requires a qualified backend.
   a!.deadline=Math.min(a!.deadline,performance.now()+leaseMs);clearTimeout(a!.leaseTimer);a!.leaseTimer=setTimeout(()=>{void this.fence(a!,'LEASE_EXPIRED');},Math.max(0,Math.min(a!.deadline,a!.qualificationDeadline)-performance.now()));
  }catch(e){await this.fence(a!,'RENEWAL_DENIED');throw e;}
 }
 async stop(scope:VerifiedScope,id:string,key:string):Promise<ContinuationRecord>{
  uuid.parse(id);uuid.parse(key);assertVerifiedScope(scope);await revalidateScope(scope);
  const a=this.active.get(id);check(a&&a.record.ownerDigest===owner(scope),'NOT_FOUND');
  // Stale progress revision is deliberately absent; immutable run + current actor suffice.
  await this.bounded(()=>this.ports.audit(scope,a!.request,'stop'));
  a!.blocked=true;
  try{const generation=await this.ports.stopRun(scope,a!.request,key);generationSchema.parse(generation);check(generation.cancellation>a!.request.generation.cancellation&&generation.worker===a!.request.generation.worker&&generation.resource===a!.request.generation.resource,'CHECK_BINDING_MISMATCH');
   this.update(a!,{nativeStop:{key,generation}});await this.fence(a!,'STOP_ACCEPTED');return immutable(a!.record);
  }catch(e){await this.fence(a!,'STOP_OWNER_UNREACHABLE',true);throw e;}
 }
 /** Trusted composition reports transport failure. No public worker update port. */
 async transportLost(id:string):Promise<void>{const a=this.active.get(id);check(a,'NOT_FOUND');a!.transport=false;await this.fence(a!,'CONTROL_UNREACHABLE',true);}
 /** Re-observation cannot clear effect uncertainty or release resources. */
 async observe(scope:VerifiedScope,id:string):Promise<ContinuationRecord>{await this.status(scope,id);const a=this.active.get(id);check(a,'NOT_FOUND');check(a!.transport,'CONTROL_UNREACHABLE');this.update(a!,{process:a!.control.observe()});await this.persist(a!);return immutable(a!.record);}
 async shutdown():Promise<void>{for(const a of this.active.values()){a.transport=true;await this.fence(a,'SERVICE_SHUTDOWN');}}
}
