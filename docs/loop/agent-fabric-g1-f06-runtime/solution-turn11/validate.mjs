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
const specs=[...solution.matchAll(/```typescript\n([\s\S]*?)```/g)].map(m=>m[1]);
assert.equal(specs.length,2);
const folder=mkdtempSync(join(tmpdir(),'af-f06-design-turn11-'));
try {
 const file=join(folder,'specimen.mts');
 const specimen=specs.join('\n').replace(/from '(\.\.\/\.\.\/\.\.\/[^']+)'/g,(_m,p)=>'from '+JSON.stringify(resolve(dirname(solutionPath),p)));
 const compiler=resolve(root,'node_modules/typescript/bin/tsc');
 const args=[compiler,'--noEmit','--strict','--noUncheckedIndexedAccess','--exactOptionalPropertyTypes','--target','ES2023','--lib','ES2024','--module','NodeNext','--moduleResolution','NodeNext','--esModuleInterop','--types','node','--typeRoots',resolve(root,'node_modules/@types'),file];
 function compile(source){writeFileSync(file,source);const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.ifError(r.error);return {status:r.status,stdout:r.stdout,stderr:r.stderr};}
 const positive=compile(specimen);record('strict-installed-owner-signatures',{command:[process.execPath,...args],...positive});assert.equal(positive.status,0,positive.stdout+positive.stderr);
 const negative=`\ndeclare const waiting: Extract<QueueResult,{state:'waiting'}>;\ndeclare const scalar: number;\ndeclare const artifact: PlanArtifactRef;\ndeclare const installed: ArtifactOwnerSeam;\nconst badLease: RuntimeLease = waiting;\nconst badGeneration: Generation = scalar;\nconst badRevision: 2 = artifact.revision;\ntype BadMethod = Pick<ArtifactOwnerSeam,'savePlan'>;\nconst syncResult: boolean = Promise.resolve(true);\n`;
 const rejected=compile(specimen+negative);const errors=[...rejected.stdout.matchAll(/error TS\d+:/g)];record('five-type-negatives',{...rejected,expectedErrors:5,observedErrors:errors.length});assert.notEqual(rejected.status,0);assert.equal(errors.length,5,rejected.stdout);
} finally {rmSync(folder,{recursive:true,force:true});}
// Verify source seams read-only. These are signatures/invariants, not behavior passes.
const sources={artifact:'g1-storage/src/artifact-publication.ts',native:'g1-model/src/native-repository.ts',effect:'g1-recovery/src/effect-repository.ts',lineage:'g1-model/migrations/0012_family_budget.sql'};
const text={};for(const [k,p] of Object.entries(sources))text[k]=readFileSync(resolve(root,p),'utf8');
assert.match(text.artifact,/n\.binding\.intent==='Ask'&&n\.binding\.purpose==='maintenance'/);
assert.match(text.artifact,/async readWithTransaction\(tx:SqlTransaction/);
assert.match(text.effect,/if\(claimed\)this\.dispatchClaims\.add/);
assert.match(text.effect,/dispatchClaims\.delete/);
assert.ok(text.effect.indexOf("await this.lockPhase(tx,scope,operationId,'dispatch')")<text.effect.indexOf("await this.current(tx,scope,operationId,generation,'dispatch')"));
assert.match(text.lineage,/INSERT INTO fabric\.model_budget_lineage VALUES\(t,s,r,parent_run\)/);
assert.match(text.native,/t\.cancellation_generation/);
record('source-seams',Object.fromEntries(Object.entries(sources).map(([k,p])=>[k,{path:p,sha256:sha(text[k])}])));
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
const tests=readFileSync(resolve(directory,'../test-plan.md'),'utf8');for(const token of ['P02/phase-first','P02/barrier-first','PlanPersistenceRepository','physical revision1','model12'])assert.ok(tests.includes(token),token);
for(const document of [solutionPath,resolve(root,'docs/planning/g1-f06-plan.md'),resolve(directory,'../readiness.md'),resolve(directory,'../test-plan.md')]){
 const content=readFileSync(document,'utf8');assert.equal((content.match(/^```/gm)??[]).length%2,0,'unbalanced fence');
 for(const m of content.matchAll(/\]\(([^)]+)\)/g)){const p=m[1];if(p.startsWith('http')||p.startsWith('#'))continue;const target=resolve(dirname(document),p.split('#')[0]);assert.ok(existsSync(target)||target===resolve(process.argv[2]??''),document+' link '+p);}
}
record('document-contracts',{caseUpdates:true,localLinks:true,balancedFences:true,documents:Object.fromEntries([solutionPath,resolve(root,'docs/planning/g1-f06-plan.md'),resolve(directory,'../readiness.md'),resolve(directory,'../test-plan.md')].map(p=>[p,sha(readFileSync(p))])),scope:'design-only; no product behavior claimed'});
const result={at:new Date().toISOString(),node:process.version,solutionSha256:sha(readFileSync(solutionPath)),records};
const output=process.argv[2];assert.ok(output,'Provide a new output path; preserved diagnostics are never overwritten');assert.equal(existsSync(output),false,'Preserve earlier diagnostic attempt');writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({designDiagnostics:'passed',checks:records.length,result:output,productChecksRun:false}));
