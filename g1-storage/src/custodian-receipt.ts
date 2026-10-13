import { object,literal,version,digest,text,positive,revision,list,enumeration,refined } from './decoder.js';

const stream=object({path:text,bytes:revision,sha256:digest});
export const CustodianVariantSchema=object({name:text,positive:positive,refusals:revision,proofs:list(digest,32,1)});
export const CustodianProbeSummarySchema=refined(object({schemaVersion:version,scenario:enumeration('normal','sigkill','worker-deadline','owner-loss','owner-deadline','refusals','cleanup-failure'),
 candidate:digest,status:enumeration('passed','failed'),receipt:stream,journalDigest:digest,
 fixtureInstances:list(text,3,3),workerBirths:list(text,3,3),childBirths:list(text,3,3),
 censusBefore:list(text,128),censusAfter:list(text,128),fixtureFinallyOrder:list(text,3,3),
 durableWorkers:literal(3),settledWorkers:literal(3),ownedResidue:literal(0),totalMilliseconds:positive}),
 r=>new Set(r.fixtureInstances).size===3&&new Set(r.workerBirths).size===3&&new Set(r.childBirths).size===3&&r.fixtureFinallyOrder.join(',')==='C,B,A'&&JSON.stringify(r.censusBefore)===JSON.stringify(r.censusAfter));
export const CustodianBehaviorSchema=refined(object({schemaVersion:version,measurement:literal('storage-volume-custodian-behavior'),candidate:digest,
 variants:list(CustodianVariantSchema,8,8),probes:list(CustodianProbeSummarySchema,7,7),
 sentinelProofs:list(digest,32,3),censusBefore:list(text,128),censusAfter:list(text,128),cleanup:literal('complete'),
 assurance:literal('deterministic-local-only'),paidCallsAllowed:literal(false),externalQualification:literal('pending')}),
 r=>new Set(r.variants.map(v=>v.name)).size===8&&new Set(r.probes.map(p=>p.scenario)).size===7&&JSON.stringify(r.censusBefore)===JSON.stringify(r.censusAfter));
