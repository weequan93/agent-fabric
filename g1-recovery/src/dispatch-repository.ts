import {createHash,randomUUID} from 'node:crypto';
import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository,leaseSchema} from './repository.js';
import {bindingDigest,runSchema,sessionSchema,effectSchema,waitSchema,type Wait} from './contracts.js';
import {object,uuid,text,digest,positive,revision,timestamp,nullable,enumeration,list,refined,type Value,type Decoder} from './schema.js';
import {validateCalendar,previewOccurrences,type Recurrence} from './dispatch-calendar.js';
import {lockSpaceBarrier,assertRunUnfenced,unresolvedRunEffects} from './fence-guard.js';
import {CurrentAudienceVerifier} from '../../g1-identity/src/audience.js';
import type {AuthenticatedBinding,ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import type {NativeRef} from './temporal-contracts.js';
const recurrence:Decoder<Recurrence>={parse:value=>validateCalendar('UTC',value as Recurrence)};
const boolean:Decoder<boolean>={parse:value=>{if(typeof value!=='boolean')throw new FoundationError('INVALID_INPUT');return value;}};
export const scheduleSchema=refined(object({scheduleId:uuid,runId:uuid,sessionId:uuid,sequence:refined(positive,n=>n<=2),ownerActorId:uuid,principalKind:enumeration('human','service'),timezone:text,recurrence,expiresAt:timestamp,policyRevision:positive,connectionId:uuid,connectionExpiresAt:timestamp,inputDigest:digest,deliveryAudience:list(uuid),maxCostMicrounits:positive,maxRuntimeMs:refined(positive,n=>n<=60000),waitMs:refined(positive,n=>n<=86400000),graceMs:refined(revision,n=>n<=86400000),maxCatchUp:refined(positive,n=>n<=100),overlap:enumeration('exclude'),missed:enumeration('skip','coalesce','catch-up'),effectClass:enumeration('read','external-write'),operationId:nullable(uuid),inputReady:boolean,resourceReady:boolean}),s=>(s.effectClass==='read')===(s.operationId===null)&&s.deliveryAudience.length>0&&new Set(s.deliveryAudience).size===s.deliveryAudience.length);
export type Schedule=Value<typeof scheduleSchema>;
export const dispatchCommandSchema=object({key:uuid,expiresAt:timestamp,expectedRevision:revision});
export type DispatchCommand=Value<typeof dispatchCommandSchema>;
const controlsSchema=object({inputReady:boolean,resourceReady:boolean,connectionExpiresAt:timestamp,connectionRevoked:boolean});
export type Controls=Value<typeof controlsSchema>;
export interface ScheduleRecord {config:Schedule;cursor:string;revision:number;state:'active'|'paused'|'expired';wait:Wait|null;controls:Controls;permits:Record<string,{expiresAt:string;identity:AuthenticatedBinding;policyRevision:number}>}
export interface Occurrence {occurrenceId:string;scheduleId:string;at:string;source:'timer'|'event';eventId:string|null;state:'queued'|'waiting'|'submitted'|'completed'|'skipped'|'reconciling'|'expired';wait:Wait|null;detail:string;generation:number|null;submittedAt:string|null}
export interface Ticket {occurrenceId:string;ref:NativeRef;sequence:number;generation:number;operationId:string|null;runtimeExpiresAt:string}
/** IDs bind the immutable schedule plus UTC occurrence or incoming event identity. */
export function occurrenceId(scheduleId:string,at:string,eventId:string|null=null):string {
 uuid.parse(scheduleId);timestamp.parse(at);if(eventId!==null)uuid.parse(eventId);
 const hex=createHash('sha256').update(JSON.stringify(['dispatch',scheduleId,eventId===null?at:eventId])).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
function ids(scope:VerifiedScope){return [scope.tenantId,scope.spaceId];}
const actions={input:'clarify',approval:'review-action',budget:'add-budget',resource:'wait-resource',connection:'reconnect',permission:'request-access'} as const;
export class DispatchRepository {
 constructor(readonly repo:RecoveryRepository){}
 private async now(tx:SqlTransaction):Promise<string>{const value=(await tx.query('SELECT clock_timestamp() AS now')).rows[0]!.now;return value instanceof Date?value.toISOString():new Date(String(value)).toISOString();}
 private async live(tx:SqlTransaction,expiresAt:string):Promise<void>{if(Date.parse(expiresAt)<=Date.parse(await this.now(tx)))throw new FoundationError('STALE_AUTHORITY','Expired Dispatch command');}
 private async lock(tx:SqlTransaction,scope:VerifiedScope,id:string):Promise<void>{await lockSpaceBarrier(tx,scope);await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['dispatch-schedule',...ids(scope),id])]);}
 private async read(tx:SqlTransaction,scope:VerifiedScope,id:string):Promise<ScheduleRecord>{uuid.parse(id);const row=(await tx.query('SELECT record FROM fabric.recovery_schedules WHERE tenant_id=$1 AND space_id=$2 AND schedule_id=$3 FOR UPDATE',[...ids(scope),id])).rows[0];if(!row)throw new FoundationError('UNAUTHORIZED');return row.record as unknown as ScheduleRecord;}
 private async save(tx:SqlTransaction,scope:VerifiedScope,s:ScheduleRecord):Promise<void>{s.revision++;await tx.query('UPDATE fabric.recovery_schedules SET record=$4,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND schedule_id=$3',[...ids(scope),s.config.scheduleId,JSON.stringify(s),s.revision]);}
 private async saveOccurrence(tx:SqlTransaction,scope:VerifiedScope,o:Occurrence):Promise<void>{await tx.query('UPDATE fabric.recovery_occurrences SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3',[...ids(scope),o.occurrenceId,JSON.stringify(o)]);}
 private wait(s:ScheduleRecord,now:string,reason:keyof typeof actions):Wait {return waitSchema.parse({reason,ownerId:s.config.ownerActorId,since:now,expiresAt:new Date(Date.parse(now)+s.config.waitMs).toISOString(),nextAction:actions[reason]});}
 private owner(scope:VerifiedScope,s:ScheduleRecord):void {if(scope.actorId!==s.config.ownerActorId||!scope.grants.includes('task:write')||this.repo.bindingFor(scope).principalKind!==s.config.principalKind)throw new FoundationError('UNAUTHORIZED');}
 private async command<T>(scope:VerifiedScope,raw:DispatchCommand,payload:unknown,work:(tx:SqlTransaction,deadlines:string[])=>Promise<T>):Promise<T> {
  const c=dispatchCommandSchema.parse(raw),digest=bindingDigest(payload);
  return this.repo.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['dispatch-command',...ids(scope),scope.actorId,c.key])]);
   const old=(await tx.query('SELECT payload_digest,receipt FROM fabric.recovery_dispatch_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[...ids(scope),scope.actorId,c.key])).rows[0];
   if(old){if(old.payload_digest!==digest)throw new FoundationError('IDEMPOTENCY_CONFLICT');return old.receipt as T;}
   await this.live(tx,c.expiresAt);const deadlines:string[]=[];const result=await work(tx,deadlines),eventId=randomUUID();
   await tx.query('INSERT INTO fabric.recovery_dispatch_receipts VALUES($1,$2,$3,$4,$5,$6,$7)',[...ids(scope),scope.actorId,c.key,digest,JSON.stringify(result),eventId]);
   await tx.query('INSERT INTO fabric.recovery_dispatch_events VALUES($1,$2,$3,$4,$5,$6)',[...ids(scope),scope.actorId,c.key,eventId,JSON.stringify({payloadDigest:digest,result})]);
   for(const deadline of deadlines)await this.live(tx,deadline);await this.live(tx,c.expiresAt);return result;
  });
 }
 async lookupCommand(scope:VerifiedScope,key:string,payloadDigest:string):Promise<{status:'committed';receipt:unknown}|{status:'absent-safe'}|{status:'unknown';nextAction:'lookup-original-key-no-replay'}>{uuid.parse(key);digest.parse(payloadDigest);try{return await this.repo.uow.withScope(scope,async tx=>{
  if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['dispatch-command',...ids(scope),scope.actorId,key])]);
  const old=(await tx.query('SELECT payload_digest,receipt FROM fabric.recovery_dispatch_receipts WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[...ids(scope),scope.actorId,key])).rows[0];if(!old)return {status:'absent-safe' as const};if(old.payload_digest!==payloadDigest)throw new FoundationError('IDEMPOTENCY_CONFLICT');return {status:'committed' as const,receipt:old.receipt};
 });}catch(e){if(e instanceof FoundationError&&['UNAUTHORIZED','IDEMPOTENCY_CONFLICT'].includes(e.code))throw e;return {status:'unknown',nextAction:'lookup-original-key-no-replay'};}}
 async create(scope:VerifiedScope,c:DispatchCommand,raw:Schedule):Promise<ScheduleRecord> {
  const config=scheduleSchema.parse(raw);validateCalendar(config.timezone,config.recurrence);
  return this.command(scope,c,{kind:'create',config,expectedRevision:c.expectedRevision},async (tx,deadlines)=>{deadlines.push(config.expiresAt);
   await this.lock(tx,scope,config.scheduleId);if(c.expectedRevision!==0)throw new FoundationError('REVISION_CONFLICT');
   if(config.ownerActorId!==scope.actorId||config.principalKind!==this.repo.bindingFor(scope).principalKind||config.policyRevision!==scope.authorityRevision)throw new FoundationError('UNAUTHORIZED');
   await assertRunUnfenced(tx,scope,config.runId);await this.live(tx,config.expiresAt);
   const run=runSchema.parse((await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...ids(scope),config.runId])).rows[0]?.record);
   const session=sessionSchema.parse((await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[...ids(scope),config.sessionId])).rows[0]?.record);
   if(config.inputDigest!==session.contextDigest||session.binding.runId!==run.binding.runId||config.sequence!==session.cursor+1||!['preparing','running','paused'].includes(run.state))throw new FoundationError('STALE_AUTHORITY');
   const record:ScheduleRecord={config,cursor:new Date(Date.parse(config.recurrence.startAt)-1).toISOString(),revision:1,state:'active',wait:null,controls:{inputReady:config.inputReady,resourceReady:config.resourceReady,connectionExpiresAt:config.connectionExpiresAt,connectionRevoked:false},permits:{}};
   await tx.query('INSERT INTO fabric.recovery_schedules VALUES($1,$2,$3,$4,$5,$6,1)',[...ids(scope),config.scheduleId,config.runId,JSON.stringify({config,identity:this.repo.bindingFor(scope),runBinding:run.binding}),JSON.stringify(record)]);await this.live(tx,config.expiresAt);return record;
  });
 }
 async get(scope:VerifiedScope,id:string):Promise<ScheduleRecord>{return this.repo.uow.withScope(scope,async tx=>{if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');return this.read(tx,scope,id);});}
 async occurrences(scope:VerifiedScope,id:string):Promise<Occurrence[]>{uuid.parse(id);return this.repo.uow.withScope(scope,async tx=>{if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');return (await tx.query('SELECT record FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND schedule_id=$3 ORDER BY binding->>\'at\',occurrence_id',[...ids(scope),id])).rows.map(r=>r.record as unknown as Occurrence);});}
 async preview(scope:VerifiedScope,id:string,after:string,through:string):Promise<string[]>{const s=await this.get(scope,id);return previewOccurrences(s.config.timezone,s.config.recurrence,after,through);}
 private async authority(tx:SqlTransaction,scope:VerifiedScope,s:ScheduleRecord,now:string):Promise<keyof typeof actions|null> {
  const b=(await tx.query('SELECT binding FROM fabric.recovery_schedules WHERE tenant_id=$1 AND space_id=$2 AND schedule_id=$3',[...ids(scope),s.config.scheduleId])).rows[0]!.binding as {identity:ReturnType<RecoveryRepository['bindingFor']>};
  if(s.config.policyRevision!==scope.authorityRevision||b.identity.tokenExpiresAt<=Date.parse(now)/1000||(await tx.query('SELECT fabric.identity_parties_current($1::jsonb) AS valid',[JSON.stringify([{actorId:s.config.ownerActorId,grant:'task:write',identity:b.identity,human:s.config.principalKind==='human'}])])).rows[0]?.valid!==true)return 'permission';
  if(b.identity.tokenExpiresAt<=Date.parse(await this.now(tx))/1000)return 'permission';
  if(s.controls.connectionRevoked||Date.parse(s.controls.connectionExpiresAt)<=Date.parse(now))return 'connection';
  return null;
 }
 private async gate(tx:SqlTransaction,scope:VerifiedScope,s:ScheduleRecord,o:Occurrence,now:string):Promise<{reason:keyof typeof actions;detail:string}|null> {
  const a=await this.authority(tx,scope,s,now);if(a)return {reason:a,detail:a};
  if(!s.controls.inputReady)return {reason:'input',detail:'missing-input'};
  if(!s.controls.resourceReady)return {reason:'resource',detail:'missing-resource'};
  const run=runSchema.parse((await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3 FOR SHARE',[...ids(scope),s.config.runId])).rows[0]?.record);
  const original=(await tx.query('SELECT binding FROM fabric.recovery_schedules WHERE tenant_id=$1 AND space_id=$2 AND schedule_id=$3',[...ids(scope),s.config.scheduleId])).rows[0]!.binding as {runBinding:unknown};
  if(bindingDigest(original.runBinding)!==bindingDigest(run.binding))return {reason:'permission',detail:'changed-run-binding'};
  if((await unresolvedRunEffects(tx,scope,s.config.runId)).length)return {reason:'approval',detail:'reconcile-original-operation-no-replay'};
  try{await assertRunUnfenced(tx,scope,s.config.runId);}catch{return {reason:'permission',detail:'stopped-or-human-controlled'};}
  const current=(await tx.query('SELECT t.revision,t.cancellation_generation FROM fabric.tasks t WHERE tenant_id=$1 AND space_id=$2 AND task_id=$3 FOR SHARE',[...ids(scope),run.binding.task.taskId])).rows[0];
  if(Number(current?.revision)!==run.binding.requirementsRevision||Number(current?.cancellation_generation)!==run.generation.cancellation)return {reason:'permission',detail:'stale-task'};
  if(['paused','cancelling','succeeded','partial','failed','cancelled','verifying'].includes(run.state))return {reason:'resource',detail:'run-not-executable'};
  const session=sessionSchema.parse((await tx.query('SELECT record FROM fabric.recovery_sessions WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[...ids(scope),s.config.sessionId])).rows[0]?.record);
  if(session.contextDigest!==s.config.inputDigest)return {reason:'input',detail:'changed-template-context'};
  const leases=(await tx.query('SELECT record FROM fabric.recovery_leases WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...ids(scope),s.config.runId])).rows;
  if(leases.length!==1)return {reason:'resource',detail:'missing-lease'};
  const lease=leaseSchema.parse(leases[0]!.record);
  if(lease.revokedAt!==null||Date.parse(lease.expiresAt)<=Date.parse(now)||bindingDigest(lease.generation)!==bindingDigest(run.generation)||bindingDigest(session.generation)!==bindingDigest(run.generation))return {reason:'resource',detail:'expired-or-stale-lease'};
  if((await tx.query('SELECT fabric.recovery_budget_current($1,$2,$3) AS valid',[session.budgetReservationId,s.config.runId,s.config.maxCostMicrounits])).rows[0]?.valid!==true)return {reason:'budget',detail:'missing-budget'};
  if(s.config.effectClass==='external-write'){
   const r=(await tx.query('SELECT record FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[...ids(scope),s.config.operationId])).rows[0];
   if(!r)return {reason:'approval',detail:'exact-operation-approval-required'};
   const e=effectSchema.parse(r.record);
   if(e.state!=='prepared'||e.binding.run.runId!==s.config.runId||e.binding.sessionId!==s.config.sessionId||e.binding.actorId!==s.config.ownerActorId||e.binding.approvalId===null||Date.parse(e.binding.expiresAt)<=Date.parse(now)||bindingDigest(e.binding.generation)!==bindingDigest(run.generation))return {reason:'approval',detail:'expired-or-stale-exact-approval'};
   const approvalRow=(await tx.query('SELECT * FROM fabric.exact_approvals WHERE tenant_id=$1 AND space_id=$2 AND approval_id=$3 FOR SHARE',[...ids(scope),e.binding.approvalId])).rows[0];
   if(!approvalRow||approvalRow.state!=='consumed'||approvalRow.executor_id!==s.config.ownerActorId)return {reason:'approval',detail:'exact-approval-unavailable'};
   const approval=approvalRow.binding as unknown as ExactApprovalBinding;
   if(approval.operationId!==e.binding.operationId||approval.runId!==s.config.runId||approval.expiresAt!==e.binding.expiresAt||approval.limits.maxCostMicrounits>s.config.maxCostMicrounits||Date.parse(approval.expiresAt)<=Date.parse(await this.now(tx)))return {reason:'approval',detail:'expired-or-stale-exact-approval'};
   const parties=[{actorId:approvalRow.requester_id,grant:'task:write',identity:approvalRow.request_identity,human:false},{actorId:approvalRow.approver_id,grant:'approval:approve',identity:approvalRow.approver_identity,human:true},{actorId:s.config.ownerActorId,grant:'task:write',identity:this.repo.bindingFor(scope),human:false}];
   if((await tx.query('SELECT fabric.identity_parties_current($1::jsonb) AS valid',[JSON.stringify(parties)])).rows[0]?.valid!==true)return {reason:'approval',detail:'exact-approval-party-revoked'};
   try{await new CurrentAudienceVerifier().verify(tx,scope,approval.sourceAudience);}catch{return {reason:'permission',detail:'exact-approval-audience-changed'};}
   const target=(await tx.query('SELECT fabric.identity_target_current($1,$2,$3) AS current',[e.binding.target,run.binding.task.taskId,s.config.runId])).rows[0]?.current as Record<string,unknown>|null;
   if(!target||Number(target.artifactVersion)!==e.binding.artifactVersion||target.argsDigest!==e.binding.argsDigest||Number(target.policyRevision)!==s.config.policyRevision||Number(target.requirementsRevision)!==run.binding.requirementsRevision||Number(target.runRequirementsRevision)!==run.binding.requirementsRevision)return {reason:'approval',detail:'exact-approval-target-changed'};
  }
  if((s.config.missed==='catch-up'||s.config.effectClass==='external-write')&&Date.parse(o.at)<Date.parse(now)-s.config.graceMs&&(!s.permits[o.occurrenceId]||Date.parse(s.permits[o.occurrenceId]!.expiresAt)<=Date.parse(now)))return {reason:'approval',detail:'authorize-exact-missed-occurrence'};
  const permit=s.permits[o.occurrenceId];
  if(permit&&(permit.policyRevision!==scope.authorityRevision||permit.identity.tokenExpiresAt<=Date.parse(await this.now(tx))/1000||(await tx.query('SELECT fabric.identity_parties_current($1::jsonb) AS valid',[JSON.stringify([{actorId:s.config.ownerActorId,grant:'approval:approve',identity:permit.identity,human:true}])])).rows[0]?.valid!==true))return {reason:'approval',detail:'catch-up-approver-revoked'};
  const active=(await tx.query("SELECT occurrence_id FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND binding->>'runId'=$3 AND occurrence_id<>$4 AND record->>'state' IN('submitted','reconciling')",[...ids(scope),s.config.runId,o.occurrenceId])).rows;
  if(active.length)return {reason:'resource',detail:'overlap-excluded'};
  return null;
 }
 private async insert(tx:SqlTransaction,scope:VerifiedScope,s:ScheduleRecord,at:string,now:string,eventId:string|null=null):Promise<Occurrence> {
  const id=occurrenceId(s.config.scheduleId,at,eventId);
  const old=(await tx.query('SELECT binding,record FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3',[...ids(scope),id])).rows[0];
  if(old){if((old.binding as {at:string}).at!==at)throw new FoundationError('IDEMPOTENCY_CONFLICT');return old.record as unknown as Occurrence;}
  const o:Occurrence={occurrenceId:id,scheduleId:s.config.scheduleId,at,source:eventId===null?'timer':'event',eventId,state:'queued',wait:null,detail:'queued',generation:null,submittedAt:null};
  const reason=await this.gate(tx,scope,s,o,now);if(reason){o.state=reason.detail==='reconcile-original-operation-no-replay'?'reconciling':'waiting';o.wait=this.wait(s,now,reason.reason);o.detail=reason.detail;}
  await tx.query('INSERT INTO fabric.recovery_occurrences VALUES($1,$2,$3,$4,$5,$6)',[...ids(scope),s.config.scheduleId,id,JSON.stringify({scheduleId:s.config.scheduleId,at,eventId,runId:s.config.runId}),JSON.stringify(o)]);return o;
 }
 /** Database clock, not caller-supplied catch-up time. A bounded timer scan fails
  * closed on large backlogs; no silent truncation/automatic destructive replay. */
 async tick(scope:VerifiedScope,id:string):Promise<Occurrence[]> {
  uuid.parse(id);return this.repo.uow.withScope(scope,async tx=>{
   if(!scope.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');await this.lock(tx,scope,id);const s=await this.read(tx,scope,id),now=await this.now(tx);
   if(s.state==='expired')return [];
   const pause=await this.authority(tx,scope,s,now);
   if(Date.parse(s.config.expiresAt)<=Date.parse(now)){s.state='expired';s.wait=null;await this.save(tx,scope,s);return [];}
   if(pause){s.state='paused';if(s.wait?.reason!==pause)s.wait=this.wait(s,now,pause);await this.save(tx,scope,s);return [];}
   if(s.state==='paused')return [];
   if(Date.parse(s.cursor)>=Date.parse(now))return [];
   let due:string[];try{due=previewOccurrences(s.config.timezone,s.config.recurrence,s.cursor,now,1000);}catch{s.state='paused';s.wait=this.wait(s,now,'input');await this.save(tx,scope,s);return [];}
   const late=due.filter(at=>Date.parse(at)<Date.parse(now)-s.config.graceMs),selected=new Set(due.filter(at=>!late.includes(at)));
   if(s.config.missed==='coalesce'&&late.length)selected.add(late[late.length-1]!);
   if(s.config.missed==='catch-up')for(const at of late)selected.add(at);
   const result:Occurrence[]=[];
   for(const at of due){const o=await this.insert(tx,scope,s,at,now);if(!selected.has(at)){o.state='skipped';o.wait=null;o.detail=s.config.missed==='skip'?'missed-skip':'missed-coalesced';await this.saveOccurrence(tx,scope,o);}result.push(o);}
   if(due.length)s.cursor=due[due.length-1]!;await this.save(tx,scope,s);return result;
  });
 }
 async trigger(scope:VerifiedScope,c:DispatchCommand,id:string,eventId:string,at:string):Promise<Occurrence>{uuid.parse(id);uuid.parse(eventId);timestamp.parse(at);return this.command(scope,c,{kind:'event',id,eventId,at,expectedRevision:c.expectedRevision},async (tx,deadlines)=>{await this.lock(tx,scope,id);const s=await this.read(tx,scope,id);this.owner(scope,s);deadlines.push(s.config.expiresAt);const now=await this.now(tx);if(s.revision!==c.expectedRevision)throw new FoundationError('REVISION_CONFLICT');if(Date.parse(at)>Date.parse(now)||Date.parse(s.config.expiresAt)<=Date.parse(now)||s.state!=='active')throw new FoundationError('STALE_AUTHORITY');return this.insert(tx,scope,s,at,now,eventId);});}
 async controls(scope:VerifiedScope,c:DispatchCommand,id:string,raw:Controls):Promise<ScheduleRecord>{const controls=controlsSchema.parse(raw);return this.command(scope,c,{kind:'controls',id,controls,expectedRevision:c.expectedRevision},async tx=>{await this.lock(tx,scope,id);const s=await this.read(tx,scope,id);this.owner(scope,s);if(s.revision!==c.expectedRevision||s.state==='expired')throw new FoundationError('REVISION_CONFLICT');s.controls=controls;await this.save(tx,scope,s);return s;});}
 async resume(scope:VerifiedScope,c:DispatchCommand,id:string):Promise<ScheduleRecord>{return this.command(scope,c,{kind:'resume',id,expectedRevision:c.expectedRevision},async (tx,deadlines)=>{await this.lock(tx,scope,id);const s=await this.read(tx,scope,id);this.owner(scope,s);if(s.revision!==c.expectedRevision)throw new FoundationError('REVISION_CONFLICT');deadlines.push(s.config.expiresAt);const now=await this.now(tx);await this.live(tx,s.config.expiresAt);const a=await this.authority(tx,scope,s,now);if(a)throw new FoundationError('STALE_AUTHORITY');s.state='active';s.wait=null;await this.save(tx,scope,s);return s;});}
 async authorizeCatchUp(scope:VerifiedScope,c:DispatchCommand,id:string,occurrenceIds:readonly string[],approvalExpiresAt:string):Promise<ScheduleRecord>{list(uuid).parse(occurrenceIds);timestamp.parse(approvalExpiresAt);return this.command(scope,c,{kind:'catch-up',id,occurrenceIds,approvalExpiresAt,expectedRevision:c.expectedRevision},async (tx,deadlines)=>{await this.lock(tx,scope,id);const s=await this.read(tx,scope,id);this.owner(scope,s);if(!scope.grants.includes('approval:approve')||this.repo.bindingFor(scope).principalKind!=='human')throw new FoundationError('UNAUTHORIZED');if(s.revision!==c.expectedRevision)throw new FoundationError('REVISION_CONFLICT');deadlines.push(approvalExpiresAt,s.config.expiresAt);await this.live(tx,approvalExpiresAt);if(Date.parse(approvalExpiresAt)>Date.parse(s.config.expiresAt)||!occurrenceIds.length||occurrenceIds.length>s.config.maxCatchUp||new Set(occurrenceIds).size!==occurrenceIds.length)throw new FoundationError('INVALID_INPUT');for(const occurrence of occurrenceIds){const o=await this.readOccurrence(tx,scope,occurrence);if(o.scheduleId!==id||o.state!=='waiting'||o.detail!=='authorize-exact-missed-occurrence')throw new FoundationError('STALE_AUTHORITY');if(o.wait)deadlines.push(o.wait.expiresAt);s.permits[occurrence]={expiresAt:approvalExpiresAt,identity:this.repo.bindingFor(scope),policyRevision:scope.authorityRevision};}await this.save(tx,scope,s);return s;});}
 private async readOccurrence(tx:SqlTransaction,scope:VerifiedScope,id:string):Promise<Occurrence>{uuid.parse(id);const r=(await tx.query('SELECT record FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3 FOR UPDATE',[...ids(scope),id])).rows[0];if(!r)throw new FoundationError('UNAUTHORIZED');return r.record as unknown as Occurrence;}
 async admit(scope:VerifiedScope,id:string,expiresAt:string):Promise<Ticket|null>{uuid.parse(id);timestamp.parse(expiresAt);return this.repo.uow.withScope(scope,async tx=>{
  const unlocked=(await tx.query('SELECT schedule_id FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3',[...ids(scope),id])).rows[0];if(!unlocked)throw new FoundationError('UNAUTHORIZED');await this.lock(tx,scope,String(unlocked.schedule_id));const s=await this.read(tx,scope,String(unlocked.schedule_id)),o=await this.readOccurrence(tx,scope,id);this.owner(scope,s);await this.live(tx,expiresAt);const now=await this.now(tx);
  if(!['queued','waiting'].includes(o.state))return null;const waitExpiresAt=o.wait?.expiresAt;
  if(s.state!=='active'||Date.parse(s.config.expiresAt)<=Date.parse(now)||o.wait&&Date.parse(o.wait.expiresAt)<=Date.parse(now)){o.state='expired';o.detail='expired-wait-or-schedule';o.wait=null;await this.saveOccurrence(tx,scope,o);return null;}
  const reason=await this.gate(tx,scope,s,o,now);if(reason){o.state=reason.detail==='reconcile-original-operation-no-replay'?'reconciling':'waiting';o.wait=o.wait??this.wait(s,now,reason.reason);if(o.wait.reason!==reason.reason)o.wait=this.wait(s,now,reason.reason);o.detail=reason.detail;await this.saveOccurrence(tx,scope,o);return null;}
  const run=runSchema.parse((await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...ids(scope),s.config.runId])).rows[0]?.record);
  o.state='submitted';o.wait=null;o.detail='native-controller-admission';o.generation=run.generation.worker;o.submittedAt=now;await this.saveOccurrence(tx,scope,o);
  const end=await this.now(tx);if(waitExpiresAt)await this.live(tx,waitExpiresAt);await this.live(tx,s.config.expiresAt);if(await this.gate(tx,scope,s,o,end))throw new FoundationError('STALE_AUTHORITY','Admission expired while waiting');
  delete s.permits[id];await this.save(tx,scope,s);await this.live(tx,expiresAt);
  return {occurrenceId:id,ref:{tenantId:scope.tenantId,spaceId:scope.spaceId,taskId:run.binding.task.taskId,runId:s.config.runId,sessionId:s.config.sessionId,bindingDigest:bindingDigest(run.binding)},sequence:s.config.sequence,generation:run.generation.worker,operationId:s.config.operationId,runtimeExpiresAt:new Date(Math.min(Date.parse(s.config.expiresAt),Date.parse(s.controls.connectionExpiresAt),Date.parse(now)+s.config.maxRuntimeMs)).toISOString()};
 });}
 async resumeOccurrence(scope:VerifiedScope,c:DispatchCommand,id:string):Promise<Occurrence>{return this.command(scope,c,{kind:'resume-occurrence',id,expectedRevision:c.expectedRevision},async (tx,deadlines)=>{
  const unlocked=(await tx.query('SELECT schedule_id FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3',[...ids(scope),id])).rows[0];if(!unlocked)throw new FoundationError('UNAUTHORIZED');await this.lock(tx,scope,String(unlocked.schedule_id));const s=await this.read(tx,scope,String(unlocked.schedule_id)),o=await this.readOccurrence(tx,scope,id);this.owner(scope,s);
  if(s.revision!==c.expectedRevision||o.state!=='reconciling'||o.detail!=='checkpoint-absent-explicit-resume-required'||s.config.effectClass!=='read'||s.state!=='active')throw new FoundationError('STALE_AUTHORITY');
  deadlines.push(s.config.expiresAt);const now=await this.now(tx);await this.live(tx,s.config.expiresAt);const reason=await this.gate(tx,scope,s,o,now);if(reason&&reason.detail!=='overlap-excluded')throw new FoundationError('STALE_AUTHORITY');
  const run=runSchema.parse((await tx.query('SELECT record FROM fabric.recovery_runs WHERE tenant_id=$1 AND space_id=$2 AND run_id=$3',[...ids(scope),s.config.runId])).rows[0]?.record);
  if(o.generation===null||run.generation.worker<=o.generation)throw new FoundationError('STALE_AUTHORITY','Fence original worker before explicit read-only resume');
  o.state='queued';o.wait=null;o.detail='explicit-fenced-resume';o.submittedAt=null;await this.saveOccurrence(tx,scope,o);await this.save(tx,scope,s);return o;
 });}
 /** Read original checkpoint/effect only; never invokes a model/write callback.
  * Unknown effects stay reconciling and are handled by the existing exact protocol. */
 async recover(scope:VerifiedScope,id:string):Promise<Occurrence>{uuid.parse(id);return this.repo.uow.withScope(scope,async tx=>{
  const unlocked=(await tx.query('SELECT schedule_id FROM fabric.recovery_occurrences WHERE tenant_id=$1 AND space_id=$2 AND occurrence_id=$3',[...ids(scope),id])).rows[0];if(!unlocked)throw new FoundationError('UNAUTHORIZED');await this.lock(tx,scope,String(unlocked.schedule_id));const s=await this.read(tx,scope,String(unlocked.schedule_id)),o=await this.readOccurrence(tx,scope,id);this.owner(scope,s);if(!['submitted','reconciling'].includes(o.state))return o;
  const now=await this.now(tx),a=await this.authority(tx,scope,s,now);if(a){o.state='reconciling';if(o.wait?.reason!==a)o.wait=this.wait(s,now,a);o.detail=a;await this.saveOccurrence(tx,scope,o);return o;}
  if((await unresolvedRunEffects(tx,scope,s.config.runId)).length){o.state='reconciling';if(o.wait?.reason!=='approval')o.wait=this.wait(s,now,'approval');o.detail='reconcile-original-operation-no-replay';}
  else if(s.config.operationId){const effect=(await tx.query('SELECT record FROM fabric.recovery_operations WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3',[...ids(scope),s.config.operationId])).rows[0];if(effect&&effectSchema.parse(effect.record).state==='confirmed'){o.state='completed';o.wait=null;o.detail='original-effect-confirmed';}else{o.state='reconciling';if(o.wait?.reason!=='approval')o.wait=this.wait(s,now,'approval');o.detail='reconcile-original-operation-no-replay';}}
  else {const event=(await tx.query('SELECT record FROM fabric.recovery_session_events WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3 AND sequence=$4',[...ids(scope),s.config.sessionId,s.config.sequence])).rows[0];if(event){o.state='completed';o.wait=null;o.detail='original-checkpoint-confirmed';}
   else if(o.generation===null&&o.submittedAt===null){
    // This occurrence was fenced before admission, so there is no worker/I/O to
    // recover or replay. Recheck all current gates before making it claimable.
    const reason=await this.gate(tx,scope,s,o,now);o.state=reason?'waiting':'queued';o.wait=reason?this.wait(s,now,reason.reason):null;o.detail=reason?.detail??'prerequisites-reconciled-before-admission';
   }else{o.state='reconciling';if(o.wait?.reason!=='resource')o.wait=this.wait(s,now,'resource');o.detail='checkpoint-absent-explicit-resume-required';}}
  await this.saveOccurrence(tx,scope,o);return o;
 });}
}
