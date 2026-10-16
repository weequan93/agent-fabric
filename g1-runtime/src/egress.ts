/** Finite cooperative HTTP adapter. This is not an arbitrary-process firewall. */
import {createServer,type IncomingMessage} from 'node:http';
import {object,version,uuid,enumeration,nullable,text,revision,refined} from './schemas.js';
import {assertVerifiedScope,revalidateScope,bindingDigest,parseTaskEnvelope,type VerifiedScope,type TaskEnvelope} from './owners.js';
import {immutable,requireIntent,type AuthorityIntersection} from './intent.js';
import {nativeSession} from './native-runtime.js';
import type {DomainEvent} from '../../engine/contracts/src/events.js';

export const EgressRequestSchema=refined(object({schemaVersion:version,operationId:uuid,key:uuid,taskId:uuid,
 toolId:enumeration('owned-http'),toolVersion:enumeration('1.0.0'),path:enumeration('egress'),
 targetId:uuid,action:enumeration('read','write','redirect','stream'),method:enumeration('GET','POST'),
 effect:enumeration('source-read','target-write'),body:nullable(text),
 timeoutMs:refined(revision,v=>v>0&&v<=5000),outputMaxBytes:refined(revision,v=>v>0&&v<=65_536)}),
 r=>r.action==='write'?r.method==='POST'&&r.effect==='target-write'&&r.body!==null:r.method==='GET'&&r.effect==='source-read'&&r.body===null);
