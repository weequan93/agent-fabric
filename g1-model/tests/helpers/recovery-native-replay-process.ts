import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { AuthenticatedUnitOfWork,createPostgresAuthorityLookup } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { composeNative } from '../../src/native-runtime.js';
import { VersionPinsSchema,OperatingProfileSchema } from '../../src/schema.js';
import { LocalAdapterClient } from '../../src/test-adapter.js';
import { TaskContextSourceStore,type SourceDescriptor } from '../../src/context.js';
import { nativeView } from '../../src/view.js';
import { demand,safeFailure } from '../../src/errors.js';
import type { AsyncUnitOfWork } from '../../src/contracts.js';
import type { ModelSelection } from '../../src/profile.js';
const key='FABRIC_MODEL_REPLAY_CALLER',config=JSON.parse(process.env[key]??'null') as {marker:string;controllerDsn:string;authorityDsn:string;token:string;tenantId:string;spaceId:string;issuer:string;jwksUrl:string;url:string;transportToken:string;ownerId:string;profile:unknown;pins:unknown;descriptors:readonly [string,readonly SourceDescriptor[]][]};
demand(config&&process.argv[2]===config.marker);delete process.env[key];delete process.env['__CF_USER_TEXT_ENCODING'];demand(Object.keys(process.env).every(k=>['PATH','LC_ALL'].includes(k)));
const pool=new pg.Pool({connectionString:config.controllerDsn,max:2,application_name:'model-replay-'+config.marker}),authority=new pg.Pool({connectionString:config.authorityDsn,max:2});
const scopes=createIdentityScopeVerifier({verifyToken:t=>verifyAccessToken(t,{issuer:config.issuer,apiAudience:'model-api',jwksUrl:config.jwksUrl}),lookupAuthority:createPostgresAuthorityLookup(authority)});
const base=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:scopes.bindingFor.bind(scopes)});
const counts={model:0,acceptAttempts:0,lookup:0,retrieval:0,tool:0,provision:0,topUp:0,write:0,sql:0,profile:0};let measured=false;
const tick=(k:keyof typeof counts)=>{if(measured)counts[k]++;};
const uow:AsyncUnitOfWork={withScope:async(scope,work)=>{tick('sql');return base.withScope(scope,tx=>work({query:async<Row extends Record<string,unknown>>(sql:string,values?:readonly unknown[])=>{tick('sql');if(/\b(?:INSERT|UPDATE|DELETE|model_top_up)\b/i.test(sql))tick('write');return tx.query<Row>(sql,values);}}));}};
const adapter=new LocalAdapterClient(config.url,config.transportToken,config.ownerId),accept=adapter.accept.bind(adapter),lookup=adapter.lookup.bind(adapter);
adapter.accept=async r=>{tick('acceptAttempts');return accept(r);};adapter.lookup=async o=>{tick('lookup');return lookup(o);};
const retrieve=TaskContextSourceStore.prototype.retrieve;TaskContextSourceStore.prototype.retrieve=async function(...args){tick('retrieval');return retrieve.apply(this,args);};
const runtime=composeNative({uow,bindingFor:scopes.bindingFor.bind(scopes),pins:VersionPinsSchema.parse(config.pins),profile:OperatingProfileSchema.parse(config.profile),adapter,descriptors:new Map(config.descriptors),profiles:{select:():ModelSelection=>{tick('profile');return {status:'waiting',reason:'model-unavailable',refusal:'QUALIFICATION_MISMATCH',choiceLabel:'Auto - organization approved',allowedNextActions:['switch-profile','contact-administrator'],dispatchAllowed:false};}},admission:async()=>{tick('provision');return null;},publishChunk:async()=>{tick('write');}});
const topUp=runtime.repository.topUp.bind(runtime.repository);runtime.repository.topUp=async(...args)=>{tick('topUp');return topUp(...args);};
const encode=runtime.ports.encode;runtime.ports.encode=async(...args)=>{tick('model');return encode(...args);};
const continuation=runtime.session.continue.bind(runtime.session);runtime.session.continue=async(scope,command,effect,io)=>continuation(scope,command,effect,async()=>{tick(effect==='computer'?'provision':'tool');await io();});
async function refuses(work:()=>Promise<unknown>|unknown,allowed:string[]){let found:string|undefined;try{await work();}catch(e){found=(e as {code?:string}).code;}assert.ok(found&&allowed.includes(found),'must refuse with '+allowed.join('/')+', observed '+found);return found;}
process.on('message',(raw:unknown)=>{const m=raw as {kind:string;requestId:string;input:{sessionId:string;operationId?:string}};if(!m||typeof m.requestId!=='string')return;process.send?.({kind:'control-ack',requestId:m.requestId});let stage='verify-current-scope';void(async()=>{
 const scope=await scopes.verify({tenantId:config.tenantId,spaceId:config.spaceId,sessionCredential:config.token});
 if(m.kind==='resolve'){stage='native-original-reconcile';return runtime.session.reconcile(scope,{sessionId:m.input.sessionId,operationId:m.input.operationId!});}
 stage='native-snapshot';demand(m.kind==='replay');const snapshot=await runtime.repository.snapshot(scope,m.input.sessionId);stage='native-costs';const costs=await base.withScope(scope,async tx=>(await tx.query('SELECT fabric.model_native_costs($1) AS costs',[m.input.sessionId])).rows[0]?.['costs'] as {reserved:number;actual:number;pendingExposure:number});
 for(const k of Object.keys(counts) as (keyof typeof counts)[])counts[k]=0;measured=true;
 try{
  stage='native-pure-restore';const restored=runtime.session.restore(snapshot,scope),state=restored.inspect(),history=restored.events(),projection=nativeView(snapshot,costs),nextAction=restored.nextAction();assert.deepEqual(history,snapshot.events);assert.deepEqual(state.run.versions,snapshot.origin.versions);
  const negatives:Record<string,string>={};
  if(state.pendingModel){
   negatives['freshModel']=await refuses(()=>restored.callModel('REPLAY_MUST_NOT_RUN_MODEL'),['UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','INVALID_SCHEMA']);
   negatives['freshEffect']=await refuses(()=>restored.dispatchEffect(randomUUID()),['UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','INVALID_SCHEMA']);
   negatives['wrongOriginal']=await refuses(()=>restored.resolveModel(randomUUID()),['CHECK_BINDING_MISMATCH']);
   negatives['untrustedResolution']=await refuses(()=>restored.resolveModel(state.pendingModel!.operationId),['UNKNOWN_EFFECT_REQUIRES_RECONCILIATION']);
   assert.deepEqual(restored.events(),history);assert.deepEqual(restored.inspect(),state);
  }
  assert.ok(snapshot.events.length>0);const originalHistory=structuredClone(snapshot.events),incompatible=structuredClone(snapshot);
  incompatible.events[0] = {...incompatible.events[0]!,schemaVersion:2} as unknown as typeof incompatible.events[0];
  assert.equal(incompatible.events[0]?.schemaVersion,2);assert.deepEqual(snapshot.events,originalHistory);assert.equal(snapshot.events[0]?.schemaVersion,1);
  negatives['incompatibleVersion']=await refuses(()=>runtime.session.restore(incompatible,scope),['INVALID_SCHEMA','UNSUPPORTED_VERSION']);
  assert.deepEqual(snapshot.events,originalHistory);assert.deepEqual(restored.events(),history);
  assert.deepEqual(counts,{model:0,acceptAttempts:0,lookup:0,retrieval:0,tool:0,provision:0,topUp:0,write:0,sql:0,profile:0});
  return {state,history,projection,pins:snapshot.binding.versions,nextAction,negatives,counters:{...counts}};
 }finally{measured=false;}
})().then(result=>process.send?.({kind:'result',requestId:m.requestId,result}),e=>{measured=false;process.send?.({kind:'result',requestId:m.requestId,...safeFailure(e),diagnostic:{stage,errorName:e instanceof Error?e.name:null,errorCode:(e as {code?:string})?.code??null,frames:e instanceof Error?e.stack?.split('\n').slice(1):[]}});});});
console.log(JSON.stringify({marker:config.marker,pid:process.pid,carrier:'trusted-parent-replay-port',paidCallsAllowed:false,qualification:'not-installed; pure replay and original accounting only'}));
process.on('SIGTERM',()=>{void Promise.all([pool.end(),authority.end()]).then(()=>process.exit(0));});
