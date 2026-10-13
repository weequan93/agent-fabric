/** Versioned data, not authority. Decoders copy/freeze and never invoke accessors.
 * Ports installed by the trusted composition root establish owner provenance.
 */
import { canonicalDigest } from '../../engine/contracts/src/identity.js';
import { safeAdd, safeMultiply, UNIT, PRICING_VERSION } from './arithmetic.js';
import { boolean, body, digest, enumeration, list, literal, nullable, object, positive, refined, revision, tagged, text, timestamp, uuid, version } from './decoder.js';

export const ScopeSchema = object({ tenantId: uuid, spaceId: uuid });
export const OriginalCallSchema = object({ tenantId: uuid, spaceId: uuid, operationId: uuid, attemptId: uuid, reservationId: uuid, requestDigest: digest });
export const CapabilitiesSchema = object({
 schemaVersion: version,
 inputModalities: list(enumeration('text', 'image', 'audio'), 3, 1),
 outputModalities: list(enumeration('text', 'image', 'audio'), 3, 1),
 toolDialect: text, schemaDialect: text,
 streaming: object({ text: boolean, toolArguments: boolean }),
 contextLimit: positive, contextUnit: literal('synthetic-utf8-bytes'),
 usageReporting: enumeration('known', 'delayed', 'unknown'),
 cancellation: object({ request: boolean, lookup: boolean, terminationProof: boolean }),
 caching: object({ providerPrivateState: boolean, promptPrefix: boolean, exactResponse: boolean, semanticResponse: boolean }),
 optionalFeatures: list(text), requiredOptionalFeatures: list(text),
 caps: object({ output: boolean, duration: boolean })
});
const ProfileShape = {
 schemaVersion: version, profileId: uuid, profileVersion: positive, profileDigest: digest,
 provider: text, model: text, modelVersion: text, deployment: text, route: text, region: text, dataPolicy: text,
 instructionPackDigest: digest,
 toolPresentation: object({ dialect: text, schemaDigest: digest }),
 contextPolicyDigest: digest,
 reasoningControls: object({ mode: enumeration('none', 'bounded'), maxUnits: revision, privateState: boolean }),
 verifier: object({ id: text, digest }),
 runtimeRequirements: object({ executionClass: enumeration('service', 'computer'), profileId: text, capabilities: list(text), environmentDigest: digest }),
 capabilities: CapabilitiesSchema,
 costAssumptions: object({ pricingVersion: literal(PRICING_VERSION), unit: literal(UNIT), serviceUnits: literal(2), pendingExposureUnits: literal(5), estimatedCostClass: enumeration('low', 'balanced', 'high') })
};
/** All full-profile components participate. Caller must pass already decoded data. */
export function profileDigestOf(profile: Omit<import('./decoder.js').Value<ReturnType<typeof profileObject>>, 'profileDigest'>): string {
 canonicalDigest(profile); // Reject accessors/non-JSON before copying, even for a cast caller.
 const { ...content } = profile;
 // The argument may also be a complete profile; digest itself is never hashed.
 Reflect.deleteProperty(content, 'profileDigest');
 return 'sha256:' + canonicalDigest(content);
}
function profileObject() { return object(ProfileShape); }
export const OperatingProfileSchema = refined(profileObject(), p =>
 p.profileDigest === profileDigestOf(p)
 && p.toolPresentation.dialect === p.capabilities.toolDialect
 && p.reasoningControls.privateState === p.capabilities.caching.providerPrivateState
 && new Set(p.capabilities.inputModalities).size === p.capabilities.inputModalities.length
 && new Set(p.capabilities.outputModalities).size === p.capabilities.outputModalities.length
 && p.capabilities.requiredOptionalFeatures.every(f => p.capabilities.optionalFeatures.includes(f)), 'CHECK_BINDING_MISMATCH');

export const LocalQualificationSchema = refined(object({
 schemaVersion: version, qualificationId: uuid, profileId: uuid, profileVersion: positive,
 profileDigest: digest, capabilitiesDigest: digest, adapterVersion: text, deployment: text,
 environmentDigest: digest, dependencyLockDigest: digest, checkDefinitionDigest: digest,
 probeId: uuid, testedAt: timestamp, expiresAt: timestamp, executedCases: list(text, 256, 1),
 assurance: literal('deterministic-local-only'), revoked: boolean
}), q => q.testedAt < q.expiresAt && new Set(q.executedCases).size === q.executedCases.length);
/** Does not prove the probe ran. Qualification registry must verify provenance/expiry. */
export const QualifiedProfileSchema = refined(object({ profile: OperatingProfileSchema, qualification: LocalQualificationSchema }), q =>
 q.profile.profileId === q.qualification.profileId && q.profile.profileVersion === q.qualification.profileVersion
 && q.profile.profileDigest === q.qualification.profileDigest
 && 'sha256:' + canonicalDigest(q.profile.capabilities) === q.qualification.capabilitiesDigest
 && q.profile.deployment === q.qualification.deployment
 && q.profile.runtimeRequirements.environmentDigest === q.qualification.environmentDigest, 'QUALIFICATION_MISMATCH');

