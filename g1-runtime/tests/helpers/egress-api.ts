/** Fresh OS-process local composition. Original admitted records/approvals survive. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {BoundedEgress,egressHttp,type EgressPorts,type EgressRequest,type EgressPolicy,type EgressRecord} from '../../src/egress.js';
import {bindingDigest,approvalDigest,revalidateScope,type VerifiedScope,type ExactApprovalBinding} from '../../src/owners.js';
import {RuntimeAdmission,exactAdmissionBinding} from '../../src/admission.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {FixtureAdmissionStore,id} from './admission-fixture.js';
const root=process.argv[2]!,config=()=>JSON.parse(readFileSync(join(root,'api-config.json'),'utf8'));
const identity=createIdentityScopeVerifier({now:()=>config().now/1000,verifyToken:raw=>{const c=config();return verifyAccessToken(raw,{issuer:c.issuer,jwksUrl:c.issuer+'/jwks',apiAudience:'runtime-fixture',now:()=>config().now/1000});},lookupAuthority:async(session,scope)=>{const c=config(),a=c.authority;return session.issuer===c.issuer&&session.subject==='synthetic-member'&&session.sessionId==='synthetic-session'&&!c.tokenRevoked&&scope.tenantId===a.tenantId&&scope.spaceId===a.spaceId?{...a}:null;}});
const approvals={accept:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},require:async(scope:VerifiedScope,b:ExactApprovalBinding,digest:string)=>{await revalidateScope(scope);assert.ok(Date.parse(b.expiresAt)>config().now);const row=JSON.parse(readFileSync(join(dirname(root),'approvals',b.taskId+'.json'),'utf8'));assert.equal(row.actorId,scope.actorId);assert.equal(row.bindingDigest,approvalDigest(b));assert.equal(row.preflightDigest,digest);}};
const admission=new RuntimeAdmission({identity,store:new FixtureAdmissionStore(join(dirname(root),'admissions')),approvals,now:()=>config().now,current:async()=>config().intersection,source:{manifest:async()=>{const c=config();assert.equal(c.sourceAvailable,true);return {sourceId:id(5),digest:c.sourceDigest,audience:c.sourceAudience};},read:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}},model:{answer:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}},target:{id:id(6),write:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}}});
const path=(s:VerifiedScope,id:string)=>join(root,bindingDigest([s.tenantId,s.spaceId,s.actorId,id]).slice(7)+'.json');
const owner=async(path:string,body:unknown={},method='POST')=>{const c=config(),r=await fetch(c.allowed+path,{method,headers:{authorization:c.admin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(6000)});assert.equal(r.status,200);return await r.json() as any;};
let tail=Promise.resolve();
const ports:EgressPorts={now:Date.now,
 current:async(scope,r)=>{await revalidateScope(scope);const c=config(),b=c.bindings[r.taskId];assert.ok(b);const original=await admission.preflight(scope,r.taskId);assert.equal(bindingDigest(original),bindingDigest(b.record));if(original.preflight.envelope.intent==='act')await approvals.require(scope,exactAdmissionBinding(original),original.preflightDigest);assert.equal(bindingDigest(r),bindingDigest(b.request));return {...b.context,intersection:c.intersection};},
 grant:async(_scope,r,c)=>{const result=await owner('/grant',{request:r,expiresAt:c.expiresAt,lostAck:config().lostAck});return {endpoint:config().allowed,credential:result.credential};},
 lookup:async(_scope,r:EgressRequest)=>{if(config().lookupUnavailable)return null;const found=await owner('/lookup?operationId='+r.operationId+'&requestDigest='+encodeURIComponent(bindingDigest(r)),{},'GET');return found?.receiptDigest??null;},
 exclusive:async(_scope,_id,fn)=>{const prior=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await prior;try{return await fn();}finally{release();}},
 get:async(scope,id)=>existsSync(path(scope,id))?JSON.parse(readFileSync(path(scope,id),'utf8')) as EgressRecord:null,
 save:async(scope,id,row)=>{const p=path(scope,id),tmp=p+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(row),{flag:'wx'});renameSync(tmp,p);},
 activate:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},savePolicy:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}
};
const policy=JSON.parse(readFileSync(join(root,'policy.json'),'utf8')) as EgressPolicy,egress=new BoundedEgress(ports,policy),server=egressHttp(egress,c=>admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:c}));
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
