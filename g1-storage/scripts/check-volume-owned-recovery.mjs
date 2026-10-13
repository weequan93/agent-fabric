import { readFileSync,lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeSuite } from './suite-execution.mjs';
import { root } from './paths.mjs';
import { now,hash } from './recovery/ownership.mjs';
import { beginJournal,durableFile,finishJournal,failJournal } from './recovery/journal.mjs';
import { startGuards,finalGuards,buildRecovery,recoverySchema,expectedVariants,testFile,parent,verifyBehavior } from './recovery/verification.mjs';

const {candidate,guards}=startGuards(),control=beginJournal(candidate),failures=[];
let output;
try{
 buildRecovery();const schema=await recoverySchema();
 if(!lstatSync(testFile).isFile()||!readFileSync(testFile,'utf8').includes("test('OWNED-RECOVERY/behavior"))throw new Error('Mandatory recovery suite missing');
 output=await executeSuite(testFile,[parent],{cwd:root},{[parent]:expectedVariants()});
 const {report,behavior}=verifyBehavior(output.result,candidate,schema);
 const streams=['stdout','stderr'].map(kind=>{
  const bytes=output.result[kind],path=resolve(control.journal.path,kind+'.log');durableFile(path,bytes);
  return {path,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)};
 });
 finalGuards(candidate);
 const receipt=schema.RecoveryJournalSchema.parse({schemaVersion:1,measurement:'storage-owned-recovery-receipt',runId:control.runId,
  createdAt:now(),candidate,journal:{path:control.journal.path,identity:control.journal.identity},guards,streams,behavior,
  tests:report.tests,failed:0,cancelled:0,skipped:0,todo:0,externalQualification:'pending'});
 console.log(JSON.stringify({measurement:'owned-recovery-journal-written',...finishJournal(candidate,control,receipt),runId:control.runId,candidate}));
}catch(error){
 if(error.result){
  for(const kind of ['stdout','stderr'])durableFile(resolve(control.journal.path,kind+'.log'),error.result[kind]??'');
 }
 failJournal(candidate,control);failures.push(error);
}finally{try{finalGuards(candidate);}catch(error){failures.push(error);}}
if(failures.length){failJournal(candidate,control);throw new AggregateError(failures,'Owned recovery check failed; refusal and original guards retained');}
