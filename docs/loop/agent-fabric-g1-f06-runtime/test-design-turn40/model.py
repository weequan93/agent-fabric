"""Static design model only: no product imports, process launch or behavior claim."""
from pathlib import Path
from collections import OrderedDict
import copy
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[3]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
reference = BASE / 'test-design-turn37/workload.json'
work = json.loads(reference.read_text())
journeys = work['matrix']['journeys']
by_case = OrderedDict()
for j in journeys:
    by_case.setdefault(j['caseId'], []).append(j)
assert len(journeys) == 2488 and len(by_case) == 2475
assert sum(j['minimumActualExpiryMs'] for j in journeys) == 4476000
source = {j['branchId']: j for j in journeys}


def assign(width, policy):
    cohorts = []
    current = []
    ordered = list(by_case.values())
    if policy == 'expiry-first':
        ordered.sort(key=lambda rows: (-max(j['minimumActualExpiryMs'] for j in rows),
                                       -len(rows), rows[0]['caseId']))
    else:
        assert policy == 'inventory-order'
    for rows in ordered:
        assert len(rows) <= width, 'Never split one owning test body'
        if len(current) + len(rows) > width:
            cohorts.append(current)
            current = []
        current.extend(rows)
    if current:
        cohorts.append(current)
    result = []
    for n, rows in enumerate(cohorts):
        result.append({
            'cohort': n, 'branchCount': len(rows),
            'caseIds': list(dict.fromkeys(j['caseId'] for j in rows)),
            'branches': [{
                'branchId': j['branchId'], 'caseId': j['caseId'],
                'path': j['path'], 'minimumActualExpiryMs': j['minimumActualExpiryMs'],
                'namespaceSlot': 'cohort-%d/original-%d' % (n, k),
                'mutableStoreSlot': 'cohort-%d/store-%d' % (n, k),
                'credentialSlot': 'cohort-%d/credential-%d' % (n, k),
                'workloadBirthsRequired': 2,
                'recoveryEpochSlot': 'cohort-%d/new-OS-service' % n,
                'freshRestoredGetRequired': True, 'usefulSuccessorRequired': True,
            } for k, j in enumerate(rows)],
            'expiryWaitFloorMs': max(j['minimumActualExpiryMs'] for j in rows),
            # A null cost is missing evidence, never zero-time work.
            'measuredPrepareMs': None, 'measuredRecoveryEpochMs': None,
            'measuredOwningCallbacksMs': None, 'measuredRawAndTeardownMs': None,
        })
    return {'width': width, 'policy': policy, 'cohorts': result,
            'functionalExpiryFloorMs': sum(c['expiryWaitFloorMs'] for c in result),
            'observationOnlyFloorMs': 121000 + sum(c['expiryWaitFloorMs'] for c in result),
            'allBranchesEnumerated': False, 'actualTimingMeasured': False,
            'runtimeFit': False, 'launchAuthorizedByThisArtifact': False}


def validate(candidate):
    seen, slots, case_cohort = set(), set(), {}
    for c in candidate['cohorts']:
        assert 0 < len(c['branches']) <= candidate['width']
        assert c['branchCount'] == len(c['branches'])
        assert c['caseIds'] == list(dict.fromkeys(j['caseId'] for j in c['branches']))
        for j in c['branches']:
            key = j['branchId']
            assert key in source and key not in seen, 'Exact disjoint reference branch union'
            seen.add(key)
            expected = source[key]
            for f in ['caseId', 'path', 'minimumActualExpiryMs']:
                assert j[f] == expected[f], 'Do not erase a path or its actual expiry'
            for f in ['namespaceSlot', 'mutableStoreSlot', 'credentialSlot']:
                assert j[f] not in slots, 'No mutable-state or credential slot alias'
                slots.add(j[f])
            assert j['workloadBirthsRequired'] == 2
            assert j['freshRestoredGetRequired'] and j['usefulSuccessorRequired']
            assert j['recoveryEpochSlot'] == 'cohort-%d/new-OS-service' % c['cohort']
            prior = case_cohort.setdefault(j['caseId'], c['cohort'])
            assert prior == c['cohort'], 'Owning body must remain indivisible'
        assert c['expiryWaitFloorMs'] == max(j['minimumActualExpiryMs'] for j in c['branches'])
        for f in ['measuredPrepareMs', 'measuredRecoveryEpochMs',
                  'measuredOwningCallbacksMs', 'measuredRawAndTeardownMs']:
            assert c[f] is None, 'This static artifact supplies no elapsed measurements'
    assert seen == set(source), 'Missing reference branch'
    total = sum(c['expiryWaitFloorMs'] for c in candidate['cohorts'])
    assert candidate['functionalExpiryFloorMs'] == total
    assert candidate['observationOnlyFloorMs'] == total + 121000
    assert candidate['allBranchesEnumerated'] is False
    assert candidate['actualTimingMeasured'] is False
    assert candidate['runtimeFit'] is False
    assert candidate['launchAuthorizedByThisArtifact'] is False


