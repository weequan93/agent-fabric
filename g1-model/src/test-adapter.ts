import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import { body, boolean, enumeration, list, literal, nullable, object, positive, revision, uuid, version } from './decoder.js';
import { EncodedRequestSchema, OperatingProfileSchema, OriginalCallSchema, OwnerObservationSchema, UsageReceiptSchema } from './schema.js';
import { demand, ModelError, safeFailure } from './errors.js';
import { measuredCost, safeAdd } from './arithmetic.js';
import type { EncodedRequest, ModelAdapterPort, OperatingProfile, OriginalCall, OwnerObservation } from './contracts.js';

export const ADAPTER_VERSION = 'deterministic-adapter-v1';
/** Documented closed local dialect. It is not an external tool executor. */
export const LocalPayloadSchema = object({ schemaVersion: version, modality: literal('text'), dialect: literal('local-json-v1'),
 text: body, response: enumeration('text', 'tool'), toolArguments: nullable(object({ message: body })), privateState: nullable(uuid) });
export const ScheduleSchema = object({ usage: enumeration('auto','manual','never'), outcome: enumeration('answer','known-failure'), durationMs: revision, extraUnits: revision, dropAck: literal(false) });
export type Schedule = ReturnType<typeof ScheduleSchema.parse>;
export const DEFAULT_SCHEDULE: Schedule = ScheduleSchema.parse({ usage:'auto', outcome:'answer', durationMs:0, extraUnits:0, dropAck:false });
export const HOOKS = ['pre-accept','owner-commit','lost-ack','usage','lookup','chunk'] as const;
export type Hook = typeof HOOKS[number];
export interface AdapterHooks { hit(hook: Hook, original: OriginalCall): Promise<void>; schedule(original: OriginalCall): Schedule; loseAck(original: OriginalCall): boolean }
const NO_HOOKS: AdapterHooks = { hit:async()=>{}, schedule:()=>DEFAULT_SCHEDULE, loseAck:()=>false };
export function requestDigestOf(request: Omit<EncodedRequest,'original'> & { original: Omit<OriginalCall,'requestDigest'> | OriginalCall }): string {
 const { requestDigest: _digest, ...original } = request.original as OriginalCall;
 return 'sha256:' + canonicalDigest({ ...request, original });
}
export function encodeLocalRequest(input: Omit<EncodedRequest,'original'> & { original: Omit<OriginalCall,'requestDigest'> }): EncodedRequest {
 return EncodedRequestSchema.parse({ ...input, original: { ...input.original, requestDigest:requestDigestOf(input) } });
}
const binding = (o: OriginalCall) => [o.tenantId,o.spaceId,o.operationId,o.attemptId];
const key = (o: OriginalCall) => binding(o).join('/');
const same = (a: unknown,b: unknown) => canonicalDigest(a) === canonicalDigest(b);
type Journal = { original: OriginalCall; dispatch_epoch: string; status: 'accepted'|'settled'|'sealed-not-accepted';
 request: EncodedRequest | null; receipt: unknown; proof_id: string | null; output: string | null; chunks: string[] | null; private_state: string | null; schedule: Schedule | null; cancel_requested: boolean };

