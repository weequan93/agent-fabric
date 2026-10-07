// Append only real finished controller records; never edit .loop or claim a pass.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, lstatSync} from 'node:fs';
import {resolve, dirname, relative, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './baseline.mjs';
import {readController, measureStreams, tapMetrics} from './check-evidence.mjs';
const ids = process.argv.slice(2);
assert.ok(ids.length > 0 && new Set(ids).size === ids.length && ids.every(id => /^job-[a-f0-9]+$/.test(id)), 'Explicit nonduplicate finished controller job IDs required');
const {state, events} = readController();
const path = resolve(root, 'g1-recovery/evidence/qualification-controller.json');
const index = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {
  schemaVersion: 1,
  scope: 'Integrated synthetic local PostgreSQL/Temporal/HTTP worker recovery and unchanged identity/foundation/original regressions only. Post-check index updates do not claim controller completion or independent reviews. Remote Linux HA/backup/containment, supplier effects/billing, formal SSO/human approval, GUI all-path enforcement, physical mobile/push, enterprise connector lifecycle and pilot timings remain unqualified.',
  pins: {node: '22.22.3', pnpm: '10.18.0', typescript: '5.9.3', postgres: '16.12', temporalCli: '1.4.1', temporalServer: '1.28.0', temporalSDK: '1.24.0'},
  runs: []
};
assert.equal(index.schemaVersion, 1);
assert.ok(Array.isArray(index.runs));
function retainArtifacts(streams) {
  const artifacts=[], parents=new Set(), hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  function copy(bytes, path, originalPath) {
    mkdirSync(dirname(path), {recursive:true});
    if(existsSync(path))assert.ok(readFileSync(path).equals(bytes),'Refusing raw evidence overwrite');
    else writeFileSync(path,bytes,{flag:'wx'});
    artifacts.push({originalPath,copyPath:relative(root,path),bytes:bytes.length,sha256:hash(bytes)});
  }
  for(const line of streams[0].text.split('\n')) {
    const raw=line.replace(/^# /,''); let row;
    try{row=JSON.parse(raw);}catch{
      // Node's TAP reporter doubles literal backslashes in diagnostic lines.
      // Decode exactly that one layer; byte count + SHA must still match.
      try{row=JSON.parse(raw.replace(/\\\\/g,'\\'));}catch{continue;}
    }
    if(['native-process-census','effect-worker-process'].includes(row.measurement)&&row.measurementPath)parents.add(dirname(row.measurementPath));
    if(row.measurement==='qualification-raw-artifact') {
      assert.match(row.owner,/^[a-f0-9-]{36}$/);assert.match(row.file,/^(?:effects\.jsonl|notifications\.jsonl|recovery\.history\.json|worker-[12]\.jsonl)$/);
      const bytes=Buffer.from(row.text,'utf8');assert.equal(bytes.length,row.bytes);assert.equal(hash(bytes),row.sha256);
      copy(bytes,resolve(root,'g1-recovery/evidence/qualification',row.owner,row.file),'controller-stream:'+streams[0].path);
    }
  }
  for(const parent of parents) {
    const kind=['temporal','effects'].find(kind=>dirname(parent)===resolve(root,'g1-recovery/node_modules/.cache/'+kind+'-evidence'));
    assert.ok(kind,'Owned generated evidence root required');assert.match(basename(parent),/^[a-f0-9-]{36}$/);
    for(const name of readdirSync(parent).sort()) {
      const source=resolve(parent,name);assert.ok(lstatSync(source).isFile(),'Regular raw artifact required');
      copy(readFileSync(source),resolve(root,'g1-recovery/evidence/qualification',kind,basename(parent),name),relative(root,source));
    }
  }
  return artifacts;
}
for (const id of ids) {
  const job = state.jobs[id];
  assert.ok(job && job.status === 'finished', 'Actual finished controller job required: ' + id);
  assert.ok(job.checks.length > 0 && job.checks.every(checkId => /^f03-qualification\.f03-(?:all-behavior|identity-retained|foundation-retained|original-retained|evidence-index)$/.test(checkId)), 'Only approved qualification checks can be recorded');
  const event = events.findLast(row => row.type === 'job.finished' && row.data.job === id);
  assert.ok(event, 'Actual controller completion event required');
  assert.deepEqual(event.data.results, job.results);
  const existing = index.runs.find(row => row.jobId === id);
  if (existing) {assert.deepEqual(existing.job, job); assert.deepEqual(existing.completionEvent, event);
    const artifacts=retainArtifacts(existing.checks[0].streams);if(existing.artifacts)assert.deepEqual(existing.artifacts,artifacts);else existing.artifacts=artifacts;
    continue;}
  const checks = job.checks.map(checkId => {
    const streams = measureStreams(id, checkId), log = streams[0].path.replace(/\/stdout\.log$/, '');
    const current = state.checks[checkId];
    assert.ok(current?.log === log, 'Original controller result has advanced; record completed job before rerunning same checks: ' + checkId);
    assert.equal(current.status, event.data.results[checkId]);
    return {checkId, status: event.data.results[checkId], result: current, metrics: tapMetrics(streams[0].text), streams};
  });
  const behavior=checks.find(check=>check.checkId.endsWith('.f03-all-behavior'));
  index.runs.push({jobId: id, job, completionEvent: event, checks, artifacts:behavior?retainArtifacts(behavior.streams):[], postCheckIndexUpdate: true});
}
writeFileSync(path, JSON.stringify(index, null, 2) + '\n');
console.log('Appended actual qualification controller jobs and complete original streams without altering raw evidence: ' + ids.join(', '));
