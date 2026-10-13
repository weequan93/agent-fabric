import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createAuthorityRouteFixture,type AuthorityRouteFixture} from './authority-route-fixture.js';
import {emitObservations} from './observations.js';
import type {ComponentTest} from './canonical-component.js';
import {BindingSchema,CipherEnvelopeSchema,BackupCommandSchema,RestoreCommandSchema} from '../../src/schema.js';
import {RECORD_INVENTORY,CONTROL_INVENTORY,RESTORE_ACTIVATION_RECORD_INVENTORY,RESTORE_PROGRESS_RECORD_INVENTORY} from '../../src/record-inventory.js';
import {GRAPH_RECORD_INVENTORY} from '../../src/dependency-graph-inventory.js';
import {migrateStorageRestoreActivation,installedOwnerSnapshot} from '../../src/migration.js';
import {RestoreActivationRepository} from '../../src/restore-activation.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {KnowledgeSaveRepository,sourceNarrativeDigest} from '../../src/knowledge-save.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {startKnowledgeCommandHttp} from '../../src/command-http.js';
import {safeFailure,demand,StorageError} from '../../src/errors.js';
import type {VerifiedScope} from '../../src/owners.js';
import type {SaveCommand} from '../../src/contracts.js';

/** Scan actual values, including recursive JSON strings, buffers and encoded
 * canaries. Labels never contain a private value and are safe on failure. */
function canaryForms(values:readonly Buffer[]):Buffer[]{return values.flatMap(b=>[Buffer.from(b),Buffer.from(b.toString('base64')),Buffer.from(b.toString('hex')),Buffer.from(JSON.stringify(b.toString()).slice(1,-1))]).filter(b=>b.length>=16);}
function scanValue(value:unknown,needles:readonly Buffer[],label:string):number{
 let inspected=0;
 const visit=(v:unknown,depth:number)=>{assert(depth<=32,'Retained value nesting bound');if(v===null||v===undefined)return;
  if(Buffer.isBuffer(v)){inspected++;assert(needles.every(n=>!v.includes(n)),'Private canary retained in '+label);return;}
  if(typeof v==='string'){const b=Buffer.from(v);inspected++;assert(needles.every(n=>!b.includes(n)),'Private canary retained in '+label);if((v.startsWith('{')||v.startsWith('['))&&v.length<8_000_000){let parsed:unknown;try{parsed=JSON.parse(v);}catch{return;}visit(parsed,depth+1);}return;}
  if(Array.isArray(v)){for(const e of v)visit(e,depth+1);return;}if(typeof v==='object'){if(v instanceof Date){inspected++;return;}for(const [key,e] of Object.entries(v)){visit(key,depth+1);visit(e,depth+1);}return;}inspected++;
 };visit(value,0);return inspected;
}
type Column={table_name:string;column_name:string;data_type:string};
type Inventory={columns:Column[];rows:Map<string,Record<string,unknown>[]>;values:number};
/** Closed per-table field inventory transcribed from F05 migrations 1–29 and
 * the inherited G0 0001_core_records storage-confirmation contract.
 * The five encrypted fields below hold closed AES envelopes. Every other named
 * field is retained, visible metadata: opaque scoped IDs/key identifiers,
 * fingerprints/cipher digests, lineage/audience UUID sets, status/profile/region,
 * finite times/counts, closed policy/query booleans or content-free restore
 * eligibility/result IDs. These traffic/control metadata are explicit privacy
 * exclusions, never skipped by the canary scanner. An extra field fails. */
