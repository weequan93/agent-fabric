import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, rename, readdir, unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CryptoStore } from './crypto-store.js';
import { BindingSchema, CipherEnvelopeSchema } from './schema.js';
import { uuid, object, literal, digest, revision, body } from './decoder.js';
import type { CipherBinding } from './contracts.js';
import type { OwnedAnchorRoot } from './epoch-journal.js';
import { LIMITS } from './arithmetic.js';
import { demand, StorageError, FoundationError } from './errors.js';
import { ModelError } from '../../g1-model/src/errors.js';
import { IdentityError } from '../../g1-identity/src/contracts.js';

export const FileConfirmationSchema = object({schemaVersion: literal(1), objectDigest: digest,
 manifestDigest: digest, objectSize: revision, manifestSize: revision});
export type FileConfirmation = ReturnType<typeof FileConfirmationSchema.parse>;
export interface StagingLease {
 readonly uploadId: string; readonly rootId: string; readonly binding: CipherBinding;
 /** Both times come from the installed current owner, never the client. */
 readonly observedAt: number; readonly leaseUntil: number;
 readonly pending: boolean; readonly unknown: boolean; readonly reachable: boolean;
 readonly confirmation: FileConfirmation | null;
}
export interface LockedStagingLease {
 current(): Promise<StagingLease>;
 confirm(value: FileConfirmation): Promise<void>;
 /** Owner commits the pointer under its authority/command transaction. The file
  * adapter never constructs a save receipt or decides user authorization. */
 publish(value: FileConfirmation): Promise<void>;
}
export interface StagingControl {
 reserve(uploadId: string, rootId: string, binding: CipherBinding): Promise<void>;
 /** Must serialize stage/confirm/publish/GC for this exact upload, including
  * recreated clients. Callback and mutations use the SAME held owner lock.
  * Current generation, scope, command status and authority are owner's duties.
  * A missing/unavailable record must refuse; absence is never a GC permit. */
 lock<T>(uploadId: string, work: (lease: LockedStagingLease) => Promise<T>): Promise<T>;
}
export type StagingPhase = 'allocated' | 'object-written' | 'object-fsynced' | 'object-renamed'
 | 'object-directory-fsynced' | 'manifest-fsynced' | 'manifest-renamed'
 | 'manifest-directory-fsynced' | 'confirmed' | 'before-publication' | 'published' | 'quarantined';
export interface CipherFileHooks {phase?(phase: StagingPhase, uploadId: string): Promise<void>}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hash = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const ManifestSchema = object({schemaVersion: literal(1), binding: BindingSchema,
 objectDigest: digest, objectSize: revision, description: body});
const MAX_ENVELOPE = 4 * Math.ceil(LIMITS.backupBytes / 3) + 4096;

/** Bounded local filesystem capability installed only in the content owner.
 * Names are random, manifests descriptive-encrypted, files immutable after
 * confirmation. No path/root/key is accepted from content JSON. Local trusted
 * directory custody is required; this is not protection against a host admin
 * swapping ancestors between syscalls, nor hardware power-loss qualification.
 * This primitive does NOT provide a canonical authenticated PG repository. */
