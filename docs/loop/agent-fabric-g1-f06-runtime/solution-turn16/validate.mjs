// Design diagnostics only. Never loads a product check, fixture, DB, GUI or backend.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=dirname(fileURLToPath(import.meta.url));
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
const folder=mkdtempSync(join(tmpdir(),'af-f06-design-turn16-'));
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
assert.deepEqual(protocol.findings,['PR-F06-04','PR-F06-05']);
assert.deepEqual(protocol.unchanged,{requirements:101,families:142,pChildren:29,tasks:15,acceptanceSeconds:[1800,600,600,900],dockerAllowed:false,remoteApproved:false});
for(const variant of ['native-first-equal','native-first-conflict','top-level-first-equal','top-level-first-conflict'])assert.ok(protocol.requiredVariants['P02/unchanged-callers'].includes(variant));
for(const variant of ['stopped-original-stop-run','stopped-original-stop-task','lease-expired-original','effect-expired-original','safe-successor-write','lookup-unavailable-held','receipt-mismatch-held','old-worker-replay-denied'])assert.ok(protocol.requiredVariants['P02/transfer-atomic'].includes(variant));
record('normative-protocol-inventory',{variants:protocol.requiredVariants,unchanged:protocol.unchanged,implementationOrder:protocol.tasks['f06-09'],protocolSha256:sha(readFileSync(join(directory,'protocol-contract.json')))});
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
const tasks=[...solution.matchAll(/^\| f06-(\d{2}) ([^|]+)\| ([^|]+)\|/gm)];
assert.equal(tasks.length,15);assert.deepEqual(tasks.map(m=>Number(m[1])),Array.from({length:15},(_,i)=>i+1));
const dependencies={};for(const m of tasks){const id=Number(m[1]);const value=m[3].trim();const deps=[];for(const token of value.split(',')){const t=token.trim();if(t==='none')continue;if(t.includes('–')){const [a,b]=t.split('–').map(Number);for(let d=a;d<=b;d++)deps.push(d);}else deps.push(Number(t));}assert.ok(deps.every(d=>Number.isInteger(d)&&d>0&&d<id));dependencies[id]=deps;}
record('replacement-task-DAG',{count:tasks.length,dependencies});
for(const token of ['P02/phase-first','P02/barrier-first','PlanMaintenanceAdmission','runtime_admit_plan_maintenance','afterArtifactWrite','readWithTransaction','parent_run_id','check-owners.mjs` P01–P05','check-remote.mjs` X01–X10','approved:false','No Docker','UNKNOWN_COMMIT'])assert.ok(solution.includes(token),token);
for(const token of ['PR-F06-04','PR-F06-05','FreshReconciliationAuthority','SECURITY INVOKER','f06-original-settlement','lease-expired-original','effect-expired-original','native-first order','top-level-first order','pg_blocking_pids','Checkpoint (b) is a hard prerequisite','No predecessor source/migration/check is edited'])assert.ok(solution.includes(token),token);
record('downstream-regeneration-required',{documents:['test-plan.md','task-plan.json','docs/planning/g1-f06-plan.md','readiness.md'],status:'rejected artifacts must regenerate at their assigned stages; no pass inferred'});
for(const document of [solutionPath,resolve(root,'docs/planning/g1-f06-plan.md'),resolve(directory,'../readiness.md'),resolve(directory,'../test-plan.md')]){
 const content=readFileSync(document,'utf8');assert.equal((content.match(/^```/gm)??[]).length%2,0,'unbalanced fence');
 for(const m of content.matchAll(/\]\(([^)]+)\)/g)){const p=m[1];if(p.startsWith('http')||p.startsWith('#'))continue;const target=resolve(dirname(document),p.split('#')[0]);assert.ok(existsSync(target)||target===resolve(process.argv[2]??''),document+' link '+p);}
}
record('document-contracts',{normativeSolutionUpdated:true,downstreamArtifactsRequireRegeneration:true,localLinks:true,balancedFences:true,documents:Object.fromEntries([solutionPath,resolve(root,'docs/planning/g1-f06-plan.md'),resolve(directory,'../readiness.md'),resolve(directory,'../test-plan.md')].map(p=>[p,sha(readFileSync(p))])),scope:'design-only; no product behavior claimed'});
const result={at:new Date().toISOString(),node:process.version,solutionSha256:sha(readFileSync(solutionPath)),records};
const output=process.argv[2];assert.ok(output,'Provide a new output path; preserved diagnostics are never overwritten');assert.equal(existsSync(output),false,'Preserve earlier diagnostic attempt');writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({designDiagnostics:'passed',checks:records.length,result:output,productChecksRun:false}));
