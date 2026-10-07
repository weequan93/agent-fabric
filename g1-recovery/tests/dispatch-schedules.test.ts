import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRecoveryFixture} from './pg-fixture.js';
import {census,freePort,launchOwned,stopOwned,waitUntil,type OwnedChild} from './process-fixture.js';
import {migrateRecovery} from '../src/migration.js';
import {migrateNativeHistory} from '../src/native-migration.js';
import {migrateEffectHistory} from '../src/effect-migration.js';
import {migrateFences} from '../src/fence-migration.js';
import {migrateDispatch} from '../src/dispatch-migration.js';
import {previewOccurrences,validateCalendar} from '../src/dispatch-calendar.js';
import {bindingDigest,runSchema,effectSchema,type Effect} from '../src/contracts.js';
import {DispatchRepository,occurrenceId,type Schedule,type DispatchCommand,type Occurrence} from '../src/dispatch-repository.js';
import {RecoveryRepository} from '../src/repository.js';
import {createNativeActivities} from '../src/native-activities.js';
import {EffectRepository} from '../src/effect-repository.js';
import {createEffectActivities,type EffectRef} from '../src/effect-activities.js';
import {ExactApprovalRepository} from '../../g1-identity/src/approval-repository.js';
import {audienceDigest,type AudienceRow} from '../../g1-identity/src/audience.js';
import type {ExactApprovalBinding} from '../../g1-identity/src/contracts.js';
import {AuthenticatedUnitOfWork} from '../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../g1-foundations/src/postgres-uow.js';
import {FenceRepository} from '../src/fence-repository.js';

let f:Awaited<ReturnType<typeof createRecoveryFixture>>,directory:string,dispatch:DispatchRepository;
const owner=randomUUID(),children:OwnedChild[]=[];
before(async()=>{
 census();f=await createRecoveryFixture();
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve('migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve('migrations/0005_native_history.sql'));
 await migrateEffectHistory(f.admin,resolve('migrations/0006_effect_reconciliation.sql'));
 await migrateFences(f.admin,resolve('migrations/0007_fences.sql'));
 await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));
 dispatch=new DispatchRepository(f.repo);
 directory=await mkdtemp(resolve(tmpdir(),'fabric-dispatch-'+owner+'-'));
 await writeFile(resolve(directory,'owner'),owner,{flag:'wx'});
});
after(async()=>{
 const errors:unknown[]=[];
 for(const child of children.toReversed())try{await stopOwned(child);}catch(e){errors.push(e);}
 try{await f?.close();}catch(e){errors.push(e);}
 try{if(directory){assert.equal(await readFile(resolve(directory,'owner'),'utf8'),owner);await rm(directory,{recursive:true});console.log(JSON.stringify({measurement:'owned-dispatch-files-cleanup',owner,removed:true}));}}catch(e){errors.push(e);}
 if(errors.length)throw new AggregateError(errors,'Mandatory dispatch fixture cleanup');
});
async function seed(){
 const scope=await f.scopeFor(1),s=await f.seedRun(scope);await f.repo.initialize(scope,s.init,s.value);
 const run=runSchema.parse({...s.value.run,state:'running',revision:2}),cp={run,session:s.value.session,result:null};
 await f.repo.checkpoint(scope,f.mutation(s.runId,1,cp),cp);return {...s,run};
}
const expiry=(ms=60000)=>new Date(Date.now()+ms).toISOString();
const command=(expectedRevision:number,overrides:Partial<DispatchCommand>={}):DispatchCommand=>({key:randomUUID(),expiresAt:expiry(),expectedRevision,...overrides});
async function scheduled(overrides:Partial<Schedule>={}){
 const s=await seed(),config:Schedule={scheduleId:randomUUID(),runId:s.runId,sessionId:s.value.session.sessionId,sequence:1,ownerActorId:f.actors[1],principalKind:'human',timezone:'Asia/Singapore',recurrence:{kind:'interval',startAt:expiry(30000),everyMs:60000},expiresAt:expiry(),policyRevision:1,connectionId:randomUUID(),connectionExpiresAt:expiry(),inputDigest:s.value.session.contextDigest,deliveryAudience:[f.actors[1]],maxCostMicrounits:20,maxRuntimeMs:10000,waitMs:5000,graceMs:10000,maxCatchUp:10,overlap:'exclude',missed:'skip',effectClass:'read',operationId:null,inputReady:true,resourceReady:true,...overrides};
 const create=command(0),record=await dispatch.create(await f.scopeFor(1),create,config);return {...s,config,create,record};
}
type Scheduled=Awaited<ReturnType<typeof scheduled>>;
async function event(s:Scheduled,overrides:{id?:string;at?:string;cmd?:DispatchCommand}={}){
 const record=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);
 return dispatch.trigger(await f.scopeFor(1),overrides.cmd??command(record.revision),s.config.scheduleId,overrides.id??randomUUID(),overrides.at??new Date().toISOString());
}
async function stored(s:Scheduled,id:string){const o=(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId)).find(row=>row.occurrenceId===id);assert.ok(o);return o;}
async function setControls(s:Scheduled,overrides:Partial<Parameters<DispatchRepository['controls']>[3]>={}){
 const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);
 return dispatch.controls(await f.scopeFor(1),command(current.revision),s.config.scheduleId,{...current.controls,...overrides});
}
async function assertWait(s:Scheduled,o:Occurrence,reason:string,action:string){
 assert.equal(o.state,'waiting');assert.equal(o.wait?.reason,reason);assert.equal(o.wait?.ownerId,f.actors[1]);assert.equal(o.wait?.nextAction,action);
 assert.equal(Date.parse(o.wait!.expiresAt)-Date.parse(o.wait!.since),s.config.waitMs);
 const restored=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.deepEqual((await restored.occurrences(await f.scopeFor(1),s.config.scheduleId)).find(row=>row.occurrenceId===o.occurrenceId),o);
}

