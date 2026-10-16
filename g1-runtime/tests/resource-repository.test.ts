import assert from 'node:assert/strict';
import {fork,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerCases} from './helpers/register-cases.js';
import {leaseQueueCases} from './lease-queue.test.js';
import {fixtureId as id,fixtureScope,type ClientCommand} from './helpers/resource-repository-client.js';
import {ResourceRepository,ResourceRepositoryError,type ResourceTicket} from '../src/resource-repository.js';
import {QueueRequestSchema} from '../src/schemas.js';
import {bindingDigest,createScopeVerifier} from '../src/owners.js';
import type {QueueRequest} from '../src/contracts.js';
import {SQLiteResourceStore} from './helpers/resource-repository-sqlite.js';
const epoch=Date.parse('2026-10-16T00:00:00.000Z');
function request(n:number,resources=[id(100),id(101)]):QueueRequest{return QueueRequestSchema.parse({schemaVersion:1,commandId:id(1000+n),idempotencyKey:id(2000+n),binding:{tenantId:id(1),spaceId:id(2),taskId:id(3000+n),runId:id(4000+n),assignmentId:id(5),storageBindingId:id(6)},expectedRevision:0,expiresAt:new Date(epoch+60_000).toISOString(),resources:[...resources].sort().map(resourceId=>({resourceId,mode:'write'})),envelopeDigest:bindingDigest('envelope-'+n)});}
interface Reply {ok:boolean;code?:string;message?:string;result?:any;barrier?:string}
async function spawned():Promise<{child:ChildProcess;send:(command:ClientCommand)=>Promise<Reply>;next:()=>Promise<Reply>;exit:Promise<unknown>;raw:{stdout:string;stderr:string}}>{
 const env={...process.env};delete env['NODE_TEST_CONTEXT'];
 const child=fork(fileURLToPath(new URL('./helpers/resource-repository-client.js',import.meta.url)),['--resource-client'],{env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});
 const raw={stdout:'',stderr:''};child.stdout!.on('data',b=>{raw.stdout+=String(b);});child.stderr!.on('data',b=>{raw.stderr+=String(b);});
 const queue:Reply[]=[],pending:{resolve:(r:Reply)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}[]=[];
 child.on('message',m=>{const p=pending.shift();if(p){clearTimeout(p.timer);p.resolve(m as Reply);}else queue.push(m as Reply);});
 const next=():Promise<Reply>=>queue.length?Promise.resolve(queue.shift()!):new Promise((resolve,reject)=>{const timer=setTimeout(()=>{reject(new Error('Client timeout '+raw.stderr));},8000);pending.push({resolve,reject,timer});});
 const exit=once(child,'exit');assert.deepEqual(await next(),{ready:true});
 return {child,raw,next,exit,send:command=>{child.send(command);return next();}};
}
function fixture(name:string):{path:string;dir:string}{
 const base=process.env['RUNTIME_OBSERVATIONS']?join(dirname(process.env['RUNTIME_OBSERVATIONS']),'repository-fixtures'):tmpdir();mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,name+'-'));const path=join(dir,'queue.sqlite');const db=new SQLiteResourceStore(path);db.close();return {path,dir};
}
const births:number[]=[];
async function call(path:string,op:ClientCommand['op'],extra:Partial<ClientCommand>={}):Promise<Reply>{const c=await spawned();births.push(c.child.pid!);const r=await c.send({path,op,now:epoch,...extra});await c.exit;assert.equal(c.child.exitCode,0,c.raw.stderr);return r;}
async function ok(path:string,op:ClientCommand['op'],extra:Partial<ClientCommand>={}):Promise<any>{const r=await call(path,op,extra);assert.equal(r.ok,true,JSON.stringify(r));return r.result;}
function complete(o:any):void{
 assert.deepEqual(o.foreignKeys,[]);assert.equal(o.journalMode.journal_mode,'wal');
 for(const t of o.tickets as ResourceTicket[]){const rows=o.owners.filter((r:any)=>r.ticket===t.ticketId);assert.equal(rows.length,t.state==='owned'?t.request.resources.length:0,'No partial or terminal ownership');if(t.state==='owned')assert.deepEqual(rows.map((r:any)=>r.resource).sort(),t.request.resources.map(r=>r.resourceId));}
 for(const a of o.owners)for(const b of o.owners)if(a.ticket!==b.ticket&&a.tenant===b.tenant&&a.space===b.space&&a.resource===b.resource)assert.equal(a.mode==='write'||b.mode==='write',false,'No conflicting ownership');
}
function observations(dir:string,detail:Record<string,unknown>){return {'queue-state':{dir,...detail},'independent-clients':{pids:[...new Set(births)],count:new Set(births).size,bootstrapCensusRequired:!!process.env['RUNTIME_OWNER_NONCE']}};}
async function atomic(){
 const {path,dir}=fixture('atomic'),a=request(1),b=request(2,[id(101),id(100)]);
 // Both independently launched clients are ready before either receives its request.
 for(let race=0;race<6;race++){
  const left=request(10+race*2),right=request(11+race*2,[id(101),id(100)]);
  const clients=await Promise.all([spawned(),spawned()]);births.push(...clients.map(c=>c.child.pid!));
  const replies=await Promise.all(clients.map((c,i)=>c.send({path,op:'admit',now:epoch,request:i===0?left:right})));await Promise.all(clients.map(c=>c.exit));
  for(const r of replies)assert.equal(r.ok,true,JSON.stringify(r));
  const tickets=replies.map(r=>r.result as ResourceTicket);assert.deepEqual(tickets.map(t=>t.state).sort(),['owned','waiting']);
  const owner=tickets.find(t=>t.state==='owned')!,wait=tickets.find(t=>t.state==='waiting')!;assert.equal(wait.ownerTaskId,owner.request.binding.taskId);assert.match(wait.reason,/conflict/);assert.match(wait.resolver,/Wait/);assert.equal(wait.charges,'unknown');
  let observed=await ok(path,'observe');complete(observed);assert.equal(observed.owners.length,2);
  assert.equal((await call(path,'release',{key:owner.request.idempotencyKey})).code,'release-proof-required');
  await ok(path,'release',{key:owner.request.idempotencyKey,proof:true});const visible=await ok(path,'lookup',{key:wait.request.idempotencyKey});assert.equal(visible.state,'waiting');assert.equal(visible.ownerTaskId,null);assert.equal(visible.reason,'resources-eligible-awaiting-poll');const successor=await ok(path,'poll',{key:wait.request.idempotencyKey});assert.equal(successor.state,'owned');
  await ok(path,'release',{key:wait.request.idempotencyKey,proof:true});observed=await ok(path,'observe');complete(observed);assert.equal(observed.owners.length,0);
 }
 // An unsorted wire payload is rejected; callers normalize the B+A set first.
 const wire=JSON.parse(JSON.stringify(b));wire.resources.reverse();assert.equal((await call(path,'admit',{request:wire})).ok,false);
 assert.equal((await ok(path,'admit',{request:a})).state,'owned');complete(await ok(path,'observe'));
 return observations(dir,{races:6,allOrNothing:true,visibleOwnerReason:true,noExecutorOrVMClaim:true});
}
async function scoped(){
 const {path,dir}=fixture('scope'),a=request(1);const original=await ok(path,'admit',{request:a});
 const before=await ok(path,'observe');
 assert.equal((await call(path,'admit',{request:a,scope:{grants:[]}})).code,'forbidden');
 assert.equal((await call(path,'lookup',{key:a.idempotencyKey,scope:{grants:[]}})).code,'forbidden');
 for(const field of ['tenantId','spaceId','actorId','payerId']){
  const scope={[field]:id(900)};
  for(const op of ['lookup','cancel','release','poll'] as const)assert.equal((await call(path,op,{key:a.idempotencyKey,scope,proof:true})).code,'not-found');
 }
 for(const mutate of [(r:any)=>r.binding.spaceId=id(900),(r:any)=>r.binding.tenantId=id(900),(r:any)=>r.binding.taskId=id(900),(r:any)=>r.binding.assignmentId=id(900),(r:any)=>r.binding.storageBindingId=id(900),(r:any)=>r.resources=[{resourceId:id(900),mode:'write'}],(r:any)=>r.envelopeDigest=bindingDigest('forged'),(r:any)=>r.commandId=id(900)]){
  const forged=JSON.parse(JSON.stringify(a));mutate(forged);assert.equal((await call(path,'admit',{request:forged})).code,'binding-conflict');
 }
 for(const field of ['owner','payerId']){const forged={...a,[field]:id(900)};assert.equal((await call(path,'admit',{request:forged})).ok,false);}
 assert.deepEqual(await ok(path,'observe'),before,'Forged operations leave original store unchanged');
 const foreign=request(90);await ok(path,'admit',{request:foreign});const beforeForeignExpiry=await ok(path,'observe');assert.equal((await call(path,'lookup',{key:foreign.idempotencyKey,scope:{spaceId:id(900)},now:epoch+60_000})).code,'not-found');assert.deepEqual(await ok(path,'observe'),beforeForeignExpiry,'Foreign lookup cannot expire another scope ticket');
 assert.deepEqual(await ok(path,'admit',{request:a}),original,'Exact original key resumes after process and tab selection recreation');
 const rekey={...a,idempotencyKey:id(990)};assert.equal((await call(path,'admit',{request:rekey})).code,'binding-conflict');assert.equal((await call(path,'admit',{request:rekey,scope:{payerId:id(900)}})).code,'binding-conflict');
 // Actual foundation provenance and current-authority checks precede all storage IO.
 let reads=0;const repository=new ResourceRepository({async transaction(){reads++;throw new Error('unreachable');}},{async require(){throw new Error('unreachable');}});
 const scope=await fixtureScope();await assert.rejects(repository.lookup({...scope} as typeof scope,a.idempotencyKey));assert.equal(reads,0);
 let revoked=false;const verifier=createScopeVerifier(async()=>revoked?null:{tenantId:id(1),spaceId:id(2),actorId:id(3),payerId:id(4),authorityRevision:1,membershipRevision:1,grants:['task:read','task:write'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active'});const issued=await verifier.verify({tenantId:id(1),spaceId:id(2),sessionCredential:'synthetic'});revoked=true;await assert.rejects(repository.lookup(issued,a.idempotencyKey));assert.equal(reads,0);
 // A real transaction waiting at precommit must revalidate original authority.
 const stale=fixture('current-authority');revoked=false;
 const live=await verifier.verify({tenantId:id(1),spaceId:id(2),sessionCredential:'synthetic'});
 const staleStore=new SQLiteResourceStore(stale.path,{beforeCommit:async()=>{revoked=true;}});
 const staleRepository=new ResourceRepository(staleStore,{async require(){throw new Error('No executor');}},()=>epoch);
 await assert.rejects(staleRepository.admit(live,request(70)));staleStore.close();assert.equal((await ok(stale.path,'observe')).tickets.length,0,'Authority loss rolls back ticket and owner set');
 // Crossing exact expiry while waiting cannot commit a newly acquired set.
 let time=epoch;const expiring=fixture('expiry-precommit');const expiryStore=new SQLiteResourceStore(expiring.path,{beforeCommit:async()=>{time=epoch+60_000;}});
 const expiryRepository=new ResourceRepository(expiryStore,{async require(){throw new Error('No executor');}},()=>time);
 await assert.rejects(expiryRepository.admit(await fixtureScope(),request(71)),(e:unknown)=>e instanceof ResourceRepositoryError&&e.code==='expired');expiryStore.close();assert.equal((await ok(expiring.path,'observe')).tickets.length,0);
 complete(await ok(path,'observe'));return observations(dir,{currentAuthorityAndExpiryAfterWait:true,forgedScopeAndBindingsDenied:true,originalScopePreserved:true,authBeforeStorage:true});
}
async function cancellation(){
 const {path,dir}=fixture('cancel'),a=request(1),b=request(2),c=request(3);
 await ok(path,'admit',{request:a});await ok(path,'admit',{request:b});await ok(path,'admit',{request:c});
 // Cancellation wins: duplicate cancellation and later polling are terminal.
 assert.equal((await ok(path,'cancel',{key:b.idempotencyKey})).state,'cancelled');assert.equal((await ok(path,'cancel',{key:b.idempotencyKey})).state,'cancelled');await ok(path,'release',{key:a.idempotencyKey,proof:true});assert.equal((await ok(path,'poll',{key:b.idempotencyKey})).state,'cancelled');assert.equal((await ok(path,'poll',{key:c.idempotencyKey})).state,'owned');await ok(path,'release',{key:c.idempotencyKey,proof:true});
 // Acquisition wins: cancellation remains held and cannot claim pre-execution cancellation.
 const d=request(4);await ok(path,'admit',{request:d});const held=await ok(path,'cancel',{key:d.idempotencyKey});assert.equal(held.state,'owned');assert.equal(held.cancelRequested,true);assert.match(held.reason,/held-until-safe-release/);assert.equal((await ok(path,'cancel',{key:d.idempotencyKey})).state,'owned');
 const e=request(5);await ok(path,'admit',{request:e});assert.equal((await ok(path,'poll',{key:e.idempotencyKey,now:epoch+60_000})).state,'expired');assert.equal((await ok(path,'lookup',{key:d.idempotencyKey,now:epoch+60_000})).state,'owned','Owned expiry cannot fabricate quiescence');
 await ok(path,'release',{key:d.idempotencyKey,proof:true,now:epoch+60_001});assert.equal((await ok(path,'poll',{key:e.idempotencyKey,now:epoch+60_001})).state,'expired');
 assert.equal((await call(path,'admit',{request:request(6),now:epoch+60_000})).code,'expired');
 // Competing OS clients exercise the transaction's two legal linearizations.
 for(let i=0;i<6;i++){
  const first=request(20+i*3),waiter=request(21+i*3),last=request(22+i*3);
  await ok(path,'admit',{request:first});await ok(path,'admit',{request:waiter});await ok(path,'admit',{request:last});await ok(path,'release',{key:first.idempotencyKey,proof:true});
  const pair=await Promise.all([spawned(),spawned()]);births.push(...pair.map(p=>p.child.pid!));
  const raced=await Promise.all(pair.map((p,j)=>p.send({path,op:j===0?'poll':'cancel',key:waiter.idempotencyKey,now:epoch})));await Promise.all(pair.map(p=>p.exit));for(const r of raced)assert.equal(r.ok,true,JSON.stringify(r));
  const durable=await ok(path,'lookup',{key:waiter.idempotencyKey});
  if(durable.state==='owned'){assert.equal(durable.cancelRequested,true);assert.equal((await ok(path,'poll',{key:last.idempotencyKey})).state,'waiting');await ok(path,'release',{key:waiter.idempotencyKey,proof:true});}
  else{assert.equal(durable.state,'cancelled');assert.equal((await ok(path,'poll',{key:waiter.idempotencyKey})).state,'cancelled');}
  assert.equal((await ok(path,'poll',{key:last.idempotencyKey})).state,'owned');await ok(path,'release',{key:last.idempotencyKey,proof:true});complete(await ok(path,'observe'));
 }
 complete(await ok(path,'observe'));return observations(dir,{races:6,cancelBeforeAcquireTerminal:true,acquireBeforeCancelHeld:true,exactExpiryTerminal:true,freshProcessReopen:true});
}
async function killCurrentOwned(child:ChildProcess):Promise<void>{
 const source=process.env['RUNTIME_SOURCE_ROOT'],nonce=process.env['RUNTIME_OWNER_NONCE'];assert.ok(source&&nonce,'Independent controller process-census gate required');
 const {census,signalOwned}=await import(pathToFileURL(join(source,'scripts/census.mjs')).href);
 const current=census().find((p:{pid:number})=>p.pid===child.pid);assert.ok(current,'Current owned client remains at barrier');assert.equal(current.ppid,process.pid);assert.ok(current.command.includes(nonce));
 const owned={...current,nonce};signalOwned(owned,[owned],'SIGKILL');
}
async function crashAt(path:string,req:QueueRequest,barrier:'before'|'after'):Promise<number>{
 const c=await spawned();births.push(c.child.pid!);const m=await c.send({path,op:'admit',request:req,now:epoch,barrier});assert.equal(m.barrier,barrier);const pid=c.child.pid!;await killCurrentOwned(c.child);await c.exit;assert.equal(c.child.signalCode,'SIGKILL');return pid;
}
async function faults(){
 const {path,dir}=fixture('faults');const a=request(1);const before=await ok(path,'observe');await crashAt(path,a,'before');assert.deepEqual(await ok(path,'observe'),before,'Killed precommit transaction rolls back entire ticket/set');assert.equal((await call(path,'lookup',{key:a.idempotencyKey})).code,'not-found');
 const b=request(2);await crashAt(path,b,'after');const committed=await ok(path,'lookup',{key:b.idempotencyKey});assert.equal(committed.state,'owned');assert.deepEqual(await ok(path,'admit',{request:b}),committed,'Duplicate original cannot allocate a second set');complete(await ok(path,'observe'));
 await ok(path,'release',{key:b.idempotencyKey,proof:true});
 const c=request(3);const unknown=await call(path,'admit',{request:c,unknownAck:true});assert.equal(unknown.code,'commit-unknown');assert.equal((await ok(path,'lookup',{key:c.idempotencyKey})).state,'owned');await ok(path,'release',{key:c.idempotencyKey,proof:true});
 const blocker=await spawned();births.push(blocker.child.pid!);const d=request(4);assert.equal((await blocker.send({path,op:'admit',request:d,now:epoch,barrier:'before'})).barrier,'before');
 const e=request(5);const busy=await call(path,'admit',{request:e});assert.equal(busy.code,'store-unavailable','Real SQLITE_BUSY refuses without mutation retry');await killCurrentOwned(blocker.child);await blocker.exit;
 assert.equal((await call(path,'lookup',{key:d.idempotencyKey})).code,'not-found');assert.equal((await call(path,'lookup',{key:e.idempotencyKey})).code,'not-found');
 const io=await call(path,'admit',{request:request(6),readOnly:true});assert.equal(io.code,'store-unavailable','Real read-only SQLite IO refuses');assert.equal((await call(path,'lookup',{key:request(6).idempotencyKey})).code,'not-found');
 const final=await ok(path,'observe');complete(final);assert.equal(final.owners.length,0);writeFileSync(join(dir,'fault-observer.json'),JSON.stringify(final)+'\n');
 return observations(dir,{precommitSIGKILLRollback:true,postcommitSIGKILLDurable:true,ambiguousAckOriginalKeyOnly:true,realBusyAndReadOnlyIO:true,noRetryOrPartialOwner:true});
}
registerCases({'Q00/atomic-ownership':atomic,'Q02/repository':scoped,'Q07/repository':cancellation,'Q09/queue-commit':faults,...leaseQueueCases},['queue-state','independent-clients']);
