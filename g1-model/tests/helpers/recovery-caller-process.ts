import pg from 'pg';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { createPostgresAuthorityLookup,AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { FoundationError } from '../../src/native-imports.js';
import { ModelRepository,hash,lockOriginal,type PrepareInput } from '../../src/model-repository.js';
import { UsageRepository,type UsageHooks } from '../../src/usage-repository.js';
import { ModelService } from '../../src/model-service.js';
import { LocalAdapterClient } from '../../src/test-adapter.js';
import { demand } from '../../src/errors.js';
import type { RetryInput } from '../../src/retry-repository.js';
import type { OriginalCall } from '../../src/contracts.js';

// Trusted, test-only composition. Gates are IPC controls owned by the current
// parent; none is an operator/model input to the production command schemas.
const key='FABRIC_MODEL_RECOVERY_CALLER';
const config=JSON.parse(process.env[key]??'null') as {marker:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string;url:string;transportToken:string;ownerId:string;route:string;profileDigest:string;pins:unknown;sourceDigest:string};
demand(config&&process.argv[2]===config.marker);delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const controller=new pg.Pool({connectionString:config.controllerDsn,max:1,application_name:'model-recovery-'+config.marker}),authorityPool=new pg.Pool({connectionString:config.authorityDsn,max:2}),faultPool=new pg.Pool({connectionString:config.controllerDsn,max:1,application_name:'model-recovery-fixture-read-'+config.marker});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authorityPool)});
let busy=false,release:(()=>void)|undefined;
process.on('message',(message:unknown)=>{
 const m=message as {kind:string;requestId:string;input:PrepareInput;retry:RetryInput;original:OriginalCall;gate?:string;lostCommit?:'prepare'|'claim'|'settle';lookupFaultId?:string;faultStage?:'usage'|'audit'|'outbox';key:string;digest:string;rollback?:boolean};
 if(m.kind==='release'){release?.();process.send?.({kind:'control-ack',requestId:m.requestId});return;}
 if(busy)return;busy=true;process.send?.({kind:'control-ack',requestId:m.requestId});
 const hit=async(name:string,pid?:number)=>{if(m.gate!==name)return;process.send?.({kind:'gate',requestId:m.requestId,name,pid});await new Promise<void>(r=>{release=r;});release=undefined;};
 void (async()=>{
  const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
  process.send?.({kind:'backend',requestId:m.requestId,pid:Number((await controller.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)});
  let mutated:'prepare'|'claim'|'settle'|undefined;
  const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(controller,()=>{if(mutated&&mutated===m.lostCommit){mutated=undefined;throw new Error('Real COMMIT acknowledged by PG; test drops caller acknowledgement');}}),bindingFor:scopes.bindingFor.bind(scopes)});
  const authority={async assertCurrent(_tx:unknown,s:typeof scope,b:{actorId:string;payerId:string;sourceRevisionDigest:string;versions:unknown},r:{profileDigest:string}){demand(s.actorId===b.actorId&&s.payerId===b.payerId&&b.sourceRevisionDigest===config.sourceDigest&&hash(b.versions)===hash(config.pins)&&r.profileDigest===config.profileDigest,'UNAUTHORIZED');}};
  const fault=async(stage:string,tx:import('../../src/contracts.js').SqlTransaction)=>{if(m.faultStage!==stage)return;const counts=(await tx.query('SELECT pg_backend_pid() AS pid,(SELECT count(*)::int FROM fabric.model_resolutions WHERE attempt_id=$1) AS resolutions,public.recovery_partial_settlement_count($2) AS settlements,(SELECT count(*)::int FROM fabric.model_usage_categories WHERE attempt_id=$1) AS categories,(SELECT count(*)::int FROM fabric.model_audit WHERE command_key=$3) AS audit,(SELECT count(*)::int FROM fabric.model_outbox WHERE command_key=$3) AS outbox',[m.original.attemptId,m.original.reservationId,'usage:'+m.original.attemptId+':settled'])).rows[0];process.send?.({kind:'partial',requestId:m.requestId,stage,...counts});await tx.query('SELECT 1/0');};
  const hooks:UsageHooks={async afterStage(stage,tx){if(stage==='operation')mutated='prepare';if(stage==='claim')mutated='claim';if(stage==='outbox'&&mutated)await hit('before-'+mutated+'-commit',Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']));await fault(stage,tx);},async afterUsage(tx){mutated='settle';await fault('usage',tx);}};
  const model=new ModelRepository(uow,authority,hooks),usage=new UsageRepository(uow,authority,hooks),client=new LocalAdapterClient(config.url,config.transportToken,config.ownerId);
  const port=m.lookupFaultId?{accept:client.accept.bind(client),lookup:async()=>{const row=(await faultPool.query('SELECT observation FROM public.recovery_observation_faults WHERE id=$1',[m.lookupFaultId])).rows[0];demand(row,'CHECK_BINDING_MISMATCH');return row.observation as import('../../src/contracts.js').OwnerObservation;},cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)}:client;
  const service=new ModelService(model,usage,[{ownerId:config.ownerId,route:config.route,profileDigest:config.profileDigest,port}]);
  if(m.kind==='lookup')return model.lookup(scope,m.key,m.digest);
  if(m.kind==='hold-key')return uow.withScope(scope,async tx=>{await lockOriginal(tx,scope,m.key);await hit('key-held',Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']));if(m.rollback)await tx.query('SELECT 1/0');return {committed:true};});
  if(m.kind==='prepare'||m.kind==='drive'){
   const prepared=await service.prepare(scope,m.input);mutated=undefined;await hit('after-prepare-commit');
   if(m.kind==='prepare')return prepared;
  }
  if(m.kind==='drive'||m.kind==='dispatch'){
   const original=m.kind==='drive'?m.input.request.original:m.original;
   const permit=await model.claim(scope,original.attemptId);mutated=undefined;demand(permit,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION');await hit('after-claim-commit');return service.dispatchPermit(scope,original,permit);
  }
  if(m.kind==='retry')return service.takeRetry(scope,m.retry);
  if(m.kind==='reconcile')return service.reconcile(scope,m.original);
  if(m.kind==='seal')return service.seal(scope,m.original);
  if(m.kind==='cancel')return service.cancel(scope,m.original);
  throw new Error('Unsupported recovery fixture command');
 })().then(result=>process.send?.({kind:'result',requestId:m.requestId,result}),e=>process.send?.({kind:'result',requestId:m.requestId,error:e.code,typedUnknown:e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT',message:e.message})).finally(()=>{busy=false;});
});
console.log(JSON.stringify({marker:config.marker,pid:process.pid,carrier:'trusted-parent-recovery-test',paidCallsAllowed:false}));
process.on('SIGTERM',()=>{release?.();void Promise.all([controller.end(),authorityPool.end(),faultPool.end()]).then(()=>process.exit(0));});
