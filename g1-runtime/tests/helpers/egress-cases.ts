import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {bindingDigest} from '../../src/owners.js';
import type {EgressRequest} from '../../src/egress.js';
import {egressFixture,eventually,type EgressFixture} from './egress-fixture.js';
import {browserFixture} from './browser-fixture.js';
import {browserPaths} from '../../src/browser.js';
import {id,deferred} from './admission-fixture.js';
import type {Observations} from './register-cases.js';
const modes=['shell','sdk','mcp'] as const;
const events=(snapshot:any,kind:string)=>snapshot.allowed.events.filter((e:any)=>e.kind===kind);
async function positive(f:EgressFixture,r:EgressRequest,mode:'shell'|'sdk'|'mcp'='sdk'){
 const response=await f.client(r,mode);assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.state,'confirmed',JSON.stringify(response));
 if(r.action==='write')assert.equal((await f.snapshot()).allowed.target,r.body);else assert.equal(response.body.response.body,'owned source');return response;
}
async function blocked(f:EgressFixture,r:unknown,mode:'shell'|'sdk'|'mcp'='sdk'){
 const before=await f.snapshot(),grants=f.state.grantCalls,response=await f.client(r,mode);assert.notEqual(response.status,200,JSON.stringify(response));assert.equal(response.body.replayAllowed,false);assert.equal(f.state.grantCalls,grants,'Refusal before credential/capability launch');assert.deepEqual(await f.snapshot(),before,'Blocked request never reaches either actual destination');assert.ok(!JSON.stringify(response).includes(f.canary));return response;
}
function verify(snapshot:any,canary:string){
 for(const name of ['allowed','forbidden']){assert.equal(snapshot[name].protected,'protected-unchanged');assert.equal(snapshot[name].secretDigest,bindingDigest(canary));}
 assert.equal(snapshot.forbidden.target,'initial');assert.deepEqual(snapshot.forbidden.events,[],'Independent forbidden destination sees no broker forwarding');assert.equal(snapshot.allowed.activeStreams,0);
}
async function withFixture(fn:(f:EgressFixture)=>Promise<Record<string,unknown>>,tool=false):Promise<Observations>{
 const f=await egressFixture();try{
  const detail=await fn(f),snapshot=await f.snapshot();verify(snapshot,f.canary);
  for(const launch of f.launches){assert.ok(launch.pid>0);assert.equal(launch.uid,process.getuid?.()??null);assert.ok(launch.environmentKeys.every((k:string)=>['AF_NODE','AF_CLIENT','NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG','PWD','SHLVL','_','__CF_USER_TEXT_ENCODING'].includes(k)),JSON.stringify(launch));assert.ok(!launch.environmentKeys.some((k:string)=>/SECRET|TOKEN|PASSWORD|PGHOST|DATABASE|HTTP_PROXY|HTTPS_PROXY/i.test(k)));}
  const state={...detail,assurance:'owned-local-fixture',remoteQualified:false,arbitraryChildNetworking:'unsupported-not-contained',policy:f.egress.status()},destinations={snapshot,independentPids:[f.allowed.pid,f.forbidden.pid],calibrated:true,forbiddenEffects:0,broadSecretDisclosure:0},clients={launches:f.launches,apiRecreationPids:f.apiBirths,sameUid:true,hostileIsolation:false};
  return tool?{'tool-state':state,'target-observer':destinations,'worker-census':clients}:{'egress-state':state,'destination-observer':destinations,'independent-clients':clients};
 }finally{await f.cleanup();}
}
async function browserRefused(caseName:string){
 const browser=await browserFixture();try{
  for(const path of browserPaths)await browser.refused(caseName==='A07'?'login':caseName==='A05'?'input':'submit',browser.payload({effect:'read',toolName:'safe-read',url:browser.sinkUrl+'/control',grants:['browser:*','admin']}),path,'start');
  const restart=await browser.restart();await browser.refused('submit',browser.payload({effect:'unknown',toolName:'trusted-browser',profile:'qualified',endpoint:browser.sinkUrl}));
  return {actualPrelaunchRefusal:true,paths:browserPaths,restart,...await browser.verify(),positiveBrowserIsolation:false};
 }finally{await browser.cleanup();}
}
export const browserEgressToolCases:Record<string,()=>Promise<Observations>>={};
browserEgressToolCases['A00/browser-and-egress']=()=>withFixture(async f=>{
 for(const mode of modes){await positive(f,await f.issue('read','ask'),mode);const r=await f.issue();const responses=await f.clients(r,mode);assert.equal(new Set(responses.map(r=>r.pid)).size,2);for(const response of responses){assert.equal(response.status,200);assert.equal(response.body.state,'confirmed');}assert.deepEqual(responses[0].body,responses[1].body);await f.restart();const again=await f.clients(r,mode);for(const response of again)assert.deepEqual(response.body,responses[0].body);assert.equal(events(await f.snapshot(),'effect').filter((e:any)=>e.operationId===r.operationId).length,1);await blocked(f,{...r,targetId:id(99)},mode);const before=await f.snapshot();assert.equal((await f.direct(r,{targetId:id(99)})).status,403);assert.equal(events(await f.snapshot(),'effect').length,events(before,'effect').length);}
 return {actualHttpPaths:modes,allowedEffects:3,concurrentOriginalKeyAndRecreatedAdapter:true,browser:await browserRefused('A00')};
},true);
browserEgressToolCases['A03/browser-and-egress']=()=>withFixture(async f=>{
 let refusals=0;for(const mode of modes){const r=await f.issue();for(const delta of [{effect:'source-read'},{effect:'unknown'},{action:'read'},{method:'GET'},{toolId:'read-only-http'},{path:'shell'},{path:'browser'},{targetId:id(99)},{body:'changed after acceptance'},{url:f.allowed.base+'/delete'},{proxy:f.forbidden.base},{endpoint:f.forbidden.base}]){await blocked(f,{...r,...delta},mode);refusals++;}await positive(f,r,mode);}
 return {actualEffectAndCompleteBinding:true,disguisedAliasRefusals:refusals,browser:await browserRefused('A03')};
},true);
browserEgressToolCases['A05/browser-and-egress']=()=>withFixture(async f=>{
 const children:any[]=[];for(const mode of modes){const r=await f.issue(),credential=await f.grant(r),response=await f.client(r,mode,'dispatch',{request:r,endpoint:f.allowed.base,credential});assert.equal(response.status,200);assert.equal(response.body.state,'confirmed');assert.ok(response.probe.pid>0);assert.equal(response.probe.ppid,response.pid);assert.deepEqual(response.probe.statuses,[403,403,403,403,403,403,403]);children.push({...response.probe,path:mode});}
 assert.equal(events(await f.snapshot(),'refused').length,21);return {actualIndependentChildBypassProbes:children,ownerRefusedProtectedControlSecretSocketDbMetadataAndChangedEffect:true,browser:await browserRefused('A05')};
},true);
browserEgressToolCases['A07/browser-and-egress']=()=>withFixture(async f=>{
 for(const mode of modes){const r=await f.issue();await positive(f,r,mode);const credential=f.state.grant!.credential;for(const path of ['/secret','/socket','/control','/metadata'])assert.equal((await f.direct(r,{path},credential)).status,403);assert.equal((await f.direct(r,{operationId:randomUUID()},credential)).status,403);await f.revoke(r);assert.equal((await f.direct(r,{},credential)).status,403);}
 const r=await f.issue(),short=await f.grant(r,30);await new Promise(resolve=>setTimeout(resolve,60));assert.equal((await f.direct(r,{},short)).status,403);return {actualElapsedCredentialExpiry:true,credentialWrongOperationAndRevocation:true,broadSecretNeverInstalledInClientEnvironment:true,browser:await browserRefused('A07')};
},true);