/** Independent downstream owner; the pool has only restricted receipt-domain grants. */
export class DeterministicReceiptOwner implements ModelAdapterPort {
 readonly profile: OperatingProfile;
 private readonly working = new Map<string,Promise<void>>();
 private readonly failures: unknown[] = [];
 constructor(readonly pool: Pool, readonly ownerId: string, profile: OperatingProfile, private readonly hooks: AdapterHooks = NO_HOOKS) {
  uuid.parse(ownerId); this.profile = OperatingProfileSchema.parse(profile);
  const c = this.profile.capabilities;
  demand(c.inputModalities.length===1 && c.inputModalities[0]==='text' && c.outputModalities.length===1 && c.outputModalities[0]==='text'
   && c.toolDialect==='local-json-v1' && c.schemaDialect==='local-closed-json-v1' && c.optionalFeatures.length===0
   && c.requiredOptionalFeatures.length===0 && !c.caching.promptPrefix && !c.caching.exactResponse && !c.caching.semanticResponse
   && !c.cancellation.terminationProof && this.profile.runtimeRequirements.executionClass==='service', 'REQUIRED_CAPABILITY_UNSUPPORTED');
 }
 private async tx<T>(o: OriginalCall, fn: (c: PoolClient,row: Journal|undefined)=>Promise<T>): Promise<T> {
  const c = await this.pool.connect();
  try {
   await c.query('BEGIN'); await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['model-receipt/'+this.ownerId+'/'+key(o)]);
   // Fresh READ COMMITTED statement AFTER the original key lock; digest is not in lock key.
   const row = (await c.query('SELECT * FROM model_receipts.journal WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5',[this.ownerId,...binding(o)])).rows[0] as Journal|undefined;
   if(row) demand(same(row.original,o),'IDEMPOTENCY_CONFLICT');
   const result = await fn(c,row); await c.query('COMMIT'); return result;
  } catch(error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
 }
 private async count(c: PoolClient,kind: string,n=1) {
  await c.query('INSERT INTO model_receipts.counters(owner_id,kind,count) VALUES($1,$2,$3) ON CONFLICT(owner_id,kind) DO UPDATE SET count=model_receipts.counters.count+EXCLUDED.count',[this.ownerId,kind,n]);
 }
 private observation(o: OriginalCall,row?: Journal): OwnerObservation {
  if(!row) return OwnerObservationSchema.parse({status:'unknown',original:o});
  if(row.status==='settled') return OwnerObservationSchema.parse({status:'settled',receipt:row.receipt});
  if(row.status==='sealed-not-accepted') return OwnerObservationSchema.parse({status:row.status,original:o,ownerId:this.ownerId,proofId:row.proof_id,dispatchEpoch:Number(row.dispatch_epoch)});
  return OwnerObservationSchema.parse({status:'accepted',original:o});
 }
 async accept(input: EncodedRequest): Promise<OwnerObservation> {
  const request = EncodedRequestSchema.parse(input), o=request.original;
  demand(request.original.requestDigest===requestDigestOf(request),'CHECK_BINDING_MISMATCH');
  demand(request.profileDigest===this.profile.profileDigest,'CHECK_BINDING_MISMATCH');
  let raw: unknown; try { raw=JSON.parse(request.payload); } catch { throw new ModelError('INVALID_SCHEMA'); }
  // Unsupported modality/dialect are explicit capability refusals, with no acceptance.
  if(raw && typeof raw==='object') { const p=raw as Record<string,unknown>; demand(p['modality']==='text' && p['dialect']==='local-json-v1','REQUIRED_CAPABILITY_UNSUPPORTED'); }
  const payload=LocalPayloadSchema.parse(raw);
  demand(Buffer.byteLength(request.payload)<=this.profile.capabilities.contextLimit,'REQUIRED_CAPABILITY_UNSUPPORTED');
  demand(request.outputCap<=1_048_576 && request.durationCapMs<=30_000,'REQUIRED_CAPABILITY_UNSUPPORTED');
  demand(payload.response==='tool' ? payload.toolArguments!==null : payload.toolArguments===null);
  await this.hooks.hit('pre-accept',o);
  const observed = await this.tx(o,async(c,row)=>{
   await this.count(c,'accept');
   if(row) {
    demand(row.status!=='sealed-not-accepted','STALE_FENCE');
    demand(row.request && same(row.request,request),'IDEMPOTENCY_CONFLICT');
    return this.observation(o,row);
   }
   if(payload.privateState) {
    const state=(await c.query('SELECT tenant_id,space_id,profile_digest,context_digest FROM model_receipts.private_states WHERE owner_id=$1 AND token=$2',[this.ownerId,payload.privateState])).rows[0];
    demand(state && state.tenant_id===o.tenantId && state.space_id===o.spaceId && state.profile_digest===request.profileDigest && state.context_digest===request.contextDigest,'SCOPE_MISMATCH');
   }
   const schedule=ScheduleSchema.parse(this.hooks.schedule(o));
   await c.query("INSERT INTO model_receipts.journal(owner_id,tenant_id,space_id,operation_id,attempt_id,original,dispatch_epoch,status,request,schedule,accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'accepted',$8,$9,now())",[this.ownerId,...binding(o),JSON.stringify(o),request.dispatchEpoch,JSON.stringify(request),JSON.stringify(schedule)]);
   await this.count(c,'acceptance'); await this.hooks.hit('owner-commit',o);
   return this.observation(o,{status:'accepted'} as Journal);
  });
  // Acceptance ACK is bounded independently of inference completion. Repeated transport
  // acceptance is dedup defense only; native claim code must never blindly replay it.
  this.startCompletion(o);
  await this.hooks.hit('lost-ack',o);
  return observed;
 }
 async lookup(input: OriginalCall): Promise<OwnerObservation> {
  const o=OriginalCallSchema.parse(input); await this.hooks.hit('lookup',o);
  return this.tx(o,async(c,row)=>{await this.count(c,'lookup');return this.observation(o,row);});
 }
 async cancel(input: OriginalCall): Promise<OwnerObservation> {
  const o=OriginalCallSchema.parse(input);
  return this.tx(o,async(c,row)=>{
   await this.count(c,'cancel');
   if(row && row.status!=='sealed-not-accepted') await c.query('UPDATE model_receipts.journal SET cancel_requested=true WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5',[this.ownerId,...binding(o)]);
   return this.observation(o,row); // A request is not termination proof and never a seal.
  });
 }
 async sealUnaccepted(input: OriginalCall,epoch: number): Promise<OwnerObservation> {
  const o=OriginalCallSchema.parse(input); positive.parse(epoch);
  return this.tx(o,async(c,row)=>{
   await this.count(c,'seal');
   if(row && row.status!=='sealed-not-accepted') return this.observation(o,row);
   if(row) {
    demand(epoch>=Number(row.dispatch_epoch),'STALE_FENCE');
    await c.query('UPDATE model_receipts.journal SET dispatch_epoch=$6 WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5',[this.ownerId,...binding(o),epoch]);
    return this.observation(o,{...row,dispatch_epoch:String(epoch)});
   }
   const proofId=randomUUID();
   await c.query("INSERT INTO model_receipts.journal(owner_id,tenant_id,space_id,operation_id,attempt_id,original,dispatch_epoch,status,proof_id) VALUES($1,$2,$3,$4,$5,$6,$7,'sealed-not-accepted',$8)",[this.ownerId,...binding(o),JSON.stringify(o),epoch,proofId]);
   return OwnerObservationSchema.parse({status:'sealed-not-accepted',original:o,ownerId:this.ownerId,proofId,dispatchEpoch:epoch});
  });
 }
 private startCompletion(o: OriginalCall,force=false) {
  if(this.working.has(key(o)))return;
  const work=this.complete(o,force).catch(error=>{this.failures.push(error);}).finally(()=>this.working.delete(key(o)));
  this.working.set(key(o),work);
 }
 async recover(): Promise<void> {
  for(const row of (await this.pool.query("SELECT original FROM model_receipts.journal WHERE owner_id=$1 AND status='accepted'",[this.ownerId])).rows) this.startCompletion(OriginalCallSchema.parse(row.original));
 }
 async finalize(input: OriginalCall): Promise<void> { const o=OriginalCallSchema.parse(input); await this.working.get(key(o)); this.startCompletion(o,true); await this.working.get(key(o)); this.assertHealthy(); }
 assertHealthy(): void { demand(!this.failures.length,'AUTHORITY_UNAVAILABLE'); }
 private async complete(o: OriginalCall,force: boolean): Promise<void> {
  const initial = await this.tx(o,async(_c,row)=>row);
  if(!initial || initial.status!=='accepted' || !initial.request || !initial.schedule)return;
  if(initial.schedule.usage!=='auto' && !force)return;
  const request=EncodedRequestSchema.parse(initial.request), payload=LocalPayloadSchema.parse(JSON.parse(request.payload));
  const schedule=ScheduleSchema.parse(initial.schedule);
  await new Promise(resolve=>setTimeout(resolve,Math.min(schedule.durationMs,request.durationCapMs)));
  await this.hooks.hit('usage',o);
  await this.tx(o,async(c,row)=>{
   if(!row || row.status!=='accepted')return;
   const outcome = row.cancel_requested ? 'cancelled' : schedule.durationMs>request.durationCapMs || schedule.outcome==='known-failure' ? 'known-failure' : 'answer';
   let output = outcome==='answer' ? payload.response==='tool' ? JSON.stringify(payload.toolArguments) : 'local:'+payload.text : '';
   // Truncate only text at Unicode scalar boundaries. Never execute incomplete JSON.
   if(Buffer.byteLength(output)>request.outputCap) {
    if(payload.response==='tool') output='';
    else {let clipped='';for(const char of output){if(Buffer.byteLength(clipped+char)>request.outputCap)break;clipped+=char;}output=clipped;}
   }
   const finalOutcome=outcome==='answer' && payload.response==='tool' && !output ? 'known-failure' : outcome;
   const cost=measuredCost(request.payload,output), chunks:string[]=[];
   // UTF-8-safe fragments; their concatenation is the complete output, no effects.
   const chars=[...output],chunkSize=Math.max(4,Math.ceil(chars.length/256));
   for(let i=0;i<chars.length;i+=chunkSize)chunks.push(chars.slice(i,i+chunkSize).join(''));
   await this.hooks.hit('chunk',o);
   const measuredAt=new Date().toISOString(), receipt=UsageReceiptSchema.parse({schemaVersion:1,original:o,ownerId:this.ownerId,receiptId:randomUUID(),usageKey:'local/'+this.ownerId+'/'+key(o),
    measuredUnits:safeAdd(cost.total,schedule.extraUnits),components:{model:safeAdd(cost.model,schedule.extraUnits),service:cost.service,tool:0,activeCompute:0,reservedCompute:0,coldStart:0,retainedStorage:0,network:0,embedding:0,reranking:0},
    outcome:finalOutcome,outputDigest:finalOutcome==='answer'?'sha256:'+canonicalDigest(output):null,assurance:'deterministic-local-only',measuredAt});
   const privateState=this.profile.capabilities.caching.providerPrivateState && finalOutcome==='answer'?randomUUID():null;
   if(privateState) await c.query('INSERT INTO model_receipts.private_states(owner_id,token,tenant_id,space_id,profile_digest,context_digest,opaque) VALUES($1,$2,$3,$4,$5,$6,$7)',[this.ownerId,privateState,o.tenantId,o.spaceId,request.profileDigest,request.contextDigest,JSON.stringify({priorOutputDigest:receipt.outputDigest})]);
   await c.query("UPDATE model_receipts.journal SET status='settled',receipt=$6,output=$7,chunks=$8,private_state=$9,measured_at=$10 WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5",[this.ownerId,...binding(o),JSON.stringify(receipt),output,JSON.stringify(chunks),privateState,measuredAt]);
   await this.count(c,'usage');await this.count(c,'chunk',chunks.length);
  });
 }
 async result(input: OriginalCall): Promise<{schemaVersion:1;original:OriginalCall;output:string|null;chunks:readonly string[];privateState:string|null}> {
  const o=OriginalCallSchema.parse(input);
  return this.tx(o,async(_c,row)=>({schemaVersion:1,original:o,output:row?.output??null,chunks:row?.chunks??[],privateState:row?.private_state??null}));
 }
 async streamData(input:OriginalCall):Promise<{kind:'text'|'tool-arguments';chunks:readonly string[]}> {
  const o=OriginalCallSchema.parse(input);
  return this.tx(o,async(_c,row)=>{
   demand(row?.status==='settled' && row.request && UsageReceiptSchema.parse(row.receipt).outcome==='answer','MODEL_UNAVAILABLE');
   const payload=LocalPayloadSchema.parse(JSON.parse(row.request.payload));
   return {kind:payload.response==='tool'?'tool-arguments':'text',chunks:row.chunks??[]};
  });
 }
}

