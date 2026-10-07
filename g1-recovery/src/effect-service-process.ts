/** Disposable loopback downstream fixture. Independent process and fsynced journal;
 * no PostgreSQL/controller credentials, no model, no remote targets. */
import {createServer} from 'node:http';
import {open,readFile} from 'node:fs/promises';
import {bindingDigest} from './contracts.js';
import {downstreamReceiptSchema,validateRequest,type DownstreamReceipt} from './effect-protocol.js';
if(process.env.RECOVERY_DATABASE_URL||process.env.FABRIC_NATIVE_WORKER)throw new Error('Independent downstream must have no controller/database configuration');
const raw=process.env.FABRIC_EFFECT_SERVICE;if(!raw)throw new Error('Owned service required');
const config=JSON.parse(raw) as {owner:string;journal:string;port:number};
const receipts=new Map<string,DownstreamReceipt>();let writes=0,posts=0,lookups=0;
try {for(const line of (await readFile(config.journal,'utf8')).trim().split('\n').filter(Boolean)){
 const r=downstreamReceiptSchema.parse(JSON.parse(line));if(receipts.has(r.operationId)||r.writeNumber!==writes+1)throw new Error('Corrupt downstream journal');receipts.set(r.operationId,r);writes++;
}}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}
let mode={ack:'normal',lookup:'normal',dedup:true};let serial=Promise.resolve();
const server=createServer((req,res)=>{
 const handle=async()=>{
  const url=new URL(req.url??'/', 'http://127.0.0.1');
  const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&url.pathname==='/capabilities')return send(200,{dedup:mode.dedup,lookup:mode.lookup!=='unsupported'});
  if(req.method==='GET'&&url.pathname==='/metrics')return send(200,{owner:config.owner,pid:process.pid,writes,posts,lookups,receipts:[...receipts.values()]});
  if(req.method==='GET'&&url.pathname.startsWith('/effects/')){
   lookups++;if(mode.lookup==='outage')return send(503,{status:'outage'});
   if(mode.lookup==='unsupported')return send(501,{status:'unsupported'});
   if(mode.lookup==='ambiguous')return send(200,{status:'ambiguous'});
   if(mode.lookup==='delayed')await new Promise(res=>setTimeout(res,500));
   let r=receipts.get(url.pathname.slice('/effects/'.length));
   if(r&&mode.lookup==='mismatch-target')r={...r,target:'synthetic://wrong'};
   if(r&&mode.lookup==='mismatch-digest')r={...r,artifactDigest:bindingDigest('wrong')};
   return send(200,r?{status:'confirmed',receipt:r}:{status:'absent'});
  }
  let body='';for await(const chunk of req){body+=String(chunk);if(body.length>65536)throw new Error('Bounded request required');}
  if(req.method==='POST'&&url.pathname==='/fixture-mode'){
   const v=JSON.parse(body);if(!['normal','drop','hold'].includes(v.ack)||!['normal','outage','unsupported','ambiguous','mismatch-target','mismatch-digest','delayed'].includes(v.lookup)||typeof v.dedup!=='boolean')throw new Error('Invalid fixture mode');mode=v;return send(200,{ok:true});
  }
  if(req.method==='POST'&&url.pathname==='/effects'){
   posts++;const request=validateRequest(JSON.parse(body)),intent=request.intent;
   if(!intent.target.startsWith('synthetic://'))throw new Error('Only disposable synthetic targets allowed');
   if(mode.lookup==='delayed')await new Promise(res=>setTimeout(res,500));
   let r=receipts.get(intent.operationId);
   if(r && r.intentDigest!==bindingDigest(intent))return send(409,{status:'conflict'});
   if(!r){
    r=downstreamReceiptSchema.parse({operationId:intent.operationId,intentDigest:bindingDigest(intent),target:intent.target,argsDigest:intent.argsDigest,artifactDigest:intent.artifactDigest,writeNumber:writes+1});
    const file=await open(config.journal,'a',0o600);try{await file.writeFile(JSON.stringify(r)+'\n');await file.sync();}finally{await file.close();}
    // Receipt and counter derive from this same durable commit record.
    receipts.set(intent.operationId,r);writes++;
    process.stdout.write(JSON.stringify({kind:'effect-committed',owner:config.owner,pid:process.pid,...r})+'\n');
   }
   if(mode.ack==='drop'){req.socket.destroy();return;}
   if(mode.ack==='hold')return; // Crash barrier: commit observable, no response yet.
   return send(200,{status:'confirmed',receipt:r});
  }
  return send(404,{status:'unknown-route'});
 };
 // Serialize downstream commit/dedup, including simultaneous HTTP deliveries.
 serial=serial.then(handle).catch(e=>{if(!res.destroyed){res.writeHead(400);res.end(JSON.stringify({error:(e as Error).message}));}});
});
server.listen(config.port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({kind:'ready',owner:config.owner,pid:process.pid,writes,databaseCredentials:false})+'\n'));
process.once('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
