/** Draft real-PG assertion support. Importing this module performs no I/O.
 * This is not an installed fixture or a registered P02/P05 qualification. */
import assert from 'node:assert/strict';
import type {Pool,PoolClient} from 'pg';
import {assertVerifiedScope,revalidateScope,type VerifiedScope} from '../../src/owners.js';

export interface QueueDatabaseSnapshot {
 readonly pid:number;readonly observedAt:Date;readonly readOnly:true;
 readonly tickets:readonly Record<string,unknown>[];
 readonly resources:readonly Record<string,unknown>[];
 readonly owners:readonly Record<string,unknown>[];
 readonly assignments:readonly Record<string,unknown>[];
 readonly slots:readonly Record<string,unknown>[];
}
/** A separate, non-owner PG connection and an actual READ ONLY transaction.
 * The original private scope verifier rechecks current identity before and after
 * observation. Its separate authority lookup is not replaced by test GUCs. */
export async function observeQueue(pool:Pool,scope:VerifiedScope):Promise<QueueDatabaseSnapshot>{
 assertVerifiedScope(scope);await revalidateScope(scope);
 const c=await pool.connect();let discard=false;
 try{
  const role=(await c.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
   n.nspowner=r.oid AS owns_schema,
   EXISTS(SELECT 1 FROM pg_class t WHERE t.relnamespace=n.oid AND t.relowner=r.oid) AS owns_relation,
   EXISTS(SELECT 1 FROM pg_roles parent WHERE (parent.rolsuper OR parent.rolbypassrls OR parent.rolcreatedb OR parent.rolcreaterole)
    AND pg_has_role(r.oid,parent.oid,'MEMBER')) AS privileged_membership
   FROM pg_roles r CROSS JOIN pg_namespace n
   WHERE r.rolname=current_user AND n.nspname='fabric'`)).rows[0];
  assert.ok(role);for(const key of ['rolsuper','rolbypassrls','rolcreatedb','rolcreaterole','owns_schema','owns_relation','privileged_membership'])assert.equal(role[key],false);
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true),set_config('app.identity_verified','true',true)",[scope.tenantId,scope.spaceId,scope.actorId]);
  const info=(await c.query("SELECT pg_backend_pid() AS pid,clock_timestamp() AS now,current_setting('transaction_read_only') AS readonly")).rows[0]!;
  assert.equal(info.readonly,'on');assert.ok(info.now instanceof Date);
  const tables=['runtime_queue_tickets','runtime_queue_resources','runtime_resource_owners','runtime_assignments','runtime_allocation_slots'] as const;
  const rows:Record<string,unknown>[][]=[];
  for(const table of tables)rows.push((await c.query(`SELECT * FROM fabric.${table} WHERE tenant_id=$1 AND space_id=$2 ORDER BY to_jsonb(${table})::text`,[scope.tenantId,scope.spaceId])).rows);
  await revalidateScope(scope);await c.query('COMMIT');
  return {pid:Number(info.pid),observedAt:info.now,readOnly:true,tickets:rows[0]!,resources:rows[1]!,owners:rows[2]!,assignments:rows[3]!,slots:rows[4]!};
 }catch(e){try{await c.query('ROLLBACK');}catch{discard=true;}throw e;}
 finally{
  if(!discard)try{await c.query('RESET app.tenant_id;RESET app.space_id;RESET app.actor_id;RESET app.identity_verified');}catch{discard=true;}
  c.release(discard);
 }
}
/** Check the actual complete sets, not a returned queue status or row count.
 * Whole-computer exclusivity is intentionally stronger than read/read overlap. */
export function assertCompleteQueue(snapshot:QueueDatabaseSnapshot):void {
 const tickets=new Map(snapshot.tickets.map(t=>[String(t.ticket_id),t]));
 assert.equal(tickets.size,snapshot.tickets.length);assert.equal(snapshot.assignments.length,1);assert.ok(snapshot.slots.length<=1);
 const resourceOwners=new Set<string>();
 for(const owner of snapshot.owners){
  assert.ok(!resourceOwners.has(String(owner.resource_id)),'No overlapping owner');resourceOwners.add(String(owner.resource_id));
  const ticket=tickets.get(String(owner.ticket_id));assert.ok(ticket);assert.ok(['owned','reconciling'].includes(String(ticket.state)));
  assert.ok(snapshot.resources.some(r=>r.ticket_id===owner.ticket_id&&r.resource_id===owner.resource_id));
 }
 for(const ticket of snapshot.tickets){
  const resources=snapshot.resources.filter(r=>r.ticket_id===ticket.ticket_id),owners=snapshot.owners.filter(r=>r.ticket_id===ticket.ticket_id);
  assert.ok(resources.length>=1&&resources.length<=33);
  assert.ok(resources.some(r=>r.resource_id===snapshot.assignments[0]!.computer_resource_id&&r.mode==='write'));
  assert.deepEqual(owners.map(o=>o.resource_id).sort(),['owned','reconciling'].includes(String(ticket.state))?resources.map(r=>r.resource_id).sort():[]);
 }
}
export interface ObservedWait {readonly blockerPid:number;readonly waiterPid:number;readonly query:string;readonly observedAt:Date}
/** Real pg_blocking_pids observation; absence/timeouts are failures. The caller
 * provides a verified fixture-owned blocker, never an arbitrary PID to signal. */
export async function observeWait(observer:PoolClient,waiterPid:number,blockerPid:number,queryFragment:string):Promise<ObservedWait>{
 assert.ok(Number.isSafeInteger(waiterPid)&&Number.isSafeInteger(blockerPid)&&waiterPid>0&&blockerPid>0&&waiterPid!==blockerPid);
 const deadline=performance.now()+1000;
 while(performance.now()<deadline){
  const row=(await observer.query(`SELECT pid,query,clock_timestamp() AS now,pg_blocking_pids(pid) AS blockers
   FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'`,[waiterPid])).rows[0];
  if(row?.blockers?.includes(blockerPid)){
   assert.ok(typeof row.query==='string'&&row.query.includes(queryFragment),'Observed exact expected wait');
   return {blockerPid,waiterPid,query:row.query,observedAt:row.now};
  }
  await new Promise(r=>setTimeout(r,5));
 }
 throw new Error('Expected PG lock wait not observed inside original 2s lock bound');
}
