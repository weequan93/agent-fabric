import assert from 'node:assert/strict';
import {join} from 'node:path';
import {browserChannels,browserPaths,browserRefusal} from '../../src/browser.js';
import {browserFixture,type BrowserFixture,bid} from './browser-fixture.js';
import type {Observations} from './register-cases.js';
async function exercise(work:(f:BrowserFixture)=>Promise<Record<string,unknown>>):Promise<Observations>{
 const f=await browserFixture();try{const detail=await work(f),observed=await f.verify();return {'browser-refusal':detail,'sensitive-sink':observed,'independent-clients':{pids:observed.births,retained:f.retained,scope:'cooperative-owned-fixture',remoteQualified:false}};}finally{await f.cleanup();}
}
export const browserCases:Record<string,()=>Promise<Observations>>={};
browserCases['B00/full']=()=>exercise(async f=>{
 for(const path of browserPaths)for(const channel of ['session','login','profile','cookies','clipboard','input'])await f.refused(channel,f.payload({childRoute:path}),path);
 return {allPaths:browserPaths,preAuthAndSensitiveChannelsRefused:true,noIsolationBadge:true};
});
browserCases['B01/full']=()=>exercise(async f=>{
 for(const missing of ['process','credential-domain','profile','cookies','input','telemetry','capture','all'])for(const alias of ['start','begin','login'])await f.refused('login',f.payload({missingIsolation:missing}), 'browser',alias);
 const concurrent=await Promise.all([f.refused('login',f.payload()),f.refused('session',f.payload())]);assert.notEqual(concurrent[0].pid,concurrent[1].pid);
 const recreated=await f.restart();await f.refused('login',f.payload());assert.match(browserRefusal.alternative,/yourself/);
 return {missingBoundaries:8,aliases:3,concurrentIndependentClients:true,recreated,alternativeOffered:true};
});
browserCases['B02/full']=()=>exercise(async f=>{
 const proofs=[{profile:'private'},{isolated:true,issuer:'worker',supported:true},{verifiedAt:1,expiresAt:1},{verifiedAt:Date.now(),expiresAt:Date.now()+60000},{grant:'login',generation:0},{directory:join(f.root,'profile-alias'),sameUid:true}];
 for(const proof of proofs)await f.refused('login',f.payload({proof}));
 await Promise.all(proofs.map(proof=>f.refused('session',f.payload({proof,ready:true}))));
 // B12 refusal-input vectors only. The qualification oracle remains07a.
 for(const proof of [{maskedScreenshot:true},{oneDriverLock:true},{namedDirectory:'private'},{sameUid:true},{workerPass:'PASS'},...['process','resource','input','telemetry'].map(missingProbe=>({independent:true,missingProbe}))])await f.refused('login',f.payload({qualification:proof,supported:true}));
 return {profileProofs:proofs.length,racedStartRefused:true,b12RefusalInputs:9,b12QualificationOraclePending:true};
});
browserCases['B03/full']=()=>exercise(async f=>{
 await Promise.all(['login','capture','input','view','recording'].map(channel=>f.refused(channel,f.payload({phase:'user-only',transition:'agent',grants:['all']}))));
 for(const phase of ['enter','active','exit'])await f.refused('capture',f.payload({phase,userOnly:true}));
 return {concurrentAuthenticationCaptureInputRefused:true,spoofedTransitionsRefused:true};
});
browserCases['B04/full']=()=>exercise(async f=>{
 for(const path of browserPaths)for(const channel of ['login','recording','capture'])await f.refused(channel,f.payload({log:f.canary,error:f.canary,telemetry:f.canary,configuration:{record:true}}),path);
 for(const raw of [f.canary,'{"password":"'+f.canary+'"','null','[]'])await f.refused('login',raw);
 await f.refused('login','x'.repeat(65536));const overflow=await f.request('login','x'.repeat(65537));assert.equal(overflow.status,413);assert.equal(overflow.body.code,'INVALID_SCHEMA');
 const unauthorized=await f.request('login',f.payload(),'browser','start','forged-'+f.canary);assert.equal(unauthorized.body.code,'UNAUTHORIZED');assert.equal(unauthorized.status,403);
 return {allConfiguredSinksScanned:true,malformedAndCredentialBearingErrorsSafe:true,retainedCapture:false};
});
browserCases['B05/full']=()=>exercise(async f=>{
 for(const profilePath of [join(f.root,'synthetic-personal'),join(f.root,'profile-alias'),join(f.root,'..','synthetic-personal'),'../../synthetic-personal','file://'+join(f.root,'synthetic-personal')])for(const path of ['browser','mcp','sdk'])await f.refused('import',f.payload({profilePath,permission:'group',destination:'group-desktop'}),path,'import');
 return {syntheticOnly:true,traversalSymlinkAndMcpImportRefused:true,importResourceOpens:0};
});
browserCases['B06/full']=()=>exercise(async f=>{
 const grants=['view','input','clipboard','download'];
 for(const grant of [...grants,'all','forged',''])for(const channel of grants)await f.refused(channel,f.payload({grants:grant==='all'?grants:[grant],expiresAt:Date.now()+30000}));
 return {separateGrantDimensions:4,grantChannelVectors:28,noCrossChannelAuthority:true};
});
browserCases['B07/full']=()=>exercise(async f=>{
 for(const optIn of [undefined,false,true,'forged'])for(const policy of ['default','deny','allow'])await f.refused('recording',f.payload({optIn,policy,audience:[bid(3)],retentionSeconds:60}));
 return {recordingPolicyOptInVectors:12,retainedCapture:0};
});
browserCases['B08/full']=()=>exercise(async f=>{
 const old=f.payload({profileHandle:'old-profile',driverHandle:'old-driver',cookie:f.canary,generation:1,restore:true});await f.refused('session',old);
 f.state.revoked=true;f.persist();const denied=await f.request('cookies',old);assert.equal(denied.body.code,'UNAUTHORIZED');
 const recreated=await f.restart();f.state.revoked=false;f.persist();
 await Promise.all(['session','cookies','profile','input'].map(channel=>f.refused(channel,old,'browser','restore')));
 return {recreated,noRestoredSessionGrantsOrCookies:true,concurrentOldHandlesRefused:true};
});
browserCases['B09/full']=()=>exercise(async f=>{
 const body=f.payload({operationId:bid(9),submit:true,lostAcknowledgement:true,lookupAvailable:false});await f.refused('submit',body,'gui','submit');
 const recreated=await f.restart();for(const operationId of [bid(9),bid(10)])await f.refused('submit',{...body,operationId},'browser','click');
 return {recreated,submitEvents:0,noResendOrSecondClick:true,noFalseUnknownReceipt:true};
});
browserCases['B10/full']=()=>exercise(async f=>{
 for(const action of ['payment','publish','security-change','unknown'])for(const path of ['gui','api','mcp','browser'])await f.refused('submit',f.payload({allowedHost:f.sinkUrl,action,toolName:'read-only',effect:'read'}),path,'submit');
 return {allowedHostNotActionAuthority:true,disguisedHighImpactVectors:16,humanAlternative:true};
});
browserCases['B11/full']=()=>exercise(async f=>{
 for(const target of [{spaceId:bid(99)},{instanceId:bid(98)},{device:'local-mac',enrolled:true},{remoteWorkspace:'unapproved'},{target:f.sinkUrl}])await f.refused('takeover',f.payload({target}),'gui');
 for(const scope of [{tenantId:bid(1),spaceId:bid(99)},{tenantId:bid(99),spaceId:bid(2)}]){const wrong=await f.request('input',f.payload(),'browser','start',f.token(),scope);assert.equal(wrong.status,403);assert.equal(wrong.body.code,'UNAUTHORIZED');}
 const wrongPath=await f.request('input',f.payload(),'browser/../spaces/'+bid(99));assert.equal(wrongPath.status,404);
 return {wrongTargetsAndUnenrolledLocalRefused:true,selectedWorkspaceNeverRetargeted:true};
});
browserCases['Q14/full']=()=>exercise(async f=>{
 const r=await Promise.all([f.refused('input',f.payload({role:'driver',fence:1})),f.refused('input',f.payload({role:'driver',fence:2})),f.refused('input',f.payload({grants:['view']}))]);assert.equal(new Set(r.map(x=>x.pid)).size,3);
 return {independentDrivers:3,inputDelivery:0,viewerEscalationRefused:true};
});
browserCases['Q15/full']=()=>exercise(async f=>{
 await Promise.all(browserPaths.map(path=>f.refused('takeover',f.payload({queuedInput:true,inFlight:'unknown',human:true,lease:'forged'}),path)));
 return {takeoverAliases:browserPaths,driverLeaseEvents:0,queuedInputNotDelivered:true,noQuiescenceOrHumanFenceInvented:true};
});
browserCases['Q16/full']=()=>exercise(async f=>{
 const oldToken=f.token(),old=f.payload({driver:'old',profile:'old',resume:true,returnControl:true});await f.refused('input',old);
 f.state.now+=120000;f.persist();assert.equal((await f.request('input',old,'browser','resume',oldToken)).body.code,'UNAUTHORIZED');
 const recreated=await f.restart();f.state.authority={...f.state.authority,sessionExpiresAt:new Date(f.state.now+120000).toISOString()};f.persist();
 for(const action of ['resume','return-control','restore'])await f.refused('return',old,'gui',action);
 return {recreated,expiredGrantNotResurrected:true,noImplicitResume:true};
});
browserCases['Q17/full']=()=>exercise(async f=>{
 for(const changed of ['focus','frame','geometry','target','lease','reconnect','fresh'])await f.refused('input',f.payload({focus:changed==='focus'?'wrong':'current',frame:changed==='frame'?'stale':'fresh',geometry:changed==='geometry'?[-1,0,0,0]:[0,0,800,600],target:changed==='target'?'wrong':'selected',expiresAt:changed==='lease'?0:Date.now()+30000,reconnect:changed==='reconnect'}),'gui','send');
 return {freshAndStaleVectors:7,allGuiOperationsRefused:true};
});
