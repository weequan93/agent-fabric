import type { ComponentTest } from './canonical-component.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createStorageFixture } from './pg-fixture.js';
import { enrollAuthority } from './authority-fixture.js';
import { emitObservations } from './observations.js';
import { startCommitWireProxy } from './commit-wire-proxy.js';
import { migrateStorageKnowledgeCorrection,installedOwnerSnapshot } from '../../src/migration.js';
import { CryptoStore } from '../../src/crypto-store.js';
import { KnowledgeSaveRepository,sourceNarrativeDigest,type KnowledgeSaveHooks } from '../../src/knowledge-save.js';
import { KnowledgeStatusAdmission } from '../../src/knowledge-status.js';
import { EpochWitnessJournal,type OwnedAnchorRoot } from '../../src/epoch-journal.js';
import { startKnowledgeCommandHttp } from '../../src/command-http.js';
import { demand,FoundationError } from '../../src/errors.js';
import { AuthenticatedUnitOfWork,type AsyncUnitOfWork,type VerifiedScope } from '../../src/owners.js';
import { PostgresUnitOfWork } from '../../../g1-foundations/src/postgres-uow.js';
import { SourceRevocationRepository } from '../../src/source-revocation.js';
import type { SaveCommand } from '../../src/contracts.js';

/** Fixed nonempty component/full-suite registration; real IdP, HTTP, restricted
 * PG clients, exact canonical rows, original locks and actual COMMIT transport. */
