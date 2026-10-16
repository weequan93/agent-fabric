/** Closed records are data, never grants. Reuse the installed hardened decoder. */
import { boolean, digest, enumeration, list, literal, nullable, object, positive, refined, revision, tagged, text, timestamp, uuid, version, type Value } from '../../g1-model/src/decoder.js';
import { generationSchema, effectBindingSchema } from './owners.js';
export { boolean, digest, enumeration, list, literal, nullable, object, positive, refined, revision, tagged, text, timestamp, uuid, version };
export type { Value };
export const PathSchema = enumeration('shell', 'sdk', 'browser', 'mcp', 'egress', 'filesystem', 'gui');
export const AssuranceSchema = enumeration('owned-local-fixture', 'qualified-linux-deployment');
export const BindingSchema = object({tenantId:uuid, spaceId:uuid, taskId:uuid, runId:uuid, assignmentId:uuid, storageBindingId:uuid});
export const DeploymentPinSchema = object({
 sourceDigest:digest, buildDigest:digest, lockDigest:digest, checksDigest:digest,
 backend:text, backendVersion:text, os:text, kernel:text, architecture:text,
 imageDigest:digest, topologyDigest:digest, workloadIdentityDigest:digest, mountsDigest:digest,
 controlsDigest:digest, toolsDigest:digest, browserVersion:nullable(text), modelProfileDigest:nullable(digest),
 runtimeGeneration:positive, policyGeneration:revision
});
export const CapabilityRowSchema = refined(object({
 rowId:text, path:enumeration('shell','sdk','browser','mcp','egress','filesystem','gui','runtime','service'),
 effectOrControl:text, backend:text, backendVersion:text, assurance:AssuranceSchema,
 status:enumeration('tested-support','tested-refusal','pending-external'), supported:boolean,
 checkIds:list(text,256,1), evidenceRefs:list(text), limitation:text,
 activation:enumeration('startup','live','unsupported')
}), r => r.supported === (r.status === 'tested-support') &&
 (r.status === 'pending-external' ? !r.supported : r.evidenceRefs.length > 0) &&
 (!r.supported || r.activation !== 'unsupported') && new Set(r.checkIds).size === r.checkIds.length && new Set(r.evidenceRefs).size === r.evidenceRefs.length);
export const QualificationSchema = refined(object({
 schemaVersion:version, qualificationId:uuid, pin:DeploymentPinSchema, assurance:AssuranceSchema,
 verifiedAt:timestamp, expiresAt:timestamp, verifierId:uuid, evidenceDigest:digest,
 rows:list(CapabilityRowSchema,256,1), blockingFindingIds:list(text)
}), q => Date.parse(q.verifiedAt) < Date.parse(q.expiresAt) && new Set(q.rows.map(r=>r.rowId)).size === q.rows.length &&
 q.rows.every(r=>r.assurance === q.assurance && r.backend === q.pin.backend && r.backendVersion === q.pin.backendVersion) &&
 q.rows.every(r=>!r.supported || r.path !== 'browser' || q.pin.browserVersion !== null) &&
 q.rows.every(r=>!r.supported || r.effectOrControl !== 'model' || q.pin.modelProfileDigest !== null));
export const RuntimeLeaseSchema = object({leaseId:uuid, binding:BindingSchema, instanceId:uuid, generation:generationSchema,
 runtimeGeneration:positive, policyGeneration:revision, expiresAt:timestamp, qualificationId:uuid});
const ResourceSchema = object({resourceId:refined(uuid,v=>v===v.toLowerCase()),mode:enumeration('read','write')});
export const QueueRequestSchema = refined(object({schemaVersion:version,commandId:uuid,idempotencyKey:uuid,binding:BindingSchema,
 expectedRevision:revision,expiresAt:timestamp,resources:list(ResourceSchema,32,1),envelopeDigest:digest}),
 r => r.resources.every((item,i)=>i===0 || r.resources[i-1]!.resourceId.toLowerCase() < item.resourceId.toLowerCase()));
