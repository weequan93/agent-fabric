import {condition, defineSignal, proxyActivities, setHandler} from '@temporalio/workflow';
import type {NativeActivities, NativeRef, CheckpointRef} from './temporal-contracts.js';
// Only durable control flow. No model, SQL, filesystem, credentials or policy here.
const {nativeTurn}=proxyActivities<NativeActivities>({startToCloseTimeout:'10 seconds',retry:{maximumAttempts:1}});
export const continueNative=defineSignal('continueNative');
export async function nativeConversation(ref: NativeRef): Promise<CheckpointRef> {
 let continued=false;setHandler(continueNative,()=>{continued=true;});
 await nativeTurn(ref,1);
 await condition(()=>continued);
 return await nativeTurn(ref,2);
}
