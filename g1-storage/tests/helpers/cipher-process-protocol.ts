import type { OwnedAnchorRoot } from '../../src/epoch-journal.js';
import type { CipherBinding } from '../../src/contracts.js';
import type { StagingPhase } from '../../src/owned-cipher-files.js';
/** Synthetic fixture capability sent over private IPC, never argv/env/files. */
export interface CipherProcessInput {
 root:OwnedAnchorRoot; binding:CipherBinding; value:Buffer; description:string;
 dataKey:Buffer; digestKey:Buffer; operation:'stage'|'collect'; stopAt:StagingPhase;
}
export interface CipherProcessMessage {kind:string; request?:number; operation?:string; args?:unknown[]; value?:unknown; uploadId?:string; phase?:StagingPhase}
