import { object,uuid,positive,digest,timestamp } from './decoder.js';
import { ContentClassSchema } from './schema.js';
import type { VerifiedScope,SqlTransaction } from './owners.js';
/** Installed material owner supplies controls only. No caller, archive or worker
 * may install this capability. Ciphertext preparation/verification is a separate
 * owner; this interface does not attest encryption or durable payload existence. */
export const HeadMaterialSchema=object({tenantId:uuid,spaceId:uuid,class:ContentClassSchema,id:uuid,
 revision:positive,witness:digest,keyId:uuid,generation:uuid,sourceTaskId:uuid,expiresAt:timestamp});
export type HeadMaterial=ReturnType<typeof HeadMaterialSchema.parse>;
export interface HeadMaterialResolver {
 resolve(tx:SqlTransaction,scope:VerifiedScope,materialId:string):Promise<HeadMaterial|undefined>;
}
