import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, cwd, postgresImage } from './paths.mjs';
import { suites } from './manifest.mjs';
import { assertBaseline } from './guards.mjs';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const insist = (condition, message) => { if (!condition) throw new Error(message); };
export const controllerRoot = '.loop/goals/agent-fabric-g1-f04-model-finops';
export const behaviorDefinitions = Object.freeze({
 'f04-15.full-model-behavior': 'node g1-model/scripts/check.mjs',
 'f04-15.identity-retained': 'node g1-identity/scripts/check.mjs',
 'f04-15.foundation-retained': 'node g1-foundations/scripts/check.mjs',
 'f04-15.original-retained': 'node g1-foundations/scripts/check-retained.mjs'
});
export function candidateSnapshot() {
 const files = {};
 function visit(path) {
  const file = resolve(cwd, path), stat = lstatSync(file);
  insist(!stat.isSymbolicLink(), 'Candidate symlink refused');
  if (stat.isDirectory()) for (const name of readdirSync(file).sort()) visit(path + '/' + name);
  else { insist(stat.isFile(), 'Candidate must be regular'); files['g1-model/' + path] = sha(readFileSync(file)); }
 }
 for (const path of ['src','tests','scripts','migrations','notices','verification','package.json','pnpm-lock.yaml','dependencies.json','tsconfig.json','OPERATIONS.md']) visit(path);
 return { schemaVersion: 1, digest: sha(JSON.stringify(files)), files,
  lock: files['g1-model/pnpm-lock.yaml'], node: process.version, platform: process.platform, architecture: process.arch, postgresImage,
  boundary: 'Executable/package/documentation inputs; evidence streams and delivery indexes excluded to avoid self-reference; full delivery snapshot recorded separately' };
}
export function designedMatrix() {
 const text = readFileSync(resolve(root,'docs/loop/agent-fabric-g1-f04-model-finops/test-plan.md'),'utf8');
 return text.split('\n').filter(line => /^\| (AF-|UX-11|R-)/.test(line)).map(line => {
  const [requirement,priority,cases,remaining] = line.split('|').slice(1,-1).map(s=>s.trim());
  return {requirement,priority,cases:cases.split(', '),remaining};
 });
}
export function validateScope(data) {
 insist(Object.keys(data).sort().join(',')==='assurance,claims,external,independentReviews,optionalFixture,productJudgment,schemaVersion', 'Unknown qualification field');
 insist(data.schemaVersion === 1 && data.assurance === 'deterministic-local-only', 'Closed local assurance required');
 insist(Object.keys(data.external).sort().join(',') === 'E01,E02,E03,E04,E05' && Object.values(data.external).every(g => Object.keys(g).sort().join(',')==='decision,evidence,owner,status' && g.status === 'pending' && typeof g.owner === 'string' && g.owner && g.decision && g.evidence), 'All external gates must remain pending with owners/decisions/evidence');
 insist(data.optionalFixture === 'deterministic-refusal-and-race-only' && Object.values(data.claims).every(v=>v==='unqualified') && Object.keys(data.claims).sort().join(',') === 'invoice,noVM,performance,supplier,wholeG1', 'External claim promotion refused');
 insist(data.independentReviews === 'pending-controller-review-stages' && data.productJudgment === 'pending-controller-product-stage', 'No author independent signatures');
 return true;
}
export function qualificationGate(record) {
 insist(record.label === 'synthetic-gate-test-data' && Array.isArray(record.findings), 'Synthetic test label required');
 for (const f of record.findings) {
  insist(['authorization','isolation','stale-approval','duplicate-effect'].includes(f.kind) && ['open','repaired-unverified','verified-repair'].includes(f.state), 'Invalid finding');
  if (f.state !== 'verified-repair' || f.verifier !== 'synthetic-independent-verifier' || !/^sha256:[a-f0-9]{64}$/.test(f.repairDigest ?? '')) throw new Error('High severity qualification blocker');
 }
 return true;
}
export function validateSyntheticBinding(receipt, expected) {
 insist(receipt.label === 'synthetic-binding-test-data' && receipt.status === 'pass' && receipt.exitCode === 0 && receipt.origin === 'controller', 'Receipt is not a controller pass');
 for (const key of ['candidate','command','definition','lock','environment','profile','rawSha256','rawBytes']) insist(receipt[key] === expected[key], 'Receipt binding mismatch: ' + key);
 insist(receipt.review === 'pending' && receipt.rawBytes > 0, 'No fabricated independent review/empty raw');
 return true;
}
export function validateArtifacts() {
 assertBaseline();
 const matrix = json('g1-model/verification/qualification-matrix.json');
 insist(matrix.schemaVersion===1 && matrix.inventoryDigest==='7ee9471461068fc94e27bc231bae04badbc11032ceedad6f5405bc097aad4600' && JSON.stringify(matrix.rows)===JSON.stringify(designedMatrix()) && matrix.rows.length===100, 'Every reviewed requirement must retain exact case and gate mapping');
 const all = Object.values(suites).flatMap(s=>s.cases);
 insist(all.length===65 && matrix.rows.every(r=>r.cases.length && r.cases.every(c=>all.includes(c))) && all.every(c=>matrix.rows.some(r=>r.cases.includes(c))), 'Complete nonempty case mapping required');
 const status = json('g1-model/evidence/qualification-status.json'); validateScope(status);
 for (const path of ['docs/planning/g1-f04-plan.md','docs/evidence/g1-f04-acceptance.md','g1-model/OPERATIONS.md']) {
  const text=readFileSync(resolve(root,path),'utf8'); insist(text.length>100 && ['E01','E02','E03','E04','E05'].every(id=>text.includes(id)),'Missing delivered scope document');
 }
 const frozen = json('g1-model/evidence/candidate.json'), current=candidateSnapshot();
 insist(frozen.digest===current.digest && JSON.stringify(frozen.files)===JSON.stringify(current.files) && frozen.lock===current.lock && frozen.node===current.node && frozen.platform===current.platform && frozen.architecture===current.architecture,'Frozen candidate is stale');
 const state=json(controllerRoot+'/state.json');
 const task=state.tasks.find(t=>t.id==='f04-15');
 const definitions=json('g1-model/verification/controller-checks.json');
 insist(definitions.schemaVersion===1 && JSON.stringify(task.checks)===JSON.stringify(definitions.taskChecks) && JSON.stringify(json(controllerRoot+'/goal.json').acceptance)===JSON.stringify(definitions.acceptance), 'Exact registered check definitions changed');
 for (const [id,command] of Object.entries(behaviorDefinitions)) insist(task.checks.find(c=>id==='f04-15.'+c.id)?.run===command,'Registered regression command changed');
 for(const id of ['g1-model-behavior','identity-behavior','foundation-behavior','retained-baselines']) {
  const goal=json(controllerRoot+'/goal.json'),command=goal.acceptance.find(c=>c.id===id)?.argv.join(' ');
  insist(Object.values(behaviorDefinitions).includes(command),'Final acceptance definition changed');
 }
 const index=json('g1-model/evidence/streams.json');
 insist(index.schemaVersion===1 && Array.isArray(index.records) && index.records.length>0,'Complete stream history required');
 for(const r of index.records) {
  insist(r.path.startsWith('g1-model/evidence/raw/') && !r.path.split('/').includes('..') && r.original.startsWith(controllerRoot+'/runs/checks/') && !r.original.split('/').includes('..'),'Unsafe evidence path');
  const bytes=readFileSync(resolve(root,r.path)),original=readFileSync(resolve(root,r.original));
  insist(bytes.length===r.bytes && sha(bytes)===r.sha256 && bytes.equals(original),'Complete immutable controller stream mismatch');
 }
 const history=json('g1-model/evidence/history.json');
 insist(history.schemaVersion===1 && history.controllerUsage.source===controllerRoot+'/state.json' && history.controllerUsage.snapshot && history.failedJobs.length>0 && history.usageClaim==='retained-controller-cumulative-history; no zero host-cost claim','Missing failure/usage history');
 return {current, requirements:100,cases:65,streams:index.records.length,status};
}
export function actualControllerBehavior() {
 const {current}=validateArtifacts(),state=json(controllerRoot+'/state.json');
 const records=Object.keys(behaviorDefinitions).map(id=>({id,...state.checks[id]}));
 insist(records.every(r=>r.status==='pass' && r.exit_code===0 && r.outcome==='completed' && r.actor==='agent' && typeof r.fingerprint==='string'),'All four actual controller results required');
 insist(new Set(records.map(r=>r.fingerprint)).size===1,'All four results require one fresh candidate');
 const jobs=records.map(r=>r.log?.split('/').at(-2));
 insist(new Set(jobs).size===1 && jobs[0] && state.jobs[jobs[0]]?.checks?.every(id=>typeof id==='string'),'One controller job required');
 const observations=[];
 for(const r of records) {
  insist(r.log===controllerRoot+'/runs/checks/'+jobs[0]+'/'+r.id,'Controller log binding mismatch');
  const stdout=readFileSync(resolve(root,r.log,'stdout.log')),stderr=readFileSync(resolve(root,r.log,'stderr.log')),text=stdout.toString('utf8');
  insist(stdout.length>0,'Empty actual result');
  insist(!/^# (fail|cancelled|skipped|todo) [1-9]/m.test(text),'Forbidden actual test outcomes');
  if(r.id==='f04-15.full-model-behavior') {
   const lines=text.split('\n'),snapshot=lines.filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(o=>o?.measurement==='model-candidate');
   const report=lines.filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(o=>o?.measurement==='model-test-report');
   insist(snapshot?.digest===current.digest && JSON.stringify(snapshot.files)===JSON.stringify(current.files),'Old executable candidate refused');
   insist(report?.scope==='aggregate' && report.diagnosticOnly===false && report.reports.length===8 && report.reports.every((p,i)=>p.suite===Object.keys(suites)[i] && p.fail===0 && p.cancelled===0 && p.skipped===0 && p.todo===0 && p.cases.length===Object.values(suites)[i].cases.length),'Complete actual aggregate required');
   insist(text.includes('model-owned-postgres-cleanup') && text.includes('model-owned-process-cleanup'),'Actual cleanup required');
  } else {
   const witness = r.id==='f04-15.identity-retained'?'original-foundation-migration-compatibility':r.id==='f04-15.foundation-retained'?'Foundation strict build':'Native Electron';
   // Retained command must expose the real pinned Electron and mobile build.
   if(r.id==='f04-15.original-retained') insist(/Electron|electron/.test(text)&&/Android|android/.test(text),'Actual GUI/mobile regression required');
   else insist(text.includes(witness),'Unchanged regression witness missing');
  }
  observations.push({id:r.id,command:behaviorDefinitions[r.id],fingerprint:r.fingerprint,job:jobs[0],stdout:{path:r.log+'/stdout.log',bytes:stdout.length,sha256:sha(stdout)},stderr:{path:r.log+'/stderr.log',bytes:stderr.length,sha256:sha(stderr)}});
 }
 return {measurement:'controller-behavior-evidence',behaviorCandidate:current.digest,observations,independentReviews:'pending-separate-controller-gates',productAcceptance:'pending'};
}
