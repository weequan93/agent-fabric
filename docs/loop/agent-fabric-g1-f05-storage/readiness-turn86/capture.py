"""Bounded resource probes and immutable snapshots; no controller writes."""
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[3]
PREFIX = str(BASE.relative_to(ROOT))

def binding(path):
    raw = (ROOT / path).read_bytes()
    return {'path': path, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

def write(name, value):
    (BASE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def capture(name, argv, timeout=15):
    start = datetime.now(timezone.utc).isoformat()
    tick = time.monotonic()
    result = subprocess.run(argv, cwd=ROOT, capture_output=True, timeout=timeout)
    streams = []
    for channel in ['stdout', 'stderr']:
        (BASE / (name + '.' + channel + '.log')).write_bytes(getattr(result, channel))
        streams.append(binding(PREFIX + '/' + name + '.' + channel + '.log'))
    return {'name': name, 'argv': argv, 'timeoutSeconds': timeout, 'startedAt': start,
            'elapsedMs': (time.monotonic()-tick)*1000, 'exitCode': result.returncode,
            'streams': streams, 'qualification': 'resource observation only'}

if __name__ == '__main__':
    state = json.loads((ROOT / '.loop/goals/agent-fabric-g1-f05-storage/state.json').read_text())
    goal = json.loads((ROOT / '.loop/goals/agent-fabric-g1-f05-storage/goal.json').read_text())
    write('controller-before.json', state)
    write('goal-before.json', goal)
    # Preserve the previous readiness bytes and snapshot all earlier bound files.
    prior = ROOT / 'docs/loop/agent-fabric-g1-f05-storage/readiness.md'
    preserved = BASE / 'readiness-turn56-preserved.md'
    if preserved.exists():
        raise RuntimeError('Never overwrite a prior capture')
    preserved.write_bytes(prior.read_bytes())
    old = json.loads((ROOT / 'docs/loop/agent-fabric-g1-f05-storage/plan-turn85/preservation-before.json').read_text())
    paths = set(old['files'])
    paths.update(str(p.relative_to(ROOT)) for p in (ROOT / 'docs/loop/agent-fabric-g1-f05-storage/plan-turn85').iterdir() if p.is_file())
    paths.update(['docs/planning/g1-f05-task-plan-v4.json', 'docs/planning/g1-f05-atomic-disconnect-v1.md'])
    write('preservation-before.json', {'files': [binding(p) for p in sorted(paths)],
                                      'protectedFiles': old['protectedFiles']})
    probes = [
        ('plan-audit', ['python3','docs/loop/agent-fabric-g1-f05-storage/plan-turn85/audit.py'], 30),
        ('node', ['node','--version'], 5),
        ('pnpm', ['pnpm','--version'], 5),
        ('typescript', ['node','g1-storage/node_modules/typescript/bin/tsc','--version'], 5),
        ('docker-version', ['docker','version','--format','{{json .}}'], 15),
        ('docker-info', ['docker','info','--format','{{json .}}'], 15),
        ('cached-image', ['docker','image','inspect','postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333'], 15),
        ('disk', ['df','-h','.','/private/tmp'], 5),
        ('controller-audit', ['.loop/bin/loop','audit'], 15),
        ('primitives', ['node','docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/primitives.mjs'], 15),
    ]
    results = [capture(*p) for p in probes]
    write('probes.json', results)
    print(json.dumps([{'name':p['name'],'exitCode':p['exitCode'],'elapsedMs':round(p['elapsedMs'])} for p in results]))
