import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, writeFile, readFile, readdir, rename, symlink, unlink, link, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { OwnedCipherFiles, type StagingControl, type StagingLease, type FileConfirmation, type CipherFileHooks } from '../../src/owned-cipher-files.js';
import type { OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { CryptoStore } from '../../src/crypto-store.js';
import type { CipherBinding } from '../../src/contracts.js';
import { StorageError, demand, FoundationError, safeFailure } from '../../src/errors.js';
import { createStorageFixture } from '../helpers/pg-fixture.js';
import { emitObservations } from '../helpers/observations.js';
import { registerStagingPreparationTests } from '../helpers/register-staging-preparation-tests.js';

test('STAGING/behavior / owned durable ciphertext, locked leases and orphan quarantine', async t => {
 const f = await createStorageFixture();
 const dataKey = randomBytes(32), digestKey = randomBytes(32), resolver = {async resolve(){return {dataKey,digestKey};}};
 const crypto = new CryptoStore(resolver), canary = 'private-' + randomUUID();
 const value = Buffer.concat([Buffer.from(canary+'\n决策🙂 e\u0301\u0000','utf8'),randomBytes(333),Buffer.from([0,255,128])]);
 const description = JSON.stringify({title:canary,filename:canary+'.bin',logicalPath:canary,sourceUri:canary});
 const binding: CipherBinding = {schemaVersion:1,tenantId:f.tenant,spaceId:f.spaces.group,class:'artifact',
  id:randomUUID(),revision:1,generation:randomUUID(),keyId:randomUUID()};
 let writes=0, reads=0, denials=0, disclosures=0, mutations=0;
 const deny = async(work:()=>Promise<unknown>,code:string) => {
  let rejected=false;
  try { await work(); disclosures++; } catch(e) {assert.ok(e instanceof StorageError && e.code===code,'Expected exact redacted staging refusal'); rejected=true;}
  assert.ok(rejected); denials++;
 };
 const gate = () => {let release!:()=>void;const ready=new Promise<void>(r=>{release=r;});return {ready,release};};
 const content = (JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['content']!;
 const roots:OwnedAnchorRoot[]=[];
 async function root() {
  const path=resolve(content.path,randomUUID());await mkdir(path,{mode:0o700});const st=await lstat(path);
  const r={path,owner:f.owner,instance:f.instance,rootId:randomUUID(),device:st.dev,inode:st.ino};
  await writeFile(resolve(path,'.storage-owner.json'),JSON.stringify({owner:r.owner,instance:r.instance,rootId:r.rootId,device:r.device,inode:r.inode}),{flag:'wx',mode:0o600});roots.push(r);return r;
 }
 // Admin-only PG diagnostic owner. This exercises durable/recreated coordination
 // and actual observed PG waits, not F02 authenticated publication or canonical
 // payload/command tables (those remain subsequent owner integration).
 const table='public.fabric_storage_staging_probe';
 const namespace='staging-probe-'+randomUUID();
 const publicationFaults=new Map<string,(client:PoolClient)=>Promise<void>>();
 const control: StagingControl = {
  async reserve(id,rootId,b) {await f.admin.query(`INSERT INTO ${table}(id,root_id,binding,lease_until) VALUES($1,$2,$3::jsonb,clock_timestamp()+interval '30 seconds')`,[id,rootId,JSON.stringify(b)]);},
  async lock(id,work) {
   const c=await f.admin.connect();
   try {
    await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[namespace+id]);
    const current=async():Promise<StagingLease> => {
     const row=(await c.query(`SELECT *,floor(extract(epoch from clock_timestamp())*1000)::text AS observed_at,floor(extract(epoch from lease_until)*1000)::text AS lease_ms FROM ${table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
     demand(row,'AUTHORITY_UNAVAILABLE');
     return {uploadId:row.id,rootId:row.root_id,binding:row.binding,observedAt:Number(row.observed_at),leaseUntil:Number(row.lease_ms),pending:row.pending,unknown:row.unknown,reachable:row.reachable,confirmation:row.confirmation};
    };
    const confirm=async(v:FileConfirmation)=>{await c.query(`UPDATE ${table} SET confirmation=$2::jsonb WHERE id=$1`,[id,JSON.stringify(v)]);};
    const publish=async(v:FileConfirmation)=>{
     const s=await current();demand(s.confirmation&&Object.entries(v).every(([k,value])=>value===s.confirmation![k as keyof FileConfirmation]),'INTEGRITY_FAILED');
     await c.query(`UPDATE ${table} SET reachable=true,pending=false,publish_count=publish_count+1 WHERE id=$1`,[id]);
     await publicationFaults.get(id)?.(c);
    };
    const result=await work({current,confirm,publish});await c.query('COMMIT');return result;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
 };
 const expire=async(id:string,flags:{pending?:boolean;unknown?:boolean}={})=>{await f.admin.query(`UPDATE ${table} SET lease_until=clock_timestamp()-interval '1 second',pending=$2,unknown=$3 WHERE id=$1`,[id,flags.pending??false,flags.unknown??false]);};
 const stage=async(r:OwnedAnchorRoot,hooks:CipherFileHooks={})=>{const a=new OwnedCipherFiles(r,crypto,control,hooks);const id=await a.stage(binding,value,description);writes++;return {a,id};};
 const readExact=async(a:OwnedCipherFiles,id:string)=>{const saved=await a.inspect(id,binding);if(!saved.bytes.equals(value)||saved.description!==description)disclosures++;assert.ok(saved.bytes.equals(value));assert.equal(saved.description,description);reads++;};
 const waitObserved=async()=>{
  const until=Date.now()+3000;
  while(Date.now()<until){const rows=(await f.admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'" )).rows;
   if(rows[0].count>0)return;await new Promise(r=>setTimeout(r,10));}
  assert.fail('Actual PG advisory-lock waiter was not observed');
 };
 try {
  await f.admin.query(`CREATE TABLE ${table}(id uuid PRIMARY KEY,root_id uuid NOT NULL,binding jsonb NOT NULL,lease_until timestamptz NOT NULL,pending boolean NOT NULL DEFAULT false,unknown boolean NOT NULL DEFAULT false,reachable boolean NOT NULL DEFAULT false,confirmation jsonb,publish_count integer NOT NULL DEFAULT 0); REVOKE ALL ON ${table} FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp`);
  await t.test('STAGING/durable-confirmation-recreated',async()=>{
   const r=await root(),phases:string[]=[];const {a,id}=await stage(r,{async phase(p){phases.push(p);}});
   assert.deepEqual(phases,['allocated','object-written','object-fsynced','object-renamed','object-directory-fsynced','manifest-fsynced','manifest-renamed','manifest-directory-fsynced','confirmed']);
   await deny(()=>a.inspect(id,binding),'ARTIFACT_NOT_COMMITTED');
   const fresh=new OwnedCipherFiles(r,new CryptoStore(resolver),control);const confirmed=await fresh.publish(id,binding);writes++;
   assert.ok(confirmed.objectSize>value.length&&confirmed.manifestSize>description.length);
   await readExact(new OwnedCipherFiles(r,new CryptoStore(resolver),control),id);
   await deny(()=>fresh.publish(id,binding),'ARTIFACT_NOT_COMMITTED');
   assert.equal((await f.admin.query(`SELECT publish_count FROM ${table} WHERE id=$1`,[id])).rows[0].publish_count,1);
   await expire(id);assert.deepEqual(await fresh.collect(),{removed:0,protected:1});await readExact(fresh,id);
  });
  await t.test('STAGING/exact-empty-and-scoped-files',async()=>{
   const r=await root(),a=new OwnedCipherFiles(r,crypto,control);
   const id=await a.stage(binding,Buffer.alloc(0),'');writes++;await a.publish(id,binding);writes++;
   const empty=await new OwnedCipherFiles(r,new CryptoStore(resolver),control).inspect(id,binding);assert.equal(empty.bytes.length,0);assert.equal(empty.description,'');reads++;
   for(const field of ['tenantId','spaceId','id','generation','keyId'] as const)await deny(()=>a.publish(id,{...binding,[field]:randomUUID()}),'SCOPE_MISMATCH');
   await deny(()=>a.publish('../'+id,binding),'INVALID_SCHEMA');
   await deny(()=>a.stage({...binding,root:r.path},value,description),'INVALID_SCHEMA');
   await deny(()=>new OwnedCipherFiles({...r,rootId:randomUUID()},crypto,control).collect(),'CLEANUP_UNPROVEN');
   await assert.rejects(f.worker.query(`SELECT * FROM ${table}`),{code:'42501'});denials++;
  });
  await t.test('STAGING/corrupt-missing-manifest-byte-key',async()=>{
   for(const kind of ['object','manifest','missing','wrong-key','confirmation','lost-lease'] as const){
    const r=await root(),{a,id}=await stage(r),path=resolve(r.path,'u-'+id,kind==='manifest'?'manifest':'object');
    if(kind==='missing')await unlink(path);
    if(kind==='object'||kind==='manifest') {const e=JSON.parse(await readFile(path,'utf8'));const tag=Buffer.from(e.tag,'base64');tag[0]=tag[0]!^1;e.tag=tag.toString('base64');await writeFile(path,JSON.stringify(e));}
    if(kind==='confirmation')await f.admin.query(`UPDATE ${table} SET confirmation=jsonb_set(confirmation,'{objectSize}','0') WHERE id=$1`,[id]);
    if(kind==='lost-lease')await expire(id);
    const reader=kind==='wrong-key'?new OwnedCipherFiles(r,new CryptoStore({async resolve(){return {dataKey:randomBytes(32),digestKey};}}),control):a;
    await deny(()=>reader.publish(id,binding),kind==='missing'||kind==='lost-lease'?'ARTIFACT_NOT_COMMITTED':'INTEGRITY_FAILED');
    const s=(await f.admin.query(`SELECT reachable,publish_count FROM ${table} WHERE id=$1`,[id])).rows[0];if(s.reachable)mutations++;assert.equal(s.reachable,false);assert.equal(s.publish_count,0);
   }
   const r=await root(),{id}=await stage(r);
   await deny(()=>new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='before-publication')await writeFile(resolve(r.path,'u-'+id,'object'),'{}');}}).publish(id,binding),'INTEGRITY_FAILED');
   assert.equal((await f.admin.query(`SELECT reachable FROM ${table} WHERE id=$1`,[id])).rows[0].reachable,false);
  });
  await t.test('STAGING/leases-pending-unknown-orphan',async()=>{
   const r=await root(),a=new OwnedCipherFiles(r,crypto,control);
   const ids:string[]=[];for(let i=0;i<4;i++){ids.push(await a.stage(binding,value,description));writes++;}
   await expire(ids[1]!,{pending:true});await expire(ids[2]!,{unknown:true});await expire(ids[3]!);
   assert.deepEqual(await new OwnedCipherFiles(r,crypto,control).collect(),{removed:1,protected:3});writes++;
   assert.deepEqual((await readdir(r.path)).sort(),['.storage-owner.json',...ids.slice(0,3).map(id=>'u-'+id)].sort());
   await deny(()=>a.publish(ids[2]!,binding),'ARTIFACT_NOT_COMMITTED');
   await deny(()=>a.publish(randomUUID(),binding),'AUTHORITY_UNAVAILABLE');
   await expire(ids[0]!);await expire(ids[1]!);await expire(ids[2]!);
   assert.deepEqual(await a.collect(),{removed:3,protected:0});writes+=3;
  });
  await t.test('STAGING/gc-stage-first-observed-wait',async()=>{
   const r=await root(),entered=gate(),resume=gate();let observedId='';
   const a=new OwnedCipherFiles(r,crypto,control,{async phase(p,id){if(p==='object-fsynced'){observedId=id;entered.release();await resume.ready;}}});
   const pending=a.stage(binding,value,description);await entered.ready;
   const collecting=new OwnedCipherFiles(r,crypto,control).collect();
   try {await waitObserved();assert.ok((await lstat(resolve(r.path,'u-'+observedId))).isDirectory());}finally{resume.release();}
   const id=await pending;writes++;assert.deepEqual(await collecting,{removed:0,protected:1});
   await a.publish(id,binding);writes++;await readExact(a,id);
  });
  await t.test('STAGING/gc-publication-first-observed-wait',async()=>{
   const r=await root(),entered=gate(),resume=gate(),{id}=await stage(r);
   const a=new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='before-publication'){entered.release();await resume.ready;}}});
   const publishing=a.publish(id,binding);await entered.ready;
   const collecting=new OwnedCipherFiles(r,crypto,control).collect();
   try {await waitObserved();}finally{resume.release();}
   await publishing;writes++;assert.deepEqual(await collecting,{removed:0,protected:1});await readExact(a,id);
  });
  await t.test('STAGING/gc-first-blocks-publication',async()=>{
   const r=await root(),{id}=await stage(r),entered=gate(),resume=gate();await expire(id);
   const a=new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='quarantined'){entered.release();await resume.ready;}}});
   const collecting=a.collect();await entered.ready;
   const publishing=deny(()=>new OwnedCipherFiles(r,crypto,control).publish(id,binding),'ARTIFACT_NOT_COMMITTED');
   try {await waitObserved();assert.ok((await lstat(resolve(r.path,'q-'+id))).isDirectory());}finally{resume.release();}
   assert.deepEqual(await collecting,{removed:1,protected:0});writes++;await publishing;
   assert.equal((await f.admin.query(`SELECT reachable FROM ${table} WHERE id=$1`,[id])).rows[0].reachable,false);
  });
  await t.test('STAGING/partial-phase-and-quarantine-recovery',async()=>{
   for(const phase of ['allocated','object-written','object-fsynced','object-renamed','object-directory-fsynced','manifest-fsynced','manifest-renamed','manifest-directory-fsynced','confirmed'] as const){
    const r=await root();let id='';const a=new OwnedCipherFiles(r,crypto,control,{async phase(p,v){id=v;if(p===phase)throw new Error(canary);}});
    await deny(()=>a.stage(binding,value,description),'CONTENT_UNAVAILABLE');
    await deny(()=>new OwnedCipherFiles(r,crypto,control).publish(id,binding),'ARTIFACT_NOT_COMMITTED');
    await expire(id);assert.deepEqual(await new OwnedCipherFiles(r,crypto,control).collect(),{removed:1,protected:0});writes++;
   }
   const r=await root(),{id}=await stage(r);await expire(id);
   await deny(()=>new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='quarantined')throw new Error(canary);}}).collect(),'CLEANUP_UNPROVEN');
   assert.ok((await lstat(resolve(r.path,'q-'+id))).isDirectory());
   assert.deepEqual(await new OwnedCipherFiles(r,crypto,control).collect(),{removed:1,protected:0});writes++;
  });
  await t.test('STAGING/ownership-symlink-hardlink-cleanup-failures',async()=>{
   const r=await root(),{id,a}=await stage(r),dir=resolve(r.path,'u-'+id),marker=resolve(r.path,'.storage-owner.json');
   const sentinel=await readFile(marker);await writeFile(marker,'{}');await deny(()=>a.collect(),'CLEANUP_UNPROVEN');await writeFile(marker,sentinel);
   await rename(marker,marker+'.saved');await symlink(marker+'.saved',marker);await deny(()=>a.collect(),'CLEANUP_UNPROVEN');await unlink(marker);await rename(marker+'.saved',marker);
   await expire(id);const object=resolve(dir,'object');await rename(object,object+'.saved');await symlink(object+'.saved',object);
   await deny(()=>a.collect(),'CLEANUP_UNPROVEN');await unlink(object);await rename(object+'.saved',object);
   const extra=resolve(dir,'unowned');await writeFile(extra,canary,{flag:'wx'});await deny(()=>a.collect(),'CLEANUP_UNPROVEN');assert.equal(await readFile(extra,'utf8'),canary);await unlink(extra);
   const outside=resolve(content.path,randomUUID());await link(object,outside);await deny(()=>a.collect(),'CLEANUP_UNPROVEN');await unlink(outside);
   await rename(dir,dir+'.saved');await symlink(dir+'.saved',dir);await deny(()=>a.collect(),'CLEANUP_UNPROVEN');await unlink(dir);await rename(dir+'.saved',dir);
   assert.deepEqual(await a.collect(),{removed:1,protected:0});writes++;
   const unowned=resolve(r.path,'unowned');await mkdir(unowned);await writeFile(resolve(unowned,'valuable'),canary);
   await deny(()=>a.collect(),'CLEANUP_UNPROVEN');assert.equal(await readFile(resolve(unowned,'valuable'),'utf8'),canary);
  });
  await t.test('STAGING/real-cleanup-syscall-failure',async()=>{
   const r=await root(),{id}=await stage(r);await expire(id);
   // The trusted fault seam creates a new entry after the collector's initial
   // inventory. rmdir really fails ENOTEMPTY; the unrelated entry survives.
   const extra=resolve(r.path,'q-'+id,'unowned');
   await deny(()=>new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='quarantined')await writeFile(extra,canary,{flag:'wx'});}}).collect(),'CLEANUP_UNPROVEN');
   assert.equal(await readFile(extra,'utf8'),canary);assert.deepEqual(await readdir(resolve(r.path,'q-'+id)),['unowned']);
   await deny(()=>new OwnedCipherFiles(r,crypto,control).collect(),'CLEANUP_UNPROVEN');
   await unlink(extra);assert.deepEqual(await new OwnedCipherFiles(r,crypto,control).collect(),{removed:1,protected:0});writes++;
  });
  await t.test('STAGING/owner-uncertain-ack-no-replay',async()=>{
   const r=await root(),{id}=await stage(r);
   const uncertain:StagingControl={reserve:control.reserve,async lock(v,work){await control.lock(v,work);throw new FoundationError('UNKNOWN_COMMIT');}};
   let unknown:unknown;
   try{await new OwnedCipherFiles(r,crypto,uncertain).publish(id,binding);mutations++;}catch(e){unknown=e;}
   assert.ok(unknown instanceof FoundationError&&unknown.code==='UNKNOWN_COMMIT');denials++;
   assert.deepEqual(safeFailure(unknown),{schemaVersion:1,status:'unknown',error:'UNKNOWN_COMMIT',replayAllowed:false,nextAction:'original-key-lookup'});
   // This is an injected owner ACK gap AFTER a real diagnostic PG COMMIT,
   // not the genuine wireCOMMIT negative/positive schedules of later suites.
   await expire(id);const recreated=new OwnedCipherFiles(r,crypto,control);
   assert.deepEqual(await recreated.collect(),{removed:0,protected:1});await readExact(recreated,id);
   await deny(()=>recreated.publish(id,binding),'ARTIFACT_NOT_COMMITTED');
   assert.equal((await f.admin.query(`SELECT publish_count FROM ${table} WHERE id=$1`,[id])).rows[0].publish_count,1);writes++;
  });
  await t.test('STAGING/verified-byte-snapshot',async()=>{
   const r=await root(),{a,id}=await stage(r);await a.publish(id,binding);writes++;
   const replacement=await crypto.seal(binding,Buffer.from('changed-'+randomUUID()));
   let resolves=0;
   const switching=new CryptoStore({async resolve(){
    resolves++;if(resolves===2)await writeFile(resolve(r.path,'u-'+id,'object'),JSON.stringify(replacement));
    return {dataKey,digestKey};
   }});
   // Both real files were captured before the object-key lookup. A concurrent
   // replacement cannot change the confirmed snapshot returned by inspect.
   await readExact(new OwnedCipherFiles(r,switching,control),id);assert.equal(resolves,2);
   await deny(()=>new OwnedCipherFiles(r,crypto,control).inspect(id,binding),'INTEGRITY_FAILED');
  });
  await t.test('STAGING/inspect-postread-confirmation-clears-bytes',async()=>{
   const r=await root(),{a,id}=await stage(r);await a.publish(id,binding);writes++;
   const before=(await f.admin.query(`SELECT confirmation FROM ${table} WHERE id=$1`,[id])).rows[0].confirmation;
   const plaintext:Buffer[]=[];
   class ObservedCrypto extends CryptoStore {
    override async open(b:unknown,e:unknown){const bytes=await super.open(b,e);plaintext.push(bytes);return bytes;}
   }
   let currents=0;
   const changed:StagingControl={reserve:control.reserve,lock:(v,work)=>control.lock(v,async lease=>work({...lease,current:async()=>{
    if(++currents===2)await lease.confirm({...before,objectSize:before.objectSize+1});
    return lease.current();
   }}))};
   await deny(()=>new OwnedCipherFiles(r,new ObservedCrypto(resolver),changed).inspect(id,binding),'INTEGRITY_FAILED');
   assert.equal(currents,2,'Inspect must reread current confirmation after actual object decryption');
   assert.equal(plaintext.length,2);assert.equal(plaintext[1]!.length,value.length);
   assert.ok(plaintext.every(b=>b.every(byte=>byte===0)),'Rejected verified buffers must be cleared');
   assert.deepEqual((await f.admin.query(`SELECT confirmation FROM ${table} WHERE id=$1`,[id])).rows[0].confirmation,before,'Real PG owner transaction must roll back the changed confirmation');
   await readExact(new OwnedCipherFiles(r,crypto,control),id);
  });
  await t.test('STAGING/inspect-owner-completion-clears-bytes',async()=>{
   const r=await root(),{a,id}=await stage(r);await a.publish(id,binding);writes++;
   for(const kind of ['rollback','commit-ack-gap','untyped-completion'] as const){
    let captured:{bytes:Buffer;description:string}|undefined;
    const failed:StagingControl={reserve:control.reserve,async lock(v,work){
     const result=await control.lock(v,async lease=>{
      const out=await work(lease);captured=out as typeof captured;
      assert.ok(captured);assert.ok(captured.bytes.equals(value));assert.equal(captured.description,description);
      if(kind==='rollback')throw new StorageError('UNAUTHORIZED');
      return out;
     });
     if(kind==='commit-ack-gap')throw new FoundationError('UNKNOWN_COMMIT');
     throw new Error(description);
    }};
    let failure:unknown;
    try{await new OwnedCipherFiles(r,crypto,failed).inspect(id,binding);disclosures++;}catch(e){failure=e;}
    if(kind==='commit-ack-gap'){
     assert.ok(failure instanceof FoundationError&&failure.code==='UNKNOWN_COMMIT');
     assert.deepEqual(safeFailure(failure),{schemaVersion:1,status:'unknown',error:'UNKNOWN_COMMIT',replayAllowed:false,nextAction:'original-key-lookup'});
    }else assert.ok(failure instanceof StorageError&&failure.code===(kind==='rollback'?'UNAUTHORIZED':'CONTENT_UNAVAILABLE'));
    denials++;assert.ok(captured);assert.equal(captured.bytes.length,value.length);
    assert.ok(captured.bytes.every(byte=>byte===0),'Owner completion refusal must clear the exact returned callback buffer');
    assert.equal((await f.admin.query(`SELECT publish_count FROM ${table} WHERE id=$1`,[id])).rows[0].publish_count,1);
    await readExact(new OwnedCipherFiles(r,crypto,control),id);
   }
  });
  await t.test('STAGING/stage-confirmation-result-required',async()=>{
   for(const kind of ['no-op','altered','after-hook','mutated-input'] as const){
    const r=await root();let id='',change:()=>Promise<void>=async()=>assert.fail('Confirm not entered');
    const changed:StagingControl={reserve:control.reserve,lock:(v,work)=>control.lock(v,lease=>{
     id=v;return work({...lease,confirm:async c=>{
      if(kind==='mutated-input')Object.assign(c,{manifestSize:c.manifestSize+1});
      if(kind!=='no-op')await lease.confirm(kind==='altered'?{...c,manifestSize:c.manifestSize+1}:c);
      change=()=>lease.confirm({...c,objectSize:c.objectSize+1});
     }});
    })};
    const a=new OwnedCipherFiles(r,crypto,changed,{async phase(p){
     if(p==='confirmed'&&kind==='after-hook')await change();
    }});
    await deny(()=>a.stage(binding,value,description),kind==='mutated-input'?'CONTENT_UNAVAILABLE':'INTEGRITY_FAILED');
    const s=(await f.admin.query(`SELECT confirmation,reachable,publish_count FROM ${table} WHERE id=$1`,[id])).rows[0];
    assert.equal(s.confirmation,null,'Unproved confirmation must roll back the actual PG transaction');
    assert.equal(s.reachable,false);assert.equal(s.publish_count,0);
    assert.deepEqual((await readdir(resolve(r.path,'u-'+id))).sort(),['manifest','object']);
    await deny(()=>new OwnedCipherFiles(r,crypto,control).publish(id,binding),'ARTIFACT_NOT_COMMITTED');
    await expire(id);assert.deepEqual(await new OwnedCipherFiles(r,crypto,control).collect(),{removed:1,protected:0});writes++;
   }
  });
  await t.test('STAGING/publication-postdecrypt-confirmation-required',async()=>{
   const r=await root(),{id}=await stage(r);
   const before=(await f.admin.query(`SELECT confirmation FROM ${table} WHERE id=$1`,[id])).rows[0].confirmation;
   let currents=0,called=0;
   const changed:StagingControl={reserve:control.reserve,lock:(v,work)=>control.lock(v,lease=>work({...lease,
    current:async()=>{
     if(++currents===2)await lease.confirm({...before,objectSize:before.objectSize+1});
     return lease.current();
    },publish:async()=>{called++;}
   }))};
   await deny(()=>new OwnedCipherFiles(r,crypto,changed).publish(id,binding),'INTEGRITY_FAILED');
   assert.equal(currents,2);assert.equal(called,0,'Contradictory confirmation must be refused before publisher entry');
   const s=(await f.admin.query(`SELECT confirmation,reachable,publish_count FROM ${table} WHERE id=$1`,[id])).rows[0];
   assert.deepEqual(s.confirmation,before);assert.equal(s.reachable,false);assert.equal(s.publish_count,0);
   await new OwnedCipherFiles(r,crypto,control).publish(id,binding);writes++;await readExact(new OwnedCipherFiles(r,crypto,control),id);
  });
  await t.test('STAGING/publication-result-required-rollback',async()=>{
   for(const kind of ['no-op','reachability','pending','unknown','confirmation','binding','root','after-hook-root','mutated-input'] as const){
    const r=await root(),{id}=await stage(r),marker=resolve(r.path,'.storage-owner.json'),sentinel=await readFile(marker);
    const before=(await f.admin.query(`SELECT confirmation FROM ${table} WHERE id=$1`,[id])).rows[0].confirmation;
    if(kind!=='no-op'&&kind!=='after-hook-root'&&kind!=='mutated-input')publicationFaults.set(id,async c=>{
     if(kind==='reachability')await c.query(`UPDATE ${table} SET reachable=false WHERE id=$1`,[id]);
     if(kind==='pending')await c.query(`UPDATE ${table} SET pending=true WHERE id=$1`,[id]);
     if(kind==='unknown')await c.query(`UPDATE ${table} SET unknown=true WHERE id=$1`,[id]);
     if(kind==='confirmation')await c.query(`UPDATE ${table} SET confirmation=$2::jsonb WHERE id=$1`,[id,JSON.stringify({...before,manifestSize:before.manifestSize+1})]);
     if(kind==='binding')await c.query(`UPDATE ${table} SET binding=jsonb_set(binding,'{generation}',$2::jsonb) WHERE id=$1`,[id,JSON.stringify(randomUUID())]);
     if(kind==='root')await c.query(`UPDATE ${table} SET root_id=$2 WHERE id=$1`,[id,randomUUID()]);
    });
    const changed:StagingControl=kind==='no-op'||kind==='mutated-input'?{reserve:control.reserve,lock:(v,work)=>control.lock(v,lease=>work({...lease,publish:async c=>{
     if(kind==='mutated-input'){Object.assign(c,{objectSize:c.objectSize+1});await lease.confirm(c);await lease.publish(c);}
    }}))}:control;
    try{
     await deny(()=>new OwnedCipherFiles(r,crypto,changed,{async phase(p){if(p==='published'&&kind==='after-hook-root')await writeFile(marker,'{}');}}).publish(id,binding),
      kind==='confirmation'?'INTEGRITY_FAILED':kind==='binding'||kind==='root'?'SCOPE_MISMATCH':kind==='after-hook-root'?'CLEANUP_UNPROVEN':kind==='mutated-input'?'CONTENT_UNAVAILABLE':'ARTIFACT_NOT_COMMITTED');
    }finally{publicationFaults.delete(id);if(kind==='after-hook-root')await writeFile(marker,sentinel);}
    const s=(await f.admin.query(`SELECT * FROM ${table} WHERE id=$1`,[id])).rows[0];
    assert.equal(s.reachable,false);assert.equal(s.pending,false);assert.equal(s.unknown,false);assert.equal(s.publish_count,0,'Actual diagnostic PG pointer publication must roll back');
    assert.equal(s.root_id,r.rootId);assert.deepEqual(s.binding,binding);assert.deepEqual(s.confirmation,before);
    assert.deepEqual((await readdir(resolve(r.path,'u-'+id))).sort(),['manifest','object']);
    await new OwnedCipherFiles(r,crypto,control).publish(id,binding);writes++;await readExact(new OwnedCipherFiles(r,crypto,control),id);
   }
  });
  await t.test('STAGING/publication-posteffect-gc-observed-wait',async()=>{
   const r=await root(),{id}=await stage(r),entered=gate(),resume=gate();
   const a=new OwnedCipherFiles(r,crypto,control,{async phase(p){if(p==='published'){entered.release();await resume.ready;}}});
   const publishing=a.publish(id,binding);await entered.ready;
   const collecting=new OwnedCipherFiles(r,crypto,control).collect();
   try{await waitObserved();assert.ok((await lstat(resolve(r.path,'u-'+id))).isDirectory());}finally{resume.release();}
   await publishing;writes++;assert.deepEqual(await collecting,{removed:0,protected:1});await readExact(new OwnedCipherFiles(r,crypto,control),id);
  });
  await t.test('STAGING/retained-copies-no-content-keys',async()=>{
   const r=await root(),{a,id}=await stage(r);await a.publish(id,binding);writes++;await readExact(a,id);
   const copies:Buffer[]=[Buffer.from(JSON.stringify((await f.admin.query(`SELECT * FROM ${table}`)).rows))];
   for(const name of ['object','manifest']){
    const path=resolve(r.path,'u-'+id,name),st=await lstat(path);assert.ok(st.isFile()&&!st.isSymbolicLink());assert.equal(st.mode&0o777,0o600);
    copies.push(await readFile(path));
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{assert.equal((await handle.stat()).nlink,1);}finally{await handle.close();}
   }
   const secrets=[Buffer.from(canary),Buffer.from(Buffer.from(canary).toString('base64')),dataKey,digestKey,...[dataKey,digestKey].flatMap(k=>[Buffer.from(k.toString('hex')),Buffer.from(k.toString('base64'))])];
   assert.ok(copies.every(copy=>secrets.every(secret=>!copy.includes(secret))),'Actual staged/manifest/lease copies contain content/key canaries');
   assert.equal(JSON.stringify(a),'{}');
  });
  const preparation=await registerStagingPreparationTests(t,f,crypto,root,value,description,deny);
  reads+=preparation.reads;writes+=preparation.writes;
  emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'staging',
   positives:{save:0,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:0,harness:0},
   violations:{unauthorizedDisclosure:disclosures,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0}});
 }finally{dataKey.fill(0);digestKey.fill(0);await f.close();}
});
