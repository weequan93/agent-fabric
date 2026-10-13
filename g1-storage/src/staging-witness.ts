import { constants } from 'node:fs';
import { open,lstat,realpath,readdir,mkdir,link,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { object,uuid,literal,timestamp,type Decoder } from './decoder.js';
import { BindingSchema } from './schema.js';
import { demand,StorageError } from './errors.js';
import type { OwnedAnchorRoot } from './epoch-journal.js';

export const StagingWitnessSchema=object({schemaVersion:literal(1),actorId:uuid,commandKey:uuid,materialId:uuid,
 uploadId:uuid,rootId:uuid,binding:BindingSchema,sessionId:uuid,sourceTaskId:uuid,expiresAt:timestamp});
export type StagingWitness=ReturnType<typeof StagingWitnessSchema.parse>;
const TerminalTime:Decoder<string>={parse:raw=>{
 demand(typeof raw==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(raw),'AUTHORITY_UNAVAILABLE');
 timestamp.parse(raw.slice(0,23)+'Z');return raw;
}};
const TerminalSchema=object({original:StagingWitnessSchema,at:TerminalTime});
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Installed independent authority root, outside content/backup roots. Immutable
 * enrollment, abandonment intent and settled terminal files survive PG rollback.
 * Never install/enroll from a restored PG snapshot. Calls require the owner's
 * Space/original locks. Trusted local directory custody remains required; loss
 * or rollback of this root is not qualified disaster recovery. No keys/content. */
export class StagingWitnessJournal {
 readonly #root:OwnedAnchorRoot;
 constructor(root:OwnedAnchorRoot,readonly hooks:{afterEnrollmentRead?():Promise<void>}={}){this.#root=Object.freeze({...root});}
 async #read<T>(path:string,schema:Decoder<T>):Promise<T|undefined>{
  let f;
  try{f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
  catch(e){if((e as {code?:string}).code==='ENOENT')return undefined;throw e;}
  try{
   const before=await f.stat();demand(before.isFile()&&before.nlink===1&&before.size<=4096,'AUTHORITY_UNAVAILABLE');
   const bytes=Buffer.alloc(before.size+1);let size=0;
   while(size<bytes.length){const r=await f.read(bytes,size,bytes.length-size,size);if(!r.bytesRead)break;size+=r.bytesRead;}
   const after=await f.stat();demand(size===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs,'AUTHORITY_UNAVAILABLE');
   return schema.parse(JSON.parse(bytes.subarray(0,size).toString('utf8')));
  }finally{await f.close();}
 }
 async #sync(path:string){const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{demand((await f.stat()).isDirectory(),'AUTHORITY_UNAVAILABLE');await f.sync();}finally{await f.close();}}
 async #directory(actorId:string,commandKey:string,tenantId:string,spaceId:string){
  [actorId,commandKey,tenantId,spaceId].forEach(id=>uuid.parse(id));
  const r=this.#root,st=await lstat(r.path);
  demand(st.isDirectory()&&!st.isSymbolicLink()&&st.dev===r.device&&st.ino===r.inode&&await realpath(r.path)===r.path,'AUTHORITY_UNAVAILABLE');
  const marker=await this.#read(resolve(r.path,'.storage-owner.json'),{parse:v=>v});
  demand(same(marker,{owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),'AUTHORITY_UNAVAILABLE');
  const names=await readdir(r.path);
  demand(names.length<=1025&&names.every(n=>n==='.storage-owner.json'||/^w-[0-9a-f]{64}$/.test(n)),'AUTHORITY_UNAVAILABLE');
  const name='w-'+createHash('sha256').update(JSON.stringify([tenantId,spaceId,actorId,commandKey])).digest('hex'),path=resolve(r.path,name);
  demand(names.includes(name)||names.length<1025,'AUTHORITY_UNAVAILABLE');
  try{await mkdir(path,{mode:0o700});await this.#sync(r.path);}catch(e){if((e as {code?:string}).code!=='EEXIST')throw e;}
  const dir=await lstat(path);demand(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.dev===r.device&&await realpath(path)===path,'AUTHORITY_UNAVAILABLE');
  const files=await readdir(path);demand(files.length<=16&&files.every(n=>['enrolled.json','intent.json','settled.json'].includes(n)||/^\.part-[0-9a-f-]{36}$/.test(n)),'AUTHORITY_UNAVAILABLE');return path;
 }
 async #safe<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof StorageError&&['IDEMPOTENCY_CONFLICT','AUTHORITY_UNAVAILABLE'].includes(e.code))throw e;throw new StorageError('AUTHORITY_UNAVAILABLE');}}
 async #append(path:string,name:string,value:unknown){
  const temp=resolve(path,'.part-'+randomUUID()),target=resolve(path,name),f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}
  try{await link(temp,target);await this.#sync(path);}catch(e){if((e as {code?:string}).code==='EEXIST')throw new StorageError('IDEMPOTENCY_CONFLICT');throw e;}
  finally{await unlink(temp);await this.#sync(path);}
 }
 async state(tenantId:string,spaceId:string,actorId:string,commandKey:string){return this.#safe(async()=>{
  const path=await this.#directory(actorId,commandKey,tenantId,spaceId),original=await this.#read(resolve(path,'enrolled.json'),StagingWitnessSchema),
   intent=await this.#read(resolve(path,'intent.json'),StagingWitnessSchema),terminal=await this.#read(resolve(path,'settled.json'),TerminalSchema);
  demand((!intent||(original&&same(intent,original)))&&(!terminal||(intent&&same(terminal.original,intent))),'AUTHORITY_UNAVAILABLE');
  if(original)demand(original.binding.tenantId===tenantId&&original.binding.spaceId===spaceId&&original.actorId===actorId&&original.commandKey===commandKey&&original.rootId!==this.#root.rootId,'AUTHORITY_UNAVAILABLE');
  return {original,intent,terminal};
 });}
 async enroll(raw:StagingWitness){return this.#safe(async()=>{
  const w=StagingWitnessSchema.parse(raw),b=w.binding,s=await this.state(b.tenantId,b.spaceId,w.actorId,w.commandKey);
  demand(w.rootId!==this.#root.rootId,'AUTHORITY_UNAVAILABLE');demand(!s.original,'IDEMPOTENCY_CONFLICT');
  await this.hooks.afterEnrollmentRead?.();
  await this.#append(await this.#directory(w.actorId,w.commandKey,b.tenantId,b.spaceId),'enrolled.json',w);
 });}
 async intend(raw:StagingWitness){return this.#safe(async()=>{
  const w=StagingWitnessSchema.parse(raw),b=w.binding,s=await this.state(b.tenantId,b.spaceId,w.actorId,w.commandKey);
  demand(same(s.original,w),'AUTHORITY_UNAVAILABLE');
  if(!s.intent)await this.#append(await this.#directory(w.actorId,w.commandKey,b.tenantId,b.spaceId),'intent.json',w);
 });}
 /** Only after a fresh committed PG observation, never inside the INSERT tx. */
 async settle(raw:StagingWitness,at:string){return this.#safe(async()=>{
  const value=TerminalSchema.parse({original:raw,at}),w=value.original,b=w.binding,s=await this.state(b.tenantId,b.spaceId,w.actorId,w.commandKey);
  demand(same(s.intent,w),'AUTHORITY_UNAVAILABLE');
  if(s.terminal)demand(same(s.terminal,value),'AUTHORITY_UNAVAILABLE');
  else await this.#append(await this.#directory(w.actorId,w.commandKey,b.tenantId,b.spaceId),'settled.json',value);
 });}
}
