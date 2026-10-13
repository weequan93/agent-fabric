"""Bind fresh resource observations to the unchanged exact v4 controller plan."""
import importlib.util
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
spec = importlib.util.spec_from_file_location('capture', BASE / 'capture.py')
cap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cap)
read = lambda path: json.loads((ROOT / path).read_text())
prefix = str(BASE.relative_to(ROOT))
state = read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal = read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
plan = read('docs/planning/g1-f05-task-plan-v4.json')
old = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/readiness-capacity-supplement.json')
cap.write('controller-observed.json', state)
cap.write('goal-observed.json', goal)
now = datetime.now(timezone.utc)
pending = [t for t in state['tasks'] if t['status'] != 'done']
budgets = old['taskBudgetsMinutes']
assert set(budgets) == {t['id'] for t in pending} and sum(budgets.values()) == 1655
future_pipeline = old['pipelineStages'][1:]
future_turns = goal['policy']['max_iterations'] - state['iteration']
reserve = future_turns - len(pending) - len(future_pipeline)
elapsed = (now - datetime.fromisoformat(state['started_at'])).total_seconds()/3600
estimated = elapsed + sum(budgets.values())/60 + len(future_pipeline)*2 + reserve*2 + 3
assert future_turns == 34 and reserve == 4 and estimated < 144
cap.write('capacity-binding.json', {
    'observedAt': now.isoformat(), 'iteration': state['iteration'],
    'amendedPlan': cap.binding('docs/planning/g1-f05-task-plan-v4.json'),
    'repairCases': cap.binding('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/repair-cases.json'),
    'specification': cap.binding('docs/planning/g1-f05-atomic-disconnect-v1.md'),
    'authorAllocation': cap.binding('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/readiness-capacity-supplement.json'),
    'controllerSnapshot': cap.binding(prefix + '/controller-observed.json'),
    'goalSnapshot': cap.binding(prefix + '/goal-observed.json'),
    'approvedPolicy': goal['policy'], 'approvedDigest': state['approved_digest'],
    'originalStart': state['started_at'], 'taskCount': 59, 'checkCount': 87,
    'requirementsCount': 96, 'done': 36, 'pending': 23,
    'remainingTurnsAfterThisStage': future_turns, 'workTurns': 23,
    'futurePipelineTurns': len(future_pipeline), 'futurePipelineStages': future_pipeline,
    'repairReserveTurns': reserve, 'taskBudgetsMinutes': budgets, 'workMinutes': 1655,
    'repairBudgetBreakdownMinutes': old['repairBudgetBreakdownMinutes'],
    'elapsedWallHours': elapsed, 'futurePipelineReserveHours': len(future_pipeline)*2,
    'repairReserveHours': reserve*2, 'controllerCheckReserveHours': 3,
    'estimatedTotalHours': estimated, 'headroomHours': 144-estimated,
    'teamLimit': goal['agent'].get('team_limit',4), 'maximumDelegatedSeats': max(len(t['team']) for t in plan['tasks']),
    'teamLimitSource': cap.binding('/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py'),
    'turnCeilingMinutes': 120, 'newExternalResources': [], 'accountingReset': False,
    'qualification': 'Current resource/capacity assessment; estimates, not guarantees. Resources slot consumed; independent plan review next.'
})

