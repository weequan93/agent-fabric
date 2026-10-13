import pg from 'pg';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../../g1-identity/src/authenticated-uow.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {NativeRepository,type SqlTransaction} from '../../src/owners.js';
import {EpochWitnessJournal} from '../../src/epoch-journal.js';
import {RetentionWorkRepository} from '../../src/retention-work.js';
import type {ArtifactProcessInput} from './artifact-process-worker.js';
import type {GraphRef} from '../../src/dependency-graph.js';
import {demand} from '../../src/errors.js';
type Input=ArtifactProcessInput&{restriction:{key:string;sessionId:string;expiresAt:string;entity:GraphRef}};
const send=(value:unknown)=>{demand(process.send);process.send(value);};
/** Private IPC gates expose actual installed restriction SQL/COMMIT phases.
 * The unchanged artifact fixture authenticates and owns/reaps this child. */
process.once('message',async(raw:unknown)=>{
 const init=raw as {kind:string;value:Input};demand(init.kind==='install');const c=init.value;demand(process.argv[2]===c.nonce);
 const application=`artifact-${process.pid}-${c.nonce}`,controller=new pg.Pool({connectionString:c.controllerDsn,max:1,application_name:application,connectionTimeoutMillis:2000}),authority=new pg.Pool({connectionString:c.authorityDsn,max:1,application_name:application+'-auth',connectionTimeoutMillis:2000});let release:(()=>void)|undefined;
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)}),scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token}),uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor);
  const census=async(tx:SqlTransaction)=>(await tx.query(`SELECT pg_backend_pid() AS pid,
   (SELECT count(*)::int FROM fabric.storage_tombstones WHERE command_key=$1) AS tombstones,
   (SELECT count(*)::int FROM fabric.storage_commands WHERE command_key=$1) AS commands,
   (SELECT count(*)::int FROM fabric.storage_outbox WHERE command_key=$1) AS outbox,
   (SELECT count(*)::int FROM fabric.storage_retention_events WHERE command_key=$1) AS retention,
   (SELECT count(*)::int FROM fabric.storage_graph_events WHERE command_key=$1) AS events,
   (SELECT count(*)::int FROM fabric.storage_graph_jobs WHERE command_key=$1) AS jobs`,[c.restriction.key])).rows[0];
  const gate=async(phase:string,tx?:SqlTransaction)=>{if(c.gate!==phase)return;const held=new Promise<void>(r=>release=r),backend=tx?await census(tx):await uow.withScope(scope,census);send({kind:'phase',phase,pid:process.pid,nonce:c.nonce,backend,contentOpens:0});await held;release=undefined;};
  const repo=()=>new RetentionWorkRepository(uow,new EpochWitnessJournal(c.authorityRoot),native,{afterPublication:tx=>gate('restriction-written',tx),beforeWitnessAck:()=>gate('restriction-committed')});let busy=false;
  process.on('message',(raw:unknown)=>{const m=raw as {kind:string;request:string};if(m.kind==='release'){demand(release);release();return;}demand(!busy);busy=true;void(async()=>{try{const value=m.kind==='forget'?await repo().forget(scope,c.restriction):m.kind==='lookup'?await repo().lookup(scope,c.restriction):(()=>{throw new Error('Unknown installed restriction operation');})();send({kind:'result',request:m.request,value});}catch(e){send({kind:'refused',request:m.request,code:String((e as {code?:string}).code??'untyped')});}finally{busy=false;}})();});
  send({kind:'ready',pid:process.pid,owner:c.owner,instance:c.instance,nonce:c.nonce,application});
 }catch{send({kind:'startup-refused'});await Promise.all([controller.end(),authority.end()]);process.exitCode=1;process.disconnect();}
});
