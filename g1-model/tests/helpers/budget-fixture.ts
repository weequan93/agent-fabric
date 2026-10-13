import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createUsageFixture } from './usage-fixture.js';
import { launchOwned,stopOwned,control,waitUntil,type OwnedProcess } from './process-fixture.js';
import { TransactionBudgetRepository } from '../../src/budget-repository.js';
import { ModelAttemptSchema,ModelOperationSchema } from '../../src/schema.js';
import { hash,type PrepareInput } from '../../src/model-repository.js';
import { sha } from './contract-fixtures.js';
import type { OriginalCall,OwnerObservation,TaskCallBinding,CostCategory } from '../../src/contracts.js';
export const expires=()=>new Date(Date.now()+60_000).toISOString();
export const code=(name:string)=>(e:unknown)=>(e as {code?:string}).code===name;
export async function createBudgetFixture(){
 const l=await createUsageFixture(),f=l.f,children:OwnedProcess[]=[];
 await f.admin.query('CREATE TABLE public.budget_owner_faults(attempt_id uuid PRIMARY KEY, observation jsonb NOT NULL)');
 await f.admin.query('CREATE TRIGGER budget_fault_immutable BEFORE UPDATE OR DELETE ON public.budget_owner_faults FOR EACH ROW EXECUTE FUNCTION fabric.reject_history_change()');
 async function space(){const id=randomUUID();await f.admin.query("INSERT INTO fabric.spaces VALUES($1,$2,$3,$4,$5,$6,1,'active')",[f.tenant,id,f.actors[0],f.actors[3],randomUUID(),randomUUID()]);for(const index of [0,1])await f.admin.query('INSERT INTO fabric.memberships(tenant_id,space_id,actor_id,revision,grants) VALUES($1,$2,$3,1,$4::jsonb)',[f.tenant,id,f.actors[index],JSON.stringify(index===0?['task:read','task:write','budget:control']:['task:read','task:write'])]);return id;}
 async function caller(spaceId:string){const c=await launchOwned(resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/budget-caller-process.js'),'FABRIC_MODEL_BUDGET_CALLER',{controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[1],tenantId:f.tenant,spaceId,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl'],profileDigest:f.profile.profileDigest,pins:l.pins,sourceDigest:sha(7)});children.push(c);return c;}
 async function start(c:OwnedProcess,input:Record<string,unknown>){const offset=c.messages.length;await control(c,input);return {c,offset};}
 async function message(call:{c:OwnedProcess;offset:number},kind:string){await waitUntil(async()=>call.c.messages.slice(call.offset).some(m=>m['kind']===kind),'budget child '+kind);return call.c.messages.slice(call.offset).find(m=>m['kind']===kind)!;}
 async function blocked(call:{c:OwnedProcess;offset:number},by?:number){const pid=Number((await message(call,'caller-pid'))['pid']);let row:Record<string,unknown>|undefined;await waitUntil(async()=>{const r=(await f.admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.length&&(!by||r.blockers.includes(by))){row=r;return true;}return false;},'actual budget row/advisory lock wait');console.log(JSON.stringify({measurement:'budget-blocking-pids',...row,qualification:'harness diagnostics only'}));return pid;}
 const reserve=(a:Awaited<ReturnType<typeof l.task>>,o:OriginalCall,amount:number,category:CostCategory='tool')=>f.uow.withScope(a.scope,tx=>new TransactionBudgetRepository(tx).reserve(a.binding.runId,o,{[category]:amount}));
 const reservation=async(o:OriginalCall)=>(await f.admin.query('SELECT amount,settled_amount,state,run_id,actor_id FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];
 /** Independent observer recomputes balances from membership/reservation rows and
  * immutable settlement/cover rows. Ancestors are never summed as economic cost. */
 async function conserve(){
  for(const [table,join,id]of [['budget_allowances','model_reservation_allowances','allowance_id'],['model_accounts','model_reservation_accounts','account_id']]as const){
   const rows=(await f.admin.query(`SELECT a.${id} AS id,a.ceiling,a.reserved,a.settled,
    coalesce((SELECT sum(r.amount) FROM fabric.${join} j JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE j.tenant_id=a.tenant_id AND j.${id}=a.${id} AND r.state IN('active','unknown')),0)::text AS expected_reserved,
    (coalesce((SELECT sum(r.settled_amount) FROM fabric.${join} j JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) WHERE j.tenant_id=a.tenant_id AND j.${id}=a.${id}),0)+
     coalesce((SELECT sum(c.amount) FROM fabric.model_deficit_covers c JOIN fabric.${table==='model_accounts'?'model_deficit_accounts':'model_deficit_allowances'} d USING(tenant_id,space_id,attempt_id) WHERE d.tenant_id=a.tenant_id AND d.${id}=a.${id}),0))::text AS expected_settled FROM fabric.${table} a`)).rows;
   for(const r of rows){assert.equal(r.reserved,r.expected_reserved,'reserved '+r.id);assert.equal(r.settled,r.expected_settled,'base+covered '+r.id);const available=BigInt(r.ceiling)-BigInt(r.reserved)-BigInt(r.settled);assert.ok(available>=0n,'availability '+r.id);assert.equal(available+BigInt(r.reserved)+BigInt(r.settled),BigInt(r.ceiling));}
  }
  const rows=(await f.admin.query("SELECT u.amount,u.receipt,r.settled_amount,m.measured,m.base_amount,(SELECT sum(amount)::text FROM fabric.model_usage_categories c WHERE c.attempt_id=m.attempt_id) AS category_total FROM fabric.usage_settlements u JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id) JOIN fabric.model_resolutions m ON m.receipt_id=u.settlement_id")).rows;
  for(const r of rows){assert.equal(r.amount,String(r.receipt.measuredUnits));assert.equal(r.measured,r.amount);assert.equal(r.base_amount,r.settled_amount);assert.equal(r.category_total,r.amount);}
 }
 async function join(input:PrepareInput){const o=input.request.original,rows=(await f.admin.query(`SELECT b.record AS binding,a.request,a.record AS attempt,p.record AS operation,r.amount,r.run_id,r.actor_id,u.amount AS measured,u.receipt,
   (SELECT count(*)::int FROM fabric.model_reservation_allowances WHERE reservation_id=r.reservation_id) AS ancestors
   FROM fabric.model_attempts a JOIN fabric.model_operations p USING(tenant_id,space_id,operation_id) JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id)
   JOIN fabric.model_billing_bindings b ON b.tenant_id=r.tenant_id AND b.space_id=r.space_id AND b.run_id=r.run_id LEFT JOIN fabric.usage_settlements u ON u.tenant_id=r.tenant_id AND u.space_id=r.space_id AND u.reservation_id=r.reservation_id WHERE a.attempt_id=$1`,[o.attemptId])).rows;assert.equal(rows.length,1);const r=rows[0];assert.deepEqual(r.binding,input.binding);assert.deepEqual(r.request,input.request);assert.equal(r.run_id,input.binding.runId);assert.equal(r.actor_id,input.binding.actorId);assert.deepEqual(r.attempt.original,o);assert.equal(r.operation.taskId,input.binding.taskId);assert.ok(r.ancestors>=6);if(r.receipt){assert.deepEqual(r.receipt.original,o);assert.equal(r.measured,String(r.receipt.measuredUnits));}return r;}
 /** Explicit accounting/overrun fixture: reserve via the real ledger and install
  * valid persisted records; never claim that this bypass is a normal admission. */
 async function accounting(a:Awaited<ReturnType<typeof l.task>>,input:PrepareInput,amount:number,category:CostCategory='model',alreadyReserved=false){
  const o=input.request.original,b=a.binding;
  if(!alreadyReserved)await reserve(a,o,amount,category);
  const operation=ModelOperationSchema.parse({schemaVersion:1,tenantId:f.tenant,spaceId:b.spaceId,operationId:o.operationId,taskId:b.taskId,runId:b.runId,sessionId:b.sessionId,sessionTurn:3,originalKey:input.command.key,requestDigest:o.requestDigest,bindingDigest:hash(b),retryCeiling:3,attemptsTaken:1,status:'prepared',knownReceiptId:null});
  const attempt=ModelAttemptSchema.parse({schemaVersion:1,original:o,ordinal:1,profileDigest:input.request.profileDigest,contextDigest:input.request.contextDigest,route:input.route,retryRequester:'engine',dispatchEpoch:1,claimId:null,status:'prepared'});
  await f.admin.query('INSERT INTO fabric.model_sessions VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[f.tenant,b.spaceId,b.sessionId,b.taskId,b.runId,JSON.stringify(b),JSON.stringify(a.origin)]);
  await f.admin.query('INSERT INTO fabric.model_operations VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)',[f.tenant,b.spaceId,o.operationId,b.actorId,b.taskId,b.runId,b.sessionId,input.command.key,o.requestDigest,hash(b),JSON.stringify(b),JSON.stringify(input.request),JSON.stringify(operation)]);
  await f.admin.query('INSERT INTO fabric.model_attempts VALUES($1,$2,$3,$4,$5,1,$6::jsonb,$7::jsonb)',[f.tenant,b.spaceId,o.attemptId,o.operationId,o.reservationId,JSON.stringify(input.request),JSON.stringify(attempt)]);
  const svc=l.service();await svc.usage.install(a.scope,o,l.installed());assert.ok(await svc.model.claim(a.scope,o.attemptId));return svc;
 }
 async function faultOwner(input:PrepareInput,measured:number,category:TaskCallBinding['category']='model'){
  const o=input.request.original,receipt={schemaVersion:1,original:o,ownerId:f.ownerId,receiptId:randomUUID(),usageKey:'budget-fault/'+o.attemptId,measuredUnits:measured,components:{model:0,service:0,tool:0,activeCompute:0,reservedCompute:0,coldStart:0,retainedStorage:0,network:0,embedding:0,reranking:0,[({'active-compute':'activeCompute','reserved-compute':'reservedCompute','cold-start':'coldStart','retained-storage':'retainedStorage'} as Record<string,string>)[category]??category]:measured},outcome:'known-failure',outputDigest:null,assurance:'deterministic-local-only',measuredAt:new Date().toISOString()};
  await f.admin.query('INSERT INTO public.budget_owner_faults VALUES($1,$2::jsonb)',[o.attemptId,JSON.stringify({status:'settled',receipt})]);
  const client=f.adapterClient(),port={accept:client.accept.bind(client),lookup:async(original:OriginalCall)=>{assert.deepEqual(original,o);return (await f.admin.query('SELECT observation FROM public.budget_owner_faults WHERE attempt_id=$1',[o.attemptId])).rows[0].observation as OwnerObservation;},cancel:client.cancel.bind(client),sealUnaccepted:client.sealUnaccepted.bind(client)};
  return l.service({},[{...l.installed(),port}]);
 }
 return {...l,space,caller,start,message,blocked,reserve,reservation,conserve,join,accounting,faultOwner,children,close:async()=>{const results=await Promise.allSettled(children.map(c=>stopOwned(c)));await l.close();for(const r of results)if(r.status==='rejected')throw r.reason;}};
}
