import collections, datetime, hashlib, json, pathlib, re
root = pathlib.Path.cwd()
base = root / 'docs/loop/agent-fabric-g1-f05-storage'
out = base / 'readiness-turn41'
def sha(data): return hashlib.sha256(data).hexdigest()
def read(path): return json.loads((root / path).read_text())
def write(name, value):
    target = out / name
    if target.exists():
        assert json.loads(target.read_text()) == value, name
        return
    with target.open('x') as f:
        json.dump(value, f, indent=2, ensure_ascii=False); f.write('\n')
prior = (base / 'readiness.md').read_bytes()
preserved = out / 'readiness-turn40-preserved.md'
if preserved.exists(): assert preserved.read_bytes() == prior
else:
    with preserved.open('xb') as f: f.write(prior)
goal = read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
state = read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
checkpoint = read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn40/history-before.json')
question = next(q for q in state['questions'] if q['id'] == 'q-3336b91016')
assert question['approved'] is True and question['answer'] == 'approve'
write('approval-record.json', question)
plan = read('docs/planning/g1-f05-task-plan-v2.json')['tasks']
actual = {t['id']: t for t in state['tasks']}
seen = set()
for t in plan:
    assert t['id'] not in seen and all(d in seen for d in t['depends_on'])
    seen.add(t['id'])
    for k,v in t.items():
        if k == 'checks': v = [dict(c, cwd=c.get('cwd','.'), expect_exit=0) for c in v]
        assert v == actual[t['id']][k], (t['id'],k)
assert seen == set(actual)
assert {r['id'] for r in state['requirements']} == {r for t in plan for r in t['covers']}
assert all(t['team'] == [] for t in plan)
assert state['iteration'] == 41 and state.get('iteration_base', 0) == checkpoint['iterationBase'] == 0
assert state['started_at'] == checkpoint['startedAt']
for t in checkpoint['tasks']:
    assert t == {k: actual[t['id']].get(k, []) if k == 'notes' else actual[t['id']].get(k) for k in t}
for k,v in checkpoint['usage'].items():
    if isinstance(v,(int,float)) and not isinstance(v,bool): assert state['usage'][k] >= v, k
assert sha((root / '.loop/goals/agent-fabric-g1-f05-storage/goal.json').read_bytes()) == checkpoint['goalSha256']
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, '/Users/super/Documents/ai/loop-engineering-code')
from loop_engineering.model import contract_digest
assert state['approved_digest'] == contract_digest(goal)
assert goal['policy']['max_iterations'] == 60 and goal['policy']['max_hours'] == 24
raw = (root / '.loop/goals/agent-fabric-g1-f05-storage/events.jsonl').read_bytes()
prefix = raw[:checkpoint['eventsBytes']]
assert sha(prefix) == checkpoint['eventsSha256']
assert json.loads(prefix.splitlines()[-1]) == checkpoint['eventsHead']
now = datetime.datetime.now(datetime.timezone.utc)
elapsed = (now-datetime.datetime.fromisoformat(state['started_at'])).total_seconds()/3600
budgets = {}
for line in (root/'docs/planning/g1-f05-plan.md').read_text().splitlines():
    m=re.match(r'\| (f05-[\w-]+) \| [^|]+ \| [^|]+ \| (\d+)m \|',line)
    if m: budgets[m[1]]=int(m[2])
