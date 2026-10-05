import type { ScopeRef, FencingToken } from '../../engine/contracts/src/identity.js';
import type { RunState } from '../../engine/scheduler/src/run-state.js';
import { LocalError, localAssert } from './errors.js';
export type { ScopeRef, FencingToken, RunState };

export const LOCAL_POLICY = Object.freeze({
  modelMode: 'deterministic-test', effectMode: 'synthetic-only',
  paidCallsAllowed: false, remoteAllowed: false,
} as const);
export type LocalPolicy = typeof LOCAL_POLICY;
export type LocalIntent = 'ask' | 'plan' | 'act';
export type TestRole = 'operator' | 'approver' | 'viewer';
export type KnownOutcome = 'completed' | 'safely-failed' | 'unknown';
export interface LocalLabels {
  modelMode: 'deterministic-test'; effectMode: 'synthetic-only';
  paidCallsAllowed: false; remoteAllowed: false;
}

function object(value: unknown): Record<string, unknown> {
  localAssert(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_SCHEMA', 'An object is required.');
  const prototype = Object.getPrototypeOf(value);
  localAssert(prototype === Object.prototype || prototype === null, 'INVALID_SCHEMA', 'A plain JSON object is required.');
  return value as Record<string, unknown>;
}
function closed(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const row = object(value);
  localAssert(required.every(k => Object.hasOwn(row, k)), 'INVALID_SCHEMA', 'Required fields are missing.');
  localAssert(Object.keys(row).every(k => required.includes(k) || optional.includes(k)), 'INVALID_SCHEMA', 'Unknown fields cannot supply authority.');
  return row;
}
function text(value: unknown, name: string, max = 16384): string {
  localAssert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, 'INVALID_SCHEMA', `${name} must be bounded nonempty text.`);
  return value;
}
function integer(value: unknown, name: string, minimum = 0): number {
  localAssert(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum, 'INVALID_SCHEMA', `${name} must be a safe integer.`);
  return value;
}
function optionalRevision(row: Record<string, unknown>): { expectedRevision?: number } {
  return Object.hasOwn(row, 'expectedRevision') ? { expectedRevision: integer(row.expectedRevision, 'expectedRevision') } : {};
}

/** This is a fixed local profile, not a switch that can later enable a supplier. */
export function validateLocalPolicy(value: unknown = {}): LocalPolicy {
  const row = object(value);
  for (const key of Object.keys(row)) {
    if (['provider', 'apiKey', 'api_key', 'baseUrl', 'gateway', 'modelRoute', 'paidRoute'].includes(key)) throw new LocalError('PAID_ROUTE_NOT_AUTHORIZED', 'Supplier routes are not authorized in G1-local.');
    if (['remoteHost', 'ssh', 'cloud', 'computer', 'localWorkerEnrollment'].includes(key)) throw new LocalError('REMOTE_NOT_AUTHORIZED', 'Computer and remote enrollment are not authorized in G1-local.');
    localAssert(Object.hasOwn(LOCAL_POLICY, key), 'LOCAL_POLICY_VIOLATION', 'Unknown local policy configuration.');
    if (key === 'paidCallsAllowed' || key === 'modelMode') localAssert(row[key] === LOCAL_POLICY[key], 'PAID_ROUTE_NOT_AUTHORIZED', 'Only the deterministic-test model is authorized.');
    else if (key === 'remoteAllowed') localAssert(row[key] === false, 'REMOTE_NOT_AUTHORIZED', 'Remote execution is disabled.');
    else localAssert(row[key] === LOCAL_POLICY.effectMode, 'LOCAL_POLICY_VIOLATION', 'Only synthetic effects are authorized.');
  }
  return LOCAL_POLICY;
}

