import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createAuthorityRouteFixture} from './authority-route-fixture.js';
import {RegisteredSourceChecker} from '../../src/knowledge-status.js';
import {AuthenticatedUnitOfWork} from '../../../g1-identity/src/authenticated-uow.js';
import {PostgresUnitOfWork} from '../../../g1-foundations/src/postgres-uow.js';
import {sourceNarrativeDigest,type KnowledgeSaveHooks} from '../../src/knowledge-save.js';
import {enrollServiceAccounting} from './accounting-fixture.js';
import {QueryControlsRepository} from '../../src/query-controls.js';
import {SourceRecallBroker} from '../../src/recall-broker.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {NativeAskRepository,startNativeAskHttp,type NativeAskPorts} from '../../src/native-ask.js';
import {MaintenanceBuildersRepository,MaintenancePlanSchema,MaintenancePolicySchema} from '../../src/maintenance-builders.js';
import {StorageServiceAccounting} from '../../src/resource-composition.js';
import {AskResultSchema} from '../../src/schema.js';
import {installedOwnerSnapshot} from '../../src/migration.js';
import type {SaveCommand,Knowledge} from '../../src/contracts.js';
import type {VerifiedScope} from '../../src/owners.js';

/** Extends the existing real route fixture only. Installed repositories perform
 * every save/check/history/Ask/backup/import operation. */
