/** Test-only SQLite transaction and plain-byte owner; never F05 qualification. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {PlanPersistenceRepository,requirePlanArtifactPermit,planNamespace,type PlanParent,type PlanIntent,type PlanVersion,type PlanTransaction,type PlanUnitOfWork,type PlanPersistencePorts,type RoutineRecord} from '../../src/plan-persistence.js';
import {bindingDigest,createScopeVerifier,parseTaskEnvelope,TaskCallBindingSchema,revalidateScope,type VerifiedScope} from '../../src/owners.js';
import type {CurrentAuthority} from '../../../g1-foundations/src/contracts.js';
import {demand,immutable} from '../../src/intent.js';
export const pid=(n:number)=>'40000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
export const planEpoch=Date.parse('2026-10-16T00:00:00.000Z');
export const planGrants=['task:read','task:write','source:read','storage:maintenance','storage:read','storage:write','persistence:write','memory:write'];
export interface PlanFixtureState {
 parents:Record<string,PlanParent>;intents:Record<string,PlanIntent>;versions:Record<string,PlanVersion[]>;
 staged:Record<string,string>;artifacts:Record<string,string>;settlements:Record<string,{parentRunId:string;units:number}>;
 routines:Record<string,RoutineRecord>;audits:RoutineRecord[];
}
export interface PlanFixtureConfig {authority:{-readonly [K in keyof CurrentAuthority]:CurrentAuthority[K]};sourceAvailable:boolean;remaining:number;auditAvailable:boolean;now:number}
export type PlanFault='after-admission'|'after-prepare'|'after-write'|'before-commit'|'lost-ack';
export interface PlanFixtureHooks {fault?:PlanFault;wait?:'prepare'|'write'|'read'|'source'|'audit';pause?:(phase:string)=>Promise<void>}
export function initialPlan():PlanParent {
 const hash=bindingDigest,binding=TaskCallBindingSchema.parse({schemaVersion:1,tenantId:pid(1),spaceId:pid(2),actorId:pid(3),payerId:pid(4),costCenter:'fixture-plan',taskId:pid(10),runId:pid(11),parentTaskId:null,sessionId:pid(12),purpose:'planning',category:'service',requirementsRevision:1,versions:{schemaVersion:1,engineDigest:hash('engine'),behaviorDigest:hash('behavior'),schemaDigest:hash('schema'),environmentDigest:hash('environment'),dependencyLockDigest:hash('lock'),checkDefinitionDigest:hash('checks')},policyRevision:1,membershipRevision:1,sourceRevisionDigest:hash('source'),cancellationGeneration:0,workerGeneration:1,resourceGeneration:0,intent:'Plan'});
 const envelope=parseTaskEnvelope({schemaVersion:1,scope:{tenantId:pid(1),spaceId:pid(2)},taskId:pid(10),requirementsRevision:1,intent:'plan',executionClass:'conversation',effectCeiling:['read','model'],sources:[{sourceId:pid(20),scope:{tenantId:pid(1),spaceId:pid(2)},audience:[pid(3)],trust:'trusted',observedAt:planEpoch}],targets:[],payerId:pid(4),allowanceId:pid(22),ceilingUnits:10,continuation:'never',requiredChecks:['fixture-plan-save'],versions:{engine:'native-session-loop-v1',schema:'1',behavior:'fixture-plan',environment:'owned-local-fixture'},groupTrigger:false});
 return immutable({binding,envelope,executionClass:'service',controlRevision:1,departmentId:pid(21),allowances:[pid(22),pid(23)],audience:[pid(3)],sourceIds:[pid(20)],expiresAt:new Date(planEpoch+600_000).toISOString(),active:true,budgetRemaining:10});
}
export function initializePlanFixture(root:string):void {
 mkdirSync(root,{recursive:true});const db=new DatabaseSync(join(root,'plan.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE fixture_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
 const state:PlanFixtureState={parents:{[pid(12)]:initialPlan()},intents:{},versions:{},staged:{},artifacts:{},settlements:{},routines:{},audits:[]};
 // The fixture admits a parent only. Maintenance children are derived solely by
 // PlanMaintenanceAdmission during save, and persist in immutable intents.
 const ask=structuredClone(initialPlan());state.parents[pid(15)]={...ask,binding:{...ask.binding,sessionId:pid(15),taskId:pid(13),runId:pid(14),intent:'Ask',purpose:'answer'},envelope:{...ask.envelope,taskId:pid(13),intent:'ask'}};
 db.prepare('INSERT INTO fixture_state VALUES(1,?)').run(JSON.stringify(state));db.close();
 writeFileSync(join(root,'authority.json'),JSON.stringify({authority:{tenantId:pid(1),spaceId:pid(2),actorId:pid(3),payerId:pid(4),authorityRevision:1,membershipRevision:1,grants:planGrants,actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active'},sourceAvailable:true,remaining:10,auditAvailable:true,now:planEpoch} satisfies PlanFixtureConfig));
 for(const name of ['canonical.txt','server.txt','allocator.json'])writeFileSync(join(root,name),name==='allocator.json'?'[]':'unchanged '+name);
}
export function fixtureConfig(root:string):PlanFixtureConfig{return JSON.parse(readFileSync(join(root,'authority.json'),'utf8')) as PlanFixtureConfig;}
export function setFixtureConfig(root:string,change:(config:PlanFixtureConfig)=>void):void {const c=fixtureConfig(root);change(c);writeFileSync(join(root,'authority.json'),JSON.stringify(c));}
export async function planScope(root:string,overrides:Partial<CurrentAuthority>={}):Promise<VerifiedScope>{
 const verifier=createScopeVerifier(async()=>({...fixtureConfig(root).authority,...overrides}));
 const c={...fixtureConfig(root).authority,...overrides};return verifier.verify({tenantId:c.tenantId,spaceId:c.spaceId,sessionCredential:'synthetic-plan-local-fixture'});
}
export class SQLitePlanFixture {
 private readonly db:DatabaseSync;private readonly states=new WeakMap<PlanTransaction,PlanFixtureState>();
 readonly ports:PlanPersistencePorts;readonly repository:PlanPersistenceRepository;
 constructor(readonly root:string,private readonly hooks:PlanFixtureHooks={}){
  this.db=new DatabaseSync(join(root,'plan.sqlite'));this.db.exec('PRAGMA busy_timeout=2000');
  const uow:PlanUnitOfWork={transaction:async<T>(scope:VerifiedScope,body:(tx:PlanTransaction)=>Promise<T>):Promise<T>=>{
   this.db.exec('BEGIN IMMEDIATE');let committed=false;
   try{
    await revalidateScope(scope);const state=this.observe(),tx:PlanTransaction={
     parent:id=>state.parents[id]??null,intent:(ns,key)=>state.intents[ns+'/'+key]??null,
     insertIntent:intent=>{const key=intent.namespace+'/'+intent.request.key;demand(!state.intents[key],'IDEMPOTENCY_CONFLICT');state.intents[key]=immutable(intent);},
     maintenanceChild:(ns,sessionId)=>Object.values(state.intents).find(i=>i.namespace===ns&&i.binding.child.sessionId===sessionId)??null,
     version:(ns,id,v)=>{const versions=state.versions[ns+'/'+id]??[];return (v===undefined?versions.at(-1):versions.find(x=>x.logicalVersion===v))??null;},
     publish:(ns,v)=>{const key=ns+'/'+v.documentId,list=state.versions[key]??[];demand(list.length===v.logicalVersion-1,'IDEMPOTENCY_CONFLICT');list.push(immutable(v));state.versions[key]=list;demand(!state.settlements[ns+'/'+v.saveKey],'IDEMPOTENCY_CONFLICT');state.settlements[ns+'/'+v.saveKey]={parentRunId:v.binding.parentBudgetRunId,units:1};},
     routine:(ns,r)=>state.routines[ns+'/'+r.key]??null,appendRoutine:(ns,r)=>{state.routines[ns+'/'+r.key]=immutable(r);}
    };this.states.set(tx,state);const result=await body(tx);await revalidateScope(scope);
    this.db.prepare('UPDATE fixture_state SET payload=? WHERE id=1').run(JSON.stringify(state));this.db.exec('COMMIT');committed=true;this.states.delete(tx);return result;
   }catch(e){if(!committed)this.db.exec('ROLLBACK');throw e;}
  }};
  const pause=async(phase:PlanFixtureHooks['wait'])=>{if(this.hooks.wait===phase)await this.hooks.pause?.(phase!);};
  this.ports={uow,now:()=>fixtureConfig(root).now,
   sourceCurrent:async(scope,parent)=>{await pause('source');const c=fixtureConfig(root);demand(c.sourceAvailable&&scope.grants.includes('source:read')&&parent.sourceIds.every(id=>id===pid(20)),'PERMISSION_DENIED');demand(c.remaining>0,'PERMISSION_DENIED');},
   audit:async(tx,_scope,r)=>{await pause('audit');demand(fixtureConfig(root).auditAvailable,'UNSUPPORTED');this.state(tx).audits.push(immutable(r));},
   artifacts:{
    prepare:async(scope,intent,permit)=>{
     requirePlanArtifactPermit(permit,intent.binding);if(hooks.fault==='after-admission')throw new Error('fixture-after-admission');
     await pause('prepare');await uow.transaction(scope,async tx=>{await this.repository.admission.require(tx,scope,intent,'write');const state=this.state(tx),id=intent.binding.artifact.id;demand(!state.staged[id]||state.staged[id]===intent.bytes,'IDEMPOTENCY_CONFLICT');state.staged[id]=intent.bytes;});
     if(hooks.fault==='after-prepare')throw new Error('fixture-after-prepare');
    },
    commit:async(scope,intent,permit,validate,publish)=>{
     requirePlanArtifactPermit(permit,intent.binding);
     await uow.transaction(scope,async tx=>{const state=this.state(tx),id=intent.binding.artifact.id;
      await this.repository.admission.require(tx,scope,intent,'write');if(state.artifacts[id]){demand(state.artifacts[id]===intent.bytes,'IDEMPOTENCY_CONFLICT');return;}
      await validate(tx);demand(state.staged[id]===intent.bytes,'NOT_FOUND');state.artifacts[id]=intent.bytes;
      await pause('write');if(hooks.fault==='after-write')throw new Error('fixture-after-write');await publish(tx);
      if(hooks.fault==='before-commit')throw new Error('fixture-before-commit');
     });if(hooks.fault==='lost-ack')throw new Error('UNKNOWN_COMMIT original save key only');
    },
    lookup:async(tx,_scope,intent,permit)=>{requirePlanArtifactPermit(permit,intent.binding);return this.state(tx).artifacts[intent.binding.artifact.id]?intent.binding.artifact:null;},
    readWithTransaction:async(tx,_scope,intent,permit)=>{requirePlanArtifactPermit(permit,intent.binding);await pause('read');const bytes=this.state(tx).artifacts[intent.binding.artifact.id];demand(bytes!==undefined,'NOT_FOUND');return bytes;}
   }
  };this.repository=new PlanPersistenceRepository(this.ports);
 }
 private state(tx:PlanTransaction):PlanFixtureState{const state=this.states.get(tx);demand(state,'UNAUTHORIZED');return state;}
 observe():PlanFixtureState{return JSON.parse(String(this.db.prepare('SELECT payload FROM fixture_state WHERE id=1').get()!['payload'])) as PlanFixtureState;}
 close():void{this.db.close();}
 mutate(change:(state:PlanFixtureState)=>void):void{this.db.exec('BEGIN IMMEDIATE');const state=this.observe();change(state);this.db.prepare('UPDATE fixture_state SET payload=? WHERE id=1').run(JSON.stringify(state));this.db.exec('COMMIT');}
}
