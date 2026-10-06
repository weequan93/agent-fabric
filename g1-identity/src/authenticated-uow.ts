import type { Pool } from 'pg';
import { IdentityError, type AsyncUnitOfWork, type AuthenticatedUnitOfWorkOptions, type IdpSessionStore, type SessionAuthorityLookup, type SqlTransaction, type VerifiedScope } from './contracts.js';
export class AuthenticatedUnitOfWork implements AsyncUnitOfWork {
 constructor(readonly options: AuthenticatedUnitOfWorkOptions) {}
 async withScope<T>(scope: VerifiedScope, work: (tx: SqlTransaction)=>Promise<T>): Promise<T> {
  const b=this.options.bindingFor(scope);const now=this.options.now??(()=>Date.now()/1000);
  if(b.actorId!==scope.actorId || b.tokenExpiresAt<=now())throw new IdentityError('STALE_IDENTITY');
  return this.options.foundation.withScope(scope,async tx=>{
   const row=(await tx.query('SELECT fabric.identity_lock_session($1,$2,$3) AS valid',[b.issuer,b.subject,b.sessionId])).rows[0];
   if(row?.valid!==true || b.tokenExpiresAt<=now())throw new IdentityError('STALE_IDENTITY');
   const value=await work(tx);
   const end=(await tx.query('SELECT fabric.identity_lock_session($1,$2,$3) AS valid',[b.issuer,b.subject,b.sessionId])).rows[0];if(end?.valid!==true||b.tokenExpiresAt<=now())throw new IdentityError('STALE_IDENTITY');return value;
  });
 }
}
export function createPostgresAuthorityLookup(pool:Pool):SessionAuthorityLookup {
 return async (identity,scope)=>{const r=await pool.query('SELECT fabric.identity_authority($1,$2,$3,$4,$5) AS authority',[identity.issuer,identity.subject,identity.sessionId,scope.tenantId,scope.spaceId]);return r.rows[0]?.authority??null;};
}
export function createPostgresIdpSessionStore(pool:Pool):IdpSessionStore {
 return {async create(s){if(s.revokedAt!==null)throw new IdentityError('INVALID_INPUT');await pool.query('SELECT fabric.identity_issue_session($1,$2,$3,$4)',[s.issuer,s.subject,s.sessionId,s.expiresAt]);},async revoke(s){await pool.query('SELECT fabric.identity_revoke_session($1,$2,$3)',[s.issuer,s.subject,s.sessionId]);}};
}
