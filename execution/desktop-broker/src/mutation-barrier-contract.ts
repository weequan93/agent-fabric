import { canonicalDigest, nonEmptyString, nonNegativeInteger, requireCondition, type Clock, type FencingToken, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
import { FenceRegistry } from '../../action-broker/src/fencing.js';
import { types } from 'node:util';

export const MUTATION_PATHS = ['shell','sdk','api','filesystem','browser','desktop'] as const;
export type MutationPath = typeof MUTATION_PATHS[number];
export interface MutationLease { scope:ScopeRef;runId:string;owner:'agent'|'human';leaseId:string;expiresAt:number;fence:FencingToken }
function key(scope:ScopeRef,runId:string):string { const s=parseScope(scope);nonEmptyString(runId);return JSON.stringify([s.tenantId,s.spaceId]); }
/** One protocol barrier across all mutation paths; real containment remains G1/G3. */
export class ProtocolMutationBarrier {
  private readonly leases=new Map<string,MutationLease>(); private readonly disconnected=new Map<string,{runId:string;previousLeaseId:string;fence:FencingToken}>();private readonly busy=new Set<string>();private readonly usedLeaseIds=new Set<string>();
  constructor(private readonly clock:Clock,private readonly fences:FenceRegistry,private readonly authorizeScope:(scope:ScopeRef)=>void) {}
  acquire(scope:ScopeRef,runId:string,owner:'agent'|'human',leaseId:string,expiresAt:number):MutationLease {
    const s=parseScope(scope);this.authorizeScope(s);const id=key(s,runId);nonEmptyString(leaseId);nonNegativeInteger(expiresAt);
    requireCondition(owner==='agent'||owner==='human','INVALID_SCHEMA','Exclusive driver owner required');requireCondition(!this.disconnected.has(id),'STALE_FENCE','Reconnect does not resume input');
    requireCondition(expiresAt>nonNegativeInteger(this.clock.now()),'LEASE_EXPIRED','Fresh bounded lease required');
    requireCondition(!this.leases.has(id)&&!this.busy.has(id)&&!this.usedLeaseIds.has(leaseId),'STALE_FENCE','Current driver must be released explicitly');
    const fence=this.fences.current(s,runId);this.fences.assertCurrent(s,runId,fence);const lease:MutationLease={scope:s,runId,owner,leaseId,expiresAt,fence};this.leases.set(id,lease);this.usedLeaseIds.add(leaseId);return structuredClone(lease);
  }
  mutate<T>(lease:MutationLease,path:MutationPath,callback:()=>T):T {
    canonicalDigest(lease);
    requireCondition(!types.isAsyncFunction(callback),'INVALID_SCHEMA','G0 callbacks must be synchronous before invocation');
    this.authorizeScope(parseScope(lease.scope));const id=key(lease.scope,lease.runId);const current=this.leases.get(id);
    requireCondition(MUTATION_PATHS.includes(path),'REQUIRED_CAPABILITY_UNSUPPORTED','Uncovered mutation path');requireCondition(!this.disconnected.has(id)&&current!==undefined&&canonicalDigest(current)===canonicalDigest(lease),'STALE_FENCE','Old driver lease denied');
    requireCondition(lease.expiresAt>nonNegativeInteger(this.clock.now()),'LEASE_EXPIRED','Driver lease expired');this.fences.assertCurrent(lease.scope,lease.runId,lease.fence);requireCondition(!this.busy.has(id),'STALE_FENCE','Conflicting mutation in flight');
    this.busy.add(id);try { const result=callback();requireCondition(!(result!==null&&(typeof result==='object'||typeof result==='function')&&typeof (result as {then?:unknown}).then==='function'),'INVALID_SCHEMA','G0 barrier callbacks must be synchronous');return result; } finally {this.busy.delete(id);}
  }
  private validateSwitch(scope:ScopeRef,runId:string,leaseId:string,expiresAt:number):string {
    nonEmptyString(leaseId);nonNegativeInteger(expiresAt);const id=key(scope,runId);
    requireCondition(expiresAt>nonNegativeInteger(this.clock.now()),'LEASE_EXPIRED','Fresh bounded lease required');
    requireCondition(!this.usedLeaseIds.has(leaseId)&&!this.busy.has(id),'STALE_FENCE','Fresh lease and quiescent barrier required');
    this.fences.assertCurrent(scope,runId,this.fences.current(scope,runId));return id;
  }
  takeover(scope:ScopeRef,runId:string,leaseId:string,expiresAt:number):MutationLease {
    const s=parseScope(scope);this.authorizeScope(s);const id=this.validateSwitch(s,runId,leaseId,expiresAt);
    this.fences.bumpRuntime(s,runId);this.leases.delete(id);this.disconnected.delete(id);return this.acquire(s,runId,'human',leaseId,expiresAt);
  }
  returnToAgent(scope:ScopeRef,runId:string,leaseId:string,expiresAt:number,observedAndReconciled:boolean,observedLeaseId:string):MutationLease {
    const s=parseScope(scope);this.authorizeScope(s);requireCondition(observedAndReconciled===true,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Fresh observation and reconciliation required');
    const id=this.validateSwitch(s,runId,leaseId,expiresAt);const current=this.leases.get(id);const disconnected=this.disconnected.get(id);
    if(disconnected!==undefined){requireCondition(disconnected.runId===runId&&disconnected.previousLeaseId===observedLeaseId,'STALE_FENCE','Resume must bind the disconnected driver');this.fences.assertCurrent(s,runId,disconnected.fence);}
    else {requireCondition(current!==undefined&&current.owner==='human'&&current.runId===runId&&current.leaseId===observedLeaseId,'STALE_FENCE','Return must bind the current human driver');this.fences.assertCurrent(s,runId,current.fence);}
    this.fences.bumpRuntime(s,runId);this.leases.delete(id);this.disconnected.delete(id);return this.acquire(s,runId,'agent',leaseId,expiresAt);
  }
  disconnect(scope:ScopeRef,runId:string):void {
    const s=parseScope(scope);this.authorizeScope(s);const id=key(s,runId);const lease=this.leases.get(id);
    requireCondition(lease!==undefined&&lease.runId===runId&&!this.busy.has(id),'STALE_FENCE','Disconnect must bind the current driver');
    this.fences.assertCurrent(s,runId,lease.fence);const fence=this.fences.bumpRuntime(s,runId);this.leases.delete(id);this.disconnected.set(id,{runId,previousLeaseId:lease.leaseId,fence});
  }
  reconnect(scope:ScopeRef,runId:string):void {const s=parseScope(scope);this.authorizeScope(s);requireCondition(this.disconnected.has(key(s,runId)),'STALE_FENCE','Explicit new driver admission required');}
}
