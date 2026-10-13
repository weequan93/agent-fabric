import { QueryControlsCommandSchema,QueryControlsSchema } from './schema.js';
import { positive,uuid } from './decoder.js';
import { demand,StorageError } from './errors.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope,NativeRepository,NativeSnapshot } from './owners.js';
import { StorageAuthorityRepository } from './authority.js';

export interface PersistedQueryControls {
 revision:number;controls:ReturnType<typeof QueryControlsSchema.parse>;taskId:string;runId:string;
}
/** Session-local controls are content routing preferences. They never change
 * native admission, file grants, transcript retention or the session's origin. */
export class QueryControlsRepository {
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:StorageAuthorityRepository,readonly native:NativeRepository=authority.native){}
 async #current(tx:SqlTransaction,scope:VerifiedScope,sessionId:string,expiresAt?:string):Promise<NativeSnapshot>{
  await this.authority.check(tx,scope,'read',expiresAt);
  const s=await this.native.load(tx,scope,sessionId);await this.native.fresh(tx,scope,s);
  demand(s.binding.tenantId===scope.tenantId&&s.binding.spaceId===scope.spaceId&&s.binding.actorId===scope.actorId
   &&s.binding.sessionId===sessionId,'UNAUTHORIZED');
  demand(s.binding.intent==='Ask'&&s.binding.purpose==='answer'&&s.admission.executionClass==='service'
   &&s.admission.resourceId===null&&s.admission.computerCapability===null&&!s.admission.targetEffect&&!s.admission.approvalRequired,'REQUIRED_CAPABILITY_UNSUPPORTED');
  await this.authority.currentAudience(tx,scope,s.binding.taskId);
  await this.authority.check(tx,scope,'read',expiresAt);await this.native.fresh(tx,scope,s);return s;
 }
 #decode(scope:VerifiedScope,s:NativeSnapshot,row:Record<string,unknown>|undefined):PersistedQueryControls{
  demand(row,'CONTENT_UNAVAILABLE');
  demand(row['tenant_id']===scope.tenantId&&row['space_id']===scope.spaceId&&row['actor_id']===scope.actorId
   &&row['session_id']===s.binding.sessionId&&row['task_id']===s.binding.taskId&&row['run_id']===s.binding.runId,'UNAUTHORIZED');
  return {revision:positive.parse(Number(row['revision'])),controls:QueryControlsSchema.parse(row['controls']),taskId:s.binding.taskId,runId:s.binding.runId};
 }
 async read(tx:SqlTransaction,scope:VerifiedScope,sessionId:string):Promise<PersistedQueryControls>{
  uuid.parse(sessionId);const s=await this.#current(tx,scope,sessionId);
  const row=(await tx.query('SELECT * FROM fabric.storage_query_controls WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND session_id=$4 ORDER BY revision DESC LIMIT 1',[scope.tenantId,scope.spaceId,scope.actorId,sessionId])).rows[0];
  const result=this.#decode(scope,s,row);await this.#current(tx,scope,sessionId);return result;
 }
 async snapshot(scope:VerifiedScope,sessionId:string):Promise<PersistedQueryControls>{return this.uow.withScope(scope,tx=>this.read(tx,scope,sessionId));}
 async set(scope:VerifiedScope,raw:unknown):Promise<PersistedQueryControls>{
  const c=QueryControlsCommandSchema.parse(raw);demand(c.targetId===c.sessionId,'INVALID_SCHEMA');
  return this.uow.withScope(scope,async tx=>{
   const s=await this.#current(tx,scope,c.sessionId,c.expiresAt);
   try{await tx.query('SELECT fabric.storage_set_query_controls($1,$2,$3,$4,$5::jsonb)',[c.sessionId,c.key,c.expectedRevision,c.expiresAt,JSON.stringify(c.controls)]);}
   catch(e){const code=(e as {code?:string}).code;if(code==='40001')throw new StorageError('STALE_REVISION');if(code==='23505')throw new StorageError('IDEMPOTENCY_CONFLICT');throw e;}
   const row=(await tx.query('SELECT * FROM fabric.storage_query_controls WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,c.key])).rows[0];
   const result=this.#decode(scope,s,row);await this.#current(tx,scope,c.sessionId,c.expiresAt);return result;
  });
 }
}
