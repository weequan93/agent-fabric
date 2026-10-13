import assert from 'node:assert/strict';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { cache } from '../paths.mjs';
import { hash,processCensus } from '../recovery/ownership.mjs';
import { durableFile } from '../recovery/journal.mjs';
import { syncDirectory } from './journal.mjs';
const config=JSON.parse(process.env.FABRIC_CUSTODIAN_CONFIG);delete process.env.FABRIC_CUSTODIAN_CONFIG;
assert.equal(process.argv.length,3);assert.deepEqual(Object.keys(config).sort(),['marker','label','operation'].sort());assert.equal(config.operation,'closed-durable-probe');assert.equal(config.marker,process.argv[2]);assert(['A','B','C'].includes(config.label));
process.stdout.write(JSON.stringify({pid:process.pid,marker:config.marker})+'\n');
const requiredEnv=['STORAGE_DATABASE_URL','STORAGE_FIXTURE_OWNER','STORAGE_FIXTURE_INSTANCE','STORAGE_REPO_ROOT','STORAGE_OWNER_ROOT','STORAGE_FIXTURE_ROOT','STORAGE_OWNED_ROOTS'];
const allowedEnv=['PATH','LC_ALL',...requiredEnv,...(process.platform==='darwin'?['__CF_USER_TEXT_ENCODING']:[])];
assert(Object.keys(process.env).every(key=>allowedEnv.includes(key)),'Unexpected worker environment key');
for(const key of requiredEnv)assert(process.env[key]);
const {createStorageFixture}=await import(pathToFileURL(resolve(cache,'g1-storage/tests/helpers/pg-fixture.js')).href);
let fixture,resolveWork,begin;const work=new Promise(r=>resolveWork=r),release=new Promise(r=>begin=r);
process.on('message',m=>{if(m?.kind==='begin')begin('released');if(m?.kind==='finish'){begin('cancelled');resolveWork('normal');}});
process.on('SIGTERM',()=>{begin('cancelled');resolveWork('cancelled');});
try{
 assert.equal(await release,'released','Worker work requires durable custodian release');
 fixture=await createStorageFixture();
 const response=await fetch(fixture.idp.ready.jwksUrl,{signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);const jwks=await response.json();assert(jwks.keys.length>0);
 const plaintext=randomBytes(79),key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]),tag=cipher.getAuthTag(),bytes=Buffer.concat([iv,tag,encrypted]);
 const path=resolve(JSON.parse(process.env.STORAGE_OWNED_ROOTS).content.path,'durable-probe.aesgcm');durableFile(path,bytes);syncDirectory(resolve(path,'..'));
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);assert.deepEqual(Buffer.concat([decipher.update(readFileSync(path).subarray(28)),decipher.final()]),plaintext);assert(!bytes.includes(plaintext));
 await fixture.admin.query('CREATE TABLE public.custodian_durable_probe(label text PRIMARY KEY,digest text NOT NULL)');
 await fixture.admin.query('INSERT INTO public.custodian_durable_probe VALUES($1,$2)',[config.label,hash(bytes)]);
 assert.deepEqual((await fixture.admin.query('SELECT * FROM public.custodian_durable_probe')).rows,[{label:config.label,digest:hash(bytes)}]);
 const rows=await processCensus(),parent=rows.find(r=>r.pid===process.pid),idp=fixture.idp;
 const child={pid:idp.pid,nonce:idp.marker,instance:idp.identity.instance,command:idp.identity.command,parentPid:process.pid,parentInstance:parent.instance,script:resolve(cache,'g1-storage/tests/helpers/idp-process.js')};
 const database=new URL(process.env.STORAGE_DATABASE_URL);
 const environment={keys:requiredEnv.sort(),databaseHost:database.hostname,databaseName:database.pathname,databasePort:database.port,
  repoRoot:process.env.STORAGE_REPO_ROOT,ownerRoot:process.env.STORAGE_OWNER_ROOT,fixtureRoot:process.env.STORAGE_FIXTURE_ROOT,roots:Object.values(JSON.parse(process.env.STORAGE_OWNED_ROOTS)).map(r=>r.path)};
 process.send({kind:'durable',label:config.label,child,proof:{file:path,bytes:bytes.length,digest:hash(bytes),plaintextDigest:hash(plaintext),encrypted:true,fsynced:true,databaseCommitted:true,idpHttpStatus:response.status,jwksDigest:hash(jwks),owner:fixture.owner,instance:fixture.instance,environment}});
 const outcome=await work;if(outcome!=='normal')process.exitCode=1;
}catch(e){console.error('Closed durable probe failed: '+e.message);process.exitCode=1;}
finally{if(fixture)await fixture.close();if(process.connected)process.disconnect();}
