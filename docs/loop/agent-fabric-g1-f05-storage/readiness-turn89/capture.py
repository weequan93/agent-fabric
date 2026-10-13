"""Fresh bounded local resource probes; never modify the prior evidence package."""
import hashlib
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
PREFIX = str(BASE.relative_to(ROOT))
REPORT = 'docs/loop/agent-fabric-g1-f05-storage/readiness.md'
read = lambda p: json.loads((ROOT / p).read_text())

def binding(p):
    raw = (ROOT / p).read_bytes()
    return {'path': p, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

def write(name, value):
    (BASE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def capture(name, argv, timeout=15):
    started = datetime.now(timezone.utc).isoformat()
    tick = time.monotonic()
    result = subprocess.run(argv, cwd=ROOT, capture_output=True, timeout=timeout)
    streams = []
    for channel in ['stdout', 'stderr']:
        (BASE / (name + '.' + channel + '.log')).write_bytes(getattr(result, channel))
        streams.append(binding(PREFIX + '/' + name + '.' + channel + '.log'))
    return {'name': name, 'argv': argv, 'timeoutSeconds': timeout, 'startedAt': started,
            'elapsedMs': (time.monotonic() - tick) * 1000, 'exitCode': result.returncode,
            'streams': streams, 'qualification': 'resource observation only'}

if __name__ == '__main__':
    assert not (BASE / 'controller-before.json').exists(), 'Never overwrite an earlier capture'
    write('controller-before.json', read('.loop/goals/agent-fabric-g1-f05-storage/state.json'))
    write('goal-before.json', read('.loop/goals/agent-fabric-g1-f05-storage/goal.json'))
    (BASE / 'readiness-turn86-preserved.md').write_bytes((ROOT / REPORT).read_bytes())
    old = read('docs/loop/agent-fabric-g1-f05-storage/plan-turn88/preservation-before.json')
    paths = set(old['files'])
    for folder in ['readiness-turn86', 'plan-turn88']:
        paths.update(str(p.relative_to(ROOT)) for p in (BASE.parent / folder).rglob('*')
                     if p.is_file() and '__pycache__' not in p.parts)
    paths.update(['docs/planning/g1-f05-task-plan-v5.json',
                  'docs/planning/g1-f05-atomic-disconnect-v2.md'])
    write('preservation-before.json', {'files': [binding(p) for p in sorted(paths)],
                                      'protectedFiles': old['protectedFiles']})
    probes = [
        ('python', ['python3', '--version'], 5),
        ('node', ['node', '--version'], 5),
        ('pnpm', ['pnpm', '--version'], 5),
        ('typescript', ['node', 'g1-storage/node_modules/typescript/bin/tsc', '--version'], 5),
        ('docker-version', ['docker', 'version', '--format', '{{json .}}'], 15),
        ('docker-info', ['docker', 'info', '--format', '{{json .}}'], 15),
        ('cached-image', ['docker', 'image', 'inspect', 'postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333'], 15),
        ('disk', ['df', '-h', '.', '/private/tmp'], 5),
        ('controller-audit', ['.loop/bin/loop', 'audit'], 15),
        ('primitives', ['node', 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/primitives.mjs'], 15),
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda p: capture(*p), probes))
    write('probes.json', results)
    envelope = capture('four-container-envelope', ['node', 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/container-envelope.mjs'], 60)
    write('envelope-probe.json', envelope)
    missing = [capture('missing-repeat-component', ['node', 'g1-storage/scripts/check-component.mjs', 'verify-atomic-disconnect'], 5),
               capture('missing-repeat-slice', ['node', 'g1-storage/scripts/check-slice.mjs', 'atomic-disconnect'], 5)]
    write('missing-planned-gates.json', missing)
    print(json.dumps({'probes': [{k: p[k] for k in ['name', 'exitCode', 'elapsedMs']} for p in results],
                      'envelopeExit': envelope['exitCode'], 'missingGates': [p['exitCode'] for p in missing]}))
