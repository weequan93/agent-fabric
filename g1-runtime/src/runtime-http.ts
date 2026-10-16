import {createServer,type IncomingMessage} from 'node:http';
import {RuntimeAdmission,DraftSchema,type RequestIdentity} from './admission.js';
import {AdmissionError,demand} from './intent.js';
import {admissionView} from './view.js';
const safeCodes:Record<AdmissionError['code'],string>={INVALID_REQUEST:'INVALID_SCHEMA',UNAUTHORIZED:'UNAUTHORIZED',INTENT_EXCEEDED:'INTENT_EXCEEDED',PERMISSION_DENIED:'UNAUTHORIZED',UNSUPPORTED:'REQUIRED_CAPABILITY_UNSUPPORTED',PREFLIGHT_REQUIRED:'CHECK_BINDING_MISMATCH',APPROVAL_REQUIRED:'APPROVAL_MISMATCH',APPROVAL_CONFLICT:'APPROVAL_MISMATCH',STALE_PREFLIGHT:'STALE_REVISION',IDEMPOTENCY_CONFLICT:'IDEMPOTENCY_CONFLICT',UNKNOWN_OUTCOME:'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION',NOT_FOUND:'NOT_FOUND'};
async function body(request:IncomingMessage):Promise<unknown>{
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of request){const b=Buffer.from(chunk);size+=b.length;demand(size<=65_536,'INVALID_REQUEST');chunks.push(b);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new AdmissionError('INVALID_REQUEST');}
}
/** No implicit listener or target capability; composition decides loopback binding. */
export function runtimeHttp(admission:RuntimeAdmission){
 return createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
   const path=req.url??'',match=/^\/runtime\/v1\/tenants\/([a-f0-9-]{36})\/spaces\/([a-f0-9-]{36})\/tasks(?:\/([a-f0-9-]{36})(?:\/(preflight|accept|run))?)?$/.exec(path);
   demand(match,'NOT_FOUND');
   const credential=req.headers.authorization;demand(typeof credential==='string'&&credential.startsWith('Bearer ')&&credential.length<=8200,'UNAUTHORIZED');
   const identity:RequestIdentity={tenantId:match[1]!,spaceId:match[2]!,sessionCredential:credential.slice(7)};
   // Authenticate before body, command lookup, preflight or any status projection.
   const scope=await admission.authenticate(identity);const id=match[3],action=match[4];let result:unknown;
   if(req.method==='POST'&&!id){
    const raw=await body(req);demand(raw&&typeof raw==='object'&&!Array.isArray(raw),'INVALID_REQUEST');
    const defaults={intent:'ask',targetId:null,...raw};DraftSchema.parse(defaults);
    result=admissionView(await admission.draft(scope,defaults));
   }else if(req.method==='GET'&&id&&(action==='preflight'||!action)){const status=await admission.status(scope,id);result=admissionView(status.record,status.invocation);}
   else if(req.method==='POST'&&id&&action==='accept')result=await admission.accept(scope,id,await body(req));
   else if(req.method==='POST'&&id&&action==='run')result=await admission.execute(scope,id,await body(req));
   else throw new AdmissionError('NOT_FOUND');
   res.statusCode=200;res.end(JSON.stringify(result));
  }catch(e){
   const code=e instanceof AdmissionError?safeCodes[e.code]:'UNAUTHORIZED';res.statusCode=code==='NOT_FOUND'?404:code==='IDEMPOTENCY_CONFLICT'?409:code==='UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'?503:403;
   res.end(JSON.stringify({code,preservedWork:true,cost:{status:'unknown'},resolver:code==='UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'?'original-operation-owner':'task-requester',replayAllowed:false}));
  }
 });
}
