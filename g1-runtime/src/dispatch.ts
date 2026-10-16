/** Bounded fixed-worker fixture adapter. Production F03/PG ownership is separate. */
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer,type IncomingMessage} from 'node:http';
import {createHash} from 'node:crypto';
import {assertVerifiedScope,revalidateScope,bindingDigest,parseTaskEnvelope,type VerifiedScope,type TaskEnvelope} from './owners.js';
import {requireIntent,immutable,type AuthorityIntersection} from './intent.js';
import type {DomainEvent} from '../../engine/contracts/src/events.js';
import {uuid,digest as digestSchema} from './schemas.js';
import {nativeSession} from './native-runtime.js';
import {resolveTool,type ToolRequest,type ToolDescriptor} from './tool-registry.js';
export interface ToolContext {
 readonly envelope:TaskEnvelope;readonly runId:string;readonly operationId:string;
 readonly requestDigest:string;readonly descriptorDigest:string;readonly targetId:string;
 readonly expiresAt:number;readonly leaseId:string;readonly instanceId:string;readonly dependencyDigest:string;
 readonly intersection:AuthorityIntersection;readonly scratch:string;readonly isolation:'owned-local-fixture';
}
export interface WorkerGrant {readonly endpoint:string;readonly credential:string}
export interface WorkerReport {
 readonly pid:number;readonly exitCode:number|null;readonly signal:string|null;readonly timedOut:boolean;
 readonly outputBytes:number;readonly retainedBytes:number;readonly truncated:boolean;readonly outputDigest:string;
 readonly stdout:string;readonly stderrBytes:number;readonly cwd:string;readonly executable:string;readonly argv:readonly string[];
 readonly environmentKeys:readonly string[];readonly leaseId:string;readonly instanceId:string;readonly dependencyDigest:string;
 readonly uid:number|null;readonly isolation:'owned-local-fixture';readonly elapsedMs:number;readonly artifactRef:null;
}
export interface ToolRecord {readonly key:string;readonly digest:string;readonly request:ToolRequest;readonly state:'pending'|'unknown'|'confirmed';readonly report:WorkerReport|null;readonly events:readonly DomainEvent[];readonly receiptDigest:string|null;readonly replayAllowed:false}
export interface ToolDispatchPorts {
 now():number;
 /** Exact immutable operation/envelope/approval/current-resource binding, privately issued by composition. */
 current(scope:VerifiedScope,request:ToolRequest,descriptor:ToolDescriptor):Promise<ToolContext>;
 grant(scope:VerifiedScope,request:ToolRequest,context:ToolContext):Promise<WorkerGrant>;
 lookup(scope:VerifiedScope,request:ToolRequest,context:ToolContext):Promise<string|null>;
 exclusive<T>(scope:VerifiedScope,operationId:string,fn:()=>Promise<T>):Promise<T>;
 get(scope:VerifiedScope,operationId:string):Promise<ToolRecord|null>;
 save(scope:VerifiedScope,operationId:string,record:ToolRecord):Promise<void>;
}
const sha=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');
function check(value:unknown,code:string):asserts value{if(!value)throw new Error(code);}
/** No executable, module, endpoint, environment or callback comes from tool arguments. */
async function worker(request:ToolRequest,context:ToolContext,grant:WorkerGrant,leaseRemainingMs:number):Promise<WorkerReport>{
 const executable=request.path==='shell'?'/bin/sh':process.execPath;
 const workerFile=fileURLToPath(new URL('./workers/'+(request.path==='mcp'?'stdio-mcp':'owned-worker')+'.js',import.meta.url));
 const argv=request.path==='shell'?['-c','exec "$AF_NODE" "$AF_WORKER" shell']:request.path==='mcp'?[workerFile]:[workerFile,request.path];
 const env:Record<string,string>={AF_NODE:process.execPath,AF_WORKER:workerFile};
 // Independent supervisor's cooperative birth ACK is retained; no inherited app/DB/proxy credentials.
 for(const key of ['NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG'])if(process.env[key])env[key]=process.env[key]!;
 const started=performance.now(),leaseDeadline=started+Math.max(0,Math.min(30_000,leaseRemainingMs)),child=spawn(executable,argv,{cwd:context.scratch,env,stdio:['pipe','pipe','pipe']});
 const chunks:Buffer[]=[],errors:Buffer[]=[];let outputBytes=0,stderrBytes=0,timedOut=false,overflow=false,ready=false,timer:ReturnType<typeof setTimeout>|undefined;
 const terminate=()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},250).unref();};
 const leaseTimer=setTimeout(terminate,Math.max(0,leaseDeadline-performance.now()));
 let wire='';const result=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{
  child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));
  const onReady=()=>{
   if(ready)return;ready=true;
   if(performance.now()>=leaseDeadline){terminate();return;}
   timer=setTimeout(terminate,Math.min(request.timeoutMs,Math.max(0,leaseDeadline-performance.now())));
   const input={request,grant};
   if(request.path==='mcp'){
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'agent-fabric',version:'1.0.0'}}})+'\n');
   }else child.stdin.end(JSON.stringify(input));
  };
  // Metadata readiness avoids charging the supervisor ACK wait to the command deadline.
  const startup=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},6000);
  child.once('close',()=>clearTimeout(startup));
  child.stderr.on('data',(raw:Buffer)=>{stderrBytes+=raw.length;if(stderrBytes<=4096)errors.push(raw);else{overflow=true;child.kill('SIGTERM');}if(Buffer.concat(errors).toString().includes('AF_READY')){clearTimeout(startup);onReady();}});
  child.stdout.on('data',(raw:Buffer)=>{
   if(request.path!=='mcp'){
    outputBytes+=raw.length;const retained=chunks.reduce((n,b)=>n+b.length,0);if(retained<request.outputMaxBytes)chunks.push(raw.subarray(0,request.outputMaxBytes-retained));return;
   }
   wire+=raw.toString('utf8');if(Buffer.byteLength(wire)>140_000){overflow=true;child.kill('SIGTERM');return;}
   let newline:number;
   while((newline=wire.indexOf('\n'))>=0){const line=wire.slice(0,newline);wire=wire.slice(newline+1);try{
    const message=JSON.parse(line);check(message.jsonrpc==='2.0'&&!message.error,'MCP_PROTOCOL');
    if(message.id===1){check(message.result.protocolVersion==='2024-11-05','MCP_PROTOCOL');child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');}
    else if(message.id===2){check(message.result.tools.length===1&&message.result.tools[0].name==='owned-target','MCP_PROTOCOL');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'owned-target',arguments:inputFor(request,grant)}})+'\n');}
    else if(message.id===3){const b=Buffer.from(message.result.content[0].text);outputBytes=b.length;chunks.push(b.subarray(0,request.outputMaxBytes));child.stdin.end();}
    else throw new Error('MCP_PROTOCOL');
   }catch{overflow=true;child.kill('SIGTERM');}}
  });
 });
 clearTimeout(leaseTimer);if(timer)clearTimeout(timer);const bytes=Buffer.concat(chunks);
 return immutable({pid:child.pid??-1,exitCode:result.code,signal:result.signal,timedOut,outputBytes,retainedBytes:bytes.length,truncated:outputBytes>request.outputMaxBytes||overflow,outputDigest:sha(bytes),stdout:bytes.toString('utf8'),stderrBytes,cwd:context.scratch,executable,argv,environmentKeys:Object.keys(env).sort(),leaseId:context.leaseId,instanceId:context.instanceId,dependencyDigest:context.dependencyDigest,uid:process.getuid?.()??null,isolation:'owned-local-fixture',elapsedMs:Math.ceil(performance.now()-started),artifactRef:null});
}
function inputFor(request:ToolRequest,grant:WorkerGrant){return {request,grant};}
export class ToolDispatch {
 constructor(private readonly ports:ToolDispatchPorts){}
 private async current(scope:VerifiedScope,r:ToolRequest,d:ToolDescriptor):Promise<ToolContext>{
  assertVerifiedScope(scope);await revalidateScope(scope);const c=await this.ports.current(scope,r,d),envelope=parseTaskEnvelope(c.envelope);
  requireIntent(scope,envelope,'bounded-write',c.intersection);
  check(c.isolation==='owned-local-fixture'&&c.operationId===r.operationId&&envelope.taskId===r.taskId&&c.targetId===r.targetId&&c.requestDigest===bindingDigest(r)&&c.descriptorDigest===bindingDigest(d),'CHECK_BINDING_MISMATCH');
  const now=this.ports.now();check(Number.isSafeInteger(c.expiresAt)&&c.expiresAt>now&&c.expiresAt<=now+30_000,'LEASE_EXPIRED');
  uuid.parse(c.leaseId);uuid.parse(c.instanceId);digestSchema.parse(c.dependencyDigest);
  check(envelope.targets.some(t=>t.resourceId===r.targetId),'CHECK_BINDING_MISMATCH');await revalidateScope(scope);return c;
 }
 async dispatch(scope:VerifiedScope,raw:unknown):Promise<ToolRecord>{
  const {request:r,descriptor:d}=resolveTool(raw);assertVerifiedScope(scope);await revalidateScope(scope);
  return this.ports.exclusive(scope,r.operationId,async()=>{
   const c=await this.current(scope,r,d),digest=bindingDigest(r),prior=await this.ports.get(scope,r.operationId);
   if(prior){check(prior.key===r.key&&prior.digest===digest,'IDEMPOTENCY_CONFLICT');check(prior.state==='confirmed','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');return immutable(prior);}
   const grant=await this.ports.grant(scope,r,c);await this.current(scope,r,d);
   const loop=nativeSession(c.envelope,c.runId,{clock:{now:this.ports.now},authorize:()=>assertVerifiedScope(scope),model:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},execute:async()=>{report=await worker(r,c,grant,c.expiresAt-this.ports.now());return report.exitCode===0&&!report.timedOut?'committed':'unknown';}});
   let report:WorkerReport|null=null;
   const persist=async(state:ToolRecord['state'],receiptDigest:string|null)=>{const record=immutable({key:r.key,digest,request:r,state,report,events:loop.events(),receiptDigest,replayAllowed:false as const});await this.ports.save(scope,r.operationId,record);return record;};
   await persist('pending',null);
   try{await this.current(scope,r,d);await loop.dispatchEffect(r.operationId);await this.current(scope,r,d);const receipt=await this.ports.lookup(scope,r,c);await this.current(scope,r,d);return await persist(receipt?'confirmed':'unknown',receipt);}
   catch{await persist('unknown',null);throw new Error('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');}
  });
 }
 async lookup(scope:VerifiedScope,raw:unknown):Promise<ToolRecord>{
  const {request:r,descriptor:d}=resolveTool(raw);return this.ports.exclusive(scope,r.operationId,async()=>{
   const c=await this.current(scope,r,d),prior=await this.ports.get(scope,r.operationId);check(prior,'NOT_FOUND');check(prior.key===r.key&&prior.digest===bindingDigest(r),'IDEMPOTENCY_CONFLICT');
   if(prior.state==='confirmed')return immutable(prior);const receipt=await this.ports.lookup(scope,r,c);await this.current(scope,r,d);
   if(!receipt)return immutable(prior);
   const loop=nativeSession(c.envelope,c.runId,{clock:{now:this.ports.now},authorize:()=>assertVerifiedScope(scope),execute:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');},model:async()=>{throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');}},prior.events);
   if(loop.inspect().pendingOperations.includes(r.operationId))loop.reconcile(r.operationId,'committed');
   const next=immutable({...prior,state:'confirmed' as const,receiptDigest:receipt,events:loop.events()});await this.ports.save(scope,r.operationId,next);return next;
  });
 }
}
async function body(req:IncomingMessage):Promise<unknown>{const chunks:Buffer[]=[];let size=0;for await(const c of req){const b=Buffer.from(c);size+=b.length;check(size<=65_536,'INVALID_SCHEMA');chunks.push(b);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
export function toolHttp(dispatch:ToolDispatch,authenticate:(credential:string)=>Promise<VerifiedScope>){return createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');try{
  check(typeof req.headers.authorization==='string'&&req.headers.authorization.startsWith('Bearer '),'UNAUTHORIZED');const scope=await authenticate(req.headers.authorization.slice(7));
  check(req.method==='POST'&&(req.url==='/runtime/v1/tools/dispatch'||req.url==='/runtime/v1/tools/lookup'),'REQUIRED_CAPABILITY_UNSUPPORTED');const raw=await body(req),record=await (req.url.endsWith('/lookup')?dispatch.lookup(scope,raw):dispatch.dispatch(scope,raw));
  res.end(JSON.stringify(record));
 }catch(e){const allowed=['UNAUTHORIZED','INTENT_EXCEEDED','IDEMPOTENCY_CONFLICT','UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','CHECK_BINDING_MISMATCH','LEASE_EXPIRED','REQUIRED_CAPABILITY_UNSUPPORTED','NOT_FOUND'];const code=e instanceof Error&&allowed.includes(e.message)?e.message:'UNAUTHORIZED';res.statusCode=code==='UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'?503:403;res.end(JSON.stringify({code,replayAllowed:false,alternative:'Use the fixed owned target tool within an accepted Act, or perform the action yourself.'}));}
 });}
