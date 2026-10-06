import {FoundationError,type OutboxRecord,type SqlTransaction,type VerifiedScope} from './contracts.js';
/** Reads, authority and completion share the same trusted UoW; this does not execute external effects. */
export async function readOutbox(tx:SqlTransaction,scope:VerifiedScope):Promise<OutboxRecord[]>{
 const result=await tx.query('SELECT job_id,mutation_id,kind,payload,authority_revision,completed_at FROM fabric.outbox WHERE tenant_id=$1 AND space_id=$2 ORDER BY available_at,job_id',[scope.tenantId,scope.spaceId]);
 return result.rows.map(r=>({tenantId:scope.tenantId,spaceId:scope.spaceId,jobId:String(r.job_id),mutationId:String(r.mutation_id),kind:String(r.kind),payload:r.payload as OutboxRecord['payload'],authorityRevision:Number(r.authority_revision),completedAt:r.completed_at===null?null:String(r.completed_at)}));
}
export async function completeOutbox(tx:SqlTransaction,scope:VerifiedScope,jobId:string):Promise<void>{
 const r=await tx.query('UPDATE fabric.outbox SET completed_at=COALESCE(completed_at,now()) WHERE tenant_id=$1 AND space_id=$2 AND job_id=$3 AND authority_revision=$4 RETURNING job_id',[scope.tenantId,scope.spaceId,jobId,scope.authorityRevision]);
 if(r.rowCount!==1)throw new FoundationError('STALE_AUTHORITY','Outbox is absent or has stale authority');
}