export const VersionPinsSchema = object({
 schemaVersion: version, engineDigest: digest, behaviorDigest: digest, schemaDigest: digest,
 environmentDigest: digest, dependencyLockDigest: digest, checkDefinitionDigest: digest
});
export const CostCategorySchema = enumeration('model', 'service', 'tool', 'active-compute', 'reserved-compute', 'cold-start', 'retained-storage', 'network', 'embedding', 'reranking');
export const TaskCallBindingSchema = object({
 schemaVersion: version, tenantId: uuid, spaceId: uuid, actorId: uuid, payerId: uuid, costCenter: text,
 taskId: uuid, runId: uuid, parentTaskId: nullable(uuid), sessionId: uuid,
 purpose: enumeration('answer', 'planning', 'reflection', 'embedding', 'reranking', 'tool', 'execution', 'maintenance'),
 category: CostCategorySchema, requirementsRevision: revision, versions: VersionPinsSchema,
 policyRevision: revision, membershipRevision: revision, sourceRevisionDigest: digest,
 cancellationGeneration: revision, workerGeneration: revision, resourceGeneration: revision,
 intent: enumeration('Ask', 'Plan', 'Act')
});
export const SourceRecordSchema = object({
 sourceId: uuid, revision, digest, scope: ScopeSchema,
 audience: object({ destinationSpaceId: uuid, recipientActorIds: list(uuid, 256, 1), revisionDigest: digest }),
 provenance: text, observedAt: timestamp,
 trust: enumeration('approved-instruction', 'user-goal', 'requirement', 'source-evidence', 'untrusted-observation'),
 kind: enumeration('instruction', 'goal', 'requirement', 'evidence', 'repository', 'memory', 'dialogue', 'tool-schema'),
 content: body
});
export const ContextManifestSchema = object({
 schemaVersion: version, scope: ScopeSchema, policyRevision: revision, membershipRevision: revision,
 profileDigest: digest, encodingDigest: digest, sources: list(SourceRecordSchema),
 crossThreadRecall: boolean
});
export const TaskCapsuleSchema = refined(object({
 schemaVersion: version, binding: TaskCallBindingSchema, manifest: ContextManifestSchema,
 requirements: list(body), evidence: list(SourceRecordSchema), hypotheses: list(body), uncertainty: list(body),
 failedPlans: list(body), pendingOperations: list(uuid), artifacts: list(object({ artifactId: uuid, revision, digest })),
 checks: list(object({ checkId: uuid, artifactDigest: digest, status: enumeration('pending', 'passed', 'failed', 'unknown') })),
 nextSafeAction: text
}), c => c.binding.tenantId === c.manifest.scope.tenantId && c.binding.spaceId === c.manifest.scope.spaceId
 && c.binding.policyRevision === c.manifest.policyRevision && c.binding.membershipRevision === c.manifest.membershipRevision, 'CHECK_BINDING_MISMATCH');
export const EncodedRequestSchema = object({
 schemaVersion: version, original: OriginalCallSchema, profileDigest: digest, contextDigest: digest,
 payload: body, outputCap: positive, durationCapMs: positive, dispatchEpoch: positive
});
export const ModelOperationSchema = refined(object({
 schemaVersion: version, tenantId: uuid, spaceId: uuid, operationId: uuid, taskId: uuid, runId: uuid,
 sessionId: uuid, sessionTurn: positive, originalKey: text, requestDigest: digest, bindingDigest: digest,
 retryCeiling: refined(positive, n => n <= 3), attemptsTaken: refined(revision, n => n <= 3),
 status: enumeration('prepared', 'pending', 'unknown', 'settled', 'safely-failed'), knownReceiptId: nullable(uuid)
}), o => o.attemptsTaken <= o.retryCeiling && (o.status === 'settled' ? o.knownReceiptId !== null : o.knownReceiptId === null));
export const ModelAttemptSchema = refined(object({
 schemaVersion: version, original: OriginalCallSchema, ordinal: refined(positive, n => n <= 3),
 profileDigest: digest, contextDigest: digest, route: text,
 retryRequester: enumeration('engine', 'adapter'), dispatchEpoch: positive,
 claimId: nullable(uuid), status: enumeration('prepared', 'claimed', 'accepted', 'unknown', 'settled', 'sealed-not-accepted')
}), a => a.status === 'prepared' ? a.claimId === null : a.status === 'sealed-not-accepted' || a.claimId !== null);
export const CostComponentsSchema = object({
 model: revision, service: revision, tool: revision, activeCompute: revision, reservedCompute: revision,
 coldStart: revision, retainedStorage: revision, network: revision, embedding: revision, reranking: revision
});
export const UsageReceiptSchema = refined(object({
 schemaVersion: version, original: OriginalCallSchema, ownerId: uuid, receiptId: uuid, usageKey: text,
 measuredUnits: revision, components: CostComponentsSchema,
 outcome: enumeration('answer', 'known-failure', 'cancelled'), outputDigest: nullable(digest),
 assurance: literal('deterministic-local-only'), measuredAt: timestamp
}), r => safeAdd(...Object.values(r.components)) === r.measuredUnits
 && (r.outcome === 'answer' ? r.outputDigest !== null : r.outputDigest === null), 'CHECK_BINDING_MISMATCH');
