"""Bounded local resource observations only; never edit controller or product files."""
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


def read(path):
    return json.loads((ROOT / path).read_text())


def binding(path):
    raw = (ROOT / path).read_bytes()
    return {"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def write(name, value):
    target = BASE / name
    assert not target.exists(), target
    target.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def capture(name, argv, timeout=15):
    started = datetime.now(timezone.utc).isoformat()
    tick = time.monotonic()
    result = subprocess.run(argv, cwd=ROOT, capture_output=True, timeout=timeout)
    streams = []
    for channel in ["stdout", "stderr"]:
        target = BASE / (name + "." + channel + ".log")
        assert not target.exists(), target
        target.write_bytes(getattr(result, channel))
        streams.append(binding(str(target.relative_to(ROOT))))
    return {"name": name, "argv": argv, "timeoutSeconds": timeout,
            "startedAt": started, "elapsedMs": (time.monotonic() - tick) * 1000,
            "exitCode": result.returncode, "streams": streams,
            "qualification": "Resource availability only; not F05 acceptance"}


if __name__ == "__main__":
    write("controller-before.json", read(".loop/goals/agent-fabric-g1-f05-storage/state.json"))
    write("goal-before.json", read(".loop/goals/agent-fabric-g1-f05-storage/goal.json"))
    previous = ROOT / "docs/loop/agent-fabric-g1-f05-storage/readiness.md"
    (BASE / "readiness-turn89-preserved.md").write_bytes(previous.read_bytes())
    paths = set(read("docs/loop/agent-fabric-g1-f05-storage/plan-turn98/preserved-inputs.json")["files"])
    for folder in ["readiness-turn89", "plan-turn98"]:
        paths.update(str(p.relative_to(ROOT)) for p in (BASE.parent / folder).rglob("*")
                     if p.is_file() and "__pycache__" not in p.parts)
    write("preservation-before.json", {"files": [binding(p) for p in sorted(paths)]})
    paths = {b["path"] for b in read("docs/loop/agent-fabric-g1-f05-storage/readiness-turn89/inputs.json")}
    paths.update(str(p.relative_to(ROOT)) for p in (BASE.parent / "plan-turn98").iterdir() if p.is_file())
    paths.update(["docs/planning/g1-f05-plan.md", "g1-storage/tests/lifecycle-propagation.test.ts",
                  "g1-storage/tests/volume-draft.test.ts", "g1-storage/tests/recall-ask.test.ts",
                  "g1-storage/tests/backup-restore.test.ts",
                  "docs/loop/agent-fabric-g1-f05-storage/readiness-turn56/container-envelope.mjs",
                  "docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/primitives.mjs"])
    write("inputs.json", [binding(p) for p in sorted(paths)])
    probes = [
        ("python", ["python3", "--version"], 5),
        ("node", ["node", "--version"], 5),
        ("pnpm", ["pnpm", "--version"], 5),
        ("typescript", ["node", "g1-storage/node_modules/typescript/bin/tsc", "--version"], 5),
        ("docker-version", ["docker", "version", "--format", "{{json .}}"], 15),
        ("docker-info", ["docker", "info", "--format", "{{json .}}"], 15),
        ("cached-image", ["docker", "image", "inspect", "postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333"], 15),
        ("disk", ["df", "-h", ".", "/private/tmp"], 5),
        ("controller-audit", [".loop/bin/loop", "audit"], 15),
        ("primitives", ["node", "docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/primitives.mjs"], 15),
        ("current-plan-audit", ["python3", "docs/loop/agent-fabric-g1-f05-storage/plan-turn98/audit.py"], 30),
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda p: capture(*p), probes))
    write("probes.json", results)
    print(json.dumps([{k: p[k] for k in ["name", "exitCode", "elapsedMs"]} for p in results]))
