import {randomUUID} from 'node:crypto';
import {AllocationError,runtimeAuthority,runtimeSpaceKey,type RuntimeStateStore,type ComputerAssignment,type AllocationSlot} from './allocation.js';
import {bindingDigest,type VerifiedScope} from './owners.js';
export interface InstanceState {readonly assignment:ComputerAssignment;readonly instanceId:string;readonly bootId:string;readonly instanceGrant:string;readonly ownerScope:string;readonly state:'running'|'suspended';readonly checkpointDigest:string|null}
export interface SuspendPrerequisites {readonly activeDrivers:number;readonly noncheckpointableChildren:number;readonly resourceLeases:number;readonly unknownEffects:number;readonly savedStateAllowed:boolean}
export interface LifecycleBackend {prerequisites(instance:InstanceState):Promise<SuspendPrerequisites>;suspend(instance:InstanceState):Promise<{checkpointDigest:string}>;resume(saved:InstanceState):Promise<{instanceId:string;bootId:string}>}
/** Instance and boot grants are never serialized into authority-restoring VM snapshots. */
export class RuntimeLifecycle {
 constructor(private readonly store:RuntimeStateStore,private readonly backend:LifecycleBackend){}
 private key(scope:VerifiedScope):string{return bindingDigest({tenantId:scope.tenantId,spaceId:scope.spaceId});}
 private get(scope:VerifiedScope,old:InstanceState|null):InstanceState {if(!old||old.ownerScope!==runtimeSpaceKey(scope))throw new AllocationError('not-found');return old;}
 private allocation(scope:VerifiedScope,slot:AllocationSlot|null):AllocationSlot {if(!slot||slot.ownerScope!==runtimeSpaceKey(scope))throw new AllocationError('not-found');return slot;}
 async install(scope:VerifiedScope,assignment:ComputerAssignment,instanceId:string,bootId:string):Promise<InstanceState>{
  await runtimeAuthority(scope);if(assignment.tenantId!==scope.tenantId||assignment.spaceId!==scope.spaceId)throw new AllocationError('binding-conflict');
  return this.store.transaction(async tx=>{const slot=this.allocation(scope,tx.get('allocation',this.key(scope)));if(slot.state!=='ready'||slot.instanceId!==instanceId||slot.bootId!==bootId||bindingDigest(slot.assignment)!==bindingDigest(assignment))throw new AllocationError('binding-conflict');
   const old=tx.get<InstanceState>('lifecycle',this.key(scope));if(old){this.get(scope,old);if(old.instanceId!==instanceId||old.bootId!==bootId||bindingDigest(old.assignment)!==bindingDigest(assignment))throw new AllocationError('binding-conflict');return old;}
   const next:InstanceState={assignment,instanceId,bootId,instanceGrant:randomUUID(),ownerScope:runtimeSpaceKey(scope),state:'running',checkpointDigest:null};tx.put('lifecycle',this.key(scope),next);return next;
  },()=>runtimeAuthority(scope));
 }
 async current(scope:VerifiedScope,grant?:string):Promise<InstanceState>{await runtimeAuthority(scope,'task:read');return this.store.transaction(async tx=>{const old=this.get(scope,tx.get('lifecycle',this.key(scope)));if(grant!==undefined&&(old.instanceGrant!==grant||old.state!=='running'))throw new AllocationError('stale-instance');return old;},()=>runtimeAuthority(scope,'task:read'));}
 async suspend(scope:VerifiedScope,grant:string):Promise<InstanceState>{await runtimeAuthority(scope);return this.store.transaction(async tx=>{
  const old=this.get(scope,tx.get('lifecycle',this.key(scope)));if(old.state!=='running'||old.instanceGrant!==grant)throw new AllocationError('stale-instance');
  const p=await this.backend.prerequisites(old);if(!p.savedStateAllowed||p.activeDrivers!==0||p.noncheckpointableChildren!==0||p.resourceLeases!==0||p.unknownEffects!==0)throw new AllocationError('unsafe-suspend');
  const slot=this.allocation(scope,tx.get('allocation',this.key(scope)));if(slot.state!=='ready'||slot.instanceId!==old.instanceId||slot.bootId!==old.bootId)throw new AllocationError('stale-instance');
  await runtimeAuthority(scope);const observed=await this.backend.suspend(old);const next:InstanceState={...old,state:'suspended',checkpointDigest:observed.checkpointDigest};tx.put('lifecycle',this.key(scope),next);tx.put('allocation',this.key(scope),{...slot,state:'unknown',reason:'observed-suspended'} satisfies AllocationSlot);return next;
 },()=>runtimeAuthority(scope));}
 async resume(scope:VerifiedScope):Promise<InstanceState>{await runtimeAuthority(scope);return this.store.transaction(async tx=>{
  const old=this.get(scope,tx.get('lifecycle',this.key(scope)));if(old.state!=='suspended'||!old.checkpointDigest)throw new AllocationError('stale-instance');
  const slot=this.allocation(scope,tx.get('allocation',this.key(scope)));if(slot.reason!=='observed-suspended')throw new AllocationError('stale-instance');
  await runtimeAuthority(scope);const observed=await this.backend.resume(old);if(observed.instanceId===old.instanceId||observed.bootId===old.bootId)throw new AllocationError('stale-instance');
  const next:InstanceState={...old,...observed,instanceGrant:randomUUID(),state:'running'};tx.put('lifecycle',this.key(scope),next);tx.put('allocation',this.key(scope),{...slot,...observed,state:'ready',reason:'fresh-instance-observed-after-resume'} satisfies AllocationSlot);return next;
 },()=>runtimeAuthority(scope));}
}
