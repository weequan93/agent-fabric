import {FoundationError,type SqlTransaction,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {CurrentAudienceVerifier} from '../../g1-identity/src/audience.js';
import type {SourceAudienceBinding} from '../../g1-identity/src/contracts.js';
import {RecoveryRepository} from './repository.js';
import {bindingDigest} from './contracts.js';
import {digest,enumeration,nullable,object,positive,revision,text,uuid,type Value} from './schema.js';
export const notificationSchema=object({notificationId:uuid,runId:uuid,recipientId:uuid,resultDigest:digest,state:enumeration('pending','sent','failed','unknown'),attempts:revision,maxAttempts:positive,deepLink:text,nextAction:nullable(text),dispatchEndpoint:nullable(text)});
export type NotificationRecord=Value<typeof notificationSchema>;
export const notificationHintSchema=object({notificationId:uuid,runId:uuid,recipientId:uuid,resultDigest:digest,deepLink:text});
export type NotificationHint=Value<typeof notificationHintSchema>;
const receiptSchema=object({notificationId:uuid,hintDigest:digest,writeNumber:positive});
export type NotificationReceipt=Value<typeof receiptSchema>;
export function notificationId(runId:string,recipientId:string):string{uuid.parse(runId);uuid.parse(recipientId);const h=bindingDigest({runId,recipientId}).slice(7);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
export function notificationHint(n:NotificationRecord):NotificationHint{return notificationHintSchema.parse({notificationId:n.notificationId,runId:n.runId,recipientId:n.recipientId,resultDigest:n.resultDigest,deepLink:n.deepLink});}
export function notificationEndpoint(raw:string):string{const u=new URL(raw);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw new FoundationError('INVALID_INPUT','Owned loopback endpoint required');return u.origin;}
/** Durable notification outbox, independent of immutable attempt completion and
 * artifact/delivery records. Unknown sends are never retried, only queried. */
export class NotificationRepository {
 constructor(readonly repo:RecoveryRepository){}
 private async lock(tx:SqlTransaction,s:VerifiedScope,id:string){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['notification',s.tenantId,s.spaceId,id])]);}
 private async auth(tx:SqlTransaction,s:VerifiedScope,runId:string,recipientId:string,writing:boolean,requireRead=true){
  if(requireRead&&!s.grants.includes('task:read'))throw new FoundationError('UNAUTHORIZED');
  const row=(await tx.query('SELECT o.record,t.actor_id FROM fabric.recovery_attempt_outcomes o JOIN fabric.runs r USING(tenant_id,space_id,run_id) JOIN fabric.tasks t USING(tenant_id,space_id,task_id) WHERE o.tenant_id=$1 AND o.space_id=$2 AND o.run_id=$3',[s.tenantId,s.spaceId,runId])).rows[0];
  if(!row)throw new FoundationError('UNAUTHORIZED');
  const resultTaskId=uuid.parse((row.record as Record<string,unknown>).taskId);const authority=(await tx.query('SELECT fabric.recovery_notification_authority($1,$2) AS authority',[resultTaskId,recipientId])).rows[0]?.authority as {ownerActorId:string}|null;if(!authority)throw new FoundationError('UNAUTHORIZED');if(writing&&s.actorId!==row.actor_id&&s.actorId!==authority.ownerActorId)throw new FoundationError('UNAUTHORIZED');
  const r=row.record as Record<string,unknown>,{resultDigest,...bound}=r;
  if(digest.parse(resultDigest)!==bindingDigest(bound))throw new FoundationError('INVALID_INPUT','Corrupt immutable outcome');
  await new CurrentAudienceVerifier().verify(tx,s,r.audience as SourceAudienceBinding);
  if(!(r.audience as SourceAudienceBinding).recipientActorIds.includes(recipientId))throw new FoundationError('UNAUTHORIZED');
  return {resultDigest:resultDigest as string,taskId:uuid.parse(r.taskId)};
 }
 private async read(tx:SqlTransaction,s:VerifiedScope,id:string){const row=(await tx.query('SELECT run_id,binding,record FROM fabric.recovery_notifications WHERE tenant_id=$1 AND space_id=$2 AND notification_id=$3',[s.tenantId,s.spaceId,id])).rows[0];if(!row)throw new FoundationError('UNAUTHORIZED');const n=notificationSchema.parse(row.record);if(n.maxAttempts!==3||n.attempts>3||n.notificationId!==id||n.runId!==row.run_id||notificationId(n.runId,n.recipientId)!==id||bindingDigest(notificationHint(n))!==bindingDigest(row.binding)||(n.state==='pending'?(n.attempts!==0||n.dispatchEndpoint!==null):(n.attempts===0||n.dispatchEndpoint===null)))throw new FoundationError('INVALID_INPUT');if(n.dispatchEndpoint!==null)notificationEndpoint(n.dispatchEndpoint);return n;}
 private async save(tx:SqlTransaction,s:VerifiedScope,n:NotificationRecord){await tx.query('UPDATE fabric.recovery_notifications SET record=$4 WHERE tenant_id=$1 AND space_id=$2 AND notification_id=$3',[s.tenantId,s.spaceId,n.notificationId,JSON.stringify(notificationSchema.parse(n))]);}
 async enqueue(s:VerifiedScope,runId:string,recipientId:string):Promise<NotificationRecord>{return this.enqueueIntent(s,runId,recipientId,true);}
 /** Trusted completion transaction only: records an intent, never sends it. */
 async enqueueCompleted(s:VerifiedScope,runId:string,recipientId:string):Promise<NotificationRecord>{if(!s.grants.includes('task:write'))throw new FoundationError('UNAUTHORIZED');return this.enqueueIntent(s,runId,recipientId,false);}
 private async enqueueIntent(s:VerifiedScope,runId:string,recipientId:string,ownerRequired:boolean):Promise<NotificationRecord>{uuid.parse(runId);uuid.parse(recipientId);return this.repo.uow.withScope(s,async tx=>{
  const result=await this.auth(tx,s,runId,recipientId,ownerRequired,ownerRequired),id=notificationId(runId,recipientId);await this.lock(tx,s,id);
  const n=notificationSchema.parse({notificationId:id,runId,recipientId,resultDigest:result.resultDigest,state:'pending',attempts:0,maxAttempts:3,deepLink:'/tasks/'+result.taskId,nextAction:'send-original-id',dispatchEndpoint:null});
  await tx.query('INSERT INTO fabric.recovery_notifications(tenant_id,space_id,notification_id,run_id,binding,record) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[s.tenantId,s.spaceId,id,runId,JSON.stringify(notificationHint(n)),JSON.stringify(n)]);return this.read(tx,s,id);
 });}
 async get(s:VerifiedScope,id:string):Promise<NotificationRecord>{uuid.parse(id);return this.repo.uow.withScope(s,async tx=>{const n=await this.read(tx,s,id);const r=await this.auth(tx,s,n.runId,n.recipientId,false);if(r.resultDigest!==n.resultDigest)throw new FoundationError('INVALID_INPUT');return n;});}
 private confirmed(value:unknown,n:NotificationRecord):boolean{try{const r=receiptSchema.parse(value);return r.notificationId===n.notificationId&&r.hintDigest===bindingDigest(notificationHint(n));}catch{return false;}}
 async send(s:VerifiedScope,id:string,rawEndpoint:string):Promise<NotificationRecord>{uuid.parse(id);const endpoint=notificationEndpoint(rawEndpoint);
  // This commit is the crash marker. An absent acknowledgement cannot erase it.
  const reserved=await this.repo.uow.withScope(s,async tx=>{await this.lock(tx,s,id);const n=await this.read(tx,s,id);await this.auth(tx,s,n.runId,n.recipientId,true);if(n.dispatchEndpoint!==null&&n.dispatchEndpoint!==endpoint)throw new FoundationError('STALE_AUTHORITY','Original endpoint binding required');if(n.state==='sent'||n.state==='unknown'||n.attempts===3)return {n,dispatch:false};const next=notificationSchema.parse({...n,state:'unknown',attempts:n.attempts+1,dispatchEndpoint:endpoint,nextAction:'lookup-original-id-no-retry'});await this.save(tx,s,next);return {n:next,dispatch:true};});
  if(!reserved.dispatch)return reserved.n;
  return this.repo.uow.withScope(s,async tx=>{await this.lock(tx,s,id);const n=await this.read(tx,s,id);await this.auth(tx,s,n.runId,n.recipientId,true);if(n.state!=='unknown'||n.attempts!==reserved.n.attempts)return n;
   let next=n;try{const response=await fetch(endpoint+'/notifications',{method:'POST',redirect:'error',signal:AbortSignal.timeout(2000),headers:{'content-type':'application/json'},body:JSON.stringify(notificationHint(n))}),body=await response.json() as {status?:string;receipt?:unknown;definitelyNotSent?:boolean};if(response.status===200&&body.status==='confirmed'&&this.confirmed(body.receipt,n))next=notificationSchema.parse({...n,state:'sent',nextAction:null});else if(response.status===503&&body.status==='rejected'&&body.definitelyNotSent===true)next=notificationSchema.parse({...n,state:'failed',nextAction:n.attempts===3?'retry-bound-exhausted':'retry-original-id'});}catch{/* Marker remains unknown. */}
   await this.auth(tx,s,n.runId,n.recipientId,true);await this.save(tx,s,next);return next;
  });
 }
 async reconcile(s:VerifiedScope,id:string,rawEndpoint:string):Promise<NotificationRecord>{uuid.parse(id);const endpoint=notificationEndpoint(rawEndpoint);return this.repo.uow.withScope(s,async tx=>{await this.lock(tx,s,id);const n=await this.read(tx,s,id);await this.auth(tx,s,n.runId,n.recipientId,true);if(n.dispatchEndpoint!==endpoint)throw new FoundationError('STALE_AUTHORITY','Original endpoint binding required');if(n.state!=='unknown')return n;let next=n;try{const response=await fetch(endpoint+'/notifications/'+encodeURIComponent(id),{redirect:'error',signal:AbortSignal.timeout(2000)}),body=await response.json() as {status?:string;receipt?:unknown};if(response.status===200&&body.status==='confirmed'&&this.confirmed(body.receipt,n))next=notificationSchema.parse({...n,state:'sent',nextAction:null});}catch{/* unsupported/absent/unavailable stay blocked */}await this.auth(tx,s,n.runId,n.recipientId,true);await this.save(tx,s,next);return next;});}
}
