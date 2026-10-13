import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CipherBinding, CipherEnvelope, KeyResolver } from './contracts.js';
import { BindingSchema, CipherEnvelopeSchema } from './schema.js';
import { LIMITS } from './arithmetic.js';
import { demand, StorageError } from './errors.js';

/** Fixed-order, versioned AAD. JSON escaping makes field boundaries unambiguous.
 * This primitive is installed behind the service owner; possession of a parsed
 * binding does not grant authorization, publication or access to a filesystem.
 */
function aad(b: CipherBinding): Buffer {
 return Buffer.from(JSON.stringify(['agent-fabric-content', b.schemaVersion, b.tenantId,
  b.spaceId, b.class, b.id, b.revision, b.generation, b.keyId]), 'utf8');
}
function copyBytes(value: Uint8Array): Buffer {
 demand(value instanceof Uint8Array && value.buffer instanceof ArrayBuffer
  && value.byteLength <= LIMITS.backupBytes);
 // Copy before the first await: caller mutation cannot change the operation.
 return Buffer.from(value);
}
function envelopeBinding(e: CipherEnvelope): CipherBinding {
 return BindingSchema.parse({schemaVersion: e.schemaVersion, tenantId: e.tenantId,
  spaceId: e.spaceId, class: e.class, id: e.id, revision: e.revision,
  generation: e.generation, keyId: e.keyId});
}
export type FingerprintPurpose = 'content' | 'command' | 'subject' | 'source';

/** Keys live only in an installed resolver capability. This object deliberately
 * has no enumerable key/provider properties and no key export method. Resolver
 * failure text is never propagated. Copies are erased on exit; this is not a
 * promise of process-memory zeroization or external key custody.
 */
export class CryptoStore {
 readonly #resolver: KeyResolver;
 constructor(resolver: KeyResolver) {
  demand(resolver && typeof resolver.resolve === 'function', 'CONTENT_UNAVAILABLE');
  this.#resolver = resolver;
 }
 async #keys(binding: CipherBinding): Promise<{dataKey: Buffer; digestKey: Buffer}> {
  let dataKey: Buffer | undefined, digestKey: Buffer | undefined;
  try {
   const keys = await this.#resolver.resolve(binding);
   demand(keys?.dataKey instanceof Uint8Array && keys.dataKey.byteLength === 32
    && keys.dataKey.buffer instanceof ArrayBuffer, 'CONTENT_UNAVAILABLE');
   dataKey = Buffer.from(keys.dataKey);
   demand(keys.digestKey instanceof Uint8Array && keys.digestKey.byteLength === 32
    && keys.digestKey.buffer instanceof ArrayBuffer, 'CONTENT_UNAVAILABLE');
   digestKey = Buffer.from(keys.digestKey);
   demand(!timingSafeEqual(dataKey, digestKey), 'CONTENT_UNAVAILABLE');
   return {dataKey, digestKey};
  } catch {
   dataKey?.fill(0); digestKey?.fill(0);
   throw new StorageError('CONTENT_UNAVAILABLE');
  }
 }
 async seal(rawBinding: unknown, value: Uint8Array): Promise<CipherEnvelope> {
  const binding = BindingSchema.parse(rawBinding), bytes = copyBytes(value);
  let keys: {dataKey: Buffer; digestKey: Buffer} | undefined;
  try {
   keys = await this.#keys(binding);
   const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', keys.dataKey, nonce, {authTagLength: 16});
   cipher.setAAD(aad(binding));
   const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
   return CipherEnvelopeSchema.parse({...binding, algorithm: 'AES-256-GCM',
    nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')});
  } catch (e) {
   if (e instanceof StorageError) throw e;
   throw new StorageError('CONTENT_UNAVAILABLE');
  } finally { bytes.fill(0); keys?.dataKey.fill(0); keys?.digestKey.fill(0); }
 }
 async open(rawBinding: unknown, rawEnvelope: unknown): Promise<Buffer> {
  const binding = BindingSchema.parse(rawBinding), envelope = CipherEnvelopeSchema.parse(rawEnvelope);
  demand(aad(binding).equals(aad(envelopeBinding(envelope))), 'INTEGRITY_FAILED');
  const keys = await this.#keys(binding);
  let provisional: Buffer | undefined;
  try {
   const decipher = createDecipheriv('aes-256-gcm', keys.dataKey, Buffer.from(envelope.nonce, 'base64'), {authTagLength: 16});
   decipher.setAAD(aad(binding)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
   // Never return unauthenticated update bytes, including on final() failure.
   provisional = decipher.update(Buffer.from(envelope.ciphertext, 'base64'));
   const final = decipher.final();
   return Buffer.concat([provisional, final]);
  } catch { throw new StorageError('INTEGRITY_FAILED'); }
  finally { provisional?.fill(0); keys.dataKey.fill(0); keys.digestKey.fill(0); }
 }
 async fingerprint(rawBinding: unknown, purpose: FingerprintPurpose, value: Uint8Array): Promise<string> {
  const b = BindingSchema.parse(rawBinding);
  demand(['content','command','subject','source'].includes(purpose));
  const bytes = copyBytes(value);
  let keys: {dataKey: Buffer; digestKey: Buffer} | undefined;
  try {
   keys = await this.#keys(b);
   // Explicit scope and domain separation even if a misinstalled resolver reuses
   // a digest key. ID/revision/generation are excluded so scoped dedup is stable.
   const domain = Buffer.from(JSON.stringify(['agent-fabric-fingerprint', 1,
    b.tenantId, b.spaceId, b.class, b.keyId, purpose]), 'utf8');
   return 'sha256:' + createHmac('sha256', keys.digestKey).update(domain)
    .update(Buffer.from([0])).update(bytes).digest('hex');
  } finally { bytes.fill(0); keys?.dataKey.fill(0); keys?.digestKey.fill(0); }
 }
}
