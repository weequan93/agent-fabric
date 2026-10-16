/** Owned-local-fixture recovery boundary. No SQL, execution, transfer or send port.
 * The deployed original-owner implementation and real COMMIT remain separate. */
import {performance} from 'node:perf_hooks';
import {ContractKernel,type OriginalSnapshot,type FreshReconciliationAuthority,type Observation} from './contracts.js';
import {ReconciliationDataSchema,ObservationSchema,OriginalSnapshotSchema,object,literal,uuid,digest,timestamp} from './schemas.js';
import {assertVerifiedScope,revalidateScope,bindingDigest,effectBindingSchema,effectSchema,generationSchema,assertEffectTransition,receiptMatches,downstreamReceiptSchema,effectKey,type VerifiedScope,type Effect,type DownstreamReceipt} from './owners.js';
import {immutable} from './intent.js';
export interface LocalOriginalRead {
 readonly effect:Effect;readonly snapshot:OriginalSnapshot;readonly instanceId:string;readonly bootId:string;
 readonly connectorDigest:string;readonly trustDigest:string;readonly lookupPolicyDigest:string;
 readonly historicalDigest:string;readonly sessionExpiresAt:string;readonly held:true;readonly dispatchFenced:true;
}
export interface LocalSettlementReceipt {readonly operationId:string;readonly key:string;readonly payloadDigest:string;readonly receiptDigest:string;readonly dispatch:false;readonly assurance:'owned-local-fixture'}
/** Trusted owner output, never a caller-supplied grant or process-success flag. */
export const LocalQuiescenceSchema=object({operationId:uuid,originalBindingDigest:digest,snapshotDigest:digest,
 instanceId:uuid,bootId:uuid,resourceId:uuid,generation:generationSchema,observedAt:timestamp,
 descendantsQuiescent:literal(true),streamsClosed:literal(true),digest});
