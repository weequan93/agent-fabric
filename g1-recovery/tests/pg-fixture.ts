import {randomUUID, createHash} from 'node:crypto';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {resolve} from 'node:path';
import pg from 'pg';
import {migrateIdentity} from '../../g1-identity/src/migration.js';
import {createIdentityScopeVerifier} from '../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../g1-identity/src/token-verifier.js';
import {beginTestAuthorization, completeTestAuthorization} from '../../g1-identity/src/test-idp.js';
import {AuthenticatedUnitOfWork, createPostgresAuthorityLookup} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import type {VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository, leaseSchema, type Mutation} from '../src/repository.js';
import {bindingDigest, runSchema, sessionSchema} from '../src/contracts.js';
import {sha} from './fixtures.js';
export async function createRecoveryFixture() {
 const url = process.env.RECOVERY_DATABASE_URL; if (!url) throw new Error('Actual owned PostgreSQL required; no fallback or skips');
 const admin = new pg.Pool({connectionString: url, max: 8, connectionTimeoutMillis: 2000});
 await migrateIdentity(admin, {ownedSyntheticDatabase: true, sqlPath: resolve('../g1-identity/migrations/0003_identity_approvals.sql')});
 const name = 'r_' + randomUUID().replaceAll('-', ''), password = randomUUID();
 const roles = {controller: name+'_c', idp: name+'_i', worker: name+'_w', client: name+'_u'};
 for (const [kind, role] of Object.entries(roles)) {
  await admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
  if (kind !== 'client') await admin.query(`GRANT ${kind === 'controller' ? 'fabric_controller' : kind === 'idp' ? 'fabric_test_idp' : 'fabric_worker'} TO ${role}`);
 }
 const dsn = (role: string) => {const u = new URL(url); u.username = role; u.password = password; return u.href;};
 const controller = new pg.Pool({connectionString: dsn(roles.controller), max: 8}), idp = new pg.Pool({connectionString: dsn(roles.idp), max: 2}), worker = new pg.Pool({connectionString: dsn(roles.worker), max: 1}), client = new pg.Pool({connectionString: dsn(roles.client), max: 1});
 // Scope revalidation occurs while the mutation owns a controller connection.
 // A distinct authority read pool prevents concurrent commands starving their
 // own mandatory revalidation. Capacity increases would only hide the defect.
 const authority = new pg.Pool({connectionString: dsn(roles.controller), max: 8,connectionTimeoutMillis:2000});
 const tenant = randomUUID(), space = randomUUID(), source = randomUUID(), sourceTask = randomUUID(), actors = [randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
 await admin.query('INSERT INTO fabric.tenants(tenant_id) VALUES($1)', [tenant]);
 for (const a of actors) await admin.query('INSERT INTO fabric.actors(tenant_id,actor_id,identity_subject) VALUES($1,$2,$3)', [tenant,a,a]);
 for (const s of [space,source]) {
  await admin.query("INSERT INTO fabric.spaces(tenant_id,space_id,owner_actor_id,payer_actor_id,data_namespace_id,compute_namespace_id,authority_revision,lifecycle) VALUES($1,$2,$3,$4,$5,$6,1,'active')", [tenant,s,actors[0],actors[3],randomUUID(),randomUUID()]);
  for (const a of actors.slice(0,3)) await admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4)', [tenant,s,a,JSON.stringify(['task:read','task:write','approval:approve'])]);
 }
 await admin.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned','{}')",[tenant,source,sourceTask,actors[0]]);
 const child: ChildProcessWithoutNullStreams = spawn(process.execPath,[resolve('scripts/test-idp-process.mjs')],{env:{...process.env,FABRIC_RECOVERY_TEST_IDP:JSON.stringify({clientId:'recovery-test',apiAudience:'recovery-api',redirectUri:'http://127.0.0.1/callback',accessTokenSeconds:600,users:actors.slice(0,3).map(subject=>({subject,password:'synthetic'})),sessionDsn:dsn(roles.idp)})},stdio:['pipe','pipe','pipe']});
 let errors = ''; child.stderr.on('data',d=>errors+=String(d));
 async function close() {
  child.kill('SIGTERM');await new Promise<void>((res,rej)=>{if(child.exitCode!==null||child.signalCode!==null)return res();const timer=setTimeout(()=>{child.kill('SIGKILL');rej(new Error('Owned IdP graceful cleanup deadline'));},2000);child.once('exit',()=>{clearTimeout(timer);res();});});
  await Promise.all([controller.end(),authority.end(),idp.end(),worker.end(),client.end()]);for(const role of Object.values(roles))await admin.query(`DROP ROLE ${role}`);await admin.end();
  console.log(JSON.stringify({measurement:'recovery-owned-idp-cleanup',pid:child.pid,removed:true,realCredentials:false}));
 }
 try {
 const endpoints = await new Promise<Record<string,string>>((res,rej)=>{
  let raw='';const timer=setTimeout(()=>rej(new Error('Owned IdP readiness timeout '+errors)),5000);
  child.once('error',e=>{clearTimeout(timer);rej(e);});child.once('exit',()=>{clearTimeout(timer);rej(new Error('IdP exited '+errors));});
  child.stdout.on('data',d=>{raw+=String(d);if(raw.includes('\n')){clearTimeout(timer);try{res(JSON.parse(raw.split('\n')[0]!));}catch(e){rej(e);}}});
 });
 for (const a of actors.slice(0,3)) await admin.query("INSERT INTO fabric.identities(issuer,subject,tenant_id,actor_id,principal_kind) VALUES($1,$2,$3,$4,'human')",[endpoints.issuer,a,tenant,a]);
 const tokens: string[]=[];
 for (const subject of actors.slice(0,3)) {
  const config = {issuer:endpoints.issuer!,jwksUrl:endpoints.jwksUrl!,tokenEndpoint:endpoints.tokenEndpoint!,clientId:'recovery-test',apiAudience:'recovery-api',redirectUri:'http://127.0.0.1/callback'};
  const transaction = beginTestAuthorization(config);
  const auth = await fetch(endpoints.authorizationEndpoint!,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url'),state:transaction.state,nonce:transaction.nonce,username:subject,password:'synthetic'})});
  if (auth.status!==302) throw new Error('Actual test IdP authorization failed');
  tokens.push(await completeTestAuthorization({...config,callbackUrl:auth.headers.get('location')!,...transaction,transaction}));
 }
 const lookup = createPostgresAuthorityLookup(authority);
 const scopes = createIdentityScopeVerifier({verifyToken: token=>verifyAccessToken(token,{issuer:endpoints.issuer!,apiAudience:'recovery-api',jwksUrl:endpoints.jwksUrl!}),lookupAuthority:lookup});
 const scopeFor = (index:number,s=space) => scopes.verify({tenantId:tenant,spaceId:s,sessionCredential:tokens[index]!});
 const issued = await Promise.all([0,1,2].map(i=>scopeFor(i))) as [VerifiedScope,VerifiedScope,VerifiedScope];
 const foundation = new PostgresUnitOfWork(controller), bindingFor = (scope:VerifiedScope)=>scopes.bindingFor(scope);
 const uow = new AuthenticatedUnitOfWork({foundation,bindingFor}), repo = new RecoveryRepository(uow,bindingFor);
 async function seedRun(scope=issued[1],existingTask?:{taskId:string;attempt:number;cancellationGeneration:number}) {
  const taskId=existingTask?.taskId??randomUUID(),runId=randomUUID(),reservationId=randomUUID(),leaseId=randomUUID();
  if(!existingTask)await admin.query("INSERT INTO fabric.tasks(tenant_id,space_id,task_id,actor_id,revision,state,requirements) VALUES($1,$2,$3,$4,1,'planned',$5)",[tenant,space,taskId,scope.actorId,JSON.stringify({intent:'act'})]);
  await admin.query("INSERT INTO fabric.runs(tenant_id,space_id,run_id,task_id,attempt,requirement_revision,version_pins,generation,state) VALUES($1,$2,$3,$4,$5,1,'{}',1,'planned')",[tenant,space,runId,taskId,existingTask?.attempt??1]);
  const allowance=randomUUID();await admin.query("INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,payer_actor_id,currency,ceiling,reserved,revision) VALUES($1,$2,$3,$4,'synthetic',100,50,1)",[tenant,space,allowance,actors[3]]);
  await admin.query("INSERT INTO fabric.budget_reservations(tenant_id,space_id,reservation_id,allowance_id,actor_id,run_id,idempotency_key,amount,state) VALUES($1,$2,$3,$4,$5,$6,$7,50,'active')",[tenant,space,reservationId,allowance,scope.actorId,runId,randomUUID()]);
  const binding={task:{tenantId:tenant,spaceId:space,taskId},runId,requirementsRevision:1,engineVersion:'g1-recovery/0.0.1',behaviorVersion:'test/1',schemaVersion:1,environmentDigest:sha(1),dependencyLockDigest:sha(2)},generation={cancellation:existingTask?.cancellationGeneration??0,worker:1,resource:0};
  const run=runSchema.parse({binding,revision:1,generation,state:'preparing',wait:null,outcomeDigest:null});
  const session=sessionSchema.parse({binding,sessionId:randomUUID(),generation,role:'lead',modelProfile:'synthetic',toolProfile:'proposal-only',contextDigest:sha(3),budgetReservationId:reservationId,cursor:0,state:'ready',adapter:'deterministic-test-only'});
  const lease=leaseSchema.parse({leaseId,binding,generation,expiresAt:new Date(Date.now()+60000).toISOString(),revokedAt:null});
  const value={run,session,lease};return {value,allowance,reservationId,taskId,runId,init:mutation(runId,0,value)};
 }
 function mutation(runId:string,expectedRevision:number,payload:unknown,expiresAt=new Date(Date.now()+60000).toISOString()):Mutation {return {commandId:randomUUID(),key:randomUUID(),runId,expectedRevision,payloadDigest:bindingDigest(payload),expiresAt};}
 return {admin,controller,idp,worker,client,dsn:dsn(roles.controller),tenant,space,source,sourceTask,actors,endpoints,tokens,scopeFor,issued,bindingFor,uow,foundation,repo,seedRun,mutation,close};
 } catch (error) {
  try {await close();} catch (cleanupError) {throw new AggregateError([error, cleanupError], 'Recovery fixture creation and cleanup failed');}
  throw error;
 }
}
