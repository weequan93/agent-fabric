import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import pg from 'pg';
import { mkdtemp, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { canonicalDigest } from '../../../engine/contracts/src/identity.js';
import { createModelFixture } from '../helpers/pg-fixture.js';
import { census, assertOwned, waitUntil } from '../helpers/process-fixture.js';
import { LocalAdapterClient, encodeLocalRequest, requestDigestOf, LocalPayloadSchema, StreamChunkSchema } from '../../src/test-adapter.js';
import { ModelError } from '../../src/errors.js';
import { migrateReceipts } from '../../src/receipt-migration.js';
import { migrateIdentity } from '../../../g1-identity/src/migration.js';
import type { EncodedRequest, OriginalCall } from '../../src/contracts.js';

const code=(expected:string)=>(e:unknown)=>e instanceof ModelError && e.code===expected;
test('ADAPTER/roundtrip-recovery',async t=>{
 const f=await createModelFixture();
 t.after(()=>f.close());
 const request=(text='hello',overrides:Partial<EncodedRequest>={})=>{
  const original=f.original();
  return encodeLocalRequest({schemaVersion:1,original,profileDigest:f.profile.profileDigest,contextDigest:'sha256:'+canonicalDigest(text),
   payload:JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:'local-json-v1',text,response:'text',toolArguments:null,privateState:null})),outputCap:128,durationCapMs:100,dispatchEpoch:1,...overrides});
 };
 const settled=async(o:OriginalCall)=>{
  await waitUntil(async()=> (await f.adapterClient().lookup(o)).status==='settled','independent usage');
  const observation=await f.adapterClient().lookup(o);assert.equal(observation.status,'settled');if(observation.status!=='settled')throw new Error('Missing receipt');return observation.receipt;
 };
 await t.test('actual-authentication-and-domain-isolation',async()=>{
  assert.equal(f.issued[1]!.actorId,f.actors[1]);
  await f.uow.withScope(f.issued[1]!,async tx=>{assert.equal((await tx.query('SELECT current_user AS role')).rows[0]?.['role'],f.roles.controller);});
  for(const pool of [f.controller,f.worker,f.client,f.idpPool])await assert.rejects(pool.query('SELECT * FROM model_receipts.journal'),/permission denied/);
  await assert.rejects(f.receiptOwner.query('SELECT * FROM fabric.tasks'),/permission denied/);
  const role=(await f.receiptOwner.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(role,{rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false});
  const reused=new URL(f.fixtureDsn('receipt'));reused.username=f.roles.controller;
  const unauthorized=new pg.Client({connectionString:reused.href,connectionTimeoutMillis:1000});
  try{await assert.rejects(unauthorized.connect(),/password authentication failed/);}finally{await unauthorized.end();}
  assert.deepEqual(f.adapter().ready['environmentKeys'],['LC_ALL','PATH']);
  assertOwned(f.adapter(),census().find(r=>r.pid===f.adapter().pid));
  for(const changed of [{...f.adapter().identity,instance:'reused'},{...f.adapter().identity,ppid:0},{...f.adapter().identity,command:'foreign'}])assert.throws(()=>assertOwned(f.adapter(),changed),code('CLEANUP_UNPROVEN'));
  assert.throws(()=>assertOwned({...f.adapter(),marker:randomUUID()},f.adapter().identity),code('CLEANUP_UNPROVEN'));
  assert.ok(census().some(r=>r.pid===f.adapter().pid));
 });
 let first:EncodedRequest;
 await t.test('accepted-roundtrip-and-independent-capture',async()=>{
  first=request('hello 🌍');await f.schedule(first.original,{usage:'manual'});
  const observed=await f.adapterClient().accept(first);assert.deepEqual(observed,{status:'accepted',original:first.original});
  const row=await f.journal(first.original);assert.equal(row.status,'accepted');assert.deepEqual(row.request,first);assert.equal(row.receipt,null);
  assert.equal((await f.counters())['acceptance'],1);
  // Eight simultaneous transports still produce exactly one accepted inference.
  const copies=await Promise.all(Array.from({length:8},()=>f.adapterClient().accept(first)));
  assert.ok(copies.every(r=>r.status==='accepted'));assert.equal((await f.counters())['acceptance'],1);
  assert.equal((await f.adapterClient().sealUnaccepted(first.original,2)).status,'accepted');
  await f.finalize(first.original);const receipt=await settled(first.original),result=await f.adapterClient().result(first.original);
  assert.equal(result.output,'local:hello 🌍');assert.equal(result.chunks.join(''),result.output);assert.ok(result.chunks.length>1);assert.ok(result.privateState);
  assert.equal(receipt.ownerId,f.ownerId);assert.deepEqual(receipt.original,first.original);assert.equal(receipt.components.service,2);
  assert.equal(receipt.measuredUnits,2+Buffer.byteLength(first.payload)+Buffer.byteLength(result.output!));
  assert.equal(receipt.outputDigest,'sha256:'+canonicalDigest(result.output));assert.equal((await f.counters())['usage'],1);
  await f.finalize(first.original);assert.deepEqual(await settled(first.original),receipt);assert.equal((await f.counters())['usage'],1);
 });
 await t.test('binding-host-origin-token-and-closed-boundary-refusals',async()=>{
  const before=await f.counters(),r=request();
  await assert.rejects(f.adapterClient().lookup({...first.original,reservationId:randomUUID()}),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.adapterClient().accept({...r,original:{...r.original,requestDigest:'sha256:'+'1'.repeat(64)}}),code('CHECK_BINDING_MISMATCH'));
  const post=(input:unknown,headers:Record<string,string>={})=>new Promise<{status:number;body:string}>((resolve,reject)=>{
   const req=httpRequest(f.adapterUrl()+'/accept',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+f.transportToken,...headers}},res=>{let body='';res.on('data',data=>body+=String(data));res.once('end',()=>resolve({status:res.statusCode!,body}));});req.once('error',reject);req.end(JSON.stringify(input));
  });
  for(const [label,input,headers] of [
   ['unknown-fields',{...r,destination:'https://example.invalid'},{}],
   ['wrong-host',r,{host:'localhost:'+new URL(f.adapterUrl()).port}],
   ['wrong-origin',r,{origin:'https://example.invalid'}],
   ['wrong-token',r,{authorization:'Bearer '+randomUUID()}],
   ['wrong-content-type',r,{'content-type':'text/plain'}]
  ] as const){const response=await post(input,headers);assert.equal(response.status,400,label);const safe=response.body;assert.ok(!safe.includes(r.payload));assert.ok(!safe.includes(f.transportToken));}
  for(const destination of ['https://example.invalid','http://localhost:1234','http://127.0.0.2:1234','http://2130706433:1234','http://127.1:1234','http://127.0.0.1:1234/path','http://user@127.0.0.1:1234','http://127.0.0.1:1234?target=x'])assert.throws(()=>new LocalAdapterClient(destination,f.transportToken,f.ownerId),code('UNAUTHORIZED'));
  assert.equal((await f.counters())['acceptance'],before['acceptance']);assert.equal(await f.journal(r.original),undefined);
  const absent=request();assert.deepEqual(await f.adapterClient().lookup(absent.original),{status:'unknown',original:absent.original});assert.equal(await f.journal(absent.original),undefined);
  const forgedOwner=new LocalAdapterClient(f.adapterUrl(),f.transportToken,randomUUID());await assert.rejects(forgedOwner.lookup(first.original),code('CHECK_BINDING_MISMATCH'));
 });
 await t.test('durable-seal-new-epoch-denies-stale-and-fresh-accept',async()=>{
  const r=request(),before=(await f.counters())['acceptance'];assert.equal((await f.adapterClient().lookup(r.original)).status,'unknown');
  const proof=await f.adapterClient().sealUnaccepted(r.original,2);assert.equal(proof.status,'sealed-not-accepted');if(proof.status!=='sealed-not-accepted')throw new Error('Missing seal');assert.equal(proof.dispatchEpoch,2);
  assert.deepEqual(await f.adapterClient().sealUnaccepted(r.original,2),proof);
  await assert.rejects(f.adapterClient().accept(r),code('STALE_FENCE'));
  const newer={...r,dispatchEpoch:3};newer.original={...r.original,requestDigest:requestDigestOf(newer)};
  await assert.rejects(f.adapterClient().accept(newer),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.adapterClient().sealUnaccepted(r.original,1),code('STALE_FENCE'));
  assert.equal((await f.counters())['acceptance'],before);assert.equal((await f.journal(r.original)).request,null);
 });
 await t.test('verified-preaccept-seal-wins',async()=>{
  const r=request();await f.arm('pre-accept');const submitted=f.adapterClient().accept(r).then(()=>null,e=>e);
  await f.reached('pre-accept',r.original);assert.equal(await f.journal(r.original),undefined);
  assert.equal((await f.adapterClient().lookup(r.original)).status,'unknown');assert.equal((await f.adapterClient().sealUnaccepted(r.original,2)).status,'sealed-not-accepted');
  await f.release('pre-accept');assert.ok(code('STALE_FENCE')(await submitted));assert.equal((await f.journal(r.original)).status,'sealed-not-accepted');
 });
 await t.test('owner-commit-accept-wins-with-observed-database-blocker',async()=>{
  const r=request();await f.schedule(r.original,{usage:'manual'});await f.arm('owner-commit');const accepted=f.adapterClient().accept(r);
  await f.reached('owner-commit',r.original);assert.equal(await f.journal(r.original),undefined);
  const sealing=f.adapterClient().sealUnaccepted(r.original,2);
  await waitUntil(async()=>Number((await f.admin.query("SELECT count(*) AS n FROM pg_stat_activity a WHERE a.usename=$1 AND cardinality(pg_blocking_pids(a.pid))>0",[f.roles.receipt])).rows[0].n)>0,'actual owner advisory lock contender',1000);
  await f.release('owner-commit');assert.equal((await accepted).status,'accepted');assert.equal((await sealing).status,'accepted');assert.equal((await f.journal(r.original)).status,'accepted');
  await f.finalize(r.original);await settled(r.original);
 });
 await t.test('verified-lookup-usage-and-chunk-barriers',async()=>{
  const r=request();await f.arm('usage');const accept=await f.adapterClient().accept(r);assert.equal(accept.status,'accepted');await f.reached('usage',r.original);
  assert.equal((await f.journal(r.original)).status,'accepted');await f.arm('lookup');let returned=false;const pending=f.adapterClient().lookup(r.original).then(value=>{returned=true;return value;});
  await f.reached('lookup',r.original);assert.equal(returned,false);await f.release('lookup');assert.equal((await pending).status,'accepted');
  await f.arm('chunk');await f.release('usage');await f.reached('chunk',r.original);assert.equal((await f.journal(r.original)).status,'accepted');
  assert.equal((await f.journal(r.original)).chunks,null);await f.release('chunk');await settled(r.original);assert.equal((await f.adapterClient().result(r.original)).chunks.join(''),'local:hello');
 });
 await t.test('lost-ack-retains-accepted-journal-and-kill-recreate-never-accepts',async()=>{
  const r=request('crash-sentinel');await f.schedule(r.original,{usage:'manual'},true);await f.arm('lost-ack');
  const response=f.adapterClient().accept(r).then(()=>null,e=>e);await f.reached('lost-ack',r.original);
  const row=await f.journal(r.original),before=await f.counters();assert.equal(row.status,'accepted');assert.deepEqual(row.request,r);
  await f.release('lost-ack');assert.ok(code('UNKNOWN_EFFECT_REQUIRES_RECONCILIATION')(await response));
  const pid=f.adapter().pid;await f.restart('SIGKILL');assert.ok(!census().some(p=>p.pid===pid));assert.notEqual(f.adapter().pid,pid);
  assert.equal((await f.adapterClient().lookup(r.original)).status,'accepted');assert.deepEqual((await f.journal(r.original)).request,row.request);
  assert.equal((await f.counters())['accept'],before['accept']);assert.equal((await f.counters())['acceptance'],before['acceptance']);
  await f.finalize(r.original);const receipt=await settled(r.original);await f.restart('SIGKILL');assert.deepEqual(await settled(r.original),receipt);
  assert.equal((await f.counters())['accept'],before['accept']);assert.equal((await f.counters())['acceptance'],before['acceptance']);
 });
 await t.test('capability-context-output-duration-json-and-cancellation',async()=>{
  const unsupported=request();const before=(await f.counters())['acceptance'];
  for(const patch of [{modality:'image'},{modality:'audio'},{dialect:'arbitrary'},{response:'embedding'},{destination:'https://example.invalid'}]){
   const r={...unsupported,payload:JSON.stringify({...JSON.parse(unsupported.payload),...patch})};r.original={...r.original,requestDigest:requestDigestOf(r)};await assert.rejects(f.adapterClient().accept(r),e=>e instanceof ModelError);
  }
  assert.equal((await f.counters())['acceptance'],before);
  const empty=request(''),base=Buffer.byteLength(empty.payload),exact=request('x'.repeat(4096-base));assert.equal(Buffer.byteLength(exact.payload),4096);
  await f.adapterClient().accept(exact);await settled(exact.original);
  const outside=request('x'.repeat(4097-base));await assert.rejects(f.adapterClient().accept(outside),code('REQUIRED_CAPABILITY_UNSUPPORTED'));assert.equal(await f.journal(outside.original),undefined);
  const unicode=request('🌍🌍',{outputCap:9});await f.adapterClient().accept(unicode);await settled(unicode.original);const clipped=await f.adapterClient().result(unicode.original);assert.equal(clipped.output,'local:');assert.ok(clipped.output!.isWellFormed());assert.ok(Buffer.byteLength(clipped.output!)<=9);
  const toolPayload=JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:'local-json-v1',text:'tool',response:'tool',toolArguments:{message:'hello 🌍'},privateState:null}));
  for(const cap of [128,3]){const r=request('tool',{payload:toolPayload,outputCap:cap});await f.adapterClient().accept(r);const receipt=await settled(r.original),result=await f.adapterClient().result(r.original);if(cap===128){assert.deepEqual(JSON.parse(result.chunks.join('')),{message:'hello 🌍'});assert.equal(receipt.outcome,'answer');}else{assert.equal(receipt.outcome,'known-failure');assert.deepEqual(result.chunks,[]);assert.equal(receipt.outputDigest,null);}}
  const duration=request('duration',{durationCapMs:10});await f.schedule(duration.original,{durationMs:11});await f.adapterClient().accept(duration);assert.equal((await settled(duration.original)).outcome,'known-failure');
  const cancelled=request('cancel');await f.schedule(cancelled.original,{usage:'manual'});await f.adapterClient().accept(cancelled);
  assert.equal((await f.adapterClient().cancel(cancelled.original)).status,'accepted');assert.equal((await f.adapterClient().sealUnaccepted(cancelled.original,2)).status,'accepted');assert.equal((await f.journal(cancelled.original)).cancel_requested,true);
  await f.finalize(cancelled.original);const receipt=await settled(cancelled.original);assert.equal(receipt.outcome,'cancelled');assert.ok(receipt.measuredUnits>0);
 });
 await t.test('provider-private-state-is-scoped-and-never-in-observation',async()=>{
  const state=(await f.adapterClient().result(first.original)).privateState;assert.ok(state);
  const payload=JSON.parse(first.payload);payload.privateState=state;
  const valid=request('private',{payload:JSON.stringify(payload),contextDigest:first.contextDigest});await f.adapterClient().accept(valid);const receipt=await settled(valid.original);assert.ok(!JSON.stringify(receipt).includes(state));
  const changedContext=request('private',{payload:JSON.stringify(payload)});await assert.rejects(f.adapterClient().accept(changedContext),code('SCOPE_MISMATCH'));
  const o={...f.original(),spaceId:f.otherSpace},foreign=request('private',{payload:JSON.stringify(payload),original:o});await assert.rejects(f.adapterClient().accept(foreign),code('SCOPE_MISMATCH'));assert.equal(await f.journal(foreign.original),undefined);
  const otherOwner=randomUUID();await assert.rejects(f.receiptOwner.query('INSERT INTO model_receipts.counters(owner_id,kind,count) VALUES($1,$2,1)',[otherOwner,'accept']),/row-level security/);
 });
 await t.test('actual-incremental-text-and-complete-json-proposal-stream',async()=>{
  const before=await f.counters(),frames=[];
  for await(const frame of f.adapterClient().stream(first.original))frames.push(frame);
  assert.ok(frames.length>1);assert.ok(frames.every(frame=>frame.kind==='text'));assert.equal(frames.map(frame=>frame.fragment).join(''),'local:hello 🌍');assert.equal(frames.at(-1)?.final,true);
  const payload=JSON.stringify(LocalPayloadSchema.parse({schemaVersion:1,modality:'text',dialect:'local-json-v1',text:'proposal',response:'tool',toolArguments:{message:'fragmented proposal'},privateState:null})),r=request('proposal',{payload});
  await f.adapterClient().accept(r);await settled(r.original);const toolFrames:ReturnType<typeof StreamChunkSchema.parse>[]=[];
  for await(const frame of f.adapterClient().stream(r.original))toolFrames.push(frame);
  assert.ok(toolFrames.length>1);assert.equal(toolFrames[0]?.kind,'tool-arguments');assert.throws(()=>JSON.parse(toolFrames[0]!.fragment));assert.deepEqual(JSON.parse(toolFrames.map(frame=>frame.fragment).join('')),{message:'fragmented proposal'});
  assert.equal((await f.counters())['acceptance'],before['acceptance']!+1);assert.equal((await f.counters())['usage'],before['usage']!+1);
 });
 await t.test('immutable-history-and-original-migration-digests',async()=>{
  const before=await f.journal(first.original);
  for(const sql of ["UPDATE model_receipts.journal SET original='{}' WHERE owner_id=$1","UPDATE model_receipts.journal SET receipt='{}' WHERE owner_id=$1 AND status='settled'","UPDATE model_receipts.journal SET request='{}' WHERE owner_id=$1","DELETE FROM model_receipts.journal WHERE owner_id=$1"]){await assert.rejects(f.admin.query(sql,[f.ownerId]),/immutable/);}
  assert.deepEqual(await f.journal(first.original),before);
  const migration={ownedSyntheticDatabase:true as const,owner:f.fixtureOwner,root:f.root};
  await Promise.all([migrateReceipts(f.admin,migration),migrateReceipts(f.admin,migration)]);
  const marker=randomUUID(),directory=await mkdtemp(resolve(tmpdir(),'fabric-model-migration-'+marker+'-'));
  try{await writeFile(resolve(directory,'owner'),marker,{flag:'wx'});const original=await readFile(resolve(f.root,'g1-model/migrations/0001_receipt_domain.sql'),'utf8');const sqlPath=resolve(directory,'changed.sql');await writeFile(sqlPath,original+'\n-- incompatible bytes\n');await assert.rejects(migrateReceipts(f.admin,{...migration,sqlPath}),code('CHECK_BINDING_MISMATCH'));}
  finally{assert.ok((await lstat(directory)).isDirectory());assert.ok((await lstat(resolve(directory,'owner'))).isFile());assert.equal(await readFile(resolve(directory,'owner'),'utf8'),marker);await rm(directory,{recursive:true});}
  await assert.rejects(migrateReceipts(f.admin,{...migration,owner:randomUUID()}),code('CLEANUP_UNPROVEN'));
  await migrateIdentity(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve(f.root,'g1-identity/migrations/0003_identity_approvals.sql')});
  assert.deepEqual((await f.admin.query('SELECT version FROM public.fabric_foundation_migrations ORDER BY version')).rows.map(r=>r.version),[1,2]);
  assert.deepEqual((await f.admin.query('SELECT version FROM public.fabric_identity_migrations ORDER BY version')).rows.map(r=>r.version),[3]);
  assert.equal((await f.admin.query('SELECT owner FROM public.fabric_model_migrations WHERE version=1')).rows[0].owner,f.fixtureOwner);
 });
 console.log(JSON.stringify({measurement:'adapter-diagnostic',qualification:'deterministic-local-only',ownerId:f.ownerId,counters:await f.counters(),supplierQualification:'pending'}));
});
