import { canonicalDigest, nonEmptyString, record, requireCondition, type ScopeRef } from './identity.js';
import { parseScope } from './task-envelope.js';

export interface CommandResponse {
  schemaVersion: 1; commandId: string; scope: ScopeRef; taskId: string; runId: string | null;
  acceptance: 'accepted' | 'rejected' | 'requires-review'; completion: 'pending' | 'committed' | 'unknown';
  reason: string | null; refresh: Record<string, unknown> | null;
}
export function validateCommandResponse(value: unknown): CommandResponse {
  canonicalDigest(value);
  const p = record(value, ['schemaVersion','commandId','scope','taskId','runId','acceptance','completion','reason','refresh']);
  requireCondition(p.schemaVersion === 1, 'UNSUPPORTED_VERSION', 'Explicit command-response migration required');
  requireCondition(p.acceptance === 'accepted' || p.acceptance === 'rejected' || p.acceptance === 'requires-review', 'INVALID_SCHEMA', 'Invalid command acceptance');
  requireCondition(p.completion === 'pending' || p.completion === 'committed' || p.completion === 'unknown', 'INVALID_SCHEMA', 'Invalid completion');
  requireCondition(p.acceptance === 'accepted' || p.completion === 'pending', 'INVALID_SCHEMA', 'Unaccepted commands cannot be committed or unknown');
  let refresh: Record<string, unknown> | null = null;
  if (p.refresh !== null) { requireCondition(typeof p.refresh === 'object' && !Array.isArray(p.refresh), 'INVALID_SCHEMA', 'Refresh must be an authorized object'); refresh = record(p.refresh, Object.keys(p.refresh as object)); }
  return structuredClone({ schemaVersion: 1, commandId: nonEmptyString(p.commandId), scope: parseScope(p.scope), taskId: nonEmptyString(p.taskId), runId: p.runId === null ? null : nonEmptyString(p.runId), acceptance: p.acceptance, completion: p.completion, reason: p.reason === null ? null : nonEmptyString(p.reason), refresh });
}
