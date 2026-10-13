import { createHash } from 'node:crypto';
import { object,uuid,timestamp,literal,positive,digest } from './decoder.js';
import { BindingSchema,CipherEnvelopeSchema,SourcePayloadSchema } from './schema.js';
import { HeadMaterialSchema,type HeadMaterial } from './head-material.js';
import type { HeadPublicationPrerequisite } from './head-publication.js';
import type { AsyncUnitOfWork,SqlTransaction,VerifiedScope } from './owners.js';
import { StorageAuthorityRepository } from './authority.js';
import { CryptoStore } from './crypto-store.js';
import { LIMITS } from './arithmetic.js';
import { demand,StorageError } from './errors.js';

const OriginalSchema=object({key:uuid,sessionId:uuid,expiresAt:timestamp});
export const SourceContentMaterialSchema=object({head:HeadMaterialSchema,envelope:CipherEnvelopeSchema,original:OriginalSchema});
export type SourceContentMaterial=ReturnType<typeof SourceContentMaterialSchema.parse>;
export type SourcePayload=ReturnType<typeof SourcePayloadSchema.parse>;
export const SourceContentRefSchema=object({class:literal('source'),id:uuid,revision:positive,witness:digest});
export interface SourceContentOwner {
 resolve(tx:SqlTransaction,scope:VerifiedScope,materialId:string):Promise<SourceContentMaterial|undefined>;
 /** Installed secret/retention admission. Payloads never confer check, control,
  * method or policy authority. No permissive default or caller policy fields. */
 admit(tx:SqlTransaction,scope:VerifiedScope,payload:SourcePayload):Promise<void>;
}
export function sourceContentWitness(raw:unknown):string{
 return 'sha256:'+createHash('sha256').update(JSON.stringify(CipherEnvelopeSchema.parse(raw))).digest('hex');
}
/** Installed content owner preparation only: no authority, COMMIT or Saved here
 * acknowledgment. Head material/key/generation/origin come from that owner. */
export async function sealSourceContent(crypto:CryptoStore,rawBinding:unknown,rawPayload:unknown,
 rawControls:{sourceTaskId:string;expiresAt:string;original:unknown}):Promise<SourceContentMaterial>{
 const b=BindingSchema.parse(rawBinding),payload=SourcePayloadSchema.parse(rawPayload);
 demand(b.class==='source');const original=OriginalSchema.parse(rawControls.original);
 const bytes=Buffer.from(JSON.stringify(payload));
 try{
  demand(bytes.length<=LIMITS.commandBytes);
  const envelope=await crypto.seal(b,bytes);
  return SourceContentMaterialSchema.parse({head:{tenantId:b.tenantId,spaceId:b.spaceId,class:b.class,
   id:b.id,revision:b.revision,keyId:b.keyId,generation:b.generation,witness:sourceContentWitness(envelope),
   sourceTaskId:rawControls.sourceTaskId,expiresAt:rawControls.expiresAt},envelope,original});
 }finally{bytes.fill(0);}
}
/** Internal cipher decoder; the caller must establish current source authority
 * before opening bytes. This function itself confers no read authorization. */
export async function openSourcePayload(crypto:CryptoStore,e:SourceContentMaterial['envelope']):Promise<SourcePayload>{
 const b=BindingSchema.parse({schemaVersion:e.schemaVersion,tenantId:e.tenantId,spaceId:e.spaceId,
  class:e.class,id:e.id,revision:e.revision,generation:e.generation,keyId:e.keyId});
 const bytes=await crypto.open(b,e);
 try{demand(bytes.length<=LIMITS.commandBytes,'INTEGRITY_FAILED');
  try{return SourcePayloadSchema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new StorageError('INTEGRITY_FAILED');}
 }finally{bytes.fill(0);}
}
/** Borrowed installed head prerequisite; encrypted provenance is written inside
 * the SAME authenticated transaction as immutable head/epoch publication. */
