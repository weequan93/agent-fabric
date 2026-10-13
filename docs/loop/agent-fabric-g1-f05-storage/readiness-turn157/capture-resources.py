from pathlib import Path
import hashlib,json,subprocess,time,shutil

root=Path.cwd(); here=root/'docs/loop/agent-fabric-g1-f05-storage/readiness-turn157'
def read(p):return json.loads((root/p).read_bytes())
def bind(p):
 b=(root/p).read_bytes();return {'path':str(p),'bytes':len(b),'sha256':'sha256:'+hashlib.sha256(b).hexdigest()}
def save(name,value): (here/name).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
state=read('.loop/goals/agent-fabric-g1-f05-storage/state.json'); goal=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json')
plan=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn155/plan-after.json')
keys=['id','title','detail','covers','depends_on','role','team','checks','status']
assert [{k:t[k] for k in keys} for t in state['tasks']]==[{k:t[k] for k in keys} for t in plan['tasks']]
assert state['requirements']==plan['requirements']
assert len(state['tasks'])==70 and sum(len(t['checks']) for t in state['tasks'])==126
assert sum(t['status']=='done' for t in state['tasks'])==47 and len(state['requirements'])==96
assert goal['policy']['max_iterations'] is None and goal['policy']['max_hours'] is None
assert all(t['team']==[] for t in state['tasks'])
prior='docs/loop/agent-fabric-g1-f05-storage/readiness.md'
if not (here/'readiness-before.md').exists():shutil.copyfile(root/prior,here/'readiness-before.md')
definition={'tasks':state['tasks'],'requirements':state['requirements'],'acceptance':goal['acceptance'],'policy':goal['policy'],'agent':goal['agent']}
save('current-definitions.json',definition)
previous={t['id']:t for t in read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn152/task-resource-allocation.json')}
source_map=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn155/source-map.json')
pending_paths=[p['path'] for p in source_map['pendingDocsSources']]
assert len(pending_paths)==5 and all(not (root/p).exists() for p in pending_paths)
allocation=[]
for task in state['tasks']:
 old=previous.get(task['id']); item={k:task[k] for k in keys if k!='checks'}
 item.update(engineeringEstimateMinutes=old['engineeringEstimateMinutes'] if old else 75,resources=old['resources'] if old else ['Native module.register/ESM exact emitted-helper imports; transparent admin query/publish/close observations pending implementation','Original owned loopback PG/IdP/current authority/accounting; one unchanged full lifecycle via controller1800s','Owned append-only full diagnostic streams, census decoder and ownership-checked cleanup'],maxProvisionedPGContainers=old['maxProvisionedPGContainers'] if old else 4)
 item['checks']=[]
 for c in task['checks']:
  prior_check=next((x for x in old['checks'] if x['id']==c['id']),None) if old else None
  paths=[b['path'] for b in prior_check['sourceBindings']] if prior_check else [c['run'].split()[1]]
  if task['id']=='f05-11-maintenance-failure-capture' and c['id']!='original-maintenance-failure-still-refused':paths=list(dict.fromkeys(paths+pending_paths))
  entry=dict(c,sourceBindings=[bind(p) if (root/p).exists() else {'path':p,'status':'pending implementation after resources + independent review','owner':task['id']} for p in paths],outputOwner=prior_check['outputOwner'] if prior_check else task['id'],fullstreamOwner=task['id'],cleanupOwner=task['id'],fullstreamAllocation='.loop/goals/agent-fabric-g1-f05-storage/runs/checks/<fresh-job>/'+task['id']+'.'+c['id']+'/{stdout,stderr}.log plus byte-exact owned docs attempt streams and diagnostics; freeze source hashes before capture')
  item['checks'].append(entry)
 allocation.append(item)
save('task-resource-allocation.json',allocation)
inputs=read('docs/loop/agent-fabric-g1-f05-storage/readiness-turn152/input-bindings.json')
paths=list(dict.fromkeys([b['path'] for b in inputs['sources']+inputs['contexts']]+[b['path'] for b in source_map['originalInputBindings']]+['docs/loop/agent-fabric-g1-f05-storage/develop-turn155/capture-plan.md','docs/loop/agent-fabric-g1-f05-storage/develop-turn155/source-map.json','docs/loop/agent-fabric-g1-f05-storage/develop-turn155/plan-amendment.json','g1-storage/scripts/check-slice.mjs','g1-storage/scripts/recovery/ownership.mjs','g1-storage/scripts/recovery/cleanup.mjs']))
save('input-bindings.json',{'historicalReadiness':bind(str((here/'readiness-before.md').relative_to(root))),'inputs':[bind(p) for p in paths if (root/p).exists()],'pendingSources':source_map['pendingDocsSources']})
seals=[]
for directory in ['readiness-turn152','develop-turn154','develop-turn155']:
 seal=read('docs/loop/agent-fabric-g1-f05-storage/'+directory+'/step-seal.json')
 for b in seal['files']:assert bind(b['path'])==b
 seals.append({'directory':directory,'entries':len(seal['files']),'exact':True})
for b in source_map['originalInputBindings']:assert bind(b['path'])==b
save('definition-audit.json',{'tasks':70,'checks':126,'requirements':96,'done':47,'unfinished':23,'liveAndAmendedPlanExact':True,'all70TeamsEmpty':True,'delegatedSeats':0,'maxIterations':None,'maxHours':None,'capacityGate':False,'pendingDocsSources':source_map['pendingDocsSources'],'seals':seals,'originalInputsExact':True,'implementationPerformed':False,'lifecycleExecuted':False,'productQualification':False})
commands={
 'node':['node','--version'],'pnpm':['pnpm','--version'],'typescript':['node','g1-storage/node_modules/typescript/bin/tsc','--version'],
 'pg':['node','--input-type=module','-e',"import pg from './g1-storage/node_modules/pg/lib/index.js'; console.log(JSON.stringify({Client:typeof pg.Client,Pool:typeof pg.Pool,clientQuery:typeof pg.Client.prototype.query,poolQuery:typeof pg.Pool.prototype.query,poolConnect:typeof pg.Pool.prototype.connect}));"],
 'python':['python3','--version'],'docker':['docker','--version'],'docker-info':['docker','info','--format','{{json .ServerVersion}} {{json .NCPU}} {{json .MemTotal}}'],
 'cached-pg':['docker','image','inspect','postgres@sha256:c91180c6d82dbb6e7a99c0905d799ae88e22a3406ef7ef02a7defed5a2013333','--format','{{json .Id}} {{json .RepoDigests}}'],
 'disk':['df','-k','.','/private/tmp'],'cpu':['sysctl','-n','hw.ncpu','hw.memsize'],'process-census':['ps','-axo','pid=,ppid=,comm='],
 'candidate':['node','--input-type=module','-e',"import {candidateSnapshot} from './g1-storage/scripts/candidate.mjs'; console.log(JSON.stringify(candidateSnapshot()));"],
 'preservation':['node','--input-type=module','-e',"import {assertBaseline} from './g1-storage/scripts/guards.mjs'; import {assertExecutionPreservation} from './g1-storage/scripts/execution-preservation.mjs'; assertBaseline(); console.log(JSON.stringify(assertExecutionPreservation()));"],
 'retained-failure':['node','docs/loop/agent-fabric-g1-f05-storage/develop-turn150/check-retained-failure.mjs']}
probes=[]
for name,argv in commands.items():
 start=time.monotonic()
 try:r=subprocess.run(argv,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
 except OSError as e:r=subprocess.CompletedProcess(argv,126,b'',str(e).encode())
 for channel,raw in [('stdout',r.stdout),('stderr',r.stderr)]:(here/(name+'.'+channel+'.log')).write_bytes(raw)
 probes.append({'name':name,'argv':argv,'exit':r.returncode,'elapsedMs':round((time.monotonic()-start)*1000),'streams':{c:bind(str((here/(name+'.'+c+'.log')).relative_to(root))) for c in ['stdout','stderr']}})
save('resource-probes.json',probes)
assert all(p['exit']==0 for p in probes if p['name'] not in ['cpu','process-census'])
assert read(str((here/'candidate.stdout.log').relative_to(root)))==source_map['candidate']
print(json.dumps({'tasks':70,'checks':126,'done':47,'pendingDocsSources':5,'seals':seals,'probes':len(probes),'failures':[p for p in probes if p['exit']!=0]}))
