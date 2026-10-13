import { object,uuid,positive,digest } from './decoder.js';
import type { SqlTransaction,VerifiedScope } from './owners.js';
/** Installed routing capability; no request or archive supplies source scope. */
export const ShareMaterialSchema=object({tenantId:uuid,destinationSpaceId:uuid,relationId:uuid,sourceSpaceId:uuid,source:object({id:uuid,revision:positive,witness:digest})});
export type ShareMaterial=ReturnType<typeof ShareMaterialSchema.parse>;
export interface ShareMaterialResolver {resolve(tx:SqlTransaction,scope:VerifiedScope,materialId:string):Promise<ShareMaterial|undefined>}
