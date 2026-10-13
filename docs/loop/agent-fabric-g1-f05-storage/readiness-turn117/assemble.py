"""Bind every current task/check to resources and a substantive output owner."""
import json,re,subprocess
from datetime import datetime,timezone
from capture import ROOT,BASE,PREFIX,read,write,binding
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
write('controller-observed.json',state);write('goal-observed.json',goal)
previous=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn112/task-resource-allocation.json')
budgets={t['id']:t['engineeringEstimateMinutes'] for t in previous}
budgets['f05-11-receipt-boundaries']=65
js="""import {components,suites} from './g1-storage/scripts/manifest.mjs';import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/loop/agent-fabric-g1-f05-storage/readiness-turn117/current-plan.json'));
console.log(JSON.stringify(plan.tasks.map(t=>({...t,checks:t.checks.map(c=>{const m=c.run.match(/check-(component|slice)\\.mjs ([a-z0-9-]+)/);const r=m?(m[1]==='component'?components:suites):null;const script=c.run.match(/^node ([^ ]+)/)?.[1];const source=m&&r[m[2]]?'g1-storage/tests/'+r[m[2]].file.replace(/\\.js$/,'.ts'):null;return {...c,script,scriptExists:script?existsSync(script):null,registryPresent:m?Object.hasOwn(r,m[2]):null,sourceFile:source,sourceFilePresent:source?existsSync(source):m?false:null};})}))))"""
tasks=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,timeout=5));live={t['id']:t for t in state['tasks']}
wrappers={'harness':'f05-14-harness','owned-encryption':'f05-14-harness','delivery-audit':'f05-14-harness','atomic-disconnect':'f05-11-atomic-disconnect'}
components={'verify-atomic-disconnect':'f05-11-atomic-disconnect','verify-ask-recall':'f05-12-recall','verify-ask-disclosure':'f05-12-disclosure','verify-ask-routing':'f05-12-routing','verify-restore-current':'f05-13-current','verify-restore-interruption':'f05-13-interruption','verify-restore-integrity':'f05-13-integrity','verify-restore-measurement':'f05-13-measurement','verify-encryption':'f05-14-cipher','verify-retained-copies':'f05-14-copies','delivery-operations':'f05-15-docs','delivery-evidence':'f05-15-evidence'}
for t in tasks:
 t['status']=live[t['id']]['status'];t['engineeringEstimateMinutes']=budgets[t['id']]
 t['resources']=['Pinned offline Node/pnpm/TS','Cached local PG16/synthetic IdP/installed owners','Ephemeral fixture keys and owned encrypted roots','Controller process census/GUI/full raw evidence']
 t['maxProvisionedPGContainers']=5 if t['id'] in ['f05-14-harness','f05-14','f05-15-schedule','f05-15'] else 4
 for c in t['checks']:
  m=re.search(r'check-(component|slice)\.mjs ([a-z0-9-]+)',c['run']);missing=any(c[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent'])
  c['missingOutputOwner']=((components if m[1]=='component' else wrappers).get(m[2],t['id']) if m else ('f05-15-evidence' if 'check-evidence.mjs' in c['run'] else t['id'])) if missing else None
  c['missingIsImplementationOutput']=missing
  c['resourceState']='ready; planned implementation output owned' if missing else 'ready; future current-candidate behavioral proof required' if t['status']!='done' else 'ready; completed history retained'
  c['sourceBindings']=[binding(p) for p in [c['script'],c['sourceFile']] if p and (ROOT/p).is_file()]
  c['outputOwner']=c['missingOutputOwner'] or t['id']
  c['sourceOwnership']='Existing script/helpers/registered body preserved; implementation scope remains the exact task detail'
  if t['id'] in ['f05-11-full-predecessors','f05-11-suite-execution']:
   c['implementationRepairOwner']='f05-11-receipt-boundaries';c['sourceOwnership']='Receipt transport repair must complete first; this task separately repeats its unchanged original gates and owns its fresh result'
  if t['id'] in ['f05-11-full-receipt-transport','f05-11-receipt-boundaries']:
   c['outputOwner']=t['id'];c['sourceOwnership']='Boundary prerequisite owns five authorized thin sources plus diagnostic codec/correction reader/extension; existing receipt task repeats its own unchanged gates. All original assertions/runner/helper bytes stay exact'
  if m and m[2]=='security' and missing:
   c['substantiveImplementationOwners']=['f05-14-cipher','f05-14-copies','f05-14-harness'];c['sourceOwnership']='Terminal security wrapper integrates already-proven cipher/copy/harness bodies; cannot supply first missing substantive assertions'
write('task-resource-allocation.json',tasks)
receipts={};job='job-98fb1bd06b'
for cid in ['f05-01.strict-build','f05-04.source-content-component','acceptance.retained-baselines']:
 result=state['checks'][cid];assert result['status']=='pass' and job in result['log'];tid,name=cid.split('.',1)
 definition=next(c for c in (goal['acceptance'] if tid=='acceptance' else live[tid]['checks']) if c['id']==name)
 streams=[];measurements=[]
 for channel in ['stdout','stderr']:
  original=result['log']+'/'+channel+'.log';raw=(ROOT/original).read_bytes();copy=PREFIX+'/controller-raw/'+job+'/'+cid+'/'+channel+'.log';p=ROOT/copy;p.parent.mkdir(parents=True,exist_ok=True);assert not p.exists();p.write_bytes(raw);streams.append({'original':binding(original),'copy':binding(copy)})
  for line in raw.decode().splitlines():
   try:
    v=json.loads(line)
    if isinstance(v,dict) and 'measurement' in v:measurements.append(v)
   except json.JSONDecodeError:pass
 receipts[cid]={'definition':definition,'result':{k:v for k,v in result.items() if k!='tail'},'streams':streams,'measurements':measurements,'fullStreamsRead':True}
write('controller-results.json',{'jobId':job,'qualification':'Fresh prerequisites only; not repaired receipt/full workload acceptance','checks':receipts})
# All subsequent writes are new resource-stage artifacts, never production changes.
scope=['scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/check-full-predecessor-composition.mjs','scripts/composition-preservation.mjs','scripts/receipt-preservation.mjs']
immutable=['scripts/full-receipt-transport.mjs','scripts/runner.mjs','scripts/suite-execution.mjs','scripts/execution-preservation.mjs','scripts/fixture.mjs','scripts/full-isolation-descriptor.mjs','scripts/process-result.mjs','scripts/observation-gate.mjs','scripts/build.mjs','scripts/manifest.mjs','verification/full-receipt-extension-v1.json','verification/full-composition-extension-v1.json','verification/measurement-transport-extension-v1.json','verification/execution-extension-v1.json']
write('receipt-source-ownership.json',{'task':'f05-11-receipt-boundaries','lead':'tester','team':[],'engineeringMinutes':65,'breakdownMinutes':{'diagnostic':10,'splitMarkers':10,'preservation':10,'controls':10,'controller':20,'evidence':5},'existingAuthorizedSources':[binding('g1-storage/'+p) for p in scope],'newOwnedOutputs':['Small closed nonqualifying diagnostic codec; bind actual current bytes in every full registration','Standalone correction preservation reader; no imports/calls back into earlier reconstruction readers','Versioned correction extension sealing exact current1116 predecessor and only five changed/additive paths'], 'immutableDependencies':[binding('g1-storage/'+p) for p in immutable if (ROOT/'g1-storage'/p).exists()], 'proposal':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/repair-proposal.md'),'missingResources':[],'missingImplementation':['closed SQL diagnostic adapter/admission and hostility','closed native split-marker collector/actual serializer controls','default/all correction and receipt reader paths plus closed control coverage','all four actual complete gates on one frozen repaired candidate'], 'defaultAudit':'Exact correction metadata/all changed/new paths; exact receipt metadata/all changed/new receipt paths via correction; composition changed/additions via receipt/correction; existing execution/measurement seals/pins. Unchanged deleted ordinary files must reach original compiler/module/fixture checks.', 'allAudit':'Mandatory no-argument composition guard reconstructs every1116 predecessor byte, then1113/1106/1103/1100 inventories and14pins; changed/missing ordinary files refused exhaustively.', 'bootstrap':'Correction reader validates current five thin source bytes and added modules against its new closed record, then reverses to exact1116 bytes before prior records certify anything. Receipt reader is itself a prior sealed added module: compare its corrected predecessor bytes, not modified live bytes, to old receipt added digest. Composition reader first applies correction via receipt reconstruction. No circular imports, recursion, double reversal or broad catch/fallback. Record predecessor digest fixed ce6fdecf and exact changed/additions lists; independent review must verify actual implementation.', 'sourceBindingRequirement':'Future diagnostic codec current byte hash enters every registration source binding. Current codec stays unchanged; earlier records/raw evidence immutable. New artifacts exact names and byte seals assigned by development after independent review.'})
write('mandatory-repair-chain.json',[{k:t[k] for k in ['id','status','role','team','engineeringEstimateMinutes','depends_on','checks']} for tid in ['f05-11-receipt-boundaries','f05-11-full-receipt-transport','f05-11-full-predecessors','f05-11-suite-execution'] for t in tasks if t['id']==tid])
pipeline=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn112/capacity-binding.json')['pipelineEstimateMinutes'];work=sum(t['engineeringEstimateMinutes'] for t in tasks if t['status']!='done')
write('capacity-binding.json',{'observedAt':datetime.now(timezone.utc).isoformat(),'tasks':len(tasks),'checks':sum(len(t['checks']) for t in tasks),'requirements':len(state['requirements']),'statusCounts':{s:sum(t['status']==s for t in tasks) for s in ['done','pending','active']},'unfinished':sum(t['status']!='done' for t in tasks),'workEstimateMinutes':work,'pipelineEstimateMinutes':pipeline,'pipelineTotalMinutes':sum(pipeline.values()),'workAndPipelineEstimateMinutes':work+sum(pipeline.values()),'policy':goal['policy'],'teamLimit':goal['agent'].get('team_limit',4),'teamLimitSource':binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),'maxDelegatedSeats':0,'remainingTurns':None,'remainingHours':None,'capacityVerdict':'Not applicable: no global turn or wall-clock budget','originalStartedAt':state['started_at'],'approvedDigest':state['approved_digest'],'iteration':state['iteration'],'usage':state['usage'],'accountingReset':False,'newExternalResources':[]})
attempt=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/official-attempt.json');total=sum(r['dispatch']['elapsedMs'] for r in attempt['runs'][:2])
write('workload-binding.json',{'candidate':attempt['candidate'],'officialAttempt':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/official-attempt.json'),'seal':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/seal.json'),'diagnosis':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/diagnosis.json'),'finishedJob':attempt['job'],'allFourResults':[r['result'] for r in attempt['runs']],'LPlusVDispatchMs':total,'dispatchMs':[r['dispatch']['elapsedMs'] for r in attempt['runs'][:2]],'completeCommandMs':[r['commandClock']['elapsedMs'] for r in attempt['runs'][:2]],'fullHarnessOwner':'f05-14-harness','fullHarnessSeconds':900,'aggregateOwner':'f05-15-schedule','aggregateSeconds':1800,'fullHarnessQualified':False,'aggregateQualified':False,'harnessRequiredChildReceipts':63,'harnessActualChildren':61,'nativeChildrenRetained':13,'default240000Removed':True,'noGlobalCapacityGate':True,'futureTimingRisk':'Failed-candidate L+V dispatch alone exceed H900s; actual H/full public aggregate feasibility pending. No capacity/deadline amendment requested.'})
reuse=[]
for report in ['readiness-turn112/submission-binding.json','develop-turn114/seal.json','develop-turn115/seal.json']:
 p=str(BASE.parent.relative_to(ROOT))+'/'+report
 reuse.append({'source':binding(p),'reuseBasis':'Validate every sealed byte and source-input dependency; historical product passes never current qualification. Current facilities refreshed.'})
for p in ['readiness-turn102/five-container-envelope.mjs','readiness-turn106/sequential-resource.mjs','readiness-turn86/primitives.mjs','readiness-turn112/native-codec.mjs','develop-turn115/preservation-core.mjs']:
 reuse.append({'source':binding(str(BASE.parent.relative_to(ROOT))+'/'+p),'reuseBasis':'Exact unchanged resource-only script inputs; fresh execution in probes.json, no original logs overwritten.'})
write('reuse-bindings.json',reuse)
# Decode complete current parent/build/suite census transports from official stdout.
ns={};exec((BASE.parent/'develop-turn109/audit.py').read_text().split('ext=json.loads',1)[0],ns)
sourceReceipt=receipts['f05-04.source-content-component'];raw=(ROOT/sourceReceipt['streams'][0]['copy']['path']).read_bytes();decoded=[]
for i,(value,data,header) in enumerate(ns['receipts'](raw)):
 assert value['transportBinding']['candidate']==attempt['candidate']['digest']
 for p,d in value['transportBinding']['sources'].items():assert 'sha256:'+binding('g1-storage/scripts/'+p)['sha256']==d
 path=BASE/'controller-receipts'/f'{i:02d}-{value["phase"]}-{value["measurement"]}.json';path.parent.mkdir(exist_ok=True);assert not path.exists();path.write_bytes(data)
 decoded.append({'copy':binding(str(path.relative_to(ROOT))),'envelope':header})
write('controller-census-receipts.json',decoded)
print(json.dumps({'tasks':len(tasks),'checks':sum(len(t['checks']) for t in tasks),'unfinished':sum(t['status']!='done' for t in tasks),'workMinutes':work,'pipelineMinutes':sum(pipeline.values()),'LPlusVDispatchMs':total,'missingChecks':sum(c['missingIsImplementationOutput'] for t in tasks for c in t['checks']),'freshFullCensusReceipts':len(decoded)}))
