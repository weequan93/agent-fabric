import assert from 'node:assert/strict';
import {registerCases} from './helpers/register-cases.js';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync,type SpawnSyncReturns} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import * as S from '../src/schemas.js';
import * as C from '../src/contracts.js';
import * as O from '../src/owners.js';
import {createScopeVerifier as originalVerifier,assertVerifiedScope as originalAssert} from '../../g1-foundations/src/contracts.js';
import {TaskCallBindingSchema,CostCategorySchema} from '../../g1-model/src/schema.js';
import type {CurrentAuthority,VerifiedScope} from '../../g1-foundations/src/contracts.js';
import type {Decoder} from '../../g1-model/src/decoder.js';

const id=(n:number)=>'10000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const hash=(s:string)=>O.bindingDigest(s);
const when=(n:number)=>new Date(n).toISOString();
const epoch=Date.parse('2026-10-16T00:00:00.000Z');
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const generation=Object.freeze({cancellation:0,worker:1,resource:0});
const binding=S.BindingSchema.parse({tenantId:id(1),spaceId:id(2),taskId:id(3),runId:id(4),assignmentId:id(5),storageBindingId:id(6)});
const pin=S.DeploymentPinSchema.parse({sourceDigest:hash('source'),buildDigest:hash('build'),lockDigest:hash('lock'),checksDigest:hash('checks'),backend:'owned-fixture',backendVersion:'1',os:'fixture-macos',kernel:'observed-fixture-kernel',architecture:'arm64',imageDigest:hash('image'),topologyDigest:hash('topology'),workloadIdentityDigest:hash('identity'),mountsDigest:hash('mounts'),controlsDigest:hash('controls'),toolsDigest:hash('tools'),browserVersion:null,modelProfileDigest:null,runtimeGeneration:1,policyGeneration:0});
const registry:readonly C.RegistryEntry[]=Object.freeze([
 ...(['shell','sdk','mcp','egress','filesystem'] as const).map(path=>({rowId:path+'/fixed-read',path,effectOrControl:'fixed-read',backend:pin.backend,backendVersion:pin.backendVersion})),
 ...(['browser','gui'] as const).map(path=>({rowId:path+'/sensitive',path,effectOrControl:'sensitive-input',backend:pin.backend,backendVersion:pin.backendVersion})),
 {rowId:'runtime/queue',path:'runtime',effectOrControl:'single-assignment-queue',backend:pin.backend,backendVersion:pin.backendVersion},
 {rowId:'service/read',path:'service',effectOrControl:'read',backend:pin.backend,backendVersion:pin.backendVersion},
 {rowId:'runtime/os-boundary',path:'runtime',effectOrControl:'hostile-process-containment',backend:pin.backend,backendVersion:pin.backendVersion}
]);
function rows():C.CapabilityRow[] {return registry.map(r=>S.CapabilityRowSchema.parse({...r,assurance:'owned-local-fixture',status:r.rowId.includes('sensitive')?'tested-refusal':r.rowId.includes('os-boundary')?'pending-external':'tested-support',supported:!r.rowId.includes('sensitive')&&!r.rowId.includes('os-boundary'),checkIds:['contract-fixture/'+r.rowId],evidenceRefs:r.rowId.includes('os-boundary')?[]:['fixture-observation/'+r.rowId],limitation:'Synthetic schema specimen only; no runtime containment qualification',activation:r.rowId.includes('sensitive')||r.rowId.includes('os-boundary')?'unsupported':'startup'}));}
function qualification():C.Qualification {return S.QualificationSchema.parse({schemaVersion:1,qualificationId:id(7),pin,assurance:'owned-local-fixture',verifiedAt:when(epoch-1000),expiresAt:when(epoch+60_000),verifierId:id(8),evidenceDigest:hash('independent-fixture-output'),rows:rows(),blockingFindingIds:[]});}
function lease(q=qualification()):C.RuntimeLease {return S.RuntimeLeaseSchema.parse({leaseId:id(9),binding,instanceId:id(10),generation,runtimeGeneration:1,policyGeneration:0,expiresAt:when(epoch+60_000),qualificationId:q.qualificationId});}
const artifact='owned contract bytes';
const args={artifactDigest:hash(artifact),precondition:{baseDigest:hash('base'),revision:1},value:17};
function effect():O.EffectBinding {return O.effectBindingSchema.parse({run:{task:{tenantId:id(1),spaceId:id(2),taskId:id(3)},runId:id(4),requirementsRevision:1,engineVersion:'1',behaviorVersion:'1',schemaVersion:1,environmentDigest:hash('environment'),dependencyLockDigest:pin.lockDigest},sessionId:id(11),operationId:id(12),target:'fixture://original-target',resourceId:id(13),action:'replace-exact',argsDigest:O.bindingDigest(args),artifactId:id(14),artifactVersion:1,artifactDigest:hash(artifact),actorId:id(15),policyRevision:1,audienceDigest:hash('audience'),approvalId:id(16),budgetReservationId:id(17),executionLeaseId:id(9),generation,expiresAt:when(epoch+50_000),effectClass:'external-write',mutationPath:'sdk',downstream:'idempotency-and-lookup'});}
function queue(resources=1):C.QueueRequest {return S.QueueRequestSchema.parse({schemaVersion:1,commandId:id(18),idempotencyKey:id(19),binding,expectedRevision:0,expiresAt:when(epoch+1000),resources:Array.from({length:resources},(_,i)=>({resourceId:id(100+i),mode:'write'})),envelopeDigest:hash('envelope')});}
/** Fixture-owned ports are test-only; no SQL, IdP, host or production signer.
 * Actual foundation scope provenance/currentness is exercised unchanged. */
