"""Read-only audit of current resources, plan, retained failure and preservation chain."""
import json,re,hashlib,sys
from pathlib import Path
from capture import ROOT,BASE,PREFIX,read,write,binding
REPORT=str(BASE.parent.relative_to(ROOT))+'/readiness.md'
def verify(b,alternate=None):
 p=ROOT/(alternate or b['path']);assert p.is_file() and not p.is_symlink(),p;v=p.read_bytes();assert len(v)==b['bytes'] and hashlib.sha256(v).hexdigest()==b['sha256'].removeprefix('sha256:'),p

def bindings(v):
 if isinstance(v,dict):
  if all(k in v for k in ['path','bytes','sha256']):verify(v)
  for a in v.values():bindings(a)
 elif isinstance(v,list):
  for a in v:bindings(a)

def seal(folder,reportOverride=None):
 s=read(str(BASE.parent.relative_to(ROOT))+'/'+folder+('/submission-binding.json' if folder.startswith('readiness') else '/seal.json'))
 if 'readiness' in s:verify(s['readiness'],reportOverride)
 if isinstance(s['files'],dict):
  for p,b in s['files'].items():verify({**b,'path':str(BASE.parent.relative_to(ROOT))+'/'+folder+'/'+p})
 else:
  for b in s['files']:verify(b)

def lines(name):return [json.loads(l) for l in (BASE/name).read_text().splitlines()]
s=read('.loop/goals/agent-fabric-g1-f05-storage/state.json');g=read('.loop/goals/agent-fabric-g1-f05-storage/goal.json');keys=['id','title','detail','covers','depends_on','role','team','checks']
assert s['tasks']==read(PREFIX+'/controller-before.json')['tasks']==read(PREFIX+'/controller-observed.json')['tasks']
assert g==read(PREFIX+'/goal-before.json')==read(PREFIX+'/goal-observed.json')
plan=read(PREFIX+'/current-plan.json');assert plan['tasks']==[{k:t[k] for k in keys} for t in s['tasks']];assert plan['requirements']==s['requirements'];assert s['requirements_final']
assert (len(s['tasks']),sum(len(t['checks']) for t in s['tasks']),len(s['requirements']))==(66,113,96)
counts={x:sum(t['status']==x for t in s['tasks']) for x in ['done','pending','active']};assert counts=={'done':43,'pending':20,'active':3}
old=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/plan-before.json');tasks={t['id']:t for t in s['tasks']}
for t in old['tasks']:
 for k in keys:
  extra=['f05-11-receipt-boundaries'] if k=='depends_on' and t['id']=='f05-11-full-receipt-transport' else []
  assert tasks[t['id']][k]==(t[k]+extra if extra else t[k]),(t['id'],k)
 if t['status']=='done':assert tasks[t['id']]==t
assert s['requirements']==old['requirements'] and sum(len(t['checks']) for t in old['tasks'])==109
visited=set();active=set()
def visit(id):
 assert id in tasks and id not in active
 if id in visited:return
 active.add(id)
 for dep in tasks[id]['depends_on']:visit(dep)
 active.remove(id);visited.add(id)
for id in tasks:visit(id)
assert not ({r['id'] for r in s['requirements']}-{r for t in tasks.values() for r in t['covers']})
matrix={m[1]:m[3] for l in (BASE.parent/'test-plan.md').read_text().splitlines() if (m:=re.match(r'^\| (AF-07|UX-01|R-\d{3}) \| (must|should|could) \| (.*?) \|',l))}
assert len(matrix)==96
for r in s['requirements']:assert matrix[r['id']]==r['text']
protected=read('g1-storage/verification/preserved-inputs.json')['files'];assert len(protected)==2581
for p,d in protected.items():assert binding(p)['sha256']==d.removeprefix('sha256:')
for b in read(PREFIX+'/preservation-before.json')['files']:verify(b,PREFIX+'/readiness-turn112-preserved.md' if b['path']==REPORT else None)
seal('readiness-turn112',PREFIX+'/readiness-turn112-preserved.md');seal('develop-turn114');seal('develop-turn115')
for v in read(PREFIX+'/reuse-bindings.json'):bindings(v)
current=[]
for f in sorted((ROOT/'g1-storage').rglob('*')):
 if 'node_modules' in f.relative_to(ROOT/'g1-storage').parts:continue
 assert not f.is_symlink()
 if f.is_file():current.append([str(f.relative_to(ROOT/'g1-storage')),hashlib.sha256(f.read_bytes()).hexdigest()])
