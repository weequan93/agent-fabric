import type { Value } from './decoder.js';
import type * as Schema from './schema.js';
export type { Units } from './arithmetic.js';
export type { AsyncUnitOfWork, SqlTransaction, VerifiedScope, ScopeRef } from './native-imports.js';
export type OperatingProfile = Value<typeof Schema.OperatingProfileSchema>;
export type ModelCapabilities = Value<typeof Schema.CapabilitiesSchema>;
export type LocalQualification = Value<typeof Schema.LocalQualificationSchema>;
export type QualifiedProfile = Value<typeof Schema.QualifiedProfileSchema>;
export type TaskCallBinding = Value<typeof Schema.TaskCallBindingSchema>;
export type VersionPins = Value<typeof Schema.VersionPinsSchema>;
export type ContextManifest = Value<typeof Schema.ContextManifestSchema>;
export type TaskCapsule = Value<typeof Schema.TaskCapsuleSchema>;
export type OriginalCall = Value<typeof Schema.OriginalCallSchema>;
export type EncodedRequest = Value<typeof Schema.EncodedRequestSchema>;
export type ModelOperation = Value<typeof Schema.ModelOperationSchema>;
export type ModelAttempt = Value<typeof Schema.ModelAttemptSchema>;
export type UsageReceipt = Value<typeof Schema.UsageReceiptSchema>;
export type OwnerObservation = Value<typeof Schema.OwnerObservationSchema>;
export type WaitRecord = Value<typeof Schema.WaitSchema>;
export type ResourceCharge = Value<typeof Schema.ResourceChargeSchema>;
export type ModelEvent = Value<typeof Schema.ModelEventSchema>;
export type CostCategory = Value<typeof Schema.CostCategorySchema>;
export type LocalConfig = Value<typeof Schema.LocalConfigSchema>;

/** Installed trusted original owner only; caller JSON cannot mint a receipt/seal. */
export interface ModelAdapterPort {
 accept(request: EncodedRequest): Promise<OwnerObservation>;
 lookup(original: OriginalCall): Promise<OwnerObservation>;
 cancel(original: OriginalCall): Promise<OwnerObservation>;
 sealUnaccepted(original: OriginalCall, dispatchEpoch: number): Promise<OwnerObservation>;
}
/** Implementations participate in the authenticated caller transaction, no nested commit. */
export interface AsyncBudgetPort {
 reserve(original: OriginalCall, units: number): Promise<void>;
 markUnknown(original: OriginalCall): Promise<void>;
 settle(receipt: UsageReceipt): Promise<void>;
 release(proof: Extract<OwnerObservation, { status: 'sealed-not-accepted' }>): Promise<void>;
}
export type ModelResolution =
 | { readonly status: 'known'; readonly receipt: UsageReceipt }
 | { readonly status: 'safely-failed'; readonly proof: Extract<OwnerObservation, { status: 'sealed-not-accepted' }> }
 | { readonly status: 'unknown'; readonly original: OriginalCall; readonly replayAllowed: false };
/** A persisted claim is history, never a transferable/restart invocation permit. */
export interface PreparedAttempt {
 readonly operation: ModelOperation; readonly attempt: ModelAttempt;
 readonly acknowledgedCommit: boolean;
}
export interface SourceCompilerPort {
 authorizeSource(sourceId: string): Promise<void>;
 retrieveAuthorized(sourceId: string): Promise<Value<typeof Schema.SourceRecordSchema>>;
 revalidateManifest(manifest: ContextManifest): Promise<void>;
}
export interface SessionHistoryPort {
 loadOriginal(binding: TaskCallBinding): Promise<readonly ModelEvent[]>;
 /** Persist alongside intent/budget/audit/outbox, never as a separate commit. */
 append(transaction: import('./native-imports.js').SqlTransaction, event: ModelEvent): Promise<void>;
}
export interface CurrentOutputPort {
 reauthorize(binding: TaskCallBinding, manifest: ContextManifest): Promise<void>;
 publishAuthorized(binding: TaskCallBinding, output: string): Promise<void>;
}
