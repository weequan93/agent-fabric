import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import { beginTestAuthorization,completeTestAuthorization } from '../../../g1-identity/src/test-idp.js';
import type { PoolClient } from 'pg';
import { createNativeFixture } from './native-fixture.js';
import { journey } from './profile-context-journey.js';
import { waitUntil } from './process-fixture.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { composeNative } from '../../src/native-runtime.js';
import { NativeRepository } from '../../src/native-repository.js';
import { NativeSession } from '../../src/native-session.js';
import { ModelRepository,type RepositoryHooks,type PrepareInput } from '../../src/model-repository.js';
import { UsageRepository,type UsageHooks } from '../../src/usage-repository.js';
import { ModelService,type InstalledAdapter } from '../../src/model-service.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { ModelError,safeFailure } from '../../src/errors.js';
import type { AsyncUnitOfWork,OriginalCall,VerifiedScope,SqlTransaction } from '../../src/contracts.js';

type Fixture=Awaited<ReturnType<typeof createNativeFixture>>;
type Boundary='prepare'|'claim'|'resume'|'switch'|'top-up';
const boundaries:readonly Boundary[]=['prepare','claim','resume','switch','top-up'];
const expiry=()=>new Date(Date.now()+60_000).toISOString();
const safe=(e:unknown)=>{const r=safeFailure(e);assert.equal(r.status,'refused');assert.equal(r.replayAllowed,false);assert.equal(r.recovery,'inspect-current-authority');return true;};
function composition(n:Fixture,uow:AsyncUnitOfWork=n.f.uow,hooks:UsageHooks={}){
 const models=new ModelService(new ModelRepository(uow,n.native.models.model.authority,hooks),new UsageRepository(uow,n.native.models.usage.authority,hooks),[n.installed()]);
 const repository=new NativeRepository(uow,n.f.bindingFor,hooks);
 return {models,session:new NativeSession(repository,models,n.native.ports)};
}
async function preparedInput(n:Fixture,a:Awaited<ReturnType<Fixture['task']>>):Promise<PrepareInput>{
 const initial=await a.makeInput(),s=await n.native.repository.snapshot(a.scope,a.sessionId),request=await n.native.context.encode(a.scope,s,n.profile,'late authority',initial.request.original);
 return {...initial,request,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2}};
}
async function boundary(n:Fixture,kind:Boundary,uow:AsyncUnitOfWork=n.f.uow,hooks:UsageHooks={}){
 const a=await n.task({approval:kind==='resume'}),scope=kind==='top-up'?await n.f.scopeFor(0):a.scope,c=composition(n,uow,hooks);
 if(kind==='prepare'||kind==='claim'){
  const input=await preparedInput(n,a);if(kind==='claim')await n.native.models.prepare(scope,input);
  return {a,scope,key:input.command.key,invoke:()=>kind==='prepare'?c.models.prepare(scope,input):c.models.model.claim(scope,input.request.original.attemptId)};
 }
 if(kind==='resume'){
  const wait=await n.native.session.requestTurn(scope,{...await n.command(a.sessionId),input:'approval checkpoint',choice:null});assert.equal(wait.view.wait?.reason,'approval');n.approved.add(a.sessionId);
  const command={...await n.command(a.sessionId),inputLimitBytes:8};return {a,scope,key:command.key,invoke:()=>c.session.resume(scope,command)};
 }
 if(kind==='switch'){
  const command={...await n.command(a.sessionId),choice:{schemaVersion:1 as const,pin:n.profile.profileId,preference:'Balanced' as const,allowEquivalentFallback:false}};
  return {a,scope,key:command.key,invoke:()=>c.session.switchProfile(scope,command)};
 }
 const command={sessionId:a.sessionId,key:randomUUID(),expiresAt:expiry(),allowanceId:a.leaf,expectedAllowanceRevision:1,addedUnits:7};
 return {a,scope,key:command.key,invoke:()=>c.session.topUp(scope,command)};
}
async function blocked(n:Fixture,blocker:number,label:string){
 let rows:Record<string,unknown>[]=[];
 await waitUntil(async()=>{rows=(await n.f.admin.query("SELECT pid,usename,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE usename=ANY($1::text[]) AND wait_event_type='Lock' AND $2=ANY(pg_blocking_pids(pid))",[[n.f.roles.controller,n.f.roles.authority],blocker])).rows;return rows.length>0;},label);
 assert.ok(rows.every(r=>r['wait_event_type']==='Lock'&&(r['blockers'] as number[]).includes(blocker)));
 console.log(JSON.stringify({measurement:'authority-real-blocker',label,blocker,rows}));return rows;
}
const variants=['identity','session','actor','member','grant','membership-revision','payer','Space-archived','Space-deleted','Space-suspended'] as const;
type Variant=typeof variants[number];
async function mutate(n:Fixture,tx:Pick<PoolClient,'query'>,variant:Variant,index=1){
 const f=n.f,id=f.bindingFor(f.issued[index]!);
 if(variant==='identity')await tx.query('UPDATE fabric.identities SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2',[id.issuer,id.subject]);
 else if(variant==='session')await tx.query('UPDATE fabric.identity_sessions SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2 AND sid=$3',[id.issuer,id.subject,id.sessionId]);
 else if(variant==='actor'||variant==='payer')await tx.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,variant==='payer'?f.actors[3]:f.actors[index]]);
 else if(variant==='member')await tx.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[index]]);
 else if(variant==='grant')await tx.query("UPDATE fabric.memberships SET grants='[\"task:read\"]'::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[f.tenant,f.space,f.actors[index]]);
 else if(variant==='membership-revision')await tx.query('UPDATE fabric.memberships SET revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[index]]);
 else await tx.query('UPDATE fabric.spaces SET lifecycle=$3,authority_revision=authority_revision+1 WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space,variant.slice(6)]);
}
async function monotonicRace(t:TestContext,variant:Variant){
 const n=await createNativeFixture();t.after(n.close);
 // Fresh valid controls prove each operation reaches its own real implementation.
 for(const kind of boundaries){const a=await boundary(n,kind);assert.ok(await a.invoke());}
 const calls:Awaited<ReturnType<typeof boundary>>[]=[];for(const kind of boundaries)calls.push(await boundary(n,kind));
 const snap=await n.snapshot(),counts=await n.f.counters(),block=await n.f.admin.connect();
 try{
  await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await mutate(n,block,variant);
  if(!variant.startsWith('Space-')&&variant!=='payer')await mutate(n,block,variant,0);
  const pending=calls.map(c=>c.invoke().then(value=>({value}),error=>({error})));await blocked(n,blocker,'all-boundaries/'+variant);
  await block.query('COMMIT');
  const outcomes=await Promise.all(pending);for(let i=0;i<outcomes.length;i++){const outcome=outcomes[i]!;assert.ok('error' in outcome,'Unauthorized '+boundaries[i]+' completed');safe('error' in outcome?outcome.error:null);}
  assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);
  // Original payer/billing records and prepared claim reservation are unchanged.
  for(const c of calls){const row=(await n.f.admin.query('SELECT record FROM fabric.model_billing_bindings WHERE run_id=$1',[c.a.binding.runId])).rows[0];assert.deepEqual(row.record,c.a.binding);}
 }finally{await block.query('ROLLBACK');block.release();}
}

async function expireAfterLaterLock(sub:TestContext,kind:Boundary){
  const n=await createNativeFixture();sub.after(n.close);const valid=await boundary(n,kind);assert.ok(await valid.invoke());
  let now=Date.now()/1000,reached=false;
  const uow=new AuthenticatedUnitOfWork({foundation:n.f.foundation,bindingFor:n.f.bindingFor,now:()=>now});
  const block=await n.f.admin.connect(),lock='A02-late-lock/'+randomUUID();
  try{
   await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
   const hooks:RepositoryHooks={async afterStage(stage,tx){if(stage!=='audit')return;reached=true;await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);}};
   const c=await boundary(n,kind,uow,hooks),snap=await n.snapshot(),counts=await n.f.counters(),pending=c.invoke().then(value=>({value}),error=>({error}));
   await blocked(n,blocker,kind+'/post-audit');assert.ok(reached);now=n.f.bindingFor(c.scope).tokenExpiresAt;
   await block.query('COMMIT');const outcome=await pending;assert.ok('error' in outcome);assert.equal('error' in outcome?(outcome.error as {code:string}).code:null,'STALE_IDENTITY');
   assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);
  }finally{await block.query('ROLLBACK');block.release();}

}