export const egressCases:Record<string,()=>Promise<Observations>>={};
egressCases['E01/full']=()=>withFixture(async f=>{
 let intentRefusals=0;for(const mode of modes){await positive(f,await f.issue('read','ask'),mode);const write=await f.issue('write','ask'),response=await blocked(f,write,mode);assert.equal(response.body.code,'INTENT_EXCEEDED');intentRefusals++;const before=await f.snapshot(),grants=f.state.grantCalls;const plan=await f.admissionClient({key:randomUUID(),text:'Plan must not mutate the target',intent:'plan',targetId:id(6)},mode);assert.equal(plan.status,403);assert.equal(plan.body.code,'REQUIRED_CAPABILITY_UNSUPPORTED');assert.equal(f.state.grantCalls,grants);assert.deepEqual(await f.snapshot(),before);intentRefusals++;
  const r=await f.issue();for(const delta of [{path:'filesystem'},{method:'GET'},{targetId:id(99)},{spaceId:id(99)},{toolId:'read-only-egress'},{effect:'read'},{body:'unapproved bytes'}])await blocked(f,{...r,...delta},mode);
  const context=f.context(r) as any,expiry=context.expiresAt;for(const value of [Date.now()-1,Date.now(),Date.now()+60_000,Infinity]){context.expiresAt=value;await blocked(f,r,mode);}context.expiresAt=expiry;await positive(f,r,mode);
  const directBefore=await f.snapshot();assert.equal((await f.direct(r,{body:'unapproved bytes'})).status,403);assert.equal((await f.direct(r,{method:'GET'})).status,403);assert.equal(events(await f.snapshot(),'effect').length,events(directBefore,'effect').length);
 }
 const r=await f.issue();assert.equal((await f.request(r,'dispatch','forged')).status,403);const scope=await f.f.scope();await assert.rejects(()=>f.egress.dispatch({...scope} as any,r));await assert.rejects(()=>f.egress.lookup({...scope} as any,r));
 return {actualShellSdkStdioMcpReadsAndAcceptedWrites:true,askPlanRefusals:intentRefusals,planStatus:'native-unavailable-before-egress-no-positive-plan-read',receivedAndRefused:6,blockedBeforeForwarding:true,actualIntendedEffects:3};
});
egressCases['E02/full']=()=>withFixture(async f=>{
 const r=await f.issue();const fields=[{protocol:'udp'},{protocol:'raw'},{protocol:'tcp'},{proxy:f.forbidden.base},{connect:'127.0.0.1:80'},{websocket:true},{resolver:'custom'},{host:'metadata.internal'},{ip:'169.254.169.254'},{ip:'::1'},{socket:'/synthetic/socket'},{url:f.forbidden.base},{endpoint:f.forbidden.base},{headers:{authorization:f.canary}},{command:'curl '+f.forbidden.base},{relay:'ssh'},{relay:'rdp'},{relay:'vnc'},{effect:'unknown'}];
 for(const delta of fields)await blocked(f,{...r,...delta});for(const alias of ['connect','websocket','udp','raw','proxy','relay','ssh','rdp','vnc','custom-resolver']){const grants=f.state.grantCalls;assert.equal((await f.request(r,alias)).status,403);assert.equal(f.state.grantCalls,grants);}
 const redirect=await f.issue('redirect','ask'),response=await f.client(redirect);assert.equal(response.status,200);assert.equal(response.body.state,'unknown');assert.equal(events(await f.snapshot(),'redirect').length,1);assert.deepEqual((await f.snapshot()).forbidden.events,[]);await positive(f,r);
 return {unsupportedBeforeCredentialLaunch:fields.length+10,actual307NotFollowed:true,forbiddenDestinationRequests:0,unrestrictedNetworkingUnexposed:true,noOsContainmentClaim:true};
});
egressCases['E03/full']=()=>withFixture(async f=>{
 // Every pinned descriptor field is changed after issuance has actually awaited.
 const mutations:Record<string,(c:any)=>void>={endpoint:c=>{c.endpoint=f.forbidden.base;},runId:c=>{c.runId=randomUUID();},leaseId:c=>{c.leaseId=randomUUID();},expiresAt:c=>{c.expiresAt-=1;},envelope:c=>{c.envelope={...c.envelope,versions:{...c.envelope.versions,behavior:'changed'}};}};
 const original=f.ports.grant;for(const [field,mutate]of Object.entries(mutations)){const r=await f.issue(),c=f.context(r) as any,before=await f.snapshot();f.ports.grant=async(scope,request,context)=>{const result=await original(scope,request,context);mutate(c);return result;};const response=await f.request(r);assert.equal(response.status,200);assert.equal(response.body.state,'unknown');assert.equal(events(await f.snapshot(),'received').length,events(before,'received').length,'Fresh '+field+' mutation must refuse before send');f.ports.grant=original;}
 const scoped=await f.issue(),context=f.context(scoped) as any;context.envelope={...context.envelope,targets:[{...context.envelope.targets[0],scope:{tenantId:id(99),spaceId:id(2)}}]};await blocked(f,scoped);
 const stream=await f.issue('stream','ask'),streaming=f.request(stream);await eventually(async()=>((await f.snapshot()).allowed.activeStreams===1));f.f.state.authority.membershipRevoked=true;const ended=await streaming;assert.equal(ended.body.state,'unknown');await eventually(async()=>((await f.snapshot()).allowed.activeStreams===0));f.f.state.authority.membershipRevoked=false;
 const lease=await f.issue('stream','ask');(f.context(lease) as any).expiresAt=Date.now()+180;const leased=f.request(lease);await eventually(async()=>((await f.snapshot()).allowed.activeStreams===1));assert.equal((await leased).body.state,'unknown');await eventually(async()=>((await f.snapshot()).allowed.activeStreams===0));
 const r=await f.issue();await blocked(f,{...r,body:f.canary});for(const metadata of [{dns:{address:f.forbidden.base}},{proxyEnvironment:{HTTP_PROXY:f.forbidden.base}},{hostname:f.allowed.base,body:f.canary}])await blocked(f,{...r,...metadata});await positive(f,r);
 return {pinnedContextFields:Object.keys(mutations),crossScopeTargetRefused:true,actualLiveStreamAuthorityAndElapsedLeaseClosure:true,secretAndProxyDnsMetadataCannotRebind:true};
});
egressCases['E04/full']=()=>withFixture(async f=>{
 const r=await f.issue();f.state.lostAck=true;f.state.lookupUnavailable=true;const response=await f.client(r,'mcp');assert.equal(response.status,200);assert.equal(response.body.state,'unknown');assert.equal(events(await f.snapshot(),'effect').length,1);assert.equal(response.body.events.filter((e:any)=>e.kind==='effect-pending').length,1);assert.equal(response.body.events.filter((e:any)=>e.kind==='effect-resolved').length,0);
 await f.restart(true);for(const result of await f.clients(r,'shell')){assert.equal(result.status,503);assert.equal(result.body.code,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');}await blocked(f,{...r,key:randomUUID()});assert.equal((await f.request(r,'lookup')).body.state,'unknown');
 const context=f.context(r) as any,saved=structuredClone(context),mutations:Record<string,()=>void>={endpoint:()=>{context.endpoint=f.forbidden.base;},runId:()=>{context.runId=randomUUID();},leaseId:()=>{context.leaseId=randomUUID();},expiresAt:()=>{context.expiresAt-=1;},envelope:()=>{context.envelope={...context.envelope,versions:{...context.envelope.versions,behavior:'changed-after-unknown'}};}};
 f.state.lookupUnavailable=false;for(const [field,mutate]of Object.entries(mutations)){const before=await f.snapshot();mutate();const refused=await f.request(r,'lookup');assert.equal(refused.status,403,field);assert.equal(refused.body.code,'CHECK_BINDING_MISMATCH');assert.deepEqual(await f.snapshot(),before,'Changed original descriptor cannot contact any lookup destination');Object.assign(context,structuredClone(saved));}
 f.state.lookupUnavailable=false;const recovered=await f.clients(r,'sdk','lookup');for(const result of recovered){assert.equal(result.status,200);assert.equal(result.body.state,'confirmed');assert.equal(result.body.events.filter((e:any)=>e.kind==='effect-resolved').length,1);}assert.equal(events(await f.snapshot(),'effect').length,1);await f.restart(true);assert.deepEqual((await f.request(r)).body,recovered[0].body);assert.equal(new Set(f.apiBirths).size,2);assert.ok(events(await f.snapshot(),'lookup').every((e:any)=>e.method==='GET'));
 // An independent client is already received at the actual target before revoke.
 f.state.lostAck=false;const race=await f.issue();await f.owner('/hold');const client=f.client(race,'sdk');await eventually(async()=>events(await f.snapshot(),'waiting').some((e:any)=>e.operationId===race.operationId));await f.revoke(race);await f.owner('/release');assert.equal((await client).body.state,'unknown');assert.equal(events(await f.snapshot(),'effect').filter((e:any)=>e.operationId===race.operationId).length,0);
 const successor=await f.issue();await positive(f,successor,'shell');return {acceptedThenLostAckOriginalLookup:true,persistedOriginalContextFields:Object.keys(mutations),independentConcurrentLookupAndRecreatedApiProcesses:f.apiBirths,readOnlyOriginalLookupMethod:'GET',singleApiOwnerAtATime:true,noNewKeyReplay:true,actualDestinationWaitRevocationRace:true,distinctUsefulOperationAfterRace:true};
});
egressCases['A11/full']=()=>withFixture(async f=>{
 const stream=await f.issue('stream','ask'),response=f.client(stream);await eventually(async()=>((await f.snapshot()).allowed.activeStreams===1));
 f.state.activationHold=deferred();const scope=await f.f.scope(),activation=f.egress.restrict(scope,[]);await eventually(async()=>f.egress.status().phase==='pending');const pending=f.egress.status();assert.equal(pending.desiredGeneration,2);assert.equal(pending.effectiveGeneration,1);assert.equal(pending.coverage,'existing-and-new');assert.equal((await response).body.state,'unknown');await eventually(async()=>((await f.snapshot()).allowed.activeStreams===0));await blocked(f,await f.issue('read','ask'));
 await f.restart();assert.equal(f.egress.status().phase,'pending');await blocked(f,await f.issue('read','ask'));f.state.activationHold.resolve();const active=await activation;assert.equal(active.phase,'active');assert.equal(active.effectiveGeneration,2);assert.equal(active.desiredGeneration,2);assert.ok(active.lastVerifiedAt>=pending.lastVerifiedAt);
 await f.restart();assert.equal(f.egress.status().phase,'active');assert.deepEqual(f.egress.status().targets,[]);await blocked(f,await f.issue());
 // Delayed and failed backend acknowledgement retain a fail-closed durable state.
 f.state.activationHold=null;f.state.activationFailure=true;await assert.rejects(()=>f.egress.restrict(scope,[]),/POLICY_UNAVAILABLE/);assert.equal(f.egress.status().phase,'failed');assert.equal(f.egress.status().desiredGeneration,3);assert.equal(f.egress.status().effectiveGeneration,2);await f.restart();assert.equal(f.egress.status().phase,'failed');await blocked(f,await f.issue('read','ask'));f.state.activationFailure=false;const restored=await f.egress.restrict(scope,[]);assert.equal(restored.phase,'active');assert.equal(restored.effectiveGeneration,4);await f.restart();assert.deepEqual(f.egress.status(),restored);
 return {pending,activated:active,recovered:restored,actualExistingStreamClosedBeforeAck:true,failedAckNeverRestoresPrivilege:true,pendingFailedAndEffectiveGenerationsSurviveRecreation:true};
});
