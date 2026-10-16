/** Admission intersection. Prompt text and model selection are never authority. */
import {parseTaskEnvelope,assertVerifiedScope,type TaskEnvelope,type VerifiedScope} from './owners.js';
import {canonicalDigest} from '../../engine/contracts/src/identity.js';
export type AdmissionEffect='answer'|'source-read'|'bounded-write';
export class AdmissionError extends Error {
 constructor(readonly code:'INVALID_REQUEST'|'UNAUTHORIZED'|'INTENT_EXCEEDED'|'PERMISSION_DENIED'|'UNSUPPORTED'|'PREFLIGHT_REQUIRED'|'APPROVAL_REQUIRED'|'APPROVAL_CONFLICT'|'STALE_PREFLIGHT'|'IDEMPOTENCY_CONFLICT'|'UNKNOWN_OUTCOME'|'NOT_FOUND'){super(code);}
}
export function demand(value:unknown,code:AdmissionError['code']):asserts value {if(!value)throw new AdmissionError(code);}
export function immutable<T>(value:T):T {
 canonicalDigest(value);const copy=structuredClone(value);
 function freeze(v:unknown):void {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}}
 freeze(copy);return copy;
}
export interface AuthorityIntersection {
 readonly organization:readonly AdmissionEffect[];readonly space:readonly AdmissionEffect[];
 readonly role:readonly AdmissionEffect[];readonly tool:readonly AdmissionEffect[];
 readonly runtime:readonly AdmissionEffect[];
}
export function requireIntent(scope:VerifiedScope,raw:TaskEnvelope,effect:AdmissionEffect,intersection:AuthorityIntersection):void {
 assertVerifiedScope(scope);const envelope=parseTaskEnvelope(raw);
 demand(envelope.scope.tenantId===scope.tenantId&&envelope.scope.spaceId===scope.spaceId&&envelope.payerId===scope.payerId,'UNAUTHORIZED');
 for(const dimension of ['organization','space','role','tool','runtime'] as const)demand(intersection[dimension].includes(effect),'UNSUPPORTED');
 const mutate=effect==='bounded-write';
 demand(!mutate||(envelope.intent==='act'&&envelope.executionClass==='external-effect'&&envelope.effectCeiling.includes('write')),'INTENT_EXCEEDED');
 demand(mutate||envelope.effectCeiling.includes('model'),'INTENT_EXCEEDED');
 demand(scope.grants.includes(mutate?'target:write':effect==='source-read'?'source:read':'model:call'),'PERMISSION_DENIED');
}
