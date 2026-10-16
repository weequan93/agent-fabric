"""Read-only document/model audit. This cannot qualify runtime behavior."""
from pathlib import Path
import hashlib
import json
import re
import sys
from model import model

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[3]
assert len(sys.argv) == 2
out = Path(sys.argv[1]).resolve()
assert out.parent == HERE and not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
initial = json.loads((HERE/'initial-files.json').read_text())['files']
allowed = {'docs/planning/g1-f06-plan.md', 'docs/evidence/g1-f06-acceptance.md',
           str((BASE/'test-plan.md').relative_to(ROOT)),
           str((BASE/'readiness.md').relative_to(ROOT))}
changed = {p for p, digest in initial.items() if sha(ROOT/p) != digest}
assert changed == allowed, sorted(changed)
assert (ROOT/'docs/evidence/g1-f06-acceptance.md').read_bytes().startswith(
    (HERE/'acceptance-before.md').read_bytes())
text = (BASE/'test-plan.md').read_text()
normalized = text.replace(
    'Status: **revision incomplete; lower-footprint cohort design specified, feasibility unproved (turn40)**.',
    'Status: **revision incomplete; guarded concurrency measured, cancellation recovery unresolved (turn38)**.', 1
).replace('Historical turn38 disposition:', 'Current turn38 disposition:', 1)
assert normalized.startswith((HERE/'test-plan-before.md').read_text())
mapped = re.findall(r'^\| (?:[AIQB]\d{2}|R\d{2}) / ([A-Z]+-\d+(?:\.\d+)?) ', text, re.M)
requirements = json.loads((BASE/'test-design-turn22/requirements-snapshot.json').read_text())
assert len(mapped) == len(set(mapped)) == 101
assert set(mapped) == {r['id'] for r in requirements}
assert len(re.findall(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)', text, re.M)) == 142
inv = ROOT/'g1-runtime/verification/case-inventory.json'
assert sha(inv) == '47e12c9af887db0dfd7da75b89a8b1d3d66a9e0a8d364a376786fe04a817cd22'
assert len(json.loads(inv.read_text())['ids']) == 5350
data = json.loads((HERE/'cohort-assignment-expiry-first.json').read_text())
assert data == model(), 'Reproduce the complete current static assignment'
assert data['complete'] is False and data['runtimeFit'] is False
assert data['actualProcessesLaunched'] == 0 and not data['referenceIsCompleteWorkload']
assert len(data['candidates']) == 10 and len(data['staticMutationsRejected']) == 12
floors = {(c['policy'], c['width']): c['observationOnlyFloorMs'] for c in data['candidates']}
assert [floors[p, w] for p, w in [('inventory-order', 32), ('expiry-first', 32),
                                  ('inventory-order', 64), ('expiry-first', 64)]] == [322000, 262000, 238000, 193000]
contract = (HERE/'cohort-contract.md').read_text()
rows = re.findall(r'^\| (CO\d\d) / (H\d\d); (security|integration) \|', contract, re.M)
assert rows == [('CO01', 'H14', 'security'), ('CO02', 'H10', 'security'),
                ('CO03', 'H14', 'security'), ('CO04', 'H10', 'security'),
                ('CO05', 'H15', 'integration'), ('CO06', 'H10', 'security')]
assert 'all other suites retain 120s' in contract
assert 'No cohort may run until turn39' in contract
assert 'No stage_done is called' in text
result = {'kind': 'local-static-design-audit', 'success': True,
          'productAcceptance': False, 'controllerBehaviorEvidence': False,
          'previousFilesPreserved': len(initial) - len(changed),
          'intentionalLivingDocumentChanges': sorted(changed),
          'requirementMappings': 101, 'caseFamilies': 142, 'inventoryIds': 5350,
          'referenceBranches': 2488, 'candidateSchedules': 10,
          'staticMutationsRejected': 12, 'futureCohortProbeBodies': 6,
          'allMeasurementsMissing': True, 'productionChanged': False,
          'processesLaunched': 0, 'dockerRun': False, 'remoteRun': False,
          'stageComplete': False, 'findings': {'PR-F06-08': 'open', 'PR-F06-09': 'open'}}
out.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
