/** Independent disposable notification adapter. Only loopback, durable fsynced
 * dedup journal; no database/identity credentials or messages to real people. */
import {createServer} from 'node:http';
import {open,readFile} from 'node:fs/promises';
import {bindingDigest} from './contracts.js';
import {notificationHintSchema,type NotificationHint,type NotificationReceipt} from './notification-repository.js';
import {digest,object,positive,uuid} from './schema.js';
if(process.env.RECOVERY_DATABASE_URL||process.env.FABRIC_NATIVE_WORKER||process.env.FABRIC_RESULT_WORKER)throw new Error('No controller credentials in independent notification service');
const raw=process.env.FABRIC_NOTIFICATION_SERVICE;if(!raw)throw new Error('Owned service required');
const config=JSON.parse(raw) as {owner:string;journal:string;port:number};
const journalSchema=object({hint:notificationHintSchema,receipt:object({notificationId:uuid,hintDigest:digest,writeNumber:positive})});
const receipts=new Map<string,{hint:NotificationHint;receipt:NotificationReceipt}>();let writes=0,posts=0,lookups=0;
try{for(const line of (await readFile(config.journal,'utf8')).trim().split('\n').filter(Boolean)){const r=journalSchema.parse(JSON.parse(line));if(r.receipt.writeNumber!==writes+1||r.receipt.notificationId!==r.hint.notificationId||r.receipt.hintDigest!==bindingDigest(r.hint)||receipts.has(r.hint.notificationId))throw new Error('Corrupt notification journal');receipts.set(r.hint.notificationId,r);writes++;}}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}
let mode={ack:'normal',lookup:'normal'},serial=Promise.resolve();
const server=createServer((req,res)=>{serial=serial.then(async()=>{
 const url=new URL(req.url??'/','http://127.0.0.1');const send=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(req.method==='GET'&&url.pathname==='/metrics')return send(200,{owner:config.owner,pid:process.pid,writes,posts,lookups,hints:[...receipts.values()].map(r=>r.hint)});
 if(req.method==='GET'&&url.pathname.startsWith('/notifications/')){lookups++;if(mode.lookup==='unsupported')return send(501,{status:'unsupported'});if(mode.lookup==='outage')return send(503,{status:'outage'});if(mode.lookup==='absent')return send(200,{status:'absent'});const r=receipts.get(decodeURIComponent(url.pathname.slice('/notifications/'.length)));return send(200,r?{status:'confirmed',receipt:mode.lookup==='mismatch'?{...r.receipt,hintDigest:bindingDigest('wrong')}:r.receipt}:{status:'absent'});}
 let body='';for await(const chunk of req){body+=String(chunk);if(body.length>8192)throw new Error('Bounded notification body required');}
 if(req.method==='POST'&&url.pathname==='/fixture-mode'){const m=JSON.parse(body);if(!['normal','reject','drop','hold'].includes(m.ack)||!['normal','unsupported','outage','absent','mismatch'].includes(m.lookup))throw new Error('Invalid fixture mode');mode=m;return send(200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/notifications'){
  posts++;const hint=notificationHintSchema.parse(JSON.parse(body));
  if(mode.ack==='reject')return send(503,{status:'rejected',definitelyNotSent:true});
  let existing=receipts.get(hint.notificationId);if(existing&&existing.receipt.hintDigest!==bindingDigest(hint))return send(409,{status:'conflict'});
  if(!existing){existing=journalSchema.parse({hint,receipt:{notificationId:hint.notificationId,hintDigest:bindingDigest(hint),writeNumber:writes+1}});const file=await open(config.journal,'a',0o600);try{await file.writeFile(JSON.stringify(existing)+'\n');await file.sync();}finally{await file.close();}receipts.set(hint.notificationId,existing);writes++;process.stdout.write(JSON.stringify({kind:'notification-committed',owner:config.owner,pid:process.pid,...existing.receipt})+'\n');}
  if(mode.ack==='drop'){req.socket.destroy();return;}if(mode.ack==='hold')return;return send(200,{status:'confirmed',receipt:existing.receipt});
 }
 return send(404,{status:'unknown-route'});
}).catch(error=>{if(!res.destroyed){res.writeHead(400);res.end(JSON.stringify({error:(error as Error).message}));}});});
server.listen(config.port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({kind:'ready',owner:config.owner,pid:process.pid,writes,databaseCredentials:false})+'\n'));
process.once('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