export class SourceContentPrerequisite implements HeadPublicationPrerequisite {
 constructor(readonly crypto:CryptoStore,readonly owner:SourceContentOwner,
  readonly hooks:{afterInsert?(tx:SqlTransaction):Promise<void>}={}){}
 async #resolve(tx:SqlTransaction,scope:VerifiedScope,id:string){
  try{const raw=await this.owner.resolve(tx,scope,id);demand(raw,'CONTENT_UNAVAILABLE');return SourceContentMaterialSchema.parse(raw);}
  catch(e){if(e instanceof StorageError)throw e;throw new StorageError('CONTENT_UNAVAILABLE');}
 }
 async prepare(tx:SqlTransaction,scope:VerifiedScope,command:Parameters<HeadPublicationPrerequisite['prepare']>[2],head:HeadMaterial){
  const material=await this.#resolve(tx,scope,command.materialId);
  demand(JSON.stringify(material.head)===JSON.stringify(head),'CHECK_BINDING_MISMATCH');
  demand(JSON.stringify(material.original)===JSON.stringify(OriginalSchema.parse({key:command.key,sessionId:command.sessionId,expiresAt:command.expiresAt})),'CHECK_BINDING_MISMATCH');
  const e=material.envelope;
  demand(head.class==='source'&&e.class==='source'&&e.tenantId===scope.tenantId&&e.spaceId===scope.spaceId
   &&e.id===head.id&&e.revision===head.revision&&e.generation===head.generation&&e.keyId===head.keyId
   &&head.witness===sourceContentWitness(e),'CHECK_BINDING_MISMATCH');
  const validate=async()=>{
   demand(JSON.stringify(await this.#resolve(tx,scope,command.materialId))===JSON.stringify(material),'CHECK_BINDING_MISMATCH');
   const p=await openSourcePayload(this.crypto,material.envelope);
   demand(p.assertedBy===scope.actorId,'UNAUTHORIZED');
   demand((await tx.query('SELECT $1::timestamptz<=clock_timestamp() AS valid',[p.recordedAt])).rows[0]?.['valid']===true,'INVALID_SCHEMA');
   await this.owner.admit(tx,scope,p);
   demand(JSON.stringify(await this.#resolve(tx,scope,command.materialId))===JSON.stringify(material),'CHECK_BINDING_MISMATCH');
  };
  await validate();
  return async()=>{
   await validate();
   const encoded=JSON.stringify(e);
   await tx.query('SELECT fabric.storage_publish_source_content($1,$2)',[command.key,encoded]);
   await this.hooks.afterInsert?.(tx);
   const stored=(await tx.query('SELECT cipher_text,witness FROM fabric.storage_sources WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,head.id,head.revision])).rows[0];
   demand(stored?.['cipher_text']===encoded&&stored['witness']===head.witness,'INTEGRITY_FAILED');
   await validate();
  };
 }
}
/** Current same-Space source content only. Sharing and historical content
 * inspection require their own declared dependency/audience path. */
export class SourceContentRepository {
 constructor(readonly uow:AsyncUnitOfWork,readonly authority:StorageAuthorityRepository,readonly crypto:CryptoStore){}
 async read(scope:VerifiedScope,raw:unknown):Promise<SourcePayload>{
  const ref=SourceContentRefSchema.parse(raw);
  return this.uow.withScope(scope,async tx=>{
   const head=await this.authority.entity(tx,scope,ref);
   const row=(await tx.query('SELECT cipher_text,actor_id FROM fabric.storage_sources WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,ref.id,ref.revision])).rows[0];
   demand(row&&typeof row['cipher_text']==='string','CONTENT_UNAVAILABLE');
   let envelope;
   try{envelope=CipherEnvelopeSchema.parse(JSON.parse(row['cipher_text']));}catch{throw new StorageError('INTEGRITY_FAILED');}
   demand(sourceContentWitness(envelope)===ref.witness,'INTEGRITY_FAILED');
   // Bind to independently accepted controls, never self-described envelope.
   demand(envelope.tenantId===scope.tenantId&&envelope.spaceId===scope.spaceId&&envelope.class==='source'
    &&envelope.id===ref.id&&envelope.revision===ref.revision&&envelope.keyId===head['key_id']
    &&envelope.generation===head['generation'],'INTEGRITY_FAILED');
   const result=await openSourcePayload(this.crypto,envelope);
   demand(result.assertedBy===row['actor_id'],'INTEGRITY_FAILED');
   await this.authority.entity(tx,scope,ref);
   demand((await tx.query('SELECT cipher_text FROM fabric.storage_sources WHERE tenant_id=$1 AND space_id=$2 AND source_id=$3 AND revision=$4',[scope.tenantId,scope.spaceId,ref.id,ref.revision])).rows[0]?.['cipher_text']===row['cipher_text'],'INTEGRITY_FAILED');
   await this.authority.entity(tx,scope,ref);
   return result;
  });
 }
}
