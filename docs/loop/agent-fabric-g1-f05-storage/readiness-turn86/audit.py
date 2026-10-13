"""Read-only resource/package audit. This does not certify product behavior."""
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
PREFIX = str(BASE.relative_to(ROOT))
REPORT = 'docs/loop/agent-fabric-g1-f05-storage/readiness.md'
read = lambda path: json.loads((ROOT/path).read_text())

def binding(path):
    raw=(ROOT/path).read_bytes()
    return {'path':path,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}

def verify(b, historical_report=False):
    path=b['path']
    if historical_report and path==REPORT:
        path=PREFIX+'/readiness-turn56-preserved.md'
    p=ROOT/path
    assert p.is_file() and not p.is_symlink(),path
    raw=p.read_bytes()
    assert len(raw)==b['bytes'] and hashlib.sha256(raw).hexdigest()==b['sha256'],path

plan=read('docs/planning/g1-f05-task-plan-v4.json')
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
before=read(PREFIX+'/controller-before.json')
cap=read(PREFIX+'/capacity-binding.json')
allocation=read(PREFIX+'/task-resource-allocation.json')
author=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/readiness-capacity-supplement.json')
cases=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/repair-cases.json')
keys=list(plan['tasks'][0])
current=[{k:t.get(k,[]) if k in ['covers','depends_on','team','checks'] else t.get(k) for k in keys} for t in state['tasks']]
assert current==plan['tasks'] and len(current)==59 and sum(len(t['checks']) for t in current)==87
requirements={r['id'] for r in state['requirements']}
assert requirements=={r for t in current for r in t['covers']} and len(requirements)==96
assert state['requirements']==before['requirements'] and state['plan_final'] is True
tasks={t['id']:t for t in current}
seen,visiting=set(),set()
def visit(i):
    assert i in tasks and i not in visiting,i
    if i in seen:return
    visiting.add(i)
    for d in tasks[i]['depends_on']:visit(d)
    visiting.remove(i);seen.add(i)
for i in tasks:visit(i)
for t in state['tasks']:
    prior=next(x for x in before['tasks'] if x['id']==t['id'])
    for k in ['status','attempts','notes','summary']:
        assert t.get(k)==prior.get(k),(t['id'],k)
assert sum(t['status']=='done' for t in state['tasks'])==36
assert sum(t['status']=='pending' for t in state['tasks'])==23
assert all(t['team']==[] for t in current)
assert cap['teamLimit']==goal['agent'].get('team_limit',4)==4 and cap['maximumDelegatedSeats']==0
verify(cap['teamLimitSource'])
engine=(ROOT/cap['teamLimitSource']['path']).read_text()
assert 'goal["agent"].get("team_limit", 4)' in engine
assert cap['approvedPolicy']==goal['policy']==author['approvedPolicy']
assert cap['approvedDigest']==state['approved_digest']==author['approvedDigest']
assert cap['originalStart']==state['started_at']==author['originalStart']
assert cap['accountingReset'] is False
for k in ['amendedPlan','repairCases','specification','authorAllocation','controllerSnapshot','goalSnapshot']:verify(cap[k])
assert cap['taskBudgetsMinutes']==author['taskBudgetsMinutes']
assert sum(cap['taskBudgetsMinutes'].values())==cap['workMinutes']==1655
assert cap['taskBudgetsMinutes']['f05-11-atomic-disconnect']==sum(cap['repairBudgetBreakdownMinutes'].values())==95
assert max(cap['taskBudgetsMinutes'].values())<=120
assert cap['remainingTurnsAfterThisStage']==120-86==cap['workTurns']+cap['futurePipelineTurns']+cap['repairReserveTurns']==34
assert (cap['workTurns'],cap['futurePipelineTurns'],cap['repairReserveTurns'])==(23,7,4)
estimate=cap['elapsedWallHours']+1655/60+14+8+3
assert abs(cap['estimatedTotalHours']-estimate)<1e-8 and abs(cap['headroomHours']-(144-estimate))<1e-8 and cap['headroomHours']>0
assert cap['futurePipelineStages']==author['pipelineStages'][1:]
assert cases['realPhaseCount']==len(cases['realPhases'])==50 and cases['hostileProbeCount']==10 and cases['mandatoryLeafCount']==60
assert cases['rounds']==5 and cases['phasesPerRound']==10 and cases['disconnectBoundMs']==2000 and cases['testDeadlineMs']==240000 and cases['retryCount']==0
assert len([c for c in cases['realPhases'] if c['table']=='storage_knowledge_revisions' and c['timing']=='AFTER' and c['expectedMask']==3])==5
for b in cases['repairPredecessorFiles']+cases['failedStreams']:verify(b)
prior=read('docs/loop/agent-fabric-g1-f05-storage/plan-turn85/authored-before.json')[-1]
repair=tasks['f05-11-atomic-disconnect']
assert repair['checks'][1:]==prior['checks'] and len(repair['checks'])==3
assert repair['checks'][0]['run']=='node g1-storage/scripts/check-component.mjs verify-atomic-disconnect'
assert repair['checks'][0]['timeout']==900
assert tasks['f05-11']['depends_on']==['f05-11-races','f05-11-atomic-disconnect']
assert len(allocation)==59 and sum(len(t['checks']) for t in allocation)==87
for t in allocation:
    assert t['status']==next(x for x in state['tasks'] if x['id']==t['id'])['status']
    assert t['team']==[] and t['missingOutputOwner']==t['id']
    assert t['budgetMinutes']==cap['taskBudgetsMinutes'].get(t['id'])
