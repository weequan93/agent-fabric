import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createStorageFixture} from './pg-fixture.js';
import {enrollAuthority} from './authority-fixture.js';
import {census,type ProcessRow} from '../../../g1-model/tests/helpers/process-fixture.js';
import {migrateStorageArtifactPublication,installedOwnerSnapshot} from '../../src/migration.js';
import {ArtifactPublicationRepository,type ArtifactCommand,type ArtifactHooks} from '../../src/artifact-publication.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import {AuthenticatedStagingPreparation,type StagingMaterial} from '../../src/staging-preparation.js';
import {StorageAuthorityRepository} from '../../src/authority.js';
import {BindingSchema,ArtifactCommandSchema} from '../../src/schema.js';
import {demand} from '../../src/errors.js';
import type {AsyncUnitOfWork} from '../../src/owners.js';
import type {ArtifactProcessInput} from './artifact-process-worker.js';
const stableId=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
export async function createArtifactVerificationFixture(){
 const f=await createStorageFixture(),dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
 type Worker={child:ChildProcess;closed:Promise<unknown>;nonce:string;application:string;identity:ProcessRow;messages:any[];output:Buffer[]};
 const workers:Worker[]=[];let closed=false;
 const count={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const until=async<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,label:string,ms=2000)=>{const end=Date.now()+ms;do{const v=await read();if(accept(v))return v;}while(Date.now()<end);assert.fail('Unobserved '+label);};
 const marker=async()=>assert.deepEqual((await f.admin.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows,[{owner:f.owner,instance:f.instance}]);
 const owned=(w:Worker)=>{const row=census().find(r=>r.pid===w.child.pid);assert.deepEqual(row,w.identity);assert.equal(row!.ppid,process.pid);assert(row!.command.includes(w.nonce));assert.equal(w.child.exitCode,null);assert.equal(w.child.signalCode,null);};
 const kill=async(w:Worker)=>{
  if(w.child.exitCode===null&&w.child.signalCode===null){await marker();owned(w);assert(!census().some(r=>r.ppid===w.child.pid));assert(w.child.kill('SIGKILL'));}
  await Promise.race([w.closed,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Artifact reap timeout')),2000);timer.unref();})]);
  assert.equal(w.child.exitCode,null);assert.equal(w.child.signalCode,'SIGKILL');assert.equal(Buffer.concat(w.output).length,0);assert(!census().some(r=>r.pid===w.child.pid));
  await until(async()=>(await f.admin.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 OR application_name=$2',[w.application,w.application+'-auth'])).rows,r=>r.length===0,'owned artifact backend disconnect');
  console.log(JSON.stringify({measurement:'artifact-owned-process-cleanup',pid:w.child.pid,nonce:w.nonce,instance:w.identity.instance,signal:'SIGKILL',backendConnections:0,processAbsent:true,workerOutputBytes:0}));
 };
 const waitMessage=(w:Worker,accept:(m:any)=>boolean,label:string,bound:number):Promise<any>=>{
  const existing=w.messages.find(accept);if(existing)return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{
   const clear=()=>{clearTimeout(timer);w.child.off('message',message);w.child.off('exit',exit);};
   const message=(m:unknown)=>{if(accept(m)){clear();resolve(m);}};
   const exit=()=>{clear();reject(new Error('Artifact process exited before '+label));};
   const timer=setTimeout(()=>{clear();reject(new Error('Unobserved '+label));},bound);
   w.child.on('message',message);w.child.once('exit',exit);
   if(w.child.exitCode!==null||w.child.signalCode!==null)exit();
  });
 };
 const close=async()=>{if(closed)return;closed=true;const failures:unknown[]=[];for(const w of workers)try{await kill(w);}catch(e){failures.push(e);}dataKey.fill(0);digestKey.fill(0);try{await f.close();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'Artifact cleanup failed');};
 try{
  await migrateStorageArtifactPublication(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});const a=await enrollAuthority(f),scope=f.scope;
  const authorityRoot=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(authorityRoot);await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
  const namespace=async()=>{const path=resolve(authorityRoot.path,'w-'+createHash('sha256').update(randomUUID()).digest('hex'));await mkdir(path,{mode:0o700});const st=await lstat(path),r={...authorityRoot,path,rootId:randomUUID(),device:st.dev,inode:st.ino};await writeFile(resolve(path,'.storage-owner.json'),JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),{flag:'wx',mode:0o600});return r;};
  const witnessRoot=await namespace(),crypto=()=>new CryptoStore({resolve:async()=>({dataKey,digestKey})});
  const setup=async()=>{
   const root=await namespace(),task=await f.task('maintenance'),bytes=Buffer.concat([Buffer.from([0,255,254,128,13,10]),Buffer.from('artifact-'+randomUUID()+'🙂 e\u0301\u0000'),randomBytes(4096)]),command:ArtifactCommand=ArtifactCommandSchema.parse({schemaVersion:1,action:'artifact',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),filename:'../artifact-'+randomUUID()+'.bin',bytes:bytes.toString('base64'),sourceId:null,validationId:randomUUID()}),retentionExpiresAt=new Date(Date.now()+55_000).toISOString(),binding=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:command.targetId,revision:1,keyId,generation}),fingerprint=await crypto().fingerprint(binding,'command',Buffer.from(JSON.stringify(command))),materialId=stableId(['storage-artifact-material-v1',scope.tenantId,scope.spaceId,scope.actorId,command.key]);
   const repo=(hooks:ArtifactHooks={})=>new ArtifactPublicationRepository(f.uow,new EpochWitnessJournal(authorityRoot),f.native,crypto(),root,new StagingWitnessJournal(witnessRoot),{current:async()=>({rootId:root.rootId,keyId,generation}),resolve:async()=>({rootId:root.rootId,keyId,generation,retentionExpiresAt})},{require:async(tx,s,r)=>{demand(s.tenantId===scope.tenantId&&s.spaceId===scope.spaceId&&s.actorId===scope.actorId,'UNAUTHORIZED');demand(r.validationId===command.validationId&&r.commandFingerprint===fingerprint&&JSON.stringify(r.binding)===JSON.stringify(binding),'CHECK_BINDING_MISMATCH');demand((await tx.query('SELECT clock_timestamp()<$1::timestamptz AS live',[command.expiresAt])).rows[0]?.['live']===true,'EXPIRED_COMMAND');}},hooks);
   const material:StagingMaterial={binding,rootId:root.rootId,commandKey:command.key,sessionId:command.sessionId,sourceTaskId:task.binding.taskId,expiresAt:command.expiresAt};
   const staging=(hooks:ConstructorParameters<typeof AuthenticatedStagingPreparation>[6]={},uow:AsyncUnitOfWork=f.uow)=>new AuthenticatedStagingPreparation(uow,new StorageAuthorityRepository(journal,f.native),scope,{resolve:async()=>material},materialId,new StagingWitnessJournal(witnessRoot),hooks);
   const ref=async()=>{const row=(await f.admin.query('SELECT witness FROM fabric.storage_artifact_versions WHERE id=$1',[command.targetId])).rows[0];return {class:'artifact' as const,id:command.targetId,revision:1,witness:row?String(row.witness):'sha256:'+'0'.repeat(64)};};
   const stage=async()=>{const r=await repo().prepare(scope,command);assert.equal(r.replayAllowed,false);count.write++;return r.uploadId;};
   return {root,task,bytes,command,binding,retentionExpiresAt,materialId,repo,staging,ref,stage};
  };
  type Setup=Awaited<ReturnType<typeof setup>>;
  const spawn=async(s:Setup,gate:string|readonly string[]|null=null,installed?:{script:URL;input:Record<string,unknown>})=>{
   census();const nonce=randomUUID(),child=fork(installed?.script??new URL('./artifact-process-worker.js',import.meta.url),[nonce],{execArgv:[],env:{},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});assert(child.pid&&child.pid!==process.pid);
   const output:Buffer[]=[],messages:any[]=[];child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));child.on('message',m=>messages.push(m));const closed=once(child,'close');closed.catch(()=>{});
   const identity=census().find(r=>r.pid===child.pid);assert(identity);const w={child,closed,nonce,application:`artifact-${child.pid}-${nonce}`,identity,messages,output};workers.push(w);owned(w);
   const e=f.idp.ready as Record<string,string>,input:ArtifactProcessInput={owner:f.owner,instance:f.instance,nonce,controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),issuer:e['issuer']!,jwksUrl:e['jwksUrl']!,token:f.tokens.get(scope.actorId)!,tenantId:scope.tenantId,spaceId:scope.spaceId,authorityRoot,root:s.root,witnessRoot,dataKey,digestKey,keyId,generation,retentionExpiresAt:s.retentionExpiresAt,command:s.command,gate};
   child.send({kind:'install',value:{...input,...installed?.input}});const ready=await waitMessage(w,m=>m.kind==='ready'||m.kind==='startup-refused','artifact worker readiness',5000);
   assert.deepEqual(ready,{kind:'ready',pid:child.pid,owner:f.owner,instance:f.instance,nonce,application:w.application});owned(w);console.log(JSON.stringify({measurement:'artifact-owned-process',pid:child.pid,nonce,instance:identity.instance,ppid:identity.ppid,owner:f.owner,fixtureInstance:f.instance,application:w.application}));return w;
  };
  const begin=(w:Worker,kind:string,ref?:unknown)=>{owned(w);const request=randomUUID();w.child.send({kind,request,ref});return request;};
  const result=async(w:Worker,request:string)=>waitMessage(w,m=>m.request===request,'artifact operation result',9000);
  const request=async(w:Worker,kind:string,ref?:unknown)=>result(w,begin(w,kind,ref));
  const phase=async(w:Worker,name:string)=>{const r=await waitMessage(w,m=>m.kind==='phase'&&m.phase===name,'artifact durable phase',10000);assert.equal(r.phase,name);assert.equal(r.pid,w.child.pid);assert.equal(r.nonce,w.nonce);owned(w);return r;};
  const effects=async(s:Setup,n:number)=>{for(const table of ['storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox','storage_head_publications']){const actual=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[s.command.key])).rows[0].n;if(actual!==n)violations.duplicateCanonicalEffect++;assert.equal(actual,n,table);}const heads=(await f.admin.query("SELECT count(*)::int AS n FROM fabric.storage_current_heads WHERE class='artifact' AND id=$1",[s.command.targetId])).rows[0].n;assert.equal(heads,n);};
  const retained=async(s:Setup,id:string,prefix='u-')=>Promise.all(['object','manifest'].map(n=>readFile(resolve(s.root.path,prefix+id,n))));
  const freshRead=async(s:Setup,accepted:boolean)=>{const w=await spawn(s);try{const r=await request(w,'read',await s.ref());if(accepted){assert.equal(r.kind,'result');assert(Buffer.from(r.value.bytes).equals(s.bytes));assert.equal(r.value.manifest.entry.contentDigest,'sha256:'+createHash('sha256').update(s.bytes).digest('hex'));assert.equal(r.value.manifest.filename,s.command.filename);assert.equal(r.value.manifest.entry.byteLength,s.bytes.length);assert.equal(r.value.manifest.validationId,s.command.validationId);count.read++;}else{if(r.kind==='result')violations.unauthorizedDisclosure++;assert.equal(r.kind,'refused');assert(['STALE_REVISION','ARTIFACT_NOT_COMMITTED','INTEGRITY_FAILED','AUTHORITY_UNAVAILABLE'].includes(r.code),r.code);count.deny++;}return r;}finally{await kill(w);}};
  const blocked=async(pid:number)=>{const rows=await until(async()=>(await f.admin.query('SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows,r=>r.length===1,'artifact queued backend',1500);console.log(JSON.stringify({measurement:'artifact-observed-lock',blockerPid:pid,waiterPid:rows[0].pid,blockers:rows[0].blockers}));return rows;};
  const ownerBefore=await installedOwnerSnapshot(f.admin),resourcesBefore=(await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows;
  const final=async()=>{assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);assert.deepEqual((await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows,resourcesBefore);count.owner++;};
  return {f,scope,journal,witnessRoot,authorityRoot,authorityEnrollment:a,namespace,crypto,keyId,generation,setup,spawn,kill,begin,result,request,phase,effects,retained,freshRead,blocked,until,final,count,violations,close};
 }catch(e){await close();throw e;}
}
export type ArtifactVerificationFixture=Awaited<ReturnType<typeof createArtifactVerificationFixture>>;
