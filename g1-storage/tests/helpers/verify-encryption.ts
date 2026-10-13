import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import {CryptoStore} from '../../src/crypto-store.js';
import {BindingSchema,CipherEnvelopeSchema,SourcePayloadSchema,KnowledgeSchema} from '../../src/schema.js';
import {GraphDerivedPayloadSchema} from '../../src/dependency-graph.js';
import {StorageError} from '../../src/errors.js';
import type {CipherBinding,CipherEnvelope} from '../../src/contracts.js';
import {createAuthorityRouteFixture} from './authority-route-fixture.js';
import {installedOwnerSnapshot} from '../../src/migration.js';
import {emitObservations} from './observations.js';
import type {ComponentTest} from './canonical-component.js';

const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
type Location={kind:'file';path:string}|{kind:'pg';sql:string;values:unknown[]};
type Interior={binding:CipherBinding;digest:string;length:number;manifest:boolean};
type Job={location:Location;binding:CipherBinding;digest:string;length:number;interiors?:Interior[]};
type Install={database:string;dataKey:Buffer;digestKey:Buffer;jobs:Job[]};

// Dedicated fresh reader process. The synthetic database connection and keys
// cross private IPC only; no keys in argv/env/files/output. It reads retained
// bytes itself and invokes the real CryptoStore, returning exact-byte hashes.
if(process.env['STORAGE_VERIFY_CIPHER_READER']==='1'){
 process.once('message',async(raw:unknown)=>{
  const input=raw as Install,reader=new pg.Pool({connectionString:input.database,max:1});
  const c=new CryptoStore({resolve:async()=>({dataKey:input.dataKey,digestKey:input.digestKey})});
  let ok=false;
  try{
   assert(input.jobs.length>0);
   for(const job of input.jobs){
    const raw=job.location.kind==='file'?JSON.parse(await readFile(job.location.path,'utf8')):
     (await reader.query(job.location.sql,job.location.values)).rows[0]?.value;
    const envelope=CipherEnvelopeSchema.parse(typeof raw==='string'?JSON.parse(raw):raw),bytes=await c.open(job.binding,envelope);
    try{
     assert.equal(bytes.length,job.length);assert.equal(hash(bytes),job.digest);
     if(job.interiors){const inventory=JSON.parse(bytes.toString()) as {items:{binding:CipherBinding;envelope:CipherEnvelope;manifest:CipherEnvelope|null}[]};
      for(const expected of job.interiors){const item=inventory.items.find(i=>JSON.stringify(i.binding)===JSON.stringify(expected.binding));assert(item);const envelope=expected.manifest?item.manifest:item.envelope;assert(envelope);const b=await c.open(expected.binding,envelope);try{assert.equal(b.length,expected.length);assert.equal(hash(b),expected.digest);}finally{b.fill(0);}}
     }
    }finally{bytes.fill(0);}
   }
   ok=true;
  }catch{/* Never send decrypted diagnostic material or driver errors. */}
  finally{input.dataKey.fill(0);input.digestKey.fill(0);await reader.end();}
  if(process.send)process.send({ok,pid:process.pid,count:input.jobs.length},()=>process.disconnect());
 });
}

async function freshReader(input:Install){
 const child=fork(new URL('./verify-encryption.js',import.meta.url),[],{execArgv:[],env:{STORAGE_VERIFY_CIPHER_READER:'1'},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});
 const pid=child.pid;assert(pid&&pid>1&&pid!==process.pid);
 const output:Buffer[]=[];child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));
 const closed=once(child,'close');closed.catch(()=>{});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=new Promise<{ok:boolean;pid:number;count:number}>((accept,reject)=>{
   child.once('message',(v:unknown)=>accept(v as {ok:boolean;pid:number;count:number}));
   child.once('error',()=>reject(new Error('Owned fresh reader failed')));
   child.once('exit',()=>reject(new Error('Fresh reader exited before result')));
   timer=setTimeout(()=>reject(new Error('Owned fresh reader timeout')),10_000);
  });
  child.send(input);const r=await result;assert.equal(r.ok,true,'Fresh process must decrypt exact actual retained bytes');assert.equal(r.pid,pid);assert.equal(r.count,input.jobs.length);
  const [code,signal]=await closed;assert.equal(code,0);assert.equal(signal,null);assert.equal(Buffer.concat(output).length,0,'Fresh reader emits no private diagnostic output');
 }finally{if(timer)clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed.catch(()=>{});input.dataKey.fill(0);input.digestKey.fill(0);}
}

