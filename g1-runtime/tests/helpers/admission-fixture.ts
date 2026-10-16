import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer,type Server} from 'node:http';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import type {SessionAuthority} from '../../../g1-identity/src/contracts.js';
import {bindingDigest as canonicalDigest,approvalDigest,revalidateScope,type ExactApprovalBinding,type VerifiedScope} from '../../src/owners.js';
import {RuntimeAdmission,type AdmissionRecord,type AdmissionStore,type AdmissionPorts,type Invocation} from '../../src/admission.js';
import {demand,immutable,type AdmissionEffect,type AuthorityIntersection} from '../../src/intent.js';
import {runtimeHttp} from '../../src/runtime-http.js';
import {api} from './owned-capsule.js';
export const id=(n:number)=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const effects:AdmissionEffect[]=['answer','source-read','bounded-write'];
export function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
/** Test-only actual disk owner; callback locking is per API process, not PG proof. */
export class FixtureAdmissionStore implements AdmissionStore {
 private tail=Promise.resolve();
 constructor(readonly root:string){mkdirSync(root,{recursive:true});}
 async exclusive<T>(_ns:string,fn:()=>Promise<T>):Promise<T>{const prior=this.tail;let release!:()=>void;this.tail=new Promise(r=>{release=r;});await prior;try{return await fn();}finally{release();}}
 private path(ns:string,key:string){return join(this.root,canonicalDigest([ns,key]).slice(7)+'.json');}
 private read<T>(path:string):T|null{return existsSync(path)?immutable(JSON.parse(readFileSync(path,'utf8')) as T):null;}
 async findCommand(ns:string,key:string){return this.read<AdmissionRecord>(this.path(ns,'command:'+key));}
 async get(ns:string,key:string){return this.read<AdmissionRecord>(this.path(ns,'task:'+key));}
 async insert(ns:string,r:AdmissionRecord){writeFileSync(this.path(ns,'task:'+r.taskId),JSON.stringify(r),{flag:'wx'});writeFileSync(this.path(ns,'command:'+r.commandKey),JSON.stringify(r),{flag:'wx'});}
 async invocation(ns:string,id:string){return this.read<Invocation>(this.path(ns,'invocation:'+id));}
 async recordInvocation(ns:string,id:string,v:Invocation){const path=this.path(ns,'invocation:'+id),prior=this.read<Invocation>(path);if(prior){assert.equal(prior.key,v.key);assert.equal(prior.digest,v.digest);assert.notEqual(prior.state,'completed');}const tmp=path+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(v),{flag:'wx'});renameSync(tmp,path);}
 mutate(ns:string,id:string,change:(r:AdmissionRecord)=>unknown){const path=this.path(ns,'task:'+id);writeFileSync(path,JSON.stringify(change(this.read<AdmissionRecord>(path)!)));}
}
async function listen(server:Server){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return 'http://127.0.0.1:'+(server.address() as {port:number}).port;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
function message(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture IPC timeout')),5000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',m=>{clearTimeout(timer);resolve(m);});});}
export async function admissionFixture(){
 const {ownedDirectory}=await api('build'),owned=ownedDirectory('runtime-admission-');
 const root=owned.path,secret=randomUUID();writeFileSync(join(root,'target.txt'),'initial');writeFileSync(join(root,'unrelated.txt'),'untouched');
 const target=fork(fileURLToPath(new URL('./admission-target.js',import.meta.url)),[root,secret],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
 const ready=await message(target);assert.equal(ready.pid,target.pid);const targetUrl='http://127.0.0.1:'+ready.port;
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...keys.publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
 const jwks=createServer((_req,res)=>res.end(JSON.stringify({keys:[jwk]}))),issuer=await listen(jwks);
 let time=Date.now();const now=()=>time;
 const authority:{-readonly [K in keyof SessionAuthority]:SessionAuthority[K]}={tenantId:id(1),spaceId:id(2),actorId:id(3),payerId:id(4),authorityRevision:1,membershipRevision:1,grants:['task:write','model:call','source:read','target:write'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active',principalKind:'human',sessionExpiresAt:new Date(time+120_000).toISOString()};
 const state={authority,tokenRevoked:false,intersection:{organization:[...effects],space:[...effects],role:[...effects],tool:[...effects],runtime:[...effects]} as AuthorityIntersection,
  sourceDigest:canonicalDigest('fixture-source'),sourceAudience:[id(3)],sourceAvailable:true,sourceFailure:false,modelFailure:false,
  beforeCurrent:null as null|(()=>Promise<void>),beforeModel:null as null|(()=>Promise<void>),beforeApproval:null as null|(()=>Promise<void>),beforeSource:null as null|(()=>Promise<void>),afterTarget:null as null|(()=>Promise<void>)};
 function token(extra:Record<string,unknown>={}){
  const h=Buffer.from(JSON.stringify({alg:'RS256',typ:'at+jwt',kid:'fixture'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:issuer,aud:'runtime-fixture',sub:'synthetic-member',sid:'synthetic-session',jti:randomUUID(),token_use:'access',iat:Math.floor(time/1000)-1,exp:Math.floor(time/1000)+90,...extra})).toString('base64url');
  return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),keys.privateKey).toString('base64url');
 }
 const identity=createIdentityScopeVerifier({now:()=>now()/1000,verifyToken:raw=>verifyAccessToken(raw,{issuer,jwksUrl:issuer+'/jwks',apiAudience:'runtime-fixture',now:()=>now()/1000}),lookupAuthority:async(session,scope)=>session.issuer===issuer&&session.subject==='synthetic-member'&&session.sessionId==='synthetic-session'&&!state.tokenRevoked&&scope.tenantId===authority.tenantId&&scope.spaceId===authority.spaceId?{...authority}:null});
 const calls={source:0,model:0,target:0,provision:0,wake:0,mount:0,shell:0,computer:0};
 const approvalsDir=join(root,'approvals');mkdirSync(approvalsDir);
 const approvalPath=(b:ExactApprovalBinding)=>join(approvalsDir,b.taskId+'.json');
 const approvals={
  async accept(scope:VerifiedScope,b:ExactApprovalBinding,digest:string){await revalidateScope(scope);demand(scope.actorId===authority.actorId&&b.sourceAudience.recipientActorIds.includes(scope.actorId),'UNAUTHORIZED');const row={actorId:scope.actorId,bindingDigest:approvalDigest(b),preflightDigest:digest,assurance:'synthetic-exact-acceptance'};const path=approvalPath(b);if(existsSync(path))assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),row);else writeFileSync(path,JSON.stringify(row),{flag:'wx'});},
  async require(scope:VerifiedScope,b:ExactApprovalBinding,digest:string){await state.beforeApproval?.();await revalidateScope(scope);demand(Date.parse(b.expiresAt)>now(),'APPROVAL_CONFLICT');demand(existsSync(approvalPath(b)),'APPROVAL_REQUIRED');const r=JSON.parse(readFileSync(approvalPath(b),'utf8'));demand(r.actorId===scope.actorId&&r.bindingDigest===approvalDigest(b)&&r.preflightDigest===digest,'APPROVAL_CONFLICT');}
 };
 let store=new FixtureAdmissionStore(join(root,'admissions'));
 const ports:AdmissionPorts={identity,store,approvals,now,
  current:async()=>{await state.beforeCurrent?.();return structuredClone(state.intersection);},
  source:{manifest:async()=>{demand(state.sourceAvailable,'PERMISSION_DENIED');return {sourceId:id(5),digest:state.sourceDigest,audience:[...state.sourceAudience]};},read:async(_scope,sourceId)=>{await state.beforeSource?.();demand(sourceId===id(5)&&state.sourceAvailable,'PERMISSION_DENIED');if(state.sourceFailure)throw new Error('synthetic source unavailable');calls.source++;return 'Selected eligible synthetic source';}},
  model:{answer:async(_scope,input,profile)=>{await state.beforeModel?.();calls.model++;if(state.modelFailure)throw new Error('synthetic model failure');return 'Fixture '+profile+' answer: '+input;}},
  target:{id:id(6),write:async(_scope,b,payload)=>{calls.target++;const r=await fetch(targetUrl+'/bounded',{method:'POST',headers:{authorization:secret},body:JSON.stringify({operationId:b.operationId,digest:approvalDigest(b),payload}),signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);await state.afterTarget?.();}}
 };
 let admission=new RuntimeAdmission(ports),server=runtimeHttp(admission),base=await listen(server);
 const route=()=>base+'/runtime/v1/tenants/'+id(1)+'/spaces/'+id(2)+'/tasks';
 const request=async(method:string,path:string,body?:unknown,bearer=token())=>{const r=await fetch(route()+path,{method,headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});return {status:r.status,body:await r.json() as any};};
 return {root,state,calls,identity,ports,token,request,route,now,advance:(ms:number)=>{time+=ms;},
  scope:()=>admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:token()}),
  get admission(){return admission;},get store(){return store;},
  async snapshot(){const r=await fetch(targetUrl+'/snapshot',{headers:{authorization:secret},signal:AbortSignal.timeout(5000)});return await r.json() as {target:string;unrelated:string;calls:{operationId:string;digest:string}[]};},
  async restart(){await close(server);store=new FixtureAdmissionStore(join(root,'admissions'));admission=new RuntimeAdmission({...ports,store});server=runtimeHttp(admission);base=await listen(server);},
  async clients(body:unknown,path=''){return await Promise.all([0,1].map(async()=>{const child=fork(fileURLToPath(new URL('./admission-client.js',import.meta.url)),[route()+path,token(),JSON.stringify(body)],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});const exit=once(child,'exit'),result=await message(child);await exit;return {...result,pid:child.pid};}));},
  async cleanup(){await close(server);await close(jwks);const exit=once(target,'exit');target.send('close');await exit;owned.cleanup();}
 };
}
export type Fixture=Awaited<ReturnType<typeof admissionFixture>>;
