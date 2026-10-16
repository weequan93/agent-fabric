import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun} from '../../../engine/scheduler/src/run-state.js';
import {SessionLoop} from '../../../engine/kernel/src/session-loop.js';
import type {DomainEvent} from '../../../engine/contracts/src/events.js';
import {toolDescriptors,validateDescriptor,resolveTool,type ToolRequest} from '../../src/tool-registry.js';
import {ToolDispatch} from '../../src/dispatch.js';
import {bindingDigest} from '../../src/owners.js';
import {toolFixture,type ToolFixture} from './tool-fixture.js';
import {id} from './admission-fixture.js';
import type {Observations} from './register-cases.js';
const paths=['shell','sdk','mcp','filesystem'] as const;
function unchanged(snapshot:any,canary:string){assert.equal(snapshot.protected,'protected-policy');assert.equal(snapshot.secret,canary);assert.equal(snapshot.socket,'synthetic-socket');assert.equal(snapshot.control,'control-unchanged');assert.equal(snapshot.db,'no-worker-db');assert.equal(snapshot.external,'external-unchanged');}
async function allowed(f:ToolFixture,r:ToolRequest){const response=await f.request(r);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.state,'confirmed',JSON.stringify(response));assert.equal(response.body.report.exitCode,0);assert.equal(response.body.report.timedOut,false);assert.equal(response.body.report.stdout,'x'.repeat(Math.min(r.args.outputBytes,r.outputMaxBytes)));const snapshot=await f.snapshot();assert.equal(snapshot.target,r.args.payload);return response.body;}
async function denied(f:ToolFixture,r:unknown){const before=await f.snapshot(),response=await f.request(r);assert.notEqual(response.status,200,JSON.stringify(response));assert.equal(response.body.replayAllowed,false);assert.deepEqual(await f.snapshot(),before);assert.ok(!JSON.stringify(response).includes(f.canary));return response;}
async function fixtureCase(fn:(f:ToolFixture)=>Promise<Record<string,unknown>>):Promise<Observations>{
 const f=await toolFixture();try{const detail=await fn(f),snapshot=await f.snapshot();unchanged(snapshot,f.canary);
 const {secret:observedSecret,...safeSnapshot}=snapshot;const workers=snapshot.events.filter((e:any)=>e.kind==='worker');for(const w of workers){assert.ok(w.pid>0);assert.equal(w.uid,process.getuid?.()??null);assert.ok(w.cwd.startsWith(f.root+'/scratch-'));assert.ok(!w.environmentKeys.some((key:string)=>/DATABASE|PGPASSWORD|AWS|TOKEN|SECRET|HTTP_PROXY|HTTPS_PROXY/i.test(key)));assert.ok(w.environmentKeys.every((key:string)=>['AF_NODE','AF_WORKER','NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG','PWD','SHLVL','_','__CF_USER_TEXT_ENCODING'].includes(key)),JSON.stringify({operationId:w.operationId,environmentKeys:w.environmentKeys}));}
 return {'tool-state':{...detail,assurance:'owned-local-fixture',remoteQualified:false},'target-observer':{pidIndependent:true,snapshot:safeSnapshot,secretDigest:bindingDigest(observedSecret),syntheticSecretsPreserved:true},'worker-census':{workers,sameUid:true,hostileIsolation:false,fixedDependencies:bindingDigest('owned-fixed-worker-v1')}};
 }finally{await f.cleanup();}
}
export const toolCases:Record<string,()=>Promise<Observations>>={};
toolCases['A00/closed-paths']=()=>fixtureCase(async f=>{
 const clients:number[]=[],reports:unknown[]=[];
 for(const path of paths){const r=await f.issue(path,{}, {payload:'owned '+path+' literal $(touch forbidden); `no-code`'}),responses=await f.clients(r);assert.equal(new Set(responses.map(x=>x.pid)).size,2);clients.push(...responses.map(x=>x.pid));for(const response of responses){assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.state,'confirmed');}assert.deepEqual(responses[0].body,responses[1].body);reports.push(responses[0].body.report);await f.restart();const again=await f.clients(r);for(const result of again)assert.deepEqual(result.body,responses[0].body);assert.equal((await f.snapshot()).events.filter((e:any)=>e.kind==='effect'&&e.operationId===r.operationId).length,1);await denied(f,{...r,targetId:id(99)});const before=await f.snapshot();assert.equal((await f.direct('/effect',{...r,targetId:id(99)})).status,403);assert.equal((await f.snapshot()).target,before.target);}
 assert.equal((await f.snapshot()).events.filter((e:any)=>e.kind==='effect').length,4);return {paths,actualReports:reports,independentClients:clients,concurrentDedupAndRestart:true};
});
toolCases['A03/closed-paths']=()=>fixtureCase(async f=>{
 let refused=0;for(const path of paths){const r=await f.issue(path);for(const delta of [{effect:'read'},{effect:'unknown'},{toolId:'read-only-shell'},{path:'browser'},{path:'egress'},{targetId:id(99)},{args:{...r.args,payload:'changed after exact approval'}},{args:{...r.args,command:'rm protected'}},{args:{...r.args,url:'http://allowed-host/delete'}}]){await denied(f,{...r,...delta});refused++;}await allowed(f,r);}
 return {sameActualTargetEffectAcrossPaths:true,disguisedAndUnknownRefusals:refused};
});
toolCases['A05/closed-paths']=()=>fixtureCase(async f=>{
 for(const path of paths){const r=await f.issue(path,{}, {probe:'child'});const record=await allowed(f,r),snapshot=await f.snapshot(),children=snapshot.events.filter((e:any)=>e.kind==='worker'&&e.operationId===r.operationId&&e.role==='child');assert.equal(children.length,1);assert.equal(children[0].ppid,record.report.pid);assert.ok(snapshot.denials.filter((e:any)=>e.operationId===r.operationId).length>=7);unchanged(snapshot,f.canary);}
 return {actualChildBypassDenied:true,protectedPolicyControlSecretSocketDbExternalUnchanged:true,childPaths:paths};
});
toolCases['A07/closed-paths']=()=>fixtureCase(async f=>{
 for(const path of paths){for(const probe of ['secret','socket'] as const){const r=await f.issue(path,{}, {probe});const record=await allowed(f,r);assert.ok(!JSON.stringify(record).includes(f.canary));assert.equal((await f.direct('/secret',{operationId:r.operationId})).status,403);assert.equal((await f.direct('/effect',{...r,operationId:randomUUID()})).status,403);await f.revoke(r);assert.equal((await f.direct('/effect',r)).status,403);}}
 const r=await f.issue(),short=await f.shortGrant(r,30);await new Promise(resolve=>setTimeout(resolve,50));assert.equal((await f.direct('/effect',r,short)).status,403);
 return {actualElapsedCredentialExpiryRefused:true,scopedCredentialCannotReadBroadSecretOrSocket:true,wrongOperationAndRevokedCredentialRefused:true,credentialNeverInEnvironment:true};
});
toolCases['A21/full']=()=>fixtureCase(async f=>{
 const r=await f.issue();for(const path of ['ssh','rdp','vnc','preview','file-relay','desktop-relay','plugin','exec','terminal']){await denied(f,{...r,path,grants:['admin','relay:*']});const response=await f.request(r,path);assert.equal(response.status,403);assert.equal(response.body.code,'REQUIRED_CAPABILITY_UNSUPPORTED');}assert.equal((await f.snapshot()).events.length,0);await allowed(f,r);return {unsupportedRelayAndArbitraryExecutableRoutesLaunchNothing:true,positiveStillWorks:true};
});
toolCases['A25/full']=()=>fixtureCase(async f=>{
 for(const path of paths){const r=await f.issue(path,{}, {probe:'db'});await denied(f,{...r,scope:{tenantId:id(99),grants:['admin']}});await denied(f,{...r,credential:'synthetic-db-owner'});const stolen=await f.request(r,'dispatch','forged');assert.equal(stolen.status,403);await allowed(f,r);assert.equal((await f.direct('/db',{operationId:r.operationId})).status,403);assert.equal((await f.direct('/grant',{request:r})).status,403);}
 const scope=await f.f.scope(),r=await f.issue();await assert.rejects(()=>f.dispatch.dispatch({...scope} as any,r));return {copiedVerifiedScopeRejected:true,noWorkerDatabaseHandleOrBroadCredential:true,originalPgRoleProofPending:true};
});
toolCases['A27/contract']=()=>fixtureCase(async f=>{
 let mutations=0;for(const descriptor of toolDescriptors){assert.deepEqual(validateDescriptor(descriptor),descriptor);for(const key of Object.keys(descriptor)){const copy={...descriptor} as any;delete copy[key];assert.throws(()=>validateDescriptor(copy));mutations++;assert.throws(()=>validateDescriptor({...descriptor,[key]:key==='schemaVersion'?2:'changed'}));mutations++;}assert.throws(()=>validateDescriptor({...descriptor,unknown:true}));const r=await f.issue(descriptor.path);for(const key of Object.keys(r)){const copy={...r} as any;delete copy[key];assert.throws(()=>resolveTool(copy));mutations++;}for(const key of Object.keys(r.args)){const args={...r.args} as any;delete args[key];await denied(f,{...r,args});mutations++;}await allowed(f,r);}
 return {completeDescriptorMutations:mutations,closedInstalledVersionAndFullArguments:true};
});
toolCases['A27/closed-paths']=()=>fixtureCase(async f=>{
 const output:unknown[]=[],timeouts:unknown[]=[];
 for(const path of paths){for(const count of [65_536,65_537]){const r=await f.issue(path,{}, {outputBytes:count}),record=await allowed(f,r);assert.equal(record.report.outputBytes,count);assert.equal(record.report.retainedBytes,65_536);assert.equal(record.report.truncated,count>65_536);output.push(record.report);}
  for(const durationMs of [100,101]){const r=await f.issue(path,{timeoutMs:100},{durationMs}),response=await f.request(r);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.state,'unknown');assert.equal(response.body.report.timedOut,true);assert.ok(response.body.report.elapsedMs>=100);const snapshot=await f.snapshot();assert.equal(snapshot.events.filter((e:any)=>e.kind==='effect'&&e.operationId===r.operationId).length,0);assert.equal((await f.request(r)).status,503);timeouts.push(response.body.report);}}
 const r=await f.issue('mcp');f.state.lostAck=true;f.state.lookupUnavailable=true;const unknown=await f.request(r);assert.equal(unknown.status,200);assert.equal(unknown.body.state,'unknown');assert.equal((await f.snapshot()).events.filter((e:any)=>e.kind==='effect'&&e.operationId===r.operationId).length,1);await f.restart();assert.equal((await f.request(r)).status,503);await denied(f,{...r,key:randomUUID()});f.state.lookupUnavailable=false;const recovered=await f.clients(r,'lookup');for(const response of recovered){assert.equal(response.status,200);assert.equal(response.body.state,'confirmed');assert.equal(response.body.events.filter((event:any)=>event.kind==='effect-pending').length,1);assert.equal(response.body.events.filter((event:any)=>event.kind==='effect-resolved').length,1);}assert.equal((await f.snapshot()).events.filter((e:any)=>e.kind==='effect'&&e.operationId===r.operationId).length,1);const final=await f.request(r);assert.equal(final.body.report.pid,unknown.body.report.pid);
 return {outputEdges:output,timeoutEdges:timeouts,lostAckOriginalIdRecreatedLookup:true,noAutomaticReplay:true};
});
toolCases['Q05/owned-process-context']=()=>fixtureCase(async f=>{
 const reports:any[]=[];for(const path of paths){const r=await f.issue(path),record=await allowed(f,r),context=f.context(r);assert.equal(record.report.cwd,context.scratch);assert.equal(readFileSync(join(context.scratch,'dependency-lock.txt'),'utf8'),'owned-fixed-worker-v1');for(const key of ['leaseId','instanceId','dependencyDigest'])assert.equal(record.report[key],context[key as keyof typeof context]);assert.equal(record.report.uid,process.getuid?.()??null);reports.push(record.report);}
 assert.equal(new Set(reports.map(r=>r.cwd)).size,4);assert.equal(new Set(reports.map(r=>r.leaseId)).size,4);
 const badLease=await f.issue(),lease=f.context(badLease) as {expiresAt:number};for(const expiresAt of [Date.now(),Date.now()-1,Date.now()+60_000,Infinity]){lease.expiresAt=expiresAt;await denied(f,badLease);}
 const short=await f.issue('sdk',{}, {durationMs:200}),shortLease=f.context(short) as {expiresAt:number};shortLease.expiresAt=Date.now()+120;const timed=await f.request(short);assert.equal(timed.status,503,JSON.stringify(timed));const shortRecord=await f.ports.get(await f.f.scope(),short.operationId);assert.equal(shortRecord?.state,'unknown');assert.equal(shortRecord?.report?.timedOut,true);assert.equal((await f.snapshot()).events.filter((e:any)=>e.kind==='effect'&&e.operationId===short.operationId).length,0);
 const r=await f.issue();f.state.requireIsolation=true;await denied(f,r);f.state.requireIsolation=false;f.state.denyContext=true;await denied(f,r);f.state.denyContext=false;await allowed(f,r);return {actualContexts:reports,differentDirectoriesNeverClaimHostileIsolation:true,max30SecondLeaseAndMonotonicChildDeadline:true,missingAndStrongerContextRefused:true};
});
toolCases['R12/full']=()=>fixtureCase(async f=>{
 const r=await f.issue('shell'),record=await allowed(f,r),context=f.context(r),events=record.events as DomainEvent[];assert.ok(events.some(e=>e.kind==='effect-pending'));assert.ok(events.some(e=>e.kind==='effect-resolved'));const calls={authorize:0,execute:0,model:0,renew:0,allocate:0};const origin=createRun({scope:context.envelope.scope,taskId:r.taskId,runId:context.runId,attempt:1,requirementsRevision:context.envelope.requirementsRevision,versions:context.envelope.versions});
 const replay=new SessionLoop(origin,{clock:{now:Date.now},authorize:()=>{calls.authorize++;},execute:async()=>{calls.execute++;return 'committed';},model:async()=>{calls.model++;return 'forbidden';}});const before=await f.snapshot();replay.restore(events);assert.equal(replay.inspect().pendingOperations.length,0);assert.equal(calls.execute+calls.model+calls.renew+calls.allocate,0);assert.deepEqual(await f.snapshot(),before);assert.ok(calls.authorize>0);
 const native=await f.f.request('POST','',{key:randomUUID(),text:'ordinary native Ask'});assert.equal(native.status,200);const answered=await f.f.request('POST','/'+native.body.taskId+'/run',{key:randomUUID(),preflightDigest:native.body.preflightDigest,route:'answer',profile:'auto'});assert.equal(answered.status,200);assert.ok(answered.body.events.some((e:any)=>e.kind==='model-result'));
 return {nativeEngineEvents:events.map(e=>e.kind),ordinaryNativeAsk:true,historicalReplaySideEffectCounts:calls,actualWorkerPid:record.report.pid};
});
