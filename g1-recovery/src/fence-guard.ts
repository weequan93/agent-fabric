import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
/** Conservative Space serialization prevents multi-resource/task lock inversions.
 * Older migration-only qualification slices have no resource adapters. The online
 * fence service requires migration7; an installed fence schema is never optional. */
export async function lockSpaceBarrier(tx:SqlTransaction,scope:VerifiedScope):Promise<boolean> {
 const installed=(await tx.query("SELECT to_regclass('fabric.recovery_task_controls') IS NOT NULL AS installed")).rows[0]?.installed===true;
 if(installed)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-space-barrier',scope.tenantId,scope.spaceId])]);
 return installed;
}
export async function assertRunUnfenced(tx:SqlTransaction,scope:VerifiedScope,runId:string,resourceId?:string,activeSubmission?:string,effectAccess?:{operationId:string;reconciliation:boolean},externalRecovery=false):Promise<void> {
 const ids=[scope.tenantId,scope.spaceId,runId];
 const task=(await tx.query('SELECT c.blocked FROM fabric.runs r LEFT JOIN fabric.recovery_task_controls c USING(tenant_id,space_id,task_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.run_id=$3',ids)).rows[0];
 if(task?.blocked===true)throw new FoundationError('STALE_AUTHORITY','Task stopped; explicit authorized retry required');
 const bound=(await tx.query('SELECT r.resource_id,c.record FROM fabric.recovery_run_resources r JOIN fabric.recovery_resource_controls c USING(tenant_id,space_id,resource_id) WHERE r.tenant_id=$1 AND r.space_id=$2 AND r.run_id=$3',ids)).rows[0];
 if(resourceId && (!bound || bound.resource_id!==resourceId))throw new FoundationError('STALE_AUTHORITY','Unenrolled resource adapter');
 if(bound && (bound.record as {mode:string}).mode!=='agent')throw new FoundationError('STALE_AUTHORITY','Resource mutation barrier active');
 const pending=await unresolvedRunEffects(tx,scope,runId);
 // Local submission permits only its fresh inserting invocation; local unknown
 // never does. External dispatch requires its exact one-use acknowledged claim.
 // Read-only status reconciliation and metadata sync cannot execute new I/O.
 if(pending.some(m=>!effectAccess?.reconciliation &&
   !(externalRecovery && m.kind==='external' && m.run_id===runId) &&
   !(m.kind==='external' && effectAccess?.operationId===m.operation_id && m.run_id===runId) &&
   !(m.kind==='local' && activeSubmission===m.operation_id && m.state==='submitted' && m.run_id===runId && m.resource_id===resourceId)))
  throw new FoundationError('STALE_AUTHORITY','Reconcile local resource uncertainty or external effects before continuation or conflicting I/O');
}

/** Caller holds the Space barrier. Without the additive reconciliation schema,
 * unresolved entries remain blocked; missing evidence never implies settlement. */
export async function unresolvedResourceMutations(tx:SqlTransaction,scope:VerifiedScope):Promise<readonly Record<string,unknown>[]> {
 const installed=(await tx.query("SELECT to_regclass('fabric.recovery_resource_reconciliations') IS NOT NULL AS installed")).rows[0]?.installed===true;
 const resolved=installed?` AND NOT EXISTS (SELECT 1 FROM fabric.recovery_resource_reconciliations e WHERE e.tenant_id=m.tenant_id AND e.space_id=m.space_id AND e.operation_id=m.operation_id)`:'';
 return (await tx.query("SELECT m.operation_id,m.run_id,m.resource_id,m.binding,m.state FROM fabric.recovery_resource_mutations m WHERE m.tenant_id=$1 AND m.space_id=$2 AND m.state IN ('submitted','unknown')"+resolved,[scope.tenantId,scope.spaceId])).rows;
}

/** One definitive unresolved predicate for model/I/O, Dispatch and outcomes.
 * Caller holds the Space barrier. External intent binds its resource even when
 * the originating Run has not enrolled a local adapter. */
export async function unresolvedRunEffects(tx:SqlTransaction,scope:VerifiedScope,runId:string):Promise<readonly Record<string,unknown>[]> {
 const bound=(await tx.query('SELECT resource_id FROM fabric.recovery_run_resources WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[scope.tenantId,scope.spaceId,runId])).rows[0]?.resource_id;
 const local=(await unresolvedResourceMutations(tx,scope)).map((m):Record<string,unknown>=>({...m,kind:'local'}));
 const external=(await tx.query("SELECT operation_id,run_id,binding->>'resourceId' AS resource_id,record->>'state' AS state FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND record->>'state' IN('dispatched','unknown','reconciling')",[scope.tenantId,scope.spaceId])).rows.map((m):Record<string,unknown>=>({...m,kind:'external'}));
 return [...local,...external].filter(m=>m.run_id===runId || (bound!==undefined && m.resource_id===bound));
}