const retainedColumns:Readonly<Record<string,string>>=Object.freeze({
 storage_confirmations:'tenant_id space_id confirmation_id upload_id bytes_digest manifest_digest bytes_receipt manifest_receipt confirmed_at storage_qualification_id',
 storage_service_resources:'tenant_id space_id resource_id owner_id generation purpose origin_run_id actor_id payer_id department_id allowance_id cost_center',
 storage_resource_identities:'tenant_id space_id resource_id kind',
 storage_rooms:'tenant_id space_id kind',
 storage_policy:'tenant_id space_id revision periods operations',
 storage_entities:'tenant_id space_id class id revision source_task_id',
 storage_current_heads:'tenant_id space_id class id revision witness key_id generation epoch accepted_at expires_at',
 storage_tombstones:'tenant_id space_id class id revision epoch command_key at',
 storage_restrictions:'tenant_id space_id class source_id source_revision epoch kind at',
 storage_commands:'tenant_id space_id actor_id command_key binding_digest receipt_id epoch at',
 storage_outbox:'tenant_id space_id job_id actor_id command_key class target_id target_revision epoch at',
 storage_authority_epoch:'tenant_id space_id epoch anchor_id policy_revision control_digest at',
 storage_shares:'tenant_id destination_space_id relation_id revision source_space_id class source_id source_revision source_task_id status source_epoch destination_epoch',
 storage_epoch_publications:'tenant_id space_id actor_id command_key binding_digest session_id previous_epoch epoch anchor_id expires_at at',
 storage_policy_changes:'tenant_id space_id actor_id command_key previous_policy_revision policy_revision',
 storage_source_revocations:'tenant_id space_id actor_id command_key class source_id source_revision witness kind at',
 storage_tombstone_publications:'tenant_id space_id actor_id command_key class id revision witness at',
 storage_forget_work:'tenant_id space_id actor_id command_key binding_digest receipt_id job_id class id revision epoch at',
 storage_head_publications:'tenant_id space_id actor_id command_key material_id class id revision source_task_id witness key_id generation epoch accepted_at expires_at expected_revision expected_witness',
 storage_share_publications:'tenant_id space_id actor_id command_key material_id relation_id revision source_space_id source_id source_revision source_task_id witness class status source_epoch destination_epoch',
 storage_staging_reservations:'tenant_id space_id actor_id command_key material_id upload_id root_id class id revision generation key_id session_id source_task_id expires_at lease_until at',
 storage_staging_confirmations:'tenant_id space_id upload_id object_digest manifest_digest object_size manifest_size at',
 storage_staging_abandonments:'tenant_id space_id actor_id command_key upload_id at',
 storage_sources:'tenant_id space_id class source_id revision source_task_id witness key_id generation epoch accepted_at expires_at actor_id command_key cipher_text',
 storage_knowledge_revisions:'tenant_id space_id class id revision source_task_id witness key_id generation epoch accepted_at expires_at actor_id command_key status source_id source_revision source_witness subject_fingerprint cipher_text',
 storage_save_events:'tenant_id space_id event_id actor_id command_key mutation_id job_id target_id revision epoch at kind',
 storage_save_receipts:'tenant_id space_id actor_id command_key binding_digest receipt_id job_id event_id id revision epoch at status class',
 storage_source_checks:'tenant_id space_id check_id checker definition_digest source_id source_revision source_task_id source_witness source_digest claim_digest checked_at expires_at',
 storage_knowledge_admissions:'tenant_id space_id id revision status check_id claim_digest source_digest valid_from valid_until previous_revision source_id source_revision source_witness',
 storage_knowledge_corrections:'tenant_id space_id id revision previous_revision previous_witness previous_actor previous_key actor_id command_key',
 storage_artifact_versions:'tenant_id space_id class id revision source_task_id witness key_id generation epoch accepted_at expires_at actor_id command_key root_id upload_id object_id manifest_object_id object_digest manifest_digest object_size manifest_size source_id source_revision source_witness',
 storage_artifact_events:'tenant_id space_id event_id actor_id command_key mutation_id job_id target_id revision epoch at kind',
 storage_artifact_receipts:'tenant_id space_id actor_id command_key binding_digest receipt_id job_id event_id id revision epoch at status class',
 storage_volume_versions:'tenant_id space_id kind id revision artifact_id actor_id command_key session_id task_id run_id worker_generation base_revision checkpoint_file_count index_witness epoch confirmed_at expires_at',
 storage_checkpoint_files:'tenant_id space_id checkpoint_id checkpoint_revision kind live_id live_revision artifact_id witness live_kind',
 storage_volume_promotions:'tenant_id space_id id revision kind artifact_id actor_id command_key base_revision draft_id draft_revision draft_kind draft_artifact_id validation_id',
 storage_query_controls:'tenant_id space_id actor_id session_id task_id run_id revision command_key expected_revision command_expires_at controls accepted_at',
 storage_ask_receipts:'tenant_id space_id actor_id command_key id session_id task_id run_id native_revision controls_revision key_id generation epoch resource_receipt_id binding_fingerprint query_fingerprint envelope accepted_at expires_at',
 storage_native_ask_refs:'tenant_id space_id actor_id session_id task_id run_id command_key id native_revision',
 storage_ask_dependencies:'tenant_id space_id ask_id ordinal knowledge_id knowledge_revision knowledge_witness source_id source_revision',
 storage_ask_disclosure_admissions:'tenant_id space_id ask_id envelope_digest audiences',
 storage_retention_events:'tenant_id space_id actor_id command_key binding_digest receipt_id job_id class id revision epoch at reason accepted_at expires_at',
 storage_graph_nodes:'tenant_id space_id class id revision witness source_task_id key_id generation expires_at backing_class backing_id backing_revision backing_witness ask_id dependency_count dependency_digest',
 storage_graph_edges:'tenant_id space_id child_class child_id child_revision child_witness parent_class parent_id parent_revision parent_witness',
 storage_graph_payloads:'tenant_id space_id class id revision witness envelope',
 storage_graph_ask_extras:'tenant_id space_id ask_id parent_class parent_id parent_revision parent_witness',
 storage_graph_events:'tenant_id space_id actor_id command_key reason class id revision',
 storage_graph_jobs:'tenant_id space_id actor_id command_key job_id status class id revision witness',
 storage_maintenance_admissions:'tenant_id space_id actor_id command_key material_id builder profile region policy_digest plan_digest receipt_id session_id run_id native_revision',
 storage_maintenance_receipts:'tenant_id space_id actor_id command_key class id revision witness',
 storage_propagation_leases:'tenant_id space_id job_id lease_id actor_id worker_id session_id attempt leased_at expires_at',
 storage_graph_invalidations:'tenant_id space_id class id revision witness job_id lease_id actor_id command_key at',
 storage_propagation_results:'tenant_id space_id job_id lease_id outcome at invalidated_class invalidated_id invalidated_revision invalidated_witness',
 storage_backup_confirmations:'tenant_id space_id actor_id command_key class id revision source_task_id witness key_id generation epoch at expires_at captured_epoch captured_at root_id archive_bytes decoded_bytes item_count last_checkpoint binding_digest receipt_id job_id event_id',
 storage_backup_events:'tenant_id space_id actor_id command_key id revision epoch at event_id kind',
 storage_restore_activations:'tenant_id space_id actor_id original_key operation_id backup_id generation key_id root_id command_fingerprint stage_digest restriction_epoch eligible metadata result activated_at',
 storage_restore_rollbacks:'tenant_id space_id actor_id original_key operation_id backup_id generation key_id root_id command_fingerprint status rolled_back_at',
});
const encryptedColumns=new Set(['storage_sources.cipher_text','storage_knowledge_revisions.cipher_text','storage_ask_receipts.envelope','storage_graph_payloads.envelope','storage_restore_activations.metadata']);
// The inherited confirmation has scoped IDs, cipher digests, opaque receipt
// references and a timestamp, with no content/key authority. It remains scanned
// even though F05 publishes through its own separate confirmation owner.
const laterControls=['storage_confirmations','storage_volume_promotions','storage_ask_disclosure_admissions','storage_retention_events','storage_maintenance_admissions','storage_maintenance_receipts','storage_propagation_leases','storage_graph_invalidations','storage_propagation_results','storage_backup_confirmations','storage_backup_events'];
async function pgInventory(x:AuthorityRouteFixture,needles:readonly Buffer[]):Promise<Inventory>{
 const columns=(await x.f.admin.query<Column>("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='fabric' AND table_name IN(SELECT tablename FROM pg_tables WHERE schemaname='fabric') ORDER BY table_name,ordinal_position")).rows;
 assert(columns.length>0);const names=[...new Set(columns.map(c=>c.table_name))],rows=new Map<string,Record<string,unknown>[]>();let values=0;
 const declared=new Set([...Object.keys(CONTROL_INVENTORY),...Object.keys(GRAPH_RECORD_INVENTORY.controls),...laterControls,RESTORE_ACTIVATION_RECORD_INVENTORY.activation.store,RESTORE_PROGRESS_RECORD_INVENTORY.rollback.store]);
 for(const name of names){assert.match(name,/^[a-z_][a-z0-9_]*$/);if(name.startsWith('storage_')){assert(declared.has(name),'Missing storage table from declared retained inventory: '+name);assert(retainedColumns[name],'Missing closed retained field inventory: '+name);assert.deepEqual(columns.filter(c=>c.table_name===name).map(c=>c.column_name).sort(),retainedColumns[name]!.split(' ').sort(),'Actual storage fields equal encrypted/metadata inventory: '+name);}
  const data=(await x.f.admin.query('SELECT * FROM fabric.'+name)).rows as Record<string,unknown>[];rows.set(name,data);
  const expected=columns.filter(c=>c.table_name===name).map(c=>c.column_name).sort();for(const row of data){assert.deepEqual(Object.keys(row).sort(),expected,'Every actual retained column is inspected: '+name);for(const column of expected){values+=scanValue(row[column],needles,name+'.'+column);if(encryptedColumns.has(name+'.'+column)){const v=row[column];CipherEnvelopeSchema.parse(typeof v==='string'?JSON.parse(v):v);}}
   if(name.startsWith('storage_'))for(const forbidden of ['title','uri','narrative','subject','value','question','answer','filename','logical_path','data_key','digest_key'])assert(!Object.hasOwn(row,forbidden),'Descriptive field outside declared envelope: '+name+'.'+forbidden);
  }
 }
 assert(values>0);return {columns,rows,values};
}
type ArchiveKeys={tenantId:string;spaceId:string;generation:string;dataKey:Buffer;digestKey:Buffer};
async function fileInventory(x:AuthorityRouteFixture,needles:readonly Buffer[],keys:ReadonlyMap<string,ArchiveKeys>){
 // Scanning retained archives outlives the repository client that made them.
 // Independently held synthetic capabilities are selected by exact key/AAD; an
 // unknown archive capability fails rather than being skipped or substituted.
 const archiveCipher=new CryptoStore({resolve:async binding=>{const k=keys.get(binding.keyId);demand(k&&binding.class==='backup'&&binding.tenantId===k.tenantId&&binding.spaceId===k.spaceId&&binding.generation===k.generation,'CONTENT_UNAVAILABLE');return {dataKey:k.dataKey,digestKey:k.digestKey};}});
 let files=0,values=0,archiveItems=0;const kinds=new Set<string>();
 const walk=async(path:string,kind:string)=>{for(const name of await readdir(path)){const p=resolve(path,name),st=await lstat(p);assert(!st.isSymbolicLink(),'Inventory must not silently follow an unowned symlink');scanValue(name,needles,'opaque filename');if(st.isDirectory())await walk(p,kind);else{assert(st.isFile()&&st.nlink===1);const b=await readFile(p);try{values+=scanValue(b,needles,kind+' file');let value:unknown;try{value=JSON.parse(b.toString());}catch{assert.fail('Unexpected non-JSON owned retained file');}values+=scanValue(value,needles,kind+' JSON file');files++;kinds.add(kind);
    if(name==='archive'){const e=CipherEnvelopeSchema.parse(value),plain=await archiveCipher.open(BindingSchema.parse({schemaVersion:e.schemaVersion,tenantId:e.tenantId,spaceId:e.spaceId,class:e.class,id:e.id,revision:e.revision,generation:e.generation,keyId:e.keyId}),e);try{const archive=JSON.parse(plain.toString()) as {items:unknown[]};values+=scanValue(archive,needles,'archive encrypted item inventory');assert(Array.isArray(archive.items)&&archive.items.length>0);archiveItems+=archive.items.length;}finally{plain.fill(0);}}
   }finally{b.fill(0);}}
 }};for(const [kind,root] of Object.entries(x.roots))await walk(root.path,kind);assert(files>0&&values>0);return {files,values,archiveItems,kinds};
}
function ownedLogs(x:AuthorityRouteFixture){
 const name='agent-fabric-storage-'+x.f.instance,inspect=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000,maxBuffer:2_000_000});assert.equal(inspect.status,0,'Owned PG log inventory requires actual container');
 const info=JSON.parse(inspect.stdout)[0] as {Id:string;Name:string;Config:{Labels:Record<string,string>}};
 assert.equal(info.Name,'/'+name);assert.equal(info.Config.Labels['agent-fabric.storage-fixture-owner'],x.f.owner);assert.equal(info.Config.Labels['agent-fabric.storage-fixture-instance'],x.f.instance);
 const logs=spawnSync('docker',['logs',info.Id],{encoding:'utf8',timeout:5000,maxBuffer:8_000_000});assert.equal(logs.status,0);assert(logs.stdout.length+logs.stderr.length>0,'Actual PostgreSQL log streams are mandatory');return {stdout:logs.stdout,stderr:logs.stderr};
}
async function sample(x:AuthorityRouteFixture,s:VerifiedScope,subject:string,value:string,narrative:string){
 const source={...await x.base(s),action:'source' as const,title:'title-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};assert.equal((await x.canonical().source(s,source)).status,'source-accepted');x.count.save++;x.count.write++;
 const save:SaveCommand={...await x.base(s),action:'save',assertion:{subject,value,sourceId:source.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(source.retentionExpiresAt)-100).toISOString(),classification:s.spaceId===x.f.spaces.personal?'personal':'group',intent:'assert',checkId:null}};assert.equal((await x.canonical().save(s,save)).status,'saved-here');x.count.save++;x.count.write++;
 const ref={...await x.ref(s,'knowledge',save.targetId),class:'knowledge' as const};return {s,source,save,ref};
}

