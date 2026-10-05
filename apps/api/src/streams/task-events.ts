import { DomainError, canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope, type Clock, type ScopeRef } from '../../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../../engine/contracts/src/task-envelope.js';
import { validateEvent, type AuthorizedSnapshot, type DomainEvent, type EventCursor } from '../../../../engine/contracts/src/events.js';

export type StreamSync<T> = { kind: 'delta'; scope: ScopeRef; events: DomainEvent[]; cursor: EventCursor; authorityRevision: number } | { kind: 'snapshot'; snapshot: AuthorizedSnapshot<T> };
export interface EphemeralToken { scope: ScopeRef; streamId: string; token: string; at: number; committed: false }
function validateCursor(value: unknown): EventCursor {
  const c = record(value, ['streamId','sequence','generation']);
  return { streamId: nonEmptyString(c.streamId), sequence: nonNegativeInteger(c.sequence), generation: nonNegativeInteger(c.generation) };
}
function copyState<T extends Record<string, unknown>>(value: T): T { canonicalDigest(value); requireCondition(typeof value === 'object' && value !== null && !Array.isArray(value), 'INVALID_SCHEMA', 'Committed state must be an object'); record(value, Object.keys(value)); return structuredClone(value); }
/** Protocol-only deterministic stream; token output never commits task state. */
export class TaskEventStream<T extends Record<string, unknown>> {
  private readonly scope: ScopeRef; private readonly streamId: string; private generation = 0;
  private readonly events: DomainEvent[] = []; private state: T | null = null; private lastUpdate = 0;
  constructor(scope: ScopeRef, streamId: string, private readonly clock: Clock, private readonly authorize: () => number) { this.scope = parseScope(scope); this.streamId = nonEmptyString(streamId); }
  commit(state: T): DomainEvent {
    nonNegativeInteger(this.authorize(), 'authorityRevision'); const next = copyState(state); const at = nonNegativeInteger(this.clock.now());
    const event = validateEvent({ schemaVersion: 1, scope: this.scope, streamId: this.streamId, sequence: this.events.length + 1, at, kind: 'state-committed', payload: { state: next } });
    this.state = next; this.lastUpdate = at; this.events.push(event); return structuredClone(event);
  }
  read(cursor?: EventCursor): StreamSync<T> {
    const authorityRevision = nonNegativeInteger(this.authorize(), 'authorityRevision'); const head = this.cursor();
    if (cursor !== undefined) {
      const c = validateCursor(cursor);
      if (c.streamId === this.streamId && c.generation === this.generation && c.sequence <= head.sequence) return { kind: 'delta', scope: structuredClone(this.scope), events: structuredClone(this.events.slice(c.sequence)), cursor: head, authorityRevision };
    }
    requireCondition(this.state !== null, 'ARTIFACT_NOT_COMMITTED', 'No committed stream snapshot');
    return { kind: 'snapshot', snapshot: { scope: structuredClone(this.scope), authorityRevision, cursor: head, state: copyState(this.state), lastUpdate: this.lastUpdate } };
  }
  invalidateCursor(): void { nonNegativeInteger(this.authorize()); this.generation = nonNegativeInteger(this.generation + 1); }
  emitToken(token: string): EphemeralToken { nonNegativeInteger(this.authorize()); return { scope: structuredClone(this.scope), streamId: this.streamId, token: nonEmptyString(token), at: nonNegativeInteger(this.clock.now()), committed: false }; }
  private cursor(): EventCursor { return { streamId: this.streamId, sequence: this.events.length, generation: this.generation }; }
}