export interface LoginRequest { username: string; password: string }
export function parseLoginRequest(value: unknown): LoginRequest {
  const row = closed(value, ['username', 'password']);
  return { username: text(row.username, 'username', 128), password: text(row.password, 'password', 512) };
}
export interface TestIdentity {
  actorId: string; tenantId: string; username: string; role: TestRole; revoked: boolean;
  /** Synthetic test identity; never a claim of SSO or enterprise authentication. */
  identityMode: 'local-test';
}
export interface LocalSession { token: string; actorId: string; expiresAt: number; revoked: boolean }
export interface LoginResponse extends LocalLabels {
  schemaVersion: 1; token: string; expiresAt: number; identity: TestIdentity;
}
export interface LocalSpace {
  scope: ScopeRef; name: string; kind: 'personal' | 'group'; payerId: string;
  ownerActorId: string; revision: number; memberships: LocalMembership[];
}
export interface LocalMembership {
  actorId: string; revision: number; revoked: boolean;
  grants: ('read' | 'ask' | 'plan' | 'simulate' | 'stop' | 'approve')[];
  readableSourceIds: string[]; shareableDestinations: string[];
}
export interface LocalSource {
  sourceId: string; scope: ScopeRef; audience: string[]; content: string;
  revision: number; deleted: boolean;
}
export interface CreateTaskRequest {
  spaceId: string; title: string; input: string; commandId: string;
  intent?: LocalIntent; sourceIds?: string[]; explicitTrigger?: boolean;
}
export function parseCreateTaskRequest(value: unknown): CreateTaskRequest {
  const row = closed(value, ['spaceId', 'title', 'input', 'commandId'], ['intent', 'sourceIds', 'explicitTrigger']);
  const result: CreateTaskRequest = {
    spaceId: text(row.spaceId, 'spaceId', 128), title: text(row.title, 'title', 256),
    input: text(row.input, 'input'), commandId: text(row.commandId, 'commandId', 256),
  };
  if (Object.hasOwn(row, 'intent')) {
    localAssert(['ask', 'plan', 'act'].includes(row.intent as string), 'INVALID_SCHEMA', 'Intent must be ask, plan, or act.');
    result.intent = row.intent as LocalIntent;
  }
  if (Object.hasOwn(row, 'sourceIds')) {
    localAssert(Array.isArray(row.sourceIds) && row.sourceIds.length <= 32, 'INVALID_SCHEMA', 'sourceIds must be a bounded identifier list.');
    result.sourceIds = row.sourceIds.map(id => text(id, 'sourceId', 128));
    localAssert(new Set(result.sourceIds).size === result.sourceIds.length, 'INVALID_SCHEMA', 'Duplicate source identifiers.');
  }
  if (Object.hasOwn(row, 'explicitTrigger')) {
    localAssert(typeof row.explicitTrigger === 'boolean', 'INVALID_SCHEMA', 'explicitTrigger must be a boolean.');
    result.explicitTrigger = row.explicitTrigger;
  }
  return result;
}

