import { object,literal,uuid,digest,positive,revision,text,enumeration,list,refined } from './decoder.js';
import { LIMITS } from './arithmetic.js';
// A separate V2 contract namespace preserves the complete frozen V1 exports.
const AudienceSchema=refined(object({destinationSpaceId:uuid,recipientActorIds:list(uuid,LIMITS.recipients,1),revisionDigest:digest}),a=>new Set(a.recipientActorIds).size===a.recipientActorIds.length);
const SourceRefSchema=object({tenantId:uuid,spaceId:uuid,sourceId:uuid,sourceTaskId:uuid,revision:positive,digest,audience:AudienceSchema});
/** V2 adds exact admitted heads and current source audiences. V1 stays a
 * closed historical contract; it cannot authorize current disclosure. */
export const CurrentSelectedRecordSchema = object({knowledgeId:uuid,knowledgeRevision:positive,
 knowledgeWitness:digest,sourceWitness:digest,source:SourceRefSchema,
 inclusionReason:enumeration('exact-id','exact-subject','authorized-tail')});
export const CurrentRetrievalManifestSchema = refined(object({schemaVersion:literal(2),tenantId:uuid,spaceId:uuid,
 audience:AudienceSchema,policyRevision:positive,membershipRevision:positive,restrictionEpoch:positive,
 storageGeneration:uuid,profile:literal('local-extractive-v1'),indexWatermark:revision,
 selected:list(CurrentSelectedRecordSchema,LIMITS.selected),limitations:list(text,16)}),m=>
 m.audience.destinationSpaceId===m.spaceId&&new Set(m.selected.map(s=>s.knowledgeId)).size===m.selected.length
 &&m.selected.every(s=>s.source.tenantId===m.tenantId&&s.source.spaceId===m.spaceId&&s.source.audience.destinationSpaceId===m.spaceId));