candidate={'files':len(current),'digest':'sha256:'+hashlib.sha256(json.dumps(current,separators=(',',':')).encode()).hexdigest()}
assert candidate==read('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/candidate.json')
proof=lines('preservation.stdout.log')[0];assert proof['candidate']==candidate and proof['predecessors']==[1113,1106,1103,1100] and proof['recoveryPins']==14 and not proof['productQualification']
allocation=read(PREFIX+'/task-resource-allocation.json');assert len(allocation)==66
for t in allocation:
 for k in keys:
  if k!='checks':assert t[k]==tasks[t['id']][k]
 assert t['status']==tasks[t['id']]['status'] and t['team']==[]
 for c,a in zip(t['checks'],tasks[t['id']]['checks']):
  for k,v in a.items():assert c[k]==v
  assert c['outputOwner'] in tasks
  if c['script']:assert c['scriptExists']==(ROOT/c['script']).exists()
  if c['sourceFile']:assert c['sourceFilePresent']==(ROOT/c['sourceFile']).exists()
  assert c['missingIsImplementationOutput']==any(c[k] is False for k in ['scriptExists','registryPresent','sourceFilePresent'])
  if c['missingIsImplementationOutput']:assert c['missingOutputOwner'] in tasks
  bindings(c['sourceBindings'])