interface CommandBase { commandId: string; expectedRevision?: number }
export interface ReviseTaskCommand extends CommandBase { kind: 'reviseTask'; input: string }
export interface StartRunCommand extends CommandBase { kind: 'startRun'; planVersion: number }
/** planVersion chooses an existing immutable server binding; it does not mint an approval. */
export interface ApproveTaskCommand extends CommandBase { kind: 'approve'; planVersion: number }
export interface StopTaskCommand extends CommandBase { kind: 'stop'; scope: 'task' | 'run'; runId?: string }
export interface ReconcileTaskCommand extends CommandBase { kind: 'reconcile'; operationId: string }
export type TaskCommand = ReviseTaskCommand | StartRunCommand | ApproveTaskCommand | StopTaskCommand | ReconcileTaskCommand;
export function parseTaskCommand(value: unknown): TaskCommand {
  const raw = object(value), kind = raw.kind;
  const common = ['commandId', 'kind'], optional = ['expectedRevision'];
  if (kind === 'reviseTask') {
    const row = closed(raw, [...common, 'input'], optional);
    return { kind, commandId: text(row.commandId, 'commandId', 256), input: text(row.input, 'input'), ...optionalRevision(row) };
  }
  if (kind === 'startRun' || kind === 'approve') {
    const row = closed(raw, [...common, 'planVersion'], optional);
    return { kind, commandId: text(row.commandId, 'commandId', 256), planVersion: integer(row.planVersion, 'planVersion', 1), ...optionalRevision(row) };
  }
  if (kind === 'stop') {
    const row = closed(raw, [...common, 'scope'], [...optional, 'runId']);
    localAssert(row.scope === 'task' || row.scope === 'run', 'INVALID_SCHEMA', 'Stop binds a task or run.');
    const result: StopTaskCommand = { kind, commandId: text(row.commandId, 'commandId', 256), scope: row.scope, ...optionalRevision(row) };
    if (Object.hasOwn(row, 'runId')) result.runId = text(row.runId, 'runId', 128);
    localAssert(result.scope !== 'run' || result.runId !== undefined, 'INVALID_SCHEMA', 'Stop-run requires the immutable runId.');
    localAssert(result.scope !== 'task' || result.runId === undefined, 'INVALID_SCHEMA', 'Stop-task cannot carry a second run target.');
    return result;
  }
  if (kind === 'reconcile') {
    const row = closed(raw, [...common, 'operationId'], optional);
    return { kind, commandId: text(row.commandId, 'commandId', 256), operationId: text(row.operationId, 'operationId', 128), ...optionalRevision(row) };
  }
  throw new LocalError('INVALID_SCHEMA', 'Unsupported local command kind.');
}

