import { object,literal,uuid,revision,positive,nullable,timestamp,enumeration,refined } from './decoder.js';
import { safeMultiply,positiveUnits } from './arithmetic.js';
export const ResourceCategorySchema=enumeration('service','active-compute','reserved-compute','cold-start','retained-storage','network');
export const ResourceReceiptSchema=refined(object({schemaVersion:literal(1),assurance:literal('deterministic-local-only'),receiptId:uuid,ownerId:uuid,tenantId:uuid,spaceId:uuid,resourceId:uuid,assignmentGeneration:revision,category:ResourceCategorySchema,start:revision,end:positive,rateVersion:positive,rateUnits:positive,originRunId:nullable(uuid)}),r=>r.end>r.start);
export type ResourceReceipt=ReturnType<typeof ResourceReceiptSchema.parse>;
export const ResourceCommandSchema=object({resourceId:uuid,key:uuid,expiresAt:timestamp,at:revision,action:enumeration('archive','stop','request-suspend','declare-delete-retention')});
export const SuspendProofSchema=object({schemaVersion:literal(1),assurance:literal('deterministic-local-only'),proofId:uuid,ownerId:uuid,tenantId:uuid,spaceId:uuid,resourceId:uuid,assignmentGeneration:revision,at:revision,status:literal('confirmed-simulated-suspended')});
export type SuspendProof=ReturnType<typeof SuspendProofSchema.parse>;
/** Installed receipt channel, never an operator POST of measured usage or proof. */
export interface SyntheticResourceOwner{readonly ownerId:string;receipt(id:string):Promise<unknown>;suspension(id:string):Promise<unknown>}
export function resourceUnits(r:ResourceReceipt):number{return positiveUnits(safeMultiply(r.end-r.start,r.rateUnits));}
