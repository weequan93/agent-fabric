import {createServer} from 'node:http';
import {FoundationError,type VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {IdentityError} from '../../g1-identity/src/contracts.js';
import {RecoveryError} from './schema.js';
import {fenceCommandSchema,type FenceRepository} from './fence-repository.js';
/** Authenticated online command boundary. The trusted observer and synthetic
 * mutation callbacks are deliberately absent from this client interface. */
export async function createFenceHttpService(options:{fences:FenceRepository;verify:(credential:string,tenantId:string,spaceId:string)=>Promise<VerifiedScope>}):Promise<{endpoint:string;close:()=>Promise<void>}> {
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
   if(req.method!=='POST'||!['/commands','/lookup'].includes(req.url??'')){res.writeHead(404);res.end(JSON.stringify({status:'not-found'}));return;}
   const authorization=req.headers.authorization;
   if(!authorization?.startsWith('Bearer ')||authorization.length>16384)throw new FoundationError('UNAUTHORIZED');
   let raw='';for await(const chunk of req){raw+=String(chunk);if(Buffer.byteLength(raw)>16384)throw new FoundationError('INVALID_INPUT');}
   const command=fenceCommandSchema.parse(JSON.parse(raw) as unknown);
   const scope=await options.verify(authorization.slice(7),command.task.tenantId,command.task.spaceId);
   const response=req.url==='/lookup'?await options.fences.lookupCommand(scope,command):await options.fences.execute(scope,command);
   res.writeHead(200);res.end(JSON.stringify(response));
  }catch(error){
   const unknown=error instanceof FoundationError&&error.code==='UNKNOWN_COMMIT';
   const allowed=error instanceof FoundationError||error instanceof IdentityError||error instanceof RecoveryError;
   res.writeHead(unknown?503:allowed?403:400);
   res.end(JSON.stringify(unknown?{status:'unknown',nextAction:'lookup-original-key-no-replay',replayAllowed:false}:{status:'refused',code:allowed?error.code:'INVALID_INPUT'}));
  }
 });
 server.requestTimeout=5000;server.headersTimeout=5000;
 await new Promise<void>((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',()=>res());});
 const address=server.address();if(!address||typeof address==='string')throw new Error('Owned HTTP readiness failed');
 return {endpoint:'http://127.0.0.1:'+address.port,close:()=>new Promise<void>((res,rej)=>{server.close(e=>e?rej(e):res());server.closeIdleConnections();})};
}
