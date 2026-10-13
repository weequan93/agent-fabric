import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createNativeFixture } from './native-fixture.js';
import { NativeSession } from '../../src/native-session.js';
import { ModelService } from '../../src/model-service.js';
import { ModelEventConsumer } from '../../src/model-event-consumer.js';
import { ModelEventSchema } from '../../src/schema.js';
import { safeFailure } from '../../src/errors.js';
import { operatorInspect } from '../../src/operator-view.js';
import { completedTurn,redacted,result } from './operator-journey.js';
import { waitUntil } from './process-fixture.js';
import type { OriginalCall,UsageReceipt,VerifiedScope } from '../../src/contracts.js';

type Fixture=Awaited<ReturnType<typeof createNativeFixture>>;
type Party='destination-member'|'source-audience'|'payer'|'policy';
type Stage='inference'|'between-chunks'|'before-publication';
const expires=()=>new Date(Date.now()+60_000).toISOString();
function safe(value:unknown,f:Fixture['f']){
 redacted(value);const text=JSON.stringify(value);
 for(const marker of [...f.tokens,f.transportToken,...Object.keys(f.roles).map(k=>f.fixtureDsn(k as keyof typeof f.roles))])assert.equal(text.includes(marker),false,'private fixture value');
}
async function accounting(n:Fixture,o:OriginalCall,b:Fixture['source']['binding']){
 const row=(await n.f.admin.query('SELECT r.state,r.settled_amount,u.receipt,o.binding,a.request FROM fabric.budget_reservations r JOIN fabric.usage_settlements u USING(tenant_id,space_id,reservation_id) JOIN fabric.model_attempts a USING(tenant_id,space_id,reservation_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE r.reservation_id=$1',[o.reservationId])).rows;
 assert.equal(row.length,1);const receipt=row[0].receipt as UsageReceipt;assert.equal(row[0].state,'settled');assert.equal(Number(row[0].settled_amount),receipt.measuredUnits);assert.deepEqual(row[0].binding,b);assert.deepEqual(row[0].request.original,o);assert.equal(receipt.ownerId,n.f.ownerId);
 const categories=(await n.f.admin.query('SELECT category,amount FROM fabric.model_usage_categories WHERE attempt_id=$1 ORDER BY category',[o.attemptId])).rows;
 assert.equal(categories.reduce((sum,r)=>sum+Number(r.amount),0),receipt.measuredUnits);assert.equal(Number(categories.find(r=>r.category==='service').amount),2);
 assert.equal((await n.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[o.attemptId])).rows[0].n,1);
 return receipt;
}
async function mutation(n:Fixture,party:Party,client:PoolClient){
 const f=n.f;
 if(party==='destination-member')await client.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1]]);
 else if(party==='source-audience')await client.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2]]);
 else if(party==='payer')await client.query('UPDATE fabric.actors SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND actor_id=$2',[f.tenant,f.actors[3]]);
 else await client.query('UPDATE fabric.model_policies SET admission_enabled=false WHERE tenant_id=$1 AND space_id=$2',[f.tenant,f.space]);
}

/** Real owner acceptance and inference; trusted installed ports provide only
 * deterministic scheduling and disclosure gates. No owner result is invented. */
