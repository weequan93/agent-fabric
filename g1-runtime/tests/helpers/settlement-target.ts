import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {bindingDigest,validateRequest,receiptMatches,downstreamReceiptSchema} from '../../src/owners.js';
const [root,admin]=process.argv.slice(2);if(!root||!admin)throw new Error('OWNED_TARGET_REQUIRED');
const file=join(root,'target.json');writeFileSync(file,JSON.stringify({value:'initial',writes:[],gets:[],denied:0}),{flag:'wx'});
const grants=new Map<string,any>(),streams=new Map<string,number>();
function read(){return JSON.parse(readFileSync(file,'utf8'));}function save(s:any){writeFileSync(file,JSON.stringify(s));}
const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');try{
 const url=new URL(req.url!,'http://127.0.0.1');
 if(req.headers.authorization===admin){
  if(req.method==='GET'&&url.pathname==='/snapshot'){res.end(JSON.stringify({...read(),streams:Object.fromEntries(streams)}));return;}
  if(req.method==='POST'&&url.pathname==='/fence'){let raw='';for await(const b of req)raw+=b;const {operationId}=JSON.parse(raw),g=grants.get(operationId);if(!g)throw new Error('NOT_FOUND');g.revoked=true;res.end('{}');return;}
  if(req.method==='POST'&&url.pathname==='/enroll'){let raw='';for await(const b of req)raw+=b;const g=JSON.parse(raw);validateRequest(g.request);grants.set(g.request.intent.operationId,g);res.end('{}');return;}
 }
 const id=url.pathname.split('/').at(-1),g=grants.get(id??'');
 if(req.method==='GET'&&url.pathname.startsWith('/status/')&&g&&req.headers.authorization===g.readCredential&&url.searchParams.get('binding')===bindingDigest(g.request.intent)){
  const s=read();s.gets.push({method:'GET',operationId:id,bindingDigest:bindingDigest(g.request.intent),at:Date.now()});save(s);const write=s.writes.find((w:any)=>w.receipt.operationId===id);
  if(!write){res.statusCode=404;res.end('{}');return;}
  res.end(JSON.stringify({receipt:downstreamReceiptSchema.parse(write.receipt),terminal:(streams.get(id!)??0)===0,method:'GET',connectorDigest:g.connectorDigest,trustDigest:g.trustDigest}));return;
 }
 if(req.method==='GET'&&url.pathname.startsWith('/stream/')&&g&&req.headers.authorization===g.writeCredential){
  streams.set(id!, (streams.get(id!)??0)+1);res.writeHead(200);res.write('owned-stream\n');const timer=setInterval(()=>res.write('bounded\n'),50);res.once('close',()=>{clearInterval(timer);streams.set(id!,streams.get(id!)!-1);});return;
 }
 if(req.method==='POST'&&url.pathname==='/effect'){
  let raw='';for await(const b of req){raw+=b;if(raw.length>16384)throw new Error('TOO_LARGE');}const r=validateRequest(JSON.parse(raw)),grant=grants.get(r.intent.operationId);
  if(!grant||grant.revoked||req.headers.authorization!==grant.writeCredential||bindingDigest(r)!==bindingDigest(grant.request)||Date.now()>=grant.expiresAt)throw new Error('UNAUTHORIZED');
  const s=read(),old=s.writes.find((w:any)=>w.receipt.operationId===r.intent.operationId);if(old){if(!receiptMatches(r.intent,old.receipt))throw new Error('CONFLICT');res.end(JSON.stringify(old.receipt));return;}
  const receipt={operationId:r.intent.operationId,intentDigest:bindingDigest(r.intent),target:r.intent.target,argsDigest:r.intent.argsDigest,artifactDigest:r.intent.artifactDigest,writeNumber:1};downstreamReceiptSchema.parse(receipt);
  s.value=(r.arguments as any).value;s.writes.push({receipt,bodyDigest:bindingDigest(r),at:Date.now()});save(s);if(grant.lostSendAck){req.socket.destroy();return;}res.end(JSON.stringify(receipt));return;
 }
 throw new Error('UNAUTHORIZED');
 }catch{const s=read();s.denied++;save(s);res.statusCode=403;res.end('{}');}});
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',()=>{server.closeAllConnections();server.close(()=>process.disconnect());});
