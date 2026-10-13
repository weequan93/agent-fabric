import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMaintenanceVerificationFixture,waitForMaintenanceLock} from './maintenance-verification-fixture.js';
import {emitObservations} from './observations.js';
import type {ComponentTest} from './canonical-component.js';
import type {GraphRef} from '../../src/dependency-graph.js';
import type {AsyncUnitOfWork,SqlTransaction} from '../../src/owners.js';

/** All six L09 leaves. The fixed component and full S-L call this same
 * body; there is no variant selector, skip, alternate owner or read shortcut. */
export async function registerMaintenanceVerificationTests(suite:'verify-maintenance'|'lifecycle-propagation',register:ComponentTest=test,observe=emitObservations){
 const isolated=async(body:()=>Promise<void>)=>{
  const root=process.env['STORAGE_REPO_ROOT'];assert(root);const harness=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let callbacks=0;
  await harness.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{assert.equal(++callbacks,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;await body();}finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}});assert.equal(callbacks,1);
 };
 await register('L09 / installed maintenance origin and existing allowance',async t=>isolated(async()=>{
  const x=await createMaintenanceVerificationFixture();
  try{
   const registration=await import(pathToFileURL(resolve(x.f.root,'g1-storage/scripts/maintenance-verification-registration.mjs')).href);assert.equal(registration.assertMaintenanceVerificationRegistration().onlyPinChanged,'scripts/manifest.mjs');
   const m=await readFile(resolve(x.f.root,'g1-storage/scripts/manifest.mjs'),'utf8');for(const bad of [m+'\n',m.replace('"L09/summary-admission"','"L09/weakened"'),m.replace('"verify-maintenance":','"maintenance-selector":')])assert.throws(()=>registration.assertMaintenanceVerificationAdditiveRegistry(bad));
   for(const args of [['verify-maintenance','extra'],['verify-maintenance','L09'],['verify-maintenance-unknown']]){const r=spawnSync(process.execPath,[resolve(x.f.root,'g1-storage/scripts/check-component.mjs'),...args],{encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.match(r.stderr,/Unknown\/extra checker argument/);assert.doesNotMatch(r.stdout,/strict-build|owned-fixture/);}x.count.owner++;
   type Prepared=Awaited<ReturnType<typeof x.prepare>>;
   const allowances=async(p:Prepared)=>(await x.f.admin.query('SELECT allowance_id,ceiling,reserved,settled,revision FROM fabric.budget_allowances WHERE allowance_id=ANY($1::uuid[]) ORDER BY allowance_id',[p.e.task.ids])).rows;
   const ceiling=async()=>(await x.f.admin.query('SELECT allowance_id,ceiling FROM fabric.budget_allowances ORDER BY allowance_id')).rows;
   const exact=async(p:Prepared)=>{const e=await x.effects(p);for(const [name,rows] of Object.entries(e))assert.equal(rows.length,1,name);const a=e.admissions[0]!,r=e.receipts[0]!,meter=e.meters[0]!,head=e.heads[0]!;assert.equal(a.receipt_id,p.e.receipt.receiptId);assert.equal(a.run_id,p.e.task.binding.runId);assert.equal(a.session_id,p.command.sessionId);assert.equal(a.profile,'local-deterministic-v1');assert.equal(a.region,'local-fixture');assert.equal(r.witness,head.witness);assert.equal(r.id,p.plan.id);assert.equal(Number(meter.amount),3);assert.equal(meter.origin_run_id,p.e.task.binding.runId);assert.equal(meter.category,'service');assert.equal(e.settlements[0]!.amount,'3');assert.equal(e.settlements[0]!.receipt.assurance,'deterministic-local-only');return e;};
   const useful=async(p:Prepared,expected:string,variant:string)=>{
    const before=await allowances(p),budget=await ceiling(),n=x.opens(),published=await x.publish(p);assert(x.opens()>n,'useful build opens actually admitted inputs');assert.deepEqual(await ceiling(),budget,'no new allowance or raised ceiling');
    const after=await allowances(p);assert.equal(after.length,6);for(let i=0;i<before.length;i++){assert.equal(after[i]!.allowance_id,before[i]!.allowance_id);assert.equal(Number(after[i]!.settled),Number(before[i]!.settled)+3);assert.equal(after[i]!.reserved,before[i]!.reserved);}
    const b=await x.read(published.ref);try{assert.equal(b.toString(),expected);}finally{b.fill(0);}const beforeRecreate=await x.snapshot(),opens=x.opens();const recovered=await x.recreate(u=>x.repo(p,u).lookup(x.s,p.command));assert.deepEqual(recovered,published.result);assert.equal(x.opens(),opens,'original-key lookup performs no rebuild');x.count.read++;await x.unchanged(beforeRecreate);
    const e=await exact(p);for(const row of (await x.f.admin.query('SELECT envelope FROM fabric.storage_graph_payloads WHERE id=$1',[p.plan.id])).rows){assert(!row.envelope.includes(x.value));assert(!row.envelope.includes(expected));}
    const ancestry=await x.f.uow.withScope(x.s,tx=>x.graph().assertCurrent(tx,x.s,published.ref));assert(ancestry.some(r=>r.class==='source'&&r.id===x.source.id));assert(ancestry.some(r=>r.class==='knowledge'&&r.id===x.knowledge.id));
    console.log(JSON.stringify({measurement:'maintenance-useful-admission',variant,builder:p.plan.builder,class:published.ref.class,dependencies:p.plan.dependencies,ancestryClasses:ancestry.map(r=>r.class),runId:p.e.task.binding.runId,receiptId:p.e.receipt.receiptId,amount:Number(e.meters[0]!.amount),allowances:after.length,ceilingChanged:false,recreatedExact:true,encrypted:true}));return published.ref;
   };
   let sum!:GraphRef,nested!:GraphRef,index!:GraphRef,cache!:GraphRef;
   const words='["after","alpha","release","review","ship","ω","漢字"]';
   await t.test('L09/summary-admission',async()=>{sum=await useful(await x.prepare('summary-v1',[x.knowledge]),x.value,'L09/summary-admission');nested=await useful(await x.prepare('summary-v1',[sum]),x.value,'L09/summary-admission');assert.equal((await x.canonical().recall(x.s,x.knowledge)).value,x.value);x.count.read++;});
   await t.test('L09/index-admission',async()=>{index=await useful(await x.prepare('keywords-v1',[nested]),words,'L09/index-admission');});
   await t.test('L09/cache-admission',async()=>{cache=await useful(await x.prepare('cache-v1',[index]),JSON.stringify({schemaVersion:1,inputs:[words]}),'L09/cache-admission');const closure=await x.f.uow.withScope(x.s,tx=>x.graph().assertCurrent(tx,x.s,cache));assert.deepEqual(closure.map(r=>r.class).sort(),['cache','index','knowledge','source','summary','summary']);});
   await t.test('L09/budget-denied',async()=>{
    for(const [builder,ancestor] of [['summary-v1',x.knowledge],['keywords-v1',nested],['cache-v1',index]] as const)for(const level of ['run','tenant'] as const){const p=await x.prepare(builder,[ancestor]),allowance=level==='run'?p.e.task.leaf:p.e.task.ids[0]!;
     const old=(await x.f.admin.query('SELECT ceiling FROM fabric.budget_allowances WHERE allowance_id=$1',[allowance])).rows[0].ceiling;
     try{await x.f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved+2 WHERE allowance_id=$1',[allowance]);const before=await x.snapshot();await x.denied(()=>x.repo(p).publish(x.s,p.command),['BUDGET_EXHAUSTED']);await x.unchanged(before);const effects=await x.effects(p);assert(Object.values(effects).every(r=>r.length===0));console.log(JSON.stringify({measurement:'maintenance-budget-refusal',variant:'L09/budget-denied',builder,level,remaining:2,cost:3,decrypts:0,effects:0}));}finally{await x.f.admin.query('UPDATE fabric.budget_allowances SET ceiling=$2 WHERE allowance_id=$1',[allowance,old]);}
    }
    // Exactly enough existing allowance admits one useful build, never a ceiling increase.
    const p=await x.prepare('summary-v1',[x.knowledge]);await x.f.admin.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved+3 WHERE allowance_id=$1',[p.e.task.leaf]);await useful(p,x.value,'L09/budget-denied');assert.equal((await x.f.admin.query('SELECT ceiling-settled-reserved AS remaining FROM fabric.budget_allowances WHERE allowance_id=$1',[p.e.task.leaf])).rows[0].remaining,'0');
    const cleanupActor=x.f.actors[1],params=[x.s.tenantId,x.s.spaceId,cleanupActor],old=(await x.f.admin.query('SELECT grants,revision FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0];
    try{await x.f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(['task:read','task:write','storage:maintenance','storage:forget'])]);const cleanup=await x.f.scopeFor(cleanupActor),q=await x.prepare('summary-v1',[x.knowledge]),before=await x.snapshot();await x.denied(()=>x.repo(q).publish(cleanup,q.command),['UNAUTHORIZED']);await x.denied(()=>x.graph().read(cleanup,cache),['UNAUTHORIZED']);await x.unchanged(before);console.log(JSON.stringify({measurement:'maintenance-cleanup-only',privateReadDenied:true,buildDenied:true,decrypts:0}));}finally{await x.f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(old.grants),old.revision]);}
   });
   await t.test('L09/blocked-wait-revalidation',async()=>{
    // Regression: the original first-match implementation fails on sample one.
    // Also refuse an unrelated waiter or blocker even if it reports Lock.
    const samples=[{pid:101,wait_event_type:null,wait_event:null,blockers:[202]},
     {pid:999,wait_event_type:'Lock',wait_event:'transactionid',blockers:[202]},
     {pid:101,wait_event_type:'Lock',wait_event:'transactionid',blockers:[999]},
     {pid:101,wait_event_type:'Lock',wait_event:'transactionid',blockers:[202]}];let sampled=0,cleared=0;
    const observed=await waitForMaintenanceLock({query:async(sql,values)=>{if(sql==='SELECT pg_stat_clear_snapshot()'){cleared++;return {rows:[]};}assert.match(sql,/WHERE pid=\$1 AND \$2=ANY/);assert.deepEqual(values,[101,202]);return {rows:[samples[sampled++]!]};}},202,101,'sampling-regression');assert.equal(sampled,4);assert.equal(cleared,4);assert.equal(observed,samples[3]);
    type Prepared=Awaited<ReturnType<typeof x.prepare>>;
    const held=async(p:Prepared,codes:string[],label:string,lock:(c:import('pg').PoolClient)=>Promise<unknown>,change:(c:import('pg').PoolClient)=>Promise<void>)=>{
     const c=await x.f.admin.connect(),errors:unknown[]=[];let w:Awaited<ReturnType<typeof x.waiter>>|undefined,pending:Promise<unknown>|undefined,settled=false;
     try{
      await c.query('BEGIN');await lock(c);w=await x.waiter(p);pending=x.denied(()=>w!.pending,codes);pending.finally(()=>{settled=true;}).catch(()=>{});
      await x.blocked(c,label,w.pid);await change(c);await c.query('COMMIT');await pending;
     }catch(error){errors.push(error);}
     finally{
      // On observation/change failure, settle the real publisher before releasing
      // its blocker. Never let a test's missing restriction become a publication.
      if(w&&pending&&!settled)try{assert.equal((await x.f.admin.query('SELECT pg_cancel_backend($1) AS cancelled',[w.pid])).rows[0].cancelled,true,'actual waiting publisher cancellation accepted');}catch(error){errors.push(error);}
      if(pending)try{await pending;}catch(error){if(!errors.includes(error))errors.push(error);}
      try{await c.query('ROLLBACK');}catch(error){errors.push(error);}finally{c.release();}
     }
     if(errors.length)throw new AggregateError(errors,'Maintenance lock schedule failed; waiter outcome retained');
    };
    const allowanceLock=(p:Prepared)=>(c:import('pg').PoolClient)=>c.query('SELECT * FROM fabric.budget_allowances WHERE allowance_id=$1 FOR UPDATE',[p.e.task.leaf]);
    // Force observation/setup failure while a real publisher waits. Cancellation
    // must roll back before blocker release, preserve both errors, and open/commit
    // nothing. HeadPublicationRepository deliberately maps non-StorageError
    // material-resolution failures (including PG cancellation) to CONTENT_UNAVAILABLE.
    // Successful publication would still increment the existing counter.
    const failure=await x.prepare('summary-v1',[x.knowledge]),failureBefore=await x.snapshot(),failureOpens=x.opens(),failureViolations={...x.violations},observationFailure=new Error('forced maintenance observation failure');
    await assert.rejects(held(failure,['INVALID_SCHEMA'],'failure-ordering',allowanceLock(failure),async()=>{throw observationFailure;}),(error:unknown)=>{
     assert(error instanceof AggregateError);assert(error.errors.includes(observationFailure));assert(error.errors.some(e=>e instanceof assert.AssertionError&&e.message==='CONTENT_UNAVAILABLE'),JSON.stringify(error.errors.map(e=>({name:e?.name,code:e?.code,message:e?.message}))));return true;
    });assert.equal(x.opens(),failureOpens);assert.deepEqual(x.violations,failureViolations);await x.unchanged(failureBefore);assert(Object.values(await x.effects(failure)).every(r=>r.length===0));
    console.log(JSON.stringify({measurement:'maintenance-failed-observation-cleanup',cancelledBeforeUnlock:true,decrypts:0,effects:0,originalFailureRetained:true}));
    const changes=[['profile',{profile:'unqualified'}],['region',{region:'remote'}],['source',{sourceAllowed:false}],['builder',{allowedBuilders:['cache-v1']}],['provider',{provider:'paid'}]] as const;
    for(const [label,change] of changes){const p=await x.prepare('summary-v1',[x.knowledge]),before=await x.snapshot();p.owner.policy=async()=>({...p.policy,...change}) as typeof p.policy;await x.denied(()=>x.repo(p).publish(x.s,p.command),['CONTENT_UNAVAILABLE','INVALID_SCHEMA','REQUIRED_CAPABILITY_UNSUPPORTED']);await x.unchanged(before);p.owner.policy=async()=>p.policy;
     await held(p,['CONTENT_UNAVAILABLE','INVALID_SCHEMA','REQUIRED_CAPABILITY_UNSUPPORTED'],label,allowanceLock(p),async()=>{p.owner.policy=async()=>({...p.policy,...change}) as typeof p.policy;});await x.unchanged(before);assert(Object.values(await x.effects(p)).every(r=>r.length===0));console.log(JSON.stringify({measurement:'maintenance-after-lock-refusal',variant:'L09/blocked-wait-revalidation',change:label,decrypts:0,effects:0}));
    }
    const p=await x.prepare('summary-v1',[x.knowledge]),before=await x.snapshot(),params=[x.s.tenantId,x.s.spaceId,x.s.actorId],old=(await x.f.admin.query('SELECT grants,revision FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',params)).rows[0];
    try{
     await held(p,['STALE_AUTHORITY'],'service-grant',c=>c.query('SELECT * FROM fabric.memberships WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 FOR UPDATE',params),async c=>{await c.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=revision+1 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(old.grants.filter((g:string)=>g!=='storage:maintenance'))]);});await x.unchanged(before);assert(Object.values(await x.effects(p)).every(r=>r.length===0));console.log(JSON.stringify({measurement:'maintenance-after-lock-refusal',variant:'L09/blocked-wait-revalidation',change:'service-grant',decrypts:0,effects:0}));
    }finally{await x.f.admin.query('UPDATE fabric.memberships SET grants=$4::jsonb,revision=$5 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[...params,JSON.stringify(old.grants),old.revision]);}
    for(const change of ['budget','deadline'] as const){const p=await x.prepare('summary-v1',[x.knowledge]);if(change==='deadline')p.command.expiresAt=new Date(Date.now()+600).toISOString();const before=await x.snapshot();
     await held(p,[change==='budget'?'BUDGET_EXHAUSTED':'EXPIRED_COMMAND'],change,allowanceLock(p),async c=>{
      if(change==='budget'){await c.query('UPDATE fabric.budget_allowances SET ceiling=settled+reserved+2 WHERE allowance_id=$1',[p.e.task.leaf]);for(const row of before.allowances)if(row.allowance_id===p.e.task.leaf)row.ceiling=String(Number(row.settled)+Number(row.reserved)+2);}
      else{const end=Date.now()+1500;let at='';do{at=(await x.f.admin.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString();if(at>=p.command.expiresAt)break;await new Promise<void>(r=>setImmediate(r));}while(Date.now()<end);assert(at>=p.command.expiresAt,'actual installed command deadline observed');console.log(JSON.stringify({measurement:'maintenance-observed-command-expiry',deadline:p.command.expiresAt,observedAt:at}));}
     });await x.unchanged(before);assert(Object.values(await x.effects(p)).every(r=>r.length===0));console.log(JSON.stringify({measurement:'maintenance-after-lock-refusal',variant:'L09/blocked-wait-revalidation',change,decrypts:0,effects:0}));
    }
    // A legitimate current change after useful decryption still rolls charge and
    // publication back. The original key is reconciled, with no new mutation.
    const q=await x.prepare('summary-v1',[x.knowledge]),oldSnapshot=await x.snapshot(),n=x.opens(),u:AsyncUnitOfWork={withScope:async(scope,body)=>x.f.uow.withScope(scope,tx=>body({query:async<Row extends Record<string,unknown>>(sql:string,v:readonly unknown[]=[])=>{const r=await tx.query<Row>(sql,v);if(sql.includes('storage_record_maintenance('))q.owner.policy=async()=>({...q.policy,revision:2});return r;}}))};await x.denied(()=>x.repo(q,u).publish(x.s,q.command),['REQUIRED_CAPABILITY_UNSUPPORTED'],false);assert(x.opens()>n);q.owner.policy=async()=>q.policy;assert.equal((await x.recreate(fresh=>x.repo(q,fresh).lookup(x.s,q.command))).status,'absent-safe');await x.unchanged(oldSnapshot);
   });
   await t.test('L09/duplicate-single-charge',async()=>{
    const p=await x.prepare('summary-v1',[x.knowledge]);let release!:()=>void,reached!:(tx:SqlTransaction)=>void;let timer:ReturnType<typeof setTimeout>;const held=new Promise<void>(r=>release=r),ready=new Promise<SqlTransaction>((r,reject)=>{reached=r;timer=setTimeout(()=>reject(new Error('Maintenance publication phase absent')),5000);timer.unref();});
    const u:AsyncUnitOfWork={withScope:async(scope,body)=>x.f.uow.withScope(scope,tx=>body({query:async<Row extends Record<string,unknown>>(sql:string,v:readonly unknown[]=[])=>{const r=await tx.query<Row>(sql,v);if(sql.includes('storage_record_maintenance(')){clearTimeout(timer);reached(tx);await held;}return r;}}))},winner=x.publish(p,u);winner.catch(()=>{});let loser:Promise<unknown>|undefined;let accepted!:Awaited<ReturnType<typeof x.publish>>;
    try{const tx=await ready,blockerPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']);loser=x.denied(()=>x.repo(p).publish(x.s,p.command),['IDEMPOTENCY_CONFLICT','AUTHORITY_UNAVAILABLE']);loser.catch(()=>{});const end=Date.now()+1500;let b=false;do{b=(await x.f.admin.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS b',[blockerPid])).rows[0].b;if(b)break;await new Promise<void>(r=>setImmediate(r));}while(Date.now()<end);assert(b,'duplicate actually waits for original commit');console.log(JSON.stringify({measurement:'maintenance-observed-original-wait',key:p.command.key,blockerPid}));release();accepted=await winner;await loser;}finally{release();clearTimeout(timer!);await winner.catch(()=>{});await loser?.catch(()=>{});}
    const before=await x.snapshot(),n=x.opens(),economic=await exact(p);for(let i=0;i<3;i++){assert.deepEqual(await x.recreate(fresh=>x.repo(p,fresh).lookup(x.s,p.command)),accepted.result);x.count.read++;}assert.equal(x.opens(),n);await x.unchanged(before);await x.denied(()=>x.repo(p).publish(x.s,p.command),['IDEMPOTENCY_CONFLICT']);await x.denied(()=>x.repo(p).lookup(x.s,{...p.command,expiresAt:new Date(Date.parse(p.command.expiresAt)+1).toISOString()}),['IDEMPOTENCY_CONFLICT']);await x.unchanged(before);
    const reused=await x.prepare('summary-v1',[x.knowledge],p.e),reuseBefore=await x.snapshot();await x.denied(()=>x.repo(reused).publish(x.s,reused.command),['IDEMPOTENCY_CONFLICT']);await x.unchanged(reuseBefore);assert(Object.values(await x.effects(reused)).filter(r=>r.length===0).length>=3);
    for(const mode of ['commit','rollback'] as const){const q=await x.prepare('summary-v1',[x.knowledge]),initial=await x.snapshot();await x.lost(q,mode);const n=x.opens(),r=await x.recreate(fresh=>x.repo(q,fresh).lookup(x.s,q.command));assert.equal(r.status,mode==='commit'?'committed':'absent-safe');assert.equal(x.opens(),n);x.count.read++;
     if(mode==='rollback'){await x.unchanged(initial);assert(Object.values(await x.effects(q)).every(rows=>rows.length===0));await x.recreate(fresh=>x.publish(q,fresh));}else{x.count.save++;x.count.write++;x.count.owner+=q.e.ownerCalls();}
     const settled=await exact(q),after=await x.snapshot();for(let i=0;i<2;i++){assert.equal((await x.recreate(fresh=>x.repo(q,fresh).lookup(x.s,q.command))).status,'committed');x.count.read++;}await x.unchanged(after);assert.deepEqual(await x.effects(q),settled);console.log(JSON.stringify({measurement:'maintenance-recovered-original',variant:'L09/duplicate-single-charge',mode,key:q.command.key,receiptId:q.e.receipt.receiptId,settlements:settled.settlements.length,rebuildAfterUnknown:mode==='rollback'?1:0,originalIdentity:true}));
    }
    assert.deepEqual(await x.effects(p),economic);console.log(JSON.stringify({measurement:'maintenance-single-charge',variant:'L09/duplicate-single-charge',concurrentOriginal:true,recreatedLookups:3,settlements:economic.settlements.length,heads:economic.heads.length,receiptReuseRefused:true,changedBindingRefused:true}));
   });
   await x.final();observe({schemaVersion:1,measurement:'storage-observations',suite,positives:x.count,violations:x.violations});
  }finally{await x.close();}
 }));
}
