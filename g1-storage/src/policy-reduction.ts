import { StoragePolicySchema } from './authority.js';
import { demand } from './errors.js';
export type StoragePolicy=ReturnType<typeof StoragePolicySchema.parse>;
/** Synthetic enrolled policy can only tighten through this owner. Broader policy
 * enrollment needs a separately authorized path. Keep maintenance for recovery. */
export function assertPolicyReduction(previous:StoragePolicy,next:StoragePolicy){
 const operations=next.operations;
 demand(new Set(operations).size===operations.length&&operations.includes('maintenance')
  &&operations.every(op=>previous.operations.includes(op)),'UNAUTHORIZED');
 demand(Object.values(previous.periods).every(n=>n<=86400)
  &&Object.entries(next.periods).every(([key,n])=>n<=previous.periods[key as keyof StoragePolicy['periods']]&&n<=86400),'RETENTION_RESTRICTED');
 demand(operations.length<previous.operations.length
  ||Object.entries(next.periods).some(([key,n])=>n<previous.periods[key as keyof StoragePolicy['periods']]),'IDEMPOTENCY_CONFLICT');
}
