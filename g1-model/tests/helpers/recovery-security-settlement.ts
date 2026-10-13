import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRecoveryFixture,code } from './recovery-fixture.js';
import { originalKeyLock,ModelRepository } from '../../src/model-repository.js';
import { AuthenticatedUnitOfWork } from '../../../g1-identity/src/authenticated-uow.js';
import { UsageRepository,type UsageHooks } from '../../src/usage-repository.js';
import { ModelService } from '../../src/model-service.js';
import { stopOwned,waitUntil } from './process-fixture.js';
import type { InstalledAdapter } from '../../src/model-service.js';
import type { OriginalCall,OwnerObservation,UsageReceipt,TaskCallBinding } from '../../src/contracts.js';

type Fixture=Awaited<ReturnType<typeof createRecoveryFixture>>;
const result=<T>(r:Record<string,unknown>):T=>{assert.equal(r['error'],undefined,JSON.stringify(r));assert.ok(r['result']);return r['result'] as T;};
async function faults(l:Fixture){
 await l.f.admin.query('CREATE TABLE IF NOT EXISTS public.recovery_observation_faults(id uuid PRIMARY KEY,observation jsonb NOT NULL)');
 if(!(await l.f.admin.query("SELECT 1 FROM pg_trigger WHERE tgrelid='public.recovery_observation_faults'::regclass AND tgname='recovery_observation_immutable'")).rowCount)await l.f.admin.query('CREATE TRIGGER recovery_observation_immutable BEFORE UPDATE OR DELETE ON public.recovery_observation_faults FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()');
 await l.f.admin.query('GRANT SELECT ON public.recovery_observation_faults TO '+l.f.roles.controller);
}
async function persist(l:Fixture,observation:OwnerObservation){
 await faults(l);const id=randomUUID();await l.f.admin.query('INSERT INTO public.recovery_observation_faults VALUES($1,$2::jsonb)',[id,JSON.stringify(observation)]);return id;
}
/** Trusted composition injects only immutable persisted synthetic observations.
 * The adapter's original owner journal is never overwritten to forge a result. */
function installedFault(l:Fixture,id:string,seen:{ownerId:string;original:OriginalCall}[],beforeReturn?:()=>Promise<void>):InstalledAdapter{
 const real=l.f.adapterClient();
 return {...l.installed(),port:{accept:real.accept.bind(real),cancel:real.cancel.bind(real),sealUnaccepted:real.sealUnaccepted.bind(real),async lookup(original){
  seen.push({ownerId:l.f.ownerId,original:structuredClone(original)});
  const row=(await l.f.admin.query('SELECT observation FROM public.recovery_observation_faults WHERE id=$1',[id])).rows[0];assert.ok(row);
  await beforeReturn?.();return row.observation as OwnerObservation;
 }}};
}
async function known(l:Fixture,space?:string){
 const a=await l.task(space?{space}:{}),input=await a.makeInput(),o=input.request.original,svc=l.service();
 await svc.prepare(a.scope,input);await l.f.schedule(o,{usage:'manual'},true);assert.equal((await svc.dispatch(a.scope,o)).status,'unknown');assert.equal((await l.reservation(o)).state,'unknown');
 await l.f.finalize(o);const journal=await l.f.journal(o);assert.equal(journal.status,'settled');
 return {a,input,o,svc,journal,receipt:journal.receipt as UsageReceipt};
}
async function exactAccounting(l:Fixture,o:OriginalCall,receipt:UsageReceipt,binding:TaskCallBinding){
 assert.equal(await l.count('model_resolutions',o),1);
 const r=await l.reservation(o);assert.equal(r.state,'settled');assert.equal(Number(r.settled_amount),Math.min(Number(r.amount),receipt.measuredUnits));
 const usage=(await l.f.admin.query('SELECT receipt FROM fabric.usage_settlements WHERE reservation_id=$1',[o.reservationId])).rows;assert.equal(usage.length,1);assert.deepEqual(usage[0].receipt,receipt);
 const attribution=(await l.f.admin.query('SELECT b.record AS binding,o.binding AS original_binding,a.request,a.record AS attempt FROM fabric.usage_settlements u JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) JOIN fabric.model_billing_bindings b USING(tenant_id,space_id,run_id) JOIN fabric.model_attempts a USING(tenant_id,space_id,reservation_id) JOIN fabric.model_operations o USING(tenant_id,space_id,operation_id) WHERE u.reservation_id=$1',[o.reservationId])).rows;
 assert.equal(attribution.length,1);assert.deepEqual(attribution[0].binding,binding);assert.deepEqual(attribution[0].original_binding,binding);assert.deepEqual(attribution[0].request.original,o);assert.equal(attribution[0].attempt.profileDigest,l.f.profile.profileDigest);assert.equal(receipt.ownerId,l.f.ownerId);
 const categories=(await l.f.admin.query('SELECT category,amount FROM fabric.model_usage_categories WHERE attempt_id=$1 ORDER BY category',[o.attemptId])).rows;
 assert.equal(categories.reduce((n,r)=>n+Number(r.amount),0),receipt.measuredUnits);
 const key='usage:'+o.attemptId+':settled';
 for(const table of ['model_audit','model_outbox','model_command_receipts'])assert.equal((await l.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[key])).rows[0].n,1);
 assert.equal((await l.f.admin.query("SELECT count(*)::int AS n FROM fabric.model_events WHERE tenant_id=$1 AND space_id=$2 AND event->>'attemptId'=$3 AND event->>'kind'='usage-settled'",[o.tenantId,o.spaceId,o.attemptId])).rows[0].n,1);
}
async function originalJournal(l:Fixture,k:Awaited<ReturnType<typeof known>>){assert.deepEqual(await l.f.journal(k.o),k.journal);}

