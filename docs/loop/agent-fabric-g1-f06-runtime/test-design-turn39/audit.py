"""Read-only design/raw preservation audit. No product build or process launch."""
from pathlib import Path
import hashlib, json, re, sys
h = Path(__file__).resolve().parent
b = h.parent
root = h.parents[3]
out = Path(sys.argv[1]).resolve()
assert not out.exists(), 'Retain all diagnostic attempts'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = []
def ok(name, detail): checks.append({'name': name, 'detail': detail})
initial = json.loads((h/'initial-files.json').read_text())['files']
allowed = {'docs/planning/g1-f06-plan.md', 'docs/evidence/g1-f06-acceptance.md',
           str((b/'readiness.md').relative_to(root)), str((b/'test-plan.md').relative_to(root))}
changed = [p for p, digest in initial.items() if sha(root/p) != digest]
assert set(changed) == allowed, changed
assert (root/'docs/evidence/g1-f06-acceptance.md').read_bytes().startswith((h/'acceptance-before.md').read_bytes())
ok('product-prior-raw-and-inherited-design-preserved', {'initialFiles': len(initial), 'allowedLivingDocuments': changed, 'allPriorRawHashed': True})
text = (b/'test-plan.md').read_text()
assert text.startswith((h/'test-plan-before.md').read_text()), 'Append normative case refinement, preserve all previous sections'
requirements = json.loads((b/'test-design-turn22/requirements-snapshot.json').read_text())
mapped = re.findall(r'^\| (?:[AIQB]\d{2}|R\d{2}) / ([A-Z]+-\d+(?:\.\d+)?) ', text, re.M)
assert len(mapped) == len(set(mapped)) == 101
assert set(mapped) == {r['id'] for r in requirements}
assert len(re.findall(r'^\| ([AIQBRCEHPX]\d{2})(?=\s)', text, re.M)) == 142
assert len(re.findall(r'^\| P\d{2}/[a-z-]+;.*$', text, re.M)) == 29
inv = root/'g1-runtime/verification/case-inventory.json'
assert sha(inv) == '47e12c9af887db0dfd7da75b89a8b1d3d66a9e0a8d364a376786fe04a817cd22'
assert len(json.loads(inv.read_text())['ids']) == 5350
ok('all-existing-requirements-cases-levels-oracles-and-inventory-preserved', {'requirements': 101, 'families': 142, 'ownerChildren': 29, 'ids': 5350})
contract = (h/'cancellation-contract.md').read_text()
cases = json.loads((h/'cancellation-cases.json').read_text())
rows = re.findall(r'^\| (C[BC E]\d\d) / (H\d\d/full) \| (.*?) \| (.*?) \|$', contract, re.M)
assert len(rows) == len(cases['cases']) == 20
for (id_, owner, steps, expected), c in zip(rows, cases['cases']):
    assert (id_, owner, steps, expected) == (c['id'], c['owningId'], c['steps'], c['expected'])
    assert c['suite'] == 'harness-integrity'
    assert c['level'] == ('security' if owner == 'H14/full' else 'integration')
    assert c['preconditions'] and c['data'] and c['command']
    assert c['implementation'] == 'pending' and not c['completeBehaviorProved']
assert cases['labelsAreJourneyUpperBound'] is False and cases['allBodiesImplemented'] is False
assert 'six **separate runs**' in contract and 'H04 remains' in contract
ok('twenty-exact-future-case-bodies', {'bodies': 20, 'levels': ['integration', 'security'], 'productImplementation': False})
reports = sorted(h.glob('cancellation-*/result.json'))
assert len(reports) == 3, 'Retain original failure, precheck and mandatory task completion'
for i, path in enumerate(reports):
    r = json.loads(path.read_text())
    assert not r['acceptance'] and not r['fullMatrixFit'] and not r['remoteQualified']
    assert r['cleanupConfirmed'] and not r['finalNonceResidue']
    assert r['candidate'] == 'sha256:7089d81f4ccd5f1d9ac6a2674c1a20e521bbd6f4039dd9da41394f3e91f7ebb4'
    for name, digest in r['inputs'].items(): assert sha(root/'g1-runtime/scripts'/name) == digest
    assert [s['mode'] for s in r['scenes']] == ['valid-births', 'invalid-nonce-prefix']
    for scene in r['scenes']:
        p = path.parent/scene['mode']
        s = json.loads((p/'supervisor.json').read_text())
        assert sha(p/'supervisor.json') == scene['rawReportSha256']
        assert scene['diagnosticObserved']
        assert len(scene['actors']) == 2 and scene['barrier']['bothBirthsAcknowledged']
        assert scene['wrapper']['resolved'] is False and s['error']
        for name, v in s['rawStreams'].items():
            assert (p/name).stat().st_size == v['bytes'] and sha(p/name) == v['sha256']
        assert s['nonce'] == scene['nonce']
        for o in scene['actors']:
            ack = json.loads((p/('births.ndjson.'+str(o['pid'])+'.ack')).read_text())
            assert ack['nonce'] == o['nonce'] and ack['pid'] == o['pid'] and ack['birth'] == o['birth']
            assert any(x['pid'] == o['pid'] and x['birth'] == o['birth'] and x['nonce'] == o['nonce'] for x in s['owned'])
        if scene['mode'] == 'valid-births':
            assert s['cleanup']['confirmed'] and s['streamsComplete'] and len(s['signals']) == 2
            assert not scene['postReportLive']
        else:
            assert s['cleanup']['confirmed'] is False and s['streamsComplete'] is False and not s['signals']
            assert 'Unproven descendant birth' in s['cleanup']['error']
            assert len(scene['postReportLive']) == (1 if i == 0 else 2)
            births = [json.loads(l) for l in (p/'births.ndjson').read_text().splitlines()]
            assert len(births) == 3 and births[-1] == scene['injectedBirth']
            assert births[-1]['nonce'] != scene['nonce']
    if i == 0:
        assert r['success'] is False and len(r['sentinel']['checks']) == 1
        assert sha(h/'cancellation-probe-attempt1.mjs') == r['binding']['probeSha256']
        assert any(not x['confirmed'] for x in r['recovery'])
    else:
        assert r['success'] and len(r['sentinel']['checks']) == 2
        assert sha(h/'cancellation-probe.mjs') == r['binding']['probeSha256']
        assert all(x['confirmed'] and not x['after'] for x in r['recovery'])
        neg = next(x for x in r['recovery'] if x['label'] == 'invalid-nonce-prefix')
        assert len(neg['before']) == len(neg['signals']) == 2
        assert all(x['signal'] == 'SIGTERM' for x in neg['signals'])
        sentinel = r['sentinel']['instance']
        assert all(x['pid'] != sentinel['pid'] for x in neg['signals'])
        final = r['recovery'][-1]
        assert len(final['signals']) == 1 and final['signals'][0]['pid'] == sentinel['pid']
    assert sha(h/'actor.mjs') == r['binding']['actorSha256']
