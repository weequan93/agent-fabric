import { object,uuid } from './decoder.js';
import { ModelEventSchema,ModelAttemptSchema,TaskCallBindingSchema } from './schema.js';
import { currentScope,hash } from './model-repository.js';
import { demand } from './errors.js';
import { validateEvent } from '../../engine/contracts/src/events.js';
import type { AsyncUnitOfWork,VerifiedScope } from './contracts.js';
import type { DomainEvent } from '../../engine/contracts/src/events.js';

const DeliverySchema=object({sessionId:uuid,outboxId:uuid});
/** Read-only delivery projection. Seen IDs suppress duplicate UI delivery in this
 * process only; they are never accounting, dispatch or authorization receipts.
 * A restart may redeliver. Every delivery, including a duplicate, reauthorizes. */
export class ModelEventConsumer {
 private readonly seen=new Set<string>();
 constructor(readonly uow:AsyncUnitOfWork){}
 async consume(scope:VerifiedScope,raw:{sessionId:string;outboxId:string}){
  const input=DeliverySchema.parse(raw);
  const projection=await this.uow.withScope(scope,async tx=>{
   demand(scope.grants.includes('task:read'),'UNAUTHORIZED');await currentScope(tx,scope);
   const session=(await tx.query('SELECT binding FROM fabric.model_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,input.sessionId])).rows[0];
   demand(session,'UNAUTHORIZED');const b=TaskCallBindingSchema.parse(session['binding']);demand(b.payerId===scope.payerId,'SCOPE_MISMATCH');
   const row=(await tx.query('SELECT o.outbox_id,o.audit_id,o.actor_id,o.command_key,o.payload_digest,o.record,a.kind,a.record AS audit_record,r.receipt FROM fabric.model_outbox o JOIN fabric.model_audit a USING(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) JOIN fabric.model_command_receipts r USING(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest) WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.outbox_id=$3',[scope.tenantId,scope.spaceId,input.outboxId])).rows[0];
   demand(row,'UNAUTHORIZED');
   const attempts=(await tx.query('SELECT a.attempt_id,a.record,o.operation_id FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.session_id=$3',[scope.tenantId,scope.spaceId,input.sessionId])).rows;
   const receipt=row['receipt'] as {sessionId?:string;operation?:{sessionId?:string};observation?:{original?:{attemptId?:string};receipt?:{original?:{attemptId?:string}}}};
   const attemptId=receipt.observation?.original?.attemptId??receipt.observation?.receipt?.original?.attemptId;
   demand(receipt.sessionId===input.sessionId||receipt.operation?.sessionId===input.sessionId||attempts.some(a=>a['attempt_id']===attemptId||row['command_key']==='claim:'+a['attempt_id']||String(row['command_key']).startsWith('usage:'+a['attempt_id']+':')),'SCOPE_MISMATCH');
   const events=(await tx.query('SELECT event FROM fabric.model_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[scope.tenantId,scope.spaceId,input.sessionId])).rows.map(r=>ModelEventSchema.parse(r['event']));
   for(const [i,e] of events.entries()){
    demand(e.sequence===i+1&&e.tenantId===b.tenantId&&e.spaceId===b.spaceId&&e.taskId===b.taskId&&e.runId===b.runId&&e.sessionId===b.sessionId,'CHECK_BINDING_MISMATCH');
    if(e.attemptId!==null){
     const attempt=attempts.find(a=>a['attempt_id']===e.attemptId&&a['operation_id']===e.operationId);demand(attempt,'CHECK_BINDING_MISMATCH');
     if('original' in e.payload)demand(hash(e.payload.original)===hash(ModelAttemptSchema.parse(attempt['record']).original),'CHECK_BINDING_MISMATCH');
    }
   }
   const nativeEvents=(await tx.query('SELECT event FROM fabric.model_native_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[scope.tenantId,scope.spaceId,input.sessionId])).rows.map(r=>validateEvent(r['event'] as DomainEvent));
   for(const [i,e] of nativeEvents.entries())demand(e.sequence===i+1&&e.streamId===b.runId&&e.scope.tenantId===b.tenantId&&e.scope.spaceId===b.spaceId,'CHECK_BINDING_MISMATCH');
   // Never return receipt/audit bodies, native payloads, prompts or source text.
   const result={schemaVersion:1 as const,tenantId:b.tenantId,spaceId:b.spaceId,taskId:b.taskId,runId:b.runId,sessionId:b.sessionId,
    outboxId:input.outboxId,auditId:String(row['audit_id']),actorId:String(row['actor_id']),commandKey:String(row['command_key']),payloadDigest:String(row['payload_digest']),kind:String(row['kind']),
    events,nativeEvents:nativeEvents.map(({payload:_payload,...metadata})=>metadata),replayAllowed:false as const};
   await currentScope(tx,scope);return result;
  });
  const key=JSON.stringify([scope.tenantId,scope.spaceId,scope.actorId,input.sessionId,input.outboxId]);
  const duplicate=this.seen.has(key);this.seen.add(key);
  return {duplicate,deliverySemantics:'process-local; restart may redeliver' as const,projection};
 }
}