async function fixture() {
 let now=epoch,revoked=false,revision=1;
 const authority:CurrentAuthority={tenantId:id(1),spaceId:id(2),actorId:id(15),payerId:id(20),authorityRevision:1,membershipRevision:1,grants:['task:read','task:write'],actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active'};
 const scopes=O.createScopeVerifier(async()=>revoked?null:{...authority,authorityRevision:revision});
 const scope=await scopes.verify({tenantId:id(1),spaceId:id(2),sessionCredential:'project-owned-synthetic-session'});
 const issued={qualification:new WeakSet<object>(),lease:new WeakSet<object>(),approval:new WeakMap<object,string>(),reconciliation:new WeakSet<object>(),observation:new WeakSet<object>()};
 const requireIssued=(set:WeakSet<object>,value:unknown)=>{if(!value||typeof value!=='object'||!set.has(value))throw new C.RuntimeContractError('UNISSUED_AUTHORITY');};
 let afterObservation=()=>{};
 const owners:C.ContractOwners={
  async requireQualification(q){requireIssued(issued.qualification,q);},async requireLease(l){requireIssued(issued.lease,l);},
  async requireApproval(a,s,e){O.assertVerifiedScope(s);if(!a||typeof a!=='object'||issued.approval.get(a)!==O.bindingDigest(e))throw new C.RuntimeContractError('UNISSUED_AUTHORITY');},
  async requireReconciliation(a,s){requireIssued(issued.reconciliation,a);await O.revalidateScope(s);},
  async requireObservation(o){requireIssued(issued.observation,o);afterObservation();}
 };
 const q=qualification(),l=lease(q),e=effect(),a=Object.freeze({approvalId:id(16),bindingDigest:O.bindingDigest(e)});
 issued.qualification.add(q);issued.lease.add(l);issued.approval.set(a,O.bindingDigest(e));
 return {scope,q,l,e,a,issued,owners,kernel:new C.ContractKernel(owners,()=>now),now:()=>now,setNow:(n:number)=>{now=n;},revoke:()=>{revoked=true;},advance:()=>{revision++;},afterObservation:(fn:()=>void)=>{afterObservation=fn;}};
}
function malformed<T>(decoder:Decoder<T>,valid:T,label:string):void {
 assert.ok(decoder.parse(valid),label+' positive');
 if(!valid||typeof valid!=='object'||Array.isArray(valid))return;
 const source=valid as Record<string,unknown>;
 for(const key of Object.keys(source)) {
  const missing={...source};delete missing[key];assert.throws(()=>decoder.parse(missing),label+' missing '+key);
  const getter={...source};let calls=0;Object.defineProperty(getter,key,{get(){calls++;throw new Error('Getter ran');},enumerable:true});
  assert.throws(()=>decoder.parse(getter),label+' getter '+key);assert.equal(calls,0);
 }
 assert.throws(()=>decoder.parse({...source,unknown:true}),label+' extra');
 assert.throws(()=>decoder.parse(Object.assign(Object.create({inherited:true}) as object,source)),label+' prototype');
 assert.throws(()=>decoder.parse({...source,[Symbol('hidden')]:true}),label+' symbol');
 const copy=decoder.parse(valid);assert.ok(Object.isFrozen(copy));assert.notEqual(copy,valid);
}
const cases:Record<string,()=>void|Promise<void>>={};
cases['C01']=async()=>{
 assert.equal(O.createScopeVerifier,originalVerifier);assert.equal(O.assertVerifiedScope,originalAssert);
 const f=await fixture();O.assertVerifiedScope(f.scope);await O.revalidateScope(f.scope);
 for(const bad of [{...f.scope},clone(f.scope),{},null])assert.throws(()=>O.assertVerifiedScope(bad));
 await f.kernel.qualification(f.q,pin,registry,['service/read'],'owned-local-fixture');
 await f.kernel.lease(f.l,binding,generation,f.q);
 await f.kernel.effect(f.scope,f.e,args,artifact,f.a,f.l,f.q,binding,generation);
 for(const copy of [{...f.q},clone(f.q)])await assert.rejects(()=>f.kernel.qualification(copy,pin,registry,['service/read'],'owned-local-fixture'),{code:'UNISSUED_AUTHORITY'});
 for(const copy of [{...f.l},clone(f.l)])await assert.rejects(()=>f.kernel.lease(copy,binding,generation,f.q),{code:'UNISSUED_AUTHORITY'});
 for(const copy of [{...f.a},clone(f.a)])await assert.rejects(()=>f.kernel.effect(f.scope,f.e,args,artifact,copy,f.l,f.q,binding,generation),{code:'UNISSUED_AUTHORITY'});
 await Promise.resolve();f.advance();await assert.rejects(()=>O.revalidateScope(f.scope),{code:'STALE_AUTHORITY'});
 const revoked=await fixture();await Promise.resolve();revoked.revoke();await assert.rejects(()=>revoked.kernel.effect(revoked.scope,revoked.e,args,artifact,revoked.a,revoked.l,revoked.q,binding,generation));
 // Installed identity seam refuses request-supplied access-token shapes too.
 const identity=O.createIdentityScopeVerifier({verifyToken:async()=>({issuer:'fixture',subject:'s',sessionId:'sid',audience:'api',issuedAt:0,expiresAt:9e12,tokenId:'token',tokenUse:'access'}),lookupAuthority:async()=>null});
 await assert.rejects(()=>identity.verify({tenantId:id(1),spaceId:id(2),sessionCredential:'forged-token'}));
};
cases['C02']=()=>{
 const q=qualification(),l=lease(),r=queue();
 for(const [name,decoder,value] of [
  ['binding',S.BindingSchema,binding],['pins',S.DeploymentPinSchema,pin],['row',S.CapabilityRowSchema,rows()[0]!],
  ['qualification',S.QualificationSchema,q],['lease',S.RuntimeLeaseSchema,l],['queue',S.QueueRequestSchema,r],
  ['dispatch',S.DispatchRequestSchema,{schemaVersion:1,toolId:'fixed',toolVersion:'1',path:'sdk',effect:effect(),envelopeDigest:hash('envelope'),argumentsDigest:O.bindingDigest(args),leaseId:l.leaseId,qualificationId:q.qualificationId}],
  ['api',S.ApiCommandSchema,{schemaVersion:1,operationId:id(1),payload:'valid'}]
 ] as const)malformed(decoder as Decoder<unknown>,value,name);
 for(const [key,value]of Object.entries(pin)) {
  if(key.endsWith('Digest'))for(const bad of ['',hash('ok').toUpperCase(),'sha256:00',7,...(key==='modelProfileDigest'?[]:[null])])assert.throws(()=>S.DeploymentPinSchema.parse({...pin,[key]:bad}),key);
  if(typeof value==='number')for(const bad of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1,0.2])assert.throws(()=>S.DeploymentPinSchema.parse({...pin,[key]:bad}),key);
 }
 for(const bad of ['',id(1)+'x','not-id',null])assert.throws(()=>S.BindingSchema.parse({...binding,runId:bad}));
 for(const bad of ['2026-02-30T00:00:00.000Z','2026-10-16','infinity',NaN])assert.throws(()=>S.QualificationSchema.parse({...q,expiresAt:bad}));
 assert.throws(()=>S.QualificationSchema.parse({...q,verifiedAt:q.expiresAt}));
 assert.throws(()=>S.QualificationSchema.parse({...q,expiresAt:q.verifiedAt}));
 assert.throws(()=>S.QualificationSchema.parse({...q,schemaVersion:2}));
 const input=clone(q) as unknown as {pin:Record<string,unknown>;rows:unknown[]},decoded=S.QualificationSchema.parse(input);input.pin['backend']='caller-mutated';input.rows.length=0;
 assert.equal(decoded.pin.backend,pin.backend);assert.equal(decoded.rows.length,registry.length);assert.ok(Object.isFrozen(decoded.rows[0]));
 const getterArray:unknown[]=[];let calls=0;Object.defineProperty(getterArray,'0',{get(){calls++;return rows()[0];},enumerable:true});
 assert.throws(()=>S.list(S.CapabilityRowSchema).parse(getterArray));assert.equal(calls,0);
 for(const extra of [{...rows()[0],rowId:'browser/positive',path:'browser',supported:true,status:'tested-support'}, {...rows()[0],rowId:'service/model',path:'service',effectOrControl:'model',supported:true,status:'tested-support'}])assert.throws(()=>S.QualificationSchema.parse({...q,rows:[extra]}));
};
cases['C03']=async()=>{
 const f=await fixture();C.validateMatrix(f.q.rows,registry);
 assert.throws(()=>C.validateMatrix([...f.q.rows,f.q.rows[0]],registry));
 for(let i=0;i<registry.length;i++)assert.throws(()=>C.validateMatrix(f.q.rows.filter((_,j)=>i!==j),registry));
 for(const key of ['rowId','path','effectOrControl','backend','backendVersion','checkIds','evidenceRefs'] as const){
  const altered=clone(f.q.rows) as unknown as Record<string,unknown>[];
  altered[0]![key]=key==='checkIds'||key==='evidenceRefs'?[]:'other';assert.throws(()=>C.validateMatrix(altered,registry),key);
 }
 for(const status of ['tested-refusal','pending-external'])assert.throws(()=>S.CapabilityRowSchema.parse({...f.q.rows[0],status,supported:true}));
 for(const row of f.q.rows.filter(r=>!r.supported))await assert.rejects(()=>f.kernel.qualification(f.q,pin,registry,[row.rowId],'owned-local-fixture'),{code:'UNSUPPORTED'});
 await f.kernel.qualification(f.q,pin,registry,['service/read','runtime/queue'],'owned-local-fixture');
 for(const key of Object.keys(pin))await assert.rejects(()=>f.kernel.qualification(f.q,{...pin,[key]:typeof pin[key as keyof typeof pin]==='number'?99:key.endsWith('Digest')?hash('different'):'different'},registry,['service/read'],'owned-local-fixture'));
 await assert.rejects(()=>f.kernel.qualification(f.q,pin,registry,['service/read'],'qualified-linux-deployment'),{code:'UNSUPPORTED'});
 const blocked={...f.q,blockingFindingIds:['high-isolation']};f.issued.qualification.add(blocked);
 await assert.rejects(()=>f.kernel.qualification(blocked,pin,registry,['service/read'],'owned-local-fixture'),{code:'STALE_AUTHORITY'});
 f.setNow(Date.parse(f.q.expiresAt));await assert.rejects(()=>f.kernel.qualification(f.q,pin,registry,['service/read'],'owned-local-fixture'),{code:'STALE_AUTHORITY'});
};
cases['C04']=async()=>{
 for(const n of [1,32])assert.equal(C.validateQueueRequest(queue(n),epoch).resources.length,n);
 for(const n of [0,33])assert.throws(()=>queue(n));
 const r=queue(2);
 assert.throws(()=>S.QueueRequestSchema.parse({...r,resources:[{resourceId:id(0xabc).toUpperCase(),mode:'write'}]}));
 for(const resources of [[r.resources[0],r.resources[0]],[r.resources[1],r.resources[0]],[r.resources[0],{...r.resources[0],resourceId:r.resources[0]!.resourceId.toUpperCase()}]])assert.throws(()=>S.QueueRequestSchema.parse({...r,resources}));
 for(const changed of [{...r,binding:{...binding,runId:id(99)}},{...r,envelopeDigest:hash('changed')},{...r,expiresAt:when(epoch+999)},{...r,resources:[r.resources[0]]}])assert.throws(()=>C.validateQueueRequest(changed,epoch,r));
 assert.throws(()=>C.validateQueueRequest(r,Date.parse(r.expiresAt)),{code:'STALE_AUTHORITY'});
 const waiting={state:'waiting' as const,ticketId:id(30),ownerTaskId:id(31),reason:'file writer held',resolver:'wait for original owner',charges:'continuing' as const};
 const cancelled={state:'cancelled' as const,ticketId:id(30)};
 const acquired={state:'acquired' as const,ticketId:id(30),lease:lease()};
 malformed(S.QueueResultSchema,waiting,'waiting');malformed(S.QueueResultSchema,cancelled,'cancelled');malformed(S.QueueResultSchema,acquired,'acquired');
 assert.throws(()=>C.requireAcquired(waiting),{code:'UNISSUED_AUTHORITY'});
 assert.throws(()=>C.requireAcquired({...waiting,lease:lease()}));
 C.validateQueueTransition(waiting,acquired);C.validateQueueTransition(waiting,cancelled);C.validateQueueTransition(cancelled,cancelled);
 assert.throws(()=>C.validateQueueTransition(cancelled,acquired));assert.throws(()=>C.validateQueueTransition(cancelled,waiting));
 const f=await fixture();assert.equal((await f.kernel.lease(C.requireAcquired(acquired),binding,generation,f.q).catch(()=>null)),null,'Decoded/cast lease never acquires private provenance');
 await f.kernel.lease(f.l,binding,generation,f.q);
 await assert.rejects(()=>f.kernel.lease(f.l,{...binding,storageBindingId:id(99)},generation,f.q));
 await assert.rejects(()=>f.kernel.lease(f.l,binding,{...generation,resource:1},f.q));
 f.setNow(Date.parse(f.l.expiresAt));await assert.rejects(()=>f.kernel.lease(f.l,binding,generation,f.q));
};
cases['C05/effect']=async()=>{
 const f=await fixture();await f.kernel.effect(f.scope,f.e,args,artifact,f.a,f.l,f.q,binding,generation);
 const reordered={value:17,precondition:{revision:1,baseDigest:hash('base')},artifactDigest:hash(artifact)};
 assert.equal(O.bindingDigest(args),O.bindingDigest(reordered));
 await f.kernel.effect(f.scope,f.e,reordered,artifact,f.a,f.l,f.q,binding,generation);
 assert.equal(O.validateRequest({intent:f.e,arguments:args,artifact}).intent.operationId,f.e.operationId);
 assert.throws(()=>O.validateRequest({intent:f.e,arguments:{artifactDigest:hash(artifact)},artifact}));
 for(const key of Object.keys(f.e)) {
  const value=f.e[key as keyof O.EffectBinding];
  const changed=typeof value==='string'?(key.endsWith('Digest')?hash('changed'):key.endsWith('Id')?id(999):'changed'):typeof value==='number'?99:null;
  await assert.rejects(()=>f.kernel.effect(f.scope,{...f.e,[key]:changed},args,artifact,f.a,f.l,f.q,binding,generation),key);
 }
 for(const input of [{value:17},{...args,value:18},{...args,precondition:{...args.precondition,revision:2}},null,{},[]])await assert.rejects(()=>f.kernel.effect(f.scope,f.e,input,artifact,f.a,f.l,f.q,binding,generation));
 await assert.rejects(()=>f.kernel.effect(f.scope,f.e,args,artifact+'changed',f.a,f.l,f.q,binding,generation));
 const receipt=O.downstreamReceiptSchema.parse({operationId:f.e.operationId,intentDigest:O.bindingDigest(f.e),target:f.e.target,argsDigest:f.e.argsDigest,artifactDigest:f.e.artifactDigest,writeNumber:1});
 assert.equal(O.receiptMatches(f.e,receipt),true);
 for(const key of ['operationId','intentDigest','target','argsDigest','artifactDigest'] as const)assert.equal(O.receiptMatches(f.e,{...receipt,[key]:key.endsWith('Id')?id(900):hash('changed')}),false);
 assert.equal(C.recoveryRoute({state:'unknown',operationId:f.e.operationId,replayAllowed:false}),'lookup-original-operation');
 for(const r of [{state:'unknown',operationId:f.e.operationId,replayAllowed:false},{state:'confirmed',operationId:f.e.operationId,receiptDigest:hash('receipt')},{state:'not-dispatched',operationId:f.e.operationId,code:'POLICY_REFUSED'}] as const)malformed(S.DispatchResultSchema,r,'dispatch-result');
 assert.throws(()=>C.recoveryRoute({state:'unknown',operationId:f.e.operationId,replayAllowed:true}));
 f.setNow(Date.parse(f.e.expiresAt));await assert.rejects(()=>f.kernel.effect(f.scope,f.e,args,artifact,f.a,f.l,f.q,binding,generation),{code:'STALE_AUTHORITY'});
};

