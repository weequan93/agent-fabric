/** Deterministic test-only native adapter. No subprocess, provider, filesystem,
 * tool dispatch or completion authority. F04 replaces model transport separately. */
import {assertBinding, assertGeneration, bindingDigest, runBindingSchema, sessionSchema, validWaitSchema, type Session} from './contracts.js';
import {digest, enumeration, list, nullable, object, positive, refined, text, uuid, type Value, RecoveryError} from './schema.js';
export const proposalSchema = object({operationId: uuid, target: text, resourceId: uuid, action: text,
  argsDigest: digest, effectClass: enumeration('read', 'draft-write', 'external-write')});
export type Proposal = Value<typeof proposalSchema>;
export const sessionEventSchema = refined(object({binding: runBindingSchema, sessionId: uuid, sequence: positive,
  kind: enumeration('proposal', 'wait', 'answer'), proposal: nullable(proposalSchema), wait: nullable(validWaitSchema), answerDigest: nullable(digest)}),
  value => (value.kind === 'proposal') === (value.proposal !== null) &&
    (value.kind === 'wait') === (value.wait !== null) && (value.kind === 'answer') === (value.answerDigest !== null));
export type SessionEvent = Value<typeof sessionEventSchema>;
export interface NativeTestSessionAdapter {
  readonly qualification: 'deterministic-test-only';
  readonly measurements: {readonly syntheticTurns: number; readonly providerCalls: 0; readonly writeCalls: 0};
  next(session: Session, recorded: readonly SessionEvent[]): SessionEvent;
  replay(session: Session, recorded: readonly SessionEvent[]): {readonly cursor: number; readonly transcriptDigest: string};
}
function validateHistory(session: Session, history: readonly SessionEvent[]): readonly SessionEvent[] {
  sessionSchema.parse(session); const events = list(sessionEventSchema).parse(history);
  if (session.cursor !== events.length) throw new RecoveryError('BINDING_CONFLICT');
  events.forEach((event, index) => {
    assertBinding(session.binding, event.binding); assertBinding(session.sessionId, event.sessionId);
    if (event.sequence !== index + 1 || (index < events.length - 1 && event.kind === 'answer')) throw new RecoveryError('INVALID_INPUT');
  });
  return events;
}
export function createDeterministicSessionAdapter(initial: Session, tape: readonly SessionEvent[]): NativeTestSessionAdapter {
  initial = sessionSchema.parse(initial); const pinned = list(sessionEventSchema).parse(tape);
  if (!pinned.length) throw new RecoveryError('INVALID_INPUT');
  validateHistory({...initial, cursor: pinned.length}, pinned);
  let syntheticTurns = 0;
  return Object.freeze({
    qualification: 'deterministic-test-only' as const,
    get measurements() {return Object.freeze({syntheticTurns, providerCalls: 0 as const, writeCalls: 0 as const});},
    next(session: Session, recorded: readonly SessionEvent[]) {
      session = sessionSchema.parse(session); assertBinding(initial.binding, session.binding);
      assertBinding(initial.sessionId, session.sessionId); assertGeneration(initial.generation, session.generation);
      const history = validateHistory(session, recorded); assertBinding(pinned.slice(0, history.length), history);
      if (session.state !== 'ready' || history.at(-1)?.kind === 'answer') throw new RecoveryError('ILLEGAL_TRANSITION');
      const event = pinned[history.length]; if (!event) throw new RecoveryError('ILLEGAL_TRANSITION');
      syntheticTurns++; return event;
    },
    replay(session: Session, recorded: readonly SessionEvent[]) {
      assertBinding(initial.binding, session.binding); assertBinding(initial.sessionId, session.sessionId);
      const history = validateHistory(session, recorded);
      assertBinding(pinned.slice(0, history.length), history);
      return Object.freeze({cursor: history.length, transcriptDigest: bindingDigest(history)});
    }
  });
}
