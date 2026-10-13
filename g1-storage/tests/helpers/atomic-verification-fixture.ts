import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {census,type ProcessRow} from '../../../g1-model/tests/helpers/process-fixture.js';
import type {PoolClient} from 'pg';
import {createStorageFixture} from './pg-fixture.js';
import {enrollAuthority} from './authority-fixture.js';
import {migrateStorageKnowledgeCorrection,installedOwnerSnapshot} from '../../src/migration.js';
import {CryptoStore} from '../../src/crypto-store.js';
import {KnowledgeSaveRepository,sourceNarrativeDigest,type KnowledgeSaveHooks} from '../../src/knowledge-save.js';
import {KnowledgeStatusAdmission} from '../../src/knowledge-status.js';
import {EpochWitnessJournal,type OwnedAnchorRoot} from '../../src/epoch-journal.js';
import {startKnowledgeCommandHttp} from '../../src/command-http.js';
import {demand} from '../../src/errors.js';
import type {AsyncUnitOfWork,VerifiedScope} from '../../src/owners.js';
import type {SaveCommand} from '../../src/contracts.js';
import type {AtomicWorkerInput} from './atomic-command-worker.js';
import {atomicDigest,type AtomicPhaseRecord,type WorkerDisconnection,type BackendIdentity} from './atomic-disconnect-records.js';

