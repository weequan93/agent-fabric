import {createHash} from 'node:crypto';
import type {VerifiedScope} from '../../g1-foundations/src/contracts.js';
import {FoundationError} from '../../g1-foundations/src/contracts.js';
import {RecoveryRepository} from './repository.js';
import {assertBinding,bindingDigest,type Session} from './contracts.js';
import {createDeterministicSessionAdapter,type SessionEvent} from './test-session.js';
import type {NativeActivities} from './temporal-contracts.js';
export const ioMeasurements={modelCalls:0,checkpointWrites:0,externalWrites:0};
function keyFor(runId:string,sequence:number):string {
 const hex=createHash('sha256').update('native-turn:'+runId+':'+sequence).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
function tape(session:Session):SessionEvent[] {
 return [{binding:session.binding,sessionId:session.sessionId,sequence:1,kind:'proposal',proposal:{operationId:keyFor(session.binding.runId,0),target:'synthetic://read-only',resourceId:session.sessionId,action:'synthetic:read',argsDigest:session.contextDigest,effectClass:'read'},wait:null,answerDigest:null},
 {binding:session.binding,sessionId:session.sessionId,sequence:2,kind:'answer',proposal:null,wait:null,answerDigest:bindingDigest({answer:'local deterministic answer',contextDigest:session.contextDigest})}];
}
/** Controller-hosted activities. The adapter receives records only, never a pool. */
export function createNativeActivities(config:{repo:RecoveryRepository;scope:()=>Promise<VerifiedScope>;workerGeneration:number;measure:(record:Record<string,unknown>)=>void}):NativeActivities {
 return {async nativeTurn(ref,sequence) {
  if(sequence!==1 && sequence!==2)throw new FoundationError('INVALID_INPUT');
  const scope=await config.scope();
  if(scope.tenantId!==ref.tenantId || scope.spaceId!==ref.spaceId)throw new FoundationError('UNAUTHORIZED');
  const snap=await config.repo.get(scope,ref.runId);
  if(!snap || snap.run.binding.task.taskId!==ref.taskId || bindingDigest(snap.run.binding)!==ref.bindingDigest)throw new FoundationError('STALE_AUTHORITY');
  const session=snap.sessions.find(s=>s.sessionId===ref.sessionId);if(!session)throw new FoundationError('STALE_AUTHORITY');
  const value={sessionId:session.sessionId,sequence},key=keyFor(ref.runId,sequence);
  const historyBefore=await config.repo.nativeTranscript(scope,session.sessionId);
  config.measure({kind:'restore',runId:ref.runId,sessionId:session.sessionId,cursor:session.cursor,loadedEvents:historyBefore.length,workerGeneration:config.workerGeneration});
  await config.repo.nativeCheckpoint(scope,{commandId:key,key,runId:ref.runId,expectedRevision:snap.run.revision,expiresAt:snap.leases[0]!.expiresAt,payloadDigest:bindingDigest(value)},value,config.workerGeneration,(current,history)=>{
   assertBinding(historyBefore,history);
   ioMeasurements.modelCalls++;config.measure({kind:'model',sequence,workerGeneration:config.workerGeneration,recordedEvents:history.length});
   return createDeterministicSessionAdapter(current,tape(current)).next(current,history);
  });
  // Includes a recovered duplicate receipt; model instrumentation distinguishes it.
  ioMeasurements.checkpointWrites++;config.measure({kind:'checkpoint-ack',sequence,workerGeneration:config.workerGeneration});
  const history=await config.repo.nativeTranscript(scope,session.sessionId),event=history[sequence-1];if(!event)throw new Error('Committed native event absent');
  return {runId:ref.runId,sessionId:session.sessionId,sequence,eventDigest:bindingDigest(event)};
 }};
}