export class OwnedCipherFiles {
 readonly #root: OwnedAnchorRoot; readonly #control: StagingControl;
 readonly #crypto: CryptoStore; readonly #hooks: CipherFileHooks;
 constructor(root: OwnedAnchorRoot, crypto: CryptoStore, control: StagingControl, hooks: CipherFileHooks = {}) {
  this.#root = Object.freeze({...root}); this.#crypto = crypto; this.#control = control; this.#hooks = hooks;
 }
 async #redacted<T>(work: () => Promise<T>, cleanup = false, withinOwner = false): Promise<T> {
  try { return await work(); } catch (e) {
   if (e instanceof StorageError) throw e;
   // In an owner callback, let its authenticated transaction boundary map
   // current identity/native refusals. Normalize filesystem failures here so
   // that boundary cannot misclassify an incomplete cleanup as a read failure.
   if (withinOwner && (e instanceof ModelError || e instanceof IdentityError || e instanceof FoundationError)) throw e;
   // The installed PG owner may lose COMMIT acknowledgement. Preserve its
   // content-free typed uncertainty; callers must use original-key lookup.
   if (e instanceof FoundationError && e.code === 'UNKNOWN_COMMIT') throw e;
   throw new StorageError(cleanup ? 'CLEANUP_UNPROVEN' : 'CONTENT_UNAVAILABLE');
  }
 }
 async #sync(path: string) {
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { demand((await f.stat()).isDirectory(), 'CLEANUP_UNPROVEN'); await f.sync(); }
  finally { await f.close(); }
 }
 async #read(path: string, max: number): Promise<Buffer> {
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
   const st = await f.stat();
   demand(st.isFile() && st.nlink === 1 && st.size <= max, 'INTEGRITY_FAILED');
   // A bounded positional read avoids unbounded allocation if a file grows.
   const bytes = Buffer.alloc(st.size + 1); let size = 0;
   while (size < bytes.length) { const r = await f.read(bytes, size, bytes.length - size, size); if (!r.bytesRead) break; size += r.bytesRead; }
   const after = await f.stat();
   demand(size === st.size && after.size === st.size && after.mtimeMs === st.mtimeMs && after.ctimeMs === st.ctimeMs, 'INTEGRITY_FAILED');
   return bytes.subarray(0, size);
  } finally { await f.close(); }
 }
 async #rootCheck() {
  const r = this.#root, st = await lstat(r.path);
  demand(st.isDirectory() && !st.isSymbolicLink() && st.dev === r.device && st.ino === r.inode
   && await realpath(r.path) === r.path, 'CLEANUP_UNPROVEN');
  const marker = JSON.parse((await this.#read(resolve(r.path, '.storage-owner.json'), 1024)).toString('utf8'));
  demand(same(marker, {owner:r.owner, instance:r.instance, rootId:r.rootId, device:r.device, inode:r.inode}), 'CLEANUP_UNPROVEN');
 }
 async #directory(id: string, quarantine = false) {
  uuid.parse(id); await this.#rootCheck();
  const path = resolve(this.#root.path, (quarantine ? 'q-' : 'u-') + id), st = await lstat(path);
  demand(st.isDirectory() && !st.isSymbolicLink() && st.dev === this.#root.device && await realpath(path) === path, 'CLEANUP_UNPROVEN');
  return path;
 }
 async #current(lease: LockedStagingLease, id: string, binding?: CipherBinding) {
  const value = await lease.current();
  demand(value.uploadId === id && value.rootId === this.#root.rootId, 'SCOPE_MISMATCH');
  const b = BindingSchema.parse(value.binding);
  if (binding) demand(same(binding, b), 'SCOPE_MISMATCH');
  demand(Number.isSafeInteger(value.observedAt) && Number.isSafeInteger(value.leaseUntil), 'AUTHORITY_UNAVAILABLE');
  demand([value.pending, value.unknown, value.reachable].every(v => typeof v === 'boolean'), 'AUTHORITY_UNAVAILABLE');
  const confirmation = value.confirmation === null ? null : FileConfirmationSchema.parse(value.confirmation);
  return {...value, binding:b, confirmation};
 }
 #active(value: StagingLease) {
  demand(value.leaseUntil > value.observedAt && !value.unknown && !value.reachable, 'ARTIFACT_NOT_COMMITTED');
 }
 async #write(directory: string, name: 'object' | 'manifest', bytes: Buffer, id: string) {
  const temp = resolve(directory, '.part-' + randomUUID()), target = resolve(directory, name);
  // The directory is newly allocated for one upload. Existing targets are never
  // overwritten by retries; recovery observes/quarantines the original upload.
  const f = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
   await f.writeFile(bytes);
   if (name === 'object') await this.#hooks.phase?.('object-written', id);
   await f.sync(); await this.#hooks.phase?.(name === 'object' ? 'object-fsynced' : 'manifest-fsynced', id);
  } finally { await f.close(); }
  try { await lstat(target); throw new StorageError('IDEMPOTENCY_CONFLICT'); }
  catch (e) { if ((e as {code?:string}).code !== 'ENOENT') throw e; }
  await rename(temp, target); await this.#hooks.phase?.(name === 'object' ? 'object-renamed' : 'manifest-renamed', id);
  await this.#sync(directory); await this.#hooks.phase?.(name === 'object' ? 'object-directory-fsynced' : 'manifest-directory-fsynced', id);
 }
 async #verify(id: string, binding: CipherBinding) {
  const path = await this.#directory(id);
  const names = (await readdir(path)).sort();
  demand(same(names, ['manifest','object']), 'ARTIFACT_NOT_COMMITTED');
  const bytes = await this.#read(resolve(path,'object'), MAX_ENVELOPE);
  const manifest = await this.#read(resolve(path,'manifest'), MAX_ENVELOPE);
  const decoded = await this.#crypto.open(binding, CipherEnvelopeSchema.parse(JSON.parse(manifest.toString('utf8'))));
  try {
   const m = ManifestSchema.parse(JSON.parse(decoded.toString('utf8')));
   demand(same(m.binding,binding) && m.objectDigest === hash(bytes) && m.objectSize === bytes.length, 'INTEGRITY_FAILED');
   // Confirm authentication of actual retained bytes too, never digest alone.
   const plain = await this.#crypto.open(binding, CipherEnvelopeSchema.parse(JSON.parse(bytes.toString('utf8'))));
   try {
    await this.#rootCheck();
    return {confirmation:FileConfirmationSchema.parse({schemaVersion:1,objectDigest:hash(bytes),manifestDigest:hash(manifest),objectSize:bytes.length,manifestSize:manifest.length}),
     bytes:plain,description:m.description};
   } catch (e) { plain.fill(0); throw e; }
  } finally { decoded.fill(0); }
 }
 async stage(rawBinding: unknown, value: Uint8Array, description: string): Promise<string> {
  const binding = BindingSchema.parse(rawBinding);
  demand(value instanceof Uint8Array && value.buffer instanceof ArrayBuffer && value.byteLength <= LIMITS.backupBytes);
  demand(typeof description === 'string' && Buffer.byteLength(description,'utf8') <= LIMITS.commandBytes && description.isWellFormed());
  const copy = Buffer.from(value), id = randomUUID();
  try { return await this.#redacted(async () => {
   await this.#rootCheck(); await this.#control.reserve(id,this.#root.rootId,binding);
   await this.#control.lock(id,async lease => {
    this.#active(await this.#current(lease,id,binding));
    const entries = await readdir(this.#root.path); demand(entries.length <= LIMITS.files, 'CONTENT_UNAVAILABLE');
    const path = resolve(this.#root.path,'u-'+id); await mkdir(path,{mode:0o700}); await this.#sync(this.#root.path);
    await this.#hooks.phase?.('allocated',id);
    const bytes = Buffer.from(JSON.stringify(await this.#crypto.seal(binding,copy)),'utf8');
    await this.#write(path,'object',bytes,id);
    const m = Buffer.from(JSON.stringify({schemaVersion:1,binding,objectDigest:hash(bytes),objectSize:bytes.length,description}),'utf8');
    try { await this.#write(path,'manifest',Buffer.from(JSON.stringify(await this.#crypto.seal(binding,m))),id); }
    finally { m.fill(0); }
    this.#active(await this.#current(lease,id,binding));
    const verified = await this.#verify(id,binding); verified.bytes.fill(0);
    const confirmation = Object.freeze({...verified.confirmation});
    this.#active(await this.#current(lease,id,binding));
    await lease.confirm(confirmation); await this.#hooks.phase?.('confirmed',id);
    const confirmed = await this.#current(lease,id,binding); this.#active(confirmed);
    demand(same(confirmed.confirmation,confirmation), 'INTEGRITY_FAILED');
    await this.#rootCheck();
   }); return id;
  }); } finally { copy.fill(0); }
 }
 async publish(uploadId: string, rawBinding: unknown): Promise<FileConfirmation> {
  const id = uuid.parse(uploadId), binding = BindingSchema.parse(rawBinding);
  return this.#redacted(() => this.#control.lock(id,async lease => {
   const current = await this.#current(lease,id,binding); this.#active(current);
   demand(current.confirmation !== null, 'ARTIFACT_NOT_COMMITTED');
   await this.#hooks.phase?.('before-publication',id);
   const verified = await this.#verify(id,binding); verified.bytes.fill(0);
   const confirmation = Object.freeze({...verified.confirmation});
   demand(same(confirmation,current.confirmation), 'INTEGRITY_FAILED');
   const fresh = await this.#current(lease,id,binding); this.#active(fresh);
   demand(same(fresh.confirmation,confirmation), 'INTEGRITY_FAILED');
   await this.#rootCheck();
   await lease.publish(confirmation); await this.#hooks.phase?.('published',id);
   // A fulfilled callback is not proof of its effect. Observe the exact owner
   // result under the same transaction/lock before allowing its COMMIT. Owner
   // completion/freshness and uncertain acknowledgements remain its boundary.
   const published = await this.#current(lease,id,binding);
   demand(published.reachable && !published.pending && !published.unknown, 'ARTIFACT_NOT_COMMITTED');
   demand(same(published.confirmation,confirmation), 'INTEGRITY_FAILED');
   await this.#rootCheck(); return confirmation;
  }));
 }
 /** Administrative primitive only. Installed serving owner must independently
  * authorize scope/source/audience/freshness before and after disclosure. */
 async inspect(uploadId: string, rawBinding: unknown): Promise<{bytes:Buffer; description:string}> {
  const id = uuid.parse(uploadId), binding = BindingSchema.parse(rawBinding);
  let snapshot: {bytes:Buffer; description:string} | undefined;
  try { return await this.#redacted(() => this.#control.lock(id,async lease => {
   const current = await this.#current(lease,id,binding);
   demand(current.reachable && !current.unknown && current.confirmation, 'ARTIFACT_NOT_COMMITTED');
   const verified = await this.#verify(id,binding);
   snapshot = {bytes:verified.bytes,description:verified.description};
   demand(same(verified.confirmation,current.confirmation), 'INTEGRITY_FAILED');
   const fresh = await this.#current(lease,id,binding);
   demand(fresh.reachable && !fresh.unknown && fresh.confirmation, 'ARTIFACT_NOT_COMMITTED');
   demand(same(verified.confirmation,fresh.confirmation), 'INTEGRITY_FAILED');
   await this.#rootCheck();
   // Transfer the exact confirmed snapshot only after the owner's entire lock
   // operation succeeds, including its final authority check and transaction
   // completion. No second file read may replace that authenticated snapshot.
   return snapshot;
  })); } catch (e) { snapshot?.bytes.fill(0); throw e; }
 }
 /** Content-free durable prerequisite, never a read or publication receipt.
  * The installed owner supplies authority and holds its exact upload lock. */
 async verifyConfirmation(uploadId:string,rawBinding:unknown):Promise<FileConfirmation>{
  const id=uuid.parse(uploadId),binding=BindingSchema.parse(rawBinding);
  return this.#redacted(()=>this.#control.lock(id,async lease=>{
   const current=await this.#current(lease,id,binding);
   demand(current.confirmation&&!current.unknown,'ARTIFACT_NOT_COMMITTED');
   const verified=await this.#verify(id,binding);verified.bytes.fill(0);
   const confirmation=Object.freeze({...verified.confirmation});
   demand(same(confirmation,current.confirmation),'INTEGRITY_FAILED');
   const fresh=await this.#current(lease,id,binding);
   demand(!fresh.unknown&&same(confirmation,fresh.confirmation),'INTEGRITY_FAILED');
   await this.#rootCheck();return confirmation;
  }));
 }
 /** Installed publication owner only: exact authenticated preparation snapshot.
  * This is not serving or a canonical receipt. The containing owner transaction
  * must retain its locks, validate this description/bytes and publish its head.
  * The ordinary inspect() remains restricted to reachable published bytes. */
 async inspectPrepared(uploadId:string,rawBinding:unknown):Promise<{bytes:Buffer;description:string}>{
  const id=uuid.parse(uploadId),binding=BindingSchema.parse(rawBinding);
  let snapshot:{bytes:Buffer;description:string}|undefined;
  try{return await this.#redacted(()=>this.#control.lock(id,async lease=>{
   const before=await this.#current(lease,id,binding);this.#active(before);
   demand(before.pending&&before.confirmation,'ARTIFACT_NOT_COMMITTED');
   const verified=await this.#verify(id,binding);
   snapshot={bytes:verified.bytes,description:verified.description};
   demand(same(verified.confirmation,before.confirmation),'INTEGRITY_FAILED');
   const after=await this.#current(lease,id,binding);this.#active(after);
   demand(after.pending&&same(after.confirmation,verified.confirmation),'INTEGRITY_FAILED');
   await this.#rootCheck();return snapshot;
  }));}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 /** Installed original-key resolver only. Exact confirmed bytes can help
  * reconstruct an encrypted command during COMMIT uncertainty. This transfers
  * no serving/commit receipt and performs no replay, publication or GC. The
  * owner must independently prove the current original/candidate under locks. */
 async inspectConfirmedForRecovery(uploadId:string,rawBinding:unknown):Promise<{bytes:Buffer;description:string}>{
  const id=uuid.parse(uploadId),binding=BindingSchema.parse(rawBinding);let snapshot:{bytes:Buffer;description:string}|undefined;
  try{return await this.#redacted(()=>this.#control.lock(id,async lease=>{
   const before=await this.#current(lease,id,binding);demand(before.confirmation&&(before.pending||before.unknown||before.reachable),'ARTIFACT_NOT_COMMITTED');
   const verified=await this.#verify(id,binding);snapshot={bytes:verified.bytes,description:verified.description};
   demand(same(verified.confirmation,before.confirmation),'INTEGRITY_FAILED');
   const after=await this.#current(lease,id,binding);demand(same(after.confirmation,verified.confirmation),'INTEGRITY_FAILED');
   await this.#rootCheck();return snapshot;
  }));}catch(e){snapshot?.bytes.fill(0);throw e;}
 }
 async collect(): Promise<{removed:number; protected:number}> {
  return this.#redacted(async () => {
   await this.#rootCheck(); const entries = await readdir(this.#root.path);
   demand(entries.length <= LIMITS.files + 1 && entries.every(n => n === '.storage-owner.json' || /^[uq]-[0-9a-f-]{36}$/.test(n)), 'CLEANUP_UNPROVEN');
   let removed = 0, protectedCount = 0;
   for (const name of entries.filter(n=>n!=='.storage-owner.json').sort()) {
    const id = uuid.parse(name.slice(2));
    await this.#control.lock(id,async lease => this.#redacted(async () => {
     const current = await this.#current(lease,id);
     if (current.leaseUntil > current.observedAt || current.pending || current.unknown || current.reachable) { protectedCount++; return; }
     let path = await this.#directory(id,name.startsWith('q-'));
     const names = await readdir(path);
     demand(names.length <= 4 && names.every(n=>['object','manifest'].includes(n) || /^\.part-[0-9a-f-]{36}$/.test(n)), 'CLEANUP_UNPROVEN');
     // Preflight ALL entries before changing anything. No recursive delete.
     for (const n of names) { const st = await lstat(resolve(path,n)); demand(st.isFile() && !st.isSymbolicLink() && st.nlink===1, 'CLEANUP_UNPROVEN'); }
     if (name.startsWith('u-')) {
      const target = resolve(this.#root.path,'q-'+id);
      try { await lstat(target); throw new StorageError('CLEANUP_UNPROVEN'); }
      catch (e) { if ((e as {code?:string}).code !== 'ENOENT') throw e; }
      await rename(path,target); await this.#sync(dirname(path)); path = target;
     }
     await this.#hooks.phase?.('quarantined',id);
     const recheck = await this.#current(lease,id);
     demand(recheck.leaseUntil <= recheck.observedAt && !recheck.pending && !recheck.unknown && !recheck.reachable, 'CLEANUP_UNPROVEN');
     await this.#rootCheck();
     for (const n of names) { const st = await lstat(resolve(path,n)); demand(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1,'CLEANUP_UNPROVEN'); await unlink(resolve(path,n)); }
     await this.#sync(path); await rmdir(path); await this.#sync(this.#root.path); removed++;
    },true,true));
   }
   return {removed,protected:protectedCount};
  },true);
 }
}
