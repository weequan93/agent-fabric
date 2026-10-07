import {createServer,type IncomingMessage} from 'node:http';
import {assertUuid,revalidateScope,FoundationError} from '../../g1-foundations/src/contracts.js';
import {IdentityError,type UnknownApprovalCommitResponse,type IdentityHttpServiceOptions,type RunningIdentityHttpService,type CreateApprovalInput,type ConsumeApprovalInput} from './contracts.js';
const forbidden=new Set(['actorId','payerId','grants','principalKind','authorityRevision','membershipRevision','sessionCredential']);
function boundary(value:unknown):void{if(value&&typeof value==='object'){if(Array.isArray(value)){for(const item of value)boundary(item);}else{for(const [key,item]of Object.entries(value)){if(forbidden.has(key))throw new IdentityError('INVALID_INPUT');boundary(item);}}}}
async function json(req:IncomingMessage){let text='';for await(const chunk of req){text+=String(chunk);if(text.length>32768)throw new IdentityError('INVALID_INPUT');}const value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new IdentityError('INVALID_INPUT');boundary(value);return value as Record<string,unknown>;}
/** Trusted composition root injects scopes/approval repository, never an HTTP caller. */
export async function startIdentityHttpService(options:IdentityHttpServiceOptions):Promise<RunningIdentityHttpService>{
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');try{
  const url=new URL(req.url??'/','http://127.0.0.1');const tenantId=url.searchParams.get('tenantId'),spaceId=url.searchParams.get('spaceId');assertUuid(tenantId);assertUuid(spaceId);
  for(const key of url.searchParams.keys())if(!['tenantId','spaceId'].includes(key))throw new IdentityError('INVALID_INPUT');
  const header=req.headers.authorization;if(typeof header!=='string'||!/^Bearer [A-Za-z0-9._-]+$/.test(header)||header.length>8200)throw new IdentityError('INVALID_TOKEN');
  const scope=await options.scopes.verify({tenantId,spaceId,sessionCredential:header.slice(7)});
  if(req.method==='GET'&&(url.pathname==='/me'||url.pathname==='/space')){await revalidateScope(scope);res.end(JSON.stringify({tenantId:scope.tenantId,spaceId:scope.spaceId,actorId:scope.actorId,qualification:'local-synthetic-test-only'}));return;}
  if(req.method!=='POST') {res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));return;}
  const input=await json(req);let result:unknown;
  if(url.pathname==='/approvals'){if(Object.keys(input).some(k=>!['approvalId','executorId','binding'].includes(k)))throw new IdentityError('INVALID_INPUT');result=await options.approvals.create(scope,input as unknown as CreateApprovalInput);}
  else if(url.pathname==='/approvals/approve'){if(Object.keys(input).some(k=>!['approvalId','bindingDigest'].includes(k))||typeof input.approvalId!=='string'||typeof input.bindingDigest!=='string')throw new IdentityError('INVALID_INPUT');result=await options.approvals.approve(scope,input.approvalId,input.bindingDigest);}
  else if(url.pathname==='/approvals/consume'){if(Object.keys(input).some(k=>!['approvalId','idempotencyKey','binding'].includes(k)))throw new IdentityError('INVALID_INPUT');result=await options.approvals.consume(scope,input as unknown as ConsumeApprovalInput);}
  else if(url.pathname==='/approvals/lookup'){if(Object.keys(input).some(k=>!['idempotencyKey','bindingDigest'].includes(k))||typeof input.idempotencyKey!=='string'||typeof input.bindingDigest!=='string')throw new IdentityError('INVALID_INPUT');result=await options.approvals.lookupCommand(scope,input.idempotencyKey,input.bindingDigest);}
  else{res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));return;}
  res.end(JSON.stringify(result));
 }catch(error){
  // Only this foundation code crosses the boundary; arbitrary errors stay closed.
  if((error instanceof FoundationError||error instanceof IdentityError)&&error.code==='UNKNOWN_COMMIT'){
   const response:UnknownApprovalCommitResponse={error:'UNKNOWN_COMMIT',status:'unknown',recovery:{path:'/approvals/lookup',method:'POST',useOriginalKey:true,replayAllowed:false}};
   res.statusCode=503;res.end(JSON.stringify(response));return;
  }
  const code=error instanceof IdentityError?error.code:'UNAUTHORIZED';res.statusCode=code==='INVALID_INPUT'?400:403;res.end(JSON.stringify({error:code}));}});
 server.requestTimeout=5000;server.headersTimeout=5000;await new Promise<void>((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',()=>r());});const address=server.address();if(!address||typeof address==='string')throw new Error('listen');return {url:'http://127.0.0.1:'+address.port,close:async()=>{server.closeAllConnections();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}};
}
