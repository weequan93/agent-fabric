import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createLedgerFixture } from '../helpers/ledger-fixture.js';
import { launchOwned,stopOwned,control,waitUntil,type OwnedProcess } from '../helpers/process-fixture.js';
import { migrateModelLedger } from '../../src/ledger-migration.js';
import { TransactionBudgetRepository,decodeCategories } from '../../src/budget-repository.js';
import { ModelError,safeFailure,FoundationError } from '../../src/errors.js';
import { TransactionRetryRepository } from '../../src/retry-repository.js';
import { ModelRepository,hash,originalKeyLock,type RepositoryHooks } from '../../src/model-repository.js';
import { replaySession } from '../../src/native-imports.js';
import { OriginalCallSchema } from '../../src/schema.js';
import { sha } from '../helpers/contract-fixtures.js';
import type { SqlTransaction } from '../../src/contracts.js';
const code=(expected:string)=>(e:unknown)=>e instanceof ModelError&&e.code===expected;
test('LEDGER/atomic-contention',async t=>{
 const l=await createLedgerFixture(),f=l.f,children:OwnedProcess[]=[];
 t.after(async()=>{const r=await Promise.allSettled(children.map(p=>stopOwned(p)));await l.close();for(const result of r)if(result.status==='rejected')throw result.reason;});
 const original=(space=f.space)=>OriginalCallSchema.parse({...f.original(),spaceId:space});
 const budget=(s:Awaited<ReturnType<typeof l.task>>,o:ReturnType<typeof original>,amount:number)=>f.uow.withScope(s.scope,tx=>new TransactionBudgetRepository(tx).reserve(s.binding.runId,o,{tool:amount}));
 async function caller(space:string){
  const child=await launchOwned(resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/ledger-caller-process.js'),'FABRIC_MODEL_LEDGER_CALLER',{controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[1],tenantId:f.tenant,spaceId:space,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl']});
  children.push(child);return child;
 }
 const done=async(p:OwnedProcess)=>{await waitUntil(async()=>p.messages.some(m=>m['kind']==='result'),'independent caller result');return p.messages.find(m=>m['kind']==='result')!;};
 const pid=async(p:OwnedProcess)=>{await waitUntil(async()=>p.messages.some(m=>m['kind']==='caller-pid'),'independent backend pid');return Number(p.messages.find(m=>m['kind']==='caller-pid')!['pid']);};
 async function blocked(p:OwnedProcess,by?:number){
  const backend=await pid(p);let observation:Record<string,unknown>|undefined;
  await waitUntil(async()=>{const r=(await f.admin.query("SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1",[backend])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.length&&(!by||r.blockers.includes(by))){observation=r;return true;}return false;},'actual independent PostgreSQL lock wait');
  console.log(JSON.stringify({measurement:'model-ledger-lock-wait',...observation}));return backend;
 }
 await t.test('forward-migration-representative-base-digests-concurrent-and-changed-bytes',async()=>{
  const options={ownedSyntheticDatabase:true as const,root:f.root,owner:f.fixtureOwner};
  await Promise.all([migrateModelLedger(f.admin,options),migrateModelLedger(f.admin,options)]);
  assert.deepEqual((await f.admin.query('SELECT version FROM public.fabric_model_migrations ORDER BY version')).rows.map(r=>r.version),[1,2,12]);
  const directory=await mkdtemp(resolve(tmpdir(),'model-ledger-migration-'));
  try{const sqlPath=resolve(directory,'changed.sql');await writeFile(sqlPath,await readFile(resolve(f.root,'g1-model/migrations/0002_model_ledger.sql'),'utf8')+'\n-- incompatible bytes\n');await assert.rejects(migrateModelLedger(f.admin,{...options,sqlPath}),code('CHECK_BINDING_MISMATCH'));}finally{await rm(directory,{recursive:true});}
  const originalFiles=[['infra/migrations/0001_core_records.sql','fabric_foundation_migrations',1],['g1-foundations/migrations/0002_controller_roles.sql','fabric_foundation_migrations',2],['g1-identity/migrations/0003_identity_approvals.sql','fabric_identity_migrations',3]]as const;
  for(const [file,table,v]of originalFiles)assert.equal((await f.admin.query('SELECT digest FROM public.'+table+' WHERE version=$1',[v])).rows[0].digest,createHash('sha256').update(await readFile(resolve(f.root,file))).digest('hex'));
 });
 await t.test('parent100-children40-independent-processes-observed-row-lock-no-copied-capacity',async()=>{
  const a=await l.task({commonCeiling:100,ceiling:100}),b=await l.task({ceiling:100}),c=await l.task({ceiling:100});
  const pa=await caller(f.space),pb=await caller(f.space),pc=await caller(f.space),oa=original(),ob=original(),oc=original();
  await control(pa,{kind:'reserve',runId:a.binding.runId,original:oa,amount:40,hold:true});
  await waitUntil(async()=>pa.messages.some(m=>m['kind']==='reserved'),'first parent reservation partial write');
  await control(pb,{kind:'reserve',runId:b.binding.runId,original:ob,amount:40,hold:false});await blocked(pb,await pid(pa));
  await control(pc,{kind:'reserve',runId:c.binding.runId,original:oc,amount:40,hold:false});await blocked(pc);
  // A's uncommitted reserve is invisible to independent observer.
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.budget_reservations WHERE reservation_id=$1',[oa.reservationId])).rows[0].n,0);
  await control(pa,{kind:'release'});const results=await Promise.all([done(pa),done(pb),done(pc)]);
  assert.equal(results.filter(r=>r['status']==='committed').length,2);assert.equal(results.filter(r=>r['code']==='BUDGET_EXHAUSTED').length,1);
  const balance=(await f.admin.query('SELECT ceiling,reserved,settled FROM fabric.budget_allowances WHERE allowance_id=$1',[a.ids[0]])).rows[0];assert.deepEqual(balance,{ceiling:'100',reserved:'80',settled:'0'});
  const all=(await f.admin.query('SELECT reserved FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[])',[a.ids.slice(0,4)])).rows;assert.ok(all.every(r=>r.reserved==='80'));
  for(const p of [pa,pb,pc])await stopOwned(p);
 });
 await t.test('shared-person60-across-isolated-Spaces40-observed-aggregate-lock',async()=>{
  const parent=await l.account(500,'tenant'),account=await l.account(60,'person',parent);
  // New Spaces avoid conflating previous parent100 exhaustion with account60.
  const makeSpace=async()=>{const id=randomUUID();await f.admin.query("INSERT INTO fabric.spaces VALUES($1,$2,$3,$4,$5,$6,1,'active')",[f.tenant,id,f.actors[0],f.actors[3],randomUUID(),randomUUID()]);for(const actor of [f.actors[0],f.actors[1]])await f.admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4::jsonb)',[f.tenant,id,actor,JSON.stringify(actor===f.actors[0]?['task:read','task:write','budget:control']:['task:read','task:write'])]);return id;};
  const s1=await makeSpace(),s2=await makeSpace(),a=await l.task({space:s1,accountId:account}),b=await l.task({space:s2,accountId:account});
  const pa=await caller(s1),pb=await caller(s2),oa=original(s1),ob=original(s2);
  await control(pa,{kind:'reserve',runId:a.binding.runId,original:oa,amount:40,hold:true});await waitUntil(async()=>pa.messages.some(m=>m['kind']==='reserved'),'shared person first write');
  await control(pb,{kind:'reserve',runId:b.binding.runId,original:ob,amount:40,hold:false});await blocked(pb,await pid(pa));
  await control(pa,{kind:'release'});assert.equal((await done(pa))['status'],'committed');assert.equal((await done(pb))['code'],'BUDGET_EXHAUSTED');
  assert.deepEqual((await f.admin.query('SELECT ceiling,reserved FROM fabric.model_accounts WHERE account_id=$1',[account])).rows[0],{ceiling:'60',reserved:'40'});
  assert.equal((await f.admin.query('SELECT reserved FROM fabric.model_accounts WHERE account_id=$1',[parent])).rows[0].reserved,'40');
  await f.uow.withScope(a.scope,async tx=>{assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_reservation_accounts WHERE space_id=$1',[s2])).rows[0]?.['n'],0);});
  await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT * FROM fabric.model_accounts')));
  for(const p of [pa,pb])await stopOwned(p);
  // Subsequent independent diagnostics use larger installed fixture caps. The
  // 60/40 race and its final balances above remain asserted before this reset.
  // No product top-up/continuation is invoked; all records/reserves remain.
  await f.admin.query('UPDATE fabric.model_accounts SET ceiling=100000,revision=revision+1 WHERE account_id=ANY($1::uuid[])',[ [parent,account] ]);

 });
 // Independent diagnostic Space for native intent so previous budget ceiling remains meaningful.
 const s=f.otherSpace;
 await t.test('atomic-native-prefix-original-attribution-and-committed-reservation-before-adapter',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput(),model=l.model(),counters=await f.counters();
  const prepared=await model.prepare(a.scope,input);assert.equal(prepared.acknowledgedCommit,true);assert.equal(prepared.operation.attemptsTaken,1);
  const native=(await f.admin.query('SELECT event FROM fabric.model_native_events WHERE session_id=$1 ORDER BY sequence',[input.binding.sessionId])).rows.map(r=>r.event);
  assert.deepEqual(native,input.nativePrefix);assert.equal(replaySession(input.origin,native).pendingModel?.operationId,input.request.original.operationId);
  assert.equal((await f.admin.query('SELECT state FROM fabric.budget_reservations WHERE reservation_id=$1',[input.request.original.reservationId])).rows[0].state,'active');
  assert.deepEqual(await f.counters(),counters);
  const retrySnapshot=await l.snapshot();
  await f.uow.withScope(a.scope,async tx=>{const owner=new TransactionRetryRepository(tx);assert.deepEqual(await owner.current(a.scope,prepared.operation.operationId),prepared.operation);await assert.rejects(owner.increment(a.scope,prepared.operation),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));await assert.rejects(owner.increment(a.scope,{...prepared.operation,status:'safely-failed'}),code('STALE_REVISION'));});
  assert.deepEqual(await l.snapshot(),retrySnapshot);
  const [receipt]=(await f.admin.query('SELECT receipt FROM fabric.model_command_receipts WHERE command_key=$1',[input.command.key])).rows;assert.deepEqual(receipt.receipt.operation,prepared.operation);
  const permit=await model.claim(a.scope,input.request.original.attemptId);assert.ok(permit);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE claim_id=$1',[permit.claimId])).rows[0].n,1);
  await model.withDispatch(a.scope,permit,async(_tx,r)=>{
   assert.equal((await f.admin.query('SELECT amount FROM fabric.budget_reservations WHERE reservation_id=$1',[r.original.reservationId])).rows.length,1);
   await f.schedule(r.original,{usage:'manual'});return f.adapterClient().accept(r);
  });
  assert.equal((await f.counters())['acceptance'],(counters['acceptance']??0)+1);await f.finalize(input.request.original);
  await assert.rejects(model.withDispatch(a.scope,permit,async()=>{throw new Error('must not invoke');}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
 });
 await t.test('one-use-claim-survives-dispatch-rollback-recreation-and-forged-permit',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput(),model=l.model();await model.prepare(a.scope,input);
  const permit=await model.claim(a.scope,input.request.original.attemptId);assert.ok(permit);const before=await f.counters();
  await assert.rejects(model.withDispatch(a.scope,permit,async(tx,r)=>{
   await f.schedule(r.original,{usage:'manual'});await f.adapterClient().accept(r);await tx.query('SELECT 1/0');
  }));
  assert.equal((await f.counters())['acceptance'],(before['acceptance']??0)+1);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE claim_id=$1',[permit.claimId])).rows[0].n,1);
  assert.equal(await model.claim(a.scope,input.request.original.attemptId),null);
  const recreated=l.model();assert.equal(await recreated.claim(a.scope,input.request.original.attemptId),null);
  for(const bad of [permit,{claimId:permit.claimId}])await assert.rejects(recreated.withDispatch(a.scope,bad,async()=>{throw new Error('must not invoke');}),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
  assert.equal((await f.counters())['acceptance'],(before['acceptance']??0)+1);await f.finalize(input.request.original);
 });
 await t.test('verified-partial-write-faults-rollback-all-balances-history-receipts-zero-adapter',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput();
  for(const fault of ['reserved','operation','attempt','pending','audit','outbox']as const){
   const before=await l.snapshot(),counters=await f.counters();let reached=false;
   const model=l.model({async afterStage(stage,tx){if(stage!==fault)return;reached=true;
    assert.equal((await tx.query('SELECT fabric.model_current($1,$2,true) IS NOT NULL AS valid',[a.binding.runId,input.request.profileDigest])).rows[0]?.['valid'],true);
    if(stage==='reserved')assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_category_reservations WHERE reservation_id=$1',[input.request.original.reservationId])).rows[0]?.['n'],2);
    else if(stage==='operation')assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE operation_id=$1',[input.request.original.operationId])).rows[0]?.['n'],1);
    else if(stage==='attempt')assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_attempts WHERE attempt_id=$1',[input.request.original.attemptId])).rows[0]?.['n'],1);
    else if(stage==='pending')assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_native_events WHERE session_id=$1',[input.binding.sessionId])).rows[0]?.['n'],3);
    else assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.'+(stage==='audit'?'model_audit':'model_outbox')+' WHERE command_key=$1',[input.command.key])).rows[0]?.['n'],1);
    await tx.query('SELECT 1/0');
   }});
   await assert.rejects(model.prepare(a.scope,input));assert.ok(reached,fault);assert.deepEqual(await l.snapshot(),before,fault);assert.deepEqual(await f.counters(),counters);
  }
 });
 await t.test('original-key-digest-conflict-blocks-on-writer-and-lookup-fresh-after-commit',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput();let arrived=false,release!:()=>void;
  const writer=l.model({async afterStage(stage){if(stage==='reserved'){arrived=true;await new Promise<void>(r=>release=r);}}});
  const writing=writer.prepare(a.scope,input);await waitUntil(async()=>arrived,'writer reached reservation');
  const changed={...input,route:'changed-local-route'},reader=l.model();let readerDone=false;
  const conflict=reader.prepare(a.scope,changed).then(()=>{throw new Error('Conflict admitted');},e=>{readerDone=true;assert.equal(e.code,'IDEMPOTENCY_CONFLICT');});
  await waitUntil(async()=>{const rows=(await f.admin.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE wait_event_type='Lock' AND usename=$1",[f.roles.controller])).rows;return rows.some(r=>r.blockers.length);},'actual original-key or Space barrier wait');assert.equal(readerDone,false);
  release();const committed=await writing;await conflict;
  const digest=(await f.admin.query('SELECT payload_digest FROM fabric.model_command_receipts WHERE command_key=$1',[input.command.key])).rows[0].payload_digest;
  const result=await reader.lookup(a.scope,input.command.key,digest);assert.equal(result.status,'committed');if(result.status==='committed')assert.deepEqual(result.prepared.operation,committed.operation);
  const same=await reader.prepare(a.scope,input);assert.deepEqual(same.operation,committed.operation);
  const lock1=originalKeyLock(a.scope,input.command.key),lock2=originalKeyLock(a.scope,input.command.key);assert.equal(lock1,lock2);assert.ok(!lock1.includes(digest));
 });
 await t.test('safe-numeric-boundaries-forged-owner-and-category-rejection-no-mutation',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput(),before=await l.snapshot(),counters=await f.counters();
  for(const amount of [-0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'40',null,40n])assert.throws(()=>decodeCategories({model:amount}));
  for(const categories of [{unknown:1},{model:Number.MAX_SAFE_INTEGER,service:1},{}])assert.throws(()=>decodeCategories(categories));
  for(const categories of [{tool:-1},{tool:0.5},{tool:'40'},{tool:9007199254740992},{tool:9007199254740991,service:1},{tool:0}])
   await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT fabric.model_reserve($1,$2,$3,$4::jsonb)',[a.binding.runId,randomUUID(),randomUUID(),JSON.stringify(categories)])));
  for(const binding of [{...input.binding,payerId:f.foreignActor},{...input.binding,costCenter:'forged'},{...input.binding,runId:randomUUID()},{...input.binding,intent:'Act' as const}])
   await assert.rejects(l.model().prepare(a.scope,{...input,binding}));
  await assert.rejects(l.model().prepare({...a.scope} as typeof a.scope,input));
  assert.deepEqual(await l.snapshot(),before);assert.deepEqual(await f.counters(),counters);
 });
 await t.test('all-applicable-limits-category-accounting-and-maintenance-attribution',async()=>{
  for(const category of ['model','service','tool','active-compute','reserved-compute','retained-storage','network','embedding','reranking','cold-start']as const){
   const a=await l.task({space:s,category,purpose:category==='embedding'?'embedding':'maintenance',ceiling:20}),o=original(s);
   await f.uow.withScope(a.scope,tx=>new TransactionBudgetRepository(tx).reserve(a.binding.runId,o,{[category]:20}));
   await assert.rejects(budget(a,original(s),1),code('BUDGET_EXHAUSTED'));
   assert.deepEqual((await f.admin.query('SELECT category,amount FROM fabric.model_category_reservations WHERE reservation_id=$1',[o.reservationId])).rows,[{category,amount:'20'}]);
   const attribution=(await f.admin.query('SELECT b.record,r.run_id,r.actor_id FROM fabric.budget_reservations r JOIN fabric.model_billing_bindings b USING(tenant_id,space_id,run_id) WHERE reservation_id=$1',[o.reservationId])).rows[0];assert.deepEqual(attribution.record,a.binding);assert.equal(attribution.run_id,a.binding.runId);
  }
 });
 await t.test('hierarchy-depth64-cycle-denial-and-each-level-binding',async()=>{
  const depth64=await l.task({space:s,depth:64});await budget(depth64,original(s),1);
  const plan=(await f.admin.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT allowance_id FROM fabric.budget_allowances WHERE tenant_id=$1 AND space_id=$2 AND allowance_id=ANY($3::uuid[]) ORDER BY allowance_id',[f.tenant,s,depth64.ids])).rows[0]['QUERY PLAN'][0];
  assert.equal(plan.Plan['Actual Rows'],64);
  const nodeTypes=(p:Record<string,unknown>):string[]=>[String(p['Node Type']),...((p['Plans']??[])as Record<string,unknown>[]).flatMap(nodeTypes)];
  console.log(JSON.stringify({measurement:'model-ledger-query-plan',query:'sorted-scoped-allowance-lock-candidate',actualRows:plan.Plan['Actual Rows'],nodes:nodeTypes(plan.Plan),qualification:'fixture-only-no-scale-claim'}));

  const depth65=await l.task({space:s,depth:65}),before=await l.snapshot();await assert.rejects(budget(depth65,original(s),1));assert.deepEqual(await l.snapshot(),before);
  for(let index=0;index<6;index++){
   const a=await l.task({space:s}),id=a.ids[index]!,old=(await f.admin.query('SELECT ceiling,reserved,settled FROM fabric.budget_allowances WHERE allowance_id=$1',[id])).rows[0];
   const cap=Number(old.reserved)+Number(old.settled);
   await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2,revision=revision+1 WHERE allowance_id=$1',[id,cap]);
   const state=await l.snapshot();await assert.rejects(budget(a,original(s),1),code('BUDGET_EXHAUSTED'));assert.deepEqual(await l.snapshot(),state);
   await f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2,revision=revision+1 WHERE allowance_id=$1',[id,old.ceiling]);
  }
  const cyclic=await l.task({space:s}),root=cyclic.ids[0]!;
  await f.admin.query('UPDATE fabric.budget_allowances SET parent_allowance_id=$2 WHERE allowance_id=$1',[root,cyclic.leaf]);
  const cycle=await l.snapshot();await assert.rejects(budget(cyclic,original(s),1));assert.deepEqual(await l.snapshot(),cycle);
  await f.admin.query('UPDATE fabric.budget_allowances SET parent_allowance_id=NULL WHERE allowance_id=$1',[root]);
  await budget(cyclic,original(s),1);
  // Canonical tenant/kind/subject accounts cannot clone another Space's capacity.
  await assert.rejects(l.account(100,'person'));
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_accounts WHERE tenant_id=$1 AND kind=$2 AND subject_id=$3',[f.tenant,'person',f.actors[1]])).rows[0].n,1);
 });
 await t.test('scoped-idempotent-topup-separate-control-no-resume',async()=>{
  const a=await l.task({space:s,ceiling:20}),owner=await f.scopeFor(0,s),model=l.model(),input={allowanceId:a.leaf,addedUnits:10,key:randomUUID(),expiresAt:new Date(Date.now()+60_000).toISOString()},before=await f.counters();
  await assert.rejects(model.topUp(a.scope,input),code('UNAUTHORIZED'));
  const result=await model.topUp(owner,input);assert.equal(result.autoResumed,false);assert.deepEqual(await model.topUp(owner,input),result);
  assert.equal((await f.admin.query('SELECT ceiling FROM fabric.budget_allowances WHERE allowance_id=$1',[a.leaf])).rows[0].ceiling,'30');
  await assert.rejects(model.topUp(owner,{...input,addedUnits:11}),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(model.topUp(owner,{...input,key:randomUUID(),allowanceId:randomUUID()}));
  assert.deepEqual(await f.counters(),before);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE run_id=$1',[a.binding.runId])).rows[0].n,0);
  let reached=false;const snapshot=await l.snapshot();await assert.rejects(l.model({async afterStage(stage,tx){if(stage==='audit'){reached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_audit WHERE command_key=$1',[input.key+'-fault'])).rows[0]?.['n'],1);await tx.query('SELECT 1/0');}}}).topUp(owner,{...input,key:input.key+'-fault'}));
  assert.ok(reached);assert.deepEqual(await l.snapshot(),snapshot);
 });
 await t.test('rls-composite-scope-immutable-history-and-fixed-functions',async()=>{
  const rows=(await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='fabric' AND relkind='r' AND relname LIKE 'model_%'")).rows;assert.ok(rows.length>=17);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
  for(const pool of [f.worker,f.client,f.receiptOwner]){await assert.rejects(pool.query('SELECT * FROM fabric.model_operations'));await assert.rejects(pool.query('SELECT fabric.model_reserve($1,$2,$3,$4::jsonb)',[randomUUID(),randomUUID(),randomUUID(),'{"model":40}']));}
  const role=(await f.controller.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.deepEqual(role,{rolsuper:false,rolbypassrls:false});
  const a=await l.task({space:s}),input=await a.makeInput();await l.model().prepare(a.scope,input);
  await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query("UPDATE fabric.model_operations SET binding=jsonb_set(binding,'{payerId}',$4::jsonb) WHERE tenant_id=$1 AND space_id=$2 AND operation_id=$3",[f.tenant,s,input.request.original.operationId,JSON.stringify(f.foreignActor)])));
  await assert.rejects(f.admin.query("UPDATE fabric.model_native_events SET event=event||'{\"kind\":\"forged\"}'::jsonb WHERE session_id=$1",[input.binding.sessionId]));
  await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('INSERT INTO fabric.model_attempts VALUES($1,$2,$3,$4,$5,2,$6::jsonb,$7::jsonb)',[f.tenant,s,randomUUID(),input.request.original.operationId,randomUUID(),JSON.stringify(input.request),JSON.stringify({})])));
 });
 await t.test('awaited-account-lock-and-post-audit-command-expiry-deny',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput(),before=await l.snapshot(),counters=await f.counters();
  const admin=await f.admin.connect();await admin.query('BEGIN');await admin.query('SELECT 1 FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',[a.ids[0]]);
  const short={...input,command:{...input.command,expiresAt:new Date(Date.now()+300).toISOString()}};
  const pending=l.model().prepare(a.scope,short).then(()=>{throw new Error('Expired command admitted');},e=>e);
  await waitUntil(async()=>(await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[f.roles.controller])).rows.length>0,'expired command actual allowance wait');
  await new Promise(r=>setTimeout(r,350));await admin.query('COMMIT');admin.release();
  const error=await pending;assert.equal(error.code,'EXPIRED_COMMAND');assert.deepEqual(await l.snapshot(),before);assert.deepEqual(await f.counters(),counters);
  // Installed current policy is checked at end even after actual audit writes.
  let reached=false;
  await assert.rejects(l.model({async afterStage(stage,tx){if(stage==='audit'){reached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_audit WHERE command_key=$1',[input.command.key])).rows[0]?.['n'],1);await tx.query('SELECT pg_sleep(0.35)');}}}).prepare(a.scope,{...input,command:{...input.command,expiresAt:new Date(Date.now()+300).toISOString()}}),code('EXPIRED_COMMAND'));
  assert.ok(reached);assert.deepEqual(await l.snapshot(),before);
 });
 await t.test('known-error-versus-genuine-lost-commit-no-permit-and-original-recovery',async()=>{
  const a=await l.task({space:s}),input=await a.makeInput();const base=f.foundation;
  const { PostgresUnitOfWork }=await import('../../../g1-foundations/src/postgres-uow.js');
  const { AuthenticatedUnitOfWork }=await import('../../../g1-identity/src/authenticated-uow.js');
  const broken=new ModelRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(base.pool,()=>{throw new Error('lost COMMIT acknowledgement');}),bindingFor:f.bindingFor}),l.authority);
  const counters=await f.counters();await assert.rejects(broken.prepare(a.scope,input),(e:unknown)=>e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT');
  assert.deepEqual(await f.counters(),counters);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_operations WHERE operation_id=$1',[input.request.original.operationId])).rows[0].n,1);
  const digest=(await f.admin.query('SELECT payload_digest FROM fabric.model_command_receipts WHERE command_key=$1',[input.command.key])).rows[0].payload_digest;
  assert.equal((await l.model().lookup(a.scope,input.command.key,digest)).status,'committed');
  assert.deepEqual(safeFailure(new FoundationError('UNKNOWN_COMMIT')),{error:'UNKNOWN_COMMIT',status:'unknown',replayAllowed:false,recovery:'original-key-lookup'});
  assert.equal(safeFailure({code:'UNKNOWN_COMMIT'}).status,'refused');
  // A genuine lost claim-COMMIT acknowledgement leaves durable history, zero
  // dispatch I/O and no recoverable invocation permit.
  await assert.rejects(broken.claim(a.scope,input.request.original.attemptId),(e:unknown)=>e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT');
  assert.equal(await l.model().claim(a.scope,input.request.original.attemptId),null);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.model_claims WHERE attempt_id=$1',[input.request.original.attemptId])).rows[0].n,1);
  assert.deepEqual(await f.counters(),counters);
  const second=await a.makeInput();await assert.rejects(l.model().prepare(a.scope,second),code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION'));
 });
 await t.test('late-session-membership-payer-policy-lock-denials-and-audit-expiry-rollback',async()=>{
  for(const target of ['membership','payer','policy','session-at-account','session-after-audit']as const){
   const x=await createLedgerFixture(),g=x.f;
   try{
    const a=await x.task(),input=await a.makeInput(),counters=await g.counters();
    const before=await x.snapshot();let auditReached=false;
    const identity=g.bindingFor(a.scope);
    const check=async(stage:string,tx:SqlTransaction)=>{
     if(stage==='audit'){auditReached=true;assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_audit WHERE command_key=$1',[input.command.key])).rows[0]?.['n'],1);if(target==='session-after-audit')await tx.query('SELECT pg_sleep(0.7)');}
    };
    if(target.startsWith('session')){
     // Dedicated synthetic fixture session expires once and is never revived.
     await g.admin.query("UPDATE fabric.identity_sessions SET expires_at=clock_timestamp()+interval '600 milliseconds' WHERE issuer=$1 AND subject=$2 AND sid=$3",[identity.issuer,identity.subject,identity.sessionId]);
    }
    if(target==='session-after-audit'){
     await assert.rejects(x.model({afterStage:check}).prepare(a.scope,input));assert.ok(auditReached);
    }else{
     const admin=await g.admin.connect();await admin.query('BEGIN');
     if(target==='membership')await admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp(),revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[g.tenant,g.space,a.scope.actorId]);
     else if(target==='payer')await admin.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[g.tenant,a.scope.payerId]);
     else if(target==='policy')await admin.query('UPDATE fabric.model_policies SET admission_enabled=false WHERE tenant_id=$1 AND space_id=$2',[g.tenant,g.space]);
     else await admin.query('SELECT 1 FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',[a.ids[0]]);
     const pending=x.model({afterStage:check}).prepare(a.scope,input).then(()=>{throw new Error('Late authority accepted');},e=>e);
     await waitUntil(async()=>(await g.admin.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",[g.roles.controller])).rows.length>0,'late '+target+' actual PG wait');
     if(target==='session-at-account')await new Promise(r=>setTimeout(r,650));
     await admin.query('COMMIT');admin.release();
     const e=await pending;assert.ok(e instanceof Error);assert.ok(!('code' in e)||e.code!=='UNKNOWN_COMMIT');
    }
    const after=await x.snapshot();
    // Only the separately committed policy authority change is expected here.
    if(target==='policy'){delete before['model_policies'];delete after['model_policies'];}
    assert.deepEqual(after,before,target);assert.deepEqual(await g.counters(),counters);
   }finally{await x.close();}
  }
 });

});
