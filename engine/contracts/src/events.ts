import { canonicalDigest, requireCondition } from './identity.js';
import type { ScopeRef } from './identity.js';
import { parseScope } from './task-envelope.js';
export interface DomainEvent { schemaVersion: 1; scope: ScopeRef; streamId: string; sequence: number; at: number; kind: string; payload: Record<string, unknown> }
export type RunEvent = DomainEvent;
export interface EventCursor { streamId: string; sequence: number; generation: number }
export interface AuthorizedSnapshot<T> { scope: ScopeRef; authorityRevision: number; cursor: EventCursor; state: T; lastUpdate: number }
export function validateEvent(event: DomainEvent): DomainEvent {
 canonicalDigest(event);
 const keys=['schemaVersion','scope','streamId','sequence','at','kind','payload'];
 requireCondition(typeof event==='object'&&event!==null&&Object.keys(event).length===keys.length&&keys.every(k=>Object.hasOwn(event,k)),'INVALID_SCHEMA','Closed versioned event required');
 requireCondition(event.schemaVersion===1,'UNSUPPORTED_VERSION','Explicit event migration required');
 requireCondition(Number.isSafeInteger(event.sequence)&&event.sequence>0&&Number.isSafeInteger(event.at)&&event.at>=0,'INVALID_SCHEMA','Ordered event/time required');
 requireCondition(typeof event.streamId==='string'&&event.streamId.length>0&&typeof event.kind==='string'&&event.kind.length>0,'INVALID_SCHEMA','Event identity required');
 requireCondition(event.scope!==null&&typeof event.scope==='object'&&Object.keys(event.scope).length===2&&typeof event.scope.tenantId==='string'&&event.scope.tenantId.length>0&&typeof event.scope.spaceId==='string'&&event.scope.spaceId.length>0,'INVALID_SCHEMA','Event scope required');
 requireCondition(event.payload!==null&&typeof event.payload==='object'&&!Array.isArray(event.payload),'INVALID_SCHEMA','Event payload required');
 parseScope(event.scope);
 canonicalDigest(event);return structuredClone(event);
}
export function replayEvents<T>(initial: T, events: readonly DomainEvent[], reducer: (state:T,event:DomainEvent)=>T): T {
 let state=initial;let sequence=0;let stream: string|undefined;let scope:ScopeRef|undefined;
 for(const raw of events){const event=validateEvent(raw);requireCondition(event.sequence===sequence+1,'INVALID_SCHEMA','Event gap/reorder rejected');
 if(stream!==undefined)requireCondition(event.streamId===stream&&event.scope.tenantId===scope?.tenantId&&event.scope.spaceId===scope?.spaceId,'SCOPE_MISMATCH','Mixed event history denied');
 stream=event.streamId;scope=event.scope;sequence=event.sequence;state=reducer(state,event);}
 return state;
}
