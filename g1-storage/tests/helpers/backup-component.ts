import test from 'node:test';
import assert from 'node:assert/strict';
import { registerBackupCaptureTests } from './backup-capture-component.js';
import { registerBackupConfirmationTests } from './backup-confirmation-component.js';
import { emitObservations,type SuiteObservations } from './observations.js';
import { QualificationObservationSchema } from '../../src/schema.js';
/** Preserve all predecessor leaf assertions in the original backup gate. */
export function registerBackupComponent(){return test('BACKUP/behavior / capture and durable confirmation integration',async t=>{
 const records:SuiteObservations[]=[];const observe=(r:SuiteObservations)=>{records.push(QualificationObservationSchema.parse(r));};
 await registerBackupCaptureTests(async(_name,body)=>body(t),observe);
 await registerBackupConfirmationTests(async(_name,body)=>body(t),observe);
 assert.deepEqual(records.map(r=>r.suite),['backup-capture','backup']);const first=records[0]!,positives={...first.positives},violations={...first.violations};
 for(const record of records.slice(1)){for(const k of Object.keys(positives) as (keyof typeof positives)[])positives[k]+=record.positives[k];for(const k of Object.keys(violations) as (keyof typeof violations)[])violations[k]+=record.violations[k];}
 emitObservations({...first,suite:'backup',positives,violations});
});}