unfinished = [t for t in state['tasks'] if t['status'] in {'pending','active','blocked'}]
assert len(unfinished) == 52 and set(budgets) == {t['id'] for t in unfinished}
minutes=sum(budgets.values())
# This resources turn consumes the first of the eight approved pipeline slots.
pipeline = ['independent plan review','staged-test reporting/preparation','independent security review','independent code review','final acceptance review','product acceptance review','final evidence/handoff or resource re-review']
future_work=52; future_pipeline=len(pipeline); repair=20
write('capacity-audit.json', {
 'observedAt':now.isoformat(),'finding':'RESOURCE39-01','status':'approved_not_applied',
 'iteration':41,'maxIterations':60,'remainingTurns':19,'remainingWorkTasks':52,
 'minimumWorkTurnDeficit':33,'taskBudgetMinutes':minutes,'taskBudgetHours':minutes/60,
 'maxHours':24,'startedAt':state['started_at'],'elapsedWallHours':elapsed,'remainingWallHours':24-elapsed,
 'minimumWorkHourDeficit':minutes/60-(24-elapsed),'taskBudgetsMinutes':budgets,
 'tasks':dict(collections.Counter(t['status'] for t in state['tasks'])),
 'authorizedNotApplied':{'questionId':question['id'],'maxIterations':120,'maxHours':144,
 'remainingTurns':79,'workTurns':future_work,'pipelineOverheadTurns':future_pipeline,
 'pipelineStages':pipeline,'repairReserveTurns':repair,'allocatedTurns':future_work+future_pipeline+repair,
 'pipelineHoursAtTurnCeiling':14,'repairHoursAtTurnCeiling':40,'controllerCheckReserveHours':3,
 'futureEstimatedHours':minutes/60+14+40+3,'totalEstimatedWallHours':elapsed+minutes/60+14+40+3,
 'wallHeadroomHours':144-(elapsed+minutes/60+14+40+3),'currentResourcesTurnUsesOriginalPipelineSlot':True,
 'accountingResetAllowed':False},'stageSubmitted':False,'policyUntouched':True})
write('history-after-answer.json', {'observedAt':now.isoformat(),'goalId':state['goal_id'],
 'iteration':41,'iterationBase':0,'startedAt':state['started_at'],'usage':state['usage'],
 'eventsBytes':len(raw),'eventsSha256':sha(raw),'eventsHead':json.loads(raw.splitlines()[-1]),
 'checkpointEvent':checkpoint['eventsHead'],'checkpointPrefixByteIdentical':True,
 'all55TaskHistoriesUnchanged':True,'usageMonotonic':True,'policy':goal['policy'],
 'approvedPolicyMatchesActual':True,'approvalRecord':question,'readyToSubmit':False})
inputs=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn38/inputs.json')
for path,expected in inputs.items(): assert sha((root/path).read_bytes())==expected,path
streams=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn38/controller-results.json')['streams']
for s in streams:
    data=(root/s['path']).read_bytes(); assert len(data)==s['bytes'] and sha(data)==s['sha256']
protected=read('g1-storage/verification/preserved-inputs.json')['files']
for path,expected in protected.items(): assert sha((root/path).read_bytes())==expected,path
write('preservation-audit.json',{'inputHashesVerified':inputs,'controllerStreamsVerified':streams,
 'protectedInputsUnchanged':len(protected),'priorReadinessSha256':sha(prior),
 'controllerPlanAuthoredFieldsExactMatch':True,'uniqueDependencyOrdered':True,
 'tasks':55,'requirements':96,'checks':sum(len(t['checks']) for t in plan),
 'teamsEmpty':True,'teamLimit':goal['agent'].get('team_limit',4),
 'policyUntouched':True,'taskPlanUntouched':True,'observationOnly':True,'newProductOrControllerCheck':False})
write('approved-policy-change.json',{'goalId':state['goal_id'],'approvalQuestion':question['id'],
 'answeredAt':question['answered_at'],'answeredBy':question['answered_by'],'answer':question['answer'],
 'applyOnly':{'max_iterations':{'from':60,'to':120},'max_hours':{'from':24,'to':144}},
 'preserveOtherPolicy':goal['policy'],'preserve':['original started_at','iteration_base=0','cumulative iteration and usage','55 task histories','96 requirements','76 checks','420 variants','complete event prefix','scope and approval boundaries'],
 'status':'approved_not_applied','owner':'authorized human/controller maintainer',
 'existingAgentMutationEndpoint':None})
print(json.dumps({'capacity':'approved_not_applied','iteration':41,'workTasks':52,'actualRemainingTurns':19,
 'authorizedRemainingTurns':79,'futureAllocation':79,'elapsedWallHours':elapsed,
 'authorizedTotalEstimatedHours':elapsed+118.75,'protectedUnchanged':len(protected),
 'approvalAnsweredAt':question['answered_at'],'checkpointPrefixPreserved':True}))