export const OwnerObservationSchema = tagged('status', {
 settled: object({ status: literal('settled'), receipt: UsageReceiptSchema }),
 accepted: object({ status: literal('accepted'), original: OriginalCallSchema }),
 unknown: object({ status: literal('unknown'), original: OriginalCallSchema }),
 'sealed-not-accepted': object({ status: literal('sealed-not-accepted'), original: OriginalCallSchema, ownerId: uuid, proofId: uuid, dispatchEpoch: positive })
});
export const WaitSchema = refined(object({
 schemaVersion: version, taskId: uuid, runId: uuid, resourceId: nullable(uuid),
 reason: enumeration('budget', 'model-unavailable', 'approval', 'resource', 'permission', 'connection', 'unknown-usage'),
 resolver: text, since: timestamp, updatedAt: timestamp, expiresAt: nullable(timestamp),
 preservedWorkDigest: digest, allowedNextActions: list(enumeration('top-up', 'smaller-scope', 'resume', 'switch-profile', 'stop', 'reconcile', 'retry-setup', 'contact-administrator'), 8, 1),
 ongoingChargeCategories: list(CostCategorySchema), replayAllowed: literal(false)
}), w => w.since <= w.updatedAt && (w.expiresAt === null || w.updatedAt < w.expiresAt));
export const ResourceChargeSchema = refined(object({
 schemaVersion: version, tenantId: uuid, spaceId: uuid, resourceId: uuid, generation: revision,
 receiptId: uuid, usageKey: text, category: enumeration('active-compute', 'reserved-compute', 'cold-start', 'retained-storage', 'network'),
 start: revision, end: positive, rateUnits: revision, ratePolicyVersion: text,
 chargePolicy: enumeration('active', 'reserved-until-confirmed-suspended', 'retention'),
 measuredUnits: revision, runId: nullable(uuid), actionId: nullable(uuid), operationId: nullable(uuid),
 allocation: literal('unallocated-shared-cost'), assurance: literal('deterministic-local-only')
}), r => r.start < r.end && safeMultiply(r.end - r.start, r.rateUnits) === r.measuredUnits, 'CHECK_BINDING_MISMATCH');
const EventBinding = {
 schemaVersion: version, tenantId: uuid, spaceId: uuid, taskId: uuid, runId: uuid, sessionId: uuid,
 operationId: nullable(uuid), attemptId: nullable(uuid), generation: revision, sequence: positive, at: timestamp
};
const event = <const T extends string, P>(kind: T, payload: import('./decoder.js').Decoder<P>) => object({ ...EventBinding, kind: literal(kind), payload });
export const ModelEventSchema = refined(tagged('kind', {
 'model-prepared': event('model-prepared', object({ original: OriginalCallSchema, bindingDigest: digest, profileDigest: digest, reservedUnits: revision })),
 'attempt-admitted': event('attempt-admitted', object({ original: OriginalCallSchema, ordinal: positive, dispatchEpoch: positive })),
 'model-accepted': event('model-accepted', object({ original: OriginalCallSchema })),
 'usage-unknown': event('usage-unknown', object({ original: OriginalCallSchema, replayAllowed: literal(false) })),
 'usage-settled': event('usage-settled', object({ receiptId: uuid, measuredUnits: revision })),
 'model-safely-failed': event('model-safely-failed', object({ proofId: uuid, dispatchEpoch: positive })),
 'profile-switched': event('profile-switched', object({ previousDigest: digest, currentDigest: digest, cache: literal('lost/not-used'), revalidationEstimate: revision })),
 'budget-wait': event('budget-wait', WaitSchema),
 'allowance-changed': event('allowance-changed', object({ allowanceId: uuid, commandId: uuid, addedUnits: positive })),
 'resource-charge-recorded': event('resource-charge-recorded', object({ receiptId: uuid, measuredUnits: revision })),
 'native-stop': event('native-stop', object({ cancellationGeneration: positive, unsettled: boolean })),
 'native-resume': event('native-resume', object({ cancellationGeneration: revision, commandId: uuid }))
}), e => {
 if ('original' in e.payload) return e.payload.original.tenantId === e.tenantId && e.payload.original.spaceId === e.spaceId
  && e.payload.original.operationId === e.operationId && e.payload.original.attemptId === e.attemptId;
 if (e.kind === 'budget-wait') return e.payload.taskId === e.taskId && e.payload.runId === e.runId;
 return true;
}, 'CHECK_BINDING_MISMATCH');
export const LocalConfigSchema = object({
 schemaVersion: version, adapter: literal('deterministic-local'), host: literal('127.0.0.1'),
 paidCallsAllowed: literal(false), responseCaching: literal(false), gatewayKnowledgeMemory: literal(false),
 maxAttempts: literal(3), maxAncestry: literal(64), maxContenders: literal(8),
 postgresImage: literal('postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333')
});
