import { randomUUID } from 'node:crypto';
import type { DomainEvent } from '../../engine/contracts/src/events.js';
import { SessionLoop,replaySession,isTerminal,assertVerifiedScope,type SessionModelOperation,type SessionModelResolution } from './native-imports.js';
import { LocalPayloadSchema } from './test-adapter.js';
import { TaskCallBindingSchema,EncodedRequestSchema,OperatingProfileSchema } from './schema.js';
import { ComputerPreflightSchema } from './native-computer.js';
import { NativeRepository,AdmissionSchema,TurnCommandSchema,RetryTurnCommandSchema,ResumeCommandSchema,SwitchCommandSchema,TopUpSchema,StopSchema,NativeCommandSchema,type NativeSnapshot } from './native-repository.js';
import { ProfileChoiceSchema,type ProfileRegistry,type ModelSelection } from './profile.js';
import { ModelService } from './model-service.js';
import { TransactionBudgetRepository } from './budget-repository.js';
import { nativeView } from './view.js';
import { commandLive,commandReceipt,recordCommand,lockOriginal,currentScope,hash } from './model-repository.js';
import { reserveEstimate,positiveUnits } from './arithmetic.js';
import { demand,ModelError } from './errors.js';
import type { VerifiedScope,SqlTransaction,OperatingProfile,EncodedRequest,OriginalCall,WaitRecord } from './contracts.js';
/** Installed trusted ports, never operator-supplied callbacks, destinations or booleans. */
export interface NativePorts{
 readonly profiles:Pick<ProfileRegistry,'select'>&Partial<Pick<ProfileRegistry,'selectEquivalent'>>;
 encode(scope:VerifiedScope,session:NativeSnapshot,profile:OperatingProfile,input:string,original:Omit<OriginalCall,'requestDigest'>):Promise<EncodedRequest>;
 assertOutput(tx:SqlTransaction,scope:VerifiedScope,session:NativeSnapshot,request:EncodedRequest):Promise<void>;
 /** Safe controls revalidate the complete current capsule without model I/O. */
 assertControl(tx:SqlTransaction,scope:VerifiedScope,session:NativeSnapshot,profile:OperatingProfile):Promise<void|number>;
 /** Current native approval/resource owner. This may resolve a wait, never plan a turn. */
 admission(tx:SqlTransaction,scope:VerifiedScope,session:NativeSnapshot):Promise<WaitRecord['reason']|null>;
 resumeEstimate(session:NativeSnapshot,inputLimitBytes:number):number;
 /** Optional installed broker sink; each chunk is authorized immediately before it. */
 publishChunk?:(fragment:string)=>Promise<void>;
}
/** A projection or model/tool name cannot enter this native admission predicate. */
export function assertContinuationAllowed(s:NativeSnapshot,effect:'child'|'computer'|'target'):void{
 const state=replaySession(s.origin,s.events),binding=TaskCallBindingSchema.parse(s.binding),admission=AdmissionSchema.parse(s.admission);
 demand(!state.pendingModel&&!state.pendingOperations.length,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
 demand(!s.control.wait,'UNAUTHORIZED');
 demand(binding.intent==='Act'&&(effect==='computer'?admission.executionClass==='computer':effect==='target'?admission.targetEffect:true),'INTENT_EXCEEDED');
}
export class NativeSession{
 constructor(readonly repository:NativeRepository,readonly models:ModelService,readonly ports:NativePorts){}
 private select(s:NativeSnapshot,choice=s.control.choice):ModelSelection{return this.ports.profiles.select({need:s.admission.need,pins:s.binding.versions,now:new Date().toISOString(),choice});}
 private async checked<T>(scope:VerifiedScope,s:NativeSnapshot,request:EncodedRequest,work:(tx:SqlTransaction)=>Promise<T>):Promise<T>{
  return this.repository.uow.withScope(scope,async tx=>{
   const now=await this.repository.load(tx,scope,s.binding.sessionId);await this.repository.fresh(tx,scope,now);
   await this.ports.assertOutput(tx,scope,now,request);await currentScope(tx,scope);const result=await work(tx);
   await this.ports.assertOutput(tx,scope,now,request);await this.repository.fresh(tx,scope,now);return result;
  });
 }
 /** Restore invokes ONLY unchanged pure reducers and pinned local authorization.
  * No profile, model, SQL, retrieval, clock, resource or effect port runs here. */
 restore(s:NativeSnapshot,scope:VerifiedScope,resolution?:(pending:SessionModelOperation)=>Promise<SessionModelResolution>):SessionLoop{
  assertVerifiedScope(scope);const loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:(_run,effect)=>{demand(scope.tenantId===s.binding.tenantId&&scope.spaceId===s.binding.spaceId,'SCOPE_MISMATCH');demand(scope.grants.includes(effect==='read'?'task:read':'task:write'),'UNAUTHORIZED');},model:async()=>{throw new ModelError('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');},execute:async()=>{throw new ModelError('REQUIRED_CAPABILITY_UNSUPPORTED');},...(resolution?{modelResolution:(_run,pending)=>resolution(pending)}:{})});loop.restore(s.events);return loop;
 }
 private async resolution(scope:VerifiedScope,s:NativeSnapshot,pending:SessionModelOperation):Promise<SessionModelResolution>{
  const state=await this.repository.uow.withScope(scope,async tx=>{const now=await this.repository.load(tx,scope,s.binding.sessionId);demand(scope.actorId===now.binding.actorId&&scope.grants.includes('task:write'),'UNAUTHORIZED');const o=await this.repository.original(tx,scope,now,pending.operationId,pending.reservationId??undefined);demand(o&&o.original.reservationId===pending.reservationId,'CHECK_BINDING_MISMATCH');return o;});
  if(state.noDispatch)return {...pending,status:'safely-failed',receiptId:null};
  const result=await this.models.reconcile(scope,state.original),o=result.observation;
  return {...pending,status:o.status==='settled'?(o.receipt.outcome==='answer'?'completed':'safely-failed'):o.status==='sealed-not-accepted'?'safely-failed':'unknown',receiptId:o.status==='settled'?o.receipt.receiptId:null};
 }
 async inspect(scope:VerifiedScope,sessionId:string){
  return this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,sessionId);
   const costs=(await tx.query('SELECT fabric.model_native_costs($1) AS costs',[sessionId])).rows[0]?.['costs'] as {reserved:number;actual:number;pendingExposure:number};
   const selected=this.select(s),last=(await tx.query("SELECT a.request,prior.request->>'profileDigest' AS previous_profile_digest FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) LEFT JOIN fabric.model_attempts prior ON prior.tenant_id=a.tenant_id AND prior.space_id=a.space_id AND prior.operation_id=a.operation_id AND prior.ordinal=a.ordinal-1 WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.session_id=$3 ORDER BY (o.record->>'sessionTurn')::bigint DESC,a.ordinal DESC LIMIT 1",[scope.tenantId,scope.spaceId,sessionId])).rows[0];
   const actual=last?OperatingProfileSchema.parse((JSON.parse(LocalPayloadSchema.parse(JSON.parse(EncodedRequestSchema.parse(last['request']).payload)).text) as {profile:unknown}).profile):selected.status==='selected'?selected.profile:null;
   // A cross-profile retry is admitted only after safe original-owner evidence
   // and current equivalent policy. Its durable adjacent attempt proves this
   // reason even after restart, independently of today's selection preview.
   const retryFallback=last?.['previous_profile_digest']&&last['previous_profile_digest']!==actual?.profileDigest?'Known safe failure; approved equivalent deployment':null;
   const model=actual?{status:last?'recorded-request':'current-selection',profileId:actual.profileId,profileDigest:actual.profileDigest,model:actual.model,modelVersion:actual.modelVersion,route:actual.route,modality:actual.capabilities.inputModalities,dataPolicy:actual.dataPolicy,estimatedCostClass:actual.costAssumptions.estimatedCostClass,fallbackReason:retryFallback??(selected.status==='selected'?selected.fallbackReason:null)}:null;
   await currentScope(tx,scope);const preflight=(await tx.query('SELECT record FROM fabric.model_computer_preflights WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,sessionId])).rows[0]?.['record'];return {...nativeView(s,costs),model,preflight:preflight?ComputerPreflightSchema.parse(preflight):null,spaceComputerAssignment:(await tx.query('SELECT resource_id FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',[scope.tenantId,scope.spaceId])).rows[0]?.['resource_id']??null};
  });
 }
 private async wait(scope:VerifiedScope,s:NativeSnapshot,loop:SessionLoop,reason:WaitRecord['reason'],key:string,expiresAt:string|null){
  const wait=await this.repository.uow.withScope(scope,tx=>this.repository.makeWait(tx,{...s,events:loop.events()},reason,expiresAt));
  if(loop.inspect().run.state!=='waiting')loop.transition('waiting',{currentAuthorized:true,waiting:{reason:reason==='unknown-usage'?'unknown-effect':reason==='model-unavailable'?'resource':reason,resolver:wait.resolver,nextAction:wait.allowedNextActions[0]!}});
  await this.repository.persist(scope,s,loop.events(),wait,'checkpoint:'+key);return {status:'waiting' as const,view:await this.inspect(scope,s.binding.sessionId)};
 }
 async requestTurn(scope:VerifiedScope,raw:ReturnType<typeof TurnCommandSchema.parse>){
  const c=TurnCommandSchema.parse(raw),digest=hash({kind:'request-turn',...c});demand(c.input.length>0);
  const begin=await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);await lockOriginal(tx,scope,'turn:'+c.key);
   const old=await commandReceipt(tx,scope,'turn:'+c.key,digest);if(old)return {s,duplicate:true};
   demand(s.revision===c.expectedRevision,'STALE_REVISION');await commandLive(tx,c.expiresAt);
   const state=replaySession(s.origin,s.events);demand(!isTerminal(state.run.state),'TERMINAL_RUN');demand(state.pendingModel===null&&state.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');demand(s.control.wait===null,'UNAUTHORIZED');
   demand(Buffer.byteLength(c.input)<=s.control.inputLimitBytes,'INTENT_EXCEEDED');
   const control={...s.control,choice:c.choice??s.control.choice};await this.repository.save(tx,scope,s,s.events,control);
   await recordCommand(tx,scope,'turn:'+c.key,digest,'native-turn-requested',{sessionId:c.sessionId},this.repository.hooks);await this.repository.fresh(tx,scope,s);return {s:{...s,control,revision:s.revision+1},duplicate:false};
  });
  if(begin.duplicate)return {status:'recorded' as const,view:await this.inspect(scope,c.sessionId)};
  const s={...begin.s,control:{...begin.s.control,choice:c.choice??begin.s.control.choice}};
  return this.executeTurn(scope,c,s,this.select(s));
 }
 /** Explicit current retry of the last safely failed native operation. The
  * command carries no receipt, owner, route, ceiling or replacement identity. */
 async retryTurn(scope:VerifiedScope,raw:ReturnType<typeof RetryTurnCommandSchema.parse>){
  const c=RetryTurnCommandSchema.parse(raw),digest=hash({kind:'retry-turn',...c});demand(c.input.length>0);
  const begin=await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);await lockOriginal(tx,scope,'turn:'+c.key);
   if(await commandReceipt(tx,scope,'turn:'+c.key,digest))return {s,previous:null};
   demand(s.revision===c.expectedRevision,'STALE_REVISION');await commandLive(tx,c.expiresAt);
   const state=replaySession(s.origin,s.events);demand(!isTerminal(state.run.state),'TERMINAL_RUN');demand(!state.pendingModel&&!state.pendingOperations.length,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   demand(s.control.wait?.reason==='connection'&&Buffer.byteLength(c.input)<=s.control.inputLimitBytes,'UNAUTHORIZED');
   const last=[...s.events].reverse().find(e=>e.kind==='model-resolved');
   demand(last?.payload['status']==='safely-failed'&&(last.payload['operation'] as SessionModelOperation).operationId===c.operationId,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const previous=await this.repository.original(tx,scope,s,c.operationId);demand(previous&&!previous.noDispatch,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const original=await this.models.usage.load(tx,scope,previous.original);demand(original.operation.status==='safely-failed'&&original.operation.attemptsTaken<original.operation.retryCeiling,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const control={...s.control,choice:c.choice??s.control.choice};await this.repository.save(tx,scope,s,s.events,control);
   await recordCommand(tx,scope,'turn:'+c.key,digest,'native-retry-requested',{sessionId:c.sessionId,operationId:c.operationId},this.repository.hooks);await this.repository.fresh(tx,scope,s);return {s:{...s,control,revision:s.revision+1},previous:original};
  });
  if(!begin.previous)return {status:'recorded' as const,view:await this.inspect(scope,c.sessionId)};
  const s={...begin.s,control:{...begin.s.control,choice:c.choice??begin.s.control.choice}},previous=begin.previous;
  let selection=this.select(s);
  if(selection.status==='selected'&&selection.profile.profileDigest!==previous.request.profileDigest){
   demand(this.ports.profiles.selectEquivalent,'MODEL_UNAVAILABLE');
   const profile=OperatingProfileSchema.parse((JSON.parse(LocalPayloadSchema.parse(JSON.parse(previous.request.payload)).text) as {profile:unknown}).profile);
   selection=this.ports.profiles.selectEquivalent({previous:profile,evidence:await this.models.failureEvidence(scope,previous.attempt.original),need:s.admission.need,pins:s.binding.versions,now:new Date().toISOString(),choice:s.control.choice});
  }
  return this.executeTurn(scope,c,s,selection,previous.attempt.original);
 }
 private async executeTurn(scope:VerifiedScope,c:ReturnType<typeof TurnCommandSchema.parse>,s:NativeSnapshot,selection:ModelSelection,previous?:OriginalCall){
  const idle=this.restore(s,scope);
  if(selection.status==='waiting')return this.wait(scope,s,idle,'model-unavailable',c.key,null);
  const admission=await this.repository.uow.withScope(scope,async tx=>{await this.repository.fresh(tx,scope,s);const reason=await this.ports.admission(tx,scope,s);await this.repository.fresh(tx,scope,s);return reason;});
  if(admission!==null)return this.wait(scope,s,idle,admission,c.key,c.expiresAt);
  const original={tenantId:scope.tenantId,spaceId:scope.spaceId,operationId:previous?.operationId??randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()},pending={operationId:original.operationId,reservationId:original.reservationId};
  let request:EncodedRequest|undefined,budgetDenied=false,canCheckpoint=false,refusalReason:WaitRecord['reason']|undefined,loop:SessionLoop;
  loop=new SessionLoop(s.origin,{clock:{now:()=>Date.now()},authorize:(_run,effect)=>{demand(scope.grants.includes(effect==='read'?'task:read':'task:write'),'UNAUTHORIZED');},modelOperation:()=>pending,
   execute:async()=>{throw new ModelError('REQUIRED_CAPABILITY_UNSUPPORTED');},modelResolution:(_run,p)=>this.resolution(scope,s,p),
   model:async(input)=>{
    request=await this.ports.encode(scope,s,selection.profile,input,original);
    demand(request.original.operationId===pending.operationId&&request.original.reservationId===pending.reservationId,'CHECK_BINDING_MISMATCH');
    try{
     const categories={model:reserveEstimate(request.payload,request.outputCap)-2,service:2};
     if(previous)await this.models.takeRetry(scope,{previous,request,requester:'engine',key:'model:'+c.key,expiresAt:c.expiresAt,route:selection.profile.route,categories},{origin:s.origin,events:loop.events()});
     else await this.models.prepare(scope,{binding:s.binding,request,origin:s.origin,nativePrefix:loop.events(),route:selection.profile.route,categories,command:{key:'model:'+c.key,expiresAt:c.expiresAt,retryCeiling:3}});
     canCheckpoint=true;
    }
    catch(e){if(e instanceof ModelError&&['BUDGET_EXHAUSTED','OVERRUN_LIABILITY'].includes(e.code)){if(!previous)await this.repository.denied(scope,s,loop.events(),request.original,e.code==='OVERRUN_LIABILITY'?'overrun':'budget');budgetDenied=true;}else{
      const reason=e instanceof ModelError&&['MODEL_UNAVAILABLE','QUALIFICATION_MISMATCH','REQUIRED_CAPABILITY_UNSUPPORTED'].includes(e.code)?'model-unavailable':(e instanceof ModelError&&['UNAUTHORIZED','SCOPE_MISMATCH','CHECK_BINDING_MISMATCH','STALE_REVISION'].includes(e.code)||(e as {code?:string})?.code==='42501')?'permission':'connection';
      const refused=await this.repository.refusePreparation(scope,s,loop.events(),request.original,'model:'+c.key,reason);
      canCheckpoint=true;if(refused)refusalReason=reason;
     }throw e;}
    let result=await this.models.dispatch(scope,request.original);
    // Acceptance ACK never asserts completion. One explicit original-owner
    // control lookup may already observe usage; otherwise persist a wait. This
    // performs no model retry, polling turn or second accept.
    if(result.status!=='settled')result=await this.models.reconcile(scope,request.original);
    demand(result.status==='settled','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
    const staged=await this.models.stageOutput(scope,request.original);
    for(const fragment of staged.chunks)await this.checked(scope,s,staged.request,async()=>{await this.ports.publishChunk?.(fragment);});
    return this.checked(scope,s,staged.request,async()=>staged.output);
   }});
  loop.restore(s.events);const state=loop.inspect().run.state;
  if(state==='queued')loop.transition('preparing',{currentAuthorized:true});
  if(state==='waiting'&&previous)loop.transition('running',{currentAuthorized:true,unknownEffect:false});
  if(['queued','preparing'].includes(state))loop.transition('running',{currentAuthorized:true});
  try{
   const output=await loop.callModel(c.input);demand(request,'CHECK_BINDING_MISMATCH');
   await this.checked(scope,s,request,async(tx)=>{const now=await this.repository.load(tx,scope,s.binding.sessionId);demand(now.revision===s.revision,'STALE_REVISION');await this.repository.save(tx,scope,now,loop.events(),{...s.control,wait:null});await recordCommand(tx,scope,'checkpoint:'+c.key,hash({events:loop.events(),wait:null}),'native-checkpoint',{sessionId:c.sessionId},this.repository.hooks);});
   const view=await this.inspect(scope,c.sessionId);
   return this.checked(scope,s,request,async()=>({status:'completed' as const,output,view}));
  }catch(error){
   if(budgetDenied)return this.wait(scope,s,previous?idle:loop,'budget',c.key,null);
   if(request&&canCheckpoint){
    // Only persist current pending state. A concurrent Stop or revocation rejects
    // this checkpoint; the earlier atomic pending prefix remains conservative.
    try{return await this.wait(scope,s,loop,loop.inspect().pendingModel?'unknown-usage':refusalReason??'connection',c.key,null);}catch{/* Preserve original error and already committed history. */}
   }
   throw error;
  }
 }
 /** Explicit first dispatch of an original durable, never-sent preparation.
  * Session/operation resolve identity server-side. Replay and requestTurn never call this. */
 async dispatchPrepared(scope:VerifiedScope,raw:{sessionId:string;operationId:string}){
  const {object,uuid}=await import('./decoder.js'),c=object({sessionId:uuid,operationId:uuid}).parse(raw);
  const original=await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);
   const state=this.restore(s,scope).inspect();demand(!s.stopped&&!isTerminal(state.run.state),'TERMINAL_RUN');
   demand(state.pendingModel?.operationId===c.operationId,'CHECK_BINDING_MISMATCH');
   const recorded=await this.repository.original(tx,scope,s,c.operationId);demand(recorded&&!recorded.noDispatch&&recorded.original.reservationId===state.pendingModel.reservationId,'CHECK_BINDING_MISMATCH');
   const installed=await this.models.usage.load(tx,scope,recorded.original);demand(installed.attempt.status==='prepared'&&installed.attempt.claimId===null,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   return recorded.original;
  });
  // ModelRepository's fresh claim and one-use permit serialize contenders and
  // recheck selected full profile, approval, sources, payer and native fences.
  await this.models.dispatch(scope,original);
  return this.reconcile(scope,c);
 }
 async reconcile(scope:VerifiedScope,raw:{sessionId:string;operationId:string}){
  const {object,uuid}=await import('./decoder.js');const c=object({sessionId:uuid,operationId:uuid}).parse(raw),s=await this.repository.snapshot(scope,c.sessionId);
  const loop=this.restore(s,scope,p=>this.resolution(scope,s,p));demand(loop.inspect().pendingModel?.operationId===c.operationId,'CHECK_BINDING_MISMATCH');
  const pending=loop.inspect().pendingModel!;
  const status=await loop.resolveModel(c.operationId);
  const refusedReason=status==='safely-failed'?await this.repository.uow.withScope(scope,async tx=>(await this.repository.original(tx,scope,s,c.operationId,pending.reservationId??undefined))?.reason):undefined;
  if(status!=='unknown'){
   let wait=s.control.wait;
   if(!s.stopped&&(loop.inspect().run.state==='waiting'||refusedReason)){
    if(loop.inspect().run.waiting?.reason==='unknown-effect')loop.transition('reconciling',{currentAuthorized:true});
    wait=await this.repository.uow.withScope(scope,tx=>this.repository.makeWait(tx,{...s,events:loop.events()},refusedReason??'connection',null));
    if(loop.inspect().run.state!=='waiting')loop.transition('waiting',{currentAuthorized:true,unknownEffect:false,waiting:{reason:refusedReason==='model-unavailable'?'resource':refusedReason??'connection',resolver:wait.resolver,nextAction:wait.allowedNextActions[0]!}});
   }
   await this.repository.persist(scope,s,loop.events(),wait,'resolution:'+c.operationId+':'+s.revision,false);
  }
  return {status,replayAllowed:false as const,view:await this.inspect(scope,c.sessionId)};
 }
 async resume(scope:VerifiedScope,raw:ReturnType<typeof ResumeCommandSchema.parse>){
  const c=ResumeCommandSchema.parse(raw),digest=hash({kind:'native-resume',...c});
  await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);await lockOriginal(tx,scope,c.key);if(await commandReceipt(tx,scope,c.key,digest))return;
   demand(s.revision===c.expectedRevision,'STALE_REVISION');await commandLive(tx,c.expiresAt);demand(s.control.wait!==null&&s.control.wait.allowedNextActions.includes('resume'),'UNAUTHORIZED');
   if(s.control.wait.expiresAt)await commandLive(tx,s.control.wait.expiresAt);
   const loop=this.restore(s,scope),state=loop.inspect();demand(state.pendingModel===null&&state.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   demand(c.inputLimitBytes<=s.control.inputLimitBytes&&c.inputLimitBytes<=s.admission.maxInputBytes,'INTENT_EXCEEDED');
   const selected=this.select(s);demand(selected.status==='selected','MODEL_UNAVAILABLE');await this.ports.assertControl(tx,scope,s,selected.profile);demand(await this.ports.admission(tx,scope,s)===null,'UNAUTHORIZED');
   // Probe the SAME native budget owner, including aggregate/deficit checks; no
   // reservation survives this control-only savepoint and no model is invoked.
   const estimate=positiveUnits(this.ports.resumeEstimate(s,c.inputLimitBytes));await tx.query('SAVEPOINT native_resume_budget');
   await new TransactionBudgetRepository(tx).reserve(s.binding.runId,{tenantId:scope.tenantId,spaceId:scope.spaceId,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID(),requestDigest:hash('resume-admission')},{model:estimate});
   await tx.query('ROLLBACK TO SAVEPOINT native_resume_budget');await tx.query('RELEASE SAVEPOINT native_resume_budget');
   loop.transition('running',{currentAuthorized:true,unknownEffect:false});await this.repository.save(tx,scope,s,loop.events(),{...s.control,wait:null,inputLimitBytes:c.inputLimitBytes});
   await recordCommand(tx,scope,c.key,digest,'native-resume',{sessionId:c.sessionId},this.repository.hooks);await this.ports.assertControl(tx,scope,await this.repository.load(tx,scope,c.sessionId),selected.profile);await this.repository.fresh(tx,scope,s);await commandLive(tx,c.expiresAt);
  });return {autoDispatched:false as const,view:await this.inspect(scope,c.sessionId)};
 }
 async switchProfile(scope:VerifiedScope,raw:ReturnType<typeof SwitchCommandSchema.parse>){
  const c=SwitchCommandSchema.parse(raw),digest=hash({kind:'native-switch',...c});
  const revalidationEstimate=await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);await lockOriginal(tx,scope,c.key);const prior=await commandReceipt(tx,scope,c.key,digest);if(prior)return (prior as {revalidationEstimate:number|null}).revalidationEstimate??null;
   demand(s.revision===c.expectedRevision,'STALE_REVISION');await commandLive(tx,c.expiresAt);const state=replaySession(s.origin,s.events);demand(state.pendingModel===null&&state.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const selected=this.select(s,ProfileChoiceSchema.parse(c.choice));demand(selected.status==='selected','MODEL_UNAVAILABLE');
   const estimate=await this.ports.assertControl(tx,scope,s,selected.profile);
   // Preserve native work and validate its complete capsule now. Exact encoding
   // and reservation still belong to the next separately authorized turn.
   const wait=s.control.wait?.reason==='model-unavailable'?{...s.control.wait,allowedNextActions:['resume','switch-profile','stop'] as WaitRecord['allowedNextActions']}:s.control.wait;
   await this.repository.save(tx,scope,s,s.events,{...s.control,choice:c.choice,wait});await recordCommand(tx,scope,c.key,digest,'profile-switched',{sessionId:c.sessionId,cache:'lost/not-used',revalidationEstimate:estimate??null},this.repository.hooks);await this.ports.assertControl(tx,scope,await this.repository.load(tx,scope,c.sessionId),selected.profile);await this.repository.fresh(tx,scope,s);await commandLive(tx,c.expiresAt);return estimate??null;
  });return {cache:'lost/not-used' as const,revalidationEstimate,autoDispatched:false as const,view:await this.inspect(scope,c.sessionId)};
 }
 async topUp(scope:VerifiedScope,input:ReturnType<typeof TopUpSchema.parse>){return this.repository.topUp(scope,input);}
 async stop(scope:VerifiedScope,input:ReturnType<typeof StopSchema.parse>){return this.repository.stop(scope,input);}
 /** Trusted test effect/child/computer continuations share the same fresh native
  * fence and pending rule; operator input never supplies this callback. */
 async continue(scope:VerifiedScope,raw:ReturnType<typeof NativeCommandSchema.parse>,effect:'child'|'computer'|'target',io:()=>Promise<void>):Promise<void>{
  const c=NativeCommandSchema.parse(raw);await this.repository.uow.withScope(scope,async tx=>{
   const s=await this.repository.load(tx,scope,c.sessionId);await this.repository.fresh(tx,scope,s);await commandLive(tx,c.expiresAt);demand(s.revision===c.expectedRevision,'STALE_REVISION');assertContinuationAllowed(s,effect);
   demand(await this.ports.admission(tx,scope,s)===null,'UNAUTHORIZED');await io();await this.repository.fresh(tx,scope,s);
  });
 }
}
