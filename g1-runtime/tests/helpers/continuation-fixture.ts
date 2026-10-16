import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {RuntimeContinuation,continuationControls,type ContinuationContext,type ContinuationRequest,type ContinuationRecord,type ContinuationPorts} from '../../src/continuation.js';
import {OwnedProcessControl,type ProcessLaunch} from '../../src/process-control.js';
import {bindingDigest,revalidateScope,assertVerifiedScope,type VerifiedScope,type Generation} from '../../src/owners.js';
import {nativeSession} from '../../src/native-runtime.js';
import {exactAdmissionBinding} from '../../src/admission.js';
import {admissionFixture,id} from './admission-fixture.js';
import {api} from './owned-capsule.js';
export async function eventually(fn:()=>Promise<boolean>|boolean,timeout=7000){const until=performance.now()+timeout;while(performance.now()<until){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Actual continuation condition timed out');}
function message(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Continuation fixture IPC timeout')),7000);child.once('error',reject);child.once('message',m=>{clearTimeout(timeout);resolve(m);});});}
export async function continuationFixture(){
 const f=await admissionFixture(),root=join(f.root,'continuation');mkdirSync(root);const secret=randomUUID();
 const target=fork(fileURLToPath(new URL('./continuation-target.js',import.meta.url)),[root,secret],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']}),ready=await message(target),targetUrl='http://127.0.0.1:'+ready.port;
 const state={authUnavailable:false,auditUnavailable:false,evidenceUnavailable:false,wallOffset:0,verifyFailure:false,lockWaiters:0,telemetry:'current' as 'current'|'stale',heartbeat:'current' as 'current'|'stale',controls:[...continuationControls] as string[],beforeCurrent:null as null|(()=>Promise<void>)};
 const verified=new Map<string,string>(),startupObservations:unknown[]=[];
 const retained:ChildProcess[]=[];
 const contexts=new Map<string,ContinuationContext>(),loops=new Map<string,ReturnType<typeof nativeSession>>(),stopKeys=new Map<string,{requestDigest:string;generation:Generation}>(),launches:ProcessLaunch[]=[],audits:unknown[]=[];
 const now=()=>Date.now()+state.wallOffset;let tail=Promise.resolve();
 let runtime:RuntimeContinuation;
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');try{
  assert.equal(req.method,'POST');assert.equal(req.url,'/step');let body='';for await(const b of req){body+=String(b);assert.ok(body.length<=8192);}
  assert.equal(typeof req.headers.authorization,'string');await runtime.step(req.headers.authorization!,JSON.parse(body));res.end('{}');
 }catch{res.statusCode=403;res.end(JSON.stringify({code:'CONTINUATION_FENCED',replayAllowed:false}));}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const path=(operationId:string)=>join(root,operationId+'.json');
 const slotPath=join(root,'resource-slot.json');
 const ports:ContinuationPorts={endpoint,now,
  current:async(scope,r)=>{await state.beforeCurrent?.();if(state.authUnavailable)throw new Error('AUTHORITY_UNAVAILABLE');await revalidateScope(scope);await f.admission.preflight(scope,r.taskId);const c=contexts.get(r.operationId);assert.ok(c,'NOT_FOUND');const record=(await f.admission.status(scope,r.taskId)).record;await f.ports.approvals.require(scope,exactAdmissionBinding(record),record.preflightDigest);return {...structuredClone(c),controls:[...state.controls],telemetry:state.telemetry,heartbeat:state.heartbeat,intersection:structuredClone(f.state.intersection)};},
  audit:async(scope,r,event)=>{if(state.auditUnavailable)throw new Error('REQUIRED_AUDIT_UNAVAILABLE');if(state.evidenceUnavailable)throw new Error('REQUIRED_EVIDENCE_UNAVAILABLE');await revalidateScope(scope);audits.push({operationId:r.operationId,event});},
  reserve:async(scope,r)=>{await revalidateScope(scope);if(existsSync(slotPath)){const slot=JSON.parse(readFileSync(slotPath,'utf8'));if(slot.operationId!==r.operationId)throw new Error('RESOURCE_HELD_RECONCILIATION_REQUIRED');}else writeFileSync(slotPath,JSON.stringify({operationId:r.operationId,generation:r.generation}),{flag:'wx'});},
  stopRun:async(scope,r,key)=>{await revalidateScope(scope);const requestDigest=bindingDigest([r.taskId,r.runId]),prior=stopKeys.get(key);if(prior){assert.equal(prior.requestDigest,requestDigest);return prior.generation;}const loop=loops.get(r.operationId)!;if(loop.inspect().run.state!=='cancelling')loop.transition('cancelling',{unknownEffect:true});const generation={...r.generation,cancellation:r.generation.cancellation+1};stopKeys.set(key,{requestDigest,generation});return generation;},
  get:async(_scope,id)=>existsSync(path(id))?JSON.parse(readFileSync(path(id),'utf8')) as ContinuationRecord:null,
  save:async(_scope,id,r)=>{const p=path(id),tmp=p+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(r),{flag:'wx'});renameSync(tmp,p);},
  exclusive:async(_id,fn)=>{const before=tail;let release!:()=>void;tail=new Promise(resolve=>{release=resolve;});state.lockWaiters++;await before;state.lockWaiters--;try{return await fn();}finally{release();}},
  control:()=>{const control=new OwnedProcessControl();return {start:async launch=>{launches.push(structuredClone(launch));await control.start(launch);},activate:()=>control.activate(),stop:()=>control.stop(),observe:()=>control.observe()};},
  verifyStartup:async(scope,r,c,observed)=>{await revalidateScope(scope);if(state.verifyFailure)throw new Error('STARTUP_OBSERVATION_MISMATCH');const {census}=await api('census'),rows=census(),parent=rows.find((p:any)=>p.pid===observed.parentPid),child=rows.find((p:any)=>p.pid===observed.childPid);assert.equal(parent.ppid,process.pid);assert.equal(child.ppid,parent.pid);for(const actual of [parent,child]){assert.equal(actual.command,'af-runtime:'+process.env['RUNTIME_OWNER_NONCE']);const ack=JSON.parse(readFileSync(process.env['RUNTIME_BIRTH_LOG']+'.'+actual.pid+'.ack','utf8'));assert.equal(ack.pid,actual.pid);assert.equal(ack.nonce,process.env['RUNTIME_OWNER_NONCE']);assert.equal(ack.birth,actual.birth);}assert.equal(observed.bootId,r.bootId);assert.equal(bindingDigest(observed.generation),bindingDigest(r.generation));verified.set(r.operationId,bindingDigest(c));startupObservations.push({parent,child,bootId:r.bootId,generation:r.generation,effectsBeforeActivation:(await (await fetch(targetUrl+'/snapshot',{headers:{authorization:secret}})).json() as any).events.filter((e:any)=>e.operationId===r.operationId).length});},
  activateStartup:async(scope,r,c)=>{await revalidateScope(scope);assert.equal(verified.get(r.operationId),bindingDigest(c));assert.equal(bindingDigest(contexts.get(r.operationId)),bindingDigest(c));contexts.set(r.operationId,{...c,effectiveGeneration:r.policyGeneration,effectiveBootId:r.bootId,phase:'active'});},
  effect:async(_scope,r,actor)=>{const response=await fetch(targetUrl+'/effect',{method:'POST',headers:{authorization:secret},body:JSON.stringify({operationId:r.operationId,bootId:r.bootId,generation:r.generation,...actor}),signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);}
 };
 runtime=new RuntimeContinuation(ports);
 return {f,state,ports,root,launches,audits,startupObservations,targetPid:target.pid!,endpoint,get runtime(){return runtime;},
  async issue(leaseMs=6000){const draft=await f.request('POST','',{key:randomUUID(),text:'Run fixed owned parent and child stream',intent:'act',targetId:id(6)});assert.equal(draft.status,200);const scope=await f.scope(),record=(await f.admission.status(scope,draft.body.taskId)).record;assert.equal((await f.request('POST','/'+record.taskId+'/accept',{preflightDigest:record.preflightDigest})).status,200);
   const bootId=randomUUID(),request:ContinuationRequest={schemaVersion:1,operationId:record.preflight.operationId,key:randomUUID(),taskId:record.taskId,runId:record.preflight.runId,bootId,generation:{cancellation:0,worker:1,resource:1},policyGeneration:1,leaseMs,workload:'fixed-owned-stream'};
   contexts.set(request.operationId,{envelope:record.preflight.envelope,runId:request.runId,operationId:request.operationId,bootId,leaseId:randomUUID(),generation:request.generation,desiredGeneration:1,effectiveGeneration:1,effectiveBootId:bootId,phase:'active',qualificationExpiresAt:now()+120_000,controls:[...continuationControls],intersection:f.state.intersection,telemetry:'current',heartbeat:'current',assurance:'owned-local-fixture'});
   loops.set(request.operationId,nativeSession(record.preflight.envelope,request.runId,{clock:{now},authorize:()=>assertVerifiedScope(scope),model:async()=>{throw new Error('UNSUPPORTED');},execute:async()=> 'unknown'}));return request;},
  context:(r:ContinuationRequest)=>contexts.get(r.operationId)!,
  mutate(r:ContinuationRequest,delta:Partial<ContinuationContext>){contexts.set(r.operationId,{...contexts.get(r.operationId)!,...delta});},
  async start(r:ContinuationRequest){return runtime.start(await f.scope(),r);},
  async status(r:ContinuationRequest){return runtime.status(await f.scope(),r.operationId);},
  async stop(r:ContinuationRequest,key=randomUUID()){return runtime.stop(await f.scope(),r.operationId,key);},
  async snapshot(){const response=await fetch(targetUrl+'/snapshot',{headers:{authorization:secret},signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);return await response.json() as {events:any[];protected:string;publication:null|{operationId:string;generation:Generation}};},
  async live(r:ContinuationRequest){await eventually(async()=>{const events=(await this.snapshot()).events.filter(e=>e.operationId===r.operationId);return events.some(e=>e.role==='parent')&&events.some(e=>e.role==='child');});},
  async quiescent(r:ContinuationRequest){await eventually(async()=>Boolean((await runtime.observe(await f.scope(),r.operationId)).process?.terminated));const snapshot=await this.snapshot();await new Promise(resolve=>setTimeout(resolve,150));assert.deepEqual(await this.snapshot(),snapshot);const {census}=await api('census'),rows=census(),record=await this.status(r);assert.ok(!rows.some((p:any)=>p.pid===record.process?.parentPid||p.pid===record.process?.childPid));return record;},
  async direct(r:ContinuationRequest,delta:Record<string,unknown>={}){const launch=launches.find(l=>l.operationId===r.operationId)!;const record=await this.status(r),child=fork(fileURLToPath(new URL('./continuation-client.js',import.meta.url)),[endpoint+'/step',launch.credential,JSON.stringify({operationId:r.operationId,bootId:r.bootId,generation:r.generation,pid:record.process?.parentPid,role:'parent',action:'mutation',...delta})],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']}),exit=once(child,'exit'),result=await message(child);await exit;return result;},
  async retainedProbe(r:ContinuationRequest){const launch=launches.find(l=>l.operationId===r.operationId)!,record=await this.status(r),child=fork(fileURLToPath(new URL('./continuation-probe.js',import.meta.url)),[endpoint+'/step',launch.credential,JSON.stringify({operationId:r.operationId,bootId:r.bootId,generation:r.generation,pid:record.process?.parentPid,role:'parent',action:'mutation'})],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});retained.push(child);const ready=await message(child);assert.equal(ready.pid,child.pid);return {pid:child.pid!,async attempt(delta:Record<string,unknown>={}){const result=message(child);child.send({kind:'attempt',delta});return result;}};},
  async recreate(){await runtime.shutdown();runtime=new RuntimeContinuation(ports);},
  /** Test-only owner fixture, not the original settlement/queue implementation.
   * The observer drains the serialized target and proves both actual PIDs gone
   * before enrolling a new synthetic generation. No timer releases a slot. */
  async fixtureSuccessor(old:ContinuationRequest,next:ContinuationRequest){const record=await this.quiescent(old);assert.equal(record.dispatchFenced,true);await ports.exclusive(old.operationId,async()=>{const before=await this.snapshot();assert.ok(before.events.some(e=>e.operationId===old.operationId));writeFileSync(slotPath,JSON.stringify({operationId:next.operationId,generation:next.generation,fixtureOnlyReadQuiescenceDigest:bindingDigest(before)}));});},
  native:(r:ContinuationRequest)=>loops.get(r.operationId)!.inspect(),
  async cleanup(){await runtime.shutdown();for(const child of retained)if(child.connected){const exit=once(child,'exit');child.send({kind:'close'});await exit;}server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const exit=once(target,'exit');target.send('close');await exit;await f.cleanup();}
 };
}
export type ContinuationFixture=Awaited<ReturnType<typeof continuationFixture>>;
