/** Independently running owned destination; never inspects personal/system data. */
import {createServer,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {bindingDigest} from '../../src/owners.js';
import {EgressRequestSchema,type EgressRequest} from '../../src/egress.js';
const [root,role,admin,redirect]=process.argv.slice(2) as [string,string,string,string];
type Grant={request:EgressRequest;expiresAt:number;revoked:boolean;lostAck:boolean};
const grants=new Map<string,Grant>(),events:any[]=[],streams=new Set<ServerResponse>();let held=false,waiters:Array<()=>void>=[],grantsIssued=0;
const receipt=(id:string)=>join(root,role+'-receipt-'+id+'.json');
const server=createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');
 try{
  let body='';for await(const c of req){body+=String(c);if(Buffer.byteLength(body)>65_536)throw new Error('bounded');}
  if(req.headers.authorization===admin){
   const raw=body?JSON.parse(body):null;
   if(req.url==='/snapshot'){res.end(JSON.stringify({pid:process.pid,role,events,grantsIssued,activeStreams:streams.size,target:readFileSync(join(root,role+'-target.txt'),'utf8'),protected:readFileSync(join(root,role+'-protected.txt'),'utf8'),secretDigest:bindingDigest(readFileSync(join(root,role+'-secret.txt'),'utf8'))}));return;}
   if(req.url==='/reset'){events.length=0;res.end('{}');return;}
   if(req.url==='/calibrate'){events.push({kind:'calibration'});res.end('{}');return;}
   if(req.url==='/grant'&&role==='allowed'){const request=EgressRequestSchema.parse(raw.request),credential=randomUUID();grants.set(credential,{request,expiresAt:raw.expiresAt,revoked:false,lostAck:raw.lostAck});grantsIssued++;res.end(JSON.stringify({credential}));return;}
   if(req.url?.startsWith('/lookup?')&&req.method==='GET'&&role==='allowed'){const query=new URL(req.url,'http://owned').searchParams,operationId=query.get('operationId')!,requestDigest=query.get('requestDigest');if(!/^[a-f0-9-]{36}$/.test(operationId))throw new Error('invalid');events.push({kind:'lookup',operationId,requestDigest,method:req.method});const path=receipt(operationId);if(!existsSync(path)){res.end('null');return;}const found=JSON.parse(readFileSync(path,'utf8'));if(found.requestDigest!==requestDigest)throw new Error('conflict');res.end(JSON.stringify(found));return;}
   if(req.url==='/revoke'){for(const grant of grants.values())if(!raw?.operationId||grant.request.operationId===raw.operationId)grant.revoked=true;for(const stream of streams)stream.end();res.end('{}');return;}
   if(req.url==='/hold'){held=true;res.end('{}');return;}
   if(req.url==='/release'){held=false;for(const resolve of waiters)resolve();waiters=[];res.end('{}');return;}
  }
  const op=req.headers['x-operation-id'],targetId=req.headers['x-target-id'];
  events.push({kind:'received',path:req.url,method:req.method,operationId:op??null,targetId:targetId??null,bodyDigest:bindingDigest(body)});
  const authorization=req.headers.authorization,grant=typeof authorization==='string'?grants.get(authorization.slice(7)):undefined;
  const deny=()=>{events.push({kind:'refused',path:req.url,operationId:op??null});res.writeHead(403).end('{"code":"RESOURCE_FORBIDDEN"}');};
  if(role!=='allowed'||!grant||!authorization?.startsWith('Bearer ')){deny();return;}
  if(held){events.push({kind:'waiting',operationId:op});await new Promise<void>(resolve=>waiters.push(resolve));}
  const r=grant.request;
  if(grant.revoked||grant.expiresAt<=Date.now()||op!==r.operationId||targetId!==r.targetId||req.headers['x-request-digest']!==bindingDigest(r)||req.url!=='/owned/'+r.action||req.method!==r.method||body!==(r.body??'')){deny();return;}
  if(r.action==='redirect'){events.push({kind:'redirect',operationId:op});res.writeHead(307,{location:redirect+'/metadata?credential=never-forward'}).end();return;}
  if(r.action==='stream'){
   res.setHeader('content-type','text/plain');streams.add(res);events.push({kind:'stream-open',operationId:op});res.write('owned stream\n');
   const timer=setInterval(()=>{if(grant.revoked||grant.expiresAt<=Date.now()){res.end();return;}res.write('tick\n');},25);
   res.once('close',()=>{clearInterval(timer);streams.delete(res);events.push({kind:'stream-closed',operationId:op});});return;
  }
  if(r.action==='read'){events.push({kind:'read',operationId:op});res.end('owned source');return;}
  const path=receipt(r.operationId);
  if(existsSync(path)){res.end(readFileSync(path));return;}
  writeFileSync(join(root,role+'-target.txt'),r.body!);
  const found={operationId:r.operationId,requestDigest:bindingDigest(r),receiptDigest:bindingDigest({operationId:r.operationId,targetId:r.targetId,body:r.body})};
  writeFileSync(path,JSON.stringify(found),{flag:'wx'});events.push({kind:'effect',operationId:r.operationId,requestDigest:bindingDigest(r)});
  if(grant.lostAck){req.socket.destroy();return;}res.end(JSON.stringify(found));
 }catch{if(!res.headersSent)res.writeHead(403);res.end('{"code":"RESOURCE_FORBIDDEN"}');}
});
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',()=>{for(const resolve of waiters)resolve();for(const stream of streams)stream.end();server.closeAllConnections();server.close(()=>process.disconnect());});
