import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import type {ComponentTest} from './canonical-component.js';

// The component and full delivery suite call this same seven-leaf body. It reads
// original controller results; an old result stays historical after source edits.
export async function registerDeliveryEvidenceTests(register:ComponentTest=test){
 const root=process.env['STORAGE_REPO_ROOT']??process.cwd();
 const modulePath=pathToFileURL(resolve(root,'g1-storage/scripts/delivery-evidence.mjs')).href;
 const m=await import(modulePath),audit=m.inspectEvidence();
 const original=audit.latest.find((r:{id:string})=>r.id==='f05-15-docs.delivery-operations-component');assert(original);
 await register('D02 / actual candidate, definitions, raw streams and independent status',async t=>{
  await t.test('D02/candidate-check-lock-binding',async()=>{
   assert.match(audit.current.candidate.digest,/^sha256:[a-f0-9]{64}$/);const current=await import(pathToFileURL(resolve(root,'g1-storage/scripts/candidate.mjs')).href);assert.deepEqual(audit.current.candidate,current.candidateSnapshot());
   for(const file of ['tests/helpers/delivery-evidence-component.ts','tests/components/delivery-evidence.test.ts','tests/delivery-audit.test.ts','scripts/delivery-evidence.mjs','scripts/check-evidence.mjs']){const stat=lstatSync(resolve(root,'g1-storage',file));assert(stat.isFile()&&!stat.isSymbolicLink());assert(stat.size>0);}
   assert.match(audit.current.controllerFingerprint,/^git:[a-f0-9]{24}$/);
   const dependencies=JSON.parse(readFileSync(resolve(root,'g1-storage/dependencies.json'),'utf8'));assert.equal(audit.current.lock.sha256,'sha256:'+dependencies.lockSha256);
   assert.equal(original.command,'node g1-storage/scripts/check-component.mjs delivery-operations');assert.match(original.candidate,/^sha256:[a-f0-9]{64}$/);assert.equal(original.status,'pass');assert.equal(original.exitCode,0);assert.equal(original.outcome,'completed');assert(original.elapsedMs>0);
   const transport=original.rows.find((r:{measurement:string;binding?:{phase:string}})=>r.measurement==='storage-measurement-transport'&&r.binding?.phase==='command');assert(transport);assert.equal(transport.binding.candidate,original.candidate);assert.equal(transport.binding.command.args.at(-1),'delivery-operations');assert.equal(transport.binding.command.args.at(-2),resolve(root,'g1-storage/scripts/check-component.mjs'));
   for(const [id,path] of [['g1-storage-behavior','g1-storage/scripts/check.mjs'],['identity-behavior','g1-identity/scripts/check.mjs'],['foundation-behavior','g1-foundations/scripts/check.mjs'],['retained-baselines','g1-foundations/scripts/check-retained.mjs']])assert.deepEqual(audit.definitions['acceptance.'+id].argv,['node',path]);
   assert.equal(original.candidateCurrent,original.candidate===audit.current.candidate.digest);assert.equal(original.workspaceCurrent,original.controllerFingerprint===audit.current.controllerFingerprint);
   assert.throws(()=>m.assertCurrentRun({...original,candidate:audit.current.candidate.digest,controllerFingerprint:'git:000000000000000000000000'},audit.current),/Stale controller workspace/);
   assert.throws(()=>m.assertCurrentRun({...original,controllerFingerprint:audit.current.controllerFingerprint,candidate:'sha256:'+'0'.repeat(64)},audit.current),/Stale F05 candidate/);
  });
  await t.test('D02/complete-controller-streams',async()=>{
   for(const stream of [original.stdout,original.stderr]){const bytes=readFileSync(resolve(root,stream.path));m.assertStream(bytes,stream);assert.throws(()=>m.assertStream(Buffer.concat([bytes,Buffer.from('changed')]),stream));if(bytes.length)assert.throws(()=>m.assertStream(bytes.subarray(0,-1),stream),/Complete stream byte count/);assert.throws(()=>m.assertStream(bytes,{...stream,sha256:'sha256:'+'0'.repeat(64)}),/Original stream SHA256/);}
   const output=original.rows.filter((r:{measurement:string})=>r.measurement==='storage-test-report');assert.equal(output.length,1);assert.equal(output[0].scope,'component');assert.equal(output[0].diagnosticOnly,true);const r=output[0].reports[0];assert.equal(r.suite,'delivery-operations');assert.equal(r.tests,28);assert.equal(r.cases.length,4);assert.equal(r.variants.length,24);
   const required=JSON.parse(readFileSync(resolve(root,'g1-storage/verification/required-variants-v1.json'),'utf8'));for(const id of ['D01','D03','D04','D05'])for(const leaf of required.cases[id])assert.equal(r.executions.filter((e:{name:string;indent:number;parent:string|null})=>e.indent===4&&e.name===leaf&&e.parent?.startsWith(id+' / ')).length,1,leaf);
   const fixtures=original.rows.filter((r:{measurement:string})=>r.measurement==='storage-owned-fixture');assert.equal(fixtures.length,1);
   for(const f of fixtures){for(const name of ['storage-container-cleanup','storage-root-cleanup']){const entries=original.rows.filter((r:{measurement:string;owner:string;instance:string})=>r.measurement===name&&r.owner===f.owner&&r.instance===f.instance);assert.equal(entries.length,1);assert.equal(entries[0].removed,true);if(name==='storage-container-cleanup')assert.equal(entries[0].censusUnchanged,true);}}
   const children=original.rows.filter((r:{measurement:string})=>r.measurement==='model-owned-process');assert.equal(children.length,4);for(const child of children){const cleanup=original.rows.filter((r:{measurement:string;pid:number})=>r.measurement==='model-owned-process-cleanup'&&r.pid===child.pid);assert.equal(cleanup.length,1);assert.equal(cleanup[0].removed,true);}
   assert.equal(original.rows.filter((r:{measurement:string})=>r.measurement==='strict-build').length,1);const guards=original.rows.filter((r:{measurement:string})=>r.measurement==='preserved-inputs');assert(guards.length>=2);for(const g of guards){assert.equal(g.files,2581);assert.equal(g.unchanged,true);}
   // Controller-wrapper cleanup stays distinct from these owned fixture records.
   assert(original.cleanup==='zombie'||original.cleanup==='clean'||original.cleanup==='reaped');assert.equal(audit.qualification.authorVerdict,false);
  });
  await t.test('D02/pending-review-visible',async()=>{
   const reviews=m.reviewState(audit.state,audit.events,audit.current.controllerFingerprint);assert.deepEqual(Object.keys(reviews),['security','code','final-acceptance','product-acceptance']);
   for(const [id,r] of Object.entries(reviews) as [string,{status:string}][])if(r.status!=='pass')assert(audit.qualification.blockers.some((b:string)=>b.includes(id)),id);
   const manufactured={...audit.state,reviews:{...audit.state.reviews,security:{verdict:'pass',fingerprint:audit.current.controllerFingerprint,at:'2000-01-01T00:00:00Z',by:'author',signature:'fabricated'}}};assert.equal(m.reviewState(manufactured,audit.events,audit.current.controllerFingerprint).security.status,'unregistered');assert.equal(m.qualification({...audit,state:manufactured}).qualified,false);
   assert.equal(audit.qualification.externalQualification,'pending');assert.equal(audit.qualification.authorVerdict,false);
  });
  await t.test('D02/historical-failures-retained',async()=>{
   const path='.loop/goals/agent-fabric-g1-f05-storage/runs/checks/job-bef5a26060/f05-15-docs.delivery-operations-component/';
   for(const [name,bytes,sha256] of [['stdout',169738,'4a6b1a4a4d03c5b702d51af33eca62a1e0e78dd67a81f4ca6ef19ab2a31c6ae0'],['stderr',2165,'c5c4576d5868611faf8b824974ade32ac89735935871030259e94df04e20df53']] as const)m.assertStream(readFileSync(resolve(root,path+name+'.log')),{bytes,sha256:'sha256:'+sha256});
   const raw=readFileSync(resolve(root,path+'stdout.log'),'utf8');assert(raw.includes('D03/all-fields-inventory'));assert(raw.includes('# fail 2'));assert(audit.events.some((e:{type:string;data:{job?:string;results?:Record<string,string>}})=>e.type==='job.finished'&&e.data.job==='job-bef5a26060'&&e.data.results?.['f05-15-docs.delivery-operations-component']==='fail'));
   assert.notEqual(original.job,'job-bef5a26060');
  });
 });
 await register('D06 / unsupported qualification is refused against live controller evidence',async t=>{
  await t.test('D06/severe-finding-blocks',async()=>{
   for(const category of ['authorization','isolation','stale-approval','duplicate-effect'])for(const severity of ['high','critical']){
    const finding={id:'owned-negative-'+category+'-'+severity,status:'confirmed',severity,category,profile:'deterministic-local-only',text:'Unresolved '+category+' defect'};
    const findings=[...audit.state.findings,finding],result=m.qualification(audit,{findings});assert.equal(result.qualified,false);assert(result.blockers.includes('Unresolved severe finding: '+finding.id));assert.throws(()=>m.requireControllerBehavior({...audit,state:{...audit.state,findings}}),/Unresolved severe findings/);
    assert(!m.severeFindings([{...finding,status:'rejected'}]).length);
   }
  });
  await t.test('D06/missing-current-acceptance-blocks',async()=>{
   const absent={...audit,latest:audit.latest.filter((r:{id:string})=>!r.id.startsWith('f05-15.')),state:{...audit.state,verification:null}};
   const result=m.qualification(absent);assert.equal(result.qualified,false);assert(result.blockers.includes('Missing current controller final acceptance'));assert.throws(()=>m.requireControllerBehavior(absent),/Missing terminal controller result/);
   const noAcceptance=m.qualification({...audit,state:{...audit.state,verification:null}});assert.equal(noAcceptance.qualified,false);assert(noAcceptance.blockers.includes('Missing current controller final acceptance'));
   const staleAcceptance=m.qualification({...audit,state:{...audit.state,verification:{passed:true,fingerprint:'git:'+'0'.repeat(24)}}});assert.equal(staleAcceptance.qualified,false);assert(staleAcceptance.blockers.includes('Missing current controller final acceptance'));
   for(const status of ['fail','timeout']){const failed={...original,id:'f05-15.full-storage-behavior',status,controllerFingerprint:audit.current.controllerFingerprint,candidate:audit.current.candidate.digest};const result=m.qualification({...audit,latest:[failed,...audit.latest]});assert.equal(result.qualified,false);assert(result.blockers.includes('Failed or stale terminal controller check: full-storage-behavior'));}
   for(const [id,check] of Object.entries(audit.definitions) as [string,{run?:string}][])if(id==='f05-15.evidence-controller')assert.equal(check.run,'node g1-storage/scripts/check-evidence.mjs controller-behavior');
  });
  await t.test('D06/no-author-verdict',async()=>{
   for(const claim of ['COMPLETE','qualified','security-pass']){const r=m.qualification(audit,{claim});assert.equal(r.qualified,false);assert(r.blockers.includes('Author claims cannot issue controller acceptance'));assert.equal(r.authorVerdict,false);}
   for(const args of [[],['local','extra'],['unknown'],['controller-behavior','extra']]){const r=spawnSync(process.execPath,[resolve(root,'g1-storage/scripts/check-evidence.mjs'),...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/Unknown\/extra evidence checker argument/);assert.equal(r.stdout,'');}
   assert.equal(audit.qualification.externalQualification,'pending');
  });
 });
 console.log(JSON.stringify({measurement:'delivery-evidence-assertions',candidate:audit.current.candidate.digest,controllerFingerprint:audit.current.controllerFingerprint,latestChecks:audit.latest.length,operationsJob:original.job,operationsCandidate:original.candidate,operationsWorkspaceCurrent:original.workspaceCurrent,qualification:audit.qualification,reviews:m.reviewState(audit.state,audit.events,audit.current.controllerFingerprint),wholeHostReaped:false}));
}
