from pathlib import Path
import hashlib,json,re
root=Path.cwd();here=root/'docs/loop/agent-fabric-g1-f05-storage/readiness-turn152'
def read(p):return json.loads((root/p).read_bytes())
def bind(p):
 b=(root/p).read_bytes();return {'path':p,'bytes':len(b),'sha256':'sha256:'+hashlib.sha256(b).hexdigest()}
definition=read(str((here/'current-definitions.json').relative_to(root)))
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
plan=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn150/plan-after.json')
keys=['id','title','detail','covers','depends_on','role','team','checks','status']
expected=[{k:t[k] for k in keys} for t in definition['tasks']]
assert expected==[{k:t[k] for k in keys} for t in state['tasks']]
assert expected==[{k:t[k] for k in keys} for t in plan['tasks']]
assert definition['requirements']==state['requirements']==plan['requirements']
assert len(expected)==69 and sum(len(t['checks']) for t in expected)==123
assert sum(t['status']=='done' for t in expected)==46
assert all(t['team']==[] for t in expected)
assert not (root/'docs/loop/agent-fabric-g1-f05-storage/develop-turn150/probe-lock-observation.mjs').exists()
allocation=read(str((here/'task-resource-allocation.json').relative_to(root)))
pending=[];verified=0
for task in allocation:
 current=next(t for t in expected if t['id']==task['id'])
 for check,actual in zip(task['checks'],current['checks'],strict=True):
  assert {k:check[k] for k in actual}==actual
  for binding in check['sourceBindings']:
   if 'bytes' in binding:
    b=bind(binding['path']);assert b['bytes']==binding['bytes'] and b['sha256'].removeprefix('sha256:')==binding['sha256'].removeprefix('sha256:');verified+=1
   else:pending.append(binding)
assert verified==208 and len(pending)==1
inputs=read(str((here/'input-bindings.json').relative_to(root)))
for binding in inputs['sources']+inputs['contexts']:
 assert bind(binding['path'])==binding
before=(here/'readiness-before.md').read_bytes()
assert len(before)==inputs['historicalReadiness']['bytes'] and 'sha256:'+hashlib.sha256(before).hexdigest()==inputs['historicalReadiness']['sha256']
ids=[r['id'] for r in definition['requirements']]
matrix=(root/'docs/loop/agent-fabric-g1-f05-storage/test-plan.md').read_text().split('## Requirement-to-case matrix')[1].split('## Required schedules')[0]
mapped=re.findall(r'^\| (R-\d{3}|AF-07|UX-01) \|',matrix,re.M)
assert sorted(mapped)==sorted(ids) and len(set(mapped))==96
result={'candidate':read(str((here/'candidate.stdout.log').relative_to(root))),'tasks':69,'checks':123,'requirements':96,'completed':46,'unfinished':23,'currentAndTurn150DefinitionsExact':True,'requirementMatrixExactlyOnce':True,'existingSourceBindingsReadVerified':verified,'pendingImplementationBindings':pending,'originalSourceAndHistoricalFailureInputsExact':True,'historicalReadinessPreserved':True,'allEmptyTeamsWithinDefaultLimit4':True,'remainingTurnHourGate':False,'diagnosticImplemented':False,'diagnosticExecuted':False,'productQualification':False,'limitations':['sandbox ps and host sysctl restrictions reproduced','first export import overlapped reproducible cache clearing; successful after-build import retained','resource smoke did not execute SQL because original census failed before allocation','external qualification and outer supervisor cleanup unqualified']}
(here/'readiness-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
