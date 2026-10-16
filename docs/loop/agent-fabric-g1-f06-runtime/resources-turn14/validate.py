"""Read-only resource/document diagnostics. Never executes product/SQL/GUI checks."""
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path.cwd()
folder = root / 'docs/loop/agent-fabric-g1-f06-runtime/resources-turn14'
output = (root / sys.argv[1]).resolve()
if output.exists():
    raise SystemExit('Preserve recorded result; choose a new output')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads((root / p).read_text())
checks = []
def check(name, condition, details):
    checks.append({'name': name, 'pass': bool(condition), 'details': details})

report = root / 'docs/loop/agent-fabric-g1-f06-runtime/readiness.md'
text = report.read_text()
links = re.findall(r'\[[^\]]+\]\(([^)]+)\)', text)
missing = [p for p in links if not p.startswith(('https:', 'http:', '#')) and not (report.parent / p.split('#')[0]).exists() and (report.parent / p).resolve() != output]
check('all-local-document-links', not missing, {'links': len(links), 'missing': missing, 'onlyFutureLinkAllowed': str(output.relative_to(root))})

audit = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/audit-results.json')
owner = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/owner-audit-results.json')
initial = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/initial-snapshot.json')
pins = {p: v for p, v in initial.items() if not p.startswith('.loop/')}
pins.update(audit['inputs'])
pins.update({p: v['sha256'] for p, v in owner['sourcePins'].items()})
bad = [p for p, h in pins.items() if not (root / p).is_file() or sha(root / p) != h]
check('source-plan-lock-and-unrelated-work-preserved', not bad, {'files': len(pins), 'mismatches': bad, 'controllerStateExcluded': True})
check('original-protected-raw-hashes', all(not x['mismatches'] for x in audit['hashDiagnostics']), audit['hashDiagnostics'])

plan = read('docs/loop/agent-fabric-g1-f06-runtime/task-plan.json')['tasks']
state = read('.loop/goals/agent-fabric-g1-f06-runtime/state.json')['tasks']
goal = read('.loop/goals/agent-fabric-g1-f06-runtime/goal.json')
byid = {t['id']: t for t in state}
differences = []
for t in plan:
    actual = byid[t['id']]
    for k in ['role', 'depends_on', 'covers']:
        if actual.get(k) != t.get(k): differences.append([t['id'], k])
    if (actual.get('team') or []) != (t.get('team') or []): differences.append([t['id'], 'team'])
    wanted = [{k: c.get(k) for k in ['id','run','timeout','stage']} for c in t['checks']]
    observed = [{k: c.get(k) for k in ['id','run','timeout','stage']} for c in actual['checks']]
    if wanted != observed: differences.append([t['id'], 'checks'])
count = sum(len(t['checks']) for t in plan)
seconds = sum(c['timeout'] for t in plan for c in t['checks'])
coverage = set(x for t in plan for x in t['covers'])
seats = {t['id']: sum(x['count'] for x in (t.get('team') or [])) for t in plan}
check('official-revised-plan-teams-covers-checks', len(plan) == 15 and not differences and count == 25 and seconds == 13860 and len(coverage) == 101 and max(seats.values()) <= 3, {'differences': differences, 'tasks': len(plan), 'checks': count, 'checkSeconds': seconds, 'requirementCoverage': len(coverage), 'specialists': seats})
acceptance = [(x['argv'], x['timeout']) for x in goal['acceptance']]
expected = [(['node',p],s) for p,s in [('g1-runtime/scripts/check.mjs',1800),('g1-identity/scripts/check.mjs',600),('g1-foundations/scripts/check.mjs',600),('g1-foundations/scripts/check-retained.mjs',900)]]
check('original-acceptance-and-policy-budgets', acceptance == expected and goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None and goal['policy']['turn_timeout_minutes'] == 120, {'acceptance': acceptance, 'policy': audit['budget'], 'teamLimit': audit['teamLimit']})

recovery = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/cache-results.json')
clients = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/client-cache-remediation-results.json')
check('remediated-clean-offline-installs', recovery['status'] == 0 and recovery['offlineRecheck']['status'] == 0 and recovery['ownedTempRemoved'] and clients['ownedTempRemoved'] and len(clients['checks']) == 3 and all(x['status'] == 0 and x['online']['status'] == 0 for x in clients['checks']), {'recoveryOffline': recovery['offlineRecheck']['status'], 'clients': {x['owner']: x['status'] for x in clients['checks']}, 'nativeInstallScriptsRun': False})
check('installed-owner-import-and-seam-prerequisites', owner['compile']['status'] == 0 and owner['compile']['skipLibCheck'] is False and all(owner['assertions'].values()), {'compile': owner['compile'], 'assertions': owner['assertions'], 'actualSqlBehaviorQualified': False})
probe = read('docs/loop/agent-fabric-g1-f06-runtime/resources-turn14/results.json')
records = {x['name']: x for x in probe['records']}
ready = ['sqlite-wal-process','loopback-http','owned-filesystem','shell','stdio-json-rpc','owned-child-lifecycle','offline-frozen-dependency-install','offline-g1-foundations','offline-g1-identity','offline-g1-model','offline-g1-storage','owned-temp-cleanup']
check('local-primitives-and-exact-unavailable-states', all(records[k]['result'] == 'ready' for k in ready) and records['process-census']['error']['code'] == 'EPERM' and records['offline-g1-recovery']['result'] == 'missing', {'ready': ready, 'censusError': records['process-census']['error'], 'initialFailuresPreserved': True})
required = ['phase-first','barrier-first','runtime_admit_plan_maintenance','runtime_transfer_fence','parent_run_id','physical revision1','first five P02','all29','no universal barrier-first','real SSH','26 task checks']
# The final token is prohibited, guarding a stale arithmetic claim.
missing_tokens = [x for x in required[:-1] if x not in text]
check('readiness-gates-and-fixed-checkpoints', not missing_tokens and required[-1] not in text and '25 task checks' in text and '13860s' in text and 'vendor archive' in text and 'approved:false' in text and 'No freeze/re-freeze performed' in text, {'missingTokens': missing_tokens, 'taskDoneClaims': False, 'remoteQualified': False})
result = {'kind':'resource-document-diagnostics-only','observedAt':datetime.now(timezone.utc).isoformat(),'reportSha256':sha(report),'allPass':all(x['pass'] for x in checks),'checks':checks,'productTestsRun':False,'dockerInvoked':False,'guiInvoked':False,'remoteTestEnvironmentAccessed':False}
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'allPass':result['allPass'],'checks':[{'name':x['name'],'pass':x['pass']} for x in checks]},indent=2))
raise SystemExit(0 if result['allPass'] else 1)
