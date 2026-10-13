import { canonicalDigest } from '../../../engine/contracts/src/identity.js';
import { profileDigestOf, OperatingProfileSchema, UsageReceiptSchema, LocalQualificationSchema } from '../../src/schema.js';
import type { OperatingProfile, UsageReceipt, LocalQualification } from '../../src/contracts.js';
export const id = (n: number): string => '00000000-0000-0000-0000-' + n.toString(16).padStart(12, '0');
export const sha = (n: number): string => 'sha256:' + n.toString(16).padStart(64, '0');
export function profileFixture(): OperatingProfile {
 const profile = {
  schemaVersion: 1 as const, profileId: id(1), profileVersion: 1, profileDigest: sha(0),
  provider: 'local-test-owner', model: 'deterministic-text', modelVersion: '1', deployment: 'local-deployment-a',
  route: 'synthetic-route-a', region: 'synthetic-region-a', dataPolicy: 'synthetic-local-only',
  instructionPackDigest: sha(2), toolPresentation: { dialect: 'local-json-v1', schemaDigest: sha(3) },
  contextPolicyDigest: sha(4), reasoningControls: { mode: 'bounded' as const, maxUnits: 16, privateState: true },
  verifier: { id: 'local-verifier-v1', digest: sha(5) },
  runtimeRequirements: { executionClass: 'service' as const, profileId: 'local-service', capabilities: ['model-text'], environmentDigest: sha(6) },
  capabilities: {
   schemaVersion: 1 as const, inputModalities: ['text' as const], outputModalities: ['text' as const],
   toolDialect: 'local-json-v1', schemaDialect: 'local-closed-json-v1', streaming: { text: true, toolArguments: true },
   contextLimit: 4096, contextUnit: 'synthetic-utf8-bytes' as const, usageReporting: 'delayed' as const,
   cancellation: { request: true, lookup: true, terminationProof: false },
   caching: { providerPrivateState: true, promptPrefix: false, exactResponse: false, semanticResponse: false },
   optionalFeatures: [], requiredOptionalFeatures: [], caps: { output: true, duration: true }
  },
  costAssumptions: { pricingVersion: 'synthetic-bytes-v1' as const, unit: 'synthetic-utf8-byte-unit' as const, serviceUnits: 2 as const, pendingExposureUnits: 5 as const, estimatedCostClass: 'balanced' as const }
 };
 profile.profileDigest = profileDigestOf(profile);
 return OperatingProfileSchema.parse(profile);
}
export function qualificationFixture(profile = profileFixture()): LocalQualification {
 return LocalQualificationSchema.parse({
  schemaVersion: 1, qualificationId: id(7), profileId: profile.profileId, profileVersion: profile.profileVersion,
  profileDigest: profile.profileDigest, capabilitiesDigest: 'sha256:' + canonicalDigest(profile.capabilities),
  adapterVersion: 'deterministic-adapter-v1', deployment: profile.deployment,
  environmentDigest: profile.runtimeRequirements.environmentDigest, dependencyLockDigest: sha(8), checkDefinitionDigest: sha(9),
  probeId: id(10), testedAt: '2026-10-07T00:00:00.000Z', expiresAt: '2026-10-08T00:00:00.000Z',
  executedCases: ['fixture-shape-only'], assurance: 'deterministic-local-only', revoked: false
 });
}
/** These are pure test data, not recorded probes, acceptance or cost evidence. */
export function receiptFixture(): UsageReceipt {
 return UsageReceiptSchema.parse({
  schemaVersion: 1, original: { tenantId: id(11), spaceId: id(12), operationId: id(13), attemptId: id(14), reservationId: id(15), requestDigest: sha(16) },
  ownerId: id(17), receiptId: id(18), usageKey: 'synthetic-owner-attempt-14', measuredUnits: 12,
  components: { model: 10, service: 2, tool: 0, activeCompute: 0, reservedCompute: 0, coldStart: 0, retainedStorage: 0, network: 0, embedding: 0, reranking: 0 },
  outcome: 'answer', outputDigest: sha(19), assurance: 'deterministic-local-only', measuredAt: '2026-10-07T00:00:01.000Z'
 });
}