export interface LocalTask extends LocalLabels {
  taskId: string; scope: ScopeRef; ownerActorId: string; payerId: string;
  title: string; input: string; intent: LocalIntent; sourceIds: string[];
  explicitTrigger: boolean; revision: number; requirementsRevision: number;
  generation: number; stopped: boolean; runIds: string[]; planVersion: number | null;
  createdAt: number; updatedAt: number;
}
export interface PlanStep { stepId: string; description: string; effect: 'none' | 'synthetic-artifact' }
export interface PlanVersion {
  taskId: string; scope: ScopeRef; version: number; requirementsRevision: number;
  inputDigest: string; steps: PlanStep[]; requiresApproval: boolean;
  approvalRequest: ExactApprovalRequest | null; createdAt: number;
  modelMode: 'deterministic-test'; effectMode: 'synthetic-only';
}
export interface ExactApprovalRequest {
  operationId: string; taskId: string; runId: string; scope: ScopeRef;
  operatorActorId: string; planVersion: number; requirementsRevision: number;
  target: string; parametersDigest: string; artifactDigest: string | null;
  policyRevision: number; expiresAt: number; bindingDigest: string;
}
export interface LocalApproval {
  approvalId: string; request: ExactApprovalRequest; approverActorId: string;
  approvedAt: number; revoked: boolean;
}
export interface LocalRun {
  runId: string; taskId: string; scope: ScopeRef; attempt: number;
  planVersion: number | null; requirementsRevision: number; state: RunState;
  revision: number; generation: number; fence: FencingToken;
  waiting: { reason: 'input' | 'approval' | 'budget' | 'permission' | 'connection' | 'unknown-effect'; nextAction: string } | null;
  modelOperationId: string | null; operationId: string | null;
  artifactId: string | null; evidenceIds: string[]; syntheticUnits: number;
}
export interface LocalOperation {
  operationId: string; taskId: string; runId: string; scope: ScopeRef;
  inputDigest: string; approvalId: string | null; reservationId: string;
  fence: FencingToken; state: 'prepared' | 'dispatched' | 'unknown' | 'committed' | 'safely-failed';
  receiptId: string | null; resolver: string | null; effectMode: 'synthetic-only';
}
export interface SyntheticReceipt {
  receiptId: string; operationId: string; scope: ScopeRef; inputDigest: string;
  outcome: 'committed' | 'safely-failed'; artifactId: string | null;
  syntheticUnits: number; recordedAt: number; effectMode: 'synthetic-only';
}
export interface LocalArtifact {
  artifactId: string; taskId: string; runId: string; scope: ScopeRef;
  version: number; digest: string; text: string; byteLength: number;
  committed: boolean; deleted: boolean; contentType: 'text/plain';
  effectMode: 'synthetic-only';
}
export interface LocalCheckReceipt {
  checkId: string; artifactDigest: string; definitionDigest: string;
  environmentDigest: string; verifierId: string; outcome: 'pass' | 'fail';
  assurance: 'local-synthetic';
}
export interface ModelOperation {
  operationId: string; taskId: string; runId: string; scope: ScopeRef;
  inputDigest: string; reservationId: string; state: 'prepared' | 'invoked' | 'unknown' | 'completed' | 'safely-failed';
  receiptId: string | null; output: string | null; modelMode: 'deterministic-test';
}
export interface ModelTestReceipt {
  receiptId: string; operationId: string; inputDigest: string;
  output: string; syntheticUnits: number; modelMode: 'deterministic-test';
}
export interface LocalReservation {
  reservationId: string; operationId: string; scope: ScopeRef;
  payerId: string; units: number; settledUnits: number;
  state: 'reserved' | 'unknown' | 'settled' | 'released'; receiptId: string | null;
}
export interface LocalBudget {
  scope: ScopeRef; payerId: string; ceiling: number; reserved: number; settled: number;
  currency: 'synthetic-units'; realSupplierCost: null;
}
export interface LocalOutboxJob {
  jobId: string; scope: ScopeRef; taskId: string; operationId: string;
  kind: 'model' | 'synthetic-effect' | 'notification';
  state: 'pending' | 'dispatching' | 'unknown' | 'completed';
}
export interface LocalCommandRecord {
  commandId: string; actorId: string; scope: ScopeRef; taskId: string;
  payloadDigest: string; response: CommandResponse;
}
export interface EventCursor { streamId: string; sequence: number; generation: number }
export interface LocalTaskEvent {
  schemaVersion: 1; scope: ScopeRef; taskId: string; sequence: number;
  generation: number; at: number; kind: string; task: TaskView;
}
export interface TaskView extends LocalLabels {
  schemaVersion: 1; task: LocalTask; plan: PlanVersion | null;
  runs: LocalRun[]; approvals: LocalApproval[]; operations: LocalOperation[];
  result: LocalArtifact | null; checks: LocalCheckReceipt[];
  authorityRevision: number; cursor: EventCursor; lastUpdate: number;
}
export type TaskSync =
  | { kind: 'snapshot'; snapshot: TaskView }
  | { kind: 'delta'; scope: ScopeRef; authorityRevision: number; events: LocalTaskEvent[]; cursor: EventCursor };
export interface StopReceipt {
  commandId: string; taskId: string; runId: string | null; generation: number;
  accepted: true; dispatchFenced: true; inFlight: 'none' | 'unknown';
  /** There is no workstation/remote process to terminate in the synthetic profile. */
  processesTerminated: null; effectMode: 'synthetic-only';
}
export interface CommandResponse extends LocalLabels {
  schemaVersion: 1; commandId: string; taskId: string;
  acceptance: 'accepted' | 'rejected' | 'requires-review';
  completion: 'pending' | 'committed' | 'unknown';
  revision: number; generation: number; reason: string | null;
  task: TaskView | null; stop: StopReceipt | null;
}
export interface HealthResponse extends LocalLabels {
  schemaVersion: 1; status: 'ready'; identityMode: 'local-test';
  store: 'sqlite-local-test'; remoteQualification: false; realBillingQualification: false;
}