export type LocalQuiescence=ReturnType<typeof LocalQuiescenceSchema.parse>;
export interface LocalSettlementPorts {
 now():number;
 /** Local fixture lock only. A real owner requires its original key/barrier/UoW. */
 exclusive<T>(scope:VerifiedScope,key:string,fn:()=>Promise<T>):Promise<T>;
 read(scope:VerifiedScope,id:string):Promise<LocalOriginalRead>;
 /** Checks current session/task read+write/source/policy and historical exact approval. */
 authorize(scope:VerifiedScope,original:LocalOriginalRead):Promise<void>;
 lookupCommand(scope:VerifiedScope,key:string,payloadDigest:string):Promise<LocalSettlementReceipt|null>;
 /** Installed exact original-status GET. No endpoint, receipt or driver from caller. */
 statusGet(scope:VerifiedScope,original:LocalOriginalRead):Promise<{receipt:DownstreamReceipt;terminal:true;method:'GET';connectorDigest:string;trustDigest:string}>;
 quiescence(scope:VerifiedScope,original:LocalOriginalRead):Promise<LocalQuiescence>;
 /** Recheck independent process/stream exclusion after the metadata lock wait.
  * This port cannot renew or start execution. */
 verifyQuiescence(scope:VerifiedScope,original:LocalOriginalRead,proof:LocalQuiescence):Promise<void>;
 /** Metadata-only CAS on this fixture's original ledger, not a second effect ledger. */
 commit(scope:VerifiedScope,original:LocalOriginalRead,next:Effect,evidence:Observation,receipt:LocalSettlementReceipt):Promise<void>;
}
interface Issued {scope:VerifiedScope;original:LocalOriginalRead;deadline:number}
function requireValue(value:unknown,code='STALE_AUTHORITY'):asserts value {if(!value)throw new Error(code);}
// Canonical inputs cannot contain undefined; keep the authenticating session out
// of the historical/CAS identity without serializing it as an execution lease.
function originalIdentity(o:LocalOriginalRead){const {sessionExpiresAt:_session,...rest}=o;return bindingDigest(rest);}
export class LocalOriginalSettlement {
 private readonly authorities=new WeakMap<object,Issued>();
 private readonly observations=new WeakMap<object,{authority:FreshReconciliationAuthority;receipt:DownstreamReceipt;quiescence:LocalQuiescence}>();
 private readonly kernel:ContractKernel;
 constructor(private readonly ports:LocalSettlementPorts){
  this.kernel=new ContractKernel({requireQualification:async()=>{throw new Error('UNSUPPORTED');},requireLease:async()=>{throw new Error('UNSUPPORTED');},requireApproval:async()=>{throw new Error('UNSUPPORTED');},requireReconciliation:async(a,s)=>this.requireAuthority(a,s),requireObservation:async o=>{
   requireValue(typeof o==='object'&&o!==null,'UNISSUED_OBSERVATION');const proof=this.observations.get(o);requireValue(proof,'UNISSUED_OBSERVATION');
   const issued=this.authorities.get(proof.authority);requireValue(issued,'UNISSUED_AUTHORITY');await this.requireQuiescence(proof.quiescence,proof.authority,issued);
  }},ports.now);
 }
 private async checked(scope:VerifiedScope,id:string):Promise<LocalOriginalRead>{
  assertVerifiedScope(scope);await revalidateScope(scope);const o=await this.ports.read(scope,id);
  effectSchema.parse(o.effect);const e=effectBindingSchema.parse(o.effect.binding),s=OriginalSnapshotSchema.parse(o.snapshot);
  uuid.parse(o.instanceId);uuid.parse(o.bootId);digest.parse(o.connectorDigest);digest.parse(o.trustDigest);digest.parse(o.lookupPolicyDigest);digest.parse(o.historicalDigest);timestamp.parse(o.sessionExpiresAt);
  requireValue(e.operationId===id&&s.operationId===id&&e.actorId===scope.actorId&&s.actorId===scope.actorId&&e.run.task.tenantId===scope.tenantId&&e.run.task.spaceId===scope.spaceId,'BINDING_CONFLICT');
  requireValue(e.effectClass==='external-write'&&e.mutationPath==='api'&&e.downstream==='idempotency-and-lookup'&&s.originalBindingDigest===bindingDigest(e),'UNSUPPORTED');
  requireValue(o.held&&o.dispatchFenced&&['dispatched','unknown','reconciling','confirmed'].includes(o.effect.state),'RECONCILIATION_REQUIRED');
  requireValue(s.stopped||Date.parse(s.leaseExpiresAt)<=this.ports.now()||Date.parse(s.effectExpiresAt)<=this.ports.now(),'EXECUTION_STILL_LIVE');
  await this.ports.authorize(scope,o);await revalidateScope(scope);return immutable(o);
 }
 private async requireQuiescence(raw:LocalQuiescence,authority:FreshReconciliationAuthority,issued:Issued):Promise<void>{
  const q=LocalQuiescenceSchema.parse(raw),o=issued.original,now=this.ports.now();
  requireValue(q.operationId===o.effect.binding.operationId&&q.originalBindingDigest===bindingDigest(o.effect.binding)&&q.snapshotDigest===bindingDigest(o.snapshot)&&
   q.instanceId===o.instanceId&&q.bootId===o.bootId&&q.resourceId===o.effect.binding.resourceId&&bindingDigest(q.generation)===bindingDigest(o.snapshot.generation),'QUIESCENCE_BINDING_CONFLICT');
  requireValue(Number.isFinite(now)&&Date.parse(q.observedAt)>=Date.parse(authority.issuedAt)&&Date.parse(q.observedAt)<=now&&now<Date.parse(authority.expiresAt),'STALE_QUIESCENCE');
  await this.ports.verifyQuiescence(issued.scope,o,q);await this.requireAuthority(authority,issued.scope);
 }
 private async requireAuthority(raw:unknown,scope:VerifiedScope):Promise<void>{
  requireValue(typeof raw==='object'&&raw!==null,'UNISSUED_AUTHORITY');const a=raw as FreshReconciliationAuthority,issued=this.authorities.get(a);
  requireValue(issued&&issued.scope===scope,'UNISSUED_AUTHORITY');
  requireValue(performance.now()<issued.deadline&&Date.parse(a.expiresAt)>this.ports.now(),'STALE_AUTHORITY');
  const current=await this.checked(scope,a.operationId);requireValue(originalIdentity(current)===originalIdentity(issued.original),'BINDING_CONFLICT');
  requireValue(performance.now()<issued.deadline&&Date.parse(a.expiresAt)>this.ports.now(),'STALE_AUTHORITY');
 }
 /** A fresh authority and observation never leave this owning instance. */
 async recover(scope:VerifiedScope,operationId:string):Promise<{receipt:LocalSettlementReceipt;authority:{dispatch:false;issuedAt:string;expiresAt:string};observation:Observation|null}> {
  const key=effectKey(operationId,'f06-original-settlement');
  const payload=(o:LocalOriginalRead)=>bindingDigest({operationId,originalBindingDigest:bindingDigest(o.effect.binding)});
  const lookup=await this.ports.exclusive(scope,key,async()=>{
   const o=await this.checked(scope,operationId),digest=payload(o),prior=await this.ports.lookupCommand(scope,key,digest);
   if(prior){requireValue(o.effect.state==='confirmed'&&o.effect.receiptDigest===prior.receiptDigest,'BINDING_CONFLICT');return {prior};}
   const started=performance.now(),now=this.ports.now(),expires=Math.min(now+30_000,Date.parse(o.sessionExpiresAt));
   const authority=immutable(ReconciliationDataSchema.parse({operationId,originalBindingDigest:bindingDigest(o.effect.binding),actorId:scope.actorId,authorityRevision:scope.authorityRevision,stoppedOrExpiredSnapshotDigest:bindingDigest(o.snapshot),lookupPolicyDigest:o.lookupPolicyDigest,issuedAt:new Date(now).toISOString(),expiresAt:new Date(expires).toISOString(),sessionExpiresAt:o.sessionExpiresAt,dispatch:false})) as FreshReconciliationAuthority;
   this.authorities.set(authority,{scope,original:o,deadline:started+expires-now});await this.requireAuthority(authority,scope);
   const status=await this.ports.statusGet(scope,o),receipt=downstreamReceiptSchema.parse(status.receipt);
   requireValue(status.method==='GET'&&status.terminal===true&&status.connectorDigest===o.connectorDigest&&status.trustDigest===o.trustDigest&&receiptMatches(o.effect.binding,receipt),'UNTRUSTED_ORIGINAL_STATUS');
   const q=immutable(LocalQuiescenceSchema.parse(await this.ports.quiescence(scope,o)));await this.requireQuiescence(q,authority,this.authorities.get(authority)!);
   const observation=immutable(ObservationSchema.parse({operationId,originalBindingDigest:bindingDigest(o.effect.binding),target:o.effect.binding.target,connectorDigest:o.connectorDigest,trustDigest:o.trustDigest,lookupPolicyDigest:o.lookupPolicyDigest,generation:o.snapshot.generation,bootId:o.bootId,observedAt:new Date(this.ports.now()).toISOString(),method:'GET',outcome:'APPLIED',writeNumber:receipt.writeNumber,targetReceiptDigest:bindingDigest(receipt),quiescenceDigest:q.digest,descendantsQuiescent:true,streamsClosed:true}));
   this.observations.set(observation,{authority,receipt,quiescence:q});return {o,authority,observation,receipt,digest};
  });
  if('prior' in lookup&&lookup.prior)return {receipt:lookup.prior,authority:{dispatch:false,issuedAt:'original-command-lookup',expiresAt:'current-disclosure-only'},observation:null};
  requireValue('o' in lookup&&lookup.o);const {o,authority,observation,receipt,digest}=lookup;
  return this.ports.exclusive(scope,key,async()=>{
   await this.requireAuthority(authority,scope);const prior=await this.ports.lookupCommand(scope,key,digest);
   if(prior)return {receipt:prior,authority:{dispatch:false as const,issuedAt:authority.issuedAt,expiresAt:authority.expiresAt},observation};
   await this.kernel.settlement(scope,authority,o.snapshot,observation,receipt,{effect:o.effect.binding,connectorDigest:o.connectorDigest,trustDigest:o.trustDigest,lookupPolicyDigest:o.lookupPolicyDigest,bootId:o.bootId,currentSnapshot:o.snapshot});
   let state=o.effect.state;if(state==='unknown'){assertEffectTransition(state,'reconciling');state='reconciling';}assertEffectTransition(state,'confirmed');
   const next=effectSchema.parse({...o.effect,state:'confirmed',receiptDigest:bindingDigest(receipt),nextAction:null});
   const result:LocalSettlementReceipt=immutable({operationId,key,payloadDigest:digest,receiptDigest:bindingDigest(receipt),dispatch:false,assurance:'owned-local-fixture'});
   const issued=this.authorities.get(authority),proof=this.observations.get(observation);requireValue(issued&&proof,'UNISSUED_OBSERVATION');
   await this.requireQuiescence(proof.quiescence,authority,issued);await this.requireAuthority(authority,scope);await this.ports.commit(scope,o,next,observation,result);
   this.authorities.delete(authority);this.observations.delete(observation);
   return {receipt:result,authority:{dispatch:false as const,issuedAt:authority.issuedAt,expiresAt:authority.expiresAt},observation};
  });
 }
}
