import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import subprocess

out = pathlib.Path('docs/loop/agent-fabric-g1-f05-storage/readiness-turn43')
commands = [
    ['node', '--version'], ['pnpm', '--version'],
    ['node', 'g1-storage/node_modules/typescript/bin/tsc', '--version'],
    ['docker', 'version', '--format', '{{json .}}'],
    ['docker', 'info', '--format', '{{json .NCPU}} {{json .MemTotal}} {{json .OperatingSystem}}'],
    ['docker', 'image', 'inspect', 'postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333', '--format', '{{.Id}} {{.Os}} {{.Architecture}}'],
    ['docker', 'ps', '-a', '--filter', 'label=agent-fabric.storage-fixture-owner', '--format', '{{.ID}}'],
    ['df', '-h', '.', '/private/tmp'],
    ['.loop/bin/loop', 'audit'], ['.loop/bin/loop', 'status', '--json'],
]
def probe(pair):
    i, command = pair
    observed = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, capture_output=True, timeout=20)
    record = {'command': command, 'time': observed, 'exitCode': result.returncode}
    for name in ['stdout', 'stderr']:
        data = getattr(result, name)
        path = out / f'probe-{i:02d}.{name}.log'
        with path.open('xb') as f: f.write(data)
        record[name] = {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records = list(pool.map(probe, enumerate(commands)))
# Reuse the unchanged ownership-marked primitive probe. Its historical marker
# label remains readiness38; these new streams/time attest the actual fresh run.
records.append(probe((len(commands), ['node', 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn38/probe.mjs'])))
with (out / 'probes.json').open('x') as f:
    json.dump({'schemaVersion': 1, 'assurance': 'resource-readiness-only', 'results': records}, f, indent=2)
    f.write('\n')
assert all(r['exitCode'] == 0 for r in records)
print(json.dumps({'commands': len(records), 'allExitZero': True, 'resourceOnly': True}))
