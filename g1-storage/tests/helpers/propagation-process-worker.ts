import pg from 'pg';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../../g1-identity/src/authenticated-uow.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {NativeRepository,type SqlTransaction} from '../../src/owners.js';
import {EpochWitnessJournal} from '../../src/epoch-journal.js';
import {PropagationRetryRepository} from '../../src/propagation-retry.js';
import type {ArtifactProcessInput} from './artifact-process-worker.js';
import {demand} from '../../src/errors.js';
type Input=ArtifactProcessInput&{event:{key:string;sessionId:string;expiresAt:string};workerId:string;leaseMs:number};
const send=(value:unknown)=>{demand(process.send);process.send(value);};
process.once('message',async(raw:unknown)=>{
 const init=raw as {kind:string;value:Input};demand(init.kind==='install');const c=init.value;demand(process.argv[2]===c.nonce);
 // Reuse the installed fixture's application/census/kill ownership protocol.
 const application=`artifact-${process.pid}-${c.nonce}`,controller=new pg.Pool({connectionString:c.controllerDsn,max:1,application_name:application,connectionTimeoutMillis:2000}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1,application_name:application+'-auth',connectionTimeoutMillis:2000});
 let release:(()=>void)|undefined;
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)}),scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor);
  const census=async(tx:SqlTransaction)=>({...(await tx.query(`SELECT pg_backend_pid() AS pid,
   (SELECT count(*)::int FROM fabric.storage_graph_events WHERE command_key=$1) AS events,
   (SELECT count(*)::int FROM fabric.storage_graph_jobs WHERE command_key=$1) AS jobs,
   (SELECT count(*)::int FROM fabric.storage_graph_invalidations WHERE command_key=$1) AS invalidations,
   (SELECT count(*)::int FROM fabric.storage_propagation_results r JOIN fabric.storage_graph_jobs j USING(tenant_id,space_id,job_id) WHERE j.command_key=$1) AS results`,[c.event.key])).rows[0]});
  const gate=async(phase:string,tx?:SqlTransaction)=>{if(phase!==c.gate)return;const held=new Promise<void>(r=>release=r),backend=tx?await census(tx):await uow.withScope(scope,census);send({kind:'phase',phase,pid:process.pid,nonce:c.nonce,backend,contentOpens:0});await held;release=undefined;};
  const repo=new PropagationRetryRepository(uow,new EpochWitnessJournal(c.authorityRoot),native,{workerId:c.workerId,leaseMs:c.leaseMs},{afterMutation:tx=>gate('descendant-written',tx),afterCommitted:()=>gate('watermark')});
  let busy=false,lease:Awaited<ReturnType<typeof repo.claim>>=null;
  process.on('message',(raw:unknown)=>{
   const m=raw as {kind:string;request:string;ref:unknown};if(m.kind==='release'){demand(release);release();return;}demand(!busy);busy=true;
   void (async()=>{try{let value:unknown;
    if(m.kind==='progress')value=await repo.progress(scope,c.event);
    else if(m.kind==='claim'){lease=await repo.claim(scope,c.event);value=lease;}
    else if(m.kind==='complete'){demand(lease);value=await repo.complete(scope,{jobId:lease.jobId,leaseId:lease.leaseId,sessionId:c.event.sessionId,expiresAt:c.event.expiresAt});}
    else if(m.kind==='run'){
     for(let i=0;i<16;i++){lease=await repo.claim(scope,c.event);if(!lease)break;await gate('invalidation-persisted');await repo.complete(scope,{jobId:lease.jobId,leaseId:lease.leaseId,sessionId:c.event.sessionId,expiresAt:c.event.expiresAt});}
     value=await repo.progress(scope,c.event);
    }else throw new Error('Unknown installed retry operation');send({kind:'result',request:m.request,value});
   }catch(e){send({kind:'refused',request:m.request,code:String((e as {code?:string}).code??'untyped')});}finally{busy=false;}})();
  });
  send({kind:'ready',pid:process.pid,owner:c.owner,instance:c.instance,nonce:c.nonce,application});
 }catch{send({kind:'startup-refused'});await Promise.all([controller.end(),authority.end()]);process.exitCode=1;process.disconnect();}
});