const paths=['stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','stop-and-both-expiries'] as const;
async function settlementFixture(path:typeof paths[number]) {
 const f=await fixture(),stopped=path.startsWith('stopped')||path==='stop-and-both-expiries';
 const s=S.OriginalSnapshotSchema.parse({path,operationId:f.e.operationId,originalBindingDigest:O.bindingDigest(f.e),actorId:f.scope.actorId,runState:stopped?'cancelling':'reconciling',runRevision:7,generation,leaseExpiresAt:when(path.includes('lease')||path==='stop-and-both-expiries'?epoch-1:epoch+1000),effectExpiresAt:when(path.includes('effect-expired')||path==='stop-and-both-expiries'?epoch-1:epoch+1000),leaseRevoked:stopped,stopped,observedAt:when(epoch)});
 const authority=S.ReconciliationDataSchema.parse({operationId:s.operationId,originalBindingDigest:s.originalBindingDigest,actorId:f.scope.actorId,authorityRevision:f.scope.authorityRevision,stoppedOrExpiredSnapshotDigest:O.bindingDigest(s),lookupPolicyDigest:hash('lookup-policy'),issuedAt:when(epoch-1),expiresAt:when(epoch+1000),sessionExpiresAt:when(epoch+10_000),dispatch:false});
 const receipt=O.downstreamReceiptSchema.parse({operationId:f.e.operationId,intentDigest:O.bindingDigest(f.e),target:f.e.target,argsDigest:f.e.argsDigest,artifactDigest:f.e.artifactDigest,writeNumber:1});
 const observation=S.ObservationSchema.parse({operationId:s.operationId,originalBindingDigest:s.originalBindingDigest,target:f.e.target,connectorDigest:hash('connector'),trustDigest:hash('trust'),lookupPolicyDigest:authority.lookupPolicyDigest,generation,bootId:id(38),observedAt:when(epoch),method:'GET',outcome:'APPLIED',writeNumber:1,targetReceiptDigest:O.bindingDigest(receipt),quiescenceDigest:hash('trusted-descendants-and-streams'),descendantsQuiescent:true,streamsClosed:true});
 f.issued.reconciliation.add(authority);f.issued.observation.add(observation);
 const expected={effect:f.e,connectorDigest:observation.connectorDigest,trustDigest:observation.trustDigest,lookupPolicyDigest:observation.lookupPolicyDigest,bootId:observation.bootId,currentSnapshot:s};
 return {...f,s,authority,observation,receipt,expected};
}
cases['C05/settlement']=async()=>{
 for(const path of paths) {
  const f=await settlementFixture(path),original=O.canonical(f.s);
  const settle=(a:unknown=f.authority,s:unknown=f.s,o:unknown=f.observation,r:unknown=f.receipt,action:'settle-metadata'='settle-metadata')=>f.kernel.settlement(f.scope,a,s,o,r,f.expected,action);
  assert.deepEqual(await settle(),{operationId:f.e.operationId,dispatch:false,snapshotDigest:O.bindingDigest(f.s),receiptDigest:O.bindingDigest(f.receipt)});
  assert.equal(O.canonical(f.s),original,'No restored Run/lease or rewritten binding');
  malformed(S.OriginalSnapshotSchema,f.s,'snapshot/'+path);malformed(S.ReconciliationDataSchema,f.authority,'authority/'+path);malformed(S.ObservationSchema,f.observation,'observation/'+path);
  for(const copy of [{...f.authority},clone(f.authority),{}])await assert.rejects(()=>settle(copy),{code:'UNISSUED_AUTHORITY'});
  for(const copy of [{...f.observation},clone(f.observation),{}])await assert.rejects(()=>settle(f.authority,f.s,copy),{code:'UNISSUED_AUTHORITY'});
  for(const key of Object.keys(f.authority)) {
   const v=f.authority[key as keyof typeof f.authority];
   const changed={...f.authority,[key]:typeof v==='boolean'?true:typeof v==='number'?99:key.endsWith('At')?when(epoch-60_000):key.endsWith('Digest')?hash('wrong'):id(998)};
   f.issued.reconciliation.add(changed);await assert.rejects(()=>settle(changed),path+'/'+key);
  }
  for(const key of Object.keys(f.observation)) {
   const v=f.observation[key as keyof typeof f.observation];
   const changed={...f.observation,[key]:typeof v==='boolean'?false:typeof v==='number'?0:key==='generation'?{...generation,resource:9}:key==='observedAt'?when(epoch-10_000):key.endsWith('Digest')?hash('wrong'):id(998)};
   f.issued.observation.add(changed);
   // quiescenceDigest is opaque and privately vouched, test the private port
   // refusing a mismatched digest rather than pretending a string proves OS state.
   if(key==='quiescenceDigest') {f.issued.observation.delete(changed);}
   await assert.rejects(()=>settle(f.authority,f.s,changed),path+'/'+key);
  }
  for(const key of Object.keys(f.receipt))await assert.rejects(()=>settle(f.authority,f.s,f.observation,{...f.receipt,[key]:key==='writeNumber'?0:key.endsWith('Digest')?hash('wrong'):id(998)}));
  for(const key of Object.keys(f.s))await assert.rejects(()=>settle(f.authority,{...f.s,[key]:null}));
  for(const forbidden of ['POST','claim','resume','lease-renewal','worker-replay','lookup-absence-release'])await assert.rejects(()=>settle(f.authority,f.s,f.observation,f.receipt,forbidden as 'settle-metadata'),{code:'UNSUPPORTED'});
  for(const altered of [{...f.authority,expiresAt:when(epoch+30_001)},{...f.authority,sessionExpiresAt:when(epoch-1)}])assert.throws(()=>S.ReconciliationDataSchema.parse(altered));
  f.afterObservation(()=>f.setNow(Date.parse(f.authority.expiresAt)));
  await assert.rejects(()=>settle(),{code:'STALE_AUTHORITY'});
  f.afterObservation(()=>{});f.setNow(epoch);assert.equal((await settle()).dispatch,false,'Fresh valid recovery after held negative');
  const prior=C.SettlementMetadataSchema.parse({operationId:f.e.operationId,originalBindingDigest:O.bindingDigest(f.e),effectState:'unknown',runState:f.s.runState,runRevision:f.s.runRevision,generation,sessionGeneration:generation,leaseExpiresAt:f.s.leaseExpiresAt,effectExpiresAt:f.s.effectExpiresAt,leaseRevoked:f.s.leaseRevoked,taskCancelled:f.s.stopped,taskBlocked:true,liabilityDigest:hash('original-liability'),receiptDigest:null});
  const command=C.SettlementCommandSchema.parse({operationId:f.e.operationId,originalBindingDigest:O.bindingDigest(f.e),key:O.effectKey(f.e.operationId,'f06-original-settlement'),expectedRunRevision:prior.runRevision,targetReceiptDigest:O.bindingDigest(f.receipt)});
  const next={...prior,runRevision:prior.runRevision+1,effectState:'confirmed',receiptDigest:command.targetReceiptDigest};
  C.validateSettlementMetadata(prior,next,command);
  for(const state of ['dispatched','reconciling'])C.validateSettlementMetadata({...prior,effectState:state},next,command);
  malformed(C.SettlementMetadataSchema,prior,'settlement-metadata');malformed(C.SettlementCommandSchema,command,'settlement-command');
  // Every preserved field is immutable, independently of metadata revision CAS.
  for(const key of Object.keys(prior).filter(k=>!['effectState','runRevision','receiptDigest'].includes(k))) {
   const value=prior[key as keyof typeof prior];
   const changed=typeof value==='boolean'?!value:typeof value==='object'?{...generation,worker:2}:key.endsWith('Digest')?hash('replacement'):key.endsWith('At')?when(epoch+100_000):id(999);
   assert.throws(()=>C.validateSettlementMetadata(prior,{...next,[key]:changed},command),path+'/preserved/'+key);
  }
  for(const bad of [{...command,key:id(999)},{...command,expectedRunRevision:prior.runRevision+1},{...command,originalBindingDigest:hash('changed')},{...command,targetReceiptDigest:hash('changed')}])assert.throws(()=>C.validateSettlementMetadata(prior,next,bad));
  assert.throws(()=>C.validateSettlementMetadata(prior,{...next,runRevision:prior.runRevision},command));
  assert.throws(()=>C.validateSettlementMetadata(prior,{...next,effectState:'unknown'},command));
  // Lost-ACK lookup retains this original deterministic key; never new send.
  assert.equal(command.key,O.effectKey(f.e.operationId,'f06-original-settlement'));
  f.revoke();await assert.rejects(()=>settle());
 }
};
cases['C05/legal-phase-flow']=async()=>{
 // Original transition functions, no copied transition table and no PG claim.
 O.assertEffectTransition('prepared','dispatched');O.assertEffectTransition('dispatched','unknown');
 O.assertRunTransition('running','reconciling');
 const claim={effect:'unknown',run:'reconciling'} as const;assert.notEqual(claim.effect as string,claim.run as string);
 O.assertEffectTransition('unknown','reconciling');O.assertEffectTransition('reconciling','confirmed');O.assertRunTransition('reconciling','paused');
 assert.throws(()=>O.assertEffectTransition('unknown','confirmed'),{code:'ILLEGAL_TRANSITION'});
 assert.throws(()=>O.assertRunTransition('reconciling','running'),{code:'ILLEGAL_TRANSITION'});
 C.validatePhaseInvocations({}, {}, {}, {}, true,'observed');
 const a={};assert.throws(()=>C.validatePhaseInvocations(a,a,{}, {},true,'observed'));
 assert.throws(()=>C.validatePhaseInvocations({}, {}, {}, {},false,'observed'));
 assert.throws(()=>C.validatePhaseInvocations({}, {}, {}, {},true,'assumed'));
 const f=await fixture();
 await assert.rejects(()=>f.kernel.effect(f.scope,f.e,args,artifact,f.a,f.l,f.q,binding,{...generation,cancellation:1}),{code:'STALE_GENERATION'});
 f.revoke();await assert.rejects(()=>f.kernel.effect(f.scope,f.e,args,artifact,f.a,f.l,f.q,binding,generation),e=>(e as {code?:string}).code!=='ILLEGAL_TRANSITION');
};

