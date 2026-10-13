"""Read-only resource/document consistency audit; no product qualification."""
import contextlib
import hashlib
import io
import json
import re
from capture import BASE, ROOT, PREFIX, REPORT, read, write, binding

def verify(b, historical_report=False):
    p = b['path']
    if historical_report and p == REPORT:
        p = PREFIX + '/readiness-turn86-preserved.md'
    path = ROOT / p
    assert path.is_file() and not path.is_symlink(), p
    raw = path.read_bytes()
    assert len(raw) == b['bytes'] and hashlib.sha256(raw).hexdigest() == b['sha256'], p

# Retain every v5 plan audit assertion, resolving only its historical report
# reference to the exact preserved v4 bytes. Never modify the original audit.
prior_audit = ROOT / 'docs/loop/agent-fabric-g1-f05-storage/plan-turn88/audit.py'
source = prior_audit.read_text()
old_line = "p=ROOT/b['path']"
assert source.count(old_line) == 1
replacement = "p=ROOT/(" + repr(PREFIX + '/readiness-turn86-preserved.md') + " if b['path']==" + repr(REPORT) + " else b['path'])"
source = source.replace(old_line, replacement)
out = io.StringIO()
with contextlib.redirect_stdout(out):
    exec(compile(source, str(prior_audit), 'exec'), {'__file__': str(prior_audit), '__name__': 'resource_plan_audit'})
plan_audit = json.loads(out.getvalue())
assert plan_audit['tasks'] == 59 and plan_audit['checks'] == 89

state = read('.loop/goals/agent-fabric-g1-f05-storage/state.json')
goal = read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
before = read(PREFIX + '/controller-before.json')
plan = read('docs/planning/g1-f05-task-plan-v5.json')
author = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn88/readiness-capacity-supplement.json')
cap = read(PREFIX + '/capacity-binding.json')
allocation = read(PREFIX + '/task-resource-allocation.json')
for t in state['tasks']:
    prior = next(p for p in before['tasks'] if p['id'] == t['id'])
    for k in ['status', 'attempts', 'notes', 'summary']:
        assert t.get(k) == prior.get(k), (t['id'], k)
assert state['requirements'] == before['requirements']
assert sum(t['status'] == 'done' for t in state['tasks']) == 36
assert sum(t['status'] == 'pending' for t in state['tasks']) == 23
assert cap['approvedPolicy'] == author['approvedPolicy'] == goal['policy']
assert cap['approvedDigest'] == author['approvedDigest'] == state['approved_digest']
assert cap['originalStart'] == author['originalStart'] == state['started_at']
assert cap['accountingReset'] is False
assert cap['teamLimit'] == goal['agent'].get('team_limit', 4) == 4
assert cap['maximumDelegatedSeats'] == 0 and all(t['team'] == [] for t in plan['tasks'])
verify(cap['teamLimitSource'])
assert 'goal["agent"].get("team_limit", 4)' in (ROOT / cap['teamLimitSource']['path']).read_text()
for k in ['amendedPlan', 'repairCases', 'aggregateSchedule', 'specification', 'authorAllocation', 'controllerSnapshot', 'goalSnapshot']:
    verify(cap[k])
assert cap['taskBudgetsMinutes'] == author['taskBudgetsMinutes']
assert cap['workMinutes'] == sum(cap['taskBudgetsMinutes'].values()) == 1675
assert cap['taskBudgetsMinutes']['f05-11-atomic-disconnect'] == sum(cap['repairBudgetBreakdownMinutes'].values()) == 110
assert max(cap['taskBudgetsMinutes'].values()) <= cap['turnCeilingMinutes'] == 120
assert cap['iteration'] == 89 and cap['remainingTurnsAfterThisStage'] == 120 - 89 == 31
assert (cap['workTurns'], cap['futurePipelineTurns'], cap['repairReserveTurns']) == (23, 7, 1)
assert cap['futurePipelineStages'] == author['pipelineStages'][1:]
estimate = cap['elapsedWallHours'] + 1675 / 60 + 14 + 2 + 3
assert abs(cap['estimatedTotalHours'] - estimate) < 1e-8
assert abs(cap['headroomHours'] - (144 - estimate)) < 1e-8 and cap['headroomHours'] > 0
assert len(allocation) == 59 and sum(len(t['checks']) for t in allocation) == 89
for t in allocation:
    live = next(x for x in state['tasks'] if x['id'] == t['id'])
    authored = next(x for x in plan['tasks'] if x['id'] == t['id'])
    assert all(t[k] == v for k, v in authored.items() if k != 'checks')
    assert t['status'] == live['status'] and t['budgetMinutes'] == cap['taskBudgetsMinutes'].get(t['id'])
    assert t['missingOutputOwner'] == t['id']
    for c, a in zip(t['checks'], authored['checks']):
        assert all(c[k] == v for k, v in a.items())
missing_owners = [t['id'] for t in allocation if any(c['scriptExists'] is False or c['registryPresent'] is False or c['sourceFilePresent'] is False for c in t['checks'])]
assert len(missing_owners) == 21
for p in read(PREFIX + '/missing-planned-gates.json'):
    assert p['exitCode'] == 1 and p['timeoutSeconds'] == 5
    for b in p['streams']:
        verify(b)
    assert 'Unknown/extra checker argument' in (ROOT / p['streams'][1]['path']).read_text()

probes = read(PREFIX + '/probes.json')
assert len(probes) == 10 and all(p['exitCode'] == 0 for p in probes)
for p in probes:
    for b in p['streams']:
        verify(b)
