import { canonicalDigest, nonEmptyString, record, requireCondition } from '../../contracts/src/identity.js';
import type { Clock } from '../../contracts/src/identity.js';
import { validateEvent } from '../../contracts/src/events.js';
import type { DomainEvent } from '../../contracts/src/events.js';
import { transitionRun, isTerminal } from '../../scheduler/src/run-state.js';
import type { RunRecord, RunState, RunGuard } from '../../scheduler/src/run-state.js';

export interface SessionModelOperation { operationId:string; reservationId:string|null }
export interface SessionModelResolution extends SessionModelOperation { status:'completed'|'safely-failed'|'unknown'; receiptId:string|null }
export interface SessionState { run:RunRecord; sequence:number; modelResponses:string[]; pendingOperations:string[]; pendingModel:SessionModelOperation|null; notification:'none'|'sent'|'failed'; modelClaimsCompleted:boolean }
export interface SessionPorts {
 clock:Clock; authorize:(run:RunRecord,effect:'read'|'model'|'write')=>void;
 model:(input:string)=>Promise<string>; execute:(operationId:string)=>Promise<'committed'|'safely-failed'|'unknown'>;
 /** Trusted server binding to the actual model adapter operation; never a client outcome. */
 modelOperation?:(input:string)=>SessionModelOperation;
 /** Current owner lookup of the original reservation/receipt; absence may prove no invocation. */
 modelResolution?:(run:RunRecord,pending:SessionModelOperation)=>SessionModelResolution|Promise<SessionModelResolution>;
}
function modelOperation(value:unknown):SessionModelOperation {
 canonicalDigest(value);const p=record(value,['operationId','reservationId']);
 return {operationId:nonEmptyString(p['operationId']),reservationId:p['reservationId']===null?null:nonEmptyString(p['reservationId'])};
}
function modelResolution(value:unknown,pending:SessionModelOperation):SessionModelResolution {
 canonicalDigest(value);const p=record(value,['operationId','reservationId','status','receiptId']);
 const identity=modelOperation({operationId:p['operationId'],reservationId:p['reservationId']});
 requireCondition(canonicalDigest(identity)===canonicalDigest(pending),'CHECK_BINDING_MISMATCH','Original model operation and reservation required');
 requireCondition(p['status']==='completed'||p['status']==='safely-failed'||p['status']==='unknown','INVALID_SCHEMA');
 const receiptId=p['receiptId']===null?null:nonEmptyString(p['receiptId']);
 requireCondition(p['status']!=='completed'||receiptId!==null,'CHECK_BINDING_MISMATCH','Original settled model receipt required');
 return {...identity,status:p['status'],receiptId};
}
export function initialSession(run:RunRecord):SessionState {canonicalDigest(run);return {run:structuredClone(run),sequence:0,modelResponses:[],pendingOperations:[],pendingModel:null,notification:'none',modelClaimsCompleted:false};}
/** Historical reducer has no executor, model, clock, grant or billing port. */
export function reduceSession(state:SessionState,raw:DomainEvent):SessionState {
 const event=validateEvent(raw);requireCondition(event.streamId===state.run.runId&&canonicalDigest(event.scope)===canonicalDigest(state.run.scope),'SCOPE_MISMATCH','Session history identity changed');
 requireCondition(event.sequence===state.sequence+1,'INVALID_SCHEMA','Session history gap or duplicate');
 const next=structuredClone(state),p=event.payload;
 switch(event.kind){
  case 'run-transition':next.run=transitionRun(next.run,p['to'] as RunState,p['guard'] as RunGuard);break;
  case 'model-result':next.modelResponses.push(nonEmptyString(p['response']));break;
  case 'model-pending':{
   requireCondition(next.pendingModel===null&&next.pendingOperations.length===0,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   next.pendingModel=modelOperation(p['operation']);break;
  }
  case 'model-resolved':{
   const identity=modelOperation(p['operation']);requireCondition(next.pendingModel!==null&&canonicalDigest(identity)===canonicalDigest(next.pendingModel),'CHECK_BINDING_MISMATCH');
   requireCondition(p['status']==='completed'||p['status']==='safely-failed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   requireCondition(p['proof']==='response'||p['proof']==='owner','INVALID_SCHEMA');
   requireCondition(p['proof']!=='response'||p['status']==='completed','INVALID_SCHEMA');
   const receipt=p['receiptId']===null?null:nonEmptyString(p['receiptId']);
   requireCondition(p['proof']!=='owner'||p['status']!=='completed'||receipt!==null,'CHECK_BINDING_MISMATCH');
   next.pendingModel=null;break;
  }
  case 'model-claim':requireCondition(typeof p['completed']==='boolean','INVALID_SCHEMA');next.modelClaimsCompleted=p['completed'];break;
  case 'effect-pending':{const id=nonEmptyString(p['operationId']);requireCondition(!next.pendingOperations.includes(id),'IDEMPOTENCY_CONFLICT');next.pendingOperations.push(id);break;}
  case 'effect-resolved':{const id=nonEmptyString(p['operationId']);requireCondition(next.pendingOperations.includes(id),'INVALID_SCHEMA','Unknown operation identity');requireCondition(p['outcome']==='committed'||p['outcome']==='safely-failed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');next.pendingOperations=next.pendingOperations.filter(x=>x!==id);break;}
  case 'notification':requireCondition(p['state']==='sent'||p['state']==='failed','INVALID_SCHEMA');next.notification=p['state'];break;
  default:requireCondition(false,'INVALID_SCHEMA','Unknown historical event');
 }
 next.sequence=event.sequence;return next;
}
export function replaySession(run:RunRecord,events:readonly DomainEvent[]):SessionState {return events.reduce(reduceSession,initialSession(run));}
export class SessionLoop {
 private state:SessionState;private readonly history:DomainEvent[]=[];private modelInFlight=false;
 constructor(private readonly origin:RunRecord,private readonly ports:SessionPorts){this.origin=structuredClone(origin);this.state=initialSession(this.origin);}
 inspect():SessionState {this.ports.authorize(this.state.run,'read');return structuredClone(this.state);}
 events():DomainEvent[] {this.ports.authorize(this.state.run,'read');return structuredClone(this.history);}
 restore(events:readonly DomainEvent[]):void {
  this.ports.authorize(this.origin,'read');canonicalDigest(events);
  requireCondition(events.length>=this.history.length&&this.history.every((event,index)=>canonicalDigest(event)===canonicalDigest(events[index])),'STALE_REVISION','Restore cannot remove or rewrite observed session history');
  const restored=replaySession(this.origin,events);this.ports.authorize(restored.run,'read');this.state=restored;this.history.splice(0,this.history.length,...structuredClone(events));
 }
 nextAction():'reconcile'|'finished'|'wait'|'iterate' {this.ports.authorize(this.state.run,'read');if(this.hasPending())return 'reconcile';if(isTerminal(this.state.run.state))return 'finished';return this.state.run.state==='running'?'iterate':'wait';}
 transition(to:RunState,guard:RunGuard):SessionState {this.ports.authorize(this.state.run,'write');requireCondition(!this.hasPending()||!['running','verifying','succeeded','cancelled'].includes(to),'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');this.append('run-transition',{to,guard:{...guard,currentAuthorized:true}});return this.inspect();}
 claimCompletion(completed:boolean):void {this.ports.authorize(this.state.run,'write');this.append('model-claim',{completed});}
 notify(state:'sent'|'failed'):void {this.ports.authorize(this.state.run,'write');this.append('notification',{state});}
 async callModel(input:string):Promise<string> {
  this.assertIteration();this.ports.authorize(this.state.run,'model');const text=nonEmptyString(input);
  const pending=modelOperation(this.ports.modelOperation?.(text)??{operationId:'model:'+this.state.run.runId+':'+(this.state.sequence+1),reservationId:null});
  this.append('model-pending',{operation:pending});
  try {
   this.modelInFlight=true;let response:string;
   try{response=await this.ports.model(text);}finally{this.modelInFlight=false;}
   this.ports.authorize(this.state.run,'model');
   const output=nonEmptyString(response);this.assertPendingModel(pending);
   let receiptId:string|null=null,proof:'response'|'owner'='response';
   if(this.ports.modelResolution!==undefined){
    const resolution=modelResolution(await this.ports.modelResolution(structuredClone(this.state.run),structuredClone(pending)),pending);
    this.ports.authorize(this.state.run,'model');this.assertPendingModel(pending);
    requireCondition(resolution.status==='completed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Model text cannot override unknown usage');
    receiptId=resolution.receiptId;proof='owner';
   }
   this.append('model-resolved',{operation:pending,status:'completed',receiptId,proof});
   this.assertIteration();this.append('model-result',{response:output});return output;
  } catch(error) {
   // A rejection is not proof of non-invocation. Only a trusted original-owner lookup may clear it.
   if(this.state.pendingModel!==null&&canonicalDigest(this.state.pendingModel)===canonicalDigest(pending)&&this.ports.modelResolution!==undefined){try{await this.resolveModel(pending.operationId);}catch{/* Retain unknown; original failure is returned. */}}
   throw error;
  }
 }
 async resolveModel(operationId:string):Promise<SessionModelResolution['status']> {
  this.ports.authorize(this.state.run,'write');const pending=this.state.pendingModel;
  requireCondition(!this.modelInFlight,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','An active model invocation cannot be cleared by an early absence lookup');
  requireCondition(pending!==null&&pending.operationId===nonEmptyString(operationId),'CHECK_BINDING_MISMATCH','Original pending model identity required');
  requireCondition(this.ports.modelResolution!==undefined,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Trusted current model owner lookup required');
  const result=modelResolution(await this.ports.modelResolution(structuredClone(this.state.run),structuredClone(pending)),pending);
  this.ports.authorize(this.state.run,'write');this.assertPendingModel(pending);
  if(result.status!=='unknown')this.append('model-resolved',{operation:pending,status:result.status,receiptId:result.receiptId,proof:'owner'});
  return result.status;
 }
 async dispatchEffect(operationId:string):Promise<void> {this.assertIteration();this.ports.authorize(this.state.run,'write');this.append('effect-pending',{operationId:nonEmptyString(operationId)});const outcome=await this.ports.execute(operationId);this.ports.authorize(this.state.run,'write');if(outcome!=='unknown')this.append('effect-resolved',{operationId,outcome});}
 reconcile(operationId:string,outcome:'committed'|'safely-failed'):void {this.ports.authorize(this.state.run,'write');this.append('effect-resolved',{operationId,outcome});}
 private hasPending():boolean {return this.state.pendingOperations.length>0||this.state.pendingModel!==null;}
 private assertPendingModel(pending:SessionModelOperation):void {requireCondition(this.state.pendingModel!==null&&canonicalDigest(this.state.pendingModel)===canonicalDigest(pending),'CHECK_BINDING_MISMATCH','Pending model identity changed while awaiting owner');}
 private assertIteration():void {requireCondition(this.state.run.state==='running','INVALID_SCHEMA','Session is not running');requireCondition(!this.hasPending(),'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Reconcile before model/tool continuation');}
 private append(kind:string,payload:Record<string,unknown>):void {const event:DomainEvent={schemaVersion:1,scope:structuredClone(this.state.run.scope),streamId:this.state.run.runId,sequence:this.state.sequence+1,at:this.ports.clock.now(),kind,payload};const next=reduceSession(this.state,event);this.history.push(structuredClone(event));this.state=next;}
}
