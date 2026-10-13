import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createNativeFixture } from './helpers/native-fixture.js';
import { completedTurn,operator,result,details,requestFor } from './helpers/operator-journey.js';
import type { VerifiedScope } from '../src/contracts.js';
import { waitUntil } from './helpers/process-fixture.js';
import { OriginalCallSchema } from '../src/schema.js';
import { authorityCredentials } from './helpers/authority-credentials.js';
import { authorityOutputCases,authorityEventCases } from './helpers/authority-output-events.js';
import { authorityLateBoundaryCases,authorityOriginalLookupCases } from './helpers/authority-late.js';
import { createModelFixture } from './helpers/pg-fixture.js';

test('A01',async t=>{
 const n=await createNativeFixture(),f=n.f;t.after(n.close);
 const a=await n.task(),foreign=await n.task({space:f.otherSpace,noSources:true}),p=await n.process(),op=operator(n,p);
 const sharedAccount=await n.account(10_000_000);
 result(await op('qualify',{}));
 const before=await n.snapshot(),counters=await f.counters();
 for(const [label,scope]of [['copy',{...a.scope}],['json',JSON.parse(JSON.stringify(a.scope))],['forged-payer',{...a.scope,payerId:f.actors[0]}],['foreign-tenant',{...a.scope,tenantId:f.foreignTenant,spaceId:f.foreignSpace,actorId:f.foreignActor}]] as const)await t.test('unissued-scope/'+label,async()=>{
  await assert.rejects(n.native.session.inspect(scope as VerifiedScope,a.sessionId));
  await assert.rejects(n.native.repository.open(scope as VerifiedScope,a.binding.runId,a.admission));
 });
 for(const fields of [{payerId:f.actors[0]},{team:'shared-billing-is-not-an-audience'},{costCenter:'forged-center'},{accountId:randomUUID()},{ownerId:f.foreignActor},{binding:foreign.binding},{grants:['budget:control']}])await t.test('native-client-cannot-stamp/'+Object.keys(fields)[0],async()=>{
  assert.equal((await n.call(p,'requestTurn',{...await n.command(a.sessionId),input:'authorized input',choice:null,...fields}))['error'],'INVALID_SCHEMA');
 });
 for(const index of [0,2])await t.test('current-Space-reader-cannot-control-another-owner/'+index,async()=>{
  const view=await n.native.session.inspect(f.issued[index]!,a.sessionId);
  assert.equal(view.taskId,a.binding.taskId);assert.equal(JSON.stringify(view).includes('NATIVE_SOURCE_PRIVATE_MARKER'),false);
  await assert.rejects(n.native.session.requestTurn(f.issued[index]!,{...await n.command(a.sessionId),input:'cannot control another owner',choice:null}));
 });
 await t.test('issued-other-space-and-foreign-session-refuse',async()=>{
  await assert.rejects(n.native.session.inspect(foreign.scope,a.sessionId));
  assert.ok((await op('operatorInspect',{sessionId:foreign.sessionId}))['error']);
  await assert.rejects(n.native.repository.open(a.scope,foreign.binding.runId,a.admission));
 });
 assert.deepEqual(await n.snapshot(),before);assert.deepEqual(await f.counters(),counters);
 // This counterpart executes actual inference and owner usage on an issued scope.
 assert.equal((await completedTurn(n,p,{...await n.command(a.sessionId),input:'authorized input',choice:null})).status,'completed');
 const request=await requestFor(n,a.binding.runId),journal=await f.journal(request.original),authorized=await details(n,p,a.sessionId);
 assert.equal(journal.status,'settled');assert.equal(authorized.accounting.attemptCount,1);assert.equal(authorized.accounting.measured,journal.receipt.measuredUnits);assert.equal(authorized.view.attribution.payerId,f.actors[3]);
 await t.test('shared-payer-account-does-not-disclose-another-Space-cost-or-content',async()=>{
  const cursor=f.adapter().messages.length;await f.arm('lost-ack');
  const pending=n.native.session.requestTurn(foreign.scope,{sessionId:foreign.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+60_000).toISOString(),input:'A01_FOREIGN_SPACE_PRIVATE_CONTENT',choice:null});
  await waitUntil(async()=>f.adapter().messages.slice(cursor).some(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack'),'A01 foreign valid owner');
  const original=OriginalCallSchema.parse(f.adapter().messages.slice(cursor).find(m=>m['kind']==='barrier-hit'&&m['hook']==='lost-ack')!['original']);await f.finalize(original);await f.release('lost-ack');assert.equal((await pending).status,'completed');
  const receipt=(await f.journal(original)).receipt,account=(await f.admin.query('SELECT settled FROM fabric.model_accounts WHERE account_id=$1',[sharedAccount])).rows[0];assert.equal(Number(account.settled),journal.receipt.measuredUnits+receipt.measuredUnits);
  const own=await details(n,p,a.sessionId);assert.equal(own.accounting.measured,journal.receipt.measuredUnits);assert.equal(own.accounting.attemptCount,1);
  const text=JSON.stringify(own);for(const marker of ['A01_FOREIGN_SPACE_PRIVATE_CONTENT',foreign.sessionId,foreign.binding.taskId,foreign.binding.runId,sharedAccount])assert.equal(text.includes(marker),false);
 });
 const settled=await n.snapshot(),accepted=await f.counters();
 const tables=(await f.admin.query("SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE c.relkind='r' AND ((n.nspname='fabric' AND c.relname LIKE 'model_%') OR n.nspname='model_receipts') ORDER BY 1,2")).rows as {nspname:string;relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean;owner:string}[];
 assert.ok(tables.length>=25);
 for(const row of tables){assert.equal(row.relrowsecurity,true,row.relname);assert.equal(row.relforcerowsecurity,true,row.relname);}
 const pools={client:f.client,worker:f.worker,receipt:f.receiptOwner,idp:f.idpPool,controller:f.controller,authority:f.authority};
 for(const [kind,pool]of Object.entries(pools))await t.test('nonprivileged-real-login/'+kind,async()=>{
  const row=(await pool.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.equal(row.name,f.roles[kind as keyof typeof f.roles]);for(const field of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole'])assert.equal(row[field],false);
  for(const table of tables)assert.notEqual(row.name,table.owner);
 });
 for(const kind of ['client','worker','receipt','idp'] as const)await t.test('direct-SQL-and-scope-GUC-do-not-grant/'+kind,async()=>{
  const pool=pools[kind];
  // GUCs are assertions for a trusted controller; setting them on an untrusted
  // role never confers schema, function or accounting privileges.
  const connection=await pool.connect();try{
   await connection.query('BEGIN');await connection.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true)",[f.tenant,f.space,a.scope.actorId]);await connection.query('COMMIT');
  }finally{connection.release();}
  for(const table of tables.filter(r=>r.nspname==='fabric')){
   const name='fabric.'+table.relname;
   for(const sql of ['SELECT * FROM '+name,'INSERT INTO '+name+' DEFAULT VALUES','UPDATE '+name+' SET tenant_id=tenant_id WHERE false','DELETE FROM '+name+' WHERE false'])await assert.rejects(pool.query(sql),e=>(e as {code:string}).code==='42501',kind+' '+sql);
  }
  await assert.rejects(pool.query('SELECT fabric.model_operator_accounting($1)',[a.sessionId]),e=>(e as {code:string}).code==='42501');
  await assert.rejects(pool.query('SELECT fabric.model_top_up($1,1)',[a.leaf]),e=>(e as {code:string}).code==='42501');
 });
 await t.test('receipt-role-own-journal-only-and-controller-cannot-read-receipt-domain',async()=>{
  const own=await f.receiptOwner.query('SELECT owner_id,attempt_id FROM model_receipts.journal WHERE attempt_id=$1',[request.original.attemptId]);assert.equal(own.rows.length,1);assert.equal(own.rows[0].owner_id,f.ownerId);
  // Put a genuinely different receipt owner in the same database. A predicate
  // over a nonexistent foreign row would not establish receipt-owner isolation.
  const second=await createModelFixture(n.profile);try{
   const input=await a.makeInput(),original=input.request.original;
   await second.schedule(original,{usage:'manual'});assert.equal((await second.adapterClient().accept(input.request)).status,'accepted');await second.finalize(original);
   const foreignJournal=await second.journal(original);assert.equal(foreignJournal.status,'settled');assert.equal(foreignJournal.owner_id,second.ownerId);
   assert.equal((await second.receiptOwner.query('SELECT * FROM model_receipts.journal WHERE owner_id=$1 AND attempt_id=$2',[second.ownerId,original.attemptId])).rows.length,1);
   assert.equal((await f.receiptOwner.query('SELECT * FROM model_receipts.journal WHERE owner_id=$1 AND attempt_id=$2',[second.ownerId,original.attemptId])).rows.length,0);
   assert.equal((await f.receiptOwner.query('SELECT * FROM model_receipts.access WHERE login_name=$1',[second.roles.receipt])).rows.length,0);
   await assert.rejects(f.receiptOwner.query('INSERT INTO model_receipts.journal SELECT (jsonb_populate_record(NULL::model_receipts.journal,$1::jsonb)).*',[JSON.stringify(foreignJournal)]),e=>(e as {code:string}).code==='42501');
   assert.deepEqual(await second.journal(original),foreignJournal);
  }finally{await second.close();}
  assert.equal((await f.receiptOwner.query('SELECT * FROM model_receipts.journal WHERE owner_id<>$1',[f.ownerId])).rows.length,0);
  for(const pool of [f.controller,f.client,f.worker,f.authority])await assert.rejects(pool.query('SELECT * FROM model_receipts.journal'),e=>(e as {code:string}).code==='42501');
 });
 await t.test('FORCE-RLS-scoped-controller-and-aggregate-functions-hide-other-space',async()=>{
  await f.uow.withScope(a.scope,async tx=>{
   const own=(await tx.query('SELECT binding FROM fabric.model_sessions WHERE session_id=$1',[a.sessionId])).rows;assert.equal(own.length,1);assert.deepEqual(own[0]?.['binding'],a.binding);
   for(const table of tables.filter(r=>r.nspname==='fabric'&&r.relname!=='model_accounts'))assert.equal((await tx.query('SELECT * FROM fabric.'+table.relname+' WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.otherSpace])).rows.length,0,table.relname);
  });
  await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT * FROM fabric.model_accounts')),e=>(e as {code:string}).code==='42501');
  await assert.rejects(f.uow.withScope(a.scope,tx=>tx.query('SELECT fabric.model_operator_accounting($1)',[foreign.sessionId])));
  await assert.rejects(f.uow.withScope(foreign.scope,tx=>tx.query('SELECT fabric.model_operator_accounting($1)',[a.sessionId])));
 });
 await t.test('composite-Space-FK-and-original-binding-remain-immutable',async()=>{
  await assert.rejects(f.admin.query('UPDATE fabric.model_operations SET binding=$2::jsonb WHERE operation_id=$1',[request.original.operationId,JSON.stringify({...a.binding,payerId:f.actors[0]})]));
  await assert.rejects(f.admin.query('INSERT INTO fabric.model_sessions VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[f.tenant,f.otherSpace,randomUUID(),a.binding.taskId,a.binding.runId,JSON.stringify(a.binding),JSON.stringify(a.origin)]),e=>(e as {code:string}).code==='23503');
  await assert.rejects(f.admin.query('INSERT INTO fabric.model_claims(tenant_id,space_id,claim_id,attempt_id,dispatch_epoch) VALUES($1,$2,$3,$4,1)',[f.foreignTenant,f.foreignSpace,randomUUID(),request.original.attemptId]),e=>(e as {code:string}).code==='23503');
 });
 assert.deepEqual(await n.snapshot(),settled);assert.deepEqual(await f.counters(),accepted);
});
test('A02',authorityLateBoundaryCases);
test('A03',authorityOutputCases);
test('A04',authorityOriginalLookupCases);
test('A05',authorityCredentials);
test('A06',authorityEventCases);
