import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path.cwd()
base = root / 'docs/loop/agent-fabric-g1-f05-storage'
out = base / 'readiness-turn42'
store = root / '.loop/goals/agent-fabric-g1-f05-storage'
def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_text())
def write(name, value):
    with (out / name).open('x') as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
        f.write('\n')

goal = read(store / 'goal.json')
state = read(store / 'state.json')
old = read(base / 'readiness-turn40/history-before.json')
previous = read(base / 'readiness-turn41/history-after-answer.json')
assert state['iteration'] == 42
assert state.get('iteration_base', 0) == old['iterationBase'] == 0
assert state['started_at'] == old['startedAt'] == previous['startedAt']
assert sha((store / 'goal.json').read_bytes()) == old['goalSha256']
question = next(q for q in state['questions'] if q['id'] == 'q-3336b91016')
assert question == read(base / 'readiness-turn41/approval-record.json')
assert question['approved'] and question['answer'] == 'approve'
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/super/Documents/ai/loop-engineering-code')
from loop_engineering.model import contract_digest, goal as normalize_goal
assert state['approved_digest'] == contract_digest(goal)
assert goal['policy']['max_iterations'] == 60 and goal['policy']['max_hours'] == 24
update = read(out / 'approved-goal-update.json')
candidate = normalize_goal({**goal, **update})
assert {k for k in goal if goal[k] != candidate[k]} == {'policy'}
assert {k for k in goal['policy'] if goal['policy'][k] != candidate['policy'][k]} == {'max_iterations', 'max_hours'}
assert candidate['policy']['max_iterations'] == 120 and candidate['policy']['max_hours'] == 144

actual = {t['id']: t for t in state['tasks']}
plan = read(root / 'docs/planning/g1-f05-task-plan-v2.json')['tasks']
seen = set()
for t in plan:
    assert t['id'] not in seen and all(d in seen for d in t['depends_on'])
    seen.add(t['id'])
    for k, v in t.items():
        if k == 'checks': v = [dict(c, cwd=c.get('cwd', '.'), expect_exit=0) for c in v]
        assert actual[t['id']][k] == v, (t['id'], k)
assert seen == set(actual)
assert {r['id'] for r in state['requirements']} == {r for t in plan for r in t['covers']}
assert all(t['team'] == [] for t in plan)
for t in old['tasks']:
    assert t == {k: actual[t['id']].get(k, []) if k == 'notes' else actual[t['id']].get(k) for k in t}
for checkpoint in [old, previous]:
    for k, v in checkpoint['usage'].items():
        if isinstance(v, (int, float)) and not isinstance(v, bool): assert state['usage'][k] >= v
    assert sha((store / 'events.jsonl').read_bytes()[:checkpoint['eventsBytes']]) == checkpoint['eventsSha256']
raw = (store / 'events.jsonl').read_bytes()
events = [json.loads(line) for line in raw.splitlines()]
unblock = next(e for e in events if e['seq'] == 735)
assert unblock['type'] == 'goal.unblocked' and unblock['data']['by'] == 'human (telegram)'
write('history-audit.json', {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'iteration': state['iteration'], 'iterationBase': state.get('iteration_base', 0),
    'startedAt': state['started_at'], 'usage': state['usage'],
    'eventsBytes': len(raw), 'eventsSha256': sha(raw), 'eventsHead': events[-1],
    'turn40And41PrefixesByteIdentical': True, 'all55TaskHistoriesUnchanged': True,
    'usageMonotonic': True, 'policyUnchanged': True, 'approvalRecordUnchanged': True,
    'unblockEvent': unblock, 'repairRoundsNow': state['repair_rounds'],
    'stagnantTurnsNow': state['stagnant_turns'],
    'unblockDoesNotApplyPolicy': True,
    'unblockResetsRepairAndStagnationByInstalledImplementation': True,
    'approvedDeltaNormalizedWithoutOtherContractChanges': True,
    'approvedContractDigestNow': state['approved_digest'],
    'proposedContractDigest': contract_digest(candidate)})

inputs = read(base / 'readiness-turn38/inputs.json')
for path, expected in inputs.items(): assert sha((root / path).read_bytes()) == expected, path
streams = read(base / 'readiness-turn38/controller-results.json')['streams']
for stream in streams:
    data = (root / stream['path']).read_bytes()
    assert len(data) == stream['bytes'] and sha(data) == stream['sha256']
protected = read(root / 'g1-storage/verification/preserved-inputs.json')['files']
for path, expected in protected.items(): assert sha((root / path).read_bytes()) == expected, path
write('preservation-audit.json', {
    'inputHashesVerified': inputs, 'controllerStreamsVerified': streams,
    'protectedInputsUnchanged': len(protected), 'tasks': len(plan),
    'checks': sum(len(t['checks']) for t in plan), 'requirements': len(state['requirements']),
    'teamsEmpty': True, 'effectiveTeamLimit': goal['agent'].get('team_limit', 4),
    'priorReadinessSha256': sha((out / 'readiness-turn41-preserved.md').read_bytes()),
    'planAuthoredFieldsExactMatch': True, 'observationOnly': True, 'stageSubmitted': False})

budgets = {}
for line in (root / 'docs/planning/g1-f05-plan.md').read_text().splitlines():
    match = re.match(r'\| (f05-[\w-]+) \| [^|]+ \| [^|]+ \| (\d+)m \|', line)
    if match: budgets[match[1]] = int(match[2])
unfinished = [t for t in state['tasks'] if t['status'] in {'pending', 'active', 'blocked'}]
assert len(unfinished) == 52 and set(budgets) == {t['id'] for t in unfinished}
assert sum(budgets.values()) == 3705
pipeline = read(base / 'readiness-turn41/capacity-audit.json')['authorizedNotApplied']['pipelineStages']
assert len(pipeline) == 7
elapsed = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(state['started_at'])).total_seconds() / 3600
future = 61.75 + 14 + 38 + 3
write('capacity-audit.json', {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'finding': 'RESOURCE39-01', 'status': 'approved_not_applied',
    'iteration': 42, 'maxIterations': 60, 'remainingTurns': 18,
    'remainingWorkTasks': 52, 'minimumWorkTurnDeficit': 34,
    'taskBudgetMinutes': 3705, 'taskBudgetsMinutes': budgets,
    'tasks': dict(collections.Counter(t['status'] for t in state['tasks'])),
    'maxHours': 24, 'elapsedWallHours': elapsed, 'remainingWallHours': 24 - elapsed,
    'authorizedNotApplied': {'maxIterations': 120, 'maxHours': 144,
        'remainingTurns': 78, 'workTurns': 52, 'pipelineOverheadTurns': 7,
        'pipelineStages': pipeline, 'repairReserveTurns': 19, 'allocatedTurns': 78,
        'turn42ConsumesOneRepairReserveSlot': True,
        'pipelineHoursAtTurnCeiling': 14, 'repairHoursAtTurnCeiling': 38,
        'controllerCheckReserveHours': 3, 'futureEstimatedHours': future,
        'totalEstimatedWallHours': elapsed + future, 'wallHeadroomHours': 144 - elapsed - future},
    'accountingResetAllowed': False, 'stageSubmitted': False})
print(json.dumps({'protected': len(protected), 'checks': 76, 'unfinished': 52,
                  'actualTurns': 18, 'authorizedTurns': 78, 'elapsedHours': elapsed,
                  'proposedTotalHours': elapsed + future, 'policyApplied': False}))
