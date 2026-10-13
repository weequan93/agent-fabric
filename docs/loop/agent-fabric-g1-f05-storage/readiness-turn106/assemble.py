"""Exact current all-task allocation and full evidence bindings, not acceptance."""
import json,re,subprocess
from datetime import datetime,timezone
from capture import ROOT,BASE,PREFIX,read,write,binding
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
write('controller-observed.json',state);write('goal-observed.json',goal)
previous=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn102/task-resource-allocation.json')
budgets={t['id']:t['engineeringEstimateMinutes'] for t in previous if t['engineeringEstimateMinutes'] is not None}
budgets.update({'f05-11-measurement-drain':65,'f05-11-full-predecessors':110})
js="""import {components,suites} from './g1-storage/scripts/manifest.mjs';import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/loop/agent-fabric-g1-f05-storage/readiness-turn106/current-plan.json'));
console.log(JSON.stringify(plan.tasks.map(t=>({...t,checks:t.checks.map(c=>{const m=c.run.match(/check-(component|slice)\\.mjs ([a-z0-9-]+)/);const r=m?(m[1]==='component'?components:suites):null;const script=c.run.match(/^node ([^ ]+)/)?.[1];return {...c,scriptExists:script?existsSync(script):null,registryPresent:m?Object.hasOwn(r,m[2]):null,sourceFilePresent:m&&r[m[2]]?existsSync('g1-storage/tests/'+r[m[2]].file.replace(/\\.js$/,'.ts')):null};})}))))"""
tasks=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,timeout=5));live={t['id']:t for t in state['tasks']}
wrappers={'harness':'f05-14-harness','owned-encryption':'f05-14-harness','delivery-audit':'f05-14-harness','atomic-disconnect':'f05-11-atomic-disconnect'}
components={'verify-atomic-disconnect':'f05-11-atomic-disconnect','verify-ask-recall':'f05-12-recall','verify-ask-disclosure':'f05-12-disclosure','verify-ask-routing':'f05-12-routing','verify-restore-current':'f05-13-current','verify-restore-interruption':'f05-13-interruption','verify-restore-integrity':'f05-13-integrity','verify-restore-measurement':'f05-13-measurement','verify-encryption':'f05-14-cipher','verify-retained-copies':'f05-14-copies','delivery-operations':'f05-15-docs','delivery-evidence':'f05-15-evidence'}
for t in tasks:
 t['status']=live[t['id']]['status'];t['engineeringEstimateMinutes']=budgets.get(t['id'])
 t['resources']=['Pinned offline Node/pnpm/TS','Cached local PG16/synthetic IdP/installed owners','Ephemeral keys/encrypted owned roots','Controller process census/GUI/full raw evidence']
 if t['id']=='f05-11-measurement-drain':t['resources'].append('Async child pipe close/write callbacks, zlib/base64/hash export and owned receipt filesystem')
 if t['id']=='f05-11-full-predecessors':t['resources'].append('Sequential fresh fixtures with unchanged optional register/observe callbacks, ownership and exact LIFO helpers')
 t['maxProvisionedPGContainers']=5 if t['id'] in ['f05-14-harness','f05-14','f05-15-schedule','f05-15'] else 4
 for c in t['checks']:
  m=re.search(r'check-(component|slice)\.mjs ([a-z0-9-]+)',c['run']);missing=any(c[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent'])
  c['missingOutputOwner']=((components if m[1]=='component' else wrappers).get(m[2],t['id']) if m else ('f05-15-evidence' if 'check-evidence.mjs' in c['run'] else t['id'])) if missing else None
  c['missingIsImplementationOutput']=missing
write('task-resource-allocation.json',tasks)
pipeline=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn102/capacity-binding.json')['pipelineEstimateMinutes']
now=datetime.now(timezone.utc);work=sum(t['engineeringEstimateMinutes'] for t in tasks if t['status']!='done')
write('capacity-binding.json',{'schemaVersion':1,'observedAt':now.isoformat(),'taskCount':64,'checkCount':105,'requirements':96,'done':42,'unfinished':22,'pending':21,'active':1,'workEstimateMinutes':work,'pipelineEstimateMinutes':pipeline,'pipelineTotalMinutes':sum(pipeline.values()),'workAndPipelineEstimateMinutes':work+sum(pipeline.values()),'policy':goal['policy'],'teamLimit':goal['agent'].get('team_limit',4),'teamLimitSource':binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),'maxDelegatedSeats':0,'perTurnCeilingMinutes':120,'remainingTurns':None,'remainingHours':None,'remainingCapacityCalculation':'Not applicable: human removed global turn/hour limits','originalStartedAt':state['started_at'],'approvedDigest':state['approved_digest'],'iteration':state['iteration'],'usage':state['usage'],'elapsedWallHours':(now-datetime.fromisoformat(state['started_at'])).total_seconds()/3600,'accountingReset':False,'newExternalResources':[]})
job='job-e0966722ed';receipts={}
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
write('controller-results.json',{'jobId':job,'qualification':'Fresh prerequisite resources only, not repair/full-harness/aggregate acceptance','checks':receipts})
historical=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/timing-ledger.json')
samples=historical['current'];total=sum(x['dispatchToReturnMs'] for x in samples[:2]);assert abs(total-1163612.160583)<1e-7
write('workload-binding.json',{'schemaVersion':1,'candidate':read('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/audit-result.json')['candidate'],'currentFailures':samples,'completeFailureStreams':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/audit-result.json'),'timingLedger':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/timing-ledger.json'),'childExports':binding('docs/loop/agent-fabric-g1-f05-storage/develop-turn104/harness-child-streams-complete.json'),'LPlusVDispatchMs':total,'fullHarnessOwner':'f05-14-harness','fullHarnessSeconds':900,'aggregateOwner':'f05-15-schedule','aggregateSeconds':1800,'maxNestedContainers':5,'fullHarnessQualified':False,'aggregateQualified':False,'default240000Removed':True,'originalTimeoutTaskComplete':False,'futureTimingRisk':'Measured failed L+V alone exceed H900s; full implementation/schedule owner must prove actual gate, no remaining-budget rejection'})
for old,name in [('readiness-turn102/submission-binding.json','reuse-readiness102.json'),('develop-turn104/seal.json','reuse-turn104.json')]:
 v=read(str(BASE.parent.relative_to(ROOT))+'/'+old);write(name,{'source':binding(str(BASE.parent.relative_to(ROOT))+'/'+old),'sealedArtifacts':v['files'],'preservedReadiness':binding(PREFIX+'/readiness-turn102-preserved.md') if name.startswith('reuse-readiness') else None,'reuseBasis':'Infrastructure/helper/product bodies unchanged; prior results remain historical, fresh resource probes and controller prerequisites bind current candidate'})
write('repair-checks.json',[{'id':t['id'],'role':t['role'],'team':t['team'],'engineeringEstimateMinutes':t['engineeringEstimateMinutes'],'depends_on':t['depends_on'],'checks':t['checks']} for t in tasks if t['id'] in ['f05-11-measurement-drain','f05-11-full-predecessors']])
print(json.dumps({'tasks':len(tasks),'checks':sum(len(t['checks']) for t in tasks),'done':sum(t['status']=='done' for t in tasks),'workEstimateMinutes':work,'pipelineMinutes':sum(pipeline.values()),'LPlusVDispatchMs':total,'freshPrerequisites':{k:v['result']['duration_ms'] for k,v in receipts.items()},'missingChecks':sum(c['missingIsImplementationOutput'] for t in tasks for c in t['checks'])}))
