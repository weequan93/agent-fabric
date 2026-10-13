"""Bounded resource observations, never product implementation or qualification."""
import hashlib,json,subprocess,time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[3]
PREFIX=str(BASE.relative_to(ROOT))
def read(p):return json.loads((ROOT/p).read_text())
def binding(p):
 b=(ROOT/p).read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def write(n,v):
 p=BASE/n;assert not p.exists(),p;p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def capture(name,argv,timeout=15):
 tick=time.monotonic();started=datetime.now(timezone.utc).isoformat()
 p=subprocess.run(argv,cwd=ROOT,capture_output=True,timeout=timeout)
 streams=[]
 for channel in ['stdout','stderr']:
  target=BASE/(name+'.'+channel+'.log');assert not target.exists();target.write_bytes(getattr(p,channel));streams.append(binding(str(target.relative_to(ROOT))))
 return {'name':name,'argv':argv,'timeoutSeconds':timeout,'startedAt':started,'elapsedMs':(time.monotonic()-tick)*1000,'exitCode':p.returncode,'streams':streams,'qualification':'Resource availability only; no product acceptance'}
if __name__=='__main__':
 state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
 write('controller-before.json',state);write('goal-before.json',goal)
 report=BASE.parent/'readiness.md';(BASE/'readiness-turn106-preserved.md').write_bytes(report.read_bytes())
 paths=set(read('g1-storage/verification/preserved-inputs.json')['files'])
 for folder in ['g1-storage','docs/loop/agent-fabric-g1-f05-storage']:
  paths.update(str(p.relative_to(ROOT)) for p in (ROOT/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts and BASE not in p.parents)
 paths.update(['docs/planning/'+n for n in ['roadmap.md','g1-foundations-plan.md','g1-remaining-ledger.csv','g1-f05-plan.md']])
 paths.update(['docs/Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md','docs/evidence/g1-f02-acceptance.md','g1-identity/scripts/check.mjs'])
 write('preservation-before.json',{'files':[binding(p) for p in sorted(paths)]})
 keys=['id','title','detail','covers','depends_on','role','team','checks']
 write('current-plan.json',{'tasks':[{k:t[k] for k in keys} for t in state['tasks']],'requirements':state['requirements']})
 probes=[('python',['python3','--version'],5),('node',['node','--version'],5),('pnpm',['pnpm','--version'],5),('typescript',['node','g1-storage/node_modules/typescript/bin/tsc','--version'],5),('docker-version',['docker','version','--format','{{json .}}'],15),('docker-info',['docker','info','--format','{{json .}}'],15),('cached-image',['docker','image','inspect','postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333'],15),('disk',['df','-h','.','/private/tmp'],5),('controller-audit',['.loop/bin/loop','audit'],15),('primitives',['node','docs/loop/agent-fabric-g1-f05-storage/readiness-turn86/primitives.mjs'],15),('native-codec',['node',PREFIX+'/native-codec.mjs'],20),('preservation',['node',PREFIX+'/preservation.mjs'],20)]
 with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda p:capture(*p),probes))
 write('probes.json',results)
 print(json.dumps([{k:p[k] for k in ['name','exitCode','elapsedMs']} for p in results]))