function callBinding(intent:'Plan'|'Ask',n:number,parent:string|null):O.TaskCallBinding {return TaskCallBindingSchema.parse({schemaVersion:1,tenantId:id(1),spaceId:id(2),actorId:id(15),payerId:id(20),costCenter:'fixture-cost-center',taskId:id(n),runId:id(n+1),parentTaskId:parent,sessionId:id(n+2),purpose:intent==='Plan'?'planning':'maintenance',category:'service',requirementsRevision:1,versions:{schemaVersion:1,engineDigest:hash('engine'),behaviorDigest:hash('behavior'),schemaDigest:hash('schema'),environmentDigest:hash('environment'),dependencyLockDigest:hash('lock'),checkDefinitionDigest:hash('checks')},policyRevision:1,membershipRevision:1,sourceRevisionDigest:hash('source'),cancellationGeneration:0,workerGeneration:1,resourceGeneration:0,intent});}
function plan():C.PlanSaveBinding {
 const p=callBinding('Plan',50,null),child=callBinding('Ask',60,p.taskId);
 return C.PlanSaveBindingSchema.parse({schemaVersion:1,saveKey:id(70),documentId:id(71),expectedVersion:0,logicalVersion:1,originalPlan:p,originalEnvelopeDigest:hash('original-plan-envelope'),originalControlRevision:1,child,parentBudgetRunId:p.runId,commandFingerprint:hash('save'),artifact:{class:'artifact',id:id(72),revision:1,witness:hash('physical1')},previous:null,originalExecutionClass:'service',childExecutionClass:'service',lineage:{schemaVersion:12,parentTaskId:p.taskId,parentRunId:p.runId,parentDepartmentId:id(73),childDepartmentId:id(73),parentAllowances:[id(74),id(75)],childFamilyAllowances:[id(74),id(75),id(76)]}});
}
function compilerNegatives():void {
 const source=process.env['RUNTIME_SOURCE_ROOT'];assert.ok(source);
 const parent=join(source,'node_modules/.cache');assert.equal(lstatSync(parent).isSymbolicLink(),false);
 const dir=mkdtempSync(join(parent,'contract-types-')),nonce=randomUUID(),stat=lstatSync(dir);
 writeFileSync(join(dir,'.nonce'),nonce,{flag:'wx'});
 try {
  const specimen=join(dir,'negative.mts');
  const input=`import type {RuntimeLease,QueueResult,DeploymentPin,PlanArtifactRef,FreshReconciliationAuthority,CapabilityRow,SupportedRow} from ${JSON.stringify(join(source,'src/contracts.js'))};
import type {Generation,ArtifactOwnerSeam,EffectOwnerSeam,VerifiedScope} from ${JSON.stringify(join(source,'src/owners.js'))};
declare const waiting:Extract<QueueResult,{state:'waiting'}>;declare const scalar:number;declare const artifact:PlanArtifactRef;
declare const readOnly:FreshReconciliationAuthority;
// @ts-expect-error waiting is not a lease
const badLease:RuntimeLease=waiting;
// @ts-expect-error generation is a tuple
const badGeneration:Generation=scalar;
// @ts-expect-error physical revision is exactly one
const badRevision:2=artifact.revision;
// @ts-expect-error original storage has no invented savePlan
type BadStorage=Pick<ArtifactOwnerSeam,'savePlan'>;
// @ts-expect-error claim requires awaiting acknowledged top-level transaction
const sync:boolean=Promise.resolve(true);
// @ts-expect-error read-only authority cannot dispatch
const dispatch:true=readOnly.dispatch;
// @ts-expect-error private reconciliation brand cannot be forged
const forged:FreshReconciliationAuthority={operationId:'op',originalBindingDigest:'d',actorId:'a',authorityRevision:1,stoppedOrExpiredSnapshotDigest:'s',lookupPolicyDigest:'p',issuedAt:'i',expiresAt:'e',sessionExpiresAt:'s',dispatch:false};
// @ts-expect-error original effect has no installed settleStopped
type BadSettlement=Pick<EffectOwnerSeam,'settleStopped'>;
// @ts-expect-error pins cannot be partial
const partial:DeploymentPin={backend:'fixture'};
// @ts-expect-error scope private brand cannot be forged
const scope:VerifiedScope={tenantId:'t',spaceId:'s',actorId:'a',payerId:'p',authorityRevision:1,membershipRevision:1,grants:[]};
// @ts-expect-error exactOptionalPropertyTypes rejects explicit undefined
const exact:{value?:string}={value:undefined};
declare const pending:CapabilityRow & {status:'pending-external';supported:false};
// @ts-expect-error pending can never be supported
const supported:SupportedRow=pending;
`;
  const config=join(dir,'tsconfig.json');writeFileSync(config,JSON.stringify({extends:join(source,'tsconfig.json'),compilerOptions:{noEmit:true},include:[specimen]}));
  const compile=(text:string)=>{writeFileSync(specimen,text);const result=spawnSync(process.execPath,[join(source,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:source,encoding:'utf8',timeout:45_000,maxBuffer:4*1024*1024});assert.ifError(result.error);assert.equal(result.signal,null);return result;};
  const positive=compile(input);assert.equal(positive.status,0,positive.stdout+positive.stderr);
  const rejected=compile(input.replaceAll(/\/\/ @ts-expect-error[^\n]*\n/g,''));
  assert.equal(rejected.status,2,rejected.stdout+rejected.stderr);assert.equal((rejected.stdout.match(/error TS\d+:/g)??[]).length,12,rejected.stdout);
  console.log('compiler-negative-raw-output:\n'+rejected.stdout+rejected.stderr);
  console.log('compiler-negative-specimens: 12 independent failures observed after removing expected-error directives');
 }finally {const current=lstatSync(dir);assert.equal(current.ino,stat.ino);assert.equal(current.dev,stat.dev);assert.equal(current.isSymbolicLink(),false);assert.equal(readFileSync(join(dir,'.nonce'),'utf8'),nonce);rmSync(dir,{recursive:true});}
}
cases['C06/api-types-fence-composition']=()=>{
 const base=JSON.stringify({schemaVersion:1,operationId:id(1),payload:'x'}),length=Buffer.byteLength(base);
 const boundary=Buffer.from(base+' '.repeat(65536-length));
 assert.equal(boundary.length,65536);assert.equal(S.decodeRuntimeBody(boundary).schemaVersion,1);
 assert.throws(()=>S.decodeRuntimeBody(Buffer.concat([boundary,Buffer.from(' ')])),/BODY_TOO_LARGE/);
 for(const bad of ['','{','[]','null',JSON.stringify({schemaVersion:2,operationId:id(1),payload:'x'}),JSON.stringify({schemaVersion:1,operationId:id(1)}),JSON.stringify({schemaVersion:1,operationId:id(1),payload:'x',extra:true})])assert.throws(()=>S.decodeRuntimeBody(Buffer.from(bad)));
 assert.throws(()=>S.decodeRuntimeBody(Buffer.from([0xff])));
 S.requireRuntimeRoute('POST','/v1/runtime/command');
 for(const [method,route]of [['GET','/v1/runtime/command'],['POST','/v2/runtime/command'],['POST','/v1/runtime/command?override=1']])assert.throws(()=>S.requireRuntimeRoute(method!,route!));
 const source=process.env['RUNTIME_SOURCE_ROOT'];assert.ok(source);
 const before=readdirSync(join(source,'evidence')).sort();
 for(const flags of [[],['wrong-view','--cases','C01'],['contract-kernel','--cases'],['contract-kernel','--cases','UNKNOWN'],['contract-kernel','--cases','C01','C01'],['contract-kernel','--cases','C05','C05/effect'],['contract-kernel','--cases','C01','--skip'],['contract-kernel','--all']]) {
  const rejected:SpawnSyncReturns<string>=spawnSync(process.execPath,[join(source,'scripts/check-component.mjs'),...flags],{cwd:source,encoding:'utf8',timeout:5000});
  assert.ifError(rejected.error);assert.equal(rejected.status,1);assert.equal(rejected.stdout,'');
 }
 assert.deepEqual(readdirSync(join(source,'evidence')).sort(),before,'Unknown CLI refuses before evidence/fixture/build I/O');
 C.assertAcyclicPrefixes(Object.values(C.lockPrefixes));
 assert.throws(()=>C.assertAcyclicPrefixes([C.lockPrefixes.nativeStop,['fence-key','barrier','owner-rows']]),{code:'COMPOSITION_REFUSED'});
 assert.equal(C.lockPrefixes.effectClaim[0],'effect-phase');assert.equal(C.lockPrefixes.originalSettlement[0],'recovery-command');
 assert.deepEqual(C.lockPrefixes.synchronizeDelivery,['barrier','owner-rows']);
 for(const order of ['native-first','top-level-first'])for(const payload of ['equal','conflict']) {
  const tx={},w:C.CompositionWitness={entrypoint:'installedTopFence',prefix:C.lockPrefixes.installedTopFence,authenticatedTransaction:tx,barrierTransaction:tx,routes:['execute','lookupCommand'],rawOnlineFence:false,handlerSqlExposed:false};
  C.validateComposition(w);
  for(const mutated of [{...w,barrierTransaction:{}},{...w,rawOnlineFence:true},{...w,handlerSqlExposed:true},{...w,routes:['execute']},{...w,prefix:['fence-key','barrier','owner-rows']}])assert.throws(()=>C.validateComposition(mutated));
  C.validateComposition({...w,entrypoint:'nativeStop',prefix:C.lockPrefixes.nativeStop});
  const native={},facade={},key=id(400),first=order==='native-first'?'native':'facade',second=first==='native'?'facade':'native';
  const transaction={native,facade};const digests={native:hash('first-command'),facade:hash(payload==='equal'?'first-command':'conflicting-command')};
  const step=(caller:'native'|'facade',event:C.FenceScheduleStep['event']):C.FenceScheduleStep=>({caller,event,transaction:transaction[caller],key,payloadDigest:digests[caller]});
  const trace:C.FenceScheduleStep[]=[step(first,'request-barrier'),step(first,'acquire-barrier'),step(second,'request-barrier'),
   ...(first==='native'?[step(first,'native-key')]:[]),step(first,'fence-key'),step(first,'commit'),step(second,'acquire-barrier'),
   ...(second==='native'?[step(second,'native-key')]:[]),step(second,'fence-key'),step(second,'commit'),step(first,'lookup')];
  assert.equal(C.validateFenceSchedule(trace),payload==='equal'?'deduplicated':'IDEMPOTENCY_CONFLICT');
  // A blocked barrier waiter is forbidden from acquiring the fence key.
  const inverted=[...trace];inverted.splice(3,0,step(second,'fence-key'));inverted.pop();assert.throws(()=>C.validateFenceSchedule(inverted),{code:'COMPOSITION_REFUSED'});
 }
 // Structural witnesses only. No invocation here claims an original PG ACK.
 const owner=Object.freeze({}) as O.EffectOwnerSeam,slot={};
 const witness={claimOwner:owner,sendOwner:owner,commit:'acknowledged' as const,uow:'top-level' as const,slot,activeSlots:[slot],dispatch:true};
 C.validateDispatchWitness(witness);
 for(const mutated of [{...witness,sendOwner:{} as O.EffectOwnerSeam},{...witness,commit:'unknown' as const},{...witness,uow:'borrowed' as const},{...witness,activeSlots:[slot,slot]},{...witness,activeSlots:[]},{...witness,dispatch:false}])assert.throws(()=>C.validateDispatchWitness(mutated));
 const p=plan();malformed(C.PlanSaveBindingSchema,p,'plan-save');
 malformed(C.PlanLineageSchema,p.lineage,'plan-lineage');
 const v2={...p,expectedVersion:1,logicalVersion:2,previous:p.artifact,artifact:{...p.artifact,id:id(80)}};C.PlanSaveBindingSchema.parse(v2);
 for(const bad of [{...v2,logicalVersion:3},{...v2,artifact:{...v2.artifact,revision:2}},{...v2,artifact:p.artifact},{...p,parentBudgetRunId:id(99)},{...p,child:{...p.child,intent:'Plan'}},{...p,child:{...p.child,parentTaskId:null}},{...p,childExecutionClass:'target'},{...p,lineage:{...p.lineage,childFamilyAllowances:[id(999)]}},{...p,lineage:{...p.lineage,childDepartmentId:id(999)}}])assert.throws(()=>C.PlanSaveBindingSchema.parse(bad));
 assert.deepEqual(['model','service','tool','active-compute','reserved-compute','cold-start','retained-storage','network','embedding','reranking'].map(s=>CostCategorySchema.parse(s)),['model','service','tool','active-compute','reserved-compute','cold-start','retained-storage','network','embedding','reranking']);
 assert.throws(()=>CostCategorySchema.parse('runtime-new-budget'));
 compilerNegatives();
};
const backendPins=S.BackendPinsSchema.parse({schemaVersion:1,release:'synthetic-not-researched',releaseDigest:hash('release'),apiVersion:'fixture-v1',configDigest:hash('config'),imageDigest:hash('image'),bootstrapDigest:hash('bootstrap'),portsDigest:hash('ports'),driver:'disabled-protocol-fixture',architecture:'arm64'});
cases['C06/backend-pins']=()=>{
 malformed(S.BackendPinsSchema,backendPins,'backend');C.validateBackendPins(backendPins,clone(backendPins));
 let connects=0;
 for(const key of Object.keys(backendPins)) {
  const altered={...backendPins,[key]:key==='schemaVersion'?2:key.endsWith('Digest')?hash('changed'):'changed'};
  assert.throws(()=>{C.validateBackendPins(altered,backendPins);connects++;});
 }
 assert.equal(connects,0,'Pin mismatch refuses before connect');
};
cases['C06/approved-host-manifest']=()=>{
 const m=S.ApprovedHostManifestSchema.parse({schemaVersion:1,approvalId:id(1000),hostId:id(1001),provider:'synthetic-only',architecture:'arm64',imageDigest:hash('image'),accessMethod:'disabled-fixture',isolationDigest:hash('isolation'),destinationsDigest:hash('destinations'),resourceLimitsDigest:hash('limits'),maxVms:1,maxSpendMicrounits:0,startsAt:when(epoch-1000),expiresAt:when(epoch+1000),cleanupDigest:hash('cleanup'),retentionDigest:hash('retention'),verifierId:id(1002),inventoryEvidenceDigest:hash('inventory'),provenance:'synthetic-contract'});
 malformed(S.ApprovedHostManifestSchema,m,'host-manifest');
 for(const altered of [{...m,maxVms:2},{...m,expiresAt:m.startsAt},{...m,maxSpendMicrounits:-1},{...m,provenance:'worker'},{...m,approved:true}])assert.throws(()=>S.ApprovedHostManifestSchema.parse(altered));
 let connects=0;for(const specimen of [m,{...m,provenance:'independent-approved-host'},null,{}])assert.throws(()=>{C.requireApprovedHost(specimen,epoch);connects++;});
 assert.equal(connects,0,'Schema-positive synthetic records cannot authorize any real host');
};

const bound:Record<string,()=>Promise<{assertions:{executed:true}}>>={};
for(const [id,fn]of Object.entries(cases))bound[/^C0[1-4]$/.test(id)?id+'/full':id]=async()=>{await fn();return {assertions:{executed:true}};};
bound['I07/full']=async()=>{const {admissionEnvelopeCase}=await import('./helpers/admission-cases.js');const details=await admissionEnvelopeCase();return {assertions:{executed:true,...details}};};
for(const leaf of ['A27/contract','A27/closed-paths'])bound[leaf]=async()=>{const {toolCases}=await import('./helpers/tool-cases.js');const details=await toolCases[leaf]!();return {assertions:{executed:true,...details}};};
registerCases(bound,['assertions']);
