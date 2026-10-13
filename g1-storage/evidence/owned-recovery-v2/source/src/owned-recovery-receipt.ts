import { object, literal, version, uuid, digest, revision, positive, timestamp, text,
 nullable, boolean, enumeration, list, tagged, refined } from './decoder.js';

const state=enumeration('owned','absent','refused');
export const RecoveryRootIdentitySchema=object({owner:uuid,instance:uuid,rootId:uuid,device:positive,inode:positive});
export const RecoveryObservationSchema=tagged('kind',{
 container:object({kind:literal('container'),observedAt:timestamp,state,id:text,name:text,
  owner:nullable(text),instance:nullable(text),image:nullable(text),inspectDigest:nullable(digest),
  loopback:boolean,bindMounts:revision,databaseOwner:nullable(uuid),databaseInstance:nullable(uuid),
  databaseVerified:boolean,refusal:nullable(text)}),
 root:object({kind:literal('root'),observedAt:timestamp,state,path:text,
  device:nullable(positive),inode:nullable(positive),symlink:boolean,markerDigest:nullable(digest),
  expected:RecoveryRootIdentitySchema,refusal:nullable(text)}),
 process:object({kind:literal('process'),observedAt:timestamp,state,pid:positive,
  ppid:nullable(positive),instance:nullable(text),commandDigest:nullable(digest),
  expectedCommand:text,expectedInstance:text,commandMatches:boolean,nonce:uuid,originalParentPid:positive,
  originalParentPresent:boolean,censusDigest:digest,refusal:nullable(text)})
});
export const RecoveryOutcomeSchema=object({action:enumeration('removed','already-absent','refused'),
 before:RecoveryObservationSchema,after:RecoveryObservationSchema,signals:list(text,2),refusal:nullable(text)});
const stream=object({path:text,bytes:revision,sha256:digest});
export const RecoveryVariantSchema=object({name:text,observedAt:timestamp,positive:positive,
 refusals:revision,proofs:list(digest,64,1)});
export const LegacyRecoverySchema=object({job:literal('job-27c90a1221'),originalStreams:list(stream,2,2),
 rootPath:literal('/private/tmp/agent-fabric-storage-e6o6Yo'),owner:uuid,instance:uuid,
 originalContainerCensus:list(text,128),censusBefore:list(text,128),censusAfter:list(text,128),
 outcomes:list(RecoveryOutcomeSchema,16,7),refusals:revision,residue:revision,
 commandBasis:literal('unchanged-launchOwned-and-idp-registration'),
 sentinelProofs:list(digest,16,3),sentinelPreserved:literal(true)});
export const RecoveryBehaviorSchema=refined(object({schemaVersion:version,
 measurement:literal('storage-owned-recovery-behavior'),candidate:digest,
 censusBefore:list(text,128),censusAfter:list(text,128),
 variants:list(RecoveryVariantSchema,8,8),legacy:LegacyRecoverySchema,
 cleanup:literal('complete'),assurance:literal('deterministic-local-only'),paidCallsAllowed:literal(false)}),
 r=>new Set(r.variants.map(v=>v.name)).size===8&&r.legacy.refusals===0&&r.legacy.residue===0);
export const RecoveryJournalSchema=object({schemaVersion:version,
 measurement:literal('storage-owned-recovery-receipt'),runId:uuid,createdAt:timestamp,
 candidate:object({digest,files:positive}),journal:object({path:text,identity:RecoveryRootIdentitySchema}),
 guards:list(object({path:text,sha256:digest}),32,14),
 streams:list(stream,2,2),behavior:RecoveryBehaviorSchema,
 tests:literal(9),failed:literal(0),cancelled:literal(0),skipped:literal(0),todo:literal(0),
 externalQualification:literal('pending')});
