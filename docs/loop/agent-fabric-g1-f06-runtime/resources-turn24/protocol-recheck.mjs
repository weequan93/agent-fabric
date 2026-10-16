// Design diagnostics only. Never loads a product check, fixture, DB, GUI or backend.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=resolve('docs/loop/agent-fabric-g1-f06-runtime/solution-turn21');
const root=resolve(directory,'../../../..');
const solutionPath=resolve(directory,'../solution.md');
const solution=readFileSync(solutionPath,'utf8');
const records=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
function record(name,observation){records.push({name,observation});}
const protocol=JSON.parse(readFileSync(join(directory,'protocol-contract.json'),'utf8'));
assert.equal(protocol.assurance,'design-only');assert.equal(protocol.implemented,false);
const specs=[...solution.matchAll(/```typescript\n([\s\S]*?)```/g)].map(m=>m[1]);
assert.equal(specs.length,2);
const folder=mkdtempSync(join(tmpdir(),'af-f06-design-turn21-'));
try {
 const file=join(folder,'specimen.mts');
 const specimen=specs.join('\n').replace(/from '(\.\.\/\.\.\/\.\.\/[^']+)'/g,(_m,p)=>'from '+JSON.stringify(resolve(dirname(solutionPath),p)));
 const compiler=resolve(root,'node_modules/typescript/bin/tsc');
 const args=[compiler,'--noEmit','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2023','--lib','ES2024','--module','NodeNext','--moduleResolution','NodeNext','--esModuleInterop','--types','node','--typeRoots',resolve(root,'node_modules/@types'),file];
 function compile(source){writeFileSync(file,source);const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.ifError(r.error);return {status:r.status,stdout:r.stdout,stderr:r.stderr};}
 const positive=compile(specimen);record('strict-installed-owner-signatures',{command:[process.execPath,...args],...positive});assert.equal(positive.status,0,positive.stdout+positive.stderr);
 const negative=`\ndeclare const waiting: Extract<QueueResult,{state:'waiting'}>;\ndeclare const scalar: number;\ndeclare const artifact: PlanArtifactRef;\ndeclare const installed: ArtifactOwnerSeam;\nconst badLease: RuntimeLease = waiting;\nconst badGeneration: Generation = scalar;\nconst badRevision: 2 = artifact.revision;\ntype BadMethod = Pick<ArtifactOwnerSeam,'savePlan'>;\nconst syncResult: boolean = Promise.resolve(true);\ndeclare const lookupOnly: FreshReconciliationAuthority;\nconst badDispatch: true = lookupOnly.dispatch;\nconst forgedReadOnly: FreshReconciliationAuthority = {operationId:'op',originalBindingDigest:'digest',actorId:'actor',authorityRevision:1,stoppedOrExpiredSnapshotDigest:'snapshot',lookupPolicyDigest:'policy',expiresAt:'later',dispatch:false};\ntype BadStoppedMethod = Pick<EffectOwnerSeam,'settleStopped'>;\n`;
 const rejected=compile(specimen+negative);const errors=[...rejected.stdout.matchAll(/error TS\d+:/g)];record('eight-type-negatives',{...rejected,expectedErrors:8,observedErrors:errors.length});assert.notEqual(rejected.status,0);assert.equal(errors.length,8,rejected.stdout);
} finally {rmSync(folder,{recursive:true,force:true});}
// Verify source seams read-only. These are signatures/invariants, not behavior passes.
const sources={...protocol.owners,artifact:'g1-storage/src/artifact-publication.ts',lineage:'g1-model/migrations/0012_family_budget.sql'};
const source={};for(const [k,p] of Object.entries(sources))source[k]=readFileSync(resolve(root,p),'utf8');
assert.match(source.artifact,/n\.binding\.intent==='Ask'&&n\.binding\.purpose==='maintenance'/);
assert.match(source.lineage,/INSERT INTO fabric\.model_budget_lineage VALUES\(t,s,r,parent_run\)/);
const stop=source.nativeStop.split(' async stop(')[1];assert.ok(stop);
const loadAt=stop.indexOf('await this.load(tx,scope,c.sessionId)'),keyAt=stop.indexOf('await lockOriginal(tx,scope,c.key)'),fenceAt=stop.indexOf('await new FenceRepository(new RecoveryRepository(nested,this.bindingFor)).execute');
assert.ok(loadAt>=0&&loadAt<keyAt&&keyAt<fenceAt);
assert.match(source.nativeStop.split(' async load(')[1].split(' async snapshot(')[0],/lockSpaceBarrier\(tx,scope\)/);
assert.match(source.nativeOriginalKey,/\['model-original',scope.tenantId,scope.spaceId,scope.actorId,key\]/);
const execute=source.rawFence.split(' async execute(')[1].split(' async state(')[0];
assert.ok(execute.indexOf("['recovery-fence-key'")<execute.indexOf('await this.barrier(tx,scope)'));
assert.match(source.rawFence,/stop\?'cancelling'/);assert.match(source.rawFence,/revokedAt:resume\?null:now.toISOString\(\)/);
assert.match(source.effect,/const executable=dispatch\?\['running','reconciling'\]:\['running','reconciling','paused'\]/);
assert.match(source.effect,/lease.revokedAt!==null/);assert.match(source.effect,/Expired effect or execution lease/);
assert.match(source.effect,/if\(claimed\)this.dispatchClaims.add/);assert.match(source.effect,/dispatchClaims.delete/);
assert.match(source.receipt,/receipt.intentDigest===bindingDigest\(intent\)/);
assert.match(source.effectMigration,/NEW.record->'binding' IS DISTINCT FROM OLD.record->'binding'/);
assert.match(source.recoveryMigration,/recovery_immutable_receipt/);
for(const token of ['confirmed','not-applied','cancelled'])assert.ok(source.barrier.includes(token)||source.transitions.includes(token));
for(const path of protocol.settlement.legalTransitions){for(let i=1;i<path.length;i++){const entry=source.transitions.split('const effectTransitions:')[1].split('export function assertRunTransition')[0].match(new RegExp("(?:^|[ \n])"+path[i-1]+": \\[([^\\]]+)\\]"));assert.ok(entry,'Missing original transition '+path[i-1]);assert.ok(entry[1].includes("'"+path[i]+"'"),'Illegal original transition '+path.join('->'));}}
record('source-established-gaps-and-seams',{nativeStopOrder:[loadAt,keyAt,fenceAt],rawFenceIsKeyFirst:true,ordinaryReconciliationRejectsStoppedExpired:true,sources:Object.fromEntries(Object.entries(sources).map(([k,p])=>[k,{path:p,sha256:sha(source[k])}]))});
// Abstract lock-prefix validation ONLY. It does not execute owner code or a DB.
function graph(prefixes){const edges=new Map();for(const path of prefixes){const held=new Set();for(const key of path){if(held.has(key))continue;for(const prior of held){if(!edges.has(prior))edges.set(prior,new Set());edges.get(prior).add(key);}held.add(key);}}return edges;}
function cycle(edges){const visiting=new Set(),done=new Set();function visit(k){if(visiting.has(k))return true;if(done.has(k))return false;visiting.add(k);for(const child of edges.get(k)??[])if(visit(child))return true;visiting.delete(k);done.add(k);return false;}return [...edges.keys()].some(visit);}
const installed=graph(Object.values(protocol.prefixes));assert.equal(cycle(installed),false);
const rejected=graph([protocol.prefixes.nativeStop,protocol.ineligibleRawTopFence]);assert.equal(cycle(rejected),true);
record('abstract-lock-prefix-contract',{installedAcyclic:true,rawFenceNativeCycleDetected:true,edges:Object.fromEntries([...installed].map(([k,v])=>[k,[...v]])),claim:'design-only, not real PG scheduling or deadlock qualification'});
assert.equal(protocol.settlement.targetMethod,'GET');assert.equal(protocol.settlement.forbidden.includes('POST'),true);
assert.deepEqual(protocol.findings,['PR-F06-06','PR-F06-07']);
assert.deepEqual(protocol.unchanged,{requirements:101,families:142,pChildren:29,acceptanceSeconds:[1800,600,600,900],dockerAllowed:false,remoteApproved:false});
for(const variant of ['native-first-equal','native-first-conflict','top-level-first-equal','top-level-first-conflict'])assert.ok(protocol.requiredVariants['P02/unchanged-callers'].includes(variant));
for(const variant of ['stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','safe-successor-write','lookup-unavailable-held','receipt-mismatch-held','old-worker-replay-denied'])assert.ok(protocol.requiredVariants['P02/transfer-atomic'].includes(variant));
record('normative-protocol-inventory',{variants:protocol.requiredVariants,unchanged:protocol.unchanged,implementationOrder:protocol.tasks,protocolSha256:sha(readFileSync(join(directory,'protocol-contract.json')))});
const state=JSON.parse(readFileSync(resolve(root,'.loop/goals/agent-fabric-g1-f06-runtime/state.json'),'utf8'));
const expectedIds=state.requirements.map(r=>r.id).sort();
const trace=solution.split('## 13. Requirement allocation')[1].split('## 14.')[0];
const allocated=[];
for(const match of trace.matchAll(/^\| (AF-13[^|]*|UX-03[^|]*|UX-07[^|]*|UX-10[^|]*|R-\d[^|]*) \|/gm)){
 for(const token of match[1].split(',')){
  const value=token.trim();
  if(value.includes('–')){const [left,right]=value.split('–');const m=left.match(/^(.*?)(\d+)$/);const end=Number(right.match(/(\d+)$/)[1]);for(let n=Number(m[2]);n<=end;n++)allocated.push(m[1]+String(n).padStart(m[2].length,'0'));}
  else allocated.push(value);
 }
}
assert.equal(new Set(allocated).size,allocated.length,'Duplicate trace IDs');assert.deepEqual(allocated.sort(),expectedIds);assert.equal(expectedIds.length,101);
record('requirement-allocation',{finalized:expectedIds.length,allocated:allocated.length,missing:[],duplicates:[]});
const manifest=JSON.parse(readFileSync(join(directory,'leaf-plan-contract.json'),'utf8'));
function validateLeaves(m){
 assert.equal(m.assurance,'design-only');assert.equal(m.controllerPlanSubmitted,false);assert.equal(m.taskCount,m.tasks.length);assert.equal(m.turnMinutes,120);
 assert.deepEqual(m.unchanged,protocol.unchanged);
 const tasks=new Map(m.tasks.map(t=>[t.id,t]));assert.equal(tasks.size,m.tasks.length);
 const visiting=new Set(),done=new Set();
 function walk(id){assert.ok(tasks.has(id),'Missing dependency '+id);assert.equal(visiting.has(id),false,'Task cycle');if(done.has(id))return;visiting.add(id);for(const d of tasks.get(id).depends_on)walk(d);visiting.delete(id);done.add(id);}
 function ancestor(id,dep,seen=new Set()){if(seen.has(id))return false;seen.add(id);return tasks.get(id).depends_on.some(d=>d===dep||ancestor(d,dep,seen));}
 for(const t of m.tasks){walk(t.id);assert.ok(t.output.length>20);assert.ok(t.checks.length);assert.equal(t.handoffMinutes,10);assert.ok(t.implementationMinutes[1]+t.checkSeconds/60+t.handoffMinutes<=120,'Oversized '+t.id);for(const c of t.checks){assert.match(c,/^node g1-(?:runtime|identity|foundations)\/scripts\/check/);assert.doesNotMatch(c,/\*|echo |\|\||&&/);}}
 for(const dep of protocol.tasks.settlementBeforeTransfer)assert.ok(ancestor('f06-09h',dep),'Missing settlement prerequisite '+dep);
 assert.ok(ancestor('f06-09i','f06-09h'),'Phase fixture requires real transfer for recovery follow-up');assert.ok(ancestor('f06-09j','f06-09i'));
 assert.ok(ancestor('f06-10a','f06-09j'));assert.ok(ancestor('f06-11a','f06-10b'));
 assert.ok(ancestor('f06-13b','f06-12b'));assert.ok(!ancestor('f06-13a','f06-12b'),'Local protocol drafting must not need host actions');
 assert.ok(tasks.get('f06-09j').checks.includes('node g1-runtime/scripts/check-owners.mjs --cases P01 P02'));
 assert.ok(tasks.get('f06-11e').checks.includes('node g1-runtime/scripts/check-owners.mjs'));
 assert.ok(tasks.get('f06-14e').checks.includes('node g1-runtime/scripts/check-remote.mjs'));
 assert.deepEqual(tasks.get('f06-15').checks,['node g1-runtime/scripts/check.mjs','node g1-identity/scripts/check.mjs','node g1-foundations/scripts/check.mjs','node g1-foundations/scripts/check-retained.mjs']);
 assert.equal(m.groups.length,7);assert.equal(m.paths.length,5);
 for(let n=1;n<=5;n++)assert.ok(tasks.get('f06-13d'+n).checks[0].endsWith('X04/settlement/'+m.paths[n-1]));
 return {count:tasks.size,dependencies:Object.fromEntries(m.tasks.map(t=>[t.id,t.depends_on])),maxTurnMinutes:Math.max(...m.tasks.map(t=>t.implementationMinutes[1]+t.checkSeconds/60+t.handoffMinutes)),unmeasured:true};
}
record('replacement-leaf-DAG-and-turn-envelopes',validateLeaves(manifest));assert.equal(manifest.tasks.length,53);
const table=[...solution.matchAll(/^\| (f06-[0-9a-z]+) \| ([^|]+)\| ([^|]+)\| ([^|]+)\| ([^|]+)\| ([^|]+)\|$/gm)];
assert.equal(table.length,53);
for(const t of manifest.tasks){const row=table.find(m=>m[1]===t.id);assert.ok(row,t.id);assert.equal(row[2].trim(),t.depends_on.map(d=>d.replace('f06-','')).join(', ')||'none');assert.equal(row[3].trim(),t.output);for(const c of t.checks)assert.ok(row[4].includes(c.replace('node g1-runtime/scripts/','')));assert.equal(row[5].trim(),t.implementationMinutes.join('–')+'; '+t.checkSeconds+'; 10');}
record('document-leaf-contract-exact-mirror',{rows:table.length,checks:'exact output, dependencies, commands and estimates'});
const negatives=[['oversized',m=>m.tasks[0].implementationMinutes[1]=121],['missing-dependency',m=>m.tasks[1].depends_on=['f06-absent']],['settlement-prerequisite-removed',m=>m.tasks.find(t=>t.id==='f06-09h').depends_on=[]],['phase-fixture-too-early',m=>m.tasks.find(t=>t.id==='f06-09i').depends_on=['f06-09b']],['aggregate-replaced-by-subset',m=>m.tasks.find(t=>t.id==='f06-11e').checks=['node g1-runtime/scripts/check-owners.mjs --cases P04']]];
for(const [id,mutate] of negatives){const specimen=structuredClone(manifest);mutate(specimen);assert.throws(()=>validateLeaves(specimen),undefined,id);}
record('leaf-plan-negative-contracts',{rejected:negatives.map(([id])=>id),claim:'Design validator only; not runtime runner behavior'});

