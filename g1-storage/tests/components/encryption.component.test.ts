import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { CryptoStore } from '../../src/crypto-store.js';
import type { CipherBinding, CipherEnvelope, KeyResolver } from '../../src/contracts.js';
import { StorageError } from '../../src/errors.js';
import { LIMITS } from '../../src/arithmetic.js';
import { createStorageFixture } from '../helpers/pg-fixture.js';
import { emitObservations } from '../helpers/observations.js';

test('ENCRYPTION/behavior / primitive ciphertext, real retained copies and recreated readers', async t => {
 const f = await createStorageFixture();
 // Harness-held keys are never files, parameters, env, argv or observations.
 const dataKey = randomBytes(32), digestKey = randomBytes(32);
 const resolver: KeyResolver = {async resolve() { return {dataKey, digestKey}; }};
 const crypto = new CryptoStore(resolver);
 const binding: CipherBinding = {schemaVersion: 1, tenantId: f.tenant, spaceId: f.spaces.group,
  class: 'artifact', id: randomUUID(), revision: 1, generation: randomUUID(), keyId: randomUUID()};
 const marker = 'private-' + randomUUID();
 const text = Buffer.from(marker + '\n决策🙂 e\u0301\u0000\r\n', 'utf8');
 const binary = Buffer.concat([randomBytes(511), Buffer.from([0,255,128,0])]);
 let reads = 0, writes = 0, denials = 0, disclosures = 0;
 const deny = async (work: () => Promise<unknown>, code: string) => {
  let refused = false;
  try { await work(); disclosures++; }
  catch (e) { assert.ok(e instanceof StorageError && e.code === code, 'Expected redacted typed crypto refusal'); refused = true; }
  assert.ok(refused, 'Corrupt or unavailable material was returned'); denials++;
 };
 const equal = (actual: Buffer, expected: Buffer) => {
  const matches = actual.equals(expected); if (!matches) disclosures++;
  assert.ok(matches, 'Exact decrypted byte comparison failed'); reads++;
 };
 const flip = (base64: string) => { const value = Buffer.from(base64,'base64'); value[0] = value[0]! ^ 1; return value.toString('base64'); };
 try {
  await t.test('ENCRYPTION/roundtrip-nonce', async () => {
   for (const bytes of [text, binary, Buffer.alloc(0)]) {
    const a = await crypto.seal(binding, bytes), b = await crypto.seal(binding, bytes); writes += 2;
    assert.ok(a.nonce !== b.nonce && a.tag !== b.tag, 'Encryption must use fresh nonces');
    equal(await new CryptoStore(resolver).open(binding, a), bytes);
    equal(await new CryptoStore(resolver).open(binding, b), bytes);
   }
   const reordered = Object.fromEntries(Object.entries(binding).reverse());
   equal(await crypto.open(reordered, await crypto.seal(binding,text)), text); writes++;
   assert.equal(JSON.stringify(crypto), '{}');
   assert.ok(dataKey.some(v=>v!==0) && digestKey.some(v=>v!==0), 'Resolver-owned keys must not be erased');
  });
  await t.test('ENCRYPTION/capability-races', async () => {
   let release!: () => void;
   const gate = new Promise<void>(r=>{release=r;});
   const delayed = new CryptoStore({async resolve(){await gate; return {dataKey,digestKey};}});
   const mutable = {...binding}, bytes = Buffer.from(text);
   const pending = delayed.seal(mutable,bytes);
   mutable.id = randomUUID(); mutable.generation = randomUUID(); bytes.fill(0);
   release(); equal(await crypto.open(binding,await pending),text); writes++;
   const envelopes = await Promise.all(Array.from({length:32},()=>crypto.seal(binding,binary))); writes += envelopes.length;
   assert.equal(new Set(envelopes.map(e=>e.nonce)).size,envelopes.length, 'Concurrent encryption reused a nonce');
   for (const e of envelopes) equal(await new CryptoStore(resolver).open(binding,e),binary);
   // An installed resolver rejects absent scope/key tuples, independently of AAD.
   const scoped = new CryptoStore({async resolve(b){
    if(b.tenantId!==binding.tenantId || b.spaceId!==binding.spaceId || b.keyId!==binding.keyId) throw new Error(marker);
    return {dataKey,digestKey};
   }});
   for (const missing of [{...binding,tenantId:randomUUID()},{...binding,spaceId:randomUUID()},{...binding,keyId:randomUUID()}]) {
    await deny(()=>scoped.seal(missing,text),'CONTENT_UNAVAILABLE');
    await deny(()=>scoped.fingerprint(missing,'subject',text),'CONTENT_UNAVAILABLE');
   }
  });
  await t.test('ENCRYPTION/real-pg-file-copies', async () => {
   // A diagnostic retention probe, not the canonical save/publication service.
   // The eventual owner tables/commands are f05-04; no probe rows grant access.
   await f.admin.query('CREATE TABLE public.fabric_storage_crypto_probe(id uuid PRIMARY KEY,envelope jsonb NOT NULL); REVOKE ALL ON public.fabric_storage_crypto_probe FROM PUBLIC,fabric_controller,fabric_worker,fabric_test_idp');
   const roots = JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,{path:string}>;
   const rows: {id:string; binding:CipherBinding; bytes:Buffer; path:string}[] = [];
   for (const [kind,bytes] of [['object',binary],['manifest',Buffer.from(JSON.stringify({title:marker,filename:marker+'.bin',logicalPath:marker,sourceUri:marker}))],['diagnostic',text]] as const) {
    const b = {...binding,id:randomUUID()}, envelope = await crypto.seal(b,bytes);
    const path = resolve(roots['content']!.path,randomUUID());
    await f.admin.query('INSERT INTO public.fabric_storage_crypto_probe VALUES($1,$2::jsonb)',[b.id,JSON.stringify(envelope)]);
    await writeFile(path,JSON.stringify(envelope),{flag:'wx',mode:0o600}); writes += 2;
    rows.push({id:b.id,binding:b,bytes,path});
    assert.ok(!path.includes(marker) && !path.includes(kind), 'Object names must be opaque');
   }
   const retained = await f.admin.query('SELECT envelope::text AS copy FROM public.fabric_storage_crypto_probe');
   const copies = [...retained.rows.map(r=>Buffer.from(r.copy as string)),...await Promise.all(rows.map(r=>readFile(r.path)))];
   const secrets = [Buffer.from(marker),Buffer.from(Buffer.from(marker).toString('base64')),
    dataKey,digestKey,Buffer.from(dataKey.toString('hex')),Buffer.from(dataKey.toString('base64')),
    Buffer.from(digestKey.toString('hex')),Buffer.from(digestKey.toString('base64'))];
   assert.ok(copies.every(copy=>secrets.every(secret=>!copy.includes(secret))), 'Retained ciphertext copy contains a private canary/key');
   // A fresh PostgreSQL connection and fresh decrypting client, same harness key.
   const reader = new pg.Pool({connectionString:process.env['STORAGE_DATABASE_URL'],max:1});
   try {
    for (const row of rows) {
     const saved = (await reader.query('SELECT envelope FROM public.fabric_storage_crypto_probe WHERE id=$1',[row.id])).rows;
     assert.equal(saved.length,1); equal(await new CryptoStore(resolver).open(row.binding,saved[0].envelope),row.bytes);
     equal(await new CryptoStore(resolver).open(row.binding,JSON.parse(await readFile(row.path,'utf8'))),row.bytes);
    }
   } finally { await reader.end(); }
   await assert.rejects(f.worker.query('SELECT * FROM public.fabric_storage_crypto_probe'),{code:'42501'}); denials++;
  });
  await t.test('ENCRYPTION/all-aad-dimensions', async () => {
   const e = await crypto.seal(binding,text); writes++;
   const changes = {tenantId:randomUUID(),spaceId:randomUUID(),class:'knowledge',id:randomUUID(),
    revision:2,generation:randomUUID(),keyId:randomUUID()} as const;
   for (const [key,value] of Object.entries(changes)) {
    const changed = {...binding,[key]:value};
    // Changing both advertised and expected fields defeats a mere equality check;
    // the original authentication tag must still fail for every AAD dimension.
    await deny(()=>crypto.open(changed,{...e,[key]:value}),'INTEGRITY_FAILED');
    await deny(()=>crypto.open(binding,{...e,[key]:value}),'INTEGRITY_FAILED');
    await deny(()=>crypto.open(changed,e),'INTEGRITY_FAILED');
   }
   await deny(()=>crypto.open({...binding,schemaVersion:2},{...e,schemaVersion:2}),'UNSUPPORTED_VERSION');
  });
  await t.test('ENCRYPTION/cipher-and-key-refusals', async () => {
   const e = await crypto.seal(binding,text); writes++;
   for (const field of ['nonce','tag','ciphertext'] as const) await deny(()=>crypto.open(binding,{...e,[field]:flip(e[field])}),'INTEGRITY_FAILED');
   for (const ciphertext of ['',Buffer.from(e.ciphertext,'base64').subarray(1).toString('base64'),Buffer.concat([Buffer.from(e.ciphertext,'base64'),Buffer.from([0])]).toString('base64')]) await deny(()=>crypto.open(binding,{...e,ciphertext}),'INTEGRITY_FAILED');
   await deny(()=>new CryptoStore({async resolve(){return {dataKey:randomBytes(32),digestKey};}}).open(binding,e),'INTEGRITY_FAILED');
   const missing = new CryptoStore({async resolve(){throw new Error(marker);}});
   await deny(()=>missing.open(binding,e),'CONTENT_UNAVAILABLE');
   await deny(()=>missing.seal(binding,text),'CONTENT_UNAVAILABLE');
   for (const n of [0,16,31,33]) {
    await deny(()=>new CryptoStore({async resolve(){return {dataKey:randomBytes(n),digestKey};}}).open(binding,e),'CONTENT_UNAVAILABLE');
    await deny(()=>new CryptoStore({async resolve(){return {dataKey,digestKey:randomBytes(n)};}}).seal(binding,text),'CONTENT_UNAVAILABLE');
   }
   await deny(()=>new CryptoStore({async resolve(){return {dataKey,digestKey:dataKey};}}).seal(binding,text),'CONTENT_UNAVAILABLE');
   equal(await new CryptoStore(resolver).open(binding,e),text);
  });
  await t.test('ENCRYPTION/scoped-fingerprints', async () => {
   const fp = await crypto.fingerprint(binding,'subject',text);
   assert.match(fp,/^sha256:[0-9a-f]{64}$/);
   assert.equal(await new CryptoStore(resolver).fingerprint(binding,'subject',text),fp); reads++;
   assert.equal(await crypto.fingerprint({...binding,id:randomUUID(),revision:2,generation:randomUUID()},'subject',text),fp); reads++;
   for (const changed of [{...binding,tenantId:randomUUID()},{...binding,spaceId:randomUUID()},
    {...binding,class:'knowledge' as const},{...binding,keyId:randomUUID()}]) assert.notEqual(await crypto.fingerprint(changed,'subject',text),fp);
   for (const purpose of ['content','command','source'] as const) assert.notEqual(await crypto.fingerprint(binding,purpose,text),fp);
   assert.notEqual(await crypto.fingerprint(binding,'subject',binary),fp);
   assert.notEqual(await new CryptoStore({async resolve(){return {dataKey,digestKey:randomBytes(32)};}}).fingerprint(binding,'subject',text),fp);
  });
  await t.test('ENCRYPTION/closed-input-and-bounds', async () => {
   const e: CipherEnvelope = await crypto.seal(binding,text); writes++;
   for (const envelope of [{...e,algorithm:'AES-128-GCM'},{...e,key:dataKey.toString('base64')},{...e,nonce:'AA=='},
    {...e,tag:'AA=='},{...e,ciphertext:'!!!!'},{...e,ciphertext:'AB=='},{...e,ciphertext:'A'.repeat(4*Math.ceil(LIMITS.backupBytes/3)+4)}]) await deny(()=>crypto.open(binding,envelope),'INVALID_SCHEMA');
   await deny(()=>crypto.seal({...binding,key:dataKey},text),'INVALID_SCHEMA');
   await deny(()=>crypto.seal(binding,new Uint8Array(LIMITS.backupBytes+1)),'INVALID_SCHEMA');
   await deny(()=>crypto.seal(binding,new Uint8Array(new SharedArrayBuffer(1))),'INVALID_SCHEMA');
   let called = 0;
   const counted = new CryptoStore({async resolve(){called++; return {dataKey,digestKey};}});
   await deny(()=>counted.open({...binding,id:randomUUID()},e),'INTEGRITY_FAILED');
   assert.equal(called,0,'Reject unexpected binding before key lookup');
   let getter = 0;
   const hostile = {...binding}; Object.defineProperty(hostile,'id',{enumerable:true,get(){getter++; return marker;}});
   await deny(()=>crypto.seal(hostile,text),'INVALID_SCHEMA'); assert.equal(getter,0);
  });
  emitObservations({schemaVersion:1,measurement:'storage-observations',suite:'encryption',
   positives:{save:0,ask:0,forget:0,restore:0,read:reads,write:writes,deny:denials,conflict:0,propagate:0,backup:0,owner:0,harness:0},
   violations:{unauthorizedDisclosure:disclosures,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0}});
 } finally { dataKey.fill(0); digestKey.fill(0); await f.close(); }
});
