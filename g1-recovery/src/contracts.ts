/** Internal controller records, not grants. Temporal owns workflow history;
 * PostgreSQL owns authority, tasks, attempts, effect ledger and command receipts.
 * Session proposals cannot issue approvals, checks or completion authority. */
import {createHash} from 'node:crypto';
import {digest, enumeration, list, nullable, object, positive, refined, revision, text, timestamp, uuid, RecoveryError, type Value} from './schema.js';
export {RecoveryError};
export const taskBindingSchema = object({tenantId: uuid, spaceId: uuid, taskId: uuid});
export type TaskBinding = Value<typeof taskBindingSchema>;
export const runBindingSchema = object({task: taskBindingSchema, runId: uuid, requirementsRevision: revision,
  engineVersion: text, behaviorVersion: text, schemaVersion: positive, environmentDigest: digest, dependencyLockDigest: digest});
export type RunBinding = Value<typeof runBindingSchema>;
export const generationSchema = object({cancellation: revision, worker: positive, resource: revision});
export type Generation = Value<typeof generationSchema>;
export const taskSchema = object({binding: taskBindingSchema, ownerId: uuid, payerId: uuid,
  revision, requirementsRevision: revision, cancellationGeneration: revision,
  intent: enumeration('ask', 'plan', 'act'), obligation: enumeration('draft', 'publish'),
  state: enumeration('open', 'waiting', 'succeeded', 'partial', 'failed', 'cancelled'),
  retries: enumeration('allowed', 'blocked'), currentRunId: nullable(uuid)});
export type Task = Value<typeof taskSchema>;
const waitFieldsSchema = object({reason: enumeration('input', 'approval', 'budget', 'resource', 'connection', 'permission', 'model'),
  ownerId: uuid, since: timestamp, expiresAt: timestamp, nextAction: enumeration('clarify', 'review-action', 'add-budget', 'wait-resource', 'reconnect', 'request-access', 'choose-model')});
export const waitSchema = refined(waitFieldsSchema, value => Date.parse(value.expiresAt) > Date.parse(value.since) && ({
  input: 'clarify', approval: 'review-action', budget: 'add-budget', resource: 'wait-resource',
  connection: 'reconnect', permission: 'request-access', model: 'choose-model'
} as const)[value.reason] === value.nextAction);
export const validWaitSchema = waitSchema;
export type Wait = Value<typeof validWaitSchema>;
export const runStates = ['queued', 'preparing', 'running', 'verifying', 'waiting', 'paused', 'cancelling', 'reconciling', 'succeeded', 'partial', 'failed', 'cancelled'] as const;
export type RunState = typeof runStates[number];
export const runSchema = refined(object({binding: runBindingSchema, revision, generation: generationSchema,
  state: enumeration(...runStates), wait: nullable(validWaitSchema), outcomeDigest: nullable(digest)}),
  value => (value.state === 'waiting') === (value.wait !== null) &&
    (['succeeded', 'partial', 'failed', 'cancelled'].includes(value.state) === (value.outcomeDigest !== null)));
export type Run = Value<typeof runSchema>;
export const sessionSchema = object({binding: runBindingSchema, sessionId: uuid, generation: generationSchema,
  role: text, modelProfile: text, toolProfile: text, contextDigest: digest, budgetReservationId: uuid,
  cursor: revision, state: enumeration('ready', 'waiting', 'interrupted', 'finished'), adapter: enumeration('deterministic-test-only')});
export type Session = Value<typeof sessionSchema>;
const effectBindingFieldsSchema = object({run: runBindingSchema, sessionId: uuid, operationId: uuid,
  target: text, resourceId: uuid, action: text, argsDigest: digest, artifactId: nullable(uuid),
  artifactVersion: nullable(positive), artifactDigest: nullable(digest), actorId: uuid, policyRevision: revision,
  audienceDigest: digest, approvalId: nullable(uuid), budgetReservationId: uuid, executionLeaseId: uuid,
  generation: generationSchema, expiresAt: timestamp,
  effectClass: enumeration('read', 'draft-write', 'external-write'), mutationPath: enumeration('api', 'sdk', 'shell', 'filesystem', 'browser', 'gui'),
  downstream: enumeration('idempotency-and-lookup', 'lookup-only', 'human-reconciliation')});
export const effectBindingSchema = refined(effectBindingFieldsSchema, value =>
  (value.artifactId === null) === (value.artifactVersion === null) && (value.artifactId === null) === (value.artifactDigest === null));