newgate=allocation[-1]['checks'][0]
assert newgate['registryPresent'] is False and newgate['scriptExists'] is True
missing=read(PREFIX+'/missing-planned-gate.json')
assert missing['exitCode']==1
for b in missing['streams']:verify(b)
assert 'Unknown/extra checker argument' in (ROOT/missing['streams'][1]['path']).read_text()
probes=read(PREFIX+'/probes.json')
assert len(probes)==10 and all(p['exitCode']==0 for p in probes)
for p in probes:
    for b in p['streams']:verify(b)
primitives=json.loads((BASE/'primitives.stdout.log').read_text())
assert primitives['census']['error']['code']=='EPERM' and primitives['cryptoRoundTrip'] and primitives['integrityRefusals']==4
env=read(PREFIX+'/envelope-probe.json')
assert env['exitCode']==0
for b in env['streams']:verify(b)
records=[json.loads(line) for line in (BASE/'four-container-envelope.stdout.log').read_text().splitlines()]
assert records[0]['preexistingContainers']==records[-1]['preexistingContainers']==[]
envelope=next(r for r in records if r['measurement']=='four-concurrent-resource-envelope')
assert len(envelope['ready'])==4 and envelope['f05MigrationsOrAssertionsExecuted'] is False
assert [r['slot'] for r in records if r['measurement']=='resource-envelope-LIFO-cleanup']==['C','B','A','O']
assert all(r['removed'] and r['exactCensusUnchanged'] for r in records if r['measurement']=='resource-envelope-LIFO-cleanup')
results=read(PREFIX+'/controller-results.json')
assert results['jobId']=='job-3fb7aa9ba1' and len(results['checks'])==3
for check_id,c in results['checks'].items():
    assert c['result']['status']=='pass' and c['result']['exit_code']==0 and c['fullStreamsRead']
    for stream in c['streams']:
        verify(stream['original']);verify(stream['copy'])
        assert stream['original']['sha256']==stream['copy']['sha256']
    task_id,check_name=check_id.split('.',1)
    definitions=goal['acceptance'] if task_id=='acceptance' else tasks[task_id]['checks']
    assert c['definition']==next(d for d in definitions if d['id']==check_name)
source=results['checks']['f05-04.source-content-component']
report=next(m for m in source['measurements'] if m['measurement']=='storage-test-report')['reports'][0]
assert report['tests']==12 and len(report['variants'])==11
assert all(report[k]==0 for k in ['fail','cancelled','skipped','todo'])
assert all(v==0 for v in report['observations']['violations'].values())
candidate=next(m for m in source['measurements'] if m['measurement']=='storage-candidate')
assert candidate['digest']=='sha256:ef2875e998dfe518c2f9e8f8aa5ceff21cd58db3948143ed1dc5b88388afcde5' and candidate['files']==1053
for b in read(PREFIX+'/inputs.json'):verify(b)
preserved=read(PREFIX+'/preservation-before.json')
for b in preserved['files']:verify(b,historical_report=True)
for p,h in preserved['protectedFiles'].items():
    assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
assert binding(REPORT)['sha256']!=binding(PREFIX+'/readiness-turn56-preserved.md')['sha256']
for b in author['historicalResourceReferences']:verify(b,historical_report=True)
result={'qualification':'resource readiness/document audit only; no task completion, repair or product acceptance',
        'tasks':59,'checks':87,'requirements':96,'done':36,'pending':23,'acyclic':True,
        'teamLimit':4,'delegatedSeats':0,'workMinutes':1655,'remainingTurnsAfterStage':34,
        'pipelineTurns':7,'repairReserveTurns':4,'headroomHours':cap['headroomHours'],
        'directProbes':10,'fourConcurrentSqlResources':4,'controllerPrerequisiteChecksPassed':3,
        'plannedGateStillMissing':True,'retainedAtomicFailureUnresolved':True,
        'taskReceiptsUnchanged':True,'preexistingFilesVerified':len(preserved['files']),
        'protectedFilesUnchanged':len(preserved['protectedFiles']),
        'intentionalVersionedDocumentChange':REPORT,'historicalReportPreserved':binding(PREFIX+'/readiness-turn56-preserved.md'),
        'productionCodeChanges':False,'newExternalResources':[],'externalGatesUnqualified':['X'+f'{i:02}' for i in range(1,10)]}
(BASE/'audit-result.json').write_text(json.dumps(result,indent=2)+'\n')
package=[binding(REPORT)]
for p in sorted(BASE.rglob('*')):
    if p.is_file() and '__pycache__' not in p.parts and p.name!='submission-binding.json':
        package.append(binding(str(p.relative_to(ROOT))))
(BASE/'submission-binding.json').write_text(json.dumps({'stage':'resources','iteration':86,'qualification':result['qualification'],'files':package},indent=2)+'\n')
print(json.dumps(result))
