/** TEST-ONLY original-owner specimen. File commits do not qualify PostgreSQL. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LocalOriginalSettlement,LocalQuiescenceSchema,type LocalSettlementPorts,type LocalOriginalRead,type LocalQuiescence} from '../../src/local-original-settlement.js';
import {bindingDigest,approvalDigest,effectKey,revalidateScope,type VerifiedScope,effectSchema} from '../../src/owners.js';
import {OriginalSnapshotSchema} from '../../src/schemas.js';
import {createIdentityScopeVerifier} from '../../../g1-identity/src/current-authority.js';
import {verifyAccessToken} from '../../../g1-identity/src/token-verifier.js';
import {exactAdmissionBinding} from '../../src/admission.js';
import {requireIntent} from '../../src/intent.js';
import {ledgerRead,ledgerSave,type LocalOriginalRecord} from './settlement-ledger.js';
import {SettlementControl} from './settlement-control.js';
import {api} from './owned-capsule.js';
const root=process.argv[2]!,config=()=>JSON.parse(readFileSync(join(root,'config.json'),'utf8'));
const identity=createIdentityScopeVerifier({now:()=>Date.now()/1000,verifyToken:raw=>{const c=config();return verifyAccessToken(raw,{issuer:c.issuer,jwksUrl:c.issuer+'/jwks',apiAudience:'runtime-fixture',now:()=>Date.now()/1000});},lookupAuthority:async(session,ref)=>{const c=config(),a=c.authority;return session.issuer===c.issuer&&session.subject==='synthetic-member'&&session.sessionId==='synthetic-session'&&!c.tokenRevoked&&ref.tenantId===a.tenantId&&ref.spaceId===a.spaceId?{...a}:null;}});
let tail=Promise.resolve();const controls=new Map<string,SettlementControl>();
async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{const before=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await before;try{return await fn();}finally{release();}}
function read(id:string){assert.match(id,/^[0-9a-f-]{36}$/);return ledgerRead(root,id);}
function save(row:LocalOriginalRecord){ledgerSave(root,row.effect.binding.operationId,row);}
async function authorize(scope:VerifiedScope,row:LocalOriginalRecord){
 await revalidateScope(scope);const c=config(),binding=row.effect.binding;
 assert.equal(scope.actorId,binding.actorId);assert.equal(scope.tenantId,binding.run.task.tenantId);assert.equal(scope.spaceId,binding.run.task.spaceId);
 for(const grant of ['task:read','task:write','source:read'])assert.ok(scope.grants.includes(grant),'CURRENT_TASK_SOURCE_PERMISSION_REQUIRED');
 assert.equal(c.sourceAvailable,true);assert.ok(c.sourceAudience.includes(scope.actorId));assert.equal(c.lookupAllowed,true);
 assert.equal(bindingDigest(row.admission),c.bindings[binding.operationId].admissionDigest);assert.equal(row.admission.preflight.envelope.intent,'act');
 const b=exactAdmissionBinding(row.admission),approval=JSON.parse(readFileSync(join(dirname(root),'approvals',b.taskId+'.json'),'utf8'));
 assert.equal(approval.actorId,scope.actorId);assert.equal(approval.bindingDigest,approvalDigest(b));assert.equal(approval.preflightDigest,row.admission.preflightDigest);assert.equal(row.approval.bindingDigest,approval.bindingDigest);assert.equal(row.approval.consumed,true);
 assert.equal(bindingDigest(binding),c.bindings[binding.operationId].effectDigest);assert.equal(row.historicalDigest,c.bindings[binding.operationId].historicalDigest);
 assert.equal(bindingDigest(row.run.binding),bindingDigest(binding.run));assert.equal(row.task.taskId,binding.run.task.taskId);
 assert.equal(row.lease.leaseId,binding.executionLeaseId);assert.equal(row.session.sessionId,binding.sessionId);assert.equal(row.approval.approvalId,binding.approvalId);
 assert.equal(bindingDigest(row.resource.generation),bindingDigest(binding.generation));assert.equal(bindingDigest(row.session.generation),bindingDigest(binding.generation));
}
function snapshot(row:LocalOriginalRecord,path:NonNullable<LocalOriginalRecord['snapshot']>['path'],observedAt=new Date().toISOString()){return OriginalSnapshotSchema.parse({path,operationId:row.effect.binding.operationId,originalBindingDigest:bindingDigest(row.effect.binding),actorId:row.effect.binding.actorId,runState:row.run.state,runRevision:row.run.revision,generation:row.run.generation,leaseExpiresAt:row.lease.expiresAt,effectExpiresAt:row.effect.binding.expiresAt,leaseRevoked:row.lease.revoked,stopped:row.stopReceipt!==null,observedAt});}
function requireCurrentSnapshot(row:LocalOriginalRecord){
 assert.ok(row.snapshot);let expected=snapshot(row,row.snapshot.path,row.snapshot.observedAt);
 // Settlement keeps the historical snapshot and increments only Run revision.
 // Permit exactly that committed revision, vouched by the original stable key;
 // an uncommitted or arbitrary revision cannot make an old snapshot current.
 if(row.effect.state==='confirmed'&&row.run.revision===row.snapshot.runRevision+1){
  const command=row.commands[effectKey(row.effect.binding.operationId,'f06-original-settlement')];
  assert.ok(command&&command.operationId===row.effect.binding.operationId&&command.receiptDigest===row.effect.receiptDigest&&command.dispatch===false);
  assert.equal(Object.keys(row.commands).length,1);assert.deepEqual(row.outbox,[command]);expected={...expected,runRevision:row.snapshot.runRevision};
 }
 assert.equal(bindingDigest(row.snapshot),bindingDigest(expected),'CURRENT_ORIGINAL_SNAPSHOT_REQUIRED');
}
async function actualQuiescence(scope:VerifiedScope,o:LocalOriginalRead):Promise<LocalQuiescence>{
 await authorize(scope,read(o.effect.binding.operationId));const row=read(o.effect.binding.operationId);assert.ok(row.snapshot);
 requireCurrentSnapshot(row);
 assert.equal(bindingDigest(row.snapshot),bindingDigest(o.snapshot));assert.equal(row.resource.instanceId,o.instanceId);assert.equal(row.resource.bootId,o.bootId);
 assert.ok(row.process?.terminated&&row.process.parentExited&&row.process.childExited&&row.process.streamsComplete,'ACTUAL_PROCESS_STREAM_ACK_REQUIRED');
 const {census}=await api('census'),rows=census();assert.ok(!rows.some((p:any)=>p.pid===row.process!.parentPid||p.pid===row.process!.childPid));
 const c=config(),response=await fetch(c.target+'/snapshot',{headers:{authorization:c.targetAdmin},signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);
 const target=await response.json() as any;assert.equal(target.streams[o.effect.binding.operationId]??0,0,'ACTUAL_TARGET_STREAM_CLOSURE_REQUIRED');
 const after=read(o.effect.binding.operationId);await authorize(scope,after);requireCurrentSnapshot(after);assert.equal(bindingDigest(after),bindingDigest(row),'ORIGINAL_CHANGED_DURING_QUIESCENCE');
 return LocalQuiescenceSchema.parse({operationId:o.effect.binding.operationId,originalBindingDigest:bindingDigest(o.effect.binding),snapshotDigest:bindingDigest(o.snapshot),
  instanceId:o.instanceId,bootId:o.bootId,resourceId:o.effect.binding.resourceId,generation:o.snapshot.generation,observedAt:new Date().toISOString(),
  descendantsQuiescent:true,streamsClosed:true,digest:bindingDigest(row.process)});
}
const ports:LocalSettlementPorts={now:Date.now,exclusive:async(_s,_key,fn)=>exclusive(fn),
 read:async(_scope,id)=>{const row=read(id),c=config(),b=c.bindings[id];assert.ok(row.snapshot&&row.dispatchFenced&&row.resource.held);requireCurrentSnapshot(row);return {effect:row.effect,snapshot:row.snapshot,instanceId:row.resource.instanceId,bootId:row.resource.bootId,connectorDigest:b.connectorDigest,trustDigest:b.trustDigest,lookupPolicyDigest:b.lookupPolicyDigest,historicalDigest:row.historicalDigest,sessionExpiresAt:c.authority.sessionExpiresAt,held:true,dispatchFenced:true};},
 authorize:async(scope,o)=>authorize(scope,read(o.effect.binding.operationId)),
 lookupCommand:async(_scope,key,digest)=>{const matches=config().bindings;for(const id of Object.keys(matches)){const r=read(id).commands[key];if(r){assert.equal(r.payloadDigest,digest);return r;}}return null;},
 statusGet:async(scope,o)=>{await authorize(scope,read(o.effect.binding.operationId));const c=config(),b=c.bindings[o.effect.binding.operationId];const response=await fetch(c.target+'/status/'+o.effect.binding.operationId+'?binding='+encodeURIComponent(bindingDigest(o.effect.binding)),{headers:{authorization:b.readCredential},redirect:'error',signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);return await response.json() as any;},
 quiescence:async(scope,o)=>{
  const proof=await actualQuiescence(scope,o),fault=config().settlementFaults?.[o.effect.binding.operationId];
  // TEST-ONLY trusted owner fault injection from the nonce-owned config. Public
  // request bodies cannot install evidence, keys, ports or this configuration.
  if(fault?.missingProof)return null as unknown as LocalQuiescence;
  return {...proof,...fault?.proof};
 },
 verifyQuiescence:async(scope,o,proof)=>{
  const actual=await actualQuiescence(scope,o),{observedAt:_actualTime,...current}=actual,{observedAt:_proofTime,...expected}=proof;
  assert.equal(bindingDigest(current),bindingDigest(expected),'QUIESCENCE_PROOF_CHANGED');
 },
 commit:async(scope,o,next,evidence,receipt)=>{const row=read(o.effect.binding.operationId);await authorize(scope,row);assert.equal(bindingDigest(row.snapshot),bindingDigest(o.snapshot));assert.equal(bindingDigest(row.effect),bindingDigest(o.effect));assert.ok(row.dispatchFenced&&row.resource.held);if(row.effect.state==='unknown')row.events.push({phase:'f06-original-settlement-enter',detail:{from:'unknown',to:'reconciling'}});row.events.push({phase:'f06-original-settlement-confirmed',detail:{receiptDigest:receipt.receiptDigest,evidenceDigest:bindingDigest(evidence)}});row.effect=next;row.run={...row.run,revision:row.run.revision+1};row.commands[receipt.key]=receipt;row.outbox.push(receipt);row.evidence=evidence;await revalidateScope(scope);save(row);}
};
const settlement=new LocalOriginalSettlement(ports);
async function handle(scope:VerifiedScope,body:any){
 const id=body.operationId,row=read(id);await authorize(scope,row);
 if(body.action==='status')return row;
 if(body.action==='recover')return settlement.recover(scope,id);
 if(body.action==='ordinary'){
  assert.ok(['running','reconciling','paused'].includes(row.run.state)&&!row.dispatchFenced&&!row.lease.revoked&&Date.parse(row.lease.expiresAt)>Date.now()&&Date.parse(row.effect.binding.expiresAt)>Date.now(),'ORDINARY_RECONCILIATION_DENIED');throw new Error('USE_EXACT_ORIGINAL_OWNER');
 }
 if(body.action==='dispatch')return exclusive(async()=>{
  const fresh=read(id);requireIntent(scope,fresh.admission.preflight.envelope,'bounded-write',config().intersection);assert.equal(fresh.effect.state,'prepared','ORIGINAL_CLAIM_CONSUMED');assert.equal(fresh.dispatchFenced,false);assert.ok(Date.parse(fresh.lease.expiresAt)>Date.now()&&Date.parse(fresh.effect.binding.expiresAt)>Date.now());
  fresh.effect=effectSchema.parse({...fresh.effect,state:'unknown',nextAction:'lookup-original-operation'});fresh.run={...fresh.run,state:'reconciling'};fresh.events.push({phase:'fixture-claim-committed',detail:{acknowledged:!body.loseClaimAck}});save(fresh);
  // A lost claim-COMMIT ACK never constructs a launch/send permit.
  if(body.loseClaimAck)return {state:'unknown',sendAllowed:false,claimAck:'lost',fixtureCommit:true};
  const c=config(),b=c.bindings[id],control=new SettlementControl();controls.set(id,control);
  await control.start({endpoint:c.target,credential:b.writeCredential,request:b.request,remainingMs:Math.min(30_000,Date.parse(fresh.lease.expiresAt)-Date.now(),Date.parse(fresh.effect.binding.expiresAt)-Date.now())});
  fresh.process=control.observe();save(fresh);let sendTimer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([control.send,new Promise((_,reject)=>{sendTimer=setTimeout(()=>reject(new Error('ACTUAL_SEND_ACK_TIMEOUT')),5000);})]);}finally{if(sendTimer)clearTimeout(sendTimer);}fresh.sendOutcome='ack-lost';fresh.process=control.observe();save(fresh);return {state:'unknown',sendAck:'lost',process:fresh.process};
 });
 if(body.action==='stop'||body.action==='expire')return exclusive(async()=>{
  const fresh=read(id);if(body.action==='stop'){
   assert.ok(body.kind==='stop-run'||body.kind==='stop-task');const key=body.key??randomUUID();fresh.run={...fresh.run,state:'cancelling',revision:fresh.run.revision+1,generation:{...fresh.run.generation,worker:fresh.run.generation.worker+1,cancellation:fresh.run.generation.cancellation+(body.kind==='stop-task'?1:0)}};
   if(body.kind==='stop-task')fresh.task={...fresh.task,retries:'blocked',cancellationGeneration:fresh.task.cancellationGeneration+1};fresh.lease={...fresh.lease,revoked:true};fresh.session={...fresh.session,state:'interrupted'};fresh.stopReceipt={key,kind:body.kind,acknowledged:true};fresh.events.push({phase:'fixture-stop-acknowledged',detail:fresh.stopReceipt});
  }else assert.ok(Date.parse(fresh.lease.expiresAt)<=Date.now()||Date.parse(fresh.effect.binding.expiresAt)<=Date.now(),'ORIGINAL_EXPIRY_NOT_REACHED');
  fresh.dispatchFenced=true;const c=config(),fenced=await fetch(c.target+'/fence',{method:'POST',headers:{authorization:c.targetAdmin},body:JSON.stringify({operationId:id}),signal:AbortSignal.timeout(2000)});assert.equal(fenced.status,200);const control=controls.get(id);if(control)fresh.process=await control.stop();
  if(body.action==='expire')fresh.session={...fresh.session,state:'interrupted'};
  fresh.snapshot=snapshot(fresh,body.path);save(fresh);return fresh;
 });
 throw new Error('UNSUPPORTED');
}
const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');try{assert.equal(req.method,'POST');assert.equal(req.url,'/original');let raw='';for await(const b of req){raw+=b;if(raw.length>8192)throw new Error('TOO_LARGE');}const c=config(),scope=await identity.verify({tenantId:c.authority.tenantId,spaceId:c.authority.spaceId,sessionCredential:String(req.headers.authorization??'').replace(/^Bearer /,'')});res.end(JSON.stringify(await handle(scope,JSON.parse(raw))));}catch(e){res.statusCode=403;res.end(JSON.stringify({code:e instanceof Error?e.message:'REFUSED',replayAllowed:false,resourceHeld:true}));}});
server.listen(0,'127.0.0.1',()=>process.send?.({pid:process.pid,port:(server.address() as {port:number}).port}));
process.on('message',async()=>{for(const [id,control]of controls){const row=read(id);row.process=await control.stop();save(row);}server.closeAllConnections();server.close(()=>process.disconnect());});