for(const token of ['P02/phase-first','P02/barrier-first','PlanMaintenanceAdmission','runtime_admit_plan_maintenance','afterArtifactWrite','readWithTransaction','parent_run_id','check-owners.mjs` P01–P05','check-remote.mjs` X01–X10','approved:false','No Docker','UNKNOWN_COMMIT'])assert.ok(solution.includes(token),token);
for(const token of ['PR-F06-04','PR-F06-05','FreshReconciliationAuthority','SECURITY INVOKER','f06-original-settlement','lease-expired-original','effect-expired-original','native-first order','top-level-first order','pg_blocking_pids','**hard prerequisites**','No predecessor source/migration/check is edited'])assert.ok(solution.includes(token),token);
record('downstream-regeneration-required',{documents:['test-plan.md','task-plan.json','docs/planning/g1-f06-plan.md','readiness.md'],status:'rejected artifacts must regenerate at their assigned stages; no pass inferred'});
// Compile fresh PURE original schema/transition modules in a disposable diagnostic directory.
// This runs original assertEffectTransition/assertRunTransition, not EffectRepository or a product fixture.
const transitionsFolder=mkdtempSync(join(tmpdir(),'af-f06-pure-transitions-'));
try{
 const {pathToFileURL}=await import('node:url');
 const ts=(await import(pathToFileURL(resolve(root,'node_modules/typescript/lib/typescript.js')).href)).default;
 writeFileSync(join(transitionsFolder,'package.json'),'{"type":"module"}');
 for(const [name,body] of [['contracts',source.transitions],['schema',readFileSync(resolve(root,'g1-recovery/src/schema.ts'),'utf8')]]){
  writeFileSync(join(transitionsFolder,name+'.js'),ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText);
 }
 const {assertEffectTransition,assertRunTransition}=await import(pathToFileURL(join(transitionsFolder,'contracts.js')).href);
 assert.throws(()=>assertEffectTransition('unknown','confirmed'),e=>e.code==='ILLEGAL_TRANSITION');
 // Stop uses the dedicated original fence saveRun schema path, not EffectRepository.phase's generic Run graph.
 assert.throws(()=>assertRunTransition('reconciling','cancelling'),e=>e.code==='ILLEGAL_TRANSITION');
 const saveRun=source.rawFence.split(' private async saveRun(')[1].split(' async enroll(')[0];
 assert.match(saveRun,/stop\?'cancelling'/);assert.match(saveRun,/runSchema.parse\(\{\.\.\.run,generation,revision:run.revision\+1,state,wait:null\}\)/);assert.doesNotMatch(saveRun,/assertRunTransition/);
 for(const transitions of protocol.settlement.legalTransitions)for(let i=1;i<transitions.length;i++)assertEffectTransition(transitions[i-1],transitions[i]);
 const phases=JSON.parse(readFileSync(join(directory,'phase-contract.json'),'utf8'));
 assert.deepEqual(phases.variants.map(v=>v.id),protocol.requiredVariants['P02/barrier-first']);
 const current=source.effect.split(' private async current(')[1].split(' private async phase(')[0];
 assert.match(current,/!executable.includes\(run.state\)/);assert.match(current,/throw new FoundationError\('STALE_AUTHORITY'\)/);
 const guarded=source.effect.split(' async guardedIO')[1].split(' async synchronizeDelivery')[0];
 assert.match(guarded,/dispatch&&effect.state!=='unknown'/);
 const reconciling=source.effect.split(' async reconciling(')[1].split(' async confirm(')[0];
 assert.match(reconciling,/lockPhase\(tx,scope,operationId,'reconciling'\)/);
 assert.match(reconciling,/assertEffectTransition\(effect.state,'reconciling'\)/);
 const confirm=source.effect.split(' async confirm(')[1].split(' async unresolved(')[0];
 assert.match(confirm,/lockPhase\(tx,scope,operationId,'confirmed'\)/);
 assert.match(confirm,/assertEffectTransition\(effect.state,'confirmed'\)/);
 const results=[];
 function evaluate(v){
  let effect='prepared',run='running',permit=false,writes=0,lookup=false;const errors=[],trace=[];
  for(const step of v.steps){try{
   if(step==='claim'||step==='claim-ack-lost'){
    assertEffectTransition(effect,'dispatched');assertEffectTransition('dispatched','unknown');assertRunTransition(run,'reconciling');effect='unknown';run='reconciling';permit=step==='claim';if(!permit)throw {code:'UNKNOWN_COMMIT'};
   }else if(step==='stop'){assert.ok(!['succeeded','partial','failed','cancelled'].includes(run));run='cancelling';}
   else{
    const claimedPermit=permit;if(step==='send')permit=false;
    if(!['running','reconciling','paused'].includes(run))throw {code:'STALE_AUTHORITY'};
    if(step==='send'){if(!claimedPermit||effect!=='unknown')throw {code:'STALE_AUTHORITY'};writes++;}
    else if(step==='reconciling'){assertEffectTransition(effect,'reconciling');effect='reconciling';}
    else if(step==='lookup')lookup=true;
    else if(step==='confirm'){assertEffectTransition(effect,'confirmed');assert.ok(lookup,'Trusted original lookup must precede useful confirmation');assertRunTransition(run,'paused');effect='confirmed';run='paused';}
    else assert.fail('Unknown phase '+step);
   }
  }catch(e){if(!e.code)throw e;errors.push(e.code);}
  trace.push({step,effect,run,writes,errors:[...errors]});}
  return {id:v.id,effect,run,writes,errors,trace};
 }
 for(const v of phases.variants){const r=evaluate(v);assert.equal(r.effect,v.effect,v.id);assert.equal(r.run,v.run,v.id);assert.equal(r.writes,v.writes,v.id);assert.deepEqual(r.errors,v.errors,v.id);results.push(r);}
 const illegalLive={...phases.variants[0],steps:['claim','send','lookup','confirm','stop']};
 assert.deepEqual(evaluate(illegalLive).errors,['ILLEGAL_TRANSITION']);
 const prematureReconcile={...phases.variants[0],steps:['claim','reconciling','send']};
 assert.equal(evaluate(prematureReconcile).writes,0);assert.deepEqual(evaluate(prematureReconcile).errors,['STALE_AUTHORITY']);
 record('fresh-original-pure-transition-contract',{variants:results,rejectedLiveWithoutReconciling:true,rejectedReconcileBeforeSend:true,originalFenceStopUsesDedicatedSchemaPath:true,genericReconcilingToCancellingStillRejected:true,sourceSha256:sha(source.transitions),claim:'Original pure transition functions + source-bound finite schedule model; NO owner method, PG/locks, fixture or F06 implementation executed'});
}finally{rmSync(transitionsFolder,{recursive:true,force:true});}

const output=process.argv[2];assert.ok(output);assert.equal(existsSync(output),false);writeFileSync(output,JSON.stringify({assurance:"resource-design-diagnostics-only",productChecksRun:false,pgRun:false,dockerRun:false,remoteRun:false,at:new Date().toISOString(),records},null,2)+"\n");console.log(JSON.stringify({records:records.length,output}));
