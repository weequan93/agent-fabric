import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createNativeFixture } from './helpers/native-fixture.js';
import { assertOwned, census, stopOwned } from './helpers/process-fixture.js';
import { qualificationMigrationCases, qualificationRollbackCases } from './helpers/qualification-db.js';
const root=process.env['MODEL_REPO_ROOT']!;
const moduleAt=async(name:string)=>await import(pathToFileURL(resolve(root,'g1-model/scripts',name)).href);

test('Q01 / actual owned clean build and source/test/stale-cache refusals',async()=>{
 const {buildSabotage}=await moduleAt('qualification-sabotage.mjs');buildSabotage();
});
test('Q02 / every missing suite/case and bounded real subprocess/TAP sabotage',async()=>{
 const {parserSabotage}=await moduleAt('qualification-sabotage.mjs');parserSabotage();
});
test('Q03 / additive concurrent idempotent migration and retained owner digests',qualificationMigrationCases);
test('Q04 / actual runtime inventory ownership cleanup and foreign refusals',async t=>{
 const before=census(),n=await createNativeFixture();
 try {
  await t.test('actual loopback adapter and authenticated native worker creation and reap',async()=>{
   assert.equal(n.f.adapter().ready['assurance'],'deterministic-local-only');
   const child=await n.process();assertOwned(child,census().find(r=>r.pid===child.pid));
   const row=census().find(r=>r.pid===child.pid)!;
   for(const change of [{pid:row.pid+1},{ppid:row.ppid+1},{instance:row.instance+'foreign'},{command:row.command+'foreign'}])assert.throws(()=>assertOwned(child,{...row,...change}));
   assert.throws(()=>assertOwned({...child,marker:'foreign-marker'},row));assertOwned(child,census().find(r=>r.pid===child.pid));
   await stopOwned(child);assert.equal(census().some(r=>r.pid===child.pid),false);
  });
  await t.test('actual cached PG owner image loopback plus dry-run foreign cleanup refusal',async()=>{
   const {assertContainerOwned}=await moduleAt('fixture.mjs'),owner=process.env['MODEL_FIXTURE_OWNER']!,name='agent-fabric-model-'+owner;
   const r=spawnSync('docker',['inspect',name],{encoding:'utf8',timeout:5000});assert.equal(r.status,0);const info=JSON.parse(r.stdout)[0];assertContainerOwned(info,owner,name);
   for(const forged of [structuredClone(info),structuredClone(info),structuredClone(info)]){
    forged.Config.Labels['agent-fabric.model-fixture-owner']='foreign';assert.throws(()=>assertContainerOwned(forged,owner,name));
   }
   assert.throws(()=>assertContainerOwned({...info,Name:'/foreign'},owner,name));assert.throws(()=>assertContainerOwned({...info,Config:{...info.Config,Image:'unowned'}},owner,name));
   assert.throws(()=>assertContainerOwned({...info,NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0'}]}}},owner,name));
   assertContainerOwned(info,owner,name);assert.equal(info.Mounts.some((m:{Type:string})=>m.Type==='bind'),false);
  });
  await t.test('native single owners and minimal installed dependency inventory',()=>{
   const imports=readFileSync(resolve(root,'g1-model/src/native-imports.ts'),'utf8');assert.match(imports,/engine\/kernel/);assert.match(imports,/g1-identity/);assert.match(imports,/g1-recovery/);
   const pkg=JSON.parse(readFileSync(resolve(root,'g1-model/package.json'),'utf8'));assert.deepEqual(pkg.dependencies,{pg:'8.16.3'});
   const status=JSON.parse(readFileSync(resolve(root,'g1-model/evidence/qualification-status.json'),'utf8'));assert.equal(status.independentReviews,'pending-controller-review-stages');
  });
 }finally{await n.close();}
 const childPids=(rows:ReturnType<typeof census>)=>rows.filter(r=>r.ppid===process.pid&&!r.command.startsWith('/bin/ps ')).map(r=>r.pid).sort();
 const after=census();assert.deepEqual(childPids(after),childPids(before));
 console.log(JSON.stringify({measurement:'qualification-runtime-action-boundary',paidCalls:0,supplierCalls:0,sharedDeployment:0,humanMessages:0,approvalActionAudit:'pending-independent-controller-review',inheritedSSHInventoryApproval:'controller q-6e6222040b only; no supplier permission'}));
});
test('Q05 / exact 100-row traceability frozen inputs complete raw history and binding refusals',async t=>{
 const a=await moduleAt('qualification-artifacts.mjs');const report=a.validateArtifacts();assert.equal(report.requirements,100);assert.equal(report.cases,65);assert.ok(report.streams>0);
 const expected={candidate:report.current.digest,command:'node g1-model/scripts/check.mjs',definition:'current-check-digest',lock:report.current.lock,environment:'synthetic-env',profile:'synthetic-profile',rawSha256:'a'.repeat(64),rawBytes:1};
 const good={label:'synthetic-binding-test-data',status:'pass',exitCode:0,origin:'controller',review:'pending',...expected};assert.equal(a.validateSyntheticBinding(good,expected),true);
 for(const key of Object.keys(expected))await t.test('changed binding '+key,()=>assert.throws(()=>a.validateSyntheticBinding({...good,[key]:key==='rawBytes'?0:'old'},expected)));
 assert.throws(()=>a.validateSyntheticBinding({...good,review:'author independent pass'},expected));
 for(const malformed of [{...good,label:'actual review'}, {...good,origin:'author'},{...good,status:'pending'},{...good,exitCode:1}])assert.throws(()=>a.validateSyntheticBinding(malformed,expected));
});
test('Q06 / high severity open unverified and verified synthetic gate findings',async t=>{
 const {qualificationGate}=await moduleAt('qualification-artifacts.mjs');
 for(const kind of ['authorization','isolation','stale-approval','duplicate-effect'])await t.test(kind,()=>{
  const base={label:'synthetic-gate-test-data',findings:[{kind,state:'open',verifier:'synthetic-independent-verifier',repairDigest:'sha256:'+'a'.repeat(64)}]};assert.throws(()=>qualificationGate(base));
  base.findings[0]!.state='repaired-unverified';assert.throws(()=>qualificationGate(base));base.findings[0]!.state='verified-repair';assert.equal(qualificationGate(base),true);
  assert.throws(()=>qualificationGate({...base,label:'actual-controller-verdict'}));assert.throws(()=>qualificationGate({...base,findings:[{...base.findings[0],verifier:'author'}]}));
 });
});
test('Q07 / installed metadata update refusal rollback and original-only recovery',async t=>{
 const {assertDependencyMetadata}=await moduleAt('dependencies.mjs');assertDependencyMetadata();
 const {metadataSabotage}=await moduleAt('qualification-sabotage.mjs');metadataSabotage();
 const deps=JSON.parse(readFileSync(resolve(root,'g1-model/dependencies.json'),'utf8'));assert.equal(deps.observedAt,'2026-10-07');assert.equal(deps.dependencies.length,18);
 for(const d of deps.dependencies){assert.match(d.securityStatus,/unknown/);assert.deepEqual(d.localPatches,[]);assert.equal(typeof d.declaredLicense,'string');}
 const ops=readFileSync(resolve(root,'g1-model/OPERATIONS.md'),'utf8');assert.match(ops,/dependency owner/);assert.match(ops,/unknown/);assert.match(ops,/Rollback disables admission/);
 await qualificationRollbackCases(t);
});
test('Q08 / supplier invoice no-VM SLA whole-G1 claims cannot promote local assurance',async t=>{
 const {validateScope}=await moduleAt('qualification-artifacts.mjs'),status=JSON.parse(readFileSync(resolve(root,'g1-model/evidence/qualification-status.json'),'utf8'));assert.equal(validateScope(status),true);
 for(const key of Object.keys(status.claims))await t.test('fake '+key+' pass',()=>assert.throws(()=>validateScope({...status,claims:{...status.claims,[key]:'qualified'}})));
 for(const key of Object.keys(status.external))await t.test('fake '+key+' environment',()=>{const forged=structuredClone(status);forged.external[key].status='pass';assert.throws(()=>validateScope(forged));delete forged.external[key];assert.throws(()=>validateScope(forged));});
 assert.throws(()=>validateScope({...status,assurance:'production'}));assert.throws(()=>validateScope({...status,productJudgment:'author accepted'}));
});
test('Q09 / unchanged registered regressions and false old altered receipts refuse',async()=>{
 const a=await moduleAt('qualification-artifacts.mjs');a.validateArtifacts();
 const baseline=JSON.parse(readFileSync(resolve(root,'g1-model/verification/preserved-inputs.json'),'utf8'));
 for(const path of ['g1-identity/scripts/check.mjs','g1-foundations/scripts/check.mjs','g1-foundations/scripts/check-retained.mjs'])assert.equal(a.sha(readFileSync(resolve(root,path))),baseline.files[path]);
 for(const command of Object.values(a.behaviorDefinitions)) {
  const expected={candidate:a.candidateSnapshot().digest,command,definition:baseline.files['g1-identity/scripts/check.mjs'],lock:a.candidateSnapshot().lock,environment:'synthetic-outside-sandbox',profile:'synthetic-local',rawSha256:'b'.repeat(64),rawBytes:20};
  const specimen={label:'synthetic-binding-test-data',origin:'controller',status:'pass',exitCode:0,review:'pending',...expected};assert.equal(a.validateSyntheticBinding(specimen,expected),true);
  for(const bad of [{candidate:'old-pass'},{command:'node fake-check.mjs'},{definition:'changed'},{origin:'author'},{review:'fabricated-review'},{rawSha256:'altered'},{rawBytes:0}])assert.throws(()=>a.validateSyntheticBinding({...specimen,...bad},expected));
 }
 console.log(JSON.stringify({measurement:'qualification-later-controller-gates',regressions:'pending-current-four-check-controller-run',GUI:'controller-outside-sandbox-only',independentSecurityCodeEvidenceActionLicenseScope:'pending-controller-review-stages',noAuthorSignatures:true}));
});
