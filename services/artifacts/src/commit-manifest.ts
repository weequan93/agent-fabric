import { createHash } from 'node:crypto';
import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';

export interface UploadReceipt { scope: ScopeRef; uploadId: string; digest: string; byteLength: number; durable: boolean }
export interface ArtifactManifestInput { scope: ScopeRef; artifactId: string; uploadId: string; expectedDigest: string; expectedBytes: number; revision: number }
export interface ArtifactManifest extends ArtifactManifestInput { manifestDurable: boolean; published: boolean }
export interface ManifestSnapshot { manifests: ArtifactManifest[]; tombstones: string[] }
function uploadKey(scope: ScopeRef, id: string): string { return JSON.stringify([scope.tenantId, scope.spaceId, nonEmptyString(id)]); }
function parseTombstone(value: unknown): { scope: ScopeRef; id: string } {
  const text = nonEmptyString(value, 'tombstone'); let parts: unknown;
  try { parts = JSON.parse(text); } catch { requireCondition(false, 'INVALID_SCHEMA', 'Invalid tombstone identity'); }
  requireCondition(Array.isArray(parts) && parts.length === 3, 'INVALID_SCHEMA', 'Invalid tombstone identity');
  const scope = parseScope({ tenantId: parts[0], spaceId: parts[1] }); const id = nonEmptyString(parts[2]);
  requireCondition(uploadKey(scope, id) === text, 'INVALID_SCHEMA', 'Noncanonical tombstone identity');
  return { scope, id };
}
function parseInput(input: unknown): ArtifactManifestInput {
  const p = record(input, ['scope', 'artifactId', 'uploadId', 'expectedDigest', 'expectedBytes', 'revision']);
  const digest = nonEmptyString(p.expectedDigest, 'expectedDigest');
  requireCondition(/^[a-f0-9]{64}$/.test(digest), 'INVALID_SCHEMA', 'Expected SHA256 digest');
  return { scope: parseScope(p.scope), artifactId: nonEmptyString(p.artifactId), uploadId: nonEmptyString(p.uploadId), expectedDigest: digest, expectedBytes: nonNegativeInteger(p.expectedBytes), revision: nonNegativeInteger(p.revision) };
}
function inputOf(m: ArtifactManifest): ArtifactManifestInput { return { scope: m.scope, artifactId: m.artifactId, uploadId: m.uploadId, expectedDigest: m.expectedDigest, expectedBytes: m.expectedBytes, revision: m.revision }; }

/** In-memory G0 confirmation model, not an object-store durability attestation. */
export class MemoryObjectStore {
  private readonly uploads = new Map<string, UploadReceipt>();
  private readonly bytes = new Map<string, Uint8Array>();
  upload(scope: ScopeRef, uploadId: string, bytes: Uint8Array): UploadReceipt {
    const parsed = parseScope(scope); const id = uploadKey(parsed, uploadId);
    requireCondition(bytes instanceof Uint8Array, 'INVALID_SCHEMA', 'Upload requires bytes');
    const copy = new Uint8Array(bytes); const digest = createHash('sha256').update(copy).digest('hex');
    const existing = this.uploads.get(id);
    requireCondition(existing === undefined || (existing.digest === digest && existing.byteLength === copy.byteLength), 'IDEMPOTENCY_CONFLICT', 'Upload identity cannot change');
    if (existing !== undefined) return structuredClone(existing);
    const receipt = { scope: parsed, uploadId, digest, byteLength: copy.byteLength, durable: false };
    this.uploads.set(id, receipt); this.bytes.set(id,copy); return structuredClone(receipt);
  }
  confirmDurable(scope: ScopeRef, uploadId: string): void {
    const id = uploadKey(parseScope(scope), uploadId); const upload = this.uploads.get(id);
    requireCondition(upload !== undefined, 'ARTIFACT_NOT_COMMITTED', 'Upload not acknowledged');
    upload.durable = true;
  }
  inspect(scope: ScopeRef, uploadId: string): UploadReceipt {
    const upload = this.uploads.get(uploadKey(parseScope(scope), uploadId));
    requireCondition(upload !== undefined, 'ARTIFACT_NOT_COMMITTED', 'Upload not acknowledged');
    return structuredClone(upload);
  }
  read(scope:ScopeRef,uploadId:string):Uint8Array {const id=uploadKey(parseScope(scope),uploadId),bytes=this.bytes.get(id);requireCondition(bytes!==undefined,'ARTIFACT_NOT_COMMITTED','Missing bytes');return new Uint8Array(bytes);}
}