assert sum(c['missingIsImplementationOutput'] for t in allocation for c in t['checks'])==20
chain=read(PREFIX+'/mandatory-repair-chain.json');assert [len(t['checks']) for t in chain]==[4,4,4,3]
assert [[c['timeout'] for c in t['checks']] for t in chain]==[[1800,900,120,900]]*3+[[1800,900,900]]
for i in range(1,4):assert chain[i-1]['id'] in chain[i]['depends_on']
scope=read(PREFIX+'/receipt-source-ownership.json');bindings(scope);assert len(scope['existingAuthorizedSources'])==5 and scope['engineeringMinutes']==sum(scope['breakdownMinutes'].values())==65 and not scope['missingResources']
cap=read(PREFIX+'/capacity-binding.json');bindings(cap);assert cap['workEstimateMinutes']==sum(t['engineeringEstimateMinutes'] for t in allocation if t['status']!='done')==1865
assert cap['pipelineTotalMinutes']==690 and cap['workAndPipelineEstimateMinutes']==2555
assert cap['policy']==g['policy'] and cap['policy']['max_iterations'] is None and cap['policy']['max_hours'] is None
assert cap['teamLimit']==g['agent'].get('team_limit',4)==4 and cap['maxDelegatedSeats']==0
assert cap['remainingTurns'] is None and cap['remainingHours'] is None and not cap['accountingReset']
assert cap['originalStartedAt']==s['started_at'] and cap['approvedDigest']==s['approved_digest'] and cap['usage']==read(PREFIX+'/controller-observed.json')['usage']
probes=read(PREFIX+'/probes.json');retry=read(PREFIX+'/probe-retries.json');assert len(probes)==15 and len(retry)==1
for p in probes+retry:assert p['elapsedMs']<p['timeoutSeconds']*1000;bindings(p['streams'])
assert [p['name'] for p in probes if p['exitCode']] == ['native-boundaries'];assert retry[0]['exitCode']==0
native=lines('native-codec.stdout.log')[0];assert native['nodeVersion']=='v22.22.3' and native['payloadBytes']==704053 and native['nativeStdoutBytes']>3000000 and native['orderedChunks']==230
assert native['nativeLegacyRejected'] and native['nativeBase64Exact'] and native['strictUtf8Refusals']==6 and native['noncanonicalBase64Refusals']==5 and native['closeAfterBothEnds'] and not native['productQualification']
assert (BASE/'native-retry/native-tap-reporter.js').read_bytes()==(BASE.parent/'develop-turn110/node-v22.22.3-tap-reporter.js').read_bytes()
for path,key in [('native-retry/native-tap-reporter.js','reporterDigest'),('native-retry/native-payload.json','payloadDigest'),('native-retry/native-child.stdout.log','nativeStdoutDigest')]:assert 'sha256:'+binding(PREFIX+'/'+path)['sha256']==native[key]
boundaries=lines('native-boundaries-retry.stdout.log')[0];assert boundaries['nativeSQLRawRejected'] and boundaries['nativeBase64SQLExact'] and boundaries['actualNativeMarkers']==400 and boundaries['actualSplitMarkers']>0 and boundaries['retainedSplitBytes']==[172,60] and not boundaries['productQualification']
assert 'sha256:'+binding(PREFIX+'/native-boundaries-retry/native-boundaries-child.stdout.log')['sha256']==boundaries['nativeStdoutDigest']
e=lines('five-container-envelope.stdout.log');env=next(x for x in e if x['measurement']=='five-concurrent-resource-envelope');assert len(env['ready'])==5
assert e[0]['preexistingContainers']==e[-1]['preexistingContainers']==[] and e[-1]['exactCensusUnchanged']
assert all(x['cpu']==1 and x['memoryBytes']==268435456 and x['pidsLimit']==128 and x['loopback'] and x['noBindMount'] for x in env['ready'])
clean=[x for x in e if x['measurement']=='resource-envelope-LIFO-cleanup'];assert [x['slot'] for x in clean]==['C','B','A','I','O'] and all(x['removed'] and x['exactCensusUnchanged'] and not Path(x['root']).exists() for x in clean)
e=lines('sequential-resource.stdout.log');seq=[x for x in e if x['measurement']=='sequential-resource-fresh-sql'];assert len(seq)==6
assert all(x['priorTableAbsent'] and x['ownCount']==1 and x['outerUnchanged'] and x['noResetOrParallelLifetime'] and x['peakContainers']==2 for x in seq)
assert e[0]['containers']==e[-1]['containers']==[] and e[-1]['exactCensus'] and len(e[-1]['identities'])==7
assert all(x['rootAbsent'] and x['exactCensus'] and x['owned'] and not Path(x['root']).exists() for x in e if x['measurement']=='sequential-resource-cleanup')
assert lines('primitives.stdout.log')[0]['census']['error']['code']=='EPERM';assert read(PREFIX+'/controller-audit.stdout.log')['ok'] and not read(PREFIX+'/controller-audit.stdout.log')['problems']
attempt=read('docs/loop/agent-fabric-g1-f05-storage/develop-turn115/official-attempt.json');bindings(attempt)
assert attempt['job']['status']=='finished' and [r['result']['data']['status'] for r in attempt['runs']]==['fail','pass','fail','fail']
for run in attempt['runs']:
 for pair in run['streams'].values():assert (ROOT/pair['original']['path']).read_bytes()==(ROOT/pair['copy']['path']).read_bytes()
assert [r['tapTotals']['tests'] for r in attempt['runs'][:2]]==[187,61]
assert all(r['ownedBaselineRestored'] for r in [attempt['runs'][i] for i in [0,1,3]])
assert len(attempt['runs'][2]['nativeChildren'])==13 and len(attempt['runs'][3]['children'])==61 and attempt['runs'][3]['requiredForQualification']==63
w=read(PREFIX+'/workload-binding.json');bindings(w);assert abs(w['LPlusVDispatchMs']-sum(r['dispatch']['elapsedMs'] for r in attempt['runs'][:2]))<1e-7
assert w['fullHarnessSeconds']==900 and w['aggregateSeconds']==1800 and not w['fullHarnessQualified'] and not w['aggregateQualified']
receipts=read(PREFIX+'/controller-results.json');assert receipts['jobId']=='job-98fb1bd06b'
for cid,r in receipts['checks'].items():
 assert r['result']=={k:v for k,v in s['checks'][cid].items() if k!='tail'} and r['result']['status']=='pass' and r['result']['duration_ms']<r['definition']['timeout']*1000
 bindings(r['streams'])
 for p in r['streams']:assert (ROOT/p['copy']['path']).read_bytes()==(ROOT/p['original']['path']).read_bytes()
