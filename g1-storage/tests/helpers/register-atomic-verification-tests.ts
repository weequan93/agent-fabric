import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {createAtomicVerificationFixture,type AtomicVerificationFixture} from './atomic-verification-fixture.js';
import {emitObservations} from './observations.js';
import {startCommitWireProxy} from './commit-wire-proxy.js';
import {exerciseAtomicMutationNamespaces,exerciseAtomicDerivedOutage} from './atomic-mutation-namespaces.js';
import {AuthenticatedUnitOfWork,type AsyncUnitOfWork,type SqlTransaction} from '../../src/owners.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {FoundationError} from '../../src/errors.js';
import {SourceRevocationRepository} from '../../src/source-revocation.js';
import type {ComponentTest} from './canonical-component.js';
import type {SaveCommand} from '../../src/contracts.js';

const latch=()=>{let release!:()=>void;const wait=new Promise<void>(r=>release=r);return {wait,release};};
async function canonicalRows(f:AtomicVerificationFixture,tx:SqlTransaction,c:SaveCommand){
 for(const table of ['storage_knowledge_revisions','storage_commands','storage_outbox','storage_save_events','storage_save_receipts'])assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[c.key])).rows[0]?.['n'],1,table);
 assert.equal((await tx.query("SELECT count(*)::int AS n FROM fabric.storage_current_heads WHERE class='knowledge' AND id=$1",[c.targetId])).rows[0]?.['n'],1);await f.effects(c,0);
}
function unknown(f:AtomicVerificationFixture,r:Awaited<ReturnType<AtomicVerificationFixture['request']>>,c:SaveCommand,typed=false){assert.equal(r.status,503,JSON.stringify(r));assert.equal(r.body.status,'unknown');assert.equal(r.body.key,c.key);assert.equal(r.body.replayAllowed,false);assert.equal(r.body.nextAction,'original-key-lookup');assert.deepEqual(r.body.resolver,{method:'POST',path:f.path(f.scope,'lookup')});if(typed)assert.equal(r.body.error,'UNKNOWN_COMMIT');}

/** Both fixed diagnostic and original full S-K import these same assertions.
 * All 16 frozen leaves execute. There is no case selector, skipped test, fake
 * UoW outcome or alternate implementation of save/receipt/publication/recovery. */
