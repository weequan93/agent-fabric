import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup,AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { TransactionBudgetRepository } from '../../src/budget-repository.js';
import { demand } from '../../src/errors.js';
import type { OriginalCall } from '../../src/contracts.js';
const key='FABRIC_MODEL_LEDGER_CALLER';const config=JSON.parse(process.env[key]??'null') as {marker:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string};
demand(config&&process.argv[2]===config.marker);
delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];
demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const controller=new pg.Pool({connectionString:config.controllerDsn,max:1}),authority=new pg.Pool({connectionString:config.authorityDsn,max:2});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:scopes.bindingFor.bind(scopes)});
let release:(()=>void)|undefined,busy=false;
process.on('message',(message:unknown)=>{
 const m=message as {kind:string;requestId:string;runId:string;original:OriginalCall;amount:number;hold:boolean};
 if(m.kind==='release'){release?.();process.send?.({kind:'control-ack',requestId:m.requestId});return;}
 if(m.kind==='reserve'&&!busy){
  busy=true;process.send?.({kind:'control-ack',requestId:m.requestId});
  void uow.withScope(scope,async tx=>{
   const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);process.send?.({kind:'caller-pid',pid});
   await new TransactionBudgetRepository(tx).reserve(m.runId,m.original,{tool:m.amount});
   process.send?.({kind:'reserved',attemptId:m.original.attemptId,pid});
   if(m.hold)await new Promise<void>(r=>{release=r;});
  }).then(()=>process.send?.({kind:'result',status:'committed',attemptId:m.original.attemptId}),e=>process.send?.({kind:'result',status:'refused',code:e.code,attemptId:m.original.attemptId}));
 }
});
console.log(JSON.stringify({marker:config.marker,pid:process.pid}));
process.on('SIGTERM',()=>{release?.();void Promise.all([controller.end(),authority.end()]).then(()=>process.exit(0));});