export const validEffectBindingSchema = effectBindingSchema;
export type EffectBinding = Value<typeof validEffectBindingSchema>;
export const effectStates = ['prepared', 'dispatched', 'confirmed', 'failed', 'unknown', 'reconciling', 'not-applied', 'cancelled'] as const;
export type EffectState = typeof effectStates[number];
export const effectSchema = refined(object({binding: validEffectBindingSchema, state: enumeration(...effectStates),
  receiptDigest: nullable(digest), nextAction: nullable(enumeration('lookup-original-operation', 'human-reconcile'))}),
  value => (value.state === 'confirmed') === (value.receiptDigest !== null) &&
    (['unknown', 'reconciling'].includes(value.state) === (value.nextAction !== null)) &&
    (value.nextAction === null || value.nextAction === (value.binding.downstream === 'human-reconciliation' ? 'human-reconcile' : 'lookup-original-operation')));
export type Effect = Value<typeof effectSchema>;
const commandFields = {task: taskBindingSchema, runId: nullable(uuid), commandId: uuid, idempotencyKey: uuid,
  actorId: uuid, payloadDigest: digest, expiresAt: timestamp} as const;
export const ordinaryCommandSchema = object({...commandFields, kind: enumeration('revise', 'pause', 'resume', 'retry', 'approve-effect', 'publish', 'take-control', 'return-control'), expectedRevision: revision});
// Stop binds immutable task or run and fresh authority; no progress revision precondition.
export const stopCommandSchema = refined(object({...commandFields, kind: enumeration('stop-task', 'stop-run')}),
  value => value.kind === 'stop-task' ? value.runId === null : value.runId !== null);
export type Command = Value<typeof ordinaryCommandSchema> | Value<typeof stopCommandSchema>;
export function parseCommand(value: unknown): Command {
  const kind = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'kind')?.value : null;
  return kind === 'stop-task' || kind === 'stop-run' ? stopCommandSchema.parse(value) : ordinaryCommandSchema.parse(value);
}
export const commandReceiptSchema = object({commandId: uuid, task: taskBindingSchema, runId: nullable(uuid),
  status: enumeration('accepted', 'rejected', 'requires-review'), revision, generation: generationSchema,
  timestamp, nextAction: text, effectState: enumeration('none', 'in-flight', 'unknown', 'settled'),
  dispatch: enumeration('not-fenced', 'fenced'), termination: enumeration('not-requested', 'pending', 'confirmed', 'unknown')});
export type CommandReceipt = Value<typeof commandReceiptSchema>;
export const artifactSchema = refined(object({task: taskBindingSchema, artifactId: uuid, version: positive,
  digest, baseVersion: nullable(positive), stage: enumeration('draft', 'candidate', 'accepted'),
  verification: enumeration('unchecked', 'passed', 'failed', 'unavailable'), acceptedVersion: nullable(positive)}),
  value => (value.baseVersion === null || value.baseVersion < value.version) &&
    (value.stage === 'accepted' ? value.acceptedVersion === value.version && value.verification === 'passed' : value.acceptedVersion === null));
export type Artifact = Value<typeof artifactSchema>;
export const checkSchema = object({task: taskBindingSchema, checkId: uuid, artifactId: uuid, artifactVersion: positive,
  artifactDigest: digest, environmentDigest: digest, dependencyLockDigest: digest, definitionDigest: digest,
  verifierId: uuid, status: enumeration('passed', 'failed', 'unavailable'), evidenceDigest: digest});
export type Check = Value<typeof checkSchema>;
export const deliverySchema = refined(object({task: taskBindingSchema, deliveryId: uuid, operationId: uuid,
  artifactId: uuid, artifactVersion: positive, artifactDigest: digest, target: text, audienceDigest: digest,
  approvalId: nullable(uuid), state: enumeration('requested', 'awaiting-approval', 'in-progress', 'confirmed', 'failed', 'unknown'), receiptDigest: nullable(digest)}),
  value => (value.state === 'confirmed') === (value.receiptDigest !== null) &&
    (!['in-progress', 'confirmed', 'unknown'].includes(value.state) || value.approvalId !== null));
export type Delivery = Value<typeof deliverySchema>;
export const notificationSchema = object({task: taskBindingSchema, notificationId: uuid, resultDigest: digest,
  recipientId: uuid, state: enumeration('pending', 'sent', 'failed', 'unknown'), attempts: revision,
  deepLink: refined(text, value => /^\/tasks\/[0-9a-f-]{36}$/.test(value))});
export type Notification = Value<typeof notificationSchema>;

