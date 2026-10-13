"""Read-only readiness verifier; source guards and resources are not product acceptance."""
import hashlib
import json
import re
import sys
assert sys.argv[1:] in [[],["--bootstrap"]]
bootstrap=sys.argv[1:]==["--bootstrap"]
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
PREFIX = str(BASE.relative_to(ROOT))
REPORT = 'docs/loop/agent-fabric-g1-f05-storage/readiness.md'


def read(path):
    return json.loads((ROOT / path).read_text())


def verify(b):
    path = ROOT / b['path']
    if b['path'] == REPORT:
        path = BASE / 'readiness-turn101-preserved.md'
    assert path.is_file() and not path.is_symlink(), path
    raw = path.read_bytes()
    assert len(raw) == b['bytes'], path
    assert hashlib.sha256(raw).hexdigest() == b['sha256'], path


plan = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/current-plan.json')
allocation = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/resource-allocation.json')
workload = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn98/workload.json')
before = read(PREFIX + '/controller-before.json')
observed = read(PREFIX + '/controller-observed.json')
live = read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal = read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
capacity = read(PREFIX + '/capacity-binding.json')
definitions = ['id', 'title', 'detail', 'covers', 'depends_on', 'role', 'team', 'checks']
assert plan['tasks'] == [{k:t[k] for k in definitions} for t in live['tasks']]
assert before['tasks'] == observed['tasks'] == live['tasks'], 'No task mutations in resources'
assert goal == read(PREFIX + '/goal-before.json') == read(PREFIX + '/goal-observed.json')
assert plan['requirements'] == live['requirements'] == before['requirements']
assert live['requirements_final'] and len(plan['requirements']) == 96
assert len(live['tasks']) == 62 and sum(len(t['checks']) for t in live['tasks']) == 99
assert sum(t['status'] == 'done' for t in live['tasks']) == 42
assert sum(t['status'] == 'pending' for t in live['tasks']) == 20
assert not any(t['status'] == 'active' for t in live['tasks'])
assert all(t['team'] == [] for t in live['tasks'])
assert capacity['teamLimit'] == goal['agent'].get('team_limit', 4) == 4
assert capacity['maxDelegatedSeats'] == 0
assert goal['policy'] == allocation['policy'] == capacity['policy']
assert goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None
assert goal['policy']['turn_timeout_minutes'] == 120
assert live['started_at'] == capacity['originalStartedAt']
assert live['approved_digest'] == capacity['approvedDigest']
assert capacity['remainingTurns'] is None and capacity['remainingHours'] is None
assert capacity['workEstimateMinutes'] == sum(t['engineeringEstimateMinutes'] for t in allocation['pendingTasks']) == 1625
assert capacity['pipelineTotalMinutes'] == sum(capacity['pipelineEstimateMinutes'].values()) == 690
assert capacity['remainingWorkAndPipelineEstimateMinutes'] == 2315
assert all(t['engineeringEstimateMinutes'] <= 120 for t in allocation['pendingTasks'])
tasks = {t['id']:t for t in live['tasks']}
active, visited = set(), set()
def visit(id):
    assert id not in active, ('Cycle', id)
    if id in visited:
        return
    active.add(id)
    for parent in tasks[id]['depends_on']:
        assert parent in tasks
        visit(parent)
    active.remove(id)
    visited.add(id)
for id in tasks:
    visit(id)
assert {r['id'] for r in plan['requirements']} <= {r for t in live['tasks'] for r in t['covers']}
assert 'f05-11-suite-execution' in tasks['f05-11']['depends_on']
assert 'f05-11-suite-execution' in tasks['f05-11-atomic-disconnect']['depends_on']
assert 'f05-15-schedule' in tasks['f05-15']['depends_on']
assert tasks['f05-15-schedule']['checks'][0]['timeout'] == 1800
assert goal['acceptance'] == read('docs/loop/agent-fabric-g1-f05-storage/plan-turn98/controller-before.json')['acceptance']

preservation = read(PREFIX + '/preservation-before.json')['files']
for b in preservation:
    verify(b)
for b in read(PREFIX + '/inputs.json'):
    verify(b)
for name in ['plan','controllerSnapshot','goalSnapshot','planDocument','historicalReadiness','teamLimitSource']:
    verify(capacity[name])
for p in read(PREFIX + '/probes.json'):
    assert p['exitCode'] == 0 and p['elapsedMs'] < p['timeoutSeconds'] * 1000
    for s in p['streams']:
        verify(s)
