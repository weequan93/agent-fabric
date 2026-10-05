import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import { isTerminal } from '../../engine/scheduler/src/run-state.js';
import { LOCAL_POLICY, parseCreateTaskRequest, parseTaskCommand, parseEventCursor, validateLocalPolicy, type LocalServicePort, type LocalState, type LocalTask, type LocalRun, type TaskView, type CommandResponse, type TaskCommand, type CreateTaskRequest, type LocalClock, type LocalIdFactory, type PlanVersion, type ExactApprovalRequest, type ScopeRef, type ModelTestReceipt, type SyntheticReceipt, type EventCursor, type TaskSync } from './contracts.js';
import { LocalError, localAssert } from './errors.js';
import { SQLiteStore, type Failpoint } from './store.js';
import { LocalIdentity, createSeedState, authenticate, authorizeSpace, authorizeTask } from './identity.js';
import { DeterministicTestModel } from './models.js';
import { SyntheticEffects } from './synthetic-effects.js';
export class LocalSessionService implements LocalServicePort {
    private readonly identity: LocalIdentity;
    constructor(readonly store: SQLiteStore, readonly model: DeterministicTestModel, readonly effects: SyntheticEffects, private readonly clock: LocalClock, private readonly ids: LocalIdFactory, private readonly failpoint?: Failpoint) { this.identity = new LocalIdentity(store, clock); model.guard = (id, scope) => this.guard(id, scope); effects.guard = (id, scope) => this.guard(id, scope); }
    login(input: Parameters<LocalIdentity['login']>[0]) { return this.identity.login(input); }
    logout(token: string) { this.identity.logout(token); }
    me(token: string) { return this.identity.me(token); }
    spaces(token: string) { const state = this.store.snapshot(), actor = authenticate(state, token, this.clock.now()); return state.spaces.filter(s => s.memberships.some(m => m.actorId === actor.actorId && !m.revoked && m.grants.includes('read')) && s.scope.tenantId === actor.tenantId).map(s => structuredClone(s)); }
    private task(state: LocalState, token: string, id: string, grant: Parameters<typeof authorizeTask>[3] = 'read'): LocalTask { const actor = authenticate(state, token, this.clock.now()), task = state.tasks.find(t => t.taskId === id); localAssert(task, 'UNAUTHORIZED', 'Current Task access required.'); authorizeTask(state, actor, task, grant); return task; }
    private view(state: LocalState, task: LocalTask): TaskView { const plan = state.plans.find(p => p.taskId === task.taskId && p.version === task.planVersion) ?? null; const runs = state.runs.filter(r => r.taskId === task.taskId); const artifact = state.artifacts.find(a => a.taskId === task.taskId && a.committed && !a.deleted && a.artifactId === runs.at(-1)?.artifactId && !state.tombstones.some(t => t.recordId === a.artifactId)) ?? null; return structuredClone({ schemaVersion: 1, ...LOCAL_POLICY, task, plan, runs, approvals: state.approvals.filter(a => a.request.taskId === task.taskId), operations: state.operations.filter(o => o.taskId === task.taskId), result: artifact, checks: state.checks.filter(c => c.artifactDigest === artifact?.digest), authorityRevision: state.authorityRevision, cursor: { streamId: task.taskId, sequence: state.events.filter(e => e.taskId === task.taskId).length, generation: task.generation }, lastUpdate: task.updatedAt }); }
    private emit(state: LocalState, task: LocalTask, kind: string) { task.updatedAt = this.clock.now(); const sequence = state.events.filter(e => e.taskId === task.taskId).length + 1; const view = this.view(state, task); view.cursor.sequence = sequence; state.events.push({ schemaVersion: 1, scope: task.scope, taskId: task.taskId, sequence, generation: task.generation, at: this.clock.now(), kind, task: view }); }
    getTask(token: string, id: string) { const state = this.store.snapshot(); return this.view(state, this.task(state, token, id)); }
    listTasks(token: string, spaceId: string) { const state = this.store.snapshot(), actor = authenticate(state, token, this.clock.now()); authorizeSpace(state, actor, spaceId); return state.tasks.filter(t => t.scope.spaceId === spaceId).flatMap(task => { try {
        authorizeTask(state, actor, task);
        return [this.view(state, task)];
    }
    catch {
        return [];
    } }); }
    result(token: string, id: string) { const result = this.getTask(token, id).result; localAssert(result, 'ARTIFACT_NOT_COMMITTED', 'No committed local result is available.'); localAssert(createHash('sha256').update(result.text).digest('hex') === result.digest && Buffer.byteLength(result.text) === result.byteLength, 'ARTIFACT_NOT_COMMITTED', 'Artifact bytes are incomplete.'); return result; }
    events(token: string, id: string, cursor?: EventCursor): TaskSync { const state = this.store.snapshot(), task = this.task(state, token, id), view = this.view(state, task); if (cursor) {
        const c = parseEventCursor(cursor);
        if (c.streamId === id && c.generation === task.generation && c.sequence <= view.cursor.sequence)
            return { kind: 'delta', scope: task.scope, authorityRevision: state.authorityRevision, events: state.events.filter(e => e.taskId === id && e.sequence > c.sequence).map(e => structuredClone(e)), cursor: view.cursor };
    } return { kind: 'snapshot', snapshot: view }; }
    /** Pure authorized history reconstruction: no executor or model port. */
    replay(token: string, id: string): TaskView { const state = this.store.snapshot(), task = this.task(state, token, id); let sequence = 0; for (const event of state.events.filter(e => e.taskId === id)) {
        localAssert(event.sequence === ++sequence && canonicalDigest(event.scope) === canonicalDigest(task.scope), 'CHECK_BINDING_MISMATCH', 'Historical stream is not contiguous.');
    } return this.view(state, task); }
    replayTask(token: string, id: string): TaskView { return this.replay(token, id); }
    private reserve(state: LocalState, task: LocalTask, operationId: string, units: number) { const budget = state.budgets.find(b => b.scope.spaceId === task.scope.spaceId && b.payerId === task.payerId); localAssert(budget && budget.reserved + budget.settled + units <= budget.ceiling, 'BUDGET_EXHAUSTED', 'Synthetic allowance exhausted.'); const reservationId = this.ids.next('reservation'); state.reservations.push({ reservationId, operationId, scope: task.scope, payerId: task.payerId, units, settledUnits: 0, state: 'reserved', receiptId: null }); budget.reserved += units; return reservationId; }
    private settle(state: LocalState, operationId: string, receiptId: string, units: number) { const reservation = state.reservations.find(r => r.operationId === operationId); localAssert(reservation, 'CHECK_BINDING_MISMATCH', 'Original reservation required.'); if (reservation.state === 'settled') {
        localAssert(reservation.receiptId === receiptId && reservation.settledUnits === units, 'IDEMPOTENCY_CONFLICT', 'Conflicting settlement.');
        return;
    } localAssert(units <= reservation.units, 'BUDGET_EXHAUSTED', 'Synthetic usage exceeds its reservation.'); const budget = state.budgets.find(b => b.scope.spaceId === reservation.scope.spaceId)!; budget.reserved -= reservation.units; budget.settled += units; reservation.state = 'settled'; reservation.settledUnits = units; reservation.receiptId = receiptId; }
    private newRun(state: LocalState, task: LocalTask): LocalRun { const run: LocalRun = { runId: this.ids.next('run'), taskId: task.taskId, scope: task.scope, attempt: task.runIds.length + 1, planVersion: null, requirementsRevision: task.requirementsRevision, state: 'running', revision: 0, generation: 0, fence: { taskGeneration: task.generation, runGeneration: 0, runtimeGeneration: 0 }, waiting: null, modelOperationId: null, operationId: null, artifactId: null, evidenceIds: [], syntheticUnits: 0 }; state.runs.push(run); task.runIds.push(run.runId); return run; }
    private pinnedInput(state: LocalState, task: LocalTask): string {
        if (!task.sourceIds.length) return task.input;
        const sources = task.sourceIds.map(id => {
            const source = state.sources.find(s => s.sourceId === id && !s.deleted);
            localAssert(source, 'UNAUTHORIZED', 'Current authorized source is required.');
            return { sourceId: id, revision: source.revision, content: source.content };
        });
        return task.input + '\n\nAuthorized synthetic source context:\n' + JSON.stringify(sources);
    }
    private prepareModel(state: LocalState, task: LocalTask, run: LocalRun) {
        const input = this.pinnedInput(state, task);
        const operationId = this.ids.next('model');
        const reservationId = this.reserve(state, task, operationId, Math.max(1, Math.ceil(input.length / 4)));
        run.modelOperationId = operationId;
        state.modelOperations.push({ operationId, taskId: task.taskId, runId: run.runId, scope: task.scope, inputDigest: canonicalDigest({ intent: task.intent, input }), reservationId, state: 'invoked', receiptId: null, output: null, modelMode: 'deterministic-test' });
        state.outbox.push({ jobId: this.ids.next('outbox'), scope: task.scope, taskId: task.taskId, operationId, kind: 'model', state: 'dispatching' });
    }
    private response(state: LocalState, task: LocalTask, commandId: string, acceptance: CommandResponse['acceptance'] = 'accepted', completion: CommandResponse['completion'] = 'committed'): CommandResponse { return { schemaVersion: 1, ...LOCAL_POLICY, commandId, taskId: task.taskId, acceptance, completion, revision: task.revision, generation: task.generation, reason: null, task: this.view(state, task), stop: null }; }
    private existing(state: LocalState, actorId: string, spaceId: string, commandId: string, digest: string) { const old = state.commands.find(c => c.actorId === actorId && c.scope.spaceId === spaceId && c.commandId === commandId); if (old)
        localAssert(old.payloadDigest === digest, 'IDEMPOTENCY_CONFLICT', 'Changed command cannot reuse its identifier.'); return old; }
    async createTask(token: string, input: CreateTaskRequest): Promise<CommandResponse> { const request = parseCreateTaskRequest(input); let pending: string | null = null; const response = this.store.transaction(state => { const actor = authenticate(state, token, this.clock.now()), intent = request.intent ?? 'ask'; const { space } = authorizeSpace(state, actor, request.spaceId, intent === 'ask' ? 'ask' : 'plan'); localAssert(space.kind !== 'group' || request.explicitTrigger === true, 'UNAUTHORIZED', 'Group work needs an explicit trigger.'); const digest = canonicalDigest(request), old = this.existing(state, actor.actorId, request.spaceId, request.commandId, digest); if (old) {
        this.task(state, token, old.taskId);
        return old.response;
    } const task: LocalTask = { ...LOCAL_POLICY, taskId: this.ids.next('task'), scope: space.scope, ownerActorId: actor.actorId, payerId: space.payerId, title: request.title, input: request.input, intent, sourceIds: request.sourceIds ?? [], explicitTrigger: request.explicitTrigger ?? false, revision: 0, requirementsRevision: 1, generation: 0, stopped: false, runIds: [], planVersion: null, createdAt: this.clock.now(), updatedAt: this.clock.now() }; authorizeTask(state, actor, task); state.tasks.push(task); const run = this.newRun(state, task); this.prepareModel(state, task, run); pending = run.modelOperationId; this.emit(state, task, 'model-pending'); const result = this.response(state, task, request.commandId, 'accepted', 'pending'); state.commands.push({ commandId: request.commandId, actorId: actor.actorId, scope: task.scope, taskId: task.taskId, payloadDigest: digest, response: result }); return result; }); if (pending)
        await this.invokeModel(token, pending); return this.finishResponse(token, response); }
    private finishResponse(token: string, response: CommandResponse): CommandResponse { this.store.transaction(state => { const task = this.task(state, token, response.taskId); const actor = authenticate(state, token, this.clock.now()); const row = state.commands.find(c => c.actorId === actor.actorId && c.commandId === response.commandId && c.taskId === task.taskId); if (row) {
        row.response.task = this.view(state, task);
        row.response.revision = task.revision;
        row.response.generation = task.generation;
        const models = state.modelOperations.filter(o => o.taskId === task.taskId);
        const effects = state.operations.filter(o => o.taskId === task.taskId);
        const jobs = state.outbox.filter(o => o.taskId === task.taskId);
        const unknown = models.some(o => o.state === 'unknown') || effects.some(o => o.state === 'unknown') || jobs.some(o => o.state === 'unknown');
        const pending = models.some(o => o.state === 'prepared' || o.state === 'invoked') || effects.some(o => o.state === 'prepared' || o.state === 'dispatched') || jobs.some(o => o.state === 'pending' || o.state === 'dispatching');
        row.response.completion = unknown ? 'unknown' : pending ? 'pending' : 'committed';
    } }); const state = this.store.snapshot(); return structuredClone(state.commands.find(c => c.actorId === authenticate(state, token, this.clock.now()).actorId && c.commandId === response.commandId && c.taskId === response.taskId)!.response); }
    private guard(id: string, scope: ScopeRef) { const state = this.store.snapshot(), operation = state.modelOperations.find(o => o.operationId === id) ?? state.operations.find(o => o.operationId === id); localAssert(operation && canonicalDigest(operation.scope) === canonicalDigest(scope), 'SCOPE_MISMATCH', 'Original operation scope required.'); const task = state.tasks.find(t => t.taskId === operation.taskId)!, run = state.runs.find(r => r.runId === operation.runId)!; const actor = state.identities.find(a => a.actorId === task.ownerActorId && !a.revoked); localAssert(actor, 'UNAUTHORIZED', 'Current execution identity required.'); authorizeTask(state, actor, task, operation === state.modelOperations.find(o => o.operationId === id) ? task.intent === 'ask' ? 'ask' : 'plan' : 'simulate'); if ('approvalId' in operation) {
        const approval = state.approvals.find(a => a.approvalId === operation.approvalId && !a.revoked);
        const plan = state.plans.find(p => p.taskId === task.taskId && p.version === task.planVersion);
        localAssert(plan?.inputDigest === canonicalDigest({ intent: task.intent, input: this.pinnedInput(state, task) }), 'APPROVAL_MISMATCH', 'The approved source context changed.');
        localAssert(approval && plan && plan.approvalRequest && approval.request.bindingDigest === operation.inputDigest && plan.approvalRequest.bindingDigest === operation.inputDigest && plan.requirementsRevision === task.requirementsRevision && approval.request.expiresAt > this.clock.now() && approval.request.parametersDigest === canonicalDigest({ input: task.input, planVersion: plan.version }) && approval.request.policyRevision === state.authorityRevision, 'APPROVAL_MISMATCH', 'Current exact approval and plan required.');
        const issuer = state.identities.find(a => a.actorId === approval.approverActorId && !a.revoked);
        localAssert(issuer && issuer.actorId !== task.ownerActorId, 'UNAUTHORIZED', 'Current independent approver required.');
        authorizeTask(state, issuer, task, 'approve');
    } else {
        localAssert(operation.inputDigest === canonicalDigest({ intent: task.intent, input: this.pinnedInput(state, task) }), 'CHECK_BINDING_MISMATCH', 'The original model source context changed.');
    }
    localAssert(!task.stopped && run.fence.taskGeneration === task.generation && run.fence.runGeneration === run.generation, 'STALE_FENCE', 'Old generation cannot dispatch or publish.'); }
    private unknown(id: string) { this.store.transaction(state => { const model = state.modelOperations.find(o => o.operationId === id), effect = state.operations.find(o => o.operationId === id), op = model ?? effect; if (!op || ['completed', 'committed', 'safely-failed'].includes(op.state))
        return; op.state = 'unknown'; const reservation = state.reservations.find(r => r.operationId === id); if (reservation && reservation.state !== 'settled')
        reservation.state = 'unknown'; const job = state.outbox.find(j => j.operationId === id); if (job)
        job.state = 'unknown'; const run = state.runs.find(r => r.runId === op.runId)!; if (!isTerminal(run.state))
        run.state = 'reconciling'; run.waiting = { reason: 'unknown-effect', nextAction: 'Reconcile the original owner receipt.' }; const task = state.tasks.find(t => t.taskId === op.taskId)!; task.revision++; this.emit(state, task, 'unknown'); }); }
    private async invokeModel(token: string, id: string) { const state = this.store.snapshot(), op = state.modelOperations.find(o => o.operationId === id)!; const task = this.task(state, token, op.taskId); try {
        this.guard(id, task.scope);
        const receipt = await this.model.invoke({ operationId: id, scope: task.scope, intent: task.intent, input: this.pinnedInput(state, task), inputDigest: op.inputDigest });
        await this.failpoint?.('service.before-settle');
        this.completeModel(token, id, receipt);
    }
    catch {
        this.unknown(id);
    } }
    private completeModel(token: string, id: string, receipt: ModelTestReceipt) {
        this.store.transaction(state => {
            const op = state.modelOperations.find(o => o.operationId === id)!;
            const task = this.task(state, token, op.taskId);
            this.guard(id, task.scope);
            localAssert(receipt.operationId === id && receipt.inputDigest === op.inputDigest, 'CHECK_BINDING_MISMATCH', 'Original model receipt required.');
            if (op.state === 'completed')
                return;
            this.settle(state, id, receipt.receiptId, receipt.syntheticUnits);
            op.state = 'completed';
            op.receiptId = receipt.receiptId;
            op.output = receipt.output;
            state.outbox.find(j => j.operationId === id)!.state = 'completed';
            const run = state.runs.find(r => r.runId === op.runId)!;
            run.syntheticUnits += receipt.syntheticUnits;
            const version = (task.planVersion ?? 0) + 1;
            task.planVersion = version;
            run.planVersion = version;
            const plan: PlanVersion = { taskId: task.taskId, scope: task.scope, version, requirementsRevision: task.requirementsRevision, inputDigest: op.inputDigest, steps: [{ stepId: 'step-1', description: receipt.output, effect: task.intent === 'ask' ? 'none' : 'synthetic-artifact' }], requiresApproval: task.intent !== 'ask', approvalRequest: null, createdAt: this.clock.now(), modelMode: 'deterministic-test', effectMode: 'synthetic-only' };
            if (task.intent === 'ask') {
                this.artifact(state, task, run, receipt.output, 'answer-' + id);
                run.state = 'succeeded';
                run.waiting = null;
            }
            else {
                const operationId = this.ids.next('effect');
                const binding: ExactApprovalRequest = { operationId, taskId: task.taskId, runId: run.runId, scope: task.scope, operatorActorId: task.ownerActorId, planVersion: version, requirementsRevision: task.requirementsRevision, target: 'synthetic://' + task.scope.spaceId + '/' + operationId, parametersDigest: canonicalDigest({ input: task.input, planVersion: version }), artifactDigest: null, policyRevision: state.authorityRevision, expiresAt: this.clock.now() + 300000, bindingDigest: '' };
                binding.bindingDigest = canonicalDigest({ ...binding, bindingDigest: '' });
                plan.approvalRequest = binding;
                run.operationId = operationId;
                run.state = 'waiting';
                run.waiting = { reason: 'approval', nextAction: 'A separate approver must approve this exact synthetic plan.' };
            }
            state.plans.push(plan);
            task.revision++;
            this.emit(state, task, 'model-result');
        });
    }
    private artifact(state: LocalState, task: LocalTask, run: LocalRun, text: string, id: string) { const digest = createHash('sha256').update(text).digest('hex'); if (!state.artifacts.some(a => a.artifactId === id))
        state.artifacts.push({ artifactId: id, taskId: task.taskId, runId: run.runId, scope: task.scope, version: run.attempt, digest, text, byteLength: Buffer.byteLength(text), committed: true, deleted: false, contentType: 'text/plain', effectMode: 'synthetic-only' }); run.artifactId = id; const checkId = 'check-' + id; if (!state.checks.some(c => c.checkId === checkId))
        state.checks.push({ checkId, artifactDigest: digest, definitionDigest: canonicalDigest({ check: 'synthetic-bytes-integrity', version: 1 }), environmentDigest: canonicalDigest(LOCAL_POLICY), verifierId: 'local-synthetic-verifier', outcome: 'pass', assurance: 'local-synthetic' }); run.evidenceIds.push(checkId); }
    async command(token: string, id: string, input: TaskCommand): Promise<CommandResponse> {
        const command = parseTaskCommand(input);
        let pendingModel: string | null = null, pendingEffect: string | null = null, reconcile: string | null = null;
        const response = this.store.transaction(state => {
            const actor = authenticate(state, token, this.clock.now()), task = this.task(state, token, id, command.kind === 'approve' ? 'approve' : command.kind === 'stop' ? 'stop' : 'read');
            const digest = canonicalDigest({ taskId: id, command }), old = this.existing(state, actor.actorId, task.scope.spaceId, command.commandId, digest);
            if (old)
                return old.response;
            if (command.kind !== 'stop' && command.expectedRevision !== undefined)
                localAssert(command.expectedRevision === task.revision, 'STALE_REVISION', 'Refresh current Task revision.');
            let acceptance: CommandResponse['acceptance'] = 'accepted';
            let stop: CommandResponse['stop'] = null;
            if (command.kind === 'approve') {
                localAssert(actor.role === 'approver' && actor.actorId !== task.ownerActorId, 'UNAUTHORIZED', 'A distinct current approver is required.');
                const plan = state.plans.find(p => p.taskId === id && p.version === command.planVersion);
                localAssert(plan && task.planVersion === plan.version && plan.requirementsRevision === task.requirementsRevision && plan.approvalRequest, 'APPROVAL_MISMATCH', 'Current exact plan required.');
                const request = plan.approvalRequest;
                localAssert(request.expiresAt > this.clock.now(), 'APPROVAL_EXPIRED', 'Approval request has expired.');
                state.approvals.push({ approvalId: this.ids.next('approval'), request: structuredClone(request), approverActorId: actor.actorId, approvedAt: this.clock.now(), revoked: false });
                task.revision++;
            }
            else if (command.kind === 'stop') {
                localAssert(actor.actorId === task.ownerActorId, 'UNAUTHORIZED', 'Current Task operator required.');
                const runs = state.runs.filter(r => r.taskId === id && (command.scope === 'task' || r.runId === command.runId));
                localAssert(command.scope === 'task' || runs.length === 1, 'SCOPE_MISMATCH', 'Stop-run target must belong to this Task.');
                if (command.scope === 'task') {
                    task.stopped = true;
                    task.generation++;
                }
                for (const run of runs) {
                    if (isTerminal(run.state))
                        continue;
                    run.generation++;
                    const unknown = state.modelOperations.some(o => o.runId === run.runId && ['invoked', 'unknown'].includes(o.state)) || state.operations.some(o => o.runId === run.runId && ['dispatched', 'unknown'].includes(o.state));
                    if (!isTerminal(run.state)) {
                        run.state = unknown ? 'reconciling' : 'cancelled';
                        run.waiting = unknown ? { reason: 'unknown-effect', nextAction: 'Stop fenced new dispatch; reconcile in-flight work.' } : null;
                    }
                    run.evidenceIds.push('local-stop-fence');
                }
                task.revision++;
                stop = { commandId: command.commandId, taskId: id, runId: command.runId ?? null, generation: task.generation, accepted: true, dispatchFenced: true, inFlight: runs.some(r => r.state === 'reconciling') ? 'unknown' : 'none', processesTerminated: null, effectMode: 'synthetic-only' };
            }
            else if (command.kind === 'reconcile') {
                localAssert(actor.actorId === task.ownerActorId, 'UNAUTHORIZED', 'Only the current Task operator may reconcile its original receipt.');
                const operation = state.modelOperations.find(o => o.operationId === command.operationId) ?? state.operations.find(o => o.operationId === command.operationId);
                localAssert(operation && operation.taskId === id, 'SCOPE_MISMATCH', 'Original Task operation required.');
                reconcile = command.operationId;
            }
            else {
                localAssert(actor.actorId === task.ownerActorId, 'UNAUTHORIZED', 'Only the Task operator may control requirements or dispatch.');
                authorizeTask(state, actor, task, command.kind === 'startRun' ? 'simulate' : 'plan');
                localAssert(!state.modelOperations.some(o => o.taskId === id && o.state === 'unknown') && !state.operations.some(o => o.taskId === id && o.state === 'unknown'), 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'Reconcile original unknown work first.');
                if (command.kind === 'reviseTask') {
                    localAssert(state.runs.filter(r => r.taskId === id).every(r => isTerminal(r.state) || r.state === 'waiting'), 'STALE_REVISION', 'Requirements may change only at an inactive boundary.');
                    for (const r of state.runs.filter(r => r.taskId === id && !isTerminal(r.state)))
                        r.state = 'cancelled';
                    task.input = command.input;
                    task.requirementsRevision++;
                    task.revision++;
                    task.stopped = false;
                    for (const approval of state.approvals.filter(a => a.request.taskId === id))
                        approval.revoked = true;
                    const run = this.newRun(state, task);
                    this.prepareModel(state, task, run);
                    pendingModel = run.modelOperationId;
                }
                else {
                    const plan = state.plans.find(p => p.taskId === id && p.version === command.planVersion);
                    localAssert(plan && task.planVersion === plan.version && plan.requirementsRevision === task.requirementsRevision, 'APPROVAL_MISMATCH', 'Current plan version required.');
                    const last = state.runs.filter(r => r.taskId === id).at(-1)!;
                    if (isTerminal(last.state)) {
                        task.stopped = false;
                        const run = this.newRun(state, task);
                        this.prepareModel(state, task, run);
                        pendingModel = run.modelOperationId;
                        task.revision++;
                    }
                    else {
                        localAssert(!task.stopped && plan.approvalRequest, 'STALE_FENCE', 'Stopped or unapproved work cannot dispatch.');
                        const request = plan.approvalRequest;
                        localAssert(request.expiresAt > this.clock.now(), 'APPROVAL_EXPIRED', 'Approval has expired.');
                        localAssert(request.parametersDigest === canonicalDigest({ input: task.input, planVersion: plan.version }) && request.policyRevision === state.authorityRevision, 'APPROVAL_MISMATCH', 'Plan, input or policy changed.');
                        const approval = state.approvals.find(a => !a.revoked && a.request.bindingDigest === request.bindingDigest);
                        if (!approval) {
                            acceptance = 'requires-review';
                        }
                        else {
                            const issuer = state.identities.find(a => a.actorId === approval.approverActorId && !a.revoked);
                            localAssert(issuer && issuer.actorId !== task.ownerActorId, 'UNAUTHORIZED', 'Current independent approver required.');
                            authorizeTask(state, issuer, task, 'approve');
                            localAssert(!state.operations.some(o => o.operationId === request.operationId), 'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION', 'An operation cannot be dispatched twice.');
                            const reservationId = this.reserve(state, task, request.operationId, 1);
                            state.operations.push({ operationId: request.operationId, taskId: id, runId: last.runId, scope: task.scope, inputDigest: request.bindingDigest, approvalId: approval.approvalId, reservationId, fence: structuredClone(last.fence), state: 'dispatched', receiptId: null, resolver: null, effectMode: 'synthetic-only' });
                            state.outbox.push({ jobId: this.ids.next('outbox'), scope: task.scope, taskId: id, operationId: request.operationId, kind: 'synthetic-effect', state: 'dispatching' });
                            last.state = 'running';
                            last.waiting = null;
                            task.revision++;
                            pendingEffect = request.operationId;
                        }
                    }
                }
            }
            this.emit(state, task, command.kind);
            const result = this.response(state, task, command.commandId, acceptance, pendingModel || pendingEffect || reconcile ? 'pending' : 'committed');
            result.stop = stop;
            state.commands.push({ commandId: command.commandId, actorId: actor.actorId, scope: task.scope, taskId: id, payloadDigest: digest, response: result });
            return result;
        });
        if (pendingModel)
            await this.invokeModel(token, pendingModel);
        if (pendingEffect)
            await this.invokeEffect(token, pendingEffect);
        if (reconcile)
            await this.reconcile(token, reconcile);
        return this.finishResponse(token, response);
    }
    private async invokeEffect(token: string, id: string) { try {
        const state = this.store.snapshot(), op = state.operations.find(o => o.operationId === id)!;
        this.guard(id, op.scope);
        const request = state.approvals.find(a => a.approvalId === op.approvalId)!.request;
        const receipt = await this.effects.execute(op, request);
        await this.failpoint?.('service.before-settle');
        this.completeEffect(token, id, receipt);
    }
    catch {
        this.unknown(id);
    } }
    private completeEffect(token: string, id: string, receipt: SyntheticReceipt) { this.store.transaction(state => { const op = state.operations.find(o => o.operationId === id)!; const task = this.task(state, token, op.taskId); this.guard(id, task.scope); localAssert(receipt.operationId === id && receipt.inputDigest === op.inputDigest && canonicalDigest(receipt.scope) === canonicalDigest(op.scope), 'CHECK_BINDING_MISMATCH', 'Original effect receipt required.'); if (op.state === 'committed')
        return; this.settle(state, id, receipt.receiptId, receipt.syntheticUnits); op.state = 'committed'; op.receiptId = receipt.receiptId; op.resolver = null; state.outbox.find(j => j.operationId === id)!.state = 'completed'; const run = state.runs.find(r => r.runId === op.runId)!; this.artifact(state, task, run, 'Synthetic result: ' + task.input, receipt.artifactId!); run.syntheticUnits += receipt.syntheticUnits; run.state = 'succeeded'; run.waiting = null; task.revision++; this.emit(state, task, 'effect-committed'); }); }
    private async reconcile(token: string, id: string) { const state = this.store.snapshot(), model = state.modelOperations.find(o => o.operationId === id), effect = state.operations.find(o => o.operationId === id); localAssert(model || effect, 'NOT_FOUND', 'Original operation unavailable.'); this.task(state, token, (model ?? effect)!.taskId); if (model) {
        const result = await this.model.lookup(id, model.scope);
        if (result.status === 'completed' && result.receipt && !this.reconcileWithoutPublication(token, id, result.receipt))
            this.completeModel(token, id, result.receipt);
    }
    else {
        const result = await this.effects.lookup(id, effect!.scope);
        if (result.status === 'found' && result.receipt && !this.reconcileWithoutPublication(token, id, result.receipt))
            this.completeEffect(token, id, result.receipt);
    } }

