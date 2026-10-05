import { canonicalDigest, nonEmptyString, requireCondition } from '../../../../engine/contracts/src/identity.js';
import type { AuthenticatedActorRef, ScopeRef, Clock, IdFactory } from '../../../../engine/contracts/src/identity.js';
import { validateCommand } from '../../../../engine/contracts/src/commands.js';
import type { CommandEnvelope } from '../../../../engine/contracts/src/commands.js';
import { validateCommandResponse, type CommandResponse } from '../../../../engine/contracts/src/command-response.js';
import { parseScope } from '../../../../engine/contracts/src/task-envelope.js';
import { ActorDirectory } from '../../../../security/identity/src/actor.js';
export interface CommandSnapshot {revision:number;state:Record<string,unknown>}
export interface CommandPorts {
 clock:Clock;ids:IdFactory;actors:ActorDirectory;
 authorize:(actor:AuthenticatedActorRef,scope:ScopeRef,taskId:string,kind:CommandEnvelope['kind']|'query')=>void;
 snapshot:(scope:ScopeRef,taskId:string)=>CommandSnapshot;
 apply:(actor:AuthenticatedActorRef,command:CommandEnvelope)=>{acceptance:'accepted'|'requires-review';completion:'pending'|'committed'|'unknown';reason?:string};
}
interface StoredCommand {command:CommandEnvelope;digest:string;response:CommandResponse}
/** Local authoritative command owner. Apply is an injected trusted controller transaction. */
export class CommandDispatcher {
 private readonly commands=new Map<string,StoredCommand>();
 constructor(private readonly ports:CommandPorts){}
 dispatch(token:string,input:CommandEnvelope):CommandResponse {
  const actor=this.ports.actors.authenticate(token),command=validateCommand(input);
  requireCondition(command.actorId===actor.actorId&&command.scope.tenantId===actor.tenantId,'UNAUTHORIZED','Client actor claims are not authentication');
  this.ports.authorize(actor,command.scope,command.taskId,command.kind);
  const key=canonicalDigest({scope:command.scope,actorId:actor.actorId,idempotencyKey:command.idempotencyKey}),digest=canonicalDigest(command);
  const prior=this.commands.get(key);if(prior){requireCondition(prior.digest===digest,'IDEMPOTENCY_CONFLICT','Changed command cannot reuse its key');this.ports.authorize(actor,command.scope,command.taskId,'query');return validateCommandResponse(prior.response);}
  const snapshot=this.ports.snapshot(command.scope,command.taskId);
  const response:CommandResponse={schemaVersion:1,commandId:this.ports.ids.next('command'),scope:structuredClone(command.scope),taskId:command.taskId,runId:command.runId,acceptance:'accepted',completion:'pending',reason:null,refresh:null};
  if(command.kind!=='stop'&&(command.expiresAt<=this.ports.clock.now()||command.expectedRevision!==snapshot.revision)){
   response.acceptance='rejected';response.reason=command.expiresAt<=this.ports.clock.now()?'EXPIRED_COMMAND':'STALE_REVISION';response.refresh=structuredClone(snapshot.state);
  }
  const row:StoredCommand={command:structuredClone(command),digest,response};this.commands.set(key,row);
  if(response.acceptance==='accepted'){
   try {const decision=this.ports.apply(actor,structuredClone(command));Object.assign(response,validateCommandResponse({...response,...decision,reason:decision.reason??null}));}
   catch {response.completion='unknown';response.reason='Reconcile command status before resubmitting';}
  }
  this.ports.authorize(actor,command.scope,command.taskId,'query');return validateCommandResponse(response);
 }
 query(token:string,scope:ScopeRef,taskId:string,idempotencyKey:string):CommandResponse|null {
  const actor=this.ports.actors.authenticate(token);parseScope(scope);nonEmptyString(taskId);nonEmptyString(idempotencyKey);
  requireCondition(actor.tenantId===scope.tenantId,'UNAUTHORIZED');this.ports.authorize(actor,scope,taskId,'query');
  const row=this.commands.get(canonicalDigest({scope,actorId:actor.actorId,idempotencyKey}));
  if(!row)return null;requireCondition(row.command.taskId===taskId,'IDEMPOTENCY_CONFLICT','Key belongs to another immutable task');return structuredClone(row.response);
 }
}
