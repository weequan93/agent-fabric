import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createNativeFixture } from './native-fixture.js';
import { migrateResourceIntervals } from '../../src/resource-migration.js';
import { ResourceRepository } from '../../src/resource-repository.js';
import { ResourceReceiptSchema,SuspendProofSchema,type ResourceReceipt } from '../../src/resource-contract.js';
import { launchOwned,stopOwned,waitUntil,type OwnedProcess } from './process-fixture.js';
import { demand } from '../../src/errors.js';
export async function createResourceFixture(){
 const n=await createNativeFixture(),f=n.f,children:OwnedProcess[]=[];try{
  const options={ownedSyntheticDatabase:true as const,owner:f.fixtureOwner,root:f.root};
  if(!(await f.admin.query('SELECT 1 FROM public.fabric_model_migrations WHERE version=9')).rowCount){await migrateResourceIntervals(f.admin,{...options,injectBeforeCommit:true}).then(()=>{throw new Error('Missing resource rollback');},e=>{if(e.message!=='Injected resource migration rollback')throw e;});demand((await f.admin.query("SELECT to_regclass('fabric.model_resource_bindings') AS table")).rows[0].table===null);}await migrateResourceIntervals(f.admin,options);
  const resourceId=randomUUID(),ownerId=randomUUID(),a=await n.task({computer:true,intent:'Act',resourceId,ceiling:100}),b=await n.task({computer:true,intent:'Act',resourceId,ceiling:100});
  // Actual accepted simulated preflight installs the single Space assignment.
  demand((await n.native.session.requestTurn(a.scope,{...await n.command(a.sessionId),input:'prepare',choice:null})).view.wait?.reason==='resource');
  const common=await n.common();
  await f.admin.query('INSERT INTO fabric.model_resource_bindings VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[f.tenant,f.space,resourceId,ownerId,a.scope.actorId,a.scope.payerId,n.department,common.leaf,a.binding.runId,'resource-fixture','persistent-space-resource','reserved-until-confirmed-suspended']);
  for(const category of ['service','active-compute','reserved-compute','cold-start','retained-storage','network'])for(const [version,start,end,rate]of [[1,0,20,1],[2,20,1000,2]])await f.admin.query('INSERT INTO fabric.model_resource_rates VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[f.tenant,f.space,resourceId,category,version,start,end,rate]);
  const receipts=new Map<string,ResourceReceipt>(),proofs=new Map<string,unknown>(),owner={ownerId,receipt:async(id:string)=>receipts.get(id),suspension:async(id:string)=>proofs.get(id)},repo=new ResourceRepository(f.uow,owner);
  const receipt=(start:number,end:number,category:ResourceReceipt['category']='reserved-compute',extra:Partial<ResourceReceipt>={})=>{const value=ResourceReceiptSchema.parse({schemaVersion:1,assurance:'deterministic-local-only',receiptId:randomUUID(),ownerId,tenantId:f.tenant,spaceId:f.space,resourceId,assignmentGeneration:0,category,start,end,rateVersion:start>=20?2:1,rateUnits:start>=20?2:1,originRunId:null,...extra});receipts.set(value.receiptId,value);return value;};
  const proof=(at:number)=>{const p=SuspendProofSchema.parse({schemaVersion:1,assurance:'deterministic-local-only',proofId:randomUUID(),ownerId,tenantId:f.tenant,spaceId:f.space,resourceId,assignmentGeneration:0,at,status:'confirmed-simulated-suspended'});proofs.set(p.proofId,p);return p;};
  async function process(holdAudit=false){const p=await launchOwned(resolve(f.root,'g1-model/node_modules/.cache/model-build/g1-model/tests/helpers/resource-caller-process.js'),'FABRIC_MODEL_RESOURCE_CALLER',{controllerDsn:f.fixtureDsn('controller'),authorityDsn:f.fixtureDsn('authority'),token:f.tokens[1],tenantId:f.tenant,spaceId:f.space,issuer:f.endpoints['issuer'],jwksUrl:f.endpoints['jwksUrl'],ownerId,receipts:[...receipts],proofs:[...proofs],holdAudit});children.push(p);return p;}
  async function call(p:OwnedProcess,kind:string,input:Record<string,unknown>){const requestId=randomUUID();p.child.send({kind,requestId,...input});await waitUntil(async()=>p.messages.some(m=>m['kind']==='result'&&m['requestId']===requestId),'resource '+kind);return p.messages.find(m=>m['kind']==='result'&&m['requestId']===requestId)!;}
  const snapshot=async()=>{const state=await n.snapshot();for(const table of ['model_resource_bindings','model_resource_rates','model_resource_intervals','model_resource_lifecycle'])state[table]=(await f.admin.query("SELECT coalesce(jsonb_agg(record ORDER BY record::text),'[]') AS rows FROM (SELECT to_jsonb(a) AS record FROM fabric."+table+" a) s")).rows[0].rows;return state;};
  return {n,f,a,b,resourceId,ownerId,common,repo,owner,receipts,proofs,receipt,proof,process,call,snapshot,close:async()=>{const cleanup=await Promise.allSettled(children.map(p=>stopOwned(p)));await n.close();const bad=cleanup.filter(r=>r.status==='rejected');if(bad.length)throw new AggregateError(bad.map(r=>(r as PromiseRejectedResult).reason));}};
 }catch(e){await Promise.allSettled(children.map(p=>stopOwned(p)));await n.close();throw e;}
}
