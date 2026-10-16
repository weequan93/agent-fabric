/** Explicit fixture-unit accounting. Real collector/FinOps owner integration is a separate gate. */
import {AllocationError,runtimeAuthority,runtimeSpaceKey,type RuntimeStateStore} from './allocation.js';
import {bindingDigest,type VerifiedScope} from './owners.js';
export interface FixtureUsageReceipt {readonly domain:'owned-local-fixture';readonly unit:'fixture-unit';readonly assignmentId:string;readonly instanceId:string;readonly category:'compute'|'storage'|'network'|'cold-start';readonly intervalId:string;readonly collectorId:string;readonly sequence:number;readonly measuredDurationMs:number;readonly state:'continuing'|'ended'|'unknown';readonly estimate:number|null;readonly reservation:number|null;readonly settled:number|null}
interface BoundReceipt {readonly scopeKey:string;readonly receipt:FixtureUsageReceipt}
export class FixtureUsageLedger {
 constructor(private readonly store:RuntimeStateStore,private readonly collectors:{require(scope:VerifiedScope,receipt:FixtureUsageReceipt,original:unknown):Promise<void>}){}
 async observe(scope:VerifiedScope,r:FixtureUsageReceipt,original:unknown):Promise<FixtureUsageReceipt>{
  await runtimeAuthority(scope);await this.collectors.require(scope,r,original);
  if(r.domain!=='owned-local-fixture'||r.unit!=='fixture-unit'||!Number.isSafeInteger(r.sequence)||r.sequence<0||!Number.isSafeInteger(r.measuredDurationMs)||r.measuredDurationMs<0||[r.estimate,r.reservation,r.settled].some(x=>x!==null&&(!Number.isFinite(x)||x<0)))throw new AllocationError('binding-conflict');
  const key=bindingDigest({scope:runtimeSpaceKey(scope),assignment:r.assignmentId,instance:r.instanceId,category:r.category,interval:r.intervalId});
  return this.store.transaction(async tx=>{
   const previous=tx.get<BoundReceipt>('usage',key)?.receipt;
   if(previous){if(previous.collectorId!==r.collectorId)throw new AllocationError('binding-conflict');if(r.sequence<previous.sequence)return previous;if(r.sequence===previous.sequence){if(bindingDigest(previous)!==bindingDigest(r))throw new AllocationError('binding-conflict');return previous;}
    if(r.measuredDurationMs<previous.measuredDurationMs||previous.state==='ended'&&r.state!=='ended'||previous.settled!==null&&r.settled!==previous.settled)throw new AllocationError('binding-conflict');}
   tx.put<BoundReceipt>('usage',key,{scopeKey:runtimeSpaceKey(scope),receipt:r});return r;
  },()=>runtimeAuthority(scope));
 }
 async view(scope:VerifiedScope,taskIds:readonly string[]){await runtimeAuthority(scope,'task:read');return this.store.transaction(async tx=>{
  const intervals=tx.list<BoundReceipt>('usage').filter(r=>r.scopeKey===runtimeSpaceKey(scope)).map(r=>r.receipt);
  return {domain:'owned-local-fixture',unit:'fixture-unit',intervals,spaceMeasuredDurationMs:intervals.filter(r=>r.category==='compute').reduce((n,r)=>n+r.measuredDurationMs,0),tasks:taskIds.map(taskId=>({taskId,compute:'unallocated-shared-compute',settled:null})),unknown:intervals.some(r=>r.state==='unknown'||r.settled===null)};
 },()=>runtimeAuthority(scope,'task:read'));}
}