def model():
    candidates = [assign(w, policy) for policy in ['inventory-order', 'expiry-first']
                  for w in [4, 8, 16, 32, 64]]
    for c in candidates:
        validate(c)
    probes = []
    def reject(label, mutate):
        c = copy.deepcopy(candidates[-1])
        mutate(c)
        try:
            validate(c)
        except AssertionError:
            probes.append(label)
        else:
            raise AssertionError('Design audit failed to reject ' + label)
    reject('missing-branch', lambda c: c['cohorts'][0]['branches'].pop())
    reject('duplicated-branch', lambda c: c['cohorts'][0]['branches'].__setitem__(1, copy.deepcopy(c['cohorts'][0]['branches'][0])))
    reject('erased-expiry', lambda c: next(j for g in c['cohorts'] for j in g['branches'] if j['minimumActualExpiryMs']).__setitem__('minimumActualExpiryMs', 0))
    reject('wrong-path', lambda c: c['cohorts'][0]['branches'][0].__setitem__('path', 'stopped-original-stop-task'))
    reject('credential-alias', lambda c: c['cohorts'][0]['branches'][1].__setitem__('credentialSlot', c['cohorts'][0]['branches'][0]['credentialSlot']))
    reject('store-alias', lambda c: c['cohorts'][0]['branches'][1].__setitem__('mutableStoreSlot', c['cohorts'][0]['branches'][0]['mutableStoreSlot']))
    reject('fake-object-restart', lambda c: c['cohorts'][0]['branches'][0].__setitem__('recoveryEpochSlot', 'old-service/new-object'))
    reject('reused-recovery-get', lambda c: c['cohorts'][0]['branches'][0].__setitem__('freshRestoredGetRequired', False))
    reject('missing-useful-successor', lambda c: c['cohorts'][0]['branches'][0].__setitem__('usefulSuccessorRequired', False))
    reject('invented-measurement', lambda c: c['cohorts'][0].__setitem__('measuredPrepareMs', 0))
    reject('static-fit-claim', lambda c: c.__setitem__('runtimeFit', True))
    reject('false-complete-denominator', lambda c: c.__setitem__('allBranchesEnumerated', True))
    return {'kind': 'static-cohort-design-only', 'acceptance': False,
            'reference': {'path': str(reference.relative_to(ROOT)), 'sha256': sha(reference)},
            'referenceCases': len(by_case), 'referenceBranches': len(journeys),
            'referenceIsCompleteWorkload': False,
            'serialObservationFloorMs': 121000, 'continuationOuterMs': 300000,
            'unaccountedWork': ['all additional state/order/COMMIT branches',
                'turn38 nonmatrix branches', 'turn39 cancellation variants',
                'CO01-CO06 actual namespace/collector probes',
                'build/other suites/authority R20/raw/census/cleanup',
                'all actual service/actor/issue/GET/successor resource and elapsed costs'],
            'candidates': candidates, 'staticMutationsRejected': probes,
            'selectedWidth': None, 'complete': False, 'runtimeFit': False,
            'productionChanged': False, 'actualProcessesLaunched': 0}


if __name__ == '__main__':
    assert len(sys.argv) == 2, 'Supply a new output path; never overwrite evidence'
    out = Path(sys.argv[1]).resolve()
    assert out.parent == HERE and not out.exists()
    data = model()
    out.write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps({'artifact': str(out.relative_to(ROOT)),
        'referenceBranches': data['referenceBranches'],
        'rejectedStaticMutations': len(data['staticMutationsRejected']),
        'cohortsAndObservationFloors': [{
            'width': c['width'], 'policy': c['policy'], 'cohorts': len(c['cohorts']),
            'waitFloorSeconds': c['observationOnlyFloorMs'] / 1000,
            'exceedsContinuationOnWaitsAlone': c['observationOnlyFloorMs'] > 300000,
        } for c in data['candidates']], 'runtimeFit': False}))
