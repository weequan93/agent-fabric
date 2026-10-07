import {randomUUID} from 'node:crypto';
import {FoundationError, type AsyncUnitOfWork, type SqlTransaction, type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import {CurrentAudienceVerifier} from '../../g1-identity/src/audience.js';
import type {ExactApprovalBinding, ScopeBindingLookup} from '../../g1-identity/src/contracts.js';
import {assertBinding, assertGeneration, assertRunTransition, bindingDigest, effectSchema, runSchema, sessionSchema, generationSchema, runBindingSchema, type Effect, type Run, type Session} from './contracts.js';
import {sessionEventSchema, type SessionEvent} from './test-session.js';
import {digest, object, positive, revision, timestamp, uuid, nullable, text, type Value} from './schema.js';
import {lockSpaceBarrier,assertRunUnfenced} from './fence-guard.js';
export const leaseSchema = object({leaseId: uuid, binding: runBindingSchema, generation: generationSchema, expiresAt: timestamp, revokedAt: nullable(timestamp)});
export type Lease = Value<typeof leaseSchema>;
export const resultSchema = object({resultDigest: digest, summary: text});
export type ResultRecord = Value<typeof resultSchema>;
export const mutationSchema = object({commandId: uuid, key: uuid, runId: uuid, expectedRevision: revision, expiresAt: timestamp, payloadDigest: digest});
export type Mutation = Value<typeof mutationSchema>;
export const receiptSchema = object({commandId: uuid, runId: uuid, revision: positive, payloadDigest: digest, outboxId: uuid});
export type Receipt = Value<typeof receiptSchema>;
export type Lookup = {status: 'committed'; receipt: Receipt} | {status: 'absent-safe'} | {status: 'unknown'; nextAction: 'lookup-original-key-no-replay'};
export interface Snapshot {run: Run; sessions: Session[]; leases: Lease[]; effects: Effect[]; result: ResultRecord | null}
const unknownLookup = (): Lookup => ({status: 'unknown', nextAction: 'lookup-original-key-no-replay'});
export function recoveryLockKey(scope: VerifiedScope, key: string): string {return JSON.stringify(['fabric.recovery_receipts', scope.tenantId, scope.spaceId, scope.actorId, key]);}
export class RecoveryRepository {
 constructor(readonly uow: AsyncUnitOfWork, readonly bindingFor: ScopeBindingLookup) {}
 private scoped(scope: VerifiedScope, binding: Run['binding']): void {
  if (scope.tenantId !== binding.task.tenantId || scope.spaceId !== binding.task.spaceId) throw new FoundationError('UNAUTHORIZED');
 }
 private async lockKey(tx: SqlTransaction, scope: VerifiedScope, key: string): Promise<void> {
  try {await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [recoveryLockKey(scope, key)]);}
  catch {throw new FoundationError('UNKNOWN_COMMIT', 'Original command unresolved; look up original key, never replay');}
 }
 private async receipt(tx: SqlTransaction, scope: VerifiedScope, key: string, payloadDigest: string): Promise<Receipt | null> {
  const r = (await tx.query('SELECT payload_digest,receipt FROM fabric.recovery_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4', [scope.tenantId, scope.spaceId, scope.actorId, key])).rows[0];
  if (!r) return null;
  if (r.payload_digest !== payloadDigest) throw new FoundationError('IDEMPOTENCY_CONFLICT');
  return receiptSchema.parse(r.receipt);
 }
 private async live(tx: SqlTransaction, expires: string): Promise<void> {
  if ((await tx.query('SELECT $1::timestamptz>clock_timestamp() AS live', [expires])).rows[0]?.live !== true) throw new FoundationError('STALE_AUTHORITY', 'Expired recovery command or lease');
 }
 private async target(tx: SqlTransaction, scope: VerifiedScope, run: Run): Promise<void> {
  this.scoped(scope, run.binding);
  const row = (await tx.query('SELECT t.revision,t.cancellation_generation,r.requirement_revision,r.task_id FROM fabric.tasks t JOIN fabric.runs r USING(tenant_id,space_id,task_id) WHERE t.tenant_id=$1 AND t.space_id=$2 AND t.task_id=$3 AND r.run_id=$4 FOR SHARE OF t,r', [scope.tenantId, scope.spaceId, run.binding.task.taskId, run.binding.runId])).rows[0];
  if (!row || Number(row.revision) !== run.binding.requirementsRevision || Number(row.requirement_revision) !== run.binding.requirementsRevision || Number(row.cancellation_generation) !== run.generation.cancellation) throw new FoundationError('STALE_AUTHORITY');
 }
 private async budget(tx: SqlTransaction, runId: string, reservationId: string, cost: number): Promise<void> {
  revision.parse(cost);
  if ((await tx.query('SELECT fabric.recovery_budget_current($1,$2,$3) AS valid', [reservationId, runId, cost])).rows[0]?.valid !== true) throw new FoundationError('UNAUTHORIZED', 'Current reservation and available budget required');
 }
 /** Trusted controller boundary only. There is no public SQL/pool parameter. */
 private async mutate(scope: VerifiedScope, input: Mutation, payload: unknown, work: (tx: SqlTransaction, prior: Run | null) => Promise<Run>, afterWrites?: (tx: SqlTransaction) => Promise<void>, beforeReceipt?: (tx: SqlTransaction, prior: Run | null) => Promise<void>,externalRecovery=false): Promise<Receipt> {
  const m = mutationSchema.parse(input);
  if (m.payloadDigest !== bindingDigest(payload)) throw new FoundationError('INVALID_INPUT');
  return this.uow.withScope(scope, async tx => {
   if (!scope.grants.includes('task:write')) throw new FoundationError('UNAUTHORIZED');
   await this.lockKey(tx, scope, m.key);
   if(await lockSpaceBarrier(tx,scope))await assertRunUnfenced(tx,scope,m.runId,undefined,undefined,undefined,externalRecovery);
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['recovery-run', scope.tenantId, scope.spaceId, m.runId])]);
   const row = (await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE', [scope.tenantId, scope.spaceId, m.runId])).rows[0];
   const prior = row ? runSchema.parse(row.record) : null;
   await beforeReceipt?.(tx, prior);
   const old = await this.receipt(tx, scope, m.key, m.payloadDigest); if (old) return old;
   if ((prior?.revision ?? 0) !== m.expectedRevision) throw new FoundationError('REVISION_CONFLICT');
   await this.live(tx, m.expiresAt);
   const next = runSchema.parse(await work(tx, prior));
   if (next.binding.runId !== m.runId || next.revision !== m.expectedRevision + 1) throw new FoundationError('INVALID_INPUT');
   await this.target(tx, scope, next);
   if (prior) assertBinding(prior.binding, next.binding);
   const ids = [scope.tenantId, scope.spaceId, m.runId];
   if (!prior) await tx.query('INSERT INTO fabric.recovery_runs(tenant_id,space_id,run_id,task_id,binding,record,revision) VALUES($1,$2,$3,$4,$5,$6,$7)', [...ids, next.binding.task.taskId, JSON.stringify(next.binding), JSON.stringify(next), next.revision]);
   else await tx.query('UPDATE fabric.recovery_runs SET record=$4,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3', [...ids, JSON.stringify(next), next.revision]);
   const receipt = receiptSchema.parse({commandId: m.commandId, runId: m.runId, revision: next.revision, payloadDigest: m.payloadDigest, outboxId: randomUUID()});
   await tx.query('INSERT INTO fabric.recovery_receipts(tenant_id,space_id,actor_id,command_key,command_id,run_id,payload_digest,receipt,outbox_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [scope.tenantId, scope.spaceId, scope.actorId, m.key, m.commandId, m.runId, m.payloadDigest, JSON.stringify(receipt), receipt.outboxId]);
   await tx.query("INSERT INTO fabric.recovery_outbox(tenant_id,space_id,outbox_id,actor_id,command_key,run_id,kind,payload,authority_revision) VALUES($1,$2,$3,$4,$5,$6,'recovery-checkpoint',$7,$8)", [scope.tenantId, scope.spaceId, receipt.outboxId, scope.actorId, m.key, m.runId, JSON.stringify(receipt), scope.authorityRevision]);
   await afterWrites?.(tx);
   // Late expiry after every write must still roll the whole transaction back.
   await this.live(tx, m.expiresAt);
   return receipt;
  });
 }
 async initialize(scope: VerifiedScope, m: Mutation, value: {run: Run; session: Session; lease: Lease}): Promise<Receipt> {
  const run = runSchema.parse(value.run), session = sessionSchema.parse(value.session), lease = leaseSchema.parse(value.lease);
  const payload = {run, session, lease};
  return this.mutate(scope, m, payload, async (tx, prior) => {
   if (prior || run.revision !== 1 || run.state !== 'preparing' || session.cursor !== 0 || session.state !== 'ready' || lease.revokedAt !== null) throw new FoundationError('REVISION_CONFLICT');
   await this.target(tx, scope, run); assertBinding(run.binding, session.binding); assertBinding(run.binding, lease.binding);
   assertGeneration(run.generation, session.generation); assertGeneration(run.generation, lease.generation);
   await this.live(tx, lease.expiresAt); await this.budget(tx, m.runId, session.budgetReservationId, 0);
   for (const [table, key, record] of [['sessions', session.sessionId, session], ['leases', lease.leaseId, lease]] as const) {
    await tx.query(`INSERT INTO fabric.recovery_${table}(tenant_id,space_id,${table === 'sessions' ? 'session_id' : 'lease_id'},run_id,binding,record) VALUES($1,$2,$3,$4,$5,$6)`, [scope.tenantId, scope.spaceId, key, m.runId, JSON.stringify(record.binding), JSON.stringify(record)]);
   }
   return run;
  }, async tx => {await this.live(tx, lease.expiresAt); await this.budget(tx, m.runId, session.budgetReservationId, 0);});
 }
 async checkpoint(scope: VerifiedScope, m: Mutation, value: {run: Run; session: Session; result: ResultRecord | null}): Promise<Receipt> {
  const run = runSchema.parse(value.run), session = sessionSchema.parse(value.session), result = value.result === null ? null : resultSchema.parse(value.result);
  let leaseExpiry = '';
  return this.mutate(scope, m, {run, session, result}, async (tx, prior) => {
   if (!prior) throw new FoundationError('REVISION_CONFLICT');
   // The installed result profile owns ALL terminal/result writes. Its atomic
   // finish path verifies obligations/checks/delivery and persists Task, outcome
   // and notification intents together. Migration4-only fixtures retain their
   // legacy primitive; a full-profile attempt cannot opt out by omitting config.
   if ((result !== null || run.outcomeDigest !== null || ['succeeded','partial','failed','cancelled'].includes(run.state)) &&
       (await tx.query("SELECT to_regclass('fabric.recovery_result_tasks') IS NOT NULL AS installed")).rows[0]?.installed === true)
    throw new FoundationError('STALE_AUTHORITY','Qualified atomic result completion required');
   assertGeneration(prior.generation, run.generation); assertGeneration(run.generation, session.generation); assertBinding(prior.binding, run.binding); assertBinding(run.binding, session.binding);
   if (prior.state !== run.state) assertRunTransition(prior.state, run.state);
   else if (['succeeded','partial','failed','cancelled'].includes(prior.state)) throw new FoundationError('REVISION_CONFLICT');
   const ids = [scope.tenantId, scope.spaceId, session.sessionId];
   const old = (await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 FOR UPDATE', ids)).rows[0];
   if (!old) throw new FoundationError('STALE_AUTHORITY');
   const original = sessionSchema.parse(old.record); assertGeneration(original.generation, run.generation);
   assertBinding({...original, cursor: 0, state: 'ready', generation: run.generation}, {...session, cursor: 0, state: 'ready'});
   if (session.cursor < original.cursor || session.cursor > original.cursor + 1) throw new FoundationError('REVISION_CONFLICT');
   const leases = (await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE', [scope.tenantId, scope.spaceId, m.runId])).rows;
   if (leases.length !== 1) throw new FoundationError('STALE_AUTHORITY');
   const lease = leaseSchema.parse(leases[0]!.record); leaseExpiry = lease.expiresAt; assertGeneration(run.generation, lease.generation);
   if (lease.revokedAt !== null) throw new FoundationError('STALE_AUTHORITY'); await this.live(tx, lease.expiresAt);
   await this.budget(tx, m.runId, session.budgetReservationId, 0);
   if ((run.outcomeDigest !== null) !== (result !== null) || (result && run.outcomeDigest !== result.resultDigest)) throw new FoundationError('INVALID_INPUT');
   await tx.query('UPDATE fabric.recovery_sessions SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3', [...ids, JSON.stringify(session)]);
   if (result) await tx.query('INSERT INTO fabric.recovery_results(tenant_id,space_id,run_id,record) VALUES($1,$2,$3,$4)', [scope.tenantId, scope.spaceId, m.runId, JSON.stringify(result)]);
   await this.live(tx, lease.expiresAt); return run;
  }, async tx => {await this.live(tx, leaseExpiry); await this.budget(tx, m.runId, session.budgetReservationId, 0);});
 }
 async prepareEffect(scope: VerifiedScope, m: Mutation, effectValue: Effect, approval: ExactApprovalBinding, cost: number): Promise<Receipt> {
  const effect = effectSchema.parse(effectValue); revision.parse(cost);
  const b = effect.binding; let leaseExpiry = '';
  const revalidate = async (tx: SqlTransaction): Promise<void> => {
   await new CurrentAudienceVerifier().verify(tx, scope, approval.sourceAudience);
   const approved = (await tx.query('SELECT requester_id,request_identity,approver_id,approver_identity FROM fabric.exact_approvals WHERE tenant_id=$1 AND space_id=$2 AND approval_id=$3', [scope.tenantId, scope.spaceId, b.approvalId])).rows[0]!;
   const parties = [{actorId: approved.requester_id, grant: 'task:write', identity: approved.request_identity, human: false}, {actorId: approved.approver_id, grant: 'approval:approve', identity: approved.approver_identity, human: true}, {actorId: scope.actorId, grant: 'task:write', identity: this.bindingFor(scope), human: false}];
   if ((await tx.query('SELECT fabric.identity_parties_current($1::jsonb) AS valid', [JSON.stringify(parties)])).rows[0]?.valid !== true) throw new FoundationError('UNAUTHORIZED');
   await this.live(tx, b.expiresAt); await this.live(tx, leaseExpiry);
   const current = (await tx.query('SELECT fabric.identity_target_current($1,$2,$3) AS current', [b.target, b.run.task.taskId, m.runId])).rows[0]?.current as Record<string, unknown> | null;
   if (!current || Number(current.policyRevision) !== b.policyRevision || Number(current.artifactVersion) !== b.artifactVersion || current.argsDigest !== b.argsDigest || Number(current.requirementsRevision) !== b.run.requirementsRevision || Number(current.runRequirementsRevision) !== b.run.requirementsRevision) throw new FoundationError('STALE_AUTHORITY');
   await this.budget(tx, m.runId, b.budgetReservationId, cost);
  };
  return this.mutate(scope, m, {effect, approval, cost}, async (tx, prior) => {
   if (!prior || prior.state !== 'running' || effect.state !== 'prepared') throw new FoundationError('STALE_AUTHORITY');
   const intent = (await tx.query('SELECT requirements FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR SHARE', [scope.tenantId, scope.spaceId, prior.binding.task.taskId])).rows[0]?.requirements as Record<string, unknown> | undefined;
   if (intent?.intent !== 'act') throw new FoundationError('UNAUTHORIZED');
   const b = effect.binding; this.scoped(scope, b.run); assertBinding(prior.binding, b.run); assertGeneration(prior.generation, b.generation);
   if(b.mutationPath!=='api')throw new FoundationError('UNAUTHORIZED','This qualified external adapter is loopback API only');
   if(await lockSpaceBarrier(tx,scope))await assertRunUnfenced(tx,scope,m.runId,b.resourceId);
   if (b.actorId !== scope.actorId || b.policyRevision !== scope.authorityRevision || b.effectClass !== 'external-write' || b.approvalId === null) throw new FoundationError('UNAUTHORIZED');
   assertBinding({tenantId: b.run.task.tenantId, spaceId: b.run.task.spaceId, taskId: b.run.task.taskId, runId: m.runId, operationId: b.operationId, target: b.target, action: b.action, argsDigest: b.argsDigest, artifactVersion: b.artifactVersion, policyRevision: b.policyRevision, requirementsRevision: b.run.requirementsRevision, expiresAt: b.expiresAt}, {tenantId: approval.tenantId, spaceId: approval.spaceId, taskId: approval.taskId, runId: approval.runId, operationId: approval.operationId, target: approval.target, action: approval.action, argsDigest: approval.argsDigest, artifactVersion: approval.artifactVersion, policyRevision: approval.policyRevision, requirementsRevision: approval.requirementsRevision, expiresAt: approval.expiresAt});
   if (b.audienceDigest !== approval.sourceAudience.revisionDigest || cost > approval.limits.maxCostMicrounits) throw new FoundationError('UNAUTHORIZED');
   const sessionRow = (await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 FOR SHARE', [scope.tenantId, scope.spaceId, b.sessionId])).rows[0];
   if (!sessionRow) throw new FoundationError('STALE_AUTHORITY'); const session = sessionSchema.parse(sessionRow.record); assertBinding(session.binding, prior.binding); assertGeneration(session.generation, prior.generation);
   if (session.budgetReservationId !== b.budgetReservationId) throw new FoundationError('UNAUTHORIZED');
   const leaseRow = (await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND lease_id=$3 FOR SHARE', [scope.tenantId, scope.spaceId, b.executionLeaseId])).rows[0];
   if (!leaseRow) throw new FoundationError('STALE_AUTHORITY'); const lease = leaseSchema.parse(leaseRow.record); leaseExpiry = lease.expiresAt; assertBinding(lease.binding, prior.binding); assertGeneration(lease.generation, prior.generation);
   if (lease.revokedAt !== null) throw new FoundationError('STALE_AUTHORITY'); await this.live(tx, lease.expiresAt);
   await this.budget(tx, m.runId, b.budgetReservationId, cost);
   // Compose F02's exact approval inside this SAME F01 transaction, never a nested commit.
   const approvals = new ExactApprovalRepository({uow: {withScope: async (s, work) => {if (s !== scope) throw new FoundationError('UNAUTHORIZED'); return work(tx);}}, bindingFor: this.bindingFor});
   await approvals.consume(scope, {approvalId: b.approvalId, idempotencyKey: b.operationId, binding: approval});
   await tx.query('INSERT INTO fabric.recovery_operations(tenant_id,space_id,operation_id,run_id,binding,record) VALUES($1,$2,$3,$4,$5,$6)', [scope.tenantId, scope.spaceId, b.operationId, m.runId, JSON.stringify(b), JSON.stringify(effect)]);
   await revalidate(tx);
   return {...prior, revision: prior.revision + 1};
  }, revalidate);
 }
 /** All worker I/O passes this locked, current-authenticated controller boundary. */
 private async nativeCurrent(tx: SqlTransaction, scope: VerifiedScope, run: Run | null, sessionId: string, workerGeneration: number): Promise<{session: Session; lease: Lease}> {
  if (!run) throw new FoundationError('STALE_AUTHORITY');
  positive.parse(workerGeneration); uuid.parse(sessionId);
  if(run.generation.worker!==workerGeneration)throw new FoundationError('STALE_AUTHORITY','Old native worker fenced');
  await this.target(tx,scope,run);
  const ids=[scope.tenantId,scope.spaceId,run.binding.runId];
  const row=(await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 AND session_id=$4 FOR UPDATE',[...ids,sessionId])).rows[0];
  if(!row)throw new FoundationError('STALE_AUTHORITY');
  const session=sessionSchema.parse(row.record);assertGeneration(run.generation,session.generation);
  const rows=(await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE',ids)).rows;
  if(rows.length!==1)throw new FoundationError('STALE_AUTHORITY');
  const lease=leaseSchema.parse(rows[0]!.record);assertGeneration(run.generation,lease.generation);
  if(lease.revokedAt!==null)throw new FoundationError('STALE_AUTHORITY');
  await this.live(tx,lease.expiresAt);await this.budget(tx,run.binding.runId,session.budgetReservationId,1);
  return {session,lease};
 }
 async replaceWorker(scope: VerifiedScope,m: Mutation,value: {sessionId: string; previousWorker: number; nextWorker: number}): Promise<Receipt> {
  let expiry='';let reservation='';
  return this.mutate(scope,m,value,async(tx,prior)=>{
   const {session,lease}=await this.nativeCurrent(tx,scope,prior,value.sessionId,value.previousWorker);
   if(!prior || !['preparing','running','reconciling','paused'].includes(prior.state) || value.nextWorker!==value.previousWorker+1)throw new FoundationError('STALE_AUTHORITY');
   const generation={...prior.generation,worker:value.nextWorker};expiry=lease.expiresAt;reservation=session.budgetReservationId;
   await tx.query('UPDATE fabric.recovery_sessions SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,session.sessionId,JSON.stringify({...session,generation})]);
   await tx.query('UPDATE fabric.recovery_leases SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND lease_id=$3',[scope.tenantId,scope.spaceId,lease.leaseId,JSON.stringify({...lease,generation})]);
   return {...prior,generation,revision:prior.revision+1};
  },async tx=>{await this.live(tx,expiry);await this.budget(tx,m.runId,reservation,1);},undefined,true);
 }
 /** Response/event and cursor plus command receipt/outbox are one durable commit.
  * The callback is the bounded test-only model adapter. External effects may not
  * run here; they require the distinct effect protocol, never activity retry. */
 async nativeCheckpoint(scope: VerifiedScope,m: Mutation,value: {sessionId: string; sequence: number},workerGeneration: number,model: (session: Session,history: readonly SessionEvent[])=>SessionEvent): Promise<Receipt> {
  let expiry='';let reservation='';
  return this.mutate(scope,m,value,async(tx,prior)=>{
   const {session,lease}=await this.nativeCurrent(tx,scope,prior,value.sessionId,workerGeneration);
   if(!prior || !['preparing','running'].includes(prior.state) || session.state!=='ready' || value.sequence!==session.cursor+1)throw new FoundationError('STALE_AUTHORITY');
   const history=(await tx.query('SELECT record FROM fabric.recovery_session_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[scope.tenantId,scope.spaceId,session.sessionId])).rows.map(r=>sessionEventSchema.parse(r.record));
   const event=sessionEventSchema.parse(model(session,history));
   assertBinding(session.binding,event.binding);assertBinding(session.sessionId,event.sessionId);
   if(event.sequence!==value.sequence || event.kind==='wait')throw new FoundationError('INVALID_INPUT');
   await tx.query('INSERT INTO fabric.recovery_session_events(tenant_id,space_id,session_id,run_id,sequence,record) VALUES($1,$2,$3,$4,$5,$6)',[scope.tenantId,scope.spaceId,session.sessionId,m.runId,event.sequence,JSON.stringify(event)]);
   await tx.query('UPDATE fabric.recovery_sessions SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[scope.tenantId,scope.spaceId,session.sessionId,JSON.stringify({...session,cursor:event.sequence,state:event.kind==='answer'?'finished':'ready'})]);
   expiry=lease.expiresAt;reservation=session.budgetReservationId;
   const state=event.kind==='answer'?'verifying':'running';if(prior.state!==state)assertRunTransition(prior.state,state);
   return {...prior,state,revision:prior.revision+1};
  },async tx=>{await this.live(tx,expiry);await this.budget(tx,m.runId,reservation,1);},async(tx,prior)=>{await this.nativeCurrent(tx,scope,prior,value.sessionId,workerGeneration);
   const pending=(await tx.query("SELECT operation_id FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 AND record->>'state' NOT IN ('confirmed','not-applied','cancelled')",[scope.tenantId,scope.spaceId,m.runId])).rows;
   if(pending.length)throw new FoundationError('STALE_AUTHORITY','Reconcile effects before model continuation');});
 }
 async nativeTranscript(scope: VerifiedScope,sessionId: string): Promise<readonly SessionEvent[]> {
  uuid.parse(sessionId);return this.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');
   return (await tx.query('SELECT record FROM fabric.recovery_session_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 ORDER BY sequence',[scope.tenantId,scope.spaceId,sessionId])).rows.map(r=>sessionEventSchema.parse(r.record));
  });
 }
 async lookupCommand(scope: VerifiedScope, key: string, payloadDigest: string): Promise<Lookup> {
  uuid.parse(key); digest.parse(payloadDigest);
  try {return await this.uow.withScope(scope, async tx => {
   if (!scope.grants.includes('task:read')) throw new FoundationError('UNAUTHORIZED');
   await this.lockKey(tx, scope, key); const receipt = await this.receipt(tx, scope, key, payloadDigest); return receipt ? {status: 'committed', receipt} : {status: 'absent-safe'};
  });} catch (e) {
   if ((e as {code?: string}).code === 'UNKNOWN_COMMIT') return unknownLookup(); throw e;
  }
 }
 async get(scope: VerifiedScope, runId: string): Promise<Snapshot | null> {
  uuid.parse(runId);
  return this.uow.withScope(scope, async tx => {
   if (!scope.grants.includes('task:read')) throw new FoundationError('UNAUTHORIZED');
   const ids = [scope.tenantId, scope.spaceId, runId];
   const row = (await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE', ids)).rows[0];
   if (!row) return null;
   const run = runSchema.parse(row.record), snapshots: Record<string, unknown[]> = {};
   for (const name of ['sessions', 'leases', 'operations', 'results']) snapshots[name] = (await tx.query(`SELECT record FROM fabric.recovery_${name} WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3`, ids)).rows.map(r => r.record);
   return {run, sessions: snapshots.sessions!.map(x => sessionSchema.parse(x)), leases: snapshots.leases!.map(x => leaseSchema.parse(x)), effects: snapshots.operations!.map(x => effectSchema.parse(x)), result: snapshots.results![0] ? resultSchema.parse(snapshots.results![0]) : null};
  });
 }
 async outbox(scope: VerifiedScope): Promise<readonly Record<string, unknown>[]> {
  return this.uow.withScope(scope, async tx => {if (!scope.grants.includes('task:read')) throw new FoundationError('UNAUTHORIZED'); return (await tx.query('SELECT outbox_id,run_id,kind,payload,authority_revision,completed_at FROM fabric.recovery_outbox WHERE tenant_id=$1 AND space_id=$2 ORDER BY outbox_id', [scope.tenantId, scope.spaceId])).rows;});
 }
 async completeOutbox(scope: VerifiedScope, outboxId: string): Promise<void> {
  uuid.parse(outboxId); await this.uow.withScope(scope, async tx => {
   if (!scope.grants.includes('task:write')) throw new FoundationError('UNAUTHORIZED');
   const r = await tx.query('UPDATE fabric.recovery_outbox SET completed_at=COALESCE(completed_at,clock_timestamp()) WHERE tenant_id=$1 AND space_id=$2 AND outbox_id=$3 AND authority_revision=$4 RETURNING outbox_id', [scope.tenantId, scope.spaceId, outboxId, scope.authorityRevision]);
   if (r.rowCount !== 1) throw new FoundationError('STALE_AUTHORITY');
  });
 }
}
