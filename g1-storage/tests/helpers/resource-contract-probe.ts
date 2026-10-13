import assert from 'node:assert/strict';
import { createScopeVerifier } from '../../../g1-foundations/src/contracts.js';
import type { CurrentAuthority } from '../../../g1-foundations/src/contracts.js';
import { BorrowedUnitOfWork, StorageServiceAccounting, type ServiceAccounting } from '../../src/resource-composition.js';
import { ResourceRepository, NativeRepository, type NativeSnapshot, type SqlTransaction,
 type SyntheticResourceOwner, type AsyncUnitOfWork } from '../../src/owners.js';
import { StorageError } from '../../src/errors.js';
import { id, sha } from './contract-fixtures.js';

/** SQL-shape contract probe only. Real PG/IdP/fence/budget contention is a
 * separate mandatory f05-02/f05-06/L09 qualification, never claimed here.
 */
export async function resourceContractProbe(){
 const authority:CurrentAuthority={tenantId:id(1),spaceId:id(2),actorId:id(3),payerId:id(21),
  authorityRevision:1,membershipRevision:1,grants:['task:read','task:write','storage:maintenance'],
  actorRevoked:false,payerRevoked:false,membershipRevoked:false,lifecycle:'active'};
 const scope=await createScopeVerifier(async()=>authority).verify({tenantId:id(1),spaceId:id(2),sessionCredential:'synthetic-contract-only'});
 let calls=0,stale=false,denyBudget=false,assigned=false,settled=false,staleAfterReserve=false,staleAfterSettle=false;
 const commands=new Map<string,{digest:string;receipt:unknown}>();let interval:unknown=null;
 const binding={schemaVersion:1,tenantId:id(1),spaceId:id(2),actorId:id(3),payerId:id(21),costCenter:'fixture',
  taskId:id(5),runId:id(22),parentTaskId:null,sessionId:id(7),purpose:'answer',category:'service',
  requirementsRevision:1,versions:{schemaVersion:1,engineDigest:sha,behaviorDigest:sha,schemaDigest:sha,
   environmentDigest:sha,dependencyLockDigest:sha,checkDefinitionDigest:sha},policyRevision:1,
  membershipRevision:1,sourceRevisionDigest:sha,cancellationGeneration:0,workerGeneration:1,resourceGeneration:1,intent:'Ask'};
 const snapshot={binding,admission:{executionClass:'service',resourceId:null,computerCapability:null,
  targetEffect:false,approvalRequired:false},revision:1,stopped:false} as NativeSnapshot;
 let currentIntent:ServiceAccounting;
 const statements:string[]=[];
 const tx:SqlTransaction={async query<Row extends Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
  statements.push(sql);let rows:Record<string,unknown>[]=[];
  if(sql.includes('controller_authority()'))rows=[{authority}];
  else if(sql.includes('clock_timestamp()'))rows=[{live:true}];
  else if(sql.includes('to_regclass'))rows=[{installed:true}];
  else if(sql.includes('storage_service_resources'))rows=[{owner_id:id(23),generation:1,purpose:currentIntent.purpose,origin_run_id:id(22)}];
  else if(sql.includes('model_computer_assignments'))rows=assigned?[{assigned:true}]:[];
  else if(sql.includes('model_resource_current'))rows=[{generation:1}];
  else if(sql.includes('fabric.model_current'))rows=[{binding:{record:binding}}];
  else if(sql.startsWith('SELECT payload_digest,receipt')){
   const prior=commands.get(String(values[3]));rows=prior?[{payload_digest:prior.digest,receipt:prior.receipt}]:[];
  }else if(sql.includes('model_resource_reserve')){
   if(denyBudget)throw Object.assign(new Error('opaque'),{code:'P0002'});
   interval=JSON.parse(String(values[0]));rows=[{id:id(24)}];if(staleAfterReserve)stale=true;
  }else if(sql.startsWith('SELECT record FROM fabric.model_resource_intervals'))rows=interval?[{record:interval}]:[];
  else if(sql.includes('model_resource_settle')){settled=true;rows=[{receipt:interval}];if(staleAfterSettle)stale=true;}
  else if(sql.startsWith('INSERT INTO fabric.model_command_receipts'))commands.set(String(values[3]),{digest:String(values[4]),receipt:JSON.parse(String(values[7]))});
  return {rows:rows as Row[],rowCount:rows.length};
 }};
 const uow:AsyncUnitOfWork={async withScope(target,work){assert.equal(target,scope);calls++;return work(tx);}};
 // Unit seam supplies load/fresh probes; production constructor uses the direct installed owner.
 let freshness=0;
 const native={load:async(transaction:SqlTransaction)=>{assert.equal(transaction,tx);return snapshot;},
  fresh:async(transaction:SqlTransaction)=>{assert.equal(transaction,tx);freshness++;if(stale)throw new StorageError('STALE_FENCE');}} as unknown as NativeRepository;
 const owner:SyntheticResourceOwner={ownerId:id(23),receipt:async receiptId=>({schemaVersion:1,
  assurance:'deterministic-local-only',receiptId,ownerId:id(23),tenantId:id(1),spaceId:id(2),resourceId:id(25),
  assignmentGeneration:1,category:'service',start:0,end:1,rateVersion:1,rateUnits:1,originRunId:id(22)}),
  suspension:async()=>{throw new Error('not available');}};
 let policyChecks=0,computed=0,published=0;
 const composed=new StorageServiceAccounting(uow,native,owner,{async assertCurrent(transaction,target){
  assert.equal(transaction,tx);assert.equal(target,scope);policyChecks++;
 }});
 for(const purpose of ['ask','maintenance'] as const){
  binding.purpose=purpose==='ask'?'answer':'maintenance';
  currentIntent={schemaVersion:1,kind:'logical-service',accountingResourceId:id(25),ownerId:id(23),
   assignmentGeneration:1,sessionId:id(7),originRunId:id(22),purpose,receiptId:id(purpose==='ask'?26:27),
   expiresAt:'2099-01-01T00:00:00.000Z'};
  commands.clear();interval=null;settled=false;
  const before=calls;
  const result=await composed.execute(scope,currentIntent,async transaction=>{assert.equal(transaction,tx);computed++;return 'opaque-result';},
   async(transaction,value)=>{assert.equal(transaction,tx);assert.equal(value,'opaque-result');assert.equal(settled,true);published++;});
  assert.equal(calls,before+1);assert.equal(result.receipt.originRunId,id(22));assert.equal(result.receipt.category,'service');
  assert.equal(commands.size,2);assert.ok(statements.some(s=>s.includes('model_resource_reserve')));
  assert.ok(statements.some(s=>s.includes('model_resource_settle')));
  stale=true;await assert.rejects(()=>composed.execute(scope,currentIntent,async()=>{throw new Error('must not run');}),StorageError);stale=false;
  assigned=true;await assert.rejects(()=>composed.execute(scope,currentIntent,async()=>{throw new Error('must not run');}),StorageError);assigned=false;
  commands.clear();interval=null;denyBudget=true;
  await assert.rejects(()=>composed.execute(scope,currentIntent,async()=>{throw new Error('must not run');}),{code:'BUDGET_EXHAUSTED'});denyBudget=false;
  commands.clear();interval=null;staleAfterReserve=true;
  await assert.rejects(()=>composed.execute(scope,currentIntent,async()=>{throw new Error('must not compute after stale reserve');}),{code:'STALE_FENCE'});
  staleAfterReserve=false;stale=false;commands.clear();interval=null;staleAfterSettle=true;
  await assert.rejects(()=>composed.execute(scope,currentIntent,async()=>true,async()=>{throw new Error('must not publish after stale settle');}),{code:'STALE_FENCE'});
  staleAfterSettle=false;stale=false;
 }
 assert.equal(computed,2);assert.equal(published,2);assert.ok(policyChecks>=8&&freshness>=16);
 assert.ok(!statements.some(s=>/\b(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const borrowed=new BorrowedUnitOfWork(scope,tx);
 assert.equal(await borrowed.withScope(scope,async transaction=>transaction),tx);
 await assert.rejects(()=>borrowed.withScope({...scope},async()=>true),StorageError);
 borrowed.close();await assert.rejects(()=>borrowed.withScope(scope,async()=>true),{code:'TRANSACTION_CLOSED'});
 assert.throws(()=>new BorrowedUnitOfWork({...scope},tx));
 assert.equal(composed.native,native);assert.equal(ResourceRepository.name,'ResourceRepository');
}
