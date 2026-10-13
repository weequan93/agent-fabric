"""Bind every current task/check to resources and a substantive output owner."""
import json,re,subprocess
from datetime import datetime,timezone
from capture import ROOT,BASE,PREFIX,read,write,binding
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
write('controller-observed.json',state);write('goal-observed.json',goal)
previous=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn106/task-resource-allocation.json')
budgets={t['id']:t['engineeringEstimateMinutes'] for t in previous}
budgets['f05-11-full-receipt-transport']=65
js="""import {components,suites} from './g1-storage/scripts/manifest.mjs';import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/loop/agent-fabric-g1-f05-storage/readiness-turn112/current-plan.json'));
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
   c['implementationRepairOwner']='f05-11-full-receipt-transport';c['sourceOwnership']='Receipt transport repair must complete first; this task separately repeats its unchanged original gates and owns its fresh result'
  if t['id']=='f05-11-full-receipt-transport':
   c['outputOwner']=t['id'];c['sourceOwnership']='Only four authorized new thin sources plus additive protocol/reader/extension; native transport and hostile guard repair. Existing assertion bodies/runner/helpers stay exact'
  if m and m[2]=='security' and missing:
   c['substantiveImplementationOwners']=['f05-14-cipher','f05-14-copies','f05-14-harness'];c['sourceOwnership']='Terminal security wrapper integrates already-proven cipher/copy/harness bodies; cannot supply first missing substantive assertions'
write('task-resource-allocation.json',tasks)
scope=['scripts/full-registration.mjs','scripts/full-composition.mjs','scripts/check-full-predecessor-composition.mjs','scripts/composition-preservation.mjs']
write('receipt-source-ownership.json',{'task':'f05-11-full-receipt-transport','lead':'tester','team':[],'engineeringMinutes':65,'breakdownMinutes':{'framing':10,'nativeTransportGuard':15,'hostilityPreservation':10,'controller':25,'evidence':5},'existingAuthorizedSources':[binding('g1-storage/'+p) for p in scope],'newOwnedOutputs':['small closed receipt protocol module (exact filename assigned in development)','standalone reversible preservation reader','versioned receipt-transport extension reconstructing every1113 predecessor byte'],'immutableDependencies':[binding('g1-storage/scripts/'+p) for p in ['runner.mjs','suite-execution.mjs','fixture.mjs','full-isolation-descriptor.mjs'] if (ROOT/'g1-storage/scripts'/p).exists()],'proposal':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/repair-proposal.md'),'missingResources':[],'missingImplementation':['closed encoder/decoder and native-safe registration transport','native observation controls through shipped encoder/decoder','all four actual complete gates on one frozen repaired candidate'],'sourceBindingRequirement':'Bind any new protocol module current bytes; reconstruct1113/1106/1103/1100 and all14 pins. Existing earlier extension records are immutable.'})
write('mandatory-repair-chain.json',[{k:t[k] for k in ['id','status','role','team','engineeringEstimateMinutes','depends_on','checks']} for tid in ['f05-11-full-receipt-transport','f05-11-full-predecessors','f05-11-suite-execution'] for t in tasks if t['id']==tid])
pipeline=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn106/capacity-binding.json')['pipelineEstimateMinutes']
work=sum(t['engineeringEstimateMinutes'] for t in tasks if t['status']!='done');now=datetime.now(timezone.utc)
write('capacity-binding.json',{'observedAt':now.isoformat(),'tasks':65,'checks':109,'requirements':96,'statusCounts':{'done':43,'pending':20,'active':2},'unfinished':22,'workEstimateMinutes':work,'pipelineEstimateMinutes':pipeline,'pipelineTotalMinutes':sum(pipeline.values()),'workAndPipelineEstimateMinutes':work+sum(pipeline.values()),'policy':goal['policy'],'teamLimit':goal['agent'].get('team_limit',4),'teamLimitSource':binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),'maxDelegatedSeats':0,'remainingTurns':None,'remainingHours':None,'capacityVerdict':'Not applicable: no global turn or wall-clock budget','originalStartedAt':state['started_at'],'approvedDigest':state['approved_digest'],'iteration':state['iteration'],'usage':state['usage'],'accountingReset':False,'newExternalResources':[]})
receipts={};job='job-54e0d9f181'
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
attempt=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/official-attempt.json');total=sum(r['dispatch']['elapsedMs'] for r in attempt['runs'][:2]);assert abs(total-1175565.755834)<1e-7
write('workload-binding.json',{'candidate':attempt['candidate'],'officialAttempt':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn110/official-attempt.json'),'retainedOfficialFailures':[r['result'] for r in attempt['runs'][:2]],'LPlusVDispatchMs':total,'dispatchMs':[r['dispatch']['elapsedMs'] for r in attempt['runs'][:2]],'completeCommandMs':[r['commandClock']['elapsedMs'] for r in attempt['runs'][:2]],'fullHarnessOwner':'f05-14-harness','fullHarnessSeconds':900,'aggregateOwner':'f05-15-schedule','aggregateSeconds':1800,'fullHarnessQualified':False,'aggregateQualified':False,'default240000Removed':True,'noGlobalCapacityGate':True,'futureTimingRisk':'Failed-candidate L+V alone exceed H900s, excluding other files/AD/H negatives/copy build/cleanup. Actual full H and public aggregate proof remain pending.'})
reuse=[]
for report in ['readiness-turn106/submission-binding.json','develop-turn108/submission-binding.json','develop-turn110/seal.json']:
 p=str(BASE.parent.relative_to(ROOT))+'/'+report
 if (ROOT/p).exists():reuse.append({'source':binding(p),'sealedArtifacts':read(p).get('files',[]),'reuseBasis':'Exact input byte/hash validation; historical qualification stays bound to original candidate. Current resource probes replace dynamic assumptions.'})
write('reuse-bindings.json',reuse)
print(json.dumps({'tasks':len(tasks),'checks':sum(len(t['checks']) for t in tasks),'done':sum(t['status']=='done' for t in tasks),'unfinished':22,'workMinutes':work,'pipelineMinutes':sum(pipeline.values()),'LPlusVDispatchMs':total,'missingChecks':sum(c['missingIsImplementationOutput'] for t in tasks for c in t['checks'])}))
