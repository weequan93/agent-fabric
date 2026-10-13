import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cwd,root} from './paths.mjs';
import {candidateSnapshot} from './candidate.mjs';
import {suites} from './manifest.mjs';
import {fullDescriptor} from './full-composition.mjs';

const cases=['D02','D06'];
const variants=Object.fromEntries(cases.map(id=>[id,suites['delivery-audit'].variants[id]]));
const required=JSON.parse(readFileSync(resolve(cwd,'verification/required-variants-v1.json'),'utf8'));
for(const id of cases)assert.deepEqual(variants[id],required.cases[id]);
assert.equal(Object.values(variants).flat().length,7);
export const deliveryEvidenceComponent=Object.freeze({file:'components/delivery-evidence.test.js',cases,integration:false,positives:null,variants});
const goalPath='.loop/goals/agent-fabric-g1-f05-storage';
export const digest=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const json=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
export function streamInfo(path){
 const full=resolve(root,path),rel=relative(root,full);
 assert(!isAbsolute(rel)&&!rel.startsWith('../'),'Evidence must remain repository-owned');
 assert(lstatSync(full).isFile()&&!lstatSync(full).isSymbolicLink(),'Original regular raw stream required');
 const bytes=readFileSync(full);return {path,bytes:bytes.length,sha256:digest(bytes)};
}
export function assertStream(bytes,expected){assert.equal(bytes.length,expected.bytes,'Complete stream byte count');assert.equal(digest(bytes),expected.sha256,'Original stream SHA256');}
export function records(bytes){return bytes.toString().split(/\r?\n/).flatMap(line=>{try{const v=JSON.parse(line.replace(/^# /,''));return v&&typeof v==='object'?[v]:[];}catch{return [];}});}
export function liveControllerFingerprint(){
 // Use the installed controller's own read-only implementation; do not approximate
 // its candidate algorithm or write framework state.
 const launcher=readFileSync(resolve(root,'.loop/bin/loop'),'utf8');
 const library=launcher.match(/^PYTHONPATH=([^$\n]+)\$\{PYTHONPATH/m)?.[1];
 const python=launcher.match(/ exec ([^ ]+) -m loop_engineering /)?.[1];
 assert(library&&python,'Installed controller launcher required');
 const result=spawnSync(python,['-c','from pathlib import Path; from loop_engineering.checks import fingerprint; import sys; print(fingerprint(Path(sys.argv[1])))',root],{env:{...process.env,PYTHONPATH:library},encoding:'utf8',timeout:90_000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout.trim(),/^(git|walk):[a-f0-9]{24}(?::truncated)?$/);assert(!result.stdout.includes(':truncated'));return result.stdout.trim();
}
export function checkDefinitions(goal,state){
 const result={};for(const c of goal.acceptance)result['acceptance.'+c.id]=c;
 for(const t of state.tasks)for(const c of t.checks??[])result[t.id+'.'+c.id]=c;
 return result;
}
export function inspectRun(id,result,definition,current){
 assert(definition,'Actual controller check definition required: '+id);
 const prefix=goalPath+'/runs/checks/';assert(result.log.startsWith(prefix));
 const relativeLog=result.log.slice(prefix.length),parts=relativeLog.split('/');assert.equal(parts.length,2);assert.equal(parts[1],id);assert.match(parts[0],/^job-[a-f0-9]+$/);
 assert(Number.isSafeInteger(result.duration_ms)&&result.duration_ms>=0);assert(result.started_at&&result.finished_at);assert(Date.parse(result.finished_at)>=Date.parse(result.started_at));
 const stdout=streamInfo(result.log+'/stdout.log'),stderr=streamInfo(result.log+'/stderr.log');
 const raw=readFileSync(resolve(root,stdout.path)),rows=records(raw),candidate=rows.find(r=>r.measurement==='storage-candidate')?.digest??null;
 const command=definition.run??definition.argv.join(' ');
 const emitted=rows.find(r=>r.measurement==='storage-measurement-transport'&&r.binding?.phase==='command')?.binding??null;
 if(emitted){assert.equal(emitted.candidate,candidate);const args=definition.argv??definition.run.split(' ');assert.equal(emitted.command.cwd,resolve(root,definition.cwd??'.'));assert.equal(relative(root,emitted.command.args[0]),args[1]);assert.deepEqual(emitted.command.args.slice(1),args.slice(2));}
 return {id,job:parts[0],command,definition,elapsedMs:result.duration_ms,status:result.status,exitCode:result.exit_code,outcome:result.outcome,cleanup:result.cleanup,workspaceChanged:result.workspace_changed??false,
  commandBinding:emitted?.command??{source:'controller-qualified-check-dispatch',definitionId:id},controllerFingerprint:result.fingerprint,candidate,candidateCurrent:candidate===current.candidate.digest,workspaceCurrent:result.fingerprint===current.controllerFingerprint,
  stdout,stderr,rows};
}
export function assertCurrentRun(run,current){
 assert.equal(run.status,'pass');assert.equal(run.exitCode,0);assert.equal(run.outcome,'completed');assert.equal(run.controllerFingerprint,current.controllerFingerprint,'Stale controller workspace result');
 if(run.command.includes('g1-storage/'))assert.equal(run.candidate,current.candidate.digest,'Stale F05 candidate result');
}
function assertCleanup(rows){
 const origins=rows.filter(r=>r.measurement==='storage-owned-fixture');assert(origins.length>0,'Actual owned fixture origins');
 for(const f of origins){
  const containers=rows.filter(r=>r.measurement==='storage-container-cleanup'&&r.owner===f.owner&&r.instance===f.instance&&r.containerId===f.containerId);
  const roots=rows.filter(r=>r.measurement==='storage-root-cleanup'&&r.owner===f.owner&&r.instance===f.instance&&r.rootId===f.fixtureRoot.rootId);
  assert.equal(containers.length,1);assert.equal(containers[0].removed,true);assert.equal(containers[0].censusUnchanged,true);assert.equal(roots.length,1);assert.equal(roots[0].removed,true);assert.deepEqual(roots[0].rootIds,Object.values(f.roots).map(r=>r.rootId));
 }
 for(const process of rows.filter(r=>r.measurement==='model-owned-process')){
  const removed=rows.filter(r=>r.measurement==='model-owned-process-cleanup'&&r.pid===process.pid);assert.equal(removed.length,1);assert.equal(removed[0].removed,true);
 }
}
export function assertAggregateCoverage(run,registry){
 assert(registry,'Current execution registry required');
 const report=run.rows.filter(r=>r.measurement==='storage-test-report');assert.equal(report.length,1);assert.equal(report[0].scope,'aggregate');assert.equal(report[0].diagnosticOnly,false);assert.equal(report[0].externalQualification,'pending');
 const actual=report[0].reports;assert.deepEqual(actual.map(r=>r.suite),Object.keys(registry.executionSuites),'Exact original suite order plus atomic-disconnect');
 for(const [id,suite] of Object.entries(registry.executionSuites)){
  const components=id==='recall-ask'?registry.recallAskObservationSources.map(s=>registry.executionComponents[s.component]):id==='backup-restore'?registry.backupRestoreObservationSources.map(s=>registry.executionComponents[s.component]):id==='commit-conflict'?[...registry.commitConflictPredecessors.map(c=>registry.executionComponents[c]),suite]:[suite];
  const expectedCases=components.flatMap(c=>c.cases),expectedVariants=Object.assign({},...components.map(c=>c.variants));
  const reports=actual.filter(r=>r.suite===id);assert.equal(reports.length,1);const r=reports[0];
  const descriptor=fullDescriptor(id);
  if(descriptor){assert.deepEqual(r.cases,descriptor.parents);assert.deepEqual(r.executions,descriptor.executions);assert.equal(r.tests,descriptor.parents.length+descriptor.leaves);assert.equal(r.variants.length,descriptor.leaves);}
  else assert.equal(r.cases.length,expectedCases.length);
  for(const c of expectedCases){assert(r.cases.some(name=>name===c||name.startsWith(c+' / ')),c);for(const leaf of expectedVariants[c])assert.equal(r.executions.filter(e=>e.indent===4&&e.name===leaf&&(e.parent===c||e.parent.startsWith(c+' / '))).length,1,leaf);}
  if(!descriptor){assert.equal(r.tests,expectedCases.length+Object.values(expectedVariants).flat().length);assert.equal(r.variants.length,Object.values(expectedVariants).flat().length);}
  assert.equal(r.executions.length,r.tests);
  const observations=Array.isArray(r.observations)?r.observations:r.observations?.sources?.map(s=>s.observation)??(r.observations?[r.observations]:[]);
  for(const o of observations)assert(Object.values(o.violations).every(n=>n===0),'Every reported finite violation remains zero');
 }
 const guards=run.rows.filter(r=>r.measurement==='preserved-inputs');assert(guards.length>=2);for(const g of guards){assert.equal(g.files,2581);assert.equal(g.unchanged,true);}
 assert.equal(run.rows.filter(r=>r.measurement==='strict-build').length,1);
 const admitted=actual.flatMap(r=>r.observations?.sources??[]).flatMap(s=>[...(s.fixtures??[]),...(s.cleanup??[])]);
 const cleanupRows=[...run.rows,...admitted].filter((v,i,all)=>!['storage-owned-fixture','storage-container-cleanup','storage-root-cleanup'].includes(v.measurement)||all.findIndex(w=>w.measurement===v.measurement&&w.owner===v.owner&&w.instance===v.instance)===i);
 assertCleanup(cleanupRows);
}
export function severeFindings(findings){
 return findings.filter(f=>!['rejected','resolved','closed'].includes(f.status)&&(f.severity==='high'||f.severity==='critical'||/\b(high.severity|release.blocking|blocking security)\b/i.test(f.text??'')));
}
export function reviewState(state,events,fingerprint){
 return Object.fromEntries(['security','code','final-acceptance','product-acceptance'].map(id=>{
  const controllerId=id;
  const r=state.reviews[controllerId];
  const registered=!!r&&r.by==='reviewer'&&events.some(e=>e.type==='review.recorded'&&e.at===r.at&&e.data.review===controllerId&&e.data.verdict===r.verdict&&e.data.by===r.by);
  const current=!!r&&r.fingerprint===fingerprint;
  return [id,{status:!r?'pending':!registered?'unregistered':!current?'stale':r.verdict,by:r?.by??null,registered,current,early:r?.early??false}];
 }));
}
export function qualification(audit,{findings=audit.state.findings,claim=null}={}){
 const blockers=[];
 if(claim)blockers.push('Author claims cannot issue controller acceptance');
 for(const f of severeFindings(findings))blockers.push('Unresolved severe finding: '+f.id);
 for(const id of ['full-storage-behavior','identity-retained','foundation-retained','original-retained']){
  const r=audit.latest.find(r=>r.id==='f05-15.'+id);if(!r)blockers.push('Missing terminal controller check: '+id);else try{assertCurrentRun(r,audit.current);}catch{blockers.push('Failed or stale terminal controller check: '+id);}
 }
 if(!audit.state.verification?.passed||audit.state.verification.fingerprint!==audit.current.controllerFingerprint)blockers.push('Missing current controller final acceptance');
 for(const [id,r] of Object.entries(reviewState(audit.state,audit.events,audit.current.controllerFingerprint)))if(r.status!=='pass'||r.early)blockers.push('Independent verdict '+id+': '+r.status);
 return {qualified:blockers.length===0,blockers,externalQualification:'pending',authorVerdict:false};
}
export function inspectEvidence(){
 const goal=json(goalPath+'/goal.json'),state=json(goalPath+'/state.json'),events=readFileSync(resolve(root,goalPath+'/events.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse);
 const current={candidate:candidateSnapshot(),controllerFingerprint:liveControllerFingerprint(),lock:streamInfo('g1-storage/pnpm-lock.yaml')};
 const definitions=checkDefinitions(goal,state),latest=[];
 for(const [id,result] of Object.entries(state.checks))if(result.finished_at)latest.push(inspectRun(id,result,definitions[id],current));
 const inventory=json('g1-storage/verification/delivery-inventory-v1.json');
 for(const [path,hash] of Object.entries(inventory.sourceFiles))assert.equal(streamInfo(path).sha256,hash);
 assert.equal(inventory.qualification,'pending-controller-final-acceptance');assert.equal(inventory.delivery.noAuthorVerdict,true);
 const audit={goal,state,events,current,definitions,latest};return {...audit,qualification:qualification(audit)};
}
export function requireControllerBehavior(audit,registry){
 assert.equal(severeFindings(audit.state.findings).length,0,'Unresolved severe findings block affected qualification');
 const ids=['full-storage-behavior','identity-retained','foundation-retained','original-retained'];
 for(const id of ids){const run=audit.latest.find(r=>r.id==='f05-15.'+id);assert(run,'Missing terminal controller result: '+id);assertCurrentRun(run,audit.current);assert(audit.events.some(e=>e.type==='check.result'&&e.data.check===run.id&&e.data.status==='pass'&&e.data.exit===0),'Controller must have recorded completed actual check');assert(audit.events.some(e=>e.type==='job.started'&&e.data.job===run.job&&e.data.checks.includes(run.id)),'Actual controller dispatch required');
  if(id==='full-storage-behavior')assertAggregateCoverage(run,registry);
  else {const raw=readFileSync(resolve(root,run.stdout.path),'utf8');
   const summaries=[...raw.matchAll(/^# tests (\d+)\n# suites \d+\n# pass (\d+)\n# fail (\d+)\n# cancelled (\d+)\n# skipped (\d+)\n# todo (\d+)$/gm)].map(m=>m.slice(1).map(Number));
   assert(summaries.length>0,'Complete real regression TAP summaries');for(const [tests,passed,...bad] of summaries){assert(tests>0);assert.equal(tests,passed);assert(bad.every(n=>n===0));}
   if(id==='identity-retained'){assert.deepEqual(summaries.map(s=>s[0]),[35]);assert(raw.includes('foundation-source-hashes: 42 accepted files unchanged'));}
   if(id==='foundation-retained'){assert.deepEqual(summaries.map(s=>s[0]),[17]);assert(raw.includes('actual-postgres-role-and-version'));}
   if(id==='original-retained'){assert.deepEqual(summaries.map(s=>s[0]),[197,48,5,9,10]);assert(/^v44\.5\.1$/m.test(raw));assert(raw.includes('Desktop: 9 policy component tests, real renderer assets and Electron 44.5.1 binary probe passed.'));const retained=run.rows.find(r=>r.protectedFiles===597&&r.rawFiles===88);assert.deepEqual(retained?.checks,['original-g0-regression','original-g1-local-regression']);}
   for(const fixture of run.rows.filter(r=>r.measurement==='actual-postgres-fixture'))assert(run.rows.some(r=>r.measurement==='fixture-owned-cleanup'&&r.owner===fixture.owner&&r.containerId===fixture.containerId&&r.removed===true),'Every original regression fixture closed');
  }
 }
 // This command validates implementation evidence; independent verdicts remain
 // pending until issued by the controller. Never publish an author COMPLETE.
 return {controllerBehavior:true,qualification:qualification(audit)};
}
export function conciseEvidence(audit){return {measurement:'delivery-evidence',scope:'local-artifact-audit',current:audit.current,latest:audit.latest.map(({rows,...run})=>run),reviews:reviewState(audit.state,audit.events,audit.current.controllerFingerprint),qualification:audit.qualification};}