const CallSchema=object({schemaVersion:version,original:OriginalCallSchema});
const SealSchema=object({schemaVersion:version,original:OriginalCallSchema,dispatchEpoch:positive});
const ResultSchema=object({schemaVersion:version,original:OriginalCallSchema,output:nullable(body),chunks:list(body),privateState:nullable(uuid)});
export const StreamChunkSchema=object({schemaVersion:version,original:OriginalCallSchema,sequence:positive,kind:enumeration('text','tool-arguments'),fragment:body,final:boolean});
// Avoid a mutable transport-specific DTO; derive all replies from closed decoders.
export function loopbackUrl(input: string): URL {
 const u=new URL(input); demand((input===u.origin || input===u.origin+'/') && u.protocol==='http:' && u.hostname==='127.0.0.1' && /^\d+$/.test(u.port) && Number(u.port)>0 && Number(u.port)<=65535 && u.pathname==='/' && !u.search && !u.hash && !u.username && !u.password,'UNAUTHORIZED');return u;
}
function tokenEqual(a: string,b: string) { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); }
async function readJson(req: IncomingMessage): Promise<unknown> {
 demand(req.headers['content-type']==='application/json');let bytes=0;const chunks:Buffer[]=[];
 for await(const data of req){const chunk=Buffer.from(data);bytes+=chunk.length;demand(bytes<=1_100_000);chunks.push(chunk);}
 try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));} catch{throw new ModelError('INVALID_SCHEMA');}
}
/** No external URLs, redirects, provider SDK, caller destinations or operator endpoints. */
export async function startAdapterServer(owner: DeterministicReceiptOwner, token: string, loseAck: (o: OriginalCall)=>boolean=()=>false) {
 uuid.parse(token);let base='';
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try {
   owner.assertHealthy();
   demand(req.socket.remoteAddress==='127.0.0.1' && req.headers.host===new URL(base).host && (!req.headers.origin || req.headers.origin===base),'UNAUTHORIZED');
   demand(tokenEqual(req.headers.authorization??'','Bearer '+token),'UNAUTHORIZED');
   demand(req.method==='POST' && ['/accept','/lookup','/cancel','/seal','/result','/stream'].includes(req.url??''),'INVALID_SCHEMA');
   const input=await readJson(req);let result:unknown;
   if(req.url==='/accept') {const r=EncodedRequestSchema.parse(input);result=await owner.accept(r);if(loseAck(r.original)){res.destroy();return;}}
   else if(req.url==='/seal'){const r=SealSchema.parse(input);result=await owner.sealUnaccepted(r.original,r.dispatchEpoch);}
   else if(req.url==='/stream'){
    const r=CallSchema.parse(input),stream=await owner.streamData(r.original);
    res.setHeader('content-type','application/x-ndjson');
    for(let i=0;i<stream.chunks.length;i++){
     if(res.destroyed)return;
     res.write(JSON.stringify(StreamChunkSchema.parse({schemaVersion:1,original:r.original,sequence:i+1,kind:stream.kind,fragment:stream.chunks[i],final:i===stream.chunks.length-1}))+'\n');
     await new Promise<void>(resolve=>setImmediate(resolve));
    }
    res.end();return;
   }
   else {const r=CallSchema.parse(input);result=req.url==='/lookup'?await owner.lookup(r.original):req.url==='/cancel'?await owner.cancel(r.original):await owner.result(r.original);}
   res.end(JSON.stringify(result));
  }catch(error){safeReply(res,error);}
 });
 server.requestTimeout=35_000;server.headersTimeout=5_000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();demand(address && typeof address==='object');base='http://127.0.0.1:'+address.port;
 return {url:base,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
function safeReply(res: ServerResponse,error: unknown) { if(res.destroyed)return;if(res.headersSent){res.destroy();return;}res.statusCode=error instanceof ModelError?400:503;res.end(JSON.stringify(safeFailure(error))); }

/** Installed owner channel; observations posted by ordinary callers are never accepted. */
export class LocalAdapterClient implements ModelAdapterPort {
 private readonly url:URL;
 constructor(url:string, private readonly token:string, readonly ownerId:string, private readonly timeoutMs=5_000) {this.url=loopbackUrl(url);uuid.parse(token);uuid.parse(ownerId);positive.parse(timeoutMs);}
 private async post(path:string,input:unknown):Promise<unknown>{
  let response:Response;try{response=await fetch(new URL(path,this.url),{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+this.token},body:JSON.stringify(input),signal:AbortSignal.timeout(this.timeoutMs)});}catch{throw new ModelError('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');}
  const data:unknown=await response.json();
  if(!response.ok){const error=(data as {error?:unknown})?.error;const allowed=['INVALID_SCHEMA','UNSUPPORTED_VERSION','REQUIRED_CAPABILITY_UNSUPPORTED','CHECK_BINDING_MISMATCH','IDEMPOTENCY_CONFLICT','STALE_FENCE','SCOPE_MISMATCH','UNAUTHORIZED'];throw new ModelError(allowed.includes(String(error))?error as ConstructorParameters<typeof ModelError>[0]:'AUTHORITY_UNAVAILABLE');}
  return data;
 }
 private observe(input:unknown,o:OriginalCall):OwnerObservation {const r=OwnerObservationSchema.parse(input);const original=r.status==='settled'?r.receipt.original:r.original;demand(same(original,o),'CHECK_BINDING_MISMATCH');if(r.status==='settled')demand(r.receipt.ownerId===this.ownerId,'CHECK_BINDING_MISMATCH');if(r.status==='sealed-not-accepted')demand(r.ownerId===this.ownerId,'CHECK_BINDING_MISMATCH');return r;}
 async accept(input:EncodedRequest){const r=EncodedRequestSchema.parse(input);return this.observe(await this.post('/accept',r),r.original);}
 async lookup(input:OriginalCall){const o=OriginalCallSchema.parse(input);return this.observe(await this.post('/lookup',{schemaVersion:1,original:o}),o);}
 async cancel(input:OriginalCall){const o=OriginalCallSchema.parse(input);return this.observe(await this.post('/cancel',{schemaVersion:1,original:o}),o);}
 async sealUnaccepted(input:OriginalCall,dispatchEpoch:number){const o=OriginalCallSchema.parse(input);positive.parse(dispatchEpoch);return this.observe(await this.post('/seal',{schemaVersion:1,original:o,dispatchEpoch}),o);}
 async result(input:OriginalCall){const o=OriginalCallSchema.parse(input);const r=ResultSchema.parse(await this.post('/result',{schemaVersion:1,original:o}));demand(same(o,r.original),'CHECK_BINDING_MISMATCH');return r;}
 /** Partial tool arguments are proposals only. Native caller must assemble, validate
  * and reauthorize the complete object before any tool/effect continuation. */
 async *stream(input:OriginalCall):AsyncGenerator<ReturnType<typeof StreamChunkSchema.parse>>{
  const o=OriginalCallSchema.parse(input);let response:Response;
  try{response=await fetch(new URL('/stream',this.url),{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+this.token},body:JSON.stringify({schemaVersion:1,original:o}),signal:AbortSignal.timeout(this.timeoutMs)});}catch{throw new ModelError('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');}
  demand(response.ok && response.headers.get('content-type')==='application/x-ndjson' && response.body,'MODEL_UNAVAILABLE');
  const decoder=new TextDecoder('utf-8',{fatal:true}),reader=response.body.getReader();let raw='',bytes=0,sequence=0,final=false;
  try{
   while(true){const read=await reader.read();if(read.done){raw+=decoder.decode();break;}bytes+=read.value.byteLength;demand(bytes<=1_300_000);raw+=decoder.decode(read.value,{stream:true});
    while(raw.includes('\n')){const end=raw.indexOf('\n'),line=raw.slice(0,end);raw=raw.slice(end+1);const frame=StreamChunkSchema.parse(JSON.parse(line));
     demand(!final && same(frame.original,o) && frame.sequence===++sequence && sequence<=256,'CHECK_BINDING_MISMATCH');final=frame.final;yield frame;
    }
   }
   demand(raw==='' && sequence>0 && final,'CHECK_BINDING_MISMATCH');
  }finally{await reader.cancel();reader.releaseLock();}
 }
}
