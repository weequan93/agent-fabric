"""Bind resources to exact current task/check/input definitions and full raw receipts."""
import json
import subprocess
from datetime import datetime, timezone
from capture import BASE, ROOT, PREFIX, binding, read, write

state = read(PREFIX + '/controller-observed.json') if (BASE / 'controller-observed.json').exists() else read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal = read(PREFIX + '/goal-observed.json') if (BASE / 'goal-observed.json').exists() else read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
def retain(name, value):
    if (BASE / name).exists():
        assert read(PREFIX + '/' + name) == value, name
    else:
        write(name, value)
plan_path = 'docs/loop/agent-fabric-g1-f05-storage/plan-turn101/current-plan.json'
plan = read(plan_path)
allocation = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/resource-allocation.json')
retain('controller-observed.json', state)
retain('goal-observed.json', goal)
fields = ['id', 'title', 'detail', 'covers', 'depends_on', 'role', 'team', 'checks']
assert plan['tasks'] == [{k: t[k] for k in fields} for t in state['tasks']]
assert plan['requirements'] == state['requirements']
assert state['requirements_final'] and len(plan['requirements']) == 96
assert len(state['tasks']) == 62 and sum(len(t['checks']) for t in state['tasks']) == 99
assert goal['policy'] == allocation['policy']
assert goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None
assert sum(t['status'] == 'done' for t in state['tasks']) == 42
assert sum(t['status'] == 'pending' for t in state['tasks']) == 20
assert all(t['team'] == [] for t in state['tasks'])
assert all(t['engineeringEstimateMinutes'] <= 120 for t in allocation['pendingTasks'])
assert state['started_at'] == allocation['startedAt'] and state['approved_digest'] == allocation['approvedDigest']
assert sum(t['engineeringEstimateMinutes'] for t in allocation['pendingTasks']) == 1625
observed_at = datetime.fromisoformat(read(PREFIX + '/capacity-binding.json')['observedAt']) if (BASE / 'capacity-binding.json').exists() else datetime.now(timezone.utc)
elapsed = (observed_at - datetime.fromisoformat(state['started_at'])).total_seconds() / 3600
pipeline = allocation['pipelineEstimateMinutes']
retain('capacity-binding.json', {
    'version': 'Turn102 exact current readiness', 'observedAt': observed_at.isoformat(),
    'iteration': state['iteration'], 'plan': binding(plan_path),
    'controllerSnapshot': binding(PREFIX + '/controller-observed.json'),
    'goalSnapshot': binding(PREFIX + '/goal-observed.json'),
    'planDocument': binding('docs/planning/g1-f05-plan.md'),
    'historicalReadiness': binding(PREFIX + '/readiness-turn101-preserved.md'),
    'taskCount': 62, 'checkCount': 99, 'requirements': 96, 'done': 42, 'pending': 20,
    'workEstimateMinutes': 1625, 'pipelineEstimateMinutes': pipeline,
    'pipelineTotalMinutes': sum(pipeline.values()),
    'remainingWorkAndPipelineEstimateMinutes': 1625 + sum(pipeline.values()),
    'originalStartedAt': state['started_at'], 'approvedDigest': state['approved_digest'],
    'elapsedWallHours': elapsed, 'usage': state['usage'], 'accountingReset': False,
    'policy': goal['policy'], 'remainingTurns': None, 'remainingHours': None,
    'remainingCapacityCalculation': 'Not applicable: human removed both global limits; no deficit verdict',
    'teamLimit': goal['agent'].get('team_limit', 4), 'maxDelegatedSeats': 0,
    'teamLimitSource': binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),
    'perTurnCeilingMinutes': 120, 'newExternalResources': [],
    'repairReserve': 'No global capacity ceiling; concrete substantive repairs need separate bounded reviewed tasks',
    'qualification': 'Local prerequisite readiness for independent review, not full workload or product acceptance'
})

job = 'job-f11187f2a7'
ids = ['f05-01.strict-build', 'f05-04.source-content-component', 'acceptance.retained-baselines']
results = {}
for check_id in ids:
    result = state['checks'][check_id]
    assert result['status'] == 'pass' and result['exit_code'] == 0 and job in result['log']
    task_id, name = check_id.split('.', 1)
    definitions = goal['acceptance'] if task_id == 'acceptance' else next(t for t in plan['tasks'] if t['id'] == task_id)['checks']
    definition = next(c for c in definitions if c['id'] == name)
    streams, measurements = [], []
    for channel in ['stdout', 'stderr']:
        path = result['log'] + '/' + channel + '.log'
        raw = (ROOT / path).read_bytes()
        copy = PREFIX + '/controller-raw/' + job + '/' + check_id + '/' + channel + '.log'
        target = ROOT / copy
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == raw, 'Never overwrite raw streams'
        else:
            target.write_bytes(raw)
        streams.append({'original': binding(path), 'copy': binding(copy)})
        for line in raw.decode().splitlines():
            try:
                parsed = json.loads(line)
                if isinstance(parsed, dict) and 'measurement' in parsed:
                    measurements.append(parsed)
            except json.JSONDecodeError:
                pass
    results[check_id] = {'definition': definition, 'result': {k:v for k,v in result.items() if k != 'tail'},
                        'streams': streams, 'measurements': measurements, 'fullStreamsRead': True}
