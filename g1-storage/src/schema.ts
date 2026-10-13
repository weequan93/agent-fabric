import { CurrentRetrievalManifestSchema } from './ask-disclosure-schema.js';
import { object, literal, version, uuid, digest, revision, positive, timestamp, text, body,
 boolean, nullable, enumeration, list, refined, tagged, type Decoder } from './decoder.js';
import { LIMITS, safeAdd } from './arithmetic.js';
import { demand, STORAGE_ERROR_CODES } from './errors.js';

export const ContentClassSchema = enumeration('source','knowledge','artifact','draft','live-file',
 'checkpoint','summary','index','cache','ask','backup');
export const KnowledgeStatusSchema = enumeration('proposed','user-asserted','source-verified',
 'disputed','superseded','expired','deleted');
export const ScopeSchema = object({tenantId:uuid,spaceId:uuid});
export const AudienceSchema = refined(object({destinationSpaceId:uuid,
 recipientActorIds:list(uuid,LIMITS.recipients,1),revisionDigest:digest}),
 a=>new Set(a.recipientActorIds).size===a.recipientActorIds.length);
export const RevisionRefSchema = object({id:uuid,revision:positive});
export const SourceRefSchema = object({tenantId:uuid,spaceId:uuid,sourceId:uuid,sourceTaskId:uuid,
 revision:positive,digest,audience:AudienceSchema});
export const VerificationSchema = object({method:enumeration('registered-source-check'),checkId:uuid,checkedAt:timestamp});
export const SourcePayloadSchema = object({schemaVersion:version,title:body,uri:nullable(body),
 narrative:body,contentDigest:digest,assertedBy:uuid,recordedAt:timestamp});
export const KnowledgeSchema = refined(object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 id:uuid,revision:positive,subject:text,value:body,source:SourceRefSchema,assertedBy:uuid,
 recordedAt:timestamp,validFrom:timestamp,validUntil:nullable(timestamp),expiresAt:timestamp,
 classification:enumeration('personal','group'),status:KnowledgeStatusSchema,
 verification:nullable(VerificationSchema),supersedes:nullable(RevisionRefSchema)}), k=>
 k.expiresAt>k.validFrom && (k.validUntil===null||k.validUntil>k.validFrom)
 && (k.status!=='source-verified'||k.verification!==null)
 && k.source.tenantId===k.tenantId && k.source.audience.destinationSpaceId===k.spaceId);
export const QueryControlsSchema = object({attachments:boolean,olderRecall:boolean,saveReusable:boolean});

const command = {schemaVersion:version,sessionId:uuid,targetId:uuid,key:uuid,
 expectedRevision:revision,expiresAt:timestamp} as const;
const assertion = {subject:text,value:body,sourceId:uuid,sourceRevision:positive,
 validFrom:timestamp,validUntil:nullable(timestamp),expiresAt:timestamp,
 classification:enumeration('personal','group'),intent:enumeration('assert','propose','registered-check'),
 checkId:nullable(uuid)} as const;
export const AssertionSchema = refined(object(assertion),a=>a.expiresAt>a.validFrom
 && (a.validUntil===null||a.validUntil>a.validFrom)
 && (a.intent==='registered-check'?a.checkId!==null:a.checkId===null));
export const SaveCommandSchema = refined(object({...command,action:literal('save'),assertion:AssertionSchema}),c=>c.expectedRevision===0);
export const CorrectCommandSchema = refined(object({...command,action:literal('correct'),assertion:AssertionSchema}),c=>c.expectedRevision>0);
export const ForgetCommandSchema = refined(object({...command,action:literal('forget')}),c=>c.expectedRevision>0);
export const SourceCommandSchema = refined(object({...command,action:literal('source'),title:body,
 uri:nullable(body),narrative:body,contentDigest:digest,retentionExpiresAt:timestamp,
 saveReusable:boolean}),c=>c.expectedRevision===0);