source=receipts['checks']['f05-04.source-content-component']['measurements'];assert next(v for v in source if v['measurement']=='storage-candidate')['digest']==candidate['digest']
test=next(v for v in source if v['measurement']=='storage-test-report')['reports'][0];assert test['tests']==12 and all(test[k]==0 for k in ['fail','cancelled','skipped','todo']) and all(v==0 for v in test['observations']['violations'].values())
assert test['observations']['positives']['read']==4 and test['observations']['positives']['write']==3
censuses=read(PREFIX+'/controller-census-receipts.json');assert len(censuses)==6;bindings(censuses)
parent=[read(v['copy']['path']) for v in censuses if 'command-storage-parent-return' in v['copy']['path']];assert len(parent)==1 and parent[0]['success']
assert parent[0]['before']['containers']==parent[0]['after']['containers'] and parent[0]['before']['roots']==parent[0]['after']['roots']
retained=(ROOT/receipts['checks']['acceptance.retained-baselines']['streams'][0]['copy']['path']).read_text();assert [int(v) for v in re.findall(r'^# tests (\d+)$',retained,re.M)]==[197,48,5,9,10]
assert 'Electron 44.5.1 binary probe passed' in retained and 'Android Bundled' in retained and not re.search(r'^# (fail|cancelled|skipped|todo) [1-9]',retained,re.M)
assert 'timeout: 240_000' not in (ROOT/'g1-storage/scripts/suite-execution.mjs').read_text()
if (ROOT/REPORT).exists() and 'Turn117' in (ROOT/REPORT).read_text():
 doc=(ROOT/REPORT).read_text()
 for text in ['66 tasks / 113 checks / 96 requirements','43 done / 23 unfinished','PLAN116-01','no global turn or wall-clock budget','63','172+60','all:true']:assert text in doc,text
 for link in re.findall(r'\]\(([^)]+)\)',doc):
  if link in ['readiness-turn117/audit-result.json','readiness-turn117/submission-binding.json'] and not (BASE.parent/link).exists():continue
  assert (BASE.parent/link).exists(),link
result={'ok':True,'candidate':candidate,'tasks':66,'checks':113,'requirements':96,'statusCounts':counts,'unfinished':23,'priorChecksPreserved':109,'completedHistoriesPreserved':43,'acyclic':True,'uncovered':[],'exactTestMatrixRows':96,'protectedInputs':2581,'capturedInputsUnchanged':len(read(PREFIX+'/preservation-before.json')['files']),'predecessorChain':[1113,1106,1103,1100],'recoveryPins':14,'successfulResourceProbes':15,'failedResourceAttemptsRetained':1,'freshControllerJob':receipts['jobId'],'controllerPrerequisites':3,'fullCensusReceipts':6,'nativeReporterPinned':True,'freshActualSplitMarkers':boundaries['actualSplitMarkers'],'mandatoryRepairChainChecks':[4,4,4,3],'all20MissingChecksHaveOwners':True,'authorizedThinSources':5,'newTaskEngineeringMinutes':65,'workEstimateMinutes':1865,'pipelineMinutes':690,'teamLimit':4,'delegatedSeats':0,'remainingTurnHourCapacityTest':'not applicable','allFourCurrentOfficialResultsRetained':True,'nativeChildrenRetained':13,'harnessActualChildren':61,'harnessRequiredChildren':63,'LPlusVDispatchMs':w['LPlusVDispatchMs'],'fullHarnessQualified':False,'aggregateQualified':False,'externalQualification':False,'productionCodeChanged':False,'readiness':'Local prerequisites ready for separate independent plan review; implementation and product acceptance pending'}
p=BASE/'audit-result.json'
if p.exists():assert read(PREFIX+'/audit-result.json')==result
else:write('audit-result.json',result)
if (BASE/'submission-binding.json').exists():
 currentSeal=read(PREFIX+'/submission-binding.json');verify(currentSeal['readiness'])
 for b in currentSeal['files']:verify(b)
print(json.dumps(result))
