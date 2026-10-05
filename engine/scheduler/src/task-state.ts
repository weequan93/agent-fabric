import { nonEmptyString, nonNegativeInteger, record, requireCondition, type AuthenticatedActorRef, type ScopeRef } from '../../contracts/src/identity.js';
import { parseScope, type VersionPins } from '../../contracts/src/task-envelope.js';
import { createRun, isTerminal, transitionRun, type RunGuard, type RunRecord, type RunState } from './run-state.js';

export interface TaskRecord {
  scope: ScopeRef; taskId: string; actor: AuthenticatedActorRef; goal: string;
  requirementsRevision: number; revision: number; generation: number; runIds: string[]; taskStopped: boolean;
}
export interface CreateTaskInput { scope: ScopeRef; taskId: string; actor: AuthenticatedActorRef; goal: string; requirementsRevision: number }
export interface StartRunOptions { versions: VersionPins; explicitRetry?: boolean }
/** Authoritative deterministic owner, with current authorization on every call. */
export class TaskRepository {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly runs = new Map<string, RunRecord>();
  constructor(private readonly authorize: (scope: ScopeRef) => void) {}
  create(input: CreateTaskInput): TaskRecord {
    const scope = parseScope(input.scope); this.authorize(scope); const taskId = nonEmptyString(input.taskId);
    const actorInput = record(input.actor, ['actorId', 'tenantId']);
    requireCondition(actorInput.tenantId === scope.tenantId, 'SCOPE_MISMATCH', 'Task actor belongs to this tenant');
    const actor = { tenantId: nonEmptyString(actorInput.tenantId), actorId: nonEmptyString(actorInput.actorId) };
    requireCondition(!this.tasks.has(taskId), 'IDEMPOTENCY_CONFLICT', 'Task identity is immutable');
    const task: TaskRecord = { scope, taskId, actor, goal: nonEmptyString(input.goal), requirementsRevision: nonNegativeInteger(input.requirementsRevision), revision: 0, generation: 0, runIds: [], taskStopped: false };
    this.tasks.set(taskId, structuredClone(task)); return structuredClone(task);
  }
  get(taskId: string): TaskRecord { return structuredClone(this.current(taskId)); }
  revise(taskId: string, goal: string, expectedRevision: number): TaskRecord {
    const task = this.current(taskId); nonNegativeInteger(expectedRevision);
    requireCondition(task.revision === expectedRevision, 'STALE_REVISION', 'Refresh current task before revision');
    requireCondition(task.runIds.every(id => isTerminal(this.runs.get(id)!.state)), 'INVALID_SCHEMA', 'Revise requirements only at an inactive boundary');
    task.goal = nonEmptyString(goal); task.requirementsRevision = nonNegativeInteger(task.requirementsRevision + 1); task.revision = nonNegativeInteger(task.revision + 1);
    return structuredClone(task);
  }
  startRun(taskId: string, runId: string, options: StartRunOptions): RunRecord {
    const task = this.current(taskId); nonEmptyString(runId);
    requireCondition(!this.runs.has(runId), 'IDEMPOTENCY_CONFLICT', 'New attempt requires a unique Run identity');
    requireCondition(task.runIds.every(id => isTerminal(this.runs.get(id)!.state)), 'INVALID_SCHEMA', 'Task already has an active attempt');
    requireCondition(!task.taskStopped || options.explicitRetry === true, 'UNAUTHORIZED', 'Stop-task requires an explicit authorized retry');
    const run = createRun({ scope: task.scope, taskId, runId, attempt: task.runIds.length + 1, requirementsRevision: task.requirementsRevision, versions: options.versions, generation: task.generation });
    task.taskStopped = false; task.runIds.push(runId); task.revision = nonNegativeInteger(task.revision + 1); this.runs.set(runId, run);
    return structuredClone(run);
  }
  getRun(runId: string): RunRecord {
    const run = this.runs.get(nonEmptyString(runId)); requireCondition(run !== undefined, 'UNAUTHORIZED', 'Current Run authority required');
    this.authorize(run.scope); return structuredClone(run);
  }
  transition(runId: string, to: RunState, guard: RunGuard = {}): RunRecord {
    const current = this.getRun(runId); const task = this.current(current.taskId);
    requireCondition(!task.taskStopped || !['preparing','running','verifying'].includes(to), 'STALE_FENCE', 'Stopped task cannot resume execution');
    const result = transitionRun(current, to, guard); this.runs.set(runId, result); return structuredClone(result);
  }
  stopTask(taskId: string): TaskRecord {
    const task = this.current(taskId); task.taskStopped = true; task.generation = nonNegativeInteger(task.generation + 1); task.revision = nonNegativeInteger(task.revision + 1); return structuredClone(task);
  }
  private current(taskId: string): TaskRecord {
    const task = this.tasks.get(nonEmptyString(taskId)); requireCondition(task !== undefined, 'UNAUTHORIZED', 'Current Task authority required');
    this.authorize(task.scope); return task;
  }
}