export async function createKnowledgeVerificationFixture(){
 const f=await createAuthorityRouteFixture();let checkerPool:pg.Pool|undefined;
 try{
  const scope=f.f.scope;
  const source=async(s=scope,subject='subject-'+randomUUID(),value='decision-'+randomUUID()+' Ω 🙂')=>{
   const narrative=JSON.stringify({subject,value}),c={...await f.base(s),action:'source' as const,title:'evidence-'+randomUUID(),uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};
   const r=await f.canonical().source(s,c);assert.equal(r.status,'source-accepted');f.count.write++;return {s,c,subject,value};
  };
  const fresh=async(src:Awaited<ReturnType<typeof source>>,extra:Partial<SaveCommand['assertion']>={}):Promise<SaveCommand>=>({...await f.base(src.s),action:'save',assertion:{subject:src.subject,value:src.value,sourceId:src.c.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(src.c.retentionExpiresAt)-1000).toISOString(),classification:src.s.spaceId===f.f.spaces.personal?'personal':'group',intent:'assert',checkId:null,...extra}});
  const ref=async(c:SaveCommand,revision?:number,s=scope)=>{const r=(await f.f.admin.query('SELECT revision,witness FROM fabric.storage_knowledge_revisions WHERE tenant_id=$1 AND space_id=$2 AND id=$3 AND ($4::numeric IS NULL OR revision=$4) ORDER BY revision DESC LIMIT 1',[s.tenantId,s.spaceId,c.targetId,revision??null])).rows[0];assert(r);return {class:'knowledge' as const,id:c.targetId,revision:Number(r.revision),witness:String(r.witness)};};
  const read=async(c:SaveCommand,revision?:number,s=scope,recall=false)=>{const r=await f.canonical()[recall?'recall':'read'](s,await ref(c,revision,s));f.count.read++;return r;};
  const save=async(c:SaveCommand,status='saved-here',s=scope)=>{const r=await f.canonical().append(s,c);assert.equal(r.status,status,JSON.stringify(r));f.count.write++;if(status==='saved-here')f.count.save++;await effects(c,s);return r;};
  const effects=async(c:{key:string;targetId:string},s=scope,n=1)=>{for(const table of ['storage_knowledge_revisions','storage_save_receipts','storage_save_events','storage_commands','storage_outbox']){const rows=(await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE tenant_id=$1 AND space_id=$2 AND command_key=$3',[s.tenantId,s.spaceId,c.key])).rows;if(rows[0].n!==n)f.violations.duplicateCanonicalEffect++;assert.equal(rows[0].n,n,table);}};
  const denied=async(work:()=>Promise<any>,codes:string[]=[])=>{let refused=false;try{const r=await work();if(r?.status==='not-saved'){if(codes.length)assert.ok(codes.includes(r.error),JSON.stringify(r));refused=true;}else{f.violations.unauthorizedMutation++;assert.fail('Expected actual refusal');}}catch(e){if(e instanceof assert.AssertionError)throw e;if(codes.length)assert.ok(codes.includes(String((e as {code?:string}).code)),String(e));refused=true;}assert(refused);f.count.deny++;};
  const correct=async(c:SaveCommand,value:string,s=scope)=>{const prior=await ref(c,undefined,s);return {command:{...c,action:'correct' as const,key:randomUUID(),sessionId:(await f.task(s)).binding.sessionId,expectedRevision:prior.revision,assertion:{...c.assertion,value}},prior};};
  const commitCorrection=async(c:Awaited<ReturnType<typeof correct>>,s=scope,hooks:KnowledgeSaveHooks={})=>{const r=await f.canonical(hooks).correct(s,c);assert.equal(r.status,'saved-here',JSON.stringify(r));f.count.save++;f.count.write++;await effects(c.command,s);return r;};
  const history=async(c:SaveCommand,s=scope)=>{const h=await f.canonical().history(s,c.targetId);f.count.read++;return h;};
  const state=async(c:SaveCommand,status:Knowledge['status'],checkId:string|null=null)=>({schemaVersion:1,sessionId:c.sessionId,key:randomUUID(),expiresAt:c.expiresAt,prior:await ref(c),status,checkId});
  const check=async(src:Awaited<ReturnType<typeof source>>)=>{
   if(!checkerPool){const role='checker_'+randomUUID().replaceAll('-',''),password=randomUUID();await f.f.admin.query(`CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);await f.f.admin.query(`GRANT fabric_controller,fabric_storage_source_checker TO ${role}`);const url=new URL(f.f.fixtureDsn('controller'));url.username=role;url.password=password;checkerPool=new pg.Pool({connectionString:url.href,max:2});}
   const uow=new AuthenticatedUnitOfWork({foundation:new PostgresUnitOfWork(checkerPool),bindingFor:f.f.verifier.bindingFor});
   const proof=await new RegisteredSourceChecker(uow,f.authority(),f.cipher()).run(src.s,{sessionId:src.c.sessionId,expiresAt:src.c.expiresAt,source:{...await f.ref(src.s,'source',src.c.targetId),class:'source'},claim:{subject:src.subject,value:src.value}});f.count.write++;return proof;
  };
  const owners=async()=>{const names=(await f.f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='fabric' AND tablename NOT LIKE 'storage_%' ORDER BY tablename")).rows.map(r=>String(r.tablename));assert(names.length>=40);return Promise.all(names.map(async n=>[n,(await f.f.admin.query('SELECT row_to_json(x) AS r FROM fabric.'+n+' x ORDER BY row_to_json(x)::text')).rows]));};
  const sourceView=async(src:Awaited<ReturnType<typeof source>>,c:SaveCommand)=>({s:src.s,source:src.c,save:c,sourceRef:{...await f.ref(src.s,'source',src.c.targetId),class:'source' as const},knowledgeRef:await ref(c,undefined,src.s),readSource:async()=>{throw new Error('Unused fixture port');},readKnowledge:()=>read(c,undefined,src.s,true)});
  const blocked=async(pid:number)=>{const deadline=Date.now()+1500;let rows:any[]=[];do{rows=(await f.f.admin.query('SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows;if(rows.length)break;}while(Date.now()<deadline);assert.equal(rows.length,1,'Actual queued writer backend');console.log(JSON.stringify({measurement:'knowledge-observed-lock',blockerPid:pid,waiterPid:rows[0].pid,blockers:rows[0].blockers}));};
  const askQuery=async(c:SaveCommand)=>{
   const e=await enrollServiceAccounting(f.f,f.authority(),'ask',scope),controls=new QueryControlsRepository(f.f.uow,f.authority());
   await controls.set(scope,{schemaVersion:1,action:'query-controls',sessionId:e.task.binding.sessionId,targetId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:0,expiresAt:e.command.expiresAt,controls:{attachments:false,olderRecall:true,saveReusable:false}});
   const fail=(name:keyof typeof f.ports)=>async()=>{f.ports[name]++;throw new Error('Forbidden knowledge Ask '+name);};const ports:NativeAskPorts={computer:fail('computer'),shell:fail('shell'),model:fail('model'),enrichment:fail('enrichment'),effect:fail('effect')};
   const cipher=f.cipher(),broker=new SourceRecallBroker(f.f.uow,f.authority(),cipher,{resolve:async()=>({keyId:f.keyId,generation:f.generation})},new KnowledgeStatusAdmission(cipher),f.canonical(),controls),repo=new NativeAskRepository(e.service,broker,{resolve:async()=>e.command},ports),http=await startNativeAskHttp(f.f.verifier,repo);
   try{const command={schemaVersion:1,sessionId:e.task.binding.sessionId,key:randomUUID(),expectedRevision:(await f.f.native.snapshot(scope,e.task.binding.sessionId)).revision,expiresAt:e.command.expiresAt,question:'What saved decision applies?',selector:{kind:'id',value:c.targetId},attachmentIds:[]};const r=await fetch(http.url+`/v1/tenants/${scope.tenantId}/spaces/${scope.spaceId}/native/ask`,{method:'POST',headers:{authorization:'Bearer '+f.f.tokens.get(scope.actorId)!,'content-type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(9000)}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));f.count.ask++;f.count.read++;return AskResultSchema.parse(body);}finally{await http.close();await assert.rejects(fetch(http.url,{signal:AbortSignal.timeout(500)}));console.log(JSON.stringify({measurement:'knowledge-ask-http-cleanup',portClosed:true,sessionId:e.task.binding.sessionId}));}
  };
  const summaryAttempt=async(c:SaveCommand)=>{
   const e=await enrollServiceAccounting(f.f,f.authority(),'maintenance',scope),materialId=randomUUID(),plan=MaintenancePlanSchema.parse({schemaVersion:1,builder:'summary-v1',id:randomUUID(),revision:1,sourceTaskId:e.task.binding.taskId,expiresAt:new Date(Date.parse(c.assertion.expiresAt)-100).toISOString(),dependencies:[await ref(c)]}),policy=MaintenancePolicySchema.parse({schemaVersion:1,revision:1,profile:'local-deterministic-v1',region:'local-fixture',provider:'none',sourceAllowed:true,allowedBuilders:['summary-v1']});
   const graph=f.graph(),repo=new MaintenanceBuildersRepository(graph,new StorageServiceAccounting(f.f.uow,f.f.native,e.owner,graph.authority),{plan:async()=>plan,policy:async()=>policy,accounting:async(_tx,_s,_n,_key,expiresAt)=>({...e.command,expiresAt})}),command={key:randomUUID(),sessionId:e.task.binding.sessionId,expiresAt:e.command.expiresAt,materialId,expected:null};
   const before=await f.snapshot();await denied(()=>repo.publish(scope,command),['CONTENT_UNAVAILABLE']);assert.deepEqual(await f.snapshot(),before);assert.equal((await read(c)).status,'proposed');assert.equal((await f.f.admin.query('SELECT count(*)::int AS n FROM fabric.storage_graph_nodes WHERE id=$1',[plan.id])).rows[0].n,0);console.log(JSON.stringify({measurement:'knowledge-proposal-summary-refusal',builder:plan.builder,proposalId:c.targetId,canonicalRevision:(await ref(c)).revision,derivedRows:0,economicStateUnchanged:true}));
  };
  const final=async()=>{assert.equal(await installedOwnerSnapshot(f.f.admin),f.ownerBefore);assert.deepEqual(f.ports,{computer:0,shell:0,model:0,enrichment:0,effect:0});f.count.owner++;};
  return {...f,scope,source,fresh,ref,read,save,effects,denied,correct,commitCorrection,history,state,check,owners,sourceView,blocked,askQuery,summaryAttempt,final,close:async()=>{try{await checkerPool?.end();}finally{await f.close();}}};
 }catch(e){try{await checkerPool?.end();}finally{await f.close();}throw e;}
}
export type KnowledgeVerificationFixture=Awaited<ReturnType<typeof createKnowledgeVerificationFixture>>;
