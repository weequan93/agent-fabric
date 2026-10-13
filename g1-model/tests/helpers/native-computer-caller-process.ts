import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup,AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { NativeRepository } from '../../src/native-repository.js';
import { NativeComputer } from '../../src/native-computer.js';
import { demand,safeFailure } from '../../src/errors.js';

// Trusted fixture admission boundary: the same authenticated native transaction
// and NativeComputer port as composeNative. The hold occurs after real writes,
// before COMMIT; it supplies no model, VM, shell or worker implementation.
const key='FABRIC_MODEL_COMPUTER_CALLER',config=JSON.parse(process.env[key]??'null') as {marker:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string};
demand(config&&process.argv[2]===config.marker);delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const controller=new pg.Pool({connectionString:config.controllerDsn,max:1,application_name:'model-computer-'+config.marker}),authority=new pg.Pool({connectionString:config.authorityDsn,max:2});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller),bindingFor:scopes.bindingFor.bind(scopes)}),repository=new NativeRepository(uow,scopes.bindingFor.bind(scopes)),computer=new NativeComputer();
let release:(()=>void)|undefined;
process.on('message',(raw:unknown)=>{const m=raw as {kind:string;requestId:string;sessionId:string;hold:boolean};if(!m||typeof m.requestId!=='string')return;
 if(m.kind==='release'){release?.();process.send?.({kind:'control-ack',requestId:m.requestId});return;}
 if(m.kind!=='admit')return;process.send?.({kind:'control-ack',requestId:m.requestId});
 void(async()=>{
  const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
  return uow.withScope(scope,async tx=>{
   const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);process.send?.({kind:'caller-pid',requestId:m.requestId,pid});
   const s=await repository.load(tx,scope,m.sessionId);await repository.fresh(tx,scope,s);
   const reason=await computer.admit(tx,scope,s);await repository.fresh(tx,scope,s);
   process.send?.({kind:'admission-written',requestId:m.requestId,pid,reason,resourceId:s.admission.resourceId});
   if(m.hold)await new Promise<void>(r=>{release=r;});
   return {reason,resourceId:s.admission.resourceId,pid};
  });
 })().then(result=>process.send?.({kind:'result',requestId:m.requestId,result}),e=>process.send?.({kind:'result',requestId:m.requestId,...safeFailure(e)}));
});
console.log(JSON.stringify({marker:config.marker,pid:process.pid,carrier:'trusted-native-admission-test-port',paidCallsAllowed:false,modelPorts:0,resourceStartPorts:0}));
process.on('SIGTERM',()=>{release?.();void Promise.all([controller.end(),authority.end()]).then(()=>process.exit(0));});