job = 'job-3fb7aa9ba1'
ids = ['f05-01.strict-build','f05-04.source-content-component','acceptance.retained-baselines']
results = {}
for check_id in ids:
    result = state['checks'][check_id]
    assert result['status']=='pass' and result['exit_code']==0 and job in result['log']
    task_id, check_name = check_id.split('.',1)
    definitions = goal['acceptance'] if task_id=='acceptance' else next(t for t in plan['tasks'] if t['id']==task_id)['checks']
    definition = next(c for c in definitions if c['id']==check_name)
    streams = []
    full = ''
    for channel in ['stdout','stderr']:
        path = result['log']+'/'+channel+'.log'
        raw = (ROOT/path).read_bytes()
        copy = prefix+'/qualified-raw/'+job+'/'+check_id+'/'+channel+'.log'
        (ROOT/copy).parent.mkdir(parents=True,exist_ok=True)
        if (ROOT/copy).exists():
            assert (ROOT/copy).read_bytes()==raw
        else:
            (ROOT/copy).write_bytes(raw)
        streams.append({'original':cap.binding(path),'copy':cap.binding(copy)})
        full += raw.decode()
    measurements = []
    for line in full.splitlines():
        try:
            parsed=json.loads(line)
            if isinstance(parsed,dict) and 'measurement' in parsed:
                measurements.append(parsed)
        except json.JSONDecodeError:
            pass
    results[check_id]={'definition':definition,'result':{k:v for k,v in result.items() if k!='tail'},
                      'streams':streams,'measurements':measurements,'fullStreamsRead':True}
cap.write('controller-results.json', {'jobId':job,'scope':'prerequisite resource observations; no task completion or F05 acceptance', 'checks':results})

js = '''import {components,suites} from './g1-storage/scripts/manifest.mjs';
import {readFileSync,existsSync} from 'node:fs';
const plan=JSON.parse(readFileSync('docs/planning/g1-f05-task-plan-v4.json'));
console.log(JSON.stringify(plan.tasks.map(t=>({...t,resources:['pinned toolchain/offline store','cached owned PG/local IdP','built-in crypto/fs/http/process','controller census/GUI/evidence'],checks:t.checks.map(c=>{const m=c.run.match(/check-(component|slice)\\.mjs ([a-z0-9-]+)/);const r=m?(m[1]==='component'?components:suites):null;const script=c.run.match(/^node ([^ ]+)/)?.[1];return {...c,scriptExists:script?existsSync(script):null,registryPresent:m?Object.hasOwn(r,m[2]):null,sourceFilePresent:m&&r[m[2]]?existsSync('g1-storage/tests/'+r[m[2]].file.replace(/\\.js$/,'.ts')):null};})}))))'''
allocation = json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT))
statuses = {t['id']:t['status'] for t in state['tasks']}
for t in allocation:
    t['status']=statuses[t['id']]
    t['budgetMinutes']=budgets.get(t['id'])
    t['missingOutputOwner']=t['id']
cap.write('task-resource-allocation.json', allocation)
inputs = [
    'docs/planning/roadmap.md','docs/planning/g1-foundations-plan.md','docs/planning/g1-remaining-ledger.csv',
    'docs/Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md','docs/evidence/g1-f02-acceptance.md',
    'docs/loop/agent-fabric-g1-f05-storage/product-brief.md','docs/loop/agent-fabric-g1-f05-storage/solution.md',
    'docs/loop/agent-fabric-g1-f05-storage/test-plan.md','docs/planning/g1-f05-plan.md',
    'g1-identity/scripts/check.mjs','g1-storage/scripts/build.mjs','g1-storage/scripts/check.mjs',
    'g1-storage/scripts/runner.mjs','g1-storage/scripts/manifest.mjs','g1-storage/scripts/fixture.mjs',
    'g1-storage/scripts/candidate.mjs','g1-storage/scripts/paths.mjs','g1-storage/pnpm-lock.yaml',
    'g1-storage/tests/helpers/atomic-verification-fixture.ts','g1-storage/tests/helpers/atomic-command-worker.ts',
    'g1-storage/tests/helpers/register-atomic-verification-tests.ts',
    'docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/container-envelope.mjs'
]
cap.write('inputs.json',[cap.binding(p) for p in inputs])
print(json.dumps({'remainingTurns':future_turns,'workTurns':23,'pipelineTurns':7,'reserveTurns':4,
                  'workMinutes':1655,'estimatedTotalHours':estimated,'headroomHours':144-estimated,
                  'controllerChecks':{k:v['result']['status'] for k,v in results.items()},
                  'missingOutputTasks':[t['id'] for t in allocation if any(c['scriptExists'] is False or c['registryPresent'] is False or c['sourceFilePresent'] is False for c in t['checks'])]}))
