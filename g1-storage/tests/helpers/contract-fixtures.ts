import * as S from '../../src/schema.js';
import type { Decoder } from '../../src/decoder.js';
export const id=(n=1)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const sha='sha256:'+'a'.repeat(64);
export const at='2026-10-08T00:00:00.000Z',expires='2026-10-09T00:00:00.000Z';
export const audience={destinationSpaceId:id(2),recipientActorIds:[id(3)],revisionDigest:sha};
export const source={tenantId:id(1),spaceId:id(2),sourceId:id(4),sourceTaskId:id(5),revision:1,digest:sha,audience};
export const verification={method:'registered-source-check',checkId:id(6),checkedAt:at};
export const assertion={subject:'decision',value:'synthetic value',sourceId:id(4),sourceRevision:1,
 validFrom:at,validUntil:null,expiresAt:expires,classification:'personal',intent:'assert',checkId:null};
export const base={schemaVersion:1,sessionId:id(7),targetId:id(8),key:id(9),expectedRevision:0,expiresAt:expires};
export const binding={schemaVersion:1,tenantId:id(1),spaceId:id(2),class:'knowledge',id:id(8),revision:1,generation:id(10),keyId:id(11)};
export const envelope={...binding,algorithm:'AES-256-GCM',nonce:Buffer.alloc(12,1).toString('base64'),
 tag:Buffer.alloc(16,2).toString('base64'),ciphertext:Buffer.from('crypt').toString('base64')};
export const selected={knowledgeId:id(8),knowledgeRevision:1,source,inclusionReason:'exact-id'};
export const manifest={schemaVersion:1,tenantId:id(1),spaceId:id(2),audience,policyRevision:1,
 membershipRevision:1,restrictionEpoch:1,storageGeneration:id(10),profile:'local-extractive-v1',
 indexWatermark:1,selected:[selected],limitations:[]};
export const file={id:id(12),revision:1,objectId:id(13),byteLength:5,contentDigest:sha};
export const knowledge={schemaVersion:1,tenantId:id(1),spaceId:id(2),id:id(8),revision:1,
 subject:'decision',value:'synthetic value',source,assertedBy:id(3),recordedAt:at,validFrom:at,
 validUntil:null,expiresAt:expires,classification:'personal',status:'user-asserted',verification:null,supersedes:null};
export const restore={schemaVersion:1,operationId:id(15),backupId:id(16),generation:id(17),
 state:'ready',serving:true,restrictionEpoch:1,lastSuccessfulCheckpoint:at,unavailableEntityIds:[],
 preserved:['confirmed-content','current-authority','original-receipts'],
 notExecuted:['external-effects','credentials','approvals','unsent-drafts','methods'],nextAction:'read-eligible-content'};
export const ask={schemaVersion:1,sessionId:id(7),key:id(9),expectedRevision:0,expiresAt:expires,
 question:'What is the saved decision?',selector:{kind:'id',value:id(8)},attachmentIds:[]};
export const backupItem={class:'knowledge',id:id(8),revision:1,envelope,objectId:null,decodedBytes:5};
export const backup={schemaVersion:1,tenantId:id(1),spaceId:id(2),backupId:id(16),generation:id(10),
 capturedEpoch:1,confirmedAt:at,expiresAt:expires,lastSuccessfulCheckpoint:at,items:[backupItem],decodedBytes:5};
