import assert from 'node:assert/strict';
import {fork,spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {bindingDigest,revalidateScope,type VerifiedScope} from '../../src/owners.js';
import {BoundedEgress,egressHttp,type EgressContext,type EgressRecord,type EgressPorts,type EgressRequest,type EgressPolicy} from '../../src/egress.js';
import {exactAdmissionBinding,type AdmissionRecord} from '../../src/admission.js';
import {admissionFixture,id,deferred} from './admission-fixture.js';
function message(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Egress fixture IPC timeout')),6000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',m=>{clearTimeout(timer);resolve(m);});});}
async function close(server:Server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
export async function egressFixture(){
 const f=await admissionFixture(),root=join(f.root,'egress');mkdirSync(root);const admin=randomUUID(),canary='SYNTHETIC_EGRESS_BROAD_'+randomUUID(),children=new Set<ChildProcess>(),launches:any[]=[],apiBirths:number[]=[];
 for(const role of ['allowed','forbidden'])for(const [name,value]of Object.entries({target:'initial',protected:'protected-unchanged',secret:canary}))writeFileSync(join(root,role+'-'+name+'.txt'),value);
 const start=async(role:string,redirect='')=>{const child=fork(fileURLToPath(new URL('./egress-target.js',import.meta.url)),[root,role,admin,redirect],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});children.add(child);const ready=await message(child);assert.equal(ready.pid,child.pid);return {child,base:'http://127.0.0.1:'+ready.port,pid:ready.pid as number};};
 const forbidden=await start('forbidden'),allowed=await start('allowed',forbidden.base);
 const owner=async(path:string,body:unknown={},destination=allowed,method='POST')=>{const r=await fetch(destination.base+path,{method,headers:{authorization:admin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(6000)});assert.equal(r.status,200);return await r.json() as any;};
 for(const target of [allowed,forbidden]){await owner('/calibrate',{},target);assert.equal((await owner('/snapshot',{},target)).events.length,1);await owner('/reset',{},target);}
 const bindings=new Map<string,{request:EgressRequest;record:AdmissionRecord;context:EgressContext}>();let tail=Promise.resolve();
 const state={lostAck:false,lookupUnavailable:false,activationFailure:false,activationHold:null as ReturnType<typeof deferred>|null,beforeCurrent:null as null|(()=>Promise<void>),grant:null as null|{endpoint:string;credential:string},denyContext:false,grantCalls:0};
 const path=(scope:VerifiedScope,id:string)=>join(root,bindingDigest([scope.tenantId,scope.spaceId,scope.actorId,id]).slice(7)+'.json');
 const ports:EgressPorts={now:Date.now,
  current:async(scope,r)=>{await state.beforeCurrent?.();await revalidateScope(scope);const b=bindings.get(r.taskId);assert.ok(b,'NOT_FOUND');await f.admission.preflight(scope,r.taskId);if(state.denyContext)throw new Error('CHECK_BINDING_MISMATCH');if(b.record.preflight.envelope.intent==='act')await f.ports.approvals.require(scope,exactAdmissionBinding(b.record),b.record.preflightDigest);assert.equal(bindingDigest(r),bindingDigest(b.request),'CHECK_BINDING_MISMATCH');return {...b.context,intersection:structuredClone(f.state.intersection)};},
  grant:async(_scope,r,c)=>{state.grantCalls++;const grant=await owner('/grant',{request:r,expiresAt:c.expiresAt,lostAck:state.lostAck});state.grant={endpoint:allowed.base,credential:grant.credential};return state.grant;},
  lookup:async(_scope,r)=>{if(state.lookupUnavailable)return null;const found=await owner('/lookup?operationId='+r.operationId+'&requestDigest='+encodeURIComponent(bindingDigest(r)),{},allowed,'GET');return found?.receiptDigest??null;},
  exclusive:async(_scope,_id,fn)=>{const prior=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await prior;try{return await fn();}finally{release();}},
  get:async(scope,id)=>existsSync(path(scope,id))?JSON.parse(readFileSync(path(scope,id),'utf8')) as EgressRecord:null,
  save:async(scope,id,row)=>{const p=path(scope,id),tmp=p+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(row),{flag:'wx'});renameSync(tmp,p);},
  activate:async(generation,targets)=>{await owner('/revoke',{});await state.activationHold?.promise;if(state.activationFailure)throw new Error('synthetic activation outage');return {generation,targetsDigest:bindingDigest(targets),verifiedAt:Date.now(),coverage:'existing-and-new'};},
  savePolicy:async(policy)=>{const path=join(root,'policy.json'),tmp=path+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(policy),{flag:'wx'});renameSync(tmp,path);}
 };
 await ports.savePolicy({desiredGeneration:1,effectiveGeneration:1,phase:'active',lastVerifiedAt:Date.now(),coverage:'existing-and-new',targets:[id(6)]});
 const loadPolicy=()=>JSON.parse(readFileSync(join(root,'policy.json'),'utf8')) as EgressPolicy;
 let egress=new BoundedEgress(ports,loadPolicy()),server=egressHttp(egress,c=>f.admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:c})),base='',service:ChildProcess|null=null;
 function persist(){const tokenPayload=JSON.parse(Buffer.from(f.token().split('.')[1]!,'base64url').toString()),path=join(root,'api-config.json'),tmp=path+'.'+randomUUID();writeFileSync(tmp,JSON.stringify({issuer:tokenPayload.iss,authority:f.state.authority,now:f.now(),tokenRevoked:f.state.tokenRevoked,intersection:f.state.intersection,sourceDigest:f.state.sourceDigest,sourceAudience:f.state.sourceAudience,sourceAvailable:f.state.sourceAvailable,bindings:Object.fromEntries(bindings),allowed:allowed.base,admin,lostAck:state.lostAck,lookupUnavailable:state.lookupUnavailable}),{flag:'wx'});renameSync(tmp,path);}
 async function listen(){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port;}await listen();
 async function request(raw:unknown,route='dispatch',credential=f.token()){
  persist();
  const r=await fetch(base+'/runtime/v1/egress/'+route,{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify(raw),signal:AbortSignal.timeout(12_000)});return {status:r.status,body:await r.json() as any};
 }
 async function client(raw:unknown,mode:'shell'|'sdk'|'mcp'='sdk',route='dispatch',probe?:{request:EgressRequest;endpoint:string;credential:string},overrideUrl?:string){
  persist();const file=fileURLToPath(new URL('./egress-client.js',import.meta.url)),url=overrideUrl??base+'/runtime/v1/egress/'+route,credential=f.token(),body=JSON.stringify(raw);
  const env:Record<string,string>={AF_NODE:process.execPath,AF_CLIENT:file};for(const key of ['NODE_OPTIONS','RUNTIME_OWNER_NONCE','RUNTIME_BIRTH_LOG'])if(process.env[key])env[key]=process.env[key]!;
  const extra=probe?[JSON.stringify(probe)]:[];
  const executable=mode==='shell'?'/bin/sh':process.execPath,args=mode==='shell'?['-c','exec "$AF_NODE" "$AF_CLIENT" sdk "$@"','owned-egress',url,credential,body,...extra]:[file,mode,url,credential,body,...extra];
  const child=spawn(executable,args,{env,stdio:['pipe','pipe','pipe']});children.add(child);const output:Buffer[]=[],errors:Buffer[]=[];let wire='',result:any=null,stage=0;
  child.stderr.on('data',(b:Buffer)=>errors.push(b));
  child.stdout.on('data',(b:Buffer)=>{output.push(b);if(mode!=='mcp')return;wire+=b.toString();let at:number;while((at=wire.indexOf('\n'))>=0){const m=JSON.parse(wire.slice(0,at));wire=wire.slice(at+1);assert.equal(m.jsonrpc,'2.0');assert.equal(m.error,undefined);if(m.id===1){assert.equal(m.result.protocolVersion,'2024-11-05');stage=1;child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');}else if(m.id===2){assert.equal(stage,1);assert.equal(m.result.tools[0].name,'owned-http');stage=2;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'owned-http',arguments:{}}})+'\n');}else if(m.id===3){assert.equal(stage,2);stage=3;result=JSON.parse(m.result.content[0].text);child.stdin.end();}else assert.fail('Unexpected MCP message');}});
  const exit=once(child,'close');if(mode==='mcp')child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'})+'\n');else child.stdin.end();
  const [code,signal]=await exit;children.delete(child);assert.equal(code,0,Buffer.concat(errors).toString());assert.equal(signal,null);if(mode!=='mcp')result=JSON.parse(Buffer.concat(output).toString());else assert.equal(stage,3);
  assert.equal(result.pid,child.pid);assert.equal(result.uid,process.getuid?.()??null);assert.equal(Buffer.concat(output).includes(Buffer.from(canary)),false);assert.equal(Buffer.concat(errors).includes(Buffer.from(canary)),false);
  const launch={pid:child.pid,mode,uid:result.uid,environmentKeys:result.environmentKeys,actualMcp:mode==='mcp',status:result.status};launches.push(launch);return result;
 }
 async function closeApi(){if(service){const child=service,exit=once(child,'close');child.send('close');await exit;children.delete(child);service=null;}else await close(server);}
 return {f,root,state,ports,canary,owner,launches,apiBirths,allowed,forbidden,get egress(){return egress;},request,client,
  admissionClient:(raw:unknown,mode:'shell'|'sdk'|'mcp')=>client(raw,mode,'dispatch',undefined,f.route()),
  async issue(action:EgressRequest['action']='write',intent:'ask'|'plan'|'act'='act',delta:Partial<EgressRequest>={}){
   const text='bounded egress '+action,draft=await f.request('POST','',{key:randomUUID(),text,intent,...(intent==='act'?{targetId:id(6)}:{})});assert.equal(draft.status,200,JSON.stringify(draft));const scope=await f.scope(),record=(await f.admission.status(scope,draft.body.taskId)).record;
   if(intent==='act')assert.equal((await f.request('POST','/'+record.taskId+'/accept',{preflightDigest:record.preflightDigest})).status,200);
   const r:EgressRequest={schemaVersion:1,operationId:record.preflight.operationId,key:randomUUID(),taskId:record.taskId,toolId:'owned-http',toolVersion:'1.0.0',path:'egress',targetId:id(6),action,method:action==='write'?'POST':'GET',effect:action==='write'?'target-write':'source-read',body:action==='write'?'owned exact write '+randomUUID():null,timeoutMs:2000,outputMaxBytes:65_536,...delta};
   const context:EgressContext={envelope:record.preflight.envelope,runId:record.preflight.runId,operationId:r.operationId,requestDigest:bindingDigest(r),endpoint:allowed.base,targetId:id(6),leaseId:randomUUID(),expiresAt:Date.now()+30_000,intersection:f.state.intersection,assurance:'owned-local-fixture'};
   bindings.set(r.taskId,{request:r,record,context});return r;
  },
  context:(r:EgressRequest)=>bindings.get(r.taskId)!.context,
  clients:(raw:unknown,mode:'shell'|'sdk'|'mcp'='sdk',route='dispatch')=>Promise.all([client(raw,mode,route),client(raw,mode,route)]),
  snapshot:async()=>({allowed:await owner('/snapshot'),forbidden:await owner('/snapshot',{},forbidden)}),
  revoke:(r:EgressRequest)=>owner('/revoke',{operationId:r.operationId}),
  async grant(r:EgressRequest,ms=30_000){return (await owner('/grant',{request:r,expiresAt:Date.now()+ms,lostAck:false})).credential as string;},
  async direct(r:EgressRequest,delta:{path?:string;method?:string;body?:string;operationId?:string;targetId?:string;digest?:string}={},credential=state.grant?.credential,destination=allowed){const reply=await fetch(destination.base+(delta.path??'/owned/'+r.action),{method:delta.method??r.method,headers:{authorization:'Bearer '+(credential??'none'),'x-operation-id':delta.operationId??r.operationId,'x-target-id':delta.targetId??r.targetId,'x-request-digest':delta.digest??bindingDigest(r)},...((delta.method??r.method)==='GET'?{}:{body:delta.body??r.body??''}),redirect:'manual',signal:AbortSignal.timeout(6000)});return {status:reply.status,body:await reply.text()};},
  async restart(freshProcess=false){await closeApi();persist();if(freshProcess){const child=fork(fileURLToPath(new URL('./egress-api.js',import.meta.url)),[root],{execArgv:[],stdio:['ignore','inherit','inherit','ipc']});children.add(child);service=child;const ready=await message(child);assert.equal(ready.pid,child.pid);apiBirths.push(child.pid!);base='http://127.0.0.1:'+ready.port;}else{egress=new BoundedEgress(ports,loadPolicy());server=egressHttp(egress,c=>f.admission.authenticate({tenantId:id(1),spaceId:id(2),sessionCredential:c}));await listen();}},
  async cleanup(){await closeApi();await owner('/release');for(const target of [allowed,forbidden]){const exit=once(target.child,'close');target.child.send('close');await exit;children.delete(target.child);}assert.equal(children.size,0);await f.cleanup();}
 };
}
export type EgressFixture=Awaited<ReturnType<typeof egressFixture>>;
export async function eventually(check:()=>Promise<boolean>,message='Expected actual destination observation'){const start=performance.now();while(performance.now()-start<5000){if(await check())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail(message);}
