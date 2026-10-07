import {randomUUID} from 'node:crypto';
import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository,leaseSchema} from './repository.js';
import {bindingDigest,assertGeneration,generationSchema,runSchema,sessionSchema,taskBindingSchema,type Generation,type Run,type Session} from './contracts.js';
import {object,uuid,nullable,timestamp,revision,digest,enumeration,type Value} from './schema.js';
import {lockSpaceBarrier,assertRunUnfenced,unresolvedResourceMutations} from './fence-guard.js';
export const fenceCommandSchema=object({task:taskBindingSchema,runId:nullable(uuid),commandId:uuid,idempotencyKey:uuid,expiresAt:timestamp,
 kind:enumeration('stop-run','stop-task','retry-task','take-control','disconnect','return-control'),resourceId:nullable(uuid),expectedResourceGeneration:nullable(revision),observationId:nullable(uuid),baseDigest:nullable(digest),leaseExpiresAt:nullable(timestamp)});
export type FenceCommand=Value<typeof fenceCommandSchema>;
export interface FenceReceipt {commandId:string;accepted:true;dispatch:'fenced';termination:'pending';observedResourceQuiescence:boolean;unknownEffects:string[];submittedEffects:string[];generation:number;affectedRuns:string[];humanLeaseId:string|null}
type ResumeState={state:Run['state'];sessions:Record<string,Session['state']>};
export interface ResourceState {resourceId:string;generation:number;mode:'agent'|'paused'|'human';holderId:string|null;leaseId:string|null;leaseExpiresAt:string|null;observationId:string|null;baseDigest:string|null;observedAt:string|null;affectedRuns:string[];resume:Record<string,ResumeState>}
const terminal=(run:Run)=>['succeeded','partial','failed','cancelled'].includes(run.state);
export const resourceMutationSchema=object({runId:uuid,resourceId:uuid,generation:generationSchema,path:enumeration('api','sdk','shell','filesystem'),operationId:uuid});
export type ResourceMutation=Value<typeof resourceMutationSchema>;
export const resourceResolutionSchema=object({operationId:uuid,bindingDigest:digest,outcome:enumeration('applied','not-applied','unknown'),evidenceDigest:digest});
export type ResourceResolution=Value<typeof resourceResolutionSchema>;
export class FenceRepository {
 constructor(readonly repo:RecoveryRepository,readonly drivers?:{observeBase:(resourceId:string)=>Promise<string>;quiesce:(resourceId:string)=>Promise<boolean>;lookupMutation?:(binding:ResourceMutation)=>Promise<ResourceResolution>}){}
 private async barrier(tx:SqlTransaction,scope:VerifiedScope):Promise<void> {
  if(!scope.grants.includes('task:write')||!await lockSpaceBarrier(tx,scope))throw new FoundationError('UNAUTHORIZED','Installed fence schema and current control authority required');
 }
 private async live(tx:SqlTransaction,expiresAt:string):Promise<void>{if((await tx.query('SELECT $1::timestamptz>clock_timestamp() AS live',[expiresAt])).rows[0]?.live!==true)throw new FoundationError('STALE_AUTHORITY');}
 private ids(scope:VerifiedScope):string[]{return [scope.tenantId,scope.spaceId];}
 private async run(tx:SqlTransaction,scope:VerifiedScope,runId:string):Promise<Run> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-run',scope.tenantId,scope.spaceId,runId])]);
  const row=(await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE',[...this.ids(scope),runId])).rows[0];
  if(!row)throw new FoundationError('STALE_AUTHORITY');return runSchema.parse(row.record);
 }
 private async resource(tx:SqlTransaction,scope:VerifiedScope,resourceId:string):Promise<ResourceState> {
  const row=(await tx.query('SELECT record FROM fabric.recovery_resource_controls WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3 FOR UPDATE',[...this.ids(scope),resourceId])).rows[0];
  if(!row)throw new FoundationError('STALE_AUTHORITY');
  const state=row.record as ResourceState;
  const runs=(await tx.query('SELECT run_id FROM fabric.recovery_run_resources WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3 ORDER BY run_id',[...this.ids(scope),resourceId])).rows.map(r=>String(r.run_id));
  const current={...state,affectedRuns:runs};
  if(current.mode==='human'&&(await tx.query('SELECT $1::timestamptz<=clock_timestamp() AS expired',[current.leaseExpiresAt])).rows[0]?.expired===true){current.mode='paused';await this.saveResource(tx,scope,current);}
  return current;
 }
 private async saveResource(tx:SqlTransaction,scope:VerifiedScope,state:ResourceState):Promise<void>{await tx.query('UPDATE fabric.recovery_resource_controls SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND resource_id=$3',[...this.ids(scope),state.resourceId,JSON.stringify(state)]);}
 private async saveRun(tx:SqlTransaction,scope:VerifiedScope,run:Run,generation:Generation,stop:boolean,resume=false,restore?:ResumeState):Promise<void> {
  const now=(await tx.query('SELECT clock_timestamp() AS now')).rows[0]!.now as Date;
  // Accepted Stop never claims process termination or erases an accepted result.
  const state=terminal(run)?run.state:stop?'cancelling':resume?(restore?.state??'running'):'paused';
  const next=runSchema.parse({...run,generation,revision:run.revision+1,state,wait:null});
  await tx.query('UPDATE fabric.recovery_runs SET record=$4,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...this.ids(scope),run.binding.runId,JSON.stringify(next),next.revision]);
  const sessions=(await tx.query('SELECT session_id,record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE',[...this.ids(scope),run.binding.runId])).rows;
  for(const row of sessions){const session=sessionSchema.parse(row.record);const state=terminal(run)?session.state:resume?(restore?.sessions[session.sessionId]??'ready'):'interrupted';await tx.query('UPDATE fabric.recovery_sessions SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[...this.ids(scope),row.session_id,JSON.stringify({...session,generation,state})]);}
  const leases=(await tx.query('SELECT lease_id,record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR UPDATE',[...this.ids(scope),run.binding.runId])).rows;
  for(const row of leases){const lease=leaseSchema.parse(row.record);if(resume)await this.live(tx,lease.expiresAt);await tx.query('UPDATE fabric.recovery_leases SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND lease_id=$3',[...this.ids(scope),row.lease_id,JSON.stringify({...lease,generation,revokedAt:resume?null:now.toISOString()})]);}
  if(!resume)await tx.query("UPDATE fabric.recovery_operations SET record=jsonb_set(record,'{state}','\"cancelled\"'::jsonb) WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 AND record->>'state'='prepared'",[...this.ids(scope),run.binding.runId]);
 }
 /** Trusted local resource declaration is immutable once enrolled. No GUI/native
  * executor is silently inferred from this declaration. */
 async enroll(scope:VerifiedScope,value:{runId:string;resourceId:string}):Promise<void> {
  uuid.parse(value.runId);uuid.parse(value.resourceId);
  await this.repo.uow.withScope(scope,async tx=>{
   await this.barrier(tx,scope);await assertRunUnfenced(tx,scope,value.runId);
   const run=await this.run(tx,scope,value.runId);if(terminal(run)||run.state==='cancelling')throw new FoundationError('STALE_AUTHORITY');
   const old=(await tx.query('SELECT resource_id FROM fabric.recovery_run_resources WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...this.ids(scope),value.runId])).rows[0];
   if(old){if(old.resource_id!==value.resourceId)throw new FoundationError('STALE_AUTHORITY');return;}
   const initial:ResourceState={resourceId:value.resourceId,generation:0,mode:'agent',holderId:null,leaseId:null,leaseExpiresAt:null,observationId:null,baseDigest:null,observedAt:null,affectedRuns:[],resume:{}};
   await tx.query('INSERT INTO fabric.recovery_resource_controls(tenant_id,space_id,resource_id,record) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[...this.ids(scope),value.resourceId,JSON.stringify(initial)]);
   const current=await this.resource(tx,scope,value.resourceId);if(current.mode!=='agent'||current.generation!==run.generation.resource)throw new FoundationError('STALE_AUTHORITY');
   await tx.query('INSERT INTO fabric.recovery_run_resources(tenant_id,space_id,run_id,resource_id) VALUES($1,$2,$3,$4)',[...this.ids(scope),value.runId,value.resourceId]);
  });
 }
 private async effects(tx:SqlTransaction,scope:VerifiedScope,runs:readonly string[]):Promise<{unknownEffects:string[];submittedEffects:string[]}> {
  const result={unknownEffects:[] as string[],submittedEffects:[] as string[]};
  const external=(await tx.query("SELECT operation_id,record->>'state' AS state FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND run_id=ANY($3::uuid[]) AND record->>'state' IN ('dispatched','unknown','reconciling')",[...this.ids(scope),runs])).rows;
  const local=(await unresolvedResourceMutations(tx,scope)).filter(m=>runs.includes(String(m.run_id)));
  for(const row of [...external,...local]){(row.state==='submitted'||row.state==='dispatched'?result.submittedEffects:result.unknownEffects).push(String(row.operation_id));}
  result.unknownEffects.sort();result.submittedEffects.sort();return result;
 }
 async execute(scope:VerifiedScope,input:FenceCommand):Promise<FenceReceipt> {
  const c=fenceCommandSchema.parse(input),payloadDigest=bindingDigest(c);
  if(c.task.tenantId!==scope.tenantId||c.task.spaceId!==scope.spaceId)throw new FoundationError('UNAUTHORIZED');
  const control=['take-control','disconnect','return-control'].includes(c.kind);
  if((c.kind==='stop-run')!==(c.runId!==null&&!control)||control!==(c.resourceId!==null)||(!control&&(c.expectedResourceGeneration!==null||c.observationId!==null||c.baseDigest!==null||c.leaseExpiresAt!==null)))throw new FoundationError('INVALID_INPUT');
  return this.repo.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-fence-key',scope.tenantId,scope.spaceId,scope.actorId,c.idempotencyKey])]);
   await this.barrier(tx,scope);
   const task=(await tx.query('SELECT task_id FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR UPDATE',[...this.ids(scope),c.task.taskId])).rows[0];
   if(!task)throw new FoundationError('STALE_AUTHORITY');
   const old=(await tx.query('SELECT payload_digest,receipt FROM fabric.recovery_fence_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[...this.ids(scope),scope.actorId,c.idempotencyKey])).rows[0];
   if(old){if(old.payload_digest!==payloadDigest)throw new FoundationError('IDEMPOTENCY_CONFLICT');return old.receipt as FenceReceipt;}
   await this.live(tx,c.expiresAt);
   let affectedRuns:string[]=[],generation=0,humanLeaseId:string|null=null,observedResourceQuiescence=false;
   if(control){
    if(this.repo.bindingFor(scope).principalKind!=='human')throw new FoundationError('UNAUTHORIZED');
    const current=await this.resource(tx,scope,c.resourceId!);
    if(current.generation!==c.expectedResourceGeneration)throw new FoundationError('STALE_AUTHORITY');
    affectedRuns=current.affectedRuns;
    const owned=(await tx.query('SELECT run_id FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 AND run_id=ANY($4::uuid[])',[...this.ids(scope),c.task.taskId,affectedRuns])).rows;
    if(!owned.length||(c.runId!==null&&!owned.some(r=>r.run_id===c.runId)))throw new FoundationError('STALE_AUTHORITY');
    if(c.kind==='take-control'){
     if(current.mode!=='agent'||c.leaseExpiresAt===null||c.observationId!==null||c.baseDigest!==null)throw new FoundationError('STALE_AUTHORITY');
     await this.live(tx,c.leaseExpiresAt);
     if(!this.drivers||await this.drivers.quiesce(c.resourceId!)!==true)throw new FoundationError('STALE_AUTHORITY','Observed driver barrier required before human lease');
     observedResourceQuiescence=true;
     generation=current.generation+1;humanLeaseId=randomUUID();
     // The barrier lock remains held until the lease and all invalidations commit.
     const resume:Record<string,ResumeState>={};
     for(const id of affectedRuns){const run=await this.run(tx,scope,id);if(!terminal(run)&&run.state!=='cancelling'){
      const sessions=(await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...this.ids(scope),id])).rows.map(r=>sessionSchema.parse(r.record));
      resume[id]={state:run.state,sessions:Object.fromEntries(sessions.map(s=>[s.sessionId,s.state]))};
      await this.saveRun(tx,scope,run,{...run.generation,worker:run.generation.worker+1,resource:generation},false);
     }}
     await this.saveResource(tx,scope,{...current,generation,mode:'human',holderId:scope.actorId,leaseId:humanLeaseId,leaseExpiresAt:c.leaseExpiresAt,observationId:null,baseDigest:null,observedAt:null,resume});
    }else{
     if(current.holderId!==scope.actorId||current.mode==='agent')throw new FoundationError('UNAUTHORIZED');
     generation=current.generation;
     if(c.kind==='return-control'){
      if(c.leaseExpiresAt!==null||c.observationId===null||c.baseDigest===null||c.observationId!==current.observationId||c.baseDigest!==current.baseDigest||current.observedAt===null||(await tx.query("SELECT $1::timestamptz>clock_timestamp()-interval '30 seconds' AS fresh",[current.observedAt])).rows[0]?.fresh!==true)throw new FoundationError('STALE_AUTHORITY');
      const pending=await this.effects(tx,scope,affectedRuns);if(pending.unknownEffects.length||pending.submittedEffects.length)throw new FoundationError('STALE_AUTHORITY','Reconcile submitted and unknown effects before return');
      if(!this.drivers||digest.parse(await this.drivers.observeBase(c.resourceId!))!==current.baseDigest)throw new FoundationError('STALE_AUTHORITY','Observed base changed; reconcile human edits');
      generation++;
      for(const id of affectedRuns){const run=await this.run(tx,scope,id);if(!terminal(run)&&run.state!=='cancelling'){
       const restore=current.resume[id];if(!restore||restore.state==='waiting')throw new FoundationError('STALE_AUTHORITY','Resolve prior wait before returning control');
       await this.saveRun(tx,scope,run,{...run.generation,worker:run.generation.worker+1,resource:generation},false,true,restore);
      }}
      await this.saveResource(tx,scope,{...current,generation,mode:'agent',holderId:null,leaseId:null,leaseExpiresAt:null,observationId:null,baseDigest:null,observedAt:null,resume:{}});
     }else{
      if(c.observationId!==null||c.baseDigest!==null||c.leaseExpiresAt!==null)throw new FoundationError('INVALID_INPUT');
      await this.saveResource(tx,scope,{...current,mode:'paused',observationId:null,baseDigest:null,observedAt:null});
     }
    }
   }else if(c.kind==='retry-task'){
    await tx.query('INSERT INTO fabric.recovery_task_controls(tenant_id,space_id,task_id,blocked) VALUES($1,$2,$3,false) ON CONFLICT(tenant_id,space_id,task_id) DO UPDATE SET blocked=false',[...this.ids(scope),c.task.taskId]);
   }else{
    const rows=(await tx.query('SELECT run_id FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 AND ($4::uuid IS NULL OR run_id=$4) ORDER BY run_id',[...this.ids(scope),c.task.taskId,c.runId])).rows;
    affectedRuns=rows.map(r=>String(r.run_id));if(c.kind==='stop-run'&&affectedRuns.length!==1)throw new FoundationError('STALE_AUTHORITY');
    if(c.kind==='stop-task'){
     await tx.query('INSERT INTO fabric.recovery_task_controls(tenant_id,space_id,task_id,blocked) VALUES($1,$2,$3,true) ON CONFLICT(tenant_id,space_id,task_id) DO UPDATE SET blocked=true',[...this.ids(scope),c.task.taskId]);
     await tx.query('UPDATE fabric.tasks SET cancellation_generation=cancellation_generation+1 WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3',[...this.ids(scope),c.task.taskId]);
    }
    for(const id of affectedRuns){const run=await this.run(tx,scope,id);const next={...run.generation,worker:run.generation.worker+1,cancellation:run.generation.cancellation+(c.kind==='stop-task'?1:0)};await this.saveRun(tx,scope,run,next,true);generation=Math.max(generation,next.worker);}
   }
   const receipt:FenceReceipt={commandId:c.commandId,accepted:true,dispatch:'fenced',termination:'pending',observedResourceQuiescence,...await this.effects(tx,scope,affectedRuns),generation,affectedRuns,humanLeaseId};
   const eventId=randomUUID();
   await tx.query('INSERT INTO fabric.recovery_fence_receipts(tenant_id,space_id,actor_id,command_key,command_id,payload_digest,receipt,event_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[...this.ids(scope),scope.actorId,c.idempotencyKey,c.commandId,payloadDigest,JSON.stringify(receipt),eventId]);
   await tx.query('INSERT INTO fabric.recovery_fence_events(tenant_id,space_id,actor_id,command_key,event_id,record) VALUES($1,$2,$3,$4,$5,$6)',[...this.ids(scope),scope.actorId,c.idempotencyKey,eventId,JSON.stringify({command:c,receipt})]);
   await this.live(tx,c.expiresAt);if(c.kind==='take-control')await this.live(tx,c.leaseExpiresAt!);return receipt;
  });
 }
 async state(scope:VerifiedScope,resourceId:string):Promise<ResourceState>{uuid.parse(resourceId);return this.repo.uow.withScope(scope,async tx=>{await this.barrier(tx,scope);return this.resource(tx,scope,resourceId);});}
 /** Trusted observer supplies measured filesystem/base state, never a worker or
  * HTTP client's unchecked claim. Observation is generation-bound and single-use. */
 async observe(scope:VerifiedScope,value:{resourceId:string;observationId:string;baseDigest:string}):Promise<void>{
  uuid.parse(value.resourceId);uuid.parse(value.observationId);digest.parse(value.baseDigest);
  await this.repo.uow.withScope(scope,async tx=>{await this.barrier(tx,scope);const current=await this.resource(tx,scope,value.resourceId);if(current.holderId!==scope.actorId||current.mode==='agent')throw new FoundationError('UNAUTHORIZED');
   if(!this.drivers||digest.parse(await this.drivers.observeBase(value.resourceId))!==value.baseDigest)throw new FoundationError('STALE_AUTHORITY','Trusted current base observation required');
   const now=(await tx.query('SELECT clock_timestamp() AS now')).rows[0]!.now as Date;
   await this.saveResource(tx,scope,{...current,observationId:value.observationId,baseDigest:value.baseDigest,observedAt:now.toISOString()});
 });
 }
 async lookupCommand(scope:VerifiedScope,input:FenceCommand):Promise<{status:'committed';receipt:FenceReceipt}|{status:'absent-safe'}|{status:'unknown';nextAction:'lookup-original-key-no-replay'}> {
  const c=fenceCommandSchema.parse(input),payloadDigest=bindingDigest(c);
  if(c.task.tenantId!==scope.tenantId||c.task.spaceId!==scope.spaceId)throw new FoundationError('UNAUTHORIZED');
  return this.repo.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');
   try{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['recovery-fence-key',scope.tenantId,scope.spaceId,scope.actorId,c.idempotencyKey])]);}
   catch{throw new FoundationError('UNKNOWN_COMMIT');}
   const row=(await tx.query('SELECT payload_digest,receipt FROM fabric.recovery_fence_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[...this.ids(scope),scope.actorId,c.idempotencyKey])).rows[0];
   if(!row)return {status:'absent-safe' as const};if(row.payload_digest!==payloadDigest)throw new FoundationError('IDEMPOTENCY_CONFLICT');return {status:'committed' as const,receipt:row.receipt as FenceReceipt};
  }).catch(error=>{if(error instanceof FoundationError&&error.code==='UNKNOWN_COMMIT')return {status:'unknown',nextAction:'lookup-original-key-no-replay'};throw error;});
 }
 /** Domain-specific synthetic recovery boundary, not an online worker/client API.
  * Only a current human can request trusted quiescence + original-operation lookup.
  * Unknown/mismatched/unavailable evidence never clears the immutable journal. */
 async reconcileResourceMutation(scope:VerifiedScope,operationId:string):Promise<ResourceResolution> {
  uuid.parse(operationId);
  return this.repo.uow.withScope(scope,async tx=>{
   await this.barrier(tx,scope);
   if(this.repo.bindingFor(scope).principalKind!=='human')throw new FoundationError('UNAUTHORIZED');
   if((await tx.query("SELECT to_regclass('fabric.recovery_resource_reconciliations') IS NOT NULL AS installed")).rows[0]?.installed!==true)throw new FoundationError('STALE_AUTHORITY','Installed reconciliation evidence schema required');
   const row=(await tx.query('SELECT binding,state FROM fabric.recovery_resource_mutations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 FOR UPDATE',[...this.ids(scope),operationId])).rows[0];
   if(!row || !['submitted','unknown'].includes(String(row.state)))throw new FoundationError('STALE_AUTHORITY');
   const binding=resourceMutationSchema.parse(row.binding);
   const old=(await tx.query('SELECT record FROM fabric.recovery_resource_reconciliations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[...this.ids(scope),operationId])).rows[0];
   if(old)return resourceResolutionSchema.parse(old.record);
   const current=await this.resource(tx,scope,binding.resourceId);
   if(current.mode!=='agent' && current.holderId!==scope.actorId)throw new FoundationError('UNAUTHORIZED');
   if(!this.drivers?.lookupMutation || await this.drivers.quiesce(binding.resourceId)!==true)throw new FoundationError('STALE_AUTHORITY','Trusted quiescence and original-operation status lookup required');
   const result=resourceResolutionSchema.parse(await this.drivers.lookupMutation(binding));
   if(result.operationId!==operationId || result.bindingDigest!==bindingDigest(binding))throw new FoundationError('STALE_AUTHORITY','Reconciliation binding mismatch');
   if(result.outcome==='unknown')return result;
   await tx.query('INSERT INTO fabric.recovery_resource_reconciliations(tenant_id,space_id,operation_id,actor_id,record) VALUES($1,$2,$3,$4,$5)',[...this.ids(scope),operationId,scope.actorId,JSON.stringify(result)]);
   return result;
  });
 }
 /** Synthetic local adapters only. No callback or filesystem/HTTP credentials
  * are reachable through the online command service. Real effects use approval
  * consumption + EffectRepository; this callback is not a production tool API. */
 async mutateResource<T>(scope:VerifiedScope,value:{runId:string;resourceId:string;generation:Generation;path:'api'|'sdk'|'shell'|'filesystem'|'browser'|'gui';operationId:string},io:()=>Promise<T>):Promise<T> {
  uuid.parse(value.runId);uuid.parse(value.resourceId);uuid.parse(value.operationId);generationSchema.parse(value.generation);
  if(!['api','sdk','shell','filesystem'].includes(value.path))throw new FoundationError('UNAUTHORIZED','Unavailable browser/GUI/native adapter is closed');
  const validate=async(tx:SqlTransaction,activeSubmission?:string)=>{
   await this.barrier(tx,scope);await assertRunUnfenced(tx,scope,value.runId,value.resourceId,activeSubmission);const run=await this.run(tx,scope,value.runId);assertGeneration(run.generation,value.generation);
   if(!['preparing','running'].includes(run.state))throw new FoundationError('STALE_AUTHORITY');
   const row=(await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE',[...this.ids(scope),value.runId])).rows;
   if(row.length!==1)throw new FoundationError('STALE_AUTHORITY');const lease=leaseSchema.parse(row[0]!.record);assertGeneration(run.generation,lease.generation);if(lease.revokedAt!==null)throw new FoundationError('STALE_AUTHORITY');await this.live(tx,lease.expiresAt);
   const task=(await tx.query('SELECT revision,cancellation_generation FROM fabric.tasks WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR SHARE',[...this.ids(scope),run.binding.task.taskId])).rows[0];
   if(Number(task?.revision)!==run.binding.requirementsRevision||Number(task?.cancellation_generation)!==run.generation.cancellation)throw new FoundationError('STALE_AUTHORITY');
  };
  // A commit ACK loss here must prevent I/O. Original operation remains submitted.
  await this.repo.uow.withScope(scope,async tx=>{await validate(tx);await tx.query("INSERT INTO fabric.recovery_resource_mutations(tenant_id,space_id,operation_id,run_id,resource_id,binding,state) VALUES($1,$2,$3,$4,$5,$6,'submitted')",[...this.ids(scope),value.operationId,value.runId,value.resourceId,JSON.stringify(value)]);});
  try{return await this.repo.uow.withScope(scope,async tx=>{await validate(tx,value.operationId);const result=await io();await validate(tx,value.operationId);await tx.query("UPDATE fabric.recovery_resource_mutations SET state='settled' WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3",[...this.ids(scope),value.operationId]);return result;});}
  catch(error){try{await this.repo.uow.withScope(scope,tx=>tx.query("UPDATE fabric.recovery_resource_mutations SET state='unknown' WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3 AND state='submitted'",[...this.ids(scope),value.operationId]));}catch{/* Submitted remains conservative uncertainty when current authority is gone. */}throw error;}
 }
}
