import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import { readFile,writeFile,readdir,mkdir,lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { StagingWitnessJournal } from '../../src/staging-witness.js';
import { AuthenticatedStagingPreparation,stagedHeadWitness,type StagingMaterial } from '../../src/staging-preparation.js';
import { OwnedCipherFiles } from '../../src/owned-cipher-files.js';
import { HeadPublicationRepository } from '../../src/head-publication.js';
import { HeadMaterialSchema,type HeadMaterial } from '../../src/head-material.js';
import type { EpochPublicationHooks } from '../../src/epoch-publication.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { AuthenticatedUnitOfWork,type AsyncUnitOfWork,type SqlTransaction } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { FoundationError } from '../../src/errors.js';
import { StorageAuthorityRepository } from '../../src/authority.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import type { createStorageFixture } from './pg-fixture.js';
import type { enrollAuthority } from './authority-fixture.js';

export async function registerStagedHeadTests(t:TestContext,f:Awaited<ReturnType<typeof createStorageFixture>>,
 a:Awaited<ReturnType<typeof enrollAuthority>>,crypto:CryptoStore,root:()=>Promise<OwnedAnchorRoot>,
 value:Buffer,description:string,deny:(work:()=>Promise<unknown>,code:string)=>Promise<void>){
 const authorityRoot=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!;
 // Each closed journal gets its own installed marked namespace. Neither is
 // a content/backup root or a bootstrap from the PG snapshot. The enclosing
 // reproducible authority fixture owns cleanup of these opaque directories.
 async function namespace(){
  const path=resolve(authorityRoot.path,'w-'+createHash('sha256').update(randomUUID()).digest('hex'));
  await mkdir(path,{mode:0o700});const st=await lstat(path),r={...authorityRoot,path,rootId:randomUUID(),device:st.dev,inode:st.ino};
  await writeFile(resolve(path,'.storage-owner.json'),JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),{flag:'wx',mode:0o600});return r;
 }
 const epochRoot=await namespace(),stagingRoot=await namespace();
 const journal=new EpochWitnessJournal(epochRoot),witness=new StagingWitnessJournal(stagingRoot);
 const scope=await f.scopeFor(f.actors[0],f.spaces.lifecycle);
 await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
 const authority=new StorageAuthorityRepository(journal,f.native);
 let reads=0,writes=0;
 const sync=async()=>a.anchors.set(a.key(scope),(await journal.current(scope.tenantId,scope.spaceId))!);
 async function setup(confirmed=true){
  const r=await root(),task=await f.task('maintenance',scope),materialId=randomUUID();let pid=0;
  const saved:StagingMaterial={binding:{schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:randomUUID(),revision:1,generation:randomUUID(),keyId:randomUUID()},
   rootId:r.rootId,commandKey:randomUUID(),sessionId:task.binding.sessionId,sourceTaskId:task.binding.taskId,expiresAt:new Date(Date.now()+120_000).toISOString()};
  let current:StagingMaterial|undefined=saved;
  const resolver={async resolve(tx:SqlTransaction){pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);return current;}};
  const control=new AuthenticatedStagingPreparation(f.uow,authority,scope,resolver,materialId,witness),files=new OwnedCipherFiles(r,crypto,control);
  let id='';
  if(confirmed)id=await files.stage(saved.binding,value,description);
  else await deny(()=>new OwnedCipherFiles(r,crypto,control,{async phase(p,v){id=v;if(p==='manifest-directory-fsynced')throw new Error('Synthetic pre-confirmation interruption');}}).stage(saved.binding,value,description),'CONTENT_UNAVAILABLE');
  writes++;
  const object=await readFile(resolve(r.path,'u-'+id,'object')),manifest=await readFile(resolve(r.path,'u-'+id,'manifest'));
  const proof=confirmed?await files.verifyConfirmation(id,saved.binding):{schemaVersion:1 as const,objectDigest:'sha256:'+createHash('sha256').update(object).digest('hex'),manifestDigest:'sha256:'+createHash('sha256').update(manifest).digest('hex'),objectSize:object.length,manifestSize:manifest.length};reads++;
  const b=saved.binding;
  const original=HeadMaterialSchema.parse({tenantId:b.tenantId,spaceId:b.spaceId,class:b.class,id:b.id,revision:b.revision,keyId:b.keyId,generation:b.generation,
   sourceTaskId:saved.sourceTaskId,witness:stagedHeadWitness(proof),expiresAt:new Date(Date.now()+50_000).toISOString()});
  let head:HeadMaterial=original;
  const recreate=()=>new AuthenticatedStagingPreparation(f.uow,new StorageAuthorityRepository(new EpochWitnessJournal(epochRoot),f.native),scope,resolver,materialId,new StagingWitnessJournal(stagingRoot));
  const command={key:saved.commandKey,materialId,sessionId:saved.sessionId,expiresAt:saved.expiresAt,expected:null};
  const repo=(hooks:EpochPublicationHooks={},uow:AsyncUnitOfWork=f.uow,cipher=crypto)=>new HeadPublicationRepository(uow,new EpochWitnessJournal(epochRoot),f.native,
   {resolve:async()=>head},hooks,control.headPrerequisite(r,cipher));
  return {r,task,materialId,saved,control,files,id,proof,original,command,repo,recreate,pid:()=>pid,set:(m:StagingMaterial|undefined)=>{current=m;},setHead:(m:HeadMaterial)=>{head=m;}};
 }
 const count=async(key:string)=>Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[key])).rows[0].n);
 const retained=async(s:Awaited<ReturnType<typeof setup>>)=>Promise.all(['object','manifest'].map(n=>readFile(resolve(s.r.path,'u-'+s.id,n))));
 async function observe(pid:number){
  for(let n=0;n<250;n++){if(Number((await f.admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].n)>0)return;await new Promise(r=>setTimeout(r,10));}
  assert.fail('Exact staged-head PG blocker was not observed');
 }
 await t.test('STAGING/authenticated-staged-head-exact',async()=>{
  const s=await setup(),bytes=await retained(s),before=(await journal.state(scope.tenantId,scope.spaceId))!.anchor;
  let pid=0;const outcome=await s.repo({async afterPublication(tx){pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);
   assert.equal(Number((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[s.command.key])).rows[0]?.['n']),1);
   assert.equal(await count(s.command.key),0,'Independent reader cannot see an uncommitted head');
  }}).publish(scope,s.command);
  assert.equal(pid,s.pid(),'File prerequisite and pointer effect use the exact same PG transaction');
  assert.equal(outcome.status,'committed');assert.equal(await count(s.command.key),1);await sync();writes++;
  assert.equal((await journal.current(scope.tenantId,scope.spaceId))!.epoch,before.epoch+1);
  const read=await new OwnedCipherFiles(s.r,crypto,s.control).inspect(s.id,s.saved.binding);
  try{assert.ok(read.bytes.equals(value));assert.equal(read.description,description);reads++;}finally{read.bytes.fill(0);}
  assert.deepEqual(await retained(s),bytes);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
  await deny(()=>s.control.abandon(s.id),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>s.repo().publish(scope,s.command),'IDEMPOTENCY_CONFLICT');
  assert.equal((await s.repo().lookup(scope,s.command)).status,'committed');reads++;
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE command_key=$1',[s.command.key])).rows[0].n,0,'This is a durable head prerequisite, not a canonical save receipt');
 });
 await t.test('STAGING/consumed-head-recreated',async()=>{
  const s=await setup(),bytes=await retained(s);
  assert.deepEqual(await s.recreate().outcome(),{uploadId:s.id,status:'pending',replayAllowed:false});reads++;
  assert.equal((await s.repo().publish(scope,s.command)).status,'committed');await sync();writes++;
  assert.deepEqual(await s.recreate().outcome(),{uploadId:s.id,status:'consumed',replayAllowed:false});reads++;
  await s.recreate().lock(s.id,async lease=>{const current=await lease.current();
   assert.equal(current.pending,false);assert.equal(current.unknown,false);assert.equal(current.reachable,true);assert.deepEqual(current.confirmation,s.proof);
  });
  assert.deepEqual(await s.recreate().original(),{uploadId:s.id,replayAllowed:false});reads++;
  await deny(()=>s.recreate().reserve(randomUUID(),s.r.rootId,s.saved.binding),'IDEMPOTENCY_CONFLICT');
  await deny(()=>s.recreate().abandon(s.id),'ARTIFACT_NOT_COMMITTED');
  const before=await f.native.snapshot(scope,s.saved.sessionId);
  await f.native.stop(scope,{sessionId:s.saved.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+30_000).toISOString(),observedRevision:before.revision});
  const stopped=await f.native.snapshot(scope,s.saved.sessionId);assert.equal(stopped.stopped,true);
  await deny(()=>s.recreate().outcome(),'STALE_FENCE');
  const recovery=s.recreate().recovery();
  assert.deepEqual(await recovery.outcome(),{uploadId:s.id,status:'consumed',replayAllowed:false});reads++;
  await deny(()=>recovery.abandon(s.id),'ARTIFACT_NOT_COMMITTED');
  const files=new OwnedCipherFiles(s.r,crypto,recovery.control);
  await deny(()=>files.inspect(s.id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>files.collect(),'ARTIFACT_NOT_COMMITTED');
  assert.deepEqual(await f.native.snapshot(scope,s.saved.sessionId),stopped);assert.deepEqual(await retained(s),bytes);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_commands WHERE command_key=$1',[s.command.key])).rows[0].n,0);
 });
 await t.test('STAGING/consumed-head-marker-integrity',async()=>{
  const s=await setup(),bytes=await retained(s);
  assert.equal((await s.repo().publish(scope,s.command)).status,'committed');await sync();writes++;
  const original=(await f.admin.query('SELECT * FROM fabric.storage_head_publications WHERE command_key=$1',[s.command.key])).rows[0];
  // Only this reproducible owned DB is faulted. Current accepted controls and
  // the independent epoch survive while original receipt/confirmation copies
  // disappear or change. None may downgrade a consumed original to pending.
  const fault=async(table:string,work:(c:pg.PoolClient)=>Promise<void>)=>{
   const c=await f.admin.connect();try{await c.query('BEGIN');await c.query('ALTER TABLE fabric.'+table+' DISABLE TRIGGER USER');
    await work(c);await c.query('ALTER TABLE fabric.'+table+' ENABLE TRIGGER USER');await c.query('COMMIT');
   }finally{await c.query('ROLLBACK');c.release();}
  };
  try{
   await fault('storage_head_publications',c=>c.query('DELETE FROM fabric.storage_head_publications WHERE command_key=$1',[s.command.key]).then(()=>{}));
   await deny(()=>s.recreate().outcome(),'AUTHORITY_UNAVAILABLE');
   await deny(()=>s.files.collect(),'AUTHORITY_UNAVAILABLE');
  }finally{
   const cols=Object.keys(original);await f.admin.query('INSERT INTO fabric.storage_head_publications('+cols.join(',')+') VALUES('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(original));
  }
  const epochOriginal=(await f.admin.query('SELECT row_to_json(e) AS original FROM fabric.storage_epoch_publications e WHERE command_key=$1',[s.command.key])).rows[0].original as Record<string,unknown>;
  try{
   await fault('storage_head_publications',c=>c.query('DELETE FROM fabric.storage_head_publications WHERE command_key=$1',[s.command.key]).then(()=>{}));
   await fault('storage_epoch_publications',c=>c.query('DELETE FROM fabric.storage_epoch_publications WHERE command_key=$1',[s.command.key]).then(()=>{}));
   await deny(()=>s.recreate().outcome(),'AUTHORITY_UNAVAILABLE');await deny(()=>s.files.collect(),'AUTHORITY_UNAVAILABLE');
  }finally{
   for(const [table,row] of [['storage_epoch_publications',epochOriginal],['storage_head_publications',original]] as const){
    const cols=Object.keys(row);await f.admin.query('INSERT INTO fabric.'+table+'('+cols.join(',')+') VALUES('+cols.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row));
   }
  }
  for(const phase of ['material','binding','confirmation'] as const){
   const table=phase==='binding'?'storage_epoch_publications':phase==='confirmation'?'storage_staging_confirmations':'storage_head_publications';
   const before=(await f.admin.query('SELECT '+(phase==='binding'?'binding_digest':phase==='confirmation'?'object_size':'material_id')+' AS value FROM fabric.'+table+' WHERE '+(phase==='confirmation'?'upload_id':'command_key')+'=$1',[phase==='confirmation'?s.id:s.command.key])).rows[0].value;
   const field=phase==='binding'?'binding_digest':phase==='confirmation'?'object_size':'material_id',key=phase==='confirmation'?s.id:s.command.key;
   const update=(v:unknown)=>fault(table,c=>c.query('UPDATE fabric.'+table+' SET '+field+'=$2 WHERE '+(phase==='confirmation'?'upload_id':'command_key')+'=$1',[key,v]).then(()=>{}));
   try{await update(phase==='material'?randomUUID():phase==='binding'?'sha256:'+'0'.repeat(64):Number(before)+1);
    await deny(()=>s.recreate().outcome(),'AUTHORITY_UNAVAILABLE');await deny(()=>s.files.collect(),'AUTHORITY_UNAVAILABLE');
   }finally{await update(before);}
   assert.deepEqual(await s.recreate().outcome(),{uploadId:s.id,status:'consumed',replayAllowed:false});reads++;
  }
  assert.deepEqual(await retained(s),bytes);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
  const read=await new OwnedCipherFiles(s.r,crypto,s.recreate()).inspect(s.id,s.saved.binding);
  try{assert.ok(read.bytes.equals(value));reads++;}finally{read.bytes.fill(0);}
 });
 await t.test('STAGING/consumed-head-outcome-wait-freshness',async()=>{
  const s=await setup(),bytes=await retained(s);
  assert.equal((await s.repo().publish(scope,s.command)).status,'committed');await sync();writes++;
  const blocker=await f.admin.connect();let pending:Promise<void>|undefined;
  try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
   [JSON.stringify(['storage-staging-original',scope.tenantId,scope.spaceId,scope.actorId,s.command.key])]);
   const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   pending=deny(()=>s.recreate().outcome(),'IDEMPOTENCY_CONFLICT');pending.catch(()=>{});await observe(pid);
   s.set({...s.saved,rootId:randomUUID()});await blocker.query('COMMIT');await pending;
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});s.set(s.saved);}
  assert.deepEqual(await s.recreate().outcome(),{uploadId:s.id,status:'consumed',replayAllowed:false});reads++;
  assert.deepEqual(await retained(s),bytes);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
 });
 await t.test('STAGING/authenticated-staged-head-confirmation-required',async()=>{
  const s=await setup(false),bytes=await retained(s),anchor=await journal.state(scope.tenantId,scope.spaceId);
  assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_confirmations WHERE upload_id=$1',[s.id])).rows[0].n,0);
  assert.deepEqual((await readdir(resolve(s.r.path,'u-'+s.id))).sort(),['manifest','object']);
  await deny(()=>s.files.verifyConfirmation(s.id,s.saved.binding),'ARTIFACT_NOT_COMMITTED');
  await deny(()=>s.repo().publish(scope,s.command),'ARTIFACT_NOT_COMMITTED');
  assert.equal(await count(s.command.key),0);assert.deepEqual(await retained(s),bytes);
  assert.deepEqual(await journal.state(scope.tenantId,scope.spaceId),anchor);
  assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
  await s.control.abandon(s.id);assert.deepEqual(await s.files.collect(),{removed:1,protected:0});writes++;
 });
 await t.test('STAGING/authenticated-staged-head-binding-and-bytes',async()=>{
  const s=await setup(),anchor=await journal.state(scope.tenantId,scope.spaceId);
  for(const bad of [{...s.command,key:randomUUID()},{...s.command,expiresAt:new Date(Date.now()+80_000).toISOString()}])await deny(()=>s.repo().publish(scope,bad),'SCOPE_MISMATCH');
  for(const bad of [{...s.original,keyId:randomUUID()},{...s.original,generation:randomUUID()},{...s.original,id:randomUUID()},{...s.original,class:'knowledge' as const},
   {...s.original,witness:'sha256:'+'0'.repeat(64)}]){
   s.setHead(bad);await deny(()=>s.repo().publish(scope,s.command),bad.witness===s.original.witness?'SCOPE_MISMATCH':'INTEGRITY_FAILED');
  }s.setHead(s.original);
  for(const name of ['object','manifest']){
   const path=resolve(s.r.path,'u-'+s.id,name),bytes=await readFile(path),envelope=JSON.parse(bytes.toString('utf8'));
   await writeFile(path,JSON.stringify({...envelope,tag:Buffer.alloc(16).toString('base64')}));
   await deny(()=>s.repo().publish(scope,s.command),'INTEGRITY_FAILED');await writeFile(path,bytes);
  }
  assert.equal(await count(s.command.key),0);assert.deepEqual(await journal.state(scope.tenantId,scope.spaceId),anchor);
  assert.equal((await s.repo().publish(scope,s.command)).status,'committed');await sync();writes++;
 });
 await t.test('STAGING/authenticated-staged-head-terminal-refusal',async()=>{
  for(const settled of [false,true]){
   const s=await setup(),bytes=await retained(s),anchor=await journal.state(scope.tenantId,scope.spaceId);
   if(settled)await s.control.abandon(s.id);
   else await deny(()=>new AuthenticatedStagingPreparation(f.uow,authority,scope,{resolve:async()=>s.saved},s.materialId,witness,
    {async afterAbandonment(tx){await tx.query('SELECT 1/0');}}).abandon(s.id),'CONTENT_UNAVAILABLE');
   await deny(()=>s.repo().publish(scope,s.command),'ARTIFACT_NOT_COMMITTED');
   assert.equal(await count(s.command.key),0);assert.deepEqual(await retained(s),bytes);
   assert.deepEqual(await journal.state(scope.tenantId,scope.spaceId),anchor);
  }
 });
 await t.test('STAGING/authenticated-staged-head-posteffect-rollback',async()=>{
  for(const phase of ['material','root','bytes'] as const){
   const s=await setup(),bytes=await retained(s),path=resolve(s.r.path,'.storage-owner.json'),marker=await readFile(path);
   try{await deny(()=>s.repo({async afterPublication(tx){
    assert.equal(Number((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[s.command.key])).rows[0]?.['n']),1);
    if(phase==='material')s.set({...s.saved,rootId:randomUUID()});
    else if(phase==='root')await writeFile(path,'{}');else await writeFile(resolve(s.r.path,'u-'+s.id,'object'),'{}');
   }}).publish(scope,s.command),phase==='material'?'IDEMPOTENCY_CONFLICT':phase==='root'?'CLEANUP_UNPROVEN':'INTEGRITY_FAILED');
   assert.equal(await count(s.command.key),0);assert.ok((await journal.state(scope.tenantId,scope.spaceId))!.pending);
   }finally{s.set(s.saved);await writeFile(path,marker);await writeFile(resolve(s.r.path,'u-'+s.id,'object'),bytes[0]!);
    await s.repo().lookup(scope,s.command);await sync();}
   assert.deepEqual(await s.repo().lookup(scope,s.command),{status:'absent-safe'});await sync();reads++;
   assert.deepEqual(await retained(s),bytes);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
  }
 });
 await t.test('STAGING/authenticated-staged-head-gc-and-original-waits',async()=>{
  const s=await setup();let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(r=>enter=r),resume=new Promise<void>(r=>release=r);
  const pending=s.repo({async afterPublication(){enter();await resume;}}).publish(scope,s.command);pending.catch(()=>{});
  await Promise.race([entered,pending.then(()=>assert.fail('Publication completed without entering the held phase'))]);
  const gc=s.files.collect(),duplicate=s.repo().publish(scope,s.command);gc.catch(()=>{});duplicate.catch(()=>{});
  try{await observe(s.pid());assert.equal(await count(s.command.key),0);assert.equal((await readdir(resolve(s.r.path,'u-'+s.id))).length,2);}finally{release();}
  assert.equal((await pending).status,'committed');await sync();writes++;
  // GC may acquire the Space barrier in the COMMIT-to-independent-ACK gap.
  // It then refuses rather than treating pending epoch authority as deletion.
  const result=await Promise.allSettled([gc,duplicate]);
  if(result[0]!.status==='fulfilled')assert.deepEqual(result[0]!.value,{removed:0,protected:1});
  else assert.equal(result[0]!.reason.code,'AUTHORITY_UNAVAILABLE');
  assert.equal(result[1]!.status,'rejected');assert.equal((result[1] as PromiseRejectedResult).reason.code,'IDEMPOTENCY_CONFLICT');
  assert.equal(await count(s.command.key),1);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
 });
 await t.test('STAGING/authenticated-staged-head-original-lock-postwait',async()=>{
  const s=await setup(),bytes=await retained(s),anchor=await journal.state(scope.tenantId,scope.spaceId),blocker=await f.admin.connect();let pending:Promise<void>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
    [JSON.stringify(['storage-staging-original',scope.tenantId,scope.spaceId,scope.actorId,s.command.key])]);
   const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   pending=deny(()=>s.repo().publish(scope,s.command),'IDEMPOTENCY_CONFLICT');pending.catch(()=>{});await observe(pid);
   s.set({...s.saved,rootId:randomUUID()});await blocker.query('COMMIT');await pending;
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});s.set(s.saved);}
  assert.equal(await count(s.command.key),0);assert.deepEqual(await journal.state(scope.tenantId,scope.spaceId),anchor);
  assert.deepEqual(await retained(s),bytes);assert.equal((await s.repo().publish(scope,s.command)).status,'committed');await sync();writes++;
 });
 await t.test('STAGING/authenticated-staged-head-wire-outcomes',async()=>{
  for(const mode of ['commit','rollback'] as const){
   const s=await setup(),bytes=await retained(s),proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
   const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{
    const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor.bind(f.verifier)});
    await assert.rejects(s.repo({},uow).publish(scope,s.command),e=>e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT');
    assert.equal(await count(s.command.key),mode==='commit'?1:0);
    assert.ok((await journal.state(scope.tenantId,scope.spaceId))!.pending);
    await deny(()=>s.files.collect(),'AUTHORITY_UNAVAILABLE');await deny(()=>s.recreate().outcome(),'AUTHORITY_UNAVAILABLE');assert.deepEqual(await retained(s),bytes);
    assert.equal((await s.repo().lookup(scope,s.command)).status,mode==='commit'?'committed':'absent-safe');await sync();reads++;
    assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
    assert.deepEqual(await s.recreate().outcome(),{uploadId:s.id,status:mode==='commit'?'consumed':'pending',replayAllowed:false});reads++;
    assert.equal(proxy.dropped(),mode==='commit'?1:0);assert.equal(proxy.requestsDropped(),mode==='rollback'?1:0);
   }finally{await pool.end();await proxy.close();}
  }
 });
 await t.test('STAGING/authenticated-staged-head-expiry-during-final-decrypt',async()=>{
  const s=await setup(),bytes=await retained(s),plain:Buffer[]=[];let opens=0,waited=0;
  class DelayedCrypto extends CryptoStore {
   constructor(){super({async resolve(){throw new Error('Unused observed resolver');}});}
   override async open(binding:unknown,envelope:unknown){
    const result=await crypto.open(binding,envelope);plain.push(result);
    if(++opens===4){
     // Real retained PG lease expires while the final authenticated object
     // buffer is held. The original command and head retention remain live.
     waited=Number((await f.admin.query('SELECT greatest(0,ceil(extract(epoch FROM lease_until-clock_timestamp())*1000))::int AS remaining FROM fabric.storage_staging_reservations WHERE upload_id=$1',[s.id])).rows[0].remaining)+30;
     assert.ok(waited>0&&waited<=30_030);await new Promise(r=>setTimeout(r,waited));
    }return result;
   }
  }
  await deny(()=>s.repo({},f.uow,new DelayedCrypto()).publish(scope,s.command),'ARTIFACT_NOT_COMMITTED');
  assert.equal(opens,4);assert.ok(plain.every(b=>b.every(v=>v===0)),'Final decryption refusal clears held authenticated bytes');
  const live=(await f.admin.query('SELECT lease_until<=clock_timestamp() AS expired,expires_at>clock_timestamp() AS command_live FROM fabric.storage_staging_reservations WHERE upload_id=$1',[s.id])).rows[0];
  assert.deepEqual(live,{expired:true,command_live:true});assert.equal(await count(s.command.key),0);
  assert.deepEqual(await s.repo().lookup(scope,s.command),{status:'absent-safe'});await sync();reads++;
  assert.deepEqual(await retained(s),bytes);assert.deepEqual(await s.files.collect(),{removed:0,protected:1});
  await s.control.abandon(s.id);assert.deepEqual(await s.files.collect(),{removed:1,protected:0});writes+=2;
 });
 return {reads,writes};
}
