from pathlib import Path
import hashlib,json,re,subprocess
root=Path.cwd();here=root/'docs/loop/agent-fabric-g1-f05-storage/readiness-turn157'
def read(p):return json.loads((root/p).read_bytes())
def bind(p):
 raw=(root/p).read_bytes();return {'path':str(p),'bytes':len(raw),'sha256':'sha256:'+hashlib.sha256(raw).hexdigest()}
definition=read(str((here/'current-definitions.json').relative_to(root)))
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
assert definition['tasks']==state['tasks'] and definition['requirements']==state['requirements']
assert definition['acceptance']==goal['acceptance'] and definition['policy']==goal['policy'] and definition['agent']==goal['agent']
allocation=read(str((here/'task-resource-allocation.json').relative_to(root)));existing=0;pending=[]
for t,a in zip(definition['tasks'],allocation,strict=True):
 for key in ['id','title','detail','covers','depends_on','role','team','status']:assert t[key]==a[key]
 for c,ac in zip(t['checks'],a['checks'],strict=True):
  assert {k:ac[k] for k in c}==c
  for b in ac['sourceBindings']:
   if 'bytes' in b:assert bind(b['path'])==b;existing+=1
   else:assert not (root/b['path']).exists();pending.append(b['path'])
assert len(set(pending))==5
assert next(a for a in allocation if a['id']=='f05-11-maintenance-failure-capture')['maxProvisionedPGContainers']==4
matrix=(root/'docs/loop/agent-fabric-g1-f05-storage/test-plan.md').read_text().split('## Requirement-to-case matrix')[1].split('## Required schedules')[0]
mapped=re.findall(r'^\| (R-\d{3}|AF-07|UX-01) \|',matrix,re.M)
assert len(mapped)==len(set(mapped))==96 and sorted(mapped)==sorted(r['id'] for r in definition['requirements'])
for b in read(str((here/'input-bindings.json').relative_to(root)))['inputs']:assert bind(b['path'])==b
for directory in ['readiness-turn152','develop-turn154','develop-turn155']:
 for b in read('docs/loop/agent-fabric-g1-f05-storage/'+directory+'/step-seal.json')['files']:
  if directory=='readiness-turn152' and b['path']=='docs/loop/agent-fabric-g1-f05-storage/readiness.md':
   preserved=bind(str((here/'readiness-before.md').relative_to(root)))
   assert preserved['bytes']==b['bytes'] and preserved['sha256']==b['sha256']
  else:assert bind(b['path'])==b
streams=0
for r in read(str((here/'controller-evidence.json').relative_to(root))):
 for s in r['streams']:
  assert bind(s['original']['path'])==s['original'] and bind(s['copy']['path'])==s['copy']
  assert (root/s['copy']['path']).read_bytes()==(root/s['original']['path']).read_bytes();streams+=1
assert streams==6
before=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn152/input-bindings.json')
raw=(here/'readiness-before.md').read_bytes()
assert raw==(root/'docs/loop/agent-fabric-g1-f05-storage/readiness-turn152/report.md').read_bytes()
candidate=subprocess.run(['node','--input-type=module','-e',"import {candidateSnapshot} from './g1-storage/scripts/candidate.mjs'; console.log(JSON.stringify(candidateSnapshot()));"],capture_output=True,timeout=30)
assert candidate.returncode==0
assert json.loads(candidate.stdout)==read('docs/loop/agent-fabric-g1-f05-storage/develop-turn155/source-map.json')['candidate']
engine=Path('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py');engine_bytes=engine.read_bytes();assert 'goal["agent"].get("team_limit", 4)' in engine_bytes.decode()
assert all(t['team']==[] for t in definition['tasks'])
result={'tasks':70,'checks':126,'requirements':96,'done':47,'unfinished':23,'candidate':json.loads(candidate.stdout),'liveDefinitionsExact':True,'existingSourceReferencesReadVerified':existing,'pendingSourceReferences':len(pending),'pendingDistinctSources':sorted(set(pending)),'historicalSealsExact':True,'originalReadinessBytePreserved':True,'requirementMatrixExactOnce':True,'controllerStreamsReadVerified':streams,'allTeamsEmpty':True,'teamLimit':goal['agent'].get('team_limit',4),'teamLimitSource':{'path':str(engine),'bytes':len(engine_bytes),'sha256':'sha256:'+hashlib.sha256(engine_bytes).hexdigest()},'maxIterations':None,'maxHours':None,'capacityGate':False,'captureImplemented':False,'captureExecuted':False,'productQualification':False,'outerSupervisorQualified':False}
(here/'readiness-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
