import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { TextDecoder } from 'node:util';
import type { IdentityScopeVerifier } from '../../g1-identity/src/contracts.js';
import { SaveCommandSchema,parseCommand } from './schema.js';
import { uuid } from './decoder.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError,safeFailure } from './errors.js';
import type { KnowledgeSaveRepository } from './knowledge-save.js';

/** Bounded local transport. Fixed installed F02 verifier/repository; neither
 * request credentials nor JSON can select an issuer, owner, key, clock or pool.
 * Lookup accepts the exact original command and returns metadata, never content
 * and never dispatches execute. Caller retains that original for reconciliation. */
export async function startKnowledgeCommandHttp(verifier:IdentityScopeVerifier,repository:KnowledgeSaveRepository){
 const reply=(res:ServerResponse,status:number,value:unknown)=>{
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(value));
 };
 async function body(req:IncomingMessage){
  demand(req.headers['content-type']==='application/json'&&!req.headers['content-encoding']);
  if(req.headers['content-length']!==undefined)demand(/^\d+$/.test(req.headers['content-length'])&&Number(req.headers['content-length'])<=LIMITS.commandBytes);
  const chunks:Buffer[]=[];let size=0;
  try{
   for await(const chunk of req.iterator({destroyOnReturn:false})){const b=Buffer.from(chunk as Uint8Array);size+=b.length;if(size>LIMITS.commandBytes){b.fill(0);req.resume();throw new StorageError('INVALID_SCHEMA');}chunks.push(b);}
   const bytes=Buffer.concat(chunks);try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new StorageError('INVALID_SCHEMA');}finally{bytes.fill(0);}
  }finally{for(const chunk of chunks)chunk.fill(0);}
 }
 const server=createServer((req,res)=>{void (async()=>{
  try{
   const route=/^\/v1\/tenants\/([^/]+)\/spaces\/([^/]+)\/knowledge\/(save|lookup)$/.exec(req.url??'');
   if(req.method!=='POST'||!route){reply(res,404,{schemaVersion:1,status:'not-saved',error:'INVALID_SCHEMA',replayAllowed:false,nextAction:'inspect-current-authority'});return;}
   const tenantId=uuid.parse(route[1]),spaceId=uuid.parse(route[2]);
   const credential=req.headers.authorization;
   demand(typeof credential==='string'&&/^Bearer [A-Za-z0-9_.-]+$/.test(credential),'UNAUTHORIZED');
   const scope=await verifier.verify({tenantId,spaceId,sessionCredential:credential.slice(7)});
   const command=parseCommand(SaveCommandSchema,await body(req));
   const result=route[3]==='save'?await repository.append(scope,command):await repository.lookupSave(scope,command);
   const resolver={method:'POST',path:`/v1/tenants/${tenantId}/spaces/${spaceId}/knowledge/lookup`};
   if(result.status==='unknown'){
    // UNKNOWN_COMMIT is retained only from safeFailure's instanceof check of
    // the installed FoundationError. Ordinary code/message spoofing is denial.
    reply(res,503,{...result,schemaVersion:1,key:command.key,replayAllowed:false,nextAction:'original-key-lookup',resolver});
   }else if(result.status==='absent-safe'){
    reply(res,200,{schemaVersion:1,status:'absent-safe',key:command.key,replayAllowed:false,nextAction:'inspect-current-authority'});
   }else if(result.status==='saved-here'||result.status==='pending-review'){
    reply(res,200,route[3]==='lookup'?{schemaVersion:1,status:'committed',key:command.key,result}:result);
   }else reply(res,result.error==='IDEMPOTENCY_CONFLICT'||result.error==='STALE_REVISION'?409:result.error==='INVALID_SCHEMA'||result.error==='UNSUPPORTED_VERSION'?400:403,result);
  }catch(error){const failure=safeFailure(error);reply(res,failure.status==='not-saved'&&['INVALID_SCHEMA','UNSUPPORTED_VERSION'].includes(failure.error)?400:403,failure);}
 })().catch(()=>{if(!res.headersSent)reply(res,500,{schemaVersion:1,status:'not-saved',error:'AUTHORITY_UNAVAILABLE',replayAllowed:false,nextAction:'inspect-current-authority'});else res.destroy();});});
 server.requestTimeout=10_000;server.headersTimeout=10_000;server.maxHeadersCount=32;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();demand(address&&typeof address==='object','AUTHORITY_UNAVAILABLE');
 return {url:`http://127.0.0.1:${address.port}`,async close(){server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
