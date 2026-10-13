import collections
import copy
import datetime
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path.cwd()
base = root / 'docs/loop/agent-fabric-g1-f05-storage'
out = base / 'readiness-turn43'
store = root / '.loop/goals/agent-fabric-g1-f05-storage'
def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads(path.read_text())
def write(name, value):
    with (out / name).open('x') as f:
        json.dump(value, f, indent=2, ensure_ascii=False)
        f.write('\n')

sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/super/Documents/ai/loop-engineering-code')
from loop_engineering.model import contract_digest, goal as normalize_goal
goal = read(store / 'goal.json')
state = read(store / 'state.json')
old = read(base / 'readiness-turn40/history-before.json')
checkpoints = [old, read(base / 'readiness-turn41/history-after-answer.json'),
               read(base / 'readiness-turn42/history-audit.json')]
assert state['iteration'] == 43
assert state.get('iteration_base', 0) == old['iterationBase'] == 0
assert state['started_at'] == old['startedAt']
assert goal['policy']['max_iterations'] == 120 and goal['policy']['max_hours'] == 144
prior_goal = copy.deepcopy(goal)
prior_goal['policy'].update(max_iterations=60, max_hours=24.0)
prior_digest = read(base / 'readiness-turn42/history-audit.json')['approvedContractDigestNow']
assert contract_digest(prior_goal) == prior_digest
expected = normalize_goal({**prior_goal, **read(base / 'readiness-turn42/approved-goal-update.json')})
assert goal == expected
assert state['approved_digest'] == contract_digest(goal)
assert state['approved_contract'] == {k: goal[k] for k in state['approved_contract']}
question = next(q for q in state['questions'] if q['id'] == 'q-3336b91016')
assert question == read(base / 'readiness-turn41/approval-record.json')
assert question['approved'] and question['answer'] == 'approve'

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
raw = (store / 'events.jsonl').read_bytes()
for checkpoint in checkpoints:
    assert state['started_at'] == checkpoint['startedAt']
    for k, v in checkpoint['usage'].items():
        if isinstance(v, (int, float)) and not isinstance(v, bool): assert state['usage'][k] >= v
    assert sha(raw[:checkpoint['eventsBytes']]) == checkpoint['eventsSha256']
events = [json.loads(line) for line in raw.splitlines()]
approval = next(e for e in events if e['seq'] == 742)
assert approval['type'] == 'goal.approved'
assert approval['data']['by'] == 'human (telegram approval q-3336b91016)'
assert approval['data']['digest'] == state['approved_digest']
assert next(e for e in events if e['seq'] == 741)['type'] == 'contract.snapshot'
write('history-audit.json', {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'iteration': 43, 'iterationBase': state.get('iteration_base', 0),
    'startedAt': state['started_at'], 'usage': state['usage'],
    'eventsBytes': len(raw), 'eventsSha256': sha(raw), 'eventsHead': events[-1],
    'turn40And41And42PrefixesByteIdentical': True, 'all55TaskHistoriesUnchanged': True,
    'usageMonotonic': True, 'approvalRecordUnchanged': True,
    'policyApplied': True, 'onlyContractChanges': ['policy.max_iterations:60->120', 'policy.max_hours:24->144'],
    'priorContractDigest': prior_digest, 'approvedContractDigestNow': state['approved_digest'],
    'approvedContractSnapshotExact': True, 'humanApprovalEvent': approval,
    'repairRoundsNow': state['repair_rounds'], 'stagnantTurnsNow': state['stagnant_turns'],
    'accountingResetAllowed': False})

inputs = read(base / 'readiness-turn38/inputs.json')
for path, expected in inputs.items(): assert sha((root / path).read_bytes()) == expected, path
streams = read(base / 'readiness-turn38/controller-results.json')['streams']
for stream in streams:
    data = (root / stream['path']).read_bytes()
    assert len(data) == stream['bytes'] and sha(data) == stream['sha256']
protected = read(root / 'g1-storage/verification/preserved-inputs.json')['files']
for path, expected in protected.items(): assert sha((root / path).read_bytes()) == expected, path
prior_files = read(out / 'prior-resource-files.json')
for path, expected in prior_files.items(): assert sha((root / path).read_bytes()) == expected, path
write('preservation-audit.json', {
    'inputHashesVerified': inputs, 'controllerStreamsVerified': streams,
    'protectedInputsUnchanged': len(protected), 'priorResourceFilesVerified': len(prior_files),
    'tasks': len(plan), 'checks': sum(len(t['checks']) for t in plan), 'requirements': len(state['requirements']),
    'teamsEmpty': True, 'effectiveTeamLimit': goal['agent'].get('team_limit', 4),
    'priorReadinessSha256': sha((out / 'readiness-turn42-preserved.md').read_bytes()),
    'planAuthoredFieldsExactMatch': True, 'resourceOnly': True})

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
remaining = goal['policy']['max_iterations'] - state['iteration']
repair = remaining - len(unfinished) - len(pipeline)
assert remaining == 77 and repair == 18
future = sum(budgets.values()) / 60 + len(pipeline) * 2 + repair * 2 + 3
assert elapsed + future < goal['policy']['max_hours']
write('capacity-audit.json', {
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'finding': 'RESOURCE39-01', 'status': 'applied_and_feasible_for_independent_review',
    'iteration': 43, 'maxIterations': 120, 'remainingTurns': remaining,
    'workTurns': 52, 'pipelineOverheadTurns': 7, 'pipelineStages': pipeline,
    'repairReserveTurns': repair, 'allocatedTurns': 52 + 7 + repair,
    'turn42And43ConsumeTwoPriorRepairReserveSlots': True,
    'taskBudgetMinutes': 3705, 'taskBudgetHours': 61.75, 'taskBudgetsMinutes': budgets,
    'tasks': dict(collections.Counter(t['status'] for t in state['tasks'])),
    'maxHours': 144, 'elapsedWallHours': elapsed, 'remainingWallHours': 144 - elapsed,
    'pipelineHoursAtTurnCeiling': 14, 'repairHoursAtTurnCeiling': 36,
    'controllerCheckReserveHours': 3, 'futureEstimatedHours': future,
    'totalEstimatedWallHours': elapsed + future, 'wallHeadroomHours': 144 - elapsed - future,
    'accountingResetAllowed': False, 'estimateNotCompletionGuarantee': True,
    'exhaustionOwner': 'controller / authorized human; retain failures and seek scoped capacity before exhaustion'})
print(json.dumps({'protected': len(protected), 'priorFiles': len(prior_files), 'checks': 76,
                  'unfinished': 52, 'futureTurns': remaining, 'repairReserve': repair,
                  'elapsedHours': elapsed, 'estimatedTotalHours': elapsed + future, 'policyApplied': True}))
