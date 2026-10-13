import collections
import datetime
import hashlib
import json
import pathlib
import re

root = pathlib.Path.cwd()
out = root / 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn40'
base = out.parent
def digest(data):
    return hashlib.sha256(data).hexdigest()
def read(path):
    return json.loads((root / path).read_text())
def write(name, value):
    with (out / name).open('x') as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write('\n')

prior = (base / 'readiness.md').read_bytes()
with (out / 'readiness-turn38-preserved.md').open('xb') as handle:
    handle.write(prior)
state_path = '.loop/goals/agent-fabric-g1-f05-storage/state.json'
goal_path = '.loop/goals/agent-fabric-g1-f05-storage/goal.json'
state = read(state_path)
goal = read(goal_path)
plan = read('docs/planning/g1-f05-task-plan-v2.json')
authored = plan['tasks']
actual = {task['id']: task for task in state['tasks']}
seen = set()
for task in authored:
    assert all(dep in seen for dep in task['depends_on'])
    assert task['id'] not in seen
    seen.add(task['id'])
    for key, value in task.items():
        if key == 'checks':
            expected = [dict(check, cwd=check.get('cwd', '.'), expect_exit=0) for check in value]
            assert expected == actual[task['id']][key], (task['id'], key)
        else:
            assert value == actual[task['id']][key], (task['id'], key)
assert seen == set(actual)
requirements = {item['id'] for item in state['requirements']}
assert requirements == {ref for task in authored for ref in task['covers']}
team_limit = goal['agent'].get('team_limit', 4)
assert all(task['team'] == [] for task in authored)
assert all(sum(seat.get('count', 1) for seat in task['team']) <= team_limit for task in authored)
budgets = {}
for line in (root / 'docs/planning/g1-f05-plan.md').read_text().splitlines():
    match = re.match(r'\| (f05-[\w-]+) \| [^|]+ \| [^|]+ \| (\d+)m \|', line)
    if match:
        budgets[match[1]] = int(match[2])
unfinished = [task for task in state['tasks'] if task['status'] in {'pending', 'active', 'blocked'}]
assert set(budgets) == {task['id'] for task in unfinished}
assert len(unfinished) == 52 and state['iteration'] == 40
now = datetime.datetime.now(datetime.timezone.utc)
started = datetime.datetime.fromisoformat(state['started_at'])
elapsed = (now - started).total_seconds() / 3600
minutes = sum(budgets.values())
events_path = root / '.loop/goals/agent-fabric-g1-f05-storage/events.jsonl'
events = events_path.read_bytes()
head = json.loads(events.splitlines()[-1])
write('history-before.json', {
    'observedAt': now.isoformat(), 'goalId': state['goal_id'],
    'iteration': state['iteration'], 'iterationBase': state.get('iteration_base', 0),
    'startedAt': state['started_at'], 'usage': state['usage'],
    'stateSha256': digest((root / state_path).read_bytes()),
    'goalSha256': digest((root / goal_path).read_bytes()),
    'eventsBytes': len(events), 'eventsSha256': digest(events), 'eventsHead': head,
    'tasks': [{'id': task['id'], 'status': task['status'], 'attempts': task.get('attempts'),
               'started_at': task.get('started_at'), 'notes': task.get('notes', [])}
              for task in state['tasks']],
    'readinessTurn38Sha256': digest(prior)
})
write('capacity-audit.json', {
    'observedAt': now.isoformat(), 'finding': 'RESOURCE39-01', 'status': 'unresolved',
    'iteration': state['iteration'], 'maxIterations': goal['policy']['max_iterations'],
    'remainingTurns': goal['policy']['max_iterations'] - state['iteration'],
    'remainingWorkTasks': len(unfinished), 'minimumWorkTurnDeficit': 32,
    'taskBudgetMinutes': minutes, 'taskBudgetHours': minutes / 60,
    'maxHours': goal['policy']['max_hours'], 'startedAt': state['started_at'],
    'elapsedWallHours': elapsed, 'remainingWallHours': goal['policy']['max_hours'] - elapsed,
    'minimumWorkHourDeficit': minutes / 60 - (goal['policy']['max_hours'] - elapsed),
    'taskBudgetsMinutes': budgets, 'tasks': dict(collections.Counter(task['status'] for task in state['tasks'])),
    'controllerPlanAuthoredFieldsExactMatch': True, 'uniqueDependencyOrdered': True,
    'requirements': len(requirements), 'teamsEmpty': True, 'teamLimit': team_limit,
    'checks': sum(len(task['checks']) for task in authored),
    'proposalNotAuthorized': {'maxIterations': 120, 'maxHours': 144,
        'remainingTurns': 80, 'workTurns': 52, 'pipelineOverheadTurns': 8, 'repairReserveTurns': 20,
        'overheadHoursAtTurnCeiling': 16, 'repairHoursAtTurnCeiling': 40,
        'controllerCheckReserveHours': 3,
        'totalEstimatedWallHours': elapsed + minutes / 60 + 16 + 40 + 3,
        'accountingResetAllowed': False},
    'noPolicyChange': True, 'noTaskChange': True,
    'answerAloneChangesPolicy': False, 'stageSubmitted': False
})
inputs = read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn38/inputs.json')
for path, expected in inputs.items():
    assert digest((root / path).read_bytes()) == expected, path
streams = read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn38/controller-results.json')['streams']
for stream in streams:
    data = (root / stream['path']).read_bytes()
    assert len(data) == stream['bytes'] and digest(data) == stream['sha256'], stream['path']
protected = read('g1-storage/verification/preserved-inputs.json')['files']
for path, expected in protected.items():
    assert digest((root / path).read_bytes()) == expected, path
write('preservation-audit.json', {
    'inputHashesVerified': inputs, 'controllerStreamsVerified': streams,
    'protectedInputsUnchanged': len(protected), 'priorReadinessSha256': digest(prior),
    'policyUntouched': True, 'taskPlanUntouched': True,
    'observationOnly': True, 'newProductOrControllerCheck': False
})
print(json.dumps({'capacity': 'unresolved', 'iteration': 40, 'remainingWork': 52,
                  'remainingTurns': 20, 'workMinutes': minutes, 'elapsedWallHours': elapsed,
                  'planChecks': sum(len(task['checks']) for task in authored),
                  'protectedUnchanged': len(protected), 'priorReadinessSha256': digest(prior)}))