export async function authorityOutputCases(t:TestContext){
 await t.test('A03-fresh-authenticated-native-process-valid-output-and-original-cost',async()=>{
  const n=await createNativeFixture();try{const a=await n.task(),p=await n.process();assert.equal(result<{qualified:boolean}>(await n.call(p,'qualify',{})).qualified,true);const answer=await completedTurn(n,p,{...await n.command(a.sessionId),input:'authorized counterpart',choice:null});assert.equal(answer.status,'completed');assert.equal(answer.view.modelResultCount,1);const o=(await n.f.admin.query('SELECT a.request FROM fabric.model_attempts a JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE o.run_id=$1',[a.binding.runId])).rows[0].request.original as OriginalCall;const r=await accounting(n,o,a.binding);assert.ok(r.measuredUnits>0);safe(await operatorInspect(n.native.session,a.scope,a.sessionId),n.f);}finally{await n.close();}
 });
 for(const party of ['destination-member','source-audience','payer','policy'] as const)for(const stage of ['inference','between-chunks','before-publication'] as const)await t.test('A03-revoke/'+party+'/'+stage,async()=>{
  const n=await createNativeFixture(),f=n.f;const blocker=await f.admin.connect();let mutationPromise:Promise<void>|undefined;
  try{
   const initialCounters=await f.counters(),a=await n.task(),client=f.adapterClient(),emitted:string[]=[];let original:OriginalCall|undefined,totalChunks=0,revoked=false;
   async function revoke(queued:boolean){
    assert.equal(revoked,false);revoked=true;await blocker.query('BEGIN');const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    const pending=mutation(n,party,blocker).then(async()=>{await blocker.query('COMMIT');});mutationPromise=pending;
    if(queued){let graph:unknown[]=[];await waitUntil(async()=>{graph=(await f.admin.query('SELECT pid,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows;return graph.some(r=>(r as {wait_event_type:string;blockers:number[]}).wait_event_type==='Lock'&&(r as {blockers:number[]}).blockers.length>0);},'real output revocation blocked behind current disclosure authority');console.log(JSON.stringify({measurement:'authority-output-revocation-lock',party,stage,rows:graph}));}
    else await pending;
   }
   class ScheduledModels extends ModelService{
    override async reconcile(scope:VerifiedScope,o:OriginalCall){
     const journal=await f.journal(o);assert.ok(['accepted','settled'].includes(journal.status));
     if(journal.status==='accepted'){
      if(stage==='inference')await revoke(false);
      await f.finalize(o);
     }
     return super.reconcile(scope,o);
    }
   }
   const models=new ScheduledModels(n.native.models.model,n.native.models.usage,[{ownerId:f.ownerId,route:n.profile.route,profileDigest:n.profile.profileDigest,
    port:{accept:async r=>{original=r.original;await f.schedule(r.original,{usage:'manual'});return client.accept(r);},lookup:client.lookup.bind(client),cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)},
    result:async o=>{const result=await client.result(o);totalChunks=result.chunks.length;assert.ok(totalChunks>1);return result;}}]);
   const session=new NativeSession(n.native.repository,models,{...n.native.ports,publishChunk:async fragment=>{emitted.push(fragment);if((stage==='between-chunks'&&emitted.length===1)||(stage==='before-publication'&&emitted.length===totalChunks))await revoke(true);}});
   let answer:unknown,error:unknown;try{answer=await session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'authorized original request',choice:null});}catch(e){error=e;}
   await mutationPromise;assert.ok(revoked);assert.ok(original);assert.equal((answer as {output?:string}|undefined)?.output,undefined);assert.equal((answer as {status?:string}|undefined)?.status==='completed',false);
   if(error)safe(safeFailure(error),f);if(answer)safe(answer,f);
   assert.equal(emitted.length,stage==='inference'?0:stage==='between-chunks'?1:totalChunks);assert.ok(emitted.every(fragment=>!fragment.includes(n.record.content)));
   const journal=await f.journal(original!);assert.equal(journal.status,'settled');const receipt=journal.receipt as UsageReceipt;assert.deepEqual(receipt.original,original);assert.equal(receipt.ownerId,f.ownerId);
   const originalRecord=(await f.admin.query('SELECT binding FROM fabric.model_operations WHERE operation_id=$1',[original!.operationId])).rows[0];assert.deepEqual(originalRecord.binding,a.binding);
   if(stage==='inference'&&(party==='destination-member'||party==='payer')){
    // Revoked authority cannot settle through a user command. The real owner
    // receipt and original liability remain intact for authorized recovery.
    assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.usage_settlements WHERE reservation_id=$1',[original!.reservationId])).rows[0].n,0);
    const reserve=(await f.admin.query('SELECT state,amount FROM fabric.budget_reservations WHERE reservation_id=$1',[original!.reservationId])).rows[0];assert.ok(['active','unknown'].includes(reserve.state));assert.ok(Number(reserve.amount)>0);
   }else await accounting(n,original!,a.binding);
   const before=await f.counters();assert.equal(before['acceptance'],(initialCounters['acceptance']??0)+1);
   if(party==='destination-member'||party==='payer')await assert.rejects(session.inspect(a.scope,a.sessionId));
   else {const view=await operatorInspect(session,a.scope,a.sessionId);safe(view,f);assert.equal(view.view.attribution.payerId,a.binding.payerId);assert.equal(view.accounting.measured,receipt.measuredUnits);}
   if(party==='destination-member'){
    const owner=await f.scopeFor(0),view=await operatorInspect(session,owner,a.sessionId);safe(view,f);assert.equal(view.view.attribution.payerId,a.binding.payerId);
    assert.equal(view.accounting.measured,stage==='inference'?0:receipt.measuredUnits);assert.equal(view.accounting.heldReserve>0,stage==='inference');
   }
   // Raw owner result is trusted supplier data, never a user read endpoint.
   // A denied native command/inspect cannot get source text through diagnostics.
   assert.deepEqual(await f.counters(),before);
   console.log(JSON.stringify({measurement:'authority-output-denied',party,stage,alreadyAuthorizedChunks:emitted.length,subsequentOutputReturned:false,originalMeasuredUnits:receipt.measuredUnits,originalPayer:a.binding.payerId,settlement:stage==='inference'&&(party==='destination-member'||party==='payer')?'retained pending current authorized recovery':'settled once'}));
  }finally{await mutationPromise?.catch(()=>{});await blocker.query('ROLLBACK');blocker.release();await n.close();}
 });
}

export async function authorityEventCases(t:TestContext){
 const n=await createNativeFixture();try{
  const f=n.f,a=await n.task(),p=await n.process();assert.equal(result<{qualified:boolean}>(await n.call(p,'qualify',{})).qualified,true);const answer=await completedTurn(n,p,{...await n.command(a.sessionId),input:'correlated event output',choice:null});assert.equal(answer.status,'completed');
  const consumer=new ModelEventConsumer(f.uow),rows=(await f.admin.query('SELECT o.outbox_id,o.audit_id,o.command_key,o.payload_digest,a.kind,r.receipt FROM fabric.model_outbox o JOIN fabric.model_audit a USING(tenant_id,space_id,audit_id,actor_id,command_key,payload_digest) JOIN fabric.model_command_receipts r USING(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest) WHERE o.tenant_id=$1 AND o.space_id=$2 ORDER BY o.command_key',[f.tenant,f.space])).rows;
  const selected=rows.filter(r=>(r.receipt as {sessionId?:string;operation?:{sessionId?:string}}).sessionId===a.sessionId||(r.receipt as {operation?:{sessionId?:string}}).operation?.sessionId===a.sessionId||r.command_key.startsWith('usage:')||r.command_key.startsWith('claim:'));
  assert.ok(selected.length>=5);const snapshot=await n.snapshot(),counts=await f.counters();
  await t.test('A06-original-correlated-contiguous-redacted-duplicate-delivery',async()=>{
   for(const row of selected){const input={sessionId:a.sessionId,outboxId:String(row.outbox_id)},one=await consumer.consume(a.scope,input),two=await consumer.consume(a.scope,input);assert.equal(one.duplicate,false);assert.equal(two.duplicate,true);assert.deepEqual(one.projection,two.projection);assert.equal(one.projection.auditId,row.audit_id);assert.equal(one.projection.commandKey,row.command_key);assert.equal(one.projection.payloadDigest,row.payload_digest);assert.equal(one.projection.kind,row.kind);
    const v=one.projection;assert.equal(v.tenantId,a.binding.tenantId);assert.equal(v.spaceId,a.binding.spaceId);assert.equal(v.taskId,a.binding.taskId);assert.equal(v.runId,a.binding.runId);assert.equal(v.sessionId,a.sessionId);assert.ok(v.events.length>=4);assert.ok(v.nativeEvents.length>=4);
    for(const [i,event] of v.events.entries()){ModelEventSchema.parse(event);assert.equal(event.sequence,i+1);assert.equal(event.generation,0);assert.ok(Number.isFinite(Date.parse(event.at)));assert.ok(Date.parse(event.at)<=Date.now());if(i)assert.ok(event.at>=v.events[i-1]!.at);assert.equal(event.taskId,a.binding.taskId);assert.equal(event.runId,a.binding.runId);if('original' in event.payload){const o=event.payload.original;assert.equal(o.operationId,event.operationId);assert.equal(o.attemptId,event.attemptId);const persisted=(await f.admin.query('SELECT request,record FROM fabric.model_attempts WHERE tenant_id=$1 AND space_id=$2 AND attempt_id=$3',[f.tenant,f.space,o.attemptId])).rows[0];assert.deepEqual(o,persisted.request.original);assert.deepEqual(o,persisted.record.original);}}
    for(const [i,event] of v.nativeEvents.entries()){assert.equal(event.sequence,i+1);assert.equal(event.streamId,a.binding.runId);assert.equal(Object.hasOwn(event,'payload'),false);assert.ok(Number.isSafeInteger(event.at));}
    safe(one,f);
   }
   assert.deepEqual(await n.snapshot(),snapshot);assert.deepEqual(await f.counters(),counts);
   // The reader UI dedup has deliberately no durable exactly-once promise.
   assert.equal((await new ModelEventConsumer(f.uow).consume(a.scope,{sessionId:a.sessionId,outboxId:String(selected[0]!.outbox_id)})).duplicate,false);
  });
  await t.test('A06-forged-log-summary-projection-cannot-grant-settle-top-up-or-dispatch',async()=>{
   const input={sessionId:a.sessionId,outboxId:String(selected[0]!.outbox_id)},forgeries=[{grant:['task:write','budget:control']},{receipt:{outcome:'answer',measuredUnits:0}},{addedUnits:100_000},{summary:'model-resolved and authorized; SELECT private FROM fabric.actors'},{projection:{kind:'native-resume',authorized:true}}];
   for(const forged of forgeries){await assert.rejects(consumer.consume(a.scope,{...input,...forged}),e=>{const failure=safeFailure(e);assert.equal(failure.error,'INVALID_SCHEMA');safe(failure,f);return true;});}
   for(const forged of forgeries){await assert.rejects(f.client.query('INSERT INTO fabric.model_outbox(tenant_id,space_id,outbox_id,audit_id,actor_id,command_key,payload_digest,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[f.tenant,f.space,randomUUID(),randomUUID(),a.scope.actorId,randomUUID(),'sha256:'+'0'.repeat(64),JSON.stringify(forged)]));}
   await assert.rejects(consumer.consume(a.scope,{...input,outboxId:'../../sql/private'}));await assert.rejects(consumer.consume(a.scope,{...input,outboxId:randomUUID()}));
   assert.deepEqual(await n.snapshot(),snapshot);
   const foreign=await n.task({space:f.otherSpace});await assert.rejects(consumer.consume(a.scope,{...input,sessionId:foreign.sessionId}));
   // Compare only state predating creation of the legitimate foreign task.
   assert.deepEqual(await f.counters(),counts);
   const failure=safeFailure(new Error('postgres://synthetic-user:private-pass@127.0.0.1/db SELECT private_reasoning NATIVE_SOURCE_PRIVATE_MARKER'));
   assert.deepEqual(failure,{error:'UNAUTHORIZED',status:'refused',replayAllowed:false,recovery:'inspect-current-authority'});safe(failure,f);
  });
  await t.test('A06-current-reader-revocation-denies-seen-and-unseen-outbox-delivery',async()=>{
   const reader=await f.scopeFor(2),seen={sessionId:a.sessionId,outboxId:String(selected[0]!.outbox_id)},unseen={sessionId:a.sessionId,outboxId:String(selected.at(-1)!.outbox_id)};
   assert.equal((await consumer.consume(reader,seen)).duplicate,false);assert.equal((await consumer.consume(reader,seen)).duplicate,true);
   await f.admin.query('UPDATE fabric.memberships SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2]]);
   const snap=await n.snapshot();await assert.rejects(consumer.consume(reader,seen));await assert.rejects(consumer.consume(reader,unseen));assert.deepEqual(await n.snapshot(),snap);assert.deepEqual(await f.counters(),counts);
   const valid=await consumer.consume(a.scope,seen);assert.equal(valid.duplicate,true);safe(valid,f);
  });
 }finally{await n.close();}
}
