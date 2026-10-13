import type { VerifiedScope } from './contracts.js';
import type { NativeSession } from './native-session.js';
import { currentScope } from './model-repository.js';
import { randomUUID } from 'node:crypto';
import { reserveEstimate,encodedBytes,PRICING_VERSION } from './arithmetic.js';
import type { ProfileChoice } from './profile.js';
import { demand } from './errors.js';
import { units } from './arithmetic.js';
/** Read from the same scoped durable owners. No raw capsule, output, source,
 * private reasoning, gateway exception, foreign account or identity export. */
export async function operatorInspect(session:NativeSession,scope:VerifiedScope,sessionId:string){
 const view=await session.inspect(scope,sessionId);
 return session.repository.uow.withScope(scope,async tx=>{
  const s=await session.repository.load(tx,scope,sessionId);
  const selection=session.ports.profiles.select({need:s.admission.need,pins:s.binding.versions,now:new Date().toISOString(),choice:s.control.choice});
  const raw=(await tx.query('SELECT fabric.model_operator_accounting($1) AS details',[sessionId])).rows[0]?.['details'] as {accounting:{attemptCount:number;retryCount:number;estimate:number;measured:number;settled:number;heldReserve:number;categories:Record<string,number>};allowances:{allowanceId:string;revision:number;ceiling:number;reserved:number;settled:number;remaining:number}[]};
  const {accounting}=raw;
  const allowances=(await tx.query('SELECT fabric.model_family_allowances($1) AS allowances',[s.binding.runId])).rows[0]?.['allowances'] as typeof raw.allowances;
  for(const value of [accounting.attemptCount,accounting.retryCount,accounting.estimate,accounting.measured,accounting.settled,accounting.heldReserve,...Object.values(accounting.categories)])units(value);
  await currentScope(tx,scope);
  return {view,selection:selection.status==='waiting'?{status:selection.status,reason:selection.reason,refusal:selection.refusal,allowedNextActions:selection.allowedNextActions}: {status:selection.status,profileId:selection.profile.profileId,fallbackReason:selection.fallbackReason},accounting,allowances,
   nextAction:view.wait?.reason==='unknown-usage'?'Look up the original operation; do not replay':view.wait?.reason==='budget'?'Ask the budget owner for a synthetic allowance change, then explicitly resume':view.wait?.reason==='approval'?'Wait for current approval; polling uses no model turns':view.wait?.reason==='model-unavailable'?(selection.status==='selected'?'Profile is currently permitted; explicitly resume preserved work':'Choose a currently permitted qualified profile'):view.wait?.reason==='resource'?'Inspect the simulated assignment and explicitly resume when available':'Inspect committed work or submit an explicit current command',assurance:'deterministic-local-only',realBilling:'unqualified',replayAllowed:false};
 });
}

export async function operatorPreflight(session:NativeSession,scope:VerifiedScope,input:{sessionId:string;input:string;choice:ProfileChoice|null}){
 const s=await session.repository.snapshot(scope,input.sessionId);
 await session.repository.uow.withScope(scope,tx=>session.repository.fresh(tx,scope,s));
 demand(Buffer.byteLength(input.input)<=s.control.inputLimitBytes,'INTENT_EXCEEDED');
 const choice=input.choice??s.control.choice;
 const selected=session.ports.profiles.select({need:s.admission.need,pins:s.binding.versions,now:new Date().toISOString(),choice});
 // Saved work/accounting and a proposed choice are different observations. Do
 // not project the saved selection onto an estimate encoded for another profile.
 const historical=await operatorInspect(session,scope,input.sessionId);
 if(selected.status==='waiting')return {historical,proposed:{choice,selection:{status:selected.status,choiceLabel:selected.choiceLabel,reason:selected.reason,refusal:selected.refusal,allowedNextActions:selected.allowedNextActions},
  nextAction:'Waiting: model unavailable ('+selected.refusal+'). Choose a currently permitted qualified profile or contact the administrator'},plannedEstimate:null,estimateBasis:null,dispatchAllowed:false};
 const request=await session.ports.encode(scope,s,selected.profile,input.input,{tenantId:scope.tenantId,spaceId:scope.spaceId,operationId:randomUUID(),attemptId:randomUUID(),reservationId:randomUUID()});
 demand(request.profileDigest===selected.profile.profileDigest,'CHECK_BINDING_MISMATCH');
 const p=selected.profile;
 return {historical,proposed:{choice,selection:{status:selected.status,choiceLabel:selected.choiceLabel,profileId:p.profileId,profileDigest:p.profileDigest,provider:p.provider,model:p.model,modelVersion:p.modelVersion,deployment:p.deployment,route:p.route,region:p.region,modality:selected.modality,dataPolicy:selected.dataPolicy,estimatedCostClass:selected.estimatedCostClass,fallbackReason:selected.fallbackReason},
  nextAction:'Preview only; submit an explicit current command to use this proposed choice'},plannedEstimate:reserveEstimate(request.payload,request.outputCap),estimateBasis:{profileDigest:request.profileDigest,encodedBytes:encodedBytes(request.payload),outputCap:request.outputCap,serviceUnits:2,pricingVersion:PRICING_VERSION},dispatchAllowed:true,estimateGuarantee:'informational; atomic admission rechecks current state'};
}