export function examples():readonly [string,Decoder<unknown>,unknown][]{return [
 ['ContentClassSchema',S.ContentClassSchema,'source'],['KnowledgeStatusSchema',S.KnowledgeStatusSchema,'proposed'],
 ['ScopeSchema',S.ScopeSchema,{tenantId:id(1),spaceId:id(2)}],['AudienceSchema',S.AudienceSchema,audience],
 ['RevisionRefSchema',S.RevisionRefSchema,{id:id(8),revision:1}],['SourceRefSchema',S.SourceRefSchema,source],
 ['VerificationSchema',S.VerificationSchema,verification],
 ['SourcePayloadSchema',S.SourcePayloadSchema,{schemaVersion:1,title:'synthetic',uri:null,narrative:'body',contentDigest:sha,assertedBy:id(3),recordedAt:at}],
 ['KnowledgeSchema',S.KnowledgeSchema,knowledge],['QueryControlsSchema',S.QueryControlsSchema,{attachments:true,olderRecall:false,saveReusable:true}],
 ['AssertionSchema',S.AssertionSchema,assertion],['SaveCommandSchema',S.SaveCommandSchema,{...base,action:'save',assertion}],
 ['CorrectCommandSchema',S.CorrectCommandSchema,{...base,expectedRevision:1,action:'correct',assertion}],
 ['ForgetCommandSchema',S.ForgetCommandSchema,{...base,expectedRevision:1,action:'forget'}],
 ['SourceCommandSchema',S.SourceCommandSchema,{...base,action:'source',title:'source',uri:null,narrative:'body',contentDigest:sha,retentionExpiresAt:expires,saveReusable:true}],
 ['LookupCommandSchema',S.LookupCommandSchema,{schemaVersion:1,sessionId:id(7),key:id(9),bindingDigest:sha}],
 ['InspectCommandSchema',S.InspectCommandSchema,{schemaVersion:1,sessionId:id(7),targetId:id(8),history:true}],
 ['SelectorSchema',S.SelectorSchema,ask.selector],['AskCommandSchema',S.AskCommandSchema,ask],
 ['QueryControlsCommandSchema',S.QueryControlsCommandSchema,{...base,action:'query-controls',controls:{attachments:true,olderRecall:true,saveReusable:false}}],
 ['BindingSchema',S.BindingSchema,binding],['CipherEnvelopeSchema',S.CipherEnvelopeSchema,envelope],
 ['FileEntrySchema',S.FileEntrySchema,file],['FileManifestSchema',S.FileManifestSchema,{schemaVersion:1,tenantId:id(1),spaceId:id(2),id:id(12),revision:1,generation:id(10),filename:'a',logicalPath:'a',entry:file,source:null,base:null,validationId:id(6)}],
 ['DraftCommandSchema',S.DraftCommandSchema,{...base,action:'draft',baseRevision:0,filename:'a',logicalPath:'a',bytes:'YQ==',sourceId:null}],
 ['LiveWriteCommandSchema',S.LiveWriteCommandSchema,{...base,action:'live-write',filename:'a',logicalPath:'a',bytes:'YQ=='}],
 ['PromoteCommandSchema',S.PromoteCommandSchema,{...base,expectedRevision:1,action:'promote',draftId:id(12),draftRevision:1,validationId:id(6)}],
 ['ArtifactCommandSchema',S.ArtifactCommandSchema,{...base,action:'artifact',filename:'a',bytes:'YQ==',sourceId:null,validationId:id(6)}],
 ['CheckpointCommandSchema',S.CheckpointCommandSchema,{...base,action:'checkpoint',liveIds:[id(12)]}],
 ['CheckpointManifestSchema',S.CheckpointManifestSchema,{schemaVersion:1,tenantId:id(1),spaceId:id(2),id:id(14),revision:1,generation:id(10),confirmedAt:at,files:[file]}],
 ['SelectedRecordSchema',S.SelectedRecordSchema,selected],['RetrievalManifestSchema',S.RetrievalManifestSchema,manifest],
 ['AskPayloadSchema',S.AskPayloadSchema,{schemaVersion:1,question:'question',answer:'answer',manifest}],
 ['DerivedPayloadSchema',S.DerivedPayloadSchema,{schemaVersion:1,kind:'summary',title:'title',body:'summary',watermark:1,manifest}],
 ['DependencyNodeSchema',S.DependencyNodeSchema,{id:id(8),revision:1,ancestors:[]}],
 ['DependencyGraphSchema',S.DependencyGraphSchema,[{id:id(8),revision:1,ancestors:[]}]],
 ['EventSchema',S.EventSchema,{schemaVersion:1,tenantId:id(1),spaceId:id(2),eventId:id(18),commandKey:id(9),mutationId:id(19),jobId:null,targetId:id(8),revision:1,epoch:1,at,kind:'knowledge-committed'}],
 ['CommandSchema',S.CommandSchema,{...base,action:'save',assertion}],
 ['SaveResultSchema',S.SaveResultSchema,{schemaVersion:1,status:'saved-here',receiptId:id(20),id:id(8),revision:1}],
 ['FailureResultSchema',S.FailureResultSchema,{schemaVersion:1,status:'not-saved',error:'UNAUTHORIZED',replayAllowed:false,nextAction:'inspect-current-authority'}],
 ['QualificationObservationSchema',S.QualificationObservationSchema,{schemaVersion:1,measurement:'storage-observations',suite:'authority',
 positives:{save:0,ask:0,forget:0,restore:0,read:1,write:0,deny:1,conflict:0,propagate:0,backup:0,owner:0,harness:0},
 violations:{unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0}}],
 ['ForgetResultSchema',S.ForgetResultSchema,{schemaVersion:1,status:'tombstoned',receiptId:id(20),affectedActive:1,affectedDerived:2,pendingJobs:2,externalCopies:'not-recalled',backupErasure:'subject-to-retention',retentionRestrictions:[],nextAction:'inspect-propagation'}],
 ['FileResultSchema',S.FileResultSchema,{schemaVersion:1,status:'draft-saved',receiptId:id(20),id:id(12),revision:1,lastSuccessfulCheckpoint:null,unsavedEditorWork:'not-covered'}],
 ['AskResultSchema',S.AskResultSchema,{schemaVersion:1,status:'answered',receiptId:id(20),answer:'answer',manifest,profile:'local-extractive-v1',computerStarted:false,nextAction:'inspect-sources'}],
 ['BackupItemSchema',S.BackupItemSchema,backupItem],['BackupInventorySchema',S.BackupInventorySchema,backup],
 ['BackupCommandSchema',S.BackupCommandSchema,{...base,action:'backup'}],
 ['RestoreCommandSchema',S.RestoreCommandSchema,{...base,action:'restore',backupId:id(16)}],
 ['RestoreStatusCommandSchema',S.RestoreStatusCommandSchema,{schemaVersion:1,sessionId:id(7),operationId:id(15)}],
 ['RestoreStateSchema',S.RestoreStateSchema,'staged'],['RestoreResultSchema',S.RestoreResultSchema,restore]
 ];}