export const LookupCommandSchema = object({schemaVersion:version,sessionId:uuid,key:uuid,bindingDigest:digest});
export const InspectCommandSchema = object({schemaVersion:version,sessionId:uuid,targetId:uuid,history:boolean});
export const SelectorSchema = tagged('kind',{
 id:object({kind:literal('id'),value:uuid}),subject:object({kind:literal('subject'),value:text}),
 tail:object({kind:literal('tail'),limit:refined(positive,n=>n<=LIMITS.selected)})});
export const AskCommandSchema = object({schemaVersion:version,sessionId:uuid,key:uuid,
 expectedRevision:revision,expiresAt:timestamp,question:body,selector:SelectorSchema,
 attachmentIds:refined(list(uuid,LIMITS.selected),v=>new Set(v).size===v.length)});
export const QueryControlsCommandSchema = object({...command,action:literal('query-controls'),controls:QueryControlsSchema});

/** Canonical base64, with decoded bounds checked before allocating Buffer. */
export function base64(max:number,exact?:number):Decoder<string>{return {parse(v){
 demand(typeof v==='string'&&v.length<=4*Math.ceil(max/3)
  &&v.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(v));
 const size=v.length/4*3-(v.endsWith('==')?2:v.endsWith('=')?1:0);
 demand(size<=max&&(exact===undefined||size===exact)
  &&(v.length===0||Buffer.from(v.slice(-4),'base64').toString('base64')===v.slice(-4)));return v;
}};}
export const BindingSchema = object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 class:ContentClassSchema,id:uuid,revision:positive,generation:uuid,keyId:uuid});
export const CipherEnvelopeSchema = object({schemaVersion:version,algorithm:literal('AES-256-GCM'),
 tenantId:uuid,spaceId:uuid,class:ContentClassSchema,id:uuid,revision:positive,generation:uuid,keyId:uuid,
 nonce:base64(12,12),tag:base64(16,16),ciphertext:base64(LIMITS.backupBytes)});
export const FileEntrySchema = object({id:uuid,revision:positive,objectId:uuid,
 byteLength:refined(revision,n=>n<=LIMITS.backupBytes),contentDigest:digest});
export const FileManifestSchema = object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 id:uuid,revision:positive,generation:uuid,filename:body,logicalPath:body,entry:FileEntrySchema,
 source:nullable(SourceRefSchema),base:nullable(RevisionRefSchema),validationId:nullable(uuid)});
export const DraftCommandSchema = object({...command,action:literal('draft'),baseRevision:revision,
 filename:body,logicalPath:body,bytes:base64(LIMITS.commandBytes),sourceId:nullable(uuid)});
export const LiveWriteCommandSchema = object({...command,action:literal('live-write'),
 filename:body,logicalPath:body,bytes:base64(LIMITS.commandBytes)});
export const PromoteCommandSchema = refined(object({...command,action:literal('promote'),draftId:uuid,
 draftRevision:positive,validationId:uuid}),c=>c.expectedRevision>0);
export const ArtifactCommandSchema = refined(object({...command,action:literal('artifact'),filename:body,
 bytes:base64(LIMITS.commandBytes),sourceId:nullable(uuid),validationId:uuid}),c=>c.expectedRevision===0);
export const CheckpointCommandSchema = object({...command,action:literal('checkpoint'),
 liveIds:refined(list(uuid,LIMITS.files),ids=>new Set(ids).size===ids.length)});
export const CheckpointManifestSchema = object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 id:uuid,revision:positive,generation:uuid,confirmedAt:timestamp,
 files:refined(list(FileEntrySchema,LIMITS.files),files=>new Set(files.map(f=>f.id)).size===files.length)});

export const SelectedRecordSchema = object({knowledgeId:uuid,knowledgeRevision:positive,
 source:SourceRefSchema,inclusionReason:enumeration('exact-id','exact-subject','authorized-tail')});