export async function registerAtomicVerificationTests(suite:'verify-atomic'|'commit-conflict',register:ComponentTest=test,observe=emitObservations){
 const totals={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 let failed=false;
 const family=async(id:string,body:(t:TestContext,f:AtomicVerificationFixture)=>Promise<void>)=>register(id+' / actual canonical atomic and original-key schedules',async t=>{
  const root=process.env['STORAGE_REPO_ROOT'];assert.ok(root);const fixture=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let callbacks=0;
  await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
   assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));let f:AtomicVerificationFixture|undefined;
   try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;f=await createAtomicVerificationFixture();await body(t,f);await f.assertFinal();for(const k of Object.keys(totals) as (keyof typeof totals)[])totals[k]+=f.positives[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];}
   catch(e){failed=true;throw e;}finally{try{await f?.close();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });assert.equal(callbacks,1);
 });
 await family('K03',async(t,f)=>{
  const registration=await import(pathToFileURL(resolve(f.f.root,'g1-storage/scripts/atomic-verification-registration.mjs')).href);registration.assertAtomicVerificationRegistration();
  const phases=[['revision','storage_knowledge_revisions',1,3],['head','storage_current_heads',0,1],['receipt','storage_save_receipts',31,63],['event','storage_save_events',15,31],['outbox','storage_outbox',7,15]] as const;
  for(const [name,table,before,after] of phases)await t.test('K03/kill-'+name,async()=>{for(const [timing,mask] of [['BEFORE',before],['AFTER',after]] as const)await f.phase(f.fresh(),table,timing,mask);});
  await t.test('K03/committed-recreated',async()=>{
   const c=f.fresh(),writer=await f.spawn();let saved:Awaited<ReturnType<typeof f.request>>;
   try{saved=await f.request(writer,c);assert.equal(saved.status,200);assert.equal(saved.body.status,'saved-here');await f.effects(c,1);f.positives.save++;f.positives.write++;}finally{await f.kill(writer);}
   const reader=await f.spawn();try{const lookup=await f.request(reader,c,'lookup');assert.deepEqual(lookup.body.result,saved!.body);f.positives.read++;
    const response=onceRead(reader.child);reader.child.send({kind:'read',ref:await f.ref(c)});const record=await response;assert.equal(record.kind,'read');assert.equal(record.value.value,c.assertion.value);assert.equal(record.value.subject,c.assertion.subject);assert.equal(record.value.assertedBy,f.scope.actorId);assert.equal(record.value.source.sourceId,c.assertion.sourceId);assert.equal(record.value.revision,1);f.positives.read++;await f.effects(c,1);
   }finally{await f.kill(reader);}
  });
  await t.test('K03/response-after-commit',async()=>{
   const c=f.fresh(),before=await f.snapshot(),held=latch(),reached=latch();let pid=0,ack=false;
   const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached.release();await held.wait;}}));
   const first=f.request(service,c).then(r=>{ack=true;return r;});first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);try{assert.equal(ack,false);await f.effects(c,0);assert.deepEqual(await f.snapshot(),before);}finally{held.release();}
   const result=await first;assert.equal(result.status,200);assert.equal(result.body.status,'saved-here');assert.equal(ack,true);await f.effects(c,1);const receipt=(await f.f.admin.query('SELECT receipt_id,event_id,job_id FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0];assert.equal(receipt.receipt_id,result.body.receiptId);await f.content(c);f.positives.save++;f.positives.write++;
   // The exact outbox is durable and still pending: derived processing has not
   // run, so a fresh canonical reader proves independence of enrichment.
   assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_outbox WHERE command_key=$1',[c.key])).rows[0].n,1);
   console.log(JSON.stringify({measurement:'atomic-response-order',backendPid:pid,externalRowsBeforeCommit:0,savedResponseBeforeCommit:false,receiptConfirmed:true,exactCanonicalReadable:true,pendingDerivedOutbox:1}));
   await exerciseAtomicDerivedOutage(f.positives,f.violations);
  });
 });
 await family('K06',async(t,f)=>{
  await t.test('K06/same-key-identical-concurrent',async()=>{
   const c=f.fresh(),held=latch(),reached=latch();let pid=0;const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached.release();await held.wait;}}));
   const first=f.request(service,c);first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);const other=await f.serve(),second=f.request(other,c);second.catch(()=>{});try{await f.blocked(pid);await f.effects(c,0);}finally{held.release();}
   const r=await first;assert.equal(r.body.status,'saved-here');assert.deepEqual(await second,r);await f.effects(c,1);await f.content(c);f.positives.save++;f.positives.write++;f.positives.read++;
  });
  await t.test('K06/same-key-changed-concurrent',async()=>{
   const c=f.fresh(),held=latch(),reached=latch();let pid=0;const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached.release();await held.wait;}}));
   const first=f.request(service,c);first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);const wrong={...c,assertion:{...c.assertion,value:c.assertion.value+' changed'}},second=f.request(f.normal,wrong);second.catch(()=>{});try{await f.blocked(pid);}finally{held.release();}
   assert.equal((await first).body.status,'saved-here');const bad=await second;assert.equal(bad.status,409);assert.equal(bad.body.error,'IDEMPOTENCY_CONFLICT');assert.equal(bad.body.replayAllowed,false);f.positives.deny++;f.positives.conflict++;await f.effects(c,1);await f.content(c);f.positives.save++;f.positives.write++;
   const task=await f.f.task('maintenance');
   for(const changed of [{...c,targetId:randomUUID()},{...c,sessionId:task.binding.sessionId},{...c,expiresAt:new Date(Date.now()+25_000).toISOString()},wrong,{...c,assertion:{...c.assertion,intent:'propose'}}])for(const op of ['save','lookup']){const result=await f.request(f.normal,changed,op);assert.equal(result.status,op==='save'?409:403);assert.equal(result.body.error,'IDEMPOTENCY_CONFLICT');assert.equal(result.body.replayAllowed,false);f.positives.deny++;f.positives.conflict++;}
   const before=await f.snapshot();for(const bad of [{...c,expectedRevision:1},{...c,action:'correct'},{...c,audience:[]},{...c,generation:randomUUID()},{...c,actorId:f.scope.actorId}]){const r=await f.request(f.normal,bad);assert.ok(r.status>=400);assert.equal(r.body.status,'not-saved');f.positives.deny++;}assert.deepEqual(await f.snapshot(),before);
  });
  await t.test('K06/recreated-retry',async()=>{
   const c=f.fresh(),writer=await f.spawn();let saved:Awaited<ReturnType<typeof f.request>>;try{saved=await f.request(writer,c);assert.equal(saved.body.status,'saved-here');f.positives.save++;f.positives.write++;}finally{await f.kill(writer);}
   const recreated=await f.spawn();try{assert.deepEqual(await f.request(recreated,c),saved!);assert.deepEqual((await f.request(recreated,c,'lookup')).body.result,saved!.body);f.positives.read+=2;await f.effects(c,1);}finally{await f.kill(recreated);}
   const other=await f.f.scopeFor(f.f.actors[1]),src=await f.makeSource(other),independent={...f.fresh(src),key:c.key};const r=await f.request(f.normal,independent,'save',other);assert.equal(r.body.status,'saved-here');f.positives.save++;f.positives.write++;await f.effects(independent,1,other);await f.effects(c,1);
   const secondary=await f.f.scopeFor(f.f.actors[0],f.f.spaces.secondary),secondSource=await f.makeSource(secondary),inOtherSpace={...f.fresh(secondSource),key:c.key};assert.equal((await f.request(f.normal,inOtherSpace,'save',secondary)).body.status,'saved-here');f.positives.save++;f.positives.write++;await f.effects(inOtherSpace,1,secondary);
  });
  await t.test('K06/exact-effect-counts',async()=>{
   const c=f.fresh(),saved=await f.request(f.normal,c);assert.equal(saved.body.status,'saved-here');f.positives.save++;f.positives.write++;for(let i=0;i<3;i++){assert.deepEqual(await f.request(f.normal,c),saved);await f.effects(c,1);f.positives.read++;}
   const receipt=(await f.f.admin.query('SELECT * FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0],event=(await f.f.admin.query('SELECT * FROM fabric.storage_save_events WHERE command_key=$1',[c.key])).rows[0],job=(await f.f.admin.query('SELECT * FROM fabric.storage_outbox WHERE command_key=$1',[c.key])).rows[0],command=(await f.f.admin.query('SELECT * FROM fabric.storage_commands WHERE command_key=$1',[c.key])).rows[0];assert.equal(receipt.receipt_id,saved.body.receiptId);assert.equal(receipt.receipt_id,command.receipt_id);assert.equal(receipt.event_id,event.event_id);assert.equal(receipt.job_id,event.job_id);assert.equal(receipt.job_id,job.job_id);assert.equal(event.target_id,c.targetId);assert.equal(job.target_id,c.targetId);
   await exerciseAtomicMutationNamespaces(f.positives,f.violations);
  });
 });
 await family('K07',async(t,f)=>{
  async function settled(commit:boolean){
   const c=f.fresh(),before=await f.snapshot(),held=latch(),reached=latch();let pid=0,ack=false;
   const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached.release();await held.wait;if(!commit)await tx.query('SELECT 1/0');}}));
   const first=f.request(service,c).then(r=>{ack=true;return r;});first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);assert.equal(ack,false);
   const caller=await f.serve(),lookup=f.request(caller,c,'lookup');lookup.catch(()=>{});try{await f.blocked(pid);assert.equal(ack,false);await f.effects(c,0);}finally{held.release();}
   const r=await first,found=await lookup;assert.equal(found.status,200);f.positives.read++;if(commit){assert.equal(r.status,200);assert.equal(r.body.status,'saved-here');assert.deepEqual(found.body.result,r.body);await f.effects(c,1);await f.content(c);f.positives.save++;f.positives.write++;}else{assert.equal(r.body.status,'not-saved');assert.equal(found.body.status,'absent-safe');assert.equal(found.body.replayAllowed,false);f.positives.deny++;await f.effects(c,0);assert.deepEqual(await f.snapshot(),before);}
   const after=await f.snapshot();assert.deepEqual(await f.request(caller,c,'lookup'),found);f.positives.read++;assert.deepEqual(await f.snapshot(),after);
  }
  await t.test('K07/observed-commit-wait',()=>settled(true));
  await t.test('K07/observed-rollback-wait',()=>settled(false));
  await t.test('K07/observed-timeout',async()=>{
   const c=f.fresh(),held=latch(),reached=latch();let pid=0;const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);reached.release();await held.wait;}}));
   const first=f.request(service,c);first.catch(()=>{});await Promise.race([first,reached.wait]);assert.ok(pid);try{const lookup=f.request(f.normal,c,'lookup');lookup.catch(()=>{});await f.blocked(pid);unknown(f,await lookup,c);f.positives.read++;assert.equal(await f.journal.current(f.scope.tenantId,f.scope.spaceId),undefined);await f.effects(c,0);}finally{held.release();}
   const r=await first;assert.equal(r.body.status,'saved-here');const found=await f.request(f.normal,c,'lookup');assert.deepEqual(found.body.result,r.body);f.positives.read++;f.positives.save++;f.positives.write++;await f.effects(c,1);
  });
  await t.test('K07/lost-commit-ack',async()=>{
   for(const mode of ['commit','rollback'] as const){
    const c=f.fresh(),before=await f.snapshot(),anchor=(await f.journal.state(f.scope.tenantId,f.scope.spaceId))!.anchor,proxy=await startCommitWireProxy(f.f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
    const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
    try{
     const wire=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.f.verifier.bindingFor});let calls=0,typed=0,wrote=false;
     const routed:AsyncUnitOfWork={withScope:async(s,work)=>{try{return await (++calls===2?wire:f.f.uow).withScope(s,work);}catch(e){if(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')typed++;throw e;}}};
     const service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);wrote=true;}},routed)),r=await f.request(service,c);unknown(f,r,c,true);assert.equal(wrote,true);assert.equal(typed,1);assert.equal(proxy.dropped(),mode==='commit'?1:0);assert.equal(proxy.requestsDropped(),mode==='rollback'?1:0);assert.equal(await f.journal.current(f.scope.tenantId,f.scope.spaceId),undefined);
     const caller=await f.spawn();try{const recovered=await f.request(caller,c,'lookup');assert.equal(recovered.status,200);f.positives.read++;if(mode==='commit'){assert.equal(recovered.body.status,'committed');assert.equal(recovered.body.result.status,'saved-here');await f.effects(c,1);await f.content(c);assert.deepEqual((await f.request(caller,c)).body,recovered.body.result);f.positives.read++;f.positives.save++;f.positives.write++;assert.equal((await f.journal.state(f.scope.tenantId,f.scope.spaceId))!.anchor.epoch,anchor.epoch+1);}else{assert.equal(recovered.body.status,'absent-safe');assert.equal(recovered.body.replayAllowed,false);await f.effects(c,0);assert.deepEqual(await f.snapshot(),before);assert.deepEqual((await f.journal.state(f.scope.tenantId,f.scope.spaceId))!.anchor,anchor);}
      const after=await f.snapshot();assert.deepEqual(await f.request(caller,c,'lookup'),recovered);f.positives.read++;assert.deepEqual(await f.snapshot(),after);
     }finally{await f.kill(caller);}
     console.log(JSON.stringify({measurement:'atomic-wire-outcome',mode,canonicalWriteObserved:wrote,typedUnknown:typed,commitAcknowledgementsDropped:proxy.dropped(),commitRequestsDropped:proxy.requestsDropped(),originalKeyRecovered:true,replayAllowed:false}));
    }finally{await pool.end();await proxy.close();}
   }
  });
  await t.test('K07/serialized-absence-no-replay',async()=>{
   const c=f.fresh(),before=await f.snapshot(),blocker=await f.f.admin.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',f.scope.tenantId,f.scope.spaceId,f.scope.actorId,c.key])]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    const original=f.request(f.normal,c,'lookup'),changed=f.request(f.normal,{...c,assertion:{...c.assertion,value:'changed fingerprint'}},'lookup');original.catch(()=>{});changed.catch(()=>{});await f.blocked(pid,2);for(const r of await Promise.all([original,changed]))unknown(f,r,c);f.positives.read+=2;assert.deepEqual(await f.snapshot(),before);await blocker.query('ROLLBACK');const found=await f.request(f.normal,c,'lookup');assert.deepEqual(found.body,{schemaVersion:1,status:'absent-safe',key:c.key,replayAllowed:false,nextAction:'inspect-current-authority'});f.positives.read++;await f.effects(c,0);assert.deepEqual(await f.snapshot(),before);
   }finally{await blocker.query('ROLLBACK');blocker.release();}
   for(const spoof of [Object.assign(new Error('UNKNOWN_COMMIT'),{code:'UNKNOWN_COMMIT'}),Object.assign(new Error('timeout'),{code:'55P03'})]){const c=f.fresh(),before=await f.snapshot(),service=await f.serve(f.repo({afterCanonicalWrite:async tx=>{await canonicalRows(f,tx,c);throw spoof;}})),r=await f.request(service,c);assert.equal(r.status,403);assert.equal(r.body.status,'not-saved');assert.equal(r.body.error,'UNAUTHORIZED');assert.equal(r.body.resolver,undefined);f.positives.deny++;await f.effects(c,0);assert.deepEqual(await f.snapshot(),before);assert.equal((await f.request(f.normal,c,'lookup')).body.status,'absent-safe');f.positives.read++;}
   const kept=f.fresh(),saved=await f.request(f.normal,kept);assert.equal(saved.body.status,'saved-here');f.positives.save++;f.positives.write++;const scope=await f.f.scopeFor(),binding=f.f.verifier.bindingFor(scope),params=[binding.issuer,binding.subject,binding.sessionId],current=(await f.f.admin.query('SELECT revoked_at FROM fabric.identity_sessions WHERE issuer=$1 AND subject=$2 AND sid=$3',params)).rows[0];assert.equal(current.revoked_at,null);
   try{await f.f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=clock_timestamp() WHERE issuer=$1 AND subject=$2 AND sid=$3',params);const r=await f.request(f.normal,kept,'lookup');assert.equal(r.status,403);assert.equal(r.body.status,'not-saved');assert.equal(r.body.result,undefined);f.positives.deny++;await f.effects(kept,1);}finally{await f.f.admin.query('UPDATE fabric.identity_sessions SET revoked_at=NULL WHERE issuer=$1 AND subject=$2 AND sid=$3',params);}
   assert.deepEqual((await f.request(f.normal,kept,'lookup')).body.result,saved.body);f.positives.read++;
   assert.equal((await new SourceRevocationRepository(f.f.uow,f.journal,f.f.native).revoke(f.scope,{key:randomUUID(),sessionId:f.source.c.sessionId,expiresAt:new Date(Date.now()+15_000).toISOString(),source:{id:f.source.result.source.id,revision:f.source.result.source.revision,witness:f.source.result.source.witness}})).status,'committed');f.positives.write++;await f.denied(async()=>f.repo().read(f.scope,await f.ref(kept)),['RETENTION_RESTRICTED']);
  });
 });
 if(!failed)observe({schemaVersion:1,measurement:'storage-observations',suite,positives:totals,violations});
}
function onceRead(child:import('node:child_process').ChildProcess){return new Promise<{kind:string;value:any}>((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const listener=(m:unknown)=>{clearTimeout(timer);child.off('exit',exit);resolve(m as any);};const exit=()=>{clearTimeout(timer);child.off('message',listener);reject(new Error('Recreated reader exited'));};child.once('message',listener);child.once('exit',exit);timer=setTimeout(()=>{child.off('message',listener);child.off('exit',exit);reject(new Error('Recreated reader timeout'));},3000);});}
