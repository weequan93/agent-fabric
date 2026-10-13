import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup,AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { TransactionBudgetRepository } from '../../src/budget-repository.js';
import { ModelRepository,hash,type PrepareInput } from '../../src/model-repository.js';
import { demand } from '../../src/errors.js';
import type { OriginalCall } from '../../src/contracts.js';
const key='FABRIC_MODEL_BUDGET_CALLER';
const config=JSON.parse(process.env[key]??'null') as {marker:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string;profileDigest:string;pins:unknown;sourceDigest:string};
demand(config&&process.argv[2]===config.marker);delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];
demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const controller=new pg.Pool({connectionString:config.controllerDsn,max:1}),authority=new pg.Pool({connectionString:config.authorityDsn,max:2});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:scopes.bindingFor.bind(scopes)});
let release:(()=>void)|undefined,busy=false;
process.on('message',(message:unknown)=>{
 const m=message as {kind:string;requestId:string;runId:string;original:OriginalCall;amount:number;hold:boolean;input:PrepareInput};
 if(m.kind==='release'){release?.();process.send?.({kind:'control-ack',requestId:m.requestId});return;}
 if(!['reserve','prepare'].includes(m.kind)||busy)return;
 busy=true;process.send?.({kind:'control-ack',requestId:m.requestId});
 const held=async()=>{if(m.hold)await new Promise<void>(r=>{release=r;});};
 const work=(async()=>{process.send?.({kind:'caller-pid',pid:Number((await controller.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid'])});return m.kind==='reserve'?uow.withScope(scope,async tx=>{
  const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);process.send?.({kind:'caller-pid',pid});
  await new TransactionBudgetRepository(tx).reserve(m.runId,m.original,{tool:m.amount});process.send?.({kind:'partial',pid});await held();
 }):new ModelRepository(uow,{async assertCurrent(_tx,s,b,r){demand(s.actorId===b.actorId&&s.payerId===b.payerId&&r.profileDigest===config.profileDigest&&b.sourceRevisionDigest===config.sourceDigest&&hash(b.versions)===hash(config.pins),'UNAUTHORIZED');}},{async afterStage(stage,tx){if(stage==='reserved'){process.send?.({kind:'partial',pid:Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid'])});await held();}}}).prepare(scope,m.input);})();
 // A caller emits its backend PID before the blocking statement even for prepare.
 void work.then(result=>process.send?.({kind:'result',status:'committed',result}),e=>process.send?.({kind:'result',status:'refused',code:e.code,message:e.message})).finally(()=>{busy=false;});
});
console.log(JSON.stringify({marker:config.marker,pid:process.pid}));
process.on('SIGTERM',()=>{release?.();void Promise.all([controller.end(),authority.end()]).then(()=>process.exit(0));});
