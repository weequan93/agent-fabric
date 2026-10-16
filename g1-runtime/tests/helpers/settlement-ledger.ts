/** Single owning local fixture ledger; deliberately not an original SQL adapter. */
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AdmissionRecord} from '../../src/admission.js';
import type {Effect,Run,Generation} from '../../src/owners.js';
import type {OriginalSnapshot,Observation} from '../../src/contracts.js';
import type {LocalSettlementReceipt} from '../../src/local-original-settlement.js';
export interface LocalOriginalRecord {
 admission:AdmissionRecord;effect:Effect;run:Run;
 task:{taskId:string;retries:'allowed'|'blocked';cancellationGeneration:number;state:string};
 lease:{leaseId:string;expiresAt:string;revoked:boolean};session:{sessionId:string;generation:Generation;state:'ready'|'interrupted'};
 approval:{approvalId:string;bindingDigest:string;consumed:true};
 resource:{instanceId:string;bootId:string;generation:Generation;held:true};
 accounting:{reservationId:string;reserved:number;settled:null;unknown:true};
 historicalDigest:string;dispatchFenced:boolean;snapshot:OriginalSnapshot|null;stopReceipt:null|{key:string;kind:'stop-run'|'stop-task';acknowledged:true};
 process:null|{parentPid:number;childPid:number;parentBirth:string;childBirth:string;parentExited:boolean;childExited:boolean;streamsComplete:boolean;terminated:boolean;stdoutBytes:number;stderrBytes:number};
 sendOutcome:'not-sent'|'ack-lost';events:{phase:string;detail:unknown}[];commands:Record<string,LocalSettlementReceipt>;outbox:LocalSettlementReceipt[];evidence:Observation|null;
}
export function ledgerRead(root:string,id:string):LocalOriginalRecord{return JSON.parse(readFileSync(join(root,id+'.json'),'utf8'));}
export function ledgerSave(root:string,id:string,row:LocalOriginalRecord){const path=join(root,id+'.json'),tmp=path+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(row),{flag:'wx'});renameSync(tmp,path);}
