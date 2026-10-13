import { createHash } from 'node:crypto';
import { CapturedInventorySchema,type CapturedInventory } from './backup-capture.js';
import { BindingSchema,KnowledgeSchema,SourcePayloadSchema,FileManifestSchema,AskPayloadSchema } from './schema.js';
import { stagedHeadWitness } from './staging-preparation.js';
import { LIMITS } from './arithmetic.js';
import { demand } from './errors.js';
export const restoreHash=(b:Buffer|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
export const restoreSame=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export type RestoreItem=CapturedInventory['items'][number];
const contentClasses=['source','knowledge','artifact','summary','index','cache','ask'];
/** Closed archive data, never SQL, control records, path directives or key material.
 * Check immutable composite links before any filesystem mutation. Binary artifact
 * content can contain SQL text; it is opaque data and has no execution route. */
export function validateRestoreInventory(raw:unknown):CapturedInventory{
 const i=CapturedInventorySchema.parse(raw);demand(Buffer.byteLength(JSON.stringify(i))<=LIMITS.backupBytes,'INTEGRITY_FAILED');
 for(const item of i.items){
  const b=item.binding;demand(contentClasses.includes(b.class)&&item.acceptedAt<=i.capturedAt&&item.expiresAt>i.capturedAt,'INTEGRITY_FAILED');
  demand(b.class==='artifact'?item.manifest!==null:item.manifest===null&&item.source===null&&item.logical===null&&item.members.length===0,'INTEGRITY_FAILED');
  if(item.manifest)demand(restoreSame(BindingSchema.parse({...b}),BindingSchema.parse({schemaVersion:item.manifest.schemaVersion,tenantId:item.manifest.tenantId,spaceId:item.manifest.spaceId,class:item.manifest.class,id:item.manifest.id,revision:item.manifest.revision,generation:item.manifest.generation,keyId:item.manifest.keyId})),'INTEGRITY_FAILED');
  if(item.source)demand(i.items.some(p=>p.binding.class==='source'&&p.binding.id===item.source!.id&&p.binding.revision===item.source!.revision&&p.witness===item.source!.witness),'INTEGRITY_FAILED');
  demand(item.logical?.kind==='checkpoint'||item.members.length===0,'INTEGRITY_FAILED');
  demand(new Set(item.members.map(m=>m.id)).size===item.members.length,'INTEGRITY_FAILED');
  for(const m of item.members)demand(i.items.some(p=>p.binding.class==='artifact'&&p.binding.id===m.artifactId&&p.witness===m.witness&&p.logical?.kind==='live-file'&&p.logical.id===m.id&&p.logical.revision===m.revision),'INTEGRITY_FAILED');
 }
 demand(new Set(i.items.filter(p=>p.logical).map(p=>JSON.stringify(p.logical))).size===i.items.filter(p=>p.logical).length,'INTEGRITY_FAILED');
 return i;
}
/** Plain payload validation uses the original AAD binding. Descriptive provenance
 * stays historical and cannot mint a source, approval, credential or native run. */
export function validateRestorePayload(i:CapturedInventory,item:RestoreItem,bytes:Buffer,manifest:Buffer|null){
 const b=item.binding;
 if(['source','knowledge','summary','index','cache'].includes(b.class))demand(restoreHash(JSON.stringify(item.envelope))===item.witness,'INTEGRITY_FAILED');
 if(b.class==='source'){const p=SourcePayloadSchema.parse(JSON.parse(bytes.toString()));demand(restoreHash(p.narrative)===p.contentDigest,'INTEGRITY_FAILED');}
 if(b.class==='knowledge'){
  const k=KnowledgeSchema.parse(JSON.parse(bytes.toString()));demand(k.tenantId===b.tenantId&&k.spaceId===b.spaceId&&k.id===b.id&&k.revision===b.revision&&k.expiresAt===item.expiresAt,'INTEGRITY_FAILED');
  demand(i.items.some(p=>p.binding.class==='source'&&p.binding.id===k.source.sourceId&&p.binding.revision===k.source.revision&&p.sourceTaskId===k.source.sourceTaskId),'INTEGRITY_FAILED');
 }
 if(b.class==='ask'){const p=AskPayloadSchema.parse(JSON.parse(bytes.toString()));demand(p.manifest.tenantId===b.tenantId&&p.manifest.spaceId===b.spaceId,'INTEGRITY_FAILED');
  for(const ref of p.manifest.selected){const k=i.items.find(p=>p.binding.class==='knowledge'&&p.binding.id===ref.knowledgeId&&p.binding.revision===ref.knowledgeRevision),source=i.items.find(p=>p.binding.class==='source'&&p.binding.id===ref.source.sourceId&&p.binding.revision===ref.source.revision&&p.sourceTaskId===ref.source.sourceTaskId);demand(k&&source,'INTEGRITY_FAILED');if('knowledgeWitness' in ref)demand(k.witness===ref.knowledgeWitness&&source.witness===ref.sourceWitness,'INTEGRITY_FAILED');}
 }

 if(b.class==='artifact'){
  demand(manifest,'INTEGRITY_FAILED');const wrapper=RestoreCipherManifestSchema.parse(JSON.parse(manifest.toString())),original=Buffer.from(JSON.stringify(item.envelope)),originalManifest=Buffer.from(JSON.stringify(item.manifest));
  demand(restoreSame(wrapper.binding,b)&&wrapper.objectDigest===restoreHash(original)&&wrapper.objectSize===original.length&&stagedHeadWitness({schemaVersion:1,objectDigest:restoreHash(original),manifestDigest:restoreHash(originalManifest),objectSize:original.length,manifestSize:originalManifest.length})===item.witness,'INTEGRITY_FAILED');
  const m=FileManifestSchema.parse(JSON.parse(wrapper.description));
  demand(m.tenantId===b.tenantId&&m.spaceId===b.spaceId&&m.id===b.id&&m.revision===b.revision&&m.generation===b.generation&&m.entry.id===b.id&&m.entry.revision===b.revision&&m.entry.byteLength===bytes.length&&m.entry.contentDigest===restoreHash(bytes),'INTEGRITY_FAILED');
  demand((m.source===null)===(item.source===null),'INTEGRITY_FAILED');
  if(m.source)demand(m.source.tenantId===b.tenantId&&m.source.spaceId===b.spaceId&&m.source.sourceId===item.source!.id&&m.source.revision===item.source!.revision,'INTEGRITY_FAILED');
  if(item.logical)validatePackedVolume(i,item,bytes);
 }
}

import { LiveWriteCommandSchema,DraftCommandSchema,CheckpointCommandSchema,PromoteCommandSchema,SourceRefSchema } from './schema.js';
import { TaskCallBindingSchema } from '../../g1-model/src/schema.js';
import { object,enumeration,uuid,positive,revision,timestamp,version,digest,list,tagged,nullable,body,literal } from './decoder.js';
const VolumeCommandSchema=tagged('action',{'live-write':LiveWriteCommandSchema,draft:DraftCommandSchema,checkpoint:CheckpointCommandSchema,promote:PromoteCommandSchema});
type VolumeCommand=ReturnType<typeof VolumeCommandSchema.parse>;
const EntrySchema=object({id:uuid,revision:positive,artifactId:uuid,witness:digest,byteLength:revision,contentDigest:digest,expiresAt:timestamp});
const envelopeFields={schemaVersion:version,tenantId:uuid,spaceId:uuid,actorId:uuid,
 taskId:uuid,runId:uuid,workerGeneration:revision,files:list(EntrySchema,LIMITS.files)};
const OriginalEnvelopeSchema=object({schemaVersion:version,tenantId:uuid,spaceId:uuid,actorId:uuid,command:tagged('action',{'live-write':LiveWriteCommandSchema,draft:DraftCommandSchema,checkpoint:CheckpointCommandSchema}),taskId:uuid,runId:uuid,workerGeneration:revision,files:list(EntrySchema,LIMITS.files)});
const PromotionEnvelopeSchema=object({...envelopeFields,command:PromoteCommandSchema,promotion:object({draft:EntrySchema,base:EntrySchema,
 content:DraftCommandSchema,source:nullable(SourceRefSchema),native:TaskCallBindingSchema,runtime:nullable(object({id:uuid,generation:revision}))})});
type Envelope=ReturnType<typeof OriginalEnvelopeSchema.parse>|ReturnType<typeof PromotionEnvelopeSchema.parse>;
const EnvelopeSchema={parse(raw:unknown):Envelope{const c=(raw as {command?:{action?:unknown}})?.command;return c?.action==='promote'?PromotionEnvelopeSchema.parse(raw):OriginalEnvelopeSchema.parse(raw);}};
const promoted=(e:Envelope):e is ReturnType<typeof PromotionEnvelopeSchema.parse>=>'promotion' in e;

function validatePackedVolume(i:CapturedInventory,item:RestoreItem,bytes:Buffer){
 demand(bytes.length>=4,'INTEGRITY_FAILED');const n=bytes.readUInt32BE(0);demand(n<=LIMITS.commandBytes&&n+4<=bytes.length,'INTEGRITY_FAILED');
 const e=EnvelopeSchema.parse(JSON.parse(bytes.subarray(4,4+n).toString())),c=e.command,l=item.logical!;
 demand(e.tenantId===item.binding.tenantId&&e.spaceId===item.binding.spaceId&&e.taskId===item.sourceTaskId&&c.targetId===l.id&&c.expectedRevision+1===l.revision
  &&(c.action==='live-write'||c.action==='promote'?'live-file':c.action)===l.kind,'INTEGRITY_FAILED');
 if(c.action==='checkpoint'){
  demand(bytes.length===n+4&&e.files.length===item.members.length&&restoreSame([...c.liveIds].sort(),item.members.map(m=>m.id).sort()),'INTEGRITY_FAILED');
  for(const f of e.files)demand(item.members.some(m=>m.id===f.id&&m.revision===f.revision&&m.artifactId===f.artifactId&&m.witness===f.witness)
   &&i.items.some(p=>p.binding.id===f.artifactId&&p.expiresAt===f.expiresAt),'INTEGRITY_FAILED');
 }else demand(e.files.length===0&&(promoted(e)?e.promotion.content.bytes:(e.command as Exclude<VolumeCommand,{action:'checkpoint'|'promote'}>).bytes)==='','INTEGRITY_FAILED');
}

export const RestoreCipherManifestSchema=object({schemaVersion:literal(1),binding:BindingSchema,objectDigest:digest,objectSize:revision,description:body});
