import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const local=resolve(root,'g1-local');
const definition=JSON.parse(readFileSync(resolve(local,'evals/definition.json'),'utf8'));
export function runChecks(){
const mode=process.argv[2]??'baseline';
if(![...definition.stageOrder,'final'].includes(mode))throw Error('Unknown G1-local check stage');
const index=mode==='final'?definition.stageOrder.length-1:definition.stageOrder.indexOf(mode);
const stages=definition.stageOrder.slice(0,index+1);
const required=stages.flatMap(stage=>definition.stages[stage].requiredFiles);if(mode==='final')required.push(...definition.finalRequiredFiles);
for(const path of required){
 const file=resolve(root,path);
 if(!existsSync(file)||!statSync(file).isFile()||statSync(file).size===0)throw Error('Missing required '+mode+' file: '+path);
 if(path.endsWith('.json'))JSON.parse(readFileSync(file,'utf8'));
}
function run(command,args,cwd,timeout=120000){
 const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout,maxBuffer:32*1024*1024});
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');
 if(r.error||r.status!==0)throw Error('Check failed: '+command+' '+args.join(' ')+': '+(r.error?.message??r.status));
 return r.stdout??'';
}
function executed(tap,label){
 const lines=tap.split('\n');
 if(lines.some(l=>/^(?:ok|not ok)\s+\d+.*#\s*(?:SKIP|TODO)(?:\s|$)/i.test(l.trim())||/^# (?:skipped|todo) [1-9]/i.test(l.trim())))throw Error(label+' skipped/TODO tests are forbidden');
 const totals=[...tap.matchAll(/^# tests (\d+)\s*$/gm)];
 if(totals.length===0||totals.some(m=>Number(m[1])===0))throw Error(label+' did not execute a nonempty test suite');
 if(!/^ok \d+ - /m.test(tap)||/^not ok \d+ - /m.test(tap))throw Error(label+' requires actual passed test results');
}
run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],local);
const output=resolve(local,'node_modules/.cache/g1-build');
rmSync(output,{recursive:true,force:true});
run(process.execPath,['scripts/build.mjs'],local);
function discover(dir){
 if(!existsSync(dir))throw Error('Compiled test directory missing: '+dir);
 return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?discover(resolve(dir,e.name)):e.isFile()&&e.name.endsWith('.test.js')?[resolve(dir,e.name)]:[]);
}
const tests=discover(resolve(output,'g1-local/tests')).sort();
if(tests.length===0)throw Error('No compiled behavioral tests');
const tap=run(process.execPath,['--test','--test-reporter=tap',...tests],root);executed(tap,'local compiled');
for(const c of definition.cases.filter(c=>stages.includes(c.phase))){const names=tap.split('\n').filter(line=>/^ok \d+ - /.test(line)).map(line=>line.replace(/^ok \d+ - /,''));if(names.filter(name=>name===c.testName).length!==1)throw Error('Required actual case missing or duplicated: '+c.testName);}
for(const client of ['web','desktop','mobile'])if(stages.includes(client)){
 run('pnpm',['install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir','/private/tmp/agent-fabric-pnpm-store'],resolve(local,client));
 executed(run(process.execPath,[definition.clientChecks[client]],root,180000),client);
}
if(stages.includes('verify')){
 run(process.execPath,['g1-local/scripts/check-ui.mjs'],root,180000);
 run(process.execPath,['g1-local/scripts/check-load.mjs'],root,180000);
}
if(stages.includes('verify'))validateEvidence(mode);
console.log('G1-local '+mode+': current-stage build and actual behavioral checks passed; UI/qualification require their actual evidence.');

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runChecks();

function need(condition,message){if(!condition)throw Error('Evidence: '+message);}
export function candidateScopeDigest(){
 const paths=[...new Set(definition.stageOrder.flatMap(stage=>definition.stages[stage].requiredFiles))].filter(p=>p.startsWith('g1-local/')&&existsSync(resolve(root,p))).sort();
 const files=paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')}));
 return 'sha256:'+createHash('sha256').update(JSON.stringify({schemaVersion:1,files})).digest('hex');
}
function report(path){return JSON.parse(readFileSync(resolve(root,path),'utf8'));}
function text(v){return typeof v==='string'&&v.trim().length>0;}
function timestamps(r){need(text(r.startedAt)&&text(r.finishedAt)&&Number.isFinite(Date.parse(r.startedAt))&&Date.parse(r.finishedAt)>=Date.parse(r.startedAt),'actual valid start/end timestamps required');}
function validateEvidence(mode){
 const bound=candidateScopeDigest(),ui=report(definition.evidencePaths.ui),load=report(definition.evidencePaths.load);
 need(ui.schemaVersion===1&&ui.candidateDigest===bound&&ui.assurance==='actual-local-interaction','UI must bind actual declared source scope');
 need(text(ui.sharedTaskId),'actual shared Task result required');
 need(Array.isArray(ui.clients)&&ui.clients.length===3&&new Set(ui.clients.map(c=>c.client)).size===3,'three distinct actual clients required');
 for(const client of definition.uiEvidence.requiredClients){
  const c=ui.clients.find(c=>c.client===client);need(c&&c.outcome==='pass','unexecuted client '+client+' remains pending');
  const surfaces={web:'browser',desktop:'electron',mobile:'android-emulator'},executors={web:'browser-automation',desktop:'native-desktop-automation',mobile:'android-emulator-automation'};
  need(c.surface===surfaces[client]&&c.executor?.kind===executors[client]&&text(c.executor.id),'actual surface/executor; source/build/mobile viewport is insufficient');
  need(c.environment&&typeof c.environment==='object'&&Object.keys(c.environment).length>0,'observed client environment required');timestamps(c);
  need(c.launch?.outcome==='pass'&&text(c.launch.command),'actual launch required');
  if(client==='mobile')need(c.installation?.outcome==='pass'&&text(c.installation.command),'actual native installation required');
  need(Array.isArray(c.steps),'actual action sequence required');
  for(const id of definition.uiEvidence.requiredFlow){
   const step=c.steps.find(s=>s.id===id);need(step?.outcome==='pass'&&text(step.expected)&&text(step.observed),'missing actual '+client+' action '+id);
   if(id==='result')need(step.taskId===ui.sharedTaskId,'all clients read the same confirmed Task result');
   if(!['login','space-selection'].includes(id))need(text(step.taskId)&&Number.isSafeInteger(step.revision)&&step.revision>=0,'observed task/revision required for '+id);
  }
  need(Array.isArray(c.artifacts)&&c.artifacts.length>0,'actual screenshots/logs required');
  for(const a of c.artifacts){need(['screenshot','log'].includes(a.kind)&&text(a.path)&&/^[a-f0-9]{64}$/.test(a.sha256),'artifact path/hash/kind required');const path=resolve(root,a.path);need(existsSync(path)&&statSync(path).isFile()&&statSync(path).size>0,'artifact bytes missing');need(createHash('sha256').update(readFileSync(path)).digest('hex')===a.sha256,'artifact bytes/hash mismatch');}
 }
 need(load.schemaVersion===1&&load.candidateDigest===bound&&load.transport==='http-loopback'&&load.workload==='authorized-task-read'&&load.timingSource==='performance.now','load must observe real loopback task reads on current source scope');
 const url=new URL(load.baseUrl);need(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'loopback HTTP only');timestamps(load);
 need(load.concurrency===definition.performance.concurrency,'fixed read concurrency');
 for(const [name,count] of [['warmup',definition.performance.warmupSamples],['samples',definition.performance.measuredSamples]]){
  need(Array.isArray(load[name])&&load[name].length===count,'retain every '+name+' observation');
  for(const [i,s] of load[name].entries())need(s.index===i&&Number.isFinite(s.durationMs)&&s.durationMs>0&&s.status===200&&s.error===null&&s.cancelled===false,'failed/cancelled/unmeasured '+name+' sample '+i);
 }
 const sorted=load.samples.map(s=>s.durationMs).sort((a,b)=>a-b),p95=sorted[Math.ceil(0.95*sorted.length)-1];
 need(load.errors===0&&Math.abs(load.p95Ms-p95)<0.000001&&p95<=definition.performance.p95MaxMs,'zero errors and recomputed p95 threshold required');
 if(mode==='final'){const a=report(definition.evidencePaths.acceptance);need(a.schemaVersion===1&&a.candidateDigest===bound&&a.fileIsPassAttestation===false&&a.formalResultAuthority==='registered-controller-record','acceptance index must not self-attest formal pass');need(JSON.stringify(a.requiredCheckIds)===JSON.stringify(definition.acceptanceEvidence.requiredCheckIds),'original formal checks remain required after command gate');}
}
