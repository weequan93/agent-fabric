/** Independent actual bytes/capability authority; synthetic owned assets only. */
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {bindingDigest} from '../../src/owners.js';
import {ToolRequestSchema,type ToolRequest} from '../../src/tool-registry.js';
const root=process.argv[2]!,admin=process.argv[3]!;
type Grant={request:ToolRequest;expiresAt:number;leaseId:string;instanceId:string;dependencyDigest:string;lostAck:boolean;revoked:boolean};
const grants=new Map<string,Grant>(),events:unknown[]=[],denials:unknown[]=[];
const receiptPath=(id:string)=>join(root,'receipt-'+id+'.json');
const server=createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');try{
  let bytes='';for await(const c of req){bytes+=String(c);if(Buffer.byteLength(bytes)>65_536)throw new Error('bounded');}const raw=bytes?JSON.parse(bytes):null;
  const secret=req.headers.authorization;
  if(secret===admin){
   if(req.url==='/snapshot'){res.end(JSON.stringify({target:readFileSync(join(root,'target.txt'),'utf8'),protected:readFileSync(join(root,'protected.txt'),'utf8'),secret:readFileSync(join(root,'secret.txt'),'utf8'),socket:readFileSync(join(root,'socket.txt'),'utf8'),control:readFileSync(join(root,'control.txt'),'utf8'),db:readFileSync(join(root,'db.txt'),'utf8'),external:readFileSync(join(root,'external.txt'),'utf8'),events,denials}));return;}
   if(req.url==='/grant'){const request=ToolRequestSchema.parse(raw.request),credential=randomUUID();grants.set(credential,{...raw,request,revoked:false});res.end(JSON.stringify({credential}));return;}
   if(req.url==='/lookup'){const request=ToolRequestSchema.parse(raw),path=receiptPath(request.operationId);if(!existsSync(path)){res.end('null');return;}const receipt=JSON.parse(readFileSync(path,'utf8'));if(receipt.requestDigest!==bindingDigest(request))throw new Error('conflict');res.end(JSON.stringify(receipt));return;}
   if(req.url==='/revoke'){for(const g of grants.values())if(g.request.operationId===raw.operationId)g.revoked=true;res.end('{}');return;}
  }
  const grant=typeof secret==='string'?grants.get(secret):undefined;
  if(!grant||grant.revoked||grant.expiresAt<=Date.now()){res.writeHead(403).end('{"code":"UNAUTHORIZED"}');return;}
  const request=grant.request;
  if(raw?.operationId!==request.operationId){res.writeHead(403).end('{"code":"SCOPE_MISMATCH"}');return;}
  if(req.url==='/observe'){
   if(raw.path!==request.path||typeof raw.pid!=='number'||typeof raw.cwd!=='string')throw new Error('context');
   events.push({kind:'worker',...raw,leaseId:grant.leaseId,instanceId:grant.instanceId,dependencyDigest:grant.dependencyDigest});res.end('{}');return;
  }
  if(req.url==='/probe-result'){events.push({kind:'probe',operationId:request.operationId,probe:raw.probe,status:raw.status});res.end('{}');return;}
  if(req.url!=='/effect'){
   denials.push({path:req.url,operationId:request.operationId,targetId:raw.targetId});res.writeHead(403).end('{"code":"RESOURCE_FORBIDDEN"}');return;
  }
  const r=ToolRequestSchema.parse(raw);if(bindingDigest(r)!==bindingDigest(request)||r.targetId!=='00000000-0000-4000-8000-000000000006'){denials.push({path:'/effect',operationId:request.operationId,targetId:r.targetId});res.writeHead(403).end('{"code":"RESOURCE_FORBIDDEN"}');return;}
  const path=receiptPath(r.operationId);if(existsSync(path)){res.end(readFileSync(path));return;}
  writeFileSync(join(root,'target.txt'),r.args.payload);const receipt={operationId:r.operationId,requestDigest:bindingDigest(r),receiptDigest:bindingDigest({operationId:r.operationId,targetId:r.targetId,payload:r.args.payload})};writeFileSync(path,JSON.stringify(receipt),{flag:'wx'});events.push({kind:'effect',operationId:r.operationId,path:r.path,requestDigest:bindingDigest(r)});
  if(grant.lostAck){req.socket.destroy();return;}res.end(JSON.stringify(receipt));
 }catch{if(!res.headersSent)res.writeHead(403);res.end('{"code":"UNAUTHORIZED"}');}
});
server.listen(0,'127.0.0.1',()=>process.send?.({port:(server.address() as {port:number}).port,pid:process.pid}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