export function registerSecuritySettlement(getFixture:()=>Fixture):void{
 test('U05',async t=>{
  const l=getFixture();
  const publicFields:Record<string,unknown>[]=[{outcome:'answer'},{units:0},{measuredUnits:0},{payerId:l.f.actors[3]},{profileDigest:l.f.profile.profileDigest},{ownerId:l.f.ownerId},{receipt:{}},{usageKey:'counterfeit-owner-key'},{binding:{}},{route:'http://arbitrary.invalid'}];
  for(const fields of publicFields)await t.test('identity-only-public-schema/'+Object.keys(fields)[0],async()=>{
   const k=await known(l),seen:{ownerId:string;original:OriginalCall}[]=[],id=await persist(l,{status:'settled',receipt:k.receipt}),svc=l.service({},[installedFault(l,id,seen)]),snap=await l.snapshot(),counts=await l.f.counters();
   await assert.rejects(svc.reconcile(k.a.scope,{...k.o,...fields} as OriginalCall),code('INVALID_SCHEMA'));assert.equal(seen.length,0);assert.deepEqual(await l.snapshot(),snap);assert.deepEqual(await l.f.counters(),counts);
   const positive=await svc.reconcile(k.a.scope,k.o);assert.equal(positive.status,'settled');assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:k.o}]);await exactAccounting(l,k.o,k.receipt,k.a.binding);await originalJournal(l,k);
  });
  for(const variant of ['operation','attempt','reservation','digest','foreign-space','foreign-actor'] as const)await t.test('original-identity-and-scope/'+variant,async()=>{
   const k=await known(l),seen:{ownerId:string;original:OriginalCall}[]=[],id=await persist(l,{status:'settled',receipt:k.receipt}),svc=l.service({},[installedFault(l,id,seen)]),snap=await l.snapshot(),counts=await l.f.counters();
   const original={...k.o,...(variant==='operation'?{operationId:randomUUID()}:variant==='attempt'?{attemptId:randomUUID()}:variant==='reservation'?{reservationId:randomUUID()}:variant==='digest'?{requestDigest:'sha256:'+'f'.repeat(64)}:{})};
   const scope=variant==='foreign-space'?await l.f.scopeFor(1,l.f.otherSpace):variant==='foreign-actor'?await l.f.scopeFor(0):k.a.scope;
   await assert.rejects(svc.reconcile(scope,original),code(variant==='attempt'?'UNAUTHORIZED':variant==='foreign-space'||variant==='foreign-actor'?'SCOPE_MISMATCH':'CHECK_BINDING_MISMATCH'));
   assert.equal(seen.length,0);assert.deepEqual(await l.snapshot(),snap);assert.deepEqual(await l.f.counters(),counts);
   assert.equal((await svc.reconcile(k.a.scope,k.o)).status,'settled');assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:k.o}]);await exactAccounting(l,k.o,k.receipt,k.a.binding);await originalJournal(l,k);
  });
  for(const variant of ['owner','tenant','space','operation','attempt','reservation','digest'] as const)await t.test('trusted-port-counterfeit-receipt/'+variant,async()=>{
   const k=await known(l),receipt={...k.receipt,original:{...k.o}};
   if(variant==='owner')receipt.ownerId=randomUUID();else receipt.original={...receipt.original,...(variant==='tenant'?{tenantId:randomUUID()}:variant==='space'?{spaceId:l.f.otherSpace}:variant==='operation'?{operationId:randomUUID()}:variant==='attempt'?{attemptId:randomUUID()}:variant==='reservation'?{reservationId:randomUUID()}:{requestDigest:'sha256:'+'e'.repeat(64)})};
   const seen:{ownerId:string;original:OriginalCall}[]=[],id=await persist(l,{status:'settled',receipt}),svc=l.service({},[installedFault(l,id,seen)]),snap=await l.snapshot(),counts=await l.f.counters();
   await assert.rejects(svc.reconcile(k.a.scope,k.o),code('CHECK_BINDING_MISMATCH'));assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:k.o}]);assert.deepEqual(await l.snapshot(),snap);assert.deepEqual(await l.f.counters(),counts);await originalJournal(l,k);
   assert.equal((await k.svc.reconcile(k.a.scope,k.o)).status,'settled');await exactAccounting(l,k.o,k.receipt,k.a.binding);
  });
  await t.test('trusted-registry-selects-persisted-original-owner-never-decoy-destination',async()=>{
   const k=await known(l),seen:{ownerId:string;original:OriginalCall}[]=[],id=await persist(l,{status:'settled',receipt:k.receipt});let decoyCalls=0;
   const decoy=async():Promise<OwnerObservation>=>{decoyCalls++;throw new Error('Reconciliation consulted an arbitrary owner destination');};
   const svc=l.service({},[{ownerId:randomUUID(),route:'synthetic-decoy-route',profileDigest:'sha256:'+'d'.repeat(64),port:{accept:decoy,lookup:decoy,cancel:decoy,sealUnaccepted:decoy}},installedFault(l,id,seen)]);
   const snap=await l.snapshot();await assert.rejects(l.usage().install(k.a.scope,k.o,{ownerId:randomUUID(),route:l.f.profile.route,profileDigest:l.f.profile.profileDigest}),code('IDEMPOTENCY_CONFLICT'));assert.deepEqual(await l.snapshot(),snap);
   await assert.rejects(l.f.admin.query('UPDATE public.recovery_observation_faults SET observation=$2::jsonb WHERE id=$1',[id,JSON.stringify({status:'unknown',original:k.o})]));
   assert.equal((await svc.reconcile(k.a.scope,k.o)).status,'settled');assert.equal(decoyCalls,0);assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:k.o}]);await exactAccounting(l,k.o,k.receipt,k.a.binding);await originalJournal(l,k);
  });
  for(const secondSpace of ['same-space','cross-space'] as const)await t.test('receipt-and-owner-usageKey-cannot-settle-another-call/'+secondSpace,async sub=>{
   const first=await known(l);await first.svc.reconcile(first.a.scope,first.o);const second=await known(l,secondSpace==='cross-space'?l.f.otherSpace:undefined);
   for(const variant of ['original-receipt','rebound-original-reused-usageKey'] as const)await sub.test(variant,async()=>{
    const receipt=variant==='original-receipt'?first.receipt:{...second.receipt,usageKey:first.receipt.usageKey},seen:{ownerId:string;original:OriginalCall}[]=[],id=await persist(l,{status:'settled',receipt}),snap=await l.snapshot();
    await assert.rejects(l.service({},[installedFault(l,id,seen)]).reconcile(second.a.scope,second.o),code(variant==='original-receipt'?'CHECK_BINDING_MISMATCH':'IDEMPOTENCY_CONFLICT'));
    assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:second.o}]);assert.deepEqual(await l.snapshot(),snap);assert.equal((await l.reservation(second.o)).state,'unknown');await originalJournal(l,first);await originalJournal(l,second);
   });
   await second.svc.reconcile(second.a.scope,second.o);await exactAccounting(l,first.o,first.receipt,first.a.binding);await exactAccounting(l,second.o,second.receipt,second.a.binding);
   const row=(await l.f.admin.query('SELECT b.record,u.receipt FROM fabric.usage_settlements u JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) JOIN fabric.model_billing_bindings b USING(tenant_id,space_id,run_id) WHERE u.reservation_id=$1',[second.o.reservationId])).rows[0];assert.deepEqual(row.record,second.a.binding);assert.deepEqual(row.receipt,second.receipt);
  });
  for(const stage of ['lookup','usage','audit','outbox'] as const)await t.test('late-current-token-expiry/'+stage+'/rollback-before-disclosure',async()=>{
   const k=await known(l),id=await persist(l,{status:'settled',receipt:k.receipt}),seen:{ownerId:string;original:OriginalCall}[]=[],identity=l.f.bindingFor(k.a.scope);
   // Use the accepted authenticated UoW's clock dependency. Every real database
   // write runs before exact token expiry is advanced at this explicit gate.
   let now=identity.tokenExpiresAt-1,reached=false;const expire=async()=>{reached=true;now=identity.tokenExpiresAt;};
   const hooks:UsageHooks={async afterUsage(tx){if(stage==='usage'){assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_resolutions WHERE attempt_id=$1',[k.o.attemptId])).rows[0]?.['n'],1);await expire();}},async afterStage(s,tx){if(s===stage){assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.model_'+s+' WHERE command_key=$1',['usage:'+k.o.attemptId+':settled'])).rows[0]?.['n'],1);await expire();}}};
   const snap=await l.snapshot(),uow=new AuthenticatedUnitOfWork({foundation:l.f.foundation,bindingFor:l.f.bindingFor,now:()=>now}),svc=new ModelService(new ModelRepository(uow,l.authority,hooks),new UsageRepository(uow,l.authority,hooks),[installedFault(l,id,seen,stage==='lookup'?expire:undefined)]);
   await assert.rejects(svc.reconcile(k.a.scope,k.o),code('STALE_IDENTITY'));assert.ok(reached);assert.deepEqual(seen,[{ownerId:l.f.ownerId,original:k.o}]);assert.deepEqual(await l.snapshot(),snap);assert.equal((await l.reservation(k.o)).state,'unknown');await originalJournal(l,k);
   assert.equal((await k.svc.reconcile(k.a.scope,k.o)).status,'settled');await exactAccounting(l,k.o,k.receipt,k.a.binding);
  });
 });

 test('U08',async t=>{
  const l=getFixture();await faults(l);
  for(const variant of ['identical','units','outcome','receipt-id','usage-key','category','scope','digest'] as const)await t.test('three-independent-settlement-processes/'+variant,async()=>{
   const k=await known(l),one=await l.caller(),two=await l.caller(),three=await l.caller();assert.equal(new Set([one.pid,two.pid,three.pid]).size,3);
   assert.equal(result<{status:string}>(await l.call(one,{kind:'reconcile',original:k.o})).status,'settled');const initial=await l.snapshot(),counts=await l.f.counters();assert.equal(result<{status:string}>(await l.call(two,{kind:'reconcile',original:k.o})).status,'settled');assert.deepEqual(await l.snapshot(),initial);
   let changed:UsageReceipt={...k.receipt,original:{...k.o},components:{...k.receipt.components}};
   if(variant==='units')changed={...changed,measuredUnits:changed.measuredUnits+1,components:{...changed.components,model:changed.components.model+1}};
   if(variant==='outcome')changed={...changed,outcome:'known-failure',outputDigest:null};
   if(variant==='receipt-id')changed={...changed,receiptId:randomUUID()};
   if(variant==='usage-key')changed={...changed,usageKey:'changed:'+randomUUID()};
   if(variant==='category'){assert.ok(changed.components.model>0);changed={...changed,components:{...changed.components,model:changed.components.model-1,service:changed.components.service+1}};}
   if(variant==='scope')changed={...changed,original:{...changed.original,spaceId:l.f.otherSpace}};
   if(variant==='digest')changed={...changed,original:{...changed.original,requestDigest:'sha256:'+'d'.repeat(64)}};
   const id=await persist(l,{status:'settled',receipt:changed}),block=await l.f.admin.connect();
   try{
    await block.query('BEGIN');const blocker=Number((await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[originalKeyLock(k.a.scope,(await l.operation(k.o)).originalKey)]);
    const calls=await Promise.all([l.start(one,{kind:'reconcile',original:k.o}),l.start(two,{kind:'reconcile',original:k.o}),l.start(three,{kind:'reconcile',original:k.o,lookupFaultId:id})]);
    const pids=await Promise.all(calls.map(async c=>Number((await l.message(c,'backend'))['pid'])));assert.equal(new Set(pids).size,3);
    // The unchanged Space barrier serializes callers before the original-key
    // lock. Reader one waits on the administrative original-key holder; the
    // other two wait on that reader's Space lock. Prove the actual transitive
    // lock graph rather than requiring an impossible direct edge for all three.
    let observed:{pid:number;state:string;wait_event_type:string|null;wait_event:string|null;blockers:number[]}[]=[];
    const reaches=(pid:number,target:number,seen:Set<number>):boolean=>{
     if(pid===target)return true;if(seen.has(pid))return false;seen.add(pid);
     return (observed.find(r=>r.pid===pid)?.blockers??[]).some(parent=>reaches(parent,target,new Set(seen)));
    };
    await waitUntil(async()=>{
     observed=(await l.f.admin.query('SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[]) ORDER BY pid',[[...pids,blocker]])).rows;
     return pids.every(pid=>{const row=observed.find(r=>r.pid===pid);return row?.wait_event_type==='Lock'&&row.blockers.length>0&&reaches(pid,blocker,new Set());});
    },'three real settlement lock waits whose dependency graph reaches original-key blocker');
    assert.equal(observed.filter(r=>pids.includes(r.pid)).length,3);assert.ok(pids.every(pid=>reaches(pid,blocker,new Set())));
    console.log(JSON.stringify({measurement:'recovery-settlement-blocking-graph',variant,originalKeyBlocker:blocker,callers:pids,rows:observed}));
    await block.query('COMMIT');const outcomes=await Promise.all(calls.map(c=>l.message(c,'result')));
    assert.equal(result<{status:string}>(outcomes[0]!).status,'settled');assert.equal(result<{status:string}>(outcomes[1]!).status,'settled');
    if(variant==='identical')assert.equal(result<{status:string}>(outcomes[2]!).status,'settled');else assert.equal(outcomes[2]!['error'],variant==='scope'||variant==='digest'?'CHECK_BINDING_MISMATCH':'IDEMPOTENCY_CONFLICT');
   }finally{await block.query('ROLLBACK');block.release();}
   assert.deepEqual(await l.snapshot(),initial);await exactAccounting(l,k.o,k.receipt,k.a.binding);await originalJournal(l,k);await l.unchangedAccept(counts);
   const restarted=await l.restart(one);assert.equal(result<{status:string}>(await l.call(restarted,{kind:'reconcile',original:k.o})).status,'settled');assert.deepEqual(await l.snapshot(),initial);await l.unchangedAccept(counts);await exactAccounting(l,k.o,k.receipt,k.a.binding);await originalJournal(l,k);await stopOwned(two);await stopOwned(three);await stopOwned(restarted);
  });
  for(const stage of ['usage','audit','outbox'] as const)await t.test('atomic-partial-settlement-fault/'+stage+'/independent-transaction-rollback-and-restart',async()=>{
   const k=await known(l),c=await l.caller(),snap=await l.snapshot(),counts=await l.f.counters();const call=await l.start(c,{kind:'reconcile',original:k.o,faultStage:stage});
   await waitUntil(async()=>c.messages.some(m=>m['requestId']===call.requestId&&(m['kind']==='partial'||m['kind']==='result')),'partial settlement mutation or early caller failure');
   const partial=c.messages.find(m=>m['requestId']===call.requestId&&m['kind']==='partial');assert.ok(partial,'Caller failed before fault instrumentation: '+JSON.stringify(c.messages.find(m=>m['requestId']===call.requestId&&m['kind']==='result')));assert.equal(partial['stage'],stage);assert.equal(partial['resolutions'],1);assert.equal(partial['settlements'],1);assert.ok(Number(partial['categories'])>0);
   if(stage==='audit'||stage==='outbox')assert.equal(partial['audit'],1);if(stage==='outbox')assert.equal(partial['outbox'],1);
   const failed=await l.message(call,'result');assert.ok(failed['error']);assert.deepEqual(await l.snapshot(),snap);assert.equal((await l.reservation(k.o)).state,'unknown');assert.equal(await l.count('model_resolutions',k.o),0);await originalJournal(l,k);await l.unchangedAccept(counts);
   const restarted=await l.restart(c);assert.equal(result<{status:string}>(await l.call(restarted,{kind:'reconcile',original:k.o})).status,'settled');await exactAccounting(l,k.o,k.receipt,k.a.binding);const settled=await l.snapshot();assert.equal(result<{status:string}>(await l.call(restarted,{kind:'reconcile',original:k.o})).status,'settled');assert.deepEqual(await l.snapshot(),settled);await l.unchangedAccept(counts);await originalJournal(l,k);await stopOwned(restarted);
  });
 });
}
