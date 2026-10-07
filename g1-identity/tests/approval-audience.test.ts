import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createFixture} from './identity-postgres.test.js';
import {ExactApprovalRepository,approvalDigest} from '../src/approval-repository.js';
import {audienceDigest,CurrentAudienceVerifier,type AudienceRow} from '../src/audience.js';
import {AuthenticatedUnitOfWork} from '../src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {FoundationError} from '../../g1-foundations/src/contracts.js';
import {startIdentityHttpService} from '../src/http-service.js';
import {createIdentityScopeVerifier} from '../src/current-authority.js';
import {verifyAccessToken} from '../src/token-verifier.js';
import {beginTestAuthorization,completeTestAuthorization} from '../src/test-idp.js';
import type {ExactApprovalBinding,VerifiedScope,AsyncUnitOfWork,ApprovalReceipt} from '../src/contracts.js';
let f:Awaited<ReturnType<typeof createFixture>>,requester:VerifiedScope,executor:VerifiedScope,approver:VerifiedScope,service:VerifiedScope,repo:ExactApprovalRepository;
before(async()=>{f=await createFixture();[requester,executor,approver,service]=await Promise.all([0,1,2,3].map(i=>f.scopeFor(i))) as [VerifiedScope,VerifiedScope,VerifiedScope,VerifiedScope];repo=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor});});after(async()=>{await f?.close();});
async function binding(overrides:Partial<ExactApprovalBinding>={},fixture=f,scope=requester):Promise<ExactApprovalBinding>{const rows=await fixture.uow.withScope(scope,async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[fixture.source,fixture.space,fixture.sourceTask])).rows[0]?.audience as AudienceRow[]);const target='synthetic://'+randomUUID();const argsDigest='sha256:'+createHash('sha256').update('synthetic').digest('hex');await fixture.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,1,$4)',[fixture.tenant,fixture.space,target,argsDigest]);return {tenantId:fixture.tenant,spaceId:fixture.space,taskId:fixture.task,runId:fixture.run,operationId:randomUUID(),target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:{sourceSpaceId:fixture.source,sourceTaskId:fixture.sourceTask,destinationSpaceId:fixture.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)},limits:{maxOperations:1,maxCostMicrounits:0},expiresAt:new Date(Date.now()+60000).toISOString(),...overrides};}
async function approved(){const b=await binding();const r=await repo.create(requester,{approvalId:randomUUID(),executorId:executor.actorId,binding:b});await repo.approve(approver,r.approvalId,r.bindingDigest);return {b,r};}
test('APPROVAL/independent-human-requester-executor-approver',async()=>{const b=await binding();await assert.rejects(repo.create(requester,{approvalId:randomUUID(),executorId:requester.actorId,binding:b}));const r=await repo.create(requester,{approvalId:randomUUID(),executorId:executor.actorId,binding:b});for(const s of [requester,executor,service])await assert.rejects(repo.approve(s,r.approvalId,r.bindingDigest));const a=await repo.approve(approver,r.approvalId,r.bindingDigest);assert.equal(a.approverId,approver.actorId);await assert.rejects(repo.approve(approver,r.approvalId,r.bindingDigest));});
test('APPROVAL/exact-target-args-artifact-revisions-limits-scope-binding',async()=>{const {b,r}=await approved();for(const patch of [{target:'synthetic://wrong'},{argsDigest:'sha256:'+'0'.repeat(64)},{artifactVersion:2},{policyRevision:2},{requirementsRevision:2},{action:'other'},{runId:randomUUID()},{taskId:randomUUID()},{operationId:randomUUID()},{limits:{maxOperations:2,maxCostMicrounits:0}},{tenantId:randomUUID()},{expiresAt:new Date(Date.now()+90000).toISOString()}])await assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:{...b,...patch}}));assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[r.approvalId])).rows[0].state,'approved');await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=2 WHERE target=$1',[b.target]);try{await assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}));}finally{await f.admin.query('UPDATE fabric.identity_target_versions SET artifact_version=1 WHERE target=$1',[b.target]);}});
test('APPROVAL/concurrent-one-consumption-dedup-key-conflict',async()=>{const {b,r}=await approved();const input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};const values=await Promise.all([repo.consume(executor,input),repo.consume(executor,input)]);assert.deepEqual(values[0],values[1]);for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,1);await assert.rejects(repo.consume(executor,{...input,idempotencyKey:randomUUID()}));const second=await approved();await assert.rejects(repo.consume(executor,{approvalId:second.r.approvalId,idempotencyKey:input.idempotencyKey,binding:second.b}));});
test('APPROVAL/current-human-approver-session-grant-revocation',async()=>{for(const mode of ['session','grant','actor']){const {b,r}=await approved();if(mode==='session')await f.idp.query('SELECT fabric.identity_revoke_session($1,$2,$3)',[f.issuer,f.actors[2],f.sessions[2]]);if(mode==='grant')await f.admin.query("UPDATE fabric.memberships SET grants='[\"task:read\",\"task:write\"]' WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[f.tenant,f.space,f.actors[2]]);if(mode==='actor')await f.admin.query('UPDATE fabric.actors SET revoked_at=now() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[2]]);try{await assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}));assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.approval_audit WHERE approval_id=$1',[r.approvalId])).rows[0].n,0);}finally{await f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=NULL WHERE issuer=$1 AND subject=$2',[f.issuer,f.actors[2]]);await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[2]]);await f.admin.query('UPDATE fabric.memberships SET grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2],JSON.stringify(['task:read','task:write','approval:approve'])]);}}});
test('APPROVAL/expiry-rechecked-after-lock-wait',async()=>{const b=await binding({expiresAt:new Date(Date.now()+500).toISOString()});const r=await repo.create(requester,{approvalId:randomUUID(),executorId:executor.actorId,binding:b});await repo.approve(approver,r.approvalId,r.bindingDigest);const lock=await f.admin.connect();await lock.query('BEGIN');await lock.query('SELECT * FROM fabric.exact_approvals WHERE approval_id=$1 FOR UPDATE',[r.approvalId]);const consuming=repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b});await new Promise(res=>setTimeout(res,600));await lock.query('COMMIT');lock.release();await assert.rejects(consuming);});
test('APPROVAL/atomic-rollback-audit-failclosed',async()=>{const {b,r}=await approved();const broken=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor,beforeAudit:()=>{throw new Error('injected audit failure');}});const input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};await assert.rejects(broken.consume(executor,input),/audit failure/);for(const table of ['approval_audit','approval_receipts','approval_outbox'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,0);assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[r.approvalId])).rows[0].state,'approved');await repo.consume(executor,input);});
test('APPROVAL/lost-real-COMMIT-ack-original-key-reconcile',async()=>{const {b,r}=await approved();let commits=0;const lostUow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{commits++;throw new Error('lost durable COMMIT acknowledgement');}),bindingFor:f.bindingFor});const lost=new ExactApprovalRepository({uow:lostUow,bindingFor:f.bindingFor});const input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};await assert.rejects(lost.consume(executor,input),e=>(e as {code:string}).code==='UNKNOWN_COMMIT');const result=await repo.lookupCommand(executor,input.idempotencyKey,approvalDigest(b));assert.equal(result.status,'committed');assert.equal(commits,1);if(result.status==='committed')assert.equal(result.receipt.approvalId,r.approvalId);assert.deepEqual(await repo.lookupCommand(executor,randomUUID(),approvalDigest(b)),{status:'absent-safe'});});
test('AUDIENCE/full-current-recipient-set-and-source-authorization',async()=>{const b=await binding();const audience=new CurrentAudienceVerifier();await f.uow.withScope(requester,tx=>audience.verify(tx,requester,b.sourceAudience));await assert.rejects(f.uow.withScope(requester,tx=>audience.verify(tx,requester,{...b.sourceAudience,recipientActorIds:[requester.actorId]})));await f.admin.query("UPDATE fabric.memberships SET grants='[]',revision=2 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3",[f.tenant,f.source,f.actors[1]]);try{await assert.rejects(f.uow.withScope(requester,tx=>audience.verify(tx,requester,b.sourceAudience)),e=>{assert.equal((e as Error).message,'AUDIENCE_DENIED');return true;});}finally{await f.admin.query('UPDATE fabric.memberships SET grants=$4,revision=1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}});
test('AUDIENCE/grant-revocation-invalidates-already-approved-publish',async()=>{const {b,r}=await approved();await f.admin.query('UPDATE fabric.memberships SET revoked_at=now() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[1]]);try{await assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}));assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.approval_audit WHERE approval_id=$1',[r.approvalId])).rows[0].n,0);}finally{await f.admin.query('UPDATE fabric.memberships SET revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.source,f.actors[1]]);}});

async function assertNoApprovalEffects(id:string){for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[id])).rows[0].n,0);assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[id])).rows[0].state,'approved');}
test('AUDIENCE/distinct-source-payer-revocation-denies-without-effects',async()=>{assert.notEqual(f.sourcePayer,requester.actorId);const {b,r}=await approved();await f.admin.query('UPDATE fabric.actors SET revoked_at=now() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]);try{await assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}));await assertNoApprovalEffects(r.approvalId);}finally{await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]);}});
test('AUDIENCE/source-payer-and-authority-revision-exact-binding',async()=>{
 for(const change of ['payer','source-revision','destination-revision']){
  const isolated=await createFixture();
  try{
   const [req,exec,approve]=await Promise.all([0,1,2].map(i=>isolated.scopeFor(i))) as [VerifiedScope,VerifiedScope,VerifiedScope];
   const localRepo=new ExactApprovalRepository({uow:isolated.uow,bindingFor:isolated.bindingFor});
   const b=await binding({},isolated,req);
   const r=await localRepo.create(req,{approvalId:randomUUID(),executorId:exec.actorId,binding:b});
   await localRepo.approve(approve,r.approvalId,r.bindingDigest);
   const rows=await isolated.uow.withScope(req,async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[isolated.source,isolated.space,isolated.sourceTask])).rows[0]?.audience as AudienceRow[]);
   for(const row of rows){assert.equal(row.sourcePayerId,isolated.sourcePayer);assert.equal(Number(row.sourceAuthorityRevision),1);assert.equal(row.destinationPayerId,req.actorId);assert.equal(Number(row.destinationAuthorityRevision),1);}
   if(change==='payer'){
    // Retained foundation makes payer immutable even for fixture admin. Do not
    // disable its trigger; observe rejection and test exact digest tampering.
    await assert.rejects(isolated.admin.query('UPDATE fabric.spaces SET payer_actor_id=$3 WHERE tenant_id=$1 AND space_id=$2',[isolated.tenant,isolated.source,isolated.actors[1]]),/immutable Space owner\/payer\/namespaces or stale authority/);
    const tampered={...b.sourceAudience,revisionDigest:audienceDigest(rows.map(row=>({...row,sourcePayerId:isolated.actors[1]!})))};
    assert.notEqual(tampered.revisionDigest,b.sourceAudience.revisionDigest);
    await assert.rejects(isolated.uow.withScope(req,tx=>new CurrentAudienceVerifier().verify(tx,req,tampered)),e=>(e as Error).message==='AUDIENCE_DENIED');
   }else{
    // Each isolated fixture advances once and is discarded; never rewind the
    // accepted monotonic authority guard or reuse stale verified scopes.
    await isolated.admin.query('UPDATE fabric.spaces SET authority_revision=2 WHERE tenant_id=$1 AND space_id=$2',[isolated.tenant,change==='source-revision'?isolated.source:isolated.space]);
    await assert.rejects(localRepo.consume(exec,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}));
   }
   for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await isolated.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,0);
   assert.equal((await isolated.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[r.approvalId])).rows[0].state,'approved');
  }finally{await isolated.close();}
 }
});
async function waitForActorLock(){const deadline=Date.now()+3000;while(Date.now()<deadline){const r=await f.admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%fabric.%' AND pid<>pg_backend_pid()");if(r.rows[0].n>0)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Expected actual source-payer PostgreSQL lock wait');}
test('AUDIENCE/source-payer-revocation-lock-serializes-consume',async()=>{const {b,r}=await approved();const lock=await f.admin.connect();await lock.query('BEGIN');await lock.query('UPDATE fabric.actors SET revoked_at=now() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]);let settled=false;const consuming=repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b});const rejected=assert.rejects(consuming).finally(()=>{settled=true;});try{await waitForActorLock();assert.equal(settled,false);await lock.query('COMMIT');await rejected;await assertNoApprovalEffects(r.approvalId);}finally{await lock.query('ROLLBACK');lock.release();await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]);await rejected;}});
test('AUDIENCE/source-payer-lock-held-through-authorized-transaction',async()=>{const b=await binding();let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);const work=f.uow.withScope(requester,async tx=>{await new CurrentAudienceVerifier().verify(tx,requester,b.sourceAudience);entered();await gate;return true;});await Promise.race([ready,work.then(()=>{throw new Error('Source-payer transaction completed before lock observation');})]);let revoked=false;const revocation=f.admin.query('UPDATE fabric.actors SET revoked_at=now() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]).then(()=>{revoked=true;});try{await waitForActorLock();assert.equal(revoked,false);release();assert.equal(await work,true);await revocation;await assert.rejects(f.uow.withScope(requester,tx=>new CurrentAudienceVerifier().verify(tx,requester,b.sourceAudience)));}finally{release();await work;await revocation;await f.admin.query('UPDATE fabric.actors SET revoked_at=NULL WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.sourcePayer]);}});
test('APPROVAL/real-PG-partial-write-rollback-after-audit-and-receipt',async()=>{for(const stage of ['outbox','consumed']){const {b,r}=await approved();const suffix=randomUUID().replaceAll('-',''),fn='injected_rollback_'+suffix,tr='rollback_'+suffix,table=stage==='outbox'?'approval_outbox':'exact_approvals';const condition=stage==='outbox'?`NEW.receipt->>'approvalId'='${r.approvalId}'`:`NEW.approval_id='${r.approvalId}' AND NEW.state='consumed'`;const observed=stage==='outbox'?`EXISTS(SELECT 1 FROM fabric.approval_audit WHERE approval_id='${r.approvalId}')`:`EXISTS(SELECT 1 FROM fabric.approval_audit WHERE approval_id='${r.approvalId}') AND EXISTS(SELECT 1 FROM fabric.approval_outbox WHERE receipt->>'approvalId'='${r.approvalId}') AND EXISTS(SELECT 1 FROM fabric.approval_receipts WHERE receipt->>'approvalId'='${r.approvalId}')`;await f.admin.query(`CREATE FUNCTION fabric.${fn}() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF ${condition} THEN IF NOT (${observed}) THEN RAISE EXCEPTION 'missing expected partial writes'; END IF; RAISE EXCEPTION 'injected actual PG failure after ${stage} partial writes'; END IF; RETURN NEW; END $body$`);try{await f.admin.query(`CREATE TRIGGER ${tr} BEFORE ${stage==='outbox'?'INSERT':'UPDATE'} ON fabric.${table} FOR EACH ROW EXECUTE FUNCTION fabric.${fn}()`);const input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};await assert.rejects(repo.consume(executor,input),new RegExp('injected actual PG failure after '+stage+' partial writes'));await assertNoApprovalEffects(r.approvalId);await f.admin.query(`DROP TRIGGER ${tr} ON fabric.${table}`);await repo.consume(executor,input);for(const written of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${written} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,1);}finally{await f.admin.query(`DROP TRIGGER IF EXISTS ${tr} ON fabric.${table}`);await f.admin.query(`DROP FUNCTION fabric.${fn}()`);}}});