export const RetrievalManifestSchema = refined(object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 audience:AudienceSchema,policyRevision:positive,membershipRevision:positive,restrictionEpoch:positive,
 storageGeneration:uuid,profile:literal('local-extractive-v1'),indexWatermark:revision,
 selected:list(SelectedRecordSchema,LIMITS.selected),limitations:list(text,16)}),m=>
 m.audience.destinationSpaceId===m.spaceId&&new Set(m.selected.map(s=>s.knowledgeId)).size===m.selected.length
 &&m.selected.every(s=>s.source.tenantId===m.tenantId&&s.source.audience.destinationSpaceId===m.spaceId));
const AnyRetrievalManifestSchema:Decoder<ReturnType<typeof RetrievalManifestSchema.parse>|ReturnType<typeof CurrentRetrievalManifestSchema.parse>>={parse(v){
 const d=v&&typeof v==='object'?Object.getOwnPropertyDescriptor(v,'schemaVersion'):undefined;
 demand(d&&Object.hasOwn(d,'value'));return d.value===2?CurrentRetrievalManifestSchema.parse(v):RetrievalManifestSchema.parse(v);
}};
export const AskPayloadSchema = object({schemaVersion:version,question:body,answer:body,
 manifest:AnyRetrievalManifestSchema});
export const DerivedPayloadSchema = object({schemaVersion:version,kind:enumeration('summary','index','cache'),
 title:body,body,watermark:revision,manifest:RetrievalManifestSchema});
export const DependencyNodeSchema = object({id:uuid,revision:positive,ancestors:list(RevisionRefSchema,LIMITS.nodes)});
export const DependencyGraphSchema = refined(list(DependencyNodeSchema,LIMITS.nodes),nodes=>{
 const map=new Map(nodes.map(n=>[n.id,n]));if(map.size!==nodes.length)return false;
 const visiting=new Set<string>(),depths=new Map<string,number>();
 const depth=(id:string):number=>{
  if(visiting.has(id))return Infinity;const known=depths.get(id);if(known!==undefined)return known;
  const node=map.get(id);if(!node)return Infinity;visiting.add(id);
  let result=0;
  if(new Set(node.ancestors.map(a=>a.id)).size!==node.ancestors.length)result=Infinity;
  for(const a of node.ancestors){if(map.get(a.id)?.revision!==a.revision){result=Infinity;break;}
   result=Math.max(result,1+depth(a.id));if(result>LIMITS.depth)break;}
  visiting.delete(id);depths.set(id,result);return result;
 };return nodes.every(n=>depth(n.id)<=LIMITS.depth);
});

export const EventSchema = object({schemaVersion:version,tenantId:uuid,spaceId:uuid,eventId:uuid,
 commandKey:uuid,mutationId:uuid,jobId:nullable(uuid),targetId:uuid,revision:positive,epoch:positive,at:timestamp,
 kind:enumeration('knowledge-committed','knowledge-proposed','knowledge-superseded','artifact-committed',
 'draft-saved','live-written','checkpoint-confirmed','content-tombstoned','source-restricted',
 'derived-invalidated','backup-confirmed','restore-state-changed','ask-answered')});
export const CommandSchema = tagged('action',{save:SaveCommandSchema,correct:CorrectCommandSchema,
 forget:ForgetCommandSchema,source:SourceCommandSchema,draft:DraftCommandSchema,promote:PromoteCommandSchema,
 artifact:ArtifactCommandSchema,'live-write':LiveWriteCommandSchema,checkpoint:CheckpointCommandSchema,
 'query-controls':QueryControlsCommandSchema});
export const SaveResultSchema = tagged('status',{
 'saved-here':object({schemaVersion:version,status:literal('saved-here'),receiptId:uuid,id:uuid,revision:positive}),
 'pending-review':object({schemaVersion:version,status:literal('pending-review'),receiptId:uuid,proposalId:uuid}),
 'not-saved':object({schemaVersion:version,status:literal('not-saved'),error:enumeration('INVALID_SCHEMA',
  'UNAUTHORIZED','STALE_REVISION','RETENTION_RESTRICTED','CONTENT_UNAVAILABLE'),nextAction:enumeration('inspect-current-authority','compare-current','request-permitted-source')}),
 unknown:object({schemaVersion:version,status:literal('unknown'),key:uuid,replayAllowed:literal(false),nextAction:literal('original-key-lookup')})});
