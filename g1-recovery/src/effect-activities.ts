import type {VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {FoundationError} from '../../g1-foundations/src/contracts.js';
import {bindingDigest,assertBinding} from './contracts.js';
import {EffectRepository} from './effect-repository.js';
import {downstreamReceiptSchema,receiptMatches,validateRequest,type EffectRequest} from './effect-protocol.js';
import {ioMeasurements} from './native-activities.js';
import type {NativeRef} from './temporal-contracts.js';
export interface EffectRef extends NativeRef {operationId:string;intentDigest:string}
export type Resolution={status:'confirmed';operationId:string;receiptDigest:string}|{status:'unresolved';operationId:string;nextAction:'lookup-original-operation'|'human-reconcile';reason:string};
export interface EffectActivities {dispatchEffect(ref:EffectRef):Promise<void>;reconcileEffect(ref:EffectRef):Promise<Resolution>;resumeEffect(ref:EffectRef):Promise<void>}
export function createEffectActivities(config:{repo:EffectRepository;scope:()=>Promise<VerifiedScope>;generation:number;endpoint:string;requestFor:(ref:EffectRef)=>Promise<EffectRequest>;measure:(r:Record<string,unknown>)=>void}):EffectActivities {
 const endpoint=new URL(config.endpoint);
 if(endpoint.hostname!=='127.0.0.1'||endpoint.protocol!=='http:')throw new Error('This qualified adapter supports owned loopback HTTP only');
 const unresolved=(ref:EffectRef,reason:string,human=false):Resolution=>({status:'unresolved',operationId:ref.operationId,nextAction:human?'human-reconcile':'lookup-original-operation',reason});
 async function scope(ref:EffectRef){const s=await config.scope();if(s.tenantId!==ref.tenantId||s.spaceId!==ref.spaceId)throw new FoundationError('UNAUTHORIZED');return s;}
 function validateRef(ref:EffectRef,effect:EffectRequest['intent']) {
  assertBinding({taskId:ref.taskId,runId:ref.runId,sessionId:ref.sessionId,bindingDigest:ref.bindingDigest,intentDigest:ref.intentDigest},{taskId:effect.run.task.taskId,runId:effect.run.runId,sessionId:effect.sessionId,bindingDigest:bindingDigest(effect.run),intentDigest:bindingDigest(effect)});
 }
 async function capabilities(){const r=await fetch(new URL('/capabilities',endpoint),{signal:AbortSignal.timeout(1000)});if(!r.ok)throw new Error('Capability lookup unavailable');return await r.json() as {dedup?:boolean;lookup?:boolean};}
 return {
  async dispatchEffect(ref){
   const s=await scope(ref),request=validateRequest(await config.requestFor(ref));validateRef(ref,request.intent);
   // Capability loss cannot turn an unknown operation into another send.
   const eligible=await config.repo.guardedIO(s,ref.operationId,config.generation,false,async effect=>{
    assertBinding(effect.binding,request.intent);const c=await capabilities();return c.dedup===true&&c.lookup===true&&effect.binding.downstream==='idempotency-and-lookup';
   });
   if(!eligible)throw new FoundationError('STALE_AUTHORITY','Explicit domain/human reconciliation required');
   if(!await config.repo.claim(s,ref.operationId,config.generation))return;
   await config.repo.guardedIO(await scope(ref),ref.operationId,config.generation,true,async effect=>{
    validateRef(ref,effect.binding);assertBinding(effect.binding,request.intent);
    ioMeasurements.externalWrites++;config.measure({kind:'external-post',operationId:ref.operationId,intentDigest:ref.intentDigest,generation:config.generation});
    const r=await fetch(new URL('/effects',endpoint),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('External acknowledgement unavailable');
    // Do not settle on transport ACK. Read-only lookup establishes the outcome.
    config.measure({kind:'external-ack',operationId:ref.operationId});
   });
  },
  async reconcileEffect(ref){
   const s=await scope(ref),effect=await config.repo.reconciling(s,ref.operationId,config.generation);validateRef(ref,effect.binding);
   if(effect.state==='confirmed')return {status:'confirmed',operationId:ref.operationId,receiptDigest:effect.receiptDigest!};
   if(!['unknown','reconciling'].includes(effect.state))return unresolved(ref,'No dispatched operation to reconcile',true);
   let result:Resolution;
   try {
    result=await config.repo.guardedIO(await scope(ref),ref.operationId,config.generation,false,async current=>{
     const c=await capabilities();
     if(current.binding.downstream!=='idempotency-and-lookup'||c.dedup!==true||c.lookup!==true)return unresolved(ref,'Unsafe or unsupported downstream recovery',true);
     config.measure({kind:'external-lookup',operationId:ref.operationId,generation:config.generation});
     const r=await fetch(new URL('/effects/'+ref.operationId,endpoint),{signal:AbortSignal.timeout(1000)});
     if(!r.ok)return unresolved(ref,'Lookup unavailable');
     const body=await r.json() as {status:string;receipt?:unknown};
     if(body.status!=='confirmed')return unresolved(ref,'Ambiguous or absent lookup',true);
     const receipt=downstreamReceiptSchema.parse(body.receipt);
     if(!receiptMatches(current.binding,receipt))return unresolved(ref,'Receipt target/digest mismatch',true);
     return {status:'confirmed',operationId:ref.operationId,receiptDigest:bindingDigest(receipt),receipt};
    });
   }catch(e){
    // Authority and commit uncertainty are surfaced; never converted to success.
    if(e instanceof FoundationError)throw e;
    result=unresolved(ref,'Lookup unavailable or invalid response');
   }
   if(result.status==='confirmed'){
    const receipt=(result as Resolution&{receipt:ReturnType<typeof downstreamReceiptSchema.parse>}).receipt;
    await config.repo.confirm(await scope(ref),ref.operationId,config.generation,receipt);
   }
   if(result.status==='unresolved')await config.repo.unresolved(await scope(ref),ref.operationId,config.generation,result);
   config.measure({kind:'effect-resolution',generation:config.generation,...result});
   return result.status==='confirmed'?{status:'confirmed',operationId:result.operationId,receiptDigest:result.receiptDigest}:result;
  },
  async resumeEffect(ref){const s=await scope(ref);await config.repo.guardedIO(s,ref.operationId,config.generation,false,async effect=>{validateRef(ref,effect.binding);});await config.repo.resume(s,ref.operationId,config.generation);}
 };
}
