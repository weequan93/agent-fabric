import { randomUUID,createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { AuthenticatedUnitOfWork,createPostgresAuthorityLookup } from '../../../g1-identity/src/authenticated-uow.js';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { beginTestAuthorization,completeTestAuthorization } from '../../../g1-identity/src/test-idp.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { PostgresTaskRepository,commandDigest } from '../../../g1-foundations/src/task-repository.js';
import { NativeRepository,AdmissionSchema } from '../../../g1-model/src/native-repository.js';
import { TaskCallBindingSchema,VersionPinsSchema } from '../../../g1-model/src/schema.js';
import { launchOwned,stopOwned,type OwnedProcess } from '../../../g1-model/tests/helpers/process-fixture.js';
import { demand } from '../../src/errors.js';
import type { VerifiedScope } from '../../src/owners.js';
export async function createStorageFixture(){
 const url=process.env['STORAGE_DATABASE_URL'],owner=process.env['STORAGE_FIXTURE_OWNER'],instance=process.env['STORAGE_FIXTURE_INSTANCE'],root=process.env['STORAGE_REPO_ROOT'],ownerRoot=process.env['STORAGE_OWNER_ROOT'];
 demand(url&&owner&&instance&&root&&ownerRoot,'AUTHORITY_UNAVAILABLE');const target=new URL(url);demand(target.hostname==='127.0.0.1'&&target.pathname==='/storage_test','UNAUTHORIZED');
 const admin=new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:2000}),pools=[admin],children:OwnedProcess[]=[];let closed=false;
 async function close(){if(closed)return;closed=true;const results=await Promise.allSettled(children.map(p=>stopOwned(p)));const ended=await Promise.allSettled(pools.map(p=>p.end()));const failures=[...results,...ended].filter(r=>r.status==='rejected');if(failures.length)throw new AggregateError(failures.map(r=>(r as PromiseRejectedResult).reason),'Storage child/pool cleanup failed');}
 try{
  const marker=(await admin.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows;
  demand(marker.length===1&&marker[0]?.owner===owner&&marker[0]?.instance===instance,'CLEANUP_UNPROVEN');
  const prefix='s_'+randomUUID().replaceAll('-',''),roles={controller:prefix+'_controller',authority:prefix+'_authority',worker:prefix+'_worker',client:prefix+'_client',idp:prefix+'_idp'};
  const passwords=new Map<string,string>();
  for(const [kind,role] of Object.entries(roles)){
   const password=randomUUID();passwords.set(role,password);
   await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
   const parent=kind==='controller'||kind==='authority'?'fabric_controller':kind==='worker'?'fabric_worker':kind==='idp'?'fabric_test_idp':null;
   if(parent)await admin.query(`GRANT ${parent} TO ${role}`);
  }
  const dsn=(kind:keyof typeof roles)=>{const u=new URL(url);u.username=roles[kind];u.password=passwords.get(roles[kind])!;return u.href;};
  const pool=(kind:keyof typeof roles,max:number)=>{const p=new pg.Pool({connectionString:dsn(kind),max,connectionTimeoutMillis:2000});pools.push(p);return p;};
  const controller=pool('controller',8),authority=pool('authority',4),worker=pool('worker',1),client=pool('client',1),idpPool=pool('idp',2);
  const tenant=randomUUID(),foreignTenant=randomUUID(),actors=[randomUUID(),randomUUID(),randomUUID(),randomUUID()] as const,foreignActor=randomUUID(),sharePayer=randomUUID();
  const spaces={personal:randomUUID(),group:randomUUID(),share:randomUUID(),foreign:randomUUID(),secondary:randomUUID(),lifecycle:randomUUID(),pending:randomUUID()};
  for(const t of [tenant,foreignTenant])await admin.query('INSERT INTO fabric.tenants(tenant_id) VALUES($1)',[t]);
  for(const actor of actors)await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2::uuid,$2::text)',[tenant,actor]);
  await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2::uuid,$2::text)',[foreignTenant,foreignActor]);
  await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2::uuid,$2::text)',[tenant,sharePayer]);
  const grants=['task:read','task:write','budget:control','storage:read','storage:write','storage:forget','storage:backup','storage:restore','storage:maintenance','storage:share'];
  for(const [kind,s] of Object.entries(spaces)){
   const t=kind==='foreign'?foreignTenant:tenant,ownerActor=kind==='foreign'?foreignActor:actors[0],payer=kind==='foreign'?foreignActor:kind==='share'?sharePayer:actors[3];
   await admin.query("INSERT INTO fabric.spaces(tenant_id,space_id,owner_actor_id,payer_actor_id,data_namespace_id,compute_namespace_id,authority_revision,lifecycle) VALUES($1,$2,$3,$4,$5,$6,1,'active')",[t,s,ownerActor,payer,randomUUID(),randomUUID()]);
   const members=kind==='foreign'?[foreignActor]:kind==='personal'?[actors[0]]:actors.slice(0,3);
   for(const actor of members)await admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4::jsonb)',[t,s,actor,JSON.stringify(actor===actors[2]?['task:read','storage:read']:actor===ownerActor?[...grants,'storage:policy-admin']:grants)]);
  }
  const idp=await launchOwned(resolve(ownerRoot,'g1-storage/tests/helpers/idp-process.js'),'FABRIC_STORAGE_IDP',{dsn:dsn('idp'),subjects:[...actors.slice(0,3),foreignActor]});children.push(idp);
  const endpoints=idp.ready as Record<string,string>,tokens=new Map<string,string>();
  for(const actor of [...actors.slice(0,3),foreignActor]){
   await admin.query("INSERT INTO fabric.identities(issuer,subject,tenant_id,actor_id,principal_kind) VALUES($1,$2,$3,$4,'human')",[endpoints['issuer'],actor,actor===foreignActor?foreignTenant:tenant,actor]);
   const config={issuer:endpoints['issuer']!,jwksUrl:endpoints['jwksUrl']!,tokenEndpoint:endpoints['tokenEndpoint']!,clientId:'storage-test',apiAudience:'storage-api',redirectUri:'http://127.0.0.1/callback'},transaction=beginTestAuthorization(config);
   const auth=await fetch(endpoints['authorizationEndpoint']!,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url'),state:transaction.state,nonce:transaction.nonce,username:actor,password:'synthetic'})});
   demand(auth.status===302,'UNAUTHORIZED');tokens.set(actor,await completeTestAuthorization({...config,...transaction,transaction,callbackUrl:auth.headers.get('location')!}));
  }
  const verifier=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:endpoints['issuer']!,apiAudience:'storage-api',jwksUrl:endpoints['jwksUrl']!}),lookupAuthority:createPostgresAuthorityLookup(authority)});
  const scopeFor=(actor:string=actors[0],space:string=spaces.group)=>verifier.verify({tenantId:actor===foreignActor?foreignTenant:tenant,spaceId:space,sessionCredential:tokens.get(actor)!});
  const scope=await scopeFor(),foundation=new PostgresUnitOfWork(controller),uow=new AuthenticatedUnitOfWork({foundation,bindingFor:verifier.bindingFor}),native=new NativeRepository(uow,verifier.bindingFor),tasks=new PostgresTaskRepository(uow);
  const hashFile=async(file:string)=>'sha256:'+createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
  const pins=VersionPinsSchema.parse({schemaVersion:1,engineDigest:await hashFile('engine/kernel/src/session-loop.ts'),behaviorDigest:await hashFile('g1-model/src/native-repository.ts'),schemaDigest:await hashFile('g1-storage/src/schema.ts'),environmentDigest:await hashFile('g1-storage/scripts/fixture.mjs'),dependencyLockDigest:await hashFile('g1-storage/pnpm-lock.yaml'),checkDefinitionDigest:await hashFile('g1-storage/scripts/check-component.mjs')});
  const department=randomUUID(),common=new Map<string,{ids:string[];leaf:string}>();
  async function hierarchy(s:VerifiedScope){
   const old=common.get(s.spaceId);if(old)return old;const ids:string[]=[];let parent:string|null=null;
   for(const [kind,subject] of [['tenant',s.tenantId],['department',department],['person',s.actorId],['space',s.spaceId]] as const){
    const id=randomUUID();await admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,100000,1)',[s.tenantId,s.spaceId,id,parent,s.payerId,'synthetic-utf8-byte-unit']);
    await admin.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[s.tenantId,s.spaceId,id,kind,subject]);ids.push(id);parent=id;
   }
   await admin.query("INSERT INTO fabric.model_policies VALUES($1,$2,1,true,'[]'::jsonb)",[s.tenantId,s.spaceId]);
   const result={ids,leaf:parent!};common.set(s.spaceId,result);return result;
  }
  async function task(purpose:'ask'|'maintenance'='ask',s:VerifiedScope=scope){
   const h=await hierarchy(s),taskId=randomUUID(),runId=randomUUID(),input={taskId,runId,commandId:randomUUID(),mutationId:randomUUID(),jobId:randomUUID(),eventId:randomUUID(),idempotencyKey:randomUUID(),payloadDigest:'',expectedRevision:0,requirements:{intent:'Ask'}};
   await tasks.create(s,{...input,payloadDigest:commandDigest(input)});
   let parent=h.leaf;const ids=[...h.ids];
   for(const [kind,subject] of [['task',taskId],['run',runId]] as const){const id=randomUUID();await admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,100000,1)',[s.tenantId,s.spaceId,id,parent,s.payerId,'synthetic-utf8-byte-unit']);await admin.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[s.tenantId,s.spaceId,id,kind,subject]);parent=id;ids.push(id);}
   const binding=TaskCallBindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,actorId:s.actorId,payerId:s.payerId,costCenter:'storage-fixture',taskId,runId,parentTaskId:null,sessionId:randomUUID(),purpose:purpose==='ask'?'answer':'maintenance',category:'service',requirementsRevision:1,versions:pins,policyRevision:1,membershipRevision:s.membershipRevision,sourceRevisionDigest:'sha256:'+createHash('sha256').update('empty source set').digest('hex'),cancellationGeneration:0,workerGeneration:0,resourceGeneration:0,intent:'Ask'});
   await admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[s.tenantId,s.spaceId,runId,taskId,s.actorId,s.payerId,department,binding.costCenter,parent,JSON.stringify(binding)]);
   const admission=AdmissionSchema.parse({executionClass:'service',computerCapability:null,maxInputBytes:1024,need:{schemaVersion:1,inputModalities:['text'],outputModalities:['text'],toolDialect:'local-json-v1',schemaDialect:'local-closed-json-v1',streamText:true,streamToolArguments:false,contextBytes:8192,outputCap:32,durationCapMs:1000,usage:true,cancellation:true,privateState:false,optionalFeatures:[],executionClass:'service',runtimeCapabilities:['model-text']},targetEffect:false,approvalRequired:false,resourceId:null,ongoingCharges:[]});
   await native.open(s,runId,admission);return {scope:s,binding,admission,leaf:parent,spaceLeaf:h.leaf,ids,purpose};
  }
  return {fixtureDsn:dsn,admin,controller,authority,worker,client,idpPool,idp,roles,tenant,foreignTenant,actors,foreignActor,sharePayer,spaces,scope,scopeFor,tokens,verifier,uow,foundation,native,task,department,owner,instance,root,ownerRoot,close};
 }catch(e){try{await close();}catch(cleanup){throw new AggregateError([e,cleanup],'Storage fixture creation and cleanup failed');}throw e;}
}
