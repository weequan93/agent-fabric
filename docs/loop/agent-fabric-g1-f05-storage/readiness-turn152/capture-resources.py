from pathlib import Path
import json, hashlib, subprocess, time, shutil

root = Path.cwd()
here = root / 'docs/loop/agent-fabric-g1-f05-storage/readiness-turn152'
def digest(raw): return 'sha256:' + hashlib.sha256(raw).hexdigest()
def binding(path):
    raw = (root / path).read_bytes()
    return {'path': path, 'bytes': len(raw), 'sha256': digest(raw)}
state = json.loads((root / '.loop/goals/agent-fabric-g1-f05-storage/state.json').read_bytes())
goal = json.loads((root / '.loop/goals/agent-fabric-g1-f05-storage/goal.json').read_bytes())
old_path = 'docs/loop/agent-fabric-g1-f05-storage/readiness.md'
if not (here / 'readiness-before.md').exists(): shutil.copyfile(root / old_path, here / 'readiness-before.md')
tasks = state['tasks']
assert len(tasks) == 69 and sum(t['status'] == 'done' for t in tasks) == 46
assert sum(len(t['checks']) for t in tasks) == 123 and len(state['requirements']) == 96
assert all(t['team'] == [] for t in tasks)
assert goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None
previous = {t['id']: t for t in json.loads((root / 'docs/loop/agent-fabric-g1-f05-storage/develop-turn146/task-resource-allocation.json').read_bytes())}
allocation = []
for task in tasks:
    item = {k: task[k] for k in ['id','title','detail','covers','depends_on','role','team','status']}
    old = previous.get(task['id'])
    item.update(engineeringEstimateMinutes=65 if old is None else old['engineeringEstimateMinutes'],
                resources=['Offline pinned Node/pg/TypeScript; original owned loopback PG fixture; native fullstream capture; unchanged current authority owners'] if old is None else old['resources'],
                maxProvisionedPGContainers=1 if old is None else old['maxProvisionedPGContainers'])
    item['checks'] = []
    for check in task['checks']:
        current = dict(check)
        prior = next((c for c in old['checks'] if c['id'] == check['id']), None) if old else None
        paths = [b['path'] for b in prior['sourceBindings']] if prior else [check['run'].split()[1]]
        current['sourceBindings'] = [binding(p) if (root/p).exists() else {'path':p,'status':'pending implementation','owner':task['id']} for p in paths]
        current['outputOwner'] = prior['outputOwner'] if prior else task['id']
        current['missingOutputOwner'] = (prior.get('missingOutputOwner') or task['id']) if prior and any(not (root/p).exists() for p in paths) else (task['id'] if any(not (root/p).exists() for p in paths) else None)
        current['missingIsImplementationOutput'] = current['missingOutputOwner'] is not None
        current['fullstreamOwner'] = task['id']
        current['fullstreamAllocation'] = '.loop/goals/agent-fabric-g1-f05-storage/runs/checks/<fresh-job>/' + task['id'] + '.' + check['id'] + '/{stdout,stderr}.log; byte-exact additive docs attempt copies and SHA256 inventory'
        item['checks'].append(current)
    allocation.append(item)
