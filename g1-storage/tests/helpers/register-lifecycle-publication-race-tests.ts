import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync,type SpawnSyncReturns} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPropagationVerificationFixture,type PropagationVerificationFixture} from './propagation-verification-fixture.js';
import {registerLifecycleDisclosureRaceTests} from './register-lifecycle-disclosure-race-tests.js';
import {registerLifecycleSpecialRaceTests} from './register-lifecycle-special-race-tests.js';
import {identities} from './lifecycle-verification-fixture.js';
import {emitObservations,type SuiteObservations} from './observations.js';
import {accountingSnapshot} from './accounting-fixture.js';
import {StorageError} from '../../src/errors.js';
import {KnowledgeSaveRepository} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {createLifecycleRaceOpenObserver} from './lifecycle-race-open-observer.js';
import {SourceRevocationRepository} from '../../src/source-revocation.js';
import {lifecycleRaceScenario} from './lifecycle-race-fixture.js';
import type {GraphRef} from '../../src/dependency-graph.js';
import type {VolumeCommand} from '../../src/volume-drafts.js';
import type {AsyncUnitOfWork,SqlTransaction} from '../../src/owners.js';
import type {ComponentTest} from './canonical-component.js';
const gate=()=>{let release!:()=>void,enter!:(pid:number)=>void;let timer:ReturnType<typeof setTimeout>;const ready=new Promise<number>((r,reject)=>{enter=r;timer=setTimeout(()=>reject(new Error('Missing lifecycle publication phase')),7000);timer.unref();});let entered=false;return {ready,held:new Promise<void>(r=>release=r),release:()=>{clearTimeout(timer);release();},enter:async(tx:SqlTransaction)=>{if(entered)return;entered=true;clearTimeout(timer);enter(Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]?.['pid']));}};};
const tap=(f:PropagationVerificationFixture,g:ReturnType<typeof gate>,matches:(sql:string)=>boolean):AsyncUnitOfWork=>({withScope:async(s,body)=>f.f.uow.withScope(s,tx=>body({query:async<Row extends Record<string,unknown>>(sql:string,v:readonly unknown[]=[])=>{const r=await tx.query<Row>(sql,v);if(matches(sql)){await g.enter(tx);await g.held;}return r;}}))});
const normalize=async<T>(work:()=>Promise<T>):Promise<T>=>{const r=await work();if(r&&typeof r==='object'&&'status' in r&&r.status==='not-saved')throw new StorageError((r as unknown as {error:ConstructorParameters<typeof StorageError>[0]}).error);return r;};
/** L03/L07's19 frozen leaves: real installed publication/disclosure plus exact
 * restriction originals. Fixed component and full lifecycle use this body. */
