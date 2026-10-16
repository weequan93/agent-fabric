import type {AdmissionRecord,Invocation} from './admission.js';
/** Authorized caller obtains records through admission first; projections grant nothing. */
export function admissionView(record:AdmissionRecord,invocation:Invocation|null=null){
 return {taskId:record.taskId,preflightDigest:record.preflightDigest,preflight:record.preflight,
  preservedWork:{text:record.text,envelope:record.preflight.envelope},status:invocation?.state??'awaiting-request',
  answer:invocation?.answer??null,cost:record.preflight.cost,
  resolver:invocation?.state==='unknown'?'original-operation-owner':'task-requester',
  nextAction:invocation?.state==='unknown'?'Lookup original operation; automatic replay disabled':'Review current preflight and required gates',
  replayAllowed:false};
}
