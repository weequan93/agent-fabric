import { object,uuid,revision,enumeration,list,literal } from './decoder.js';
import { demand } from './errors.js';
import type { NativeSnapshot } from './native-repository.js';
import type { SqlTransaction,VerifiedScope,WaitRecord } from './contracts.js';
export const ComputerPreflightSchema=object({schemaVersion:literal(1),sessionId:uuid,taskId:uuid,runId:uuid,resourceId:uuid,policyRevision:revision,requirementsRevision:revision,generation:revision,
 phase:enumeration('preparing','simulated-ready'),capability:literal('simulated-computer'),requiredGrant:literal('computer:use'),costCategories:list(enumeration('reserved-compute','active-compute','cold-start','retained-storage','network'),5),chargePolicy:literal('reserved-until-confirmed-suspended'),assurance:literal('deterministic-local-only')});
/** Visible, explicitly advanced simulated preflight. No shell/VM/enrollment hook. */
export class NativeComputer{
 async admit(tx:SqlTransaction,scope:VerifiedScope,s:NativeSnapshot):Promise<WaitRecord['reason']|null>{
  if(s.admission.executionClass!=='computer')return null;
  if(s.binding.intent!=='Act'||!scope.grants.includes('computer:use')||s.admission.computerCapability!=='simulated-computer')return 'permission';
  if(s.admission.resourceId===null)return 'resource';
  const ids=[scope.tenantId,scope.spaceId],assignment=(await tx.query('SELECT resource_id FROM fabric.model_computer_assignments WHERE tenant_id=$1 AND space_id=$2',ids)).rows[0];
  if(assignment&&assignment['resource_id']!==s.admission.resourceId)return 'resource';
  if(!assignment)await tx.query('INSERT INTO fabric.model_computer_assignments VALUES($1,$2,$3)',[...ids,s.admission.resourceId]);
  const row=(await tx.query('SELECT record FROM fabric.model_computer_preflights WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[...ids,s.binding.sessionId])).rows[0];
  if(!row){
   const record=ComputerPreflightSchema.parse({schemaVersion:1,sessionId:s.binding.sessionId,taskId:s.binding.taskId,runId:s.binding.runId,resourceId:s.admission.resourceId,policyRevision:s.binding.policyRevision,requirementsRevision:s.binding.requirementsRevision,generation:s.binding.resourceGeneration,phase:'preparing',capability:'simulated-computer',requiredGrant:'computer:use',costCategories:['reserved-compute','active-compute','cold-start','retained-storage','network'],chargePolicy:'reserved-until-confirmed-suspended',assurance:'deterministic-local-only'});
   await tx.query('INSERT INTO fabric.model_computer_preflights VALUES($1,$2,$3,$4,$5::jsonb)',[...ids,s.binding.sessionId,s.admission.resourceId,JSON.stringify(record)]);return 'resource';
  }
  const record=ComputerPreflightSchema.parse(row['record']);demand(record.policyRevision===s.binding.policyRevision&&record.requirementsRevision===s.binding.requirementsRevision&&record.generation===s.binding.resourceGeneration&&record.resourceId===s.admission.resourceId,'STALE_FENCE');
  if(record.phase==='preparing'){
   // Only a fresh explicit resume may advance a visible preflight. Polling or
   // reconnect never enters this branch or silently allocates a second machine.
   if(s.control.wait?.reason!=='resource')return 'resource';
   await tx.query('UPDATE fabric.model_computer_preflights SET record=$4::jsonb WHERE tenant_id=$1 AND space_id=$2 AND session_id=$3',[...ids,s.binding.sessionId,JSON.stringify({...record,phase:'simulated-ready'})]);
  }
  return null;
 }
}
