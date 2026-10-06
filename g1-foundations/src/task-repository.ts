import {createHash} from 'node:crypto';
import {assertUuid,assertRevision,FoundationError,type AsyncUnitOfWork,type CommitLookup,type JsonValue,type SqlTransaction,type TaskCommitReceipt,type TaskCreateInput,type TaskRecord,type TaskRepositoryPort,type VerifiedScope} from './contracts.js';
function canonical(value:JsonValue):string {
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw new FoundationError('INVALID_INPUT');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new FoundationError('INVALID_INPUT');
 return '{'+Object.keys(value).sort().map(k=>{const d=Object.getOwnPropertyDescriptor(value,k)!;if(!('value' in d))throw new FoundationError('INVALID_INPUT');return JSON.stringify(k)+':'+canonical(d.value as JsonValue);}).join(',')+'}';
}
export function commandDigest(input:Pick<TaskCreateInput,'taskId'|'runId'|'expectedRevision'|'requirements'>):string{return 'sha256:'+createHash('sha256').update(canonical({taskId:input.taskId,runId:input.runId,expectedRevision:input.expectedRevision,requirements:input.requirements})).digest('hex');}
async function lockKey(tx:SqlTransaction,scope:VerifiedScope,key:string){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scope.tenantId+'/'+scope.spaceId+'/'+scope.actorId+'/'+key]);}
async function lookup(tx:SqlTransaction,scope:VerifiedScope,key:string,digest:string):Promise<TaskCommitReceipt|null>{const r=await tx.query('SELECT payload_digest,result FROM fabric.commands WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND idempotency_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,key]);if(!r.rows[0])return null;if(r.rows[0].payload_digest!==digest)throw new FoundationError('IDEMPOTENCY_CONFLICT');return r.rows[0].result as unknown as TaskCommitReceipt;}
export class PostgresTaskRepository implements TaskRepositoryPort {
 constructor(readonly uow:AsyncUnitOfWork){}
 async create(scope:VerifiedScope,input:TaskCreateInput):Promise<TaskCommitReceipt>{
  for(const id of [input.taskId,input.runId,input.commandId,input.mutationId,input.jobId,input.eventId])assertUuid(id);assertRevision(input.expectedRevision);
  if(input.expectedRevision!==0||!input.idempotencyKey?.trim()||input.idempotencyKey.length>256||input.payloadDigest!==commandDigest(input))throw new FoundationError('INVALID_INPUT');
  return this.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');
   await lockKey(tx,scope,input.idempotencyKey);const old=await lookup(tx,scope,input.idempotencyKey,input.payloadDigest);if(old)return old;
   // Stable task lock also serializes different keys trying to create the same Task.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scope.tenantId+'/'+scope.spaceId+'/task/'+input.taskId]);
   const oldTask=await tx.query('SELECT revision FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3',[scope.tenantId,scope.spaceId,input.taskId]);if(oldTask.rowCount)throw new FoundationError('REVISION_CONFLICT');
   const ids=[scope.tenantId,scope.spaceId,input.taskId];
   await tx.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned',$5)",[...ids,scope.actorId,JSON.stringify(input.requirements)]);
   await tx.query('INSERT INTO fabric.task_revisions(tenant_id,space_id,task_id,revision,requirements) VALUES($1,$2,$3,1,$4)',[...ids,JSON.stringify(input.requirements)]);
   await tx.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,1,1,'{}',0,'pending')",[scope.tenantId,scope.spaceId,input.runId,input.taskId]);
   await tx.query("INSERT INTO fabric.run_events(tenant_id,space_id,run_id,sequence,event_id,kind,payload) VALUES($1,$2,$3,1,$4,'task-created',$5)",[scope.tenantId,scope.spaceId,input.runId,input.eventId,JSON.stringify({taskId:input.taskId,revision:1})]);
   await tx.query("INSERT INTO fabric.authority_mutations(tenant_id,space_id,mutation_id,job_id,record_kind,record_key,authority_revision) VALUES($1,$2,$3,$4,'task',$5,$6)",[scope.tenantId,scope.spaceId,input.mutationId,input.jobId,JSON.stringify({taskId:input.taskId}),scope.authorityRevision]);
   await tx.query("INSERT INTO fabric.outbox(tenant_id,space_id,job_id,mutation_id,kind,payload,authority_revision) VALUES($1,$2,$3,$4,'task-created',$5,$6)",[scope.tenantId,scope.spaceId,input.jobId,input.mutationId,JSON.stringify({taskId:input.taskId,runId:input.runId}),scope.authorityRevision]);
   const receipt:TaskCommitReceipt={tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:input.taskId,runId:input.runId,commandId:input.commandId,jobId:input.jobId,revision:1,payloadDigest:input.payloadDigest};
   await tx.query("INSERT INTO fabric.commands(tenant_id,space_id,command_id,actor_id,task_id,idempotency_key,payload_digest,expected_revision,expires_at,state,payload,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '1 day','completed',$9,$10)",[scope.tenantId,scope.spaceId,input.commandId,scope.actorId,input.taskId,input.idempotencyKey,input.payloadDigest,input.expectedRevision,JSON.stringify(input.requirements),JSON.stringify(receipt)]);
   return receipt;
  });
 }
 async get(scope:VerifiedScope,taskId:string):Promise<TaskRecord|null>{assertUuid(taskId);return this.uow.withScope(scope,async tx=>{if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');const r=await tx.query('SELECT * FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3',[scope.tenantId,scope.spaceId,taskId]);const a=r.rows[0];return a?{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:String(a.task_id),actorId:String(a.actor_id),revision:Number(a.revision),cancellationGeneration:Number(a.cancellation_generation),state:String(a.state),requirements:a.requirements as JsonValue}:null;});}
 async lookupCommand(scope:VerifiedScope,key:string,digest:string):Promise<CommitLookup>{
  if(!key.trim())throw new FoundationError('INVALID_INPUT');
  // Acquiring the same command lock waits for any old COMMIT; timeout stays unknown.
  try{return await this.uow.withScope(scope,async tx=>{await lockKey(tx,scope,key);const receipt=await lookup(tx,scope,key,digest);return receipt?{status:'committed' as const,receipt}:{status:'absent-safe' as const};});}
  catch(e){if(e instanceof FoundationError)throw e;return {status:'unknown',nextAction:'Inspect original transaction/connection; retain command identity and do not replay'};}
 }
 async revise(scope:VerifiedScope,taskId:string,expectedRevision:number,requirements:JsonValue):Promise<number>{assertUuid(taskId);assertRevision(expectedRevision);canonical(requirements);return this.uow.withScope(scope,async tx=>{
  if(!scope.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');
  const r=await tx.query('UPDATE fabric.tasks SET revision=revision+1,requirements=$4 WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 AND revision=$5 RETURNING revision',[scope.tenantId,scope.spaceId,taskId,JSON.stringify(requirements),expectedRevision]);if(r.rowCount!==1)throw new FoundationError('REVISION_CONFLICT');
  const revision=Number(r.rows[0]!.revision);await tx.query('INSERT INTO fabric.task_revisions(tenant_id,space_id,task_id,revision,requirements) VALUES($1,$2,$3,$4,$5)',[scope.tenantId,scope.spaceId,taskId,revision,JSON.stringify(requirements)]);return revision;
 });}
}