/** Canonical hashes never depend on object property insertion order. Input is decoded JSON. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new RecoveryError('INVALID_INPUT');
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new RecoveryError('INVALID_INPUT');
      return JSON.stringify(key) + ':' + canonical(descriptor.value);
    }).join(',') + '}';
  }
  throw new RecoveryError('INVALID_INPUT');
}
export function bindingDigest(value: unknown): string { return 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex'); }
export function assertBinding(expected: unknown, actual: unknown): void {
  if (canonical(expected) !== canonical(actual)) throw new RecoveryError('BINDING_CONFLICT');
}
export function assertGeneration(current: Generation, offered: Generation): void {
  generationSchema.parse(current); generationSchema.parse(offered);
  if (canonical(current) !== canonical(offered)) throw new RecoveryError('STALE_GENERATION');
}
export function advanceGeneration(current: Generation, kind: keyof Generation): Generation {
  generationSchema.parse(current); return generationSchema.parse({...current, [kind]: current[kind] + 1});
}
const runTransitions: Readonly<Record<RunState, readonly RunState[]>> = {
  queued: ['preparing', 'cancelling'], preparing: ['running', 'waiting', 'failed', 'cancelling'],
  running: ['verifying', 'waiting', 'paused', 'failed', 'cancelling', 'reconciling'],
  verifying: ['succeeded', 'partial', 'failed', 'waiting', 'cancelling', 'reconciling'],
  waiting: ['running', 'paused', 'failed', 'cancelling', 'reconciling'],
  paused: ['running', 'cancelling', 'reconciling'], cancelling: ['cancelled', 'reconciling'],
  reconciling: ['waiting', 'paused', 'partial', 'failed', 'cancelled'], succeeded: [], partial: [], failed: [], cancelled: []
};
const effectTransitions: Readonly<Record<EffectState, readonly EffectState[]>> = {
  prepared: ['dispatched', 'cancelled'], dispatched: ['confirmed', 'failed', 'unknown'],
  unknown: ['reconciling'], reconciling: ['confirmed', 'not-applied', 'unknown'],
  confirmed: [], failed: [], 'not-applied': [], cancelled: []
};
export function assertRunTransition(from: RunState, to: RunState): void {
  enumeration(...runStates).parse(from); enumeration(...runStates).parse(to);
  if (!runTransitions[from].includes(to)) throw new RecoveryError('ILLEGAL_TRANSITION');
}
export function assertEffectTransition(from: EffectState, to: EffectState): void {
  enumeration(...effectStates).parse(from); enumeration(...effectStates).parse(to);
  if (!effectTransitions[from].includes(to)) throw new RecoveryError('ILLEGAL_TRANSITION');
}
/** Readiness is a derived view; production verifier provenance is checked by its service.
 * A notification is deliberately absent from outcome determination. */
export function resultReadiness(artifact: Artifact, checks: readonly Check[], requiredDefinitions: readonly string[]): 'draft' | 'checked' | 'accepted' {
  artifact = artifactSchema.parse(artifact); checks = list(checkSchema).parse(checks);
  for (const definition of requiredDefinitions) digest.parse(definition);
  if (artifact.verification !== 'passed' || requiredDefinitions.length === 0 || new Set(requiredDefinitions).size !== requiredDefinitions.length ||
      !requiredDefinitions.every(definition => {
        const matches = checks.filter(check => check.definitionDigest === definition);
        return matches.length === 1 && matches[0]!.status === 'passed' &&
          canonical(matches[0]!.task) === canonical(artifact.task) && matches[0]!.artifactId === artifact.artifactId &&
          matches[0]!.artifactVersion === artifact.version && matches[0]!.artifactDigest === artifact.digest;
      })) return 'draft';
  return artifact.stage === 'accepted' ? 'accepted' : 'checked';
}
export function obligationSatisfied(task: Task, artifact: Artifact, checks: readonly Check[], requiredDefinitions: readonly string[], delivery: Delivery | null): boolean {
  task = taskSchema.parse(task); assertBinding(task.binding, artifact.task);
  if (resultReadiness(artifact, checks, requiredDefinitions) === 'draft') return false;
  if (task.obligation === 'draft') return true;
  if (!delivery) return false;
  delivery = deliverySchema.parse(delivery); assertBinding(task.binding, delivery.task);
  return delivery.artifactId === artifact.artifactId && delivery.artifactVersion === artifact.version &&
    delivery.artifactDigest === artifact.digest && delivery.state === 'confirmed';
}
