import assert from 'node:assert/strict';
import { writeFileSync,readFileSync,appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executeSuite } from '../suite-execution.mjs';
import { validateObservations } from '../observation-gate.mjs';
import { cache } from '../paths.mjs';
/** Actual owned file/port effects produce each F-O counter. These prove the
 * observation gate, not a production authorization implementation. */
export async function observationProbe(mode){
 const {QualificationObservationSchema}=await import(pathToFileURL(resolve(cache,'g1-storage/src/schema.js')).href);
 const source=`import test from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,readFileSync,appendFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
 test('PROBE',async t=>{await t.test('PROBE/required',()=>{
 const mode=${JSON.stringify(mode)},p='g1-storage/observed-file',journal='g1-storage/effect-journal';
 const positives={save:0,ask:0,forget:0,restore:0,read:0,write:0,deny:0,conflict:0,propagate:0,backup:0,owner:0,harness:0};
 const violations={unauthorizedDisclosure:0,unauthorizedMutation:0,silentLostUpdate:0,duplicateCanonicalEffect:0,restrictedResurrection:0,askComputerStart:0};
 writeFileSync(p,JSON.stringify({revision:1,content:'authorized source'}));writeFileSync(journal,'');
 const read=()=>JSON.parse(readFileSync(p,'utf8'));
 const observed=[];if(mode!=='missing-positive'){observed.push(read().content);assert.equal(observed[0],'authorized source');positives.harness=observed.length;}
 if(mode==='unauthorized-disclosure'){const response=read().content;violations.unauthorizedDisclosure=Number(response.length>0);}
 if(mode==='unauthorized-mutation'){const before=readFileSync(p);writeFileSync(p,JSON.stringify({revision:2,content:'forbidden write'}));violations.unauthorizedMutation=Number(!before.equals(readFileSync(p)));}
 if(mode==='silent-lost-update'){const stale=read();writeFileSync(p,JSON.stringify({revision:2,content:'first committed'}));writeFileSync(p,JSON.stringify({...stale,revision:2,content:'stale overwriter'}));violations.silentLostUpdate=Number(read().content!=='first committed');}
 if(mode==='duplicate-canonical-effect'){const commit=()=>appendFileSync(journal,'original-key\\n');commit();commit();violations.duplicateCanonicalEffect=readFileSync(journal,'utf8').trim().split('\\n').length-1;}
 if(mode==='restricted-resurrection'){const original=read();writeFileSync(p,JSON.stringify({revision:2,tombstoned:true,content:null}));writeFileSync(p,JSON.stringify(original));violations.restrictedResurrection=Number(read().content!==null);}
 if(mode==='ask-computer-start'){const starts=[];const computer=()=>{const r=spawnSync(process.execPath,['-e','process.stdout.write("computer-started")'],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout,'computer-started');starts.push(r);};computer();violations.askComputerStart=starts.length;}
 console.log(JSON.stringify({schemaVersion:1,measurement:'storage-observations',suite:'harness',positives,violations}));
 });});`;
 const file=resolve('g1-storage/observation-probe.test.mjs');writeFileSync(file,source);
 const output=await executeSuite(file,['PROBE'],{}, {PROBE:['PROBE/required']});
 assert.equal(output.report.tests,2);assert.deepEqual(output.report.cases,['PROBE']);
 console.log(JSON.stringify({measurement:'harness-observation-executed',mode,report:output.report}));
 const observation=validateObservations(output.result.stdout,'harness',['harness'],QualificationObservationSchema);
 assert.equal(mode,'exact-executed-identities');assert.equal(observation.positives.harness,1);
 console.log(JSON.stringify({measurement:'harness-observation-gate-pass',mode,observation}));
}
