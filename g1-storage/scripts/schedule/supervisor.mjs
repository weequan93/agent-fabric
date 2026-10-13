import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { cwd } from '../paths.mjs';
import { candidateSnapshot } from '../candidate.mjs';
import { launchFresh } from '../custodian/processes.mjs';
import { processTools,hash,assertPrivateFile } from '../recovery/ownership.mjs';
import { guards,readBound,validateReceipt } from './verification.mjs';
export {validateChild} from './verification.mjs';
/** The original runner remains sync/bounded. This adapter alone is async. */
export async function runSchedule(){
 guards();const candidate=candidateSnapshot(),w=await launchFresh(resolve(cwd,'scripts/schedule/custodian-process.mjs'),{operation:'complete-volume-schedule',candidate:candidate.digest});
 const {waitUntil,stopOwned}=await processTools();let receipt;
 try{
  await waitUntil(async()=>{if(w.failure())throw w.failure();return w.child.exitCode!==null||w.child.signalCode!==null;},'complete independent custodian and reverse cleanup',235000);
  const exit=await w.exit;assert.equal(w.messages.filter(m=>m.kind==='receipt').length,1,'Complete custodian receipt required');
  const index=w.messages.find(m=>m.kind==='receipt').index;receipt=JSON.parse(readBound(index));
  const raw={};for(const kind of ['stdout','stderr']){const path=resolve(receipt.journal.root.path,kind+'.log');assertPrivateFile(path);const bytes=readFileSync(path);raw[kind]={path,bytes:bytes.length,sha256:hash(bytes)};}
  console.log(JSON.stringify({measurement:'volume-schedule-current-receipt',index,candidate:receipt.candidate,nonce:w.marker,phaseDurations:receipt.phaseDurations,custodianOutput:raw}));
  assert.equal(exit.code,0);assert.equal(exit.signal,null);assert.equal(receipt.candidate,candidate.digest);assert.equal(receipt.custodian.nonce,w.marker);
  await validateReceipt(receipt);return receipt;
 }finally{
  // Never signal a live custodian that may still own fixtures. IPC loss invokes
  // its separate monotonic cancellation and proof-based descendant cleanup.
  if(w.child.exitCode===null&&w.child.signalCode===null){if(w.child.connected)w.child.disconnect();await waitUntil(async()=>w.child.exitCode!==null||w.child.signalCode!==null,'disconnected custodian cleanup',15000);await w.exit;}
  await stopOwned(w);assert.equal(candidateSnapshot().digest,candidate.digest);guards();
 }
}
