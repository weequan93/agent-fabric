import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createModelFixture } from './pg-fixture.js';
import { migrateRecovery } from '../../../g1-recovery/src/migration.js';
import { migrateNativeHistory } from '../../../g1-recovery/src/native-migration.js';
import { migrateEffectHistory } from '../../../g1-recovery/src/effect-migration.js';
import { migrateFences } from '../../../g1-recovery/src/fence-migration.js';
import { migrateModelLedger } from '../../src/ledger-migration.js';
import { PostgresTaskRepository,commandDigest } from '../../../g1-foundations/src/task-repository.js';
import { createRun } from '../../../engine/scheduler/src/run-state.js';
import { SessionLoop } from '../../src/native-imports.js';
import { TaskCallBindingSchema,VersionPinsSchema } from '../../src/schema.js';
import { encodeLocalRequest } from '../../src/test-adapter.js';
import { hash,ModelRepository,type PrepareInput,type RepositoryHooks,type CurrentModelAuthority } from '../../src/model-repository.js';
import { demand } from '../../src/errors.js';
import { reserveEstimate } from '../../src/arithmetic.js';
import { sha } from './contract-fixtures.js';
import type { VerifiedScope,TaskCallBinding,OperatingProfile,VersionPins } from '../../src/contracts.js';

export async function createLedgerFixture(options:{profile?:OperatingProfile;pins?:VersionPins;computerGrant?:boolean}={}){
 const f=await createModelFixture(options.profile,options.computerGrant);const root=f.root;
 try{
 await migrateRecovery(f.admin,{ownedSyntheticDatabase:true,sqlPath:resolve(root,'g1-recovery/migrations/0004_recovery.sql')});
 await migrateNativeHistory(f.admin,resolve(root,'g1-recovery/migrations/0005_native_history.sql'));
 await migrateEffectHistory(f.admin,resolve(root,'g1-recovery/migrations/0006_effect_reconciliation.sql'));
 await migrateFences(f.admin,resolve(root,'g1-recovery/migrations/0007_fences.sql'));
 // Test migration rollback on previous schema before successful forward apply.
 if(!(await f.admin.query('SELECT 1 FROM public.fabric_model_migrations WHERE version=2')).rowCount){
  await migrateModelLedger(f.admin,{ownedSyntheticDatabase:true,root,owner:f.fixtureOwner,injectBeforeCommit:true}).then(()=>{throw new Error('Migration injection failed');},e=>{if(e.message!=='Injected model migration rollback')throw e;});
  demand((await f.admin.query("SELECT to_regclass('fabric.model_operations') AS table")).rows[0].table===null);
 }
 await migrateModelLedger(f.admin,{ownedSyntheticDatabase:true,root,owner:f.fixtureOwner});
 const pins=options.pins??VersionPinsSchema.parse({schemaVersion:1,engineDigest:sha(1),behaviorDigest:sha(2),schemaDigest:sha(3),environmentDigest:sha(4),dependencyLockDigest:sha(5),checkDefinitionDigest:sha(6)});
 const department=randomUUID(),repo=new PostgresTaskRepository(f.uow);
 type Common={ids:string[];leaf:string;scope:VerifiedScope};
 const hierarchies=new Map<string,Common>();
 async function common(space:string=f.space,ceiling=10_000):Promise<Common>{
  const existing=hierarchies.get(space);if(existing)return existing;
  const scope=await f.scopeFor(1,space),ids:string[]=[];let parent:string|null=null;
  for(const [kind,subject]of [['tenant',f.tenant],['department',department],['person',scope.actorId],['space',space]] as const){
   const id=randomUUID();await f.admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,$7,1)',[f.tenant,space,id,parent,f.actors[3],'synthetic-utf8-byte-unit',ceiling]);
   await f.admin.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[f.tenant,space,id,kind,subject]);ids.push(id);parent=id;
  }
  await f.admin.query('INSERT INTO fabric.model_policies VALUES($1,$2,1,true,$3::jsonb)',[f.tenant,space,JSON.stringify([f.profile.profileDigest])]);
  const value={ids,leaf:parent!,scope};hierarchies.set(space,value);return value;
 }
 async function task(options:{space?:string;ceiling?:number;commonCeiling?:number;category?:TaskCallBinding['category'];purpose?:TaskCallBinding['purpose'];accountId?:string;depth?:number;sourceRevisionDigest?:string;parentTaskId?:string;intent?:'Ask'|'Plan'|'Act'}={}){
  const space=options.space??f.space,c=await common(space,options.commonCeiling),scope=c.scope;
  const taskId=randomUUID(),runId=randomUUID(),requirements={intent:options.intent??'Ask'};
  const input={taskId,runId,commandId:randomUUID(),mutationId:randomUUID(),jobId:randomUUID(),eventId:randomUUID(),idempotencyKey:randomUUID(),payloadDigest:'',expectedRevision:0,requirements};
  await repo.create(scope,{...input,payloadDigest:commandDigest(input)});
  const binding=TaskCallBindingSchema.parse({schemaVersion:1,tenantId:f.tenant,spaceId:space,actorId:scope.actorId,payerId:scope.payerId,costCenter:'synthetic-model-fixture',taskId,runId,parentTaskId:options.parentTaskId??null,sessionId:randomUUID(),purpose:options.purpose??'answer',category:options.category??'model',requirementsRevision:1,versions:pins,policyRevision:1,membershipRevision:scope.membershipRevision,sourceRevisionDigest:options.sourceRevisionDigest??sha(7),cancellationGeneration:0,workerGeneration:0,resourceGeneration:0,intent:options.intent??'Ask'});
  // Child-local ceilings are additional limits. Model12 resolves the immutable
  // parent Run and reserves its original Task/Run chain in the same transaction.
  const ids=[...c.ids];let parent=c.leaf;
  for(let i=6;i<(options.depth??6);i++){
   const id=randomUUID();await f.admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,$7,1)',[f.tenant,space,id,parent,scope.payerId,'synthetic-utf8-byte-unit',options.ceiling??10_000]);
   await f.admin.query("INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,'tenant',$4)",[f.tenant,space,id,f.tenant]);ids.push(id);parent=id;
  }
  for(const [kind,subject]of [['task',taskId],['run',runId]]as const){
   const id=randomUUID();await f.admin.query('INSERT INTO fabric.budget_allowances(tenant_id,space_id,allowance_id,parent_allowance_id,payer_actor_id,currency,ceiling,revision) VALUES($1,$2,$3,$4,$5,$6,$7,1)',[f.tenant,space,id,parent,scope.payerId,'synthetic-utf8-byte-unit',options.ceiling??10_000]);
   await f.admin.query('INSERT INTO fabric.model_allowance_metadata VALUES($1,$2,$3,$4,$5)',[f.tenant,space,id,kind,subject]);ids.push(id);parent=id;
  }
  await f.admin.query('INSERT INTO fabric.model_billing_bindings VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::jsonb)',[f.tenant,space,runId,taskId,scope.actorId,scope.payerId,department,binding.costCenter,parent,JSON.stringify(binding)]);
  if(options.accountId)await f.admin.query('INSERT INTO fabric.model_account_bindings VALUES($1,$2,$3,$4)',[f.tenant,space,runId,options.accountId]);
  const origin=createRun({scope:{tenantId:f.tenant,spaceId:space},taskId,runId,attempt:1,requirementsRevision:1,versions:{engine:pins.engineDigest,behavior:pins.behaviorDigest,schema:pins.schemaDigest,environment:pins.environmentDigest}});
  const makeInput=async():Promise<PrepareInput>=>{
   const original={tenantId:f.tenant,spaceId:space,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()};
   const request=encodeLocalRequest({schemaVersion:1,original,profileDigest:f.profile.profileDigest,contextDigest:sha(8),payload:JSON.stringify({schemaVersion:1,modality:'text',dialect:'local-json-v1',text:'atomic local answer',response:'text',toolArguments:null,privateState:null}),outputCap:32,durationCapMs:1000,dispatchEpoch:1});
   const loop=new SessionLoop(origin,{clock:{now:()=>Date.now()},authorize:()=>{},model:async()=>{throw new Error('Native pending prefix only');},execute:async()=>{throw new Error('No effect allowed');},modelOperation:()=>({operationId:original.operationId,reservationId:original.reservationId})});
   loop.transition('preparing',{currentAuthorized:true});loop.transition('running',{currentAuthorized:true});await loop.callModel('atomic local answer').catch(()=>{});
   return {binding,request,origin,nativePrefix:loop.events(),command:{key:randomUUID(),expiresAt:new Date(Date.now()+60_000).toISOString(),retryCeiling:3},categories:{model:reserveEstimate(request.payload,request.outputCap)-2,service:2},route:f.profile.route};
  };
  return {scope,binding,origin,ids,leaf:parent,makeInput};
 }
 const authority:CurrentModelAuthority={async assertCurrent(_tx,scope,b,r){demand(scope.actorId===b.actorId&&scope.payerId===b.payerId&&r.profileDigest===f.profile.profileDigest&&b.sourceRevisionDigest===sha(7)&&hash(b.versions)===hash(pins),'UNAUTHORIZED');}};
 const model=(hooks:RepositoryHooks={})=>new ModelRepository(f.uow,authority,hooks);
 async function account(ceiling:number,kind:'person'|'tenant'|'department'='person',parent:string|null=null){const id=randomUUID();await f.admin.query('INSERT INTO fabric.model_accounts(tenant_id,account_id,parent_id,payer_id,kind,subject_id,ceiling) VALUES($1,$2,$3,$4,$5,$6,$7)',[f.tenant,id,parent,f.actors[3],kind,kind==='person'?f.actors[1]:kind==='tenant'?f.tenant:department,ceiling]);return id;}
 const snapshot=async()=>{
  const tables=['budget_allowances','budget_reservations','usage_settlements','model_accounts','model_allowance_metadata','model_billing_bindings','model_budget_lineage','model_account_bindings','model_policies','model_sessions','model_operations','model_attempts','model_claims','model_reservation_allowances','model_reservation_accounts','model_category_reservations','model_native_events','model_events','model_audit','model_outbox','model_command_receipts'];
  const state:Record<string,unknown>={};
  for(const name of tables)state[name]=(await f.admin.query("SELECT coalesce(jsonb_agg(record ORDER BY record::text),'[]') AS rows FROM (SELECT to_jsonb(a) AS record FROM fabric."+name+" a) s")).rows[0].rows;
  return state;
 };
 return {f,pins,department,common,task,model,authority,account,snapshot,close:f.close};
 }catch(e){await f.close();throw e;}
}
