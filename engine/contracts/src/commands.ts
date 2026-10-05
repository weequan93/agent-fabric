import { canonicalDigest, requireCondition, nonEmptyString, record } from './identity.js';
import { parseScope } from './task-envelope.js';
import type { ScopeRef } from './identity.js';
export type CommandKind = 'comment' | 'reviseTask' | 'approve' | 'publish' | 'resize' | 'restore' | 'retry' | 'stop';
export interface CommandEnvelope {
 schemaVersion: 1; scope: ScopeRef; actorId: string; taskId: string; runId: string | null;
 idempotencyKey: string; kind: CommandKind; expectedRevision: number; expiresAt: number;
 payload: Record<string, unknown>;
}
export type Command = CommandEnvelope;
export interface StopCommand extends CommandEnvelope { kind: 'stop'; payload: { target: 'run' | 'task' } }
export type CommandAcceptance = { status: 'accepted'; commandId: string } | { status: 'rejected'; code: string; safeAction: string } | { status: 'requires-review'; commandId: string; reason: string };
export function validateCommand(value: CommandEnvelope): CommandEnvelope {
 canonicalDigest(value);
 const keys=['schemaVersion','scope','actorId','taskId','runId','idempotencyKey','kind','expectedRevision','expiresAt','payload'];
 requireCondition(value!==null && typeof value==='object' && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)),'INVALID_SCHEMA','Closed command envelope required');
 requireCondition(value.schemaVersion===1,'UNSUPPORTED_VERSION','Unknown command version');
 for(const s of [value.actorId,value.taskId,value.idempotencyKey])requireCondition(typeof s==='string'&&s.trim().length>0,'INVALID_SCHEMA','Command identity required');
 requireCondition(value.scope!==null&&typeof value.scope==='object'&&Object.keys(value.scope).length===2&&typeof value.scope.tenantId==='string'&&value.scope.tenantId.length>0&&typeof value.scope.spaceId==='string'&&value.scope.spaceId.length>0,'INVALID_SCHEMA','Scope required');
 parseScope(value.scope);
 requireCondition(value.runId===null || typeof value.runId==='string'&&value.runId.length>0,'INVALID_SCHEMA','Run identity invalid');
 requireCondition(['comment','reviseTask','approve','publish','resize','restore','retry','stop'].includes(value.kind),'INVALID_SCHEMA','Unknown command kind');
 requireCondition(Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>=0&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>=0,'INVALID_SCHEMA','Revision/expiry required');
 requireCondition(typeof value.payload==='object'&&value.payload!==null&&!Array.isArray(value.payload),'INVALID_SCHEMA','Complete payload required');
 if(value.kind==='stop')requireCondition(Object.keys(value.payload).length===1&&['run','task'].includes(value.payload['target'] as string),'INVALID_SCHEMA','Exact Stop target required');
 if(value.kind==='stop'&&value.payload['target']==='run')requireCondition(value.runId!==null,'INVALID_SCHEMA','Stop-run requires immutable run ID');
 const payloadFields: Record<Exclude<CommandKind,'stop'>,readonly string[]>={comment:['text'],reviseTask:['goal'],approve:['operationId','target','parametersDigest','artifactDigest','policyRevision','approvalExpiresAt'],publish:['operationId','artifactDigest','target'],resize:['runtimeId','size'],restore:['checkpointId'],retry:['reason']};
 if(value.kind!=='stop'){
  const payload=record(value.payload,payloadFields[value.kind]);
  for(const [key,field]of Object.entries(payload)){
   if(key==='artifactDigest'&&field===null)continue;
   if(key==='policyRevision'||key==='approvalExpiresAt')requireCondition(Number.isSafeInteger(field)&&Number(field)>=0,'INVALID_SCHEMA','Approval revision/expiry required');
   else nonEmptyString(field,key);
  }
 }
 canonicalDigest(value);return structuredClone(value);
}
