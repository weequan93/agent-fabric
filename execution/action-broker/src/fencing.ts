import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type FencingToken, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';

interface RunFence { scope: ScopeRef; taskId: string; runId: string; runtimeId: string; token: FencingToken; stopped: boolean; quarantined: boolean }
interface TaskFence { generation: number; stopped: boolean }
function key(scope: ScopeRef, id: string): string { const s = parseScope(scope); return JSON.stringify([s.tenantId,s.spaceId,nonEmptyString(id)]); }
function parseFence(value: unknown): FencingToken { const p = record(value, ['taskGeneration','runGeneration','runtimeGeneration']); return { taskGeneration: nonNegativeInteger(p.taskGeneration), runGeneration: nonNegativeInteger(p.runGeneration), runtimeGeneration: nonNegativeInteger(p.runtimeGeneration) }; }
/** Deterministic authority generations; not remote process termination proof. */
export class FenceRegistry {
  private readonly runs = new Map<string, RunFence>(); private readonly tasks = new Map<string, TaskFence>();
  private readonly runtimes = new Map<string, number>();
  private readonly runtimeScopes = new Map<string, ScopeRef>();
  private readonly retiredRuntimes = new Set<string>();
  constructor(private readonly authorize: (scope: ScopeRef) => void) {}
  register(scope: ScopeRef, taskId: string, runId: string, runtimeId: string, token: FencingToken): FencingToken {
    const s = parseScope(scope); this.authorize(s); nonEmptyString(taskId); nonEmptyString(runtimeId); const parsed = parseFence(token);
    requireCondition(!this.retiredRuntimes.has(runtimeId),'STALE_FENCE','Retired runtime cannot be admitted again');
    const bound=this.runtimeScopes.get(runtimeId);requireCondition(bound===undefined||canonicalDigest(bound)===canonicalDigest(s),'SCOPE_MISMATCH','Runtime cannot move between Spaces');
    const tid = key(s,taskId); const rid = key(s,runId); const runtime = key(s,runtimeId); const task = this.tasks.get(tid);
    requireCondition(task === undefined || (!task.stopped && task.generation === parsed.taskGeneration), 'STALE_FENCE', 'Task generation must be current and running');
    const runtimeGeneration = this.runtimes.get(runtime);
    requireCondition(runtimeGeneration === undefined || runtimeGeneration === parsed.runtimeGeneration, 'STALE_FENCE', 'Runtime generation must be current');
    const existing = this.runs.get(rid);
    requireCondition(existing === undefined || (!existing.stopped && !existing.quarantined && existing.taskId === taskId && existing.runtimeId === runtimeId && canonicalDigest(existing.token) === canonicalDigest(parsed)), 'IDEMPOTENCY_CONFLICT', 'Run binding cannot be replaced or reopened');
    if (existing !== undefined) return this.current(s,runId);
    if (task === undefined) this.tasks.set(tid,{generation:parsed.taskGeneration,stopped:false});
    if (runtimeGeneration === undefined) this.runtimes.set(runtime,parsed.runtimeGeneration);
    this.runtimeScopes.set(runtimeId,structuredClone(s));
    this.runs.set(rid,{scope:s,taskId,runId,runtimeId,token:parsed,stopped:false,quarantined:false}); return structuredClone(parsed);
  }
  current(scope: ScopeRef, runId: string): FencingToken {
    const run = this.get(scope,runId); const task = this.tasks.get(key(run.scope,run.taskId)); const runtime = this.runtimes.get(key(run.scope,run.runtimeId));
    requireCondition(task !== undefined && runtime !== undefined, 'STALE_FENCE', 'Incomplete authority generation');
    return { taskGeneration:task.generation,runGeneration:run.token.runGeneration,runtimeGeneration:runtime };
  }
  assertCurrent(scope: ScopeRef, runId: string, token: FencingToken): void {
    const run = this.get(scope,runId); const task = this.tasks.get(key(run.scope,run.taskId));
    requireCondition(!run.stopped && !run.quarantined && task !== undefined && !task.stopped && canonicalDigest(parseFence(token)) === canonicalDigest(this.current(scope,runId)), 'STALE_FENCE', 'Old or stopped execution authority denied');
  }
  stopRun(scope: ScopeRef, runId: string, quarantine = false): FencingToken {
    const run = this.get(scope,runId);if(!run.stopped)run.token = {...run.token,runGeneration:nonNegativeInteger(run.token.runGeneration + 1)}; run.stopped = true; run.quarantined ||= quarantine; return this.current(scope,runId);
  }
  stopTask(scope: ScopeRef, taskId: string): FencingToken[] {
    const s = parseScope(scope); this.authorize(s); const tid=key(s,taskId);let task=this.tasks.get(tid);if(task===undefined){task={generation:0,stopped:false};this.tasks.set(tid,task);}
    const newlyStopped=!task.stopped;if(newlyStopped)task.generation = nonNegativeInteger(task.generation + 1); task.stopped = true; const tokens:FencingToken[]=[];
    for(const run of this.runs.values()) if(key(run.scope,run.taskId)===tid) { if(newlyStopped&&!run.stopped)run.token={...run.token,runGeneration:nonNegativeInteger(run.token.runGeneration+1)};run.stopped=true;tokens.push(this.current(s,run.runId)); }
    return tokens;
  }
  allowNewAttempt(scope: ScopeRef, taskId: string): void {
    const s=parseScope(scope);this.authorize(s);const task=this.tasks.get(key(s,taskId));requireCondition(task!==undefined,'STALE_FENCE','Unknown task authority');task.stopped=false;
  }
  replaceRuntime(scope: ScopeRef, runId: string, newRuntimeId: string): FencingToken {
    const run=this.get(scope,runId);nonEmptyString(newRuntimeId);requireCondition(newRuntimeId!==run.runtimeId,'STALE_FENCE','Replacement requires a new runtime identity');
    requireCondition(!this.runtimeScopes.has(newRuntimeId),'IDEMPOTENCY_CONFLICT','Runtime identity was previously assigned');
    const old=key(run.scope,run.runtimeId);const next=nonNegativeInteger((this.runtimes.get(old)??run.token.runtimeGeneration)+1);const replacement=key(run.scope,newRuntimeId);
    requireCondition(!this.runtimes.has(replacement),'IDEMPOTENCY_CONFLICT','Do not reuse a runtime identity or credentials');
    this.retiredRuntimes.add(run.runtimeId);this.runtimes.set(old,next);this.runtimes.set(replacement,next);this.runtimeScopes.set(newRuntimeId,structuredClone(run.scope));for(const prior of this.runs.values())if(prior!==run&&key(prior.scope,prior.runtimeId)===old){prior.stopped=true;prior.quarantined=true;}run.runtimeId=newRuntimeId;run.token={...run.token,runtimeGeneration:next,runGeneration:nonNegativeInteger(run.token.runGeneration+1)};
    return this.current(scope,runId);
  }
  bumpRuntime(scope: ScopeRef, runId: string): FencingToken {
    const run=this.get(scope,runId);const id=key(run.scope,run.runtimeId);this.runtimes.set(id,nonNegativeInteger((this.runtimes.get(id)??0)+1));run.token={...run.token,runGeneration:nonNegativeInteger(run.token.runGeneration+1)};return this.current(scope,runId);
  }
  private get(scope: ScopeRef, runId: string): RunFence {
    const s=parseScope(scope);this.authorize(s);const run=this.runs.get(key(s,runId));requireCondition(run!==undefined,'STALE_FENCE','Current Run authority required');return run;
  }
}
