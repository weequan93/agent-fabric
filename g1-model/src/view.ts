import { replaySession } from './native-imports.js';
import { hash } from './model-repository.js';
import type { NativeSnapshot } from './native-repository.js';
import { units,safeAdd } from './arithmetic.js';
import { ResourceReceiptSchema,resourceUnits } from './resource-contract.js';
/** No raw model/source/private-state, audit payloads, foreign balances or errors. */
export function nativeView(s:NativeSnapshot,costs:{reserved:number;actual:number;pendingExposure:number}){
 const state=replaySession(s.origin,s.events);units(costs.reserved);units(costs.actual);units(costs.pendingExposure);
 return Object.freeze({schemaVersion:1 as const,sessionId:s.binding.sessionId,taskId:s.binding.taskId,runId:s.binding.runId,
  revision:s.revision,state:s.stopped?'cancelling':state.run.state,cancellationGeneration:s.cancellationGeneration,
  choiceLabel:s.control.choice.pin===null?'Auto - organization approved':'Qualified profile '+s.control.choice.pin,
  wait:s.control.wait,pendingModel:state.pendingModel,committedWorkDigest:hash(s.events),modelResultCount:state.modelResponses.length,
  lastResultDigest:state.modelResponses.length?hash(state.modelResponses.at(-1)):null,
  attribution:{payerId:s.binding.payerId,costCenter:s.binding.costCenter,purpose:s.binding.purpose,category:s.binding.category},
  costs:{label:'synthetic-utf8-byte-unit',...costs,maximumLocalExposure:safeAdd(costs.reserved,costs.pendingExposure),settlementModelGuarantee:'unsupported; local control-only reconciliation',realBilling:'unqualified'},
  computer:{executionClass:s.admission.executionClass,assignmentId:s.admission.resourceId,realProvisioning:'unqualified'},replayAllowed:false as const});
}

/** Reference shared charges; only allocated task charges are task economic totals. */
export function resourceCostView(input:{resourceId:string;assignmentGeneration:number;payerId:string;costCenter:string;purpose:string;allowanceId:string;runId:string|null;modelCategoryTotals:{model:number;service:number}|null;modelLiability:{reserved:number;actual:number;pendingExposure:number}|null;intervals:readonly {receipt:import('./resource-contract.js').ResourceReceipt;settled:boolean}[];lifecycle:readonly {action:string;at:number}[]}){
 const categories:Record<string,number>={model:0,service:0,'active-compute':0,'reserved-compute':0,'cold-start':0,'retained-storage':0,network:0};
 let spaceActual=0,sharedActual=0,allocatedTaskActual=0,reserved=0;
 const charges=input.intervals.map(({receipt:raw,settled})=>{
  const r=ResourceReceiptSchema.parse(raw),amount=resourceUnits(r);
  if(settled){spaceActual=safeAdd(spaceActual,amount);categories[r.category]=safeAdd(categories[r.category]!,amount);if(r.originRunId===null)sharedActual=safeAdd(sharedActual,amount);else if(r.originRunId===input.runId)allocatedTaskActual=safeAdd(allocatedTaskActual,amount);}else reserved=safeAdd(reserved,amount);
  return {chargeId:r.receiptId,category:r.category,start:r.start,end:r.end,rateVersion:r.rateVersion,amount,settled,allocation:r.originRunId===null?'unallocated-shared-cost':'original-run',originRunId:r.originRunId};
 });
 if(input.modelCategoryTotals){units(input.modelCategoryTotals.model);units(input.modelCategoryTotals.service);}
 if(input.modelLiability){units(input.modelLiability.reserved);units(input.modelLiability.actual);units(input.modelLiability.pendingExposure);}
 const confirmed=input.lifecycle.find(e=>e.action==='confirmed-simulated-suspended');
 return Object.freeze({schemaVersion:1,resourceId:input.resourceId,assignmentGeneration:input.assignmentGeneration,attribution:{payerId:input.payerId,costCenter:input.costCenter,purpose:input.purpose,spaceAllowanceId:input.allowanceId},
  label:'synthetic-resource-interval-unit',assurance:'deterministic-local-only',actualMeters:'unsupported; real compute/cold-start/storage/network billing unqualified',policy:'reserved-until-confirmed-suspended',
  costs:{scope:'resource-ledger-only',spaceActual,sharedActual,allocatedTaskActual,reserved,categories},modelLiability:input.modelLiability===null?null:{...input.modelLiability,maximumLocalExposure:safeAdd(input.modelLiability.reserved,input.modelLiability.pendingExposure),categoryTotals:input.modelCategoryTotals,realBilling:'unqualified'},
  charges:input.runId===null?charges:charges.filter(r=>r.originRunId===null||r.originRunId===input.runId),
  lifecycle:input.lifecycle,compute:confirmed?'confirmed-simulated-suspended':'billable; suspension/termination unconfirmed',confirmedSuspendAt:confirmed?.at??null,storage:'retained; continuing charges under retention policy',
  archiveEffect:'conversation only',stopEffect:'native Task dispatch fence; no resource termination proof',deleteEffect:'declared retention transition; no real deletion',settlement:{modelUnits:0,productionReserveGuarantee:'unsupported',modelPendingExposurePerClaimedAttempt:5},replayAllowed:false});
}