/** Test-only installed resource owner. Durable row, owner-only writes, scoped
 * restricted lookup and a genuine row lock; no default remote quarantine route. */
async function resourceAuthority(n:Fixture){
 const suffix=randomUUID().replaceAll('-',''),table='authority_resource_'+suffix,lookup=table+'_lookup',name='public.'+table;
 await n.f.admin.query('CREATE TABLE '+name+'(tenant_id uuid NOT NULL,space_id uuid NOT NULL,revision bigint NOT NULL,quarantined boolean NOT NULL,PRIMARY KEY(tenant_id,space_id)); REVOKE ALL ON '+name+' FROM PUBLIC; ALTER TABLE '+name+' ENABLE ROW LEVEL SECURITY; ALTER TABLE '+name+' FORCE ROW LEVEL SECURITY');
 await n.f.admin.query('INSERT INTO '+name+' VALUES($1,$2,1,false)',[n.f.tenant,n.f.space]);
 await n.f.admin.query('CREATE FUNCTION public.'+lookup+"() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$ DECLARE r record;BEGIN SELECT * INTO r FROM "+name+" WHERE tenant_id=fabric.current_tenant() AND space_id=fabric.current_space() FOR SHARE;IF NOT FOUND THEN RETURN NULL;END IF;RETURN jsonb_build_object('revision',r.revision,'quarantined',r.quarantined);END $$");
 await n.f.admin.query('REVOKE ALL ON FUNCTION public.'+lookup+'() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.'+lookup+'() TO '+n.f.roles.controller);
 let reads=0;
 const guard=async(tx:SqlTransaction)=>{reads++;const row=(await tx.query('SELECT public.'+lookup+'() AS authority')).rows[0]?.['authority'] as {revision:number;quarantined:boolean}|null;assert.ok(row);if(row.quarantined)throw new ModelError('STALE_FENCE');};
 // Install the actual shipped composition's pure current owner dependency.
 // Direct prepare/claim and native resume/switch use that same dependency;
 // the test adds no alternate authorization wrapper around those paths.
 const runtime=composeNative({uow:n.f.uow,bindingFor:n.f.bindingFor,pins:n.pins,profile:n.profile,profiles:n.profiles,adapter:n.f.adapterClient(),descriptors:n.descriptors,
  admission:async(tx,scope,s)=>{await guard(tx);return n.native.ports.admission(tx,scope,s);}});
 return {name,fixture:{...n,native:runtime},reads:()=>reads};
}
async function quarantineCases(t:TestContext){
 for(const kind of ['prepare','claim','resume','switch'] as const)await t.test(kind+'/installed-synthetic-resource-quarantine-real-owner-row-lock',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const resource=await resourceAuthority(n),valid=await boundary(resource.fixture,kind);assert.ok(await valid.invoke());assert.ok(resource.reads()>0);
  await assert.rejects(n.f.controller.query('SELECT * FROM '+resource.name),e=>(e as {code:string}).code==='42501');
  const c=await boundary(resource.fixture,kind),snap=await n.snapshot(),counts=await n.f.counters(),block=await n.f.admin.connect();
  try{
   await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('UPDATE '+resource.name+' SET quarantined=true,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2',[n.f.tenant,n.f.space]);
   const pending=c.invoke().then(value=>({value}),error=>({error}));await blocked(n,blocker,kind+'/synthetic-resource-owner');await block.query('COMMIT');const denied=await pending;assert.ok('error' in denied);assert.equal('error' in denied?(denied.error as {code:string}).code:null,'STALE_FENCE');assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);
   const before=resource.reads();await assert.rejects(c.invoke(),e=>(e as {code:string}).code==='STALE_FENCE');assert.ok(resource.reads()>before);assert.deepEqual(await n.snapshot(),snap);
   const row=(await n.f.admin.query('SELECT revision,quarantined FROM '+resource.name)).rows[0];assert.equal(row.revision,'2');assert.equal(row.quarantined,true);
   console.log(JSON.stringify({measurement:'installed-resource-quarantine',boundary:kind,owner:'PostgreSQL synthetic scoped authority',revision:2,realResourceQuarantine:'unqualified'}));
  }finally{await block.query('ROLLBACK');block.release();}
 });
 await t.test('installed-synthetic-quarantine-safe-top-up-grants-no-resource-resume',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const resource=await resourceAuthority(n),a=await n.task({approval:true});assert.equal((await n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'held checkpoint',choice:null})).view.wait?.reason,'approval');n.approved.add(a.sessionId);const command={...await n.command(a.sessionId),inputLimitBytes:8},c=composition(resource.fixture),counts=await n.f.counters();
  await n.f.admin.query('UPDATE '+resource.name+' SET quarantined=true,revision=revision+1');
  assert.equal((await n.native.session.topUp(await n.f.scopeFor(0),{sessionId:a.sessionId,key:randomUUID(),expiresAt:expiry(),allowanceId:a.leaf,expectedAllowanceRevision:1,addedUnits:8})).autoResumed,false);const snap=await n.snapshot();await assert.rejects(c.session.resume(a.scope,command),e=>(e as {code:string}).code==='STALE_FENCE');assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);assert.equal((await n.native.session.inspect(a.scope,a.sessionId)).wait?.reason,'approval');
 });
}

