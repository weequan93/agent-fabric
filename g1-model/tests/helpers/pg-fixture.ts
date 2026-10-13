import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { migrateIdentity } from '../../../g1-identity/src/migration.js';
import { createIdentityScopeVerifier } from '../../../g1-identity/src/current-authority.js';
import { verifyAccessToken } from '../../../g1-identity/src/token-verifier.js';
import { beginTestAuthorization, completeTestAuthorization } from '../../../g1-identity/src/test-idp.js';
import { AuthenticatedUnitOfWork, createPostgresAuthorityLookup } from '../../../g1-identity/src/authenticated-uow.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { migrateReceipts } from '../../src/receipt-migration.js';
import { LocalAdapterClient, type Hook, type Schedule, DEFAULT_SCHEDULE } from '../../src/test-adapter.js';
import { OriginalCallSchema, OperatingProfileSchema } from '../../src/schema.js';
import { demand } from '../../src/errors.js';
import type { OperatingProfile, OriginalCall } from '../../src/contracts.js';
import { profileFixture } from './contract-fixtures.js';
import { launchOwned, stopOwned, control, waitUntil, type OwnedProcess } from './process-fixture.js';

export async function createModelFixture(profile:OperatingProfile=profileFixture(),computerGrant=false){
 const url=process.env['MODEL_DATABASE_URL'],fixtureOwner=process.env['MODEL_FIXTURE_OWNER'],root=process.env['MODEL_REPO_ROOT'];demand(url&&fixtureOwner&&root,'AUTHORITY_UNAVAILABLE');
 const target=new URL(url);demand(target.hostname==='127.0.0.1' && target.pathname==='/model_test');
 const admin=new pg.Pool({connectionString:url,max:8,connectionTimeoutMillis:2000});
 const pools:pg.Pool[]=[admin],children:OwnedProcess[]=[];let closed=false;
 async function close(){if(closed)return;closed=true;const results=await Promise.allSettled(children.map(p=>stopOwned(p)));const ended=await Promise.allSettled(pools.map(p=>p.end()));const failures=[...results,...ended].filter(r=>r.status==='rejected');if(failures.length)throw new AggregateError(failures.map(r=>(r as PromiseRejectedResult).reason),'Fixture cleanup failed');}
 try{
  demand((await admin.query('SELECT owner FROM public.fabric_model_fixture')).rows[0]?.owner===fixtureOwner,'CLEANUP_UNPROVEN');
  await migrateIdentity(admin,{ownedSyntheticDatabase:true,sqlPath:resolve(root,'g1-identity/migrations/0003_identity_approvals.sql')});
  await migrateReceipts(admin,{ownedSyntheticDatabase:true,owner:fixtureOwner,root});
  const prefix='m_'+randomUUID().replaceAll('-','');
  const roles={controller:prefix+'_controller',authority:prefix+'_authority',worker:prefix+'_worker',client:prefix+'_client',idp:prefix+'_idp',receipt:prefix+'_receipt'};
  const passwords=new Map<string,string>();
  const ownerId=randomUUID(),transportToken=randomUUID();
  for(const [kind,role]of Object.entries(roles)){
   const password=randomUUID();passwords.set(role,password);
   await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
   const inherited=kind==='controller'||kind==='authority'?'fabric_controller':kind==='worker'?'fabric_worker':kind==='idp'?'fabric_test_idp':kind==='receipt'?'fabric_model_receipt_owner':null;
   if(inherited)await admin.query(`GRANT ${inherited} TO ${role}`);
  }
  await admin.query('INSERT INTO model_receipts.access(login_name,owner_id) VALUES($1,$2)',[roles.receipt,ownerId]);
  const dsn=(role:string)=>{const u=new URL(url);u.username=role;u.password=passwords.get(role)!;return u.href;};
  const pool=(role:string,max:number)=>{const p=new pg.Pool({connectionString:dsn(role),max,connectionTimeoutMillis:2000});pools.push(p);return p;};
  const controller=pool(roles.controller,8),authority=pool(roles.authority,8),worker=pool(roles.worker,1),client=pool(roles.client,1),receiptOwner=pool(roles.receipt,2),idpPool=pool(roles.idp,2);
  const tenant=randomUUID(),foreignTenant=randomUUID(),space=randomUUID(),otherSpace=randomUUID(),foreignSpace=randomUUID();
  const actors=[randomUUID(),randomUUID(),randomUUID(),randomUUID()] as const,foreignActor=randomUUID();
  for(const t of [tenant,foreignTenant])await admin.query('INSERT INTO fabric.tenants(tenant_id) VALUES($1)',[t]);
  for(const actor of actors)await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2::uuid,$2::text)',[tenant,actor]);
  await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2::uuid,$2::text)',[foreignTenant,foreignActor]);
  for(const [t,s,owner,payer]of [[tenant,space,actors[0],actors[3]],[tenant,otherSpace,actors[0],actors[3]],[foreignTenant,foreignSpace,foreignActor,foreignActor]]){
   await admin.query("INSERT INTO fabric.spaces(tenant_id,space_id,owner_actor_id,payer_actor_id,data_namespace_id,compute_namespace_id,authority_revision,lifecycle) VALUES($1,$2,$3,$4,$5,$6,1,'active')",[t,s,owner,payer,randomUUID(),randomUUID()]);
   for(const actor of t===tenant?actors.slice(0,3):[foreignActor])await admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4)',[t,s,actor,JSON.stringify(actor===actors[2]?['task:read']:actor===actors[0]?['task:read','task:write','budget:control','approval:approve']:['task:read','task:write',...(computerGrant?['computer:use']:[])])]);
  }
  const cache=resolve(root,'g1-model/node_modules/.cache/model-build/g1-model');
  const idp=await launchOwned(resolve(cache,'tests/helpers/idp-process.js'),'FABRIC_MODEL_IDP',{dsn:dsn(roles.idp),subjects:actors.slice(0,3)});children.push(idp);
  const endpoints=idp.ready as Record<string,string>;
  for(const actor of actors.slice(0,3))await admin.query("INSERT INTO fabric.identities(issuer,subject,tenant_id,actor_id,principal_kind) VALUES($1,$2,$3,$4,'human')",[endpoints['issuer'],actor,tenant,actor]);
  const tokens:string[]=[];
  for(const subject of actors.slice(0,3)){
   const config={issuer:endpoints['issuer']!,jwksUrl:endpoints['jwksUrl']!,tokenEndpoint:endpoints['tokenEndpoint']!,clientId:'model-test',apiAudience:'model-api',redirectUri:'http://127.0.0.1/callback'};
   const transaction=beginTestAuthorization(config);
   const auth=await fetch(endpoints['authorizationEndpoint']!,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url'),state:transaction.state,nonce:transaction.nonce,username:subject,password:'synthetic'})});
   demand(auth.status===302,'UNAUTHORIZED');tokens.push(await completeTestAuthorization({...config,...transaction,transaction,callbackUrl:auth.headers.get('location')!}));
  }
  const scopes=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{issuer:endpoints['issuer']!,apiAudience:'model-api',jwksUrl:endpoints['jwksUrl']!}),lookupAuthority:createPostgresAuthorityLookup(authority)});
  const scopeFor=(index=1,s:string=space)=>scopes.verify({tenantId:tenant,spaceId:s,sessionCredential:tokens[index]!});
  const issued=await Promise.all([0,1,2].map(i=>scopeFor(i)));
  const bindingFor=scopes.bindingFor.bind(scopes),foundation=new PostgresUnitOfWork(controller),uow=new AuthenticatedUnitOfWork({foundation,bindingFor});
  let adapter:OwnedProcess;
  async function startAdapter(){adapter=await launchOwned(resolve(cache,'src/test-adapter-process.js'),'FABRIC_MODEL_ADAPTER',{dsn:dsn(roles.receipt),ownerId,token:transportToken,profile});children.push(adapter);demand(adapter.ready['ownerId']===ownerId);return new LocalAdapterClient(String(adapter.ready['url']),transportToken,ownerId);}
  let adapterClient=await startAdapter();
  const original=()=>OriginalCallSchema.parse({tenantId:tenant,spaceId:space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID(),requestDigest:'sha256:'+'0'.repeat(64)});
  const counters=async()=>Object.fromEntries((await admin.query('SELECT kind,count FROM model_receipts.counters WHERE owner_id=$1',[ownerId])).rows.map(r=>[r.kind,Number(r.count)])) as Record<string,number>;
  const journal=async(o:OriginalCall)=>(await admin.query('SELECT * FROM model_receipts.journal WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5',[ownerId,o.tenantId,o.spaceId,o.operationId,o.attemptId])).rows[0];
  async function arm(hook:Hook){await control(adapter,{kind:'arm',hook});}
  async function reached(hook:Hook,o:OriginalCall){await waitUntil(async()=>adapter.messages.some(m=>m['kind']==='barrier-hit'&&m['hook']===hook&&(m['original'] as OriginalCall)?.attemptId===o.attemptId),'verified '+hook+' barrier');}
  async function release(hook:Hook){await control(adapter,{kind:'release',hook});}
  async function schedule(o:OriginalCall,config:Partial<Schedule>={},dropAck=false){await control(adapter,{kind:'schedule',original:o,schedule:{...DEFAULT_SCHEDULE,...config},dropAck});}
  async function finalize(o:OriginalCall){await control(adapter,{kind:'finalize',original:o});}
  async function restart(signal:'SIGTERM'|'SIGKILL'='SIGKILL'){await stopOwned(adapter,signal);adapterClient=await startAdapter();return adapterClient;}
  /** Each exact-profile channel has its own restricted receipt owner. It cannot
   * observe another channel's journal, even when both use the same route. */
  async function additionalAdapter(input:OperatingProfile){
   const extraProfile=OperatingProfileSchema.parse(input),extraOwnerId=randomUUID(),role='m_'+randomUUID().replaceAll('-','')+'_receipt',password=randomUUID();
   passwords.set(role,password);
   await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
   await admin.query(`GRANT fabric_model_receipt_owner TO ${role}`);
   await admin.query('INSERT INTO model_receipts.access(login_name,owner_id) VALUES($1,$2)',[role,extraOwnerId]);
   let process:OwnedProcess;
   const start=async()=>{process=await launchOwned(resolve(cache,'src/test-adapter-process.js'),'FABRIC_MODEL_ADAPTER',{dsn:dsn(role),ownerId:extraOwnerId,token:transportToken,profile:extraProfile});children.push(process);demand(process.ready['ownerId']===extraOwnerId);return new LocalAdapterClient(String(process.ready['url']),transportToken,extraOwnerId);};
   let client=await start();
   const journalExtra=async(o:OriginalCall)=>(await admin.query('SELECT * FROM model_receipts.journal WHERE owner_id=$1 AND tenant_id=$2 AND space_id=$3 AND operation_id=$4 AND attempt_id=$5',[extraOwnerId,o.tenantId,o.spaceId,o.operationId,o.attemptId])).rows[0];
   const countersExtra=async()=>Object.fromEntries((await admin.query('SELECT kind,count FROM model_receipts.counters WHERE owner_id=$1',[extraOwnerId])).rows.map(r=>[r.kind,Number(r.count)])) as Record<string,number>;
   return {profile:extraProfile,ownerId:extraOwnerId,process:()=>process,url:()=>String(process.ready['url']),client:()=>client,
    arm:async(hook:Hook)=>control(process,{kind:'arm',hook}),release:async(hook:Hook)=>control(process,{kind:'release',hook}),
    reached:async(hook:Hook,o:OriginalCall)=>waitUntil(async()=>process.messages.some(m=>m['kind']==='barrier-hit'&&m['hook']===hook&&(m['original'] as OriginalCall)?.attemptId===o.attemptId),'additional '+hook+' barrier'),
    schedule:async(o:OriginalCall,config:Partial<Schedule>={},dropAck=false)=>control(process,{kind:'schedule',original:o,schedule:{...DEFAULT_SCHEDULE,...config},dropAck}),
    finalize:async(o:OriginalCall)=>control(process,{kind:'finalize',original:o}),journal:journalExtra,counters:countersExtra,
    restart:async()=>{await stopOwned(process,'SIGKILL');client=await start();return client;},
    postgresVersion:async()=>String((await admin.query('SELECT version() AS v')).rows[0].v)};
  }
  return {admin,controller,authority,worker,client,receiptOwner,idpPool,roles,tenant,foreignTenant,space,otherSpace,foreignSpace,actors,foreignActor,ownerId,fixtureOwner,root,profile,issued,scopeFor,tokens,endpoints,bindingFor,foundation,uow,
   fixtureDsn:(kind:keyof typeof roles)=>dsn(roles[kind]),
   adapter:()=>adapter,adapterClient:()=>adapterClient,adapterUrl:()=>String(adapter.ready['url']),transportToken,original,counters,journal,arm,reached,release,schedule,finalize,restart,additionalAdapter,close};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Fixture creation and cleanup failed');}throw error;}
}