export const QueueResultSchema = tagged('state',{
 acquired:object({state:literal('acquired'),ticketId:uuid,lease:RuntimeLeaseSchema}),
 waiting:object({state:literal('waiting'),ticketId:uuid,ownerTaskId:nullable(uuid),reason:text,resolver:text,charges:enumeration('continuing','unknown','none')}),
 cancelled:object({state:literal('cancelled'),ticketId:uuid})
});
export const DispatchResultSchema = tagged('state',{
 confirmed:object({state:literal('confirmed'),operationId:uuid,receiptDigest:digest}),
 'not-dispatched':object({state:literal('not-dispatched'),operationId:uuid,code:text}),
 unknown:object({state:literal('unknown'),operationId:uuid,replayAllowed:literal(false)})
});
export const DispatchRequestSchema = object({schemaVersion:version,toolId:text,toolVersion:text,path:PathSchema,
 effect:effectBindingSchema,envelopeDigest:digest,argumentsDigest:digest,leaseId:uuid,qualificationId:uuid});
export const OriginalSnapshotSchema = refined(object({
 path:enumeration('stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','stop-and-both-expiries'),
 operationId:uuid, originalBindingDigest:digest, actorId:uuid, runState:text, runRevision:revision,
 generation:generationSchema, leaseExpiresAt:timestamp, effectExpiresAt:timestamp, leaseRevoked:boolean,
 stopped:boolean, observedAt:timestamp
}), s => ({
 'stopped-original-stop-run':s.stopped, 'stopped-original-stop-task':s.stopped,
 'lease-expired-original':!s.stopped && Date.parse(s.leaseExpiresAt)<=Date.parse(s.observedAt),
 'effect-expired-original':!s.stopped && Date.parse(s.effectExpiresAt)<=Date.parse(s.observedAt),
 'stop-and-both-expiries':s.stopped && Date.parse(s.leaseExpiresAt)<=Date.parse(s.observedAt) && Date.parse(s.effectExpiresAt)<=Date.parse(s.observedAt)
 })[s.path]);
export const ReconciliationDataSchema = refined(object({operationId:uuid,originalBindingDigest:digest,actorId:uuid,
 authorityRevision:revision,stoppedOrExpiredSnapshotDigest:digest,lookupPolicyDigest:digest,
 issuedAt:timestamp,expiresAt:timestamp,sessionExpiresAt:timestamp,dispatch:literal(false)}),
 a=>Date.parse(a.expiresAt)>Date.parse(a.issuedAt) && Date.parse(a.expiresAt)<=Math.min(Date.parse(a.sessionExpiresAt),Date.parse(a.issuedAt)+30_000));
export const ObservationSchema = object({operationId:uuid,originalBindingDigest:digest,target:text,connectorDigest:digest,
 trustDigest:digest,lookupPolicyDigest:digest,generation:generationSchema,bootId:uuid,observedAt:timestamp,
 method:literal('GET'),outcome:literal('APPLIED'),writeNumber:positive,targetReceiptDigest:digest,
 quiescenceDigest:digest,descendantsQuiescent:literal(true),streamsClosed:literal(true)});
export const BackendPinsSchema = object({schemaVersion:version,release:text,releaseDigest:digest,apiVersion:text,
 configDigest:digest,imageDigest:digest,bootstrapDigest:digest,portsDigest:digest,driver:text,architecture:text});
export const ApprovedHostManifestSchema = refined(object({schemaVersion:version,approvalId:uuid,hostId:uuid,
 provider:text,architecture:text,imageDigest:digest,accessMethod:text,isolationDigest:digest,destinationsDigest:digest,
 resourceLimitsDigest:digest,maxVms:literal(1),maxSpendMicrounits:revision,startsAt:timestamp,expiresAt:timestamp,
 cleanupDigest:digest,retentionDigest:digest,verifierId:uuid,inventoryEvidenceDigest:digest,
 provenance:enumeration('synthetic-contract','independent-approved-host')}), m=>Date.parse(m.startsAt)<Date.parse(m.expiresAt));
export const ApiCommandSchema = object({schemaVersion:version,operationId:uuid,payload:text});
/** Bound raw bytes before JSON decode. Routes and flags are closed separately. */
export function decodeRuntimeBody(bytes:Uint8Array):Value<typeof ApiCommandSchema> {
 if(bytes.byteLength>65_536) throw new Error('BODY_TOO_LARGE');
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 return ApiCommandSchema.parse(value);
}
export function requireRuntimeRoute(method:string,route:string):void {
 if(method!=='POST'||route!=='/v1/runtime/command')throw new Error('UNKNOWN_ROUTE');
}
