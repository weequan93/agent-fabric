import {appendFileSync} from 'node:fs';
import pg from 'pg';
import {createIdentityScopeVerifier} from '../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../g1-identity/src/token-verifier.js';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {FoundationError,type AsyncUnitOfWork} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository} from './repository.js';
import {DispatchRepository} from './dispatch-repository.js';
import {createNativeActivities} from './native-activities.js';
/** Synthetic local controller timer/driver process; native turns reuse the owned
 * adapter and exact checkpoint boundary. No independent planning/tool harness. */
const raw=process.env.FABRIC_DISPATCH_WORKER;if(!raw)throw new Error('Owned Dispatch fixture configuration required');
const config=JSON.parse(raw) as {owner:string;dsn:string;issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;scheduleId:string;measurementPath:string;pollMs:number;holdAfter:'admit'|'checkpoint'|null;monitorToken?:string};
if(!Number.isSafeInteger(config.pollMs)||config.pollMs<10||config.pollMs>1000||![null,'admit','checkpoint'].includes(config.holdAfter))throw new Error('Bounded worker configuration required');
const pool=new pg.Pool({connectionString:config.dsn,max:2}),authority=new pg.Pool({connectionString:config.dsn,max:2,connectionTimeoutMillis:2000});
const verifier=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:config.issuer,apiAudience:'recovery-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const scope=()=>verifier.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:s=>verifier.bindingFor(s)});
const repo=new RecoveryRepository(uow,s=>verifier.bindingFor(s)),dispatch=new DispatchRepository(repo);
function boundedNativeRepo(expiresAt:string){const bounded:AsyncUnitOfWork={withScope:async(s,work)=>uow.withScope(s,async tx=>{
 async function live(){if((await tx.query('SELECT $1::timestamptz>clock_timestamp() AS live',[expiresAt])).rows[0]?.live!==true)throw new FoundationError('STALE_AUTHORITY','Scheduled runtime expired; reconcile original occurrence');}
 await live();const result=await work(tx);await live();return result;})};return new RecoveryRepository(bounded,s=>verifier.bindingFor(s));}
const measure=(r:Record<string,unknown>)=>appendFileSync(config.measurementPath,JSON.stringify({owner:config.owner,pid:process.pid,...r})+'\n');
let running=true;process.once('SIGTERM',()=>{running=false;});
async function hold(){await new Promise<void>(resolve=>process.once('SIGTERM',resolve));}
measure({kind:'process-start',sessionCacheEntries:0});process.stdout.write(JSON.stringify({kind:'ready',owner:config.owner,pid:process.pid})+'\n');
try {
 while(running){
  try {
  let current;try{current=await scope();}catch(error){measure({kind:'admission-authority-unavailable'});if(!config.monitorToken)throw error;const monitor=await verifier.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.monitorToken});await dispatch.tick(monitor,config.scheduleId);await new Promise(resolve=>setTimeout(resolve,config.pollMs));continue;}
  const fires=await dispatch.tick(current,config.scheduleId);for(const o of fires)measure({kind:'timer-fire',occurrenceId:o.occurrenceId,at:o.at,state:o.state});
  const occurrences=await dispatch.occurrences(await scope(),config.scheduleId);
  for(const o of occurrences){
   if(!running)break;
   if(['submitted','reconciling'].includes(o.state)){const recovered=await dispatch.recover(await scope(),o.occurrenceId);measure({kind:'recovered',occurrenceId:o.occurrenceId,state:recovered.state,detail:recovered.detail});continue;}
   if(!['queued','waiting'].includes(o.state))continue;
   const ticket=await dispatch.admit(await scope(),o.occurrenceId,new Date(Date.now()+5000).toISOString());if(!ticket)continue;
   measure({kind:'admitted',occurrenceId:o.occurrenceId,generation:ticket.generation});if(config.holdAfter==='admit'){await hold();break;}
   if(ticket.operationId!==null){measure({kind:'exact-effect-driver-required',operationId:ticket.operationId});continue;}
   const s=await dispatch.get(await scope(),config.scheduleId);let deadline:ReturnType<typeof setTimeout>|undefined;
   try {await Promise.race([createNativeActivities({repo:boundedNativeRepo(ticket.runtimeExpiresAt),scope,workerGeneration:ticket.generation,measure}).nativeTurn(ticket.ref,ticket.sequence),new Promise<never>((_resolve,reject)=>{deadline=setTimeout(()=>reject(new Error('Bounded scheduled native controller deadline; reconcile original occurrence')),Math.max(1,Math.min(s.config.maxRuntimeMs,Date.parse(ticket.runtimeExpiresAt)-Date.now())));})]);}finally{if(deadline)clearTimeout(deadline);}
   measure({kind:'checkpoint-durable',occurrenceId:o.occurrenceId});if(config.holdAfter==='checkpoint'){await hold();break;}
   const result=await dispatch.recover(await scope(),o.occurrenceId);measure({kind:'settled',occurrenceId:o.occurrenceId,state:result.state});
  }
  if(running)await new Promise(resolve=>setTimeout(resolve,config.pollMs));
  } catch(error){const code=(error as {code?:string}).code;if(!config.monitorToken||!['UNAUTHORIZED','STALE_AUTHORITY','STALE_IDENTITY'].includes(code??''))throw error;measure({kind:'admission-authority-unavailable'});const monitor=await verifier.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.monitorToken});await dispatch.tick(monitor,config.scheduleId);if(running)await new Promise(resolve=>setTimeout(resolve,config.pollMs));}
 }
}finally{await Promise.all([pool.end(),authority.end()]);measure({kind:'process-cleanup',closed:true});}
