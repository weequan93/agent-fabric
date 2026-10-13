import { constants } from 'node:fs';
import { lstat,readFile,readdir,realpath,mkdir,open,link,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,digest,positive,nullable,timestamp,literal,type Decoder } from './decoder.js';
import { demand,StorageError } from './errors.js';
import { ContentClassSchema } from './schema.js';
import { ShareMaterialSchema } from './share-material.js';
import { HeadMaterialSchema } from './head-material.js';
import { assertPolicyReduction } from './policy-reduction.js';
import { StoragePolicySchema,EpochAnchorSchema,type EpochAnchor,type EpochAnchorResolver } from './authority.js';
const RefreshPendingSchema=object({actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema});
const PolicyPendingSchema=object({schemaVersion:literal(2),kind:literal('policy-reduction'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,previousPolicy:StoragePolicySchema,nextPolicy:StoragePolicySchema});
export const SourceRefSchema=object({id:uuid,revision:positive,witness:digest});
const SourcePendingSchema=object({schemaVersion:literal(3),kind:literal('source-revocation'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,source:SourceRefSchema,at:timestamp});
export const EntityRefSchema=object({class:ContentClassSchema,id:uuid,revision:positive,witness:digest});
const TombstonePendingSchema=object({schemaVersion:literal(4),kind:literal('tombstone'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,entity:EntityRefSchema,at:timestamp});
const ForgetWorkPendingSchema=object({schemaVersion:literal(5),kind:literal('forget-work'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,entity:EntityRefSchema,at:timestamp,receiptId:uuid,jobId:uuid});
const HeadPendingSchema=object({schemaVersion:literal(6),kind:literal('head-publication'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,materialId:uuid,material:HeadMaterialSchema,expected:nullable(EntityRefSchema),at:timestamp});
const SharePendingSchema=object({schemaVersion:literal(7),kind:literal('share-publication'),actorId:uuid,key:uuid,binding:digest,sessionId:uuid,expiresAt:timestamp,previous:EpochAnchorSchema,next:EpochAnchorSchema,materialId:uuid,material:ShareMaterialSchema,sourceTaskId:uuid,sourceAnchor:EpochAnchorSchema});
const PendingSchema:Decoder<ReturnType<typeof RefreshPendingSchema.parse>|ReturnType<typeof PolicyPendingSchema.parse>|ReturnType<typeof SourcePendingSchema.parse>|ReturnType<typeof TombstonePendingSchema.parse>|ReturnType<typeof ForgetWorkPendingSchema.parse>|ReturnType<typeof HeadPendingSchema.parse>|ReturnType<typeof SharePendingSchema.parse>>={parse(raw){
 const tagged=raw!==null&&typeof raw==='object'&&Object.hasOwn(raw,'schemaVersion');
 if(!tagged)return RefreshPendingSchema.parse(raw);
 const version=Object.getOwnPropertyDescriptor(raw,'schemaVersion');
 demand(version&&Object.hasOwn(version,'value'),'INVALID_SCHEMA');
 return version.value===7?SharePendingSchema.parse(raw):version.value===6?HeadPendingSchema.parse(raw):version.value===5?ForgetWorkPendingSchema.parse(raw):version.value===4?TombstonePendingSchema.parse(raw):version.value===3?SourcePendingSchema.parse(raw):PolicyPendingSchema.parse(raw);
}};
export type PendingEpoch=ReturnType<typeof PendingSchema.parse>;
function validateTransition(pending:PendingEpoch){
 if('schemaVersion' in pending&&pending.schemaVersion===6){
  const {material:m,expected:e}=pending;
  demand(m.revision===(e?e.revision+1:1)&&(!e||(e.class===m.class&&e.id===m.id))&&m.expiresAt>pending.at,'INVALID_SCHEMA');
 }
 demand(pending.next.epoch===pending.previous.epoch+1&&pending.next.anchorId!==pending.previous.anchorId,'INVALID_SCHEMA');
 if('schemaVersion' in pending&&(pending.schemaVersion===3||pending.schemaVersion===4||pending.schemaVersion===5||pending.schemaVersion===6||pending.schemaVersion===7)){
  demand(pending.next.policyRevision===pending.previous.policyRevision&&pending.next.controlDigest!==pending.previous.controlDigest,'INVALID_SCHEMA');
 }else if('schemaVersion' in pending){
  assertPolicyReduction(pending.previousPolicy,pending.nextPolicy);
  demand(pending.next.policyRevision>pending.previous.policyRevision&&pending.next.controlDigest!==pending.previous.controlDigest,'INVALID_SCHEMA');
 }else demand(pending.next.policyRevision===pending.previous.policyRevision&&pending.next.controlDigest===pending.previous.controlDigest,'INVALID_SCHEMA');
}
const StateSchema=object({sequence:positive,previousDigest:nullable(digest),anchor:EpochAnchorSchema,pending:nullable(PendingSchema)});
export type EpochJournalState=ReturnType<typeof StateSchema.parse>;
export interface EpochJournalHooks {afterReservationRead?():Promise<void>}
export interface OwnedAnchorRoot {readonly path:string;readonly owner:string;readonly instance:string;readonly rootId:string;readonly device:number;readonly inode:number}
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Installed independent control capability. Immutable fsynced hash-chain events
 * use hard-link CAS, so recreated owners need no crash-prone process lock.
 * Bounded local journal, not a remote KMS/whole-host disaster-recovery anchor.
 * Root identity comes from trusted installation, never requests or archives. */
export class EpochWitnessJournal implements EpochAnchorResolver {
 private readonly root:OwnedAnchorRoot;
 constructor(root:OwnedAnchorRoot,private readonly hooks:EpochJournalHooks={}){this.root=Object.freeze({...root});}
 private async directory(tenantId:string,spaceId:string){
  uuid.parse(tenantId);uuid.parse(spaceId);
  const r=this.root,s=await lstat(r.path);
  demand(s.isDirectory()&&!s.isSymbolicLink()&&s.dev===r.device&&s.ino===r.inode&&await realpath(r.path)===r.path,'CLEANUP_UNPROVEN');
  const marker=resolve(r.path,'.storage-owner.json'),m=await lstat(marker);
  demand(m.isFile()&&!m.isSymbolicLink()&&m.size<=1024,'CLEANUP_UNPROVEN');
  demand(same(JSON.parse(await readFile(marker,'utf8')),{owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'CLEANUP_UNPROVEN');
  let path=r.path;
  for(const id of [tenantId,spaceId]){
   const next=resolve(path,id);try{await mkdir(next,{mode:0o700});await this.syncDirectory(path);}catch(e){if((e as {code?:string}).code!=='EEXIST')throw e;}
   const st=await lstat(next);demand(st.isDirectory()&&!st.isSymbolicLink(),'CLEANUP_UNPROVEN');path=next;
  }return path;
 }
 private async syncDirectory(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{await f.sync();}finally{await f.close();}}
 private async history(tenantId:string,spaceId:string):Promise<EpochJournalState[]>{
  const path=await this.directory(tenantId,spaceId),all=await readdir(path);
  demand(all.length<=2048&&all.every(n=>/^\d{8}\.json$/.test(n)||/^\.stage-[0-9a-f-]{36}$/.test(n)),'AUTHORITY_UNAVAILABLE');
  const names=all.filter(n=>/^\d{8}\.json$/.test(n)).sort();demand(names.length<=1024,'AUTHORITY_UNAVAILABLE');
  let prior:EpochJournalState|undefined;const entries:EpochJournalState[]=[];
  // Reread every immutable event on every call. Only file I/O overlaps: keep
  // at most four handles/raw events in flight, settle every close on failure,
  // then validate the chain and report failures in the original name order.
  for(let offset=0;offset<names.length;offset+=4){
   const batch=await Promise.allSettled(names.slice(offset,offset+4).map(async(name,index):Promise<unknown>=>{
    demand(name===String(offset+index+1).padStart(8,'0')+'.json','AUTHORITY_UNAVAILABLE');
    const f=await open(resolve(path,name),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=await f.stat();demand(stat.isFile()&&stat.size<=16384,'AUTHORITY_UNAVAILABLE');return JSON.parse(await f.readFile('utf8'));}finally{await f.close();}
   }));
   for(const [index,result] of batch.entries()){
   const i=offset+index;if(result.status==='rejected')throw result.reason;
   const raw=result.value;
   const entry=StateSchema.parse(raw);demand(entry.sequence===i+1&&entry.previousDigest===(prior?hash(prior):null),'AUTHORITY_UNAVAILABLE');
   if(entry.pending&&'schemaVersion' in entry.pending&&entry.pending.schemaVersion===7)demand(entry.pending.material.tenantId===tenantId&&entry.pending.material.destinationSpaceId===spaceId&&entry.pending.material.sourceSpaceId!==spaceId,'AUTHORITY_UNAVAILABLE');
   if(entry.pending&&'schemaVersion' in entry.pending&&entry.pending.schemaVersion===6)demand(entry.pending.material.tenantId===tenantId&&entry.pending.material.spaceId===spaceId,'AUTHORITY_UNAVAILABLE');
   if(!prior)demand(entry.pending===null,'AUTHORITY_UNAVAILABLE');
   else if(prior.pending===null){
    demand(entry.pending!==null&&same(entry.anchor,prior.anchor)&&same(entry.pending.previous,prior.anchor),'AUTHORITY_UNAVAILABLE');validateTransition(entry.pending);
   }else demand(entry.pending===null&&(same(entry.anchor,prior.anchor)||same(entry.anchor,prior.pending.next)),'AUTHORITY_UNAVAILABLE');
   entries.push(entry);prior=entry;
   }
  }return entries;
 }
 async state(tenantId:string,spaceId:string):Promise<EpochJournalState|undefined>{
  return (await this.history(tenantId,spaceId)).at(-1);
 }
 /** Content-free original head transition from the same validated immutable
  * chain as current(). Never infer a committed original from a PG marker alone.
  * A rolled-back attempt may retry; a committed original cannot be reserved
  * again or silently downgraded when its PG protocol records disappear. */
 async headPublication(tenantId:string,spaceId:string,actorId:string,key:string){
  uuid.parse(actorId);uuid.parse(key);
  const entries=await this.history(tenantId,spaceId);
  let outcome:{pending:ReturnType<typeof HeadPendingSchema.parse>;status:'pending'|'committed'|'rolled-back'}|undefined;
  for(const [i,entry] of entries.entries()){
   const p=entry.pending;
   if(!p||!('schemaVersion' in p)||p.schemaVersion!==6||p.actorId!==actorId||p.key!==key)continue;
   demand(outcome?.status!=='committed','AUTHORITY_UNAVAILABLE');
   const next=entries[i+1];
   outcome={pending:p,status:!next?'pending':same(next.anchor,p.next)?'committed':'rolled-back'};
  }
  return outcome;
 }
 async current(tenantId:string,spaceId:string):Promise<EpochAnchor|undefined>{
  const state=await this.state(tenantId,spaceId);return state&&!state.pending?state.anchor:undefined;
 }
 private async append(tenantId:string,spaceId:string,prior:EpochJournalState|undefined,anchor:EpochAnchor,pending:PendingEpoch|null){
  const state=StateSchema.parse({sequence:(prior?.sequence??0)+1,previousDigest:prior?hash(prior):null,anchor,pending});
  demand(state.sequence<=1024,'AUTHORITY_UNAVAILABLE');
  const path=await this.directory(tenantId,spaceId),temp=resolve(path,'.stage-'+randomUUID()),target=resolve(path,String(state.sequence).padStart(8,'0')+'.json');
  const f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await f.writeFile(JSON.stringify(state));await f.sync();}finally{await f.close();}
  try{await link(temp,target);await this.syncDirectory(path);}catch(e){if((e as {code?:string}).code==='EEXIST')throw new StorageError('STALE_REVISION');throw e;}
  finally{await unlink(temp);await this.syncDirectory(path);}
  return state;
 }
 /** Trusted one-time installation only. Empty/missing journal never auto-enrolls
  * from database snapshots in current() or recovery. */
 async install(tenantId:string,spaceId:string,anchor:EpochAnchor){
  const prior=await this.state(tenantId,spaceId);demand(!prior,'IDEMPOTENCY_CONFLICT');
  return this.append(tenantId,spaceId,undefined,EpochAnchorSchema.parse(anchor),null);
 }
 async reserve(tenantId:string,spaceId:string,raw:PendingEpoch){
  const pending=PendingSchema.parse(raw);
  if('schemaVersion' in pending&&pending.schemaVersion===7)demand(pending.material.tenantId===tenantId&&pending.material.destinationSpaceId===spaceId&&pending.material.sourceSpaceId!==spaceId,'INVALID_SCHEMA');
  if('schemaVersion' in pending&&pending.schemaVersion===6)demand(pending.material.tenantId===tenantId&&pending.material.spaceId===spaceId,'INVALID_SCHEMA');
  const prior=await this.state(tenantId,spaceId);
  demand(prior&&!prior.pending&&same(prior.anchor,pending.previous),'AUTHORITY_UNAVAILABLE');
  await this.hooks.afterReservationRead?.();
  validateTransition(pending);
  return this.append(tenantId,spaceId,prior,prior.anchor,pending);
 }
 /** Installed coordinator calls only after fresh PG observation under the exact
  * Space/original-key barriers. A request cannot choose the recovered anchor. */
 async resolve(tenantId:string,spaceId:string,pending:PendingEpoch,committed:boolean){
  const prior=await this.state(tenantId,spaceId);demand(prior&&same(prior.pending,pending),'AUTHORITY_UNAVAILABLE');
  return this.append(tenantId,spaceId,prior,committed?pending.next:pending.previous,null);
 }
}
