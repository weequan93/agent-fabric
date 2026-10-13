import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createNativeFixture } from './native-fixture.js';
import { launchOwned,stopOwned,waitUntil,control,census,type OwnedProcess } from './process-fixture.js';
import { NativeSession } from '../../src/native-session.js';
import { ProfileRegistry } from '../../src/profile.js';
import { ModelError } from '../../src/errors.js';

type Fixture=Awaited<ReturnType<typeof createNativeFixture>>;
const refusal=(codes:string[])=>(e:unknown)=>e instanceof ModelError&&codes.includes(e.code);
const command=async(n:Fixture,a:Awaited<ReturnType<Fixture['task']>>)=>({sessionId:a.sessionId,key:randomUUID(),expectedRevision:(await n.native.session.inspect(a.scope,a.sessionId)).revision,expiresAt:new Date(Date.now()+60_000).toISOString()});
const machineRows=async(n:Fixture)=>(await n.f.admin.query('SELECT * FROM fabric.model_computer_assignments WHERE tenant_id=$1 ORDER BY space_id',[n.f.tenant])).rows;
const preflightRows=async(n:Fixture)=>(await n.f.admin.query('SELECT * FROM fabric.model_computer_preflights WHERE tenant_id=$1 ORDER BY session_id',[n.f.tenant])).rows;

