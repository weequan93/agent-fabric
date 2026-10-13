from pathlib import Path
import hashlib,json,re,subprocess
root=Path.cwd();base=Path('docs/loop/agent-fabric-g1-f05-storage');here=base/'readiness-turn160'
def read(p):return json.loads((root/p).read_bytes())
def bind(p):
 b=(root/p).read_bytes();return {'path':str(p),'bytes':len(b),'sha256':'sha256:'+hashlib.sha256(b).hexdigest()}
def equal_bound(b,alternate=None):
 actual=bind(alternate or b['path']);assert actual['bytes']==b['bytes'] and actual['sha256']==b['sha256'],b['path']
d=read(here/'current-definitions.json');state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json');plan=read(base/'plan-turn159/plan-after.json');prior=read(base/'readiness-turn157/current-definitions.json')
keys=['id','title','detail','covers','depends_on','role','team','checks']
assert [{k:t[k] for k in keys} for t in state['tasks']]==plan['tasks']
assert d['tasks']==state['tasks'] and d['requirements']==state['requirements']==plan['requirements']
for k in ['acceptance','policy','agent']:assert d[k]==goal[k]
assert all(t['team']==[] for t in d['tasks']);assert goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None
changed=[]
for old,new in zip(prior['tasks'],d['tasks'],strict=True):
 fields=[k for k in keys+['status'] if old[k]!=new[k]]
 if fields:changed.append({'id':new['id'],'fields':fields})
assert changed==[{'id':'f05-11-maintenance-failure-capture','fields':['detail']}]
tasks={t['id']:t for t in d['tasks']};visited=set();active=set()
def visit(i):
 assert i not in active
 if i in visited:return
 active.add(i)
 for p in tasks[i]['depends_on']:visit(p)
 active.remove(i);visited.add(i)
for i in tasks:visit(i)
assert not (set(r['id'] for r in d['requirements'])-set(r for t in tasks.values() for r in t['covers']))
assert 'f05-11-maintenance-failure-capture' in tasks['f05-11-full-receipt-transport']['depends_on']
allocation=read(here/'task-resource-allocation.json');existing=0;pending=[]
for t,a in zip(d['tasks'],allocation,strict=True):
 for k in keys[:-1]+['status']:assert t[k]==a[k]
 for c,ac in zip(t['checks'],a['checks'],strict=True):
  assert {k:ac[k] for k in c}==c
  for b in ac['sourceBindings']:
   if 'bytes' in b:equal_bound(b);existing+=1
   else:assert not (root/b['path']).exists();pending.append(b['path'])
assert len(set(pending))==5 and len(pending)==10 and existing==210
assert allocation[-1]['maxProvisionedPGContainers']==4
matrix=(root/base/'test-plan.md').read_text().split('## Requirement-to-case matrix')[1].split('## Required schedules')[0]
ids=re.findall(r'^\| (R-\d{3}|AF-07|UX-01) \|',matrix,re.M)
assert len(ids)==len(set(ids))==96 and sorted(ids)==sorted(r['id'] for r in d['requirements'])
seals=[]
for directory in ['readiness-turn152','develop-turn154','develop-turn155','readiness-turn157','plan-turn159']:
 s=read(base/directory/'step-seal.json')
 for b in s['files']:
  alternate=base/'readiness-turn157/readiness-before.md' if b['path']==str(base/'readiness.md') and directory=='readiness-turn152' else None
  equal_bound(b,alternate)
 seals.append({'directory':directory,'entries':len(s['files']),'exact':True})
for b in read(base/'plan-turn159/input-bindings.json'):
 equal_bound(b,here/'readiness-before.md' if b['path']==str(base/'readiness.md') else None)
for b in read(here/'input-bindings.json')['inputs']:equal_bound(b)
assert (root/here/'readiness-before.md').read_bytes()==(root/base/'readiness-turn157/report.md').read_bytes()
streams=0
for directory in ['readiness-turn157','readiness-turn160']:
 for r in read(base/directory/'controller-evidence.json'):
  for s in r['streams']:
   equal_bound(s['original']);equal_bound(s['copy']);assert (root/s['original']['path']).read_bytes()==(root/s['copy']['path']).read_bytes();streams+=1
assert streams==12
candidate=subprocess.run(['node','--input-type=module','-e',"import {candidateSnapshot} from './g1-storage/scripts/candidate.mjs'; console.log(JSON.stringify(candidateSnapshot()));"],capture_output=True,timeout=30)
assert candidate.returncode==0
assert json.loads(candidate.stdout)==read(base/'develop-turn155/source-map.json')['candidate']
native=json.loads((root/here/'native-amendment-resource.stdout.log').read_bytes())
for b in native['bindings']:equal_bound(b)
assert native['originalLifecycleDispatches']==0 and not native['prototypeChanged'] and not native['originalMethodsInvoked']
engine=Path('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py');assert 'goal["agent"].get("team_limit", 4)' in engine.read_text()
result={'tasks':len(tasks),'checks':sum(len(t['checks']) for t in tasks.values()),'requirements':len(d['requirements']),'done':sum(t['status']=='done' for t in tasks.values()),'authoredChangesFromTurn157':changed,'all126CheckObjectsExact':True,'requirementMatrixExactOnce':True,'coverageComplete':True,'acyclic':True,'receiptAfterCapture':True,'existingSourceReferencesReadVerified':existing,'pendingReferences':len(pending),'pendingDistinctSources':sorted(set(pending)),'historicalSeals':seals,'turn159InputsReadVerified':28,'completeControllerStreamsReadVerified':streams,'candidate':json.loads(candidate.stdout),'allTeamsEmpty':True,'teamLimit':goal['agent'].get('team_limit',4),'capacityGate':False,'maxIterations':None,'maxHours':None,'emittedBindingsReadVerified':native['bindings'],'captureImplemented':False,'transparencyPassed':False,'originalLifecycleDispatches':0,'productQualification':False,'outerSupervisorQualified':False}
(root/here/'readiness-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