test('DISPATCH/calendar preview honors explicit timezone and non-destructive interval boundaries',()=>{
 const recurrence={kind:'interval',startAt:'2026-01-01T00:00:00.000Z',everyMs:60000};
 assert.deepEqual(previewOccurrences('Asia/Singapore',recurrence,'2025-12-31T23:59:59.999Z','2026-01-01T00:02:00.000Z'),['2026-01-01T00:00:00.000Z','2026-01-01T00:01:00.000Z','2026-01-01T00:02:00.000Z']);
 assert.deepEqual(previewOccurrences('Asia/Singapore',recurrence,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),[]);
});
test('DISPATCH/calendar skips real IANA DST gaps instead of moving destructive occurrence',()=>{
 const r={kind:'daily',startAt:'2026-03-07T00:00:00.000Z',hour:2,minute:30,gap:'skip',fold:'earlier'};
 assert.deepEqual(previewOccurrences('America/New_York',r,'2026-03-07T00:00:00.000Z','2026-03-10T00:00:00.000Z'),['2026-03-07T07:30:00.000Z','2026-03-09T06:30:00.000Z']);
});
for(const [fold,instant] of [['earlier','2026-11-01T05:30:00.000Z'],['later','2026-11-01T06:30:00.000Z']] as const)test('DISPATCH/calendar DST fold chooses exactly one explicit '+fold+' instant',()=>{
 assert.deepEqual(previewOccurrences('America/New_York',{kind:'daily',startAt:'2026-11-01T00:00:00.000Z',hour:1,minute:30,gap:'skip',fold},'2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z'),[instant]);
});
test('DISPATCH/calendar handles half-hour timezone offset without UTC-day substitution',()=>{
 assert.deepEqual(previewOccurrences('Asia/Kolkata',{kind:'daily',startAt:'2026-01-01T00:00:00.000Z',hour:9,minute:15,gap:'skip',fold:'earlier'},'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z'),['2026-01-01T03:45:00.000Z']);
});
test('DISPATCH/calendar rejects missing, invalid or offset-only timezone and malformed recurrence',()=>{
 const r={kind:'interval',startAt:'2026-01-01T00:00:00.000Z',everyMs:60000};
 for(const timezone of [null,undefined,'','Mars/Olympus','+08:00'])assert.throws(()=>validateCalendar(timezone,r));
 for(const recurrence of [{...r,everyMs:0},{...r,everyMs:-1},{...r,everyMs:1.5},{...r,unknown:true},{kind:'daily',startAt:r.startAt,hour:24,minute:0,gap:'skip',fold:'earlier'},{kind:'daily',startAt:r.startAt,hour:1,minute:0,gap:'shift',fold:'earlier'},{kind:'daily',startAt:r.startAt,hour:1,minute:0,gap:'skip',fold:'both'}])assert.throws(()=>validateCalendar('UTC',recurrence));
});
test('DISPATCH/calendar rejects unbounded backlog instead of truncating stale occurrences',()=>{
 const r={kind:'interval',startAt:'2026-01-01T00:00:00.000Z',everyMs:1000};
 assert.throws(()=>previewOccurrences('UTC',r,'2026-01-01T00:00:00.000Z','2026-01-01T00:02:00.000Z',100),/limit/);
 assert.throws(()=>previewOccurrences('UTC',r,'2026-01-01T00:00:00.000Z','2027-01-03T00:00:00.000Z'),/horizon/);
 assert.throws(()=>previewOccurrences('UTC',r,'2026-01-02T00:00:00.000Z','2026-01-01T00:00:00.000Z'),/horizon/);
});
test('DISPATCH/additive migration8 verifies digest and idempotency with prior migration ledgers unchanged',async()=>{
 const ledger=(await f.admin.query('SELECT version,digest FROM public.fabric_recovery_migrations ORDER BY version')).rows;
 assert.deepEqual(ledger.map(r=>Number(r.version)),[4,5,6,7,8]);
 for(const [version,path] of [[4,'0004_recovery.sql'],[5,'0005_native_history.sql'],[6,'0006_effect_reconciliation.sql'],[7,'0007_fences.sql'],[8,'0008_dispatch.sql']] as const)assert.equal(ledger.find(r=>Number(r.version)===version)?.digest,createHash('sha256').update(await readFile(resolve('migrations',path))).digest('hex'));
 const foundation=(await f.admin.query('SELECT * FROM public.fabric_foundation_migrations ORDER BY version')).rows;
 await migrateDispatch(f.admin,resolve('migrations/0008_dispatch.sql'));assert.deepEqual((await f.admin.query('SELECT version,digest FROM public.fabric_recovery_migrations ORDER BY version')).rows,ledger);
 const incompatible=resolve(directory,'incompatible-migration8.sql');await writeFile(incompatible,(await readFile(resolve('migrations/0008_dispatch.sql'),'utf8'))+'\n-- changed bytes\n');
 await assert.rejects(migrateDispatch(f.admin,incompatible),/incompatible/);
 assert.deepEqual((await f.admin.query('SELECT version,digest FROM public.fabric_recovery_migrations ORDER BY version')).rows,ledger);
 assert.deepEqual((await f.admin.query('SELECT * FROM public.fabric_foundation_migrations ORDER BY version')).rows,foundation);
});
test('DISPATCH/SQL history is forced scoped and denied to native worker, client and IdP',async()=>{
 const tables=['recovery_schedules','recovery_occurrences','recovery_dispatch_receipts','recovery_dispatch_events'];
 const flags=(await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='fabric'::regnamespace AND relname=ANY($1)",[tables])).rows;
 assert.equal(flags.length,tables.length);for(const flag of flags){assert.equal(flag.relrowsecurity,true);assert.equal(flag.relforcerowsecurity,true);}
 for(const pool of [f.worker,f.client,f.idp])for(const table of tables)await assert.rejects(pool.query('SELECT * FROM fabric.'+table),/permission denied/);
 const bare=await f.controller.connect();try{
  await bare.query('BEGIN');await bare.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.space_id',$2,true),set_config('app.actor_id',$3,true)",[f.tenant,f.space,f.actors[1]]);
  for(const table of tables)assert.equal((await bare.query('SELECT * FROM fabric.'+table)).rows.length,0);
  await bare.query('ROLLBACK');
 }finally{bare.release();}
});
test('DISPATCH/create retains explicit identity, timezone, expiry, limits and immutable command receipt',async()=>{
 const s=await scheduled();assert.deepEqual(s.record.config,s.config);assert.equal(s.record.state,'active');
 const recreated=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.deepEqual(await recreated.create(await f.scopeFor(1),s.create,s.config),s.record);
 await assert.rejects(recreated.create(await f.scopeFor(1),s.create,{...s.config,timezone:'UTC'}));
 const receipt=(await f.admin.query('SELECT * FROM fabric.recovery_dispatch_receipts WHERE command_key=$1',[s.create.key])).rows[0];
 assert.equal(receipt.actor_id,f.actors[1]);assert.equal((await f.admin.query('SELECT * FROM fabric.recovery_dispatch_events WHERE event_id=$1',[receipt.event_id])).rowCount,1);
 await assert.rejects(f.admin.query('DELETE FROM fabric.recovery_dispatch_receipts WHERE command_key=$1',[s.create.key]),/immutable/);
 await assert.rejects(f.admin.query('UPDATE fabric.recovery_dispatch_events SET record=$2 WHERE event_id=$1',[receipt.event_id,'{}']),/immutable/);
});
test('DISPATCH/create rejects owner or service impersonation, stale policy, invalid timezone and exhausted sequence',async()=>{
 const s=await scheduled();
 for(const changes of [{ownerActorId:f.actors[0]},{principalKind:'service' as const},{policyRevision:2},{timezone:'Mars/Olympus'},{sequence:2},{sessionId:randomUUID()},{runId:randomUUID()},{inputDigest:bindingDigest('different template')},{deliveryAudience:[]},{deliveryAudience:[f.actors[1],f.actors[1]]},{overlap:'allow'},{maxRuntimeMs:60001},{waitMs:86400001}])await assert.rejects(dispatch.create(await f.scopeFor(1),command(0),{...s.config,...changes,scheduleId:randomUUID()} as Schedule));
 assert.equal((await f.admin.query('SELECT count(*) FROM fabric.recovery_schedules WHERE run_id=$1',[s.runId])).rows[0].count,'1');
});
test('DISPATCH/preview reads authorized saved schedule and produces zero occurrences or native calls',async()=>{
 const s=await scheduled(),start=s.config.recurrence.startAt;
 assert.deepEqual(await dispatch.preview(await f.scopeFor(1),s.config.scheduleId,new Date(Date.parse(start)-1).toISOString(),new Date(Date.parse(start)+120000).toISOString()),[start,new Date(Date.parse(start)+60000).toISOString(),new Date(Date.parse(start)+120000).toISOString()]);
 assert.deepEqual(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId),[]);assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
 await assert.rejects(dispatch.preview(await f.scopeFor(1,f.source),s.config.scheduleId,start,start));
});
test('DISPATCH/expired command or schedule is refused before creating or submitting work',async()=>{
 const s=await scheduled();
 await assert.rejects(dispatch.create(await f.scopeFor(1),command(0,{expiresAt:expiry(-1000)}),{...s.config,scheduleId:randomUUID()}));
 await assert.rejects(dispatch.create(await f.scopeFor(1),command(0),{...s.config,scheduleId:randomUUID(),expiresAt:expiry(-1000)}));
 await assert.rejects(event(s,{cmd:command(1,{expiresAt:expiry(-1000)})}));
 const o=await event(s);await assert.rejects(dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry(-1000)));assert.equal((await stored(s,o.occurrenceId)).state,'queued');
});
test('DISPATCH/real database timer expires schedule without stale fires',async()=>{
 const s=await scheduled({expiresAt:expiry(150),recurrence:{kind:'interval',startAt:expiry(300),everyMs:60000}});
 await waitUntil(async()=>Date.now()>Date.parse(s.config.expiresAt),'actual schedule expiry');
 assert.deepEqual(await dispatch.tick(await f.scopeFor(1),s.config.scheduleId),[]);assert.equal((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).state,'expired');
 await assert.rejects(event(s));assert.deepEqual(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId),[]);
});
test('DISPATCH/concurrent event commands dedup by stable event ID and original immutable receipt',async()=>{
 const s=await scheduled(),id=randomUUID(),at=new Date().toISOString(),c=command(1);
 const duplicates=await Promise.all(Array.from({length:12},()=>event(s,{id,at,cmd:c})));for(const o of duplicates)assert.deepEqual(o,duplicates[0]);
 const distinct=await Promise.all(Array.from({length:8},()=>event(s,{id,at})));for(const o of distinct)assert.deepEqual(o,duplicates[0]);
 assert.equal(duplicates[0]!.occurrenceId,occurrenceId(s.config.scheduleId,at,id));assert.equal((await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId)).length,1);
 await assert.rejects(event(s,{id,at:new Date(Date.parse(at)-1).toISOString()}));
 await assert.rejects(event(s,{id:randomUUID(),at,cmd:c}));
 console.log(JSON.stringify({measurement:'dispatch-event-dedup',scheduleId:s.config.scheduleId,eventId:id,concurrentTriggers:20,occurrences:1}));
});
test('DISPATCH/concurrent timer scans preserve stable occurrence and durable cursor after repository recreation',async()=>{
 const at=expiry(-300),s=await scheduled({recurrence:{kind:'interval',startAt:at,everyMs:60000}});
 await Promise.all(Array.from({length:8},async()=>dispatch.tick(await f.scopeFor(1),s.config.scheduleId)));
 const occurrences=await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId);assert.equal(occurrences.length,1);assert.equal(occurrences[0]!.occurrenceId,occurrenceId(s.config.scheduleId,at));
 const restored=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));assert.deepEqual(await restored.tick(await f.scopeFor(1),s.config.scheduleId),[]);
 assert.equal((await restored.get(await f.scopeFor(1),s.config.scheduleId)).cursor,at);
});
test('DISPATCH/concurrent admission claims one ticket and excludes overlap from another event',async()=>{
 const s=await scheduled(),one=await event(s),two=await event(s);
 const tickets=await Promise.all(Array.from({length:12},async()=>dispatch.admit(await f.scopeFor(1),one.occurrenceId,expiry())));
 assert.equal(tickets.filter(Boolean).length,1);assert.equal(await dispatch.admit(await f.scopeFor(1),two.occurrenceId,expiry()),null);
 const waiting=await stored(s,two.occurrenceId);await assertWait(s,waiting,'resource','wait-resource');assert.equal(waiting.detail,'overlap-excluded');
 const ticket=tickets.find(Boolean)!;let model=0;await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:ticket.generation,measure:r=>{if(r.kind==='model')model++;}}).nativeTurn(ticket.ref,ticket.sequence);
 assert.equal((await dispatch.recover(await f.scopeFor(1),one.occurrenceId)).state,'completed');assert.equal(model,1);
 const second=await dispatch.admit(await f.scopeFor(1),two.occurrenceId,expiry());assert.ok(second);await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:second.generation,measure:r=>{if(r.kind==='model')model++;}}).nativeTurn(second.ref,second.sequence);
 assert.equal(model,1);assert.equal((await dispatch.recover(await f.scopeFor(1),two.occurrenceId)).state,'completed');
});
for(const [field,reason,action] of [['inputReady','input','clarify'],['resourceReady','resource','wait-resource']] as const)test('DISPATCH/missing '+reason+' persists bounded owner action and rechecks explicit restoration',async()=>{
 const s=await scheduled({[field]:false}),o=await event(s);await assertWait(s,o,reason,action);assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 await setControls(s,{[field]:true});assert.ok(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()));
});
test('DISPATCH/backed reservation exhaustion persists budget wait instead of increasing autonomy',async()=>{
 const s=await scheduled();await f.admin.query('UPDATE fabric.budget_reservations SET amount=1 WHERE reservation_id=$1',[s.reservationId]);
 const o=await event(s);await assertWait(s,o,'budget','add-budget');assert.equal(o.detail,'missing-budget');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 assert.equal((await f.admin.query('SELECT amount FROM fabric.budget_reservations WHERE reservation_id=$1',[s.reservationId])).rows[0].amount,'1');
});
test('DISPATCH/expired execution lease persists resource wait and never executes native model',async()=>{
 const s=await scheduled(),snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(snap);
 await f.admin.query('UPDATE fabric.recovery_leases SET record=$2 WHERE lease_id=$1',[snap.leases[0]!.leaseId,JSON.stringify({...snap.leases[0],expiresAt:expiry(-1000)})]);
 const o=await event(s);await assertWait(s,o,'resource','wait-resource');assert.equal(o.detail,'expired-or-stale-lease');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
});
test('DISPATCH/exact approval absent persists approval wait without invoking external writer',async()=>{
 const s=await scheduled({effectClass:'external-write',operationId:randomUUID()}),o=await event(s);
 await assertWait(s,o,'approval','review-action');assert.equal(o.detail,'exact-operation-approval-required');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects.length,0);
});
test('DISPATCH/bounded wait expires and later input restoration cannot resurrect it',async()=>{
 const s=await scheduled({inputReady:false,waitMs:150}),o=await event(s);await assertWait(s,o,'input','clarify');
 await waitUntil(async()=>Date.now()>Date.parse(o.wait!.expiresAt),'persisted wait deadline');await setControls(s,{inputReady:true});assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 assert.equal((await stored(s,o.occurrenceId)).state,'expired');assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
});
test('DISPATCH/connection expiry pauses timer; renewal requires explicit authorized schedule resume',async()=>{
 const s=await scheduled({connectionExpiresAt:expiry(150),recurrence:{kind:'interval',startAt:expiry(300),everyMs:60000}});
 await waitUntil(async()=>Date.now()>Date.parse(s.config.connectionExpiresAt),'connection expires');assert.deepEqual(await dispatch.tick(await f.scopeFor(0),s.config.scheduleId),[]);
 const paused=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);assert.equal(paused.state,'paused');assert.equal(paused.wait?.reason,'connection');assert.equal(paused.wait?.nextAction,'reconnect');
 await setControls(s,{connectionExpiresAt:expiry()});assert.deepEqual(await dispatch.tick(await f.scopeFor(1),s.config.scheduleId),[]);assert.equal((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).state,'paused');
 const restored=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);await dispatch.resume(await f.scopeFor(1),command(restored.revision),s.config.scheduleId);assert.equal((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).state,'active');
});
test('DISPATCH/revoked connection pauses pending occurrence and renewal preserves stable event identity',async()=>{
 const s=await scheduled(),o=await event(s);await setControls(s,{connectionRevoked:true});assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 await assertWait(s,await stored(s,o.occurrenceId),'connection','reconnect');await dispatch.tick(await f.scopeFor(0),s.config.scheduleId);
 await setControls(s,{connectionRevoked:false});const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);await assert.rejects(dispatch.resume(await f.scopeFor(0),command(current.revision),s.config.scheduleId));
 await dispatch.resume(await f.scopeFor(1),command(current.revision),s.config.scheduleId);assert.ok(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()));assert.equal((await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId)).length,1);
});
test('DISPATCH/owner revocation is durably paused by another current observer and blocks stale admission',async()=>{
 const s=await scheduled(),o=await event(s),oldScope=await f.scopeFor(1);
 await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read'])]);
 try{
  assert.deepEqual(await dispatch.tick(await f.scopeFor(0),s.config.scheduleId),[]);const paused=await dispatch.get(await f.scopeFor(0),s.config.scheduleId);
  assert.equal(paused.state,'paused');assert.equal(paused.wait?.reason,'permission');assert.equal(paused.wait?.ownerId,f.actors[1]);assert.equal(paused.wait?.nextAction,'request-access');
  await assert.rejects(dispatch.admit(oldScope,o.occurrenceId,expiry()));await assert.rejects(dispatch.resume(await f.scopeFor(0),command(paused.revision),s.config.scheduleId));assert.equal((await f.repo.nativeTranscript(await f.scopeFor(0),s.config.sessionId)).length,0);
 }finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1],JSON.stringify(['task:read','task:write','approval:approve'])]);}
 assert.deepEqual(await dispatch.tick(await f.scopeFor(0),s.config.scheduleId),[]);assert.equal((await dispatch.get(await f.scopeFor(0),s.config.scheduleId)).state,'paused');
});
test('DISPATCH/future event timestamp and cross-Space occurrence admission fail without writes',async()=>{
 const s=await scheduled();await assert.rejects(event(s,{at:expiry()}));const o=await event(s);
 await assert.rejects(dispatch.admit(await f.scopeFor(1,f.source),o.occurrenceId,expiry()));await assert.rejects(dispatch.admit(await f.scopeFor(0),o.occurrenceId,expiry()));assert.equal((await stored(s,o.occurrenceId)).state,'queued');
});
for(const missed of ['skip','coalesce','catch-up'] as const)test('DISPATCH/database-clock missed-run policy '+missed+' retains every stable occurrence without bulk destructive replay',async()=>{
 const start=expiry(-3100),s=await scheduled({recurrence:{kind:'interval',startAt:start,everyMs:1000},graceMs:0,missed});
 const due=await dispatch.tick(await f.scopeFor(1),s.config.scheduleId);assert.ok(due.length>=4);
 for(const o of due)assert.equal(o.occurrenceId,occurrenceId(s.config.scheduleId,o.at));
 if(missed==='skip'){assert.ok(due.every(o=>o.state==='skipped'));assert.ok(due.every(o=>o.detail==='missed-skip'));}
 if(missed==='coalesce'){assert.equal(due.filter(o=>o.state==='queued').length,1);assert.equal(due.filter(o=>o.state==='skipped').length,due.length-1);assert.equal(due.at(-1)!.state,'queued');}
 if(missed==='catch-up'){assert.ok(due.every(o=>o.state==='waiting'&&o.detail==='authorize-exact-missed-occurrence'));assert.equal(await dispatch.admit(await f.scopeFor(1),due[0]!.occurrenceId,expiry()),null);}
 assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
});
test('DISPATCH/explicit catch-up authorization is exact, bounded, expiring and requires current approval grant',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(-3100),everyMs:1000},graceMs:0,missed:'catch-up',maxCatchUp:2}),due=await dispatch.tick(await f.scopeFor(1),s.config.scheduleId);
 const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId),one=due[0]!.occurrenceId;
 for(const [occurrences,at] of [[[one],expiry(-1000)],[[one,one],expiry(5000)],[[one,due[1]!.occurrenceId,due[2]!.occurrenceId],expiry(5000)],[[randomUUID()],expiry(5000)],[[one],expiry(120000)]] as const)await assert.rejects(dispatch.authorizeCatchUp(await f.scopeFor(1),command(current.revision),s.config.scheduleId,occurrences,at));
 await dispatch.authorizeCatchUp(await f.scopeFor(1),command(current.revision),s.config.scheduleId,[one],expiry(5000));assert.ok(await dispatch.admit(await f.scopeFor(1),one,expiry()));assert.equal(await dispatch.admit(await f.scopeFor(1),due[1]!.occurrenceId,expiry()),null);
 assert.deepEqual((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).permits,{});
});
test('DISPATCH/expired exact catch-up permit leaves approval wait and cannot authorize stale write',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(-300),everyMs:60000},graceMs:0,missed:'catch-up'}),due=await dispatch.tick(await f.scopeFor(1),s.config.scheduleId),o=due[0]!;
 const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId),at=expiry(150);await dispatch.authorizeCatchUp(await f.scopeFor(1),command(current.revision),s.config.scheduleId,[o.occurrenceId],at);
 await waitUntil(async()=>Date.now()>Date.parse(at),'exact catch-up approval expiry');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);assert.equal((await stored(s,o.occurrenceId)).detail,'authorize-exact-missed-occurrence');
});
test('DISPATCH/excess backlog fails closed with persisted input owner action and never advances cursor',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(-2000),everyMs:1},graceMs:0,missed:'catch-up'}),before=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);
 assert.deepEqual(await dispatch.tick(await f.scopeFor(1),s.config.scheduleId),[]);const after=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);assert.equal(after.state,'paused');assert.equal(after.wait?.reason,'input');assert.equal(after.wait?.nextAction,'clarify');assert.equal(after.cursor,before.cursor);assert.deepEqual(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId),[]);
});
const workerFiles=new Map<number,string>();
async function worker(s:Scheduled,holdAfter:'admit'|'checkpoint'|null=null,monitorToken?:string){
 const marker='--fixture-owner='+owner,measurementPath=resolve(directory,'worker-'+randomUUID()+'.jsonl');
 const child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/dispatch-worker-process.js',import.meta.url)),marker],marker,{...process.env,FABRIC_DISPATCH_WORKER:JSON.stringify({owner,dsn:f.dsn,issuer:f.endpoints.issuer,jwksUrl:f.endpoints.jwksUrl,token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,scheduleId:s.config.scheduleId,measurementPath,pollMs:50,holdAfter,...monitorToken?{monitorToken}:{}})});
 children.push(child);workerFiles.set(child.pid,measurementPath);await waitUntil(async()=>{if(child.child.exitCode!==null||child.child.signalCode!==null)throw new Error('Dispatch worker exited '+child.errors());return child.output().includes('"kind":"ready"');},'actual durable Dispatch worker readiness');
 assert.ok(census().find(row=>row.pid===child.pid)?.command.includes('dispatch-worker-process.js'));return child;
}
async function logs(child:OwnedChild){return (await readFile(workerFiles.get(child.pid)!,'utf8')).trim().split('\n').map(line=>JSON.parse(line) as Record<string,unknown>);}
async function observed(child:OwnedChild,kind:string){await waitUntil(async()=>{if(child.child.exitCode!==null||child.child.signalCode!==null)throw new Error(child.errors());return (await logs(child)).some(row=>row.kind===kind);},'actual Dispatch '+kind);}
async function replacement(s:Scheduled){const snap=await f.repo.get(await f.scopeFor(1),s.runId);assert.ok(snap);const value={sessionId:s.config.sessionId,previousWorker:snap.run.generation.worker,nextWorker:snap.run.generation.worker+1};await f.repo.replaceWorker(await f.scopeFor(1),f.mutation(s.runId,snap.run.revision,value),value);}
test('DISPATCH/actual independent timer process fires native controller and completed receipt survives recreation',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(500),everyMs:60000}}),first=await worker(s);
 await observed(first,'settled');await stopOwned(first,'SIGKILL');
 const before=await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId);assert.equal(before.length,1);assert.equal(before[0]!.state,'completed');
 const second=await worker(s);await waitUntil(async()=>(await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).revision>s.record.revision+2,'recreated timer scans');await stopOwned(second);
 assert.deepEqual(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId),before);assert.equal((await logs(first)).filter(row=>row.kind==='model').length,1);assert.equal((await logs(second)).filter(row=>row.kind==='model').length,0);
 assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,1);
 console.log(JSON.stringify({measurement:'actual-dispatch-timer-recreation',oldPid:first.pid,newPid:second.pid,occurrenceId:before[0]!.occurrenceId,first:await logs(first),second:await logs(second),nativeModelCalls:1,recoveryModelCalls:0}));
});
test('DISPATCH/crash after durable checkpoint before settlement recovers original receipt with zero new model calls',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(500),everyMs:60000}}),first=await worker(s,'checkpoint');
 await observed(first,'checkpoint-durable');const pending=(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId))[0]!;assert.equal(pending.state,'submitted');await stopOwned(first,'SIGKILL');
 await replacement(s);const second=await worker(s);await observed(second,'recovered');await waitUntil(async()=>(await stored(s,pending.occurrenceId)).state==='completed','original committed checkpoint recovery');await stopOwned(second);
 assert.equal((await logs(first)).filter(row=>row.kind==='model').length,1);assert.equal((await logs(second)).filter(row=>row.kind==='model').length,0);assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,1);
 console.log(JSON.stringify({measurement:'dispatch-checkpoint-crash-recovery',oldPid:first.pid,newPid:second.pid,occurrenceId:pending.occurrenceId,first:await logs(first),second:await logs(second),repeatedModels:0}));
});
test('DISPATCH/crash after admission never executes absent checkpoint until explicit fenced authorized resume',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(500),everyMs:60000}}),first=await worker(s,'admit');await observed(first,'admitted');
 const original=(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId))[0]!;await stopOwned(first,'SIGKILL');const second=await worker(s);await observed(second,'recovered');await stopOwned(second);
 const uncertain=await stored(s,original.occurrenceId);assert.equal(uncertain.state,'reconciling');assert.equal(uncertain.detail,'checkpoint-absent-explicit-resume-required');assert.equal((await logs(second)).filter(row=>row.kind==='model').length,0);
 const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId);await assert.rejects(dispatch.resumeOccurrence(await f.scopeFor(1),command(current.revision),original.occurrenceId));await replacement(s);
 await assert.rejects(dispatch.resumeOccurrence(await f.scopeFor(0),command(current.revision),original.occurrenceId));await dispatch.resumeOccurrence(await f.scopeFor(1),command(current.revision),original.occurrenceId);
 const third=await worker(s);await observed(third,'settled');await stopOwned(third);assert.equal((await stored(s,original.occurrenceId)).state,'completed');assert.equal((await logs(third)).filter(row=>row.kind==='model').length,1);assert.equal((await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId)).length,1);
 console.log(JSON.stringify({measurement:'dispatch-admission-crash-explicit-resume',pids:[first.pid,second.pid,third.pid],occurrenceId:original.occurrenceId,first:await logs(first),second:await logs(second),third:await logs(third),unauthorizedOrAutomaticModels:0}));
});
test('DISPATCH/connection expires during admission-crash window and recreated controller preserves uncertainty',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(500),everyMs:60000},connectionExpiresAt:expiry(1500)}),first=await worker(s,'admit');await observed(first,'admitted');const o=(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId))[0]!;await stopOwned(first,'SIGKILL');
 await waitUntil(async()=>Date.now()>Date.parse(s.config.connectionExpiresAt),'connection expiry before worker recreation');const second=await worker(s);await observed(second,'recovered');await stopOwned(second);
 const current=await stored(s,o.occurrenceId);assert.equal(current.state,'reconciling');assert.equal(current.wait?.reason,'connection');assert.equal((await logs(second)).filter(row=>row.kind==='model').length,0);assert.equal((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).state,'paused');
 console.log(JSON.stringify({measurement:'dispatch-recreated-connection-recheck',oldPid:first.pid,newPid:second.pid,occurrenceId:o.occurrenceId,models:0,second:await logs(second)}));
});
async function prepared(s:Scheduled,expiresAt=expiry()){
 const scope=await f.scopeFor(1),artifact='disposable scheduled artifact '+randomUUID(),argumentsValue={text:'scheduled publication',artifactDigest:bindingDigest(artifact)},argsDigest=bindingDigest(argumentsValue),target='synthetic://'+randomUUID();
 await f.admin.query('INSERT INTO fabric.identity_target_versions(tenant_id,space_id,target,artifact_version,args_digest) VALUES($1,$2,$3,1,$4)',[f.tenant,f.space,target,argsDigest]);
 const rows=await f.uow.withScope(await f.scopeFor(0),async tx=>(await tx.query('SELECT fabric.identity_audience($1,$2,$3) AS audience',[f.source,f.space,f.sourceTask])).rows[0]?.audience as AudienceRow[]);
 const approval:ExactApprovalBinding={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,operationId:s.config.operationId!,target,action:'synthetic:publish',argsDigest,artifactVersion:1,policyRevision:1,requirementsRevision:1,sourceAudience:{sourceSpaceId:f.source,sourceTaskId:f.sourceTask,destinationSpaceId:f.space,recipientActorIds:rows.map(r=>r.actorId),revisionDigest:audienceDigest(rows)},limits:{maxOperations:1,maxCostMicrounits:20},expiresAt};
 const approvals=new ExactApprovalRepository({uow:f.uow,bindingFor:f.bindingFor}),a=await approvals.create(await f.scopeFor(0),{approvalId:randomUUID(),executorId:scope.actorId,binding:approval});await approvals.approve(await f.scopeFor(2),a.approvalId,a.bindingDigest);
 const effect=effectSchema.parse({binding:{run:s.run.binding,sessionId:s.config.sessionId,operationId:approval.operationId,target,resourceId:randomUUID(),action:approval.action,argsDigest,artifactId:randomUUID(),artifactVersion:1,artifactDigest:bindingDigest(artifact),actorId:scope.actorId,policyRevision:1,audienceDigest:approval.sourceAudience.revisionDigest,approvalId:a.approvalId,budgetReservationId:s.reservationId,executionLeaseId:s.value.lease.leaseId,generation:s.run.generation,expiresAt,effectClass:'external-write',mutationPath:'api',downstream:'idempotency-and-lookup'},state:'prepared',receiptDigest:null,nextAction:null});
 const resource=resolve(directory,'scheduled-effect-resource-'+effect.binding.resourceId);await writeFile(resource,'owned synthetic publication target');
 await new FenceRepository(f.repo,{quiesce:async()=>true,observeBase:async()=>bindingDigest(await readFile(resource,'utf8'))}).enroll(scope,{runId:s.runId,resourceId:effect.binding.resourceId});
 await f.repo.prepareEffect(scope,f.mutation(s.runId,2,{effect,approval,cost:20}),effect,approval,20);
 const ref:EffectRef={tenantId:f.tenant,spaceId:f.space,taskId:s.taskId,runId:s.runId,sessionId:s.config.sessionId,bindingDigest:bindingDigest(s.run.binding),operationId:effect.binding.operationId,intentDigest:bindingDigest(effect.binding)};
 return {effect,ref,request:{intent:effect.binding,arguments:argumentsValue,artifact}};
}
async function runState(s:Scheduled,state:'paused'|'running',repo=f.repo){
 const scope=await f.scopeFor(1),snap=await repo.get(scope,s.runId);assert.ok(snap);
 const cp={run:runSchema.parse({...snap.run,state,revision:snap.run.revision+1}),session:snap.sessions[0]!,result:null};
 return repo.checkpoint(scope,f.mutation(s.runId,snap.run.revision,cp),cp);
}
test('DISPATCH/paused native Run waits without submitting uncertainty; schedule resume cannot resume the Run',async()=>{
 const s=await scheduled({waitMs:60000});await runState(s,'paused');const o=await event(s);
 await assertWait(s,o,'resource','wait-resource');assert.equal(o.detail,'run-not-executable');
 const fresh=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));
 assert.equal(await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 const current=await fresh.get(await f.scopeFor(1),s.config.scheduleId);await fresh.resume(await f.scopeFor(1),command(current.revision),s.config.scheduleId);
 assert.equal(await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);assert.equal((await stored(s,o.occurrenceId)).submittedAt,null);
 assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
 assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.run.state,'paused');
 await runState(s,'running',new RecoveryRepository(f.uow,f.bindingFor));const ticket=await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry());assert.ok(ticket);
 let models=0;await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:ticket.generation,measure:r=>{if(r.kind==='model')models++;}}).nativeTurn(ticket.ref,ticket.sequence);
 assert.equal(models,1);assert.equal((await fresh.recover(await f.scopeFor(1),o.occurrenceId)).state,'completed');
});
for(const order of ['pause-before-admit','admit-before-pause'] as const)test('DISPATCH/exact prepared scheduled effect '+order+' has zero POSTs across recreation until explicit Run resume',async()=>{
 const s=await scheduled({effectClass:'external-write',operationId:randomUUID(),waitMs:60000}),p=await prepared(s),port=await freePort(),endpoint='http://127.0.0.1:'+port,journal=resolve(directory,'pause-effect-'+randomUUID()+'.jsonl'),marker='--fixture-owner='+owner;
 const external=launchOwned(process.execPath,[fileURLToPath(new URL('../src/effect-service-process.js',import.meta.url)),marker],marker,{FABRIC_EFFECT_SERVICE:JSON.stringify({owner,journal,port})});children.push(external);
 try{
  await waitUntil(async()=>{if(external.child.exitCode!==null)throw new Error(external.errors());return external.output().includes('"kind":"ready"');},'independent paused schedule effect service');
  const metrics=async()=>await(await fetch(endpoint+'/metrics')).json() as {posts:number;writes:number};
  const fresh=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));
  let o:Occurrence;
  if(order==='admit-before-pause'){o=await event(s);assert.ok(await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry()));await runState(s,'paused');}
  else{await runState(s,'paused');o=await event(s);await assertWait(s,o,'resource','wait-resource');assert.equal(o.detail,'run-not-executable');assert.equal(await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);}
  const make=()=>createEffectActivities({repo:new EffectRepository(new RecoveryRepository(f.uow,f.bindingFor)),scope:()=>f.scopeFor(1),generation:1,endpoint,requestFor:async()=>p.request,measure:()=>{}});
  for(let i=0;i<2;i++)await assert.rejects(make().dispatchEffect(p.ref),e=>(e as {code:string}).code==='STALE_AUTHORITY');
  assert.equal((await metrics()).posts,0);assert.equal((await metrics()).writes,0);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');
  await runState(s,'running',new RecoveryRepository(f.uow,f.bindingFor));
  if(order==='pause-before-admit')assert.ok(await fresh.admit(await f.scopeFor(1),o.occurrenceId,expiry()));
  const a=make();await a.dispatchEffect(p.ref);assert.equal((await a.reconcileEffect(p.ref)).status,'confirmed');assert.equal((await fresh.recover(await f.scopeFor(1),o.occurrenceId)).state,'completed');
  assert.equal((await metrics()).posts,1);assert.equal((await metrics()).writes,1);
  console.log(JSON.stringify({measurement:'paused-scheduled-original-effect',order,operationId:p.ref.operationId,occurrenceId:o.occurrenceId,servicePid:external.pid,postsBeforeRunResume:0,postsAfterRunResume:1}));
 }finally{await stopOwned(external);}
});
test('DISPATCH/actually expired exact external approval blocks occurrence admission',async()=>{
 const s=await scheduled({effectClass:'external-write',operationId:randomUUID()}),p=await prepared(s,expiry(400));
 await waitUntil(async()=>Date.now()>Date.parse(p.effect.binding.expiresAt),'original exact approval expiry');const o=await event(s);await assertWait(s,o,'approval','review-action');assert.equal(o.detail,'expired-or-stale-exact-approval');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
});
test('DISPATCH/actual downstream success ACK loss survives process recreation and reconciles original operation with zero extra POST',async()=>{
 const s=await scheduled({effectClass:'external-write',operationId:randomUUID()}),p=await prepared(s),port=await freePort(),endpoint='http://127.0.0.1:'+port,journal=resolve(directory,'effect-'+randomUUID()+'.jsonl'),marker='--fixture-owner='+owner;
 async function service(){const child=launchOwned(process.execPath,[fileURLToPath(new URL('../src/effect-service-process.js',import.meta.url)),marker],marker,{FABRIC_EFFECT_SERVICE:JSON.stringify({owner,journal,port})});children.push(child);await waitUntil(async()=>{if(child.child.exitCode!==null)throw new Error(child.errors());return child.output().includes('"kind":"ready"');},'owned independent scheduled-effect service');assert.ok(census().find(row=>row.pid===child.pid)?.command.includes('effect-service-process.js'));return child;}
 let external=await service();const mode=await fetch(endpoint+'/fixture-mode',{method:'POST',body:JSON.stringify({ack:'drop',lookup:'normal',dedup:true})});assert.equal(mode.status,200);
 const o=await event(s),ticket=await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry());assert.ok(ticket);assert.equal(ticket.operationId,p.ref.operationId);
 const measurements:Record<string,unknown>[]=[],a=createEffectActivities({repo:new EffectRepository(f.repo),scope:()=>f.scopeFor(1),generation:1,endpoint,requestFor:async()=>p.request,measure:r=>measurements.push(r)});
 await assert.rejects(a.dispatchEffect(p.ref));assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'unknown');
 const metric=await(await fetch(endpoint+'/metrics')).json() as {writes:number;posts:number};assert.equal(metric.writes,1);assert.equal(metric.posts,1);
 const recovered=await dispatch.recover(await f.scopeFor(1),o.occurrenceId);assert.equal(recovered.state,'reconciling');assert.equal(recovered.detail,'reconcile-original-operation-no-replay');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);
 const oldPid=external.pid;await stopOwned(external,'SIGKILL');external=await service();await replacement(s);
 const recreated=await worker(s);await observed(recreated,'recovered');await stopOwned(recreated);assert.equal((await logs(recreated)).filter(row=>row.kind==='model').length,0);assert.equal((await stored(s,o.occurrenceId)).state,'reconciling');
 const fresh=createEffectActivities({repo:new EffectRepository(new RecoveryRepository(f.uow,f.bindingFor)),scope:()=>f.scopeFor(1),generation:2,endpoint,requestFor:async()=>p.request,measure:r=>measurements.push(r)});
 assert.equal((await fresh.reconcileEffect(p.ref)).status,'confirmed');assert.equal((await dispatch.recover(await f.scopeFor(1),o.occurrenceId)).state,'completed');const after=await(await fetch(endpoint+'/metrics')).json() as {writes:number;posts:number;lookups:number};assert.equal(after.writes,1);assert.equal(after.posts,0);assert.equal(after.lookups,1);assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
 const journalText=await readFile(journal,'utf8');console.log(JSON.stringify({measurement:'dispatch-original-effect-crash-reconcile',oldServicePid:oldPid,newServicePid:external.pid,workerPid:recreated.pid,occurrenceId:o.occurrenceId,operationId:p.ref.operationId,writes:after.writes,recreatedPosts:after.posts,lookups:after.lookups,worker:await logs(recreated),effectMeasurements:measurements,journalText,journalBytes:Buffer.byteLength(journalText),journalSha256:createHash('sha256').update(journalText).digest('hex')}));await stopOwned(external);
});
test('DISPATCH/lost create COMMIT ACK resolves only original key and leaves one immutable receipt/event pair',async()=>{
 const s=await seed(),base=await scheduled();
 const config={...base.config,scheduleId:randomUUID(),runId:s.runId,sessionId:s.value.session.sessionId},c=command(0);
 const lost=new DispatchRepository(new RecoveryRepository(new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(f.controller,()=>{throw new Error('Lost actual Dispatch COMMIT ACK');}),bindingFor:f.bindingFor}),f.bindingFor));
 await assert.rejects(lost.create(await f.scopeFor(1),c,config),error=>(error as {code:string}).code==='UNKNOWN_COMMIT');
 const digest=bindingDigest({kind:'create',config,expectedRevision:0}),restored=new DispatchRepository(new RecoveryRepository(f.uow,f.bindingFor));
 assert.equal((await restored.lookupCommand(await f.scopeFor(1),c.key,digest)).status,'committed');assert.deepEqual(await restored.create(await f.scopeFor(1),c,config),await restored.get(await f.scopeFor(1),config.scheduleId));
 assert.equal((await f.admin.query('SELECT count(*) FROM fabric.recovery_dispatch_receipts WHERE command_key=$1',[c.key])).rows[0].count,'1');
 assert.equal((await restored.lookupCommand(await f.scopeFor(1),randomUUID(),digest)).status,'absent-safe');await assert.rejects(restored.lookupCommand(await f.scopeFor(1),c.key,bindingDigest('wrong')));
});
test('DISPATCH/different schedules targeting same native Run exclude concurrent continuation',async()=>{
 const s=await scheduled(),config={...s.config,scheduleId:randomUUID()},other={...s,config,record:await dispatch.create(await f.scopeFor(1),command(0),config)};
 const one=await event(s),two=await event(other);assert.ok(await dispatch.admit(await f.scopeFor(1),one.occurrenceId,expiry()));assert.equal(await dispatch.admit(await f.scopeFor(1),two.occurrenceId,expiry()),null);
 const wait=await stored(other,two.occurrenceId);await assertWait(other,wait,'resource','wait-resource');assert.equal(wait.detail,'overlap-excluded');
});
async function blockedUpdate<T>(work:()=>Promise<T>,deadline:string){
 const blocker=await f.admin.connect();await blocker.query('BEGIN');await blocker.query('LOCK TABLE fabric.recovery_occurrences IN SHARE MODE');
 const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),result=work().then(value=>({value,error:null}),error=>({value:null,error}));
 try{
  await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE query LIKE 'UPDATE fabric.recovery_occurrences%' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount!>0,'actual admission UPDATE blocked after initial gate');
  await waitUntil(async()=>Date.now()>Date.parse(deadline),'actual deadline during blocked admission UPDATE');await blocker.query('ROLLBACK');
  const outcome=await result;assert.ok(outcome.error,'Admission must roll back after observed deadline wait');
 }finally{await blocker.query('ROLLBACK');blocker.release();await result;}
}
test('DISPATCH/connection expires during observed post-gate SQL wait and admission rolls back',async()=>{
 const s=await scheduled(),o=await event(s),deadline=expiry(1000);await setControls(s,{connectionExpiresAt:deadline});
 await blockedUpdate(()=>f.scopeFor(1).then(scope=>dispatch.admit(scope,o.occurrenceId,expiry())),deadline);assert.equal((await stored(s,o.occurrenceId)).state,'queued');assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);
});
test('DISPATCH/input wait expires during observed post-gate SQL wait and admission rolls back',async()=>{
 const s=await scheduled({inputReady:false,waitMs:1000}),o=await event(s);await setControls(s,{inputReady:true});
 await blockedUpdate(()=>f.scopeFor(1).then(scope=>dispatch.admit(scope,o.occurrenceId,expiry())),o.wait!.expiresAt);assert.equal((await stored(s,o.occurrenceId)).state,'waiting');
});
test('DISPATCH/exact catch-up approval expires during observed post-gate SQL wait and is never consumed',async()=>{
 const s=await scheduled({recurrence:{kind:'interval',startAt:expiry(-300),everyMs:60000},graceMs:0,missed:'catch-up'}),due=await dispatch.tick(await f.scopeFor(1),s.config.scheduleId),o=due[0]!;
 const current=await dispatch.get(await f.scopeFor(1),s.config.scheduleId),deadline=expiry(1000);await dispatch.authorizeCatchUp(await f.scopeFor(1),command(current.revision),s.config.scheduleId,[o.occurrenceId],deadline);
 await blockedUpdate(()=>f.scopeFor(1).then(scope=>dispatch.admit(scope,o.occurrenceId,expiry())),deadline);assert.equal((await stored(s,o.occurrenceId)).state,'waiting');assert.ok((await dispatch.get(await f.scopeFor(1),s.config.scheduleId)).permits[o.occurrenceId]);
});
test('DISPATCH/exact external approver revocation prevents pending operation admission',async()=>{
 const s=await scheduled({effectClass:'external-write',operationId:randomUUID()}),p=await prepared(s);
 await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2],JSON.stringify(['task:read','task:write'])]);
 try{const o=await event(s);await assertWait(s,o,'approval','review-action');assert.equal(o.detail,'exact-approval-party-revoked');assert.equal(await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry()),null);assert.equal((await f.repo.get(await f.scopeFor(1),s.runId))?.effects[0]?.state,'prepared');}
 finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,grants=$4 WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[2],JSON.stringify(['task:read','task:write','approval:approve'])]);}
 assert.equal((await f.admin.query('SELECT phase FROM fabric.recovery_effect_events WHERE operation_id=$1',[p.ref.operationId])).rowCount,0);
});
test('DISPATCH/real mapped service identity may admit bounded native work but cannot grant human catch-up consent',async()=>{
 await f.admin.query("UPDATE fabric.identities SET principal_kind='service' WHERE tenant_id=$1 AND actor_id=$2",[f.tenant,f.actors[1]]);
 try{
  const service=await f.scopeFor(1);assert.equal(f.bindingFor(service).principalKind,'service');const s=await scheduled({principalKind:'service'}),o=await event(s),ticket=await dispatch.admit(await f.scopeFor(1),o.occurrenceId,expiry());assert.ok(ticket);
  let model=0;await createNativeActivities({repo:f.repo,scope:()=>f.scopeFor(1),workerGeneration:ticket.generation,measure:r=>{if(r.kind==='model')model++;}}).nativeTurn(ticket.ref,ticket.sequence);assert.equal(model,1);assert.equal((await dispatch.recover(await f.scopeFor(1),o.occurrenceId)).state,'completed');
  const catchup=await scheduled({principalKind:'service',missed:'catch-up',graceMs:0,recurrence:{kind:'interval',startAt:expiry(-300),everyMs:60000}}),due=await dispatch.tick(await f.scopeFor(1),catchup.config.scheduleId);assert.equal(due[0]!.detail,'authorize-exact-missed-occurrence');const current=await dispatch.get(await f.scopeFor(1),catchup.config.scheduleId);
  await assert.rejects(dispatch.authorizeCatchUp(await f.scopeFor(1),command(current.revision),catchup.config.scheduleId,[due[0]!.occurrenceId],expiry(5000)));assert.equal(await dispatch.admit(await f.scopeFor(1),due[0]!.occurrenceId,expiry()),null);
  console.log(JSON.stringify({measurement:'dispatch-mapped-service-admission',actorId:f.actors[1],principalKind:'service',nativeCalls:1,serviceHumanApproval:false}));
 }finally{await f.admin.query("UPDATE fabric.identities SET principal_kind='human' WHERE tenant_id=$1 AND actor_id=$2",[f.tenant,f.actors[1]]);}
});
test('DISPATCH/actual worker runtime expires behind observed native history SQL lock with zero checkpoint commit',async()=>{
 const s=await scheduled({maxRuntimeMs:800,recurrence:{kind:'interval',startAt:expiry(500),everyMs:60000}}),blocker=await f.admin.connect();await blocker.query('BEGIN');await blocker.query('LOCK TABLE fabric.recovery_session_events IN ACCESS EXCLUSIVE MODE');
 const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);let child:OwnedChild|undefined;
 try{
  child=await worker(s);await observed(child,'admitted');await waitUntil(async()=>(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE query LIKE '%recovery_session_events%' AND $1=ANY(pg_blocking_pids(pid))",[pid])).rowCount!>0,'actual native history read blocked behind table owner');
  const o=(await dispatch.occurrences(await f.scopeFor(1),s.config.scheduleId))[0]!;assert.equal(o.state,'submitted');await waitUntil(async()=>Date.now()>Date.parse(o.submittedAt!)+s.config.maxRuntimeMs+100,'scheduled child runtime expires under observed SQL wait');await blocker.query('ROLLBACK');
  await waitUntil(async()=>child!.child.exitCode!==null||child!.child.signalCode!==null,'bounded runtime child failure and pool cleanup');assert.notEqual(child.child.exitCode,0);assert.match(child.errors(),/Scheduled runtime expired|Bounded scheduled native controller deadline/);
  assert.equal((await f.repo.nativeTranscript(await f.scopeFor(1),s.config.sessionId)).length,0);const recovered=await dispatch.recover(await f.scopeFor(1),o.occurrenceId);assert.equal(recovered.state,'reconciling');assert.equal(recovered.detail,'checkpoint-absent-explicit-resume-required');assert.equal((await logs(child)).filter(row=>row.kind==='model').length,0);assert.equal((await logs(child)).filter(row=>row.kind==='checkpoint-durable').length,0);
  console.log(JSON.stringify({measurement:'dispatch-runtime-expired-under-observed-lock',workerPid:child.pid,blockingPid:pid,occurrenceId:o.occurrenceId,maxRuntimeMs:s.config.maxRuntimeMs,actualSqlLockObserved:true,models:0,committedNativeEvents:0,worker:await logs(child)}));
 }finally{await blocker.query('ROLLBACK');blocker.release();if(child)await stopOwned(child);}
});
test('DISPATCH/actual monitor process persists owner-offboarding permission pause without privileged fallback execution',async()=>{
 const s=await scheduled(),child=await worker(s,null,f.tokens[0]);
 await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=clock_timestamp() WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1]]);
 try{
  await observed(child,'admission-authority-unavailable');await waitUntil(async()=>(await dispatch.get(await f.scopeFor(0),s.config.scheduleId)).state==='paused','authenticated monitor persists owner permission pause');await stopOwned(child);
  const current=await dispatch.get(await f.scopeFor(0),s.config.scheduleId);assert.equal(current.wait?.reason,'permission');assert.equal(current.wait?.ownerId,f.actors[1]);assert.equal(current.wait?.nextAction,'request-access');assert.equal((await logs(child)).filter(row=>row.kind==='model').length,0);assert.deepEqual(await dispatch.occurrences(await f.scopeFor(0),s.config.scheduleId),[]);
  console.log(JSON.stringify({measurement:'dispatch-owner-offboarding-monitor',workerPid:child.pid,monitorActorId:f.actors[0],ownerActorId:f.actors[1],reason:current.wait?.reason,models:0,worker:await logs(child)}));
 }finally{await f.admin.query('UPDATE fabric.memberships SET revision=revision+1,revoked_at=NULL WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3',[f.tenant,f.space,f.actors[1]]);await stopOwned(child);}
});
