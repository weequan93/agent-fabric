/** Local orchestration ports. Neither a reservation nor this adapter certifies OS isolation. */
import {assertVerifiedScope,revalidateScope,bindingDigest,type VerifiedScope} from './owners.js';
import {uuid} from './schemas.js';
import type {ResourceRepository,ResourceTicket} from './resource-repository.js';
export type RuntimeDocument=Readonly<Record<string,unknown>>;
/** Backend must serialize the entire callback and its beforeCommit check durably. */
export interface RuntimeStateTransaction {get<T>(kind:string,key:string):T|null;put<T>(kind:string,key:string,value:T):void;list<T>(kind:string):readonly T[]}
export interface RuntimeStateStore {transaction<T>(body:(tx:RuntimeStateTransaction)=>Promise<T>,beforeCommit:()=>Promise<void>):Promise<T>}
export class AllocationError extends Error {constructor(readonly code:'forbidden'|'binding-conflict'|'admission-required'|'unsupported-trust'|'unsupported-separation'|'allocation-unknown'|'not-found'|'lease-required'|'stale-instance'|'revision-conflict'|'unsafe-path'|'unsafe-suspend'){super(code);}}
export async function runtimeAuthority(scope:VerifiedScope,grant='task:write'):Promise<void>{assertVerifiedScope(scope);await revalidateScope(scope);if(!scope.grants.includes(grant))throw new AllocationError('forbidden');}
export function runtimeScopeKey(scope:VerifiedScope):string{return bindingDigest({tenantId:scope.tenantId,spaceId:scope.spaceId,actorId:scope.actorId,payerId:scope.payerId});}
export function runtimeSpaceKey(scope:VerifiedScope):string{return bindingDigest({tenantId:scope.tenantId,spaceId:scope.spaceId,payerId:scope.payerId});}
export interface ComputerAssignment {readonly assignmentId:string;readonly storageBindingId:string;readonly tenantId:string;readonly spaceId:string}
export interface AllocationSlot {readonly assignment:ComputerAssignment;readonly providerKey:string;readonly state:'creating'|'unknown'|'ready';readonly instanceId:string|null;readonly bootId:string|null;readonly ownerScope:string;readonly reason:string}
export interface AllocationProvider {create(assignment:ComputerAssignment,originalKey:string):Promise<{instanceId:string;bootId:string}>;lookup(assignment:ComputerAssignment,originalKey:string):Promise<{instanceId:string;bootId:string}|null>}
export interface ComputerAdmission {require(scope:VerifiedScope,assignment:ComputerAssignment,originalAdmission:unknown):Promise<void>}
function assignment(scope:VerifiedScope,value:ComputerAssignment):ComputerAssignment {
 uuid.parse(value.assignmentId);uuid.parse(value.storageBindingId);if(value.tenantId!==scope.tenantId||value.spaceId!==scope.spaceId)throw new AllocationError('binding-conflict');return Object.freeze({...value});
}
export class SingleAssignmentAllocator {
 constructor(private readonly store:RuntimeStateStore,private readonly provider:AllocationProvider,private readonly admissions:ComputerAdmission){}
 async ensure(scope:VerifiedScope,raw:ComputerAssignment,originalAdmission:unknown):Promise<AllocationSlot>{
  await runtimeAuthority(scope);const a=assignment(scope,raw);await this.admissions.require(scope,a,originalAdmission);await runtimeAuthority(scope);
  // The Space has one assignment slot, independently of task/waiter identities.
  const key=bindingDigest({tenantId:a.tenantId,spaceId:a.spaceId});let newlyReserved=false;
  const slot=await this.store.transaction(async tx=>{
   const old=tx.get<AllocationSlot>('allocation',key);
   if(old){if(bindingDigest(old.assignment)!==bindingDigest(a)||old.ownerScope!==runtimeSpaceKey(scope))throw new AllocationError('binding-conflict');return old;}
   const next:AllocationSlot={assignment:a,providerKey:bindingDigest({assignment:a,operation:'original-create'}),state:'creating',instanceId:null,bootId:null,ownerScope:runtimeSpaceKey(scope),reason:'original-create-slot-retained'};
   tx.put('allocation',key,next);newlyReserved=true;return next;
  },()=>runtimeAuthority(scope));
  if(slot.state==='ready'||slot.reason==='observed-suspended')return slot;
  await runtimeAuthority(scope);await this.admissions.require(scope,a,originalAdmission);await runtimeAuthority(scope);
  let observed:{instanceId:string;bootId:string}|null=null;
  try{observed=newlyReserved?await this.provider.create(a,slot.providerKey):await this.provider.lookup(a,slot.providerKey);}
  catch{/* Uncertain original slot stays occupied. Never invent a replacement command. */}
  return this.store.transaction(async tx=>{
   const current=tx.get<AllocationSlot>('allocation',key)!;
   if(current.state==='ready')return current;
   const next:AllocationSlot=observed?{...current,state:'ready',instanceId:uuid.parse(observed.instanceId),bootId:uuid.parse(observed.bootId),reason:'original-inventory-observed'}:{...current,state:'unknown',reason:'lookup-original-inventory-no-replacement'};
   tx.put('allocation',key,next);return next;
  },()=>runtimeAuthority(scope));
 }
 async lookup(scope:VerifiedScope):Promise<AllocationSlot|null>{await runtimeAuthority(scope,'task:read');return this.store.transaction(async tx=>{
  const s=tx.get<AllocationSlot>('allocation',bindingDigest({tenantId:scope.tenantId,spaceId:scope.spaceId}));if(s&&s.ownerScope!==runtimeSpaceKey(scope))throw new AllocationError('not-found');return s;
 },()=>runtimeAuthority(scope,'task:read'));}
}
export function requireWorkload(request:{execution:'service'|'computer';trust:'same-trust'|'hostile'|'different-privilege';requiresSeparation:boolean}):void{
 if(!['service','computer'].includes(request.execution)||typeof request.requiresSeparation!=='boolean')throw new AllocationError('unsupported-separation');
 if(request.trust!=='same-trust')throw new AllocationError('unsupported-trust');
 if(request.execution==='computer'&&request.requiresSeparation)throw new AllocationError('unsupported-separation');
}
/** Backend atomically rechecks the ORIGINAL durable ticket and claims its execution
 * slot before effects. Release proofs must exclude this slot and all descendants. */