export const FailureResultSchema = tagged('status',{
 'not-saved':object({schemaVersion:version,status:literal('not-saved'),error:enumeration(...STORAGE_ERROR_CODES),
  replayAllowed:literal(false),nextAction:literal('inspect-current-authority')}),
 unknown:object({schemaVersion:version,status:literal('unknown'),error:literal('UNKNOWN_COMMIT'),
  replayAllowed:literal(false),nextAction:literal('original-key-lookup')})});
/** F-O counters must come from actual reachable ports/effects in each suite.
 * Schema validity does not prove the observations; H04 mutates those real seams.
 */
export const QualificationObservationSchema = object({schemaVersion:version,measurement:literal('storage-observations'),
 suite:enumeration('delivery-operations','verify-restore-measurement','verify-restore-integrity','verify-encryption','verify-retained-copies','verify-ask-routing','verify-restore-current','verify-restore-interruption','verify-ask-recall','verify-ask-disclosure','atomic-disconnect','authority','owned-encryption','commit-conflict','recall-ask','lifecycle-propagation',
 'volume-draft','backup-restore','harness','delivery-audit','migration','encryption','staging','knowledge',
 'recall-broker','native-ask','ask-disclosure','retention-forget','dependency-graph','maintenance-admission','propagation-retry','backup-capture','query-controls','artifact-publication','volume-drafts','volume-promotion','source-content','atomic-save','knowledge-status','knowledge-correction','command-recovery','commands','volume','ask','admission','lifecycle','maintenance','backup','restore','restore-recovery','security','restore-import','restore-activation','restore-progress','verify-authority','verify-atomic','verify-knowledge','verify-artifact','verify-volume','verify-lifecycle','verify-propagation-retry','verify-maintenance','verify-lifecycle-races'),
 positives:object({save:revision,ask:revision,forget:revision,restore:revision,read:revision,write:revision,
  deny:revision,conflict:revision,propagate:revision,backup:revision,owner:revision,harness:revision}),
 violations:object({unauthorizedDisclosure:revision,unauthorizedMutation:revision,silentLostUpdate:revision,
  duplicateCanonicalEffect:revision,restrictedResurrection:revision,askComputerStart:revision})});
export const ForgetResultSchema = object({schemaVersion:version,status:literal('tombstoned'),receiptId:uuid,
 affectedActive:revision,affectedDerived:revision,pendingJobs:revision,externalCopies:literal('not-recalled'),
 backupErasure:literal('subject-to-retention'),retentionRestrictions:list(text,16),nextAction:literal('inspect-propagation')});
export const FileResultSchema = object({schemaVersion:version,status:enumeration('live-written','draft-saved',
 'checkpoint-confirmed','artifact-committed'),receiptId:uuid,id:uuid,revision:positive,
 lastSuccessfulCheckpoint:nullable(timestamp),unsavedEditorWork:literal('not-covered')});
export const AskResultSchema = object({schemaVersion:version,status:enumeration('answered','evidence-gap','disputed'),
 receiptId:uuid,answer:body,manifest:AnyRetrievalManifestSchema,profile:literal('local-extractive-v1'),
 computerStarted:literal(false),nextAction:enumeration('inspect-sources','request-permitted-source')});

export const BackupItemSchema = refined(object({class:ContentClassSchema,id:uuid,revision:positive,
 envelope:CipherEnvelopeSchema,objectId:nullable(uuid),decodedBytes:refined(revision,n=>n<=LIMITS.backupBytes)}),i=>
 i.decodedBytes===i.envelope.ciphertext.length/4*3-(i.envelope.ciphertext.endsWith('==')?2:i.envelope.ciphertext.endsWith('=')?1:0));
