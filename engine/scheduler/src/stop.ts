import { canonicalDigest, requireCondition, sameScope } from '../../contracts/src/identity.js';
import type { AuthenticatedActorRef, ScopeRef, IdFactory } from '../../contracts/src/identity.js';
import { validateCommand } from '../../contracts/src/commands.js';
import type { CommandEnvelope } from '../../contracts/src/commands.js';
import { TaskRepository } from './task-state.js';
import { isTerminal } from './run-state.js';
import { ActorDirectory } from '../../../security/identity/src/actor.js';
import { FenceRegistry } from '../../../execution/action-broker/src/fencing.js';
export interface StopResponse {schemaVersion:1;commandId:string;scope:ScopeRef;taskId:string;runId:string|null;accepted:true;dispatchFenced:true;processesTerminated:boolean;externalOutcome:'known'|'unknown';quarantined:boolean;taskStopped:boolean}
export interface StopPorts {ids:IdFactory;actors:ActorDirectory;tasks:TaskRepository;fences:FenceRegistry;authorizeStop:(actor:AuthenticatedActorRef,command:CommandEnvelope)=>void;terminate:(runId:string)=>'terminated'|'unreachable'|'pending';unknownEffects:(runId:string)=>boolean}
/** Stale progress revisions never determine current Stop authority. */
export class StopService {
 private readonly receipts=new Map<string,{digest:string;commandId:string;fenced:boolean;taskRecorded:boolean;response:StopResponse|null}>();
 constructor(private readonly ports:StopPorts){}
 stop(token:string,input:CommandEnvelope):StopResponse {
  const actor=this.ports.actors.authenticate(token),command=validateCommand(input);
  requireCondition(command.kind==='stop','INVALID_SCHEMA');requireCondition(actor.actorId===command.actorId&&actor.tenantId===command.scope.tenantId,'UNAUTHORIZED');
  this.ports.authorizeStop(actor,command);const target=command.payload['target'];
  const key=canonicalDigest({scope:command.scope,actorId:actor.actorId,idempotencyKey:command.idempotencyKey});
  const digest=canonicalDigest({scope:command.scope,taskId:command.taskId,runId:command.runId,target});
  const prior=this.receipts.get(key);if(prior){requireCondition(prior.digest===digest,'IDEMPOTENCY_CONFLICT');if(prior.response!==null)return structuredClone(prior.response);}
  const task=this.ports.tasks.get(command.taskId);requireCondition(sameScope(task.scope,command.scope),'SCOPE_MISMATCH');
  const runIds=target==='task'?task.runIds:command.runId===null?[]:[command.runId];
  requireCondition(target==='task'||runIds.length===1,'INVALID_SCHEMA');
  const runs=runIds.map(id=>this.ports.tasks.getRun(id));for(const run of runs)requireCondition(run.taskId===task.taskId&&sameScope(run.scope,task.scope),'SCOPE_MISMATCH','Stop cannot retarget another attempt');
  const receipt=prior??{digest,commandId:this.ports.ids.next('stop'),fenced:false,taskRecorded:false,response:null};this.receipts.set(key,receipt);
  // The synchronous fencing owner is the dispatch barrier; no await precedes it.
  if(!receipt.fenced){if(target==='task')this.ports.fences.stopTask(task.scope,task.taskId);else this.ports.fences.stopRun(task.scope,runIds[0]!);receipt.fenced=true;}
  if(target==='task'&&!receipt.taskRecorded){if(!task.taskStopped)this.ports.tasks.stopTask(task.taskId);receipt.taskRecorded=true;}
  let terminated=true,unknown=false,quarantined=false;
  for(const run of runs){
   if(!isTerminal(run.state)&&run.state!=='cancelling'&&run.state!=='reconciling')this.ports.tasks.transition(run.runId,'cancelling',{currentAuthorized:true});
   let result:'terminated'|'unreachable'|'pending';try{result=this.ports.terminate(run.runId);}catch{result='unreachable';}
   let externalUnknown=true;try{externalUnknown=this.ports.unknownEffects(run.runId);}catch{}
   terminated=terminated&&result==='terminated';unknown=unknown||externalUnknown||result==='unreachable';
   if(result==='unreachable'){quarantined=true;this.ports.fences.stopRun(task.scope,run.runId,true);}
   const current=this.ports.tasks.getRun(run.runId);
   if(!isTerminal(current.state)&&current.state==='cancelling')this.ports.tasks.transition(run.runId,unknown||result!=='terminated'?'reconciling':'cancelled',{currentAuthorized:true,evidence:['Stop controller fence and process result'],unknownEffect:externalUnknown});
  }
  const response:StopResponse={schemaVersion:1,commandId:receipt.commandId,scope:structuredClone(task.scope),taskId:task.taskId,runId:command.runId,accepted:true,dispatchFenced:true,processesTerminated:terminated,externalOutcome:unknown?'unknown':'known',quarantined,taskStopped:target==='task'};
  receipt.response=response;return structuredClone(response);
 }
}
