import { createServer, type IncomingMessage } from 'node:http';
import { generateKeyPairSync, randomUUID, randomBytes, createHash, sign, timingSafeEqual } from 'node:crypto';
import { IdentityError, type TestIdpOptions, type RunningTestIdp } from './contracts.js';
import {verifyIdentityToken,verifyAccessToken} from './token-verifier.js';
interface Code {subject:string;challenge:string;redirect:string;nonce:string;expires:number}
async function body(req:IncomingMessage):Promise<URLSearchParams>{if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw new IdentityError('INVALID_INPUT');let value='';for await(const chunk of req){value+=String(chunk);if(value.length>16384)throw new IdentityError('INVALID_INPUT');}const q=new URLSearchParams(value);for(const k of q.keys())if(q.getAll(k).length!==1)throw new IdentityError('INVALID_INPUT');return q;}
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
/** Synthetic fixture only. Start in a separate process so its private key never enters API memory. */
export async function startTestIdp(options:TestIdpOptions & {authorizationCodeSeconds?:number}):Promise<RunningTestIdp>{
 if(options.host && options.host!=='127.0.0.1') throw new IdentityError('INVALID_INPUT');
 const redirect=new URL(options.redirectUri); if(redirect.hostname!=='127.0.0.1'||redirect.protocol!=='http:'||redirect.hash||redirect.username||redirect.password||!options.clientId||!options.apiAudience) throw new IdentityError('INVALID_INPUT');
 if(!options.users.length||new Set(options.users.map(u=>u.subject)).size!==options.users.length||options.users.some(u=>!u.subject||!u.password)) throw new IdentityError('INVALID_INPUT');
 const ttl=options.accessTokenSeconds??120; if(!Number.isSafeInteger(ttl)||ttl<1||ttl>3600) throw new IdentityError('INVALID_INPUT');
 const codeTtl=options.authorizationCodeSeconds??30;if(!Number.isSafeInteger(codeTtl)||codeTtl<1||codeTtl>30)throw new IdentityError('INVALID_INPUT');
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const kid=randomUUID();
 const jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'}; const codes=new Map<string,Code>();let issuer='';
 const jwt=(claims:Record<string,unknown>,type:string)=>{const h=Buffer.from(JSON.stringify({alg:'RS256',typ:type,kid})).toString('base64url'),b=Buffer.from(JSON.stringify(claims)).toString('base64url');return h+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+b),privateKey).toString('base64url');};
 const server=createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
  try{
   const path=new URL(req.url??'/',issuer).pathname;
   if(req.method==='GET'&&path==='/.well-known/openid-configuration'){res.end(JSON.stringify({issuer,jwks_uri:issuer+'/jwks',authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',response_types_supported:['code'],code_challenge_methods_supported:['S256'],id_token_signing_alg_values_supported:['RS256'],qualification:'local-synthetic-test-only'}));return;}
   if(req.method==='GET'&&path==='/jwks'){res.end(JSON.stringify({keys:[jwk]}));return;}
   if(req.method==='POST'&&path==='/authorize'){
    const q=await body(req); const user=options.users.find(u=>u.subject===q.get('username'));
    const challenge=q.get('code_challenge')??'',state=q.get('state')??'',nonce=q.get('nonce')??'';
    if(q.get('client_id')!==options.clientId||q.get('redirect_uri')!==options.redirectUri||q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)||state.length<16||state.length>256||nonce.length<16||nonce.length>256||!user||!equal(q.get('password')??'',user.password)) throw new IdentityError('INVALID_GRANT');
    const now=Date.now();for(const [id,c]of codes)if(c.expires<=now)codes.delete(id);if(codes.size>=1024)throw new IdentityError('INVALID_GRANT');
    const code=randomUUID();codes.set(code,{subject:user.subject,challenge,redirect:options.redirectUri,nonce,expires:now+codeTtl*1000});
    const callback=new URL(options.redirectUri);callback.searchParams.set('code',code);callback.searchParams.set('state',state);res.statusCode=302;res.setHeader('location',callback.href);res.end();return;
   }
   if(req.method==='POST'&&path==='/token'){
    const q=await body(req),id=q.get('code')??'',code=codes.get(id);codes.delete(id);
    const verifier=q.get('code_verifier')??'';
    if(!code||code.expires<=Date.now()||q.get('grant_type')!=='authorization_code'||q.get('client_id')!==options.clientId||q.get('redirect_uri')!==code.redirect||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!equal(createHash('sha256').update(verifier).digest('base64url'),code.challenge))throw new IdentityError('INVALID_GRANT');
    const iat=Math.floor(Date.now()/1000),sid=randomUUID(),exp=iat+ttl;
    await options.sessionStore?.create({issuer,subject:code.subject,sessionId:sid,expiresAt:new Date(exp*1000).toISOString(),revokedAt:null});
    const common={iss:issuer,sub:code.subject,sid,iat,exp,jti:randomUUID()};
    res.end(JSON.stringify({access_token:jwt({...common,aud:options.apiAudience,token_use:'access'},'at+jwt'),id_token:jwt({...common,aud:options.clientId,nonce:code.nonce,token_use:'id'},'JWT'),token_type:'Bearer',expires_in:ttl,qualification:'local-synthetic-test-only'}));return;
   }
   res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));
  }catch{res.statusCode=400;res.end(JSON.stringify({error:'invalid_grant'}));}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',()=>resolve());});const address=server.address();if(!address||typeof address==='string')throw new Error('listen failed');issuer='http://127.0.0.1:'+address.port;
 return {issuer,jwksUrl:issuer+'/jwks',authorizationEndpoint:issuer+'/authorize',tokenEndpoint:issuer+'/token',qualification:'local-synthetic-test-only',close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};
}
interface TestAuthorizationBinding {issuer:string;jwksUrl:string;tokenEndpoint:string;clientId:string;apiAudience:string;redirectUri:string}
/** Opaque process-local handle; copying the public PKCE/state/nonce fields does not register it. */
export interface TestAuthorizationTransaction {readonly state:string;readonly nonce:string;readonly verifier:string}
interface PendingAuthorization {binding:Readonly<TestAuthorizationBinding>;expires:number}
const pendingAuthorizations=new Map<TestAuthorizationTransaction,PendingAuthorization>();
const bindingKeys=['issuer','jwksUrl','tokenEndpoint','clientId','apiAudience','redirectUri'] as const;
/** Begin from trusted RP configuration, never from callback-supplied state/nonce. */
export function beginTestAuthorization(options:TestAuthorizationBinding & {transactionSeconds?:number}):TestAuthorizationTransaction {
 const seconds=options.transactionSeconds??120;
 if(!Number.isSafeInteger(seconds)||seconds<1||seconds>300)throw new IdentityError('INVALID_INPUT');
 const issuer=new URL(options.issuer),redirect=new URL(options.redirectUri);
 if(issuer.protocol!=='http:'||issuer.hostname!=='127.0.0.1'||issuer.username||issuer.password||issuer.search||issuer.hash||issuer.pathname!=='/'||redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||redirect.username||redirect.password||redirect.hash||!options.clientId||!options.apiAudience)throw new IdentityError('INVALID_INPUT');
 for(const value of [options.jwksUrl,options.tokenEndpoint]){const endpoint=new URL(value);if(endpoint.origin!==issuer.origin||endpoint.username||endpoint.password||endpoint.hash||endpoint.search)throw new IdentityError('INVALID_INPUT');}
 const now=Date.now();for(const [handle,pending]of pendingAuthorizations)if(pending.expires<=now)pendingAuthorizations.delete(handle);
 if(pendingAuthorizations.size>=1024)throw new IdentityError('INVALID_GRANT');
 const binding=Object.freeze(Object.fromEntries(bindingKeys.map(key=>[key,options[key]])) as unknown as TestAuthorizationBinding);
 const transaction=Object.freeze({state:randomBytes(32).toString('base64url'),nonce:randomBytes(32).toString('base64url'),verifier:randomBytes(32).toString('base64url')});
 pendingAuthorizations.set(transaction,{binding,expires:now+seconds*1000});return transaction;
}
/** Consume before validation or any asynchronous exchange: errors and concurrent callbacks cannot retry the handle. */
export async function completeTestAuthorization(options:TestAuthorizationBinding & {callbackUrl:string;state:string;nonce:string;verifier:string;transaction:TestAuthorizationTransaction}):Promise<string>{
 const pending=pendingAuthorizations.get(options.transaction);pendingAuthorizations.delete(options.transaction);
 if(!pending||pending.expires<=Date.now()||bindingKeys.some(key=>options[key]!==pending.binding[key])||options.state!==options.transaction.state||options.nonce!==options.transaction.nonce||options.verifier!==options.transaction.verifier)throw new IdentityError('INVALID_GRANT');
 const callback=new URL(options.callbackUrl),expected=new URL(options.redirectUri);
 if(callback.searchParams.getAll('state').length!==1||callback.searchParams.getAll('code').length!==1||callback.searchParams.get('state')!==options.state||!callback.searchParams.get('code')||expected.searchParams.has('state')||expected.searchParams.has('code'))throw new IdentityError('INVALID_GRANT');
 const returned=new URL(callback);returned.searchParams.delete('state');returned.searchParams.delete('code');
 if(returned.href!==expected.href)throw new IdentityError('INVALID_GRANT');
 const response=await fetch(pending.binding.tokenEndpoint,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code:callback.searchParams.get('code')!,client_id:pending.binding.clientId,redirect_uri:pending.binding.redirectUri,code_verifier:options.transaction.verifier}),signal:AbortSignal.timeout(3000),redirect:'error'});
 if(!response.ok)throw new IdentityError('INVALID_GRANT');const raw=await response.text();if(raw.length>32768)throw new IdentityError('INVALID_GRANT');const tokens=JSON.parse(raw) as {access_token:string;id_token:string};
 await verifyIdentityToken(tokens.id_token,{...pending.binding,nonce:options.transaction.nonce});
 const verified=await verifyAccessToken(tokens.access_token,pending.binding);const identity=JSON.parse(Buffer.from(tokens.id_token.split('.')[1]!,'base64url').toString('utf8')) as {sub:string;sid:string};
 if(identity.sub!==verified.subject||identity.sid!==verified.sessionId)throw new IdentityError('INVALID_GRANT');return tokens.access_token;
}
