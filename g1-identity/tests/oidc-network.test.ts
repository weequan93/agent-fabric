import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createHash,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {verifyAccessToken,assertVerifiedAccessToken,verifyIdentityToken} from '../src/token-verifier.js';
import {beginTestAuthorization,completeTestAuthorization} from '../src/test-idp.js';
import {createIdentityScopeVerifier} from '../src/current-authority.js';
import {startIdentityHttpService} from '../src/http-service.js';
import {revalidateScope} from '../../g1-foundations/src/contracts.js';
import type {ApprovalRepositoryPort,SessionAuthority} from '../src/contracts.js';
let child:ChildProcessWithoutNullStreams;
let endpoints:{issuer:string;jwksUrl:string;authorizationEndpoint:string;tokenEndpoint:string};
const clientId='synthetic-rp',apiAudience='fabric-api',redirectUri='http://127.0.0.1:7777/callback';
before(async()=>{
 child=spawn(process.execPath,['g1-identity/scripts/test-idp-process.mjs'],{cwd:process.cwd(),env:{...process.env,FABRIC_TEST_IDP_CONFIG:JSON.stringify({clientId,apiAudience,redirectUri,authorizationCodeSeconds:1,users:[{subject:'synthetic-user',password:'synthetic-only'}]})},stdio:['pipe','pipe','pipe']});
 endpoints=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Independent IdP did not start'));},5000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(new Error('IdP exited '+code));});child.stderr.on('data',()=>{});child.stdout.on('data',data=>{output+=String(data);if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]!));}});});
 assert.ok(child.pid!==process.pid);assert.match(endpoints.issuer,/^http:\/\/127\.0\.0\.1:\d+$/);
});
after(async()=>{if(child && child.exitCode===null){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}});
function params(){return beginTestAuthorization({...endpoints,clientId,apiAudience,redirectUri});}
async function authorize(p=params(),changes:Record<string,string>={}){const form=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(p.verifier).digest('base64url'),state:p.state,nonce:p.nonce,username:'synthetic-user',password:'synthetic-only',...changes});const response=await fetch(endpoints.authorizationEndpoint,{method:'POST',body:form,redirect:'manual'});return {response,p,callback:response.headers.get('location')??''};}
async function exchange(callback:string,verifier:string,changes:Record<string,string>={}){return fetch(endpoints.tokenEndpoint,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code:new URL(callback).searchParams.get('code')!,client_id:clientId,redirect_uri:redirectUri,code_verifier:verifier,...changes})});}
async function tokens(){const a=await authorize();assert.equal(a.response.status,302);const r=await exchange(a.callback,a.p.verifier);assert.equal(r.status,200);return {tokens:await r.json() as {access_token:string;id_token:string},p:a.p};}
function opts(){return {...endpoints,apiAudience};}
test('OIDC/independent discovery, real PKCE exchange and immutable token provenance',async()=>{
 const discovery=await (await fetch(endpoints.issuer+'/.well-known/openid-configuration')).json() as {issuer:string;qualification:string};assert.equal(discovery.issuer,endpoints.issuer);assert.equal(discovery.qualification,'local-synthetic-test-only');
 const a=await authorize();const raw=await completeTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,callbackUrl:a.callback,transaction:a.p,...a.p});const token=await verifyAccessToken(raw,opts());assert.equal(token.subject,'synthetic-user');assert.equal(Object.isFrozen(token),true);assertVerifiedAccessToken(token);assert.throws(()=>assertVerifiedAccessToken({...token}),/INVALID_TOKEN/);assert.equal('grants'in token,false);
});
test('OIDC/exact redirect, S256-only, password and required state nonce denials',async()=>{
 const denials:Record<string,string>[]=[{redirect_uri:redirectUri+'-evil'},{code_challenge_method:'plain'},{password:'wrong'},{state:''},{nonce:''},{client_id:'other'}];for(const change of denials)assert.equal((await authorize(params(),change)).response.status,400);
});
test('OIDC/code one use, wrong verifier, duplicate and expired grant denials',async()=>{
 const a=await authorize();assert.equal((await exchange(a.callback,a.p.verifier)).status,200);assert.equal((await exchange(a.callback,a.p.verifier)).status,400);
 const b=await authorize();assert.equal((await exchange(b.callback,randomBytes(32).toString('base64url'))).status,400);assert.equal((await exchange(b.callback,b.p.verifier)).status,400);
 const c=await authorize();await delay(1100);assert.equal((await exchange(c.callback,c.p.verifier)).status,400);
 const d=await authorize();assert.equal((await exchange(d.callback,d.p.verifier,{redirect_uri:redirectUri+'?x=1'})).status,400);
});
test('OIDC/RP checks callback state and cryptographically bound nonce before API use',async()=>{
 const a=await authorize();await assert.rejects(completeTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,callbackUrl:a.callback,transaction:a.p,...a.p,state:'unexpected-state-123456'}));
 const t=await tokens();await verifyIdentityToken(t.tokens.id_token,{...opts(),clientId,nonce:t.p.nonce});await assert.rejects(verifyIdentityToken(t.tokens.id_token,{...opts(),clientId,nonce:'wrong-nonce-12345678'}));await assert.rejects(verifyAccessToken(t.tokens.id_token,opts()));
 const b=await authorize();await assert.rejects(completeTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,callbackUrl:b.callback,transaction:b.p,...b.p,nonce:'wrong-nonce-12345678'}));
});
test('OIDC/RP consumes state nonce transaction across different codes sequentially and concurrently',async()=>{
 const p=params(),a=await authorize(p),b=await authorize(p);assert.equal(a.response.status,302);assert.equal(b.response.status,302);assert.notEqual(new URL(a.callback).searchParams.get('code'),new URL(b.callback).searchParams.get('code'));
 const complete=(callbackUrl:string,transaction:ReturnType<typeof params>)=>completeTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,callbackUrl,transaction,...transaction});
 await verifyAccessToken(await complete(a.callback,p),opts());await assert.rejects(complete(b.callback,p),/INVALID_GRANT/);
 const q=params(),c=await authorize(q),d=await authorize(q);assert.equal(c.response.status,302);assert.equal(d.response.status,302);
 const results=await Promise.allSettled([complete(c.callback,q),complete(d.callback,q)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const rejected=results.find(r=>r.status==='rejected');assert.ok(rejected&&rejected.status==='rejected');assert.match(String(rejected.reason),/INVALID_GRANT/);
});
test('OIDC/RP unregistered expired and exact bindings fail closed and consume before exchange',async()=>{
 const options=(callbackUrl:string,transaction:ReturnType<typeof params>)=>({...endpoints,clientId,apiAudience,redirectUri,callbackUrl,transaction,...transaction});
 const p=params(),a=await authorize(p);await assert.rejects(completeTestAuthorization({...options(a.callback,p),transaction:Object.freeze({...p})}),/INVALID_GRANT/);
 // A forged handle does not consume the genuine registered transaction.
 await verifyAccessToken(await completeTestAuthorization(options(a.callback,p)),opts());
 const expired=beginTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,transactionSeconds:1});await delay(1100);const freshCode=await authorize(expired);assert.equal(freshCode.response.status,302);await assert.rejects(completeTestAuthorization(options(freshCode.callback,expired)),/INVALID_GRANT/);
 const changes:Record<string,string>[]=[{issuer:endpoints.issuer+'/'},{jwksUrl:endpoints.jwksUrl+'-other'},{tokenEndpoint:endpoints.tokenEndpoint+'-other'},{clientId:'other'},{apiAudience:'other'},{redirectUri:redirectUri+'-other'},{state:'wrong-state-12345678'},{nonce:'wrong-nonce-12345678'},{verifier:randomBytes(32).toString('base64url')}];
 for(const change of changes){const transaction=params(),grant=await authorize(transaction);assert.equal(grant.response.status,302);await assert.rejects(completeTestAuthorization({...options(grant.callback,transaction),...change}),/INVALID_GRANT/);await assert.rejects(completeTestAuthorization(options(grant.callback,transaction)),/INVALID_GRANT/);assert.equal((await exchange(grant.callback,transaction.verifier)).status,200);}
 const failed=params(),bad=await authorize(failed);const invalid=new URL(bad.callback);invalid.searchParams.set('code','not-issued');await assert.rejects(completeTestAuthorization(options(invalid.href,failed)),/INVALID_GRANT/);await assert.rejects(completeTestAuthorization(options(bad.callback,failed)),/INVALID_GRANT/);
});
test('OIDC/strict signed issuer audience key type algorithm expiry and malformed rejection',async()=>{
 const {tokens:t}=await tokens();const good=t.access_token;await verifyAccessToken(good,opts());await assert.rejects(verifyAccessToken(good,{...opts(),issuer:endpoints.issuer+'/wrong'}));await assert.rejects(verifyAccessToken(good,{...opts(),apiAudience:'other'}));await assert.rejects(verifyAccessToken(good,{...opts(),now:()=>Date.now()/1000+3601}));await assert.rejects(verifyAccessToken(good,{...opts(),now:()=>0}));
 const p=good.split('.');for(const header of [{alg:'none',typ:'at+jwt',kid:'x'},{alg:'HS256',typ:'at+jwt',kid:'x'},{alg:'RS256',typ:'at+jwt',kid:'unknown'}])await assert.rejects(verifyAccessToken(Buffer.from(JSON.stringify(header)).toString('base64url')+'.'+p[1]+'.'+p[2],opts()));
 const claims=JSON.parse(Buffer.from(p[1]!,'base64url').toString('utf8')) as Record<string,unknown>;claims.grants=['approval:approve'];claims.sub='forged';await assert.rejects(verifyAccessToken(p[0]+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+p[2],opts()));for(const raw of ['',good+'.extra','x'.repeat(8193),'@@@.@@@.@@@'])await assert.rejects(verifyAccessToken(raw,opts()));
});
test('OIDC/original bound scope lookup revalidates and HTTP refuses wire authority',async()=>{
 const {tokens:t}=await tokens();const tenantId='00000000-0000-4000-8000-000000000001',spaceId='00000000-0000-4000-8000-000000000002';let current=true;
 const authority:SessionAuthority={tenantId,spaceId,actorId:'00000000-0000-4000-8000-000000000003',payerId:'00000000-0000-4000-8000-000000000004',authorityRevision:1,membershipRevision:1,grants:['task:read'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active',principalKind:'human',sessionExpiresAt:new Date(Date.now()+60000).toISOString()};
 const scopes=createIdentityScopeVerifier({verifyToken:raw=>verifyAccessToken(raw,opts()),lookupAuthority:async identity=>current&&identity.subject==='synthetic-user'?authority:null});const scope=await scopes.verify({tenantId,spaceId,sessionCredential:t.access_token});assert.equal(scopes.bindingFor(scope).actorId,authority.actorId);assert.throws(()=>scopes.bindingFor({...scope}));current=false;await assert.rejects(revalidateScope(scope));current=true;
 const no=async()=>{throw new Error('HTTP boundary should reject before repository');};const approvals:ApprovalRepositoryPort={create:no,approve:no,consume:no,lookupCommand:no};const service=await startIdentityHttpService({scopes,approvals});try{const url=service.url+'?tenantId='+tenantId+'&spaceId='+spaceId;const headers={authorization:'Bearer '+t.access_token,'content-type':'application/json'};assert.equal((await fetch(service.url+'/me?tenantId='+tenantId+'&spaceId='+spaceId,{headers})).status,200);for(const field of ['actorId','payerId','grants'])assert.equal((await fetch(service.url+'/approvals?tenantId='+tenantId+'&spaceId='+spaceId,{method:'POST',headers,body:JSON.stringify({[field]:'forged'})})).status,400);assert.equal((await fetch(url+'&actorId=forged',{headers})).status,400);}finally{await service.close();}
});

test('OIDC/valid-signature-time-and-key-policy-negative-cases',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'time-policy',alg:'RS256',use:'sig'};
 let published:Record<string,unknown>=jwk;
 const server=createServer((_request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({keys:[published]}));});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
 const address=server.address();assert.ok(address&&typeof address==='object');const issuer='http://127.0.0.1:'+address.port,now=Math.floor(Date.now()/1000);
 const options={issuer,jwksUrl:issuer+'/jwks',apiAudience,now:()=>now};
 const base={iss:issuer,aud:apiAudience,token_use:'access',sub:'synthetic-time',sid:'synthetic-session',jti:'synthetic-id',iat:now-1,exp:now+60};
 function token(claims:Record<string,unknown>={},header:Record<string,unknown>={}){const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'at+jwt',kid:'time-policy',...header})).toString('base64url'),c=Buffer.from(JSON.stringify({...base,...claims})).toString('base64url');return h+'.'+c+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+c),privateKey).toString('base64url');}
 try{
  await verifyAccessToken(token({nbf:now}),options);
  for(const claims of [{nbf:now+1},{nbf:now+0.5},{iat:now+1},{exp:now},{exp:base.iat},{exp:now+3601},{iss:issuer+'/other'},{aud:'other'},{token_use:'id'}])await assert.rejects(verifyAccessToken(token(claims),options),/INVALID_TOKEN/);
  for(const header of [{typ:'JWT'},{kid:'unknown'},{alg:'HS256'},{crit:['unknown']}])await assert.rejects(verifyAccessToken(token({},header),options),/INVALID_TOKEN/);
  published={...jwk,use:'enc'};await assert.rejects(verifyAccessToken(token(),options),/INVALID_TOKEN/);
  published={...jwk,alg:'RS512'};await assert.rejects(verifyAccessToken(token(),options),/INVALID_TOKEN/);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
