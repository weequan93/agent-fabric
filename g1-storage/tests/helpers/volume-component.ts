import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { QualificationObservationSchema } from '../../src/schema.js';
import { emitObservations, type SuiteObservations } from './observations.js';

/** Thin composition only. Each child awaits its complete current predecessor
 * process; the independent custodian owns nested fixtures and reverse cleanup. */
export function registerVolumeComponent() {
 return test('VOLUME/behavior / complete artifact live draft checkpoint promotion composition', async t => {
  const repoRoot=process.env['STORAGE_REPO_ROOT'];assert.ok(repoRoot);
  const schedule=await import(pathToFileURL(resolve(repoRoot,'g1-storage/scripts/schedule/supervisor.mjs')).href);
  const receipt=await schedule.runSchedule();
  const records:SuiteObservations[]=[];
  for(const child of receipt.children){
   await t.test(child.report.cases[0],async()=>{
    const validated=await schedule.validateChild(child,receipt);
    records.push(QualificationObservationSchema.parse(validated.observations));
   });
  }
  assert.deepEqual(records.map(r=>r.suite),['artifact-publication','volume-drafts','volume-promotion']);
  const first=records[0]!,positives={...first.positives},violations={...first.violations};
  for(const record of records.slice(1)){
   for(const name of Object.keys(positives) as (keyof SuiteObservations['positives'])[])positives[name]+=record.positives[name];
   for(const name of Object.keys(violations) as (keyof SuiteObservations['violations'])[])violations[name]+=record.violations[name];
  }
  emitObservations({...first,suite:'volume',positives,violations});
 });
}
