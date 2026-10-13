"""Bind the exact v5 plan, capacity and fresh controller prerequisite receipts."""
import json
import subprocess
from datetime import datetime, timezone
from capture import BASE, ROOT, PREFIX, read, write, binding

state = read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal = read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
plan = read('docs/planning/g1-f05-task-plan-v5.json')
author = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn88/readiness-capacity-supplement.json')
write('controller-observed.json', state)
write('goal-observed.json', goal)
pending = [t for t in state['tasks'] if t['status'] != 'done']
budgets = author['taskBudgetsMinutes']
assert set(budgets) == {t['id'] for t in pending} and sum(budgets.values()) == 1675
future_pipeline = author['pipelineStages'][1:]
future_turns = goal['policy']['max_iterations'] - state['iteration']
reserve = future_turns - len(pending) - len(future_pipeline)
now = datetime.now(timezone.utc)
elapsed = (now - datetime.fromisoformat(state['started_at'])).total_seconds() / 3600
estimate = elapsed + sum(budgets.values()) / 60 + len(future_pipeline) * 2 + reserve * 2 + 3
assert future_turns == 31 and reserve == 1 and estimate < 144
write('capacity-binding.json', {
    'observedAt': now.isoformat(), 'iteration': state['iteration'],
    'amendedPlan': binding('docs/planning/g1-f05-task-plan-v5.json'),
    'repairCases': author['repairCases'], 'aggregateSchedule': author['aggregateSchedule'],
    'specification': author['specification'],
    'authorAllocation': binding('docs/loop/agent-fabric-g1-f05-storage/plan-turn88/readiness-capacity-supplement.json'),
    'controllerSnapshot': binding(PREFIX + '/controller-observed.json'),
    'goalSnapshot': binding(PREFIX + '/goal-observed.json'),
    'approvedPolicy': goal['policy'], 'approvedDigest': state['approved_digest'],
    'originalStart': state['started_at'], 'accountingReset': False,
    'taskCount': 59, 'checkCount': 89, 'requirementsCount': 96, 'done': 36, 'pending': 23,
    'remainingTurnsAfterThisStage': future_turns, 'workTurns': len(pending),
    'futurePipelineTurns': len(future_pipeline), 'futurePipelineStages': future_pipeline,
    'repairReserveTurns': reserve, 'taskBudgetsMinutes': budgets, 'workMinutes': 1675,
    'repairBudgetBreakdownMinutes': author['repairBudgetBreakdownMinutes'],
    'elapsedWallHours': elapsed, 'futurePipelineReserveHours': len(future_pipeline) * 2,
    'repairReserveHours': reserve * 2, 'controllerCheckReserveHours': 3,
    'estimatedTotalHours': estimate, 'headroomHours': 144 - estimate,
    'teamLimit': goal['agent'].get('team_limit', 4), 'maximumDelegatedSeats': max(len(t['team']) for t in plan['tasks']),
    'teamLimitSource': binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),
    'turnCeilingMinutes': goal['policy']['turn_timeout_minutes'], 'newExternalResources': [],
    'qualification': 'Exact v5 resource/capacity estimates, not product or repaired workload qualification; independent review next.'
})

job = 'job-687eae6759'
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
        copy = PREFIX + '/qualified-raw/' + job + '/' + check_id + '/' + channel + '.log'
        (ROOT / copy).parent.mkdir(parents=True, exist_ok=True)
        assert not (ROOT / copy).exists(), 'Never overwrite a stream copy'
        (ROOT / copy).write_bytes(raw)
        streams.append({'original': binding(path), 'copy': binding(copy)})
        for line in raw.decode().splitlines():
            try:
                parsed = json.loads(line)
                if isinstance(parsed, dict) and 'measurement' in parsed:
                    measurements.append(parsed)
            except json.JSONDecodeError:
                pass
    results[check_id] = {'definition': definition, 'result': {k: v for k, v in result.items() if k != 'tail'},
                         'streams': streams, 'measurements': measurements, 'fullStreamsRead': True}
write('controller-results.json', {'jobId': job, 'scope': 'prerequisite resource observations only; no repair/task/F05 acceptance', 'checks': results})

js = '''import {components,suites} from './g1-storage/scripts/manifest.mjs';
import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/planning/g1-f05-task-plan-v5.json'));
console.log(JSON.stringify(plan.tasks.map(t=>({...t,resources:['pinned toolchain/offline store','cached owned PG/local IdP','built-in crypto/fs/http/process','controller census/GUI/evidence'],checks:t.checks.map(c=>{const m=c.run.match(/check-(component|slice)\\.mjs ([a-z0-9-]+)/);const r=m?(m[1]==='component'?components:suites):null;const script=c.run.match(/^node ([^ ]+)/)?.[1];return {...c,scriptExists:script?existsSync(script):null,registryPresent:m?Object.hasOwn(r,m[2]):null,sourceFilePresent:m&&r[m[2]]?existsSync('g1-storage/tests/'+r[m[2]].file.replace(/\\.js$/,'.ts')):null};})}))))'''
allocation = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT))
statuses = {t['id']: t['status'] for t in state['tasks']}
for t in allocation:
    t['status'] = statuses[t['id']]
    t['budgetMinutes'] = budgets.get(t['id'])
    t['missingOutputOwner'] = t['id']
write('task-resource-allocation.json', allocation)
inputs = {b['path'] for b in read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/inputs.json')}
inputs.update(['docs/planning/g1-f05-task-plan-v5.json', 'docs/planning/g1-f05-atomic-disconnect-v2.md',
               'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/aggregate-schedule.json',
               'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/repair-cases.json',
               'g1-storage/scripts/suite-execution.mjs', 'g1-storage/tests/commit-conflict.test.ts'])
write('inputs.json', [binding(p) for p in sorted(inputs)])
print(json.dumps({'remainingTurns': future_turns, 'workTurns': 23, 'pipelineTurns': 7, 'reserveTurns': 1,
                  'workMinutes': 1675, 'estimatedTotalHours': estimate, 'headroomHours': 144-estimate,
                  'controllerChecks': {k: v['result']['status'] for k, v in results.items()},
                  'missingOutputTasks': [t['id'] for t in allocation if any(c['scriptExists'] is False or c['registryPresent'] is False or c['sourceFilePresent'] is False for c in t['checks'])]}))