/** A02: real F02 scopes/PG locks, with per-variant fixture identities. No monotonic
 * revocation is undone, and every negative has a fresh valid control first. */
export async function authorityLateBoundaryCases(t:TestContext):Promise<void>{
 await quarantineCases(t);
 for(const variant of variants)await t.test('prepare-claim-resume-switch-top-up/committed-'+variant,sub=>monotonicRace(sub,variant));
 for(const kind of boundaries)await t.test(kind+'/token-expiry-after-later-lock-and-real-partial-writes',sub=>expireAfterLaterLock(sub,kind));
 for(const kind of boundaries)await t.test(kind+'/real-IdP-session-expiry-after-later-lock',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const valid=await boundary(n,kind);assert.ok(await valid.invoke());let reached=false;
  const block=await n.f.admin.connect(),lock='A02-real-session/'+randomUUID();
  try{
   await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
   const hooks:RepositoryHooks={async afterStage(stage,tx){if(stage==='audit'){reached=true;await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);}}};
   const c=await boundary(n,kind,n.f.uow,hooks),identity=n.f.bindingFor(c.scope);
   await n.f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '750 milliseconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[identity.issuer,identity.subject,identity.sessionId]);
   const snap=await n.snapshot(),counts=await n.f.counters(),pending=c.invoke().then(value=>({value}),error=>({error}));await blocked(n,blocker,kind+'/real-session-post-audit');assert.ok(reached);
   await waitUntil(async()=>(await n.f.admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 AND sid=$3',[identity.issuer,identity.subject,identity.sessionId])).rows[0].expired,'real persisted IdP session expires while sensitive transaction waits');
   await block.query('COMMIT');const outcome=await pending;assert.ok('error' in outcome);safe('error' in outcome?outcome.error:null);assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);
  }finally{await block.query('ROLLBACK');block.release();}
 });
 for(const kind of boundaries)for(const fault of ['authority-outage','required-audit-failure'] as const)await t.test(kind+'/'+fault+'/atomic-rollback',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const valid=await boundary(n,kind);assert.ok(await valid.invoke());let reached=false,unavailable=false,requiredLookupReached=false;
  const hooks:RepositoryHooks={async afterStage(stage,tx){if(stage!=='audit')return;reached=true;assert.ok((await tx.query('SELECT count(*)::int AS n FROM fabric.model_audit')).rows[0]?.['n']);if(fault==='authority-outage')unavailable=true;}};
  const uow:AsyncUnitOfWork={withScope(scope,work){return n.f.uow.withScope(scope,tx=>work({query:async(sql,values=[])=>{if(unavailable&&sql.includes('fabric.controller_authority')){requiredLookupReached=true;throw new ModelError('AUTHORITY_UNAVAILABLE');}return tx.query(sql,values);}}));}};
  const c=await boundary(n,kind,uow,hooks);
  if(fault==='required-audit-failure'){
   // A real database audit INSERT fails, after the sensitive earlier writes.
   // The trigger is scoped to this unique disposable tenant; existing rows/checks remain intact.
   const suffix=randomUUID().replaceAll('-',''),name='authority_audit_fault_'+suffix;
   await n.f.admin.query('CREATE FUNCTION public.'+name+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+n.f.tenant+"'::uuid THEN RAISE EXCEPTION 'synthetic required audit unavailable' USING ERRCODE='P0001';END IF;RETURN NEW;END $$");
   await n.f.admin.query('CREATE TRIGGER '+name+' BEFORE INSERT ON fabric.model_audit FOR EACH ROW EXECUTE FUNCTION public.'+name+'()');
  }
  const snap=await n.snapshot(),counts=await n.f.counters();await assert.rejects(c.invoke(),e=>{if(fault==='required-audit-failure')assert.equal((e as {code?:string}).code,'P0001');return safe(e);});assert.equal(reached,fault==='authority-outage');assert.equal(requiredLookupReached,fault==='authority-outage');assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);
 });
 for(const kind of ['prepare','claim','resume','switch'] as const)for(const variant of ['policy','source'] as const)await t.test(kind+'/late-'+variant+'/rollback-and-current-counterpart',async sub=>{
  if(variant==='policy'){
   const n=await createNativeFixture();sub.after(n.close);const valid=await boundary(n,kind);assert.ok(await valid.invoke());const c=await boundary(n,kind),snap=await n.snapshot(),counts=await n.f.counters(),block=await n.f.admin.connect();
   const withoutPolicy=(state:Record<string,unknown>)=>{const {model_policies:_policy,...accounting}=state;return accounting;};
   try{
    await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('UPDATE fabric.model_policies SET revision=revision+1 WHERE tenant_id=$1 AND space_id=$2',[n.f.tenant,n.f.space]);
    const pending=c.invoke().then(value=>({value}),error=>({error}));await blocked(n,blocker,kind+'/current-policy-row');await block.query('COMMIT');const denied=await pending;assert.ok('error' in denied);safe('error' in denied?denied.error:null);assert.deepEqual(withoutPolicy(await n.snapshot()),withoutPolicy(snap));assert.deepEqual(await n.f.counters(),counts);assert.equal(Number((await n.f.admin.query('SELECT revision FROM fabric.model_policies WHERE tenant_id=$1 AND space_id=$2',[n.f.tenant,n.f.space])).rows[0].revision),2);
   }finally{await block.query('ROLLBACK');block.release();}
   return;
  }
  const n=await createNativeFixture();sub.after(n.close);const valid=await boundary(n,kind);assert.ok(await valid.invoke());let reached=false;
  const block=await n.f.admin.connect(),lock='A02-late-current/'+randomUUID();
  try{
   await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
   const hooks:RepositoryHooks={async afterStage(stage,tx){if(stage!=='audit')return;reached=true;{const revision=Number((await tx.query('UPDATE fabric.tasks SET revision=revision+1 WHERE task_id=$1 RETURNING revision',[n.source.binding.taskId])).rows[0]?.['revision']);assert.equal(revision,n.descriptor.revision+1);}await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);}};
   const c=await boundary(n,kind,n.f.uow,hooks),snap=await n.snapshot(),counts=await n.f.counters(),sourceBefore=(await n.f.admin.query('SELECT revision,requirements FROM fabric.tasks WHERE task_id=$1',[n.source.binding.taskId])).rows[0],pending=c.invoke().then(value=>({value}),error=>({error}));
   await blocked(n,blocker,kind+'/late-'+variant);assert.ok(reached);assert.deepEqual((await n.f.admin.query('SELECT revision,requirements FROM fabric.tasks WHERE task_id=$1',[n.source.binding.taskId])).rows[0],sourceBefore,'partial authority mutation is invisible before COMMIT');await block.query('COMMIT');const result=await pending;assert.ok('error' in result);safe('error' in result?result.error:null);
   assert.deepEqual(await n.snapshot(),snap);assert.deepEqual((await n.f.admin.query('SELECT revision,requirements FROM fabric.tasks WHERE task_id=$1',[n.source.binding.taskId])).rows[0],sourceBefore);assert.deepEqual(await n.f.counters(),counts);
  }finally{await block.query('ROLLBACK');block.release();}
 });
 await t.test('source-revocation-valid-budget-top-up-cannot-resume-disclose-or-dispatch',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const a=await n.task({approval:true});assert.equal((await n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'preserve',choice:null})).view.wait?.reason,'approval');n.approved.add(a.sessionId);
  const resume={...await n.command(a.sessionId),inputLimitBytes:8};await n.f.admin.query('UPDATE fabric.tasks SET revision=revision+1 WHERE task_id=$1',[n.source.binding.taskId]);
  const before=await n.f.counters();assert.equal((await n.native.session.topUp(await n.f.scopeFor(0),{sessionId:a.sessionId,key:randomUUID(),expiresAt:expiry(),allowanceId:a.leaf,expectedAllowanceRevision:1,addedUnits:9})).autoResumed,false);
  const snap=await n.snapshot();await assert.rejects(n.native.session.resume(a.scope,resume),safe);assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),before);assert.equal((await n.native.session.inspect(a.scope,a.sessionId)).wait?.reason,'approval');
 });
}

