import pg from 'pg';
import {AuthenticatedUnitOfWork} from '../../src/owners.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {DependencyGraphRepository} from '../../src/dependency-graph.js';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAuthorityRouteFixture} from './authority-route-fixture.js';
import {ForgetWorkRepository} from '../../src/forget-work.js';
import {VolumeDraftRepository} from '../../src/volume-drafts.js';
import {accountingSnapshot} from './accounting-fixture.js';
import type {AtomicVerificationFixture} from './atomic-verification-fixture.js';
const latch=()=>{let release!:()=>void;const wait=new Promise<void>(r=>release=r);return {wait,release};};
const stable=(v:unknown)=>{const h=createHash('sha256').update(JSON.stringify(v)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};

/** K06's original mutation families use existing enrolled repository/file
 * fixtures. No substitute idempotency implementation or caller-supplied proof.
 * Forget execute explicitly refuses a duplicate; only serialized lookup returns
 * its existing result. Safe absence/unknown never authorizes new-key replay. */
export async function exerciseAtomicMutationNamespaces(count:AtomicVerificationFixture['positives'],violations:AtomicVerificationFixture['violations']){
 const root=process.env['STORAGE_REPO_ROOT'];assert.ok(root);const fixture=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let calls=0;
 await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
  assert.equal(++calls,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));
  let f:Awaited<ReturnType<typeof createAuthorityRouteFixture>>|undefined;
  try{
   for(const [k,v] of Object.entries(state.env))process.env[k]=v;f=await createAuthorityRouteFixture();const x=await f.core(f.f.scope),s=x.s,db=f.f.admin;
   async function blocked(pid:number,n=1){const deadline=Date.now()+1400;let rows:Record<string,any>[]=[];do{rows=(await db.query('SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE usename=$1 AND $2=ANY(pg_blocking_pids(pid))',[f!.f.roles.controller,pid])).rows;if(rows.length===n)break;}while(Date.now()<deadline);assert.equal(rows.length,n,'Each original mutation retry waits on the actual writer');console.log(JSON.stringify({measurement:'atomic-mutation-original-lock',blockerPid:pid,pids:rows.map(r=>r.pid),count:n}));}
   async function one(key:string,tables:readonly string[]){for(const table of tables){const n=(await db.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE command_key=$1',[key])).rows[0].n;if(n!==1)violations.duplicateCanonicalEffect++;assert.equal(n,1,table);}}
   const economic=await accountingSnapshot(f.f),resources=(await db.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows;
   const correction={command:{...x.save,action:'correct' as const,key:randomUUID(),expectedRevision:1,assertion:{...x.save.assertion,value:'corrected '+randomUUID()}},prior:x.knowledgeRef};
   {
    const held=latch(),reached=latch();let pid=0;const first=f.canonical({afterCanonicalWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_corrections WHERE command_key=$1',[correction.command.key])).rows[0]?.['n'],1);reached.release();await held.wait;}}).correct(s,correction);first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);
    const second=f.canonical().correct(s,correction),changed=f.canonical().correct(s,{...correction,command:{...correction.command,assertion:{...correction.command.assertion,value:'changed retry'}}});second.catch(()=>{});changed.catch(()=>{});try{await blocked(pid,2);}finally{held.release();}
    const saved=await first;assert.equal(saved.status,'saved-here');assert.deepEqual(await second,saved);assert.equal((await changed).status,'not-saved');assert.deepEqual(await f.canonical().correct(s,correction),saved);count.save++;count.write++;count.read+=2;count.deny++;count.conflict++;
    await one(correction.command.key,['storage_knowledge_revisions','storage_knowledge_corrections','storage_commands','storage_outbox','storage_save_events','storage_save_receipts']);const history=await f.canonical().history(s,x.save.targetId);assert.deepEqual(history.map(k=>k.value),[x.save.assertion.value,correction.command.assertion.value]);count.read++;
   }
   {
    const target=await f.core(s),command={key:randomUUID(),sessionId:target.save.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),entity:target.knowledgeRef},held=latch(),reached=latch();let pid=0;
    const first=new ForgetWorkRepository(f.f.uow,f.journal,f.f.native,{afterPublication:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_forget_work WHERE command_key=$1',[command.key])).rows[0]?.['n'],1);reached.release();await held.wait;}}).forget(s,command);first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);
    const duplicate=f.forget().forget(s,command).then(()=>assert.fail('Duplicate forget execution must refuse'),e=>{assert.equal(e.code,'IDEMPOTENCY_CONFLICT');count.deny++;}),lookup=f.forget().lookup(s,command);duplicate.catch(()=>{});lookup.catch(()=>{});try{await blocked(pid,2);}finally{held.release();}
    const original=await first;assert.equal(original.status,'committed');await duplicate;assert.deepEqual(await lookup,original);assert.deepEqual(await f.forget().lookup(s,command),original);count.forget++;count.write++;count.read+=2;
    await assert.rejects(f.forget().lookup(s,{...command,expiresAt:new Date(Date.now()+20_000).toISOString()}),{code:'IDEMPOTENCY_CONFLICT'});count.conflict++;count.deny++;await one(command.key,['storage_forget_work','storage_tombstone_publications','storage_commands','storage_outbox']);await assert.rejects(target.readKnowledge(),{code:'RETENTION_RESTRICTED'});count.deny++;
   }
   {
    const files=await f.files(x),bytes=Buffer.concat([files.bytes,Buffer.from(' promoted '+randomUUID())]);
    const draft={...await f.base(s),action:'draft' as const,filename:'atomic-original',logicalPath:files.live.logicalPath,bytes:bytes.toString('base64'),sourceId:null,baseRevision:1};f.enroll(s,draft,x.source.retentionExpiresAt);assert.equal((await f.volume().saveDraft(s,draft)).status,'draft-saved');count.save++;count.write++;
    const key=randomUUID(),promote={...await f.base(s),key,action:'promote' as const,targetId:files.live.targetId,expectedRevision:1,draftId:draft.targetId,draftRevision:1,validationId:stable(['storage-volume-validation-v1',s.tenantId,s.spaceId,s.actorId,key])};f.enroll(s,promote,x.source.retentionExpiresAt);const v=f.volume();await v.prepare(s,promote);const held=latch(),reached=latch();let pid=0;
    const writer=new VolumeDraftRepository(v.uow,v.journal,v.native,v.crypto,v.root,v.witness,v.controls,v.validator,{afterArtifactWrite:async tx=>{pid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);assert.equal((await tx.query('SELECT count(*)::int AS n FROM fabric.storage_volume_promotions WHERE command_key=$1',[key])).rows[0]?.['n'],1);reached.release();await held.wait;}});
    const first=writer.commit(s,promote);first.catch(()=>{});await Promise.race([reached.wait,first]);assert.ok(pid);const second=f.volume().commit(s,promote);second.catch(()=>{});try{await blocked(pid);}finally{held.release();}
    const saved=await first;assert.equal(saved.status,'artifact-committed',JSON.stringify(saved));assert.deepEqual(await second,saved);assert.deepEqual(await f.volume().promote(s,promote),saved);assert.deepEqual(await f.volume().lookup(s,promote),saved);count.save++;count.write++;count.read+=3;
    await one(key,['storage_volume_promotions','storage_volume_versions','storage_artifact_versions','storage_artifact_receipts','storage_artifact_events','storage_commands','storage_outbox']);const actual=await f.volume().canonical(s,files.live.targetId);try{assert.ok(actual.bytes.equals(bytes));assert.deepEqual(actual.command,promote);count.read++;}finally{actual.bytes.fill(0);}
    for(const changed of [{...promote,expectedRevision:2},{...promote,draftId:randomUUID()},{...promote,validationId:randomUUID()},{...promote,expiresAt:new Date(Date.now()+15_000).toISOString()}]){assert.equal((await f.volume().promote(s,changed)).status,'not-saved');count.deny++;count.conflict++;}await one(key,['storage_volume_promotions','storage_volume_versions','storage_commands','storage_outbox']);bytes.fill(0);files.bytes.fill(0);
   }
   assert.deepEqual(await accountingSnapshot(f.f),economic,'No duplicate resource charge or cost mutation');assert.deepEqual((await db.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows,resources);
   for(const k of Object.keys(count) as (keyof typeof count)[])count[k]+=f.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];count.owner++;
   console.log(JSON.stringify({measurement:'atomic-mutation-namespaces',families:['correct','forget','promote'],actualIdenticalRaces:true,changedBindingsRefused:true,recreatedRepositories:true,exactEffectSets:true,economicSnapshotUnchanged:true}));
  }finally{try{await f?.close();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 });assert.equal(calls,1);
}

/** A populated derived owner loses its real PG service connection. Canonical
 * publication/receipt and exact fresh payload reads remain independently live.
 * This qualifies local service interruption, not an external host catastrophe. */
export async function exerciseAtomicDerivedOutage(count:AtomicVerificationFixture['positives'],violations:AtomicVerificationFixture['violations']){
 const root=process.env['STORAGE_REPO_ROOT'];assert.ok(root);const fixture=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let calls=0;
 await fixture.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{
  assert.equal(++calls,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));let f:Awaited<ReturnType<typeof createAuthorityRouteFixture>>|undefined;let pool:pg.Pool|undefined;
  try{
   for(const [k,v] of Object.entries(state.env))process.env[k]=v;f=await createAuthorityRouteFixture();const x=await f.core(f.f.scope),derived=await f.derived(x,'summary-v1');pool=new pg.Pool({connectionString:f.f.fixtureDsn('controller'),max:1,connectionTimeoutMillis:2000});
   const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.f.verifier.bindingFor}),g=f.graph(),graph=new DependencyGraphRepository(uow,g.journal,g.native,g.crypto,g.keys),actual=await graph.read(x.s,derived.ref);
   try{assert.ok(actual.equals(derived.expected));count.read++;}finally{actual.fill(0);}const before=await f.snapshot(),original=await f.canonical().lookupSave(x.s,x.save);assert.equal(original.status,'saved-here');count.read++;
   await pool.end();await assert.rejects(graph.read(x.s,derived.ref),{message:'Cannot use a pool after calling end on the pool'});count.deny++;
   const save={...x.save,key:randomUUID(),targetId:randomUUID(),assertion:{...x.save.assertion,subject:x.save.assertion.subject+' new'}};
   const saved=await f.canonical().append(x.s,save);assert.equal(saved.status,'saved-here');count.save++;count.write++;
   assert.deepEqual(await f.canonical().lookupSave(x.s,x.save),original);assert.equal((await x.readKnowledge()).value,x.save.assertion.value);const ref=await f.ref(x.s,'knowledge',save.targetId);assert.equal((await f.canonical().read(x.s,ref)).value,save.assertion.value);count.read+=3;
   const after=await f.snapshot();for(const table of ['storage_graph_nodes','storage_graph_edges','storage_graph_payloads']){const oldRows=before.storage.find(([n])=>n===table)?.[1],newRows=after.storage.find(([n])=>n===table)?.[1];assert.ok(Array.isArray(oldRows)&&Array.isArray(newRows));for(const row of oldRows)assert.ok(newRows.some(r=>JSON.stringify(r)===JSON.stringify(row)),'Existing derived row preserved '+table);}
   for(const k of Object.keys(count) as (keyof typeof count)[])count[k]+=f.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];count.owner++;
   console.log(JSON.stringify({measurement:'atomic-derived-service-outage',populatedDerivedRead:true,actualDerivedPoolEnded:true,derivedReadRefused:true,originalReceiptUnchanged:true,freshCanonicalSave:true,exactFreshCanonicalReads:true,derivedRowsPreserved:true}));
  }finally{try{await pool?.end().catch(e=>{if(e.message!=='Called end on pool more than once')throw e;});await f?.close();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 });assert.equal(calls,1);
}
