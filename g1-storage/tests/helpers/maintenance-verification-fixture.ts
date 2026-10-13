import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {createStorageFixture} from './pg-fixture.js';
import {enrollAuthority} from './authority-fixture.js';
import {enrollServiceAccounting,accountingSnapshot} from './accounting-fixture.js';
import {startCommitWireProxy} from './commit-wire-proxy.js';
import {migrateStorageMaintenanceAdmission,installedOwnerSnapshot} from '../../src/migration.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {KnowledgeSaveRepository,sourceNarrativeDigest} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {DependencyGraphRepository,type GraphRef} from '../../src/dependency-graph.js';
import {MaintenanceBuildersRepository,MaintenancePlanSchema,MaintenancePolicySchema,type MaintenancePlan,type MaintenanceAdmissionOwner} from '../../src/maintenance-builders.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {AuthenticatedUnitOfWork} from '../../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import type {AsyncUnitOfWork,VerifiedScope} from '../../src/owners.js';

/** pg_stat_activity's wait fields and pg_blocking_pids are sampled separately.
 * Keep polling inside the original bound until the exact publisher is coherently
 * observed waiting on the exact blocker; a partial sample is not a lock oracle. */
export async function waitForMaintenanceLock(admin:{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>},blockerPid:number,waitingPid:number,label:string){
 const end=Date.now()+1500;let observed:Record<string,unknown>|undefined,samples=0;
 do{
  await admin.query('SELECT pg_stat_clear_snapshot()');
  observed=(await admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1 AND $2=ANY(pg_blocking_pids(pid))',[waitingPid,blockerPid])).rows[0];samples++;
  if(observed?.['pid']===waitingPid&&observed['wait_event_type']==='Lock'&&typeof observed['wait_event']==='string'&&observed['wait_event'].length>0&&Array.isArray(observed['blockers'])&&observed['blockers'].includes(blockerPid)){
   console.log(JSON.stringify({measurement:'maintenance-observed-lock',label,blockerPid,waitingPid,waitEvent:observed['wait_event'],blockers:observed['blockers'],samples}));return observed;
  }
  await new Promise<void>(r=>setImmediate(r));
 }while(Date.now()<end);
 assert.fail('actual PostgreSQL lock wait: '+label+'; '+JSON.stringify({blockerPid,waitingPid,lastSample:observed,samples}));
}

/** Installed deterministic owner and existing F04 allowance. No request fields
 * supply policy, plaintext, rates, budgets or a supplier/read callback. */
export async function createMaintenanceVerificationFixture(){
 const f=await createStorageFixture(),s=f.scope,dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
 const count={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0};
 const violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 let opens=0;const keys={resolve:async()=>({keyId,generation})};
 const crypto=()=>{const c=new CryptoStore({resolve:async()=>({dataKey,digestKey})}),open=c.open.bind(c);c.open=async(...args)=>{opens++;return open(...args);};return c;};
 try{
  await migrateStorageMaintenanceAdmission(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});
  const a=await enrollAuthority(f),root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
  const ownerBefore=await installedOwnerSnapshot(f.admin);
  const graph=(u:AsyncUnitOfWork=f.uow)=>new DependencyGraphRepository(u,new EpochWitnessJournal(root),f.native,crypto(),keys);
  const canonical=()=>{const c=crypto();return new KnowledgeSaveRepository(f.uow,new EpochWitnessJournal(root),f.native,c,keys,new KnowledgeStatusAdmission(c));};
  const origin=await f.task('maintenance'),value='Ship release ALPHA Ω 漢字 🙂 after review.',narrative='Approved release decision '+randomUUID();
  const src={schemaVersion:1,action:'source',sessionId:origin.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),title:'maintenance-private-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+58_000).toISOString(),saveReusable:true};
  assert.equal((await canonical().source(s,src)).status,'source-accepted');count.save++;count.write++;
  const cmd={schemaVersion:1,action:'save',sessionId:origin.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+25_000).toISOString(),assertion:{subject:'release-'+randomUUID(),value,sourceId:src.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(src.retentionExpiresAt)-100).toISOString(),classification:'group',intent:'assert',checkId:null}};
  assert.equal((await canonical().save(s,cmd)).status,'saved-here');count.save++;count.write++;
  const knowledge=await graph().ref(s,{class:'knowledge',id:cmd.targetId,revision:1}),source=await graph().ref(s,{class:'source',id:src.targetId,revision:1});
  type Enrollment=Awaited<ReturnType<typeof enrollServiceAccounting>>;
  const prepare=async(builder:MaintenancePlan['builder'],dependencies:GraphRef[],enrollment?:Enrollment)=>{
   const e=enrollment??await enrollServiceAccounting(f,graph().authority,'maintenance'),materialId=randomUUID();
   const min=(await f.admin.query('SELECT min(expires_at) AS at FROM fabric.storage_graph_nodes WHERE id=ANY($1::uuid[])',[dependencies.map(r=>r.id)])).rows[0].at as Date;
   const plan=MaintenancePlanSchema.parse({schemaVersion:1,builder,id:randomUUID(),revision:1,sourceTaskId:e.task.binding.taskId,expiresAt:new Date(Math.min(Date.now()+53_000,min.getTime()-100)).toISOString(),dependencies});
   const policy=MaintenancePolicySchema.parse({schemaVersion:1,revision:1,profile:'local-deterministic-v1',region:'local-fixture',provider:'none',sourceAllowed:true,allowedBuilders:['summary-v1','keywords-v1','cache-v1']});
   const command={key:randomUUID(),sessionId:e.task.binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),materialId,expected:null};
   const owner:MaintenanceAdmissionOwner={plan:async(_tx,scope,id)=>{assert.equal(scope,s);assert.equal(id,materialId);return plan;},policy:async()=>policy,accounting:async(_tx,_s,_n,_key,expiresAt)=>({...e.command,expiresAt})};
   return {e,plan,policy,command,owner};
  };
  type Prepared=Awaited<ReturnType<typeof prepare>>;
  const repo=(p:Prepared,u:AsyncUnitOfWork=f.uow)=>{const g=graph(u);return new MaintenanceBuildersRepository(g,new StorageServiceAccounting(u,f.native,p.e.owner,g.authority),p.owner);};
  const ref=async(p:Prepared)=>graph().ref(s,{class:p.plan.builder==='summary-v1'?'summary':p.plan.builder==='keywords-v1'?'index':'cache',id:p.plan.id,revision:p.plan.revision});
  const publish=async(p:Prepared,u:AsyncUnitOfWork=f.uow)=>{const before=p.e.ownerCalls(),r=await repo(p,u).publish(s,p.command);assert.equal(r.status,'committed');count.owner+=p.e.ownerCalls()-before;count.save++;count.write++;return {result:r,ref:await ref(p)};};
  const read=async(r:GraphRef)=>{const b=await graph().read(s,r);count.read++;return b;};
  const tables=['storage_entities','storage_knowledge_revisions','storage_sources','storage_commands','storage_outbox','storage_save_receipts','storage_save_events','storage_maintenance_admissions','storage_maintenance_receipts','storage_graph_nodes','storage_graph_edges','storage_graph_payloads','storage_graph_events','storage_graph_jobs','storage_current_heads','storage_head_publications','storage_epoch_publications','storage_authority_epoch'];
  const snapshot=async()=>({storage:await Promise.all(tables.map(async name=>[name,(await f.admin.query('SELECT * FROM fabric.'+name)).rows.sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)))])),accounting:await accountingSnapshot(f),allowances:(await f.admin.query('SELECT * FROM fabric.budget_allowances ORDER BY allowance_id')).rows});
  const unchanged=async(before:Awaited<ReturnType<typeof snapshot>>)=>{const after=await snapshot();if(JSON.stringify(after)!==JSON.stringify(before))violations.unauthorizedMutation++;assert.deepEqual(after,before);};
  const denied=async(work:()=>Promise<unknown>,codes:string[],beforeOpen=true)=>{const n=opens;let caught:unknown;try{await work();violations.unauthorizedDisclosure++;}catch(e){caught=e;}assert(caught,'must actually refuse');assert(codes.includes(String((caught as {code?:string}).code)),String((caught as {code?:string}).code));if(beforeOpen)assert.equal(opens,n,'refusal precedes private content decrypt');count.deny++;console.log(JSON.stringify({measurement:'maintenance-actual-refusal',code:(caught as {code?:string}).code,beforeOpen,decrypts:opens-n}));return caught;};
  const blocked=async(blocker:pg.PoolClient,label:string,waitingPid:number)=>{
   const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   return waitForMaintenanceLock(f.admin,pid,waitingPid,label);
  };
  // Warm a single installed-controller connection before authentication. A
  // membership wait can occur before the authenticated UoW invokes its callback.
  const waiter=async(p:Prepared)=>{
   const pool=new pg.Pool({connectionString:f.fixtureDsn('controller'),max:1,connectionTimeoutMillis:2000});
   try{
    const row=(await pool.query('SELECT pg_backend_pid() AS pid,current_user AS role')).rows[0];assert.equal(row.role,f.roles.controller);const pid=Number(row.pid);assert(Number.isInteger(pid)&&pid>0);
    const u=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});
    const pending=repo(p,u).publish(s,p.command).finally(()=>pool.end());pending.catch(()=>{});return {pid,pending};
   }catch(error){await pool.end();throw error;}
  };
  const recreate=async<T>(body:(u:AsyncUnitOfWork)=>Promise<T>)=>{const pool=new pg.Pool({connectionString:f.fixtureDsn('controller'),max:1,connectionTimeoutMillis:2000});try{const verified=await f.scopeFor();assert.equal(verified.actorId,s.actorId);const u=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});return await body(u);}finally{await pool.end();}};
  const lost=async(p:Prepared,mode:'commit'|'rollback')=>{
   const proxy=await startCommitWireProxy(f.fixtureDsn('controller'),mode),pool=new pg.Pool({connectionString:proxy.dsn,max:1,connectionTimeoutMillis:2000}),transport=(e:Error)=>assert.equal(e.message,'Connection terminated unexpectedly');pool.on('error',transport);pool.on('connect',c=>c.on('error',transport));
   try{const u=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(pool),bindingFor:f.verifier.bindingFor});await assert.rejects(repo(p,u).publish(s,p.command),{code:'UNKNOWN_COMMIT'});assert.equal(mode==='commit'?proxy.dropped():proxy.requestsDropped(),1);count.deny++;console.log(JSON.stringify({measurement:'maintenance-real-unknown-commit',mode,ackDropped:proxy.dropped(),requestDropped:proxy.requestsDropped(),key:p.command.key,receiptId:p.e.receipt.receiptId}));}finally{await pool.end();await new Promise<void>(r=>setImmediate(r));await proxy.close();}
  };
  const effects=async(p:Prepared)=>({admissions:(await f.admin.query('SELECT * FROM fabric.storage_maintenance_admissions WHERE command_key=$1',[p.command.key])).rows,receipts:(await f.admin.query('SELECT * FROM fabric.storage_maintenance_receipts WHERE command_key=$1',[p.command.key])).rows,meters:(await f.admin.query('SELECT * FROM fabric.model_resource_intervals WHERE receipt_id=$1',[p.e.receipt.receiptId])).rows,settlements:(await f.admin.query('SELECT * FROM fabric.usage_settlements WHERE settlement_id=$1',[p.e.receipt.receiptId])).rows,heads:(await f.admin.query('SELECT * FROM fabric.storage_head_publications WHERE command_key=$1',[p.command.key])).rows});
  const final=async()=>{
   assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);const n=(await f.admin.query('SELECT (SELECT count(*) FROM fabric.storage_maintenance_admissions)::int AS admissions,(SELECT count(*) FROM fabric.storage_maintenance_receipts)::int AS receipts,(SELECT count(*) FROM fabric.model_resource_intervals)::int AS meters,(SELECT count(*) FROM fabric.usage_settlements)::int AS charges,(SELECT count(*) FROM fabric.model_operations)::int AS supplier,(SELECT count(*) FROM fabric.model_computer_assignments)::int AS computers')).rows[0];
   violations.askComputerStart=n.computers;assert.equal(n.computers,0);assert.equal(n.supplier,0);assert(n.admissions>0);assert.equal(n.admissions,n.receipts);assert.equal(n.admissions,n.charges);assert.equal(n.admissions,n.meters);violations.duplicateCanonicalEffect=(await f.admin.query('SELECT receipt_id FROM fabric.storage_maintenance_admissions GROUP BY receipt_id HAVING count(*)>1')).rows.length;assert.equal(violations.duplicateCanonicalEffect,0);
   assert(count.save>0&&count.read>0&&count.write>0&&count.deny>0&&count.owner>0&&opens>0);assert.equal((await journal.state(s.tenantId,s.spaceId))?.pending,null);console.log(JSON.stringify({measurement:'maintenance-installed-final',...n,ownerUnchanged:true,opens,duplicateReceiptEffects:violations.duplicateCanonicalEffect}));
  };
  return {f,s,graph,canonical,origin,value,src,cmd,knowledge,source,prepare,repo,ref,publish,read,snapshot,unchanged,denied,blocked,waiter,recreate,lost,effects,final,journal,count,violations,opens:()=>opens,close:async()=>{dataKey.fill(0);digestKey.fill(0);await f.close();}};
 }catch(error){dataKey.fill(0);digestKey.fill(0);await f.close();throw error;}
}
export type MaintenanceVerificationFixture=Awaited<ReturnType<typeof createMaintenanceVerificationFixture>>;
