import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {generateKeyPairSync,randomUUID,sign,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,renameSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {browserChannels,browserRefusal} from '../../src/browser.js';
import type {SessionAuthority} from '../../../g1-identity/src/contracts.js';
import {api,negativeEvidence} from './owned-capsule.js';
export const bid=(n:number)=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
function message(child:ChildProcess):Promise<any>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser fixture IPC timeout')),8000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',m=>{clearTimeout(timer);resolve(m);});});}
export async function browserFixture(){
 const {ownedDirectory}=await api('build'),own=ownedDirectory('runtime-browser-'),root=own.path,retained=negativeEvidence('browser-refusal');
 const canary='SYNTHETIC_BROWSER_SECRET_'+randomUUID(),key=randomUUID(),output:Buffer[]=[];
 mkdirSync(join(root,'synthetic-personal'));writeFileSync(join(root,'synthetic-personal','cookies.json'),canary);
 symlinkSync(join(root,'synthetic-personal'),join(root,'profile-alias'));
 for(const name of ['sink-events.jsonl','sink-telemetry.log'])writeFileSync(join(root,name),'');writeFileSync(join(root,'sink-target.txt'),'unchanged');
 const children=new Set<ChildProcess>();let births:number[]=[];
 async function start(file:string,args:string[]=[]){
  const child=fork(fileURLToPath(new URL('./'+file+'.js',import.meta.url)),args,{execArgv:[],stdio:['ignore','pipe','pipe','ipc']});children.add(child);births.push(child.pid!);
  child.stdout!.on('data',b=>output.push(Buffer.from(b)));child.stderr!.on('data',b=>output.push(Buffer.from(b)));
  return {child,ready:await message(child)};
 }
 async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;const exit=once(child,'close');child.send('close');await exit;children.delete(child);}
 const sink=await start('browser-sink',[root,key]);assert.equal(sink.ready.pid,sink.child.pid);const sinkUrl='http://127.0.0.1:'+sink.ready.port;
 async function sinkCall(path:string,body?:string){const r=await fetch(sinkUrl+path,{method:body===undefined?'GET':'POST',headers:{authorization:key},...(body===undefined?{}:{body}),signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return await r.text();}
 // Calibrate every actual resource channel, then establish an empty baseline.
 for(const channel of browserChannels)await sinkCall('/'+channel,'calibration');
 const calibration=JSON.parse(await sinkCall('/snapshot'));for(const n of Object.values(calibration.events))assert.equal(n,1);
 await sinkCall('/reset','');
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...keys.publicKey.export({format:'jwk'}),kid:'browser-fixture',alg:'RS256',use:'sig'};
 const jwks=createServer((_req,res)=>res.end(JSON.stringify({keys:[jwk]})));await new Promise<void>(r=>jwks.listen(0,'127.0.0.1',r));
 const issuer='http://127.0.0.1:'+(jwks.address() as {port:number}).port;
 const state={issuer,now:Date.now(),revoked:false,authority:{tenantId:bid(1),spaceId:bid(2),actorId:bid(3),payerId:bid(4),authorityRevision:1,membershipRevision:1,grants:['task:read','task:write'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active',principalKind:'human',sessionExpiresAt:new Date(Date.now()+120_000).toISOString()} as SessionAuthority};
 function persist(){const path=join(root,'authority.json'),tmp=path+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(state));renameSync(tmp,path);}persist();
 function token(extra:Record<string,unknown>={}){const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'at+jwt',kid:'browser-fixture'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:issuer,aud:'browser-refusal',sub:'synthetic-browser-member',sid:'synthetic-browser-session',jti:randomUUID(),token_use:'access',iat:Math.floor(state.now/1000)-1,exp:Math.floor(state.now/1000)+90,...extra})).toString('base64url');return header+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(header+'.'+payload),keys.privateKey).toString('base64url');}
 let service=await start('browser-api',[root]),base='http://127.0.0.1:'+service.ready.port;const route=(tenantId:string,spaceId:string)=>'/runtime/v1/tenants/'+tenantId+'/spaces/'+spaceId+'/';
 const responses:string[]=[];
 async function request(channel:string,body:unknown={},path='browser',action='start',bearer=token(),scope={tenantId:bid(1),spaceId:bid(2)}){
  const client=await start('browser-client');assert.equal(client.ready.pid,client.child.pid);
  const received=message(client.child),exit=once(client.child,'close');client.child.send({url:base+route(scope.tenantId,scope.spaceId)+path+'/'+channel+(action?'/'+action:''),token:bearer,body:typeof body==='string'?body:JSON.stringify(body)});
  const response=await received;const [code,signal]=await exit;children.delete(client.child);assert.equal(code,0);assert.equal(signal,null);assert.ok(!response.error,'Actual browser HTTP response required');responses.push(response.bytes);return {...response,body:JSON.parse(response.bytes)};
 }
 async function snapshot(){return JSON.parse(await sinkCall('/snapshot'));}
 async function verify(){
  const observed=await snapshot();assert.deepEqual(observed.events,Object.fromEntries(browserChannels.map(c=>[c,0])));assert.equal(observed.ledger,'');assert.equal(observed.target,'unchanged');assert.equal(observed.telemetry,'');
  assert.equal(readFileSync(join(root,'synthetic-personal','cookies.json'),'utf8'),canary);
  const bytes=Buffer.concat(output).toString('utf8')+responses.join('');assert.equal(bytes.includes(canary),false,'Synthetic sensitive bytes must never appear in response/error/telemetry');
  return {events:observed.events,unchangedTarget:observed.target,canaryAbsent:true,calibratedChannels:browserChannels.length,births:[...births]};
 }
 return {root,canary,state,persist,token,sinkUrl,request,snapshot,verify,retained,
  payload:(extra:Record<string,unknown>={})=>({credential:canary,cookie:canary,input:canary,sinkUrl,resourceCapability:key,profilePath:join(root,'synthetic-personal'),...extra}),
  async refused(channel:string,body:unknown={},path='browser',action='start',bearer=token()){
   const r=await request(channel,body,path,action,bearer);assert.equal(r.status,403);assert.deepEqual(r.body,browserRefusal);assert.equal(r.cache,'no-store');return r;
  },
  async restart(){const prior=service.child.pid;await stop(service.child);service=await start('browser-api',[root]);base='http://127.0.0.1:'+service.ready.port;assert.notEqual(service.child.pid,prior);return {old:prior,new:service.child.pid};},
  async cleanup(){
   await verify();await stop(service.child);await stop(sink.child);jwks.closeAllConnections();await new Promise<void>((resolve,reject)=>jwks.close(e=>e?reject(e):resolve()));
   assert.equal(children.size,0);const raw=Buffer.concat(output);assert.equal(raw.includes(Buffer.from(canary)),false,'No teardown/error output may contain synthetic sensitive bytes');writeFileSync(join(retained,'process-output.bin'),raw);writeFileSync(join(retained,'observations.json'),JSON.stringify({births,responses:responses.length,events:Object.fromEntries(browserChannels.map(c=>[c,0])),canaryAbsent:true,outputBytes:raw.length,outputSha256:createHash('sha256').update(raw).digest('hex'),remoteQualified:false})+'\n');own.cleanup();
  }
 };
}
export type BrowserFixture=Awaited<ReturnType<typeof browserFixture>>;