assert read(PREFIX + '/controller-audit.stdout.log') == {'ok': True, 'problems': []}
primitives = read(PREFIX + '/primitives.stdout.log')
assert primitives['cryptoRoundTrip'] and primitives['integrityRefusals'] == 4
assert primitives['scopedHmac'] and primitives['exclusiveFileFsyncRenameDirectorySync'] and primitives['loopbackHttp']
assert primitives['ownedIpcSignals'] == ['SIGKILL', 'SIGTERM'] and primitives['monotonicClock']
assert primitives['census']['status'] is None and primitives['census']['error']['code'] == 'EPERM'
assert primitives['census']['error']['message'] == 'spawnSync /bin/ps EPERM'
envelope = read(PREFIX + '/envelope-probe.json')
assert envelope['exitCode'] == 0 and envelope['timeoutSeconds'] == 60
for b in envelope['streams']:
    verify(b)
records = [json.loads(line) for line in (BASE / 'four-container-envelope.stdout.log').read_text().splitlines()]
assert records[0]['preexistingContainers'] == records[-1]['preexistingContainers'] == []
live = next(r for r in records if r['measurement'] == 'four-concurrent-resource-envelope')
assert len(live['ready']) == 4 and live['f05MigrationsOrAssertionsExecuted'] is False
assert all(r['cpu'] == 1 and r['memoryBytes'] == 268435456 and r['pidsLimit'] == 128 and r['loopback'] and r['noBindMount'] for r in live['ready'])
cleanup = [r for r in records if r['measurement'] == 'resource-envelope-LIFO-cleanup']
assert [r['slot'] for r in cleanup] == ['C', 'B', 'A', 'O']
assert all(r['removed'] and r['exactCensusUnchanged'] for r in cleanup)

results = read(PREFIX + '/controller-results.json')
assert results['jobId'] == 'job-687eae6759' and len(results['checks']) == 3
tasks = {t['id']: t for t in plan['tasks']}
for check_id, c in results['checks'].items():
    assert c['result']['status'] == 'pass' and c['result']['exit_code'] == 0 and c['fullStreamsRead']
    assert c['result']['cleanup'] == 'zombie'  # Keep literal controller metadata.
    for s in c['streams']:
        verify(s['original']); verify(s['copy'])
        assert s['original']['sha256'] == s['copy']['sha256']
    task_id, name = check_id.split('.', 1)
    definitions = goal['acceptance'] if task_id == 'acceptance' else tasks[task_id]['checks']
    assert c['definition'] == next(d for d in definitions if d['id'] == name)
source = results['checks']['f05-04.source-content-component']
report = next(m for m in source['measurements'] if m['measurement'] == 'storage-test-report')['reports'][0]
assert report['tests'] == 12 and len(report['variants']) == 11
assert all(report[k] == 0 for k in ['fail', 'cancelled', 'skipped', 'todo'])
assert all(v == 0 for v in report['observations']['violations'].values())
assert all(report['observations']['positives'][k] == 0 for k in ['save', 'ask', 'forget', 'restore'])
candidate = next(m for m in source['measurements'] if m['measurement'] == 'storage-candidate')
assert candidate['digest'] == 'sha256:ef2875e998dfe518c2f9e8f8aa5ceff21cd58db3948143ed1dc5b88388afcde5' and candidate['files'] == 1053
for kind in ['storage-container-cleanup', 'storage-root-cleanup']:
    assert next(m for m in source['measurements'] if m['measurement'] == kind)['removed']
assert next(m for m in source['measurements'] if m['measurement'] == 'storage-container-cleanup')['censusUnchanged']
for b in read(PREFIX + '/inputs.json'):
    verify(b)
preserved = read(PREFIX + '/preservation-before.json')
for b in preserved['files']:
    verify(b, historical_report=True)
for p, h in preserved['protectedFiles'].items():
    assert hashlib.sha256((ROOT / p).read_bytes()).hexdigest() == h, p
for b in author['historicalResourceReferences']:
    verify(b, historical_report=True)
assert binding(REPORT)['sha256'] != binding(PREFIX + '/readiness-turn86-preserved.md')['sha256']
links = []
for link in re.findall(r'\]\(([^)]+)\)', (ROOT / REPORT).read_text()):
    if not link.startswith(('http:', 'https:', '#')):
        links.append(link)
result = {'qualification': 'resource/document consistency only; no repair/task/F05 acceptance',
          'tasks': 59, 'checks': 89, 'requirements': 96, 'done': 36, 'pending': 23,
          'v5PlanAudit': plan_audit, 'remainingTurnsAfterStage': 31, 'pipelineTurns': 7, 'repairReserveTurns': 1,
          'workMinutes': 1675, 'headroomHours': cap['headroomHours'],
          'directProbes': 10, 'concurrentSqlResources': 4, 'controllerPrerequisitesPassed': 3,
          'newComponentAndSliceMissing': True, 'missingOutputOwners': missing_owners,
          'retainedAtomicFailureUnresolved': True, 'repairedWorkloadTimingsEstablished': False,
          'taskReceiptsUnchanged': True, 'preexistingFilesVerified': len(preserved['files']),
          'protectedFilesVerified': len(preserved['protectedFiles']), 'linksVerified': links,
          'productionCodeChanges': False, 'newExternalResources': [],
          'externalGatesUnqualified': ['X' + f'{i:02}' for i in range(1, 10)]}
write('audit-result.json', result)
package = [binding(REPORT)]
for p in sorted(BASE.rglob('*')):
    if p.is_file() and '__pycache__' not in p.parts and p.name != 'submission-binding.json':
        package.append(binding(str(p.relative_to(ROOT))))
write('submission-binding.json', {'stage': 'resources', 'iteration': 89, 'qualification': result['qualification'], 'files': package})
for link in links:
    assert ((ROOT / REPORT).parent / link.split('#', 1)[0]).exists(), link
print(json.dumps(result))