/** E01/E02 use the same installed per-class owners as full storage acceptance.
 * Fault injection only changes owned reproducible ciphertext copies, restoring
 * each exact original before the next variant; current controls are untouched. */
export async function registerVerifyEncryptionTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations,suite:'verify-encryption'|'owned-encryption'='verify-encryption'){
 let x=await createAuthorityRouteFixture(),f=x.f,s=f.scope,active=true;
 const positives={...x.count},violations={...x.violations};
 type Copy={name:string;binding:CipherBinding;envelope:CipherEnvelope;location:Location;set:(e:unknown)=>Promise<void>;read:()=>Promise<void>;plain:Buffer;sqlChecks?:{table:string;names:string[]}};
 const copies:Copy[]=[];let files:Awaited<ReturnType<typeof x.files>>|undefined;const archiveInteriors:Interior[]=[];
 const jobs=():Job[]=>copies.map(c=>({location:c.location,binding:c.binding,digest:hash(c.plain),length:c.plain.length,...(c.name==='backup'?{interiors:archiveInteriors}:{})}));
 const deny=async(work:()=>Promise<unknown>,codes:string[])=>{let denied=false;try{await work();x.violations.unauthorizedDisclosure++;}catch(e){assert(e instanceof StorageError&&codes.includes(e.code),'Cipher alteration must produce an expected redacted typed refusal');denied=true;}assert(denied);x.count.deny++;};
 const fault=async(sql:string,values:unknown[])=>{const c=await f.admin.connect();try{await c.query('BEGIN');await c.query("SET LOCAL session_replication_role='replica'");const q=await c.query(sql,values);assert.equal(q.rowCount,1);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const add=async(name:string,envelope:CipherEnvelope,location:Location,set:Copy['set'],read:Copy['read'],sqlChecks?:Copy['sqlChecks'])=>{
  await read(); // Existing current-authority checks always precede sensitive read.
  const binding=BindingSchema.parse({schemaVersion:envelope.schemaVersion,tenantId:envelope.tenantId,spaceId:envelope.spaceId,class:envelope.class,id:envelope.id,revision:envelope.revision,generation:envelope.generation,keyId:envelope.keyId});
  const plain=await x.cipher().open(binding,envelope);assert(plain.length>0);copies.push({name,binding,envelope,location,set,read,plain,...(sqlChecks?{sqlChecks}:{})});x.count.read++;
 };
 const pgCopy=async(name:string,table:string,column:string,where:string,values:unknown[],read:Copy['read'])=>{
  const sql=`SELECT ${column} AS value FROM fabric.${table} WHERE ${where}`,rows=(await f.admin.query(sql,values)).rows;assert.equal(rows.length,1);
  const raw=rows[0].value,envelope=CipherEnvelopeSchema.parse(typeof raw==='string'?JSON.parse(raw):raw);
  // Only real declared CHECKs on this retained ciphertext field can qualify an
  // injection refusal. A driver, permission, timeout or unrelated constraint
  // error remains a failure. The original witness/head are never forged.
  const checks=(await f.admin.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c'",['fabric.'+table])).rows.filter(r=>String(r.definition).includes(column)).map(r=>String(r.conname));
  const set=async(e:unknown)=>{await fault(`UPDATE fabric.${table} SET ${column}=$${values.length+1}${column==='envelope'&&table==='storage_ask_receipts'?'::jsonb':''} WHERE ${where}`,[...values,JSON.stringify(e)]);};
  await add(name,envelope,{kind:'pg',sql,values},set,read,{table,names:checks});
 };
 const fileCopy=async(name:string,path:string,read:Copy['read'])=>{const envelope=CipherEnvelopeSchema.parse(JSON.parse(await readFile(path,'utf8')));await add(name,envelope,{kind:'file',path},async(e:unknown)=>{await writeFile(path,JSON.stringify(e));},read);};
 const retire=async()=>{
  if(!active)return;
  try{
   assert.deepEqual(await installedOwnerSnapshot(f.admin),x.ownerBefore);
   assert.deepEqual(x.ports,{computer:0,shell:0,model:0,enrichment:0,effect:0});
   for(const k of Object.keys(positives) as (keyof typeof positives)[])positives[k]+=x.count[k];
   for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=x.violations[k];
  }finally{
   for(const c of copies)c.plain.fill(0);files?.bytes.fill(0);files=undefined;copies.length=0;archiveInteriors.length=0;
   try{await x.close();}finally{active=false;}
  }
 };
 // Reuse exactly the same real every-class initialization for each bounded
 // group. A source's original 59-second retention and 60-second policy remain
 // unchanged; later mutation groups receive fresh independently owned content.
 const initializeAllClasses=async()=>{
    const core=await x.core(s);files=await x.files(core);
    const summary=await x.derived(core,'summary-v1'),index=await x.derived(core,'keywords-v1'),cache=await x.derived(core,'cache-v1'),historicalAsk=await x.ask(core);
    const historicalEnvelope=CipherEnvelopeSchema.parse((await f.admin.query('SELECT envelope FROM fabric.storage_ask_receipts WHERE id=$1',[historicalAsk.result.receiptId])).rows[0].envelope);
    const scoped='tenant_id=$1 AND space_id=$2',p=[s.tenantId,s.spaceId];
    await pgCopy('source','storage_sources','cipher_text',scoped+' AND source_id=$3 AND revision=1',[...p,core.source.targetId],async()=>{const r=await core.readSource();assert.equal(r.narrative,core.source.narrative);assert.equal(r.title,core.source.title);x.count.read++;});
    await pgCopy('knowledge','storage_knowledge_revisions','cipher_text',scoped+' AND id=$3 AND revision=1',[...p,core.save.targetId],async()=>{const r=await core.readKnowledge();assert.equal(r.value,core.save.assertion.value);assert.equal(r.subject,core.save.assertion.subject);x.count.read++;});
    for(const [i,command] of [files.ac,files.live,files.draft,files.checkpoint].entries()){
     const id=command.targetId,kind=i===0?'artifact':i===1?'live-file':i===2?'draft':'checkpoint';
     const rows=(await f.admin.query(`SELECT a.upload_id FROM fabric.storage_artifact_versions a ${i?'JOIN fabric.storage_volume_versions v ON(a.tenant_id,a.space_id,a.id)=(v.tenant_id,v.space_id,v.artifact_id)':''} WHERE a.tenant_id=$1 AND a.space_id=$2 AND ${i?'v':'a'}.id=$3 AND ${i?'v':'a'}.revision=1`,[...p,id])).rows;assert.equal(rows.length,1);
     const read=async()=>{await files!.reads[i]!.read();x.count.read++;};
     for(const field of ['object','manifest'])await fileCopy(kind+'/'+field,resolve(x.roots['content']!.path,'u-'+rows[0].upload_id,field),read);
    }
    for(const d of [summary,index,cache])await pgCopy(d.class,'storage_graph_payloads','envelope',scoped+' AND class=$3 AND id=$4 AND revision=1',[...p,d.class,d.ref.id],async()=>{const b=await d.read();try{assert(b.equals(d.expected));x.count.read++;}finally{b.fill(0);}});
    const backup=await x.backupOf(core),readBackup=async()=>{const r=await backup.read();assert.equal(r.confirmed,true);assert.equal(r.serving,false);assert.equal(r.inventory.binding.id,backup.c.backupId);x.count.read++;};
    await fileCopy('backup',resolve(x.roots['backup']!.path,'c-'+backup.c.backupId,'archive'),readBackup);
    const opens=x.opens();await deny(()=>historicalAsk.read(),['CONTENT_UNAVAILABLE']);assert.equal(x.opens(),opens,'Historical pre-backup Ask must refuse before decryption');
    // Create this governed answer after the backup head changes authority epoch.
    // The archive represents its earlier coherent captured epoch, while this
    // current Ask remains useful through every subsequent encryption read.
    const ask=await x.ask(core);
    await pgCopy('ask','storage_ask_receipts','envelope',scoped+' AND id=$3',[...p,ask.result.receiptId],async()=>{const r=await ask.read();assert.equal(r.answer,ask.result.answer);assert.deepEqual(r.manifest,ask.result.manifest);x.count.read++;});
    assert.deepEqual(copies.map(c=>c.name).sort(),['source','knowledge','artifact/object','artifact/manifest','live-file/object','live-file/manifest','draft/object','draft/manifest','checkpoint/object','checkpoint/manifest','summary','index','cache','ask','backup'].sort());
    const source=copies.find(c=>c.name==='source')!,knowledge=copies.find(c=>c.name==='knowledge')!;
    assert.equal(SourcePayloadSchema.parse(JSON.parse(source.plain.toString())).narrative,core.source.narrative);
    assert.equal(KnowledgeSchema.parse(JSON.parse(knowledge.plain.toString())).value,core.save.assertion.value);
    for(const d of [summary,index,cache])assert(Buffer.from(GraphDerivedPayloadSchema.parse(JSON.parse(copies.find(c=>c.name===d.class)!.plain.toString())).bytes,'base64').equals(d.expected));
    const nonces=copies.map(c=>c.envelope.nonce);assert.equal(new Set(nonces).size,nonces.length,'Every independent retained write needs a fresh nonce');
    for(const c of copies){assert.equal(c.envelope.algorithm,'AES-256-GCM');assert.equal(Buffer.from(c.envelope.nonce,'base64').length,12);assert.equal(Buffer.from(c.envelope.tag,'base64').length,16);assert.equal(Buffer.from(c.envelope.ciphertext,'base64').length,c.plain.length);assert(!Buffer.from(c.envelope.ciphertext,'base64').equals(c.plain));}
    const inventory=(await backup.read()).inventory;
    assert.deepEqual([...new Set(inventory.items.map(i=>i.logical?.kind??i.binding.class))].sort(),['source','knowledge','artifact','live-file','draft','checkpoint','summary','index','cache','ask'].sort());
    for(const item of inventory.items){
     const expected=copies.find(c=>c.binding.id===item.binding.id&&c.name.endsWith('/object'))??copies.find(c=>c.binding.id===item.binding.id&&c.name!=='backup');
     if(item.binding.class==='ask'){assert.equal(item.binding.id,historicalAsk.result.receiptId);assert.deepEqual(item.envelope,historicalEnvelope);}else{assert(expected);assert.deepEqual(item.envelope,expected.envelope);}
     if(item.manifest)assert.deepEqual(item.manifest,copies.find(c=>c.binding.id===item.binding.id&&c.name.endsWith('/manifest'))!.envelope);
     const envelopes:[boolean,CipherEnvelope][]=[[false,item.envelope]];if(item.manifest)envelopes.push([true,item.manifest]);
     for(const [manifest,e] of envelopes){const bytes=await x.cipher().open(item.binding,e);try{if(item.binding.class==='ask'){const payload=JSON.parse(bytes.toString());assert.equal(payload.answer,historicalAsk.result.answer);assert.deepEqual(payload.manifest,historicalAsk.result.manifest);}archiveInteriors.push({binding:item.binding,manifest,digest:hash(bytes),length:bytes.length});x.count.read++;}finally{bytes.fill(0);}}
    }
 };
 try{
  await register('E01 / every declared encrypted class and recreated process',async t=>{
   await t.test('E01/all-classes',initializeAllClasses);
   await t.test('E01/recreated-reader',async()=>{
    for(const c of copies)await c.read();
    const keys=x.keyCanaries();assert.equal(keys.length,2);
    await freshReader({database:process.env['STORAGE_DATABASE_URL']!,dataKey:keys[0]!,digestKey:keys[1]!,jobs:jobs()});x.count.read+=copies.length+archiveInteriors.length;x.count.harness++;
   });
   await t.test('E01/exact-binary',async()=>{
    assert(files);const c=copies.find(c=>c.name==='artifact/object')!;assert(c.plain.equals(files.bytes));assert(files.bytes.some(v=>v!==0));
    for(const name of ['live-file/object','draft/object']){const plain=copies.find(c=>c.name===name)!.plain,header=plain.readUInt32BE(0);assert(header>0&&header+4<plain.length);assert(plain.subarray(header+4).equals(files.bytes));}
    for(const c of copies)await c.read();
   });
  });
  await register('E02 / persisted per-class ciphertext and authenticated binding refusals',async t=>{
   let before=await x.snapshot(),executed=0;
   const flip=(s:string)=>{const b=Buffer.from(s,'base64');assert(b.length>0);b[0]=b[0]!^1;return b.toString('base64');};
   const variant=async(name:string,body:()=>Promise<void>)=>{
    if(executed>0&&executed%4===0){
     await retire();x=await createAuthorityRouteFixture();f=x.f;s=f.scope;active=true;
     await initializeAllClasses();before=await x.snapshot();
    }
    executed++;await t.test(name,body);
   };
   const boundaries={sqlCheckRefusals:0,persistedMutations:0,ownerRefusals:0};
   const actualEnvelope=async(c:Copy)=>{const loc=c.location,raw=loc.kind==='file'?JSON.parse(await readFile(loc.path,'utf8')):(await f.admin.query(loc.sql,loc.values)).rows[0]?.value;return typeof raw==='string'?JSON.parse(raw):raw;};
   const persistedMutation=async(c:Copy,mutant:unknown,codes:string[])=>{
    const original=await actualEnvelope(c);assert.deepEqual(original,c.envelope);
    let persisted=false;
    try{
     try{await c.set(mutant);persisted=true;}
     catch(e){
      const pgError=e as {code?:string;table?:string;constraint?:string};
      assert(c.location.kind==='pg'&&c.sqlChecks&&e instanceof Error&&pgError.code==='23514'&&pgError.table===c.sqlChecks.table&&typeof pgError.constraint==='string'&&c.sqlChecks.names.includes(pgError.constraint),'Owned ciphertext injection must be refused by an actual declared field CHECK');
      assert.deepEqual(await actualEnvelope(c),original,'SQL CHECK rejection preserves the exact retained envelope');
      assert.deepEqual(await x.snapshot(),before,'SQL CHECK rejection preserves all actual records and authority');
      boundaries.sqlCheckRefusals++;x.count.deny++;
     }
     if(persisted){assert.deepEqual(await actualEnvelope(c),mutant,'Serving refusal must inspect an actually persisted mutant');boundaries.persistedMutations++;await deny(c.read,codes);boundaries.ownerRefusals++;}
    }finally{if(persisted)await c.set(c.envelope);}
    assert.deepEqual(await actualEnvelope(c),original,'Every successful injection restores its exact original envelope');
    await c.read(); // Full unchanged control/accounting snapshot follows each variant.
   };
   const corrupt:Record<string,(c:Copy)=>unknown>={body:c=>({...c.envelope,ciphertext:flip(c.envelope.ciphertext)}),tag:c=>({...c.envelope,tag:flip(c.envelope.tag)}),nonce:c=>({...c.envelope,nonce:flip(c.envelope.nonce)}),truncated:c=>({...c.envelope,ciphertext:Buffer.from(c.envelope.ciphertext,'base64').subarray(1).toString('base64')}),algorithm:c=>({...c.envelope,algorithm:'AES-128-GCM'}),version:c=>({...c.envelope,schemaVersion:2})};
   for(const [name,mutation] of Object.entries(corrupt))await variant('E02/'+name,async()=>{
    for(const c of copies){const e=mutation(c);await deny(()=>x.cipher().open(c.binding,e),name==='algorithm'?['INVALID_SCHEMA']:name==='version'?['UNSUPPORTED_VERSION']:['INTEGRITY_FAILED']);
     await persistedMutation(c,e,['INTEGRITY_FAILED','INVALID_SCHEMA','UNSUPPORTED_VERSION','CONTENT_UNAVAILABLE','AUTHORITY_UNAVAILABLE','UNAUTHORIZED']);}
    assert.deepEqual(await x.snapshot(),before,'Rejected ciphertext never mutates controls, receipts or publication');
   });
   const dimensions:Record<string,keyof CipherBinding>={tenant:'tenantId',space:'spaceId',class:'class',id:'id',revision:'revision',generation:'generation','key-id':'keyId'};
   for(const [name,field] of Object.entries(dimensions))await variant('E02/'+name,async()=>{
    for(const c of copies){const value=field==='revision'?c.binding.revision+1:field==='class'?(c.binding.class==='knowledge'?'source':'knowledge'):randomUUID();
     const binding={...c.binding,[field]:value},envelope={...c.envelope,[field]:value};
     // Both self-advertised and expected AAD change: equality alone cannot pass.
     await deny(()=>x.cipher().open(binding,envelope),['INTEGRITY_FAILED']);await deny(()=>x.cipher().open(c.binding,envelope),['INTEGRITY_FAILED']);await deny(()=>x.cipher().open(binding,c.envelope),['INTEGRITY_FAILED']);
     await persistedMutation(c,envelope,['INTEGRITY_FAILED','CONTENT_UNAVAILABLE','AUTHORITY_UNAVAILABLE','UNAUTHORIZED']);
     if(field==='id'){
      const other=copies.find(o=>o!==c&&o.binding.id!==c.binding.id)!;await deny(()=>x.cipher().open(c.binding,other.envelope),['INTEGRITY_FAILED']);
      const swapped={...c.envelope,nonce:other.envelope.nonce,tag:other.envelope.tag,ciphertext:other.envelope.ciphertext};
      await deny(()=>x.cipher().open(c.binding,swapped),['INTEGRITY_FAILED']);
      await persistedMutation(c,swapped,['INTEGRITY_FAILED','CONTENT_UNAVAILABLE','AUTHORITY_UNAVAILABLE','UNAUTHORIZED']);
     }
    }assert.deepEqual(await x.snapshot(),before);
   });
   await variant('E02/wrong-key',async()=>{const keys=x.keyCanaries(),wrong=randomBytes(32);try{for(const c of copies)await deny(()=>new CryptoStore({resolve:async()=>({dataKey:wrong,digestKey:keys[1]!})}).open(c.binding,c.envelope),['INTEGRITY_FAILED']);}finally{wrong.fill(0);for(const k of keys)k.fill(0);}assert.deepEqual(await x.snapshot(),before);});
   await variant('E02/missing-key',async()=>{for(const c of copies){await deny(()=>new CryptoStore({resolve:async()=>{throw new Error('Owned unavailable synthetic key');}}).open(c.binding,c.envelope),['CONTENT_UNAVAILABLE']);for(const length of [0,16,31,33])await deny(()=>new CryptoStore({resolve:async()=>({dataKey:Buffer.alloc(length),digestKey:Buffer.alloc(32,1)})}).open(c.binding,c.envelope),['CONTENT_UNAVAILABLE']);}assert.deepEqual(await x.snapshot(),before);});
   await variant('E02/original-allowed',async()=>{for(const c of copies){await c.read();const b=await x.cipher().open(c.binding,c.envelope);try{assert(b.equals(c.plain));x.count.read++;}finally{b.fill(0);}}const keys=x.keyCanaries();await freshReader({database:process.env['STORAGE_DATABASE_URL']!,dataKey:keys[0]!,digestKey:keys[1]!,jobs:jobs()});x.count.read+=copies.length+archiveInteriors.length;assert.deepEqual(await x.snapshot(),before);assert.deepEqual(x.ports,{computer:0,shell:0,model:0,enrichment:0,effect:0});});
   assert.equal(executed,16,'Every frozen E02 variant executes exactly once across the fresh fixture schedule');
   assert(boundaries.sqlCheckRefusals>0&&boundaries.persistedMutations>0);
   assert.equal(boundaries.persistedMutations,boundaries.ownerRefusals,'Every actually persisted poison has an actual serving refusal');
   assert.equal(boundaries.sqlCheckRefusals+boundaries.persistedMutations,copies.length*14,'Every class traverses all 13 field mutations and whole-cipher substitution');
   t.diagnostic('Observed encryption fault boundaries: '+JSON.stringify(boundaries));
  });
  await retire();
  observe({schemaVersion:1,measurement:'storage-observations',suite,positives,violations});
 }finally{await retire();}
}
