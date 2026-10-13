import type { Value } from './decoder.js';
import type * as S from './schema.js';
export type { VerifiedScope, SqlTransaction, AsyncUnitOfWork, SyntheticResourceOwner } from './owners.js';
export type Knowledge = Value<typeof S.KnowledgeSchema>;
export type ContentClass = Value<typeof S.ContentClassSchema>;
export type CipherEnvelope = Value<typeof S.CipherEnvelopeSchema>;
export type CipherBinding = Value<typeof S.BindingSchema>;
export type RetrievalManifest = Value<typeof S.RetrievalManifestSchema>;
export type SaveCommand = Value<typeof S.SaveCommandSchema>;
export type AskCommand = Value<typeof S.AskCommandSchema>;
export type RestoreResult = Value<typeof S.RestoreResultSchema>;
/** Installed capability; never part of caller JSON, archives, argv or logs. */
export interface KeyResolver {
 resolve(binding:CipherBinding):Promise<{readonly dataKey:Uint8Array;readonly digestKey:Uint8Array}>;
}
export interface CurrentStorageAuthority {
 /** Locks and checks enrolled epoch anchor, policy, heads, restrictions, dependencies and full F02 audience. */
 assertCurrent(tx:import('./owners.js').SqlTransaction,scope:import('./owners.js').VerifiedScope,
  intent:{readonly purpose:'ask'|'maintenance';readonly sessionId:string;readonly expiresAt:string}):Promise<void>;
}
