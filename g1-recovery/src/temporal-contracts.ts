// Opaque references only: no prompts, response bodies, tokens or policy grants in history.
export interface NativeRef {tenantId:string;spaceId:string;taskId:string;runId:string;sessionId:string;bindingDigest:string}
export interface CheckpointRef {runId:string;sessionId:string;sequence:number;eventDigest:string}
export interface NativeActivities {nativeTurn(ref:NativeRef,sequence:number):Promise<CheckpointRef>}