export async function registerLifecyclePublicationRaceTests(suite:'verify-lifecycle-races'|'lifecycle-propagation',register:ComponentTest=test,observe=emitObservations){
 const positives={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const collect=(f:{count:typeof positives;violations:typeof violations})=>{for(const k of Object.keys(positives) as (keyof typeof positives)[])positives[k]+=f.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=f.violations[k];};
 const capture=(r:SuiteObservations)=>collect({count:r.positives,violations:r.violations});
 await registerLifecycleDisclosureRaceTests(suite,register,capture);
 await register('L07 / installed lifecycle publication and disclosure orders',async t=>{
  const root=process.env['STORAGE_REPO_ROOT'];assert(root);const harness=await import(pathToFileURL(resolve(root,'g1-storage/scripts/fixture.mjs')).href);let calls=0;
  await harness.withStorageFixture(async(state:{assurance:string;paidCallsAllowed:boolean;env:Record<string,string>})=>{assert.equal(++calls,1);assert.equal(state.assurance,'deterministic-local-only');assert.equal(state.paidCallsAllowed,false);const old=new Map(Object.keys(state.env).map(k=>[k,process.env[k]]));
   try{for(const [k,v] of Object.entries(state.env))process.env[k]=v;const x={count:{...positives},violations:{...violations}};for(const k of Object.keys(x.count) as (keyof typeof x.count)[])x.count[k]=0;
    const registration=await import(pathToFileURL(resolve(root,'g1-storage/scripts/lifecycle-races-verification-registration.mjs')).href);registration.assertLifecycleRacesVerificationRegistration();const m=await readFile(resolve(root,'g1-storage/scripts/manifest.mjs'),'utf8');for(const bad of [m+'\n',m.replace('"L07/delete-restriction-first"','"L07/weakened"'),m.replace('"verify-lifecycle-races":','"race-selector":')])assert.throws(()=>registration.assertLifecycleRacesVerificationAdditiveRegistry(bad));for(const args of [['verify-lifecycle-races','extra'],['verify-lifecycle-races','L07'],['verify-lifecycle-races-unknown']]){const cliResult:SpawnSyncReturns<string>=spawnSync(process.execPath,[resolve(root,'g1-storage/scripts/check-component.mjs'),...args],{encoding:'utf8',timeout:5000});assert.equal(cliResult.status,1);assert.match(cliResult.stderr,/Unknown\/extra checker argument/);assert.doesNotMatch(cliResult.stdout,/strict-build|owned-fixture/);}x.count.owner++;
    type Scenario=Awaited<ReturnType<typeof lifecycleRaceScenario>>;
    type Event=ReturnType<PropagationVerificationFixture['command']>;
    for(const mode of ['delete','expiry','source-revoke','correction'] as const)for(const order of ['restriction-first','publication-first'] as const)await t.test(`L07/${mode}-${order}`,async()=>{
     const x=await createPropagationVerificationFixture();try{
    const correction=(s:Scenario,c:Event,revision=1,prior:GraphRef=s.kr)=>({command:{...s.c,action:'correct' as const,key:c.key,expiresAt:c.expiresAt,expectedRevision:revision,assertion:{...s.c.assertion,value:'current-'+c.key}},prior});
    const restriction=async(s:Scenario,mode:string,c:Event,u:AsyncUnitOfWork=x.f.uow)=>{
     let r:unknown;if(mode==='correction')r=await normalize(()=>x.canonical(u).correct(x.scope,correction(s,c)));
     else if(mode==='source-revoke')r=await new SourceRevocationRepository(u,x.journal,x.f.native).revoke(x.scope,{...c,source:{id:s.sr.id,revision:1,witness:s.sr.witness}});
     else{const owner=new (await import('../../src/retention-work.js')).RetentionWorkRepository(u,x.journal,x.f.native);r=await (mode==='expiry'?owner.expire(x.scope,{...c,entity:s.sr}):owner.forget(x.scope,{...c,entity:s.sr}));}
     assert(['saved-here','committed','restriction-committed'].includes((r as {status:string}).status),JSON.stringify(r));x.count.write++;if(mode==='correction')x.count.save++;else x.count.forget++;return r;
    };
    const lookup=async(s:Scenario,mode:string,c:Event)=>mode==='correction'?x.canonical().lookupCorrection(x.scope,correction(s,c)):mode==='source-revoke'?new SourceRevocationRepository(x.f.uow,x.journal,x.f.native).lookup(x.scope,{...c,source:{id:s.sr.id,revision:1,witness:s.sr.witness}}):x.retention().lookup(x.scope,{...c,entity:s.sr},mode==='expiry'?'expiry':'forget');
    const restrictSql=(sql:string)=>['storage_commit_corrected_knowledge(','storage_publish_forget_work(','storage_publish_expiry_work(','storage_revoke_source('].some(v=>sql.includes(v));
    const durable=async(s:Scenario,mode:string,c:Event)=>{
     const root=mode==='correction'?s.kr:s.sr,rows=(await x.f.admin.query('SELECT * FROM fabric.storage_graph_events WHERE command_key=$1',[c.key])).rows;assert.equal(rows.length,1);assert.equal(rows[0].id,root.id);assert.equal(rows[0].revision,'1');
     if(mode==='correction'){assert.equal((await x.f.admin.query("SELECT max(revision)::int AS n FROM fabric.storage_current_heads WHERE class='knowledge' AND id=$1",[s.kr.id])).rows[0].n,2);assert.equal((await x.canonical().recall(x.scope,await x.ref('knowledge',s.kr.id,2))).value,'current-'+c.key);x.count.read++;}
     else{const table=mode==='source-revoke'?'storage_restrictions':'storage_tombstones',where=mode==='source-revoke'?'source_id=$1 AND source_revision=1':"class='source' AND id=$1 AND revision>=1";const r=(await x.f.admin.query('SELECT * FROM fabric.'+table+' WHERE '+where,[s.sr.id])).rows;assert.equal(r.length,1);assert.equal((await x.f.admin.query("SELECT max(revision)::int AS n FROM fabric.storage_current_heads WHERE class='source' AND id=$1",[s.sr.id])).rows[0].n,1);}
     const pending=await x.progress(c);assert.equal(pending.completed,0);assert.equal(pending.remaining,pending.total);assert(pending.total>=1);assert.equal(pending.alreadyDeliveredRecalled,false);assert.equal(pending.backupCopies,null);assert.equal(pending.externalCopies,null);return pending;
    };
     for(const operation of ['read','save','promotion','job'] as const){
      // A knowledge correction does not create a source revocation. The file
      // correction pair below uses the actual expected-base volume owner.
      if(mode==='correction'&&operation==='promotion'){await fileCorrectionPair(x,order);continue;}
      if(mode==='correction'&&operation==='save'){await knowledgeCorrectionSavePair(x,order);continue;}
      const s=await lifecycleRaceScenario(x,mode==='expiry'?(operation==='promotion'?9000:1500):55_000,mode==='correction'),event=x.command(s.s.task.binding.sessionId),root=mode==='correction'?s.kr:s.sr,initialDescendants=(await s.closure(root)).filter(r=>r.id!==root.id);
      let key:string|undefined,target:string|undefined,newRef:GraphRef|undefined,promotion:Extract<VolumeCommand,{action:'promote'}>|undefined,material:Awaited<ReturnType<Scenario['queued']>>|undefined;
      const losingOpen=createLifecycleRaceOpenObserver(x.graph(x.f.uow).crypto),raceCanonical=(u:AsyncUnitOfWork=x.f.uow)=>new KnowledgeSaveRepository(u,x.journal,x.f.native,losingOpen.crypto,{resolve:async()=>({keyId:x.keyId,generation:x.generation})},new KnowledgeStatusAdmission(losingOpen.crypto));
      let execute!:(u?:AsyncUnitOfWork)=>Promise<unknown>,phase!:(sql:string)=>boolean;
      if(operation==='read'){execute=u=>raceCanonical(u).recall(x.scope,s.kr);phase=sql=>sql.startsWith('SELECT cipher_text FROM fabric.storage_knowledge_revisions');}
      else if(operation==='save'){key=randomUUID();const c={...s.c,key,targetId:mode==='correction'?s.c.targetId:randomUUID(),assertion:{...s.c.assertion,subject:mode==='correction'?s.c.assertion.subject:'new-'+key}};target=c.targetId;execute=u=>normalize(()=>mode==='correction'?raceCanonical(u).correct(x.scope,{command:{...c,action:'correct',expectedRevision:1},prior:s.kr}):raceCanonical(u).save(x.scope,c));phase=sql=>sql.includes('storage_commit_typed_knowledge(')||sql.includes('storage_commit_corrected_knowledge(');}
      else if(operation==='job'){material=await s.queued();key=material.c.key;target=material.id;execute=async u=>{newRef=await material!.publish(u,losingOpen.crypto);return newRef;};phase=sql=>sql.includes('storage_graph_register_derived(');}
      else{const base=s.s.live(),draft=s.s.draft({sourceId:s.src.targetId});const owner=s.volumeOwner(x.f.uow);assert.equal((await owner.writeLive(x.scope,base)).status,'live-written');assert.equal((await owner.saveDraft(x.scope,draft)).status,'draft-saved');x.count.save+=2;x.count.write+=2;promotion=s.s.promote(base,draft);key=promotion.key;target=promotion.targetId;await owner.prepare(x.scope,promotion);x.count.write++;execute=u=>normalize(()=>s.volumeOwner(u,losingOpen.crypto).commit(x.scope,promotion));phase=sql=>sql.includes('storage_commit_volume(');}
      if(mode==='expiry'){const clock=(await x.f.admin.query('SELECT clock_timestamp() AS at,clock_timestamp()<$1::timestamptz AS eligible',[s.expiry])).rows[0];assert.equal(clock.eligible,true,'Every expiry pair finishes actual preparation while the source is eligible');console.log(JSON.stringify({measurement:'lifecycle-expiry-pair-prepared',variant:`L07/${mode}-${order}`,operation,preparedAt:clock.at,expiresAt:s.expiry,eligible:true}));}
      if(order==='restriction-first'&&mode==='expiry')await x.waitExpired(s.expiry);
      const g=gate();g.ready.catch(()=>{});let receipt:unknown,accepted:unknown,waiter:Promise<unknown>|undefined,winner:Promise<unknown>|undefined;
      try{
       if(order==='restriction-first'){
        winner=restriction(s,mode,event,tap(x,g,restrictSql));winner.catch(()=>{});const pid=await g.ready;const before=await x.snapshot(),economy=await accountingSnapshot(x.f);waiter=execute();waiter.catch(()=>{});await x.blocked(pid);g.release();receipt=await winner;
        let error:unknown;try{await waiter;assert.fail('restriction-first disclosed or mutated');}catch(e){error=e;}assert(error);assert(['RETENTION_RESTRICTED','STALE_REVISION','AUTHORITY_UNAVAILABLE','CONTENT_UNAVAILABLE'].includes(String((error as {code?:unknown}).code)),String((error as {code?:unknown}).code));x.count.deny++;await losingOpen.assertRestricted(x,s,operation,promotion);assert.deepEqual(await accountingSnapshot(x.f),economy);
        // The exact winning restriction adds durable state; the rejected loser
        // adds no publication, outbox or payload under its original key.
        if(key)assert.equal((await x.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[key])).rows[0].n,0);assert.notDeepEqual(await x.snapshot(),before);
       }else{
        winner=execute(tap(x,g,phase));winner.catch(()=>{});const pid=await g.ready;waiter=restriction(s,mode,event);waiter.catch(()=>{});await x.blocked(pid);g.release();accepted=await winner;
        if(operation==='read'){assert.equal((accepted as {value:string}).value,s.c.assertion.value);x.count.read++;}
        else if(operation!=='job'){x.count.save++;x.count.write++;}
        try{receipt=await waiter;}catch(e){const code=String((e as {code?:unknown}).code);assert(['AUTHORITY_UNAVAILABLE','IDEMPOTENCY_CONFLICT','RETENTION_RESTRICTED','STALE_REVISION'].includes(code),code);
         const original=await lookup(s,mode,event);if(original.status==='absent-safe'){if(mode==='expiry')await x.waitExpired(s.expiry);
          receipt=await restriction(s,mode,event);
         }else receipt=original;
        }
       }
       await durable(s,mode,event);
       const after=await x.snapshot();await x.denied(()=>x.canonical().recall(x.scope,s.kr),mode==='correction'?['STALE_REVISION']:['RETENTION_RESTRICTED']);if(s.cache)await x.denied(()=>x.graph().read(x.scope,s.cache!.ref),mode==='correction'?['STALE_REVISION']:['RETENTION_RESTRICTED']);if(newRef)await x.denied(()=>x.graph().read(x.scope,newRef!),['RETENTION_RESTRICTED','STALE_REVISION']);assert.deepEqual(await x.snapshot(),after);
       const jobs=(await x.f.admin.query('SELECT class,id,revision,witness FROM fabric.storage_graph_jobs WHERE command_key=$1 ORDER BY class,id,revision',[event.key])).rows.map(r=>({...r,revision:Number(r.revision)})) as GraphRef[];
       const extra:GraphRef[]=[];if(newRef)extra.push(newRef);if(operation==='save'&&order==='publication-first'&&mode!=='correction')extra.push(await x.ref('knowledge',target!));
       // Promotion's draft/underlying artifact are real source descendants and
       // must be in the invalidation census; never infer from logical file IDs.
       const expected=operation==='promotion'?(await s.closure(root)).filter(r=>r.id!==root.id):[...initialDescendants,...extra];assert.deepEqual(identities(jobs),identities(expected));
       if(operation==='save'&&order==='publication-first'&&mode!=='correction')await x.denied(()=>x.canonical().recall(x.scope,extra[0]!),['RETENTION_RESTRICTED']);
       if(promotion)await x.denied(()=>s.volumeOwner().read(x.scope,{kind:'draft',id:promotion!.draftId,revision:promotion!.draftRevision}),['RETENTION_RESTRICTED']);
       if(promotion&&order==='publication-first'){await x.denied(()=>s.volumeOwner().canonical(x.scope,promotion!.targetId),['RETENTION_RESTRICTED']);}
       const beforeRepeat=await x.snapshot();{assert.deepEqual(await lookup(s,mode,event),receipt);if(mode==='delete'||mode==='expiry')assert.deepEqual(await restriction(s,mode,event),receipt);}assert.deepEqual(await x.snapshot(),beforeRepeat);
       await x.complete(event);assert.deepEqual(await x.snapshot(),beforeRepeat);assert.equal((await x.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_graph_events WHERE command_key=$1',[event.key])).rows[0].n,1);x.count.owner++;
       console.log(JSON.stringify({measurement:'lifecycle-installed-order-pair',variant:`L07/${mode}-${order}`,operation,root,order,publicationAccepted:order==='publication-first',originalKey:key??null,restrictionKey:event.key,descendants:jobs.length,currentRestriction:true,remainingUnauthorizedEffects:0,alreadyDeliveredRecalled:false}));
      }finally{g.release();await winner?.catch(()=>{});await waiter?.catch(()=>{});material?.input.fill(0);s.s.bytes.fill(0);}
     }
     await x.final();collect(x);
     }finally{await x.close();}
    });
    await registerLifecycleSpecialRaceTests(t,x);collect(x);
   }finally{for(const [k,v] of old)if(v===undefined)delete process.env[k];else process.env[k]=v;}
  });assert.equal(calls,1);
 });
 observe({schemaVersion:1,measurement:'storage-observations',suite,positives,violations});
}

/** Knowledge and files have distinct canonical owners. This correction race
 * uses actual volume supersession, two useful staged promoters, observed lock,
 * exact bytes, recreated original-key recovery and immutable stale draft. */
async function fileCorrectionPair(f:PropagationVerificationFixture,order:'restriction-first'|'publication-first'){
 const s=await lifecycleRaceScenario(f,55_000,false),base=s.s.live(),a=s.s.draft({sourceId:s.src.targetId,bytes:Buffer.from('file-N+1-A-'+randomUUID()).toString('base64')}),b=s.s.draft({sourceId:s.src.targetId,bytes:Buffer.from('file-N+1-B-'+randomUUID()).toString('base64')});
 const repo=(u:AsyncUnitOfWork=f.f.uow)=>s.volumeOwner(u);for(const c of [base,a,b]){const r=c.action==='live-write'?await repo().writeLive(f.scope,c):await repo().saveDraft(f.scope,c);assert(['live-written','draft-saved'].includes(r.status));f.count.write++;f.count.save++;}
 const pa=s.s.promote(base,a),pb=s.s.promote(base,b);await repo().prepare(f.scope,pa);await repo().prepare(f.scope,pb);f.count.write+=2;
 const winning=order==='restriction-first'?pb:pa,losing=order==='restriction-first'?pa:pb,bytes=order==='restriction-first'?b.bytes:a.bytes,g=gate(),first=repo(tap(f,g,sql=>sql.includes('storage_commit_volume('))).commit(f.scope,winning);first.catch(()=>{});let second:Promise<unknown>|undefined;
 try{const pid=await g.ready;second=repo().commit(f.scope,losing);second.catch(()=>{});await f.blocked(pid);g.release();assert.equal((await first).status,'artifact-committed');const r=await second;assert.equal((r as {status:string}).status,'not-saved');f.count.save++;f.count.write++;f.count.conflict++;f.count.deny++;
  const before=await f.snapshot();assert.equal((await repo().lookup(f.scope,losing)).status,'absent-safe');await f.effects(losing,0);await f.effects(winning,1);const v=await repo().canonical(f.scope,base.targetId);try{assert.deepEqual(v.command,winning);assert(v.bytes.equals(Buffer.from(bytes,'base64')));assert.equal(v.receipt.revision,2);f.count.read++;}finally{v.bytes.fill(0);}assert.deepEqual(await f.snapshot(),before);
  if(order==='publication-first'){const d=s.s.draft({sourceId:s.src.targetId,baseRevision:2,bytes:Buffer.from('file-N+2-corrected-'+randomUUID()).toString('base64')}),p=s.s.promote({...base,expectedRevision:1},d,{expectedRevision:2});assert.equal((await repo().saveDraft(f.scope,d)).status,'draft-saved');assert.equal((await repo().promote(f.scope,p)).status,'artifact-committed');f.count.save+=2;f.count.write+=2;const c=await repo().canonical(f.scope,p.targetId);try{assert.equal(c.receipt.revision,3);assert.deepEqual(c.command,p);assert(c.bytes.equals(Buffer.from(d.bytes,'base64')));f.count.read++;}finally{c.bytes.fill(0);}const snap=await f.snapshot();assert.equal((await repo().commit(f.scope,losing)).status,'not-saved');await f.effects(losing,0);assert.deepEqual(await f.snapshot(),snap);f.count.deny++;}
  const row=(await f.f.admin.query("SELECT max(revision)::int AS n FROM fabric.storage_volume_versions WHERE kind='live-file' AND id=$1",[base.targetId])).rows[0];assert.equal(row.n,order==='publication-first'?3:2);const old=await repo().read(f.scope,{kind:'draft',id:a.targetId,revision:1});try{assert(old.bytes.equals(Buffer.from(a.bytes,'base64')));f.count.read++;}finally{old.bytes.fill(0);}f.count.owner++;
  console.log(JSON.stringify({measurement:'lifecycle-file-correction-order',variant:'L07/correction-'+order,operation:'promotion',order,canonicalRevision:row.n,staleEffects:0,oldDraftRetained:true,knowledgeRevisionDoesNotOwnFile:true}));
 }finally{g.release();await first.catch(()=>{});await second?.catch(()=>{});s.s.bytes.fill(0);}
}

async function knowledgeCorrectionSavePair(f:PropagationVerificationFixture,order:'restriction-first'|'publication-first'){
 const s=await lifecycleRaceScenario(f,55_000),a=f.command(s.s.task.binding.sessionId),b=f.command(s.s.task.binding.sessionId),make=(key:typeof a,prior:GraphRef=s.kr)=>({command:{...s.c,action:'correct' as const,...key,expectedRevision:prior.revision,assertion:{...s.c.assertion,value:'correction-'+key.key}},prior}),winner=order==='restriction-first'?make(b):make(a),loser=order==='restriction-first'?make(a):make(b),g=gate();g.ready.catch(()=>{});
 const first=normalize(()=>f.canonical(tap(f,g,sql=>sql.includes('storage_commit_corrected_knowledge('))).correct(f.scope,winner));first.catch(()=>{});let second:Promise<unknown>|undefined;
 try{const pid=await g.ready;second=normalize(()=>f.canonical().correct(f.scope,loser));second.catch(()=>{});await f.blocked(pid);g.release();assert.equal((await first).status,'saved-here');await assert.rejects(second,(e:unknown)=>['STALE_REVISION','RETENTION_RESTRICTED','AUTHORITY_UNAVAILABLE'].includes(String((e as {code?:unknown}).code)));f.count.deny++;f.count.conflict++;f.count.write++;f.count.save++;
  const before=await f.snapshot();assert.equal((await f.canonical().lookupCorrection(f.scope,loser)).status,'absent-safe');assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_head_publications WHERE command_key=$1',[loser.command.key])).rows[0].n,0);const event={key:winner.command.key,sessionId:winner.command.sessionId,expiresAt:winner.command.expiresAt},progress=await f.progress(event);assert.deepEqual(identities(progress.jobs.map(j=>j.ref)),identities([s.cache!.ref]));assert.equal(progress.completed,0);assert.equal(progress.remaining,1);await f.denied(()=>f.graph().read(f.scope,s.cache!.ref),['STALE_REVISION']);const current=await f.ref('knowledge',s.kr.id,2);assert.equal((await f.canonical().recall(f.scope,current)).value,winner.command.assertion.value);f.count.read++;assert.deepEqual(await f.snapshot(),before);await f.complete(event);assert.deepEqual(await f.snapshot(),before);
  if(order==='publication-first'){
   // Explicit new correction against current N+1; never change/replay the
   // original losing binding after original-key absence reconciliation.
   const fresh=make(f.command(s.s.task.binding.sessionId),current);assert.equal((await f.canonical().correct(f.scope,fresh)).status,'saved-here');f.count.save++;f.count.write++;const control={key:fresh.command.key,sessionId:fresh.command.sessionId,expiresAt:fresh.command.expiresAt},p=await f.progress(control);assert.equal(p.total,0);assert.equal(p.remaining,0);assert.equal(p.completed,0);await f.complete(control);assert.equal((await f.canonical().recall(f.scope,await f.ref('knowledge',s.kr.id,3))).value,fresh.command.assertion.value);f.count.read++;const snap=await f.snapshot();const r=await f.canonical().correct(f.scope,loser);assert.equal(r.status,'not-saved');assert.equal((await f.canonical().lookupCorrection(f.scope,loser)).status,'absent-safe');assert.deepEqual(await f.snapshot(),snap);f.count.deny++;
  }
  assert.equal((await f.f.admin.query('SELECT max(revision)::int AS n FROM fabric.storage_knowledge_revisions WHERE id=$1',[s.kr.id])).rows[0].n,order==='publication-first'?3:2);f.count.owner++;
  console.log(JSON.stringify({measurement:'lifecycle-knowledge-correction-save-order',variant:'L07/correction-'+order,operation:'save',winnerKey:winner.command.key,staleOriginalKey:loser.command.key,staleEffects:0,originalBindingReplayed:false,exactInitialJobs:1,explicitLaterCorrectionJobs:order==='publication-first'?0:null,currentRevision:order==='publication-first'?3:2}));
 }finally{g.release();await first.catch(()=>{});await second?.catch(()=>{});s.s.bytes.fill(0);}
}