ok('actual-counterexample-control-raw-ACK-provenance-and-separate-recovery', {'retainedRuns': 3, 'initialCollectorFailureRetained': True, 'completedNegativeProductPasses': 0, 'eachCorrectedRunKnownSurvivors': 2, 'separateRecoveryAndSentinel': True})
history = json.loads((h/'controller-history.json').read_text())
key = 'f06-test-design-cancel.f06-design-cancellation-counterexample'
assert [j['results'][key] for j in history['jobs']] == ['fail', 'pass', 'pass']
finished = [e for e in history['events'] if e['type'] == 'job.finished']
assert [e['data']['results'][key] for e in finished] == ['fail', 'pass', 'pass']
assert list(history['contemporaneousTranscriptDurationsMs'].values()) == [13594, 2915, 3045]
assert 'Do NOT treat' in history['requeryWarning']
ok('original-historical-controller-failure-not-replaced-by-latest-shared-check-state', {'historicalVerdicts': ['fail', 'pass', 'pass'], 'laterCheckRequeryIsNotHistoricalVerdict': True})
proposal = json.loads((h/'proposed-task-payload.json').read_text())
old = json.loads((b/'test-design-turn38/proposed-task-payload.json').read_text())
assert proposal['proposedOnly'] and not proposal['officialRemainingImplementationSplitSubmitted']
assert len(proposal['tasks']) == 15 and proposal['tasks'][1:] == old['tasks'][1:]
t = proposal['tasks'][0]
for k in ['id', 'role', 'team', 'depends_on', 'selectors', 'expandedIds', 'checks', 'covers']: assert t[k] == old['tasks'][0][k]
assert t['upperTotalMinutes'] == 100
assert sum(t['implementationMinutes'][0] for t in proposal['tasks']) == 610
assert sum(t['implementationMinutes'][1] for t in proposal['tasks']) == 1065
assert sum(t['wholeCheckSeconds'] for t in proposal['tasks']) == 7440
assert sum(t['cleanupEvidenceHandoffMinutes'] for t in proposal['tasks']) == 150
assert max(t['upperTotalMinutes'] for t in proposal['tasks']) == 108
snapshot = json.loads((h/'controller-task-snapshot.json').read_text())
assert not snapshot['planFinal'] and not snapshot['officialRemainingImplementationSplitSubmitted']
assert snapshot['counts']['done'] == 14 and sum(snapshot['counts'].values()) == 70
assert next(t for t in snapshot['tasks'] if t['id'] == 'f06-test-design-cancel')['status'] == 'done'
assert next(t for t in snapshot['tasks'] if t['id'] == 'f06-06c')['status'] == 'active'
assert next(t for t in snapshot['tasks'] if t['id'] == 'f06-08a')['status'] == 'active'
assert 'PR-F06-08/09 remain OPEN' in text and 'Test design remains INCOMPLETE' in text
assert 'NO-GO remains' in (b/'readiness.md').read_text()
ok('bounded-proposal-unchanged-aggregate-checks-and-no-stage-closure', {'proposedRows': 15, 'upperTotalMinutes': [884, 1339], 'officialProductSubdivisionSubmitted': False, 'done': '14/70 includes two diagnostics'})
result = {'kind': 'design-and-retained-raw-diagnostics-only', 'success': True, 'checks': checks,
          'acceptance': False, 'fullMatrixFit': False, 'stageComplete': False,
          'documentBindings': {str(p.relative_to(root)): sha(p) for p in [b/'test-plan.md', b/'readiness.md', root/'docs/planning/g1-f06-plan.md', root/'docs/evidence/g1-f06-acceptance.md', h/'cancellation-contract.md', h/'cancellation-cases.json', h/'proposed-task-payload.json']}}
out.write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'success': True, 'diagnosticGroups': len(checks), 'output': str(out)}))
