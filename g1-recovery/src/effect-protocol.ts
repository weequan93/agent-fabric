import {createHash} from 'node:crypto';
import {object,uuid,digest,text,positive,type Value} from './schema.js';
import {bindingDigest,effectBindingSchema,type EffectBinding} from './contracts.js';
export const downstreamReceiptSchema=object({operationId:uuid,intentDigest:digest,target:text,argsDigest:digest,artifactDigest:digest,writeNumber:positive});
export type DownstreamReceipt=Value<typeof downstreamReceiptSchema>;
export interface EffectRequest {intent:EffectBinding;arguments:unknown;artifact:string}
export function validateRequest(raw:unknown):EffectRequest {
 if(!raw || typeof raw!=='object')throw new Error('Complete request required');
 const r=raw as EffectRequest;if(Object.keys(r).sort().join(',')!=='arguments,artifact,intent')throw new Error('Exact request fields required');
 const intent=effectBindingSchema.parse(r.intent);
 if(!r.arguments||typeof r.arguments!=='object'||Array.isArray(r.arguments)||(r.arguments as Record<string,unknown>).artifactDigest!==intent.artifactDigest)throw new Error('Approved normalized arguments must bind artifact digest');
 if(typeof r.artifact!=='string'||bindingDigest(r.arguments)!==intent.argsDigest||bindingDigest(r.artifact)!==intent.artifactDigest)throw new Error('Argument/artifact digest mismatch');
 return {intent,arguments:r.arguments,artifact:r.artifact};
}
export function effectKey(operationId:string,phase:string):string {
 const h=createHash('sha256').update('effect:'+operationId+':'+phase).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
export function receiptMatches(intent:EffectBinding,receipt:DownstreamReceipt):boolean {
 return receipt.operationId===intent.operationId&&receipt.intentDigest===bindingDigest(intent)&&receipt.target===intent.target&&receipt.argsDigest===intent.argsDigest&&receipt.artifactDigest===intent.artifactDigest;
}
