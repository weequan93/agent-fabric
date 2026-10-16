import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {bindingDigest,revalidateScope,type VerifiedScope} from '../../src/owners.js';
import {ToolDispatch,toolHttp,type ToolContext,type ToolRecord,type ToolDispatchPorts} from '../../src/dispatch.js';
import {toolDescriptors,type ToolRequest,type ToolDescriptor} from '../../src/tool-registry.js';
import {exactAdmissionBinding,type AdmissionRecord} from '../../src/admission.js';
import {admissionFixture,id} from './admission-fixture.js';
function message(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Tool fixture readiness timeout')),6000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',m=>{clearTimeout(timer);resolve(m);});});}
async function close(server:Server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
export async function toolFixture(){
 const f=await admissionFixture(),root=join(f.root,'tools');mkdirSync(root);const admin=randomUUID(),canary='SYNTHETIC-ONLY-'+randomUUID();
 for(const [name,value]of Object.entries({target:'initial',protected:'protected-policy',secret:canary,socket:'synthetic-socket',control:'control-unchanged',db:'no-worker-db',external:'external-unchanged'}))writeFileSync(join(root,name+'.txt'),value);
 const target=fork(fileURLToPath(new URL('./tool-target.js',import.meta.url)),[root,admin],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
 const ready=await message(target),endpoint='http://127.0.0.1:'+ready.port;
 const owner=async(path:string,body:unknown)=>{const r=await fetch(endpoint+path,{method:'POST',headers:{authorization:admin,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});assert.equal(r.status,200);return await r.json() as any;};
 const bindings=new Map<string,{record:AdmissionRecord;request:ToolRequest;context:ToolContext}>();let tail=Promise.resolve();
 const state={lookupUnavailable:false,lostAck:false,requireIsolation:false,denyContext:false,grant:null as null|{endpoint:string;credential:string},beforeCurrent:null as null|(()=>Promise<void>)};
 const path=(scope:VerifiedScope,operationId:string)=>join(root,bindingDigest([scope.tenantId,scope.spaceId,scope.actorId,operationId]).slice(7)+'.json');
 const ports:ToolDispatchPorts={now:Date.now,
  current:async(scope,request,descriptor)=>{
   await state.beforeCurrent?.();await revalidateScope(scope);const b=bindings.get(request.taskId);assert.ok(b,'NOT_FOUND');
   await f.admission.preflight(scope,request.taskId);if(state.denyContext)throw new Error('CHECK_BINDING_MISMATCH');if(state.requireIsolation)throw new Error('REQUIRED_CAPABILITY_UNSUPPORTED');
   if(b.record.preflight.envelope.intent==='act')await f.ports.approvals.require(scope,exactAdmissionBinding(b.record),b.record.preflightDigest);
   assert.equal(bindingDigest(request),bindingDigest(b.request),'CHECK_BINDING_MISMATCH');assert.equal(bindingDigest(descriptor),b.context.descriptorDigest,'CHECK_BINDING_MISMATCH');
   return {...b.context,intersection:structuredClone(f.state.intersection)};
  },
  grant:async(_scope,request,context)=>{const grant=await owner('/grant',{request,expiresAt:context.expiresAt,leaseId:context.leaseId,instanceId:context.instanceId,dependencyDigest:context.dependencyDigest,lostAck:state.lostAck});state.grant={endpoint,credential:grant.credential};return state.grant;},
  lookup:async(_scope,request)=>{if(state.lookupUnavailable)return null;const result=await owner('/lookup',request);return result?.receiptDigest??null;},
  exclusive:async(_scope,_id,fn)=>{const prior=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await prior;try{return await fn();}finally{release();}},
  get:async(scope,op)=>existsSync(path(scope,op))?JSON.parse(readFileSync(path(scope,op),'utf8')) as ToolRecord:null,
  save:async(scope,op,r)=>{const p=path(scope,op),tmp=p+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(r),{flag:'wx'});renameSync(tmp,p);}
 };
 let dispatch=new ToolDispatch(ports),server=toolHttp(dispatch,credential=>f.admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:credential})),base='';
 async function listen(){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port;}
 await listen();
 return {f,root,state,canary,ports,get dispatch(){return dispatch;},
  async issue(path:ToolRequest['path']='sdk',delta:Partial<ToolRequest>={},args:Partial<ToolRequest['args']>={},intent:'ask'|'act'='act'){
   const payload=args.payload??'bounded '+path+' fixture';const draft=await f.request('POST','',{key:randomUUID(),text:payload,intent,...(intent==='act'?{targetId:id(6)}:{})});assert.equal(draft.status,200,JSON.stringify(draft));const scope=await f.scope(),record=(await f.admission.status(scope,draft.body.taskId)).record;
   if(intent==='act')assert.equal((await f.request('POST','/'+record.taskId+'/accept',{preflightDigest:record.preflightDigest})).status,200);
   const descriptor=toolDescriptors.find(d=>d.path===path)!;
   const request:ToolRequest={schemaVersion:1,operationId:record.preflight.operationId,key:randomUUID(),taskId:record.taskId,toolId:descriptor.toolId,toolVersion:descriptor.toolVersion,path,effect:'target-write',targetId:id(6),args:{payload,outputBytes:8,durationMs:0,probe:'none',...args},timeoutMs:1000,outputMaxBytes:65_536,...delta};
   const scratch=join(root,'scratch-'+request.operationId);mkdirSync(scratch);writeFileSync(join(scratch,'dependency-lock.txt'),'owned-fixed-worker-v1');
   const context:ToolContext={envelope:record.preflight.envelope,runId:record.preflight.runId,operationId:request.operationId,requestDigest:bindingDigest(request),descriptorDigest:bindingDigest(descriptor),targetId:id(6),expiresAt:Date.now()+30_000,leaseId:randomUUID(),instanceId:randomUUID(),dependencyDigest:bindingDigest('owned-fixed-worker-v1'),intersection:f.state.intersection,scratch,isolation:'owned-local-fixture'};
   bindings.set(request.taskId,{record,request,context});return request;
  },
  async request(request:unknown,route='dispatch',credential=f.token()){const r=await fetch(base+'/runtime/v1/tools/'+route,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(15_000)});return {status:r.status,body:await r.json() as any};},
  async clients(request:unknown,route='dispatch'){return await Promise.all([0,1].map(async()=>{const child=fork(fileURLToPath(new URL('./tool-client.js',import.meta.url)),[base+'/runtime/v1/tools/'+route,f.token(),JSON.stringify(request)],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});const exit=once(child,'exit'),result=await message(child);await exit;return result;}));},
  async shortGrant(request:ToolRequest,durationMs:number){const c=bindings.get(request.taskId)!.context;const result=await owner('/grant',{request,expiresAt:Date.now()+durationMs,leaseId:c.leaseId,instanceId:c.instanceId,dependencyDigest:c.dependencyDigest,lostAck:false});return result.credential as string;},
  snapshot:()=>owner('/snapshot',{}),revoke:(request:ToolRequest)=>owner('/revoke',{operationId:request.operationId}),
  async direct(path:string,body:unknown,credential=state.grant?.credential){const r=await fetch(endpoint+path,{method:'POST',headers:{authorization:credential??'none','content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});return {status:r.status,body:await r.json() as any};},
  async restart(){await close(server);dispatch=new ToolDispatch(ports);server=toolHttp(dispatch,c=>f.admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:c}));await listen();},
  context:(request:ToolRequest)=>bindings.get(request.taskId)!.context,
  async cleanup(){await close(server);const exit=once(target,'exit');target.send('close');await exit;await f.cleanup();}
 };
}
export type ToolFixture=Awaited<ReturnType<typeof toolFixture>>;
