import type { Pool, PoolClient } from 'pg';
import { assertVerifiedScope, revalidateScope, FoundationError, type AsyncUnitOfWork, type CurrentAuthority, type SqlTransaction, type VerifiedScope } from './contracts.js';
/** Trusted composition root only. A caller never supplies a pool or lookup through HTTP. */
export class PostgresUnitOfWork implements AsyncUnitOfWork {
 constructor(readonly pool: Pool, readonly afterCommit?: () => void) {}
 async withScope<T>(scope: VerifiedScope, work:(transaction:SqlTransaction)=>Promise<T>):Promise<T> {
  assertVerifiedScope(scope);
  const client=await this.pool.connect(); let commitSent=false; let discard=false;
  try {
   // Connection identity itself must have no owner/superuser/BYPASSRLS powers.
   const role=await client.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole, EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='fabric' AND nspowner=pg_roles.oid) AS owns_schema, EXISTS(SELECT 1 FROM pg_auth_members am JOIN pg_roles parent ON parent.oid=am.roleid WHERE am.member=pg_roles.oid AND (parent.rolsuper OR parent.rolbypassrls)) AS privileged_membership FROM pg_roles WHERE rolname=current_user");
   const rr=role.rows[0]; if(!rr || rr.rolsuper||rr.rolbypassrls||rr.rolcreatedb||rr.rolcreaterole||rr.owns_schema||rr.privileged_membership)throw new FoundationError('UNAUTHORIZED','Controller role must be nonprivileged');
   await client.query('BEGIN');
   await client.query("SET LOCAL statement_timeout='5s'");await client.query("SET LOCAL lock_timeout='2s'");
   await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true),set_config('app.identity_verified','true',true)",[scope.tenantId,scope.spaceId,scope.actorId]);
   // The bound authenticating lookup still runs; transaction-locked DB authority
   // is an additional check, not a replacement for current session validity.
   await revalidateScope(scope,async()=>{const result=await client.query('SELECT fabric.controller_authority() AS authority');return (result.rows[0]?.authority??null) as CurrentAuthority|null;});
   const tx:SqlTransaction={async query<Row extends Record<string,unknown>>(text:string,values:readonly unknown[]=[]){const result=await client.query<Row>(text,[...values]);return {rows:result.rows,rowCount:result.rowCount};}};
   const value=await work(tx);commitSent=true;await client.query('COMMIT');this.afterCommit?.();return value;
  } catch(error) {
   const sqlState=(error as {code?:unknown})?.code;
   const definiteServerRejection=typeof sqlState==='string'&&/^[0-9A-Z]{5}$/.test(sqlState)&&!sqlState.startsWith('08')&&!['57P01','57P02','57P03'].includes(sqlState);
   if(commitSent&&!definiteServerRejection){discard=true;throw new FoundationError('UNKNOWN_COMMIT','Commit acknowledgement unavailable; reconcile original command key, never replay');}
   try{await client.query('ROLLBACK');}catch{discard=true;}
   throw error;
  } finally {
   if(!discard)try {await resetScope(client);}catch{discard=true;}
   client.release(discard);
  }
 }
}
async function resetScope(client:PoolClient):Promise<void>{
 // LOCAL values normally reset on commit/rollback. Explicit reset also clears stale session assertions.
 await client.query("RESET app.tenant_id; RESET app.space_id; RESET app.actor_id; RESET app.identity_verified");
 const result=await client.query("SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant,nullif(current_setting('app.space_id',true),'') AS space,nullif(current_setting('app.actor_id',true),'') AS actor,nullif(current_setting('app.identity_verified',true),'') AS verified");
 if(Object.values(result.rows[0]??{}).some(value=>value!==null))throw new Error('Session scope reset failed');
}
