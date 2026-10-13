import hashlib
import json
import pathlib
import re

root = pathlib.Path.cwd()
out = root / 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn56'
store = root / '.loop/goals/agent-fabric-g1-f05-storage'
state = json.loads((store / 'state.json').read_text())
ids = ['f05-01.strict-build', 'f05-04.source-content-component', 'acceptance.retained-baselines']
checks = {}
streams = []
summaries = {}
for check_id in ids:
    record = state['checks'][check_id]
    assert record['status'] == 'pass' and record['exit_code'] == 0
    assert 'job-1ec3525e01' in record['log']
    checks[check_id] = {k: v for k, v in record.items() if k != 'tail'}
    for name in ['stdout', 'stderr']:
        path = pathlib.Path(record['log']) / (name + '.log')
        data = (root / path).read_bytes()
        text = data.decode('utf-8')
        streams.append({'check': check_id, 'stream': name, 'path': str(path),
                        'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        assert not re.search(r'^# (fail|cancelled|skipped|todo) [1-9]', text, re.M)
        if name == 'stdout':
            summaries[check_id] = {'passCounts': re.findall(r'^# pass (\d+)$', text, re.M),
                                   'measurements': [json.loads(line) for line in text.splitlines()
                                                    if line.startswith('{') and '"measurement"' in line],
                                   'fullStreamRead': True}
        elif text:
            print(check_id + ' stderr: ' + text)
assert len({c['fingerprint'] for c in checks.values()}) == 1
result = {'schemaVersion': 1, 'purpose': 'resource-readiness only; no task completion or aggregate acceptance',
          'jobId': 'job-1ec3525e01', 'checks': checks, 'streams': streams, 'summaries': summaries}
with (out / 'controller-results.json').open('x') as f:
    json.dump(result, f, indent=2)
    f.write('\n')
print(json.dumps({'checks': {k: {'status': v['status'], 'durationMs': v['duration_ms'], 'fingerprint': v['fingerprint']} for k,v in checks.items()},
                  'streams': streams, 'passCounts': {k: v['passCounts'] for k,v in summaries.items()}}))