export async function nativeComputerCases(t:TestContext,n:Fixture){
 const f=n.f,svc=n.native.session,resource=randomUUID();
 const validCounterpart=async()=>{
  const a=await n.task({computer:true,intent:'Act',resourceId:resource}),counts=await f.counters();
  const waiting=await svc.requestTurn(a.scope,{...await command(n,a),input:'fresh eligible computer counterpart',choice:null});assert.equal(waiting.view.preflight?.phase,'preparing');
  const ready=await svc.resume(a.scope,{...await command(n,a),inputLimitBytes:64});assert.equal(ready.view.preflight?.phase,'simulated-ready');assert.equal(ready.autoDispatched,false);
  let starts=0;await svc.continue(a.scope,await command(n,a),'computer',async()=>{starts++;});assert.equal(starts,1);assert.deepEqual(await f.counters(),counts);
 };
 await t.test('missing-computer-capability-refuses-closed-trusted-admission-before-start',async()=>{
  const a=await n.task({computer:true,intent:'Act',resourceId:resource}),before=await n.snapshot(),counts=await f.counters();
  await assert.rejects(n.native.repository.open(a.scope,a.binding.runId,{...a.admission,computerCapability:null}),refusal(['INVALID_SCHEMA']));
  assert.deepEqual(await n.snapshot(),before);assert.deepEqual(await f.counters(),counts);assert.deepEqual(await machineRows(n),[]);assert.deepEqual(await preflightRows(n),[]);
  await validCounterpart();
 });
 await t.test('missing-current-computer-grant-waits-with-zero-preflight-and-zero-start',async()=>{
  await f.admin.query('UPDATE fabric.memberships SET grants=$4,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.otherSpace,f.actors[1],JSON.stringify(['task:read','task:write'])]);
  const a=await n.task({space:f.otherSpace,computer:true,intent:'Act',noSources:true}),counts=await f.counters(),assignments=await machineRows(n),preflights=await preflightRows(n);
  assert.equal(a.scope.grants.includes('computer:use'),false);
  const denied=await svc.requestTurn(a.scope,{...await command(n,a),input:'needs current computer grant',choice:null});
  assert.equal(denied.status,'waiting');assert.equal(denied.view.wait?.reason,'permission');assert.equal(denied.view.wait?.resolver,'native-controller');assert.equal(denied.view.wait?.resourceId,a.admission.resourceId);assert.equal(denied.view.preflight,null);
  assert.deepEqual(await machineRows(n),assignments);assert.deepEqual(await preflightRows(n),preflights);assert.deepEqual(await f.counters(),counts);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
  let starts=0;await assert.rejects(svc.continue(a.scope,await command(n,a),'computer',async()=>{starts++;}),refusal(['UNAUTHORIZED']));assert.equal(starts,0);await validCounterpart();
 });
 await t.test('missing-qualified-profile-waits-before-computer-admission',async()=>{
  const a=await n.task({computer:true,intent:'Act',resourceId:resource}),counts=await f.counters(),before=await machineRows(n),preflights=await preflightRows(n);
  const empty=new ProfileRegistry(n.q,()=>({schemaVersion:1,providers:[n.profile.provider],routes:[n.profile.route],regions:[n.profile.region],dataPolicies:[n.profile.dataPolicy],runtimeProfiles:[n.profile.runtimeRequirements.profileId]}),[],{Fast:[],Balanced:[],Thorough:[]});
  const unqualified=new NativeSession(n.native.repository,n.native.models,{...n.native.ports,profiles:empty});
  const result=await unqualified.requestTurn(a.scope,{...await command(n,a),input:'qualified model required first',choice:null});
  assert.equal(result.status,'waiting');assert.equal(result.view.wait?.reason,'model-unavailable');assert.equal(result.view.preflight,null);assert.equal(result.view.pendingModel,null);
  assert.deepEqual(await machineRows(n),before);assert.deepEqual(await preflightRows(n),preflights);assert.deepEqual(await f.counters(),counts);
  let starts=0;await assert.rejects(unqualified.continue(a.scope,await command(n,a),'computer',async()=>{starts++;}),refusal(['UNAUTHORIZED']));assert.equal(starts,0);await validCounterpart();
 });
 await t.test('qualified-current-Act-visible-preparing-to-ready-only-explicit-resume',async()=>{
  const a=await n.task({computer:true,intent:'Act',resourceId:resource}),counts=await f.counters();
  const waiting=await svc.requestTurn(a.scope,{...await command(n,a),input:'visible admitted computer preflight',choice:null});
  assert.equal(waiting.status,'waiting');assert.equal(waiting.view.wait?.reason,'resource');assert.equal(waiting.view.wait?.resolver,'native-controller');assert.deepEqual(waiting.view.wait?.allowedNextActions,['resume','stop']);
  assert.deepEqual(waiting.view.preflight,{schemaVersion:1,sessionId:a.sessionId,taskId:a.binding.taskId,runId:a.binding.runId,resourceId:resource,policyRevision:a.binding.policyRevision,requirementsRevision:a.binding.requirementsRevision,generation:a.binding.resourceGeneration,phase:'preparing',capability:'simulated-computer',requiredGrant:'computer:use',costCategories:['reserved-compute','active-compute','cold-start','retained-storage','network'],chargePolicy:'reserved-until-confirmed-suspended',assurance:'deterministic-local-only'});
  assert.equal(waiting.view.spaceComputerAssignment,resource);assert.equal(waiting.view.costs.reserved,0);assert.equal(waiting.view.pendingModel,null);assert.ok(a.scope.grants.includes('computer:use'));
  const p=await n.process();try{for(let i=0;i<4;i++){const polled=await n.call(p,'inspect',{sessionId:a.sessionId});assert.equal(polled['error'],undefined);assert.deepEqual((polled['result'] as {preflight:unknown}).preflight,waiting.view.preflight);}await stopOwned(p,'SIGKILL');const q=await n.process();try{assert.deepEqual(((await n.call(q,'inspect',{sessionId:a.sessionId}))['result'] as {preflight:unknown}).preflight,waiting.view.preflight);}finally{await stopOwned(q);}}finally{await stopOwned(p);}
  assert.deepEqual(await f.counters(),counts);
  const ready=await svc.resume(a.scope,{...await command(n,a),inputLimitBytes:64});assert.equal(ready.autoDispatched,false);assert.equal(ready.view.preflight?.phase,'simulated-ready');assert.equal(ready.view.state,'running');assert.equal(ready.view.wait,null);assert.deepEqual(ready.view.preflight,{...waiting.view.preflight,phase:'simulated-ready'});
  let callbacks=0;await svc.continue(a.scope,await command(n,a),'computer',async()=>{callbacks++;});assert.equal(callbacks,1);assert.equal((await machineRows(n)).filter(r=>r['space_id']===f.space).length,1);assert.deepEqual(await f.counters(),counts);assert.deepEqual(n.counters,{provision:0,wake:0,enroll:0,effect:0});
 });
 await t.test('stale-current-policy-refuses-ready-advance-and-callback',async()=>{
  const a=await n.task({computer:true,intent:'Act',resourceId:resource});const waiting=await svc.requestTurn(a.scope,{...await command(n,a),input:'preflight under old policy',choice:null});assert.equal(waiting.view.preflight?.phase,'preparing');
  const c=await command(n,a);await f.admin.query('UPDATE fabric.model_policies SET revision=revision+1 WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);const before=await n.snapshot(),counts=await f.counters();
  const stalePolicy=(e:unknown)=>e instanceof Error&&(e as Error&{code?:string}).code==='42501'&&e.message==='model current binding denied';
  await assert.rejects(svc.resume(a.scope,{...c,inputLimitBytes:64}),stalePolicy);let callbacks=0;
  await assert.rejects(svc.continue(a.scope,c,'computer',async()=>{callbacks++;}),stalePolicy);assert.equal(callbacks,0);assert.deepEqual(await n.snapshot(),before);assert.deepEqual(await f.counters(),counts);
 });
 for(const order of [0,1] as const)await t.test('two-independent-native-computer-callers-single-assignment-order-'+order,{timeout:30_000},async sub=>{
  const r=await createNativeFixture();const children:OwnedProcess[]=[];sub.after(async()=>{try{for(const p of children)await stopOwned(p);}finally{await r.close();}});const g=r.f,a=await r.task({computer:true,intent:'Act',resourceId:randomUUID()}),b=await r.task({computer:true,intent:'Act',resourceId:randomUUID()}),tasks=[a,b];
  const config={controllerDsn:g.fixtureDsn('controller'),authorityDsn:g.fixtureDsn('authority'),token:g.tokens[1],tenantId:g.tenant,spaceId:g.space,issuer:g.endpoints['issuer'],jwksUrl:g.endpoints['jwksUrl']};
  for(let i=0;i<2;i++)children.push(await launchOwned(resolve(g.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/native-computer-caller-process.js'),'FABRIC_MODEL_COMPUTER_CALLER',config));
  const owner=children[order]!,contender=children[1-order]!,winner=tasks[order]!,loser=tasks[1-order]!,first=randomUUID(),second=randomUUID(),counts=await g.counters(),censusBefore=census();
  const send=async(p:OwnedProcess,id:string,sessionId:string,hold:boolean)=>{await new Promise<void>((done,reject)=>p.child.send({kind:'admit',requestId:id,sessionId,hold},e=>e?reject(e):done()));};
  await send(owner,first,winner.sessionId,true);await waitUntil(async()=>owner.messages.some(m=>m['kind']==='admission-written'&&m['requestId']===first),'owner native assignment written before COMMIT');
  const ownerPid=Number(owner.messages.find(m=>m['kind']==='caller-pid'&&m['requestId']===first)!['pid']);await send(contender,second,loser.sessionId,false);
  await waitUntil(async()=>contender.messages.some(m=>m['kind']==='caller-pid'&&m['requestId']===second),'contender real backend PID');const contenderPid=Number(contender.messages.find(m=>m['kind']==='caller-pid'&&m['requestId']===second)!['pid']);
  let barrier:Record<string,unknown>|undefined;
  await waitUntil(async()=>{barrier=(await g.admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[contenderPid])).rows[0];return barrier?.['wait_event_type']==='Lock'&&(barrier['blockers'] as number[]).includes(ownerPid);},'actual native Space barrier blocker observation');
  assert.equal(contender.messages.some(m=>m['kind']==='admission-written'&&m['requestId']===second),false);assert.deepEqual(await machineRows(r),[]);assert.deepEqual(await preflightRows(r),[]);assert.deepEqual(await g.counters(),counts);
  await control(owner,{kind:'release'});await waitUntil(async()=>[owner,contender].every((p,i)=>p.messages.some(m=>m['kind']==='result'&&m['requestId']===(i===0?first:second))),'both genuine native assignment COMMITs');
  for(const [p,id]of [[owner,first],[contender,second]] as const){const response=p.messages.find(m=>m['kind']==='result'&&m['requestId']===id)!;assert.equal(response['error'],undefined,JSON.stringify(response));assert.equal((response['result'] as {reason:string}).reason,'resource');}
  const assignments=await machineRows(r),preflights=await preflightRows(r);assert.equal(assignments.length,1);assert.equal(assignments[0]!['resource_id'],winner.admission.resourceId);assert.equal(preflights.length,1);assert.equal(preflights[0]!['session_id'],winner.sessionId);
  const queued=await r.native.session.requestTurn(loser.scope,{...await command(r,loser),input:'competing native assignment queues',choice:null});assert.equal(queued.view.wait?.reason,'resource');assert.equal(queued.view.wait?.resolver,'native-controller');assert.equal(queued.view.wait?.resourceId,loser.admission.resourceId);assert.equal(queued.view.spaceComputerAssignment,winner.admission.resourceId);assert.equal(queued.view.preflight,null);
  let callbacks=0;await assert.rejects(r.native.session.continue(loser.scope,await command(r,loser),'computer',async()=>{callbacks++;}),refusal(['UNAUTHORIZED']));assert.equal(callbacks,0);assert.deepEqual(await machineRows(r),assignments);assert.deepEqual(await preflightRows(r),preflights);assert.deepEqual(await g.counters(),counts);assert.deepEqual(r.counters,{provision:0,wake:0,enroll:0,effect:0});
  const ownerWait=await r.native.session.requestTurn(winner.scope,{...await command(r,winner),input:'fresh eligible owner after contention',choice:null});assert.equal(ownerWait.view.preflight?.phase,'preparing');
  const ownerReady=await r.native.session.resume(winner.scope,{...await command(r,winner),inputLimitBytes:64});assert.equal(ownerReady.view.preflight?.phase,'simulated-ready');assert.equal(ownerReady.autoDispatched,false);let ownerStarts=0;await r.native.session.continue(winner.scope,await command(r,winner),'computer',async()=>{ownerStarts++;});assert.equal(ownerStarts,1);assert.deepEqual(await g.counters(),counts);assert.equal((await machineRows(r)).length,1);
  const directChildren=(rows:ReturnType<typeof census>)=>rows.filter(p=>p.ppid===process.pid&&!p.command.startsWith('/bin/ps -axo')).map(p=>p.pid).sort((x,y)=>x-y);
  const censusAfter=census();assert.deepEqual(directChildren(censusAfter),directChildren(censusBefore));assert.equal(censusAfter.some(p=>[owner.pid,contender.pid].includes(p.ppid)),false);
  sub.diagnostic(JSON.stringify({assurance:'deterministic-local-only',measurement:'native-computer-assignment-contention',order,ownerPid,contenderPid,barrier,winnerResourceId:winner.admission.resourceId,loserResourceId:loser.admission.resourceId,assignmentCount:assignments.length,preflightCount:preflights.length,callbackCount:callbacks,extraWorkers:0}));
 });
}
