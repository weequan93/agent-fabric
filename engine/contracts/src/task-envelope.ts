import { DomainError, canonicalDigest, requireCondition } from './identity.js';
import type { ScopeRef } from './identity.js';
export type Intent = 'ask' | 'plan' | 'act';
export type EffectClass = 'read' | 'model' | 'write' | 'computer';
export type ExecutionClass = 'conversation' | 'computer' | 'external-effect';
export interface VersionPins { engine: string; schema: string; behavior: string; environment: string }
export interface SourceRef { sourceId: string; scope: ScopeRef; audience: string[]; trust: 'trusted' | 'untrusted'; observedAt: number }
export interface TargetRef { resourceId: string; scope: ScopeRef; kind: string }
export interface TaskEnvelope {
 schemaVersion: 1; scope: ScopeRef; taskId: string; requirementsRevision: number; intent: Intent;
 executionClass: ExecutionClass; effectCeiling: EffectClass[]; sources: SourceRef[]; targets: TargetRef[];
 payerId: string; allowanceId: string; ceilingUnits: number; continuation: 'never' | 'safe';
 requiredChecks: string[]; versions: VersionPins; groupTrigger: boolean;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
 canonicalDigest(value);
 requireCondition(typeof value === 'object' && value !== null && !Array.isArray(value), 'INVALID_SCHEMA', 'Expected complete object');
 const row = value as Record<string, unknown>;
 requireCondition(Object.keys(row).length === keys.length && keys.every(k => Object.hasOwn(row,k)), 'INVALID_SCHEMA', 'Missing or unknown field');
 requireCondition(Object.keys(row).every(k => keys.includes(k)), 'INVALID_SCHEMA', 'Unknown field');
 return row;
}
function text(value: unknown): string { requireCondition(typeof value === 'string' && value.trim().length > 0 && value.trim()===value, 'INVALID_SCHEMA', 'Nonempty trimmed string required'); return value as string; }
function number(value: unknown): number { requireCondition(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'INVALID_SCHEMA', 'Nonnegative safe integer required'); return value as number; }
function choice<T extends string>(value: unknown, choices: readonly T[]): T { requireCondition(choices.includes(value as T), 'INVALID_SCHEMA', 'Unsupported choice'); return value as T; }
function list<T>(value: unknown, convert: (item: unknown) => T): T[] { requireCondition(Array.isArray(value), 'INVALID_SCHEMA', 'Array required'); return (value as unknown[]).map(convert); }
export function parseScope(value: unknown): ScopeRef { const s=object(value,['tenantId','spaceId']); return {tenantId:text(s['tenantId']),spaceId:text(s['spaceId'])}; }
export function parseVersionPins(value: unknown): VersionPins { const v=object(value,['engine','schema','behavior','environment']); return {engine:text(v['engine']),schema:text(v['schema']),behavior:text(v['behavior']),environment:text(v['environment'])}; }
export function parseTaskEnvelope(value: unknown): TaskEnvelope {
 canonicalDigest(value); // Reject accessors/non-JSON before reading security fields.
 const e=object(value,['schemaVersion','scope','taskId','requirementsRevision','intent','executionClass','effectCeiling','sources','targets','payerId','allowanceId','ceilingUnits','continuation','requiredChecks','versions','groupTrigger']);
 if(e['schemaVersion']!==1) throw new DomainError('UNSUPPORTED_VERSION','Only schema version 1 is supported; explicit migration required');
 requireCondition(typeof e['groupTrigger']==='boolean','INVALID_SCHEMA','Trigger must be explicit');
 const sources=list(e['sources'],item=>{const s=object(item,['sourceId','scope','audience','trust','observedAt']); const audience=list(s['audience'],text); requireCondition(audience.length>0,'INVALID_SCHEMA','Source audience required'); return {sourceId:text(s['sourceId']),scope:parseScope(s['scope']),audience,trust:choice(s['trust'],['trusted','untrusted'] as const),observedAt:number(s['observedAt'])};});
 const targets=list(e['targets'],item=>{const t=object(item,['resourceId','scope','kind']);return {resourceId:text(t['resourceId']),scope:parseScope(t['scope']),kind:text(t['kind'])};});
 const out: TaskEnvelope={schemaVersion:1,scope:parseScope(e['scope']),taskId:text(e['taskId']),requirementsRevision:number(e['requirementsRevision']),intent:choice(e['intent'],['ask','plan','act']),executionClass:choice(e['executionClass'],['conversation','computer','external-effect']),effectCeiling:list(e['effectCeiling'],v=>choice(v,['read','model','write','computer'])),sources,targets,payerId:text(e['payerId']),allowanceId:text(e['allowanceId']),ceilingUnits:number(e['ceilingUnits']),continuation:choice(e['continuation'],['never','safe']),requiredChecks:list(e['requiredChecks'],text),versions:parseVersionPins(e['versions']),groupTrigger:e['groupTrigger'] as boolean};
 requireCondition(out.intent==='act' || out.executionClass==='conversation','INTENT_EXCEEDED','Ask/Plan cannot admit computer or external effect');
 requireCondition(out.intent==='act' || out.effectCeiling.every(v=>v==='read'||v==='model'),'INTENT_EXCEEDED','Intent ceiling cannot include mutations');
 if(out.executionClass!=='conversation')requireCondition(targets.length>0,'INVALID_SCHEMA','Explicit effect target required');
 canonicalDigest(out); return out;
}
export function serializeTaskEnvelope(value: TaskEnvelope): string { return JSON.stringify(parseTaskEnvelope(value)); }
export function assertVersionCompatible(pinned: VersionPins, available: VersionPins): void {
 parseVersionPins(pinned); parseVersionPins(available);
 requireCondition(canonicalDigest(pinned)===canonicalDigest(available),'REQUIRED_CAPABILITY_UNSUPPORTED','Explicit version validation boundary required');
}