export type EgressRequest=ReturnType<typeof EgressRequestSchema.parse>;
export interface EgressContext {
 readonly envelope:TaskEnvelope;readonly runId:string;readonly operationId:string;readonly requestDigest:string;
 readonly endpoint:string;readonly targetId:string;readonly leaseId:string;readonly expiresAt:number;
 readonly intersection:AuthorityIntersection;readonly assurance:'owned-local-fixture';
}
export interface EgressRecord {
 readonly key:string;readonly digest:string;readonly contextDigest:string;readonly request:EgressRequest;readonly state:'pending'|'unknown'|'confirmed';
 readonly replayAllowed:false;readonly response:null|{readonly status:number;readonly bytes:number;readonly body:string;readonly closed:boolean};
 readonly receiptDigest:string|null;readonly events:readonly DomainEvent[];
}
export interface PolicyObservation {readonly generation:number;readonly targetsDigest:string;readonly verifiedAt:number;readonly coverage:'existing-and-new'}
export interface EgressPolicy {readonly desiredGeneration:number;readonly effectiveGeneration:number;readonly phase:'active'|'pending'|'failed';readonly lastVerifiedAt:number;readonly coverage:'existing-and-new';readonly targets:readonly string[]}
export interface EgressPorts {
 now():number;
 current(scope:VerifiedScope,request:EgressRequest):Promise<EgressContext>;
 /** Composition-owned credential; never passed in arguments or inherited env. */
 grant(scope:VerifiedScope,request:EgressRequest,context:EgressContext):Promise<{readonly endpoint:string;readonly credential:string}>;
 lookup(scope:VerifiedScope,request:EgressRequest,context:EgressContext):Promise<string|null>;
 exclusive<T>(scope:VerifiedScope,id:string,fn:()=>Promise<T>):Promise<T>;
 get(scope:VerifiedScope,id:string):Promise<EgressRecord|null>;
 save(scope:VerifiedScope,id:string,record:EgressRecord):Promise<void>;
 activate(generation:number,targets:readonly string[]):Promise<PolicyObservation>;
 /** Durable composition-owned state, persisted before stronger restrictions wait. */
 savePolicy(policy:EgressPolicy):Promise<void>;
}
const check=(value:unknown,code:string):void=>{if(!value)throw new Error(code);};
function endpoint(raw:string):string {
 const u=new URL(raw);
 // The only installed transport is a literal, composition-owned loopback fixture.
 check(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port!==''&&u.username===''&&u.password===''&&u.pathname==='/'&&u.search===''&&u.hash==='','REQUIRED_CAPABILITY_UNSUPPORTED');
 return u.origin;
}
export class BoundedEgress {
 private policy:{desiredGeneration:number;effectiveGeneration:number;phase:'active'|'pending'|'failed';lastVerifiedAt:number;coverage:'existing-and-new';targets:readonly string[]};
 private readonly active=new Set<AbortController>();
 constructor(private readonly ports:EgressPorts,initial:EgressPolicy){
  check(new Set(initial.targets).size===initial.targets.length&&initial.coverage==='existing-and-new'&&Number.isSafeInteger(initial.desiredGeneration)&&initial.desiredGeneration>=1&&Number.isSafeInteger(initial.effectiveGeneration)&&initial.effectiveGeneration>=1&&initial.effectiveGeneration<=initial.desiredGeneration&&Number.isSafeInteger(initial.lastVerifiedAt)&&initial.lastVerifiedAt<=ports.now()&&['active','pending','failed'].includes(initial.phase)&&(initial.phase!=='active'||initial.desiredGeneration===initial.effectiveGeneration),'CHECK_BINDING_MISMATCH');initial.targets.forEach(t=>uuid.parse(t));
  this.policy=immutable(initial);
 }
 status(){return immutable({...this.policy,activeRequests:this.active.size,assurance:'owned-local-fixture',remoteQualified:false});}
 /** Internal composition call only: no public update/grant/relay route is installed. */
 async restrict(scope:VerifiedScope,targets:readonly string[]):Promise<ReturnType<BoundedEgress['status']>>{
  assertVerifiedScope(scope);await revalidateScope(scope);targets.forEach(t=>uuid.parse(t));check(new Set(targets).size===targets.length&&targets.every(t=>this.policy.targets.includes(t)),'CHECK_BINDING_MISMATCH');
  const generation=this.policy.desiredGeneration+1;
  this.policy={...this.policy,desiredGeneration:generation,phase:'pending',targets:Object.freeze([...targets].sort())};
  // Old privilege ends before any backend acknowledgement; failure cannot restore it.
  for(const controller of this.active)controller.abort();
  try{
   await this.ports.savePolicy(this.policy);
   const observed=await this.ports.activate(generation,this.policy.targets);await revalidateScope(scope);
   check(this.policy.desiredGeneration===generation&&observed.generation===generation&&observed.targetsDigest===bindingDigest(this.policy.targets)&&observed.coverage==='existing-and-new'&&Number.isSafeInteger(observed.verifiedAt)&&observed.verifiedAt<=this.ports.now()&&observed.verifiedAt>=this.policy.lastVerifiedAt,'POLICY_UNAVAILABLE');
   this.policy={...this.policy,effectiveGeneration:generation,phase:'active',lastVerifiedAt:observed.verifiedAt};
   await this.ports.savePolicy(this.policy);
  }catch{if(this.policy.desiredGeneration===generation){this.policy={...this.policy,phase:'failed'};await this.ports.savePolicy(this.policy);}throw new Error('POLICY_UNAVAILABLE');}
  return this.status();
 }
 private async current(scope:VerifiedScope,r:EgressRequest,generation=this.policy.effectiveGeneration,pinned?:EgressContext):Promise<EgressContext>{
  assertVerifiedScope(scope);await revalidateScope(scope);
  const c=await this.ports.current(scope,r),e=parseTaskEnvelope(c.envelope);
  requireIntent(scope,e,r.effect==='target-write'?'bounded-write':'source-read',c.intersection);
  check(c.assurance==='owned-local-fixture'&&c.operationId===r.operationId&&e.taskId===r.taskId&&c.targetId===r.targetId&&c.requestDigest===bindingDigest(r),'CHECK_BINDING_MISMATCH');
  check(r.effect!=='target-write'||e.targets.some(t=>t.resourceId===r.targetId&&t.scope.tenantId===scope.tenantId&&t.scope.spaceId===scope.spaceId),'CHECK_BINDING_MISMATCH');
  if(pinned)check(bindingDigest(c)===bindingDigest(pinned),'CHECK_BINDING_MISMATCH');
  uuid.parse(c.runId);uuid.parse(c.leaseId);endpoint(c.endpoint);
  const now=this.ports.now();check(Number.isSafeInteger(c.expiresAt)&&c.expiresAt>now&&c.expiresAt<=now+30_000,'LEASE_EXPIRED');
  check(this.policy.phase==='active'&&this.policy.desiredGeneration===generation&&this.policy.effectiveGeneration===generation&&this.policy.targets.includes(r.targetId),'POLICY_UNAVAILABLE');
  await revalidateScope(scope);return immutable(c);
 }
 private async send(scope:VerifiedScope,r:EgressRequest,c:EgressContext,generation:number):Promise<NonNullable<EgressRecord['response']>>{
  const grant=await this.ports.grant(scope,r,c);check(endpoint(grant.endpoint)===endpoint(c.endpoint)&&typeof grant.credential==='string'&&grant.credential.length>0,'CHECK_BINDING_MISMATCH');
  await this.current(scope,r,generation,c);
  const controller=new AbortController(),deadline=performance.now()+Math.min(r.timeoutMs,c.expiresAt-this.ports.now(),30_000);
  this.active.add(controller);let checking=false;
  const timer=setTimeout(()=>controller.abort(),Math.max(0,deadline-performance.now()));
  const watchdog=setInterval(()=>{if(checking)return;checking=true;void this.current(scope,r,generation,c).catch(()=>controller.abort()).finally(()=>{checking=false;});},20);
  try{
   check(!controller.signal.aborted&&performance.now()<deadline,'LEASE_EXPIRED');
   const response=await fetch(endpoint(c.endpoint)+'/owned/'+r.action,{method:r.method,headers:{authorization:'Bearer '+grant.credential,'x-operation-id':r.operationId,'x-target-id':r.targetId,'x-request-digest':bindingDigest(r),'content-type':'text/plain'},...(r.body===null?{}:{body:r.body}),redirect:'manual',signal:controller.signal});
   // Never resolve/follow even a same-host redirect. No response bytes are authority.
   check(response.status>=200&&response.status<300,'DESTINATION_REFUSED');
   const chunks:Buffer[]=[];let bytes=0;
   if(response.body)for await(const chunk of response.body){await this.current(scope,r,generation,c);check(performance.now()<deadline,'LEASE_EXPIRED');bytes+=chunk.byteLength;check(bytes<=r.outputMaxBytes,'OUTPUT_LIMIT');chunks.push(Buffer.from(chunk));}
   await this.current(scope,r,generation,c);
   return immutable({status:response.status,bytes,body:Buffer.concat(chunks).toString('utf8'),closed:true});
  }finally{controller.abort();clearTimeout(timer);clearInterval(watchdog);this.active.delete(controller);}
 }
 async dispatch(scope:VerifiedScope,raw:unknown):Promise<EgressRecord>{
  assertVerifiedScope(scope);await revalidateScope(scope);const r=EgressRequestSchema.parse(raw);
  return this.ports.exclusive(scope,r.operationId,async()=>{
   const generation=this.policy.effectiveGeneration,c=await this.current(scope,r,generation),digest=bindingDigest(r),prior=await this.ports.get(scope,r.operationId);
   if(prior){check(prior.key===r.key&&prior.digest===digest,'IDEMPOTENCY_CONFLICT');check(prior.contextDigest===bindingDigest(c),'CHECK_BINDING_MISMATCH');check(prior.state==='confirmed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');return immutable(prior);}
   let response:EgressRecord['response']=null;
   const loop=nativeSession(c.envelope,c.runId,{clock:{now:this.ports.now},authorize:()=>assertVerifiedScope(scope),model:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},execute:async()=>{response=await this.send(scope,r,c,generation);return 'committed';}});
   const persist=async(state:EgressRecord['state'],receiptDigest:string|null)=>{const row=immutable({key:r.key,digest,contextDigest:bindingDigest(c),request:r,state,replayAllowed:false as const,response,receiptDigest,events:loop.events()});await this.ports.save(scope,r.operationId,row);return row;};
   await persist('pending',null);
   try{
    if(r.effect==='target-write')await loop.dispatchEffect(r.operationId);else response=await this.send(scope,r,c,generation);
    await this.current(scope,r,generation,c);const receipt=r.effect==='target-write'?await this.ports.lookup(scope,r,c):bindingDigest(response);
    await this.current(scope,r,generation,c);return await persist(receipt?'confirmed':'unknown',receipt);
   }catch{return await persist('unknown',null);}
  });
 }
 async lookup(scope:VerifiedScope,raw:unknown):Promise<EgressRecord>{
  assertVerifiedScope(scope);await revalidateScope(scope);const r=EgressRequestSchema.parse(raw);return this.ports.exclusive(scope,r.operationId,async()=>{
   const generation=this.policy.effectiveGeneration,c=await this.current(scope,r,generation),prior=await this.ports.get(scope,r.operationId);check(prior,'NOT_FOUND');
   if(!prior)throw new Error('NOT_FOUND');check(prior.key===r.key&&prior.digest===bindingDigest(r),'IDEMPOTENCY_CONFLICT');check(prior.contextDigest===bindingDigest(c),'CHECK_BINDING_MISMATCH');
   if(prior.state==='confirmed')return immutable(prior);check(r.effect==='target-write','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');
   const receipt=await this.ports.lookup(scope,r,c);await this.current(scope,r,generation,c);if(!receipt)return immutable(prior);
   const loop=nativeSession(c.envelope,c.runId,{clock:{now:this.ports.now},authorize:()=>assertVerifiedScope(scope),execute:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},model:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}},prior.events);
   if(loop.inspect().pendingOperations.includes(r.operationId))loop.reconcile(r.operationId,'committed');
   const row=immutable({...prior,state:'confirmed' as const,receiptDigest:receipt,events:loop.events()});await this.ports.save(scope,r.operationId,row);return row;
  });
 }
}
async function body(req:IncomingMessage):Promise<unknown>{let size=0;const chunks:Buffer[]=[];for await(const c of req){const b=Buffer.from(c);size+=b.length;check(size<=65_536,'INVALID_SCHEMA');chunks.push(b);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
export function egressHttp(egress:BoundedEgress,authenticate:(credential:string)=>Promise<VerifiedScope>){return createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
 try{
  check(req.method==='POST'&&(req.url==='/runtime/v1/egress/dispatch'||req.url==='/runtime/v1/egress/lookup'),'REQUIRED_CAPABILITY_UNSUPPORTED');
  check(typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('Bearer '),'UNAUTHORIZED');
  const scope=await authenticate((req.headers.authorization as string).slice(7)),raw=await body(req);
  const row=await(req.url!.endsWith('/lookup')?egress.lookup(scope,raw):egress.dispatch(scope,raw));res.end(JSON.stringify(row));
 }catch(e){const codes=['REQUIRED_CAPABILITY_UNSUPPORTED','UNAUTHORIZED','CHECK_BINDING_MISMATCH','INTENT_EXCEEDED','LEASE_EXPIRED','POLICY_UNAVAILABLE','IDEMPOTENCY_CONFLICT','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','NOT_FOUND'];const code=e instanceof Error&&codes.includes(e.message)?e.message:'UNAUTHORIZED';res.statusCode=code==='UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'?503:403;res.end(JSON.stringify({code,replayAllowed:false,alternative:'Use an exact authorized owned operation, or perform the action yourself.'}));}
 });}