export interface OwnedExecutionPort {run(ticket:ResourceTicket,slot:AllocationSlot):Promise<{effectDigest:string;quiescence:unknown}>}
export class OwnedExecutor {
 constructor(private readonly resources:ResourceRepository,private readonly allocator:SingleAssignmentAllocator,private readonly backend:OwnedExecutionPort){}
 async execute(scope:VerifiedScope,key:string):Promise<{effectDigest:string;ticket:ResourceTicket}>{
  await runtimeAuthority(scope);const t=await this.resources.lookup(scope,key);if(t.state!=='owned'||t.cancelRequested)throw new AllocationError('lease-required');
  const slot=await this.allocator.lookup(scope);if(!slot||slot.state!=='ready')throw new AllocationError('allocation-unknown');
  if(t.request.binding.assignmentId!==slot.assignment.assignmentId||t.request.binding.storageBindingId!==slot.assignment.storageBindingId)throw new AllocationError('binding-conflict');
  // Basic same-trust fixture serializes every computer writer, even apparently disjoint paths.
  if(!t.request.resources.some(r=>r.resourceId===slot.assignment.assignmentId&&r.mode==='write'))throw new AllocationError('lease-required');
  await runtimeAuthority(scope);const result=await this.backend.run(t,slot);await runtimeAuthority(scope);
  return {effectDigest:result.effectDigest,ticket:await this.resources.release(scope,key,result.quiescence)};
 }
}
export interface PromotionPort {
 /** Resolve under trusted canonical descriptors, including tree/symlink aliases. */
 resolve(relativePath:string):Promise<{resourceId:string;relativePath:string}>;
 /** Atomically recheck current ticket/resource ownership and CAS before publishing. */
 publish(ticket:ResourceTicket,relativePath:string,expectedVersion:number,bytes:Uint8Array):Promise<{version:number;digest:string}>;
}
export class CanonicalPromotion {
 constructor(private readonly resources:ResourceRepository,private readonly owner:PromotionPort,private readonly admittedAct:{require(scope:VerifiedScope,original:unknown):Promise<void>}){}
 async promote(scope:VerifiedScope,key:string,path:string,expectedVersion:number,bytes:Uint8Array,original:unknown){
  await runtimeAuthority(scope);await this.admittedAct.require(scope,original);const ticket=await this.resources.lookup(scope,key);
  if(ticket.state!=='owned'||ticket.cancelRequested)throw new AllocationError('lease-required');
  if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||bytes.byteLength>1024*1024)throw new AllocationError('revision-conflict');
  if(path!==path.normalize('NFC')||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new AllocationError('unsafe-path');
  const resolved=await this.owner.resolve(path);
  if(!ticket.request.resources.some(r=>r.resourceId===resolved.resourceId&&r.mode==='write'))throw new AllocationError('lease-required');
  await runtimeAuthority(scope);return this.owner.publish(ticket,resolved.relativePath,expectedVersion,bytes);
 }
}
/** Read-only scoped projection. Caller cannot turn its fields into an admission or lease. */
export async function queueSummary(scope:VerifiedScope,resources:ResourceRepository,originalKeys:readonly string[]){
 await runtimeAuthority(scope,'task:read');const tickets=await resources.snapshot(scope,originalKeys);await runtimeAuthority(scope,'task:read');
 return Object.freeze({authority:false as const,qualified:false as const,scope:{tenantId:scope.tenantId,spaceId:scope.spaceId},items:tickets.map(t=>({ticketId:t.ticketId,taskId:t.request.binding.taskId,state:t.state,ownerTaskId:t.ownerTaskId,reason:t.reason,resolver:t.resolver,charges:t.charges})),observedAt:new Date().toISOString()});
}
