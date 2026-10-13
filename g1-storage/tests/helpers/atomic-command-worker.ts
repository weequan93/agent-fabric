import pg from 'pg';
import {CryptoStore} from '../../src/crypto-store.js';
import {KnowledgeSaveRepository} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {startKnowledgeCommandHttp} from '../../src/command-http.js';
import {AuthenticatedUnitOfWork,createPostgresAuthorityLookup} from '../../../g1-identity/src/authenticated-uow.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {NativeRepository} from '../../src/owners.js';
import {demand} from '../../src/errors.js';

/** Private-IPC synthetic capabilities. The actual installed repository and HTTP
 * adapter own all behavior; no test implementation of publication or recovery. */
export interface AtomicWorkerInput {
 owner:string;instance:string;nonce:string;controllerDsn:string;authorityDsn:string;
 issuer:string;jwksUrl:string;token:string;tenantId:string;spaceId:string;
 root:OwnedAnchorRoot;dataKey:Buffer;digestKey:Buffer;keyId:string;generation:string;
}
function send(value:unknown){demand(process.send,'AUTHORITY_UNAVAILABLE');process.send(value);}
process.once('message',async(raw:unknown)=>{
 const message=raw as {kind:string;value:AtomicWorkerInput};demand(message.kind==='install');const c=message.value;
 demand(process.argv[2]===c.nonce,'CLEANUP_UNPROVEN');
 const application=`atomic-${process.pid}-${c.nonce}`;
 // Synthetic transport: detect a killed client while PG waits in the real
 // trigger. Default zero delays EOF detection until socket I/O/lock timeout.
 // This does not change lock_timeout, statement_timeout or authorization.
 const options='-c client_connection_check_interval=10ms';
 const controller=new pg.Pool({connectionString:c.controllerDsn,max:1,application_name:application,options,connectionTimeoutMillis:2000});
 const authority=new pg.Pool({connectionString:c.authorityDsn,max:1,application_name:application+'-auth',options,connectionTimeoutMillis:2000});
 try{
  const verifier=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:c.issuer,apiAudience:'storage-api',jwksUrl:c.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
  const scope=await verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:c.token});
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor);
  const crypto=new CryptoStore({resolve:async()=>({dataKey:c.dataKey,digestKey:c.digestKey})});
  const repo=new KnowledgeSaveRepository(uow,new EpochWitnessJournal(c.root),native,crypto,{resolve:async()=>({keyId:c.keyId,generation:c.generation})},new KnowledgeStatusAdmission(crypto));
  for(const pool of [controller,authority]){
   const setting=(await pool.query("SELECT current_setting('client_connection_check_interval') AS interval")).rows[0];
   demand(setting?.interval==='10ms','CLEANUP_UNPROVEN');
  }
  const server=await startKnowledgeCommandHttp(verifier,repo);
  send({kind:'ready',pid:process.pid,owner:c.owner,instance:c.instance,nonce:c.nonce,application,url:server.url,connectionCheckIntervalMs:10});
  process.on('message',(m:unknown)=>{const op=m as {kind:string;ref:unknown};if(op.kind==='read')void repo.read(scope,op.ref).then(value=>send({kind:'read',value}),()=>send({kind:'refused'}));});
 }catch{send({kind:'refused'});await Promise.all([controller.end(),authority.end()]);c.dataKey.fill(0);c.digestKey.fill(0);process.exitCode=1;}
});