async function waitForSessionBlocker(blockerPid:number){const deadline=Date.now()+3000;while(Date.now()<deadline){const r=await f.admin.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query ILIKE '%identity_parties_current%'",[blockerPid]);if(r.rows.length>0)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Expected actual later participant session lock wait');}
test('APPROVAL/requester-expiry-during-later-approver-session-lock-rolls-back',async()=>{
 const {b,r}=await approved();const lock=await f.admin.connect();let rejected:Promise<void>|undefined;
 try{
  await lock.query('BEGIN');const blockerPid=Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  await lock.query('SELECT * FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 AND sid=$3 FOR UPDATE',[f.issuer,f.actors[2],f.sessions[2]]);
  await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[f.issuer,f.actors[0],f.sessions[0]]);
  rejected=assert.rejects(repo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}),e=>(e as {code:string}).code==='UNAUTHORIZED');
  await waitForSessionBlocker(blockerPid);await assertNoApprovalEffects(r.approvalId);
  const deadline=Date.now()+5000;let expired=false;while(Date.now()<deadline){expired=(await f.admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 AND sid=$3',[f.issuer,f.actors[0],f.sessions[0]])).rows[0].expired;if(expired)break;await new Promise(resolve=>setTimeout(resolve,20));}assert.equal(expired,true);
  await lock.query('COMMIT');await rejected;await assertNoApprovalEffects(r.approvalId);
 }finally{await lock.query('ROLLBACK');lock.release();try{if(rejected)await rejected;}finally{await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '600 seconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[f.issuer,f.actors[0],f.sessions[0]]);}}
});
test('APPROVAL/participant-and-approval-expiry-after-real-partial-writes-rolls-back',async()=>{
 for(const mode of ['approver-session','requester-token','approval']){
  const b=await binding(mode==='approval'?{expiresAt:new Date(Date.now()+2000).toISOString()}:{});const originalTokenExpiry=f.bindingFor(requester).tokenExpiresAt;if(mode==='requester-token')Object.assign(f.bindingFor(requester),{tokenExpiresAt:Date.now()/1000+2});
  let r;try{r=await repo.create(requester,{approvalId:randomUUID(),executorId:executor.actorId,binding:b});}finally{Object.assign(f.bindingFor(requester),{tokenExpiresAt:originalTokenExpiry});}await repo.approve(approver,r.approvalId,r.bindingDigest);
  if(mode==='approver-session')await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[f.issuer,f.actors[2],f.sessions[2]]);
  let afterWrites=false;const timedUow:AsyncUnitOfWork={withScope:(scope,work)=>f.uow.withScope(scope,tx=>work({async query<Row extends Record<string,unknown>>(text:string,values?:readonly unknown[]){const result=await tx.query<Row>(text,values);if(text.includes("SET state='consumed'"))afterWrites=true;return result;}}))};const timedRepo=new ExactApprovalRepository({uow:timedUow,bindingFor:f.bindingFor});
  const suffix=randomUUID().replaceAll('-',''),fn='expiry_after_writes_'+suffix,tr='expiry_'+suffix;
  const expiry=mode==='approval'?`'${b.expiresAt}'::timestamptz`:mode==='requester-token'?`to_timestamp((NEW.request_identity->>'tokenExpiresAt')::double precision)`:`(SELECT expires_at FROM fabric.identity_sessions WHERE issuer='${f.issuer}' AND subject='${f.actors[2]}' AND sid='${f.sessions[2]}')`;
  await f.admin.query(`CREATE FUNCTION fabric.${fn}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $body$ DECLARE expires timestamptz; BEGIN IF NEW.approval_id='${r.approvalId}' AND NEW.state='consumed' THEN IF NOT (EXISTS(SELECT 1 FROM fabric.approval_audit WHERE approval_id='${r.approvalId}') AND EXISTS(SELECT 1 FROM fabric.approval_outbox WHERE receipt->>'approvalId'='${r.approvalId}') AND EXISTS(SELECT 1 FROM fabric.approval_receipts WHERE receipt->>'approvalId'='${r.approvalId}')) THEN RAISE EXCEPTION 'missing expected partial writes before expiry'; END IF; expires:=${expiry}; PERFORM pg_sleep(LEAST(3,GREATEST(0,EXTRACT(EPOCH FROM expires-clock_timestamp()))+0.05)); END IF; RETURN NEW; END $body$`);
  try{
   await f.admin.query(`CREATE TRIGGER ${tr} BEFORE UPDATE ON fabric.exact_approvals FOR EACH ROW EXECUTE FUNCTION fabric.${fn}()`);
   await assert.rejects(timedRepo.consume(executor,{approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b}),e=>(e as {code:string}).code===(mode==='approval'?'APPROVAL_CONFLICT':'UNAUTHORIZED'));
   assert.equal(afterWrites,true,'actual consumed UPDATE and expiry-wait trigger completed after all three writes');
   await assertNoApprovalEffects(r.approvalId);
  }finally{await f.admin.query(`DROP TRIGGER IF EXISTS ${tr} ON fabric.exact_approvals`);await f.admin.query(`DROP FUNCTION fabric.${fn}()`);if(mode==='approver-session')await f.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '600 seconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[f.issuer,f.actors[2],f.sessions[2]]);}
 }
});

async function waitForCommandLock(blockerPid:number){
 const deadline=Date.now()+1500;
 while(Date.now()<deadline){
  const rows=(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT pg_advisory_xact_lock%'",[blockerPid])).rows;
  if(rows.length)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error('Expected actual original-key advisory lock wait');
}
for(const outcome of ['commit','rollback','timeout'] as const)test('APPROVAL/original-key-lookup-during-uncommitted-writes-'+outcome,async()=>{
 const {b,r}=await approved(),input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};
 let release!:()=>void,entered!:(value:{pid:number;receipt:ApprovalReceipt})=>void;
 const gate=new Promise<void>(resolve=>release=resolve),ready=new Promise<{pid:number;receipt:ApprovalReceipt}>(resolve=>entered=resolve);
 const heldUow:AsyncUnitOfWork={withScope:(scope,work)=>f.uow.withScope(scope,async tx=>{
  const pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
  const value=await work(tx);entered({pid,receipt:value as ApprovalReceipt});await gate;
  if(outcome==='rollback')throw new Error('injected rollback after all approval writes');return value;
 })};
 const held=new ExactApprovalRepository({uow:heldUow,bindingFor:f.bindingFor});
 const consuming=held.consume(executor,input);
 const consumed=outcome==='rollback'?assert.rejects(consuming,/injected rollback/):consuming;
 let lookup:ReturnType<typeof repo.lookupCommand>|undefined;
 try{
  const original=await Promise.race([ready,consuming.then(()=>{throw new Error('Consume settled before observation');})]);
  // Independent connection cannot see the receipt while all writes are held.
  for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,0);
  let settled=false;lookup=repo.lookupCommand(executor,input.idempotencyKey,approvalDigest(b));lookup.then(()=>settled=true,()=>settled=true);
  await waitForCommandLock(original.pid);assert.equal(settled,false);
  // Key and executor namespaces remain independent; neither can reveal receipt.
  assert.deepEqual(await repo.lookupCommand(executor,randomUUID(),approvalDigest(b)),{status:'absent-safe'});
  assert.deepEqual(await repo.lookupCommand(requester,input.idempotencyKey,approvalDigest(b)),{status:'absent-safe'});
  if(outcome==='timeout'){
   assert.deepEqual(await lookup,{status:'unknown',nextAction:'lookup-original-key-no-replay'});
   assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.approval_receipts WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0].n,0);
  }
  release();await consumed;
  if(outcome==='rollback'){
   assert.deepEqual(await lookup,{status:'absent-safe'});await assertNoApprovalEffects(r.approvalId);
  }else{
   const result=outcome==='timeout'?await repo.lookupCommand(executor,input.idempotencyKey,approvalDigest(b)):await lookup;
   assert.deepEqual(result,{status:'committed',receipt:original.receipt});
   for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,1);
   await assert.rejects(repo.lookupCommand(executor,input.idempotencyKey,'sha256:'+'0'.repeat(64)),e=>(e as {code:string}).code==='APPROVAL_CONFLICT');
  }
 }finally{release();await Promise.allSettled([consumed,...(lookup?[lookup]:[])]);}
});

