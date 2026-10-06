import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { IdentityError, type TokenVerifierOptions, type VerifiedAccessToken } from './contracts.js';
const issued = new WeakSet<object>();
const invalid = (): never => { throw new IdentityError('INVALID_TOKEN'); };
function part(value: string): Record<string, unknown> {
 if (!/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value,'base64url').toString('base64url')!==value) return invalid();
 const parsed: unknown=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
 if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return invalid();
 return parsed as Record<string,unknown>;
}
export function assertVerifiedAccessToken(value: unknown): asserts value is VerifiedAccessToken {
 if (!value || typeof value!=='object' || !issued.has(value)) invalid();
}
/** Trusted fixed issuer/key endpoint. Token contents never choose a URL or algorithm. */
export async function verifyAccessToken(raw: string, options: TokenVerifierOptions): Promise<VerifiedAccessToken> {
 try {
  if(typeof raw!=='string'||raw.length>8192) return invalid();
  const pieces=raw.split('.'); if(pieces.length!==3) return invalid();
  const h=part(pieces[0]!), c=part(pieces[1]!);
  if(h.alg!=='RS256'||h.typ!=='at+jwt'||typeof h.kid!=='string'||!h.kid||h.crit!==undefined||h.jku!==undefined||h.jwk!==undefined||h.x5u!==undefined) return invalid();
  const endpoint=new URL(options.jwksUrl), issuer=new URL(options.issuer);
  if(endpoint.origin!==issuer.origin || endpoint.username || endpoint.password || endpoint.hash || (endpoint.protocol!=='https:' && !(endpoint.protocol==='http:' && endpoint.hostname==='127.0.0.1'))) return invalid();
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(3000),redirect:'error'});
  if(!response.ok) return invalid();
  const text=await response.text(); if(text.length>65536) return invalid();
  const set=JSON.parse(text) as {keys?: Record<string,unknown>[]};
  if(!Array.isArray(set.keys)||set.keys.length>16) return invalid();
  const candidates=set.keys.filter(k=>k.kid===h.kid && k.kty==='RSA' && k.use==='sig' && k.alg==='RS256');
  if(candidates.length!==1) return invalid(); const key=candidates[0]!;
  if(typeof key.n!=='string'||typeof key.e!=='string'||Buffer.from(key.n,'base64url').length<256 || 'd' in key) return invalid();
  if(!/^[A-Za-z0-9_-]+$/.test(pieces[2]!)||Buffer.from(pieces[2]!,'base64url').toString('base64url')!==pieces[2]) return invalid();
  if(!verify('RSA-SHA256',Buffer.from(pieces[0]+'.'+pieces[1]),createPublicKey({key:key as JsonWebKey,format:'jwk'}),Buffer.from(pieces[2]!,'base64url'))) return invalid();
  const now=(options.now??(()=>Date.now()/1000))();
  if(c.iss!==options.issuer || c.aud!==options.apiAudience || c.token_use!=='access' || typeof c.sub!=='string'||!c.sub||c.sub.length>256||typeof c.sid!=='string'||!c.sid||c.sid.length>256||typeof c.jti!=='string'||!c.jti) return invalid();
  if(!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||typeof c.iat!=='number'||typeof c.exp!=='number'||c.iat>now||c.exp<=now||c.exp<=c.iat||c.exp-c.iat>3600||!Number.isFinite(now)) return invalid();
  if(c.nbf!==undefined && (typeof c.nbf!=='number'||!Number.isSafeInteger(c.nbf)||c.nbf>now)) return invalid();
  const token: VerifiedAccessToken=Object.freeze({issuer:options.issuer,subject:c.sub,sessionId:c.sid,audience:options.apiAudience,issuedAt:c.iat,expiresAt:c.exp,tokenId:c.jti,tokenUse:'access'});
  issued.add(token); return token;
 } catch { return invalid(); }
}
/** RP-only ID-token validation. Its return value is deliberately not API-token provenance. */
export async function verifyIdentityToken(raw:string, options:TokenVerifierOptions & {clientId:string;nonce:string}):Promise<void>{
 try{
  if(typeof raw!=='string'||raw.length>8192||!options.nonce)invalid();const p=raw.split('.');if(p.length!==3)invalid();const h=part(p[0]!),c=part(p[1]!);
  if(h.alg!=='RS256'||h.typ!=='JWT'||typeof h.kid!=='string'||h.crit!==undefined||h.jku!==undefined||h.jwk!==undefined||h.x5u!==undefined)invalid();
  const endpoint=new URL(options.jwksUrl),issuer=new URL(options.issuer);if(endpoint.origin!==issuer.origin||endpoint.username||endpoint.password||endpoint.hash||(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1')))invalid();
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(3000),redirect:'error'});if(!response.ok)invalid();const text=await response.text();if(text.length>65536)invalid();const set=JSON.parse(text) as {keys:Record<string,unknown>[]};
  if(!Array.isArray(set.keys)||set.keys.length>16)invalid();const keys=set.keys.filter(k=>k.kid===h.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');if(keys.length!==1)invalid();const key=keys[0]!;
  if(typeof key.n!=='string'||typeof key.e!=='string'||Buffer.from(key.n,'base64url').length<256||'d'in key||!/^[A-Za-z0-9_-]+$/.test(p[2]!)||Buffer.from(p[2]!,'base64url').toString('base64url')!==p[2])invalid();
  if(!verify('RSA-SHA256',Buffer.from(p[0]+'.'+p[1]),createPublicKey({key:key as JsonWebKey,format:'jwk'}),Buffer.from(p[2]!,'base64url')))invalid();
  const now=(options.now??(()=>Date.now()/1000))();if(!Number.isFinite(now)||c.iss!==options.issuer||c.aud!==options.clientId||c.token_use!=='id'||c.nonce!==options.nonce||typeof c.sub!=='string'||!c.sub||typeof c.sid!=='string'||!c.sid||typeof c.iat!=='number'||typeof c.exp!=='number'||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.iat>now||c.exp<=now||c.exp<=c.iat||c.exp-c.iat>3600||(c.nbf!==undefined&&(typeof c.nbf!=='number'||!Number.isSafeInteger(c.nbf)||c.nbf>now)))invalid();
 }catch{invalid();}
}
