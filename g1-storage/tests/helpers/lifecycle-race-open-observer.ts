import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {CryptoStore} from '../../src/crypto-store.js';
import type {CipherBinding} from '../../src/contracts.js';
import {BindingSchema} from '../../src/schema.js';
import type {OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {StagingWitnessJournal} from '../../src/staging-witness.js';
import type {PropagationVerificationFixture} from './propagation-verification-fixture.js';
import {volumeId} from './volume-verification-owner.js';

/** Attribute opens to one real repository instance. No key, envelope, plaintext
 * or publication behavior is replaced; the original CryptoStore executes. */
export function createLifecycleRaceOpenObserver(crypto:CryptoStore){
 const opens:CipherBinding[]=[],open=crypto.open.bind(crypto);
 crypto.open=async(binding,envelope)=>{opens.push(Object.freeze(BindingSchema.parse(binding)));return open(binding,envelope);};
 const assertRestricted=async(f:PropagationVerificationFixture,scenario:{s:{root:OwnedAnchorRoot}},operation:string,promotion?:{key:string;sessionId:string;targetId:string})=>{
  if(operation!=='promotion'){assert.equal(opens.length,0,'Restricted loser never opens published payload');console.log(JSON.stringify({measurement:'lifecycle-loser-private-opens',operation,opens:0,privateOriginal:false,unauthorizedPayloadOpens:0}));return;}
  assert(promotion,'Exact original promotion is required');assert.equal(opens.length,2,'Only private original manifest and object may open');
  const scope=f.scope,root=scenario.s.root,rows=(await f.f.admin.query('SELECT * FROM fabric.storage_staging_reservations WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,promotion.key])).rows;assert.equal(rows.length,1);const row=rows[0]!;
  const expected=BindingSchema.parse({schemaVersion:1,tenantId:scope.tenantId,spaceId:scope.spaceId,class:'artifact',id:volumeId(['storage-volume-artifact-v1',scope.tenantId,scope.spaceId,scope.actorId,promotion.key]),revision:1,keyId:f.keyId,generation:f.generation});
  assert.equal(row['class'],'artifact');assert.equal(row['id'],expected.id);assert.equal(Number(row['revision']),1);assert.equal(row['generation'],expected.generation);assert.equal(row['key_id'],expected.keyId);assert.equal(row['session_id'],promotion.sessionId);assert.equal(row['root_id'],root.rootId);assert.equal(row['actor_id'],scope.actorId);assert.equal(row['command_key'],promotion.key);
  for(const binding of opens)assert.deepEqual(binding,expected,'No source, knowledge, published draft/base or unrelated artifact opens');
  assert.equal(root.owner,f.f.owner);assert.equal(root.instance,f.f.instance);const stat=await lstat(root.path);assert(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(await realpath(root.path),root.path);assert.equal(stat.dev,root.device);assert.equal(stat.ino,root.inode);assert.deepEqual(JSON.parse((await readFile(resolve(root.path,'.storage-owner.json'))).toString()),{owner:root.owner,instance:root.instance,rootId:root.rootId,device:root.device,inode:root.inode});
  const native=await f.f.native.snapshot(scope,promotion.sessionId);assert.equal(row['source_task_id'],native.binding.taskId);assert.equal(native.binding.actorId,scope.actorId);assert.equal(native.binding.purpose,'maintenance');
  const witness=await new StagingWitnessJournal(f.witnessRoot).state(scope.tenantId,scope.spaceId,scope.actorId,promotion.key);assert.equal(witness.intent,undefined);assert.equal(witness.terminal,undefined);assert(row['expires_at'] instanceof Date);assert.deepEqual(witness.original,{schemaVersion:1,actorId:scope.actorId,commandKey:promotion.key,materialId:row['material_id'],uploadId:row['upload_id'],rootId:root.rootId,binding:expected,sessionId:promotion.sessionId,sourceTaskId:native.binding.taskId,expiresAt:row['expires_at'].toISOString()});
  const confirmations=(await f.f.admin.query('SELECT * FROM fabric.storage_staging_confirmations WHERE tenant_id=$1 AND space_id=$2 AND upload_id=$3',[scope.tenantId,scope.spaceId,row['upload_id']])).rows;assert.equal(confirmations.length,1);const confirmation=confirmations[0]!;
  for(const name of ['manifest','object'] as const){const bytes=await readFile(resolve(root.path,'u-'+String(row['upload_id']),name));try{assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),confirmation[name+'_digest']);assert.equal(bytes.length,Number(confirmation[name+'_size']));}finally{bytes.fill(0);}}
  for(const table of ['storage_artifact_versions','storage_head_publications','storage_outbox','storage_volume_versions','storage_volume_promotions'])assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE tenant_id=$1 AND space_id=$2 AND actor_id=$3 AND command_key=$4',[scope.tenantId,scope.spaceId,scope.actorId,promotion.key])).rows[0]?.['n'],0,'Private original never becomes published '+table);
  assert.equal((await f.f.admin.query("SELECT count(*)::int AS n FROM fabric.storage_current_heads WHERE tenant_id=$1 AND space_id=$2 AND class='artifact' AND id=$3",[scope.tenantId,scope.spaceId,expected.id])).rows[0]?.['n'],0);
  console.log(JSON.stringify({measurement:'lifecycle-loser-private-opens',operation,opens:opens.length,privateOriginal:true,originalKey:promotion.key,privateArtifactId:expected.id,logicalTargetId:promotion.targetId,uploadId:row['upload_id'],rootId:root.rootId,currentNativeTask:true,exactIndependentWitness:true,exactConfirmedFiles:true,unauthorizedPayloadOpens:0}));
 };
 return {crypto,opens,assertRestricted};
}
