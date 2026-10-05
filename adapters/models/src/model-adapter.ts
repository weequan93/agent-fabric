import { canonicalDigest, nonEmptyString, nonNegativeInteger, record, requireCondition, sameScope, type ScopeRef } from '../../../engine/contracts/src/identity.js';
import { parseScope } from '../../../engine/contracts/src/task-envelope.js';
import type { BudgetPort } from '../../../engine/contracts/src/budget.js';
import { ModelProfileRegistry, validateProfileRequest, type ProfileRequest, type QualifiedModelProfile } from '../../../engine/profiles/src/capabilities.js';

export interface ModelContextRecord {sourceId:string;scope:ScopeRef;audience:string[];trust:'trusted'|'untrusted';observedAt:number;content:string}
export interface ModelContextCapsule {scope:ScopeRef;actorId:string;requirementsRevision:number;authorityRevision:number;requirements:string;uncertainty:string[];failedPlans:string[];pendingEffects:string[];checks:string[];nextSafeAction:string;records:ModelContextRecord[];compiledAt:number;digest:string}
export interface ModelCall {scope:ScopeRef;actorId:string;payerId:string;runId:string;operationId:string;reservationId:string;allowanceId:string;units:number;profileRequest:ProfileRequest;capsule:ModelContextCapsule}
export interface ModelProviderResult {output:string;usageUnits:number|null;receiptId:string|null}
export type ModelCallResult = {status:'waiting';reason:string;nextAction:string}|{status:'unknown';reason:string;reservationId:string;profile:QualifiedModelProfile;manifestDigest:string}|{status:'completed';output:string;profile:QualifiedModelProfile;manifestDigest:string;receiptId:string;usageUnits:number};
export interface ControlledModelOptions {profiles:ModelProfileRegistry;budget:BudgetPort;authorize:(call:ModelCall)=>number;validateContext:(capsule:ModelContextCapsule,authorityRevision:number)=>void;invoke:(profile:QualifiedModelProfile,capsule:ModelContextCapsule)=>Promise<ModelProviderResult>}
/** No VM path or live provider is supplied by this deterministic adapter. */
export class ControlledModelAdapter {
  private readonly calls=new Map<string,{digest:string;result:Promise<ModelCallResult>}>();
  constructor(private readonly options:ControlledModelOptions) {}
  call(value:ModelCall):Promise<ModelCallResult> {
    canonicalDigest(value);record(value,['scope','actorId','payerId','runId','operationId','reservationId','allowanceId','units','profileRequest','capsule']);
    const call=structuredClone(value);call.scope=parseScope(call.scope);for(const id of [call.actorId,call.payerId,call.runId,call.operationId,call.reservationId,call.allowanceId])nonEmptyString(id);nonNegativeInteger(call.units);call.profileRequest=validateProfileRequest(call.profileRequest);
    const authorityRevision=nonNegativeInteger(this.options.authorize(structuredClone(call)));this.options.validateContext(structuredClone(call.capsule),authorityRevision);
    requireCondition(sameScope(parseScope(call.capsule.scope),call.scope)&&call.capsule.actorId===call.actorId&&call.capsule.authorityRevision===authorityRevision,'UNAUTHORIZED','Compiled context must bind current actor, scope and authority');
    const id=JSON.stringify([call.scope.tenantId,call.scope.spaceId,call.operationId]);const requestDigest=canonicalDigest(call);const existing=this.calls.get(id);
    requireCondition(existing===undefined||existing.digest===requestDigest,'IDEMPOTENCY_CONFLICT','Model operation identity is immutable');
    const assertCurrent=()=>{const revision=nonNegativeInteger(this.options.authorize(structuredClone(call)));this.options.validateContext(structuredClone(call.capsule),revision);requireCondition(revision===authorityRevision,'UNAUTHORIZED','Current compiled authority required before returning model output');};
    if(existing!==undefined)return existing.result.then(result=>{assertCurrent();return structuredClone(result);});
    const selection=this.options.profiles.select(call.profileRequest);if(selection.status==='waiting')return Promise.resolve(selection);
    const reservation=this.options.budget.reserve({reservationId:call.reservationId,operationId:call.operationId,scope:call.scope,actorId:call.actorId,payerId:call.payerId,runId:call.runId,purpose:'task',allowanceId:call.allowanceId,units:call.units});
    requireCondition(reservation.state==='reserved'&&reservation.reservationId===call.reservationId&&reservation.purpose==='task'&&reservation.operationId===call.operationId&&reservation.actorId===call.actorId&&reservation.payerId===call.payerId&&reservation.runId===call.runId&&sameScope(reservation.scope,call.scope)&&reservation.allowanceId===call.allowanceId&&reservation.units===call.units,'UNKNOWN_EFFECT_REQUIRES_RECONCILIATION','Only an exact fresh reservation permits model invocation');
    const result=Promise.resolve().then(async():Promise<ModelCallResult>=>{
      try {const revision=nonNegativeInteger(this.options.authorize(structuredClone(call)));this.options.validateContext(structuredClone(call.capsule),revision);requireCondition(revision===authorityRevision,'UNAUTHORIZED','Context stale before invocation');const currentProfile=this.options.profiles.get(selection.profile.profileId);requireCondition(currentProfile.available&&canonicalDigest(currentProfile.capabilities)===canonicalDigest(selection.profile.capabilities),'REQUIRED_CAPABILITY_UNSUPPORTED','Approved route changed before invocation');}
      catch(error){this.options.budget.release(call.reservationId);throw error;}
      let response:ModelProviderResult;
      try {
        response=await this.options.invoke(structuredClone(selection.profile),structuredClone(call.capsule));canonicalDigest(response);record(response,['output','usageUnits','receiptId']);requireCondition(typeof response.output==='string','INVALID_SCHEMA','Model output must be text');
        if(response.usageUnits===null||response.receiptId===null){this.options.budget.markUnknown(call.reservationId);return {status:'unknown',reason:'provider usage requires reconciliation',reservationId:call.reservationId,profile:structuredClone(selection.profile),manifestDigest:selection.profile.capabilities.manifestDigest};}
        nonNegativeInteger(response.usageUnits);nonEmptyString(response.receiptId);
      } catch {this.options.budget.markUnknown(call.reservationId);return {status:'unknown',reason:'provider acknowledgement or usage unknown; do not blindly retry',reservationId:call.reservationId,profile:structuredClone(selection.profile),manifestDigest:selection.profile.capabilities.manifestDigest};}
      this.options.budget.settle({reservationId:call.reservationId,receiptId:response.receiptId,units:response.usageUnits});
      const revision=nonNegativeInteger(this.options.authorize(structuredClone(call)));this.options.validateContext(structuredClone(call.capsule),revision);requireCondition(revision===authorityRevision,'UNAUTHORIZED','Current authority required before returning model output');
      return {status:'completed',output:response.output,profile:structuredClone(selection.profile),manifestDigest:selection.profile.capabilities.manifestDigest,receiptId:response.receiptId,usageUnits:response.usageUnits};
    });
    this.calls.set(id,{digest:requestDigest,result});return result.then(response=>{assertCurrent();return structuredClone(response);});
  }
}