test('APPROVAL/real-HTTP-PG-lost-COMMIT-ack-preserves-unknown-and-original-receipt',async()=>{
 const {b,r}=await approved();
 const clientId='recovery-test',apiAudience='recovery-api',redirectUri='http://127.0.0.1/callback';
 const child=spawn(process.execPath,['g1-identity/scripts/test-idp-process.mjs'],{env:{...process.env,FABRIC_TEST_IDP_CONFIG:JSON.stringify({clientId,apiAudience,redirectUri,users:[{subject:f.actors[1],password:'synthetic'}],sessionDsn:f.idpDsn})},stdio:['pipe','pipe','pipe']});
 let service:Awaited<ReturnType<typeof startIdentityHttpService>>|undefined;
 try{
  const endpoints=await new Promise<{issuer:string;jwksUrl:string;authorizationEndpoint:string;tokenEndpoint:string}>((resolve,reject)=>{
   let text='';const timer=setTimeout(()=>reject(new Error('Recovery IdP readiness timeout')),5000);
   child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Recovery IdP exited'));});
   child.stderr.on('data',()=>{});child.stdout.on('data',data=>{text+=String(data);if(text.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(text.split('\n')[0]!));}catch(error){reject(error);}}});
  });
  await f.admin.query("INSERT INTO fabric.identities(issuer,subject,tenant_id,actor_id,principal_kind) VALUES($1,$2,$3,$4,'human')",[endpoints.issuer,f.actors[1],f.tenant,f.actors[1]]);
  const transaction=beginTestAuthorization({...endpoints,clientId,apiAudience,redirectUri});
  const auth=await fetch(endpoints.authorizationEndpoint,{method:'POST',redirect:'manual',body:new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url'),state:transaction.state,nonce:transaction.nonce,username:f.actors[1]!,password:'synthetic'})});assert.equal(auth.status,302);
  const raw=await completeTestAuthorization({...endpoints,clientId,apiAudience,redirectUri,callbackUrl:auth.headers.get('location')!,transaction,...transaction});
  const scopes=createIdentityScopeVerifier({verifyToken:token=>verifyAccessToken(token,{...endpoints,apiAudience}),lookupAuthority:f.lookup});
  const bindingFor=(scope:VerifiedScope)=>scopes.bindingFor(scope);let commits=0;
  const lostUow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{commits++;throw new Error('lost durable acknowledgement: private internal detail');}),bindingFor});
  const lost=new ExactApprovalRepository({uow:lostUow,bindingFor}),normal=new ExactApprovalRepository({uow:new AuthenticatedUnitOfWork({foundation:f.foundation,bindingFor}),bindingFor});
  let fault:unknown;
  service=await startIdentityHttpService({scopes,approvals:{create:normal.create.bind(normal),approve:normal.approve.bind(normal),consume:async(scope,input)=>{if(fault)throw fault;return lost.consume(scope,input);},lookupCommand:normal.lookupCommand.bind(normal)}});
  const headers={authorization:'Bearer '+raw,'content-type':'application/json'},query='?tenantId='+f.tenant+'&spaceId='+f.space;
  const input={approvalId:r.approvalId,idempotencyKey:randomUUID(),binding:b};
  const response=await fetch(service.url+'/approvals/consume'+query,{method:'POST',headers,body:JSON.stringify(input)});
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{error:'UNKNOWN_COMMIT',status:'unknown',recovery:{path:'/approvals/lookup',method:'POST',useOriginalKey:true,replayAllowed:false}});
  const durable=(await f.admin.query('SELECT receipt FROM fabric.approval_receipts WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0].receipt;
  const recovered=await fetch(service.url+'/approvals/lookup'+query,{method:'POST',headers,body:JSON.stringify({idempotencyKey:input.idempotencyKey,bindingDigest:approvalDigest(b)})});
  assert.equal(recovered.status,200);assert.deepEqual(await recovered.json(),{status:'committed',receipt:durable});assert.equal(commits,1);
  // Only the allowlisted error classes/code get the recovery response. Private
  // messages and arbitrary objects bearing the same code must not cross HTTP.
  for(const error of [new FoundationError('UNAUTHORIZED','private authorization detail'),Object.assign(new Error('private spoofed detail'),{code:'UNKNOWN_COMMIT'})]){
   fault=error;const denied:Response=await fetch(service.url+'/approvals/consume'+query,{method:'POST',headers,body:JSON.stringify(input)});
   assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{error:'UNAUTHORIZED'});
  }
  assert.equal(commits,1);
  for(const table of ['approval_audit','approval_outbox','approval_receipts'])assert.equal((await f.admin.query(`SELECT count(*)::int AS n FROM fabric.${table} WHERE receipt->>'approvalId'=$1`,[r.approvalId])).rows[0].n,1);
  assert.equal((await f.admin.query('SELECT state FROM fabric.exact_approvals WHERE approval_id=$1',[r.approvalId])).rows[0].state,'consumed');
 }finally{
  await service?.close();if(child.exitCode===null&&child.signalCode===null){await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),1500);timer.unref();});}
 }
});