primitives = json.loads((BASE / 'primitives.stdout.log').read_text())
assert primitives['census']['error']['code'] == 'EPERM'
assert primitives['census']['status'] is None
envelope = read(PREFIX + '/envelope-probe.json')
assert envelope['exitCode'] == 0 and envelope['elapsedMs'] < 60000
for s in envelope['streams']:
    verify(s)
es = [json.loads(s) for s in (BASE / 'five-container-envelope.stdout.log').read_text().splitlines()]
concurrent = next(x for x in es if x['measurement'] == 'five-concurrent-resource-envelope')
assert len(concurrent['ready']) == 5 and len(concurrent['stats']) == 5
assert all(x['cpu'] == 1 and x['memoryBytes'] == 268435456 and x['pidsLimit'] == 128 for x in concurrent['ready'])
assert len([x for x in es if x['measurement'] == 'resource-envelope-LIFO-cleanup' and x['removed'] and x['exactCensusUnchanged']]) == 5
assert es[0]['preexistingContainers'] == es[-1]['preexistingContainers'] == []
assert es[-1]['exactCensusUnchanged']

controller = read(PREFIX + '/controller-results.json')
assert controller['jobId'] == 'job-f11187f2a7'
for id, receipt in controller['checks'].items():
    assert receipt['result']['status'] == 'pass' and receipt['result']['exit_code'] == 0
    assert receipt['result']['duration_ms'] < receipt['definition']['timeout'] * 1000
    assert receipt['result'] == {k:v for k,v in live['checks'][id].items() if k != 'tail'}
    for s in receipt['streams']:
        verify(s['original'])
        verify(s['copy'])
        assert s['original']['sha256'] == s['copy']['sha256']
source = controller['checks']['f05-04.source-content-component']['measurements']
case = next(x for x in source if x['measurement'] == 'storage-test-report')['reports'][0]
assert case['tests'] == len(case['executions']) == 12
assert all(case[k] == 0 for k in ['fail','cancelled','skipped','todo'])
assert all(v == 0 for v in case['observations']['violations'].values())
assert next(x for x in source if x['measurement'] == 'storage-container-cleanup')['censusUnchanged']
assert next(x for x in source if x['measurement'] == 'storage-root-cleanup')['removed']
retained=controller['checks']['acceptance.retained-baselines']
raw=(ROOT/retained['streams'][0]['copy']['path']).read_text()
assert [int(x) for x in re.findall(r'^# tests ([0-9]+)$',raw,re.M)]==[197,48,5,9,10]
assert not re.search(r'^# (fail|cancelled|skipped|todo) [1-9]',raw,re.M)
assert 'Electron 44.5.1 binary probe passed' in raw and 'Android Bundled' in raw
assert 'timeout: 240_000' in (ROOT / 'g1-storage/scripts/suite-execution.mjs').read_text()
body_totals = 0
for x in workload['historicalComponents']:
    verify(x['stdout'])
    raw = (ROOT / x['stdout']['path']).read_text()
    durations = re.findall(r'^# duration_ms ([0-9.]+)$', raw, re.M)
    assert durations and float(durations[-1]) == x['nodeDurationMs'], x['job']
    if 93 <= x['turn'] <= 96:
        body_totals += x['nodeDurationMs']
assert abs(body_totals - 516913.760417) < 1e-7
for x in read(PREFIX + '/missing-planned-gates.json'):
    assert x['exitCode'] == 1 and x['elapsedMs'] < 5000
    for s in x['streams']:
        verify(s)
