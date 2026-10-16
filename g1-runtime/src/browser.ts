import {createServer,type IncomingMessage} from 'node:http';
import type {RequestIdentity} from './admission.js';
import {revalidateScope,type VerifiedScope} from './owners.js';
/** This profile has NO browser, filesystem, credential, GUI, network or launch
 * port. Adding a positive channel requires a separate qualified composition. */
export const browserChannels=Object.freeze(['session','login','profile','cookies','capture','view','input','clipboard','download','recording','import','takeover','return','submit'] as const);
export const browserPaths=Object.freeze(['browser','gui','shell','sdk','mcp','api','filesystem'] as const);
export const browserRefusal=Object.freeze({
 code:'REQUIRED_CAPABILITY_UNSUPPORTED',status:'unsupported',supported:false,
 profile:'initial-no-browser',replayAllowed:false,assurance:'owned-local-fixture',remoteQualified:false,
 capabilities:Object.freeze(Object.fromEntries(browserChannels.map(c=>[c,false]))),
 alternative:'Use a separately qualified private workspace, or complete the sensitive step yourself and provide only a nonsensitive result.',
});
export interface BrowserIdentityPort {authenticate(request:RequestIdentity):Promise<VerifiedScope>}
/** Uniform static refusal for all aliases. Payloads/proofs are intentionally not
 * decoded or retained: no caller fields can install a capability or an observer. */
export class BrowserBoundary {
 constructor(private readonly identity:BrowserIdentityPort){}
 async refuse(identity:RequestIdentity):Promise<typeof browserRefusal>{
  const scope=await this.identity.authenticate(identity);await revalidateScope(scope);
  return browserRefusal;
 }
}
async function discard(request:IncomingMessage):Promise<boolean>{
 let bytes=0;for await(const chunk of request){bytes+=Buffer.byteLength(chunk);if(bytes>65_536)return false;}return true;
}
/** Authentication before body consumption; constant responses exclude credentials,
 * URL/body/header/error text. No logger or telemetry callback receives those bytes. */
export function browserHttp(boundary:BrowserBoundary){
 const paths=browserPaths.join('|'),channels=browserChannels.join('|');
 const route=new RegExp('^/runtime/v1/tenants/([a-f0-9-]{36})/spaces/([a-f0-9-]{36})/('+paths+')/('+channels+')(?:/(?:start|begin|login|restore|read|write|subscribe|enable|send|click|resume|return-control|import|submit))?$');
 return createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  // Close rather than retain an unread credential-bearing request in keepalive.
  res.setHeader('connection','close');
  const send=(status:number,value:unknown)=>{res.writeHead(status).end(JSON.stringify(value));};
  try{
   const match=route.exec(req.url??'');
   if(!match||!['POST','GET'].includes(req.method??'')){send(404,{code:'NOT_FOUND',replayAllowed:false});return;}
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!auth.startsWith('Bearer ')||auth.length>8200){send(403,{code:'UNAUTHORIZED',replayAllowed:false});return;}
   const identity={tenantId:match[1]!,spaceId:match[2]!,sessionCredential:auth.slice(7)};
   await boundary.refuse(identity);
   if(!await discard(req)){send(413,{code:'INVALID_SCHEMA',replayAllowed:false});return;}
   // Recheck after any slow request body / concurrent revocation. Still no launch.
   const refusal=await boundary.refuse(identity);send(403,refusal);
  }catch{send(403,{code:'UNAUTHORIZED',replayAllowed:false});}
 });
}
