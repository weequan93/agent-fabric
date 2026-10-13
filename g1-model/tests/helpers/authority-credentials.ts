import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createNativeFixture } from './native-fixture.js';
import { census,assertOwned,stopOwned,waitUntil,type OwnedProcess } from './process-fixture.js';
import { operator,details,requestFor,result } from './operator-journey.js';
import { LocalConfigSchema,OriginalCallSchema } from '../../src/schema.js';
import { LocalAdapterClient } from '../../src/test-adapter.js';
import { assertCachesDisabled } from '../../src/profile.js';
import { safeFailure } from '../../src/errors.js';

/** A05 uses only newly owned synthetic fixture credentials. It never reads a
 * provider key from the host environment or constructs an external transport. */
export async function authorityCredentials(t:TestContext):Promise<void>{
 const n=await createNativeFixture(),f=n.f,children:OwnedProcess[]=[];
 t.after(async()=>{const cleaned=await Promise.allSettled(children.map(p=>stopOwned(p)));await n.close();for(const r of cleaned)if(r.status==='rejected')throw r.reason;});
 const synthetic='SYNTHETIC_A05_KEY_NEVER_A_PROVIDER_CREDENTIAL',reasoning='SYNTHETIC_A05_PRIVATE_REASONING';
 const secrets=[synthetic,reasoning,f.transportToken,...f.tokens,...Object.keys(f.roles).flatMap(k=>{const dsn=f.fixtureDsn(k as keyof typeof f.roles);return [dsn,new URL(dsn).password];})];
 const clean=(value:unknown)=>{const raw=JSON.stringify(value);for(const secret of secrets)assert.equal(raw.includes(secret),false,'credential/private reasoning disclosure');};
 const localConfig={schemaVersion:1,adapter:'deterministic-local',host:'127.0.0.1',paidCallsAllowed:false,responseCaching:false,gatewayKnowledgeMemory:false,maxAttempts:3,maxAncestry:64,maxContenders:8,postgresImage:'postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333'};
 await t.test('installed-config-client-cache-and-operator-closed-refusals-before-transport',async()=>{
  assert.deepEqual(LocalConfigSchema.parse(localConfig),localConfig);
  for(const vector of [{paidCallsAllowed:true},{adapter:'supplier-cloud'},{host:'example.invalid'},{providerKey:synthetic},{destination:'https://supplier.example.invalid'},{cloud:true},{gatewayKnowledgeMemory:true},{responseCaching:true},{feedbackMemory:{team:f.tenant,key:synthetic}}])assert.throws(()=>LocalConfigSchema.parse({...localConfig,...vector}));
  assertCachesDisabled({schemaVersion:1,exactResponse:false,semanticResponse:false,gatewayKnowledgeMemory:false});
  for(const enabled of ['exactResponse','semanticResponse','gatewayKnowledgeMemory'])assert.throws(()=>assertCachesDisabled({schemaVersion:1,exactResponse:false,semanticResponse:false,gatewayKnowledgeMemory:false,[enabled]:true}));
  assert.throws(()=>assertCachesDisabled({schemaVersion:1,exactResponse:false,semanticResponse:false,gatewayKnowledgeMemory:false,teamFeedbackMemory:true}));
  let constructed=0;const originalFetch=globalThis.fetch;
  globalThis.fetch=(...args)=>{constructed++;return originalFetch(...args);};
  try{
   for(const url of ['https://supplier.example.invalid','http://example.invalid:80','http://localhost:1234','http://[::1]:1234','http://127.0.0.2:1234','http://2130706433:1234','http://127.1:1234','http://127.0.0.1:1234/accept','http://127.0.0.1:1234/?key='+synthetic,'http://user:'+synthetic+'@127.0.0.1:1234','http://127.0.0.1:1234/#cloud','http://127.0.0.1'])assert.throws(()=>new LocalAdapterClient(url,f.transportToken,f.ownerId));
   assert.throws(()=>new LocalAdapterClient(f.adapterUrl(),synthetic,f.ownerId));
   assert.throws(()=>new LocalAdapterClient(f.adapterUrl(),f.transportToken,synthetic));
   let portCalls=0;const port=async()=>{portCalls++;return {};};
   const {operatorCommand}=await import('../../src/operator.js');
   for(const extra of [{providerKey:synthetic},{url:'https://supplier.example.invalid'},{payerId:f.actors[0]},{team:f.tenant},{privateReasoning:reasoning},{sql:'SELECT '+synthetic},{paidCallsAllowed:true}])await assert.rejects(operatorCommand(port,'operatorInspect',{sessionId:randomUUID(),...extra}));
   for(const command of ['enablePaidProvider','enableCloud','enableTeamFeedbackMemory','setProviderKey'])await assert.rejects(operatorCommand(port,command,{key:synthetic}));
   assert.equal(portCalls,0);assert.equal(constructed,0);
  }finally{globalThis.fetch=originalFetch;}
  clean(safeFailure(new Error(synthetic+' '+reasoning+' '+f.fixtureDsn('controller'))));
 });
 await t.test('actual-child-synthetic-env-is-erased-and-closed-startup-config-refuses',async()=>{
  const script=resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/src/test-adapter-process.js');
  const base={dsn:f.fixtureDsn('receipt'),ownerId:f.ownerId,token:f.transportToken,profile:n.profile};
  async function attack(extra:Record<string,unknown>,valid:boolean){
   const marker=randomUUID(),child=spawn(process.execPath,[script,marker],{env:{PATH:process.env['PATH']!,LC_ALL:'C',OPENAI_API_KEY:synthetic,AWS_SECRET_ACCESS_KEY:synthetic,MODEL_PROVIDER_URL:'https://supplier.example.invalid',MODEL_PAID_CALLS_ALLOWED:'true',PRIVATE_REASONING:reasoning,FABRIC_MODEL_ADAPTER:JSON.stringify({...base,...extra,marker})},stdio:['pipe','pipe','pipe','ipc']});
   assert.ok(child.pid);let stdout='',stderr='';let spawnError:Error|undefined;const messages:Record<string,unknown>[]=[];
   child.stdout!.on('data',b=>stdout+=String(b));child.stderr!.on('data',b=>stderr+=String(b));child.on('error',e=>spawnError=e);child.on('message',v=>{if(v&&typeof v==='object')messages.push(v as Record<string,unknown>);});
   const row=census().find(p=>p.pid===child.pid);assert.ok(row);assert.equal(row.ppid,process.pid);assert.ok(row.command.includes(marker));
   const owned:OwnedProcess={child,pid:child.pid,marker,identity:row,ready:{},messages,stderr:()=>stderr};children.push(owned);
   await waitUntil(async()=>{if(spawnError)throw spawnError;return stdout.includes('\n')||child.exitCode!==null||child.signalCode!==null;},'A05 synthetic child configuration');
   if(valid){owned.ready=JSON.parse(stdout.split('\n')[0]!);assertOwned(owned,census().find(p=>p.pid===child.pid));assert.deepEqual(owned.ready['environmentKeys'],['LC_ALL','PATH']);clean(owned.ready);const client=new LocalAdapterClient(String(owned.ready['url']),f.transportToken,f.ownerId);assert.equal((await client.lookup(f.original())).status,'unknown');await stopOwned(owned);}
   else{assert.equal(stdout,'');assert.notEqual(child.exitCode,0);clean(stderr);}
  }
  await attack({},true);
  const before=await f.counters();
  for(const extra of [{paidCallsAllowed:true},{providerKey:synthetic},{url:'https://supplier.example.invalid'},{cloud:true},{gatewayKnowledgeMemory:true},{dsn:'postgresql://synthetic:'+synthetic+'@supplier.example.invalid/model_test'}])await attack(extra,false);
  assert.deepEqual(await f.counters(),before);
 });
 await t.test('actual-loopback-adapter-http-carrier-all-negative-vectors-and-safe-diagnostics',async()=>{
  const task=await n.task(),input=await task.makeInput(),request=input.request,base=new URL(f.adapterUrl()),headers={'content-type':'application/json',authorization:'Bearer '+f.transportToken};
  // Node fetch normalizes forbidden Host overrides. Raw HTTP preserves the
  // exact hostile carrier headers, as in the independent P01 counterpart.
  const raw=async(path:string,method:string,carrierHeaders:Record<string,string>,body:string)=>new Promise<{status:number;body:string}>((done,reject)=>{
   const req=httpRequest(new URL(path,base),{method,headers:carrierHeaders,signal:AbortSignal.timeout(5000)},res=>{let response='';res.on('data',chunk=>{response+=String(chunk);if(Buffer.byteLength(response)>16_384)req.destroy(new Error('A05 diagnostic exceeded bound'));});res.once('error',reject);res.once('end',()=>done({status:res.statusCode!,body:response}));});req.once('error',reject);req.end(body);
  });
  const before=await f.counters(),snapshot=await n.snapshot();
  const vectors:{name:string;path?:string;method?:string;headers?:Record<string,string>;body?:string}[]=[
   {name:'missing bearer',headers:{'content-type':'application/json'}},{name:'invalid bearer',headers:{...headers,authorization:'Bearer '+synthetic}},{name:'expired/foreign synthetic bearer',headers:{...headers,authorization:'Bearer '+randomUUID()}},
   ...['localhost:'+base.port,'127.0.0.2:'+base.port,'[::1]:'+base.port,'supplier.example.invalid'].map(host=>({name:'exact host '+host,headers:{...headers,host}})),
   ...['http://localhost:'+base.port,'http://127.0.0.2:'+base.port,'http://[::1]:'+base.port,'https://supplier.example.invalid'].map(origin=>({name:'exact origin '+origin,headers:{...headers,origin}})),
   {name:'method',method:'PUT'},{name:'content type',headers:{...headers,'content-type':'text/plain'}},{name:'body size',body:JSON.stringify({sentinel:'x'.repeat(1_100_001)})},{name:'invalid json',body:'{"key":'+synthetic},
   {name:'path',path:'/private'},{name:'query',path:'/accept?url=https://supplier.example.invalid'},{name:'traversal',path:'/../private'},
   ...[{actorId:f.actors[0]},{payerId:f.actors[0]},{team:f.tenant},{providerKey:synthetic},{url:'https://supplier.example.invalid'},{sql:'SELECT '+synthetic},{privateReasoning:reasoning},{paidCallsAllowed:true}].map(extra=>({name:'unknown field '+Object.keys(extra)[0],body:JSON.stringify({...request,...extra})})),
   {name:'unknown nested original',body:JSON.stringify({...request,original:{...request.original,providerKey:synthetic}})},{name:'unsupported revision',body:JSON.stringify({...request,schemaVersion:2})}
  ];
  for(const vector of vectors){const response=await raw(vector.path??'/accept',vector.method??'POST',vector.headers??headers,vector.body??JSON.stringify(request));assert.equal(response.status,400,vector.name);const diagnostic:unknown=JSON.parse(response.body);clean(diagnostic);assert.equal((diagnostic as {replayAllowed:boolean}).replayAllowed,false);}
  assert.deepEqual(await f.counters(),before);assert.deepEqual(await n.snapshot(),snapshot);assert.equal(await f.journal(request.original),undefined);
  // Supported authenticated counterpart exercises this exact carrier without
  // granting inference from an ordinary unregistered operation.
  const response=await raw('/lookup','POST',{...headers,origin:base.origin},JSON.stringify({schemaVersion:1,original:f.original()}));assert.equal(response.status,200);assert.equal((JSON.parse(response.body) as {status:string}).status,'unknown');
 });
 await t.test('genuine-native-dispatch-transport-prompt-events-and-operator-exports-redact-credentials',async()=>{
  const a=await n.task(),p=await n.process(),op=operator(n,p),before=await f.counters();
  const transports:{url:string;method:string;body:string}[]=[],originalFetch=globalThis.fetch;
  globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');transports.push({url:url.href,method:String(init?.method??'GET'),body:typeof init?.body==='string'?init.body:''});return originalFetch(input,init);};
  try{
   const cursor=f.adapter().messages.length;await f.arm('lost-ack');
   let returned=false;const work=n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'A05 deterministic answer',choice:null}).then(r=>{returned=true;return r;});
   await waitUntil(async()=>{assert.equal(returned,false);return f.adapter().messages.slice(cursor).some(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack');},'A05 actual receipt acceptance');
   const original=OriginalCallSchema.parse(f.adapter().messages.slice(cursor).find(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack')!['original']);await f.finalize(original);await f.release('lost-ack');assert.equal((await work).status,'completed');
   const request=await requestFor(n,a.binding.runId),captured=await f.journal(request.original);assert.equal(captured.request.payload,request.payload);clean(request.payload);clean(captured.request.payload);assert.ok(transports.some(r=>new URL(r.url).pathname==='/accept'));assert.ok(transports.some(r=>new URL(r.url).pathname==='/lookup'));for(const transport of transports)clean(transport.body);
   const d=await details(n,p,a.sessionId);clean(d);assert.equal(d.accounting.attemptCount,1);assert.ok(d.accounting.measured>0);assert.equal(d.accounting.settled,d.accounting.measured);assert.equal((await f.counters())['acceptance'],(before['acceptance']??0)+1);
   clean((await f.admin.query('SELECT to_jsonb(r) AS record FROM fabric.model_events r WHERE session_id=$1',[a.sessionId])).rows);
   for(const table of ['model_audit','model_outbox'])clean((await f.admin.query('SELECT to_jsonb(r) AS record FROM fabric.'+table+' r WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space])).rows);
   clean(result(await op('inspect',{sessionId:a.sessionId})));clean(p.ready);clean(p.stderr());clean(f.adapter().ready);clean(f.adapter().stderr());
  }finally{globalThis.fetch=originalFetch;}
  console.log(JSON.stringify({measurement:'authority-credential-boundary',case:'A05',externalDestinations:0,credentials:'owned synthetic only',gatewayMemory:'refused',operatorCarrier:'trusted parent IPC; no HTTP operator endpoint',externalQualification:'E01/E02 remain unqualified'}));
 });
}