async function unknown(n:Fixture){
 const a=await n.task(),j=journey(n,{schedule:{usage:'never'}}),wait=await j.turn(a,'original unknown');assert.equal(wait.view.wait?.reason,'unknown-usage');const o=j.requests[0]!.original;await n.f.finalize(o);assert.equal((await n.f.journal(o)).status,'settled');return {a,o,j};
}
async function newSession(n:Fixture,index=1):Promise<VerifiedScope>{
 const config={issuer:n.f.endpoints['issuer']!,jwksUrl:n.f.endpoints['jwksUrl']!,tokenEndpoint:n.f.endpoints['tokenEndpoint']!,clientId:'model-test',apiAudience:'model-api',redirectUri:'http://127.0.0.1/callback'},transaction=beginTestAuthorization(config);
 const response=await fetch(n.f.endpoints['authorizationEndpoint']!,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url'),state:transaction.state,nonce:transaction.nonce,username:n.f.actors[index]!,password:'synthetic'})});
 assert.equal(response.status,302);n.f.tokens[index]=await completeTestAuthorization({...config,...transaction,transaction,callbackUrl:response.headers.get('location')!});return n.f.scopeFor(index);
}
async function reservation(n:Fixture,o:OriginalCall){return (await n.f.admin.query('SELECT amount,settled_amount,state,run_id,actor_id FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];}
async function settles(n:Fixture,k:Awaited<ReturnType<typeof unknown>>){
 const journal=await n.f.journal(k.o);assert.equal((await n.native.models.reconcile(k.a.scope,k.o)).status,'settled');const row=await reservation(n,k.o);assert.equal(row.state,'settled');assert.equal(row.run_id,k.a.binding.runId);assert.equal(row.actor_id,k.a.binding.actorId);
 const receipts=(await n.f.admin.query('SELECT receipt FROM fabric.usage_settlements WHERE reservation_id=$1',[k.o.reservationId])).rows;assert.equal(receipts.length,1);assert.deepEqual(receipts[0].receipt,journal.receipt);assert.deepEqual((await n.f.admin.query('SELECT record FROM fabric.model_billing_bindings WHERE run_id=$1',[k.a.binding.runId])).rows[0].record,k.a.binding);assert.deepEqual(await n.f.journal(k.o),journal);
}
/** A04: actual owner lookup gates, late expiry/failure and transactional
 * revocation serialization. Receipt arrival never mints requester authority. */
export async function authorityOriginalLookupCases(t:TestContext):Promise<void>{
 for(const kind of ['resume','top-up'] as const)await t.test('response/'+kind+'/late-lock-expiry-keeps-checkpoint-and-liability',sub=>expireAfterLaterLock(sub,kind));
 for(const variant of ['token-expiry','authority-outage','after-usage-expiry','after-audit-expiry','after-outbox-expiry'] as const)await t.test('original-owner/'+variant+'/no-return-no-commit-retained-liability',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const k=await unknown(n),snap=await n.snapshot(),held=await reservation(n,k.o),counts=await n.f.counters(),journal=await n.f.journal(k.o);let now=Date.now()/1000,reached=false,unavailable=false;
  const uow=new AuthenticatedUnitOfWork({foundation:n.f.foundation,bindingFor:n.f.bindingFor,now:()=>now});
  const expire=()=>{reached=true;now=n.f.bindingFor(k.a.scope).tokenExpiresAt;};
  const hooks:UsageHooks={async afterUsage(){if(variant==='after-usage-expiry')expire();},async afterStage(stage){if(variant==='after-'+stage+'-expiry')expire();}};
  const authority={async assertCurrent(...args:Parameters<typeof n.native.models.usage.authority.assertCurrent>){if(unavailable)throw new ModelError('AUTHORITY_UNAVAILABLE');await n.native.models.usage.authority.assertCurrent(...args);}};
  const client=n.f.adapterClient(),installed:InstalledAdapter={...n.installed(),port:{accept:client.accept.bind(client),cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client),async lookup(o){assert.deepEqual(o,k.o);const answer=await client.lookup(o);if(variant==='token-expiry')expire();if(variant==='authority-outage'){reached=true;unavailable=true;}return answer;}}};
  const svc=new ModelService(new ModelRepository(uow,n.native.models.model.authority),new UsageRepository(uow,authority,hooks),[installed]);await n.f.arm('lookup');const pending=svc.reconcile(k.a.scope,k.o).then(value=>({value}),error=>({error}));
  try{await n.f.reached('lookup',k.o);if(variant==='token-expiry')expire();if(variant==='authority-outage'){reached=true;unavailable=true;}}finally{await n.f.release('lookup');}
  const denied=await pending;assert.ok('error' in denied);safe('error' in denied?denied.error:null);assert.ok(reached);assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await reservation(n,k.o),held);assert.deepEqual(await n.f.journal(k.o),journal);
  await settles(n,k);const after=await n.f.counters();for(const name of ['accept','acceptance'])assert.equal(after[name]??0,counts[name]??0);
 });
 await t.test('original-owner/real-session-expiry-during-lookup/refuse-and-new-issued-session-recovers-original',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const k=await unknown(n),identity=n.f.bindingFor(k.a.scope),snap=await n.snapshot(),held=await reservation(n,k.o),counts=await n.f.counters();
  await n.f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '750 milliseconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[identity.issuer,identity.subject,identity.sessionId]);
  await n.f.arm('lookup');const pending=n.native.models.reconcile(k.a.scope,k.o).then(value=>({value}),error=>({error}));
  try{
   await n.f.reached('lookup',k.o);await waitUntil(async()=>(await n.f.admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 AND sid=$3',[identity.issuer,identity.subject,identity.sessionId])).rows[0].expired,'actual original requester session expires while owner receipt is held');
  }finally{await n.f.release('lookup');}
  const denied=await pending;assert.ok('error' in denied);safe('error' in denied?denied.error:null);assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await reservation(n,k.o),held);
  const scope=await newSession(n);assert.notEqual(n.f.bindingFor(scope).sessionId,identity.sessionId);await settles(n,{...k,a:{...k.a,scope}});const after=await n.f.counters();for(const name of ['accept','acceptance'])assert.equal(after[name]??0,counts[name]??0);
 });
 for(const variant of ['identity','session','member','payer'] as const)await t.test('original-owner/'+variant+'/revocation-serializes-before-next-call',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const k=await unknown(n),before=await n.f.counters();await n.f.arm('lookup');
  const pending=n.native.models.reconcile(k.a.scope,k.o).then(value=>({value}),error=>({error}));await n.f.reached('lookup',k.o);
  const revoker=await n.f.admin.connect();let update:Promise<unknown>|undefined,released=false;
  try{
   await revoker.query('BEGIN');const pid=Number((await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);update=mutate(n,revoker,variant);
   let rows:Record<string,unknown>[]=[];await waitUntil(async()=>{rows=(await n.f.admin.query('SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows;return rows[0]?.['wait_event_type']==='Lock'&&(rows[0]?.['blockers'] as number[]).length>0;},'real revoker waits behind original-owner lookup');
   assert.ok((rows[0]!['blockers'] as number[]).length);console.log(JSON.stringify({measurement:'lookup-revocation-linearization',variant,revoker:pid,rows,ordering:'authorized lookup holds authority; revocation commits afterward'}));
   await n.f.release('lookup');released=true;const result=await pending;assert.ok('value' in result);assert.equal('value' in result?result.value.status:null,'settled');await update;await revoker.query('COMMIT');
   const snap=await n.snapshot();await assert.rejects(n.native.models.reconcile(k.a.scope,k.o),safe);assert.deepEqual(await n.snapshot(),snap);assert.equal((await reservation(n,k.o)).state,'settled');assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE reservation_id=$1',[k.o.reservationId])).rows[0].n,1);
   const after=await n.f.counters();for(const name of ['accept','acceptance'])assert.equal(after[name]??0,before[name]??0);
  }finally{if(!released)await n.f.release('lookup');await pending;await update;await revoker.query('ROLLBACK');revoker.release();}
 });
 await t.test('source-revision-during-owner-lookup-accounted-original-denied-output',async sub=>{
  const n=await createNativeFixture();sub.after(n.close);const k=await unknown(n);await n.f.arm('lookup');const pending=n.native.models.reconcile(k.a.scope,k.o);await n.f.reached('lookup',k.o);
  try{await n.f.admin.query('UPDATE fabric.tasks SET revision=revision+1 WHERE task_id=$1',[n.source.binding.taskId]);}finally{await n.f.release('lookup');}
  assert.equal((await pending).status,'settled');const snap=await n.snapshot(),counts=await n.f.counters(),staged=await new ModelService(n.native.models.model,n.native.models.usage,[{...n.installed(),result:n.f.adapterClient().result.bind(n.f.adapterClient())}]).stageOutput(k.a.scope,k.o);
  assert.ok(staged.output);let published=0;await assert.rejects(n.f.uow.withScope(k.a.scope,async tx=>{const s=await n.native.repository.load(tx,k.a.scope,k.a.sessionId);await n.native.ports.assertOutput(tx,k.a.scope,s,staged.request);published++;return staged.output;}),safe);assert.equal(published,0);assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await n.f.counters(),counts);await settles(n,k);
 });
}
