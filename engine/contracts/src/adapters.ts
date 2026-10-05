import type { ScopeRef, FencingToken } from './identity.js';
import { record, nonEmptyString, requireCondition, canonicalDigest } from './identity.js';
import type { EffectClass, Intent } from './task-envelope.js';
export interface ModelCapabilities {
 provider: string; region: string; model: string; schema: boolean; cancellation: boolean; usage: boolean;
 modalities: readonly ('text' | 'image' | 'audio')[]; manifestDigest: string;
}
export interface RuntimeCapabilities {
 deployment: string; region: string; isolatedWorkspace: boolean; policyEnforcement: boolean;
 cancellation: boolean; spendAccounting: boolean; mutationPaths: readonly MutationPath[];
}
export type MutationPath = 'shell' | 'sdk' | 'api' | 'filesystem' | 'browser' | 'desktop';
export interface QualificationRef {
 qualificationId: string; deployment: string; version: string; environmentDigest: string;
 definitionDigest: string; verifierId: string; testedAt: number; expiresAt: number; capabilities: readonly string[];
}
export interface ToolDefinition {
 toolId: string; version: string; digest: string; effect: EffectClass; schemaDigest: string;
 resourceKinds: readonly string[]; requiredGrants: readonly string[]; requiredCapabilities: readonly string[];
 timeoutMs: number; maxUnits: number; reconciliation: 'lookup' | 'idempotent' | 'none';
}
export interface EffectRequest {
 operationId: string; scope: ScopeRef; actorId: string; target: string; parameters: Record<string, unknown>;
 parametersDigest: string; artifactDigest: string | null; policyRevision: number; intent: Intent;
 fence: FencingToken; reservationId: string;
}
export interface ExecutionReceipt {
 operationId: string; scope: ScopeRef; executorId: string; outcome: 'committed' | 'safely-failed';
 externalId: string | null; usageUnits: number; recordedAt: number;
}
export type ReconciliationResult = { status: 'found'; receipt: ExecutionReceipt } | { status: 'absent-safe' } | { status: 'unknown'; resolver: string };
export interface EffectExecutor {
 readonly executorId: string;
 readonly reconciliation: 'lookup' | 'idempotent' | 'none';
 execute(request: EffectRequest): Promise<ExecutionReceipt>;
 lookup(operationId: string, scope: ScopeRef): Promise<ReconciliationResult>;
}
export function parseModelCapabilities(value: unknown): ModelCapabilities {
 canonicalDigest(value);
 const c=record(value,['provider','region','model','schema','cancellation','usage','modalities','manifestDigest']);
 for(const key of ['schema','cancellation','usage']) requireCondition(typeof c[key]==='boolean','INVALID_SCHEMA','Explicit model capability required');
 requireCondition(Array.isArray(c['modalities'])&&c['modalities'].length>0&&c['modalities'].every(v=>['text','image','audio'].includes(v as string)),'REQUIRED_CAPABILITY_UNSUPPORTED','Unknown/empty modalities');
 return {provider:nonEmptyString(c['provider']),region:nonEmptyString(c['region']),model:nonEmptyString(c['model']),schema:c['schema'] as boolean,cancellation:c['cancellation'] as boolean,usage:c['usage'] as boolean,modalities:c['modalities'] as ModelCapabilities['modalities'],manifestDigest:nonEmptyString(c['manifestDigest'])};
}
export function assertRequiredCapabilities(available: readonly string[], required: readonly string[]): void {
 requireCondition(required.every(capability=>available.includes(capability)),'REQUIRED_CAPABILITY_UNSUPPORTED','Required capability unavailable; no silent downgrade');
}
