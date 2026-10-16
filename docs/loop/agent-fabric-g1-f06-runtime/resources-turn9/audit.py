"""Read-only readiness audit. Does not execute inherited checks or edit Loop state."""
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path.cwd()
folder = root / 'docs/loop/agent-fabric-g1-f06-runtime/resources-turn9'
if (folder / 'audit-results.json').exists():
    raise SystemExit('Preserve recorded snapshot; use a new output location for another run')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
result = {'kind': 'resource-diagnostics-only', 'observedAt': datetime.now(timezone.utc).isoformat()}
guards = []
for path, variable in [('g1-foundations/scripts/check-retained.mjs', 'frozen'), ('g1-identity/scripts/check.mjs', 'preserved')]:
    source = (root / path).read_text()
    at = re.search(r'const\s+' + variable + r'\s*=\s*', source).end()
    pins, _ = json.JSONDecoder().raw_decode(source[at:])
    bad = [p for p, expected in pins.items() if not (root / p).is_file() or sha(root / p) != expected]
    guards.append({'source': path, 'variable': variable, 'files': len(pins), 'rawFilesWithinSet': sum(p.startswith('docs/evidence/g1-local-raw/') for p in pins), 'mismatches': bad})
source = (root / 'g1-foundations/scripts/check-retained.mjs').read_text()
for variable in ['raw']:
    match = re.search(r'const\s+' + variable + r'\s*=\s*', source)
    if match:
        pins, _ = json.JSONDecoder().raw_decode(source[match.end():])
        guards.append({'source': 'g1-foundations/scripts/check-retained.mjs', 'variable': variable, 'files':len(pins), 'mismatches':[p for p,v in pins.items() if not (root/p).is_file() or sha(root/p)!=v]})
result['hashDiagnostics'] = guards
goal = json.loads((root / '.loop/goals/agent-fabric-g1-f06-runtime/goal.json').read_text())
tasks = json.loads((root / 'docs/loop/agent-fabric-g1-f06-runtime/task-plan.json').read_text())['tasks']
result['budget'] = {k: goal['policy'].get(k) for k in ['max_iterations','max_hours','turn_timeout_minutes','check_timeout_seconds']}
result['teamLimit'] = goal['agent'].get('team_limit', 4)
result['teamLimitSource'] = '/Users/super/Documents/ai/loop-engineering-code/loop_engineering/engine.py:596'
result['tasks'] = [{'id':t['id'],'specialists':sum(x['count'] for x in t.get('team',[])), 'checksSeconds':sum(c['timeout'] for c in t['checks'])} for t in tasks]
result['totalPlannedChecksSeconds'] = sum(t['checksSeconds'] for t in result['tasks'])
result['acceptance'] = [{'id':c['id'],'argv':c['argv'],'timeout':c['timeout']} for c in goal['acceptance']]
result['inputs'] = {p:sha(root/p) for p in ['package.json','pnpm-lock.yaml','g1-identity/package.json','g1-identity/pnpm-lock.yaml','docs/loop/agent-fabric-g1-f06-runtime/product-brief.md','docs/loop/agent-fabric-g1-f06-runtime/solution.md','docs/loop/agent-fabric-g1-f06-runtime/test-plan.md','docs/loop/agent-fabric-g1-f06-runtime/task-plan.json','docs/planning/g1-f06-plan.md']}
changed = subprocess.check_output(['git','ls-files','-m','-z'],cwd=root).decode().split('\0')
f05 = [p for p in changed if p and (p.startswith('g1-storage/') or 'g1-f05' in p)]
result['unrelatedF05ModifiedTrackedSnapshot'] = {p:sha(root/p) for p in f05 if (root/p).is_file()}
result['futureArtifacts'] = {p:(root/p).exists() for p in ['g1-runtime/package.json','g1-runtime/scripts/build.mjs','g1-runtime/scripts/check.mjs','g1-runtime/scripts/check-owners.mjs','g1-runtime/scripts/check-remote.mjs','docs/evidence/g1-f06-acceptance.md']}
result['hostedCIWorkflowFiles'] = [str(p.relative_to(root)) for p in (root/'.github/workflows').glob('*')] if (root/'.github/workflows').exists() else []
(folder/'audit-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['inputs','unrelatedF05ModifiedTrackedSnapshot','acceptance']},indent=2))