resource_tasks = read(PREFIX + '/task-resource-allocation.json')
assert len(resource_tasks) == 62
for t in resource_tasks:
 for check in t['checks']:
  if any(check[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent']):
   assert check['missingOutputOwner'] in tasks,(t['id'],check)
assert next(t for t in resource_tasks if t['id']=='f05-14')['checks'][1]['missingOutputOwner']=='f05-14-harness'
assert next(t for t in resource_tasks if t['id']=='f05-14-harness')['maxProvisionedPGContainers']==5
assert all(t['checks'] for t in resource_tasks)
doc = (ROOT / REPORT).read_text()
for link in re.findall(r'\]\(([^)]+)\)', doc):
    if bootstrap and link in ['readiness-turn102/audit-result.json','readiness-turn102/submission-binding.json']: continue
    assert ((ROOT / REPORT).parent / link).resolve().exists(), link
assert all('X' + str(n).zfill(2) in doc for n in range(1,10))
assert 'remaining-turn/hour and deficit tests not applicable' in doc
assert 'Unqualified feasibility' in doc
# Independently verify the exact revised H prerequisites and unchanged existing checks.
previous=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/controller-before.json')
previousTasks={t['id']:t for t in previous['tasks']}
for id,t in tasks.items():
 if id in previousTasks:
  assert t['checks']==previousTasks[id]['checks'],('Existing check changed',id)
  for key in ['status','attempts','notes','summary']:assert t[key]==previousTasks[id][key]
h=tasks['f05-14-harness']
assert set(h['depends_on'])=={'f05-10','f05-11','f05-12','f05-13','f05-15-evidence','f05-14-copies'}
assert 'f05-14-harness' in tasks['f05-14']['depends_on']
assert [(x['run'],x['timeout']) for x in h['checks']]==[('node g1-storage/scripts/check-slice.mjs delivery-audit',900),('node g1-storage/scripts/check-slice.mjs harness',900)]
assert 'budget 30 minutes. Terminal integration only' in tasks['f05-14']['detail']
assert not (ROOT/'g1-storage/tests/harness.test.ts').exists()
required=read('g1-storage/verification/required-variants-v1.json')['cases']
assert [len(required[k]) for k in ['H01','H02','H03','H04']]==[6,12,13,8]
assert sum(len(required[k]) for k in ['D01','D02','D03','D04','D05','D06'])==31
for t in allocation['pendingTasks']:
 assert t['checks']==tasks[t['id']]['checks'] and t['depends_on']==tasks[t['id']]['depends_on']
barrier=next(x for x in es if x['measurement']=='five-concurrent-sql-barrier')
assert barrier['connectedBeforeDispatch']==5 and barrier['actualConcurrentQueries']
assert 250<=barrier['returnedAt']-barrier['issuedAt']<2000
assert [x['slot'] for x in concurrent['ready']]==['O','I','A','B','C']
assert len({x['containerId'] for x in concurrent['ready']})==5
assert len({x['owner'] for x in concurrent['ready']})==5
assert len({x['instance'] for x in concurrent['ready']})==5
assert len({x['rootId'] for x in concurrent['ready']})==5
assert all(x['loopback'] and x['noBindMount'] and x['backendPid']>0 for x in concurrent['ready'])
cleanup=[x for x in es if x['measurement']=='resource-envelope-LIFO-cleanup']
assert [x['slot'] for x in cleanup]==['C','B','A','I','O']
assert all(not Path(x['root']).exists() for x in cleanup)
assert read(PREFIX+'/workload-binding.json')['fullHarnessOwner']=='f05-14-harness'
assert read(PREFIX+'/workload-binding.json')['maxNestedContainers']==5
assert goal['acceptance']==read('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/goal-before.json')['acceptance']
assert 'f05-14-harness' in doc and 'five-container' in doc
# Original raw logs and prior stage artifacts stay immutable, even though a current
# resources report legitimately supersedes the definition-only readiness rebind.
submissionPath=BASE/'submission-binding.json'
if submissionPath.exists():
 submission=read(PREFIX+'/submission-binding.json')
 def exact(binding):
  target=ROOT/binding['path'];raw=target.read_bytes()
  assert len(raw)==binding['bytes'] and hashlib.sha256(raw).hexdigest()==binding['sha256'],target
 for binding in submission['files']:exact(binding)
 exact(submission['readiness'])
result = {'ok':True,'tasks':62,'checks':99,'requirements':96,'done':42,'pending':20,
          'acyclic':True,'uncovered':[],'existingChecksUnchanged':97,'teamLimit':4,'delegatedSeats':0,
          'unchangedInputs':len(preservation),'acceptedFiles':2581,'storageFiles':1100,
          'historicalReadinessByteIdentical':True,'controllerPrerequisiteChecks':3,
          'controllerJob':'job-f11187f2a7','resourceProbes':11,'fiveContainerEnvelopeReady':True,
          'LIFOCleanup':['C','B','A','I','O'],'fullHarnessOwner':'f05-14-harness',
          'globalTurnHourLimits':None,'workEstimateMinutes':1625,'pipelineEstimateMinutes':690,
          'aggregateQualified':False,'fullHarnessQualified':False,'productionChanges':False,
          'qualification':'Local resources ready for independent plan review; full workload/acceptance/external gates pending'}
output = BASE / 'audit-result.json'
if output.exists():
 assert json.loads(output.read_text()) == result
else:
 output.write_text(json.dumps(result,indent=2) + '\n')
print(json.dumps(result))