const backupInventory = refined(object({schemaVersion:version,tenantId:uuid,spaceId:uuid,
 backupId:uuid,generation:uuid,capturedEpoch:positive,confirmedAt:timestamp,expiresAt:timestamp,
 lastSuccessfulCheckpoint:nullable(timestamp),items:list(BackupItemSchema,LIMITS.files),decodedBytes:revision}),b=>
 b.expiresAt>b.confirmedAt&&b.items.reduce((n,i)=>safeAdd(n,i.decodedBytes),0)===b.decodedBytes
 && b.decodedBytes<=LIMITS.backupBytes&&new Set(b.items.map(i=>`${i.class}/${i.id}/${i.revision}`)).size===b.items.length
 && b.items.every(i=>i.envelope.tenantId===b.tenantId&&i.envelope.spaceId===b.spaceId
  &&i.envelope.generation===b.generation&&i.envelope.class===i.class&&i.envelope.id===i.id&&i.envelope.revision===i.revision));
export const BackupInventorySchema:Decoder<ReturnType<typeof backupInventory.parse>>={parse(raw){
 // Bound actual encoded payloads before walking/decrypting an archive. Inspect
 // data descriptors only; a supplied decodedBytes total is not a size permit.
 demand(raw!==null&&typeof raw==='object');
 const items=Object.getOwnPropertyDescriptor(raw,'items');demand(items&&Object.hasOwn(items,'value'));
 const values=items.value as unknown;demand(Array.isArray(values));
 const length=Object.getOwnPropertyDescriptor(values,'length')?.value as unknown;
 demand(typeof length==='number'&&Number.isSafeInteger(length)&&length<=LIMITS.files);
 let total=0;
 for(let n=0;n<length;n++){
  const item=Object.getOwnPropertyDescriptor(values,String(n));demand(item&&Object.hasOwn(item,'value'));
  demand(item.value!==null&&typeof item.value==='object');
  const env=Object.getOwnPropertyDescriptor(item.value,'envelope');demand(env&&Object.hasOwn(env,'value'));
  demand(env.value!==null&&typeof env.value==='object');
  const cipher=Object.getOwnPropertyDescriptor(env.value,'ciphertext');demand(cipher&&Object.hasOwn(cipher,'value')&&typeof cipher.value==='string');
  const size=cipher.value.length/4*3-(cipher.value.endsWith('==')?2:cipher.value.endsWith('=')?1:0);
  demand(Number.isSafeInteger(size)&&size>=0);total=safeAdd(total,size);demand(total<=LIMITS.backupBytes);
 }
 return backupInventory.parse(raw);
}};
export const BackupCommandSchema = object({...command,action:literal('backup')});
export const RestoreCommandSchema = object({...command,action:literal('restore'),backupId:uuid});
export const RestoreStatusCommandSchema = object({schemaVersion:version,sessionId:uuid,operationId:uuid});
export const RestoreStateSchema = enumeration('staged','validating','reconciling-current','ready',
 'blocked-authority','blocked-integrity','blocked-freshness');
export const RestoreResultSchema = refined(object({schemaVersion:version,operationId:uuid,backupId:uuid,
 generation:uuid,state:RestoreStateSchema,serving:boolean,restrictionEpoch:nullable(positive),
 lastSuccessfulCheckpoint:nullable(timestamp),unavailableEntityIds:list(uuid,LIMITS.nodes),
 preserved:list(enumeration('confirmed-content','current-authority','original-receipts'),3),
 notExecuted:list(enumeration('external-effects','credentials','approvals','unsent-drafts','methods'),5),
 nextAction:enumeration('resume-original-operation','inspect-current-authority','repair-owned-inventory','read-eligible-content')}),r=>
 !r.serving||(r.state==='ready'&&r.restrictionEpoch!==null));

/** Validate closed caller schema then its serialized size. Parsed values are never authority. */
export function parseCommand<T>(schema:Decoder<T>,raw:unknown):T {
 const parsed=schema.parse(raw);demand(Buffer.byteLength(JSON.stringify(parsed),'utf8')<=LIMITS.commandBytes);return parsed;
}
