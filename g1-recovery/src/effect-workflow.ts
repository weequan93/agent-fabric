import {condition,defineSignal,proxyActivities,setHandler} from '@temporalio/workflow';
import type {EffectActivities,EffectRef,Resolution} from './effect-activities.js';
import type {NativeActivities,CheckpointRef} from './temporal-contracts.js';
const {dispatchEffect,reconcileEffect,resumeEffect}=proxyActivities<EffectActivities>({startToCloseTimeout:'4 seconds',retry:{maximumAttempts:1}});
const {nativeTurn}=proxyActivities<NativeActivities>({startToCloseTimeout:'10 seconds',retry:{maximumAttempts:1}});
export const recoverEffect=defineSignal('recoverEffect');
export async function effectRecovery(ref:EffectRef):Promise<{resolution:Resolution;continuation:CheckpointRef|null}> {
 let recovery=false;setHandler(recoverEffect,()=>{recovery=true;});
 try{await dispatchEffect(ref);}catch{/* Recorded failed/timeout activity is an unknown outcome. No retry. */}
 await condition(()=>recovery);
 const resolution=await reconcileEffect(ref);
 if(resolution.status!=='confirmed')return {resolution,continuation:null};
 await resumeEffect(ref);
 return {resolution,continuation:await nativeTurn(ref,1)};
}
