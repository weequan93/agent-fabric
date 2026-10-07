import {artifactSchema, checkSchema, deliverySchema, effectSchema, runBindingSchema, sessionSchema, taskSchema} from '../src/contracts.js';
export const id = (n: number): string => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
export const sha = (n: number): string => 'sha256:' + n.toString(16).padStart(64, '0');
export const taskBinding = {tenantId: id(1), spaceId: id(2), taskId: id(3)};
export const runBinding = runBindingSchema.parse({task: taskBinding, runId: id(4), requirementsRevision: 1,
  engineVersion: 'g1-recovery/0.0.1', behaviorVersion: 'test/1', schemaVersion: 1, environmentDigest: sha(1), dependencyLockDigest: sha(2)});
export const generation = {cancellation: 0, worker: 1, resource: 0};
export const wait = {reason: 'approval', ownerId: id(5), since: '2026-10-06T00:00:00.000Z', expiresAt: '2026-10-07T00:00:00.000Z', nextAction: 'review-action'};
export function task() {return taskSchema.parse({binding: taskBinding, ownerId: id(5), payerId: id(6), revision: 0,
  requirementsRevision: 1, cancellationGeneration: 0, intent: 'act', obligation: 'draft', state: 'open', retries: 'allowed', currentRunId: id(4)});}
export function session() {return sessionSchema.parse({binding: runBinding, sessionId: id(7), generation,
  role: 'lead', modelProfile: 'synthetic', toolProfile: 'proposal-only', contextDigest: sha(3), budgetReservationId: id(8), cursor: 0, state: 'ready', adapter: 'deterministic-test-only'});}
export function effect() {return effectSchema.parse({binding: {run: runBinding, sessionId: id(7), operationId: id(9),
  target: 'synthetic://target/document', resourceId: id(10), action: 'write', argsDigest: sha(4), artifactId: id(11), artifactVersion: 1, artifactDigest: sha(5),
  actorId: id(5), policyRevision: 1, audienceDigest: sha(6), approvalId: id(12), budgetReservationId: id(8), executionLeaseId: id(13), generation,
  expiresAt: '2026-10-07T00:00:00.000Z', effectClass: 'external-write', mutationPath: 'api', downstream: 'idempotency-and-lookup'},
  state: 'prepared', receiptDigest: null, nextAction: null});}
export function artifact() {return artifactSchema.parse({task: taskBinding, artifactId: id(11), version: 1,
  digest: sha(5), baseVersion: null, stage: 'candidate', verification: 'passed', acceptedVersion: null});}
export function check() {return checkSchema.parse({task: taskBinding, checkId: id(14), artifactId: id(11), artifactVersion: 1,
  artifactDigest: sha(5), environmentDigest: sha(1), dependencyLockDigest: sha(2), definitionDigest: sha(7), verifierId: id(15), status: 'passed', evidenceDigest: sha(8)});}
export function delivery() {return deliverySchema.parse({task: taskBinding, deliveryId: id(16), operationId: id(9), artifactId: id(11), artifactVersion: 1, artifactDigest: sha(5),
  target: 'synthetic://target/document', audienceDigest: sha(6), approvalId: id(12), state: 'requested', receiptDigest: null});}
