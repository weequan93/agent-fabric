import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir,symlink,unlink,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {createArtifactVerificationFixture,type ArtifactVerificationFixture} from './artifact-verification-fixture.js';
import {startCommitWireProxy} from './commit-wire-proxy.js';
import {AuthenticatedUnitOfWork} from '../../src/owners.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {emitObservations} from './observations.js';
import type {ComponentTest} from './canonical-component.js';

/** Exact 16 frozen K04/K05 leaves. These call installed owners with real PG,
 * encrypted files and authenticated child processes; no replacement behavior. */
export async function registerArtifactVerificationTests(suite:'verify-artifact'|'commit-conflict',register:ComponentTest=test,observe=emitObservations){
 const totals={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const family=async(id:string,body:(t:TestContext,f:ArtifactVerificationFixture)=>Promise<void>)=>register(id+' / encrypted artifact durability and owned quarantine',async t=>{
  const root=process.env['STORAGE_REPO_ROOT'];assert(root);const fixture=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let callbacks=0;
  await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
   assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));let f:ArtifactVerificationFixture|undefined;
   try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;f=await createArtifactVerificationFixture();await body(t,f);await f.final();for(const k of Object.keys(totals) as (keyof typeof totals)[])totals[k]+=f.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];}
   finally{try{await f?.close();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });assert.equal(callbacks,1);
 });
 await family('K04',async(t,f)=>{
  const registry=await import(pathToFileURL(resolve(f.f.root,'g1-storage/scripts/artifact-verification-registration.mjs')).href);registry.assertArtifactVerificationRegistration();
  const boundaries=[['kill-staged','object-written'],['kill-file-fsynced','object-fsynced'],['kill-renamed','object-renamed'],['kill-directory-fsynced','object-directory-fsynced'],['kill-manifest-confirmed','confirmed'],['kill-before-publication','before-publication'],['kill-after-publication','after-publication']] as const;
  for(const [variant,phase] of boundaries)await t.test('K04/'+variant,async()=>{
   const s=await f.setup(),publication=phase==='before-publication'||phase==='after-publication';let upload:string;
   if(publication)upload=await s.stage();else upload='';
   const w=await f.spawn(s,phase),op=f.begin(w,publication?'commit':'prepare'),observed=await f.phase(w,phase);
   assert(!w.messages.some(m=>m.request===op),'No acknowledgement before phase');
   if(!publication)upload=observed.uploadId;assert.match(upload,/^[a-f0-9-]{36}$/);
   const path=resolve(s.root.path,'u-'+upload),names=(await readdir(path)).sort(),reservation=(await f.f.admin.query('SELECT * FROM fabric.storage_staging_reservations WHERE upload_id=$1',[upload])).rows;
   assert.equal(reservation.length,1);assert.equal(reservation[0].root_id,s.root.rootId);assert.equal(reservation[0].command_key,s.command.key);
   const confirmations=(await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_confirmations WHERE upload_id=$1',[upload])).rows[0].n;
   if(publication||phase==='confirmed')assert.deepEqual(names,['manifest','object']);
   else if(phase==='object-renamed'||phase==='object-directory-fsynced')assert.deepEqual(names,['object']);
   else{assert.equal(names.length,1);assert(names[0]!.startsWith('.part-'));assert((await readFile(resolve(path,names[0]!))).length>0);}
   assert.equal(confirmations,publication?1:0,'Killed stage confirmation is still uncommitted');
   if(phase==='before-publication'){assert.equal(observed.backend.versions,0);assert(observed.backend.pid>1);}
   const accepted=phase==='after-publication';await f.effects(s,accepted?1:0);
   if(accepted)assert((await f.journal.state(f.scope.tenantId,f.scope.spaceId))!.pending,'Post-COMMIT pre-witness ACK must remain unknown');
   const retained=publication||phase==='confirmed'?await f.retained(s,upload):null;
   console.log(JSON.stringify({measurement:'artifact-durable-phase',variant:'K04/'+variant,phase,workerPid:w.child.pid,nonce:w.nonce,uploadId:upload,files:names,confirmationRows:confirmations,canonicalRows:accepted?1:0,acknowledged:false,backend:observed.backend}));
   await f.kill(w);await f.effects(s,accepted?1:0);
   if(publication){const recreated=await f.spawn(s);try{const r=await f.request(recreated,'lookup');assert.equal(r.kind,'result');assert.equal(r.value.status,accepted?'artifact-committed':'absent-safe');if(accepted){assert.equal(r.value.id,s.command.targetId);assert.equal(r.value.revision,1);f.count.save++;}f.count.read++;}finally{await f.kill(recreated);}}
   await f.freshRead(s,accepted);if(retained)assert.deepEqual(await f.retained(s,upload),retained);
   assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:1});
   if(!accepted){await s.repo().recovery(f.scope,s.command).abandon(upload);assert.deepEqual(await s.repo().collect(f.scope),{removed:1,protected:0});assert.deepEqual(await readdir(s.root.path),['.storage-owner.json']);}
   f.count.write++;s.bytes.fill(0);
  });
  await t.test('K04/corrupt-published',async()=>{
   const s=await f.setup(),upload=await s.stage(),committed=await s.repo().commit(f.scope,s.command);assert.equal(committed.status,'artifact-committed');await f.effects(s,1);await f.freshRead(s,true);f.count.save++;
   for(const name of ['object','manifest']){const path=resolve(s.root.path,'u-'+upload,name),original=await readFile(path),value=JSON.parse(original.toString());assert.equal(typeof value.ciphertext,'string');const bytes=Buffer.from(value.ciphertext,'base64');bytes[0]=bytes[0]!^1;value.ciphertext=bytes.toString('base64');await writeFile(path,JSON.stringify(value));await f.freshRead(s,false);await f.effects(s,1);await writeFile(path,original);await f.freshRead(s,true);}
   console.log(JSON.stringify({measurement:'artifact-corruption-refusal',variant:'K04/corrupt-published',objectRefused:true,manifestRefused:true,canonicalRows:1,exactRestoredRead:true}));s.bytes.fill(0);
  });
 });
 await family('K05',async(t,f)=>{
  await t.test('K05/active-lease',async()=>{
   const s=await f.setup(),id=await s.stage(),before=await f.retained(s,id);await s.staging().lock(id,async l=>{const v=await l.current();assert(v.pending&&!v.unknown&&!v.reachable&&v.leaseUntil>v.observedAt&&v.confirmation);});assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:1});assert.deepEqual(await f.retained(s,id),before);await f.freshRead(s,false);await f.effects(s,0);f.count.write++;
  });
  await t.test('K05/published-reachable',async()=>{
   const s=await f.setup(),id=await s.stage();assert.equal((await s.repo().commit(f.scope,s.command)).status,'artifact-committed');f.count.save++;const before=await f.retained(s,id);assert.equal((await s.repo().recovery(f.scope,s.command).outcome()).status,'consumed');assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:1});assert.deepEqual(await f.retained(s,id),before);await f.freshRead(s,true);await f.effects(s,1);
  });
  await t.test('K05/unknown-protected',async()=>{
   const s=await f.setup(),id=await s.stage(),before=await f.retained(s,id),wire=await startCommitWireProxy(f.f.fixtureDsn('controller'),'rollback'),pool=new pg.Pool({connectionString:wire.dsn,max:1,connectionTimeoutMillis:2000});
   pool.on('error',e=>assert.equal(e.message,'Connection terminated unexpectedly'));pool.on('connect',c=>c.on('error',e=>assert.equal(e.message,'Connection terminated unexpectedly')));
   const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.f.verifier.bindingFor});
   try{await assert.rejects(s.staging({},uow).recovery().abandon(id),e=>(e as {code?:string}).code==='UNKNOWN_COMMIT');assert.equal(wire.requestsDropped(),1);assert.equal(wire.dropped(),0);}finally{await pool.end();await wire.close();}
   assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_staging_abandonments WHERE upload_id=$1',[id])).rows[0].n,0);
   await s.staging().recovery().control.lock(id,async l=>{const v=await l.current();assert(v.pending&&v.unknown&&!v.reachable);});
   assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:1});assert.deepEqual(await f.retained(s,id),before);await f.freshRead(s,false);await f.effects(s,0);
   await s.repo().recovery(f.scope,s.command).abandon(id);assert.deepEqual(await s.repo().collect(f.scope),{removed:1,protected:0});f.count.deny++;f.count.write++;
   console.log(JSON.stringify({measurement:'artifact-unknown-protected',variant:'K05/unknown-protected',commitRequestLost:true,pendingIntent:true,abandonmentRows:0,removedWhileUnknown:0,explicitRecoveredGc:1}));
  });
  await t.test('K05/expired-orphan',async()=>{
   const s=await f.setup(),id=await s.stage();await s.repo().recovery(f.scope,s.command).abandon(id);await s.staging().recovery().control.lock(id,async l=>{const v=await l.current();assert(!v.pending&&!v.unknown&&!v.reachable&&v.leaseUntil<=v.observedAt);});assert.deepEqual(await s.repo().collect(f.scope),{removed:1,protected:0});assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:0});assert.deepEqual(await readdir(s.root.path),['.storage-owner.json']);await f.freshRead(s,false);await f.effects(s,0);f.count.write++;
  });
  await t.test('K05/gc-stage-first',async()=>{
   // Staging holds the real owner lock while GC queues; only a confirmed,
   // pending upload survives. No staging filename becomes serving authority.
   const active=await f.setup(),stager=await f.spawn(active,'object-directory-fsynced'),stageOp=f.begin(stager,'prepare'),stagePhase=await f.phase(stager,'object-directory-fsynced');
   const queued=active.repo().collect(f.scope);queued.catch(()=>{});const stagingBackend=(await f.f.admin.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'",[stager.application])).rows;assert.equal(stagingBackend.length,1);
   try{await f.blocked(stagingBackend[0].pid);}finally{stager.child.send({kind:'release'});}
   const staged=await f.result(stager,stageOp);assert.equal(staged.kind,'result');assert.equal(staged.value.uploadId,stagePhase.uploadId);assert.equal(staged.value.replayAllowed,false);assert.deepEqual(await queued,{removed:0,protected:1});await f.kill(stager);await f.freshRead(active,false);await f.effects(active,0);
   await active.repo().recovery(f.scope,active.command).abandon(staged.value.uploadId);assert.deepEqual(await active.repo().collect(f.scope),{removed:1,protected:0});f.count.write++;
   const s=await f.setup(),id=await s.stage();await s.repo().recovery(f.scope,s.command).abandon(id);const gc=await f.spawn(s,'quarantined'),op=f.begin(gc,'collect'),p=await f.phase(gc,'quarantined');assert.equal(p.uploadId,id);assert.deepEqual((await readdir(resolve(s.root.path,'q-'+id))).sort(),['manifest','object']);
   const publish=s.repo().commit(f.scope,s.command);publish.catch(()=>{});const backend=(await f.f.admin.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND state=\'idle in transaction\'',[gc.application])).rows;assert.equal(backend.length,1);
   try{await f.blocked(backend[0].pid);}finally{gc.child.send({kind:'release'});}
   const r=await f.result(gc,op);assert.equal(r.kind,'result');assert.deepEqual(r.value,{removed:1,protected:0});const loser=await publish;assert.equal(loser.status,'not-saved');assert.equal((await s.repo().lookup(f.scope,s.command)).status,'absent-safe');await f.effects(s,0);await f.freshRead(s,false);await f.kill(gc);f.count.deny++;f.count.write++;
   console.log(JSON.stringify({measurement:'artifact-gc-publication-order',variant:'K05/gc-stage-first',winner:'gc',stagingFirstProtected:true,stagingLockObserved:true,quarantineObserved:true,publishRefused:true,canonicalRows:0}));
  });
  await t.test('K05/gc-publish-first',async()=>{
   const s=await f.setup(),id=await s.stage(),before=await f.retained(s,id),w=await f.spawn(s,['before-publication','after-publication']),op=f.begin(w,'commit'),p=await f.phase(w,'before-publication');assert(p.backend.pid>1);const collector=s.repo().collect(f.scope);collector.catch(()=>{});
   try{await f.blocked(p.backend.pid);}finally{w.child.send({kind:'release'});}
   await f.phase(w,'after-publication');assert(!w.messages.some(m=>m.request===op));await f.effects(s,1);
   await assert.rejects(collector,e=>(e as {code?:string}).code==='AUTHORITY_UNAVAILABLE');f.count.deny++;
   assert.deepEqual(await f.retained(s,id),before);await f.kill(w);
   const fresh=await f.spawn(s);try{const r=await f.request(fresh,'lookup');assert.equal(r.kind,'result');assert.equal(r.value.status,'artifact-committed');f.count.read++;}finally{await f.kill(fresh);}
   assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:1});assert.deepEqual(await f.retained(s,id),before);await f.effects(s,1);await f.freshRead(s,true);f.count.save++;f.count.write++;
   console.log(JSON.stringify({measurement:'artifact-gc-publication-order',variant:'K05/gc-publish-first',winner:'publication',gcWhilePending:'AUTHORITY_UNAVAILABLE',removed:0,canonicalRows:1,recreatedLookup:'artifact-committed'}));
  });
  await t.test('K05/kill-gc',async()=>{
   const s=await f.setup(),id=await s.stage(),before=await f.retained(s,id);await s.repo().recovery(f.scope,s.command).abandon(id);const w=await f.spawn(s,'quarantined'),op=f.begin(w,'collect'),p=await f.phase(w,'quarantined');assert.equal(p.uploadId,id);assert(!w.messages.some(m=>m.request===op));assert.deepEqual(await f.retained(s,id,'q-'),before);await f.kill(w);assert.deepEqual(await f.retained(s,id,'q-'),before);await f.freshRead(s,false);await f.effects(s,0);assert.deepEqual(await s.repo().collect(f.scope),{removed:1,protected:0});assert.deepEqual(await s.repo().collect(f.scope),{removed:0,protected:0});assert.deepEqual(await readdir(s.root.path),['.storage-owner.json']);f.count.write++;
   console.log(JSON.stringify({measurement:'artifact-gc-crash-recovery',variant:'K05/kill-gc',quarantineDurable:true,workerKilled:true,exactCiphertextPreserved:true,recreatedGcRemoved:1,secondGcRemoved:0}));
  });
  await t.test('K05/unowned-sentinel',async()=>{
   const s=await f.setup(),id=await s.stage();const outside=await f.setup(),sentinel=resolve(outside.root.path,'sentinel'),marker='unowned-'+randomUUID();await writeFile(sentinel,marker,{flag:'wx'});const refuse=async()=>{await assert.rejects(s.repo().collect(f.scope),e=>(e as {code?:string}).code==='CLEANUP_UNPROVEN');assert.equal(await readFile(sentinel,'utf8'),marker);f.count.deny++;};
   // Unknown directory identity, symlink upload, symlink file, root inode/marker
   // replacement and traversal-looking entries all refuse without deletion.
   const unknown=resolve(s.root.path,'u-'+randomUUID());await mkdir(unknown);await writeFile(resolve(unknown,'object'),marker);await refuse();assert.equal(await readFile(resolve(unknown,'object'),'utf8'),marker);await rename(unknown,resolve(outside.root.path,'unowned-directory'));
   const linked=resolve(s.root.path,'u-'+randomUUID());await symlink(outside.root.path,linked);await refuse();await unlink(linked);
   await s.repo().recovery(f.scope,s.command).abandon(id);
   const object=resolve(s.root.path,'u-'+id,'object'),original=await readFile(object);await unlink(object);await symlink(sentinel,object);await refuse();await unlink(object);await writeFile(object,original);
   const extra=resolve(s.root.path,'u-'+id,'..outside');await writeFile(extra,marker);await refuse();assert.equal(await readFile(extra,'utf8'),marker);await unlink(extra);
   const owner=resolve(s.root.path,'.storage-owner.json'),ownerBytes=await readFile(owner);await writeFile(owner,JSON.stringify({owner:'unowned'}));await refuse();await writeFile(owner,ownerBytes);
   const moved=s.root.path+'-moved';await rename(s.root.path,moved);await symlink(moved,s.root.path);await refuse();await unlink(s.root.path);await rename(moved,s.root.path);
   assert.deepEqual(await s.repo().collect(f.scope),{removed:1,protected:0});assert.equal(await readFile(sentinel,'utf8'),marker);await f.freshRead(s,false);await f.effects(s,0);f.count.write++;
   console.log(JSON.stringify({measurement:'artifact-unowned-refusal',variant:'K05/unowned-sentinel',unknownIdentity:true,uploadSymlink:true,fileSymlink:true,traversalName:true,ownerMarker:true,rootSymlink:true,sentinelUnchanged:true}));
  });
 });
 if(suite==='verify-artifact')observe({schemaVersion:1,measurement:'storage-observations',suite,positives:totals,violations});
 else console.log(JSON.stringify({measurement:'artifact-verification-observations',suite,positives:totals,violations}));
}