type AtomicWorker={child:ChildProcess;closed:Promise<unknown>;application:string;url:string;output:Buffer[];nonce:string;identity:ProcessRow;cleanup?:Promise<WorkerDisconnection>};
export const canonicalTables=['storage_current_heads','storage_knowledge_revisions','storage_commands','storage_outbox','storage_save_events','storage_save_receipts'] as const;
export async function createAtomicVerificationFixture(){
 const f=await createStorageFixture(),dataKey=randomBytes(32),digestKey=randomBytes(32),keyId=randomUUID(),generation=randomUUID();
 const services:Awaited<ReturnType<typeof startKnowledgeCommandHttp>>[]=[],workers:AtomicWorker[]=[];
 const positives={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0};
 const violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 let closed=false;
 async function close(){if(closed)return;closed=true;const failures:unknown[]=[];for(const w of workers)try{await kill(w);}catch(e){failures.push(e);}const results=await Promise.allSettled(services.map(s=>s.close()));failures.push(...results.filter(r=>r.status==='rejected').map(r=>(r as PromiseRejectedResult).reason));dataKey.fill(0);digestKey.fill(0);try{await f.close();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'Atomic verification cleanup failed');}
 async function until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,label:string,bound=1500){let value:T;const started=performance.now();do{value=await read();if(performance.now()-started>bound)break;if(accept(value))return value;}while(performance.now()-started<bound);assert.fail('Unobserved '+label+' within '+bound+'ms');}
 async function marker(){assert.deepEqual((await f.admin.query('SELECT owner,instance FROM public.fabric_storage_fixture')).rows,[{owner:f.owner,instance:f.instance}]);}
 async function kill(w:AtomicWorker){
  // Cache this attempt, including rejection. Cleanup never retries an expired
  // observation or treats an already-exited child as evidence of PG closure.
  if(w.cleanup)return w.cleanup;
  w.cleanup=(async()=>{
   await marker();assert.ok(w.child.pid&&w.child.pid!==process.pid);
   assert.equal(w.child.exitCode,null);assert.equal(w.child.signalCode,null);
   assert.deepEqual(census().find(r=>r.pid===w.child.pid),w.identity,'Current worker birth/parent/nonce before signaling');
   const capturedPids:number[]=[];
   const connections=async():Promise<BackendIdentity[]>=>{
    const client=await f.admin.connect();try{await client.query('SELECT pg_stat_clear_snapshot()');return (await client.query('SELECT pid,backend_start,usename,application_name,state,wait_event_type,wait_event FROM pg_stat_activity WHERE application_name=$1 OR application_name=$2 OR pid=ANY($3::int[]) ORDER BY pid',[w.application,w.application+'-auth',capturedPids])).rows.map(r=>({...r,backend_start:new Date(r.backend_start).toISOString()}));}finally{client.release();}
   };
   const before=await connections();capturedPids.push(...before.map(r=>r.pid));
   assert.ok(before.some(r=>r.application_name===w.application&&r.usename===f.roles.controller),'Owned controller connection observed before SIGKILL');
   assert.ok(before.some(r=>r.application_name===w.application+'-auth'&&r.usename===f.roles.authority),'Owned auth connection observed before SIGKILL');
   const started=performance.now();assert.equal(w.child.kill('SIGKILL'),true);
   let samples=0,last=before,disconnectedAt:number|undefined;const polls:WorkerDisconnection['polls']=[];
   do{
    last=await connections();samples++;const observedAt=performance.now();polls.push({observedAtMs:observedAt,connections:last});
    if(last.length===0){disconnectedAt=observedAt;break;}
   }while(performance.now()-started<2000);
   const elapsed=(disconnectedAt??performance.now())-started;
   console.log(JSON.stringify({measurement:'atomic-owned-worker-disconnection',pid:w.child.pid,nonce:w.nonce,birth:w.identity.instance,ppid:w.identity.ppid,owner:f.owner,instance:f.instance,application:w.application,clock:'parent-monotonic',signalDispatchMs:started,observedGoneMs:disconnectedAt??null,elapsedMs:elapsed,boundMs:2000,before,last,samples}));
   await w.closed;assert.equal(w.child.exitCode,null);assert.equal(w.child.signalCode,'SIGKILL');
   assert.ok(disconnectedAt!==undefined&&elapsed<=2000,'All owned controller/auth PG connections gone within 2000ms from SIGKILL');
   assert.equal(Buffer.concat(w.output).length,0,'No worker content/key output');
   assert.equal(census().some(r=>r.pid===w.child.pid),false,'Owned worker independently absent');
   if(w.url)await assert.rejects(fetch(w.url,{signal:AbortSignal.timeout(500)}));
   console.log(JSON.stringify({measurement:'atomic-owned-worker-cleanup',pid:w.child.pid,nonce:w.nonce,owner:f.owner,instance:f.instance,signal:w.child.signalCode,backendConnections:0,portClosed:Boolean(w.url),outputBytes:0}));
   return {pid:w.child.pid!,nonce:w.nonce,identity:w.identity,owner:f.owner,instance:f.instance,application:w.application,signal:'SIGKILL' as const,signalDispatchMs:started,observedGoneMs:disconnectedAt!,elapsedMs:elapsed,before,polls,processAbsent:true,portClosed:Boolean(w.url),outputBytes:Buffer.concat(w.output).length};
  })();
  w.cleanup.catch(()=>{});return w.cleanup;
 }

 try{
  await migrateStorageKnowledgeCorrection(f.admin,{ownedSyntheticDatabase:true,owner:f.owner,instance:f.instance,root:f.root});const a=await enrollAuthority(f),scope=f.scope;
  const root=(JSON.parse(process.env['STORAGE_OWNED_ROOTS']!) as Record<string,OwnedAnchorRoot>)['authority']!,journal=new EpochWitnessJournal(root);
  for(const s of [scope,await f.scopeFor(f.actors[0],f.spaces.secondary)])await journal.install(s.tenantId,s.spaceId,a.anchors.get(a.key(s))!);
  const crypto=()=>new CryptoStore({resolve:async()=>({dataKey,digestKey})});
  const repo=(hooks:KnowledgeSaveHooks={},uow:AsyncUnitOfWork=f.uow,c=crypto())=>new KnowledgeSaveRepository(uow,new EpochWitnessJournal(root),f.native,c,{resolve:async()=>({keyId,generation})},new KnowledgeStatusAdmission(c),hooks);
  const task=await f.task('maintenance'),subject='atomic-source-'+randomUUID(),value='decision-'+randomUUID()+' Ω 🙂\u0000\r\n';
  const makeSource=async(s:VerifiedScope=scope)=>{const task=await f.task('maintenance',s),narrative='source-'+randomUUID();const c={schemaVersion:1 as const,action:'source' as const,sessionId:task.binding.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+35_000).toISOString(),title:subject,uri:null,narrative,contentDigest:sourceNarrativeDigest(narrative),retentionExpiresAt:new Date(Date.now()+59_000).toISOString(),saveReusable:true};const result=await repo().source(s,c);demand(result.status==='source-accepted');positives.write++;return {c,result};};
  const source=await makeSource();
  const fresh=(src=source):SaveCommand=>({schemaVersion:1,action:'save',sessionId:src.c.sessionId,targetId:randomUUID(),key:randomUUID(),expectedRevision:0,expiresAt:new Date(Date.now()+30_000).toISOString(),assertion:{subject:subject+' '+randomUUID(),value,sourceId:src.c.targetId,sourceRevision:1,validFrom:new Date(Date.now()-1000).toISOString(),validUntil:null,expiresAt:new Date(Date.parse(src.c.retentionExpiresAt)-1000).toISOString(),classification:'group',intent:'assert',checkId:null}});
  const serve=async(r=repo(),verifier=f.verifier)=>{const s=await startKnowledgeCommandHttp(verifier,r);services.push(s);return s;};
  const path=(s=scope,op='save')=>`/v1/tenants/${s.tenantId}/spaces/${s.spaceId}/knowledge/${op}`;
  const request=async(service:{url:string},c:unknown,op='save',s=scope)=>{const r=await fetch(service.url+path(s,op),{method:'POST',headers:{authorization:'Bearer '+f.tokens.get(s.actorId)!,'content-type':'application/json'},body:JSON.stringify(c),signal:AbortSignal.timeout(9000)});assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json() as Record<string,any>};};
  const snapshot=async()=>{const tables=(await f.admin.query("SELECT relname FROM pg_class WHERE relnamespace='fabric'::regnamespace AND relkind='r' AND relname LIKE 'storage_%' ORDER BY relname")).rows;return Promise.all(tables.map(async r=>[r.relname,(await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.'+r.relname+' x ORDER BY row_to_json(x)::text')).rows]));};
  const effects=async(c:SaveCommand,n:number,s=scope)=>{const counts:number[]=[];for(const table of canonicalTables){const col=table==='storage_current_heads'?'id':table==='storage_save_events'?'target_id':table==='storage_save_receipts'||table==='storage_knowledge_revisions'?'id':'command_key',v=col==='command_key'?c.key:c.targetId;const actual=Number((await f.admin.query('SELECT count(*)::int AS n FROM fabric.'+table+' WHERE tenant_id=$1 AND space_id=$2 AND '+col+'=$3'+(col==='command_key'?' AND actor_id=$4':''),col==='command_key'?[s.tenantId,s.spaceId,v,s.actorId]:[s.tenantId,s.spaceId,v])).rows[0].n);if(actual!==n)violations.duplicateCanonicalEffect++;assert.equal(actual,n,table);counts.push(actual);}return counts;};
  const ref=async(c:SaveCommand)=>{const row=(await f.admin.query('SELECT witness FROM fabric.storage_knowledge_revisions WHERE id=$1',[c.targetId])).rows[0];demand(row);return {class:'knowledge' as const,id:c.targetId,revision:1,witness:String(row.witness)};};
  const content=async(c:SaveCommand)=>{const k=await repo().read(scope,await ref(c));assert.equal(k.value,c.assertion.value);assert.equal(k.subject,c.assertion.subject);assert.equal(k.source.sourceId,c.assertion.sourceId);positives.read++;return k;};
  const denied=async(work:()=>Promise<unknown>,codes:readonly string[]=[])=>{let caught=false;try{const r=await work();if(r&&typeof r==='object'&&(r as {status?:string}).status==='not-saved'){if(codes.length)assert.ok(codes.includes(String((r as {error?:string}).error)));caught=true;}else{violations.unauthorizedMutation++;assert.fail('Unauthorized result');}}catch(e){if(e instanceof assert.AssertionError)throw e;if(codes.length)assert.ok(codes.includes(String((e as {code?:string}).code)));caught=true;}assert.ok(caught);positives.deny++;};
  const blocked=async(pid:number,n=1)=>{const rows=await until(async()=>(await f.admin.query('WITH RECURSIVE waiting(pid) AS (SELECT pid FROM pg_stat_activity WHERE $2=ANY(pg_blocking_pids(pid)) UNION SELECT a.pid FROM pg_stat_activity a JOIN waiting w ON w.pid=ANY(pg_blocking_pids(a.pid))) SELECT a.pid,pg_blocking_pids(a.pid) AS blockers FROM pg_stat_activity a JOIN waiting w USING(pid) WHERE a.usename=$1',[f.roles.controller,pid])).rows,r=>r.length===n,'every queued controller backend');console.log(JSON.stringify({measurement:'atomic-observed-lock',blockerPid:pid,pids:rows.map(r=>r.pid),blockers:rows.map(r=>r.blockers),count:n}));return rows;};
  const spawn=async()=>{
   const nonce=randomUUID();census();const child=fork(new URL('./atomic-command-worker.js',import.meta.url),[nonce],{execArgv:[],env:{},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});assert.ok(child.pid&&child.pid!==process.pid);
   const output:Buffer[]=[];child.stdout!.on('data',(b:Buffer)=>output.push(b));child.stderr!.on('data',(b:Buffer)=>output.push(b));const exit=once(child,'close');exit.catch(()=>{});
   const identity=census().find(r=>r.pid===child.pid);assert.ok(identity&&identity.ppid===process.pid&&identity.command.includes(nonce),'Fresh owned worker identity');
   const w:AtomicWorker={child,identity,closed:exit as Promise<unknown>,application:`atomic-${child.pid}-${nonce}`,url:'',output,nonce};workers.push(w);
   const ready=new Promise<{kind:string;pid:number;nonce:string;owner:string;instance:string;application:string;url:string;connectionCheckIntervalMs:number}>((resolve,reject)=>{child.once('message',m=>resolve(m as any));child.once('exit',()=>reject(new Error('Owned atomic worker exited before ready')));});ready.catch(()=>{});
   const endpoints=f.idp.ready as Record<string,string>;
   const input:AtomicWorkerInput={owner:f.owner,instance:f.instance,nonce,controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),issuer:endpoints['issuer']!,jwksUrl:endpoints['jwksUrl']!,token:f.tokens.get(scope.actorId)!,tenantId:scope.tenantId,spaceId:scope.spaceId,root,dataKey,digestKey,keyId,generation};
   child.send({kind:'install',value:input});let timer:ReturnType<typeof setTimeout>|undefined;
   try{const r=await Promise.race([ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned atomic worker ready timeout')),5000);})]);assert.deepEqual({...r,url:'<port>'},{kind:'ready',pid:child.pid,nonce,owner:f.owner,instance:f.instance,application:w.application,url:'<port>',connectionCheckIntervalMs:10});assert.match(r.url,/^http:\/\/127\.0\.0\.1:\d+$/);w.url=r.url;await marker();console.log(JSON.stringify({measurement:'atomic-owned-worker',pid:child.pid,nonce,owner:f.owner,instance:f.instance,application:w.application,birth:w.identity.instance,ppid:w.identity.ppid,connectionCheckIntervalMs:r.connectionCheckIntervalMs}));return w;}finally{clearTimeout(timer);}
  };
  const normal=await serve(),ownerBefore=await installedOwnerSnapshot(f.admin),resourcesBefore=(await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows;
  const phase=async(c:SaveCommand,table:typeof canonicalTables[number],timing:'BEFORE'|'AFTER',expectedMask:number):Promise<AtomicPhaseRecord>=>{
   const startedMs=performance.now(),observationIntervals:AtomicPhaseRecord['observationIntervals']=[];let record:AtomicPhaseRecord|undefined;
   const observer=await f.admin.connect(),gateId=Number.parseInt(randomBytes(3).toString('hex'),16),maskClass=177821,gateClass=177822;
   await observer.query('BEGIN');await observer.query('SELECT pg_advisory_xact_lock($1,$2)',[gateClass,gateId]);
   const countParts=canonicalTables.map((name,i)=>{const col=name==='storage_current_heads'||name==='storage_knowledge_revisions'||name==='storage_save_receipts'?'id':name==='storage_save_events'?'target_id':'command_key',id=col==='command_key'?c.key:c.targetId;return `(SELECT count(*)::int*${2**i} FROM fabric.${name} WHERE tenant_id='${scope.tenantId}' AND space_id='${scope.spaceId}' AND ${col}='${id}')`;});
   const condition=table==='storage_current_heads'?`NEW.class='knowledge' AND NEW.id='${c.targetId}'`:`NEW.command_key='${c.key}'`;
   await f.admin.query(`CREATE FUNCTION fabric.atomic_phase_probe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,fabric AS $$DECLARE mask int;BEGIN IF ${condition} THEN mask:=${countParts.join('+')};PERFORM pg_advisory_xact_lock(${maskClass},mask);PERFORM pg_advisory_xact_lock(${gateClass},${gateId});END IF;RETURN NEW;END$$;CREATE TRIGGER atomic_phase_probe ${timing} INSERT ON fabric.${table} FOR EACH ROW EXECUTE FUNCTION fabric.atomic_phase_probe()`);
   let w:Awaited<ReturnType<typeof spawn>>|undefined,pending:Promise<unknown>|undefined;
   const before=await snapshot(),anchor=(await journal.state(scope.tenantId,scope.spaceId))!.anchor;
   try{
    w=await spawn();let acknowledged=false;pending=request(w,c).then(r=>{if(r.body.status==='saved-here')acknowledged=true;return r;},()=>null);pending.catch(()=>{});
    const observationStart=performance.now();
    const blocker=(await observer.query('SELECT pid,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];
    observationIntervals.push({startedMs:observationStart,finishedMs:performance.now()});
    const rows=await until(async()=>{await observer.query('SELECT pg_stat_clear_snapshot()');return (await observer.query("SELECT a.pid,a.backend_start,a.usename,a.application_name,pg_blocking_pids(a.pid) AS blockers,l.objid::int AS mask FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name=$1 AND l.locktype='advisory' AND l.classid=$2::oid AND l.objsubid=2 AND l.granted AND $3=ANY(pg_blocking_pids(a.pid))",[w!.application,maskClass,Number((await observer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)])).rows;},r=>r.length===1,'actual partial-write row mask');
    assert.equal(rows[0].usename,f.roles.controller);assert.equal(rows[0].mask,expectedMask,'Mask derives from every actual in-transaction PG row');assert.equal(acknowledged,false);await effects(c,0);assert.deepEqual(await snapshot(),before);assert.equal(await journal.current(scope.tenantId,scope.spaceId),undefined,'Actual reservation remains uncertain');
    console.log(JSON.stringify({measurement:'atomic-partial-write-kill',table,timing,mask:rows[0].mask,expectedMask,backendPid:rows[0].pid,backendStart:rows[0].backend_start,workerPid:w.child.pid,nonce:w.nonce,owner:f.owner,instance:f.instance,externalRows:0,savedResponse:false}));
    const disconnect=await kill(w);const result=await pending;assert.ok(result===null||(result as {body?:{status?:string}}).body?.status!=='saved-here');assert.equal(acknowledged,false);
    const counts=await effects(c,0),after=await snapshot();assert.deepEqual(after,before);
    const caller=await spawn(),lookup=await request(caller,c,'lookup');assert.equal(lookup.status,200);assert.deepEqual(lookup.body,{schemaVersion:1,status:'absent-safe',key:c.key,replayAllowed:false,nextAction:'inspect-current-authority'});positives.read++;
    assert.deepEqual((await journal.state(scope.tenantId,scope.spaceId))!.anchor,anchor);assert.deepEqual(await snapshot(),before);await denied(()=>repo().read(scope,{class:'knowledge',id:c.targetId,revision:1,witness:'sha256:'+'0'.repeat(64)}),['STALE_REVISION','CONTENT_UNAVAILABLE']);const callerDisconnect=await kill(caller);
    const recordStart=performance.now();
    record={table,timing,expectedMask,commandKey:c.key,targetId:c.targetId,fixture:{owner:f.owner,instance:f.instance,root:process.env['STORAGE_FIXTURE_ROOT']!,controllerRole:f.roles.controller,authorityRole:f.roles.authority},worker:{pid:w.child.pid!,nonce:w.nonce,identity:w.identity,application:w.application},lock:{backendPid:rows[0].pid,backendStart:new Date(rows[0].backend_start).toISOString(),application:rows[0].application_name,role:rows[0].usename,mask:rows[0].mask,blockers:rows[0].blockers,blockerPid:blocker.pid,blockerStart:new Date(blocker.backend_start).toISOString()},disconnect,caller:callerDisconnect,savedResponse:acknowledged,requestStatus:result===null?null:String((result as {body:{status:string}}).body.status),beforeDigest:atomicDigest(before),afterDigest:atomicDigest(after),finalDigest:atomicDigest(await snapshot()),effects:counts,anchorBefore:atomicDigest(anchor),anchorAfter:atomicDigest((await journal.state(scope.tenantId,scope.spaceId))!.anchor),lookup,startedMs,finishedMs:0,observationIntervals};
    observationIntervals.push({startedMs:recordStart,finishedMs:performance.now()});return record;
   }finally{
    if(w)await kill(w);await pending?.catch(()=>{});await observer.query('ROLLBACK');observer.release();await f.admin.query('DROP TRIGGER atomic_phase_probe ON fabric.'+table+';DROP FUNCTION fabric.atomic_phase_probe()');
    if(record)record.finishedMs=performance.now();
   }
  };
  const assertFinal=async()=>{assert.equal(await installedOwnerSnapshot(f.admin),ownerBefore);assert.deepEqual((await f.admin.query('SELECT row_to_json(x) AS r FROM fabric.model_resource_bindings x ORDER BY row_to_json(x)::text')).rows,resourcesBefore);const rows=JSON.stringify(await snapshot());assert.equal(rows.includes(value),false);assert.equal(rows.includes(dataKey.toString('hex')),false);assert.equal(rows.includes(digestKey.toString('hex')),false);positives.owner++;};
  return {f,scope,root,journal,task,source,makeSource,fresh,repo,serve,request,path,normal,snapshot,effects,ref,content,denied,blocked,until,spawn,kill,phase,positives,violations,assertFinal,close};
 }catch(e){await close();throw e;}
}
export type AtomicVerificationFixture=Awaited<ReturnType<typeof createAtomicVerificationFixture>>;