/** Both callers execute the same nine frozen assertions. No case selection or
 * replacement behavior: repositories own every effect and authority decision. */
export async function registerVerifyRetainedCopiesTests(register:ComponentTest=test,observe:typeof emitObservations=emitObservations,suite:'verify-retained-copies'|'owned-encryption'='verify-retained-copies'){
 const positives={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0},violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 const archiveKeys=new Map<string,ArchiveKeys>(),retainedCanaries:Buffer[]=[];
 const retain=(values:readonly Buffer[])=>{retainedCanaries.push(...canaryForms(values));return retainedCanaries;};
 const retainCore=(c:{source:{title:string;narrative:string};save:{assertion:{subject:string;value:string}}})=>{const b=[c.source.title,c.source.narrative,c.save.assertion.subject,c.save.assertion.value].map(v=>Buffer.from(v));try{retain(b);}finally{for(const v of b)v.fill(0);}};
 const family=async(id:string,body:(t:TestContext,x:AuthorityRouteFixture)=>Promise<void>)=>register(id+' / retained content and installed scope boundaries',async t=>{const x=await createAuthorityRouteFixture();try{assert(!archiveKeys.has(x.keyId));const held=x.keyCanaries();archiveKeys.set(x.keyId,{tenantId:x.f.scope.tenantId,spaceId:x.f.scope.spaceId,generation:x.generation,dataKey:held[0]!,digestKey:held[1]!});retain(held);await body(t,x);assert.equal(await installedOwnerSnapshot(x.f.admin),x.ownerBefore);assert.deepEqual(x.ports,{computer:0,shell:0,model:0,enrichment:0,effect:0});for(const k of Object.keys(positives) as (keyof typeof positives)[])positives[k]+=x.count[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=x.violations[k];}finally{await x.close();}});
 try{
 await family('E03',async(t,x)=>{
  await migrateStorageRestoreActivation(x.f.admin,{ownedSyntheticDatabase:true,owner:x.f.owner,instance:x.f.instance,root:x.f.root});
  const core=await x.core(x.f.scope),corrected=await x.core(x.f.scope),deleted=await x.core(x.f.scope),files=await x.files(core),derived=[await x.derived(core,'summary-v1'),await x.derived(core,'keywords-v1'),await x.derived(core,'cache-v1')],ask=await x.ask(core),archive=await x.backupOf(core);
  const nextValue='corrected-private-'+randomUUID(),correction={...corrected.save,key:randomUUID(),action:'correct',expectedRevision:1,expiresAt:new Date(Date.now()+25_000).toISOString(),assertion:{...corrected.save.assertion,value:nextValue}};
  assert.equal((await x.canonical().correct(x.f.scope,{command:correction,prior:corrected.knowledgeRef})).status,'saved-here');x.count.save++;x.count.write++;
  assert.equal((await x.forget().forget(x.f.scope,{key:randomUUID(),sessionId:(await x.task(x.f.scope)).binding.sessionId,expiresAt:new Date(Date.now()+25_000).toISOString(),entity:deleted.knowledgeRef})).status,'committed');x.count.forget++;x.count.write++;
  const command={...await x.base(x.f.scope),action:'restore' as const,backupId:archive.c.backupId},stage=await x.importer().import(x.f.scope,command);assert.equal(stage.serving,false);const activation=new RestoreActivationRepository(x.importer(),new KnowledgeStatusAdmission(x.cipher()));assert.equal((await activation.activate(x.f.scope,command)).serving,true);x.count.restore++;x.count.write+=2;
  const restored=await activation.read(x.f.scope,{schemaVersion:1,operationId:command.targetId,ref:core.knowledgeRef});try{assert(restored.includes(Buffer.from(core.save.assertion.value)));x.count.read++;}finally{restored.fill(0);}
  const keys=x.keyCanaries(),privateBytes=[...keys,files.bytes,...[core,corrected,deleted].flatMap(c=>[c.source.title,c.source.narrative,c.save.assertion.subject,c.save.assertion.value].map(v=>Buffer.from(v))),Buffer.from(nextValue)],needles=retain(privateBytes);
  try{
   let inventory:Inventory|undefined;
   await t.test('E03/pg-all-retained',async()=>{inventory=await pgInventory(x,needles);for(const name of ['storage_sources','storage_knowledge_revisions','storage_ask_receipts','storage_graph_payloads','storage_restore_activations','storage_save_events','storage_outbox','storage_backup_events'])assert((inventory.rows.get(name)?.length??0)>0,'Required retained store populated: '+name);assert.equal(inventory.columns.length,[...inventory.rows.keys()].reduce((n,name)=>n+inventory!.columns.filter(c=>c.table_name===name).length,0));x.count.read++;});
   await t.test('E03/files-archives',async()=>{const i=await fileInventory(x,needles,archiveKeys);assert(i.archiveItems>0);assert.deepEqual([...i.kinds].sort(),['authority','backup','content','restore']);for(const r of files.reads){await r.read();x.count.read++;}for(const d of derived){const bytes=await d.read();try{assert(bytes.length>0);x.count.read++;}finally{bytes.fill(0);}}});
   await t.test('E03/logs-streams',async()=>{
    const unknown='resolver-private-'+randomUUID(),badCipher=new CryptoStore({resolve:async()=>{throw new Error(unknown);}}),repo=new KnowledgeSaveRepository(x.f.uow,x.journal,x.f.native,badCipher,{resolve:async()=>({keyId:x.keyId,generation:x.generation})},new KnowledgeStatusAdmission(badCipher)),fail=await repo.save(x.f.scope,{...core.save,key:randomUUID(),targetId:randomUUID(),expiresAt:new Date(Date.now()+25_000).toISOString()});assert.equal(fail.status,'not-saved');x.count.deny++;
    const logs=ownedLogs(x),diagnostic={database:logs,idpReady:x.f.idp.ready,idpMessages:x.f.idp.messages,idpStderr:x.f.idp.stderr(),failure:fail,redacted:safeFailure(new Error(unknown)),operator:await x.backup().lookup(x.f.scope,archive.command)};
    const secret=Buffer.from(unknown),all=retain([secret]);secret.fill(0);assert(scanValue(diagnostic,all,'actual log and raw diagnostic streams')>0);assert(!JSON.stringify(diagnostic).includes(unknown));x.count.read++;
    const denied=await ask.post({...ask.command,key:randomUUID()},x.f.tokens.get(x.f.foreignActor));assert.equal(denied.status,403);assert(scanValue(denied.body,needles,'denied shared HTTP diagnostics')>0);assert(typeof denied.body==='object'&&denied.body!==null);assert.deepEqual(Object.keys(denied.body).sort(),['error','nextAction','replayAllowed','schemaVersion','status']);x.count.deny++;
   });
   await t.test('E03/native-model-task',async()=>{const i=await pgInventory(x,needles);for(const pattern of [/^tasks$/, /^runs$/, /^model_native_/, /^model_/, /resource/, /audit/, /event/, /outbox/]){const matches=[...i.rows].filter(([n])=>pattern.test(n));assert(matches.length>0,'Installed owner category missing: '+pattern);assert(matches.some(([,r])=>r.length>0),'Required installed category is empty: '+pattern);}assert((i.rows.get('storage_native_ask_refs')?.length??0)>0);assert.equal((await x.f.admin.query('SELECT count(*)::int AS n FROM fabric.model_computer_assignments')).rows[0].n,0);x.count.read++;});
   await t.test('E03/every-inventoried-field',async()=>{const i=await pgInventory(x,needles);assert(inventory);assert.deepEqual(i.columns,inventory.columns);assert.equal(Object.keys(RECORD_INVENTORY).sort().join(','),'artifact,ask,backup,cache,checkpoint,draft,index,knowledge,live-file,source,summary');assert.deepEqual([...encryptedColumns].sort(),['storage_ask_receipts.envelope','storage_graph_payloads.envelope','storage_knowledge_revisions.cipher_text','storage_restore_activations.metadata','storage_sources.cipher_text']);for(const path of encryptedColumns){const [table,column]=path.split('.');assert(i.columns.some(c=>c.table_name===table&&c.column_name===column),'Declared encrypted field must actually exist');assert((i.rows.get(table!)?.length??0)>0);}assert(i.values>i.columns.length);x.count.read++;});
  }finally{for(const b of privateBytes)b.fill(0);files.bytes.fill(0);for(const d of derived)d.expected.fill(0);}
 });
 await family('E04',async(t,x)=>{
  const f=x.f,s=f.scope,secondary=await f.scopeFor(f.actors[0],f.spaces.secondary),foreign=await f.scopeFor(f.foreignActor,f.spaces.foreign),subject='equal-subject-'+randomUUID(),value='equal-private-'+randomUUID(),narrative='equal-source-'+randomUUID(),samples=[] as Awaited<ReturnType<typeof sample>>[];
  const refusal=async(work:()=>Promise<unknown>,codes:readonly string[])=>{const before=x.opens(),state=await x.snapshot();await assert.rejects(work,e=>{const raw=(e as {code?:unknown}).code,code=typeof raw==='string'&&/^[A-Z_0-9]+$/.test(raw)?raw:'untyped';assert(codes.includes(code),'Exact current scope denial; actual redacted code: '+code);return true;});assert.equal(x.opens(),before,'Foreign existence probe must not open payload');assert.deepEqual(await x.snapshot(),state,'Refused equality/existence probe preserves durable and economic state');x.count.deny++;};
  await t.test('E04/same-value-different-scopes',async()=>{for(const scope of [s,s,secondary,foreign])samples.push(await sample(x,scope,subject,value,narrative));for(const p of samples)retainCore(p);assert.equal(new Set(samples.map(p=>p.save.targetId)).size,4);assert.equal(new Set(samples.map(p=>p.source.targetId)).size,4);for(const p of samples){assert.equal((await x.canonical().recall(p.s,p.ref)).value,value);x.count.read++;const receipt=await x.canonical().append(p.s,p.save),retry=await x.canonical().append(p.s,p.save);assert.equal(receipt.status,'saved-here');assert.deepEqual(retry,receipt);x.count.read+=2;}assert.equal((await f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_knowledge_revisions WHERE id=ANY($1::uuid[])',[samples.map(p=>p.save.targetId)])).rows[0].n,4);await refusal(()=>x.canonical().recall(s,samples[2]!.ref),['STALE_REVISION']);await refusal(()=>x.canonical().recall(s,samples[3]!.ref),['STALE_REVISION']);for(const p of samples){const claims=await x.canonical().claims(p.s,{sourceId:p.source.targetId,sourceRevision:1,subject});assert.equal(claims.claims.length,1);assert.equal(claims.claims[0]!.id,p.save.targetId);assert.equal(claims.groups.length,1);assert.equal(claims.conflict,false);x.count.read++;}// Source selection deliberately checks the scoped source row before head lookup, so both foreign and absent sources have the same redacted CONTENT_UNAVAILABLE boundary.
for(const sourceId of [samples[2]!.source.targetId,randomUUID()])await refusal(()=>x.canonical().claims(s,{sourceId,sourceRevision:1,subject}),['CONTENT_UNAVAILABLE']);});
  await t.test('E04/scope-keyed-fingerprint',async()=>{const bytes=Buffer.from(subject),b=BindingSchema.parse({schemaVersion:1,tenantId:s.tenantId,spaceId:s.spaceId,class:'knowledge',id:randomUUID(),revision:1,generation:x.generation,keyId:x.keyId});try{const own=await x.cipher().fingerprint(b,'subject',bytes);assert.equal(await x.cipher().fingerprint({...b,id:randomUUID(),revision:2,generation:randomUUID()},'subject',bytes),own);for(const other of [{...b,spaceId:secondary.spaceId},{...b,tenantId:foreign.tenantId,spaceId:foreign.spaceId},{...b,keyId:randomUUID()},{...b,class:'source' as const}])assert.notEqual(await x.cipher().fingerprint(other,'subject',bytes),own);const rows=(await f.admin.query('SELECT id,subject_fingerprint FROM fabric.storage_knowledge_revisions WHERE id=ANY($1::uuid[])',[samples.map(p=>p.save.targetId)])).rows;assert.equal(new Set(rows.map(r=>r.subject_fingerprint)).size,3);assert(rows.every(r=>r.subject_fingerprint!==sourceNarrativeDigest(subject)));for(const p of samples.slice(2))assert.equal((await f.uow.withScope(s,tx=>tx.query('SELECT id FROM fabric.storage_knowledge_revisions WHERE subject_fingerprint=$1',[rows.find(r=>r.id===p.save.targetId)!.subject_fingerprint]))).rows.length,0);x.count.read++;}finally{bytes.fill(0);}});
  await t.test('E04/wrong-scope-key',async()=>{const scopedCore=await x.core(secondary);retainCore(scopedCore);const scopedFiles=await x.files(scopedCore);retain([scopedFiles.bytes]);try{for(const read of scopedFiles.reads){await read.read();x.count.read++;}for(const id of [scopedFiles.artifactRef.id,randomUUID()])await refusal(()=>x.artifact().read(s,{...scopedFiles.artifactRef,id}),['STALE_REVISION']);for(const id of [scopedFiles.live.targetId,randomUUID()])await refusal(()=>x.volume().current(s,id),['CONTENT_UNAVAILABLE']);}finally{scopedFiles.bytes.fill(0);}const p=samples[0]!,row=(await f.admin.query('SELECT cipher_text FROM fabric.storage_knowledge_revisions WHERE id=$1',[p.save.targetId])).rows[0],e=CipherEnvelopeSchema.parse(JSON.parse(row.cipher_text)),b=BindingSchema.parse({schemaVersion:e.schemaVersion,tenantId:e.tenantId,spaceId:e.spaceId,class:e.class,id:e.id,revision:e.revision,generation:e.generation,keyId:e.keyId}),held=x.keyCanaries(),scoped=()=>new CryptoStore({resolve:async binding=>{demand(binding.tenantId===s.tenantId&&binding.spaceId===s.spaceId&&binding.keyId===x.keyId,'CONTENT_UNAVAILABLE');return {dataKey:held[0]!,digestKey:held[1]!};}});try{const exact=await scoped().open(b,e);try{assert(exact.includes(Buffer.from(value)));x.count.read++;}finally{exact.fill(0);}for(const other of [{...b,spaceId:secondary.spaceId},{...b,tenantId:foreign.tenantId,spaceId:foreign.spaceId},{...b,keyId:randomUUID()}]){await assert.rejects(()=>scoped().open(other,{...e,tenantId:other.tenantId,spaceId:other.spaceId,keyId:other.keyId}),{code:'CONTENT_UNAVAILABLE'});await assert.rejects(()=>scoped().fingerprint(other,'subject',Buffer.from(subject)),{code:'CONTENT_UNAVAILABLE'});x.count.deny+=2;}await refusal(()=>x.canonical().recall(s,{...p.ref,witness:sourceNarrativeDigest(value)}),['STALE_REVISION']);}finally{for(const k of held)k.fill(0);}});
  await t.test('E04/key-export-denied',async()=>{const p=samples[0]!,keys=x.keyCanaries(),needles=retain(keys);let http:Awaited<ReturnType<typeof startKnowledgeCommandHttp>>|undefined;try{const backupCore=await x.core(s);retainCore(backupCore);const backup=await x.backupOf(backupCore),read=await backup.read();assert(read.confirmed&&read.serving===false);assert(scanValue(read.inventory,needles,'authorized backup export')>0);assert(!Object.hasOwn(x.cipher(),'resolver'));assert.equal(JSON.stringify(x.cipher()),'{}');for(const field of ['dataKey','digestKey','key','keys','root','path','keyId','generation']){assert.throws(()=>BackupCommandSchema.parse({...backup.command,[field]:keys[0]!.toString('base64')}),StorageError);assert.throws(()=>RestoreCommandSchema.parse({...awaitableRestore(backup.command,backup.c.backupId),[field]:keys[0]!.toString('base64')}),StorageError);x.count.deny+=2;}http=await startKnowledgeCommandHttp(f.verifier,x.canonical());const before=await x.snapshot();for(const field of ['keyMaterial','keys','root','path','keyId','generation']){const response=await fetch(http.url+`/v1/tenants/${s.tenantId}/spaces/${s.spaceId}/knowledge/save`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+f.tokens.get(s.actorId)},body:JSON.stringify({...p.save,[field]:keys[0]!.toString('base64')})});assert.equal(response.status,400);const body=await response.json();assert(scanValue(body,needles,'HTTP caller key/root refusal')>0);assert.equal((body as {error:string}).error,'INVALID_SCHEMA');x.count.deny++;}assert.deepEqual(await x.snapshot(),before);const own=await pgInventory(x,needles);assert(own.values>0);await assert.rejects(()=>fileInventory(x,needles,new Map()),{code:'CONTENT_UNAVAILABLE'});x.count.deny++;const allFiles=await fileInventory(x,needles,archiveKeys);assert(archiveKeys.size===2&&allFiles.archiveItems>0,'Both retained fixture archive capabilities remain installed through the final scan');assert((await backup.read()).confirmed,'Good current archive remains useful after all-copy/missing-key scans');scanValue(ownedLogs(x),needles,'key exclusion logs');x.count.read++;}finally{if(http)await http.close();for(const k of keys)k.fill(0);}});
 });
 observe({schemaVersion:1,measurement:'storage-observations',suite,positives,violations});
 }finally{for(const k of archiveKeys.values()){k.dataKey.fill(0);k.digestKey.fill(0);}archiveKeys.clear();for(const b of retainedCanaries)b.fill(0);retainedCanaries.length=0;}
}
function awaitableRestore(c:{schemaVersion:1;sessionId:string;targetId:string;key:string;expectedRevision:number;expiresAt:string},backupId:string){return {...c,action:'restore',backupId};}