export function registerCommandRecoveryTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations){
 return register('COMMAND-RECOVERY/behavior / authenticated HTTP and serialized original-key outcomes',async t=>{
  const f=await createStorageFixture(),options={ownedSyntheticDatabase:true as const,owner:f.owner,instance:f.instance,root:f.root};
  const key=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
  let saves=0,reads=0,writes=0,denials=0,conflicts=0,leaks=0,mutations=0,duplicates=0,starts=0;
  const services:Awaited<ReturnType<typeof startKnowledgeCommandHttp>>[]=[];
  try{
   await migrateStorageKnowledgeCorrection(f.admin,options);const a=await enrollAuthority(f),scope=f.scope;
   const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!;
   const journal=new EpochWitnessJournal(root);await journal.install(scope.tenantId,scope.spaceId,a.anchors.get(a.key(scope))!);
   const keys={resolve:async()=>({keyId,generation})},crypto=()=>new CryptoStore({resolve:async()=>({dataKey:key,digestKey})});
   const repo=(hooks:KnowledgeSaveHooks={},uow:AsyncUnitOfWork=f.uow)=>{const c=crypto();return new KnowledgeSaveRepository(uow,new EpochWitnessJournal(root),f.native,c,keys,new KnowledgeStatusAdmission(c),hooks);};
   const task=await f.task('maintenance'),subject='wire decision '+randomUUID(),value='saved bytes '+randomUUID();
   const sourceCommand={schemaVersion:1,action:'source',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+40_000).toISOString(),title:subject,uri:null,narrative:value,contentDigest:sourceNarrativeDigest(value),retentionExpiresAt:new Date(Date.now()+58_000).toISOString(),saveReusable:true};
   const source=await repo().source(scope,sourceCommand);demand(source.status==='source-accepted');writes++;
   const fresh=():SaveCommand=>({schemaVersion:1,action:'save',sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+35_000).toISOString(),assertion:{subject,value,sourceId:source.source.id,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(sourceCommand.retentionExpiresAt)-1000).toISOString(),classification:'group',intent:'assert',checkId:null}});
   const serve=async(r=repo())=>{const service=await startKnowledgeCommandHttp(f.verifier,r);services.push(service);return service;};
   const path=(s:VerifiedScope,op='save')=>`/v1/tenants/${s.tenantId}/spaces/${s.spaceId}/knowledge/${op}`;
   const request=async(service:Awaited<ReturnType<typeof serve>>,command:unknown,op='save',s=scope,token=f.tokens.get(s.actorId)!)=>{
    const r=await fetch(service.url+path(s,op),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(9000)});
    assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json() as Record<string,any>};
   };
   const normal=await serve(),oldOwner=await installedOwnerSnapshot(f.admin),resourceBefore=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;
   const tables=['storage_knowledge_revisions','storage_knowledge_admissions','storage_save_receipts','storage_save_events','storage_commands','storage_outbox','storage_head_publications','storage_current_heads','storage_authority_epoch'];
   const snapshot=()=>Promise.all(tables.map(async n=>[n,(await f.admin.query('SELECT * FROM fabric.'+n)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
   const count=async(c:SaveCommand,n:number)=>{for(const table of tables.filter(x=>!['storage_knowledge_admissions','storage_current_heads','storage_authority_epoch'].includes(x))){
    const observed=(await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE actor_id=$1 AND command_key=$2',[scope.actorId,c.key])).rows[0].n;if(observed!==n)duplicates++;assert.equal(observed,n,table);
   }};
   const blocked=async(pid:number)=>{const deadline=Date.now()+1500;let observed=false;while(Date.now()<deadline){if((await f.admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed,'Observed actual PostgreSQL lock contention');};
   const unknown=(r:Awaited<ReturnType<typeof request>>,c:SaveCommand,typed=false)=>{
    assert.equal(r.status,503,JSON.stringify(r));assert.equal(r.body.status,'unknown');assert.equal(r.body.key,c.key);assert.equal(r.body.replayAllowed,false);assert.equal(r.body.nextAction,'original-key-lookup');assert.deepEqual(r.body.resolver,{method:'POST',path:path(scope,'lookup')});if(typed)assert.equal(r.body.error,'UNKNOWN_COMMIT');
   };
   const denied=(r:Awaited<ReturnType<typeof request>>,error?:string)=>{if(r.status===200||r.body.status==='unknown')mutations++;assert.ok([400,403,409].includes(r.status),JSON.stringify(r));assert.equal(r.body.status,'not-saved');if(error)assert.equal(r.body.error,error);assert.equal(r.body.replayAllowed,false);assert.equal(JSON.stringify(r.body).includes(value),false);denials++;};
   const verifyContent=async(c:SaveCommand)=>{const row=(await f.admin.query('SELECT witness FROM fabric.storage_knowledge_revisions WHERE id=$1 AND revision=1',[c.targetId])).rows[0];demand(row);assert.equal((await repo().read(scope,{class:'knowledge',id:c.targetId,revision:1,witness:row.witness})).value,c.assertion.value);reads++;};
   await t.test('COMMAND-RECOVERY/http-original-recreated',async()=>{
    const c=fresh(),r=await request(normal,c);assert.equal(r.status,200);assert.equal(r.body.status,'saved-here');writes++;saves++;await count(c,1);await verifyContent(c);
    const recreated=await serve();assert.deepEqual(await request(recreated,c),r);reads++;
    const lookup=await request(recreated,c,'lookup');assert.equal(lookup.status,200);assert.deepEqual(lookup.body,{schemaVersion:1,status:'committed',key:c.key,result:r.body});reads++;await count(c,1);
   });
   await t.test('COMMAND-RECOVERY/http-pending-review',async()=>{
    const c={...fresh(),assertion:{...fresh().assertion,intent:'propose' as const}},saved=await request(normal,c);assert.equal(saved.status,200);assert.equal(saved.body.status,'pending-review');writes++;await count(c,1);
    const lookup=await request(normal,c,'lookup');assert.equal(lookup.status,200);assert.deepEqual(lookup.body.result,saved.body);reads++;assert.equal((await f.admin.query('SELECT status FROM fabric.storage_knowledge_revisions WHERE command_key=$1',[c.key])).rows[0].status,'proposed');
   });
   await t.test('COMMAND-RECOVERY/http-closed-auth-boundaries',async()=>{
    const c=fresh(),before=await snapshot();
    for(const bad of [{...c,actorId:scope.actorId},{...c,payerId:scope.payerId},{...c,verified:true},{...c,generation},{...c,authorityRevision:1},{...c,assertion:{...c.assertion,verified:true}},{...c,key:'not-uuid'},{...c,expectedRevision:1},{...c,action:'correct'},{...c,expiresAt:'yesterday'}])denied(await request(normal,bad));
    for(const token of ['invalid',f.tokens.get(f.foreignActor)!])denied(await request(normal,c,'lookup',scope,token));
    const reader=await f.scopeFor(f.actors[2]);denied(await request(normal,c,'save',reader));denied(await request(normal,c,'lookup',reader));
    denied(await request(normal,c,'lookup',await f.scopeFor(f.actors[0],f.spaces.secondary)));
    for(const init of [{method:'GET'},{method:'POST',headers:{authorization:'Bearer '+f.tokens.get(scope.actorId),'content-type':'application/json'},body:'{'},{method:'POST',headers:{authorization:'Bearer '+f.tokens.get(scope.actorId),'content-type':'text/plain'},body:JSON.stringify(c)}]){
     const r=await fetch(normal.url+path(scope),init);assert.ok([400,403,404].includes(r.status));denials++;
    }
    const oversized=await fetch(normal.url+path(scope),{method:'POST',headers:{authorization:'Bearer '+f.tokens.get(scope.actorId),'content-type':'application/json'},body:'x'.repeat(1_048_577)});assert.equal(oversized.status,400);assert.equal((await oversized.json() as {error:string}).error,'INVALID_SCHEMA');denials++;
    const malformed=await fetch(normal.url+path(scope),{method:'POST',headers:{authorization:'Bearer '+f.tokens.get(scope.actorId),'content-type':'application/json'},body:Buffer.from([0xff])});assert.equal(malformed.status,400);assert.equal((await malformed.json() as {error:string}).error,'INVALID_SCHEMA');denials++;
    const badRoute=await fetch(normal.url+path(scope)+'?scope=other',{method:'POST'});assert.equal(badRoute.status,404);denials++;
    assert.deepEqual(await snapshot(),before);await count(c,0);
   });
   await t.test('COMMAND-RECOVERY/changed-binding-and-namespaces',async()=>{
    const c=fresh(),r=await request(normal,c);assert.equal(r.status,200);writes++;saves++;
    const otherTask=await f.task('maintenance');
    for(const changed of [{...c,targetId:randomUUID()},{...c,sessionId:otherTask.binding.sessionId},{...c,expiresAt:new Date(Date.now()+30_000).toISOString()},{...c,assertion:{...c.assertion,value:'changed'}},{...c,assertion:{...c.assertion,intent:'propose'}}]){
     for(const op of ['save','lookup'])denied(await request(normal,changed,op),'IDEMPOTENCY_CONFLICT');conflicts++;
    }
    await count(c,1);assert.deepEqual((await request(normal,c,'lookup')).body.result,r.body);reads++;
    // Actor is part of the original namespace, never borrowed from command JSON.
    const other=await f.scopeFor(f.actors[1]),otherNative=await f.task('maintenance',other),independent={...fresh(),key:c.key,sessionId:otherNative.binding.sessionId};
    const saved=await request(normal,independent,'save',other);assert.equal(saved.status,200,JSON.stringify(saved));saves++;writes++;
    assert.deepEqual((await request(normal,independent,'lookup',other)).body.result,saved.body);reads++;
    denied(await request(normal,c,'lookup',other));
    assert.equal((await f.admin.query('SELECT count(DISTINCT actor_id)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0].n,2);
   });
   await t.test('COMMAND-RECOVERY/actual-lost-commit-and-rollback',async()=>{
    for(const mode of ['commit','rollback'] as const){
     const c=fresh(),before=await snapshot(),anchor=(await journal.state(scope.tenantId,scope.spaceId))!.anchor;
     const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000});
     const transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',client=>client.on('error',transport));
     try{
      const wire=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});let calls=0,typed=0;
      // #bound is a read-only fingerprint transaction. Intercept the second,
      // actual canonical UoW COMMIT, leaving installed Foundation untouched.
      const routed:AsyncUnitOfWork={withScope:async(s,work)=>{const selected=++calls===2?wire:f.uow;try{return await selected.withScope(s,work);}catch(e){if(e instanceof FoundationError&&e.code==='UNKNOWN_COMMIT')typed++;throw e;}}};
      const service=await serve(repo({},routed)),r=await request(service,c);unknown(r,c,true);assert.equal(typed,1);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);
      assert.equal(proxy.dropped(),mode==='commit'?1:0);assert.equal(proxy.requestsDropped(),mode==='rollback'?1:0);
      if(mode==='rollback'){const retry=await request(service,c);denied(retry,'AUTHORITY_UNAVAILABLE');await count(c,0);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);}
      const recreated=await serve(),recovered=await request(recreated,c,'lookup');assert.equal(recovered.status,200);reads++;
      if(mode==='commit'){
       assert.equal(recovered.body.status,'committed');assert.equal(recovered.body.result.status,'saved-here');await count(c,1);await verifyContent(c);writes++;saves++;
       assert.equal((await journal.state(scope.tenantId,scope.spaceId))!.anchor.epoch,anchor.epoch+1);
       assert.deepEqual((await request(recreated,c)).body,recovered.body.result);reads++;await count(c,1);
      }else{
       assert.deepEqual(recovered.body,{schemaVersion:1,status:'absent-safe',key:c.key,replayAllowed:false,nextAction:'inspect-current-authority'});await count(c,0);assert.deepEqual(await snapshot(),before);assert.deepEqual((await journal.state(scope.tenantId,scope.spaceId))!.anchor,anchor);
      }
      const unchanged=await snapshot();assert.deepEqual(await request(recreated,c,'lookup'),recovered);reads++;assert.deepEqual(await snapshot(),unchanged);
     }finally{await pool.end();await proxy.close();}
    }
   });
   await t.test('COMMAND-RECOVERY/serialized-commit-rollback',async()=>{
    for(const commit of [true,false]){
     const c=fresh(),before=await snapshot();let hit!:()=>void,release!:()=>void,pid=0;
     const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
     const service=await serve(repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0]?.['n'],1);hit();await gate;if(!commit)throw new Error('Definite pre-COMMIT fixture rollback');}}));
     let acknowledged=false;const first=request(service,c).then(r=>{acknowledged=true;return r;});first.catch(()=>{});await Promise.race([reached,first]);assert.ok(pid);assert.equal(acknowledged,false);await count(c,0);
     const lookup=request(normal,c,'lookup');lookup.catch(()=>{});try{await blocked(pid);assert.equal(acknowledged,false);await count(c,0);}finally{release();}
     const saved=await first,recovered=await lookup;assert.equal(recovered.status,200);reads++;
     if(commit){assert.equal(saved.status,200);assert.equal(saved.body.status,'saved-here');assert.deepEqual(recovered.body.result,saved.body);await count(c,1);await verifyContent(c);saves++;writes++;}
     else{denied(saved);assert.equal(recovered.body.status,'absent-safe');assert.equal(recovered.body.replayAllowed,false);await count(c,0);assert.deepEqual(await snapshot(),before);}
     const settled=await snapshot();assert.deepEqual(await request(normal,c,'lookup'),recovered);reads++;assert.deepEqual(await snapshot(),settled);
    }
   });
   await t.test('COMMAND-RECOVERY/lock-timeout-stays-unknown',async()=>{
    const c=fresh();let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const service=await serve(repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}));
    const first=request(service,c);first.catch(()=>{});await Promise.race([reached,first]);assert.ok(pid);
    try{const lookup=request(normal,c,'lookup');lookup.catch(()=>{});await blocked(pid);unknown(await lookup,c);reads++;assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined);await count(c,0);}finally{release();}
    const saved=await first;assert.equal(saved.status,200);writes++;saves++;const result=await request(normal,c,'lookup');assert.deepEqual(result.body.result,saved.body);reads++;await count(c,1);
   });
   await t.test('COMMAND-RECOVERY/original-lock-excludes-digest',async()=>{
    const c=fresh(),before=await snapshot(),blocker=await f.admin.connect();const keyLock=JSON.stringify(['storage-epoch-original',scope.tenantId,scope.spaceId,scope.actorId,c.key]);
    try{
     await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[keyLock]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
     const left=request(normal,c,'lookup'),right=request(normal,{...c,assertion:{...c.assertion,value:'different fingerprint'}},'lookup');left.catch(()=>{});right.catch(()=>{});
     await blocked(pid);const timeout=await Promise.all([left,right]);for(const r of timeout)unknown(r,c);reads+=2;assert.deepEqual(await snapshot(),before);
     await blocker.query('ROLLBACK');const absent=await request(normal,c,'lookup');assert.equal(absent.body.status,'absent-safe');assert.equal(absent.body.replayAllowed,false);reads++;await count(c,0);assert.deepEqual(await snapshot(),before);
    }finally{await blocker.query('ROLLBACK');blocker.release();}
   });
   await t.test('COMMAND-RECOVERY/same-key-concurrent-http',async()=>{
    const c=fresh();let hit!:()=>void,release!:()=>void,pid=0;const reached=new Promise<void>(r=>hit=r),gate=new Promise<void>(r=>release=r);
    const service=await serve(repo({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);hit();await gate;}}));
    const first=request(service,c);first.catch(()=>{});await Promise.race([reached,first]);const duplicate=request(normal,c),changed=request(normal,{...c,assertion:{...c.assertion,value:'wrong original'}});duplicate.catch(()=>{});changed.catch(()=>{});
    try{await blocked(pid);}finally{release();}
    const saved=await first;assert.equal(saved.status,200);assert.deepEqual(await duplicate,saved);denied(await changed,'IDEMPOTENCY_CONFLICT');conflicts++;reads++;saves++;writes++;await count(c,1);
   });
   await t.test('COMMAND-RECOVERY/spoofed-unknown-is-denial',async()=>{
    for(const forged of [Object.assign(new Error('UNKNOWN_COMMIT'),{code:'UNKNOWN_COMMIT'}),Object.assign(new Error('timeout'),{code:'55P03'}),{code:'UNKNOWN_COMMIT',message:value}]){
     const c=fresh(),before=await snapshot(),service=await serve(repo({afterCanonicalWrite:async()=>{throw forged;}}));const r=await request(service,c);denied(r,'UNAUTHORIZED');assert.equal(r.body.resolver,undefined);await count(c,0);assert.deepEqual(await snapshot(),before);
     const absent=await request(normal,c,'lookup');assert.equal(absent.body.status,'absent-safe');assert.equal(absent.body.replayAllowed,false);reads++;
    }
   });
   await t.test('COMMAND-RECOVERY/expired-original-receipt',async()=>{
    const c={...fresh(),expiresAt:new Date(Date.now()+1500).toISOString()},saved=await request(normal,c);assert.equal(saved.status,200,JSON.stringify(saved));saves++;writes++;
    await f.admin.query('SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp())))+0.01)',[c.expiresAt]);
    const recovered=await request(normal,c,'lookup');assert.deepEqual(recovered.body.result,saved.body);reads++;await count(c,1);
    const expired={...fresh(),expiresAt:new Date(Date.now()-1).toISOString()},before=await snapshot();denied(await request(normal,expired),'EXPIRED_COMMAND');assert.deepEqual(await snapshot(),before);await count(expired,0);
   });
   await t.test('COMMAND-RECOVERY/read-committed-required',async()=>{
    const c=fresh(),before=await snapshot();
    const pool=new pg.Pool({connectionString:f.fixtureDsn('controller'),max:1,options:'-c default_transaction_isolation=repeatable\\ read'});
    try{const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor}),service=await serve(repo({},uow));denied(await request(service,c),'REQUIRED_CAPABILITY_UNSUPPORTED');await count(c,0);assert.deepEqual(await snapshot(),before);}finally{await pool.end();}
   });
   await t.test('COMMAND-RECOVERY/expiry-after-original-wait',async()=>{
    const c={...fresh(),expiresAt:new Date(Date.now()+500).toISOString()},before=await snapshot(),blocker=await f.admin.connect();
    try{await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['storage-epoch-original',scope.tenantId,scope.spaceId,scope.actorId,c.key])]);const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
     const save=request(normal,c);save.catch(()=>{});await blocked(pid);await blocker.query('SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp())))+0.01)',[c.expiresAt]);await blocker.query('ROLLBACK');denied(await save,'EXPIRED_COMMAND');await count(c,0);assert.deepEqual(await snapshot(),before);
     const absent=await request(normal,c,'lookup');assert.equal(absent.body.status,'absent-safe');assert.equal(absent.body.replayAllowed,false);reads++;
    }finally{await blocker.query('ROLLBACK');blocker.release();}
   });
   await t.test('COMMAND-RECOVERY/current-source-and-native',async()=>{
    const native=await f.task('maintenance'),sc={...sourceCommand,key:randomUUID(),targetId:randomUUID(),sessionId:native.binding.sessionId,expiresAt:new Date(Date.now()+15_000).toISOString()};
    const sr=await repo().source(scope,sc);demand(sr.status==='source-accepted');writes++;
    const c={...fresh(),sessionId:native.binding.sessionId,assertion:{...fresh().assertion,sourceId:sr.source.id}},saved=await request(normal,c);assert.equal(saved.status,200);saves++;writes++;
    const revoked=await new SourceRevocationRepository(f.uow,journal,f.native).revoke(scope,{key:randomUUID(),sessionId:native.binding.sessionId,expiresAt:new Date(Date.now()+10_000).toISOString(),source:{id:sr.source.id,revision:sr.source.revision,witness:sr.source.witness}});assert.equal(revoked.status,'committed');writes++;
    // A durable receipt remains metadata, but its source audience still must be
    // current. A source restriction does not itself grant disclosure of bytes.
    const lookup=await request(normal,c,'lookup');assert.equal(lookup.status,200);assert.deepEqual(lookup.body.result,saved.body);reads++;
    const row=(await f.admin.query('SELECT witness FROM fabric.storage_knowledge_revisions WHERE id=$1',[c.targetId])).rows[0];await assert.rejects(repo().read(scope,{class:'knowledge',id:c.targetId,revision:1,witness:row.witness}),{code:'RETENTION_RESTRICTED'});denials++;
    await f.native.stop(scope,{sessionId:native.binding.sessionId,key:randomUUID(),expiresAt:new Date(Date.now()+10_000).toISOString(),observedRevision:1});
    denied(await request(normal,c,'lookup'));await count(c,1);
   });
   await t.test('COMMAND-RECOVERY/authority-after-wait',async()=>{
    const c=fresh(),saved=await request(normal,c);assert.equal(saved.status,200,JSON.stringify(saved));saves++;writes++;
    const reader=await f.admin.connect();let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered!:()=>void;const reached=new Promise<void>(r=>entered=r);
    // Pin verified request before membership changes; the installed UoW still
    // has to observe the new authority after its actual row lock wait.
    const currentVerifier={...f.verifier,verify:async(input:Parameters<typeof f.verifier.verify>[0])=>{const s=await f.verifier.verify(input);entered();await gate;return s;}};
    const service=await startKnowledgeCommandHttp(currentVerifier,repo());services.push(service);
    const lookup=request(service,c,'lookup');lookup.catch(()=>{});await reached;
    try{await reader.query('BEGIN');await reader.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[scope.tenantId,scope.spaceId,scope.actorId,JSON.stringify(['task:read','storage:read'])]);const pid=Number((await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);release();await blocked(pid);await reader.query('COMMIT');denied(await lookup);}
    finally{release();await reader.query('ROLLBACK');reader.release();}
    // Do not restore earlier grants or continue serving with a stale scope.
    denied(await request(normal,c,'lookup'));await count(c,1);assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_save_receipts WHERE command_key=$1',[c.key])).rows[0].n,1);
   });
   const resources=(await f.admin.query('SELECT * FROM fabric.model_resource_bindings ORDER BY tenant_id,space_id,resource_id')).rows;starts=resources.filter(r=>!resourceBefore.some(p=>JSON.stringify(p)===JSON.stringify(r))).length;assert.deepEqual(resources,resourceBefore);assert.equal(await installedOwnerSnapshot(f.admin),oldOwner);
   const retained=(await f.admin.query("SELECT row_to_json(k)::text AS data FROM fabric.storage_knowledge_revisions k UNION ALL SELECT row_to_json(c)::text FROM fabric.storage_commands c")).rows;for(const row of retained){if(row.data.includes(value))leaks++;assert.equal(row.data.includes(value),false);assert.equal(row.data.includes(subject),false);}
   observe({schemaVersion:1,measurement:'storage-observations',suite:'command-recovery',positives:{save:saves,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:conflicts,propagate:0,backup:0,owner:1,harness:0},violations:{unauthorizedDisclosure:leaks,unauthorizedMutation:mutations,silentLostUpdate:0,duplicateCanonicalEffect:duplicates,restrictedResurrection:0,askComputerStart:starts}});
  }finally{const closed=await Promise.allSettled(services.map(s=>s.close()));key.fill(0);digestKey.fill(0);await f.close();const failures=closed.filter(r=>r.status==='rejected');if(failures.length)throw new AggregateError(failures.map(r=>(r as PromiseRejectedResult).reason),'HTTP fixture cleanup failed');}
 });
}