/** Trusted store state is never an API response; all reads must use a filtered service view. */
export interface LocalState {
  schemaVersion: 1; authorityRevision: number;
  identities: TestIdentity[]; sessions: LocalSession[]; spaces: LocalSpace[]; sources: LocalSource[];
  tasks: LocalTask[]; plans: PlanVersion[]; runs: LocalRun[]; approvals: LocalApproval[];
  operations: LocalOperation[]; modelOperations: ModelOperation[]; reservations: LocalReservation[];
  budgets: LocalBudget[]; artifacts: LocalArtifact[]; checks: LocalCheckReceipt[];
  commands: LocalCommandRecord[]; outbox: LocalOutboxJob[]; events: LocalTaskEvent[];
  tombstones: { scope: ScopeRef; recordId: string; deletedAt: number }[];
}
export interface LocalStorePort {
  /** Synchronous callback: all owner mutations/events/outbox commit or roll back together. */
  transaction<T>(mutate: (state: LocalState) => T): T;
  snapshot(): LocalState; close(): void;
}
export interface LocalClock { now(): number }
export interface LocalIdFactory { next(kind: string): string }
export interface ModelInput { operationId: string; scope: ScopeRef; intent: LocalIntent; input: string; inputDigest: string }
export interface DeterministicModelPort {
  readonly modelMode: 'deterministic-test';
  invoke(input: ModelInput): Promise<ModelTestReceipt>;
  lookup(operationId: string, scope: ScopeRef): Promise<{ status: KnownOutcome; receipt: ModelTestReceipt | null }>;
}
export interface SyntheticEffectPort {
  readonly effectMode: 'synthetic-only';
  execute(operation: LocalOperation, request: ExactApprovalRequest): Promise<SyntheticReceipt>;
  lookup(operationId: string, scope: ScopeRef): Promise<{ status: 'found' | 'absent-safe' | 'unknown'; receipt: SyntheticReceipt | null }>;
}
export interface LocalServicePort {
  login(request: LoginRequest): LoginResponse; logout(token: string): void;
  me(token: string): TestIdentity; spaces(token: string): LocalSpace[];
  listTasks(token: string, spaceId: string): TaskView[];
  createTask(token: string, request: CreateTaskRequest): Promise<CommandResponse>;
  getTask(token: string, taskId: string): TaskView;
  command(token: string, taskId: string, command: TaskCommand): Promise<CommandResponse>;
  events(token: string, taskId: string, cursor?: EventCursor): TaskSync;
  result(token: string, taskId: string): LocalArtifact;
}
export interface LocalClientPort {
  login(request: LoginRequest): Promise<LoginResponse>; logout(): Promise<void>;
  me(): Promise<TestIdentity>; spaces(): Promise<LocalSpace[]>;
  listTasks(spaceId: string): Promise<TaskView[]>;
  createTask(request: CreateTaskRequest): Promise<CommandResponse>;
  getTask(taskId: string): Promise<TaskView>;
  command(taskId: string, command: TaskCommand): Promise<CommandResponse>;
  events(taskId: string, cursor?: EventCursor): Promise<TaskSync>;
  result(taskId: string): Promise<LocalArtifact>;
}
export const LOCAL_API_ROUTES = Object.freeze({
  health: '/v1/health', login: '/v1/sessions/login', session: '/v1/sessions/current',
  me: '/v1/me', spaces: '/v1/spaces', tasks: '/v1/tasks',
  task: '/v1/tasks/:taskId', commands: '/v1/tasks/:taskId/commands',
  events: '/v1/tasks/:taskId/events', result: '/v1/tasks/:taskId/result',
} as const);

export function parseEventCursor(value: unknown): EventCursor {
  const row = closed(value, ['streamId', 'sequence', 'generation']);
  return { streamId: text(row.streamId, 'streamId', 128), sequence: integer(row.sequence, 'sequence'), generation: integer(row.generation, 'generation') };
}