export class ArtifactManifestRepository {
  private manifests = new Map<string, ArtifactManifest>();
  private readonly tombstones = new Set<string>();
  private publications = 0;
  constructor(private readonly storage: MemoryObjectStore, private readonly authorize: (scope: ScopeRef) => void) {}
  get publicationCount(): number { return this.publications; }
  prepare(input: ArtifactManifestInput): ArtifactManifest {
    const p = parseInput(input); this.authorize(p.scope); const id = uploadKey(p.scope, p.artifactId);
    requireCondition(!this.tombstones.has(id), 'UNAUTHORIZED', 'Deleted artifact cannot be restored');
    const existing = this.manifests.get(id);
    requireCondition(existing === undefined || canonicalDigest(inputOf(existing)) === canonicalDigest(p), 'IDEMPOTENCY_CONFLICT', 'Artifact identity cannot change');
    if (existing !== undefined) return structuredClone(existing);
    const manifest: ArtifactManifest = { ...p, manifestDurable: false, published: false };
    this.manifests.set(id, structuredClone(manifest)); return structuredClone(manifest);
  }
  confirmManifestDurable(scope: ScopeRef, artifactId: string): void { this.current(scope, artifactId).manifestDurable = true; }
  publish(scope: ScopeRef, artifactId: string): ArtifactManifest {
    const manifest = this.current(scope, artifactId); this.assertBytes(manifest);
    requireCondition(manifest.manifestDurable, 'ARTIFACT_NOT_COMMITTED', 'Manifest not durably confirmed');
    if (!manifest.published) { manifest.published = true; this.publications++; }
    return structuredClone(manifest);
  }
  getCommitted(scope: ScopeRef, artifactId: string): ArtifactManifest {
    const manifest = this.current(scope, artifactId);
    requireCondition(manifest.published && manifest.manifestDurable, 'ARTIFACT_NOT_COMMITTED', 'Artifact not committed');
    this.assertBytes(manifest); return structuredClone(manifest);
  }
  getCommittedBytes(scope:ScopeRef,artifactId:string):Uint8Array {const manifest=this.getCommitted(scope,artifactId);return this.storage.read(manifest.scope,manifest.uploadId);}
  tombstone(scope: ScopeRef, artifactId: string): void { const p = parseScope(scope); this.authorize(p); this.tombstones.add(uploadKey(p, artifactId)); }
  snapshot(): ManifestSnapshot {
    const manifests: ArtifactManifest[] = [];
    for (const [id, m] of this.manifests) if (!this.tombstones.has(id)) { this.authorize(m.scope); manifests.push(structuredClone(m)); }
    for (const id of this.tombstones) this.authorize(parseTombstone(id).scope);
    return { manifests, tombstones: [...this.tombstones] };
  }
  restore(snapshot: ManifestSnapshot): void {
    const p = record(snapshot, ['manifests', 'tombstones']); canonicalDigest(snapshot);
    requireCondition(Array.isArray(p.manifests) && Array.isArray(p.tombstones), 'INVALID_SCHEMA', 'Invalid snapshot');
    const deleted = new Set(this.tombstones);
    for (const id of p.tombstones) { const tombstone = parseTombstone(id); this.authorize(tombstone.scope); deleted.add(id); }
    const restored = new Map(this.manifests); const seen = new Set<string>();
    for (const value of p.manifests) {
      const m = record(value, ['scope', 'artifactId', 'uploadId', 'expectedDigest', 'expectedBytes', 'revision', 'manifestDurable', 'published']);
      const input = parseInput({ scope: m.scope, artifactId: m.artifactId, uploadId: m.uploadId, expectedDigest: m.expectedDigest, expectedBytes: m.expectedBytes, revision: m.revision });
      const id = uploadKey(input.scope, input.artifactId); if (deleted.has(id)) continue;
      this.authorize(input.scope);
      requireCondition(typeof m.manifestDurable === 'boolean' && typeof m.published === 'boolean' && (!m.published || m.manifestDurable), 'INVALID_SCHEMA', 'Invalid manifest state');
      requireCondition(!seen.has(id), 'IDEMPOTENCY_CONFLICT', 'Duplicate snapshot identity'); seen.add(id);
      const current = this.manifests.get(id);
      requireCondition(current === undefined || canonicalDigest(inputOf(current)) === canonicalDigest(input), 'IDEMPOTENCY_CONFLICT', 'Restore cannot change artifact identity');
      const manifest: ArtifactManifest = { ...input, manifestDurable: m.manifestDurable || current?.manifestDurable === true, published: m.published || current?.published === true };
      if (manifest.published) this.assertBytes(manifest);
      restored.set(id, manifest);
    }
    for (const id of deleted) { this.tombstones.add(id); restored.delete(id); }
    this.manifests = restored;
  }
  private current(scope: ScopeRef, artifactId: string): ArtifactManifest {
    const p = parseScope(scope); this.authorize(p); const id = uploadKey(p, artifactId); const manifest = this.manifests.get(id);
    requireCondition(!this.tombstones.has(id), 'UNAUTHORIZED', 'Current artifact access required');
    requireCondition(manifest !== undefined, 'ARTIFACT_NOT_COMMITTED', 'Artifact not acknowledged'); return manifest;
  }
  private assertBytes(manifest: ArtifactManifest): void {
    const upload = this.storage.inspect(manifest.scope, manifest.uploadId);
    requireCondition(upload.durable && upload.digest === manifest.expectedDigest && upload.byteLength === manifest.expectedBytes, 'ARTIFACT_NOT_COMMITTED', 'Artifact bytes not durably confirmed');
  }
}
