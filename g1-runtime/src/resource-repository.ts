/** Durable reservation repository. Ownership is not a runtime/execution lease.
 * The storage port must atomically commit tickets and their entire resource sets.
 * Production SQL/current-authority integration is a separate qualification gate. */
import {randomUUID} from 'node:crypto';
import {QueueRequestSchema,uuid} from './schemas.js';
import type {QueueRequest} from './contracts.js';
import {assertVerifiedScope,revalidateScope,bindingDigest,type VerifiedScope} from './owners.js';
export type TicketState='waiting'|'owned'|'cancelled'|'expired'|'released';
export interface ResourceTicket {
 readonly ticketId:string;readonly sequence:number;readonly request:QueueRequest;
 readonly actorId:string;readonly payerId:string;readonly state:TicketState;
 readonly cancelRequested:boolean;readonly ownerTaskId:string|null;readonly reason:string;
 readonly resolver:string;readonly charges:'unknown'|'none';
}
export interface ResourceTransaction {
 tickets():readonly ResourceTicket[];
 save(ticket:ResourceTicket):void;
 /** Atomic backend constraints must reject partial or duplicate resource owners. */
 claim(ticket:ResourceTicket):void;
 release(ticket:ResourceTicket):void;
}
export interface ResourceStore {
 transaction<T>(body:(tx:ResourceTransaction)=>Promise<T>,beforeCommit:()=>Promise<void>):Promise<T>;
}
export interface ResourceReleaseProof {
 /** Must independently establish no executor/effect liability. Never inferred from expiry. */
 require(scope:VerifiedScope,ticket:ResourceTicket,proof:unknown):Promise<void>;
}
export class ResourceRepositoryError extends Error {
 constructor(readonly code:'binding-conflict'|'not-found'|'expired'|'revision-conflict'|'store-unavailable'|'commit-unknown'|'release-proof-required'|'forbidden'){super(code);}
}
export class ResourceStoreError extends Error {
 constructor(readonly outcome:'not-committed'|'unknown',message:string){super(message);}
}
const copy=(t:ResourceTicket):ResourceTicket=>Object.freeze({...t,request:QueueRequestSchema.parse(t.request)});
const key=(r:QueueRequest)=>r.idempotencyKey;
const conflicts=(a:QueueRequest,b:QueueRequest)=>a.binding.tenantId===b.binding.tenantId&&a.binding.spaceId===b.binding.spaceId&&a.resources.some(x=>b.resources.some(y=>x.resourceId===y.resourceId&&(x.mode==='write'||y.mode==='write')));
export class ResourceRepository {
 constructor(private readonly store:ResourceStore,private readonly releaseProof:ResourceReleaseProof,private readonly now:()=>number=Date.now){}
 private async authenticated<T>(scope:VerifiedScope,fn:(tx:ResourceTransaction)=>Promise<T>,grant='task:write'):Promise<T>{
  assertVerifiedScope(scope);await revalidateScope(scope);if(!scope.grants.includes(grant))throw new ResourceRepositoryError('forbidden');
  const claims:QueueRequest[]=[];
  try{return await this.store.transaction(async tx=>{
   await revalidateScope(scope);
   const guarded:ResourceTransaction={tickets:()=>tx.tickets(),save:t=>tx.save(t),release:t=>tx.release(t),claim:t=>{claims.push(t.request);tx.claim(t);}};
   const out=await fn(guarded);await revalidateScope(scope);return out;
  },async()=>{await revalidateScope(scope);if(claims.some(r=>Date.parse(r.expiresAt)<=this.now()))throw new ResourceRepositoryError('expired');});}
  catch(e){if(e instanceof ResourceStoreError)throw new ResourceRepositoryError(e.outcome==='unknown'?'commit-unknown':'store-unavailable');throw e;}
 }
 private visible(scope:VerifiedScope,t:ResourceTicket):boolean{return t.request.binding.tenantId===scope.tenantId&&t.request.binding.spaceId===scope.spaceId&&t.actorId===scope.actorId&&t.payerId===scope.payerId;}
 private find(scope:VerifiedScope,tx:ResourceTransaction,id:string):ResourceTicket {
  const t=tx.tickets().find(t=>key(t.request)===id&&this.visible(scope,t));if(!t)throw new ResourceRepositoryError('not-found');return t;
 }
 private request(scope:VerifiedScope,raw:unknown):QueueRequest {
  const r=QueueRequestSchema.parse(raw);
  if(r.binding.tenantId!==scope.tenantId||r.binding.spaceId!==scope.spaceId)throw new ResourceRepositoryError('binding-conflict');
  if(r.expectedRevision!==0)throw new ResourceRepositoryError('revision-conflict');return r;
 }
 private expire(tx:ResourceTransaction,scope:VerifiedScope):void {
  for(const t of tx.tickets())if(this.visible(scope,t)&&t.state==='waiting'&&Date.parse(t.request.expiresAt)<=this.now())tx.save(copy({...t,state:'expired',ownerTaskId:null,reason:'expired-before-acquire',charges:'none'}));
 }
 private blockers(tx:ResourceTransaction,t:ResourceTicket):readonly ResourceTicket[]{return tx.tickets().filter(o=>o.ticketId!==t.ticketId&&conflicts(t.request,o.request)&&(o.state==='owned'||o.state==='waiting'&&Date.parse(o.request.expiresAt)>this.now()&&o.sequence<t.sequence)).sort((a,b)=>a.sequence-b.sequence);}
 private waitingView(tx:ResourceTransaction,t:ResourceTicket):ResourceTicket {
  if(t.state!=='waiting')return t;const owner=this.blockers(tx,t)[0];
  return copy({...t,ownerTaskId:owner?.request.binding.taskId??null,reason:owner?'resource-set-conflict':'resources-eligible-awaiting-poll'});
 }
 private acquire(tx:ResourceTransaction,t:ResourceTicket):ResourceTicket {
  if(t.state!=='waiting')return t;
  const blockers=this.blockers(tx,t);
  if(blockers.length){const next=copy({...t,ownerTaskId:blockers[0]!.request.binding.taskId,reason:'resource-set-conflict',charges:'unknown'});tx.save(next);return next;}
  const next=copy({...t,state:'owned',ownerTaskId:t.request.binding.taskId,reason:'complete-resource-set-reserved',charges:'unknown'});tx.claim(next);tx.save(next);return next;
 }
 async admit(scope:VerifiedScope,raw:unknown):Promise<ResourceTicket>{
  // Authenticate before decoding, deduplication or any status disclosure.
  return this.authenticated(scope,async tx=>{
   const request=this.request(scope,raw);this.expire(tx,scope);
   const original=tx.tickets().find(t=>key(t.request)===key(request)&&t.request.binding.tenantId===scope.tenantId&&t.request.binding.spaceId===scope.spaceId&&t.actorId===scope.actorId);
   if(original){if(!this.visible(scope,original)||bindingDigest(original.request)!==bindingDigest(request))throw new ResourceRepositoryError('binding-conflict');return this.acquire(tx,original);}
   // A command identity cannot be rebound through a new idempotency key.
   if(tx.tickets().some(t=>t.request.binding.tenantId===scope.tenantId&&t.request.binding.spaceId===scope.spaceId&&t.actorId===scope.actorId&&t.request.commandId===request.commandId))throw new ResourceRepositoryError('binding-conflict');
   if(Date.parse(request.expiresAt)<=this.now())throw new ResourceRepositoryError('expired');
   const ticket=copy({ticketId:randomUUID(),sequence:Math.max(0,...tx.tickets().map(t=>t.sequence))+1,request,actorId:scope.actorId,payerId:scope.payerId,state:'waiting',cancelRequested:false,ownerTaskId:null,reason:'awaiting-atomic-acquisition',resolver:'Wait, cancel this request, or ask the current owner to release safely',charges:'unknown'});
   tx.save(ticket);return this.acquire(tx,ticket);
  });
 }
 async lookup(scope:VerifiedScope,originalKey:string):Promise<ResourceTicket>{return this.authenticated(scope,async tx=>{uuid.parse(originalKey);this.expire(tx,scope);const t=this.find(scope,tx,originalKey);return copy(this.waitingView(tx,t));},'task:read');}
 /** Read-only queue projection. Unlike command lookup it never persists expiry,
  * claims ownership, changes cancellation, or creates a lease. */
 async snapshot(scope:VerifiedScope,originalKeys:readonly string[]):Promise<readonly ResourceTicket[]>{return this.authenticated(scope,async tx=>{
  if(!Array.isArray(originalKeys)||originalKeys.length>32||new Set(originalKeys).size!==originalKeys.length)throw new ResourceRepositoryError('binding-conflict');
  return originalKeys.map(originalKey=>{uuid.parse(originalKey);const t=this.find(scope,tx,originalKey);
   if(t.state==='waiting'&&Date.parse(t.request.expiresAt)<=this.now())return copy({...t,state:'expired',ownerTaskId:null,reason:'expired-before-acquire',charges:'none'});
   return copy(this.waitingView(tx,t));
  });
 },'task:read');}
 async poll(scope:VerifiedScope,originalKey:string):Promise<ResourceTicket>{return this.authenticated(scope,async tx=>{uuid.parse(originalKey);this.expire(tx,scope);return copy(this.acquire(tx,this.find(scope,tx,originalKey)));});}
 async cancel(scope:VerifiedScope,originalKey:string):Promise<ResourceTicket>{return this.authenticated(scope,async tx=>{
  uuid.parse(originalKey);this.expire(tx,scope);const t=this.find(scope,tx,originalKey);
  if(t.state==='owned'){const n=copy({...t,cancelRequested:true,reason:'cancellation-requested-owner-held-until-safe-release'});tx.save(n);return n;}
  if(t.state!=='waiting')return copy(t);
  const n=copy({...t,state:'cancelled',ownerTaskId:null,reason:'cancelled-before-acquire',charges:'none'});tx.save(n);return n;
 });}
 async release(scope:VerifiedScope,originalKey:string,proof:unknown):Promise<ResourceTicket>{return this.authenticated(scope,async tx=>{
  uuid.parse(originalKey);const t=this.find(scope,tx,originalKey);if(t.state==='released')return copy(t);
  if(t.state!=='owned')throw new ResourceRepositoryError('release-proof-required');
  await this.releaseProof.require(scope,t,proof);await revalidateScope(scope);
  const n=copy({...t,state:'released',ownerTaskId:null,reason:'safe-repository-release',charges:'none'});tx.release(t);tx.save(n);return n;
 });}
}