source = results['f05-04.source-content-component']['measurements']
report = next(m for m in source if m['measurement'] == 'storage-test-report')
assert len(report['reports']) == 1
r = report['reports'][0]
assert r['tests'] == 12 and len(r['executions']) == 12
assert all(r[k] == 0 for k in ['fail', 'cancelled', 'skipped', 'todo'])
assert all(v == 0 for v in r['observations']['violations'].values())
assert r['observations']['positives']['read'] == 4 and r['observations']['positives']['write'] == 3
candidate = next(m for m in source if m['measurement'] == 'storage-candidate')
assert candidate['digest'] == 'sha256:9045fec758c96f4139dd3751c5c0bb004351935bf65a63aa5a9f5011646ae5f9'
assert candidate['files'] == 1100
retain('controller-results.json', {'jobId': job, 'scope': 'Prerequisite resource checks only; no task or F05 acceptance', 'checks': results})

js = """import {components,suites} from './g1-storage/scripts/manifest.mjs';
import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/current-plan.json'));
console.log(JSON.stringify(plan.tasks.map(t=>({...t,checks:t.checks.map(c=>{const m=c.run.match(/check-(component|slice)\\.mjs ([a-z0-9-]+)/);const r=m?(m[1]==='component'?components:suites):null;const script=c.run.match(/^node ([^ ]+)/)?.[1];return {...c,scriptExists:script?existsSync(script):null,registryPresent:m?Object.hasOwn(r,m[2]):null,sourceFilePresent:m&&r[m[2]]?existsSync('g1-storage/tests/'+r[m[2]].file.replace(/\\.js$/,'.ts')):null};})}))))"""
tasks = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT, timeout=5))
live = {t['id']: t for t in state['tasks']}
budgets = {t['id']:t['engineeringEstimateMinutes'] for t in allocation['pendingTasks']}
for t in tasks:
    t['status'] = live[t['id']]['status']
    t['engineeringEstimateMinutes'] = budgets.get(t['id'])
    t['resources'] = ['Pinned offline Node/pnpm/TS', 'Cached local PG16/IdP and installed owners',
                      'Ephemeral keys/encrypted owned roots', 'Controller census/GUI/complete evidence']
    wrapperOwners = {'harness':'f05-14-harness','owned-encryption':'f05-14-harness',
                     'delivery-audit':'f05-14-harness','atomic-disconnect':'f05-11-atomic-disconnect'}
    componentOwners = {'verify-atomic-disconnect':'f05-11-atomic-disconnect',
        'verify-ask-recall':'f05-12-recall','verify-ask-disclosure':'f05-12-disclosure',
        'verify-ask-routing':'f05-12-routing','verify-restore-current':'f05-13-current',
        'verify-restore-interruption':'f05-13-interruption','verify-restore-integrity':'f05-13-integrity',
        'verify-restore-measurement':'f05-13-measurement','verify-encryption':'f05-14-cipher',
        'verify-retained-copies':'f05-14-copies','delivery-operations':'f05-15-docs',
        'delivery-evidence':'f05-15-evidence'}
    for c in t['checks']:
        m=__import__('re').search(r'check-(component|slice)\.mjs ([a-z0-9-]+)',c['run'])
        missing=any(c[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent'])
        c['missingOutputOwner']=(componentOwners if m and m[1]=='component' else wrapperOwners).get(m[2],t['id']) if m and missing else ('f05-15-evidence' if missing and 'check-evidence.mjs' in c['run'] else None)
    t['maxProvisionedPGContainers']=5 if t['id'] in ['f05-14-harness','f05-14','f05-15-schedule','f05-15'] else 4
    t['missingOutputOwner']='See each missing check output owner; consuming terminal tasks do not first implement missing wrappers' 
retain('task-resource-allocation.json', tasks)
missing = []
for name, argv in [
    ('missing-repeat-component', ['node', 'g1-storage/scripts/check-component.mjs', 'verify-atomic-disconnect']),
    ('missing-repeat-slice', ['node', 'g1-storage/scripts/check-slice.mjs', 'atomic-disconnect'])]:
    from capture import capture
    p = next((v for v in read(PREFIX+'/missing-planned-gates.json') if v['name']==name),None) if (BASE/'missing-planned-gates.json').exists() else None
    if p is None: p = capture(name, argv, 5)
    assert p['exitCode'] == 1
    assert 'Unknown/extra checker argument' in (ROOT / p['streams'][1]['path']).read_text()
    missing.append(p)
retain('missing-planned-gates.json', missing)
write('workload-binding.json', {
    'version': 'Turn102 resource revalidation',
    'workload': binding('docs/loop/agent-fabric-g1-f05-storage/plan-turn98/workload.json'),
    'allocation': binding('docs/loop/agent-fabric-g1-f05-storage/plan-turn101/resource-allocation.json'),
    'candidate': {k:candidate[k] for k in ['digest','files']},
    'currentDefaultCapStillPresent': 'timeout: 240_000' in (ROOT / 'g1-storage/scripts/suite-execution.mjs').read_text(),
    'capRemovalOwner': 'f05-11-suite-execution',
    'componentReceiptsQualifyAggregate': False,
    'fullHarnessOwner': 'f05-14-harness',
    'fullHarnessFeasibility': 'Unqualified; complete real nonrecursive H01-H04 command900s required',
    'maxNestedContainers': 5,
    'fiveContainerProbe': binding(PREFIX+'/envelope-probe.json'),
    'fullAggregateFeasibility': 'Unqualified; complete sequential11-file measurement required by f05-15-schedule',
    'noGlobalCapacityRejection': True
})
print(json.dumps({'ok':True,'tasks':62,'checks':99,'done':42,'pending':20,'candidate':candidate['digest'],
                  'controllerProbes':{k:v['result']['duration_ms'] for k,v in results.items()},
                  'workMinutes':1625,'pipelineMinutes':sum(pipeline.values()),
                  'missingOutputTasks':[t['id'] for t in tasks if any(c['scriptExists'] is False or c['registryPresent'] is False or c['sourceFilePresent'] is False for c in t['checks'])]}))
