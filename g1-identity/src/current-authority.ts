import { createScopeVerifier } from '../../g1-foundations/src/contracts.js';
import { IdentityError, type AuthenticatedBinding, type IdentityScopeVerifier, type IdentityScopeVerifierOptions, type VerifiedScope } from './contracts.js';
import { assertVerifiedAccessToken } from './token-verifier.js';
export function createIdentityScopeVerifier(options: IdentityScopeVerifierOptions): IdentityScopeVerifier {
 const bindings=new WeakMap<object,AuthenticatedBinding>();
 const now=options.now??(()=>Date.now()/1000);
 return {
  async verify(request) {
   const token=await options.verifyToken(request.sessionCredential); assertVerifiedAccessToken(token);
   const identity=Object.freeze({issuer:token.issuer,subject:token.subject,sessionId:token.sessionId});
   let binding: AuthenticatedBinding|undefined;
   const original=createScopeVerifier(async pinned=>{
    if(token.expiresAt<=now()) throw new IdentityError('STALE_IDENTITY');
    const authority=await options.lookupAuthority(identity,{tenantId:pinned.tenantId,spaceId:pinned.spaceId});
    if(!authority || !Number.isFinite(Date.parse(authority.sessionExpiresAt)) || Date.parse(authority.sessionExpiresAt)<=now()*1000 || !['human','service'].includes(authority.principalKind)) throw new IdentityError('UNAUTHORIZED');
    const fresh=Object.freeze({...identity,actorId:authority.actorId,principalKind:authority.principalKind,tokenExpiresAt:token.expiresAt});
    if(binding && (binding.actorId!==fresh.actorId||binding.principalKind!==fresh.principalKind)) throw new IdentityError('STALE_IDENTITY');
    binding=fresh; return authority;
   });
   const scope=await original.verify(request); bindings.set(scope,binding!); return scope;
  },
  bindingFor(scope:VerifiedScope) {const binding=bindings.get(scope); if(!binding) throw new IdentityError('UNAUTHORIZED'); return binding;}
 };
}
