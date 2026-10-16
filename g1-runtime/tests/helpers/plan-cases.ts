import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planMaintenanceService,PLAN_CONTENT_BYTES,type PlanSave} from '../../src/plan-persistence.js';
import {bindingDigest} from '../../src/owners.js';
import {pid,planEpoch,initializePlanFixture,SQLitePlanFixture,planScope,setFixtureConfig,planGrants,type PlanFixtureConfig} from './plan-fixture.js';
import type {PlanClientCommand} from './plan-client.js';
type Reply={ready?:boolean;paused?:string;ok?:boolean;result?:any;code?:string;message?:string};
const births:number[]=[];
async function spawnClient(){
 const env={...process.env};delete env['NODE_TEST_CONTEXT'];
 const child=fork(fileURLToPath(new URL('./plan-client.js',import.meta.url)),['--plan-client'],{env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});
 births.push(child.pid!);let stderr='';child.stderr!.on('data',b=>{stderr+=String(b);});
 const queued:Reply[]=[],pending:{resolve:(r:Reply)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}[]=[];
 child.on('message',m=>{const p=pending.shift();if(p){clearTimeout(p.timer);p.resolve(m as Reply);}else queued.push(m as Reply);});
 const next=():Promise<Reply>=>queued.length?Promise.resolve(queued.shift()!):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Plan client timeout '+stderr)),8000);pending.push({resolve,reject,timer});});
 const exit=once(child,'exit');assert.deepEqual(await next(),{ready:true});
 return {child,exit,next,send:(command:PlanClientCommand)=>{child.send(command);return next();},finish:async()=>{await exit;assert.equal(child.exitCode,0,stderr);}};
}
function fixture(name:string){
 const base=process.env['RUNTIME_OBSERVATIONS']?join(dirname(process.env['RUNTIME_OBSERVATIONS']),'plan-fixtures'):tmpdir();mkdirSync(base,{recursive:true});const root=mkdtempSync(join(base,name+'-'));initializePlanFixture(root);return root;
}
async function call(command:PlanClientCommand){const c=await spawnClient();const r=await c.send(command);await c.finish();return r;}
async function ok(command:PlanClientCommand){const r=await call(command);assert.equal(r.ok,true,JSON.stringify(r));return r.result;}
const save=(n:number,expectedVersion=0,content='Plan version '+n):PlanSave=>({schemaVersion:1,sessionId:pid(12),documentId:pid(30),key:pid(100+n),expectedVersion,expiresAt:new Date(planEpoch+300_000).toISOString(),content});
function state(root:string){const f=new SQLitePlanFixture(root);try{return f.observe();}finally{f.close();}}
function targets(root:string){return Object.fromEntries(['canonical.txt','server.txt','allocator.json'].map(p=>[p,readFileSync(join(root,p),'utf8')]));}
function observations(root:string,before:ReturnType<typeof targets>,detail:Record<string,unknown>){
 assert.deepEqual(targets(root),before);const s=state(root);
 return {'admission-state':{root,...detail,parentDigest:bindingDigest(s.parents),intentCount:Object.keys(s.intents).length,artifacts:Object.keys(s.artifacts).length,settlements:Object.keys(s.settlements).length,assurance:'owned-local-fixture'},'target-observer':{before,after:targets(root),targetWrites:0,canonicalWrites:0},'port-census':{pids:[...births],allocatorCalls:0,modelCalls:0,toolCalls:0,fixtureOnly:true}};
}
async function bridge(){
 const root=fixture('plan-bridge'),before=targets(root),parentBefore=state(root).parents;
 const first=save(1,0,'');const v1=await ok({root,op:'save',request:first});assert.equal(v1.logicalVersion,1);assert.equal(v1.binding.artifact.revision,1);
 // A genuinely new OS process/SQLite owner reopens exact serialized bytes.
 const reopened=await ok({root,op:'reopen',sessionId:pid(12),documentId:pid(30)});
 assert.deepEqual(reopened.version,v1);assert.equal(reopened.bytes,JSON.stringify({schemaVersion:1,originalEnvelopeDigest:bindingDigest(parentBefore[pid(12)]!.envelope),logicalVersion:1,previous:null,content:''}));
 const v2=await ok({root,op:'save',request:save(2,1,'😀'.repeat(PLAN_CONTENT_BYTES/4))});assert.equal(v2.logicalVersion,2);assert.equal(v2.binding.artifact.revision,1);assert.notEqual(v1.binding.artifact.id,v2.binding.artifact.id);assert.deepEqual(v2.binding.previous,v1.binding.artifact);
 const v2bytes=await ok({root,op:'reopen',sessionId:pid(12),documentId:pid(30)});assert.equal(JSON.parse(v2bytes.bytes).content,'😀'.repeat(PLAN_CONTENT_BYTES/4));
 assert.equal((await call({root,op:'save',request:save(3,2,'x'.repeat(PLAN_CONTENT_BYTES+1))})).ok,false);
 // Both clients are ready before receiving the same-base, differing save keys.
 const clients=await Promise.all([spawnClient(),spawnClient()]);
 const raced=await Promise.all(clients.map((c,i)=>c.send({root,op:'save',request:save(10+i,2,'racer '+i)})));await Promise.all(clients.map(c=>c.finish()));
 assert.equal(raced.filter(r=>r.ok).length,1);assert.equal(raced.find(r=>!r.ok)!.code,'IDEMPOTENCY_CONFLICT');
 const winner=raced.find(r=>r.ok)!.result;assert.equal(winner.logicalVersion,3);assert.equal(winner.binding.artifact.revision,1);
 const latest=await ok({root,op:'reopen',sessionId:pid(12),documentId:pid(30)});assert.deepEqual(latest.version,winner);assert.equal(JSON.parse(latest.bytes).content,winner.saveKey===pid(110)?'racer 0':'racer 1');
 assert.equal((await ok({root,op:'reopen',sessionId:pid(12),documentId:pid(30),version:1})).bytes,reopened.bytes);
 const snapshot=state(root);assert.equal(Object.keys(snapshot.artifacts).length,3);assert.equal(Object.keys(snapshot.settlements).length,3);
 assert.deepEqual(await ok({root,op:'save',request:first}),v1);assert.deepEqual(state(root),snapshot);
 assert.equal((await call({root,op:'save',request:{...first,content:'changed under original key'}})).code,'IDEMPOTENCY_CONFLICT');
 for(const [field,value] of Object.entries({child:intentPlaceholder(),payerId:pid(999),allowanceId:pid(999),targetId:pid(999),audience:[pid(999)]}))assert.equal((await call({root,op:'save',request:{...save(900),[field]:value}})).ok,false);
 assert.equal((await call({root,op:'save',request:save(99,0)})).code,'IDEMPOTENCY_CONFLICT');
 for(const intent of Object.values(snapshot.intents)){
  const b=intent.binding,p=b.originalPlan,c=b.child;
  assert.equal(p.intent,'Plan');assert.equal(p.purpose,'planning');assert.equal(c.intent,'Ask');assert.equal(c.purpose,'maintenance');assert.equal(c.category,'service');assert.equal(b.childExecutionClass,'service');
  for(const field of ['taskId','runId','sessionId'] as const)assert.notEqual(c[field],p[field]);
  for(const field of ['actorId','payerId','costCenter','versions','tenantId','spaceId'] as const)assert.deepEqual(c[field],p[field]);
  assert.equal(c.parentTaskId,p.taskId);assert.equal(b.parentBudgetRunId,p.runId);assert.equal(b.lineage.parentRunId,p.runId);assert.deepEqual(b.lineage.childFamilyAllowances,b.lineage.parentAllowances);assert.deepEqual(b.originalPlan,parentBefore[pid(12)]!.binding);
  assert.deepEqual(intent.childService,planMaintenanceService);assert.deepEqual(intent.childService.ports,[]);assert.deepEqual(intent.childService.ongoingCompute,[]);assert.equal(intent.childService.resourceId,null);assert.equal(intent.childService.computerCapability,null);assert.equal(intent.childService.targetEffect,false);assert.equal(intent.childService.approvalRequired,false);
 }
 assert.deepEqual(state(root).parents,parentBefore);
 // Direct owner calls and forged binding links cannot substitute for the private
 // admission capability. Child IDs cannot re-enter Plan save/routine/read routes.
 const local=new SQLitePlanFixture(root),scope=await planScope(root),intent=Object.values(snapshot.intents)[0]!;
 try{
  await assert.rejects(local.ports.artifacts.prepare(scope,intent,{artifactId:intent.binding.artifact.id}),/UNAUTHORIZED/);
  const forged=structuredClone(intent);(forged.binding.child as any).parentTaskId=pid(999);
  await assert.rejects(local.ports.uow.transaction(scope,tx=>local.repository.admission.require(tx,scope,forged,'write')));
  assert.equal((await local.ports.uow.transaction(scope,tx=>local.repository.admission.generalSession(tx,scope,pid(12),'model'))).intent,'Plan');
  for(const route of ['normal-turn','tool','model','vm','promotion']){
   await assert.rejects(local.ports.uow.transaction(scope,tx=>local.repository.admission.generalSession(tx,scope,intent.binding.child.sessionId,route)),/INTENT_EXCEEDED/);
   await assert.rejects(local.repository.save(scope,{...save(200),sessionId:intent.binding.child.sessionId}),/NOT_FOUND/);
  }
  await assert.rejects(local.repository.record(scope,{key:pid(500),sessionId:intent.binding.child.sessionId,kind:'transcript',content:'child general turn',explicit:false}),/UNAUTHORIZED/);
 }finally{local.close();}
 const same=fixture('plan-same-key'),sameClients=await Promise.all([spawnClient(),spawnClient()]);
 const duplicates=await Promise.all(sameClients.map(c=>c.send({root:same,op:'save',request:save(1)})));await Promise.all(sameClients.map(c=>c.finish()));assert.ok(duplicates.every(r=>r.ok));assert.deepEqual(duplicates[0]!.result,duplicates[1]!.result);assert.equal(Object.keys(state(same).intents).length,1);assert.equal(Object.keys(state(same).settlements).length,1);
 for(const phase of ['prepare','write'] as const){
  const r=fixture('plan-killed-'+phase),client=await spawnClient();assert.deepEqual(await client.send({root:r,op:'save',request:save(1),hooks:{wait:phase}}),{paused:phase});
  // Kill only the live child handle we just launched and observed at this barrier.
  client.child.kill('SIGKILL');await client.exit;assert.equal(client.child.signalCode,'SIGKILL');
  const killed=state(r);assert.equal(Object.keys(killed.intents).length,1);assert.equal(Object.keys(killed.artifacts).length,0);assert.equal(Object.keys(killed.settlements).length,0);
  const original=Object.values(killed.intents)[0]!;assert.deepEqual((await ok({root:r,op:'save',request:save(1)})).binding,original.binding);assert.equal(Object.keys(state(r).settlements).length,1);
 }
 // Commit uncertainty retains the original admission/bytes and recovers in a new
 // process without a replacement child, artifact, or second settlement.
 const faults=['after-admission','after-prepare','after-write','before-commit','lost-ack'] as const;
 for(const fault of faults){
  const r=fixture('plan-'+fault),request=save(1);assert.equal((await call({root:r,op:'save',request,hooks:{fault}})).ok,false);
  let s=state(r);assert.equal(Object.keys(s.intents).length,1);assert.equal(Object.keys(s.artifacts).length,fault==='lost-ack'?1:0);assert.equal(Object.keys(s.settlements).length,fault==='lost-ack'?1:0);
  const original=Object.values(s.intents)[0]!,lookup=await ok({root:r,op:'lookup',key:request.key});assert.equal(lookup!==null,fault==='lost-ack');
  const recovered=await ok({root:r,op:'save',request});s=state(r);assert.deepEqual(recovered.binding,original.binding);assert.equal(Object.keys(s.intents).length,1);assert.equal(Object.keys(s.artifacts).length,1);assert.equal(Object.keys(s.settlements).length,1);
  assert.equal((await ok({root:r,op:'reopen',sessionId:pid(12),documentId:pid(30)})).bytes,original.bytes);
 }
 return observations(root,before,{sameBridge:true,physicalRevision:1,logicalVersions:3,independentRace:true,equalKeyRace:true,processKillRecovery:['prepare','write'],originalKeyFaults:[...faults],parentUnchanged:true});
}
async function recordsAndAuthority(){
 const root=fixture('plan-authority'),before=targets(root),parentBefore=state(root).parents;
 let n=1000;
 for(const sessionId of [pid(12),pid(15)])for(const kind of ['transcript','audit','memory'] as const){const request={key:pid(n++),sessionId,kind,content:'Authorized '+kind,explicit:kind==='memory'};assert.deepEqual(await ok({root,op:'record',request}),request);assert.deepEqual(await ok({root,op:'record',request}),request);}
 assert.equal(Object.keys(state(root).routines).length,6);assert.equal(state(root).audits.length,6);
 const baseline=state(root);
 assert.equal((await call({root,op:'record',request:{key:pid(n++),sessionId:pid(12),kind:'memory',content:'implicit',explicit:false}})).code,'PERMISSION_DENIED');
 const denyRecord=async(change:(c:PlanFixtureConfig)=>void,kind='transcript')=>{
  setFixtureConfig(root,change);const r=await call({root,op:'record',request:{key:pid(n++),sessionId:pid(12),kind,content:'blocked',explicit:true}});assert.equal(r.ok,false,JSON.stringify(r));setFixtureConfig(root,c=>{c.authority.grants=planGrants;c.sourceAvailable=true;c.remaining=10;c.auditAvailable=true;});assert.deepEqual(state(root),baseline);
 };
 for(const grant of ['persistence:write','memory:write','source:read'])await denyRecord(c=>{c.authority.grants=planGrants.filter(g=>g!==grant);},grant==='memory:write'?'memory':'transcript');
 await denyRecord(c=>{c.sourceAvailable=false;});await denyRecord(c=>{c.auditAvailable=false;});
 assert.equal((await call({root,op:'record',request:{key:pid(n++),sessionId:pid(12),kind:'audit',content:'also write target',explicit:true,targetWrite:'forbidden'}})).ok,false);
 const current=await ok({root,op:'save',request:save(1)});assert.equal(current.logicalVersion,1);
 assert.equal((await call({root,op:'save',request:{...save(900),sessionId:pid(15)}})).code,'INTENT_EXCEEDED');
 for(const grant of ['storage:maintenance','storage:write','task:read','task:write','source:read']){
  const prior=state(root);setFixtureConfig(root,c=>{c.authority.grants=planGrants.filter(g=>g!==grant);});assert.equal((await call({root,op:'save',request:save(n++,1)})).ok,false);setFixtureConfig(root,c=>{c.authority.grants=planGrants;});assert.deepEqual(state(root),prior);
 }
 setFixtureConfig(root,c=>{c.authority.grants=planGrants.filter(g=>g!=='storage:read');});assert.equal((await call({root,op:'reopen',sessionId:pid(12),documentId:pid(30)})).code,'PERMISSION_DENIED');setFixtureConfig(root,c=>{c.authority.grants=planGrants;});
 for(const change of [
  (p:any)=>{p.active=false;},(p:any)=>{p.controlRevision++;},(p:any)=>{p.binding.requirementsRevision++;p.envelope.requirementsRevision++;},
  (p:any)=>{p.binding.policyRevision++;},(p:any)=>{p.binding.payerId=pid(999);},(p:any)=>{p.audience=[pid(999)];},
  (p:any)=>{p.envelope.versions.behavior='changed';},(p:any)=>{p.binding.sourceRevisionDigest=bindingDigest('changed');},
 ]){
  const r=fixture('plan-parent-current');await ok({root:r,op:'save',request:save(1)});const f=new SQLitePlanFixture(r);try{f.mutate(s=>change(s.parents[pid(12)]));}finally{f.close();}
  const prior=state(r);assert.equal((await call({root:r,op:'reopen',sessionId:pid(12),documentId:pid(30)})).ok,false);assert.deepEqual(state(r),prior);
 }
 // Observe the real wait in an independent OS process, revoke its current source,
 // payer, expiry, or grants, then let it continue. No denied bytes/publication.
 for(const phase of ['prepare','write','read'] as const){
  for(const revocation of ['source','payer','expiry','grant','budget'] as const){
   const r=fixture('plan-wait-'+phase+'-'+revocation);if(phase==='read')await ok({root:r,op:'save',request:save(1)});
   const prior=state(r),client=await spawnClient();const pending=client.send(phase==='read'?{root:r,op:'reopen',sessionId:pid(12),documentId:pid(30),hooks:{wait:phase}}:{root:r,op:'save',request:save(2),hooks:{wait:phase}});
   assert.deepEqual(await pending,{paused:phase});
   setFixtureConfig(r,c=>{if(revocation==='source')c.sourceAvailable=false;else if(revocation==='payer')c.authority.payerRevoked=true;else if(revocation==='expiry')c.now=planEpoch+600_000;else if(revocation==='budget')c.remaining=0;else c.authority.grants=planGrants.filter(g=>g!==(phase==='read'?'storage:read':'storage:write'));});
   const response=client.next();client.child.send('continue');assert.equal((await response).ok,false);await client.finish();const after=state(r);
   assert.deepEqual(after.artifacts,prior.artifacts);assert.deepEqual(after.versions,prior.versions);assert.deepEqual(after.settlements,prior.settlements);assert.deepEqual(after.parents,prior.parents);
  }
 }
 // Required audit outage/revocation after observed routine wait rolls all records
 // back; the still-unsaved input is kept by the caller, not rewritten to a target.
 for(const phase of ['audit','source'] as const){const r=fixture('routine-wait'),c=await spawnClient(),prior=state(r);assert.deepEqual(await c.send({root:r,op:'record',request:{key:pid(500),sessionId:pid(12),kind:'transcript',content:'preserve me',explicit:false},hooks:{wait:phase}}),{paused:phase});setFixtureConfig(r,v=>{v.auditAvailable=false;v.sourceAvailable=false;});const next=c.next();c.child.send('continue');assert.equal((await next).ok,false);await c.finish();assert.deepEqual(state(r),prior);}
 // Cross actor/Space/payer and fake JSON scopes disclose no record/bytes.
 const f=new SQLitePlanFixture(root);try{
  for(const field of ['actorId','spaceId','tenantId','payerId'] as const){const scope=await planScope(root,{[field]:pid(999)});await assert.rejects(f.repository.reopen(scope,pid(12),pid(30)));}
  await assert.rejects(f.repository.lookup({} as any,save(1).key));
 }finally{f.close();}
 assert.deepEqual(state(root).parents,parentBefore);return observations(root,before,{authorizedRoutineRecords:6,requiredAudit:true,afterWaitRevocations:15,explicitMemory:true,sourceAccessRefused:true});
}
export const planCases={'I03/full':bridge,'I04/full':recordsAndAuthority};
function intentPlaceholder(){return {intent:'Ask',purpose:'maintenance',sessionId:pid(999)};}