    /** Accounting for a known original receipt never grants dispatch or publication. */
    private reconcileWithoutPublication(token: string, id: string, receipt: ModelTestReceipt | SyntheticReceipt): boolean {
        const snapshot = this.store.snapshot();
        const original = snapshot.modelOperations.find(o => o.operationId === id) ?? snapshot.operations.find(o => o.operationId === id);
        localAssert(original, 'NOT_FOUND', 'The original operation is required.');
        try {
            this.guard(id, original.scope);
            return false;
        } catch (error) {
            if (!(error instanceof LocalError) || !['STALE_FENCE', 'UNAUTHORIZED', 'APPROVAL_MISMATCH', 'APPROVAL_EXPIRED', 'CHECK_BINDING_MISMATCH'].includes(error.code))
                throw error;
        }
        return this.store.transaction(state => {
            const model = state.modelOperations.find(o => o.operationId === id);
            const effect = state.operations.find(o => o.operationId === id);
            const operation = model ?? effect;
            localAssert(operation, 'NOT_FOUND', 'The original operation is required.');
            const task = this.task(state, token, operation.taskId);
            localAssert(authenticate(state, token, this.clock.now()).actorId === task.ownerActorId, 'UNAUTHORIZED', 'Current original owner is required.');
            localAssert(receipt.operationId === id && receipt.inputDigest === operation.inputDigest &&
                (!('scope' in receipt) || canonicalDigest(receipt.scope) === canonicalDigest(operation.scope)),
                'CHECK_BINDING_MISMATCH', 'Trusted original receipt binding is required.');
            if (['completed', 'committed', 'safely-failed'].includes(operation.state))
                return true;
            this.settle(state, id, receipt.receiptId, receipt.syntheticUnits);
            operation.receiptId = receipt.receiptId;
            if (model) {
                localAssert('modelMode' in receipt && receipt.modelMode === 'deterministic-test', 'CHECK_BINDING_MISMATCH', 'Test model receipt required.');
                model.state = 'completed';
                model.output = receipt.output;
            } else {
                localAssert(effect && 'effectMode' in receipt && receipt.effectMode === 'synthetic-only', 'CHECK_BINDING_MISMATCH', 'Synthetic effect receipt required.');
                effect.state = receipt.outcome === 'committed' ? 'committed' : 'safely-failed';
                effect.resolver = null;
            }
            state.outbox.find(j => j.operationId === id)!.state = 'completed';
            const run = state.runs.find(r => r.runId === operation.runId)!;
            if (!isTerminal(run.state)) {
                run.syntheticUnits += receipt.syntheticUnits;
                run.state = 'cancelled';
                run.waiting = null;
            }
            task.revision++;
            this.emit(state, task, 'receipt-reconciled-without-publication');
            return true;
        });
    }
}
export interface LocalRuntimeOptions {
    directory: string;
    clock?: LocalClock;
    ids?: LocalIdFactory;
    failpoint?: Failpoint;
    policy?: unknown;
}
export function createLocalRuntime(options: LocalRuntimeOptions) { validateLocalPolicy(options.policy ?? {}); const clock = options.clock ?? { now: () => Date.now() }, ids = options.ids ?? { next: (kind: string) => kind + '-' + randomUUID() }; const store = new SQLiteStore(join(options.directory, 'state.sqlite'), createSeedState(clock.now()), options.failpoint); const model = new DeterministicTestModel(join(options.directory, 'model-receipts.sqlite'), clock, options.failpoint); const effects = new SyntheticEffects(join(options.directory, 'effect-receipts.sqlite'), clock, options.failpoint); store.transaction(state => { for (const op of state.modelOperations.filter(o => o.state === 'invoked')) {
    op.state = 'unknown';
    state.reservations.find(r => r.operationId === op.operationId)!.state = 'unknown';
} for (const op of state.operations.filter(o => o.state === 'dispatched')) {
    op.state = 'unknown';
    state.reservations.find(r => r.operationId === op.operationId)!.state = 'unknown';
} for (const job of state.outbox.filter(j => j.state === 'dispatching'))
    job.state = 'unknown'; }); const service = new LocalSessionService(store, model, effects, clock, ids, options.failpoint); return { service, store, model, effects, close() { model.close(); effects.close(); store.close(); } }; }