/** Governed client cache; reconnect never executes an unsent draft. */
export class ClientReplica<T extends Record<string, unknown>> {
  private cachedState: T | null = null; private cachedCursor: EventCursor | null = null; private authorityRevision = -1;
  private boundScope: ScopeRef | null = null; private boundStream: string | null = null;
  private highCursor: EventCursor | null = null;private revokedRevision = -1;
  unsentDraft: string | null = null;
  constructor(private readonly expectedScope?: ScopeRef, private readonly expectedStreamId?: string) { if (expectedScope !== undefined) this.expectedScope=parseScope(expectedScope);if(expectedStreamId!==undefined)nonEmptyString(expectedStreamId); }
  get state(): T | null { return this.cachedState === null ? null : copyState(this.cachedState); }
  get cursor(): EventCursor | null { return this.cachedCursor === null ? null : structuredClone(this.cachedCursor); }
  apply(sync: StreamSync<T>): void {
    canonicalDigest(sync);
    if (sync.kind === 'snapshot') {
      record(sync,['kind','snapshot']);record(sync.snapshot,['scope','authorityRevision','cursor','state','lastUpdate']);
      const s = sync.snapshot; const scope = parseScope(s.scope); const cursor = validateCursor(s.cursor); this.checkBinding(scope, cursor.streamId);
      const revision = nonNegativeInteger(s.authorityRevision); nonNegativeInteger(s.lastUpdate);
      requireCondition(revision >= this.authorityRevision, 'STALE_REVISION', 'Stale authority snapshot');
      requireCondition(revision > this.revokedRevision,'UNAUTHORIZED','Fresh authority revision required after revocation');
      requireCondition(this.highCursor === null || cursor.generation > this.highCursor.generation || (cursor.generation === this.highCursor.generation && cursor.sequence >= this.highCursor.sequence), 'STALE_REVISION', 'Stale snapshot cursor');
      this.cachedState = copyState(s.state); this.cachedCursor = cursor; this.highCursor=structuredClone(cursor);this.authorityRevision = revision; this.boundScope=scope;this.boundStream=cursor.streamId;return;
    }
    requireCondition(sync.kind === 'delta', 'INVALID_SCHEMA', 'Unsupported synchronization payload');
    record(sync,['kind','scope','events','cursor','authorityRevision']);requireCondition(Array.isArray(sync.events),'INVALID_SCHEMA');
    const scope = parseScope(sync.scope); const head = validateCursor(sync.cursor); this.checkBinding(scope, head.streamId);
    requireCondition(this.cachedCursor !== null && head.generation === this.cachedCursor.generation, 'STALE_REVISION', 'Snapshot required for new cursor generation');
    const revision = nonNegativeInteger(sync.authorityRevision); requireCondition(revision >= this.authorityRevision, 'STALE_REVISION', 'Stale authority delta');
    let state = this.cachedState === null ? null : copyState(this.cachedState); let sequence = this.cachedCursor.sequence;
    for (const raw of sync.events) {
      const event = validateEvent(raw); requireCondition(sameScope(event.scope, scope) && event.streamId === head.streamId, 'SCOPE_MISMATCH', 'Mixed synchronization stream');
      if (event.sequence <= sequence) continue;
      requireCondition(event.sequence === sequence + 1 && event.kind === 'state-committed', 'INVALID_SCHEMA', 'Synchronization gap or unsupported event');
      const payload = record(event.payload, ['state']); state = copyState(payload.state as T); sequence = event.sequence;
    }
    requireCondition(head.sequence === sequence, 'INVALID_SCHEMA', 'Delta does not reach declared cursor');
    this.cachedState = state; this.cachedCursor = head; this.highCursor=structuredClone(head);this.authorityRevision = revision;
  }
  reconnect(fetch: (cursor?: EventCursor) => StreamSync<T>): void {
    try { this.apply(fetch(this.cachedCursor === null ? undefined : structuredClone(this.cachedCursor))); }
    catch (error) { this.cachedState = null; this.cachedCursor = null;if(error instanceof DomainError&&error.code==='UNAUTHORIZED')this.revokedRevision=Math.max(this.revokedRevision,this.authorityRevision);throw error; }
  }
  private checkBinding(scope: ScopeRef, streamId: string): void {
    requireCondition(this.expectedScope === undefined || sameScope(this.expectedScope, scope), 'SCOPE_MISMATCH', 'Wrong Space snapshot');
    requireCondition(this.expectedStreamId === undefined || this.expectedStreamId === streamId, 'SCOPE_MISMATCH', 'Wrong task stream');
    requireCondition(this.cachedCursor === null || this.cachedCursor.streamId === streamId, 'SCOPE_MISMATCH', 'Replica cannot change stream');
    requireCondition(this.boundScope===null||sameScope(this.boundScope,scope),'SCOPE_MISMATCH','Replica retains immutable Space identity');
    requireCondition(this.boundStream===null||this.boundStream===streamId,'SCOPE_MISMATCH','Replica retains immutable stream identity');
  }
}