source_paths = ['g1-storage/scripts/fixture.mjs','g1-storage/scripts/build.mjs','g1-storage/scripts/paths.mjs','g1-storage/scripts/guards.mjs','g1-storage/scripts/dependencies.mjs','g1-storage/tests/helpers/pg-fixture.ts','g1-storage/tests/helpers/maintenance-verification-fixture.ts','g1-storage/tests/helpers/register-maintenance-verification-tests.ts','g1-storage/tests/helpers/accounting-fixture.ts','g1-storage/tests/helpers/authority-fixture.ts','g1-storage/src/maintenance-builders.ts','g1-storage/src/resource-composition.ts','g1-storage/src/migration.ts','g1-storage/src/owners.ts','g1-storage/scripts/full-registration.mjs','g1-storage/scripts/full-composition.mjs','g1-storage/scripts/process-result.mjs','g1-storage/scripts/observation-gate.mjs']
context_paths = ['docs/planning/roadmap.md','docs/planning/g1-foundations-plan.md','docs/planning/g1-remaining-ledger.csv','docs/Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md','docs/evidence/g1-f02-acceptance.md','docs/loop/agent-fabric-g1-f05-storage/product-brief.md','docs/loop/agent-fabric-g1-f05-storage/solution.md','docs/loop/agent-fabric-g1-f05-storage/test-plan.md','docs/loop/agent-fabric-g1-f05-storage/develop-turn150/investigation-proposal.md','docs/loop/agent-fabric-g1-f05-storage/develop-turn150/diagnosis.json','docs/loop/agent-fabric-g1-f05-storage/develop-turn150/official-attempt.json','docs/loop/agent-fabric-g1-f05-storage/develop-turn141/resources.md']
definition = {'tasks':tasks,'requirements':state['requirements'],'acceptance':goal['acceptance'],'policy':goal['policy']}
(here/'current-definitions.json').write_text(json.dumps(definition,indent=2)+'\n')
(here/'task-resource-allocation.json').write_text(json.dumps(allocation,indent=2)+'\n')
(here/'input-bindings.json').write_text(json.dumps({'historicalReadiness':binding(old_path),'sources':[binding(p) for p in source_paths],'contexts':[binding(p) for p in context_paths]},indent=2)+'\n')
commands = {
 'node':['node','--version'], 'pnpm':['pnpm','--version'], 'typescript':['node','g1-storage/node_modules/typescript/bin/tsc','--version'],
 'pg':['node','--input-type=module','-e',"import pg from './g1-storage/node_modules/pg/lib/index.js'; import {createRequire} from 'node:module'; const require=createRequire(import.meta.url); console.log(JSON.stringify({version:require('./g1-storage/node_modules/pg/package.json').version,Client:typeof pg.Client,Pool:typeof pg.Pool}));"],
 'python':['python3','--version'], 'docker':['docker','--version'],
 'docker-info':['docker','info','--format','{{json .ServerVersion}} {{json .NCPU}} {{json .MemTotal}}'],
 'cached-pg':['docker','image','inspect','postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333','--format','{{json .Id}} {{json .RepoDigests}}'],
 'disk':['df','-k','.','/private/tmp'], 'cpu':['sysctl','-n','hw.ncpu','hw.memsize'],
 'process-census':['ps','-axo','pid=,ppid=,comm='],
 'candidate':['node','--input-type=module','-e',"import {candidateSnapshot} from './g1-storage/scripts/candidate.mjs'; console.log(JSON.stringify(candidateSnapshot()));"],
 'preserved':['node','--input-type=module','-e',"import {assertBaseline} from './g1-storage/scripts/guards.mjs'; assertBaseline();"]}
probes=[]
for name,argv in commands.items():
    start=time.monotonic()
    try:
        r=subprocess.run(argv,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    except OSError as error:
        r=subprocess.CompletedProcess(argv,126,b'',str(error).encode())
    for channel,raw in [('stdout',r.stdout),('stderr',r.stderr)]: (here/(name+'.'+channel+'.log')).write_bytes(raw)
    probes.append({'name':name,'argv':argv,'exit':r.returncode,'elapsedMs':round((time.monotonic()-start)*1000),'streams':{c:binding(str((here/(name+'.'+c+'.log')).relative_to(root))) for c in ['stdout','stderr']}})
(here/'resource-probes.json').write_text(json.dumps(probes,indent=2)+'\n')
assert all(p['exit']==0 for p in probes if p['name'] not in ['process-census','cpu'])
assert json.loads((here/'candidate.stdout.log').read_text())=={'digest':'sha256:179e0d045adfdbadd9ae8f0af6ceeffe141ed17f7ec1fa390709fddda5b8e0d7','files':1132}
print(json.dumps({'tasks':69,'checks':123,'requirements':96,'done':46,'unfinished':23,'emptyTeams':69,'capacityGate':False,'sourceBindings':sum(len(c['sourceBindings']) for t in allocation for c in t['checks']),'resourceProbes':len(probes),'allPassed':all(p['exit']==0 for p in probes),'sandboxCensusFailureRetained':True}))
