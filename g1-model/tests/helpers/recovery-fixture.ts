import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createUsageFixture } from './usage-fixture.js';
import { launchOwned,stopOwned,waitUntil,type OwnedProcess } from './process-fixture.js';
import { sha } from './contract-fixtures.js';
import { encodeLocalRequest } from '../../src/test-adapter.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import type { EncodedRequest,OriginalCall } from '../../src/contracts.js';
import type { RetryInput } from '../../src/retry-repository.js';
export const code=(expected:string)=>(e:unknown)=>(e as {code?:string}).code===expected;
export const expires=()=>new Date(Date.now()+60_000).toISOString();
export async function createRecoveryFixture(){
 const l=await createUsageFixture(),f=l.f,children:OwnedProcess[]=[];
 // These cases qualify recovery rather than budget exhaustion. Install finite
 // ample fixture caps once; no failure/restart replenishes spent allowance.
 await l.common(f.space,1_000_000);await l.common(f.otherSpace,1_000_000);
 // Transaction-local diagnostic for the owner-only base settlement table. The
 // caller keeps its original restricted grants. This disposable fixture function
 // returns one scoped count, exposes no receipt/body, and never mutates anything.
 await f.admin.query(`CREATE FUNCTION public.recovery_partial_settlement_count(reservation uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$
 SELECT count(*)::int FROM fabric.usage_settlements u JOIN fabric.budget_reservations r USING(tenant_id,space_id,reservation_id)
 WHERE u.tenant_id=fabric.current_tenant() AND u.space_id=fabric.current_space() AND r.actor_id=fabric.current_identity() AND u.reservation_id=reservation $$`);
 await f.admin.query('REVOKE ALL ON FUNCTION public.recovery_partial_settlement_count(uuid) FROM PUBLIC');await f.admin.query('GRANT EXECUTE ON FUNCTION public.recovery_partial_settlement_count(uuid) TO '+f.roles.controller);
 async function caller(index=1,spaceId=f.space){const c=await launchOwned(resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/recovery-caller-process.js'),'FABRIC_MODEL_RECOVERY_CALLER',{controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[index],tenantId:f.tenant,spaceId,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl'],url:f.adapterUrl(),transportToken:f.transportToken,ownerId:f.ownerId,route:f.profile.route,profileDigest:f.profile.profileDigest,pins:l.pins,sourceDigest:sha(7)});children.push(c);return c;}
 async function start(c:OwnedProcess,input:Record<string,unknown>){const requestId=randomUUID();await new Promise<void>((ok,no)=>c.child.send({...input,requestId},e=>e?no(e):ok()));await waitUntil(async()=>c.messages.some(m=>m['requestId']===requestId&&m['kind']==='control-ack'),'recovery command acknowledgement');return {c,requestId};}
 async function message(call:Awaited<ReturnType<typeof start>>,kind:string){await waitUntil(async()=>call.c.messages.some(m=>m['requestId']===call.requestId&&m['kind']===kind),'recovery '+kind,15_000);return call.c.messages.find(m=>m['requestId']===call.requestId&&m['kind']===kind)!;}
 const call=async(c:OwnedProcess,input:Record<string,unknown>)=>message(await start(c,input),'result');
 const reservation=async(o:OriginalCall)=>(await f.admin.query('SELECT amount,settled_amount,state FROM fabric.budget_reservations WHERE reservation_id=$1',[o.reservationId])).rows[0];
 const count=async(table:string,o:OriginalCall)=>(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE attempt_id=$1',[o.attemptId])).rows[0].n as number;
 const operation=async(o:OriginalCall)=>(await f.admin.query('SELECT record FROM fabric.model_operations WHERE operation_id=$1',[o.operationId])).rows[0]?.record;
 const identity=async()=>({owner:f.fixtureOwner,database:(await f.admin.query('SELECT current_database() AS name,(SELECT oid FROM pg_database WHERE datname=current_database()) AS oid,pg_postmaster_start_time() AS started')).rows[0]});
 const restart=async(c:OwnedProcess)=>{const db=await identity(),journal=(await f.admin.query('SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY attempt_id),\'[]\') AS rows FROM model_receipts.journal j WHERE owner_id=$1',[f.ownerId])).rows[0].rows,oldAdapter=f.adapter().pid;await stopOwned(c,'SIGKILL');await f.restart('SIGKILL');const next=await caller();assert.notEqual(next.pid,c.pid);assert.notEqual(f.adapter().pid,oldAdapter);assert.deepEqual(await identity(),db);assert.deepEqual((await f.admin.query('SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY attempt_id),\'[]\') AS rows FROM model_receipts.journal j WHERE owner_id=$1',[f.ownerId])).rows[0].rows,journal);return next;};
 const retry=(r:EncodedRequest,previous:OriginalCall,requester:'engine'|'adapter'):RetryInput=>{const request=encodeLocalRequest({...r,original:{tenantId:previous.tenantId,spaceId:previous.spaceId,operationId:previous.operationId,attemptId:randomUUID(),reservationId:randomUUID()}});return {previous,request,requester,key:randomUUID(),expiresAt:expires(),route:f.profile.route,categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2}};};
 async function unchangedAccept(before:Record<string,number>){const after=await f.counters();for(const k of ['accept','acceptance'])assert.equal(after[k]??0,before[k]??0,'recovery must not call '+k);}
 async function blocked(call:Awaited<ReturnType<typeof start>>,by?:number){const backend=Number((await message(call,'backend'))['pid']);let row:Record<string,unknown>|undefined;await waitUntil(async()=>{const r=(await f.admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[backend])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.length&&(!by||r.blockers.includes(by))){row=r;return true;}return false;},'actual recovery original-key blocker');console.log(JSON.stringify({measurement:'recovery-lock-wait',...row}));return backend;}
 return {...l,caller,start,message,call,reservation,count,operation,identity,restart,retry,unchangedAccept,blocked,children,close:async()=>{const results=await Promise.allSettled(children.map(c=>stopOwned(c)));await l.close();for(const r of results)if(r.status==='rejected')throw r.reason;}};
}
