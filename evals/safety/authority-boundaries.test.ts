import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError, type ScopeRef } from '../../engine/contracts/src/identity.js';
import { TaskRepository } from '../../engine/scheduler/src/task-state.js';
import { FenceRegistry } from '../../execution/action-broker/src/fencing.js';
import { ProtocolMutationBarrier, MUTATION_PATHS, type MutationPath } from '../../execution/desktop-broker/src/mutation-barrier-contract.js';
import { validateRuntimeCapabilities } from '../../security/conformance/src/qualification-record.js';

const scope:ScopeRef={tenantId:'authority-test-tenant',spaceId:'shared-computer-space'};
const initial={taskGeneration:0,runGeneration:0,runtimeGeneration:0};
const versions={engine:'g0',schema:'1',behavior:'baseline',environment:'controlled-local'};
function setup(){
  let now=100;let authorized=true;const registrations:string[]=[];
  const authorize=()=>{if(!authorized)throw new DomainError('UNAUTHORIZED');};
  class RecordedFences extends FenceRegistry {
    override register(...args:Parameters<FenceRegistry['register']>){const result=super.register(...args);registrations.push(args[3]);return result;}
  }
  const fences=new RecordedFences(authorize);fences.register(scope,'task-a','run-a','one-assigned-runtime',initial);fences.register(scope,'task-b','run-b','one-assigned-runtime',initial);
  const barrier=new ProtocolMutationBarrier({now:()=>now},fences,authorize);
  return {fences,barrier,registrations,authorize,setNow:(value:number)=>{now=value;},revoke:()=>{authorized=false;}};
}
test('shared computer contention preserves one assignment and records the blocked owner and next action',()=>{
  const s=setup();const tasks=new TaskRepository(s.authorize);
  for(const suffix of ['a','b']){tasks.create({scope,taskId:`task-${suffix}`,actor:{tenantId:scope.tenantId,actorId:'owner'},goal:'Computer task',requirementsRevision:0});tasks.startRun(`task-${suffix}`,`run-${suffix}`,{versions});tasks.transition(`run-${suffix}`,'preparing',{currentAuthorized:true});}
  const driver=s.barrier.acquire(scope,'run-a','agent','first-agent',1000);const before=[...s.registrations];
  assert.throws(()=>s.barrier.acquire(scope,'run-b','agent','second-agent',1000),(e:unknown)=>e instanceof DomainError&&e.code==='STALE_FENCE');
  const waiting=tasks.transition('run-b','waiting',{currentAuthorized:true,waiting:{reason:'resource',resolver:'run-a',nextAction:'Wait for run-a to release the assigned computer'}});
  assert.equal(waiting.state,'waiting');assert.equal(waiting.waiting?.reason,'resource');assert.equal(waiting.waiting?.resolver,driver.runId);assert.match(waiting.waiting!.nextAction,/assigned computer/);
  // These are observed actual registration calls, rather than an invented VM counter.
  assert.deepEqual(s.registrations,before);assert.deepEqual(new Set(s.registrations),new Set(['one-assigned-runtime']));
  assert.deepEqual(s.fences.current(scope,'run-b'),initial);
});
test('all six mutation paths reject stale agent leases after human takeover',()=>{
  const s=setup();const agent=s.barrier.acquire(scope,'run-a','agent','agent-lease',1000);let mutations=0;
  for(const path of MUTATION_PATHS)s.barrier.mutate(agent,path,()=>{mutations++;});assert.equal(mutations,6);
  const human=s.barrier.takeover(scope,'run-a','human-lease',1000);const before=mutations;
  for(const path of MUTATION_PATHS)assert.throws(()=>s.barrier.mutate(agent,path,()=>{mutations++;}),DomainError);
  assert.equal(mutations,before);s.barrier.mutate(human,'desktop',()=>{mutations++;});assert.equal(mutations,before+1);
  assert.throws(()=>s.barrier.returnToAgent(scope,'run-b','wrong-run-return',1000,true,human.leaseId),DomainError);
  assert.throws(()=>s.barrier.returnToAgent(scope,'run-a','unobserved-return',1000,false,human.leaseId),DomainError);
  assert.throws(()=>s.barrier.returnToAgent(scope,'run-a',human.leaseId,1000,true,human.leaseId),DomainError);
  const fresh=s.barrier.returnToAgent(scope,'run-a','fresh-agent-lease',1000,true,human.leaseId);assert.equal(fresh.owner,'agent');assert.throws(()=>s.barrier.mutate(human,'shell',()=>{mutations++;}),DomainError);
});
test('unknown mutation paths and expired leases never invoke the callback',()=>{
  const s=setup();const lease=s.barrier.acquire(scope,'run-a','agent','bounded-lease',200);let callbacks=0;
  assert.throws(()=>s.barrier.mutate(lease,'unregistered-path' as MutationPath,()=>{callbacks++;}),(e:unknown)=>e instanceof DomainError&&e.code==='REQUIRED_CAPABILITY_UNSUPPORTED');assert.equal(callbacks,0);
  s.setNow(200);for(const path of MUTATION_PATHS)assert.throws(()=>s.barrier.mutate(lease,path,()=>{callbacks++;}),DomainError);assert.equal(callbacks,0);
});
test('disconnect and reconnect require a new lease bound to the observed driver',()=>{
  const s=setup();const old=s.barrier.acquire(scope,'run-a','agent','connected-agent',1000);s.barrier.disconnect(scope,'run-a');s.barrier.reconnect(scope,'run-a');let callbacks=0;
  assert.throws(()=>s.barrier.mutate(old,'browser',()=>{callbacks++;}),DomainError);assert.throws(()=>s.barrier.acquire(scope,'run-b','agent','silent-reconnect',1000),DomainError);assert.equal(callbacks,0);
  assert.throws(()=>s.barrier.returnToAgent(scope,'run-a','wrong-observation',1000,true,'other-driver'),DomainError);
  const fresh=s.barrier.returnToAgent(scope,'run-a','observed-reconnect',1000,true,old.leaseId);s.barrier.mutate(fresh,'browser',()=>{callbacks++;});assert.equal(callbacks,1);
});
test('stop-run fences its own authority without stopping another run and revocation blocks callbacks',()=>{
  const s=setup();s.fences.stopRun(scope,'run-a');assert.throws(()=>s.fences.assertCurrent(scope,'run-a',initial),DomainError);s.fences.assertCurrent(scope,'run-b',initial);
  const active=s.barrier.acquire(scope,'run-b','agent','second-driver',1000);let callbacks=0;s.revoke();assert.throws(()=>s.barrier.mutate(active,'api',()=>{callbacks++;}),DomainError);assert.equal(callbacks,0);
});
test('missing runtime controls or uncovered paths cannot be advertised as qualified',()=>{
  const complete={deployment:'controlled-test',region:'approved',isolatedWorkspace:true,policyEnforcement:true,cancellation:true,spendAccounting:true,mutationPaths:[...MUTATION_PATHS]};
  assert.deepEqual(validateRuntimeCapabilities(complete).mutationPaths,MUTATION_PATHS);
  for(const control of ['isolatedWorkspace','policyEnforcement','cancellation','spendAccounting'])assert.throws(()=>validateRuntimeCapabilities({...complete,[control]:false}),DomainError);
  assert.throws(()=>validateRuntimeCapabilities({...complete,mutationPaths:MUTATION_PATHS.slice(1)}),DomainError);
  assert.throws(()=>validateRuntimeCapabilities({...complete,mutationPaths:[...MUTATION_PATHS.slice(0,5),'shell']}),DomainError);
});
